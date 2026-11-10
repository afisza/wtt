<?php
/**
 * Bot Telegram: głosówka/tekst → (ElevenLabs Scribe) → (Claude) → wpisy czasu pracy po potwierdzeniu.
 *
 * Każdy użytkownik WTT podłącza własnego bota (token z @BotFather) i własne klucze API.
 * Klucze są szyfrowane (secret-box.php). Webhook identyfikuje użytkownika po nagłówku
 * X-Telegram-Bot-Api-Secret-Token (w bazie tylko jego SHA-256), a bot słucha wyłącznie
 * konta Telegram przypiętego jednorazowym kodem z Ustawień.
 */
require_once __DIR__ . '/config.php';
require_once __DIR__ . '/db.php';
require_once __DIR__ . '/secret-box.php';
require_once __DIR__ . '/entries-service.php';
require_once __DIR__ . '/vendor/autoload.php';

const TELEGRAM_EXTRACT_MODEL = 'claude-haiku-5-5';
const TELEGRAM_MAX_VOICE_SECONDS = 300;
const TELEGRAM_PENDING_TTL = 86400;      // potwierdzenie ważne 24 h
const TELEGRAM_FOLLOWUP_TTL = 1800;      // odpowiedź na pytanie bota — 30 min

function ensureTelegramTables(PDO $pdo): void {
    static $done = false;
    if ($done) return;
    $pdo->exec(
        "CREATE TABLE IF NOT EXISTS telegram_integrations (
            user_id INT PRIMARY KEY,
            bot_token_enc TEXT NULL,
            bot_username VARCHAR(64) NULL,
            webhook_secret_hash CHAR(64) NULL,
            elevenlabs_key_enc TEXT NULL,
            anthropic_key_enc TEXT NULL,
            tg_user_id BIGINT NULL,
            tg_chat_id BIGINT NULL,
            tg_name VARCHAR(128) NULL,
            link_code_hash CHAR(64) NULL,
            link_code_expires DATETIME NULL,
            last_update_id BIGINT NULL,
            updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
            UNIQUE KEY uniq_webhook_secret (webhook_secret_hash),
            FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci"
    );
    $pdo->exec(
        "CREATE TABLE IF NOT EXISTS telegram_pending (
            id CHAR(16) PRIMARY KEY,
            user_id INT NOT NULL,
            kind VARCHAR(16) NOT NULL,
            payload JSON NOT NULL,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            INDEX idx_user (user_id, created_at),
            FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci"
    );
    $done = true;
}

function telegramIntegration(PDO $pdo, int $userId): ?array {
    $stmt = $pdo->prepare('SELECT * FROM telegram_integrations WHERE user_id = ?');
    $stmt->execute([$userId]);
    return $stmt->fetch() ?: null;
}

// ── HTTP ─────────────────────────────────────────────────────────────────────

/** Wywołanie Telegram Bot API. Zwraca `result` albo rzuca wyjątek z opisem z Telegrama. */
function telegramApi(string $botToken, string $method, array $params = []) {
    $ch = curl_init("https://api.telegram.org/bot{$botToken}/{$method}");
    curl_setopt_array($ch, [
        CURLOPT_POST => true,
        CURLOPT_POSTFIELDS => json_encode($params, JSON_UNESCAPED_UNICODE),
        CURLOPT_HTTPHEADER => ['Content-Type: application/json'],
        CURLOPT_RETURNTRANSFER => true,
        CURLOPT_TIMEOUT => 20,
    ]);
    $raw = curl_exec($ch);
    $err = curl_error($ch);
    curl_close($ch);
    $data = is_string($raw) ? json_decode($raw, true) : null;
    if (!is_array($data) || empty($data['ok'])) {
        throw new RuntimeException('Telegram ' . $method . ': ' . ($data['description'] ?? $err ?: 'brak odpowiedzi'));
    }
    return $data['result'];
}

function telegramSend(string $botToken, int $chatId, string $text, ?array $keyboard = null): ?array {
    $params = ['chat_id' => $chatId, 'text' => mb_substr($text, 0, 4000), 'disable_web_page_preview' => true];
    if ($keyboard) $params['reply_markup'] = ['inline_keyboard' => $keyboard];
    try {
        return telegramApi($botToken, 'sendMessage', $params);
    } catch (Throwable $e) {
        error_log('[telegram] sendMessage failed: ' . $e->getMessage());
        return null;
    }
}

/** Pobiera plik z serwerów Telegrama (limit Bot API: 20 MB). */
function telegramDownloadFile(string $botToken, string $fileId): string {
    $file = telegramApi($botToken, 'getFile', ['file_id' => $fileId]);
    if (($file['file_size'] ?? 0) > 20 * 1024 * 1024) throw new RuntimeException('Plik jest za duży');
    $ch = curl_init("https://api.telegram.org/file/bot{$botToken}/" . $file['file_path']);
    curl_setopt_array($ch, [CURLOPT_RETURNTRANSFER => true, CURLOPT_TIMEOUT => 30]);
    $data = curl_exec($ch);
    $code = curl_getinfo($ch, CURLINFO_HTTP_CODE);
    curl_close($ch);
    if (!is_string($data) || $code !== 200) throw new RuntimeException('Nie udało się pobrać nagrania');
    return $data;
}

/**
 * Transkrypcja ElevenLabs Scribe v2. Język wykrywany automatycznie
 * (polski, ukraiński, rosyjski, angielski i inne).
 */
function transcribeWithScribe(string $apiKey, string $audio, string $filename): string {
    $tmp = tempnam(sys_get_temp_dir(), 'wtt-voice-');
    file_put_contents($tmp, $audio);
    try {
        $ch = curl_init('https://api.elevenlabs.io/v1/speech-to-text');
        curl_setopt_array($ch, [
            CURLOPT_POST => true,
            CURLOPT_HTTPHEADER => ['xi-api-key: ' . $apiKey],
            CURLOPT_POSTFIELDS => [
                'model_id' => 'scribe_v2',
                'tag_audio_events' => 'false',
                'file' => new CURLFile($tmp, 'audio/ogg', $filename),
            ],
            CURLOPT_RETURNTRANSFER => true,
            CURLOPT_TIMEOUT => 60,
        ]);
        $raw = curl_exec($ch);
        $code = curl_getinfo($ch, CURLINFO_HTTP_CODE);
        curl_close($ch);
    } finally {
        @unlink($tmp);
    }
    $data = is_string($raw) ? json_decode($raw, true) : null;
    if ($code !== 200 || !is_array($data)) {
        $detail = $data['detail']['message'] ?? $data['detail'] ?? ('HTTP ' . $code);
        throw new RuntimeException('ElevenLabs: ' . (is_string($detail) ? $detail : json_encode($detail)));
    }
    return trim((string)($data['text'] ?? ''));
}

// ── Claude: tekst → wpisy ────────────────────────────────────────────────────

function telegramExtractionSchema(): array {
    $nullable = fn(string $type) => ['anyOf' => [['type' => $type], ['type' => 'null']]];
    return [
        'type' => 'object',
        'properties' => [
            'entries' => [
                'type' => 'array',
                'items' => [
                    'type' => 'object',
                    'properties' => [
                        'client_id' => $nullable('integer'),
                        'date' => ['type' => 'string'],
                        'start' => $nullable('string'),
                        'end' => $nullable('string'),
                        'minutes' => $nullable('integer'),
                        'text' => ['type' => 'string'],
                    ],
                    'required' => ['client_id', 'date', 'start', 'end', 'minutes', 'text'],
                    'additionalProperties' => false,
                ],
            ],
            'question' => $nullable('string'),
        ],
        'required' => ['entries', 'question'],
        'additionalProperties' => false,
    ];
}

/**
 * Wyciąga wpisy z wypowiedzi użytkownika.
 * @return array{entries: array, question: ?string}
 */
function extractEntriesWithClaude(string $apiKey, string $message, array $clients, ?string $context = null): array {
    $days = ['niedziela', 'poniedziałek', 'wtorek', 'środa', 'czwartek', 'piątek', 'sobota'];
    $today = date('Y-m-d');
    $clientLines = implode("\n", array_map(
        fn($c) => "- id {$c['id']}: {$c['name']}" . ($c['website'] ? " ({$c['website']})" : ''),
        $clients
    ));

    $system = <<<TXT
Zamieniasz wiadomość użytkownika (często transkrypcję głosówki) na wpisy czasu pracy w aplikacji Work Time Tracker.
Wiadomość może być po polsku, ukraińsku, rosyjsku lub angielsku. Transkrypcja może zawierać błędy rozpoznawania mowy.

Zasady:
- Jeden wpis na każdą osobną pracę z własnym czasem. Kilka czynności w jednym przedziale czasu = jeden wpis z opisem łączącym je.
- client_id: id klienta z listy poniżej, rozpoznany po nazwie lub domenie (także zniekształconej przez transkrypcję lub w innym alfabecie). Gdy nie da się ustalić klienta jednoznacznie, wpisz null.
- date: YYYY-MM-DD. Dziś jest {$today} ({$days[(int)date('w')]}), strefa Europe/Warsaw. Brak daty = dziś. Przeliczaj „wczoraj”, „w poniedziałek” itp.
- start/end: HH:MM tylko gdy użytkownik podał godziny. minutes: gdy podał czas trwania. Pozostałe pola null.
- text: krótki, rzeczowy opis wykonanej pracy ZAWSZE po polsku (przetłumacz, jeśli trzeba), w formie rzeczownikowej, wielką literą, bez nazwy klienta, daty i czasu. Popraw oczywiste błędy transkrypcji; nazw własnych nie zmieniaj.
- question: krótkie pytanie po polsku, gdy brakuje czegoś koniecznego (czasu trwania/godzin, klienta) albo wiadomość nie dotyczy pracy. Wtedy entries może być puste. W przeciwnym razie null.

Klienci:
{$clientLines}
TXT;

    $content = $context ? "Wcześniejsza rozmowa:\n{$context}\n\nNowa wiadomość:\n{$message}" : $message;

    $client = new Anthropic\Client(apiKey: $apiKey);
    $response = $client->messages->create(
        model: TELEGRAM_EXTRACT_MODEL,
        maxTokens: 4000,
        system: $system,
        messages: [['role' => 'user', 'content' => $content]],
        outputConfig: [
            'effort' => 'low',
            'format' => ['type' => 'json_schema', 'schema' => telegramExtractionSchema()],
        ],
    );

    if ($response->stopReason === 'refusal') {
        return ['entries' => [], 'question' => 'Nie mogę przetworzyć tej wiadomości. Spróbuj inaczej ją sformułować.'];
    }
    foreach ($response->content as $block) {
        if ($block->type === 'text') {
            $data = json_decode($block->text, true);
            if (is_array($data) && isset($data['entries'])) return $data;
        }
    }
    throw new RuntimeException('Claude: nieczytelna odpowiedź');
}

// ── Oczekujące potwierdzenia ─────────────────────────────────────────────────

function telegramSavePending(PDO $pdo, int $userId, string $kind, array $payload): string {
    // Jeden aktywny stan na użytkownika: nowa wiadomość zastępuje poprzednią propozycję/pytanie
    $pdo->prepare('DELETE FROM telegram_pending WHERE user_id = ? OR created_at < (NOW() - INTERVAL 2 DAY)')->execute([$userId]);
    $id = bin2hex(random_bytes(8));
    $pdo->prepare('INSERT INTO telegram_pending (id, user_id, kind, payload) VALUES (?, ?, ?, ?)')
        ->execute([$id, $userId, $kind, json_encode($payload, JSON_UNESCAPED_UNICODE)]);
    return $id;
}

function telegramLoadPending(PDO $pdo, int $userId, ?string $id, string $kind, int $ttl): ?array {
    $sql = 'SELECT id, payload FROM telegram_pending WHERE user_id = ? AND kind = ? AND created_at > (NOW() - INTERVAL ? SECOND)';
    $params = [$userId, $kind, $ttl];
    if ($id !== null) {
        $sql .= ' AND id = ?';
        $params[] = $id;
    }
    $stmt = $pdo->prepare($sql . ' ORDER BY created_at DESC LIMIT 1');
    $stmt->execute($params);
    $row = $stmt->fetch();
    if (!$row) return null;
    return ['id' => $row['id']] + (json_decode($row['payload'], true) ?: []);
}

function telegramDeletePending(PDO $pdo, string $id): void {
    $pdo->prepare('DELETE FROM telegram_pending WHERE id = ?')->execute([$id]);
}

// ── Formatowanie ─────────────────────────────────────────────────────────────

function telegramFormatDate(string $date): string {
    if ($date === date('Y-m-d')) return 'dziś';
    if ($date === date('Y-m-d', strtotime('-1 day'))) return 'wczoraj';
    return date('d.m.Y', strtotime($date));
}

function telegramDescribeEntry(array $e, array $clientsById): string {
    $client = $clientsById[$e['client_id']]['name'] ?? '?';
    if ($e['start'] && $e['end']) $time = "{$e['start']}–{$e['end']}";
    elseif ($e['start'] && $e['minutes']) $time = "od {$e['start']}, " . entryFormatDuration((int)$e['minutes']);
    elseif ($e['minutes']) $time = entryFormatDuration((int)$e['minutes']) . ' (po ostatnim wpisie)';
    else $time = '?';
    return "• {$client} · " . telegramFormatDate($e['date']) . " · {$time}\n  {$e['text']}";
}

function telegramHelpText(): string {
    return "Wyślij głosówkę albo wiadomość, np.:\n"
        . "„Dziś od 16 do 19 przy Best Market – omówienie API z Kirilem”\n"
        . "„Wczoraj 2h 15 min, verrify.global, poprawki landing page”\n\n"
        . "Rozumiem polski, ukraiński, rosyjski i angielski. Przed zapisem zawsze pokażę podsumowanie do potwierdzenia.\n\n"
        . "/dzis — wpisy z dzisiaj\n/pomoc — ta wiadomość";
}
