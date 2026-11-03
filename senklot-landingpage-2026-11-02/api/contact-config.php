<?php
declare(strict_types=1);
ini_set('display_errors', '0');
require __DIR__ . '/../senklot-intern/kontakt.php';
try {
    if ($_SERVER['REQUEST_METHOD'] !== 'GET') \SenklotWeb\ausgeben(\SenklotWeb\antwort(405, ['message' => 'Methode nicht unterstützt.'], ['Allow' => 'GET']));
    $config = \SenklotWeb\config(); $ready = \SenklotWeb\bereit($config);
    if ($ready) new \SenklotWeb\Speicher($config['data_dir']);
    \SenklotWeb\ausgeben(\SenklotWeb\antwort(200, ['mode' => $ready ? 'live' : 'unavailable', 'ready' => $ready, 'sitekey' => $ready ? $config['turnstile']['site_key'] : null]));
} catch (Throwable) { \SenklotWeb\ausgeben(\SenklotWeb\antwort(503, ['mode' => 'unavailable', 'ready' => false, 'sitekey' => null])); }
