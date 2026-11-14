# Senklot · Warmes Papier und klare Arbeit · V10

## Stil und Leitidee

Die zehnte Entwurfsstufe gibt Senklot eine warme, redaktionelle und ruhige Arbeitsatmosphäre, inspiriert vom Look und Vibe von Anthropic/Claude, ohne fremde Markenassets zu kopieren. Warmes Papier, dunkle warme Tintenfarben, Terrakotta als Arbeitsakzent und serifige Überschriften ersetzen die bisherige kühle Petrolwelt. Der Senklot, das Bauplanraster und die sachlichen Modulicons bewahren die eigene Produktherkunft.

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

| Rolle | Zielwert | Verwendung |
|---|---:|---|
| Primärakzent / Terrakotta | `#A85439` | Primäraktionen, aktive Auswahl, Senklotzeichen und wenige Arbeitsmarkierungen |
| Haupttext | `#25231F` | Titel und primäre Information |
| Dunkle Arbeitsfläche | `#322E29` | laufender Arbeitstag, dunkle Schwerpunktkarten |
| Navigation | `#292722` | Desktop-/Tablet-Navigation |
| Aktive Navigation | `#473B32` | aktiver Menüpunkt |
| Seitenhintergrund / Papier | `#F4F0E8` | Mappe und Arbeitsgrund |
| Karten / Arbeitsblätter | `#FFFDF8` | fachliche Arbeitsflächen |
| App- und Geräteflächen | `#FAF7F1` | eingelassene mobile und Systemflächen |
| Gedämpfter Text | `#6F685F` | Metadaten und sekundäre Erklärungen |
| Inaktive mobile Icons | `#7F766B` | passive Docksteuerung |
| Auswahl | `#F3E4D8` | ausgewählte Zeilen, Optionen und aktive mobile Navigation |
| Auswahlkontur | `#D5B39E` | feine Auswahl, etwa 0,75 px auf der Referenzebene |
| Fokus | `#B97B5E` | sichtbarer, ruhiger Fokus |
| App-Konturen | `#E2D8CB` | Arbeitsblätter und Felder |
| Kopf-/Dockkonturen | `#E4DACE` | mobile Kopf- und Navigationsinseln |
| Funktionale Linien | `#DED4C7` | sinnvolle Trennung |
| Pausierter Arbeitstag | `#EEE6DB` | warmer, neutraler Pausenzustand |
| Warnung | `#8F5D20` | Statustext und sparsames Symbol |
| Fehler | `#A5483B` | Statustext und sparsames Symbol |
| Text auf dunklen Flächen | `#FFF8EE` | Arbeitstag und dunkle Primärflächen |
| Eigene Chatblasen | `#E8DACC` | eigene Nachrichten mit dunklem Text |

Terrakotta auf hellem Grund und helle Schrift auf Terrakotta erreichen auf der Referenzebene ausreichenden Textkontrast; reale Kombinationen, Zustände und Themes sind dennoch erneut zu messen. Farbe ist niemals der einzige Informationsträger.

Die Trennung zwischen Produktfarbe und Mandantenbranding bleibt erhalten. Eine betriebliche Hausfarbe darf Navigation, Statussemantik oder Fehlerfarben nicht verfälschen. Druck- und PDF-Ausgaben folgen weiterhin ihren bestehenden Fachregeln.

### Dark Mode · eigene warme Tokenwelt

Der Dark Mode ist eine vollständige zweite Oberflächenwelt, keine mechanische Inversion. Er wird unter „Einstellungen → Mein Konto → Darstellung und Bewegung“ mit „Hell“, „Dunkel“ und „System“ gewählt; „System“ folgt der Geräteeinstellung. Die Auswahl gilt auf allen Seiten, Tabs, Akten, Dialogen, Sheets und Zuständen.

| Rolle | Dunkler Zielwert | Verwendung |
|---|---:|---|
| Seitengrund | `#211F1C` | warmer Arbeitsgrund |
| Arbeitsfläche | `#25221F` | Thread, Listen und große Arbeitsbereiche |
| Karten / Eingaben | `#302C27` | Composer, Anhänge und erhöhte Felder |
| Navigation | `#1F1D1A` | Desktop-/Tablet-Navigation |
| Auswahl | `#3B312B` | aktive Zeile oder Navigation |
| Haupttext | `#F3EEE6` | primäre Information |
| Gedämpfter Text | `#B7AEA3` | Metadaten und sekundäre Erklärung |
| Linien / Konturen | `#4B443C` | funktionale Trennung |
| Akzent auf Dunkel | `#D08A68` | Textakzent, Fokus und aktive Symbole |
| Primäraktion | `#A85439` mit `#FFF8EE` | unverändert kontraststarke Aktionsfläche |
| Eigene Chatnachricht | `#43362F` mit `#F3EEE6` | eigene Beiträge, feine Kontur `#654C3E` |
| Raster neben / Haupt | `#302C27` / `#3A342E` | sehr leise im Arbeitsgrund |

Reale Kontraste sind für jede Komponente und jeden Zustand zu messen. Helle Schrift auf Terrakotta und aufgehellter Terrakotta-Text auf dunklem Grund haben unterschiedliche Rollen und werden nicht vertauscht. Dunkle Flächen erhalten keine schweren schwarzen Schatten; Konturen und begrenzte Tonabstufungen tragen die Hierarchie. Systemwechsel dürfen keinen ungespeicherten Formular-, Timer-, Chat- oder Offline-Zustand zurücksetzen.

## Flächen, Auswahl und Tiefe

Auswahl und passive Information sind nicht dieselbe helle Fläche. Ausgewählte Arbeitszeilen erhalten eine warme Tonfläche und feine Kontur; neutrale Hinweise bleiben konturlos oder nur sachlich abgesetzt. Deaktivierte Elemente bleiben lesbar und als nicht bedienbar erkennbar.

Warnung und Fehler färben keine vollständigen Listenzeilen, Arbeitskarten, Hinweisbalken oder Fehlerpaneele. Eindeutiger Statustext, sparsame Symbole und die nächste Aktion tragen die Bedeutung. Bestehende farbige Vertikalkanten werden nicht wieder als Statussystem eingeführt.

Der laufende Arbeitstag bleibt bewusst dunkel und ruhig. Terrakotta wird dort nur als kleiner Status- oder Arbeitsakzent eingesetzt, nicht als große orangefarbene Karte. Bereit und pausiert bleiben helle, klar unterscheidbare Zustände.

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

Technische Illustrationen erscheinen nur in echten Leerzuständen oder bei erster Orientierung. Pro Ansicht höchstens ein monochromes Motiv mit ruhiger Terrakotta-/Ton-Strichführung und etwa 1,25 px Strichstärke. Keine Cartoons, Stockbilder oder wiederkehrenden Dekorationen.

Einsatzplanung, dichte Listen, Formulare, Finanzansichten, Fehler-, Offline- und Konfliktzustände bleiben ohne Illustration. Ein Ladezustand ist kein Leerzustand; ein Ladefehler ist kein Leerzustand; eine Filterleere benötigt eine andere Erklärung und Aktion als ein tatsächlich leerer Datenbestand.

## Markenzeichen und Navigation

Der Senklot bleibt als vertikale Lotlinie mit spitzem Körper und Fußlinie erhalten. Auf Desktopseiten wandert er mit dem aktiven Menüpunkt und erscheint zusätzlich dezent am unteren Navigationsrand. Tablet nutzt dieselbe Markierung in der schmalen Navigation. Mobil führt das terrakottafarbene Zeichen in einer hellen Kopfinsel; der aktive Bereich der unteren Navigation erhält eine warme, hinter Icon und Text liegende Auswahlfläche.

Die Desktopnavigation ist schmal, dunkel und ruhig. Modulicons bleiben als Navigationshilfe erhalten. Personennamen in der Einsatzplanung erscheinen ohne Kürzel-Kreise oder andere Begleitsymbole. Die mobile „Mehr“-Navigation verwendet zwei kompakte, gruppierte Listen für „Planung & Arbeit“ sowie „Vertrieb & Verwaltung“. Rollen- und Modulabhängigkeit bleibt sichtbar und vollständig bedienbar.

## Steuerungen und Zustände

Woche/Monat/Tag sowie Personen/Baustellen verwenden kompakte Texttabs mit einer präzisen aktiven Unterlinie statt schwerer Segmentkästen. Bestehende Unterreiter-Adressen, Deep Links, Rollenfilter, Tastaturbedienung und Scroll-Into-View-Verhalten bleiben erhalten. Eine Primäraktion bleibt je Kontext sichtbar; sekundäre Aktionen sind Text- oder Linienaktionen. Filter bleiben Arbeitszeilen und werden nicht zu einer Pillenflut.

Große Arbeitstagkarten beschriften Pause, Weiter und Stopp mit kurzen Textlabels. Die kompakte mobile Arbeitstagkarte und die globale Timer-Leiste dürfen bewährte Symbole ohne sichtbare Zusatzlabels verwenden. Alle Iconbuttons benötigen verständliche `aria-label`-Texte und ausreichend große Ziele. Lade-, Speicher-, Deaktivierungs-, Fehler- und Fokuszustände bleiben sichtbar und funktional; die vorhandene Breitenreservierung von Buttons darf nicht verloren gehen.

## Einsatzplanung · E88 bleibt fachlich maßgeblich

Woche/Monat/Tag, Personen-/Baustellensicht, freie Kapazitäten, Termine, Materialzustände, Abwesenheiten und „Noch einzuplanen“ bleiben erhalten. Desktop zeigt die komplette Woche und die Ablage. Tablet zeigt ausreichend breite Tage und hält die restliche Woche horizontal erreichbar. Mobil zeigt die siebentägige Auswahl und eine Tagesliste statt eines verkleinerten Wochenrasters.

Normale Einsätze bleiben helle Arbeitsblätter mit feiner Kontur und sachlicher Terrakotta-Markierung. Der heutige Tag erhält einen dunklen Tageskopf und eine vertiefte warme Spalte. Nur der ausgewählte Einsatz wird vollflächig terrakotta; Auswahl verändert nicht den normalen Kartenradius.

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
