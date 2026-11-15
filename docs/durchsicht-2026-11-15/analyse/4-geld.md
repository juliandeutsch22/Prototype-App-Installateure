# Tiefenanalyse Bereich 4 — GELD (Rechnungen, Zahlungen, Mahnwesen, Storno, Export, Nachkalkulation)

Stand: Code `main` @ 062407b, 15.11.2026. Nur gelesen; nachgerechnet mit kleinen Node-Skripten im
Scratchpad (keine Datei im Repository geändert, keine Tests umgeschrieben, keine Suite gelaufen).
„belegt“ = im Code bis zur Datenbank verfolgt; wo ich nur den Code gelesen, den Ablauf aber nicht am
laufenden Stapel nachgestellt habe, steht es dabei.

## 1. Wie der Ablauf funktioniert

1. **Vorschau** (`InvoicesView.buildPreview`, Z. 1465): lädt nur die Belege der Baustelle — offene
   Zeitbuchungen, unterschriebene Scheine, Lagerausgaben (`ausgegebenes_material`), Wartungen, alle
   Rechnungen der Baustelle. `assembleInvoice` bildet Stundentöpfe je Satz/Nacht/Notdienst (Minuten
   summiert, dann auf 2 Stellen Stunden), Material aus Scheinen je Artikel. Pauschal/Einheitspreis:
   Positionen aus dem angenommenen Angebot (`pauschale.ts`), Anzahlung als Anteil (`anzahlung.ts`).
2. **Summen**: eine Stelle (`totals.calcTotals`/`recalc`): Zeile = cent(Menge × Preis × Rabatt),
   Rabatt auf Netto, USt = cent(Netto × Satz), ein Steuersatz je Rechnung. Schlussrechnung:
   `mitAbzug` zieht Anzahlungs-/Pauschal-Teilrechnungen netto/USt/brutto ab; Teilrechnungen mit
   Belegen werden nur genannt. Rücklass (`ruecklass.ts`) und Skonto (`skonto.ts`) mindern den
   Zahlbetrag, nicht das Entgelt.
3. **Ausstellen** (`rechnung_ausstellen` → `rechnung_anlegen`, eine Transaktion): Nummer aus
   `number_counters` (Zeilensperre, lückenlos, Jahreskreis ab 1001), Kopf + Positionen + Abdeckung;
   Zeitbuchungen `is_billed`, Scheine/Wartungen über `invoice_coverage` + `app.beleg_nur_einmal`
   (Advisory-Lock). Trigger: `vorrechnungen_pruefen` (Pflichtabzug, Steuerbehandlung, eine
   Schlussrechnung), `rechnung_eingefroren` (Beleg unveränderlich), `aussteller_rechnung`
   (Firmendaten-Stand), `rechnung_beginnt_offen`.
4. **PDF**: beim Anlegen aus der Vorschau (`pdf.ts`), später aus dem Datensatz (`nachdruck.ts` +
   `belegFirma` mit dem Aussteller-Stand); E-Rechnung `ebinterface.ts` aus denselben Zahlen.
5. **Zahlung** (`zahlungseingaenge`, direkt geschrieben): Trigger `zahlstand_setzen` rechnet
   `bezahlt_betrag`, `skonto_betrag`, `mahnkosten_betrag` und den Stand (Offen/Teilbezahlt/Bezahlt/
   Überzahlt). Skonto und Mahnkosten sind eigene Eingangsarten (`skonto_passt`, `mahnkosten_passt`),
   Guthaben → Rückzahlung (negativer Eingang, `zahlung_nicht_unter_null`).
6. **Mahnung** (`mahnlauf.ts`, `mahnung.ts`, `mahnungPdf.ts`): Stufe 1–3, Rest ohne nicht fälligen
   Rücklass, ab Stufe 2 Verzugszinsen (4 % bzw. Basiszins + 9,2 je Halbjahr), Spesen je Stufe oder
   40-€-Pauschale; erst PDF, dann `mahnung_festhalten` (prüft Stand und Stufe, speichert den Inhalt).
7. **Storno** (`rechnung_stornieren`): Stand „Storniert“ + Grund, Zeitbuchungen frei; Scheine/
   Wartungen frei über die Abdeckung. Aufheben nur am selben Tag mit den Prüfungen des Anlegens.
   Stornorechnung: eigene Nummer aus dem Kreis, Datum/Jahr vom Server.
8. **Export**: Ausgangsbuch-CSV (`buchhaltungExport.ts`), BMD-Rechnungs- und Zahlungsstapel
   (`bmdExport.ts`), Belegarchiv; Storno als Gegenzeile am `stornoBelegTag`.

Der Bereich ist sichtbar durch viele Prüfrunden gegangen: Doppelverrechnung, Abzug, Storno-Aufheben,
Umnummern, Nummernvergabe, Aussteller-Stände sind in der Datenbank abgesichert. Die Befunde unten
liegen an den Rändern, die diese Runden nicht erreicht haben.

## 2. Belegte Befunde

### Hoch

**H1 — „Konditionen für diese Rechnung“ gelten still für alle folgenden Rechnungen.**
`src/features/invoices/InvoicesView.tsx:653` (`rates`-Zustand), `:3511–3567` (Felder, Text „Nur für
diese Rechnung … Die Änderung gilt nur für diese Rechnung“), `:2114–2126` (Aufräumen nach dem
Anlegen — `rates` fehlt), `:623` (`erstellenSchliessen` setzt sie auch nicht zurück), `:704–707`
(zurückgesetzt nur, wenn sich das `company`-Objekt ändert).
Szenario: Sammelabrechnung am Monatsende. Für Kunde A: Facharbeiter 58 €/h statt 68, Zahlungsziel
30 Tage, Skonto 3 %/10 Tage. Rechnung A angelegt. Danach Baustelle B gewählt, „Positionen
zusammenstellen“: `assembleInvoice(…, rates, …)` (Z. 1682) rechnet B mit 58 €/h, `confirmInvoice`
(Z. 1952–1961) schreibt 30 Tage und 3 % Skonto auf B. Zahlungsziel und Skonto stehen in der Vorschau
nirgends, der Abschnitt ist zugeklappt (`WeitereAngaben`). Der Beleg ist danach eingefroren —
Korrektur nur über Storno + Stornorechnung. Auch der USt-Satz (10/13/0 %) bleibt stehen. Belegt.

### Mittel

**M1 — Nach einer unklaren Antwort ist das Anlegen bis zum Neuladen gesperrt, ohne dass es gesagt wird.**
`InvoicesView.tsx:357`, `:2146` (einziges `setErstellungUnklar(true)`, kein Zurücksetzen im ganzen
Bauteil), `:1893` und `:4742` (sperren jedes weitere Anlegen), `:3408–3415` (Text: „Die Erstellung aus
dieser Vorschau bleibt gesperrt“); `src/lib/db/pg/invoices.ts:781` (jeder Netzabbruch → `RechnungsAntwortUnklar`).
Szenario: Tablet ohne Empfang, „Rechnung anlegen“ → `fetch` scheitert sofort, nichts hat den Server
erreicht. Der Benutzer prüft die Liste (keine Rechnung da), will neu anlegen — der Knopf bleibt für
jede Vorschau und jede Baustelle gesperrt. Ausweg ist nur das Neuladen der Seite; dabei gehen die
bearbeiteten Positionen verloren, obwohl die Meldung sagt „Deine Angaben bleiben erhalten“. Belegt.

**M2 — Mahnspesen über mehrere Stufen: Einstellung, Schreiben und Verbuchung rechnen drei verschiedene Modelle.**
- Einstellung/Grenze rechnet die SUMME der drei Stufen „je Rechnung“:
  `src/features/invoices/mahnung.ts:215–233`, `supabase/migrations/20260930230000_mahnspesen_grenze.sql:13–15, 36–43`,
  `src/features/settings/SettingsView.tsx:1480` („zusammen stehen hier …“).
- Das Schreiben fordert nur die Spesen SEINER Stufe: `mahnungPdf.ts:91, 167–170`; frühere Stufen
  stehen auf keiner späteren Mahnung mehr.
- Verbucht werden darf „letzte Mahnung (Kosten + Zinsen) minus ALLE bisherigen Mahnkosten-Eingänge“:
  `20261110160100_anzahlungskonten_mahnkosten.sql:224–248, 277–288`, `InvoicesView.tsx:1184–1186`.
- Die Zinsen rechnet jede Mahnung neu vom Zahlungsziel an auf den heutigen Rest (`InvoicesView.tsx:2179–2191`).
Szenario 1: Spesen 5/10/15 €. Mahnung 3 fordert Rest + 15 € + Zinsen; die 5 € und 10 € der Stufen 1
und 2 fordert niemand mehr, obwohl die Einstellung 30 € „je Rechnung“ ausweist und [10, 15, 20] als
„über 40 €“ abweist, obwohl nie mehr als 20 € auf einem Schreiben stünden.
Szenario 2 (nachgerechnet): Rechnung 1.000 €, Mahnung 2 fordert 10 € + 3,16 € Zinsen. Kunde zahlt
500 € + 13,16 € (verbucht: 500 Rechnung, 13,16 Mahnkosten). Mahnung 3 fordert 500 € + 15 € + 3,29 €
Zinsen (wieder ab Zahlungsziel, also auch für die schon bezahlte Zeit) = 518,29 €. Kunde zahlt genau
das. Der Dialog lässt als Mahnkosten nur 18,29 − 13,16 = 5,13 € zu; die übrigen 13,16 € werden
„Guthaben“, die Rechnung „Überzahlt“, und der Dialog schlägt die Rückzahlung vor — an einen Kunden,
der bezahlt hat, was der Brief verlangte. Belegt (Code gelesen, Zahlen nachgerechnet).

**M3 — Eine Schlussrechnung mit Restforderung 0,00 € bleibt für immer „Offen“.**
Erlaubt ist sie ausdrücklich (`InvoicesView.tsx:2565–2575`, DB: `coalesce(gesamt_netto, total_netto) > 0`
in `20261106300000_wartung_abdeckung.sql:241`). Aber: sie muss „Offen“ beginnen
(`20260926101000_rechnung_nur_ueber_funktionen.sql:84–103`), ein Eingang über 0 € ist verboten
(`20260919120000_zahlungseingaenge.sql:49`, `InvoicesView.tsx:1222`), und `zahlstand_setzen` kennt
„Bezahlt“ nur über `summe = brutto` nach `summe <= 0 → Offen`
(`20261110160100_anzahlungskonten_mahnkosten.sql:179–188`).
Szenario: Pauschale 10.000 €, Anzahlung 30 % + Teilbetrag 70 %, beide bezahlt. Schlussrechnung zieht
beide ab, Rest 0,00 €. Sie steht dauerhaft im Arbeitsstand „Offen“ (`RechnungsListe.tsx:47–50`), in
`listUnpaidInvoices` (Startseite, Mahnlauf-Grundlage) und im Ausgangsbuch als „Offen“ — schließen
lässt sie sich nicht. Belegt.

**M4 — Rechnungsdatum, Zahlungsziel und das Jahr der Rechnungsnummer kommen von der Uhr des Geräts.**
`InvoicesView.tsx:1950–1953` (`todayStr()` = Gerätedatum, `src/lib/time.ts:492`),
`src/lib/db/pg/invoices.ts:779` (`p_jahr: new Date().getFullYear()`),
`20260926100000_rechnung_in_einem_zug.sql:240–262` (nimmt `p_jahr` und `invoice_date` ungeprüft).
Die Stornorechnung nimmt dagegen Jahr und Tag vom Server (`20260930150000_geld_und_belege.sql:386`).
Szenario: Büro-PC oder Tablet mit falschem Datum (leere Pufferbatterie → 2020, oder falsche Zeitzone
kurz vor Mitternacht/Jahreswechsel): Rechnung „RE-2020-1001“ vom 01.01.2020, sofort überfällig, ein
neuer Zähler für 2020 ist eröffnet; der Beleg ist eingefroren. Ebenso das Mahndatum
(`mahnung_festhalten`, `p_datum`). Der Kommentar in `20261011100000_mahnung_nur_offen.sql:27`
(„`todayStr`, Wien“) stimmt nicht — es ist die Ortszeit des Geräts. Belegt (Eintritt selten, Folge
nicht rückholbar).

**M5 — Nachdruck und Belegarchiv enthalten den Leistungsnachweis nicht; er lässt sich nie wieder erzeugen.**
`src/features/invoices/nachdruck.ts:55–57` (`entries: []`, `appendDetail: false`),
`InvoicesView.tsx:640` (Haken „Leistungsnachweis anhängen“ ist vorbelegt), `pdf.ts:316`.
Szenario: Regierechnung über 80 Stunden geht mit Leistungsnachweis an den Kunden. Der Kunde verlangt
eine Kopie, oder die Kanzlei bekommt das Belegarchiv: „PDF erneut“ und das ZIP liefern die Rechnung
ohne die Seite mit Datum/Person/Tätigkeit/Stunden. Ob sie angehängt war, ist nicht gespeichert; die
Daten wären da (Abdeckung → Zeitbuchungen). Widerspricht dem eigenen Maßstab aus A1/T-28 („ein Beleg
muss sich so wieder erzeugen lassen, wie er ausgestellt wurde“). Steht in keiner Grenzenliste. Belegt.

### Niedrig

**N1 — Der Nachdruck einer Stornorechnung ändert seinen Text mit dem Zahlungsstand.**
`src/features/invoices/stornoPdf.ts:153–158`: „Bereits bezahlte X € erstatten wir …“ kommt aus
`zahlstand(inv).bezahlt` zum Zeitpunkt des Drucks. Szenario: Stornorechnung am 05.10. mit „Bereits
bezahlte 200,00 € erstatten wir“ ausgestellt; am 10.10. Rückzahlung gebucht → Nachdruck und
Belegarchiv sagen „Die Forderung … entfällt“. Die Mahnung hält ihren Inhalt genau deshalb fest, die
Stornorechnung nicht. Belegt.

**N2 — `cent()` rundet Halbcent-Fälle teils ab; Vorschlag und Datenbank rechnen beim Skonto verschieden.**
`src/features/invoices/totals.ts:63–71, 129, 135`; `skonto.ts:15, 50–53` gegen
`20261110160100_anzahlungskonten_mahnkosten.sql:337`.
Nachgerechnet: 4,25 h × 72,30 € = 307,275 → Zeile 307,27 (kaufmännisch 307,28); 0,75 h × 89,30 € =
66,975 → 66,97; Rabatt 3 % auf 167,50 € = 5,025 → 5,02; USt 10 % auf 40,15 € → 4,01. Bei
Viertelstunden × Satz mit Cent trifft es rund 3 % der Kombinationen, immer 1 Cent zu wenig. Die
Zahlen stehen so auf Beleg und E-Rechnung (Menge × Preis ≠ Zeilenbetrag bei kaufmännischer Prüfung).
Skonto: 2 % auf 106,75 € → App 2,13 (PDF nennt 104,62), Datenbank 2,14. Zahlt der Kunde 104,61,
bietet der Dialog den Ausgleich nicht an (Rest 2,14 > 2,13); von Hand als Art „Skonto“ geht es.
20 % USt ist nicht betroffen (nachgerechnet über 5 Mio. Beträge). Belegt.

**N3 — Die Nachkalkulation zählt gewährten Skonto als Erlös.**
`src/features/costing/nachkalkulation.ts:199–203`: Erlös = Summe `totalNetto` der gültigen
Rechnungen. Szenario: 10.000 € netto, 3 % Skonto gezogen → Erlös bleibt 10.000 statt 9.700; der
Deckungsbeitrag ist um den Skonto zu hoch. Der Betrag liegt an der Rechnung vor (`skontoBetrag`). Belegt.

**N4 — Die Lückenprüfung sieht keine Lücke an der Grenze zweier Exportzeiträume.**
`src/features/invoices/buchhaltungExport.ts:345–350, 364–403`: geprüft wird zwischen kleinster und
größter Nummer DES ZEITRAUMS. Szenario: Monatsexporte, September endet mit …1049, Oktober beginnt
mit …1051 — die fehlende 1050 meldet keiner der beiden, nur ein Jahresexport. (Im normalen Ablauf
entsteht keine Lücke; möglich über einen direkten Aufruf von `naechste_nummer`, der der Buchhaltung
offensteht, oder den Dienstschlüssel.) Belegt.

**N5 — „Bezahlt im Monat“ zählt Zahlungen auf ältere stornierte Rechnungen mit.**
`InvoicesView.tsx:1043–1046`: die Menge „storniert“ kommt aus den geladenen jüngsten Rechnungen;
eine stornierte Rechnung außerhalb der Liste mit Eingang im Monat zählt als bezahlt. Belegt, klein.

## 3. Verdacht (im Code gesehen, nicht nachgestellt)

- **V1 — `zahlstand_setzen` sperrt die Rechnung nicht, bevor es summiert**
  (`20261110160100_anzahlungskonten_mahnkosten.sql:153–200`, Auslöser `20260919120000_zahlungseingaenge.sql:259–275`).
  Zwei Eingänge auf dieselbe Rechnung im selben Augenblick (zwei Personen, zwei Reiter): jeder
  summiert ohne den anderen, der zweite überschreibt `bezahlt_betrag` mit seiner Teilsumme. Ebenso
  kann ein Eingang, der gleichzeitig mit einem Storno läuft, den Stand „Storniert“ mit „Bezahlt“
  überschreiben (der Stand wird vor dem Warten gelesen). `mahnkosten_passt` sperrt (`for update`),
  `skonto_passt` und der normale Eingang nicht. Fenster: Millisekunden; mittel, wenn es eintritt.
- **V2 — Lagerausgabe am Tag des Leistungsendes nach dem Ausstellen**
  (`20261027400000_r6_ruestliste_fehlmenge.sql:450–455, 492`): vorgeschlagen wird nur `datum > grenze`.
  Rechnung um 10 Uhr mit „Leistung bis heute“, Ausgabe um 14 Uhr desselben Tages → gilt als
  abgerechnet und kommt nie mehr als Vorschlag. Die Regel „mit dem Leistungsende gilt das Ausgegebene
  als abgerechnet“ ist dokumentiert; der Tagesrand nicht.
- **V3 — Entfernte oder gekürzte Stundenposition sperrt die Buchungen trotzdem**
  (`InvoicesView.tsx:1418–1422`, `:2056`): `linkedEntries` bleiben. Wer bei Regie „Helferstunden“
  löscht, markiert sie als verrechnet; der Leistungsnachweis listet weiter alle Stunden (auch
  Lehrlinge zum Satz 0), seine Summe weicht dann von der Rechnung ab. Vermutlich gewollt (Kulanz),
  aber nirgends gesagt.
- **V4 — Haftrücklass nach Regie-Teilrechnungen**: Grundlage ist `gesamt_brutto ?? total_brutto`
  (`InvoicesView.tsx:2553–2566`, `20261106300000_wartung_abdeckung.sql:305–309`). Teilrechnungen mit
  Belegen werden nicht abgezogen, also ist die „ganze Leistung“ nur der Rest. 100.000 € Auftrag,
  80.000 € in Teilrechnungen, Schlussrechnung 20.000 €: 5 % ergeben 1.000 € statt 5.000 €; 25 % vom
  Rest lässt die Grenze (20 %) nicht zu.
- **V5 — e-Rechnung.gv.at**: ob der Prüfdienst die 1-Cent-Abweichungen aus N2 (Menge × Preis)
  toleriert, habe ich nicht prüfen können.
- **V6 — Zeitbuchung geändert zwischen Vorschau und Anlegen**: die Vorschau rechnet 8 h, der Monteur
  korrigiert auf 10 h, „Rechnung anlegen“ sperrt die Buchung mit 10 h, verrechnet sind 8 h. Die
  Datenbank kann es nicht merken (Positionen sind frei). Selten.

## 4. Nicht nahtlos

- **Guthaben mit neuer Rechnung verrechnen**: Die Stornorechnung verspricht „erstatten oder mit einer
  neuen Rechnung verrechnen“ (`stornoPdf.ts:156`). Einen Weg dafür gibt es nicht: Rückzahlung auf der
  alten und Eingang auf der neuen Rechnung, beides von Hand — und der Zahlungsstapel bucht zwei
  Bankbewegungen, die es nie gab (`bmdExport.ts:514–525`).
- **Deckungsrücklass und Schlussrechnung**: Die Fälligkeit ist ein beim Ausstellen geratenes Datum
  (`ruecklass_bis`). Die Schlussrechnung macht ihn nicht fällig; früher geht nur über „Bankgarantie“.
- **Zahlungsziel und Skonto stehen nicht in der Vorschau** — nur im zugeklappten Abschnitt (siehe H1).
- **Zahlungseingänge exportierter Zeiträume** lassen sich frei ändern und löschen (bewusst so,
  `pg/zahlungen.ts`), aber nichts sagt, dass der Zeitraum schon als Stapel bei der Kanzlei liegt.
- **Storno → Neuausstellung**: nach dem Storno muss die Baustelle neu gewählt und alles neu
  zusammengestellt werden; eigene Zeilen, Rabatt, Texte der stornierten Rechnung gehen nicht mit.
- **Mahnung nach Teilzahlung der Mahnkosten** (M2): das Schreiben nennt bezahlte Spesen/Zinsen nicht.
- **Jahreskreis ab 1001 fest**: ein Betrieb, der mit eigener Nummer eingestiegen ist (z. B. 0357),
  bekommt im Folgejahr 1001 ohne Wahl (`naechste_nummer_kern`, `20261106400000…:104–121`).

## 5. Funktionen mit Mehrwert (in den bestehenden Abläufen)

1. **„Storno und neu ausstellen“ in einem Zug** — die Vorschau mit den Positionen der stornierten
   Rechnung vorbelegt; die häufigste Korrektur (falscher Preis, falsche Anschrift) kostet heute
   Storno, Stornorechnung und vollständiges Neuzusammenstellen.
2. **Guthaben umbuchen** auf eine andere Rechnung desselben Kunden (ein Vorgang, im Stapel als
   Umbuchung statt zweier Bankzeilen) — schließt die Zusage auf der Stornorechnung.
3. **Kontoauszug abgleichen** (CAMT/CSV einlesen, Verwendungszweck „RE-… / Baustelle“ steht schon
   auf jedem Beleg): Zahlungen, Skonto und Mahnkosten als Vorschlag statt Eintippen je Rechnung.
4. **Festschreiben nach dem Export**: ein übergebener Zeitraum wird markiert; Änderungen an Eingängen
   und spät ausgestellte Stornorechnungen darin warnen und erscheinen als Nachtrag.
5. **Konditionen sichtbar vor dem Anlegen**: Zahlungsziel, Skonto, Rücklass und Zahlbetrag als feste
   Zeile unter den Summen der Vorschau — genau die Angaben, die danach eingefroren sind.
6. **Sammelabrechnung**: aus „Nicht verrechnete Leistung“ mehrere Baustellen nacheinander mit
   „Weiter zur nächsten“ — der Monatslauf ist heute je Baustelle wählen, zusammenstellen, anlegen.

## 6. Was ich NICHT angesehen habe

- `src/features/accounting` (Stunden-/Lohnexport, Zuschläge, Überstunden) — gar nicht.
- `src/features/settings` nur Rechnungsvorgaben/Mahnspesen; Kontenrahmen-, Firmendaten-,
  Nummernkreis-Masken und ihre Prüfungen nicht im Einzelnen.
- `scheinAbgleich.ts`, `scheinHinweise.ts`, `materialkosten.ts`, `RechnungDetail.tsx`,
  `RechnungenLesen.tsx` (Leseliste der Projektleitung), `EbInterfaceDialog.tsx`, XML-Schreiber der
  E-Rechnung (nur die Rechenseite `belegRechnen`), `belegArchiv.ts` nur überflogen.
- Angebotsseite (Annahme, Pauschalangebot, Nachträge), Wartungs-Abo, Handwerksschein-Abläufe — nur
  soweit sie in die Rechnung münden.
- Zeilenschutz nur für `invoices`, `zahlungseingaenge`, `invoice_coverage`, `buchungskonten`;
  `unverrechnete_stunden`, `offene_posten`, `person_auskunft` nicht geprüft.
- Kein Lauf gegen einen lokalen Supabase-Stapel, keine Browserprüfung, kein Unit-Test gestartet;
  V1 (Gleichzeitigkeit) ist deshalb Verdacht geblieben.
- Datenmengen: Paginierung in `kern.abfragen` gelesen (500er-Seiten, fester Zweitschlüssel, lange
  `in`-Listen gestückelt) — keine Messung.
