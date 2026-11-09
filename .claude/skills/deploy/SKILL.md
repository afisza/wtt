---
name: deploy
description: Build the project and package a production deploy zip. User-invoked only.
disable-model-invocation: true
---

Build and package the WTT app for production deployment:

1. Run `npm run build` to create the `dist/` output
2. Create a deploy zip containing:
   - `dist/assets/*` → `assets/` (flat, no dist prefix)
   - `dist/index.html` → `index.html`
   - `api/` directory (excluding `api/vendor/` if large — user can run `composer install` on server)
   - Production `.htaccess` (SPA fallback to `index.html`, not `dist/index.html`)

Note: `api/index.php` derives `$basePath` automatically (`/wtt/api` locally, `/api` in prod). Use `deploy/htaccess.production` as the zip's `.htaccess`. Preferred path is `./scripts/release.sh` + GitHub Actions (see CLAUDE.md); this zip is the manual fallback.

The deploy zip should be saved as `wtt-deploy.zip` in the project root.
