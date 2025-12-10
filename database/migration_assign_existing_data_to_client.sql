-- Migracja: Przypisz istniejące dane do domyślnego klienta "Best Market"
-- Uruchom ten skrypt aby zachować wszystkie istniejące dane

USE wtt;

-- 1. Utwórz domyślnego klienta "Best Market" dla każdego użytkownika, który ma dane w work_days
INSERT INTO clients (user_id, name, logo, created_at, updated_at)
SELECT DISTINCT wd.user_id, 'Best Market', '', NOW(), NOW()
FROM work_days wd
LEFT JOIN clients c ON c.user_id = wd.user_id AND c.name = 'Best Market'
WHERE c.id IS NULL
ON DUPLICATE KEY UPDATE name=name;

-- 2. Zaktualizuj wszystkie istniejące work_days, przypisując je do klienta "Best Market"
UPDATE work_days wd
INNER JOIN clients c ON c.user_id = wd.user_id AND c.name = 'Best Market'
SET wd.client_id = c.id
WHERE wd.client_id IS NULL;

-- Sprawdź wyniki
SELECT 
  'Clients created' as info,
  COUNT(*) as count
FROM clients
WHERE name = 'Best Market';

SELECT 
  'Work days assigned' as info,
  COUNT(*) as count
FROM work_days
WHERE client_id IS NOT NULL;

SELECT 
  'Work days without client' as info,
  COUNT(*) as count
FROM work_days
WHERE client_id IS NULL;

