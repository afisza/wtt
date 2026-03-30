<?php
require_once __DIR__ . '/../config.php';
require_once __DIR__ . '/../auth.php';
require_once __DIR__ . '/../db.php';
require_once __DIR__ . '/../storage.php';
require_once __DIR__ . '/../totp.php';

$method = $_SERVER['REQUEST_METHOD'];

if ($method !== 'POST') {
    jsonResponse(['error' => 'Method not allowed'], 405);
}

try {
    $body = getJsonInput();
    $email = $body['email'] ?? '';
    $password = $body['password'] ?? '';

    if (!$email || !$password) {
        jsonResponse(['error' => 'Email i hasło są wymagane'], 400);
    }

    // Rate limiting: max 5 attempts per email per 15 minutes
    $ip = $_SERVER['REMOTE_ADDR'] ?? 'unknown';
    if (!checkRateLimit("login:{$ip}:{$email}", 5, 900)) {
        jsonResponse(['error' => 'Zbyt wiele prób logowania. Spróbuj ponownie za 15 minut.'], 429);
    }

    // Sprawdź tryb przechowywania danych
    if (!isMySQLAvailable()) {
        jsonResponse([
            'error' => 'Logowanie wymaga skonfigurowanej bazy danych MySQL. Skonfiguruj ją w ustawieniach aplikacji.'
        ], 503);
    }

    try {
        $pdo = getDb();
        if (!$pdo) {
            jsonResponse(['error' => 'Błąd połączenia z bazą danych. Sprawdź konfigurację MySQL.'], 503);
        }

        // Check if totp_secret column exists
        $hasTotpCol = false;
        try {
            $colCheck = $pdo->prepare(
                "SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS
                 WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'users' AND COLUMN_NAME = 'totp_secret'"
            );
            $colCheck->execute();
            $hasTotpCol = $colCheck->rowCount() > 0;
        } catch (Exception $e) { /* ignore */ }

        $selectCols = $hasTotpCol
            ? 'SELECT id, email, password, totp_secret FROM users WHERE email = ?'
            : 'SELECT id, email, password FROM users WHERE email = ?';

        $stmt = $pdo->prepare($selectCols);
        $stmt->execute([$email]);
        $user = $stmt->fetch();

        if (!$user) {
            jsonResponse(['error' => 'Nieprawidłowy email lub hasło'], 401);
        }

        if (!password_verify($password, $user['password'])) {
            jsonResponse(['error' => 'Nieprawidłowy email lub hasło'], 401);
        }

        // Check 2FA
        $totpSecret = $user['totp_secret'] ?? null;
        $has2FA = !empty($totpSecret) && !str_starts_with($totpSecret, 'pending:');

        if ($has2FA) {
            $totpCode = $body['totpCode'] ?? '';
            if (empty($totpCode)) {
                // Password OK but 2FA code needed — return special response
                jsonResponse(['requires2FA' => true], 200);
            }
            if (!totpVerifyCode($totpSecret, $totpCode)) {
                jsonResponse(['error' => 'Nieprawidłowy kod 2FA'], 401);
            }
        }

        $accessToken = createToken((int)$user['id'], $user['email']);
        $refreshToken = createRefreshToken((int)$user['id'], $user['email']);
        setAuthCookies($accessToken, $refreshToken);

        jsonResponse(['success' => true]);

    } catch (PDOException $e) {
        error_log('Database error: ' . $e->getMessage());
        jsonResponse(['error' => 'Błąd połączenia z bazą danych. Sprawdź konfigurację MySQL.'], 503);
    }
} catch (Exception $e) {
    error_log('Login error: ' . $e->getMessage());
    jsonResponse(['error' => 'Wystąpił błąd podczas logowania'], 500);
}
