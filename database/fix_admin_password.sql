-- Ustaw hasło admin@wtt.pl na admin123 (gdy stary hash w schema nie działał)
-- Uruchom na wybranej bazie: USE twoja_baza; then this file.
-- Hash = bcrypt.hash('admin123', 10)

UPDATE users 
SET password = '$2a$10$mhEATK9CCn6Ixi4d9KmumeAuNvOkQYeya8BeddA4XZEXXfBZCgbu6' 
WHERE email = 'admin@wtt.pl';
