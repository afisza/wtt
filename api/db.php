<?php
require_once __DIR__ . '/config.php';

function getDbConfig(): ?array {
    $file = DATA_DIR . '/db-config.json';
    if (!file_exists($file)) return null;
    $data = json_decode(file_get_contents($file), true);
    return $data ?: null;
}

function saveDbConfig(array $config): void {
    $dir = DATA_DIR;
    if (!is_dir($dir)) mkdir($dir, 0755, true);
    file_put_contents(DATA_DIR . '/db-config.json', json_encode($config, JSON_PRETTY_PRINT));
}

function getDb(): ?PDO {
    global $_pdo_instance;
    if ($_pdo_instance) return $_pdo_instance;
    $cfg = getDbConfig();
    if (!$cfg) return null;
    try {
        $dsn = "mysql:host={$cfg['host']};port={$cfg['port']};dbname={$cfg['database']};charset=utf8mb4";
        $_pdo_instance = new PDO($dsn, $cfg['user'], $cfg['password'], [
            PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION,
            PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC,
            PDO::ATTR_EMULATE_PREPARES => false,
        ]);
        $_pdo_instance->exec("SET time_zone = '+01:00'");
        return $_pdo_instance;
    } catch (PDOException $e) {
        error_log("DB connection error: " . $e->getMessage());
        return null;
    }
}

function resetDb(): void {
    global $_pdo_instance;
    $_pdo_instance = null;
}

function testConnection(array $config): array {
    try {
        $dsn = "mysql:host={$config['host']};port={$config['port']};dbname={$config['database']};charset=utf8mb4";
        $pdo = new PDO($dsn, $config['user'], $config['password'], [
            PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION,
            PDO::ATTR_TIMEOUT => 5,
        ]);
        $pdo->query('SELECT 1');
        return ['success' => true, 'message' => 'Połączenie udane'];
    } catch (PDOException $e) {
        return ['success' => false, 'error' => $e->getMessage()];
    }
}

function getDatabaseInfo(): ?array {
    $pdo = getDb();
    if (!$pdo) return null;
    $cfg = getDbConfig();
    $dbName = $cfg['database'] ?? '';

    // Get database size
    $stmt = $pdo->prepare("SELECT SUM(data_length + index_length) as size FROM information_schema.TABLES WHERE table_schema = ?");
    $stmt->execute([$dbName]);
    $sizeRow = $stmt->fetch();
    $sizeBytes = (int)($sizeRow['size'] ?? 0);
    $sizeMB = round($sizeBytes / 1024 / 1024, 2);

    // Get tables
    $stmt = $pdo->prepare("SELECT TABLE_NAME, TABLE_ROWS, DATA_LENGTH, INDEX_LENGTH FROM information_schema.TABLES WHERE table_schema = ?");
    $stmt->execute([$dbName]);
    $tables = $stmt->fetchAll();

    return [
        'size' => $sizeMB . ' MB',
        'tables' => array_map(function($t) {
            return [
                'name' => $t['TABLE_NAME'],
                'rows' => (int)$t['TABLE_ROWS'],
                'size' => round(($t['DATA_LENGTH'] + $t['INDEX_LENGTH']) / 1024, 1) . ' KB'
            ];
        }, $tables)
    ];
}
