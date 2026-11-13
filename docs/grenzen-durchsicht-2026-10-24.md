# Durchsicht der benannten Grenzen (24.10.2026)

Auftrag vom 24.10.2026: Eine einfache erste Fassung soll es in der fertigen
Software nicht geben. Jede Funktion wird vollständig, nachhaltig und
skalierbar gebaut. Eine Grenze bleibt nur stehen, wenn sie einen Grund hat,
der außerhalb der Bequemlichkeit liegt (Regel in `CLAUDE.md`, Grundsatz 6).

Durchgesehen wurden alle benannten Grenzen in `docs/stand-2026-10-03.md`,
`docs/offene-punkte.md` und `docs/pruefung-2026-10-13-behebungen.md`, jeweils
gegen den Code vom 24.10.2026. Jede Grenze fällt in eine von fünf Gruppen:

- **A – Abkürzung.** Machbar, aber weggelassen. Wird gebaut.
- **N – Nachweis fehlt.** Die Funktion ist gebaut, aber ein Teil ist nicht
  dauerhaft geprüft. Die Prüfung wird nachgezogen.
- **B – Begründete Grenze.** Sie bleibt; der Grund steht dabei.
- **X – Liegt bei jemand anderem.** Betrieb, Kanzlei, Steuerberatung, Anwalt,
  WKO, Gerät oder Zugang zum gehosteten Projekt.
- **E – Inzwischen erledigt.** Die Doku nennt sie noch; der Code nicht mehr.

## A – Abkürzungen (werden gebaut)

Reihenfolge nach Gewicht: zuerst, was Belege, Geld und Recht berührt.

Alle sechzehn gebaut (24.10.2026, T-28 bis T-44); sie stehen unter E.

## N – Nachweise, die fehlen

Alle drei erbracht (24.10.2026, T-45 bis T-47); sie stehen unter E.

## B – Begründete Grenzen (bleiben)

| Grenze (Fundstelle) | Grund |
|---|---|
| Altbestand: Scheinzeilen vor dem 24.10. ohne Katalogkennung, Anforderungen ohne Erledigt-Zeitpunkt, Mahnungen vor dem 10.10. ohne Schreiben, ältere Verlaufseinträge ohne Tage, Buchungen vor dem Jugendschutz ohne Anleger, profillose Konten ohne Herkunftsnachweis, doppelte Baustellen aus der Zeit davor (T-19/T-22, 15.9, 18, 12.3, Prüfbericht 2) | Altdaten: nachtragen hieße, Produktionsdaten umzuschreiben, und das geschieht nicht. Die App erfindet keine Werte |
| Abgleich Schein ↔ Ausgabe und Preis über den Namen bei freien Zeilen (T-22, T-26) | Eine freie Zeile hat keinen Katalogartikel |
| Hinweise statt automatischem Abzug in der Rechnungsvorschau (T-21) | Fachlich: ob Material ein zweites Mal hingehört, weiß nur das Büro |
| Unverrechnete Stunden mit den Sätzen des Betriebs, nicht mit einem nur für eine Rechnung geänderten Satz (T-20) | Fachlich: dieser Satz entsteht erst beim Schreiben der Rechnung |
| Unterschriebene und stornierte Handwerksscheine lassen sich nicht löschen, nur Entwürfe (E42, Stand 39) | Rechtlich: ein unterschriebener Schein ist ein Beleg und gehört aufbewahrt (§ 132 BAO); auf ihm stehen Rechnungen |
| Der Supportzugang löscht keine Schein-Entwürfe (E42) | Sicherheit: Löschen ist endgültig; der Support hilft, er räumt nicht im Bestand des Betriebs |
| Arbeitszeitgrenzen: eine Lücke gilt als Pause; ein Tag ohne Uhrzeit wird auf die Pause nicht geprüft; vor dem ersten Buchungstag zählt die Woche mit null (Stand 15.3) | Die Angabe fehlt in den Daten; geschätzt wird nichts |
| Jugendschutz: die Datenbank sperrt nur über 8 Std. und in der Nachtruhe, der Rest ist Rückfrage und Fall (Stand 12.3) | Fachlich: Ausnahmen sind zulässig, aber begründet – sperren hieße, sie zu verhindern |
| Jugendschutz: ohne Geburtsdatum ist niemand jugendlich (Stand 12.3) | Ohne die Angabe lässt sich nichts prüfen; A7 sorgt dafür, dass sie da ist |
| Teilzeit: ob Mehrarbeit im Quartal ausgeglichen wird, entscheidet die Lohnverrechnung; abweichende Regeln anderer Kollektivverträge kennt Senklot nicht (T-1) | Fachlich bzw. Umfang: Senklot rechnet nach KV Metallgewerbe; ein anderer KV ist ein eigener Auftrag |
| Sonderurlaub: Pflegestunden über dem Kontingent warnen statt zu sperren; stundenweise nur bei Vorladung, Musterung und Pflege (Stand 10.3) | Rechtlich bzw. fachlich |
| Zeit teilen: verrechnete Buchungen nicht teilbar; Pause bleibt als Zahl am längeren Teil (Stand 15.6, 15.10) | Verrechnet ist ein Beleg; die Pause hat keine Uhrzeit in den Daten |
| Teilen und Einfügen nur mit Verbindung (Stand 15.6, 15.10) | Beide ändern mehrere Buchungen in einem Zug; offline könnte ein zweites Gerät dazwischen schreiben |
| Handwerksschein ohne jedes Netz neu beginnen (E49, Stand 46) | Datenschutz: Baustelle, Kunde und Adresse kommen vom Server; ein Vorrat aller Baustellen und Kunden im Browser läge auf geteilten Tablets unverschlüsselt. Mit Netz geöffnet, wird der Schein danach ohne Netz geschrieben und unterschrieben |
| Ein vorgemerkter Schein, der anderswo inzwischen unterschrieben oder verworfen wurde, kommt nicht mehr an (E49) | Fachlich und rechtlich: ein unterschriebener Schein ist ein eingefrorener Beleg; die App meldet es mit dem Grund des Servers |
| Änderungsprotokoll der Zeitbuchungen erst ab 05.11.2026 (E50, Stand 47) | Altdaten: was davor geändert wurde, ist nirgends festgehalten; die erste Änderung einer älteren Buchung zeigt den Stand davor als alten Wert |
| Änderungen mit dem Dienstschlüssel stehen nicht im Änderungsprotokoll (E50, Stand 47) | Fachlich: mit ihm laufen nur der Rücklauf einer Sicherung (bringt das Protokoll mit, sonst stünde alles doppelt), das Löschen eines ganzen Betriebs und die Prüfungen; kein Ablauf der App ändert Buchungen mit ihm. Sicherheit: wer den Schlüssel hat, umgeht ohnehin jeden Zeilenschutz — er liegt nur bei den Edge Functions |
| Im privaten Fenster des Browsers kein Vormerken (E49) | Gerät: dort gibt es keinen dauerhaften Speicher; der Schein geht nur mit Netz, ein Foto ohne Upload lässt sich weglassen |
| Mahnung: zwischen Nachsehen und Festhalten eingehende Zahlung (Stand 16.3) | Die Datenbank weist das Festhalten ab und die Meldung sagt es |
| Der Support sieht keinen Budgetstand und keine Buchungen (Stand 14.1) | Datenschutz und Rechte: Zeitbuchungen gehören nicht zum Support |
| Krankenstände und Sonderurlaub stehen nicht im Urlaubsverlauf (Stand 17) | Datenschutz: Gesundheits- und Familiendaten |
| Plattformkonto: Wiederherstellung bei Verlust von Telefon und Codes nur durch den Betreiber (Stand 12.1) | Sicherheit |
| Zweiter Faktor: Pflicht erst, wenn der Betrieb sie einschaltet (Stand 12.1) | Einstellung je Betrieb |
| DATANORM: „alles oder nichts“ je Block; 50.000 Zeilen dauern rund 17 Minuten (Stand 14.5) | Sicherheit: schneller ginge es nur ohne die Prüfung je Anweisung |
| Scheinlisten: Spalten ausgeschrieben, `scheinListen.test.ts` hält sie gegen die Tabelle (Stand 14.3) | Technisch: PostgREST kann keine Spalte ausnehmen; abgesichert durch die Prüfung |
| Zeilenschutz: fünf Prüfungen bleiben je Zeile (Stand 14) | Fachlich an der Zeile; kleine Tabellen |
| Laden und Zwischenspeicher: Stand bis zehn Minuten alt, Speicher je Tab, Startseite wartet auf ihren langsamsten Block (Stand 16) | Technisch, mit Messung belegt |
| Pauschale mit anderer Einheit gilt als Ware; Material aus dem Angebot nur ohne unterschriebenen Schein (Stand 12.2, 13) | Fachlich |
| Kundenart, PLZ-Erkennung ohne Kunden im Stamm (Stand 12.2) | Fachlich: ohne Stammdaten nur die Anschrift |
| Prüfwerkzeuge: axe misst Kontrast, Namen und Rollen, nicht Verständlichkeit; Messungen im gedrosselten Browser (Stand 18) | Grenze des Werkzeugs |
| Wisch-Schutz am iPhone: iOS verschiebt die Ansicht beim Öffnen der Tastatur (Stand 13) | Plattform |
| App-Zeichen bei 16 px (Stand 18) | Gestaltung, abgewogen |
| Runde Ecken nur an Favicon und Manifest-Icons; Apple-Touch- und maskierbares Icon randlos, ein schon installiertes Icon erneuert das System selbst (E43, 04.11.2026) | Plattform: iOS füllt durchsichtige Ecken schwarz, beide Systeme schneiden ihre Form selbst aus; der Icon-Zwischenspeicher liegt beim Gerät |
| `npm test` ohne Datenbanktests (offene Punkte C12) | Der Stapel läuft in der CI; im Handbuch benannt |
| Tailwind statt einer Klasse je Element (offene Punkte B10) | Ansicht für Ansicht, wenn sie ohnehin angefasst wird |
| Lange Namen brechen mitten im Wort in einem Browser ohne deutsches Trennwörterbuch (A16, 24.10.2026) | Die Trennregel gilt überall; das Wörterbuch bringt der Browser mit oder nicht — liegt beim Gerät |
| Der Rücklauf hält einen Stand beim Einspielen ganz im Speicher des Rechners, auf dem er läuft (N1, 24.10.2026; geprüft mit 288 MB) | Liegt beim Gerät: der Rücklauf läuft im Ernstfall auf dem Rechner eines Menschen, nicht im Projekt; Node bekommt mit `--max-old-space-size` mehr Speicher |
| „E-Mail an …“ (Bestellung, Angebot) öffnet das Mailprogramm; die App verschickt nichts an Kunden oder Großhändler und führt keinen Versandnachweis (Stand 24.5, Testbericht Runde 6, Hinweis 12) | Sicherheit und Betrieb: gesendet wird aus dem eigenen Postfach, damit Antworten und die gesendete Nachricht beim Betrieb liegen; die App hält keine Zugangsdaten zu diesem Postfach |
| Planlinie: Felder und Maßlinien ohne geladene Zahl fehlen — kein Schriftfeld auf Angeboten, Kunden, Material anfordern, Anforderungen, Einstellungen; keine Fassungsbuchstaben, „gültig bis“, Wartung „zuletzt → nächste“, Kunde Offen/Umsatz, Wochensummen der Planung, „Heute/Kommend“ der Zeiterfassung (Stand 26, E30) | Fachlich: Die Zahl wird heute nicht geladen. Sie zu laden wäre eine neue Abfrage, und die schließt der Auftrag aus (§ 7.8) |
| Stillstandsfrist (Stand 29, 01.11.2026): Schreibvorgänge (Speichern, Edge Functions, Hochladen) haben keine Frist | Sicherheit der Daten: ein abgebrochener Schreibvorgang ist auf dem Server womöglich schon geschehen; ein zweiter Versuch legte ihn doppelt an. Lesen und die Erneuerung der Sitzung haben eine Frist, und die hielten Schreibvorgänge bisher mit auf. Ausgenommen ist das Ausgangsfach (09.11.2026): jeder Vorgang darin ist wiederholbar gebaut (Kennung vom Gerät, `upsert`, nur aufgezählte Aufrufe und Eimer), deshalb bricht sein Sender nach 60 s (Hochladen: dazu die Zeit für den Inhalt bei 64 kbit/s) wirklich ab, der Vorgang bleibt liegen und geht in derselben Reihenfolge wieder hinaus — ein hängender Vorgang hält das Fach nicht mehr auf. Auch signierte Dateiadressen und Dateilisten (POST, schreiben nichts) haben seither die Lesefrist |
| Stillstandsfrist: steht die Erneuerung der Sitzung zweimal hintereinander still, kann der Anmeldedienst sie als wiederverwendet werten und abmelden (Stand 29) | Liegt beim Anmeldedienst: er erkennt so gestohlene Tokens (`refresh_token_reuse_interval`, 10 s). Der erste Wiederholungsversuch liegt innerhalb des Fensters; der schlimmste Fall ist neu anmelden statt endlos warten |
| Ein Seitenbaustein, der hängt, braucht ein Neuladen der App (Stand 29) | Liegt beim Browser: er merkt sich den hängenden Abruf eines Moduls und holt ihn nicht neu; die App lädt deshalb nach der Frist selbst neu |
| Raster und Blätter (Stand 30, E33): Fenster, Dialoge und das Blatt am Handy folgen dem Raster nicht | Fachlich: sie liegen über der Seite, ihre Lage bestimmt das Fenster |
| Ohne `ResizeObserver` (Browser vor 2020) liegen Blätter nicht auf den Pixel im Raster (Stand 30) | Liegt beim Gerät: jeder unterstützte Browser hat ihn; die Seite bleibt bedienbar |
| Kundenakte (Stand 34, E37): Zahlung, Mahnung, Storno und E-Rechnung über „In Rechnungen bearbeiten“, nicht im Fenster der Akte | Sicherheit der Daten: ein Weg zu Geld- und Belegständen, den Mahnlauf, Zahlungsabgleich und Rechnungskreis mitführen |
| Arztbesuch (Stand 33, E35): den Weg vom Arbeitsort rechnet die App nicht aus | Fachlich: Arbeitsort des Tages und Weg kennt nur die Person; das Büro prüft beim Bestätigen |
| Arztbesuch: auf der Startseite steht „Sonderurlaub“, nicht „Arztbesuch“ | Datenschutz: die Startseite nennt keinen Anlass; das Büro sieht ihn beim Bestätigen |
| Arztbestätigung nach „geprüft“ gelöscht, nur der Vermerk bleibt | Datenschutz: Gesundheitsdaten nur so lange wie nötig (wie jeder Nachweis zum Sonderurlaub) |
| Änderungsjournal (Stand 50, E53): Positionen von Angeboten und Rechnungen stehen nicht einzeln darin | Fachlich: das Speichern ersetzt sie als Ganzes; ein Journal je Zeile zeigte jedes Speichern als gelöscht und neu. Was eine Änderung bewirkt, steht in den Summen des Kopfes, und die sind protokolliert |
| Änderungsjournal: kein Eintrag für den Dienstschlüssel und für Arbeiten ohne Anmeldung (Rücklauf, Betriebslöschung, Migrationen, Skripte) | Es gibt niemanden, dem die Zeile zuzuschreiben wäre; der Rücklauf bringt das Journal aus der Sicherung mit, eigene Zeilen verdoppelten es |
| Änderungsjournal: vor dem 06.11.2026 nichts aufgezeichnet | Altdaten: was vorher geändert wurde, weiß niemand mehr; die erste Änderung zeigt den Stand davor als alten Wert |
| Änderungsjournal: der Verlauf eines gelöschten Objekts hat keine Akte mehr (außer gelöschten Zahlungen im Verlauf der Rechnung); er steht in der Datenbank für die Spitze und im Datenauszug | Fachlich: ein gelöschtes Objekt hat keine Seite, an der sein Verlauf stünde |
| Änderungsjournal: beim Löschen eines Kunden gehen die Werte und sein Name aus dem Journal, wer wann geändert hat, bleibt | Datenschutz (Art. 17 DSGVO) gegen Rechenschaft (Art. 5 Abs. 2): die Kennung belegt die Löschung |
| Papierkorb (Stand 51, E54): die Frist löscht nichts von selbst, sie nennt das Abgelaufene und leert es auf einen Handgriff | Sicherheit: Fotos lassen sich nur über die Speicher-Schnittstelle löschen, ein nächtlicher Lauf bräuchte einen eigenen Dienstzugang; Entwürfe zu vernichten entscheidet ein Mensch |
| Papierkorb: bei vor dem 06.11.2026 verworfenen Scheinen ist der Zeitpunkt unbekannt, die Frist zählt ab diesem Tag | Altdaten: der Zeitpunkt wurde nie gespeichert; geraten wird nichts |
| Der Support löscht Angebotsentwürfe nicht endgültig (E54) | Sicherheit: Löschen ist endgültig; wie beim Schein (E42) |
| Wartung auf der Rechnung (Stand 52, E55): Rechnungen von vor dem 06.11.2026 tragen keine Wartungsabdeckung; die Vorschau erkennt sie am Text, die Datenbank zählt sie nicht | Altdaten: nachtragen hieße, Belege in der Produktion umzuschreiben |
| Wartung: ein schon verrechneter, eingeplanter Durchgang, der beim „Erledigt“ bewusst auf eine andere Baustelle eingetragen wird, wird dort wieder vorgeschlagen | Fachlich: welchen Durchgang eine Rechnung der ersten Baustelle meinte, steht nirgends; die Entscheidung trifft das Büro beim Eintragen |
| Annahme per Link (Stand 53, E56): kein QR-Code | Der Link ist kopierbar und mailbar; ein QR-Baustein hieße eine neue Bibliothek nur dafür, ohne dass ein Ablauf fehlt |
| Annahme per Link: Rate-Limit je Link, nicht je Abrufer | Sicherheit: die Adresse des Abrufers ist hinter dem Netzwerk nicht verlässlich bestimmbar; ein Zähler je falschem Schlüssel schriebe bei jedem Rateversuch eine Zeile |
| Annahme per Link: Öffnungen nur gezählt (erstes, letztes, Anzahl), ohne IP und Gerät | Datenschutz (U05, Datensparsamkeit) |
| Annahme per Link: Versand aus der App erst mit M14 | Liegt beim Betreiber: SMTP-Zugang als Secret der Edge Function; bis dahin Kopieren und Mail-Programm |
| Kataloge mehrerer Großhändler (Stand 54, E57): EAN und Preiseinheit aus DATANORM sind nicht gegen echte Dateien geprüft | Liegt beim Pilotbetrieb: DATANORM-Dateien realer Großhändler (Nachweisregister) |
| Kataloge: ein Artikel ohne Preiszeile bekommt keinen Lieferantenartikel | Altdaten: von welchem Großhändler er stammt, wurde nie gespeichert; geraten wird nichts |
| Kataloge: von den Entscheidungen zu einem Lieferantenartikel steht nur die jüngste (wer, wann) | Fachlich: der Katalog ist Stammdatum ohne Akte, das Änderungsjournal führt Geschäftsobjekte; die gültige Zuordnung ist belegt |
| Lagerorte (Stand 55, E58): Kennzeichen an Zeitbuchungen vor dem 07.11.2026 werden keinem Fahrzeug zugeordnet, sie stehen nur als Vorschlag da | Altdaten: der Freitext ist nicht eindeutig; geraten wird nichts |
| Lagerorte: an weiteren Orten gibt es keine Reservierung | Fachlich: dort ist frei, was liegt; die Ware im Fahrzeug steht der Rüstliste dieses Fahrzeugs zur Verfügung |
| Lagerorte: Umlagern ohne Bestand am Quellort geht nicht, auch nicht mit Übersteuerung | Fachlich: eine Umlagerung bewegt Ware; was nicht da ist, wird am Ort gezählt (Inventur), nicht negativ gebucht |
| Auftragseingang (Stand 56, E59): kein Import aus Portalen von Hausverwaltungen oder Versicherungen | Liegt beim Auftraggeber bzw. Pilotbetrieb: Formatbeschreibung bzw. Beispieldateien fehlen (Nachweisregister) |
| Auftragseingang: Angaben zu einem noch nicht angelegten Kunden stehen nicht in dessen Datenauskunft | Datenschutz: über den Namen allein träfe die Auskunft Namensvettern; der Eingang lässt sich löschen oder zum Kunden machen |
| Auftragseingang: der Vorsatz „EG“ der Eingangsnummer ist nicht einstellbar | Fachlich: die Nummer ist intern und steht auf keinem Beleg, PDF oder Export |
| Bestellvorschläge (Stand 57, E60): keine Rundung nach einer Verpackungseinheit aus DATANORM | Liegt beim Pilotbetrieb: der Leser ist nicht gegen echte Dateien geprüft (Nachweisregister); die Verpackungseinheit wird am Artikel gepflegt |
| Bestellvorschläge: Sollbestand am Artikel, nicht je Ort | Fachlich: reserviert und bestellt wird gegen das Hauptlager; ein Fahrzeug füllt man durch Umlagern |
| Materialbereitschaft: „bestellt“ ist bis M05a, was die Einkaufsliste als bestellt führt, mit ihrem Liefertermin | Fachlich: Bestellbelege mit bestätigtem Termin kommen mit M05a |
| Zeitfelder (Stand 58, E61): nur bei Anwesend und Zeitausgleich | Fachlich und Datenschutz: die übrigen Stände entstehen über Meldung oder Antrag; zum Krankenstand gehören keine Zusatzangaben |
| Zeitfelder: eine verrechnete Buchung nimmt keine Angaben mehr an, auch keine Nachpflege | Fachlich: die Rechnung ist gestellt; erst stornieren |
| Zeitfelder: Aufteilen und Einfügen kopieren keine Werte, der abgetrennte Teil zeigt „Nachpflege“ | Fachlich: kopierte Kilometer oder Mengen stünden doppelt da |
| Zeitfelder: Freitext in einem Feld wird bei der Löschung eines Kunden nicht gefunden | Datenschutz: über den Namen allein träfe es Namensvettern — wie beim Kommentar der Buchung |
| Liegenschaften (Stand 59, E62): freie Beteiligte (ohne Kundenstamm) haben keine eigene Datenauskunft | Datenschutz: über den Namen allein träfe es Namensvettern; sie lassen sich entfernen (echte Löschung, Journal geleert) oder zum Kunden machen |
| Liegenschaften: keine abweichende Rechnungsanschrift je Rechnung | Fachlich (Befund 4): eine Rechnung geht an den Kunden der Baustelle; Sammelrechnung kommt mit M13 |
| Nachrichten (Stand 61, E64): keine Ende-zu-Ende-Verschlüsselung | Sicherheit/Technik: Schlüssel über mehrere Geräte, Vormerkung ohne Netz, Push-Vorschau, Meldeweg und Löschfristen schlössen sie aus; vertraulich ist das Gespräch gegenüber Betrieb, Kollegen, Support und Plattform, die App behauptet nirgends mehr |
| Nachrichten: ein Rücklauf aus der Sicherung bringt keine privaten Gespräche zurück | Datenschutz: die Führung lädt Sicherung und Auszug herunter; private Gespräche gehören den Teilnehmern. Die Sicherung der Datenbank durch den Betreiber bleibt unberührt |
| Nachrichten: ob eine Betriebsvereinbarung nötig ist | Liegt beim Betrieb (Betriebsrat, Kanzlei; ArbVG §§ 96, 96a); die App weist beim Einschalten darauf hin und verzichtet auf Lesebestätigung, Online-Status und Auswertung |
| Nachrichten: bei ganz ausgeschaltetem Modul ist die Seite zu | Fachlich: aus heißt aus (wie bei jedem Modul); nichts wird gelöscht, jeder exportiert seine Gespräche unter Mein Konto, nach dem Wiedereinschalten ist alles da |
| Nachrichten: höchstens 20 000 Zeichen je Nachricht, 25 MB je Datei | Technik: Verlauf, Push und Auszug bleiben handhabbar; längere Texte gehen als Datei; dieselbe Dateigrenze wie bei den Baustellendokumenten |
| Nachrichten: ein neues Gespräch braucht Netz | Technik: die Kennung des Gesprächs vergibt der Server (ein Paar hat genau eines); Nachrichten in bestehenden Gesprächen gehen ohne Netz |
| Nachrichten: Aufgaben-Threads | Fachlich: kommen mit den Aufgaben (B05, eigenes Paket); der Thread hängt an der Baustelle |
| Liegenschaften: die Akte zeigt je Liste höchstens 100 Baustellen bzw. Wartungen | Fachlich: die Akte ist ein Überblick; greift die Grenze, sagt sie es |

## X – Liegt bei jemand anderem

| Punkt | Bei wem |
|---|---|
| Datum der Stornobuchung, Kontenrahmen, Lücke im Rechnungskreis vor 25.09., VIES als Nachweis, Löschen nach sieben Jahren (offene Punkte A9, D4–D6, D9) | Steuerberatung |
| BMD-Stapel vorgebaut bis zum Importtest (offene Punkte C4, D7) | Kanzlei |
| Datenschutzerklärung, Impressum, Kalender-Abo (offene Punkte D8, D10) | Anwalt |
| Rechtstexte: antwortet die Datenbank nicht, zeigt die Seite eine Fehlermeldung mit „Erneut versuchen“ statt eines mitgelieferten Textes (E45, 04.11.2026) | Rechtlich: ein mitgelieferter Text wäre irgendwann ein veralteter Rechtstext — schlimmer als eine ehrliche Meldung |
| Rechtstexte: ob jemand den Hinweis „Datenschutzerklärung geändert“ gesehen hat, merkt sich nur sein Gerät; auf einem zweiten Gerät erscheint er noch einmal (E45) | Datenschutz: wer welchen Hinweis gelesen hat, wäre ein neues Datum über jede Person, das niemand braucht |
| Rechtstexte: die Kenntnisnahme neuer Unterauftragsverarbeiter steht am Betrieb mit Zeitpunkt, nicht mit Person (E45) | Datenschutz: für die Information nach Art. 28 Abs. 2 DSGVO genügt, dass der Betrieb sie bekommen hat |
| Rechtstexte: ob ein Text rechtlich stimmt, prüft die App nicht; sie prüft Form, Platzhalter und offene Angaben (E45) | Liegt beim Anwalt — dafür „rechtlich geprüft von …“ |
| Auftragsverarbeitungsvertrag: noch nicht in der App, wird außerhalb geschlossen (E45, Roadmap 11.2 Punkt 8) | Entscheidung des Auftraggebers vom 04.11.2026: „vorerst auf die Roadmap“ |
| Aliquoter Urlaub, Mahnspesen an Private, Arztbesuch im Kollektivvertrag (offene Punkte D1, D2, D11) | WKO |
| Safari/iPhone, Kamera, Push, Installation am echten Gerät (offene Punkte C15, Prüfbericht 4 und 6); die volle CSP ist seit 27.10.2026 durchgesetzt (Stand 24.6) | Gerätedurchgang |
| Gleitzeitvereinbarung (Kernzeit) beim Arztbesuch: das Büro rechnet mit Grund an (Stand 33) | Betrieb |
| Externer Sicherungsort, Wiederherstellung im Zielsystem (SMTP über `office@senklot.at` und die Domain `app.senklot.at` stehen seit 05.11.2026), Einstellungen des gehosteten Projekts (Prüfbericht 4, Stand 14.7 Punkt 14) | Betrieb bzw. Zugang zum gehosteten Projekt |
| Schutz gegen geleakte Passwörter, Ratenbegrenzung, Sitzungsdauer im gehosteten Projekt (Sicherheitsprüfung 27.10.2026, Werte in `docs/DEPLOYMENT.md`) | Zugang zum gehosteten Projekt |
| Angriffsversuche gegen das gehostete Projekt, Wertebereiche einzelner Zahlenfelder (`docs/sicherheitspruefung-2026-10-27.md`, Abschnitt 4) | externer Sicherheitstest |
| Angebotsliste unter Windows bei 1.570 × 700 px (offene Punkte C14) | Wieder aufnehmen mit Bildschirmfoto |

## E – Inzwischen erledigt (Doku nennt sie noch)

| Grenze (Fundstelle) | Erledigt durch |
|---|---|
| Kataloge laden höchstens 1.000 Artikel (Stand 14.1) | T-3, Abschnitt 23 |
| Durchrechnungszeitraum nicht einstellbar (Stand 15.3) | Einstellung „Durchrechnungszeitraum“ (17–52 Wochen) in den Lohnregeln |
| Gesamtsaldo erst beim Öffnen einer Person (Stand 21) | T-2 |
| Buchhaltung sieht die Rechnungssperre nicht auf ihrer Startseite (Stand 13) | Stand 17, Punkt E |
| Baustelle mit nur Lehrlingsstunden zum Satz 0 bleibt gelistet (T-18) | T-20 |
| Anforderungen ohne Abholdatum (T-19) | T-20 |
| Abgleich Schein ↔ Ausgabe am Artikelnamen (T-19, T-21) | T-22 |
| Preis auf der Rechnung über den Namen (T-22) | T-26 |
| Prüfungen, die an bestimmten Tagen rot würden (T-23) | T-25 |
| A1 Belege mit den heutigen statt den damaligen Firmendaten (Stand 15.9) | T-28 |
| A2 Mahnung ohne die Person, die gemahnt hat (Stand 15.9) | T-29 |
| A3 Ausgangsbuch ohne den Tag der Ablöse (Stand 15.4) | T-30 |
| A4 Retoure auf dem Namen des Lagers statt des Monteurs (T-16) | T-31 |
| A5 Stichtag: Schein als Ganzes nach seinem Datum statt je Zeitzeile (T-17) | T-32 |
| A6 Teilzeit-Mehrarbeit: Vollzeit eines Tages immer ein Fünftel der Woche (T-1) | T-33 |
| A7 Jugendschutz: Geburtsdatum erst in der Akte, nicht bei der Anlage (Stand 12.3) | T-35 |
| A8 Jugendschutz-Hinweis auf der Startseite nur bei der Rolle Mitarbeiter (Stand 12.3) | T-36 |
| A9 Jugendschutz: Lage der kürzeren Tage (§ 11 Abs 2 KJBG) und Wegzeit Schule–Betrieb (§ 11 Abs 7) nicht geprüft (Stand 12.3) | T-37 |
| A10 Zeit teilen: über Mitternacht nicht möglich (Stand 15.6) | T-38 |
| A11 Zeit einfügen: nur beim Anlegen und nicht über Mitternacht (Stand 15.10) | T-39 |
| A12 Firmenbuch nur an der Rechtsform im Namen erkannt (Stand 12.2) | T-40 |
| A13 Belegarchiv (ZIP) über viele Jahre im Speicher des Browsers (Stand 15.5) | T-41 |
| A14 Dokumentlinks bis zum Ablauf ihrer Stunde nutzbar, auch nach „nur Büro“ (Prüfbericht 13.10, Punkt 7) | T-42 |
| A15 Sonderurlaub nur mit eingeschaltetem Modul Urlaub (Stand 10.3) | T-43 |
| A16 Silbentrennung in den Tagesspalten — galt schon (geerbt von `index.css`), jetzt dauerhaft geprüft (Stand 13 G4, 15.2) | T-44 |
| N1 Sicherung über 256 MB nicht geprüft (Stand 14.6) — geprüft mit 288 MB; dabei Speicher- und Rechenzeitgrenze der Function gefunden und behoben | T-45 |
| N2 Absturz mit voller Wiederherstellung nicht durchgespielt (Prüfbericht 13.10, Punkt 5) — durchgespielt, bestanden (`scripts/absturzprobe.mjs`) | T-46 |
| N3 Tablet quer dauerhaft nur an einer Karte geprüft (Stand 18, K3) — die Wege des Monteurs laufen jetzt auch bei 1194 × 834 | T-47 |

## Wie es weitergeht

Die Abkürzungen A1–A16 und die Nachweise N1–N3 wurden je Thema in einem
eigenen PR gebaut, in der Reihenfolge der Tabelle, jeder mit Prüfungen samt
Gegenprobe, Handbuch und Stand; am 24.10.2026 abgeschlossen. Was bleibt,
steht unter B, jeweils mit seinem Grund. Eine neue Grenze kommt nach
Grundsatz 6 nur mit Grund dorthin — sonst wird sie gebaut.


## M06 — bestätigte fachliche Grenze (08.11.2026, E63)

Zusätzliche Zeitmodelle, Durchrechnung und lohnwirksame Zulagen (Z02/Z03) sind
nicht fachlich freigegeben. Laut nachgereichter geprüfter Bauplanung und
Nachweisregister fehlen konkrete KV-/WKO-Regeln bzw. Betriebsvereinbarungen.
Eine frei erfundene Formel oder automatische Neuberechnung alter Salden wäre
fachlich falsch. Normalarbeitszeit bleibt wie heute; N01 dokumentiert und exportiert
frei benannte Merkmale, ohne sie als rechtlich geprüfte Lohnart auszugeben.
Der Betreiber wurde nach den maßgeblichen Fundstellen gefragt. Diese externe
Voraussetzung blockiert nur M06e, nicht die fertigen Buchungs- und Verwaltungswege.

Die Standardfelder ändern weder Datentypen noch Bedeutung für Budget/Abrechnung.
Person, Tag, Stand, Arbeitszeit/Pause und automatische Nachtberechnung sind
notwendige Grundlagen; ihre Freigabe als beliebige optionale Textfelder würde
korrekte Arbeitszeitaufzeichnungen verhindern. Zusatzangaben sind schaltbar,
vorhandene Werte bleiben erhalten. Keine Grenze nach Betriebsgröße oder Aufwand.

## Startseite selbst einrichten — begründete Grenze (09.11.2026, E68)

Jede Person wählt die Zahlen oben (höchstens vier, eigene Folge) und blendet
Bereiche und Themen unter „Zu erledigen“ aus. **Fest bleibt die Reihenfolge
der Bereiche und der Themen** — Grund fachlich: die Themen ordnet die
Dringlichkeit (Dringend, Heute, Diese Woche), die Bereiche die Linie „Lot“
(Zu erledigen links, Tagesüberblick rechts); eine freie Folge stellte
Weniger-Dringendes vor Überfälliges. Ausgeblendetes geht nie still verloren
(eine Zeile mit der Zahl, ein Tipp zeigt es), und Warnungen zum Zustand der
App lassen sich nicht ausblenden — Grund Sicherheit: ein ausstehender
Nachtlauf darf nicht wegzuklicken sein.

## Push bis zur Anzeige — begründete Grenzen (09.11.2026, E69)

- **„Google hat angenommen“ heißt nicht „erschienen“.** Ob das Telefon eine
  Meldung zeigt (Mitteilungen für Senklot erlaubt, Fokus, „Nicht stören“),
  entscheidet das Gerät, und eine Web-App kann es nicht abfragen. Die
  Probemeldung in „Mein Konto“ nennt Googles Antwort und sagt das dazu.
  Grund: liegt beim Gerät.
- **Auf dem iPhone erscheint eine Nachricht auch im Gespräch selbst**, ohne
  Ton. Grund: iOS verlangt zu jeder Push-Nachricht eine Anzeige und entzieht
  sonst das Abonnement (liegt beim Gerät).
- **Geteiltes Gerät:** Wer sich anmeldet, bekommt die Meldungen dieses Geräts,
  solange es nicht ausdrücklich abgeschaltet wurde. Grund: die Erlaubnis des
  Browsers gilt für das Gerät, nicht für eine Person. Die Meldungen der
  vorigen Person kommen nicht an: das Abmelden meldet sie ab.
- **Geräte von vorher, deren Abonnement iOS schon entzogen hat**, werden
  nicht still wieder angemeldet: von einem Gerät, auf dem jemand die
  Meldungen abgeschaltet hat, sind sie nicht zu unterscheiden. „Mein Konto“
  zeigt dort jetzt ehrlich „bekommt noch keine Meldungen“; einmal
  „Auf diesem Gerät einschalten“ genügt. Grund: Datenschutz — wer
  abgeschaltet hat, bleibt aus.

- **„from Senklot“ unter dem Absender (iPhone, 11.11.2026, E80).** iOS
  setzt bei jeder Web-App vom Home-Bildschirm die Zeile „from“ und den Namen
  der App unter den Titel einer Meldung; eine Web-App kann sie weder
  entfernen noch übersetzen. Seit iOS 18.5 steht dort nur noch das englische
  „from“ (davor „von“) — ein Fehler bei Apple. Der Rest der Meldung ist
  gebaut wie bei WhatsApp: fett der Absender (in Runden die Runde), darunter
  der Text. Grund: liegt beim Gerät; wegfallen würde die Zeile nur mit einer
  eigenen App aus dem App Store.

## Durchsicht der Abläufe — begründete Grenzen (09.11.2026, E70)

- **Verbuchte Anforderungen aus der Zeit vor dem Bewegungsprotokoll
  (30.09.2026) lassen sich ohne Beleg nicht löschen.** Gelöscht wird eine
  verbuchte Anforderung oder Retoure nur über „löschen“ in der App, und
  dabei wird ihre Bestandswirkung aus dem Bewegungsprotokoll zurückgebucht.
  Steht zu einer Zeile keine Bewegung im Protokoll und wurde sie angelegt,
  bevor das Protokoll des Betriebs lief, ist ihre Wirkung nicht belegt.
  Grund: Altdaten — eine geratene Gegenbuchung wäre falsch; den Bestand
  korrigiert dann die Inventur. Eine später angelegte Zeile ohne Bewegung
  (abgeholt bei leerem Regal) hat nichts gebucht und löscht sich ohne
  Gegenbuchung (Nachtrag 09.11.2026).
- **Was abgerechnet ist, wird weder gelöscht noch zurückgesetzt.** Steht
  die Ausgabe auf einer Rechnung oder reicht ihr Abholtag bis zum Stichtag
  der letzten gültigen Rechnung der Baustelle, weist die Datenbank Löschen
  und „Status von Hand“ aus „Erledigt“ ab. Grund fachlich: die Rechnung ist
  ausgestellt; korrigiert wird über ein Storno. Eine verbuchte Anforderung,
  die vor der Rechnung zurückgesetzt wurde, gilt beim Löschen ebenfalls als
  abgerechnet, sobald eine Rechnung ihren Abholtag abdeckt — die Rechnung
  hält nicht je Zeile fest, was der Vorschlag enthielt; im Zweifel bleibt
  der Bestand, die Inventur korrigiert.
- **Die Fehlmenge einer schon eingeladenen Rüstliste und Buchungen an einem
  stillgelegten Ort löschen sich nicht.** Grund fachlich: ohne die
  Anforderung zählte die eingeladene Position wieder ganz (Lager und
  Rechnungsvorschlag stimmten nicht mehr); an einem stillgelegten Ort läge
  die zurückgebuchte Ware, wo sie niemand sieht. Die Meldung nennt den Weg
  (Einladen am selben Tag zurücknehmen bzw. Retoure; den Ort wieder in
  Betrieb nehmen).
- **Gelöscht wird die Ausgabe, nicht der Wareneingang.** Wurde Ware „beim
  Abholen geliefert“, liegt sie nach dem Löschen der Anforderung im Lager.
  Grund fachlich: der Eingang ist geschehen, nur die Ausgabe an die Baustelle
  wird zurückgenommen.
- **Ausgelaufene Artikel mit Restbestand bleiben anforderbar.** Grund
  fachlich: der Rest im Lager soll aufgebraucht werden können; ohne Bestand
  bietet „Material anfordern“ sie nicht mehr an.
- **Kunde löschen, Rolle ohne Einblick in Angebote und Rechnungen
  (Verwaltung):** die Meldung nennt die Art, an der die Datenbank scheitert,
  aber keine Anzahl. Grund: Datenschutz und Zeilenschutz — die Rolle sieht
  diese Belege nicht und soll auch ihre Zahl nicht erfahren.
- **Nachrichten, Restfall beim Löschen:** wer einem Baustellen-Thread folgt,
  die Baustelle aber zeitweise nicht sieht, und eine Nachricht aus genau
  dieser Zeit wird später gelöscht, kann eins zu viel abgezogen bekommen
  (nie unter null). Grund Skalierung: es zu schließen hieße, bei jeder
  Thread-Nachricht die Zeile jedes nicht sehenden Folgenden zu schreiben.
  Der Zähler stimmt wieder, sobald die Person den Thread liest.
- **Urlaubseinträge, die früher durch zwei gleichzeitige Entscheidungen
  doppelt entstanden sind,** werden nicht umgeschrieben. Grund: Altdaten in
  der Produktion bleiben, wie sie sind; die Zeitübersicht zeigt solche Tage
  als „doppelt gebucht“, das Büro löscht den überzähligen Eintrag.
- **Nach „Als Schlussrechnung stellen“** werden die Positionen nicht
  selbsttätig neu zusammengestellt. Grund fachlich: die Art bestimmt, woraus
  die Positionen entstehen; eine stehengebliebene Vorschau gehörte zur alten
  Art. Derselbe Ablauf wie bei der Auswahl der Art.

## Zweite, unabhängige Durchsicht — begründete Grenzen (09.11.2026, E70 Nachtrag)

- **Mahnkosten einer Mahnung vor dem 10.10.2026:** ein Eingang „Mahnspesen
  und Zinsen“ ist dort nur bis zu den Mahnspesen am Mahnstand möglich. Grund:
  Altdaten — die Zinsen dieser Mahnungen sind nicht gespeichert; jüngere
  Mahnungen halten sie als Zahl fest.
- **Ein Anzahlungskonto ohne Steuersatz gilt im BMD-Stapel für 20 %.** Für
  Übergang der Steuerschuld und 0 % legt der Betrieb im Kontenrahmen ein
  eigenes Konto an; fehlt es, nennt der Stapel das Konto und entsteht nicht.
  Grund: Altdaten — so war das eine Konto bisher gemeint, und eine geratene
  Zuordnung buchte falsch.
- **Deaktivierte Personen ohne Austrittsdatum:** Übersicht, Fenster und CSV
  zeigen ihre Stunden, aber kein Soll und keinen Saldo. Grund: Daten — ohne
  den letzten Arbeitstag wäre das Soll eines Teilmonats geraten, und eine
  falsche Zahl in der Lohnverrechnung ist schlimmer als eine leere. Seit E87
  (13.11.2026) gibt es das Austrittsdatum; mit ihm rechnen Soll und Saldo bis
  zum letzten Tag. Konten, die vorher deaktiviert wurden, bekommen es nicht
  von selbst (Altdaten): der Betrieb trägt es in der Akte nach.
- **Resturlaub beim Austritt:** steht bei Ausgeschiedenen nicht da. Grund:
  liegt bei der Lohnverrechnung (Kanzlei) — die Ersatzleistung für nicht
  verbrauchten Urlaub (§ 10 UrlG) rechnet sie aliquot mit dem Entgelt; eine
  zweite Rechnung in der App stünde neben ihrer und widerspräche ihr.
- **Ein wieder geöffneter Eingang verliert die Verbindung zum verworfenen
  Angebot.** Das Journal hält den Wechsel des Stands, nicht den Verweis.
  Grund fachlich: der Verweis auf das Angebot ist seit M02b vom Journal
  ausgenommen — derselbe Zustand wie nach dem endgültigen Löschen eines
  Entwurfs.
- **Die Verwaltung sieht beim Eingang nicht, dass sein Angebot im
  Papierkorb liegt,** und damit auch „Wieder öffnen“ nicht; Führung und
  Buchhaltung sehen beides. Grund: Rechte — die Verwaltung liest keine
  Angebote.
- **Offene Korrekturanträge bei ausgeschaltetem Schalter** stehen nicht auf
  der Startseite, bleiben aber unter „Zeiterfassung“ abschließbar. Grund
  fachlich: ein ausgeschaltetes Modul meldet sich nicht auf der Startseite.
- **Arbeitszeit am Tag eines alten Arztbesuchs, die ihn überschneidet,**
  lässt sich in der Uhrzeit nicht mehr ändern (die Maske verhinderte das
  schon vorher). Grund: Altdaten — die Überschneidung stammt aus der Zeit vor
  der Prüfung und wird nicht umgeschrieben.
- **Fassungswechsel, einmal je Gerät:** eine noch laufende App von vor dieser
  Auslieferung kennt die neue Frage an den Worker nicht und kann bei sehr
  zähem Netz noch einmal hart räumen. Grund: liegt beim alten Code auf dem
  Gerät; ab dieser Fassung tritt es nicht mehr auf.
- **Einsatz über mehrere Tage: höchstens 62 Tage je Speichern** (E85).
  Grund fachlich: so weit reicht die Prüfung der Abwesenheiten
  (`wochenplan_abwesend`); darüber wüsste sie nichts mehr.
- **Die Rüstliste entsteht an den Folgetagen nicht von selbst** (E85); eine
  vorhandene bekommt die neue Mannschaft. Grund fachlich: Material wird
  einmal geladen und verbaut, an jedem Tag stünde es doppelt angefordert.
- **Push bei geändertem Einsatzplan nur für heute und morgen** (E85). Grund
  fachlich: spätere Tage stehen im Plan; eine Wochenplanung meldete sich
  sonst je Tag.
- **Mehrere Tage und Kopieren nicht im Einblick des Supports** (E85), der
  einzelne Tag schon. Grund: Datenschutz — die Abwesenheiten der Belegschaft
  liest nur der Betrieb; ohne sie würde still jemand im Urlaub eingeteilt.
- **Umplanen per Ziehen nur in der Sicht „Personen“, nicht im Monat und
  nicht am Handy** (E88). Grund fachlich: in „Baustellen“ ist ein Block die
  ganze Mannschaft eines Tages (ob jeder mitgeht, ist je Person zu
  entscheiden), der Monat zeigt Balken über Tage, am Handy steht ein Tag als
  Liste — dort plant die Leiste am Einsatz um.
- **Umplanen auf einen Feiertag wird abgewiesen, auch für Notdienst** (E88).
  Grund: Sicherheit — eine Geste soll dort nicht still landen; bewusst geht
  es über „Einsatz planen“.
- **Entfernen aus dem Wochenplan mit Rückfrage, ohne „Rückgängig“** (E88).
  Grund: Daten — die Zeile ist danach weg; sie wiederherzustellen hieße,
  einen inzwischen vielleicht umgeplanten Einsatz samt Meldung neu anzulegen.
- **Umplanen nicht im Einblick des Supports** (E88). Grund: Datenschutz, wie
  bei „mehrere Tage“ (E85).
- **Menge in der Materialliste unter 390 px unter dem Namen** (E89). Grund
  fachlich: drei Tippflächen von 44 px und der Name passen dort nicht
  nebeneinander; kleinere wären mit Handschuhen nicht zu treffen.
- **Zuletzt angefordert nur Katalogartikel aus den letzten hundert eigenen
  Anforderungen** (E89). Grund fachlich: mehr lädt die Seite nicht, und eine
  frei getippte Anforderung hat keinen Artikel, den die Liste wiederfände.
- **Am Schein nur das selbst Abgeholte der letzten vierzehn Tage** (E89).
  Grund: Datenschutz (fremde Anforderungen liest ein Monteur nicht) und
  fachlich (Älteres stand meist auf einem früheren Schein).
- **„Beim Händler mitgenommen“ nicht bei abholbereiter oder bestellter
  Ware** (E89). Grund fachlich: dann kam sie nachweislich über den Betrieb.
- **Paket 7 nur am Handy, Tablet und Schreibtisch unverändert** (E90). Grund
  fachlich: dort hat das Formular neben den Einträgen Platz; so freigegeben.
- **Ein Timer-Schritt nach dem anderen** (E90). Grund fachlich: ein zweiter,
  solange der erste unterwegs ist, träfe eine Sitzung, die der Server noch
  nicht kennt — der Doppeltipp ist der häufigere Fall.
- **Ohne Medienabfrage bleibt das Zeitformular auf der Seite** (E90). Grund:
  Gerät — ohne sie ist die Breite nicht zu erfragen.
