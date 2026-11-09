<?php
/**
 * Lista zmian — wzorzec z HR/ATM.
 *
 *   GET /api/version/changelog?limit=10&offset=0 -> { changelog, format, total, offset, limit, hasMore }
 *
 * Treścią jest `CHANGELOG.md` (Keep a Changelog: `## [x.y.z] - data`, `### tytuł`). Potok wdrożenia
 * kopiuje go do `api/`, bo na serwer jedzie tylko front i API; lokalnie czytamy go z katalogu głównego.
 * Bezpośrednie pobranie `*.md` blokuje `.htaccess`.
 */
require_once __DIR__ . '/../config.php';
require_once __DIR__ . '/../auth.php';

if ($method !== 'GET') {
    jsonResponse(['error' => 'Method not allowed'], 405);
}

if (!getUserId()) {
    jsonResponse(['error' => 'Unauthorized'], 401);
}

$changelogFile = null;
foreach ([__DIR__ . '/../CHANGELOG.md', __DIR__ . '/../../CHANGELOG.md'] as $candidate) {
    if (is_file($candidate)) {
        $changelogFile = $candidate;
        break;
    }
}

$limit  = isset($_GET['limit']) ? max(0, (int)$_GET['limit']) : 20;
$offset = isset($_GET['offset']) ? max(0, (int)$_GET['offset']) : 0;

$content = $changelogFile !== null ? (string)file_get_contents($changelogFile) : '';

// Podział przed każdym nagłówkiem wydania; tekst przed pierwszym to wstęp, nie wpis.
$parts = preg_split('/^(?=## \[)/mu', $content);
$parts = is_array($parts) ? $parts : [];
$preamble = '';
if ($parts !== [] && strncmp($parts[0], '## [', 4) !== 0) {
    $preamble = (string)array_shift($parts);
}

$total = count($parts);
$slice = $limit > 0 ? array_slice($parts, $offset, $limit) : array_slice($parts, $offset);

jsonResponse([
    'changelog' => ($offset === 0 ? $preamble : '') . implode('', $slice),
    'format'    => 'markdown',
    'total'     => $total,
    'offset'    => $offset,
    'limit'     => $limit,
    'hasMore'   => ($offset + count($slice)) < $total,
]);
