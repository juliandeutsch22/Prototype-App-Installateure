<?php
declare(strict_types=1);
namespace SenklotWeb;
if (realpath($_SERVER['SCRIPT_FILENAME'] ?? '') === __FILE__) { http_response_code(403); exit; }

/** Daten werden vor der HTML-Ausgabe unabhängig von der Formularvalidierung maskiert. */
function mailHtml(array $d, bool $logo = true): string {
    $file = __DIR__ . '/mail-vorlage.html';
    if (!is_readable($file)) return ''; // Ein fehlendes Gestaltungsmittel darf den Klartextversand nicht verhindern.
    $template = file_get_contents($file);
    if (!is_string($template)) return '';
    $e = fn(mixed $v): string => htmlspecialchars((string) $v, ENT_QUOTES | ENT_SUBSTITUTE, 'UTF-8');
    $tarife = json_decode(file_get_contents(__DIR__ . '/tarife.json'), true, 8, JSON_THROW_ON_ERROR);
    $angebot = json_decode(file_get_contents(__DIR__ . '/angebot.json'), true, 8, JSON_THROW_ON_ERROR);
    $t = $tarife[$d['tarif'] ?? 'offen'] ?? null;
    $yearly = ($d['zahlung'] ?? '') === 'jaehrlich';
    $line = fn(string $text): string => '<p style="margin:9px 0 0;font-size:12px;line-height:1.8;color:#536a72;">' . $e($text) . '</p>';
    $auswahl = '<p style="margin:0;font-size:16px;line-height:1.5;font-weight:500;color:#0f4552;">' . $e($t['name'] ?? 'Tarif noch offen') . '</p>';
    if ($t) {
        $betrag = $yearly ? intdiv($t['monatCent'] * 12 * 90, 100) : $t['monatCent'];
        $auswahl .= '<p style="margin:10px 0 0;font-size:23px;line-height:1.5;font-weight:400;color:#0f4552;">' . $e(euro($betrag)) . '<span style="font-size:12px;"> netto / ' . ($yearly ? 'Jahr' : 'Monat') . '</span></p>';
        $auswahl .= $line($yearly ? 'Jährliche Vorauszahlung mit 10 % Rabatt.' : 'Monatliche Abrechnung.');
    } else $auswahl .= $line($yearly ? 'Gewünschte Abrechnung: jährlich.' : 'Gewünschte Abrechnung: monatlich.');
    $setup = !empty($d['einrichtung']) ? ($t ? 'Optionale Einrichtung angefragt: ' . euro($t['einrichtungCent']) . ' netto einmalig.' : 'Optionale Einrichtung angefragt; Umfang und Preis vorab klären.') : 'Keine begleitete Einrichtung angefragt. Keine Einrichtungsgebühr bei eigenständigem Start.';
    $auswahl .= $line($setup) . $line($angebot['preisbindung']);
    $rows = '';
    foreach (['Name' => $d['name'] ?? '', 'E-Mail' => $d['email'] ?? '', 'Telefon' => ($d['telefon'] ?? '') ?: 'Nicht angegeben', 'Mitarbeiter / Nutzer' => $d['nutzer'] ?? 'Nicht angegeben'] as $label => $value) {
        $rows .= '<tr><th scope="row" align="left" valign="top" style="width:39%;padding:11px 12px 11px 0;border-bottom:1px solid #c6d5da;font-size:12px;line-height:1.8;font-weight:400;color:#536a72;">' . $e($label) . '</th><td valign="top" style="padding:11px 0;border-bottom:1px solid #c6d5da;font-size:13px;line-height:1.8;overflow-wrap:anywhere;word-break:break-word;">' . $e($value) . '</td></tr>';
    }
    $brand = $logo && is_readable(__DIR__ . '/mail-logo.png') ? '<img src="cid:senklot-logo" alt="Senklot" width="176" style="display:block;width:176px;max-width:100%;height:auto;border:0;">' : '<span style="font-size:28px;line-height:1.4;color:#0f4552;">Senklot</span>';
    return strtr($template, [
        '{{PREHEADER}}' => $e('Neue Anfrage von ' . ($d['firma'] ?? 'einem Interessenten')),
        '{{MARKE}}' => $brand, '{{FIRMA}}' => $e($d['firma'] ?? 'Allgemeine Anfrage'), '{{AUSWAHL}}' => $auswahl,
        '{{KONTAKT}}' => $rows, '{{NACHRICHT}}' => nl2br($e(($d['nachricht'] ?? '') ?: 'Keine zusätzliche Nachricht.')),
        '{{REQUEST_ID}}' => $e($d['requestId'] ?? ''), '{{ANTWORTLINK}}' => $e('mailto:' . rawurlencode($d['email'] ?? '')),
    ]);
}
