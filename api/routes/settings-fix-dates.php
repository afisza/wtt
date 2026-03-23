<?php
require_once __DIR__ . '/../auth.php';
require_once __DIR__ . '/../db.php';
require_once __DIR__ . '/../storage.php';
require_once __DIR__ . '/../json-helpers.php';

$userId = getUserId();
if (!$userId) {
    http_response_code(401);
    echo json_encode(['error' => 'Unauthorized']);
    exit;
}

if ($method !== 'POST') {
    http_response_code(405);
    echo json_encode(['error' => 'Method not allowed']);
    exit;
}

try {
    $body = json_decode(file_get_contents('php://input'), true);
    $clientId = $body['clientId'] ?? null;

    if (!$clientId) {
        http_response_code(400);
        echo json_encode(['error' => 'clientId is required']);
        exit;
    }

    // Sprawdz czy MySQL jest dostepne
    $cfg = getDbConfig();
    if (!$cfg) {
        http_response_code(500);
        echo json_encode(['error' => 'MySQL configuration not found']);
        exit;
    }

    $pdo = getDb();
    if (!$pdo) {
        http_response_code(500);
        echo json_encode(['error' => 'Database connection failed']);
        exit;
    }

    // Pobierz wszystkie work_days z grudnia 2025 dla danego klienta
    $stmt = $pdo->prepare(
        "SELECT id, date, user_id, client_id
         FROM work_days
         WHERE user_id = ?
         AND client_id = ?
         AND date >= '2025-12-01'
         AND date <= '2025-12-31'
         ORDER BY date ASC"
    );
    $stmt->execute([$userId, $clientId]);
    $workDays = $stmt->fetchAll();

    if (empty($workDays)) {
        echo json_encode([
            'message' => 'No work days found for December 2025',
            'updated' => 0,
        ]);
        exit;
    }

    error_log("[FIX DECEMBER] Found " . count($workDays) . " work days to update");

    $updatedCount = 0;
    $errors = [];

    // Przesun kazdy dzien o 2 dni do przodu
    foreach ($workDays as $workDay) {
        $dateStr = $workDay['date'];
        // Parsuj date
        $parts = explode('-', $dateStr);
        $year = (int)$parts[0];
        $month = (int)$parts[1];
        $day = (int)$parts[2];

        // Nowa data = +2 dni
        $oldTimestamp = mktime(0, 0, 0, $month, $day, $year);
        $newTimestamp = $oldTimestamp + (2 * 86400);
        $newYear = (int)date('Y', $newTimestamp);
        $newMonth = (int)date('n', $newTimestamp);
        $newDay = (int)date('j', $newTimestamp);
        $newDateStr = sprintf('%04d-%02d-%02d', $newYear, $newMonth, $newDay);

        // Sprawdz czy nowa data nie przekracza grudnia 2025
        if ($newMonth !== 12 || $newYear !== 2025) {
            error_log("[FIX DECEMBER] Skipping $dateStr -> $newDateStr (out of December 2025 range)");
            $errors[] = "Date $dateStr would move to $newDateStr (outside December 2025)";
            continue;
        }

        try {
            // Sprawdz czy juz istnieje work_day z nowa data
            $stmt = $pdo->prepare(
                "SELECT id FROM work_days WHERE user_id = ? AND client_id = ? AND date = ?"
            );
            $stmt->execute([$userId, $clientId, $newDateStr]);
            $existing = $stmt->fetchAll();

            if (!empty($existing)) {
                // Jesli istnieje, przenies zadania i time_slots do istniejacego work_day
                $existingWorkDayId = $existing[0]['id'];

                // Przenies zadania
                $stmt = $pdo->prepare("UPDATE tasks SET work_day_id = ? WHERE work_day_id = ?");
                $stmt->execute([$existingWorkDayId, $workDay['id']]);

                // Przenies time_slots
                $stmt = $pdo->prepare("UPDATE time_slots SET work_day_id = ? WHERE work_day_id = ?");
                $stmt->execute([$existingWorkDayId, $workDay['id']]);

                // Usun stary work_day
                $stmt = $pdo->prepare("DELETE FROM work_days WHERE id = ?");
                $stmt->execute([$workDay['id']]);

                error_log("[FIX DECEMBER] Merged $dateStr -> $newDateStr (existing work_day)");
            } else {
                // Zaktualizuj date work_day
                $stmt = $pdo->prepare("UPDATE work_days SET date = ? WHERE id = ?");
                $stmt->execute([$newDateStr, $workDay['id']]);

                error_log("[FIX DECEMBER] Updated $dateStr -> $newDateStr");
            }

            $updatedCount++;
        } catch (Exception $e) {
            error_log("[FIX DECEMBER] Error updating $dateStr: " . $e->getMessage());
            $errors[] = "Error updating $dateStr: " . $e->getMessage();
        }
    }

    $response = [
        'success' => true,
        'message' => "Updated $updatedCount work days",
        'updated' => $updatedCount,
        'total' => count($workDays),
    ];
    if (!empty($errors)) {
        $response['errors'] = $errors;
    }

    echo json_encode($response);

} catch (Exception $e) {
    error_log('[FIX DECEMBER] Error: ' . $e->getMessage());
    http_response_code(500);
    echo json_encode(['error' => 'Internal server error', 'details' => $e->getMessage()]);
}
