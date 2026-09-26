<?php
/**
 * mail.php — Epitome reserve / order handler.
 *
 * Contract (unchanged):
 *   POST application/x-www-form-urlencoded or multipart
 *   Fields: firstName, lastName, email, country, grind, quantity, notes, _csrf, _gotcha
 *   Success:  { "ok": true }
 *   Failure:  { "ok": false, "error": "..." } or { "ok": false, "errors": ["..."] }
 *
 * Mail:
 *   EPITOME_MAIL_MODE=send  always use PHP mail()
 *   EPITOME_MAIL_MODE=mock  write the order to data/orders/ (no SMTP)
 *   EPITOME_MAIL_MODE=auto  (default) mock on localhost; otherwise mail(),
 *                           falling back to mock if mail() returns false
 */

declare(strict_types=1);

require __DIR__ . '/inc/bootstrap.php';

epitome_boot_session();
epitome_json_headers();

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

if (($_SERVER['REQUEST_METHOD'] ?? '') !== 'POST') {
    epitome_json_exit(405, ['ok' => false, 'error' => 'Method not allowed']);
}

$maxLengths = [
    'firstName' => 80,
    'lastName'  => 80,
    'email'     => 254,
    'country'   => 100,
    'grind'     => 100,
    'notes'     => 1000,
    '_csrf'     => 80,
    '_gotcha'   => 10,
];
foreach ($maxLengths as $field => $max) {
    if (isset($_POST[$field]) && strlen((string) $_POST[$field]) > $max) {
        epitome_json_exit(400, [
            'ok' => false,
            'error' => 'One or more fields exceed the maximum allowed length.',
        ]);
    }
}

if (!empty($_POST['_gotcha'])) {
    epitome_json_exit(200, ['ok' => true]);
}

$csrfPost    = (string) ($_POST['_csrf'] ?? '');
$csrfSession = (string) ($_SESSION['csrf_token'] ?? '');

if ($csrfPost === '' || $csrfSession === '' || !hash_equals($csrfSession, $csrfPost)) {
    epitome_json_exit(403, [
        'ok' => false,
        'error' => 'Invalid request. Please refresh the page and try again.',
    ]);
}

$_SESSION['csrf_token'] = bin2hex(random_bytes(32));
session_regenerate_id(true);

$rateDir = getenv('EPITOME_RATE_DIR') ?: (__DIR__ . '/data/rate-limits');
$ip      = epitome_client_ip();
$rateFile = rtrim($rateDir, DIRECTORY_SEPARATOR) . DIRECTORY_SEPARATOR . md5($ip) . '.json';
$limit   = 5;
$window  = 600;

if (!is_dir($rateDir) && !mkdir($rateDir, 0700, true) && !is_dir($rateDir)) {
    epitome_json_exit(500, [
        'ok' => false,
        'error' => 'Mail server error. Please try again or email us directly at support@epitomearabica.com',
    ]);
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
        epitome_json_exit(429, [
            'ok' => false,
            'error' => 'Too many requests. Please wait a few minutes and try again.',
        ]);
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

function cleanHeader(string $value): string
{
    $value = strip_tags($value);
    $value = preg_replace('/[\x00-\x1F\x7F]/', '', $value) ?? '';
    return trim($value);
}

function cleanBody(string $value): string
{
    return trim(strip_tags($value));
}

$firstName = cleanHeader((string) ($_POST['firstName'] ?? ''));
$lastName  = cleanHeader((string) ($_POST['lastName'] ?? ''));
$email     = trim(filter_var((string) ($_POST['email'] ?? ''), FILTER_SANITIZE_EMAIL) ?: '');
$country   = cleanHeader((string) ($_POST['country'] ?? ''));
$quantity  = (int) ($_POST['quantity'] ?? 1);
$notes     = cleanBody((string) ($_POST['notes'] ?? ''));

$allowedGrinds = [
    'Whole Roasted Beans — Medium Roast',
    'Whole Roasted Beans - Medium Roast',
];
$grindRaw = cleanHeader((string) ($_POST['grind'] ?? ''));
$grind    = in_array($grindRaw, $allowedGrinds, true)
    ? $grindRaw
    : 'Whole Roasted Beans — Medium Roast';

$errors = [];
if ($firstName === '') {
    $errors[] = 'First name is required';
}
if ($lastName === '') {
    $errors[] = 'Last name is required';
}
if (!filter_var($email, FILTER_VALIDATE_EMAIL)) {
    $errors[] = 'Valid email address is required';
}
if (preg_match('/[\x00-\x1F\x7F]/', $email)) {
    $errors[] = 'Invalid email address';
}
if ($country === '') {
    $errors[] = 'Country is required';
}
if ($quantity < 1 || $quantity > 20) {
    $errors[] = 'Quantity must be between 1 and 20';
}

if ($errors !== []) {
    epitome_json_exit(422, ['ok' => false, 'errors' => $errors]);
}

$to   = 'support@epitomearabica.com';
$bags = $quantity . ' bag' . ($quantity > 1 ? 's' : '');

$subject = "New Epitome Order - {$firstName} {$lastName} ({$bags})";

$body  = "NEW ORDER RECEIVED\n";
$body .= str_repeat('=', 40) . "\n\n";
$body .= "Name      : {$firstName} {$lastName}\n";
$body .= "Email     : {$email}\n";
$body .= "Country   : {$country}\n";
$body .= "Product   : {$grind}\n";
$body .= "Quantity  : {$bags}\n";
if ($notes !== '') {
    $body .= "Notes     :\n{$notes}\n";
}
$body .= "\n" . str_repeat('=', 40) . "\n";
$body .= 'Submitted : ' . date('Y-m-d H:i:s T') . "\n";
$body .= "IP        : {$ip}\n";
$body .= "Source    : epitomearabica.com order form\n";

$headers  = "From: Epitome Order Form <noreply@epitomearabica.com>\r\n";
$headers .= "Reply-To: {$firstName} {$lastName} <{$email}>\r\n";
$headers .= "X-Mailer: EpitomeCoffeeMailer\r\n";
$headers .= "MIME-Version: 1.0\r\n";
$headers .= "Content-Type: text/plain; charset=UTF-8\r\n";

$confirmBody  = "Dear {$firstName},\n\n";
$confirmBody .= "Thank you for your order. We have received your reserve request ";
$confirmBody .= "and will be in touch within 24 hours to arrange payment and shipping.\n\n";
$confirmBody .= "YOUR ORDER SUMMARY\n";
$confirmBody .= str_repeat('-', 30) . "\n";
$confirmBody .= "Product  : {$grind}\n";
$confirmBody .= "Quantity : {$bags}\n";
$confirmBody .= "Country  : {$country}\n";
if ($notes !== '') {
    $confirmBody .= "Notes    : {$notes}\n";
}
$confirmBody .= str_repeat('-', 30) . "\n\n";
$confirmBody .= "Questions? Reply to this email or contact us at support@epitomearabica.com\n\n";
$confirmBody .= "The Epitome Team\n";
$confirmBody .= "epitomearabica.com\n";

$confirmSubject = 'Your Epitome Reserve - Order Confirmed';
$confirmHeaders  = "From: Epitome Coffee <support@epitomearabica.com>\r\n";
$confirmHeaders .= "Reply-To: support@epitomearabica.com\r\n";
$confirmHeaders .= "X-Mailer: EpitomeCoffeeMailer\r\n";
$confirmHeaders .= "MIME-Version: 1.0\r\n";
$confirmHeaders .= "Content-Type: text/plain; charset=UTF-8\r\n";

$mode = strtolower((string) (getenv('EPITOME_MAIL_MODE') ?: 'auto'));
if (!in_array($mode, ['auto', 'mock', 'send'], true)) {
    $mode = 'auto';
}

function epitome_write_mock(string $kind, string $to, string $subject, string $body): bool
{
    $dir = getenv('EPITOME_ORDER_DIR') ?: (__DIR__ . '/data/orders');
    if (!is_dir($dir) && !mkdir($dir, 0700, true) && !is_dir($dir)) {
        return false;
    }
    $record = [
        'kind'      => $kind,
        'to'        => $to,
        'subject'   => $subject,
        'body'      => $body,
        'saved_at'  => date('c'),
    ];
    $file = rtrim($dir, DIRECTORY_SEPARATOR) . DIRECTORY_SEPARATOR . date('Y-m-d') . '.jsonl';
    $line = json_encode($record, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES) . "\n";
    return file_put_contents($file, $line, FILE_APPEND | LOCK_EX) !== false;
}

function epitome_try_mail(string $to, string $subject, string $body, string $headers): bool
{
    return @mail($to, $subject, $body, $headers, '-fsupport@epitomearabica.com');
}

$useMock = $mode === 'mock' || ($mode === 'auto' && epitome_is_local());
$sent    = false;

if ($useMock) {
    $sent = epitome_write_mock('order', $to, $subject, $body);
    if ($sent) {
        epitome_write_mock('confirmation', $email, $confirmSubject, $confirmBody);
    }
} else {
    $sent = epitome_try_mail($to, $subject, $body, $headers);
    if ($sent) {
        epitome_try_mail($email, $confirmSubject, $confirmBody, $confirmHeaders);
    } elseif ($mode === 'auto') {
        $sent = epitome_write_mock('order', $to, $subject, $body);
        if ($sent) {
            epitome_write_mock('confirmation', $email, $confirmSubject, $confirmBody);
        }
    }
}

if ($sent) {
    epitome_json_exit(200, ['ok' => true]);
}

epitome_json_exit(500, [
    'ok' => false,
    'error' => 'Mail server error. Please try again or email us directly at support@epitomearabica.com',
]);
