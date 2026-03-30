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

if ($method !== 'POST') {
    http_response_code(405);
    echo json_encode(['error' => 'Method not allowed']);
    exit;
}

try {
    // Sprawdz czy MySQL jest skonfigurowany
    $cfg = getDbConfig();
    if (!$cfg) {
        http_response_code(400);
        echo json_encode([
            'success' => false,
            'error' => 'MySQL nie jest skonfigurowany. Skonfiguruj baze danych w ustawieniach przed migracja.',
            'migrated' => ['days' => 0, 'tasks' => 0],
        ]);
        exit;
    }

    $pdo = getDb();
    if (!$pdo) {
        http_response_code(500);
        echo json_encode([
            'success' => false,
            'error' => 'Database connection failed',
            'migrated' => ['days' => 0, 'tasks' => 0],
        ]);
        exit;
    }

    // 1. Upewnij sie ze tabele istnieja
    ensureTablesExist($pdo, $cfg['database']);

    // 1.5. Upewnij sie ze uzytkownik istnieje w bazie
    $stmt = $pdo->prepare('SELECT id FROM users WHERE id = ?');
    $stmt->execute([$userId]);
    $existingUser = $stmt->fetchAll();

    if (empty($existingUser)) {
        http_response_code(400);
        echo json_encode([
            'success' => false,
            'error' => "Uzytkownik o ID $userId nie istnieje w bazie. Zaloguj sie ponownie.",
            'migrated' => ['days' => 0, 'tasks' => 0],
        ]);
        exit;
    } else {
        error_log("[MIGRATION DEBUG] User $userId exists in database");
    }

    // 2. Przeczytaj dane z JSON
    $dataFile = DATA_DIR . '/work-time.json';
    if (!file_exists($dataFile)) {
        http_response_code(404);
        echo json_encode([
            'success' => false,
            'message' => 'Brak pliku work-time.json do migracji',
            'migrated' => ['days' => 0, 'tasks' => 0],
        ]);
        exit;
    }

    $fileContent = file_get_contents($dataFile);
    if (!$fileContent || trim($fileContent) === '') {
        http_response_code(400);
        echo json_encode([
            'success' => false,
            'message' => 'Plik work-time.json jest pusty',
            'migrated' => ['days' => 0, 'tasks' => 0],
        ]);
        exit;
    }

    $jsonData = json_decode($fileContent, true);
    if ($jsonData === null || !is_array($jsonData)) {
        http_response_code(400);
        echo json_encode([
            'success' => false,
            'message' => 'Blad parsowania JSON: ' . json_last_error_msg(),
            'migrated' => ['days' => 0, 'tasks' => 0],
        ]);
        exit;
    }

    // 2.5. Przeczytaj dane klientow z clients.json
    $clientsData = [];
    $clientsFile = DATA_DIR . '/clients.json';
    if (file_exists($clientsFile)) {
        $clientsFileContent = file_get_contents($clientsFile);
        if ($clientsFileContent && trim($clientsFileContent) !== '') {
            $parsed = json_decode($clientsFileContent, true);
            if (is_array($parsed)) {
                $clientsData = $parsed;
            }
        }
    }

    // Znajdz dane uzytkownika - sprawdz zarowno jako string jak i number
    $userData = $jsonData[$userId] ?? $jsonData[(string)$userId] ?? null;

    $availableUserIds = array_keys($jsonData);
    $debugInfo = [
        'requestedUserId' => $userId,
        'userIdType' => gettype($userId),
        'availableUserIds' => $availableUserIds,
        'foundUserData' => $userData !== null,
        'userDataKeys' => $userData ? array_keys($userData) : [],
    ];

    if (!$userData) {
        echo json_encode([
            'success' => false,
            'message' => "Brak danych dla uzytkownika ID: $userId. Dostepne ID w JSON: " . implode(', ', $availableUserIds),
            'migrated' => ['days' => 0, 'tasks' => 0],
            'debug' => $debugInfo,
        ]);
        exit;
    }

    // Policz calkowita liczbe operacji
    $totalClients = 0;
    $totalMonths = 0;
    $totalDays = 0;
    $totalTasks = 0;

    foreach ($userData as $clientIdStr => $clientData) {
        if (!$clientData || !is_array($clientData) || isset($clientData[0])) {
            continue;
        }
        $totalClients++;
        foreach ($clientData as $monthKey => $monthData) {
            if (!preg_match('/^\d{4}-\d{2}$/', $monthKey)) {
                continue;
            }
            if (!is_array($monthData) || isset($monthData[0])) {
                continue;
            }
            $totalMonths++;
            foreach ($monthData as $dateKey => $dayData) {
                if (is_array($dayData) && !empty($dayData['tasks']) && is_array($dayData['tasks'])) {
                    $totalDays++;
                    $totalTasks += count($dayData['tasks']);
                }
            }
        }
    }

    $totalOperations = $totalClients + $totalMonths + $totalDays + $totalTasks;

    $totalDaysMigrated = 0;
    $totalTasksMigrated = 0;
    $currentOperation = 0;
    $migrationDetails = [
        'clientsProcessed' => 0,
        'monthsProcessed' => 0,
        'daysWithTasks' => 0,
        'daysSkipped' => 0,
        'tasksAdded' => 0,
        'tasksUpdated' => 0,
        'tasksDeleted' => 0,
        'errors' => [],
        'progress' => [
            'total' => $totalOperations,
            'current' => 0,
            'percentage' => 0,
            'stage' => 'Initializing',
            'details' => [
                'totalClients' => $totalClients,
                'totalMonths' => $totalMonths,
                'totalDays' => $totalDays,
                'totalTasks' => $totalTasks,
            ],
        ],
    ];

    // 3. Przejdz przez wszystkie klienty i miesiace
    foreach ($userData as $clientIdStr => $clientData) {
        if (!$clientData || !is_array($clientData) || isset($clientData[0])) {
            $migrationDetails['errors'][] = "Invalid client data structure for client $clientIdStr";
            continue;
        }

        // Zachowaj oryginalna kopie danych klienta
        $originalClientData = $clientData;

        // Parsuj ID klienta
        $clientId = null;
        if (is_numeric($clientIdStr)) {
            $clientId = (int)$clientIdStr;
        } else {
            $migrationDetails['errors'][] = "Invalid client ID format: $clientIdStr, skipping";
            continue;
        }

        // Sprawdz czy klient istnieje w bazie
        $stmt = $pdo->prepare('SELECT id, name, logo, website FROM clients WHERE id = ? AND user_id = ?');
        $stmt->execute([$clientId, $userId]);
        $existingClient = $stmt->fetchAll();

        // Jesli nie znaleziono po ID, sprawdz po nazwie
        if (empty($existingClient)) {
            $stmt = $pdo->prepare('SELECT id, name, logo, website FROM clients WHERE user_id = ? AND name LIKE ?');
            $stmt->execute([$userId, "%$clientIdStr%"]);
            $existingClient = $stmt->fetchAll();
        }

        // Pobierz dane klienta z clients.json
        $clientName = "Klient $clientIdStr";
        $clientLogo = '';
        $clientWebsite = '';

        $userClientsKey = (string)$userId;
        if (!empty($clientsData[$userClientsKey]) && is_array($clientsData[$userClientsKey])) {
            foreach ($clientsData[$userClientsKey] as $c) {
                if ((string)($c['id'] ?? '') === $clientIdStr || ($c['id'] ?? null) === $clientId) {
                    $clientName = $c['name'] ?? $clientName;
                    $clientLogo = $c['logo'] ?? '';
                    $clientWebsite = $c['website'] ?? '';
                    break;
                }
            }
        }

        if (empty($existingClient)) {
            // Klient nie istnieje - utworz nowego
            try {
                if ($clientId > 2147483647) {
                    // ID za duze dla INT - uzyj auto-increment
                    $stmt = $pdo->prepare('INSERT INTO clients (user_id, name, logo, website) VALUES (?, ?, ?, ?)');
                    $stmt->execute([$userId, $clientName, $clientLogo, $clientWebsite]);
                    $clientId = (int)$pdo->lastInsertId();
                } else {
                    try {
                        $stmt = $pdo->prepare('INSERT INTO clients (id, user_id, name, logo, website) VALUES (?, ?, ?, ?, ?)');
                        $stmt->execute([$clientId, $userId, $clientName, $clientLogo, $clientWebsite]);
                    } catch (PDOException $insertError) {
                        // Jesli nie mozna uzyc tego ID, utworz z auto-increment
                        $stmt = $pdo->prepare('INSERT INTO clients (user_id, name, logo, website) VALUES (?, ?, ?, ?)');
                        $stmt->execute([$userId, $clientName, $clientLogo, $clientWebsite]);
                        $clientId = (int)$pdo->lastInsertId();
                    }
                }
            } catch (PDOException $e) {
                $migrationDetails['errors'][] = "Could not create client $clientIdStr: " . $e->getMessage();
                continue;
            }
        } else {
            // Klient juz istnieje - zaktualizuj dane jesli potrzeba
            $existingClientRow = $existingClient[0];
            $clientId = (int)$existingClientRow['id'];

            $needsUpdate = $existingClientRow['name'] !== $clientName
                || $existingClientRow['logo'] !== $clientLogo
                || $existingClientRow['website'] !== $clientWebsite;

            if ($needsUpdate && $clientName !== "Klient $clientIdStr") {
                try {
                    $stmt = $pdo->prepare('UPDATE clients SET name = ?, logo = ?, website = ? WHERE id = ?');
                    $stmt->execute([$clientName, $clientLogo, $clientWebsite, $clientId]);
                } catch (PDOException $e) {
                    error_log("[MIGRATION WARNING] Could not update client $clientId: " . $e->getMessage());
                }
            }
        }

        $migrationDetails['clientsProcessed']++;

        // Przejdz przez wszystkie miesiace
        foreach ($originalClientData as $monthKey => $monthData) {
            // Sprawdz format miesiaca YYYY-MM
            if (!preg_match('/^\d{4}-\d{2}$/', $monthKey)) {
                // Pomin nie-miesiace (artefakty danych)
                if (!is_array($monthData) || !empty($monthData)) {
                    $migrationDetails['errors'][] = "Skipped non-month key: \"$monthKey\" (not in YYYY-MM format)";
                }
                continue;
            }

            if (!is_array($monthData) || isset($monthData[0])) {
                $migrationDetails['errors'][] = "Invalid month data: $monthKey";
                continue;
            }

            if (empty($monthData)) {
                continue;
            }

            $migrationDetails['monthsProcessed']++;
            $migrationDetails['progress']['stage'] = "Processing month $monthKey";

            $daysSkipped = 0;

            foreach ($monthData as $dateKey => $dayData) {
                if (!is_array($dayData)) {
                    $daysSkipped++;
                    continue;
                }

                $tasks = $dayData['tasks'] ?? [];
                if (!is_array($tasks) || empty($tasks)) {
                    $daysSkipped++;
                    continue;
                }

                $migrationDetails['daysWithTasks']++;

                try {
                    // Znajdz lub utworz work_day
                    $stmt = $pdo->prepare('SELECT id FROM work_days WHERE user_id = ? AND client_id = ? AND date = ?');
                    $stmt->execute([$userId, $clientId, $dateKey]);
                    $workDayResult = $stmt->fetchAll();

                    if (empty($workDayResult)) {
                        $stmt = $pdo->prepare('INSERT INTO work_days (user_id, client_id, date) VALUES (?, ?, ?)');
                        $stmt->execute([$userId, $clientId, $dateKey]);
                        $workDayId = (int)$pdo->lastInsertId();
                    } else {
                        $workDayId = (int)$workDayResult[0]['id'];
                    }

                    // Pobierz istniejace zadania
                    $stmt = $pdo->prepare(
                        'SELECT id, description, assigned_by, start_time, end_time, status FROM tasks WHERE work_day_id = ?'
                    );
                    $stmt->execute([$workDayId]);
                    $existingTasks = $stmt->fetchAll();

                    // Dodaj lub zaktualizuj zadania
                    $jsonTaskKeys = [];

                    foreach ($tasks as $task) {
                        // Normalizuj assignedBy
                        $assignedByJson = '';
                        if (!empty($task['assignedBy'])) {
                            if (is_array($task['assignedBy'])) {
                                $assignedByJson = json_encode($task['assignedBy'], JSON_UNESCAPED_UNICODE);
                            } elseif (is_string($task['assignedBy']) && trim($task['assignedBy']) !== '') {
                                $assignedByJson = json_encode([$task['assignedBy']], JSON_UNESCAPED_UNICODE);
                            }
                        }

                        // Okresl status
                        $status = $task['status'] ?? 'do zrobienia';
                        if ($status === 'do zrobienia' && isset($task['completed'])) {
                            $status = $task['completed'] ? 'wykonano' : 'do zrobienia';
                        }

                        $startTime = $task['startTime'] ?? '08:00';
                        $endTime = $task['endTime'] ?? '16:00';
                        $description = $task['text'] ?? '';

                        // Klucz do porownywania
                        $taskKey = $description . '|' . $startTime . '|' . $endTime . '|' . $assignedByJson;
                        $jsonTaskKeys[] = $taskKey;

                        // Znajdz istniejace zadanie
                        $existingTask = null;
                        foreach ($existingTasks as $et) {
                            $etAssignedBy = $et['assigned_by'] ?? '';
                            $etStartTime = $et['start_time'] ? substr($et['start_time'], 0, 5) : '';
                            $etEndTime = $et['end_time'] ? substr($et['end_time'], 0, 5) : '';
                            $normalizedStartTime = strlen($startTime) === 5 ? $startTime : str_pad($startTime, 5, '0', STR_PAD_LEFT);
                            $normalizedEndTime = strlen($endTime) === 5 ? $endTime : str_pad($endTime, 5, '0', STR_PAD_LEFT);

                            if ($et['description'] === $description
                                && $etStartTime === $normalizedStartTime
                                && $etEndTime === $normalizedEndTime
                                && $etAssignedBy === $assignedByJson) {
                                $existingTask = $et;
                                break;
                            }
                        }

                        if ($existingTask) {
                            // Zadanie istnieje - sprawdz czy wymaga aktualizacji
                            $etStartTime = $existingTask['start_time'] ? substr($existingTask['start_time'], 0, 5) : '';
                            $etEndTime = $existingTask['end_time'] ? substr($existingTask['end_time'], 0, 5) : '';
                            $normalizedStartTime = strlen($startTime) === 5 ? $startTime : str_pad($startTime, 5, '0', STR_PAD_LEFT);
                            $normalizedEndTime = strlen($endTime) === 5 ? $endTime : str_pad($endTime, 5, '0', STR_PAD_LEFT);

                            $needsUpdate = $existingTask['status'] !== $status
                                || $existingTask['description'] !== $description
                                || ($existingTask['assigned_by'] ?? '') !== $assignedByJson
                                || $etStartTime !== $normalizedStartTime
                                || $etEndTime !== $normalizedEndTime;

                            if ($needsUpdate) {
                                $stmt = $pdo->prepare(
                                    'UPDATE tasks SET description = ?, assigned_by = ?, start_time = ?, end_time = ?, status = ?, completed = ? WHERE id = ?'
                                );
                                $stmt->execute([
                                    $description,
                                    $assignedByJson,
                                    $startTime,
                                    $endTime,
                                    $status,
                                    $status === 'wykonano' ? 1 : 0,
                                    $existingTask['id'],
                                ]);
                                $totalTasksMigrated++;
                                $migrationDetails['tasksUpdated']++;
                            }
                        } else {
                            // Nowe zadanie - dodaj
                            $stmt = $pdo->prepare(
                                'INSERT INTO tasks (work_day_id, description, assigned_by, start_time, end_time, status, completed) VALUES (?, ?, ?, ?, ?, ?, ?)'
                            );
                            $stmt->execute([
                                $workDayId,
                                $description,
                                $assignedByJson,
                                $startTime,
                                $endTime,
                                $status,
                                $status === 'wykonano' ? 1 : 0,
                            ]);
                            $totalTasksMigrated++;
                            $migrationDetails['tasksAdded']++;
                        }
                    }

                    // Usun zadania ktore sa w bazie ale nie ma ich w JSON
                    foreach ($existingTasks as $et) {
                        $etAssignedBy = $et['assigned_by'] ?? '';
                        $etStartTime = $et['start_time'] ? substr($et['start_time'], 0, 5) : '';
                        $etEndTime = $et['end_time'] ? substr($et['end_time'], 0, 5) : '';
                        $etKey = $et['description'] . '|' . $etStartTime . '|' . $etEndTime . '|' . $etAssignedBy;

                        if (!in_array($etKey, $jsonTaskKeys)) {
                            $stmt = $pdo->prepare('DELETE FROM tasks WHERE id = ?');
                            $stmt->execute([$et['id']]);
                            $migrationDetails['tasksDeleted']++;
                        }
                    }

                    $totalDaysMigrated++;
                } catch (PDOException $e) {
                    $errorMsg = "Error migrating day $dateKey for client $clientId: " . $e->getMessage();
                    error_log($errorMsg);
                    $migrationDetails['errors'][] = $errorMsg;
                }
            }

            $migrationDetails['daysSkipped'] += $daysSkipped;
        }
    }

    $migrationDetails['progress']['percentage'] = 100;
    $migrationDetails['progress']['stage'] = 'Completed';
    $migrationDetails['progress']['current'] = $migrationDetails['progress']['total'];

    echo json_encode([
        'success' => true,
        'message' => 'Migracja zakonczona pomyslnie',
        'migrated' => [
            'days' => $totalDaysMigrated,
            'tasks' => $totalTasksMigrated,
        ],
        'progress' => $migrationDetails['progress'],
        'details' => [
            'clientsProcessed' => $migrationDetails['clientsProcessed'],
            'monthsProcessed' => $migrationDetails['monthsProcessed'],
            'daysWithTasks' => $migrationDetails['daysWithTasks'],
            'daysSkipped' => $migrationDetails['daysSkipped'],
            'tasksAdded' => $migrationDetails['tasksAdded'],
            'tasksUpdated' => $migrationDetails['tasksUpdated'],
            'tasksDeleted' => $migrationDetails['tasksDeleted'],
            'errors' => $migrationDetails['errors'],
            'errorsCount' => count($migrationDetails['errors']),
        ],
        'debug' => array_merge($debugInfo, ['migrationDetails' => $migrationDetails]),
    ]);

} catch (Exception $e) {
    error_log('Migration error: ' . $e->getMessage());
    http_response_code(500);
    echo json_encode([
        'success' => false,
        'error' => 'Blad podczas migracji danych. Sprawdz logi serwera.',
    ]);
}

/**
 * Ensure all required tables exist in the database.
 */
function ensureTablesExist(PDO $pdo, string $dbName): void
{
    $pdo->exec("
        CREATE TABLE IF NOT EXISTS users (
            id INT AUTO_INCREMENT PRIMARY KEY,
            email VARCHAR(255) UNIQUE NOT NULL,
            password VARCHAR(255) NOT NULL,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    ");

    $pdo->exec("
        CREATE TABLE IF NOT EXISTS clients (
            id INT AUTO_INCREMENT PRIMARY KEY,
            user_id INT NOT NULL,
            name VARCHAR(255) NOT NULL,
            logo VARCHAR(500) DEFAULT '',
            website VARCHAR(500) DEFAULT '',
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
            FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
            INDEX idx_user (user_id)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    ");

    $pdo->exec("
        CREATE TABLE IF NOT EXISTS work_days (
            id INT AUTO_INCREMENT PRIMARY KEY,
            user_id INT NOT NULL,
            client_id INT NULL,
            date DATE NOT NULL,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
            UNIQUE KEY unique_user_client_date (user_id, client_id, date),
            FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
            FOREIGN KEY (client_id) REFERENCES clients(id) ON DELETE CASCADE
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    ");

    $pdo->exec("
        CREATE TABLE IF NOT EXISTS tasks (
            id INT AUTO_INCREMENT PRIMARY KEY,
            work_day_id INT NOT NULL,
            task_uid VARCHAR(12) NULL,
            description TEXT NOT NULL,
            assigned_by VARCHAR(500) DEFAULT '',
            start_time TIME DEFAULT '08:00:00',
            end_time TIME DEFAULT '16:00:00',
            status VARCHAR(50) DEFAULT 'do zrobienia',
            completed TINYINT(1) DEFAULT 0,
            attachments JSON NULL,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
            FOREIGN KEY (work_day_id) REFERENCES work_days(id) ON DELETE CASCADE,
            INDEX idx_work_day (work_day_id)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    ");

    $pdo->exec("
        CREATE TABLE IF NOT EXISTS time_slots (
            id INT AUTO_INCREMENT PRIMARY KEY,
            work_day_id INT NOT NULL,
            start_time TIME NOT NULL,
            end_time TIME NOT NULL,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
            FOREIGN KEY (work_day_id) REFERENCES work_days(id) ON DELETE CASCADE,
            INDEX idx_work_day (work_day_id)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    ");

    // Dodaj brakujace kolumny w tasks
    $alterColumns = [
        ['tasks', 'assigned_by', "ADD COLUMN assigned_by VARCHAR(500) DEFAULT '' AFTER description"],
        ['tasks', 'start_time', "ADD COLUMN start_time TIME DEFAULT '08:00:00' AFTER assigned_by"],
        ['tasks', 'end_time', "ADD COLUMN end_time TIME DEFAULT '16:00:00' AFTER start_time"],
        ['tasks', 'status', "ADD COLUMN status VARCHAR(50) DEFAULT 'do zrobienia' AFTER end_time"],
        ['tasks', 'completed', "ADD COLUMN completed TINYINT(1) DEFAULT 0 AFTER status"],
        ['tasks', 'task_uid', "ADD COLUMN task_uid VARCHAR(12) NULL AFTER work_day_id"],
        ['tasks', 'attachments', "ADD COLUMN attachments JSON NULL AFTER completed"],
    ];

    foreach ($alterColumns as [$table, $col, $sql]) {
        try {
            $pdo->exec("ALTER TABLE $table $sql");
        } catch (PDOException $e) {
            // Kolumna juz istnieje - ignoruj
            if (stripos($e->getMessage(), 'Duplicate column') === false) {
                // Sprobuj MODIFY jesli kolumna istnieje z inna definicja
                if ($col === 'assigned_by') {
                    try {
                        $pdo->exec("ALTER TABLE tasks MODIFY COLUMN assigned_by VARCHAR(500) DEFAULT ''");
                    } catch (PDOException $e2) {
                        // Ignoruj
                    }
                }
            }
        }
    }

    // Dodaj brakujaca kolumne website w clients
    try {
        $pdo->exec("ALTER TABLE clients ADD COLUMN website VARCHAR(500) DEFAULT '' AFTER logo");
    } catch (PDOException $e) {
        // Kolumna juz istnieje
    }
}
