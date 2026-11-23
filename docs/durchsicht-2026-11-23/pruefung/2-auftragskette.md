# Gegenprüfung: 2-auftragskette.md (A-1 bis A-17, V-1 bis V-5) — 23.11.2026

Geprüft von einem unabhängigen Prüfer. Stand `main` fa6e740 (der Arbeitsbaum steht auf
663b684; gegenüber fa6e740 sind nur Dateien unter `docs/durchsicht-2026-11-23/`
dazugekommen, kein Code — nur lesend nachgesehen).

**Womit geprüft:**
- Code gelesen bis zum Aufrufer (Ansicht → Datenschicht → Datenbankfunktion/Auslöser).
- Wegwerf-Datenbank `pruef_a` (alle 358 Migrationen am Endstand): letzte Fassung jeder
  Funktion mit `\sf` gelesen, Auslöser und Regeln aus `pg_trigger`/`pg_policy`.
- Nachgestellt mit eigenen Skripten (je in einer Transaktion mit `rollback`), unter
  `/tmp/claude-0/-workspace-Prototype-App-Installateure/d2c6c62f-de1f-5d7d-8a7e-91e7b4244a5a/scratchpad/audit/pruef-a/`:
  `00_basis.sql` (Betrieb, vier Konten, zwei Kunden), `a1.sql`, `a1_regie.sql`, `a3.sql`,
  `a14.sql`, `a14b.sql`, `a2_a6.sql`, `v2_v4.sql`. Aufrufe als Geschäftsführung über
  `set local role authenticated` + Token-Ansprüche, die Kundenseite des Links als
  `service_role` (wie die Edge Function).
- Kein Browser, keine Testläufe des Repos (für dieses Papier nicht nötig).

## 1. Ergebnis in Zahlen

| Urteil | Anzahl | Befunde |
|---|---|---|
| bestätigt (nachgestellt) | 2 | A-3, A-6 |
| bestätigt (am Code) | 13 | A-2 (Datenbankseite zusätzlich nachgestellt), A-4, A-5, A-7, A-8, A-9, A-10, A-11, A-12, A-13, A-15, A-16, A-17 |
| teilweise | 2 | A-1 (Umfang und Schwere zu hoch), A-14 (Schwere zu niedrig, Titel halb falsch) |
| widerlegt | 0 | — |
| nicht prüfbar | 0 | — |

Verdachtsfälle: V-2 und V-3 bestätigt, V-4 entkräftet, V-1 und V-5 stehen gelassen.

Kein Befund ist erfunden. Zwei sind falsch gewichtet — einer nach oben (A-1), einer nach
unten (A-14) —, und bei sechs Vorschlägen fehlt etwas, das beim Bau eine bestehende
Funktion treffen würde (A-1, A-2, A-3, A-4, A-12, A-13; Abschnitt 2, rechte Spalte).

## 2. Je Befund

| Kürzel | Urteil | Eigener Beleg | Zum Vorschlag: Risiko „verschlimmbessern“, fehlendes „bleibt gleich“, Widerspruch |
|---|---|---|---|
| A-1 | **teilweise** (nachgestellt) | Zwei Regeln stimmen: `\sf app.baustelle_abschluss_zaehlen` zählt nur über `invoice_coverage` bzw. `is_billed`; `\sf app.scheine_verrechnet_kern` kennt zusätzlich „Pauschale verrechnet“ und „Tag schon abgerechnet“. **Aber der Hauptweg meldet nichts Falsches:** `a1.sql` — Pauschalbaustelle, 2 Scheine + 8,5 h, dann Schlussrechnung über `rechnung_anlegen` mit den Belegen (so wie die App sie schickt: `InvoicesView.tsx:1865–1867` „ihre Schlussrechnung verknüpft alle offenen Belege“, `pauschale.ts:166–172`, `InvoicesView.tsx:2471–2476`; festgehalten in `tests/unit/pauschale.test.ts:33`) → Lage `unverrechnete_scheine: 0, unverrechnete_minuten: 0`. Erst ein Schein und 8,5 h **nach** der Schlussrechnung → Zähler `1` / `510`, Kern meldet den Schein als verrechnet, `scheine_unverrechnet_baustellen` und `unverrechnete_stunden` zeigen die Baustelle nicht. Zusätzlich gefunden: dieselbe Abweichung auf **Regie** über Regel 3 (`a1_regie.sql`: Zähler 1, Kern „verrechnet“, Liste leer). | (1) Die vorgesehene Prüfung „Pauschalbaustelle mit Schlussrechnung: 0 Scheine, 0 Minuten (ohne Migration rot)“ ist **ohne Migration grün**, wenn die Rechnung ihre Belege verknüpft — die Gegenprobe trägt nur mit Schein/Stunden *nach* der Rechnung (oder Rechnung ohne Abdeckung). (2) „bleibt gleich: Regiebaustelle zählt wie bisher“ stimmt nach dem Umbau nicht für Scheine unter Regel 3 (Altrechnungen vor dem 12.11.) — dort ändert sich die Zahl gewollt; der Fall braucht einen eigenen Namen. (3) Fehlt in „bleibt gleich“: `null` für die Projektleitung fremder Baustellen bei *allen vier* Schlüsseln, Material nur für `ist_buch_oder_spitze`. (4) A-6/P-12 (Paket 18) ersetzen dieselbe Funktion noch einmal — die zweite Migration muss auf dem Stand von Paket 1 aufsetzen. |
| A-2 | **bestätigt (am Code)**, Datenbankseite nachgestellt | `BaustellenakteView.tsx:180–199` lädt einmal und nach eigenen Handgriffen (`setVersuch` nur Z. 457, 465, 487, 786), kein Abo, kein Neuladen bei „Bearbeiten“ (Z. 728/730). `:421–454` schickt alle Felder; `projects.ts:172–182` → `kern.ts:564–583` (`update … eq id`, ohne Stand). Keine Fassungsprüfung übersehen: an `projects` hängen zehn Auslöser, keiner vergleicht einen Stand (`pg_trigger`). `a2_a6.sql`: Budget 40 h → Nachtrag über Link 52 h → `update` mit dem alten Entwurf → 40 h, Angebot bleibt „Angenommen/Nachtrag“ → Rücknahme → **28 h**. Kundenakte: `KundenakteView.tsx:249–250, 280` → `customers.ts:140–168`. | (1) **Nur geänderte Felder ist keine Fassungsprüfung:** ändern beide dasselbe Feld (Budget von Hand + Nachtrag), gewinnt weiter der Letzte, still. Das muss entweder benannt oder mit einer Standprüfung (`updated_at`) geschlossen werden — der Plan nennt es „Fassungsprüfung“, das Papier baut keine. (2) Kundenakte: der Entwurf trägt immer `name`, daher läuft heute **jedes** Speichern über `kunde_umbenennen`. Mit „nur geänderte Felder“ geht ein Speichern ohne Namensänderung über `aendern` direkt an die Tabelle — ein anderer Schreibweg (kein Abweisen unbekannter Felder, `null` leert dort, in der Funktion nicht: `coalesce(rest ->> 'address', address)`). Das gehört in „bleibt gleich“ mit eigener Prüfung, oder der Name geht immer mit. (3) Fehlt in „bleibt gleich“: `billingMode`/`dringlichkeit`/`wunschtermin` leeren weiter mit `null`; Kunde gewechselt → `customerId` und `customerName` gehen zusammen; Team-Listen ohne Rücksicht auf Reihenfolge (`gleicheMenge`). (4) Der Verweis auf `useInhaltUebernehmen.ts` ist ungenau: die Rückfrage „Inzwischen geändert — übernehmen?“ steht im `EinsatzFormular.tsx:562–571, 1326–1331`, der Haken vergleicht nur Inhalte. |
| A-3 | **bestätigt (nachgestellt)** | `a3.sql`: Angebot an Familie Berger mit `project_number` der Baustelle der Hausverwaltung über `angebot_speichern` gespeichert (kein Einwand). `angebot_annehmen_mit_ziel` → „… ein Nachtrag geht nur an eine Baustelle desselben Kunden“. `angebot_annehmen` → angehängt, Budget 40 → 52. `angebot_link_erzeugen` + `angebot_link_annehmen` → Zustand „offen“, dann „angenommen“, `nachtrag = t`, Baustellenkunde „Hausverwaltung Nord“, Budget 52. Formular: `QuotesView.tsx:1176–1183`, `:1247–1255`, `:835`, `:881`. | (1) **Der Formularteil greift zu kurz:** `BaustellenSuche.tsx:82` sucht mit Suchbegriff über den ganzen Betrieb (`searchProjects` ohne Kunde) — eine fremde Baustelle lässt sich also direkt wählen, ohne Kundenwechsel. Der Abgleich gehört an die Auswahl *und* an den Kundenwechsel. (2) Im Kern muss der Vergleich **nach** dem Zweig „schon angenommen → dieselbe Baustelle zurückgeben“ stehen, sonst scheitert der zweite Aufruf nach verlorener Antwort bei Altangeboten. (3) Ein bestehender Link wird für das Büro „gegenstandslos“ ohne Grund — der Grund sollte in der Akte stehen. (4) Fehlt in „bleibt gleich“: `tests/supabase/nachtrag.test.ts:78–96` (gleicher Kunde über alten Weg und Link) und der Journal-Eintrag „Kunde über Link“. |
| A-4 | **bestätigt (am Code)**, eine Berichtigung | `quotes.ts:248–254, 263–269` (`grenze: 20`, keine `sortiere`); Aufrufer `InvoicesView.tsx:1701, 1883`, `BaustellenakteView.tsx:297`, `AngebotView.tsx:189`. **Nicht „ohne Reihenfolge“:** `kern.ts:188–190` hängt immer `order by id` an — es sind die 20 Angebote mit der kleinsten Kennung (zufällige uuid), fachlich beliebig, aber fest. Folge wie beschrieben. | (1) Damit ist die Gegenprobe **verlässlich** baubar (angenommenes Angebot mit der größten Kennung), anders als das Papier meint. (2) **Risiko im Vorschlag:** die Akte nutzt dieselbe Liste auch für `PauschalHinweis` (`BaustellenakteView.tsx:531, 1150–1152`) und für das Hauptangebot/die Herkunft (`:326`). Lädt sie künftig „jüngste zuerst, seitenweise“, fällt gerade das älteste — das Hauptangebot — zuerst heraus. Für diese beiden Stellen braucht die Akte die vollständige Liste der angenommenen. (3) Fehlt in „bleibt gleich“: `AngebotView` mit `listFassungen`. |
| A-5 | **bestätigt (am Code)** | `angebotPdf.ts:69–75`; Aufrufer `AngebotView.tsx:374, 880`, `belegArchiv.ts:247–252` mit dem heutigen Kunden. Verschärfend: die Datenbank friert den Namen eines versendeten Angebots bewusst ein (`app.kundenname_nachziehen`: „nur Entwürfe — was beim Kunden liegt, behält seinen Namen“), das PDF nimmt trotzdem `o.kunde?.name` vor `q.customerName`. `kunden_zusammenfuehren` hängt `quotes.customer_id` um. Schnappschuss des Links hält den Kunden (`app.angebot_link_schnappschuss`). | (1) Für Altangebote ist der **Name** schon eingefroren (`q.customerName`) — „drucken wie bisher mit dem heutigen Kunden“ ist für den Namen nicht nötig; nur Anschrift und UID fehlen. Entscheiden und benennen. (2) `person_auskunft`/`person_loeschen` werden in den Migrationen per Textersatz fortgeschrieben (`20261106400000:1313, 1371`, `20261116022000:263, 273`) — eine Ergänzung muss auf dem Endstand aufsetzen (Wächter Z-15 aus Paket 1 zuerst). (3) Der Auslöser `app.aussteller_angebot` hat drei Zweige (Dienst, Rücknahme, Versand) — der Empfängerstand muss in allen dreien dasselbe tun wie `aussteller_stand`. |
| A-6 | **bestätigt (nachgestellt)** | `a2_a6.sql`: Baustelle mit versendetem Nachtrag (offener Link) und Abnahme in fünf Tagen → Lage nennt beides nicht (kein Schlüssel dafür, alle Zähler 0), `baustelle_abschliessen` → „Abgeschlossen“; Kunde nimmt über den Link an → Baustelle „Aktiv“, Budget 52. Das Wiederöffnen selbst ist gewollt (A3, `QuotesView.tsx:1253`). | Nur Anzeige, geringes Risiko. Die Rollenregel „sonst `null`“ ist für Angebote gegenstandslos (beide Funktionen ruft nur die Führung, die Angebote liest) — schadet nicht. Reihenfolge mit A-1 beachten (dieselbe Funktion). |
| A-7 | **bestätigt (am Code)** | `QuotesView.tsx:373, 522, 681, 828, 872`; einziges Rabattfeld `:1386–1391` je Position; Summenzeile `:1463` zeigt den Gesamtrabatt nicht. Rechnung: `InvoicesView.tsx:5226–5244`. | Das Herausziehen aus `InvoicesView` trifft die dichteste Datei des Geldbereichs; Paket 11 baut „Rechnung stellen“ ohnehin um, Paket 13 das Angebotsformular. Sicherer: der Baustein entsteht neu am Angebot, die Rechnung wechselt erst mit Paket 11 darauf. Fehlt in „bleibt gleich“: Annahme-Link (der Rabatt ist Teil des Inhaltsvergleichs — ein geänderter Nachlass muss einen offenen Link wie bisher als „geändert“ melden). |
| A-8 | **bestätigt (am Code)** | `angebotPdf.ts:90, 123–126` fest im Code; keine Einstellung dazu (Suche über `src/`, `shared/`). | Risiko richtig benannt (Form des Schnappschusses). Zusätzlich: nach Änderungen an `shared/` `node scripts/edge-shared-uebernehmen.mjs`; Kundenseite und Edge Function müssen alte Schnappschüsse (`fassung: 1`) weiter lesen. |
| A-9 | **bestätigt (am Code)** | `AngebotAnnahmeSeite.tsx` ohne Rechtstext (Suche nach AGB/Rücktritt/Widerruf: nur der Widerruf des Links); Grenzen-Übersicht `:92–95` nennt nur QR, Rate-Limit, Zählung, Versand. | Der Platz für den Text hängt nicht an der Kanzlei, nur sein Inhalt — „18 (Kanzlei)“ im Plan darf den Bau nicht aufhalten. Sonst wie A-8. |
| A-10 | **bestätigt (am Code)** | Kern schreibt nur `notes` + „Aus Angebot …“ in die Beschreibung (`\sf app.angebot_annehmen_kern`); `quotes_lesen`/`quote_lines_lesen` nur Führung und Buchhaltung (`pg_policy`); `MyProjectsView.tsx:211–214`. | (1) Preise können auch in der Bezeichnung einer **Position** stehen („Pauschalpreis 4.500 €“), nicht nur in Textzeilen — die Grenze ist zu benennen. (2) Eine `security definer`-Funktion, die die Leseregel von `projects` nachbaut, läuft bei der nächsten Regeländerung auseinander; sicherer: die Sichtbarkeit über die Tabelle selbst prüfen (Zeilenschutz des Aufrufers), erst dann die Positionen holen. (3) Neue lesende Funktion gehört in `LESENDE_FUNKTIONEN`, `src/lib/netzFrist.ts` und in den Support-Wächter aus Paket 1. |
| A-11 | **bestätigt (am Code)** | `LiegenschaftVorschlaege` nur in `AdminProjectsView.tsx:786`; `EingangFormular.tsx:256–266`, `QuotesView.tsx:1187–1198` setzen nur den Ort; `BaustellenakteView.tsx:953–960` nichts. | „Unverändert einsetzen“ passt im Eingang nicht ganz: dort gibt es den Zweig „Neukunde“ (freier Name) — „Übernehmen“ eines Kunden muss den Zweig umschalten. Sonst geringes Risiko. |
| A-12 | **bestätigt (am Code)** | `AngebotView.tsx:479, 510` (keine Schritte bei „Angenommen“), `:576–581`, `:666–676`; `EingangView.tsx:546–547`; `QuotesView.tsx:696–706` (`bearbeiten` öffnet nur einen Entwurf). | **Lücke im Vorschlag:** `eingangZuAngebot` meldet auch „Das Angebot … gab es schon“ (`r.neu === false`). Ist dieses Angebot kein Entwurf mehr, öffnet `?bearbeiten=` nichts und man steht in der Liste. Ins Formular nur bei neuem bzw. Entwurf, sonst wie heute auf die Akte. |
| A-13 | **bestätigt (am Code)** | `navigation.ts:170`; `quotes_schreiben`/`quote_lines_schreiben` nur `ist_fuehrung` (`pg_policy`); `eingang_zu_angebot` „übernimmt nur die Führung“; `permissions.ts:103, 207–209`; Grenzen-Übersicht `:329–332`. | **Widerspruch zum Plan:** das Papier schlägt ein Zusatzrecht **je Person** vor (wie `kundenPflegen`), entschieden ist E-A13 „als Einstellung **je Betrieb**“. Vor dem Bau klären. In beiden Fällen: `quotes_lesen` muss für die Verwaltung mitgehen (heute sieht sie Angebote nicht), `naechste_nummer('quotes')` ebenfalls; Annehmen, Rücknahme, Link bleiben bei der Führung — dafür eigene Prüfungen. |
| A-14 | **teilweise** (nachgestellt) | Kern nachgestellt (`a14.sql`): „Angenommen → Entwurf“ über `angebot_speichern` geht durch, danach Inhalt geändert, verworfen; die Baustelle bleibt „Aktiv“ mit 12 h. Direkt an der Tabelle „Angenommen → Versendet“ und „→ Abgelehnt“: je `UPDATE 1`. Baustelle eines **angenommenen** Angebots umgehängt: geht durch. **Schwere zu niedrig:** es ist aus der App erreichbar (`a14b.sql`): die Angebotsseite steht noch auf „Versendet“, der Kunde nimmt über den Link an, das Büro tippt „Als abgelehnt markieren“ oder „Zurück in den Entwurf“ (`AngebotView.tsx:721–727` → `updateQuote(id, { status })`) → Angebot „Abgelehnt“ bzw. „Entwurf“, Link „angenommen“, Baustelle aktiv mit Budget. Die Sperre „Link schon geöffnet“ greift nicht, weil sie nur `old.status = 'Versendet'` kennt. **Titel halb falsch:** das Umhängen eines *versendeten* Angebots ist gewollt (`angebot_annehmen_mit_ziel` tut genau das) und der Vorschlag lässt es zu Recht stehen. | Vorschlag löst es. Mit dem Wettlauf ist es kein „niedrig“ und gehört neben A-3 in Paket 2 (dieselben Funktionen und Prüfdateien). Fehlt in „bleibt gleich“: Papierkorb „Wiederherstellen“ (`Verworfen → Entwurf`), „Ablehnung zurücknehmen“, das Ersetzen der übrigen Fassungen durch den Kern, `angebot_annehmen_mit_ziel` setzt `project_number` weiter. Zu entscheiden: weist `angebot_speichern` das Umhängen eines angenommenen Angebots ab oder übergeht es still — „bleibt“ ohne Meldung wäre ein stiller Fehlschlag. |
| A-15 | **bestätigt (am Code)** | `gleichnamig.ts:20–22`; `customers.ts:293–301` (fünf Spalten, nach Name, Grenze 50); `kundenNachNamen` `:55–70` ohne Grenze. | Drei Aufrufer (`CustomersView.tsx:372`, `LiegenschaftView.tsx:225`, `EingangView.tsx:260`) — „bleibt gleich“ für alle drei. |
| A-16 | **bestätigt (am Code)** | `regeln.ts:968–1008`, `aufbau.ts:449` — einziges Angebotsthema „Über Link angenommen“; keine Entscheidung dagegen gefunden. | Neue lesende Funktion wie bei A-10 in die drei Listen. |
| A-17 | **bestätigt (am Code)** | `AngebotView.tsx:516` (`RowMenu` am Verlaufspunkt), `:718` (Seitenkopf); „Per Mail senden“ `:500` und `:738`. | Das zweite ⋯ ist nicht übersehen, sondern am 15.11. bewusst so gebaut (`:471–477`, U1/U4: „alles Weitere im ⋯ am selben Punkt“). Der Umbau nimmt das zurück — „höchstens zwei Schritte als Knopf“ muss bleiben. Überschneidet sich mit A-12 (Paket 14) und Paket 13 an denselben Zeilen: ein PR, nicht zwei. |

## 3. Nicht bestätigt — im Einzelnen

### A-1 — teilweise: die Regel stimmt, der Umfang nicht

**Papier:** „auf jeder Pauschal- und Einheitspreisbaustelle meldet er Scheine und Stunden
als offen“, „trifft den Hauptweg … Schlussrechnung bezahlt → Abschließen“, „bei praktisch
jeder Baustelle aus einem Angebot“; Schwere mittel bis hoch.

**Gefunden:** Die Schlussrechnung einer Pauschal- oder Einheitspreisbaustelle verknüpft
alle offenen Belege der Baustelle (Zeiteinträge werden `is_billed`, Scheine bekommen eine
Abdeckung). Danach meldet der Abschluss-Zähler 0 und 0 — nachgestellt:

```
Lage vor der Rechnung:           unverrechnete_scheine 2, unverrechnete_minuten 510
Lage nach der Schlussrechnung:   unverrechnete_scheine 0, unverrechnete_minuten 0
+ 1 Schein, 8,5 h danach:        unverrechnete_scheine 1, unverrechnete_minuten 510
Kern (scheine_verrechnet_kern):  alle drei Scheine verrechnet
Nicht verrechnet / Stunden:      Baustelle kommt nicht vor
```

Die Abweichung trifft also nur, was **nach** der Schlussrechnung unterschrieben oder
gebucht wird (Nacharbeit, spät gebuchte Stunden, ein Entwurf, der erst danach
unterschrieben wird), und auf Regiebaustellen Scheine ohne Material an einem schon
abgerechneten Tag (Altrechnungen vor dem 12.11.2026). Das ist ein echter, aber
gelegentlicher Fall. Vor der ersten Rechnung ist die Meldung des Dialogs richtig.

**Zu ändern im Papier:** Titel und Auswirkung auf „was nach der Schlussrechnung dazukommt“
einschränken; Schwere niedrig bis mittel (wie P-10); die Prüfung so bauen, dass sie ohne
Migration wirklich rot ist; „Regie zählt wie bisher“ um die Ausnahme Regel 3 ergänzen.
**Im Plan:** 1.2 („Stille Falschzahlen“: „Der Abschluss einer Pauschalbaustelle meldet
verrechnete Scheine und Stunden als offen“), Tabelle 3.2 („jede Pauschalbaustelle meldet
Offenes“, m–h) und Paket 1 Schritt 8 (Prüfung) entsprechend berichtigen. In Paket 1 kann
es bleiben (klein, eine Funktion), es ist aber kein Rückfall und keine Falschzahl.

### A-14 — teilweise: nachgestellt, aber schwerer als angegeben

**Papier:** „Schwere niedrig — die Oberfläche bietet es nicht an; erreichbar über die
Schnittstelle“; Titel nennt auch „die Baustelle eines versendeten Angebots umhängen“.

**Gefunden:** Die Oberfläche bietet es an, sobald ihr Stand veraltet ist. Nachgestellt:

```
Kunde nimmt über den Link an:                 Angenommen, Baustelle PR-2026-0001
Büro (Seite noch „Versendet“) → Abgelehnt:    durch; Angebot Abgelehnt, Baustelle Aktiv 12 h, Link angenommen
Büro (Seite noch „Versendet“) → Entwurf:      durch; Angebot Entwurf, Baustelle Aktiv 12 h
```

Damit lässt sich eine über den Link erklärte, unterschriebene Annahme ohne Grund und ohne
Eintrag „Annahme zurückgenommen“ verlassen — die Grenzen-Übersicht (`:594–597`) sagt das
Gegenteil zu. Das Umhängen eines *versendeten* Angebots ist dagegen vorgesehen; fehlerhaft
ist nur das Umhängen eines angenommenen (nachgestellt).

**Zu ändern im Papier:** Schwere mittel; Titel auf „angenommen“ beschränken; den Wettlauf
als Auswirkung aufnehmen. **Im Plan:** Kurztext („… und die Baustelle umhängen“) schärfen,
Schwere `m`, Paket 2 statt 18.

## 4. Zum Plan

**Falsche oder ungenaue Kurztexte**
- **A-1** (1.2, 3.2, Paket 1 Schritt 8): siehe oben. Die dort genannte Prüfung ist in der
  naheliegenden Bauweise ohne Migration grün.
- **A-2** (Paket 18 a): „Fassungsprüfung … (wie P1 im Einsatzformular)“ — das Papier
  schlägt keine Fassungsprüfung vor, sondern „nur geänderte Felder“ plus frisches Laden
  beim Öffnen. Beides ist nicht dasselbe; festlegen, was gebaut wird.
- **A-3** (Paket 2): „`angebot_annehmen` vergleicht den Kunden auch über den Link“ — laut
  Papier wandert der Vergleich in `app.angebot_annehmen_kern`; dazu `angebot_link_zustand`
  und `angebot_link_erzeugen`. `angebot_annehmen` allein deckt den Link nicht.
- **A-4** (3.2 und Paket 2): „ungeordnet“ — geordnet nach der Kennung. „über `rpcAlle`“
  passt nicht: `listQuotesForProject` ist keine Datenbankfunktion, `abfragen` blättert ohne
  `grenze` selbst (`kern.ts:444–475`). Das Papier schlägt zwei Abfragen vor, der Plan eine.
- **A-13** (3.2, Paket 18 h, E-A13): Papier „je Person“, Entscheidung „je Betrieb“.
- **A-14** (3.2): siehe oben.
- **3.8:** A-4 steht unter „unbenannt und nachzutragen“, wird aber in Paket 2 gebaut —
  eines von beiden.

**Pakete und Voraussetzungen**
- **Paket 10 braucht A-10:** „Leistungsumfang aus A-10“ steht in Paket 10 (Stufe C), die
  Funktion entsteht erst in Paket 18 (Stufe D). Entweder A-10 vorziehen oder den Punkt aus
  Paket 10 nehmen.
- **A-14 gehört zu A-3 in Paket 2:** dieselben Auslöser und Funktionen
  (`angebot_versand_pruefen`, `angebot_speichern`), dieselben Prüfdateien, und es ist ein
  Wettlauf mit dem Annahme-Link wie A-3.
- **A-1 und A-6/P-12** ersetzen beide `app.baustelle_abschluss_zaehlen` (Paket 1 bzw. 18).
  Die zweite Migration setzt auf der ersten auf; „bleibt gleich: dieselbe Lage wie heute“
  bei A-6 heißt dann „wie nach Paket 1“.
- **A-12, A-17 und Paket 13** ändern dieselben Zeilen der Angebotsakte
  (`AngebotView.tsx:479–516, 718–745`) in drei Paketen (13, 14). In Paket 14 steht von A-12
  nur das Weiterleiten; die Schritte an der angenommenen Akte („Zur Baustelle“, „Einsatz
  planen“, „Anzahlung stellen“) fehlen im Pakettext.
- **A-7** vor oder mit dem Umbau des Angebotsformulars (Paket 13) und der Rechnung
  (Paket 11) abstimmen, sonst wird der Baustein zweimal angefasst.
- **A-5, A-13:** `person_auskunft`/`person_loeschen` leben von Textersatz über mehrere
  Migrationen — erst nach dem Wächter Z-15 (Paket 1) anfassen. Das ist erfüllt (Paket 18),
  sollte dort aber als Voraussetzung stehen.

**Vorschläge, die eine bestehende Funktion treffen könnten**
- A-4: die Akte verliert bei „seitenweise, jüngste zuerst“ das Hauptangebot für
  `PauschalHinweis` und Herkunft.
- A-2: die Kundenakte wechselt den Schreibweg (Funktion → Tabelle), sobald der Name nicht
  mehr mitgeht.
- A-12: `?bearbeiten=` bei einem schon bestehenden, nicht mehr offenen Angebot führt ins
  Leere.
- A-17: nimmt eine am 15.11. bewusst gebaute Anordnung zurück; „Annahme-Link“, „Per Mail
  senden“, „Neue Fassung“ rücken einen Tipp weiter.
- A-3: Vergleich im Kern an der falschen Stelle würde den wiederholten Aufruf nach
  verlorener Antwort bei Altangeboten abweisen.

## 5. Geklärte Verdachtsfälle

- **V-2 — bestätigt (nachgestellt).** Nach „Annahme zurücknehmen“ ist das Angebot wieder
  „Versendet“, `app.angebot_link_zustand` und `app.angebot_link_kundensicht` melden weiter
  „angenommen“ (`v2_v4.sql`); die Seite zeigt „Vielen Dank. Sie haben das Angebot am …
  verbindlich angenommen“ (`AngebotAnnahmeSeite.tsx:412–413`), bis zu 30 Tage. Offen bleibt
  nur die Entscheidung, was dort stehen soll.
- **V-3 — bestätigt (am Code).** `BelegMailDialog.tsx:123–128`: `pdfErzeugen()` läuft beim
  Senden, vor `belegPerMail`; darin steht `updateQuote(q.id, neuesDatum)`
  (`AngebotView.tsx:877–881`). Scheitert der Versand (auch an der 6-MB-Grenze), hat der
  Entwurf das neue Datum.
- **V-4 — entkräftet (nachgestellt).** An `projects` hängt `projects_wartung_freigeben`
  als `BEFORE DELETE`; `app.wartung_baustelle_geloescht` leert `wartungen.offene_baustelle`.
  Nachgestellt: Wartung zeigt auf die Baustelle, Rücknahme löscht sie, danach ist
  `offene_baustelle` leer.
- **V-1 — stehen gelassen.** Der Code-Teil stimmt (Kunde in der Akte jederzeit änderbar,
  `BaustellenakteView.tsx:933–951`; kein Auslöser an `projects` prüft es). Die Folge für
  Rechnungen ist Gebiet Geld.
- **V-5 — nicht geprüft.**

## 6. Nicht geprüft

- Abschnitt 4 des Papiers (Grenzen neu bewertet): nur die Zeilenangaben in
  `docs/grenzen-durchsicht-2026-10-24.md` (alle stimmen) und die zwei „überholt“-Aussagen
  (F16: `BelegMailDialog` in `AngebotView.tsx:864`, Stand-Datei `:3296` — stimmen); die
  Bewertungen selbst nicht.
- Abschnitt 5 (Ideen) und Abschnitt 6 (Stichprobe der ✔-Punkte) nicht, bis auf A4
  (`neuere_fassung` in der letzten Fassung von `app.angebot_link_zustand` — stimmt).
- A-7: woher ein „geerbter“ Gesamtrabatt an einem Angebot kommt, da das Formular nie ein
  Feld hatte, soweit der heutige Code zeigt (Altdaten, Rücklauf) — nicht verfolgt.
- A-5: Zusammenführen und Umbenennen nicht in der Datenbank durchgespielt, nur gelesen.
- A-8 bis A-13, A-15 bis A-17 sind Lücken oder Anordnung — am Code geprüft, nichts
  nachzustellen. Nichts im Browser angesehen; kein Testlauf des Repos.
- Aufwandsangaben nicht nachgerechnet; auffällig ist keine.
