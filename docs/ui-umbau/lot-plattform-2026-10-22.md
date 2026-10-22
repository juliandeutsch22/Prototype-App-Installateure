# Lot: globale Plattformverwaltung vom 22.10.2026

Grundlage: App-Stand `7b223888c7e2c92e30a940868a8b08d81162d87c` und der
[freigegebene Plattform-Entwurf mit 25 Ansichten und Zuständen](https://github.com/juliandeutsch22/Prototype-App-Installateure/blob/98aff96ea57c4d1fd4bbdf4c570808db9f6609d0/lot-plattform-2026-10-22/README.md).
Startauftrag: „finde ich gut, setze es so um. Sei genau und es darf wie immer durch den umbau keine Funktion verloren gehen.“

## Umsetzung

Die bisher lange Einzelseite ist in lokale Plattformbereiche gegliedert:
Betriebe, Supportzugänge, Fehlerprotokoll, Basiszinssatz; das eigene Konto
liegt im Markenband. Die Route bleibt `/plattform`. Es entsteht kein
Betriebsmenü und keine zusätzliche Berechtigung.

Die Betriebsübersicht beginnt mit der Suche und einer alphabetischen Liste.
Aktiv / Deaktiviert filtern die bereits geladenen Daten; eine neue Suche
wechselt auf Alle. Gruppen zeigen zunächst zwanzig Treffer, weitere bleiben
über „weitere anzeigen“ erreichbar. Die Suche durchsucht vor der Begrenzung
alle geladenen Betriebe. Name, Kennung, Anlagedatum, Leitungskonten und
sämtliche bisherigen Verwaltungszustände bleiben erhalten.

Einrichten ist in Betrieb und ersten Zugang gegliedert. Das Ergebnis steht
direkt nach Erfolg im Vordergrund; alle in dieser Sitzung erzeugten Links
und Startpasswörter bleiben aus der Übersicht erreichbar. Bereichs- und
Formularwechsel erhalten Eingaben, Ergebnisse und Wiederherstellungscodes.
Dafür bleiben die React-Bereiche montiert und sind mit `hidden` aus Anzeige,
Tastaturreihenfolge und Zugänglichkeitsbaum genommen. Jede Bereichsseite hat
einen eigenen Hilfe-Provider, damit Erklärungen nicht in fremde Bereiche geraten.
Das ist weiterhin Sitzungsspeicher im React-Zustand; keine Zugangsdaten
werden neu dauerhaft gespeichert.

Betriebsverwaltung bleibt im vorhandenen Seitenfenster / mobilen Blatt.
Eine schmale beschriftete Linie ordnet die vorhandenen Schritte ein. Alle
Gründe, Zeitgrenzen, Exportteile, Ergebnis- und Teilfehlermeldungen,
Testausnahmen und Bestätigungen bleiben. Das Ergebnis einer Löschung bleibt auf der Übersicht sichtbar, auch wenn der Betrieb samt Fenster verschwindet; dies schließt ausdrücklich Hinweise auf gesperrte, nicht entfernte Anmeldekonten ein. Mobil ist die ganze Zeile das Ziel;
der seltene Notzugang liegt einen Schritt weiter im Verwaltungsfenster.
Zusätzlich führt der direkte Notzugang im Übersichtskontext ins Formular.

Supportzugänge zeigen Betrieb, Umfang, Grund und Ablauf zusammen. Ansehen,
Mitarbeiten und Notzugang behalten ihre bestehenden Grenzen. Wiederherstellung
steht als eigener Vorgang; die bestehenden Komponenten führen weiterhin die
Prüfung von Konto, Grund und bestätigtem unabhängigem Rückruf aus. Nach
Verwaltungsschritten werden Betriebsverzeichnis und Freigaben gemeinsam
aktualisiert. Ein fehlgeschlagener Freigabeabruf erscheint mit erneutem
Versuch und wird nicht als leere Freigabeliste ausgegeben.

Gemeldete Probleme und technische Fehlergruppen bleiben getrennt. Zeitraum,
Gruppierung, Wiederholungen, Betroffene, Fassungen, Ansichten und aufklappbare
Gerät-/Stapeldetails bleiben. Es gibt keinen neuen Bearbeitungsstatus.
Zentrale Zinsen, ihr Entfernen / Ersetzen und negative Eingaben bleiben;
eigenes Passwort, verpflichtender zweiter Faktor, neue Wiederherstellungscodes
und Abmelden ebenfalls.

Mobil steht die lokale Bereichswahl offen in zwei Zeilen. Kontext folgt unter
der Arbeitsfläche. Die Hauptaktion bleibt hier im Kopf, weil die Plattform
keine mobile Betriebsnavigation besitzt. Das Menü der Betriebs-App bleibt
vollständig unverändert. Hell und gewähltes Dunkel verwenden dieselben Tokens.

## Funktionserhalt und Klickwege

[Elementzuordnung](zuordnung-lot-plattform-2026-10-22.json) mit alten und neuen
Wegen. Zusätzlich gilt der vollständige
[fachliche Funktionsabgleich des Entwurfs](https://github.com/juliandeutsch22/Prototype-App-Installateure/blob/98aff96ea57c4d1fd4bbdf4c570808db9f6609d0/lot-plattform-2026-10-22/Funktionsabgleich.md).

Keine Änderung an Datenschicht, Datenmodell, Migrationen, Routen, Rechten,
Fachberechnungen oder bestehenden Beleg-/Exportfunktionen. Die Oberfläche
reicht weiterhin dieselben Daten an dieselben Funktionen weiter. Die
Zwei-Faktor-Sperre vor der Plattform und das anschließende Öffnen der echten
Betriebs-App bei gewährtem Einblick bleiben unverändert.

## Prüfstand

Siehe [Abnahme und Grenzen](abnahme/lot-plattform-2026-10-22.md).

Neue Verhaltensprüfungen schützen Bereichswechsel, einmalige Übergabe,
Notzugangsauswahl, Freigabestufe, große Listen, Fehlerwiederholung und eigenes
Konto. Dieselben sieben Prüfungen sind gegen den unveränderten Ausgangsstand
rot (isolierter Arbeitsbaum), mit dem Umbau grün. Bestehende fachliche
Komponentenprüfungen wurden nur auf die neuen Klickwege geführt.

Zwei neue echte Browserabläufe gegen den lokalen Supabase-Stapel laufen in
Chromium, Tablet und WebKit am Telefon: E-Mail-Anlage bis Übergabe / Frist /
Reaktivierung sowie Benutzername / Notzugang / identitätsgeprüftes Passwort
bis endgültige Testlöschung. Testkonten sind eindeutig benannt; es werden
keine Produktionsdaten verändert. Der bisherige Zwei-Faktor-Browserweg
meldet über Mein Konto ab und schützt weiterhin Pflicht und Einmaligkeit
der Wiederherstellungscodes.

Die allgemeine Vorschau kann die Plattformrolle nun mit ausdrücklich fiktiven
Daten zeigen. Das ist eine Vorschau-Alias-Konfiguration, keine Änderung an
der produktiven Authentifizierung.
