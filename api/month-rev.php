<?php
/**
 * „Odcisk” danych miesiąca jednego klienta (hash zadań). Zwracany przez GET /api/work-time (pole `rev`)
 * i GET /api/work-time/rev — otwarta aplikacja porównuje go, by wykryć zmiany z zewnątrz (bot Telegram, API).
 */
require_once __DIR__ . '/db.php';
require_once __DIR__ . '/storage.php';
require_once __DIR__ . '/json-helpers.php';

function workTimeMonthRev(int $userId, string $monthKey, int $clientId): string {
    if (isMySQLAvailable() && ($pdo = getDb())) {
        $start = $monthKey . '-01';
        $end = date('Y-m-t', strtotime($start));
        $stmt = $pdo->prepare(
            'SELECT wd.date, t.task_uid, t.description, t.assigned_by, t.start_time, t.end_time, t.status, t.attachments
             FROM tasks t
             JOIN work_days wd ON wd.id = t.work_day_id
             WHERE wd.user_id = ? AND wd.client_id = ? AND wd.date BETWEEN ? AND ?
             ORDER BY t.id'
        );
        $stmt->execute([$userId, $clientId, $start, $end]);
        return md5(json_encode($stmt->fetchAll(PDO::FETCH_NUM), JSON_UNESCAPED_UNICODE));
    }
    return md5(json_encode(getMonthDataJSON($userId, $monthKey, $clientId), JSON_UNESCAPED_UNICODE));
}
