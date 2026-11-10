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
require_once __DIR__ . '/../entries-lib.php';
require_once __DIR__ . '/../json-helpers.php';

$userId = requireApiToken();
$pdo = getDb();

if ($method === 'GET') {
    v1ListEntries($pdo, $userId);
} elseif ($method === 'POST') {
    v1CreateEntry($pdo, $userId);
} else {
    jsonResponse(['error' => 'Method not allowed'], 405);
}

function v1UserClients(PDO $pdo, int $userId): array {
    $stmt = $pdo->prepare('SELECT id, name, website FROM clients WHERE user_id = ? ORDER BY name');
    $stmt->execute([$userId]);
    return array_map(
        fn($c) => ['id' => (int)$c['id'], 'name' => $c['name'], 'website' => $c['website'] ?? ''],
        $stmt->fetchAll()
    );
}

/** Rozwiązuje klienta z zapytania albo kończy żądanie czytelnym błędem z listą klientów. */
function v1ResolveClient(array $clients, $query): array {
    if ($query === null || trim((string)$query) === '') {
        jsonResponse([
            'error' => 'Podaj klienta (pole client: nazwa, domena lub id)',
            'clients' => array_map(fn($c) => $c['name'], $clients),
        ], 400);
    }
    $res = matchClient($clients, $query);
    if ($res['match']) return $res['match'];
    if (!empty($res['candidates'])) {
        jsonResponse([
            'error' => 'Niejednoznaczny klient — doprecyzuj',
            'candidates' => array_map(fn($c) => ['id' => $c['id'], 'name' => $c['name']], $res['candidates']),
        ], 409);
    }
    jsonResponse([
        'error' => "Nie znaleziono klienta „{$query}”",
        'clients' => array_map(fn($c) => ['id' => $c['id'], 'name' => $c['name'], 'website' => $c['website']], $clients),
    ], 404);
}

function v1FormatDuration(int $minutes): string {
    $h = intdiv($minutes, 60);
    $m = $minutes % 60;
    if ($h && $m) return "{$h}h {$m}min";
    return $h ? "{$h}h" : "{$m}min";
}

/** Wszystkie zadania użytkownika z danego dnia (opcjonalnie tylko jednego klienta). */
function v1DayTasks(PDO $pdo, int $userId, string $date, ?int $clientId = null): array {
    $sql = 'SELECT t.task_uid, t.description, t.start_time, t.end_time, t.status, wd.client_id, c.name AS client_name
            FROM tasks t
            JOIN work_days wd ON wd.id = t.work_day_id
            LEFT JOIN clients c ON c.id = wd.client_id
            WHERE wd.user_id = ? AND wd.date = ?';
    $params = [$userId, $date];
    if ($clientId !== null) {
        $sql .= ' AND wd.client_id = ?';
        $params[] = $clientId;
    }
    $stmt = $pdo->prepare($sql . ' ORDER BY t.start_time, t.id');
    $stmt->execute($params);
    return array_map(function ($t) {
        $start = substr((string)$t['start_time'], 0, 5);
        $end = substr((string)$t['end_time'], 0, 5);
        $minutes = max(0, (timeToMinutes($end) ?? 0) - (timeToMinutes($start) ?? 0));
        return [
            'id' => (string)$t['task_uid'],
            'clientId' => (int)$t['client_id'],
            'client' => $t['client_name'],
            'text' => $t['description'],
            'start' => $start,
            'end' => $end,
            'minutes' => $minutes,
            'status' => $t['status'] ?: 'do zrobienia',
        ];
    }, $stmt->fetchAll());
}

/** Suma czasu z połączonych przedziałów (nakładające się wpisy liczone raz — jak w aplikacji). */
function v1TotalMinutes(array $tasks): int {
    $iv = [];
    foreach ($tasks as $t) {
        $s = timeToMinutes($t['start']);
        $e = timeToMinutes($t['end']);
        if ($s !== null && $e !== null && $e > $s) $iv[] = ['startTime' => $t['start'], 'endTime' => $t['end']];
    }
    [$h, $m] = array_map('intval', explode(':', calculateTotalHours($iv)));
    return $h * 60 + $m;
}

function v1ListEntries(PDO $pdo, int $userId): never {
    $date = resolveEntryDate($_GET['date'] ?? null);
    if (!$date) jsonResponse(['error' => 'Nieprawidłowa data (format YYYY-MM-DD)'], 400);

    $clientId = null;
    if (isset($_GET['client']) && trim((string)$_GET['client']) !== '') {
        $clientId = v1ResolveClient(v1UserClients($pdo, $userId), $_GET['client'])['id'];
    }
    $tasks = v1DayTasks($pdo, $userId, $date, $clientId);
    $total = v1TotalMinutes($tasks);
    jsonResponse([
        'date' => $date,
        'entries' => $tasks,
        'totalMinutes' => $total,
        'total' => v1FormatDuration($total),
    ]);
}

function v1GenerateUniqueTaskUid(PDO $pdo): string {
    $check = $pdo->prepare('SELECT 1 FROM tasks WHERE task_uid = ? LIMIT 1');
    for ($i = 0; $i < 50; $i++) {
        $uid = (string)random_int(100000, 999999);
        $check->execute([$uid]);
        if (!$check->fetchColumn()) return $uid;
    }
    throw new RuntimeException('Nie udało się wygenerować id zadania');
}

function v1CreateEntry(PDO $pdo, int $userId): never {
    $raw = file_get_contents('php://input');
    if (strlen($raw) > 16384) jsonResponse(['error' => 'Zbyt duże żądanie'], 413);
    $body = json_decode($raw, true);
    if (!is_array($body)) jsonResponse(['error' => 'Treść żądania musi być obiektem JSON'], 400);

    // Opis: bez znaków sterujących, max 2000 znaków
    $text = trim(preg_replace('/[\x00-\x09\x0B-\x1F\x7F]/u', '', (string)($body['text'] ?? $body['description'] ?? '')));
    if ($text === '') jsonResponse(['error' => 'Podaj opis pracy (pole text)'], 400);
    if (mb_strlen($text) > 2000) jsonResponse(['error' => 'Opis może mieć najwyżej 2000 znaków'], 400);

    $status = (string)($body['status'] ?? 'wykonano');
    if (!in_array($status, ENTRY_STATUSES, true)) {
        jsonResponse(['error' => 'Nieprawidłowy status', 'allowed' => ENTRY_STATUSES], 400);
    }

    $date = resolveEntryDate($body['date'] ?? null);
    if (!$date) jsonResponse(['error' => 'Nieprawidłowa data (format YYYY-MM-DD)'], 400);

    $minutes = null;
    if (array_key_exists('minutes', $body) || array_key_exists('duration', $body)) {
        $minutes = parseDurationMinutes($body['minutes'] ?? $body['duration']);
        if ($minutes === null) jsonResponse(['error' => 'Nie rozumiem czasu trwania (np. 207 albo "3h 27min")'], 400);
    }
    if ($minutes !== null && $minutes > 1440) jsonResponse(['error' => 'Czas trwania przekracza dobę'], 400);

    $client = v1ResolveClient(v1UserClients($pdo, $userId), $body['client'] ?? $body['clientId'] ?? null);
    $clientId = (int)$client['id'];

    $dayTasks = v1DayTasks($pdo, $userId, $date);
    $existingEnds = [];
    foreach ($dayTasks as $t) {
        $e = timeToMinutes($t['end']);
        if ($e !== null) $existingEnds[] = $e;
    }
    $times = resolveEntryTimes(
        isset($body['start']) ? (string)$body['start'] : null,
        isset($body['end']) ? (string)$body['end'] : null,
        $minutes,
        $existingEnds
    );
    if (isset($times['error'])) jsonResponse(['error' => $times['error']], 422);

    // Ochrona przed podwójnym wpisem (np. ponowienie żądania): ten sam klient, opis i czas trwania tego dnia
    if (empty($body['allowDuplicate'])) {
        foreach ($dayTasks as $t) {
            if ($t['clientId'] === $clientId
                && mb_strtolower(trim($t['text'])) === mb_strtolower($text)
                && $t['minutes'] === $times['minutes']) {
                jsonResponse([
                    'duplicate' => true,
                    'message' => 'Taki wpis już istnieje — nic nie dodano (allowDuplicate: true, aby wymusić)',
                    'entry' => $t + ['date' => $date],
                ], 200);
            }
        }
    }

    try {
        $pdo->beginTransaction();
        $stmt = $pdo->prepare('SELECT id FROM work_days WHERE user_id = ? AND client_id = ? AND date = ? FOR UPDATE');
        $stmt->execute([$userId, $clientId, $date]);
        $workDayId = (int)($stmt->fetchColumn() ?: 0);
        if (!$workDayId) {
            $pdo->prepare('INSERT INTO work_days (user_id, client_id, date) VALUES (?, ?, ?)')
                ->execute([$userId, $clientId, $date]);
            $workDayId = (int)$pdo->lastInsertId();
        }
        $uid = v1GenerateUniqueTaskUid($pdo);
        $pdo->prepare(
            'INSERT INTO tasks (work_day_id, task_uid, description, assigned_by, start_time, end_time, status, completed, attachments)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)'
        )->execute([
            $workDayId, $uid, $text, '', $times['start'], $times['end'], $status,
            $status === 'wykonano' ? 1 : 0, '[]',
        ]);
        $pdo->commit();
    } catch (Throwable $e) {
        if ($pdo->inTransaction()) $pdo->rollBack();
        error_log('[POST /api/v1/entries] ' . $e->getMessage());
        jsonResponse(['error' => 'Nie udało się zapisać wpisu'], 500);
    }

    $entry = [
        'id' => $uid,
        'date' => $date,
        'clientId' => $clientId,
        'client' => $client['name'],
        'text' => $text,
        'start' => $times['start'],
        'end' => $times['end'],
        'minutes' => $times['minutes'],
        'duration' => v1FormatDuration($times['minutes']),
        'status' => $status,
    ];

    // Kopia w JSON — tak jak zapisy z aplikacji (upsert po id, nic nie usuwa)
    try {
        saveMonthDataJSON($userId, substr($date, 0, 7), [$date => ['tasks' => [[
            'id' => $uid, 'text' => $text, 'assignedBy' => [], 'startTime' => $times['start'],
            'endTime' => $times['end'], 'status' => $status, 'attachments' => [],
        ]]]], $clientId);
    } catch (Throwable $e) {
        error_log('[POST /api/v1/entries] JSON backup failed: ' . $e->getMessage());
    }

    $clientDay = v1DayTasks($pdo, $userId, $date, $clientId);
    $dayTotal = v1TotalMinutes($clientDay);
    jsonResponse([
        'created' => true,
        'entry' => $entry,
        'clientDayTotal' => v1FormatDuration($dayTotal),
        'clientDayTotalMinutes' => $dayTotal,
    ], 201);
}
