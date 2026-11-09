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

**E34 — Abstand zur Linie (02.11.2026).** Rückmeldung des Auftraggebers mit
zwei Bildschirmfotos: „auf der Startseite und teilweise auch auf anderen
Seiten liegen Text und Symbole zu nah am Rand ohne Abstand“, und im
Schriftfeld „ist die Linie nach dem dritten Punkt abgeschnitten“.

Gemessen vorher: an jedem Textstück und jedem Zeichen (Symbol, Achskreis,
Zustand, Eingabefeld) der Abstand zur Innenkante seines Blatts oder Felds,
auf 42 Seiten und Unterseiten der Geschäftsführung samt jedem Reiter, in
390, 834 und 1440 px, dazu die Startseiten von Monteur und Büro. Ursache
war in allen Fällen dieselbe: seit E33 trägt jedes Blatt eine Linie rundum;
was vorher auf offenem Grund bündig stand (E24), lag danach auf der Linie.

- **Startseite.** Zeilen, Abschnitte mit Achskreis, „und N weitere“, die
  Termine, „Die Mannschaft heute“, der eigene Einsatz und der Verweis unter
  einer Karte stehen jetzt eine Zelle (24 px) von der Linie — wie der
  Kartenkopf darüber und jede Zeile in einem Blatt (`lot-blatt.css`).
  Vorher 0 px links und rechts, in allen Breiten.
- **Mitarbeiterübersicht am Handy.** Der Vergleich stand ohne Polster
  (Namen, Zahlen, Achskreis auf der Linie); jetzt 16 px wie dieselben Zeilen
  ab dem Tablet und die Tagesliste am Handy. Ebenso am Schreibtisch der Satz
  zum Maßstab der Saldolinie, der nur erscheint, wenn jemand einen
  Gesamtsaldo hat — gefunden erst mit vollen Testdaten.
- **Schriftfeld: die obere Linie geht durch.** Die Felder haben seit E33
  feste Breiten; vor der Skizze blieb ein freies Stück ohne Linie. Das
  Schriftfeld trägt sie jetzt selbst über die ganze Breite. Bricht eine
  Reihe um (Handy mit drei Feldern, schmale Bildschirme mit vier), führt ein
  Füllstück die obere Linie der letzten Reihe bis zum Rand; ist die Reihe
  voll, ist es null breit.
- **Schriftfeld am Tablet: sieben Zellen je Feld mit 12 px Polster**, wie am
  Handy (vorher sechs Zellen mit 24 px). Mit 96 px Text liefen „November
  2026“ und jeder Betrag ab „€ 1 234,56“ über die Feldlinie, „Tage ohne
  Buchung“, „Ende überschritten“ und „Bezahlt im Monat“ wurden
  abgeschnitten. Drei Felder und die Skizze stehen in einer Reihe; ein
  viertes Feld (Baustellen, Baustellenakte) bricht am Tablet hochkant in
  eine zweite Reihe um wie am Handy — das Schriftfeld wird drei Zellen
  höher, dafür steht jeder Wert ganz da.
- **Die Skizze hält 12 px Abstand** zu ihren Feldlinien; am Tablet berührte
  sie sie links und rechts. Am Schreibtisch bleibt sie gleich groß.

**Bewusst so gelassen.** Im Monat der Planung reichen die 31 Tagesspalten
bis an die Linie, ihr Text steht mittig in der Zelle — die letzte steht so
nah am Rand wie jede andere an ihrer Spaltenlinie; ein Rand rechts hätte
eine leere Spalte ohne Tag erzeugt. Die Woche rollt am Tablet in sich; was
dort über die Kante geht, liegt im verdeckten Teil.

**Prüfungen.** `tests/durchklick/rand.spec.ts` misst jeden Abstand auf
sieben Seiten (Startseite mit Mannschaft und Termin, Mitarbeiterübersicht,
Baustellen, Baustellenakte, Rechnungen, Zeiterfassung, Lager) in drei
Breiten, mindestens 8 px; dazu, dass das Schriftfeld oben und in jeder
angebrochenen Reihe schließt. `tests/unit/planlinieStil.test.ts` hält die
Regeln. Jede Prüfung mit Gegenprobe: mit dem alten Stand meldet die
Messung 69 Stellen zu nah an der Linie, das Schriftfeld ist offen, vier
Stilprüfungen sind rot.

**E35 — Der Arztbesuch (02.11.2026).** Auftrag: „wie werden derzeit
Arztbesuche abgebildet — und wie am besten, in vollem Umfang?“ Bis dahin gab
es keinen Weg: ein Arztbesuch war entweder ein Krankenstand (falsch, der
Tag ist kein Krankenstand), Zeitausgleich (falsch, er ist bezahlt) oder ein
Kommentar an der Arbeitszeit (unsichtbar für Saldo und Lohnverrechnung).

**Rechtslage, nach der gebaut ist.** Ein Arztbesuch in der Arbeitszeit ist
eine Dienstverhinderung aus wichtigen persönlichen Gründen: bezahlt nach
§ 1154b Abs 5 ABGB (Arbeiter) bzw. § 8 Abs 3 AngG (Angestellte), seit
1.7.2018 auch für Arbeiter nicht mehr durch den Kollektivvertrag
einschränkbar. Bezahlt ist die nötige Zeit samt Weg vom Arbeitsort, wenn
sich der Termin nicht außerhalb der Arbeitszeit legen lässt; den eigenen
Hausarzt darf man auch dann aufsuchen, wenn er nur während der Arbeitszeit
ordiniert. Bezahlt ist nur Zeit, die sonst gearbeitet worden wäre — bei
Gleitzeit die fiktive Normalarbeitszeit. Wer den ganzen Tag arbeitsunfähig
ist, ist im Krankenstand.

- **Ein Antrag der Art Sonderurlaub mit dem Anlass „Arztbesuch“**, immer an
  einem Tag mit Uhrzeit (Weg vom Arbeitsort bis zurück), vorab oder
  nachträglich. Ein eigenes Formular, weil Tage und „Tag des Ereignisses“
  hier nichts bedeuten. Kein Kontingent; zwei Termine an einem Tag gehen,
  wenn sie sich nicht überschneiden.
- **Bestätigt wird vom Büro** wie jeder Sonderurlaub. Die Datenbank schlägt
  vor, was angerechnet wird: höchstens der Termin, höchstens was am Tag noch
  zur Sollzeit fehlt (`arztbesuch_vorschlag`). Eine andere Zeit geht mit
  Grund. Im Zeitkonto steht genau die angerechnete Zeit als
  Dienstverhinderung mit dem Vermerk „Arztbesuch“, ab dem Beginn des
  Termins; von Hand nicht änderbar.
- **Arztbestätigung:** ab Werk verlangt, je Betrieb abschaltbar
  (Einstellungen › Sonderurlaub und Arztbesuch). Hochladen als Foto oder
  PDF oder auf Papier zeigen; nach „geprüft“ löscht die App die Datei, es
  bleibt der Vermerk. Keine Diagnose — weder in der Anmerkung noch auf der
  Bestätigung nötig.
- **Abgelehnt** wird mit Grund und einer Wahl, was aus der Zeit wird: als
  Zeitausgleich buchen (nur, wer über Urlaub entscheidet) oder nicht buchen —
  dann fehlt sie im Saldo.
- **Wer was sieht.** Das Büro sieht „Arztbesuch“ (Bestätigen, Wochenplan,
  Einsatzplanung, Push „Arztbesuch zu bestätigen“); die Projektleitung und
  die Kollegen sehen im Wochenplan nur „abwesend“ mit der Uhrzeit — schon ab
  dem Antrag, weil der Termin feststeht. Die Startseite nennt ihn wie jeden
  Anlass nicht: dort steht „Sonderurlaub“.
- **Lohnverrechnung:** Lohn-CSV mit der Spalte „davon Arztbesuch(Std)“ ganz
  hinten (steckt in „Freigestellt stundenweise“), Monatsblatt mit „davon
  Arztbesuch“, Stundennachweis mit dem Kürzel „AB“.

**Bewusst so gelassen.** Die App rechnet den Weg nicht aus: Beginn und Ende
trägt die Person ein, das Büro prüft. Eine günstigere Regel eines
Kollektivvertrags oder einer Betriebsvereinbarung rechnet das Büro mit Grund
an (bis zur Dauer des Termins).

**Prüfungen.** `tests/supabase/arztbesuch.test.ts` (22 Prüfungen: Regeln der
Datenbank, Vorschlag, Nachweis, Ablehnen mit Folge, Wochenplan, Zeitkonto),
`tests/unit/arztbesuch.test.ts`, `tests/unit/freistellung.test.ts`
(Lohn-CSV, mit Gegenprobe ohne Vermerk), `tests/unit/startseite.test.ts`
(Anlass bleibt weg), `tests/components/VacationsView.test.tsx` (Melden,
Überschneidung, Bestätigen, andere Zeit, Ablehnen),
`tests/durchklick/arztbesuch.spec.ts` (Monteur meldet mit Bestätigung, Büro
bestätigt, Zeitkonto, Datei gelöscht).


**E36 — Einheitliche Senklot-Marke (03.11.2026).** Auftrag: das zuvor
freigegebene Markenpaket überall als Produktmarke verwenden, einschließlich
Favicon und App-Icon.

- `ProduktMarke` verwendet dieselbe Pfad-SVG wie das Markenpaket, in Petrol
  oder Weiß. Das bisher getrennt gesetzte Wort entfällt; Form, Laufweite und
  Proportionen sind dadurch auf Anmeldung, Plattform, Begrüßung, Rechtsseiten
  und im Seitenleistenfuß identisch. Auf dunklen Inhaltsflächen bleibt die
  Marke weiß. Im Handbuch steht dieselbe Kontur.
- Favicon und Installationsicons entstehen aus dem einzelnen Senklot auf
  deckendem Weiß. iOS bekommt ein randloses Quadrat, Android ausreichend
  Abstand für den sicheren Kreis. Push bekommt eine transparente Silhouette.
- Neue `/marke/`-Adressen verhindern die Wiederverwendung der bisherigen
  Icon-Dateien. Startadresse, Scope, App-Name, Statusleistenfarbe und
  Service-Worker-Verhalten bleiben erhalten; die bisherigen Bildadressen
  liefern für bestehende Verweise ebenfalls aktualisierte Dateien.
- Die Generierung und SHA-256-Zuordnung stehen in `marke/rastern.mjs` und
  `marke/ausgabe.json`. Der Produktionsbuild braucht keinen zusätzlichen
  Browser. Die freigegebenen SVGs bleiben die gemeinsame Quelle.

**Abgrenzung.** Betriebslogos und Belegköpfe gehören weiterhin dem jeweiligen
Mandanten. Bestehende iOS-Verknüpfungen erneuern ihr Homescreen-Bild nach
Vorgabe des Betriebssystems; gegebenenfalls ist erneutes Hinzufügen nötig.

**Prüfung.** Pixelprüfungen für Größe, Deckkraft, Hintergrund und Android-Kreis,
Pfadvorlagen ohne Schriftabhängigkeit, identische öffentliche Exporte,
aktuelle Push-Verweise sowie Anmeldung ohne Mandantenlogo. Ergänzend die
Produktmarke in heller/dunkler Darstellung und drei Bildschirmbreiten.

**E37 — Luft im Schriftfeld, Zeichen mittig, Rechnung in der Kundenakte
(03.11.2026).** Rückmeldung des Auftraggebers mit drei Bildschirmfotos.

- **Schriftfeld:** „die Abstände sehen so klein aus, alles wirkt
  zusammengepfercht“ (Angebot). Beschriftung und Wert lagen direkt an der
  oberen und unteren Feldlinie (gemessen 4 px). Jetzt je eine halbe Zelle
  (12 px) oben und unten: das Feld ist drei Zellen hoch statt zwei, seine
  Kanten bleiben auf dem Raster (E33). Gilt für jedes Schriftfeld.
- **„Einheitspreis nach Aufmaß“** passte in keiner Breite in ein Feld der
  Baustellenakte und lief bis zu 72 px ins Nachbarfeld. Im Schriftfeld steht
  jetzt „Einheitspreis“ als Wert und „nach Aufmaß“ in der kleinen Zeile
  darunter, wie „offen · nicht festgelegt“. Auswahl, Handwerksschein und
  alle anderen Stellen behalten das ganze Wort. Ein Wortwert im Schriftfeld
  bricht künftig um, statt über die Feldlinie zu laufen.
- **Zustandszeichen:** „die Icons z. B. auf der Startseite sind nicht mit dem
  Text zentriert“. Das Zeichen stand mittig in der 22 px hohen Box, die
  Schrift oben darin — 2,5 px unter der Mitte der Buchstaben. Jetzt auf der
  Grundlinie, um 7 px − 0,35 em (13-px-Wort 2,5 px, 12-px-Startzeile
  2,75 px; die Linie kennt kein `calc()`) bis zur halben Versalhöhe gerückt.
  Rechts in den Startzeilen steht das Wort mittig in seiner Box, auf einer
  Mitte mit „›“ (vorher 1,2 px darüber). Vorn in der Detailzeile bleibt es
  auf der Grundlinie des Details (31.10.2026).
- **Rechnung in der Kundenakte:** „die Rechnungen sollten sich direkt in der
  Akte öffnen lassen … und nicht einfach zur Rechnungsseite wechseln“. Die
  ganze Zeile (Karte „Rechnungen“ und „Jüngste Belege“) öffnet dasselbe
  Seitenfenster wie auf der Rechnungsseite: Angaben, Leistungen, Summen,
  Zahlstand, Mahnungen; die Rechnung, ihre Mahnungen und eine ausgestellte
  Stornorechnung als PDF. Die PDFs kommen aus einer gemeinsamen Stelle
  (`belegeLaden.ts`), damit Akte und Rechnungsseite nie verschiedene Belege
  erzeugen.

**Bewusst so gelassen.** Zahlung erfassen, mahnen, stornieren, Stornorechnung
ausstellen, E-Rechnung und Bankgarantie bleiben auf der Rechnungsseite — sie
schreiben Geld- und Belegstände, die Mahnlauf, Zahlungsabgleich und
Rechnungskreis dort mitführen; ein zweiter Weg zu denselben Buchungen liefe
auseinander. „In Rechnungen bearbeiten“ im Fenster führt dorthin, mit
derselben Rechnung schon offen (`?oeffnen=`, einmalig).

**Prüfungen.** `tests/durchklick/rand.spec.ts` misst im Schriftfeld jetzt
auch oben und unten und prüft die Baustellenakte mit „Einheitspreis“ (ohne
die Änderung: 4 px oben und unten auf jeder Seite, −72 px rechts);
`tests/durchklick/zeichenMitte.spec.ts` (Zeichen und „›“ zur Schriftmitte am
Schreibtisch, am Handy und in einer Liste; ohne die Änderung 2,8 px daneben);
`tests/durchklick/kundenRechnung.spec.ts` (Fenster in der Akte, PDF,
Schließen, „In Rechnungen bearbeiten“); `planlinieStil.test.ts`,
`abrechnung.test.ts`, `BaustellenakteView.test.tsx`,
`KundenakteView.test.tsx`.

**E38 — Ein Lot am Seil in der Navigation (03.11.2026).** Auftrag: „der
Senklot neben dem jeweiligen Menüpunkt sollte sich immer von oben mit dem
Seil zu dem jeweiligen Menüpunkt runter bzw. rauf lassen … smooth, nicht zu
ruckelig“; Vorschlag freigegeben („so wie empfohlen“), am Handy „kann es
bleiben wie bisher“.

- **Ein Lot statt eines je Punkt.** Bis dahin trug jeder aktive Menüpunkt
  sein eigenes kleines Lot; beim Wechsel verschwand es oben und erschien
  unten. Jetzt hängt eines an einer Aufhängung (kleiner Querstrich) 6 px über
  „Start“; das Seil läuft links neben den Punkten an den Gruppen vorbei, das
  Blei hängt mittig neben dem aktiven Punkt.
- **Die Fahrt.** Herab: zügig, weich gebremst, bis zu 3 px ins Seil und
  zurück. Herauf: eingeholt, ohne Überschwingen. Dauer nach Strecke, 200 ms
  für den Nachbarpunkt bis höchstens 450 ms (`lib/lotSeil.ts`). Ein neuer
  Klick mitten in der Fahrt lenkt aus der aktuellen Lage um, ohne Sprung.
- **Flüssig, weil nur `transform` läuft:** das Seil (1 px) wird gestreckt,
  das Blei um dieselbe Länge verschoben — kein neues Layout, auf der
  Grafikkarte; das Seil endet in jedem Bild genau am Blei. Gemessen wird nur
  beim Seitenwechsel und bei Größenänderung (`app/NaviLot.tsx`).
- **Beim Laden ohne Fahrt** am Ziel; **ohne aktiven Punkt** ist das Seil
  eingeholt; **„Bewegung reduzieren“** springt ohne Fahrt.
- **Am Handy** bleibt das Lot über dem aktiven Symbol der unteren Leiste wie
  bisher (Entscheid des Auftraggebers).

**Prüfungen.** `tests/durchklick/naviLot.spec.ts` zeichnet die Fahrt Bild
für Bild auf (Schreibtisch und Tablet): stetig in eine Richtung, höchstens
3 px nachgefedert, kein Überschwingen nach oben, kein Sprung beim Umlenken
(Geschwindigkeit je Bild), am Ende auf 1 px mittig, Seil von der Aufhängung
bis an das Blei; eingeholt ohne aktiven Punkt; ohne Fahrt bei reduzierter
Bewegung. `tests/unit/lotSeil.test.ts`, `planlinieStil.test.ts`. Gegenprobe:
mit der alten Navigation alle drei Browserwege und die Stilprüfung rot.

**E39 — Der Haken auf der Höhe von „Start“, das Blei in der Markenform
(03.11.2026).** Rückmeldung zu E38 mit Bildschirmfoto: „der Beginn hängt über
Start und der Menüpunkt Start hat ein zusätzliches Senklot-Icon“; nach zwei
Vorschauen aus der echten App: „der Senklot passt noch nicht perfekt auf das
Seil … was wäre mit einem Start des Senklots auf der gleichen Höhe wie das
Start-Icon?“ — „ja so umsetzen mit Haken“.

- **„Start“ ist die Aufhängung.** Der Haken (5 px Querstrich) sitzt auf der
  Höhe des Punkts „Start“; steht man dort, hängt das Blei ohne Seil am
  Haken, geht man weiter, rollt das Seil von dort ab. Vorher saß die
  Aufhängung 6 px darüber, frei im Raum, und auf „Start“ war das Seil ein
  Stummel. Ein Seil aus der Unterkante des Suchfelds (erste Vorschau) wirkte
  angeklebt und rückte das Lot dicht an die Symbole; verworfen.
- **Das Blei in der Form der Marke** (Kappe, Körper, Spitze), 9 px breit —
  ungerade, damit Seil und Kappe auf eine Pixelspalte fallen. Vorher lag das
  Seil auf einem halben Pixel (weich gezeichnet), und die gerade breite
  Raute traf es nicht genau.
- **„Start“ trägt einen Grundriss** statt des Lots: das fahrende Lot ist das
  einzige Senklot der Leiste. Auch in der unteren Leiste am Handy (dort ist
  das Lot über dem Symbol sonst unverändert).
- **Ohne aktiven Punkt** ist das Seil eingeholt und das Blei ausgeblendet —
  am Haken neben „Start“ sähe „Start“ sonst aktiv aus; es bleibt der Haken.

**Prüfungen.** `tests/durchklick/naviLot.spec.ts`: Seil beginnt am Haken,
bei „Start“ kein Seil, Start-Symbol ist kein Lot, ohne aktiven Punkt nur der
Haken, danach das Blei wieder da; dazu alles aus E38. `planlinieStil.test.ts`
(Blei 9 px mit Maske, Seil auf ganzen Pixeln, Ausblenden). Gegenprobe mit dem
Code von E38: alle drei Browserwege und die Stilprüfung rot.


**E40 — Baustellenliste mit Luft, Nachkalkulation mit Seitenfenster und
schnell (04.11.2026).** Auftrag mit zwei Bildschirmfotos: „Bei der
Baustellen-Seite wirkt teilweise noch alles ein wenig eng, viel Text, viel
Infos, wenig Abstände … in allen Ansichten. Nachkalkulation: hier auch viel
Text und es wirkt sehr unübersichtlich … eventuell mit einer Detailansicht
mit einem Modal-Overlay, sodass nicht alles in den kleinen Feldern stehen
muss? Außerdem lädt die Seite im Vergleich zu den anderen sehr langsam. Auch
beim Tab-Wechsel wird Inhalt oft noch nachgeladen.“

- **Die gestapelte Zeile** (`ListRow gestapelt`). Am Tablet nahm die rechte
  Spalte (Zustand 8,5 rem und Maßlinie 15 rem) über 400 px; der Name brach
  in drei Zeilen, die Adresse in zwei. Gestapelt stehen Zustand und Wert am
  Handy und Tablet UNTER dem Text, das „⋯“ oben rechts; am Schreibtisch
  rechts in festen Spalten wie jede Zeile. Ein Tipp auf Zustand oder
  Maßlinie öffnet die Akte (`pointer-events`), Knöpfe gehören in die
  Aktionen. Gilt für Baustellen und Nachkalkulation; die übrigen Listen
  bleiben, wie sie sind.
- **Baustellenzeile in zwei Zeilen**: Adresse und Telefon, darunter
  Projektleitung und Team — vorher hintereinander, gebrochen, wo die Breite
  endete. Das Team mit zwei Namen und „+2“; alle Namen für den Vorleser und
  in der Akte. Oben und unten eine halbe Rasterzelle mehr Luft (18/17 px).
- **Nachkalkulation: die Zeile sagt, wie es steht — das Seitenfenster,
  warum.** Die Zeile nennt die Herkunft des Erlöses und „3 Artikel ohne
  Einkaufspreis“ statt der ganzen Liste im Satz; Personal, Material und
  Stunden stehen im Seitenfenster als Aufstellung (Erlös, − Personal nach
  Facharbeit, Helfer und Lehrling mit Betrag, − Material mit Herkunft,
  Deckungsbeitrag unter der Doppellinie), dazu die Artikel ohne
  Einkaufspreis beim Namen mit dem Weg in den Katalog und der Weg in die
  Akte. Gerechnet wird nichts Neues; `rechneBaustelle` liefert die Posten
  dazu (`personalJe`, `materialQuelle`, `rechnungen`).
- **Schneller.** Scheine, Rechnungen und Angebote kamen je Baustelle samt
  Zeilen: bei 25 Baustellen über 140 Anfragen. Jetzt eine Abfrage je Art
  über alle gezeigten Baustellen (`listWorkSheetsForProjects`,
  `listInvoicesForProjects`, `listQuotesForProjects`) — dieselben Belege in
  jeder Schreibweise der Nummer. Gemessen lokal mit 25 Baustellen: 142 → 23
  Anfragen, 1,23 → 0,64 s bis zur fertigen Liste. Das Ergebnis je Auswahl
  ist zwischengespeichert; steht die eine, wird die andere im Hintergrund
  gerechnet. Der Wechsel „Abgeschlossen ↔ Laufend“ zeigt die Liste sofort
  (vorher 0,57 s mit allen Anfragen neu), der zweite Besuch der Seite
  ebenso. Nebenbei: während des Ladens stand kurz „Kostensätze fehlen“ —
  jetzt ein Platzhalter.

**Prüfungen.** `tests/durchklick/listenLuft.spec.ts` (Handy, Tablet,
Schreibtisch: Stand unter bzw. neben dem Text, zwei Zeilen, nichts seitlich,
Tipp auf die Maßlinie öffnet die Akte; Nachkalkulation: kurze Zeile,
Seitenfenster, Wechsel ohne Platzhalter), `tests/supabase/
nachkalkulationBuendel.test.ts` (die gebündelten Abfragen liefern genau, was
die Einzelabfragen liefern, auch „PR-“), `NachkalkulationView.test.tsx`
(+10, 5 umgestellt), `ZeilenGleich.test.tsx` (+4), `AdminProjectsView.test.tsx`
(+2), `nachkalkulation.test.ts` (+3). Gegenprobe mit dem Code davor: die
neuen Prüfungen rot, die gleichbleibenden grün.

**E41 — Rechnungsliste mit Luft, Abzug im Fenster ganz, Einrichtungsstand
nur bei offenen Punkten, Auswahlpfeil wie das Kalenderzeichen
(04.11.2026).** Auftrag mit Bildschirmfotos: „Bei Rechnungen ist auch alles
sehr crowded, eng, viel Text … im Rechnungen-Overlay wird der Punkt
‚abzüglich‘ immer falsch/abgeschnitten angezeigt … Einstellungen: wenn der
Einrichtungsstand voll erfüllt ist, sollte er verschwinden … bei Dropdowns
generell überall: der Pfeil ist zu nah am Rand, er sollte in etwa gleich
sein wie der Kalender bei der Datumsauswahl.“

- **Rechnungsliste gestapelt** (wie E40): Zustand und Betrag am Handy und
  Tablet unter dem Text, am Schreibtisch rechts in Spalten. Jede Angabe in
  ihrer eigenen Zeile (Datum und Fälligkeit, Mahnstand, Guthaben, Storno), in
  der Schrift der Zeile statt kleiner. Die Teilzahlung steht als Maßlinie beim
  Betrag (`.zeile-zahlen`, mit der Nachkalkulation gemeinsam), „überfällig“
  am Fälligkeitsdatum — vorher lief das Wort unter der Linie in deren
  Beschriftung. Am Handy Zustand links, Betrag rechts in einer Zeile. Der
  Mahnlauf darüber bleibt, wie er ist.
- **Abzug der Anzahlung**: neben dem Betrag steht „abzüglich RE-…“, Datum,
  netto und USt in einer Zeile darunter. Der Betrag darf nicht mehr
  schrumpfen (`shrink-0`) — die Lesegruppe erlaubt jedem Wert das Schrumpfen,
  ein Betrag ohne Umbruch lief deshalb über den Rand.
- **Einrichtungsstand**: sind alle Punkte erledigt, steht die Karte nicht
  da; sie kommt von selbst wieder, sobald ein Punkt offen ist oder „prüfen“
  heißt (etwa eine Sicherung, die seit Tagen nicht lief). Platzhalter stehen
  nur, wenn am Betrieb schon etwas offen ist und die Karte sicher kommt.
- **Pfeil der Auswahl**: gemessen stand der Pfeil des Browsers 5 px vom
  Rand, das Kalenderzeichen 17 px (12 px breit). Die App zeichnet den Pfeil
  jetzt selbst, 12 px breit, Mitte 22 px vom Rand wie das Kalenderzeichen, in
  der Farbe des Texts (hell und dunkel je ein Token). Rechts 40 px Polster,
  damit eine lange Wahl nicht unter den Pfeil läuft; die Felder werden
  dadurch etwa 8 px breiter. Gilt für jedes einzeilige Auswahlfeld.

**Prüfungen.** `listenLuft.spec.ts` (+2: Rechnungszeile in drei Breiten ohne
Überlagerung, Abzug im Fenster ganz sichtbar; Pfeil gegen Kalenderzeichen auf
2 px), `InvoicesView.test.tsx` (+1, 3 angepasst), `detailSummen.test.ts`,
`EinstellungenUebersicht.test.tsx` (+3, 2 angepasst), `auswahlPfeil.test.ts`
(neu, 3). Gegenprobe mit dem Code davor: die neuen Prüfungen rot.

**E42 — Entwürfe lassen sich löschen, „Stunden ohne Buchung“ knapp
(04.11.2026).** Auftrag mit Bildschirmfoto: „Handwerksscheine: das Stunden-
ohne-Buchung-Fenster erscheint so unnötig groß … außerdem kann man Entwürfe
bzw. verworfene Entwürfe nicht löschen.“

- **Entwurf löschen** — eine geänderte Grundsatzregel. Bisher galt für jeden
  Schein „gelöscht wird ein Beleg nie“; ein Entwurf wurde verworfen und blieb
  samt Fotos aus fremden Wohnungen für immer. Ein Entwurf ist aber kein
  Beleg: nicht unterschrieben, niemandem übergeben, auf keiner Rechnung
  (verrechnet wird nur Unterschriebenes). Jetzt löscht ihn — als Entwurf oder
  verworfen —, wer ihn bearbeiten darf (`app.schein_schreibt`: der Monteur
  seinen eigenen, die Führung jeden). Unterschrieben und storniert bleibt
  alles wie bisher: nie löschbar (§ 132 BAO). Der Support löscht nicht.
- **Datenbank** (`20261104100000_schein_entwurf_loeschen.sql`):
  Löschregel `work_sheets_loeschen` (Status Entwurf/Verworfen,
  `app.schein_schreibt`); Zeiten, Material und Fotozeilen gehen über
  ON DELETE CASCADE mit. `app.foto_schein_offen` lässt die Dateien eines
  verworfenen Entwurfs entfernen wie die eines Entwurfs. Neu
  `public.schein_loeschbar(id)` (security definer, `search_path = ''`, nur
  `authenticated`): die App fragt damit, BEVOR sie Fotos entfernt — die
  Fotos eines Entwurfs darf der ganze Betrieb entfernen, den Schein nicht.
- **Reihenfolge**: erst die Dateien im Ordner des Scheins (auch ein nie
  gespeichertes Foto), dann die Zeile. So bleibt im Erfolgsfall keine Datei
  ohne Schein liegen; reisst das Netz dazwischen, bleibt ein Entwurf ohne
  Fotos, den ein zweiter Versuch löscht.
- **Oberfläche**: „Löschen“ im Fenster des Scheins, abgesetzt unter einer
  Linie (nicht neben „Weiterbearbeiten“); rote Rückfrage mit Kunde, Tag,
  Stunden, Materialposten und Fotos, „Endgültig löschen“. Verwerfen bleibt
  der umkehrbare Weg.
- **„Stunden ohne Buchung“**: ohne Befund steht unter dem Titel eine Zeile —
  Ergebnis, Prüfbasis, daneben „Weiter zurück prüfen“ (am Handy darunter).
  Kein eigener Leerzustand mehr. Gemessen am Schreibtisch: rund 300 → 144 px.
  Die Karte bleibt, weil sie die Handlung „weiter zurück prüfen“ trägt.

**Prüfungen.** `tests/supabase/scheinEntwurfLoeschen.test.ts` (neu, 9:
Entwurf und verworfener samt Positionen, Fotozeilen und Dateien; Führung
jeden; Kollege und fremder Betrieb nicht, die Datei bleibt; Beleg nie;
`schein_loeschbar`), `belege.test.ts` und `regeln.test.ts` auf die neue
Regel umgestellt, `scheinEntwurfLoeschen.spec.ts` (neu, 3 Browserwege mit
echtem Speicher), `WorkSheetsListView.test.tsx` (+5). Gegenprobe: ohne die
Migration und mit `src` von `main` alle neuen Prüfungen rot.

**E43 — App-Zeichen mit runden Ecken (04.11.2026).** Auftrag mit Bild:
„verwende das hier als Favicon und App-Icon“, auf Rückfrage: „ich möchte
einfach, dass die Ecken genauso abgerundet sind“. Das Bild ist pixelgenau
das Zeichen seit 03.11. (Form, Petrol `#0F4552`), nur mit runden,
durchsichtigen Ecken; am Bild gemessen Radius 12 von 64.

- **Rund**: Favicon (SVG, 16/32/64 px) und die Manifest-Icons „any“
  (192/512 px) — sie zeigt das System so, wie sie geliefert werden (Reiter,
  Lesezeichen, installierte App am Schreibtisch, Benachrichtigung). Die
  Manifest-Icons tragen dafür das Zeichen in der Größe des Favicons, wie im
  Bild; die Verkleinerung auf 92 % war nur für den Android-Schutzkreis nötig.
- **Randlos und deckend bleiben** das Apple-Touch-Icon (iOS füllt
  durchsichtige Ecken schwarz und rundet selbst) und das maskierbare
  Android-Icon (der Starter schneidet seine Form selbst aus, das Zeichen
  bleibt im Schutzkreis). Auf dem Handy-Startbildschirm ist das Icon damit
  ebenfalls rund — in der Form des Systems.
- Erzeugt wie bisher aus `marke/zeichen.svg` mit `marke/rastern.mjs`.

**Prüfungen.** `appZeichen.test.ts`: runde Ecken je Größe (Ecke durchsichtig,
Kantenmitte deckend weiß, fehlende Deckung = vier Viertelkreis-Zwickel mit
Radius 12/64, innerhalb deckend), Apple-Touch- und maskierbares Icon randlos
und deckend. Gegenprobe mit den Bildern davor: 6 rot.

**E44 — Impressum und Datenschutz in der Linie „Lot“ (04.11.2026).**
Auftrag: „die Seiten für die Rechtstexte sind noch nicht in der neuen
Designlinie, passe diese an.“ Beide Seiten standen noch in der Form vor der
Linie: dunkles Band oben, ein gerundeter Kasten für „Entwurf“, Überschrift
in 600, kein Raster, kein Blatt.

- **Arbeitsfläche wie in der App**: das Raster (`hauptflaeche`) über die
  ganze Seite, der Text auf einem Blatt in Lesebreite (höchstens 32 Zellen),
  jede Kante auf einer Rasterlinie — derselbe Taktgeber wie im `Layout`
  (`taktHalten`). Mittig gesetzt, der linke Abstand in ganzen Zellen
  (`round(down, …, 24px)`), dazu das Polster von `.inhalt`, das an jeder
  Breite dem Versatz des Rasters entspricht.
- **Seitenkopf wie auf jeder Seite** (`PageHeader`): Ortszeile
  „Rechtliches“, Titel, „Stand: …“ als Meta (vorher am Fuß).
- **Marke hell auf dem Raster** mit „Zur App“ daneben, wie auf der Bühne der
  Anmeldung — ohne Seitenleiste gibt es keine dunkle Fläche, die sie trägt.
- **„Entwurf“ als Hinweiszeile** (Stufe Achtung) statt gerundetem Kasten.
- **Unterauftragsverarbeiter als Zeilen mit Linie** statt farbigem
  Randstrich.
- Am Fuß führen „Datenschutz · Impressum“ zur jeweils anderen Seite.
- Die Texte selbst sind unverändert, Wort für Wort.

**Prüfungen.** `Recht.test.tsx` (+2: Aufbau der Linie, Liste der
Verarbeiter), `rechtLot.spec.ts` (neu, 2: je Seite in drei Breiten Raster,
ein Blatt mit allen Kanten auf Linien, kein seitliches Rollen, kein dunkles
Band, Ecke 0, Überschriften in 400/500, Entwurf, „Zur App“, Weg zur anderen
Seite). Gegenprobe mit dem Rahmen davor: alle vier rot.

**E45 — Rechtstexte im globalen Admin (04.11.2026).** Auftrag: „wäre es
möglich im globalen Admin eine Seite zu machen, in welcher man die
Rechtstexte direkt anpassen kann? … denke dir das fertig“; nach dem Konzept:
„ja setze das alles direkt um. Den AVV setze vorerst auf die Roadmap.“

- **Fassungen in der Datenbank** (`rechtstexte`, Migration
  `20261104130000_rechtstexte.sql`): drei Arten — Betreiberangaben,
  Impressum, Datenschutzerklärung (mit Unterauftragsverarbeitern). Ein
  Entwurf je Art; „Veröffentlichen“ macht ihn zur nächsten nummerierten
  Fassung. Eine Fassung ändert sich nie wieder und lässt sich nicht löschen
  (Auslöser), damit belegbar bleibt, welcher Text wann galt.
- **Fassung 1** ist der Text, der bis dahin im Quelltext stand, Wort für
  Wort (gesetzt verglichen mit der Live-Seite: gleich), mit Stand 05.10.2026;
  `src/features/recht/betreiber.ts` entfällt.
- **Schreibweise ohne HTML** (`rechtstext.ts`): Absätze, Aufzählung, fett,
  Verweise nur auf https:/mailto:/tel:, Platzhalter für die
  Betreiberangaben und die Liste der Verarbeiter. Gesetzt wird von React als
  Text — ein Rechtstext kann keinen Schadcode in eine öffentliche Seite
  tragen.
- **Rechte**: schreiben nur das Plattformkonto mit zweitem Faktor über drei
  Funktionen; die Tabelle samt Entwürfen liest nur die Plattform; die
  geltenden Fassungen liest jeder über `rechtstexte_aktuell()` — auch ohne
  Anmeldung, ohne dass `anon` ein Recht auf eine Tabelle bekommt.
- **„Rechtlich geprüft von …“** nur ohne offene Angaben; das Band „Entwurf“
  steht, solange die Fassung ungeprüft ist oder eine Angabe offen ist.
  „Stand“ ist die jüngere von Text und Betreiberangaben.
- **Hinweise**: neue Unterauftragsverarbeiter (Art. 28 Abs. 2 DSGVO) für
  Geschäftsführung und Administration jedes Betriebs bis „Zur Kenntnis
  genommen“ (`companies.verarbeiter_kenntnis_am`, ohne Person); eine
  geänderte Datenschutzerklärung auf Wahl für alle, einmal je Gerät.
- **Kein Ersatztext im Quelltext**: antwortet die Datenbank nicht, sagt die
  Seite das und lädt auf Wunsch neu.
- **AV-Vertrag**: Roadmap (Stand 11.2, Punkt 8).

**Prüfungen.** `tests/supabase/rechtstexte.test.ts` (neu, 11), Wächter
`mandantenTrennung` (die öffentliche Lesefunktion benannt und begründet),
`netzFrist`; `tests/unit/rechtstext.test.ts` (neu, 11),
`Recht.test.tsx` (umgestellt, 9), `Rechtstexte.test.tsx` (neu, 9),
`RechtstextHinweis.test.tsx` (neu, 7: dazu eine leere Antwort ohne Absturz), `rechtstexte.spec.ts` (neu, 1
Browserweg: Plattform → Seiten → Leitung → Monteur). Gegenprobe: ohne die
Migration und den neuen Code ist jede davon rot.

**E46 — Material anfordern: „In die Liste“ statt „Zur Anforderung“ (04.11.2026).**
Auftrag mit Bildschirmfoto: „das ‚Zur Anforderung‘ wird schlecht
umgebrochen. Das soll besser gelöst werden. Eventuell anders formulieren?“
Neben −, Menge und + blieben am Telefon rund 120 px; der Knopf brauchte 156.
Weil am `body` jedes Wort brechen darf (`overflow-wrap: anywhere`), stand
dort „Zur / Anforderun / g“ — gemessen bis 430 px Breite, bei 320 px auf
fünf Zeilen.

- **„In die Liste“**: so heißt schon der Knopf für einen Artikel, der nicht
  im Katalog steht, und die Leiste darunter sagt „Liste leeren“. Es sagt
  ebenso wie vorher, dass noch nichts abgeschickt ist (M36) — abgeschickt
  wird erst mit „Anforderung (n) abschicken“.
- **Der Knopf bricht nie im Wort** (`whitespace-nowrap`). Passt er nicht
  neben die Menge (am Handy bis etwa 360 px), steht er in einer eigenen
  Zeile darunter und nimmt die volle Breite; ab 375 px steht er daneben.
- **Was schon in der Liste liegt, steht unter dem Knopf** („3 m in der
  Liste“) statt als „×3“ vor dem Minus. Dort kostete die Zahl genau die
  Breite, mit der der Knopf noch daneben passt: beim ersten Tipp sprang er in
  die nächste Zeile, und der zweite Tipp traf das Plus. Darunter wächst die
  Zeile nur nach unten; am Telefon bleibt der Knopf liegen, am Tablet rückt
  er höchstens um ein Viertel seiner Höhe.
- **Leer und gefüllt gleich breit.** Gefüllt (schon in der Liste) hat der
  Knopf keine Linie und halbfette Schrift und war so 0,84 px schmaler; an
  einer Breite genau an der Grenze entschiede das, ob er neben der Menge
  oder darunter steht. Eine transparente Linie und eine unsichtbare
  halbfette Zeile (`knopf-gleich-breit`, `lot-material.css`) halten die
  Breite fest.
- **Die Zahl kommt aus der Liste selbst.** Vorher zählte jedes Feld für
  sich: nach „Liste leeren“ und nach dem Abschicken stand „×3“ weiter da,
  nach einem Neustart fehlte es, obwohl die Liste zurückkam.

**Prüfungen.** `OrderView.test.tsx` (+4: Name, Zahl aus der Liste, „Liste
leeren“, Neustart, Abschicken, fremde Einträge zählen nicht; 23 Abfragen
umgestellt), `materialAnfordern.spec.ts` (+1 Browserweg: auf 320–1.280 px
einzeilig, in der Zeile, gefüllt so breit wie leer, und nach drei Tipps an
derselben Stelle; läuft auch im iPhone-Profil; gemessen wird erst, wenn das
Blatt nach dem Breitenwechsel auf dem Raster eingerastet ist). Gegenproben: nur umbenannt im alten Aufbau → bei 320 px
zwei Textzeilen, rot; Zahl wieder vor dem Minus → bei 375 px trifft der
nächste Tipp nicht, rot; ohne transparente Linie und halbfette Breite → bei
375 px gefüllt 0,84 px schmaler, rot.

**E47 — Die Warenkorb-Leiste als Blatt (05.11.2026).** Auftrag mit
Bildschirmfoto: „Material anfordern, Desktop: den unten klebenden Banner bei
einer Bestellung finde ich noch nicht passend zum neuen Design.“ Zwei
Varianten in der Vorschau vorgelegt, freigegeben Variante A.

Die Leiste stammte aus dem ersten Entwurf der Linie (v2): gerundet (12 px),
Petrol-Rahmen, Polster 12/20 px, Kanten neben dem Raster — älter als „Raster
und Blätter“ (E33).

- **Ab dem Tablet ein Blatt**: eckig, die Linie rundum wie bei jedem Blatt
  gezeichnet (oben und links innen, rechts und unten außen auf der
  Rasterlinie, `--border-strong`), dieselben Kanten wie die Blätter darüber,
  Text eine Zelle vom Rand. Jede Textzeile eine Zelle hoch, innen eine halbe
  Zelle Abstand: 72 px, mit umbrechendem Titel oder Fehlerzeile 96 px. In
  Ruhe liegt sie damit mit beiden Kanten auf Linien.
- **Nicht im Taktgeber.** Er misst mit `getBoundingClientRect`; bei einer
  klebenden Leiste wäre das ihre Lage auf dem Bildschirm, nicht ihr Platz.
  Die Maße sind deshalb von sich aus ganze Zellen.
- **„noch nicht abgeschickt“ ist ein Zustand** — das Zeichen für „offen“
  davor, wie in den Listen.
- **Am Handy** ein Balken mit Linie oben wie die Aktionsleiste der
  Formulare (`--border` statt Petrol), jetzt von Rand zu Rand: Die
  Inhaltsspalte misst seit E33 ganze Zellen, und der Balken endete bei
  390 px 22 px vor dem rechten Rand. Wie weit es von der Spalte bis zum Rand
  der Arbeitsfläche ist, gibt jetzt der Taktgeber an (`--takt-auslauf`);
  `100vw` hätte eine klassische Bildlaufleiste mitgezählt und die Seite
  seitlich rollen lassen, `calc()` schließt die Linie aus.

**Prüfungen.** `materialAnfordern.spec.ts` (+1 Browserweg: bei 834 und
1.280 px Kanten wie der Katalog, eckig, Polster 24, ganze Zellen hoch,
Linien wie das Blatt, in Ruhe beide Kanten auf Rasterlinien; bei 390 px von
Rand zu Rand mit der Linie der Aktionsleiste), `OrderView.test.tsx`
(Zustand „offen“), `takt.test.ts` (+1: `--takt-auslauf`). Gegenprobe mit dem bisherigen Stylesheet: rot (834 px:
Ecke 12 px).

**E48 — Die Plattform in der Linie „Lot“ (05.11.2026).** Auftrag: „das
globale Admin-Konto entspricht noch nicht der aktuellen Designlinie“ —
„starte direkt“. Die Plattform hatte ein dunkles Band oben, Reiter darunter,
die Seite weiß, eine grau gefüllte Spalte: der Stand vor „Raster und
Blätter“ (E33).

- **Dieselbe Hülle wie die App** (`PlattformHuelle`): am Tablet und
  Schreibtisch die dunkle Seitenleiste — oben die Marke mit „Plattform“, die
  fünf Bereiche mit Symbol (Tablet Kurzname), das Lot am Seil, unten „Mein
  Konto“, wer angemeldet ist, „Abmelden“; am Handy die Kopfzeile mit „Mein
  Konto“ und die Reiterleiste mit den fünf Bereichen. Das `Layout` der App
  gehört zu einem Betrieb; die Plattform nimmt seine Klassen und
  Mechanismen (Raster mit Taktgeber, `--reiter-hoehe`), nicht das Layout.
- **Das Lot fährt am Bereich**, nicht am Pfad: die Plattform wechselt ihre
  Bereiche auf einer Adresse, damit Formulare und einmalige Zugangsdaten
  den Wechsel überleben (`SeilLotFuer`).
- **Inhalt auf dem Raster**: Listen und Formulare sind Blätter wie überall;
  Suche und Filter der Betriebe als Listenleiste im Blatt; die
  Kontextspalte mit Eckmarken wie in den Akten, zwölf Zellen breit (Tablet
  zehn), vom Taktgeber auf die Linien gesetzt; „Neu laden“ beim
  Fehlerprotokoll als Aktion des Seitenkopfs; am Handy die Hauptaktion im
  Daumenbereich wie in der App.
- **„Mein Konto“ mit Darstellung** (hell/dunkel) — am Handy und Tablet gibt
  es sonst keinen Ort dafür.
- **Keine Verweise auf Impressum und Datenschutz** in der Leiste: das
  Plattformkonto wird von jeder anderen Adresse auf `/plattform`
  zurückgeführt; beide Texte pflegt es unter „Rechtstexte“.

**Dabei gefunden und behoben: verborgene Reiter blieben sichtbar.** Der
Taktgeber gab dem Block eines Blatts `display: flow-root` als Inline-Stil
(damit der Abstand darüber nicht durchfällt). Ein Inline-Stil schlägt aber
`[hidden]`: in Kundenakte und Baustellenakte stand ein Reiter, der einmal
offen war, nach dem Wechsel weiter unter dem neuen (seit E33). Jetzt setzt
der Taktgeber die Klasse `takt-eigener-rand`, die nur greift, solange der
Block nicht verborgen ist.

**Prüfungen.** `PlattformLot.test.tsx` (+2: Leiste, aktiver Punkt,
Anmeldung, Reiterleiste, keine toten Verweise; Abmelden), `takt.test.ts`
(Klasse statt Inline-Stil, Kontextspalte im Taktgeber),
`plattform.spec.ts` (+1 Browserweg: in 1.280, 834 und 390 px Leiste bzw.
Reiter, Raster, Blatt mit Linie und eckig auf den Linien, Kontextspalte
ohne Fläche mit Eckmarken auf einer Linie, nichts rollt seitlich, „Mein
Konto“ erreichbar, das Lot neben dem aktiven Bereich), `akten.spec.ts` (+1:
nach jedem Reiterwechsel genau ein Reiter sichtbar). Gegenproben: mit der
alten Plattform rot (keine Arbeitsfläche), mit dem alten Taktgeber rot
(zwei Reiter sichtbar).

*Nachtrag zu E48:* die Reiter der Plattform am Handy zeigen den Kurznamen
(„Fehler“), vorgelesen wird der volle („Fehlerprotokoll“) wie in der
Seitenleiste — der volle enthält den sichtbaren (WCAG 2.5.3). Aufgefallen in
der CI am Telefon.

**E49 — Der Handwerksschein ohne Netz (05.11.2026).** Auftrag: „starte
direkt … stelle sicher, dass am Ende alles vollständig ohne Fehler und ohne
nicht begründete Grenzen funktioniert“. Bis hierher liefen Speichern und
Unterschreiben des Scheins als direkter Aufruf an den Server (Prüflauf
25.09.2026, P1-14): im Keller ohne Empfang ließ sich der Schein weder sichern
noch unterschreiben, und der Hinweis an den Fotos sagte das so.

- **Jeder Schreibweg des Scheins geht über das Ausgangsfach**, das die
  Zeitbuchung schon trägt: Speichern (`schein_speichern`), Unterschreiben
  (`schein_unterschreiben`), Hochladen und Entfernen eines Fotos — je ein
  Vorgang, in der Reihenfolge, in der er entstand. Mit Netz geht er sofort
  hinaus wie bisher; ohne Netz bleibt er im Gerät und geht mit dem nächsten
  Empfang (Start, `online`, Rückkehr zur App, jede Minute).
- **Nur was beim zweiten Mal dasselbe tut.** Das Fach nimmt seitdem neben
  Zeilen auch Aufrufe und Dateien, aber nur aus einer festen Liste im Sender
  (`AUFRUFE_OHNE_EMPFANG`: die beiden Funktionen des Scheins;
  `EIMER_OHNE_EMPFANG`: die Scheinfotos). `schein_speichern` schreibt den
  Entwurf unter der Kennung vom Gerät und ersetzt Zeiten, Material und Fotos
  als ganze Liste; ein Foto heißt nach seinem Inhalts-Hash. Weist die
  Datenbank ein zweites Unterschreiben ab, sieht der Sender nach: trägt der
  Schein genau diese Unterschriften (Name und Gerätezeit beider), war es die
  erste Zustellung, deren Antwort im Funkloch verloren ging — angekommen,
  nicht verloren.
- **Ein Foto hält die Unterschrift nicht auf.** Hochladen und Entfernen
  stehen je Datei in einer eigenen Gruppe; weist der Speicher ein Bild
  endgültig ab, gehen Speichern und Unterschrift desselben Scheins trotzdem
  hinaus, und die Meldung sagt, dass der Schein das Bild verzeichnet, die
  Datei aber fehlt.
- **Im Fach liegen die Bytes, nicht das Blob.** Safari (WebKit) legt ein Blob
  in einer flüchtigen Sitzung nicht in IndexedDB ab; das Foto scheiterte
  dann schon beim Vormerken. Aufgefallen im Browserweg mit WebKit am
  Telefon. Ein ArrayBuffer geht in jedem Browser hinein; Vorschau und
  Hochladen machen daraus wieder ein Bild.
- **Ein Funkloch im WLAN ist auch in Safari fehlendes Netz.** supabase-js
  reicht einen gescheiterten Aufruf von Safari als „Load failed“ durch (ältere
  Fassungen: „The Internet connection appears to be offline“). Der Sender
  kannte nur die Sätze von Chromium und Firefox, hielt das für „unklar“,
  zählte mit und verwarf den Vorgang nach fünf Läufen — am iPhone im WLAN
  ohne Internet, bei Schein, Zeitbuchung und Anforderung. Jetzt zählt zuerst
  der Stand: ohne jede Antwort ist nichts angekommen, wie auch immer der
  Browser es nennt. Sender und Scheinmaske fragen dieselbe Stelle
  (`netzfehler.ts`). Im Browserweg wird in WebKit dieses Funkloch
  nachgestellt (der Server weg, das Gerät hält sich für verbunden), weil
  WebKit unter `setOffline` nicht einmal die eigenen Bilder liest.
- **Was wartet, steht da.** In der Scheinliste der Abschnitt „Noch nicht
  gesendet“ (sonst legte der Monteur denselben Schein ein zweites Mal an);
  ein wartender Entwurf öffnet von dort auch ohne Netz, die Baustelle kommt
  dann aus dem Entwurf. Im Schein steht am Bild „Wartet auf Netz“; nach dem
  Speichern und Unterschreiben „ohne Verbindung gespeichert, wird
  automatisch gesendet“. Wird ein vorgemerkter Stand endgültig abgewiesen
  (meist: derselbe Entwurf wurde inzwischen anderswo unterschrieben oder
  verworfen), nennt die Meldung den Grund des Servers.
- **Keine Datenbankänderung.** Die Prüfsumme setzt der Server wie bisher
  beim Eintreffen der Unterschrift; die Gerätezeit in der Unterschrift bleibt
  die des Augenblicks vor dem Kunden.

**Grenzen mit Grund.** (1) Den Schein ganz ohne Netz neu beginnen geht nicht:
Baustelle, Kunde und Adresse kommen vom Server; ein Vorrat aller Baustellen
und Kunden im Browser läge auf geteilten Tablets unverschlüsselt
(Datenschutz). Wer den Schein mit Netz öffnet, schreibt und unterschreibt ihn
danach ohne. (2) Wird derselbe Entwurf auf einem anderen Gerät inzwischen
unterschrieben oder verworfen, nimmt der Server den vorgemerkten Stand nicht
mehr an (fachlich und rechtlich: ein unterschriebener Schein ist ein
eingefrorener Beleg) — die App meldet es mit Grund. (3) In einem privaten
Fenster kann der Browser nichts vormerken; dort bleibt es beim direkten Weg
(Gerät).

**Prüfungen.** `scheinSender.test.ts` (neu: feste Liste, Einordnung von
Aufruf und Speicher, zweites Zustellen derselben Unterschrift),
`scheinVorgemerkt.test.ts` (neu: wartende Scheine zusammensetzen, Entwurf
aus dem Gerät), `WorkSheetView.test.tsx` (+7: „wird gesendet“ beim
Unterschreiben und Entwurf, wartendes Foto, Entwurf aus dem Gerät öffnen und
unterschreiben, Meldung ohne Netz, gleich geblieben mit Netz; der Hinweis
P1-14 neu), `WorkSheetsListView.test.tsx` (+3), `PremiumRueckmeldung.test.tsx`
(+2 Meldungen), `ausgangsfachNaht.test.ts` (+1), `supabaseSender.test.ts` (+2: Safari,
ohne Antwort; gleich geblieben mit Code und mit Antwort), gegen die echte Datenbank
`scheinOhneEmpfang.test.ts` (neu, 4: Funkloch → Reihenfolge → angekommen mit
Foto und Prüfsumme — mit einem Lager, das wie WebKit kein Blob nimmt;
zweites Zustellen; Konflikt gemeldet; ohne Fach direkt)
und im Browser `scheinUnterschreiben.spec.ts` (+1: Netz wirklich weg, Zeit,
Foto und Unterschriften, „Noch nicht gesendet“, Netz zurück, angekommen).
Gegenproben: mit dem Stand von `main` alle neuen Prüfungen rot.

**E50 — Das Änderungsprotokoll der Zeitbuchungen (05.11.2026).** Auftrag:
„für das Änderungsprotokoll: es sollte über einen Klick sichtbar sein und
nicht generell auf der Seite, damit nicht zu viel Text entsteht.“ An einer
Buchung stand bis hierher nur, wer sie zuletzt geändert hat; was vorher
dastand, wer davor geändert hatte und dass es eine gelöschte Buchung gab,
sah niemand. Für eine Arbeitszeitaufzeichnung (§ 26 AZG), auf die sich Lohn,
Überstunden und Rechnungen stützen, war das zu wenig.

- **Die Datenbank schreibt mit** (`zeitbuchung_verlauf`, Trigger an
  `time_entries`): je Anlegen, Ändern und Löschen eine Zeile — wer (Kennung
  und Name), wann, und was: beim Anlegen und Löschen der ganze Stand, beim
  Ändern je Spalte alt und neu. Ohne Zeitstempel, ohne den
  Bearbeitungsvermerk und ohne das, was die Datenbank selbst rechnet
  (Stunden, Satz). Ein Speichern ohne Änderung schreibt nichts.
- **Niemand kann es glätten.** Die App hat keinen Weg hinein; es gibt keine
  Regel und kein Recht zum Anlegen, Ändern oder Löschen, auch nicht für die
  Führung. Lesen dürfen genau die, die die Buchung lesen: die Person,
  Buchhaltung und Führung.
- **Über einen Klick, zugeklappt:** im Formular einer Buchung „Verlauf dieser
  Buchung“, in der Zeiterfassung unter der Liste „Änderungsprotokoll deiner
  Buchungen“ (derselbe Zeitraum wie die Liste), im Fenster einer Person im
  Büro „Änderungsprotokoll des Monats“ — dort auch gelöschte Buchungen.
  Geladen wird erst beim Aufklappen. Gelesen wird es als Verlauf: „Geändert
  von Erna Beispiel · 05.11.2026, 14:03 · Ende 15:00 → 14:00“.
- **Datenschutz:** in der Datenauskunft der Person (der Verlauf ihrer
  Buchungen; als Bearbeiter die Anzahl ihrer Änderungen an fremden), bei
  ihrer Löschung mit den Buchungen aufbewahrt (§ 132 BAO), im Datenauszug des
  Betriebs. Beim Löschen eines ganzen Betriebs geht es mit. Der Support sieht
  es nicht (wie die Buchungen) und schreibt nicht hinein.
- **Der Dienstschlüssel schreibt nicht mit** — wie bei den Lagerbewegungen.
  Mit ihm laufen nur der Rücklauf einer Sicherung, das Löschen eines ganzen
  Betriebs und die Prüfungen; kein Ablauf der App ändert Buchungen mit ihm.
  Der Rücklauf bringt das Protokoll aus der Sicherung mit, eigene Zeilen
  stünden doppelt darin. Deshalb auch keine Zählnummer als Schlüssel: der
  Rücklauf spielt die Zeilen mit ihrer Kennung zurück; die Reihenfolge trägt
  die Uhrzeit des Schreibens. Aufgefallen ist beides im Rücklauf-Test.

**Grenze mit Grund.** Was vor dem 05.11.2026 geändert wurde, weiß niemand
mehr (Altdaten). Die erste Änderung einer älteren Buchung zeigt den Stand
davor als alten Wert, und die Ansicht sagt, seit wann aufgezeichnet wird.

**Prüfungen.** `zeitbuchungVerlauf.test.ts` (neu, echte Datenbank: Anlegen,
Ändern nur mit Geändertem, Speichern ohne Änderung schreibt nichts, Löschen;
der Dienstschlüssel schreibt nichts; wer liest; niemand schreibt; ein Konto bleibt löschbar; Datenauskunft und
Löschung), `verlaufText.test.ts` und `Aenderungsprotokoll.test.tsx` (neu: in
Worten, zu bis zum Klick, Fehler wiederholbar ohne ein Formular abzuschicken),
`zeitVerlauf.spec.ts` (neu, Browser: das Büro ändert und löscht, das Fenster
der Person und die Zeiterfassung des Monteurs zeigen es auf Klick),
`personLoeschen.test.ts` (das Protokoll unter „aufbewahren“),
`mandantenTrennung.test.ts` (Buchhaltung und Spitze lesen es),
`schema.test.ts` (Riegel gegen den Support) und `ruecklauf.test.ts`
(Sicherung samt Protokoll zurückgespielt, nichts doppelt). Gegenprobe:
ohne Migration und Bausteine rot.

**E51 — SHK-Ausbau: Zielumfang, die vier Vorentscheidungen und was am Plan nicht stimmte (06.11.2026).**
Auftrag: „Starte direkt mit der Umsetzung aller empfohlenen Punkte und
vollständigen Integration“ zur geprüften Bauplanung vom 06.11.2026
(84 Katalogpunkte A01–G11 plus N01 frei konfigurierbare Zeitfelder und N02
durchgängig schaltbare Fachmodule). Plan, Bestandsmatrix, Abnahmematrix, Aktionsinventar und Nachweisregister liegen unter
`docs/shk-ausbau/`.

- **Zielumfang: der empfohlene** (Bauplanung 1.1). „Behalten“ und
  „Integrieren“ werden gebaut, „Optional“ wird gebaut und ist je Betrieb
  schaltbar, bei „Ändern“ und „Ersetzen“ gilt der empfohlene Inhalt (Z01,
  Z04, B04, B09, U01/U02, U05, A01/A02). Die Originalfassungen dieser
  Punkte sind nicht beauftragt; kein Punkt verschwindet still — jeder steht
  mit seinem Stand in `docs/shk-ausbau/bestandsmatrix.md`.
- **V1 — Kunden und Baustellen bleiben Kern.** Abschaltbar werden ihre
  Zusatzfähigkeiten (Aufgaben, Mängel, Objekte, Meilensteine, Board …).
  Rechnungen, Planung, Zeit, Scheine und Wartung beziehen sich auf
  Baustellen; ohne sie gäbe es nichts, worauf sie sich beziehen.
- **V2 — Die Zeiterfassung wird abschaltbar, mit Folgenvorschau.** Ausdrücklich
  verlangt (N02). Historie, Exporte und das Änderungsprotokoll (E50) bleiben
  lesbar; die Regie aus Stunden fällt weg, die Regie aus dem Schein bleibt.
  Eigenes Paket, weil es Mitarbeiterübersicht, Monatsbilanzen, Lohn-Export,
  Nachkalkulation und Abrechnung berührt.
- **V3 — Der Server prüft das Modul bei NEUEN Fachbefehlen.** Über eine
  `stable`-Hilfsfunktion, einmal je Abfrage gerechnet wie `app.lesebetrieb()`.
  Bestehende Schreibwege bleiben, wie sie sind. Das kehrt die Entscheidung im
  Kopf von `src/lib/module.ts` („ein abgeschaltetes Modul ist keine
  Sicherheitsgrenze“) für neue Befehle um; der Grund dort (eine
  Leseoperation je Schreibvorgang) trägt bei einer Hilfsfunktion, die je
  Abfrage einmal liest, nicht mehr. Die Hilfsfunktion entsteht mit dem
  ersten Befehl, der sie braucht.
- **V4 — Abrechnungsart und Nummernvorsatz stehen bei der Freigabe einer
  Angebotsfassung zum Versand fest.** Ohne beides gibt es keinen
  Annahme-Link (A06): `angebot_annehmen` verlangt sie, und ein Kunde wählt
  sie nicht.
- **U05 — nachweisbedürftige Ansichten, abschließend:** das Öffnen einer
  Angebotsfassung über ihren Annahme-Link (A06) und einer
  Wartungsvereinbarung über ihren Unterschrifts-Link (W05) durch den
  Empfänger. Dazu kommen die Versandereignisse (M14). Eine allgemeine
  Nutzungsverfolgung gibt es nicht; die Supportzugriffe sind schon heute
  protokolliert (`support_zugriffe`).

**Was an der Bauplanung nicht stimmt** (am Code `b1e00cc` geprüft):

- **Die Modulverwaltung gehört allein dem Administrator**, nicht
  „Geschäftsführung und Administrator“ (Bauplanung 0.5). Belege:
  `app.firmeneinstellungen_geschuetzt()` in
  `20260912100000_dienstschluessel.sql` (`hat_rolle(array['Administrator'])`),
  `NUR_ADMIN` für den Unterreiter „Module“ in `src/app/navigation.ts`, die
  Prüfung „gibt die MODULE allein der Administration“ in
  `navigation-routen.test.ts`. Veraltet sind dagegen der Kommentar in
  `App.tsx` („die Module (Geschäftsführung)“) und der Hilfetext der Seite
  „Module“ („ändern darf sie nur die Geschäftsführung“) — der Text sagte
  der Geschäftsführung etwas zu, das der Server ablehnt. Beides wird mit
  dem Modulregister berichtigt. **Daraus folgt für N01:** Die freien
  Zeitfelder konfigurieren Geschäftsführung und Administrator (wie im
  Masterprompt verlangt); das ist ein eigenes, serverseitig geprüftes Recht
  wie die Sätze des Betriebs, nicht dasselbe wie die Modulverwaltung.
- Die Anlagen der Bauplanung (Masterprompt mit den Einzelspezifikationen,
  Produktentscheidungen und Modulzuordnung als JSON, Produktbewertung) lagen
  dem Auftrag nicht bei. Grundlage sind Teil 5 und Anhang A der geprüften
  Fassung; wo sie für einen Punkt nicht reichen, steht das beim Paket.

**E52 — Das Modulregister mit Unterfähigkeiten und Folgen (06.11.2026).**
SHK-Ausbau, Paket M01a (N02). Der Ausbau bringt Dutzende Teile, die ein
Betrieb einzeln schalten können soll (Aufgaben, Mängel, Lagerorte, Scan,
Fahrtenbuch …). Als eigene Module wären das sechzig Schalter ohne Ordnung.

- **Unterfähigkeiten unter ihrem Modul.** Kennung mit Punkt
  (`material.lagerorte`), gespeichert im selben Feld `companies.modules` wie
  die Module. Damit schützt sie derselbe Server-Trigger, ohne Migration. Eine
  Unterfähigkeit hat ihren eigenen Standard, gilt nur mit ihrem Modul, kann
  von weiteren Schaltern abhängen und kommt mit dem Modul so zurück, wie sie
  festgelegt war. Die Seite „Module“ zeigt sie als Zeile direkt unter ihrem
  Modul („Teil von …“). Das Register trägt noch keine: Die ersten kommen mit
  den Paketen, die sie bauen. `useModul` nimmt beide Arten von Kennungen.
- **Folgen beim Abschalten.** Ein Eintrag kann nennen, was beim Abschalten
  über das Verschwinden hinaus geschieht und sich nicht zurückholen lässt.
  Die Rückfrage sagt das vorher, auch für alles, was mitgeht. Anlass war ein
  stiller Widerspruch: Die Seite versprach „vorhandene Daten bleiben
  unangetastet“, der Server beendet beim Abschalten der Einsatzplanung aber
  die Kalender-Abos des ganzen Plans (`companies_gesamtplan_abo`). Jetzt
  fragt die Seite dort nach und sagt es. Der Satz über die Daten passt sich
  an: „Alle übrigen Daten bleiben erhalten“, wo etwas nicht zurückkommt.
- **Berichtigt:** Die Hilfe der Seite sagte, die Liste ändere „nur die
  Geschäftsführung“; der Server lässt nur den Administrator (E51). Ebenso
  der Kommentar in `App.tsx` und der zum Feld `modules` (gespeichert sind
  die berührten Schalter, nicht nur die Abweichungen).
- **Gleich geblieben:** dieselben neun Module mit denselben Kennungen,
  Standards und Abhängigkeiten; jede Rolle hat dieselbe Navigation; wer
  schalten darf, wie bisher. Die Serverprüfung neuer Befehle (V3) entsteht
  mit dem ersten Befehl, der sie braucht.

**Prüfungen.**
- `modulRegister.test.ts` (neu): Erhaltung von Register und Navigation je
  Rolle, Folgen der Einsatzplanung, Unterfähigkeiten am Prüfregister.
- `ModulesViewUnter.test.tsx` (neu): Zeilen unter dem Modul, gehen mit ihm
  aus, Speichern unter der Kennung.
- `ModulesView.test.tsx`: Rückfrage der Einsatzplanung, Hilfe nennt den
  Administrator.

Gegenprobe: ohne die Änderung 15 rot; die drei Erhaltungsprüfungen sind vor
und nach der Änderung grün, wie es sein soll.

**E53 — Das Änderungsjournal der Geschäftsobjekte (06.11.2026).** SHK-Ausbau,
Paket M01b (U04, Integrationskern K06). An Kunden, Baustellen, Angeboten,
Rechnungen, Zahlungen, Wartungen und Benutzern stand höchstens, wann sie
zuletzt geändert wurden — nicht von wem, nicht was vorher dastand, nicht dass
es ein gelöschtes Objekt gab. Für die Zeitbuchungen gibt es das seit E50; das
Journal ist dieselbe Idee für die übrigen Akten.

- **Geschrieben nur von Triggern** an den sieben Tabellen, je Anlegen,
  Ändern, Löschen: wer (Kennung und Name), wann, beim Ändern je Spalte alt
  und neu; beim Anlegen und Löschen nur dass (eine Kopie jedes Kunden mit
  Anschrift wäre Datenhaltung ohne Zweck), mit der Bezeichnung des Objekts.
  Niemand hat ein Recht zum Schreiben, Ändern oder Löschen. Ausgenommen sind
  Kennungen, Zeitstempel, was die Datenbank selbst rechnet und was ein
  vorhandener Verlauf festhält (Liste und Grund im Trigger). „Leer bleibt
  leer“: aus `null` wird `""` ist keine Änderung.
- **Vorhandene Verläufe werden mitgelesen, nicht kopiert:** Mahnungen,
  Wartungsausführungen, Kontoumstellungen, Anpassungen des Urlaubsanspruchs
  stehen in derselben Ansicht (Sicht `objekt_verlauf` mit den Rechten des
  Lesers). Das E50-Protokoll der Zeitbuchungen bleibt, wo es ist.
- **Lesen:** nie der Mitarbeiter, nie der Support, je Objekt nur, wer das
  Objekt selbst sieht; die Stammdaten der Belegschaft nur die Spitze;
  Zahlungen über ihre Rechnung mit der Regel der Zahlungen (Buchhaltung und
  Spitze) — auch eine gelöschte Zahlung, denn genau dann wird nachgesehen.
  Gelöschte übrige Objekte sieht nur die Spitze.
- **Anzeige:** „Änderungsverlauf“ zugeklappt an der Akte, geladen erst beim
  Aufklappen, seitenweise mit „Ältere Einträge laden“ (Kundendaten,
  Baustelle unter „Verlauf der Baustelle“, Angebot, Rechnung samt Zahlungen
  und Mahnungen, Wartung, Benutzerakte nur für die Spitze). „Änderungsverlauf“
  statt „Verlauf“, weil Angebot und Baustelle schon einen Verlauf zeigen.
- **Nicht protokolliert wird**, was ohne angemeldete Person geschieht
  (Dienstschlüssel, Rücklauf, Migrationen, Skripte): niemand, dem es
  zuzuschreiben wäre. Der Support im Einblick „mitarbeiten“ steht als
  „Support (Name)“ darin; deshalb trägt das Journal den Riegel
  `support_schreibt_nicht` und nicht `support_niemals`.
- **Datenschutz:** Wird ein Kunde gelöscht, verlieren seine Journalzeilen
  Werte und Namen (Art. 17), wer wann geändert hat, bleibt (Art. 5 Abs. 2).
  Bleibt er wegen Belegen (Löschung einer Person), gehen genau die Werte, die
  auch am Bestand gehen. Die Datenauskunft des Kunden zeigt sein Journal ohne
  Bearbeiternamen; die eines Mitarbeiters den Verlauf seiner Stammdaten und
  die Zahl seiner Änderungen. Der Verlauf der Stammdaten bleibt bei der
  Löschung einer Person aufbewahrt (§ 132 BAO, wie E50).
- **Seit wann:** ab dem 06.11.2026; die Ansicht sagt es.

**Prüfungen.** `aenderungsjournal.test.ts` (neu, echte Datenbank, 19:
Schreiben je Tabelle, nichts ohne Änderung, nichts mit Dienstschlüssel oder
ohne Anmeldung, niemand schreibt über die API, Lesen je Rolle, fremder
Betrieb, Support, gelöschte Zahlung für die Buchhaltung, Sicht = Quellen,
Kundenlöschung, Datenauskunft, jede Spalte benannt oder ausgenommen),
`objektVerlaufText.test.ts`, `objektVerlaufAbfrage.test.ts`,
`ObjektVerlauf.test.tsx`, `objektVerlauf.spec.ts` (Browser), dazu
`mandantenTrennung.test.ts`, `personLoeschen.test.ts`, `ruecklauf.test.ts`.
Gegenprobe: ohne Migration 22 rot und der Browserweg rot; ohne die Regel für
gelöschte Zahlungen der eigene Fall rot.

**E54 — Der Papierkorb für Entwürfe (06.11.2026).** SHK-Ausbau, Paket M01d
(U06, „Behalten“). Den Zustand „verworfen“ gab es nur am Handwerksschein.
Ein Angebotsentwurf wurde sofort hart gelöscht — und der Server hätte der
Führung erlaubt, JEDES Angebot zu löschen, auch ein angenommenes; die Grenze
„nur Entwürfe“ stand allein in der Ansicht.

- **Angebote verwerfen statt löschen.** „Verwerfen“ legt einen Entwurf in den
  Papierkorb (Stand „Verworfen“, wer und wann setzt allein die Datenbank,
  Trigger `quotes_papierkorb`). Wiederherstellen führt zurück in den Entwurf —
  außer eine andere Fassung desselben Angebots ist inzwischen angenommen
  (G15: neben einem angenommenen Auftrag steht keine offene Fassung). Ein
  verworfenes Angebot lässt sich weder speichern noch annehmen noch
  versenden; es verschwindet aus allen Listen, Zählern und Verweisen (Filter
  auf dem Server, damit Obergrenzen nicht von Verworfenem belegt werden) und
  zeigt auf seiner Seite „Im Papierkorb“ mit „Wiederherstellen“.
- **Endgültig gelöscht wird nur aus Entwurf oder Papierkorb** — durchgesetzt
  vom Server (einschränkende Regel `quotes_loeschen_nur_entwurf`), auch für die
  Spitze und direkt über die Schnittstelle. Versendete, angenommene,
  abgelehnte und ersetzte Angebote sind Belege für Baustellen und
  Fassungsketten. E42 gilt weiter: endgültig gelöscht ist endgültig.
- **Der Support löscht nicht mehr endgültig** — auch nicht mit „mitarbeiten“
  (wie E42 beim Schein); verwerfen und wiederherstellen kann er.
- **Die Seite „Papierkorb“** (Einstellungen › Papierkorb; Projektleitung,
  Geschäftsführung, Administrator; nur solange Angebote oder Handwerksscheine
  an sind): Angebote und Scheine je Art mit Anzahl, wer und wann verworfen,
  „seit N Tagen“, Wiederherstellen, endgültig löschen mit Rückfrage (beim
  Schein erst die Fotos, wie bisher), seitenweise. Der Monteur behält den
  Umschalter „Verworfene“ seiner Scheinliste.
- **Frist je Betrieb** (Karte auf der Papierkorb-Seite, nur Spitze, 1 bis 3650
  Tage, leer = keine): Was länger im Papierkorb liegt, nennt die Startseite
  der Spitze mit Weg dorthin; „Abgelaufene endgültig löschen“ leert es mit
  einem Handgriff. **Sie löscht nichts von selbst:** Fotos der Scheine lassen
  sich nur über die Speicher-Schnittstelle entfernen (ein nächtlicher Lauf
  bräuchte einen eigenen Dienstzugang), und Entwürfe zu vernichten bleibt
  eine Entscheidung eines Menschen.
- **Altdaten:** Bei vor dem 06.11.2026 verworfenen Scheinen ist der
  Zeitpunkt unbekannt; er wird nicht geraten, die Frist zählt ab diesem Tag.
- **Journal (E53):** Verwerfen und Wiederherstellen stehen als Stand
  „Entwurf → Verworfen“ und zurück, das Löschen als „Gelöscht“ mit Nummer.

**Prüfungen.** `papierkorb.test.ts` (neu, echte Datenbank, 16),
`angebotePapierkorbFilter.test.ts`, `papierkorbStartseite.test.ts`,
`PapierkorbView.test.tsx`, `papierkorb.spec.ts` (Browser: verwerfen →
Papierkorb → wiederherstellen → verwerfen → endgültig löschen), dazu
`AngebotView`, `QuotesView`, `navigation-routen`, `ruecklauf`, `schema`.
Bewusst angepasst: „Löschen“ eines Entwurfs heißt in Angebotsliste und
Angebotsseite jetzt „Verwerfen“. Gegenprobe: ohne Migration 16 rot, je
Baustein der App die eigenen Fälle rot.

**E55 — Die Wartung als Quelle einer Rechnung; der Quellenvertrag (06.11.2026).**
SHK-Ausbau, Paket M01e mit seinem ersten Nutzer W04. Ob eine Wartung schon
verrechnet ist, erkannte die Vorschau am TEXT der Rechnungszeile. Wurde die
Anlage umbenannt oder die Zeile umformuliert, schlug sie dieselbe Wartung ein
zweites Mal vor, und die Datenbank hielt nichts auf.

- **Die Wartung hängt über ihre Kennung an der Rechnung** (`invoice_coverage`,
  Art `wartung`), wie Zeiten, Material und Scheine. Die Kennung hängt an der
  übernommenen Zeile: umformulieren behält sie, entfernen nimmt sie mit
  (die Zeile ist dann wieder übernehmbar).
- **Einheit ist der Durchgang auf der Baustelle.** Eine Baustelle trägt so
  viele Durchgänge, wie dort Ausführungen stehen, und einen mehr, solange die
  Wartung auf ihr eingeplant ist; so viele gültige Rechnungen dieser Baustelle
  dürfen sie tragen. Grund: Gewöhnlich legt jeder Durchgang eine eigene
  Baustelle an, aber „Erledigt“ kann auch die Baustelle des Vorjahrs tragen —
  „einmal je Baustelle“ sperrte dann den zweiten Jahresdurchgang. Ein nur
  eingeplanter Durchgang bleibt verrechenbar. Neu abgewiesen: eine Wartung,
  die auf der Baustelle weder eingeplant noch ausgeführt ist. Storno gibt frei,
  Storno-Aufheben prüft dieselbe Einheit.
- **Befund geschlossen:** Für Scheine prüfte `rechnung_anlegen` nicht, ob die
  Kennungen zum Betrieb gehören — die Kennung eines fremden oder erfundenen
  Scheins ging auf eine eigene Rechnung. Jetzt zählt ein eigener Zweig nur
  Kennungen des eigenen Betriebs, für Scheine und Wartungen.
- **Abzug wie bisher:** Eine Wartung auf einer Teilrechnung gilt nicht als
  „Belege verbraucht“; Anzahlungs- und Teilrechnungen werden so abgezogen wie
  vorher, als die Wartung nur Text war.
- **Der Quellenvertrag** — sieben Schritte, die jede künftige Quelle braucht
  (Lieferschein, Aufmaß, Restmaterial, Sammelrechnung) — steht im Kopf der
  Migration `20261106300000_wartung_abdeckung.sql`. Menge oder Betrag je
  Zuordnung und eine Reservierung im Entwurf haben heute keinen Nutzer; sie
  entstehen mit der ersten Teilabrechnung einer Quelle.
- **Altdaten:** Rechnungen von vor dem 06.11.2026 tragen keine
  Wartungsabdeckung. Die Vorschau erkennt sie weiter am Text — nur bei
  Rechnungen ganz ohne Wartungsabdeckung.
- **Für M13 vorgemerkt:** `rechnung_storno_aufheben` sperrt bei Zeiten,
  Material und Scheinen nicht gegen eine gleichzeitig angelegte Rechnung mit
  demselben Beleg (für die Wartung ergänzt). Die Bauplanung verlangt für M13
  genau diesen Konkurrenztest; dort wird es für alle Arten geschlossen.

**Prüfungen.** `wartungAbdeckung.test.ts` (neu, echte Datenbank, 12), dazu
`wartungPosition.test.ts` (+7), `vorrechnungen.test.ts` (+1),
`InvoicesView.test.tsx` (+3), `wartungDerBaustelle.test.ts` (+1),
`rechnungStellen.spec.ts` (+1 Browserweg: Wartung umbenannt, keine zweite
Vorschlagszeile). Angepasst: `rechnungInEinemZug` und
`rechnungNurUeberFunktionen` legten erfundene Schein-Kennungen an, die jetzt
zu Recht abgewiesen werden. Gegenprobe: vor der Migration 10 von 10 rot, je
geänderter Funktion die eigenen Fälle rot.

**E56 — Angebotsannahme per Link; der Server prüft neue Befehle am Modul (06.11.2026).**
SHK-Ausbau, Paket M02a (A06, „Behalten“; erster Nutzer von V3 und der ersten
Unterfähigkeit `angebote.online_annahme`). Ein Kunde konnte ein Angebot nur
annehmen, indem das Büro es für ihn tat.

- **Der Link entsteht mit der Freigabe zum Versand (V4).** „Annahme-Link“ im
  Angebot verlangt Abrechnungsart und Nummernvorsatz der künftigen Baustelle
  und eine Gültigkeit (bis zur Gültigkeit des Angebots, höchstens ein Jahr).
  Ein Entwurf wird damit „Versendet“. Der Link zeigt einen unveränderlichen
  Stand des Angebots mit Prüfsumme; die Datenbank kennt nur den Hashwert des
  Schlüssels (wie das Kalender-Abo). Er wird einmal angezeigt, kopierbar und
  „per Mail-Programm“ (Versand aus der App kommt mit M14). Ein neuer Link
  widerruft den alten; „Widerrufen“ jederzeit, solange nicht entschieden.
- **Die Seite des Kunden** (`/angebot/annehmen#…`, ohne Anmeldung; der
  Schlüssel steht im Fragment und erreicht nie einen Server-Log) zeigt das
  Angebot, als PDF wie im Büro, und nimmt mit Name, Bestätigung und
  Unterschrift an — oder lehnt mit Name und Grund ab. Unbekannt, abgelaufen
  und widerrufen bekommen dieselbe Antwort; eine geänderte, ersetzte oder
  nicht mehr versendete Fassung ebenso.
- **Ein gemeinsamer Kern.** Intern und über den Link nimmt derselbe SQL-Kern
  an (`app.angebot_annehmen_kern`): dieselbe Baustelle, dieselbe
  Nummernfolge (`app.naechste_nummer_kern`), die anderen Fassungen „Ersetzt“.
  `angebot_annehmen` behält Signatur, Rechte und Meldungen. Doppelte Annahme
  ändert nichts; zwei gleichzeitige ergeben genau eine Baustelle. Im
  Änderungsjournal steht „Kunde über Link: <Name>“.
- **Das Büro erfährt es:** Push an die Führung bei Annahme und Ablehnung,
  genau einmal (Schalter „Antwort eines Kunden über den Annahme-Link“ in „Mein Konto“), und
  ein Hinweis auf der Startseite, bis das Angebot geöffnet ist. Im Angebot:
  Stand des Links, Öffnungen (erstes, letztes, Anzahl — keine IP, kein Gerät:
  U05, Datensparsamkeit), Name und Unterschrift.
- **Rate-Limit je Link** (60 Anfragen je Stunde). Je Abrufer nicht: die
  Adresse des Abrufers ist hinter dem Netzwerk nicht verlässlich bestimmbar,
  und ein Zähler je falschem Schlüssel schriebe bei jedem Rateversuch eine
  Zeile. Falsch geformte Schlüssel erreichen die Datenbank nicht.
- **V3 umgesetzt:** `app.modul_aktiv(betrieb, schalter)` rechnet dieselbe
  Regel wie `aktiveSchalter` in der App (Standard, Festlegung,
  Abhängigkeiten, Unterfähigkeit nur mit Modul); die Standards stehen als
  Liste in `app.modul_register()`, ein Test vergleicht sie mit dem Register
  der App. Erzeugen und Abrufen prüfen `angebote.online_annahme`; abgeschaltet
  gibt es keinen Link, und der Abruf antwortet wie unbekannt — nichts wird
  widerrufen, nach dem Wiedereinschalten gelten offene Links bis zu ihrem
  Ablauf (Folge in der Rückfrage). Der Kopf von `src/lib/module.ts` sagt jetzt:
  für neue Befehle ist das Modul eine Grenze auf dem Server.
- **Datenschutz:** Name, Unterschrift und Prüfsumme bleiben mit dem
  angenommenen Angebot als Vertragsnachweis (Frist wie Angebote in der
  Löschung); offene Links widerruft die Löschung des Kunden. Datenauskunft
  des Kunden mit seinen Links, der Person mit erzeugten und widerrufenen.
  Der Support sieht keine Links.
- **Nebenbei robust gemacht:** `indizesWachstum.test.ts` — die Rechnungsfälle
  fielen je nach Reihenfolge des Gesamtlaufs um, weil der Planer ohne eigene
  Zeilen zwischen zwei Indizes schwankte (gesehen bei M01b und M02a). Jetzt
  mit eigenem Bestand und neuer Messung nach dem Zurückrollen; der Fehler
  ließ sich gezielt nicht nachstellen, die Ursache ist beseitigt.

**Grenzen mit Grund:** kein QR-Code (die App hat keinen QR-Baustein; eine
neue Bibliothek nur dafür — der Link ist kopierbar und mailbar); Versand aus
der App erst mit dem SMTP-Secret des Betreibers (M14); Rate-Limit nur je
Link (oben); Öffnungen nur gezählt (U05).

**Prüfungen.** `angebotLink.test.ts` (33), `angebotLinkFunktion.test.ts` (9,
Edge Function), `modulRegisterServer.test.ts` (3, SQL gleich App),
`pushAngebotLink.test.ts`, `AngebotLink.test.tsx`,
`AngebotAnnahmeSeite.test.tsx`, `MeldungAngebotLink.test.tsx`,
`annahmeLink.test.ts`, `angebotLink.spec.ts` (Browser: Büro erzeugt, Kunde
nimmt in einem zweiten Browser an, Büro sieht es), Inhaltsregel-Rundgang der
öffentlichen Seite; Querschnitt in `mandantenTrennung`, `schema`,
`ruecklauf`, `personLoeschen`. Gegenproben: ohne Migration 38 von 40 neuen
Datenbankfällen rot (die zwei Erhaltungsfälle grün), je Baustein die eigenen
Fälle rot.

**E57 — Kataloge mehrerer Großhändler, verifizierter Preisvergleich, Preisverlauf (07.11.2026).**
SHK-Ausbau, Paket M03a (E01–E04, „Integrieren“; Befund 2 der Bestandsmatrix).
Der Artikelstamm kannte keinen Lieferanten: zwei Großhändler mit derselben
Nummer ergaben einen Artikel, und der letzte Katalog überschrieb Name, Einheit
und Einkaufspreis — auch wenn beim zweiten ein anderes Produkt dahinterstand.

- **Lieferantenartikel als Zuordnungsmodell.** Neue Tabelle
  `lieferantenartikel`: der Artikel, wie ihn ein Großhändler führt (Nummer,
  Bezeichnung, Einheit, Preiseinheit, Warengruppe, EAN), einem Stammartikel
  zugeordnet oder offen. Ein Katalog schreibt nur an seine eigenen
  Lieferantenartikel; den Stammartikel ändert er nur, solange kein anderer
  Lieferant zugeordnet ist — der Ein-Lieferanten-Betrieb bleibt, wie er war.
- **Eine Preistabelle.** Die Preise in `material_prices` hängen am
  Lieferantenartikel und ziehen beim Zuordnen mit; nichts doppelt, nichts
  verloren. `material_einkaufspreise` bleibt die eine Zahl für Kalkulation,
  Nachkalkulation und Rechnung: der günstigste vergleichbare Preis, sonst der
  jüngste — unabhängig von jedem Schalter, weil Zahlen nicht von einer
  Ansicht abhängen dürfen.
- **Vergleich nur, wo er stimmt.** „Günstigster“ nur bei gleicher Einheit,
  vollständigem Rabatt und nicht veraltetem Stand (Vorgabe 180 Tage, je
  Betrieb einstellbar); sonst „nicht vergleichbar“ oder „veraltet“ mit
  Grund — keine erfundene Umrechnung. Der Vorschlag der Einkaufsliste nimmt
  den günstigsten vergleichbaren, sonst wie bisher den jüngsten; den Grund
  sieht, wer Einkaufspreise sieht.
- **Offene Lieferantenartikel** (Lager › „Zuordnen“) mit Vorschlag (gleiche
  Nummer, gleiche EAN, ähnliche Bezeichnung): zuordnen, als neuen Artikel anlegen (ohne doppelte
  Nummer), lösen. Wer und wann entschieden hat, setzt die Datenbank am
  Lieferantenartikel; kein Journal, weil der Katalog Stammdatum ohne Akte ist
  (die jüngste Entscheidung steht, frühere nicht).
- **Preisverlauf je Großhändler** im Artikelblatt und **Preissprünge** im
  Bericht der Übernahme (Schwelle je Betrieb, Vorgabe 10 %).
- **Katalogsuche** findet auch über die Nummer eines zugeordneten
  Großhändlers und die EAN (`katalog_nummern_suche`, Trigramm-Index), auch
  für den Monteur — ohne dass er die Tabelle lesen darf.
- **Bestand ergänzt, nicht umgeschrieben:** aus den vorhandenen Preisen
  entstehen Lieferantenartikel („bestand“: ein Lieferant verifiziert, zwei zu
  prüfen); der Einkaufspreis jedes Artikels bleibt, bis der nächste Katalog
  oder eine Zuordnung ihn neu bestimmt.
- **Module:** drei Unterfähigkeiten unter „Material“, alle Standard an
  (`material.katalogversionen`, `material.lieferantenvergleich`,
  `material.katalogpreisverlauf`), im Register des Servers. Zuordnen, als neu
  anlegen und lösen prüfen `material.katalogversionen` auf dem Server (V3);
  ausgeschaltet ordnet die Übernahme weiter zu, nimmt nur die Ansichten weg.
  Ohne Preisvergleich gilt für den Vorschlag wieder der jüngste.
- **Rechte:** Zuordnen, wer Kataloge einspielt (Geschäftsführung oder
  Freigabe „Katalog einspielen“); Preise und Vergleich nur, wer
  Einkaufspreise sieht; die Projektleitung sieht die Nummern der
  Großhändler, keine Preise. Der Support liest, ordnet ohne „mitarbeiten“
  nicht zu.

**Grenzen mit Grund:** EAN und Preiseinheit aus DATANORM sind erst mit echten
Dateien realer Großhändler prüfbar (Nachweisregister, liegt beim
Pilotbetrieb); ein Artikel ohne Preiszeile bleibt Stammartikel ohne
Lieferantenartikel (Altdaten: seine Herkunft ist nicht gespeichert); von den
Entscheidungen zu einem Lieferantenartikel steht nur die jüngste (oben).

**Prüfungen.** `lieferantenartikel.test.ts` (34, darunter Erhaltung des
Ein-Lieferanten-Betriebs, Bestand, 2.000 Zeilen unter der Zeitgrenze, V3),
`modulRegisterServer.test.ts`, `Lieferantenvergleich.test.tsx`,
`OffeneLieferantenartikel.test.tsx`, `KatalogEinstellungenKarte.test.tsx`,
Erweiterungen in `KatalogImport`, `MaterialCatalog`, `StockView`,
`Einkaufsliste`, `datanorm`, `einkauf`, `nummernSuche`, `modulRegister`;
Browser `lieferantenvergleich.spec.ts`. Gegenprobe der Serverprüfung: ohne
sie ist der V3-Fall rot.

**E58 — Lagerorte, Fahrzeuge, Umlagerung und der Schreibbefehls-Vertrag (07.11.2026).**
SHK-Ausbau, Paket M04a (E10, „Integrieren“; Befund 5 der Bestandsmatrix;
Fahrzeug als gemeinsame Kennung für W06/W07). Es gab genau einen Bestand je
Artikel; was im Bus eines Monteurs liegt, stand nirgends, und Fahrzeuge
kannte die App nur als Freitext an der Zeitbuchung.

- **Das Hauptlager bleibt `materials.stock`.** Weitere Orte (Lager bzw.
  Regal an einer Anschrift, je Fahrzeug ein Fahrzeuglager) führen ihren
  Bestand in `lagerbestaende`; das Hauptlager steht dort nicht. Grund: eine
  zweite Zeile für dieselbe Zahl müsste ein Auslöser nachführen, und jede
  Abweichung wäre ein Fehler, den niemand bemerkt. So lesen alle bestehenden
  Wege, Anzeigen und Prüfungen weiter dieselbe Zahl. Bewegungen tragen den
  Ort (leer = Hauptlager — Altdaten bleiben, was sie sind); kein Ort wird
  negativ.
- **Fahrzeuge** (Einstellungen › Fahrzeuge): Kennzeichen (eindeutig ohne
  Leerzeichen, Bindestriche, Groß-/Kleinschreibung), Bezeichnung,
  Standardfahrer, aktiv. Kennzeichen aus den Zeitbuchungen nur als Vorschlag
  „Als Fahrzeug anlegen“ — keine automatische Zuordnung; das Freitextfeld der
  Zeiterfassung bleibt und schlägt die Fahrzeuge vor.
- **Umlagern** zwischen zwei Orten, atomar, mit Bewegungen an beiden Orten.
  Die bestätigte Übersteuerung bei Fehlbestand gilt hier nicht: sie sagt
  Ware zu, eine Umlagerung bewegt Ware — was nicht da ist, wird gezählt
  (Inventur am Ort), nicht negativ gebucht. Der Fahrer lagert aus seinem
  Fahrzeug selbst zurück, wenn der Betrieb es erlaubt (Standard aus).
- **Schreibbefehls-Vertrag** (Bauplanung 4.3), erster Verbraucher
  `umlagern`: Zielkennung, erwarteter Stand, Vorgangskennung; Sperren in
  fester Reihenfolge; Vorgangskennung und Hash der Nutzlast je Betrieb
  eindeutig (`befehle_vorgaenge`) — dieselben Daten liefern dasselbe
  Ergebnis, dieselbe Kennung mit anderem Inhalt ist ein Konflikt;
  `befehl_stand` beantwortet einen unklaren Ausgang.
- **Bestehende Wege je Ort** (Wareneingang, Einkaufsliste „Geliefert“,
  Inventur, Abhaken der Rüstliste, Retoure, Abholen): ein optionaler Ort,
  Vorgabe Hauptlager; ohne Ort Wort für Wort wie bisher (je Weg ein
  Erhaltungstest). Eröffnungsbestände weiterer Orte nur aus einer Zählung
  oder einer Umlagerung. Reserviert wird weiter gegen das Hauptlager; eine an
  einen weiteren Ort gelieferte Anforderung trägt den Ort. Der
  Rechnungsvorschlag bleibt: eine Umlagerung ist kein Verbrauch.
- **„Mein Fahrzeug“** unter „Material anfordern“ für den Fahrer: Bestand
  seines Fahrzeugs, Zurücklagern, wenn erlaubt.
- **Modul:** `material.lagerorte_fahrzeuglager` (Standard an), im Register
  des Servers. Die neuen Befehle prüfen es (V3); die bestehenden Wege nur,
  wenn ein weiterer Ort gewählt wird. Was schon an einem Ort liegt, folgt
  ihm weiter (Abholen einer dorthin gelieferten Anforderung, Zurücknehmen
  eines Hakens am selben Tag) — das ist keine Wahl, sondern die Buchung zur
  vorhandenen Ware. Ausgeschaltet gibt es nur das Hauptlager.
- **Kein Änderungsjournal** für Orte und Fahrzeuge: Stammdaten ohne
  Belegcharakter; die Bewegungen sind das Protokoll des Bestands.
- **Datenschutz:** der Standardfahrer steht in der Datenauskunft der Person
  und wird bei ihrer Löschung entfernt.

**Grenzen mit Grund:** vorhandene Kennzeichen an Zeitbuchungen werden keinem
Fahrzeug zugeordnet (Altdaten: der Freitext ist nicht eindeutig, geraten
wird nichts); an weiteren Orten gibt es keine Reservierung (fachlich: dort
ist frei, was liegt; die Ware im Fahrzeug gehört der Rüstliste dieses
Fahrzeugs).

**Prüfungen.** `lagerorte.test.ts` (Orte, Fahrzeuge, Umlagerung, Vertrag,
jeder bestehende Weg mit Erhaltung, V3 in drei Fällen), Querschnitt in
`schema`, `mandantenTrennung`, `ruecklauf`, `personLoeschen`, `netzFrist`,
`modulRegisterServer`; Komponenten `LagerorteLager.test.tsx`,
`LagerorteWege.test.tsx`, `StockView.test.tsx`; Browser `lagerorte.spec.ts`.

**E59 — Auftragseingang ohne Angebotszwang; Kern im Modulregister (07.11.2026).**
SHK-Ausbau, Paket M02b (A03 „Behalten“, A11 „Optional, strukturiert“;
Auffälligkeit 5 im Teil A/R). Ein Auftrag ohne Angebot hatte keinen
geordneten Weg vom Telefon bis zur Baustelle; die Verwaltung, die das Telefon
abnimmt, durfte nichts anlegen.

- **Eingang** (Aufträge › Auftragseingang): Kunde (vorhanden oder Angaben zu
  einem neuen), Ort, Ansprechpartner vor Ort, Anliegen, Dringlichkeit
  (normal, dringend, Notfall), Wunschtermin, Quelle (Telefon, E-Mail,
  Hausverwaltung, Versicherung, persönlich, sonstige), Nummer des
  Auftraggebers; eigene Nummer `EG-JJJJ-NNNN` aus einem eigenen Zählerkreis
  über `naechste_nummer_kern`. Liste „Offen · Übernommen · Abgelehnt“,
  dringend und Notfall zuerst, seitenweise; Startseite „Offene Eingänge“.
- **Rollen:** erfassen, ändern (solange offen), ablehnen und wieder öffnen
  alle Büro-Rollen, die Kunden lesen — Verwaltung, Buchhaltung,
  Projektleitung, Geschäftsführung, Administrator. Umwandeln und Löschen die
  Führung, wie „Neue Baustelle“ und Angebot anlegen. Einen neuen Kunden legt
  nur an, wer Kunden pflegen darf; sonst sagt es ein Satz. Der Support liest
  mit Einblick, schreibt nicht.
- **Umwandeln in einem Zug** (Server, `for update`, Wiederholung gibt dieselbe
  Baustelle bzw. dasselbe Angebot zurück): „Baustelle anlegen“ mit
  Abrechnungsart (Vorgabe Regie — ohne Angebot gibt es keinen Festpreis) und
  Nummernvorsatz über dieselbe Nummernfolge wie „Neue Baustelle“;
  „Angebot anlegen“ über `angebot_speichern`; „Besichtigung vereinbaren“
  öffnet das vorhandene Terminformular vorbelegt, der Eingang bleibt offen und
  zeigt den Termin. Akten von Baustelle und Angebot zeigen „Aus Eingang
  EG-…“, die Kundenakte die Eingänge des Kunden.
- **Gleichnamiger Kunde:** Bevor aus den Angaben eines Eingangs ein Kunde
  wird, dieselbe Rückfrage wie in der Kundenliste („Gleicher Name — trotzdem
  anlegen?“), mit „übernehmen“ je vorhandenem Kunden.
- **Kern im Register (V1):** `baustellen` und `kunden` stehen als „Immer an“
  im Register von App und Server (`app.modul_kern()`), mit Unterfähigkeiten;
  die erste ist `baustellen.auftragseingang` (Standard an). Eine Festlegung
  zum Kern selbst wird überall ignoriert. Die Hilfe der Seite „Module“ sagt
  jetzt richtig: bestehende Bereiche blendet ein Modul nur aus, neuere
  Funktionen sperrt auch der Server.
- **Journal (M01b):** neue Objektart `eingang`, mit Kundenkennung, damit
  Auskunft und Kundenlöschung greifen. **Datenschutz:** der Eingang steht in
  der Auskunft des Kunden; offene und abgelehnte gehen mit der Kundenlöschung,
  übernommene bleiben als Herkunft von Baustelle bzw. Angebot.

**Grenzen mit Grund:** kein Import aus Portalen von Hausverwaltungen und
Versicherungen (liegt beim Auftraggeber bzw. Pilotbetrieb: ohne
Formatbeschreibung wäre jeder Leser erfunden — Nachweisregister); Eingänge
mit Angaben zu einem noch nicht angelegten Kunden stehen nicht in dessen
Datenauskunft (Datenschutz: über den Namen allein träfe es Namensvettern;
sie lassen sich löschen oder zum Kunden machen); der Vorsatz „EG“ ist fest
(fachlich: die Nummer ist intern und steht auf keinem Beleg); wird ein
Eingang erst Angebot und dann über die Annahme Baustelle, nimmt die Baustelle
den Ansprechpartner der Kundenakte (vorhandener Weg der Annahme).

**Prüfungen.** `auftragseingang.test.ts` (31), `modulRegisterServer.test.ts`,
Querschnitt in `schema`, `mandantenTrennung`, `ruecklauf`, `personLoeschen`,
`aenderungsjournal`, `typenSpalten`; Komponenten `EingaengeView`,
`EingangFormular`, `EingangView` (mit Rückfrage), `gleichnamig`,
`ModulesView`, Startseite, Akten; Browser `auftragseingang.spec.ts`.

**E60 — Eine Deckungsrechnung für das Material; Bestellvorschläge ohne automatische Bestellung (07.11.2026).**
SHK-Ausbau, Paket M04b (E13 „Behalten“, E14 und G03 „Integrieren“; Kern K02;
Befund 7 der Bestandsmatrix). Die Fehlmenge wurde an drei Stellen
verschieden gerechnet (Formular, Monatsvorschau, Rüstliste), und einen
Vorschlag, was nachzubestellen ist, gab es nicht.

- **Eine Rechnung, eine Quelle.** Der Server liefert die Eingaben in einem
  Zug (`materialdeckung`: Rüstlisten, frei im Lager, Anforderungen mit Stand,
  Zulauf aus der Einkaufsliste; höchstens 31 Tage), die App rechnet mit einer
  Funktion (`materialDeckung.ts`). Woche, Tag, Monat, Formular und Startseite
  lesen dieselbe Zahl; das Formular rechnet damit auch ungespeicherte
  Positionen.
- **Mengensemantik K02:** wer früher dran ist, bekommt zuerst (Einsatztag,
  dann Anlage der Liste); eine Menge deckt nicht zwei Bedarfe; die eigene
  Reservierung zählt nicht doppelt; bestellt, zugesagt und vorhanden bleiben
  getrennt. Über alle Listen summiert ist die Fehlmenge dieselbe wie bei
  `lager_frei`; gebucht und reserviert wird unverändert.
- **Zustände mit Text (Lot):** gedeckt; „wird geliefert bis …“ (läuft);
  bestellt, Liefertermin unbekannt (läuft — der Text nennt die Lücke);
  angefordert bzw. auf der Liste, noch nicht bestellt (offen); fehlt N oder
  Lieferung erst nach dem Einsatztag (Achtung); Laden fehlgeschlagen
  (Fehler). Eine freie Zeile ohne Katalogartikel steht als „Bestand
  unbekannt“; ein Katalogartikel, der nicht im Lager geführt wird, als „nicht
  im Lager geführt – N zu bestellen“ wie bisher, samt Anforderungsknopf.
  Je Einsatz eine Textzeile in Woche und Tag, ohne Ampelfarben; Startseite
  „Material fehlt“ für sieben Tage voraus.
- **Befund Monatsvorschau:** sie zog die eigene Liste mit der vollen Menge
  ab, nicht mit dem Rest aus dem Regal — zwei konkurrierende Listen meldeten
  die frühere als Fehlmenge, eine Lieferung nach dem Einsatztag galt als
  gedeckt, eingeladene Positionen zählten wie offene. Das Formular hatte den
  Vorrangfehler ebenso. Jetzt rechnen beide richtig; die Tests zeigen alte
  und richtige Zahl nebeneinander.
- **Bestellvorschläge** (Anforderungen › Einkaufsliste): ausgelöst, wenn frei
  plus Zulauf unter der Mindestmenge oder unter null liegt (auch aus
  Rüstlisten, G03); Menge bis zum Sollbestand, ohne ihn bis zur
  Mindestmenge, aufgerundet auf die Verpackungseinheit; Großhändler nach der
  Regel aus M03a. Nichts doppelt: Anforderungen, Listen- und Bestellposten
  zählen als Zulauf. „Übernehmen“ legt Posten der Einkaufsliste über den
  Befehlsvertrag aus M04a an, gebündelt, mit von Hand änderbarer Menge;
  hat sich der Vorschlag inzwischen geändert, wird er nicht angelegt
  („veraltet“). **Keine automatische Bestellung.**
- **Sollbestand und Verpackungseinheit** am Artikel (nicht je Ort: reserviert
  und bestellt wird gegen das Hauptlager, ein Fahrzeug füllt man durch
  Umlagern), gepflegt wie die Mindestmenge; die Datenbank verlangt
  Sollbestand ≥ Mindestmenge.
- **Module:** `material.materialbereitschaft` (an) nimmt ausgeschaltet nur die
  neue Anzeige weg — die Fehlmenge in Formular und Monat gab es vorher schon;
  `material.bestellvorschlaege` (an) prüft der Server beim Lesen und
  Übernehmen (V3). Rechte: Verwaltung und Leitung.

**Grenzen mit Grund:** keine Rundung nach DATANORM-Verpackungseinheit (der
Leser ist nicht gegen echte Dateien geprüft — Nachweisregister); kein
Sollbestand je Ort (fachlich, oben); „bestellt“ ist bis M05a, was die
Einkaufsliste als bestellt führt (Bestellbelege kommen mit M05a); der Support
sieht keine Deckung (wie `lager_frei`).

**Prüfungen.** `materialbereitschaft.test.ts`, `materialDeckung.test.ts`
(33, mit Befund alt/richtig), `Bestellvorschlaege.test.tsx`, Erweiterungen in
`AssignmentsView`, `WochenplanView`, `MonatsAnsicht`, `monatsBalken`,
`startseite`; Querschnitt `modulRegisterServer`, `schema`, `ruecklauf`;
Browser `materialbereitschaft.spec.ts`.

**E61 — Frei konfigurierbare Zeitfelder mit veröffentlichter Fassung (07.11.2026).**
SHK-Ausbau, Paket M06b (N01; E51: konfigurieren Geschäftsführung UND
Administrator mit eigenem Recht). Die Angaben zu einer Zeitbuchung hingen an
der Rolle; was ein Betrieb zusätzlich wissen will (Kostenstelle, Kilometer,
Auftragsnummer der Hausverwaltung …), stand bestenfalls im Kommentar.

- **Felder je Betrieb** (Einstellungen › Zeitfelder): Name, Typ (Text mit
  Länge, Zahl mit Grenzen, Stellen und Einheit, Ja/Nein, Auswahl, Datum),
  Pflicht (beim Buchen oder nur Büro), gilt für Stand (Anwesend,
  Zeitausgleich) und Rollen, Reihenfolge, Hinweis. Stabile Kennung, nie
  wiederverwendet; Optionen deaktivierbar, entfernbar nur, solange keine
  Buchung sie trägt; ein Typwechsel ergibt ein neues Feld, das alte endet und
  bleibt mit seinen Werten lesbar.
- **Veröffentlichte Fassung** (`zeitfeld_fassungen`): ein Schnappschuss der
  Regeln aller aktiven Felder, neu nur, wenn sich eine Regel ändert
  (Umbenennen und Umsortieren nicht). Jede Buchung und jeder Wert tragen die
  Fassung, nach der sie geprüft wurden — eine offline gebuchte Zeit wird
  nach der Fassung angenommen, die das Gerät kannte; was eine neuere
  zusätzlich verlangt, steht als „Nachpflege“ da. Server und App prüfen
  dieselbe Regel (Vergleichstest SQL gegen App).
- **Ein Schreibweg für alle Wege:** die Werte reisen in der Buchungszeile mit
  (Durchgangsspalte, gespeichert immer leer), ein Auslöser prüft Typ,
  Grenzen, Option, Geltung, Pflicht, Verrechnung und Modul, ein zweiter
  schreibt die Werte in `zeitbuchung_feldwerte`. So tragen Anlegen, Ändern,
  Ausgangsfach (offline) und Einfügen die Werte ohne neuen Befehl; eine
  doppelt zugestellte Vormerkung ändert nichts.
- **Sichtbar** in der Buchungsmaske, der Zeiterfassung, der
  Mitarbeiterübersicht (Person), im Änderungsprotokoll der Buchung (E50,
  alt → neu), in beiden CSV-Exporten (eigene Spalten) und im
  Stundennachweis (unter dem Kommentar). Fehlt eine Pflichtangabe „nur
  Büro“, steht „fehlt“ da.
- **Rechte:** Definieren Geschäftsführung und Administrator (eigenes Recht
  `app.darf_zeitfelder_definieren`, nicht die Modulverwaltung); der Support
  nicht. Werte liest, wer die Buchung liest; der Support nie.
- **Modul:** Zeiterfassung steht als Kern im Register (V2 folgt mit M06d),
  Unterfähigkeit `zeiterfassung.freie_zeitfelder` (an); ausgeschaltet
  nimmt der Server keine neuen Werte an, gespeicherte bleiben.
- Der Feldsatz wird über den Zwischenspeicher der App geladen (eine Minute),
  nicht bei jedem Öffnen der Buchungsmaske; ein veralteter Stand schadet
  nicht, weil der Server nach der Fassung der Maske prüft.

**Grenzen mit Grund:** Felder nur bei Anwesend und Zeitausgleich (fachlich
und Datenschutz: die übrigen Stände entstehen über Meldung oder Antrag, beim
Krankenstand gehören keine Zusatzangaben dazu); eine verrechnete Buchung
nimmt keine Angaben mehr an (fachlich: erst stornieren); Aufteilen und
Einfügen kopieren keine Werte, der abgetrennte Teil zeigt „Nachpflege“
(fachlich: keine doppelten Mengen); Freitext in einem Feld wird bei der
Kundenlöschung nicht gefunden (Datenschutz: über den Namen allein träfe es
Namensvettern, wie beim Kommentar); wer eine Fassung veröffentlicht hat,
bleibt nach der Löschung einer Person stehen (Art. 5 Abs. 2 DSGVO).

**Prüfungen.** `zeitfelder.test.ts` (26), `zeitfelderRegel.test.ts` (SQL
gegen App mit Gegenprobe), `zeitfelder.test.ts`/`exportZeitfelder.test.ts`
(Einheit), `TimeFormZeitfelder`, `ZeitfelderView`, `ZeitfeldAngaben`,
`MusterZeitfelder`, Erweiterungen in `TimeView`, `AccountingView`;
Querschnitt `modulRegisterServer`, `schema`, `mandantenTrennung`,
`typenSpalten`, `personLoeschen`, `ruecklauf`; Browser `zeitfelder.spec.ts`.
Nebenbei: zwei Bedingungen der Migration standen als `if case … then`, was
PL/pgSQL nicht liest (die Bedingung endet beim ersten `then`) — in Klammern
gesetzt, bevor sie je eine Datenbank erreichte.

**E62 — Liegenschaften, Tops und Beteiligte; „Optional“ heißt ab Werk aus (07.11.2026).**
SHK-Ausbau, Paket M02c (A09 „Optional“; Auffälligkeiten 12 und 13). Wer für
eine Hausverwaltung in vielen Häusern und je Haus in mehreren Wohnungen
arbeitet, hatte dafür nur Freitext an der Baustelle („Bad 2. OG“). „Was
haben wir in diesem Haus schon gemacht?“ und „wer ist hier Eigentümer, wer
zahlt?“ beantwortete die App nicht.

- **Regel für den ganzen Ausbau:** Punkte der Bauplanung mit der Kategorie
  „Optional“ sind ab Werk AUS und je Betrieb einschaltbar; „Behalten“ und
  „Integrieren“ sind ab Werk an (E51, hier erstmals bei einem eigenen
  Bereich angewandt).
- **Liegenschaft** (Aufträge › Liegenschaften): Bezeichnung, Anschrift in
  Teilen wie beim Kunden, Notiz, aktiv. Sie gehört keinem Kunden; sie hat
  **Beteiligte** mit Rolle (Eigentümer, Hausverwaltung, Betreiber, Nutzer
  bzw. Mieter, Auftraggeber, Rechnungsempfänger, Versicherung,
  Lieferadresse), je als Kunde oder als freie Angabe, an der Liegenschaft
  oder an einem **Top** (Wohnung bzw. Einheit mit Lage), mit gültig ab/bis
  für Mieterwechsel. „Zum Kunden machen“ mit derselben Rückfrage bei gleichem
  Namen wie in der Kundenliste.
- **Zuordnung:** Baustelle, Wartung, Auftragseingang und **Angebot** tragen
  optional Liegenschaft und Top; die Datenbank garantiert, dass das Top zur
  Liegenschaft und beides zum Betrieb gehört. Der Weg Eingang → Angebot →
  Annahme (im Büro oder per Link) → Baustelle trägt die Liegenschaft durch;
  der Schnappschuss des Annahme-Links enthält sie nicht (Zuordnung, nicht
  Inhalt — bestehende Links bleiben gültig). Beim Anlegen werden Kunde
  (Vorrang Rechnungsempfänger, dann Auftraggeber, dann Hausverwaltung),
  Anschrift und Mieter als Ansprechpartner vorgeschlagen, übernommen erst auf
  „Übernehmen“.
- **Akte der Liegenschaft:** Tops, Beteiligte (aktuelle und „Früher“),
  Baustellen, Wartungen; die Kundenakte zeigt die Liegenschaften, an denen der
  Kunde beteiligt ist. Monteure sehen Haus und Top als Text an ihrer
  Baustelle, ohne die Liegenschaften (mit Telefonnummern von Mietern) lesen
  zu dürfen.
- **Rechte wie bei Kunden:** lesen alle außer dem Monteur, pflegen wer Kunden
  pflegt; der Support liest mit Einblick und pflegt mit „mitarbeiten“.
  Gelöscht wird eine Liegenschaft bzw. ein Top mit Baustelle, Wartung,
  Eingang oder Angebot nicht — sie wird stillgelegt; die Geschichte des Hauses
  bleibt.
- **Modul** `kunden.liegenschaften` (Unterfähigkeit des Kerns „Kunden“, ab Werk
  aus). Der Server prüft Anlegen, Ändern und jede neue Zuordnung (V3); eine
  Zuordnung lösen und einen Beteiligten entfernen gehen immer (Datenschutz vor
  Modul).
- **Journal und Datenschutz:** Objektarten Liegenschaft, Top, Beteiligter.
  Ein freier Beteiligter wird beim Entfernen wirklich gelöscht, und seine
  Werte verschwinden aus dem Journal (wie bei der Kundenlöschung); die
  Datenauskunft eines Kunden nennt seine Beteiligungen.

**Grenzen mit Grund:** keine eigene Datenauskunft für freie Beteiligte
(Datenschutz: über den Namen allein träfe es Namensvettern; sie lassen sich
löschen oder zum Kunden machen); keine abweichende Rechnungsanschrift je
Rechnung (Befund 4: eine Rechnung geht an den Kunden der Baustelle;
Sammelrechnung kommt mit M13); die Akte zeigt je Liste höchstens 100
Baustellen bzw. Wartungen und sagt es, wenn die Grenze greift.

**Prüfungen.** `liegenschaften.test.ts` (28, darunter das Angebot über alle
Annahmewege und der unveränderte Schnappschuss), Querschnitt `schema`,
`mandantenTrennung`, `aenderungsjournal`, `personLoeschen`, `ruecklauf`,
`typenSpalten`, `modulRegisterServer`; Komponenten `LiegenschaftenView`,
`LiegenschaftView`, `LiegenschaftBaustelle`, `KundenLiegenschaften`,
`QuotesView`, `AngebotView`; Browser `liegenschaften.spec.ts`.

## E63 — M06: Timer, Korrekturanträge, schaltbare Zeiterfassung und Standardfelder (08.11.2026)

Auftrag: M6 gegen den tatsächlichen Bestand zu Ende führen; auch die festen
Zeitfelder unter Einstellungen verwalten. Die am 08.11. nachgereichte geprüfte
Bauplanung liegt unter `docs/shk-ausbau/bauplanung-geprueft.md`. E51 und die am
Code verifizierten Rollen gelten weiter: Module nur Administration; Zeitfelder
Geschäftsführung und Administration.

- **Erhalt:** normale Buchung, bisher erlaubte Direktkorrektur, Rechnungssperre,
  Abwesenheitsursprung, KJBG, Nachtberechnung, Saldo, Budget und E50 bleiben die
  maßgeblichen Wege. Kein automatischer Stundenabschluss und kein Lohneditor.
- **M06a / B02, Z04:** eigene `zeitsitzungen` sammeln Arbeits- und Pausenabschnitte
  mit Baustellenwechsel. Befehlskennung und Revision sichern Wiederholung und
  Gerätewechsel; das bestehende Ausgangsfach sendet Schritte offline nach.
  Auf anderen Geräten noch nicht eingetroffene Schritte können nicht bekannt
  sein; ein Konflikt wird abgewiesen und im Ausgangsfach angezeigt. Erst die
  ausdrückliche Bestätigung im vorhandenen `TimeForm` erzeugt je Arbeitsabschnitt
  eine normale Buchung. Ein anderer Inhalt unter derselben Abschlusskennung wird
  abgewiesen. Fehlstarts sind mit Grund verwerfbar, auch einzelne Restabschnitte.
- **Erinnerung:** ab Werk 600 Minuten, in Personal einstellbar; Cron prüft alle
  15 Minuten. Persönliche Benachrichtigung „Zeiterfassung: Timer und Korrekturanträge“ und Modulschalter sind getrennt.
  Die Erinnerung ist zusätzlich in der App sichtbar; Weiterlaufen ist bewusst
  bestätigbar. Push setzt ein registriertes Gerät und die vorhandene FCM-Konfiguration
  voraus; keine garantierte Zustellung bei fehlender Verbindung.
- **M06c / Z01:** ein gesperrter Eintrag bietet einen Korrekturantrag. Das Büro
  ändert über das vorhandene Formular und entscheidet atomar; Rolle und Zeitprofil
  der gebuchten Person gelten. Rechnung und Abwesenheit werden am ursprünglichen
  Vorgang berichtigt. Das bloße Entsperren ist noch keine Korrektur; echte Änderungen
  einschließlich freier Werte oder protokollierte Entfernung sind nachzuweisen.
  Begründete Ablehnung und Zurückziehen sind möglich. Alte Direktrechte bleiben.
- **M06d / V2:** Zeiterfassung ist ein Modul, ab Werk an. Archiv, Exporte und E50
  bleiben erreichbar. Oberfläche bietet keine neuen manuellen Buchungen und keine
  neue Stundenquelle für Regierechnungen an; Scheinquelle bleibt. V3 gilt:
  bisherige Schreibwege, ältere Geräte und Abwesenheitsabläufe werden nicht
  nachträglich gesperrt. Neue Timer/Anträge prüfen ihren Schalter. Offene Sitzungen
  und Anträge bleiben abschließbar, einschließlich Pflichtangaben des Timers.
- **Standardfelder:** Baustelle, Wegzeit, Fahrzeug, Helfername, Helfer-Einsatz,
  Notdienst und Kommentar sind unabhängig von den freien Feldern schaltbar.
  Ausblenden ist kein Löschauftrag. Notwendige Grundlagen (Person, Tag, Stand,
  Zeit und Pause) und automatische Nachtberechnung behalten ihre Bedeutung;
  Typ, Abrechnungsbedeutung und Rollenrechte lassen sich nicht umdefinieren.
- **Datenschutz:** neue personenbezogene Tabellen gehören in Auskunft und
  Aufbewahrungsprüfung der Personenlöschung. Keine Rohdaten werden an Push gesendet;
  die Erinnerung enthält nur einen Hinweis und den Weg zur Zeiterfassung.

**M06e / Z02, Z03 bleibt fachlich gesperrt, nicht als erledigt ausgegeben.**
Es fehlen laut Nachweisregister konkrete KV-/WKO-Regeln bzw. Betriebsvereinbarungen
für zusätzliche Zeitmodelle, Durchrechnung und lohnwirksame Zulagen. Ohne diese
würden neue Versionen vermeintlich rechtlich gültige Regeln festschreiben und
bestehende Salden verändern. Normalarbeitszeit bleibt wie bisher; frei benannte
Merkmale können bereits mit N01 dokumentiert und exportiert werden, ergeben aber
keine erfundene Lohnart oder Auszahlung. Keine unfertige Zusatzmodell-Oberfläche.
Der Betreiber wurde am 08.11. nach den maßgeblichen Fundstellen gefragt.

**Nachweise:** `m06Zeit.test.ts` gegen echte Datenbank, Standardfeld-Erhaltung in
`TimeFormZeitfelder.test.tsx`, `standardZeitfelder.test.ts`, `zeitsitzung.test.ts`,
`m06Zeit.spec.ts` auf Desktop und Tablet; Gegenproben vor den Migrationen rot,
Standardfeld-Gegenprobe ohne Aktivierung/Erhaltung rot. Muster auf `/_muster`.

**E64 — Nachrichten: Baustellen-Threads, Direktnachrichten und Runden; privat heißt privat (08.11.2026).**
SHK-Ausbau, Paket M10/B09 („Ändern“) mit der Erweiterung vom 07.11.2026
(private Direktnachrichten, Entscheidungen D1–D6 der Spezifikation
„Private Direktnachrichten“). Absprachen zur Baustelle liefen bisher über
private Messenger — ohne Bezug zur Akte, mit Kundenfotos in fremden Clouds.

- **Ein Nachrichtenmodell, drei Arten:** der **Thread einer Baustelle**
  (lesen und schreiben alle, die die Baustelle sehen — wie die Pläne), das
  **Direktgespräch** zweier Personen (gibt es je Paar nur einmal) und die
  **Runde** (selbst gebildet, Name freiwillig). Ein Posteingang für alle,
  Reiter Alle · Direkt · Baustellen, Suche über Titel und Text der eigenen
  Gespräche.
- **Privat heißt privat (D6, Teil 5 der Spezifikation):** Direkt und Runden
  lesen nur die Teilnehmer — auch nicht Geschäftsführung, Administration,
  Support oder Plattform. Gebaut ist das so, dass es sich nicht aufweichen
  lässt: kein Konto liest Kanäle, Nachrichten, Anhänge oder Meldungen
  direkt; jede Lesefunktion prüft die Teilnahme selbst. Die einzige direkt
  lesbare Zeile ist die eigene Teilnahme (für die Zahl und das Live-Ereignis,
  ohne Inhalt). Private Zeilen stehen nicht im Datenauszug, nicht in der
  Sicherung, nicht in der Übergabe; private Anhänge liegen in einem eigenen
  Eimer, der nie außer Haus gesichert wird. Die Datenauskunft der Führung
  nennt nur Anzahl und Zeitraum; den Inhalt exportiert die Person selbst
  (Mein Konto → „Meine Nachrichten exportieren“).
- **Keine Überwachung (D4):** keine Lesebestätigung, kein Online-Status,
  kein „schreibt gerade“; „gesendet“ heißt „auf dem Server“. Jeder sieht nur
  seine eigene Zahl ungelesener Nachrichten (Menü, Startseite).
- **Melden (D5):** eine bekommene Nachricht geht als Kopie (Absender, Zeit,
  Text, Anhänge) an Geschäftsführung und Administration; das Gespräch
  dahinter sehen sie nicht. Einstellungen → Nachrichten listet die Meldungen
  (offen, erledigt mit Vermerk, löschen); die Startseite der Führung nennt
  offene. Die Kopie bleibt, wenn der Absender löscht.
- **Löschen löscht (D2):** die eigene Nachricht verliert Text, Erwähnungen
  und Anhänge, es bleibt „Nachricht gelöscht“ mit Zeitpunkt; die Datei
  entfernt die neue Edge Function `nachrichten-aufraeumen` über die
  Speicher-Schnittstelle (gleich angestoßen und jede Nacht). Bei der Löschung
  einer Person gilt dasselbe für alle ihre Nachrichten („Nachricht eines
  gelöschten Kontos“); leere private Gespräche gehen ganz.
- **Aufbewahrung (D3):** ab Werk keine automatische Löschung; die
  Geschäftsführung wählt 6, 12 oder 24 Monate nach der letzten Nachricht
  eines privaten Gesprächs. Baustellen-Threads bleiben mit der Akte.
- **Senden ohne Netz (E49-Muster):** Kennung vom Gerät, Anhänge zuerst in den
  Speicher, dann `nachricht_senden` (idempotent) — beides über das
  Ausgangsfach; im Gespräch „auf diesem Gerät vorgemerkt, wird gesendet“,
  nach einer Ablehnung „Nicht gesendet: …“ mit „Erneut senden“.
- **Push:** über `push-melden` (Anlass `nachricht`); der Anstoß trägt nur
  die Kennung. Ohne gewählte Vorschau steht nur, wer geschrieben hat; mit
  Vorschau (Mein Konto, ab Werk aus) die ersten 80 Zeichen. Stumme Gespräche
  melden sich nur bei einer Erwähnung (@Name in Runde und Thread).
- **In die Baustelle übernehmen (4.5):** eine eigene private Nachricht wird
  als neue Nachricht samt Anhängen in den Thread einer Baustelle kopiert; die
  private bleibt privat und merkt sich den Verweis.
- **Oberfläche:** Navigation „Nachrichten“ (Gruppe Team, am Handy unter
  „Mehr“), ab 760 px Posteingang und Gespräch nebeneinander, am Handy zwei
  Seiten; die Eingabe klebt unten. Das Gespräch liest sich wie ein Messenger
  (Auftrag 08.11.2026: die erste Fassung als Bautagebuch-Zeilen wirkte „klobig
  und altbacken“): die eigenen Nachrichten rechts, deckend in `--petrol`, die
  der anderen links in `--surface-2`, der Tag als Trenner, die Uhrzeit (Plex
  Mono) klein im Blatt; Nachrichten derselben Person bis 5 Minuten bilden eine
  Gruppe, den Namen trägt nur die erste und nur in Runde und Thread. Die
  Blätter tragen die Rundung der Felder und Knöpfe (`--radius`), keine Karte;
  Schatten und Zipfel gibt es nicht. Was noch auf dem Gerät liegt, steht in
  `--petrol-hell`. Die Eingabe ist eine Zeile: Anhang und (in Runde und Thread)
  Erwähnen als Zeichen, das Feld wächst mit, Senden als Pfeil. Der Posteingang
  zeigt je Gespräch Kürzel (Baustelle: Zeichen), Name, Zeit, die letzte
  Nachricht in einer Zeile und die eigene Zahl. Das ganze Blatt öffnet die
  Möglichkeiten einer Nachricht. Die Baustellenakte zeigt den Stand des
  Threads, die Benutzerakte „Nachricht schreiben“. Im Einblick des Supports
  steht auf beiden Seiten der Nachrichten ein Satz statt eines Fehlers.
- **Module:** `nachrichten` (Standard an, empfohlener Umfang) mit
  `nachrichten.direktnachrichten` (ab Werk **aus**, D1 — seit E65 ab Werk
  an; beim Einschalten der Hinweis auf ArbVG §§ 96, 96a). Jeder Schreibweg prüft beides auf dem Server
  (V3); Löschen und Melden gehen immer.

**Grenzen mit Grund:** keine Ende-zu-Ende-Verschlüsselung (Sicherheit/Technik:
Schlüssel über Geräte, Vormerkung ohne Netz, Push-Vorschau, Meldeweg und
Löschfristen schlössen sie aus — die App behauptet sie nirgends); ein Rücklauf
aus der Sicherung bringt keine privaten Gespräche zurück (Datenschutz: die
Führung lädt Sicherung und Auszug herunter); ob eine Betriebsvereinbarung nötig
ist, entscheidet der Betrieb (liegt bei jemand anderem: Betriebsrat,
Kanzlei); bei ganz ausgeschaltetem Modul ist die Seite zu, die eigenen
Gespräche bleiben exportierbar und sind nach dem Wiedereinschalten da; eine
Nachricht hat höchstens 20 000 Zeichen und eine Datei höchstens 25 MB
(Technik, wie die Baustellendokumente); eine neue Runde oder ein neues
Gespräch braucht Netz (die Kennung des Kanals vergibt der Server); Aufgaben-
Threads folgen mit den Aufgaben (eigenes Paket).

**Prüfungen.** `nachrichten.test.ts` (Datenbank, 33: Vertraulichkeit gegen
sieben Rollen bzw. Konten samt Datei, Idempotenz, Anhänge, Löschen samt Datei,
Runde, deaktiviertes Konto, Thread, Push, Melden, Zahl und Live-Ereignis,
Auskunft, Auszug, Sicherung, Selbstexport, Löschung einer Person,
Aufbewahrung, Module); Querschnitt `mandantenTrennung`, `modulRegisterServer`,
`personLoeschen`, `spaltentypen`, `zeilengrenze`; Einheiten
`tests/unit/nachrichten.test.ts`, `scheinSender`, `modulRegister`,
`navigationLot`, `navigation-routen`; Komponenten `Nachrichten.test.tsx`,
`ModulesView`; Browser `nachrichten.spec.ts` (Telefon, Tablet, Schreibtisch).

**E65 — Nachrichten, zweite Fassung: rund, ruhig, ohne Springen; Direktnachrichten ab Werk an (08.11.2026).**
Auftrag nach der ersten Auslieferung: die Chats wirkten „alt, billig und wenig
intuitiv“, beim Senden „rucklig, lädt nach, springt um“, und „Neue Nachricht“
zeigte keine Personen. Freigegeben am 08.11.2026 nach Entwürfen („das
Chat-Konzept finde ich gut“, „nicht die ganze Designlinie verändern, lediglich
diese Elemente“, „ab Werk können sie an sein“).

- **Nur diese Elemente sind weich:** Kürzel (Personen rund, Baustellen als
  weiches Quadrat), Sprechblasen (Radius 20 px, die Ecke zum Absender an der
  ersten Nachricht einer Gruppe spitz), Tages-Pille, Suchfeld und
  Filter-Pillen, die runden Knöpfe der Eingabe und das Feld in Pillenform.
  Die Blätter (Posteingang, Gespräch) bleiben eckig („runde Knöpfe ja, runde
  Boxen eher nicht“, 08.11.2026); die übrige App behält die Kanten der Linie
  „Lot“; Farben nur aus den Grundwerten (Petrol, kein Grün),
  keine Schatten, keine halbtransparenten Flächen. Steht in
  `src/styles/lot-nachrichten.css`.
- **Ohne Springen:** die eben gesendete Nachricht bleibt stehen, bis der neu
  geladene Verlauf sie enthält, und wird dort an Ort und Stelle ersetzt
  (gleiche Kennung, gleicher Aufbau, gleiche Gruppe) — vorher verschwand sie
  für einen Augenblick. Sie steht sofort in ihrer endgültigen Farbe; hell ist
  nur, was ohne Netz wartet oder abgelehnt wurde. Gerollt wird nur sanft und
  nur, wer unten war oder selbst gesendet hat. Am Telefon steht die Eingabe
  fest über der Reiterleiste, der Verlauf hält ihre Höhe frei.
- **Neue Nachricht in einem Schritt:** ein Bogen mit Suche, darunter gleich
  die Personen (ein Tipp: das Gespräch zu zweit) und die Baustellen (ein Tipp:
  ihr Thread); „Runde mit mehreren“ schaltet auf Auswahl um, danach ist der
  Name freiwillig.
- **Posteingang:** Reiter Alle · Direkt · Baustellen · **Ungelesen** — der
  letzte auf dem Server gefiltert (`nachrichten_postfach` mit
  `p_art = 'ungelesen'`), damit beim Nachladen keine Seite fehlt.
- **Eingabe:** Anhang, am Telefon zusätzlich die Kamera direkt, in Runde und
  Thread Erwähnen; Senden als runder Pfeil.
- **Direktnachrichten ab Werk an** (D1 zurückgenommen): ausgeschaltet zeigte
  „Neue Nachricht“ keine Personen und wirkte wie ein Fehler. Register in App
  und Datenbank (`20261109100000_nachrichten_v2.sql`) sagen `standard true`;
  wer sie ausdrücklich ausgeschaltet hat, bleibt dabei. Der Hinweis auf ArbVG
  §§ 96, 96a steht jetzt im Zweck des Schalters (sichtbar, solange er an ist)
  und weiter beim Wiedereinschalten.
- **Seitenkopf bleibt:** auch im Gespräch am Telefon beginnt die Seite mit
  `PageHeader` (Zurück, Name, Art, ⋯) — die Regel der Linie gilt weiter.

**Grenze mit Grund:** keine. **Nachweis:** `nachrichten.spec.ts` (neu: „Senden
springt nicht“ — misst je Bild die Zahl der Nachrichten, ob die neue da ist,
und die Rollposition; Gegenprobe mit der alten Sendelogik rot: „sie
verschwindet nie mehr“), `nachrichten.test.ts` (Ungelesen samt Gegenprobe mit
der alten Funktion rot; ab Werk an), `Nachrichten.test.tsx` (Neue Nachricht in
einem Schritt, Runde, Ungelesen), `modulRegister`, `ModulesView`,
`lotGrundwerte` (Kontrast im dunklen Satz).

**E66 — Start/Stopp schlank: Karte „Arbeitstag“ auf Start und Zeiterfassung, Leiste auf allen anderen Seiten (08.11.2026).**
Auftrag nach M06 (E63): der Timer wirkte „sperrig“, „nicht sonderlich intuitiv
integriert“ und gehört „auch auf die Startseite“. Freigegeben am 08.11.2026
nach Entwürfen („die runden Knöpfe finde ich gut, aber es wirkt noch zu
überladen“, „die schlanke Version finde ich gut so“, „die abgerundeten Kanten
der Boxen eher weniger“, „ja baue den Timer wieder“).

- **Ein Stand für die ganze App:** `ZeitsitzungAnbieter` im Layout lädt,
  gleicht alle 30 Sekunden ab und sendet (auch ohne Netz über das
  Ausgangsfach) — Karte, Leiste und „Abschnitte prüfen“ lesen dieselbe
  Sitzung. Vorher lud jede Stelle für sich.
- **Karte „Arbeitstag“** (eckiges Blatt wie jede Karte, rund nur die Knöpfe):
  vor Beginn ein runder Start-Knopf und die Baustelle (freiwillig; vorgewählt
  ist die laut heutigem Einsatz, ohne Einsatz keine — nichts wird erraten);
  läuft: „Läuft seit HH:MM“, die Arbeitszeit als Uhr, die Baustelle zum
  Wechseln, rund Pause und Feierabend; Pause: „Pause seit“, „Arbeit bisher“,
  Weiterarbeiten und Feierabend. „Verwerfen …“ steht leise darunter.
  Auf der Startseite verweist sie auf beendete Arbeitstage, die noch zu
  prüfen sind.
- **Leiste:** solange ein Arbeitstag läuft, auf jeder Seite außer Start und
  Zeiterfassung (dort steht die Karte): Punkt, Uhr, Baustelle bzw. „Pause“,
  Pause/Weiter und Feierabend. Am Telefon steht sie fest über der
  Reiterleiste; das Layout rechnet ihre Höhe in `--reiter-hoehe` ein, so
  rücken Aktions- und Warenkorbleisten von selbst darüber. Im Gespräch der
  Nachrichten bleibt sie am Telefon weg (dort steht unten die Eingabe). Ab
  dem Tablet klebt sie unten im Inhalt.
- **Feierabend führt zu „Abschnitte prüfen“** in der Zeiterfassung; gebucht
  wird weiter erst dort (E63 unverändert). Die Prüfung der Abschnitte, das
  Verwerfen mit Grund, die Erinnerung und das Weiterlaufen bleiben wie in M06.
- **Linie:** neu nur `src/styles/lot-timer.css` (runde Knöpfe, Karte, Leiste);
  keine Rundung an Blättern, nur Tokens, keine Schatten.

**Grenze mit Grund:** keine. **Nachweis:** `Arbeitstag.test.tsx` (Vorwahl aus
dem Einsatz geht mit dem Start hinaus — Gegenprobe ohne `vorschlag` rot;
Seitenregel der Leiste — Gegenprobe ohne die Regel rot; Stände läuft, Pause,
ohne Modul, Verweis), `zeitsitzung.test.ts` (Uhr und Dauern),
`arbeitstag.spec.ts` (Start auf der Startseite, Leiste unterwegs über der
Reiterleiste, Pause aus der Leiste, Feierabend, Abschnitte prüfen — auf allen
Monteurbreiten), `m06Zeit.spec.ts` (alle bisherigen Timerwege auf der Karte).

**E67 — Fünf Kleinigkeiten nach dem Timer: Push bei Nachrichten, weiße Seite beim Start, Startbildschirm in der Linie, Abstand beim Verwerfen, Suchfeld der Nachrichten (09.11.2026).**
Auftrag: „Nachrichten senden keine Pushbenachrichtigungen“, „bleibt die Seite
beim ersten Aufrufen weiß“, „der Anmeldung-prüfen-Screen wurde seit Ewigkeiten
nicht mehr an die neue Designlinie angepasst“, „bei Zeitsitzung verwerfen
klebt der Button am Textfeld“, „die Suche bei Nachrichten hat noch diese
komische Border innen“.

- **Push:** Die Kette auf dem Server stimmt (lokal nachverfolgt bis zum
  Versand: ein Empfänger, ein Gerät; die Function ist seit #426 eingespielt).
  Auf dem Gerät waren drei Lücken.
  - Bei sichtbar offener App gibt Firebase die Meldung an die Seite, und die
    hörte nicht zu. Jetzt zeigt die Seite sie über den Service Worker an,
    außer man steht schon dort (`PushVordergrund`, `pushImVordergrund`).
  - Dieselbe Kennung je Gespräch ersetzte die vorige Meldung ohne Ton und
    Vibration, so meldete sich die zweite Nachricht im selben Gespräch
    nicht. Jetzt mit `renotify` (Worker und offene App,
    `lib/pushAnzeige.ts`).
  - Das Gerätezeichen wurde nur beim Einschalten geholt. Jetzt wird es beim
    Start abgeglichen, aber nur, wo Meldungen in der App eingeschaltet
    wurden. Geräte von vorher übernehmen ihr Zeichen, wenn der Server es
    für die Person kennt.
- **Weiße Seite:** Nachgestellt mit einem Produktionsbau. Nach dem Übernehmen
  einer Fassung flog der ganze Speicher der Bausteine weg, auch der Einstieg
  der laufenden Fassung. Beim nächsten Deploy lieferte der Worker deren
  Hülle aus, und ihr Einstieg lag weder im Speicher noch auf dem Server
  (504): weiß bis zum Neuladen. Behoben an zwei Stellen:
  - Beim Übernehmen bleibt, womit die laufende Hülle startet.
  - Eine Hülle, der ein Start-Baustein fehlt, wird nicht ausgeliefert;
    stattdessen kommt die frische aus dem Netz (ohne Netz bleibt es bei der
    vorgehaltenen).
- **Startbildschirm** („Anmeldung wird geprüft …“): Er liegt auf dem
  Zeichentisch der App (dasselbe Raster wie danach unter dem Inhalt), mittig
  die Marke und darunter das pendelnde Lot. Keine Karte. Er erscheint weiter
  sofort (`StartLaden`).
- **Zeitsitzung verwerfen** in „Abschnitte prüfen“: Aufbau wie in der Karte
  „Arbeitstag“ — Abstand zwischen den Teilen, Abbrechen und Verwerfen im
  Fuß.
- **Suchfeld der Nachrichten:** wie bei der Listensuche. Innen kein zweiter
  Ring, außen der Tastaturrahmen.

**Grenze mit Grund:** Ob eine Meldung auf dem Gerät erscheint, entscheidet
am Ende das Betriebssystem. Auf dem iPhone kommt Push nur in der zum
Home-Bildschirm hinzugefügten App, und die Mitteilungen müssen erlaubt sein
(liegt beim Gerät). **Nachweis:**
- `serviceWorker.test.ts` (Hülle und Aufräumen, Gegenprobe mit dem alten
  Worker rot);
- `swPush.test.ts` (renotify, gleiche Form in Worker und App);
- `PushVordergrund.test.tsx` (Anzeige, Abgleich, Gegenproben rot);
- `LadenStart.test.tsx`, `Planlinie.test.tsx`;
- `Arbeitstag.test.tsx` (Verwerfen-Bogen, Gegenprobe rot);
- `nachrichten.spec.ts` („Suche in den Nachrichten“, Gegenprobe rot).

**E68 — Die Startseite selbst einrichten: Zahlen oben wählen und ordnen, Bereiche und Themen ausblenden (09.11.2026).**
Auftrag: „Nutzer sollten die Startseite selbst konfigurieren können, was sie
angezeigt haben wollen, auch die Zahlen oben … ist das gut umsetzbar? Wenn ja,
starte direkt.“

- **Was wählbar ist:**
  - **Zahlen oben:** höchstens vier, in eigener Folge. Wählbar sind die neun
    Kennzahlen der Startseite (Saldo, Resturlaub, offene Anforderungen,
    knappe Artikel, offene, überfällige und im Monat bezahlte Rechnungen,
    aktive Baustellen, Auslastung der Woche), aber nur, was Rolle und
    Module ohnehin erlauben (`waehlbareKennzahlen`).
  - **Bereiche:** die Karte „Arbeitstag“ und der Tagesüberblick (Einsatz,
    Termine, heute).
  - **Themen unter „Zu erledigen“:** je Rolle (`THEMEN`).
- **Was fest bleibt:**
  - Wer was sehen darf: Eine Kennzahl erscheint nur, wenn die Rolle ihre
    Zielseite sehen darf und ihre Daten geladen sind. Eine gespeicherte
    Wahl, die nicht mehr passt, fällt still heraus.
  - Die Warnungen zum Zustand der App (Nachtläufe, fehlendes
    Eintrittsdatum, „Nicht geladen“).
  - „Zeit erfassen“ im Kopf.
- **Ausgeblendet heißt nicht verschwunden** (Grundsatz 3). Steht ein
  ausgeblendetes Thema an, nennt „Zu erledigen“ unten „Ausgeblendet: 2
  Themen mit 5 Einträgen · anzeigen“, und ein Tipp zeigt es. Ist nur
  Ausgeblendetes offen, steht nicht „Heute liegt nichts an“.
- **Ohne eigene Wahl** gilt die Vorgabe der Rolle, also die Startseite von
  vorher. Gespeichert wird nur, was von der Vorgabe abweicht; „Vorgabe
  wiederherstellen“ setzt zurück.
- **Je Person, nicht je Gerät:** Die Wahl liegt in der Datenbank, eigene
  Tabelle `startseite_wahl`, damit Telefon und Schreibtisch gleich sind.
  Sie steht bewusst nicht in `user_prefs`: Dort sind die Spaltenvorgaben
  der Meldungen `false`, und die erste Zeile hätte die Meldungen zu
  Anforderungen still abgeschaltet.
  - Lesen darf nur die Person selbst, auch nicht die Geschäftsführung.
  - Geschrieben wird nur über `startseite_speichern`, das die Form prüft.
  - Der Supportzugang schreibt nie; im Einblick gilt die Vorgabe.
  - Die Wahl steht in der Datenauskunft und geht beim Löschen der Person
    sofort.
- **Ort:** „⋯ › Startseite anpassen …“ im Seitenkopf, ein Bogen mit drei
  Gruppen. Ist der Arbeitstag auf der Startseite ausgeblendet, steht dort
  die Timer-Leiste.
- **Laden:** Beim ersten Aufbau wartet die Seite auf die Wahl, damit nichts
  umspringt. Steht schon ein Stand da, wartet sie nie darauf, sonst hinge
  ohne Netz die ganze Startseite an ihrer Einrichtung.

**Grenze mit Grund:** Die Reihenfolge der Bereiche und der Themen ist fest.
Die Themen ordnet die Dringlichkeit (Dringend, Heute, Diese Woche), die
Bereiche die Linie (Zu erledigen links, der Tagesüberblick rechts); eine
freie Folge bräche beides (fachlich). **Nachweis:**
- `startseiteWahl.test.ts` (Datenbank: nur die eigene Wahl, Formprüfung,
  `user_prefs` unberührt, Auskunft und Löschung; Gegenproben rot);
- `startseiteEinrichtung.test.ts` (wählbar je Rechten; der Katalog deckt
  jedes Thema des Aufbaus, Gegenprobe rot);
- `DashboardView.test.tsx` (Folge, nur Gewähltes, nie Verbotenes,
  Ausgeblendetes mit Zahl, Tagesüberblick, Bogen mit höchstens vier,
  Vorgabe; Gegenproben rot);
- `Arbeitstag.test.tsx` (Leiste auf der Startseite);
- `startseiteEinrichten.spec.ts` (Browser auf allen Monteurbreiten: bleibt
  nach dem Neuladen, Vorgabe zurück; Gegenprobe rot).

**E69 — Push-Meldungen: der Worker zeigt jede selbst, das Gerät bleibt angemeldet, Probemeldung in „Mein Konto“ (09.11.2026).**

Anlass: „Die Push-Benachrichtigungen für Nachrichten funktionieren immer
noch nicht.“ E67 hatte nur bis zum Versand an Google geprüft. Diesmal die
ganze Kette bis zur Anzeige, auch im echten Browser. Der Versand zu Google
lief: Materialmeldungen hat der Betrieb am 29.09.2026 auf dem iPhone
bestätigt. Nachrichten probiert man aber mit offener App aus — und genau
dann ging es schief. Gefunden:

- **Stille Meldungen auf dem iPhone.** Bei sichtbarer App gab Firebase die
  Meldung an die Seite weiter und zeigte selbst nichts; im Hintergrund wurde
  die Anzeige nicht abgewartet (der Handler gab das Versprechen nicht
  zurück). iOS wertet beides als stille Meldung und nimmt der Seite nach
  wenigen davon das Abonnement. Wer mit offener App schreibt und liest, löste
  das gerade beim Ausprobieren aus. **Jetzt:** `public/sw.js` hört als Erster
  auf `push`, zeigt die Meldung in `waitUntil` und lässt Firebase das
  Ereignis nicht mehr sehen. Die Anzeige hängt nicht mehr daran, dass die
  Firebase-Bibliotheken geladen werden konnten.
- **Im Gespräch selbst** keine Meldung — außer auf WebKit (iPhone, iPad,
  Safari), das zu jeder Push-Nachricht eine Anzeige verlangt: dort erscheint
  sie ohne Ton. Wo das Fenster steht, fragt der Worker das Fenster
  (`ortGefragt`, Antwort aus `PushAnmeldung`): die App wechselt Seiten ohne
  Neuladen, und die Adresse, die der Worker kennt, ist die vom Laden
  (gemessen in Chromium). E67 hatte das an der Seite entschieden;
  `lib/pushAnzeige.ts` und `PushVordergrund` entfallen.
- **Nach Ab- und Anmelden kam nichts mehr.** Das Abmelden meldet das Gerät für
  die Person ab (richtig, sonst bekäme der Nächste am geteilten Gerät ihre
  Meldungen), danach meldete es niemand wieder an. „Mein Konto“ zeigte
  trotzdem „angemeldet“, weil es nur die Erlaubnis des Browsers ansah.
  **Jetzt:**
  - Der Merker `senklot.pushAn` gilt für das Gerät und bleibt beim Abmelden
    stehen.
  - Beim Start (`pushAbgleichen`) wird das Gerät für die angemeldete Person
    angemeldet, wenn der Server sein Zeichen nicht kennt. Das deckt auch ein
    erneuertes Zeichen und ein vom Server abgeräumtes ab.
  - Nur „Auf diesem Gerät abschalten“ nimmt den Merker weg und meldet bei
    Firebase ab; dann bleibt das Gerät aus.
  - „Bereit“ heißt: der Server kennt das Zeichen dieses Geräts für diese
    Person.
  - Geräte von vorher gelten als eingeschaltet, wenn sie ein gemerktes
    Zeichen (E67) oder ein Abonnement haben, das der Server für die Person
    kennt. Wer früher abgeschaltet hat, hat keines davon und bleibt aus.
- **Ablehnungen von Google sah niemand.** `push-melden` antwortete immer 200,
  die Wache zählte das als zugestellt. **Jetzt:** Lehnt Google ab, ohne dass
  das Gerät tot ist (`abgelehnteCodes`), antwortet die Function 502 mit dem
  Code, und „Kommen die Meldungen an?“ zeigt ihn.
- **Die Nachricht an Google** (`fcmNachricht`, für alle Meldungen gleich):
  - ohne `webpush.fcm_options.link`: Die Schnittstelle verlangt dort eine
    https-Adresse, es stand ein Pfad. Angenommen hat Google ihn bisher (Push
    kam am 29.09.2026 auf dem iPhone an), verlassen wird sich darauf nicht
    mehr. Gebraucht wurde das Feld nie, weil der Worker anzeigt;
  - mit `Urgency: high`, damit sie nicht erst nach dem Stromsparen kommt.
- **Probemeldung** in „Mein Konto“ (`push-probe`): schickt auf demselben Weg
  eine Meldung an das eigene Gerät und zeigt Googles Antwort.
  - Gesendet wird nur an ein Zeichen, das der Server für die anrufende
    Person kennt.
  - Kennt Google das Gerät nicht mehr, wird es einmal frisch angemeldet und
    die Probe wiederholt.

**Mitgenommen:** Der Monatskalender rundete unten noch: Die Kästchen in den
unteren Ecken rundeten selbst mit, aus der Zeit, als der Rahmen rund war und
die Markierung des Tages in der Ecke abschnitt. Der Rahmen ist seit E33
eckig, also standen sie rund aus der Hülle. Jetzt ist alles eckig, auch im
Fenster (`rounded-none`). Nachweis: `MonthCalendar.test.tsx`, Gegenprobe rot.

**Grenzen mit Grund:**
- „Google hat angenommen“ heißt noch nicht „erschienen“. Ob das Telefon sie
  zeigt (Mitteilungen erlaubt, Fokus, „Nicht stören“), liegt beim Gerät, und
  eine Seite kann es nicht abfragen. Die Probemeldung sagt das dazu.
- Auf dem iPhone erscheint die Meldung auch im Gespräch selbst, ohne Ton.
  Grund: iOS verlangt zu jeder Push-Nachricht eine Anzeige und entzieht
  sonst das Abonnement (liegt beim Gerät).
- Auf einem geteilten Gerät bekommt, wer sich anmeldet, die Meldungen dieses
  Geräts, solange es nicht ausdrücklich abgeschaltet wurde. Grund: die
  Erlaubnis gilt für das Gerät. Wer die Meldungen eines anderen nicht sehen
  soll, bekommt sie nicht: das Abmelden meldet die vorige Person ab.
- Ein Gerät von vorher, dem iOS das Abonnement schon entzogen hat, wird nicht
  still wieder angemeldet: es ist von einem abgeschalteten nicht zu
  unterscheiden. „Mein Konto“ zeigt dort jetzt „bekommt noch keine
  Meldungen“; einmal einschalten genügt. Grund: Datenschutz.

**Nachweis:**
- `swPush.test.ts` (echter Worker, Push-Ereignis, Ort des Fensters,
  WebKit; Gegenprobe mit dem alten Worker rot);
- `pushMeldung.spec.ts` (angemeldete App in Chromium, Push über
  `ServiceWorker.deliverPushMessage`; Gegenprobe mit dem alten Worker rot);
- `PushAnmeldung.test.tsx` (Ab-/Anmelden, anderes Konto, Abschalten,
  Abgleich, Zustand, Probe);
- `PushOrt.test.tsx`, `MeinKontoProbe.test.tsx`;
- `fcmVersand.test.ts`, `notifyLogic.test.ts`;
- `pushProbe.test.ts` (Supabase: nur das eigene Gerät, bis zum Versand).

**E70 — Durchsicht aller Abläufe: 29 Lücken geschlossen, Feinschliff am Handy, Rückmeldung beim Antippen (09.11.2026).**

Anlass: Auftrag, die ganze Software und alle Abläufe auf Fehler, Lücken und
Schwächen zu prüfen und sie nachhaltig zu beheben, danach die Oberfläche quer
durch alle Seiten anzusehen. Acht unabhängige Prüfungen je Bereich (Zeit,
Rechnungen, Vertrieb, Baustellen und Planung, Material, Nachrichten und
Startseite, Verwaltung und Rechte, Datenschicht und Offline). Gemeldet wurde
nur, was einen konkreten Fehlerweg hatte; jeder Befund wurde vor dem Ändern
im Code nachvollzogen, jede Behebung hat eine Prüfung mit Gegenprobe. Was
behoben ist, steht im Stand (Abschnitt 67); die neuen Grenzen mit Grund in
`docs/grenzen-durchsicht-2026-10-24.md`.

**Entschieden:**
- **Verbuchtes wird nur mit Gegenbuchung gelöscht** (`anforderung_loeschen`,
  ein Riegel an der Tabelle). Löschen bleibt möglich — ein Tippfehler in
  einer Retoure muss weg können —, aber Bestand und Rechnungsvorschlag
  laufen nicht mehr auseinander.
- **Umlagern über die freie Menge nur nach Rückfrage** wie bei „Aus Lager“
  (K2): wer Zugesagtes ins Fahrzeug lädt, tut es wissentlich.
- **„Rechnung (ganze Leistung)“ neben einer offenen Anzahlung wird nicht
  gesperrt**, sondern mit einer Achtung-Zeile und „Als Schlussrechnung
  stellen“ angezeigt: eine Zusatzleistung neben einer laufenden Anzahlung
  ist legitim.
- **Die eigene Rolle ändert eine zweite Leitung** — wie schon der eigene
  Status. In der Akte gesperrt und in der Datenbank verriegelt.
- **Das Ausgangsfach hat eine Abbruchfrist**, andere Schreibvorgänge weiter
  nicht: nur dort ist jeder Vorgang wiederholbar gebaut.

**Oberfläche (Linie „Lot“ unverändert, nur Feinschliff):**
- Titel am Handy: jede Zeile eine Rasterzelle (24 px), einzeilig weiter 48 px
  — ein langer Name lief vorher über drei 48-px-Zeilen.
- Lange Namen in der Einsatzkarte mit Trennstrich (D3), „Rechnungen“ in der
  unteren Leiste ungekürzt, Suchhinweise mit Auslassungspunkten, die
  Summenzeile im Rechnungsblatt auf der Flucht der Zeilen.
- **Mikroanimationen, wo sie Rückmeldung geben, ohne Geometrie:** eine ganz
  antippbare Zeile färbt sich beim Drücken (100 ms, wie ein Knopf), der Haken
  im Kästchen erscheint mit einer kurzen Bewegung, eine neue Zahl am
  Menüpunkt blendet ein (160 ms). Keine Grössen- oder Lageanimation, bei
  reduzierter Bewegung aus — im Rahmen des Premium-Feinschliffs vom
  28.10.2026. Bewusst nicht: zählende Kennzahlen, wandernde Reiterstriche,
  federnde Knöpfe — sie zögen den Blick von der Arbeit ab.

**Nachweis:** je Befund Unit-, Komponenten- oder Supabase-Prüfung, ohne die
Änderung rot; Stilregeln in `planlinieStil.test.ts`; Vorschau startfähig
(`vorschauErsatz.test.ts`).
