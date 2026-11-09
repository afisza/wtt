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

Run a single test file: `npx vitest run path/to/file.test.ts` (or `npx vitest path/...` for watch). There is no ESLint; formatting is Prettier (`.prettierrc`, with `prettier-plugin-tailwindcss`).

MAMP must be running for the PHP API (Apache on :80, MySQL):

```bash
/Applications/MAMP/bin/startApache.sh && /Applications/MAMP/bin/startMysql.sh
```

- Dev API base is `/wtt/api` but the repo folder is `wtt (timer.afisza.com)` → locally `htdocs/wtt` is a symlink to it.
- Start Vite with `--host localhost` (CSRF origin check rejects `127.0.0.1`).
- **`data/db-config.json` points at the remote (production) MySQL on hostido** — local testing writes to prod data.
  Use a throwaway account for tests or switch the config to a local DB first.

## Architecture

**Frontend:** React 19 + TypeScript + Vite 6 + Tailwind CSS + ShadCN UI (Radix)
**Backend:** Plain PHP 8.2 REST API (no framework) + MySQL + JSON fallback
**Auth:** JWT (access 1h + refresh 7d) in HttpOnly cookies, optional TOTP 2FA

### Frontend (`src/`)

- **Entry:** `main.tsx` → `App.tsx` (React Router v7: `/` → HomePage, `/settings` → SettingsPage)
- **Core hook:** `hooks/useCalendarData.ts` — manages all work-time state for a month/client. Uses `useRef` + save queue to prevent stale-closure race conditions.
- **Key components:** `CalendarTable` (list view) → `DayRow` → `TaskList` → `TaskForm`
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

### Data Flow (Save) — "no lost content" design

```
TaskList.onUpdate(updater) → updateDayData(date, updater)   (hooks/useCalendarData.ts)
  → optimistic commit to ref + state
  → recordChange() into the OUTBOX (localStorage `wtt:outbox:v1:{clientId}`, per-day rev + deletedIds)
  → flush (debounced 350 ms, serialized, retry backoff 2/5/10/30/60 s, keepalive flush on pagehide)
    → POST /api/work-time with ONLY the changed days: {month: {date: {tasks, deletedIds}}}
    → Backend upserts by task_uid and deletes ONLY ids listed in deletedIds (never "absent = deleted")
  → ackDays(): a day leaves the outbox only if the server confirmed that exact rev
On load the outbox is overlaid on server data, so reloads / expired sessions / offline never drop edits.
```

- **`src/lib/api.ts`** — use `apiFetch`/`apiJson` for every API call (never raw `fetch`): on 401 it does a single-flight
  `/api/auth/refresh` and retries; if refresh fails it emits `wtt:session-expired` → `SessionGuard` shows an inline
  re-login dialog over the app (state is kept). The backend rotates the refresh token on each refresh (sliding 7 d).
- **`src/lib/drafts.ts`** — open forms (add/edit/inline edit) persist to `wtt:draft:v1:{clientId}:{date}:{id}`
  (45-day TTL) via `useDraft`; drafts are cleared only on save or explicit "Odrzuć".
- **`src/lib/saveStatus.ts`** — global save state shown by `SaveIndicator` in the header.
- Tests for this logic: `src/lib/*.test.ts` (`npm run test`).

### Views & design system

- Calendar views (`src/components/views/`): list (`DayRow`), week, month grid, Kanban (drag = change status);
  `DayPanel` is the side sheet used by month/Kanban. Keys `1–4` switch views; drag & drop via `hooks/useTaskDrop.ts`.
- Colors are OKLCH tokens in `src/index.css` (`--background`, `--highlight` = peach accent, `--st-*` statuses, …)
  consumed by Tailwind as `oklch(var(--x) / <alpha-value>)`. Use token classes (`bg-card`, `text-highlight-ink`,
  `text-status-done`), not raw hex / Tailwind palette colors. Fonts: Bricolage Grotesque (display) + Figtree.
  Design context lives in `.impeccable.md`. `var(--app-*)` are legacy aliases kept for old components.
- PDF export lazy-loads jsPDF + the Roboto font on click (keeps the main bundle small).

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
