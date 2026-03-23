<?php
require_once __DIR__ . '/../config.php';
require_once __DIR__ . '/../auth.php';
require_once __DIR__ . '/../db.php';
require_once __DIR__ . '/../storage.php';

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

        $stmt = $pdo->prepare('SELECT id, email, password FROM users WHERE email = ?');
        $stmt->execute([$email]);
        $user = $stmt->fetch();

        if (!$user) {
            jsonResponse(['error' => 'Nieprawidłowy email lub hasło'], 401);
        }

        if (!password_verify($password, $user['password'])) {
            jsonResponse(['error' => 'Nieprawidłowy email lub hasło'], 401);
        }

        $token = createToken((int)$user['id'], $user['email']);

        setcookie('auth_token', $token, [
            'expires'  => time() + 7 * 86400,
            'path'     => '/',
            'httponly'  => false,
            'samesite' => 'Lax',
        ]);

        jsonResponse(['token' => $token, 'success' => true]);

    } catch (PDOException $e) {
        error_log('Database error: ' . $e->getMessage());
        jsonResponse(['error' => 'Błąd połączenia z bazą danych. Sprawdź konfigurację MySQL.'], 503);
    }
} catch (Exception $e) {
    error_log('Login error: ' . $e->getMessage());
    jsonResponse(['error' => 'Wystąpił błąd podczas logowania'], 500);
}
