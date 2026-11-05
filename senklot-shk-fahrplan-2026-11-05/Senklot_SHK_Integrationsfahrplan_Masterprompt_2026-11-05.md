# MASTER PROMPT — Senklot: vollständige SHK-Integration ohne KI

**Stand:** 5. November 2026  
**Produkt:** Senklot, österreichische Betriebssoftware für Installations- und SHK-Betriebe  
**Ergebnis:** ausführbarer Entwicklungsfahrplan mit Architektur, fachlichen Regeln, UI-Einbindung, Migrationen, Prüfungen und Freigaben
**Zusätzlich maßgeblich:** [Kritische Produktbewertung aller 84 Punkte](Senklot_SHK_Kritische_Produktbewertung_2026-11-05.md). Sie unterscheidet ausdrücklich Originalanforderung und empfohlenen Zielumfang.  
**Maßgebliche Vorlage:** Senklot_Funktionskatalog_SHK_ohne_KI_2026-11-05 (1).md, Titel „Senklot vs. APVROS – funktionale Unterschiede innerhalb der App“. Die zuerst übergebene andere Datei ist ersetzt.
**SHA256 der maßgeblichen Quelldatei:** 1951c1562edd0fb4d7d1e1822d6bebd04a9ec4da65baf156820ffbd17e8ababb  
**Codebasis des Abgleichs:** juliandeutsch22/Prototype-App-Installateure, main, Commit **62db192087ed05e5df1405b1e1ab8c9618e63864**, abgerufen am 05.11.2026. Letzter Commit: „Material anfordern: Warenkorb-Leiste als Blatt auf dem Raster (E47) (#407)“.

## 0. Auftrag, Arbeitsmodus und Beleglage

Du bist verantwortlich für Produktkonzeption, Softwarearchitektur, SHK-Prozesse, Bedienbarkeit und technische Umsetzung in Senklot.

Dein Ziel: Alle 84 Originalpunkte vollständig bewerten und durchplanen. Später den ausdrücklich bestätigten Zielumfang vollständig miteinander integrieren. Die ergänzende kritische Produktbewertung ist Teil dieses Auftrags; die Originalabdeckung ist keine ungeprüfte Pflichtliste von 84 Neubauten. Bestehende korrekte Abläufe, Daten, Rechte, Belege, Exporte und Bedienwege müssen erhalten bleiben. Die Oberfläche soll trotz zusätzlicher Möglichkeiten ruhig, verständlich und durchgängig in der Lot-Linie bleiben.

**Diese Datei ist zunächst ein Planungs- und Umsetzungsprompt. Sie ist selbst keine Anweisung, jetzt die App umzubauen, Produktivdaten zu verändern oder auszuliefern.** Beginne die Implementierung erst mit einem ausdrücklichen Startauftrag. Danach bearbeitest du die freigegebenen Pakete vollständig bis zu deren Abnahme. Eine Planungsfreigabe ist kein unbeschränkter Auftrag für alle folgenden Produktivänderungen.

### 0.1 Was diese Planung tatsächlich geprüft hat

- Die korrigierte Quelldatei vollständig gelesen; alle **84 Katalogpunkte** erfasst: A01–A11, R01–R12, E01–E16, B01–B15, Z01–Z05, W01–W08, U01–U06 und G01–G11. Die Vorlage priorisiert nicht; die Reihenfolge dieses Fahrplans wird ausschließlich aus technischen und fachlichen Abhängigkeiten abgeleitet.
- Gründung, Website, Senklot-Abopreise, Unternehmensorganisation und pauschale Pilotwochen sind kein Bestandteil dieses Funktionsauftrags. Technische Integrations-, Rechte-, Wiederherstellungs- und Gerätetests bleiben notwendige Abnahme der Software.
- Den aktuellen GitHub-main-Stand in einem getrennten, unveränderten Arbeitsbaum gelesen.
- Architektur, Rechtehelfer, Navigation, Modulsteuerung, Datentypen und ausgewählte maßgebliche SQL-/Frontend-Pfade zu Startseite, Material, Einkauf, DATANORM, Wartung, Zahlungen, Rechnungen und Ausgangsfach abgeglichen.
- Keine App-Funktion verändert, keine Migration eingespielt, keine Produktion aufgerufen oder fachlich abgenommen. Kein neuer vollständiger CI-, Geräte- oder Datenbanktest durch diese Planungsarbeit.
- Die Wettbewerberangaben aus der Vorlage nicht als geprüfte Produkteigenschaften übernommen. Sie sind Ideengeber, kein Abnahmebeleg.

**„Vorhanden“ bedeutet hier im gelesenen Code erkennbar, nicht im echten Betrieb vollständig nachgewiesen.** „Neu“ bedeutet nicht als gleichwertiger durchgängiger Ablauf gefunden. Vor dem jeweiligen Paket prüfst du die aktuelle Codebasis nochmals; neuere Implementierungen werden wiederverwendet.

### 0.2 Arbeitsgrundsätze

1. Lies README, CLAUDE.md und einschlägige Projektanweisungen. Achte auf ihren Geltungsbereich: Ein alter Leitfaden für einen reinen UI-Umbau verbietet nicht pauschal die fachlich notwendigen Datenbankänderungen eines später ausdrücklich beauftragten Funktionsausbaus.
2. Ein vollständiger Ablauf zählt: erfassen → prüfen → freigeben → durchführen → korrigieren → nachvollziehen → exportieren/aufbewahren.
3. Keine Neuentwicklung vorhandener Module unter anderem Namen. Neue Einstiege öffnen dieselben Fachaktionen.
4. Keine Funktion gilt als fertig, solange man einen Fehlerfall nur mit Datenbankkonsole, Excel-Nebenliste oder Entwicklereingriff beheben kann, obwohl er zur normalen Facharbeit gehört.
5. Unbekannte Daten sind unbekannt. Fehlende Preise, Mengen, Qualifikationen und Liefertermine sind weder null noch „passt“.
6. Keine KI, OCR, Agenten, Sprachmodelle, Textgenerierung oder unscharfe automatische Artikelzuordnung. Nachvollziehbare Regeln und strukturierte Daten. Bestehende historische Herkunftsmetadaten, etwa source = voice, werden dadurch nicht gelöscht oder umgeschrieben.
7. Keine neuen Überwachungsfunktionen oder verpflichtenden GPS-Daten. Navigation zur Adresse ist keine Standortüberwachung.
8. Keine automatisch ausgestellten Rechnungen, versendeten Bestellungen oder endgültigen Zahlungszuordnungen ohne die jeweils notwendige ausdrückliche Fachaktion.
9. Abhängigkeiten bestimmen die Reihenfolge, nicht eine neue Produktpriorisierung. Alle 84 Punkte einschließlich branchenspezifischer Funktionen werden vollständig geplant. Funktionen dürfen je Betrieb aktivierbar sein; sie werden deshalb nicht auf „irgendwann“ verschoben.
10. Grenze, Annahme und externer Nachweis werden getrennt geführt. Ein externer Nachweis blockiert nur die davon abhängige Freigabe, nicht jede unabhängige Entwicklungsarbeit.

### 0.3 „Ohne unbegründete Grenzen“ richtig auslegen

Eine typische Betriebsgröße ist keine technische Sperre. Keine willkürlichen Obergrenzen für Lieferanten, Artikel, Anlagen, Dateien, Kunden, Standorte, Rechnungspositionen oder Historien. Eine UI-Vorschau mit drei Zeilen darf alle weiteren Zeilen aufklappen. Eine Datenbankseite mit 100 Treffern muss weitere Treffer erreichbar machen.

Notwendige Grenzen bleiben: Berechtigungen, Fremdmandanten, unveränderliche Belege, nachvollziehbare Rundung, geräteabhängige Offline-Speicherung, verifizierte Normfassungen, tatsächliche Fremdsysteme und Ressourcen. Jede technische Mengen-/Größengrenze braucht Messung, Fehlermeldung und einen belastbaren Umgang mit größeren Beständen: Pagination, Streaming, Hintergrundjob, Fortsetzung, Export oder dokumentierte Erweiterung. Kein stilles Abschneiden.

Keine unbewiesene Zusage „beliebig groß“ oder „absolut fehlerfrei“. Der nachgewiesene Betriebsbereich wird gemessen und dokumentiert; Erweiterbarkeit darf nicht durch vermeidbare Architekturgrenzen verhindert werden.

---

## 1. Bestehendes System: verbindliche Anschlussstellen

### 1.1 Architektur beibehalten

- React 18, TypeScript strict, Vite, Tailwind und bestehende Lot-Bausteine.
- Supabase: Postgres, RLS, Auth, Storage, SQL-Funktionen/Trigger und Edge Functions.
- Firebase dient Hosting und FCM. Keine Rückkehr zu Firestore als zweite Datenbank.
- Datenbankzugriffe gehören nach **src/lib/db/** und dessen **pg/**-Implementierungen, nicht in Seitenkomponenten.
- Geteilte Logik nach **shared/**; vorhandenen Kopier-/Buildschritt für Edge Functions weiterführen.
- Produktivschema durch **neue** additive Migrationen entwickeln. Historische Migrationen nicht ändern, um eine neue leere Datenbank schöner aussehen zu lassen.
- Aktuelle UUID-/Text-Kennungen erhalten. company_id ist im Bestand teilweise text; keine beiläufige Umstellung aller Kennungen auf UUID.
- Bereits vorhandene Rechnungsmathematik und Aussteller-/Beleglogik wiederverwenden. Für einen neuen Ablauf keine zweite Geldberechnung einführen.

### 1.2 Abgleichstabelle

| Bereich | Erkennbarer Bestand | Anschlussstellen | Konsequenz |
|---|---|---|---|
| Monteur-Start | Rollenabhängige Startseite mit Einsätzen, Kontakt, Zeit-Einstieg, Scheinverweis und Rüstliste | src/features/dashboard/DashboardView.tsx; dashboard/start/HeuteEigene.tsx | B01 erweitert diesen Einstieg, erstellt keine zweite Startseite mit eigenem Buchungsweg. |
| Planung | Tages-/Wochenplanung, persönliche Einsätze, Zuordnung und Rüstlisten | src/features/assignments/; src/lib/db/pg/assignments.ts | DnD und Vorschläge sind zusätzliche Bedienwege derselben Planungsbefehle. |
| Materialbereitschaft | Anforderungen, Beschaffung, Rüstlisten, Reservierungen, Laden/Rücknahme und Lagerbewegungen | src/lib/db/pg/einsatzMaterial.ts; assignments/ruestFehlmenge.ts; Migrationen zu Rüstlisten | E13 erweitert die gemeinsame Berechnung. Kein zweiter Reservierungszähler. |
| Lieferanten/Katalog | suppliers, material_prices, DATANORM-Zwischenlager, Läufe, Rabattgruppen und kontrollierte Übernahme | src/lib/db/pg/datanorm.ts; src/features/materials/datanorm.ts | Versionierung, Identität und Vergleich ausbauen, nicht Import neu bauen. |
| Einkauf | Anforderungen auf Einkaufsliste, Lieferanten, Bestell-/Liefertermine und separate Einkaufspositionen | src/lib/db/pg/einkauf.ts; orders/Einkaufsliste.tsx; orders/bestellungPdf.ts | Teilmengen und echte Bestell-/Wareneingangsbezüge ergänzen. Eine Datumsmarkierung ist noch kein vollständiges Einkaufsbelegmodell. |
| Lager | stock, Lagerbewegungen, Inventur, Wareneingang, Retoure und ausdrückliche Übersteuerungen | src/types/index.ts; src/lib/db/pg/materials.ts; orders/LagerDialoge.tsx | Standortmodell additiv einführen, historische Bewegungen nicht umdeuten. |
| Kunden/Baustellen | Akten, Kontakte, Dokumente, Termine und Angebotsbezug | src/features/customers/; projects/; src/lib/db/pg/projects.ts | Neue Aufgaben, Anlagen und Mängel in diese Akten einbetten. |
| Angebote | Positionen, Fassungen und Annahmeweg mit Baustellenanlage | src/features/quotes/fassungen.ts; angebotAnnehmen.ts; src/lib/db/pg/quotes.ts | Öffentliche Annahme muss genau denselben fachlichen Übergang auslösen. |
| Abrechnung | Regie, Pauschal, Einheitspreis, Stunden/Scheine/Material, Anzahlungs-/Teil-/Schlussrechnungen, Storno | src/features/invoices/assemble.ts; ausgegebenesMaterial.ts; src/lib/db/pg/invoices.ts; SQL-Rechnungsfunktionen | G01/G02 darf keine einzige dieser Abrechnungsarten auf „unterschriebener Schein erforderlich“ reduzieren. |
| Zahlungen | zahlungseingaenge, Rest-/Skontologik und serverseitiger Zahlungsstand | src/lib/db/pg/zahlungen.ts | CAMT legt über diese Logik Zahlungen an; keine zweite Saldenberechnung. |
| Wartung | Vereinbarungen mit Geräteangaben, Intervallen, offener Baustelle, Ausführungshistorie und Rechnungsvorschlag | src/lib/db/pg/wartungen.ts; features/maintenance/; invoices/wartungPosition.ts | Anlagen, Checklisten und Prüfberichte anbinden; Ausführung und Vertrag nicht gleichsetzen. |
| Offline | IndexedDB-Ausgangsfach für geeignete Erfassungen, bestätigte/vorgemerkte Zustände und Wiederholungslogik | src/lib/sync/; src/lib/db/pg/ohneEmpfang.ts | Neue offlinefähige Entwürfe müssen dieses Konzept erweitern, nicht SQL-RPCs blind nachsenden. |
| Rechte/Module | Sechs Betriebsrollen, Zusatzrechte, neun Module, separater globaler Administrator und Supportzugang | src/lib/permissions.ts; module.ts; src/app/navigation.ts | Keine pauschale Rechteangleichung durch neue Sammelansichten. |
| Nachvollziehbarkeit | Fachliche Verläufe, Lagerbewegungen, Ausführungshistorie und Supportprotokoll | Fachmodule und SQL-Migrationen | Kein Nachweis eines bereits vollständigen fachübergreifenden Änderungsjournals. Bestehende Verläufe integrieren. |

### 1.3 Besonders wichtige Erkenntnisse

- **Kommentare können älter sein als die Implementierung.** Der Typkommentar zur Rüstliste behauptet noch teilweise, sie bewege keinen Bestand; spätere SQL-Funktionen buchen beim Einladen bereits einen Abgang. Vor Änderungen den tatsächlich wirksamen Stand aller Migrationen und Tests lesen.
- Dass ältere Stamm-Migrationen Preise breit lesen lassen, beweist keinen heutigen Datenabfluss. Spätere Migrationen begrenzen Einkaufskonditionen. Immer das zusammengesetzte aktuelle Schema prüfen.
- **/accounting ist die Mitarbeiterübersicht**, nicht ein freier Pfad für neue Finanzbuchhaltung. Diese Route nicht umwidmen.
- Die Quellcode-Suche fand keinen gleichwertig durchgängigen CAMT-, Eingangsrechnungs-, Qualifikations-, Fahrzeuglager- oder versionierten Prüfchecklistenablauf. Das sind neue Arbeitsgebiete, keine behaupteten Defekte.
- Vorhandene Belegnummern/Projektpräfixe sind teils historisch unterschiedlich gespeichert. Abgleich und Referenzauflösung wiederverwenden; nicht alle Altbelege umschreiben.
- Ein bereits korrekter Ausnahmeweg ist kein Fehler: etwa bewusste Lagerübersteuerung, korrigierbare Zahlungseingänge oder eine Rechnung ohne Handwerksschein. Neue Standards müssen diese Fälle ausdrücklich richtig behandeln.

---

## 2. Gemeinsames Fachmodell und Integrationsverträge

### 2.1 Ein Zusammenhang, mehrere fachliche Wahrheiten

Verknüpfe die folgenden Begriffe eindeutig, ohne ihre Zustände zusammenzuwerfen:

~~~text
Kunde / Auftraggeber / Rechnungsempfänger
    └─ Standort / gegebenenfalls Liegenschaft und Top
        ├─ Anlage
        │   └─ Wartungsvereinbarung → fällige Ausführung → Prüfbericht
        └─ bestehende Baustelle / Auftrag
            ├─ Angebotsfassung → Annahme
            ├─ Aufgaben / Meilensteine / Mängel
            ├─ Einsätze → zugeteilte Mitarbeiter und Materialbedarf
            ├─ Rüstliste → Reservierung → Ausgabe/Umlagerung
            ├─ Zeitbuchungen / Leistungsnachweise / tatsächlicher Verbrauch
            ├─ Einkaufsbedarf → Bestellung → Wareneingang → Lieferantenbeleg
            └─ abrechenbare Quellen → Rechnung → Zahlung / Storno / Korrektur
~~~

Ein Auftrag kann ohne Angebot beginnen. Ein Serviceeinsatz braucht nicht zwingend eine neue Wartungsvereinbarung. Eine Anlage kann mehrere Verträge oder Prüfarten haben. Eine Rechnung kann mehrere zulässige Leistungen enthalten. Ein Bankumsatz kann mehrere Rechnungen ausgleichen. Kein neuer Pflichtdatensatz nur, damit ein technisches Flussdiagramm linear bleibt.

### 2.2 Kennungen, Herkunft und Snapshots

- Stabile Objekt- und Positionskennungen, getrennt von sichtbaren Nummern, Listenreihenfolge und Bezeichnungen.
- Jede neue Zeile trägt den Betrieb. Beziehungen über mandantenkonsistente Fremdschlüssel absichern, wo möglich mit company_id und parent_id; bestehende IDs und zulässige Altbezüge berücksichtigen.
- Metadaten: fachliches Datum, Server-Erstellungszeit, ausführende Person/Dienst, Revision und Herkunft.
- Gerätezeit nur ergänzend, niemals alleinige Autorität für Annahme, Zahlung, Bestand oder rechtsrelevante Freigabe.
- Datenherkunft immer nachvollziehbar: Importlauf, Lieferantenposition, Quelldatei, Originalbeleg, manuelle Eingabe, Herkunftsleistung.
- Ausgestellte Dokumente referenzieren unveränderliche Snapshots. Eine Änderung von Kundenadresse, Artikelname, Steuersatz oder Vorlage darf alte PDFs/XML nicht ändern.
- Mutable Stammdaten referenzieren, belegrelevante Inhalte beim Ausstellen einfrieren. Keine vollständigen Personendatensätze in jeden Verlauf kopieren.
- Anlagenadresse, Eigentümer, Betreiber, Auftraggeber, Rechnungsempfänger und Rechnungslieferadresse sind unterschiedliche Beziehungen.
- Im Altbestand ist „unbekannt“ ein zulässiger Migrationszustand. Nichts automatisch als verifiziert, freigegeben, bezahlt oder vollständig geliefert kennzeichnen.

### 2.3 Neue Datenbereiche: konkrete Entwurfszuordnung

Die Bezeichnungen sind Zielbegriffe, keine Aufforderung, identische Bestandstabellen doppelt anzulegen. Das endgültige SQL-Schema wird je Paket mit den vorhandenen Tabellen abgeglichen.

| Datenbereich | Ergänzungen / Beziehungen | Integritätsregel |
|---|---|---|
| Artikelidentität | Herstelleridentität, verifizierte Kennungen, lieferantenspezifische Artikelkennung, Verknüpfungsnachweis, Varianten, Einheiten und Packungen | Händlernummer ist nicht herstellerübergreifend eindeutig. Verknüpfungen haben Quelle und Status. |
| Katalogversionen | Versionen, normalisierte Zeilen, Prüfbericht, Importauftrag, Aktivierungszeiger je Lieferant, Preis-/Rabattstand | Aktivierung nur für erfolgreich validierte Version; alte aktive Version bis dahin lesbar. |
| Bedarf/Deckung | Bedarfsquellen, Reservierungen, Zusagen, Beschaffungszuordnungen und Liefertermine | Eine Menge deckt nicht zwei verschiedene Bedarfe gleichzeitig. |
| Lagerorte | Hauptlager, Fahrzeug/temporärer Ort, Bewegungen mit Quelle/Ziel, Inventurabgleich | Umlagerung ist im Gesamtbetrieb mengenneutral und wird atomar gebucht. |
| Einkaufsbelege | Bestellkopf/-positionen, Bedarfszuordnung, Teillieferung, Wareneingang, Retoure, Lieferantenangebot | Bestellt, zugesagt und physisch vorhanden sind getrennte Mengen. |
| Eingangsbelege | Originaldatei, validierter Import, Rechnungsposition, Kontierung, Freigabe, Abweichung, Belegkorrektur | Original bleibt erhalten; ein Import ist noch keine Buchung oder Zahlungsfreigabe. |
| Bankabgleich | Bankkonto, Datei-/Auszugsimport, Umsatz, Vorschlag, bestätigte Aufteilung und Zahlungsbezug | Ein Euro eines Umsatzes ist höchstens einmal verteilt. |
| Anlagen/Wartung | Anlage, Identifikationsdaten, Vertrag/Fassung, Wartungsart, Ausführung, Checklistenvorlage/-fassung, Antwort, Prüfbericht | Bericht bindet die konkrete Ausführung an genau eine Vorlagenfassung. |
| Aufgaben/Phasen | Aufgaben, Verantwortliche, Termine, operative Phase, Meilensteine, Quellenbezüge | Fachstatus werden nicht durch einen visuellen Boardwechsel überschrieben. |
| Qualifikationen | Nachweisart, Geltungsbereich, verifiziert von/am, Gültigkeit, Nachweisdatei | Freitext ist keine verifizierte Befähigung. Gültigkeit zum Einsatzdatum prüfen. |
| Abrechnungszuordnung | Herkunftsleistung, Menge/Betrag, Entwurfsreservierung, ausgestellte Zuordnung, Korrekturbezug | Quellen dürfen nicht durch zwei parallel bestätigte Rechnungen doppelt verbraucht werden. |
| Änderungsjournal | Objekt, Aktion, Akteur, Betrieb, Serverzeit, fachlicher Grund, erlaubte Änderungen, Befehlskennung | Nur serverseitig erzeugen; keine frei bearbeitbare Journal-Tabelle im Client. |
| Öffentliche Annahme | Dokumentfassung, Tokenhash, Gültigkeit, Widerruf, Sicht-/Annahmeereignis, Ergebnis | Annahme wirkt ausschließlich auf die freigegebene Fassung und wird einmalig verarbeitet. |
| Betrieb/Fristen | Fahrzeuge, Service-/Pickerlfristen, Startseitenpräferenzen, Formatprofile | Optionale Bereiche sind pro Betrieb konfigurierbar und respektieren bestehende Rechte. |

### 2.4 Kritische Schreibbefehle

Für neue kritische Aktionen einen gemeinsamen serverseitigen Befehlsvertrag schaffen und an vorhandene RPCs anbinden. Keine neuen direkten Updates aus einer Komfortansicht.

Jeder Befehl enthält:

- Zielkennung, erwartete Revision und eindeutig typisierte Aktion;
- eine stabile vom Aufrufer erzeugte Vorgangskennung;
- fachliche Werte in geprüften Einheiten und Zahlenformaten;
- bei Korrektur/Übersteuerung einen Grund;
- keine vom Browser frei bestimmbaren Rollen oder fremden Betriebskennungen.

Serverablauf: Sitzung und Mandant prüfen → Objekt/Abhängigkeiten sperren → erwarteten Stand prüfen → Zahlen/Referenzen/Rechte validieren → fachlich atomar schreiben → Journal-/Integrationsereignis in derselben Transaktion anlegen → bestätigtes Ergebnis zurückgeben.

Vorgangskennung und Payload-Hash sind mandantenbezogen eindeutig. Derselbe Befehl mit gleichen Daten liefert das bestehende Ergebnis; gleiche Kennung mit anderem Inhalt wird als Konflikt abgewiesen. **Exactly once** nicht als Netzwerkgarantie behaupten: mindestens einmal zustellen, serverseitig idempotent verarbeiten.

Unklarer Ausgang nach Verbindungsabbruch: Status der Vorgangskennung abfragen; nicht mit neuer Kennung blind wiederholen. Automatische Wiederholung bestehender nicht idempotenter RPCs erst nach deren gezielter Absicherung.

SQL- und Storage-Operationen sind nicht gemeinsam transaktional. Dafür explizite Zustände und Nachholung vorsehen, beispielsweise „fachlich gespeichert, Dokument wird erstellt“ und „Dokumenterstellung fehlgeschlagen“. Nummern, Bestände oder Freigaben bei einem PDF-Fehler nicht zurückerfinden.

### 2.5 Fachliche Ereignisse und Aktualität

Ein dauerhaftes Integrations-Ausgangsfach in Postgres für neue asynchrone Arbeit, soweit benötigt: Importverarbeitung, PDF-Erstellung, Erinnerungen, Benachrichtigungen und abgeleitete Übersichten. Kein zusätzlicher Broker als Selbstzweck.

- Ereignis mit ID, Typ/Version, Mandant, Objekt, Revision und minimalem Payload.
- Eindeutiger Verarbeitungsbeleg pro Empfänger; Retry mit Abstand, nicht endlose Sofortschleife.
- Sichtbare Fehlerwarteschlange mit wiederholbarer Aktion und zuständigem Bearbeiter.
- Realtime ist ein Aktualisierungssignal, keine zuverlässige Geschäftswarteschlange.
- Cache-Schlüssel enthalten Betrieb, Benutzer, Rechtekontext, Modulzustand und relevante Filter. Nach kritischen Aktionen betroffene Listen, Akten, Startseite und Zähler invalidieren.
- Ein aggregierter Bereitschaftsstand trägt berechnet_am und Quellrevisionen. Vor Reservieren, Verschieben oder Ausstellen immer erneut serverseitig prüfen.
- Rechteentzug, Benutzerwechsel und Supportende löschen oder isolieren geschützte Browser-Caches und offene Ansichten.

### 2.6 Zahlen, Zeit und fachliche Eindeutigkeit

- Geld nicht mit unkontrollierten binären Fließkommazahlen rechnen. Bestehende Cent-/Rundungsregeln weiterverwenden; Einkaufspreise pro Einheit können mehr Nachkommastellen benötigen als der Rechnungsendbetrag.
- SQL-Numeric und verlustfreie Übertragung benutzen. Genauigkeit und zulässige Größen aus realen Mengen/Preisen begründen; neue Dezimalrechnung gegen bestehende Beleglogik testen.
- Mengen mit Basiseinheit und überprüftem Umrechnungsfaktor; Packung, Preiseinheit und Mindestbestellmenge separat.
- Stück, Meter und Kilogramm sind nicht ohne einen konkreten Artikel-/Verpackungsbezug umrechenbar.
- Einkauf netto, Umsatzsteuer, Verkaufspreis, Rabatt, Skonto und Währung getrennt halten.
- Währungsübergreifender Preisvergleich nur mit ausdrücklich gepflegter Kursquelle, Kursdatum und Hinweis. Ohne diese Daten keinen „günstigsten“ Vergleich errechnen.
- Geschäftsdatum als Datum, Ereignisse als UTC-Zeitpunkt; Anzeige und Arbeitszeitregeln Europe/Vienna. Sommer-/Winterzeit, Monatsende, Mitternacht und Feiertage ausdrücklich prüfen.
- Zeitintervalle für Konflikte als halboffene Intervalle behandeln: ein Einsatz endet um 10:00, der nächste beginnt um 10:00; zusätzliche Wege-/Rüstzeit als eigene konfigurierte Bedingung.
- Ein Auftrag mit Pauschalpreis, ein Abschlagsbetrag und ein Einzelpositionsverbrauch dürfen nicht nach derselben simplen Summenregel behandelt werden.

---

## 3. Oberfläche: vollständig, aber ruhig

### 3.1 Bestehende Linie und Navigation erhalten

Behalte Start, Aufträge, Geld, Team, Material und Einstellungen als mentale Struktur. Keine 84 neuen Menüpunkte. Die mobile untere Navigation mit „Mehr“ bleibt; kein Wechsel zum Hamburger-Menü.

| Ort | Neue Inhalte | Darstellung |
|---|---|---|
| Start / Monteur | nächster Einsatz, ein sinnvoller nächster Schritt, Material-/Aufgabenstand, Offline-/Nachsendehinweis | Bestehendes Heute-Modul erweitern; kompakte Zeilen statt Kennzahlenwand. |
| Start / Büro und Leitung | priorisierte Arbeit und echte Ausnahmen | Arbeitsliste mit Quellenlink; keine zweite Verwaltung aller Objekte. |
| Baustellenakte | Aufgaben/Meilensteine, Materialbereitschaft, Anlagenbezug, Mängel, Abnahme, Berichte | Vorhandene Aktenstruktur ergänzen; seltene Bereiche über Bereichsauswahl, nicht alle offen. |
| Einsatzplanung | DnD, Qualifikationshinweise, Kapazität und Bereitschaft | Bestehendes Wochenraster erhalten; Details im Seitenfenster, Mobile mit gleichwertigen Formularaktionen. |
| Anforderungen / Einkauf | fehlendes Material, Lieferantenvergleich, Bestellungen, Wareneingang | Arbeitsstände innerhalb des Materialbereichs; kein zweiter Warenkorb für dieselbe Anforderung. |
| Lager | Lagerortfilter, Fahrzeugbestände, Bewegungen, Scan-Einstieg | Bestehende Liste und Artikelansicht; gleiche Mengenbegriffe überall. |
| Rechnungen / Geld | abrechnungsbereite Arbeit, Eingangsbelege, Abgleich und Bank | Neue klar benannte Unteransichten, Rechte getrennt; Mitarbeiterübersicht /accounting unangetastet. |
| Wartungen | Anlage, Ausführung, Checkliste, Bericht, Abrechnungshinweis | Eine Liste mit Aktenzugang; während der Arbeit schrittweise Checkliste. |
| Benutzerakte | Qualifikationen und Nachweise | Eigener Bereich mit rollenabhängigen Angaben; keine neue Personal-Kachelwelt. |
| Betriebsmittel im Materialkontext | Fahrzeuge, Geräte, Fristen, Fahrten und Standortbezug | Ein gemeinsamer Einstieg mit passenden Unteransichten; das Fahrzeuglager bleibt im Lagerkontext. |
| Nachrichten | Projektkanäle und erlaubte Direktnachrichten | Ein gebündelter Posteingang plus kontextueller Aktenzugang; mobile Hauptnavigation bleibt bestehen. |
| Einstellungen | Lieferanten-/Formatprofile, Vorlagen, Regeln, Fristen, optionale Module | Bei der jeweiligen Einrichtung bündeln; keine neue Schalterseite pro Feature. |

Die exakten neuen Routen vor Implementierung mit App.tsx und navigation.ts abstimmen. Sie sind im Plan keine schon vorhandenen Endpunkte. Bestehende Deep Links und Browser-Zurück-Wege erhalten.

### 3.2 Bedienregeln

- PageHeader mit einer klaren Hauptaktion; seltene Seitenaktionen im vorhandenen Menü.
- Deckende Blätter auf dem Lot-Raster, Linien und Tabellen; keine Karte in einer Karte, neuen Schatten oder bunten Dashboard-Kacheln.
- Vorhandene Typografie/Tokens: Poppins für Text, IBM Plex Mono für gemessene Angaben. Keine neue Schrift- oder Iconfamilie.
- Information zuerst, Gestaltung danach: Zustände „offen“, „läuft“, „erledigt“, „Achtung“, „Fehler“ mit Text; Farbe nicht als alleinige Bedeutung.
- Tabellen/Listenzeilen öffnen die Akte oder ein BottomSheet. Finanzielle Freigaben nicht über einen unscheinbaren Zeilentap auslösen.
- Standardmäßig den Arbeitsstand zeigen; vollständig erreichbare Filter für alle Zustände/Historien.
- Filter und Ansichtswechsel erhalten Scrollposition, Fokus und Suchtext. URL-Zustand nutzen, ohne bei jeder Auswahl an den Seitenanfang zu springen.
- Genau eine erkennbare Fokusmarkierung pro Suchfeld; keine Doppelumrandung aus Wrapper und Input.
- Lange Regeln in die zentrale Seitenhilfe. Auf der Arbeitsfläche nur Status, fehlende Voraussetzung und nächster Schritt.
- Warnungen priorisieren. Ein ungeklärter Artikel darf andere unabhängig prüfbare Positionen nicht komplett verbergen; ein unzulässiger Gesamtbeleg darf trotzdem nicht ausgestellt werden.
- Versteckte Felder mit Fehlern werden sichtbar und fokussiert. Entwürfe bei Validierungs-/Netzfehlern erhalten.
- Mehrere Rollen in einem Betrieb sind kein Anlass, vertrauliche Kennzahlen überall zu zeigen.

### 3.3 Mobile Anforderungen

- Bis 759 px Mobil, 760–1199 px Tablet, ab 1200 px Desktop; zusätzlich 320 px und Zoom prüfen.
- Dieselben Funktionen wie am Desktop, mit passender Darstellung. Keine wichtige Fachaktion ausschließlich über Hover, Drag-and-drop oder Rechtsklick.
- Wochenplan nicht durch sieben gestapelte Tageskarten ersetzen. Tages-/Wochenkontext und Mitarbeiterauswahl aus dem Bestand weiterführen; schmale Raster bei Bedarf innerhalb des vorgesehenen Bereichs scrollen.
- Lange Vergleichstabellen mobil als Artikelkopf mit geordneten Lieferantenzeilen, identischen Vergleichswerten und Details; nur die Tabelle darf nötigenfalls horizontal scrollen.
- Mitarbeiterübersicht erhalten. Hinweise auf Tage ohne Buchung bleiben mobil auf-/einklappbar; nicht als ständig offene große Summenleiste ausbauen.
- BottomSheet nur gezielt vertikal schließen: Griffbereich, Achsensperre, sichere Abbruchschwelle. Kein seitliches Seitenwischen im Formular.
- Hintergrund und Scrollsperre bis zum wirklichen Ende der Schließanimation synchron halten; kein kurzer erneuter dunkler Schleier.
- Fokus nach Schließen zum Auslöser zurück; iOS-Tastatur, Bildschirmdrehung und dynamische Viewporthöhe prüfen. Kein Zoomverbot.
- Kamera-/Scannerberechtigung nur bei Nutzung; immer Texteingabe und manuelle Artikelauswahl anbieten.
- Touchflächen mindestens 44 px, WebKit/Safari und Android real prüfen; reduced-motion respektieren.

### 3.4 Konkreter Monteur-Ablauf

1. Start zeigt den nächsten bzw. selbst ausgewählten Einsatz mit Uhrzeit, Adresse, Kontakt und Aufgabe.
2. „Einsatz öffnen“ gibt den fokussierten Arbeitskontext: Übersicht, Arbeit erfassen, Material, Dokumentation. Dieselbe Baustelle/Anlage wird vorbefüllt, bleibt kontrollierbar.
3. Zeit führt zum bestehenden Zeiterfassungsweg; kein automatischer Eintrag aus geplanten Stunden.
4. Material zeigt benötigte, zugesagte, geladene und noch fehlende Mengen getrennt. Anfordern verwendet die bestehenden Quellenverknüpfungen.
5. Ein Schein/Prüfbericht übernimmt nur tatsächlich erfasste Angaben; vorhandene Daten erscheinen als prüfbare Vorbelegung.
6. Vor Unterschrift vollständige lesbare Vorschau der zu bestätigenden Fassung. Danach keine stillen Änderungen.
7. Bei Netzverlust steht „auf diesem Gerät vorgemerkt“, nicht „im Betrieb gespeichert“. Vertrauliche Inhalte nur im erlaubten lokalen Umfang.
8. Nach Abschluss bleibt die Baustelle erreichbar; offene Aufgaben und Übertragungen verschwinden nicht wegen eines optischen „Erledigt“.

---

## 4. Sicherheit, Rechte und Betrieb

### 4.1 Vorhandene Rechte sind die Ausgangslage

- Geschäftsführung und Administrator haben Spitzenrechte; Administratorvergabe bleibt auf Administrator beschränkt.
- Projektleitung plant und führt Baustellen. Sie bekommt nicht durch eine neue Ansicht Zeitkonten, Krankheitsgründe, Einkaufspreise oder Rechnungs-Schreibrechte.
- canInvoice erlaubt aktuell Spitzenrollen und Buchhaltung. Das gesonderte Rechnungsleserecht der Projektleitung gilt nur im vorhandenen eingeschränkten Umfang.
- Einkaufskonditionen: vorhandenes darfEinkaufSehen und die serverseitigen Gegenstücke wiederverwenden. Auch die Verwaltung benötigt die passenden Zusatzfreigaben.
- Neue Eingangsbeleg- und Bankrechte ausdrücklich definieren. Buchhaltung ist ein sinnvoller fachlicher Vorschlag, aber kein Anlass, ihr stillschweigend sämtliche internen Margen-/Katalogdaten zugänglich zu machen.
- Qualifikationsübersicht für die Planung zeigt Eignung/Gültigkeit, nicht automatisch die komplette Personaldokumentation.
- Das globale Plattformkonto bleibt außerhalb der Betriebe. Support nur zeitlich begrenzt, mandantengebunden, protokolliert und mit passendem Lese-/Schreibumfang.
- Die derzeitige Modulverwaltung bleibt den dafür berechtigten Rollen vorbehalten; insbesondere nicht nebenbei aus dem bestehenden Administratorrecht ein allgemeines Geschäftsführungsrecht machen.
- company.modules steuert bisher vor allem Oberfläche und Routen; es ist keine bestehende Sicherheits- oder Abrechnungsschranke. Dieses Modell nicht unbemerkt in ein neues Berechtigungssystem verwandeln.
- Neue kostenpflichtige/privilegierte Schreibmöglichkeiten bei Bedarf gesondert serverseitig berechtigen. Ein UI-Schalter ersetzt kein Recht. Deaktivierung versteckt nicht historische Dokumente oder verhindert gesetzlich erforderliche Exporte.

### 4.2 Verpflichtende technische Prüfungen

- RLS auf jeder neuen Mandantentabelle, Storage-Regeln auf Dateien, kontrollierte Realtime-Veröffentlichung.
- Eindeutige Fremdmandantenprüfung auch bei direkt übergebenen Parent-, Lieferanten-, Nutzer- und Dokumentkennungen.
- SQL-Funktionen entsprechend den Projektvorgaben absichern: kontrollierter search_path, nötige Grants, kein Zugriff für public/anon außer eigens entworfener öffentlicher Annahme über eine schmale serverseitige Schnittstelle.
- security-definer ist nicht selbst eine Berechtigungsprüfung: in der Funktion Mandant, Rechte, Objekt und alle erlaubten Zustände prüfen.
- Keine Dienstschlüssel im Browser. Keine ausführbaren Kundendaten in Dokumentvorlagen, Dateinamen, CSV, HTML oder Logmeldungen.
- Importdateien im privaten Storage, Download über autorisierte kurze Freigaben; Dateityp, Inhalt, Größen und Schadpotential prüfen.
- XML ohne externe Entitäten/DTD, begrenzte Tiefe und Expansion; XLSX/ZIP gegen entpackte Übergröße, CSV-Export gegen Formelausführung absichern.
- Keine automatisch aufgerufenen URLs aus XML, QR-Codes oder Rechnungen: SSRF und Phishing vermeiden.
- Öffentliche Annahme-Endpunkte begrenzen, Tokens nur gehasht speichern, Rate-Limits und Widerruf; keine allgemeine anon-Leserichtlinie für Angebote.
- Sicherheitsprotokolle enthalten keine Passwörter, Tokens, komplette Bankauszüge, Gesundheitsgründe oder ungekürzte Belege.

### 4.3 Datenschutz und Aufbewahrung

Für jeden neuen Datentyp festlegen: Zweck, Zugriff, Verantwortlicher, Aufbewahrung, Export, Löschung/Pseudonymisierung und Behandlung in Sicherungen. In Datenauskunft und Personenlöschung einordnen, wie die Projektvorgaben es verlangen.

Belegaufbewahrung, Korrekturhistorie und Betroffenenrechte getrennt behandeln. Ein Journal ist keine pauschale Rechtfertigung, Personen- oder Gesundheitsdaten unbegrenzt zu kopieren. Nicht jede Änderung benötigt Rohwerte; häufig genügen Feldname, zulässiger Alt-/Neuwert oder eine fachliche Referenz.

Eine Hashkette allein macht ein Protokoll gegenüber einem Datenbankbetreiber nicht unveränderlich. Falls ein stärkerer Nachweis verlangt wird, signierte Export-/Sicherungsnachweise mit separatem Aufbewahrungskonzept vorsehen und das Schutzniveau ehrlich benennen.

### 4.4 Online/Offline-Matrix

| Vorgang | Ohne Verbindung | Nach Verbindung |
|---|---|---|
| Vorhandene Zeit-/Materialerfassung | Bisherigen Ausgangsfachweg erhalten | Normale Serverprüfungen und eindeutige Rückmeldung. |
| Neue Aufgaben-/Checklisten-/Mängelentwürfe | Nach bewusster Erweiterung lokal erfassen; Vorlagenfassung und Quellrevision mitführen | Konfliktprüfung, Uploadfortsetzung, nachvollziehbare Freigabe. |
| Fotos | Lokal nur mit erlaubtem Speicher, Fortschritt und Quotenanzeige | Datei-/Datensatzzuordnung prüfen; keine unbemerkten Waisen. |
| Scanner | Vorab erlaubter lokaler Index oder Erfassung des Codes | Server löst auf; unbekannter Code erzeugt keine Bestandsbuchung. |
| Lager buchen/reservieren/umlagern | Allenfalls Entwurf, keine Zusage aktueller Verfügbarkeit | Atomare Prüfung gegen aktuellen Bestand. |
| Plan verschieben | Optional lokaler Änderungsvorschlag, klar als unbestätigt | Kapazität, Urlaub und Revision nochmals prüfen. |
| Rechnung, endgültige Annahme, Bankzuordnung | Keine endgültige Bestätigung | Verbindliche Servertransaktion. |
| Unterschrift auf neuem Prüfbericht | Möglich erst mit vollständig eingefrorener lokal sichtbarer Fassung und belastbarer Sync-/Konfliktregel | Bei verändertem Inhalt neue Zustimmung, nie alte Unterschrift auf neue Fassung übertragen. |

Der bestehende Handwerksschein wird dadurch nicht automatisch offlinefähig. Eine spätere Erweiterung benötigt einen eigenen vollständigen Dokument-/Datei-/Signaturablauf. Keine entsprechende Behauptung vor Abnahme.

Geräteverlust, Speicher voll, privates Browserfenster, abgelaufene Sitzung, Rollenentzug, Gerätewechsel und mehrere Tabs gehören zur Abnahme. Lokal vorgemerkte Arbeit darf nicht unter dem Konto eines Kollegen versendet werden.

---



## 5. Gemeinsame Integrationskerne für überlappende Funktionen

Die folgenden Kerne vermeiden doppelte Implementierungen. Die verbindlichen 84 Einzelpunkte und deren Zuordnung folgen in Abschnitt 6.

### K01 — „Mein Tag“ aus dem bestehenden Monteur-Einstieg

**Bestand:** HeuteEigene, persönlicher Einsatzplan, KontaktZeile, Zeit-Vorbelegung, Schein- und Rüstlistenaktionen.

**Zielablauf:** Einsatz wählen → Übersicht → Zeit/Material/Aufgabe/Dokumentation → vorhandenen Fachweg öffnen → Ergebnis im Kontext aktualisieren. Heutige Einsätze und „Danach“ bleiben. Ohne Einsatz oder mit abgeschalteter Planung weiterhin direkt zulässige Arbeit erfassen; keine Zwangsplanung als neue Buchungsvoraussetzung.

**Einbindung:** Eine Hauptaktion passend zum Arbeitsstand; kompakte Aufgaben-/Materialzeilen, Fotozugang über den korrekten Nachweis bzw. die Baustellenablage. Die bestehende mobile Navigation und bisherigen Einzelseiten bleiben.

**Daten/Rechte:** Kein eigenes Tagesbuch mit Kopien von Zeiten, Beständen oder Scheinen. Nur rollenberechtigte Felder; Kontakte und Navigation zur tatsächlichen Einsatzadresse. Teilweise Ladefehler als solche zeigen.

**Abnahme:** Monteur erledigt einen Serviceeinsatz mit korrekter Baustelle, Zeit, Material, Fotos und unterschriebenem Schein; Wechsel zu zweitem Einsatz verliert keinen Entwurf. Wiederkehr vom Fachformular, Zurücknavigation, Offline-Vormerkung, fehlende Planung, entzogene Rechte und abgeschaltete Module geprüft.

### K02 — Materialbereitschaft und termingerechte Deckung

**Bestand:** Rüstlisten, ruest_angefordert, lager_frei, ruest_reserviert, Laden und Einkaufsliste. Diese Berechnungen zuerst auf gemeinsamen Mengenbegriff bringen.

**Verbindliche Semantik:**

- physischer Bestand je zulässigem Ort;
- Reservierungen anderer Bedarfe;
- eigene bereits zugeteilte Mengen, ohne erneute Doppelzählung;
- bereits korrekt ausgegeben/geladen;
- offene bestätigte Beschaffungszuordnung bis zum Bedarfstermin;
- noch ungedeckte und ungeklärte Menge.

Für Bedarf i: freie_unzugeteilte_Menge plus eigene noch physisch reservierte Menge plus bereits geladene Deckung ergibt die **physische Deckung**, soweit Mengen tatsächlich disjunkt sind. Bestätigte, exklusiv zugeordnete künftige Zugänge ergeben zusätzlich die **termingerechte Prognose**. Fehlmenge = max(0, Bedarf minus einmalig gezählte Deckung). Fremde Reservierungen und verspätete Zugänge zählen nicht.

**UI:** „bereit“ nur bei tatsächlich gesicherter physischer Deckung; „teilweise bereit“, „nicht bereit“ oder „Bestand unbekannt“ mit Positionen und Begründung. Geplante Deckung separat als „Lieferung zugesagt bis …“, niemals als physischer grüner Bestand. Mischfälle mit bekannten Fehlteilen und unbekannten Positionen zeigen beide Hinweise.

**Aktionen:** Fehlteil auf vorhandene Anforderung/Beschaffungsposition legen; bestehende Verknüpfung wiederverwenden. Eine geänderte benötigte Menge verändert reservierte/angeforderte Mengen nachvollziehbar, nicht durch parallele Neuanlage.

**Abnahme:** Zwei Baustellen konkurrieren um fünf Stück: nur eine erhält dieselben fünf. Eigenreservierung wird nicht erneut abgezogen. Zwei Bearbeiter, Mengenänderung, Teilabholung, Retoure, storniertes Material, fehlender Artikel, unbekannter Liefertermin und Terminverschiebung geprüft. Lagerverfügbarkeit aus einem Ort ohne rechtzeitigen Transfer verspricht keine Einsatzbereitschaft.

### K03 — Lieferantenvergleich für identische Artikel

**Abhängigkeit:** Verifizierte Artikelidentität, Einheiten und aktive Katalogstände aus E01/E04–E06/A08.

**Ablauf:** Artikel öffnen → vergleichbare Lieferantenpositionen laden → benötigte Menge festlegen → Nettopreis pro Basiseinheit, bestellbare Packungsmenge, Konditionen und Datum vergleichen → Lieferant/Position ausdrücklich übernehmen.

**Identität:** Bestätigte Herstelleridentität plus Herstellerartikelnummer/Variante oder verifizierte GTIN mit korrekter Packungsbeziehung. Eine gültige Prüfziffer allein beweist keine Artikelgleichheit. Manuelle Verknüpfung mit Herkunft und Freigabe; strittige Zuordnung sperrt den automatischen Vergleich, nicht die manuelle Erfassung.

**Berechnung:** Preisbezugsmenge, Staffel, Packung, Mindestbestellmenge, Rabattfolge, Währung und Gültigkeit normieren. Beispiel: zwei Meter Bedarf können wegen einer Zehnmeterpackung zehn Meter Einkauf bedeuten. Den Grundpreis nicht als tatsächliche Bestellsumme verkaufen.

**UI:** Schmale Vergleichstabelle bzw. mobile Lieferantenzeilen. Fracht, Lieferdatum, Verfügbarkeit und Mindestbestellwert separat. „Günstigster vergleichbarer Artikelpreis“ nur bei vollständiger Vergleichsbasis. Keine Behauptung des günstigsten Gesamteinkaufs.

**Abnahme:** Gleich benannte abweichende Fittings werden nicht zusammengeführt. Unterschiedliche Packungen, Preis pro 100, fehlende Rabatte, unterschiedliche Währungen, abgelaufene Preise und entzogene Einkaufssicht korrekt behandelt. Umverknüpfen verändert weder alte Lagerbuchung noch Belegpreis.

### K04 — Katalogversionen, Preisstände und Entwurfskalkulation

**Bestand:** DATANORM-Läufe, Zeilenstaging, Rabattgruppen und Übernahme. Die vorhandenen Prüfregeln bleiben maßgeblich.

**Zielablauf:** Lieferant/Datei → Format-/Zeichensatzprüfung → Importauftrag → Staging → Probelauf mit Differenzen → ausdrückliche Aktivierung → abschließender Bericht. Große Läufe persistent in Blöcken verarbeiten, fortsetzen und einzeln wiederholen können; nicht einen Browser stundenlang als einzigen Jobträger verwenden.

**Konsistenz:** Aktiver Versionszeiger je Lieferant. Nach vollständiger Validierung atomar umschalten. Während der Verarbeitung kein halb neuer Katalog in Suche oder Kalkulation. Ein Lieferanten-Löschsatz beendet dessen Angebot; er löscht nicht den gemeinsamen Artikel oder Bestand, wenn andere Lieferanten oder historische Belege ihn benötigen.

**Preisänderung:** Entwurfsangebote erhalten einen prüfbaren Positionsvergleich mit altem/neuem Einkauf, Preisdatum und Auswirkung. Ein geänderter EK ändert nicht automatisch den vereinbarten Verkaufspreis. Optionen: beibehalten, gezielt übernehmen, nach vorhandener Kalkulationsregel neu berechnen. Speichern erzeugt die notwendige Angebotsfassung. Versendete/angenommene Fassungen und ausgestellte Dokumente unverändert.

**Migration:** Bestehende Lieferantenstände als nachvollziehbare Ausgangsversion übernehmen. Nicht bekannte Hersteller-/Packungsdaten als unbestätigt markieren. Alte Kataloge bleiben lesbar, wo Belege darauf beruhen.

**Abnahme:** Fehlimport, Abbruch, doppelte Datei, geänderter Rabatt, konkurrierende Aktivierung, Wiederanlauf und Rückkehr zum vorherigen aktiven Stand ohne Rücknahme fremder Folgearbeit. Reale Großkataloge; keine stillen Antwortlimits von PostgREST oder UI.

### K05 — Anlagenbezogene Wartungs- und Prüfchecklisten

**Bestand:** Wartung mit Geräteangaben, Intervall, Baustellenbezug und Ausführungshistorie. Zuerst den Gerätebezug additiv zu einem Anlagenstamm ausbauen.

**Modell:** Anlage → Wartungs-/Prüfart → veröffentlichte Vorlagenfassung → konkrete Ausführung → Antworten/Messwerte/Abweichungen → bestätigter Bericht. Mehrere Prüfarten oder Vereinbarungen an einer Anlage zulassen. Altanlagen aus bestehenden strukturierten Angaben vorbereiten; mehrdeutigen Freitext nicht automatisch zerlegen und als verifiziert speichern.

**Vorlage:** Typisierte Schritte, Pflicht-/bedingte Felder, Einheiten, zulässige Bereiche mit belegter Herkunft, „nicht zutreffend“ mit Grund, Fotos und Zuständigkeit. Keine frei erfundenen gesetzlichen Grenzwerte. Veröffentlichte Fassungen unveränderlich; neue Fassung ausdrücklich freigeben.

**Mobile Arbeit:** Passende Liste am Einsatz, Fortschritt und Abweichungen zeigen, Entwurf erhalten. Fehlender Wert bleibt fehlend. Tatsächlicher Messwert außerhalb des Grenzbereichs bleibt als Messwert erhalten; er wird nicht in den Sollbereich korrigiert. Abweichung löst gegebenenfalls eine Aufgabe/Mangelmeldung aus.

**Bericht:** Vorschau aus gespeicherten Daten, Autor und fachliche Freigabe getrennt, Vorlagen-/Anlagen-/Ausführungsfassung, Unterschrift und unveränderliche Ausgabe. Korrektur erzeugt Nachtrag/neue Fassung mit Bezug, keine nachträgliche Bearbeitung unter alter Unterschrift.

**Abnahme:** Zwei Anlagentypen, Vorlagenwechsel während Bearbeitung, fehlendes Pflichtfeld, unzulässige Einheit, Abweichung, zulässiges „nicht zutreffend“, Foto-Ausfall und Berichtfehler. Fälligkeit nur nach fachlich bestätigter Ausführung fortschreiben; eine teilweise bearbeitete Liste ist keine erledigte Wartung.

### K06 — fachliches Änderungsjournal

**Reihenfolge:** Den technischen Kern früh bauen, bevor neue kritische Schreibwege produktiv werden; nicht erst nach dem gesamten Einkaufsausbau.

**Umfang:** Zeitkorrekturen und Saldoauslöser, Materialreservierungen/-bewegungen, Inventur, Stammdaten, Rechte, Katalogaktivierung, Angebotsfassungen, Beleg-/Annahme-/Rechnungsaktionen und Zahlungszuordnungen. Bestehende fachliche Verläufe weiterverwenden und mit dem gemeinsamen Befehls-/Objektbezug verbinden.

**Technik:** Serverseitige Erfassung mit begrenztem Rechtekreis. Zulässige Feldänderungen, alter/neuer Wert oder Referenz, Akteur, Grund, Betrieb und Serverzeit. Neue kritische Transaktion ist erst bestätigt, wenn der notwendige Journaleintrag konsistent geschrieben ist. Hintergrund-Neuberechnung als Dienstaktion mit Ursache ausweisen.

**Privatsphäre:** Keine Krankheitsgründe oder Personaldokumente in allgemeine Objektverläufe übernehmen. Eine Finanzleseberechtigung bedeutet keine allgemeine Personalprotokollberechtigung. Aufbewahrung/Löschung pro Ereignisklasse festlegen.

**UI:** „Verlauf“ am Objekt und gesonderte, paginierte autorisierte Recherche. Keine globale Journal-Kachel für alle Rollen.

**Abnahme:** Ein korrigierter Saldo führt zur auslösenden Zeitänderung. Benutzer kann Journal weder fälschen noch löschen. Fremdmandant, direkter API-Zugriff, automatische Aktion, Löschung/Pseudonymisierung und gleichzeitige Änderungen geprüft. Keine Garantie gegen einen allmächtigen Infrastrukturbetreiber ohne zusätzlichen Nachweis.

### K07 — Arbeitsliste „Zur Abrechnung“

**Bestand:** Nicht verrechnete Stunden, unterschriebene Scheine, ausgegebenes Material und Rechnungsvorschau. Bestehende Regie-/Pauschal-/Einheitspreiswege erhalten.

**Arbeitszustände:** zu prüfen, bereit, zurückgestellt mit Grund/Wiedervorlage, in einem Rechnungsentwurf, ausgestellt zugeordnet, teilweise abgerechnet, fachlich gesperrt. Zustand ist aus Quellen und gültigen Zuordnungen abgeleitet; „zurückgestellt“ separat pflegen.

**Quellenmodell:** Stabile Herkunftsposition mit verfügbarer/zugeordneter Menge bzw. Betrag. Zeit, Materialausgabe und derselbe Materialeintrag auf einem Schein dürfen nicht als drei unabhängige Leistungen verbraucht werden. Herkunftsverknüpfung vor Konsum prüfen, historische unscharfe Name-/Einheit-Zuordnung als Klärfall erhalten.

**Wichtige Regel:** Ein unterschriebener Schein kann Bereitschaft belegen, ist aber keine neue universelle Pflicht. Material ohne Schein, separat zulässige Stunden, Wartungspauschale, Anzahlungs-/Teilrechnung und angenommener Pauschalauftrag bleiben nach ihren eigenen fachlichen Regeln möglich.

**Ausstellen:** Vorschau prüfen, Quellen im Server sperren und Restmengen neu bestimmen, Nummer und Rechnung über bestehende Ausstellungslogik erzeugen, Zuordnung atomar speichern. Ein Entwurf ist noch keine endgültige Verrechnung; Entwurfsreservierung braucht Eigentümer, Erneuerung/Freigabe und verständlichen Konfliktweg.

**Korrektur:** Bestehender Stornoweg bleibt führend. Eine Stornorechnung ist keine neue positive Leistung. Ursprungsleistung nur im zulässigen Umfang wieder freigeben, wenn keine andere gültige Zuordnung sie weiter verbraucht. Teilstorno, Zahlung, Schlussrechnung und Rücklass separat beachten.

**Abnahme:** Zwei Sachbearbeiter können denselben Rest nicht doppelt ausstellen. Zwei Teilrechnungen, Schlussrechnung, Storno/Wiederherstellung, Rückstellung, fehlender Preis, spätere Retoure und nachträglicher Schein führen zu nachvollziehbaren Restständen. Keine Rechnung durch bloße Listenauswahl ausstellen.

---



## 6. Vollständige Einzelplanung der maßgeblichen Vorlage

**Leseregel:** Jeder folgende Abschnitt trägt genau eine Original-ID. Das ist die vollständige Referenzplanung des Katalogs. Die ergänzende Produktbewertung empfiehlt für acht Punkte eine fachliche Anpassung und für Z04 einen Ersatz; 36 Punkte sollen integriert statt als eigenständige Funktion gebaut werden. Die Änderungen sind Empfehlungen, noch keine stillschweigend bestätigte Umfangskürzung. Abhängigkeiten sind technische Voraussetzungen und keine neue fachliche Priorisierung.

### A01 — Auftragsübersicht mit Bearbeitungsphasen

Bestehende Baustellen/Angebote in einer gemeinsamen Auftragsansicht lesen: Eingang, Angebot, Vorbereitung, Ausführung, Abrechnung und Gewährleistung. Operative Phase, Angebotsstatus, Leistungsfortschritt, Rechnung und Zahlung bleiben getrennte Zustandsachsen. Ein bezahlter Abschlag beendet keinen Auftrag. Die Gewährleistungsphase braucht einen bestätigten Beginn und die konkrete Fristgrundlage, keine erratene Pauschalfrist.

**UI:** Umschaltbare Listen-/Boardansicht im Baustellenbereich, gleicher Such-/Filterzustand; Problemfilter für echte Blockaden und überfällige Arbeit.  
**Abnahme:** Auftrag ohne Angebot, mehrere Angebotsfassungen, Teilabrechnung, Restmangel und offene Schlusszahlung ergeben nachvollziehbare Phasen ohne falsche Automatik. Quellen sind aus jeder Phase erreichbar.

### A02 — Aufträge auf dem Board verschieben

Ein Boardwechsel ist ein fachlicher Befehl mit erwarteter Revision, Zielphase und gegebenenfalls Grund. Eine Matrix erlaubt neutrale Fortschrittswechsel, fordert fehlende Pflichtangaben nach und verhindert falsche Seiteneffekte. „Angenommen“ unterschreibt kein Angebot; „abgerechnet“ stellt keine Rechnung aus. Rücksprünge erhalten Historie und bereits ausgestellte Belege.

**UI:** DnD plus gleichwertige Aktion „Phase ändern“ mit Tastatur und mobil. Vorschau der Auswirkungen; endgültige sensible Übergänge ausdrücklich bestätigen.  
**Abnahme:** Zwei Bearbeiter verschieben dasselbe Objekt; veralteter Stand wird als Konflikt behandelt. Ein abgebrochener Dialog ändert nichts. Filterwechsel und Rückkehr erhalten Scrollposition.

### A03 — Eingangsauftrag ohne Angebot

Bestehenden Baustellen-/Auftragsstamm um Eingangskontext und optionale externe Referenz ergänzen. Ohne Angebotszwang Kunde, Einsatzadresse, Anliegen, Zuständigkeit, Termin und Dokumente erfassen; fehlende Stammdaten als Entwurf nachpflegbar. Kein zweiter Auftragskopf mit eigener Kundenkopie. Derselbe Auftrag lässt sich später mit Angebot, Material, Zeiten und Rechnung fortführen.

**UI:** „Neuer Auftrag“ im bestehenden Baustellenkontext, schlankes Formular mit seltenen Angaben bei Bedarf.  
**Abnahme:** Spontaner Serviceauftrag → Einsatz → Zeit/Material → Rechnung vollständig; nachträglich zugeordnetes Angebot erzeugt keine zweite Baustelle. Doppelklick und gleicher externer Auftrag bleiben idempotent.

### A04 — Meilensteine und Zahlungsplan

Meilenstein mit Beschreibung, Zuständigkeit, geplantem Datum, überprüfbarer Erfüllung und optionalem Betrag/Prozentsatz modellieren. Bezugsbasis der Prozente eindeutig: welches Netto-/Bruttovertragsvolumen und welche Fassung? Änderungen der Basis erzeugen eine neue Planfassung. Geplanter Zahlungsplan und tatsächlich ausgestellte Rechnungen sind getrennt.

**UI:** Kompakte Etappenliste in der Baustellenakte; bestätigte Etappe bietet vorhandene Anzahlungs-/Teilrechnungsvorschau an.  
**Abnahme:** Prozent-/Betragsmischung, Rundungsrest, geänderte Auftragssumme, verschobene Etappe, bereits verrechneter Meilenstein und Storno korrekt. Schlussrechnung zieht gültige Vorrechnungen nach bestehender Logik ab, nicht die bloß geplanten Raten.

### A05 — ÖNORM A 2063: Import, Kalkulation und Export

Eigenes strukturiertes LV-Fachmodell an bestehende Angebotspositionen anbinden: Hierarchie, stabile externe Positionskennungen, Langtexte, Mengen, Einheiten, Preisanteile, Alternativ-/Bedarfspositionen und die von der gewählten Normfassung verlangten Datenelemente. Vor Implementierung konkrete anzubietende Fassungen und Austauscharten anhand autorisierter Spezifikation und realer Testdateien festlegen.

Import: Format erkennen → schema-/semantisch validieren → Vorschau und Zuordnung → als Entwurf übernehmen. Kalkulation verändert die Angebotsfassung; Export bewahrt Austauschkennungen, zulässige Zahlenformate und die erforderliche Struktur. Nicht editierte unbekannte zulässige Informationen verlustfrei erhalten oder klar als nicht unterstützten Inhalt melden; keinen scheinbar vollständigen Export mit Datenverlust erzeugen.

**Abnahme:** Import–Export–Reimport mit anderem normfähigen System; Ausschreibungshierarchie, Alternativen, Rundungen und große LV. Keine Behauptung einer zertifizierten Normkonformität ohne Nachweis. Fachliche Formatversionierung ist begründet, keine beliebige Positionsobergrenze.

### A06 — Angebotsannahme per Link und Unterschrift

Freigegebene Angebotsfassung mit Inhaltshash, Gültigkeit, Empfängerkontext und widerrufbarem hochentropischem Token referenzieren. Nur Tokenhash speichern. GET zeigt das Angebot und darf nichts annehmen; Mailscanner oder Linkvorschau sind kein Annahmenachweis. Annahme über ausdrückliches POST mit Identitätsangaben, Erklärung, gegebenenfalls Signatur und einmaligem Befehlsbezug.

**Integration:** Bestehenden Annahme-/Baustellenanlageweg verwenden; wiederholte bestätigte Annahme liefert dasselbe Ergebnis. Neue Fassung macht alte Links je fachlicher Entscheidung ungültig, nicht unbemerkt auf die neue Fassung umleiten.

**Abnahme:** Bereits angenommen, abgelaufen, widerrufen, geänderte Fassung, falscher Token, zwei Geräte und gestoppter Netzabruf. Nachweis enthält die wirklich bestätigte Fassung. Keine Gleichsetzung einer gezeichneten Unterschrift mit einer qualifizierten elektronischen Signatur.

### A07 — Zielpreiskalkulation

Aus vorgegebenem Netto-/Bruttoziel, eindeutigem Steuerkontext und verifizierten Kosten Varianten zeigen: Kostenbasis, aktueller Verkauf, Zielabweichung, Aufschlag und Deckungsbeitrag. Marge und Aufschlag unterscheiden. Bei VK netto 100 und EK 80 sind Marge 20 % und Aufschlag 25 %. Fehlende Kosten verhindern eine belastbare Margenaussage.

Verteilung eines Zielbetrags auf Positionen ausdrücklich wählen: proportional auf anpassbare Positionen, gezielte Positionsänderung oder ausgewiesener Gesamtrabatt. Fixpreise, Preisuntergrenzen und manuelle Sperren schützen; Rundungsrest deterministisch zuordnen. Bei mehreren Steuergruppen nicht mit einem willkürlichen globalen Bruttofaktor rechnen.

**Abnahme:** Nullkosten, negativer/unzulässiger Zielbetrag, Fixposition, gemischte Steuern, letzter Cent und bestehende Rabatte. Übernahme nur als bestätigte Änderung eines bearbeitbaren Angebots.

### A08 — Angebotsentwürfe nach Einkaufspreisen nachrechnen

Gemeinsamen Kern K04 nutzen. Vergleich auf identischen Artikel-/Einheiten-/Kostenbezügen und aktuellem Katalogstand. Je Position alte/neue Kosten, Datum und mögliche Verkaufswirkung anzeigen; Quelle und Regelversion speichern. Fehlende Zuordnung bleibt Prüffall.

**UI:** Aktion am Angebotsentwurf, mit Auswahl der tatsächlich zu aktualisierenden Positionen. Keine Preisänderung allein beim Öffnen des Angebots.  
**Abnahme:** Versendete/angenommene Fassung bleibt unverändert, neuer EK überschreibt keinen manuellen VK, konkurrierende Bearbeitung erzeugt Konflikt. Änderung und PDF derselben neuen Fassung stimmen überein.

### A09 — Liegenschaften, Tops und Beteiligte

Standort → Gebäude → Einheit/Top optional strukturieren; bestehende einfache Adresse bleibt vollständig verwendbar. Eigentümer, Mieter, Hausverwaltung, Betreiber, Kontakt und Rechnungsempfänger als zeitlich gültige Beziehungen mit getrennten Funktionen modellieren. Kundennummer nicht mit einer Person oder Immobilie gleichsetzen.

**UI:** Standort-/Objektbereich in Kunden- und Baustellenakte; eigene durchsuchbare Objektliste bei aktivem Bedarf. Anlagen, Wartungen, Einsätze und Belege zeigen ihren eindeutigen Objektbezug. Alte Rechnungsadressen als Snapshot erhalten.

**Abnahme:** Wechsel von Mieter/Eigentümer/Verwaltung, mehrere Objekte derselben Verwaltung, ein Gebäude mit mehreren Anlagen und abweichender Rechnungsempfänger. Historische Dokumente und zukünftige Termine verwenden die jeweils richtige Beziehung; unberechtigte Bewohnerdaten werden nicht offengelegt.

### A10 — Sammelabrechnung

Freigegebene Quellen über mehrere Aufträge bündeln, aber fachlich nur kompatible Kombinationen gemeinsam ausstellen. Gruppierung mindestens nach tatsächlichem Rechnungsempfänger, Aussteller, Währung, zulässiger Steuerbehandlung und vereinbartem Zeitraum. Hausverwaltung kann Vertreter statt Leistungsempfänger sein; nicht allein ihren Namen als Gruppierungsschlüssel verwenden.

Quellenreservierung und Verbrauch aus K07 wiederverwenden. Im Beleg Auftrag, Objekt/Top, Leistungstag und Einzelnachweise erhalten. Unvereinbare Fälle als getrennte Rechnungsgruppen vorschlagen.

**Abnahme:** Dieselbe Verwaltung für zwei Eigentümer, bereits teilverrechnete Leistungen, nachträgliche Retoure, parallele Einzelrechnung und Storno einer Sammelrechnung. Kein Doppelverbrauch und kein Verlust der Einzelreferenzen.

### A11 — strukturierte Eingangsaufträge

Importprofile für definierte CSV/XML-Daten: Absender, externe Auftragskennung, Kunde/Vertretung, Objekt, Ansprechpartner, Termine, Positionen und Anhänge. Vorschau mit bestätigter Feldzuordnung, Validierung und Konflikten. Dublette aus Betrieb + bestätigtem Absender + externer Kennung; geänderte Wiederholung als Änderungsvorschlag mit Revision behandeln, nicht einfach verwerfen.

**Integration:** A03 erzeugt bzw. aktualisiert den bestehenden Auftrag. Unbekannte Kunden-/Objektzuordnung muss manuell lösbar sein. Kein automatisches Lesen beliebiger E-Mails/PDFs.

**Abnahme:** Doppelte Datei, gleicher Inhalt unter anderem Dateinamen, geänderte Mengen, Absenderwechsel, fremde Objekt-ID, Encoding-Fehler und Teilfehler. Eine freigegebene Importgruppe wird atomar oder mit explizitem zeilenweisen Ergebnis übernommen.

### R01 — eigenständiger Kundenlieferschein

Neuen Belegtyp mit Auftrag, Empfänger, Lieferadresse, stabilen Positionen, Mengen/Einheiten, Lieferdatum, eigenem Nummernkreis und PDF einführen. Optional Signatur der tatsächlich sichtbaren Fassung; Signatur ist nicht automatisch Voraussetzung jeder Lieferung.

**Bestandsbezug:** Jede Lieferposition benennt, ob sie eine schon gebuchte Ausgabe dokumentiert oder eine neue Bewegung auslöst. Keine zweite Abbuchung für Material aus einer bereits geladenen Rüstliste oder erledigten Anforderung.

**Abnahme:** Lieferung aus Hauptlager, Fahrzeug und bereits gebuchter Baustellenausgabe; Beleg unveränderlich nach Ausgabe. PDF-Neuerstellung, Empfängeradresse und Korrekturbezug stimmen. Rechnungszuordnung bleibt getrennt von physischer Lieferung.

### R02 — Teillieferung und Restmengen

Stabile Auftrags-/Lieferpositionen mit bestellter, gültig gelieferter, retournierter, stornierter und gegebenenfalls nicht mehr zu liefernder Menge führen. Formel: offen = bestellt − wirksam geliefert + ersatzpflichtig retournierte Menge − wirksam abbestellte Restmenge. Nicht jede Retoure verlangt Ersatz; diese Entscheidung ausdrücklich erfassen.

**UI:** Restmenge und nächste Lieferung in der Auftrag-/Lieferscheinansicht. Überlieferung nur als bewusste genehmigte Abweichung, keine stille Mengenvergrößerung.

**Abnahme:** 10 bestellt, 4+3 geliefert, 2 mit Ersatz retourniert ergibt 5 offen; dieselbe Retoure ohne Ersatz ergibt 3 offen. Zweimaliger Import derselben Lieferung, Positionsstorno und Wechsel der Einheit geprüft.

### R03 — Lieferscheinbewegung und Storno

Lieferschein und zugehörige Lagertransaktion atomar verbinden, soweit eine neue Bewegung entsteht. Schon erfolgte Ausgabe wird referenziert. Storno annulliert den Beleg fachlich, behauptet aber nicht automatisch, die Ware liege wieder im Regal.

Wurde eine gebuchte Lieferung noch gar nicht physisch ausgeführt, ihre eigene mengenwirksame Buchung mit entsprechendem Grund atomar zurücknehmen; das ist keine fiktive Retoure. Bei schon ausgegebener Ware gilt dagegen der tatsächliche Ort.

Ist das Material tatsächlich zurückgekommen: Rücknahme mit Ort, Zustand und nutzbarer Menge buchen. Bei Belegkorrektur ohne physische Rückgabe nur Beleg-/Zuordnungsweg korrigieren; eine notwendige Gegenbuchung kann über einen benannten Transit-/Baustellenort erfolgen. Kein positiver Regalbestand durch bloßen Stornoklick.

**Abnahme:** Unterschriebener Lieferschein, bereits verrechnete Teilmenge, beschädigte Retoure, Ersatzlieferung und Wiederholung. Historische Bewegung bleibt, Korrektur referenziert sie, Gesamtmenge bleibt nachvollziehbar.

### R04 — CAMT-Import

Formatadapter für ausdrücklich ausgewiesene ISO-20022-CAMT-Nachrichten und Bankprofile. Zuerst die tatsächlich benötigten camt.053-/camt.054-Fassungen und Bankbeispiele prüfen; Adapterregister erlaubt weitere Fassungen ohne Kernumbau. Eingangs- und Ausgangsumsätze, Sammelbuchungsdetails, Gebühren, Rücklastschriften und Stornoindikatoren getrennt erhalten.

Bankkonto gehört zum Mandanten. Originaldatei und normalisierte Umsätze getrennt speichern; Buchungs- und Valutadatum, Währung, Vorzeichen und Referenzen nicht vereinfachen.

**Idempotenz:** Datei-/Auszugsidentität plus stabile Bankumsatzkennung, soweit vorhanden. Wiederholte 053/054-Sicht desselben Umsatzes erkennen. EndToEndId „NOTPROVIDED“ ist keine eindeutige Kennung; Ersatzfingerprint nur Dublettenhinweis, nicht blindes Zusammenführen.

**Abnahme:** Überlappende Auszüge, anderer Dateiname, fremdes Konto, Sammelbuchung, identischer Betrag an einem Tag, Belastung/Erstattung und unbekannte Version.

### R05 — Zahlungszuordnungsvorschläge

Zunächst Vorschlag aus exakter Rechnungsreferenz, Währung, offenen Beträgen, dokumentiertem Skonto und passendem Empfänger-/Kontokontext. Fehlende oder mehrere Treffer bleiben offen. Eine passende Zahl allein reicht nicht.

Bestätigte Zuordnung über bestehende Zahlungseingangs-/Skontologik schreiben. Einen Umsatz auf mehrere Rechnungen und mehrere Umsätze auf eine Rechnung unterstützen; Gebühren, Überzahlung und nicht zuordenbarer Rest bleiben explizit. Belegte Teilzahlung ist keine vollständig bezahlte Rechnung.

**UI:** Arbeitsliste „Bankabgleich“ mit Vorschlag, Quellenansicht, manueller Aufteilung und Restbetrag.  
**Abnahme:** Zwei Bearbeiter, schon manuell erfasste Zahlung, Skonto, falsche Währung, Rücklastschrift und korrigierte Zuordnung. Rücknahme einer Zuordnung hebt nur deren eigene Zahlungswirkung nachvollziehbar auf.

### R06 — Eingangsrechnungsverwaltung

Lieferantenbeleg als Entwurf, geprüft, freigegeben, exportiert/gebucht, bezahlt bzw. korrigiert führen; diese Achsen bei Bedarf getrennt zeigen. PDF als Original, strukturierte Daten aus validiertem XML mit ausgewiesener Schemafassung oder manueller Erfassung. Bestehender ebInterface-6.1-Export ist eine Anschlussstelle, kein fertiger XML-Import.

Lieferant, Belegnummer/-art, Beleg-/Leistungsdatum, Netto/Steuer/Brutto, Währung, Zahlungsziel, Skonto, Positionen und Bestell-/Lieferbezüge. Freigabe, Kontierung und Zahlung getrennt. Lieferantenbankverbindung aus einem Beleg nie ungeprüft in Stammdaten übernehmen.

**Abnahme:** XML/PDF-Widerspruch, Rundung, Steuergruppen, Gutschrift, fehlende Referenzen, fremder Mandant und Originaldatei-Fehler. Strukturvalidität ist keine automatische kaufmännische Freigabe.

### R07 — Rechnung, Bestellung und Wareneingang abgleichen

Ein gemeinsamer Dreiwege-Abgleich mit E15, kein zweiter Algorithmus. Positionen über bestätigte Beleg-/Artikelbezüge zuordnen; bestellte Menge, tatsächlich angenommene Lieferung, Retouren, schon fakturierte Menge, Preise und Steuer getrennt vergleichen. Mehrere Lieferungen pro Rechnung und mehrere Rechnungen pro Bestellung berücksichtigen.

Konfigurierbare dokumentierte Toleranzen unterscheiden Rundungsdifferenz und fachliche Abweichung; eine Toleranz darf fehlende Identität oder Einheit nicht „grün“ machen.

**Abnahme:** Teil-/Mehrlieferung, vorgerechnete Ware, Frachtzeile, Bonus/Gutschrift, Retoure, bereits zugeordnete Eingangsrechnung und unklare Einheit. Abweichung kann mit berechtigtem Grund geklärt werden; keine automatische Zahlungsfreigabe.

### R08 — Dublettenwarnung

Vergleiche Betrieb + Lieferantenidentität + externe Rechnungsnummer + Belegart; Originalformat und bewusst definierte Normalisierung getrennt speichern. Bei fehlenden Kerndaten ähnliche Beträge/Dateihashes nur als ergänzenden Hinweis verwenden.

**Ablauf:** Gleiche Importvorgangskennung bleibt idempotent. Fachlicher Dublettentreffer verhindert nicht die begründete Bearbeitung einer zulässigen Korrektur oder tatsächlich anderen Rechnung. Warnung lösen, verknüpfen oder dokumentiert als eigenständig freigeben.

**Abnahme:** Zwei Lieferanten mit derselben Nummer, Rechnung und Gutschrift, echte Zweitschrift, geänderte XML-Datei und führende Nullen. Keine automatische Löschung oder Zusammenführung anhand bloß gleichen Betrags.

### R09 — Kontierungsvorschläge

Versionierte Regeln aus dem Betrieb: Lieferant, Artikel/Warengruppe, Kostenart, Steuerkontext und gegebenenfalls Baustellenbezug. Vorrang und Geltungsdatum definieren; widersprüchliche gleichrangige Regeln sind ein Konfigurationsfehler, keine Zufallsentscheidung. Fehlende Regel zeigt „Kontierung offen“.

**Integration:** Kontenrahmen und Kanzleiprofil des Bestands nutzen. Vorschlag mit Regelerklärung, manuell prüf-/änderbar. Änderung eines Regelwerks ändert keine bereits freigegebene/ausgeleitete Buchung.

**Abnahme:** Lieferantenregel gegen spezifische Kostenart, unbekanntes Konto, Reverse Charge, geteilte Kostenstellen und historischer Steuerwechsel. Export muss exakt die bestätigte Kontierung verwenden.

### R10 — Aufmaß in Rechnung übernehmen

Aufmaßblatt mit Ort/Bauteil, Datum, Messansatz/Formel, Einzelmaßen, Einheit, geprüfter Ergebnismenge und optionalem Foto/Planbezug. Strukturiertes Formelsystem mit erlaubten Operatoren; keine Ausführung beliebigen Codes.

Freigegebene Aufmaßposition bindet an eindeutige Angebots-/LV-/Leistungsposition. In die Rechnungsvorschau nur die noch nicht gültig verbrauchte Menge übernehmen. Versionsänderung erzeugt Differenz, keine rückwirkend neue Rechnung.

**Abnahme:** Teilaufmaße über mehrere Tage, Längen-/Flächen-/Volumenbezug, Rundung, Abzug, negative Korrektur mit Grund und bereits abgerechnete Menge. Doppelübernahme über zwei Rechnungsvorschauen serverseitig verhindern.

### R11 — Arbeitsberichte mit Rechnungen verbinden

Einen Bericht als versionierten Leistungsnachweis/Anhang referenzieren, nicht dessen Texte als neue abrechenbare Leistung kopieren. Vorschau zeigt Rechnung und tatsächlich beizulegende Berichtsfassung; berechtigter Empfänger erhält nur freigegebene kundenfähige Inhalte.

**Integration:** Bestehendes Belegarchiv, PDF-Ausgabe und neuer Versanddienst. Ausgabe als Dokumentpaket oder mehrere Anhänge mit vollständigem Belegverzeichnis; keine zerstörte Rechnungssignatur durch beliebiges Zusammenkleben.

**Abnahme:** Nachträgliche Berichtskorrektur, gesperrte Personalnotizen, fehlende Datei, mehrere Berichte, Paketdownload und Wiederholung. Rechnungssummen bleiben identisch.

### R12 — Zahlungserinnerung/Mahnung direkt versenden

Gemeinsamen Versandauftrag für freigegebene Dokumentfassungen schaffen: geprüfter Empfänger, Betreff/Textvorlage, Absenderprofil des Betriebs, Anhänge, stabile Vorgangskennung, Warteschlange und Ereignisstatus. Vor Versand Rechnungs-/Zahlungsstand neu prüfen; nach Zahlung veraltete Erinnerung anhalten.

Ein Mailprovider/SMTP-Adapter ist konkret einzurichten: verifizierter Absender, Secrets außerhalb des Browsers, berechtigte Konfiguration, SPF/DKIM/DMARC soweit zuständig, Limits und Bounces. Die Landingpage-Mail office@senklot.at ist **kein** pauschales Versandkonto aller Kundenbetriebe.

**Status:** vorbereitet, freigegeben, wird gesendet, vom Anbieter angenommen, fehlgeschlagen, gegebenenfalls zurückgewiesen/zugestellt. SMTP-Annahme ist kein Beweis, dass der Kunde gelesen hat. Bei unklarer Zustellung nicht blind erneut senden.

**Abnahme:** Ungültige Adresse, falscher Mandant, BCC-Leck, geänderte Fassung, Providerfehler, Abbruch nach Annahme und erneute Nutzeraktion. Mailprogramm-Link nicht mehr als „versendet“ protokollieren.



### E01 — parallele Großhändlerkataloge

Katalogdatensätze pro Lieferant/Version von aktiv gepflegten Betriebsartikeln trennen. Die Suche kann alle aktiven Lieferantenkataloge durchsuchen; erst die bewusste Artikelübernahme legt einen nutzbaren Materialstammbezug an bzw. verknüpft ihn mit vorhandener verifizierter Identität. Importiert wird kein fiktiver Lagerbestand.

**Migration:** Bereits verwendete Artikel und deren IDs erhalten; alte Katalogartikel nicht löschen, nur weil die neue Architektur selektiv übernimmt. Bestehende Beleg-/Lager-/Anforderungsbezüge bleiben gültig.

**Abnahme:** Zwei Lieferanten mit gleicher Händlernummer, ein Artikel bei mehreren Lieferanten, nicht übernommener Katalogtreffer, ausgelaufenes Angebot und vollständige paginierte Suche. Keine Duplikat-Stammartikel bei paralleler Übernahme.

### E02 — verifizierter Einkaufspreisvergleich

Kern K03 nutzen. Vergleichsgruppe aus bestätigter Artikel-/Varianten-/Packungsidentität. Herkunft, letzte Prüfung, Lieferantenartikelnummer und Preisquelle mitführen. Eine manuelle Zuordnung kann revidiert werden, ohne historische Preis-/Belegdaten umzuordnen.

**UI:** Im Artikel und an einer Einkaufsposition „Lieferanten vergleichen“; Menge aus dem Bedarf übernehmen.  
**Abnahme:** GTIN-Prüfziffer ohne Identitätsnachweis, gleicher Herstellername in anderer Schreibweise, technisch ähnliche Ersatzteile und uneindeutige Packungen führen zu Klärung statt falscher Gleichheit. Keine Einkaufspreise für Rollen ohne Einkaufssicht.

### E03 — günstigsten vergleichbaren Preis kennzeichnen

Nur innerhalb einer vollständig definierten Vergleichsgruppe und für gültige Konditionen den normierten Artikelpreis kennzeichnen. Benötigte Menge, Preisstaffel und tatsächliche bestellbare Menge einbeziehen. Bei Gleichstand mehrere gleich günstige Positionen anzeigen.

**Grenze:** Keine Gesamtoptimierung behaupten, solange Fracht, Mindestbestellwert, Lieferfähigkeit und Bedingungen unbekannt sind. Nicht vergleichbare Lieferanten bleiben mit Begründung sichtbar.  
**Abnahme:** Preis pro 100, Packzwang, zwei Währungen, fehlender Rabatt, Mengenschwelle und abgelaufene Kondition. Rangfolge und angezeigte Berechnung müssen reproduzierbar sein.

### E04 — Einkaufspreisverlauf und Warnungen

Versionierte Listen-/Netto-/Rabattpreise je Lieferantenartikel speichern. Gültigkeitsdatum und Import-/Bestätigungszeit unterscheiden. Warnschwellen relativ oder absolut je gewünschtem Bereich einstellbar; Bezugsversion und Rechenbasis nennen.

**Ablauf:** Neue Version aktiv → vergleichbare Änderung ermitteln → betroffene bearbeitbare Angebote/Kalkulationen verlinken. Keine Meldung pro Artikel, die hunderttausend Benachrichtigungen erzeugt: bündeln, filtern und vollständig drill-down-fähig halten.

**Abnahme:** Fehlender Altpreis, Altpreis null, Wechsel von Einheit/Packung, nachträglich importierte ältere Datei und sinkender Preis. Historische Istkosten nicht auf neue Katalogpreise umbewerten.

### E05 — Katalogversion kontrolliert aktivieren

Kern K04: Upload, persistent verarbeiteter Import, Probelauf, Fehlerbericht, ausdrückliche Aktivierung und atomarer Versionswechsel. Laufstatus um in Prüfung, bereit zur Aktivierung, fehlgeschlagen/abgebrochen und aktiviert ergänzen, soweit im Bestand notwendig.

**Abnahme:** Zwei gleichzeitige Läufe desselben Lieferanten, Abbruch während Verarbeitung und fehlende Rabattdatei ersetzen nie den gültigen Stand. Ein Rollback aktiviert einen bekannten Stand, ohne neuere Belege rückzuschreiben. Verarbeitung und Speicherbereinigung sind pro Lauf nachvollziehbar.

### E06 — veraltete Katalogstände

Je Lieferant konfigurierbare Frist seit dem bestätigten Preisstand. Zeige Datum, Alter und Herkunft; ein gerade hochgeladenes altes Preisdatum ist nicht plötzlich ein aktueller Preis. Fehlendes Datum heißt unbekannt.

**UI:** Zurückhaltender Hinweis in Vergleich/Kalkulation, Filter in Lieferanten-/Katalogübersicht. Keine modale Warnung bei jeder Suche.  
**Abnahme:** Lieferant ohne bestätigten Stand, gesetzte/entfernte Frist, historischer Import und als unverändert bestätigte Preisliste. Ein Warnhinweis ist keine heimliche Sperre aller Artikel.

### E07 — Verkaufs- und Aufschlagsregeln

Vorhandenen Standard-/Warengruppenaufschlag erweitern, nicht ersetzen. Regeln auf Lieferant, Warengruppe, Kundengruppe, Vertragsbezug, Gültigkeit und Kombinationen beziehen. Eindeutige explizite Priorität plus nachvollziehbare Spezifität; gleiche wirksame Priorität muss vor Freigabe geklärt werden.

Manuell fixierter Positionspreis und individuell vereinbarter Vertragspreis haben Vorrang entsprechend dokumentierter Betriebsregel. Regelvorschau erklärt EK-Basis, Aufschlag vs. Marge, Rundung, Steuer und Ergebnis. Regeln sind versioniert und gelten für neue bzw. ausdrücklich neu berechnete Entwürfe.

**Abnahme:** Ohne neue Regeln exakt bestehende Ergebnisse. Kundengruppenwechsel, kombinierte Regeln, fehlender EK, Mindestmarge, Fixpreis und historisches Angebot. Neue Regeln ändern weder schon versendete Fassungen noch alte Rechnungen.

### E08 — Lieferantenangebote gegenüberstellen

RFQ-/Angebotskopf mit Lieferant, Gültigkeit, Lieferbedingungen und eindeutig zugeordneten Positionen. Manuell oder über bestätigten CSV/XLSX-Import erfassen; Originalbeleg privat verknüpfen. Identität und Einheiten aus E02 verwenden.

Gleiche Anfrageposition kann von mehreren Lieferanten und mit Alternativen beantwortet werden. Alternativen ausdrücklich als solche führen; keine automatische Gleichstellung. Preis, vollständige Bestellmenge, Datum, Fracht und Teillieferbarkeit getrennt anzeigen.

**Abnahme:** Unvollständiges Angebot, Alternativartikel, Staffel, Mischwährung, fehlende Lieferzeit und doppelte Angebotsdatei. Übernahme erzeugt einen nachvollziehbaren Einkaufsvorschlag, keine Bestellung ohne Freigabe.

### E09 — Preisanfrage an mehrere Lieferanten

Aus bestehenden Bedarfen eine versionierte Anfrageliste mit Positionen, Mengen, Einheiten, gewünschtem Termin und Referenz vorbereiten. Empfängerspezifische Dokumente; Konditionen eines anderen Lieferanten dürfen nicht mitgeschickt werden.

**Integration:** Bestehende PDF-/Mailprogrammwege bleiben bis zum neuen tatsächlichen Versanddienst nutzbar. Ein Klick auf das Mailprogramm ist nur „vorbereitet“. Direkter Versand verwendet den Dienst aus R12; Antworten strukturiert oder manuell nach E08.

**Abnahme:** Anfrageänderung nach einer Antwort, mehrere Empfänger, fehlende Kontaktdaten und Wiederholung. Anfrage-/Antwort-/Bestellversion bleiben unterscheidbar; Kunden-/Bewohnerdaten nur falls wirklich benötigt.

### E10 — Lagerorte und Fahrzeuglager

Additiv Lagerorte mit Typ, verantwortlichen Berechtigten und Aktivstatus einführen. Bestehenden Bestand als nachvollziehbare Ausgangsposition dem bisherigen Hauptlager zuordnen; historische Bewegungen nicht nachträglich auf Fahrzeuge verteilen.

Zugänge, Entnahme, Retoure, Inventur, Transit und Umlagerung mit Quelle/Ziel. Umlagerung: Abgang und Zugang in einer Transaktion; bei tatsächlicher Übergabe über längeren Zeitraum expliziter Transit mit Bestätigung. Betriebsbestand ist die Summe der physischen Orte einschließlich korrekt benannter Transitbestände, nicht Hauptlager plus kopierte Fahrzeugzahl.

**Abnahme:** Gleichzeitiges Umlagern/Kommissionieren, Fahrzeugwechsel, Teilrückgabe, Ort deaktivieren mit Restbestand und dokumentierte Bestandsabweichung. Keine unbemerkten negativen Verfügbarkeiten; bestehende berechtigte Ausnahmewege gezielt berücksichtigen.

### E11 — scannergestützte Kommissionierung

Kamera und Hardware-Tastaturscanner anbieten, Codeformat und Zuordnung prüfen. Scancode ist ein Identifikator mit Herkunft, Packung und gegebenenfalls Artikelvariante; dieselbe Rohzeichenfolge nicht ohne Kontext als interne ID verwenden.

**Ablauf:** Code → eindeutiger Artikel → Ort/Bedarf → Menge → prüfbare Buchungsaktion. Kein wiederholtes Buchen desselben Kamera-Frames. Unbekannte Codes über berechtigte manuelle Verknüpfung lösen; Textsuche bleibt gleichwertig.

**Abnahme:** Doppelscan, schadhafter Code, fehlende Kameraberechtigung, Netzverlust, Mehrfachzuordnung und Packscan. Offline darf Erfassung vorgemerkt werden, aber kein ungeprüft verfügbarer Bestand zugesagt werden.

### E12 — scannergestützte Inventur

Inventurauftrag pro Ort mit nachvollziehbarem Zählumfang, Stichtag/Zählzeitpunkt, Sollsnapshot, Zählungen, Differenzen und Freigabe. Auch ungescannte Nullbestände und unbekannte Artikel müssen erfassbar sein. Erneutes Zählen ist keine zusätzliche Menge, sondern versionierte Korrektur.

Parallelbewegungen nicht verschlucken: je Position kontrolliertes Zählfenster oder dokumentierte Überleitung bestätigter Bewegungen. Bei unklarer Reihenfolge nachzählen statt theoretisch „korrigieren“. Differenzbuchung und Freigabe atomar, mit Grund und Vorgangskennung.

**Abnahme:** Während Zählung ein-/ausgelagerte Ware, zweiter Zähler, Zählfehler, unbekannter Code, abgebrochene Inventur und wiederholter Abschluss. Kein pauschales Überschreiben aller Bestände.

### E13 — Materialampel

Kern K02 vollständig umsetzen: physisch bereit, teilweise bereit, nicht bereit, unbekannt; erwartete termingerechte Deckung davon trennen. Betrachtung sowohl für Auftrag als auch konkreten Einsatz, mit Ort, Termin und eigenen/fremden Reservierungen.

**UI:** In Planung und Akte eine kompakte Zeile, Details aufklappbar. Ein Blick auf dieselbe Position in Start, Lager oder Einsatz zeigt dieselben Mengenbegriffe.  
**Abnahme:** Reservierung konkurrierender Baustellen, verspätete Zusage, eigener reservierter Bestand, Teilabholung und fehlende Einheit. Eine Anforderung ist noch keine Lieferzusage.

### E14 — regelbasierte Bestellvorschläge

Konkreten Baustellenbedarf und Bestandssoll gemeinsam planen, ohne denselben Fehlbedarf zweimal vorzuschlagen. Basis pro Artikel/Ort/Bedarfstermin: freie und zugeteilte Mengen, offene tatsächliche Bestellungen, belegte Lieferzusagen und gewünschter Mindest-/Zielbestand.

Entweder disjunkte Bedarfsgruppen oder eine zeitbezogene Bestandsprojektion verwenden. Nicht einfach Mindestbestandslücke plus Rüstlistenlücke addieren, wenn dieselbe verfügbare Menge beide beeinflusst. Bestellmenge an verifizierte Packung/Mindestmenge runden.

**Abnahme:** Zwei Bedarfe, schon ausgelöste Bestellung, stornierte Zusage, Bestand unbekannt, Terminverschiebung und bereits bestehende Einkaufsliste. Vorschlag bleibt überprüfbar; Buchen/Versenden erst ausdrücklich.

### E15 — Lieferantenrechnungsabgleich

Exakt denselben Dienst und dieselben Daten wie R07 verwenden. Zusätzlicher Einstieg aus Bestellung, Wareneingang und Lieferantenakte, aber keine eigene „passt“-Berechnung.

**UI:** Fehlende Rechnung, Teilrechnung, Mengen-/Preisabweichung, ungeklärte Steuer oder fehlende Referenz sichtbar. Ein Freigabegrund kann dokumentiert werden, ändert aber nicht das Original.  
**Abnahme:** R07-Gegenproben plus Zugriff ohne Finanzrecht. Ein Lagerbearbeiter darf Liefermengen prüfen, ohne dadurch automatisch Bank-, Rechnungs- oder Margendaten zu sehen.

### E16 — Restmaterial zurückgeben oder abrechnen

Ausgabe, tatsächlicher Verbrauch, noch auf Baustelle/im Fahrzeug vorhandener Rest und Retoure getrennt führen. Mitarbeiter meldet Menge, Herkunft, Zielort und Zustand; berechtigter Wareneingang bestätigt die nutzbare Rücknahme. Beschädigte Ware geht nicht in frei verfügbaren Bestand.

Abrechnung hängt vom Vertrag ab: zurückzugeben, zu vergüten, bereits verkauft, verbraucht oder nachträglich auszugleichen. Eine physische Retoure storniert keine ausgestellte Rechnung; dafür bestehenden Belegkorrekturweg anbieten.

**Abnahme:** Teilrest, ursprüngliche Rüst-/Anforderungsbewegung, andere Rückgabestelle, defekte Ware, schon verrechnete Menge und wiederholte Bestätigung. Keine doppelte Lagergutschrift oder automatische Rückvergütung.

### B01 — „Mein Tag“

Kern K01 auf der bestehenden Startseite umsetzen. Einsatz, Anruf/Navigation, Zeit, Material, Fotos, Schein, Nachrichtenkontext und Aufgaben verwenden gemeinsame Quellen. Der Einstieg bleibt auch ohne geplanten Einsatz oder abgeschaltetes Modul nutzbar.

**UI:** Ein ausgewählter Einsatz und ein nächster sinnvoller Arbeitsschritt; weitere Einsätze darunter, keine zehn gleichwertigen Hauptknöpfe.  
**Abnahme:** Vollständiger Tagesablauf, Wechsel zwischen Aufträgen, Rückkehr aus Bearbeitung, unerledigte Aufgabe, lokaler Entwurf und nicht übertragene Datei. Alle bisherigen Einzelseiten bleiben erreichbar.

### B02 — durchgehender Start-/Stopp-Ablauf

Arbeitszeitsitzung und darin liegende Auftragssegmente als neuen Erfassungszustand modellieren; abgeschlossene Segmente über dieselben bisherigen Zeitbuchungs-/Prüfregeln übernehmen. Keine unvollständige endTime in eine bisher nur abgeschlossene Buchungen erwartende Auswertung drücken.

Zustände: nicht gestartet, arbeitet ohne Auftragszuordnung, arbeitet an Auftrag, Pause, gestoppt/zu prüfen. Auftragswechsel schließt das vorherige Segment und öffnet das nächste atomar. Arbeitszeit ist nicht automatisch verrechenbare Auftragszeit; Fahrt, Werkstatt, Pause und nicht verrechenbare Arbeit ausdrücklich klassifizieren.

**Abnahme:** Mehrere Geräte/Tabs, offline begonnene Sitzung, Nachtschicht, Zeitumstellung, App beendet, doppelte Stopp-Aktion und nachträgliche Zuordnung. Kein paralleler Haupttimer für denselben Benutzer ohne geklärten Konflikt; vorhandene manuelle Erfassung bleibt gleichwertig.

### B03 — digitale Besichtigung

Versionierte Checklisten für Besichtigungsarten mit Aufgaben, tatsächlichen Mengen/Einheiten, ausgewählten Katalogartikeln/Leistungen, Fotos und ergänzenden Notizen. Vorlagen sind Hilfen, keine Annahme, jede Baustelle habe identische Anforderungen.

**Ablauf:** Besichtigung zum Auftrag/Kunden → Entwurf → prüfen/freigeben → ausgewählte bestätigte Positionen in Angebotsentwurf übernehmen. Quelle je Angebotsposition merken; übernommene Daten nicht durch spätere Checklistenänderung automatisch überschreiben.

**Abnahme:** Unbekannter Artikel, fehlender Preis, geänderte Menge, zweite Übernahme, Fotosynchronisation und abgelehnte Position. Ein freier Text wird nicht automatisch als kalkulierte Leistung interpretiert.

### B04 — Arbeitsvorbereitung mit Freigaben

Arbeitspaket an bestehender Baustelle: Anweisung, Termin, zuständige Personen, Dokumente, benötigtes Material und erforderliche Prüf-/Qualifikationsbedingungen. Status Entwurf, vorzubereiten, zu prüfen, freigegeben, in Arbeit und Änderung nötig; Freigabe bezieht sich auf eine Revision.

Fehlende gesetzlich erforderliche Befähigung oder ungeklärte sichere Durchführung ist keine wegklickbare Warnung. Andere operative Abweichungen dürfen entsprechend Berechtigung und begründetem Betriebsablauf bestätigt werden.

**Abnahme:** Material-/Terminänderung nach Freigabe, erforderliche Unterlage entzogen, Person ersetzt und nur teilweise vorbereiteter Auftrag. Betroffene Freigabe gezielt neu prüfen, nicht die gesamte Baustelle ohne Begründung blockieren.

### B05 — Aufgaben

Aufgabe mit Baustellen-/Arbeitspaketbezug, Zuständigkeit, Frist, Anhängen, Status und Verlauf. Offen, in Arbeit, erledigt, nicht geschafft mit Pflichtgrund; Wiederaufnahme bleibt nachvollziehbar. Verantwortlichenwechsel und Benachrichtigung über denselben Vorgang absichern.

**UI:** Kurze Arbeitsliste in Akte und Mein Tag, Filter für eigene/offene/überfällige Aufgaben. Kein separater Projektmanagement-Nachbau als Voraussetzung.

**Abnahme:** Abwesender/gelöschter Verantwortlicher, mehrere Ausführende mit einem verantwortlichen Besitzer, Friständerung, geänderte Datei und Offline-Konflikt. Eine Aufgabe erledigen bucht weder Zeit noch Material und bestätigt keine Rechnung.

### B06 — Planung per Drag-and-drop

Auf dem bestehenden Wochen-/Tages-/Monatskontext verschieben, verlängern und zuordnen. Identische serverseitige Planungsfunktion wie Formularweg; Urlaub, Betriebsurlaub, Überschneidung, Arbeitszeit und zulässige Rolle vor endgültigem Speichern prüfen. Keine Datenänderung nur durch Hover.

**UI:** Drag-Vorschau, Konflikterklärung, Tastatur-/Mobile-Alternative und Rücknahme nur über fachlich sichere Gegenaktion. Gruppenverschiebung zeigt betroffene Personen und Termine.

**Abnahme:** Zwei Planer, vertauschte Einsätze, Zwischenänderung einer Abwesenheit, Scrollen während Drag, abgebrochene Geste und Netzwerkfehler. Keine automatische Überschreibung oder Änderung anderer Termine.

### B07 — Ersatzkräfte vorschlagen

Schnittmenge aus einplanbarer Rolle, tatsächlicher Verfügbarkeit, hinterlegter Qualifikation/Gültigkeit, freier Kapazität und für den Einsatz explizit gepflegten Bedingungen. Keine Bewertung von Menschen nach Produktivität oder Krankenstand. Vergangene Zeitbuchungen sind keine automatische Verfügbarkeitszusage für die Zukunft.

**UI:** Liste mit „passt nach diesen Kriterien“ und fehlenden Informationen. Fehlende Qualifikationsdaten nicht als „qualifiziert“ oder „ungeeignet“ ausgeben. Manuelle Entscheidung bleibt.

**Abnahme:** Teilabwesenheit, Paralleltermin, ablaufende Befähigung am Einsatzdatum, deaktivierter Nutzer und überlappende Arbeitszeitgrenzen. Vorschlag selbst bucht nichts.

### B08 — Qualifikations-/Materialhinweise beim Einteilen

Z05, E13 und B06 in einem Validierungsergebnis zusammenführen. Kriterien klassifizieren: erfüllt, fehlt, unbekannt, gesetzlich/fachlich blockierend oder berechtigt übersteuerbare operative Abweichung.

**UI:** Am betroffenen Einsatz kompakte Begründung und konkreter Klärweg; keine Gesundheitsgründe im Planraster. Nicht fünf Warnfenster nacheinander öffnen.

**Abnahme:** Einsatz ohne benötigte Materialliste, Lieferung unbekannt, gesetzliche Befähigung abgelaufen, bewusst vorgezogenes Vorbereitungsfenster und Terminverschiebung. Keine pauschale Sperre aller Arbeit wegen eines optionalen ungenutzten Moduls.

### B09 — projektbezogener Chat und Direktnachrichten

**Produktreview: ändern.** Kontextgebundene Threads und Erwähnungen sind empfohlen. Ein freier allgemeiner DM-Messenger ist in der folgenden Originalreferenz beschrieben, gehört aber nicht zum empfohlenen Standardumfang ohne ausdrückliche fachliche Entscheidung.

Nachrichten als eigener fachlicher Bereich, nicht als Kommentare in Finanzdaten. Kanal an Auftrag/Baustelle, zusätzlich berechtigte 1:1-Unterhaltung; Teilnehmer und Zugriff serverseitig bestimmen. Mitgliedschaft allein darf keine Baustellenberechtigung erzeugen. Nachrichteninhalt, Anhänge, Bearbeitung-/Löschmarkierung und Zustellung getrennt speichern.

**UI:** Kontextbereich „Nachrichten“ in der Akte und ein zentraler gebündelter Posteingang; mobile Leiste nicht verdrängen. Ungelesen-Zähler respektiert Rechte. Benachrichtigungen bündeln, Inhalte auf gesperrtem Bildschirm datensparsam. Keine verpflichtenden allgemeinen Lesebestätigungen.

**Offline/Betrieb:** Nachricht erst lokal vorgemerkt, nach Serverbestätigung gesendet. Anhänge mit eigenem Status, Retry und Viren-/Typprüfung. Bearbeiten/Löschen nach dokumentierter Regel; bedeutende Geschäftsentscheidungen müssen in den entsprechenden Fachvorgang übernommen werden.

**Abnahme:** Nutzer verliert Baustellenzugang, neuer Teilnehmer, archivierter Auftrag, DM an unberechtigte Person, doppeltes Senden, Attachmentfehler, Push-Fehler und Suche. Keine geheime globale Leseberechtigung der Plattformadministration; kein behauptetes Ende-zu-Ende-Verschlüsselungsniveau ohne entsprechende Architektur.

### B10 — Bautagesbericht

Dokumenttyp mit Tag/Zeitraum, Auftrag, tatsächlichem Personal, Leistungen, Material, Bildern, besonderen Ereignissen, manuell erfasstem Wetter und Unterschriften. Daten aus freigegebenen Buchungen als belegte Vorbelegung, zusätzliche beobachtete Tatsachen mit Autor/Herkunft manuell ergänzen.

Planstunden sind keine Iststunden; Abwesenheitsgründe gehören nicht in kundenfähige Berichte. Wetter nicht aus Standort oder Kalender erraten.

**Abnahme:** Zeitbuchung nach Entwurf geändert, wetterfreie Eingabe, manuelle Beobachtung, mehrere Fotos, Vorbehalte und Berichtkorrektur. Ausgestellte Fassung einfrieren; Bericht erzeugt keine zweite Zeit-/Materialbuchung.

### B11 — Arbeitsbericht aus vorhandenen Daten

Berichtsansicht für frei gewählten Zeitraum und Auftrag; vorhandene Stunden, Material-/Leistungsquellen und erlaubte Fotos zusammenstellen. Dubletten zwischen Schein, Materialausgabe und Zeitquelle verhindern. Bemerkungen manuell; Umfang und Empfängerfreigabe ausdrücklich wählen.

**Integration:** Gemeinsamer Dokument-/Vorlagenkern mit B10, aber unterschiedliche fachliche Felder. R11 referenziert die fertige Fassung.  
**Abnahme:** Mehrere Tage, unbestätigte Quelle, unterschiedliche Einheiten, bereits verrechnete Leistung, nachträgliche Korrektur und erneute Ausgabe. Ein Bericht über vergangene Arbeit ist kein neuer abrechenbarer Verbrauch.

### B12 — Mängelverfolgung

Mangel mit Ort/Objekt, Beschreibung, Foto, Verantwortlichem, Frist, Priorität, Status und Erledigungsnachweis. Sichtbarkeit intern/kundenfreigegeben ausdrücklich; Mangel ist nicht automatisch ein rechtliches Schuldanerkenntnis oder eine Nachtragsforderung.

**UI:** In Baustellenakte und betroffenen Aufgaben; „erledigt gemeldet“ und „geprüft abgeschlossen“ bei Bedarf getrennt. Wiedereröffnung erhält Historie.

**Abnahme:** Teilbehebung, neue Fotos, Verantwortlicher nicht mehr aktiv, Frist abgelaufen, Freigabe widerrufen und verknüpfte Abnahme. Kein Löschen eines dokumentierten Mangels, um einen Abschlussstatus zu erreichen.

### B13 — Abnahme mit Signaturen

Abnahmeumfang, Datum, Beteiligte und deren Vertretungsangaben, tatsächlich geprüfte Punkte, offene Mängel und Vorbehalte erfassen. Ergebnis explizit: vollständig, teilweise/mit Vorbehalt oder nicht abgenommen; keine automatische Abnahme allein aus „Baustelle erledigt“.

**Dokument:** Vor Unterschrift vollständig anzeigen, versionieren, lokale/öffentliche Signaturwege entsprechend Freigabevertrag; Nachtrag bei Änderung. Ein Vorbehalt bleibt im PDF sichtbar.

**Abnahme:** Zwei Unterschriften, abgelehnte Unterschrift, Teilabnahme, spätere Mangelbehebung und geänderter Umfang. Gewährleistungs-/Fristbeginn nur mit eindeutigem fachlichem Bezug, nicht pauschal aus jedem Signaturzeitpunkt.

### B14 — Kosten-/Deckungsbeitragsprognose

Vorhandene Nachkalkulation erweitern. Istkosten, noch nicht verbrauchte Verpflichtungen und ausdrücklich gepflegter Restaufwand getrennt; dieselbe Bestellung nicht als Verpflichtung und nochmals als Restkosten zählen. Prognosebasis/Datum/Verantwortlicher, angenommener Erlös und Unsicherheiten anzeigen.

Formel nach konsistenter Kostenart: erwartete Gesamtkosten = Istkosten + verbleibende Kosten; verbleibende Kosten zerlegen in schon gebundene und noch nicht gebundene Anteile. Erwarteter DB = plausibler Nettoerlös minus erwartete Kosten. Fehlende EK-/Lohn-/Restdaten verhindern eine genaue Zahl.

**Abnahme:** Teilrechnung, bereits gebuchte Eingangsrechnung zu vorhandenem Materialkostenbezug, Retoure, Reststunden geändert, Budget unbekannt und Rechteentzug. Nur Ist-Werte zeigen, wenn Restaufwand fehlt.

### B15 — SharePoint-Dokumentanbindung

Optionaler Microsoft-Graph-Adapter mit pro Betrieb zugeordnetem Microsoft-Tenant und explizit freigegebenen Sites/Ordnern. OAuth-Modus und minimal nötige Berechtigungen definieren; für App-Zugriff bevorzugt ausgewählte Sites statt pauschalem Zugriff auf alle Unternehmensdateien. Konfiguration/Secrets serverseitig, widerrufbar.

**Standard:** Referenz mit Drive-/Item-ID, Version/ETag und Herkunft; beim Öffnen sowohl Senklot- als auch SharePoint-Berechtigung prüfen. Bewusster Import erzeugt gekennzeichneten Snapshot in bestehender Dokumentablage. Referenz und importierte Kopie dürfen nicht still verwechselt werden.

**Abnahme:** Verschobene/gelöschte Datei, Version geändert, Graph-429/Retry-After, abgelaufene Autorisierung, entzogener SharePoint-Zugriff, fremder Microsoft-Tenant und Offline. Kein öffentliches Freigabelink-Recht als Abkürzung. Eine zweite, automatische unkontrollierte Vollablage ist nicht erforderlich.



### Z01 — Korrekturantrag für Zeitbuchung

Mitarbeiter schlägt Änderung einer eigenen Buchung mit Ausgangsrevision, gewünschten Feldern und Grund vor. Antragsstatus eingereicht, in Prüfung, genehmigt, abgelehnt, zurückgezogen oder durch zwischenzeitliche Änderung überholt. Ein Antrag ändert noch keine Arbeitszeit.

Berechtigte Zeitbearbeitung übernimmt über denselben bisherigen Korrekturweg, mit Journal und Neuberechnung der betroffenen Salden/Abrechnungsfolgen. Urlaub, Freistellung oder ärztlicher Nachweis bleiben an ihren bestehenden Sonderablauf gebunden.

**Abnahme:** Genehmigung nach zwischenzeitlicher Büroänderung, schon verrechnete Stunde, Antrag zurückgezogen, Ablehnung, doppelte Entscheidung und Hinweis an den Mitarbeiter. Historische Rechnung bleibt unverändert; erforderliche Abrechnungskorrektur wird sichtbar.

### Z02 — zusätzliche Durchrechnungs-/Ausgleichsmodelle

Vorhandene Modelle und Einstellungen als unveränderte Vorgabe weiterführen. Einen versionierten Regelvertrag je Betrieb/Person ergänzen: Geltungsbeginn, Sollverteilung, fixe oder rollierende Perioden, Wochen-/Monats-/Stichtagsbezug, Übertrags-/Ausgleichsbehandlung, Zuschlagszuordnung und zulässige Ausnahmen.

Keine pauschale Formel „Saldo am Monatsende = Überstunden“. Jede angebotene Modellkonfiguration benötigt konkrete verifizierte Rechenbeispiele und eine fachlich geklärte Grundlage. Nicht definierte Modelle als konfigurationsbedürftig ausweisen; der technische Regelkern soll neue Parameter-/Modelladapter erlauben, ohne alle Altdaten umzubauen.

**Migration:** Neue Regel gilt ab bestätigtem Datum. Alte abgeschlossene Perioden behalten ihre Regelversion; eine nötige rückwirkende Korrektur ist ein eigener dokumentierter Vorgang, keine stille Massenneuberechnung.

**Abnahme:** Teilzeit, Eintritt/Austritt, Modellwechsel innerhalb einer Periode, Urlaub/Feiertag, Zeitausgleich, Nacht-/Wochenendarbeit und Periodenüberschneidung. Gemeinsame TS-/SQL-Testvektoren; keine behauptete vollständige Lohnabrechnung.

### Z03 — Schlechtwetter, Fahrzonen und Zulagen

Typisierte Zusatzmerkmale mit Datum/Zeitraum, Tätigkeit/Fahrtbezug, Menge/Einheit, Regelversion, Nachweis und zuständiger Freigabe. Tatsächliche Erfassung von rechtlicher bzw. vertraglicher Entgeltwirkung trennen.

Regeln bestimmen Ausschluss, Kombination, Mengenbasis und Gültigkeit; vorhandene Nacht-/Notdienst-/Lehrlingslogik unverändert weiterführen. Fahrzone stammt aus betrieblich gepflegter Zuordnung oder bestätigter Eingabe, nicht aus verpflichtendem GPS. Schlechtwetter ist nicht automatisch Kurzarbeit oder unbezahlte Zeit.

**Abnahme:** Mehrere Merkmale an einem Tag, Schicht über Mitternacht, bestehender Zuschlag, fehlender Tarif, Regelwechsel und Export. Interner Lohnzuschlag wird nicht automatisch zur Kundenrechnung.

### Z04 — optionales automatisches Ausstempeln

**Produktreview: ersetzen.** Empfohlen sind eine Erinnerung und ein ausdrücklich bestätigter Abschlussvorschlag statt einer allein zeitregelbasierten arbeitszeitwirksamen Endbuchung. Die folgende Beschreibung dokumentiert den abzusichernden Originalwunsch, nicht die empfohlene Standardfunktion.

Nur auf die neue laufende Zeitsitzung aus B02 beziehen; keine bestehende abgeschlossene Buchung verkürzen. Betrieb/Person konfiguriert transparent, ob, wann und nach welcher Regel ein offener Timer beendet wird. Vorwarnung und Möglichkeit zum Weiterarbeiten/Korrigieren.

Serverseitiger Job schließt nur die erwartete noch offene Revision, mit Grund „automatische Endregel“ und Prüfhinweis. Dieser technische Endpunkt ist kein Beweis des tatsächlichen Arbeitsendes; länger geleistete Arbeit lässt sich vollständig nachtragen. Unbestätigte automatische Enden dürfen nicht unbemerkt als endgültig geprüfte Lohn-/Abrechnungsgrundlage gelten.

**Abnahme:** Nacht-/Bereitschaftsdienst, Mitarbeiter arbeitet weiter, manuell kurz zuvor gestoppt, Jobwiederholung, Winterzeit, offline gestartete Sitzung und abgelaufene Anmeldung. Ohne bekannte Sitzung keine erfundene Zeitbuchung; lokaler Fall wird nach Wiederverbindung geklärt.

### Z05 — Qualifikationen und Erinnerungen

Qualifikationsart, Geltungsbereich/Anlage, Aussteller, Nachweis, geprüft von/am, Beginn und Ablauf führen. Kein bloßer Freitexthaken „zertifiziert“. Unbefristete und zeitlich befristete Nachweise unterscheiden.

**UI:** Benutzerakte und minimale Planungsinformation. Planende sehen passende Eignung/Gültigkeit, nicht automatisch vertrauliche Personaldokumente. Erinnerungen mit konfigurierbarem Vorlauf und Zuständigkeit, einmalig pro Frist-/Revisionsereignis.

**Abnahme:** Ablauf während geplantem Einsatz, erneuerter Nachweis, widerrufene Befähigung, fehlendes Datum und falsche Anlagenkategorie. Gesetzlich notwendige Befähigung nicht per allgemeinem Warnungs-Override aushebeln.

### W01 — Wartungs-/Prüfchecklisten

Kern K05: verifizierte Vorlagen je Anlagen-/Wartungsart, typisierte Felder, Einheiten, bedingte Pflichtpunkte, Fotos, Abweichungen und signierbare Vorschau. Anlage, Wartungsvereinbarung und Ausführung getrennt.

**Abnahme:** Zwei unterschiedliche Anlagen, neuer Vorlagenstand, fehlender Wert, berechtigtes „nicht zutreffend“ und offener Entwurf. Keine pauschale universelle Liste oder erfundene Messung. Offline-Entwurf erst nach belastbarer Erweiterung des Ausgangsfach-/Dateikonzepts freigeben.

### W02 — Abweichungen von Prüfwerten

Grenzwert mit Quelle, Gültigkeit, Anlagen-/Bauteilbezug, Einheit und Vergleichsoperator zur Vorlagenfassung speichern. Optional dokumentierte Toleranz/Prüfunsicherheit. Gemessener Istwert bleibt unverändert; abgeleitete Bewertung hat eigene Regelversion.

**UI:** Direkt am Feld verständlich „gemessen …, erwartet …, Grundlage …“. Unbekannte/veraltete Grenzwerte als ungeklärt anzeigen. Fachlich notwendige Folgeaktion verknüpfen, nicht automatisch ein Gerät als sicher erklären.

**Abnahme:** Genau am Grenzwert, Einheitenumrechnung, fehlender Messwert, unbekannte Vorlage, Messbereich und nachträglich geänderte Sollvorgabe.

### W03 — Prüfbericht als PDF

Bericht aus bestätigtem Anlagen-/Ausführungs-/Antwortsnapshot erzeugen. Identität, Datum, Bearbeiter/Freigabe, verwendete Vorlage, tatsächliche Werte und Abweichungen, Fotos und Unterschriften enthalten. Unvollständige oder nur entworfene Berichte klar als solche kennzeichnen.

Dateierstellung hat nachvollziehbaren Status; bei Fehler keine doppelte Ausführung oder nächste Wartung erfinden. Korrektur als verknüpften Nachtrag/neue Fassung.

**Abnahme:** PDF und gespeicherte Eingaben stimmen feldgenau, Vorlagen-/Adressänderung ändert alte Ausgabe nicht, Signatur bezieht sich auf die richtige Fassung. Wiederherstellung enthält Bericht und Fotos.

### W04 — Wartungsabrechnung vormerken

Bestätigte Ausführung, gültige Vereinbarung/Tariffassung, tatsächlich angefallene Zusatzleistungen und bereits zugeordnete Rechnungen prüfen. Bestehendes wartungPosition und Rechnungsvorschau weiterverwenden.

Eine erledigte Checkliste ist nicht automatisch ein freigegebener kostenpflichtiger Zusatzauftrag. Wartung kann enthalten, pauschal, einzeln oder bereits vorausbezahlt sein; Vertragsgrundlage entscheidet.

**Abnahme:** Zwei Ausführungen auf einer Baustelle, ausgewechselte Anlage, Tarifwechsel, schon verrechnete Wartung, Teilstorno und fehlender Preis. Keine zweite Rechnung bei erneutem Bestätigen und keine Fälligkeit allein durch Vorschauerzeugung fortschreiben.

### W05 — Wartungsvereinbarung online unterschreiben

Signaturdienst aus A06 für eine eindeutige Vertragsfassung wiederverwenden: Anlage(n), Leistung, Intervalle, Konditionen, Laufzeit-/Gültigkeitsangaben und zuständige Partei. Nur bestätigt gespeicherte Annahme aktiviert die entsprechende neue Vereinbarung nach fachlicher Regel.

Mehrere Anlagen in einem Vertrag und verschiedene Prüfarten an einer Anlage ermöglichen; Änderungen erzeugen neue Vertragsfassung. Kein stilles Überschreiben bestehender Wartungsintervalle durch Linkaufruf.

**Abnahme:** Verlängerung, Vertragsänderung, widerrufener Link, falsche Anlage, Vertreterangaben, abgelaufene Fassung und Wiederholung. Nachweis und künftig geplante Ausführung beziehen sich auf dieselbe angenommene Version.

### W06 — Fuhrpark und Fristen

Fahrzeug als Betriebsmittel mit Kennung, Kennzeichen, relevanten Grunddaten, Zuständigkeit, Aktivstatus und dokumentierten Pickerl-/Service-/Versicherungsfristen. Tatsächliche Nachweise und Terminstatus von bloßem Kalenderdatum unterscheiden.

**UI:** Ein gemeinsamer Bereich Betriebsmittel mit Fahrzeugliste, Akte, Fristen und Bezug zum Fahrzeuglager. Erinnerungen an Verantwortliche, gebündelt nach Dringlichkeit. Kein neuer Dashboardblock für jede Fristart.

**Abnahme:** Fahrzeug stillgelegt/verkauft, Verantwortlicher wechselt, Frist verlängert, Nachweis fehlt und Erinnerung bereits bearbeitet. Keine automatisch verlängerte Prüfung ohne dokumentierten Abschluss.

### W07 — Fahrtenbuch und Kilometer

Manuelle oder definierte strukturierte Fahrtenerfassung: Fahrzeug, Fahrer, Start/Ende, Kilometerstände, Strecke/Zweck, gegebenenfalls Auftrag, Kategorie privat/betrieblich und Korrekturbezug. Daten von privaten Fahrten datensparsam und rechteabhängig.

Fortlaufende Kilometer plausibilisieren; Lücke als Lücke markieren, keine erfundene Zwischenfahrt ergänzen. Korrektur mit Grund/Version, abgeschlossener Export mit Zeitraum und Nachweisstand. Steuerliche Anerkennung nicht ohne entsprechende Form-/Praxisprüfung behaupten.

**Abnahme:** Fahrerwechsel, mehrere Fahrten, Kilometerfehler, Werkstatt-/Tachowechsel, Einheitenimport, Privatsphäre und Export. Kein GPS erforderlich. Eine Fahrt erzeugt nicht automatisch zusätzlich Arbeitszeit oder Materialbewegung.

### W08 — Maschinen und Geräte

Einzelnes Betriebsmittel von Verbrauchsartikel trennen: Gerätekennung/Seriennummer, Typ, Standort, Verantwortlicher, Verfügbarkeit, dokumentierte Übergaben, Betriebsstundenzähler sowie Service-/Prüfintervalle nach Datum und/oder Nutzung. Fahrzeuge und Geräte teilen Stammbasis/Fristendienst, nicht jede fachliche Sonderregel.

Nächster Termin nach konkreter Regel: kalendarisch und/oder nach bestätigtem Zählerstand. Unbekannte Betriebsstunden nicht aus Einsatzplanung schätzen. Ausfall, Reparatur und Ersatzgerät sichtbar, ohne Materialbestand doppelt anzulegen.

**Abnahme:** Umlagerung, Leihe/Übergabe, Zählerkorrektur, Austauschzähler, kombinierter Zeitraum-/Stundentermin und stillgelegtes Gerät. Prüfung und Freigabe nur mit dokumentiertem tatsächlichem Abschluss.

### U01 — anpassbare Startseite

Bestehende erlaubte Kennzahlen/Arbeitslisten als kuratierte Abschnitte konfigurieren: sichtbar, Reihenfolge, zulässige Standardfilter. Feste Lot-Darstellungsbausteine statt beliebiger Kachelgrößen oder eingebettetem HTML. Wichtiges nicht durch eine neue Designwelt ersetzen.

**Rechte:** Konfiguration erteilt keine Datenrechte. Sicherheits-/Synchronisationsfehler bleiben wahrnehmbar, auch wenn ein Nutzer eine fachliche Liste ausblendet. Standard wiederherstellbar; deaktivierte Module/entzogene Rechte machen gespeicherte Einstellungen nicht zu kaputten Links.

**Abnahme:** Rollenwechsel, neue Funktion, kein Inhalt, Tablet/Mobil, lange Namen und Reset. Dieselbe Anzahl muss aus derselben vollständigen Abfrage stammen, nicht aus der Zahl gerade geladener Zeilen.

### U02 — Menüfolge und Favoriten

**Produktreview: ändern.** Favoriten und persönliche Priorisierung behalten; kanonische Gruppen, Begriffe und mobile Grundnavigation stabil lassen. Eine völlig freie Grundsortierung ist nicht empfohlen.

Präferenzen pro Benutzer, optional erlaubte betriebliche Vorgabe. Favoriten referenzieren stabile Routenschlüssel, keine freien fremden URLs. Gruppen und Rechtefilter bleiben, Änderungen werden vor Anzeige validiert.

**UI:** Innerhalb der ruhigen Navigation sortieren, Favoriten erreichbar machen; mobile vier Hauptziele nur im erlaubten Konfigurationsrahmen ändern und „Mehr“/Rückweg erhalten. Keine Einschränkung der fachlichen Datenmenge durch die Anzahl sichtbarer Slots.

**Abnahme:** Favorit auf Akte ohne Zugriff, Modul aus, Route geändert, Rechteentzug und mehrere Geräte. Persönliche Reihenfolge verändert keine Freigabe oder globale Benutzerrolle.

### U03 — automatischer Wochenbericht

Periodischer Bericht aus festen definierten Abfragen: Zeitraum, Datenstand, Kennzahlendefinitionen, Vergleichsbasis und Quellenlinks. Keine frei generierten Handlungsaussagen. Fehlende Daten oder fehlgeschlagene Teilabfrage als unvollständig kennzeichnen, nicht als null.

Betrieb wählt Inhalt, erlaubte Empfänger, Woche/Zeitzone und Bereitstellungsart. Beim Erzeugen und beim Versand Rechte erneut prüfen; getrennte Empfänger erhalten nur ihr zulässiges Profil. Versand über R12 bzw. geschützter In-App-Bericht, idempotent pro Periode/Revision/Empfänger.

**Abnahme:** Feiertagswoche, Jahreswechsel, Datenkorrektur, mehr als eine Abfrageseite, geänderter Empfänger und Jobwiederholung. Keine verdeckte personenbezogene Leistungsrangliste.

### U04 — detailliertes Änderungsprotokoll

Kern K06 früh in die Schreibverträge integrieren. Fachlicher Verlauf mit Akteur, Serverzeit, Grund und erlaubten Alt-/Neuwerten. Neue Module nutzen dieselbe Ereignis-/Objektzuordnung; vorhandene Lager-, Wartungs- und Supportverläufe bleiben erhalten.

**Abnahme:** Zeitkorrektur bis zum Saldo zurückverfolgen, Rollenänderung ohne unerlaubtes Recht, protokollierte Dienstaktion und Korrektur eines Belegs. Journal nicht clientseitig manipulierbar; Personal-/Finanzzugriff getrennt.

### U05 — ausgewählte Ansichten und Versand protokollieren

Nur ausdrücklich ausgewählte sensible Objekttypen serverseitig durch einen schmalen protokollierenden Lese-/Downloadweg führen. Falls ein Nachweis zwingend ist, darf ein direkter alternativer API-Zugriff ihn nicht umgehen. Eine reine Frontendmeldung „geöffnet“ reicht nicht.

Ereignisse genau benennen: Daten autorisiert bereitgestellt, Downloadlink ausgestellt, Versand vom Anbieter angenommen, Bounce erhalten. Daraus nicht ableiten, der Empfänger habe gelesen, verstanden oder rechtswirksam zugestimmt.

**Abnahme:** Direkter API-Abruf, verweigerter Zugriff, fehlgeschlagenes Protokoll, unterbrochener Download, Preview-Bot und Mailprogramm-Link. Keine allgemeine verdeckte Klicküberwachung; Zweck, Rechte und Aufbewahrung pro Ereignisklasse.

### U06 — Papierkorb für zulässige Entwürfe

Soft-Delete nur für ausdrücklich wiederherstellbare Datenklassen, etwa ungebundene Aufgaben- oder Angebotsentwürfe. Ausgestellte Rechnungen, unterschriebene Scheine, angenommene Vertragsfassungen und wirksam endgültig gelöschte personenbezogene Daten niemals darüber rückgängig machen.

Papierkorb speichert Löschzeit, Berechtigten/Grund und zulässige Wiederherstellungsfrist nach Datenzweck. Wiederherstellen prüft aktuelle Rechte, Referenzen, Nummern-/Positionskonflikte und archivierte Eltern; kein blindes Einschalten eines ganzen Objektbaums. Physische Dateilöschung erst nach Referenzprüfung.

**Abnahme:** Elternobjekt entfernt, zwischenzeitlich gleichnamiger Entwurf, Freigabe inzwischen erfolgt, endgültige Löschung und Rücklauf aus Sicherung. Löschmanifest verhindert unbemerkte Wiederbelebung endgültig gelöschter Daten.

### G01 — offene Regie und gültige Scheine finden

Kern K07 als einzige Abrechnungsquellenliste. Geeignete tatsächlich freigegebene Stunden, gültige Scheine und Materialleistungen ohne wirksamen Rechnungsverbrauch zeigen. Ein Schein kann Quelle sein, ist aber keine neue pauschale Pflicht aller bestehenden Abrechnungswege.

**Abnahme:** Teilverrechnung, Rückstellung, Entwurfsreservierung, Storno, korrigierte Quelle und zwei Bearbeiter. Eine Stornorechnung selbst wird nie als neue positive Leistung vorgeschlagen.

### G02 — Rechnungsvorschau vorbereiten

Gültige Abrechnungsbasis nach Regie, Pauschal, Einheitspreis und Wartung bestimmen; bestehende Zusammenstellung wiederverwenden. Freigegebene Mengen, manuell bestätigte Preise, gültige Kalkulationsregeln und Herkunft anzeigen.

Fehlender erforderlicher Verkaufspreis blockiert die entsprechende Ausgabe bis zur Klärung. Explizit bestätigte Gratisposition ist nicht dasselbe wie unbekannter Preis; fehlender EK verhindert nicht automatisch eine zulässige Rechnung mit bekanntem VK.

**Abnahme:** Kein Schein bei zulässigem Bestandsweg, Preis null mit Gratisgrund, fehlender Preis, Leistungszeitraum, gemischte Quellen, Vorschau erneut geöffnet und abschließende Freigabe. Keine automatisch ausgestellte/versendete Rechnung.

### G03 — Fehlbestandsvorschlag

Derselbe Dienst wie E14/K02. Für konkreten Termin Bedarf und einmalig zugeteilte physische/erwartete Mengen verwenden; Mindestbestand und Baustellenbedarf nicht unbesehen doppelt addieren.

**Abnahme:** Eigen-/Fremdreservierung, bereits offene Bestellung, bestätigte verspätete Lieferung, unbekannter Bestand und Packungsrundung. Ein Vorschlag allein verändert weder Bestellstatus noch Regalbestand.

### G04 — Mehrmengenhinweis bei Schlussrechnung

Zwei unterschiedliche Differenzen zeigen: freigegebene Istmenge minus vereinbarte/kalkulierte Menge = mögliche Mengenabweichung; noch abrechenbare gültige Menge minus bereits wirksam zugeordnete Menge = möglicher Rest. Bereits verrechnete Mengen nicht nochmals von einer schon bereinigten Istmenge abziehen.

Einheit, Artikel-/Leistungsidentität, Vertrag und freigegebene Nachträge verknüpfen. Überschreitung ist ein Prüfanlass, kein automatischer rechtlicher Anspruch.

**Abnahme:** Einheits-/Pauschalauftrag, abgelehnter Nachtrag, Rückbau/Retoure, Teilrechnungen und geänderte Angebotsfassung. Nachtragsfreigabe bzw. bestehende zulässige Korrektur bewusst durchführen, nicht durch Warnungsbestätigung erfinden.

### G05 — Budgetwarnung

Budget mit Datum, Bezug, Währung und Fassung; Istkosten und gegebenenfalls verifizierte Prognose separat vergleichen. Frei konfigurierbare Warnschwellen und Zuständigkeit. Budget null ausdrücklich behandeln, keine Division durch null; unbekanntes Budget nicht als null interpretieren.

**Abnahme:** Fehlende Kostenbasis, mehrere Kostenarten, einmalige Schwellüberschreitung, neues Budget und Storno einer Kostenposition. Keine automatische Kundennachricht und keine Behauptung über unbekannten Restaufwand.

### G06 — Preisänderungsregel

E04/E05 und A08 verwenden denselben Vergleich aus Artikelidentität, Preisbasis, Einheit und zwei bestätigten Versionen. Formel nur für dieselbe normalisierte Basis: neuer Preis minus bisheriger Preis; relativer Unterschied nur bei sinnvoller nichtnulliger Basis.

**Abnahme:** Wechsel von Preiseinheit oder Währung erzeugt keine falsche Prozentwarnung. Alter Import nach neuerem Preisstand und manuell festgesetzter VK bleiben korrekt. Keine Änderung versendeter Angebote.

### G07 — Skonto-/Fälligkeits-Erinnerung

Aus tatsächlichem Belegdatum, dokumentiertem Zahlungsziel, Skontofrist/-basis, offenen Zahlungen und bestehender Betriebsregel Fristen berechnen. Eingang und Ausgang getrennt: eigenes Skonto nutzen vs. gewährtes Skonto berücksichtigen. Zahlungsausgleich/Fristkorrektur macht veraltete Hinweise ungültig.

**Abnahme:** Teilzahlung, Skonto schon gezogen, Datum korrigiert, Wochenende nach tatsächlicher Regel, Erinnerung doppelt fällig und Empfängerwechsel. Kein automatischer Zahlungsauftrag und keine ungeprüfte Mahnung.

### G08 — Bankzuordnung

R04/R05 als einzige Bank-/Zahlungslogik. Eindeutigkeit aus Referenz, Währung, offenem Rest und tatsächlichem Umsatz; ausdrückliche Bestätigung löst vorhandene Zahlungsfunktion aus. Manuelle Split-/Sammelzuordnung vollständig möglich.

**Abnahme:** Mehrdeutiger Treffer, Sammelzahlung, Skonto, Doppelimport und bereits manuell erfasster Eingang. Keine doppelte Forderungsreduktion.

### G09 — Rechnungsduplikatregel

R08 wiederverwenden. Sicherer technischer Wiederholungsfall und möglicher fachlicher Dublettenfall sind unterschiedliche Ergebnisse. Belegart und tatsächlichen Aussteller beachten.

**Abnahme:** Gleicher Lieferant/Betrag mit anderer Nummer, fremder Lieferant, Zweitschrift, Storno/Gutschrift und korrigierte Datei. Manuelle Klärung protokollieren, nichts automatisch löschen.

### G10 — Konflikte und Ersatzkräfte

B06–B08 und Z05 verwenden denselben Regelkern. Intervalle, Pausen-/Wege-/Rüstbedingungen und bekannte Abwesenheit berücksichtigen; unbekannte Qualifikation oder Kapazität offen zeigen.

**Abnahme:** Aneinandergrenzende Intervalle, Einsatz über Mitternacht, Abwesenheit zwischen Vorschlag und Speichern, Ersatzperson bestätigt und Vorschlag abgelehnt. Weder Person bewerten noch automatisch zuweisen.

### G11 — nächste Wartung

Bestehende Intervall-/Fälligkeitslogik auf bestätigte Ausführung, individuelle Vertrags-/Anlagenregel und gültige Zeitzone/Datum stützen. Monatsende nach bestehender fachlicher Regel behandeln, nicht durch unkontrolliertes Addieren von 30 Tagen.

**Abnahme:** 31. Januar plus Monat, Schaltjahr, fehlender Ausführungstag, mehrere Prüfarten, vorzeitig bestätigte Wartung, abweichender geplanter Termin und gekündigte Vereinbarung. Teilweise Checkliste, bloße Terminplanung oder PDF-Erstellung erzeugt keine bestätigte neue Fälligkeit.

---



## 7. Querschnittsverträge für die hinzugekommenen Arbeitsgebiete

### 7.1 Zeit: Anwesenheit ist nicht Auftragszeit

Führe drei Begriffe auseinander: laufende Erfassungssitzung, daraus bestätigte Arbeitszeit und tatsächlich zur Baustelle/Abrechnung zugeordnete Zeit. Zuschläge und Zulagen sind Eigenschaften mit Regelbezug, keine zusätzliche Arbeitsdauer.

Ein Auftragswechsel innerhalb der Schicht darf die Anwesenheit nicht neu starten oder verdoppeln. Fahrt, Werkstatt, Pause, Bereitschaft und noch nicht zugeordnete Arbeit bleiben ausdrückliche Fälle. Eine automatisch gestoppte Sitzung oder ein Korrekturantrag darf bestehende Überstunden- und Jugendschutzprüfungen nicht umgehen.

### 7.2 Material: fünf unterschiedliche Beweggründe

Beschaffung, Lieferung, Lagertransfer, Verbrauch und Verrechnung sind getrennte Vorgänge. Rüstliste, Anforderung, Lieferschein und Rechnung können **dieselbe** Materialherkunft referenzieren. Ein kundenfähiges Dokument ist nicht automatisch eine zweite physische Ausgabe.

Beim Lagerortausbau bleibt das bestehende stock-Feld als aus demselben Buchungsweg gepflegte Kompatibilitätsprojektion des bisherigen Standardlagers erhalten, solange alte Clients diesen Begriff erwarten. Gesamtbestand über alle Orte ist ein gesondert benanntes Aggregat. Nicht stillschweigend Fahrzeugbestand in „frei im Hauptlager“ umdeuten.

Alte eingeladene Mengen sind kein Beweis für heute noch vorhandenes Fahrzeugmaterial. Eröffnungsbestände weiterer Orte durch bestätigte Zählung mit Datum/Grund anlegen; bestehende Ausgaben und historischen Rechnungen nicht rückwirkend zu einem erfundenen Restbestand umschreiben.

### 7.3 Gemeinsamer Dokument- und Freigabekern

Besichtigung, Aufmaß, Handwerksschein, Wartungsprüfung, Bautagesbericht, Arbeitsbericht, Abnahme und Lieferschein teilen Vorlagenversion, Dateiablage, Status, Ausgabe und Signaturbezug. Ihre fachlichen Pflichtfelder und Wirkungen bleiben jedoch getrennt.

Eine Signatur bestätigt eine konkret sichtbare Fassung samt Anlagenverzeichnis. Dokumentinhalt nach Signatur nicht austauschen. Zusätzliche externe Anhänge dürfen vertrauliche interne Details nicht ungeprüft an Kunden freigeben.

Dateiklassen mit zweckbezogenen Regeln: Projektpläne, Berichtsfotos, Gesundheitsnachweise, Bankdateien und Chat-Anhänge nicht über dieselbe pauschale Uploadfreigabe behandeln. Die heutige 25-MB-Grenze bei Projektdokumenten ist im Ausbau zu prüfen: konfigurierte Storage-Grenze, erlaubte Typen und bei Bedarf fortsetzbarer Upload statt beliebiger Client-Sperre. Sicherheitsprüfung bleibt auch bei größeren Dateien erhalten.

### 7.4 Nachrichten, externe Dokumente und Versand

Drei getrennte Integrationen:

1. Chat: berechtigte interne Kommunikation mit tatsächlichem Server-/Anhangstatus.
2. SharePoint: autorisierte Referenz oder ausdrücklich importierter Snapshot.
3. Externer Versand: freigegebener Empfänger und eine feste Dokumentfassung mit Providerstatus.

Ein Chatlink oder eine SharePoint-URL ist kein archivierter Beleg. Eine Bestätigung des Mailservers ist keine Angebotsannahme. Ein ungelesener Zähler ist keine rechtliche Zustellbestätigung. Rückläufe aus Sicherungen und Jobwiederholungen dürfen keine Nachrichten oder Mahnungen erneut auslösen.

### 7.5 Erweiterte Tabellenfamilien

Zusätzlich zu Abschnitt 2.3 werden benötigt, soweit nicht bereits vorhanden:

| Familie | Konkreter Inhalt |
|---|---|
| Zeitvorgänge | laufende Sitzungen, Segmente, Pausen, Korrekturanträge, automatische Endregeln, versionierte Zeitmodelle und Zulagenmerkmale |
| Lieferung/Aufmaß | Kundenlieferscheine/-positionen, Quelle-/Bewegungszuordnung, Teilmengen/Retouren, Aufmaßblätter und freigegebene Mengen |
| Kommunikation | Kanäle, Teilnehmer-/Zugriffskontext, Nachrichten, Anhänge, persönliche Ungelesenstände, autorisierte Zustellereignisse |
| Dokumentintegration | externe Quelle, Microsoft-Tenant/Site, Drive-/Item-ID, Version, Sync-/Importstatus; Secrets getrennt |
| Versand | Absenderprofil, freigegebener Versandauftrag, Dokumentfassung, Providerreferenz und Statusereignisse |
| Betriebsmittel | Fahrzeug/Gerät, verantwortliche Person, Ort, Übergabe, Zähler-/Kilometerstand, Fahrt und Wartungs-/Versicherungsfrist |
| Regeln/Präferenzen | Preisregel, Modellfassung, Import-/Exportprofil, Berichtsabonnement, Dashboard-/Navigationspräferenz und Entwurfslöschstatus |

Keine isolierte neue Tabelle für jede Oberflächenkarte. Vorhandene Beziehungen wiederverwenden; Ereignisse und Positionsbezüge nicht in unprüfbare große JSON-Felder auslagern, wenn Mengen-/Geldregeln darüber laufen.

---

## 8. Vollständiger Implementierungsfahrplan nach Abhängigkeiten

### 8.1 Vorbereitungsarbeit M00

Vor dem ersten Codepaket aktuelle Version neu abgleichen und folgende Artefakte erstellen:

- **Bestandsmatrix:** Original-ID → tatsächlicher Bestand → neue Ergänzung → maßgebliche Code-/SQL-Stelle → erlaubte Rollen.
- **Aktionsinventar:** vorhandene Felder, Buttons, Filter, Tabs, Hilfe, Exporte, Deep Links und Sonderfälle der betroffenen Ansichten.
- **Datenverträge:** Beziehungen, Zustandswechsel, invarianten Zahlen und Herkunft; Schemaentwurf und Migrationsverfahren.
- **Abnahmematrix:** jede Original-ID mit positiven, negativen und erhaltenden Gegenproben.
- **UI-Ansichten:** repräsentativer echter Screen für Mobil und Desktop je neuem Muster; Wochenplan, Mitarbeiterübersicht, Akten und Menü an vorhandener Lot-Linie ausrichten.
- **Nachweisregister:** konkrete externe Testdatei/Normfassung/Bank-/Kanzleiprofil bzw. Providerkonfiguration. Fehlendes gezielt benennen; keine pauschale zusätzliche Geschäftsorganisationsphase.

M00 ist die Arbeitsvorbereitung des Softwareausbaus, kein neuer fachlicher Funktionskatalog.

### 8.2 Paketfolge

Diese Tabelle ordnet sämtliche Original-IDs technisch zu. Der bestätigte Empfehlungsstand kann einzelne Inhalte ersetzen oder begrenzen; die ursprüngliche ID bleibt dann mit dieser Entscheidung in der Abdeckung, statt unbemerkt zu verschwinden.

Jedes Paket enthält mehrere kleine fachliche PRs; die Tabellenzeile ist **kein** Auftrag für einen riesigen Sammel-PR. Ein PR liefert einen prüfbaren vollständigen Ablauf oder einen intern abgeschlossenen technischen Unterbau ohne sichtbare halbfertige Funktion.

| Paket | Vollständiges Ergebnis | Original-IDs | Technische Voraussetzung |
|---|---|---|---|
| M01 | sichere Fachbefehle, Objekt-/Dokumentverträge, Journal, ausgewählte Zugriffsnachweise und Entwurfspapierkorb | U04, U05, U06 | M00; tatsächliche bestehende Sicherheits-/Belegregeln |
| M02 | Auftragseingang, Kundenobjekte, strukturierte Aufträge und versionierte Online-Angebotsannahme | A03, A09, A11, A06 | M01; vorhandene Kunden-/Angebots-/Baustellenlogik |
| M03 | parallele Kataloge, aktive Versionen, Regeln, sichere Preisvergleiche und Angebotskalkulation | E01, E04, E05, E06, E07, E02, E03, A07, A08, G06 | M01; DATANORM-Bestand, Identitäten und Preis-/Einheitenvertrag |
| M04 | Lagerorte, Scan/Inventur, Materialdeckung, Beschaffungsvorschlag und Restmaterial | E10, E11, E12, E13, E14, E16, G03 | M01/M03; gemeinsam geklärte Reservierungs-/Bewegungsquellen |
| M05 | Lieferantenanfrage/-angebote sowie Kundenlieferung mit Teilmengen und korrekter Bewegung | E08, E09, R01, R02, R03 | M04; versionierte Einkaufs-/Lieferpositionen |
| M06 | vollständiger Start/Stopp-, Korrektur-, Zeitmodell- und Zulagenablauf | Z01, Z02, Z03, B02, Z04 | M01; aktuelle Zeit-/Saldo-/Abwesenheitslogik |
| M07 | Qualifikation, Aufgaben, Arbeitsvorbereitung und visuelle operative Planung | Z05, B05, B06, B07, B08, B04, G10, A01, A02, A04 | M02/M04/M06; Verfügbarkeit und Rechte |
| M08 | Besichtigung, strukturiertes LV und freigegebenes Aufmaß zur Kalkulation/Abrechnung | B03, A05, R10 | M02/M03/M07; Dokumentfassung und Norm-/Einheitenprofile |
| M09 | Anlagenprüfung und Bericht, Wartungsannahme/-abrechnung sowie Fahrzeug-/Gerätefristen und Fahrtenbuch | W01, W02, W03, W04, W05, W06, W07, W08, G11 | M02/M04/M07; gleiche Fahrzeugkennung wie im Lagerortmodell |
| M10 | integrierter Monteur-Arbeitstag, Kommunikation, Berichte, Mängel, Abnahme und externe Dokumente | B01, B09, B10, B11, B12, B13, B15 | M02/M04/M06–M09; vorhandene Dokument-/Pushwege |
| M11 | Eingangsfakturen mit Kontierung, Dublettenklärung und gemeinsamem Dreiwege-Abgleich | R06, R07, R08, R09, E15, G09 | M03–M05; Kanzlei-/Steuerprofil und tatsächlicher Wareneingang |
| M12 | Bankdatei, manuelle/regelbasierte Zuordnung und richtige Fristerinnerung | R04, R05, G08, G07 | M11 soweit Eingangsbelege betroffen; bestehende Zahlung-/Skontologik |
| M13 | vollständige Quellen-/Restabrechnung, Sammelrechnung, Budget/Mehrmengen, Prognose und Berichtspaket | G01, G02, G04, G05, A10, B14, R11 | M02–M12, je betroffenem Quellenweg |
| M14 | echter dokumentierter Außenversand und automatischer faktenbasierter Wochenbericht | R12, U03 | M01/M11–M13; konfigurierter Versandadapter |
| M15 | ruhige persönliche Startseite, Menüfolge und Favoriten auf vollständigem Funktionsbestand | U01, U02 | bestehende Rechte und Routen aller aktivierten Bereiche |
| M16 | gemeinsamer End-to-End-Nachweis, Migration, kontrollierte technische Freigabe und Dokumentation | alle 84 Punkte als Gesamtabnahme | alle jeweils benötigten Pakete |

**Wichtige Ergänzungen zur Reihenfolge:**

- Der technische Quellen-/Rechnungsvertrag wird schon M01 festgelegt und bei neuen Quellen konsequent verwendet. M13 baut die vollständige zusammengeführte Arbeitssicht; es repariert nicht erst nachträglich neun parallel entstandene Abrechnungswege.
- M04/M05 vervollständigen auch die fachlich benötigten Bestellköpfe/-positionen, Bedarfszuordnungen und tatsächlichen Wareneingänge. Diese sind keine zusätzliche beliebige Wunschfunktion, sondern Voraussetzung für R07/E15.
- Fahrzeugidentität ist ein gemeinsamer Schlüssel von Lagerort und Betriebsmittel. M09 ergänzt Fristen/Fahrtenbuch, legt kein zweites Fahrzeug an.
- E09 kann vorher bereits die vollständige Vorbereitung und den ehrlichen bisherigen Mailprogrammweg bieten. Direkter Versand wird erst nach M14 als solcher angeboten.
- W04 benutzt bereits die vorhandene Rechnungsvorschau; später erscheint dieselbe Quelle zusätzlich in der umfassenden Arbeitsliste M13.
- Unabhängige Pakete können nach stabilen Datenverträgen parallel bearbeitet werden, aber nur mit ausdrücklicher Koordination. Niemand implementiert dieselben SQL-Funktionen oder Typen in zwei konkurrierenden Branches.
- Keine festen Fantasietermine. Aufwand je PR nach Bestandsprüfung, Schnittstellenverfügbarkeit und notwendigen Gegenproben schätzen; Puffer für Migrationen und Geräteprobleme sichtbar machen.

### 8.3 Abhängigkeitsbild

~~~mermaid
flowchart TD
  M00[Bestand und Verträge] --> M01[Sichere gemeinsame Grundlagen]
  M01 --> M02[Aufträge, Objekte, Annahme]
  M01 --> M03[Kataloge und Preise]
  M01 --> M06[Zeit und Modelle]
  M03 --> M04[Lager und Deckung]
  M04 --> M05[Einkauf und Lieferscheine]
  M02 --> M07[Aufgaben und Planung]
  M04 --> M07
  M06 --> M07
  M07 --> M08[Besichtigung, LV, Aufmaß]
  M07 --> M09[Prüfung und Betriebsmittel]
  M08 --> M10[Monteur, Berichte, Kommunikation]
  M09 --> M10
  M05 --> M11[Eingangsbelege]
  M11 --> M12[Bankabgleich]
  M10 --> M13[Abrechnung und Prognosen]
  M12 --> M13
  M13 --> M14[Versand und Wochenbericht]
  M14 --> M15[Persönliche Einstiege]
  M15 --> M16[Gesamtabnahme]
~~~

Das Bild zeigt die Hauptkette, nicht jede einzelne feingranulare Querverbindung. Die Paket-/Featureverträge bleiben maßgeblich.

---

## 9. Migration und Einführung ohne Funktionsverlust

### 9.1 Vorgehensweise je Datenänderung

1. **Expand:** additive Tabellen, nullable Bezüge, Indizes und abgesicherte Funktionen; alte Anwendung bleibt kompatibel.
2. **Backfill vorbereiten:** Altbestand trocken analysieren, verwaiste/mehrdeutige Referenzen reporten. Keine Produktion „bereinigen“, nur weil das neue Modell strengere Struktur erwartet.
3. **Additive Zuordnung:** neue Referenz-/Ausgangsdatensätze anlegen, ohne ausgestellte Belege, unterschriebene Inhalte oder bestehende Zeitbuchungen umzuschreiben. Unbekannte Werte bleiben ungeklärt.
4. **Prüfen:** Anzahlen, Summen, Mengen, Salden, Dokumenthashes und Rechte zwischen altem und neuem Lesepfad vergleichen.
5. **Cutover:** genau ein autoritativer Schreibweg; alte RPCs falls nötig auf denselben validierenden Kern führen. Keine unabhängigen Dual Writes aus dem Browser.
6. **Beobachten:** Fehler, Konflikte, Journal, Last und Queuealter messen. Neue Funktion pro Betrieb bewusst aktivieren; bestehende Standardmodule nicht verschwinden lassen.
7. **Contract:** alte Implementierung erst entfernen, wenn alle unterstützten Clients und offenen Vormerkungen migriert sind und ein Rollbackpfad existiert.

Kein pauschales Update historischer Produktionsdaten. Notwendige gesetzlich/fachlich berechtigte Korrekturen sind normale ausdrücklich autorisierte Fachvorgänge, nicht Nebenprodukt des Umbaus.

### 9.2 Alte PWA-Versionen und mehrere Geräte

DB-/API-Kompatibilität ausdrücklich testen. Ein alter Client darf keine neue Reservierungs-, Signatur- oder Verbrauchsprüfung umgehen. Falls ein inkompatibler alter Schreibweg nicht sicher weitergeführt werden kann, gezielte verständliche Aktualisierung über vorhandene App-Erneuerung verlangen; vorher lokale Entwürfe/ausstehende Übertragungen sichern und kontrolliert migrieren.

Offline-Daten tragen Schemaprofil und Benutzer-/Betriebsbezug. Unbekannte ältere Payloads nicht löschen. Erkennbarer Konvertierungs-/Klärweg, keine automatische Übertragung mit falscher Einheit, Person oder neuem Preis.

### 9.3 Rücknahme eines Releases

Feature ausschalten ist kein vollständiger Datenrollback. Neue Dokumente/Bewegungen bleiben rechtlich und fachlich bestehen. Bei Rücknahme kompatible lesende Oberfläche plus bisherige sichere Fachaktionen erhalten; neue Daten nicht per Down-Migration löschen.

Vor produktiver Datenmigration getrennte Wiederherstellung mit Dateien prüfen. Nach Restore ausstehende externe Versand-/Push-/Importaktionen zunächst abgleichen/quarantänisieren: Eine außerhalb der Sicherung bereits versendete Mahnung darf nicht aufgrund eines älteren Queuezustands erneut hinausgehen.

### 9.4 Einstellungen und Module

- Neue Fachbereiche mit konservativer Voreinstellung und verständlicher Aktivierung je Betrieb.
- Vorhandene Einstellungen und Rollen als Migrationsdefault, keine plötzlich leeren Kalender oder versteckten Pflichtabläufe.
- Deaktivierung benötigt Folgenvorschau: offene Aufgaben, Reservierungen, Timer, Fristen, Verträge und Entwürfe.
- Historische Dokumente, notwendige Datenzugriffe und Exporte nach berechtigter Regel weiterhin erreichbar.
- Softwaremodule sind keine Lizenz-/Tarifplanung. In diesem Fahrplan werden keine neuen Senklot-Preise oder Nutzerpakete festgelegt.

---

## 10. Skalierung, Datenqualität und Ressourcen

### 10.1 Keine stillen Grenzen

Alle Listen mit vollständiger Erreichbarkeit: serverseitige Suche, stabile Sortierung und Cursor-/Keyset-Pagination; deterministische Tie-Breaker wie ID. Aggregate über den ganzen autorisierten Filterbestand in SQL, nicht über gerade geladene Seiten. CSV-/PDF-Exporte dürfen nicht unbemerkt nur 100 oder 1.000 Zeilen enthalten.

Bestehende Grenzstellen gezielt prüfen: Lieferantenlisten mit festen Zahlen, PostgREST-Antwortgrenze, DATANORM-Blockgröße, Verlaufslimits, Dateiobergrenzen. Eine Blockgröße ist okay, wenn alle Blöcke korrekt fortsetzbar verarbeitet werden. Ein Endlimit ohne „Weitere“/Export ist kein vollständiger Ablauf.

### 10.2 Große Importe und Dateien

Persistente Jobs mit Fortschritt, Checkpoints, Abbruchstatus, Wiederholung und verständlichem Fehlerbericht. Validieren außerhalb der Aktivierung, danach konsistent umschalten. SQL mengenorientiert optimieren, Indizes anhand realer Pläne; keine leeren Performanceversprechen.

Mandantenjobs fair einplanen und Last begrenzen, ohne Kundendaten abzuschneiden. Uploads und Parser nach Profil begrenzen; größere legitime Dateien über konfigurierten Upload-/Streaming-/Jobweg behandeln. Ressourcenlimits und Fremdsystemquoten mit nachvollziehbarer Erweiterungsmöglichkeit dokumentieren.

### 10.3 Messplan

Vorher/nachher mit denselben Fixtures und Netz-/Geräteprofilen messen:

- Katalog mit realer Lieferantenstruktur und zusätzlich mindestens einer deutlich größeren synthetischen Menge;
- viele Jahre Buchungen, Bewegungen und Anhänge;
- zwei Mandanten, konkurrierende Reservierungen/Abrechnung und mehrere gleichzeitige Importe;
- schwaches Mobilgerät, langsames Netz, WebKit und Android;
- Startseite, Suche, Planwechsel, Scan, Formulare und Dokumentausgabe;
- Serverabfragezeit, Roundtrips, Speicher, Queuealter, Renderzeit und Zeit bis verständlicher Rückmeldung.

Planungsziele nach Baseline vereinbaren, nicht als schon gemessene Produktleistung ausgeben. Ein Klick soll sofort sichtbar reagieren; eine bestätigte Geld-/Bestandsbuchung darf erst nach tatsächlicher Serverbestätigung „erledigt“ heißen.

---

## 11. Verbindliche Prüfungen und Abnahme

### 11.1 Testebenen

- Reine Funktionstests für Regeln, Einheiten, Rundung, Fristen und Zustandsübergänge.
- Komponenten-/Browserprüfungen für vollständige Bedienwege, Tastatur, Touch, Fokus, Filter und Fehlererhalt.
- SQL-/Integrationstests gegen echte Postgres-Instanz: RLS, RPCs, Constraints, Konkurrenz und Transaktionsabbruch.
- Auth-/Storage-/Realtime-Tests mit mindestens zwei Betrieben und direkten manipulierten Zugriffen.
- Import-/Export-Roundtrips für jede ausgewiesene Formatversion; Originaldaten, Datenverlust und Duplikate prüfen.
- Tatsächlicher Versand im isolierten Testadapter, Providerfehler/-wiederholung und korrekte Empfänger.
- Reale mobile Geräte für Kamera/Scanner, iOS-Blatt/Tastatur, Offline-Speicher, Wiederverbindung und PWA-Aktualisierung.
- Sicherungs-/Rücklauftest für neue Tabellen, Dateien, Vorlagen, Journal und Jobzustände.
- Gegenproben: Neuer Fehlerfall ist ohne die Änderung rot; korrekte bisherige Abläufe bleiben mit eigenem Test grün.

Keine Anzahl bestandener Tests erfinden. Statische Prüfung, Mocktest, lokale Integration und tatsächlicher Geräte-/Fremdsystemtest als unterschiedliche Evidenz ausweisen.

### 11.2 Durchgängige Abnahmeszenarien

| Szenario | Nachweis |
|---|---|
| Spontaner Service ohne Angebot | A03 → B01/B02 → Material/Schein → G01/G02 → Rechnung/Zahlung; keine neue Angebots- oder Planungspflicht |
| Besichtigung zur Schlussrechnung | B03 → A07/A08 → A06 → Planung → R10 → Teil-/Schlussrechnung, G04 und Dokumentanhang |
| Zwei Baustellen konkurrieren um Material | E10/E13/E14/G03 → Reservierung → Scan → Teilabholung; keine doppelte Verfügbarkeit |
| Lieferung schon geladener Ware | R01–R03 und E16; Beleg korrigieren, Ware tatsächlich zurücknehmen, Bestand/Abrechnung getrennt |
| Lieferantenvergleich und Einkauf | E01–E09 → Bestellung → Teillieferung → R06/R07/E15 → Kontierung; kein falsches „günstigster Gesamtpreis“ |
| Bankimport mit manueller Vorzahlung | R04/R05/G08; bestehende Zahlung berücksichtigen, Rest/Skonto klären, kein doppelter Ausgleich |
| Hausverwaltung und Mieterwechsel | A09/A10/A11; Vertreter und Leistungsempfänger korrekt, historische Dokumente unverändert |
| Wartung mit Abweichung | W01–W05/G11 → Mangel/Aufgabe → Bericht → genau eine passende Abrechnung |
| Timer und Korrekturantrag | B02/Z01–Z04; offline, automatische Endregel, längere tatsächliche Arbeit, nachvollziehbarer Saldo |
| Planung mit Ersatzkraft | Z05/B04–B08/G10; erforderliche Befähigung, Abwesenheit, Material und neuer Serverstand |
| Berichte und Abnahme | B10–B13/R11; tatsächliche Quellen, manuelles Wetter, Vorbehalte, richtige Signaturfassung |
| Chat/SharePoint | B09/B15; Datei-/Projektberechtigung entzogen, Upload-/Providerfehler, Wiederholung |
| Fuhrpark und Gerät | W06–W08; Fahrer-/Ortwechsel, Kilometer-/Zählerkorrektur und dokumentierte Fristerledigung |
| Versand nach zwischenzeitlicher Zahlung | R12/G07/U03/U05; veraltete Nachricht anhalten, tatsächlichen Versandzustand belegen |
| Persönliche Oberfläche | U01/U02; Rollen-/Modulwechsel, Reset, alle Funktionen weiterhin erreichbar |
| Entwurfspapierkorb | U06; Wiederherstellung, Referenzkonflikt, endgültige Löschung und Restore ohne Datenschutz-Rückschritt |
| Mehrbenutzer-/Altclient-Konkurrenz | Jeder kritische Geld-/Mengen-/Freigabevorgang; alte App, mehrere Tabs, Verbindungsabbruch und Statusabfrage |

### 11.3 UI-Abnahme ohne Überladung

Vorher-/Nachher-Matrix aller bestehenden Aktionen; kein verschwundenes Feld oder nur noch unberechtigter Link. Repräsentative Screens für 390/834/1440 px, zusätzlich 320 px, dunkle Darstellung, 200-%-Zoom und lange österreichische Namen/Adressen.

Bestehende problemempfindliche Stellen ausdrücklich nachprüfen: einheitliche Suchfeldkontur, kein Hochspringen bei Filtern, vollständig erreichbare Mitarbeiterangaben, einklappbare fehlende Buchungstage, mobile Blattanimation ohne Schleierblitz und ohne horizontales Feststecken. Neue Funktionen erst sichtbar schalten, wenn ihre tatsächlichen Aktionen fertig sind; keine klickbaren Attrappen.

### 11.4 Paketabschluss

Für jeden PR/Paketabschluss liefern:

1. Welche Original-IDs abgedeckt sind und welcher Ablauf jetzt vollständig funktioniert.
2. Relevanter Daten-/Rechte-/UI-Diff und warum er nötig ist.
3. Erhaltene Funktionen und bestandene Gegenproben.
4. Migration, Altclient-Kompatibilität, Job-/Offline-/Dateifälle und Rücknahme.
5. Tatsächlich ausgeführte Prüfungen mit Ergebnis; offene externe Nachweise separat.
6. Screens/Bedienweg und aktualisiertes Handbuch, Funktionsübersicht und Änderungsstand.
7. Keine unerledigten Platzhalter als „fertig“ und keine manuelle Konsolenpflicht für normale Nutzerfehler.

Bestehende Projektbefehle aus package.json und CLAUDE.md nutzen: Typprüfung, Lint, Unit-/Komponentenprüfungen, lokaler Supabase-Stack und Datenbanktests, Browser-/Link-/CSP-Prüfungen, Build. Namen und vorhandene Tests vor Ausführen prüfen. CI muss vor einem beauftragten Merge grün sein; ein Merge allein ist kein Nachweis einer richtigen produktiven Migration.

---

## 12. Entscheidungsregister statt versteckter Annahmen

Diese Punkte sind vor dem jeweils betroffenen Paket anhand konkreter Daten zu schließen, nicht als pauschale „später“-Liste stehenzulassen:

| Entscheidung | Sinnvolle Ausgangsplanung | Nachweis / Zuständigkeit |
|---|---|---|
| Artikel-/Packungsidentität | bestätigte Hersteller-/GTIN-/manuelle Zuordnung mit Quelle | tatsächliche Lieferantenkataloge und Stammdaten |
| Preise/Kosten | bestehende Rundung, neue regelbasierte Vorschläge nur in Entwürfen | reale Kalkulations-/Belegbeispiele |
| Bestehende Lagerausnahme | dokumentierte Ausnahme erhalten, neue Orte/Buchungen prüfen | aktuelles SQL, Tests und fachlicher Lagerablauf |
| Einkaufs-/Lieferzuordnung | mengen-/positionsbasiert, Teillieferung und Retoure getrennt | tatsächliche Bestell-/Lieferscheinfälle |
| Zeitmodelle/Zulagen | unveränderter Bestand als Default, neue versionierte definierte Modelle | konkrete betriebliche/kollektivvertragliche Regel und Rechenfälle |
| Automatisches Ausstempeln | opt-in, transparent, prüf- und korrigierbar | tatsächlicher Arbeitszeitablauf; keine fingierte Arbeitszeitkürzung |
| Prüfvorlagen/Grenzwerte | verifizierte konkrete Anlagen-/Prüfart | fachlicher Verantwortlicher und verwendete technische Grundlage |
| Norm-/Bank-/XML-Versionen | explizites Adapterregister, keine pauschale Universalunterstützung | autorisierte Spezifikation und reale Austauschdateien |
| Sammelrechnung | tatsächlicher Empfänger und kompatibler Abrechnungskontext | Auftrags-/Vertretungs-/Steuerkonstellation |
| Signaturniveau | eindeutige Fassung und explizite Annahme; Beweisniveau benennen | konkrete Dokument-/Identitätsanforderung |
| SharePoint | referenzbasierter Standard, bewusster Snapshotimport, minimale Rechte | Microsoft-Tenant, Sites, Einwilligung des berechtigten Administrators |
| Außenversand | eigener verifizierter Betriebsabsender und echter Status | autorisiert eingerichteter Provider/SMTP |
| Audit/Chat/Bankaufbewahrung | zweckgebundene Rollen und Löschklassen | tatsächliche Datenzwecke und notwendige Aufbewahrung |
| Hardware/Dateigrößen | Textalternative und skalierbarer Upload, keine verdeckte Kappung | unterstützte Geräte und Hosting-/Storage-Fähigkeiten |

**Regel:** Implementierungsentscheidungen selbst treffen, wenn Bestandsregeln und geprüfte Daten sie tragen. Nur echte fehlende fachliche Angaben gezielt erfragen. Keine Passwörter oder geheimen Schlüssel im Chat verlangen. Bis zur Klärung nicht raten und keine falsche Produktivfreigabe behaupten; alle unabhängigen Arbeiten fortsetzen.

---

## 13. Startanweisung für den späteren Entwicklungsauftrag

Wenn der Auftraggeber ausdrücklich „mit der Umsetzung beginnen“ anweist:

1. Aktuellen main neu lesen und Abweichungen gegenüber 62db192 in der Bestandsmatrix vermerken.
2. Alle Original-IDs A01–G11 gegen die 84-Punkte-Matrix und das Produktreview abgleichen. Vor dem Bau eindeutig klären, ob der Auftraggeber den empfohlenen Zielumfang oder abweichend den vollständigen Originalumfang beauftragt. Keine Aussage des Vergleichsdokuments ungeprüft als tatsächlichen Defekt behandeln.
3. M00 konkret abschließen. Vor neuen UI-Mustern überprüfbare Screens erstellen und vorhandene Designentscheidungen beachten.
4. Mit M01 und den davon freigegebenen Arbeitspaketen beginnen. Pro PR einen vollständigen Fachweg mit Gegenproben liefern.
5. Bereits korrekte Logik verwenden und notwendige neue Fachregeln auf dem Server absichern. Kein paralleler Bestand, kein zweiter Timer-/Lager-/Zahlungs-/Rechnungsweg.
6. Nach jedem Paket Bestandsmatrix, Abnahmetests, Migrationen und Handbuch nachführen; in der tatsächlichen Reihenfolge weiterarbeiten.
7. Bekannte Probleme beheben, ohne neue unnötige Grenzen einzuführen. Eine bloße Fehlermeldung statt eines vollständigen normalen Korrekturwegs reicht nicht.
8. CI und Auslieferung nur im ausdrücklich beauftragten Umfang durchführen. Keine Produktivdaten nebenbei aufräumen, keine externen Nachrichten als Test ungefragt verschicken.
9. Erst „vollständig integriert“ berichten, wenn der bestätigte Zielumfang funktioniert und alle 84 Original-IDs nachvollziehbar als umgesetzt, integriert, vollständig optional, ausdrücklich ersetzt oder bewusst nicht beauftragt eingeordnet sind. Die passenden End-to-End-, Rechte-, Migrations- und Geräte-/Schnittstellenbelege müssen für den tatsächlichen Zielumfang vorliegen. Fehlende externe Nachweise konkret kennzeichnen.

**Gewünschtes Endergebnis:** Senklot hat einen einheitlichen Daten- und Aktionszusammenhang vom Auftrag über Planung, Zeit, Material, Dokumentation, Einkauf und Prüfung bis zur Abrechnung und Zahlung. Zusätzliche Möglichkeiten erscheinen dort, wo sie gebraucht werden. Die Lot-Oberfläche bleibt ruhig; Fachlichkeit wird nicht zugunsten der Optik weggelassen.


