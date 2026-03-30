<?php
require_once __DIR__ . '/../config.php';
require_once __DIR__ . '/../auth.php';

if ($_SERVER['REQUEST_METHOD'] !== 'GET') {
    jsonResponse(['error' => 'Method not allowed'], 405);
}

$userId = getUserId();

if ($userId) {
    jsonResponse(['authenticated' => true]);
}

// Access token expired — try refresh
if (tryRefreshAccess()) {
    jsonResponse(['authenticated' => true, 'refreshed' => true]);
}

jsonResponse(['authenticated' => false], 401);
