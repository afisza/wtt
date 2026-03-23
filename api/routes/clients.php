<?php
require_once __DIR__ . '/../config.php';
require_once __DIR__ . '/../auth.php';
require_once __DIR__ . '/../db.php';
require_once __DIR__ . '/../storage.php';

$method = $_SERVER['REQUEST_METHOD'];

$userId = getUserId();
if (!$userId) {
    jsonResponse(['error' => 'Unauthorized'], 401);
}

// ── GET - pobierz wszystkich klientów użytkownika ────────────────────────────
if ($method === 'GET') {
    if (!isMySQLAvailable()) {
        // Fallback do JSON
        try {
            $file = DATA_DIR . '/clients.json';
            if (file_exists($file)) {
                $data = json_decode(file_get_contents($file), true) ?: [];
                $userClients = $data[$userId] ?? $data[(string)$userId] ?? [];
                jsonResponse($userClients);
            }
            jsonResponse([]);
        } catch (Exception $e) {
            jsonResponse([]);
        }
    }

    try {
        $pdo = getDb();
        $stmt = $pdo->prepare(
            'SELECT id, name, logo, website, created_at, updated_at FROM clients WHERE user_id = ? ORDER BY created_at ASC'
        );
        $stmt->execute([$userId]);
        jsonResponse($stmt->fetchAll());
    } catch (Exception $e) {
        error_log('Error loading clients: ' . $e->getMessage());
        jsonResponse(['error' => 'Failed to load clients'], 500);
    }
}

// ── POST - utwórz nowego klienta ────────────────────────────────────────────
if ($method === 'POST') {
    try {
        $body = getJsonInput();
        $name    = $body['name'] ?? '';
        $logo    = $body['logo'] ?? '';
        $website = $body['website'] ?? '';

        if (!$name || trim($name) === '') {
            jsonResponse(['error' => 'Name is required', 'details' => 'Nazwa klienta jest wymagana'], 400);
        }

        if (!isMySQLAvailable()) {
            // Fallback do JSON
            $file = DATA_DIR . '/clients.json';
            $data = [];
            if (file_exists($file)) {
                $data = json_decode(file_get_contents($file), true) ?: [];
            }

            $newClient = [
                'id'         => (int)(microtime(true) * 1000),
                'name'       => trim($name),
                'logo'       => $logo,
                'website'    => $website,
                'created_at' => date('c'),
                'updated_at' => date('c'),
            ];

            if (!isset($data[$userId])) {
                $data[$userId] = [];
            }
            $data[$userId][] = $newClient;

            file_put_contents($file, json_encode($data, JSON_PRETTY_PRINT | JSON_UNESCAPED_UNICODE));
            jsonResponse($newClient);
        }

        $pdo = getDb();
        $stmt = $pdo->prepare('INSERT INTO clients (user_id, name, logo, website) VALUES (?, ?, ?, ?)');
        $stmt->execute([$userId, trim($name), $logo, $website]);

        $newClient = [
            'id'         => (int)$pdo->lastInsertId(),
            'name'       => trim($name),
            'logo'       => $logo,
            'website'    => $website,
            'created_at' => date('c'),
            'updated_at' => date('c'),
        ];

        jsonResponse($newClient);
    } catch (Exception $e) {
        error_log('Error creating client: ' . $e->getMessage());
        jsonResponse(['error' => 'Failed to create client', 'details' => $e->getMessage()], 500);
    }
}

// ── PUT - zaktualizuj klienta ────────────────────────────────────────────────
if ($method === 'PUT') {
    try {
        $body    = getJsonInput();
        $id      = $body['id'] ?? null;
        $name    = $body['name'] ?? '';
        $logo    = $body['logo'] ?? '';
        $website = $body['website'] ?? '';

        if (!$id) {
            jsonResponse(['error' => 'ID is required'], 400);
        }
        if (!$name || trim($name) === '') {
            jsonResponse(['error' => 'Name is required', 'details' => 'Nazwa klienta jest wymagana'], 400);
        }

        if (!isMySQLAvailable()) {
            // Fallback do JSON
            $file = DATA_DIR . '/clients.json';
            $data = [];
            if (file_exists($file)) {
                $data = json_decode(file_get_contents($file), true) ?: [];
            }

            $userClients = $data[$userId] ?? $data[(string)$userId] ?? null;
            if (!$userClients) {
                jsonResponse(['error' => 'Client not found'], 404);
            }

            $clientIndex = null;
            foreach ($userClients as $i => $c) {
                if ((int)$c['id'] === (int)$id) {
                    $clientIndex = $i;
                    break;
                }
            }
            if ($clientIndex === null) {
                jsonResponse(['error' => 'Client not found'], 404);
            }

            // Usuń stare logo jeśli zmieniono
            $oldClient = $userClients[$clientIndex];
            if (!empty($oldClient['logo']) && $oldClient['logo'] !== $logo && strpos($oldClient['logo'], '/avatars/') === 0) {
                $oldLogoPath = dirname(__DIR__) . $oldClient['logo'];
                if (file_exists($oldLogoPath)) {
                    @unlink($oldLogoPath);
                }
            }

            $key = isset($data[$userId]) ? $userId : (string)$userId;
            $data[$key][$clientIndex] = array_merge($data[$key][$clientIndex], [
                'name'       => trim($name),
                'logo'       => $logo,
                'website'    => $website,
                'updated_at' => date('c'),
            ]);

            file_put_contents($file, json_encode($data, JSON_PRETTY_PRINT | JSON_UNESCAPED_UNICODE));
            jsonResponse($data[$key][$clientIndex]);
        }

        // MySQL
        $pdo = getDb();

        // Sprawdź czy klient należy do użytkownika
        $stmt = $pdo->prepare('SELECT id, logo FROM clients WHERE id = ? AND user_id = ?');
        $stmt->execute([$id, $userId]);
        $existing = $stmt->fetch();

        if (!$existing) {
            jsonResponse(['error' => 'Client not found'], 404);
        }

        // Usuń stare logo jeśli zmieniono
        if (!empty($existing['logo']) && $existing['logo'] !== $logo && strpos($existing['logo'], '/avatars/') === 0) {
            $oldLogoPath = dirname(__DIR__) . $existing['logo'];
            if (file_exists($oldLogoPath)) {
                @unlink($oldLogoPath);
            }
        }

        $stmt = $pdo->prepare('UPDATE clients SET name = ?, logo = ?, website = ? WHERE id = ? AND user_id = ?');
        $stmt->execute([trim($name), $logo, $website, $id, $userId]);

        jsonResponse([
            'id'         => (int)$id,
            'name'       => trim($name),
            'logo'       => $logo,
            'website'    => $website,
            'updated_at' => date('c'),
        ]);
    } catch (Exception $e) {
        error_log('Error updating client: ' . $e->getMessage());
        jsonResponse(['error' => 'Failed to update client', 'details' => $e->getMessage()], 500);
    }
}

// ── DELETE - usuń klienta ────────────────────────────────────────────────────
if ($method === 'DELETE') {
    try {
        $id = $_GET['id'] ?? null;

        if (!$id) {
            jsonResponse(['error' => 'ID is required'], 400);
        }

        if (!isMySQLAvailable()) {
            // Fallback do JSON
            $file = DATA_DIR . '/clients.json';
            $data = [];
            if (file_exists($file)) {
                $data = json_decode(file_get_contents($file), true) ?: [];
            }

            $userClients = $data[$userId] ?? $data[(string)$userId] ?? null;
            if (!$userClients) {
                jsonResponse(['error' => 'Client not found'], 404);
            }

            $clientIndex = null;
            foreach ($userClients as $i => $c) {
                if ((int)$c['id'] === (int)$id) {
                    $clientIndex = $i;
                    break;
                }
            }
            if ($clientIndex === null) {
                jsonResponse(['error' => 'Client not found'], 404);
            }

            $client = $userClients[$clientIndex];

            // Usuń logo jeśli istnieje
            if (!empty($client['logo']) && strpos($client['logo'], '/avatars/') === 0) {
                $logoPath = dirname(__DIR__) . $client['logo'];
                if (file_exists($logoPath)) {
                    @unlink($logoPath);
                }
            }

            $key = isset($data[$userId]) ? $userId : (string)$userId;
            array_splice($data[$key], $clientIndex, 1);
            file_put_contents($file, json_encode($data, JSON_PRETTY_PRINT | JSON_UNESCAPED_UNICODE));
            jsonResponse(['success' => true]);
        }

        // MySQL
        $pdo = getDb();

        // Sprawdź czy klient należy do użytkownika i pobierz logo
        $stmt = $pdo->prepare('SELECT id, logo FROM clients WHERE id = ? AND user_id = ?');
        $stmt->execute([$id, $userId]);
        $existing = $stmt->fetch();

        if (!$existing) {
            jsonResponse(['error' => 'Client not found'], 404);
        }

        // Usuń logo jeśli istnieje
        if (!empty($existing['logo']) && strpos($existing['logo'], '/avatars/') === 0) {
            $logoPath = dirname(__DIR__) . $existing['logo'];
            if (file_exists($logoPath)) {
                @unlink($logoPath);
            }
        }

        // Usuń klienta (cascade usunie powiązane work_days i tasks)
        $stmt = $pdo->prepare('DELETE FROM clients WHERE id = ? AND user_id = ?');
        $stmt->execute([$id, $userId]);

        jsonResponse(['success' => true]);
    } catch (Exception $e) {
        error_log('Error deleting client: ' . $e->getMessage());
        jsonResponse(['error' => 'Failed to delete client', 'details' => $e->getMessage()], 500);
    }
}

jsonResponse(['error' => 'Method not allowed'], 405);
