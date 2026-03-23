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
    // Pobierz tryb przechowywania
    try {
        $mode = getStorageMode();
        echo json_encode(['mode' => $mode]);
    } catch (Exception $e) {
        error_log('Error getting storage mode: ' . $e->getMessage());
        http_response_code(500);
        echo json_encode(['error' => 'Failed to get storage mode']);
    }

} elseif ($method === 'POST') {
    // Zapisz tryb przechowywania
    try {
        $body = json_decode(file_get_contents('php://input'), true);
        $mode = $body['mode'] ?? null;

        if ($mode !== 'mysql' && $mode !== 'json') {
            http_response_code(400);
            echo json_encode(['error' => 'Invalid mode. Must be "mysql" or "json"']);
            exit;
        }

        saveStorageMode($mode);
        echo json_encode(['success' => true, 'mode' => $mode]);
    } catch (Exception $e) {
        error_log('Error saving storage mode: ' . $e->getMessage());
        http_response_code(500);
        echo json_encode(['error' => 'Failed to save storage mode']);
    }

} else {
    http_response_code(405);
    echo json_encode(['error' => 'Method not allowed']);
}
