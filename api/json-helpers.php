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

function saveMonthDataJSON(int $userId, string $monthKey, array $daysData, int $clientId): void {
    $file = DATA_DIR . '/work-time.json';
    ensureDataFile($file);
    $data = json_decode(file_get_contents($file), true) ?: [];
    if (!isset($data[$userId])) $data[$userId] = [];
    if (!isset($data[$userId][$clientId])) $data[$userId][$clientId] = [];
    $data[$userId][$clientId][$monthKey] = $daysData;
    file_put_contents($file, json_encode($data, JSON_PRETTY_PRINT | JSON_UNESCAPED_UNICODE));
}
