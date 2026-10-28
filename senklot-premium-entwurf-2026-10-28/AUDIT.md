# Senklot · UI/UX-Audit und Entwurf · 28. Oktober 2026

**Stand: Entwurf zur Durchsicht. Keine Änderung an der Anwendung, kein Merge, kein Deploy.**

Grundlage ist der vollständige eingefügte „Premium UI/UX Audit & Refinement“-Prompt.
Seine Umsetzungsphase beginnt erst nach der vom Auftraggeber gewünschten Durchsicht
der Screens. Die Prüfung verwendet den aktuellen GitHub- und Produktionsstand
[`7601e378`](https://github.com/juliandeutsch22/Prototype-App-Installateure/tree/7601e3781d4645aed2479bb8bbae9a1742e57b5b).
Die öffentliche Versionsdatei bestätigte `7601e37 · 28.10.2026, 01:00` (Wien).
Die 41 Änderungen seit der Plattformüberarbeitung vom 22. Oktober sind berücksichtigt.

## Ergebnis und gestalterische Entscheidung

Die Lot-Linie ist bereits konsistent genug, um sie gezielt weiterzuführen.
Die neuen Seitenköpfe, ruhigen Stand-Zeilen, Listenleisten und Zeilenspalten
sowie die zuletzt verfeinerte mobile Planung bleiben die Grundlage.
Die größten nachgewiesenen Schwächen betreffen die Aussage nach einer Aktion:
Speichern, Aktualisieren und PDF-Ausgabe werden stellenweise als ein einziges
Ergebnis behandelt. Dazu kommen ungesicherte Formulareingaben und ein
vorübergehend missverständlicher Suchzustand.

Die Screens zeigen dieselbe Gestaltung für diese wiederkehrenden Situationen:

- Ein bestätigter Speicherstand bleibt erkennbar, auch wenn der nächste Schritt scheitert.
- Eine offene Serverantwort erhält einen eigenen unklaren Zustand.
- Eine wichtige Fehlermeldung bleibt bis zur bewussten Bestätigung erreichbar.
- Änderungen sind am Formular als ungespeichert, laufend oder gespeichert zu erkennen.
- Eine neue Suche zeigt nur Ergebnisse, die tatsächlich zu diesem Suchlauf gehören.
- Ein Offline-Hinweis verspricht nur, was der jeweilige Schreibweg nachweislich kann.

Farben, Schriftfamilie Poppins, normale Zahlgewichte, bestehende Navigation,
mobile Reiterleiste, Rollen und Fachbegriffe bleiben erhalten. Die Screens
führen keine neuen Kennzahlen-Kacheln, Illustrationen oder dekorativen Grafiken ein.

## Priorisierte Befunde

P0 bezeichnet hier eine irreführende Aussage zu einem kritischen Schreibvorgang
oder einen möglichen Verlust wichtiger Rückmeldung. Das bedeutet nicht, dass
im Audit Produktionsdaten verloren gingen: es wurden keine verändert.

| ID | Priorität | Betroffen | Konkreter Befund und Auswirkung | Vorschlag | Nachweis | Risiko der Umsetzung |
|---|---|---|---|---|---|---|
| F01 | P0 | Rechnung erstellen → PDF | Nach bestätigtem `rechnungAusstellen` laufen PDF-Import und -Ausgabe im selben `try`. Scheitert erst das PDF technisch, kann der gemeinsame `catch` „nichts angelegt und nichts gesperrt“ ausgeben; „Rechnung erstellen“ bleibt aktiv. Der Nutzer kann den gespeicherten Beleg für nicht vorhanden halten. | Bestätigte ID/Nummer halten; Speichern und PDF getrennt behandeln. Nur das PDF aus dem vorhandenen Beleg erneut erzeugen. | Im unveränderten React-Baustein mit bestätigter Ausstellungsattrappe und absichtlich fehlerhafter PDF-Ausgabe reproduziert. | Mittel: finanzieller Ablauf, sorgfältige Zustandsabnahme nötig; keine Rechen- oder Schemaänderung für diesen bestätigten Fall. |
| F02 | P0 | Nachsenden / `VerloreneBuchung` | Die Warnung über eine endgültig abgelehnte Vormerkung läuft über `toast.error` und verschwindet nach 3,5 Sekunden. Der Kommentar in der Komponente verspricht dagegen eine stehenbleibende Meldung. Eine wichtige Information kann ungelesen verschwinden. | Wichtige Nachsendefehler bis zur bewussten Bestätigung sichtbar halten; Weg zur Prüfung der Buchungen. Keine automatische Neuerfassung. | Komponentenprobe: Meldung direkt vorhanden, nach 3.501 ms verschwunden. | Mittel: Rückmeldung über Senderereignis sauber an Benutzerwechsel und Lebensdauer binden. Für Wiederherstellung nach einem App-Neustart wäre eine gesonderte, kontogebundene Ablage nötig. |
| F03 | P1 | Firmendaten bearbeiten → interner Seitenwechsel | Die Felder leben im lokalen React-Zustand. Anders als die drei Akten verwendet diese Ansicht keinen Schutz für ungespeicherte Änderungen. Beim internen Wechsel gehen Eingaben ohne Rückfrage verloren. | Bestehendes Schutzmuster gezielt übernehmen; sichtbarer Änderungsstand und sichere Rückfrage. Keine zusätzliche Nachfrage ohne tatsächliche Änderung. | Im Browser an der unveränderten Vorschau reproduziert: Firmenname geändert, Kunden geöffnet, keine Rückfrage, bei Rückkehr alter Name. | Mittel: vollständiger Feldvergleich einschließlich Logo/Farben nötig. Browser-Zurück ist eine bekannte Grenze des bestehenden Hooks und muss separat geprüft werden. |
| F04 | P1 | Angebot → Katalogsuche | Bei neuem Suchbegriff bleiben die bisherigen Treffer bis zur Antwort sichtbar und auswählbar. Es gibt für diesen Wechsel keine Zuordnung des sichtbaren Ergebnisses zum Suchbegriff und keinen Ladehinweis. | Suchläufe zuordnen; während des neuen Laufs passender Ladezustand. Bei Fehler erneut dieselbe Suche ermöglichen. Bereits übernommene Positionen erhalten. | Komponentenprobe: „Ventil“ beantwortet, „Kupferrohr“ hängt, altes Eckventil bleibt ohne Kennzeichnung übernehmbar. | Niedrig bis mittel: nur UI-Zustand; Artikelwerte, Preisregeln und Übernahme bleiben unverändert. |
| F05 | P1 | Globales Offline-Band | „Erfasstes wird gespeichert und automatisch gesendet“ erscheint unabhängig vom geöffneten Workflow. Die Offline-Brücke schließt Vorgänge mit serverseitigen Transaktionen ausdrücklich aus; ohne IndexedDB kann auch dort nicht vorgemerkt werden. Das globale Versprechen ist zu weit. | Global nur den Verbindungszustand nennen. „Auf diesem Gerät vorgemerkt“ erst nach tatsächlichem `queued`-Ergebnis am Vorgang. Keine grüne Bestätigung aus `navigator.onLine` ableiten. | Codeanalyse von Verbindungsband, Offline-Brücke und `WriteOutcome`; keine neue reale Netz-/Datenbank-Ausfallprobe in dieser Entwurfsphase. | Niedrig für präzisere Texte, mittel für länger sichtbaren vorgangsbezogenen Status. Keine Ausweitung des Offline-Schreibumfangs. |
| F06 | P1 | Rechnung: Antwort unterbrochen | Eine fehlende Antwort auf die Ausstellungs-RPC beweist keinen Rollback. Der allgemeine Fehlertext behauptet dennoch, dass nichts angelegt wurde. Dieser Fall ist vom nachweislich bestätigten PDF-Teilerfolg F01 zu trennen. | Eigener Zustand „Erstellung noch nicht bestätigt“, Eingaben erhalten, zuerst den tatsächlichen Stand klären. Keine blinde Wiederholung. | Codeanalyse von RPC-Aufruf und Fehlerpfad. Ein tatsächlich verlorenes Server-ACK wurde in diesem Audit nicht nachgestellt. | Hoch / gesonderte technische Klärung: eine sichere Zuordnung zur konkreten Anfrage muss bewiesen werden. Ein Listen-Neuladen allein reicht nicht in jedem Parallelfall. Falls dafür API-/Korrelationsänderungen nötig sind, eigener Auftrag statt visueller Nebenänderung. |
| F07 | P1 | Firmendaten speichern → Anzeige neu laden | `updateCompany` und `reloadCompany` liegen im selben `try`. Bestätigt der erste Aufruf und scheitert der zweite, erscheint „Firmendaten konnten nicht gespeichert werden“. Der Nutzer kann eine bereits wirksame Änderung für gescheitert halten. | Gespeichert und Anzeige aktualisiert getrennt kommunizieren; gezielt nur das Nachladen wiederholen. | Im unveränderten React-Baustein mit bestätigtem Update und anschließend fehlgeschlagener Reload-Attrappe reproduziert. | Niedrig bis mittel: reine Ablaufrückmeldung, bestehende Schreibargumente beibehalten. |
| F08 | P2 | Inline-Validierung, z. B. UID/IBAN/BIC in Firmendaten | Rot und `aria-invalid` sind bereits vorhanden. Die darunter stehenden Erklärungstexte sind an diesen Stellen jedoch nicht mit `aria-describedby` an das Feld gebunden. Beim Fokus auf das Feld fehlt dadurch die direkte programmatische Zuordnung. | Vorhandene Meldung mit stabiler ID verknüpfen; bei mehreren Fehlern eine fokussierbare Zusammenfassung mit Feldverweisen. Validierung selbst unverändert. | Codeanalyse; die automatischen axe-Prüfungen meldeten dafür keinen Verstoß. Kein manueller VoiceOver-Nachweis in dieser Phase. | Niedrig; Fokussprünge nur nach bewusstem Absenden, nicht während jedes Tastendrucks. |
| F09 | P2 | Vorübergehende Benachrichtigungen / Tastatur | Toasts haben feste 3,5-/7-Sekunden-Fristen ohne Pause bei Fokus oder Hover. Besonders bei einer angebotenen Aktion kann die Rückmeldung während des Lesens verschwinden. | Normale kurze Erfolge weiter kurz halten; Frist bei Interaktion anhalten. Dauerhafte Anzeige auf wichtige Fehler und konkrete Handlungsbedarfe begrenzen. | Codeanalyse des zentralen Toast-Anbieters. Die kritische konkrete Auswirkung ist durch F02 belegt. | Niedrig bis mittel: Timerabbau, Tastatur, mehrere Meldungen und reduzierte Bewegung prüfen. |

### Präzise Quellen im geprüften Stand

- [Rechnung: Ausstellung und anschließende PDF-Ausgabe](https://github.com/juliandeutsch22/Prototype-App-Installateure/blob/7601e3781d4645aed2479bb8bbae9a1742e57b5b/src/features/invoices/InvoicesView.tsx#L1681), Fehlertext ab Zeile 1934.
- [Ausstellungs-RPC](https://github.com/juliandeutsch22/Prototype-App-Installateure/blob/7601e3781d4645aed2479bb8bbae9a1742e57b5b/src/lib/db/pg/invoices.ts#L615).
- [Nachsendefehler](https://github.com/juliandeutsch22/Prototype-App-Installateure/blob/7601e3781d4645aed2479bb8bbae9a1742e57b5b/src/components/VerloreneBuchung.tsx#L29) und [Toast-Fristen](https://github.com/juliandeutsch22/Prototype-App-Installateure/blob/7601e3781d4645aed2479bb8bbae9a1742e57b5b/src/components/Toast.tsx#L27).
- [Firmendaten speichern / nachladen](https://github.com/juliandeutsch22/Prototype-App-Installateure/blob/7601e3781d4645aed2479bb8bbae9a1742e57b5b/src/features/settings/FirmendatenView.tsx#L123).
- [Katalogsuche im Angebot](https://github.com/juliandeutsch22/Prototype-App-Installateure/blob/7601e3781d4645aed2479bb8bbae9a1742e57b5b/src/features/quotes/KatalogSuche.tsx#L38).
- [Globales Verbindungsband](https://github.com/juliandeutsch22/Prototype-App-Installateure/blob/7601e3781d4645aed2479bb8bbae9a1742e57b5b/src/components/Verbindungsband.tsx#L69) und [Grenzen der Offline-Brücke](https://github.com/juliandeutsch22/Prototype-App-Installateure/blob/7601e3781d4645aed2479bb8bbae9a1742e57b5b/src/lib/db/pg/ohneEmpfang.ts#L22).
- [Bestehender Schutz ungespeicherter Änderungen](https://github.com/juliandeutsch22/Prototype-App-Installateure/blob/7601e3781d4645aed2479bb8bbae9a1742e57b5b/src/lib/ungespeichert.tsx#L14), mit ausdrücklich dokumentierter Grenze bei Browser-Zurück.
- [Vorhandene rote Validierung und zugehörige Meldungen](https://github.com/juliandeutsch22/Prototype-App-Installateure/blob/7601e3781d4645aed2479bb8bbae9a1742e57b5b/src/features/settings/FirmendatenView.tsx#L309).

## Was bereits gut funktioniert

Diese Punkte werden nicht als neue Lücke behandelt:

- Kunden- und Materiallisten unterscheiden bereits leeren Bestand von leerem Suchergebnis.
- Die Akten haben Schutz ungespeicherter Änderungen und eigene Bearbeitungsfenster.
- Bestätigungsdialoge warten auf laufende Aktionen und bleiben bei Fehlern offen.
- Die zentralen Fenster halten den Tastaturfokus, geben ihn zurück und sperren den Hintergrund.
- Lange Texte, schmale Formulare, ausreichend große Hauptaktionen und ruhige Statuspunkte sind bereits berücksichtigt.
- Die mobile Mitarbeiterübersicht bietet den gewünschten aufklappbaren Hinweis zu Tagen ohne Buchung.
- Tages-, Wochen- und Monatsplanung haben bereits eigene, auf den Gerätetyp abgestimmte Lesarten.
- Rollen, Module, Zugriffsschutz, Kontenregeln, österreichische Fachbegriffe und Belegschutz werden nicht gestalterisch umdefiniert.

Die Referenzseiten in `bestand/` bleiben deshalb Teil der Abnahmegrundlage.
Es gibt keinen begründeten Vorschlag, das mobile Menü oder das App-Icon anzufassen.

## Workflow- und Zustandsabdeckung

| Bereich | Tatsächlich geprüft | Vorschlag / weitere Abnahme |
|---|---|---|
| Startseite, Rollen | Drei Rollen in echter React-Vorschau, drei Breiten | Bestehende Hierarchie erhalten; gemeinsame Rückmeldungen können später auch dort erscheinen. |
| Baustellen, Kunden, Benutzer und Akten | Listen und Akten in Vorschau; gemeinsame Bearbeitungs-/Fokusbausteine und Dirty-Hook gelesen | Kein neuer Aktenumbau; das vorhandene Schutzmuster auf nachgewiesene Lücken übertragen. |
| Angebote | Liste/Akte dargestellt; Katalogprobe mit zurückgehaltener Antwort | Initial, Laden, Fehler, Erhalt bereits gewählter Positionen und Retry im Entwurf. |
| Rechnungen | Liste dargestellt; gezielte Komponentenprobe für PDF-Teilerfolg; RPC-Fehlerpfad gelesen | Validierung, Teilerfolg, unklarer Ausgang, erneutes Laden, kein Suchtreffer, Berechtigung. Statusabgleich F06 vor einer Umsetzung technisch klären. |
| Zeiten und Material | Rollenansichten dargestellt; Offline-Brücke und Sender gelesen; endgültigen Nachsendefehler geprüft | Vorgemerkt erst nach bestätigter lokaler Ablage; abgelehntes Nachsenden sichtbar halten. Keine zusätzliche Offline-Funktion erfinden. |
| Mitarbeiterübersicht, Einsatzplanung | Monatliche Übersicht, Woche, Tag und eigener/Team-Plan dargestellt | Vorhandene Bedienung beibehalten; ergänzende Zustands-/Tastaturabnahme vor Freigabe einer Implementierung. |
| Scheine, Urlaub, Sonderurlaub, Wartung | Ansichten in Vorschau; ausgewählte bestehende Form-/Entwurfsmuster gelesen | Gemeinsame Meldungsbausteine nach tatsächlicher Semantik übernehmen; kein pauschales Autosave oder Undo. |
| Einstellungen, Sicherung, Support, Module | Sämtliche Einstellungsseiten dargestellt; Firmendatenwechsel im Browser und Speicher-/Reload-Teilerfolg in Komponente geprüft | Dirty, gespeichert und Reload-Teilerfolg im Entwurf. Andere Felder/Unterseiten vollständig erhalten. |
| Globale Plattform | Übersicht in Vorschau, bestehende Bereichsstruktur/Einmal-Ausgaben im Code gelesen | Kein erneuter Plattformumbau vorgeschlagen; gemeinsame Rückmeldungen nur dort anwenden, wo die Zustände passen. |
| Anmeldung / Zwei-Faktor / Recht | Rechtseiten dargestellt; zentrale Auth-/Rollenpfade gelesen | Kein neuer realer Anmelde-/Zwei-Faktor-Test in dieser Phase. Schutzwege bleiben unangetastet. |

Die Screens decken die zehn geforderten Zustandsarten ab, verteilt auf passende
Workflows: Ausgangszustand, Laden, leer, Erfolg, Fehler, Teilerfolg, Offline,
Validierung, fehlende Berechtigung und ungespeicherte Änderungen.
Das ist keine Behauptung, sämtliche zehn Arten in jedem einzelnen realen
Workflow durchgespielt zu haben.

## Prüfungen und klare Grenzen

- **126 aktuelle React-Aufnahmen:** 42 Route-/Rollen-Kombinationen × 390/834/1440 px.
  Keine gemessene Seitenüberbreite, keine JavaScript-Laufzeitfehler.
- **42 weitere Referenzaufnahmen:** Monatsplanung, Wochen-/Tagesstreifen der Mitarbeiterübersicht, Katalog/Import, Einkauf/Retouren/Archiv, die weiteren Plattformbereiche und Urlaubsreiter. Zusammen **168 unveränderte Bestandsaufnahmen**; keine Seitenüberbreite oder JavaScript-Laufzeitfehler.
- **56 axe-Läufe am mobilen Bestand** (42 Grundseiten plus 14 weitere Tabs): WCAG-2-A/AA, 2.1-AA und 2.2-AA-Tags,
  keine gemeldeten Verstöße. Das ersetzt keine vollständige manuelle Barrierefreiheitsprüfung.
- **Vier isolierte Bestandsproben am unveränderten React-Code:** F01, F02, F04, F07
  reproduziert. „Bestanden“ bedeutet hier: der beschriebene Mangel wurde nachgewiesen.
  Es sind keine grünen Regressionstests einer bereits vorgenommenen Behebung.
  Der gezielte Filter `AUDIT` wählt nur diese vier Nachweise aus; die übrigen
  306 Tests in den verwendeten kopierten Prüfumgebungen wurden dabei nicht ausgeführt.
- **Eine zusätzliche Browserprobe:** F03 an echten React-Komponenten mit Vorschau-Daten reproduziert.
- **Entwurf:** 16 Situationen × drei Breiten plus acht dunkle Varianten;
  Screenshot-, Überlauf-, JavaScript- und axe-Protokoll in `entwurf-pruefung.json`.
- Daten der Vorschau sind fiktiv. Unvollständige Vorschau-Stammdaten,
  auffällige Summen oder absichtlich lange Namen wurden nicht als Produktionsfehler bewertet.
- Die eigenständige Galerie und die Beispielinteraktionen wurden über den lokalen HTTP-Vorschauzugang geprüft. Eine direkte `file://`-Öffnung der ZIP-Galerie ließ sich im verwalteten Browser wegen dessen Dateiprotokollrichtlinie nicht prüfen. Die JPG-Bilder sind unabhängig davon direkt zugänglich.
- Keine produktive Anmeldung, keine Produktionsschreibvorgänge, keine neue reale
  Ausfall-/Duplikatprobe und kein vollständiger End-to-End-Release-Test in dieser Phase.
- Die vorhandene erfolgreiche CI des geprüften Commits wurde gelesen. Da keine
  App-Änderung vorgenommen wurde, wurde kein neuer Auslieferungslauf gestartet.

## Vorgeschlagene Umsetzungsreihenfolge nach der Screen-Durchsicht

1. F01 und F02: verlässliche kritische Rückmeldung, mit Gegenproben für Erfolg,
   Teilerfolg, wiederholte PDF-Ausgabe, Nachsendefehler und Benutzerwechsel.
2. F03, F04, F05 und F07: Eingaben erhalten, Suchzustände zuordnen,
   kontextgenaues Offline-Feedback und bestätigtes Speichern trotz Reload-Fehler.
3. F08/F09 gezielt in den vorhandenen Feld-, Dialog- und Toastbausteinen ergänzen.
4. F06 separat technisch auflösen. Die Screen-Freigabe ersetzt keine Freigabe
   einer möglicherweise nötigen API-/Korrelationsänderung.
5. Danach Zusammenhänge, Desktop/Tablet/Mobil, langsame/fehlende Antworten,
   Doppelklicks, Tastatur, reduzierte Bewegung und bestehende reale Schreibwege
   gemeinsam prüfen. Kein Merge oder Deploy allein aufgrund der Mockups.

## Offen

Alle neun Befunde sind in der App weiterhin offen. In dieser Phase wurden
Audit, Nachweise und eigenständige Vorschau-Screens erstellt. Besonders F06
bleibt technisch zu klären. Eine vollständige Liste der in den Bildern
vereinfachten Ausschnitte und der nach einer Freigabe zu erhaltenden Funktionen
steht in `FUNKTIONSERHALT.md`.
