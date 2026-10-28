<?php
/**
 * lead.php — Epitome lead capture (Reserve List + Wholesale).
 *
 * Contract:
 *   POST application/x-www-form-urlencoded or multipart
 *   type: "subscribe" | "wholesale"
 *   subscribe fields: email
 *   wholesale fields: name, email, venue, city, volume, message
 *   plus _csrf, _gotcha (honeypot)
 *   Success: { "ok": true, "message": "..." }
 *   Failure: { "ok": false, "error": "..." } or { "ok": false, "errors": [...] }
 */

declare(strict_types=1);

require __DIR__ . '/inc/bootstrap.php';

function epitome_lead_clean(string $value): string
{
    return trim(strip_tags($value));
}

epitome_boot_session();
epitome_json_headers();

if (($_SERVER['REQUEST_METHOD'] ?? '') !== 'POST') {
    epitome_json_exit(405, ['ok' => false, 'error' => 'Method not allowed']);
}

$allowedOrigins = [
    'https://www.epitomearabica.com',
    'https://epitomearabica.com',
];
if (epitome_is_local()) {
    $originHost = $_SERVER['HTTP_ORIGIN'] ?? '';
    if ($originHost !== '') {
        $allowedOrigins[] = $originHost;
    }
}
$origin = $_SERVER['HTTP_ORIGIN'] ?? '';
if ($origin !== '' && in_array($origin, $allowedOrigins, true)) {
    header("Access-Control-Allow-Origin: {$origin}");
    header('Vary: Origin');
}

$type = (string) ($_POST['type'] ?? '');
if (!in_array($type, ['subscribe', 'wholesale', 'stockist'], true)) {
    epitome_json_exit(400, ['ok' => false, 'error' => 'Invalid request type.']);
}

$maxLengths = [
    'email'   => 254,
    'name'    => 120,
    'venue'   => 160,
    'city'    => 120,
    'volume'  => 120,
    'message' => 2000,
    '_csrf'   => 80,
    '_gotcha' => 10,
];
foreach ($maxLengths as $field => $max) {
    if (isset($_POST[$field]) && strlen((string) $_POST[$field]) > $max) {
        epitome_json_exit(400, ['ok' => false, 'error' => 'One or more fields exceed the maximum allowed length.']);
    }
}

if (!empty($_POST['_gotcha'])) {
    epitome_json_exit(200, ['ok' => true, 'message' => 'Thank you.']);
}

$csrfPost    = (string) ($_POST['_csrf'] ?? '');
$csrfSession = (string) ($_SESSION['csrf_token'] ?? '');
if ($csrfPost === '' || $csrfSession === '' || !hash_equals($csrfSession, $csrfPost)) {
    epitome_json_exit(403, ['ok' => false, 'error' => 'Invalid request. Please refresh the page and try again.']);
}

$_SESSION['csrf_token'] = bin2hex(random_bytes(32));
session_regenerate_id(true);

// Rate limit (per type + IP)
$rateDir  = getenv('EPITOME_RATE_DIR') ?: (__DIR__ . '/data/rate-limits');
$ip       = epitome_client_ip();
$rateFile = rtrim($rateDir, DIRECTORY_SEPARATOR) . DIRECTORY_SEPARATOR . md5('lead|' . $ip) . '.json';
$limit    = 10;
$window   = 600;

if (!is_dir($rateDir) && !mkdir($rateDir, 0700, true) && !is_dir($rateDir)) {
    epitome_json_exit(500, ['ok' => false, 'error' => 'Server error. Please try again or email support@epitomearabica.com.']);
}

$fp = fopen($rateFile, 'c+');
if ($fp && flock($fp, LOCK_EX)) {
    $raw      = stream_get_contents($fp);
    $rateData = json_decode($raw !== false ? $raw : '', true);
    if (!is_array($rateData) || !isset($rateData['count']) || (time() - (int) ($rateData['window_start'] ?? 0)) > $window) {
        $rateData = ['count' => 0, 'window_start' => time()];
    }
    if ((int) $rateData['count'] >= $limit) {
        flock($fp, LOCK_UN);
        fclose($fp);
        epitome_json_exit(429, ['ok' => false, 'error' => 'Too many requests. Please wait a few minutes and try again.']);
    }
    $rateData['count'] = (int) $rateData['count'] + 1;
    ftruncate($fp, 0);
    rewind($fp);
    fwrite($fp, json_encode($rateData));
    fflush($fp);
    flock($fp, LOCK_UN);
}
if ($fp) {
    fclose($fp);
}

$email = trim(filter_var((string) ($_POST['email'] ?? ''), FILTER_SANITIZE_EMAIL) ?: '');

if ($type === 'subscribe') {
    if (!filter_var($email, FILTER_VALIDATE_EMAIL)) {
        epitome_json_exit(422, ['ok' => false, 'error' => 'A valid email address is required.']);
    }
    $record  = ['kind' => 'subscribe', 'email' => $email, 'ip' => $ip, 'saved_at' => date('c')];
    $to      = 'support@epitomearabica.com';
    $subject = 'New Epitome Reserve List signup';
    $body    = "RESERVE LIST SIGNUP\n====================\n\nEmail : {$email}\n\nSaved : " . date('Y-m-d H:i:s T') . "\nIP    : {$ip}\nSource: epitomearabica.com reserve list\n";
    $confirmSubject = 'You are on the Epitome Reserve List';
    $confirmBody    = "Welcome to the Epitome Reserve List.\n\nWe write rarely, and only when there is something worth your time: a new lot, a harvest, or a private offer. You will hear from us first.\n\n— The Epitome house\nepitomearabica.com\n";
} else {
    $name    = epitome_lead_clean((string) ($_POST['name'] ?? ''));
    $venue   = epitome_lead_clean((string) ($_POST['venue'] ?? ''));
    $city    = epitome_lead_clean((string) ($_POST['city'] ?? ''));
    $volume  = epitome_lead_clean((string) ($_POST['volume'] ?? ''));
    $message = epitome_lead_clean((string) ($_POST['message'] ?? ''));

    if ($name === '') {
        epitome_json_exit(422, ['ok' => false, 'error' => 'Your name is required.']);
    }
    if (!filter_var($email, FILTER_VALIDATE_EMAIL)) {
        epitome_json_exit(422, ['ok' => false, 'error' => 'A valid email address is required.']);
    }

    $record  = ['kind' => $type, 'name' => $name, 'email' => $email, 'venue' => $venue, 'city' => $city, 'volume' => $volume, 'message' => $message, 'ip' => $ip, 'saved_at' => date('c')];
    $to      = 'support@epitomearabica.com';
    $subject = 'New Epitome ' . (($type === 'stockist') ? 'Stockist' : 'Wholesale') . ' enquiry - ' . $name . ($venue !== '' ? ' (' . $venue . ')' : '');
    $body    = strtoupper($type) . " ENQUIRY\n=================\n\nName   : {$name}\nEmail  : {$email}\nVenue  : {$venue}\nCity   : {$city}\nVolume : {$volume}\n\nMessage:\n{$message}\n\nSaved  : " . date('Y-m-d H:i:s T') . "\nIP     : {$ip}\nSource : epitomearabica.com {$type} form\n";
    $confirmSubject = 'Your Epitome ' . strtolower($type) . ' enquiry';
    $confirmBody    = "Dear {$name},\n\nThank you for your enquiry. A member of the house will write to you directly within a day or two to discuss serving Epitome.\n\n— The Epitome house\nepitomearabica.com\n";
}

// Persist the lead (always).
$leadDir  = getenv('EPITOME_LEAD_DIR') ?: (__DIR__ . '/data/leads');
$leadFile = rtrim($leadDir, DIRECTORY_SEPARATOR) . DIRECTORY_SEPARATOR . $type . '-' . date('Y-m-d') . '.jsonl';
if (!is_dir($leadDir) && !mkdir($leadDir, 0700, true) && !is_dir($leadDir)) {
    epitome_json_exit(500, ['ok' => false, 'error' => 'Server error. Please try again or email support@epitomearabica.com.']);
}
$saved = file_put_contents($leadFile, json_encode($record, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES) . "\n", FILE_APPEND | LOCK_EX) !== false;
if (!$saved) {
    epitome_json_exit(500, ['ok' => false, 'error' => 'Server error. Please try again or email support@epitomearabica.com.']);
}

// Best-effort mail.
$mode = strtolower((string) (getenv('EPITOME_MAIL_MODE') ?: 'auto'));
if (!in_array($mode, ['auto', 'mock', 'send'], true)) {
    $mode = 'auto';
}
$send = $mode === 'send' || ($mode === 'auto' && !epitome_is_local());
if ($send) {
    $headers = "From: Epitome <noreply@epitomearabica.com>\r\n"
        . "Reply-To: {$email}\r\n"
        . "X-Mailer: EpitomeLeadMailer\r\n"
        . "MIME-Version: 1.0\r\n"
        . "Content-Type: text/plain; charset=UTF-8\r\n";
    @mail($to, $subject, $body, $headers, '-fsupport@epitomearabica.com');

    $confirmHeaders = "From: Epitome <support@epitomearabica.com>\r\n"
        . "Reply-To: support@epitomearabica.com\r\n"
        . "X-Mailer: EpitomeLeadMailer\r\n"
        . "MIME-Version: 1.0\r\n"
        . "Content-Type: text/plain; charset=UTF-8\r\n";
    @mail($email, $confirmSubject, $confirmBody, $confirmHeaders, '-fsupport@epitomearabica.com');
}

if ($type === 'subscribe') {
    epitome_json_exit(200, ['ok' => true, 'message' => 'You are on the list. The house will write first.']);
}
epitome_json_exit(200, ['ok' => true, 'message' => 'Received. A member of the house will write shortly.']);