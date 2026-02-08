-- Migracja: dodaj task_uid i attachments do tabeli tasks
-- Uruchom ten skrypt jeśli masz już istniejącą bazę danych.
--
-- WAŻNE: Nie używaj USE nazwa_bazy – skrypt działa na aktualnie wybranej bazie.
-- Przed uruchomieniem:
--   1. Zaloguj się do MySQL (np. jako root lub użytkownik z uprawnieniami do ALTER).
--   2. Wybierz bazę: USE twoja_nazwa_bazy;  (np. USE wtt; albo jak Twoja baza się nazywa)
--   3. Wykonaj ten skrypt (od SET @dbname... w dół).
-- Na drugim serwerze powtórz to samo dla tamtej bazy.

-- task_uid: unikalny 6-cyfrowy identyfikator zadania (tylko cyfry)
SET @dbname = DATABASE();
SET @tablename = "tasks";
SET @columnname = "task_uid";
SET @preparedStatement = (SELECT IF(
  (
    SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS
    WHERE
      (TABLE_SCHEMA = @dbname)
      AND (TABLE_NAME = @tablename)
      AND (COLUMN_NAME = @columnname)
  ) > 0,
  "SELECT 'Column task_uid already exists.'",
  "ALTER TABLE tasks ADD COLUMN task_uid VARCHAR(12) NULL AFTER id"
));
PREPARE alterIfNotExists FROM @preparedStatement;
EXECUTE alterIfNotExists;
DEALLOCATE PREPARE alterIfNotExists;

-- attachments: JSON array of file URLs
SET @columnname = "attachments";
SET @preparedStatement2 = (SELECT IF(
  (
    SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS
    WHERE
      (TABLE_SCHEMA = @dbname)
      AND (TABLE_NAME = @tablename)
      AND (COLUMN_NAME = @columnname)
  ) > 0,
  "SELECT 'Column attachments already exists.'",
  "ALTER TABLE tasks ADD COLUMN attachments JSON NULL AFTER status"
));
PREPARE alterIfNotExists2 FROM @preparedStatement2;
EXECUTE alterIfNotExists2;
DEALLOCATE PREPARE alterIfNotExists2;

-- Indeks dla szybszego wyszukiwania po task_uid (opcjonalnie)
-- CREATE UNIQUE INDEX idx_tasks_task_uid ON tasks(task_uid);
