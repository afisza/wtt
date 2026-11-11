<?php
/**
 * POST /api/telegram/webhook — aktualizacje od Telegrama (bez sesji i bez tokenu API).
 * Uwierzytelnienie: nagłówek X-Telegram-Bot-Api-Secret-Token ustawiony przy setWebhook.
 */
require_once __DIR__ . '/../telegram.php';
require_once __DIR__ . '/../storage.php';

header('Cache-Control: no-store');
if ($method !== 'POST') jsonResponse(['error' => 'Method not allowed'], 405);

$secret = (string)($_SERVER['HTTP_X_TELEGRAM_BOT_API_SECRET_TOKEN'] ?? '');
$ip = $_SERVER['REMOTE_ADDR'] ?? 'unknown';
if (isRateLimited("tg-webhook-fail:{$ip}", 20, 900)) jsonResponse(['error' => 'Too many requests'], 429);
if (!preg_match('/^[A-Za-z0-9_-]{32,256}$/', $secret) || !isMySQLAvailable() || !($pdo = getDb())) {
    checkRateLimit("tg-webhook-fail:{$ip}", 20, 900);
    jsonResponse(['error' => 'Forbidden'], 403);
}
ensureTelegramTables($pdo);
$stmt = $pdo->prepare('SELECT * FROM telegram_integrations WHERE webhook_secret_hash = ?');
$stmt->execute([hash('sha256', $secret)]);
$integration = $stmt->fetch();
if (!$integration || !hash_equals($integration['webhook_secret_hash'], hash('sha256', $secret))) {
    checkRateLimit("tg-webhook-fail:{$ip}", 20, 900);
    jsonResponse(['error' => 'Forbidden'], 403);
}

$update = json_decode(file_get_contents('php://input'), true);
if (!is_array($update) || !isset($update['update_id'])) jsonResponse(['ok' => true]);

// Telegram ponawia aktualizacje, na które nie dostał 200 — pomijamy już obsłużone
$updateId = (int)$update['update_id'];
$claim = $pdo->prepare(
    'UPDATE telegram_integrations SET last_update_id = ? WHERE user_id = ? AND (last_update_id IS NULL OR last_update_id < ?)'
);
$claim->execute([$updateId, $integration['user_id'], $updateId]);
if ($claim->rowCount() === 0) jsonResponse(['ok' => true]);

// Odpowiadamy Telegramowi od razu, a transkrypcję i Claude wykonujemy po zamknięciu połączenia
ignore_user_abort(true);
@set_time_limit(180);
http_response_code(200);
echo '{"ok":true}';
if (function_exists('fastcgi_finish_request')) {
    fastcgi_finish_request();
} else {
    @ob_end_flush();
    flush();
}

try {
    telegramHandleUpdate($pdo, $integration, $update);
} catch (Throwable $e) {
    error_log('[telegram] ' . $e->getMessage());
}
exit;

// ─────────────────────────────────────────────────────────────────────────────

function telegramHandleUpdate(PDO $pdo, array $integration, array $update): void {
    $botToken = secretBoxDecrypt($integration['bot_token_enc']);
    if (!$botToken) return;
    $userId = (int)$integration['user_id'];

    if (isset($update['callback_query'])) {
        telegramHandleCallback($pdo, $integration, $botToken, $update['callback_query']);
        return;
    }

    $msg = $update['message'] ?? null;
    if (!is_array($msg) || ($msg['chat']['type'] ?? '') !== 'private') return;
    $fromId = (int)($msg['from']['id'] ?? 0);
    $chatId = (int)$msg['chat']['id'];
    $text = trim((string)($msg['text'] ?? ''));

    // Przypięcie konta: /start <kod> z Ustawień → Telegram
    if ($integration['tg_user_id'] === null) {
        if (preg_match('/^\/start\s+([A-Za-z0-9_-]{16,64})$/', $text, $m)
            && $integration['link_code_hash'] !== null
            && hash_equals($integration['link_code_hash'], hash('sha256', $m[1]))
            && strtotime((string)$integration['link_code_expires']) > time()) {
            $name = trim(($msg['from']['first_name'] ?? '') . ' ' . ($msg['from']['last_name'] ?? ''));
            if (!empty($msg['from']['username'])) $name .= ' (@' . $msg['from']['username'] . ')';
            $pdo->prepare(
                'UPDATE telegram_integrations SET tg_user_id = ?, tg_chat_id = ?, tg_name = ?, link_code_hash = NULL, link_code_expires = NULL WHERE user_id = ?'
            )->execute([$fromId, $chatId, mb_substr($name, 0, 128), $userId]);
            telegramSend($botToken, $chatId, "✅ Połączono z Work Time Tracker.\n\n" . telegramHelpText());
        } else {
            telegramSend($botToken, $chatId, 'Ten bot jest prywatny. Połącz konto w Ustawieniach → Telegram aplikacji Work Time Tracker.');
        }
        return;
    }

    // Wszystko spoza przypiętego konta ignorujemy po cichu
    if ($fromId !== (int)$integration['tg_user_id']) return;

    if ($text === '/start' || $text === '/pomoc' || $text === '/help') {
        telegramSend($botToken, $chatId, telegramHelpText());
        return;
    }
    if ($text === '/dzis' || $text === '/today') {
        telegramSendToday($pdo, $userId, $botToken, $chatId);
        return;
    }

    $voice = $msg['voice'] ?? $msg['audio'] ?? null;
    if ($voice) {
        if (($voice['duration'] ?? 0) > TELEGRAM_MAX_VOICE_SECONDS) {
            telegramSend($botToken, $chatId, 'Nagranie jest za długie (maks. 5 min).');
            return;
        }
        $elevenKey = secretBoxDecrypt($integration['elevenlabs_key_enc']);
        if (!$elevenKey) {
            telegramSend($botToken, $chatId, 'Brak klucza ElevenLabs — uzupełnij go w Ustawieniach → Telegram.');
            return;
        }
        try {
            telegramApi($botToken, 'sendChatAction', ['chat_id' => $chatId, 'action' => 'typing']);
        } catch (Throwable $e) { /* nieistotne */ }
        try {
            $audio = telegramDownloadFile($botToken, $voice['file_id']);
            $text = transcribeWithScribe($elevenKey, $audio, 'voice.ogg');
        } catch (Throwable $e) {
            error_log('[telegram] transcription: ' . $e->getMessage());
            telegramSend($botToken, $chatId, '⚠️ Nie udało się rozpoznać nagrania. Spróbuj ponownie albo napisz wiadomość.');
            return;
        }
        if ($text === '') {
            telegramSend($botToken, $chatId, 'Nic nie usłyszałem w nagraniu.');
            return;
        }
        telegramSend($botToken, $chatId, "🎙️ {$text}");
    }

    if ($text === '' || str_starts_with($text, '/')) {
        telegramSend($botToken, $chatId, telegramHelpText());
        return;
    }
    // „Usuń zadanie WTT-323525” — rozpoznajemy bez Claude
    $deleteIds = parseDeleteTaskCommand($text);
    if ($deleteIds !== null) {
        telegramProposeDelete($pdo, $userId, $botToken, $chatId, $deleteIds);
        return;
    }
    telegramProposeEntries($pdo, $integration, $botToken, $chatId, $text);
}

/** Pokazuje zadania do usunięcia i prosi o potwierdzenie. */
function telegramProposeDelete(PDO $pdo, int $userId, string $botToken, int $chatId, array $ids): void {
    backfillTaskUids($pdo);
    $tasks = [];
    $notFound = [];
    foreach ($ids as $uid) {
        $found = entryFindByUid($pdo, $userId, (string)$uid);
        if (!$found) $notFound[] = telegramTaskRef((string)$uid);
        foreach ($found as $t) $tasks[] = $t;
    }
    $missing = $notFound ? '⚠️ Nie znalazłem: ' . implode(', ', $notFound) : '';
    if (!$tasks) {
        telegramSend($botToken, $chatId, $missing . "\n\nNumer zadania widać w aplikacji przy każdym wpisie (np. WTT-323525) i w /dzis.");
        return;
    }
    $id = telegramSavePending($pdo, $userId, 'delete', ['tasks' => $tasks]);
    $lines = array_map('telegramDescribeTask', $tasks);
    telegramSend(
        $botToken,
        $chatId,
        (count($tasks) > 1 ? 'Usunąć te zadania?' : 'Usunąć zadanie?') . "\n\n" . implode("\n\n", $lines)
            . ($missing ? "\n\n{$missing}" : ''),
        [[['text' => '🗑 Usuń', 'callback_data' => "del:{$id}"], ['text' => '❌ Anuluj', 'callback_data' => "no:{$id}"]]]
    );
}

function telegramProposeEntries(PDO $pdo, array $integration, string $botToken, int $chatId, string $text): void {
    $userId = (int)$integration['user_id'];
    $anthropicKey = secretBoxDecrypt($integration['anthropic_key_enc']);
    if (!$anthropicKey) {
        telegramSend($botToken, $chatId, 'Brak klucza Anthropic — uzupełnij go w Ustawieniach → Telegram.');
        return;
    }
    $clients = entryUserClients($pdo, $userId);
    if (!$clients) {
        telegramSend($botToken, $chatId, 'Nie masz jeszcze klientów — dodaj ich w aplikacji.');
        return;
    }
    $clientsById = array_column($clients, null, 'id');
    $assigners = entryUserAssigners($pdo, $userId);
    // Domyślna osoba zlecająca (Ustawienia → Telegram), gdy w wiadomości nikt nie został wskazany
    $defaultAssigner = matchAssigners($assigners, $integration['default_assigner'] ?? null)['names'];

    // Odpowiedź na wcześniejsze pytanie bota albo poprawka propozycji → przekazujemy kontekst
    $context = null;
    $prev = telegramLoadPending($pdo, $userId, null, 'question', TELEGRAM_FOLLOWUP_TTL)
        ?? telegramLoadPending($pdo, $userId, null, 'confirm', TELEGRAM_FOLLOWUP_TTL);
    if ($prev) $context = $prev['context'] ?? null;

    try {
        $result = extractEntriesWithClaude($anthropicKey, $text, $clients, $assigners, $context);
    } catch (Throwable $e) {
        error_log('[telegram] claude: ' . get_class($e) . ': ' . $e->getMessage());
        telegramSend($botToken, $chatId, '⚠️ Nie udało się przetworzyć wiadomości (Claude): ' . telegramClaudeErrorText($e));
        return;
    }

    // Claude rozpoznał prośbę o usunięcie zadań po numerze
    $deleteIds = array_values(array_unique(array_filter(
        array_map(fn($v) => preg_replace('/\D/', '', (string)$v), $result['delete_task_ids'] ?? []),
        fn($v) => strlen($v) >= 6 && strlen($v) <= 12
    )));
    if ($deleteIds && empty($result['entries'])) {
        telegramProposeDelete($pdo, $userId, $botToken, $chatId, $deleteIds);
        return;
    }

    $entries = [];
    $missingClient = false;
    foreach ($result['entries'] ?? [] as $e) {
        if ($e['client_id'] === null || !isset($clientsById[$e['client_id']])) {
            $missingClient = true;
            continue;
        }
        if (!$e['minutes'] && !($e['start'] && $e['end'])) continue;
        // Tylko osoby z listy; nikt nie wskazany → domyślna osoba
        $e['assigned_by'] = matchAssigners($assigners, $e['assigned_by'] ?? [])['names'] ?: $defaultAssigner;
        $entries[] = $e;
    }
    $newContext = trim(($context ? $context . "\n" : '') . "Użytkownik: {$text}");

    if (!empty($result['question']) || $missingClient || !$entries) {
        $question = $result['question'] ?? null;
        if (!$question && $missingClient) {
            $question = 'Dla którego klienta? ' . implode(', ', array_column($clients, 'name'));
        }
        $question = $question ?: 'Nie znalazłem w wiadomości czasu pracy. Podaj klienta, czas i czym się zajmowałeś.';
        telegramSavePending($pdo, $userId, 'question', ['context' => $newContext . "\nBot: {$question}"]);
        telegramSend($botToken, $chatId, "❓ {$question}");
        return;
    }

    $id = telegramSavePending($pdo, $userId, 'confirm', ['entries' => $entries, 'context' => $newContext]);
    $lines = array_map(fn($e) => telegramDescribeEntry($e, $clientsById), $entries);
    telegramSend(
        $botToken,
        $chatId,
        (count($entries) > 1 ? 'Zapisać te wpisy?' : 'Zapisać wpis?') . "\n\n" . implode("\n\n", $lines)
            . "\n\nAby coś zmienić, po prostu wyślij poprawkę.",
        [[['text' => '✅ Zapisz', 'callback_data' => "ok:{$id}"], ['text' => '❌ Anuluj', 'callback_data' => "no:{$id}"]]]
    );
}

function telegramHandleCallback(PDO $pdo, array $integration, string $botToken, array $cb): void {
    $answer = fn(string $text = '') => telegramApi($botToken, 'answerCallbackQuery', array_filter(['callback_query_id' => $cb['id'], 'text' => $text]));
    if ((int)($cb['from']['id'] ?? 0) !== (int)$integration['tg_user_id']) {
        $answer();
        return;
    }
    $chatId = (int)($cb['message']['chat']['id'] ?? 0);
    $messageId = (int)($cb['message']['message_id'] ?? 0);
    $edit = fn(string $text) => telegramApi($botToken, 'editMessageText', [
        'chat_id' => $chatId, 'message_id' => $messageId, 'text' => mb_substr($text, 0, 4000),
    ]);

    if (!preg_match('/^(ok|no|del):([a-f0-9]{16})$/', (string)($cb['data'] ?? ''), $m)) {
        $answer();
        return;
    }
    $userId = (int)$integration['user_id'];
    $pending = $m[1] === 'del' ? null : telegramLoadPending($pdo, $userId, $m[2], 'confirm', TELEGRAM_PENDING_TTL);
    if ($m[1] !== 'ok' && !$pending) {
        $pending = telegramLoadPending($pdo, $userId, $m[2], 'delete', TELEGRAM_PENDING_TTL);
    }
    if (!$pending) {
        $answer('Ta propozycja jest nieaktualna');
        return;
    }
    telegramDeletePending($pdo, $pending['id']);

    if ($m[1] === 'no') {
        $answer('Anulowano');
        $edit("❌ Anulowano.\n\n" . ($cb['message']['text'] ?? ''));
        return;
    }

    if ($m[1] === 'del') {
        $answer('Usuwam…');
        $lines = [];
        foreach ($pending['tasks'] ?? [] as $t) {
            $lines[] = deleteEntryRow($pdo, $userId, $t)
                ? '🗑 Usunięto ' . telegramDescribeTask($t)
                : '⚠️ Nie usunięto ' . telegramTaskRef($t['id']) . ' — zadania już nie ma';
        }
        $edit(implode("\n\n", $lines) . "\n\nOtwarta aplikacja zaktualizuje się sama w ciągu kilkunastu sekund.");
        return;
    }

    $answer('Zapisuję…');
    $lines = [];
    foreach ($pending['entries'] as $e) {
        $res = createEntry($pdo, $userId, [
            'clientId' => (string)$e['client_id'],
            'date' => $e['date'],
            'start' => $e['start'],
            'end' => $e['end'],
            'minutes' => $e['minutes'],
            'text' => $e['text'],
            'assignedBy' => $e['assigned_by'] ?? [],
        ]);
        $b = $res['body'];
        if ($res['status'] === 201) {
            $en = $b['entry'];
            $lines[] = '✅ ' . telegramTaskRef($en['id']) . " · {$en['client']} · " . telegramFormatDate($en['date']) . " · {$en['start']}–{$en['end']} ({$en['duration']})\n  {$en['text']}" . ($en['assignedBy'] ? "\n  Zlecił(a): " . implode(', ', $en['assignedBy']) : '') . "\n  Suma dnia u klienta: {$b['clientDayTotal']}";
        } elseif (!empty($b['duplicate'])) {
            $lines[] = "ℹ️ Już zapisane wcześniej: {$e['text']}";
        } else {
            $lines[] = "⚠️ Nie zapisano „{$e['text']}”: " . ($b['error'] ?? 'błąd');
        }
    }
    $edit(implode("\n\n", $lines));
}

function telegramSendToday(PDO $pdo, int $userId, string $botToken, int $chatId): void {
    $tasks = entryDayTasks($pdo, $userId, date('Y-m-d'));
    if (!$tasks) {
        telegramSend($botToken, $chatId, 'Dziś nie ma jeszcze żadnych wpisów.');
        return;
    }
    $lines = array_map(fn($t) => "• {$t['start']}–{$t['end']} {$t['client']}: {$t['text']} (" . telegramTaskRef($t['id']) . ')', $tasks);
    telegramSend($botToken, $chatId, "Dziś:\n" . implode("\n", $lines) . "\n\nRazem: " . entryFormatDuration(entryTotalMinutes($tasks)));
}
