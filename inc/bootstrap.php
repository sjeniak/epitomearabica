<?php
/**
 * Shared session + JSON helpers for the Epitome order form.
 */

declare(strict_types=1);

function epitome_is_https(): bool
{
    if (!empty($_SERVER['HTTPS']) && $_SERVER['HTTPS'] !== 'off') {
        return true;
    }
    if ((int) ($_SERVER['SERVER_PORT'] ?? 0) === 443) {
        return true;
    }
    $forwarded = strtolower((string) ($_SERVER['HTTP_X_FORWARDED_PROTO'] ?? ''));
    return $forwarded === 'https';
}

function epitome_is_local(): bool
{
    $host = strtolower((string) ($_SERVER['SERVER_NAME'] ?? $_SERVER['HTTP_HOST'] ?? ''));
    $host = explode(':', $host)[0];
    return in_array($host, ['127.0.0.1', 'localhost', '::1'], true);
}

function epitome_boot_session(): void
{
    ini_set('session.cookie_httponly', '1');
    ini_set('session.cookie_samesite', 'Strict');
    ini_set('session.use_strict_mode', '1');
    ini_set('session.cookie_secure', epitome_is_https() ? '1' : '0');
    session_start();
}

function epitome_json_headers(): void
{
    header('Content-Type: application/json; charset=UTF-8');
    header('Cache-Control: no-store, no-cache, must-revalidate, max-age=0');
    header('Pragma: no-cache');
    header('X-Content-Type-Options: nosniff');
    header('X-Frame-Options: DENY');
    header('Referrer-Policy: strict-origin-when-cross-origin');
}

function epitome_json_exit(int $status, array $payload): never
{
    http_response_code($status);
    echo json_encode($payload, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
    exit;
}

function epitome_client_ip(): string
{
    if (!empty($_SERVER['HTTP_CF_CONNECTING_IP'])) {
        $raw = (string) $_SERVER['HTTP_CF_CONNECTING_IP'];
    } else {
        $raw = (string) ($_SERVER['REMOTE_ADDR'] ?? '0.0.0.0');
    }
    $first = trim(explode(',', $raw)[0]);
    $clean = preg_replace('/[^a-fA-F0-9:.]/', '', $first) ?? '';
    return $clean !== '' ? $clean : '0.0.0.0';
}
