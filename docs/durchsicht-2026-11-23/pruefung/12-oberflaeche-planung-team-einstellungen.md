# Gegenprüfung: Planung, Team, Einstellungen, Plattform, Anmeldung, Öffentliches (Oberfläche, Papier 12) — 23.11.2026

Geprüft von einem unabhängigen Prüfer. Stand `main` fa6e740 (an `src/`, `tools/`, `tests/` seither nichts
geändert; nur Dokumente kamen dazu).

**Womit geprüft:** Vorschau `http://localhost:5199/tools/vorschau/` mit eigenen Playwright-Skripten
(Chromium 1243; 1440×900, 834×1112 mit Touch, 390×844 und 375×812 mit Touch; 1440×2400 für lange Fenster),
gemessen mit `getBoundingClientRect`/`getComputedStyle` und dem Aufrufzähler der Attrappen
(`window.__datenaufrufe`); dazu der Quelltext und die Regelquellen (`CLAUDE.md` „Oberfläche“,
`docs/design/v10/style.md`, E25, E76, E86, E92–E99 in `docs/ui-umbau/entscheidungen.md`,
`docs/stand-2026-10-03.md` §112–§118, `tests/unit/schalterRegel.test.ts`, `bedienregeln.test.ts`,
`schriftskala.test.ts`, `v10Stil.test.ts`). Skripte, Ausgaben und 56 Bilder liegen unter
`/tmp/claude-0/-workspace-Prototype-App-Installateure/d2c6c62f-de1f-5d7d-8a7e-91e7b4244a5a/scratchpad/audit/pruef-d4/`
(`b1.mjs`, `b1b.mjs`, `plan.mjs`, `plan2.mjs`, `s1.mjs` … `s9.mjs`, `p.mjs`, je mit `.out`).

**Attrappe oder App?** Anmeldung, zweiter Faktor und Monatsabschluss sind nur erreichbar, wenn man
`AuthStub.tsx` im Browser umschreibt (so auch der Autor). Nachgestellt mit eigener Umschreibung: die
Befunde D4-A12, B12, C4, C7, T18, T19 betreffen Code der App (`LoginPage.tsx`, `ZweiFaktorSeite.tsx`,
`AccountingView.tsx`), nicht die Attrappe. **Anders bei der Benutzerakte:** die Vorschau meldet immer
`u1` an und zeigt unter jeder Adresse `/user-mgmt/…` die Akte von `u1` — der Autor hat also nur die
**eigene** Akte gesehen. Daraus stammen D4-C11 und D4-T9; beide stimmen für fremde Akten nicht (unten).

## 1. Ergebnis in Zahlen

87 Befunde (14 A, 16 B, 13 C, 11 I, 21 T, 12 P).

| Urteil | Anzahl |
|---|---|
| bestätigt (nachgestellt) | 58 |
| bestätigt (am Code) | 8 |
| teilweise | 19 |
| widerlegt | 2 |
| nicht prüfbar | 0 |

Von den 14 „Fehlern gegen die Linie“ trägt eine Regelquelle nur vier ganz (A1, A2, A3, A10). Bei sechs
(A5, A7, A8, A9, A12, A14) stimmt die Messung, aber **keine Quelle trägt die Einordnung** — es sind
Unstimmigkeiten oder bewusste Entscheidungen; bei A4, A6, A11, A13 stimmt nur ein Teil. Bei den übrigen
„teilweise“ ist ein Teil der Aussage, die Ursache oder der Vorschlag falsch.

## 2. Je Befund

### A — Fehler gegen die Linie

| Kürzel | Urteil | Eigener Beleg | Zum Vorschlag: Risiko „verschlimmbessern“, fehlendes „bleibt gleich“, Widerspruch |
|---|---|---|---|
| D4-A1 | bestätigt (nachgestellt) | `/assignments/tag`, GF, 390: Kalender y 246 (358×504), „Einsatz planen — Mo., 23.11.2026“ y 822, „Termine am …“ y 1 686, „Einsätze am …“ y 2 310, klebende Leiste „Einsatz speichern“ 358×73; bei 375 px dasselbe (Einsätze y 2 334). Wächter: `bedienregeln.test.ts` `NEU_TITEL = /(anlegen\|Antrag stellen\|Krank melden\|^Neue…)/` trifft „Einsatz planen — …“ nicht. U2 trägt den Befund („die Seite zeigt zuerst den Bestand“). | `EinsatzFenster` wählt den Tag **nur unter den geladenen Tagen** (`EinsatzFenster.tsx:28–31`: sonst „überschriebe Speichern, was dort schon geplant ist“) und trägt „Ganzen Tag ansehen“ — auf der Tag-Seite wäre das ein Kreis. Fehlt bei „bleibt“: jeder beliebige Tag aus dem Kalender der Tag-Seite bleibt planbar; die Sprünge „In ‚Tag‘ öffnen“ (Woche) und „Bearbeiten“ aus der Einsatz-Vorschau der Startseite (§117) öffnen am Handy das Blatt mit gewählter Baustelle; die Rüstliste im Blatt. Wächter um „planen“ erweitern heißt: auch Tag-Fenster, Woche und Startseite laufen darüber — vorher auf Falschtreffer prüfen. |
| D4-A2 | bestätigt (nachgestellt) | „Einsatz bearbeiten“, 1440 und 834: `.planung-fuss` 438×129, „Ganzen Tag ansehen“ 177×48 (y 759), „Einsatz und Rüstliste speichern“ 252×48 (y 815) — untereinander. U4 („höchstens eine zweite … links daneben“) trägt es. | Der lange Name steht auch in „Einsatz planen“, sobald eine Baustelle gewählt ist (`EinsatzFormular.tsx:1409`: nur ohne Baustelle bzw. ohne Materialmodul „Einsatz speichern“) — der Satz „dort stehen sie nebeneinander“ gilt nur bis zur Baustellenwahl. „Speichern“ als Name: die Meldung „Einsatz und Rüstliste gespeichert“ soll bleiben (sie sagt, dass die Rüstliste mitging); Prüfungen und Funktionsinventar suchen den Knopf beim Namen. 390 px nicht gemessen. |
| D4-A3 | bestätigt (nachgestellt) | `/costing` als Verwaltung, 1440: `h1.text-xl.font-semibold` 22 px/500/DM Sans, zentriert (x 636, Breite 400), kein `.seitenkopf`, kein Verweis und kein Knopf in `main`. `src/app/guards.tsx:24–31`, `:56–79`. | Unkritisch. „Zur Startseite“ muss für jede Rolle ein erlaubtes Ziel sein (Plattformkonto!). Der Verweis auf „Module“ nur für die Administration bleibt (P3-19 im Kommentar). |
| D4-A4 | teilweise | 13 px/18 px (`text-meta text-ink-muted`) gemessen an „Noch nie Einblick gewährt. …“ (`/settings/support`), „Seit der Einrichtung wurde noch keine Push-Meldung angestoßen.“ (`/settings/meldungen`), „Im November 2026 wurde keine Grenze überschritten.“ (`/accounting`) — das sind Leersätze, E97 verlangt 15 px. **„Sie läuft von selbst.“** (`SicherungView.tsx:226`) ist kein Leersatz, sondern ein Hinweis neben dem Knopf; für „Hinweis“ und „Zustand“ nennt E97 13 px. | Den Satz der Datensicherung nicht mit umstellen. Der Titel des Befunds („Leer- **und Zustands**sätze“) ist zu weit: Zustände stehen laut E97 in 13 px. |
| D4-A5 | teilweise | `h2.planung-ablage-titel` 18 px/400/Source Serif 4, 155×24 (1440, `?bestand=gewachsen`) — Messung stimmt. Aber **gewollt**: `lot-planung.css:501` „Ein Bereichstitel, keine Versalienzeile (V10: Serifen für größere Titel …)“; die Klasse steht als erlaubter Titel in `schriftskala.test.ts:53` und `schriftskala.spec.ts:43`, `v10Stil.test.ts:684` prüft sie; gebaut mit E96 am 17.11. | Kein Fehler gegen die Linie (style.md lässt Serifen für „Bereichstitel“ zu), höchstens eine Unstimmigkeit zu den übrigen Blatt-Titeln. Wer umstellt, ändert drei Wächter mit. Im Plan keinem Paket zugeordnet. |
| D4-A6 | teilweise | Am Code: `index.css:401–405` 3 px `--brand-fixed`, Versatz 2 px; `.zeile-ganz` 2 px `--accent-deep` (`index.css:1161`); 17 Regeln mit 2 px `--focus-ring` in sieben Stildateien, mit Versatz −2, 0 und 2 px. | Das „Soll“ ist nicht eindeutig: style.md nennt `--focus-ring` #2D7383, **E95 nennt „Petrol `#0F4552` für … Fokus“**. Welche Form gilt, ist eine Entscheidung, kein Befund. Risiko wie im Papier benannt (Fokus auf Petrolflächen); dazu V-13 im Plan (Fokus setzt den Radius auf 8 px) im selben Schritt. |
| D4-A7 | teilweise | „Benutzer bearbeiten“, 1440: Feld „Eintrittsdatum …“ y 583, „Saldo-Startdatum …“ y 601 (Beschriftung 36 statt 18 px hoch). `/settings/rechnung`, 834: Schalterzeile 272×74 als Rasterzelle neben einem Feld, Etikett 66 px hoch. Messung stimmt; eine Regel über das Fluchten von Feldern einer Reihe steht in keiner Quelle. | **Vorsicht:** „Reihen unten ausrichten … im Formularraster in `lot.css`, wirkt überall“ ändert jedes Formular der App — das gehört nicht in das Paket „Einstellungen“ (dort steht es im Plan), sondern wäre ein Baustein-Umbau mit Durchsicht aller Formulare (Fehlertext am Feld, Deutsch-Zeile unter Datumsfeldern nach U10). Einfacher und ohne Nebenwirkung: die zwei Klammerzusätze als `hint` unter das Feld, der Schalter als `feld-breit` (die Klasse gibt es im Raster schon). |
| D4-A8 | teilweise | „Termin anlegen“, 1440: „Tag“ x 1013 und „Von“ x 1220 in einer Reihe (y 222), „Bis“ x 1013 allein (y 310). Bei 390 px stehen alle untereinander. Keine Regelquelle. | Unkritisch; im Plan keinem Paket zugeordnet. |
| D4-A9 | teilweise | `/settings/firma`, 1440: `.lot-einrichtung` 576×168, Blätter 1 128 breit; Felder 272 / 560 / 176·176·176 / 272; „Kontakt“ schneidet ab (`scrollWidth` 358 bei 270). Keine Regelquelle. | Der Hinweis steht nur bis zum ersten vollständigen Speichern (siehe D4-T15) — Aufwand für seine Breite lohnt kaum. |
| D4-A10 | bestätigt (nachgestellt) | Monat, 834, Touch: Tagesköpfe 18×51 (30 Stück), Zellen 18×34 bzw. 18×68, Balken 16×26 (ein Tag), 35×26, 53×26, 72×26. 1440: 31×55, Balken 27×26. style.md „mindestens 44–48 px große zentrale Touchziele“ trägt es. **Im Papier fehlt:** die Vorschau, die sich öffnet, hat „Vorheriger Tag“/„Nächster Tag“ (je 48×48) — ein daneben getippter Tag kostet einen Tipp. | Zur Entscheidung E-M siehe Abschnitt 4: so, wie sie im Plan steht, behebt sie die 18 px nicht. |
| D4-A11 | teilweise | `/accounting`: `div.ue-vergleich-zeile` `cursor: pointer`, Klick 700 px rechts vom Namen öffnet das Person-Fenster, kein Pfeil (kein `svg` in der Zeile), Name als Knopf 207×32 (1440) bzw. 230×32 (390) — bestätigt. Tag-Fenster: `li.zeile.zeile-ganz` ohne Zeichen — bestätigt. **Plattform: falsch.** Die Zeile ist `ListRow onOeffnen` (`PlattformView.tsx:318`), `cursor: pointer`; ein Klick in die leere Zeilenfläche öffnet „… verwalten“ (nachgestellt), und „Verwalten ›“ trägt bereits ein Pfeilzeichen (`.plattform-zeilenpfeil`, als erlaubtes Zeichen in `schriftskala.spec.ts`). | Plattform: es ginge nur darum, das Zeichen „›“ durch das Symbol „weiter“ zu ersetzen. „Notzugang“ aus der Zeile zu nehmen macht den Notfallweg einen Tipp länger — nicht ohne Not. `/accounting` bei 375 px: Zeile 343×79 mit „Gesamtsaldo —“ rechts; der Pfeil braucht dort Platz, den die Spalte heute hat — messen. |
| D4-A12 | teilweise | Zwei-Faktor-Seite (Attrappe umgeschrieben), 1440: Zeilen bei y 481, 499, 517, dann 550 (33 statt 18 px); „Abmelden“ `link inline-flex min-h-touch items-center`, 63×48. Code der App (`ZweiFaktorSeite.tsx`), nicht der Attrappe. Messung stimmt; keine Regelquelle (E97 ließ die Zeilenhöhen offen). | Unkritisch; „Abmelden“ ohne Passwort erreichbar halten. Im Plan keinem Paket zugeordnet. |
| D4-A13 | teilweise | (1) Namensspalte der Baustellen-Woche: „Wohnungseigentümergemein\|schaft Hauptstraße 112–118“ ohne Trennstrich — gesehen. **Ursache und Vorschlag falsch:** `.wp-name-titel` hat schon `overflow-wrap: break-word; hyphens: manual` (`lot-planung.css:167`), und der Kommentar sagt, warum: „Namen (Personen wie Baustellen) nie automatisch trennen“ — **Auftrag vom 25.10.2026** (`lot-planung.css:380`). (2) Personenkalender: Radius 4 px (`lot-uebersicht.css:308`, gemessen 61×60 bei 1440) — gegen „Radien nach Rolle“; „abwe-/send“ habe ich nicht erzeugt (Beispielperson ohne Abwesenheit im Monat), der Text „abwesend“ steht in `PersonKalender.tsx:46`. (3) `/time`, „Nacht 00:00 · Notdienst 09:00 · letzte 3 Monate“: zweizeilig bei 191 px Breite — gemessen. | (1) Der vorgeschlagene Wert ist der heutige — er ändert nichts; ein Trennstrich widerspräche dem Auftrag vom 25.10. Nicht anfassen. Im Plan keinem Paket zugeordnet. |
| D4-A14 | teilweise | „Einsatz bearbeiten“ (1440×2400): Zeile 1 — Beschriftung „Menge“ y 1440, Feld y 1464, Name ab y 1423 daneben, „Lager: 4 · Rohrleitungen“ y 1494, `span.stand-warn` „fehlt 2“ y 1517, darunter „Im Lager fehlen 2.“ mit Knopf (227×48); Zeile 2 — Feld y 1648, Name y 1674. Messung stimmt; die Doppelung gehört zu D4-T7, eine Regel über das Fluchten gibt es nicht. | Bleibt wie im Papier; zusätzlich: der Zustand „frei“/„Bestand unbekannt“ an der Zeile und die Deutung „fehlt“ gegen offene Anforderungen (`materialDeckung.ts:68`). |

### B — Unstimmigkeiten zwischen Seiten

| Kürzel | Urteil | Eigener Beleg | Zum Vorschlag |
|---|---|---|---|
| D4-B1 | teilweise | Jeden Schalter jeder der 15 Unterseiten einzeln umgelegt (`b1.out`). **Sofort** (ein Schreibaufruf beim Tippen, keine Leiste): Mein Konto 10 von 10, Module 15 von 25 direkt, 9 erst nach Rückfrage, 1 gesperrt. **Erst mit „Speichern“** (Leiste erscheint, kein Aufruf): Personal **8 von 8** (nicht „6 von 8“), Rechnungsvorgaben 2, **Zeitfelder 7** und **Fahrzeuge 1** (fehlen im Papier), Firmendaten 1 (in der Vorschau gesperrt, am Code `setEingetragen`). Leisten: Personal je Blatt (5 geändert → 5 Leisten, bei 1440 `position: static`, bei 390 `sticky`, je zwei im Bild); Speichern eines Blatts schreibt nur dieses (`wochenplanSpeichern`+1), die anderen bleiben offen. „Je Seite“ stimmt nur für Firma: Sätze hat zwei Leisten („Sätze speichern“ frei, „Katalog-Einstellungen speichern“ im Blatt), Rechnungsvorgaben zwei. | Siehe Abschnitt 3 und 4 (Entscheidung E-E). Kurz: „Schalter, der erst mit Speichern gilt“ ist **kein Verstoß**, sondern von E95 verlangt; die Leiste je Blatt ist in style.md (U1, Muster 3) ausdrücklich vorgesehen; und die Trennung „sofort nur Module und Mein Konto“ **ist heute schon der Stand**. |
| D4-B2 | bestätigt (nachgestellt) | `/accounting` und `/user-mgmt`: `h3` 12 px/400, `uppercase`, Sperrung 1,2 px. Startseite „Dringend“: 13 px/500, normal. Planung: `v10Stil.test.ts:683` verbietet Versalien an `.planung-gruppe`. | Die normale Form ist durch einen Wächter gedeckt; die Versalien-Köpfe stehen auf zwei Seiten — die Richtung des Papiers stimmt. |
| D4-B3 | bestätigt (am Code) | Im Bereich 13 Zeilen mit „→“, 6 mit „›“ (eigene Zählung, gleiche Werte); gesehen „und 2 weitere →“ (Start), „Mitarbeiterübersicht öffnen →“ (Akte). | Den Baustein gibt es schon: `.link-weiter` hängt „›“ selbst an (`index.css:893–931`). Kein neuer Baustein „link-still-weiter“ nötig. |
| D4-B4 | bestätigt (am Code) | Vier Umsetzungen: `.monatskalender` (Tag-Planung), `.kal`/`.kal-tag` (Monat am Handy), Tabelle in „Urlaub im Monat“, `.pk-tag-*` (Personenkalender, 4 px). Radien der anderen drei nicht nachgemessen. | Groß, wie benannt. Fehlt bei „bleibt“: die Zähler je Tag (Urlaub), das Senkblei „heute“ (E77), Punkt „Termine an diesem Tag“, die Tastaturwege je Kalender. |
| D4-B5 | bestätigt (am Code) | `/accounting`: `input.ue-suche` 240×44 ohne Lupe, Platzhalter als Name; Übersicht der Einstellungen: `InputField` mit Beschriftung „Einstellung suchen“; `/user-mgmt`, Plattform: `Listenleiste`; Ablage ab 9 (`ablage.ts:12`). | Schwelle „ab 9“ auf Personenlisten zu übertragen nimmt einem Betrieb mit 7 Leuten die Suche, die er heute hat — eher weglassen. `?suche=` aus der globalen Suche muss weiter ankommen (E91). |
| D4-B6 | bestätigt (nachgestellt) | Planung 1440: `.segment` „Sicht“ x 1041–1200, „Zeitraum“ x 1211–1400 (11 px Abstand). `/accounting`: Segment y 315, Schalter y 376, Wechselknopf y 436. | style.md („Steuerungen und Zustände“) nennt beide Gruppen als Texttabs — sie zu trennen ist erlaubt; gemerkte Ansicht und Unteradressen bleiben. |
| D4-B7 | bestätigt (nachgestellt) | Plattform „Betrieb anlegen“ x 296 (links), Zwei-Faktor „Anmelden“ 104×48 links, Anmeldung 334 px (volle Breite). Urlaub/Benutzer nicht einzeln gemessen. | — |
| D4-B8 | bestätigt (nachgestellt) | Plattform „… verwalten“: kein Fuß, „Deaktivieren“ (101×44) und „Als Testbetrieb kennzeichnen“ im Körper; Termin: „Abbrechen“ + „Termin anlegen“; Einsatz: „Ganzen Tag ansehen“ + Speichern; Tag-Fenster: „In ‚Tag‘ öffnen“ + „Einsatz planen“. | Plattform: der Grund ist Pflicht **vor** jedem Schritt („Für jeden Schritt zuerst oben einen Grund eintragen“) — im ⋯ muss das Feld erreichbar bleiben. |
| D4-B9 | bestätigt (nachgestellt) | „Zu den Betrieben“ als Knopf 153×48 unter dem Seitenkopf; im Code 6 Stellen (`PlattformView.tsx:360, 497, 553, 612, 690, 694`), nicht 5. Im Plan keinem Paket zugeordnet. | — |
| D4-B10 | teilweise | Gesehen: „337:30“, „Soll 7:42“, „€ 46,00“ (Einrichtungsstand), „Sicherung“/„Datensicherung“, „+ Anzahlungskonto“/„+ Steuersatz“ neben „Warengruppe hinzufügen“, „ganzer Tag“ (`wochenTermine.ts:45`) neben „ganztags“. **Falsch:** „Urlaubsanspruch ändern“ und „Anspruch anpassen“ sind **zwei verschiedene Funktionen** (Jahresanspruch ab einem Tag, `ArbeitszeitVerlaufKarte.tsx:329`; einmalige Anpassung, `UrlaubsanspruchKarte.tsx:19` „Plan 10.3, Entscheidung 6“). | Die beiden Urlaubs-Knöpfe **nicht** auf ein Wort bringen. „ganzer Tag“ steht am Termin, „ganztags“ am Einsatz — beim Vereinheitlichen die Vorlesetexte mitziehen. |
| D4-B11 | bestätigt (nachgestellt) | Monat: Balken „WEG Hauptstraß“, „Neudorf“; Woche: Kundenname vierzeilig. | Siehe D4-I1. |
| D4-B12 | bestätigt (nachgestellt) | Attrappe umgeschrieben: Anmeldung — Bühne 720 px links, Karte 384 px, `h1` 28 px (auch bei 1440); Zwei-Faktor — `PageHeader` mit „ANMELDUNG“, `h1` 30 px, Blatt links; „Passwort vergessen?“ 13 px grau, „Telefon nicht zur Hand? …“ 15 px/500. „Willkommen“ nicht gesehen. Code der App. | — |
| D4-B13 | bestätigt (nachgestellt) | Woche: `button.eintrag-termin`; Tag-Fenster: `li.zeile-ganz` mit `button.zeile-ziel`, ohne Zeichen. Tag-Planung (Stift/Papierkorb) nicht geöffnet. | — |
| D4-B14 | bestätigt (nachgestellt) | `.schalter-zeile` 1 080×52 (Mein Konto; Etikett endet x 1304, Schalter x 1320) gegen 560×52 (Personal). `/time` nicht gemessen. | — |
| D4-B15 | bestätigt (nachgestellt) | Tag-Fenster 1440: gefüllt sind „Termin anlegen“ (48×48, Radius 999 px) und „Einsatz planen“ (134×48). Handy-Woche: schwebend „Einsatz planen“ (y 718) und der Kreis (y 562, also darüber, nicht „darunter“). | **E76 nennt genau diese Stellen als Auftrag** („Termin anlegen“: Karte „Termine“, Tagesfenster, Handy-Woche). E-N nimmt sie teilweise zurück — das sollte der Auftraggeber wissen (Abschnitt 4). |
| D4-B16 | bestätigt (nachgestellt) | `/vacations` 1440: „Genehmigen“ 102×44 (y 501), „Antrag einreichen“ 158×48 (y 1 633). Im Plan keinem Paket zugeordnet. | — |

### C — Bedienung

| Kürzel | Urteil | Eigener Beleg | Zum Vorschlag |
|---|---|---|---|
| D4-C1 | bestätigt (am Code) | Krankmeldung gibt es nur in `vacations/` und `time/TimeForm.tsx`, nicht unter `assignments/`. Fenster „Einsatz bearbeiten“: Inhalt 2 190 px bei 785 px Höhe (nachgestellt). Die Tippzahl (≈ 20) habe ich nicht durchgespielt. | (b) „ein Tipp tauscht“: der Tausch muss Aufgabe, Uhrzeit, Helfer-Kennzeichen und die Abholer der Rüstliste mitnehmen (Stand, Punkt P2: `app.ruestliste_umziehen`) — also über den vorhandenen Umplan-Weg, nicht als neues Löschen-und-Anlegen. (a) Rechte: wer krank melden darf, entscheidet weiter die Urlaubsseite. (c) „Material zugeklappt“ darf die Meldung „fehlt“ nicht verstecken. |
| D4-C2 | bestätigt (nachgestellt) | Woche 1440 und 834: Einsatz WEG am Mo 23.11. geöffnet (gewählt: Max Mustermann, Stefan Gruber). Feld „Tag“ auf Do 26.11.: Titel bleibt „Einsatz bearbeiten“, gewählt ist jetzt Jürgen Fasching (der Plan des Donnerstags), Hinweis „Für diese Baustelle ist der Tag bereits geplant … Speichern überschreibt sie“. Auf Fr 27.11. (kein Plan): Titel „Einsatz planen“, **niemand** gewählt. Verschoben oder kopiert wird nichts; Speichern schreibt den anderen Tag. Tab-Halte im Raster: 66 bei fünf Personen (jede Zelle, jede Kachel und ihre vier Leistenknöpfe). | **Gegen die im Plan genannte Variante „das Feld ‚Tag‘ verschiebt den Einsatz“:** dasselbe Feld wählt in „Einsatz planen“ den Tag (es darf dort nicht entfallen); das Formular gilt je Baustelle und Tag für mehrere Personen; am Ziel kann schon ein Plan stehen (hier: Donnerstag) — Verschieben hieße zusammenführen oder überschreiben. Der sichere Weg ist der zweite: „Verschieben …“ ins ⋯ des Fensters (öffnet `VerschiebenFenster`, das die Rüstliste mitnimmt) und das Feld umbenennen. Pfeiltasten im Raster: das Monatsraster hat das Muster schon (`tabIndex={i === tabTag ? 0 : -1}`). |
| D4-C3 | bestätigt (am Code) | `UserMgmtView.tsx:281/283`: Meldung „… angelegt — Passwort-Mail versendet“ ohne Verweis; 1440: Formular ab y 168, Liste „Benutzer (7)“ ab y 1 320. | „Noch zu tun“ in der Akte wäre ein neues Blatt mit eigenem Zustand — nach E-T (Regel 6) nur, solange etwas offen ist. |
| D4-C4 | bestätigt (nachgestellt) | Attrappe: `company.zeitMonatsabschluss`. Oktober: Kennzahl „ABSCHLUSS · offen · noch nicht abgeschlossen“ ist ein `div` mit `cursor: auto`; ⋯ zeigt „Monats-CSV“, „Monat abschließen“; Rückfrage „Oktober 2026 abschließen? Danach lässt sich in diesem Monat nichts mehr buchen …“ (das Papier kannte sie nur aus dem Code). | Überschneidet sich mit Z-7 (Paket 17: „‚Monat abschließen‘ prüft und zeigt nichts“) — zusammen bauen. Im Plan keinem Paket zugeordnet. |
| D4-C5 | bestätigt (nachgestellt) | 1440: „Offene Anträge“ y 384, „Antrag stellen“ y 1 176, „Sonderurlaub und Arztbesuche bestätigen“ y 1 776; Tage am Antrag gekürzt („Mo 23.11., Di 24.11., Mi 25.11. …“). Im Plan keinem Paket zugeordnet. | Adressen von der Startseite (`?…`) müssen weiter beim Antrag landen. |
| D4-C6 | bestätigt (nachgestellt) | Formular 560 von 1 128 px; „Hauptfarbe (#rrggbb)“ ohne Farbprobe. Im Plan keinem Paket zugeordnet (über D4-I4 in 16). | — |
| D4-C7 | bestätigt (am Code) | `LoginPage.tsx:242–246`: die Bestätigung steht als `Hinweiszeile role="status"` zwischen Feldern und Absendeknopf; kein „Passwort anzeigen“ in `Field.tsx`/`auth/`. Den Erfolgsfall habe ich nicht erzeugt (meine Attrappe meldete einen Sendefehler). | Die gleiche Antwort für vorhandene und fehlende Konten bleibt. |
| D4-C8 | bestätigt (nachgestellt) | Platzhalter „Name des Betriebs“ unter der Beschriftung „Name des Betriebs“; Satz „Alle Felder ausfüllen — dann lässt sich der Betrieb anlegen.“ über dem Knopf. | — |
| D4-C9 | bestätigt (nachgestellt) | 15 Reiter in 2 Zeilen, Leiste 96 px (1440); 390: `scrollWidth` 1 662 bei 358. Suche der Übersicht: „Logo“, „Passwort“, „Skonto“, „Briefkopf“, „Kalender-Abo“ finden; „dunkel“, „Darstellung“, „Monatsabschluss“, „Mahnung“, „Lehrling“, „Timer“ nichts. Strg+K: „Firmendaten“ findet, „Skonto“, „Logo“, „Briefkopf“, „Mahnung“ nicht. | — |
| D4-C10 | bestätigt (nachgestellt) | 390: erste Zeile der Liste y 772 (Fenster 844), Fußinsel ab y 774; bei 375×812: y 796, Fußinsel ab 742. Im Plan keinem Paket zugeordnet. | U13 legt die Handy-Zeile fest (Name, Stand, Gesamtsaldo) — nur die Steuerungen darüber verdichten. |
| D4-C11 | **widerlegt** | In einer **fremden** Akte hat das Blatt „Zugang“ den Knopf „Konto deaktivieren“ (`BenutzerakteView.tsx:341–360`, nachgestellt mit einer als `u3` angemeldeten Attrappe: „Zugang · Passwort-Mail senden · Konto deaktivieren · Auf Benutzername umstellen …“). Der Autor sah die eigene Akte (die Vorschau zeigt immer `u1`); dort steht statt des Knopfs der Satz „Das eigene Konto lässt sich nicht sperren …“. | Nichts zu bauen. Aus Paket 15 streichen. Offen bleibt nur der Name des Reiters („Zugang und Rechte“ ohne Rechte). |
| D4-C12 | bestätigt (nachgestellt) | 1440×900: Raster 665 px hoch (Inhalt 1 184), Kopf 105; Zeilen 131 (Anton, Max), 158, 176, 255 px; 834: 91–197 px. Leere Zeile 52 px (großer Bestand: 43 von 48 Zeilen). | **Einschränkung:** die Beispieldaten tragen absichtlich lange Namen (`tools/vorschau/README.md`). Die 131 px entstehen aus einem vierzeiligen Kundennamen; mit einem einzeiligen Namen ist die Kachel heute 68 px, die Zeile 77 px. Die Hochrechnung „2,6 Bildschirme“ ist eine Annahme über lange Namen, kein Messwert. |
| D4-C13 | bestätigt (nachgestellt) | `/gibtsnicht` zeigt die Startseite; `src/app/App.tsx:657` `<Route path="*" element={<Navigate to="/" replace />} />`. | Die alten Weiterleitungen stehen davor (`/admin-orders`, `/stock`, `/notifications`, `/modules`) und bleiben. |

### I — Ideen

| Kürzel | Urteil | Eigener Beleg | Risiko |
|---|---|---|---|
| D4-I1 | teilweise | Simuliert im Browser (Titel auf zwei Zeilen begrenzt, Nummer ausgeblendet), 1440: Zeilen 255→201, 131→95, 131→77, 176→122, 158→122 px; Summe der fünf Personen 851→617 px (−27 %), Inhalt des Rasters 1 184→950. Also **nicht „~70 statt 131“ für jede Zeile**, und zwölf Monteure stehen damit nicht „fast auf einem Bildschirm“ (12 × 77 px = 924 px im besten Fall, dazu Gruppenköpfe 45 px und Kopf 105 px, bei 665 px Rasterhöhe). | Siehe Abschnitt 3: Unterscheidbarkeit zweier Baustellen desselben Kunden, Abweichung von der Ablage (E96 behält die Nummer), „Kunde nie abgeschnitten“. |
| D4-I2 | bestätigt (nachgestellt) | 15 gleichrangige Reiter (C9). | Jede Rolle sieht andere Reiter (Buchhaltung: Rechnungsvorgaben mit eigenem Formular, `SettingsView.tsx:659–665`); Gruppen dürfen für sie nicht leer stehen. Adressen, `UNTER`, `pruefen:links`, Strg+K-Einträge bleiben. |
| D4-I3 | bestätigt (nachgestellt) | C9. | Treffer nur für Seiten, die die Rolle sehen darf (Regel der globalen Suche, E91). |
| D4-I4 | bestätigt (nachgestellt) | Rechte Blatthälfte leer (Formular 560 von 1 128). | Wie im Papier: nur aus `belegLayout.ts`, sonst zeigt die Vorschau etwas anderes als der Beleg. Ab 760–1199 px ist kein Platz daneben. |
| D4-I5 | teilweise | Die Voraussetzung stimmt nicht ganz: die Startseite trägt die Einrichtung schon als Themen unter „Zu erledigen“ — gesehen „Keine Rechnung möglich: Firmendaten unvollständig · fehlt: Anschrift, gültige IBAN, Firmenbuchgericht“, „Basiszinssatz ab 01.07. fehlt“, „Ein nächtlicher Lauf steht aus“; in `start/einrichtung.ts:190–195` dazu „Kontenrahmen“, „Nur ein Leitungskonto ohne E-Mail“, „‚Im Firmenbuch eingetragen‘“. | Ein Blatt „Einrichten (2 von 6)“ stünde neben denselben Angaben — gegen Regel 2 von E-T („jede Angabe einmal“). Wenn, dann die Themen bündeln, nicht verdoppeln. |
| D4-I6 | bestätigt (nachgestellt) | Person-Fenster: 15 × `li.pf-zeile` (438×69) mit Knopf „Zeit erfassen“ 123×48. | Bei Personen mit Buchungen stehen an der Zeile „bearbeiten“ und „löschen“ — die Zeile kann dann nicht nur „öffnen“. Im Plan keinem Paket zugeordnet. |
| D4-I7 | bestätigt (am Code) | `StartseiteAnpassen.tsx` (Kästchen-Auswahl, in `schalterRegel.test.ts` gelistet); Ziehen nicht geprüft. Plan: „Später“. | — |
| D4-I8 | bestätigt (nachgestellt) | „Eingeschaltet: 11 von 11“ über 23 Schaltern; „Teil von …“ je Unterfähigkeit. | — |
| D4-I9 | bestätigt (nachgestellt) | Blätter „Meine Nachrichten“, „Passwort“, „Auf allen Geräten“ mit je einem Knopf. | Das Zwei-Faktor-Blatt und die Pflicht für den Betrieb bleiben eigene Blätter. |
| D4-I10 | bestätigt (nachgestellt) | Projektleiter, 1440: „Dein Einsatz heute · 4 Einsätze“ 312×2 400 bei x 1088. Beispieldaten (vier Einsätze am Tag). Im Plan keinem Paket zugeordnet. | E98 hat die Einsatz-Vorschau gerade gebaut — nicht ohne Auftrag umstellen. |
| D4-I11 | bestätigt (nachgestellt) | Profil: Blatt „Geburtsdatum“ mit dem einen Knopf „Geburtsdatum bearbeiten“. | Das Datum bleibt verdeckt (Jugendschutz). |

### T — zu viel Text

| Kürzel | Urteil | Steht es so da? Entbehrlich? Wo bliebe es? |
|---|---|---|
| D4-T1 | teilweise | Alle zehn Untertitel stehen wörtlich im Code (`VacationsView.tsx:1316`, `UserMgmtView.tsx:322`, `SettingsView.tsx:82–84`, `NachrichtenEinstellungen.tsx:120`, `ModulesView.tsx:207`, `NotificationSettings.tsx:260`, `PlanungsKopf.tsx:44`, `AccountingView.tsx:1053`). **Falsch:** „am Handy kostet er eine Zeile“ — am Handy ist der beschreibende Untertitel schon ausgeblendet und steht in der Hilfe (`lot-planlinie.css:209`, E86; bei 375 px gemessen: kein Untertitel). **Widerspruch:** E86 sagt „Ab dem Tablet bleibt der Plankopf, wie er ist“; E25 nennt als **Grenze mit Grund**, dass Urlaub (und Nachkalkulation, Handwerksscheine, Sonderurlaub) den Untertitel behalten, „das Prüfungen und Handbuch beim Wort nehmen“. Je Untertitel hängen 1–2 Prüfungen daran. |
| D4-T2 | teilweise | „Montag, 23.11.2026 · Rolle: Geschäftsführung“ steht da (`DashboardView.tsx:355–356`). „Die Rolle ist immer gleich“ stimmt nicht: im Supportzugang steht dort „Support (lesend)“ bzw. „Support (mitarbeiten)“ (`lib/rolleAnzeige.ts`, Testbericht G21). In der Seitenleiste steht die Rolle (gesehen); am Handy gibt es keine Seitenleiste. Vor dem Streichen sicherstellen, dass der Einblick woanders sichtbar bleibt. |
| D4-T3 | bestätigt (am Code) | Wörtlich in `DashboardView.tsx:477–483`; erscheint nur, wenn etwas nicht lädt. „Reiter oben“ passt weder am Schreibtisch noch am Handy. Der Kern („was fehlt, heißt nicht, dass nichts ansteht“) schützt vor einem Fehlschluss — kürzen, nicht streichen. |
| D4-T4 | bestätigt (nachgestellt) | „Personal“: 164 Zeichen, „Sätze und Kosten“ 148. Die Liste bleibt Suchstoff. |
| D4-T5 | bestätigt (nachgestellt) | „Betrifft: …“ je Modul; Seite 3 408 px (1440). **Lücke im Vorschlag:** beim Ausschalten zeigten 9 Schalter eine Rückfrage, 12 schalteten direkt aus — für sie hat „Betrifft“ in der Rückfrage keinen Ort. Dann aufklappbar an der Zeile. |
| D4-T6 | bestätigt (nachgestellt) | Beide Sätze stehen im Fenster (`EinsatzFormular.tsx:1043`, `:1057`). Der zweite bleibt (er trägt das Überschreiben — siehe C2). |
| D4-T7 | bestätigt (nachgestellt) | „fehlt 2“ und „Im Lager fehlen 2.“ (A14). |
| D4-T8 | bestätigt (nachgestellt) | Profil „Arbeitszeit und Urlaub“ (Wochenstunden 40, Urlaubstage 25, Arbeitstage) und „Startwerte des Zeitkontos“; Reiter 2 „Zeitkonto-Einstellungen“ (dieselben Werte samt Startwerten) und „Arbeitszeit und Anspruch ab einem Tag“. Vorsicht: „Urlaubsanspruch“ (Anpassung) ist ein eigenes Blatt mit eigener Funktion (B10). |
| D4-T9 | **widerlegt** | Der Satz „Das eigene Konto lässt sich nicht sperren …“ steht schon **nur** in der eigenen Akte (`eigenesKonto ? … : <Button>Konto deaktivieren`), und der zweite Absatz erklärt in jeder fremden Akte den Knopf direkt darüber. Gesehen wurde die eigene Akte (Vorschau). |
| D4-T10 | bestätigt (nachgestellt) | „Soll 7:42“ in jeder der 15 Zeilen. |
| D4-T11 | bestätigt (nachgestellt) | „November 2026 · Dieser Monat · Stand Mo 23.11.“ in der Kennzahl und unter der Monatsleiste (`AccountingView.tsx:1008`). Projektauswertung nicht geöffnet. |
| D4-T12 | bestätigt (nachgestellt) | Baustellensicht: Termin-Kachel „Lieferung · 08:00–10:00 · Wohnungseigentümergemeinschaft …“ (136×120), Einsatz „… · ganztags“. **Vorsicht:** die dritte Zeile ist der **Ort des Termins** (`terminOrtKurz`: `ortName`, sonst Nummer) — er gleicht der Baustelle nur, wenn der Termin dort ist. Nur dann weglassen. |
| D4-T13 | teilweise | Die Nummer steht nur ab 1 200 px in der Kachel (`lot-planung.css:315–317`); am Tablet und Handy fehlt sie schon. Zum Risiko siehe I1. |
| D4-T14 | bestätigt (nachgestellt) | Drei Blatt-Titel mit „Mo., 23.11.2026“ (A1). |
| D4-T15 | teilweise | Firmenbuch-Satz (`FirmendatenView.tsx:469`) und „Hauptfarbe (#rrggbb)“ (`:582`) stehen da. **Falsch:** der Hinweis „Bereit für den ersten Beleg?“ steht bereits nur, solange der gespeicherte Briefkopf unvollständig ist (`:320`: `einrichtungsstand(company)[0].wort === 'offen'`); in den Beispieldaten fehlen PLZ und Ort — er steht also zu Recht. |
| D4-T16 | bestätigt (nachgestellt) | Blatt „Kommen die Meldungen an?“ mit dem einen Satz. |
| D4-T17 | bestätigt (nachgestellt) | „angelegt am 08.09.2026 · 1 Leitungskonto, 0 mit E-Mail“ je Zeile; Absatz „Aktiv. Deaktivieren sperrt alle Konten …“ im Fenster. |
| D4-T18 | bestätigt (nachgestellt) | Wörtlich auf der Zwei-Faktor-Seite. Aufklappen ist in Ordnung, solange die Zeile ohne Anmeldung erreichbar bleibt. |
| D4-T19 | bestätigt (nachgestellt) | „Mit den Zugangsdaten deines Betriebs anmelden.“ (13 px) und Sternchen an beiden Feldern. Das Sternchen ist der allgemeine Baustein der Pflichtfelder (U5 nennt ihn) — nur hier wegzulassen wäre eine Ausnahme. |
| D4-T20 | bestätigt (nachgestellt) | „Kein Startdatum konfiguriert“ (`TimeView.tsx:881`). In der Vorschau steht er, weil das Stammdatenblatt der Attrappe nicht lädt; in der App, wenn kein Saldo-Start hinterlegt ist. |
| D4-T21 | bestätigt (nachgestellt) | Start: „verrechnen · Wohnungseigentümergemeinschaft … · 27:02 Std seit 15.09.2026“ (375 px: 343×115); Tag-Fenster: „B-2026-0147 · ganztags · Jürgen Fasching (Helfer), Stefan Gruber“ und „Am selben Tag: …“. |

### P — statt der Punkte

Die Beispiele stehen alle so im Bild. Geprüft ist zusätzlich, ob die vorgeschlagene Form bei 375 px
(Zeile innen 311 px) und in der Wochenkachel (innen rund 120 px) Platz hat — mit gemessenen Textbreiten
in den Schriften der App (`p.out`).

| Kürzel | Urteil | Beleg | Trägt die Form bei 375 px / in der Kachel? |
|---|---|---|---|
| D4-P1 | bestätigt (nachgestellt) | „Start · KW 48“, „Montag, 23.11.2026 · Rolle: …“, „KW 48 · 23.11. – 29.11.“ | Ja. Die Dachzeile nennt auf allen anderen Seiten den Bereich („TEAM“, „AUFTRÄGE“) — „KW 48“ allein wäre die Ausnahme. |
| D4-P2 | teilweise | „71 Tage · € 29 592,60 · 2 Mahnungen fällig“, „seit 01.07. · Einstellungen · Rechnungsvorgaben“ | Nur bei kurzen Titeln: „2 Rechnungen überfällig“ 166 px + „€ 29 592,60“ 99 px passt. „1 Baustelle mit Stunden nicht verrechnet“ 279 px + „27:02 Std“ 81 px = 360 px > 311 — der Titel bricht um, die Angabe (336 px) auch: vier Zeilen wie heute, nicht zwei (E-T, Regel 5). Wo am Handy das Wort der Aktion bleibt („verrechnen“, „entscheiden“ — heute das erste Glied), sagt der Vorschlag nicht. |
| D4-P3 | bestätigt (nachgestellt) | „Deine Termine heute · 1 Termin“, „Dein Einsatz heute · 4 Einsätze“ gegen „Benutzer (7)“, „Offene Anträge (1)“ | Ja. Das Papier empfiehlt die häufigere Form „(n)“; der Plan wählt „Zahl rechts im Kartenkopf“ (Abschnitt 4). |
| D4-P4 | bestätigt (nachgestellt) | „Lieferung (Aviso) · 08:00–10:00“ | 375 px: Zeitspalte 86 px + Art 118 px passt; der Ort (336 px) bricht in der Restbreite um. **Kachel: nein** (86 + 57 px > 120) — dort bleibt es gestapelt, wie das Papier selbst sagt. |
| D4-P5 | bestätigt (nachgestellt) | „B-2026-0147 · ganztags …“ | Der Stempel (91 px) fließt hinter dem Namen in die nächste Zeile — in Ordnung. Nicht für die Kachel. |
| D4-P6 | bestätigt (nachgestellt) | „Nacht 00:00 · Notdienst 09:00 · letzte 3 Monate“, „Wie zuletzt: 07:00–16:30 · …“ | 86 + 81 + 81 px mit Abständen ≈ 272 px: passt knapp. |
| D4-P7 | bestätigt (nachgestellt) | „Lehrling, 2. Lehrjahr · heute offen“, „Projektleiter · November 2026“ | 375 px: die Zeile ist nach U13 fest (Name, Stand, Gesamtsaldo; 343×79). Einstufung links (115 px) und „heute offen“ rechts (69 px) passen in eine Zeile — nicht als dritte Zeile bauen. |
| D4-P8 | bestätigt (nachgestellt) | „05.10.2026 – 16.10.2026 · 10 Tage“, „Urlaub · 05.10.2026 – 16.10.2026“ | 207 + 63 px in Mono 15: passt. |
| D4-P9 | bestätigt (nachgestellt) | „B-2026-0148 · ganztags · Lena Pichler (Helfer)“ | Titel 284 px + Zeit rechts 86 px > 311: der Titel bricht um; nicht schlechter als heute (72–125 px je Zeile). Rückfrage nicht geöffnet. |
| D4-P10 | bestätigt (nachgestellt) | „Dieser Monat · Stand Mo 23.11.“ | Ja. |
| D4-P11 | bestätigt (nachgestellt) | „Im Briefkopf: Musterstrasse 1 · 2700 Wiener Neustadt“ | Bleibt — richtig. |
| D4-P12 | bestätigt (nachgestellt) | „… · Im Plan ansehen“, „Lager: 4 · Rohrleitungen“ | Ja; dabei die Tastfläche des Verweises mitnehmen (V-5: 17 px). |

## 3. Nicht bestätigt — im Einzelnen

### D4-B1 und die Entscheidung E-E (ein Speichermodell)

**Was das Papier sagt:** zwei Speichermodelle mit demselben Schalter; Leiste je Seite gegen je Blatt;
Vorschlag: eine Leiste je Seite „wie Firma“, die geänderte Blätter nennt, Schalter mit Zusatz „noch
nicht gespeichert“.

**Was ich gefunden habe:**

1. **Der Schalter, der erst mit „Speichern“ gilt, ist erlaubt und verlangt.** `schalterRegel.test.ts`
   (zweiter Block, E95): „JEDES EIN/AUS EINER EINSTELLUNG ODER EIGENSCHAFT IST EIN SCHALTER, ob es sofort
   wirkt oder mit ‚Speichern‘.“ Ein Kästchen an dieser Stelle macht die Prüfung rot. Das Papier sagt das
   richtig („E95 will den Schalter auch im Formular — das bleibt“). Der Absatz „Schalter und Kästchen“
   in `style.md` (U6) ist dagegen noch der Stand vor E95 („Das Kästchen bleibt für die Auswahl in einem
   Formular, das erst mit ‚Speichern‘ gilt“) — er gehört berichtigt, sonst liest ihn der Nächste als Regel.
2. **Die Trennung, die E-E festlegt, besteht schon.** Sofort wirken heute nur die Schalter in „Module“
   und „Mein Konto“ (dazu die Pflicht zum zweiten Faktor im selben Reiter). Alle 19 übrigen Schalter der
   Einstellungen (Personal 8, Zeitfelder 7, Rechnungsvorgaben 2, Fahrzeuge 1, Firmendaten 1) gelten mit
   „Speichern“. Von E-E bleibt als Änderung also nur: **Leiste je Seite statt je Blatt** und die
   Kennzeichnung „gilt mit Speichern“.
3. **Die Leiste je Blatt ist die geschriebene Regel**, kein Wildwuchs: `style.md`, U1, Muster 3: „In einem
   Blatt klebt sie am unteren Rand des Blatts, frei am unteren Rand über der Fußinsel“ (§112: „erledigt“).
4. **„Wie Firma“ ist am Schreibtisch schlechter als heute.** Ab 1 200 px ist jede Speicherleiste
   `position: static` (`index.css:1337–1338`). Firmendaten, 1440×900: Firmenname (y 552) geändert — die
   Leiste steht bei y 2 202 von 2 350, **1 650 px unter dem Feld, nicht im Bild** (Bild
   `b1_firma_1440.png`). Auf „Personal“ erscheint sie heute im geänderten Blatt, direkt unter dem
   Schalter (y 652 im Fenster). Eine Leiste je Seite stünde dort am Ende von 3 600 px.
5. Die Zahl „6 von 8“ stimmt nicht (8 von 8); Zeitfelder und Fahrzeuge fehlen; „je Seite (Firma, Sätze)“
   stimmt für Sätze nicht.

**Was eine Leiste je Seite verlieren oder umständlicher machen würde:**

- **Sichtbarkeit am Schreibtisch** (Punkt 4) — nur vertretbar, wenn die Seitenleiste dort klebt. Das ist
  eine Änderung an `Speicherleiste`/`Aktionsleiste` für alle Formulare, mit `raster.spec.ts`,
  `flucht.spec.ts` und den Bewegungen (B4) im Schlepptau.
- **Verwerfen je Blatt:** heute nimmt „Verwerfen“ nur das eine Blatt zurück. Eine Seitenleiste verwirft
  alles oder braucht eine Auswahl.
- **Teilerfolg:** Personal speichert über sieben getrennte Aufrufe. Schlägt einer fehl (Prüfung im
  Urlaubsjahr, fehlendes Recht), muss die Leiste sagen, welches Blatt gespeichert ist und welches nicht —
  heute sagt das der Ort der Leiste. Das Papier nennt das als Rückschritt; der Plan nicht.
- **Rechte je Blatt:** „Wer Urlaub genehmigt“ und Teile der Rechnungsvorgaben sind an `isTopLevel`
  gebunden; die Buchhaltung speichert die Rechnungsvorgaben über eine eigene Funktion
  (`SettingsView.tsx:659–665`). Eine Leiste darf nicht mitspeichern wollen, was die Rolle nicht darf.
- **Enter im Feld:** Formulare mit Absendeknopf (`type="submit"`) speichern heute mit Enter ihr Blatt.
- **Am Handy** kleben heute je zwei Blattleisten gleichzeitig im Bild (gemessen) — das ist der eine
  echte Gewinn einer Seitenleiste.

**Zu ändern:** Papier: Zahlen berichtigen, Zeitfelder/Fahrzeuge ergänzen, den Satz zur Regel aufnehmen.
Plan, Paket 16: den Satz „wird der Schalter zum Kästchen-Ersatz …“ streichen oder klar fassen (er liest
sich wie „Kästchen statt Schalter“ — das wäre gegen E95); als Voraussetzung nennen: klebende Leiste ab
1 200 px, Teilerfolg, Verwerfen, Rechte je Blatt, Berichtigung von `style.md` (U1 und U6). Eine schonende
Fassung, die dasselbe Ziel erreicht: Leiste je Blatt behalten, am Handy nur die Leiste des zuletzt
geänderten Blatts kleben lassen, und den Zusatz „noch nicht gespeichert“ an die Schalterzeile.

### D4-I1 / D4-T13 (zweizeilige Kachel) und D4-C12

- **Nutzen überschätzt** (Messung in Abschnitt 2): −27 % Höhe in den Beispieldaten, nicht −47 %; zwölf
  Monteure passen auch dann nicht auf einen Bildschirm.
- **Unterscheidbarkeit:** Beispieldaten im Browser so umgeschrieben, dass Stefan Gruber am Mi 25.11. zwei
  Baustellen **desselben** Kunden hat. Heute, 1440: die Kacheln unterscheiden sich in Uhrzeit **und
  Nummer** („… / 07:00–15:30 / B-2026-0147“ gegen „… / 16:00–18:00 / B-2026-0148“). Heute, 834: nur in
  der Uhrzeit (die Nummer ist dort schon aus); ohne Uhrzeit steht nur der Ort — bei gleichem Ort sind die
  Kacheln am Tablet **schon heute gleich** (ein Befund, den das Papier nicht hat). Mit I1 fiele am
  Schreibtisch das letzte sichere Merkmal weg. Der Vorbehalt des Papiers („dann Kurzbezeichnung statt
  Kundenname“) reicht nicht: `bezeichnung` ist freiwillig (`types/index.ts:1037`), in den Beispieldaten
  hat keine Baustelle eine. Nötig: Kurzbezeichnung, **sonst die Nummer** — mindestens immer dann, wenn
  derselbe Kundenname in der Zeile oder am Tag zweimal steht.
- **„Wie die Ablage“ stimmt nicht:** E96 legt für die Ablage fest „Kunde und Kurzbezeichnung, darunter
  **die Nummer**“. Die Ablage ist also das Vorbild für „Name gekürzt, Nummer bleibt“.
- **Bewusste Regel:** `WochenEintraege.tsx:45` „Kunde (nie abgeschnitten — er bricht um)“; style.md:
  „Lange Kunden-, Baustellen- und Personennamen bleiben lesbar; bestehende Umbruch-, Trenn- … Regeln
  werden nicht geschwächt.“ Am Tablet gibt es kein Darüberfahren — der volle Name stünde dort erst im
  Fenster. E96 hat die Kachel am 17.11. gebaut; `einsatzbalken.test.ts` prüft „Text an derselben Stelle“.
- **Plan:** Paket 12 schreibt „rund 70 statt 131 px; bei 12 Monteuren fast auf einem Bildschirm“ — beides
  streichen bzw. durch die Messwerte ersetzen; „Kurzbezeichnung“ mit dem Rückfall auf die Nummer.

### D4-A10 und die Entscheidung E-M

Das Papier schlägt zwei Wege vor (seitlich rollen mit Spalten ≥ 44 px, oder die Handy-Form bis 1 199 px)
und sagt „vor dem Bau entscheiden lassen“. Der Plan hat daraus eine dritte Fassung gemacht: „Tag öffnet
das Tag-Fenster statt Tastflächen unter 44 px“. Die behebt den Messwert nicht — der Tageskopf bleibt
18 px breit, gleich, was sich öffnet. Und sie ersetzt die Vorschau, die heute beim Tipp aufgeht
(„Alle Einsätze“ mit „Bearbeiten“, „Zur Woche“, „Vorheriger/Nächster Tag“), durch ein anderes Fenster,
während Paket 12 „Monatsvorschau“ unter „bleibt gleich“ führt. Offen ist auch, was aus dem Tipp auf den
Balken und auf die Zelle je Person wird (heute: Vorschau genau dieses Einsatzes). **Zu ändern:** E-M neu
fassen und dem Auftraggeber die zwei Wege des Papiers vorlegen; „bleibt“: Vorschau je Tag und je Einsatz,
ganzer Monat ohne Rollen ab 1 200 px.

### D4-C11 und D4-T9 (widerlegt)

Beides entstand an der eigenen Akte (Vorschau). In fremden Akten steht „Konto deaktivieren“ im Blatt
„Zugang“; der Satz über das eigene Konto steht nur in der eigenen. Papier: beide streichen. Plan: C11 aus
Paket 15 nehmen; T9 aus der Zählung „88 Funde“.

### Übrige „teilweise“

- **D4-A4:** „Sie läuft von selbst.“ aus der Liste nehmen (Hinweis, 13 px nach E97).
- **D4-A5:** kein Linienfehler; bewusst und von drei Wächtern gedeckt. Als Unstimmigkeit führen oder lassen.
- **D4-A6:** zuerst entscheiden, welcher Wert gilt (E95: Petrol; style.md: `--focus-ring`).
- **D4-A7, A8, A9, A12, A14:** Messungen stimmen; keine Regelquelle — nach Abschnitt B umordnen. A7 nicht
  über das allgemeine Formularraster lösen.
- **D4-A11:** Plattform streichen (die Zeile öffnet schon, das Zeichen ist da).
- **D4-A13:** Punkt 1 streichen (Auftrag vom 25.10.2026; der Vorschlag ist der heutige Wert).
- **D4-B10:** die beiden Urlaubs-Knöpfe aus der Wörterliste nehmen (zwei Funktionen).
- **D4-I5:** auf die vorhandenen Einrichtungs-Themen der Startseite beziehen.
- **D4-T1:** „am Handy“ streichen; E25 (Grenze für Urlaub) und E86 nennen.
- **D4-T2:** Supportzugang nennen.
- **D4-T15:** Teil „Hinweis bleibt“ streichen (Bedingung steht schon im Code).
- **D4-P2:** Form für lange Titel und Ort des Aktionsworts am Handy festlegen.

## 4. Zum Plan

1. **Paket 16, E-E** — siehe oben. Der Kurztext in 4.3 („Speichern in zwei Modellen mit demselben
   Schalter“) lässt offen, dass E95 genau das verlangt; die eigentliche Änderung (Leiste je Seite) macht
   am Schreibtisch das Speichern unsichtbar, solange die Leiste dort nicht klebt.
2. **Paket 12, E-M** — nicht aus dem Papier, behebt die 18 px nicht, steht quer zu „bleibt gleich:
   Monatsvorschau“.
3. **Paket 12, „Feld ‚Tag‘ verschiebt den Einsatz“** — nicht bauen (siehe D4-C2); nur „Verschieben …“ im
   ⋯ und ein klarer Name des Felds. Der Kurztext in 4.4 („lädt einen anderen Tag, statt zu verschieben“)
   stimmt.
4. **Paket 12, D4-I1** — Kurztext („70 statt 131 px“, „fast auf einem Bildschirm“) ist durch die Messung
   nicht gedeckt; Rückfall auf die Nummer fehlt; Widerspruch zu „Kunde nie abgeschnitten“ und zu E96
   (Ablage mit Nummer) benennen. „Bleibt gleich“ ergänzen: `einsatzbalken.test.ts`, Vorlesetext mit
   Nummer (`WochenEintraege.tsx:131`), Konfliktzeile, Material-Zustand, Zusatz „Lieferung 08:00–10:00“.
5. **Paket 5 / E-N (D4-B15)** — E76 hat „Termin anlegen“ als runden Kreis ausdrücklich für „Tagesfenster“
   und „Handy-Woche“ beauftragt. E-N macht ihn im Fenster gerahmt. Das ist entschieden, aber im Plan steht
   nicht, dass damit ein Auftrag aus E76 an dieser Stelle zurückgenommen wird; am Handy (kein Fenster,
   schwebende Aktion) regelt E-N nichts.
6. **Paket 15** — D4-C11 streichen (widerlegt).
7. **Paket 8 / E-T, Regel 1** — E25 führt den Untertitel von Urlaub, Nachkalkulation, Handwerksscheinen
   und Sonderurlaub als Grenze mit Grund; E86 lässt den Kopf ab dem Tablet ausdrücklich stehen. Der Plan
   nennt richtig, dass der Untertitel am Handy schon fehlt, aber nicht diese beiden Festlegungen und nicht
   die Prüfungen, die die Untertitel beim Wort nehmen (je 1–2). In die „Liste der erlaubten Untertitel“
   gehören die vier aus E25, solange niemand die Grenze aufhebt. Zu Muster 3: „Betrifft“ der Module hat
   bei 12 Schaltern keine Rückfrage als Ziel.
8. **Paket 7 / E-P** — der Plan wählt für den Zähler „Zahl rechts im Kartenkopf“, das Papier (D4-P3)
   empfiehlt die häufigere Form „(n)“ am Titel. Die seltenere Form ändert jeden Titel mit Klammerzahl
   („Benutzer (7)“, „Betriebe (3)“, „Offene Anträge (1)“, „Zu erledigen (11 Themen)“) samt den Prüfungen,
   die Blätter beim Namen suchen. Entweder begründen oder die Form des Papiers nehmen. D4-P4 und P5 gelten
   nicht für die Wochenkachel; D4-P2 braucht eine Fassung für lange Titel.
9. **Paket 16 enthält D4-A7** mit dem Vorschlag „Formularraster in `lot.css`, wirkt überall“ — das ist
   ein Baustein-Umbau über alle Formulare und gehört, wenn überhaupt, nach Paket 5 mit eigenem Durchklick;
   für die zwei Fundstellen genügt die örtliche Lösung.
10. **Paket 6 (Wörterliste)** — „Urlaubsanspruch ändern“/„Anspruch anpassen“ ausnehmen (D4-B10).
    D4-A4 dort: „Sie läuft von selbst.“ ausnehmen.
11. **Keinem Paket zugeordnet**, obwohl 4.2 sagt, die übrigen seien „dem Paket in Abschnitt 7
    zugeordnet“: D4-A5, A8, A12, A13, B9, B16, C4, C5, C6, C10, I6, I10. C4 passt zu Z-7 (Paket 17),
    C5/B16 zu einem Urlaubs-Schritt, C10 zu Paket 5 (Listenleiste), A8/A12/B9 sind klein.
12. **Reihenfolge:** Paket 12 (Tag-Planung als Blatt, Fenster „Einsatz bearbeiten“) baut auf dem Fuß aus
    Paket 5 (Schritt 1 nennt „Einsatz bearbeiten“) — als Voraussetzung eintragen, sonst wird der Fuß
    zweimal umgebaut. Paket 15 („Leerer Betrieb“) nennt Paket 9 als Voraussetzung — richtig.
13. **Abschnitt 10 des Plans** sagt, 375 px sei nicht geprüft. Für die Punkte dieses Papiers habe ich
    375 px gemessen, wo es auf die Breite ankam (A1, C10, P-Formen, Start, Urlaub, Handy-Woche).

## 5. Geklärte Verdachtsfälle

Das Papier hat keinen eigenen Abschnitt „Verdacht“; aus „Nicht angesehen“ habe ich geklärt:

- **Rückfrage „Monat abschließen“**: geöffnet, Wortlaut wie im Code (D4-C4).
- **Benutzerakte fremder Personen**: mit umgeschriebener Attrappe geöffnet (D4-C11, T9).
- **Ablegen mit dem Finger**: nicht geklärt (die Attrappe lehnt das Umplanen ab).

Nebenbei gefunden, nicht im Papier:

- **Firmendaten am Schreibtisch:** nach einer Änderung im ersten Feld ist bei 1440×900 keine
  Speicherleiste im Bild (y 2 202 bei 900 px Fensterhöhe). §112 nennt die Leiste „klebend“; ab 1 200 px
  ist sie es nicht.
- **Zwei Baustellen desselben Kunden am Tablet:** ohne Uhrzeit und bei gleichem Ort tragen die Kacheln
  denselben sichtbaren Text (die Nummer ist unter 1 200 px ausgeblendet).
- **`style.md`, Absatz „Schalter und Kästchen“** widerspricht E95 und `schalterRegel.test.ts`.

## 6. Nicht geprüft

- Der Kopfabsatz des Papiers („was die Messung nicht fand“: kein Überlauf, keine Schrift außerhalb der
  Skala, keine Schatten, Kontraste im dunklen Satz) — nicht nachgemessen.
- Tippzahlen der Aufgaben C1, C3, C5, C6 — nicht Schritt für Schritt durchgespielt; geprüft ist, wo es
  stockt.
- „Willkommen“/erstes Passwort, Wiederherstellungscodes, QR-Schritt, Fehlertafel der `ErrorBoundary`.
- Erfolgsfall „Link anfordern“ (C7), Rückfragen „Einsatz verschieben“/„Einsatz entfernen?“ (P9),
  Projektauswertung (T11, zweiter Teil), Tag-Planung mit Stift/Papierkorb am Termin (B13), Radien der
  Kalender außer dem Personenkalender (B4), „abwe-/send“ (A13), `/time` „Korrekturanträge“ (B14).
- D4-A2 bei 390 px; D4-A10 mit echtem Finger (gemessen sind die Flächen, getippt wurde mit Playwright).
- Die Zählung „rund 60 Zeilen mit ‚·‘“ (Abschnitt 8 des Papiers).
- Dunkler Satz für alle hier gemessenen Stellen.
