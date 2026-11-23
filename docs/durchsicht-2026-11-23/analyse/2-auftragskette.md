# Auftragskette: Kunde → Eingang → Angebot → Baustelle — Arbeitspapier zur Durchsicht vom 23.11.2026

Stand des Codes: `main` fa6e740. Nur gelesen. Keine Tests ausgeführt, keine Datenbank, kein Browser.
„Belegt“ heißt: von der Ansicht über die Datenschicht bis zur **letzten** Fassung der Datenbankfunktion
bzw. des Auslösers verfolgt. Pfade ohne Vorsatz stehen unter `/workspace/Prototype-App-Installateure/`;
Migrationen sind mit ihrem Zeitstempel abgekürzt (`supabase/migrations/<Stempel>_….sql`).

Kürzel der Befunde: `A-…` (Auftragskette). Rollen: „Führung“ = Projektleitung, Geschäftsführung,
Administrator (`app.ist_fuehrung`, `isGF`).

---

## 1. Angesehen

**Abläufe von Anfang bis Ende**

1. **Eingang → Kunde → Angebot/Baustelle.** `EingangFormular.tsx`, `EingangView.tsx`,
   `eingang_zu_angebot` und `eingang_zu_baustelle` (`20261116042500:348–503`), Dublettenfrage
   (`gleichnamig.ts`), Ablehnen/Wieder öffnen.
2. **Angebot schreiben.** `QuotesView.tsx` (Formular, Liste, Vorbelegung aus Kunden-, Liegenschafts- und
   Baustellenakte), `angebot_speichern` (`20261116042500:58–184`), Nummer (`naechste_belegnummer`,
   `20261116051000`), Fassungen und Kopie.
3. **Versenden.** PDF (`angebotPdf.ts`), Mail (`AngebotView.tsx:860–900`, nur der Aufruf), Annahme-Link
   (`angebot_link_erzeugen`, `20261106400000`; Zustand `app.angebot_link_zustand`, `20261116045500:48`;
   Edge Function `angebot-annahme`; Kundenseite `AngebotAnnahmeSeite.tsx`).
4. **Annahme/Ablehnung.** `angebot_annehmen_mit_ziel`, `angebot_link_annehmen`,
   `angebot_annahme_zuruecknehmen` (`20261116040500`), Kern `app.angebot_annehmen_kern`
   (`20261116042500:193–256`, letzte Fassung), Wächter `angebot_fassung_pruefen` (`20261116040000:74`),
   `angebot_versand_pruefen` (`20261116041500:47`), `angebot_annahme_pruefen` (`20261116045500:26`),
   `angebot_papierkorb` (`20261106200000`).
5. **Baustelle.** `BaustellenakteView.tsx` (nach E99), `MyProjectsView.tsx` (Sicht des Monteurs),
   `baustelle_abschluss_zaehlen`/`baustelle_abschliessen` (`20261116044000`), `baustelle_verwendung`
   (`20261116040000:185`), `baustelle_umnummern` (`20261012200000`), `updateProject`
   (`src/lib/db/pg/projects.ts:172`).
6. **Kunde.** `KundenakteView.tsx`, `CustomersView.tsx` (Löschen), `src/lib/db/pg/customers.ts`,
   `kunde_umbenennen` (`20261115100000`), Zusammenführen nur in der Struktur.
7. **Liegenschaft.** Übergabe an Eingang, Angebot, Baustelle (`LiegenschaftAuswahl`,
   `LiegenschaftVorschlaege`), Listen der Akte (`src/lib/db/pg/liegenschaften.ts`).
8. **Verlauf, Papierkorb.** `ObjektVerlauf` (wo er steht, Blättern), Papierkorb nur über die Auslöser der
   Angebote und `src/lib/db/pg/quotes.ts:341–391`.

---

## 2. Befunde (belegt)

### A-1 Der Abschluss-Dialog rechnet „nicht verrechnet“ anders als der Rest der App — auf jeder Pauschal- und Einheitspreisbaustelle meldet er Scheine und Stunden als offen
- Art: Unstimmigkeit (dieselbe Regel an zwei Stellen verschieden gerechnet)
- Schwere: mittel bis hoch — trifft den Hauptweg „Angebot annehmen → Baustelle (Vorgabe Pauschal) →
  Schlussrechnung bezahlt → Abschließen“; die Führung sieht es bei praktisch jeder Baustelle aus einem
  Angebot. Kein Datenverlust, aber der geführte Abschluss verliert sein Gewicht („Trotzdem abschließen“
  wird zur Gewohnheit).
- Beleg: `20261116044000:59–64` zählt unterschriebene Scheine nur über `invoice_coverage`, `:65–68` Minuten
  nur über `is_billed = false`, ohne Abrechnungsart. Der gemeinsame Kern für „Nicht verrechnet“
  (`app.scheine_verrechnet_kern`, letzte Fassung `20261116010200:216`) kennt dagegen drei Regeln: auf einer
  gültigen Rechnung, **in einer verrechneten Pauschale** (`:254–262`) und „ohne Material, Tag schon
  abgerechnet“. Die Rechnungsansicht sagt selbst: „Stunden und Material danach sind darin enthalten“
  (`src/features/invoices/InvoicesView.tsx:1891`). `tests/supabase/baustelleAbschliessen.test.ts` hat
  keinen Fall mit Pauschale.
- Auswirkung: Bad Huber, pauschal aus AN-2026-0041, Schlussrechnung bezahlt. Die Akte bietet „Abschließen“
  als Hauptaktion an; der Dialog meldet „4 unterschriebene Scheine sind nicht verrechnet“ und „31,5 h
  Arbeitszeit sind nicht verrechnet“, je mit „Rechnung stellen“. Dort steht dann „die Pauschale ist bereits
  verrechnet“. Startseite und „Nicht verrechnet“ in den Rechnungen zeigen dieselbe Baustelle zu Recht nicht.
- Vorschlag: neue Migration, die `app.baustelle_abschluss_zaehlen` ersetzt: `unverrechnete_scheine` =
  unterschriebene Scheine der Baustelle, die `app.scheine_verrechnet_kern(betrieb, ids)` **nicht** als
  verrechnet meldet (eine Quelle); `unverrechnete_minuten` und `unverrechnetes_material` = 0, wenn die
  Baustelle „Pauschal“/„Einheitspreis“ ist und eine gültige Rechnung trägt, die weder Anzahlung noch
  Teilrechnung ist (dieselbe Bedingung wie Regel 2). Sicherheitsregeln wie bisher (`security definer`,
  `search_path = ''`, kein `grant`, nur über die beiden öffentlichen Funktionen erreichbar).
  Prüfung: `baustelleAbschliessen.test.ts` + Fall „Pauschalbaustelle mit Schlussrechnung: 0 Scheine, 0
  Minuten“ (Gegenprobe: ohne Migration rot), + „bleibt gleich: Regiebaustelle zählt wie bisher“ und
  „Pauschale nur mit Anzahlung zählt weiter“.
  Gleich bleiben muss: Rückgabeform (`AbschlussLage`), `null` statt 0 für Rollen ohne Einblick in
  Rechnungen, das Anhalten bei kommenden Einsätzen.
  Risiko des Umbaus: zu großzügig rechnen (eine Regiebaustelle gälte als verrechnet) — deshalb der
  „bleibt gleich“-Fall; der Kern sperrt die Rechnungen nicht, die Lage ist nur eine Anzeige.
- Aufwand: klein

### A-2 Baustellen- und Kundenakte speichern den ganzen Entwurf über einen veralteten Stand — ein inzwischen angenommener Nachtrag, ein Abschluss oder eine Rücknahme wird still überschrieben
- Art: Fehler (Wettlauf zweier Nutzer bzw. Nutzer gegen Kunde über den Link)
- Schwere: mittel — selten, aber die Folge ist eine falsche Zahl ohne Meldung (Stundenbudget, Status,
  Team); seit dem Nachtrag (A3) schreibt auch der Kunde über den Link in die Baustelle.
- Beleg: Die Akte lädt die Baustelle einmal und nach eigenen Handgriffen
  (`src/features/projects/BaustellenakteView.tsx:180–199`, kein Abo), der Entwurf folgt nur diesem Stand
  (`:341–343`). „Speichern“ schickt **alle** Felder (`:421–454`: `status`, `estimatedHours`,
  `assignedEmployees`, `projectManagers`, `billingMode` …) über `updateProject`
  (`src/lib/db/pg/projects.ts:172–182`) → `aendern` (`src/lib/db/pg/kern.ts:564`, ein `update … eq id`
  ohne Standprüfung). Dieselben Spalten schreibt die Datenbank selbst: Nachtrag `estimated_hours` und
  „Abgeschlossen → Aktiv“ (`20261116042500:220–225`), Rücknahme (`20261116040500:234–245`), Abschließen
  (`20261116044000`). Kundenakte gleich: `KundenakteView.tsx:248–250, 280` (ganzer Entwurf samt `active`,
  `notes`).
- Auswirkung: Die Projektleiterin hat die Akte PR-2026-0112 seit dem Morgen offen (Budget 40 h). Mittags
  nimmt der Kunde den Nachtrag AN-2026-0188 über den Link an: Budget 52 h, im Journal „Kunde über Link“.
  Um 15 Uhr trägt sie in der offenen Akte ein Enddatum ein und speichert — Budget wieder 40 h. Das Angebot
  bleibt „Nachtrag“; die Ampel misst gegen 40 h, eine spätere Rücknahme zöge noch einmal 12 h ab. Ebenso:
  Kollege schließt die Baustelle ab, die offene Akte setzt sie beim nächsten Speichern wieder „Aktiv“.
- Vorschlag (einfachste vollständige Lösung): beide Akten schicken **nur geänderte Felder** — Vergleich
  `entwurf` gegen `alsEntwurf(daten)` je Feld, wie es für Liegenschaft/Top schon geschieht (`:451–453`). Eine kleine gemeinsame Hilfsfunktion `nurGeaendert(entwurf, geladen)` in
  `src/features/projects/baustellenEntwurf.ts` bzw. für den Kunden daneben. Zusätzlich lädt die Akte beim
  Öffnen von „Bearbeiten“ den Kopf frisch und übernimmt ihn, solange nichts getippt ist (das Muster
  „Inzwischen geändert — übernehmen?“ aus P1, `useInhaltUebernehmen.ts`, falls schon etwas getippt ist).
  Keine Migration.
  Prüfung: `BaustellenakteView.test.tsx` „schickt nur das geänderte Feld“ (Gegenprobe: heute steht
  `estimatedHours` im Aufruf — rot) und „bleibt gleich: ein geleertes Budget geht als `null`“,
  „Nummernwechsel plus Feld“; `KundenakteView.test.tsx` entsprechend, dort „bleibt gleich: Name geändert →
  `kunde_umbenennen` mit den übrigen geänderten Feldern“.
  Gleich bleiben muss: `null` für geleerte Felder, der Weg über `baustelle_umnummern`, die Meldung „n
  Baustellen nachgezogen“, die Warnung bei ungespeicherten Änderungen.
  Risiko: ein Feld, das der Vergleich für „gleich“ hält, wird nicht mehr gespeichert (leer gegen
  `undefined`, Reihenfolge in Listen) — der Vergleich muss derselbe sein, der `geaendert` schon berechnet.
- Aufwand: mittel

### A-3 Ein Nachtrag behält seine Baustelle, wenn im Formular der Kunde gewechselt wird — über den Annahme-Link landet das Angebot dann an der Baustelle eines anderen Kunden
- Art: Fehler
- Schwere: mittel — selten (Kundenwechsel in einem Nachtrags-Formular), dann aber falsches Budget an einer
  fremden Baustelle und ein Angebot von Kunde B in der Akte und der Pauschalrechnung von Kunde A.
- Beleg: `src/features/quotes/QuotesView.tsx:1176–1183` (Kundenwechsel fasst `nachtragZu` nicht an),
  `:1247–1255` (die Suche filtert nach Kunde, der gewählte Wert bleibt), `:835`, `:881` (gespeichert wird
  `projectNumber`). `angebot_speichern` prüft die Baustelle nicht gegen den Kunden
  (`20261116042500:88–105, 153`). Der Kern hängt an, sobald `project_number` auf eine Baustelle zeigt
  (`:210–226`), ohne Kundenvergleich; den macht nur `angebot_annehmen_mit_ziel` und nur, wenn eine
  Baustelle mitgeschickt wird (`20261116040500:144–153`). Der Link (`angebot_link_annehmen`, `:328`) und
  der alte Weg `angebot_annehmen` rufen den Kern direkt; `tests/supabase/nachtrag.test.ts:78–96` hält
  genau das fest, `:106–112` prüft den Kunden nur für `mit_ziel`.
- Auswirkung: „Nachtrag anlegen“ in der Akte der Hausverwaltung Nord; der Auftrag kommt aber vom Mieter,
  der Kunde wird auf „Familie Berger“ geändert. Gespeichert, Annahme-Link verschickt. Berger unterschreibt:
  das Budget der Baustelle der Hausverwaltung wächst, das Angebot steht dort als Nachtrag, die
  Pauschalrechnung an die Hausverwaltung übernimmt Bergers Positionen. Intern angenommen käme die
  richtige Meldung „… nur an eine Baustelle desselben Kunden“.
- Vorschlag: (1) Datenbank, eine Stelle für alle Wege: der Kundenvergleich wandert in
  `app.angebot_annehmen_kern` (wenn die Baustelle besteht und beide einen Kunden haben und sie sich
  unterscheiden → dieselbe Meldung, `22023`); `angebot_link_zustand` meldet einen solchen Link als
  „gegenstandslos“, damit der Kunde keine Fehlermeldung sieht, und `angebot_link_erzeugen` weist ihn mit
  dem Grund ab. (2) Formular: beim Kundenwechsel `nachtragZu` lösen, wenn die Baustelle nicht dem neuen
  Kunden gehört, mit einem Satz („Nachtrag gelöst — PR-… gehört zu …“).
  Prüfung: `nachtrag.test.ts` + „fremder Kunde über Link und über `angebot_annehmen`: abgewiesen, Budget
  unverändert“ (Gegenprobe ohne Migration rot); `QuotesView.test.tsx` „Kundenwechsel löst den Nachtrag“;
  „bleibt gleich: derselbe Kunde hängt über Link und alten Weg an“ (bestehender Test `:78`).
  Gleich bleiben muss: Baustelle oder Angebot ohne Kundenkennung (Altdaten) hängen weiter an; Signaturen
  und Rechte der Funktionen.
  Risiko: nach „Kunden zusammenführen“ tragen beide dieselbe Kennung — kein Problem; Altangebote mit
  falscher Zuordnung ließen sich nach der Änderung nicht mehr annehmen, die Meldung nennt dann den Weg
  (Zuordnung im Entwurf lösen bzw. neue Fassung).
- Aufwand: klein

### A-4 Pauschalrechnung und Baustellenakte lesen höchstens 20 Angebote je Baustelle, ohne Reihenfolge — ab dem 21. kann ein angenommener Nachtrag in der Rechnung fehlen
- Art: Grenze (unbenannt) mit falschem Ergebnis
- Schwere: mittel — betrifft Baustellen mit vielen Nachträgen und Fassungen (Rahmen- oder
  Jahresbaustelle einer Hausverwaltung); dann fehlt Geld auf der Rechnung, ohne Hinweis.
- Beleg: `src/lib/db/pg/quotes.ts:263–269` (`listQuotesForProject`: `grenze: 20`, keine Sortierung, alle
  Stände außer „Verworfen“ — auch „Ersetzt“, „Abgelehnt“, Entwürfe von Nachträgen zählen mit). Aufrufer:
  `src/features/invoices/InvoicesView.tsx:1701` und `:1883` → `pauschalAngebot(angebote)` (`:1719`,
  `:1895`; `src/features/invoices/pauschale.ts:50–54, 71` nimmt daraus die angenommenen samt Nachträgen);
  `src/features/projects/BaustellenakteView.tsx:297` (Karte „Angebote“). Seit A3 ist „viele Angebote an
  einer Baustelle“ ein vorgesehener Fall. Ebenso `listFassungen` (`quotes.ts:248–254`, 20, ungeordnet).
- Auswirkung: Wartungs- und Reparaturbaustelle „Wohnanlage Lindenhof 2026“, 9 Nachträge mit je zwei bis
  drei Fassungen = 24 Angebote. Die Datenbank liefert irgendwelche 20; fehlt darunter ein angenommener
  Nachtrag über 1.840 €, ist die Schlussrechnung um diesen Betrag zu niedrig. Die Akte zeigt ihn auch nicht.
- Vorschlag: zwei Abfragen statt einer: `listAngenommeneFuerProjekt(companyId, projectId)` mit Bedingung
  `status = 'Angenommen'`, **ohne** Grenze (`abfragen` blättert), sortiert nach `angenommen_am`, für die
  Rechnung; die Akte lädt geordnet (jüngste zuerst) seitenweise mit Zähler („und n weitere“), wie die
  Kundenakte seit A12. `listFassungen` geordnet nach `createdAt`.
  Prüfung: neuer Datenbanktest „25 Angebote, das angenommene ist das älteste →
  Pauschale enthält es“ (Gegenprobe: mit `grenze: 20` ohne Sortierung nicht verlässlich — deshalb zusätzlich
  Unit-Test an der Datenschicht „kein `limit` in der Abfrage der angenommenen“, wie `abfragegrenzen.test.ts`);
  „bleibt gleich: ein Angebot + ein Nachtrag ergeben dieselben Positionen und Summen wie heute“
  (`pauschale.test.ts`).
  Gleich bleiben muss: Reihenfolge Hauptangebot vor Nachträgen in der Rechnung, Rundung über `cent()`.
  Risiko: gering; die Nachkalkulation nutzt schon die Fassung ohne Grenze (`listQuotesForProjects`).
- Aufwand: klein

### A-5 Der Empfänger eines versendeten Angebots wird nicht festgehalten — Nachdruck, Mail-Kopie und Belegarchiv zeigen den heutigen Namen, die heutige Anschrift und UID des Kunden
- Art: Unstimmigkeit / gebrochene Zusage („ein versendetes Angebot bleibt, wie es beim Kunden liegt“)
- Schwere: mittel — fällt nach Umzug, Umbenennung oder „Kunden zusammenführen“ auf; das Belegarchiv
  liefert dann ein anderes Dokument als das versendete, und Büro-PDF und Kundenseite widersprechen sich.
- Beleg: `src/features/quotes/angebotPdf.ts:69–75` (`o.kunde?.address || q.address`,
  `o.kunde?.name || q.customerName`, `uid: o.kunde?.vatId`); Aufrufer mit dem **heutigen** Kunden:
  `src/features/quotes/AngebotView.tsx:374` und `:880`, `src/features/invoices/belegArchiv.ts:247–252`.
  Festgehalten sind dagegen die Firmendaten (`aussteller_stand`) und — nur im Annahme-Link — der Kunde
  (`20261106400000:539–540`, Schnappschuss `kunde`), den die Kundenseite druckt
  (`AngebotAnnahmeSeite.tsx:181, 190`). Das Zusammenführen sagt zu „Belegtext bleibt eingefroren“
  (Stand §108) — beim Angebot gilt das für die Zeile, nicht für das PDF.
- Auswirkung: AN-2026-0030 ging im März an „Huber Haustechnik, Linzer Straße 4“. Im Oktober wird die
  Dublette mit „Huber GmbH, Hauptplatz 1“ zusammengeführt. Das Belegarchiv 2026 und „Per Mail senden …“
  am angenommenen Angebot drucken jetzt „Huber GmbH, Hauptplatz 1“; die Kundenseite des Links zeigt weiter
  die Linzer Straße.
- Vorschlag: Spalte `quotes.empfaenger_stand jsonb` (Name, Anschrift, UID), gesetzt im Auslöser
  `app.aussteller_angebot` an genau den Stellen, an denen `aussteller_stand` entsteht (Versand, erste
  Entscheidung), geleert bei „zurück in den Entwurf“; Schreiben von außen abgewiesen wie beim
  Ausstellerstand. `buildAngebotPdf` nimmt bei jedem Stand außer „Entwurf“ den festgehaltenen Empfänger,
  sonst den heutigen. Personenlöschung und `journal_kunde_vergessen` leeren die Spalte mit (Art. 17 DSGVO),
  Datenauskunft nennt sie; `spaltentypen.ts` und Journal-Ausnahmeliste ergänzen.
  **Altdaten (Grund nach Grundsatz 6):** bestehende versendete Angebote haben keinen Stand; sie drucken
  wie bisher mit dem heutigen Kunden, nichts wird umgeschrieben — als Grenze benennen.
  Prüfung: Datenbanktest „Versand hält den Empfänger fest; Umbenennen/Zusammenführen ändert ihn nicht“
  (Gegenprobe ohne Migration rot), `angebotPdf.test.ts` „versendet druckt den Stand, Entwurf den heutigen
  Kunden“, „bleibt gleich: Angebot ohne Stand druckt wie bisher“.
  Risiko: der Auslöser läuft bei jedem Statuswechsel — Rücknahme der Annahme und Dienstschlüssel müssen
  wie beim Ausstellerstand ausgenommen bleiben (bestehende Prüfungen `annahmeZuruecknehmen.test.ts`).
- Aufwand: mittel

### A-6 Der geführte Abschluss kennt offene Angebote und kommende Termine der Baustelle nicht — ein später angenommener Nachtrag öffnet die abgeschlossene Baustelle still wieder
- Art: Lücke
- Schwere: mittel — die Baustelle gilt als erledigt, ein versendeter Nachtrag (womöglich mit offenem
  Annahme-Link) lebt weiter; nimmt der Kunde an, ist sie wieder „Aktiv“, ohne dass jemand es anstieß.
  Ein Termin (Abnahme, Besichtigung) bleibt im Plan der Teilnehmer.
- Beleg: `20261116044000:38–75` zählt Einsätze, Schein-Entwürfe, Anforderungen, Unverrechnetes, offene
  Rechnungen — weder `quotes` (Entwurf/Versendet mit `project_id`) noch `termine` (`project_id`,
  `datum >= heute`; `20261004300000:18–23`). `src/features/projects/abschlussPunkte.ts` hat entsprechend
  keinen Punkt. Wiederöffnen durch die Annahme: `20261116042500:224`.
- Auswirkung: PR-2026-0077 wird nach der Schlussrechnung abgeschlossen. Der Nachtrag „Zusatzheizkörper“
  liegt seit drei Wochen beim Kunden. Er unterschreibt über den Link: die Baustelle ist wieder aktiv und
  erscheint in allen Auswahlfeldern; die Führung erfährt nur „Über Link angenommen“.
- Vorschlag: `baustelle_abschluss_zaehlen` um `offene_angebote` (Zahl und Nummern, getrennt nach Entwurf
  und versendet, mit `link_offen`) und `kommende_termine` (Zahl, nächster Tag) erweitern; zwei neue Punkte
  in `abschlussPunkte.ts` mit Weg („Zum Angebot“, „Termine der Baustelle“). Kein Anhalten — es bleibt bei
  „Trotzdem abschließen“; der Satz zum Angebot sagt, dass eine Annahme die Baustelle wieder öffnet.
  Prüfung: `baustelleAbschliessen.test.ts` + zwei Fälle (Gegenprobe ohne Migration: Schlüssel fehlen),
  `abschlussPunkte.test.ts`; „bleibt gleich: ohne Angebote und Termine dieselbe Lage wie heute“.
  Gleich bleiben muss: Rollenregel (Angebote zählt nur, wer sie lesen darf — sonst `null`), Form der Lage.
  Risiko: gering (nur Anzeige).
- Aufwand: klein

### A-7 Ein Nachlass auf die Angebotssumme lässt sich nicht eingeben — und ein geerbter nicht ändern oder entfernen
- Art: Lücke (halbfertige Funktion: Datenmodell, Summenrechnung, PDF und Rechnung kennen ihn, das Formular nicht)
- Schwere: mittel — „abzüglich 3 % Nachlass“ oder ein runder Abschlag ist im Angebotsalltag üblich; heute
  nur als Rabatt je Position (`QuotesView.tsx:1384`), und nur in Prozent.
- Beleg: `src/features/quotes/QuotesView.tsx:373, 522` (der Rabatt kommt ausschließlich aus dem bearbeiteten
  Angebot oder der Vorlage, `:681`), kein Feld im Formular; gespeichert wird er trotzdem (`:828`, `:872`).
  Die Rechnung hat das Feld (`src/features/invoices/InvoicesView.tsx:795, 5233–5241`: Prozent oder Betrag,
  mit Bezeichnung).
- Auswirkung: Der Chef sagt am Telefon 3 % Nachlass zu. Im Angebot muss er jede der 18 Positionen einzeln
  rabattieren; ein Pauschalabschlag von 200 € geht gar nicht. Trägt ein altes Angebot einen Gesamtrabatt,
  übernimmt ihn jede neue Fassung und Kopie — im Formular ist er weder zu sehen noch zu löschen.
- Vorschlag: das Rabattfeld der Rechnung als gemeinsamen Baustein (`Gesamtnachlass`: Art, Wert,
  Bezeichnung) herausziehen und im Angebotsformular unter den Positionen einsetzen; `rabatt` wird
  Formularzustand (Vorbelegung aus Entwurf bzw. Vorlage wie heute). Keine Migration (`discount_mode/
  _value/_label/_amount` gibt es, `angebot_speichern` schreibt sie).
  Prüfung: `QuotesView.test.tsx` „3 % Nachlass: Summen wie `calcTotals`, gespeichert mit Bezeichnung“,
  „Nachlass einer Vorlage lässt sich entfernen“ (Gegenprobe: heute kein Feld — rot); „bleibt gleich: ohne
  Nachlass dieselben Summen; Rechnung nach Angebot übernimmt den Nachlass wie bisher“ (`pauschale.test.ts`).
  Risiko: die Rechnung darf beim Herausziehen des Bausteins ihr Verhalten nicht ändern — bestehende
  `InvoicesView`-Prüfungen zum Rabatt müssen unverändert grün bleiben.
- Aufwand: mittel

### A-8 Das Angebots-PDF hat feste Texte und keine Zahlungs- und Ausführungsbedingungen — Annahme über „den“ Betrieb
- Art: Grenze (unbenannt) / Lücke
- Schwere: mittel — jeder Betrieb will Einleitung, Schlusssatz, Zahlungsbedingungen (Anzahlung,
  Zahlungsziel, Skonto), Ausführungszeitraum und den Verweis auf seine AGB selbst bestimmen; heute bleibt
  nur das Feld „Anmerkungen“ je Angebot, jedes Mal neu getippt.
- Beleg: `src/features/quotes/angebotPdf.ts:90` („Vielen Dank für Ihre Anfrage. Wir bieten Ihnen folgende
  Leistungen an:“) und `:123–126` („Dieses Angebot ist gültig bis … Wir freuen uns auf Ihren Auftrag.“)
  stehen fest im Code; keine Einstellung des Betriebs dazu. Für Rechnungen gibt es Zahlungsziel und Skonto
  je Betrieb.
- Auswirkung: Ein Betrieb, der 30 % Anzahlung bei Auftrag verlangt, schreibt das in jedes Angebot von
  Hand in die Anmerkungen; vergisst er es, steht es nicht im angenommenen Angebot.
- Vorschlag: Einstellungen → Belege: „Angebot: Einleitung“, „Angebot: Schlusstext“ (je Betrieb, mit den
  heutigen Sätzen als Vorgabe, Platzhalter `{gueltig_bis}`), dazu je Angebot ein Feld „Bedingungen“
  (vorbelegt aus dem Betrieb, im Entwurf änderbar, mit dem Versand festgehalten wie die Positionen und
  Teil des Link-Schnappschusses). Migration: zwei Spalten an `companies` (in `aussteller_stand`
  aufnehmen), eine an `quotes` (in `angebot_speichern`, Inhaltsvergleich „nur der Entwurf“, 
  `app.angebot_link_inhalt`). Altdaten: leer = die heutigen festen Sätze.
  Prüfung: `angebotPdf.test.ts` (Text aus der Einstellung; Gegenprobe rot), „bleibt gleich: ohne
  Einstellung druckt das PDF wortgleich wie heute“ (Textvergleich), Datenbanktest „Bedingungen eines
  versendeten Angebots ändern sich nicht mit der Einstellung“.
  Risiko: der Link-Schnappschuss ändert seine Form — offene Links dürfen dadurch nicht „geändert“ melden;
  das neue Feld nur vergleichen, wenn es im Schnappschuss steht.
- Aufwand: mittel

### A-9 Die Annahmeseite hat keinen Platz für AGB und Rücktrittsbelehrung — unbenannte Grenze mit rechtlichem Gewicht
- Art: Grenze (unbenannt)
- Schwere: mittel — die Annahme über den Link ist gegenüber Verbrauchern ein Vertragsabschluss im
  Fernabsatz. Ob und welche Belehrung nötig ist, entscheidet der Betrieb mit seiner Rechtsberatung; die
  Software gibt ihm heute keine Stelle, an der der Text stünde und mit der Annahme nachweisbar wäre.
- Beleg: `src/features/angebotAnnahme/AngebotAnnahmeSeite.tsx` zeigt Angebot, Bestätigung „verbindlich
  annehmen“, Name, Unterschrift, PDF (`:225`, `:424`) — kein Rechtstext; der Schnappschuss
  (`app.angebot_link_schnappschuss`, `20261106400000`) enthält keinen. In
  `docs/grenzen-durchsicht-2026-10-24.md:92–95` stehen zur Annahme per Link nur QR-Code, Rate-Limit,
  Öffnungszählung und Versand. Das Vorgängerpapier führte es als Verdacht V4; benannt wurde es nicht.
- Auswirkung: Eine Privatkundin nimmt das Bad-Angebot am Handy an. Im Streit kann der Betrieb nicht
  zeigen, welche Bedingungen ihr dabei vorlagen.
- Vorschlag: zusammen mit A-8: der Text „Bedingungen/Rechtliche Hinweise zur Annahme“ (je Betrieb,
  freier Text) wird Teil des Schnappschusses, steht auf der Annahmeseite über der Bestätigung und im PDF,
  und ist damit von der Prüfsumme gedeckt. Die Software liefert **keinen** Mustertext (Grund: liegt bei
  jemand anderem — Rechtsberatung des Betriebs); das wird in der Grenzen-Übersicht und im Handbuch so
  benannt, mit dem Hinweis in den Einstellungen des Moduls „Annahme per Link“.
  Prüfung: `angebotLink.test.ts` „Schnappschuss enthält den Text, Prüfsumme deckt ihn“ (Gegenprobe rot),
  `AngebotAnnahmeSeite.test.tsx`; „bleibt gleich: ohne Text sieht die Seite aus wie heute, alte Links
  bleiben gültig“.
  Risiko: wie A-8 (Form des Schnappschusses).
- Aufwand: klein (auf A-8 aufbauend)

### A-10 Was angeboten wurde, erreicht den Monteur nicht — die Baustelle erbt nur die Anmerkungen, nicht die Positionen
- Art: Lücke (Daten, die schon da sind, müssen neu getippt werden)
- Schwere: mittel — vor Ort ist die häufigste Frage „was ist vereinbart?“; die Positionen (ohne Preise)
  sind genau die Antwort.
- Beleg: Die Annahme schreibt in die Beschreibung der Baustelle nur `notes` + „Aus Angebot …“
  (`20261116042500:242`). Angebote liest nur Führung und Buchhaltung (`quotes_lesen`,
  `20261009200000:313–314`). `src/features/projects/MyProjectsView.tsx:211–214` zeigt dem Monteur die
  Beschreibung („der Auftragsumfang aus dem Angebot ist oft eine Liste“ — die Liste entsteht aber nur,
  wenn das Büro sie in die Anmerkungen tippt).
- Auswirkung: Angebot mit 14 Positionen (WC, Waschtisch, Duschwand …) wird angenommen. Der Monteur sieht in
  „Meine Baustellen“ „Aus Angebot AN-2026-0102“ und sonst nichts; das Büro druckt das PDF aus oder tippt
  den Umfang in die Beschreibung.
- Vorschlag: Datenbankfunktion `baustelle_leistungsumfang(p_projekt uuid)` (`security definer`,
  `search_path = ''`, `revoke … from public, anon`, `grant execute … to authenticated`): gibt für die
  angenommenen Angebote der Baustelle (Hauptangebot und Nachträge) Art, Bezeichnung, Menge, Einheit zurück
  — **keine Preise, keine Summen** —, nur wenn der Aufrufer die Baustelle selbst lesen darf (dieselbe
  Bedingung wie die Zeilenregel von `projects`, als `(select …)`). Anzeige als aufklappbarer Abschnitt
  „Vereinbarter Umfang“ in `MyProjectsView`, in der Baustellenakte (dort mit Verweis aufs Angebot) und als
  Vorschlagsquelle im Handwerksschein. In `LESENDE_FUNKTIONEN` und Mandantenprüfung eintragen.
  Prüfung: Datenbanktest „eingeteilter Monteur liest Positionen ohne Preis; fremder Monteur und fremder
  Betrieb nichts; Entwurf und abgelehnte Fassung nicht“ (Gegenprobe: ohne Migration fehlt die Funktion),
  „bleibt gleich: `quotes`/`quote_lines` bleiben für Monteure unlesbar“ (bestehende Rechteprüfung).
  Risiko: Preisangaben in der Bezeichnung einer Textzeile wären sichtbar — Textzeilen (`art = 'text'`)
  deshalb nur für die Führung oder gar nicht ausgeben (Entscheidung nötig; Vorschlag: nicht ausgeben).
- Aufwand: mittel

### A-11 Die Vorschläge aus der Liegenschaft gibt es nur in „Neue Baustelle“ — Eingang und Angebot, die Einstiege der Kette, übernehmen nur die Anschrift
- Art: Lücke (fehlende Verknüpfung)
- Schwere: mittel für Betriebe mit Hausverwaltungen (Modul Liegenschaften an): Kunde und Mieter stehen an
  der Liegenschaft und werden im Eingang trotzdem gesucht und getippt.
- Beleg: `src/features/liegenschaften/LiegenschaftVorschlaege.tsx:9–18` (Kunde aus den Beteiligten,
  Ansprechpartner aus Nutzer/Mieter des Tops, Adresse) wird nur in
  `src/features/projects/AdminProjectsView.tsx:786` verwendet. `EingangFormular.tsx:257–266` und
  `QuotesView.tsx:1187–1198` setzen aus der Liegenschaft nur den Ort, und nur in ein leeres Feld; die
  Baustellenakte (`BaustellenakteView.tsx:953–960`) setzt gar nichts.
- Auswirkung: Die Hausverwaltung meldet einen Rohrbruch in Top 7. Im Eingang wählt das Büro die
  Liegenschaft und das Top — Kunde (Hausverwaltung) und „Ansprechpartner vor Ort“ (die Mieterin samt
  Telefon, am Top hinterlegt) bleiben leer und werden von Hand eingetragen.
- Vorschlag: `LiegenschaftVorschlaege` unverändert in `EingangFormular` und im Angebotsformular unter die
  Auswahl setzen (dieselben drei Vorschläge, jeder erst mit „Übernehmen“). Keine Datenbankänderung.
  Prüfung: `EingangFormular.test.tsx`/`QuotesView.test.tsx` „Top gewählt → Vorschlag Mieter, Übernehmen
  füllt Ansprechpartner“ (Gegenprobe rot), „bleibt gleich: ohne Modul keine Vorschläge; nichts wird ohne
  ‚Übernehmen‘ überschrieben“.
  Risiko: die Verwaltung liest Beteiligte nur, soweit ihre Rechte reichen — der Baustein muss bei
  fehlendem Leserecht leer bleiben statt einen Fehler zu zeigen (heute so in `AdminProjectsView` prüfen).
- Aufwand: klein

### A-12 Nach „Angenommen“ zeigt die Angebotsakte keinen nächsten Schritt; aus dem Eingang landet man auf der Akte statt im Formular
- Art: Lücke (fehlender nächster Schritt)
- Schwere: niedrig bis mittel — jeder Auftrag geht hier durch; es kostet je Vorgang ein bis zwei Wege.
- Beleg: `src/features/quotes/AngebotView.tsx:479` und `:510` (für „Angenommen“ keine Schritte),
  `:576–581` (im Verlauf nur der Text „Baustelle PR-…“, nicht einmal als Verweis; der steht weiter unten
  unter „Angaben“, `:666–676`). `src/features/auftragseingang/EingangView.tsx:546–547`: nach „Angebot
  anlegen“ `navigate('/quotes/<id>')` — das Angebot ist leer, der einzige sinnvolle Schritt ist
  „Bearbeiten“. Die Meldung nach der Annahme trägt den Schritt (V4), die Akte danach nicht mehr.
- Auswirkung: Wer das angenommene Angebot am nächsten Tag öffnet (etwa aus „Über Link angenommen“ auf der
  Startseite), findet keinen Weg „Einsatz planen“ oder „Anzahlung stellen“.
- Vorschlag: am Punkt „Angenommen“ zwei Schritte nach Recht und Modul: „Zur Baustelle“ und der Schritt aus
  `naechsterSchritt.ts` („Einsatz planen“); bei Pauschal/Einheitspreis im ⋯ zusätzlich „Anzahlung stellen“
  (`/invoices?neu=<nummer>`). Aus dem Eingang direkt ins Formular: `navigate('/quotes?bearbeiten=<id>')`
  (der Parameter öffnet einen Entwurf schon heute, `QuotesView.tsx:696–738`).
  Prüfung: `AngebotView.test.tsx` „angenommen: Zur Baustelle und Einsatz planen“ (Gegenprobe rot),
  `EingangView.test.tsx` Ziel der Navigation; „bleibt gleich: ohne Recht auf Baustellen kein Verweis“,
  Funktionsinventar begründet anpassen.
  Risiko: gering.
- Aufwand: klein

### A-13 Angebote schreibt nur die Führung; die Verwaltung sieht sie nicht einmal — eine Annahme über „den“ Betrieb, nirgends als Grenze begründet
- Art: Grenze (unbenannt, Annahme über die Rollen im Betrieb)
- Schwere: mittel für Betriebe, in denen die Bürokraft die Angebote schreibt und der Chef nur freigibt;
  dort bleibt nur, ihr die Rolle „Projektleiter“ zu geben — mit allen übrigen Rechten.
- Beleg: `src/app/navigation.ts:170` (`roles: ['Buchhaltung', ...LEAD]`), `quotes_schreiben` und
  `quote_lines_schreiben` nur `app.ist_fuehrung()` (`20261009200000:309–318`), `darfEingangUmwandeln`
  (`src/lib/permissions.ts:103`). Für Kunden gibt es das Gegenstück schon: das Zusatzrecht `kundenPflegen`
  je Person (`permissions.ts:207–209`, `app.darf_kunden_pflegen()`). Die Grenzen-Übersicht nennt nur eine
  Folge (`:329–332`, „die Verwaltung liest keine Angebote“), nicht die Regel und ihren Grund.
- Auswirkung: In einem Sechs-Personen-Betrieb nimmt die Verwaltung die Anfrage auf (Eingang darf sie),
  kann daraus aber weder ein Angebot machen noch den Entwurf vorbereiten.
- Vorschlag (Entscheidung des Auftraggebers nötig, deshalb als Vorschlag mit Vorbehalt): Zusatzrecht
  „Angebote schreiben“ je Person für Verwaltung und Buchhaltung, nach dem Muster `kundenPflegen`:
  Spalte an `users`, Funktion `app.darf_angebote_schreiben()` (`security definer`, `search_path = ''`),
  Regeln von `quotes`/`quote_lines` und `eingang_zu_angebot`/`naechste_nummer('quotes')` darauf umstellen
  (in den Regeln als `(select …)`), Navigation und `darfAendern` in Liste und Akte. **Annehmen, Annahme
  zurücknehmen und der Annahme-Link bleiben bei der Führung** (sie legen Baustellen an).
  Mindestens: die Regel mit Grund in der Grenzen-Übersicht benennen.
  Prüfung: `mandantenTrennung`/Rechtematrix + „Verwaltung mit Recht schreibt Entwurf, ohne Recht nicht,
  nimmt nie an“ (Gegenprobe ohne Migration rot); „bleibt gleich: Führung wie bisher, Monteur nichts“,
  `leseregelnGleichwertig.test.ts`.
  Risiko: Rechteänderung an Geld-nahen Tabellen — nur mit vollständiger Rollenmatrix bauen.
- Aufwand: mittel

### A-14 Die Datenbank lässt „Angenommen“ auch ohne die Rücknahme verlassen und die Baustelle eines versendeten Angebots umhängen
- Art: fehlende Prüfung an riskanter Stelle
- Schwere: niedrig — die Oberfläche bietet es nicht an; erreichbar über die Schnittstelle (alte App,
  künftiger Umbau). Dann stünde eine Baustelle mit Budget ohne angenommenes Angebot da, ohne Grund im
  Verlauf.
- Beleg: `angebot_speichern` vergleicht bei einem Nicht-Entwurf nur Inhaltsspalten
  (`20261116042500:116–132`) und schreibt `status` und `project_number` ungeprüft (`:141, 153`).
  `angebot_fassung_pruefen` (`20261116040000:82–107`) hält nur „Ersetzt → offen“ und eine zweite Annahme
  auf, `angebot_versand_pruefen` (`20261116041500:55–102`) kennt „Angenommen“ als Ausgangsstand nicht.
  „Angenommen → Entwurf“ über `updateQuote(id, { status: 'Entwurf' })` geht damit durch; der Entwurf ließe
  sich danach ändern, verwerfen und löschen.
- Vorschlag: in `app.angebot_versand_pruefen`: `old.status = 'Angenommen'` und `new.status <> 'Angenommen'`
  nur mit `app.annahme_zurueck = 'ja'` (sonst `55000`, „Eine Annahme nimmt ‚Annahme zurücknehmen‘ zurück“);
  in `angebot_speichern`: `project_number` eines Angebots, das nicht Entwurf oder versendet ist, bleibt.
  Prüfung: `angebotVersandPruefen.test.ts` + zwei Fälle (Gegenprobe rot); „bleibt gleich: Rücknahme,
  Dienstschlüssel (Rücklauf einer Sicherung), `baustelle_umnummern` zieht die Nummer weiter nach“.
  Risiko: `baustelle_umnummern` schreibt `quotes.project_number` direkt, nicht über `angebot_speichern` —
  bleibt unberührt; vor dem Bau prüfen, dass kein Ablauf der App den Status aus „Angenommen“ direkt setzt
  (gefunden habe ich keinen).
- Aufwand: klein

### A-15 Die Dublettenfrage sucht den gleichen Namen in den ersten 50 Treffern einer Suche über fünf Spalten
- Art: Fehler (Randfall, im Vorgängerpapier Verdacht V3 — jetzt am Code bestätigt, nicht nachgestellt)
- Schwere: niedrig — nur bei großem Kundenstamm und häufigem Namen; dann bleibt die Rückfrage aus und es
  entsteht eine Dublette (die sich seit F9 zusammenführen lässt).
- Beleg: `src/features/customers/gleichnamig.ts:20–22` (`searchCustomers(companyId, name, 50)`, danach
  Filter auf den genauen Namen); `src/lib/db/pg/customers.ts:293–301` sucht in Name, Adresse,
  Ansprechpartner, Telefon und E-Mail, sortiert nach Name, Grenze 50. Eine genaue Abfrage gibt es:
  `kundenNachNamen` (`customers.ts:55`).
- Auswirkung: 2.400 Kunden; „Mayer“ trifft auch „Mayerhofgasse“ und „…@mayer.at“. Stehen 50 Treffer im
  Alphabet vor „Mayer“, meldet die Prüfung „keinen gleichnamigen“.
- Vorschlag: `gleichnamigeKunden` fragt `kundenNachNamen(companyId, [name])` und filtert wie bisher.
  Prüfung: Unit-Test mit 60 Treffern vor dem gleichnamigen (Gegenprobe rot); „bleibt gleich: Groß-/
  Kleinschreibung und Leerraum wie `schluessel`“.
- Aufwand: klein

### A-16 Die Startseite kennt offene Angebote nicht — weder die ablaufende Bindefrist noch den Entwurf, der aus einem Eingang entstand und liegen blieb
- Art: Lücke
- Schwere: niedrig bis mittel — Nachfassen ist der Schritt, der Aufträge bringt; heute muss jemand die
  Angebotsliste öffnen. Ein Eingang gilt mit „Angebot anlegen“ als übernommen und verschwindet aus
  „offen“, obwohl das Angebot noch leer ist.
- Beleg: `src/features/dashboard/start/regeln.ts:968–1008` und `aufbau.ts:449` — das einzige Thema zu
  Angeboten ist „Über Link angenommen“. Die Daten liegen bereit (`listOffeneQuotes`, Teilindex
  `quotes_offen_nach_frist`, `20261116042000`).
- Vorschlag: Thema „Angebote nachfassen“ für die Führung im Katalog der Startseite: Zahl „Bindefrist
  abgelaufen“, „läuft in 7 Tagen ab“, „Entwurf seit über 7 Tagen“, je die drei ältesten, Sprung in die
  Liste mit Auswahl. Eine lesende Datenbankfunktion `angebote_offen_stand()` (Zahlen und je drei Zeilen,
  Budget B3) nach dem Muster `wartungen_faellig_stand`.
  Prüfung: Datenbanktest gegen `listOffeneQuotes` („bleibt gleich: dieselbe Bedingung für ‚offen‘“),
  `startseite*.test.ts`; Gegenprobe ohne Funktion rot.
  Risiko: mehr Zeilen auf der Startseite — als abwählbares Thema (E68, „Startseite selbst einrichten“) und nur, wenn es etwas gibt.
- Aufwand: mittel

### A-17 Die Angebotsakte trägt zwei „⋯“-Menüs, und „Per Mail senden“ steht je nach Stand im einen oder im anderen
- Art: Unstimmigkeit (Regel der Linie: „⋯ nur im Seitenkopf“)
- Schwere: niedrig
- Beleg: `src/features/quotes/AngebotView.tsx:516` (⋯ am Verlaufspunkt für die Schritte ab dem dritten)
  und `:718` (⋯ im Seitenkopf); „Per Mail senden“ `:500` (offen: Schritt/erstes Menü) und `:738`
  (angenommen: Kopfmenü).
- Vorschlag: höchstens zwei Schritte als Knöpfe am Stand, alles Weitere in das eine ⋯ des Seitenkopfs,
  dort gruppiert („Versenden“: Annahme-Link, Per Mail; „Ändern“: Neue Fassung, Kopie …).
  Prüfung: `AngebotView.test.tsx` „genau ein Menü ‚Angebot …‘“; „bleibt gleich: jede Aktion je Stand
  weiter erreichbar“ (Funktionsinventar).
- Aufwand: klein

---

## 3. Verdacht (nicht zu Ende geprüft)

- **V-1 Kundenwechsel an einer Baustelle mit angenommenem Angebot oder Rechnungen.**
  `BaustellenakteView.tsx:933–951` lässt den Kunden jederzeit ändern; kein Auslöser an `projects` prüft
  es. Angenommene Angebote der Baustelle tragen dann einen anderen Kunden als sie (und ein Nachtrag ließe
  sich nicht mehr anhängen, A-3). Was fehlt: ob die Rechnungsansicht `customer_id` immer aus dem Beleg
  nimmt (`rechnung_anlegen` übernimmt ihn vom Aufrufer, `20261116050400:151–161`) — Gebiet Geld.
- **V-2 Kundenseite nach der Rücknahme.** Nach „Annahme zurücknehmen“ bleibt der Link „angenommen“
  (Absicht: Nachweis, `20261116040000:36–40`); die Kundin liest bis zu 30 Tage „Sie haben angenommen“,
  obwohl der Auftrag storniert ist. Was fehlt: der genaue Text der Seite in diesem Zustand und eine
  Entscheidung, ob dort „inzwischen zurückgenommen“ stehen soll.
- **V-3 Angebotsdatum beim Mailversand.** `AngebotView.tsx:877–881` setzt das Datum „auf heute“ beim
  Erzeugen des PDFs, also bevor feststeht, dass die Mail hinausgeht. Scheitert der Versand, hat der
  Entwurf ein neues Datum (harmlos, aber unbemerkt). Was fehlt: wann `BelegMailDialog` `pdfErzeugen`
  aufruft (Gebiet Belege per Mail).
- **V-4 Rücknahme löscht die Baustelle — was mit Verweisen über die Nummer geschieht.**
  `baustelle_verwendung` zählt Tabellen mit Fremdschlüssel. `wartungen.offene_baustelle` ist eine Nummer
  ohne Fremdschlüssel; eine eben eingeplante Wartung zeigte nach dem Löschen ins Leere. Was fehlt: ob
  `projects_wartung_freigeben` (`20261110170000:75`) auch beim Löschen feuert.
- **V-5 Besichtigung nach dem Umwandeln.** Die Besichtigung hängt am Kunden; ob sie nach „Baustelle
  anlegen“ in der Baustellenakte unter „Termine“ steht, habe ich nicht verfolgt.

---

## 4. Benannte Grenzen, neu bewertet

| Grenze (Fundstelle in `docs/grenzen-durchsicht-2026-10-24.md`) | Grund | Grund gültig nach Grundsatz 6? | Empfehlung |
|---|---|---|---|
| „E-Mail an …“ (Angebot) öffnet das Mailprogramm; die App verschickt nichts an Kunden (`:71`) | Sicherheit und Betrieb | **überholt** — seit F16 sendet die App Angebote (`AngebotView.tsx:860`) | Zeile berichtigen (gilt nur noch für die Bestellung an den Großhändler, falls dort so geblieben) |
| Annahme per Link: Versand aus der App erst mit M14 (`:95`) | liegt beim Betreiber | **überholt** — der Maildialog trägt den Link (`AngebotView.tsx:875`) | Zeile streichen bzw. als erledigt kennzeichnen |
| Annahme per Link: kein QR-Code (`:92`) | „eine neue Bibliothek nur dafür“ | nein — das ist „einfacher“, kein Grund; ein Ablauf fehlt aber tatsächlich kaum | als Idee führen (Angebot auf Papier mit QR zur Annahme), sonst Grund ehrlich als „kein Bedarf gemeldet“ benennen |
| Annahme per Link: Rate-Limit je Link, Öffnungen nur gezählt (`:93–94`) | Sicherheit, Datenschutz | ja | bleibt |
| Auftragseingang: Angaben zu einem noch nicht angelegten Kunden nicht in der Datenauskunft (`:103`) | Datenschutz | ja | bleibt |
| Auftragseingang: Vorsatz „EG“ nicht einstellbar (`:104`) | fachlich (intern) | ja | bleibt |
| Liegenschaften: freie Beteiligte ohne eigene Datenauskunft (`:112`) | Datenschutz | ja | bleibt |
| Liegenschaften: keine abweichende Rechnungsanschrift je Rechnung (`:113`) | fachlich; „Sammelrechnung kommt mit M13“ | nur als Verweis auf ein Paket — „kommt später“ ist kein Grund | mit M13 schließen; bis dahin im Angebot/der Baustelle den Beteiligten „Rechnungsempfänger“ als Kundenvorschlag anbieten (A-11) |
| Liegenschaften: die Akte zeigt je Liste höchstens 100 Baustellen bzw. Wartungen (`:121`) | „die Akte ist ein Überblick“ | **nein** — eine Wohnanlage mit mehr als 100 Reparaturen gibt es; die Kundenakte lädt seit A12 vollständig nach | wie Kundenakte: geordnet, mit Zähler und „weitere laden“ (`liegenschaften.ts:186–209`); klein |
| Änderungsjournal: Positionen von Angeboten nicht einzeln (`:82`) | fachlich | ja | bleibt |
| Papierkorb: die Frist löscht nichts von selbst (`:87`) | Sicherheit | ja | bleibt |
| Der Support löscht Angebotsentwürfe nicht endgültig (`:89`) | Sicherheit | ja | bleibt |
| Ein wieder geöffneter Eingang verliert die Verbindung zum verworfenen Angebot (`:324–328`) | fachlich | ja | bleibt |
| Die Verwaltung sieht beim Eingang nicht, dass sein Angebot im Papierkorb liegt (`:329–332`) | Rechte | Folge einer unbenannten Regel | mit A-13 entscheiden; die Regel selbst benennen |
| Kommende Einsätze halten den Abschluss auf (`:587–590`) | fachlich | ja | bleibt; um Angebote/Termine als Hinweis ergänzen (A-6) |
| „Wartung erledigt?“ ist ein Vorschlag (`:591–593`) | fachlich | ja | bleibt |
| Eine über den Link erklärte Annahme nimmt nur das Büro zurück (`:594–597`) | rechtlich | ja | bleibt; siehe V-2 und A-9 |
| Schon versendete leere Angebote bleiben „Versendet“ (`:598–600`) | Altdaten | ja | bleibt |
| Rücklauf einer Sicherung prüft die Positionen nicht (`:601–603`) | Altdaten | ja | bleibt |
| Angebots- und Baustellennummern lassen sich ohne Beleg ziehen (`:627–630`) | fachlich: Vorschläge, müssen nicht lückenlos sein | ja | bleibt |
| Kunden zusammenführen nicht rückgängig; Personenkonten bei der Kanzlei; Altbelege bei mehrdeutigem Namen; Zeitbuchungen behalten den Namen; Support führt nicht zusammen; Termine melden die Änderung (`:792–811`) | fachlich / Kanzlei / rechtlich / Sicherheit | ja | bleibt; A-5 ergänzt die Zusage „Belegtext eingefroren“ um das Angebots-PDF |
| Löschen von Kunde, Baustelle, Liegenschaft, Eingang ohne „Rückgängig“ (`:940–941`) | fachlich | ja | bleibt |

**Unbenannt und neu zu benennen** (wenn nicht gebaut): A-4 (20 Angebote je Baustelle), A-8/A-9 (feste
Texte, kein Rechtstext), A-13 (Rollen bei Angeboten), A-5 (Altangebote ohne festgehaltenen Empfänger).

---

## 5. Zusammenspiel und Ideen

Fehlende Verknüpfungen sind als Befunde geführt (A-10, A-11, A-12, A-16). Darüber hinaus:

1. **Auftragsbestätigung.** Nach der Annahme (intern oder Link) ein PDF „Auftragsbestätigung“ aus dem
   Angebot (gleiche Positionen, Datum der Annahme, Name des Annehmenden, voraussichtlicher Beginn), per
   Mail aus demselben Dialog. Ein Betrieb dieser Art erwartet das; die Daten sind alle da. Aufwand mittel.
   Vorbehalt: nur sinnvoll zusammen mit A-8 (Bedingungen).
2. **Anzahlung als Schritt der Annahme.** Bei Pauschal/Einheitspreis nach der Annahme „Anzahlung stellen
   (x %)“ anbieten — die Rechnung kann den Anteil vom Angebot schon (`InvoicesView.tsx:4135`); es fehlt nur
   der Sprung (A-12). Aufwand klein.
3. **Ablehnungsgrund auch im Büro.** Der Link fragt den Kunden nach einem Grund (`angebot_link_ablehnen`,
   `p_grund`), „Als abgelehnt markieren“ nicht (`statusFrage.ts:68–70`). Ein freiwilliges Feld mit wenigen
   Vorgaben (Preis, Termin, anderer Anbieter, kein Bedarf) und eine Zeile in der Auswertung „Angebote:
   angenommen/abgelehnt, Quote, Gründe“. Nutzen: der Betrieb sieht, warum er Aufträge verliert. Aufwand
   mittel. Vorbehalt: neue Spalte mit Bezug zum Kunden → Auskunft/Löschung nachziehen.
4. **Vorgang auf einen Blick.** Eingang → Angebot(e) → Baustelle → Rechnungen als eine Zeile „Vorgang“ in
   jeder der vier Akten (heute je ein Verweis „Herkunft“, in jede Richtung ein bis zwei Sprünge). Nur
   Lesen, aus vorhandenen Verweisen (`auftragseingaenge.quote_id/project_id`, `quotes.project_id`).
   Nutzen: Orientierung „wo steht der Auftrag“. Aufwand mittel. Vorbehalt: kein Umbau der Akten —
   eine zusätzliche Angabezeile, sonst Verstoß gegen „nicht überkomplizieren“.
5. **Angebot aus Leistungspaketen.** Wiederkehrende Leistungen („Thermentausch“, „WC-Tausch“) als
   gespeicherte Positionsgruppe einfügen; heute nur „Als Kopie anlegen“ eines ganzen Angebots und einzelne
   Katalogartikel (`KatalogSuche.tsx`). Nutzen hoch für kleine Betriebe, Aufwand groß (neue Tabelle,
   Pflegeansicht). Als Idee, nicht für diese Runde.
6. **Deckungsbeitrag im Angebot.** Katalogpositionen kennen den Einkaufspreis; das Angebotsformular zeigt
   weder Einstand noch Spanne (kein Treffer für Einkaufspreis unter `src/features/quotes/`). Eine Zeile
   „Material-Einstand / Spanne“ nur für die Führung, nicht im PDF. Nutzen mittel, Aufwand mittel.
   Vorbehalt: nur für Positionen mit Katalogbezug rechenbar — die Zeile muss das sagen.
7. **Dringlichkeit bis in die Planung.** Dringlichkeit und Wunschtermin reichen seit A8 bis zur Baustelle;
   ob „Noch einzuplanen“ in der Einsatzplanung danach ordnet oder sie zeigt, gehört zum Gebiet Planung —
   hier nur als Hinweis auf die naheliegende Verknüpfung.

---

## 6. Nachgeprüfte ✔-Punkte des letzten Plans (Stichprobe)

| Punkt | Geprüft an | Ergebnis |
|---|---|---|
| A2 Lieferantennummer wird gespeichert; unbekannte Felder werden abgewiesen | `kunde_umbenennen`, `20261115100000` (Liste `uebernommen`, Ablehnung unbekannter Schlüssel) | hält |
| A7 Ort folgt dem Kunden im Eingangsformular | `EingangFormular.tsx:98–112` (Vorschlag wird nur ersetzt, solange unverändert) | hält |
| A6 „Offen“ fragt die Datenbank | `quotes.ts:108–117, 138–140`, `QuotesView.tsx:457–470` | hält |
| A5/A14 Leeres Angebot wird weder versendet, verlinkt noch angenommen | Auslöser `20261116041500:60–63, 115–134`, `20261116045500:26`, Linkzustand `:48` | hält |
| A4 Neue Fassung überholt den alten Link | `app.angebot_link_zustand` in der **letzten** Fassung (`20261116045500`) enthält `neuere_fassung`; Hinweis im Formular `QuotesView.tsx:1162–1169` | hält |
| A1 Annahme zurücknehmen | `20261116040500:173–258`, Menü `AngebotView.tsx:733–735` | hält |
| A3 Nachtrag, **nach** A8 nicht zurückgefallen | Kern in `20261116042500:193–256` (später als `040500`) enthält Nachtrag, Wiederöffnen und die A8-Felder | hält — mit der Lücke A-3 |
| A8 Ansprechpartner, Dringlichkeit, Wunschtermin durchgereicht | `eingang_zu_angebot` `:408–412`, Kern `:243–246`, Akte `BaustellenakteView.tsx:976–995` | hält |
| A11 „Abgeschlossen“ nur noch geführt | Statusfeld bietet „Abgeschlossen“ nur zum Wiederöffnen (`BaustellenakteView.tsx:1015–1023`) | hält — mit A-1 und A-6 |
| A10 Rechnungen der Kundenakte über den Kunden | `invoices.ts:670–674` (`rechnungen_des_kunden`) | hält |
| A12 Ablehnen nimmt die Besichtigung mit; Kundenlöschung nennt, was mitgeht | `EingangView.tsx:209–215`, `CustomersView.tsx:957–960` | hält |
| V3 „Neu für diesen Kunden“ | `QuotesView.tsx:745–770` | hält |
| E99 Angebote als Belege, Herkunft über das Angebot | `BaustellenakteView.tsx:291–334, 559–566` | hält — mit A-4 (20, ungeordnet) |

Kein Rückfall gefunden. Zwei Einträge der Grenzen-Übersicht sind durch F16 überholt (Abschnitt 4).

---

## 7. Nicht angesehen

- Nichts gegen eine laufende Datenbank oder im Browser nachgestellt; keine Prüfung ausgeführt. A-1 bis
  A-6 und A-14 vor dem Bau mit je einer Prüfung nachstellen (rot ohne, grün mit der Änderung).
- **Kunden zusammenführen** (`kunden_zusammenfuehren`, `zusammenfuehren.ts`, `KundenZusammenfuehren.tsx`)
  nur in Struktur und Zusagen (Stand §108), nicht Zeile für Zeile; Kundenimport (`kundenCsv.ts`,
  `KundenImport.tsx`) nicht.
- **UID-Prüfung** (`shared/vies.ts`, `uid-pruefen`, `useUidVies`, `UidVies.tsx`) nicht.
- **Papierkorb** (`PapierkorbView.tsx`, `papierkorbLeeren.ts`, Frist) und **Verlauf**
  (`objektVerlaufText.ts`) nur an den Übergängen zu Angebot und Baustelle.
- **Liegenschaften**: `LiegenschaftView`, Tops- und Beteiligten-Formulare, Löschen und die Regeln in
  `20261108300000` nicht im Einzelnen.
- **Baustellenliste** (`AdminProjectsView.tsx`, `baustellen_liste`) nur Anlegen/Löschen im Überblick;
  Pläne und Dokumente (`BaustellenPlaene`, `PlaeneListe`, `usePlaene`), `BaustellenScheine`,
  `BaustellenUebersicht`, `AkteUeberblick`, `BetriebsurlaubHinweis` nicht.
- **Angebotsliste**: Suche, gemerkter Stand und Gruppen nur überflogen; `PositionenTabelle`,
  `KatalogSuche`, die Stundenkalkulation (`zaehltAlsArbeitszeit`) und die Summenrechnung
  (`calcTotals`) nicht nachgerechnet.
- **Mailversand** des Angebots (`BelegMailDialog`, Edge Function) — anderes Gebiet; **Wartungen** (im
  Vorgängerpapier Teil dieses Bereichs) diesmal nicht.
- Rollenmatrix nicht vollständig durchgespielt (Support „mitarbeiten“, Buchhaltung bei Angeboten),
  Personenlöschung und Datenauskunft für `quotes`/`auftragseingaenge` nicht.
