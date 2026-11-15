# Bereich 2 — Vom Kontakt zur Baustelle (Tiefenanalyse, nur gelesen)

Stand des Codes: `main` bei `062407b` (15.11.2026). Nichts geändert, nichts ausgeführt außer Lesen und Suchen.
„Belegt“ heißt hier: im Code von der Ansicht über die Datenschicht bis zur Datenbankfunktion bzw. zum
Auslöser verfolgt — nicht gegen eine laufende Datenbank nachgestellt.

Pfade ohne Vorsatz stehen unter `/workspace/Prototype-App-Installateure/`. Migrationen sind mit ihrem
Zeitstempel abgekürzt (`…/supabase/migrations/<Stempel>_….sql`).

---

## 1. Wie der Ablauf funktioniert

1. **Eingang.** Das Büro (jede Rolle außer Monteur) erfasst unter `/eingaenge` einen Eingang: Quelle, Kunde
   (vorhanden oder „Neuer Kunde“ als freie Angaben), Ort, Ansprechpartner vor Ort, Anliegen, Dringlichkeit,
   Wunschtermin (`EingangFormular.tsx`). Nummer `EG-JJJJ-NNNN`, Stand und „wer/wann“ setzt die Datenbank
   (`20261107300000`, Auslöser `eingang_anlegen_pruefen`). Die Liste sortiert auf dem Server Notfall → dringend →
   normal und blättert per Schlüssel.
2. **Umwandeln** darf nur die Führung, je in einer Transaktion mit Zeilensperre: `eingang_zu_baustelle`
   (Kunde ggf. anlegen, Baustelle mit Zählernummer, Abrechnungsart) oder `eingang_zu_angebot` (leerer
   Angebotsentwurf mit dem Anliegen als Anmerkung). Vorher fragt die App nach gleichnamigen Kunden
   (`gleichnamig.ts`). Ablehnen mit Grund, wieder öffnen, Besichtigungstermin (hängt am Kunden).
3. **Angebot.** `QuotesView.tsx` (Liste + Formular), `AngebotView.tsx` (Akte). Kopf und Positionen schreibt
   `angebot_speichern`; nur ein Entwurf ändert seinen Inhalt. Stände: Entwurf → Versendet → Angenommen /
   Abgelehnt / Ersetzt, dazu Verworfen (Papierkorb, nur aus dem Entwurf). Überarbeitet wird als „Neue Fassung“
   (`vorgaenger_id`), kopiert als „Kopie“.
4. **Annahme-Link.** `angebot_link_erzeugen` friert einen Schnappschuss mit Prüfsumme ein, speichert nur den
   Hash des Schlüssels, macht den Entwurf „Versendet“ und widerruft einen offenen Vorgänger-Link. Die
   öffentliche Seite `/angebot/annehmen#<Schlüssel>` spricht mit der Edge Function `angebot-annahme`
   (Dienstschlüssel, Form- und Größenprüfung, Rate-Limit je Link in der Datenbank).
5. **Annahme.** Intern (`angebot_annehmen`, Führung) und über den Link (`angebot_link_annehmen`) läuft
   derselbe Kern `app.angebot_annehmen_kern` (`20261108300000:1004`): Baustelle mit Zählernummer,
   `estimated_hours` = kalkulierte Stunden, Beschreibung = Anmerkungen + „Aus Angebot …“, Ansprechpartner aus
   dem Kundenstamm, Liegenschaft/Top; Angebot „Angenommen“, übrige offene Fassungen „Ersetzt“. Push und
   Startseitenhinweis an die Führung.
6. **Baustelle.** Liste `AdminProjectsView.tsx`, Akte `BaustellenakteView.tsx`. Status (Aktiv/Pausiert/
   Abgeschlossen) ist ein Auswahlfeld im Bearbeiten-Fenster. Nummer ändern über `baustelle_umnummern`
   (zieht Buchungen, Einsätze, Entwürfe, Anforderungen, Angebote, Wartungen nach; gesperrt ab Rechnung/
   unterschriebenem Schein; alte Nummern bleiben auflösbar). Löschen scheitert an Fremdschlüsseln, sobald
   Buchungen, Einsätze, Scheine, Rechnungen, Anforderungen, Rüstlisten, Pläne **oder Angebote** auf sie zeigen.
7. **Kunde.** Liste, Akte, CSV-Import (`kunden_einspielen`, Dubletten nach Name), UID bei VIES
   (`uid-pruefen`). Löschen nur ohne Baustellen/Angebote/Wartungen/Scheine/Rechnungen; sonst „inaktiv“ oder
   die DSGVO-Löschung (`person_loeschen`). Zusammenführen gibt es nicht.
8. **Wartung.** Eine Zeile je Anlage mit Intervall und Fälligkeit. „Baustelle anlegen“ (`wartung_einplanen`)
   merkt die Baustelle als `offene_baustelle`; „Erledigt“ setzt `zuletzt_am`, rechnet den nächsten Termin ab
   dem Ausführungstag und leert `offene_baustelle`; ein Auslöser hält jede Ausführung fest. Die Rechnung liest
   Wartungen der Baustelle für den vereinbarten Preis.

---

## 2. Belegte Befunde

### Hoch

**B1 — Ein angenommenes Angebot hat keinen Rückweg, seine Baustelle lässt sich nicht löschen, und die Meldung
nennt den falschen Grund.**
- `src/features/quotes/AngebotView.tsx:351` (`schritte` ist bei „Angenommen“ leer), `:570–585` (Menü: nur
  „Als Kopie anlegen“); `supabase/migrations/20260911140000_geld.sql:102` (`quotes.project_id references
  projects (id)` ohne `on delete`, gefüllt vom Auslöser `quotes_baustelle`, `:126`);
  `20261106200000:239` (Löschen eines Angebots nur als Entwurf/verworfen);
  `20261027400200:79` („Ersetzt … wird nicht wieder offen“);
  `src/features/projects/AdminProjectsView.tsx:1205–1211`.
- Szenario: Die Führung tippt in der Angebotsliste bei der falschen Zeile „Annehmen → Baustelle“ und bestätigt
  (oder: der Kunde tritt nach der Annahme zurück — bei der Annahme über den Link ist das ein
  Fernabsatzgeschäft). Ergebnis: Baustelle `PR-…` ist angelegt, die andere Fassung steht unwiderruflich auf
  „Ersetzt“. „Löschen“ der leeren Baustelle scheitert am Fremdschlüssel des Angebots; die App meldet
  „an ihr hängen schon Buchungen, Scheine, Rechnungen oder Pläne“ — nichts davon trifft zu. Das Angebot bleibt
  für immer „Angenommen“. Einziger Weg: Baustelle auf „Abgeschlossen“ setzen und die richtige Fassung als
  Kopie neu anlegen (neue Nummer, zweite Baustelle).
- Zum Vergleich: Eine aus einem Eingang entstandene Baustelle lässt sich löschen, der Eingang wird wieder
  offen (`on delete set null`, `20261107300000:226`). Beim Angebot fehlt dieser Weg.
- Die Datenbank ließe „Angenommen → Versendet“ zu (`angebot_speichern` prüft nur den Inhalt); es fehlt der
  Ablauf in der Oberfläche samt Regel, was mit der Baustelle geschieht.

### Mittel

**B2 — „Unsere Lieferantennummer bei diesem Kunden“ wird in Kundenakte und Kundenliste nicht gespeichert,
die App meldet „Gespeichert“.**
- `src/lib/db/pg/customers.ts:144–154` (sobald `name` mitkommt, geht alles über `kunde_umbenennen`);
  `supabase/migrations/20260930330000_uid_und_kundenart.sql:207–246` (die Funktion zählt ihre Spalten einzeln
  auf; `lieferantennummer` ist nicht dabei — die Spalte kam erst mit `20261019300000`);
  `src/features/customers/KundenakteView.tsx:230` und `CustomersView.tsx:309` schicken immer das ganze
  Formular samt Name.
- Szenario: Kundenakte → Bearbeiten → Lieferantennummer `50012345` eintragen → Speichern. Meldung
  „Gespeichert“, nach dem Neuladen ist das Feld leer. Gespeichert wird die Nummer nur beim Anlegen eines
  Kunden und über „merken“ im E-Rechnungs-Dialog (`EbInterfaceDialog.tsx:150`, dort ohne Name).
- Die Prüfung `tests/supabase/lieferantennummer.test.ts:33` ruft `updateCustomer` ohne Namen auf und trifft
  deshalb den anderen Zweig. Derselbe Fehler war am 30.09. schon einmal da (Kopf derselben Migration:
  „kannte die Spalten aus M12 noch nicht und ließ sie beim Umbenennen fallen“).

**B3 — Die Baustellenakte rät zu einem Weg, den es nicht gibt: „ein Angebot anlegen und annehmen“ hängt das
Angebot nicht an die bestehende Baustelle, sondern legt eine zweite an.**
- `src/features/projects/BaustellenakteView.tsx:1044` und `:1049` (Hinweis bei Pauschal/Einheitspreis ohne
  Angebot); `20261108300000:1021–1039` (der Kern hängt nur an, wenn `quotes.project_number` schon auf eine
  Baustelle zeigt); `src/features/quotes/QuotesView.tsx:612–625, 649–669` (kein Weg setzt `projectNumber`
  vor der Annahme).
- Szenario: Eingang → „Baustelle anlegen“ mit „Pauschal“. Die Akte sagt: „Oder ein Angebot anlegen und
  annehmen, dann übernimmt die Rechnung dessen Positionen.“ Die Führung tut das → es entsteht `PR-…-0002`
  für denselben Auftrag; die erste Baustelle bleibt ohne Angebot, Einsätze und Stunden liegen womöglich
  schon auf ihr. Dasselbe gilt für jeden Nachtrag zu einer laufenden Baustelle: jedes angenommene Angebot
  ist eine neue Baustelle, das Budget der bestehenden wächst nicht mit.

**B4 — Eine neue Fassung lässt den Annahme-Link der alten Fassung offen; der Kunde kann die überholte
Fassung verbindlich unterschreiben.**
- `20261106400000:558–577` (`angebot_link_zustand`: „gegenstandslos“ erst, wenn eine andere Fassung
  **angenommen** ist); `QuotesView.tsx:536–544, 638–681` (Neue Fassung rührt Links nicht an, kein Hinweis);
  `AnnahmeLink.tsx` (kein Bezug zu Fassungen).
- Szenario: AN-0008 geht mit Link hinaus. Der Kunde will eine Änderung; das Büro legt AN-0009 als neue
  Fassung an und schickt einen neuen Link. Der Kunde öffnet die alte Mail und unterschreibt AN-0008 →
  Baustelle mit Positionen und Budget von AN-0008, AN-0009 steht auf „Ersetzt“ (kein Rückweg, siehe B1).
  Verhindern lässt sich das nur, wenn jemand vorher von Hand „Widerrufen“ tippt.

**B5 — Ein Angebot ohne Positionen lässt sich versenden, verlinken und annehmen; „Als versendet markieren“
und „Als abgelehnt markieren“ wirken ohne Rückfrage und ohne Rückweg.**
- `AngebotView.tsx:360–366` und `QuotesView.tsx:860–862` (ein Tipp, kein Dialog); `AngebotView.tsx:369–383`
  (Annehmen und Annahme-Link beim Entwurf, gleich wie viele Positionen); `20261108300000:1104–1118`
  (`eingang_zu_angebot` legt den Entwurf mit `'[]'` an); keine Prüfung auf Positionen in
  `angebot_link_erzeugen` (`20261106400000:714–796`) oder im Kern. Bei Rechnungen gibt es sie
  („Eine Rechnung ohne Positionen …“, `20260926100000:137`).
- Szenario: Eingang → „Angebot anlegen“ → die App springt auf die Angebotsakte (`EingangView.tsx:540`), nicht
  ins Formular. Dort stehen neben „Bearbeiten“ sofort „Als versendet markieren“, „Annehmen → Baustelle“ und
  „Annahme-Link“. Ein Tipp daneben: das leere Angebot über 0,00 € ist „Versendet“ und nicht mehr
  bearbeitbar; es bleibt nur „Neue Fassung“ mit neuer Nummer. Über den Link bekäme der Kunde ein Angebot
  ohne Positionen zur Unterschrift. Ebenso endgültig ist ein Fehltipp auf „Als abgelehnt markieren“.

**B6 — „Offen“ in der Angebotsliste zeigt nur offene Angebote unter den 100 zuletzt angelegten; gerade die
alten mit abgelaufener Bindefrist fallen heraus.**
- `QuotesView.tsx:355` (`listRecentQuotes(…, grenze)`), `src/lib/db/pg/quotes.ts:90–97` (nach `createdAt`,
  ohne Statusfilter), Gruppen `QuotesView.tsx:763–769`.
- Szenario: 150 Angebote im Jahr. AN-0020 vom Jänner steht auf „Versendet“, der Kunde hat nie geantwortet.
  Nach 100 jüngeren Angeboten steht es weder unter „Bindefrist abgelaufen“ noch sonst unter „Offen“; unten
  steht nur „100 von möglicherweise mehr geladen“. Die Baustellenliste löst genau das mit einer eigenen
  Abfrage aller laufenden (`AdminProjectsView.tsx:252–259, 337`); bei Angeboten fehlt sie.

**B7 — Im Eingangsformular bleibt der Ort des zuvor gewählten Kunden stehen.**
- `src/features/auftragseingang/EingangFormular.tsx:185` (`ort: alt.ort.trim() ? alt.ort : k?.address`), `:105`.
  Angebot und Baustelle ersetzen den unveränderten Vorschlag des vorigen Kunden (`QuotesView.tsx:941–947`,
  `BaustellenakteView.tsx:829–839`), der Eingang nicht.
- Szenario: Am Telefon wird Kunde A gewählt (Ort = Anschrift A), dann auf B korrigiert — oder auf „Neuer
  Kunde“ umgeschaltet. Der Ort bleibt die Anschrift von A, wird so gespeichert und geht über
  `eingang_zu_baustelle` (`20261108300000:783`) als Adresse in die Baustelle bzw. ins Angebot von B.

**B8 — Auf dem Weg Eingang → Angebot → Baustelle geht der Ansprechpartner vor Ort verloren.**
- `20261108300000:785–786` (Eingang → Baustelle übernimmt `ansprechpartner_name/-telefon`), `:1104–1118`
  (Eingang → Angebot kennt sie nicht), `:1037` (die Annahme nimmt den Ansprechpartner des **Kunden**).
- Szenario: Die Hausverwaltung meldet einen Schaden, im Eingang steht „Frau Huber, Top 5, 0664 …“. Über das
  Angebot angenommen, trägt die Baustelle Ansprechpartner und Telefon der Hausverwaltung; der Monteur hat die
  Mieterin nicht in der Akte. Auch Dringlichkeit und Wunschtermin kommen auf keinem Weg in die Baustelle.
  Die Baustelle zeigt außerdem „Aus Eingang …“ nur, wenn sie direkt aus dem Eingang entstand
  (`BaustellenakteView.tsx:279`, `getEingangZu({ projectId })`); über das Angebot sind es zwei Sprünge.

**B9 — „Erledigt“ einer Wartung hängt an niemandem; eine eingeplante Wartung verschwindet von der Startseite
und wartet auf einen Handgriff in einer anderen Liste.**
- `src/features/dashboard/start/regeln.ts:742–744` und `aufbau.ts:609–611` (nur Wartungen **ohne**
  `offeneBaustelle`); keine Erwähnung von Wartung in `src/features/projects/*`, im Schein oder in der Planung;
  `src/lib/db/pg/wartungen.ts:151–187` (nur „Erledigt“ rückt den Termin).
- Szenario: Therme Huber fällig → „Baustelle anlegen“ → Einsatz, Schein unterschrieben, Rechnung gestellt,
  Baustelle abgeschlossen. Niemand öffnet danach „Wartungen“ und tippt „Erledigt“. Die Wartung steht dort
  weiter als „überfällig, eingeplant auf PR-…“, die Startseite meldet sie nicht mehr, der Termin fürs nächste
  Jahr entsteht nie. Umgekehrt fragt „Erledigt“ nicht, ob die Baustelle abgeschlossen werden soll.

**B10 — Die Rechnungen in der Kundenakte laden ab etwa 220 Baustellen eines Kunden nicht mehr.**
- `src/features/customers/KundenakteView.tsx:306–318` (alle Baustellen-Kennungen des Kunden),
  `src/lib/db/pg/invoices.ts:639–646` (als `project_id.in.(…)` in einer `or`-Zeichenkette);
  `src/lib/db/pg/kern.ts:212–251` stückelt nur `in`-Bedingungen in `wo`, nicht `oder`, und nennt die
  gemessene Grenze selbst (8135–8145 Zeichen, „gut 220 Kennungen“).
- Szenario: Eine Hausverwaltung mit 230 Baustellen (jede Reparatur ist eine). Die Karte „Rechnungen“ und
  „Jüngste Belege“ zeigen dauerhaft „konnte nicht geladen werden“ (414 vom Gateway).

**B11 — „Abgeschlossen“ ist ein Auswahlfeld ohne jede Prüfung und ohne Anstoß aus einem anderen Ablauf.**
- `BaustellenakteView.tsx:372–377, 897–899` (einziger Ort), `AdminProjectsView.tsx:1133–1142` (Zeilenmenü:
  nur „Schein nachtragen“ und „Löschen“); in den Migrationen kommt der Status außer in der Prüfregel der
  Spalte nicht vor (`20260911120000:78`).
- Szenario: Die Führung setzt eine Baustelle auf „Abgeschlossen“, auf der nächste Woche noch zwei Einsätze
  stehen, ein Schein-Entwurf liegt und eine Anforderung „abholbereit“ ist. Nichts warnt; die Baustelle fällt
  aus allen Auswahlfeldern (`listActiveProjects`, `src/lib/db/pg/projects.ts:21–26`), die Einsätze bleiben
  im Plan. Umgekehrt schließt nichts eine Baustelle: weder die bezahlte Schlussrechnung noch die erledigte
  Wartung fragen danach. Bei Betrieben, die jede Reparatur und jede Wartung als Baustelle führen, wächst
  „Aktiv“ deshalb stetig auf die Auswahlgrenze von 500 zu (`src/lib/listengrenzen.ts`), und das Schließen
  ist je Baustelle Akte → Bearbeiten → Status → Speichern.

### Niedrig

**B12 — Kundenimport: keine Kundenart, Kundennummer nur in der Notiz.**
`src/features/customers/kundenCsv.ts:252–268` und `20260929120000:516–527` (`kunden_einspielen` schreibt
Name, Adresse, Kontakt, E-Mail, UID, Notiz). Szenario: 800 Kunden importiert → alle stehen unter „Kundenart
prüfen“ und müssen einzeln geöffnet werden, bevor Rechnung und Mahnung gehen; eine Spalte „Kundennummer“
landet als Text „Kundennummer im Altsystem: …“ in der Notiz statt im Feld, das es seit M12 gibt.

**B13 — Kundenakte: höchstens 300 Baustellen, ohne Reihenfolge und ohne Hinweis.**
`src/lib/db/pg/customers.ts:74–79`, Zähler im Kartentitel `KundenakteView.tsx:382`. Bei mehr als 300 fehlen
beliebige (keine Sortierung in der Abfrage), der Titel sagt „Baustellen (300)“, und die Rechnungen (über die
Baustellen gesucht) fehlen mit. Eingänge und Angebote derselben Akte sagen ihre Grenze, die Baustellen nicht.

**B14 — „Erledigt“ ohne Baustelle schreibt die Ausführung auf die Baustelle des Vorjahrs.**
`src/lib/db/pg/wartungen.ts:173` (`letzteBaustelle: args.projectNumber`; `undefined` wird nicht geschrieben,
`felder.ts:109`), Auslöser `20261012200000:178–205` nimmt `new.letzte_baustelle`. Szenario: 2025 auf
PR-2025-0040 gewartet; 2026 ohne Baustelle „Erledigt“ → die Ausführung 2026 nennt PR-2025-0040, der Verlauf
der Anlage ist falsch, und die alte Baustelle trägt einen Durchgang mehr (`app.wartung_durchgaenge`). Die
Migration `20261106300000:60–63` kennt das Verhalten und hat den Wächter darum herum gebaut; die Ursache
(leeres Feld = „keine Baustelle“ als `null` schicken) ist geblieben.

**B15 — Ein abgelehnter oder gelöschter Eingang lässt seinen Besichtigungstermin im Plan stehen.**
`20261107300000:936–965` (`eingang_ablehnen` fasst `termin_id` nicht an), Dialogtext
`EingangView.tsx:545–560` und `:563–573` nennt den Termin nicht. Szenario: Der Kunde sagt ab, das Büro lehnt
den Eingang ab — die Besichtigung steht weiter im Einsatzplan der eingeteilten Person.

**B16 — Angebotsdatum ist der Tag des Anlegens und nicht änderbar.**
`QuotesView.tsx:654` (`quoteDate: todayStr()`), kein Feld im Formular (`:978–989` nur „Gültig bis“), beim
Versenden unverändert. Szenario: Entwurf am 01.10. aus dem Eingang, kalkuliert und versendet am 20.10. →
auf dem PDF steht 01.10., die 30 Tage Bindefrist sind beim Versand zu zwei Dritteln um.

**B17 — Eigene Baustellennummer bei „Baustelle anlegen“ aus der Wartung: Prüfung nur gegen die letzten 300
Baustellen, sonst englische Datenbankmeldung.**
`WartungenView.tsx:267, 516–527` (`nummerFrei` gegen `listRecentProjects(…, 300)`, Fehler ungefiltert in
`toast.error`). Betrifft Betriebe mit mehr als 300 Baustellen und selbst vergebenen Nummern.

---

## 3. Verdacht (nicht zu Ende verfolgt)

- **V1 — Abschließen vor der Rechnung.** `src/features/invoices/InvoicesView.tsx:717` lädt für die
  Baustellenwahl nur `listActiveProjects`. Eine Baustelle, die die Führung schon auf „Abgeschlossen“ gesetzt
  hat, fehlt dort vermutlich. Ob „Nicht verrechnete Leistung“ und `/invoices?neu=` sie trotzdem öffnen, habe
  ich nicht verfolgt (anderer Bereich). Mittel, falls es zutrifft.
- **V2 — Kundenwechsel an einer Baustelle mit Rechnungen.** `BaustellenakteView.tsx:373` lässt den Kunden
  jederzeit ändern; kein Auslöser an `projects` prüft das. Rechnungen tragen den Kunden meist nur als Namen;
  Kundenakte (`invoices.ts:639–640`) und Mahnprüfung (`20261006200000:79–103`,
  `coalesce(new.customer_id, Kunde der Baustelle)`) nehmen den Kunden der Baustelle. Danach stünde eine
  Rechnung an A in der Akte von B, und für Zinsen/Mahnspesen zählte die Kundenart von B. Nicht geprüft, ob
  `rechnung_anlegen` `customer_id` inzwischen immer setzt.
- **V3 — Dublettenprüfung bei häufigen Namen.** `gleichnamig.ts:25–28` sucht mit `searchCustomers(…, 50)`
  über fünf Spalten, nach Name sortiert, und filtert dann auf den genauen Namen. Bei mehr als 50 Treffern
  („Huber“ in Name, Straße, E-Mail) kann der genau gleichnamige Kunde außerhalb der 50 liegen; die Rückfrage
  bliebe aus. Nur bei großen Kundenstämmen.
- **V4 — Link-Annahme und Rücktrittsbelehrung.** Die öffentliche Seite (`AngebotAnnahmeSeite.tsx`) nennt kein
  Rücktrittsrecht; ob das für Verbraucher nötig ist, liegt beim Anwalt. Technisch fehlt der Ablauf dazu
  (siehe B1).

---

## 4. Nicht nahtlos

1. **Kundenakte ohne „Neu für diesen Kunden“.** Die einzige Aktion ist „Bearbeiten“
   (`KundenakteView.tsx:657`). Angebot, Baustelle, Eingang, Wartung beginnen in ihrer Liste, und der Kunde wird
   dort noch einmal gesucht; keine der vier Seiten liest einen Kunden aus der Adresse. Ebenso die
   Liegenschaftsakte.
2. **Eingang → Angebot landet auf der Akte, nicht im Formular** (`EingangView.tsx:540`); der nächste Schritt
   ist immer „Bearbeiten“ (siehe B5).
3. **Nach der Annahme kein nächster Schritt.** Die Liste meldet „Baustelle … angelegt“ ohne Sprung; „Einsatz
   planen“ steht erst in der Baustellenakte. Nach „Baustelle anlegen“ aus der Wartung sagt die Meldung „Jetzt
   im Einsatzplan einteilen“, führt aber nicht hin (`WartungenView.tsx:525`).
4. **Notfall ohne Meldung.** Ein Eingang „Notfall“, den die Verwaltung erfasst, kann nur die Führung
   umwandeln; sie erfährt es über die Zahl auf der Startseite, nicht per Push (für die Link-Annahme gibt es
   einen).
5. **Wartungen in der Kundenakte führen nirgends hin** (`KundenakteView.tsx:460–487`, Zeilen ohne Verweis);
   die Wartungsliste liest keine Suche aus der Adresse, anders als der Auftragseingang (`:544`).
6. **Nachtrag / Angebot zu bestehender Baustelle** fehlt als Weg (B3).
7. **Angenommen → Rücktritt/Storno** fehlt als Weg (B1); ebenso „zurück in den Entwurf“ für ein irrtümlich
   als versendet markiertes Angebot ohne Link.
8. **Kunden zusammenführen** fehlt: Eine Dublette mit Belegen bleibt (Löschen gesperrt, Angebote nach dem
   Versand nicht umhängbar); Baustellen lassen sich nur einzeln umhängen.
9. **Baustelle abschließen** hat keinen eigenen Handgriff und keinen Anstoß (B11); Wartung „Erledigt“ und
   Baustelle wissen nichts voneinander (B9).
10. **Umbenannter Kunde:** Baustellen und Eingänge ziehen den Namen nach
    (`20261006230000:27–31`, `20261107300000:580–600`), Wartungen (`customer_name`) und Angebotsentwürfe
    nicht — die Wartungsliste zeigt den alten Namen, bis jemand die Wartung neu speichert.

---

## 5. Funktionen mit Mehrwert (in den bestehenden Abläufen)

1. **Annahme zurücknehmen / Auftrag stornieren** — schließt den einzigen Zustand ohne Ausweg der Kette und
   macht Fehlklick und Rücktritt behandelbar (Baustelle ohne Buchungen löschen, sonst abschließen; Fassungen
   wieder offen).
2. **Angebot zu einer bestehenden Baustelle (Nachtrag)** — beim Annehmen „neue Baustelle“ oder „an Baustelle
   …“ wählen, Budget addieren; macht den Hinweis in der Akte wahr und hält Nachträge beim Auftrag.
3. **„Neu für diesen Kunden“ in Kunden- und Liegenschaftsakte** (Eingang, Angebot, Baustelle, Wartung, mit
   vorbelegtem Kunden/Ort) — spart in jedem Vorgang die zweite Kundensuche.
4. **Baustelle abschließen als geführter Schritt** — mit Blick auf offene Einsätze, Entwürfe, Anforderungen,
   unverrechnete Leistung; angeboten nach bezahlter Schlussrechnung und nach „Wartung erledigt“. Hält
   „Aktiv“ klein und die Auswahlfelder kurz.
5. **Wartung schließt sich mit dem Einsatz** — unterschriebener Schein oder abgeschlossene Baustelle einer
   eingeplanten Wartung schlägt „Erledigt am …“ vor (Startseite der Führung); sichert den Termin fürs
   nächste Jahr.
6. **Kunden zusammenführen** — Baustellen, Wartungen, Eingänge, Entwürfe umhängen, Dublette inaktiv; dazu im
   Import eine Spalte bzw. Sammelzuweisung der Kundenart.

---

## 6. Was ich NICHT angesehen habe

- Nichts gegen eine laufende Datenbank oder im Browser nachgestellt; keine Tests ausgeführt.
- `person_loeschen` / `person_auskunft` (DSGVO-Löschung und -Auskunft des Kunden samt Eingängen, Links,
  Beteiligten) nur in der Struktur, nicht Zeile für Zeile; den Papierkorb (`PapierkorbView`) nur über die
  Auslöser der Angebote.
- `src/features/verlauf/*` (Änderungsjournal in den Akten), Pläne und Dokumente der Baustelle
  (`BaustellenPlaene`, `PlaeneListe`, `usePlaene`, Storage-Regeln), `MyProjectsView`, `BaustellenUebersicht`,
  `AkteUeberblick`, `BetriebsurlaubHinweis`.
- Liegenschaften nur die Datenbankseite (Zuordnung, Löschen, Suche) und die Übergabe an Eingang, Angebot,
  Baustelle, Wartung; `LiegenschaftView`, Tops- und Beteiligten-Formulare nur überflogen.
- UID-Prüfung: Edge Function gelesen, `shared/vies.ts`, `useUidVies`, `UidVies.tsx` und die Funktionen
  `uid_pruefung_*` nicht im Einzelnen.
- Angebots-PDF (`angebotPdf.ts`), Summenrechnung und Rundung (`features/invoices/totals.ts`) — gehört zu den
  Rechnungen.
- Budgetanzeige: `baustellen_stunden` gelesen, die Ampelrechnung im Client nicht nachgerechnet.
- Push-Versand (`push-melden`) und die Startseite nur, soweit sie Angebote, Eingänge und Wartungen betreffen.
- Rollenmatrix nicht vollständig durchgespielt (Support mit „mitarbeiten“, Buchhaltung bei Angeboten).
