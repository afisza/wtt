<?php
/**
 * GET /api/work-time/rev?month=YYYY-MM&clientId=N → {rev}. Bardzo mała odpowiedź — otwarta aplikacja
 * odpytuje ją co kilkanaście sekund i dociąga pełne dane tylko wtedy, gdy `rev` się zmienił.
 */
require_once __DIR__ . '/../auth.php';
require_once __DIR__ . '/../month-rev.php';

header('Cache-Control: no-store');
if ($method !== 'GET') jsonResponse(['error' => 'Method not allowed'], 405);

$userId = getUserId();
if (!$userId) jsonResponse(['error' => 'Unauthorized'], 401);

$monthKey = (string)($_GET['month'] ?? '');
$clientId = (int)($_GET['clientId'] ?? 0);
if (!preg_match('/^\d{4}-(0[1-9]|1[0-2])$/', $monthKey) || $clientId <= 0) {
    jsonResponse(['error' => 'Podaj month (YYYY-MM) i clientId'], 400);
}

try {
    jsonResponse(['rev' => workTimeMonthRev((int)$userId, $monthKey, $clientId)]);
} catch (Throwable $e) {
    error_log('[work-time/rev] ' . $e->getMessage());
    jsonResponse(['error' => 'Nie udało się sprawdzić zmian'], 500);
}
