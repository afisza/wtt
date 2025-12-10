-- Skrypt do sprawdzenia struktury tabel w bazie danych
-- Uruchom ten skrypt w phpMyAdmin aby sprawdzić czy tabele istnieją

USE host142624_wtt;

-- Sprawdź czy tabela tasks istnieje
SHOW TABLES LIKE 'tasks';

-- Sprawdź strukturę tabeli tasks (jeśli istnieje)
DESCRIBE tasks;

-- Sprawdź wszystkie tabele w bazie
SHOW TABLES;

-- Sprawdź kolumny w tabeli tasks
SELECT COLUMN_NAME, DATA_TYPE, IS_NULLABLE, COLUMN_DEFAULT 
FROM INFORMATION_SCHEMA.COLUMNS 
WHERE TABLE_SCHEMA = 'host142624_wtt' 
  AND TABLE_NAME = 'tasks';



