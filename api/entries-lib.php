<?php
/**
 * Czyste funkcje pomocnicze API wpisów (`/api/v1/entries`) — bez bazy, testowalne z CLI
 * (`php api/tests/entries-lib-test.php`).
 */

const ENTRY_STATUSES = ['wykonano', 'w trakcie', 'zaplanowano', 'do zrobienia', 'anulowane'];

/**
 * Czas trwania w minutach z tekstu: "3h 27min", "3h27m", "3:27", "207", "207 min",
 * "3,5h", "1 godz. 15 min", "2 godziny". Zwraca null, gdy nie da się odczytać.
 */
function parseDurationMinutes($value): ?int {
    if (is_int($value)) return $value > 0 ? $value : null;
    if (is_float($value)) return $value > 0 ? (int)round($value) : null;
    $s = mb_strtolower(trim((string)$value));
    if ($s === '') return null;
    $s = str_replace(',', '.', $s);

    if (preg_match('/^\d+$/', $s)) {
        $m = (int)$s;
        return $m > 0 ? $m : null;
    }
    if (preg_match('/^(\d{1,2}):([0-5]\d)$/', $s, $m)) {
        $total = (int)$m[1] * 60 + (int)$m[2];
        return $total > 0 ? $total : null;
    }

    $total = 0.0;
    $matched = false;
    if (preg_match('/(\d+(?:\.\d+)?)\s*(?:h|godz\w*|hours?|hrs?)(?!\p{L})\.?/u', $s, $m)) {
        $total += (float)$m[1] * 60;
        $matched = true;
    }
    if (preg_match('/(\d+)\s*(?:m|min\w*|minut\w*)(?!\p{L})\.?/u', $s, $m)) {
        $total += (int)$m[1];
        $matched = true;
    }
    if (!$matched) return null;
    $total = (int)round($total);
    return $total > 0 ? $total : null;
}

/** "HH:MM" → minuty od północy; null przy błędnym formacie. "24:00" jest dozwolone jako koniec dnia. */
function timeToMinutes(string $time): ?int {
    if (!preg_match('/^(\d{1,2}):([0-5]\d)$/', trim($time), $m)) return null;
    $h = (int)$m[1];
    $total = $h * 60 + (int)$m[2];
    if ($h > 24 || $total > 1440) return null;
    return $total;
}

function minutesToTime(int $minutes): string {
    return sprintf('%02d:%02d', intdiv($minutes, 60), $minutes % 60);
}

/** Klucz porównania klienta: małe litery, bez protokołu, "www.", ścieżki i spacji brzegowych. */
function normalizeClientKey(string $value): string {
    $v = mb_strtolower(trim($value));
    $v = preg_replace('#^[a-z]+://#', '', $v);
    $v = preg_replace('#^www\.#', '', $v);
    $v = preg_replace('#[/?\#].*$#', '', $v);
    return trim($v);
}

/**
 * Wybiera klienta pasującego do zapytania (id, nazwa albo domena strony).
 *
 * @param array $clients lista ['id'=>..,'name'=>..,'website'=>..]
 * @return array ['match' => ?array, 'candidates' => array]
 *         match = jednoznaczne dopasowanie; candidates = dopasowania przy niejednoznaczności.
 */
function matchClient(array $clients, $query): array {
    if (is_int($query) || (is_string($query) && preg_match('/^\d+$/', trim($query)))) {
        foreach ($clients as $c) {
            if ((int)$c['id'] === (int)$query) return ['match' => $c, 'candidates' => []];
        }
    }
    $q = normalizeClientKey((string)$query);
    if ($q === '') return ['match' => null, 'candidates' => []];

    $keysOf = function (array $c): array {
        $keys = [normalizeClientKey((string)($c['name'] ?? ''))];
        $site = normalizeClientKey((string)($c['website'] ?? ''));
        if ($site !== '') $keys[] = $site;
        // "best-market.pl" pasuje też do klienta o nazwie "Best Market"
        foreach ($keys as $k) {
            $keys[] = preg_replace('/[^\p{L}\p{N}]+/u', '', preg_replace('/\.[a-z]{2,}(\.[a-z]{2,})?$/', '', $k));
        }
        return array_values(array_unique(array_filter($keys, fn($k) => $k !== '')));
    };
    $qLoose = preg_replace('/[^\p{L}\p{N}]+/u', '', preg_replace('/\.[a-z]{2,}(\.[a-z]{2,})?$/', '', $q));

    $exact = [];
    $partial = [];
    foreach ($clients as $c) {
        $keys = $keysOf($c);
        if (in_array($q, $keys, true) || ($qLoose !== '' && in_array($qLoose, $keys, true))) {
            $exact[] = $c;
            continue;
        }
        foreach ($keys as $k) {
            if (($qLoose !== '' && mb_strlen($qLoose) >= 3 && str_contains($k, $qLoose)) || str_contains($k, $q)) {
                $partial[] = $c;
                break;
            }
        }
    }
    if (count($exact) === 1) return ['match' => $exact[0], 'candidates' => []];
    if (count($exact) > 1) return ['match' => null, 'candidates' => $exact];
    if (count($partial) === 1) return ['match' => $partial[0], 'candidates' => []];
    return ['match' => null, 'candidates' => $partial];
}

/**
 * Wylicza godziny nowego wpisu.
 *  - start + end            → bez zmian (end > start);
 *  - start + minutes        → end = start + minutes;
 *  - end + minutes          → start = end − minutes;
 *  - same minutes           → zaraz po ostatnim wpisie tego dnia (albo od $defaultStart).
 *
 * @param int[] $existingEnds końce (w minutach) wpisów z tego dnia
 * @return array ['start'=>'HH:MM','end'=>'HH:MM','minutes'=>int] albo ['error'=>string]
 */
function resolveEntryTimes(?string $start, ?string $end, ?int $minutes, array $existingEnds, string $defaultStart = '08:00'): array {
    $s = $start !== null && $start !== '' ? timeToMinutes($start) : null;
    $e = $end !== null && $end !== '' ? timeToMinutes($end) : null;
    if ($start !== null && $start !== '' && $s === null) return ['error' => 'Nieprawidłowa godzina rozpoczęcia (format HH:MM)'];
    if ($end !== null && $end !== '' && $e === null) return ['error' => 'Nieprawidłowa godzina zakończenia (format HH:MM)'];

    if ($s !== null && $e !== null) {
        if ($minutes !== null && $e - $s !== $minutes) {
            return ['error' => 'Podane godziny nie zgadzają się z czasem trwania'];
        }
    } elseif ($minutes === null) {
        return ['error' => 'Podaj czas trwania (minutes/duration) albo godziny start i end'];
    } elseif ($s !== null) {
        $e = $s + $minutes;
    } elseif ($e !== null) {
        $s = $e - $minutes;
    } else {
        $s = empty($existingEnds) ? timeToMinutes($defaultStart) : max($existingEnds);
        $e = $s + $minutes;
    }

    if ($s < 0) return ['error' => 'Wpis zaczynałby się przed północą'];
    if ($e > 1440) return ['error' => 'Wpis kończyłby się po północy — podaj godzinę rozpoczęcia (start)'];
    if ($e <= $s) return ['error' => 'Godzina zakończenia musi być późniejsza niż rozpoczęcia'];

    return ['start' => minutesToTime($s), 'end' => minutesToTime($e), 'minutes' => $e - $s];
}

/** Data "YYYY-MM-DD" (lub "today"/"dziś"/"yesterday"/"wczoraj") → "YYYY-MM-DD" albo null. */
function resolveEntryDate($value, ?int $now = null): ?string {
    $now = $now ?? time();
    $v = mb_strtolower(trim((string)($value ?? '')));
    if ($v === '' || in_array($v, ['today', 'dziś', 'dzis', 'dzisiaj'], true)) return date('Y-m-d', $now);
    if (in_array($v, ['yesterday', 'wczoraj'], true)) return date('Y-m-d', strtotime('-1 day', $now));
    if (!preg_match('/^(\d{4})-(\d{2})-(\d{2})$/', $v, $m)) return null;
    if (!checkdate((int)$m[2], (int)$m[3], (int)$m[1])) return null;
    return $v;
}
