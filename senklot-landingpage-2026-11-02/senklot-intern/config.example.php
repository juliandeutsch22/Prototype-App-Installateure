<?php
declare(strict_types=1);
if (realpath($_SERVER['SCRIPT_FILENAME'] ?? '') === __FILE__) { http_response_code(403); exit; }

// Auf dem Webspace zu config.php kopieren. Echte Werte niemals in Git/Chat speichern.
return [
    'enabled' => false, // Erst nach Einrichtung und Prüfung auf true setzen.
    'legal_ready' => false, // Betreiberangaben und Rechtstexte vor Freischaltung vervollständigen/freigeben.
    'origins' => ['https://senklot.at', 'https://www.senklot.at'],
    'data_dir' => __DIR__ . '/speicher', // Nur für PHP beschreibbar; nie chmod 777.
    'smtp' => [
        'host' => 'smtp.world4you.com', // Mit den Kontodaten im World4you-Portal abgleichen.
        'port' => 587,
        'security' => 'tls', // STARTTLS/587; alternativ ssl/465, falls so angegeben.
        'username' => '', // Vollständige E-Mail-Adresse des Versandpostfachs.
        'password' => '',
        'from' => 'office@senklot.at', // Muss für dieses Postfach als Absender erlaubt sein.
        'from_name' => 'Senklot',
    ],
    'turnstile' => [
        'site_key' => '', // Öffentlicher Site-Key; senklot.at im Cloudflare-Konto freigeben.
        'secret_key' => '', // Privater Secret-Key. Keine öffentlichen Testschlüssel verwenden.
    ],
];
