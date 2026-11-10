<?php
/**
 * Zarządzanie tokenami API z poziomu aplikacji (sesja w ciasteczku, NIE token API).
 *
 *   GET    /api/settings/api-tokens          → lista tokenów (bez sekretów) + czy wymagany kod 2FA
 *   POST   /api/settings/api-tokens          → { name, expiresInDays (0 = bez terminu), password, [totpCode] }
 *                                              tworzy token i zwraca go JEDEN raz
 *   DELETE /api/settings/api-tokens?id=…     → odwołuje token
 *
 * Utworzenie tokenu wymaga ponownego podania hasła (i kodu 2FA, jeśli włączone).
 */
require_once __DIR__ . '/../auth.php';
require_once __DIR__ . '/../api-tokens.php';
require_once __DIR__ . '/../totp.php';

$userId = getUserId();
if (!$userId) jsonResponse(['error' => 'Unauthorized'], 401);
header('Cache-Control: no-store');

if (!isMySQLAvailable()) jsonResponse(['error' => 'Tokeny API wymagają bazy MySQL'], 503);
$pdo = getDb();
if (!$pdo) jsonResponse(['error' => 'Brak połączenia z bazą danych'], 503);
ensureApiTokensTable($pdo);

/** Sekret TOTP użytkownika, jeśli 2FA jest włączone (kolumna może nie istnieć w starych bazach). */
function apiTokensUserTotp(PDO $pdo, int $userId): ?string {
    try {
        $stmt = $pdo->prepare('SELECT totp_secret FROM users WHERE id = ?');
        $stmt->execute([$userId]);
        $secret = $stmt->fetchColumn();
    } catch (PDOException $e) {
        return null;
    }
    return (!empty($secret) && !str_starts_with($secret, 'pending:')) ? $secret : null;
}

if ($method === 'GET') {
    $stmt = $pdo->prepare(
        'SELECT id, name, token_prefix, created_at, expires_at, last_used_at, last_used_ip, revoked_at
         FROM api_tokens WHERE user_id = ? ORDER BY revoked_at IS NOT NULL, created_at DESC'
    );
    $stmt->execute([$userId]);
    $now = time();
    $tokens = array_map(fn($t) => [
        'id' => (int)$t['id'],
        'name' => $t['name'],
        'prefix' => $t['token_prefix'],
        'createdAt' => $t['created_at'],
        'expiresAt' => $t['expires_at'],
        'lastUsedAt' => $t['last_used_at'],
        'lastUsedIp' => $t['last_used_ip'],
        'revoked' => $t['revoked_at'] !== null,
        'expired' => $t['expires_at'] !== null && strtotime($t['expires_at']) <= $now,
    ], $stmt->fetchAll());
    jsonResponse(['tokens' => $tokens, 'requires2FA' => apiTokensUserTotp($pdo, $userId) !== null]);
}

if ($method === 'POST') {
    $body = getJsonInput();
    $ip = $_SERVER['REMOTE_ADDR'] ?? 'unknown';
    if (!checkRateLimit("api-token-create:{$userId}:{$ip}", 5, 900)) {
        jsonResponse(['error' => 'Zbyt wiele prób. Spróbuj ponownie za 15 minut.'], 429);
    }

    $name = trim(preg_replace('/[\x00-\x1F\x7F]/u', '', (string)($body['name'] ?? '')));
    if ($name === '' || mb_strlen($name) > 100) {
        jsonResponse(['error' => 'Podaj nazwę tokenu (do 100 znaków)'], 400);
    }
    $days = (int)($body['expiresInDays'] ?? 90);
    if (!in_array($days, [0, 30, 90, 365], true)) {
        jsonResponse(['error' => 'Nieprawidłowy termin ważności'], 400);
    }

    // Ponowne potwierdzenie tożsamości
    $stmt = $pdo->prepare('SELECT password FROM users WHERE id = ?');
    $stmt->execute([$userId]);
    $hash = $stmt->fetchColumn();
    if (!$hash || !password_verify((string)($body['password'] ?? ''), $hash)) {
        jsonResponse(['error' => 'Nieprawidłowe hasło'], 403);
    }
    $totp = apiTokensUserTotp($pdo, $userId);
    if ($totp !== null && !totpVerifyCode($totp, (string)($body['totpCode'] ?? ''))) {
        jsonResponse(['error' => 'Nieprawidłowy kod 2FA'], 403);
    }

    $stmt = $pdo->prepare(
        'SELECT COUNT(*) FROM api_tokens WHERE user_id = ? AND revoked_at IS NULL AND (expires_at IS NULL OR expires_at > NOW())'
    );
    $stmt->execute([$userId]);
    if ((int)$stmt->fetchColumn() >= API_TOKEN_MAX_ACTIVE) {
        jsonResponse(['error' => 'Masz już ' . API_TOKEN_MAX_ACTIVE . ' aktywnych tokenów — odwołaj nieużywany'], 409);
    }

    $token = generateApiToken();
    $prefix = substr($token, 0, 12);
    $expiresAt = $days > 0 ? date('Y-m-d H:i:s', strtotime("+{$days} days")) : null;
    $pdo->prepare('INSERT INTO api_tokens (user_id, name, token_prefix, token_hash, expires_at) VALUES (?, ?, ?, ?, ?)')
        ->execute([$userId, $name, $prefix, hashApiToken($token), $expiresAt]);

    jsonResponse([
        'id' => (int)$pdo->lastInsertId(),
        'name' => $name,
        'prefix' => $prefix,
        'expiresAt' => $expiresAt,
        'token' => $token,
    ], 201);
}

if ($method === 'DELETE') {
    $id = (int)($_GET['id'] ?? 0);
    $stmt = $pdo->prepare('UPDATE api_tokens SET revoked_at = NOW() WHERE id = ? AND user_id = ? AND revoked_at IS NULL');
    $stmt->execute([$id, $userId]);
    if ($stmt->rowCount() === 0) jsonResponse(['error' => 'Nie znaleziono aktywnego tokenu'], 404);
    jsonResponse(['success' => true]);
}

jsonResponse(['error' => 'Method not allowed'], 405);
