<?php
require_once __DIR__ . '/../auth.php';
require_once __DIR__ . '/../db.php';
require_once __DIR__ . '/../storage.php';
require_once __DIR__ . '/../json-helpers.php';

$method = $_SERVER['REQUEST_METHOD'];

if ($method === 'GET') {
    handleGet();
} elseif ($method === 'DELETE') {
    handleDelete();
} else {
    http_response_code(405);
    echo json_encode(['error' => 'Method not allowed']);
}

function getUploadDir(): string {
    return dirname(__DIR__, 2) . '/public/task-attachments';
}

function getMimeType(string $ext): string {
    $mimeTypes = [
        '.jpg'  => 'image/jpeg',
        '.jpeg' => 'image/jpeg',
        '.png'  => 'image/png',
        '.gif'  => 'image/gif',
        '.webp' => 'image/webp',
        '.pdf'  => 'application/pdf',
    ];
    return $mimeTypes[$ext] ?? 'application/octet-stream';
}

function validateAndParsePath(string $url): array {
    if (!$url || strpos($url, '/task-attachments/') !== 0) {
        return ['error' => 'Nieprawidlowy parametr url', 'code' => 400];
    }

    $relative = preg_replace('#^/task-attachments/#', '', $url);
    // Remove directory traversal attempts
    $relative = str_replace('..', '', $relative);
    $parts = explode('/', $relative);

    if (count($parts) !== 2) {
        return ['error' => 'Nieprawidlowy format url', 'code' => 400];
    }

    $taskId = $parts[0];
    $filename = $parts[1];

    if (!preg_match('/^\d{6,}$/', $taskId) || !$filename || strpos($filename, '/') !== false) {
        return ['error' => 'Nieprawidlowy taskId lub nazwa pliku', 'code' => 400];
    }

    $uploadDir = getUploadDir();
    $filePath = $uploadDir . '/' . $taskId . '/' . $filename;
    $realPath = realpath($filePath);
    $baseDir = realpath($uploadDir);

    // realpath returns false if file doesn't exist
    if ($realPath === false || $baseDir === false || strpos($realPath, $baseDir) !== 0) {
        return ['error' => 'Plik nie istnieje', 'code' => 404];
    }

    return ['filePath' => $realPath, 'filename' => $filename];
}

function handleGet(): void {
    $userId = getUserId();
    if (!$userId) {
        http_response_code(401);
        echo json_encode(['error' => 'Unauthorized']);
        return;
    }

    try {
        $url = $_GET['url'] ?? '';
        $parsed = validateAndParsePath($url);

        if (isset($parsed['error'])) {
            http_response_code($parsed['code']);
            echo json_encode(['error' => $parsed['error']]);
            return;
        }

        $filePath = $parsed['filePath'];
        $filename = $parsed['filename'];
        $ext = strtolower(pathinfo($filename, PATHINFO_EXTENSION));
        $contentType = getMimeType('.' . $ext);

        // Override the Content-Type: application/json header set by the router
        header('Content-Type: ' . $contentType);
        header('Cache-Control: private, max-age=86400');
        readfile($filePath);
        exit;
    } catch (Exception $e) {
        error_log('Task attachment serve error: ' . $e->getMessage());
        http_response_code(500);
        echo json_encode(['error' => $e->getMessage() ?: 'Blad odczytu pliku']);
    }
}

function handleDelete(): void {
    $userId = getUserId();
    if (!$userId) {
        http_response_code(401);
        echo json_encode(['error' => 'Unauthorized']);
        return;
    }

    try {
        $url = $_GET['url'] ?? '';
        $parsed = validateAndParsePath($url);

        if (isset($parsed['error'])) {
            http_response_code($parsed['code']);
            echo json_encode(['error' => $parsed['error']]);
            return;
        }

        unlink($parsed['filePath']);
        echo json_encode(['success' => true]);
    } catch (Exception $e) {
        error_log('Task attachment delete error: ' . $e->getMessage());
        http_response_code(500);
        echo json_encode(['error' => $e->getMessage() ?: 'Blad podczas usuwania']);
    }
}
