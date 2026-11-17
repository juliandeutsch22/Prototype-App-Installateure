# Senklot · Warmes Papier und klare Arbeit · V10

## Stil und Leitidee

Die zehnte Entwurfsstufe gibt Senklot eine warme, redaktionelle und ruhige Arbeitsatmosphäre, inspiriert vom Look und Vibe von Anthropic/Claude, ohne fremde Markenassets zu kopieren. Serifige Überschriften, ruhige Blätter und präzise Konturen prägen sie. Die Farben waren in V10 warmes Papier und Terrakotta; seit E95 (17.11.2026) ist es wieder die Petrolwelt auf weißem Grund (siehe „Farb- und Rollentokens“). Der Senklot, das Bauplanraster und die sachlichen Modulicons bewahren die eigene Produktherkunft.

Premiumwirkung entsteht aus Typografie, Abstand, präzisen Konturen und verlässlicher Reaktion. Helle Arbeitsblätter liegen auf einem warmen Grund; Tiefe entsteht nur dort, wo ein Element tatsächlich schwebt, gezogen oder ausgewählt wird. Keine dekorativen Verläufe, Glasflächen, Bounce-Effekte, schweren Kachelwände oder beliebigen Schatten.

Funktionsumfang, Reihenfolge der Abläufe, Rollen, Rechte und fachliche Zustände bleiben unverändert. Die Gestaltung wird auf jede Seite, jeden Tab, jede Akte, jeden Dialog und jeden relevanten Sonderzustand angewendet, nicht nur auf die dargestellten Musterseiten.

## Typografie und Rhythmus

- `DM Sans` für Bedienung, Labels, Fließtext, Namen und allgemeine Produktinformation.
- `Source Serif 4` für größere redaktionelle Seiten- und Bereichstitel; reguläres Gewicht statt schwerer Displaytypografie.
- `IBM Plex Mono` für Beträge, Zeiten, Datumswerte, Projektnummern, Mengen und kompakte gemessene Werte.

Die Schriften sind in der Produktionsanwendung lokal beziehungsweise zuverlässig selbst gehostet bereitzustellen. Metriken und Fallbacks sind so zu wählen, dass Schrift laden keinen Layoutsprung erzeugt. Serifen bleiben eine Titelentscheidung: kleine Bedienung, Tabellen, Formulare, Zeitwerte und kompakte Metadaten bleiben sachlich und schnell lesbar.

Namen und aktuelle Arbeitsinhalte erhalten mehr Gewicht als Metadaten. Lange Kunden-, Baustellen- und Personennamen bleiben lesbar; bestehende Umbruch-, Trenn- und `min-width: 0`-Regeln werden nicht geschwächt. Zahlen bleiben tabellarisch ausgerichtet und springen bei Aktualisierungen nicht seitlich.

Die Mappe verwendet skalierte Artboards. Ihre Schrift-, Linien- und Abstandswerte sind keine direkt zu kopierenden CSS-Vorgaben. In der Produktionsanwendung gelten die bestehende barrierearme Typografie-Skala und mindestens 44–48 px große zentrale Touchziele; übertragen werden Hierarchie, Proportion und visuelles Gewicht.

Acht Pixel bilden den Grundrhythmus; vier Pixel dienen nur der feinen inneren Ausrichtung. Linien trennen nur dort, wo sie Lesen oder Bedienung unterstützen.

## Farb- und Rollentokens

**Seit E95 (17.11.2026) in Petrol.** Gestalt, Radien, Schatten, Schriften und
Regeln von V10 gelten weiter; die Farben sind wieder die Petrolwelt der Linie
„Lot“ auf weißem Grund (Entscheidung E95 in `docs/ui-umbau/entscheidungen.md`).
Maßgeblich sind die Tokens in `src/index.css`; die Tabellen nennen sie.
Die terrakottafarbenen V10-Zielwerte gelten nicht mehr.

| Rolle | Wert hell | Verwendung |
|---|---:|---|
| Primärakzent / Petrol (`--brand`) | `#0F4552` | Primäraktionen, aktive Auswahl, Senklotzeichen und wenige Arbeitsmarkierungen |
| Haupttext (`--text`) | `#13262C` | Titel und primäre Information |
| Dunkle Arbeitsfläche (`--dunkel-flaeche`) | `#0F3C47` | laufender Arbeitstag, dunkle Schwerpunktkarten |
| Navigation (`--navi`) | `#0F3C47` | Desktop-/Tablet-Navigation, Text `#C6DCE0` |
| Seitengrund und Blatt (`--bg`, `--surface`) | `#FFFFFF` | Arbeitsgrund und fachliche Arbeitsflächen |
| App- und Geräteflächen (`--surface-2`) | `#F3F6F6` | eingelassene mobile und Systemflächen |
| Gedämpfter Text (`--text-muted`) | `#5A6D72` | Metadaten und sekundäre Erklärungen |
| Inaktive mobile Icons (`--inaktiv-symbol`) | `#5F7176` | passive Docksteuerung (4,7 : 1 auf der Insel) |
| Auswahl (`--auswahl`) | `#E4EEF0` | ausgewählte Zeilen, Optionen und aktive mobile Navigation |
| Auswahlkontur (`--auswahl-kontur`) | `#A9C8CE` | feine Auswahl |
| Fokusring (`--focus-ring`) | `#2D7383` | sichtbarer, ruhiger Fokus |
| Konturen (`--border`, `--insel-kontur`) | `#DFE7E9` | Arbeitsblätter, Felder, mobile Inseln |
| Kräftige Linie (`--border-strong`) | `#C2D2D5` | Feldränder, sinnvolle Trennung |
| Pausierter Arbeitstag (`--pause-flaeche`) | `#E9EEEF` | neutraler Pausenzustand |
| Warnung (`--warning`) | `#94570A` | Statustext und sparsames Symbol |
| Fehler (`--danger`) | `#B42318` | Statustext und sparsames Symbol |
| Text auf dunklen Flächen (`--auf-dunkel`) | `#FFFFFF` | Arbeitstag und dunkle Primärflächen; Akzent darauf `#7CC4D2` |
| Eigene Chatblasen (`--chat-eigen`) | `#E4EEF0` | eigene Nachrichten mit dunklem Text, Kontur `#C6DCE0` |
| Raster neben / Haupt | `#F3F6F6` / `#E6EDEE` | sehr leise im Arbeitsgrund |

Petrol auf weißem Grund und Weiß auf Petrol liegen weit über AA (über
11 : 1); gemessen werden alle Paare beider Sätze in `lotGrundwerte.test.ts`.
Farbe ist niemals der einzige Informationsträger.

Die Trennung zwischen Produktfarbe und Mandantenbranding bleibt erhalten. Eine betriebliche Hausfarbe darf Navigation, Statussemantik oder Fehlerfarben nicht verfälschen. Druck- und PDF-Ausgaben folgen weiterhin ihren bestehenden Fachregeln.

### Dark Mode · eigene dunkle Petrolwelt

Der Dark Mode ist eine vollständige zweite Oberflächenwelt, keine mechanische Inversion. Er wird unter „Einstellungen → Mein Konto → Darstellung und Bewegung“ mit „Hell“, „Dunkel“ und „System“ gewählt; „System“ folgt der Geräteeinstellung. Die Auswahl gilt auf allen Seiten, Tabs, Akten, Dialogen, Sheets und Zuständen.

| Rolle | Wert dunkel | Verwendung |
|---|---:|---|
| Seitengrund (`--bg`) | `#0C1C20` | Arbeitsgrund |
| Arbeitsfläche (`--surface`) | `#12262B` | Listen, Blätter und große Arbeitsbereiche |
| Eingelassene Flächen (`--surface-2`) | `#0F2226` | mobile Inseln, Systemflächen |
| Navigation (`--navi`) | `#091619` | Desktop-/Tablet-Navigation |
| Auswahl (`--auswahl`) | `#17343B` | aktive Zeile oder Navigation |
| Haupttext (`--text`) | `#E5EFF0` | primäre Information |
| Gedämpfter Text (`--text-muted`) | `#9FB5BA` | Metadaten und sekundäre Erklärung |
| Linien / Konturen (`--border`) | `#22393F` | funktionale Trennung, kräftig `#33515A` |
| Akzent auf Dunkel (`--accent-deep`) | `#7CC4D2` | Textakzent, Fokus und aktive Symbole |
| Primäraktion (`--brand`) | `#236C7B` mit `#FFFFFF` | kontraststarke Aktionsfläche |
| Warnung / Fehler | `#E2A54A` / `#F07A6E` | Statustext und sparsames Symbol |
| Eigene Chatnachricht | `#17343B` mit `#E5EFF0` | eigene Beiträge, feine Kontur `#2F5A64` |
| Raster neben / Haupt | `#0F2226` / `#152C31` | sehr leise im Arbeitsgrund |

Reale Kontraste sind für jede Komponente und jeden Zustand zu messen. Helle Schrift auf Petrol und aufgehelltes Petrol als Text auf dunklem Grund haben unterschiedliche Rollen und werden nicht vertauscht. Dunkle Flächen erhalten keine schweren schwarzen Schatten; Konturen und begrenzte Tonabstufungen tragen die Hierarchie. Systemwechsel dürfen keinen ungespeicherten Formular-, Timer-, Chat- oder Offline-Zustand zurücksetzen.

## Flächen, Auswahl und Tiefe

Auswahl und passive Information sind nicht dieselbe helle Fläche. Ausgewählte Arbeitszeilen erhalten eine warme Tonfläche und feine Kontur; neutrale Hinweise bleiben konturlos oder nur sachlich abgesetzt. Deaktivierte Elemente bleiben lesbar und als nicht bedienbar erkennbar.

Warnung und Fehler färben keine vollständigen Listenzeilen, Arbeitskarten, Hinweisbalken oder Fehlerpaneele. Eindeutiger Statustext, sparsame Symbole und die nächste Aktion tragen die Bedeutung. Bestehende farbige Vertikalkanten werden nicht wieder als Statussystem eingeführt.

Der laufende Arbeitstag bleibt bewusst dunkel und ruhig. Der Akzent (`--auf-dunkel-akzent`) wird dort nur als kleiner Status- oder Arbeitsakzent eingesetzt, nicht als große orangefarbene Karte. Bereit und pausiert bleiben helle, klar unterscheidbare Zustände.

App- und Geräteflächen verwenden einen weichen Schatten mit etwa 20 px Unschärfe und 7 px Versatz. Mobile Kopf- und Navigationsinseln verwenden dasselbe Radiussystem sowie etwa 12 px Unschärfe und 4 px Versatz. Aktive Tagesköpfe und ausgewählte Einsätze dürfen eine geringe zusätzliche Tiefe erhalten. Kompakte Bedienzeilen, normale Plankarten, Felder und kleine Steuerungen bleiben ohne Schatten.

## Radien und Bedienflächen

Radien folgen der Komponentenrolle statt einer pauschalen Kapseloptik:

- Arbeitszeilen: kompakt, etwa 8 px.
- Felder und beschriftete Buttons: einheitlich, etwa 12 px.
- Karten und Arbeitsblätter: etwa 16 px, nur wo ein Blatt fachlich sinnvoll ist.
- Sheets, mobile Kopfinseln und Docks: gemeinsames weicheres System, etwa 24 px auf Produktionsebene.
- Mobile Kopf- und Fußnavigation: exakt derselbe Token und dieselbe sichtbare Radiuslogik.
- Tablet- und Desktop-Einsätze: normaler Einsatzkartenradius; Auswahl verändert Farbe und Tiefe, nicht die Grundform.

Die sichtbare Buttonfläche und das tatsächliche Touchziel sind getrennt zu bemessen. Zentrale Touchziele bleiben 44–48 px groß. Mobile Primäraktionen liegen kompakt und inhaltsabhängig rechts in der Abschlusszone; sekundäre Schritte stehen links. Volle Breite ist nur dort sinnvoll, wo ein einzelner klarer Abschluss dies verlangt. Nichts wird hinter Timer, Navigation, Composer oder Tastatur verdeckt.

## Bauplanraster und Illustrationen

Das Raster bleibt ein erkennbares Herkunftsmerkmal, wird aber nicht zum dekorativen Vordergrund:

- Nebenlinien `#F1ECE4`, etwa 0,5 px auf der Referenzebene.
- Jede vierte Haupt-/Registrierungslinie `#E7DED2`, etwa 0,6 px.
- Rasterlinien nur im Arbeitsgrund, niemals über Text, Karten, Formularen oder Bedienzeilen.
- Wenige Registrierungsmarken nur an sinnvollen Fixpunkten.

Technische Illustrationen erscheinen nur in echten Leerzuständen oder bei erster Orientierung. Pro Ansicht höchstens ein monochromes Motiv mit ruhiger Strichführung im Akzent und etwa 1,25 px Strichstärke. Keine Cartoons, Stockbilder oder wiederkehrenden Dekorationen.

Einsatzplanung, dichte Listen, Formulare, Finanzansichten, Fehler-, Offline- und Konfliktzustände bleiben ohne Illustration. Ein Ladezustand ist kein Leerzustand; ein Ladefehler ist kein Leerzustand; eine Filterleere benötigt eine andere Erklärung und Aktion als ein tatsächlich leerer Datenbestand.

## Markenzeichen und Navigation

Der Senklot bleibt als vertikale Lotlinie mit spitzem Körper und Fußlinie erhalten. Auf Desktopseiten wandert er mit dem aktiven Menüpunkt und erscheint zusätzlich dezent am unteren Navigationsrand. Tablet nutzt dieselbe Markierung in der schmalen Navigation. Mobil führt das Zeichen (seit E95 in Petrol) in einer hellen Kopfinsel (seit E93/E94 als weicher Tropfen mit rundem Kragen und Faden, Wortmarke in Source Serif 4; dieselbe Form trägt das Senkblei der Navigation); der aktive Bereich der unteren Navigation erhält eine hinter Icon und Text liegende Auswahlfläche, die beim Wechsel samt Lot zum neuen Punkt gleitet (E95, `lib/untenGleiten.ts`).

Die Desktopnavigation ist schmal, dunkel und ruhig. Modulicons bleiben als Navigationshilfe erhalten. Personennamen in der Einsatzplanung erscheinen ohne Kürzel-Kreise oder andere Begleitsymbole. Die mobile „Mehr“-Navigation verwendet zwei kompakte, gruppierte Listen für „Planung & Arbeit“ sowie „Vertrieb & Verwaltung“. Rollen- und Modulabhängigkeit bleibt sichtbar und vollständig bedienbar.

## Steuerungen und Zustände

Woche/Monat/Tag sowie Personen/Baustellen verwenden kompakte Texttabs mit einer präzisen aktiven Unterlinie statt schwerer Segmentkästen. Bestehende Unterreiter-Adressen, Deep Links, Rollenfilter, Tastaturbedienung und Scroll-Into-View-Verhalten bleiben erhalten. Eine Primäraktion bleibt je Kontext sichtbar; sekundäre Aktionen sind Text- oder Linienaktionen. Filter bleiben Arbeitszeilen und werden nicht zu einer Pillenflut.

Große Arbeitstagkarten beschriften Pause, Weiter und Stopp mit kurzen Textlabels. Die kompakte mobile Arbeitstagkarte und die globale Timer-Leiste dürfen bewährte Symbole ohne sichtbare Zusatzlabels verwenden. Alle Iconbuttons benötigen verständliche `aria-label`-Texte und ausreichend große Ziele. Lade-, Speicher-, Deaktivierungs-, Fehler- und Fokuszustände bleiben sichtbar und funktional; die vorhandene Breitenreservierung von Buttons darf nicht verloren gehen.

## Hauptaktion, Neu und Fenster · Durchsicht 15.11.2026 (U1–U4)

Die Hauptaktion stand am Handy an fünf verschiedenen Stellen. Seit der Durchsicht gibt es genau drei Muster, und jedes ist ein Baustein — keine Konvention, die jede Seite neu auslegt. Die Musterseite zeigt sie unter „Hauptaktion: drei Muster“; die Wächter in `tests/unit/bedienregeln.test.ts` halten sie im Quelltext.

1. **Liste** — eine kompakte Aktion rechts unten über der Fußinsel (`PageHeader.action`, am Handy im Daumenbereich). Ab dem Tablet steht sie rechts im Seitenkopf.
2. **Akte** — eine kompakte Aktion an derselben Stelle (`AktenKopf.action`), alles Weitere im ⋯ des Seitenkopfs (`AktenKopf.weitere`). Der eine häufige Nebenweg (`AktenKopf.zweit`, etwa „Bearbeiten“ neben „Einsatz planen“) steht ab dem Tablet als Zweitknopf links neben der Hauptaktion und am Handy als erster Eintrag im ⋯. Eine Gruppe von Knöpfen als Hauptaktion gibt es nicht mehr — sie wurde am Handy zu Balken über die ganze Breite.
3. **Formular und Einstellung** — eine klebende Speicherleiste (`Speicherleiste`), überall gleich: sie erscheint erst, wenn etwas vom gespeicherten Stand abweicht, „Verwerfen“ links, „Speichern“ rechts, darüber ein Satz zum Stand; nach bestätigtem Schreiben „Gespeichert“ im selben Knopf. In einem Blatt klebt sie am unteren Rand des Blatts, frei am unteren Rand über der Fußinsel. Seltenes, das nur Felder füllt („Auf Standardwerte zurücksetzen“), steht im ⋯ des Seitenkopfs.

**Neu anlegen (U2).** Am Handy öffnet „Neu …“ immer ein Blatt von unten; die Seite zeigt zuerst den Bestand. Ab dem Tablet darf das Formular als Blatt neben dem Bestand stehen. Baustein: `NeuFormular` (am Handy `BottomSheet`, ab dem Tablet `Card`), die Hauptaktion im Seitenkopf öffnet es. Ein Neu-Ablauf, der eine eigene Seite ist (Schein, Angebot, Rechnung als Arbeitsbereich mit Vorschau), bleibt eine Seite.

**Keine Aktion doppelt (U3).** Was ein Blatt auf dem Bildschirm schon trägt, steht nicht noch einmal schwebend darüber. Je Einsatz eine Aktionszeile in einer Form.

**Fenster (U4).** Ein Fenster hat eine gefüllte Hauptaktion rechts, höchstens eine zweite (gerahmt) links daneben, alles Weitere im ⋯ ganz links (`Fensteraktionen`). Unumkehrbares (Löschen, Stornieren) steht immer im ⋯, nie als Knopf neben dem nächsten Schritt. Eine Knopfreihe trägt höchstens zwei Knöpfe und höchstens eine Hauptaktion; die Rückfrage (`ConfirmDialog`) bleibt, wie sie ist — ihr Bestätigen ist der Schritt selbst.

## Schalter und Kästchen · Durchsicht 15.11.2026 (U6, E3)

Ein **Schalter** (`Schalter`) für alles, was sofort wirkt: Module, Meldungen, eine Pflicht für den ganzen Betrieb, ein Filter der Ansicht. Er ist ein echter Knopf mit `role="switch"` und `aria-checked`, schaltet mit Leertaste und Enter, und die ganze Zeile samt Etikett ist das Ziel. Den Zustand tragen Lage, Farbe und ein Häkchen im Griff — Farbe allein nie. Braucht ein Wechsel eine Rückfrage (ein Modul, an dem etwas hängt), springt der Schalter erst nach der Bestätigung um; scheitert das Speichern, steht er wieder, wo er war, und der Grund steht daneben. Während er schreibt, ist er gesperrt.

Das **Kästchen** bleibt für die Auswahl in einem Formular, das erst mit „Speichern“ gilt, und für das Abhaken einer Liste (Rüstliste). „ein“/„aus“ als Wort neben einem Kästchen gibt es nicht. Wächter: `tests/unit/schalterRegel.test.ts`.

## Warnung, lange Hinweise und Datumsfelder · Durchsicht 15.11.2026 (U5, U9, U10)

**Warn- und Fehlertext nie ohne Zeichen (U5).** Jeder Text in Warn- oder Fehlerfarbe trägt das Dreieck davor — als Regel an einer Stelle in `src/index.css` (`:is(.text-warning, .text-danger)` samt den eigenen Meldungsklassen), nicht an jeder Fundstelle. Wer ein eigenes Zeichen mitbringt (`svg` im Element), behält seins. Ausgenommen sind Knöpfe und Verweise, Abzüge in Summentabellen (ein Betrag mit Minus) und das Sternchen der Pflichtfelder. Wächter: `tests/unit/warnzeichen.test.ts`. Mit Petrol als Akzent steht die Fehlerfarbe `#B42318` / `#F07A6E` deutlich abgesetzt; der Vorschlag einer eigenen Gefahrfarbe (E4) ist damit erledigt und von der Musterseite entfernt (E95).

**Lange Warntexte: ein Satz plus „Anzeigen“ (U9).** Auf einer Seite steht von einer Warnung der eine Satz, der sagt, was los ist; was ihn erklärt oder aufzählt, steht in `Hinweiszeile.einzelheiten` und kommt auf „Anzeigen“. In einem Fenster und an einer Warnung mit Knopf bleibt der Text offen — dort ist er die Grundlage der Entscheidung, wie in einer Rückfrage. Wo die Zahlen der Warnung die Auskunft selbst sind, sagt `offenWeil`, warum. Wächter: `tests/unit/warntextKurz.test.ts` (über 160 Zeichen gilt als lang).

**Datums- und Zeitfelder (U10, E5).** Das Rad des Geräts bleibt. Wo das Gerät das Feld nicht deutsch zeichnet („11/15/2026“, „07:00 AM“), steht darunter der Wert deutsch: TT.MM.JJJJ, HH:MM, in Plex Mono und leise (`InputField`, `zeitfeldDeutsch`). Gefragt wird nach dem Format der Gerätesprache, nicht nach ihrem Kürzel: ein britisches Gerät zeichnet die Uhrzeit wie wir, das Datum nicht — dort steht nur unter dem Datum eine Zeile. Jedes Datums- und Zeitfeld läuft über `InputField` (Wächter in `tests/unit/zeitfeldDeutsch.test.ts`).

## Listen in fester Ordnung · Durchsicht 15.11.2026 (U11–U13)

In der Baustellenliste stehen die Zustände untereinander links und das Budget immer rechts — nicht mal neben-, mal untereinander (U11, `.baustellen-gruppe`). Nur dort: Lager und Rechnungen tragen in ihren gestapelten Zeilen eine Maßlinie, die neben einem Zustand keinen Platz hat. In der Zeiterfassung am Schreibtisch ist die Liste breiter als das Formular (U12). Die Mitarbeiterübersicht zeigt im Vergleich am Handy je Person eine kompakte Zeile mit Name, Stand und Gesamtsaldo; Saldo Monat, Gebucht und Soll stehen im Fenster der Person, wie am Schreibtisch. „Alle Tage vergleichen“ und die Woche behalten Streifen und Tagesfelder — die sind dort der Inhalt (U13).

## Einsatzplanung · E88 bleibt fachlich maßgeblich

Woche/Monat/Tag, Personen-/Baustellensicht, freie Kapazitäten, Termine, Materialzustände, Abwesenheiten und „Noch einzuplanen“ bleiben erhalten. Desktop zeigt die komplette Woche und die Ablage „Noch einzuplanen“: so hoch wie das Raster, die Liste rollt in sich, zwei Zeilen je Baustelle, ab neun Baustellen mit Suche, einklappbar zu einer schmalen Leiste (je Person gemerkt). Wer beim Ziehen an den Rand des Rasters oder des Fensters fährt, rollt mit (E96). Tablet zeigt ausreichend breite Tage und hält die restliche Woche horizontal erreichbar. Mobil zeigt die siebentägige Auswahl und eine Tagesliste statt eines verkleinerten Wochenrasters.

Normale Einsätze sind helle Arbeitsblätter mit einer 2 px starken Kontur im hellen Petrol der Auswahlkontur (`--auswahl-kontur`) rundum, beim Darüberfahren voll Petrol (seit E96; davor graue Linie mit 3 px Petrol links). Termine behalten die feine graue Linie und sind so vom Einsatz zu unterscheiden. Der heutige Tag erhält einen dunklen Tageskopf und eine leicht getönte Spalte. Nur der ausgewählte Einsatz wird ganz in Petrol; Auswahl verändert nicht den normalen Kartenradius.

Verschieben per Ziehen, Kopieren mit Alt, langes Drücken auf Touch-Tablets und die mobile Umplanung über die Einsatzaktionen bleiben erhalten. Am ausgewählten Einsatz erscheinen Bearbeiten, Verschieben, auf den nächsten Werktag kopieren und Entfernen; Rückgängig bleibt nach Verschieben oder Kopieren verfügbar. Entfernen bleibt dort bestätigungspflichtig, wo kein sicheres Rückgängig existiert. Konflikt- und Rechteprüfungen werden visuell nicht abgeschwächt. Ladefehler bei Abwesenheiten dürfen niemals wie freie Kapazität aussehen.

## Material · E89-kompakte Bedienzustände

Der Ein-Tipp-Kreis und die nach dem Tipp an derselben Stelle erscheinende Mengensteuerung verwenden dieselbe kompakte Zeilenhöhe; dabei entsteht kein zusätzlicher Kartenrahmen. Minus bei eins entfernt den Artikel, direkte Mengeneingabe bleibt möglich, und „insgesamt …“ erscheint nur bei derselben Position für eine weitere Baustelle. Ein zweiter Tipp erhöht die Menge statt eine Doppelzeile zu erzeugen; ungültige Mengen verändern die Liste nicht.

„Zuletzt angefordert“, „Für diese Baustelle abgeholt“, „Stand zuerst“ und das Anforderungsfenster bleiben als klare Arbeitsbereiche darstellbar. Vorschläge füllen nichts automatisch vor. Beim Abschluss bleiben Stand, „Abgeholt“, Herkunft „Lager“ beziehungsweise „beim Händler mitgenommen“ und die fachlichen Ausschlüsse unverändert. Die Herkunftsauswahl ist eine kompakte Auswahl mit warmer Auswahlfläche, feiner Kontur und Häkchen, kein großer dunkler Button. Auch unter 390 px bleiben Menge und Schritte erreichbar.

## Mobile Kernabläufe · E90

Der mobile Arbeitstag zeigt Status und Verwerfen in der Kopfzeile, Uhr und Pause/Weiter/Stopp in einer Zeile sowie die Baustelle mit Name und Nummer darunter. Auf Start bleibt „Zeit von Hand eintragen“ als ruhiger sekundärer Weg in der Karte erhalten. Der erste Einsatz verwendet normale statt displayartiger Namenstypografie; „Anfordern“, „Nachricht“ und „Schein“ bilden eine dreigeteilte Aktionsleiste mit klaren Trennlinien. Ab Tablet bleiben die bisherigen großzügigeren Arbeitsbereiche erhalten.

Start, Pause, Weiter, Stopp, Wechsel und Verwerfen aktualisieren den sichtbaren Zustand sofort mit derselben Zeitlogik wie die Offline-Vormerkung. Der Server bestätigt im Hintergrund. Bis zur Antwort wird kein zweiter Timerschritt angenommen; ein Doppeltipp darf eine Pause nicht sofort wieder aufheben. Bei Ablehnung kehrt der bestätigte Stand zurück und der Grund erscheint in der Karte. Die Stopp-Prüfung öffnet erst nach bestätigtem Stopp. „Vorgemerkt“ wird höchstens einmal je Funkloch gemeldet; ein neuer Anstoß während eines scheiternden Ausgangsfach-Laufs muss einen Nachlauf auslösen.

Auf dem Handy öffnen „Neuer Eintrag“, ein Tipp auf eine eigene Buchung, „Nachtragen“ und „Zeit nachtragen“ dasselbe vorbelegte Zeitformular als Bottom Sheet. Die Liste, Saldo und Arbeitstag bleiben der Kontext dahinter. Ist die Erfassung deaktiviert, erklärt ein Hinweis den Zustand, statt einen wirkungslosen Button anzubieten. Bestehende Korrektur- und Berechtigungslogik bleibt davon getrennt und unverändert.

Im mobilen Handwerksschein erscheint eine bereits bestimmte Baustelle nur einmal mit Name, Nummer, Abrechnung, Adresse und „ändern“. Erst dieser Schritt zeigt Einsätze und Auswahl; ohne Vorbelegung ist die Auswahl sofort sichtbar. „Zurück“ und „Entwurf“ bleiben leise links in der Abschlussleiste. Das leere Signaturfeld trägt die Erklärung „Mit dem Finger unterschreiben“; Löschen, Offline-Entwurf und Abschluss bleiben eindeutig erreichbar.

## Globale Suche und Kurzbezeichnungen · E91

Die globale Suche umfasst rollen- und modulabhängig Seiten, Kunden, Baustellen, Rechnungen, Angebote, Personen und Artikel. Rechnungen und Angebote werden einschließlich Stornonummer nach Nummer gefunden, Personen nach Name oder E-Mail und Artikel nach Name, Artikel-, Großhändlernummer oder EAN. Rechnungen und Angebote suchen bewusst nicht über den Kundennamen; dafür bleibt die Gruppe „Kunden“ maßgeblich.

Treffer besitzen eine ruhige zweizeilige Hierarchie. Baustellen zeigen Kunde und Kurzbezeichnung, Rechnungen das Datum, Angebote den Stand. Rechnungstreffer öffnen je nach Rolle das Belegfenster oder die gefilterte Leseliste der Projektleitung; Angebote führen in die jeweilige Akte, Personen in ihre Benutzerakte und Artikel in den Lagerkatalog oder mit vorbefüllter Suche zu „Material anfordern“. `?suche=` muss auch bei einem erneuten Suchsprung auf der bereits offenen Zielseite übernommen werden.

Baustellen-Kurzbezeichnungen erscheinen zusätzlich in Auswahllisten, in der Zeiterfassung mit Nummer vorn, als zweite Zeile in der Planungsablage und in der Terminauswahl der Kundenakte. Native Auswahlfelder erhalten bei abgeschnittenem Text eine vollständige Zeile darunter. Handwerksscheine erhalten keine erfundene eigene Nummer; sie werden über Baustelle und Tag gefunden. RLS, Rollen und Modulrechte bleiben für jede Suchgruppe verbindlich.

## Responsive Ordnung

Desktop: schmale dunkle Navigation, kompakte Kennzahlenleiste und höchstens zwei dominante Arbeitszonen. Tablet: schmale Navigation, dieselbe Informationshierarchie und keine gequetschten Desktopspalten. Mobil: eine Aufgabe pro Blickfeld, mindestens 44–48 px für zentrale Touchziele, eingelassene Kopf- und Navigationsinseln sowie kompakte Arbeitszeilen statt verschachtelter Karten.

Die bestehenden Produktionsgrenzen bleiben Ausgangspunkt: Handy bis 759 px, Tablet 760–1.199 px, Desktop ab 1.200 px. Übergänge, Zoom, Querformat, lange Inhalte und reale Geräte sind zusätzlich zu prüfen.

## Kernseiten, Arbeitstag und Nachrichten

Start: Der laufende Arbeitstag steht direkt unter den Kennzahlen und verwendet denselben Zustand wie die Zeiterfassung. Der aktuelle Einsatz bleibt kompakt und führt mobil über eine klare Aktionsleiste zu Material, Nachricht und Schein; nächste Schritte sind eine direkte Arbeitsliste. Zeit: Laufende Zeit, Erfassung und Prüfung sind klar getrennt; mobile Erfassung und Nachträge verwenden dasselbe Bottom Sheet. Rechnungen: Beträge, Fälligkeit und die nächste Aktion stehen direkt am Beleg.

Der Start-Stopp-Arbeitstag ist auf Start und Zeiterfassung in Desktop, Tablet und Mobil sichtbar. Bereit, laufend und pausiert sind eigenständige Zustände. Der laufende Zustand zeigt Arbeitszeit, Baustelle, Baustellenwechsel, Pause und Stopp; der pausierte Zustand zeigt Pausendauer, bisherige Arbeit, Weiter und Stopp. „Stoppen und prüfen“ führt zur Kontrolle je Baustelle und bucht nicht automatisch.

Auf anderen Seiten hält eine kompakte Timer-Leiste Uhr, Baustelle beziehungsweise Pause, Pause/Weiter und Stopp erreichbar. Mobil liegt sie über der unteren Navigation; im Nachrichten-Thread entfällt sie zugunsten des Eingabefelds. Start und Zeiterfassung verwenden die Arbeitstagkarte statt einer doppelten Leiste. Offline-Vormerkung, Gerätekonflikt und lange Laufzeit erhalten eigene, verständliche Zustände.

Nachrichtenliste, Thread und Verfassen verwenden dieselbe ruhige, vom Claude-Chat inspirierte Hierarchie. Eingehende Nachrichten stehen blasenfrei im Lesefluss: kleines Absenderzeichen, Name und Zeit darüber, großzügig gesetzter Text darunter. Nur eigene Nachrichten erhalten eine kompakte warme Blase; ihre Breite folgt dem Text bis zu einer angemessenen Maximalbreite. Dadurch entsteht ein ruhiger redaktioneller Thread statt einer Folge gleichförmiger Karten.

Der Composer ist eine einzelne weich gerundete, konturierte Eingabefläche mit Anhang links, mehrzeiligem Text und eigenem runden Sendeziel rechts. Das Sendeziel bleibt mindestens 44 px groß. Reaktionen und das Nachrichtenmenü mit Melden erscheinen kontextuell am Beitrag und bleiben auch per Tastatur erreichbar. Ungelesen-, Anhangs-, Offline-, Fehler- und Leerzustände bleiben vollständig. Im Dark Mode verwenden eigene Nachrichten `#43362F`; eingehende Nachrichten bleiben ebenfalls blasenfrei.

## Motion und Feedback

Bewegung erklärt Herkunft, Ziel und Ergebnis; sie ist keine eigene Darstellungsebene. Eine Erfolgsanimation behauptet niemals einen noch nicht bestätigten Servererfolg. Der Arbeitstag darf seinen lokalen Zustand gemäß E90 sofort zeigen, während die Serverbestätigung im Hintergrund erfolgt.

- Navigation und wandernder Senklot: etwa 160 ms; Tabs: 120–160 ms.
- Drag-and-drop: Zielmarkierung etwa 120 ms; Ablegen und Einrasten etwa 180 ms.
- Seitenfenster und Bottom Sheets: etwa 220 ms, aus ihrer räumlichen Richtung.
- Arbeitstag: etwa 160–180 ms für Zustand und Label; kein permanenter Timer-Puls.
- Speichern: etwa 180 ms nach bestätigtem Schreiben; Toast etwa 240 ms, mit Rückgängig nur dort, wo fachlich erlaubt.
- Offline, Laden und Fehler: 0–150 ms; Skeleton statt Scheinleere, persistente Offline-Information und ruhige Fehleraktion.

Reduced Motion entfernt räumliche Bewegung. Der Zustand wechselt sofort oder mit höchstens 80 ms Opazität; Information und Bedienbarkeit bleiben vollständig. Kein Bounce, Parallax, Dauerloop oder blockierender Erfolgszwischenschritt. Die Systemseite „Motion & Feedback“ dokumentiert Einsatzorte und Grenzen.

## Unteransichten und Systemseiten

Die Mappe enthält 42 Seiten: 65 Arbeits-, Zustands- und Themeansichten, eine Funktionsübersicht sowie vier zusätzliche Systemseiten für Bauplan und Illustration, Motion und Feedback, Konsistenz und Bedienung sowie Dark Mode. Neben den zwölf responsiven Kernseiten sind Timer und Stopp-Prüfung, persönliche und Team-Planung, Monat und Tag, Material und Abholung, Lager, Handwerksscheine und Unterschrift, Baustellenakten, Auftragseingang, Angebote, Kunden und Liegenschaften, Wartungen, Rechnungsdetail und Zahlung, Nachkalkulation, Mitarbeiterübersicht, Urlaub, Benutzerverwaltung, Nachrichten, Einstellungen, globale Suche, Mehr-Navigation sowie leere, fehlerhafte und offline Zustände dargestellt.

Texttabs, Arbeitszeilen, Seitenfenster und Bottom Sheets bilden das gemeinsame Ordnungssystem. Modulunterschiede bleiben erhalten: Anfordern, Anforderungen abarbeiten und Lager führen sind getrennte Aufgaben; die persönliche Team-Woche bleibt eine Leseansicht; die mobile Umplanung erfolgt über den Einsatz statt über ein verkleinertes Wochenraster. Öffentliche Seiten, Authentifizierung, Plattformverwaltung, Einstellungen und seltene Sonderzustände gehören ebenfalls vollständig zur Designlinie.

## Abdeckung und technische Prüfgrenzen

Die Screens weisen die grundsätzliche visuelle und strukturelle Abbildbarkeit der berücksichtigten Funktionen nach. Sie sind keine technische Kompatibilitätsgarantie und kein Produktivcode. Datenbankmigrationen, RLS, RPC, Konflikt- und Offline-Synchronisation, Rechte, Exporte, externe Integrationen sowie reale iOS-/Android- und WebKit-Tests bleiben eigenständige Abnahmeschritte. E88-, E89-, E90- und E91-Funktionen sind im Entwurf berücksichtigt; ihre fachlichen Prüfungen und serverseitigen Regeln haben Vorrang vor der Darstellung. Der Konzeptabgleich wurde mit `main`-Commit `99b8787476468b488920bd8a82fb7153008e05d8` vom 13.11.2026 durchgeführt; vor einer späteren Umsetzung ist der dann aktuelle `main` erneut zu prüfen.
