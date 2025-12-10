-- Migracja: dodaj tabelę clients i kolumnę client_id do work_days
-- Uruchom ten skrypt jeśli masz już istniejącą bazę danych

USE wtt;

-- Tabela klientów
CREATE TABLE IF NOT EXISTS clients (
  id INT AUTO_INCREMENT PRIMARY KEY,
  user_id INT NOT NULL,
  name VARCHAR(255) NOT NULL,
  logo VARCHAR(500) DEFAULT '',
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  INDEX idx_user (user_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Dodaj kolumnę client_id do work_days
ALTER TABLE work_days 
ADD COLUMN IF NOT EXISTS client_id INT NULL AFTER user_id,
ADD FOREIGN KEY IF NOT EXISTS fk_work_days_client (client_id) REFERENCES clients(id) ON DELETE CASCADE,
ADD INDEX IF NOT EXISTS idx_client (client_id);

-- Dla istniejących rekordów ustaw domyślnego klienta (jeśli potrzebne)
-- Możesz utworzyć domyślnego klienta i zaktualizować istniejące rekordy

