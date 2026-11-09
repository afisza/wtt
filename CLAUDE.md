# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

**Work Time Tracker (WTT)** — Polish-language web app for tracking work hours across multiple clients with tasks, assigners, and attachments. Production URL: https://timer.afisza.com/

## Commands

```bash
npm run dev          # Vite dev server on :5173 (proxies /api → localhost:80/wtt/api)
npm run build        # TypeScript check (tsc --noEmit) + Vite production build → dist/
npm run deploy       # build + copy dist/assets → ./assets (flat structure for prod)
npm run preview      # serve built dist/
npm run test         # vitest run (jsdom env, setup: src/test/setup.ts)
npm run test:watch   # vitest in watch mode
npx tsc --noEmit     # type-check only
```

Run a single test file: `npx vitest run path/to/file.test.ts` (or `npx vitest path/...` for watch). Note: Vitest is configured but there are **no test files yet** (only `src/test/setup.ts`), so `npm run test` currently reports "no tests found". There is no ESLint; formatting is Prettier (`.prettierrc`, with `prettier-plugin-tailwindcss`).

MAMP must be running for the PHP API (Apache on :80, MySQL):

```bash
/Applications/MAMP/bin/startApache.sh && /Applications/MAMP/bin/startMysql.sh
```

## Architecture

**Frontend:** React 19 + TypeScript + Vite 6 + Tailwind CSS + ShadCN UI (Radix)
**Backend:** Plain PHP 8.2 REST API (no framework) + MySQL + JSON fallback
**Auth:** JWT (access 1h + refresh 7d) in HttpOnly cookies, optional TOTP 2FA

### Frontend (`src/`)

- **Entry:** `main.tsx` → `App.tsx` (React Router v7: `/` → HomePage, `/settings` → SettingsPage)
- **Core hook:** `hooks/useCalendarData.ts` — manages all work-time state for a month/client. Uses `useRef` + save queue to prevent stale-closure race conditions.
- **Key components:** `CalendarTable` (month view) → `DayRow`/`DayCard` → `TaskList` → `TaskForm`
- **Contexts:** `ThemeContext` (dark/light), `ToastContext` (notifications)
- **Path alias:** `@/*` → `src/*`
- **UI components in `components/ui/`** are ShadCN — don't edit manually, use `npx shadcn-ui@latest add <component>`

### Backend (`api/`)

- **Router:** `api/index.php` — explicit `$routes` array mapping URL paths to `api/routes/*.php` files. A new endpoint needs **both** a route file and an entry in that array (no auto-discovery; unknown path → 404 JSON). Route files dispatch on `$method` themselves.
- **Auth:** `api/auth.php` — JWT via Composer package `firebase/php-jwt` (`api/vendor/`, must be deployed with the API), cookie management, refresh logic; `getUserId()` is the per-route auth check
- **Config:** `api/config.php` — JWT secret (auto-generated to `data/.jwt-secret`), rate limiting, `safeUnlink()`, `jsonResponse()`
- **DB:** `api/db.php` — PDO singleton, config from `data/db-config.json`
- **Storage:** Dual-mode — MySQL primary, JSON fallback (`data/*.json`). `api/storage.php`: `isMySQLAvailable()` returns false if `data/storage-mode.json` says `json` (toggled in Settings via `/settings/storage-mode`) or `data/db-config.json` lacks host/database. JSON read/write helpers live in `api/json-helpers.php`.
- **TOTP:** `api/totp.php` — pure-PHP TOTP implementation (RFC 6238, no external deps)

### Database Schema (MySQL)

```
users       → id, email, password, totp_secret
clients     → id, user_id, name, logo, website
assigners   → id, assigner_uid, user_id, name, avatar
work_days   → id, user_id, client_id, date (UNIQUE per user+client+date)
tasks       → id, work_day_id, task_uid, description, assigned_by(JSON), start_time, end_time, status, attachments(JSON)
```

Tables auto-create on first use via `ensureAssignersTable()`, `ensureSchemaColumns()`, etc. No migration tool — `database/*.sql` holds the base schema (`schema.sql`, `full_setup.sql`) and historical one-off migrations applied by hand.

### Data Flow (Save)

```
TaskList.onUpdate(tasks) → updateDayData(date, {tasks})
  → reads daysDataRef.current (not stale closure)
  → optimistic update: ref + setState
  → saveData() queued via saveQueueRef (serialized, no concurrent POSTs)
    → POST /api/work-time with entire month
    → Backend: per-day transaction, upsert by task_uid, delete removed tasks
    → JSON fallback always written
```

## Key Conventions

- Comments and UI text are in **Polish**
- Variables/functions in English
- Task IDs: 6+ digit numeric strings generated via `crypto.getRandomValues()`
- Assigners auto-migrate from JSON to MySQL on first GET per user
- All API endpoints require auth except `/auth/login`, `/auth/register`
- CORS whitelist in `api/index.php` `$allowedOrigins` — currently allows `:5173` (default Vite) but **not** `:8080`. If you start Vite on a non-default port (e.g. via the `/app` skill), add it here or preflight will 403.
- `.htaccess` differs between dev (references `dist/`) and production (flat structure)
- PDF report (`src/components/calendar/PdfExportButton.tsx`) hard-truncates the task description to 100 chars (`task.text.substring(0, 97) + '...'`) — not driven by autoTable layout. Touch this constant if reports look truncated.

## Deployment

Production deploy uses flat structure (no `dist/` prefix). Build process:

1. `npm run build` → creates `dist/`
2. Copy `dist/*` contents to deploy root alongside `api/`, `data/`, `avatars/`
3. Use production `.htaccess` (SPA fallback to `index.html`, not `dist/index.html`)
4. Set `$basePath = '/api'` in `api/index.php` (dev uses `/wtt/api`)

## AI Tool Configs

- **CLAUDE.md** (this file) is the authoritative source for Claude Code
- `.cursorrules` exists but is **outdated** — references Next.js (project migrated to Vite). Do not rely on it.
- `README.md` is also **outdated** — describes the pre-migration Next.js stack (port 3000, `.env.local` with `DB_*`, hardcoded `admin@wtt.pl/admin123`). None of that applies; DB is configured at runtime via `data/db-config.json`.
- `MIGRATION_ANALYSIS.md` and `PRODUCTION_CHECKLIST.md` document the Next.js → Vite migration and prod-go-live items respectively.

### Project-local Claude Code config

- `.claude/settings.json` registers a `PostToolUse` hook that runs `npx prettier --write` on every file Write/Edit. Edits may come back reformatted — that's the hook, not a different change.
- `.claude/skills/deploy/SKILL.md` (`/deploy`) — user-invoked: builds and packages `wtt-deploy.zip` for production.
- `.claude/skills/verify/SKILL.md` (`/verify`) — type-check + production build sanity pass.

## Files Not to Commit

- `data/db-config.json`, `data/.jwt-secret`, `data/rate-limits/`
- `data/work-time.json`, `data/assigners.json`, `data/clients.json`
- `avatars/` contents, `node_modules/`, `.env*`
