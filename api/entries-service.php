<?php
/**
 * Wspólna logika wpisów czasu pracy — używana przez `/api/v1/entries` (token API)
 * i bota Telegram. Funkcje zwracają wynik zamiast kończyć żądanie.
 */
require_once __DIR__ . '/entries-lib.php';
require_once __DIR__ . '/json-helpers.php';

function entryUserClients(PDO $pdo, int $userId): array {
    $stmt = $pdo->prepare('SELECT id, name, website FROM clients WHERE user_id = ? ORDER BY name');
    $stmt->execute([$userId]);
    return array_map(
        fn($c) => ['id' => (int)$c['id'], 'name' => $c['name'], 'website' => $c['website'] ?? ''],
        $stmt->fetchAll()
    );
}

function entryFormatDuration(int $minutes): string {
    $h = intdiv($minutes, 60);
    $m = $minutes % 60;
    if ($h && $m) return "{$h}h {$m}min";
    return $h ? "{$h}h" : "{$m}min";
}

/** Wszystkie zadania użytkownika z danego dnia (opcjonalnie tylko jednego klienta). */
function entryDayTasks(PDO $pdo, int $userId, string $date, ?int $clientId = null): array {
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
function entryTotalMinutes(array $tasks): int {
    $iv = [];
    foreach ($tasks as $t) {
        $s = timeToMinutes($t['start']);
        $e = timeToMinutes($t['end']);
        if ($s !== null && $e !== null && $e > $s) $iv[] = ['startTime' => $t['start'], 'endTime' => $t['end']];
    }
    [$h, $m] = array_map('intval', explode(':', calculateTotalHours($iv)));
    return $h * 60 + $m;
}

/**
 * Rozwiązuje klienta. Zwraca ['client' => array] albo ['status' => int, 'body' => array] z błędem.
 */
function entryResolveClient(array $clients, $query): array {
    if ($query === null || trim((string)$query) === '') {
        return ['status' => 400, 'body' => [
            'error' => 'Podaj klienta (pole client: nazwa, domena lub id)',
            'clients' => array_map(fn($c) => ['id' => $c['id'], 'name' => $c['name']], $clients),
        ]];
    }
    $res = matchClient($clients, $query);
    if ($res['match']) return ['client' => $res['match']];
    if (!empty($res['candidates'])) {
        return ['status' => 409, 'body' => [
            'error' => 'Niejednoznaczny klient — doprecyzuj',
            'candidates' => array_map(fn($c) => ['id' => $c['id'], 'name' => $c['name']], $res['candidates']),
        ]];
    }
    return ['status' => 404, 'body' => [
        'error' => "Nie znaleziono klienta „{$query}”",
        'clients' => array_map(fn($c) => ['id' => $c['id'], 'name' => $c['name'], 'website' => $c['website']], $clients),
    ]];
}

/** Nazwy osób zlecających użytkownika (tabela assigners). */
function entryUserAssigners(PDO $pdo, int $userId): array {
    try {
        $stmt = $pdo->prepare("SELECT name FROM assigners WHERE user_id = ? AND name <> '' ORDER BY name");
        $stmt->execute([$userId]);
        return array_values(array_unique(array_map('strval', $stmt->fetchAll(PDO::FETCH_COLUMN))));
    } catch (Throwable $e) {
        return []; // brak tabeli assigners = brak osób
    }
}

function entryGenerateUniqueTaskUid(PDO $pdo): string {
    $check = $pdo->prepare('SELECT 1 FROM tasks WHERE task_uid = ? LIMIT 1');
    for ($i = 0; $i < 50; $i++) {
        $uid = (string)random_int(100000, 999999);
        $check->execute([$uid]);
        if (!$check->fetchColumn()) return $uid;
    }
    throw new RuntimeException('Nie udało się wygenerować id zadania');
}

/**
 * Dodaje jeden wpis.
 *
 * @param array $input {client|clientId, text, minutes|duration, date?, start?, end?, status?, assignedBy?, allowDuplicate?}
 *                     assignedBy = nazwa lub tablica nazw osób zlecających (muszą istnieć w „Osobach”)
 * @return array ['status' => int, 'body' => array] — 201 utworzono, 200 duplikat, 4xx/5xx błąd
 */
function createEntry(PDO $pdo, int $userId, array $input): array {
    $err = fn(int $code, string $msg, array $extra = []) => ['status' => $code, 'body' => ['error' => $msg] + $extra];

    // Opis: bez znaków sterujących, max 2000 znaków
    $text = trim(preg_replace('/[\x00-\x09\x0B-\x1F\x7F]/u', '', (string)($input['text'] ?? $input['description'] ?? '')));
    if ($text === '') return $err(400, 'Podaj opis pracy (pole text)');
    if (mb_strlen($text) > 2000) return $err(400, 'Opis może mieć najwyżej 2000 znaków');

    $status = (string)($input['status'] ?? 'wykonano');
    if (!in_array($status, ENTRY_STATUSES, true)) {
        return $err(400, 'Nieprawidłowy status', ['allowed' => ENTRY_STATUSES]);
    }

    $date = resolveEntryDate($input['date'] ?? null);
    if (!$date) return $err(400, 'Nieprawidłowa data (format YYYY-MM-DD)');

    $minutes = null;
    $rawDuration = $input['minutes'] ?? $input['duration'] ?? null;
    if ($rawDuration !== null && $rawDuration !== '') {
        $minutes = parseDurationMinutes($rawDuration);
        if ($minutes === null) return $err(400, 'Nie rozumiem czasu trwania (np. 207 albo "3h 27min")');
    }
    if ($minutes !== null && $minutes > 1440) return $err(400, 'Czas trwania przekracza dobę');

    $assignedBy = [];
    if (!empty($input['assignedBy'])) {
        $known = entryUserAssigners($pdo, $userId);
        $m = matchAssigners($known, $input['assignedBy']);
        if ($m['unknown']) {
            return $err(400, 'Nieznana osoba zlecająca: ' . implode(', ', $m['unknown']), ['allowed' => $known]);
        }
        $assignedBy = $m['names'];
    }

    $resolved = entryResolveClient(entryUserClients($pdo, $userId), $input['client'] ?? $input['clientId'] ?? null);
    if (!isset($resolved['client'])) return $resolved;
    $client = $resolved['client'];
    $clientId = (int)$client['id'];

    $dayTasks = entryDayTasks($pdo, $userId, $date);
    $existingEnds = [];
    foreach ($dayTasks as $t) {
        $e = timeToMinutes($t['end']);
        if ($e !== null) $existingEnds[] = $e;
    }
    $times = resolveEntryTimes(
        isset($input['start']) && $input['start'] !== '' ? (string)$input['start'] : null,
        isset($input['end']) && $input['end'] !== '' ? (string)$input['end'] : null,
        $minutes,
        $existingEnds
    );
    if (isset($times['error'])) return $err(422, $times['error']);

    // Ochrona przed podwójnym wpisem (np. ponowienie żądania): ten sam klient, opis i czas trwania tego dnia
    if (empty($input['allowDuplicate'])) {
        foreach ($dayTasks as $t) {
            if ($t['clientId'] === $clientId
                && mb_strtolower(trim($t['text'])) === mb_strtolower($text)
                && $t['minutes'] === $times['minutes']) {
                return ['status' => 200, 'body' => [
                    'duplicate' => true,
                    'message' => 'Taki wpis już istnieje — nic nie dodano (allowDuplicate: true, aby wymusić)',
                    'entry' => $t + ['date' => $date],
                ]];
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
        $uid = entryGenerateUniqueTaskUid($pdo);
        $pdo->prepare(
            'INSERT INTO tasks (work_day_id, task_uid, description, assigned_by, start_time, end_time, status, completed, attachments)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)'
        )->execute([
            $workDayId, $uid, $text, $assignedBy ? json_encode($assignedBy) : '', $times['start'], $times['end'], $status,
            $status === 'wykonano' ? 1 : 0, '[]',
        ]);
        $pdo->commit();
    } catch (Throwable $e) {
        if ($pdo->inTransaction()) $pdo->rollBack();
        error_log('[createEntry] ' . $e->getMessage());
        return $err(500, 'Nie udało się zapisać wpisu');
    }

    // Kopia w JSON — tak jak zapisy z aplikacji (upsert po id, nic nie usuwa)
    try {
        saveMonthDataJSON($userId, substr($date, 0, 7), [$date => ['tasks' => [[
            'id' => $uid, 'text' => $text, 'assignedBy' => $assignedBy, 'startTime' => $times['start'],
            'endTime' => $times['end'], 'status' => $status, 'attachments' => [],
        ]]]], $clientId);
    } catch (Throwable $e) {
        error_log('[createEntry] JSON backup failed: ' . $e->getMessage());
    }

    $dayTotal = entryTotalMinutes(entryDayTasks($pdo, $userId, $date, $clientId));
    return ['status' => 201, 'body' => [
        'created' => true,
        'entry' => [
            'id' => $uid,
            'date' => $date,
            'clientId' => $clientId,
            'client' => $client['name'],
            'text' => $text,
            'start' => $times['start'],
            'end' => $times['end'],
            'minutes' => $times['minutes'],
            'duration' => entryFormatDuration($times['minutes']),
            'status' => $status,
            'assignedBy' => $assignedBy,
        ],
        'clientDayTotal' => entryFormatDuration($dayTotal),
        'clientDayTotalMinutes' => $dayTotal,
    ]];
}

/** Zadania użytkownika o danym numerze (zwykle jedno; więcej = dawny duplikat). */
function entryFindByUid(PDO $pdo, int $userId, string $uid): array {
    $stmt = $pdo->prepare(
        'SELECT t.id AS row_id, t.task_uid, t.description, t.start_time, t.end_time, t.assigned_by,
                wd.date, wd.client_id, c.name AS client_name
         FROM tasks t
         JOIN work_days wd ON wd.id = t.work_day_id
         LEFT JOIN clients c ON c.id = wd.client_id
         WHERE wd.user_id = ? AND t.task_uid = ?
         ORDER BY wd.date, t.start_time'
    );
    $stmt->execute([$userId, $uid]);
    return array_map(fn($t) => [
        'rowId' => (int)$t['row_id'],
        'id' => (string)$t['task_uid'],
        'date' => substr((string)$t['date'], 0, 10),
        'clientId' => (int)$t['client_id'],
        'client' => $t['client_name'],
        'text' => $t['description'],
        'start' => substr((string)$t['start_time'], 0, 5),
        'end' => substr((string)$t['end_time'], 0, 5),
        'assignedBy' => json_decode((string)$t['assigned_by'], true) ?: [],
    ], $stmt->fetchAll());
}

/**
 * Usuwa jedno zadanie (wiersz z entryFindByUid) z MySQL i z kopii JSON.
 * Usuwa tylko wiersz należący do użytkownika — sprawdzane ponownie w zapytaniu.
 */
function deleteEntryRow(PDO $pdo, int $userId, array $task): bool {
    $stmt = $pdo->prepare(
        'DELETE t FROM tasks t JOIN work_days wd ON wd.id = t.work_day_id
         WHERE t.id = ? AND t.task_uid = ? AND wd.user_id = ?'
    );
    $stmt->execute([$task['rowId'], $task['id'], $userId]);
    if ($stmt->rowCount() === 0) return false;

    try {
        saveMonthDataJSON($userId, substr($task['date'], 0, 7), [
            $task['date'] => ['tasks' => [], 'deletedIds' => [$task['id']]],
        ], $task['clientId']);
    } catch (Throwable $e) {
        error_log('[deleteEntryRow] JSON backup failed: ' . $e->getMessage());
    }
    return true;
}
