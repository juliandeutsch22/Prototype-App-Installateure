# Rücksprungpunkte der Linie „Lot“

Stand 18, K7 (12.10.2026). Das Protokoll (Abschnitt 9, Punkt 2) verlangt je
Seiten-Schritt einen eigenen Stand mit Tag (`ui-lot-E2` usw.), damit sich ein
Schritt zurückschalten lässt, wenn seine Abnahme im Pilot durchfällt.

## Wie es tatsächlich gelaufen ist

Die Schritte E1–E9 entstanden als je ein Seitenpaket auf dem Arbeitszweig von
#256 und wurden dort einzeln zusammengeführt („Seiten auf Lot, Paket …“). Nach
`main` kam der Umbau als **ein** Commit (21e4d94, #256), Runde 4 als ein
weiterer (078429f, #257). Die Stände der einzelnen Pakete gibt es deshalb nur
auf dem Arbeitszweig; erreichbar sind sie heute über `refs/pull/256/head`
(der Zweig selbst wurde später neu gesetzt).

## Die Punkte

| Tag | Commit | Stand |
|---|---|---|
| `vor-ui-lot` | 4abb9ca | `main` unmittelbar vor der Linie Lot (#255) |
| `ui-lot-grundlage` | f30424d | Grundwerte, Bausteine, Musterseite, Hülle und Navigation, Leitfaden — Basis aller Pakete |
| `ui-lot-E1-start` | 21d6aa9 | Paket start: Startseiten, Mitarbeiterübersicht, Nachkalkulation |
| `ui-lot-E6-scheine` | 1b67327 | Paket scheine: Handwerksscheine, Liste und Schein |
| `ui-lot-E2-planung` | 24c5770 | Paket planung: Wochenplan als Planungsseite, Seitenfenster, Monat |
| `ui-lot-E3-E5-material` | b81132c | Paket material: Lager, Anforderungen, Material anfordern |
| `ui-lot-E8-zeit` | 7ebaea5 | Paket zeit: Zeiterfassung, Urlaub und Anträge |
| `ui-lot-E6-E7-auftraege` | aec99a8 | Paket auftraege: Baustellen, Kunden, Akten |
| `ui-lot-E9-verwaltung` | c87ef1c | Paket verwaltung: Einstellungen, Benutzer, Plattform, Anmeldung |
| `ui-lot-E6-E8-angebote` | c4f91d4 | Paket angebote: Angebote, Angebotsakte, Wartungen |
| `ui-lot-E6-E8-rechnungen` | a3177e3 | Paket rechnungen: Liste nach Dringlichkeit, Seitenfenster |
| `ui-lot` | 21e4d94 | Linie Lot auf `main` (#256) |
| `ui-lot-r4` | 078429f | Runde 4 auf `main` (#257) |

Die Pakete stehen in der Reihenfolge, in der sie zusammengeführt wurden; jeder
Stand enthält die Pakete davor. Mehrere Schritte in einem Paket (E3–E5, E6–E8)
haben einen gemeinsamen Punkt — getrennte Stände gab es nie.

## Gesetzt — oder noch nicht

Die Arbeitssitzung darf per Git nur ihren eigenen Zweig schreiben; das Setzen
der Tags lehnte der Zugang ab (403). **Gesetzt werden sie mit einem Befehl:**

    bash scripts/ui-umbau/ruecksprung-tags.sh

Das Skript holt `main` und die beiden PR-Stände, legt jeden Tag als
beschrifteten Tag an (vorhandene bleiben unberührt) und schiebt sie zu GitHub.
Geprüft am 12.10.2026 gegen einen örtlichen Spiegel: 13 Tags gesetzt und
geschoben, ein zweiter Lauf ändert nichts.

## Was ein Rücksprung heute bedeutet

Ein Tag ist ein **Bezugsstand**, kein Schalter. Einen einzelnen Schritt auf
dem heutigen `main` zurückzunehmen (`git revert -m 1 <tag>`) geht nicht mehr
ohne Handarbeit: am 12.10.2026 ergab das für `ui-lot-E8-zeit` Konflikte in 5,
für `ui-lot-E3-E5-material` in 6 und für `ui-lot-E6-E8-rechnungen` in 7
Dateien — seither wurde an denselben Seiten weitergearbeitet. Ein Rückbau wäre
deshalb ein eigener Auftrag mit allen Prüfungen, kein Knopfdruck. Einen Schalter
je Betrieb (Protokoll 9.1) gibt es nicht (Stand §11, Punkt 3: E1, V4).
