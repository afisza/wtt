<?php
/**
 * 2FA Setup — generate secret, return QR URI, confirm with code.
 *
 * POST /api/auth/2fa/setup        → generate new secret, return base32 + otpauth URI
 * POST /api/auth/2fa/confirm      → verify code, enable 2FA
 * POST /api/auth/2fa/disable      → verify code, disable 2FA
 * GET  /api/auth/2fa/status       → check if 2FA is enabled
 */
require_once __DIR__ . '/../config.php';
require_once __DIR__ . '/../auth.php';
require_once __DIR__ . '/../db.php';
require_once __DIR__ . '/../totp.php';

$userId = getUserId();
if (!$userId) {
    jsonResponse(['error' => 'Unauthorized'], 401);
}

$method = $_SERVER['REQUEST_METHOD'];
$body = ($method === 'POST') ? getJsonInput() : [];
$subAction = $body['action'] ?? $_GET['action'] ?? 'status';

// Ensure totp_secret column exists
ensureTotpColumn();

if ($method === 'GET') {
    // Return 2FA status
    $enabled = isTotpEnabled($userId);
    jsonResponse(['enabled' => $enabled]);
}

if ($method !== 'POST') {
    jsonResponse(['error' => 'Method not allowed'], 405);
}

if ($subAction === 'setup') {
    // Generate a new TOTP secret
    $secret = totpGenerateSecret(20);
    $base32 = totpSecretToBase32($secret);

    // Get user email
    $pdo = getDb();
    $stmt = $pdo->prepare('SELECT email FROM users WHERE id = ?');
    $stmt->execute([$userId]);
    $user = $stmt->fetch();

    // Store secret temporarily (not confirmed yet — store with prefix 'pending:')
    $pdo->prepare('UPDATE users SET totp_secret = ? WHERE id = ?')
        ->execute(['pending:' . $base32, $userId]);

    $uri = totpGetProvisioningUri($base32, $user['email']);

    jsonResponse([
        'secret' => $base32,
        'otpauth_uri' => $uri,
    ]);
}

if ($subAction === 'confirm') {
    $code = $body['code'] ?? '';
    if (strlen($code) !== 6 || !ctype_digit($code)) {
        jsonResponse(['error' => 'Kod musi miec 6 cyfr'], 400);
    }

    $pdo = getDb();
    $stmt = $pdo->prepare('SELECT totp_secret FROM users WHERE id = ?');
    $stmt->execute([$userId]);
    $row = $stmt->fetch();
    $stored = $row['totp_secret'] ?? '';

    if (!str_starts_with($stored, 'pending:')) {
        jsonResponse(['error' => '2FA setup nie zostal rozpoczety'], 400);
    }

    $base32 = substr($stored, 8); // strip 'pending:'

    if (!totpVerifyCode($base32, $code)) {
        jsonResponse(['error' => 'Nieprawidlowy kod. Sprobuj ponownie.'], 400);
    }

    // Confirm — store without prefix
    $pdo->prepare('UPDATE users SET totp_secret = ? WHERE id = ?')
        ->execute([$base32, $userId]);

    jsonResponse(['success' => true, 'message' => '2FA zostalo wlaczone']);
}

if ($subAction === 'disable') {
    $code = $body['code'] ?? '';
    if (strlen($code) !== 6 || !ctype_digit($code)) {
        jsonResponse(['error' => 'Kod musi miec 6 cyfr'], 400);
    }

    $pdo = getDb();
    $stmt = $pdo->prepare('SELECT totp_secret FROM users WHERE id = ?');
    $stmt->execute([$userId]);
    $row = $stmt->fetch();
    $stored = $row['totp_secret'] ?? '';

    if (empty($stored) || str_starts_with($stored, 'pending:')) {
        jsonResponse(['error' => '2FA nie jest wlaczone'], 400);
    }

    if (!totpVerifyCode($stored, $code)) {
        jsonResponse(['error' => 'Nieprawidlowy kod'], 400);
    }

    $pdo->prepare('UPDATE users SET totp_secret = NULL WHERE id = ?')
        ->execute([$userId]);

    jsonResponse(['success' => true, 'message' => '2FA zostalo wylaczone']);
}

jsonResponse(['error' => 'Unknown action'], 400);

// ── Helpers ─────────────────────────────────────────────────────────────────

function ensureTotpColumn(): void {
    try {
        $pdo = getDb();
        if (!$pdo) return;
        $stmt = $pdo->prepare(
            "SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS
             WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'users' AND COLUMN_NAME = 'totp_secret'"
        );
        $stmt->execute();
        if ($stmt->rowCount() === 0) {
            $pdo->exec("ALTER TABLE users ADD COLUMN totp_secret VARCHAR(255) NULL AFTER password");
        }
    } catch (Exception $e) {
        error_log('ensureTotpColumn: ' . $e->getMessage());
    }
}

function isTotpEnabled(int $userId): bool {
    try {
        $pdo = getDb();
        if (!$pdo) return false;
        $stmt = $pdo->prepare('SELECT totp_secret FROM users WHERE id = ?');
        $stmt->execute([$userId]);
        $row = $stmt->fetch();
        $secret = $row['totp_secret'] ?? '';
        return !empty($secret) && !str_starts_with($secret, 'pending:');
    } catch (Exception $e) {
        return false;
    }
}
