# Durchsicht der benannten Grenzen (24.10.2026)

Auftrag vom 24.10.2026: Eine einfache erste Fassung soll es in der fertigen
Software nicht geben. Jede Funktion wird vollständig, nachhaltig und
skalierbar gebaut. Eine Grenze bleibt nur stehen, wenn sie einen Grund hat,
der außerhalb der Bequemlichkeit liegt (Regel in `CLAUDE.md`, Grundsatz 6).

Durchgesehen wurden alle benannten Grenzen in `docs/stand-2026-10-03.md`,
`docs/offene-punkte.md` und `docs/pruefung-2026-10-13-behebungen.md`, jeweils
gegen den Code vom 24.10.2026. Jede Grenze fällt in eine von fünf Gruppen:

- **A – Abkürzung.** Machbar, aber weggelassen. Wird gebaut.
- **N – Nachweis fehlt.** Die Funktion ist gebaut, aber ein Teil ist nicht
  dauerhaft geprüft. Die Prüfung wird nachgezogen.
- **B – Begründete Grenze.** Sie bleibt; der Grund steht dabei.
- **X – Liegt bei jemand anderem.** Betrieb, Kanzlei, Steuerberatung, Anwalt,
  WKO, Gerät oder Zugang zum gehosteten Projekt.
- **E – Inzwischen erledigt.** Die Doku nennt sie noch; der Code nicht mehr.

## A – Abkürzungen (werden gebaut)

Reihenfolge nach Gewicht: zuerst, was Belege, Geld und Recht berührt.

Alle sechzehn gebaut (24.10.2026, T-28 bis T-44); sie stehen unter E.

## N – Nachweise, die fehlen

Alle drei erbracht (24.10.2026, T-45 bis T-47); sie stehen unter E.

## B – Begründete Grenzen (bleiben)

| Grenze (Fundstelle) | Grund |
|---|---|
| Altbestand: Scheinzeilen vor dem 24.10. ohne Katalogkennung, Anforderungen ohne Erledigt-Zeitpunkt, Mahnungen vor dem 10.10. ohne Schreiben, ältere Verlaufseinträge ohne Tage, Buchungen vor dem Jugendschutz ohne Anleger, profillose Konten ohne Herkunftsnachweis, doppelte Baustellen aus der Zeit davor (T-19/T-22, 15.9, 18, 12.3, Prüfbericht 2) | Altdaten: nachtragen hieße, Produktionsdaten umzuschreiben, und das geschieht nicht. Die App erfindet keine Werte |
| Abgleich Schein ↔ Ausgabe und Preis über den Namen bei freien Zeilen (T-22, T-26) | Eine freie Zeile hat keinen Katalogartikel |
| Hinweise statt automatischem Abzug in der Rechnungsvorschau (T-21) | Fachlich: ob Material ein zweites Mal hingehört, weiß nur das Büro |
| Unverrechnete Stunden mit den Sätzen des Betriebs, nicht mit einem nur für eine Rechnung geänderten Satz (T-20) | Fachlich: dieser Satz entsteht erst beim Schreiben der Rechnung |
| Arbeitszeitgrenzen: eine Lücke gilt als Pause; ein Tag ohne Uhrzeit wird auf die Pause nicht geprüft; vor dem ersten Buchungstag zählt die Woche mit null (Stand 15.3) | Die Angabe fehlt in den Daten; geschätzt wird nichts |
| Jugendschutz: die Datenbank sperrt nur über 8 Std. und in der Nachtruhe, der Rest ist Rückfrage und Fall (Stand 12.3) | Fachlich: Ausnahmen sind zulässig, aber begründet – sperren hieße, sie zu verhindern |
| Jugendschutz: ohne Geburtsdatum ist niemand jugendlich (Stand 12.3) | Ohne die Angabe lässt sich nichts prüfen; A7 sorgt dafür, dass sie da ist |
| Teilzeit: ob Mehrarbeit im Quartal ausgeglichen wird, entscheidet die Lohnverrechnung; abweichende Regeln anderer Kollektivverträge kennt Senklot nicht (T-1) | Fachlich bzw. Umfang: Senklot rechnet nach KV Metallgewerbe; ein anderer KV ist ein eigener Auftrag |
| Sonderurlaub: Pflegestunden über dem Kontingent warnen statt zu sperren; stundenweise nur bei Vorladung, Musterung und Pflege (Stand 10.3) | Rechtlich bzw. fachlich |
| Zeit teilen: verrechnete Buchungen nicht teilbar; Pause bleibt als Zahl am längeren Teil (Stand 15.6, 15.10) | Verrechnet ist ein Beleg; die Pause hat keine Uhrzeit in den Daten |
| Teilen und Einfügen nur mit Verbindung (Stand 15.6, 15.10) | Beide ändern mehrere Buchungen in einem Zug; offline könnte ein zweites Gerät dazwischen schreiben |
| Mahnung: zwischen Nachsehen und Festhalten eingehende Zahlung (Stand 16.3) | Die Datenbank weist das Festhalten ab und die Meldung sagt es |
| Der Support sieht keinen Budgetstand und keine Buchungen (Stand 14.1) | Datenschutz und Rechte: Zeitbuchungen gehören nicht zum Support |
| Krankenstände und Sonderurlaub stehen nicht im Urlaubsverlauf (Stand 17) | Datenschutz: Gesundheits- und Familiendaten |
| Plattformkonto: Wiederherstellung bei Verlust von Telefon und Codes nur durch den Betreiber (Stand 12.1) | Sicherheit |
| Zweiter Faktor: Pflicht erst, wenn der Betrieb sie einschaltet (Stand 12.1) | Einstellung je Betrieb |
| DATANORM: „alles oder nichts“ je Block; 50.000 Zeilen dauern rund 17 Minuten (Stand 14.5) | Sicherheit: schneller ginge es nur ohne die Prüfung je Anweisung |
| Scheinlisten: Spalten ausgeschrieben, `scheinListen.test.ts` hält sie gegen die Tabelle (Stand 14.3) | Technisch: PostgREST kann keine Spalte ausnehmen; abgesichert durch die Prüfung |
| Zeilenschutz: fünf Prüfungen bleiben je Zeile (Stand 14) | Fachlich an der Zeile; kleine Tabellen |
| Laden und Zwischenspeicher: Stand bis zehn Minuten alt, Speicher je Tab, Startseite wartet auf ihren langsamsten Block (Stand 16) | Technisch, mit Messung belegt |
| Pauschale mit anderer Einheit gilt als Ware; Material aus dem Angebot nur ohne unterschriebenen Schein (Stand 12.2, 13) | Fachlich |
| Kundenart, PLZ-Erkennung ohne Kunden im Stamm (Stand 12.2) | Fachlich: ohne Stammdaten nur die Anschrift |
| Prüfwerkzeuge: axe misst Kontrast, Namen und Rollen, nicht Verständlichkeit; Messungen im gedrosselten Browser (Stand 18) | Grenze des Werkzeugs |
| Wisch-Schutz am iPhone: iOS verschiebt die Ansicht beim Öffnen der Tastatur (Stand 13) | Plattform |
| App-Zeichen bei 16 px (Stand 18) | Gestaltung, abgewogen |
| `npm test` ohne Datenbanktests (offene Punkte C12) | Der Stapel läuft in der CI; im Handbuch benannt |
| Tailwind statt einer Klasse je Element (offene Punkte B10) | Ansicht für Ansicht, wenn sie ohnehin angefasst wird |
| Lange Namen brechen mitten im Wort in einem Browser ohne deutsches Trennwörterbuch (A16, 24.10.2026) | Die Trennregel gilt überall; das Wörterbuch bringt der Browser mit oder nicht — liegt beim Gerät |
| Der Rücklauf hält einen Stand beim Einspielen ganz im Speicher des Rechners, auf dem er läuft (N1, 24.10.2026; geprüft mit 288 MB) | Liegt beim Gerät: der Rücklauf läuft im Ernstfall auf dem Rechner eines Menschen, nicht im Projekt; Node bekommt mit `--max-old-space-size` mehr Speicher |
| „E-Mail an …“ (Bestellung, Angebot) öffnet das Mailprogramm; die App verschickt nichts an Kunden oder Großhändler und führt keinen Versandnachweis (Stand 24.5, Testbericht Runde 6, Hinweis 12) | Sicherheit und Betrieb: gesendet wird aus dem eigenen Postfach, damit Antworten und die gesendete Nachricht beim Betrieb liegen; die App hält keine Zugangsdaten zu diesem Postfach |

## X – Liegt bei jemand anderem

| Punkt | Bei wem |
|---|---|
| Datum der Stornobuchung, Kontenrahmen, Lücke im Rechnungskreis vor 25.09., VIES als Nachweis, Löschen nach sieben Jahren (offene Punkte A9, D4–D6, D9) | Steuerberatung |
| BMD-Stapel vorgebaut bis zum Importtest (offene Punkte C4, D7) | Kanzlei |
| Datenschutzerklärung, Impressum, Kalender-Abo (offene Punkte D8, D10) | Anwalt |
| Aliquoter Urlaub, Mahnspesen an Private (offene Punkte D1, D2) | WKO |
| Safari/iPhone, Kamera, Push, Installation am echten Gerät (offene Punkte C15, Prüfbericht 4 und 6); die volle CSP ist seit 27.10.2026 durchgesetzt (Stand 24.6) | Gerätedurchgang |
| SMTP, Domain, externer Sicherungsort, Wiederherstellung im Zielsystem, Einstellungen des gehosteten Projekts (Prüfbericht 4, Stand 14.7 Punkt 14) | Betrieb bzw. Zugang zum gehosteten Projekt |
| Schutz gegen geleakte Passwörter, Ratenbegrenzung, Sitzungsdauer im gehosteten Projekt (Sicherheitsprüfung 27.10.2026, Werte in `docs/DEPLOYMENT.md`) | Zugang zum gehosteten Projekt |
| Angriffsversuche gegen das gehostete Projekt, Wertebereiche einzelner Zahlenfelder (`docs/sicherheitspruefung-2026-10-27.md`, Abschnitt 4) | externer Sicherheitstest |
| Angebotsliste unter Windows bei 1.570 × 700 px (offene Punkte C14) | Wieder aufnehmen mit Bildschirmfoto |

## E – Inzwischen erledigt (Doku nennt sie noch)

| Grenze (Fundstelle) | Erledigt durch |
|---|---|
| Kataloge laden höchstens 1.000 Artikel (Stand 14.1) | T-3, Abschnitt 23 |
| Durchrechnungszeitraum nicht einstellbar (Stand 15.3) | Einstellung „Durchrechnungszeitraum“ (17–52 Wochen) in den Lohnregeln |
| Gesamtsaldo erst beim Öffnen einer Person (Stand 21) | T-2 |
| Buchhaltung sieht die Rechnungssperre nicht auf ihrer Startseite (Stand 13) | Stand 17, Punkt E |
| Baustelle mit nur Lehrlingsstunden zum Satz 0 bleibt gelistet (T-18) | T-20 |
| Anforderungen ohne Abholdatum (T-19) | T-20 |
| Abgleich Schein ↔ Ausgabe am Artikelnamen (T-19, T-21) | T-22 |
| Preis auf der Rechnung über den Namen (T-22) | T-26 |
| Prüfungen, die an bestimmten Tagen rot würden (T-23) | T-25 |
| A1 Belege mit den heutigen statt den damaligen Firmendaten (Stand 15.9) | T-28 |
| A2 Mahnung ohne die Person, die gemahnt hat (Stand 15.9) | T-29 |
| A3 Ausgangsbuch ohne den Tag der Ablöse (Stand 15.4) | T-30 |
| A4 Retoure auf dem Namen des Lagers statt des Monteurs (T-16) | T-31 |
| A5 Stichtag: Schein als Ganzes nach seinem Datum statt je Zeitzeile (T-17) | T-32 |
| A6 Teilzeit-Mehrarbeit: Vollzeit eines Tages immer ein Fünftel der Woche (T-1) | T-33 |
| A7 Jugendschutz: Geburtsdatum erst in der Akte, nicht bei der Anlage (Stand 12.3) | T-35 |
| A8 Jugendschutz-Hinweis auf der Startseite nur bei der Rolle Mitarbeiter (Stand 12.3) | T-36 |
| A9 Jugendschutz: Lage der kürzeren Tage (§ 11 Abs 2 KJBG) und Wegzeit Schule–Betrieb (§ 11 Abs 7) nicht geprüft (Stand 12.3) | T-37 |
| A10 Zeit teilen: über Mitternacht nicht möglich (Stand 15.6) | T-38 |
| A11 Zeit einfügen: nur beim Anlegen und nicht über Mitternacht (Stand 15.10) | T-39 |
| A12 Firmenbuch nur an der Rechtsform im Namen erkannt (Stand 12.2) | T-40 |
| A13 Belegarchiv (ZIP) über viele Jahre im Speicher des Browsers (Stand 15.5) | T-41 |
| A14 Dokumentlinks bis zum Ablauf ihrer Stunde nutzbar, auch nach „nur Büro“ (Prüfbericht 13.10, Punkt 7) | T-42 |
| A15 Sonderurlaub nur mit eingeschaltetem Modul Urlaub (Stand 10.3) | T-43 |
| A16 Silbentrennung in den Tagesspalten — galt schon (geerbt von `index.css`), jetzt dauerhaft geprüft (Stand 13 G4, 15.2) | T-44 |
| N1 Sicherung über 256 MB nicht geprüft (Stand 14.6) — geprüft mit 288 MB; dabei Speicher- und Rechenzeitgrenze der Function gefunden und behoben | T-45 |
| N2 Absturz mit voller Wiederherstellung nicht durchgespielt (Prüfbericht 13.10, Punkt 5) — durchgespielt, bestanden (`scripts/absturzprobe.mjs`) | T-46 |
| N3 Tablet quer dauerhaft nur an einer Karte geprüft (Stand 18, K3) — die Wege des Monteurs laufen jetzt auch bei 1194 × 834 | T-47 |

## Wie es weitergeht

Die Abkürzungen A1–A16 und die Nachweise N1–N3 wurden je Thema in einem
eigenen PR gebaut, in der Reihenfolge der Tabelle, jeder mit Prüfungen samt
Gegenprobe, Handbuch und Stand; am 24.10.2026 abgeschlossen. Was bleibt,
steht unter B, jeweils mit seinem Grund. Eine neue Grenze kommt nach
Grundsatz 6 nur mit Grund dorthin — sonst wird sie gebaut.
