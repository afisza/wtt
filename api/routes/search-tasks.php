<?php
require_once __DIR__ . '/../auth.php';
require_once __DIR__ . '/../db.php';
require_once __DIR__ . '/../storage.php';
require_once __DIR__ . '/../json-helpers.php';

mb_internal_encoding('UTF-8');

$method = $_SERVER['REQUEST_METHOD'];

if ($method === 'GET') {
    handleGet();
} else {
    http_response_code(405);
    echo json_encode(['error' => 'Method not allowed']);
}

/**
 * Normalize search query to UTF-8 (fixes Cyrillic etc. when server passes wrong encoding).
 */
function normalizeSearchQuery(string $raw): string {
    $s = trim($raw);
    if ($s === '') return '';
    if (mb_check_encoding($s, 'UTF-8')) return $s;
    $converted = @mb_convert_encoding($s, 'UTF-8', 'ISO-8859-1');
    return $converted !== false ? $converted : $s;
}

/**
 * Get 'q' from raw query string so URL decoding is done with UTF-8 (Cyrillic-safe).
 */
function getSearchQueryFromRequest(): string {
    $uri = $_SERVER['REQUEST_URI'] ?? '';
    $raw = parse_url($uri, PHP_URL_QUERY);
    if ($raw !== null && $raw !== '' && preg_match('/[?&]q=([^&]*)/', '&' . $raw, $m)) {
        $decoded = rawurldecode($m[1]);
        return normalizeSearchQuery($decoded);
    }
    return normalizeSearchQuery((string)($_GET['q'] ?? ''));
}

function handleGet(): void {
    $userId = getUserId();
    if (!$userId) {
        http_response_code(401);
        echo json_encode(['error' => 'Unauthorized']);
        return;
    }

    $queryText = getSearchQueryFromRequest();
    $clientId = $_GET['clientId'] ?? null;

    if (trim($queryText) === '') {
        echo json_encode(['results' => []]);
        return;
    }

    if (!$clientId) {
        http_response_code(400);
        echo json_encode(['error' => 'clientId is required']);
        return;
    }

    $results = [];

    if (getStorageMode() === 'mysql') {
        try {
            $results = searchMySQL($userId, (int)$clientId, $queryText);
        } catch (Exception $e) {
            error_log('[SEARCH] MySQL search error: ' . $e->getMessage());
            http_response_code(500);
            echo json_encode(['error' => 'Search error']);
            return;
        }
    } else {
        try {
            $results = searchJSON($userId, (int)$clientId, $queryText);
        } catch (Exception $e) {
            error_log('[SEARCH] JSON search error: ' . $e->getMessage());
            http_response_code(500);
            echo json_encode(['error' => 'Search error']);
            return;
        }
    }

    echo json_encode(['results' => $results]);
}

/**
 * Search tasks for one client. Searches ALL months (no date filter).
 * Matching: description and assigned_by (LIKE %query%); case-insensitive follow-up in PHP.
 */
function searchMySQL(int $userId, int $clientId, string $queryText): array {
    $pdo = getDb();
    if (!$pdo) return [];

    $pdo->exec("SET NAMES 'utf8mb4' COLLATE 'utf8mb4_unicode_ci'");
    $searchPattern = '%' . $queryText . '%';
    $results = [];

    $likeCollate = " COLLATE utf8mb4_unicode_ci LIKE ?";
    // Try with task_uid and attachments columns first
    try {
        $stmt = $pdo->prepare(
            "SELECT
                t.id,
                t.task_uid,
                t.description,
                t.assigned_by,
                t.attachments,
                COALESCE(t.start_time, '08:00:00') as start_time,
                COALESCE(t.end_time, '16:00:00') as end_time,
                COALESCE(t.status, 'do zrobienia') as status,
                wd.date,
                wd.user_id,
                wd.client_id
            FROM tasks t
            INNER JOIN work_days wd ON t.work_day_id = wd.id
            WHERE wd.user_id = ?
                AND wd.client_id = ?
                AND (
                    t.description" . $likeCollate . "
                    OR t.assigned_by" . $likeCollate . "
                )
            ORDER BY wd.date DESC, COALESCE(t.start_time, '08:00:00') ASC
            LIMIT 100"
        );
        $stmt->execute([$userId, $clientId, $searchPattern, $searchPattern]);
        $tasks = $stmt->fetchAll();
    } catch (PDOException $e) {
        if (strpos($e->getMessage(), 'Unknown column') !== false ||
            (isset($e->errorInfo[1]) && $e->errorInfo[1] == 1054)) {
            // Fallback without task_uid and attachments
            $stmt = $pdo->prepare(
                "SELECT
                    t.id,
                    t.description,
                    t.assigned_by,
                    COALESCE(t.start_time, '08:00:00') as start_time,
                    COALESCE(t.end_time, '16:00:00') as end_time,
                    COALESCE(t.status, 'do zrobienia') as status,
                    wd.date,
                    wd.user_id,
                    wd.client_id
                FROM tasks t
                INNER JOIN work_days wd ON t.work_day_id = wd.id
                WHERE wd.user_id = ? AND wd.client_id = ?
                AND (t.description" . $likeCollate . " OR t.assigned_by" . $likeCollate . ")
                ORDER BY wd.date DESC, COALESCE(t.start_time, '08:00:00') ASC
                LIMIT 100"
            );
            $stmt->execute([$userId, $clientId, $searchPattern, $searchPattern]);
            $tasks = $stmt->fetchAll();
            // Add null columns
            $tasks = array_map(function($t) {
                $t['task_uid'] = null;
                $t['attachments'] = null;
                return $t;
            }, $tasks);
        } else {
            throw $e;
        }
    }

    $queryLower = mb_strtolower(trim($queryText));

    foreach ($tasks as $task) {
        // Parse assigned_by
        $assignedBy = parseAssignedByField($task['assigned_by'] ?? '');

        // Additional server-side filtering for accuracy (mb_* for Cyrillic/Unicode)
        $taskText = mb_strtolower((string)($task['description'] ?? ''));
        $assignedByStr = mb_strtolower(implode(' ', $assignedBy));
        $matchesText = mb_strpos($taskText, $queryLower) !== false;
        $matchesAssignedBy = mb_strpos($assignedByStr, $queryLower) !== false;

        if (!$matchesText && !$matchesAssignedBy) {
            $assignedByRaw = mb_strtolower((string)($task['assigned_by'] ?? ''));
            if (mb_strpos($assignedByRaw, $queryLower) === false) {
                continue;
            }
        }

        // Format time
        $startTime = $task['start_time'] ? substr((string)$task['start_time'], 0, 5) : '08:00';
        $endTime   = $task['end_time']   ? substr((string)$task['end_time'], 0, 5)   : '16:00';

        // Format date
        $dateKey = formatDateKeySearch($task['date']);

        // Attachments
        $attachments = [];
        if (!empty($task['attachments'])) {
            $a = is_string($task['attachments']) ? json_decode($task['attachments'], true) : $task['attachments'];
            if (is_array($a)) $attachments = $a;
        }

        $results[] = [
            'date' => $dateKey,
            'task' => [
                'id'         => $task['task_uid'] ? (string)$task['task_uid'] : (string)($task['id'] ?? ''),
                'text'       => $task['description'] ?? '',
                'assignedBy' => $assignedBy,
                'startTime'  => $startTime,
                'endTime'    => $endTime,
                'status'     => $task['status'] ?? 'do zrobienia',
                'attachments'=> $attachments,
            ],
        ];
    }

    return $results;
}

function searchJSON(int $userId, int $clientId, string $queryText): array {
    $file = DATA_DIR . '/work-time.json';
    if (!file_exists($file)) return [];

    $workTimeData = json_decode(file_get_contents($file), true);
    if (!$workTimeData) return [];

    $userData = $workTimeData[$userId] ?? $workTimeData[(string)$userId] ?? null;
    if (!$userData) return [];

    $clientData = $userData[$clientId] ?? $userData[(string)$clientId] ?? null;
    if (!$clientData) return [];

    $queryLower = mb_strtolower(trim($queryText));
    $results = [];

    foreach ($clientData as $monthKey => $monthData) {
        if (!$monthData || !is_array($monthData)) continue;
        if (!preg_match('/^\d{4}-\d{2}$/', $monthKey)) continue;

        foreach ($monthData as $dateKey => $dayData) {
            if (!$dayData || !is_array($dayData)) continue;
            if (!preg_match('/^\d{4}-\d{2}-\d{2}$/', $dateKey)) continue;
            if (empty($dayData['tasks']) || !is_array($dayData['tasks'])) continue;

            foreach ($dayData['tasks'] as $task) {
                $taskText = mb_strtolower((string)($task['text'] ?? ''));
                $assignedByArray = is_array($task['assignedBy'] ?? null)
                    ? $task['assignedBy']
                    : (!empty($task['assignedBy']) ? [$task['assignedBy']] : []);
                $assignedByStr = mb_strtolower(implode(' ', array_filter($assignedByArray, function($v) {
                    return $v !== null && $v !== '';
                })));

                if (mb_strpos($taskText, $queryLower) !== false || mb_strpos($assignedByStr, $queryLower) !== false) {
                    $results[] = [
                        'date' => $dateKey,
                        'task' => [
                            'text'       => $task['text'] ?? '',
                            'assignedBy' => array_values(array_filter(
                                array_map('strval', $assignedByArray),
                                function($v) { return $v !== ''; }
                            )),
                            'startTime'  => $task['startTime'] ?? '08:00',
                            'endTime'    => $task['endTime'] ?? '16:00',
                            'status'     => $task['status'] ?? 'do zrobienia',
                        ],
                    ];
                }
            }
        }
    }

    return $results;
}

function parseAssignedByField(string $raw): array {
    $str = trim($raw);
    if ($str === '') return [];

    if (strlen($str) >= 2 && $str[0] === '[' && substr($str, -1) === ']') {
        $parsed = json_decode($str, true);
        if (is_array($parsed)) {
            return array_values(array_filter(
                array_map(function($v) {
                    if ($v === null) return '';
                    return trim((string)$v);
                }, $parsed),
                function($v) { return $v !== ''; }
            ));
        }
        // JSON parse failed
        return [$str];
    }
    return [$str];
}

function formatDateKeySearch($date): string {
    if ($date instanceof DateTimeInterface) {
        return $date->format('Y-m-d');
    }
    $str = (string)$date;
    return substr($str, 0, 10);
}
