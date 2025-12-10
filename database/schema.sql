-- Work Time Tracker Database Schema
-- Uruchom ten skrypt w MySQL aby utworzyć potrzebne tabele

CREATE DATABASE IF NOT EXISTS wtt CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

USE wtt;

-- Tabela użytkowników
CREATE TABLE IF NOT EXISTS users (
  id INT AUTO_INCREMENT PRIMARY KEY,
  email VARCHAR(255) UNIQUE NOT NULL,
  password VARCHAR(255) NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

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

-- Tabela dni pracy
CREATE TABLE IF NOT EXISTS work_days (
  id INT AUTO_INCREMENT PRIMARY KEY,
  user_id INT NOT NULL,
  client_id INT NULL,
  date DATE NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY unique_user_client_date (user_id, client_id, date),
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  FOREIGN KEY (client_id) REFERENCES clients(id) ON DELETE CASCADE,
  INDEX idx_client (client_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Tabela przedziałów czasowych
CREATE TABLE IF NOT EXISTS time_slots (
  id INT AUTO_INCREMENT PRIMARY KEY,
  work_day_id INT NOT NULL,
  start_time TIME NOT NULL,
  end_time TIME NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  FOREIGN KEY (work_day_id) REFERENCES work_days(id) ON DELETE CASCADE,
  INDEX idx_work_day (work_day_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Tabela zadań
CREATE TABLE IF NOT EXISTS tasks (
  id INT AUTO_INCREMENT PRIMARY KEY,
  work_day_id INT NOT NULL,
  description TEXT NOT NULL,
  assigned_by VARCHAR(255) DEFAULT '',
  status VARCHAR(50) DEFAULT 'do zrobienia',
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  FOREIGN KEY (work_day_id) REFERENCES work_days(id) ON DELETE CASCADE,
  INDEX idx_work_day (work_day_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Migracja: dodaj kolumnę assigned_by jeśli nie istnieje (dla istniejących baz danych)
ALTER TABLE tasks 
ADD COLUMN IF NOT EXISTS assigned_by VARCHAR(255) DEFAULT '' AFTER description;

-- Migracja: dodaj kolumnę status jeśli nie istnieje (dla istniejących baz danych)
ALTER TABLE tasks 
ADD COLUMN IF NOT EXISTS status VARCHAR(50) DEFAULT 'do zrobienia' AFTER assigned_by;

-- Migracja: dodaj tabelę clients jeśli nie istnieje
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

-- Migracja: dodaj kolumnę client_id do work_days jeśli nie istnieje
ALTER TABLE work_days 
ADD COLUMN IF NOT EXISTS client_id INT NULL AFTER user_id;

-- Dodaj foreign key dla client_id jeśli nie istnieje
SET @dbname = DATABASE();
SET @tablename = "work_days";
SET @constraintname = "fk_work_days_client";
SET @preparedStatement = (SELECT IF(
  (
    SELECT COUNT(*) FROM INFORMATION_SCHEMA.TABLE_CONSTRAINTS
    WHERE
      (TABLE_SCHEMA = @dbname)
      AND (TABLE_NAME = @tablename)
      AND (CONSTRAINT_NAME = @constraintname)
  ) > 0,
  "SELECT 'Foreign key already exists.'",
  CONCAT("ALTER TABLE ", @tablename, " ADD FOREIGN KEY (client_id) REFERENCES clients(id) ON DELETE CASCADE")
));
PREPARE alterIfNotExists FROM @preparedStatement;
EXECUTE alterIfNotExists;
DEALLOCATE PREPARE alterIfNotExists;

-- Wstaw domyślnego użytkownika (hasło: admin123)
-- Hash hasła: $2a$10$rOzJqZqZqZqZqZqZqZqZqOqZqZqZqZqZqZqZqZqZqZqZqZqZqZqZq
-- W produkcji użyj bcrypt do hashowania hasła
INSERT INTO users (email, password) 
VALUES ('admin@wtt.pl', '$2a$10$rOzJqZqZqZqZqZqZqZqZqOqZqZqZqZqZqZqZqZqZqZqZqZqZqZqZq')
ON DUPLICATE KEY UPDATE email=email;

