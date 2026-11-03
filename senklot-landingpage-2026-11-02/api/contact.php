<?php
declare(strict_types=1);
ini_set('display_errors', '0');
require __DIR__ . '/../senklot-intern/kontakt.php';
try {
    $method = $_SERVER['REQUEST_METHOD'];
    if ($method !== 'POST') \SenklotWeb\ausgeben(\SenklotWeb\antwort(405, ['message' => 'Methode nicht unterstützt.'], ['Allow' => 'POST']));
    $config = \SenklotWeb\config();
    if (!\SenklotWeb\bereit($config)) \SenklotWeb\ausgeben(\SenklotWeb\antwort(503, ['message' => 'Das Formular ist momentan nicht verfügbar. Bitte kontaktiere uns direkt per E-Mail oder Telefon.']));
    $body = file_get_contents('php://input', false, null, 0, \SenklotWeb\MAX_BODY + 1);
    $headers = ['origin' => $_SERVER['HTTP_ORIGIN'] ?? '', 'content-type' => $_SERVER['CONTENT_TYPE'] ?? ''];
    // Nur die vom Webserver gelieferte Adresse; keine ungeprüften Forwarded-Header.
    $ip = $_SERVER['REMOTE_ADDR'] ?? 'unknown';
    \SenklotWeb\ausgeben(\SenklotWeb\verarbeiten($method, $headers, $body === false ? '' : $body, $ip, $config,
        fn($token, $ip) => \SenklotWeb\turnstile($config, $token, $ip),
        fn($data, $text) => \SenklotWeb\smtp($config, $data, $text), new \SenklotWeb\Speicher($config['data_dir'])));
} catch (Throwable) { \SenklotWeb\ausgeben(\SenklotWeb\antwort(503, ['message' => 'Die Anfrage konnte nicht verarbeitet werden. Deine Angaben bleiben erhalten. Bitte kontaktiere uns bei Bedarf direkt.'])); }
