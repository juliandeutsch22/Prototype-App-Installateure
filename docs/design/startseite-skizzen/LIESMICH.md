# Startseite neu – Skizzen zur Abnahme (Paket 8, Testbericht 4.2)

Stand 30.09.2026. **Nur Skizzen**, nichts davon ist gebaut. Beispielbetrieb
„Haustechnik Steiner GmbH“ (erfunden): 40 aktive Baustellen, 20 Anforderungen,
rund 10 Personen. Bilder mit 2-facher Pixeldichte; Handy 390 px, Schreibtisch
1280 px, dazu eine Prüfung bei 1150 px (G20).

## Aufbau (für alle Rollen gleich)

1. Seitenkopf: Datum als Titel, darunter „KW · Betrieb · Rolle“ (wie heute).
2. Karte **Handlungsbedarf**: je Thema ein Abschnitt mit höchstens 3 Zeilen,
   nach Dringlichkeit sortiert (überfällig vor heute vor diese Woche), darunter
   „und N weitere →“ auf die gefilterte Fachseite. Leere Abschnitte fallen weg.
3. Karte **Heute**.
4. **Kennzahlen** (höchstens 4), jede ein Verweis auf die gefilterte Liste.

Handy: eine Spalte in dieser Reihenfolge, Kennzahlen als kompakte Leiste
zuletzt. Schreibtisch (ab 1024 px): links Handlungsbedarf (7), rechts Heute und
Kennzahlen (5). Ist nichts zu tun: „Heute liegt nichts an“, darunter nur die
Kennzahlen, **eine** Spalte über die ganze Breite (keine leere Spalte, G20).

Eine Zeile = Titel, ein Detail, Status (Punkt + grauer Text, Rot nur für
Überfällig). In schmalen Karten (Handy, rechte Spalte) steht der Status vorn in
der Detailzeile statt rechts, damit der Titel nicht abgeschnitten wird.

**Zur Abnahme:** Die „Karten“ aus 4.2 sind hier Abschnitte in **einer** Karte
Handlungsbedarf (Designlinie: keine Karte in Karte, wenige Karten). Die Regeln
(max. 3, „und N weitere“, leer = weg, feste Reihenfolge) gelten je Abschnitt.

## Je Rolle

### 01 Monteur
| Reihenfolge | Abschnitt | „und N weitere →“ führt zu |
|---|---|---|
| 1 | Tage ohne Buchung | Zeiterfassung, Filter „fehlende Tage“ |
| 2 | Schein wartet auf Zeitbuchung | Handwerksscheine, Filter „ohne Zeitbuchung“ (eigene) |
| 3 | Material abholbereit | Material anfordern › Meine Anforderungen, Filter „Abholbereit“ |
| Heute | Einsatz mit Adresse, Telefon, Aufgabe, „Wie zuletzt buchen“, Rüstliste (max. 3), danach weitere Einsätze | Rüstliste des Einsatzes; Kopf-Link „Mein Einsatzplan“ |
| Kennzahlen | Saldo, Resturlaub | Zeiterfassung, Urlaub |

### 02 Verwaltung (Lager)
| Reihenfolge | Abschnitt | „und N weitere →“ führt zu |
|---|---|---|
| 1 | Offene Anforderungen (Eil zuerst, dann älteste) | Anforderungen, Filter „Offen“ |
| 2 | Bestellt und überfällig | Anforderungen, Filter „Bestellt, Liefertermin überschritten“ |
| 3 | Seit über 3 Tagen abholbereit | Anforderungen, Filter „Abholbereit > 3 Tage“ |
| 4 | Unter Mindestmenge | Lager, Filter „unter Mindestmenge“ |
| Heute | Lieferungen, die heute erwartet werden | Anforderungen, Filter „Lieferung heute“ |
| Kennzahlen | Offene Anforderungen, Knappe Artikel | Anforderungen „Offen“, Lager „unter Mindestmenge“ |

### 03 Buchhaltung
| Reihenfolge | Abschnitt | „und N weitere →“ führt zu |
|---|---|---|
| 1 | Mahnungen fällig | Rechnungen, Filter „Mahnung fällig“ |
| 2 | Überfällig, noch nicht mahnbar (sonst doppelt zu 1) | Rechnungen, Filter „Überfällig“ (gibt es schon) |
| 3 | Scheine über 4 Wochen nicht verrechnet | Handwerksscheine, Filter „nicht verrechnet, älter als 4 Wochen“ |
| 4 | Stunden ohne Buchung | Mitarbeiterübersicht, Filter „fehlende Tage“ |
| 5 | Urlaubsanträge – nur, wenn die Buchhaltung Urlaub entscheidet | Urlaub, Filter „offene Anträge“ |
| Heute | Zahlungseingänge von heute | Rechnungen, Filter „bezahlt heute“ |
| Kennzahlen | Offen, Überfällig, Nicht verrechnet, Bezahlt im Monat | Rechnungen „Offen“/„Überfällig“/„Bezahlt, Monat“; Scheine „nicht verrechnet“ |

### 04 Projektleitung
| Reihenfolge | Abschnitt | „und N weitere →“ führt zu |
|---|---|---|
| 1 | Unbesetzte Einsätze (z. B. durch Krankmeldung, M33) | Einsatzplanung › Tag, Filter „unbesetzt“ |
| 2 | Baustellen über oder nahe Budget (ab 90 %) | Baustellen, Filter „über oder nahe Budget“ |
| 3 | Ohne Einsatz in den nächsten 14 Tagen | Baustellen, Filter „ohne Einsatz 14 Tage“ |
| 4 | Fällige Wartungen ohne Baustelle | Wartungen, Filter „fällig, ohne Baustelle“ |
| 5 | Eilanforderungen | Anforderungen, Filter „Eil“ |
| Heute | Abschnitte „Abwesend“ und „Im Einsatz“ (je max. 3) | Einsatzplanung › Tag (heute) |
| Kennzahlen | Aktive Baustellen, Auslastung diese Woche | Baustellen „aktiv“, Einsatzplanung › Wochenplan |

### 05 Geschäftsführung / Administration
„Alles Obige, zusammengefasst nach Dringlichkeit“ ist so umgesetzt: **eine
Zeile je Thema** (Anzahl + wichtigstes Detail), die Zeile selbst führt auf die
gefilterte Fachseite der jeweiligen Rolle (Ziele wie oben). Abschnitte:
**Überfällig**, **Heute**, **Diese Woche**, je max. 3 Themen. Zusätzlich
fehlende Einstellungen (Basiszinssatz zum 1.1./1.7., Kontenrahmen,
Rechtstexte) → Einstellungen, jeweiliger Reiter.
Lagerarbeit (offene Anforderungen, knappe Artikel, Abholbereites) gehört der
Verwaltung und erscheint hier nur, wenn der Betrieb keine Verwaltung hat.
Heute wie Projektleitung. Kennzahlen: Offen, Überfällig, Nicht verrechnet,
Aktive Baustellen.

### 06 Leer (Geschäftsführung)
„Heute liegt nichts an“ und die vier Kennzahlen.

## Offene Fragen an die Abnahme

1. **„und N weitere“ bei der Geschäftsführung:** Die Zeilen sind Themen aus
   verschiedenen Fachseiten; es gibt keine einzelne gefilterte Seite.
   Vorschlag: die Zeile klappt die übrigen Themen auf der Startseite auf.
2. **Leerzustand:** Laut 4.2 stehen darunter „nur die Kennzahlen“. Soll die
   Karte „Heute“ (wer ist wo) bei der Leitung trotzdem bleiben, wenn es
   Einsätze gibt, aber nichts zu entscheiden ist?
3. Monteur: Der Knopf „Wie zuletzt buchen“ aus der Linie „Fassung 3“ ist
   geblieben (4.2 nennt ihn nicht).

## Neue Filter und Felder für die Fachseiten (entstehen im selben PR)

- **Baustellen:** „über oder nahe Budget“ (ab 90 %), „ohne Einsatz in den
  nächsten 14 Tagen“, „aktiv“ (für die Kennzahl); laut 4.2 außerdem „ohne
  Projektleitung“ und „Ende überschritten“.
- **Einsatzplanung › Tag:** „unbesetzt“ (Einsatz, dessen Person abwesend ist);
  Aufruf mit Datum „heute“.
- **Wartungen:** „fällig, ohne Baustelle“.
- **Anforderungen:** „Offen“ (Eil zuerst), „Eil“, „Abholbereit > 3 Tage“,
  „Bestellt, Liefertermin überschritten“, „Lieferung heute“. Dafür fehlt heute
  ein Feld **erwarteter Liefertermin** an der bestellten Anforderung.
- **Material anfordern › Meine Anforderungen:** „Abholbereit“.
- **Lager:** „unter Mindestmenge“.
- **Rechnungen:** „Mahnung fällig“, „bezahlt heute“, „bezahlt im Monat“
  („Überfällig“ gibt es schon als `?status=`).
- **Handwerksscheine:** „nicht verrechnet“, „nicht verrechnet, älter als 4
  Wochen“, „ohne Zeitbuchung“ (eigene, für den Monteur).
- **Zeiterfassung / Mitarbeiterübersicht:** „fehlende Tage“ (je Person bzw.
  alle Personen mit fehlenden Tagen).
- **Urlaub:** „offene Anträge“.
- **Einstellungen:** Sprungziel auf den Reiter mit der fehlenden Angabe.

## Dateien

`01-monteur-*`, `02-verwaltung-*`, `03-buchhaltung-*`, `04-projektleitung-*`,
`05-geschaeftsfuehrung-*` (plus `-1150`), `06-leer-*`; jeweils `-handy` (390 px)
und `-desktop` (1280 px).
