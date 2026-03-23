<?php
require_once __DIR__ . '/config.php';

function getStorageMode(): string {
    $file = DATA_DIR . '/storage-mode.json';
    if (file_exists($file)) {
        $data = json_decode(file_get_contents($file), true);
        if (isset($data['mode']) && in_array($data['mode'], ['mysql', 'json'])) {
            return $data['mode'];
        }
    }
    return 'mysql';
}

function saveStorageMode(string $mode): void {
    $dir = DATA_DIR;
    if (!is_dir($dir)) mkdir($dir, 0755, true);
    file_put_contents(DATA_DIR . '/storage-mode.json', json_encode(['mode' => $mode], JSON_PRETTY_PRINT));
}

function isMySQLAvailable(): bool {
    if (getStorageMode() === 'json') return false;
    $cfg = getDbConfig();
    return $cfg !== null && !empty($cfg['host']) && !empty($cfg['database']);
}
