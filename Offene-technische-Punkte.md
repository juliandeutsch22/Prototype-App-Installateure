# Offene technische Punkte — Senklot, 14.10.2026

Stand: ausgeliefert ist `d4b8542`. Die 13 bestätigten Fehler F01–F13 sind behoben. PR-CI, Merge und Produktionsdeployment sind abgeschlossen. Die folgenden Punkte sind noch ausstehende technische Arbeiten oder Nachweise; sie sind keine Behauptung, dass eine vorhandene Funktion kaputt ist.

| Priorität | Punkt | Was noch nachzuweisen/zu erledigen ist | Abhängigkeit |
|---|---|---|---|
| 1 | Echte Geräte / PWA | iPhone und Android: Kamera, Fotos, Unterschrift, Push-Zustellung, Startbildschirm-Installation, Offline-Buchung und Wiederaufnahme, Versionswechsel mit vorhandenen Tabs prüfen. Browserautomation einschließlich WebKit ist bereits grün, ersetzt diese Geräteeigenschaften aber nicht vollständig. | Physische Geräte, Testkonten, produktive Push-Konfiguration |
| 1 | Produktives Backup und Wiederherstellung | Einen echten nächtlichen Lauf, externe Ablage, Vollständigkeit aller Teile und einen Rücklauf in eine isolierte Umgebung einschließlich Storage-Dateien/Fotos nachweisen. DB-Snapshot und lokaler Rücklauf sind getestet. Supabase-Tarif, PITR, Aufbewahrung und Laufüberwachung am Zielsystem bestätigen. | Betreiberzugänge zur Infrastruktur; isoliertes Wiederherstellungsziel |
| 1 | SMTP und eigene Domain | Die tatsächliche Zielkonfiguration bestätigen und Einladungs-/Passwort-Mails bis zur Zustellung prüfen; erlaubte Weiterleitungsadressen, SPF/DKIM/DMARC und Links der gewünschten Domain prüfen. Es wurde nicht festgestellt, dass SMTP zwingend fehlt. | SMTP-/DNS-Zugang und Testempfänger |
| 1 | Volle CSP durchsetzen | Nach dem Gerätedurchgang die protokollierten Verstöße bewerten und die vollständige Richtlinie von „nur melden“ auf „sperren“ umstellen, anschließend Push, PDFs, Fotos, Anmeldung und externe Verbindungen nachprüfen. Teil-CSP und weitere Sicherheitskopfzeilen sind bereits aktiv. | Erfolgreicher Gerätedurchgang, Fehlerprotokoll |
| 2 | K4: UI-/Lastvergleich | Bestehende Vorher-/Nachher-Fotos durch maschinelle Bestandsvergleiche und Messungen mit dokumentiertem Mengengerüst ergänzen. Nicht pauschal jede optische Abweichung als Fehler behandeln. | Historischer App-Stand und identischer Testbestand |
| 2 | Gehostete DB-Leistung | Tatsächliche teure Abfragen, `pg_stat_statements`, Indexempfehlungen, `statement_timeout`, Autovacuum und Compute-Größe prüfen. Nur belegte Engpässe ändern. Lokale Prüfung ersetzt diese Messung nicht. | Lesender Zugang zum gehosteten Projekt |
| 2 | K7: Rücksprungtags | Die 13 vorbereiteten Git-Tags veröffentlichen und ihre Commit-Zuordnung verifizieren. Sie fehlen weiterhin. Tags sind Bezugsstände; sie erlauben keinen konfliktfreien selektiven Rückbau heutiger Änderungen. | GitHub-Berechtigung für Tags |
| 2 | Echter Absturz/Wiederanlauf | Die Generationstrennung von `pg_net`/Wächter nach erzwungenem DB-Absturz und tatsächlicher Crash-Recovery lokal oder in einer isolierten Testumgebung prüfen. Bisher wurde der Verlust des unlogged Zustands kontrolliert simuliert. | Isolierte DB-Testumgebung |
| 2 | Browser-/Rollenmatrix | R4-Planungswege zusätzlich mit Projektleiter und Administrator, WebKit und den vorgesehenen Breiten prüfen. Tablet quer und Dialog-Barrierefreiheit breiter dauerhaft automatisieren, wenn der einmalige Nachweis nicht ausreicht. Den einmaligen WebKit-Timeout nur bei erneuter Reproduktion gezielt untersuchen; die letzte vollständige CI ist grün. | Browserumgebung, passende Testrollen |
| 2 | Echte VIES-Verbindung | Einen tatsächlichen Abruf aus dem gehosteten Projekt samt gespeicherten Nachweisen überprüfen. Lokale Prüfungen verwenden echte Antwortformen, aber keinen nachgewiesenen produktiven Erstabruf. | Berechtigte Test-UID und Zielprojekt |

## Bedingte Punkte

- **Historische Daten:** Zuerst lesend prüfen, ob Dubletten, alte unvollständige Wartungszuordnungen oder verwaiste Mitarbeiterkonten vorhanden sind. Ohne Befund keine automatischen Löschungen oder Zusammenführungen. Altlasten wurden nicht als vorhandener Produktionsschaden nachgewiesen.
- **Dokumentlinks:** Signierte Links gelten bis zu einer Stunde weiter. Nur wenn sofortiger Widerruf fachlich verlangt wird, einen anderen Abrufweg bauen.
- **Kanzleiimport:** BMD-/Zahlungsstapel sind gebaut; der echte Import mit der Kanzlei fehlt als Integrationsnachweis. Anpassungen erst nach konkreter Importdefinition bzw. festgestellter Abweichung.
- **Pilotbetrieb:** Mindestens zwei Wochen Betrieb ohne offene Rückmeldungen hoher Schwere sind als Abnahme dokumentiert, aber hier noch nicht nachgewiesen.

## Erweiterungen, kein Fehlerbehebungsrest

Mailversand für Angebote/Rechnungen, Prüfprotokolle, Personalnummer/Lohnarten, Gleitzeit/Durchrechnung, Zeitbuchungs-Änderungsprotokoll, Aboabrechnung und „Tag buchen“ sind gesonderte Produktaufträge. Rechts-/WKO-Freigaben, Betreiberangaben und Regeln nach Ende der Aufbewahrungsfrist sind fachliche bzw. rechtliche Entscheidungen.

Quellen: `docs/stand-2026-10-03.md` (11, 14, 17–19), `docs/offene-punkte.md`, `docs/pruefung-2026-10-13-behebungen.md` und `/workspace/Auslieferungsnachweis-Senklot-2026-10-14.md`.
