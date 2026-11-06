# Senklot — kritische Produktbewertung des SHK-Funktionskatalogs

**Stand:** 5. November 2026  
**Grundlage:** die korrigierte Datei „Senklot vs. APVROS – funktionale Unterschiede innerhalb der App“, Original-IDs A01–G11.  
**Bestandsbezug:** main-Commit 62db192087ed05e5df1405b1e1ab8c9618e63864; statischer Codeabgleich, keine erneute produktive Vollprüfung.  
**Status:** Empfehlung zur Produktentscheidung. Es wurde nichts aus der App entfernt und keine Funktion implementiert.

## 1. Meine Einschätzung

Der Katalog enthält viele passende Funktionen. Ich würde ihn aber nicht als Liste von 84 unabhängig zu bauenden Features übernehmen. Er vermischt vollständige Geschäftsabläufe, einzelne Bedienaktionen, Ausgabeschritte, Datenqualitätsregeln und elf regelbasierte Ableitungen. Teilweise beschreibt er dieselbe Fähigkeit mehrfach.

**Die richtige Zielsetzung ist ein kleiner Satz zusammenhängender Arbeitsabläufe mit vollständiger Fachlichkeit.** Weniger eigenständige Oberflächen bedeutet nicht weniger Funktionsumfang. Ein gemeinsamer Abgleich, den Rechnung und Wareneingang öffnen, ist besser integriert als zwei ähnliche Prüfansichten mit getrennten Zahlen.

Entwicklungsaufwand ist hier kein Entscheidungskriterium. Eine aufwendige Funktion wie ÖNORM kann für einen ausschreibenden Betrieb zwingend richtig sein. Eine einfache automatische Endzeit kann dagegen fachlich falsch sein.

### Was ich tatsächlich streichen oder ersetzen würde

1. **Z04: automatische arbeitszeitwirksame Endbuchung allein nach einer Zeitregel ersetzen.** Eine Regel kann einen vergessenen Timer erkennen, nicht das tatsächliche Arbeitsende. Spätere Korrekturmöglichkeiten heilen eine zunächst falsche Tatsachenbuchung nicht. Ersatz: Erinnerung, erklärter Abschlussvorschlag, ausdrückliche Bestätigung oder bewusst weiterlaufender Timer. Das verhindert vergessene Buchungen, ohne geleistete Arbeit zu kürzen.
2. **B09: einen allgemeinen freien Direktnachrichten-Messenger nicht in den empfohlenen Standardumfang aufnehmen.** Behalten würde ich Kommunikation am Auftrag, an der Aufgabe oder am Mangel, mit Erwähnungen und gezielter Benachrichtigung. Die Begründung ist nicht Bauaufwand: operative Entscheidungen sollen im richtigen Kontext auffindbar und in Verantwortlichkeit überführbar sein. Freie DMs würden einen neuen unsortierten Entscheidungsort schaffen. Falls ausdrücklich ein allgemeiner Unternehmensmessenger gewünscht ist, ist das eine zusätzliche klare Produktentscheidung, kein automatisch notwendiger Teil der Baustellenorganisation.
3. **U05: allgemeine Seitenaufruf- und Nutzungsverfolgung weglassen.** Die Vorlage verlangt bereits nur ausgewählte Ansichten; sie ist also nicht als Auftrag für ein Überwachungslog zu lesen. Behalten: tatsächliche Versandereignisse und ausdrücklich begründete sensible Zugriffe. Nicht bauen: eine generelle Liste, wer wann welche Seite oder Kennzahl angesehen hat.
4. **U02: frei umstellbare gesamte Grundnavigation reduzieren.** Favoriten und persönliche Schnellzugriffe helfen. Kanonische Gruppen, Bezeichnungen und der bekannte mobile Aufbau sollten trotzdem stabil bleiben, damit Hilfe, Vertretung und Einweisung funktionieren.

**Nicht streichen würde ich** Chat im Auftragskontext, Lieferscheine für tatsächliche Lieferungen, ein bedarfsgerechtes Fahrtenbuch, qualifikationsgestützte Planung, Eingangsbelege, Bankabgleich, ÖNORM oder SharePoint allein wegen ihrer Größe. Der passende Betriebszweck und die saubere Einbindung sind entscheidend.

### Was zusammengehört, statt doppelt gebaut zu werden

| Gemeinsamer Ablauf | Zusammengehörige Originalpunkte | Warum |
|---|---|---|
| Auftragsführung | A01, A02, A03, A11 | Ein bestehender Auftrag mit mehreren Einstiegen, kein Board-Auftrag neben dem echten Auftrag. |
| Preisstand und Entwurfskalkulation | E01–E07, A07, A08, G06 | Dieselbe Artikelidentität, Versionsquelle und Preisregel. |
| Anfrage und Beschaffung | E08, E09, E14, G03 | Eine Bedarfs-/Anfrage-/Bestellkette; nicht mehrere Fehlmengenlisten. |
| Material und Lieferung | E10–E13, E16, R01–R03 | Ein physischer Bewegungsweg mit verschiedenen Dokumenten und Eingabearten. |
| Eingangsfakturen | R06–R09, E15, G09 | R07 und E15 sind derselbe Dreiwege-Abgleich; R08 und G09 dieselbe Dublettenprüfung. |
| Bank und Fristen | R04, R05, G07, G08 | Ein Umsatz- und Zahlungsstand, keine zweite Finanzwahrheit. |
| Planung | B04–B08, Z05, G10 | Aufgaben, Eignung, Kapazität und Materialbereitschaft treffen in derselben Planentscheidung zusammen. |
| Tatsächliche Arbeit und Berichte | B01, B02, B10, B11, R10, R11 | Erfassungen und ihre Ausgaben verbinden; Berichte erzeugen keine neue Leistung. |
| Wartungsprüfung | W01–W05, G11 | Eine Ausführung, passende Vorlage, Messwerte, Bericht, Vertragsannahme und bestehender Abrechnungsweg. |
| Abrechnung | A04, A10, B14, G01–G05 | Quellen, Mengen und Vertragsbasis einmal prüfen; verschiedene Auswertungen/Belegarten darauf aufbauen. |
| Nachvollziehbarkeit | U04–U06 mit den Fachvorgängen | Journal, ausgewählte Zugriffe und Entwurfswiederherstellung haben getrennte Zwecke, aber gemeinsame Objektbezüge. |

Diese Gruppen sind keine Aufforderung für neue Menüpunkte oder zwölf neue Pflichtmodule. Die bestehenden Hauptbereiche bleiben die Oberfläche.

## 2. Entscheidungsmaßstab

Eine Funktion ist passend, wenn sie einen tatsächlich unterscheidbaren fachlichen Vorgang zuverlässig abdeckt, ihre Datenquelle kennt und einen normalen vollständigen Fehler-/Korrekturweg hat.

Ich prüfe je Punkt:

- Welches konkrete Arbeitsproblem löst er?
- Ist dies schon eine vorhandene Fähigkeit oder ein neuer Bedien-/Ausgabeschritt?
- Wo liegt die einzige maßgebliche Daten- und Schreibquelle?
- Erzeugt die Funktion neue Tatsachen oder nur einen erklärbaren Vorschlag?
- Erzwingt sie einen unnötigen Pflichtprozess für andere Betriebsarten?
- Bleiben bestehende Rollen, persönliche Daten, Belege und Korrekturwege richtig?
- Findet der Nutzer sie im richtigen Arbeitskontext, ohne neue Kennzahlen-/Kachelwände?

**Optional** bedeutet: vollständig geplant und funktionsfähig aktivierbar, wenn der Betrieb diesen fachlichen Ablauf hat. Es bedeutet nicht „unfertig“, „zu teuer“ oder „irgendwann vielleicht“.

**Integrieren** bedeutet: Funktion behalten, aber nicht als eigenständiges Modul oder separaten Datenbestand bauen.

**Ändern** bedeutet: den nützlichen Kern behalten, die beschriebene Ausbaurichtung präzisieren oder teilweise bewusst beschneiden.

## 3. Bewertung sämtlicher 84 Originalpunkte

**Verteilung der Empfehlungen:** 17 × Behalten, 1 × Ersetzen, 36 × Integrieren, 22 × Optional, 8 × Ändern. Die Kategorien beschreiben Original-IDs, nicht die Anzahl neuer Module.

### A — Angebote, Aufträge und Kundenobjekte

| ID / Funktion | Empfehlung | Funktionale Begründung | Saubere Integration |
|---|---|---|---|
| **A01 · Auftragsübersicht mit Bearbeitungsphasen** | **Ändern** | Eine Auftragsübersicht ist sinnvoll. Operative Phase, Rechnungsstand, Zahlung und Gewährleistung sind jedoch parallele Sachverhalte; ein einziges lineares Board würde falsche Übergänge erzwingen. | Liste als ruhiger Standard, Board optional; getrennte Zustandsachsen in derselben Akte. |
| **A02 · Aufträge auf einem Board verschieben** | **Ändern** | Verschieben ist nützlich, darf aber keine Annahme, Rechnung oder Gewährleistung vortäuschen. Nur wirklich manuell entscheidbare operative Phasen verschieben. | Gleiche Aktion im Formular und auf dem Board; fachliche Folgeaktionen ausdrücklich öffnen. |
| **A03 · Eingangsauftrag unabhängig von einem Angebot anlegen** | **Behalten** | Ein Serviceauftrag entsteht oft direkt am Telefon. Ein Angebotszwang wäre eine unbegründete Einschränkung des Tagesgeschäfts. | Bestehende Baustellen-/Auftragsakte, kein zweiter Auftragsstamm. |
| **A04 · Projekt-Meilensteine mit Zahlungsplan** | **Optional** | Etappen und Zahlungspläne sind für größere Projekte hilfreich, bei kurzen Serviceaufträgen aber ohne fachlichen Inhalt. Eine verpflichtende Etappenliste würde nur Büroarbeit erzeugen. | Zusätzlicher Bereich derselben Akte; keine Voraussetzung für normale Teil-/Schlussrechnungen. |
| **A05 · ÖNORM A 2063-Leistungsverzeichnisse importieren, kalkulieren und exportieren** | **Optional** | Für Ausschreibungen ist der komplette Normablauf fachlich wichtig. Für einen Betrieb ohne LV-Austausch ist er in der täglichen Oberfläche unnötig. Der Aufwand ist kein Streichgrund. | Vollständiges aktivierbares LV-Modul mit Import, Kalkulation und Export; normale Angebote bleiben einfach. |
| **A06 · Angebote online per Link annehmen/unterschreiben** | **Behalten** | Entfernte, eindeutige Angebotsannahme schließt einen echten Medienbruch. Ein gezeichnetes Unterschriftsbild ist dabei nicht immer die sinnvolle Mindestbedingung. | Versionierte Annahme mit dokumentierter Erklärung; Signaturniveau nach konkretem Zweck. |
| **A07 · Kalkulation anhand eines Zielpreises** | **Optional** | Zielpreisrechnung hilft bei Preisverhandlungen, ersetzt aber keine Kostenkenntnis und darf keinen scheinbar guten Deckungsbeitrag erfinden. | Kalkulationswerkzeug am Entwurf; Regeln und gesperrte Fixpreise sichtbar. |
| **A08 · Angebotspositionen nach neuen Einkaufspreisen nachrechnen** | **Integrieren** | Die Anpassung gehört direkt zur bestehenden Angebotskalkulation und zum Katalogvergleich. Als eigener Workflow entstünden zwei Wahrheiten über den Preisstand. | Positionsdifferenz mit ausdrücklicher Übernahme, gleicher Regelkern wie E04 und G06. |
| **A09 · Liegenschaften, Tops/Wohnungen, Mieter, Eigentümer und Hausverwaltungen** | **Optional** | Liegenschaft, Top, Bewohner und Auftraggeber lösen echte Zuordnungsprobleme im Hausverwaltungsservice. Eine Pflicht-Immobilienhierarchie wäre bei einfachen Privatkunden falsch. | Optionale Objektstruktur unter Kunde/Standort; getrennte Beteiligtenrollen und zeitliche Gültigkeit. |
| **A10 · Sammelabrechnung je Hausverwaltung/Liegenschaft** | **Optional** | Sammelabrechnung ist für viele kleine Einsätze an einen tatsächlichen Empfänger sinnvoll. Nur nach Hausverwaltungsname zu sammeln wäre fachlich falsch. | Vorhandene Rechnungsquellen gruppieren; Empfänger, Steuerkontext und Einzelleistungen erhalten. |
| **A11 · Strukturierte Eingangsaufträge übernehmen** | **Optional** | Strukturierte Kundenaufträge vermeiden Doppelerfassung, wenn eine tatsächlich verwendete Schnittstelle existiert. Ohne festes Datenformat gibt es keinen verlässlichen automatischen Auftrag. | Importprofil mit Vorschau, Zuordnung und Dublettenprüfung; manuelle Anlage bleibt vollwertig. |
### R — Rechnungen, Lieferscheine und Bank

| ID / Funktion | Empfehlung | Funktionale Begründung | Saubere Integration |
|---|---|---|---|
| **R01 · Eigenständige Kundenlieferscheine** | **Optional** | Eigenständige Warenlieferung braucht einen Lieferschein. Ihn für jede Installation zusätzlich zum Handwerksschein zu verlangen, würde denselben Sachverhalt doppelt dokumentieren. | Belegtyp am Auftrag, nur bei tatsächlichem Lieferzweck; bestehende Materialquelle referenzieren. |
| **R02 · Teillieferungen und offene Restmengen** | **Integrieren** | Restmengen sind unverzichtbar, sobald Lieferscheine genutzt werden. Sie sind kein zweites Modul und müssen Retoure mit oder ohne Ersatz unterscheiden. | Teilmenge und Rest direkt in der Lieferposition. |
| **R03 · Lagerbewegung durch Kundenlieferschein und dessen Storno** | **Integrieren** | Dokumentstorno und physische Warenrückgabe sind nicht dasselbe. Ein pauschales Zurückbuchen ins Regal würde falschen Bestand erzeugen. | Gleiche Bewegungsquelle wie R01; tatsächlichen Warenort und Korrekturgrund führen. |
| **R04 · CAMT-Kontoauszug importieren** | **Behalten** | Bankdateien sind eine klare strukturierte Grundlage und sparen manuellen Übertrag ohne geratenen Inhalt. | Ein Import im Bankabgleich, normalisierte Umsätze mit Originalbezug. |
| **R05 · Zahlungen zur passenden Rechnung vorschlagen** | **Integrieren** | Matching ist der nächste Schritt von R04 und nutzt vorhandene Zahlungseingänge. Ein separates Zahlungsmodul würde Salden doppelt berechnen. | Vorschlag und manuelle Split-/Teilzuordnung im selben Abgleich. |
| **R06 · Eingangsrechnungsverwaltung** | **Behalten** | Eingangsbelege verbinden tatsächliche Kosten mit Einkauf und Baustelle. Sinnvoll als Beleg-/Freigabeverwaltung, nicht als zusätzlich erfundene vollwertige Finanzbuchhaltung. | Original, erfasste Daten, Freigabe, Kontierung und Export getrennt; kein neuer Zwang für Ausgangsrechnungen. |
| **R07 · Eingangsrechnung gegen Bestellung und Wareneingang abgleichen** | **Integrieren** | Der Dreiwege-Abgleich ist sinnvoll, aber mit E15 identisch. Zwei Prüflogiken würden unterschiedliche Antworten liefern. | Ein gemeinsamer Dienst, aus Rechnung, Bestellung und Wareneingang erreichbar. |
| **R08 · Dublettenwarnung für Lieferantenrechnungen** | **Integrieren** | Dublettenprüfung gehört in die Belegerfassung. Ein gleich hoher Betrag reicht nicht als Nachweis. | Ein identischer Dienst für R08 und G09; begründete Klärung statt automatischer Löschung. |
| **R09 · Kontierungsvorschläge für Eingangsrechnungen** | **Optional** | Kontierungsvorschläge sind bei bestätigtem Konten-/Kanzleiprofil nützlich. Ungeprüfte Kontonummern würden einen scheinbar vollständigen Buchungssatz erzeugen. | Erklärbare gepflegte Regeln im Eingangsbeleg; keine automatische Buchungsfreigabe. |
| **R10 · Rechnungen nach dokumentiertem Aufmaß** | **Optional** | Aufmaß ist bei mengenabhängiger Leistung entscheidend, bei einfachen Pauschal-/Servicefällen aber keine sinnvolle Pflicht. | Freigegebene Messquelle am Auftrag/LV; bestehende normale Mengenpositionen erhalten. |
| **R11 · Arbeitsberichte mit Rechnungen verbinden** | **Integrieren** | Ein Bericht als Rechnungsbeilage ist praktisch, aber keine neue Leistung und kein eigener Berichtsgenerator. | Versionierten Nachweis aus B10/B11 an vorhandenes Belegpaket anhängen. |
| **R12 · Mahnungen/Zahlungserinnerungen direkt aus der App versenden** | **Behalten** | Tatsächlicher Versand mit Fehler-/Empfängernachweis verbessert den Belegablauf. Mailprogramm öffnen ist kein Versandnachweis. | Ein gemeinsamer Versanddienst für freigegebene Dokumente; keine automatische Mahnfreigabe. |
### E — Großhändler, Einkauf und Lager

| ID / Funktion | Empfehlung | Funktionale Begründung | Saubere Integration |
|---|---|---|---|
| **E01 · Mehrere Großhändlerkataloge parallel verwalten** | **Behalten** | Mehrere Lieferanten sind normal. Getrennte Kataloge verhindern Nummernkollisionen; ein Import soll nicht alle Fremdartikel zum gepflegten Betriebsstamm machen. | Katalogdaten getrennt, gezielte verifizierte Artikelübernahme. |
| **E02 · Einkaufspreise desselben Artikels bei mehreren Großhändlern vergleichen** | **Behalten** | Ein ehrlicher Vergleich identischer Artikel liefert einen direkten Beschaffungsnutzen. Vergleich bloß ähnlicher Namen würde Fehlkäufe fördern. | Im Artikel-/Einkaufskontext mit Einheiten, Packung und Identitätsnachweis. |
| **E03 · Günstigsten vergleichbaren Artikelpreis kennzeichnen** | **Integrieren** | Die Kennzeichnung ist ein Ergebnis von E02, keine eigenständige Funktion mit eigenem Datenbestand. | Ein ruhiger Hinweis in derselben Vergleichsliste; keine Gesamtpreisbehauptung. |
| **E04 · Einkaufspreisverlauf und Preisänderungswarnungen** | **Integrieren** | Preisverlauf ist sinnvoll. Warnungen für jede Katalogänderung ohne Bezug zu verwendeten Artikeln oder offenen Angeboten erzeugen jedoch nur Lärm. | Verlauf am Artikel; relevante Auswirkungen bündeln und auf betroffene Entwürfe führen. |
| **E05 · Neue Katalogversion vor Aktivierung prüfen und umschalten** | **Integrieren** | Kontrollierte Aktivierung ist notwendige Datenqualität, kein zusätzliches Endnutzer-Modul. | Ein konsistenter Import-/Versionsablauf mit E01. |
| **E06 · Hinweis auf veraltete Katalogdaten** | **Integrieren** | Preisalter hilft bei einer Entscheidung. Ein eigener Katalogwarnungsbereich oder eine pauschale Arbeitssperre ist dafür nicht nötig. | Datum und erklärbarer Hinweis in Suche, Vergleich und Kalkulation. |
| **E07 · Regeln für Verkaufspreise und Aufschläge** | **Behalten** | Verlässliche Preisregeln vermeiden manuelle Wiederholung. Beliebig verschachtelte gleichrangige Regeln würden unvorhersagbare Preise liefern. | Versionierte klare Vorrangfolge, Vorschau und geschützte manuelle Preise. |
| **E08 · Preisangebote mehrerer Lieferanten gegenüberstellen** | **Optional** | Mehrlieferantenangebote sind bei Projektbeschaffung hilfreich. Für einen einzelnen Fittingkauf eine Angebotsrunde zu verlangen wäre ein falscher Prozesszwang. | Option am bestehenden Einkaufsvorgang; direkter normaler Einkauf bleibt möglich. |
| **E09 · Preisanfrage an mehrere Lieferanten vorbereiten** | **Integrieren** | Anfrage und Angebotsvergleich bilden einen einzigen Beschaffungsvorgang. Ein neues Anfrageportal neben Einkauf und E08 würde Kontext aufteilen. | Dieselben Positionen und Referenzen, Empfänger-/Versionskontrolle über gemeinsamen Dokumentdienst. |
| **E10 · Lagerorte und Fahrzeuglager** | **Behalten** | Fahrzeugbestände sind im Servicegeschäft echte Bestände. Ohne Standortbezug bleibt vorhandenes Material unsichtbar oder doppelt verfügbar. | Ein Lagerortmodell, das bei nur einem Lager nicht komplizierter bedient werden muss. |
| **E11 · Barcode-/QR-/DataMatrix-Kommissionierung** | **Optional** | Scannen nützt bei eindeutig codierten Artikeln und häufigen Bewegungen. Es ist eine Eingabeart, keine Pflicht und keine bessere Wahrheit als bestätigte manuelle Auswahl. | Scanner im bestehenden Buchungsdialog, mit Menge und Textalternative. |
| **E12 · Scannerunterstützte Inventur** | **Integrieren** | Eine Inventur ist für verlässliche Standortbestände wichtig. Der Scanner darf aber nicht eine zweite Bestandsführung erzeugen. | Zählauftrag im Lager, gleiche Differenzbuchung mit Scan oder manueller Eingabe. |
| **E13 · Materialampel je Auftrag und geplantem Einsatz** | **Behalten** | Materialbereitschaft vor der Anfahrt hat hohen funktionalen Nutzen. Eine Lieferung unterwegs ist trotzdem kein physisch fertiger Einsatz. | Gemeinsame Deckungsberechnung, Fakten und Prognose getrennt. |
| **E14 · Regelbasierte Bestellvorschläge** | **Integrieren** | Bestellvorschläge schließen die Lücke zwischen Mindestbestand, Bedarf und Einkauf. Derselbe Fehlbedarf darf nicht mehrfach vorgeschlagen werden. | Ein Beschaffungsdienst mit G03 und den vorhandenen Einkaufslisten. |
| **E15 · Lieferantenrechnung mit Bestellung/Wareneingang abgleichen** | **Integrieren** | Derselbe Dreiwege-Abgleich wie R07; ein zweiter Warenabgleich wäre eine echte Integrationslücke. | Ein Dienst mit rollenabhängigen Einstiegen. |
| **E16 · Restmaterial je Lagerort zurückgeben oder abrechnen** | **Integrieren** | Restmaterial ist eine wichtige Mengen- und Abrechnungsfrage. Rückgabe darf aber nicht automatisch Rechnung oder Kostenbezug korrigieren. | Gemeinsame Retoure mit Herkunft/Ort/Zustand; kaufmännische Entscheidung gesondert. |
### B — Monteur, Baustelle und Planung

| ID / Funktion | Empfehlung | Funktionale Begründung | Saubere Integration |
|---|---|---|---|
| **B01 · „Mein Tag“ als zentrale Monteursansicht** | **Integrieren** | Der zentrale Einstieg ist sinnvoll und bereits teilweise vorhanden. Ein zweites unabhängiges Mein-Tag-Modul würde die Navigation wieder aufteilen. | Bestehende Startseite und vorhandene Fachaktionen zusammenführen. |
| **B02 · Arbeitszeit und konkrete Auftragszeit in einem durchgehenden Start-/Stopp-Ablauf** | **Behalten** | Ein durchgehender Erfassungsweg hilft im Außendienst. Arbeitszeit, Pause und abrechenbare Auftragszeit sind jedoch unterschiedliche Daten. | Ein Zeitkern mit Sitzungen und Segmenten; manuelle Erfassung bleibt gleichwertig. |
| **B03 · Digitale Besichtigungschecklisten** | **Optional** | Besichtigungsdaten können direkt in die Kalkulation führen. Eine starre Besichtigungscheckliste für jeden Kleinauftrag wäre unpassend. | Auftragsbezogene Vorlagen, bestätigte Mengen in Angebotsentwurf, freier Einstieg weiter möglich. |
| **B04 · Arbeitsvorbereitung mit Freigabeschritten** | **Ändern** | Arbeitsbereitschaft zu prüfen ist sinnvoll. Eine pauschale Freigabebürokratie würde bereits vorhandene Termine, Personen und Materialdaten nochmals bestätigen lassen. | Faktenbasierten Bereitschaftscheck; zusätzliche menschliche Freigabe nur für tatsächlich erforderliche Entscheidungen. |
| **B05 · Aufgaben mit Zuständigen, Fristen und Anhängen** | **Behalten** | Klare Aufgaben mit Besitzer und Frist schließen eine reale Lücke. Sie sollen operative Verpflichtungen bündeln statt einen allgemeinen Projektmanagementbaukasten eröffnen. | Arbeitsliste an Akte und Mein Tag, gleiche Aufgabe in allen Einstiegen. |
| **B06 · Einsatzplanung per Drag-and-drop** | **Behalten** | DnD ist ein schneller Bedienweg zum vorhandenen Plan, kein neues Planungssystem. | Wochenstil erhalten; gleiche Serverprüfung und gleichwertiger Touch-/Formularweg. |
| **B07 · Regelbasierte Vorschläge für freie Ersatzkräfte** | **Integrieren** | Verfügbare qualifizierte Personen zu finden ist nützlich. Ein vermeintlich optimaler Personenscore würde eine objektive Aussage vortäuschen. | Erklärbare Verfügbarkeits-/Qualifikationsliste, gemeinsame Regeln mit B08/G10. |
| **B08 · Warnung vor fehlender Qualifikation oder Materialbereitschaft beim Einteilen** | **Integrieren** | Material- und Qualifikationshinweise gehören an die Planentscheidung, nicht in weitere Warnungs-Dashboards. | Gemeinsames Prüfungsergebnis mit klarem Unterschied zwischen unbekannt, Warnung und echter Sperre. |
| **B09 · Projektbezogener Chat und Direktnachrichten** | **Ändern** | Auftragsbezogene Rückfragen brauchen einen sicheren gemeinsamen Kontext. Ein allgemeiner Direktnachrichten-Messenger fördert hingegen neue verstreute Absprachen ohne Aufgaben-/Belegbezug. | Projekt-/Aufgaben-Threads mit Erwähnungen und Benachrichtigung behalten; freien allgemeinen DM-Messenger aus dem empfohlenen Standardumfang streichen. |
| **B10 · Bautagesberichte mit Personal, Leistungen, Bildern, Wetter und Unterschrift** | **Integrieren** | Ein Bautagesbericht hat eigene fachliche Felder, aber braucht keine parallele Datenhaltung zu B11 und Handwerksscheinen. | Ein Berichtskern mit Profil Bautag, manuellem Wetter und geprüften tatsächlichen Daten. |
| **B11 · Arbeitsbericht aus den vorhandenen Zeiten und Materialien** | **Integrieren** | Ein Arbeitsbericht ist eine andere Ausgabe vorhandener Arbeit, keine zusätzliche Buchung. | Derselbe Quellen-/Dokumentkern wie B10, mit passendem Arbeitsberichtprofil. |
| **B12 · Mängelverfolgung** | **Behalten** | Mängel benötigen eine nachvollziehbare Erledigung über einen normalen Aufgabentext hinaus. | Mangeltyp im Aufgaben-/Qualitätskontext mit Foto, Prüfung und Wiedereröffnung. |
| **B13 · Abnahmeprotokoll mit digitalen Signaturen** | **Optional** | Eine formale Abnahme ist bei passenden Aufträgen wichtig, aber nicht dasselbe wie eine einfache Leistungsbestätigung am Handwerksschein. | Eigenes Dokumentprofil mit Vorbehalten und Teilabnahme, im gleichen Signaturdienst. |
| **B14 · Laufende Prognose von Projektkosten und Deckungsbeitrag** | **Optional** | Eine Prognose hilft nur bei tatsächlich gepflegtem Restaufwand. Istkosten allein rechtfertigen keine Endkostenbehauptung. | Iststand bleibt Standard; ausdrücklich gepflegte Restdaten ermöglichen gekennzeichnete Prognose. |
| **B15 · SharePoint-Anbindung für Projektdokumente** | **Optional** | Für Betriebe mit SharePoint ist der Zugang zu vorhandenen Projektdokumenten ein echter Integrationsnutzen. Ohne Microsoft-Nutzung wäre ein sichtbares Pflichtmodul sinnlos. | Optionaler sauber berechtigter Referenz-/Importadapter; keine zweite automatische Vollablage. |
### Z — Zeit und Mitarbeiter

| ID / Funktion | Empfehlung | Funktionale Begründung | Saubere Integration |
|---|---|---|---|
| **Z01 · Antrag auf Korrektur einer Zeitbuchung** | **Ändern** | Ein Korrekturantrag ist sinnvoll, wenn Mitarbeiter etwas nicht selbst ändern dürfen. Ihn vor jede bisher erlaubte eigene Korrektur zu schalten wäre eine Verschlechterung. | Bestehende Selbstbearbeitung erhalten; Antrag für gesperrte oder fremd zu prüfende Fälle. |
| **Z02 · Weitere Durchrechnungs-/Ausgleichsmodelle** | **Optional** | Zusätzliche konkrete Zeitmodelle können für bestimmte Betriebe zwingend sein. Ein undefinierter Alleskönner-Regelbaukasten erzeugt dagegen keine verlässliche Arbeitszeitberechnung. | Versionierte verifizierte Modellprofile und Parameter, kein generischer Lohnabrechnungsersatz. |
| **Z03 · Schlechtwetter, Fahrzonen und zusätzliche Zulagen als eigene Erfassungsmerkmale** | **Optional** | Zusätzliche Merkmale sind nützlich, wenn sie tatsächlich erfasst/exportiert werden müssen. Beobachtung und rechtlicher Entgeltanspruch sind getrennt. | Definierte Merkmale mit Herkunft und Regelprofil, nicht pauschale automatische Zuschläge. |
| **Z04 · Optionales automatisches Ausstempeln** | **Ersetzen** | Eine Uhrzeit beweist nicht, dass die Arbeit endet. Automatisches Ausstempeln kann tatsächlich geleistete Stunden verkürzen oder falsche Tatsachen erzeugen, auch wenn später korrigiert werden könnte. | Überfälligen Timer melden, bestätigbaren Abschluss vorschlagen, bewusst weiterlaufen lassen. Keine automatische arbeitszeitwirksame Endbuchung allein wegen einer Endregel. |
| **Z05 · Qualifikationen mit Gültigkeitsdatum und Erinnerung** | **Behalten** | Qualifikationen mit Gültigkeit gehören zur fachlich richtigen Besetzung und Fristenkontrolle. | Nachweis im Personenbereich, nur notwendige Eignungsinformation in der Planung. |
### W — Wartung und Betriebsmittel

| ID / Funktion | Empfehlung | Funktionale Begründung | Saubere Integration |
|---|---|---|---|
| **W01 · Wartungs- und Prüfchecklisten je Anlagentyp** | **Integrieren** | Anlagenspezifische Checklisten haben hohen Nutzen. Sie gehören zu einer konkreten Wartung, nicht in ein allgemeines losgelöstes Formularportal. | Ein Prüfvorgang mit W02/W03 und der bestehenden Wartungshistorie. |
| **W02 · Abweichungen von hinterlegten Prüfwerten kennzeichnen** | **Integrieren** | Abweichungen sind ein Ergebnis derselben Prüfung. Unbekannte Grenzwerte dürfen nicht in eine unbegründete Sicherheitsbewertung umschlagen. | Bewertung am Messfeld mit verifizierter Grundlage; kein separates Alarmmodul. |
| **W03 · Prüfbericht als PDF aus dem Wartungsvorgang** | **Integrieren** | Der Bericht ist die notwendige bestätigte Ausgabe von W01/W02, kein dritter unabhängiger Arbeitsvorgang. | Versioniertes Berichtprofil aus denselben Antworten und derselben Ausführung. |
| **W04 · Wartungsleistungen zur Abrechnung vormerken** | **Integrieren** | Wartungsabrechnung schließt den vorhandenen Ablauf sinnvoll. Ein neuer eigener Rechnungsgenerator würde zu Doppelabrechnung führen. | Bestehende Rechnungsvorschau und gemeinsame Quellenzuordnung. |
| **W05 · Wartungsvereinbarung online unterschreiben** | **Optional** | Fernannahme von Wartungsverträgen passt zum Vertragsbestand, sofern der Betrieb sie nutzt. Eine neue Unterschrift je Wartung ohne Vertragsänderung wäre unnötig. | Derselbe Annahmedienst wie A06, aber mit eindeutiger Wartungsvertragsfassung. |
| **W06 · Fuhrparkübersicht mit Pickerl-, Service- und Versicherungsfristen** | **Optional** | Fahrzeuge und verpasste Fristen betreffen den Servicebetrieb tatsächlich. Es braucht dafür keinen umfassenden Flottenmanager. | Gemeinsame Betriebsmittelakte und Fristenliste, verknüpft mit Fahrzeuglager. |
| **W07 · Fahrtenbuch und Kilometerübersicht** | **Optional** | Kilometer und konkrete Fahrten können betrieblich nötig sein. Sie dürfen nicht als automatische Arbeitszeit, GPS-Überwachung oder pauschal steuerlich anerkanntes Fahrtenbuch ausgegeben werden. | Explizite manuelle/strukturierte Fahrtenfunktion mit Korrekturverlauf und Export, nur bei entsprechendem Betriebszweck. |
| **W08 · Maschinen-/Geräteverwaltung mit Wartungsintervallen** | **Optional** | Geräte mit echten Wartungs-/Prüfintervallen brauchen eine Historie. Normale Verbrauchsartikel benötigen dagegen keine Geräteakte. | Mit Fahrzeugen gemeinsamer Betriebsmittel-/Fristenkern, fachliche Gerätefelder getrennt. |
### U — Bedienung und Nachvollziehbarkeit

| ID / Funktion | Empfehlung | Funktionale Begründung | Saubere Integration |
|---|---|---|---|
| **U01 · Individuell anpassbares Dashboard** | **Ändern** | Persönliche Reihenfolge und relevante Inhalte sind sinnvoll. Frei gestaltbare Kachel-Dashboards würden die gemeinsame Lot-Linie und Vergleichbarkeit der Bedienung schwächen. | Kuratierte Listen/Abschnitte anordnen und wählen, feste Darstellungsbausteine; keine freie Dashboard-Designfläche. |
| **U02 · Menüreihenfolge und Favoriten** | **Ändern** | Favoriten lösen den Schnellzugriff. Eine frei umsortierbare gesamte Grundnavigation macht Hilfe, Vertretung und gemeinsame Einweisung unzuverlässig. | Favoriten und begrenzte persönliche Priorisierung ja; kanonische Gruppen, Bezeichnungen und mobile Grundnavigation erhalten. |
| **U03 · Automatischer Wochenbericht über Betriebskennzahlen** | **Optional** | Ein Wochenrückblick kann Betriebsentscheidungen unterstützen. Ungefragte automatische Kennzahlenmails erzeugen jedoch eher Meldungslärm als Handlung. | Faktenbasierter In-App-Bericht; E-Mail nur bewusst abonniert mit berechtigtem Inhalt und Empfänger. |
| **U04 · Detailliertes Änderungsprotokoll mit Vorher-/Nachher-Werten** | **Behalten** | Kritische Änderungen müssen nachvollziehbar sein. Dieses Fundament verhindert echte Integrationsprobleme und gehört nicht als spät ergänztes Komfortmodul behandelt. | Serverseitiger Journal-/Quellenbezug von Anfang an, Rollen und Datensparsamkeit. |
| **U05 · Protokollierung ausgewählter Ansichten und Versendungen** | **Ändern** | Tatsächlicher Versand und konkret begründeter sensibler Zugriff sind belegwürdig. Eine allgemeine Liste, wer welche App-Seite ansieht, bringt wenig Fachnutzen und zusätzliche Überwachungsdaten. | Versandereignisse behalten; Ansichtsnachweis nur für vorher benannte nachweisbedürftige Objekte. Keine allgemeine Nutzungsverfolgung. |
| **U06 · Papierkorb für wiederherstellbare Entwürfe** | **Behalten** | Wiederherstellbare Entwürfe verhindern echten Datenverlust. Die Quelle grenzt sie bereits richtig von unveränderlichen Belegen und endgültiger Löschung ab. | Gezielter Entwurfspapierkorb mit Referenzprüfung und klarer Aufbewahrung, kein universelles Beleg-Undo. |
### G — Regelbasierte Ableitungen

| ID / Funktion | Empfehlung | Funktionale Begründung | Saubere Integration |
|---|---|---|---|
| **G01 · Offene Regie und unterschriebene Scheine finden** | **Integrieren** | Funktional sinnvoll, aber bereits derselbe Quellen-/Restverbrauch wie die Arbeitsliste zur Abrechnung. | Eine Regel im gemeinsamen Abrechnungsdienst, kein zusätzlicher Menüpunkt. |
| **G02 · Rechnungsvorschau für erledigte Baustelle vorbereiten** | **Integrieren** | Die Vorschau gehört zur bestehenden Rechnungslogik. Eine zusätzliche automatische Rechnungserstellung wäre ein zweiter riskanter Weg. | Derselbe bewährte Vorschau-/Ausstellungsweg mit bestätigten Quellen. |
| **G03 · Bestellvorschlag aus Fehlbestand erstellen** | **Integrieren** | Identisch zum fachlichen Kern von E14; zwei Fehlmengenlisten würden Doppelbestellungen begünstigen. | Ein Bedarf-/Deckungsdienst und dieselbe Einkaufsliste. |
| **G04 · Schlussrechnung auf Mehrmengen hinweisen** | **Integrieren** | Mengenabweichungen sind ein sinnvoller Prüfanlass, aber noch kein Anspruch auf einen Nachtrag. | Hinweis in Aufmaß-/Schlussrechnungsvorschau, getrennt von erlaubter Abrechnung und bereits verrechneter Menge. |
| **G05 · Angebotsbudget-Warnung** | **Integrieren** | Budgetwarnung hilft bei hinterlegtem Budget und tragfähiger Kostenbasis. Sie ist ein Zustand der Nachkalkulation, kein eigenes Warnungsprodukt. | Schwelle und Herkunft im bestehenden Kosten-/Auftragskontext. |
| **G06 · Katalogpreisänderung erkennen** | **Integrieren** | Dieselbe Regel wie E04/A08. Eine zweite Preisänderungsberechnung würde keine zusätzliche Funktion liefern. | Gleicher Versionsvergleich und gleiche Wirkung auf Entwürfe. |
| **G07 · Skontofristen und Fälligkeiten erinnern** | **Integrieren** | Fristensicht ist wichtig, gehört aber direkt zum Beleg und seinem aktuellen offenen Stand. | Gemeinsamer Fristendienst für Eingang/Ausgang; keine separate Erinnerungsdatenbank. |
| **G08 · Bankzahlungen zuordnen** | **Integrieren** | Dieselbe Zuordnungsfunktion wie R05; nicht als zweiter Automatikweg bauen. | Ein Bankabgleich mit Vorschlag, manueller Klärung und bestätigter Buchung. |
| **G09 · Doppelte Lieferantenrechnungen erkennen** | **Integrieren** | Identisch zu R08. Die Datenbedingungen sind sinnvoll; ein weiteres Dublettenmodul wäre redundant. | Dieselbe fachliche Warnung und derselbe Klärstatus. |
| **G10 · Einsatzkonflikte und mögliche Ersatzkräfte anzeigen** | **Integrieren** | Gleiche Konflikt-/Eignungsprüfung wie B06–B08. Erklärbarkeit ist wichtiger als ein zusätzlicher Empfehlungsbildschirm. | Ein Regelkern mit kontextabhängig sichtbarem Ergebnis. |
| **G11 · Wartungstermin aus Intervall ableiten** | **Integrieren** | Die nächste Fälligkeit gehört zum bestehenden Wartungskern; eine zweite Terminberechnung würde falsche Doppeltermine erzeugen. | Gleiche bestätigte Ausführung, Vertragsregel und Historie. |

## 4. Kritische Integrationsentscheidungen vor Umsetzung

### 4.1 Ein Board ist nicht der Gesamtzustand eines Auftrags

Eine Baustelle kann fertig, noch nicht vollständig abgerechnet, noch nicht bezahlt und bereits in Gewährleistung sein. Diese Informationen dürfen gleichzeitig wahr sein. Ein einziges verschiebbares Statusfeld würde fachlich falsche Daten erzwingen.

**Entscheidung:** operative Phase editierbar; kaufmännische Zustände abgeleitet und nur über die richtige Fachaktion veränderbar. Die Auftragsübersicht fasst zusammen und behauptet keinen simplen linearen Lebenslauf.

### 4.2 Material hat Herkunft, Ort, Verbrauch und Abrechnung

Ein Monteur kann Material im Fahrzeug haben, auf die Baustelle liefern, nur teilweise verbrauchen und den Rest zurückbringen. Der Lieferschein kann dieselbe Ausgabe dokumentieren, die schon durch Rüstliste oder Anforderung gebucht wurde.

**Entscheidung:** ein Bewegungs- und Quellenmodell. Weder Schein, Lieferschein noch Rechnung dürfen automatisch eine zusätzliche physische Ausgabe erzeugen. Eine Retoure ist kein Rechnungsstorno; ein Rechnungsstorno beweist keine Rückkehr ins Regal.

### 4.3 Weniger Pflichtfreigaben, mehr richtige Prüfungen

Freigaben sind sinnvoll, wenn wirklich jemand eine Verantwortung oder fachliche Entscheidung übernimmt. Einen schon zugewiesenen Mitarbeiter, einen vorhandenen Termin und eine verfügbare Menge nochmals mit drei Häkchen zu bestätigen, schafft keine neue Sicherheit.

**Entscheidung:** vorhandene Fakten automatisch nachvollziehbar anzeigen. Menschliche Freigabe nur für tatsächlich offene Entscheidungen, relevante Änderungen, echte Abweichungen oder vorgeschriebene Befähigungen. Diese letzten Sperren nicht aus Bequemlichkeit aufweichen.

### 4.4 Zeitdaten dürfen nicht aus Komfortgründen erfunden werden

Der geplante Einsatz ist keine gearbeitete Stunde. Ein offen gelassener Timer ist kein Beweis für Arbeit bis jetzt; ein Regel-Ende ist genauso wenig ein Beweis dafür, dass Arbeit aufgehört hat.

**Entscheidung:** Hinweise, Kandidaten und bestätigte Buchungen getrennt. Bestehende erlaubte manuelle Bearbeitung bleibt; Antrag nur dort, wo eine andere berechtigte Person wirklich prüfen muss. Keine pauschale neue Genehmigungspflicht.

### 4.5 Dokumente teilen sich Technik, nicht automatisch ihre Bedeutung

Handwerksschein, Arbeitsbericht, Bautagesbericht, Lieferschein, Prüfbericht und Abnahme können dieselben Anlagen und Quelldaten verwenden. Trotzdem bestätigt eine Kundenunterschrift nicht in jedem Dokument dasselbe.

**Entscheidung:** gemeinsamer Dokumentkern mit unterschiedlichen Profilen/Freigaben. Im Alltag nur passende Profile anzeigen. Keine vier Dokumente für eine kleine Serviceleistung erzwingen, aber formale Abnahme und tatsächliche Warenlieferung bei Bedarf vollständig anbieten.

### 4.6 Mehr Automatik braucht nicht mehr autonome Buchungen

Die zuverlässigsten Regeln im Katalog erkennen Fristen, eindeutige Referenzen, verfügbare Mengen und sichtbare Abweichungen. Sie sparen Suche und wiederholte Eingabe, ohne eine Entscheidung vorzutäuschen.

**Entscheidung:** G01–G11 vollständig als Dienste/Regeln in den zugehörigen Abläufen vorsehen. Keine elf zusätzlichen Automatikseiten. Vorschlag, Bestätigung und tatsächliche Wirkung getrennt; dieselben Herkunftsbezüge in Anzeige und Buchung.

### 4.7 Betriebsarten brauchen unterschiedliche sichtbare Tiefe

ÖNORM, Liegenschaften, Aufmaß, Fahrtenbuch, Geräteintervalle und SharePoint sind weder pauschal Pflicht noch pauschal unnütz. Bei passenden Aufträgen lösen sie Probleme, die ein anderes Feature nicht ersetzt.

**Entscheidung:** vollständige optionale Fachabläufe mit passenden Voreinstellungen. Wer sie nicht nutzt, sieht keine leeren Tabs und muss keine bedeutungslosen Daten erfassen. Aktivieren darf nicht die bisherigen einfachen Fälle zerstören.

## 5. Konsequenz für den Masterprompt

Die ursprünglichen 84 IDs bleiben vollständig als Referenz und Abdeckungsnachweis erhalten. Sie sind **keine ungeprüfte Pflichtliste von 84 Neubauten**.

Empfohlene Anpassungen:

- Z04 technisch als Erinnerungs-/Abschlussvorschlag planen, nicht als allein zeitregelbasierte echte Arbeitszeitbuchung.
- B09 auf kontextgebundene Kommunikation ausrichten; den allgemeinen DM-Messenger nicht als notwendigen Standardumfang behandeln.
- U02 mit Favoriten und stabiler Grundnavigation planen.
- U05 auf tatsächlich begründete Zugriffs- und Versandnachweise begrenzen.
- A01/A02, B04, Z01 und U01 mit den genannten fachlichen Korrekturen planen.
- Die als integriert markierten Punkte behalten ihre fachliche Fähigkeit, teilen sich aber Daten, Aktionen und Oberfläche.
- Die als optional markierten Bereiche vollständig entwickeln können, ohne sie in den Normalablauf jedes Betriebs zu zwingen.

Dies sind begründete Empfehlungen, noch keine stillschweigende Freigabe, Funktionen aus einem bereits beauftragten Implementierungsumfang zu entfernen. Vor der Implementierung muss der gewählte Zielumfang eindeutig sein. Eine spätere direkte Umsetzungsanweisung soll ausdrücklich auf den bestätigten Empfehlungsstand oder auf die vollständige Originalreferenz verweisen.

## 6. Was ich ausdrücklich nicht als Begründung akzeptiere

- „Zu aufwendig“ oder „für den Start reicht weniger“, wenn der fachliche Ablauf im Zielumfang erforderlich ist.
- „Das kann Excel“, obwohl dadurch derselbe Sachverhalt in zwei unverbundenen Systemen gepflegt werden müsste.
- „Die Oberfläche soll minimalistisch sein“, wenn dafür Mengen, Rechte, Belege oder notwendige Korrekturen verschwinden.
- „Der Wettbewerber hat das“, wenn Zweck, Datenqualität und Verantwortung in Senklot unklar bleiben.
- „Ist optional“, wenn der aktivierte Ablauf dann nur halb funktioniert.
- „Automatisch“, wenn in Wirklichkeit unbekannte Daten durch angenommene Werte ersetzt werden.

**Empfohlenes Produktziel:** weniger eigenständige Systeme innerhalb der App, aber vollständige durchgängige Fachabläufe. Ruhe entsteht durch passenden Kontext und gemeinsame Quellen, nicht durch versteckte Funktionen oder erfundene Grenzen.


## Ergänzung vom 6. November: Zeitfelder und Module

N01 ergänzt frei gestaltbare, versionierte Zeitfelder einschließlich Pflichtregeln, konfigurierbar durch Administrator und Geschäftsführung. Das ist eine konkrete Konfiguration innerhalb der Zeiterfassung; es ändert die Kritik an einem beliebigen allgemeinen Regel-/Formularbaukasten nicht. Bestehende Zeitberechnung, Rechte und zulässige Korrekturwege bleiben maßgeblich.

N02 präzisiert alle fachlichen Module und Unterfähigkeiten als an-/abschaltbar, einschließlich Zeiterfassung. Gemeinsam benötigte Stammdaten und technische Schutzregeln bleiben erhalten. Abschalten ist weder Löschen noch stilles Freigeben neuer Rechte. Alle 84 Original-IDs sind im separaten Modulregister zugeordnet; die zwei neuen Auftraggeberwünsche werden zusätzlich geführt. Der Masterprompt beschreibt dafür konkrete Übergänge, Historien-/Abschlussmodus und Gegenproben.
