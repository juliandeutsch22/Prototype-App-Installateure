# Erneute Prüfung vor der Merge-Freigabe

Stand: 09.10.2026. **Noch keine Abschlussfreigabe. Kein Merge oder Deployment.**
Der Nutzer verlangt erst den Abgleich des neuesten Stands und ein konkretes
Prüfergebnis; danach entscheidet er über ein neues Go.

## Neuester Repository-Stand und bereits eingebrachte Änderungen

Main wurde erneut per `git fetch origin --prune` eingelesen:
`078429f33f63e29ea1df2a84fb55458fc1956cab`, PR #257 mit Mitarbeiterübersicht,
Einsatzplanung und Monat. Alle Arbeitsthemen bauen auf diesem Main auf.
Der andere Entwicklungsbranch `claude/focused-goldberg-nfa54k` hat dieselbe
Git-Tree-Kennung wie Main (`62d8e65e14581a051e564d5fbca2b0bfcc6c2fcf`). Seine
anders aufgeteilten Commits werden nicht noch einmal übernommen. Keine offenen
PRs zum Zeitpunkt des Abgleichs.

Von den 181 in #257 geänderten Dateien sind 176 im Arbeitsstand bytegleich
erhalten. Die fünf Überschneidungen sind drei Dokumentationen, die gezielte
Artikelabfrage im Einsatzformular und zusätzliche Vorschau-Ersatzfunktionen.
Nachweis: [r4-erhalt.json](nachweise/r4-erhalt.json). Insbesondere die neue
Mitarbeiterübersicht, Wochen-/Monatsplanung, ihre Komponenten und Referenzen
sind erhalten.

Die Ersetzungen von `person_auskunft` und `person_loeschen` wurden gegen die
jeweils neuesten Definitionen auf Main verglichen: die bereits eingebrachte
Auskunft zu angelegten Zeitbuchungen bleibt enthalten; Mahnbelege und Journal
ergänzen die bisherigen Auskunfts- und Aufbewahrungsregeln.

## Belegte Korrekturen dieser Nachprüfung

- Archiv: Mahnstufen-Metadaten werden nur für die im Zeitraum gemahnten
  Rechnungen gelesen. Frühere Stufen derselben Rechnung bleiben berücksichtigt,
  auch bei einer Rechnung aus einem Vorjahr. PDF-Inhalte werden hier nicht
  geladen. Datenbank-Gegenprobe: vorher genau ein Fall rot, sieben bestehende
  Fälle grün; UI-Gegenprobe ebenfalls rot. Die korrigierten Fälle sind grün.
- Bestehender Urlaub-Migrationstest: spielte alte und alle späteren Migrationen
  erneut über den laufenden Gesamtstand. Mit einer bereits vorhandenen neuen
  Tabelle brach er ab und ließ ältere Funktionsdefinitionen zurück. Gegenprobe:
  genau dieser Fall rot, elf bestehende Fälle grün. Jetzt laufen alte Migration
  und Bestandsprüfung in einer zurückgerollten Transaktion. Die Übernahme der
  sechs Urlaubstage, drei Anträge und der aktivierte Trigger werden weiterhin
  geprüft; alle aktuellen Funktionsdefinitionen sind danach exakt wie vorher.
  Keine produktive Migration dafür umgeschrieben.
- Neue Live-Aktualisierung: zusätzliche Prüfung einer tatsächlich angelegten
  Anforderung sowie Fremdbetrieb-Abweisung mit erfolgreicher eigener
  Kontrolländerung. Die bestehenden 18 Abonnementfälle bleiben erhalten.
- API-Vertragsreferenz: nur drei beabsichtigte optionale Erweiterungen nachgeführt.
  Tatsächliche TypeScript-Gegenprüfung bestätigt, dass die alten Aufrufe weiterhin
  kompatibel sind; keine bestehende API entfernt oder Pflichtparameter ergänzt.
- Abfrageprüfung: explizite Datums- und Rechnungs-ID-Grenzen sowie der bestehende
  Filter laufender Vorgänge werden korrekt erkannt. Keine Finanzsumme abgeschnitten,
  um eine Prüfung grün zu bekommen.
- Widersprüchliche Dokumentation über noch fehlende Monatsübersicht und reine
  Suche im Geladenen korrigiert. Neue R4-Dokumentation bleibt erhalten.

## Tatsächliche Nachweise und Grenzen

184 Migrationen erfolgreich von null auf einer **lokalen** Datenbank eingespielt.
Typen und Lint bestanden. Vollständige Einheitssuite: 4.697 Fälle in 304
Dateien grün (420,60 Sekunden). Gezielte Nachprüfung: 40 Datenbankfälle in drei
Dateien grün. Die Gegenproben und Ergebnisse stehen in `nachweise/`.

Die vollständige Datenbanksuite und Browser-/UI-Prüfung sind
noch im Lauf bzw. ausstehend. Frühere grüne Gesamtzahlen gelten ausdrücklich
nicht als Nachweis dieses integrierten Stands. Die UI-Messung umfasst jetzt
auch R4-Monat, Mitarbeiterwoche und Tablet quer: 40 Ansichten × fünf Breiten.

Der erste integrierte Datenbanklauf ist wegen einer fehlerhaften lokalen
Proxy-Konfiguration und des alten Migrationstests ungültig. Interne lokale
Containerzugriffe gehen jetzt direkt; dieselben Serverfunktionsprüfungen
bestanden danach ohne App-Codeänderung. Kein Produktionsfehler daraus abgeleitet.

Der abgeschlossene Belastungslauf zeigt zwölf Seiten ohne erfasste API- oder
Browserfehler, aber weiterhin unerreichte Leistungsbudgets. Mitarbeiterübersicht:
118,1 Sekunden bis Netzruhe und 22,2 MB auf langsamer Mobilverbindung. Die
Jahreszeiten und Gesamtzeiten für Baustellenbudgets sind umfangreich; für einen
besseren Messwert werden keine fachlich benötigten Zeilen abgeschnitten. Diese
Ansicht ist gegenüber Main unverändert. Messwerte: `../ui-umbau/messung-nachher.md`.

Der vollständige maschinelle UI-Bestandsvergleich ist noch nicht belegt. Der alte
Vorherbestand enthält 66 unvollständig erfasste Seiten. Produktions-CI,
Live-Auslieferung, echte Geräte, fachliche Abnahmen und externer Sicherungsrücklauf
sind ebenfalls nicht durch lokale Tests bestätigt. Keine Aussage „alles vollständig
funktioniert“ oder „bereit zum Merge“, solange diese offenen Nachweise nicht
klar geklärt sind.
