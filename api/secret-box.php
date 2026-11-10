<?php
/**
 * Szyfrowanie kluczy integracji (bot Telegram, ElevenLabs, Anthropic) przechowywanych w bazie.
 * XSalsa20-Poly1305 (libsodium secretbox), klucz wyprowadzony z sekretu serwera (`data/.jwt-secret`).
 * Wyciek samej bazy nie ujawnia kluczy. Zmiana sekretu serwera = trzeba wpisać klucze ponownie.
 */
require_once __DIR__ . '/config.php';

function secretBoxKey(): string {
    return sodium_crypto_generichash('wtt-integrations-v1|' . JWT_SECRET, '', SODIUM_CRYPTO_SECRETBOX_KEYBYTES);
}

function secretBoxEncrypt(string $plain): string {
    $nonce = random_bytes(SODIUM_CRYPTO_SECRETBOX_NONCEBYTES);
    return base64_encode($nonce . sodium_crypto_secretbox($plain, $nonce, secretBoxKey()));
}

function secretBoxDecrypt(?string $encoded): ?string {
    if ($encoded === null || $encoded === '') return null;
    $raw = base64_decode($encoded, true);
    if ($raw === false || strlen($raw) <= SODIUM_CRYPTO_SECRETBOX_NONCEBYTES) return null;
    $nonce = substr($raw, 0, SODIUM_CRYPTO_SECRETBOX_NONCEBYTES);
    $plain = sodium_crypto_secretbox_open(substr($raw, SODIUM_CRYPTO_SECRETBOX_NONCEBYTES), $nonce, secretBoxKey());
    return $plain === false ? null : $plain;
}
