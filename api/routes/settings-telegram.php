<?php
/**
 * Konfiguracja bota Telegram (sesja w ciasteczku).
 *
 *   GET    /api/settings/telegram                → stan (bez sekretów)
 *   POST   /api/settings/telegram {botToken?, elevenlabsKey?, anthropicKey?}
 *                                                → zapis kluczy; nowy token bota = weryfikacja getMe + setWebhook
 *   POST   /api/settings/telegram {action:"link"} → jednorazowy link t.me/<bot>?start=<kod> (ważny 15 min)
 *   DELETE /api/settings/telegram                → odłącza bota (deleteWebhook) i usuwa klucze
 */
require_once __DIR__ . '/../auth.php';
require_once __DIR__ . '/../storage.php';
require_once __DIR__ . '/../telegram.php';

$userId = getUserId();
if (!$userId) jsonResponse(['error' => 'Unauthorized'], 401);
header('Cache-Control: no-store');
if (!isMySQLAvailable() || !($pdo = getDb())) jsonResponse(['error' => 'Bot wymaga bazy MySQL'], 503);
ensureTelegramTables($pdo);

function telegramStatus(PDO $pdo, int $userId): array {
    $row = telegramIntegration($pdo, $userId);
    return [
        'botConfigured' => !empty($row['bot_token_enc']),
        'botUsername' => $row['bot_username'] ?? null,
        'hasElevenLabsKey' => !empty($row['elevenlabs_key_enc']),
        'hasAnthropicKey' => !empty($row['anthropic_key_enc']),
        'linked' => !empty($row['tg_user_id']),
        'linkedName' => $row['tg_name'] ?? null,
    ];
}

if ($method === 'GET') jsonResponse(telegramStatus($pdo, $userId));

if ($method === 'POST') {
    $body = getJsonInput();
    if (!checkRateLimit("tg-settings:{$userId}", 20, 900)) {
        jsonResponse(['error' => 'Zbyt wiele prób. Spróbuj ponownie za kilka minut.'], 429);
    }
    $row = telegramIntegration($pdo, $userId);

    if (($body['action'] ?? '') === 'link') {
        if (empty($row['bot_token_enc']) || empty($row['bot_username'])) {
            jsonResponse(['error' => 'Najpierw zapisz token bota'], 400);
        }
        $code = rtrim(strtr(base64_encode(random_bytes(24)), '+/', '-_'), '=');
        $pdo->prepare(
            'UPDATE telegram_integrations SET link_code_hash = ?, link_code_expires = (NOW() + INTERVAL 15 MINUTE), tg_user_id = NULL, tg_chat_id = NULL, tg_name = NULL WHERE user_id = ?'
        )->execute([hash('sha256', $code), $userId]);
        jsonResponse(['url' => "https://t.me/{$row['bot_username']}?start={$code}"] + telegramStatus($pdo, $userId));
    }

    $botToken = trim((string)($body['botToken'] ?? ''));
    $elevenKey = trim((string)($body['elevenlabsKey'] ?? ''));
    $anthropicKey = trim((string)($body['anthropicKey'] ?? ''));
    if ($botToken === '' && $elevenKey === '' && $anthropicKey === '') {
        jsonResponse(['error' => 'Nic do zapisania'], 400);
    }
    if ($elevenKey !== '' && !preg_match('/^[A-Za-z0-9_-]{20,200}$/', $elevenKey)) {
        jsonResponse(['error' => 'Klucz ElevenLabs ma nieprawidłowy format'], 400);
    }
    if ($anthropicKey !== '' && !preg_match('/^sk-ant-[A-Za-z0-9_-]{20,300}$/', $anthropicKey)) {
        jsonResponse(['error' => 'Klucz Anthropic powinien zaczynać się od „sk-ant-”'], 400);
    }

    if (!$row) {
        $pdo->prepare('INSERT INTO telegram_integrations (user_id) VALUES (?)')->execute([$userId]);
    }

    if ($botToken !== '') {
        if (!preg_match('/^\d{5,15}:[A-Za-z0-9_-]{30,64}$/', $botToken)) {
            jsonResponse(['error' => 'Token bota ma nieprawidłowy format (np. 123456789:AA…)'], 400);
        }
        try {
            $me = telegramApi($botToken, 'getMe');
        } catch (Throwable $e) {
            jsonResponse(['error' => 'Telegram odrzucił token bota'], 400);
        }
        $secret = bin2hex(random_bytes(32));
        global $basePath;
        $webhookUrl = 'https://' . $_SERVER['HTTP_HOST'] . $basePath . '/telegram/webhook';
        try {
            telegramApi($botToken, 'setWebhook', [
                'url' => $webhookUrl,
                'secret_token' => $secret,
                'allowed_updates' => ['message', 'callback_query'],
                'drop_pending_updates' => true,
                'max_connections' => 5,
            ]);
            telegramApi($botToken, 'setMyCommands', ['commands' => [
                ['command' => 'dzis', 'description' => 'Wpisy z dzisiaj'],
                ['command' => 'pomoc', 'description' => 'Jak dodawać wpisy'],
            ]]);
        } catch (Throwable $e) {
            error_log('[telegram] setWebhook: ' . $e->getMessage());
            jsonResponse(['error' => 'Nie udało się ustawić webhooka: ' . $e->getMessage()], 502);
        }
        // Nowy bot = nowe przypięcie konta
        $pdo->prepare(
            'UPDATE telegram_integrations SET bot_token_enc = ?, bot_username = ?, webhook_secret_hash = ?, tg_user_id = NULL, tg_chat_id = NULL, tg_name = NULL, last_update_id = NULL WHERE user_id = ?'
        )->execute([secretBoxEncrypt($botToken), $me['username'] ?? null, hash('sha256', $secret), $userId]);
    }
    if ($elevenKey !== '') {
        $pdo->prepare('UPDATE telegram_integrations SET elevenlabs_key_enc = ? WHERE user_id = ?')
            ->execute([secretBoxEncrypt($elevenKey), $userId]);
    }
    if ($anthropicKey !== '') {
        $pdo->prepare('UPDATE telegram_integrations SET anthropic_key_enc = ? WHERE user_id = ?')
            ->execute([secretBoxEncrypt($anthropicKey), $userId]);
    }
    jsonResponse(telegramStatus($pdo, $userId));
}

if ($method === 'DELETE') {
    $row = telegramIntegration($pdo, $userId);
    $token = $row ? secretBoxDecrypt($row['bot_token_enc']) : null;
    if ($token) {
        try {
            telegramApi($token, 'deleteWebhook', ['drop_pending_updates' => true]);
        } catch (Throwable $e) { /* bot mógł zostać usunięty w Telegramie */ }
    }
    $pdo->prepare('DELETE FROM telegram_pending WHERE user_id = ?')->execute([$userId]);
    $pdo->prepare('DELETE FROM telegram_integrations WHERE user_id = ?')->execute([$userId]);
    jsonResponse(telegramStatus($pdo, $userId));
}

jsonResponse(['error' => 'Method not allowed'], 405);
