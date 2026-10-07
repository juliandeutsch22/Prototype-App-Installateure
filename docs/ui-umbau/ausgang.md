# Ausgangsstand vor dem Umbau auf die Linie „Lot“ (V1–V7)

| Nr. | Voraussetzung | Stand |
|---|---|---|
| V1 | Arbeitszweig `ui-lot` | angelegt auf `main` 4abb9ca; ausgeliefert wird über den Arbeitszweig der Sitzung (`claude/focused-goldberg-nfa54k`) mit je einem PR je Schritt |
| V2 | Ausgangsstand markiert | Tag `vor-ui-lot` = 4abb9ca (lokal; der Server nimmt nur den Arbeitszweig an — Rückbaustand ist damit der Commit 4abb9ca auf `main`) |
| V3 | Alle Prüfungen grün | 5905: Unit 4125, Datenbank 1738, Browser 35 (chromium, tablet-834), Links 7; WebKit läuft in der CI |
| V4 | Schalter „neue Oberfläche“ je Betrieb | **nicht gebaut**, siehe `entscheidungen.md` E1 |
| V5 | Testbetrieb mit festem Testbestand | Generator für den lokalen Stapel, siehe `messung-vorher.md` |
| V6 | Entwurf im Repository | `docs/design/senklot-designlinie-v2.html`; Protokoll `docs/ui-umbau/protokoll.md` |
| V7 | Fehlerprotokoll | Produktion wird nicht angefasst (CLAUDE.md); im lokalen Stapel vor dem Umbau leer |
