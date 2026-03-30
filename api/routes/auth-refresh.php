<?php
require_once __DIR__ . '/../config.php';
require_once __DIR__ . '/../auth.php';

if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
    jsonResponse(['error' => 'Method not allowed'], 405);
}

if (tryRefreshAccess()) {
    jsonResponse(['success' => true]);
} else {
    clearAuthCookies();
    jsonResponse(['error' => 'Refresh token expired'], 401);
}
