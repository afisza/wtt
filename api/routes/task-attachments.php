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

    if ($realPath === false || $baseDir === false || strpos($realPath, $baseDir) !== 0) {
        return ['error' => 'Plik nie istnieje', 'code' => 404];
    }

    return ['filePath' => $realPath, 'filename' => $filename, 'taskId' => $taskId];
}

/**
 * Verify that the given taskId belongs to the authenticated user.
 */
function verifyTaskOwnership(int $userId, string $taskId): bool {
    if (isMySQLAvailable()) {
        $pdo = getDb();
        if ($pdo) {
            try {
                $stmt = $pdo->prepare(
                    'SELECT t.id FROM tasks t
                     JOIN work_days wd ON wd.id = t.work_day_id
                     WHERE wd.user_id = ? AND t.task_uid = ?
                     LIMIT 1'
                );
                $stmt->execute([$userId, $taskId]);
                if ($stmt->fetch()) return true;
            } catch (Exception $e) {
                // fall through to JSON check
            }
        }
    }

    // JSON fallback — scan work-time.json
    $file = DATA_DIR . '/work-time.json';
    if (!file_exists($file)) return false;
    $data = json_decode(file_get_contents($file), true);
    if (!is_array($data)) return false;

    $userData = $data[(string)$userId] ?? $data[$userId] ?? null;
    if (!is_array($userData)) return false;

    foreach ($userData as $clientData) {
        if (!is_array($clientData)) continue;
        foreach ($clientData as $monthData) {
            if (!is_array($monthData)) continue;
            foreach ($monthData as $dayData) {
                if (!is_array($dayData) || !isset($dayData['tasks'])) continue;
                foreach ($dayData['tasks'] as $task) {
                    $uid = is_array($task) ? ($task['id'] ?? '') : '';
                    if ((string)$uid === (string)$taskId) return true;
                }
            }
        }
    }
    return false;
}

function handleGet(): void {
    $userId = getUserId();
    if (!$userId) { if (!tryRefreshAccess()) { http_response_code(401); echo json_encode(['error' => 'Unauthorized']); return; } $userId = getUserId(); }

    try {
        $url = $_GET['url'] ?? '';
        $parsed = validateAndParsePath($url);

        if (isset($parsed['error'])) {
            http_response_code($parsed['code']);
            echo json_encode(['error' => $parsed['error']]);
            return;
        }

        // Verify ownership
        if (!verifyTaskOwnership($userId, $parsed['taskId'])) {
            http_response_code(403);
            echo json_encode(['error' => 'Brak dostepu do tego zasobu']);
            return;
        }

        $filePath = $parsed['filePath'];
        $filename = $parsed['filename'];
        $ext = strtolower(pathinfo($filename, PATHINFO_EXTENSION));
        $contentType = getMimeType('.' . $ext);

        header('Content-Type: ' . $contentType);
        header('Cache-Control: private, max-age=86400');
        readfile($filePath);
        exit;
    } catch (Exception $e) {
        error_log('Task attachment serve error: ' . $e->getMessage());
        http_response_code(500);
        echo json_encode(['error' => 'Blad odczytu pliku']);
    }
}

function handleDelete(): void {
    $userId = getUserId();
    if (!$userId) { if (!tryRefreshAccess()) { http_response_code(401); echo json_encode(['error' => 'Unauthorized']); return; } $userId = getUserId(); }

    try {
        $url = $_GET['url'] ?? '';
        $parsed = validateAndParsePath($url);

        if (isset($parsed['error'])) {
            http_response_code($parsed['code']);
            echo json_encode(['error' => $parsed['error']]);
            return;
        }

        // Verify ownership
        if (!verifyTaskOwnership($userId, $parsed['taskId'])) {
            http_response_code(403);
            echo json_encode(['error' => 'Brak dostepu do tego zasobu']);
            return;
        }

        unlink($parsed['filePath']);
        echo json_encode(['success' => true]);
    } catch (Exception $e) {
        error_log('Task attachment delete error: ' . $e->getMessage());
        http_response_code(500);
        echo json_encode(['error' => 'Blad podczas usuwania']);
    }
}
