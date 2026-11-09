<?php
require_once __DIR__ . '/config.php';

function ensureDataFile(string $file): void {
    $dir = dirname($file);
    if (!is_dir($dir)) mkdir($dir, 0755, true);
    if (!file_exists($file)) file_put_contents($file, '{}');
}

function generateTaskId(array &$existingIds): string {
    $min = 100000;
    $max = 999999;
    $attempts = 0;
    do {
        $id = (string)random_int($min, $max);
        $attempts++;
        if ($attempts >= 500) {
            $id = (string)(time() % 900000 + 100000);
            while (isset($existingIds[$id])) $id = (string)((int)$id + 1);
            break;
        }
    } while (isset($existingIds[$id]));
    $existingIds[$id] = true;
    return $id;
}

function calculateTotalHours(array $tasks): string {
    $intervals = [];
    foreach ($tasks as $task) {
        $start = $task['startTime'] ?? '';
        $end = $task['endTime'] ?? '';
        if ($start && $end) {
            $sp = explode(':', $start);
            $ep = explode(':', $end);
            $s = (int)$sp[0] * 60 + (int)($sp[1] ?? 0);
            $e = (int)$ep[0] * 60 + (int)($ep[1] ?? 0);
            if ($e > $s) $intervals[] = ['start' => $s, 'end' => $e];
        }
    }
    if (empty($intervals)) return '00:00';
    usort($intervals, fn($a, $b) => $a['start'] - $b['start']);
    $merged = [$intervals[0]];
    for ($i = 1; $i < count($intervals); $i++) {
        $last = &$merged[count($merged) - 1];
        if ($intervals[$i]['start'] <= $last['end']) {
            $last['end'] = max($last['end'], $intervals[$i]['end']);
        } else {
            $merged[] = $intervals[$i];
        }
    }
    $total = 0;
    foreach ($merged as $iv) $total += $iv['end'] - $iv['start'];
    return sprintf('%02d:%02d', intdiv($total, 60), $total % 60);
}

function normalizeTasks(array $tasks, array &$existingIds = []): array {
    $result = [];
    foreach ($tasks as $task) {
        if (is_string($task)) {
            $id = generateTaskId($existingIds);
            $result[] = ['id' => $id, 'text' => $task, 'assignedBy' => [], 'startTime' => '08:00', 'endTime' => '16:00', 'status' => 'do zrobienia', 'attachments' => []];
            continue;
        }
        $status = $task['status'] ?? null;
        if (!$status && isset($task['completed'])) {
            $status = $task['completed'] ? 'wykonano' : 'do zrobienia';
        }
        if (!$status) $status = 'do zrobienia';
        $assignedBy = [];
        if (!empty($task['assignedBy'])) {
            if (is_array($task['assignedBy'])) $assignedBy = $task['assignedBy'];
            elseif (is_string($task['assignedBy']) && trim($task['assignedBy'])) $assignedBy = [$task['assignedBy']];
        }
        $id = $task['id'] ?? '';
        if (!$id || strlen(preg_replace('/\D/', '', $id)) < 6) {
            $id = generateTaskId($existingIds);
        }
        $result[] = [
            'id' => $id,
            'text' => $task['text'] ?? '',
            'assignedBy' => $assignedBy,
            'startTime' => $task['startTime'] ?? '08:00',
            'endTime' => $task['endTime'] ?? '16:00',
            'status' => $status,
            'attachments' => is_array($task['attachments'] ?? null) ? $task['attachments'] : [],
        ];
    }
    return $result;
}

function getMonthDataJSON(int $userId, string $monthKey, int $clientId): array {
    $file = DATA_DIR . '/work-time.json';
    ensureDataFile($file);
    $data = json_decode(file_get_contents($file), true) ?: [];
    $userData = $data[$userId] ?? $data[(string)$userId] ?? [];
    $clientData = $userData[$clientId] ?? $userData[(string)$clientId] ?? [];
    $monthData = $clientData[$monthKey] ?? [];

    $existingIds = [];
    foreach ($monthData as $day) {
        foreach (($day['tasks'] ?? []) as $t) {
            if (!empty($t['id']) && strlen(preg_replace('/\D/', '', $t['id'])) >= 6) {
                $existingIds[$t['id']] = true;
            }
        }
    }

    $result = [];
    foreach ($monthData as $dateKey => $day) {
        $normalized = normalizeTasks($day['tasks'] ?? [], $existingIds);
        $result[$dateKey] = [
            'date' => $dateKey,
            'tasks' => $normalized,
            'totalHours' => calculateTotalHours($normalized),
        ];
    }
    return $result;
}

/**
 * Zapis dni do JSON — scala z istniejącymi danymi (te same zasady co MySQL):
 * upsert po `id`, usuwanie wyłącznie zadań wskazanych w `deletedIds`.
 * Dni nieobecne w payloadzie pozostają nietknięte.
 */
function saveMonthDataJSON(int $userId, string $monthKey, array $daysData, int $clientId): void {
    $file = DATA_DIR . '/work-time.json';
    ensureDataFile($file);

    $fp = fopen($file, 'c+');
    if (!$fp) throw new Exception('Cannot open work-time.json');
    try {
        if (!flock($fp, LOCK_EX)) throw new Exception('Cannot lock work-time.json');
        $raw = stream_get_contents($fp);
        $data = json_decode($raw ?: '{}', true) ?: [];

        $month = $data[$userId][$clientId][$monthKey] ?? [];
        foreach ($daysData as $dateKey => $dayData) {
            $month[$dateKey] = mergeDayTasksJSON($month[$dateKey] ?? null, $dateKey, $dayData);
        }
        $data[$userId][$clientId][$monthKey] = $month;

        $json = json_encode($data, JSON_PRETTY_PRINT | JSON_UNESCAPED_UNICODE);
        if ($json === false) throw new Exception('JSON encode failed');
        ftruncate($fp, 0);
        rewind($fp);
        if (fwrite($fp, $json) === false) throw new Exception('Cannot write work-time.json');
        fflush($fp);
    } finally {
        flock($fp, LOCK_UN);
        fclose($fp);
    }
}

function mergeDayTasksJSON(?array $existingDay, string $dateKey, array $dayData): array {
    $deletedIds = array_map('strval', is_array($dayData['deletedIds'] ?? null) ? $dayData['deletedIds'] : []);

    // Istniejące zadania z poprawnym id (zadania bez id dostają je przy odczycie,
    // więc klient odsyła je już z nowym id — stare wpisy bez id pomijamy, by nie dublować)
    $byId = [];
    foreach (($existingDay['tasks'] ?? []) as $t) {
        if (is_array($t) && !empty($t['id']) && strlen(preg_replace('/\D/', '', (string)$t['id'])) >= 6) {
            $byId[(string)$t['id']] = $t;
        }
    }
    $knownIds = array_fill_keys(array_keys($byId), true);
    foreach (normalizeTasks(is_array($dayData['tasks'] ?? null) ? $dayData['tasks'] : [], $knownIds) as $t) {
        if (trim((string)$t['text']) === '' || in_array((string)$t['id'], $deletedIds, true)) continue;
        $byId[(string)$t['id']] = $t;
    }
    foreach ($deletedIds as $id) unset($byId[$id]);

    $tasks = array_values($byId);
    return ['date' => $dateKey, 'tasks' => $tasks, 'totalHours' => calculateTotalHours($tasks)];
}
