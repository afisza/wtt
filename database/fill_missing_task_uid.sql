-- Uzupełnij brakujące task_uid (NULL) unikalnymi 6-cyfrowymi wartościami
--
-- WAŻNE: Nie używaj USE nazwa_bazy – skrypt działa na aktualnie wybranej bazie.
-- Przed uruchomieniem: USE twoja_nazwa_bazy;
--
-- Uruchom raz, gdy część zadań ma task_uid = NULL.

-- Start: maks. istniejący numer + 1 (lub 100000 jeśli brak)
SET @start = 100000;
SELECT COALESCE(MAX(CAST(task_uid AS UNSIGNED)), 0) + 1 INTO @start
FROM tasks
WHERE task_uid IS NOT NULL AND task_uid REGEXP '^[0-9]+$';
SET @start = GREATEST(100000, LEAST(@start, 999999));

-- Nadaj kolejne numery wierszom z task_uid IS NULL (według id)
UPDATE tasks
INNER JOIN (
  SELECT id, (@row := @row + 1) AS rn
  FROM (SELECT id FROM tasks WHERE task_uid IS NULL ORDER BY id) AS t,
       (SELECT @row := 0) AS init
) AS numbered ON tasks.id = numbered.id
SET tasks.task_uid = LPAD(LEAST(999999, @start + numbered.rn - 1), 6, '0');

-- Opcjonalnie: ustaw attachments na [] gdzie NULL (spójność z aplikacją)
UPDATE tasks SET attachments = JSON_ARRAY() WHERE attachments IS NULL;
