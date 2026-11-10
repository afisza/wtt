<?php
/**
 * GET /api/v1/clients — lista klientów właściciela tokenu (do wyboru klienta przy dodawaniu wpisu).
 */
require_once __DIR__ . '/../api-tokens.php';
require_once __DIR__ . '/../entries-service.php';

$userId = requireApiToken();

if ($method !== 'GET') {
    jsonResponse(['error' => 'Method not allowed'], 405);
}

jsonResponse(entryUserClients(getDb(), $userId));
