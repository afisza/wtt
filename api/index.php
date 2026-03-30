<?php
// ── CORS — whitelist allowed origins ────────────────────────────────────────
header('Content-Type: application/json; charset=utf-8');

$allowedOrigins = [
    'http://localhost:5173',       // Vite dev
    'http://localhost',            // MAMP local
    'http://localhost:80',
    'https://timer.afisza.com',    // production
    'http://timer.afisza.com',
    'https://host142624.hostido.net.pl',
];

$origin = $_SERVER['HTTP_ORIGIN'] ?? '';
if (in_array($origin, $allowedOrigins, true)) {
    header("Access-Control-Allow-Origin: $origin");
    header('Access-Control-Allow-Credentials: true');
} else {
    header('Access-Control-Allow-Origin: null');
}
header('Access-Control-Allow-Methods: GET, POST, PUT, DELETE, OPTIONS');
header('Access-Control-Allow-Headers: Content-Type, X-CSRF-Token');

if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    http_response_code(204);
    exit;
}

// ── CSRF protection (origin-based for state-changing requests) ──────────────
$_csrfSafeMethods = ['GET', 'HEAD', 'OPTIONS'];
if (!in_array($_SERVER['REQUEST_METHOD'], $_csrfSafeMethods, true)) {
    // For state-changing requests, verify Origin matches an allowed value
    $reqOrigin = $_SERVER['HTTP_ORIGIN'] ?? '';
    if ($reqOrigin !== '' && !in_array($reqOrigin, $allowedOrigins, true)) {
        http_response_code(403);
        echo json_encode(['error' => 'CSRF: Origin not allowed']);
        exit;
    }
}

// Parse route
$uri = $_SERVER['REQUEST_URI'];
$basePath = '/wtt/api';
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
    '/auth/refresh' => 'auth-refresh.php',
    '/auth/logout' => 'auth-logout.php',
    '/auth/2fa' => 'auth-2fa-setup.php',
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
