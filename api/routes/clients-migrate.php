<?php
require_once __DIR__ . '/../config.php';
require_once __DIR__ . '/../auth.php';
require_once __DIR__ . '/../db.php';
require_once __DIR__ . '/../storage.php';

$method = $_SERVER['REQUEST_METHOD'];

if ($method !== 'POST') {
    jsonResponse(['error' => 'Method not allowed'], 405);
}

$userId = getUserId();
if (!$userId) {
    jsonResponse(['error' => 'Unauthorized'], 401);
}

try {
    if (isMySQLAvailable()) {
        // ── Migracja MySQL ───────────────────────────────────────────────────
        $pdo = getDb();

        // 1. Sprawdź czy klient "Best Market" już istnieje
        $stmt = $pdo->prepare("SELECT id FROM clients WHERE user_id = ? AND name = 'Best Market'");
        $stmt->execute([$userId]);
        $existing = $stmt->fetch();

        if ($existing) {
            $bestMarketClientId = (int)$existing['id'];
        } else {
            // Utwórz klienta "Best Market"
            $stmt = $pdo->prepare("INSERT INTO clients (user_id, name, logo) VALUES (?, 'Best Market', '')");
            $stmt->execute([$userId]);
            $bestMarketClientId = (int)$pdo->lastInsertId();
        }

        // 2. Zaktualizuj wszystkie work_days bez client_id
        $stmt = $pdo->prepare('UPDATE work_days SET client_id = ? WHERE user_id = ? AND client_id IS NULL');
        $stmt->execute([$bestMarketClientId, $userId]);
        $updatedRows = $stmt->rowCount();

        jsonResponse([
            'success'     => true,
            'message'     => 'Dane zostały przypisane do klienta "Best Market"',
            'clientId'    => $bestMarketClientId,
            'updatedRows' => $updatedRows,
        ]);
    } else {
        // ── Migracja JSON ────────────────────────────────────────────────────
        $workTimeFile = DATA_DIR . '/work-time.json';
        $clientsFile  = DATA_DIR . '/clients.json';

        $workTimeData = [];
        $clientsData  = [];

        if (file_exists($workTimeFile)) {
            $workTimeData = json_decode(file_get_contents($workTimeFile), true) ?: [];
        }
        if (file_exists($clientsFile)) {
            $clientsData = json_decode(file_get_contents($clientsFile), true) ?: [];
        }

        // Sprawdź czy użytkownik ma dane w starej strukturze
        $userData = $workTimeData[$userId] ?? $workTimeData[(string)$userId] ?? null;
        if ($userData && is_array($userData)) {
            $firstKey = array_key_first($userData);
            if ($firstKey && preg_match('/^\d{4}-\d{2}$/', (string)$firstKey)) {
                // To stara struktura (userId -> months) - migruj do (userId -> clientId -> months)
                $key = isset($workTimeData[$userId]) ? $userId : (string)$userId;

                if (!isset($clientsData[$key])) {
                    $clientsData[$key] = [];
                }

                // Utwórz lub znajdź klienta "Best Market"
                $bestMarketClient = null;
                foreach ($clientsData[$key] as $c) {
                    if (($c['name'] ?? '') === 'Best Market') {
                        $bestMarketClient = $c;
                        break;
                    }
                }
                if (!$bestMarketClient) {
                    $bestMarketClient = [
                        'id'         => (int)(microtime(true) * 1000),
                        'name'       => 'Best Market',
                        'logo'       => '',
                        'created_at' => date('c'),
                        'updated_at' => date('c'),
                    ];
                    $clientsData[$key][] = $bestMarketClient;
                }

                // Migruj dane - skopiuj wszystkie miesiące pod clientId
                $migratedData = [];
                foreach ($userData as $monthKey => $monthData) {
                    $migratedData[$monthKey] = $monthData;
                }

                // Zastąp starą strukturę nową
                $workTimeData[$key] = [
                    $bestMarketClient['id'] => $migratedData,
                ];

                // Zapisz zaktualizowane dane
                file_put_contents($workTimeFile, json_encode($workTimeData, JSON_PRETTY_PRINT | JSON_UNESCAPED_UNICODE));
                file_put_contents($clientsFile, json_encode($clientsData, JSON_PRETTY_PRINT | JSON_UNESCAPED_UNICODE));

                jsonResponse([
                    'success'  => true,
                    'message'  => 'Dane JSON zostały przypisane do klienta "Best Market"',
                    'clientId' => $bestMarketClient['id'],
                ]);
            }
        }

        jsonResponse([
            'success' => true,
            'message' => 'Dane są już w nowej strukturze lub brak danych do migracji',
        ]);
    }
} catch (Exception $e) {
    error_log('Migration error: ' . $e->getMessage());
    jsonResponse(['error' => 'Failed to migrate data'], 500);
}
