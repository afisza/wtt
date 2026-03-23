<?php
require_once __DIR__ . '/../config.php';

$method = $_SERVER['REQUEST_METHOD'];

$assignersFile = DATA_DIR . '/assigners.json';

// Upewnij się, że plik istnieje
if (!is_dir(DATA_DIR)) {
    mkdir(DATA_DIR, 0755, true);
}
if (!file_exists($assignersFile)) {
    file_put_contents($assignersFile, '[]');
}

// ── GET - Pobierz wszystkich zleceniodawców ──────────────────────────────────
if ($method === 'GET') {
    try {
        $content   = file_get_contents($assignersFile);
        $assigners = $content ? json_decode($content, true) : [];
        if (!is_array($assigners)) $assigners = [];
        jsonResponse($assigners);
    } catch (Exception $e) {
        jsonResponse(['error' => 'Błąd podczas pobierania zleceniodawców', 'details' => $e->getMessage()], 500);
    }
}

// ── POST - Utwórz nowego zleceniodawcę ──────────────────────────────────────
if ($method === 'POST') {
    try {
        $body = getJsonInput();
        $name   = $body['name'] ?? '';
        $avatar = $body['avatar'] ?? null;

        if (!$name || trim($name) === '') {
            jsonResponse(['error' => 'Nazwa jest wymagana'], 400);
        }

        $content   = file_get_contents($assignersFile);
        $assigners = $content ? json_decode($content, true) : [];
        if (!is_array($assigners)) $assigners = [];

        $newAssigner = [
            'id'        => (string)(int)(microtime(true) * 1000),
            'name'      => trim($name),
            'createdAt' => date('c'),
            'updatedAt' => date('c'),
        ];
        if ($avatar) {
            $newAssigner['avatar'] = $avatar;
        }

        $assigners[] = $newAssigner;
        file_put_contents($assignersFile, json_encode($assigners, JSON_PRETTY_PRINT | JSON_UNESCAPED_UNICODE));

        http_response_code(201);
        echo json_encode($newAssigner, JSON_UNESCAPED_UNICODE);
        exit;
    } catch (Exception $e) {
        jsonResponse(['error' => 'Błąd podczas tworzenia zleceniodawcy', 'details' => $e->getMessage()], 500);
    }
}

// ── PUT - Aktualizuj zleceniodawcę ───────────────────────────────────────────
if ($method === 'PUT') {
    try {
        $body   = getJsonInput();
        $id     = $body['id'] ?? null;
        $name   = $body['name'] ?? '';
        $avatar = $body['avatar'] ?? null;

        if (!$id) {
            jsonResponse(['error' => 'ID jest wymagane'], 400);
        }
        if (!$name || trim($name) === '') {
            jsonResponse(['error' => 'Nazwa jest wymagana'], 400);
        }

        $content   = file_get_contents($assignersFile);
        $assigners = $content ? json_decode($content, true) : [];
        if (!is_array($assigners)) $assigners = [];

        $index = null;
        foreach ($assigners as $i => $a) {
            if (($a['id'] ?? '') === (string)$id) {
                $index = $i;
                break;
            }
        }

        if ($index === null) {
            jsonResponse(['error' => 'Zleceniodawca nie został znaleziony'], 404);
        }

        // Jeśli zmieniamy awatar, usuń stary
        if ($avatar && !empty($assigners[$index]['avatar']) && $assigners[$index]['avatar'] !== $avatar) {
            $oldAvatarPath = dirname(__DIR__) . $assigners[$index]['avatar'];
            if (file_exists($oldAvatarPath)) {
                @unlink($oldAvatarPath);
            }
        }

        $assigners[$index]['name']      = trim($name);
        $assigners[$index]['updatedAt'] = date('c');
        if ($avatar) {
            $assigners[$index]['avatar'] = $avatar;
        }

        file_put_contents($assignersFile, json_encode($assigners, JSON_PRETTY_PRINT | JSON_UNESCAPED_UNICODE));
        jsonResponse($assigners[$index]);
    } catch (Exception $e) {
        jsonResponse(['error' => 'Błąd podczas aktualizacji zleceniodawcy', 'details' => $e->getMessage()], 500);
    }
}

// ── DELETE - Usuń zleceniodawcę ──────────────────────────────────────────────
if ($method === 'DELETE') {
    try {
        $id = $_GET['id'] ?? null;

        if (!$id) {
            jsonResponse(['error' => 'ID jest wymagane'], 400);
        }

        $content   = file_get_contents($assignersFile);
        $assigners = $content ? json_decode($content, true) : [];
        if (!is_array($assigners)) $assigners = [];

        $index = null;
        foreach ($assigners as $i => $a) {
            if (($a['id'] ?? '') === (string)$id) {
                $index = $i;
                break;
            }
        }

        if ($index === null) {
            jsonResponse(['error' => 'Zleceniodawca nie został znaleziony'], 404);
        }

        // Usuń awatar jeśli istnieje
        if (!empty($assigners[$index]['avatar'])) {
            $avatarPath = dirname(__DIR__) . $assigners[$index]['avatar'];
            if (file_exists($avatarPath)) {
                @unlink($avatarPath);
            }
        }

        array_splice($assigners, $index, 1);
        file_put_contents($assignersFile, json_encode($assigners, JSON_PRETTY_PRINT | JSON_UNESCAPED_UNICODE));

        jsonResponse(['success' => true]);
    } catch (Exception $e) {
        jsonResponse(['error' => 'Błąd podczas usuwania zleceniodawcy', 'details' => $e->getMessage()], 500);
    }
}

jsonResponse(['error' => 'Method not allowed'], 405);
