<?php
require_once __DIR__ . '/../auth.php';
require_once __DIR__ . '/../db.php';
require_once __DIR__ . '/../storage.php';
require_once __DIR__ . '/../json-helpers.php';

$method = $_SERVER['REQUEST_METHOD'];

if ($method === 'POST') {
    handlePost();
} else {
    http_response_code(405);
    echo json_encode(['error' => 'Method not allowed']);
}

function handlePost(): void {
    $userId = getUserId();
    if (!$userId) {
        http_response_code(401);
        echo json_encode(['error' => 'Unauthorized']);
        return;
    }

    $uploadDir = dirname(__DIR__, 2) . '/public/task-attachments';
    $maxFileSize = 10 * 1024 * 1024; // 10 MB
    $maxFilesPerTask = 10;
    $allowedTypes = [
        'image/jpeg',
        'image/jpg',
        'image/png',
        'image/gif',
        'image/webp',
        'application/pdf',
        'application/msword',
        'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    ];
    $allowedExtensions = ['.jpg', '.jpeg', '.png', '.gif', '.webp', '.pdf', '.doc', '.docx'];

    try {
        $taskId = $_POST['taskId'] ?? null;
        $file = $_FILES['file'] ?? null;

        if (!$file || !$taskId || trim($taskId) === '') {
            http_response_code(400);
            echo json_encode(['error' => 'Brak pliku lub taskId']);
            return;
        }

        // Check for upload errors
        if ($file['error'] !== UPLOAD_ERR_OK) {
            http_response_code(400);
            echo json_encode(['error' => 'Blad uploadu pliku (kod: ' . $file['error'] . ')']);
            return;
        }

        // Sanitize and validate taskId
        $taskIdClean = preg_replace('/\D/', '', $taskId);
        if (strlen($taskIdClean) < 6) {
            http_response_code(400);
            echo json_encode(['error' => 'Nieprawidlowe taskId (min. 6 cyfr)']);
            return;
        }

        // Check file size
        if ($file['size'] > $maxFileSize) {
            http_response_code(400);
            echo json_encode(['error' => 'Plik za duzy. Maks. ' . ($maxFileSize / 1024 / 1024) . ' MB']);
            return;
        }

        // Validate file type
        $mime = strtolower($file['type'] ?? '');
        $originalName = $file['name'] ?? '';
        $ext = strtolower(pathinfo($originalName, PATHINFO_EXTENSION));
        $ext = $ext ? '.' . $ext : '';

        $allowedByMime = in_array($mime, $allowedTypes) || strpos($mime, 'image/') === 0;
        $allowedByExt = in_array($ext, $allowedExtensions);

        // Browser may send empty file.type (e.g. PDF drag-and-drop) - extension decides
        if (!$allowedByMime && !$allowedByExt) {
            http_response_code(400);
            echo json_encode(['error' => 'Nieprawidlowy typ pliku. Dozwolone: obrazy, PDF, DOC/DOCX']);
            return;
        }

        // Ensure task directory exists
        $taskDir = $uploadDir . '/' . $taskIdClean;
        if (!is_dir($taskDir)) {
            mkdir($taskDir, 0755, true);
        }

        // Check max files per task
        $existingFiles = array_diff(scandir($taskDir), ['.', '..']);
        if (count($existingFiles) >= $maxFilesPerTask) {
            http_response_code(400);
            echo json_encode(['error' => 'Maks. ' . $maxFilesPerTask . ' zalacznikow na zadanie']);
            return;
        }

        // Generate safe filename
        $nameExt = $ext ?: '.bin';
        $randomPart = substr(str_shuffle('abcdefghijklmnopqrstuvwxyz0123456789'), 0, 8);
        $safeName = time() . '-' . $randomPart . $nameExt;
        $destPath = $taskDir . '/' . $safeName;

        // Move uploaded file
        if (!move_uploaded_file($file['tmp_name'], $destPath)) {
            http_response_code(500);
            echo json_encode(['error' => 'Nie udalo sie zapisac pliku']);
            return;
        }

        $url = '/task-attachments/' . $taskIdClean . '/' . $safeName;
        echo json_encode(['success' => true, 'url' => $url]);
    } catch (Exception $e) {
        error_log('Task attachment upload error: ' . $e->getMessage());
        http_response_code(500);
        echo json_encode(['error' => $e->getMessage() ?: 'Blad podczas uploadu']);
    }
}
