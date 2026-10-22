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
