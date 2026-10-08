# Messbasis vor dem Umbau (Phase B, B1/B2)

Stand: Code vor dem Umbau (`6035627`), lokaler Supabase-Stapel, Testbetrieb
`ui-testbestand`. Gleiches Werkzeug für „nachher“ — siehe unten.

## Testbestand „fünf Jahre Betrieb“ (B1)

Erzeugt mit `node scripts/ui-umbau/testbestand.mjs` (nur gegen
`127.0.0.1`/`localhost`; Abbruch bei jeder anderen Adresse). Stichtag
07.10.2026, Bestand ab 01.10.2021.

| Gegenstand | Menge |
|---|---|
| Mitarbeiter (alle Rollen; 3 Lehrlinge, einer unter 18 mit Geburtsdatum) | 25 |
| Kunden | 1.500 |
| Baustellen (40 laufend, 20 pausiert) | 3.000 |
| Angebote (mit je 2 Positionen) | 4.000 |
| Einsätze (die laufenden Baustellen auch in den nächsten zwei Wochen) | 20.000 |
| Zeitbuchungen (6 je Person und Werktag, ohne Überschneidung) | 150.000 |
| Scheine (unterschrieben, storniert, 10 Entwürfe; mit Zeiten und Material) | 15.000 |
| Rechnungen (Einzel, Anzahlung, Schluss; 120 storniert, 99 offen/überfällig/teilbezahlt) | 12.000 |
| Zahlungen | 14.000 |
| Anforderungen (40 offen: Offen, In Bearbeitung, Abholbereit) | 30.000 |
| Lagerartikel / Katalogartikel | 800 / 40.000 |
| Lagerbewegungen | 60.000 |
| Wartungen | 1.200 |
| Urlaubs- und Zeitausgleichsanträge (20 offen) | 3.000 |

Anmeldung: `<kurz>@ui-testbestand.test`, Passwort `Testbestand-2026!`
(`gf`, `admin`, `verwaltung1`, `verwaltung2`, `buchhaltung`, `pl1`–`pl3`,
`monteur1`–`monteur14`, `lehrling1`–`lehrling3`). Der Betrieb bleibt im
lokalen Stapel stehen; `--neu` entfernt nur ihn und legt ihn neu an.

**Grenzen des Bestands.** Geschrieben wird mit der Rolle des
Dienstschlüssels; Auslöser, die für den Dienst aussetzen, rechnen also
nicht mit. Stunden, Summen und „bezahlt“ setzt das Skript selbst. Es gibt
keine Krankmeldungen, Freistellungen, Termine, Rüstlisten, Fotos und
Dokumente; Abwesenheiten sind Urlaubs- und Zeitausgleichsanträge (ohne die
daraus gebuchten Urlaubstage). Für Ladezeit und Mengen reicht das; für eine
fachliche Prüfung nicht.

## Messung (B2)

`node scripts/ui-umbau/messung.mjs vorher` baut die App gegen den lokalen
Stapel (`npm run build` mit `VITE_SUPABASE_URL=http://127.0.0.1:54321` und
dem Anon-Schlüssel der CLI), startet `vite preview` auf Port 4320, meldet
sich als Geschäftsführung des Testbetriebs an und lädt jede Seite dreimal im
Handy-Profil. Je Seite der Median.

- **erste Anzeige**: First Contentful Paint;
- **Inhalt da**: die Überschrift der Seite (`main h1`) ist sichtbar;
- **bedienbar**: das Netz ruht (eine Sekunde keine offene Anfrage). Eine
  echte „Time to Interactive“ misst der Browser nicht; das ist die
  Annäherung, und sie ist streng: eine Liste, die im Hintergrund weiter
  nachlädt, gilt als nicht bedienbar;
- **Anfragen / übertragen**: alle Anfragen bis dahin, übertragene Bytes
  (ohne Zwischenspeicher, also erster Besuch);
- **grösste Liste**: die Tabelle mit den meisten Zeilen über alle
  Datenbankanfragen der Seite (Zeilen aus `Content-Range`).

<!-- messung:anfang -->
**OFFEN: Die vollständige Messung vorher ist nicht gelaufen.** Der Lauf wurde
auf Anweisung beendet, bevor er starten konnte (die lokale Datenbank wurde
für andere Prüfläufe gebraucht). Nachholen auf dem Stand `6035627`:

    node scripts/ui-umbau/testbestand.mjs        # falls der Betrieb fehlt; --neu legt ihn neu an
    node scripts/ui-umbau/messung.mjs vorher     # schreibt diesen Abschnitt und messung-vorher.json

Vorhanden ist nur ein **Probelauf** (ein Lauf je Seite, zwei Seiten, der
Rechner war dabei mit der Bestandsaufnahme ausgelastet — die Zeiten sind
deshalb zu hoch und taugen nicht als Basis; die Mengen schon):

| Seite | erste Anzeige (FCP) | Inhalt da (h1) | bedienbar (Netz ruhig) | Anfragen | übertragen | DB-Anfragen | grösste Liste |
|---|---|---|---|---|---|---|---|
| Lager `/lager` | 1,5 s | 3,4 s | 30,7 s | 50 | 1.071 KB | 17 | 2.000 Zeilen (`materials`) |
| Anforderungen `/anforderungen` | 1,5 s | 2,9 s | 11,2 s | 44 | 251 KB | 11 | 5 Zeilen (`suppliers`) |
<!-- messung:ende -->

## Was das für den Umbau heisst

- **Lager lädt Artikel in Paketen von 1.000 Zeilen** (`materials`, 2.000
  Zeilen in einer Seitenansicht) und braucht im Handy-Profil rund 30 s, bis
  das Netz ruht. Das verfehlt B3 („höchstens 50 Einträge je Anfrage, kein
  ganzer Bestand“) deutlich und ist für den Umbau (E3) ein Haltepunkt nach
  0.3: seitenweises Laden vom Server ist eine Änderung an der Datenabfrage,
  nicht nur an der Darstellung.
- Anforderungen lädt im Probelauf nur den offenen Arbeitsstand (keine
  Antwort über 50 Zeilen); ob „Erledigt“ den ganzen Bestand von 30.000
  holt, zeigt erst die vollständige Messung bzw. ein Klick auf den Reiter —
  die Messung lädt nur die Seite.
- Welche weiteren Seiten über 50 Zeilen je Anfrage holen (Rechnungen,
  Angebote, Baustellen, Kunden, Mitarbeiterübersicht, Planung), ist offen,
  bis die Messung gelaufen ist. Das Skript listet sie dann unter
  „Antworten mit mehr als 50 Zeilen“.
