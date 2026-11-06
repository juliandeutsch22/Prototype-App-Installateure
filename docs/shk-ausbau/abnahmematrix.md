# SHK-Ausbau — Abnahmematrix (M00)

Je ID drei Arten von Prüfungen:

- **positiv** — der Ablauf gelingt von Anfang bis Ende.
- **negativ** — was abgelehnt werden muss, wird abgelehnt: fremder Betrieb,
  fehlendes Recht, abgeschaltetes Modul (V3), doppelte Ausführung, falscher
  Stand.
- **erhaltend** — was gleich bleiben muss, bleibt gleich.

Jede Prüfung braucht eine Gegenprobe: Ohne die Änderung ist sie rot, mit ihr
grün (`CLAUDE.md`). Die Spalte „Prüfung“ nennt nach dem Bau die Testdatei.

Für jede neue Serveraktion gelten zusätzlich die Querschnittsprüfungen:

| Prüfung | Datei |
|---|---|
| fremder Betrieb | `mandantenTrennung.test.ts` |
| Support liest bzw. schreibt nicht | `schema.test.ts` |
| Datenauskunft und Löschung einer Person | `personAuskunft*.test.ts`, `personLoeschen.test.ts` |
| Rücklauf einer Sicherung | `ruecklauf.test.ts` |
| Leseregeln nach dem Muster `app.lesebetrieb()` | `leseregelnGleichwertig.test.ts` |

## Grundlagen (M01)

| ID | positiv | negativ | erhaltend | Prüfung |
|---|---|---|---|---|
| N02 | Register mit Hauptmodul, Unterfähigkeit, Abhängigkeit, Standard; Folgenvorschau vor dem Abschalten; Unterfähigkeit nur an, wenn ihr Modul an ist | Modulliste schreibt nur der Administrator (Server); unbekannter Schlüssel bleibt folgenlos; neuer Fachbefehl bei abgeschaltetem Modul abgelehnt (V3, ab dem ersten solchen Befehl) | neun Bestandsmodule mit denselben IDs und Standards; jede Rolle sieht dieselbe Navigation und erreicht dieselben Routen wie vorher | |
| U04 | Verlauf am Objekt zeigt die vorhandenen Verläufe vereint, paginiert; neue Befehle schreiben ins Journal in derselben Transaktion | direkter API-Aufruf kann kein Journal schreiben; Dienstschlüssel und Rücklauf schreiben keine Einträge; fremder Betrieb liest nichts | E50-Protokoll erscheint unverändert; keine Krankheitsgründe sichtbar | |
| U06 | weitere Entwurfsarten verwerfen, wiederherstellen, mit Recht endgültig leeren | ausgestellte Belege und Buchungen mit Belegbezug kommen nie in den Papierkorb | E42: endgültig gelöscht bleibt endgültig; verworfene Scheine wie bisher | |
| — (M01e) | neue Quellarten mit Menge bzw. Betrag je Zuordnung; Entwurfsreservierung mit Eigentümer | eine Quelle landet nie in zwei Rechnungen (Konkurrenztest) | jede bestehende Rechnungsart über `assemble.ts` und die SQL-Funktionen mit unveränderten Zahlen; `is_billed` stimmt weiter | |

## Auftrag, Angebot, Objekte (M02, M07, M08)

| ID | positiv | negativ | erhaltend | Prüfung |
|---|---|---|---|---|
| A01 | Liste mit operativer Phase; Board optional | Phase ändert weder Rechnungs- noch Zahlungsstand | Baustellenliste mit Filtern, Suche, Budget-Ampel wie bisher | |
| A02 | Verschieben ändert nur die operative Phase, mit Revision | Konflikt zweier Bearbeiter wird erkannt, nicht überschrieben | Statuswerte Aktiv/Pausiert/Abgeschlossen bleiben gültig | |
| A03 | Auftrag ohne Angebot von der Erfassung bis zur Abrechnungsquelle | ohne Recht kein Anlegen | Baustelle direkt anlegen wie bisher | |
| A04 | Meilensteine → Zahlungsplan → Anzahlung/Teilrechnung konsistent | Summe der Raten über dem Auftragswert abgelehnt | Anzahlung, Teil- und Schlussrechnung ohne Zahlungsplan wie bisher | |
| A05 | LV-Import mit realer Testdatei | ohne verifizierte Normfassung kein ÖNORM-Import (Grenze mit Grund) | Angebote ohne LV wie bisher | |
| A06 | Fassung mit Abrechnungsart und Vorsatz → Link → Annahme durch den Kunden → dieselbe Baustelle wie bei interner Annahme | nach Widerruf, nach Ablauf, beim zweiten Aufruf abgelehnt; Fassung ohne Abrechnungsart ergibt keinen Link; falsches Token | interne Annahme `angebot_annehmen` unverändert | |
| A07 | Zielpreis aus Kalkulation, nur mit Einkaufsrecht | Projektleitung sieht keine Einkaufspreise | Kalkulation ohne Zielpreis wie bisher | |
| A08 | Entwurf nachrechnen → neue Fassung mit Vergleich alt/neu | versendete und angenommene Fassungen bleiben unantastbar | Fassungen (`vorgaenger_id`) wie bisher | |
| A09 | Liegenschaft, Top, Beteiligte mit getrennten Rollen | fremder Betrieb | Baustellen ohne Objekt bleiben gültig | |
| A10 | Sammelabrechnung mehrerer Quellen eines Empfängers; Storno einer Einzelquelle | Quelle in zwei Sammelrechnungen | Einzelrechnung je Baustelle wie bisher | |
| A11 | strukturierter Eingangsauftrag mündet in die Baustelle | unvollständige Pflichtangaben abgelehnt | – | |
| B03 | Besichtigung mit Fotos und Dokumenten, offline nach E49 | Zweitzustellung erzeugt nichts doppelt | Terminart „Besichtigung“ wie bisher | |
| R10 | freigegebenes Aufmaßblatt als Mengenquelle für die Einheitspreisrechnung | doppelte Übernahme ausgeschlossen; Korrektur nur über neuen Stand | Mengen von Hand eintragen bleibt möglich | |

## Material, Einkauf, Lager (M03, M04, M05, M11)

| ID | positiv | negativ | erhaltend | Prüfung |
|---|---|---|---|---|
| E01 | zwei Großhändler mit gleicher Artikelnummer ergeben getrennte Lieferantenartikel | kein Überschreiben eines Stammartikels durch fremden Katalog | bestehender Import, Probelauf und Blockübernahme | |
| E02 | Vergleich nur bei verifizierter Identität | keine Gegenüberstellung ohne Identität | Einkaufspreise nur mit Recht | |
| E03 | günstigster Preis nur bei vollständiger Vergleichsbasis gekennzeichnet | unvollständige Basis ohne Kennzeichen | – | |
| E04 | EK-Verlauf je Lieferant mit Warnung bei Sprung | Projektleitung sieht keinen EK | aktueller EK wie bisher | |
| E05 | Katalogversion mit Prüfbericht, atomare Aktivierung, Rückkehr zum vorigen Stand | kein halb aktiver Katalog in Suche oder Kalkulation; konkurrierende Aktivierung abgelehnt | Laufstatus `datanorm_laeufe` | |
| E06 | Hinweis auf veraltete Katalogstände | – | – | |
| E07 | Verkaufs- und Aufschlagsregeln mit Version | – | Aufschlag je Warengruppe wie bisher | |
| E08 | Lieferantenangebote gegenüberstellen | ohne Einkaufsrecht nicht sichtbar | – | |
| E09 | Preisanfrage an mehrere Lieferanten | Versand nur über den Adapter (M14) oder dokumentierten Mailprogrammweg | Einkaufsliste preisfrei wie bisher | |
| E10 | Umlagerung mengenneutral und atomar; Fahrzeuglager als Ort | Fehlerfall ohne Teilmenge; Eröffnungsbestand nur über Zählung | `stock` bleibt Projektion des Hauptlagers; historische Bewegungen unverändert | |
| E11 | Kommissionierung per Scan (Kamera, Handscanner, Tastatur) | unbekannter Code bucht nichts | Abhaken der Rüstliste wie bisher | |
| E12 | Scan-Einstieg in die vorhandene Inventur | – | Inventur mit Bestätigung wie bisher | |
| E13 | eine gemeinsame Deckungsrechnung für Woche, Monat und Formular, fünf Lot-Zustände mit Text, „Bestand unbekannt“ eigene Zeile | zwei Baustellen konkurrieren um dieselbe Menge ohne Doppelzählung | Fehlmenge im Formular | |
| E14 | Bestellvorschlag mit Menge, Übernahme in die Einkaufsliste | keine automatische Bestellung | Knapp-Meldung | |
| E15 | = R07 | | | |
| E16 | Restmenge zurück ins Lager oder abrechnen, Quelle für M13 | Retoure „gebraucht/defekt“ nicht doppelt abgezogen | Retoure mit Lagerbewegung | |
| R01 | Kundenlieferschein mit Nummer, Snapshot, PDF | Lieferschein ist weder Rechnung noch Zahlung | – | |
| R02 | Teillieferung zweimal plus Rest | Menge über Bestellmenge abgelehnt | – | |
| R03 | Storno mit Lagerbuchung und Journal | Storno nach Abrechnungsvormerkung nur mit Korrekturweg | – | |
| R06 | Eingangsrechnung: Original unverändert, strukturierter Import, Freigabe | Import ≠ Buchung ≠ Zahlungsfreigabe | – | |
| R07 | Dreiwege-Abgleich Bestellung–Wareneingang–Rechnung; Abweichung innerhalb und außerhalb der Toleranz | kein Zahlungslauf ohne Freigabe | Wareneingang mit Freitext-Lieferant (Altdaten) | |
| R08 | Dublette mit abweichendem Schreibbild erkannt, Klärungsweg | – | – | |
| R09 | Kontierungsvorschlag auf `buchungskonten` | nie automatisch gebucht | BMD-Export wie bisher | |
| G03 | Fehlbestandsvorschlag auf derselben Deckungsrechnung | – | – | |
| G06 | Preisänderungsregel | – | – | |
| G09 | = R08 | | | |

## Zeit und Personal (M06, M07)

| ID | positiv | negativ | erhaltend | Prüfung |
|---|---|---|---|---|
| B02 | Start/Stopp über Einsätze, Pausen, Gerätewechsel und offline; beim Beenden eine normale Buchung über alle bestehenden Prüfungen | zweite laufende Sitzung abgelehnt; Zweitzustellung erzeugt keine doppelte Buchung | Nachtrag per Formular wie bisher; alle Zeit-, Saldo-, Pausen-, Zulagen- und Abwesenheitsprüfungen | |
| Z01 | Antrag für gesperrte Fälle → Prüfung → Entscheidung → korrigierte Buchung im E50-Verlauf | kein Antrag nötig, wo heute selbst geändert werden darf | `canEditTime`, `canExtendTimeEntry`, Rechnungssperren | |
| Z02 | versioniertes Zeitmodell mit Gültigkeit | ohne KV-/WKO-Regeln Normalarbeitszeit wie heute (Grenze mit Grund) | keine Altdaten umgerechnet | |
| Z03 | Zulagen und Merkmale je Buchung nach Regel | ohne Regel keine erfundene Zulage | – | |
| Z04 | überfälliger Timer wird gemeldet; Abschlussvorschlag bestätigbar; weiterlaufen lassen möglich | keine automatische arbeitszeitwirksame Endbuchung | – | |
| N01 | alle Feldtypen; Pflicht nur für das Büro; Umbenennen; Typwechsel; Offline-Altentwurf mit Kennzeichnung „Nachpflege“; Server und App prüfen dieselbe Regel | Konfiguration nur Geschäftsführung und Administrator; ungültiger Wert vom Server abgelehnt | Feldwerte in Datenauskunft und E50-Protokoll; bisherige Zeitprüfungen grün | |
| V2 | Zeiterfassung abschalten mit Folgenvorschau | – | Historie, Exporte und Protokoll bleiben lesbar | |
| Z05 | Qualifikation mit Nachweis, Gültigkeit, Verifikation | Planung sieht nur Eignung und Gültigkeit, nicht den Nachweis | Einstufung und Stundensatz wie bisher | |

## Planung und Baustellenablauf (M07, M10)

| ID | positiv | negativ | erhaltend | Prüfung |
|---|---|---|---|---|
| B01 | „Mein Tag“ als Erweiterung von `HeuteEigene` | – | „Wie zuletzt buchen“, Rüstliste | |
| B04 | Bereitschaftscheck aus Personen, Material und Terminen; Freigabe nur bei offener Entscheidung | – | – | |
| B05 | Aufgaben in der Baustellenakte | fremder Betrieb; abgeschaltete Unterfähigkeit | Akte mit Sprungleiste | |
| B06 | Verschieben per Drag-and-drop verschiebt Einsatz **und** Rüstliste samt Reservierung; am Handy gleichwertig per Formular | Konflikt zweier Planer erkannt | `einsatz_speichern` wie bisher | |
| B07 | Ersatzvorschlag regelbasiert | keine erfundene Qualifikation | – | |
| B08 | Hinweise beim Einteilen (Qualifikation, Material) | – | Abwesenheits- und Doppelbuchungshinweise | |
| G10 | Konflikte und Ersatzkräfte | – | Hinweise auf Abwesenheit, Betriebsurlaub, „schon verplant“ | |
| B09 | Projekt- und Aufgaben-Threads mit Erwähnung und Push | fremder Betrieb; entzogenes Recht | – | |
| B10 | Bautagesbericht als Aggregation aus dem Schein | kein zweiter Bericht mit Datenkopie | Handwerksschein wie bisher | |
| B11 | Arbeitsbericht mit Vorbelegung aus Zeiten und Material | – | Schein-Eingabe von Hand bleibt | |
| B12 | Mangel mit Zustand, Frist, Verantwortung bis zur Abnahme | – | – | |
| B13 | Abnahme mit Signaturen über den Unterschriftenweg des Scheins, offline | Zweitzustellung idempotent | Scheinunterschrift mit Prüfsumme | |
| B15 | SharePoint über konfigurierten Adapter; Original und Referenz | ohne Tenant-Nachweis kein Adapter (Grenze mit Grund) | Dokumentablage `project_documents` | |

## Wartung und Betriebsmittel (M09)

| ID | positiv | negativ | erhaltend | Prüfung |
|---|---|---|---|---|
| W01 | versionierte Prüfcheckliste je Anlagentyp | Fassungswechsel ändert alte Berichte nicht | Wartungsvereinbarungen wie bisher | |
| W02 | Abweichung mit Soll und Ist | kein erfundener Sollwert | – | |
| W03 | Prüfbericht-PDF aus Ausführung, Fassung, Snapshot | – | – | |
| W04 | Abrechnungsvormerkung über Kennung statt Positionstext | keine Doppelvorschläge beim Umbenennen | `wartungPosition` | |
| W05 | Vereinbarung über denselben Annahmevertrag wie A06 unterschrieben | wie A06 | – | |
| W06 | Fahrzeug mit Fristen auf derselben Entität wie E10 | Fristenerinnerung ohne Doppelversand | Kennzeichen-Freitext bleibt | |
| W07 | Fahrtenbuch mit Kilometern | kein GPS, keine Standortüberwachung | – | |
| W08 | Maschinen und Geräte | – | – | |
| G11 | nächste Wartung aus Intervall und fachlich bestätigter Ausführung | – | Fälligkeits-Trigger | |

## Geld (M12, M13, M14)

| ID | positiv | negativ | erhaltend | Prüfung |
|---|---|---|---|---|
| R04 | camt.053 importiert, idempotent je Konto und Referenz | XML ohne DTD und externe Entitäten; wiederholter Import ohne Duplikate | – | |
| R05 | Zuordnungsvorschlag mit Bestätigung, Aufteilung auf mehrere Rechnungen | Summe über Umsatz abgelehnt (Server) | Zahlungseingang von Hand | |
| G08 | Bankzuordnung nur über `zahlungseingaenge` inkl. Rest und Skonto | ein Euro höchstens einmal verteilt | Rest und Skonto wie bisher | |
| G07 | Skonto- und Fälligkeitserinnerung ohne Dubletten | – | Mahnlauf | |
| G01 | Arbeitsliste „Zur Abrechnung“ über alle Quellen | kein Scheinzwang | „nicht verrechnet“, „Stunden ohne Buchung“ | |
| G02 | Vorschau über `assemble.ts` | – | bestehende Vorschau | |
| G04 | Mehrmengenhinweis aus Aufmaß, LV, Angebot | – | – | |
| G05 | Budgetwarnung um Geld- und Materialbudget erweitert | keine zweite Warnung | Stunden-Ampel 90 % | |
| B14 | Prognose in der Nachkalkulation; fehlende Preise „unbekannt“, nicht 0 | – | Nachkalkulation wie bisher | |
| R11 | weitere Berichtsarten mit der Rechnung verbunden und in der Rechnung sichtbar | – | Schein über `invoice_coverage` | |
| R12 | Mahnung versenden über den Adapter | kein Versand ohne ausdrückliche Aktion; Providerfehler ohne „versendet“ | Mahnung als PDF | |
| U05 | Versandereignisse und die zwei benannten Ansichten protokolliert | keine allgemeine Nutzungsverfolgung | Supportzugriffe | |
| U03 | Wochenbericht aus Journal und Projektdaten | nur mandantenrichtige Fakten; keine Testmails an echte Empfänger | – | |

## Persönliche Einstiege (M15)

| ID | positiv | negativ | erhaltend | Prüfung |
|---|---|---|---|---|
| U01 | kuratierte Abschnitte der Startseite wählen und ordnen; Zurücksetzen | keine Rechteänderung durch Personalisierung | Standard ist die heutige Startseite | |
| U02 | Favoriten in `user_prefs` | Favorit auf abgeschaltetes Modul oder entzogenes Recht verschwindet sauber | kanonische Gruppen und mobile Grundnavigation | |

## Durchgängige Szenarien (M16, Planung Teil 7)

1. Auftrag ohne Angebot bis zur Zahlung.
2. Angebot bis Zahlung mit Online-Annahme, Meilensteinen und Mahnung.
3. Einkaufskette vom Katalog bis zur Dublette.
4. Wartungskette von der Anlage bis zur Sammelabrechnung.
5. Monteur-Tag offline, nichts verloren, nichts doppelt.
6. Rechte und Mandanten für jede neue Serveraktion.
7. Erhaltung: die gesamte bestehende Suite.
