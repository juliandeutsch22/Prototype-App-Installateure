# Gegenprüfung: `analyse/5-material.md` (M-1 bis M-16) — 23.11.2026

Geprüft von einem unabhängigen Prüfer. Stand `main` fa6e740 (das Repo steht auf 663b684;
der Unterschied zu fa6e740 sind nur die Dateien der Durchsicht).

**Womit geprüft:** jede Belegstelle im Code geöffnet; die Datenbankfunktionen in ihrer
letzten Fassung aus der Wegwerf-Datenbank gelesen (`\sf`, Datenbank `pruef_m`, alle 358
Migrationen); elf Abläufe dort als Betriebskonto bzw. Plattformkonto nachgestellt
(Skripte unter `…/scratchpad/audit/pruef-m/`: `m1.sql`, `m1b.sql`, `m2.sql`, `m3.sql`,
`m3b.sql`, `m4.sql`, `m4b.sql`, `m8.sql`, `m10_11.sql`, `m13_14.sql`, `m14.sql`); eine
Testdatei ausgeführt (`tests/components/WorkSheetsListView.test.tsx`, Auswahl
„markierten Schein“ und „Verbrauch am Schein“: 6 grün). Kein Supabase-Stack, kein
PostgREST, kein Browser — was nur dort zu sehen wäre, steht in Abschnitt 6.

## 1. Ergebnis in Zahlen

| Urteil | Anzahl | Befunde |
|---|---|---|
| bestätigt (nachgestellt) | 7 | M-1, M-3, M-4, M-10, M-11, M-13, M-14 |
| bestätigt (am Code) | 8 | M-2, M-5, M-7, M-8, M-9, M-12, M-15, M-16 |
| teilweise | 1 | M-6 |
| widerlegt | 0 | — |
| nicht prüfbar | 0 | — |

Kein Befund ist erfunden. **Aber fünf Vorschläge würden, so gebaut wie im Papier oder
im Plan beschrieben, etwas Bestehendes verschlechtern** (M-1 in der Fassung des Plans,
M-3, M-4, M-6, M-8) — Einzelheiten in Abschnitt 2, Spalte 4, und in Abschnitt 4.

## 2. Je Befund

| Kürzel | Urteil | Eigener Beleg | Zum Vorschlag: Risiko „verschlimmbessern“, fehlendes „bleibt gleich“, Widerspruch |
|---|---|---|---|
| M-1 | bestätigt (nachgestellt) | `m1.sql`: Plattformkonto mit Freigabe „ansehen“ (`app.supportbetrieb()` = `probe`, `app.darf('probe')` = wahr, über die Tabellen sichtbar: 2 Artikel, 1 Anforderung). `lager_liste` → `ERROR: Kein Zugriff auf das Lager dieses Betriebs`; `anforderungen_laufend` → `ERROR: Kein Zugriff auf die Anforderungen dieses Betriebs`; `lager_frei` → 0 Zeilen; `lager_knapp` → 0 Zeilen. Derselbe Aufruf als Administrator: 2 Artikel, 1 knapp. Ursache wie im Papier: `betrieb text := app.betrieb()` in beiden Funktionen. Kleinigkeit: in `lager_liste` steht `app.darf(betrieb)`, nicht `app.support_liest` (das steht nur in `anforderungen_laufend:50`). | **Der Vorschlag des Papiers stimmt, die Fassung im Plan (Paket 1, Schritt 5) nicht.** Der Plan nennt `lager_liste`, aber weder `lager_frei` noch `lager_knapp`. Nachgestellt (`m1b.sql`): nur `lager_liste` und `anforderungen_laufend` umgestellt → der Support bekommt **keinen Fehler mehr, sondern ein leeres Lager** (`im_lager: 0, treffer: 0`, 0 Zeilen), weil `lager_liste` mit `join public.lager_frei(…)` verbindet und `lager_frei` für den Support leer bleibt. Das ist schlechter als heute (der Kopf der Funktion sagt selbst: „ein Fehler statt einer leeren Liste, die wie ein leeres Lager aussähe“). Mit allen vier Funktionen: Support sieht dieselben Zahlen wie der Administrator (`im_lager 2, knapp 1, reserviert 4`), fremder Betrieb 0, nach Widerruf wieder 42501, Monteur weiter nur seine Anforderungen. Im Papier selbst zu berichtigen: die Folge heißt nicht „frei = 0“, sondern „leere Liste“. Und: `baustellen_budget_lage` bekommt **nicht** „dieselbe Korrektur“ — der Support sieht den Budgetstand ausdrücklich nicht (`docs/grenzen-durchsicht-2026-10-24.md:53`); der Plan hat das richtig. `coalesce(app.betrieb(), …)` (Plan) und `coalesce(app.lesebetrieb(), …)` (Papier) wirken gleich, solange die Prüfung `app.darf(betrieb)` dahinter stehen bleibt — das gehört ins „bleibt gleich“. |
| M-2 | bestätigt (am Code) | Aufruf ohne `.range()`: `src/lib/db/pg/materialOrders.ts:506` (`ausgegebenes_material_gesamt`) und `:473` (`ausgegebenes_material`); `derClient()` (`kern.ts:61`) setzt nichts dazu; die Funktion hat kein `limit`; die Ansicht fragt bis zu 25 Baustellen in einem Zug (`nachkalkulationLaden.ts:79`). Datenbankhälfte nachgestellt (`m2.sql`): 1.200 erledigte Zeilen auf zwei Baustellen → die Funktion gibt 1.200 zurück (700 + 500), die Datenbank schneidet nicht ab. Die ersten 1.000 in der Reihenfolge der Funktion: Baustelle 1 ganz (700), Baustelle 2 nur 300 — es fehlen 200 der hinteren Baustelle, wie beschrieben. `supabase/config.toml:18` `max_rows = 1000`; dass PostgREST auch Funktionen deckelt, sagt der Code selbst (`pg/materials.ts:350-353`, `kern.ts:308-313`). Den Schnitt selbst habe ich nicht gesehen (kein PostgREST). | Reihenfolge ist heute nicht eindeutig: in meinem Lauf 14 Schlüssel (Baustelle, Tag, Name) mit bis zu 100 Zeilen — Blättern ohne zusätzliche Spalte würde Zeilen doppelt holen oder auslassen; der Vorschlag nennt das. `ausgegebenes_material` ordnet schon nach `beleg_id`, braucht also nur das Blättern. Der Plan (Schritt 7) nennt `ausgegebenes_material_gesamt` und `schein_einkaufspreise`, **nicht** `ausgegebenes_material` (`:473`) — entweder mitblättern oder im Wächter mit Grund eintragen. Sonst kein Risiko erkennbar. |
| M-3 | bestätigt (nachgestellt) | Von Hand (`m3.sql`): als Verwaltung `update materials set unit = …` bei Bestand 20, Mindestmenge 5, Verkaufspreis 42,50 und offener Zusage → geht ohne Einwand durch („20 Stg“ wird „20 m“). Import (`m3b.sql`): Lauf mit „m“ statt „Stg“ → `unit` wird `m`, Bestand, Mindestmenge, Verkaufspreis bleiben; der Laufbericht nennt die Einheit nicht (`geaendert: 2`, sonst nichts). Stelle: letzte Fassung von `datanorm_uebernehmen`, Abschnitt 3 (= `mig/20261107100000_…:1143-1146`). **Zwei Korrekturen am Papier:** (a) Der Import ändert die Einheit nur, solange dem Artikel kein zweiter Großhändler zugeordnet ist (dieselbe Stelle, Zeile davor) — der Umfang ist kleiner als beschrieben. (b) „Eine offene Anforderung 2,5 m … lässt sich nicht mehr abschließen“ stimmt so nicht: ganz abholen geht (nachgestellt: `anforderung_abschliessen` → 1, Bestand 30 → 27,5 „Stk“, die Zeile heißt danach „2,5 Stk“); abgewiesen werden nur die Teilmenge und das Ändern der Menge („In ‚Stk‘ zählen ganze Stück“). | **Drei Risiken.** (1) **Preis und Einheit laufen auseinander:** Lässt der Import die Einheit stehen, schreibt er den neuen Einkaufspreis trotzdem an den Stammartikel (Abschnitt 5 derselben Funktion, ein Großhändler: „ein neuer Preis ersetzt“). Dann steht der Preis je Meter an einem Artikel, der in Stangen zählt — heute wechseln wenigstens beide zusammen. Mit M-5 („Verkaufspreise nachziehen“) würde dieser Preis in den Verkauf getragen. Der Vorschlag muss den Einkaufspreis einer Zeile mit abweichender Einheit ebenfalls zurückhalten (so wie der Lieferantenvergleich „Einheit m statt Stg“ schon als Hindernis führt, `:565-566`). (2) **Auslöser und Import müssen in einer Migration kommen:** der Import setzt `unit` in jedem `update` mit; ein Auslöser `before update of unit`, der bei Bestand abweist, bräche sonst den ganzen Block ab („alles oder nichts je Block“). Fehlt im „bleibt gleich“: ein Lauf mit abweichender Einheit läuft durch. (3) **Harte Sperre (Papier) gegen Rückfrage (Plan):** Papier: Feld gesperrt, Datenbank weist ab, solange Bestand, Anforderungen, Rüstlisten oder Zählliste da sind. Plan (Paket 4): „von Hand mit Rückfrage“. Das ist nicht dasselbe. Die harte Sperre nimmt eine heutige Möglichkeit weg: ein Artikel, der mit falschem Wort angelegt wurde („Stk“ statt „m“, die Zahl stimmt), ließe sich nur noch über Bestand auf null, alle Anforderungen schließen, Einheit ändern, neu zählen berichtigen. Vor dem Bauen entscheiden; mein Rat: Rückfrage mit den Zahlen, harte Abweisung nur für den stillen Weg (Import, alte App). |
| M-4 | bestätigt (nachgestellt) | `m4.sql`: Posten „2 Pkg“ auf Artikel in „Stk“ wird gespeichert; „2,5 m“ auf Stück-Artikel wird gespeichert (ohne Einheit am Posten: abgewiesen, wie beschrieben). `einkauf_geliefert` → Bestand 5 → 10 statt 5 → 25 bzw. 0 → 2,5 „Stk“. Oberfläche: `Einkaufsliste.tsx:827-829`, `:843`, `:935` wie zitiert. **Korrektur am Papier:** „ebenso der Wareneingang über die Bestellungen“ stimmt nicht — der Wareneingang bucht die getippte Menge in der Einheit des Artikels (`m4b.sql`, Teil 1: Wareneingang 20 gegen den Posten „2 Pkg“ → Bestand +20, Posten erledigt). Falsch bucht nur „Geliefert“ aus der Einkaufsliste. **Zusätzlich gefunden:** auch ein freier Posten **ohne** Katalogartikel bucht, wenn sein Name genau einem Artikel entspricht (`app.katalogeintrag` in `einkauf_geliefert`): „3 Pkg Pressfitting 15“ frei getippt → +3 Stk. | **Verbietet der Vorschlag etwas Gewolltes (Bestellen in Packungen)?** Nein, nichts, was heute funktioniert: die Bestellung an den Großhändler druckt für einen Posten mit Katalogartikel schon jetzt die Einheit des Artikels und zählt ihn mit den Anforderungen desselben Artikels zusammen (`einkauf.ts:140` `einheit: k?.unit ‖ einheit`, Schlüssel = `materialId`) — aus „2 Pkg“ wird auf der Bestellung „2 Stk“. Die Packung ist im Modell die Zahl „Verpackungseinheit“ am Artikel (E60), Bestellvorschläge legen Posten in der Einheit des Artikels an. Das gesperrte Feld nimmt also eine irreführende Eingabe weg, keine Funktion. **Aber:** wer künftig in Packungen bestellen will, tippt den Posten frei — und der bucht über den Namen weiter roh (siehe links). Der Vorschlag muss diesen Weg mit abdecken, sonst bleibt der Fehler über den Umweg. **Zwei nachgestellte Fallen beim Bauen (`m4b.sql`):** (a) Fassung des Plans („Datenbank weist ab“): der Auslöser `update of material_id, einheit` feuert auch bei „Geliefert“ (die Funktion setzt `material_id` immer mit) — Altposten mit abweichender Einheit lassen sich dann weder liefern noch teilliefern (`ERROR … Der Posten trägt die Einheit des Artikels`), freie Posten mit Katalognamen ebenso; nur Storno geht. (b) Fassung des Papiers (Auslöser setzt die Einheit): die alte App schickt „2 Pkg“, gespeichert wird still „2 Stk“; Altposten werden bei „Geliefert“ doch umgeschrieben („2 Pkg“ → „2 Stk“) und buchen weiter +2. In beiden Fassungen muss `einkauf_geliefert` für Posten mit abweichender Einheit die Menge in der Einheit des Artikels annehmen können — das Papier nennt nur den Dialog, nicht die Funktion. Papier und Plan widersprechen sich hier (setzen gegen abweisen). |
| M-5 | bestätigt (am Code) | Letzte Fassung `verkaufspreise_vorschlagen`: `coalesce(m.verkaufspreis, 0) = 0`. In `datanorm_uebernehmen` kommt `verkaufspreis` nicht vor. Im Importlauf `m3b.sql` blieb der Verkaufspreis bei 42,50, während der Einkauf von 40 auf 8,50 ging. Keine Entscheidung dazu in `entscheidungen.md` oder im Grenzen-Dokument gefunden. | Der Merker „kalkuliert / fest“ ist der Schutz vor dem Überschreiben von Hand gesetzter Preise — **im Kurztext des Plans (Paket 21 a) fehlt er**, und dort steht „schlägt der Probelauf … vor“: im Probelauf (vor der Übernahme) gibt es die neuen Einkaufspreise noch nicht; das Papier meint den Laufbericht danach. Abhängigkeit zu M-3 (siehe dort): Artikel mit abweichender Einheit dürfen nicht nachgezogen werden. Fehlt im „bleibt gleich“: Altpreise gelten als „fest“ — damit zieht die neue Funktion im ersten Jahr fast nichts nach; das sollte dem Auftraggeber gesagt werden (gewollt, aber die Lücke schließt sich erst mit der Zeit oder mit einer bewussten Auswahl). |
| M-6 | **teilweise** | **Die Kernaussage „das Fenster öffnet sich nicht“ ist falsch.** Nach dem Unterschreiben springt die App auf `/worksheets?markiert=<id>` (`WorkSheetView.tsx:1026`, wie zitiert) — und die Liste öffnet genau diesen Schein im Fenster: `WorkSheetsListView.tsx:302` `useState(markiert)`, `:848` `offenerSchein`, `:1577-1578` zeigt dort `VerbrauchAmSchein`. Die Prüfung des Repos beweist es: `tests/components/WorkSheetsListView.test.tsx:1301` „öffnet den markierten Schein im Fenster“ (ausgeführt, grün); der Kopf des Abschnitts `:1761` sagt: „Nach dem Unterschreiben öffnet sich das Fenster des Scheins“. `/worksheet` und `/worksheets` sind zwei Routen (`App.tsx:79`, `:84`), die Liste wird also frisch aufgebaut. **Was stimmt:** (a) ohne Netz unterschrieben führt der Sprung auf `/worksheets` ohne `markiert` (`WorkSheetView.tsx:1021`) — dort kommt die Frage erst, wenn jemand den Schein öffnet; (b) wer das Fenster schließt, ohne zu entscheiden, wird nie erinnert; weder Lager noch Startseite kennen „Scheine ohne Entscheidung“ (keine Fundstelle außerhalb des Fensters). | Teil (1) des Vorschlags („nach dem Unterschreiben öffnet sich der Schein mit dem Abschnitt“) **ist gebaut**. Ihn noch einmal zu bauen, hieße ein zweites Fenster oder eine zweite Frage auf demselben Weg. Zu bauen bleibt Teil (2) (Zähler und Liste „Verbrauch offen“) und der Fall ohne Netz. Schwere eher niedrig als mittel, Aufwand kleiner. Plan: Paket 14 („Schein unterschrieben → ‚Verbrauch buchen?‘ (M-6)“) und Paket 21 b („wird nach der Unterschrift angeboten“) beschreiben den vorhandenen Zustand als Auftrag — streichen bzw. auf Teil (2) kürzen. |
| M-7 | bestätigt (am Code) | `app.eigenes_fahrzeug` (letzte Fassung): `f.standardfahrer_uid = auth.uid()`, sonst nichts; `fahrzeuge` hat nur diese eine Spalte. Aufrufer in der Datenbank: `app.anforderung_abschliessen_ganz`, `retoure_anlegen`, `schein_verbrauch_buchen`, `umlagern`. Grenzen-Dokument nennt es nicht. Kleinigkeit: der Helfer kann den Verbrauch auch aus dem Hauptlager buchen, nicht „nur nicht abbuchen“ (`schein_verbrauch_buchen`: ohne Ort = Hauptlager). | Der Vorschlag ändert `app.eigenes_fahrzeug` — das reicht nicht: `schein_verbrauch_vorschlag` (Liste der Orte), `laden_umschalten` (eigene Regel mit Eingeteilten und Poolfahrzeugen), `person_auskunft`, `person_loeschen`, `fahrzeug_speichern` fragen `standardfahrer_uid` direkt; in der App `eigeneFahrzeugOrte` und `abhakOrte` (`orders/lagerorte.ts`), `OrderView`, `MeinFahrzeug`. Fehlt im „bleibt gleich“: die Regel von `laden_umschalten` für Poolfahrzeuge ohne Standardfahrer. Entschieden ist es (E-M7). |
| M-8 | bestätigt (am Code) | `StockView.tsx:434` (Artikelwahl ohne `treffer`), `:237` (Hauptliste mit), `:913-915` (Text). `m8.sql`: `lager_liste('AV25')` für einen Katalogartikel, der nicht im Lager geführt wird → 0 Treffer; `lager_eingang` auf denselben Artikel geht durch, danach `lagerartikel = t`, Bestand 50, Treffer 1. | **„ohne ausgelaufene“ nähme etwas weg:** die heutige Wahl zeigt ausgelaufene Lagerartikel (die Funktion filtert sie nicht), und ein Eingang auf sie ist möglich (nachgestellt) — etwa die Restlieferung einer alten Bestellung. Richtig: ausgelaufene **Lagerartikel** bleiben wählbar, ausgenommen werden nur ausgelaufene Artikel, die nicht im Lager geführt sind. Reihenfolge: M-8 macht M-11 häufiger (ein Artikel wird durch den Eingang zum Lagerartikel, während Kommissionsware abholbereit liegt) — M-11 vor oder mit M-8. |
| M-9 | bestätigt (am Code) | `bestellungPdf.ts:69-73` (Datum, Kundennummer, Bestellt von), `einkauf.ts:259` `MAILTO_GRENZE = 1800`, `mig/20261117041000_…:106` `art in ('rechnung', 'angebot')`, Grenzen-Dokument Zeile 71 und 107 wie zitiert. | Groß, aber schlüssig. Fehlt im „bleibt gleich“: Zeile 855 des Grenzen-Dokuments („Ohne Antwortadresse des Betriebs geht keine Mail hinaus“) gilt dann auch für Bestellungen — der Weg über das Mailprogramm muss daneben stehen bleiben, sonst kann ein Betrieb ohne eingerichteten Versand nicht mehr per Mail bestellen. |
| M-10 | bestätigt (nachgestellt) | `m10_11.sql`: freie Zeile „30 m“, 10 abgeholt → erledigte Zeile `quantity 10, einheit NULL`, offene Zeile `20, m`. `app.anforderung_abspalten` führt `einheit` nicht in der Spaltenliste. Bestellung: `einkauf.ts:178` `zeile(g, o)` ohne Einheit, `:166-175` ohne `einheit` (am Code). | Kein Risiko gefunden. |
| M-11 | bestätigt (nachgestellt) | `m10_11.sql`: 5 Stück Kommissionsware geliefert (`kommission = t`, Bestand 0), Artikel wird Lagerartikel, Eingang 10 → `lager_frei`: Bestand 10, zugesagt 5, frei 5; `app.lager_zugesagt` = 5; „Aus Lager“ für 8 → `ERROR: Im Lager sind nur 5 Stk frei (10 im Regal, 5 schon zugesagt)`. Nach der Abholung der Kommissionsware: Bestand 10, frei 10. | Die Bedingung steht in **fünf** Funktionen: `lager_frei`, `app.lager_zugesagt`, `app.bestellvorschlag_stand`, `app.deckung_frei_vor` (das „falls“ des Papiers trifft zu) — **und in `materialdeckung`, wo sie nicht geändert werden darf**: dort stuft sie die Anforderung als „bereit“ ein, und abholbereite Kommissionsware ist bereit. Ins „bleibt gleich“. |
| M-12 | bestätigt (am Code) | `pg/materials.ts:323-329` (`max = 200`, `.limit(max)`), einziger Aufrufer `LagerDialoge.tsx:468`, `:508` blättert nur im Geladenen. | Kein Risiko. Der Plan nennt nur „ältere anzeigen“, nicht die CSV-Ausgabe des Papiers. |
| M-13 | bestätigt (nachgestellt) | `m13_14.sql`: 4 Stk + 12,5 m + 0,5 kg zugesagt → `lager_liste … -> 'reserviert'` = `17.000`. Anzeige `StockView.tsx:504-507`. | Kein Risiko; der neue Filter „reserviert“ braucht die Erweiterung der erlaubten Werte in `lager_liste` (heute 22023 für alles außer alle/knapp/fehlt). |
| M-14 | bestätigt (nachgestellt) | `m14.sql`: direkt abgeholt (verbucht, Bestand 20 → 16) → „Auf Offen“ (`anforderung_status_setzen` → geändert, `processed` bleibt wahr) → das Update von `aufEinkaufsliste` (`beschaffung is null and status = 'Offen'`) geht durch (`In Bearbeitung, processed t, einkauf`) → „bestellt“ geht → `einkauf_geliefert` → 0 Zeilen, `einkauf_stornieren` → 0. „Abgeholt“ löst es ohne zweiten Abzug (Bestand bleibt 16). | Kein Risiko. Fehlt: Zeilen, die heute schon so hängen, bleiben auf der Liste — die Anzeige (`aufEinkaufsliste(o)` in `einkauf.ts:85-89`) sollte verbuchte Zeilen ebenfalls auslassen. |
| M-15 | bestätigt (am Code) | `src/lib/db/materials.ts:24`; Regel `frei <= p_grenze` in `lager_liste`. Die Konstante steht an elf Stellen in fünf Dateien (auch in Texten: `StockView.tsx:465`, `:835`, und im Browser-Vergleich `istKnapp` in `OrderView`, `MaterialCatalog`). | „0 = nur Artikel mit Mindestmenge warnen“ geht mit der heutigen Regel nicht: mit Grenze 0 gilt jeder Artikel ohne Mindestmenge und mit 0 frei weiter als knapp. Dafür braucht es einen eigenen Wert („aus“). „An derselben Stelle gelesen“ sind elf Stellen, nicht eine. |
| M-16 | bestätigt (am Code) | `tests/supabase/zeilengrenze.test.ts` kennt keine Materialfunktion; `lagerListe.test.ts:168-179` und `anforderungenLaufend.test.ts:112` prüfen Rechte ohne Support. Eigene Zählung: 46 der 195 in `src/` gerufenen Funktionen geben Zeilenmengen zurück, 36 davon ohne `.range()` (darunter schreibende und solche mit eigener Obergrenze im Rumpf). | Der Wächter (1) braucht beim ersten Lauf an die 30 begründete Einträge, nicht zwei — „klein bis mittel“ passt, „rot für zwei Funktionen“ (Plan, Schritt 6) gilt erst danach und es sind mit `ausgegebenes_material` drei. Wächter (2): siehe Abschnitt 4 — „darf nicht 42501 antworten“ (Plan) fängt `lager_frei`/`lager_knapp` nicht, die leer antworten; das Papier verlangt richtig „Daten“. |

(In der Tabelle steht `‖` für das doppelte `|` des Codes, damit die Spalten halten.)

## 3. Nicht bestätigt — im Einzelnen

### M-6 (teilweise)

**Papier:** „Den Verbrauch am Schein bietet die App niemandem an; das Fahrzeuglager sinkt
nur, wenn jemand den unterschriebenen Schein von sich aus wieder öffnet.“ Beleg: nach
dem Unterschreiben springe die App auf die Liste „mit markierter Zeile … das Fenster
öffnet sich nicht“.

**Gefunden:** `markiert` ist nicht nur eine Markierung. `WorkSheetsListView` legt den
Wert als Startwert des geöffneten Scheins an (`:302`), sucht ihn in den geladenen
Scheinen oder holt ihn einzeln (`:828-857`) und öffnet das Seitenfenster
(`open={!!offenerSchein}`, `:1503`); für einen unterschriebenen Schein steht darin
`VerbrauchAmSchein`. Die Komponente selbst sagt es im Kopf („Erscheint im Fenster des
Scheins: dorthin führt das Unterschreiben“), die Prüfung
`tests/components/WorkSheetsListView.test.tsx:1301` hält es fest und läuft grün. Mit
Netz wird die Frage also sofort nach der Unterschrift gestellt.

**Was bleibt:** keine Erinnerung, wenn das Fenster ohne Entscheidung geschlossen wird;
kein Zähler; ohne Netz kommt die Frage erst beim nächsten Öffnen des Scheins.

**Zu ändern im Papier:** Titel und Beleg („öffnet sich nicht“) berichtigen; Vorschlag
Teil (1) streichen; Schwere niedrig. **Im Plan:** Abschnitt 3.5 Kurztext („wird
niemandem angeboten“) → „keine Erinnerung an offene Verbrauchsentscheidungen; ohne Netz
keine Frage“; Paket 14 den Punkt „Schein unterschrieben → ‚Verbrauch buchen?‘“
streichen (gibt es); Paket 21 b auf Zähler und Liste kürzen, Aufwand unter 3 Tage.

### Bestätigt, aber mit Korrektur am Wortlaut des Papiers

- **M-1:** Folge des halben Umbaus ist eine leere Liste, nicht „frei = 0“;
  `baustellen_budget_lage` ist benannte Grenze und bekommt die Korrektur nicht.
- **M-3:** der Import ändert die Einheit nur bei Artikeln mit einem einzigen
  Großhändler; eine offene Anforderung lässt sich nach dem Wechsel ganz abholen, nur
  nicht teilen oder in der Menge ändern.
- **M-4:** der Wareneingang über Bestellungen bucht richtig; falsch bucht „Geliefert“
  aus der Einkaufsliste — auch für frei getippte Posten, deren Name einem Artikel
  entspricht.
- **M-7:** der Helfer kann aus dem Hauptlager buchen, nicht nur „nicht abbuchen“.

## 4. Zum Plan

1. **Paket 1, Schritt 5 (M-1) — würde so verschlechtern.** In der Liste der Funktionen
   fehlen `lager_frei` und `lager_knapp`. Nachgestellt: ohne sie sieht der Support nach
   dem Umbau ein leeres Lager statt eines Fehlers. Beide aufnehmen; ins „bleibt gleich“:
   die Prüfung `app.darf(…)` hinter dem Betrieb bleibt stehen, ein Betriebskonto erreicht
   nie einen anderen Betrieb (nachgestellt: fremder Betrieb 0 Zeilen), nach Widerruf 42501.
2. **Paket 1, Schritt 4 (Wächter Support) — Kriterium zu schwach.** „Darf nicht 42501
   antworten“ erkennt weder `lager_frei`/`lager_knapp` (antworten heute leer, ohne
   Fehler) noch den halben Umbau aus Punkt 1. Kriterium: mit Freigabe „ansehen“ kommt
   **dasselbe** zurück wie für die Verwaltung desselben Betriebs. „Mit den vier
   Funktionen heute rot“ stimmt für `lager_liste` und `anforderungen_laufend`
   (nachgestellt).
3. **Paket 1, Schritt 6/7 (M-2):** `ausgegebenes_material` (`materialOrders.ts:473`)
   steht im Papier, nicht im Plan. „Rot für zwei Funktionen“ setzt eine Ausnahmeliste
   mit an die 30 begründeten Einträgen voraus (Zählung oben: 36 Aufrufe ohne `.range()`) — als Arbeit einplanen.
4. **Paket 4, M-4 — Papier und Plan widersprechen sich** („Auslöser setzt die Einheit“
   gegen „Datenbank weist ab“), und beide Fassungen haben eine nachgestellte Falle
   (Abschnitt 2). Vor dem Bauen festlegen: abweisen nur, wenn sich `einheit` oder
   `material_id` wirklich ändert (Vergleich alt/neu), „Geliefert“ und Teillieferung von
   Altposten bleiben möglich und fragen die Menge in der Einheit des Artikels; der
   freie Posten mit Katalognamen wird mitbehandelt. Fehlt im „bleibt gleich“:
   Wareneingang gegen einen Posten (bucht heute richtig), `einkauf_teillieferung`,
   `einkauf_stornieren`, Bestellvorschläge übernehmen.
5. **Paket 4, M-3 — Papier und Plan widersprechen sich** (harte Sperre gegen
   Rückfrage). Dazu fehlt in beiden: der Einkaufspreis einer Zeile mit abweichender
   Einheit darf nicht an den Stammartikel; Auslöser und Import in einer Migration.
6. **Paket 4, M-8:** „ohne ausgelaufene“ nur für Artikel, die nicht im Lager geführt
   sind. M-11 vor M-8.
7. **Paket 4, M-11:** vier Stellen ändern, `materialdeckung` nicht (Abschnitt 2).
8. **Paket 4, „Bleibt gleich“** nennt nur `lagerListe.test.ts`, Bestellvorschläge,
   Inventur. Es fehlen die Prüfungen, die die Papierbefunde selbst nennen:
   `einkauf.test.ts`, `Einkaufsliste.test.tsx`, `teilmengen.test.ts`,
   `eingeladenReserviertNicht.test.ts`, `lagerfuehrungAmArtikel.test.ts`,
   `bestellungStornoTeillieferung.test.ts`, `wareneingangBestellung.test.ts`,
   `AdminOrdersView.test.tsx`, `StockView.test.tsx`. Der Aufwand „4–5 Tage“ für neun
   Punkte ist mit den Punkten 4 und 5 knapp.
9. **Paket 14 und Paket 21 b (M-6):** beschreiben Vorhandenes als Auftrag (Abschnitt 3).
10. **Paket 21 a (M-5):** „Probelauf“ → Laufbericht nach der Übernahme; der Merker
    „kalkuliert / fest“ gehört in den Kurztext, er ist der Schutz. Voraussetzung: M-3
    (Paket 4) ist gebaut, sonst zieht M-5 Preise in der falschen Einheit nach.
11. **Abschnitt 1.2 und 3.5:** die Kurztexte zu M-1 bis M-5 und M-7 bis M-16 stimmen
    mit dem Papier und mit meinem Ergebnis überein; M-6 nicht (Punkt 9). Die Pakete
    passen (1 für M-1, M-2, M-16; 4 für die Bestandsfehler; 21 für die großen Lücken).

Kein Vorschlag entfernt absichtlich eine Funktion. Unabsichtlich würden es: M-1 nach
Plan (leeres Lager für den Support), M-4 nach Plan (Altposten nicht mehr lieferbar),
M-3 nach Papier (falsches Wort am Artikel nicht mehr berichtigbar), M-8 nach Papier
(ausgelaufene Lagerartikel nicht mehr im Wareneingang wählbar).

## 5. Geklärte Verdachtsfälle

- **Suche der Zählliste:** trifft zu. `inventur_anlegen` sucht mit
  `m.name ilike '%' || suche || '%'` (letzte Fassung), `lager_liste` mit `strpos` — `%` und
  `_` wirken nur in der Zählliste als Platzhalter. Auswirkung gering.
- **Die Lagerliste hört nicht auf Rüstlisten:** am Code bestätigt. `lagerBeobachten`
  hält Kanäle für `materials` und `material_orders` (`pg/materials.ts:594`), nicht für
  `einsatz_material`, obwohl die Tabelle in der Veröffentlichung `supabase_realtime`
  steht. Nicht im Browser nachgestellt.
- **Uhr des Geräts in „Laufend“:** die Angabe stimmt (`AdminOrdersView.tsx:560-561`:
  `todayStr()`, `Date.now()`). Den Vergleich mit der Startseite habe ich nicht gezogen.
- Last während des Imports, `lager_liste` bei 10.000 Artikeln, wartende Retoure in der
  Rechnungsvorschau: nicht geklärt (bräuchten Messung bzw. die Rechnungsansicht).

## 6. Nicht geprüft

- Der Schnitt bei 1.000 Zeilen durch PostgREST selbst (M-2) — kein PostgREST in der
  Prüfumgebung; gestützt auf `config.toml`, die Kommentare im Code und die
  Datenbankhälfte.
- Alles, was nur im Browser zu sehen ist: die Fehlermeldung im Lager für den Support
  (M-1), das gesperrte Einheitenfeld, der Sprung nach dem Unterschreiben auf einem
  echten Gerät (M-6 — gestützt auf Code und die Komponentenprüfung).
- Dass das Lager vor dem 18.11. für den Support lesbar war („Rückfall“, M-1): nicht in
  der Versionsgeschichte nachgesehen; belegt ist nur, dass die Tabellen für den Support
  lesbar sind und die Funktionen nicht.
- Abschnitt 4 des Papiers (30 neu bewertete Grenzen) und Abschnitt 6 (✔-Punkte des
  letzten Plans) nur dort, wo ein Befund daran hängt (Zeilen 53, 71, 105, 107 des
  Grenzen-Dokuments; M3/F10, M6, M8, K7).
- Abschnitt 5 des Papiers (Ideen) gar nicht.
- Die Zahl „192 knappe Artikel“ (M-15) und die Messwerte des gewachsenen Bestands.
- Echte DATANORM-Dateien (M-3): nachgestellt ist die Übernahme aus von Hand angelegten
  Zeilen eines Laufs, nicht der Leser.
