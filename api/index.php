<?php
// CORS headers
header('Content-Type: application/json; charset=utf-8');
header('Access-Control-Allow-Credentials: true');

$origin = $_SERVER['HTTP_ORIGIN'] ?? '*';
header("Access-Control-Allow-Origin: $origin");
header('Access-Control-Allow-Methods: GET, POST, PUT, DELETE, OPTIONS');
header('Access-Control-Allow-Headers: Content-Type, Authorization, Cookie');

if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    http_response_code(204);
    exit;
}

// Parse route
$uri = $_SERVER['REQUEST_URI'];
$basePath = '/api';
$path = parse_url($uri, PHP_URL_PATH);
$route = str_replace($basePath, '', $path);
$route = rtrim($route, '/');
if ($route === '') $route = '/';

$method = $_SERVER['REQUEST_METHOD'];

// Route mapping
$routes = [
    '/auth/login' => 'auth-login.php',
    '/auth/register' => 'auth-register.php',
    '/auth/verify' => 'auth-verify.php',
    '/clients' => 'clients.php',
    '/clients/migrate' => 'clients-migrate.php',
    '/clients/upload' => 'clients-upload.php',
    '/assigners' => 'assigners.php',
    '/assigners/upload' => 'assigners-upload.php',
    '/work-time' => 'work-time.php',
    '/search-tasks' => 'search-tasks.php',
    '/task-attachments' => 'task-attachments.php',
    '/task-attachments/upload' => 'task-attachments-upload.php',
    '/settings/db-config' => 'settings-db-config.php',
    '/settings/db-info' => 'settings-db-info.php',
    '/settings/db-init' => 'settings-db-init.php',
    '/settings/storage-mode' => 'settings-storage-mode.php',
    '/settings/migrate-json-to-mysql' => 'settings-migrate.php',
    '/settings/fix-december-dates' => 'settings-fix-dates.php',
];

$routeFile = $routes[$route] ?? null;

if ($routeFile && file_exists(__DIR__ . '/routes/' . $routeFile)) {
    require __DIR__ . '/routes/' . $routeFile;
} else {
    http_response_code(404);
    echo json_encode(['error' => 'Route not found', 'route' => $route]);
}
