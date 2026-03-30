<?php
require_once __DIR__ . '/../config.php';
require_once __DIR__ . '/../auth.php';

$userId = getUserId();
if (!$userId && !tryRefreshAccess()) {
    jsonResponse(['error' => 'Unauthorized'], 401);
}

$method = $_SERVER['REQUEST_METHOD'];

if ($method !== 'POST') {
    jsonResponse(['error' => 'Method not allowed'], 405);
}

try {
    // Utwórz katalog jeśli nie istnieje
    if (!is_dir(AVATARS_DIR)) {
        mkdir(AVATARS_DIR, 0755, true);
    }

    if (!isset($_FILES['file']) || $_FILES['file']['error'] !== UPLOAD_ERR_OK) {
        jsonResponse(['error' => 'Brak pliku'], 400);
    }

    $file = $_FILES['file'];

    // Sprawdź typ pliku
    $allowedTypes = ['image/jpeg', 'image/jpg', 'image/png', 'image/gif', 'image/webp'];
    if (!in_array($file['type'], $allowedTypes)) {
        jsonResponse(['error' => 'Nieprawidłowy typ pliku. Dozwolone: JPEG, PNG, GIF, WebP'], 400);
    }

    // Sprawdź rozmiar pliku (max 2MB)
    $maxSize = 2 * 1024 * 1024;
    if ($file['size'] > $maxSize) {
        jsonResponse(['error' => 'Plik jest za duży. Maksymalny rozmiar: 2MB'], 400);
    }

    // Generuj unikalną nazwę pliku
    $timestamp = (int)(microtime(true) * 1000);
    $extension = strtolower(pathinfo($file['name'], PATHINFO_EXTENSION)) ?: 'jpg';
    $fileName  = $timestamp . '.' . $extension;
    $filePath  = AVATARS_DIR . '/' . $fileName;

    // Zapisz plik
    if (!move_uploaded_file($file['tmp_name'], $filePath)) {
        jsonResponse(['error' => 'Błąd podczas zapisywania pliku'], 500);
    }

    // Zwróć ścieżkę
    jsonResponse([
        'success' => true,
        'avatar'  => '/avatars/' . $fileName,
    ]);
} catch (Exception $e) {
    error_log('Error uploading avatar: ' . $e->getMessage());
    jsonResponse(['error' => 'Błąd podczas uploadowania awatara'], 500);
}
