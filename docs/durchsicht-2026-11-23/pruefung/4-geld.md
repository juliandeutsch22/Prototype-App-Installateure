# Gegenprüfung: 4-geld.md (G-1 bis G-17, V-1 bis V-6) — 23.11.2026

Geprüft von einem unabhängigen Prüfer. Stand `main` fa6e740 (der Arbeitsbaum steht auf
663b684; gegenüber fa6e740 sind nur Dateien unter `docs/durchsicht-2026-11-23/`
dazugekommen, kein Code — nur lesend nachgesehen).

**Womit geprüft:**
- Code gelesen bis zum Aufrufer (Ansicht → Datenschicht → Datenbankfunktion/Auslöser).
- Wegwerf-Datenbank `pruef_g` (alle 358 Migrationen am Endstand): letzte Fassung von
  `rechnung_anlegen`, `rechnung_ausstellen`, `rechnung_ersetzen`,
  `app.vorrechnungen_pruefen`, `app.eine_schlussrechnung`, `app.naechste_nummer_kern`,
  `app.rechnung_empfaenger_pruefen`, `app.mahnung_kundenart_pruefen` mit `\sf`; Auslöser,
  Regeln und Checks aus `pg_trigger`, `pg_policy`, `pg_constraint`.
- Eigene Skripte (nicht die des Autors), alle unter
  `/tmp/claude-0/-workspace-Prototype-App-Installateure/d2c6c62f-de1f-5d7d-8a7e-91e7b4244a5a/scratchpad/audit/pruef-g/`:
  - `g1.ts`, `g1b.ts` — rufen die echte `abgleichen`/`nummerImText` aus dem Repo auf
    (mit `esbuild` gebündelt, `@` → `src`), 24 Fälle samt Gegenbeispielen;
  - `g4.ts` — ruft die echte `buildBmdZahlungenCsv` mit Bar, Karte, Sonstiges,
    Überweisung und einer Bar-Rückzahlung;
  - `g16.ts` — 400.000 Zeilen und 200.000 Summen der echten `positionNetto`/`calcTotals`
    gegen eine exakte Dezimalrechnung (wie Postgres `numeric`), dazu die alte Rundung
    `centBisher`;
  - `g17.cjs` — dasselbe Dokument zweimal mit dem jsPDF des Repos, Prüfsummen verglichen;
  - `00_basis.sql` (Betrieb, zwei Konten, zwei Kunden, drei Baustellen), `g16.sql`,
    `g5.sql`, `g5b.sql`, `g6_g14.sql`, `g10_g12.sql`, `v4.sql`, `neben.sql`, `neben2.sql` — je in einer
    Transaktion mit `rollback`, Aufrufe als Geschäftsführung bzw. Monteur über
    `set local role authenticated` und Token-Ansprüche.
- Ein Lauf der bestehenden Prüfdatei `tests/unit/kontoauszugAbgleich.test.ts` (32 von 32
  grün). Kein Browser, keine weiteren Testläufe.

## 1. Ergebnis in Zahlen

| Urteil | Anzahl | Befunde |
|---|---|---|
| bestätigt (nachgestellt) | 7 | G-4, G-5, G-6, G-12, G-14, G-16, G-17 |
| bestätigt (am Code) | 9 | G-2, G-3, G-7, G-8, G-9, G-10, G-11, G-13, G-15 |
| teilweise | 1 | G-1 (Fehler nachgestellt; Umfang zu hoch angegeben, eine Aussage zu den bestehenden Prüfungen falsch, Vorschlag lässt den Betrieb ohne Vorsatz ungelöst) |
| widerlegt | 0 | — |
| nicht prüfbar | 0 | — |

Kein Befund ist widerlegt. **Die Warnungen liegen bei den Vorschlägen** — sechs von ihnen
würden so, wie sie im Papier oder im Plan stehen, etwas kaputt machen oder das Problem nur
halb lösen (G-1, G-2, G-5, G-6, G-14, G-16; Abschnitt 2, rechte Spalte, und Abschnitt 4).

Verdachtsfälle: V-4 entkräftet (dabei ein Nebenbefund), V-2 und V-3 als Tatsache am Code
bestätigt (Entscheidung bzw. Messung stehen weiter aus), V-1, V-5, V-6 stehen gelassen.

## 2. Je Befund

| Kürzel | Urteil | Eigener Beleg | Zum Vorschlag: Risiko „verschlimmbessern“, fehlendes „bleibt gleich“, Widerspruch |
|---|---|---|---|
| G-1 | **teilweise** | **Fehler nachgestellt** (`g1.ts`, eigene Daten): offene `RE-2026-1112` (Gruber, 3.600 €) und `RE-2026-1140` (Steiner, 750 €); Eingang 750 € von „Petra Steiner“, Zweck „Heizungsservice 20261112-004711“ → `passt`, „Teilzahlung auf RE-2026-1112“, vorgewählt (`KontoauszugView.tsx:130`). Ursache wie im Papier: `kontoauszugAbgleich.ts:161–165`, `:333`, `:248–263`. **Nicht richtig:** (1) Umfang — von 1001 bis 1231 sind nur **92** Nummern ein gültiges Monat-Tag (1001–1031, 1101–1130, 1201–1231), nicht „rund 230“; und es greift nur, wenn eine Rechnung genau dieser Nummer **desselben Jahres** beteiligt ist. (2) „die 32 bestehenden Fälle halten Treffer ohne Vorsatz mit passendem Betrag fest“ stimmt nicht: kein `abgleichen`-Fall der Prüfdatei nutzt eine Nummer ohne Vorsatz (nur `nummerImText` einzeln, Z. 42). Einzelheiten und Gegenbeispiele in Abschnitt 3. | **Löst nicht ganz:** Ein Betrieb **ohne Vorsatz** (ausdrücklich erlaubt, `praefixe.ts:39–43`) trifft das Datum auf **Stufe 2** (nachgestellt: `nummerImText('2026-1112', '… 20261112-004711') = 2`) — die Regel „Treffer ohne Vorsatz“ (Stufe 1) erreicht ihn nie, auch der zweite Teil nicht. **Verliert etwas:** wer bei einem Betrieb mit Vorsatz „20261015“ ohne Vorsatz und ohne Trenner für `RE-2026-1015` schreibt, fällt von „vorgewählt“ auf „bitte prüfen“ (92 Nummern je Jahr) — im Papier nicht als Risiko genannt. **Zweiter Teil des Vorschlags ist der wichtigere** (Stufe 1 nur `passt`, wenn der Betrag passt): er deckt auch fremde Nummern mit Jahr und Zahl (nachgestellt: „AN-2026-1112“, „B-2026-0007“ bei einem Betrieb, der ab 1 zählt, „05.11.2026 1112“) — der Plan hat genau diesen Teil weggelassen (Abschnitt 4). Der Zweig „Mahnspesen zu einer bezahlten Rechnung“ (`:229–232`) fehlt in der Liste „Betrag passt“: nachgestellt bucht ein Eingang von 40 € als Mahnkosten auf die falsche, bezahlte Rechnung, vorgewählt. **Fehlendes „bleibt gleich“:** Betrieb ohne Vorsatz, Zweck wie am Beleg gedruckt („2026-1112 / B-…“, `pdf.ts:286`), passender Betrag bleibt vorgewählt. |
| G-2 | bestätigt (am Code) | `reverseCharge`, `discount`, `ruecklassAn/Prozent/Bis`, `artWahl` werden außer von der Eingabe nur in `nachDemAusstellen` (`InvoicesView.tsx:2097–2114`) und `ersetzenVorbereiten` (`:2131–2154`) gesetzt; `baustelleWaehlen` (`:753–759`), `vorschauVerwerfen` (`:761–765`) setzen nur Sätze und Ersatz zurück. Die nächste Vorschau rechnet mit dem stehen gebliebenen Zustand: `satz = geltenderSatz(reverseCharge, …)` (`:1525`), `recalc(…, satz, eigenerRabatt ?? rabatt)` (`:2035`). Die bestehende Prüfung „eine andere Baustelle ist eine andere Rechnung“ (`InvoicesView.test.tsx:6279`) prüft nur die Konditionen. | **Unvollständig gegenüber dem eigenen Titel:** `steuerbefreiung` steht **nicht** in `nachDemAusstellen` — sie wird nur beim Laden des Betriebs gesetzt (`:852`) und bleibt heute sogar nach dem Ausstellen stehen. „Genau die Zeilen aus `nachDemAusstellen`“ setzt sie also nicht zurück; nötig ist `setSteuerbefreiung(company?.steuerbefreiungVorgabe ?? '')` (nicht leer!). Ebenso bleibt `appendDetail` („Leistungsnachweis anhängen“) nach einem verworfenen oder ausgestellten Ersatz auf dem Wert der alten Rechnung (`:2154`, sonst nie gesetzt). **Nicht mitnehmen:** `setStundenStand(n+1)` aus `nachDemAusstellen` — es lädt die offenen Stunden neu, bei jedem Baustellenwechsel unnötig. **Zu benennen:** die Art springt beim Wechsel auf „Einzelrechnung“ zurück (wer erst „Anzahlung“ wählt und dann die Baustelle korrigiert, muss sie neu wählen). Die erste Wahl der Baustelle darf weiter nichts zurücksetzen (bestehende Prüfung Z. 6279) — das hält der Vorschlag ein. |
| G-3 | bestätigt (am Code) | `ruecklass.ts:30–40`, `InvoicesView.tsx:3057–3069` (`grundlageBrutto: summen.gesamtBrutto`), `mitAbzug` (`vorrechnungen.ts:186–202`: Gesamt = Summe dieser Rechnung), `abziehbar` (`:49–66`: Rechnungen mit Belegen werden nicht abgezogen). `\sf rechnung_anlegen`: dieselbe Formel, höchstens 20 %. `ruecklass_bis` ist eingefroren (`rechnung_eingefroren`), anders wird nur über die Bankgarantie fällig. Zusage: `handbuch.html:4453`. Rechenbeispiel des Papiers nachgerechnet: stimmt. | Die „Toleranz: beide Grundlagen zulässig“ schwächt die bestehende Nachrechnung in `rechnung_anlegen` bewusst ab — eine Frist dafür nennen (bis wann), sonst bleibt sie. Fällig stellen „nur nach vorn, nur bei offenem Rücklass“ ist richtig; als „bleibt gleich“ fehlt: eine durch Bankgarantie abgelöste Teilrechnung wird nicht noch einmal angefasst. Fachlich zuerst K-2 (so steht es im Plan). |
| G-4 | bestätigt (nachgestellt) | `g4.ts` mit der echten Funktion: Bar 180 € → `2800;2000;04.11.2026;RE-2026-1050;Zahlung …` (Bank an Debitoren); Karte ebenso; Bar-Rückzahlung → Debitoren an Bank. Die Zahlungsart steht nirgends in der Zeile. Check `buchungskonten_zweck_check` kennt kein Kassakonto (`pg_constraint`). Keine Entscheidung, die das so will (Stand 11.1 sagt nur „keine Registrierkasse“). | **Lücke im Vorschlag:** Zahlungsart **„Sonstiges“** (Gegenverrechnung, Scheck) geht ebenfalls auf die Bank (nachgestellt) und ist nicht erwähnt. Für „Karte“ ist offen, was ohne eigenes Konto gilt („wenn die Kanzlei es will“) — vor dem Bau festlegen, sonst entsteht je nach Lesart keine Datei oder weiter eine Bankzeile. Risiko „bis zum Eintragen keine Datei“ ist benannt und gehört ins Handbuch. Hängt an K-1. |
| G-5 | bestätigt (nachgestellt) | `g5.sql`: Monteur bucht 8 h, ändert auf 10 h; `rechnung_ausstellen` mit der alten Zeile (8 h × 68 €) und der Kennung der Buchung → angelegt; `invoice_lines.qty = 8`, `time_entries.hours = 10`, `is_billed = true`. Danach ist die Buchung gesperrt („… mit Rechnung RE-2026-1001 verrechnet und kann nicht mehr geändert werden“). App-Seite am Code: in `confirmInvoice` (`:2288–2500`) gibt es außer dem Ausstellen keinen Ladeaufruf. | **Der Schlüssel `time_entry_minuten` in `p_belege` bricht gegen die heutige Funktion:** `rechnung_anlegen` liest jeden Schlüssel von `p_belege` als Belegart mit einer Liste — nachgestellt (`g5b.sql`): `ERROR: cannot extract elements from an object`. Trifft eine neue App-Fassung auf die alte Datenbankfunktion, lässt sich **keine Rechnung mit Stunden mehr ausstellen**. Entweder die Migration zwingend vor der App ausliefern und das prüfen, oder die Minuten in `p_kopf` tragen (unbekannte Schlüssel verwirft `jsonb_populate_record`). Die zweite Minutenrechnung in SQL (vom Papier selbst als Risiko genannt) ließe sich vermeiden: Vergleich über `updated_at` der Buchung statt über nachgerechnete Minuten — weist auch bei einer bloßen Notizänderung ab, kostet dann nur ein neues Zusammenstellen. |
| G-6 | bestätigt (nachgestellt) | `g6_g14.sql`: Baustelle `Pauschal`, zweimal `rechnung_ausstellen` Art `einzel` ohne Belege → `RE-2026-1001` und `RE-2026-1002`, beide „Offen“; sogar eine Schlussrechnung danach wird angelegt. Abgewiesen wird nur die zweite **Schluss**rechnung (`app.eine_schlussrechnung`). Sperre der Oberfläche nur beim Zusammenstellen (`InvoicesView.tsx:1885–1894`). | **Unvollständig:** „Auslöser vor dem Anlegen“ reicht nicht — es gibt `public.rechnung_storno_aufheben`. Rechnung 1 stornieren, Rechnung 2 ausstellen, Storno von 1 aufheben ergibt wieder zwei gültige. Der Auslöser muss wie `app.vorrechnungen_pruefen` auch beim Aufheben eines Stornos greifen. **Geprüft und in Ordnung:** `rechnung_ersetzen` storniert zuerst und stellt dann aus — „Stornieren und neu ausstellen“ einer Pauschale bleibt möglich. Der Auslöser braucht `project_id` bzw. die Abrechnungsart: er muss nach `invoices_baustelle` laufen (Auslöser laufen nach Namen) oder selbst über beide Schreibweisen der Nummer suchen. Fehlendes „bleibt gleich“: Baustelle ohne Abrechnungsart (Altdaten, `billing_mode` leer) gilt als Regie. |
| G-7 | bestätigt (am Code) | `pg_policy` auf `mahnungen`: nur `mahnungen_lesen` und `mahnungen_anlegen`; unter den Funktionen mit „mahn“ keine zum Zurücknehmen; `mahnstufe` setzt nur `mahnung_festhalten`. | **Fehlender Fall:** Rechnungen, die vor dem 10.10.2026 gemahnt wurden, tragen eine Stufe ohne Zeile in `mahnungen` (Tabelle seit `20261010700000`). „Zurück auf den Stand der vorigen Mahnung“ ist dort nicht bestimmt — festlegen (Altdaten), mit eigener Prüfung. Die fünf Lesestellen samt Wächter sind richtig benannt; zusammen mit G-8 bauen (dessen neue Zahl muss zurückgenommene Mahnungen ebenso ausnehmen). |
| G-8 | bestätigt (am Code) | `shared/forderungen.ts:307–312` (bezahlt → nicht mahnbar), `RechnungsListe.tsx:47–50` (`imArbeitsstand`), offene Mahnforderung nur im Zahlungsdialog (`InvoicesView.tsx:1343–1350`), `RechnungDetail.tsx:290` zeigt nur Bezahltes. Dazu: der Kontoauszug findet solche Kosten nur über die Nummer im Zweck (`kontoauszugAbgleich.ts:229–232`). | Kein Einwand. Reihenfolge: nach oder mit G-7. |
| G-9 | bestätigt (am Code) | Keine Tabelle für Übergaben (`information_schema`: kein Treffer zu export/uebergab/festschr). Regeln `zahlungen_aendern` und `zahlungen_loeschen` ohne Altersgrenze (`pg_policy`). Gegenbuchung wandert mit der Stornorechnung (`buchhaltungExport.ts:166–172`), der Export warnt nur (`InvoicesView.tsx:5801–5808`). | Kein Einwand; „ohne jeden Vermerk verhalten sich alle drei Exporte wie heute“ als eigene Prüfung ist das Entscheidende. |
| G-10 | bestätigt (am Code) | Meldungen `InvoicesView.tsx:2321–2333`, `:5050–5055`; Abweisung in `app.vorrechnungen_pruefen` (nachgestellt: „Die Vorrechnungen übersteigen die Gesamtleistung …“). **Der Weg, den das Papier nennt, funktioniert** (`g10_g12.sql`): Anzahlung 5.000 € bezahlt → `rechnung_ersetzen` über 4.200 € → `guthaben_umbuchen` 4.200 € → Rückzahlung 800 € → Schlussrechnung mit Rest 0 wird angelegt und steht auf „Bezahlt“. **Ein Beleg ist ungenau:** „Rechnungspositionen kennen kein Minus“ — die App baut selbst eine Zeile mit negativem Preis (Rabatt je Angebot bei mehreren angenommenen Angeboten, `pauschale.ts:76–85`), und die Datenbank nimmt sie an (nachgestellt). Nur die Eingabefelder lassen kein Minus zu. | Stufe 1 ist tragfähig (der Weg ist belegt). Für Stufe 2 heißt das: negative Zeilen gibt es technisch schon; der Satz im Grenzen-Dokument (Z. 644–648) ist beim Nachziehen zu berichtigen. Der Plan gibt Stufe 1 falsch wieder (Abschnitt 4). |
| G-11 | bestätigt (am Code) | `customers` hat keine Spalte für Zahlungsziel, Skonto, Nachlass (`\d`); `betriebSaetze = betriebsKonditionen(company?.rates)` (`InvoicesView.tsx:750`). | Erst nach G-2 (so im Plan: Paket 2 vor Paket 20). |
| G-12 | bestätigt (nachgestellt) | `g10_g12.sql`: im neuen Jahr Wunschnummer 1 → abgewiesen, ohne Wunsch → `RE-2027-1001`. `\sf app.naechste_nummer_kern`. | Entschieden (E-G12). Nebenbei: die Abweisung nennt „die nächste ist 0001“, gezogen wird 1001 — Text berichtigen, wenn die Funktion ohnehin angefasst wird. |
| G-13 | bestätigt (am Code) | `bmdExport.ts` (nur Debitoren, Erlös, Anzahlung, Bank, Skonto, Mahnkosten; Zahlungsstapel ohne Steuer je Eingang), `buchhaltungExport.ts:293` („Bezahlt“ als Summe). | Entscheidung offen (E-G13) — richtig eingeordnet. |
| G-14 | bestätigt (nachgestellt) | `g6_g14.sql`: Anzahlung 3.000 € mit 0 % (Kleinunternehmer), Schlussrechnung 10.000 € netto mit 20 % zieht sie ab → angelegt: `total_netto 7.000`, `total_vat 2.000`, `total_brutto 9.000`. `\sf app.vorrechnungen_pruefen` vergleicht an zwei Stellen nur `reverse_charge`. | **Zwei Stellen, nicht eine:** derselbe Auslöser verlangt weiter oben, dass die Schlussrechnung jede Anzahlung mit gleichem `reverse_charge` abzieht („muss abziehen …“). Wird nur die Einzelprüfung um den Satz ergänzt, verlangt die eine Stelle den Abzug und die andere verbietet ihn — mit irreführender Meldung. Beide Stellen und `abziehbar`/`pflichtAbzug` in der App müssen dieselbe Regel tragen. **Altdaten:** `invoices.vat_rate` darf leer sein; ein Vergleich mit `is distinct from` wiese den Abzug jeder alten Anzahlung ohne gespeicherten Satz ab — leer wie in der App behandeln (`alt.vatRate ?? Satz des Betriebs`), eigene Prüfung. |
| G-15 | bestätigt (am Code) | `NachkalkulationView.tsx:78` (`listRecentProjects(companyId, 300)`), Hinweis nennt nur die 25 je Lauf (`:27`, `:277`); eine Zeile Kostensätze je Betrieb (`pg/kosten.ts:35–37`), angewandt auf alle Stunden (`nachkalkulation.ts:159–160`). | Kein Einwand. |
| G-16 | bestätigt (nachgestellt) | `g16.sql`: Zeilen 136 € bei Kopf 1.000/200/1.200 → angelegt; Steuer 5 € und Brutto 999,99 € bei 136 € netto → angelegt; Zeile „2 × 68 = 500“ → angelegt; Rabatt 10 % mit Betrag 50 € → angelegt. Kein Auslöser und kein Check auf `invoices`/`invoice_lines` rechnet nach. | **Der Vorschlag ist richtig, braucht aber vier Festlegungen — sonst weist er richtige Rechnungen ab** (Abschnitt 3): (1) bei Abzug Steuer und Brutto nur gegen `gesamt_*` prüfen, nie gegen `total_*`; (2) aus den **übergebenen** Werten rechnen, nicht aus den gespeicherten Spalten; (3) negative Zeilen zulassen; (4) leeres `subtotal_netto` bestimmen. Messung dazu: die heutige App liegt bei 400.000 Zeilen und 200.000 Summen in keinem Fall neben der exakten Rechnung, die alte Rundung höchstens einen Cent — der eine Cent Spielraum reicht für (2)-gerechte Prüfung. |
| G-17 | bestätigt (nachgestellt) | `g17.cjs`: dasselbe Dokument zweimal mit jsPDF → Prüfsummen verschieden; mit `setCreationDate` und `setFileId` → gleich. Im Dokument stehen `/CreationDate` von jetzt und eine zufällige `/ID`. `grep` über `src`: kein `setCreationDate`, kein `setFileId`. Text der Grenze: `grenzen-durchsicht…:851–854`. | Kein Risiko für den Ablauf. `nachdruck.ts` erzeugt selbst kein PDF (nur die Angaben) — die Stellen sind `pdf.ts:144`, `stornoPdf.ts:63`, `mahnungPdf.ts:227`, `angebotPdf.ts:61`. Die Aussage „bitgleich“ gilt auch dann nur, solange Stammdaten des Betriebs und Gestaltung gleich bleiben — so formulieren. |

## 3. Nicht bestätigt — im Einzelnen

### G-1 (teilweise): Fehler steht, Umfang und Vorschlag sind zu berichtigen

**Was das Papier sagt:** „betrifft jeden Betrieb in jedem Jahr für seine ersten rund 230
Rechnungen (laufende Nummern 1001 bis 1231 …)“; Vorschlag in zwei Teilen; „die 32
bestehenden Fälle halten Treffer mit Vorsatz und Treffer ohne Vorsatz mit passendem
Betrag fest“.

**Was ich gefunden habe** (`g1.ts`, `g1b.ts`, echte Funktion):

Wann es greift:

| Zweck | Ergebnis |
|---|---|
| „Heizungsservice 20261112-004711“ (Datum als Referenz, danach ein Trenner) | `passt`, Teilzahlung auf die fremde `RE-2026-1112` |
| „Zahlung vom 20261112“ (Datum allein) | ebenso |
| „Rechnung vom 05.11.2026 1112“ (Jahr am Ende eines Datums, danach eine vierstellige Zahl) | ebenso |
| „Anzahlung laut AN-2026-1112“ (Angebotsnummer) | ebenso — kein Datum im Spiel |
| „B-2026-0007“ bei einem Betrieb, der seine Rechnungen ab 1 zählt | `passt`, Teilzahlung auf `RE-2026-0007` |
| Datum, Betrag zufällig gleich dem Rest der fremden Rechnung | `passt`, „Gleicht RE-2026-1112 aus“ |
| fremde Rechnung bezahlt und gemahnt, Mahnkosten offen, Eingang 40 € | `passt`, 40 € als Mahnkosten auf die fremde Rechnung |
| fremde Rechnung bezahlt oder storniert | `pruefen` („würde Guthaben“) — nicht vorgewählt, aber der richtige Vorschlag über Betrag und Name ist verdrängt. Die Ansicht lädt solche Rechnungen eigens nach (`KontoauszugView.tsx:107–110`) |
| Betrieb **ohne Vorsatz**, „20261112-004711“ | `passt` auf `2026-1112` — hier auf **Stufe 2** |

Wann es **nicht** greift:

| Zweck | Ergebnis |
|---|---|
| „20261112004711“ (Referenz ohne Trenner, 14 Ziffern) | richtig: `pruefen`, Betrag und Name → Steiner |
| „2026-11-12“, „12.11.2026“, „12112026“ | richtig — TTMMJJJJ kann die Nummer nie treffen |
| „REF20261112-004711“ (Buchstabe direkt davor) | richtig |
| richtige Nummer mit Vorsatz steht zusätzlich im Zweck | richtig (Stufe 2 geht vor) |
| Rechnung gleicher Zahl aus dem Vorjahr (`RE-2025-1112`) | richtig |
| keine Rechnung mit dieser Nummer im Jahr | richtig |
| Abbuchung an einen Lieferanten mit Datum-Referenz | `offen` statt `fremd` („… im Zweck, aber ohne Guthaben“) — nur eine falsche Auskunft, nichts vorgewählt |

Zum Umfang: gültige Monat-Tag-Zahlen ab 1001 gibt es 92 (gezählt), nicht rund 230. Dazu
muss die Rechnung dieser Nummer aus demselben Jahr stammen wie das Datum. Bei einem
Betrieb mit vielen Rechnungen sind 1001–1231 im Herbst längst bezahlt (dann nur der
verdrängte Vorschlag); **vorgewählt falsch** wird es vor allem bei kleinen Betrieben
(100 bis 250 Rechnungen im Jahr: die Nummern 1101–1130 entstehen dort selbst im Herbst)
und bei lange offenen Rechnungen. Schwere eher „mittel“ als „mittel bis hoch“. Dafür ist
der Fehler **breiter als „Datum“**: jede fremde Kennung aus Jahr und vierstelliger Zahl
(Angebot, Baustelle, Auftragsnummer einer Hausverwaltung) löst ihn aus.

**Zum Vorschlag „verliert die Regel echte Nummern ohne Vorsatz?“** (Betrieb ohne Vorsatz,
Nummern 1001–1231 in jedem Jahr):
- In der Fassung des **Papiers** (nur Treffer der Stufe 1, nur ohne Trenner): Der Betrieb
  ohne Vorsatz verliert nichts — aber ihm hilft die Regel auch nicht, weil seine Treffer
  Stufe 2 sind. Der Fehler bleibt dort vollständig bestehen (auch Teil zwei des
  Vorschlags gilt nur für Stufe 1).
- Wird die Datumsregel deshalb auf Stufe 2 ausgedehnt, verliert dieser Betrieb für 92
  Nummern je Jahr die Schreibweise ohne Trenner („20261112“): mit passendem Betrag fällt
  sie auf „bitte prüfen“, mit Teilbetrag auf „nicht zugeordnet“. Die Schreibweise mit
  Trenner („2026-1112“, so steht sie am Beleg) bleibt — **wenn** die Regel ausdrücklich
  nur die zusammenhängende achtstellige Folge meint.
- In der Fassung des **Plans** („Ziffernfolge ohne Vorsatz … wenn sie kein Datum ist“,
  ohne „ohne Trenner“) ist eine Lesart möglich, nach der auch „2026-1112“ als Datum
  gilt. Dann verlöre der Betrieb ohne Vorsatz für 92 Nummern je Jahr den Treffer auf
  genau den Zweck, den sein Beleg vorgibt. Die bestehende Prüfung `'Rechnung 2026-1001'
  → 1` finge das nur für Betriebe mit Vorsatz ab.

**Was zu ändern ist:**
- Papier: Umfang auf 92 Nummern und die Bedingung „gleiches Jahr, Rechnung dieser Nummer
  vorhanden“ berichtigen; Auslöser um „fremde Nummer aus Jahr und Zahl“ erweitern; den
  Satz über die 32 Fälle streichen (für Stufe 1 im Abgleich gibt es heute keine Prüfung).
- Vorschlag: (a) Teil zwei (Betrag muss passen, sonst höchstens „bitte prüfen“) als
  Hauptregel für **jeden Treffer ohne Buchstaben-Vorsatz** — also auch für Stufe 2 eines
  Betriebs ohne Vorsatz; (b) die Datumsregel nur für die zusammenhängende achtstellige
  Folge; (c) der Zweig „Mahnspesen zu bezahlter Rechnung“ zählt bei einem solchen
  Treffer nicht als „Betrag passt“; (d) neue Prüfungen „bleibt gleich“: Betrieb ohne
  Vorsatz mit „2026-1112“ und passendem Betrag bleibt vorgewählt; Betrieb mit Vorsatz
  mit „2026-1015“ und passendem Betrag bleibt vorgewählt; Gegenproben mit
  „AN-2026-1112“ und Teilbetrag.

### G-16 (bestätigt, Vorschlag mit Auflagen): gibt es Rechnungen, bei denen Summe und Zeilen absichtlich nicht aufgehen?

Durchgesehen: Einzelrechnung, Anzahlung (`anzahlung.ts`), Teilbetrag der Pauschale,
Pauschale und Einheitspreis aus dem Angebot (`pauschale.ts`), Wartung, Material,
Schlussrechnung mit Abzug (`mitAbzug`), Rabatt je Zeile und über alles, Rücklass, Skonto,
Übergang der Steuerschuld, Ersatz (`ersetzenVorbereiten`). Jede Vorschau läuft durch
`recalc` (`assemble.ts:77–85`): Zeile = gerundet(Menge × Preis × (1 − Rabatt)), Summe =
Summe der Zeilen, Rabatt und Steuer nach `calcTotals`. Rücklass und Skonto mindern nur
den Zahlbetrag. **Absichtlich nicht aufgehend ist genau eines — und drei Stellen sind
Fallen:**

1. **Abzug von Anzahlungen: die Steuer der Restforderung ist nicht „Netto × Satz“.**
   `total_vat = gesamt_vat − Summe der Steuern der Vorrechnungen` (`vorrechnungen.ts:186–202`,
   die Datenbank verlangt das auf den Cent). Beispiel: Gesamt 1.000,02 € → Steuer 200,00;
   drei Anzahlungen je 100,03 € → je 20,01; Rest netto 699,93 → × 20 % = 139,99, auf dem
   Beleg stehen richtig 139,97. Zwei Cent — über dem Spielraum. Noch deutlicher im Fall
   G-14 (Steuer 2.000 auf 7.000 netto). Die Nachrechnung von Steuer und Brutto darf bei
   Abzug **nur** `gesamt_netto/gesamt_vat/gesamt_brutto` prüfen; `total_*` prüft schon
   `app.vorrechnungen_pruefen`. Das Papier sagt es für das Netto, bei der Steuer („Steuer
   = gerundet(Netto × Satz)“) nicht — der Plan gar nicht.
2. **Gespeicherte Menge und gespeicherter Preis sind gerundet.** `invoice_lines.qty` hat
   drei, `unit_price` vier Nachkommastellen; die Felder der Vorschau nehmen jede Zahl an
   (`ZahlFeld.tsx:114–141`, kein Limit). Nachgestellt (`g5b.sql`): Menge 0,3333 × 68 € →
   App 22,66 €, gespeichert wird 0,333 → aus den Spalten gerechnet 22,64 € (2 Cent);
   5.000 × 1,23456 → 6.172,80 € gegen 6.173,00 € (20 Cent). „Am Ende von
   `rechnung_anlegen` nachrechnen“ aus den Tabellen wiese solche Rechnungen ab. Die
   Prüfung muss die übergebenen JSON-Werte nehmen. (Dass die gespeicherte Zeile dann
   nicht mehr aufgeht, ist ein eigener kleiner Mangel — siehe Abschnitt 5, N-4.)
3. **Negative Zeilen gibt es:** „Rabatt laut AN-…“ bei mehreren angenommenen Angeboten
   (`pauschale.ts:76–85`), von der Datenbank angenommen. Die Prüfung darf kein „Zeile ≥ 0“
   voraussetzen.
4. **`subtotal_netto` darf leer sein** (Spalte ohne Pflicht). Die App schickt es immer
   (`InvoicesView.tsx:2441`), fünf der sechs Prüfdateien, die `rechnung_anlegen`
   direkt rufen, schicken es nicht. Festlegen: leer = Summe der Zeilen gilt, oder die
   Prüfungen anpassen (46 Dateien unter `tests/supabase` legen Rechnungen an).

Die Ausnahme „Dienstschlüssel“ ist in `rechnung_anlegen` gegenstandslos: die Funktion
weist ohne Betrieb im Token ohnehin ab; das Rückspielen einer Sicherung schreibt die
Tabellen direkt. Als Prüfung **in der Funktion** (nicht als Auslöser) bauen, dann bleibt
das Rückspielen unberührt. Titel- und Textzeilen sind schon per Check ohne Betrag.

## 4. Zum Plan

1. **G-1, Kurztext in Paket 2 weicht vom Papier ab und ist schwächer.** Der Plan nennt
   nur die Datumsregel („JJJJMMTT, TTMMJJJJ … nicht Teil einer längeren Ziffernfolge“).
   (a) TTMMJJJJ kann die Nummer nicht treffen (nachgestellt), (b) „nicht Teil einer
   längeren Ziffernfolge“ gilt heute schon (nachgestellt: 14 Ziffern treffen nicht), (c)
   der zweite Teil des Papiers — Treffer ohne Vorsatz nur vorgewählt, wenn der Betrag
   passt — fehlt, und nur er deckt Angebots- und Baustellennummern, (d) der Betrieb ohne
   Vorsatz bleibt ungelöst, (e) ohne den Zusatz „ohne Trenner“ droht der Verlust echter
   Nummern (Abschnitt 3). „Bleibt: die 32 bestehenden Fälle“ genügt nicht — keiner davon
   prüft einen Abgleich ohne Vorsatz. Auch Abschnitt 1.2 des Plans („hält ein Datum … für
   eine Rechnungsnummer“) sollte die breitere Ursache nennen.
2. **Paket 2 nennt keine Voraussetzung, braucht aber Paket 1.** G-5, G-6 und G-16 ändern
   `rechnung_anlegen`. Deren geltende Fassung ist nicht die letzte `create or replace`
   (`20261116050400`), sondern diese plus ein Textersatz (`20261116060000:280`,
   `pg_get_functiondef`). Wer die neue Fassung aus der Migrationsdatei abschreibt, verliert
   die Belegart `ruest_position` und `material_je_ausgabe` — genau die Fehlerart von Z-2.
   Also: Wächter aus Paket 1, Schritt 1 zuerst; Ausgangstext aus `\sf`; die drei Punkte in
   **einer** Migration. Das Papier zitiert bei G-16 und G-5 ebenfalls Zeilen der älteren
   Datei.
3. **G-4 steht in Stufe A, hängt aber an der Kanzlei (K-1).** Paket 2 lässt sich damit
   nicht abschließen, ohne auf die Auskunft zu warten. G-4 aus Paket 2 lösen (eigener PR,
   sobald K-1 beantwortet ist) — sonst hält es die neun anderen Punkte auf oder wird ohne
   Auskunft gebaut.
4. **Aufwand Paket 2 (4–5 Tage) ist knapp** für zehn Punkte, darunter G-16 mit „zuerst
   messen“ und der Anpassung bestehender Datenbankprüfungen sowie drei Änderungen an der
   Funktion, die jede Rechnung anlegt.
5. **G-5 im Plan („Datenbankprüfung mit zwei Sitzungen“):** zusätzlich die Reihenfolge der
   Auslieferung festhalten (Datenbank vor App) oder die Minuten nicht in `p_belege`
   tragen — sonst sperrt die Zwischenzeit das Ausstellen (Abschnitt 2).
6. **G-10, Paket 20 (d) gibt Stufe 1 falsch wieder.** Im Plan: „Stufe 1:
   Schlussrechnung mit Guthaben“. Im Papier ist Stufe 1 etwas anderes und viel
   Kleineres: die Meldung nennt den vorhandenen Weg (Anzahlung ersetzen, Guthaben
   umbuchen, Rest zurückzahlen), und eine Rückgabe nach der Rechnung bleibt als Zeile für
   Buchhaltung und Spitze sichtbar. Eine Schlussrechnung mit Guthaben wäre ein neuer
   Beleg (Stufe 2). Der Aufwand „2 + 6“ passt nur zur Fassung des Papiers.
7. **G-17 steht unter „Punkte“ von Paket 20, hat dort aber keinen Schritt** (a–h) und
   keinen Aufwand.
8. **Nicht im Plan angekommen** (aus Abschnitt 4 und 5 des Papiers): der Handgriff
   „Zahlstand neu rechnen“ für alte Schlussrechnungen mit Rest 0 (der Betrieb kann sie
   sonst nicht schließen — ein Eingang über null ist verboten,
   `zahlungseingaenge_betrag_check`); „die App schickt kein Rechnungsdatum mehr“ (ein
   Gerät mit falscher Uhr kann heute gar nicht ausstellen, `rechnung_ausstellen` weist
   ab); abweichender Rechnungsempfänger und Sammelrechnung als zu entscheidende Lücke;
   Rücklastschrift als negativer Eingang; und alle neun Ideen aus Abschnitt 5 — der Plan
   zählt Ideen nur aus den Papieren 9 bis 12. Darunter der Zahlschein-Code (EPC-QR), der
   laut Papier G-1 an der Wurzel entschärft.
9. **Widersprüche zwischen Vorschlägen**, die beim Bau zu beachten sind:
   G-16 ↔ G-14/Abzug (Steuer nur gegen die Gesamtleistung prüfen); G-16 ↔ G-10 Stufe 2
   und die bestehende negative Rabattzeile (kein „≥ 0“); G-7 ↔ G-8 (die neue Zahl
   „Mahnkosten offen“ muss zurückgenommene Mahnungen ausnehmen — gemeinsam bauen);
   G-2 ↔ G-11 (Zurücksetzen später „auf Kunde, sonst Betrieb“ — im Papier bedacht).
10. **Entfernt kein Vorschlag eine bestehende Funktion?** Keiner entfernt eine
    Bedienstelle. Schwerer erreichbar würde: bei G-1 das Vorwählen von Teilzahlungen ohne
    Vorsatz (gewollt, benannt) und — nur bei falscher Umsetzung — echte Nummern ohne
    Vorsatz; bei G-4 der Zahlungsstapel bis zum Eintragen des Kassakontos (gewollt,
    benannt); bei G-2 die gewählte Rechnungsart nach einem Baustellenwechsel (nicht
    benannt).

## 5. Geklärte Verdachtsfälle und Nebenbefunde

**V-4 (`rechnung_ersetzen` mit den Rechten des Eigentümers) — entkräftet.** `v4.sql`:
Ersetzen mit einer Zeitbuchung eines fremden Betriebs wird abgewiesen („… gehört nicht zu
diesem Betrieb“); als Monteur wird es abgewiesen („Ersetzen darf, wer Rechnungen ausstellt
und storniert“). Einen Unterschied zum Weg mit den Rechten des Aufrufers habe ich nicht
gefunden. Dabei aufgefallen (N-2).

**V-2 (entfernte Stundenposition sperrt ihre Buchungen) — als Tatsache bestätigt.**
`entfernePos` (`InvoicesView.tsx:1601–1605`) filtert nur die Positionen; `linkedEntries`
bleibt über `...base` in `recalc`. Ob gewollt, bleibt eine fachliche Entscheidung.

**V-3 (eine Abfrage je gemahnter Rechnung) — als Tatsache bestätigt**
(`KontoauszugView.tsx:118–121`), nicht gemessen.

V-1, V-5, V-6: nicht geklärt (Kanzlei, Browser, künftige Anzeige).

**Nebenbefunde** (nicht im Papier; beim Nachstellen aufgefallen, je nachgestellt):

- **N-1 `rechnung_anlegen` lässt sich direkt mit frei gewählter Nummer rufen.** Die
  Funktion ist für `authenticated` freigegeben; die App nutzt diesen Weg nicht
  (`createInvoice` hat keinen Aufrufer). Zwei Folgen, beide nachgestellt als
  Geschäftsführung: (a) `neben.sql` — noch kein Zähler im Jahr: `RE-2026-5000` direkt
  angelegt, die nächste über `rechnung_ausstellen` gezogene Nummer ist `RE-2026-5001`,
  der Kreis hat eine Lücke von 3.999 Nummern. (b) `neben2.sql` — Zähler steht auf 1001:
  `RE-2026-1003` direkt angelegt, die nächste gezogene ist 1002, die übernächste
  scheitert mit `duplicate key … invoices_nummer_je_betrieb`; weil der Zähler mit der
  Transaktion zurückrollt, scheitert jeder weitere Versuch genauso — der Betrieb kann
  keine Rechnung mehr ausstellen. Es braucht dafür ein Bürokonto und einen Aufruf an der
  Oberfläche vorbei. Das berührt die Zeile „G11 Rechnungsnummer nur mit Beleg — hält“ in
  Abschnitt 6 des Papiers: sie hält für die Oberfläche, nicht für einen direkten Aufruf.
  Gehört zur selben Härtung wie G-16 (das Papier nennt dort „ein direkter Aufruf“ als
  Anlass).
- **N-2 Eine Rechnung nimmt die Kundenkennung eines fremden Betriebs an** — auf beiden
  Wegen (`rechnung_ausstellen` und `rechnung_ersetzen`, `v4.sql`). Der Fremdschlüssel
  `invoices_customer_id_fkey` prüft den Betrieb nicht, `app.rechnung_empfaenger_pruefen`
  findet den Kunden dann nicht und prüft nur die Anschrift. Lesbar wird der fremde Kunde
  dadurch nicht; die Kennung muss man kennen. Folge wäre ein Verweis über die
  Betriebsgrenze (etwa beim Löschen des Kunden im anderen Betrieb). Für das Papier
  „Grundlagen und Sicherheit“; passt zu V-1 im Papier Auftragskette.
- **N-3 Meldungstext:** im neuen Jahr sagt die Abweisung einer Wunschnummer „die nächste
  ist 0001“, gezogen wird 1001 (`g10_g12.sql`).
- **N-4 Menge und Preis werden beim Speichern gerundet, der Betrag der Zeile nicht**
  (Abschnitt 3, G-16 Punkt 2). Tippt jemand eine Menge mit mehr als drei oder einen Preis
  mit mehr als vier Nachkommastellen, geht die gespeicherte Zeile nicht mehr auf
  (0,333 × 68,00 = 22,66). Klein; die Eingabe auf die Stellen der Spalten begrenzen.
- **N-5 „Leistungsnachweis anhängen“ und der Text der Steuerbefreiung bleiben auch nach
  dem Ausstellen stehen** (zu G-2, rechte Spalte).

## 6. Nicht geprüft

- G-2 nicht in einer laufenden Ansicht nachgestellt (kein eigener Komponententest
  außerhalb des Repos möglich, kein Browser) — am Code bis in jeden Setzer der
  betroffenen Zustände verfolgt.
- G-5 und G-6: nachgestellt ist die Datenbankseite (die Funktion nimmt es an); dass die
  Ansicht vor dem Ausstellen nicht nachlädt, ist gelesen. Keine echte Gleichzeitigkeit
  mit zwei Verbindungen.
- G-3: fachliche Richtigkeit (Bemessung, Fälligkeit mit der Schlussrechnung) nicht
  beurteilt — Frage K-2.
- G-17: mit jsPDF selbst nachgestellt, nicht mit den Belegerzeugern der App (Schriften,
  Logo).
- G-7 bis G-11, G-13, G-15: nur Beleg und Schluss nachvollzogen; die vorgeschlagenen
  Bauweisen nicht gegen alle Aufrufer durchgespielt (G-11: Kundenzusammenführung,
  `kunde_umbenennen`; G-9: die drei Exporte im Einzelnen).
- Abschnitt 4 (Grenzen neu bewertet) und Abschnitt 6 (✔-Punkte) des Papiers nur dort, wo
  sie einen Befund berühren; Abschnitt 5 (Ideen) nicht bewertet.
- G-16: gemessen ist die Rundung von Zeile, Prozent-Rabatt, Steuer und Brutto; nicht jede
  Belegart ist als ganzer Beleg gegen eine Probefassung der Prüfung gelaufen („zuerst
  messen“ im Plan bleibt nötig).
