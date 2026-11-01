# Entscheidungen beim Umbau auf „Lot“

Wo Protokoll, Entwurf und Code nicht zusammenpassen, steht hier, was gilt und
warum. Grundlage: Auftrag vom 07.10.2026 („die neue Linie muss nach dem Umbau
vollständig auf allen Reitern etabliert sein; starte direkt“).

**E1 — Kein Schalter je Betrieb (V4, Abschnitt 9.1).** Der Auftrag verlangt
die Linie überall. Zwei Oberflächen nebeneinander hiessen jede Ansicht und
jede Prüfung doppelt — gegen den Grundsatz „nicht überkomplizieren“.
Rückbau geht über die Stände je Schritt (je ein PR, je ein Commit auf `main`).

**E2 — „Pro Element genau eine Klasse“ (0.2).** Gilt für jeden Baustein der
Linie (`src/styles/lot.css`, semantische Klassen, keine `clamp()`/`calc()`,
Media-Queries nur auf die Breite, keine Positionsselektoren). Die Seiten
setzen sich aus den Bausteinen zusammen; Tailwind bleibt für das Gerüst
einzelner Seiten, liest aber dieselben Grundwerte. Eine Umschreibung aller
rund 2.100 Klassenangaben ohne sichtbaren Unterschied wäre Umbau um seiner
selbst willen.

**E3 — „Eine Hilfe pro Seite“ statt verstreuter i-Knöpfe (Regel 11).** Die
Texte der i-Knöpfe gehen nicht verloren: sie stehen gesammelt unter „Hilfe
zu dieser Seite“ im Seitenkopf. CLAUDE.md ist entsprechend nachgezogen.

**E4 — Kein Menüpunkt „Leitfaden“.** Abschnitt 5 verlangt je Rolle exakt die
bisherigen Menüpunkte. Der Leitfaden des Entwurfs ist die Gestaltungsvorgabe
selbst; er liegt unter `docs/design/`, nicht in der App.

**E5 — Freigaben des Betreibers und Pilotwochen (8.12, 10).** Kann der Umbau
nicht selbst erbringen. Die Abnahmeblätter trugen „Freigabe: offen“.
**Freigabe erteilt am 11.10.2026** für alle Schritte; die Pilotwochen stehen
weiter aus.

**E6 — Bildschirmfotos.** Je Seite mit der Rolle, die sie am vollständigsten
sieht, in drei Breiten, als verkleinerte JPEG — alle Rollen mal alle Seiten
mal drei Breiten wären über tausend Bilder im Repository.

**Vorgabe des Auftraggebers (07.10.2026):** Der Entwurf muss nicht 1:1
umgesetzt werden; er dient zur Orientierung. Massgeblich sind die Linie
(Grundwerte, Bausteine, Regeln) und das Protokoll — angepasst an das, was die
App tatsächlich kann, ohne dass eine Funktion verloren geht.

**E7 — Was aus „Fassung 3“ bleibt.** Die Klassennamen der bestehenden
Bausteine (`zeile`, `karte-kopf`, `stand-*`, `kennzahl` …) bleiben und tragen
jetzt die Lot-Werte; so erreicht die Linie jede Seite, die sie schon benutzt.
Positionsselektoren sind daraus entfernt, wo es ohne Nebenwirkung ging (die
Kennzahlen, die Startseite); `:first-child`/`:last-child` an Zeilen, Segmenten
und Tabellenzeilen bleiben, weil jeder Ersatz Trennlinien doppelt oder gar
nicht zöge. Neue Bausteine stehen in `src/styles/lot.css` und kommen ohne sie
aus.

**E8 — Kein weisses Kopfband.** Der Entwurf setzt den Seitenkopf als weisses
Band über die ganze Breite. In der App stehen auf mehreren Seiten Reiter
(Einstellungen, Planung, Mein Einsatzplan) oder Hinweise über dem Kopf; ein
Band mit negativen Rändern läge dann über ihnen. Der Seitenkopf trägt deshalb
die Schrift und die Ordnung des Entwurfs (Ortszeile, Titel, ⋯, Hauptaktion,
„Hilfe zu dieser Seite“), aber keinen eigenen Grund.

**E9 — Breiten.** Tailwinds `md` und `lg` sind auf die Grenzen der Linie
gesetzt (760 und 1.200 px, `src/lib/breiten.ts`). Zwischen 1.024 und 1.199 px
gilt damit die Tablet-Anordnung, wie im Entwurf.

**E10 — Hausfarben im dunklen Modus.** Der dunkle Satz setzt die vier
Mandantenfarben mit `!important`: `applyBranding` schreibt sie als
Inline-Stil, und eine für Weiss gewählte Hausfarbe wäre auf dunklem Grund
unlesbar. Im dunklen Modus gelten die Töne der Linie.

**E11 — Belegfarben.** Belege und Exporte bleiben prüfsummengleich (0.1). Ihre
Farben in `src/lib/belegLayout.ts` waren bis zum Umbau dieselben wie die der
Oberfläche; sie bleiben beim Stand vor Lot, die Prüfung vergleicht sie jetzt
mit diesem festen Stand.

**E12 — Arbeitsstand als Standard und die Klickwege.** Regel 7.1 verlangt den
Arbeitsstand als Standardansicht (etwa „Offen“ bei den Scheinen). Was nur in
„Alle“ steht — ein längst verrechneter Schein, den jemand stornieren will —,
ist damit einen Wechsel der Ansicht weiter. Gezählt wird der Weg innerhalb
der Ansicht, in der das Element steht; der Wechsel selbst ist die Vorgabe des
Protokolls und wird im Abnahmeblatt des Pakets genannt. Die Suche findet
weiter über alle Einträge, ohne Wechsel.

**E13 — Escape bei gestapelten Fenstern.** Ein Bestätigungsdialog in einem
Seitenfenster schloss mit Escape beide. Escape schliesst jetzt nur, was
obenauf liegt (`istOben` in `fokusFalle.ts`).

**E14 — Kein Außenabstand am Schleier (Testbericht Runde 5, G1).** Steht ein
Schleier in einem `space-y-*`-Behälter, gibt Tailwind ihm über
`.space-y-6 > :not([hidden]) ~ :not([hidden])` einen Abstand oben. Diese Regel
ist spezifischer als eine einzelne Klasse; Schleier und Fenster begannen
dadurch 12 bis 24 px unter dem Rand, und die Seite darüber blieb antippbar.
`.schleier` und `.schleier-dialog` tragen deshalb `margin: 0 !important` —
neben E10 die zweite Ausnahme. Ein Portal hätte dasselbe gelöst, aber mehr
verändert: Nachfahrenregeln der Karten und die Lage von Rückfragen in einem
Fenster.

**E15 — Team-Woche mit den Bausteinen der Planung (10.10.2026).** Auftrag 4.8
hielt die Team-Woche beim älteren Raster fest, damit der Umbau der Planung sie
nicht verändert. Die Durchsicht vom 10.10. fand darin Fehler, die das ältere
Raster selbst hatte (Einsätze in der Spalte von heute unsichtbar, Kästen in
der Karte am Handy, Lehrling als „Helfer“). Statt zwei Raster zu pflegen,
zeichnet die Team-Woche jetzt mit `PersonenWoche` und `HandyWoche` im Modus
`lesen`: dieselben Einträge ohne Knopf. Was 4.8 verlangte, gilt weiter —
ohne Knöpfe, ohne „frei“, ohne Monat, „abwesend“ ohne Grund, nur die Termine
des Zeilenschutzes; geprüft in `TeamWoche.test.tsx`.

**E16 — Gesamtkonzept 10, Startfreigabe 15.10.2026.** Der Auftraggeber hat nach
Prüfung des Gesamtkonzepts die Umsetzung ausdrücklich gestartet. Die gemeinsame
Linie trägt eine weiße Grundfläche, größere Seitentitel, Trennlinien statt
Kartenrahmen und Poppins 500 ausschließlich für Zahlen; Text und Titel bleiben
400/600. Das präzisiert die frühere Vorgabe von zwei Schriftstärken. Die
Mitarbeiterübersicht beginnt beim Personenvergleich, der Tagesstreifen bleibt
zuschaltbar. Bestehende Fachlogik, Berechtigungen und mobile Hauptaktionen
bleiben verbindlich. [Umsetzung und Zuordnung](lot-v2-10/umsetzung.md).

**E17 — Lot v2 bestätigt (20.10.2026).** Der Auftraggeber hat die Designlinie
Lot v2, wie seit E16 umgesetzt, bestätigt. Sie gilt damit als festgelegte
Linie, nicht mehr als Arbeitsstand; Handbuch und Stand führen sie so.


**E18 — Drei Akten mit klarer Leseansicht (20.10.2026).** Nach Freigabe von
Aktenentwurf 03 werden Baustelle, Kunde und Benutzer in derselben bestätigten
Lot-Linie gegliedert: horizontale Bereiche statt der zusätzlichen Sprungleiste,
Angaben mit Beschriftung über dem Wert statt komprimierter Kurzzeilen, ein
explizites Bearbeitungsfenster mit den bisherigen vollständigen Formularen.
Das ersetzt E7s Aktenaufbau für diese drei Seiten. Die große Kennzahlenleiste
der Baustelle entfällt auf Wunsch des Auftraggebers; Stunden und Budget
stehen kompakt beim Auftrag. Bestehende Schreibwege, Rollen, Module,
Berechnungen und Exporte bleiben erhalten. [Zuordnung und Prüfung](lot-akten-03/umsetzung.md).


**E19 — Akte mit Kontext nach Variante A (20.10.2026).** Der Auftraggeber hat
nach Ablehnung der ersten Umsetzung drei neue Anordnungen verglichen und A
ausdrücklich zur Umsetzung freigegeben („ja finde ich gut. Setze das um“).
Ein kompakter Aktenkopf trennt Rückweg, Identität und Aktionen. Die Hauptspalte
trägt den Arbeitsinhalt; eine durchgehende Kontextspalte sammelt Kontakt, Ort
und Zuständigkeit und bleibt bei Bereichswechseln montiert. Am Handy folgen
die Kontextangaben dem Hauptinhalt, Anruf und E-Mail sind oben direkt erreichbar.
Baustellen, Belege, Scheine und Pläne erhalten getrennte vollständige Bereiche;
Vorschauen lesen dieselben bereits geladenen Bestände. Die Baustelle behält
Stammdaten und Auftrag direkt in der Übersicht und im vorhandenen Bearbeiten,
statt dafür einen weitgehend doppelten Reiter anzulegen. Termine und Wartungen
beim Kunden teilen ihren Bereich, damit beide Module vollständig bedienbar
bleiben. Die kompakte Budgetlinie verwendet unverändert den bestehenden
Prozentwert und dessen Warnstufen. Dies präzisiert E18s Seitenaufbau; seine
Speicher-, Rechte- und Entwurfsregeln bleiben bestehen. [Zuordnung](lot-akten-04/umsetzung.md).


**E20 — Gesamtentwurf und Mitarbeiterübersicht (21.10.2026).** Nach Freigabe
aller übrigen Entwürfe und der überarbeiteten Mitarbeiterübersicht lautet der
Startauftrag „top wenn alle screens nun stehen kannst du mit der Umsetzung
beginnen“. Bestehende passende Arbeitsstrukturen bleiben erhalten; gemeinsame
Formularbeschriftungen und Auswahlbausteine führen die Linie fort.
Angebote erhalten einen begrenzten ruhigen Kontext, Rechnungen benannte
Leseabschnitte. Mitarbeiter: kompakte Steuerung statt großer Kennzahlen,
Monats-/Gesamtsaldo mobil gleichwertig, Summe aller Personen unter der Liste.
Fehlende Tage sind ausschließlich am Handy einklappbar; Anzahl, gezielte
Tagesauswahl und Rückweg aus der Zeiterfassung bleiben verlässlich.
Die bestehenden Berechnungen, Rollen und mobile Navigation bleiben.
[Umfang, Zuordnung und Abnahme](lot-gesamt-2026-10-21.md).

**E21 — Globale Plattformverwaltung (22.10.2026).** Nach Prüfung der 25
Entwurfsansichten lautet der Startauftrag „finde ich gut, setze es so um“.
Die Plattform übernimmt die Lot-Linie mit lokalen Bereichen, ruhigem Kontext
und dem bestehenden Verwaltungsfenster. Bereichswechsel erhalten Formulare
und einmalige Ergebnisse; jede Bereichsseite sammelt ihre eigene Hilfe.
Betriebsinhalte, Berechtigungen, Zwei-Faktor-Pflicht, Wiederherstellung und
Löschbedingungen bleiben erhalten. Die mobile Betriebsnavigation bleibt;
die Plattform selbst erhält eine offene zweizeilige Bereichswahl.
[Umfang, Funktionserhalt und Abnahme](lot-plattform-2026-10-22.md).

**E22 — Stand-Zeile statt großer Kennzahlen auf der Startseite (25.10.2026).**
Der Auftraggeber: „was mich immer stört ist diese anzeige auf der startseite
ganz oben mit den vier großen zahlen … Das sieht auf keiner seite und keiner
ansicht schön aus“; auf den Vorschlag einer Zeile hin „ja kannst du umsetzen
wenn dennoch voll funktionsfähigkeit gegeben ist“. Die Kacheln weichen einer
Zeile zwischen zwei Linien: Beschriftung, Wert und Zusatz hintereinander,
jeder Eintrag ein Verweis auf dieselbe gefilterte Liste wie vorher; am Handy
je Eintrag eine Zeile, der Wert rechts. Gerechnet wird unverändert in
`start/aufbau.ts`. Neu ist nur `leer`: offene und überfällige Rechnungen,
unverrechnete Scheine, offene Anforderungen und knappe Artikel fallen aus
der Zeile, wenn nichts zu tun ist; Zustände (Saldo, Resturlaub, aktive
Baustellen, Auslastung, Bezahlt im Monat) stehen auch bei null. Ist alles
leer, fällt die Zeile weg. Überfälliges bleibt rot. Keine Grafik: die
Startseite ist zum Handeln da, eine Auswertung gehört zu Rechnungen oder
Nachkalkulation. Die übrigen Seiten behalten ihre Kennzahlen.
Nachtrag am selben Tag: „muss dieses 1 schein nicht verrechnet dort
aufscheinen? … das ist eher eine meldung die bei zu erledigen aufscheinen
sollte“ — auf den Vorschlag hin „ja das passt so“. „Nicht verrechnet“ fällt
aus dem Stand und steht unter „Zu erledigen“ immer, nicht erst ab vier
Wochen: je eine Sammelzeile für Scheine und für Regiestunden, ab vier Wochen
mit Achtung-Punkt. Die Seite Rechnungen („Nicht verrechnete Leistung“)
bleibt bei ihrer Vier-Wochen-Grenze.

**E23 — Die Stand-Zeile auf allen Seiten (25.10.2026).** Auf die Frage,
ob die Zeile nur auf der Startseite steht, und das Angebot, sie überall
einzusetzen: „ja setze das direkt alles um“. Die Kennzahlen-Leiste
(`MetricRow`/`Metric`) zeichnet jetzt selbst die Stand-Zeile; die
Startseite verwendet denselben Baustein, die Gestaltung steht nur noch in
`lot.css` (`.lage-*`), die Kachel-Regeln aus `index.css` sind entfernt. Das
betrifft Rechnungen, Nachkalkulation, Lager, die Angebot-Akte,
Zeiterfassung, Urlaub sowie den Kunden- und den Katalogimport. Werte,
Zusätze, Ziele, Ladeplatzhalter und Farben (rot nur Überfälliges und
Verlust, Warnfarbe für Achtung) bleiben, wie sie waren. Anders als auf der
Startseite fällt auf diesen Seiten keine Null aus: dort beschreibt die Zahl
die Liste darunter oder das Ergebnis eines Probelaufs („Mit Verlust 0“,
„Nicht verstanden 0“), und eine fehlende Zahl ließe offen, ob gezählt wurde.
Die drei Werte im Seitenfenster einer Person (Mitarbeiterübersicht) waren
nie Kacheln, sondern stehen schon klein in einer Reihe; sie bleiben.
Berichtigt dabei: am Schreibtisch stand die Zeile seit E22 untereinander
statt in einer Reihe (die Richtung des Handys wurde geerbt); jetzt steht sie
ab 1.200 px nebeneinander, wie in E22 beschrieben.

**E24 — Stand im Seitenkopf, Abstand statt Linien (25.10.2026).** Der
Auftraggeber war mit dem Stand als Zeile zwischen zwei Linien „noch immer
nicht ganz zufrieden“ und fragte nach „mehr Abständen zwischen Abschnitten
einer Seite statt zu vielen Trennlinien“; auf die Empfehlung (Stand im
Seitenkopf, dazu Luft statt Linien) hin „ja setze alles direkt um. Sei
genau, verschlimmbessere nichts“. Umgesetzt:
- **Stand im Seitenkopf.** `PageHeader` nimmt `stand` und zeigt ihn unter
  dem Untertitel als ruhige Zeile: Beschriftung grau, Wert, ein Zusatz grau
  dahinter; am Handy zwei Spalten. Startseite, Rechnungen, Lager,
  Zeiterfassung, Urlaub, Nachkalkulation und Angebot-Akte. Ziele, Farben
  und Platzhalter bleiben. Auf Lager und Urlaub steht der Stand auf jedem
  Reiter — verschwände er, spränge die Reiterleiste.
- **Der Zusatz nur für, was sich ändert.** Bleibt: Anzahl der Rechnungen,
  „seit 01.10.“, „von 4 im Katalog“, „3 von 25 genehmigt“, „seit Eintritt“,
  „65 Tage ohne Buchung — unvollständig“, „nur die jüngsten — offene
  Forderungen nicht geladen“, „die 20 jüngsten von 34“. In die Hilfe der
  Seite: was „Knapp“, „Reserviert“, „Mit Verlust“, „Zu prüfen“, „Ohne Erlös“,
  „Beantragt“, „Bezahlt im Monat … ohne Skonto“ und der Saldo bedeuten.
- **Abstand statt Linien.** Eine Karte auf einer Seite hat keine Linie mehr
  über sich, sondern Luft (1,25 rem am Handy, 1,75 rem ab Tablet, dazu der
  Abstand der Seite); ihr Titel steht eine Stufe größer („Abschnitt 18“).
  Linien bleiben, wo sie beim Lesen helfen: unter dem Titel einer Liste,
  zwischen ihren Zeilen, unter Gruppenüberschriften, über einem Kartenfuß.
  Akten und die Kontextspalte der Startseite trennen ihre Abschnitte ebenso.
- **Eine Kante.** Die Karte ragt um ihr Polster in den Seitenrand; Titel,
  Zeilen und Felder stehen dadurch an der Kante von Seitentitel und Stand,
  eine angetippte Zeile behält links und rechts Luft. Ausgenommen sind die
  schon bündig gebauten Seiten (Akten, Startseite, Plattform, Belegspalte)
  und alles in Fenstern und Blättern. Wo zwei Karten nebeneinanderstehen
  (Zeiterfassung, Urlaub, Einsatzplanung „Tag“), ist der Spaltenabstand
  auf 2,25 rem vergrößert, damit sich die Karten nicht überdecken.
Grenze, mit Grund: Seitenfenster und Dialoge behalten ihre Linien — ihr
Rand ist kein Seitenrand, und ihre Abschnitte sind kurz.

**E25 — Der Seitenkopf überall gleich (25.10.2026).** Punkt 1 des
Design-Entwurfs, beauftragt mit E24 („ja setze alles direkt um“). Vorher
trugen manche Seiten eine Ortszeile über dem Titel, andere nicht; „Hilfe zu
dieser Seite“ stand als unterstrichenes Wort neben einem ⋯-Zeichen; Hilfe
und Hauptaktion saßen ab dem Tablet unten an der letzten Zeile des Kopfs,
je nach Untertitel und Stand mal höher, mal tiefer; manche Untertitel liefen
über zwei Zeilen. Umgesetzt:
- **Ortszeile auf jeder Seite.** Ohne eigene Angabe nennt `PageHeader` die
  Gruppe aus dem Menü („Aufträge“, „Material“, „Geld“, „Team“ …); Akten und
  Unterseiten zählen zu ihrer Liste (`gruppeVon` in `navigation.ts`, derselbe
  Treffer wie `bereichVon`). Eine eigene Ortszeile geht vor. Die Startseite
  hat ihre eigene Zeile (Tag, Kalenderwoche) und keine Gruppe.
- **Hilfe als Zeichen.** Ein Fragezeichen im Kreis, 44 px Tastfläche, grau
  wie das ⋯ daneben — rechts fällt nur die Hauptaktion auf. Der Name
  „Hilfe zu dieser Seite“ bleibt für Vorlesehilfe und Mauszeiger.
- **Aktionen oben.** Hilfe, ⋯ und Hauptaktion stehen bei jeder Breite oben
  neben Ortszeile und Titel. Ab dem Tablet gibt der Titelblock bis 18 rem
  nach; ein langer Stand bricht in sich um, statt die Aktionen unter sich
  zu schieben.
- **Untertitel eine Zeile.** Gekürzt, wo sie umbrachen: Material anfordern,
  Anforderungen, Baustellen, Rechnungen, Wartungen, Firmendaten, Mein
  Konto, Datensicherung, Nummernkreise, Musterseite. Was dabei wegfiel und
  eine Erklärung war (wer anfordert, ab wann eine Wartung fällig ist), steht
  in der Hilfe der Seite.

Grenze, mit Grund: Nachkalkulation, Handwerksscheine, Urlaub und
Sonderurlaub behalten ihren Untertitel — er sagt dort etwas Fachliches
(„je Baustelle“, „auch Entwürfe“, die drei Arten der Freistellung), das
Prüfungen und Handbuch beim Wort nehmen.

**E26 — Eine Listenleiste (25.10.2026).** Punkt 2 des Design-Entwurfs,
beauftragt mit E24. Vorher baute jede Listenseite ihre eigene Leiste: die
Suche mal links, mal rechts, mit der Beschriftung „Suche“ darüber und bei
den Baustellen einem Hilfetext darunter; die Reiter mal gestreckt, mal
schmal; der Baustellenfilter der Anforderungen im Kopf der Karte. Umgesetzt
mit dem Baustein `Listenleiste` (`LotBausteine.tsx`, `lot.css`):
- **Reiter links, Suche rechts, Zusatzfilter daneben.** Ab dem Tablet stehen
  die Reiter in ihrer Textbreite links und die Suche rechts; fehlen die
  Reiter (Katalog, Anforderungen), bleibt die Suche rechts. Am Handy steht
  die Suche oben und die Reiter teilen sich die Breite — blendet eine Seite
  die Reiter beim Tippen aus (Scheine), rutscht das Feld nicht weg.
  Zusatzfilter: „Jeder Stand“ (Rechnungen), „Nur meine Baustellen“
  (Projektleitung), die Baustelle (Anforderungen).
- **Suche ohne Beschriftung, mit Lupe.** Der Platzhalter sagt, wonach
  gesucht wird, und ist so kurz, dass er auch am Handy ganz dasteht (U11);
  der Name „Suche“ bleibt für die Vorlesehilfe. Geändert: Baustellen
  „Kunde, Nummer oder Adresse“ (die Bezeichnung nennt die Hilfe der Seite),
  Scheine „Kunde, Baustelle oder Monat“ statt „Suchen …“, Rechnungen
  „Nummer, Kunde oder Baustelle“.
- **Eine Zahl am Reiter nur, wo sie Arbeit zählt (Protokoll 7.7) und
  vollständig bekannt ist.** Kunden „Anschrift prüfen“ und „Ohne
  Kundenart“ (beim Server gezählt, über den ganzen Stamm, neu nach jeder
  Änderung), Lager „knapp“ und „fehlt“ (alle Lagerartikel sind geladen;
  erst mit dem Stand der Datenbank), Wartungen „Steht an“ (nur wenn der
  ganze Bestand geladen ist, sonst ohne Zahl). Schon vorher da und
  geblieben: „Deaktivierte“ bei den Benutzern und die Zahlen der Bereiche
  der Anforderungen — jetzt ohne Klammer, grau hinter dem Wort.

Grenze, mit Grund — der Entwurf zeigte „Laufend 5 · Erledigt 12 · Alle
17“: Reiter für Bestand (Laufend, Offen, Erledigt, Alle) tragen keine Zahl.
Protokoll 7.7 legt fest, dass Zähler nur Handlungsbedarf zählen, nie den
Gesamtbestand; die Zahl der Gruppe steht über ihr in der Liste, die offene
Summe im Stand. Ebenfalls ohne Listenleiste: die Mitarbeiterübersicht (ihre
Leiste steuert einen Zeitraum, keine Liste), die Nachkalkulation (die Wahl
zwischen laufend und abgeschlossen gehört zum Satz „Zwischenstand“ darunter),
die Suche der Einstellungen (sie findet eine Einstellung, filtert keinen
Bestand; ihre Beschriftung unterscheidet sie von der Suche über alles) und
die Plattform (eigene Fläche des Betreibers).

**E27 — Zeilen gleich gebaut (25.10.2026).** Punkt 3 des Design-Entwurfs,
beauftragt mit E24. Vorher stand die Nummer mal in Klammern hinter dem
Namen (Baustellen, Scheine, Nachkalkulation, Einsatzplan des Monteurs), mal
vorn vor dem Namen (Rechnungen, Angebote); Zustände färbten ihr Wort
bernsteinfarben oder rot; Baustellen trugen drei Detailzeilen; Kunden und
Baustellen zeigten „⋯“ und „›“ nebeneinander. Umgesetzt im Baustein
`ListRow` und auf den Seiten:
- **Name fett, Nummer grau daneben** (`ListRow nummer`, `.zeile-nr`), ohne
  Klammer, mit echtem Leerzeichen für Vorlesehilfe und Kopieren — auch bei
  Rechnungen, Stornorechnungen und Angeboten, wo bisher die Nummer vorn
  stand, und in der Einsatzwahl des Scheins.
- **Eine Detailzeile.** Baustellen: Adresse, Telefon, Projektleitung und Team
  in einer Zeile, Adresse und Telefon bleiben antippbar. Kunden:
  Ansprechpartner in derselben Zeile wie Adresse und Telefon. Angebote:
  Datum, Gültigkeit, kalkulierte Stunden und Baustelle in einer Zeile.
- **Zustand in einer festen Spalte** (`.zeile-zustand`, ab dem Tablet
  8,5 rem breit), davor nichts, dahinter der Wert. „Ohne Projektleitung“ ist
  jetzt ein Zustand (Achtung) statt einer bernsteinfarbenen Fußnote;
  „Adresse prüfen“ und „Kundenart prüfen“ stehen in der Spalte statt im
  Titel; das Budget der Baustelle steht als Wert („40 h · Budget“).
- **Nur der Punkt trägt Farbe.** `.stand-warn` und `.stand-fehl` heben das
  Wort halbfett in Tinte; Bernstein und Rot bleiben am Punkt.
- **Nie „⋯“ und „›“ nebeneinander.** Wo eine Zeile ein „⋯“ hat, entfällt der
  Pfeil; die ganze Zeile führt weiter in die Akte. Kunden ohne
  Bearbeitungsrecht (kein „⋯“) behalten den Pfeil.

Grenze, mit Grund: Zusatzzeilen, die eine Handlung tragen, bleiben unter
der Detailzeile — Mahnstand und Teilzahlung an der Rechnung (Prüflauf
24.09.2026, F14: der Mahnstand gehört in die Zeile), „Unterschrieben von“,
„Verworfen“ und der Stornogrund am Schein. Sie in die eine Detailzeile zu
pressen, hätte sie abgeschnitten oder unlesbar gemacht.

**E28 — Einsatzplanung am Handy ruhiger (25.10.2026).** Auftrag mit drei
Fotos vom Handy (Woche, Tag, Monat). Umgesetzt:
- **Keine Silbentrennung in Namen und im Tag.** Die Seite trennt sonst
  automatisch (`hyphens: auto` am body, für lange Fachwörter); in
  `.tl-tag`, `.tl-name`, `.wp-name` und `.wp-name-titel` gilt `hyphens:
  manual`, „· heute“ bricht nicht um.
- **„frei“ als Zustand, „Einplanen“ als Verweis.** Der umrandete Knopf je
  freier Person wird eine ruhige Zeile; der Knopf ist weiter die ganze
  Fläche, Vorlesename und Vorbelegung unverändert.
- **„Noch einzuplanen“ ohne Rahmen, am Handy ohne Namen.** Drei Baustellen
  samt Nummer machten die Zeile fünf Zeilen hoch. Die Namen stehen ab dem
  Tablet in der Zeile und überall im Seitenfenster, dort mit der Nummer grau
  daneben (E27).
- **„Woche · Monat · Tag“ am Handy über die volle Breite**, ab dem Tablet
  rechts wie bisher.
- **Gruppenköpfe der Tagesliste als Linie** statt grauer Fläche (Linie
  „Lot“, E24).
- **Monat: Lesart in die Hilfe der Seite**, kein leerer Streifen mehr über
  „Für wen“ (`gap` statt `space-y`, das ausgeblendete Raster zählte mit).
- **Kalender-Abo ins ⋯.** Die Karte stand am Handy mitten in der Planung;
  eingerichtet wird das Abo einmal. Gleiche Bedingungen wie die Karte
  (Abo erlaubt, nicht im Supportzugang, nicht in der Team-Woche), gleicher
  Inhalt im Seitenfenster.

Keine Grenze: am Tablet und Schreibtisch bleiben Raster, Monat und Tag
unverändert; die Legende unter dem Monatsraster ab dem Tablet bleibt offen,
weil sie dort neben dem Raster Platz hat.


**E29 — Linienzeichnungen und klare nächste Schritte (29.10.2026).**
Grundlage: der freigegebene Illustrationsentwurf
(`senklot-illustrationen-gesamtentwurf-2026-10-29`, Commit `5e4c0694` auf
`bilder/landingpage-2026-10-14`) und die Konzeptbilder des Auftraggebers
„Kleine Bilder. Klare nächste Schritte.“ und „Orientierung, die Platz lässt.“

- **Eine Zeichnungsfamilie** (`LotZeichnung`): elf Motive im Zeichenraum
  240 × 150 — Konstruktionsschienen und Grundlinie (`--border-strong`, 1,0),
  das Objekt in Petrol (`--accent-deep`, 1,5), deckendes Papier
  (`--surface`), helle Flächen (`--petrol-hell`), Textzeilen (`--border`).
  Keine halbdurchsichtigen Flächen; hell und dunkel aus den Theme-Variablen
  ohne zweite Fassung; Linien bleiben bei jeder Größe gleich fein
  (`non-scaling-stroke`). Rein dekorativ (`aria-hidden`), nie Träger einer
  Aussage. Der Handwerksschein hat ein eigenes Motiv (das unterschriebene
  Blatt), damit drei Bereiche nicht dieselbe Zeichnung tragen.
- **Kein Kopfakzent.** Eine erste Fassung setzte die Zeichnung neben Titel,
  Hilfe und Hauptaktion in den Seitenkopf. In der Prüfung des Auftraggebers
  wirkte sie dort willkürlich platziert; sie ist entfernt. Zeichnungen
  stehen nur in Leerzuständen, im Einrichtungshinweis, in der Ablage und auf
  der Bühne der Anmeldung.
- **Der Leerzustand als eine Komposition**: Zeichnung (15 rem, am Handy
  12 rem), Titel (22/30, 600), ein Satz (höchstens 40 Zeichen breit, ohne
  Silbentrennung) und der nächste Schritt stehen auf einer Mittelachse; die
  Abstände wachsen von innen nach außen (Titel–Satz eng, Zeichnung–Titel
  und Satz–Knopf weiter). Ein zweiter, leiserer Weg steht als `nebenAktion`
  daneben (Kunden: „Bestehende Baustellen übernehmen“) und bleibt auch am
  Handy sichtbar.
- **Leerzustände unterscheiden**: Erstnutzung („Dein erster Kunde.“ für wer
  anlegen darf, sonst „Noch keine …“; Motiv des Bereichs, Hauptaktion als
  nächster Schritt — am Handy steht sie schon im Daumenbereich), Suche ohne
  Treffer (Motiv „suche“, Titel „Keine passenden …“, der Satz nennt, wo
  gesucht wurde, „Suche zurücksetzen“ als Knopf), leere Auswahl (ohne
  Zeichnung, das ist der gute Fall), nicht geladen (kein „noch keine …“, der
  Fehler steht an der Liste). Die Startseite zeigt die Abschlusszeichnung
  nur, wenn alles geladen ist.
- **Erster Besuch ohne Leiste**: Gibt es in Kunden, Baustellen, Angeboten,
  Wartungen, Rechnungen oder Handwerksscheinen noch keinen Eintrag, stehen
  Reiter und Suche (bei den Scheinen auch die Prüfkarte „Stunden ohne
  Buchung“) erst mit dem ersten Eintrag da — Reiter mit lauter Nullen sagten
  nur „hier fehlt etwas“. Gemessen wird an der geladenen Grundliste, nicht
  am getippten Suchbegriff, damit die Leiste beim Löschen einer erfolglosen
  Suche nicht verschwindet.
- **Keine Zeichnung** über Planungsrastern, in Formularen, Akten mit Inhalt,
  Finanzformularen und Sicherheitsabläufen.
- **Dokumente hinzufügen**: erst sammeln, dann hochladen — Ablagefläche mit
  Zeichnung, Liste mit Größe, Zustand und „Entfernen“. Die Ablagefläche
  trägt eine durchgezogene Linie (gestrichelt gibt es in der Linie nicht);
  beim Darüberziehen antwortet sie in Petrol. Sind Dateien gewählt, wird sie
  zur schmalen Zeile, damit „Hochladen“ im Bild bleibt. Eine am Netz
  gescheiterte Datei bleibt mit dem Grund in der Liste und geht beim
  nächsten „Hochladen“ wieder mit.
- **Einrichtungshinweis** (Firmendaten): so breit wie das Formular, oben
  ausgerichtet, am Handy untereinander; ausblendbar je Betrieb und Browser.
- **Anmeldung**: am Schreibtisch eine ruhige Bühne mit Marke, Zeichnung und
  einem Satz; das Formular steht auf der zweiten Hälfte ohne eigenen Rahmen
  (sonst eine Karte auf der Karte). Handy und Tablet behalten die Karte.
- **Designprüfung**: Ein eigens gebriefter Prüfer (Rolle: UI/UX-Designer)
  hat die Fassung an Fotos aller Breiten, hell und dunkel, gegen die Regeln
  der Linie geprüft; seine Änderungen (Lot über der Bodenmarke statt durch
  den Boden, einfaches Dach, eigenes Motiv „schein“, Ablage nach der Wahl
  kompakt, Hinweis am Handy untereinander, optische Kante der Zeichnungen,
  Suchsätze ohne Doppelung) sind übernommen.
- **Knopf-Links aus einem Guss** (`knopf.ts`, `KnopfLink`): ein Link in der
  Rolle eines Knopfs sieht aus wie der Knopf — ohne eigene Schatten oder
  Skalierung.

**E30 — Planlinie: die Sprache der Zeichnungen in den Bedienelementen
(30.10.2026).** Grundlage: Auftrag „Planlinie“ vom 30.10.2026 mit Entwurf
`Senklot_Planlinie.html`. Leitsatz: ein Baustein kommt nur auf die Seite,
wenn er ein bestehendes Element ersetzt. Funktionen, Daten, Rechte,
Abfragen, Geschäftslogik, Farben, die Zeichnungsfamilie aus E29, die
Navigation ohne Hamburger und die Dichte der Planung bleiben.

- **Bausteine** in `src/components/Planlinie.tsx` und
  `src/styles/lot-planlinie.css`, alle auf `/_muster`:
  - B1 Plankopf mit Schriftfeld (die Kennzahlen des Seitenkopfs zwischen
    zwei Linien, die Skizze des Bereichs rechts) und Lineal;
  - B2 Maßlinie (Ist gegen Grenze, der Überhang rot bis an eine eigene
    Endmarke) und B2a Saldolinie;
  - B3 sieben Statuszeichen als Masken: offen, geplant, in Arbeit,
    erledigt, Achtung, überfällig, storniert;
  - B4 Lot (aktiver Menüpunkt, heute in der Planung, Laden);
  - B5 Achskreis; B6 Stückliste; B7 Eckmarken; B8 Hinweislinie;
  - B9 Modulskizzen und Menüsymbole; B10 Nummernstempel;
  - B11 Schraffur, Einsatzbalken und Maßkette; B12 Raster.
- **Schrift**: IBM Plex Mono für alles Gemessene, aus dem eigenen Paket
  (`@fontsource`), weil die CSP keine fremden Schriften zulässt. Poppins in
  400/500; `font-semibold` zeigt auf `--gewicht-titel`. Ein Wort ohne
  Ziffer im Schriftfeld („Pauschal“, „Aktiv“) bleibt in der Textschrift.
- **Ein Akzent je Seite**, keiner in Seitenfenstern und Dialogen:
  - Hauptseiten mit Schriftfeld tragen die Skizze;
  - Akten tragen Eckmarken am Kontext (Baustelle, Kunde, Beleg);
  - die Planung trägt das Raster;
  - Seitenfenster bekommen nur den Stempel neben dem Titel.
- **Das Schriftfeld nur, wo es Zahlen gibt.** Angebote, Kunden, Material
  anfordern, Anforderungen und Einstellungen haben keine Kennzahlen im
  Kopf; dort gibt es weder Schriftfeld noch Skizze. Ein neues Feld wäre
  eine neue Kennzahl, und die schließt § 7.8 aus.
- **Verhältnis zu E29 („kein Kopfakzent“).** Die Skizze steht nicht frei
  neben dem Titel, sondern als letztes Feld des Schriftfelds. So gehört
  sie zu den Zahlen der Seite und ersetzt deren Leerraum. Ohne Schriftfeld
  gibt es auch keine Skizze.
- **Aktionen bleiben oben neben dem Titel.** Eine Zwischenfassung setzte
  sie auf die Grundlinie des Titelblocks. Das widersprach der Regel aus
  dem Design-Entwurf, Punkt 1, und dem Entwurf selbst, deshalb ist es
  zurückgenommen; `LotAbstand.test.tsx` prüft es jetzt auch in der neuen
  Stildatei.
- **Baustellenliste**: Die Maßlinie je Zeile und die Budgetfelder im
  Schriftfeld rechnen mit `stundenDerBaustellen` + `budgetStand`, wie die
  Startseite und der Budgetfilter. Das ist eine Abfrage für alle aktiven
  Baustellen mit Budget, und der Filter liest denselben Stand statt einer
  zweiten Abfrage. Solange er lädt oder wenn er scheitert, steht das
  Budget wie bisher als Zahl, und die Budgetfelder fehlen, statt eine Null
  zu raten.
- **Statuszeichen nach Bedeutung, nicht nach Farbe:**
  - Genehmigt, Bestätigt, Unterschrieben, Angenommen, Abholbereit und
    „gültig“ (UID) tragen den Haken;
  - Abgelehnt, Storniert, Ersetzt, inaktiv, deaktiviert und abwesend den
    durchgestrichenen Kreis;
  - Entwurf und „noch zu tun“ den offenen Kreis;
  - Termine heute die Raute;
  - „Beantragt“ bleibt Achtung.
- **Ladefehler sind nie „leer“** (§ 7.7): Die Leerzustände der Planung,
  der Nachkalkulation und des Lagers zeigen ihre Zeichnung nur, wenn
  wirklich nichts da ist.

**Bewusst weggelassen** (jeweils mit Grund):
- Die Maßlinie „Budgetlimit“ auf der Startseite. Sie stünde zusätzlich zu
  den Zeilen; die Maßlinie je Baustelle steht in der Baustellenliste.
- Eckmarken an „Mannschaft heute“: Die Startseite hat ihren Akzent schon
  in der Skizze. Der graue Kasten ist trotzdem weg.
- Fassungsbuchstaben A/B bei Angeboten: Geladen werden nur der direkte
  Vorgänger und Nachfolger, eine Zählung aller Fassungen wäre eine neue
  Abfrage.
- Maßlinien für „gültig bis“ (Angebot), „zuletzt → nächste“ (Wartung)
  und Offen/Umsatz beim Kunden: Dafür gibt es keine geladene Zahl (§ 7.8).
- Wochensummen „Einsätze“ und „Abwesend“ in der Planung: Die Planung
  kennt beides nur je Tag und Zelle.
- Legende unter der Wochenplanung: Sie käme zusätzlich auf die Seite; die
  Erklärung steht in der Hilfe.
- Raster im Monat: Bei 31 schmalen Spalten wäre es unruhig.
- Felder „Heute“ und „Kommend“ in der Zeiterfassung: „Heute“ wird nicht
  berechnet, „Kommend“ stünde doppelt zum Abschnitt.
- Monteur-Startseite unverändert: Ein Tagesstreifen und „Arbeitszeit
  heute gegen Soll“ bräuchten eine neue Abfrage.
- Schraffur im Urlaubskalender: Markierte Tage haben im gemeinsamen
  Kalender keine eigene Klasse.
- Pos-Nummern im Formular des Angebots: Das ist ein Formular und keine
  Stückliste (§ 7.4).

**Prüfungen.** Die Bausteine prüft `tests/components/Planlinie.test.tsx`,
die Regeln im Stil `tests/unit/planlinieStil.test.ts`. Jede Seite hat
eigene Prüfungen; jede neue Prüfung ist mit Gegenprobe gelaufen (mit der
alten Fassung rot). Vorher- und Nachher-Fotos stehen in `docs/planlinie/`.

**E31 — Jede Seite beginnt gleich (31.10.2026).** Rückmeldung des
Auftraggebers zur Planlinie, vier Punkte:
1. Der Satz unter der Maßkette der Zeiterfassung war zu lang.
2. In der Kundenakte war die Anschrift größer als der Rest, und die
   Abstände sprangen.
3. Auf der Startseite stand das Statuswort nicht auf der Höhe des Details.
4. Alle Seiten und Unterreiter sollen auf derselben Höhe beginnen, die
   Knöpfe rechts auf der Höhe der Überschrift.

Gemessen wurde mit einem Skript in 390, 834 und 1440 px, über 46 Ansichten
der Geschäftsführung (samt Akten und allen Unterseiten der Einstellungen)
und 15 des Monteurs. Es misst Ortszeile, Überschrift, die Mitte jedes
Knopfs und den ersten Inhalt unter Kopf und Reitern.

- **Seitenkopf in drei festen Zeilen.**
  - Aufbau: Ortszeile, Titelzeile, Meta.
  - Die Knöpfe (Hilfe, ⋯, Hauptaktion) gehören zur Titelzeile. Der rechte
    Block ist genau eine Titelzeile hoch (28 px, ab dem Tablet 36 px), die
    Knöpfe stehen darin mittig.
  - Vorher hingen sie an der Ortszeile, ihre Mitte lag 15 px über der Mitte
    der Überschrift.
  - Nachher stehen auf allen Seiten Ortszeile und Titel auf derselben Höhe,
    und kein Knopf weicht von der Titelmitte ab.
- **Rückweg in der Ortszeile** (Akten, Angebot), wie schon beim Angebot.
  - Der Link „← Zur Kundenliste“ stand als eigene Zeile darüber; die Akten
    begannen dadurch 56 px tiefer als ihre Liste.
  - Die Art der Akte („Kunde“) sagt der Rückweg mit, sie steht nicht mehr
    eigens da.
  - Die Tastfläche bleibt 44 px, über Polster und Gegenrand.
- **Reiter einer Unterseite unter ihrem Kopf** (Einstellungen).
  - Die Leiste stand über dem Seitenkopf, die Überschrift begann 117 px
    tiefer.
  - `Unterreiter` reicht die Leiste über einen Kontext an den Seitenkopf der
    Unterseite.
  - Hat eine Unterseite keinen Kopf, steht die Leiste wie bisher oben.
- **Keine Skizze neben dem Titel am Handy.** Sie schob die Überschrift um
  26 px nach unten, und zwar nur auf Seiten mit Schriftfeld. Die Skizze
  steht ab dem Tablet im Schriftfeld wie in E30.
- **Gleicher Abstand zum ersten Inhalt.**
  - Ziel: 12 px unter dem Kopf, ab 1200 px 20 px.
  - Ursachen der Abweichung (20 bis 71 px): Die Seiten waren teils mit
    12/20 px, teils mit 24 px gestapelt. Eine Karte brachte ihr Luftpolster
    von 28 px mit, auch direkt unter dem Kopf oder unter Reitern. Die Leiste
    einer Liste und die Zeichnung beim ersten Besuch trugen eigene Polster.
  - Das Luftpolster trennt Karten voneinander; unter dem Kopf trennt schon
    der Kopf.
  - Akten, Einsatzplanung und Startseite folgen demselben Takt.
- **Verweise im Kartenkopf** („Alle Baustellen →“) behalten ihre Tastfläche,
  ohne die Kopfzeile höher zu machen. Vorher stand der Titel einer Karte mit
  Verweis 11 px tiefer als der einer Karte ohne.
- **Kontextspalte der Akten in einer Schrift.**
  - Anschrift, Notiz, Wartungszahl und Kontaktdaten stehen in 13 px.
  - Links tragen ihre Tastfläche ohne Zeilenhöhe.
  - Jeder Abschnitt hat denselben Abstand zur Überschrift und zum nächsten.
- **Statuswort auf der Grundlinie des Texts.**
  - Das Statuszeichen hat keinen Text. Mittig ausgerichtet gab es der Zeile
    trotzdem ihre Grundlinie, das Wort stand dadurch 3 px höher.
  - Auf der Startseite ist das Wort jetzt so groß wie das Detail daneben
    (12 statt 11 px).
- **Zeiterfassung.**
  - Unter der Maßkette steht nur „Arbeitszeit: 08:30 Std“.
  - Dass die Pause in der Mitte gezeichnet ist, weil ihre Uhrzeit nicht
    erfasst wird, steht in der Hilfe der Seite (Regel „eine Hilfe pro
    Seite“). Die Grafik bleibt: sie zeigt Beginn, Ende und Pause.

**Bewusst so gelassen.** Ein Kartentitel mit Knopf (nicht Verweis) im Kopf
steht 5 px tiefer als einer ohne, weil er mittig zum 44-px-Knopf steht.
Einen Knopf zu stauchen hieße, seine Tastfläche zu verkleinern.

**E32 — Das Raster hell und dunkel, Flächen lassen es durch (31.10.2026).**
Rückmeldung des Auftraggebers: Im dunklen Satz passten die Grenzen zwischen
dem Raster und den Kästen oft nicht, besonders in der Einsatzplanung. Das
dezente Raster soll auch hell erscheinen. Damit ist die Planlinie (E30) an
einer Stelle geändert: Das Raster war bisher der Akzent der Planung und
dunkel die Blaupause der ganzen Fläche; jetzt liegt es hell wie dunkel unter
der ganzen Arbeitsfläche.

- **Ein Raster, an der Inhaltskante ausgerichtet.**
  - 24 px auf `.hauptflaeche`. Die erste Linie liegt dort, wo Ortszeile,
    Titel und Listen beginnen (Polster von `.inhalt`: 16, 24 bzw. 40 px).
  - Hell in der Farbe der zweiten Fläche, dunkel in der Farbe der Fläche
    (Token `--raster-linie`).
- **Flächen lassen es durch.**
  - Karte, Zeile, Arbeitszeile, Umschalter, die Listen der
    Mitarbeiterübersicht und die Kontextspalte der Akten hatten eine
    deckende Fläche. Das ergab Kästen, deren Kanten weder zum Raster noch
    zueinander passten. Jetzt sind sie durchsichtig.
  - Deckend bleiben Bedienelemente, Fenster und Blätter, umrandete Kästen
    (Kalender, Suchfeld, Einrichtungshinweis) und was beim Rollen über
    andere Zeilen läuft (Kopf und Namensspalte der Planung, Kopfzeile der
    Übersicht). Die Tage der Monatsplanung decken ebenfalls; ein Raster
    darunter wäre bei 31 schmalen Spalten unruhig (E30).
- **Einsatzplanung.**
  - Die Tabelle trug ein eigenes Raster von 16 px. Es traf das der Seite an
    keiner Kante; die Klasse `raster` steht nur noch auf der Musterseite.
  - Die Karte ragte um ihr Polster (16 px) in den Rand, die Tabelle stand
    neben der Rasterlinie statt auf ihr. Jetzt steht sie an der
    Inhaltskante.
  - Woche und Monat schließen oben mit einer Linie ab; vorher endete das
    deckende Kopfband zwischen zwei Rasterlinien.

**Bewusst so gelassen.** Die rechte Kante eines Kastens liegt nicht immer
auf einer Rasterlinie, weil seine Breite dem Fenster folgt. Ausgerichtet ist
die Inhaltskante, an der alles beginnt.

**Prüfungen.** `tests/unit/planlinieStil.test.ts`, Abschnitt „B12 Raster“:
nur drei Gitter (Arbeitsfläche, Anmeldung, Musterbaustein), Token und
Ausrichtung, durchsichtige Flächen, die deckenden Bänder als Gegenprobe, die
obere Linie und die Planung an der Inhaltskante. Jede Prüfung ist mit
Gegenprobe gelaufen. Durchgesehen in 390, 834 und 1440 px, hell und dunkel.

**E33 — Raster und Blätter (01.11.2026).** Rückmeldung des Auftraggebers zu
E32: Grenzen teils unklar, Texte, Überschriften und Elemente harmonieren nicht
mit dem Raster; die hellblauen Einsätze der Wochenplanung gefielen weniger als
die frühere volle Fläche. Konzept mit Messung und Screens vorgelegt
(„Raster und Blätter“), freigegeben mit Variante B für die Einsätze.

Gemessen vorher: auf Baustellen und Start lagen 10 von 11 Linien neben dem
Raster; Listenzeilen 97 px hoch, ihre Linien 16 px über die Inhaltskante,
Schriftfeld 86 px, Lineal in 8/40 px geteilt, Spalten mit 36 px Abstand.

- **Zwei Materialien.** Das Raster ist der Zeichentisch. Listen, Formulare
  und Tabellen liegen als **Blätter** darauf: deckend (`--surface`), mit
  einer Linie rundum (`--border-strong`). Eine Karte der Seite ist ein Blatt
  — nicht eine Karte in einer Karte, nicht in Fenstern, Dialogen und dem
  Blatt am Handy, nicht in den Kontextspalten von Akte und Beleg (die
  bleiben offen mit Eckmarken, E30). Dazu die Listen der
  Mitarbeiterübersicht, der Einrichtungshinweis und der Monatskalender, wo
  er frei steht. E32 ist damit an einer Stelle geändert: Karten decken
  wieder — jetzt als Blatt mit Grenze.
- **Jede Kante auf einer Linie.** Breite und Höhe in ganzen Zellen (24 px).
  Die Inhaltsspalte wird auf ganze Zellen gerundet (`--takt-breite`), Spalten
  sind ganze Zellen breit (Start 13 bzw. 10, Akten 12 bzw. 10 Zellen), der
  Abstand ist eine Zelle. Höhe und Oberkante rundet der **Taktgeber**
  (`src/lib/takt.ts`): je Blatt höchstens 23 px mehr Abstand darüber und
  mehr Polster unten, neu gerechnet, wenn sich Inhalt oder Breite ändert.
  CSS kann eine Höhe nicht auf ein Vielfaches runden; ohne Taktgeber hinge
  jede Unterkante am Inhalt.
- **Die Linie rundum** liegt oben und links als Zeichnung über dem Inhalt,
  rechts und unten direkt außen an der Kante — also genau auf der nächsten
  Rasterlinie, nicht einen Pixel davor.
- **Auf dem Raster wird in die Zellen geschrieben.** Ortszeile 24, Titel 48,
  Untertitel 24 px; die Knöpfe daneben 48 px hoch. Schriftfeld: Felder zehn
  Zellen breit (Tablet sechs, Handy sieben), jede Zeile eine Zelle; Linien
  gezeichnet, damit sie die Höhe nicht verlängern. Lineal in 24/6 px.
  Unter dem Kopf und zwischen den Blöcken eine Zelle (vorher 12/20 px, E31).
- **Im Blatt** steht Text eine Zelle vom Rand; Kopf 72 px, Zeilen 48 bzw.
  72 px.
- **Einsätze (Variante B).** Volle Petrol-Fläche, weiße Schrift, eckig, Ort,
  Zeit und Nummer eine Stufe leiser (`--auf-petrol`, `--auf-petrol-leise`,
  4,5:1 auch beim Zeigen), mindestens zwei Zellen hoch; ebenso im Monat, in
  der Legende und im Musterbaustein. Bernstein für „eingeteilt, aber
  abwesend“, Schraffur für Abwesenheit und die helle Terminkarte bleiben.
  E30 (Einsatzbalken mit Endmarken) ist damit geändert.

**Bewusst so gelassen.** Fenster, Dialoge und das Blatt am Handy sind
Überlagerungen und folgen dem Raster nicht. Ohne `ResizeObserver` (sehr
alte Browser) bleibt die Seite wie gebaut, nur nicht auf den Pixel im
Raster.

**Prüfungen.** `tests/unit/takt.test.ts` (Rechenregeln, Ausrichten,
gleiche Liste in CSS und JavaScript), `tests/durchklick/raster.spec.ts`
(jede Blattkante auf 20 Seiten in 390, 834 und 1440 px; ohne Taktgeber 297
Kanten daneben), `tests/unit/einsatzbalken.test.ts` (Variante B),
`lotGrundwerte.test.ts` (Schrift auf Petrol). Jede Prüfung mit Gegenprobe.
