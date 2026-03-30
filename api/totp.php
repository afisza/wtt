<?php
/**
 * Minimal TOTP (RFC 6238) implementation — no external dependencies.
 */

function totpGenerateSecret(int $length = 20): string {
    return random_bytes($length);
}

function totpSecretToBase32(string $secret): string {
    $base32Chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
    $binary = '';
    foreach (str_split($secret) as $char) {
        $binary .= str_pad(decbin(ord($char)), 8, '0', STR_PAD_LEFT);
    }
    $result = '';
    $chunks = str_split($binary, 5);
    foreach ($chunks as $chunk) {
        $chunk = str_pad($chunk, 5, '0', STR_PAD_RIGHT);
        $result .= $base32Chars[bindec($chunk)];
    }
    return $result;
}

function totpBase32Decode(string $base32): string {
    $base32Chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
    $binary = '';
    foreach (str_split(strtoupper($base32)) as $char) {
        $idx = strpos($base32Chars, $char);
        if ($idx === false) continue;
        $binary .= str_pad(decbin($idx), 5, '0', STR_PAD_LEFT);
    }
    $bytes = '';
    $chunks = str_split($binary, 8);
    foreach ($chunks as $chunk) {
        if (strlen($chunk) < 8) break;
        $bytes .= chr(bindec($chunk));
    }
    return $bytes;
}

function totpGenerateCode(string $secretBase32, int $timeStep = 30, int $digits = 6, ?int $timestamp = null): string {
    $time = $timestamp ?? time();
    $counter = intdiv($time, $timeStep);
    $counterBytes = pack('J', $counter); // 64-bit big-endian

    $secret = totpBase32Decode($secretBase32);
    $hash = hash_hmac('sha1', $counterBytes, $secret, true);

    $offset = ord($hash[19]) & 0x0F;
    $code = (
        ((ord($hash[$offset]) & 0x7F) << 24) |
        ((ord($hash[$offset + 1]) & 0xFF) << 16) |
        ((ord($hash[$offset + 2]) & 0xFF) << 8) |
        (ord($hash[$offset + 3]) & 0xFF)
    ) % (10 ** $digits);

    return str_pad((string)$code, $digits, '0', STR_PAD_LEFT);
}

function totpVerifyCode(string $secretBase32, string $code, int $window = 1, int $timeStep = 30): bool {
    $time = time();
    for ($i = -$window; $i <= $window; $i++) {
        $expected = totpGenerateCode($secretBase32, $timeStep, 6, $time + ($i * $timeStep));
        if (hash_equals($expected, str_pad($code, 6, '0', STR_PAD_LEFT))) {
            return true;
        }
    }
    return false;
}

function totpGetProvisioningUri(string $secretBase32, string $email, string $issuer = 'Afisza Time Tracker'): string {
    return 'otpauth://totp/' . rawurlencode($issuer) . ':' . rawurlencode($email)
        . '?secret=' . $secretBase32
        . '&issuer=' . rawurlencode($issuer)
        . '&algorithm=SHA1&digits=6&period=30';
}
