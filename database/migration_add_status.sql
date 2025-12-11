-- Migracja: dodaj kolumnę status do tabeli tasks
-- Uruchom ten skrypt jeśli masz już istniejącą bazę danych

USE wtt;

-- Sprawdź czy kolumna już istnieje i dodaj jeśli nie
SET @dbname = DATABASE();
SET @tablename = "tasks";
SET @columnname = "status";
SET @preparedStatement = (SELECT IF(
  (
    SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS
    WHERE
      (TABLE_SCHEMA = @dbname)
      AND (TABLE_NAME = @tablename)
      AND (COLUMN_NAME = @columnname)
  ) > 0,
  "SELECT 'Column already exists.'",
  CONCAT("ALTER TABLE ", @tablename, " ADD COLUMN ", @columnname, " VARCHAR(50) DEFAULT 'do zrobienia' AFTER assigned_by")
));
PREPARE alterIfNotExists FROM @preparedStatement;
EXECUTE alterIfNotExists;
DEALLOCATE PREPARE alterIfNotExists;

-- Zaktualizuj istniejące rekordy - konwertuj completed na status
UPDATE tasks 
SET status = CASE 
  WHEN completed = 1 THEN 'wykonano'
  WHEN completed = 0 THEN 'do zrobienia'
  ELSE 'do zrobienia'
END
WHERE status IS NULL OR status = '';




