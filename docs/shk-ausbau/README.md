# SHK-Ausbau — Plan, Stand, Nachweise

Auftrag vom 06.11.2026: die geprüfte Bauplanung „Senklot SHK — verbindliche
Bauplanung und Umsetzungsprompt“ umsetzen, und zwar **alle empfohlenen Punkte**,
vollständig integriert. Das sind 84 Katalogpunkte (A01–A11, R01–R12, E01–E16,
B01–B15, Z01–Z05, W01–W08, U01–U06, G01–G11), dazu N01 (frei konfigurierbare
Zeitfelder) und N02 (durchgängig schaltbare Fachmodule).

Hier steht, was gilt, in welcher Reihenfolge gebaut wird und wie weit es ist.
Die Entscheidungen dazu stehen im Register (`docs/ui-umbau/entscheidungen.md`,
ab **E51**). Für jedes Paket gilt `CLAUDE.md`: ein Thema, ein PR, Tests mit
Gegenprobe, Doku nachziehen, erst bei grüner CI mergen.

| Datei | Inhalt |
|---|---|
| [`bestandsmatrix.md`](bestandsmatrix.md) | je ID: Bestand heute mit Code- und SQL-Pfad, was fehlt, Rollen, Anschlussstelle |
| [`abnahmematrix.md`](abnahmematrix.md) | je ID: positive, negative und erhaltende Prüfungen |
| [`m06-abnahme.md`](m06-abnahme.md) | Umsetzung, Gegenproben und Abnahme von M06 einschließlich fachlich offenem M06e |
| [`aktionsinventar.md`](aktionsinventar.md) | je berührter Ansicht: Felder, Knöpfe, Filter, Reiter, Exporte, Deep Links (Stand vor dem Paket) |

## Grundlage und Entscheidungen (E51)

- **Zielumfang: empfohlen.** „Behalten“ und „Integrieren“ werden gebaut.
  „Optional“ wird gebaut und ist je Betrieb schaltbar. Bei „Ändern“ und
  „Ersetzen“ gilt der empfohlene Inhalt der Bauplanung (Teil 5).
- **V1:** Kunden und Baustellen bleiben Kern. Abschaltbar sind ihre
  Zusatzfähigkeiten.
- **V2:** Zeiterfassung ist seit M06d abschaltbar, mit Folgenvorschau und lesbarem Archiv (E63).
- **V3:** Der Server prüft das Modul bei **neuen** Fachbefehlen.
  Bestehende Schreibwege bleiben, wie sie sind.
- **V4:** Abrechnungsart und Nummernvorsatz stehen bei der Freigabe einer
  Angebotsfassung zum Versand fest; ohne sie gibt es keinen Annahme-Link.
- **U05:** Nachweisbedürftige Ansichten sind nur der Annahme-Link (A06) und
  der Unterschrifts-Link (W05), dazu die Versandereignisse.

## Was an der Bauplanung nicht stimmt (Befunde der Bestandsmatrix)

Am Code `b1e00cc` geprüft. Diese Befunde gelten vor dem Wortlaut der Planung.

1. **Die Modulverwaltung gehört allein dem Administrator**, nicht auch der
   Geschäftsführung (Planung 0.5). Belegt im Trigger
   `firmeneinstellungen_geschuetzt` (`20260912100000_dienstschluessel.sql`)
   und in `NUR_ADMIN` in `src/app/navigation.ts`. Für N01 heißt das: Die
   Zeitfelder konfigurieren Geschäftsführung und Administrator mit einem
   eigenen Recht.
2. **Lieferantenpreise liegen in `material_prices`.** `material_einkaufspreise`
   ist ein einziger aktueller Einkaufspreis je Artikel, ohne Lieferant und
   ohne Verlauf. Der Artikelstamm ist nicht lieferantenbezogen; die
   DATANORM-Übernahme gleicht nur über die Artikelnummer ab. Für parallele
   Kataloge (E01–E03) braucht es ein neues Zuordnungsmodell
   (Lieferantenartikel ↔ Stammartikel). Mit einer Ergänzung allein ist es
   nicht getan.
3. **„Auftrag“ ist kein eigenes Objekt.** `angebot_annehmen` legt direkt die
   Baustelle an und übernimmt keine Positionen; Pauschal- und
   Einheitspreisrechnungen lesen das Angebot beim Erstellen der Rechnung.
4. **Rechnungen sind an genau eine Baustelle gebunden**
   (`invoices.project_number not null`). Neue Belegarten brauchen jeweils:
   - den Check auf `invoice_coverage.art`,
   - einen eigenen Zweig in `rechnung_anlegen`,
   - die Storno-Funktionen,
   - `number_counters_art_check`.
5. **Lagerorte (E10) sind ein Umbau.** Es gibt genau einen Bestand je
   Artikel, und an ihm hängen Reservierung, Rüstliste, Retoure,
   Wareneingang, Inventur und Rechnungsvorschlag.
6. **Drag-and-drop (B06) braucht einen eigenen Verschiebebefehl.**
   `einsatz_speichern` ersetzt die Einteilung je Tag und Baustelle. Die
   Rüstliste hängt an Tag und Baustelle; ein Verschieben über den heutigen
   Weg ließe sie samt Reservierung am alten Tag stehen.
7. **Die Fehlmenge wird an drei Stellen verschieden gerechnet**
   (`ruestFehlmenge.ts`, `monatsVorschau.ts`, `EinsatzFormular.tsx`). E13
   braucht eine gemeinsame Quelle.
8. **ÖNORM A 2063 steht als „bewusst nicht gebaut“** in
   `docs/stand-2026-10-03.md`. A05 hebt diese Grenze erst auf, wenn die
   Normfassung vorliegt (Nachweisregister).
9. **Es gibt keinen Mailversand aus der App** (nur Anmeldemails). Lieferanten
   bekommen heute einen `mailto:`-Link ohne Anhang.
10. **Quellenstand:** Die geprüfte Bauplanung wurde am 08.11.2026 nachgereicht und liegt unverändert in [`bauplanung-geprueft.md`](bauplanung-geprueft.md). Die hier verifizierten Befunde und E51 gelten bei Widersprüchen weiter, insbesondere beim Administratorrecht für Module. Folgende dort referenzierten Anlagen liegen weiterhin nicht vor:
    - Masterprompt mit den Einzelspezifikationen (Abschnitt 6, für N01
      Abschnitt 14),
    - Produktentscheidungen und Modulzuordnung als JSON,
    - Produktbewertung.

    Grundlage sind deshalb Teil 5 und Anhang A der geprüften Fassung. Kommen
    die Anlagen nach, wird jedes noch offene Paket dagegen abgeglichen.

## Reihenfolge und Stand

Die Reihenfolge folgt den echten Abhängigkeiten (Planung 5.1). Gebaut wird
nacheinander auf dem Arbeitsbranch, ein Paket nach dem anderen.

| Paket | Inhalt | IDs | Stand |
|---|---|---|---|
| M00 | Bestand, Verträge, Nachweise | – | erledigt mit diesem Dokument (E51) |
| M01a | Modulregister mit Unterfähigkeiten, Verhalten unverändert | N02 | erledigt (E52); dazu: Folgen beim Abschalten |
| M01b | Änderungsjournal: vorhandene Verläufe lesen, neues Journal schreiben | U04 | erledigt (E53) |
| M01d | Papierkorb für Entwürfe | U06 | erledigt (E54) |
| M01e | Quellen- und Rechnungsvertrag auf `invoice_coverage` | W04 | erledigt (E55); Menge/Betrag und Reservierung mit der ersten Teilabrechnung |
| M02 | Auftragseingang, Objekte, Online-Annahme | A03, A09, A11, A06 | erledigt: A06 (E56, M02a), A03/A11 (E59, M02b), A09 (E62, M02c) |
| M03 | Kataloge, Preise, Kalkulation | E01–E07, A07, A08, G06 | E01–E04 erledigt (E57, M03a); E05/E06 (M03b) und E07, A07, A08, G06 (M03c) offen |
| M04 | Lagerorte, Fahrzeuglager, Scanner, Deckung | E10–E14, E16, G03 | E10 erledigt (E58, M04a), E13/E14/G03 erledigt (E60, M04b); E11/E12 (M04c), E16 (M04d) offen |
| M05 | Einkaufsbelege, Lieferantenanfragen, Kundenlieferschein | E08, E09, R01–R03 | offen |
| M06 | Zeit vollständig, Zeiterfassung abschaltbar (V2), freie Zeitfelder | Z01–Z04, B02, N01 | N01 erledigt (E61); Standardfelder, M06a (B02/Z04), M06c (Z01), M06d (V2) in E63 abgeschlossen; M06e (Z02/Z03) fachlich gesperrt: KV-/WKO-Nachweise fehlen |
| M07 | Qualifikationen, Aufgaben, Planung | Z05, B04–B08, G10, A01, A02, A04 | offen |
| M08 | Besichtigung, Leistungsverzeichnis, Aufmaß | B03, A05, R10 | offen |
| M09 | Anlagen, Prüfung, Betriebsmittel | W01–W08, G11 | offen |
| M10 | Monteur-Arbeitstag, Kommunikation, Abnahme | B01, B09–B13, B15 | offen |
| M11 | Eingangsrechnungen, Dreiwege-Abgleich | R06–R09, E15, G09 | offen |
| M12 | Bank/CAMT, Fristen | R04, R05, G07, G08 | offen |
| M13 | Abrechnung, Sammelrechnung, Prognose | G01, G02, G04, G05, A10, B14, R11 | offen; vorgemerkt: Storno-Aufheben gegen gleichzeitiges Anlegen sperren (E55) |
| M14 | Versandadapter, Mahnversand, Versandnachweis, Wochenbericht | R12, U05, U03 | offen |
| M15 | Persönliche Einstiege | U01, U02 | offen |
| M16 | Gesamtabnahme | alle | offen |

## Nachweisregister

Was der Ausbau braucht, aber nicht selbst erbringen kann. Fehlt ein Nachweis,
blockiert das nur die davon abhängige Freigabe. Gebaut wird trotzdem, und der
fehlende Nachweis ist dann in der App als Grenze mit Grund benannt.

| Nachweis | Für | Stand | Wer |
|---|---|---|---|
| SMTP-Zugang für App-Mails als Secret der Edge Function | M14, A06, E09, U03 | offen; `office@senklot.at` ist nur für Anmeldemails eingerichtet | Betreiber |
| DATANORM-Dateien realer Großhändler (mindestens zwei, eine groß) | M03 | offen; der Parser ist laut eigenem Kopf nicht gegen echte Dateien geprüft | Pilotbetrieb |
| ÖNORM A 2063 in gültiger Fassung | A05 | offen (kostenpflichtige Norm) | Auftraggeber |
| camt.053-Testdatei der Hausbank | R04 | offen | Pilotbetrieb |
| ebInterface- bzw. XRechnung-Beispiele von Lieferanten | R06 | offen | Pilotbetrieb |
| Kanzlei- bzw. Steuerprofil (Kontierung, BMD) | R09 | offen | Steuerberatung |
| KV- und WKO-Regeln für Durchrechnung und Zulagen | Z02, Z03 | offen | Betrieb, WKO |
| Prüfvorlagen und Grenzwerte je Anlagentyp mit Quelle | W01, W02 | offen | fachlich Verantwortlicher |
| Microsoft-Tenant mit Testsite und Admin-Einwilligung | B15 | offen | Betrieb |
| Formatbeschreibung bzw. Beispieldateien der Portale von Hausverwaltungen und Versicherungen | A11 (Import) | offen | Auftraggeber, Pilotbetrieb |
| FCM-Konfiguration | B09, Z04, G07 | vorhanden | – |

## Arbeitsweise je Paket

1. Vor dem Bau:
   - die Zeilen der Bestandsmatrix gegen den aktuellen `main` prüfen;
   - das Aktionsinventar der berührten Ansichten aufnehmen;
   - neue UI-Muster auf `/_muster` zeigen.
2. Bauen mit Prüfungen nach der Abnahmematrix, jede mit Gegenprobe.
3. Lokal grün, bevor gepusht wird:
   - `tsc`, `lint`, `vitest`;
   - bei Migrationen die echte Datenbank;
   - die Browserwege;
   - `pruefen:links`.
4. PR mit Pflichtnachweis-Tabelle:
   - ID;
   - Bedarf;
   - wiederverwendete Funktion;
   - Ergänzung oder begründeter Umbau;
   - Erhaltungs- und Integrationstest;
   - Grenze mit Beleg.
5. Nachziehen:
   - Register (E-Nummer);
   - `docs/stand-2026-10-03.md`;
   - `docs/FUNKTIONEN.md`;
   - Handbuch mit Stempel;
   - Grenzen-Durchsicht;
   - diese Tabelle und die Bestandsmatrix.
6. Mergen bei grüner CI, dann prüfen, ob die Auslieferung live ist.
