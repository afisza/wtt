-- Migracja: dodaj kolumnę assigned_by do tabeli tasks
-- Uruchom ten skrypt jeśli masz już istniejącą bazę danych

USE wtt;

-- Sprawdź czy kolumna już istnieje i dodaj jeśli nie
SET @dbname = DATABASE();
SET @tablename = "tasks";
SET @columnname = "assigned_by";
SET @preparedStatement = (SELECT IF(
  (
    SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS
    WHERE
      (TABLE_SCHEMA = @dbname)
      AND (TABLE_NAME = @tablename)
      AND (COLUMN_NAME = @columnname)
  ) > 0,
  "SELECT 'Column already exists.'",
  CONCAT("ALTER TABLE ", @tablename, " ADD COLUMN ", @columnname, " VARCHAR(255) DEFAULT '' AFTER description")
));
PREPARE alterIfNotExists FROM @preparedStatement;
EXECUTE alterIfNotExists;
DEALLOCATE PREPARE alterIfNotExists;



