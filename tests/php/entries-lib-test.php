<?php
// Testy czystych funkcji API wpisów: `php tests/php/entries-lib-test.php` (kod wyjścia 1 = błąd).
date_default_timezone_set('Europe/Warsaw');
require __DIR__ . '/../../api/entries-lib.php';

$fail = 0;
function eq($label, $actual, $expected) {
    global $fail;
    if ($actual !== $expected) {
        $fail++;
        echo "FAIL {$label}: got " . var_export($actual, true) . ', expected ' . var_export($expected, true) . "\n";
    }
}

// parseDurationMinutes
foreach ([
    ['3h 27min', 207], ['3h27m', 207], ['3:27', 207], ['207', 207], ['207 min', 207],
    ['3,5h', 210], ['3.5 h', 210], ['1 godz. 15 min', 75], ['2 godziny', 120], ['45 minut', 45],
    [90, 90], ['', null], ['abc', null], ['0', null], ['0h', null],
] as [$in, $out]) eq("duration " . var_export($in, true), parseDurationMinutes($in), $out);

// times
eq('t2m', timeToMinutes('08:30'), 510);
eq('t2m 24:00', timeToMinutes('24:00'), 1440);
eq('t2m bad', timeToMinutes('25:00'), null);
eq('m2t', minutesToTime(1447 - 7), '24:00');

// resolveEntryTimes
eq('only minutes, empty day', resolveEntryTimes(null, null, 207, []), ['start' => '08:00', 'end' => '11:27', 'minutes' => 207]);
eq('after last entry', resolveEntryTimes(null, null, 60, [600, 750]), ['start' => '12:30', 'end' => '13:30', 'minutes' => 60]);
eq('start+minutes', resolveEntryTimes('09:15', null, 30, []), ['start' => '09:15', 'end' => '09:45', 'minutes' => 30]);
eq('end+minutes', resolveEntryTimes(null, '17:00', 90, []), ['start' => '15:30', 'end' => '17:00', 'minutes' => 90]);
eq('start+end', resolveEntryTimes('10:00', '12:00', null, []), ['start' => '10:00', 'end' => '12:00', 'minutes' => 120]);
eq('mismatch', isset(resolveEntryTimes('10:00', '12:00', 30, [])['error']), true);
eq('past midnight', isset(resolveEntryTimes(null, null, 120, [1380])['error']), true);
eq('no duration', isset(resolveEntryTimes(null, null, null, [])['error']), true);
eq('bad start', isset(resolveEntryTimes('9am', null, 30, [])['error']), true);

// resolveEntryDate
$now = strtotime('2026-11-10 12:00:00');
eq('date today', resolveEntryDate(null, $now), '2026-11-10');
eq('date dziś', resolveEntryDate('dziś', $now), '2026-11-10');
eq('date wczoraj', resolveEntryDate('wczoraj', $now), '2026-11-09');
eq('date iso', resolveEntryDate('2026-02-28', $now), '2026-02-28');
eq('date invalid', resolveEntryDate('2026-02-30', $now), null);

// matchClient
$clients = [
    ['id' => 1, 'name' => 'Best Market', 'website' => 'https://www.best-market.pl/'],
    ['id' => 2, 'name' => 'UTI', 'website' => 'uti.pl'],
    ['id' => 3, 'name' => 'Podolog Kraków', 'website' => ''],
    ['id' => 4, 'name' => 'Podolog Warszawa', 'website' => ''],
];
eq('by domain', matchClient($clients, 'best-market.pl')['match']['id'] ?? null, 1);
eq('by url', matchClient($clients, 'https://best-market.pl/sklep')['match']['id'] ?? null, 1);
eq('by name ci', matchClient($clients, 'best market')['match']['id'] ?? null, 1);
eq('by id', matchClient($clients, '2')['match']['id'] ?? null, 2);
eq('partial unique', matchClient($clients, 'krak')['match']['id'] ?? null, 3);
eq('ambiguous', count(matchClient($clients, 'podolog')['candidates']), 2);
eq('ambiguous no match', matchClient($clients, 'podolog')['match'], null);
eq('none', matchClient($clients, 'xyz-shop.com')['match'], null);

// matchAssigners
$people = ['Alex Shram', 'Alina Kowalska', 'Łukasz Nowak', 'Kiril', 'Anna Maj', 'Anna Zięba'];
eq('assigner full', matchAssigners($people, ['alex shram']), ['names' => ['Alex Shram'], 'unknown' => []]);
eq('assigner first name', matchAssigners($people, 'Alina'), ['names' => ['Alina Kowalska'], 'unknown' => []]);
eq('assigner no diacritics', matchAssigners($people, ['lukasz']), ['names' => ['Łukasz Nowak'], 'unknown' => []]);
eq('assigner ambiguous first', matchAssigners($people, ['Anna']), ['names' => [], 'unknown' => ['Anna']]);
eq('assigner dedupe + unknown', matchAssigners($people, ['Kiril', 'kiril', 'Zenek']), ['names' => ['Kiril'], 'unknown' => ['Zenek']]);
eq('assigner empty', matchAssigners($people, null), ['names' => [], 'unknown' => []]);

echo $fail ? "{$fail} test(s) failed\n" : "All entries-lib tests passed\n";
exit($fail ? 1 : 0);
