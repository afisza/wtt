-- Skrypt do utworzenia tabeli tasks z kolumną assigned_by
-- Uruchom ten skrypt w phpMyAdmin jeśli tabela tasks nie istnieje

USE host142624_wtt;

-- Utwórz tabelę tasks jeśli nie istnieje
CREATE TABLE IF NOT EXISTS tasks (
  id INT AUTO_INCREMENT PRIMARY KEY,
  work_day_id INT NOT NULL,
  description TEXT NOT NULL,
  assigned_by VARCHAR(255) DEFAULT '',
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX idx_work_day (work_day_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Jeśli tabela już istnieje, dodaj kolumnę assigned_by jeśli nie ma
-- (Ten kod może zwrócić błąd jeśli kolumna już istnieje - to normalne)
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



