<?php
require_once __DIR__ . '/../config.php';
require_once __DIR__ . '/../auth.php';

$method = $_SERVER['REQUEST_METHOD'];

if ($method !== 'POST') {
    jsonResponse(['error' => 'Method not allowed'], 405);
}

$userId = getUserId();
if (!$userId) {
    jsonResponse(['error' => 'Unauthorized'], 401);
}

try {
    if (!isset($_FILES['file']) || $_FILES['file']['error'] !== UPLOAD_ERR_OK) {
        jsonResponse(['error' => 'No file provided'], 400);
    }

    $file = $_FILES['file'];

    // Sprawdź typ pliku (SVG blocked — can contain XSS scripts)
    $validTypes = ['image/jpeg', 'image/jpg', 'image/png', 'image/gif', 'image/webp'];
    $extension  = strtolower(pathinfo($file['name'], PATHINFO_EXTENSION));
    $blockedExts = ['svg', 'svgz', 'html', 'htm', 'php', 'js'];
    $isValidType = in_array($file['type'], $validTypes) && !in_array($extension, $blockedExts);

    if (!$isValidType) {
        jsonResponse([
            'error'   => 'Invalid file type',
            'details' => 'Dozwolone formaty: JPEG, PNG, GIF, WebP',
        ], 400);
    }

    // Sprawdź rozmiar pliku (max 5MB)
    $maxSize = 5 * 1024 * 1024;
    if ($file['size'] > $maxSize) {
        jsonResponse([
            'error'   => 'File too large',
            'details' => 'Maksymalny rozmiar pliku: 5MB',
        ], 400);
    }

    // Utwórz katalog jeśli nie istnieje
    if (!is_dir(AVATARS_DIR)) {
        mkdir(AVATARS_DIR, 0755, true);
    }

    // Generuj unikalną nazwę pliku
    $timestamp = (int)(microtime(true) * 1000);
    if ($extension === 'svg' || $file['type'] === 'image/svg+xml') {
        $extension = 'svg';
    }
    if (!$extension) {
        $extension = 'png';
    }
    $fileName = $timestamp . '.' . $extension;
    $filePath = AVATARS_DIR . '/' . $fileName;

    // Zapisz plik
    if (!move_uploaded_file($file['tmp_name'], $filePath)) {
        jsonResponse(['error' => 'Failed to save file'], 500);
    }

    // Zwróć publiczny URL
    jsonResponse(['url' => '/avatars/' . $fileName]);
} catch (Exception $e) {
    error_log('Error uploading logo: ' . $e->getMessage());
    jsonResponse(['error' => 'Failed to upload logo'], 500);
}
