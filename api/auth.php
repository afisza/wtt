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
        if (($decoded->type ?? 'access') !== 'access') return null;
        return (int)$decoded->userId;
    } catch (Exception $e) {
        return null;
    }
}

function createToken(int $userId, string $email): string {
    $payload = [
        'userId' => $userId,
        'email' => $email,
        'type' => 'access',
        'iat' => time(),
        'exp' => time() + JWT_ACCESS_TTL,
    ];
    return JWT::encode($payload, JWT_SECRET, 'HS256');
}

function createRefreshToken(int $userId, string $email): string {
    $payload = [
        'userId' => $userId,
        'email' => $email,
        'type' => 'refresh',
        'iat' => time(),
        'exp' => time() + JWT_REFRESH_TTL,
    ];
    return JWT::encode($payload, JWT_SECRET, 'HS256');
}

function setAuthCookies(string $accessToken, string $refreshToken): void {
    $secure = (!empty($_SERVER['HTTPS']) && $_SERVER['HTTPS'] !== 'off');

    setcookie('auth_token', $accessToken, [
        'expires'  => time() + JWT_ACCESS_TTL,
        'path'     => '/',
        'httponly'  => true,
        'secure'   => $secure,
        'samesite' => 'Strict',
    ]);
    setcookie('refresh_token', $refreshToken, [
        'expires'  => time() + JWT_REFRESH_TTL,
        'path'     => '/api/auth',
        'httponly'  => true,
        'secure'   => $secure,
        'samesite' => 'Strict',
    ]);
}

function clearAuthCookies(): void {
    setcookie('auth_token', '', ['expires' => 1, 'path' => '/', 'httponly' => true, 'samesite' => 'Strict']);
    setcookie('refresh_token', '', ['expires' => 1, 'path' => '/api/auth', 'httponly' => true, 'samesite' => 'Strict']);
}

/**
 * Try to refresh the access token using the refresh cookie.
 * Returns true if a new access token was issued.
 */
function tryRefreshAccess(): bool {
    $refresh = $_COOKIE['refresh_token'] ?? null;
    if (!$refresh) return false;
    try {
        $decoded = JWT::decode($refresh, new Key(JWT_SECRET, 'HS256'));
        if (($decoded->type ?? '') !== 'refresh') return false;
        $newAccess = createToken((int)$decoded->userId, $decoded->email);
        $secure = (!empty($_SERVER['HTTPS']) && $_SERVER['HTTPS'] !== 'off');
        setcookie('auth_token', $newAccess, [
            'expires'  => time() + JWT_ACCESS_TTL,
            'path'     => '/',
            'httponly'  => true,
            'secure'   => $secure,
            'samesite' => 'Strict',
        ]);
        // Make the new token available to current request
        $_COOKIE['auth_token'] = $newAccess;
        return true;
    } catch (Exception $e) {
        return false;
    }
}
