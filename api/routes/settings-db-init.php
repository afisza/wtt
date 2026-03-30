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

$cfg = getDbConfig();
if (!$cfg) {
    http_response_code(400);
    echo json_encode(['error' => 'Database not configured']);
    exit;
}

$connection = null;
try {
    $dsn = "mysql:host={$cfg['host']};port={$cfg['port']};dbname={$cfg['database']};charset=utf8mb4";
    $connection = new PDO($dsn, $cfg['user'], $cfg['password'], [
        PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION,
        PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC,
        PDO::ATTR_EMULATE_PREPARES => false,
        PDO::ATTR_TIMEOUT => 10,
    ]);

    // Sprawdz czy tabele juz istnieja
    $stmt = $connection->query("SHOW TABLES LIKE 'users'");
    $tablesExist = $stmt->rowCount() > 0;

    // Utworz tabele (CREATE TABLE IF NOT EXISTS jest bezpieczne)
    $connection->exec("
        CREATE TABLE IF NOT EXISTS users (
            id INT AUTO_INCREMENT PRIMARY KEY,
            email VARCHAR(255) UNIQUE NOT NULL,
            password VARCHAR(255) NOT NULL,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    ");

    $connection->exec("
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

    $connection->exec("
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

    $connection->exec("
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

    $connection->exec("
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

    // Sprawdz i dodaj brakujace kolumny w tasks
    $stmt = $connection->prepare(
        "SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = ? AND TABLE_NAME = 'tasks'"
    );
    $stmt->execute([$cfg['database']]);
    $columns = array_column($stmt->fetchAll(), 'COLUMN_NAME');

    $taskColumnsToAdd = [
        'assigned_by' => "ADD COLUMN assigned_by VARCHAR(500) DEFAULT '' AFTER description",
        'start_time'  => "ADD COLUMN start_time TIME DEFAULT '08:00:00' AFTER assigned_by",
        'end_time'    => "ADD COLUMN end_time TIME DEFAULT '16:00:00' AFTER start_time",
        'completed'   => "ADD COLUMN completed TINYINT(1) DEFAULT 0 AFTER end_time",
        'status'      => "ADD COLUMN status VARCHAR(50) DEFAULT 'do zrobienia' AFTER end_time",
        'task_uid'    => "ADD COLUMN task_uid VARCHAR(12) NULL AFTER work_day_id",
        'attachments' => "ADD COLUMN attachments JSON NULL AFTER completed",
    ];

    foreach ($taskColumnsToAdd as $colName => $alterSql) {
        if (!in_array($colName, $columns)) {
            try {
                $connection->exec("ALTER TABLE tasks $alterSql");
            } catch (PDOException $e) {
                // Ignoruj blad jesli kolumna juz istnieje
                error_log("Column check/alter skipped for tasks.$colName: " . $e->getMessage());
            }
        }
    }

    // Sprawdz i dodaj brakujace kolumny w clients
    $stmt = $connection->prepare(
        "SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = ? AND TABLE_NAME = 'clients'"
    );
    $stmt->execute([$cfg['database']]);
    $clientColumns = array_column($stmt->fetchAll(), 'COLUMN_NAME');

    if (!in_array('website', $clientColumns)) {
        try {
            $connection->exec("ALTER TABLE clients ADD COLUMN website VARCHAR(500) DEFAULT '' AFTER logo");
        } catch (PDOException $e) {
            error_log("Column check/alter skipped for clients.website: " . $e->getMessage());
        }
    }

    // No default admin account — users must register via the app

    // Resetuj pool polaczen
    resetDb();

    echo json_encode([
        'success' => true,
        'message' => $tablesExist
            ? 'Tabele zostaly zaktualizowane pomyslnie'
            : 'Tabele zostaly utworzone pomyslnie',
        'alreadyExists' => $tablesExist,
        'tablesCreated' => ['users', 'clients', 'work_days', 'time_slots', 'tasks'],
    ]);

} catch (PDOException $e) {
    error_log('Error initializing database: ' . $e->getMessage());
    http_response_code(500);
    echo json_encode([
        'error' => 'Blad inicjalizacji bazy danych. Sprawdz logi serwera.',
    ]);
} finally {
    $connection = null;
}
