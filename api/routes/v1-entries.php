<?php
/**
 * Publiczne API wpisów (token API, bez ciasteczek sesji).
 *
 *   GET  /api/v1/entries?date=YYYY-MM-DD[&client=…]   → wpisy z dnia (domyślnie dziś)
 *   POST /api/v1/entries                              → dodaje jeden wpis
 *        { client, text, minutes|duration, [date], [start], [end], [status], [allowDuplicate] }
 *
 * Token może tylko dodawać i czytać — nie edytuje ani nie usuwa zadań.
 */
require_once __DIR__ . '/../api-tokens.php';
require_once __DIR__ . '/../entries-service.php';

$userId = requireApiToken();
$pdo = getDb();

if ($method === 'GET') {
    $date = resolveEntryDate($_GET['date'] ?? null);
    if (!$date) jsonResponse(['error' => 'Nieprawidłowa data (format YYYY-MM-DD)'], 400);

    $clientId = null;
    if (isset($_GET['client']) && trim((string)$_GET['client']) !== '') {
        $resolved = entryResolveClient(entryUserClients($pdo, $userId), $_GET['client']);
        if (!isset($resolved['client'])) jsonResponse($resolved['body'], $resolved['status']);
        $clientId = $resolved['client']['id'];
    }
    $tasks = entryDayTasks($pdo, $userId, $date, $clientId);
    $total = entryTotalMinutes($tasks);
    jsonResponse([
        'date' => $date,
        'entries' => $tasks,
        'totalMinutes' => $total,
        'total' => entryFormatDuration($total),
    ]);
}

if ($method === 'POST') {
    $raw = file_get_contents('php://input');
    if (strlen($raw) > 16384) jsonResponse(['error' => 'Zbyt duże żądanie'], 413);
    $body = json_decode($raw, true);
    if (!is_array($body)) jsonResponse(['error' => 'Treść żądania musi być obiektem JSON'], 400);

    $result = createEntry($pdo, $userId, $body);
    jsonResponse($result['body'], $result['status']);
}

jsonResponse(['error' => 'Method not allowed'], 405);
