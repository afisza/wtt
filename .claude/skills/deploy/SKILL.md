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

Reminder: production uses `$basePath = '/api'` in `api/index.php` (dev uses `/wtt/api`). Do NOT modify this file — just remind the user to verify it's set correctly on the server.

The deploy zip should be saved as `wtt-deploy.zip` in the project root.
