-- Migracja: dodaj kolumnę website do tabeli clients jeśli nie istnieje
-- Uruchom ten skrypt w phpMyAdmin jeśli kolumna website nie istnieje

USE wtt;

SET @dbname = DATABASE();
SET @tablename = "clients";
SET @columnname = "website";
SET @preparedStatement = (SELECT IF(
  (
    SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS
    WHERE
      (TABLE_SCHEMA = @dbname)
      AND (TABLE_NAME = @tablename)
      AND (COLUMN_NAME = @columnname)
  ) > 0,
  "SELECT 'Column already exists.'",
  CONCAT("ALTER TABLE ", @tablename, " ADD COLUMN ", @columnname, " VARCHAR(500) DEFAULT '' AFTER logo")
));
PREPARE alterIfNotExists FROM @preparedStatement;
EXECUTE alterIfNotExists;
DEALLOCATE PREPARE alterIfNotExists;


