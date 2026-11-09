<?php
/**
 * Kontrola stanu po wdrożeniu (potok `.github/workflows/deploy.yml`).
 *
 *   GET /api/health -> { status: "ok", storage: "mysql"|"json", php }
 *
 * Bez autoryzacji i bez szczegółów konfiguracji — mówi tylko, czy API działa i czy ma bazę.
 * 503, gdy tryb MySQL jest wybrany, a połączenia nie ma (wtedy aplikacja nie zapisze danych).
 */
require_once __DIR__ . '/../config.php';
require_once __DIR__ . '/../db.php';
require_once __DIR__ . '/../storage.php';

header('Cache-Control: no-store');

if ($method !== 'GET') {
    jsonResponse(['error' => 'Method not allowed'], 405);
}

if (isMySQLAvailable()) {
    $pdo = getDb();
    $ok = false;
    if ($pdo) {
        try {
            $ok = $pdo->query('SELECT 1')->fetchColumn() == 1;
        } catch (Throwable $e) {
            $ok = false;
        }
    }
    jsonResponse(
        ['status' => $ok ? 'ok' : 'error', 'storage' => 'mysql', 'php' => PHP_MAJOR_VERSION . '.' . PHP_MINOR_VERSION],
        $ok ? 200 : 503
    );
}

jsonResponse(['status' => 'ok', 'storage' => 'json', 'php' => PHP_MAJOR_VERSION . '.' . PHP_MINOR_VERSION]);
