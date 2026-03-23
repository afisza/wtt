<?php
require_once __DIR__ . '/../config.php';
require_once __DIR__ . '/../vendor/autoload.php';

use Firebase\JWT\JWT;
use Firebase\JWT\Key;

$method = $_SERVER['REQUEST_METHOD'];

if ($method !== 'GET') {
    jsonResponse(['error' => 'Method not allowed'], 405);
}

try {
    $token = $_COOKIE['auth_token'] ?? null;

    if (!$token) {
        jsonResponse(['authenticated' => false], 401);
    }

    try {
        $decoded = JWT::decode($token, new Key(JWT_SECRET, 'HS256'));
        jsonResponse(['authenticated' => true]);
    } catch (Exception $e) {
        jsonResponse(['authenticated' => false, 'error' => $e->getMessage()], 401);
    }
} catch (Exception $e) {
    error_log('Auth verify error: ' . $e->getMessage());
    jsonResponse(['authenticated' => false, 'error' => $e->getMessage()], 500);
}
