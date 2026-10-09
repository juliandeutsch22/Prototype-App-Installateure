# Erneute Prüfung vor der Merge-Freigabe

Stand: 09.10.2026. **Noch keine Abschlussfreigabe. Kein Merge oder Deployment.**
Der Nutzer verlangt erst den Abgleich des neuesten Stands und ein konkretes
Prüfergebnis; danach entscheidet er über ein neues Go.

## Neuester Repository-Stand und bereits eingebrachte Änderungen

Main wurde erneut per `git fetch origin --prune` eingelesen:
`078429f33f63e29ea1df2a84fb55458fc1956cab`, PR #257 mit Mitarbeiterübersicht,
Einsatzplanung und Monat. Alle Arbeitsthemen bauen auf diesem Main auf.
Der andere Entwicklungsbranch `claude/focused-goldberg-nfa54k` hat dieselbe
Git-Tree-Kennung wie Main (`62d8e65e14581a051e564d5fbca2b0bfcc6c2fcf`). Seine
anders aufgeteilten Commits werden nicht noch einmal übernommen. Keine offenen
PRs zum Zeitpunkt des Abgleichs.

Von den 181 in #257 geänderten Dateien bleiben 176 unverändert: 175 vorhandene
Dateien sind bytegleich, das in R4 entfernte MonatsRaster bleibt entfernt. Die fünf Überschneidungen sind drei Dokumentationen, die gezielte
Artikelabfrage im Einsatzformular und zusätzliche Vorschau-Ersatzfunktionen.
Nachweis: [r4-erhalt.json](nachweise/r4-erhalt.json). Insbesondere die neue
Mitarbeiterübersicht, Wochen-/Monatsplanung, ihre Komponenten und Referenzen
sind erhalten.

Die Ersetzungen von `person_auskunft` und `person_loeschen` wurden gegen die
jeweils neuesten Definitionen auf Main verglichen: die bereits eingebrachte
Auskunft zu angelegten Zeitbuchungen bleibt enthalten; Mahnbelege und Journal
ergänzen die bisherigen Auskunfts- und Aufbewahrungsregeln.

## Belegte Korrekturen dieser Nachprüfung

- Archiv: Mahnstufen-Metadaten werden nur für die im Zeitraum gemahnten
  Rechnungen gelesen. Frühere Stufen derselben Rechnung bleiben berücksichtigt,
  auch bei einer Rechnung aus einem Vorjahr. PDF-Inhalte werden hier nicht
  geladen. Datenbank-Gegenprobe: vorher genau ein Fall rot, sieben bestehende
  Fälle grün; UI-Gegenprobe ebenfalls rot. Die korrigierten Fälle sind grün.
- Bestehender Urlaub-Migrationstest: spielte alte und alle späteren Migrationen
  erneut über den laufenden Gesamtstand. Mit einer bereits vorhandenen neuen
  Tabelle brach er ab und ließ ältere Funktionsdefinitionen zurück. Gegenprobe:
  genau dieser Fall rot, elf bestehende Fälle grün. Jetzt laufen alte Migration
  und Bestandsprüfung in einer zurückgerollten Transaktion. Die Übernahme der
  sechs Urlaubstage, drei Anträge und der aktivierte Trigger werden weiterhin
  geprüft; alle aktuellen Funktionsdefinitionen sind danach exakt wie vorher.
  Keine produktive Migration dafür umgeschrieben.
- Neue Live-Aktualisierung: zusätzliche Prüfung einer tatsächlich angelegten
  Anforderung sowie Fremdbetrieb-Abweisung mit erfolgreicher eigener
  Kontrolländerung. Die bestehenden 18 Abonnementfälle bleiben erhalten.
- API-Vertragsreferenz: nur drei beabsichtigte optionale Erweiterungen nachgeführt.
  Tatsächliche TypeScript-Gegenprüfung bestätigt, dass die alten Aufrufe weiterhin
  kompatibel sind; keine bestehende API entfernt oder Pflichtparameter ergänzt.
- Abfrageprüfung: explizite Datums- und Rechnungs-ID-Grenzen sowie der bestehende
  Filter laufender Vorgänge werden korrekt erkannt. Keine Finanzsumme abgeschnitten,
  um eine Prüfung grün zu bekommen.
- Widersprüchliche Dokumentation über noch fehlende Monatsübersicht und reine
  Suche im Geladenen korrigiert. Neue R4-Dokumentation bleibt erhalten.
- Materialleserechte: eine ungefilterte Anfrage musste 40.000 fremde Artikel
  ausschließen und lief vorher sowohl für das aktive als auch das deaktivierte
  Kontrollkonto in das unveränderte SQL-Zeitlimit (zwei Fälle rot, Bestandszahl
  grün). Die sitzungsabhängigen Teile der vorhandenen Leseregel werden jetzt
  einmal je Aussage ausgewertet. Betriebsmitgliedschaft, gültige Supportfreigabe,
  Rollen und sämtliche Schreibregeln bleiben erhalten. Danach 146 Datenbankfälle
  einschließlich alter Rechte-, Support- und MFA-Prüfungen grün.
- Monatskalender: nur die Wochenendüberschriften unterschritten mit zusätzlicher
  Deckkraft 70 % den Kontrast (2,81 statt mindestens 4,5). Der normale vorhandene
  Textfarbwert behebt genau diese vier Breitenbefunde. Keine Kalenderlogik,
  Geometrie oder R4-Ansicht umgeschrieben; 15 bestehende Kalender-/Monatsfälle grün.
- Testaufbau für große Bestände: 30.001 künstliche Push-Aufrufe gleichzeitig
  störten lokale Verbindungen. Nur beim direkten SQL-Aufbau der synthetischen
  Bestandsdaten ist der Push-Auslöser innerhalb einer Transaktion ausgenommen;
  vor den eigentlichen Prüfungen ist er nachweislich wieder aktiv. Alle
  Leserechte, weiteren Auslöser, Zeilenzahlen und API-Zeitlimits bleiben erhalten.
- Aufräumen des neuen 40.001-Artikel-Testbestands: die CI-Prüfungen selbst waren
  grün, jedoch überschritt dessen abschließende Löschung die 60-Sekunden-Frist.
  Für diese Bereinigung gilt jetzt dieselbe 120-Sekunden-Frist wie für den Aufbau.
  Keine API- oder SQL-Frist erhöht, keine Prüfung ausgelassen oder wiederholt.
  Der gemeinsame Testhelfer weist zudem fehlgeschlagene Firmen-/Personenanlage
  sofort aus, statt erst später einen Fremdschlüsselfehler zu erzeugen.
- Aufbau des 12.001-Rechnungen-Archivtests: ein HTTP-Fehler verhinderte in CI
  die eigentliche Leseprüfung. Der synthetische Bestand mit identischen Rechnungs-,
  Positions- und Abdeckungsdaten entsteht jetzt direkt in einer lokalen
  SQL-Transaktion. Alle Datenbankauslöser bleiben aktiv; der eigentliche
  Archivabruf erfolgt weiterhin über die echte API. Keine Zeilenzahl, Rechte-,
  Eindeutigkeits-, Kinddaten- oder Zeitraumprüfung entfernt. Danach drei
  Archivfälle einschließlich 601 Angeboten/Scheinen lokal grün (9,74 Sekunden).
- Schema-Wächter: akzeptiert vier ganze, klammergenaue gepufferte SELECT-Regeln,
  statt diese trotz identischer Rechte als ungeschützt zu melden. Keine
  Tabellen-Ausnahmeliste. Zusätzliche echte Datenbank-Gegenprüfung weist
  `OR true` und eine bloße Anmeldung weiterhin ab; 16 Schemafälle grün.


## Erneute kritische Codeprüfung

Der eigene Funktions- und Migrationsdiff wurde nochmals gegen den neuesten
Main sowie gegen unveränderte Aufrufer geprüft:

- Annahme eines Angebots: beide UI-Wege benutzen dieselbe Transaktion; aktuelle
  Angebotsdaten, parallele Annahme, bestehende Baustelle, Nummernkreis und
  vollständiger Rollback bleiben zusammen. Keine zweite Baustelle bei Wiederholung.
- Finanzen und Archiv: Bildschirmseiten begrenzen keine Zahlungs-, Einkaufs-
  oder Archivsumme. Datums-/ID-Filter, Stornobelege aus Vorjahren, Kindzeilen
  und frühere Mahnstufen derselben Rechnung sind vollständig berücksichtigt.
- Listen: Suche und Baustellenfilter laufen vor der Seitengrenze; der Cursor
  erhält Mikrosekunden und die Eilpriorität. Alte Antworten werden verworfen,
  bereits nachgeladene Seiten bleiben bei Aktualisierung berücksichtigt.
- Rechte und Datenschutz: eigene/fremde Betriebe, deaktivierte Konten,
  Unterstützung, Buchhaltung, delegierte Genehmigende und private Gründe
  bleiben getrennt. Neue Funktionen besitzen feste Suchpfade und begrenzte
  Ausführungsrechte. Datenauskunft, Aufbewahrung und Sicherungsrücklauf
  enthalten die neuen personenbezogenen Tabellen; ältere Auskunftsfelder bleiben.
- Zeitjournal: tatsächlicher Bearbeiter aus dem Anmeldekontext, keine erfundenen
  Import-/Alt-Ereignisse, keine Änderung an Mengen, Stunden oder Lohnrechnung.
- MFA: Einrichtung ausschließlich global verpflichtend, Betriebskonten freiwillig.
  Gültige gespeicherte aal2-Sitzungen verlangen keinen neuen Code. Abmelden und
  Ablauf sowie freiwillig eingerichtete Faktoren bleiben geschützt.
- Oberfläche: die R4-Komponenten bleiben erhalten. Fokus, Lade-/Leer-/Fehlerzustände,
  Nachladen, 200 Layoutfälle und 128 axe-Fälle wurden kontrolliert. Acht
  Layoutmeldungen wurden anhand von CSS und aktuellen Bildschirmbildern geprüft:
  absichtliche unsichtbare Zusatzbeschriftungen, Namensellipse und Zahlüberlauf
  in vorhandenen freien Abstand; keine schwerwiegende Überlagerung. Diese
  Meldungen sind im Rohbericht erhalten, der Detektor wurde nicht abgeschwächt.
- Belegreferenzen: neun eigenständige PDF-/CSV-Referenzen unverändert; im alten
  Archiv sind die fünf enthaltenen PDF-/CSV-Dateien bytegleich. Nur dessen
  Hinweise nennen die beauftragte Erweiterung. [Belegvergleich](belegvergleich.md).

## Tatsächliche Nachweise

| Prüfung | Ergebnis |
|---|---|
| Neuester Main | `078429f33f63e29ea1df2a84fb55458fc1956cab`, erneut eingelesen; keine offenen PRs |
| Migrationen von null | 185 auf lokaler Datenbank, neueste `20261009103000` |
| Typen / Lint / Produktionsbuild | erfolgreich; aktueller Build 14,04 Sekunden |
| Vollständige Einheitssuite | 4.697 Fälle / 304 Dateien grün, auch GitHub-CI |
| Vollständige lokale Datenbanksuite | 1.822 Fälle / 156 Dateien grün, 609,16 Sekunden |
| Echte Browserwege | 55 grün: Chromium, Tablet und WebKit-Telefon |
| Links je Rolle | sieben grün |
| Layout | 40 Ansichten × fünf Breiten = 200 Fälle; acht Meldungsansichten, null schwerwiegend |
| Barrierefreiheit | axe 4.14.0, 16 Ansichten × vier Breiten × hell/dunkel = 128; null Verstöße und JavaScriptfehler |
| Kontrollierte große Sicherung | 95.003 Geschäftszeilen plus Firma/Person, 72,9 MB, Firmen- und Dienstweg vollständig grün |
| Erneutes Abhängigkeitsaudit | Produktion null; gesamt elf Entwicklungspakete wegen eines offenen braces-Advisory |

Nachweise liegen in [nachweise/](nachweise/). Die lokale Gesamtsuite lief am
Stand `55d7d87`; danach wurden nur Testhelfer, Aufräumfrist, Dokumentation und
ein überholter Typkommentar angepasst. Der produktive Funktionscode blieb dabei
unverändert. Die abschließende GitHub-Datenbanksuite prüft auch diese Teständerungen.

GitHub-Prüfung des Stands `983a8cb`:

- [Typen, Lint und Einheitssuite](https://github.com/juliandeutsch22/Prototype-App-Installateure/actions/runs/37923637315): grün; Hosting-Deploy übersprungen.
- [Browser und Rollenlinks](https://github.com/juliandeutsch22/Prototype-App-Installateure/actions/runs/37923640633): 55 Browser- und sieben Rollenfälle grün.
- [Migrationen und Datenbanksuite](https://github.com/juliandeutsch22/Prototype-App-Installateure/actions/runs/37923595124): 1.821 Fälle grün, ein Archivfall wegen HTTP-Fehler im Aufbau nicht ausgeführt; Gesamtcheck rot.

Die vorherigen roten Gesamtläufe bleiben als Nachweise erhalten. Die erste
lokale Proxy-/Migrationstest-Kombination war ungültig. Ein späterer lokaler
Lauf hatte fünf Fehler: zwei Schema-Fehlklassifikationen, Material-SQL-Zeitlimit
und zwei Sicherungsabbrüche. Die Schema- und Materialkorrekturen sind durch
Gegenproben belegt. Der isolierte große Sicherungslauf und die vollständige
lokale Wiederholung sind jetzt ohne Änderung der Sicherungsfunktion grün.
Die frühere GitHub-Prüfung `ba60002` war mit 1.817 grünen, einem roten und vier
übersprungenen Fällen sowie einem fehlgeschlagenen Aufräum-Hook nicht grün.
Sie wird nicht durch erfolgreiche Teilprüfungen ersetzt. Der überholte Lauf
`55d7d87` wurde zugunsten der Prüfung des korrigierten aktuellen Stands abgebrochen.
`983a8cb` beseitigt die übrigen Aufbau-/Bereinigungsfehler, bleibt aber wegen
des einen nicht ausgeführten Archivfalls rot. Das neue Testaufbauverfahren
wird deshalb nochmals in der vollständigen GitHub-Datenbanksuite geprüft.

## Verbleibende Grenzen vor einem abschließenden Go

1. GitHub-Datenbank- und Browserabschluss für den letzten Stand abwarten.
   Kein Merge auf Grundlage eines noch laufenden oder roten Gesamtchecks.
2. Leistungsbudgets sind noch nicht überall erreicht. Der kontrollierte lokale
   Belastungslauf hat zwölf Seiten ohne erfasste API-/Browserfehler, aber für
   die Mitarbeiterübersicht 118,1 Sekunden bis Netzruhe und 22,2 MB auf
   gedrosseltem langsamen 4G. Erste Anzeige 1,5 Sekunden, Seitenkopf 2,7 Sekunden.
   Das ist keine gemessene Produktionsladezeit: die lokale API liefert selbst
   auf ausdrückliche gzip-Anfrage unkomprimiert (500 geprüfte Zeilen, 410.498 Bytes).
   Datenmenge und Antwortkomprimierung müssen vor einer Leistungsfreigabe
   getrennt geklärt werden. Jahreszeiten und Gesamtzeiten für Baustellenbudgets
   werden fachlich benötigt; keine Zeilen für bessere Messwerte abschneiden.
   Der Accounting-Code ist gegenüber Main unverändert.
   [Messwerte](../ui-umbau/messung-nachher.md),
   [Komprimierungsnachweis](nachweise/perf-komprimierung-local.json).
3. Ein vollständiger maschineller UI-Bestandsvergleich ist nicht belegt:
   ursprünglicher Vorherbestand mit 66 unvollständig erfassten Seiten,
   leere maschinelle Zuordnung. Die aktuellen Layout-/axe-/Browserprüfungen
   sind aussagekräftige Teilnachweise, kein nachträglich erfundener Vollvergleich.

Live-Auslieferung und produktive Header werden erst nach dem neuen Go und
Deployment geprüft. Echte Geräte, Kanzlei-/WKO-/Anwaltsabnahme, produktiver
VIES-Abruf, externes Sicherungsziel samt Rücklauf und Pilotbetrieb bleiben
separate betriebliche Nachweise; lokale Tests ersetzen sie nicht. Fehlende
Betreiberdaten und Anbieterzugänge werden nicht erfunden.

**Keine Behauptung „alles vollständig funktioniert“, solange diese Grenzen
nicht geklärt sind. Main und Produktion wurden nicht verändert.**
