<?php
declare(strict_types=1);
ini_set('display_errors', '0');
require __DIR__ . '/../senklot-intern/kontakt.php';
try {
    if ($_SERVER['REQUEST_METHOD'] !== 'POST') \SenklotWeb\ausgeben(\SenklotWeb\antwort(405, ['message' => 'Methode nicht unterstützt.'], ['Allow' => 'POST']));
    $config = \SenklotWeb\config();
    if (!\SenklotWeb\bereit($config) || \SenklotWeb\schutzmodus($config) !== 'local') \SenklotWeb\ausgeben(\SenklotWeb\antwort(503, ['message' => 'Das Formular ist momentan nicht verfügbar.']));
    $origin = $_SERVER['HTTP_ORIGIN'] ?? '';
    if (!in_array($origin, $config['origins'], true)) \SenklotWeb\ausgeben(\SenklotWeb\antwort(403, ['message' => 'Bitte öffne das Formular auf der Senklot-Website.']));
    if (!preg_match('~^application/json(?:\s*;|$)~i', $_SERVER['CONTENT_TYPE'] ?? '')) \SenklotWeb\ausgeben(\SenklotWeb\antwort(415, ['message' => 'Bitte lade das Formular neu.']));
    $body = file_get_contents('php://input', false, null, 0, 257);
    if (!is_string($body) || strlen($body) > 256) \SenklotWeb\ausgeben(\SenklotWeb\antwort(413, ['message' => 'Die Anfrage ist zu groß.']));
    $data = json_decode($body, false, 3, JSON_THROW_ON_ERROR);
    if (!$data instanceof stdClass || count(get_object_vars($data)) !== 0) \SenklotWeb\ausgeben(\SenklotWeb\antwort(400, ['message' => 'Bitte lade das Formular neu.']));
    $ip = $_SERVER['REMOTE_ADDR'] ?? 'unknown';
    $store = new \SenklotWeb\Speicher($config['data_dir']);
    if (!$store->tokenRate($ip)) \SenklotWeb\ausgeben(\SenklotWeb\antwort(429, ['message' => 'Bitte versuche es später erneut oder kontaktiere uns direkt.'], ['Retry-After' => '900']));
    \SenklotWeb\ausgeben(\SenklotWeb\antwort(200, ['token' => $store->lokalesToken($ip, $origin), 'minWaitMs' => \SenklotWeb\LOCAL_MIN_SECONDS * 1000 + 100, 'expiresInMs' => \SenklotWeb\LOCAL_TTL_SECONDS * 1000 - 5000]));
} catch (JsonException) { \SenklotWeb\ausgeben(\SenklotWeb\antwort(400, ['message' => 'Bitte lade das Formular neu.'])); }
catch (Throwable) { \SenklotWeb\ausgeben(\SenklotWeb\antwort(503, ['message' => 'Das Formular konnte nicht vorbereitet werden. Bitte versuche es erneut oder kontaktiere uns direkt.'])); }
