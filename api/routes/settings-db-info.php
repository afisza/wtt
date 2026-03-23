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

if ($method !== 'GET') {
    http_response_code(405);
    echo json_encode(['error' => 'Method not allowed']);
    exit;
}

try {
    $info = getDatabaseInfo();

    if (!$info) {
        http_response_code(404);
        echo json_encode(['error' => 'Database not configured or connection failed']);
        exit;
    }

    echo json_encode($info);
} catch (PDOException $e) {
    error_log('Database info error: ' . $e->getMessage());

    $code = $e->getCode();
    $message = $e->getMessage();

    // Sprawdz czy to blad dostepu (Access denied lub brak uprawnien do information_schema)
    $isAccessDenied = $code === 1045
        || $code === '1045'
        || stripos($message, 'Access denied') !== false
        || stripos($message, 'information_schema') !== false;

    if ($isAccessDenied) {
        echo json_encode([
            'size' => '—',
            'tables' => [],
            'limitedPrivileges' => true,
            'message' => 'Polaczenie dziala. Szczegoly (rozmiar, lista tabel) wymagaja uprawnien do information_schema (np. root).',
        ]);
        exit;
    }

    $errorMessage = 'Failed to get database info';
    if ($code === 1049 || $code === '1049') {
        $errorMessage = 'Database does not exist';
    } elseif (stripos($message, 'Connection refused') !== false || $code === 2002 || $code === '2002') {
        $errorMessage = 'Connection refused - check host and port';
    } elseif ($message) {
        $errorMessage = $message;
    }

    http_response_code(500);
    echo json_encode(['error' => $errorMessage]);
} catch (Exception $e) {
    error_log('Database info error: ' . $e->getMessage());
    http_response_code(500);
    echo json_encode(['error' => $e->getMessage() ?: 'Failed to get database info']);
}
