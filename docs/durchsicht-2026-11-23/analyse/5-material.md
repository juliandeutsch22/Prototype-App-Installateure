# Material: Anfordern, Lager, Einkauf, Katalog, Inventur, Fahrzeuge — Arbeitspapier zur Durchsicht vom 23.11.2026

Stand des Codes: `main` fa6e740. **Nur gelesen.** Kein Test ausgeführt, kein lokaler
Datenbankstapel, kein Browserlauf. „Belegt“ heißt hier: Ansicht, Datenschicht und die
**letzte** Fassung der Datenbankfunktion bis zum Ende gelesen — nicht gegen eine laufende
Datenbank nachgestellt. Pfade relativ zum Repository; `mig/<Name>` steht für
`supabase/migrations/<Name>`.

Hinweis zur Methode: Die Suche nach der letzten Fassung einer Funktion muss ohne Rücksicht
auf Groß- und Kleinschreibung laufen. `mig/20261116060800_eingeladen_reserviert_nicht.sql`
schreibt `CREATE OR REPLACE FUNCTION` groß; ein `grep "function public.lager_frei"` findet
deshalb die überholte Fassung in `mig/20261107200100_…`. Alle Zitate unten stammen aus der
tatsächlich letzten Fassung.

## 1. Angesehen

Abläufe, von der Ansicht bis in die Datenbank verfolgt:

1. **Anfordern** — `src/features/orders/OrderView.tsx` (Korb, freie Zeile mit Einheit, Eil,
   Absenden je Position über das Ausgangsfach), `src/lib/db/pg/materialOrders.ts`.
2. **Büro entscheidet** — `AdminOrdersView.tsx` mit der neuen Seitenfunktion
   `anforderungen_laufend` (`mig/20261118032000_…`), „Aus Lager“ (direktes Schreiben mit
   Auslöser `app.aus_lager_pruefen` → `app.regal_fehlt`), Teilmenge (`anforderung_aus_lager`,
   `app.anforderung_abspalten`, `mig/20261116060300_teilmengen.sql`), „Status von Hand“
   (`anforderung_status_setzen`), Löschen mit Gegenbuchung (`anforderung_loeschen`).
3. **Einkauf** — `Einkaufsliste.tsx`, `einkauf.ts`, `bestellungPdf.ts`, `pg/einkauf.ts`;
   `einkauf_geliefert` (letzte Fassung `mig/20261116060700_…`), `einkauf_teillieferung`,
   `einkauf_stornieren` (`mig/20261116060400_…`), Bestellvorschläge
   (`app.bestellvorschlag_stand`, `bestellvorschlaege_uebernehmen`).
4. **Wareneingang und Abholung** — `lager_eingang` mit Bestellungen
   (`mig/20261116061000_…`), `app.anforderung_abschliessen_ganz` und die öffentliche Fassung
   mit Teilmenge, Kommissionsware (`mig/20261116060200_…`).
5. **Bestand** — `StockView.tsx` mit der neuen Seitenfunktion `lager_liste`
   (`mig/20261118030000_…`), `lager_frei`, `app.lager_zugesagt`, `bestand_anpassen`,
   Bewegungsprotokoll (`app.lagerbewegung_schreiben`), `umlagern`, `MeinFahrzeug.tsx`,
   `app.eigenes_fahrzeug`.
6. **Retoure** — `retoure_anlegen`, `retoure_annehmen`, `retoure_rahmen`
   (`mig/20261116060500_…`, Rahmen zuletzt in `…060600_…`).
7. **Verbrauch am Schein** — `schein_verbrauch_vorschlag/_buchen`
   (`mig/20261116060600_…`), Einbau in `worksheets/WorkSheetsListView.tsx`.
8. **Verrechnung und Nachkalkulation** — `ausgegebenes_material`
   (`mig/20261116060000_…`), `ausgegebenes_material_gesamt` (`…060700_…`),
   `costing/nachkalkulationLaden.ts`, `invoices/materialPositionen.ts` (Preiswahl).
9. **Inventur** — `mig/20261117032000_inventur_zaehlliste.sql` ganz (Anlegen, Zählen,
   Soll zum Zeitpunkt, Buchen).
10. **Katalog** — Auslaufen und Löschsperre (`mig/20261115300000_…`), der Teil der
    DATANORM-Übernahme, der den Stammartikel ändert
    (`mig/20261107100000_lieferantenartikel.sql:1139-1155`), Verkaufspreise aus dem
    Aufschlag (`verkaufspreise_vorschlagen`).

Dabei geprüft und **ohne Befund**: zwei gleichzeitige „Abgeholt“ oder „Aus Lager“
(Zeilensperre, dann Sperre des Artikels); doppelter Tipp bei Wareneingang, Umlagerung,
Retoure und Bestellvorschlägen (Kennung je Vorgang); Teilmengen spalten ohne doppelte
Meldung und ohne doppelte Zusage; Löschen bucht laut Protokoll zurück; die Inventur
rechnet das Soll zum Zählzeitpunkt und sperrt vor dem Buchen; Einkaufspreise stehen nicht
in der Antwort von `lager_liste` (die Spalte `materials.einkaufspreis` ist seit 29.09. nur
Einlass und bleibt leer); der Rechnungspreis nimmt den Artikel über seine Kennung, nicht
über den Namen (`invoices/materialPositionen.ts:132-139`).

## 2. Befunde (belegt)

### M-1 Im Support-Einblick enden Lager, „knappe Artikel“ der Startseite und Anforderungen „Laufend“ in einem Fehler

- Art: Fehler (Rückfall gegenüber K7 des letzten Plans)
- Schwere: mittel — trifft nur den Support, dort aber jeden Blick ins Lager und in die
  laufenden Anforderungen; die Zusage „sieht den Betrieb wie ein Administrator“
  (`mig/20261116074100_support_ansehen_listen.sql:4-6`) ist gebrochen.
- Beleg: `mig/20261118030000_lager_liste.sql:56` (`betrieb text := app.betrieb()`) und
  `:60-62` (ohne Betrieb Fehler 42501); `mig/20261118032000_anforderungen_laufend.sql:39`
  und `:43-45`. `app.betrieb()` liest `company_id` aus dem Token
  (`mig/20260911090000_grundgeruest.sql:35-40`); ein Plattformkonto „trägt WEDER
  `company_id` NOCH `role`“ (`mig/20260920180000_supportzugang.sql:35`). Der Kopf beider
  Funktionen verspricht dagegen „Mitglied oder Support-Einblick“ (`lager_liste.sql:34-36`,
  `anforderungen_laufend.sql:20-22`), und Zeile 50 fragt `app.support_liest(betrieb)` —
  erreicht wird sie für den Support nie. Richtig gebaut ist dasselbe z. B. in
  `mig/20261117015000_katalog_pruefung_im_rumpf.sql:80` und
  `mig/20261117032000_inventur_zaehlliste.sql:488`
  (`coalesce(app.lesebetrieb(), app.supportbetrieb())`). Aufrufer: `StockView.tsx:235`,
  `:364`, `:434`; `dashboard/start/laden.ts:511-512`; `AdminOrdersView.tsx:559`. Die
  Prüfungen decken den Support nicht ab (`tests/supabase/lagerListe.test.ts:168-179`,
  `tests/supabase/anforderungenLaufend.test.ts:112`).
- Auswirkung: Ein Betrieb gibt dem Support Einblick, weil „frei“ im Lager nicht stimmt.
  Der Support öffnet das Lager und sieht „Kein Zugriff auf das Lager dieses Betriebs —
  Erneut versuchen“; bis zur Nacharbeit (§111) las die Seite `materials` über den
  Zeilenschutz und stand da. Ebenso „Laufend“, das seit K7 (16.11.) für den Support
  sichtbar war. Nebenbei: `lager_frei` und `lager_knapp` (ältere Funktionen, dieselbe
  Abfrage des Betriebs, `mig/20261116060800_…:60-61`) geben dem Support eine leere Antwort.
- Vorschlag: eine Migration, die in `lager_liste`, `anforderungen_laufend`, `lager_frei`
  und `lager_knapp` den Betrieb als `coalesce(app.lesebetrieb(), app.supportbetrieb())`
  bestimmt (ohne Betrieb weiter 42501); in `anforderungen_laufend` gilt „alle“, wenn der
  Betrieb der des Einblicks ist. `security definer`, `set search_path = ''`, `revoke … from
  public, anon`, `grant … to authenticated` bleiben. Prüfung: je eine neue Prüfung in
  `lagerListe.test.ts` und `anforderungenLaufend.test.ts` — Support mit Freigabe „ansehen“
  bekommt dieselben Zahlen wie die Verwaltung, ohne Freigabe und nach Widerruf einen Fehler.
  Gegenprobe: ohne die Migration rot (42501). Gleich bleiben muss: alle 17 bestehenden
  Prüfungen beider Dateien, `mandantenTrennung`, und dass ein Betriebskonto nie einen
  anderen Betrieb erreicht (`app.supportbetrieb()` ist für Betriebskonten leer). Risiko des
  Umbaus: `lager_liste` ruft `lager_frei` — beide müssen in derselben Migration wechseln,
  sonst steht für den Support überall „frei = 0“.
  Derselbe Bau steht in `baustellen_liste`, `baustellen_budget_lage` und
  `wartungen_faellig_stand` (`mig/20261118033000_…:51`, `:132`, `mig/20261118031000_…:38`)
  — andere Fachgebiete, dieselbe Korrektur.
- Aufwand: klein

### M-2 Die Nachkalkulation verliert Lagerausgaben, sobald eine Seite mehr als 1.000 Ausgabezeilen hat

- Art: Fehler (stille Obergrenze)
- Schwere: mittel — die Geschäftsführung sieht einen zu hohen Deckungsbeitrag; tritt bei
  Betrieben auf, die konsequent über die App anfordern (jede Korbzeile ist eine Zeile).
- Beleg: `src/lib/db/pg/materialOrders.ts:506` ruft `ausgegebenes_material_gesamt` ohne
  Seiten; die Funktion gibt eine Zeile je Anforderung, Retoure und Rüstlistenposition
  zurück (`mig/20261116060700_material_kleine_luecken.sql:486-557`), für bis zu 25
  Baustellen je Aufruf (`costing/nachkalkulationLaden.ts:54-56`, `:79`).
  `supabase/config.toml:18` setzt `max_rows = 1000`; dass das auch Funktionen trifft, steht
  im Code selbst (`pg/materials.ts:350-353`). Geordnet wird nach Baustelle, Tag, Name
  (`:555`) — abgeschnitten werden die hinteren Baustellen. Ebenso ohne Seiten:
  `ausgegebenes_material` (`materialOrders.ts:473`, je Baustelle; dort erst ab 1.000 noch
  nicht verrechneten Ausgaben). Die Nachbarn machen es richtig: `lagerKnapp` blättert
  (`pg/materials.ts:483-489`), `lagerFrei` fragt in Portionen (`:359-367`).
- Auswirkung: 25 Baustellen auf der Seite, darunter eine Wohnanlage mit 700 abgeholten
  Positionen und 24 kleinere mit je 20. Die Antwort endet nach 1.000 Zeilen; für die
  letzten Baustellen fehlt Material in den Kosten, ohne Hinweis.
- Vorschlag: `ausgegebenesMaterialGesamt` und `ausgegebenesMaterial` lesen seitenweise
  (`.range`, bis eine Seite nicht voll ist — das Muster von `lagerKnapp`); die Funktionen
  ordnen dafür zusätzlich nach `beleg_id` (feste Reihenfolge an der Seitengrenze). Prüfung:
  Datenbankprüfung mit 1.100 Ausgaben über zwei Baustellen — Summe je Baustelle stimmt.
  Gegenprobe: mit dem heutigen Aufruf fehlen 100 Zeilen (rot). Gleich bleiben muss:
  `materialkosten.test.ts`, `ausgegebenesMaterial.test.ts`, `rechnungMaterialJeAusgabe.test.ts`
  ohne Änderung. Risiko: zwei Anfragen statt einer bei großen Seiten — nur dann.
- Aufwand: klein

### M-3 Die Einheit eines Artikels lässt sich ändern, während Bestand, offene Anforderungen und Preise in der alten Einheit stehen — durch den Katalogimport still, von Hand ohne Warnung

- Art: Lücke mit Folgefehler (falscher Bestand, falscher Preis)
- Schwere: mittel — selten, aber dann still und teuer; war in der letzten Durchsicht nur
  Verdacht (V3) und stand nicht im Plan. Der Weg im Code ist belegt; wie oft echte Dateien
  ihn auslösen, ist offen (der Leser ist gegen echte DATANORM-Dateien ungeprüft, benannte
  Grenze).
- Beleg: `mig/20261107100000_lieferantenartikel.sql:1143-1146` — die Übernahme setzt
  `unit = coalesce(z.einheit, m.unit)` am Stammartikel, ohne Blick auf `stock`,
  `lagerbestaende`, offene Anforderungen, Rüstlisten, Mindest- und Sollmenge oder den
  Verkaufspreis. Von Hand: `MaterialCatalog.tsx:613` (Einheit frei änderbar), der Wächter
  `app.materialfelder_geschuetzt` prüft nur die Rolle
  (`mig/20261108100000_materialbereitschaft.sql:134-148`). Dass ein Einheitswechsel ein
  Risiko ist, weiß der Code an einer Stelle: `umlagern` meldet „veraltet“, wenn die Einheit
  des Befehls nicht mehr zum Artikel passt (`mig/20261110120000_…:492-497`).
- Auswirkung: Der Großhändler führt Kupferrohr neu in „m“ statt „Stg“. Nach dem Import
  stehen 20 (Stangen) als „20 m“ im Lager, die Mindestmenge 5 gilt für Meter, der
  Verkaufspreis (je Stange) bleibt stehen und wird auf dem Schein je Meter verrechnet. Eine
  offene Anforderung „2,5 m“ auf einen Artikel, der „Stk“ wird, lässt sich nicht mehr
  abschließen (Mengenprüfung je Einheit).
- Vorschlag: (1) Datenbank: ein Auslöser `before update of unit` an `materials` lässt die
  Änderung (nach `app.einheit_norm`) nur zu, wenn nichts in der alten Einheit steht —
  Bestand im Hauptlager oder an einem Ort, unverbuchte Anforderungen, offene eigene Posten,
  Rüstlisten ab heute, offene Zählliste; sonst Fehler mit den Gründen in Worten (dieselbe
  Stelle wie `app.artikel_verwendung`, damit Rückfrage und Sperre gleich lauten). (2) Die
  Übernahme überschreibt die Einheit des Stammartikels in diesem Fall nicht, sondern zählt
  „N Artikel mit abweichender Einheit — nicht übernommen“ in den Laufbericht; die Einheit
  des Lieferantenartikels wird wie bisher gespeichert (der Vergleich nennt die Abweichung
  schon, `:565-566`). (3) `MaterialCatalog`: Feld gesperrt mit Grund, solange etwas im Weg
  steht. Prüfung: Datenbankprüfung „Einheit mit Bestand abgewiesen“, „Import lässt Einheit
  stehen und meldet“; Gegenprobe: ohne Auslöser grün durchlaufender Wechsel (rot). Gleich
  bleiben muss: Artikel ohne Bestand und Bezug ändern die Einheit wie heute; neue Artikel
  bekommen ihre Einheit aus der Datei; die Normalisierung („stk“ → „Stk“) geht weiter
  durch. Risiko: ein Import, der heute eine falsch gepflegte Einheit „repariert“, tut das
  bei Bestand nicht mehr — er meldet es stattdessen.
- Aufwand: mittel

### M-4 Ein eigener Posten der Einkaufsliste darf eine andere Einheit tragen als sein Katalogartikel; „Geliefert“ bucht die Zahl unverändert in den Bestand

- Art: Fehler (falscher Bestand)
- Schwere: mittel — das Büro merkt es erst bei der Inventur; naheliegend bei Ware, die in
  Packungen bestellt und in Stück geführt wird.
- Beleg: `Einkaufsliste.tsx:828` (geprüft wird mit der getippten Einheit), `:843`
  (gespeichert wird die getippte), `:935` (Feld frei neben dem gewählten Artikel);
  `app.einkauf_posten_menge_pruefen` nimmt die Einheit des Artikels nur, wenn am Posten
  keine steht (`mig/20260930370000_mengen_je_einheit.sql:97-99`); `einkauf_geliefert` bucht
  `p.menge` in den Artikel (`mig/20261116060700_…:285-293`), ebenso der Wareneingang über
  die Bestellungen (`mig/20261116061000_…:127`). Für Anforderungen ist genau das seit M8
  geregelt (`app.anforderung_einheit`, `mig/20261116060700_…:325-347`) — für eigene Posten
  nicht. War in der letzten Durchsicht Verdacht V4.
- Auswirkung: Posten „2 Pkg Pressfitting 15“ zum Artikel in „Stk“ (Packung zu 10).
  „Geliefert“ → Bestand +2 statt +20; der Bestellvorschlag schlägt gleich wieder vor.
  Mit „2,5 m“ auf einem Stück-Artikel entsteht ein Bestand von 2,5 Stück.
- Vorschlag: Auslöser an `einkauf_posten` wie bei den Anforderungen: mit Katalogartikel
  gilt dessen Einheit (`before insert or update of material_id, einheit`). Oberfläche: mit
  gewähltem Artikel zeigt das Feld die Einheit des Artikels und ist gesperrt; hat der
  Artikel eine Verpackungseinheit, steht darunter „= N Packungen“. Altposten mit
  abweichender Einheit werden nicht umgeschrieben: der Dialog „Geliefert …“ nennt für sie
  die Einheit des Artikels und fragt die Menge in dieser Einheit ab. Prüfung:
  Datenbankprüfung „Posten übernimmt Einheit des Artikels“, Komponentenprüfung für das
  gesperrte Feld; Gegenprobe: heutiger Stand speichert „Pkg“ (rot). Gleich bleiben muss:
  freie Posten ohne Katalogartikel behalten ihre getippte Einheit; `einkauf.test.ts`,
  `Einkaufsliste.test.tsx`. Risiko: gering; der Auslöser darf die Mengenprüfung nicht vor
  dem Setzen der Einheit laufen lassen (Reihenfolge der Auslöser nach Namen).
- Aufwand: klein

### M-5 Ein Preisupdate des Großhändlers erreicht die Verkaufspreise nicht

- Art: Lücke
- Schwere: mittel — nach jeder neuen Preisliste verrechnet der Betrieb Material zum alten
  Verkaufspreis; bei zehntausenden Artikeln pflegt das niemand von Hand nach.
- Beleg: `verkaufspreise_vorschlagen` setzt nur, wo kein Verkaufspreis steht
  (`mig/20260930410000_katalog_lager_aufschlag_wartung.sql:374-382`,
  `coalesce(m.verkaufspreis, 0) = 0`); die DATANORM-Übernahme fasst `verkaufspreis` nie an
  (in `mig/20261107100000_lieferantenartikel.sql` kommt die Spalte nicht vor). Die App
  zeigt nach dem Import „Preissprünge“ des Einkaufs (`KatalogImport.tsx:331-332`, `:727`),
  bietet aber keinen Schritt für den Verkauf an. Im Grenzen-Dokument steht dazu nichts.
- Auswirkung: Jahrespreisliste, Einkauf im Schnitt +6 %. Der Laufbericht zeigt 3.400
  Preissprünge. Alle Verkaufspreise, die im Vorjahr aus Einkauf und Aufschlag vorgeschlagen
  wurden, bleiben stehen; Regiescheine und Angebote rechnen damit weiter.
- Vorschlag: An `materials` ein Merker, woher der Verkaufspreis stammt (`kalkuliert` aus
  Einkauf und Aufschlag / `fest` von Hand): `verkaufspreise_vorschlagen` setzt
  `kalkuliert`, die Katalogbearbeitung `fest`; bestehende Preise gelten als `fest`
  (Altdaten — ihre Herkunft ist nicht bekannt, nichts wird umgeschrieben). Neue Funktion
  `verkaufspreise_nachziehen(p_ausfuehren, p_ids)` nach dem Muster von
  `kommissionsartikel_im_lager`: nennt die Artikel, deren Verkaufspreis vom Ergebnis aus
  heutigem Einkauf und Aufschlag abweicht (Zahl, Spanne, Beispiele), und zieht auf
  Bestätigung die kalkulierten nach; feste nur, wenn ausdrücklich gewählt. Rechte wie
  `verkaufspreise_vorschlagen` (wer Einkaufspreise sieht). Angeboten im Laufbericht des
  Imports neben den Preissprüngen und in den Einstellungen. Rundung über die gemeinsame
  Geldrundung (G7). Prüfung: Datenbankprüfung (kalkuliert folgt, fest bleibt, Vorschau
  ändert nichts); Gegenprobe: ohne Merker bleibt der alte Preis (rot). Gleich bleiben muss:
  `katalogLagerAufschlag.test.ts` („nur wo keiner steht“), ausgestellte Belege (Preise
  stehen in den Positionen fest). Risiko: Überschreiben von Hand gesetzter Preise — deshalb
  Merker, Vorschau und keine Automatik.
- Aufwand: mittel

### M-6 Den Verbrauch am Schein bietet die App niemandem an; das Fahrzeuglager sinkt nur, wenn jemand den unterschriebenen Schein von sich aus wieder öffnet

- Art: Lücke (fehlender nächster Schritt)
- Schwere: mittel — M3/F10 des letzten Plans ist gebaut, erreicht sein Ziel („Fahrzeuglager
  wird erst verlässlich“) aber nur mit einem Handgriff, auf den nichts hinweist.
- Beleg: einziger Einbau `worksheets/WorkSheetsListView.tsx:1577-1578` (im Fenster des
  geöffneten, unterschriebenen Scheins). Nach dem Unterschreiben springt die App auf die
  Liste mit markierter Zeile (`WorkSheetView.tsx:1026`, `navigate('/worksheets?markiert=…')`)
  — das Fenster öffnet sich nicht. Weder Lager (`StockView.tsx`) noch Startseite
  (`dashboard/start/`) kennen „Scheine ohne Entscheidung“ (keine Fundstelle).
- Auswirkung: Der Monteur verbaut über zwei Wochen 14 Pressfittings aus dem Fahrzeug und
  unterschreibt sechs Scheine. Öffnet er keinen davon erneut, zeigt „Mein Fahrzeug“ weiter
  20 — der Zustand vor M3.
- Vorschlag: (1) Nach dem Unterschreiben fragt die App `schein_verbrauch_vorschlag`; gibt
  es Zeilen, öffnet sich der Schein mit dem Abschnitt „Verbrauch abbuchen“ (ein Tipp
  „Nicht abbuchen“ bleibt). (2) Lesende Funktion `schein_verbrauch_offen()` (`stable`,
  `security definer`, `set search_path = ''`, `revoke`/`grant`, Betrieb über
  `app.lesebetrieb()` bzw. Einblick): Zahl und die ersten Scheine, die unterschrieben
  sind, Lagerartikel tragen und noch keine Entscheidung haben — für den Ersteller die
  eigenen, für Lager und Leitung alle; begrenzt auf Scheine seit dem Tag, an dem M3
  eingespielt wurde (Altdaten: ältere Scheine wurden ohne diese Frage geführt). Gezeigt als
  Zeile im Lager und auf der Startseite des Monteurs. Prüfung: Datenbankprüfung (Zahl
  sinkt nach Buchen und nach „nicht abbuchen“; Rechte), Komponentenprüfung für das Öffnen
  nach dem Unterschreiben. Gegenprobe: heutiger Stand öffnet nichts (rot). Gleich bleiben
  muss: nichts wird von selbst gebucht; `scheinVerbrauch.test.ts`; ohne Netz unterschreibt
  der Schein wie bisher (die Frage entfällt dann und steht später in der Zeile). Risiko:
  `app.schein_verbrauch_rechnen` je Schein ist teuer — die Zählfunktion muss zuerst auf
  „hat Lagerartikel, keine Entscheidung“ einschränken.
- Aufwand: mittel

### M-7 Ein Fahrzeug hat genau einen Fahrer; der zweite Mann und die Vertretung kommen an das Fahrzeuglager nicht heran

- Art: Grenze (unbenannte Annahme über den Betrieb)
- Schwere: mittel — betrifft jeden Betrieb, in dem zwei Personen ein Fahrzeug teilen oder
  ein Fahrzeug im Urlaub des Fahrers weiterläuft.
- Beleg: `fahrzeuge.standardfahrer_uid` als einzige Zuordnung
  (`mig/20261107200000_lagerorte_fahrzeuge_umlagerung.sql:123-134`);
  `app.eigenes_fahrzeug` prüft nur ihn (`:753-764`). Daran hängen „Mein Fahrzeug“
  (`MeinFahrzeug.tsx:31-35`), Abholen aus dem Fahrzeug (`mig/20261116060700_…:128-131`),
  Retoure ins Fahrzeug (`mig/20261116060500_…:230`), Zurücklagern
  (`mig/20261110120000_…:451-457`) und der Verbrauch am Schein
  (`mig/20261116060600_…:212`, `:272`). Im Grenzen-Dokument nicht genannt.
- Auswirkung: Monteur und Helfer fahren gemeinsam; der Helfer schreibt den Schein. Er
  bekommt kein Fahrzeug zur Wahl und kann den Verbrauch nur „nicht abbuchen“. In der
  Urlaubswoche des Standardfahrers sieht der Vertreter „Mein Fahrzeug“ nicht.
- Vorschlag: Tabelle `fahrzeug_fahrer` (Fahrzeug, Person, Betrieb) für weitere Fahrer;
  `app.eigenes_fahrzeug` gilt für Standardfahrer und weitere. Zeilenschutz nach der Regel
  (`company_id = (select app.lesebetrieb())`, Support dazu), geschrieben über
  `fahrzeug_speichern`. Personenbezug: in `person_auskunft` und in die Löschung einer
  Person. Oberfläche: Einstellungen › Fahrzeuge „Weitere Fahrer“. Prüfung:
  Datenbankprüfung (weiterer Fahrer liest, lagert zurück, bucht Verbrauch; ein Dritter
  nicht), `eigeneFahrzeugOrte` als Einheitenprüfung; Gegenprobe: ohne Tabelle abgewiesen
  (rot). Gleich bleiben muss: der Standardfahrer und seine Vorbelegungen
  (Zeiterfassung, Rüstliste); `lagerorte`-Prüfungen. Risiko: mehr Personen dürfen aus dem
  Fahrzeug buchen — deshalb eine benannte Liste, keine Ableitung aus dem Einsatzplan.
- Aufwand: mittel

### M-8 Der Wareneingang findet nur Artikel, die schon im Lager geführt werden, und nicht über die Nummer auf dem Lieferschein

- Art: Lücke (Teil 1 stand als B17 in der letzten Analyse und kam nicht in den Plan)
- Schwere: mittel bis niedrig — jede erste Lieferung eines neuen Lagerartikels; jede
  Lieferung, deren Lieferschein die Nummer des zweiten Großhändlers trägt.
- Beleg: Die Artikelwahl fragt `lager_liste` (`StockView.tsx:434`), die nur
  `m.lagerartikel` führt (`mig/20261118030000_…:72`); ohne Treffer steht „Kein
  Lagerartikel passt zur Suche.“ (`StockView.tsx:913-915`). Die Treffer über Nummern der
  Großhändler und die EAN gibt nur die Hauptliste mit (`:186`, `:237`), die Artikelwahl
  nicht (`:434` ohne `treffer`). Die Datenbank kann den Fall: ein Eingang macht den
  Artikel zum Lagerartikel (`app.lager_folgt_bestand`,
  `mig/20261107200000_…:559-561`).
- Auswirkung: 50 neue Absperrventile kommen. Das Büro tippt die Nummer vom Lieferschein —
  kein Treffer. Es muss in den Katalog wechseln, den Artikel suchen, „Im Lager führen“
  anhaken, speichern, zurück ins Lager, Wareneingang.
- Vorschlag: Die Artikelwahl für den Wareneingang sucht im ganzen Katalog
  (`katalogSeite` mit den Nummerntreffern, ohne ausgelaufene) und kennzeichnet
  „noch nicht im Lager — wird mit dem Eingang geführt“; Inventur und Umlagern wählen
  weiter nur Lagerartikel, bekommen aber die Nummerntreffer dazu. Prüfung:
  `StockView.test.tsx` (Wahl findet Katalogartikel und über Großhändlernummer),
  Datenbankprüfung „Eingang auf Katalogartikel führt ihn im Lager“; Gegenprobe: heutiger
  Stand zeigt „Kein Lagerartikel“ (rot). Gleich bleiben muss: die Zahlen der Lagerliste;
  Inventur und Umlagern nur für Lagerartikel. Risiko: ein versehentlich gewählter
  Katalogartikel wird Lagerartikel — die Kennzeichnung und der Dialog nennen es vorher.
- Aufwand: klein

### M-9 Die Bestellung beim Großhändler hinterlässt keinen Beleg — keine Nummer, kein festgehaltener Stand, kein Lieferort; verschickt wird nur über das Mailprogramm

- Art: Lücke; die benannte Grenze dazu hat keinen gültigen Grund mehr
- Schwere: mittel — bei Rückfragen des Großhändlers („welche Bestellung?“), bei
  Teillieferung und Storno ist nicht mehr feststellbar, was wann zusammen bestellt wurde.
- Beleg: `bestellungPdf.ts:69-75` (Kopf: Datum, Kundennummer, Besteller — keine
  Bestellnummer, kein Lieferort, kein Wunschtermin); „Als bestellt markieren“ setzt nur
  `bestellt_am` an den Zeilen (`pg/einkauf.ts`, `schreiben`); der Wareneingang kennt die
  Bestellung nur als Freitext „Bezug“. Versand: `einkauf.ts:258-278` (`mailto:` mit
  Grenze 1.800 Zeichen, darüber gekürzt), während Rechnung, Angebot und Mahnung seit
  Welle 3 aus der App gehen (`mig/20261117041000_beleg_versand.sql:106`, nur
  `'rechnung', 'angebot'`). Grenzen-Dokument Zeile 107: „Bestellbelege mit bestätigtem
  Termin kommen mit M05a“ — „kommt später“ ist nach Grundsatz 6 kein Grund; Zeile 71
  („die App verschickt nichts an … Großhändler“, Grund: eigenes Postfach) ist seit F16
  für Rechnung und Angebot überholt.
- Auswirkung: Das Büro bestellt montags 14 Positionen bei Großhändler A. Mittwoch ruft
  der Vertreter an, zwei Positionen seien nicht lieferbar. In der App stehen 14 einzelne
  Zeilen „bestellt am …“ zwischen denen anderer Bestellungen; das PDF von Montag liegt im
  Download-Ordner eines Rechners.
- Vorschlag: Tabelle `bestellungen` mit eigenem Nummernkreis (Vergabe in der Transaktion,
  wie bei den Belegen), Großhändler, Lieferort (Lager, Baustelle, Abholung),
  Wunsch- und bestätigtem Termin, und `bestellung_zeilen` als festgehaltener Stand
  (Artikel, Nummer des Großhändlers, Menge, Einheit, Kommissionen). „Als bestellt
  markieren“ legt den Beleg in derselben Transaktion an und verknüpft Anforderungen und
  eigene Posten (`bestellung_id`); PDF und Text tragen die Nummer; Nachdruck aus dem
  Beleg; Versand über den vorhandenen Belegversand (Art `bestellung`); „Geliefert …“ und
  der Wareneingang zeigen die Bestellnummer als Bezug; Materialbereitschaft liest den
  bestätigten Termin. Sicherheit nach den Regeln (Funktionen `security definer`,
  `search_path`, `revoke`/`grant`; Zeilenschutz mit `app.lesebetrieb()`); Name des
  Bestellers ist Personenbezug → Auskunft und Löschung. Prüfung: Datenbankprüfungen
  (Nummer lückenlos je Jahr, Stand eingefroren, Storno und Teillieferung je Zeile),
  `Einkaufsliste.test.tsx`; Gegenprobe: ohne Migration fehlt der Beleg. Gleich bleiben
  muss: Zeilen, die vor dem Umbau bestellt wurden (ohne `bestellung_id`), laufen wie
  heute bis „Geliefert“; `einkauf.test.ts`, `bestellungStornoTeillieferung.test.ts`,
  `wareneingangBestellung.test.ts`. Risiko: der Belegversand (Edge Function, Prüfregel
  der Art) wird berührt — eigene Prüfung, dass Rechnung und Angebot unverändert gehen.
- Aufwand: groß

### M-10 Die Einheit einer frei getippten Zeile geht beim Teilen und auf der Bestellung verloren

- Art: Fehler (Rest von M8 des letzten Plans)
- Schwere: niedrig — Lager und Großhändler lesen „×10“ statt „×10 m“.
- Beleg: `app.anforderung_abspalten` übernimmt `einheit` nicht in die neue Zeile
  (`mig/20261116060300_teilmengen.sql:153-163`; die Spalte kam erst mit
  `mig/20261116060700_…:315`, die Funktion wurde danach nicht mehr angefasst); der
  Auslöser setzt sie nur beim Katalogartikel (`:331-337`). Die Einkaufsliste gibt die
  Einheit der Anforderung nicht in die Bestellzeile (`einkauf.ts:178`, `zeile(g, o)` ohne
  Einheit; `:140`) und nicht in „Bestellt — noch nicht da“ (`:166-175`), eigene Posten
  schon (`:193`, `:202`).
- Auswirkung: Freie Anforderung „Kupferrohr 18, 30 m“. Der Monteur holt 10 ab: die
  erledigte Zeile zeigt „×10“, die offene „×20 m“. Auf der Bestellung steht „30 ×
  Kupferrohr 18“.
- Vorschlag: `einheit` in die Spaltenliste von `app.anforderung_abspalten`; `zeile(g, o,
  o.einheit)` und `einheit` in `unterwegs`. Prüfung: `teilmengen.test.ts` (+1: freie Zeile
  mit Einheit, beide Teile tragen sie), `einkauf.test.ts` (+1); Gegenprobe: heutiger Stand
  rot. Gleich bleiben muss: Katalogartikel nehmen weiter die Einheit des Artikels. Risiko:
  keines erkennbar.
- Aufwand: klein

### M-11 Gelieferte Kommissionsware zählt als Zusage gegen den Bestand, sobald der Artikel im Lager geführt wird

- Art: Fehler (Nebenwirkung von M6)
- Schwere: niedrig — nur, wenn ein Artikel zum Lagerartikel wird, während Kommissionsware
  dafür abholbereit liegt.
- Beleg: `lager_frei` und `app.lager_zugesagt` zählen jede unverbuchte Anforderung mit
  `beschaffung = 'einkauf' and geliefert_am is not null`
  (`mig/20261116060800_…:79-81`, `mig/20261107200100_…:152-154`), ohne `kommission`
  auszunehmen; dieselbe Bedingung in den Kandidaten der Bestellvorschläge
  (`mig/20261116060800_…:310-312`). Kommissionsware wurde aber nie eingebucht
  (`mig/20261116060700_…:243-264`, `kommission = not gebucht`).
- Auswirkung: 5 Sonderventile liegen als Kommission abholbereit. Das Büro nimmt den
  Artikel ins Lager und bucht 10 Stück ein. Frei: 5 statt 10; „Aus Lager“ für 8 wird
  abgewiesen („nur 5 frei“), der Bestellvorschlag rechnet mit 5.
- Vorschlag: `and not o.kommission` an den drei Stellen (und in `app.deckung_frei_vor`,
  falls dort dieselbe Bedingung steht — beim Bauen prüfen). Prüfung:
  `lagerfuehrungAmArtikel.test.ts` (+1); Gegenprobe: heutiger Stand frei 5 (rot). Gleich
  bleiben muss: eine in den Bestand gebuchte Lieferung reserviert weiter bis zur Abholung
  (`eingeladenReserviertNicht.test.ts`, `lagerListe.test.ts`). Risiko: gering.
- Aufwand: klein

### M-12 Das Bewegungsprotokoll eines Artikels zeigt höchstens die jüngsten 200 Bewegungen — ohne Hinweis und ohne Weg zu den älteren

- Art: Grenze (unbenannt)
- Schwere: niedrig bis mittel — bei schnell drehenden Artikeln nach wenigen Monaten; das
  Protokoll ist die Unterlage, mit der eine Inventurabweichung geklärt wird.
- Beleg: `pg/materials.ts:323-329` (`max = 200`, `.limit(max)`), einziger Aufrufer
  `LagerDialoge.tsx:468`; „und N weitere“ blättert nur in den geladenen 200 (`:508`).
  Weder Handbuch noch Grenzen-Dokument nennen die Zahl.
- Auswirkung: Pressfitting 15, täglich drei Bewegungen. Im März fehlen 40 Stück; das
  Protokoll reicht bis Mitte Jänner zurück, der Wareneingang von Dezember ist nicht mehr
  zu sehen.
- Vorschlag: „Ältere Bewegungen laden“ holt die nächsten 200 (nach `created_at`, `id`);
  dazu „Protokoll als CSV“ für den Artikel (alle, seitenweise gelesen). Prüfung:
  Komponentenprüfung mit 450 Bewegungen; Gegenprobe: heute enden sie bei 200 (rot). Gleich
  bleiben muss: die ersten Zeilen und ihre Reihenfolge. Risiko: keines erkennbar.
- Aufwand: klein

### M-13 Die Kennzahl „Reserviert“ im Lager zählt Meter, Stück und Kilo zu einer Zahl zusammen

- Art: Unstimmigkeit (B15 der letzten Analyse, stand nicht im Plan; jetzt in der Datenbank)
- Schwere: niedrig — die Zahl im Seitenkopf sagt nichts.
- Beleg: `mig/20261118030000_lager_liste.sql:134` (`sum(zugesagt + geplant)` über alle
  Lagerartikel), gezeigt in `StockView.tsx:504-507`.
- Vorschlag: `lager_liste` gibt zusätzlich `reserviert_artikel` (Zahl der Artikel mit
  Reserviertem); die Kennzahl zeigt diese Zahl mit Sprung auf einen Filter „reserviert“.
  Die Summe bleibt in der Antwort (alte App). Prüfung: `lagerListe.test.ts` (+1),
  `StockView.test.tsx`; Gegenprobe rot. Gleich bleiben muss: „Im Lager“, „Knapp“, „fehlt“.
- Aufwand: klein

### M-14 Eine verbuchte, von Hand zurückgesetzte Anforderung lässt sich auf die Einkaufsliste setzen — die Ware wird ein zweites Mal bestellt, „Geliefert“ wirkt danach nicht

- Art: Fehler (Zustand, aus dem man nur mit Wissen herauskommt; V5 der letzten Analyse,
  jetzt im Code bis zum Ende verfolgt, nicht gegen die Datenbank nachgestellt)
- Schwere: niedrig — braucht zwei bewusste Handgriffe.
- Beleg: Das Fenster bietet für jede Anforderung „Auf ‚Offen‘ setzen“, auch für erledigte
  (`AdminOrdersView.tsx:1470-1479`); `anforderung_status_setzen` lässt das für verbuchte
  Zeilen zu (`mig/20261110120000_…:102-117`, mit Absicht — der Bestand bleibt abgezogen).
  Danach gilt `darfNichtAufLager` (`AdminOrdersView.tsx:1039-1042`, prüft `processed` nur
  beim Weg aus dem Lager), und `aufEinkaufsliste` schreibt ohne die Bedingung
  „unverbucht“ (`pg/einkauf.ts:151-161`). `einkauf_geliefert` überspringt verbuchte
  Zeilen (`mig/20261116060700_…:229-232`), `einkauf_stornieren` ebenso
  (`mig/20261116060400_…:280`).
- Auswirkung: Monteur holt direkt ab; das Büro setzt später auf „Offen“ zurück und tippt
  „Nicht auf Lager“. Die Zeile steht auf der Einkaufsliste, wird bestellt, und bleibt
  nach der Lieferung unter „Bestellt — noch nicht da“ hängen; heraus führt nur
  „Abgeholt“ oder Löschen.
- Vorschlag: `darfNichtAufLager` verlangt `!o.processed`; `aufEinkaufsliste` schreibt
  immer nur unverbuchte Zeilen; dazu in der Datenbank eine Prüfung, dass `beschaffung`
  einer verbuchten Zeile nicht auf `einkauf` wechselt (für die alte App). Prüfung:
  `AdminOrdersView.test.tsx` und eine Datenbankprüfung; Gegenprobe rot. Gleich bleiben
  muss: Zurücksetzen selbst und „Abgeholt“ danach ohne zweiten Abzug.
- Aufwand: klein

### M-15 „Knapp“ ohne Mindestmenge heißt in jedem Betrieb und für jede Einheit „höchstens 5 frei“

- Art: Grenze (feste Zahl statt Einstellung; im Handbuch erklärt, im Grenzen-Dokument nicht)
- Schwere: niedrig — der Messbestand zeigt die Folge: 192 „knappe“ Artikel auf der
  Startseite (Stand §111).
- Beleg: `src/lib/db/materials.ts:24` (`LOW_STOCK_THRESHOLD = 5`), als `p_grenze` an
  `lager_liste` (`StockView.tsx:241`, `laden.ts:511`), Regel in
  `mig/20261118030000_…:84-85`.
- Vorschlag: Einstellung je Betrieb „Ohne Mindestmenge knapp ab … frei“ (Vorgabe 5,
  0 = nur Artikel mit Mindestmenge warnen), an derselben Stelle gelesen, an der heute die
  Konstante steht. Prüfung: `lagerKnapp.test.ts`, `lagerListe.test.ts` mit anderer Grenze;
  Gegenprobe rot. Gleich bleiben muss: mit Vorgabe 5 jede heutige Zahl.
- Aufwand: klein

### M-16 Kein Wächter prüft neue Lesefunktionen auf den Support-Einblick und auf die Zeilengrenze

- Art: fehlende Prüfung (Ursache hinter M-1 und M-2)
- Schwere: niedrig, vorbeugend — beide Fehler entstanden in geprüften Paketen.
- Beleg: `tests/supabase/zeilengrenze.test.ts` kennt keine der Materialfunktionen;
  `tests/supabase/lagerListe.test.ts:168-179` prüft Rechte ohne Support.
- Vorschlag: (1) Einheitenprüfung, die in `src/lib/db/pg/*.ts` jeden `rpc('…')`-Aufruf
  sucht, dessen letzte Fassung in den Migrationen `returns table`/`setof` liefert, und
  `.range(` oder einen Eintrag „begrenzt, weil …“ verlangt. (2) Datenbankprüfung, die
  jede Funktion aus `LESENDE_FUNKTIONEN` einmal als Support mit Freigabe aufruft und
  entweder Daten oder einen Eintrag „Support bewusst ausgeschlossen, weil …“ verlangt.
  Gegenprobe: mit dem heutigen Stand melden beide Wächter die Funktionen aus M-1 und M-2.
  Gleich bleiben muss: nichts am Verhalten; nur Prüfungen. Risiko: die Liste der
  Ausnahmen muss beim ersten Lauf ehrlich gefüllt werden.
- Aufwand: klein bis mittel

## 3. Verdacht (nicht zu Ende geprüft)

- **Last während eines Katalogimports.** `lagerBeobachten` und `katalogBeobachten` bündeln
  auf eine Meldung je Sekunde (`pg/materials.ts:145-165`, `:585-604`); bei einem Import
  über rund 17 Minuten fragt damit jede offene Lagerseite etwa tausendmal `lager_liste`,
  die jedes Mal `lager_frei` über alle Lagerartikel rechnet. Nicht gemessen; es fehlt eine
  Messung mit laufendem Import (gewachsener Bestand).
- **`lager_liste` bei sehr vielen Lagerartikeln.** Gemessen ist der gewachsene Bestand
  (2.000 Lagerartikel). Die Funktion rechnet bei jedem Aufruf das Freie aller Lagerartikel
  und ruft je Rüstlistenposition `app.ruest_angefordert`; wie sie sich bei 10.000 verhält,
  ist offen.
- **Die Lagerliste hört nicht auf Rüstlisten.** `lagerBeobachten` meldet Änderungen an
  `materials` und `material_orders`, nicht an `einsatz_material`
  (`pg/materials.ts:594`). „Reserviert“ dürfte nach einer geänderten Rüstliste auf einem
  anderen Gerät alt bleiben, bis etwas anderes die Liste neu fragt. Nicht nachgestellt.
- **Suche der Zählliste.** `inventur_anlegen` sucht mit `ilike '%' || suche || '%'`
  (`mig/20261117032000_…:345-347`); `%` und `_` im Suchbegriff wirken dort als
  Platzhalter, in `lager_liste` ausdrücklich nicht. Auswirkung vermutlich gering.
- **Uhr des Geräts in „Laufend“.** `anforderungen_laufend` bekommt „heute“ und „jetzt“
  vom Gerät (`AdminOrdersView.tsx:560-561`); eine verstellte Uhr verschiebt die Filter
  „seit über drei Tagen abholbereit“ und „Liefertermin vorbei“. Ob die Zähler der
  Startseite dieselbe Quelle nehmen, habe ich nicht verglichen.
- **Wartende Retoure und Rechnung.** `ausgegebenes_material` zählt eine Retoure ab der
  Erfassung negativ, auch solange das Lager sie nicht angenommen hat
  (`mig/20261116060000_…:148-156`; so entschieden in M7). Wird in dieser Zeit verrechnet
  und kommt die Ware nie an, lässt sich die Retoure weder kleiner annehmen noch löschen
  (`mig/20261116060500_…:379-382`), bis die Rechnung storniert ist. Ob die
  Rechnungsvorschau auf „wartet auf Annahme“ hinweist, habe ich in `InvoicesView.tsx`
  nicht gesucht (in `invoices/ausgegebenesMaterial.ts` steht nichts dazu).

## 4. Benannte Grenzen, neu bewertet

Fundstelle: `docs/grenzen-durchsicht-2026-10-24.md` (Zeile bzw. Abschnitt).

| Grenze | Grund laut Dokument | Gültig nach Grundsatz 6? | Empfehlung |
|---|---|---|---|
| Rechnungen vor M2 decken über ihr Leistungsende (Paket 7) | Altdaten | ja | bleibt |
| Bestehende Kommissionsartikel bleiben Lagerartikel, bis das Lager sie herausnimmt (Paket 7) | Altdaten | ja | bleibt |
| Gutschrift an den Kunden ist ein Hinweis (Paket 7) | fachlich und rechtlich | ja | bleibt |
| Höchstmenge einer Retoure kennt nur in der App Ausgegebenes (Paket 7) | fachlich | ja | bleibt |
| Verbrauch am Schein nur für Lagerartikel, einmal je Schein; Korrektur über die Inventur (Paket 7) | fachlich / Einstellung | teilweise — „einmal, danach Inventur“ ist für den falsch gewählten Ort eine Abkürzung | „Buchung zurücknehmen“ (Gegenbuchung laut `schein_verbrauch.buchungen`), solange der Schein nicht verrechnet ist; zusammen mit M-6 |
| Menge ändern und Zurückziehen brauchen Netz (Paket 7) | Gerät/Netz | ja | bleibt |
| Belege vor M8 ohne festgehaltenen Einkaufspreis (Paket 7) | Altdaten | ja | bleibt |
| Alte App bucht im Wareneingang nur den Bestand (Paket 7) | Gerät | ja, läuft mit dem Neuladen aus | bleibt |
| Inventur bewertet den Bestand nicht (Paket 11a) | Steuerberatung, Rechte | teilweise — die Bewertungsmethode liegt bei der Kanzlei, eine Spalte „Einkaufspreis“ im Protokoll für die, die ihn sehen dürfen, nicht | CSV des Protokolls mit Einkaufspreis für die Spitze (klein), Bewertung bleibt bei der Kanzlei |
| Zählen und buchen nur Verwaltung und Leitung, nicht der Fahrer (Paket 11a) | fachlich (Kontrolle) | ja für das Buchen; für das Zählen eine Annahme über den Betrieb | Einstellung je Betrieb „Fahrer zählt sein Fahrzeug vor, das Lager bucht“ — als Idee, Nutzen hängt am Betrieb |
| Stichtag frühestens 30.09.2026, höchstens 60 Tage voraus (Paket 11a) | Altdaten | ja | bleibt |
| Soll einer Zählliste über den Rücklauf einer Sicherung hinweg (Paket 11a) | Altdaten, Sicherheit | ja | bleibt |
| DATANORM „alles oder nichts“ je Block, 50.000 Zeilen rund 17 Minuten (Zeile 57) | Sicherheit | ja | bleibt; Last der offenen Seiten messen (Verdacht) |
| „E-Mail an …“ öffnet das Mailprogramm, die App verschickt nichts an Großhändler (Zeile 71) | Sicherheit und Betrieb | **nein** — seit F16 verschickt die App Rechnung, Angebot und Mahnung | Bestellung über den Belegversand (M-9) |
| EAN und Preiseinheit nicht gegen echte Dateien geprüft (Zeile 96) | liegt beim Pilotbetrieb | ja, aber der Nachweis steht weiter aus | Dateien anfordern; bis dahin M-3 als Schutz |
| Artikel ohne Preiszeile bekommt keinen Lieferantenartikel (Zeile 97) | Altdaten | ja | bleibt |
| Nur die jüngste Entscheidung zu einem Lieferantenartikel (Zeile 98) | fachlich | ja | bleibt |
| An weiteren Orten gibt es keine Reservierung (Zeile 100) | fachlich: dort ist frei, was liegt | **nur für Fahrzeuge** — ein zweites Lager (zweiter Standort) ist kein Fahrzeug; „Aus Lager“ prüft allein das Hauptlager (`app.regal_fehlt`) | Lager der Art „Lager“ in Zusage und „Aus Lager“ wählbar machen (groß; erst entscheiden, ob Betriebe mit zwei Standorten Zielgruppe sind) |
| Umlagern ohne Bestand am Quellort geht nicht (Zeile 101) | fachlich | ja | bleibt |
| Keine Rundung nach Verpackungseinheit aus DATANORM (Zeile 105) | liegt beim Pilotbetrieb | ja | bleibt |
| Sollbestand am Artikel, nicht je Ort (Zeile 106) | fachlich: bestellt wird gegen das Hauptlager | ja für die Bestellung; die Bestückung eines Fahrzeugs deckt der Grund nicht | „Fahrzeug auffüllen“ (Abschnitt 5) |
| „bestellt“ ist bis M05a, was die Einkaufsliste führt (Zeile 107) | „Bestellbelege kommen mit M05a“ | **nein** — „kommt später“ ist kein Grund | M-9 |
| Ausgelaufene Artikel mit Restbestand bleiben anforderbar (Zeile 280) | fachlich | ja | bleibt |
| Keine Datenbanksperre für neue Anforderungen ausgelaufener Artikel (Zeile 486) | fachlich (Ausgangsfach) | ja | bleibt |
| Zuletzt angefordert nur aus den letzten hundert eigenen Anforderungen (Zeile 372) | „mehr lädt die Seite nicht“ | schwach — das ist „reicht“, kein Grund; Schaden gering | belassen oder als kleine Datenbankabfrage „zuletzt angeforderte Artikel“ |
| „Beim Händler mitgenommen“ nicht bei abholbereiter oder bestellter Ware (Zeile 378) | fachlich | ja | bleibt |
| Lager ohne Rechnung im Browser (Nacharbeit) | Richtigkeit | ja | bleibt |
| Abgleich Schein ↔ Ausgabe über den Namen bei freien Zeilen (Zeile 35) | fachlich | ja | bleibt |
| Hinweise statt automatischem Abzug in der Rechnungsvorschau (Zeile 36) | fachlich | ja | bleibt |

Unbenannt und in Abschnitt 2 geführt: ein Fahrer je Fahrzeug (M-7), 200 Bewegungen
(M-12), „knapp“ fest bei 5 (M-15), 1.000 Zeilen der Nachkalkulation (M-2). Ebenfalls
unbenannt, ohne eigenen Befund: höchstens 500 offene eigene Posten und 200 Großhändler
(`pg/einkauf.ts:28`, `:321`), 500 Vorschläge je Übernahme
(`mig/20261108100000_…:594`) — plausibel, sollten aber im Grenzen-Dokument stehen.

## 5. Zusammenspiel und Ideen

Gereiht nach Nutzen je Aufwand. Keine entfernt eine bestehende Funktion.

1. **Material aus dem angenommenen Angebot bestellen oder anfordern.** Die
   Materialpositionen eines angenommenen Angebots tragen ihren Katalogartikel; weder
   Einkaufsliste noch Rüstliste noch „Material anfordern“ können sie übernehmen (keine
   Fundstelle in `orders/` und `assignments/`). Nutzen: Bei einem Heizungstausch tippt das
   Büro 40 Positionen heute ein zweites Mal. Vorschlag: in der Baustellenakte „Material
   aus dem Angebot …“ → Auswahl der Zeilen → eigene Posten auf der Einkaufsliste mit der
   Baustelle als Kommission oder Positionen der Rüstliste. Gleich bleiben muss: nichts
   entsteht von selbst. Aufwand: mittel.
2. **„Fahrzeug auffüllen“.** Sollbestückung je Fahrzeug (Artikel, Menge); eine Liste
   „fehlt im Fahrzeug“ als vorbereitete Umlagerungen in einem Zug (`umlagern` je Zeile,
   Kennung je Vorgang). Nutzen: das Fahrzeuglager wird planbar, nicht nur gezählt.
   Vorbehalt: nur sinnvoll mit M-6 und M-7 — sonst stimmt der Fahrzeugbestand nicht.
   Aufwand: mittel.
3. **Rücksendung an den Großhändler.** Falsch oder defekt gelieferte Ware geht heute nur
   über eine Inventur aus dem Bestand; ein offener Posten „Gutschrift erwartet“ fehlt.
   Vorschlag: am Wareneingang und am Artikel „An den Großhändler zurück …“ (Abgang mit
   Lieferant, Lieferschein, Grund im Bewegungsprotokoll; Liste offener Rücksendungen bis
   „Gutschrift erhalten“). Nutzen: Bestand und Forderung an den Großhändler stimmen.
   Aufwand: mittel.
4. **Nächster Schritt nach „Geliefert“.** Wird eine Anforderung abholbereit, weiß das
   Lager, für welche Baustelle und welchen Einsatz; angeboten wird nichts. Vorschlag: die
   Meldung trägt „Auf die Rüstliste des nächsten Einsatzes der Baustelle“ (wenn es einen
   gibt). Vorbehalt: Nutzen unsicher, solange Betriebe Abholung am Regal bevorzugen.
   Aufwand: klein bis mittel.
5. **Wareneingang mit der Kamera.** EAN vom Karton lesen und den Artikel wählen (die
   Suche über EAN gibt es, `nummernSuche`). Vorbehalt: `BarcodeDetector` fehlt in Safari
   am iPhone; ohne eigene Erkennung nur auf Android — deshalb als Idee, nicht als
   Vorschlag. Aufwand: mittel.
6. **Wartende Retoure in der Rechnungsvorschau nennen** („davon 4 Stk Rückgabe, vom Lager
   noch nicht angenommen“) — hält die Entscheidung aus M7 und macht die Lücke sichtbar
   (siehe Verdacht). Aufwand: klein.
7. **Bestellwert.** Mit M-9 (festgehaltene Bestellung) und den Einkaufspreisen ließe sich
   für die, die Einkaufspreise sehen, der Wert offener Bestellungen zeigen — die im
   Grenzen-Dokument (Zeile 419) zurückgestellte Kennzahl. Aufwand: klein nach M-9.

## 6. Nachgeprüfte ✔-Punkte des letzten Plans (Stichprobe)

| Punkt | Geprüft an | Ergebnis |
|---|---|---|
| M1 Artikel mit Bestand nicht löschbar, „auslaufen lassen“ | `mig/20261115300000_artikel_auslaufen.sql:135-212` (`app.artikel_verwendung`), `:270-296` (Sperre), `pg/materials.ts:202-239` | hält |
| M9 Ausgelaufene nicht „knapp“ | `mig/20261116060100_…:34-36`, `mig/20261118030000_…:83-88` | hält, auch in der neuen Lagerliste |
| M6 Kommissionsware bucht keinen Bestand | `mig/20261116060700_…:157-162`, `:243-264` | hält; Nebenwirkung M-11 |
| M10 Reservierung endet mit dem Haken „eingeladen“ | `mig/20261116060800_…:93`, `:300` | hält |
| M5/F5 Teilmengen, Zurückziehen, Menge ändern | `mig/20261116060300_teilmengen.sql`, `AnforderungFenster.tsx:107-109` | hält; Einheit der freien Zeile geht beim Teilen verloren (M-10) |
| M4 Storno und Teillieferung | `mig/20261116060400_…:176-292` | hält |
| M12 Wareneingang erledigt Bestellungen | `mig/20261116061000_…:99-141` | hält |
| M7 Retoure wartet auf Annahme, Höchstmenge | `mig/20261116060500_…:262-283`, `:347-405`; Rahmen mit Scheinverbrauch in `…060600_…:317` | hält |
| M8 Einheit an der Anforderung | `mig/20261116060700_…:315-347`, `einkauf.ts:140`, `:178` | hält nur für Katalogartikel durchgehend (M-10) |
| M3/F10 Verbrauch am Schein | `mig/20261116060600_…`, `WorkSheetsListView.tsx:1577` | gebaut, aber nicht angeboten (M-6) |
| L3 Katalogsuche mit Index je Spalte | `mig/20261117010000_katalogsuche_index.sql:53-58` | hält |
| K7 Support „Nur ansehen“ sieht die Listen | `mig/20261116074100_…` gegen `mig/20261118030000_…:56`, `mig/20261118032000_…:39` | **hält nicht** für Lager und Anforderungen „Laufend“ (M-1) |
| §111 `lager_liste`: Regeln wie im Browser | Funktion ganz gelesen gegen `lager_frei` und `istKnapp` | hält (Suche, Filter, Reihenfolge, Zahlen); Kennzahl „Reserviert“ siehe M-13 |
| §111 `anforderungen_laufend`: Rechte wie die Leseregel | `mig/20261118032000_…:50-58` gegen `mig/20261116074100_…:41-46` | hält für Betriebskonten; Support siehe M-1 |

## 7. Nicht angesehen

- `src/features/materials/KatalogImport.tsx`, `datanorm.ts` (der Leser),
  `Lieferantenvergleich.tsx`, `OffeneLieferantenartikel.tsx` und `datanorm_uebernehmen`
  außerhalb der Stelle, die den Stammartikel ändert (Blöcke, Wiederaufnahme,
  Preisübernahme, Auslaufen).
- Die Oberflächen `RetoureFenster.tsx`, `ZaehllisteView.tsx`, `Zaehllisten.tsx`,
  `LagerorteFenster.tsx`, `Bestellvorschlaege.tsx`, `VorschlagGrund.tsx`, `inventurPdf.ts`
  — nur ihre Datenbankseite.
- `materialdeckung` (Materialbereitschaft in der Planung), die Rüstliste
  (`assignments/`), `laden_umschalten`, `fahrzeug_speichern`, `lagerort_speichern`.
- Push-Meldungen der Anforderungen (`push-melden`), Datenauskunft und Löschung für die
  Materialtabellen, Auszug des Betriebs.
- `InvoicesView.tsx` und `scheinHinweise.ts` (wie die Rechnungsvorschau Ausgaben und
  Scheine abgleicht).
- Das Handbuch nur an Stichworten (Knapp, Großhändlernummer, Standardfahrer), nicht
  Abschnitt für Abschnitt gegen den Code.
- Nichts ausgeführt: keine Prüfung, kein Datenbankstapel, kein Browser. Jeder Befund ist
  vor dem Bauen mit einer Prüfung nachzustellen (rot ohne, grün mit der Änderung).
