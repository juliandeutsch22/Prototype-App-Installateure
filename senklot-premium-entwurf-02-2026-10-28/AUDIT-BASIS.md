# Weiterhin offene technische Befunde

Entwurf 02 ändert keine Anwendung. Die neun Befunde der vorherigen Prüfung sind **weiterhin offen**. Die Screens zeigen gewünschte Rückmeldungen, keine behobenen Produktionsfehler.

Basis: [App-Stand 7601e378](https://github.com/juliandeutsch22/Prototype-App-Installateure/tree/7601e3781d4645aed2479bb8bbae9a1742e57b5b). [Vollständiger ursprünglicher Audit mit Quellverweisen und Reproduktionsnachweisen](https://github.com/juliandeutsch22/Prototype-App-Installateure/blob/93d974cbe0c78db58438f0b8a23329e7414a8d32/senklot-premium-entwurf-2026-10-28/AUDIT.md).

| ID | Priorität | Konkreter Befund | Spätere Umsetzung |
|---|---|---|---|
| F01 | P0 | Nach bestätigter Rechnung kann ein PDF-Fehler als vollständig gescheiterte Erstellung gemeldet werden. Im unveränderten React-Baustein reproduziert. | Bestätigte Beleg-ID behalten, PDF getrennt erneut laden. Keine zweite Rechnung erzeugen. |
| F02 | P0 | Endgültig abgelehnte vorgemerkte Buchung wird als nach 3,5 Sekunden verschwindender Fehler-Toast angezeigt. Im React-Baustein reproduziert. | Wichtige Rückmeldung bis zur bewussten Bestätigung erreichbar halten. Haltbarkeit über App-Neustart separat entscheiden. |
| F03 | P1 | Geänderte Firmendaten gehen beim internen Seitenwechsel ohne Rückfrage verloren. In der lokalen Originalvorschau reproduziert. | Vorhandenen Änderungsschutz für alle Felder einschließlich Logo und Farben anbinden. Interne Links, Zurück und Neuladen getrennt abnehmen. |
| F04 | P1 | Bei neuer Katalogsuche bleiben alte Treffer zeitweise auswählbar. Im React-Baustein reproduziert. | Suchgeneration beachten, alte Treffer während neuer Suche nicht als aktuelle anbieten. |
| F05 | P1 | Globaler Offline-Text verspricht pauschal Ablage und Nachsenden, obwohl nur bestimmte Schreibwege das unterstützen und lokale Ablage scheitern kann. Quellcode-Bewertung. | Zusage erst nach bestätigter lokaler Vormerkung, Offline-Grenzen pro Vorgang korrekt benennen. |
| F06 | P1 | Unterbrochene Rechnungsantwort beweist keinen Rollback. Quellcode-Bewertung; kein Produktionsfehler provoziert. | Sicheren Statusabgleich mit Zuordnung zum konkreten Erstellungsversuch klären. „Status prüfen“ im Modell löst diese technische Frage nicht; eventuell separate API-Arbeit nötig. |
| F07 | P1 | Bestätigtes Speichern und gescheitertes Nachladen der Firmendaten laufen in denselben Fehlerpfad. Im React-Baustein reproduziert. | Speicherergebnis und Aktualisierung getrennt rückmelden. |
| F08 | P2 | UID-/IBAN-/BIC-Fehlertexte sind nicht per aria-describedby an das Feld gebunden. Rot und aria-invalid bestehen bereits. Quellcode-Bewertung. | Vorhandene Fehler zuordnen; keine neuen fachlichen Regeln erfinden. |
| F09 | P2 | Begrenzte Toasts pausieren nicht bei Hover oder Fokus. Quellcode-Bewertung. | Timer auf beiden Wegen pausieren, kritische Meldungen nicht automatisch ausblenden. |

P0 meint hier irreführende Rückmeldungen in kritischen Schreibabläufen. Es wurden keine Produktionsdaten verändert und kein Datenverlust in Produktion nachgewiesen.
