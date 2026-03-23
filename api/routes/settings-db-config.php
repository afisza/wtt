<?php
require_once __DIR__ . '/../auth.php';
require_once __DIR__ . '/../db.php';
require_once __DIR__ . '/../storage.php';
require_once __DIR__ . '/../json-helpers.php';

$userId = getUserId();
if (!$userId) {
    http_response_code(401);
    echo json_encode(['error' => 'Unauthorized']);
    exit;
}

if ($method === 'GET') {
    // Pobierz konfiguracje
    try {
        $config = getDbConfig();
        if ($config) {
            $hasPassword = !empty($config['password']);
            unset($config['password']);
            echo json_encode(['config' => $config, 'hasPassword' => $hasPassword]);
        } else {
            echo json_encode(['config' => null]);
        }
    } catch (Exception $e) {
        http_response_code(500);
        echo json_encode(['error' => 'Failed to load config']);
    }

} elseif ($method === 'POST') {
    // Zapisz konfiguracje
    try {
        $body = json_decode(file_get_contents('php://input'), true);
        $host = $body['host'] ?? null;
        $port = $body['port'] ?? null;
        $user = $body['user'] ?? null;
        $password = $body['password'] ?? null;
        $database = $body['database'] ?? null;

        if (!$host || !$port || !$user || !$database) {
            http_response_code(400);
            echo json_encode(['error' => 'Host, port, user i database sa wymagane']);
            exit;
        }

        $config = [
            'host' => $host,
            'port' => (int)$port,
            'user' => $user,
            'password' => $password ?? '',
            'database' => $database,
        ];

        // Jesli haslo nie zostalo podane, zachowaj stare haslo
        if (!$password) {
            $existingConfig = getDbConfig();
            if ($existingConfig) {
                $config['password'] = $existingConfig['password'];
            }
        }

        saveDbConfig($config);

        // Resetuj pool polaczen aby uzyc nowej konfiguracji
        resetDb();

        echo json_encode(['success' => true]);
    } catch (Exception $e) {
        error_log('Error saving config: ' . $e->getMessage());
        http_response_code(500);
        echo json_encode(['error' => 'Failed to save config']);
    }

} elseif ($method === 'PUT') {
    // Test polaczenia
    try {
        $body = json_decode(file_get_contents('php://input'), true);
        $host = $body['host'] ?? null;
        $port = $body['port'] ?? null;
        $user = $body['user'] ?? null;
        $password = $body['password'] ?? null;
        $database = $body['database'] ?? null;

        if (!$host || !$port || !$user || !$database) {
            http_response_code(400);
            echo json_encode(['error' => 'Wszystkie pola sa wymagane']);
            exit;
        }

        // Jesli haslo nie zostalo podane, uzyj zapisanego hasla z konfiguracji
        $finalPassword = $password;
        if (!$finalPassword || trim($finalPassword) === '') {
            $existingConfig = getDbConfig();
            if ($existingConfig && !empty($existingConfig['password'])) {
                $finalPassword = $existingConfig['password'];
            } else {
                $finalPassword = '';
            }
        }

        $result = testConnection([
            'host' => $host,
            'port' => (int)$port,
            'user' => $user,
            'password' => $finalPassword,
            'database' => $database,
        ]);

        echo json_encode($result);
    } catch (Exception $e) {
        http_response_code(500);
        echo json_encode(['success' => false, 'error' => $e->getMessage() ?: 'Connection test failed']);
    }

} else {
    http_response_code(405);
    echo json_encode(['error' => 'Method not allowed']);
}
