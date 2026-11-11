<?php
/**
 * Numery zadań (tasks.task_uid) — w aplikacji widoczne jako „WTT-323525”, używane m.in. przez bota Telegram.
 */
require_once __DIR__ . '/json-helpers.php';

const TASK_UID_BACKFILL_FLAG = '/task-uid-backfill-v1.done';

/**
 * Jednorazowo nadaje numer zadaniom, które go nie mają, i rozdziela powielone numery
 * (zostawia go najstarszemu wierszowi, kolejne dostają nowe). Po sukcesie zapisuje znacznik
 * w data/, więc kolejne wywołania nic nie robią. Bezpieczne przy równoległych żądaniach (flock).
 *
 * @return array{missing:int, duplicates:int}|null null = już wykonane / brak bazy
 */
function backfillTaskUids(PDO $pdo): ?array {
    $flag = DATA_DIR . TASK_UID_BACKFILL_FLAG;
    if (is_file($flag)) return null;
    if (!is_dir(DATA_DIR)) @mkdir(DATA_DIR, 0755, true);
    $lock = @fopen($flag . '.lock', 'c');
    if (!$lock || !flock($lock, LOCK_EX | LOCK_NB)) return null; // inne żądanie właśnie to robi
    try {
        if (is_file($flag)) return null;

        $used = [];
        foreach ($pdo->query("SELECT task_uid FROM tasks WHERE task_uid IS NOT NULL AND task_uid <> ''")->fetchAll(PDO::FETCH_COLUMN) as $uid) {
            $used[(string)$uid] = true;
        }
        $update = $pdo->prepare('UPDATE tasks SET task_uid = ? WHERE id = ?');

        // 1. Zadania bez numeru
        $missing = 0;
        foreach ($pdo->query("SELECT id FROM tasks WHERE task_uid IS NULL OR task_uid = '' ORDER BY id")->fetchAll(PDO::FETCH_COLUMN) as $id) {
            $uid = generateTaskId($used);
            $used[$uid] = true;
            $update->execute([$uid, (int)$id]);
            $missing++;
        }

        // 2. Powielone numery — najstarszy wiersz zachowuje numer
        $duplicates = 0;
        $dupUids = $pdo->query("SELECT task_uid FROM tasks WHERE task_uid <> '' GROUP BY task_uid HAVING COUNT(*) > 1")->fetchAll(PDO::FETCH_COLUMN);
        $rowsOf = $pdo->prepare('SELECT id FROM tasks WHERE task_uid = ? ORDER BY id');
        foreach ($dupUids as $dupUid) {
            $rowsOf->execute([(string)$dupUid]);
            $ids = $rowsOf->fetchAll(PDO::FETCH_COLUMN);
            array_shift($ids);
            foreach ($ids as $id) {
                $uid = generateTaskId($used);
                $used[$uid] = true;
                $update->execute([$uid, (int)$id]);
                $duplicates++;
            }
        }

        $result = ['missing' => $missing, 'duplicates' => $duplicates];
        file_put_contents($flag, json_encode($result + ['at' => date('c')]) . "\n");
        if ($missing || $duplicates) error_log("[task-uids] backfill: {$missing} bez numeru, {$duplicates} powielonych");
        return $result;
    } catch (Throwable $e) {
        error_log('[task-uids] backfill failed: ' . $e->getMessage());
        return null;
    } finally {
        flock($lock, LOCK_UN);
        fclose($lock);
    }
}

/**
 * Wyciąga numery zadań z polecenia usunięcia, np. „usuń zadanie WTT-323525”, „skasuj 323 525 i wtt 118 204”.
 * Zwraca null, gdy wiadomość nie jest takim poleceniem (wtedy zajmuje się nią Claude).
 */
function parseDeleteTaskCommand(string $text): ?array {
    $t = mb_strtolower(trim($text));
    $verbs = ['usuń', 'usun', 'skasuj', 'wykasuj', 'delete', 'remove', 'удали', 'удалить', 'видали', 'видалити'];
    $filler = ['zadanie', 'zadania', 'zadań', 'zadan', 'wpis', 'wpisy', 'wpisu', 'task', 'tasks', 'entry', 'entries',
        'nr', 'numer', 'numery', 'i', 'oraz', 'and', 'wtt', 'задачу', 'задачи', 'запись', 'записи', 'и', 'та', 'і'];

    // Numery: cyfry rozdzielone spacjami/kropkami/myślnikami (typowe dla transkrypcji) → jeden numer
    $ids = [];
    $rest = preg_replace_callback('/(?:wtt[\s.-]*|#)?(\d[\d\s.-]*\d|\d)/u', function ($m) use (&$ids) {
        $digits = preg_replace('/\D/', '', $m[1]);
        $ids[] = $digits;
        return ' ';
    }, $t);
    if (!$ids) return null;
    foreach ($ids as $id) {
        if (strlen($id) < 6 || strlen($id) > 12) return null;
    }

    // Pierwsze słowo = czasownik usuwania, reszta wyłącznie słowa-wypełniacze
    $words = preg_split('/[^\p{L}]+/u', $rest, -1, PREG_SPLIT_NO_EMPTY);
    if (!$words || !in_array($words[0], $verbs, true)) return null;
    foreach (array_slice($words, 1) as $w) {
        if (!in_array($w, $filler, true)) return null;
    }
    return array_values(array_unique($ids));
}
