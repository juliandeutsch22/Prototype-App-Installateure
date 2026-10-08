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
nicht selbst erbringen. Die Abnahmeblätter tragen „Freigabe: offen“.

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
