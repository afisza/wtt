<?php
require_once __DIR__ . '/../auth.php';
require_once __DIR__ . '/../db.php';
require_once __DIR__ . '/../storage.php';
require_once __DIR__ . '/../json-helpers.php';

$method = $_SERVER['REQUEST_METHOD'];

if ($method === 'GET') {
    handleGet();
} elseif ($method === 'POST') {
    handlePost();
} else {
    http_response_code(405);
    echo json_encode(['error' => 'Method not allowed']);
}

function handleGet(): void {
    $userId = getUserId();
    if (!$userId) {
        http_response_code(401);
        echo json_encode(['error' => 'Unauthorized']);
        return;
    }

    $monthKey = $_GET['month'] ?? date('Y-m');
    $clientId = isset($_GET['clientId']) ? (int)$_GET['clientId'] : null;

    if (!$clientId) {
        http_response_code(400);
        echo json_encode(['error' => 'Client ID is required']);
        return;
    }

    try {
        $monthData = [];

        if (isMySQLAvailable()) {
            try {
                $monthData = getMonthDataMySQL($userId, $monthKey, $clientId);
            } catch (Exception $e) {
                error_log('[GET /api/work-time] MySQL error, falling back to JSON: ' . $e->getMessage());
                $monthData = getMonthDataJSON($userId, $monthKey, $clientId);
            }
        } else {
            $monthData = getMonthDataJSON($userId, $monthKey, $clientId);
        }

        echo json_encode([$monthKey => $monthData]);
    } catch (Exception $e) {
        error_log('Error loading data: ' . $e->getMessage());
        echo json_encode((object)[]);
    }
}

function handlePost(): void {
    $userId = getUserId();
    if (!$userId) {
        http_response_code(401);
        echo json_encode(['error' => 'Unauthorized']);
        return;
    }

    try {
        $workTimeData = json_decode(file_get_contents('php://input'), true);
        if (!$workTimeData) {
            http_response_code(400);
            echo json_encode(['error' => 'Invalid JSON body']);
            return;
        }

        $clientId = $workTimeData['clientId'] ?? null;
        if (!$clientId) {
            http_response_code(400);
            echo json_encode(['error' => 'Client ID is required']);
            return;
        }

        // Remove clientId from data, remaining keys are month keys
        unset($workTimeData['clientId']);

        foreach ($workTimeData as $monthKey => $daysData) {
            if (isMySQLAvailable()) {
                try {
                    saveMonthDataMySQL($userId, $monthKey, $daysData, (int)$clientId);
                } catch (Exception $e) {
                    error_log('[POST /api/work-time] MySQL save failed: ' . $e->getMessage());
                    http_response_code(500);
                    echo json_encode([
                        'error' => 'Zapis do bazy MySQL nie powiodl sie. Sprawdz konfiguracje i tabele.',
                        'details' => $e->getMessage()
                    ]);
                    return;
                }
            }

            // Always save to JSON as fallback/backup
            try {
                saveMonthDataJSON($userId, $monthKey, $daysData, (int)$clientId);
            } catch (Exception $e) {
                error_log('[POST /api/work-time] JSON fallback save failed: ' . $e->getMessage());
                // Don't fail the request if JSON backup fails – MySQL is the primary store
            }
        }

        echo json_encode(['success' => true]);
    } catch (Exception $e) {
        error_log('Error saving data: ' . $e->getMessage());
        http_response_code(500);
        echo json_encode(['error' => 'Failed to save data']);
    }
}

// ── MySQL GET ────────────────────────────────────────────────────────────────

function getMonthDataMySQL(int $userId, string $monthKey, int $clientId): array {
    $pdo = getDb();
    if (!$pdo) return [];

    ensureSchemaColumns($pdo);

    // Collect existing task_uids to avoid collisions when generating new ones
    $existingTaskUids = [];
    try {
        $stmt = $pdo->query("SELECT task_uid FROM tasks WHERE task_uid IS NOT NULL AND task_uid != ''");
        foreach ($stmt->fetchAll() as $row) {
            if ($row['task_uid']) $existingTaskUids[$row['task_uid']] = true;
        }
    } catch (PDOException $e) {
        // task_uid column may not exist in old databases
    }

    $parts = explode('-', $monthKey);
    $year = (int)$parts[0];
    $month = (int)$parts[1];
    $startDate = sprintf('%04d-%02d-01', $year, $month);
    // Last day of month
    $endDate = date('Y-m-t', mktime(0, 0, 0, $month, 1, $year));

    $stmt = $pdo->prepare(
        'SELECT id, date FROM work_days WHERE user_id = ? AND client_id = ? AND date >= ? AND date <= ?'
    );
    $stmt->execute([$userId, $clientId, $startDate, $endDate]);
    $workDays = $stmt->fetchAll();

    $result = [];

    foreach ($workDays as $workDay) {
        $dateKey = formatDateKey($workDay['date']);

        $tasks = fetchTasksForWorkDay($pdo, $workDay['id']);

        // Auto-generate task_uid for tasks missing it
        foreach ($tasks as &$t) {
            if (empty($t['task_uid'])) {
                $generated = generateTaskId($existingTaskUids);
                $existingTaskUids[$generated] = true;
                if (!empty($t['id'])) {
                    try {
                        $pdo->prepare("UPDATE tasks SET task_uid = ?, attachments = COALESCE(attachments, '[]') WHERE id = ?")
                            ->execute([$generated, $t['id']]);
                    } catch (PDOException $e) {
                        try {
                            $pdo->prepare("UPDATE tasks SET task_uid = ? WHERE id = ?")->execute([$generated, $t['id']]);
                        } catch (PDOException $e2) { /* ignore */ }
                    }
                }
                $t['task_uid'] = $generated;
            }
        }
        unset($t);

        // Format tasks and collect intervals for totalHours
        $formattedTasks = [];
        $intervals = [];

        foreach ($tasks as $t) {
            $startTime = $t['start_time'] ? substr((string)$t['start_time'], 0, 5) : '08:00';
            $endTime   = $t['end_time']   ? substr((string)$t['end_time'], 0, 5)   : '16:00';

            // Collect intervals
            $sp = array_map('intval', explode(':', $startTime));
            $ep = array_map('intval', explode(':', $endTime));
            $s = $sp[0] * 60 + ($sp[1] ?? 0);
            $e = $ep[0] * 60 + ($ep[1] ?? 0);
            if ($e > $s) $intervals[] = ['start' => $s, 'end' => $e];

            // Status
            $status = $t['status'] ?? 'do zrobienia';
            if (empty($t['status']) && isset($t['completed'])) {
                $status = ($t['completed'] == 1) ? 'wykonano' : 'do zrobienia';
            }

            // assigned_by normalization
            $assignedBy = parseAssignedBy($t['assigned_by'] ?? '');

            // attachments
            $attachments = parseAttachments($t['attachments'] ?? null);

            $formattedTasks[] = [
                'id'         => (string)($t['task_uid'] ?? ''),
                'text'       => $t['description'] ?? '',
                'assignedBy' => $assignedBy,
                'startTime'  => $startTime,
                'endTime'    => $endTime,
                'status'     => $status,
                'completed'  => ($t['completed'] ?? 0) == 1,
                'attachments'=> $attachments,
            ];
        }

        $totalHours = calculateTotalHoursFromIntervals($intervals);

        $result[$dateKey] = [
            'date'       => $dateKey,
            'tasks'      => $formattedTasks,
            'totalHours' => $totalHours,
        ];
    }

    return $result;
}

// ── MySQL POST ───────────────────────────────────────────────────────────────

function saveMonthDataMySQL(int $userId, string $monthKey, array $daysData, int $clientId): void {
    $pdo = getDb();
    if (!$pdo) throw new Exception('MySQL not available');

    ensureSchemaColumns($pdo);

    foreach ($daysData as $dateKey => $dayData) {
        try {
            $pdo->beginTransaction();

            // Find or create work_day
            $stmt = $pdo->prepare('SELECT id FROM work_days WHERE user_id = ? AND client_id = ? AND date = ?');
            $stmt->execute([$userId, $clientId, $dateKey]);
            $row = $stmt->fetch();

            if ($row) {
                $workDayId = (int)$row['id'];
            } else {
                $stmt = $pdo->prepare('INSERT INTO work_days (user_id, client_id, date) VALUES (?, ?, ?)');
                $stmt->execute([$userId, $clientId, $dateKey]);
                $workDayId = (int)$pdo->lastInsertId();
            }

            // ── Diff/upsert: compare payload vs DB ──────────────────────

            // 0. Clean up zombie tasks (empty/NULL task_uid) – they can't be tracked by upsert
            try {
                $pdo->prepare("DELETE FROM tasks WHERE work_day_id = ? AND (task_uid IS NULL OR task_uid = '')")->execute([$workDayId]);
            } catch (PDOException $e) {
                // ignore – column may not exist yet
            }

            // 1. Fetch existing tasks keyed by task_uid
            $existingByUid = [];
            try {
                $stmt = $pdo->prepare('SELECT id, task_uid FROM tasks WHERE work_day_id = ?');
                $stmt->execute([$workDayId]);
                foreach ($stmt->fetchAll() as $r) {
                    $uid = $r['task_uid'] ?? '';
                    if ($uid !== '') {
                        $existingByUid[$uid] = (int)$r['id'];
                    }
                }
            } catch (PDOException $e) {
                // tasks table may not exist yet – treat as empty
            }

            // 2. Walk payload: UPDATE existing, INSERT new
            $payloadUids = [];
            $tasks = $dayData['tasks'] ?? [];
            foreach ($tasks as $task) {
                $normalized = normalizeSingleTask($task);
                if (empty(trim($normalized['text']))) continue;

                $taskUid = $normalized['id'] ?? '';
                $assignedByJson = (!empty($normalized['assignedBy']) && is_array($normalized['assignedBy']))
                    ? json_encode($normalized['assignedBy']) : '';
                $attachmentsJson = json_encode(is_array($normalized['attachments'] ?? null) ? $normalized['attachments'] : []);
                $taskStatus = $normalized['status'] ?: 'do zrobienia';
                $completed = ($taskStatus === 'wykonano') ? 1 : 0;

                if ($taskUid !== '') {
                    $payloadUids[] = $taskUid;
                }

                if ($taskUid !== '' && isset($existingByUid[$taskUid])) {
                    // UPDATE existing task
                    $stmt = $pdo->prepare(
                        'UPDATE tasks SET description = ?, assigned_by = ?, start_time = ?, end_time = ?, status = ?, completed = ?, attachments = ? WHERE id = ?'
                    );
                    $stmt->execute([
                        $normalized['text'],
                        $assignedByJson,
                        $normalized['startTime'] ?: '08:00',
                        $normalized['endTime'] ?: '16:00',
                        $taskStatus,
                        $completed,
                        $attachmentsJson,
                        $existingByUid[$taskUid],
                    ]);
                } else {
                    // INSERT new task
                    $stmt = $pdo->prepare(
                        'INSERT INTO tasks (work_day_id, task_uid, description, assigned_by, start_time, end_time, status, completed, attachments) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)'
                    );
                    $stmt->execute([
                        $workDayId,
                        $taskUid,
                        $normalized['text'],
                        $assignedByJson,
                        $normalized['startTime'] ?: '08:00',
                        $normalized['endTime'] ?: '16:00',
                        $taskStatus,
                        $completed,
                        $attachmentsJson,
                    ]);
                }
            }

            // 3. DELETE tasks that are in DB but no longer in the payload
            $toDelete = array_diff_key($existingByUid, array_flip($payloadUids));
            if (!empty($toDelete)) {
                $ids = array_values($toDelete);
                $placeholders = implode(',', array_fill(0, count($ids), '?'));
                $pdo->prepare("DELETE FROM tasks WHERE id IN ({$placeholders})")->execute($ids);
            }

            $pdo->commit();
        } catch (Exception $e) {
            if ($pdo->inTransaction()) {
                $pdo->rollBack();
            }
            throw new Exception("Blad zapisu dnia {$dateKey}: " . $e->getMessage(), 0, $e);
        }
    }
}

// ── Helper functions ─────────────────────────────────────────────────────────

function ensureSchemaColumns(PDO $pdo): void {
    try {
        $stmt = $pdo->prepare(
            "SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS
             WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'tasks'
             AND COLUMN_NAME IN ('status', 'task_uid', 'attachments')"
        );
        $stmt->execute();
        $existing = array_column($stmt->fetchAll(), 'COLUMN_NAME');

        if (!in_array('status', $existing)) {
            $pdo->exec("ALTER TABLE tasks ADD COLUMN status VARCHAR(50) DEFAULT 'do zrobienia' AFTER assigned_by");
            $pdo->exec("UPDATE tasks SET status = CASE WHEN completed = 1 THEN 'wykonano' ELSE 'do zrobienia' END WHERE status IS NULL OR status = ''");
        }
        if (!in_array('task_uid', $existing)) {
            $pdo->exec("ALTER TABLE tasks ADD COLUMN task_uid VARCHAR(12) NULL AFTER id");
        }
        if (!in_array('attachments', $existing)) {
            $pdo->exec("ALTER TABLE tasks ADD COLUMN attachments JSON NULL AFTER status");
        }
    } catch (PDOException $e) {
        // table may not exist yet
    }
}

function fetchTasksForWorkDay(PDO $pdo, int $workDayId): array {
    // Try with all columns first, then fallback
    try {
        $stmt = $pdo->prepare(
            'SELECT id, task_uid, description, assigned_by, start_time, end_time, status, completed, attachments FROM tasks WHERE work_day_id = ? ORDER BY created_at'
        );
        $stmt->execute([$workDayId]);
        return $stmt->fetchAll();
    } catch (PDOException $e) {
        // Fallback without task_uid and attachments
        try {
            $stmt = $pdo->prepare(
                'SELECT id, description, assigned_by, start_time, end_time, status, completed FROM tasks WHERE work_day_id = ? ORDER BY created_at'
            );
            $stmt->execute([$workDayId]);
            $rows = $stmt->fetchAll();
            return array_map(function($r) {
                $r['task_uid'] = null;
                $r['attachments'] = null;
                return $r;
            }, $rows);
        } catch (PDOException $e2) {
            // Fallback with minimal columns
            try {
                $stmt = $pdo->prepare(
                    'SELECT description, assigned_by, start_time, end_time, status FROM tasks WHERE work_day_id = ? ORDER BY created_at'
                );
                $stmt->execute([$workDayId]);
                $rows = $stmt->fetchAll();
                return array_map(function($r) {
                    return [
                        'id' => null, 'task_uid' => null, 'attachments' => null,
                        'description' => $r['description'] ?? '',
                        'assigned_by' => $r['assigned_by'] ?? '',
                        'start_time' => $r['start_time'] ?? null,
                        'end_time' => $r['end_time'] ?? null,
                        'status' => $r['status'] ?? 'do zrobienia',
                        'completed' => 0,
                    ];
                }, $rows);
            } catch (PDOException $e3) {
                // Last resort: description only
                try {
                    $stmt = $pdo->prepare('SELECT description FROM tasks WHERE work_day_id = ? ORDER BY created_at');
                    $stmt->execute([$workDayId]);
                    $rows = $stmt->fetchAll();
                    return array_map(function($r) {
                        return [
                            'id' => null, 'task_uid' => null, 'attachments' => null,
                            'description' => $r['description'] ?? '',
                            'assigned_by' => '', 'start_time' => null, 'end_time' => null,
                            'status' => 'do zrobienia', 'completed' => 0,
                        ];
                    }, $rows);
                } catch (PDOException $e4) {
                    return [];
                }
            }
        }
    }
}

function formatDateKey($date): string {
    if ($date instanceof DateTimeInterface) {
        return $date->format('Y-m-d');
    }
    $str = (string)$date;
    $dateKey = substr($str, 0, 10);
    if (preg_match('/^\d{4}-\d{2}-\d{2}$/', $dateKey)) {
        return $dateKey;
    }
    // Try to parse
    $ts = strtotime($str);
    if ($ts !== false) {
        return date('Y-m-d', $ts);
    }
    return $dateKey;
}

function parseAssignedBy($raw): array {
    if (empty($raw)) return [];
    $str = trim((string)$raw);
    if ($str === '') return [];

    if ($str[0] === '[' && substr($str, -1) === ']') {
        $parsed = json_decode($str, true);
        if (is_array($parsed)) {
            return array_values(array_filter(
                array_map(function($v) { return is_string($v) ? trim($v) : (string)$v; }, $parsed),
                function($v) { return $v !== '' && $v !== null; }
            ));
        }
        // JSON parse failed, treat as plain string
        return [$str];
    }
    return [$str];
}

function parseAttachments($raw): array {
    if (empty($raw)) return [];
    if (is_array($raw)) return $raw;
    if (is_string($raw)) {
        $parsed = json_decode($raw, true);
        if (is_array($parsed)) return $parsed;
    }
    return [];
}

function calculateTotalHoursFromIntervals(array $intervals): string {
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

function normalizeSingleTask($task): array {
    if (is_string($task)) {
        return [
            'id' => '', 'text' => $task, 'assignedBy' => [],
            'startTime' => '08:00', 'endTime' => '16:00',
            'status' => 'do zrobienia', 'attachments' => [],
        ];
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

    return [
        'id'          => $task['id'] ?? '',
        'text'        => $task['text'] ?? '',
        'assignedBy'  => $assignedBy,
        'startTime'   => $task['startTime'] ?? '08:00',
        'endTime'     => $task['endTime'] ?? '16:00',
        'status'      => $status,
        'completed'   => ($status === 'wykonano'),
        'attachments' => is_array($task['attachments'] ?? null) ? $task['attachments'] : [],
    ];
}
