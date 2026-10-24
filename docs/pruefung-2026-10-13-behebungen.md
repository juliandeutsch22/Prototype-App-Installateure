# Verlässliche Schreibwege und Sicherungen — 13./14.10.2026

Ausgangspunkt: `fb13f7a3`, Arbeitszweig `fix/verlaessliche-schreibwege`.
Die 13 Befunde der Projektdurchsicht sind im Arbeitsstand behoben. Dieser
Bericht beschreibt lokale Ergebnisse; die Änderungen sind nicht produktiv
ausgeliefert. Produktionsdaten wurden weder geprüft noch verändert.

## Änderungen und Absicherung

| Befund | Änderung | Nachweis |
|---|---|---|
| F01 — zwei Nachsender überschreiben neuere Daten | Gemeinsame Sperre für frische und nachgesendete Schreibvorgänge; wiederholtes Anlegen überschreibt keine vorhandene Zeile | Zwei echte Browser-Tabs, Web Locks und IndexedDB-Ersatz; Datenbank erhält eine zwischenzeitliche Änderung |
| F02 — doppelte Baustellen bei Angebotsannahme | Annahme, Nummer und Baustelle in einer gesperrten Datenbanktransaktion; Wiederholung liefert dieselbe Baustelle | Parallele Annahme, Wiederholung, Rollen, Kundenbezug, Budget, Beschreibung und alle drei Abrechnungsarten |
| F03 — abgeschnittene Zahlungen | Standardmäßige Grenzen von 100 bzw. 2.000 entfallen; ausdrücklich angeforderte Grenzen bleiben erhalten | 2.501 Zahlungen und absichtlich begrenzte Abfrage |
| F04 — Exportdaten passen nicht zum Zeitraum | Zeitraumwechsel verwirft das Ergebnis; verspätete Antworten dürfen den neuen Stand nicht ersetzen | Zurückgehaltene Antwort, Zeitraumwechsel und erneutes Laden im Ansichtstest |
| F05 — halbe Wartungseinplanung | Baustelle und Zuordnung in einer Transaktion; Wiederholung nutzt vorhandene Zuordnung; veralteter Fälligkeitstermin wird abgewiesen | Parallelität, manuelle Nummer, aktuelle Adresse/Kundenname, fremder Betrieb, Rückrollen bei Nummernkonflikt |
| F06 — Mitarbeiteranlage ohne Wiederanlauf | Vorgangskennung und Anfangspasswort bleiben im Tab bis zum gespeicherten Profil erhalten; serverseitiger Herkunftsnachweis erlaubt nur die eigene Wiederaufnahme; Profil wird nur neu angelegt | Profilfehler und Wiederholung; verlorene Antwort; verlorener Tab mit ausdrücklicher Passwortvergabe in der Akte; Ablehnung fremder Konten |
| F07 — hängender erster Schreibversuch geht verloren | Dauerhaftes Ablegen vor dem Netzversuch; nach vier Sekunden kann die Maske weitergehen, während Reihenfolge und Sperre erhalten bleiben | Tab schließen während hängender Antwort, neu öffnen und nachsenden; beide Browser-Sperrverfahren |
| F08 — scheinbar bestätigte Änderung ohne IndexedDB | Online-Ersatzweg fordert genaue Zahl geänderter Zeilen; null Zeilen sind ein Fehler | Null und eine geänderte Zeile |
| F09 — Suchfehler wirkt wie keine Treffer | Eigener Fehlerzustand mit erneutem Versuch | Suchfehler, Wiederholung und Löschen des Suchbegriffs |
| F10 — Sicherung mischt Datenzeitpunkte | Alle Datenbanktabellen werden in einem SQL-Snapshot in eine private, unveränderliche Arbeitskopie gelesen; Ausgabe daraus seitenweise | 15 Sicherungen während 15 gleichzeitiger Änderungen zusammengehöriger Tabellen; mehrteilige Sicherung mit Wiederherstellung |
| F11 — Testdateien bleiben im Storage | Gezieltes Aufräumen ausschließlich des bekannten Testnamensraums über die Storage-API; Reset nur gegen lokale Datenbank/API | Wiederholte Suite; Datei außerhalb des Testnamensraums bleibt erhalten |
| F12 — Sicherung ohne Firmenstammsatz | Fehlender Firmenstammsatz bricht den Snapshot ab; Zeilenzahl schützt zusätzlich gegen gelöschte Arbeitskopien | Fehlende Firma, Snapshot-Zählung, normale und mehrteilige Ausleitung |
| F13 — wiederverwendete pg_net-Kennung nach Absturz | Wächterkennung besteht aus Anfragenummer und Generation; Generation ist wie pg_net unlogged, bleibt bei geordnetem Neustart erhalten und geht bei Crash-Recovery verloren | Verlust des unlogged Zustands kontrolliert simuliert; alte und neue Anfrage mit identischer Nummer werden getrennt behandelt |

Die Arbeitskopie der Sicherung ist nur für den Dienst lesbar. Nach Abschluss
wird sie entfernt; liegengebliebene Kopien räumt der stündliche Auftrag nach
24 Stunden auf (bei laufendem Zeitplan höchstens 25 Stunden). Die
Personenauskunft nennt vorhandene Kopien und ihre Frist, ohne Daten anderer
Personen auszugeben. Eine tatsächliche Personenlöschung verwirft die
Arbeitskopien des Betriebs; ihre Vorschau verändert sie nicht. Fertige
Sicherungen behalten die bereits geltenden Aufbewahrungsregeln.

## Prüfungen

- Vollständige Unit-/Komponentensuite: **5.085 bestanden** in 332 Dateien.
- Vollständige Datenbanksuite am endgültigen Stand: **1.895 bestanden**
  in 159 Dateien, einschließlich sämtlicher fünf neuer Migrationen,
  Wiederaufnahme, Auskunft/Löschung, gleichzeitiger Sicherung und
  36-MB-Ausleitung samt Rücklauf.
- Nach Verschiebung des Angebotsadapters hinter die öffentliche Fassade:
  **56 bestanden** für Angebotsansicht, Fassadenvertrag und Vorschau.
- Browser: **72 unterschiedliche Fälle bestanden**, ein Desktop-Fall
  planmäßig übersprungen (er prüft ausschließlich die Tablet-Seitenleiste).
  Der vollständige Lauf bestand mit 71 Fällen; der neue Wiederaufnahmefall
  lief noch mit einer alten Linkbeschriftung. Nach Übernahme der endgültigen
  Beschriftung bestanden beide Mitarbeiterabläufe erneut (**2/2**),
  einschließlich Profilfehler → Tab schließen → Wiederaufnahme → Passwort
  vergeben → erfolgreiche Anmeldung. Die vier Mehr-Tab-/Wiederöffnungsfälle
  sind in diesen 72 enthalten.
- Linkprüfung der Vorschau: **7 bestanden**.
- Finaler TypeScript-/Produktionsbuild und ESLint bestanden.
- Auslieferungsprüfung: alle **191 Migrationen von null an** lokal eingespielt,
  anschließend erneut **1.895 Datenbanktests bestanden**. PR
  [#310](https://github.com/juliandeutsch22/Prototype-App-Installateure/pull/310)
  veröffentlicht. Die erste Remote-CI fand unter Node.js 20 einen
  ungeschützten Zugriff auf `navigator` in der Fachsperre. Der Zugriff ist
  jetzt abgesichert; eine zusätzliche Gegenprobe ist vorher rot/nachher
  grün, und **14 betroffene Tests unter Node.js 20 bestehen**. Der erneute
  Remote-Lauf prüft den endgültigen Stand vor dem Merge.

Insgesamt **7.060 unterschiedliche bestandene Prüfungen**; Teilläufe und
Gegenproben sind nicht zusätzlich gezählt.

Die Gegenprobe mit dem alten Anwendungscode ließ sechs der ausgewählten
neuen Unit-/Ansichtstests fehlschlagen. Mit dem alten Provisionierungscode
scheiterte der neue Wiederaufnahmetest an der fehlenden Vorgangskennung.
Mit dem alten Zahlungsadapter lieferte der echte Datenbanktest nur 2.000
statt 2.501 Zahlungen. Der alte Datenbanksender überschrieb
nachweislich den neueren Stand. Fehlende neue RPCs erklären weitere rote
Tests am alten Stand, sind aber für sich allein kein Parallelitätsnachweis.
Die neuen Parallelitätstests prüfen deshalb zusätzlich den tatsächlichen
Datenbestand. Nicht jeder neue Test wurde einzeln gegen eine passende
Mutation geprüft; das bleibt eine Grenze dieses Nachweises.

Zusätzlich gefunden und behoben: Vorschau und Entwicklungsserver teilten
Vites Optimierungscache. Beim gleichzeitigen Betrieb konnten dadurch
`504 Outdated Optimize Dep` und eine leere Vorschau entstehen. Die Vorschau
verwendet jetzt einen eigenen Cache. Der erste parallele Browser-/Linklauf
teilte außerdem versehentlich seinen Playwright-Ausgabeordner: der
Jugendschutzweg bestand fachlich, scheiterte aber beim Schließen an fehlenden
Trace-Dateien. Die Abschlussläufe verwenden getrennte Ausgabeordner.

Die Abschlussprüfungen lassen sich am eingerichteten lokalen Stack so ausführen:

```sh
npm run lint
npm run build
TZ=Europe/Vienna npx vitest run
NO_PROXY=127.0.0.1,localhost TZ=Europe/Vienna npm run supabase:test
CHROMIUM_PFAD=/usr/bin/chromium NO_PROXY=127.0.0.1,localhost npx playwright test --project=chromium --project=tablet-834 --output=/tmp/senklot-browser
CHROMIUM_PFAD=/usr/bin/chromium NO_PROXY=127.0.0.1,localhost npm run pruefen:links -- --output=/tmp/senklot-links
```

Datenbank- und Browser-Suite nacheinander ausführen: beide richten ihren
lokalen Testbestand ein. Wiederholte Teilläufe sind in den Zahlen nicht
mehrfach gezählt.

## Auslieferungsreihenfolge

1. Alle fünf Migrationen `20261013100000` bis `20261013140000` ausliefern.
   Die zusätzlichen RPCs sind rückwärtskompatibel; keine Geschäftsdaten
   werden bereinigt. Die Datenschutzmigration bricht bei unerwarteter
   Ausgangsfunktion ausdrücklich ab.
2. Edge Functions `mitarbeiter-anlegen` und `daten-ausleitung` ausliefern.
3. Erst danach das Frontend ausliefern. Es benötigt die neuen RPCs.
4. Mit Testdaten im Zielsystem Annahme, Wartung, Mitarbeiteranlage,
   Offline-Nachsenden und Sicherung samt Rücklauf prüfen; laufende Wächter
   und Aufräumauftrag kontrollieren. Alte Browserfassungen sollten neu
   geladen werden, da sie ihre bisherigen mehrteiligen Schreibwege behalten.

## Noch offene Punkte und Grenzen

1. **Review, CI und Auslieferung:** PR #310 ist veröffentlicht. Der
   zunächst blockierte GitHub-API-Zugang funktioniert nach der Netzfreigabe.
   Merge und Auslieferung folgen erst nach erfolgreicher Remote-CI; die
   Auslieferungsprüfung ist in diesem Bericht ein laufender Nachweis.
2. **Altbestände:** Frühere doppelte Baustellen, Teilzuordnungen oder
   profillose Auth-Konten ohne Herkunftsnachweis benötigen eine konkrete
   Bestandsprüfung. Automatisches Zusammenführen/Löschen wäre ohne diese
   Prüfung riskant und wurde nicht eingebaut.
3. **Mitarbeiteranlage ohne bekannten Vorgang:** Mit dem neuen
   Herkunftsnachweis kann ausschließlich der ursprüngliche Ersteller sein
   eigenes profilloses Konto fertigstellen. Das Passwort bleibt dabei
   unverändert. Nach Verlust des Tabs führt die App bei Benutzernamen zur
   ausdrücklichen Startpasswort-Vergabe in der Akte, bei Mailkonten zur
   Passwort-Mail. Scheitert auch die Mail, nennt sie den Fehler und den Weg
   zum erneuten Versand. Alte Konten ohne Herkunftsnachweis werden nicht
   automatisch übernommen. Ein automatischer Passwortwechsel bei neuen
   Vorgangskennungen wurde in der Schlussprüfung entfernt, weil parallele
   Wiederaufnahmen widersprüchliche Passwörter liefern könnten.
4. **Geräte und Infrastruktur:** Safari/iPhone, Kamera, echter Push,
   Installation und Versionswechsel brauchen den Gerätedurchgang.
   SMTP, Domain, externer Sicherungsort und Wiederherstellung im Zielsystem
   bleiben gesonderte Betriebsnachweise. Der neue Snapshot umfasst
   Datenbankzeilen; Storage-Dateien werden weiterhin separat kopiert.
5. **Absturzprüfung:** Der Verlust des unlogged Zustands wurde simuliert;
   ein erzwungener Absturz mit anschließender kompletter Crash-Recovery
   wurde für diese Änderung nicht durchgeführt.
6. **Bestehende Abnahmen:** Kanzleiimport, Betreiber-/Rechtstexte und die
   volle CSP nach Gerätetest bleiben wie in der Projektdurchsicht offen.
   K4 (maschineller UI-Alt-/Neu-Vergleich mit Mengengerüst) und K7
   (Rücksprungtags) sind dadurch ebenfalls nicht erledigt.
7. **Signierte Dokumentlinks:** Ein zuvor ausgegebener Link kann bis zum
   Ablauf seiner Stunde nutzbar bleiben, auch nach Umschalten auf „nur
   Büro“. Sofortiger Widerruf wäre ein gesonderter Abrufweg, kein Teil
   dieser Fehlerbehebung. *Seit 24.10.2026 erledigt (T-42, A14): die Adresse entsteht erst beim Antippen und gilt eine Minute; die Vorschau holt Bilder mit der Anmeldung.*

Zusätzliche Produktvorhaben und bewusste Grenzen stehen weiterhin in
`offene-punkte.md` und im Projektstand; sie werden durch diese Änderungen
nicht zu behaupteten Programmfehlern umgedeutet.
