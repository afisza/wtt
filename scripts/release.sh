#!/usr/bin/env bash
#
# Wydanie nowej wersji Afisza Time Tracker (wzorzec z HR/ATM).
#
#   ./scripts/release.sh [major|minor|patch] [--push]
#
# Bez `--push` skrypt sprawdza jakość, podbija numer i pokazuje, co zrobi — nic nie wysyła.
# Z `--push` tworzy commit, tag `vX.Y.Z` i wypycha oba do `origin`, co uruchamia potok
# `.github/workflows/deploy.yml` (budowanie + wysyłka FTP na timer.afisza.com).
#
# `version.json` zapisujemy PRZED budowaniem, bo Vite wpisuje stempel do paczki (`__APP_BUILD__`).
# Lokalnie to `local-<commit>`; w CI potok nadpisuje go numerem przebiegu.

set -euo pipefail
cd "$(dirname "$0")/.."

BUMP="${1:-patch}"
PUSH="${2:-}"

case "${BUMP}" in
    major | minor | patch) ;;
    *)
        echo "Użycie: $0 [major|minor|patch] [--push]" >&2
        exit 1
        ;;
esac

# ── Stan repozytorium ────────────────────────────────────────────────────────
if [ -n "$(git status --porcelain --untracked-files=no)" ]; then
    echo "✗ Katalog roboczy nie jest czysty. Zatwierdź albo odłóż zmiany przed wydaniem." >&2
    git status --short --untracked-files=no >&2
    exit 1
fi

BRANCH="$(git rev-parse --abbrev-ref HEAD)"
if [ "${BRANCH}" != "main" ]; then
    echo "✗ Wydania robimy z gałęzi main (jesteś na '${BRANCH}')." >&2
    exit 1
fi

CURRENT="$(node -p "require('./package.json').version")"
NEW="$(node -p "
    const [major, minor, patch] = '${CURRENT}'.split('.').map(Number);
    ({ major: [major + 1, 0, 0], minor: [major, minor + 1, 0], patch: [major, minor, patch + 1] })['${BUMP}'].join('.')
")"

echo "Wersja: ${CURRENT} → ${NEW}"
echo

if git rev-parse -q --verify "refs/tags/v${NEW}" >/dev/null; then
    echo "✗ Tag v${NEW} już istnieje." >&2
    exit 1
fi

# ── Lista zmian ──────────────────────────────────────────────────────────────
# Okno „Co nowego” czyta CHANGELOG.md — wydanie bez wpisu pokazałoby poprzednią wersję jako najnowszą.
if ! grep -qE "^## \[${NEW}\]" CHANGELOG.md 2>/dev/null; then
    echo "✗ CHANGELOG.md nie ma sekcji dla v${NEW}." >&2
    echo "  Dopisz na górze:  ## [${NEW}] - $(date +%Y-%m-%d)" >&2
    echo "  a pod nim  ### Tytuł zmiany  i listę punktów — potem zatwierdź i uruchom wydanie ponownie." >&2
    if [ "${SKIP_CHANGELOG_CHECK:-0}" != "1" ]; then
        exit 1
    fi
    echo "  ⚠ SKIP_CHANGELOG_CHECK=1 — wydanie bez wpisu (tylko awaryjnie)." >&2
fi

# ── Sekrety ──────────────────────────────────────────────────────────────────
# Dane dostępowe żyją wyłącznie na serwerze (data/). Śledzony plik z hasłem = stop.
if git ls-files --error-unmatch data/db-config.json >/dev/null 2>&1 \
    || git ls-files --error-unmatch data/.jwt-secret >/dev/null 2>&1; then
    echo "✗ data/db-config.json albo data/.jwt-secret jest śledzony przez git — usuń go z repo (git rm --cached)." >&2
    exit 1
fi

# ── Bramki jakości ───────────────────────────────────────────────────────────
if [ "${SKIP_TYPECHECK:-0}" != "1" ]; then
    echo "→ Typy…"
    npx tsc --noEmit
fi

if [ "${SKIP_TESTS:-0}" != "1" ]; then
    echo "→ Testy…"
    npm run --silent test >/dev/null
fi

if [ "${SKIP_PHP:-0}" != "1" ]; then
    echo "→ PHP…"
    PHP_BIN="${PHP_BIN:-/Applications/MAMP/bin/php/php8.2.20/bin/php}"
    [ -x "${PHP_BIN}" ] || PHP_BIN="php"
    find api -name '*.php' -not -path 'api/vendor/*' -print0 | xargs -0 -n1 "${PHP_BIN}" -l >/dev/null
fi

# ── Stempel wersji ───────────────────────────────────────────────────────────
npm version "${NEW}" --no-git-tag-version >/dev/null
COMMIT="$(git rev-parse --short HEAD)"
cat >version.json <<JSON
{
  "version": "${NEW}",
  "build": "local-${COMMIT}",
  "date": "$(date +%Y-%m-%d)",
  "channel": "stable"
}
JSON

if [ "${SKIP_BUILD:-0}" != "1" ]; then
    echo "→ Budowanie…"
    npm run build >/dev/null
fi

echo
echo "✓ Zapisane: package.json i version.json"
cat version.json
echo

if [ "${PUSH}" != "--push" ]; then
    echo "Nic nie wysłano. Aby wydać naprawdę:"
    echo "  git diff                       # sprawdź zmiany"
    echo "  ./scripts/release.sh ${BUMP} --push"
    echo "(albo cofnij: git checkout -- package.json package-lock.json version.json)"
    exit 0
fi

# ── Wydanie ──────────────────────────────────────────────────────────────────
git add package.json package-lock.json version.json
git commit -m "chore: release v${NEW}"
git tag "v${NEW}"

git push origin main
git push origin "v${NEW}"

echo
echo "✓ Wysłane: v${NEW}."
echo "  Tag uruchamia potok wdrożenia — postęp: gh run watch"
echo "  Po wdrożeniu każdy, kto ma otwartą aplikację, zobaczy okno „Nowa wersja dostępna”."
