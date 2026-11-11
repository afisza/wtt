<?php
// Testy parsera polecenia usunięcia: `php tests/php/task-uids-test.php` (kod wyjścia 1 = błąd).
require __DIR__ . '/../../api/task-uids.php';

$fail = 0;
function eq($label, $actual, $expected) {
    global $fail;
    if ($actual !== $expected) {
        $fail++;
        echo "FAIL {$label}: got " . var_export($actual, true) . ', expected ' . var_export($expected, true) . "\n";
    }
}

eq('plain', parseDeleteTaskCommand('Usuń zadanie 323525'), ['323525']);
eq('prefix', parseDeleteTaskCommand('usun wtt-323525'), ['323525']);
eq('voice spaced + dot', parseDeleteTaskCommand('Usuń zadanie WTT 323 525.'), ['323525']);
eq('slash', parseDeleteTaskCommand('/usun 323525'), ['323525']);
eq('two', parseDeleteTaskCommand('Skasuj zadania 323525 i wtt-118204'), ['323525', '118204']);
eq('dedupe', parseDeleteTaskCommand('usuń 323525, 323525'), ['323525']);
eq('russian', parseDeleteTaskCommand('Удали задачу 323525'), ['323525']);
eq('short number', parseDeleteTaskCommand('usuń 12345'), null);
eq('not delete', parseDeleteTaskCommand('Dziś 2h przy 323525'), null);
eq('extra words', parseDeleteTaskCommand('usuń zadanie 323525 bo było źle'), null);
eq('time not id', parseDeleteTaskCommand('usuń wpis z 16:00'), null);

echo $fail ? "{$fail} test(s) failed\n" : "All task-uids tests passed\n";
exit($fail ? 1 : 0);
