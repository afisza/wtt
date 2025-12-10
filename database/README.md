# Instalacja bazy danych MySQL

## Opcja 1: Użycie MySQL (Zalecane dla produkcji)

### Krok 1: Utwórz bazę danych

Uruchom skrypt SQL w MySQL:

```bash
mysql -u root -p < database/schema.sql
```

Lub przez phpMyAdmin:
1. Otwórz phpMyAdmin (zwykle http://localhost/phpMyAdmin)
2. Wybierz zakładkę "SQL"
3. Skopiuj zawartość pliku `database/schema.sql`
4. Wklej i wykonaj

### Krok 2: Skonfiguruj zmienne środowiskowe

Utwórz plik `.env.local` w głównym katalogu projektu:

```env
JWT_SECRET=your-secret-key-change-in-production

# MySQL Configuration
DB_HOST=localhost
DB_PORT=3306
DB_USER=root
DB_PASSWORD=root
DB_NAME=wtt
```

**Uwaga:** Dla MAMP domyślne ustawienia to:
- Port: 8889 (lub 3306 jeśli używasz standardowego MySQL)
- User: root
- Password: root

### Krok 3: Zainstaluj zależności

```bash
npm install
```

## Opcja 2: Użycie pliku JSON (Domyślne)

Jeśli nie ustawisz zmiennych środowiskowych dla MySQL, aplikacja automatycznie użyje pliku JSON (`data/work-time.json`).

## Struktura bazy danych

- **users** - użytkownicy systemu
- **work_days** - dni pracy
- **time_slots** - przedziały czasowe dla każdego dnia
- **tasks** - zadania dla każdego dnia

## Domyślny użytkownik

Po uruchomieniu skryptu SQL zostanie utworzony domyślny użytkownik:
- Email: `admin@wtt.pl`
- Hasło: `admin123`



