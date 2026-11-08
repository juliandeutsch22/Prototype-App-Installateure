# SENKLOT SHK — VERBINDLICHE BAUPLANUNG UND UMSETZUNGSPROMPT (geprüfte Fassung)
## Vollständige Integration aller 84 Katalogpunkte plus N01/N02 in die bestehende App

Stand: 2026-11-06 · Repository: `juliandeutsch22/Prototype-App-Installateure` · Geprüfter main-Stand: `b1e00cc731f4fc4301902fe74bfc7d6fb9c38954` (E50, live seit 05.11.2026, 23:54)

> **Diese Fassung ersetzt die Fassung vom 06.11.2026 („Bauplanung_Umsetzungsprompt“).** Sie wurde Zeile für Zeile gegen den Code auf `b1e00cc` gelesen. Was sich gegenüber der Vorlage geändert hat und warum, steht in **Teil 0** mit Code-Beleg. Wo diese Fassung und der Masterprompt (`Senklot_SHK_Integrationsfahrplan_Masterprompt_2026-11-05.md`) sich widersprechen, gilt diese Fassung; die Einzelspezifikationen des Masterprompts (Abschnitt 6) bleiben sonst die fachliche Grundlage.

---

## TEIL 0 — PRÜFBERICHT: WAS AM VORIGEN PLAN NICHT STIMMTE

### 0.1 Ergebnis in einem Satz

Der Plan ist im Kern tragfähig: Die Anschlussstellen stimmen, die Integrationskerne K01–K07 vermeiden Parallelwelten, die Arbeitsregeln decken sich mit `CLAUDE.md`. Für die Umsetzung muss er aber an **vier Stellen** berichtigt werden:

1. Er widerspricht an sechs Punkten den eigenen Produktentscheidungen (Z04, Z01, B04, B09, U01/U02, U05).
2. Er übersieht vorhandene Bausteine, die er neu bauen würde (Abrechnungszuordnung, Budgetwarnung, Papierkorb, Arbeitsbericht, Aufmaß, Offline-Schein).
3. Er stützt sich auf zwei falsche Annahmen über Rechte und Module.
4. Seine Abhängigkeitskette ist strenger als die tatsächlichen Abhängigkeiten.

### 0.2 Belegt richtig (unverändert übernommen)

- Alle 45 genannten Code-Pfade existieren auf `b1e00cc`.
- Es gibt 228 Migrationen; die letzte ist `20261105100000_zeitbuchung_verlauf.sql`.
- Es gibt sechs Rollen. Die Projektleitung hat laut `src/types/index.ts` „keinen Einblick in die Zeitkonten der Mitarbeiter“.
- Es gibt neun Module in `src/lib/module.ts`: `einsatzplanung`, `material`, `urlaub`, `scheine`, `angebote`, `rechnungen`, `nachkalkulation`, `wartung`, `zeitkonten`.
- `/accounting` ist die Mitarbeiterübersicht.
- Alle npm-Skripte existieren: `typecheck`, `lint`, `test`, `build`, `supabase:test`, `durchklick`, `gemeinsames`, `pruefen:links`, `pruefen:inhaltsregel`.

### 0.3 Widersprüche zu den eigenen Produktentscheidungen (berichtigt in Teil 5)

| ID | Empfehlung laut `Produktentscheidungen_84_Punkte.json` | Was die Vorlage stattdessen beschrieb | Berichtigung |
|---|---|---|---|
| Z04 | **Ersetzen:** überfälligen Timer melden, bestätigbaren Abschluss vorschlagen; *keine* automatische arbeitszeitwirksame Endbuchung | „optionales automatisches Ausstempeln … als konfigurierbare Regel“ | M06 beschreibt die Ersetzung; das Original nur als Variante „Originalumfang“ |
| Z01 | **Ändern:** bestehende Selbstbearbeitung erhalten, Antrag nur für gesperrte oder fremd zu prüfende Fälle | Antrag als allgemeiner Weg | M06 präzisiert: kein Antrag vor bisher erlaubter eigener Korrektur |
| B04 | **Ändern:** faktenbasierter Bereitschaftscheck, menschliche Freigabe nur, wo wirklich entschieden wird | „Arbeitsvorbereitung mit Freigaben“ | M07 berichtigt |
| B09 | **Ändern:** Projekt-/Aufgaben-Threads; freier DM-Messenger nicht im empfohlenen Umfang | „Chat/Direktnachrichten“ | M10 berichtigt |
| U01/U02 | **Ändern:** kuratierte Abschnitte, Favoriten; kanonische Gruppen und mobile Grundnavigation bleiben | „Menüfolge“ frei | M15 berichtigt |
| U05 | **Ändern:** Versandereignisse; Ansichtsnachweis nur für vorher benannte Objekte, keine allgemeine Nutzungsverfolgung | „Einsicht sensibler Bereiche“ ohne Eingrenzung | M01 berichtigt |

### 0.4 Vorhandene Bausteine, die der Plan neu bauen würde

| Punkt | Tatsächlich vorhanden (Beleg) | Folge für den Plan |
|---|---|---|
| Quellen-/Rechnungsvertrag, K07, R11 | `invoice_coverage` (`20260911140000_geld.sql`: Rechnung ↔ `time_entry`/`material_order`/`work_sheet`) und `time_entries.is_billed`/`invoice_number`. Scheine sind damit schon mit Rechnungen verbunden. | **Kein** neues Zuordnungsmodell daneben. Der Vertrag erweitert `invoice_coverage` um neue Quellarten sowie Menge/Betrag je Zuordnung für Teilabrechnung. R11 ist für den Handwerksschein vorhanden; neu ist nur die Verbindung weiterer Berichtsarten. |
| G05 Budgetwarnung | „Budget-Ampel“, Baustellen ab 90 % Budget auf der Startseite der Projektleitung, Filter `/projects?filter=budget`, `baustellen_stunden` (FUNKTIONEN.md, Startseite und Baustellen) | G05 erweitert die Stundenbudget-Warnung, etwa um Geld- und Materialbudget, und baut keine zweite Warnung. |
| B14 Prognose | Nachkalkulation mit Seitenfenster (E40), `NachkalkulationDetail.tsx` | B14 ist eine Erweiterung derselben Rechnung (Ist gegen Kalkulation), keine neue Ansicht. |
| R10 Aufmaß | „Einheitspreis nach Aufmaß“: Die Rechnung übernimmt Positionen und Preise des Angebots, die Mengen werden nach Aufmaß eingetragen (FUNKTIONEN.md, Angebote) | R10 ergänzt ein freigegebenes Aufmaßblatt als Mengenquelle für genau diesen Weg. |
| U06 Papierkorb | Verworfene Schein-Entwürfe lassen sich zurückholen (`WorkSheetsListView.tsx`); „Endgültig löschen“ ist ausdrücklich nicht umkehrbar (E42, `20261104100000_schein_entwurf_loeschen.sql`) | U06 verallgemeinert den vorhandenen Zustand „verworfen“ auf weitere Entwurfsarten. E42 bleibt: Endgültig gelöscht ist endgültig. |
| B11 Arbeitsbericht, B13 Abnahme | Der Handwerksschein **ist** der vorhandene Arbeitsbericht: Zeiten, Material, Fotos, zwei Unterschriften, Prüfsumme, seit E49 auch offline | B11 erzeugt Vorbelegungen *für* den Schein bzw. eine Berichtsfassung daraus, nicht einen zweiten Bericht. B13 nutzt Unterschriften- und Offline-Weg des Scheins (`schein_unterschreiben`, idempotente Zweitzustellung). Modul: das bestehende `scheine`. |
| Offline-Schein | Seit E49 (`4d10245`) offline speichern, Fotos und Unterschrift. Der Masterprompt (Abschnitt 4.4) behauptet noch das Gegenteil. | Die Offline-Matrix gilt in dieser Fassung (Teil 6, Nr. 6). Neue Offline-Wege folgen dem E49-Muster (siehe dort). |
| E12 Inventur, E16 Retoure | Inventur mit Bestätigung und Retoure mit Lagerbewegung gibt es in `LagerDialoge.tsx` und `lagerbewegungen`. | E12 ergänzt den Scan-Einstieg in die vorhandene Inventur. E16 ergänzt die Restmengen-Abrechnung zur vorhandenen Retoure. |

### 0.5 Falsche Annahmen über Rechte und Module

1. **Die Modulverwaltung gehört heute schon Geschäftsführung und Administrator**, nicht nur dem Administrator.
   - Beleg Server: `app.hat_rolle(array['Geschäftsführung','Administrator'])` im Trigger `companies_einstellungen` (`20260912090000_feinregeln.sql`).
   - Beleg App: Route `/settings/module`, laut Kommentar in `App.tsx` „die Module (Geschäftsführung)“.
   - Der Masterprompt (4.1, N02) warnt davor, „aus dem Administratorrecht ein allgemeines Geschäftsführungsrecht zu machen“. Das ist gegenstandslos: Die Konfiguration der freien Zeitfelder (N01) für Administrator und Geschäftsführung braucht **kein neues Recht**, sondern dasselbe wie die Modulverwaltung.
2. **N02 kehrt zwei dokumentierte Entscheidungen um** (`src/lib/module.ts`, Kopfkommentar):
   - Der Kern (Startseite, Zeiterfassung, Kunden, Baustellen, Benutzer, Einstellungen) ist bewusst *nicht* abschaltbar („ein Schalter, mit dem man die Anlage unbenutzbar macht, ist … eine Falle“).
   - Module sind bewusst *keine* serverseitige Schranke, weil das jeden Schreibvorgang um eine Leseoperation verteuern würde.

   N02 verlangt beides anders. Das ist zulässig, weil der Auftraggeber es ausdrücklich verlangt, gehört aber als **Entscheidung mit E-Nummer** ins Register (Teil 8), samt Kosten der Serverprüfung und der Frage in Teil 1.2.

### 0.6 Modulzuordnung: drei Fehler

- **U04 (Änderungsjournal) ist als abschaltbares Modul `nachvollziehbarkeit` geführt.** Das widerspricht N02 selbst („erforderliche Nachvollziehbarkeit bleibt verfügbar“) und dem Zeitbuchungsprotokoll E50, auf das sich § 26 AZG stützt. Deshalb:
  - **U04 ist Infrastruktur und nicht abschaltbar.**
  - Ebenso das Versandprotokoll (U05), solange ein Versandweg aktiv ist.
  - Nur die gesonderte Recherche-Ansicht darf ein Schalter sein.
- **Die bestehenden Module `urlaub` und `scheine` kommen in der Zuordnung nicht vor;** dafür erscheinen neue Hauptmodule (`dokumente`, `lieferscheine`, `navigation` …). Deshalb:
  - B10, B11 und B13 werden Unterfähigkeiten von `scheine`.
  - R01–R03 werden Unterfähigkeit von `material`, kein eigenes Hauptmodul.
  - U02 wird eine Einstellung, kein Modul.
  - Die neun Bestandsmodule behalten ihre IDs (Migration ohne Verhaltensänderung).
- **`kunden`, `baustellen` und `zeiterfassung` als Hauptmodule** setzen die Umkehr aus 0.5 voraus. Sie bleiben in der Zuordnung, aber erst nach der Entscheidung in Teil 1.2.

### 0.7 Sonstige Berichtigungen

- **A06 öffentliche Annahme:** Der Fachweg ist die SQL-Funktion `public.angebot_annehmen(p_angebot, p_praefix, p_abrechnung)`, nicht `angebotAnnehmen.ts` (Client). Sie verlangt `app.ist_fuehrung()` und **die Abrechnungsart** (Pauschal/Regie/Einheitspreis). Ein Kunde kann weder Führung sein noch die Abrechnungsart wählen. **Fachliche Lücke der Vorlage:** Die Abrechnungsart und der Nummernvorsatz müssen **mit der Freigabe der Fassung zum Versand** feststehen. Der öffentliche Weg (Edge Function) prüft das Token und ruft einen gemeinsamen SQL-Kern auf, den auch `angebot_annehmen` benutzt; Akteur ist „Kunde über Link, Fassung X“.
- **Fahrzeuge (E10, W06, W07):** Es gibt keine Fahrzeug-Entität, nur den freien Text `time_entries.vehicle_plate` und den Kennzeichen-Vorsatz je Betrieb. Die „gemeinsame Fahrzeugkennung“ entsteht neu. Backfill: aus den vorhandenen Kennzeichen *Vorschläge* „unbestätigt“, keine automatische Zuordnung. `vehicle_plate` bleibt (Altclients, Exporte).
- **Name „Anlagen“:** Die Tabelle `betriebsanlagen` gibt es schon. Sie protokolliert das *Anlegen von Betrieben* durch die Plattform. Der Anlagenstamm (K05) bekommt einen eindeutigen Namen, zum Beispiel `kundenanlagen`.
- **Ablage der Planungsartefakte:** „Planlinie“ ist schon ein Begriff der Designlinie (E30, `src/components/Planlinie.tsx`). Die M00-Artefakte liegen deshalb unter **`docs/shk-ausbau/`**, nicht `docs/planlinie/`.
- **Mailversand:** `office@senklot.at` ist im Supabase-Projekt als SMTP für **Anmeldemails** eingerichtet (Stand 11.1 Nr. 8). Für Mails aus der App (R12, E09, A06, U03) braucht es eine Edge Function mit SMTP-Zugang als **Secret der Edge Function** (`CLAUDE.md`: externe Zugangsdaten nur dort). Das trägt der Betreiber ein; es steht im Nachweisregister. Die Roadmap Stand 11.2 Nr. 1 („Rechnung und Angebot per Mail“) ist derselbe Versandadapter und wird mit M14 erledigt.
- **Vorhandene Roadmap-Grenzen gelten weiter:**
  - Z02 Durchrechnung braucht die Regeln von WKO und KV (Stand 11.2 Nr. 5, „liegt bei jemand anderem“).
  - W01 erledigt Stand 11.2 Nr. 3 (Prüf- und Wartungsprotokolle als Vorlage je Betrieb).
- **Abhängigkeitskette:** Siehe Teil 5. M12 (CAMT für Ausgangsrechnungen) braucht M11 nicht, M14 (Mahnversand) braucht M13 nicht, und M15 braucht M14 nicht.
- **M01 war zu breit:** Es bündelte Journal, Protokoll, Papierkorb, Modulregister, Schreibbefehlsvertrag, Quellenvertrag und Ereignis-Ausgangsfach ohne sichtbaren Nutzen. Das widerspricht `CLAUDE.md` Grundsatz 4 und der PR-Regel. Es ist jetzt in kleine, je für sich vollständige PRs geteilt; Schreibbefehlsvertrag und Ereignis-Ausgangsfach entstehen **mit ihrem ersten Verbraucher**.

---

## TEIL 1 — AUFTRAG UND GELTUNG

Du bist verantwortlich für Produktkonzeption, Softwarearchitektur, SHK-Fachprozesse, Bedienbarkeit und technische Umsetzung in **Senklot**. Du arbeitest am **bestehenden, produktiven System**, nicht an einem Neubau.

**Ziel:** Der bestätigte Zielumfang aus den 84 Originalpunkten (A01–A11, R01–R12, E01–E16, B01–B15, Z01–Z05, W01–W08, U01–U06, G01–G11) und die Ergänzungen **N01** (frei konfigurierbare Zeitfelder) und **N02** (durchgängig schaltbare Fachmodule) werden vollständig und integriert umgesetzt. Integriert heißt: gemeinsame Daten, gemeinsame Aktionen, keine Parallelmodule. Die Lot-Oberfläche bleibt ruhig; Fachlichkeit wird nicht der Optik geopfert.

**Verbindliche Anlagen:**
1. `Senklot_SHK_Integrationsfahrplan_Masterprompt_2026-11-05.md`: Einzelplanung je Punkt (Abschnitt 6), Kerne K01–K07 (5), Querschnittsverträge (7), Migration, Skalierung, Abnahme (9–12), N01/N02 (14). **Ausnahme:** Abschnitt 4.4 „Handwerksschein nicht offline“ ist durch E49 überholt.
2. `Produktentscheidungen_84_Punkte.json`: 17 Behalten, 36 Integrieren, 22 Optional, 8 Ändern, 1 Ersetzen.
3. `Modulzuordnung_84_Punkte_und_Ergaenzungen.json`, **mit den Berichtigungen aus Teil 0.6**.
4. `Senklot_SHK_Kritische_Produktbewertung_2026-11-05.md`: Begründungen.
5. **`CLAUDE.md` des Repositorys:** Grundsätze 1–6, Oberfläche, Ablauf je Thema, Sicherheit und Daten. Bei einem Widerspruch gilt `CLAUDE.md`.

### 1.1 Zielumfang

Vor Baubeginn entscheidet der Auftraggeber ausdrücklich zwischen **empfohlenem Zielumfang** und **vollständigem Originalumfang**. Die Entscheidung kommt ins Register (Teil 8).

- „Optional“ heißt: nach Aktivierung vollständig nutzbar, nie „irgendwann“ oder eine Attrappe.
- Bei „Ändern“ und „Ersetzen“ beschreibt Teil 5 den **empfohlenen** Inhalt. Die Originalfassung steht jeweils als „Variante Original“ daneben und gilt nur, wenn der Auftraggeber sie wählt.
- Kein Punkt verschwindet still.

### 1.2 Vor Baubeginn zusätzlich zu entscheiden (aus Teil 0)

| Nr. | Frage | Warum es eine Entscheidung ist | Vorschlag |
|---|---|---|---|
| V1 | Werden **Kunden und Baustellen** abschaltbar (N02) oder bleiben sie Datenbasis mit abschaltbaren Unterfähigkeiten? | Nach `module.ts` ist der Kern bewusst nicht abschaltbar. Rechnungen, Planung, Zeit, Scheine und Wartung beziehen sich auf Baustellen. | Kunden/Baustellen bleiben Kern; abschaltbar werden ihre Zusatzfähigkeiten (Board, Aufgaben, Mängel, Objekte, Meilensteine …). |
| V2 | Wird die **Zeiterfassung** abschaltbar (N02)? | Ausdrücklich verlangt. Betroffen sind Mitarbeiterübersicht, Monatsbilanzen, Lohn-Export, Regie-Abrechnung aus Stunden und das Zeitprotokoll E50. | Ja, mit Folgenvorschau. Historie, Exporte und das Protokoll bleiben lesbar; Regie aus Stunden fällt weg, Regie aus Schein bleibt. |
| V3 | Prüft der **Server** die Modulaktivierung für neue Fachbefehle (N02)? | Das kehrt die dokumentierte Entscheidung in `module.ts` um und kostet eine Leseoperation je Befehl. | Ja, aber nur für **neue** Fachbefehle über eine `stable`-Hilfsfunktion (`app.modul_aktiv(...)`, einmal je Abfrage wie `app.lesebetrieb()`). Bestehende Schreibwege bleiben, wie sie sind. |
| V4 | Wann stehen bei der **Online-Annahme (A06)** Abrechnungsart und Nummernvorsatz fest? | `angebot_annehmen` verlangt beides; ein Kunde wählt sie nicht. | Bei der Freigabe der Fassung zum Versand. Ohne Festlegung kein Link. |

**Keine KI, OCR, Agenten oder Sprachmodelle** in den Fachabläufen, sondern nachvollziehbare Regeln und strukturierte Daten. Keine neuen Überwachungsfunktionen, kein verpflichtendes GPS. Keine automatisch ausgestellten Rechnungen, versendeten Bestellungen oder endgültigen Zahlungszuordnungen ohne ausdrückliche Fachaktion.

**Beginn erst auf ausdrückliche Ansage** (`CLAUDE.md` Grundsatz 5). Die Freigabe dieses Plans ist noch kein Startsignal.

---

## TEIL 2 — VERIFIZIERTER CODEBESTAND UND ANSCHLUSSSTELLEN

### 2.1 Technologie (unverändert beibehalten)

- React 18, TypeScript **strict**, Vite, Tailwind, Lot-Designlinie (`src/styles/lot.css`, `src/components/LotBausteine.tsx`, Muster auf `/_muster`), React Query, React Router, jsPDF.
- **Supabase:** Postgres, RLS, Auth, Storage, SQL-Funktionen/Trigger, Edge Functions. **Firebase** nur für Hosting und FCM; keine zweite Datenbank.
- Datenbankzugriff ausschließlich in `src/lib/db/` bzw. `src/lib/db/pg/`, **nie in Seitenkomponenten**.
- Geteilte Logik in `shared/`. Nach Änderungen dort immer `npm run gemeinsames` (`scripts/edge-shared-uebernehmen.mjs`).
- Das Produktivschema ändert sich nur durch **neue, additive Migrationen**. Historische Migrationen werden nie geändert. Kennungen und `company_id` (teils `text`) bleiben, wie sie sind.

### 2.2 Verbindliche Anschlussstellen (am Code `b1e00cc` verifiziert)

| Bereich | Bestand / Anker | Konsequenz für den Ausbau |
|---|---|---|
| Monteur-Start | `features/dashboard/DashboardView.tsx`, `dashboard/start/HeuteEigene.tsx`, „Wie zuletzt buchen“, Rüstliste | B01 erweitert diesen Einstieg; keine zweite Startseite, kein zweiter Buchungsweg |
| Planung | `features/assignments/`, `lib/db/pg/assignments.ts`, `termine` | DnD und Vorschläge sind neue Bedienwege **derselben** Planungsbefehle |
| Materialbereitschaft | `lib/db/pg/einsatzMaterial.ts`, `assignments/ruestFehlmenge.ts`, Rüstlisten-Migrationen (Laden bucht Abgang) | E13 erweitert die gemeinsame Mengenberechnung; kein zweiter Reservierungszähler |
| Kataloge/DATANORM | `lib/db/pg/datanorm.ts`, `features/materials/datanorm.ts`, `datanorm_laeufe`, `datanorm_zeilen`, `rabattsaetze`, `material_einkaufspreise` | Versionierung, Identität und Vergleich ausbauen; den Import nicht neu bauen |
| Einkauf | `lib/db/pg/einkauf.ts`, `einkauf_posten`, `orders/Einkaufsliste.tsx`, `orders/bestellungPdf.ts` | Bestellkopf und -positionen, Teilmengen und Wareneingangsbezüge ergänzen |
| Lager | `lib/db/pg/materials.ts`, `lagerbewegungen`, `orders/LagerDialoge.tsx` (Inventur, Wareneingang, Retoure, Übersteuerung) | Standortmodell additiv; historische Bewegungen nicht umdeuten |
| Kunden/Baustellen | `features/customers/`, `projects/`, `lib/db/pg/projects.ts`, Akten mit Sprungleiste, `baustelle_alte_nummern` | Aufgaben, Anlagen und Mängel in dieselben Akten einbetten |
| Angebote | `features/quotes/fassungen.ts`, `angebotAnnehmen.ts` → RPC **`angebot_annehmen(p_angebot, p_praefix, p_abrechnung)`** (nur Führung), `lib/db/pg/quotes.ts` | Die öffentliche Annahme nutzt denselben SQL-Kern (Teil 0.7) |
| Abrechnung | `features/invoices/assemble.ts`, `ausgegebenesMaterial.ts`, `lib/db/pg/invoices.ts`, SQL-Rechnungsfunktionen, **`invoice_coverage`**, `time_entries.is_billed`/`invoice_number` | Alle Abrechnungsarten bleiben: Regie, Pauschal, Einheitspreis nach Aufmaß, Anzahlung/Teil/Schluss, Storno, Rücklass, Skonto. Keine zweite Geldberechnung, keine zweite Zuordnungstabelle |
| Zahlungen | `lib/db/pg/zahlungen.ts`, `zahlungseingaenge`, `offenePosten.ts`, `konten.ts`, `buchungskonten`, `basiszins.ts`, `mahnungen` | CAMT legt über diese Logik an; keine zweite Saldenberechnung |
| Wartung | `lib/db/pg/wartungen.ts`, `wartung_ausfuehrungen`, `features/maintenance/`, `invoices/wartungPosition.ts` | Anlagen und Checklisten anbinden; Ausführung ≠ Vertrag |
| Zeit | `lib/db/pg/timeEntries.ts`, `arbeitszeitGrenzen.ts`, `arbeitszeit_begruendungen`, `monatsbilanzen.ts`, `abwesenheiten.ts`, **`zeitbuchung_verlauf` (E50)** | N01, Z01–Z04 bauen darauf auf. Der Verlauf schreibt nur per Trigger, der Dienstschlüssel schreibt nichts (E50); das bleibt so |
| Offline | `lib/sync/`, `lib/db/pg/ohneEmpfang.ts`, Ausgangsfach in IndexedDB; seit E49 auch Handwerksschein mit Fotos und Unterschrift; Freigabeliste `AUFRUFE_OHNE_EMPFANG`/`EIMER_OHNE_EMPFANG` in `supabaseSender.ts`; `lib/sync/netzfehler.ts` | Neue Offline-Wege folgen dem E49-Muster (Teil 6, Nr. 6) |
| Rechte/Module | `lib/permissions.ts` (sechs Rollen, Zusatzrechte `einkaufSehen`, `katalogEinspielen`, `kundenPflegen`, `rechnungenLesen`, `fuehrtZeitkonto`), `lib/module.ts` (neun Module), Modulverwaltung für **Geschäftsführung und Administrator** (Trigger `companies_einstellungen`) | N02 erweitert das Register; Rechte bleiben bei RLS und Rollen |
| Navigation/Shell | `app/App.tsx`, `Layout.tsx`, `NaviLot.tsx`, `guards.tsx`, `Suchfenster.tsx`, `navigation.ts` | `/accounting` bleibt die Mitarbeiterübersicht |
| Präferenzen | `lib/db/pg/prefs.ts`, `user_prefs` | U01/U02 speichern hier |
| Bestehende Verläufe | `zeitbuchung_verlauf`, `lagerbewegungen`, `wartung_ausfuehrungen`, `support_zugriffe`, `betrieb_protokoll`, `konto_umstellungen`, `arbeitszeit_begruendungen`, `urlaubsanspruch_anpassungen`, `mahnungen` (wer), `datanorm_laeufe`, `system_laeufe`, Statuszeiten der Angebote | U04 führt sie zusammen, ohne sie zu kopieren |

### 2.3 Delta gegenüber der Vorplanung (`62db192` → `b1e00cc`)

- **E48** (`659f7fd`): Plattform in der Lot-Linie, Reiter der Akten → das UI-Muster der Akten vor M02/M07 erneut prüfen.
- **E49** (`4d10245`): Handwerksschein offline (speichern, Fotos als Bytes, Unterschrift, idempotente Zweitzustellung) und Safari-Netzfehler (`netzfehler.ts`: ohne Antwort ist nichts angekommen) → B02, B11, B13 und die Offline-Matrix schließen hier an.
- **E50** (`b1e00cc`): Änderungsprotokoll der Zeitbuchungen → das U04-Journal **liest** diesen Verlauf und baut kein zweites Zeitprotokoll. Bei E50 gelernt, gilt jetzt für jede neue Tabelle:
  - keine `generated always`-Zählnummer als Schlüssel, weil der Rücklauf sie ablehnt; UUID verwenden;
  - der Dienstschlüssel protokolliert nicht (Rücklauf, Betriebslöschung);
  - Riegel `support_niemals` bzw. `support_schreibt_nicht`.

### 2.4 Warnungen aus der Bestandsprüfung (verbindlich)

- Kommentare können älter sein als die Implementierung. Beispiel: Ein Typkommentar sagt, die Rüstliste bewege keinen Bestand; das Einladen bucht aber per SQL einen Abgang. Vor jeder Änderung den **tatsächlich wirksamen** Stand aller Migrationen lesen.
- Alte Stamm-Migrationen mit breiten Leserechten beweisen keinen heutigen Datenabfluss. Immer das zusammengesetzte aktuelle Schema prüfen.
- Bewusste Ausnahmewege bleiben richtig: Lagerübersteuerung, korrigierbare Zahlungseingänge, Rechnung ohne Handwerksschein.
- Belegnummern und Projektpräfixe sind historisch uneinheitlich. Die Referenzauflösung (`baustelle_alte_nummern`) wiederverwenden; keine Altbelege umschreiben.

---

## TEIL 3 — VERBINDLICHE ARBEITSREGELN (Abnahmekriterien)

1. **Genau und fehlerbewusst.** Vor jeder Änderung den tatsächlichen Ablauf, die wirksamen Serverregeln, Daten und Tests prüfen. Vermutung, dokumentierte Aussage und reproduzierbaren Fehler trennen.
2. **Bestand zuerst:** vorhandene Fähigkeit nutzen → gezielt ergänzen → notwendigen Teil umbauen → nur mit belegter Notwendigkeit neu entwickeln.
3. **Keine grundlegenden Umbauten ohne Notwendigkeitsnachweis.** Zu belegen sind: Hindernis, betroffene Fälle, warum eine Erweiterung nicht reicht, Risiken, Migrationsweg, erhaltende Gegenproben.
4. **Nichts verschlimmbessern.** Alle bestehenden Aktionen, Felder, Rechte, Filter, Suchen, Belegarten, Korrekturwege, Exporte, Deep Links, mobile Bedienung und Offline-Vormerkungen bleiben erhalten.
5. **Vollständige Abläufe:** erfassen → prüfen → speichern → freigeben → durchführen → wiederholen → korrigieren → berechtigen → nachvollziehen → exportieren und aufbewahren. Ein Feature-Flag ersetzt keine fertige Funktion.
6. **Grenzen nur mit Beleg** (`CLAUDE.md` Grundsatz 6): Kennung, Funktion, genaue Grenze, Grund (fachlich, rechtlich, Datenschutz, Sicherheit, Altdaten oder liegt bei jemand anderem), Beleg, Nutzerwirkung, normaler Arbeitsweg. Eintrag in `docs/grenzen-durchsicht-2026-10-24.md`.
7. **Kein stiller Funktionsverzicht.**
8. **Gegenproben:** Eine neue Prüfung ist ohne die Änderung rot und mit ihr grün; was gleich bleiben muss, prüft ein eigener Test. Den eigenen Diff gegenlesen auf Nebenwirkungen, Doppelschreiben, geänderte Zahlen, fremde Mandanten und entfallene Wege.
9. **Fertig erst nach vollständiger Abnahme** inklusive Rollen, Mobil/Desktop, Migration und Offline. Fehlende externe Nachweise konkret ausweisen.
10. **Neu: vor jedem Push, der CI auslöst, lokal alles grün,** was die CI prüft:
    - `typecheck`, `lint`, `npm test`;
    - `supabase:test` auf einer Datenbank mit genau den Migrationen des Stands;
    - **alle** Browserprojekte, das Telefonprojekt lokal in Chromium in Handybreite;
    - `pruefen:links`, `pruefen:inhaltsregel`.

    WebKit läuft lokal nicht. Was WebKit-spezifisch ist (IndexedDB mit Blob, Fehlertexte von `fetch`, Offline-Nachbildung), wird im Code durchgegangen und, wo es geht, in Chromium nachgestellt (Erfahrung E49).

**Pflichtnachweis je Änderung (Tabelle im PR):**
- Original-ID bzw. bestehender Ablauf;
- tatsächlicher Änderungsbedarf;
- wiederverwendete Funktion oder Datenquelle (Code- bzw. SQL-Pfad);
- gezielte Ergänzung oder begründeter Umbau;
- Erhaltungs- und Integrationstest mit Ergebnis;
- verbleibende Grenze mit Beleg.

**Ablauf je Thema** (`CLAUDE.md`):
- Ein Thema, ein PR nach `main`, nacheinander auf dem vorgegebenen Arbeitsbranch; keine konkurrierenden Branches auf denselben SQL-Funktionen oder Typen.
- Je PR: Entscheidung mit E-Nummer (`docs/ui-umbau/entscheidungen.md`), Abschnitt in `docs/stand-2026-10-03.md`, Zeile in `docs/FUNKTIONEN.md`, Handbuch-Abschnitt und Stempel (Zahl der Prüfungen), bei Grenzen `grenzen-durchsicht`.
- Merge nur bei grüner CI, danach Live-Prüfung (`/fassung.txt`).

**PR-Größe:** Pro PR ein prüfbarer vollständiger Fachweg oder ein intern abgeschlossener Unterbau **mit erstem Verbraucher**. Kein Unterbau ohne Nutzer, keine Sammel-PRs.

---

## TEIL 4 — GEMEINSAMES FACHMODELL UND INTEGRATIONSVERTRÄGE

### 4.1 Objektzusammenhang (Zustände nicht zusammenwerfen)

```
Kunde / Auftraggeber / Rechnungsempfänger
  └─ Standort (ggf. Liegenschaft/Top)
      ├─ Anlage (kundenanlagen) → Wartungsvereinbarung → fällige Ausführung → Prüfbericht
      └─ Baustelle/Auftrag
          ├─ Angebotsfassung → Annahme (intern oder über Link)
          ├─ Aufgaben / Meilensteine / Mängel
          ├─ Einsätze → Mitarbeiter + Materialbedarf
          ├─ Rüstliste → Reservierung → Ausgabe/Umlagerung
          ├─ Zeitbuchungen / Handwerksschein / Verbrauch
          ├─ Einkaufsbedarf → Bestellung → Wareneingang → Lieferantenbeleg
          └─ abrechenbare Quellen (invoice_coverage) → Rechnung → Zahlung/Storno/Korrektur
```

Zulässig bleibt: Auftrag ohne Angebot, Service ohne Wartungsvertrag, mehrere Verträge je Anlage, mehrere Leistungen je Rechnung, ein Bankumsatz für mehrere Rechnungen. Kein neuer Pflichtdatensatz nur für ein lineares Flussdiagramm.

### 4.2 Datenverträge

- Stabile Kennungen (**UUID**, keine `generated always`-Zählnummer, Teil 2.3), getrennt von sichtbaren Nummern. Jede Zeile trägt den Betrieb; Fremdschlüssel mandantenkonsistent (`company_id` + Eltern-ID), wo möglich.
- Metadaten: fachliches Datum, Serverzeit, Akteur oder Dienst, Revision, Herkunft. Gerätezeit ist nie alleinige Autorität.
- Ausgestellte Dokumente referenzieren **unveränderliche Snapshots**. „Unbekannt“ ist ein zulässiger Migrationszustand.
- **Pflichten jeder neuen Tabelle** (`CLAUDE.md` plus die geltenden Prüfungen):
  - Lese-Regel mit `company_id = (select app.lesebetrieb())` (Support dazu `or company_id = (select app.supportbetrieb())`), Rollen und `auth.uid()` als `(select …)`;
  - Riegel `support_niemals` oder `support_schreibt_nicht` (`schema.test.ts`);
  - Eintrag in die Rollenliste von `mandantenTrennung.test.ts`;
  - bei Personenbezug `person_auskunft`, `auszug_ausgenommen` und `person_loeschen` (Aufbewahrung mit Rechtsgrund);
  - Datenauszug und Rücklauf (`ruecklauf.test.ts`);
  - nur benötigte Tabellen in die Realtime-Veröffentlichung;
  - neue Funktionen `security definer`, `set search_path = ''`, `revoke … from public, anon`, nur nötiger `grant`.
- Weitere Integritätsregeln (Masterprompt 2.3):
  - Eine Menge deckt nicht zwei Bedarfe.
  - Eine Umlagerung ist mengenneutral und atomar.
  - Bestellt, zugesagt und physisch vorhanden sind getrennte Mengen.
  - Der Originalbeleg bleibt erhalten.
  - Ein Euro je Umsatz wird höchstens einmal verteilt.
  - Ein Bericht bindet genau eine Vorlagenfassung.
  - Eine Quelle wird nie doppelt verbraucht.

### 4.3 Kritischer Schreibbefehls-Vertrag

Kein Command-Bus, keine pauschale Neuerstellung von RPCs. Der Vertrag entsteht **mit dem ersten kritischen neuen Befehl**, voraussichtlich der Lagerumlagerung (M04) bzw. der Bankzuordnung (M12). Er wird dort vollständig gebaut und danach wiederverwendet.

- **Bestandteile jedes Befehls:** Zielkennung, erwartete Revision, typisierte Aktion, Vorgangskennung des Aufrufers, geprüfte Einheiten, Grund bei Korrektur. Keine vom Browser bestimmten Rollen oder fremden Betriebe.
- **Serverablauf:**
  1. Sitzung und Mandant prüfen.
  2. Sperren.
  3. Erwarteten Stand prüfen.
  4. Validieren.
  5. Atomar schreiben.
  6. Journal und gegebenenfalls Ereignis in **derselben Transaktion** anlegen.
  7. Bestätigtes Ergebnis zurückgeben.
- **Wiederholungen:** Vorgangskennung und Payload-Hash sind mandantenbezogen eindeutig. Eine Wiederholung mit gleichen Daten liefert das bestehende Ergebnis; gleiche Kennung mit anderem Inhalt ist ein Konflikt.
- **Unklarer Ausgang:** den Status abfragen, nicht blind neu senden. Offline-Vormerkung nur für Befehle auf der Freigabeliste (Teil 6, Nr. 6).
- **SQL und Storage:** Sie sind nicht transaktional verbunden. Deshalb gibt es sichtbare Zwischenzustände mit Nachholung.

### 4.4 Ereignisse, Zahlen, Zeit

- **Ereignis-Ausgangsfach:** Ein dauerhaftes Ausgangsfach in Postgres entsteht erst mit dem ersten asynchronen Verbraucher, etwa Mahnversand (M14) oder Fristerinnerung (M09/M12). Vorhandene Muster wiederverwenden: `system_laeufe`, `cron.schedule`-Jobs (`push-wache`, `ausleitung-wache`), FCM-Versand. Konsumenten arbeiten idempotent.
- **Zahlen und Zeit:**
  - Geldbeträge, Mengen und Rundung nach der bestehenden Rechnungsmathematik.
  - Zeitzone Europe/Vienna.
  - Einheiten, Packungen und Währungen prüft der Server.

### 4.5 Integrationskerne K01–K07

Spezifikation und Abnahme stehen im Masterprompt, Abschnitt 5. Ergänzungen dieser Fassung:

- **K01 „Mein Tag“:** Erweiterung von `HeuteEigene`; kein Tagesbuch mit Kopien.
- **K02 Materialbereitschaft:** Mengensemantik wie im Masterprompt. **Darstellung nach Lot:** Die fünf Zustände (offen, läuft, erledigt, Achtung, Fehler) mit Text, keine Ampelfarben als Bedeutung. „Bestand unbekannt“ ist eine eigene Textzeile.
- **K03 Lieferantenvergleich:** nur bei verifizierter Artikelidentität.
- **K04 Katalogversionen:** Staging → Probelauf → atomare Aktivierung. Große Läufe in Blöcken, fortsetzbar, über `datanorm_laeufe`.
- **K05 Anlagen-Checklisten:** Anlagenstamm `kundenanlagen` additiv aus den Geräteangaben der Wartungen.
- **K06 Änderungsjournal:** **Lesen** über eine autorisierte Funktion bzw. Sicht, die die bestehenden Verläufe (Teil 2.2, letzte Zeile) vereinigt, ohne sie umzukopieren. **Schreiben** nur für neue Befehle im neuen Journal. Nur serverseitig; der Dienstschlüssel und der Rücklauf schreiben keine Einträge (wie bei E50). **Nicht abschaltbar.**
- **K07 „Zur Abrechnung“:** Eine Arbeitsliste über alle zulässigen Quellen auf **`invoice_coverage`** (erweitert um neue Arten und Menge/Betrag). Keine Reduktion auf „unterschriebener Schein erforderlich“.

---

## TEIL 5 — PAKETPLAN M00–M16

### 5.1 Tatsächliche Abhängigkeiten (berichtigt)

```
M00 ─┬─ M01a Modulregister (N02, Verhalten unverändert) ─┬─ M15 Persönliche Einstiege
     │                                                    └─ (jede neue Fähigkeit trägt sich ein)
     ├─ M01b Journal lesen/schreiben (U04) ─ M01c Protokoll Versand/Ansicht (U05, mit M14)
     ├─ M01d Papierkorb (U06)
     ├─ M01e Quellenvertrag auf invoice_coverage ─────────── M13
     ├─ M02 Auftragseingang, Objekte, Online-Annahme ─┬─ M07 ─┬─ M08
     ├─ M03 Kataloge, Preise ─ M04 Lager, Deckung ─┬─ M05 ─ M11 Eingangsbelege
     │                                             └─ M07  └─ M09 ─ M10
     ├─ M06 Zeit + N01 ─────────────────────────────── M07, M10
     ├─ M12 Bank/CAMT (nur Ausgangsrechnungen; Eingangsbelege-Zuordnung erst nach M11)
     └─ M14 Versandadapter + Mahnversand (R12) ── U03 Wochenbericht nach M01b
M13 Abrechnung braucht M01e und die jeweiligen Quellen (M05, M08, M09, M10)
M16 Gesamtabnahme nach allen beauftragten Paketen
```

Gegenüber der Vorlage entfällt die künstliche Kette M13 → M14 → M15:
- **M12** braucht für den Import und die Zuordnung zu **Ausgangsrechnungen** nur die vorhandene Zahlungslogik.
- **M14** braucht für den Mahnversand nur den Versandadapter, `mahnungen` und das Protokoll aus M01c.
- **M15** braucht nur das Modulregister und die Rechte.

Damit können wertvolle, unabhängige Wege früh kommen. Die Reihenfolge innerhalb dieser Freiheit legt der Auftraggeber fest; der Plan priorisiert nicht. Parallele Arbeit nur nacheinander auf dem Arbeitsbranch.

### M00 — Bestand, Verträge, Nachweise (vor jedem Codepaket)

Artefakte unter **`docs/shk-ausbau/`**:

1. **Bestandsmatrix:** je Original-ID → tatsächlicher Bestand (Code- und SQL-Pfad) → Ergänzung → Rollen → Paket. Teil 0.4 ist der Anfang; vollständig für alle 84 IDs.
2. **Aktionsinventar** der betroffenen Ansichten: Felder, Knöpfe, Filter, Reiter, Exporte, Deep Links, Sonderfälle.
3. **Datenverträge** je Paket mit den Pflichten aus 4.2.
4. **Abnahmematrix** je ID: positive, negative und erhaltende Gegenproben.
5. **UI-Muster:** je neuem Muster ein echter Screen mobil und am Schreibtisch auf `/_muster`, nach `docs/ui-umbau/seiten-leitfaden.md`. Betrifft Board, Wochenplan mit DnD, Prüfcheckliste, Vergleichstabelle und Threads.
6. **Nachweisregister:** Teil 8.

### M01 — Gemeinsame Grundlagen, in fünf PRs

- **M01a — Modulregister (N02-Vertrag), ohne Verhaltensänderung.**
  - Register mit stabiler ID, Hauptmodul, Unterfähigkeiten, echten Abhängigkeiten, Voreinstellung, Revision und Deaktivierungsfolgen.
  - Die neun Bestandsmodule werden mit unveränderten IDs und Voreinstellungen übernommen.
  - Kern-Schalter (Zeiterfassung, gegebenenfalls Kunden/Baustellen) erst nach V1/V2; serverseitige Prüfung neuer Befehle nach V3.
  - Abnahme: Nach der Migration ist jede Navigation und Route wie vorher (Erhaltungstest über alle Rollen); die Modulliste ist serverseitig weiter nur für Geschäftsführung und Administrator schreibbar.
- **M01b — U04 Änderungsjournal (K06).**
  - Lesen: autorisierte Recherche, die die bestehenden Verläufe vereinigt (E50 unverändert sichtbar).
  - Schreiben: Journaltabelle für neue Befehle, nur per Server.
  - Ansicht „Verlauf“ am Objekt, paginiert; keine globale Kachel.
  - Datenschutz: keine Krankheitsgründe; Auskunft, Löschung und Aufbewahrung je Ereignisklasse.
  - Abnahme: Direkter API-Aufruf kann nicht schreiben (Negativtest); Fremdmandant; Dienstschlüssel ohne Eintrag; das E50-Protokoll erscheint unverändert.
- **M01c — U05 (empfohlen „Ändern“).** Versandereignisse und vorher **benannte** nachweisbedürftige Ansichten (Liste im Entscheidungsregister), keine allgemeine Nutzungsverfolgung. Wird mit dem ersten Versand (M14) produktiv; vorher kein Unterbau ohne Nutzer.
- **M01d — U06 Papierkorb.** Verallgemeinert den vorhandenen Zustand „verworfen“ (Handwerksschein) auf weitere Entwurfsarten. Nie für ausgestellte Belege oder Buchungen mit Belegbezug. Frist, Wiederherstellen, endgültiges Leeren mit Recht. E42 („endgültig“ ist endgültig) bleibt.
- **M01e — Quellen- und Rechnungsvertrag.**
  - `invoice_coverage` um neue Quellarten (Aufmaßposition, Wartungsausführung, Restmaterial …) und Menge bzw. Betrag je Zuordnung erweitern.
  - Entwurfsreservierung mit Eigentümer.
  - `is_billed` bleibt als abgeleitete Kompatibilität.
  - Erhaltungstests: alle bestehenden Rechnungsarten über `assemble.ts` und die SQL-Funktionen, Zahlen unverändert.

### M02 — Auftragseingang, Objekte, Online-Annahme · A03, A09, A11, A06

- **A03/A11 Auftragseingang ohne Angebot:** strukturierte Erfassung in der bestehenden Kunden- bzw. Baustellenakte; Aufgaben und Meilensteine nur als Option; kein Angebotszwang.
- **A09 Liegenschaften, Tops, Beteiligte:** Objektmodell unter Kunde und Standort; die Beziehungen Eigentümer, Betreiber, Auftraggeber, Rechnungsempfänger und Lieferadresse getrennt. Baustellen ohne Objekt bleiben gültig.
- **A06 Öffentliche Annahme:**
  - Eine freigegebene **Fassung** mit festgelegter Abrechnungsart und festgelegtem Nummernvorsatz (V4).
  - Tokenhash, Gültigkeit, Widerruf, Rate-Limit.
  - Edge Function (anon) prüft das Token und ruft den **gemeinsamen SQL-Kern** von `angebot_annehmen` (Akteur „Kunde über Link“).
  - Einmalige, idempotente Verarbeitung; Unterschrift; kein Direktlink auf veränderliche Daten.
  - Versand des Links über M14, bis dahin als kopierbarer Link.
- **Abnahme:**
  - Annahme nach Widerruf, nach Ablauf und beim zweiten Aufruf korrekt abgelehnt.
  - Fassung ohne Abrechnungsart ergibt keinen Link.
  - Die intern angenommene und die per Link angenommene Fassung ergeben dieselbe Baustelle.
  - Auftrag ohne Angebot vollständig bis zur Abrechnungsquelle.

### M03 — Kataloge, Preise, Kalkulation · E01, E04, E05, E06, E07, E02, E03, A07, A08, G06 (K03/K04)

- **DATANORM-Bestand erweitern:**
  - parallele Lieferantenkataloge (E01);
  - Versionen mit Prüfbericht und atomarem Aktivierungszeiger (E05);
  - Verfalls- und Preisstandwarnungen (E06);
  - Einkaufspreisverlauf (E04), auf `material_einkaufspreise`;
  - Verkaufs- und Aufschlagsregeln mit Version (E07).
- **Vergleich:** verifizierte Artikelidentität und Lieferantenvergleich (E02); „günstigster vergleichbarer Preis“ nur bei vollständiger Vergleichsbasis (E03).
- **A07/A08 und G06:** Positionsvergleich alt gegen neu; beibehalten, gezielt übernehmen oder neu berechnen; das ergibt eine **neue Fassung** (`quotes.vorgaenger_id`). Versendete und angenommene Fassungen bleiben unantastbar (`angebot_speichern` weist sie schon heute ab).
- **Rechte:** Einkaufspreise nur mit `darfEinkaufSehen` und den serverseitigen Gegenstücken.
- **Abnahme:**
  - Fehlimport, Abbruch, doppelte Datei, konkurrierende Aktivierung, Wiederanlauf, Rückkehr zum vorigen Stand.
  - Kein halb aktiver Katalog in Suche oder Kalkulation.
  - Großkatalog ohne stilles Limit.

### M04 — Lagerorte, Scanner, Deckung · E10, E11, E12, E13, E14, E16, G03 (K02)

- **E10 Lagerorte und Fahrzeuglager:**
  - Standortdimension additiv auf Bestand und `lagerbewegungen`; Quelle und Ziel; atomare, mengenneutrale Umlagerung (**erster Verbraucher des Schreibbefehls-Vertrags**, 4.3).
  - **Fahrzeug als neue Entität** (Teil 0.7) mit gemeinsamer Kennung für M09; Backfill aus `vehicle_plate` nur als Vorschlag.
  - Das Feld `stock` bleibt die Projektion des Hauptlagers (Masterprompt 7.2).
  - Eröffnungsbestände weiterer Orte nur durch eine bestätigte Zählung.
- **E11/E12 Scanner:** Kommissionierung und Scan-Einstieg in die **vorhandene** Inventur; Kamera, Handscanner und Tastatur; ein unbekannter Code erzeugt keine Buchung. Offline nur als Entwurf (Teil 6, Nr. 6).
- **Deckung und Restmaterial:**
  - E13 nach K02 (Lot-Zustände, „Bestand unbekannt“);
  - E14 und G03 als Bestellvorschläge auf derselben Deckungsrechnung, ohne Automatikbestellung;
  - E16 erweitert die vorhandene Retoure um die Abrechnung von Restmengen (Quelle für M01e/M13).
- **Abnahme:**
  - Zwei Baustellen konkurrieren um dieselbe Menge; Eigenreservierung ohne Doppelzählung.
  - Teilabholung, Retoure, Storno; unbekannter Liefertermin.
  - Umlagerung im Fehlerfall ohne Teilmenge; Inventurdifferenz mit Freigabe.

### M05 — Lieferantenanfragen, Kundenlieferungen · E08, E09, R01, R02, R03

- **Einkaufsbelegmodell** auf `einkauf_posten` vervollständigen: Bestellkopf und -positionen mit Bedarfszuordnung, Teillieferung, tatsächlichen Wareneingängen und Retouren. Das ist die Voraussetzung für R07/E15.
- **E08/E09:** strukturierte Anfragen und Angebotsfassungen. Versand bis M14 über den dokumentierten Mailprogrammweg (wie heute bei der Einkaufsliste), danach über den Versandadapter.
- **R01–R03 Kundenlieferschein** (Unterfähigkeit von `material`):
  - Belegnummer, Snapshot, PDF;
  - Teillieferung und Restmengen je Position;
  - Bewegung und Storno mit Lagerbuchung und Journal;
  - ein Lieferschein ist weder Rechnung noch Zahlung.
- **Abnahme:** Teillieferung zweimal plus Rest; Storno nach Abrechnungsvormerkung; bestellt, zugesagt und eingegangen in allen Mengen getrennt.

### M06 — Zeit vollständig + N01 · Z01, Z02, Z03, B02, Z04, N01

- **B02 Start/Stopp:**
  - Eine laufende Erfassungssitzung ist neu. Heute ist eine Zeitbuchung ein abgeschlossener Satz mit Von und Bis.
  - Die Sitzung wird beim Beenden zu einer normalen `time_entries`-Buchung über die bestehenden Prüfungen (Arbeitszeitgrenzen, KJBG, Überschneidung, Monatsbilanz); keine zweite Stundenberechnung.
  - Über Einsätze hinweg ohne Entwurfsverlust, mit Pausen, Gerätewechsel und offline (E49-Muster).
  - Anwesenheit ≠ Auftragszeit (Masterprompt 7.1).
- **Z01 (empfohlen „Ändern“):**
  - Die bestehende Selbstbearbeitung bleibt (`canEditTime`, `canExtendTimeEntry`).
  - Ein Antrag nur für gesperrte (verrechnet, abgeschlossener Monat) oder fremd zu prüfende Fälle: Antrag → Prüfung → Entscheidung → korrigierte Buchung, sichtbar im E50-Verlauf.
  - Rechnungssperren bleiben.
- **Z02/Z03 Zeitmodelle und Zulagen:**
  - versionierte Regeldienste auf `timeEntries`, `monatsbilanzen` und `arbeitszeitGrenzen`;
  - Z02 braucht die Regeln von WKO und KV (Nachweisregister); bis dahin Normalarbeitszeit wie heute;
  - kein frei programmierbarer Lohneditor.
- **Z04 (empfohlen „Ersetzen“):**
  - Ein überfälliger Timer wird gemeldet (Push über den bestehenden FCM-Weg).
  - Ein bestätigbarer Abschlussvorschlag; bewusst weiterlaufen lassen ist möglich.
  - **Keine automatische arbeitszeitwirksame Endbuchung.**
  - *Variante Original:* automatisches Ausstempeln als konfigurierbare, protokollierte Regel; nur bei ausdrücklicher Wahl des Originalumfangs.
- **N01 freie Zeitfelder:**
  - Fachlich: Masterprompt Abschnitt 14.
  - Konfiguration durch Geschäftsführung und Administrator, also dieselben Rollen wie die Modulverwaltung (Teil 0.5).
  - Werte typsicher je Feld-ID in einer Wertetabelle zur Buchung; kein dynamisches Spalten-Schema.
  - Server und Client validieren dieselbe veröffentlichte Regel.
  - Neue Felder gehen ins E50-Protokoll; dessen Ausschlussliste bleibt.
  - Feldwerte gehen in `person_auskunft`.
  - Offline-Altentwürfe behalten ihre Originalversion und bekommen die Kennzeichnung „Nachpflege“.
- **Abnahme N01:** wie im Masterprompt 14 (alle Feldtypen, Pflicht nur für das Büro, Umbenennen, Typwechsel, Offline-Altversion, zwei Konfiguratoren …). Alle bisherigen Zeit-, Saldo-, Pausen-, Zulagen- und Abwesenheitstests bleiben grün.

### M07 — Qualifikationen, Aufgaben, Planung · Z05, B05, B06, B07, B08, B04, G10, A01, A02, A04

- **Z05 Qualifikationen:**
  - Nachweisart, Geltung, verifiziert von und am, Gültigkeit, Nachweisdatei (eigener privater Bucket).
  - Personenbezug: Auskunft und Löschung.
  - Die Planung sieht nur Eignung und Gültigkeit.
- **Akte und Planung:**
  - B05 Aufgaben in der Baustellenakte.
  - **B04 (empfohlen „Ändern“):** faktenbasierter Bereitschaftscheck aus Personen, Material (K02) und Terminen; eine menschliche Freigabe nur für tatsächlich offene Entscheidungen.
  - B06 Drag-and-drop als zusätzlicher Bedienweg derselben `assignments`-Befehle (Revision, Konflikte); am Handy gleichwertig über Formular.
  - B07/G10 Ersatzvorschläge und Konflikte regelbasiert.
  - B08 Hinweise beim Einteilen.
- **A01/A02 (empfohlen „Ändern“):**
  - Liste als ruhiger Standard, Board optional.
  - **Getrennte Zustandsachsen:** operative Phase, Rechnung, Zahlung, Gewährleistung.
  - Verschieben ändert nur die operative Phase.
  - Board in der Lot-Linie: Spalten als Blätter, Einträge als Zeilen, keine Karte in einer Karte, keine Pillen.
- **A04 Meilensteine:** Meilensteine und Zahlungsplan mit Bezug zu Anzahlung und Teilrechnung.
- **Abnahme:**
  - DnD-Konflikt zweier Planer.
  - Ersatzvorschlag ohne erfundene Qualifikation.
  - Das Board ändert weder Rechnungs- noch Zahlungsstand.
  - Meilenstein → Zahlungsplan → Teilrechnung konsistent.

### M08 — Besichtigung, ÖNORM-LV, Aufmaß · B03, A05, R10

- **B03 Besichtigung:** strukturiert, mit Fotos und Dokumenten (Dokumentablage der Baustelle, „nur fürs Büro“), offline nach dem E49-Muster.
- **A05 ÖNORM A 2063:** nur mit **verifizierter Normfassung** (Nachweisregister); keine erfundene Normlogik.
- **R10 Aufmaß:** freigegebenes Aufmaßblatt mit Version als Mengenquelle für die **vorhandene** Einheitspreisabrechnung nach Aufmaß; Übernahme über M01e; Mehr- und Mindermengen nachvollziehbar (G04).
- **Abnahme:** LV-Import mit realer Testdatei; Korrektur nur über einen neuen freigegebenen Stand; doppelte Übernahme ausgeschlossen.

### M09 — Anlagen, Prüfung, Betriebsmittel · W01–W08, G11 (K05)

- **Anlagen und Prüfung:**
  - Anlagenstamm `kundenanlagen` additiv aus den Geräteangaben der Wartungen.
  - W01 versionierte Prüfchecklisten; erledigt Stand 11.2 Nr. 3.
  - W02 Abweichungen mit Soll und Ist (keine erfundenen Grenzwerte).
  - W03 Prüfbericht-PDF aus Ausführung, Fassung und Snapshot.
  - W04 Abrechnungsvormerkung über die vorhandene `wartungPosition` und M01e.
  - W05 Online-Unterschrift über **denselben** Annahmevertrag wie A06.
- **Betriebsmittel:**
  - W06/W07/W08 auf **derselben Fahrzeug- bzw. Geräteentität** wie E10.
  - Die Kilometer aus W07 sind keine Standortüberwachung; kein GPS.
- **G11 nächste Wartung:** aus Intervall und **fachlich bestätigter** Ausführung.
- **Abnahme:**
  - Ein Fassungswechsel lässt alte Berichte unverändert.
  - Abweichung ohne erfundenen Sollwert.
  - Fristenerinnerung ohne Doppelversand.
  - Fahrzeuglager und Fuhrpark sind dieselbe Entität.

### M10 — Monteur-Arbeitstag, Kommunikation, Abnahme · B01, B09, B10, B11, B12, B13, B15 (K01)

- **B01 „Mein Tag“** nach K01.
- **B09 (empfohlen „Ändern“):**
  - Projekt- und Aufgaben-Threads mit Erwähnung und Push (FCM), mandanten- und objektbezogen.
  - Anhänge in einem eigenen Bucket mit Regeln.
  - Personenbezug: Auskunft und Löschung.
  - *Variante Original:* zusätzlich freie Direktnachrichten.
- **Berichte (Modul `scheine`):**
  - B10 Bautagesbericht und B11 Arbeitsbericht als **Aggregation in den bzw. aus dem Handwerksschein** (Teil 0.4); kein zweiter Bericht mit Datenkopie.
  - B13 Abnahme mit Signaturen über den Unterschriftenweg des Scheins inklusive Offline und idempotenter Zweitzustellung.
- **B12 Mängel** in der Akte mit Zuständen, Fristen und Verantwortung.
- **B15 SharePoint** über einen konfigurierten Adapter (Nachweisregister): Original und Referenz, kein stilles Verschieben von Dateien.
- **Abnahme:**
  - kompletter Serviceeinsatz mit Zeit, Material, Fotos und unterschriebenem Schein;
  - Einsatzwechsel ohne Entwurfsverlust;
  - Offline;
  - entzogene Rechte und abgeschaltete Module;
  - Mangel bis zur Abnahme.

### M11 — Eingangsfakturen, Dreiwege-Abgleich · R06, R07, R08, R09, E15, G09

- **R06 Eingangsrechnungen:** Originaldatei unverändert (privater Bucket), dazu validierter strukturierter Import (ebInterface/XRechnung nach Nachweisregister, kein OCR) mit Positionen und Freigabe. Import ≠ Buchung ≠ Zahlungsfreigabe.
- **R09 Kontierung:** Vorschläge auf dem vorhandenen Kontenrahmen (`buchungskonten`, BMD-Export) nach Kanzleiprofil; nie automatisch gebucht.
- **R08/G09 Dubletten:** über Lieferant, Nummer, Betrag und Datum, mit Klärungsweg.
- **R07/E15:** ein gemeinsamer Dienst und ein gemeinsamer Schalter auf dem Belegmodell aus M05.
- **Abnahme:**
  - Dublette mit abweichendem Schreibbild;
  - Teillieferung mit Teilrechnung;
  - Preisabweichung innerhalb und außerhalb der Toleranz;
  - der Originalbeleg bleibt;
  - kein Zahlungslauf ohne Freigabe.

### M12 — Bank/CAMT, Fristen · R04, R05, G08, G07

- **R04 CAMT-Import** (camt.053, Testdatei aus dem Nachweisregister): idempotent je Bankkonto und Referenz; XML ohne DTD und externe Entitäten.
- **R05/G08 Zuordnung:**
  - Vorschläge (Referenz, Betrag, offene Posten) mit ausdrücklicher Bestätigung.
  - Aufteilung auf mehrere Rechnungen; Summe ≤ Umsatz (Server-Constraint).
  - Anlage **nur** über `zahlungen.ts`/`zahlungseingaenge` inklusive Rest und Skonto.
  - Zuordnung zu Eingangsbelegen erst nach M11.
- **G07 Erinnerungen:** Skonto- und Fälligkeitserinnerungen aus dem serverseitigen Zahlungsstand, ohne Dubletten.
- **Abnahme:**
  - Ein Euro wird höchstens einmal verteilt.
  - Storno bzw. Korrektur aktualisiert Rest und Skonto.
  - Wiederholter Import erzeugt keine Duplikate.
  - Fristen über Zeitzone und Feiertage.

### M13 — Abrechnung, Sammelrechnung, Prognose · G01, G02, G04, G05, A10, B14, R11 (K07)

- **G01/G02 über K07:**
  - **alle** Abrechnungsarten und Quellen auf `invoice_coverage` (M01e);
  - Entwurfsreservierung gegen Doppelverbrauch;
  - eine ausgestellte Zuordnung ist unveränderlich, Korrektur über Storno.
- **Bereits vorhanden, hier erweitert:**
  - R11 für weitere Berichtsarten; für Scheine ist es vorhanden.
  - G05 erweitert die vorhandene Budget-Ampel.
  - B14 erweitert die Nachkalkulation; fehlende Preise stehen als „unbekannt“ da, nicht als 0.
- **Neu:**
  - G04 Mehrmengenhinweis (Aufmaß, LV, Angebot);
  - A10 Sammelabrechnung mehrerer zulässiger Quellen eines Rechnungsempfängers.
- **Abnahme:**
  - Konkurrenztest: Eine Quelle landet nie in zwei Rechnungen.
  - Sammelrechnung mit Storno einer Einzelquelle.
  - Jede bestehende Rechnungsart läuft unverändert.

### M14 — Versand, Wochenbericht · R12, U03

- **Versandadapter:**
  - Edge Function mit SMTP über `office@senklot.at`; die Zugangsdaten als **Secret der Edge Function**, eingetragen vom Betreiber (Nachweisregister).
  - Entwurf → Freigabe → Versand → Zustell- bzw. Fehlerstatus → Protokoll (M01c).
  - Doppelversand-Schutz; nach einem Rücklauf werden keine Mails erneut ausgelöst (Masterprompt 9.3).
  - Nutzt R12, A06 (Link), E09 und Stand 11.2 Nr. 1 (Rechnung und Angebot per Mail).
- **R12:** Mahnstufen und Fristen aus dem Zahlungsstand (`mahnungen`); kein Versand ohne ausdrückliche Aktion.
- **U03:** faktenbasiert aus Journal und Projektdaten, ohne Textgenerierung.
- **Abnahme:**
  - Providerfehler ohne falschen „versendet“-Status.
  - Doppelversand-Schutz.
  - Der Bericht enthält nur mandantenrichtige Fakten.
  - **Keine Testmails an echte Empfänger** (Testadapter).

### M15 — Persönliche Einstiege · U01, U02

- **U01 (empfohlen „Ändern“):** kuratierte Abschnitte der bestehenden Startseite wählen und ordnen, mit festen Lot-Bausteinen; keine freie Kachelfläche.
- **U02 (empfohlen „Ändern“):** Favoriten in `user_prefs`. Kanonische Gruppen, Bezeichnungen und die mobile Grundnavigation bleiben unverändert.
- Keine Rechteänderung durch Personalisierung; der Standard bleibt die heutige Startseite.
- **Abnahme:** Ein Favorit auf ein abgeschaltetes Modul oder ein entzogenes Recht verschwindet sauber; Zurücksetzen auf den Standard.

### M16 — Gesamtabnahme und kontrollierte Freigabe

- **Nachweise:**
  - End-to-End-Szenarien (Teil 7);
  - Migrationsprobe auf einer **Kopie** der Produktivdaten (in der Produktion wird nichts umgeschrieben, `CLAUDE.md`);
  - Geräte- und Offline-Matrix;
  - RLS-Nachweis;
  - Messplan;
  - Dokumentation;
  - Rücknahmeverfahren.
- **Abschlussbericht:** alle 84 IDs plus N01/N02 als umgesetzt, integriert, vollständig optional, ausdrücklich ersetzt oder bewusst nicht beauftragt; externe Nachweise offen bzw. erbracht.

---

## TEIL 6 — QUERSCHNITT FÜR ALLE PAKETE

1. **Zeitvertrag (Masterprompt 7.1):** Anwesenheit, Auftragszeit, Pausen, Zulagen und abrechenbare Leistung sind getrennte, eindeutig bezeichnete Größen.
2. **Materialvertrag (7.2):** Verbrauch, Rückgabe, Umlagerung, Verlust bzw. Korrektur und Retoure bleiben unterscheidbar.
3. **Dokument- und Freigabekern (7.3):** Entwurf → Prüfung → Freigabe → Ausstellung → Snapshot → Korrektur; gemeinsamer Unterschriftenweg nach dem Muster des Handwerksscheins.
4. **Versand (7.4):** nur über den Adapter mit Status (M14).
5. **Listen (7.5, 10.1):** Pagination, Suche, Filter, Export; „Weitere laden“ statt still endender Listen (der Grenzwächter in den Tests bleibt).
6. **Offline-Matrix (Masterprompt 4.4, berichtigt):**
   - Der Handwerksschein **ist** seit E49 offline (speichern, Fotos, Unterschrift).
   - Neue Offline-Wege folgen diesem Muster:
     - nur idempotente Aufrufe auf der Freigabeliste (`AUFRUFE_OHNE_EMPFANG`, `EIMER_OHNE_EMPFANG`);
     - Datei-Bytes als ArrayBuffer, nicht als Blob;
     - Netzfehler über `netzfehler.ts` (ohne Antwort zählt der Stand);
     - eine Zweitzustellung muss als „angekommen“ erkennbar sein;
     - Browserweg in WebKit als Funkloch im WLAN.
   - Online zwingend bleiben: Freigaben, Zahlungen, Aktivierungen, Lagerbuchungen.
7. **Migration (9.1–9.4):**
   - additiv, mit Backfill „unbekannt“;
   - Altclients und mehrere Geräte;
   - keine Down-Migration, die Daten löscht;
   - die Einstellungen der Module ohne Verhaltensänderung.
8. **Datenschutz (4.3):** Für jeden neuen Datentyp gilt die Zeile in 4.2. Gesundheitsdaten nur für berechtigte Rollen; keine neuen Personenauswertungen ohne Zweck.
9. **Oberfläche (`CLAUDE.md`):**
   - Jede Seite beginnt mit `PageHeader` (eine Hauptaktion); eine Hilfe pro Seite.
   - Fünf Zustände mit Text.
   - Keine Pillen, keine Ampelfarben, keine Schatten oder Rundungen, keine Karte in einer Karte.
   - Breiten: Handy bis 759, Tablet 760–1199, Schreibtisch ab 1200 px.
   - Ganze Zeilen antippbar.

---

## TEIL 7 — DURCHGÄNGIGE ABNAHMESZENARIEN

Je betroffenem Paket und final in M16:

1. **Auftrag ohne Angebot:** Eingang (A03) → Planung (B06) → Zeit (B02 mit N01-Feldern) → Material (K02) → Handwerksschein (B11) → Regierechnung ohne Scheinzwang (G01/G02) → CAMT-Zahlung (R04/R05) → Rest und Skonto korrekt.
2. **Angebot bis Zahlung:** LV und Aufmaß (A05/R10) → Fassung mit Abrechnungsart → Online-Annahme (A06) → Meilensteine (A04) → Anzahlung, Teil- und Schlussrechnung → Mehrmengenhinweis (G04) → Mahnung mit Versand (R12).
3. **Einkaufskette:** Katalogversion (K04) → verifizierter Vergleich (K03) → Bestellvorschlag (E14) → Bestellung → Teillieferung (M05) → Eingangsrechnung mit Dreiwege-Abgleich (R07/E15) → Dublette (R08/G09).
4. **Wartungskette:** Anlage → Vereinbarung online signiert (W05) → fällige Ausführung (G11) → Checkliste mit Abweichung (W01/W02) → Prüfbericht (W03) → Vormerkung (W04) → Sammelabrechnung (A10).
5. **Monteur-Tag offline:** Mein Tag (B01) → Timer (B02) → Entnahme aus dem Fahrzeuglager (E10/E11) → Fotos und unterschriebener Schein offline (E49/B13) → Sync bei Konfigurationswechsel (N01-Altentwurf) → nichts verloren, nichts doppelt; zusätzlich iPhone im WLAN ohne Internet.
6. **Rechte und Mandanten:** jede neue Serveraktion mit fremdem Mandanten, entzogener Rolle, abgeschaltetem Modul (nach V3) und Supportzugang als Negativtest; die Projektleitung ohne Zeitkonten; direkte API-Aufrufe wie über die Oberfläche.
7. **Erhaltung:** die gesamte bestehende Suite (`npm test`, `supabase:test`, `durchklick` in allen Projekten, `pruefen:links`, `pruefen:inhaltsregel`), dazu Stichproben aus dem Aktionsinventar.

---

## TEIL 8 — ENTSCHEIDUNGS- UND NACHWEISREGISTER

### 8.1 Entscheidungsregister

Jede Abweichung vom Empfehlungsstand, jede Grenze und jeder begründete Umbau bekommt eine E-Nummer in `docs/ui-umbau/entscheidungen.md`. **Gleich zu Beginn einzutragen:**

- Zielumfang (1.1);
- V1–V4 (1.2);
- die Umkehr der dokumentierten Modulentscheidung in `module.ts` (0.5);
- die Liste der nachweisbedürftigen Ansichten für U05.

### 8.2 Nachweisregister

| Nachweis | Für | Status heute | Wer |
|---|---|---|---|
| SMTP-Zugang für App-Mails als Edge-Function-Secret | M14, A06, E09, U03 | Konto `office@senklot.at` vorhanden (nur Anmeldemails) | Betreiber trägt das Secret ein |
| DATANORM-Dateien realer Großhändler (mindestens zwei, eine groß) | M03 | offen | Pilotbetrieb |
| ÖNORM A 2063, gültige Fassung | A05 | offen (kostenpflichtige Norm) | Auftraggeber |
| camt.053-Testdatei der Hausbank | R04 | offen | Pilotbetrieb |
| ebInterface- bzw. XRechnung-Beispiele von Lieferanten | R06 | offen | Pilotbetrieb |
| Kanzlei- bzw. Steuerprofil (Kontierungsregeln, BMD) | R09 | offen | Steuerberatung |
| KV- und WKO-Regeln für Durchrechnung und Zulagen | Z02, Z03 | offen (Stand 11.2 Nr. 5) | Betrieb und WKO |
| Prüfvorlagen und Grenzwerte je Anlagentyp mit Quelle | W01, W02 | offen | fachlich Verantwortlicher |
| Microsoft-Tenant mit Testsite und Admin-Einwilligung | B15 | offen | Betrieb |
| FCM-Konfiguration | B09, Z04, G07 | vorhanden (`push-wache`) | — |

Fehlendes blockiert nur die davon abhängige Freigabe, nicht die unabhängige Entwicklung.

### 8.3 Messplan

Masterprompt 10.3: nachgewiesener Betriebsbereich mit Messwerten (Kataloggröße, Belegzahlen, Importdauer, Offline-Warteschlangen); keine unbewiesene Zusage „beliebig groß“.

---

## TEIL 9 — STARTANWEISUNG UND DEFINITION OF DONE

**Bei ausdrücklichem Startauftrag:**

1. Den aktuellen `main` neu lesen; die Bestandsmatrix (M00) gegen diesen Stand führen, Teil 0 als Ausgangspunkt.
2. Zielumfang und V1–V4 sind entschieden und im Register verankert.
3. Die M00-Artefakte abschließen; die UI-Muster auf `/_muster` vor ihrem ersten Einsatz.
4. Mit M01a beginnen. Pro PR ein vollständiger Fachweg mit Pflichtnachweis-Tabelle, voller lokaler Prüfung (Teil 3, Nr. 10), Gegenproben und Dokumentation.
5. Nach jedem Paket Bestandsmatrix, Abnahmematrix, Handbuch und dieses Dokument nachführen.
6. CI und Auslieferung nur im beauftragten Umfang; keine Produktivdaten verändern; keine externen Testnachrichten ungefragt versenden.

**Definition of Done (gesamt):**
- Der bestätigte Zielumfang inklusive N01/N02 funktioniert integriert und vollständig.
- Alle 84 IDs sind eingeordnet.
- End-to-End-, Rechte-, Migrations-, Offline-, Geräte- und Schnittstellenbelege liegen vor.
- Fehlende externe Nachweise sind konkret ausgewiesen.
- Kein bekannter normaler Fehlerfall bleibt ohne Arbeitsweg.
- Die Dokumentation ist aktuell.

**Endergebnis:** ein einheitlicher Daten- und Aktionszusammenhang vom Auftrag über Planung, Zeit, Material, Dokumentation, Einkauf und Prüfung bis zu Abrechnung und Zahlung; ruhige Lot-Oberfläche, keine Parallelwelten, keine verlorenen Bestandsfunktionen.

---

## ANHANG A — ABDECKUNG: 84 PUNKTE (Empfehlung · Modul N02 · Paket · Bestand)

**Bestand:** „neu“ = kein gleichwertiger Ablauf vorhanden; „erweitern“ = vorhandener Baustein (Teil 0.4 bzw. 2.2); „vorhanden (Teil)“ = Teilweg schon live.

| ID | Funktion | Empfehlung | Modul / Unterfähigkeit | Paket | Bestand |
|---|---|---|---|---|---|
| A01 | Auftragsübersicht mit Phasen | Ändern | baustellen* / auftragsphasen_board | M07 | erweitern (Baustellenliste) |
| A02 | Board verschieben | Ändern | baustellen* / auftragsphasen_board | M07 | neu |
| A03 | Eingangsauftrag ohne Angebot | Behalten | baustellen* / auftragseingang | M02 | vorhanden (Teil: Baustelle ohne Angebot) |
| A04 | Meilensteine und Zahlungsplan | Optional | baustellen* / meilensteine | M07 | erweitern (Anzahlung/Teilrechnung) |
| A05 | ÖNORM A 2063 | Optional | angebote / leistungsverzeichnis | M08 | neu (Nachweis nötig) |
| A06 | Annahme per Link | Behalten | angebote / online_annahme | M02 | erweitern (`angebot_annehmen`) |
| A07 | Zielpreiskalkulation | Optional | angebote / zielpreiskalkulation | M03 | neu |
| A08 | Entwürfe nach EK nachrechnen | Integrieren | angebote / preisaktualisierung | M03 | erweitern (Fassungen) |
| A09 | Liegenschaften, Tops, Beteiligte | Optional | kunden* / liegenschaften_objekte | M02 | neu |
| A10 | Sammelabrechnung | Optional | rechnungen / sammelabrechnung | M13 | neu |
| A11 | strukturierte Eingangsaufträge | Optional | baustellen* / auftragsimport | M02 | neu |
| R01 | Kundenlieferschein | Optional | material / kundenlieferung | M05 | neu |
| R02 | Teillieferung, Restmengen | Integrieren | material / kundenlieferung | M05 | neu |
| R03 | Lieferscheinbewegung, Storno | Integrieren | material / kundenlieferung | M05 | neu |
| R04 | CAMT-Import | Behalten | rechnungen / camt_import | M12 | neu (Nachweis nötig) |
| R05 | Zuordnungsvorschläge | Integrieren | rechnungen / zahlungszuordnung | M12 | erweitern (`zahlungseingaenge`) |
| R06 | Eingangsrechnungen | Behalten | eingangsbelege / belegverwaltung | M11 | neu |
| R07 | Dreiwege-Abgleich | Integrieren | eingangsbelege / dreiwege_abgleich | M11 | neu |
| R08 | Dublettenwarnung | Integrieren | eingangsbelege / dublettenpruefung | M11 | neu |
| R09 | Kontierungsvorschläge | Optional | eingangsbelege / kontierung | M11 | erweitern (`buchungskonten`) |
| R10 | Aufmaß in Rechnung | Optional | baustellen* / aufmass | M08 | erweitern (Einheitspreis nach Aufmaß) |
| R11 | Berichte mit Rechnungen verbinden | Integrieren | scheine / rechnungsbeilagen | M13 | vorhanden (Teil: Schein über `invoice_coverage`) |
| R12 | Mahnung direkt versenden | Behalten | rechnungen / mahnversand | M14 | erweitern (`mahnungen`) |
| E01 | parallele Großhändlerkataloge | Behalten | material / katalogversionen | M03 | erweitern (DATANORM) |
| E02 | verifizierter Preisvergleich | Behalten | material / lieferantenvergleich | M03 | neu |
| E03 | günstigsten Preis kennzeichnen | Integrieren | material / lieferantenvergleich | M03 | neu |
| E04 | EK-Verlauf, Warnungen | Integrieren | material / katalogpreisverlauf | M03 | erweitern (`material_einkaufspreise`) |
| E05 | Katalogversion aktivieren | Integrieren | material / katalogversionen | M03 | erweitern (`datanorm_laeufe`) |
| E06 | veraltete Katalogstände | Integrieren | material / katalogversionen | M03 | neu |
| E07 | Verkaufs- und Aufschlagsregeln | Behalten | angebote / preisregeln | M03 | erweitern (Aufschlag, Rabattsätze) |
| E08 | Lieferantenangebote gegenüberstellen | Optional | material / lieferantenanfragen | M05 | neu |
| E09 | Preisanfrage an mehrere | Integrieren | material / lieferantenanfragen | M05 | neu (Versand M14) |
| E10 | Lagerorte, Fahrzeuglager | Behalten | material / lagerorte_fahrzeuglager | M04 | neu (Fahrzeug-Entität neu) |
| E11 | Scan-Kommissionierung | Optional | material / kommissionierung_scan | M04 | neu |
| E12 | Scan-Inventur | Integrieren | material / inventur_scan | M04 | erweitern (Inventur) |
| E13 | Materialampel | Behalten | material / materialbereitschaft | M04 | erweitern (Rüstliste, Fehlmenge) |
| E14 | Bestellvorschläge | Integrieren | material / bestellvorschlaege | M04 | erweitern (Mindestmenge) |
| E15 | Lieferantenrechnungsabgleich | Integrieren | eingangsbelege / dreiwege_abgleich | M11 | neu (= R07) |
| E16 | Restmaterial zurück oder abrechnen | Integrieren | material / restmaterial_retoure | M04 | erweitern (Retoure) |
| B01 | „Mein Tag“ | Integrieren | arbeitsuebersicht / mein_tag | M10 | erweitern (`HeuteEigene`) |
| B02 | Start/Stopp | Behalten | zeiterfassung* / timer | M06 | neu (Sitzung) |
| B03 | digitale Besichtigung | Optional | angebote / besichtigung | M08 | neu |
| B04 | Arbeitsvorbereitung | Ändern | baustellen* / bereitschaftscheck | M07 | neu |
| B05 | Aufgaben | Behalten | baustellen* / aufgaben | M07 | neu |
| B06 | Drag-and-drop-Planung | Behalten | einsatzplanung / drag_and_drop | M07 | erweitern (Wochenplan) |
| B07 | Ersatzkräfte vorschlagen | Integrieren | einsatzplanung / ersatzvorschlaege | M07 | neu |
| B08 | Qualifikations- und Materialhinweise | Integrieren | einsatzplanung / hinweise | M07 | neu |
| B09 | projektbezogene Kommunikation | Ändern | kommunikation / projektthreads | M10 | neu |
| B10 | Bautagesbericht | Integrieren | scheine / bautagesbericht | M10 | erweitern (Schein) |
| B11 | Arbeitsbericht aus Daten | Integrieren | scheine / arbeitsbericht | M10 | vorhanden (Teil: Handwerksschein) |
| B12 | Mängelverfolgung | Behalten | baustellen* / maengel | M10 | neu |
| B13 | Abnahme mit Signaturen | Optional | scheine / abnahme | M10 | erweitern (Unterschrift, offline) |
| B14 | DB-Prognose | Optional | nachkalkulation / prognose | M13 | erweitern (Nachkalkulation) |
| B15 | SharePoint | Optional | baustellen* / sharepoint (Dokumentablage `project_documents`) | M10 | neu (Nachweis nötig) |
| Z01 | Korrekturantrag | Ändern | zeiterfassung* / korrekturantraege | M06 | erweitern (E50-Verlauf) |
| Z02 | Durchrechnung | Optional | zeitkonten / zusaetzliche_zeitmodelle | M06 | erweitern (Überstundenmodell; Nachweis KV) |
| Z03 | Schlechtwetter, Fahrzonen, Zulagen | Optional | zeiterfassung* / zusaetzliche_merkmale | M06 | neu (Nachweis KV) |
| Z04 | Timer-Erinnerung statt Auto-Stopp | Ersetzen | zeiterfassung* / timer_erinnerung | M06 | neu |
| Z05 | Qualifikationen | Behalten | benutzer / qualifikationen | M07 | neu |
| W01 | Prüfchecklisten | Integrieren | wartung / pruefchecklisten | M09 | neu (Stand 11.2 Nr. 3) |
| W02 | Abweichungen | Integrieren | wartung / pruefwert_hinweise | M09 | neu |
| W03 | Prüfbericht-PDF | Integrieren | wartung / pruefberichte | M09 | neu |
| W04 | Wartungsabrechnung vormerken | Integrieren | wartung / abrechnung | M09 | erweitern (`wartungPosition`) |
| W05 | Vereinbarung online unterschreiben | Optional | wartung / vertragsannahme | M09 | neu (A06-Vertrag) |
| W06 | Fuhrpark und Fristen | Optional | betriebsmittel / fahrzeugfristen | M09 | neu (Entität aus E10) |
| W07 | Fahrtenbuch | Optional | betriebsmittel / fahrtenbuch | M09 | neu |
| W08 | Maschinen und Geräte | Optional | betriebsmittel / geraete | M09 | neu |
| U01 | Startseite anpassen | Ändern | Einstellung (Präferenz) | M15 | erweitern (Startseite) |
| U02 | Favoriten | Ändern | Einstellung (Präferenz) | M15 | neu |
| U03 | Wochenbericht | Optional | arbeitsuebersicht / wochenbericht | M14 | neu |
| U04 | Änderungsprotokoll | Behalten | **Infrastruktur, nicht abschaltbar** | M01b | vorhanden (Teil: E50 u. a.) |
| U05 | Versand- und Ansichtsnachweis | Ändern | **Infrastruktur bei aktivem Versand** | M01c | neu |
| U06 | Papierkorb | Behalten | datenverwaltung / entwurfspapierkorb | M01d | vorhanden (Teil: verworfene Scheine) |
| G01 | offene Regie und Scheine finden | Integrieren | rechnungen / abrechnungsvorbereitung | M13 | vorhanden (Teil: „nicht verrechnet“, „Stunden ohne Buchung“) |
| G02 | Rechnungsvorschau | Integrieren | rechnungen / abrechnungsvorbereitung | M13 | erweitern (`assemble.ts`) |
| G03 | Fehlbestandsvorschlag | Integrieren | material / bestellvorschlaege | M04 | erweitern (Fehlmenge) |
| G04 | Mehrmengenhinweis | Integrieren | rechnungen / mehrmengenhinweis | M13 | neu |
| G05 | Budgetwarnung | Integrieren | nachkalkulation / budgetwarnung | M13 | vorhanden (Teil: Budget-Ampel 90 %) |
| G06 | Preisänderungsregel | Integrieren | material / katalogpreisverlauf | M03 | neu |
| G07 | Skonto- und Fälligkeitserinnerung | Integrieren | rechnungen / belegfristen | M12 | erweitern (Mahnlauf, Startseite) |
| G08 | Bankzuordnung | Integrieren | rechnungen / zahlungszuordnung | M12 | erweitern (`zahlungen.ts`) |
| G09 | Rechnungsduplikatregel | Integrieren | eingangsbelege / dublettenpruefung | M11 | neu |
| G10 | Konflikte und Ersatzkräfte | Integrieren | einsatzplanung / ersatzvorschlaege | M07 | erweitern (Planung, Abwesenheiten) |
| G11 | nächste Wartung | Integrieren | wartung / faelligkeitsregel | M09 | erweitern (Intervall, Historie) |

`*` = Hauptmodul nach Entscheidung V1/V2. Bis dahin ist es Kern, und nur die Unterfähigkeit ist schaltbar. Bankabgleich (R04/R05/G08) und Fristen (G07) sind Unterfähigkeiten des bestehenden Moduls `rechnungen`, kein neues Hauptmodul `bankabgleich`/`finanzuebersicht`. Diese Zuordnung ist ein Vorschlag; endgültig wird sie im M01a-Register.

**N01** → M06 (`zeiterfassung*` / `freie_zeitfelder`, Konfiguration durch Geschäftsführung und Administrator) · **N02** → Register in M01a, Durchsetzung in allen Paketen · **M16** → Gesamtabnahme aller IDs.
