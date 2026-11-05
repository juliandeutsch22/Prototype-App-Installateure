# Senklot — SHK-Fahrplan und kritische Produktbewertung

Stand: 05.11.2026. Grundlage ist die korrigierte Datei „Senklot vs. APVROS – funktionale Unterschiede innerhalb der App“.

## Dateien

- [Kritische Bewertung aller 84 Punkte](Senklot_SHK_Kritische_Produktbewertung_2026-11-05.md) — Empfehlungen mit funktionaler Begründung; Aufwand ist kein Streichkriterium.
- [Vollständiger Masterprompt](Senklot_SHK_Integrationsfahrplan_Masterprompt_2026-11-05.md) — Codeabgleich, Architektur, UI, Daten, Rechte, Offline, Migrationen, Paketfolge und Abnahme.
- [84 strukturierte Produktentscheidungen](Produktentscheidungen_84_Punkte.json).
- [Vollständigkeitsprüfung](Vollstaendigkeitspruefung.json).
- [Gesamtpaket als ZIP](Senklot_SHK_Integrationsfahrplan_2026-11-05.zip).

Alle 84 Original-IDs sind einzeln geplant, kritisch bewertet und einem primären Umsetzungspaket zugeordnet. 17 Punkte behalten, 36 integrieren, 22 bedarfsspezifisch optional, 8 fachlich ändern und 1 ersetzen. Integration bedeutet Funktionsfähigkeit behalten, aber gemeinsame Daten/Aktionen statt Parallelmodule. Optional bedeutet vollständig nutzbar bei entsprechendem Betriebszweck.

Die Bewertungen sind Empfehlungen. Die Zustimmung zur öffentlichen Bereitstellung ist keine Freigabe von Funktionsstreichungen oder zur Implementierung. Die App blieb unverändert. Der statische Codeabgleich am main-Commit 62db192 ersetzt keine neue vollständige CI-/Produktiv-/Fremdsystemprüfung.

Die erste andere Katalogdatei ist ersetzt; keine aus ihr übernommene P0-/P1-Priorisierung oder pauschale Pilotwochen als Voraussetzung. Die maschinelle Prüfung bestätigt die ID-Abdeckung und Zuordnung, nicht die fachliche Fehlerfreiheit einer zukünftigen Implementierung.
