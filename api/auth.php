<?php
require_once __DIR__ . '/config.php';
require_once __DIR__ . '/vendor/autoload.php';
use Firebase\JWT\JWT;
use Firebase\JWT\Key;

function getUserId(): ?int {
    $token = $_COOKIE['auth_token'] ?? null;
    if (!$token) return null;
    try {
        $decoded = JWT::decode($token, new Key(JWT_SECRET, 'HS256'));
        return (int)$decoded->userId;
    } catch (Exception $e) {
        return null;
    }
}

function createToken(int $userId, string $email): string {
    $payload = [
        'userId' => $userId,
        'email' => $email,
        'iat' => time(),
        'exp' => time() + 7 * 24 * 3600, // 7 days
    ];
    return JWT::encode($payload, JWT_SECRET, 'HS256');
}
