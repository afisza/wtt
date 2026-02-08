# ✅ Checklist przed wdrożeniem produkcyjnym

## 🔐 Bezpieczeństwo

### 1. Zmienne środowiskowe
- [ ] Utwórz plik `.env.local` (lub `.env.production`) na serwerze z:
  ```env
  JWT_SECRET=twoj-bardzo-tajny-klucz-minimum-32-znaki-losowe
  NODE_ENV=production
  
  # MySQL Configuration (dane z hostingu)
  DB_HOST=twoj-host-mysql
  DB_PORT=3306
  DB_USER=twoj-uzytkownik-mysql
  DB_PASSWORD=twoje-bardzo-bezpieczne-haslo
  DB_NAME=twoja-nazwa-bazy
  ```

- [ ] **WAŻNE:** Zmień `JWT_SECRET` na losowy, długi ciąg znaków (minimum 32 znaki)
- [ ] **WAŻNE:** Nigdy nie commituj pliku `.env.local` do Git (powinien być w `.gitignore`)

### 2. Cookies i sesje
- ✅ Kod już używa `secure: process.env.NODE_ENV === 'production'` - cookies będą HTTPS w produkcji
- ✅ `sameSite: 'lax'` - poprawne dla większości przypadków
- ✅ `httpOnly: false` - potrzebne dla js-cookie (akceptowalne, jeśli używasz HTTPS)

### 3. Baza danych
- [ ] Upewnij się, że użytkownik MySQL ma odpowiednie uprawnienia:
  ```sql
  GRANT ALL PRIVILEGES ON twoja_baza.* TO 'twoj_uzytkownik'@'%';
  FLUSH PRIVILEGES;
  ```
- [ ] Upewnij się, że host MySQL pozwala na połączenia z IP serwera aplikacji (nie tylko localhost)

## 🗄️ Baza danych MySQL

### 1. Utworzenie struktury
- [ ] Uruchom skrypt SQL na serwerze produkcyjnym:
  ```bash
  mysql -u twoj_uzytkownik -p twoja_baza < database/schema.sql
  ```
  LUB przez phpMyAdmin - skopiuj zawartość `database/schema.sql` i wykonaj

### 2. Migracja danych
- [ ] Uruchom migrację JSON → MySQL przez interfejs aplikacji (Ustawienia → Migracja)
- [ ] Sprawdź czy wszystkie dane zostały zmigrowane:
  - Klienci
  - Dni pracy
  - Zadania
  - Użytkownicy

### 3. Przełączenie trybu
- [ ] W ustawieniach aplikacji przełącz tryb przechowywania na **MySQL**
- [ ] Sprawdź czy aplikacja działa poprawnie z MySQL

## 🚀 Wdrożenie aplikacji

### 1. Build produkcyjny
```bash
npm run build
```

### 2. Uruchomienie
```bash
npm start
```

### 3. Sprawdzenie
- [ ] Logowanie działa
- [ ] Rejestracja nowych użytkowników działa
- [ ] Dodawanie zadań działa
- [ ] Edycja zadań działa
- [ ] Usuwanie zadań działa
- [ ] Dodawanie klientów działa
- [ ] Kalendarz wyświetla dane z MySQL

## 📋 Funkcjonalności do przetestowania

### Autoryzacja
- [x] Logowanie z MySQL ✅
- [x] Rejestracja z MySQL ✅
- [x] Weryfikacja tokenu JWT ✅
- [x] Middleware ochrony tras ✅

### Zadania (Tasks)
- [x] Dodawanie zadań ✅
- [x] Edycja zadań ✅
- [x] Usuwanie zadań ✅
- [x] Wyświetlanie zadań ✅
- [x] Status zadań (wykonano, do zrobienia, zaplanowano) ✅

### Klienci
- [x] Dodawanie klientów ✅
- [x] Edycja klientów ✅
- [x] Usuwanie klientów ✅
- [x] Logo klientów ✅
- [x] Website klientów ✅

### Kalendarz
- [x] Wyświetlanie miesięcy ✅
- [x] Nawigacja między miesiącami ✅
- [x] Wyświetlanie zadań w kalendarzu ✅
- [x] Filtrowanie po klientach ✅

### Ustawienia
- [x] Konfiguracja MySQL ✅
- [x] Przełączanie trybu przechowywania ✅
- [x] Migracja JSON → MySQL ✅
- [x] Informacje o bazie danych ✅

## ⚠️ Potencjalne problemy i rozwiązania

### Problem: Cookies nie działają w produkcji
**Rozwiązanie:** 
- Upewnij się, że używasz HTTPS
- Sprawdź czy `domain` w cookies jest ustawione poprawnie (lub `undefined` dla domeny głównej)
- Sprawdź czy `sameSite: 'lax'` jest odpowiednie dla Twojego przypadku

### Problem: Połączenie z MySQL nie działa
**Rozwiązanie:**
- Sprawdź czy host MySQL pozwala na połączenia z IP serwera aplikacji
- Sprawdź czy port MySQL jest otwarty w firewallu
- Sprawdź czy dane logowania są poprawne
- Sprawdź czy użytkownik MySQL ma odpowiednie uprawnienia

### Problem: Migracja nie działa
**Rozwiązanie:**
- Upewnij się, że wszystkie tabele zostały utworzone
- Sprawdź czy użytkownik MySQL ma uprawnienia CREATE, ALTER, INSERT, UPDATE, DELETE
- Sprawdź logi serwera dla szczegółowych błędów

## 📝 Notatki dla hostingu

### Wymagania serwera
- Node.js 18+ (sprawdź: `node --version`)
- MySQL 5.7+ lub MariaDB 10.3+
- npm lub yarn

### Porty
- Aplikacja Next.js: domyślnie port 3000 (można zmienić przez zmienną środowiskową `PORT`)
- MySQL: port 3306 (lub inny jeśli skonfigurowany)

### Pliki do wgrania
- Wszystkie pliki z katalogu projektu
- **NIE** wgrywaj:
  - `node_modules/` (zostanie zainstalowany przez `npm install`)
  - `.env.local` (utwórz na serwerze)
  - `.next/` (zostanie utworzony przez `npm run build`)

### Komendy na serwerze
```bash
# 1. Zainstaluj zależności
npm install --production

# 2. Zbuduj aplikację
npm run build

# 3. Uruchom aplikację
npm start
```

## ✅ Status gotowości

- [x] Kod obsługuje MySQL ✅
- [x] Logowanie działa z MySQL ✅
- [x] Rejestracja działa z MySQL ✅
- [x] Wszystkie funkcjonalności działają z MySQL ✅
- [x] Migracja JSON → MySQL działa ✅
- [x] Przełączanie trybu działa ✅
- [ ] **DO ZROBIENIA:** Ustaw zmienne środowiskowe na serwerze
- [ ] **DO ZROBIENIA:** Utwórz strukturę bazy danych na serwerze
- [ ] **DO ZROBIENIA:** Uruchom migrację danych
- [ ] **DO ZROBIENIA:** Przetestuj wszystkie funkcjonalności w produkcji

## 🎯 Podsumowanie

**Projekt jest gotowy do wdrożenia produkcyjnego!** 

Wszystkie funkcjonalności działają z MySQL. Musisz tylko:
1. Skonfigurować zmienne środowiskowe na serwerze
2. Utworzyć strukturę bazy danych
3. Uruchomić migrację danych
4. Przetestować w środowisku produkcyjnym

