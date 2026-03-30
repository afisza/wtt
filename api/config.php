<?php
// ── JWT configuration ───────────────────────────────────────────────────────
// Secret loaded from file (not committed to VCS). Falls back to env var.
$_jwtSecretFile = dirname(__DIR__) . '/data/.jwt-secret';
if (file_exists($_jwtSecretFile)) {
    define('JWT_SECRET', trim(file_get_contents($_jwtSecretFile)));
} elseif (getenv('JWT_SECRET')) {
    define('JWT_SECRET', getenv('JWT_SECRET'));
} else {
    // Auto-generate on first run and persist
    $_generated = base64_encode(random_bytes(48));
    @file_put_contents($_jwtSecretFile, $_generated);
    define('JWT_SECRET', $_generated);
}

define('JWT_ACCESS_TTL', 3600);        // 1 hour
define('JWT_REFRESH_TTL', 7 * 86400);  // 7 days

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

/**
 * Safe file deletion — prevents path traversal by verifying realpath stays
 * within the allowed base directory.
 */
function safeUnlink(string $filePath, string $allowedBaseDir): bool {
    $real = realpath($filePath);
    $base = realpath($allowedBaseDir);
    if ($real === false || $base === false) return false;
    if (strpos($real, $base . DIRECTORY_SEPARATOR) !== 0 && $real !== $base) return false;
    return @unlink($real);
}

// ── Rate limiting (file-based) ──────────────────────────────────────────────
define('RATE_LIMIT_DIR', DATA_DIR . '/rate-limits');

function checkRateLimit(string $key, int $maxAttempts = 5, int $windowSeconds = 900): bool {
    if (!is_dir(RATE_LIMIT_DIR)) @mkdir(RATE_LIMIT_DIR, 0700, true);
    $file = RATE_LIMIT_DIR . '/' . md5($key) . '.json';
    $now = time();
    $data = [];
    if (file_exists($file)) {
        $data = json_decode(file_get_contents($file), true) ?: [];
    }
    // Prune old entries
    $data = array_filter($data, fn($ts) => ($now - $ts) < $windowSeconds);
    if (count($data) >= $maxAttempts) return false; // rate limited
    $data[] = $now;
    @file_put_contents($file, json_encode(array_values($data)));
    return true; // allowed
}
