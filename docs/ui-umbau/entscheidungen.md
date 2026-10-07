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
