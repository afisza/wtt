<?php
require_once __DIR__ . '/../config.php';
require_once __DIR__ . '/../auth.php';
require_once __DIR__ . '/../db.php';
require_once __DIR__ . '/../storage.php';

$userId = getUserId();
if (!$userId && !tryRefreshAccess()) {
    jsonResponse(['error' => 'Unauthorized'], 401);
}
if (!$userId) $userId = getUserId();

$method = $_SERVER['REQUEST_METHOD'];

// Ensure table exists
ensureAssignersTable();

// Auto-migrate from JSON on first MySQL use
autoMigrateAssignersFromJson($userId);

// ── GET ─────────────────────────────────────────────────────────────────────
if ($method === 'GET') {
    try {
        jsonResponse(getAssigners($userId));
    } catch (Exception $e) {
        error_log('Error loading assigners: ' . $e->getMessage());
        jsonResponse(['error' => 'Blad podczas pobierania zleceniodawcow'], 500);
    }
}

// ── POST ────────────────────────────────────────────────────────────────────
if ($method === 'POST') {
    try {
        $body   = getJsonInput();
        $name   = $body['name'] ?? '';
        $avatar = $body['avatar'] ?? null;

        if (!$name || trim($name) === '') {
            jsonResponse(['error' => 'Nazwa jest wymagana'], 400);
        }

        $id = (string)(int)(microtime(true) * 1000);
        $now = date('c');

        if (isMySQLAvailable() && ($pdo = getDb())) {
            $stmt = $pdo->prepare(
                'INSERT INTO assigners (assigner_uid, user_id, name, avatar, created_at, updated_at) VALUES (?, ?, ?, ?, NOW(), NOW())'
            );
            $stmt->execute([$id, $userId, trim($name), $avatar ?: '']);
        }

        // JSON fallback
        $newAssigner = [
            'id' => $id, 'name' => trim($name), 'createdAt' => $now, 'updatedAt' => $now,
        ];
        if ($avatar) $newAssigner['avatar'] = $avatar;
        saveAssignerToJson($newAssigner);

        http_response_code(201);
        echo json_encode($newAssigner, JSON_UNESCAPED_UNICODE);
        exit;
    } catch (Exception $e) {
        error_log('Error creating assigner: ' . $e->getMessage());
        jsonResponse(['error' => 'Blad podczas tworzenia zleceniodawcy'], 500);
    }
}

// ── PUT ─────────────────────────────────────────────────────────────────────
if ($method === 'PUT') {
    try {
        $body   = getJsonInput();
        $id     = $body['id'] ?? null;
        $name   = $body['name'] ?? '';
        $avatar = $body['avatar'] ?? null;

        if (!$id) jsonResponse(['error' => 'ID jest wymagane'], 400);
        if (!$name || trim($name) === '') jsonResponse(['error' => 'Nazwa jest wymagana'], 400);

        // Get old avatar for cleanup
        $oldAvatar = null;
        if (isMySQLAvailable() && ($pdo = getDb())) {
            $stmt = $pdo->prepare('SELECT avatar FROM assigners WHERE assigner_uid = ? AND user_id = ?');
            $stmt->execute([(string)$id, $userId]);
            $row = $stmt->fetch();
            if (!$row) jsonResponse(['error' => 'Zleceniodawca nie zostal znaleziony'], 404);
            $oldAvatar = $row['avatar'] ?? '';

            $fields = ['name = ?', 'updated_at = NOW()'];
            $params = [trim($name)];
            if ($avatar) {
                $fields[] = 'avatar = ?';
                $params[] = $avatar;
            }
            $params[] = (string)$id;
            $params[] = $userId;
            $pdo->prepare('UPDATE assigners SET ' . implode(', ', $fields) . ' WHERE assigner_uid = ? AND user_id = ?')
                ->execute($params);
        }

        // Delete old avatar file if changed
        if ($avatar && $oldAvatar && $oldAvatar !== $avatar && strpos($oldAvatar, '/avatars/') === 0) {
            safeUnlink(dirname(__DIR__) . $oldAvatar, AVATARS_DIR);
        }

        // JSON fallback
        updateAssignerInJson((string)$id, trim($name), $avatar);

        jsonResponse(['id' => (string)$id, 'name' => trim($name), 'avatar' => $avatar ?: $oldAvatar, 'updatedAt' => date('c')]);
    } catch (Exception $e) {
        error_log('Error updating assigner: ' . $e->getMessage());
        jsonResponse(['error' => 'Blad podczas aktualizacji zleceniodawcy'], 500);
    }
}

// ── DELETE ───────────────────────────────────────────────────────────────────
if ($method === 'DELETE') {
    try {
        $id = $_GET['id'] ?? null;
        if (!$id) jsonResponse(['error' => 'ID jest wymagane'], 400);

        $avatarToDelete = null;

        if (isMySQLAvailable() && ($pdo = getDb())) {
            $stmt = $pdo->prepare('SELECT avatar FROM assigners WHERE assigner_uid = ? AND user_id = ?');
            $stmt->execute([(string)$id, $userId]);
            $row = $stmt->fetch();
            if (!$row) jsonResponse(['error' => 'Zleceniodawca nie zostal znaleziony'], 404);
            $avatarToDelete = $row['avatar'] ?? '';

            $pdo->prepare('DELETE FROM assigners WHERE assigner_uid = ? AND user_id = ?')
                ->execute([(string)$id, $userId]);
        }

        // Delete avatar file
        if ($avatarToDelete && strpos($avatarToDelete, '/avatars/') === 0) {
            safeUnlink(dirname(__DIR__) . $avatarToDelete, AVATARS_DIR);
        }

        // JSON fallback
        deleteAssignerFromJson((string)$id);

        jsonResponse(['success' => true]);
    } catch (Exception $e) {
        error_log('Error deleting assigner: ' . $e->getMessage());
        jsonResponse(['error' => 'Blad podczas usuwania zleceniodawcy'], 500);
    }
}

jsonResponse(['error' => 'Method not allowed'], 405);

// ═══════════════════════════════════════════════════════════════════════════════
// Helper functions
// ═══════════════════════════════════════════════════════════════════════════════

function ensureAssignersTable(): void {
    if (!isMySQLAvailable()) return;
    $pdo = getDb();
    if (!$pdo) return;
    try {
        $stmt = $pdo->query("SHOW TABLES LIKE 'assigners'");
        if ($stmt->rowCount() > 0) return;

        $pdo->exec("
            CREATE TABLE IF NOT EXISTS assigners (
                id INT AUTO_INCREMENT PRIMARY KEY,
                assigner_uid VARCHAR(20) NOT NULL,
                user_id INT NOT NULL,
                name VARCHAR(255) NOT NULL,
                avatar VARCHAR(500) DEFAULT '',
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
                UNIQUE KEY unique_uid_user (assigner_uid, user_id),
                INDEX idx_user (user_id),
                FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
        ");
    } catch (Exception $e) {
        error_log('ensureAssignersTable: ' . $e->getMessage());
    }
}

function autoMigrateAssignersFromJson(int $userId): void {
    if (!isMySQLAvailable()) return;
    $pdo = getDb();
    if (!$pdo) return;

    // Check if user already has assigners in MySQL
    try {
        $stmt = $pdo->prepare('SELECT COUNT(*) as cnt FROM assigners WHERE user_id = ?');
        $stmt->execute([$userId]);
        if ((int)$stmt->fetch()['cnt'] > 0) return; // already migrated
    } catch (Exception $e) {
        return;
    }

    // Read from JSON
    $file = DATA_DIR . '/assigners.json';
    if (!file_exists($file)) return;
    $assigners = json_decode(file_get_contents($file), true);
    if (!is_array($assigners) || empty($assigners)) return;

    // Insert all into MySQL for this user
    try {
        $stmt = $pdo->prepare(
            'INSERT IGNORE INTO assigners (assigner_uid, user_id, name, avatar) VALUES (?, ?, ?, ?)'
        );
        foreach ($assigners as $a) {
            $uid = $a['id'] ?? (string)(int)(microtime(true) * 1000);
            $stmt->execute([$uid, $userId, $a['name'] ?? '', $a['avatar'] ?? '']);
        }
        error_log("[ASSIGNERS] Auto-migrated " . count($assigners) . " assigners from JSON for user $userId");
    } catch (Exception $e) {
        error_log('autoMigrateAssignersFromJson: ' . $e->getMessage());
    }
}

function getAssigners(int $userId): array {
    if (isMySQLAvailable() && ($pdo = getDb())) {
        try {
            $stmt = $pdo->prepare(
                'SELECT assigner_uid, name, avatar, created_at, updated_at FROM assigners WHERE user_id = ? ORDER BY name'
            );
            $stmt->execute([$userId]);
            $rows = $stmt->fetchAll();
            return array_map(function ($r) {
                $item = [
                    'id' => $r['assigner_uid'],
                    'name' => $r['name'],
                    'createdAt' => $r['created_at'],
                    'updatedAt' => $r['updated_at'],
                ];
                if (!empty($r['avatar'])) $item['avatar'] = $r['avatar'];
                return $item;
            }, $rows);
        } catch (Exception $e) {
            error_log('getAssigners MySQL error: ' . $e->getMessage());
            // fall through to JSON
        }
    }

    // JSON fallback
    $file = DATA_DIR . '/assigners.json';
    if (!file_exists($file)) return [];
    $data = json_decode(file_get_contents($file), true);
    return is_array($data) ? $data : [];
}

// ── JSON helpers (fallback/backup) ──────────────────────────────────────────

function saveAssignerToJson(array $assigner): void {
    $file = DATA_DIR . '/assigners.json';
    $data = [];
    if (file_exists($file)) {
        $data = json_decode(file_get_contents($file), true) ?: [];
    }
    $data[] = $assigner;
    @file_put_contents($file, json_encode($data, JSON_PRETTY_PRINT | JSON_UNESCAPED_UNICODE));
}

function updateAssignerInJson(string $id, string $name, ?string $avatar): void {
    $file = DATA_DIR . '/assigners.json';
    if (!file_exists($file)) return;
    $data = json_decode(file_get_contents($file), true) ?: [];
    foreach ($data as &$a) {
        if (($a['id'] ?? '') === $id) {
            $a['name'] = $name;
            $a['updatedAt'] = date('c');
            if ($avatar) $a['avatar'] = $avatar;
            break;
        }
    }
    unset($a);
    @file_put_contents($file, json_encode($data, JSON_PRETTY_PRINT | JSON_UNESCAPED_UNICODE));
}

function deleteAssignerFromJson(string $id): void {
    $file = DATA_DIR . '/assigners.json';
    if (!file_exists($file)) return;
    $data = json_decode(file_get_contents($file), true) ?: [];
    $data = array_values(array_filter($data, fn($a) => ($a['id'] ?? '') !== $id));
    @file_put_contents($file, json_encode($data, JSON_PRETTY_PRINT | JSON_UNESCAPED_UNICODE));
}
