# Senklot · LLM-Implementierungsauftrag für die vollständige Designlinie V10

## Verwendung dieser Datei

Diese Datei ist ein direkt verwendbarer Arbeitsauftrag für ein codingfähiges LLM. Sie gehört zusammen mit folgenden Referenzen verwendet:

- `senklot-responsive.kanva.pptd`: grafische Orientierung mit 42 Seiten, 65 Arbeits-, Zustands- und Themeansichten sowie vier Systemseiten.
- `style.md`: kompaktes Regelwerk zu Farbe, Typografie, Bauplanraster, Illustration, Bedienung und Motion.
- Das jeweils aktuelle Repository einschließlich `CLAUDE.md`, vorhandener Fachdokumentation, Tests und aktuellem `main`.

Die Mappe ist bewusst keine 1:1-CSS-Vorlage. Übertrage ihre Informationshierarchie, Proportionen, Zustände und Bedienlogik in die bestehende Software. Passe jede Ansicht an ihren realen Inhalt, ihre Datenmenge, Rolle, Rechte und Eingabemöglichkeiten an. Kein Screen darf als statische Attrappe entstehen.

# Direkter Arbeitsauftrag an das implementierende LLM

## 1. Rolle und Ziel

Arbeite als sehr erfahrenes Produktteam aus React-/TypeScript-Engineering, UI-/UX-Design, Accessibility, Qualitätssicherung und österreichischem Handwerksverständnis. Überarbeite die vorhandene Senklot-Anwendung vollständig in der mitgelieferten Designlinie – auf jeder Seite, jedem Tab, jeder Akte, jedem Dialog und in allen relevanten Zuständen.

Das Ziel ist ein schlankes, schnelles, hochwertiges und selbsterklärendes System mit warmer, redaktioneller Ruhe, einem von Anthropic/Claude inspirierten Look und Vibe sowie erkennbarem eigenem Senklot-Charakter. Warmes Papier, Terrakotta und serifige Titel ersetzen die alte Petrolwelt; fremde Markenassets werden nicht kopiert. Alle bestehenden Abläufe bleiben vollständig erhalten und werden visuell sowie bedienlogisch konsistent miteinander verbunden.

Arbeite nicht screenweise nach dem Muster „Designbild nachbauen, nächster Screen“. Baue zunächst eine belastbare gemeinsame Designsprache und führe sie danach in allen Modulen ein. Eine sichtbar ähnliche Startseite bei unverändert uneinheitlichen Unteransichten gilt nicht als Umsetzung.

Eine Funktion, Aktion, Information oder fachliche Prüfung darf nicht deshalb entfallen, weil sie im Designscreen nicht ausdrücklich eingezeichnet ist. Die reale Software und ihre fachlichen Regeln sind für den Funktionsumfang maßgeblich; die Designmappe ist für die visuelle und interaktive Orientierung maßgeblich.

## 2. Verbindliche Leitplanken

1. **Keine Funktion verlieren.** Keine Route, kein Tab, keine Aktion, kein Export, keine Berechtigung, kein Offline-Schritt und keine Fehlerbehandlung stillschweigend entfernen oder abschwächen.
2. **Keine Zweitarchitektur.** Keine parallele Demo-App, keine neuen Preview-only-Seiten als Ersatz für die echte Anwendung und keine Duplikation vorhandener Fachlogik.
3. **Keine Datenbank- oder Sicherheitsänderung für Optik.** RLS, RPC, Auth, Datenmodelle und serverseitige Regeln bleiben unverändert, sofern ein nachgewiesener technischer Integrationsbedarf nicht ausdrücklich separat freigegeben wird.
4. **Keine Produktivdaten verändern.** Nichts in der Produktionsdatenbank löschen oder umschreiben. Testdaten räumt der Betrieb selbst.
5. **Keine Geheimnisse.** Dienstschlüssel niemals in Browserdateien, Repository oder GitHub-Secrets ablegen. Externe Zugangsdaten gehören ausschließlich in Edge-Function-Secrets.
6. **Kein Merge oder Deployment ohne ausdrückliche Freigabe.** Arbeite in einem Themenbranch mit nachvollziehbaren Commits. Zeige Abschlussbericht und Prüfnachweise, bevor ein Merge oder eine Veröffentlichung erfolgt.
7. **Keine kosmetische Verschlimmbesserung.** Keine künstliche Kartenverschachtelung, Pillenflut, globige Vollflächenbuttons, übermäßigen Schatten, Glasoptik, Verläufe, Bounce-Effekte oder dekorative Daueranimationen.
8. **Keine falschen Abnahmeaussagen.** Screenshots beweisen keine Funktionsfähigkeit. Browseremulation ersetzt keine physischen Geräte. Nicht ausgeführte Prüfungen bleiben ausdrücklich offen.
9. **Keine unnötige Abhängigkeit.** Nutze die vorhandenen React-, CSS-, Web-Animations- und Testmöglichkeiten. Eine Motion-Bibliothek ist nur nach begründetem Bedarf zulässig.
10. **Keine Scope-Ausweitung.** Neue Fachfunktionen oder Datenmigrationen gehören nicht automatisch in diesen UI-Umbau. Dokumentiere entdeckte Probleme separat statt sie unbemerkt mit dem Redesign zu vermischen.

## 3. Bestehende Repository-Regeln einlesen und Konflikte auflösen

Lies vor jeder Änderung mindestens:

- `CLAUDE.md`
- `README.md`
- `package.json`
- `src/app/App.tsx`, `src/app/Layout.tsx`, `src/app/navigation.ts`
- `src/index.css`, `tailwind.config.js` und die Dateien unter `src/styles/`
- `src/components/`, insbesondere gemeinsame Bedien- und Zustandsbausteine
- die bestehende Design- und UI-Dokumentation unter `docs/design/` und `docs/ui-umbau/`
- die relevanten Fachdokumente und Tests der jeweils bearbeiteten Module

Die Repository-Regeln zu Sicherheit, Datenschutz, Tests, Rollen und Arbeitsweise bleiben verbindlich. Ältere rein visuelle Vorgaben wie „keine Rundungen“, „keine Pillen“ oder „keine Schatten“ werden durch dieses neue Konzept differenzierter ersetzt: wenige rollenbasierte Radien und Schatten sind erlaubt, aber niemals dekorativ oder beliebig. Aktualisiere widersprüchliche Designdokumentation und veraltete Kommentare im Zuge der Umsetzung, damit künftig nicht zwei gegensätzliche Wahrheiten gepflegt werden.

Fachliche Entscheidungen in der bisherigen Dokumentation bleiben dagegen maßgeblich. Ein neuer visueller Entwurf setzt weder Rechte noch Arbeitsabläufe außer Kraft.

## 4. Ist-Stand und Ausgangsbasis zuerst feststellen

Beginne auf dem aktuellen `main`, nicht auf einem historischen Design- oder Auditcommit. Diese Konzeptfassung wurde mit Commit `99b8787476468b488920bd8a82fb7153008e05d8` vom 13.11.2026 abgeglichen und berücksichtigt E88/E89 sowie die mobilen Kernabläufe E90 und die erweiterte Suche E91. Prüfe trotzdem alle inzwischen hinzugekommenen Änderungen erneut.

Erstelle vor dem ersten produktiven Codeeingriff:

1. Commit-Hash, Branch und kurze Zusammenfassung des tatsächlich verwendeten Ausgangsstands.
2. `npm ci` beziehungsweise die dem Repository entsprechende reproduzierbare Installation; keine Versionswechsel nur zur Bequemlichkeit.
3. Baseline für Typecheck, Lint, Unit-/Integrationstests, Build und verfügbare Browsertests.
4. Vorher-Screenshots der echten Anwendung in relevanten Breiten und Rollen.
5. Eine Route-/Tab-/Zustandsmatrix einschließlich Detailseiten, Sheets, Dialogen und Fehlerzuständen.
6. Eine Liste bereits vorhandener Fehler oder instabiler Tests, getrennt von neu verursachten Regressionen.

Behebe keine Baseline-Fehler stillschweigend nebenbei. Wenn eine bestehende Störung die UI-Arbeit blockiert, dokumentiere sie und behandle sie nur mit klar abgegrenzter Begründung im selben Themenbranch.

## 5. Funktionserhalt als prüfbare Matrix führen

Lege vor dem Umbau eine Funktionsmatrix an und pflege sie bis zur Abnahme. Sie kann als Markdown oder strukturierte JSON-Datei im Arbeitsstand geführt werden und muss mindestens folgende Felder enthalten:

| Feld | Inhalt |
|---|---|
| Bereich | Modul, Route, Tab oder Dialog |
| Sichtbarkeit | Rolle, Zusatzrecht, Modulschalter, Support-/Einblickstatus |
| Bestandselement | Feld, Aktion, Menü, Information, Link, Export oder Status |
| Auslöser | Tipp, Klick, Tastatur, Drag-and-drop, Deep Link, automatischer Zustand |
| Fachlogik | aufgerufene Query, Mutation, RPC, Berechnung oder lokale Regel |
| Fehlerverhalten | Validierung, Konflikt, Offline, Ladefehler, Rechtefehler |
| Vorher | nachgewiesenes Verhalten auf dem Ausgangsstand |
| Nachher | unverändert, bewusst verbessert oder begründet angepasst |
| Nachweis | Unit-, Integrations-, Browser- oder visueller Test |

Vor jeder Löschung oder Zusammenfassung eines sichtbaren Elements ist in dieser Matrix zu belegen, warum keine Funktion verloren geht. „War im Entwurf nicht vorhanden“ ist kein zulässiger Löschgrund.

Prüfe ausdrücklich auch weniger sichtbare Funktionen: Kontextmenüs, `title`- und `aria-label`-Texte, Tastaturbefehle, Pull-/Swipe-Gesten, Long-Press, Rückgängig, Deep Links, Legacy-Redirects, Download- und Druckwege, externe Links, Support-Einblick, Abmelden mit ungesendeten Vorgängen und Modul-/Rollenvarianten.

## 6. Technische Architektur respektieren

Die bestehende Anwendung verwendet unter anderem React 18, strenges TypeScript, Vite, Tailwind CSS, React Router, TanStack React Query, Supabase, IndexedDB-Offlinevormerkungen, Service Worker/PWA, lokal bereitgestellte Schriften sowie Vitest und Playwright. Bestätige die tatsächlichen Versionen und Font-Einbindungen am aktuellen Ausgangsstand. Ergänze DM Sans und Source Serif 4 für V10 lokal beziehungsweise zuverlässig selbst gehostet; IBM Plex Mono bleibt für Zahlen und Zeitwerte erhalten.

Nutze und erweitere bevorzugt die vorhandenen Ebenen:

- App-Hülle und Navigation: `src/app/`
- Gemeinsame Bausteine: `src/components/`
- Modulare Fachbereiche: `src/features/`
- Design-Tokens und modulare Styles: `src/index.css`, `tailwind.config.js`, `src/styles/`
- Gemeinsame Zeitsitzung: `ZeitsitzungAnbieter`, `useZeitsitzung`, `ArbeitstagKarte`, `TimerLeiste`
- Bestehende Overlay-, Fokus-, Toast-, Lade-, Fehler- und Offline-Infrastruktur

Zerlege große Komponenten nur dann, wenn dies die sichere Designintegration oder Wartbarkeit konkret verbessert. Kein pauschaler Rewrite. Ändere Datenabrufe, Mutationen und Zustandsmodelle nicht nur, um ein CSS-Ziel zu erreichen.

Bei gemeinsamen Bausteinen sind zunächst alle Aufrufstellen zu ermitteln. Änderungen an `Button`, `Card`, `ListRow`, `Field`, `Hinweiszeile`, `BottomSheet`, `Toast`, `States`, `PageHeader`, `Unterreiter`, `Layout` oder `ArbeitstagKarte` benötigen besonders breite Regressionstests.

## 7. Vollständiger Abdeckungsumfang

Die folgende Liste ist eine Mindestmenge, keine Erlaubnis zum Auslassen weiterer im aktuellen `main` vorhandener Ansichten. Ergänze alle neu hinzugekommenen Seiten, Tabs und Zustände in derselben Matrix.

### Start, Zeit und persönliche Arbeit

- `/`
- `/time`
- Arbeitstag bereit, laufend, pausiert, offline vorgemerkt, geräteübergreifender Konflikt, lange Laufzeit, Fehler und offene Prüfung
- Stopp- und Prüfungsablauf je Baustelle inklusive Pausen, Korrektur, Begründung nicht zu buchender Abschnitte und Bestätigung
- E90: sofortige Timer-Reaktion, ein Schritt unterwegs, Rollback mit Grund, zuverlässiger Ausgangsfach-Nachlauf und einmalige Offline-Meldung je Funkloch
- E90: mobile Arbeitstagkarte, „Zeit von Hand eintragen“, Einsatzwegeleiste und gemeinsames Zeitformular als Bottom Sheet
- persönliche Korrekturen, Monats-/Tagesdetails und sonstige vorhandene Zeit-Unteransichten
- `/my-schedule/*` einschließlich persönlicher Ansicht und optionaler Team-Woche
- `/my-projects` und alle persönlichen Baustellenakten

### Planung und Einsätze

- `/assignments/*`
- Woche, Monat und Tag
- Personen- und Baustellensicht
- Desktop-, Tablet- und mobile Tagesdarstellung
- Einsatzdetails, Bearbeiten, Verschieben, Kopieren, Entfernen, Rückgängig und Bestätigungen
- Abwesenheiten, Betriebsurlaub, freie Kapazität, Termine, Materialzustand und „Noch einzuplanen“
- Drag-and-drop, Alt-Kopie, Touch-Long-Press und mobile Umplanung über die Einsatzaktionen
- Konflikte, Rechtefehler und nicht ladbare Abwesenheitsdaten

### Material, Anforderungen und Lager

- `/material`
- `/anforderungen`
- `/lager`
- Artikelsuche, Vorschläge, Mengensteuerung und direkte Mengeneingabe
- „Zuletzt angefordert“, „Für diese Baustelle abgeholt“ und „Stand zuerst“
- Anforderungsabschluss, Abholung, Herkunft Lager/Händler, Bestell- und Einkaufsabläufe
- Bestand, Lagerorte, Fahrzeugbezug, Retouren, Journal und sämtliche vorhandenen Dialoge
- leere, große und fehlerhafte Katalog-/Bestandsdaten

### Handwerksscheine, Baustellen und Vertrieb

- `/worksheets`, `/worksheet` und Unterschrift
- E90: kompakte mobile Baustellenzusammenfassung mit „ändern“, stiller Entwurf-/Zurück-Leiste und leerem Signaturhinweis
- `/admin-projects`, `/admin-projects/:id` und alle Aktenbereiche
- `/eingaenge`, `/eingaenge/:id`
- `/quotes`, `/quotes/:id`, Fassungen, PDF-/Link-/Annahmeabläufe
- öffentliche Angebotsannahme unter dem vorhandenen Annahmepfad
- `/customers`, `/customers/:id`
- `/liegenschaften`, `/liegenschaften/:id`
- `/wartungen`

### Finanzen und Team

- `/invoices` einschließlich Detail, Zahlung, Mahnwesen und Exporte
- `/costing`
- `/accounting` einschließlich Personendetails, Monatsansichten und Exporte
- `/vacations`, `/sonderurlaub` einschließlich Antrag, Entscheidung und Konflikte
- `/user-mgmt`, `/user-mgmt/:uid`

### Nachrichten und Einstellungen

- `/nachrichten`, `/nachrichten/:kanal`
- Listen-, Thread-, Verfassen-, Anhang-, Reaktions-, Melde- und Leerzustände
- `/settings/uebersicht`
- `/settings/meldungen` als bestehende Adresse für „Mein Konto“
- `/settings/firma`
- `/settings/saetze`
- `/settings/rechnung`
- `/settings/nummern`
- `/settings/personal`
- `/settings/zeitfelder`
- `/settings/fahrzeuge`
- `/settings/konten`
- `/settings/support`
- `/settings/module`
- `/settings/sicherung`
- `/settings/papierkorb`
- `/settings/nachrichten`
- weitere im aktuellen `main` vorhandene Einstellungsseiten

### Öffentliche, administrative und globale Ansichten

- `/login`
- Passwortrücksetzung, Startpasswortwechsel, Zwei-Faktor-Anmeldung und Wiederherstellungscodes
- `/impressum`, `/datenschutz`
- `/plattform` und Support-Einblick
- `/_muster` als echte Baustein- und Zustandsreferenz aktualisieren
- globale Suche einschließlich E91: Seiten, Kunden, Baustellen, Rechnungs-/Storno- und Angebotsnummern, Personen sowie Artikelnummern/EAN; rollenabhängige Ziele und `?suche=` auf bereits offenen Seiten
- Baustellen-Kurzbezeichnung in Suche, Auswahlen, Zeitformular, Planungsablage und Kundenakte
- „Mehr“-Navigation, Profil, Problem melden, App-Aktualisierung und Verbindungs-/Supportbänder
- nicht gefundene oder weitergeleitete Adressen einschließlich bestehender Legacy-Redirects
- Laden, echter Leerzustand, Filterleere, Offline, Fehler, keine Rechte und deaktivierte Module

## 8. Verbindliches Designsystem V10 für die Produktion

### 8.1 Grundcharakter

Senklot soll warm, ruhig, präzise, hochwertig und handwerklich-nah wirken. Die neue Gestaltung ist vom Look und Vibe von Anthropic/Claude inspiriert, kopiert aber keine fremden Markenassets. Warmes Papier, dunkle warme Tintenfarben, Terrakotta als Arbeitsakzent und redaktionelle serifige Titel ersetzen die bisherige kühle Petrolwelt. Die Premiumwirkung entsteht durch Typografie, Abstand, klare Hierarchie, konsistente Reaktion und feine Konturen – nicht durch Effekte.

Beibehalten werden:

- Senklot-Zeichen und wandernder Desktop-Senklot
- Bauplanraster als Herkunftsmerkmal
- helle Arbeitsblätter auf warmem, ruhigem Grund
- Modulicons als Navigationshilfe
- rollen- und modulabhängige Navigation
- die bestehende fachliche und technische Architektur

Vermeiden:

- generisches Dashboard-Aussehen
- gleichförmig schwere Kacheln
- Karte in Karte ohne fachlichen Grund
- große leere Flächen mit nur einem kleinen Wort oder Knopf
- beliebige Begleiticons bei Personennamen
- starke Gelb-/Rotflächen und farbige Statusbalken
- extreme Kapselformen bei normalen Einsätzen oder Formularen
- lange dunkle Buttons, deren Breite nicht zum Inhalt und Kontext passt
- große orange Arbeitstagkarten oder eine Überdosierung von Terrakotta
- Schatten an jeder Zeile oder Karte
- serifige Schrift in kleinen Bedienbeschriftungen, Tabellen oder Zeitwerten

### 8.2 Farb- und Rollentokens

Führe die Zielwerte als semantische Tokens ein beziehungsweise bilde die vorhandenen Tokens darauf ab. Verwende danach keine verstreuten Hexwerte mehr an einzelnen Seiten.

| Rolle | Heller Zielwert | Verwendung |
|---|---:|---|
| Primärakzent / Terrakotta | `#A85439` | Primäraktionen, aktive Auswahl, Senklotzeichen und wenige Arbeitsmarkierungen |
| Haupttext | `#25231F` | Titel und primäre Information |
| Dunkle Arbeitsfläche | `#322E29` | laufender Arbeitstag und dunkle Schwerpunktkarten |
| Navigation | `#292722` | Desktop-/Tablet-Navigation |
| Aktive Navigation | `#473B32` | aktiver Menüpunkt |
| Seitengrund / Papier | `#F4F0E8` | Arbeitsgrund |
| Karten / Arbeitsblätter | `#FFFDF8` | fachliche Arbeitsflächen |
| App-/Gerätefläche | `#FAF7F1` | eingelassene mobile und Systemflächen |
| Gedämpfter Text | `#6F685F` | Metadaten und sekundäre Erklärung |
| Inaktive mobile Icons | `#7F766B` | passive Docksteuerung |
| Auswahl | `#F3E4D8` | ausgewählte Zeilen, Optionen und aktive mobile Navigation |
| Auswahlkontur | `#D5B39E` | feine Auswahl, etwa 0,75 px auf der Referenzebene |
| Fokus | `#B97B5E` | sichtbarer, ruhiger Fokus |
| App-Kontur | `#E2D8CB` | Arbeitsblätter und Felder |
| Kopf-/Dockkontur | `#E4DACE` | mobile Kopf- und Navigationsinseln |
| Linien | `#DED4C7` | funktionale Trennung |
| Pausierter Arbeitstag | `#EEE6DB` | warmer, neutraler Pausenzustand |
| Warnung | `#8F5D20` | Statustext und sparsames Symbol |
| Fehler | `#A5483B` | Statustext und sparsames Symbol |
| Text auf dunklen Flächen | `#FFF8EE` | Arbeitstag und dunkle Primärflächen |
| Eigene Chatblasen | `#E8DACC` | eigene Nachrichten mit dunklem Text |

Die bestehende Trennung zwischen Produktfarbe und Mandantenbranding bleibt erhalten. Eine betriebliche Hausfarbe darf Navigation, Statussemantik oder Fehlerfarben nicht verfälschen. Prüfe helle und dunkle Darstellung, ausdrücklich gewählte Themes, Kontraste und Druckausgaben.

**Dark Mode vollständig integrieren.** Biete unter „Einstellungen → Mein Konto → Darstellung und Bewegung“ die Wahl „Hell“, „Dunkel“ und „System“ an. System folgt `prefers-color-scheme`; eine ausdrückliche Auswahl hat Vorrang. Verhindere einen hellen Theme-Blitz beim Start und setze passende Browser-/PWA-Oberflächenfarben. Theme-Wechsel dürfen weder Formulareingaben noch Chat-Entwürfe, Timerzustand, Fokus, Scrollposition oder Ausgangsfachvorgänge zurücksetzen.

Verwende im Dark Mode mindestens diese semantischen Zielwerte: Seitengrund `#211F1C`, Arbeitsfläche `#25221F`, Karten/Eingaben `#302C27`, Navigation `#1F1D1A`, Auswahl `#3B312B`, Haupttext `#F3EEE6`, gedämpfter Text `#B7AEA3`, Konturen `#4B443C`, Akzent auf dunklem Grund `#D08A68`, Primäraktion weiterhin `#A85439` mit `#FFF8EE`, eigene Chatnachricht `#43362F` mit `#F3EEE6`. Rasterlinien werden zu `#302C27` beziehungsweise `#3A342E`. Diese Werte sind Ausgangspunkt; miss Kontraste und Zustände an den realen Komponenten nach. Keine harte Inversion, keine rein schwarzen Flächen und keine schweren schwarzen Schatten. PDF-, Druck- und Dokumentausgaben folgen ihren bestehenden Fachregeln und werden nicht automatisch dunkel.

Warnung und Fehler sind niemals ausschließlich über Farbe verständlich. Text und gegebenenfalls Symbol tragen die Bedeutung. Gelb und Rot färben keine ganzen Listenzeilen, Karten, Hinweisbalken, Fehlerpaneele oder linken Vertikalkanten. Auch schmale 3-px-Statusstriche am linken Rand gehören ausdrücklich nicht zum Zielsystem. Der laufende Arbeitstag bleibt dunkel und ruhig; Terrakotta ist dort kein großflächiger Hintergrund.

### 8.3 Typografie und Zahlen

- `DM Sans` für Bedienung, Labels, Fließtext, Namen und allgemeine Produktinformation.
- `Source Serif 4` für größere redaktionelle Seiten- und Bereichstitel; reguläres Gewicht statt schwerer Displaytypografie.
- `IBM Plex Mono` für Beträge, Zeiten, Datumswerte, Projektnummern, Mengen und kompakte gemessene Werte.
- Schriften lokal beziehungsweise zuverlässig selbst hosten; keine neue Laufzeitabhängigkeit von einem externen Fontdienst.
- Metriken und Fallbacks so wählen, dass das Schrift laden keine Layoutsprünge erzeugt.
- Serifen nicht für kleine Bedienung, Tabellen, Formulare, kompakte Metadaten oder Zeitwerte verwenden.
- Namen und aktuelle Arbeitsinhalte erhalten mehr Gewicht als Metadaten.
- Keine Versalien-, Sperrungs- und Fettkombination für gewöhnliche Beschriftungen.
- Zahlen bleiben tabellarisch ausgerichtet und springen beim Aktualisieren nicht seitlich.
- Lange Kunden-, Baustellen- und Personennamen bleiben lesbar; kein pauschales Abschneiden wichtiger Information.
- Bestehende Umbruch-, Trenn- und `min-width: 0`-Regeln nicht schwächen.

**Die Designmappe verwendet skalierte Artboards. Ihre kleinen Textwerte sind keine CSS-Vorgaben.** Verwende die vorhandene barrierearme Produktionsskala und entwickle sie nur dort weiter, wo eine Rolle fehlt. Keine 7–10-px-Bedienungsschrift aus der Mappe in die App kopieren. Zentrale Touchziele bleiben mindestens 44–48 px groß.

### 8.4 Abstände, Radien und Tiefe

Verwende einen 8-px-Grundrhythmus; 4 px dienen nur der feinen inneren Ausrichtung. Bestehende funktionale Maße dürfen übernommen werden, wenn sie diesem Rhythmus und der realen Informationsdichte entsprechen.

Richte Radien nach der Komponentenrolle aus:

- Arbeitszeilen: kompakt, etwa 8 px
- Felder und beschriftete Buttons: einheitlich, etwa 12 px
- Karten und Arbeitsblätter: etwa 16 px, nur wo ein Blatt fachlich sinnvoll ist
- Sheets, mobile Kopfinseln und Docks: gemeinsames weicheres Radiussystem, etwa 24 px auf Produktionsebene
- mobile Kopf- und Fußnavigation: exakt derselbe Token und dieselbe sichtbare Radiuslogik
- Tablet- und Desktop-Einsätze: normaler Einsatzkartenradius; Auswahl wird durch Terrakotta und Tiefe erklärt, nicht durch extreme Kapselformen

Schatten kennzeichnen nur echte schwebende, fokussiert gezogene oder ausgewählte Elemente. Keine Schatten an normalen Listenzeilen, Feldern oder kleinen Steuerungen. Keine dekorativen Verläufe oder Glasflächen. Funktionale Masken für horizontalen Überlauf sind davon getrennt zu beurteilen.

### 8.5 Bauplanraster und Illustrationen

Das Bauplanraster bleibt erhalten, liegt aber ausschließlich im Arbeitsgrund:

- Nebenlinien: `#F1ECE4`, sehr fein, etwa 0,5 px auf der Referenzebene
- jede vierte Haupt-/Registrierungslinie: `#E7DED2`, minimal präziser, etwa 0,6 px
- keine Linien über Text, Karten, Formularen oder Bedienzeilen
- wenige Registrierungsmarken nur an sinnvollen Fixpunkten
- kein Kontrastwettbewerb mit echten Inhalten

Technische Illustrationen bleiben nur in echten Leerzuständen oder bei erster Orientierung erhalten. Pro Ansicht höchstens ein monochromes Motiv mit ruhiger Terrakotta-/Ton-Strichführung. Keine Cartoons, Stockbilder oder wiederkehrenden Dekorationen.

Keine Illustrationen in:

- Einsatzplanung
- dichten Listen oder Tabellen
- Formularen und Prüfungsabläufen
- Finanzansichten
- Fehler-, Offline- und Konfliktzuständen

Ein Ladezustand ist kein Leerzustand. Ein Ladefehler ist kein Leerzustand. Eine Filterleere benötigt eine andere Erklärung und Aktion als ein tatsächlich leerer Datenbestand.

## 9. Gemeinsame Bedienmuster

### 9.1 Seitenkopf und Hierarchie

Jede Seite beginnt mit einer klaren Orts-/Titelstruktur und höchstens einer dominanten Primäraktion. Sekundäre Schritte werden als Text- oder Linienaktion geführt. Kontextmenüs ersetzen keine sichtbar notwendige Hauptaktion.

Die reale `PageHeader`- und Hilfefunktion bleibt erhalten. Pro Seite weiterhin höchstens ein gesammelter Hilfeeinstieg; lange Erklärungen nicht offen zwischen Arbeitsinhalt stellen.

### 9.2 Buttons und Touchflächen

Unterscheide immer zwischen sichtbarer Buttonfläche und tatsächlichem Touchziel.

- Zentrale Touchziele: 44–48 px.
- Mobile Primäraktion: kompakte, inhaltsabhängige Breite, rechts in der Abschlusszone.
- Sekundärschritt: links in derselben Zeile.
- Keine pauschal bildschirmbreiten dunklen Buttons.
- Volle Breite nur dort, wo sie fachlich und visuell wirklich angemessen ist, etwa ein einzelner klarer Startpunkt in einem schmalen Formular.
- Beschriftete Terrakotta-Buttons verwenden denselben Radius.
- `loading`, `disabled`, `gespeichert`, Fehler und Fokus bleiben sichtbar und funktional.
- Die bestehende Breitenreservierung zwischen normalem und ladendem Buttonzustand darf nicht verloren gehen.
- Iconbuttons benötigen verständliche `aria-label`-Texte und ausreichend große Ziele; nicht jedes Icon braucht ein sichtbares Label.
- In großen Arbeitstagkarten werden Pause, Weiter und Stopp mit kurzen sichtbaren Textlabels geführt. Die kompakte mobile Arbeitstagkarte und die Timer-Leiste dürfen bewährte Symbole ohne sichtbare Zusatzlabels verwenden; zugängliche Namen und 44–48-px-Ziele bleiben verpflichtend.

Einfache mobile Aktionszonen benötigen keine zusätzliche schwere Kartenfläche. Sie liegen oberhalb von Dock, Timer-Leiste und Tastatur und berücksichtigen Safe Areas sowie die gemessenen Höhen der bestehenden App-Hülle.

### 9.3 Felder, Suche und Auswahl

- Einheitliche Feldhöhe, Kontur, Fokus und Beschriftung nach Komponentenrolle.
- Suchfelder enthalten dort, wo es ihre Erkennbarkeit verbessert, dasselbe ruhige Suchsymbol.
- Fokus verändert nicht die Feldgröße und erzeugt keine dicken Doppelrahmen.
- Auswahl: warme Tonfläche `#F3E4D8` plus feine Kontur `#D5B39E` und eindeutiger Text/Häkchen.
- Passive Information: neutrale Fläche, keine Auswahlkontur und keine scheinbare Aktion.
- Deaktiviert: weiterhin lesbar und als nicht bedienbar erkennbar, nicht nur durch sehr niedrige Opazität.
- Filter bleiben kompakte Arbeitszeilen und werden nicht zu einer Pillenflut.

### 9.4 Tabs und Unteransichten

Woche/Monat/Tag sowie Personen/Baustellen verwenden kompakte Texttabs mit präziser aktiver Unterlinie. Bestehende Unterreiter-Adressen, Deep Links, Rollenfilter und Scroll-Into-View-Verhalten bleiben erhalten.

Kein Tab darf nur deshalb verschwinden, weil die neue Leiste schmaler wird. Bei vielen Einstellungstabs bleiben Gruppierung, horizontale Erreichbarkeit beziehungsweise Umbruch und Tastaturbedienung vollständig erhalten.

### 9.5 Listen, Tabellen und Karten

- Ganze Zeilen bleiben antippbar, wenn dies bisher so vorgesehen war.
- Primärinformation, Metadaten, Status und nächste Aktion besitzen eine feste Hierarchie.
- Kompakte Arbeitszeilen statt verschachtelter Karten.
- Tabellen scrollen in eigenen Behältern, wenn der Inhalt wirklich breiter ist; kein horizontaler Seitenüberlauf.
- Bei großen Datenmengen keine dekorativen Abstände zulasten der Übersicht.
- Lager und Chat erhalten ausreichend reale Inhalte und sinnvolle Zeilendichte; kein Muster „viel Fläche, wenig Inhalt“.
- Status wird als Text beziehungsweise sparsames Symbol geführt, nicht als farbige Zeile oder Kante.

### 9.6 Hinweise, Fehler und Offline

Nutze und vereinheitliche die vorhandenen `Hinweiszeile`-, `States`-, Toast- und Verbindungsbausteine.

Ein Hinweis besteht aus:

1. optional einem kleinen, sparsamen Symbol,
2. einem eindeutigen Statustext,
3. höchstens einer klaren nächsten Aktion.

Die Fläche bleibt neutral oder der Hinweis steht als ruhige Zeile ohne Kasten. Keine gelbe oder rote Vollfläche, kein linker Farbstrich und kein dicker Farbrahmen. Fehler und wichtige Offline-Informationen verschwinden nicht automatisch. `role="alert"` und `role="status"` bleiben situationsgerecht; Symbole sind bei redundantem Text `aria-hidden`.

Beispiele:

- „Offline · 2 Schritte vorgemerkt“ mit ruhigem Amber-Text statt gelber Fläche oder Kante.
- „Zahlungsstand konnte nicht geladen werden · Erneut laden“ statt glaubwürdigem `0,00 €`.
- „Abwesenheiten konnten nicht geladen werden · Erneut versuchen“ statt scheinbar freier Kapazität.
- Konflikte nennen den Konflikt und die mögliche Klärung, nicht nur „Fehler“.

### 9.7 Seitenfenster, Bottom Sheets und Dialoge

- Mobil kommen Bottom Sheets von unten, ab Tablet/Desktop Seitenfenster von rechts, sofern der bisherige Interaktionskontext dies vorsieht.
- Auslöser und Ergebnis bleiben räumlich verbunden.
- Fokusfalle, Fokusrückgabe, Escape, Scrollsperre, sichere Schließgeste und Safe Areas bleiben vollständig erhalten.
- Kein Schließen durch versehentliches Scrollen oder seitliches Wischen.
- Bestätigungsdialoge bleiben dort modal, wo die fachliche Entscheidung dies verlangt.
- Keine Animation, die während des Schließens noch Klicks auf bereits unsichtbare Bedienelemente zulässt.

### 9.8 Toast und Rückgängig

Erfolgsfeedback erscheint erst nach bestätigtem Schreiben oder nach nachvollziehbarer, ausdrücklich erlaubter Offline-Vormerkung. Rückgängig bleibt nur dort verfügbar, wo die Fachlogik es tatsächlich unterstützt. Entfernen bleibt dort bestätigungspflichtig, wo kein sicheres Rückgängig existiert.

Toasts bleiben ruhig, kurz und handlungsorientiert. Keine rote Kante am Fehler-Toast. Die bisherigen Hover-/Fokus-Pausen, längere Anzeige mit Aktion und dauerhafte wichtige Meldungen bleiben erhalten.

## 10. Responsive Verhalten

Verwende die vorhandenen Produktionsgrenzen als Ausgangspunkt: Handy bis 759 px, Tablet ab 760 px, Desktop ab 1200 px. Prüfe auch Übergänge und nicht nur die drei Referenzbreiten.

Mindestens prüfen: 320, 360, 390, 430, 640, 759, 760, 834, 1024, 1199, 1200, 1440 und 1920 px; zusätzlich relevante Höhen, Querformat, Zoom und lange Texte.

### Desktop

- schmale, eingelassene Navigation
- wandernder Senklot am aktiven Menüpunkt
- höchstens zwei dominante Arbeitszonen
- kompakte Kennzahlen statt großer KPI-Kacheln
- vollständige Wochenplanung und Ablage
- Seitenfenster statt unnötiger Vollseitenwechsel, sofern der bisherige Ablauf dies vorsieht

### Tablet

- schmale Navigation mit derselben Markenlogik
- keine gequetschten Desktopspalten
- Planung mit ausreichend breiten Tagen und horizontal erreichbarer restlicher Woche
- normale Einsatzkartenradien, keine extremen Auswahlkapseln
- Touch-Long-Press nur dort, wo es die Planungslogik vorsieht

### Mobil

- eine Hauptaufgabe pro Blickfeld
- mobile Kopf- und Fußnavigation mit identischem Radius
- gruppierte „Mehr“-Navigation statt gleichförmiger Kachelwand
- Tagesliste statt verkleinertem Wochenraster
- kompakte Aktionszone oberhalb des Docks
- nichts wird durch Timer, Navigation, Composer oder Tastatur verdeckt
- zentrale Aktionen bleiben mit einer Hand erreichbar, ohne wichtige Desktopinformationen zu verlieren

## 11. Fachlich kritische Bereiche – Darstellung ändern, Logik bewahren

### 11.1 Start-Stopp-Arbeitstag und Zeiterfassung

`ArbeitstagKarte` muss auf Start und oben in der Zeiterfassung sichtbar sein und denselben Sitzungsstand aus dem vorhandenen Zeitsitzungs-Kontext verwenden. Keine zweite Timer-State-Lösung für unterschiedliche Seiten.

Verbindliche Zustände:

- **Bereit:** Start und optionale Baustellenwahl.
- **Laufend:** Arbeitszeit, aktuelle Baustelle, Baustellenwechsel, Pause und Stopp.
- **Pausiert:** Pausendauer, bisherige Arbeit, Weiter und Stopp.
- **Offene Prüfung:** klarer Einstieg in die noch nicht bestätigten Arbeitszeiten.
- **Offline:** vorgemerkte Schritte sichtbar und verständlich; kein falscher Servererfolg.
- **Gerätekonflikt:** Konflikt erklären und Klärung ermöglichen, nicht einfach lokal überschreiben.
- **Lange Laufzeit:** ruhige Erinnerung mit Prüf- und Weiterlaufmöglichkeit.
- **Fehler:** ehrlicher Fehler mit erneutem Laden, ohne die restliche Anwendung zu blockieren.

„Stoppen und prüfen“ bucht nicht automatisch. Nach dem Stopp wird je Baustelle eine Arbeitszeit geprüft und bestätigt. Pausen werden eingerechnet. Nicht zu buchende Abschnitte benötigen einen Grund. Ein vergessener Timer wird niemals automatisch gebucht.

E90 bleibt fachlich maßgeblich: Start, Pause, Weiter, Stopp, Wechsel und Verwerfen schreiben den angezeigten Zustand sofort mit `timerFortschreiben` fort; der Server bestätigt im Hintergrund. `unterwegs` verhindert einen zweiten Schritt und der 30-Sekunden-Abgleich überschreibt keinen laufenden Schritt. Bei Ablehnung werden der vorige beziehungsweise bestätigte Stand und ein verständlicher Grund gezeigt. Erst nach bestätigtem Stopp öffnet die Prüfung. Die Offline-Meldung erscheint einmal je Funkloch; ein Anstoß während eines scheiternden Ausgangsfach-Laufs benötigt einen Nachlauf.

Auf dem Handy stehen Uhr und Timeraktionen in einer Zeile, die Baustelle mit Name und Nummer darunter und Verwerfen in der Kopfzeile. Auf Start bleibt „Zeit von Hand eintragen“ erhalten. Der erste Einsatz führt über die mobile Wegeleiste zu „Anfordern“, „Nachricht“ und „Schein“, ohne zusätzliche Zeit- oder Scheinbuttons zu duplizieren. Ab Tablet bleiben die bisherigen Bedienorte erhalten.

„Neuer Eintrag“, ein Tipp auf eine eigene Buchung, „Nachtragen“ und „Zeit nachtragen“ öffnen auf dem Handy dasselbe vorbelegte `TimeForm` in `BottomSheet`. Deaktivierte Erfassung zeigt eine Erklärung statt einer wirkungslosen Aktion. Fokus, Tastatur, Vorbelegung, Pflichtfelder, Jugendschutz, Zuschläge, Korrekturrechte und Speicherlogik bleiben unverändert.

Die globale `TimerLeiste` hält den Arbeitstag auf anderen Seiten erreichbar. Mobil liegt sie über der unteren Navigation. Ausgenommen sind Start und Zeiterfassung mit ihrer großen Arbeitstagkarte sowie mobil der Nachrichten-Thread mit seinem Composer. Die bestehenden dynamischen Höhenmessungen und Freiräume müssen weiter funktionieren.

Kein permanenter Timer-Puls, kein Countdown-Effekt und keine sekündliche Layoutbewegung. Die Uhr darf sich aktualisieren, ohne Breite, Position oder umliegende Bedienelemente zu verschieben.

### 11.2 Einsatzplanung

Alle bestehenden E88- und späteren Planungsfunktionen bleiben erhalten:

- Woche, Monat und Tag
- Personen- und Baustellensicht
- Personennamen ohne unnötige Kürzel-Kreise oder Begleiticons
- Projekt, Zeit, Ort, Projektnummer, Materialzustand und Termine am Einsatz
- Abwesenheiten, Betriebsurlaub und „Noch einzuplanen“
- schmale Wochenend-/Feiertagsspalten nur solange dort nichts eingetragen ist
- Desktop-Drag-and-drop
- Alt-Taste zum Kopieren
- langes Drücken und Ziehen auf Touch-Tablets
- mobile Umplanung über die Kontextaktionen statt Desktopgesten
- Bearbeiten, Verschieben, auf nächsten Werktag kopieren und Entfernen
- Rückgängig nach Verschieben oder Kopieren
- Entfernen mit Rückfrage, sofern kein sicheres Rückgängig vorhanden ist
- serverseitige Konflikt- und Rechteprüfungen als fachlich maßgebliche Instanz

Nur der ausgewählte Einsatz wird vollflächig terrakotta. Normale Einsätze bleiben helle Arbeitsblätter mit feiner Kontur und sachlicher Terrakotta-Markierung. Der heutige Tageskopf bleibt dunkel und die heutige Spalte warm vertieft. Gelbe Warnkanten werden nicht verwendet. Konflikte und Klärungsbedarf werden durch Text und gegebenenfalls Symbol erklärt. Tablet und Desktop verwenden denselben normalen Einsatzradius; Auswahl verändert Farbe und Tiefe, nicht die Grundform.

Fehler beim Laden von Urlaub oder Betriebsurlaub dürfen nicht wie „keine Abwesenheit“ aussehen. Dieser Zustand benötigt eine sichtbare, ehrliche Darstellung und einen erneuten Ladeversuch.

### 11.3 Material und Lager

Die E89-Bedienlogik und spätere Erweiterungen bleiben erhalten:

- Ein Tipp legt einen Artikel in die Liste.
- An derselben Stelle erscheint die Mengensteuerung ohne zusätzliche Kartenwand.
- Die angezeigte Menge ist die tatsächlich enthaltene Menge.
- Minus bei eins entfernt den Artikel.
- Direkte Mengeneingabe bleibt möglich.
- Ungültige Mengen verändern die Liste nicht.
- Ein zweiter Tipp erhöht die Menge statt eine Doppelzeile zu erzeugen.
- Vorschläge füllen keine Mengen automatisch vor.
- „Zuletzt angefordert“, „Für diese Baustelle abgeholt“ und „Stand zuerst“ bleiben klar getrennt.
- Herkunft „Lager“ beziehungsweise „beim Händler mitgenommen“ bleibt beim Abschluss eindeutig.
- Die serverseitige Übergabe und Anzeige der Herkunft bleibt unverändert.

Die Herkunftsauswahl ist eine kompakte Auswahl mit hellem ausgewähltem Zustand, feiner Kontur und kleinem Häkchen – kein riesiger dunkler Button mit einem einzelnen Wort. Lagerbewegung und Abschlussaktionen sind kompakt und rechts ausgerichtet. Bestand, Stand und nächster Schritt haben Vorrang vor dekorativer Fläche.

### 11.4 Handwerksscheine und Unterschrift

Liste, Detail, Erfassung, Signatur, Offline-Zustand und Abschluss verwenden dieselbe mobile Aktionszone. Primärschritt rechts, sekundärer Schritt links. „Unterschrift löschen“ und „Unterschrift abschließen“ dürfen nicht vertikal unverbunden oder auf unterschiedlichen Höhen schweben.

`SignaturePad`, Speichern, Hash-/Prüfmechanismen, PDF-/Dokumentwege und Offline-Verhalten bleiben fachlich unverändert. Kein optisches Redesign darf die Unterschrift verändern, abschneiden oder ihre Bestätigung auslösen.

Nach E90 zeigt das Handy eine bereits bestimmte Baustelle nur einmal mit Name, Projektnummer, Abrechnung, Adresse und „ändern“. Erst „ändern“ beziehungsweise „Baustelle und Tag ändern“ öffnet Einsätze und Auswahl; ohne Vorbelegung steht die Auswahl sofort bereit. „Zurück“ und „Entwurf“ bleiben leise links. Das leere Signaturfeld erklärt „Mit dem Finger unterschreiben“. Handwerksscheine erhalten keine erfundene eigene Belegnummer; ihre Suche erfolgt über Baustelle und Tag.

### 11.5 Rechnungen und Finanzen

Beträge, Fälligkeit, Zahlungsstand und nächste Aktion stehen direkt am Beleg. Überfällige Rechnungen benötigen keinen roten Zeilengrund und keine rote Kante. Statustext und gegebenenfalls kleines Symbol genügen.

Nach einem Ladefehler darf kein glaubwürdiger Nullwert erscheinen. Ladezustand, echter Nullwert und Fehler sind technisch und visuell getrennt. Exporte, PDFs, Zahlungslogik, Mahnwesen, Nachkalkulation und Buchhaltungsrechte bleiben unverändert. Prüfe Dokumentausgaben auf unveränderte Inhalte und bestehende Layoutregeln.

### 11.6 Nachrichten

- Suchfeld mit dem gemeinsamen Suchmuster.
- Liste mit ausreichender Zeilendichte und echten Vorschauinformationen.
- Thread im ruhigen Claude-inspirierten Lesefluss: eingehende Nachrichten ohne Blase, mit kleinem Absenderzeichen, Name/Zeit und großzügigem Textabstand.
- Nur eigene Nachrichten als kompakte warme Blasen; Breite folgt dem Text bis zu einer angemessenen Maximalbreite.
- Keine fast vollflächigen, hohen oder globigen Sprechblasen und keine Karte um jeden eingehenden Beitrag.
- Eigene Nachrichten hell als `#E8DACC` mit `#2D2924`, dunkel als `#43362F` mit `#F3EEE6`; kleine sachliche Radien und feine Kontur.
- Ruhige Zeitstempel und klare Anhangsdarstellung; Reaktionen und Nachrichtenmenü kontextuell, auch per Tastatur erreichbar.
- Composer als eine weich gerundete, konturierte Eingabefläche mit Anhang links, mehrzeiligem Text und eigenem runden, mindestens 44 px großem Sendeziel rechts.
- „Anhang hinzufügen“ und andere Sekundärschritte links, kompakte Sendeaktion rechts, sofern der aktuelle Ablauf beide besitzt.
- Mobile Timer-Leiste nicht über den Composer legen.
- Ungelesen-, Reaktions-, Melde-, Fehler-, Offline- und Leerzustände bleiben erhalten.
- Tastatur, lange Nachrichten, dynamische Textfelder und sichere untere Abstände prüfen.

### 11.7 Einstellungen, Plattform und öffentliche Seiten

Auch seltene Seiten gehören vollständig zur Linie. Keine alte Kartenwelt in Einstellungen, Plattformverwaltung, Rechtstexten oder Authentifizierung stehen lassen. Gleiche Tokens, Felder, Aktionen, Zustände und Motion verwenden, aber die unterschiedliche Aufgabe respektieren.

Öffentliche Angebotsannahme, Impressum und Datenschutz erhalten keine interne App-Navigation. Die Plattformverwaltung behält ihre bewusste Trennung vom Betrieb. Support-Einblick und Plattformrechte bleiben sichtbar und sicherheitsrelevant unverändert.

`/_muster` wird zur gepflegten, echten Bausteinreferenz erweitert: Buttons, Felder, Auswahl, Fokus, Hinweise, Listen, Tabs, Overlays, Toasts, Arbeitstag, Lade-/Leer-/Fehlerzustände und Reduced Motion. Es dient der Abnahme und darf nicht als Ausweichort für nicht integrierte Produktionsbausteine verwendet werden.

### 11.8 Globale Suche und Baustellenbezeichnungen

Die E91-Suche bleibt rollen-, modul- und zeilenberechtigt. Gruppen sind Seiten, Kunden, Baustellen, Rechnungen, Angebote, Personen und Artikel, jeweils nur mit erreichbarem Ziel. Rechnungen und Angebote suchen nach Nummer einschließlich Stornonummer, nicht nach Kunde; Personen nach Name/E-Mail; Artikel nach Name, Artikel-, Großhändlernummer oder EAN. Teilsuchen einzelner Gruppen dürfen andere erfolgreiche Gruppen nicht verdecken.

Treffer zeigen zwei sachliche Zeilen und eindeutige Nummern beziehungsweise Rollenmetadaten. Rechnungen öffnen das Belegfenster oder bei Projektleitung die gefilterte Leseliste; Angebote, Personen und Artikel führen in ihre jeweilige Arbeitsansicht. `useAdressSuche` beziehungsweise die aktuelle gleichwertige Logik muss `?suche=` auch auf bereits offenen Seiten aktualisieren. Baustellen-Kurzbezeichnungen bleiben in allen neuen Auswahl- und Trefferkontexten lesbar und vollständig.

## 12. Motion-System für die Implementierung

### 12.1 Grundregeln

Bewegung erklärt Herkunft, Ziel und Ergebnis. Sie ist keine eigene Darstellungsebene und darf niemals fachliche Bestätigung vortäuschen.

Implementiere zentrale Motion-Tokens und eine einheitliche Reduced-Motion-Strategie. Verwende bevorzugt CSS-Transitions/Animations oder die bereits verwendete Web Animations API. Bestehende Overlay-Phasen und Exit-Logik sollen wiederverwendet und nicht durch zusätzliche unkoordinierte `setTimeout`-Ketten ersetzt werden.

Animiere bevorzugt `transform` und `opacity`. Vermeide aufwendige Animationen von Layouteigenschaften, großen Schatten oder Filtern. Räume Listener, Animation Frames und Timer beim Unmount auf. Keine Bewegung darf Bedienung, Fokus oder Screenreader-Ausgabe blockieren.

### 12.2 Verbindliche Einsatzorte

| Interaktion | Zielwert | Umsetzung und Nutzen |
|---|---:|---|
| Navigation und wandernder Senklot | etwa 160 ms | Position und aktive Zugehörigkeit erklären; kein Neuladen oder Remount der Seite erzwingen |
| Seitenwechsel | etwa 160 ms | ruhige Opazität, kein seitliches Durchschieben; bestehenden Seitenzustand nicht durch einen neuen `key` zerstören |
| Tabs und aktive Unterlinie | 120–160 ms | Ziel des Wechsels zeigen; Inhalt bleibt sofort bedienbar |
| Drag-Ziel | etwa 120 ms | Zielkontur/Fläche reagiert sofort; keine verspätete Planungsaktion |
| Ablegen und Einrasten | etwa 180 ms | neue Position verständlich machen; Fehler und Rollback bleiben möglich |
| Seitenfenster/Bottom Sheets | etwa 220 ms | aus räumlicher Richtung; Enter und Exit mit Fokus-/Overlaylebenszyklus abstimmen |
| Arbeitstagzustand | 160–180 ms | lokaler Zustand gemäß E90 sofort, Label und Zustand gemeinsam; Serverbestätigung und mögliches Rollback verständlich, Uhr und Position stabil |
| Speichern/Bestätigung | etwa 180 ms | erst nach bestätigtem Schreiben; kein blockierender Erfolgszwischenschritt |
| Toast-Erscheinen | etwa 240 ms | kurze ruhige Einfügung; Anzeigedauer und Rückgängiglogik bleiben davon getrennt |
| Offline/Laden/Fehler | 0–150 ms | sofortiger oder sehr kurzer Zustandswechsel; keine beschönigende Verzögerung |
| Kompakte Listenänderung | 120–160 ms | nur wenn Herkunft/Ziel sonst unklar wäre; keine spektakulären Umordnungsflüge |

Die Zeitwerte sind Zielbereiche, keine Verpflichtung zu vielen unterschiedlichen Tokens. Fasse sie in wenigen sinnvollen Stufen zusammen.

### 12.3 Loading und Skeleton

Reserviere die spätere Struktur, damit Inhalte nicht springen. Ein schnelles Laden soll nicht kurz aufblitzen; eine kleine bestehende Verzögerung vor dem Sichtbarwerden darf erhalten bleiben. Verwende ruhige, deckende Skeletonflächen. Kein permanenter dekorativer Bewegungsloop über echten Daten und kein Skeleton als Ersatz für eine Fehler- oder Leererklärung.

### 12.4 Reduced Motion

Respektiere sowohl `prefers-reduced-motion: reduce` als auch eine vorhandene betriebliche Darstellungswahl, sofern diese Bewegung reduziert.

Bei reduzierter Bewegung:

- keine räumliche Bewegung,
- sofortiger Wechsel oder höchstens etwa 80 ms Opazität,
- kein wandernder Senklot als Animation, sondern sofortige Positionszuordnung,
- kein Drag-Flug; Ziel und Ergebnis bleiben trotzdem eindeutig,
- kein Skeleton-Puls oder Dauerloop,
- vollständige Information und Bedienbarkeit ohne Animation.

Teste Reduced Motion nicht nur als CSS-Medienabfrage, sondern im tatsächlichen Interaktionsablauf einschließlich Sheets, Toast, Navigation und Drag-and-drop.

### 12.5 Verbotene Bewegung

- Bounce und elastisches Überschwingen
- Parallax
- permanenter Timer-Puls
- dekorative Dauerloops
- große Zooms beim Öffnen
- automatische Karussells
- blockierende Erfolgsanimationen
- Animation vor Serverbestätigung, die einen Erfolg behauptet
- Bewegung, die Tastaturfokus oder Klickziele während der Interaktion unzuverlässig macht

## 13. Umsetzungsreihenfolge mit Prüfpunkten

Arbeite inkrementell in einem Themenbranch. Jede Phase erhält nachvollziehbare Commits, Tests und Vorher-/Nachher-Screenshots. Die Phasen sind Qualitätsgates, keine Aufforderung zu mehreren halbfertigen Pull Requests.

### Phase 0 · Bestand und Schutz der Funktionen

- aktuellen `main` und Repository-Regeln erfassen,
- Baseline ausführen,
- Routen-/Tab-/Zustandsmatrix erstellen,
- Funktionsmatrix erstellen,
- Rollen, Modulschalter, Support-Einblick und öffentliche Seiten erfassen,
- vorhandene Tests und Screenshots sichern,
- bekannte Baseline-Probleme von der Umbauarbeit trennen.

**Gate:** Ohne diese Bestandsaufnahme keine Produktivänderung am UI.

### Phase 1 · Tokens, Typografie und gemeinsame Bausteine

- semantische Farb-, Radien-, Abstands- und Motion-Tokens vereinheitlichen,
- Produkt-/Mandantenfarben und hell/dunkel weiterhin trennen,
- Produktionstypografie statt Artboard-Schriftgrößen verwenden,
- `Button`, Felder, Auswahl, Fokus, `ListRow`, `Card`, `Hinweiszeile`, `States`, Tabs und Aktionszonen anpassen,
- gelbe/rote Vollflächen und sämtliche gelben/roten Vertikalkanten entfernen,
- `/_muster` als echte Bausteinreferenz aktualisieren,
- widersprüchliche visuelle Dokumentation und Kommentare bereinigen.

**Gate:** Gemeinsame Bausteine und ihre Zustände sind getestet, bevor zahlreiche Seiten darauf umgestellt werden.

### Phase 2 · App-Hülle und globale Navigation

- Desktop-, Tablet- und mobile Hülle,
- wandernder Senklot,
- mobile Kopf-/Fußnavigation mit identischem Radius,
- gruppierte „Mehr“-Navigation,
- Suche, Profil, globale Bänder, Dialoge und Toast,
- gemessene Höhen, Safe Areas, Timer-/Composer-Ausnahmen,
- Tastaturfokus, Fokus nach Seitenwechsel und Deep Links.

**Gate:** Alle Rollen und repräsentativen Modulkombinationen erreichen ihre bisherigen Ziele; keine tote Navigation, kein verdeckter Inhalt.

### Phase 3 · Tägliche Kernarbeit

- Start und Arbeitstag,
- Zeiterfassung und Stopp-Prüfung,
- Einsatzplanung und persönlicher Plan,
- Material, Anforderungen und Lager,
- Handwerksscheine und persönliche Baustellen,
- Nachrichten.

**Gate:** Die zentralen End-to-end-Abläufe funktionieren in Desktop, Tablet und Mobil einschließlich Offline und Fehlerzuständen.

### Phase 4 · Verwaltung, Vertrieb, Finanzen und Einstellungen

- Baustellenverwaltung und Akten,
- Auftragseingang,
- Angebote und öffentliche Annahme,
- Kunden und Liegenschaften,
- Wartungen,
- Rechnungen, Nachkalkulation und Mitarbeiterübersicht,
- Urlaub und Sonderurlaub,
- Benutzerverwaltung,
- jeder Einstellungstab,
- Plattform, Authentifizierung, Rechtstexte und Papierkorb.

**Gate:** Keine Altoptik in seltenen oder administrativen Ansichten; Exporte, Rechte und externe Abläufe bleiben nachgewiesen erhalten.

### Phase 5 · Motion und mikrointeraktive Konsistenz

Motion wird in den vorherigen Phasen bereits am Baustein umgesetzt. In dieser Phase erfolgt der systemweite Feinschliff:

- doppelte oder widersprüchliche Animationen entfernen,
- Enter/Exit mit Fokus- und Overlaylebenszyklus abgleichen,
- Drag-and-drop und Rückgängig prüfen,
- Timer- und Zahlenstabilität prüfen,
- Reduced Motion vollständig prüfen,
- keine Bewegung nur zur Dekoration ergänzen.

**Gate:** Keine Animation verändert fachlichen Zustand, blockiert Eingaben oder erzeugt Layoutsprünge.

### Phase 6 · Vollständiger Querschnitt und Abnahme

- alle Seiten und Tabs erneut gegen die Matrix prüfen,
- alle Rollen, Modulvarianten und Sonderzustände prüfen,
- alle Breakpoints und langen Inhalte prüfen,
- vollständige Test- und Browserläufe,
- Dokumentation, Handbuch und Abnahmebericht aktualisieren,
- eigenen Diff kritisch gegenlesen,
- keine Freigabe behaupten, solange echte Prüfschritte offen sind.

## 14. Prüfstrategie

### 14.1 Automatisierte Basisprüfungen

Führe mindestens die repositoryeigenen Befehle aus und dokumentiere tatsächliche Ergebnisse:

```bash
npx tsc --noEmit -p .
npm run -s lint
TZ=Europe/Vienna ./node_modules/.bin/vitest run
npm run build
```

Ergänze die vorgesehenen Supabase-/PostgreSQL-Integrationstests, wenn der lokale Stack verfügbar ist:

```bash
node scripts/edge-shared-uebernehmen.mjs
# lokalen Supabase-Stack und Functions gemäß Repository starten
NO_PROXY=127.0.0.1,localhost npx vitest run --config vitest.supabase.config.ts
```

Nutze die vorhandenen Playwright-Konfigurationen und Projekte statt nur einen selbst gewählten Happy Path:

```bash
CHROMIUM_PFAD=<vorhandener-chromium-pfad> NO_PROXY=127.0.0.1,localhost npx playwright test --project=chromium --project=tablet-834
CHROMIUM_PFAD=<vorhandener-chromium-pfad> npm run -s pruefen:links
```

Passe Befehle nur an die tatsächlich vorhandene aktuelle Projektstruktur an. Ein nicht gestarteter WebKit-Lauf ist keine bestandene WebKit-Prüfung und kein nachgewiesener Produktfehler; er bleibt als Prüflücke sichtbar.

### 14.2 Tests für jede neue oder veränderte Regel

Jede neue Prüfung benötigt eine Gegenprobe: ohne die Änderung rot, mit der Änderung grün. Wo Verhalten unverändert bleiben muss, schreibe einen ausdrücklichen Invarianztest.

Beispiele:

- Dieselbe Zeitsitzung erscheint auf Start und Zeiterfassung; keine getrennten Zustände.
- „Stoppen und prüfen“ löst keine automatische Buchung aus.
- Mobile Umplanung verwendet weiterhin die fachlichen Einsatzaktionen und keine unzulässige Desktopgeste.
- Ein zweiter Materialtipp erhöht die Menge und erzeugt keine Doppelzeile.
- Ungültige Mengen verändern die Liste nicht.
- Ein Ladefehler wird nicht als Nullwert oder fehlende Abwesenheit dargestellt.
- Rollen-/Modulfilter liefern vor und nach dem Umbau dieselben erreichbaren Ziele.
- Legacy-Redirects und Deep Links führen weiterhin zum richtigen Ziel.
- Reduced Motion verhindert räumliche Bewegung, ohne Dialoge oder Aktionen unbedienbar zu machen.
- Toast-Hover und -Fokus pausieren die Anzeigedauer weiterhin.
- Bottom Sheets geben den Fokus an den Auslöser zurück und sperren den Hintergrund korrekt.

### 14.3 Rollen- und Modulmatrix

Prüfe mindestens alle vorhandenen Rollen:

- Mitarbeiter
- Verwaltung
- Buchhaltung
- Projektleiter
- Geschäftsführung
- Administrator

Zusätzlich:

- Zusatzrecht Rechnungen lesen
- Projektleitung im Einsatzplan
- Team-Woche ein/aus
- wesentliche Module ein/aus
- Unterfähigkeiten wie Liegenschaften, Auftragseingang und Fahrzeuglager
- Support-Einblick und globaler Plattformadministrator
- öffentliche Seiten ohne interne Sitzung

Die UI-Sichtbarkeit ist keine Sicherheitsgrenze. Serverseitige Rechte und RLS bleiben maßgeblich und dürfen durch Designänderungen nicht umgangen werden.

### 14.4 Visuelle und responsive Prüfung

Erstelle Vorher-/Nachher-Screenshots aus der echten Anwendung für jede Route-/Tabgruppe und relevante Zustände. Die 41 Designseiten sind Orientierung, aber keine vollständige Testmatrix.

Prüfe:

- keine horizontale Seitenbewegung außer ausdrücklich dafür vorgesehenen Tabellen-/Planungscontainern,
- keine verdeckten Aktionen hinter Dock, Timer, Composer oder Tastatur,
- Safe Areas und Querformat,
- lange Namen, große Beträge, viele Zeilen und leere Daten,
- Browserzoom und vergrößerte Schrift,
- hell und dunkel,
- Mandantenbranding,
- Fokus, Hover, Active, Disabled, Loading und Saved,
- Reduced Motion,
- Druck-/PDF-Ansichten nach den bestehenden Repositoryregeln.

Screenshot-Vergleiche sind zu reviewen, nicht blind zu aktualisieren. Jede bewusste Änderung muss erklärbar sein.

### 14.5 Accessibility und Bedienung

- Semantische HTML-Elemente statt klickbarer `div`-Konstruktionen.
- Sichtbarer Tastaturfokus und nachvollziehbare Fokusreihenfolge.
- Vollständige Tastaturbedienung aller Menüs, Tabs, Dialoge und Aktionen.
- `aria-label`, `aria-busy`, `role="status"` und `role="alert"` nur situationsgerecht.
- Keine Information ausschließlich über Farbe, Icon oder Animation.
- Kontraste in beiden Themes prüfen.
- Mindestens die vorhandenen axe-Prüfungen ausführen; axe allein ist keine vollständige Accessibility-Abnahme.
- Screenreader-Stichproben für Arbeitstag, Planung, Formulare, Sheets und Nachrichten.
- Touchziele nicht nur visuell, sondern gemessen prüfen.

### 14.6 Offline, PWA und Leistung

- Offline-Vormerkungen und idempotente Schritte unverändert testen.
- Keine neuen Schreibvorgänge allein für visuelle Zwecke in die Outbox aufnehmen.
- Abmelden mit ungesendeten Vorgängen weiterhin absichern.
- Service-Worker-Update und erneutes Öffnen nach Deployment testen.
- Bereits besuchte und noch nicht geladene Routen offline unterscheiden.
- Lazy Loading und Vorladen nicht durch zentrale Designimporte verschlechtern.
- Bundlegröße und unnötige neue Dependencies kontrollieren.
- Keine Layoutsprünge durch Schrift, Skeleton, Timer oder Motion.
- Keine dauerhaften Animationen mit unnötigem CPU-/Akkuverbrauch.

### 14.7 Reale Geräte und externe Integrationen

Vor einer endgültigen Gesamtabnahme sind erforderlich:

- physische iOS-Geräte mit Safari,
- physische Android-Geräte mit Chrome,
- relevante Tablets und Touch-Interaktionen,
- WebKit-Lauf zusätzlich zur Geräteprüfung,
- Hosted-Supabase-/RLS-/Edge-Function- und Storage-Prüfung,
- verfügbare externe Integrations- und Exporttests.

Wenn BMD-/Accounting-, DATANORM-, CAMT-, SharePoint- oder andere externe Systeme in der Umgebung nicht verfügbar sind, dokumentiere diese Abnahme als offen. Erkläre niemals allein aufgrund erfolgreicher Unit- und Chromium-Tests die gesamte Anwendung für vollständig abgenommen.

## 15. Besondere Regressionsschwerpunkte

Frühere Prüfungen haben gezeigt, dass gerade weniger sichtbare Integritätsdetails gefährdet sind. Prüfe deren aktuellen Stand am verwendeten `main`, ohne alte Befunde ungeprüft als aktuelle Fehler zu behaupten:

- Restberechtigungen nach dem Entfernen einzelner Rüstlisten-Zuweisungen
- serverseitige statt browserbehauptete Akteursidentität im Lagerjournal
- Zahlungs-KPI bei Ladefehler versus echtem Nullwert
- Abwesenheits-Ladefehler versus tatsächlich freie Planung
- eindeutige Material-/Preisauflösung bei doppelten Namen
- lange ID-Listen und Ergebnisbegrenzungen
- Zuordnung der persönlichen Arbeitsschein-Abstimmung zur tatsächlich arbeitenden Person
- Node-Versionskonsistenz in Build und Deployment
- vollständige Vorschau-Fixtures und Testisolation
- große Module und unbeabsichtigte Seiteneffekte gemeinsamer Änderungen

Diese Punkte sind Prüfinventar, kein Freibrief für einen vermischten Bugfix-Umbau. Dokumentiere neu bestätigte Fehler mit Evidenz und grenze notwendige Fixes sauber ab.

## 16. Dokumentation im Repository

Aktualisiere nach erfolgreicher Umsetzung:

- verbindliche Designlinie und Token-/Komponentenregeln,
- Seitenleitfaden und bisherige UI-Entscheidungen,
- `/_muster` und zugehörige Erläuterungen,
- Funktions-/Routen-/Tabmatrix,
- Handbuch bei verändertem Bedienverhalten,
- laufenden Stand und erledigte Punkte,
- Prüfbericht mit ausgeführten Befehlen, Geräten und offenen Grenzen.

Entferne veraltete Aussagen wie „rote Kante am Fehler-Toast“, wenn die Umsetzung diese Kante abgeschafft hat. Kommentare erklären weiterhin das Warum und beschreiben nicht bloß sichtbaren Code.

## 17. Abnahmekriterien

Die Umsetzung ist erst als vollständig umgesetzt zu bezeichnen, wenn alle zutreffenden Punkte erfüllt sind:

1. Jede im aktuellen `main` vorhandene Seite, jeder Tab und jede relevante Sonderansicht ist in der Abdeckungsmatrix enthalten und bearbeitet.
2. Die Funktionsmatrix weist für jede bestehende Aktion und Information das Verhalten nach dem Umbau nach.
3. Keine unbegründete Entfernung, kein nicht funktionierender Ersatz und keine tote Bedienfläche.
4. Zentrale fachliche End-to-end-Abläufe sind automatisiert und mit realen Benutzerinteraktionen geprüft.
5. Alle verfügbaren Typecheck-, Lint-, Unit-, Integrations-, Build-, Link- und Browserprüfungen sind grün; Baseline-Probleme sind klar getrennt dokumentiert.
6. Responsive Screenshots und Sichtprüfungen umfassen alle Modulgruppen und Sonderzustände.
7. Keine gelben/roten Vollflächen und keine gelben/roten Vertikalkanten mehr für Warnungen oder Fehler.
8. Mobile Kopf-/Fußnavigation, Buttonradien, Felder, Tabs, Aktionszonen und Statusmuster sind konsistent.
9. Reduced Motion, Tastatur, Fokus, Offline, Safe Areas und lange Inhalte sind geprüft.
10. Exporte, PDFs, Deep Links, Rechte und Offline-Verhalten sind nicht verschlechtert.
11. Nicht durchführbare reale Geräte-, Hosted-Security- oder externe Integrationstests sind ausdrücklich als offen benannt.
12. Kein Merge, Deployment oder Produktivdateneingriff ohne ausdrückliche Freigabe.

## 18. Verlangter Abschlussbericht des LLM

Liefere am Ende einen kompakten, aber vollständigen Bericht mit:

1. Ausgangscommit, Branch und tatsächlich geänderten Bereichen.
2. Architekturentscheidungen und wiederverwendeten Bausteinen.
3. Vollständiger Abdeckungs- und Funktionsmatrix beziehungsweise deren Dateipfad.
4. Bewusst geändertem Bedienverhalten mit Begründung.
5. Ausgeführten Prüfbefehlen und realen Ergebnissen einschließlich Testzahlen.
6. Vorher-/Nachher-Screenshots mit Rollen, Zuständen und Viewportgrößen.
7. Accessibility-, Offline-, PWA- und Reduced-Motion-Ergebnissen.
8. Offenen Prüfgrenzen und verbleibenden Risiken ohne Beschönigung.
9. Aktualisierten Dokumentationsdateien.
10. Klarer Aussage, ob lediglich ein geprüfter Branch bereitsteht oder welche externen Abnahmen noch ausstehen.

Behaupte nicht „alles funktioniert vollständig“, wenn ein relevanter Prüfbereich nicht tatsächlich ausgeführt wurde. Formuliere stattdessen präzise, was nachgewiesen ist und was weiterhin einer realen Abnahme bedarf.

## 19. Startanweisung

Beginne jetzt mit Phase 0 auf dem aktuellen `main`. Implementiere erst nach vollständiger Bestandsaufnahme. Arbeite danach konsequent bis zur letzten zutreffenden Phase, ohne dich auf exemplarische Seiten zu beschränken. Stoppe nur bei sicherheitsrelevanten Unklarheiten, notwendigen Produktivdateneingriffen oder einer erforderlichen Merge-/Deploymentfreigabe. Dokumentiere jede solche Blockade konkret und setze alle unabhängig davon möglichen Prüf- und Dokumentationsschritte fort.
