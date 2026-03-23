<?php
define('JWT_SECRET', 'your-secret-key-change-in-production');
define('DATA_DIR', dirname(__DIR__) . '/data');
define('UPLOAD_DIR', dirname(__DIR__));
define('AVATARS_DIR', dirname(__DIR__) . '/avatars');
date_default_timezone_set('Europe/Warsaw');

// ── Shared helpers ───────────────────────────────────────────────────────────

function jsonResponse($data, int $code = 200): never {
    http_response_code($code);
    echo json_encode($data, JSON_UNESCAPED_UNICODE);
    exit;
}

function getJsonInput(): array {
    return json_decode(file_get_contents('php://input'), true) ?? [];
}
