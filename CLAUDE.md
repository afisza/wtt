# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

**Work Time Tracker (WTT)** — Polish-language web app for tracking work hours across multiple clients with tasks, assigners, and attachments. Production URL: https://timer.afisza.com/

## Commands

```bash
npm run dev          # Vite dev server on :5173 (proxies /api → localhost:80/wtt/api)
npm run build        # TypeScript check + Vite production build → dist/
npx tsc --noEmit     # Type-check only (no test framework configured)
```

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

- **Router:** `api/index.php` — maps URL paths to `api/routes/*.php` files
- **Auth:** `api/auth.php` — JWT encode/decode, cookie management, refresh logic
- **Config:** `api/config.php` — JWT secret (auto-generated to `data/.jwt-secret`), rate limiting, `safeUnlink()`, `jsonResponse()`
- **DB:** `api/db.php` — PDO singleton, config from `data/db-config.json`
- **Storage:** Dual-mode — MySQL primary, JSON fallback (`data/*.json`). `isMySQLAvailable()` checks mode.
- **TOTP:** `api/totp.php` — pure-PHP TOTP implementation (RFC 6238, no external deps)

### Database Schema (MySQL)

```
users       → id, email, password, totp_secret
clients     → id, user_id, name, logo, website
assigners   → id, assigner_uid, user_id, name, avatar
work_days   → id, user_id, client_id, date (UNIQUE per user+client+date)
tasks       → id, work_day_id, task_uid, description, assigned_by(JSON), start_time, end_time, status, attachments(JSON)
```

Tables auto-create on first use via `ensureAssignersTable()`, `ensureSchemaColumns()`, etc. No migration tool.

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
- CORS whitelist in `api/index.php` `$allowedOrigins` — must include production domain
- `.htaccess` differs between dev (references `dist/`) and production (flat structure)

## Deployment

Production deploy uses flat structure (no `dist/` prefix). Build process:
1. `npm run build` → creates `dist/`
2. Copy `dist/*` contents to deploy root alongside `api/`, `data/`, `avatars/`
3. Use production `.htaccess` (SPA fallback to `index.html`, not `dist/index.html`)
4. Set `$basePath = '/api'` in `api/index.php` (dev uses `/wtt/api`)

## Files Not to Commit

- `data/db-config.json`, `data/.jwt-secret`, `data/rate-limits/`
- `data/work-time.json`, `data/assigners.json`, `data/clients.json`
- `avatars/` contents, `node_modules/`, `.env*`
