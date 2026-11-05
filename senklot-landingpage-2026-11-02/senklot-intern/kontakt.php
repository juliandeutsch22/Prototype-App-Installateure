<?php
declare(strict_types=1);
namespace SenklotWeb;

if (realpath($_SERVER['SCRIPT_FILENAME'] ?? '') === __FILE__) { http_response_code(403); exit; }

const EMPFAENGER = 'office@senklot.at';
const MAX_BODY = 12000;
const LOCAL_MIN_SECONDS = 2;
const LOCAL_TTL_SECONDS = 1800;
if (is_readable(__DIR__ . '/mail-html.php')) require_once __DIR__ . '/mail-html.php';

function schutzmodus(array $c): string {
    if (array_key_exists('spam_protection', $c)) return in_array($c['spam_protection'], ['local', 'turnstile'], true) ? $c['spam_protection'] : 'invalid';
    // Vorhandene Turnstile-Konfigurationen bleiben erhalten; leere Beispiele nutzen den lokalen Schutz.
    $keys = $c['turnstile'] ?? [];
    if (!is_array($keys)) return 'invalid';
    return ($keys['site_key'] ?? '') !== '' || ($keys['secret_key'] ?? '') !== '' ? 'turnstile' : 'local';
}

function config(): array {
    $file = __DIR__ . '/config.php';
    return is_file($file) ? (array) require $file : ['enabled' => false];
}

function bereit(array $c): bool {
    $s = $c['smtp'] ?? []; $t = $c['turnstile'] ?? []; $schutz = schutzmodus($c);
    $turnstileReady = is_string($t['site_key'] ?? null) && $t['site_key'] !== ''
        && is_string($t['secret_key'] ?? null) && $t['secret_key'] !== ''
        && !preg_match('/^[123]x0/', $t['site_key']) && !preg_match('/^[123]x0/', $t['secret_key']);
    return ($c['enabled'] ?? false) === true && ($c['legal_ready'] ?? false) === true && PHP_VERSION_ID >= 80200
        && extension_loaded('openssl') && extension_loaded('ctype')
        && in_array($schutz, ['local', 'turnstile'], true)
        && ($schutz === 'local' || (extension_loaded('curl') && $turnstileReady))
        && is_array($c['origins'] ?? null) && count($c['origins']) > 0
        && count(array_filter($c['origins'], fn($o) => is_string($o) && preg_match('~^https://[a-z0-9.-]+(?::[0-9]+)?$~iD', $o))) === count($c['origins'])
        && is_string($s['host'] ?? null) && (bool) preg_match('/^[a-z0-9.-]+$/iD', $s['host'])
        && in_array([$s['security'] ?? '', $s['port'] ?? 0], [['tls', 587], ['ssl', 465]], true)
        && is_string($s['username'] ?? null) && $s['username'] !== ''
        && is_string($s['password'] ?? null) && $s['password'] !== ''
        && filter_var($s['from'] ?? '', FILTER_VALIDATE_EMAIL) !== false
        && !preg_match('/[\r\n]/', ($s['from_name'] ?? '') . ($s['from'] ?? ''))
        && is_string($c['data_dir'] ?? null) && $c['data_dir'] !== '';
}

function antwort(int $status, array $data, array $headers = []): array {
    return [$status, $data, $headers];
}

function ausgeben(array $r): never {
    [$status, $data, $extra] = $r;
    http_response_code($status);
    header('Content-Type: application/json; charset=utf-8');
    header('Cache-Control: no-store');
    header('X-Content-Type-Options: nosniff');
    header('X-Robots-Tag: noindex, nofollow');
    foreach ($extra as $name => $value) header($name . ': ' . $value);
    echo json_encode($data, JSON_UNESCAPED_UNICODE | JSON_INVALID_UTF8_SUBSTITUTE);
    exit;
}

function laenge(string $v): int {
    return preg_match_all('/./us', $v) ?: 0;
}

function validieren(mixed $raw): array {
    if (!is_array($raw) || array_is_list($raw)) return ['errors' => ['formular' => 'Bitte prüfe deine Angaben.']];
    $e = []; $d = [];
    foreach (['name' => [2, 100], 'firma' => [2, 150], 'email' => [3, 254], 'telefon' => [0, 40], 'nachricht' => [0, 3000]] as $key => [$min, $max]) {
        $v = $raw[$key] ?? '';
        if (!is_string($v) || !preg_match('//u', $v)) { $e[$key] = 'Bitte prüfe diese Angabe.'; $v = ''; }
        $v = trim($v); $d[$key] = $v;
        if (laenge($v) < $min || laenge($v) > $max || preg_match('/[\x00-\x08\x0b\x0c\x0e-\x1f\x7f]/', $v)
            || ($key !== 'nachricht' && preg_match('/[\r\n]/', $v))) $e[$key] = 'Bitte prüfe diese Angabe.';
    }
    if (!filter_var($d['email'], FILTER_VALIDATE_EMAIL)) $e['email'] = 'Bitte gib eine gültige E-Mail-Adresse ein.';
    $d['tarif'] = $raw['tarif'] ?? 'offen';
    if (!in_array($d['tarif'], ['offen', 'starter', 'team', 'betrieb'], true)) $e['tarif'] = 'Bitte wähle einen vorhandenen Tarif.';
    $d['zahlung'] = $raw['zahlung'] ?? '';
    if (!in_array($d['zahlung'], ['monatlich', 'jaehrlich'], true)) $e['tarif'] = 'Bitte prüfe die Abrechnung.';
    $n = $raw['nutzer'] ?? ''; $d['nutzer'] = null;
    if ($n !== '') {
        if ((!is_string($n) && !is_int($n)) || !preg_match('/^[1-9][0-9]{0,4}$/D', (string) $n) || (int) $n > 10000) $e['nutzer'] = 'Bitte gib eine ganze Zahl von 1 bis 10.000 ein.';
        else $d['nutzer'] = (int) $n;
    }
    if (!is_string($raw['website'] ?? null) || trim($raw['website']) !== '') $e['formular'] = 'Die Anfrage konnte nicht verarbeitet werden.';
    $d['einrichtung'] = $raw['einrichtung'] ?? false;
    if (!is_bool($d['einrichtung'])) $e['einrichtung'] = 'Bitte prüfe die optionale Einrichtung.';
    $d['requestId'] = $raw['requestId'] ?? '';
    if (!is_string($d['requestId']) || !preg_match('/^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/iD', $d['requestId'])) $e['formular'] = 'Bitte lade das Formular neu.';
    $d['token'] = $raw['token'] ?? '';
    if (!is_string($d['token']) || strlen($d['token']) > 2048) $e['formular'] = 'Bitte wiederhole die Sicherheitsprüfung.';
    $d['spamschutzZugestimmt'] = $raw['spamschutzZugestimmt'] ?? false;
    if (!is_bool($d['spamschutzZugestimmt'])) $e['formular'] = 'Bitte prüfe die Sicherheitsprüfung.';
    return $e ? ['errors' => $e] : ['data' => $d];
}

/** Gemeinsamer, per flock geschützter Speicher für parallele PHP-Prozesse. Keine Nachrichten oder Klartext-IP-Adressen. */
final class Speicher {
    private string $key;
    public function __construct(private string $dir, private int $now = 0) {
        $this->now = $now ?: time();
        if (!is_dir($dir) && !@mkdir($dir, 0700, true) && !is_dir($dir)) throw new \RuntimeException('Speicher nicht verfügbar');
        $f = @fopen($dir . '/schluessel', 'c+b');
        if (!$f) throw new \RuntimeException('Speicher nicht verfügbar');
        try {
            if (!flock($f, LOCK_EX)) throw new \RuntimeException('Sperre nicht verfügbar');
            @chmod($dir . '/schluessel', 0600); $key = stream_get_contents($f);
            if ($key === '') { $key = random_bytes(32); if (fwrite($f, $key) !== 32 || !fflush($f)) throw new \RuntimeException('Speicher nicht verfügbar'); }
            if (!is_string($key) || strlen($key) !== 32) throw new \RuntimeException('Speicher nicht verfügbar');
            $this->key = $key;
        } finally { flock($f, LOCK_UN); fclose($f); }
    }
    public function fingerprint(array $d): string {
        unset($d['token'], $d['requestId'], $d['spamschutzZugestimmt']);
        return hash_hmac('sha256', json_encode($d, JSON_THROW_ON_ERROR | JSON_UNESCAPED_UNICODE), $this->key);
    }
    private function bearbeiten(callable $fn): mixed {
        $f = @fopen($this->dir . '/zustand.json', 'c+b');
        if (!$f) throw new \RuntimeException('Speicher nicht verfügbar');
        try {
            if (!flock($f, LOCK_EX)) throw new \RuntimeException('Sperre nicht verfügbar');
            @chmod($this->dir . '/zustand.json', 0600);
            if ((fstat($f)['size'] ?? 0) > 2097152) throw new \RuntimeException('Speichergrenze');
            $raw = stream_get_contents($f); $s = $raw === '' ? ['rate' => [], 'requests' => [], 'tokens' => []] : json_decode($raw, true, 16, JSON_THROW_ON_ERROR);
            $s['tokens'] ??= [];
            if (!is_array($s['tokens'])) throw new \RuntimeException('Speicher ungültig');
            if (!is_array($s['rate'] ?? null) || !is_array($s['requests'] ?? null)) throw new \RuntimeException('Speicher ungültig');
            foreach ($s['rate'] as $key => $v) if ($v['bis'] <= $this->now) unset($s['rate'][$key]);
            foreach ($s['requests'] as $key => $v) if ($v['bis'] <= $this->now) unset($s['requests'][$key]);
            foreach ($s['tokens'] as $key => $v) if ($v['bis'] <= $this->now) unset($s['tokens'][$key]);
            $result = $fn($s);
            $text = json_encode($s, JSON_THROW_ON_ERROR); rewind($f);
            if (!ftruncate($f, 0)) throw new \RuntimeException('Speicher nicht verfügbar');
            $offset = 0;
            while ($offset < strlen($text)) { $n = fwrite($f, substr($text, $offset)); if (!$n) throw new \RuntimeException('Speicher nicht verfügbar'); $offset += $n; }
            if (!fflush($f)) throw new \RuntimeException('Speicher nicht verfügbar');
            return $result;
        } finally { flock($f, LOCK_UN); fclose($f); }
    }
    public function rate(string $ip): bool { return $this->begrenzen($ip, 8); }
    public function tokenRate(string $ip): bool { return $this->begrenzen("token\0" . $ip, 60); }
    private function begrenzen(string $bucket, int $max): bool {
        $key = hash_hmac('sha256', $bucket, $this->key);
        return $this->bearbeiten(function (&$s) use ($key, $max) {
            if (!isset($s['rate'][$key])) {
                if (count($s['rate']) >= 5000) return false;
                $s['rate'][$key] = ['anzahl' => 0, 'bis' => $this->now + 900];
            }
            return ++$s['rate'][$key]['anzahl'] <= $max;
        });
    }
    public function lokalesToken(string $ip, string $origin): string {
        $data = ['v' => 1, 'iat' => $this->now, 'nonce' => bin2hex(random_bytes(16))];
        $payload = rtrim(strtr(base64_encode(json_encode($data, JSON_THROW_ON_ERROR)), '+/', '-_'), '=');
        return $payload . '.' . hash_hmac('sha256', "form-token:v1\0" . $payload . "\0" . $origin . "\0" . $ip, $this->key);
    }
    /** Prüft Signatur, Herkunft, Ablauf und Mindestzeit; verbraucht ein gültiges Token atomar. */
    public function lokalPruefen(string $token, string $ip, string $origin): string {
        if (!preg_match('/^([a-zA-Z0-9_-]{20,300})\.([a-f0-9]{64})$/D', $token, $match)) return 'invalid';
        $expected = hash_hmac('sha256', "form-token:v1\0" . $match[1] . "\0" . $origin . "\0" . $ip, $this->key);
        if (!hash_equals($expected, $match[2])) return 'invalid';
        try {
            $raw = base64_decode(strtr($match[1], '-_', '+/'), true);
            $data = json_decode($raw === false ? '' : $raw, true, 4, JSON_THROW_ON_ERROR);
        } catch (\Throwable) { return 'invalid'; }
        if (($data['v'] ?? null) !== 1 || !is_int($data['iat'] ?? null) || !is_string($data['nonce'] ?? null)
            || !preg_match('/^[a-f0-9]{32}$/D', $data['nonce'])) return 'invalid';
        $age = $this->now - $data['iat'];
        if ($age < 0 || $age >= LOCAL_TTL_SECONDS) return 'expired';
        if ($age < LOCAL_MIN_SECONDS) return 'early';
        $key = hash_hmac('sha256', "used-token\0" . $token, $this->key);
        return $this->bearbeiten(function (&$s) use ($key, $data) {
            if (isset($s['tokens'][$key])) return 'used';
            if (count($s['tokens']) >= 2000) throw new \RuntimeException('Speichergrenze');
            $s['tokens'][$key] = ['bis' => $data['iat'] + LOCAL_TTL_SECONDS];
            return 'valid';
        });
    }
    public function status(string $id, string $fp, bool $reservieren = false): string {
        return $this->bearbeiten(function (&$s) use ($id, $fp, $reservieren) {
            if (isset($s['requests'][$id])) return hash_equals($s['requests'][$id]['fp'], $fp) ? $s['requests'][$id]['status'] : 'conflict';
            if (!$reservieren) return 'new';
            if (count($s['requests']) >= 1000) throw new \RuntimeException('Speichergrenze');
            $s['requests'][$id] = ['fp' => $fp, 'status' => 'sending', 'bis' => $this->now + 172800];
            return 'reserved';
        });
    }
    public function setzen(string $id, string $status): void {
        $this->bearbeiten(function (&$s) use ($id, $status) { if (!isset($s['requests'][$id])) throw new \RuntimeException('Anfrage fehlt'); $s['requests'][$id]['status'] = $status; });
    }
}

function euro(int $cent): string { return number_format($cent / 100, 2, ',', '.') . ' €'; }
function mailText(array $d, string $protection = 'local'): string {
    $tarife = json_decode(file_get_contents(__DIR__ . '/tarife.json'), true, 8, JSON_THROW_ON_ERROR);
    $t = $d['tarif'] === 'offen' ? null : $tarife[$d['tarif']];
    $angebot = json_decode(file_get_contents(__DIR__ . '/angebot.json'), true, 8, JSON_THROW_ON_ERROR);
    $lines = ['Senklot – neue Website-Anfrage', '', $angebot['titel'], '', 'Name: ' . $d['name'], 'Betrieb: ' . $d['firma'], 'E-Mail: ' . $d['email'], 'Telefon: ' . ($d['telefon'] ?: 'Nicht angegeben'), 'Mitarbeiter / Nutzer: ' . ($d['nutzer'] ?? 'Nicht angegeben'), 'Tarif: ' . ($t['name'] ?? 'Noch offen'), 'Abrechnung: ' . ($d['zahlung'] === 'jaehrlich' ? 'Jährlich im Voraus, 10 % Rabatt' : 'Monatlich')];
    if ($t) {
        $jahr = intdiv($t['monatCent'] * 12 * 90, 100);
        $lines[] = $d['zahlung'] === 'jaehrlich' ? 'Abonnement: ' . euro($jahr) . ' netto jährlich im Voraus' : 'Abonnement: ' . euro($t['monatCent']) . ' netto monatlich';
        $lines[] = $d['einrichtung'] ? 'Optionale Einrichtung angefragt: ' . euro($t['einrichtungCent']) . ' netto einmalig' : 'Begleitete Einrichtung: nicht angefragt; keine Einrichtungsgebühr für eigenständigen Start.';
    }
    if (!$t) $lines[] = $d['einrichtung'] ? 'Optionale Einrichtung angefragt: Umfang und Preis vorab vereinbaren.' : 'Begleitete Einrichtung: nicht angefragt.';
    return implode("\n", [...$lines, '', 'Nachricht:', $d['nachricht'] ?: 'Keine zusätzliche Nachricht.', '', 'Anfrage-ID: ' . $d['requestId'], 'Unverbindliche Anfrage; kein Vertragsabschluss.', $protection === 'turnstile' ? 'Externe Sicherheitsprüfung wurde im Formular ausdrücklich aktiviert.' : 'Lokaler Formularschutz geprüft; keine externe Sicherheitsprüfung geladen.']);
}

function turnstile(array $c, string $token, string $ip): array {
    $ch = curl_init('https://challenges.cloudflare.com/turnstile/v0/siteverify');
    curl_setopt_array($ch, [CURLOPT_POST => true, CURLOPT_POSTFIELDS => http_build_query(['secret' => $c['turnstile']['secret_key'], 'response' => $token, 'remoteip' => $ip]), CURLOPT_RETURNTRANSFER => true, CURLOPT_CONNECTTIMEOUT => 3, CURLOPT_TIMEOUT => 6, CURLOPT_SSL_VERIFYPEER => true, CURLOPT_SSL_VERIFYHOST => 2, CURLOPT_PROTOCOLS => CURLPROTO_HTTPS]);
    try { $body = curl_exec($ch); if ($body === false || curl_getinfo($ch, CURLINFO_RESPONSE_CODE) !== 200) throw new \RuntimeException('Prüfung nicht erreichbar'); return json_decode($body, true, 16, JSON_THROW_ON_ERROR); }
    finally { curl_close($ch); }
}

function smtp(array $c, array $d, string $text): void {
    foreach (['Exception', 'PHPMailer', 'SMTP'] as $file) require_once __DIR__ . '/vendor/phpmailer/src/' . $file . '.php';
    $s = $c['smtp']; $mail = new \PHPMailer\PHPMailer\PHPMailer(true);
    $mail->isSMTP(); $mail->SMTPDebug = 0; $mail->Host = $s['host']; $mail->Port = $s['port'];
    $mail->SMTPAuth = true; $mail->Username = $s['username']; $mail->Password = $s['password'];
    $mail->SMTPSecure = $s['security']; $mail->SMTPAutoTLS = true; $mail->Timeout = 10; $mail->getSMTPInstance()->Timelimit = 10;
    $mail->SMTPOptions = ['ssl' => ['verify_peer' => true, 'verify_peer_name' => true, 'allow_self_signed' => false]];
    $mail->CharSet = 'UTF-8'; $mail->setFrom($s['from'], $s['from_name'] ?? 'Senklot');
    $mail->addAddress(EMPFAENGER); $mail->addReplyTo($d['email']);
    $mail->Subject = 'Senklot – Anfrage über die Website';
    $html = function_exists(__NAMESPACE__ . '\mailHtml') ? mailHtml($d) : '';
    if ($html !== '' && str_contains($html, 'cid:senklot-logo')) {
        try { $mail->addEmbeddedImage(__DIR__ . '/mail-logo.png', 'senklot-logo', 'senklot.png', 'base64', 'image/png'); }
        catch (\Throwable) { $html = mailHtml($d, false); }
    }
    $mail->isHTML($html !== ''); $mail->Body = $html !== '' ? $html : $text;
    if ($html !== '') $mail->AltBody = $text;
    $mail->MessageID = '<senklot-' . $d['requestId'] . '@senklot.at>';
    if (!$mail->send()) throw new \RuntimeException('Versand nicht bestätigt');
}

function verarbeiten(string $method, array $headers, string $body, string $ip, array $c, callable $verify, callable $send, Speicher $store): array {
    if ($method !== 'POST') return antwort(405, ['message' => 'Methode nicht unterstützt.'], ['Allow' => 'POST']);
    $origin = $headers['origin'] ?? '';
    if (!in_array($origin, $c['origins'] ?? [], true)) return antwort(403, ['message' => 'Bitte öffne das Formular auf der Senklot-Website.']);
    if (!$store->rate($ip)) return antwort(429, ['message' => 'Bitte versuche es später erneut oder kontaktiere uns direkt.'], ['Retry-After' => '900']);
    if (!preg_match('~^application/json(?:\s*;|$)~i', $headers['content-type'] ?? '')) return antwort(415, ['message' => 'Bitte sende das Formular erneut.']);
    if (strlen($body) > MAX_BODY) return antwort(413, ['message' => 'Die Anfrage ist zu groß.']);
    try { $raw = json_decode($body, true, 16, JSON_THROW_ON_ERROR); } catch (\Throwable) { return antwort(400, ['message' => 'Bitte prüfe deine Angaben.']); }
    $v = validieren($raw);
    if (isset($v['errors'])) return antwort(422, ['message' => 'Bitte prüfe die markierten Angaben.', 'fields' => $v['errors']]);
    $d = $v['data']; $fp = $store->fingerprint($d); $status = $store->status($d['requestId'], $fp);
    $fertig = fn() => antwort(200, ['code' => 'ACCEPTED', 'message' => 'Vielen Dank. Deine Anfrage wurde übermittelt. Wir melden uns bei dir.']);
    if ($status === 'accepted') return $fertig();
    if ($status !== 'new') return antwort(409, ['message' => 'Diese Anfrage wird bereits verarbeitet oder ihre Zustellung ist unklar. Bitte sende sie nicht mehrfach; du erreichst uns auch per E-Mail oder Telefon.']);
    $protection = schutzmodus($c);
    if ($protection === 'turnstile') {
        if (!$d['spamschutzZugestimmt']) return antwort(403, ['message' => 'Bitte aktiviere die beschriebene Sicherheitsprüfung oder kontaktiere uns direkt.']);
        if ($d['token'] === '') return antwort(403, ['message' => 'Bitte schließe die Sicherheitsprüfung ab.']);
        try { $r = $verify($d['token'], $ip); } catch (\Throwable) { return antwort(503, ['message' => 'Die Sicherheitsprüfung ist momentan nicht erreichbar. Deine Angaben bleiben erhalten.']); }
        if (($r['success'] ?? false) !== true || ($r['action'] ?? '') !== 'contact' || ($r['hostname'] ?? '') !== parse_url($origin, PHP_URL_HOST)) return antwort(403, ['message' => 'Die Sicherheitsprüfung ist nicht mehr gültig. Bitte wiederhole sie.']);
    } elseif ($protection === 'local') {
        $checked = $store->lokalPruefen($d['token'], $ip, $origin);
        if ($checked === 'early') return antwort(429, ['code' => 'FORM_TOO_EARLY', 'message' => 'Bitte warte einen Moment und sende die Anfrage dann erneut.'], ['Retry-After' => (string) LOCAL_MIN_SECONDS]);
        if ($checked !== 'valid') return antwort(403, ['code' => 'FORM_TOKEN_INVALID', 'message' => 'Das Formular wird neu vorbereitet. Deine Angaben bleiben erhalten; bitte sende danach erneut.']);
    } else return antwort(503, ['message' => 'Das Formular ist momentan nicht verfügbar.']);
    $status = $store->status($d['requestId'], $fp, true);
    if ($status === 'accepted') return $fertig();
    if ($status !== 'reserved') return antwort(409, ['message' => 'Diese Anfrage wird bereits verarbeitet. Bitte sende sie nicht mehrfach.']);
    try { $send($d, mailText($d, $protection)); $store->setzen($d['requestId'], 'accepted'); return $fertig(); }
    catch (\Throwable) { try { $store->setzen($d['requestId'], 'uncertain'); } catch (\Throwable) {} return antwort(502, ['message' => 'Die Zustellung konnte nicht bestätigt werden. Bitte sende dieselbe Anfrage nicht mehrfach. Deine Angaben bleiben erhalten; du erreichst uns direkt per E-Mail oder Telefon.']); }
}
