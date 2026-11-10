<?php
/**
 * Osobiste tokeny API (dostęp dla skryptów i Claude Code).
 *
 * Bezpieczeństwo:
 *  - token = "wtt_" + 32 losowe bajty (base64url) — pokazywany TYLKO raz przy tworzeniu;
 *  - w bazie trzymamy wyłącznie SHA-256 tokenu (wysoka entropia → szybki hash wystarcza)
 *    oraz krótki prefiks do rozpoznania tokenu na liście;
 *  - token można odwołać i ma datę wygaśnięcia; zapisujemy ostatnie użycie (czas + IP);
 *  - nieudane próby są limitowane per IP, udane — per token;
 *  - token daje dostęp tylko do `/api/v1/*` (dodawanie i odczyt wpisów, lista klientów).
 *    Nie loguje do aplikacji, nie edytuje ani nie usuwa danych.
 */
require_once __DIR__ . '/config.php';
require_once __DIR__ . '/db.php';
require_once __DIR__ . '/storage.php';

const API_TOKEN_PREFIX = 'wtt_';
const API_TOKEN_MAX_ACTIVE = 10;

function ensureApiTokensTable(PDO $pdo): void {
    static $done = false;
    if ($done) return;
    $pdo->exec(
        "CREATE TABLE IF NOT EXISTS api_tokens (
            id INT AUTO_INCREMENT PRIMARY KEY,
            user_id INT NOT NULL,
            name VARCHAR(100) NOT NULL,
            token_prefix VARCHAR(16) NOT NULL,
            token_hash CHAR(64) NOT NULL,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            expires_at DATETIME NULL,
            last_used_at DATETIME NULL,
            last_used_ip VARCHAR(45) NULL,
            revoked_at DATETIME NULL,
            UNIQUE KEY uniq_token_hash (token_hash),
            INDEX idx_user (user_id),
            FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci"
    );
    $done = true;
}

/** Generuje nowy token (jawny tekst — do jednorazowego pokazania użytkownikowi). */
function generateApiToken(): string {
    return API_TOKEN_PREFIX . rtrim(strtr(base64_encode(random_bytes(32)), '+/', '-_'), '=');
}

function hashApiToken(string $token): string {
    return hash('sha256', $token);
}

function isApiTokenFormat(string $token): bool {
    return (bool)preg_match('/^wtt_[A-Za-z0-9_-]{43}$/', $token);
}

/** Token z nagłówka `Authorization: Bearer …` (lub `X-Api-Key`, gdy serwer gubi Authorization). */
function readApiTokenFromRequest(): ?string {
    $header = $_SERVER['HTTP_AUTHORIZATION'] ?? $_SERVER['REDIRECT_HTTP_AUTHORIZATION'] ?? '';
    if ($header === '' && function_exists('getallheaders')) {
        foreach (getallheaders() as $name => $value) {
            if (strcasecmp($name, 'Authorization') === 0) {
                $header = (string)$value;
                break;
            }
        }
    }
    if (preg_match('/^Bearer\s+(\S+)\s*$/i', $header, $m)) return $m[1];
    $apiKey = trim((string)($_SERVER['HTTP_X_API_KEY'] ?? ''));
    return $apiKey !== '' ? $apiKey : null;
}

/**
 * Uwierzytelnia żądanie tokenem API. Zwraca id użytkownika albo kończy żądanie 401/429/503.
 * Ciasteczka sesji są tu celowo ignorowane — `/api/v1/*` działa wyłącznie na tokenach.
 */
function requireApiToken(): int {
    header('Cache-Control: no-store');
    $ip = $_SERVER['REMOTE_ADDR'] ?? 'unknown';
    $failKey = "api-token-fail:{$ip}";

    if (isRateLimited($failKey, 10, 900)) {
        jsonResponse(['error' => 'Zbyt wiele nieudanych prób. Spróbuj ponownie za 15 minut.'], 429);
    }

    $token = readApiTokenFromRequest();
    if ($token === null || !isApiTokenFormat($token)) {
        if ($token !== null) checkRateLimit($failKey, 10, 900);
        header('WWW-Authenticate: Bearer');
        jsonResponse(['error' => 'Brak lub nieprawidłowy token API'], 401);
    }

    if (!isMySQLAvailable()) {
        jsonResponse(['error' => 'API wymaga bazy MySQL'], 503);
    }
    $pdo = getDb();
    if (!$pdo) jsonResponse(['error' => 'Brak połączenia z bazą danych'], 503);
    ensureApiTokensTable($pdo);

    $hash = hashApiToken($token);
    $stmt = $pdo->prepare(
        'SELECT id, user_id, token_hash, expires_at, revoked_at FROM api_tokens WHERE token_hash = ? LIMIT 1'
    );
    $stmt->execute([$hash]);
    $row = $stmt->fetch();

    $valid = $row
        && hash_equals($row['token_hash'], $hash)
        && $row['revoked_at'] === null
        && ($row['expires_at'] === null || strtotime($row['expires_at']) > time());

    if (!$valid) {
        checkRateLimit($failKey, 10, 900);
        header('WWW-Authenticate: Bearer error="invalid_token"');
        jsonResponse(['error' => 'Token API jest nieprawidłowy, wygasł lub został odwołany'], 401);
    }

    // Limit użycia na token: 120 żądań na godzinę
    if (!checkRateLimit("api-token:{$row['id']}", 120, 3600)) {
        jsonResponse(['error' => 'Przekroczono limit żądań dla tego tokenu (120/h)'], 429);
    }

    $pdo->prepare('UPDATE api_tokens SET last_used_at = NOW(), last_used_ip = ? WHERE id = ?')
        ->execute([substr($ip, 0, 45), $row['id']]);

    return (int)$row['user_id'];
}
