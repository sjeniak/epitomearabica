<?php
/**
 * token.php — issues a CSRF token for the Epitome reserve form.
 * Contract: GET → { "token": "<hex>" }
 */

declare(strict_types=1);

require __DIR__ . '/inc/bootstrap.php';

epitome_boot_session();
epitome_json_headers();

if (($_SERVER['REQUEST_METHOD'] ?? '') !== 'GET') {
    epitome_json_exit(405, ['ok' => false, 'error' => 'Method not allowed']);
}

if (empty($_SESSION['csrf_token'])) {
    session_regenerate_id(true);
    $_SESSION['csrf_token'] = bin2hex(random_bytes(32));
}

epitome_json_exit(200, ['token' => $_SESSION['csrf_token']]);
