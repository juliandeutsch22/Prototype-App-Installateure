# Projektanalyse vom 08.10.2026

Ausgangspunkt: `main`, Commit `21e4d94` (Oberfläche „Lot“, PR #256).
Auftrag: Funktionen, Zusammenhänge und Oberfläche prüfen; ausschließlich
nachgewiesene Fehler korrigieren und bestehende Abläufe erhalten.

## Projekt und fachliche Zusammenhänge

Senklot ist eine mandantenfähige Betriebssoftware für österreichische
Installationsbetriebe. React und TypeScript bilden die Oberfläche, Supabase
stellt Anmeldung, Postgres, Zeilenschutz, Dateien, Echtzeitmeldungen und
Serverfunktionen. Firebase bleibt für Hosting und Push. Die Datenschicht
trennt die Ansichten von Postgres; gemeinsame Regeln unter `shared/` werden
auch in die Serverfunktionen übernommen.

Sechs Betriebsrollen und ein eigener Plattformzugang bestimmen den Zugriff.
Rollen und Mandantentrennung gelten auch beim direkten Schnittstellenaufruf.
Support mit „ansehen“ und „mitarbeiten“ hat bewusst unterschiedliche Rechte.
Modulschalter steuern dagegen Navigation und Routen, ausdrücklich keine
zusätzlichen Datenbankrechte. Eine fehlende Menüposition ist deshalb nicht
automatisch eine fehlende Funktion oder ein Rechtefehler.

Zum festen Kern gehören Startseite, Zeiterfassung, Kunden, Baustellen,
Benutzer und Einstellungen. Die neun schaltbaren Module sind Einsatzplanung,
Material/Lager, Urlaub, Handwerksscheine, Angebote, Rechnungen,
Nachkalkulation, Wartungen und Zeitkonten. Nachkalkulation setzt das
Rechnungsmodul voraus. Plattformverwaltung, Support, Dateien und Nachtläufe
verbinden diese Bereiche mit Betrieb und Zugang.

Die wesentlichen Ketten:

| Kette | Was zusammen stimmen muss |
|---|---|
| Kunde → Angebot → Baustelle | Kundenkennung, Anschriften, Auftragsumfang, Arbeitszeitbudget, Nummernkreis, Abrechnungsart und Verknüpfung der Akten |
| Einsatz → Material → Lieferung/Lager | Zuständigkeiten, Mengen, Teilversorgung, Bestand und Rücknahme |
| Zeit → Schein → Rechnung | Leistungszeitraum, Unterschriften, bereits verrechnete Belege, Sperren und Freigabe durch Storno |
| Rechnung → Zahlung/Skonto → Mahnung/Export | Restforderung, Guthaben, Wertstellung, Fälligkeit, Rücklass und vollständiger Zeitraum |
| Urlaub/Krankheit/Freistellung → Zeitkonto/Lohn | Genehmigung bzw. Bestätigung, Eintritt, Urlaubsjahr, Stichtage, Zuschläge und Rücknahmen |
| Benutzer/Betrieb → Support/Sicherung/Löschung | Anmeldung, Rollen, Mandantentrennung, Protokoll, Aufbewahrung und Dateibestand |

Grundlage waren neben Code und Tests insbesondere `CLAUDE.md`,
`FUNKTIONEN.md`, `UEBERGABE.md`, `offene-punkte.md`, der laufende Stand und die
Entscheidungen zur Oberfläche. Bestehende fachliche Entscheidungen wurden
nicht als neue Fehler ausgegeben.

## Nachgewiesene Fehler und Korrekturen

### F1 — Angebotsannahme erzeugt doppelte oder unvollständige Aufträge

**Priorität: hoch.** Der Browser reservierte eine Nummer, änderte das Angebot,
legte eine Baustelle an und setzte zuletzt „Angenommen“. Diese getrennten
Schreibvorgänge bildeten keine gemeinsame Transaktion. Die Wiederaufnahme
prüfte außerdem die geladene Browserfassung statt des aktuellen Angebots.

**Nachweis im ursprünglichen Code:** Zwei gleichzeitige Annahmen lieferten
`B-2026-0001` und `B-2026-0002`. Eine Wiederholung mit demselben Browserobjekt
erzeugte ebenfalls eine zweite Baustelle. Ein absichtlich ausgelöster Fehler
beim letzten Statuswechsel ließ eine zusätzliche Baustelle zurück.

**Korrektur:** `angebot_annehmen` sperrt das aktuelle Angebot und schreibt
Nummer, Baustelle und Annahme in einer Transaktion. Eine Wiederholung findet
die vorhandene Baustelle. Kunde, Adresse, Beschreibung und Budget stammen
aus dem gespeicherten Angebot. Bereits vorhandene Baustellen aus dem alten
Ablauf werden weiterverwendet, ohne ihre Daten zu überschreiben.

**Absicherung:** Gleichzeitigkeit, unveränderte Browserfassung, Rückrollen
einschließlich Zähler, Kundenverknüpfung, Beschreibung, Nullbudget, leerer
Vorsatz, Abrechnungsarten, Betriebsrollen, fremder Betrieb, beide
Supportstufen und Ausführungsrechte. Zusätzlich Browserwege für Liste und
Angebotsseite. Die Migration verändert keine historischen Datensätze.

### F2 — Zahlungszeitraum endet still nach 2.000 Zeilen

**Priorität: hoch.** Die Abfrage versprach einen vollständigen Zeitraum,
hatte aber eine Standardgrenze von 2.000. Monatskennzahlen und Zahlungsstapel
für die Buchhaltung konnten deshalb zu wenig ausweisen.

**Nachweis:** Von 2.001 Zahlungseingängen im Zeitraum kamen nur 2.000 zurück.
**Korrektur:** Ohne ausdrücklich gewünschte Grenze werden alle Seiten des
Zeitraums gelesen. Eine ausdrücklich übergebene Grenze bleibt wirksam.
Zeitraumfilter, Reihenfolge und Zeilenschutz bleiben erhalten. Tests prüfen
auch Randtage, eindeutige Kennungen, Summe und einen fremden Betrieb.

### F3 — Kundenrechnungen scheitern bei vielen Baustellen

**Priorität: mittel.** Kundenkennung und sämtliche Baustellenkennungen standen
in einer einzigen OR-Adresse. Diese umging die vorhandene Blockbildung für
gewöhnliche IN-Abfragen.

**Nachweis:** Bei 230 Baustellen meldete das lokale Gateway `URI too long`.
**Korrektur:** Getrennte Abfragen für die Kundenkennung und Blöcke von höchstens
100 Baustellenkennungen; anschließend Vereinigung ohne Doppler. Es bleiben
genau die höchstens 500 jüngsten Rechnungen, nach Datum absteigend und bei
Gleichstand nach Kennung. Datum und UUID erlauben dieselbe Ordnung wie in
Postgres. Tests prüfen die direkte Kundenkennung, beide Zuordnungswege,
ungültige Kennungen und die Auswahl der 500 jüngsten aus einem größeren Bestand.

### F4 — Monatskennzahl zählt Guthaben auf älteren Stornorechnungen

**Priorität: mittel.** „Bezahlt im Monat“ las alle Zahlungen des Monats,
erkannte Stornos aber nur unter den bereits geladenen Rechnungen. Eine ältere
stornierte Rechnung fiel dadurch aus dem Ausschluss heraus.

**Nachweis:** Ein Eingang von 200 € auf einer nicht geladenen Stornorechnung
erschien als 200 € Monatszahlung. **Korrektur:** Die fehlenden Rechnungsstände
werden nach Kennung ergänzt. Stornoguthaben bleibt ausgeschlossen; Zahlungen
auf gültige ältere Rechnungen zählen weiter. Scheitert die Ergänzung, gilt
der bereits vorhandene, ausdrücklich begrenzte Ersatzwert für die geladenen
Rechnungen. Skonto und Rückzahlungen behalten ihre bisherige Behandlung.

### F5 — Alte Suchtreffer bleiben nach einer Eingabeänderung anklickbar

**Priorität: mittel.** Die Antwort der vorigen Kunden-/Baustellensuche blieb
bis zur neuen Antwort stehen; bei weniger als zwei Zeichen teilweise
dauerhaft. Ein Klick konnte zur falschen Akte führen.

**Nachweis:** Nach einer erfolgreichen Suche und anschließendem Wechsel auf
einen einzelnen Buchstaben blieb der alte Kunde sichtbar.
**Korrektur:** Eingabewechsel verwirft die dynamischen Treffer sofort;
überholte Antworten werden weiterhin ignoriert. Die lokale Suche nach
Seiten und die bisherigen Rollen- und Modulgrenzen bleiben erhalten.

### F6 — Abgebrochene Suche bleibt im Ladezustand

**Priorität: niedrig.** Kürzen oder Leeren einer laufenden Suche verwarf zwar
deren Antwort, räumte aber „Suche läuft“ nicht weg.
**Nachweis:** Eine noch offene Anfrage und anschließendes Leeren ließen den
Status stehen. **Korrektur:** Ladezustand und Anfrage gehören zum aktuellen
Begriff. Auch die Wartezeit vor einer neuen Anfrage ist als Suche sichtbar;
vor deren Abschluss wird kein irreführendes leeres Ergebnis gemeldet.

### F7 — Suchfehler sehen wie ein vollständiges leeres Ergebnis aus

**Priorität: mittel.** `Promise.allSettled` übernahm erfolgreiche Ergebnisse,
verschluckte aber die abgewiesenen Abfragen. Damit fehlte der Hinweis, dass
ein Teil des Bestands gar nicht durchsucht worden war.
**Nachweis:** Abgewiesene Kundensuche bei erfolgreicher Baustellensuche blieb
ohne Fehlermeldung. **Korrektur:** Die betroffene Suche meldet den Fehler;
erfolgreiche Treffer bleiben nutzbar. „Nichts gefunden“ erscheint bei einem
Fehler nicht als vermeintlich vollständiges Ergebnis.

### F8 — Strg/⌘ + K öffnet Suche hinter einem aktiven Dialog

**Priorität: niedrig.** Die globale Tastaturbehandlung beachtete den aktiven
Dialog nicht. Das unsichtbare Suchfenster übernahm den Fokusstapel; Escape
schloss deshalb zuerst das Fenster hinter der sichtbaren Rückfrage.

**Nachweis:** Geöffnete Bestätigung, Strg + K, Escape. Der Befund war bereits
in Abschnitt 11.4 des laufenden Stands benannt. **Korrektur:** Das Kürzel
öffnet bei einer aktiven Fokusfalle kein zusätzliches Suchfenster. Ohne
Dialog funktioniert es weiterhin, einschließlich der Eingabe in einem Feld.

## Oberfläche und bewusst unverändertes Verhalten

37 Ansichten wurden bei 375, 390, 834 und 1.440 px mit dem vorhandenen
Messwerkzeug geprüft: keine gemeldeten Layoutbefunde. Zusätzlich wurden
14 Hauptansichten bei 390, 834 und 1.440 px jeweils hell und dunkel mit axe
gegen WCAG A/AA und 2.1 A/AA geprüft: 84 Ansichtsprüfungen ohne automatisierten
Befund. Repräsentative Ansichten wurden anhand der erzeugten Bilder angesehen.
Die Rollenwege wurden mit den vorhandenen Linkprüfungen nachvollzogen.

Das rechtfertigt keine pauschale Behauptung, jede Dialogvariante oder jedes
Gerät sei barrierefrei. Es gab aber keinen Nachweis für einen notwendigen
Designumbau. Farben, Navigation, responsive Anordnung, Bezeichnungen und
fachliche Vorgaben wurden deshalb erhalten.

Bewusst unverändert sind unter anderem:

- Arbeitslisten mit benannten Grenzen und „Ältere laden“; die Kundenakte zeigt
  weiterhin höchstens 500 Rechnungen. Ein vollständiger Export hat andere
  Anforderungen als eine Arbeitsliste — daher die Korrektur nur bei F2.
- Der getrennte Materialbereich für Anfordern, Abarbeiten und Lager.
- Projektauswertung, Abrechnungsarten, Reverse Charge, Zuschläge,
  Urlaubsberechnung und Freistellungen nach den dokumentierten Entscheidungen.
- Begrenzter Supportzugang sowie ausdrücklich freigeschaltete Zusatzrechte.
- Funktionen, deren Fehlen bereits als bewusste Produktgrenze dokumentiert ist.

## Prüfprotokoll

Alle Datenbank- und Browserprüfungen verwenden den lokalen Supabase-Stapel.
Es wurden keine produktiven Daten gelesen, gelöscht oder geändert.

| Prüfung | Ergebnis |
|---|---|
| Ausgangszustand: Typen, Lint, Build | bestanden |
| Gegenproben im ursprünglichen Code | F1: drei Fälle rot; F2: 2.001 → 2.000; F3: URI zu lang; F4: falsche 200 €; F5–F8: gezielte UI-Prüfungen rot |
| Einheits- und Komponententests | 288 Dateien, 4.422 Tests bestanden |
| Gezielte neue Datenbankprüfungen | 22 bestanden: Annahme 15, Zahlungszeitraum 3, Kundenrechnungen 4 |
| Gesamte Datenbank einschließlich Serverfunktionen | 143 Dateien, 1.760 Tests bestanden; alle 170 Migrationen zuvor von null eingespielt |
| Browser: Chromium, WebKit-Telefon, Tablet | 45 bestanden; beide neuen Annahmewege erzeugten im ursprünglichen Code nachweislich zwei Baustellen |
| Links je Rolle | 7 bestanden |
| UI-Messungen | 37 Ansichten × 4 Breiten, ohne Befund |
| Automatisierte Barrierefreiheit der Hauptansichten | 84 Prüfungen, ohne Befund |
| Abschließende Typen, Lint und Produktionsbuild | bestanden, ohne Lintwarnungen |

Der erste große Komponentenlauf fand während des Infrastrukturaufbaus statt
und enthielt zwei Fehlschläge. Die betroffenen vollständigen Ansichtsprüfungen
bestanden separat; der anschließende komplette Lauf bestand ohne Wiederholungen
und ohne verlängerte Testfristen. Das wurde nicht als zusätzlicher App-Fehler
ausgegeben. Proxy- und Speicherprobleme beim Aufbau des lokalen Stapels sind
ebenfalls Testumgebung, keine Produktbefunde.

Eine zusätzliche Kundenrechnungs-Prüfung scheiterte zunächst an ihrer eigenen
Testdatenanlage: Der direkte SQL-Weg durfte keine Positionen auf eine bereits
angelegte Rechnung schreiben. Die Testdaten werden nun über den bestehenden
Dienstimport angelegt; der Schutz der Rechnung wurde nicht verändert.
Ein späterer gleichzeitiger Lauf aller Komponenten- und Datenbankprüfungen
traf beim großen Zahlungsbestand auf das Postgres-Anweisungszeitlimit.
Die unveränderte Zahlungsprüfung bestand einzeln; der abschließende vollständige
Datenbanklauf bestand ohne konkurrierenden Komponentenlauf. Weder Wiederholungen
noch verlängerte Zeitlimits wurden zur Testkonfiguration hinzugefügt.

## Verbleibende Grenzen und Abnahme

### Abhängigkeiten: neue Advisories, kein nachgewiesener Laufzeitfehler

`npm audit` nennt am 08.10.2026 18 betroffene Pakete (16 hoch, 2 mittel).
`npm audit --omit=dev` nennt davon 4 Pakete. Es handelt sich um fünf neue
Advisories mit Weitergabe entlang der Abhängigkeitsketten, nicht um
18 voneinander unabhängige Fehler der App.

| Bestandteil | Advisory | Einordnung |
|---|---|---|
| `@grpc/grpc-js` 1.9.16 über Firebase/Firestore | [GHSA-m9gg-hp2v-232j](https://github.com/advisories/GHSA-m9gg-hp2v-232j), [GHSA-f596-whhp-79r4](https://github.com/advisories/GHSA-f596-whhp-79r4) | Betreffen Node-gRPC-Server. Senklot verwendet Firebase ausschließlich für App-Initialisierung und Messaging, keinen Firestore- oder gRPC-Server. Die betroffenen Module sind nicht im ausgelieferten Browserpaket enthalten. |
| `braces` über Tailwind und ESLint-Werkzeuge | [GHSA-vfj7-8cjw-p6xm](https://github.com/advisories/GHSA-vfj7-8cjw-p6xm) | Ressourcenverbrauch durch manipulierte Suchmuster; Entwicklungswerkzeuge, keine Benutzereingaben in diesem Parsingpfad nachgewiesen. |
| `postcss-selector-parser` über PostCSS/Tailwind | [GHSA-rj75-hqrm-r3gf](https://github.com/advisories/GHSA-rj75-hqrm-r3gf) | Ressourcenverbrauch beim Verarbeiten manipulierter CSS-Selektoren; Buildwerkzeug, nicht das Parsing von App-Formularen. |
| `source-map-js` | [GHSA-68fv-2mgg-jv7q](https://github.com/advisories/GHSA-68fv-2mgg-jv7q) | Ressourcenverbrauch mit manipulierten Source Maps; Entwicklungsabhängigkeit. |

Die dokumentierte Nullmeldung vom 30.09. ist ein historischer Prüfstand,
keine aktuelle Entwarnung. Ein erreichbarer Ausnutzungsweg in der gebauten
App wurde nicht nachgewiesen. Die Pakete sollten als Wartungsaufgabe geprüft
aktualisiert werden. Die von npm vorgeschlagenen Hauptversionswechsel
(unter anderem Tailwind 4 und ein Firebase-Downgrade) wurden nicht blind
übernommen: Sie könnten Gestaltung oder Push verändern und sind keine
notwendige Korrektur der acht reproduzierten Funktionsfehler.

### Fachliche und gerätespezifische Abnahme

Die folgenden Punkte brauchen weiterhin die bereits dokumentierte externe
oder gerätespezifische Abnahme; sie sind durch diese Codeprüfung nicht erledigt:

- BMD-Importdefinition, Kontenrahmen und steuerliche Behandlung mit der Kanzlei
  anhand einer echten Importdatei abgleichen.
- Fachliche Auslegung zu Urlaub, Zuschlägen, Mahnspesen und Jugendschutz von
  der WKO bestätigen lassen; bestehende Werte bleiben unverändert.
- Kamera, Installation auf dem Startbildschirm und Push auf echten iOS-Geräten
  prüfen. WebKit ersetzt diese Gerätefunktionen nicht.
- Externes Sicherungsziel und Rücklauf mit dem tatsächlich konfigurierten
  Anbieter prüfen; lokale Prüfungen belegen nicht dessen Erreichbarkeit.
- Die spätere Behandlung von Aufbewahrungsfristen und bereits dokumentierte
  Produktgrenzen bleiben im zentralen Dokument `offene-punkte.md`.

Die neue Angebotsannahme verhindert neue Doppelanlagen. Ein möglicherweise
bereits vorhandener Doppelbestand wird nicht automatisch gelöscht oder
zusammengeführt: Buchungen und Dokumente müssen erhalten bleiben. Das verlangt
eine gesonderte Bestandsprüfung; aus dem Repository allein lässt sich nicht
feststellen, ob der Fehler bereits produktive Daten betroffen hat.

Für die Auslieferung muss zuerst die neue Migration vorhanden sein, danach
die Oberfläche mit dem RPC-Aufruf. Der bestehende GitHub-Ablauf übernimmt diese
Reihenfolge. Bereits offene Browser müssen die neue Fassung laden; die alte
Oberfläche verwendet den atomaren Aufruf noch nicht. Die Änderungen werden
auf dem lokalen Branch `fix/project-audit-2026-10-08` bereitgestellt.
Die Übertragung nach GitHub wurde versucht, aber mit HTTP 403
(`Resource not accessible by integration`) abgewiesen. Auch der Zugang der
Arbeitsumgebung hat kein verwendbares Schreibrecht. Der geprüfte Stand liegt
deshalb als lokaler Commit und übertragbarer Patch vor; ein Pull Request
konnte noch nicht angelegt werden. Merge und produktive Auslieferung sind
kein Ergebnis der lokalen Prüfung.
