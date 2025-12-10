# Work Time Tracker (WTT)

Aplikacja webowa do śledzenia czasu pracy z kalendarzem miesięcznym.

## Funkcje

- 🔐 System logowania z sesją
- 📅 Kalendarz miesięczny z nawigacją
- ⏰ Dodawanie wielu przedziałów czasowych dla każdego dnia
- 📝 Repeater zadań - możliwość dodawania wielu zadań dla każdego dnia
- ✏️ Edytowanie i usuwanie wpisów inline
- 📊 Automatyczne obliczanie godzin pracy
- 💾 Zapisywanie danych w MySQL lub JSON (automatyczny wybór)
- ⚙️ Strona ustawień

## Instalacja

```bash
npm install
```

## Konfiguracja bazy danych

### Opcja 1: MySQL (Zalecane dla produkcji)

1. **Utwórz bazę danych:**
   ```bash
   mysql -u root -p < database/schema.sql
   ```
   
   Lub przez phpMyAdmin - skopiuj zawartość `database/schema.sql` i wykonaj w SQL.

2. **Skonfiguruj zmienne środowiskowe:**
   
   Utwórz plik `.env.local`:
   ```env
   JWT_SECRET=your-secret-key-change-in-production
   
   DB_HOST=localhost
   DB_PORT=3306
   DB_USER=root
   DB_PASSWORD=root
   DB_NAME=wtt
   ```
   
   **Uwaga dla MAMP:**
   - Port MySQL: zwykle `8889` (lub `3306` jeśli używasz standardowego MySQL)
   - User: `root`
   - Password: `root`

### Opcja 2: JSON (Domyślne)

Jeśli nie ustawisz zmiennych środowiskowych MySQL, aplikacja automatycznie użyje pliku JSON (`data/work-time.json`).

## Uruchomienie

```bash
npm run dev
```

Aplikacja będzie dostępna pod adresem: http://localhost:3000

## Domyślne dane logowania

- **Email:** admin@wtt.pl
- **Hasło:** admin123

## Struktura projektu

```
wtt/
├── app/
│   ├── api/
│   │   ├── auth/
│   │   │   ├── login/route.ts
│   │   │   └── verify/route.ts
│   │   └── work-time/route.ts
│   ├── settings/
│   │   └── page.tsx
│   ├── globals.css
│   ├── layout.tsx
│   └── page.tsx
├── components/
│   ├── CalendarTable.tsx
│   ├── LoginForm.tsx
│   ├── TaskList.tsx
│   └── TimeEntry.tsx
├── database/
│   ├── schema.sql
│   └── README.md
├── lib/
│   ├── db.ts
│   └── workTimeDb.ts
├── data/
│   └── work-time.json (tworzy się automatycznie jeśli używasz JSON)
├── middleware.ts
└── package.json
```

## Technologie

- Next.js 14
- React 18
- TypeScript
- MySQL2 (opcjonalnie)
- date-fns
- JWT dla autoryzacji
- Cookies dla sesji

## Uwagi

- Aplikacja automatycznie wykrywa czy używać MySQL czy JSON na podstawie zmiennych środowiskowych
- Jeśli MySQL nie jest dostępny, automatycznie przełącza się na JSON
- W produkcji zalecane jest użycie MySQL
- JWT_SECRET powinien być zmieniony w zmiennych środowiskowych
