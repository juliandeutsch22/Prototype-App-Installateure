# V10 „Warmes Papier“ – Abdeckung des Bestands

Bestandsaufnahme vor dem optischen Umbau. Stand: Commit `99b8787` (`main`, 13.11.2026).
Alles hier ist aus dem Code abgelesen (`src/app/App.tsx`, `src/app/navigation.ts`,
`src/app/guards.tsx`, `src/components/*`, `src/features/*`). Wo es nicht sicher
abzulesen war, steht „unklar“.

**Wie gelesen wurde.** Ein TypeScript-AST-Durchlauf über alle `.tsx`/`.ts` unter `src`
(ohne Tests) hat je Datei die Aufrufe von `BottomSheet`, `ConfirmDialog`, `RowMenu`,
`PageHeader`, `Segmente`, `Aktionsleiste`, `SignaturePad` und der Zustandsbausteine
aus `States.tsx` samt statischer Titel herausgezogen; dazu `useSearchParams`/`useParams`.
Jede Ansicht umfasst ihre Datei und alle `src/features/**/*.tsx`, die sie (auch über
mehrere Stufen) einbindet. Gemeinsame Bausteine aus `src/components` stehen in Abschnitt 3.
Dynamische Texte stehen als `{…}`; `a | b` heißt: einer von beiden, je nach Zustand.

**Rollenkürzel.** MA Mitarbeiter · VW Verwaltung · BH Buchhaltung · PL Projektleiter ·
GF Geschäftsführung · AD Administrator. `x` = sichtbar, `(x)` = nur mit Zusatzrecht.

**Breiten.** Handy bis 759 px, Tablet 760–1.199 (`md:`), Schreibtisch ab 1.200 (`lg:`).
`BottomSheet` ohne `auchBreit` erscheint nur am Handy; mit `auchBreit` ab Tablet als
Seitenfenster rechts (440 px, mit `breit` 480 px).

---

## 1. Routen

### 1.1 Weichen vor dem Router (`AppInhalt` in `src/app/App.tsx`)

Die Reihenfolge ist die Prüfreihenfolge; die erste zutreffende gewinnt.

| # | Bedingung | Gezeigt | Datei | Hülle |
|---|---|---|---|---|
| 1 | Pfad `/angebot/annehmen` (`ANNAHME_PFAD`) | Annahme-Link-Seite des Kunden; Schlüssel aus `#hash` | `features/angebotAnnahme/AngebotAnnahmeSeite.tsx` | ohne Layout, `ErrorBoundary ohneMelden` |
| 2 | gerade Zwei-Faktor eingerichtet (`neueCodes`) | „Zwei-Faktor-Anmeldung eingerichtet“ + `WiederherstellungsCodes` | `features/auth/ZweiFaktorEinrichten.tsx` | `MarkenBand`, ohne Layout |
| 3 | `zweiterFaktor` = `pruefen` oder `einrichten` | Zwei-Faktor-Seite | `features/auth/ZweiFaktorSeite.tsx` | ohne Layout |
| 4 | Rücksetzlink (`PASSWORD_RECOVERY`) oder Startpasswort offen | „Willkommen“ + `PasswortAendern erstmalig` + „Nicht dein Konto? Abmelden“ | `features/auth/PasswortAendern.tsx` | `MarkenBand`, ohne Layout |
| 5 | globaler Admin, kein Einblick, Pfad `/_muster` | Musterseite | `features/muster/MusterView.tsx` | nur `SeitenHilfeProvider` |
| 6 | globaler Admin, kein Einblick | Plattform (Adresse wird per `navigate` auf `/plattform` gesetzt) | `features/plattform/PlattformView.tsx` | eigene Hülle `PlattformHuelle` |
| 7 | sonst | Router (1.2) | – | – |

`/plattform` ist **keine** Route: für alle anderen Konten führt sie über `*` auf `/`.

### 1.2 Öffentliche Routen (ohne Anmeldung)

| Pfad | Ansicht | Zustände |
|---|---|---|
| `/login` | `features/auth/LoginPage.tsx` (fest eingebunden) | Anmelden (E-Mail oder Benutzername, Passwort, „Angemeldet bleiben“), „Passwort vergessen?“ → Formular „Passwort zurücksetzen“ („Link anfordern“, Bestätigungstext, „Zurück zur Anmeldung“); Fehlertext „Anmeldung fehlgeschlagen …“ |
| `/impressum` | `features/recht/ImpressumView.tsx` → `RechtSeite.tsx` | Laden (`LoadingState`), Fehler „Der Text ließ sich nicht laden“, „Zu dieser Seite ist noch keine Fassung veröffentlicht.“ |
| `/datenschutz` | `features/recht/DatenschutzView.tsx` → `RechtSeite.tsx` | wie Impressum |
| `/angebot/annehmen#…` | siehe 1.1 Nr. 1 | siehe 2.32 |

Alle drei Routen liegen in `ErrorBoundary ohneMelden` + `Suspense` (`LoadingState`).
`/*` liegt hinter `RequireAuth` (Laden: `StartLaden` „Anmeldung wird geprüft …“, ohne Konto → `/login` mit `state.from`) und in `Layout` → `ErrorBoundary` → `Suspense` (`SeitenPlatzhalter`) → `EinblickProtokoll`.

### 1.3 Angemeldete Routen (`AppRoutes`)

Wächter: `RequireNav path` liest Rolle, Modul und Zusatzrecht aus `NAV`. Fehlt die Rolle → „Kein Zugriff“ (`RequireRole`); ist das Modul aus → „{Modul} ist ausgeschaltet“ (`RequireModul`, beim AD mit Link „Unter ‚Module‘ wieder einschalten“). Akten (`/:id`) hängen am Eintrag ihrer Liste.

| Pfad | Ansicht (Datei unter `src/features/`) | MA | VW | BH | PL | GF | AD | Modul / Zusatzrecht | Unterreiter / Reiter (Adresse) | Deep-Link-Parameter |
|---|---|---|---|---|---|---|---|---|---|---|
| `/` | `dashboard/DashboardView.tsx` | x | x | x | x | x | x | Kern | – | – |
| `/_muster` | `muster/MusterView.tsx` | | | | | | x | `RequireRole ['Administrator']`, kein Menüpunkt | – | – |
| `/time` | `time/TimeView.tsx` | x | x | x | x | x | x | Kern | – | `?filter=fehlend`, `?datum=JJJJ-MM-TT`, `?korrektur=<id>` (Zeitkorrekturen); Router-State `projectNumber`/`asHelper` (von Start), `pruefen` (Zeitsitzung) |
| `/material` | `orders/OrderView.tsx` | x | x | | x | x | x | `material` | Abschnitte (keine Reiter) | `?reiter=meine` (springt zu „Meine Anforderungen“), `?status=Abholbereit` (Adressfilter), `?retoure=1`, `?baustelle=`, `?projekt=`, `?suche=` |
| `/anforderungen` | `orders/AdminOrdersView.tsx` | | x | | x | x | x | `material`, Zähler `anforderungen` | Segmente Laufend · Einkauf (Zahl) · Retouren · Erledigt — `?reiter=einkauf\|retouren\|erledigt` (Laufend ohne Parameter) | `?filter=offen\|eil\|abholbereit-alt\|bestellt-ueberfaellig\|lieferung-heute`, `?suche=` |
| `/lager` | `orders/StockView.tsx` | | x | | x | x | x | `material` | Segmente Bestand · Katalog (+ „Katalog einspielen“, „Offene Lieferantenartikel“, solange offen) — `?reiter=bestand\|katalog\|import\|zuordnen`; Bestandsfilter Alle · knapp · fehlt `?filter=` | `?ort=<Lagerort>`, `?suche=` |
| `/my-schedule/*` | `Unterreiter` → `mein`: `assignments/MyScheduleView.tsx`, `team`: `assignments/WochenplanView.tsx nurLesen` (→ `TeamWoche.tsx`) | x | | | (x) | | | `einsatzplanung`; PL nur mit Betriebsschalter `projektleitungImEinsatzplan` | `/my-schedule/mein` Meine Einsätze · `/my-schedule/team` Team-Woche (nur mit `wochenplanFuerAlle`; sonst keine Leiste) | – |
| `/vacations` | `vacations/VacationsView.tsx` | x | x | x | x | x | x | `urlaub`, Zähler `urlaub` | nur BH/GF/AD (`canEditTime`): Reiter Anträge · Krankenstände · Betriebsurlaub (Zustand, nicht in der Adresse) | `?reiter=antraege` (springt zu den offenen Anträgen) |
| `/sonderurlaub` | `vacations/SonderurlaubView.tsx` | x | x | x | x | x | x | Kern; im Menü nur bei `urlaub` **aus** (`nurOhneModul`), Adresse immer erreichbar | – | – |
| `/my-projects` | `projects/MyProjectsView.tsx` | x | | | | | | Kern | – | – |
| `/worksheets` | `worksheets/WorkSheetsListView.tsx` | x | x | x | x | x | x | `scheine` | Segmente Offen · Alle `?ansicht=` | `?filter=nicht-verrechnet\|nicht-verrechnet-alt` (Adressfilter), `?markiert=<id>` |
| `/worksheet` | `worksheets/WorkSheetView.tsx` | x | | | x | x | x | `RequireModul scheine` + `RequireRole SCHEIN_ROLLEN`; kein Menüpunkt | Schritte Zeiten · Material · Fotos · Unterschrift (am Schreibtisch eine Seite) | `?projekt=`, `?datum=`, `?entwurf=<id>` |
| `/costing` | `costing/NachkalkulationView.tsx` | | | | | x | x | `nachkalkulation` | Segmente Abgeschlossen · Laufend (Zustand) | – |
| `/quotes` | `quotes/QuotesView.tsx` | | | x | x | x | x | `angebote` | Segmente Offen · Erledigt · Alle `?ansicht=` | `?bearbeiten=<id>`, `?neueFassung=<id>`, `?kopie=<id>` |
| `/quotes/:id` | `quotes/AngebotView.tsx` | | | x | x | x | x | wie `/quotes` | – | `:id` |
| `/eingaenge` | `auftragseingang/EingaengeView.tsx` | | x | x | x | x | x | `baustellen.auftragseingang` | Segmente Offen (Zahl) · Übernommen · Abgelehnt `?stand=` | `?suche=` |
| `/eingaenge/:id` | `auftragseingang/EingangView.tsx` | | x | x | x | x | x | wie oben | – | `:id` |
| `/nachrichten` | `nachrichten/NachrichtenView.tsx` (Postfach) | x | x | x | x | x | x | `nachrichten`, Zähler `nachrichten`; Gruppe Start, Ortszeile „Team“ | Postfach-Reiter Alle · Direkt (nur mit `nachrichten.direktnachrichten`) · Baustellen · Ungelesen (Zustand) | – |
| `/nachrichten/:kanal` | `nachrichten/NachrichtenView.tsx` (Gespräch) | x | x | x | x | x | x | wie oben | – | `:kanal` |
| `/liegenschaften` | `liegenschaften/LiegenschaftenView.tsx` | | x | x | x | x | x | `kunden.liegenschaften` (ab Werk aus) | Segmente Aktiv · Alle `?auswahl=` | `?suche=` |
| `/liegenschaften/:id` | `liegenschaften/LiegenschaftView.tsx` | | x | x | x | x | x | wie oben | Aktenreiter Tops und Beteiligte · Baustellen (und Wartungen) · Stammdaten `?bereich=tops\|arbeiten\|daten` | `:id`, `?top=<id>`, `#l-…` |
| `/customers` | `customers/CustomersView.tsx` | | x | x | x | x | x | Kern | Segmente Alle · Anschrift prüfen (Zahl) · Ohne Kundenart (Zahl) `?auswahl=alle\|pruefen\|ohne-art` | – |
| `/customers/:id` | `customers/KundenakteView.tsx` | | x | x | x | x | x | Kern | Aktenreiter Übersicht · Baustellen · Belege · Termine und Wartungen (bzw. Wartungen / Termine) · Stammdaten `?bereich=uebersicht\|baustellen\|belege\|wartung\|daten` | `:id`, `#k-…` |
| `/wartungen` | `maintenance/WartungenView.tsx` | | x | | x | x | x | `wartung` (VW nur lesend) | Segmente Steht an (Zahl) · Alle `?ansicht=` | `?filter=faellig-ohne-baustelle` |
| `/admin-projects` | `projects/AdminProjectsView.tsx` | | | | x | x | x | Kern | Segmente Laufend · Erledigt · Alle `?stand=offen\|archiv\|alle` | `?filter=aktiv\|budget\|ohne-einsatz\|ohne-leitung\|ende-ueberschritten`, `?baustelle=` |
| `/admin-projects/:id` | `projects/BaustellenakteView.tsx` | | | | x | x | x | Kern | Aktenreiter Übersicht · Scheine (mit `scheine`) · Termine · Pläne `?bereich=uebersicht\|dokumente\|planung\|plaene` | `:id`, `#b-…` |
| `/assignments/*` | `Unterreiter ohneLeiste` → `woche`: `assignments/WochenplanView.tsx` (→ `Einsatzplanung.tsx`), `tag`: `assignments/AssignmentsView.tsx` | | | | x | x | x | `einsatzplanung` | `/assignments/woche` · `/assignments/tag`; Umschalter Woche · Monat · Tag im Seitenkopf (`PlanungsKopf`); Segmente Personen · Baustellen | Woche: `?ansicht=monat`, `?sicht=baustellen\|personen`, `?woche=`, `?tag=JJJJ-MM-TT`; Tag: `?datum=`, `?filter=unbesetzt`, Router-State (Übergabe) |
| `/user-mgmt` | `users/UserMgmtView.tsx` | | | | | x | x | Kern | Segmente Aktive · Deaktivierte (Zahl) · Alle `?status=aktiv\|inaktiv\|alle` | `?suche=` |
| `/user-mgmt/:uid` | `users/BenutzerakteView.tsx` | | | | | x | x | Kern | Aktenreiter Profil · Arbeitszeit und Urlaub · Zugang und Rechte (bzw. Datenschutz) `?bereich=profil\|arbeitszeit\|zugang` | `:uid`, `#akte-…` |
| `/settings/*` | `Unterreiter` (1.4) | x | x | x | x | x | x | Kern | 15 Unterseiten | je Unterseite |
| `/invoices` | `invoices/RechnungenSeite.tsx` → `InvoicesView.tsx` (BH/GF/AD) bzw. `RechnungenLesen.tsx` (PL) | | | x | (x) | x | x | `rechnungen`, Zähler `mahnungen`; PL nur mit `rechnungenLesen` | Segmente Offen · Erledigt · Alle `?ansicht=` | `?status=Offen\|Überfällig\|Teilbezahlt\|Bezahlt\|Überzahlt\|Storniert`, `?sicht=mahnung-faellig\|bezahlt-heute\|bezahlt-monat`, `?suche=`, `?oeffnen=<id>`, `?neu=<Projektnummer>`; PL: `?ansicht=`, `?suche=` |
| `/accounting` | `accounting/AccountingView.tsx` | | | x | | x | x | `zeitkonten` | Segmente Monat · Woche `?ansicht=woche` (nicht im Supporteinblick) | `?monat=JJJJ-MM`, `?tage=alle`, `?filter=luecken` bzw. `?nur=offen` |

Aktenreiter (`components/AktenBereiche.tsx`): Pfeiltasten/Pos1/Ende zwischen den Reitern; ein `#sprungziel` wählt den passenden Reiter und rollt dorthin.

**Weiterleitungen (`Navigate replace`)**

| Alt | Neu | Grund laut Code |
|---|---|---|
| `/material/anfordern` | `/material` | alte Unterreiter-Adresse |
| `/material/anforderungen` | `/anforderungen` | dto. |
| `/material/lager` | `/lager` | dto. |
| `/order` | `/material` | alte Push-Meldungen |
| `/admin-orders` | `/anforderungen` | dto. |
| `/stock` | `/lager` | dto. |
| `/notifications` | `/settings/meldungen` | dto. |
| `/modules` | `/settings/module` | dto. |
| `*` | `/` | unbekannte Adresse |

Innerhalb eines `Unterreiter` führt jede unbekannte oder für die Rolle gesperrte Unterseite auf die erste erlaubte (z. B. `/settings/module` als MA → `/settings/meldungen`); sieht die Rolle keine Unterseite → `/`.

### 1.4 Unterseiten von `/settings` (`UNTER['/settings']`)

| Adresse | Titel | Ansicht | MA | VW | BH | PL | GF | AD | Bedingung |
|---|---|---|---|---|---|---|---|---|---|
| `/settings/uebersicht` | Übersicht | `settings/EinstellungenUebersicht.tsx` | | | x | | x | x | – |
| `/settings/meldungen` | Mein Konto | `settings/NotificationSettings.tsx` | x | x | x | x | x | x | – |
| `/settings/firma` | Firmendaten | `settings/FirmendatenView.tsx` | | | | | x | x | – |
| `/settings/saetze` | Sätze und Kosten | `settings/SettingsView.tsx teil="saetze"` | | | | | x | x | – |
| `/settings/rechnung` | Rechnungsvorgaben | `SettingsView teil="rechnung"` | | | x | | x | x | – |
| `/settings/nummern` | Nummernkreise | `SettingsView teil="nummern"` | | | | | x | x | – |
| `/settings/personal` | Personal | `SettingsView teil="personal"` | | | | | x | x | – |
| `/settings/zeitfelder` | Zeitfelder | `settings/ZeitfelderView.tsx` | | | | | x | x | – |
| `/settings/fahrzeuge` | Fahrzeuge | `settings/FahrzeugeView.tsx` | | x | | x | x | x | Modul `material.lagerorte_fahrzeuglager` |
| `/settings/konten` | Kontenrahmen | `settings/KontenrahmenView.tsx` | | | x | | x | x | – |
| `/settings/support` | Supportzugang | `settings/SupportzugangView.tsx` | | | | | x | x | – |
| `/settings/module` | Module | `modules/ModulesView.tsx` | | | | | | x | – |
| `/settings/sicherung` | Datensicherung | `settings/SicherungView.tsx` | | | | | x | x | – |
| `/settings/papierkorb` | Papierkorb | `papierkorb/PapierkorbView.tsx` | | | | x | x | x | Modul `angebote` oder `scheine` |
| `/settings/nachrichten` | Nachrichten | `nachrichten/NachrichtenEinstellungen.tsx` | | | | | x | x | Modul `nachrichten` |

Startziel `/settings` → erste sichtbare Unterseite: BH/GF/AD `uebersicht`, sonst `meldungen`. Bei genau einer sichtbaren Unterseite (MA, ggf. VW/PL) keine Reiterleiste. Die Leiste steht unter dem `PageHeader` der Unterseite (`UnterreiterLeiste`), sonst darüber; am Handy/Tablet seitlich rollend, am Schreibtisch umbrechend.

### 1.5 Navigation (`src/app/navigation.ts`)

**Gruppen** (`NAV_GROUPS`): Start · Aufträge · Geld · Team · Material · Einstellungen. Ohne Überschrift: Start, Einstellungen (Einstellungen steht im Fuß der Seitenleiste).

**Reihenfolge** (`REIHENFOLGE`): `/`, `/nachrichten`, `/admin-projects`, `/assignments`, `/eingaenge`, `/my-schedule`, `/my-projects`, `/worksheets`, `/quotes`, `/customers`, `/liegenschaften`, `/wartungen`, `/invoices`, `/costing`, `/time`, `/vacations`, `/accounting`, `/user-mgmt`, `/material`, `/anforderungen`, `/lager`, `/settings` (`/sonderurlaub` ohne Rang → ans Ende seiner Gruppe).

| Eintrag | Label / Kurz | Gruppe | Symbol | Abzeichen |
|---|---|---|---|---|
| `/` | Start / Start | Start | home | – |
| `/nachrichten` | Nachrichten / Nachrichten | Start (Ort „Team“) | nachricht | `nachrichten` |
| `/admin-projects` | Baustellen / Baustellen | Aufträge | building | – |
| `/assignments` | Einsatzplanung / Planung | Aufträge | calendar | – |
| `/eingaenge` | Auftragseingang / Eingang | Aufträge | eingang | – |
| `/my-schedule` | Mein Einsatzplan / Plan | Aufträge | calendar | – |
| `/my-projects` | Meine Baustellen / Baustellen | Aufträge | building | – |
| `/worksheets` | Handwerksscheine / Scheine | Aufträge | pencil | – |
| `/quotes` | Angebote / Angebote | Aufträge | file | – |
| `/customers` | Kunden / Kunden | Aufträge | contact | – |
| `/liegenschaften` | Liegenschaften / Häuser | Aufträge | liegenschaft | – |
| `/wartungen` | Wartungen / Wartung | Aufträge | wrench | – |
| `/invoices` | Rechnungen / Rechnungen | Geld | receipt | `mahnungen` |
| `/costing` | Nachkalkulation / Kalkulation | Geld | calculator | – |
| `/time` | Zeiterfassung / Zeit | Team | clock | – |
| `/vacations` | Urlaub / Urlaub | Team | sun | `urlaub` |
| `/sonderurlaub` | Sonderurlaub / Sonderurl. | Team | sun | – |
| `/accounting` | Mitarbeiterübersicht / Übersicht | Team | chart | – |
| `/user-mgmt` | Benutzerverwaltung / Benutzer | Team | users | – |
| `/material` | Material anfordern / Material | Material | package | – |
| `/anforderungen` | Anforderungen / Anford. | Material | clipboard | `anforderungen` |
| `/lager` | Lager / Lager | Material | archive | – |
| `/settings` | Einstellungen / Einstellungen | Einstellungen | settings | – |

**Untere Leiste am Handy** (`LEISTE`, vier Plätze + „Mehr“; fehlt ein Wunsch wegen Modul, rückt der nächste sichtbare nach):

| Rolle | Plätze |
|---|---|
| MA | `/`, `/time`, `/my-schedule`, `/material` |
| VW | `/`, `/anforderungen`, `/customers`, `/time` |
| BH | `/`, `/invoices`, `/accounting`, `/time` |
| PL | `/`, `/assignments`, `/admin-projects`, `/material` |
| GF | `/`, `/assignments`, `/admin-projects`, `/invoices` |
| AD | `/`, `/assignments`, `/admin-projects`, `/invoices` |

**Zusatzrechte** (`zusatz`): PL bekommt `/my-schedule` mit Betriebsschalter `projektleitungImEinsatzplan`, `/invoices` mit Benutzerrecht `rechnungenLesen`.
**Module** (`modul`, `lib/module.ts`): `einsatzplanung`, `material`, `urlaub`, `scheine`, `angebote`, `rechnungen`, `nachkalkulation`, `wartung`, `zeitkonten`, `nachrichten` sowie die Unterfähigkeiten `baustellen.auftragseingang`, `kunden.liegenschaften` (Standard aus). Ohne `modul`: Kern.

---

## 2. Ansichten

Je Ansicht: Seitenfenster (`BottomSheet`), Rückfragen (`ConfirmDialog`), ⋯-Menüs (`RowMenu`), Sonderzustände, Gesten/Tasten, Exporte. „Datei“ ohne Pfad = derselbe Ordner wie die Ansicht. Wo eine Unterkomponente in mehreren Ansichten steckt, steht sie bei jeder.

Für **jede** Route unter `/*` gelten zusätzlich: „Kein Zugriff“ / „Modul ausgeschaltet“ (Wächter, 1.3), `SeitenPlatzhalter` beim Nachladen, Fehlertafel der `ErrorBoundary` (3.1), Seitenhilfe „Hilfe: {Titel}“ (3.1) und im Einblick ggf. `EinblickProtokoll` (3.1).

### 2.1 Start `/` — `dashboard/DashboardView.tsx`

| Element | Titel / Inhalt | Auslöser / Bedingung | Datei |
|---|---|---|---|
| PageHeader | „Dein Tag, {Vorname}“ (MA) bzw. „Heute im Überblick“; Hauptaktion „Zeit erfassen“ (MA mit Einsatz), Nebenaktion „Einsatzplanung“ (wer `/assignments/woche` darf); Kennzahlen im Kopf | Rolle | DashboardView.tsx |
| RowMenu ⋯ | „Startseite anpassen …“ | nicht im Einblick | DashboardView.tsx |
| BottomSheet | „Startseite anpassen“ | Menüpunkt | start/StartseiteAnpassen.tsx |
| BottomSheet | „Baustelle wechseln \| Baustelle wählen“ | Karte Arbeitstag | time/ArbeitstagKarte.tsx |
| BottomSheet | „Zeitsitzung verwerfen“ | Karte Arbeitstag | time/ArbeitstagKarte.tsx |
| Karten | `LaufWarnung` („Ein/Zwei nächtliche(r) Lauf/Läufe steht/stehen aus“), `ArbeitstagKarte` (Modul `zeiterfassung.timer`), `WartungHinweis` (nur VW), Hinweiszeile „Kein Eintrittsdatum hinterlegt“, `Handlungsbedarf`, `HeuteEigene`/`TermineHeute`/`HeuteListe`/`HeuteLeitung` | Startrolle `monteur\|verwaltung\|buchhaltung\|projektleitung\|leitung` | start/*.tsx |
| Zustände | Laden: `SkeletonMetrics` im Kopf + `SkeletonList` (5); „Aus den geladenen Bereichen steht nichts an.“ (Teilfehler); „Sonst ist nichts offen.“ (MA mit Einsatz); „Heute liegt nichts an“ (leer, Zeichnung „fertig“) | – | DashboardView.tsx |
| Exporte | – | | |

### 2.2 Zeiterfassung `/time` — `time/TimeView.tsx`

| Element | Titel / Inhalt | Auslöser / Bedingung | Datei |
|---|---|---|---|
| BottomSheet (nur Handy) | „Eintrag bearbeiten \| Neuer Eintrag“ (Formular `TimeForm`; ab Tablet unklar, ob inline) | `formularOffen` | TimeView.tsx |
| ConfirmDialog | „Eintrag löschen?“ | `toDelete` | TimeView.tsx |
| ConfirmDialog | „{Titel}“ / „Eintragen“ (Zeitraum-Rückfrage) | `zeitraumRueckfrage` | TimeForm.tsx |
| ConfirmDialog | „Grenze für Jugendliche“ / „Trotzdem speichern \| Trotzdem buchen“ | KJBG-Grenze | TimeForm.tsx |
| ConfirmDialog | „Auf mehrere Baustellen aufteilen“ / „Aufteilen“ | Knopf „Auf mehrere Baustellen aufteilen …“ | AufteilenDialog.tsx |
| ConfirmDialog | „{Art} von {Name} zurücknehmen?“ | Antragsknopf | AntragKnopf.tsx |
| BottomSheet | „Korrektur anfragen“; „Korrekturantrag“ (breit) | Modul `zeiterfassung.korrekturantraege`; `?korrektur=` | Zeitkorrekturen.tsx |
| BottomSheet | „Arbeitszeit buchen“; „Nicht buchen“ | Zeitsitzung prüfen | ZeitsitzungPanel.tsx |
| ConfirmDialog | „Gesicherten Entwurf entfernen?“ | Zeitsitzung | ZeitsitzungPanel.tsx |
| BottomSheet | „Baustelle wechseln \| Baustelle wählen“, „Zeitsitzung verwerfen“ | Karte Arbeitstag | ArbeitstagKarte.tsx |
| BottomSheet | „Krankmeldung“; darin „Ende ändern“, ConfirmDialog „Krankmeldung löschen?“, „Urlaubstage als Krankenstand?“ | Tipp auf Krank-Tag | vacations/Krankmeldungen.tsx (`KrankmeldungFenster`) |
| Aktionsleiste | feste Formularleiste | Formular | TimeForm.tsx |
| Zustände | `SkeletonList`, `ErrorState`, leer „Noch keine Zeiteinträge erfasst.“, „In den letzten fünf Wochen ist jeder Arbeitstag gebucht.“, `TeilFehler` „Dein Stammdatenblatt“; „Ältere Einträge laden“; Zeitsitzung: „Auf diesem Gerät vorgemerkt …“, „Die Sitzung liegt noch nicht auf dem Server …“, „Die Sitzung läuft auf dem Server noch …“, „Erneut laden“; Krankmeldung: „Diese Krankmeldung gibt es nicht mehr.“ | | |
| Offline | Buchungen werden vorgemerkt (Meldung `vorgemerktMeldung`) | | TimeForm.tsx |
| Exporte | – (kein Export in der Ansicht gefunden) | | |

### 2.3 Material anfordern `/material` — `orders/OrderView.tsx`

| Element | Titel / Inhalt | Auslöser / Bedingung | Datei |
|---|---|---|---|
| Abschnitte | „Zuletzt angefordert“, „Katalog“ (Listenleiste mit Suche), „Meine Anforderungen[: abholbereit] ({n})“, „Erledigt ({n})“, `MeinFahrzeug` | – | OrderView.tsx |
| BottomSheet | „{Material}“ (Anforderung) | Zeile | AnforderungFenster.tsx |
| BottomSheet | „Material zurückgeben“ | Retoure / `?retoure=1` | RetoureFenster.tsx |
| ConfirmDialog | „Material abgeholt?“ / „Abgeholt“ | `toPickUp` | OrderView.tsx |
| ConfirmDialog | „Als eilig markieren?“ / „Eilig“ | `eilFrage` | OrderView.tsx |
| ConfirmDialog | „Zurücklagern: {…} \| Umlagern: {…}“ | aus „Mein Fahrzeug“ | LagerDialoge.tsx (`UmlagernDialog`) über MeinFahrzeug.tsx |
| Zustände | `LoadingState`, `ErrorState` (Katalog), `TeilFehler`, leer „Noch kein Material im Katalog“ / „Kein Material passt zur Suche.“ (Zeichnung lager/suche), „Keine offenen Bestellungen.“, „Noch nichts erledigt.“, „Im Fahrzeug liegt nichts aus dem Lager.“; Adressfilter „nur abholbereite Anforderungen“ | | |
| Offline | Anforderung wird vorgemerkt | | OrderView.tsx |

### 2.4 Anforderungen `/anforderungen` — `orders/AdminOrdersView.tsx`

| Element | Titel / Inhalt | Auslöser / Bedingung | Datei |
|---|---|---|---|
| BottomSheet | „{Material} \| Anforderung“ | Zeile | AdminOrdersView.tsx |
| BottomSheet | „Material zurückgeben“ | Retoure | RetoureFenster.tsx |
| ConfirmDialog | „Auf die Einkaufsliste?“, „Bestellung abschließen?“ (primär), „Trotz Fehlbestand abholbereit?“, „{1\|n} Anforderung(en) weiterschalten?“ (Sammelleiste), „Retoure löschen? \| Anforderung löschen?“ | Zeilen-/Sammelaktionen | AdminOrdersView.tsx |
| ConfirmDialog | „Als bestellt markieren?“, „Erwarteter Liefertermin“ | Reiter Einkauf | Einkaufsliste.tsx |
| Sammelleiste | Mehrfachauswahl mit Aktion | Auswahl | AdminOrdersView.tsx |
| Zustände | `SkeletonList`; `ErrorState` „Die Anforderungen konnten nicht geladen werden — …“ / „Das eigene Material auf der Einkaufsliste konnte nicht geladen werden …“; leer je Reiter („Keine Retouren erfasst.“, „Noch nichts erledigt.“, „Zu diesem Filter steht nichts an.“, Suche); Einkaufsliste leer, „Noch kein Großhändler angelegt.“; Bestellvorschläge „Nichts vorzuschlagen …“ | | Bestellvorschlaege.tsx, Einkaufsliste.tsx |
| Exporte | Einkaufsliste: „PDF“ (Bestellung je Großhändler, `downloadBestellungPdf`) | Knopf | Einkaufsliste.tsx |

### 2.5 Lager `/lager` — `orders/StockView.tsx`

| Element | Titel / Inhalt | Auslöser / Bedingung | Datei |
|---|---|---|---|
| RowMenu ⋯ (Kopf) | „Inventur …“, „Umlagern …“ (mit weiteren Orten), „Lagerorte …“ (Lagerorte an + Recht), „Katalog einspielen“ (wer Einkaufspreise setzen darf), „Offene Lieferantenartikel“ | Rolle/Modul | StockView.tsx |
| BottomSheet | „{Artikel} \| Artikel“ | Zeile | StockView.tsx |
| BottomSheet | „Inventur: \| Umlagern: \| Wareneingang: Artikel wählen“ | Menü | StockView.tsx |
| BottomSheet | „Lagerort ändern \| Lager anlegen \| Lagerorte“ | Menü | LagerorteFenster.tsx |
| BottomSheet | „Material bearbeiten \| Neues Material“ | Reiter Katalog | MaterialCatalog.tsx |
| BottomSheet | „{Bezeichnung}“ (Lieferantenartikel zuordnen) | Reiter zuordnen | materials/OffeneLieferantenartikel.tsx |
| ConfirmDialog | „Wareneingang: {…}“, „Inventur: {…}“, „Zurücklagern/Umlagern: {…}“ | Artikel | LagerDialoge.tsx |
| ConfirmDialog | „Material löschen?“ | Katalog | MaterialCatalog.tsx |
| ConfirmDialog | „Lauf verwerfen?“ | Einspielen | materials/KatalogImport.tsx |
| ConfirmDialog | „Zuordnung lösen?“ | Preisvergleich | materials/Lieferantenvergleich.tsx |
| ConfirmDialog | „Als neuen Artikel anlegen?“ | zuordnen | materials/OffeneLieferantenartikel.tsx |
| Zustände | `SkeletonList` (mehrere), `ErrorState`, `TeilFehler`; leer „Noch kein Material im Katalog“, „Keine passenden Artikel.“, „Noch kein Artikel im Lager geführt …“, „{Ort}: hier liegt nichts …“, „Nichts offen“ | | |
| Import | Katalogdatei „Datei auswählen“ | Reiter import | materials/KatalogImport.tsx |

### 2.6 Mein Einsatzplan `/my-schedule/mein` — `assignments/MyScheduleView.tsx`; Team-Woche `/my-schedule/team` — `assignments/TeamWoche.tsx`

| Element | Titel / Inhalt | Auslöser / Bedingung | Datei |
|---|---|---|---|
| PageHeader | „Mein Einsatzplan“ / „Team-Woche“ | – | |
| Karten | Kalender, Einsätze, Urlaub; `KalenderAboKarte` („Kalender-Abo einrichten“, „Im Kalender öffnen“) | Betrieb `kalenderAboErlaubt`, nicht im Einblick | KalenderAboKarte.tsx |
| Zustände | `LoadingState`, `ErrorState`, `TeilFehler` („Die Pläne“); leer „Kein Einsatz an diesem Tag …“, „Nach heute ist nichts eingeplant. \| Zurzeit …“, „Kein kommender Urlaub beantragt.“; Team: „Im Außendienst ist niemand eingetragen …“ | | |
| Exporte | Pläne öffnen/laden (Blob, neues Fenster) | Plan | projects/PlaeneListe.tsx |
| Dialoge | keine | | |

### 2.7 Urlaub `/vacations` — `vacations/VacationsView.tsx`

| Element | Titel / Inhalt | Auslöser / Bedingung | Datei |
|---|---|---|---|
| Reiter | Anträge · Krankenstände · Betriebsurlaub | nur BH/GF/AD | VacationsView.tsx |
| Kopf | Kennzahlen Resturlaub / Beantragt (`SkeletonMetrics` beim Laden) | eigenes Zeitkonto | VacationsView.tsx |
| BottomSheet | „Urlaubsantrag \| Antrag auf Zeitausgleich“, „Antrag auf Sonderurlaub \| Arztbesuch“ | Antrag stellen | AntragFenster.tsx |
| ConfirmDialog | „Antrag von {…} ablehnen? \| Urlaub von {…} zurücknehmen?“, „Antrag zurückziehen?“ | Entscheidung / eigener Antrag | VacationsView.tsx |
| ConfirmDialog | „Arztbesuch ablehnen? \| Antrag ablehnen? \| … zurücknehmen?“ | Freistellungen | FreistellungenBestaetigen.tsx |
| ConfirmDialog | „Antrag zurückziehen?“ (Freistellung) | eigener Antrag | FreistellungListe.tsx |
| ConfirmDialog | „Betriebsurlaub anlegen?“, „Betriebsurlaub löschen?“ | Reiter Betriebsurlaub | BetriebsurlaubReiter.tsx |
| BottomSheet/ConfirmDialog | „Ende ändern“, „Krankmeldung löschen?“, „Urlaubstage als Krankenstand?“ | Reiter Krankenstände / Liste | Krankmeldungen.tsx |
| Zustände | `SkeletonList`, `ErrorState`, `TeilFehler` („Der genehmigte Urlaub der anderen“, „… dieses Monats“); leer „Kein Antrag wartet auf eine Entscheidung.“, „Noch kein Antrag gestellt.“, „Kein Antrag wartet.“, „Kein Betriebsurlaub eingetragen.“, „In den letzten acht Wochen keine Krankmeldung.“ | | |
| Upload | Nachweis zum Sonderurlaub/Arztbesuch (PDF/Bild) | Formular | FreistellungFormular.tsx |

### 2.8 Sonderurlaub `/sonderurlaub` — `vacations/SonderurlaubView.tsx`

Wie die Freistellungsteile von 2.7: BottomSheet „Antrag auf Sonderurlaub \| Arztbesuch“ (AntragFenster.tsx), ConfirmDialog „Antrag zurückziehen?“ (FreistellungListe.tsx), „… ablehnen? / zurücknehmen?“ (FreistellungenBestaetigen.tsx). Zustände: `SkeletonList`, `ErrorState`, „Kein Antrag wartet.“

### 2.9 Meine Baustellen `/my-projects` — `projects/MyProjectsView.tsx`

Keine Dialoge. Zustände: `LoadingState`, `ErrorState`, leer „Du bist auf keiner laufenden Baustelle …“, `TeilFehler` „Die Pläne“. Exporte: Pläne öffnen/laden (PlaeneListe.tsx).

### 2.10 Handwerksscheine `/worksheets` — `worksheets/WorkSheetsListView.tsx`

| Element | Titel / Inhalt | Auslöser / Bedingung | Datei |
|---|---|---|---|
| PageHeader | „Handwerksscheine“, Hauptaktion „Neuer Schein“ (wer schreiben darf) | `canWriteWorkSheet` | |
| BottomSheet | „{Kunde} \| Handwerksschein“ (Aktionen u. a. Weiterbearbeiten, PDF, Stornieren/Storno bestätigen, Wieder aufnehmen, Verwerfen, Löschen) | Zeile | WorkSheetsListView.tsx |
| ConfirmDialog | „Entwurf verwerfen“, „Verworfenen Entwurf löschen \| Entwurf löschen“ | im Fenster | WorkSheetsListView.tsx |
| Zustände | `SkeletonList` (mehrere), `ErrorState`, leer „Dein erster Handwerksschein.“ (Zeichnung schein), „Keine passenden Scheine.“, „Unter den jüngsten Scheinen ist keiner unverrechnet.“; „Neu laden“; Suche „Auf dem Server suchen“ | | |
| Exporte | „PDF“ (`buildWorkSheetPdf` → teilen oder speichern) | Fenster | WorkSheetsListView.tsx |

### 2.11 Ein Handwerksschein `/worksheet` — `worksheets/WorkSheetView.tsx`

| Element | Titel / Inhalt | Auslöser / Bedingung | Datei |
|---|---|---|---|
| PageHeader | „Handwerksschein — Entwurf \| Handwerksschein“ | Stand | |
| Schritte | Zeiten · Material · Fotos · Unterschrift (Handy/Tablet als Schritte, ab Schreibtisch eine Seite) | Breite | Schrittfolge.tsx, schritte.ts |
| Vollbild-Dialog | „Unterschrift Monteur“, „Unterschrift Kunde“ (`SignaturePad`, `role="dialog"`, Escape) | Unterschrift | components/SignaturePad.tsx |
| Aktionsleiste | feste Formularleiste | | WorkSheetView.tsx |
| Zustände | `LoadingState`; `ErrorState` (Entwurf nicht zu öffnen, auch „ohne Netz“-Fassung); leer „Noch keine Zeit gebucht …“, „Zuerst eine Baustelle wählen.“, „Noch kein Material eingetragen …“; Suche im Material ohne Netz | | MaterialErfassen.tsx |
| Kamera/Upload | Fotos (Kamera/Datei, verkleinert) | Schritt Fotos | WorkSheetView.tsx |
| Offline | Speichern, Fotos, Unterschreiben werden vorgemerkt | | WorkSheetView.tsx |
| Tasten | Enter in der Materialsuche | | MaterialErfassen.tsx |

### 2.12 Nachkalkulation `/costing` — `costing/NachkalkulationView.tsx`

BottomSheet „{Kunde}“ (breit; Detail einer Baustelle, NachkalkulationDetail.tsx). Segmente Abgeschlossen · Laufend. Zustände: `SkeletonList`, `ErrorState` „Die Nachkalkulation konnte nicht geladen werden.“, leer „Keine Baustelle in dieser Auswahl.“ Keine RowMenus, keine Exporte gefunden.

### 2.13 Angebote `/quotes` — `quotes/QuotesView.tsx`

| Element | Titel / Inhalt | Auslöser / Bedingung | Datei |
|---|---|---|---|
| RowMenu ⋯ (Zeile) | „Annehmen → Baustelle“ (Handy), „Neue Fassung“, „Als versendet markieren“ (Entwurf), „Als abgelehnt markieren“, „Verwerfen“ (Entwurf) | Zeile | QuotesView.tsx |
| BottomSheet | „Aus dem Katalog“ | Positionen | QuotesView.tsx (+ KatalogSuche.tsx) |
| ConfirmDialog | „Angebot annehmen?“, „Entwurf verwerfen?“ | Menü/Knopf | QuotesView.tsx |
| Formular | Angebot anlegen/bearbeiten (inline; `?bearbeiten=`, `?neueFassung=`, `?kopie=`) | | QuotesView.tsx |
| Zustände | `SkeletonList`, `ErrorState`, leer „Dein erstes Angebot.“ (Zeichnung beleg), „Noch kein Angebot erstellt.“, „Keine passenden Angebote.“ | | |

### 2.14 Ein Angebot `/quotes/:id` — `quotes/AngebotView.tsx`

| Element | Titel / Inhalt | Auslöser / Bedingung | Datei |
|---|---|---|---|
| RowMenu ⋯ (Kopf) | „Als abgelehnt markieren“ (offen), „Als Kopie anlegen“ (→ `/quotes?kopie=`), „Verwerfen“ (Entwurf) | | AngebotView.tsx |
| BottomSheet | „Annahme-Link“ | Knopf „Annahme-Link“ (Modul `angebote.online_annahme`) | AnnahmeLink.tsx |
| ConfirmDialog | „Angebot annehmen?“, „Entwurf verwerfen?“ | | AngebotView.tsx |
| ConfirmDialog | „Annahme-Link widerrufen?“ | im Fenster | AnnahmeLink.tsx |
| Verlauf | Objektverlauf („Ältere Einträge laden“) | | verlauf/ObjektVerlauf.tsx |
| Zustände | `SkeletonList`; `ErrorState` „Das Angebot konnte nicht geladen werden.“; leer „Dieses Angebot gibt es nicht (mehr).“; `TeilFehler` „die Anschrift des Kunden (für das PDF)“, „die Annahme-Links“; verworfen: „Wiederherstellen“, „Zum Papierkorb“ | | |
| Exporte | „PDF herunterladen“ | Knopf | AngebotView.tsx |

### 2.15 Auftragseingang `/eingaenge` — `auftragseingang/EingaengeView.tsx`

BottomSheet „Neuer Eingang“ (EingangFormular.tsx: Segmente Vorhandener Kunde · Neuer Kunde; Liegenschaftsauswahl mit Enter). Zustände: `SkeletonList`, `ErrorState` „Die Eingänge konnten nicht geladen werden.“ / „Weitere Eingänge konnten nicht geladen werden.“, leer „Nichts gefunden \| Kein offener Eingang \| Kein Eingang ‚{Stand}‘“.

### 2.16 Ein Eingang `/eingaenge/:id` — `auftragseingang/EingangView.tsx`

| Element | Titel / Inhalt | Auslöser / Bedingung | Datei |
|---|---|---|---|
| RowMenu ⋯ (Kopf) | „Angebot anlegen“, „Besichtigung vereinbaren“, „Kunde anlegen“, „Bearbeiten“, „Ablehnen“, „Löschen“ (je nach Stand, Rolle, Modul) | | EingangView.tsx |
| BottomSheet | „Eingang bearbeiten“, „Besichtigung vereinbaren“ (TerminFormular) | Menü | EingangView.tsx |
| ConfirmDialog | „Gleicher Name — trotzdem anlegen?“, „Baustelle anlegen?“, „Angebot anlegen?“, „Eingang ablehnen?“, „Eingang löschen?“ | Menü/Hauptaktion | EingangView.tsx |
| Zustände | `SkeletonList`; `ErrorState` „Der Eingang konnte nicht geladen werden.“; leer „Nicht gefunden“; `TeilFehler` „wohin der Eingang führte“ | | |

### 2.17 Nachrichten `/nachrichten`, `/nachrichten/:kanal` — `nachrichten/NachrichtenView.tsx`

| Element | Titel / Inhalt | Auslöser / Bedingung | Datei |
|---|---|---|---|
| PageHeader | „Nachrichten“ (Hauptaktion „Neue Nachricht“) bzw. Gesprächstitel | | |
| RowMenu ⋯ (Gespräch) | „Stumm schalten \| Wieder melden“, „Folgen \| Nicht mehr folgen“, „Zur Baustelle“, „Teilnehmer“, „Personen hinzufügen …“, „Umbenennen …“, „Runde verlassen“ | Gesprächsart | NachrichtenView.tsx |
| BottomSheet | „Teilnehmer“, „Runde umbenennen“ | Menü | NachrichtenView.tsx |
| BottomSheet | „Personen hinzufügen“, „Erwähnen“ (Personenwahl) | Menü / @ | PersonWahl.tsx |
| BottomSheet | „Runde beginnen \| Neue Nachricht“ | Hauptaktion | NeueNachricht.tsx |
| BottomSheet | „In welche Baustelle?“ (Baustellenwahl) | Nachrichtaktion | BaustellenWahl.tsx |
| BottomSheet | „Nachricht melden \| Nachricht bearbeiten \| Reaktionen \| Nachricht“ | Nachrichtaktion | NachrichtAktionen.tsx |
| ConfirmDialog | „Runde verlassen?“ | Menü | NachrichtenView.tsx |
| ConfirmDialog | „Nachricht löschen?“ | Nachrichtaktion | NachrichtAktionen.tsx |
| Eigener Dialog | schwebende Leiste zur Nachricht (`role="dialog"`, Escape, Tipp daneben schließt) | langes Drücken / Enter / Leertaste | NachrichtWahl.tsx |
| Gesten | langes Drücken auf Nachricht (Leiste) und auf Reaktion (wer hat reagiert); Maus: Leiste beim Darüberfahren | | Gespraech.tsx, langDruck.ts, NachrichtLeiste.tsx |
| Tasten | Senden mit Enter am Schreibtisch, Strg/⌘+Enter immer | | text.ts |
| Zustände | Einblick: „Im Einblick nicht einsehbar“; `SkeletonList`, `ErrorState` (Kopf, Gespräche, Baustellen); leer „Nichts gefunden \| Alles gelesen \| Noch kein Gespräch“, „Keine Baustelle“, „Niemand gefunden“; Nachricht „auf diesem Gerät vorgemerkt, wird gesendet“ | | Postfach.tsx, Gespraech.tsx |
| Anhänge | Bild/Datei, Kamera; Anzeige per Objekt-URL | | Gespraech.tsx |

### 2.18 Liegenschaften `/liegenschaften` — `liegenschaften/LiegenschaftenView.tsx`

BottomSheet „Neue Liegenschaft“ (LiegenschaftFormular.tsx). Zustände: `SkeletonList`, `ErrorState` „Die Liegenschaften konnten nicht geladen werden.“ / „Weitere … konnten nicht geladen werden.“, leer „Nichts gefunden \| Noch keine Liegenschaft“.

### 2.19 Eine Liegenschaft `/liegenschaften/:id` — `liegenschaften/LiegenschaftView.tsx`

| Element | Titel / Inhalt | Auslöser / Bedingung | Datei |
|---|---|---|---|
| RowMenu ⋯ (Kopf) | „Liegenschaft löschen“ | wer pflegen darf | LiegenschaftView.tsx |
| BottomSheet | „Liegenschaft bearbeiten“, „{Top} ändern \| Top anlegen“, „Beteiligten ändern \| Beteiligten eintragen“ (Segmente Kunde · Freie Angaben) | `fenster.art` | LiegenschaftView.tsx, TopFormular.tsx, BeteiligterFormular.tsx |
| ConfirmDialog | „Beteiligten entfernen?“, „Top löschen?“, „Liegenschaft löschen?“, „Gleicher Name — trotzdem anlegen?“ | `frage.art` | LiegenschaftView.tsx |
| Zustände | `SkeletonList`; `ErrorState` „Die Liegenschaft konnte nicht geladen werden.“; „Nicht gefunden“; je Abschnitt `SkeletonList`/`TeilFehler`/leer („Noch kein Top …“, „Noch niemand eingetragen.“, „… noch keine Baustelle …“, „Keine Wartung …“) | | |

### 2.20 Kunden `/customers` — `customers/CustomersView.tsx`

| Element | Titel / Inhalt | Auslöser / Bedingung | Datei |
|---|---|---|---|
| RowMenu ⋯ (Kopf) | „Kunden aus einer Datei einlesen“, „Vorlage für den Import herunterladen“, „Bestehende Baustellen übernehmen“ | Rechte | CustomersView.tsx |
| RowMenu ⋯ (Zeile) | „Bearbeiten“, „Löschen“ | | CustomersView.tsx |
| BottomSheet | „‚{Name}‘ bearbeiten \| Neuen Kunden anlegen“ | Hauptaktion / Menü | CustomersView.tsx |
| BottomSheet | „Bestehende Baustellen übernehmen“ (Vorschau `LoadingState`, leer „Alle Baustellen sind bereits einem Kunden zugeordnet …“) | Menü | CustomersView.tsx |
| BottomSheet | „Kunden aus einer Datei“ („Datei wird gelesen …“, „Andere Datei wählen“) | Menü | KundenImport.tsx |
| ConfirmDialog | „Gleicher Name — trotzdem anlegen?“, „Angaben prüfen — trotzdem speichern?“, „Kunde löschen?“ | | CustomersView.tsx |
| Zustände | `SkeletonList`, `ErrorState`; leer „Keine passenden Kunden.“ (suche), „Dein erster Kunde.“ (akte), „Noch keine Kunden.“ | | |
| Exporte/Import | Import-Vorlage (CSV) herunterladen; CSV-Import | Menü | KundenImport.tsx |

### 2.21 Kundenakte `/customers/:id` — `customers/KundenakteView.tsx`

| Element | Titel / Inhalt | Auslöser / Bedingung | Datei |
|---|---|---|---|
| Seitenfenster | „Kunde bearbeiten“ (`AktenBearbeiten`, breit) + ConfirmDialog „Ungespeicherte Änderungen verwerfen?“ | „Bearbeiten“ | components/AktenBearbeiten.tsx |
| BottomSheet | Rechnung (breit; „{Nr} vom {Datum} als PDF laden“, Stornorechnung PDF) | Beleg | invoices/RechnungDetail.tsx über KundenRechnungFenster.tsx |
| BottomSheet | „Termin anlegen \| Termin ändern“; ConfirmDialog „Termin löschen?“ | Termine | termine/TermineKarte.tsx |
| ConfirmDialog | „Angaben prüfen — trotzdem speichern?“ | | KundenakteView.tsx |
| ConfirmDialog | „{Name} ganz löschen? \| Daten von {Name} löschen?“ / „Jetzt löschen“ | Datenauskunft | recht/Datenauskunft.tsx |
| Aktionsleiste | Formularleiste | Bearbeiten | KundenakteView.tsx |
| Zustände | `SkeletonList`; `ErrorState` „Der Kunde konnte nicht geladen werden.“; „Diesen Kunden gibt es nicht (mehr).“; je Abschnitt `SkeletonList`/`TeilFehler`/leer (Baustellen, Wartungen, Rechnungen, Eingänge, Angebote, Liegenschaften, „Noch keine Belege.“) | | |
| Exporte | „Auskunft herunterladen“ (Datenauskunft), Rechnungs-PDF | | recht/Datenauskunft.tsx, KundenRechnungFenster.tsx |

### 2.22 Wartungen `/wartungen` — `maintenance/WartungenView.tsx`

BottomSheet „Anlage“ (Einzelheiten), „Wartung ändern \| Neue Wartung“ (nur wer ändern darf). ConfirmDialog „Wartung erledigt eintragen“, „Baustelle für diese Wartung anlegen?“, „Wartung löschen?“. Zustände: `SkeletonList`, `ErrorState` (auch „Die Wartungssuche konnte nicht geladen werden.“), leer „Deine erste Wartung.“ / „Noch keine Wartung erfasst.“ / „Keine passenden Wartungen.“; Verlauf `TeilFehler` „Die Liste der früheren Ausführungen“ (WartungVerlauf.tsx); Adressfilter „fällige Wartungen ohne Baustelle“. VW: nur lesend.

### 2.23 Baustellen `/admin-projects` — `projects/AdminProjectsView.tsx`

RowMenu ⋯ (Zeile): „Schein nachtragen“ (mit `scheine`, → `/worksheet?projekt=`), „Löschen“. BottomSheet „Neue Baustelle“ (Kunden-/Personenwahl). ConfirmDialog „Baustelle löschen?“. Zustände: `SkeletonList`, `ErrorState`, `TeilFehler` („Die Liste aller laufenden Baustellen“), leer „Deine erste Baustelle.“ (bau) / „Keine passenden Baustellen.“; Adressfilter aus `?filter=`.

### 2.24 Baustellenakte `/admin-projects/:id` — `projects/BaustellenakteView.tsx`

| Element | Titel / Inhalt | Auslöser / Bedingung | Datei |
|---|---|---|---|
| Seitenfenster | „Baustelle bearbeiten“ (`AktenBearbeiten`) + „Ungespeicherte Änderungen verwerfen?“ | „Bearbeiten“ | components/AktenBearbeiten.tsx |
| BottomSheet | „Dokumente hinzufügen“ (`DokumentAblage`) | Pläne | components/DokumentAblage.tsx |
| BottomSheet | „Termin anlegen \| Termin ändern“; „Termin löschen?“ | Reiter Termine | termine/TermineKarte.tsx |
| ConfirmDialog | „Projektnummer ändern?“ | Stammdaten | BaustellenakteView.tsx |
| ConfirmDialog | „Wirklich zu den Plänen?“, „Plan löschen?“ | Pläne | BaustellenPlaene.tsx |
| Aktionsleiste | Formularleiste | Bearbeiten | |
| Drag-and-drop | Dateien auf die Ablage ziehen | Pläne | BaustellenPlaene.tsx, DokumentAblage.tsx |
| Zustände | `SkeletonList`; `ErrorState` „Die Baustelle konnte nicht geladen werden.“; „Diese Baustelle gibt es nicht (mehr).“; je Karte `TeilFehler`/`SkeletonList`/leer (Einsätze, Material, Rechnungen, Scheine, Pläne „Noch keine Pläne oder Dokumente.“, Nachrichten, Stunden); ohne Einsatzplanung: „Die Einsatzplanung ist für diesen Betrieb nicht aktiviert.“ | | AkteUeberblick.tsx u. a. |
| Exporte | Pläne öffnen/laden | | PlaeneListe.tsx |

### 2.25 Einsatzplanung Woche/Monat `/assignments/woche` — `assignments/WochenplanView.tsx` → `Einsatzplanung.tsx`

| Element | Titel / Inhalt | Auslöser / Bedingung | Datei |
|---|---|---|---|
| PageHeader | „Einsatzplanung“, Umschalter Woche · Monat · Tag | | PlanungsKopf.tsx |
| RowMenu ⋯ (Kopf) | „Termin anlegen“ (wer darf), „Im eigenen Kalender …“ (Abo möglich) | | Einsatzplanung.tsx |
| BottomSheet | „Einsatz planen \| Einsatz bearbeiten“ | Tipp auf Zelle/Einsatz/„Noch einzuplanen“ | EinsatzFenster.tsx (+ EinsatzFormular, RuestlistePlanen) |
| BottomSheet | „{Wochentag}, {Datum}“ (Tag mit Terminen, Einsätzen, „wer ist frei“) | Tipp auf Tageskopf | TagFenster.tsx |
| BottomSheet | „Termin anlegen \| Termin ändern \| Termin“ + ConfirmDialog „Termin löschen?“ | Menü / Termin | termine/TerminFenster.tsx |
| BottomSheet | „Einsatz verschieben“ | Leiste am Einsatz | VerschiebenFenster.tsx |
| BottomSheet | „Im eigenen Kalender“, „Noch einzuplanen“ | Menü / Knopf | Einsatzplanung.tsx |
| ConfirmDialog | „Einsatz entfernen?“ | Leiste am Einsatz | Einsatzplanung.tsx |
| Eigener Dialog | Monatsvorschau (`role="dialog"`, am Handy modal; ←/→ blättern, Escape) | Monat | MonatsVorschau.tsx |
| Drag-and-drop | Einsatz ziehen (Maus ab 6 px; Finger/Stift nach 450 ms langem Drücken), Alt = kopieren, Escape bricht ab; „Noch einzuplanen“ auf Person+Tag ziehen; danach „Rückgängig“ | | useZiehen.ts, WochenEintraege.tsx |
| Zustände | `SkeletonList`, `ErrorState`, `TeilFehler` („Die Materialbereitschaft“); leer „Keine aktiven Mitarbeiter im Außendienst …“, „In dieser Woche ist keine Baustelle eingeplant.“ (plan), „In diesem Monat …“, „Diesen Monat ist niemand abwesend.“, „Jede laufende Baustelle hat diese Woche einen Einsatz.“ | | WochenRaster.tsx, MonatsAnsicht.tsx |
| Exporte | Kalender-Abo (Link) | Fenster | KalenderAboKarte.tsx |

### 2.26 Einsatzplanung Tag `/assignments/tag` — `assignments/AssignmentsView.tsx`

RowMenu ⋯ „Termin anlegen“. BottomSheet „Termin anlegen \| Termin ändern“ + „Termin löschen?“ (TermineKarte.tsx). ConfirmDialog „Einsatz löschen?“. Formular `EinsatzFormular` mit Aktionsleiste, Rüstliste (Enter in der Suche). Zustände: `SkeletonList`, `ErrorState`, `TeilFehler`; leer „An diesem Tag ist jeder Einsatz besetzt. \| Keine Einsätze an diesem Tag.“, „Keine Termine …“; Adressfilter „nur unbesetzte Einsätze“.

### 2.27 Benutzerverwaltung `/user-mgmt` — `users/UserMgmtView.tsx`

ConfirmDialog „{Name} ist unter 18“ / „Trotzdem anlegen“. Anlegen inline (keine Seitenfenster gefunden). Zustände: `SkeletonList`, `ErrorState`, leer „Noch keine Benutzer …“, „Keine passenden Benutzer.“ / „Kein Benutzer in dieser Auswahl.“

### 2.28 Benutzerakte `/user-mgmt/:uid` — `users/BenutzerakteView.tsx`

| Element | Titel / Inhalt | Auslöser / Bedingung | Datei |
|---|---|---|---|
| Seitenfenster | „Benutzer bearbeiten“, „Geburtsdatum bearbeiten“ (`AktenBearbeiten`) + „Ungespeicherte Änderungen verwerfen?“ | „Bearbeiten“ | BenutzerakteView.tsx, GeburtsdatumKarte.tsx |
| ConfirmDialog | „{Name} ist unter 18“, „Neues Startpasswort vergeben?“, „Benutzer aktivieren? \| Benutzer deaktivieren?“ | Knöpfe | BenutzerakteView.tsx |
| ConfirmDialog | „Anpassung entfernen?“ | Urlaubsanspruch | UrlaubsanspruchKarte.tsx |
| ConfirmDialog | „{Name} ganz löschen? \| Daten von {Name} löschen?“ | Datenauskunft | recht/Datenauskunft.tsx |
| Aktionsleiste | Formularleiste | | |
| Zustände | `SkeletonList`; `ErrorState` „Der Benutzer konnte nicht geladen werden.“; „Diesen Benutzer gibt es nicht (mehr).“; Urlaubsanspruch `SkeletonList`/`ErrorState` | | |
| Exporte | „Auskunft herunterladen“ | | recht/Datenauskunft.tsx |

### 2.29 Rechnungen `/invoices` — `invoices/RechnungenSeite.tsx`

**BH/GF/AD → `InvoicesView.tsx`**

| Element | Titel / Inhalt | Auslöser / Bedingung | Datei |
|---|---|---|---|
| PageHeader | „Rechnungen“, Hauptaktion „Neue Rechnung“ (öffnet Formular inline, `?neu=`) | | InvoicesView.tsx |
| BottomSheet | Rechnung (breit; „{Nr} vom {Datum} als PDF laden“) | Zeile / `?oeffnen=` | RechnungDetail.tsx |
| ConfirmDialog | „Storno aufheben?“, „Stornorechnung ausstellen?“, „Stornieren nicht möglich \| Rechnung stornieren?“, „Zahlungen — {Nr}“ („Rückzahlung buchen \| Als Guthaben buchen \| Zahlung eintragen“), „{…} — Mahnen“ („Erzeugen“) | Aktionen im Fenster | InvoicesView.tsx |
| ConfirmDialog | „Bankgarantie — {Nr}“ | Aktion | BankgarantieDialog.tsx |
| ConfirmDialog | „E-Rechnung — {Nr}“ / „Datei laden“ (Segmente Unternehmen · Bund · Land, Gemeinde, andere) | „E-Rechnung (ebInterface) …“ | EbInterfaceDialog.tsx |
| Inline-Rückfrage | „Ja, löschen“ (kein ConfirmDialog) | unklar | InvoicesView.tsx |
| Zustände | `SkeletonList`, `ErrorState`, `TeilFehler`; leer „Keine passenden Rechnungen.“ (suche), „Noch keine Rechnungen.“ / „Deine erste Rechnung.“ (beleg); „Ältere Rechnungen laden“; Adressfilter `?sicht=` | | |
| Exporte | Rechnungs-PDF („Rechnung erstellen & PDF“, „PDF erneut laden“), Mahnungs-PDF, „Als CSV herunterladen“, „Buchungsstapel für BMD“, „Zahlungen und Skonto für BMD“, ebInterface-XML (auch Storno) | Knöpfe | InvoicesView.tsx, pdf.ts, EbInterfaceDialog.tsx |

**PL mit `rechnungenLesen` → `RechnungenLesen.tsx`**: nur lesen; Segmente Offen · Erledigt · Alle; `SkeletonList`, `ErrorState`, leer „Zu deinen Baustellen gibt es noch keine Rechnung.“ / „Keine Rechnung passt …“. Keine Dialoge.

### 2.30 Mitarbeiterübersicht `/accounting` — `accounting/AccountingView.tsx`

| Element | Titel / Inhalt | Auslöser / Bedingung | Datei |
|---|---|---|---|
| RowMenu ⋯ (Kopf) | „Monats-CSV“ | Zeilen da, nicht im Support | AccountingView.tsx |
| BottomSheet | Person im Monat „{Name}“ / „Eintrag von {Name} korrigieren“ / „Zeit für {Name} erfassen“ / Krankmeldung (breit) | Zeile / Aktion | AccountingView.tsx, PersonFenster.tsx |
| Eigener Dialog | „Bericht exportieren“ (Projektauswertung CSV, Stundennachweis PDF; Escape) | Person | ExportDialog.tsx |
| ConfirmDialog | „Eintrag löschen?“ | | AccountingView.tsx |
| ConfirmDialog | aus TimeForm / AufteilenDialog / AntragKnopf / Krankmeldungen (siehe 2.2) | im Fenster | time/*, vacations/Krankmeldungen.tsx |
| Tasten | Kalender: Pfeiltasten (±1 Tag, ±7), Pos1/Ende; Streifen: → / Pos1 / Ende | | PersonKalender.tsx, Streifen.tsx |
| Zustände | `SkeletonList`, `ErrorState`, `TeilFehler`; leer „Noch keine Benutzer angelegt. \| Kein Konto erscheint in dieser Auswertung …“ (Zeichnung fertig), „Keine Projektstunden in diesem Zeitraum.“; Supporteinblick: Wochenansicht und Export aus | | |
| Exporte | „Monats-CSV“, „Monat als CSV“ (Person), „Projektauswertung (CSV)“, „Stundennachweis (PDF)“ | | AccountingView.tsx, PersonFenster.tsx, ExportDialog.tsx, hoursPdf.ts |

### 2.31 Einstellungen `/settings/*`

| Unterseite | Dialoge / Fenster | Zustände | Exporte / Sonstiges |
|---|---|---|---|
| Übersicht (`EinstellungenUebersicht.tsx`) | – | `SkeletonList`, leer „Keine Einstellung passt zu ‚{…}‘.“ | Suche über alle Unterseiten, Einrichtungsstand |
| Mein Konto (`NotificationSettings.tsx`) | – | `TeilFehler`, `ErrorState` (Probemeldung, Speichern); Passwort ändern (`PasswortAendern`), Zwei-Faktor (`ZweiFaktorKarte`, `ZweiFaktorEinrichten`), Push-Stand | eigene Nachrichten als JSON herunterladen (`MeineNachrichten.tsx`) |
| Firmendaten (`FirmendatenView.tsx`) | ConfirmDialog „PLZ prüfen — trotzdem speichern?“; Aktionsleiste | `ErrorState` (Logo, Speichern) | Logo-Upload, „Anzeige erneut laden“ |
| Sätze/Rechnung/Nummern/Personal (`SettingsView.tsx`) | ConfirmDialog „Auf Standardwerte zurücksetzen?“ | `ErrorState` | Karten: Katalog (saetze), Lohnregeln, Timer, Sonderurlaub (personal), Basiszinsverlauf |
| Zeitfelder (`ZeitfelderView.tsx`) | BottomSheet „Feld ändern \| Feld anlegen“ | `SkeletonList`, `ErrorState`, leer „Noch keine eigenen Felder angelegt.“ | – |
| Fahrzeuge (`FahrzeugeView.tsx`) | BottomSheet „Fahrzeug ändern \| Fahrzeug anlegen“ | `SkeletonList`, `ErrorState`, `TeilFehler`, leer „Noch kein Fahrzeug angelegt.“, „Kein Kennzeichen aus Buchungen …“ | – |
| Kontenrahmen (`KontenrahmenView.tsx`) | – | `SkeletonList`, `ErrorState` | – |
| Supportzugang (`SupportzugangView.tsx`) | – | `SkeletonList`, `ErrorState` | – |
| Module (`ModulesView.tsx`) | ConfirmDialog „{Modul} ausschalten?“, „{Modul} einschalten?“ | `ErrorState` | – |
| Datensicherung (`SicherungView.tsx`) | – | `ErrorState`; „Wird zusammengestellt …“, „Sicherung läuft …“ | „Alle Daten herunterladen“ (ZIP/CSV), „Belegarchiv herunterladen“, „Sicherung jetzt erstellen“ |
| Papierkorb (`PapierkorbView.tsx`) | ConfirmDialog „Verworfenen Entwurf endgültig löschen \| Angebot endgültig löschen“, „Abgelaufene endgültig löschen?“ | `SkeletonList`, `ErrorState`, leer „Der Papierkorb ist leer.“ | Fristkarte (PapierkorbFristKarte.tsx) |
| Nachrichten (`NachrichtenEinstellungen.tsx`) | BottomSheet „Gemeldete Nachricht“; ConfirmDialog „Meldung löschen?“ | Einblick: „Im Einblick nicht einsehbar“; `SkeletonList`, `ErrorState`, leer „Nichts gemeldet“ | – |

### 2.32 Annahme-Link-Seite `/angebot/annehmen#…` — `angebotAnnahme/AngebotAnnahmeSeite.tsx`

Öffentlich, ohne Hülle. Zustände: „Das Angebot wird geladen …“ (`LoadingState`), „Link nicht gültig“, `ErrorState` (Grund / „Das Angebot ließ sich nicht laden.“ / PDF-Fehler), „Angenommen“ / „Abgelehnt“ / „Bereits angenommen“ / „Bereits abgelehnt“. Vollbild-Dialog `SignaturePad` „Ihre Unterschrift“. Aktionen „Verbindlich annehmen“, „Angebot ablehnen“. Export „Als PDF“.

### 2.33 Plattform (globaler Administrator) — `plattform/PlattformView.tsx`

Eigene Hülle `PlattformHuelle.tsx` mit Bereichen Betriebe · Supportzugänge · Fehlerprotokoll · Basiszinssatz · Rechtstexte · Mein Konto (Zustand, keine Adressen).

| Bereich | Seiten / Dialoge | Zustände |
|---|---|---|
| Betriebe | Unterseiten Betriebe · Betrieb anlegen · Betrieb angelegt · Löschprotokoll; Segmente Alle · Aktiv · Deaktiviert; BottomSheet „{Betrieb} verwalten“ (breit, `BetriebVerwalten.tsx`: Testbetrieb, Deaktivieren, Löschen mit Frist, Übergabe, „Verzeichnis der Dateien“, Notzugang öffnen) | `ErrorState` (Betriebe, Freigaben) |
| Supportzugänge | Liste · Notzugang öffnen · Passwort neu setzen · Zwei-Faktor zurücksetzen; „Öffnen“ startet Einblick | `ErrorState` |
| Fehlerprotokoll | Liste (`FehlerListe.tsx`) | leer „Niemand hat ein Problem gemeldet.“, „Keine Abstürze und keine unbehandelten Fehler.“ |
| Basiszinssatz | `BasiszinsZentral.tsx` | `ErrorState` |
| Rechtstexte | `Rechtstexte.tsx`: BottomSheet Vorschau (breit); ConfirmDialog „{…} veröffentlichen“, „Entwurf verwerfen“, „Nicht gespeicherte Änderungen“ | `LoadingState`, `ErrorState` |
| Mein Konto | Passwort, Zwei-Faktor | `ErrorState` |

### 2.34 Musterseite `/_muster` — `muster/MusterView.tsx`

Werkzeug, kein Menüpunkt. RowMenu „Beispiel: Exportieren“, „Beispiel: Löschen“; Segmente Hell · Dunkel, Woche · Monat, Personen · Baustellen; Sammelleiste; BottomSheet „Seitenfenster“; ConfirmDialog „Unumkehrbar“; leer „Heute liegt nichts an.“; eingebettet Teile der Einsatzplanung (WochenRaster, MonatsAnsicht, MonatsVorschau u. a.).

---

## 3. Globale Teile

### 3.1 Hülle (`src/app/Layout.tsx`, `src/main.tsx`)

| Teil | Breite | Inhalt / Zustände | Datei |
|---|---|---|---|
| Sprunglink „Zum Inhalt“ | alle | erster Tab-Halt | Layout.tsx |
| Kopfzeile | Handy | Betriebslogo, beim Rollen der Seitentitel (`KopfTitel`); Lupe „Suchen“; Avatar → Profil | Layout.tsx, KopfTitel.tsx |
| Seitenleiste | Schreibtisch | Logo, Lot am Seil (`SeilLot`), „Suchen · Strg K“, Gruppen mit Überschrift, Zähler an Einträgen; Fuß: Einstellungen, Person (Name, Rolle), „Problem melden“, Darstellungsschalter, „Abmelden“, Produktmarke, Rechtslinks | Layout.tsx, NaviLot.tsx |
| schmale Leiste | Tablet | dieselbe `aside`, Kurzlabels (`navi-text-kurz`), Avatar-Knopf → Profil | Layout.tsx |
| Untere Leiste | Handy | vier Ziele je Rolle (1.5) mit Zähler am Symbol, „Mehr“ mit Summe | Layout.tsx |
| „Mehr“-Blatt | Handy | BottomSheet „Weitere Bereiche“ (ohne `auchBreit`): alle übrigen Einträge nach Gruppen | Layout.tsx |
| Profil | Handy, Tablet | BottomSheet „Profil“ (`auchBreit`): Name, Rolle, Konto; „Mein Konto“, „Problem melden“, „Dunkle Darstellung“, „Abmelden“, „Fassung {…}“, „App erneuern“ (Rückfrage inline: „Erneuern“/„Abbrechen“), Rechtslinks | Layout.tsx, AppErneuern.tsx |
| Abmelden mit Ungesendetem | alle | ConfirmDialog „Noch nicht gesendet“ / „Trotzdem abmelden“ | Layout.tsx |
| Suche | alle | `Suchfenster` „Suchen oder springen“ (Strg/⌘+K, nicht über offenem Modal); Gruppen Seiten (inkl. Unterseiten) · Kunden · Baustellen · Rechnungen · Angebote · Personen · Artikel, je nur mit Zugriff auf die Liste; ↑/↓/Enter/Escape; „Suche läuft …“, „Nichts gefunden.“; ab 2 Zeichen | Suchfenster.tsx |
| Problem melden | alle | ConfirmDialog „Problem melden“ / „Senden“ | components/ProblemMelden.tsx |
| Neue Fassung | alle | Leiste unten (`role="status"`): „Eine neue Fassung der App steht bereit.“ + Hinweis bei schwacher Verbindung; „Jetzt laden“ / „Später“ | components/NeueFassung.tsx (in main.tsx) |
| Verbindungsband | alle | offline: „Keine Verbindung. Neue Daten können gerade nicht geladen werden …“; Live-Verbindung weg: „Die Anzeige aktualisiert sich gerade nicht von selbst.“ + „Neu laden“ | components/Verbindungsband.tsx |
| Supportband (für den Betrieb) | alle | „Support sieht mit — lesend \| kann ändern“ (Handy, „Details“/„Weniger“), am Schreibtisch mit Grund; Präfix „Notzugang:“; Warn- bzw. Fehlerfarbe | components/Supportband.tsx |
| Supportsitzung (für den Support) | alle | „Einblick \| MITARBEITEN in {Betrieb} …“, Grenzen bei Mitarbeiten; „Einblick beenden“ | components/Supportsitzung.tsx |
| EinblickProtokoll | im Einblick | „Zugriff wird protokolliert …“ (`LoadingState`), `ErrorState` „Der Zugriff auf ‚{…}‘ ließ sich nicht protokollieren …“ | components/EinblickProtokoll.tsx |
| Rechtstext-Hinweis | alle | „Neue Unterauftragsverarbeiter bei Senklot“ (GF/AD), geänderte „Datenschutzerklärung“; „Ansehen“ / „Ausblenden“ | features/recht/RechtstextHinweis.tsx |
| Seitenhilfe | alle | BottomSheet „Hilfe: {Seitentitel}“ (`auchBreit`), gesammelt aus `InfoHint` / `Card hint` | components/SeitenHilfe.tsx |
| Toast / Meldungen | alle | `success`, `error`, `info`, `wichtig` (dauerhaft); Aktion „Rückgängig“ (7 s statt 3,5 s); „Gelesen“ | components/Toast.tsx (Provider in main.tsx) |
| Verlorene Buchung | alle | Fehlermeldungen, wenn Vorgemerktes (Buchung, Schein, Foto, Nachricht) endgültig scheitert | components/VerloreneBuchung.tsx |
| Nachsender | alle | ohne UI; sendet Vorgemerktes nach | components/Nachsender.tsx |
| TimerLeiste | Handy fest über der unteren Leiste; ab Tablet unten im Inhalt | nur bei laufendem Arbeitstag, nicht auf `/`, `/time` (Handy auch nicht `/nachrichten/:kanal`); Zustände „läuft“ (Baustelle bzw. „Arbeitstag“) / „Pause“; „Weiterarbeiten“, „Pause beginnen“, „Stoppen und prüfen“; Tipp auf die Uhr → Karte | features/time/TimerLeiste.tsx |
| ArbeitstagKarte | auf `/` und `/time` | „Arbeitstag starten“, Uhr, „Arbeit bisher“, Pause/Weiter, „Feierabend: stoppen und prüfen“, „Ein Arbeitstag wartet auf die Prüfung“, „Erneut laden“; Fenster „Baustelle wählen/wechseln“ („Übernehmen“), „Zeitsitzung verwerfen“ („Begründet verwerfen“) | features/time/ArbeitstagKarte.tsx |
| Zeitsitzung-Zustände | – | Sitzung `laeuft` · `pause` · `beendet` · `verworfen`; Abschnitte `offen` · `gebucht` · `verworfen` · `vorgemerkt` | lib/zeitsitzung.ts, ZeitsitzungPanel.tsx |
| Ladebalken | alle | nur bei langem Nachladen einer Ansicht | components/Ladebalken.tsx |
| Fehlertafel | Inhalt | „Da ist etwas schiefgelaufen“; Nachladefehler: „Neue Fassung wird geladen …“ bzw. Hinweis auf neue Fassung; „Erneut versuchen“, „Zur Startseite“, „Problem melden“, „Technische Details“ | app/ErrorBoundary.tsx |
| Sonstiges ohne eigene Oberfläche | – | `Seitenposition` (Rollposition), `FehlerInsBlickfeld`, `NachrichtenLive`, `PushAnmeldung`, `ZeitsitzungAnbieter`; Seiteneinblendung 160 ms; Fokus auf `main` nach Seitenwechsel | app/*, features/* |

### 3.2 Gemeinsame Bedienmuster

| Muster | Verhalten | Datei |
|---|---|---|
| BottomSheet | Wischen nach unten am Griff/oben am Inhalt schließt; Escape; Fokusfalle; Hintergrundsperre | components/BottomSheet.tsx, useBlattGeste.ts |
| ConfirmDialog | Escape (nicht während der Aktion), Fokus auf „Abbrechen“; asynchron mit Ladezustand und Fehlermeldung im Dialog; `nurSchliessen`, `gesperrt` | components/ConfirmDialog.tsx |
| RowMenu ⋯ | Portal; ↑/↓/Pos1/Ende/Tab, Escape | components/RowMenu.tsx |
| Aktenreiter | ←/→/Pos1/Ende, `?bereich=`, `#sprungziel` | components/AktenBereiche.tsx |
| AktenBearbeiten | Seitenfenster (breit) + Rückfrage bei ungespeicherten Änderungen | components/AktenBearbeiten.tsx |
| Ungespeichert | Linkklick mit ungespeichertem Formular wird abgefangen | lib/ungespeichert.tsx |
| Adressfilter | Zeile „{Filter}“ mit Wegnehmen eines Adressparameters | components/Adressfilter.tsx |

### 3.3 Authentifizierung

| Schritt | Oberfläche | Datei |
|---|---|---|
| Anmelden | E-Mail oder Benutzername, Passwort, „Angemeldet bleiben“ | features/auth/LoginPage.tsx |
| Passwort vergessen | „Passwort zurücksetzen“ → „Link anfordern“ → Bestätigung; Benutzernamen-Konten: Hinweis „neues Passwort vom Büro“ | LoginPage.tsx |
| Nach Rücksetzlink | „Willkommen“ + „Passwort vergeben“ (neu, wiederholen; Regeln „Mindestens acht Zeichen“, „nicht gleich“) + „Abmelden“ | App.tsx, PasswortAendern.tsx |
| Startpasswort des Büros | wie oben, Text „Du bist mit einem Startpasswort angemeldet …“ | App.tsx, PasswortAendern.tsx |
| Passwort ändern (Mein Konto, Plattform) | „Aktuelles Passwort“, „Neues Passwort“, „Noch einmal“ | PasswortAendern.tsx |
| Zwei-Faktor prüfen | „Code aus der App“; „Telefon nicht zur Hand? Wiederherstellungscode verwenden“ ↔ „Doch mit dem Code aus der App“; „Code einlösen“; „Abmelden“ | features/auth/ZweiFaktorSeite.tsx |
| Zwei-Faktor einrichten | QR-Code scannen, Code eingeben; Pflicht-Variante vor der App, freiwillig in Mein Konto (`ZweiFaktorKarte`) | ZweiFaktorEinrichten.tsx, settings/ZweiFaktorKarte.tsx |
| Wiederherstellungscodes | Liste, „Kopieren“/„Kopiert“, „Codes notiert — weiter“; steht über allem, bis bestätigt | ZweiFaktorEinrichten.tsx (`WiederherstellungsCodes`), App.tsx |
| Notzugang (Plattform) | Passwort neu setzen, Zwei-Faktor zurücksetzen | plattform/NotzugangPasswort.tsx, NotzugangZweiFaktor.tsx |

---

## 4. Gemeinsame Bausteine und ihre Aufrufzahl

Gezählt: JSX-Vorkommen `<Name` (gefolgt von Leerzeichen, `>`, `/` oder Zeilenende) in `src/**/*.tsx` ohne Tests und ohne die Datei, die den Baustein festlegt; mitgezählt sind `src/components`, `src/app` und die Musterseite. Format: Aufrufe / Dateien.

| Baustein | Aufrufe / Dateien | Dateien (bei < 10) |
|---|---|---|
| `Button` | 489 / 134 | |
| `KnopfLink` | 18 / 8 | worksheets/WorkSheetsListView, projects/BaustellenakteView, costing/NachkalkulationView, quotes/AnnahmeLink, quotes/AngebotView, auftragseingang/EingangView, assignments/KalenderAboKarte, assignments/Einsatzaktionen |
| `IconButton` | 36 / 19 | |
| `Card` | 275 / 91 | |
| `ListRow` (+ `List`) | 101 / 61 (`List` 96 / 61) | |
| `Field` | – | kein Baustein dieses Namens; `Field.tsx` exportiert: |
| ↳ `InputField` | 312 / 85 | |
| ↳ `SelectField` | 79 / 47 | |
| ↳ `CheckboxField` | 86 / 40 | |
| ↳ `TextareaField` | 16 / 13 | |
| ↳ `FormGrid` | 69 / 34 | |
| `Hinweiszeile` | 131 / 56 | |
| States: `ErrorState` | 139 / 90 | |
| ↳ `EmptyState` | 92 / 57 | |
| ↳ `SkeletonList` | 87 / 59 | |
| ↳ `TeilFehler` | 47 / 28 | |
| ↳ `LoadingState` | 17 / 12 | |
| ↳ `SkeletonMetrics` | 2 / 2 | vacations/VacationsView, dashboard/DashboardView |
| ↳ `StartLaden` | 1 / 1 | app/guards |
| ↳ `SeitenPlatzhalter` | 1 / 1 | app/App |
| `BottomSheet` | 62 / 49 (ohne Muster 61 / 48) | |
| `ConfirmDialog` | 92 / 55 (ohne Muster 91 / 54) | |
| Toast | `ToastProvider` 1 (main.tsx); `useToast()`/`useToastWennDa()` 102 in 97 Dateien; Aufrufe `toast.success` 209, `toast.error` 88, `toast.info` 26, `toast.wichtig` 2 | |
| `PageHeader` | 80 / 50 | |
| `Unterreiter` | 3 / 1 | app/App (`/my-schedule`, `/assignments`, `/settings`) |
| `Aktionsleiste` | 7 / 7 | worksheets/WorkSheetView, projects/BaustellenakteView, users/BenutzerakteView, customers/KundenakteView, settings/FirmendatenView, time/TimeForm, assignments/EinsatzFormular |
| `RowMenu` | 14 / 13 | |
| `StatusBadge` | 11 / 8 | projects/AkteUeberblick, projects/MyProjectsView, invoices/RechnungenLesen, invoices/InvoicesView, orders/AdminOrdersView, orders/OrderView, orders/AnforderungFenster, customers/KundenakteView |
| `Badge` | – | kein Baustein dieses Namens; `Badge.tsx` exportiert: |
| ↳ `Zustand` | 78 / 39 | |
| ↳ `Marke` | 47 / 28 | |
| ↳ `Warnung` | 43 / 21 | |
| ↳ `Zaehler` | 3 / 1 | app/Layout |

**Eigene Dialoge außerhalb von `BottomSheet`/`ConfirmDialog`** (`role="dialog"`): `app/Suchfenster.tsx`, `features/accounting/ExportDialog.tsx`, `features/assignments/MonatsVorschau.tsx`, `features/nachrichten/NachrichtWahl.tsx`, `components/SignaturePad.tsx` (Vollbild).

---

## 5. Zusammenfassung

- **Routen:** 32 angemeldete Routen in `AppRoutes`, 3 öffentliche (`/login`, `/impressum`, `/datenschutz`), die Annahme-Link-Seite und die Plattform (beide als Weiche vor dem Router), 9 Weiterleitungen; dazu 19 Unterseiten unter `Unterreiter` (`/my-schedule` 2, `/assignments` 2, `/settings` 15).
- **Ansichten:** 51 Ansichtskomponenten in `App.tsx` (47 nachgeladen, 4 fest eingebunden: Anmeldung, Passwort, Zwei-Faktor, Wiederherstellungscodes).
- **Dialoge:** 61 `BottomSheet`-Aufrufe in 48 Dateien, 91 `ConfirmDialog`-Aufrufe in 54 Dateien (ohne Musterseite), 5 eigene Dialoge; dazu 3 Seitenfenster über `AktenBearbeiten`; 14 `RowMenu`-Aufrufe.
- **Unklar geblieben:** ob das Zeitformular (`/time`) ab Tablet inline steht (das Blatt hat kein `auchBreit`); Auslöser der Inline-Rückfrage „Ja, löschen“ in `InvoicesView.tsx`.
