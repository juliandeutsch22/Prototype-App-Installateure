<?php
declare(strict_types=1);
ini_set('display_errors', '0');
require __DIR__ . '/../senklot-intern/kontakt.php';
try {
    if ($_SERVER['REQUEST_METHOD'] !== 'GET') \SenklotWeb\ausgeben(\SenklotWeb\antwort(405, ['message' => 'Methode nicht unterstützt.'], ['Allow' => 'GET']));
    $config = \SenklotWeb\config(); $ready = \SenklotWeb\bereit($config);
    if ($ready) new \SenklotWeb\Speicher($config['data_dir']);
    $data = ['mode' => $ready ? 'live' : 'unavailable', 'ready' => $ready, 'sitekey' => null];
    if ($ready) {
        $data['protection'] = \SenklotWeb\schutzmodus($config);
        if ($data['protection'] === 'turnstile') $data['sitekey'] = $config['turnstile']['site_key'];
    }
    \SenklotWeb\ausgeben(\SenklotWeb\antwort(200, $data));
} catch (Throwable) { \SenklotWeb\ausgeben(\SenklotWeb\antwort(503, ['mode' => 'unavailable', 'ready' => false, 'sitekey' => null])); }
