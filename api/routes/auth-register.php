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

    // Walidacja emaila
    if (!preg_match('/^[^\s@]+@[^\s@]+\.[^\s@]+$/', $email)) {
        jsonResponse(['error' => 'Nieprawidłowy format emaila'], 400);
    }

    // Walidacja hasła (minimum 6 znaków)
    if (strlen($password) < 6) {
        jsonResponse(['error' => 'Hasło musi mieć minimum 6 znaków'], 400);
    }

    // Sprawdź tryb przechowywania danych
    if (!isMySQLAvailable()) {
        jsonResponse([
            'error' => 'Rejestracja jest dostępna tylko w trybie MySQL. Skonfiguruj bazę danych w ustawieniach.'
        ], 400);
    }

    try {
        $pdo = getDb();
        if (!$pdo) {
            jsonResponse(['error' => 'Błąd połączenia z bazą danych. Sprawdź konfigurację MySQL.'], 503);
        }

        // Sprawdź czy użytkownik już istnieje
        $stmt = $pdo->prepare('SELECT id FROM users WHERE email = ?');
        $stmt->execute([$email]);
        if ($stmt->fetch()) {
            jsonResponse(['error' => 'Użytkownik o tym adresie email już istnieje'], 409);
        }

        // Hash hasła (kompatybilny z bcryptjs)
        $hashedPassword = password_hash($password, PASSWORD_BCRYPT);

        // Utwórz użytkownika
        $stmt = $pdo->prepare('INSERT INTO users (email, password) VALUES (?, ?)');
        $stmt->execute([$email, $hashedPassword]);
        $userId = (int)$pdo->lastInsertId();

        // Utwórz token JWT
        $token = createToken($userId, $email);

        setcookie('auth_token', $token, [
            'expires'  => time() + 7 * 86400,
            'path'     => '/',
            'httponly'  => false,
            'samesite' => 'Lax',
        ]);

        jsonResponse([
            'token'   => $token,
            'user'    => ['id' => $userId, 'email' => $email],
            'success' => true,
        ]);

    } catch (PDOException $e) {
        error_log('Database error: ' . $e->getMessage());

        // Sprawdź czy błąd wynika z duplikatu emaila
        if (strpos($e->getMessage(), 'Duplicate') !== false || $e->getCode() == 23000) {
            jsonResponse(['error' => 'Użytkownik o tym adresie email już istnieje'], 409);
        }

        jsonResponse([
            'error' => 'Wystąpił błąd podczas rejestracji. Sprawdź konfigurację bazy danych.'
        ], 500);
    }
} catch (Exception $e) {
    error_log('Register error: ' . $e->getMessage());
    jsonResponse(['error' => 'Wystąpił błąd podczas rejestracji'], 500);
}
