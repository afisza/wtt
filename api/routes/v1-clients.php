<?php
/**
 * GET /api/v1/clients — lista klientów właściciela tokenu (do wyboru klienta przy dodawaniu wpisu).
 */
require_once __DIR__ . '/../api-tokens.php';

$userId = requireApiToken();

if ($method !== 'GET') {
    jsonResponse(['error' => 'Method not allowed'], 405);
}

$stmt = getDb()->prepare('SELECT id, name, website FROM clients WHERE user_id = ? ORDER BY name');
$stmt->execute([$userId]);
jsonResponse(array_map(
    fn($c) => ['id' => (int)$c['id'], 'name' => $c['name'], 'website' => $c['website'] ?? ''],
    $stmt->fetchAll()
));
