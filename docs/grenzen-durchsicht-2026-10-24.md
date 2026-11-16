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
  der Bestand, die Inventur korrigiert. **Seit Welle 2 (M2, 15.11.2026)
  geändert:** eine neue Rechnung hält je Ausgabe fest, was ihr Vorschlag
  enthielt; abgerechnet ist, was sie trägt. Die Regel über den Abholtag gilt
  nur noch für Rechnungen von davor, und auch dort nur für Ausgaben, die es
  beim Anlegen schon gab (Altdaten).
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
- **Scheine ohne eigene Nummer, auch in der Suche** (E91). Grund fachlich:
  ein Schein ist über Baustelle und Tag bestimmt; eine Nummernvergabe wäre
  ein neuer Nummernkreis auf einem unterschriebenen Beleg und liegt beim
  Auftraggeber.
- **Personen in der Suche nur mit der Benutzerverwaltung** (E91). Grund:
  Datenschutz — ohne sie gibt es keine Akte, in die ein Treffer führt.
- **Die Projektleitung öffnet eine gefundene Rechnung nicht im Fenster**
  (E91). Grund fachlich (M38): ihre Liste ist eine Leseliste; der Treffer
  führt in die auf die Nummer gefilterte Liste.
- **Rasterprüfung lokal nur je Breite** (E91). Grund: Gerät — in der
  Cloud-Umgebung lädt Chromium nach rund 40 Seitenwechseln in einem Tab die
  Module des Entwicklungsservers nicht mehr; in der CI läuft der Weg am
  Stück.

## Designlinie V10 — begründete Grenzen (13.11.2026, E92)

Der Auftrag V10 ändert die Gestalt, nicht Funktion, Recht, Ablauf oder
Datenlogik. Was die Mappe zeigt, aber nur mit einer Änderung am Ablauf ginge,
bleibt deshalb stehen — mit Grund:

- **Akten am Schreibtisch nicht neben der Liste** (Mappe: „Liste links, Akte
  rechts“ für Baustellen, Kunden, Angebote, Eingang). Grund fachlich: die
  Akten sind eigene Seiten mit eigener Adresse, Rückweg und Reitern; ein
  geteiltes Layout änderte Navigation und Ablauf und braucht eine eigene
  Entscheidung des Auftraggebers.
- **„Meine Baustellen“ bleibt ein Blatt je Baustelle.** Grund fachlich:
  Monteure haben keine Akte; das Blatt trägt alle Vor-Ort-Angaben, kompakte
  Zeilen bräuchten einen neuen Ort zum Aufklappen.
- **Monat bleibt Personen × Tage, „Mein Einsatzplan“ und die Zeiterfassung
  behalten ihren Aufbau** (Mappe S. 17, S. 18, Zeit mit Reitern). Grund
  fachlich: die Mappe ist Orientierung; ein Umbau änderte, was die Seiten
  zeigen und wie man sie bedient.
- **Keine Kennzahlenzeile in den Anforderungen** (Mappe S. 20: Offen,
  Abholbereit, Bestellwert). Grund fachlich: „Bestellwert“ ist eine neue
  Auswertung, keine Gestalt.
- **Rechnungsliste ohne eigenes „Erneut versuchen“.** Grund: der Auftrag
  schließt Änderungen an der Ladelogik aus; die Liste meldet den Fehler, die
  Kennzahlen sagen „nicht geladen“, die offenen Forderungen laden mit
  „Erneut laden“ nach.
- **Der Zwischenspeicher der Woche merkt sich auch einen Stand ohne
  Abwesenheiten.** Beim nächsten Besuch steht kurz „keine Abwesenheit“, bis
  die frische Abfrage antwortet (schon vor V10 so). Grund: Ladeverhalten,
  nicht Gestalt; die Planung selbst zeigt einen Ladefehler jetzt als „frei
  unklar“.
- **Reaktionen im Chat bleiben die sechs Zeichen** (E77). Grund fachlich:
  sie sind Inhalt, keine Gestaltung.
- **Belege und Exporte unverändert** (Petrol in den PDFs, Prüfsummen
  `belegReferenz`). Grund rechtlich und fachlich: ausgestellte Belege müssen
  gleich bleiben; Druck folgt seinen Fachregeln.
- **Installierte App-Zeichen erneuert das Gerät selbst.** Grund: Gerät —
  iOS behält das Bild des Startbildschirms, bis die Verknüpfung neu
  hinzugefügt wird.
- **Geprüft in Chromium und nachgestellten Größen** (390, 834, 1194, 1440).
  Grund: Gerät — WebKit/Safari und echte iOS-/Android-Geräte gibt es in der
  Cloud-Umgebung nicht; das prüft der Betrieb.
- **Der Ablege-Flug der Planung ist statisch und im Bild geprüft, nicht im
  Komponententest.** Grund: Gerät — jsdom kennt kein Layout und kein
  `elementFromPoint`.
- **Der iPhone-Zeichenfehler der Warenkorb-Leiste (14.11.2026) ist lokal
  nicht nachgestellt.** Behoben mit eigener Zeichenebene und neu gesetztem
  Titel; geprüft im Komponententest, in Chromium (Bildvergleich vor und nach
  erzwungenem Neuzeichnen) und im CI-Projekt `webkit-premium` (iPhone 13,
  WebKit). Grund: Gerät — WebKit lässt sich in der Cloud-Umgebung nicht
  installieren, und ein echtes iPhone gibt es dort nicht; den letzten Blick
  am Gerät macht der Betrieb.
- **Im Änderungsprotokoll Ausgeblendetes gilt nur auf diesem Gerät**
  (14.11.2026). Grund Datenschutz: wer welche Änderung gesehen hat, wäre ein
  neues Datum über jede Person, das der Betrieb auswerten könnte — dieselbe
  Abwägung wie beim Datenschutz-Hinweis. Ausgeblendet ist nie gelöscht; die
  Aufzeichnung bleibt vollständig (Arbeitszeitaufzeichnung).
- **Am Handy liegt die rechte Kante eines Blatts nicht auf einer
  Rasterlinie** (14.11.2026). Grund fachlich: auf ganze Zellen gerundet stand
  ein Blatt bei 390 px links 16, rechts 38 px vom Rand; gleiche Ränder wiegen
  schwerer als die Linie. Oberkanten und Höhen hält der Takt weiter, ab dem
  Tablet auch die rechten Kanten.

## Durchsicht vom 15.11.2026, Paket 2 — begründete Grenzen

- **Die Anmeldung nennt ein gesperrtes Konto nicht** (K5). Grund Sicherheit:
  Supabase Auth meldet die Sperre (`user_banned`) schon vor der Prüfung des
  Passworts — gemessen am lokalen Anmeldedienst. Nennte die Maske sie, verriete
  sie jedem, dass es das Konto gibt. Sie sagt deshalb dasselbe wie bei falschen
  Zugangsdaten, mit dem Hinweis, dass der Zugang deaktiviert sein kann. Dass der
  Anmeldedienst die Sperre über seine Schnittstelle selbst verrät, liegt bei ihm
  (liegt bei jemand anderem).
- **Die nächtliche Sicherung enthält auch Meldungen über die Leitung** (K1).
  Grund Betrieb: Für einen Wiederanlauf muss sie vollständig sein; sie liegt nur
  bei der Plattform (Dienstschlüssel), kein Konto eines Betriebs liest sie.
- **Datenauskunft über eine meldende Person, erstellt von der gemeldeten
  Leitung, enthält deren Meldung nicht** (K1). Grund Datenschutz: Die Zusage,
  dass die gemeldete Person nichts erfährt, wiegt beim Erstellen der Auskunft
  durch genau diese Person schwerer; jede andere Leitung erhält die Auskunft
  vollständig. Ist der Gemeldete die einzige Leitung, warnt der Meldedialog
  vorher.
- **Der Dienstschlüssel umgeht die Löschsperre mit Grund am Artikel** (M1).
  Grund Betrieb: Das Löschen eines ganzen Betriebs und das tabellenweise
  Aufräumen laufen mit dem Dienstschlüssel und müssen durchgehen. Das
  Bewegungsprotokoll, Anforderungen und Rüstlisten hält trotzdem der
  Fremdschlüssel fest.
- **Keine Datenbanksperre für neue Anforderungen ausgelaufener Artikel** (M1).
  Grund fachlich: Ohne Netz vorgemerkte Anforderungen (Ausgangsfach) und
  „Fehlmenge anfordern“ aus früher geplanten Rüstlisten würden mitten im Ablauf
  scheitern. Die Regel steht in der Auswahl, wie bei Artikeln, die der Katalog
  auslaufen lässt.
- **Ein noch nicht neu geladenes Telefon druckt im Übergang den alten
  Skontobetrag** (G7). Grund Gerät: Bis die App neu geladen ist, rechnet sie
  mit der alten Rundung; die Datenbank hält den neuen Betrag fest. Höchstens
  1 Cent im Zahlungssatz an der Halbcent-Grenze.
- **Massenvorgänge nehmen die Sperre je Paar Tag/Baustelle nicht** (P1:
  Person löschen, Baustelle umnummern). Grund Betrieb: bei langen Baustellen
  wären es Hunderte Sperren in einem Vorgang; sie können die gemeinsame
  Sperrtabelle der Datenbank füllen und fremde Vorgänge scheitern lassen.
  Ein Speichern, das genau während eines solchen Vorgangs läuft, kann ihn
  übergehen; die Fassungsprüfung erkennt alles, was vorher geschrieben war.
- **Bis zum Neuladen löscht die alte App Einsätze ohne Sperre** (P1). Grund
  Gerät: Telefone laden die neue Fassung erst beim nächsten Öffnen; bis dahin
  löscht die alte direkt in der Tabelle.

## Durchsicht vom 15.11.2026, Welle 2 (Pakete 3–8) — begründete Grenzen

Gesammelt aus den Berichten der Pakete 3 bis 8 (Stand §98–§104). Grenzen, die
durch eine spätere Nacharbeit derselben Welle entfallen sind, stehen nicht
hier, sondern am Ende unter „Mit Welle 2 entfallen“.

### Paket 3: Planung und Scheine

- **Eine beim Umplanen zusammengeführte Rüstliste lässt sich beim
  Zurückplanen nicht wieder trennen** (P2). Grund fachlich: nach dem
  Zusammenführen ist die Herkunft der Positionen nicht mehr eindeutig;
  eine geratene Aufteilung wiese Material der falschen Mannschaft zu.
- **Beim Kopieren eines Einsatzes geht keine Rüstliste mit** (P2). Grund
  fachlich (E85): Material wird einmal geladen und verbaut; eine kopierte
  Liste stünde doppelt angefordert.
- **Die Projektleitung ohne Leserecht auf Rechnungen erfährt beim Storno nur,
  dass der Schein verrechnet ist, nicht auf welcher Rechnung** (P4). Grund
  Datenschutz und Rechte: Rechnungen liest sie nur mit der Freigabe „Darf die
  Rechnungen seiner Baustellen lesen“ (M38).
- **„Zeit nachtragen“ reicht 14 Tage zurück** (P6). Grund fachlich: weiter
  zurück ändert die Zeiterfassung über den Korrekturantrag, der eine
  Entscheidung braucht.
- **Das Gesamtplan-Abo der Leitung zeigt abwesende Personen weiter** (P9).
  Grund fachlich: die Planung muss sehen, wer eingeteilt ist, auch wenn die
  Person fehlt — nur so fällt der Konflikt auf. Das eigene Abo lässt ganztags
  abwesende Tage weg.
- **Die Push-Meldung zu einem Notfall nennt nur Nummer und Ort** (V8). Grund
  Datenschutz: die Meldung steht auf dem Sperrbildschirm; Kunde und
  Beschreibung stehen erst in der App.
- **Folgetage ändern oder entfernen steht nicht im Einblick des Supports**
  (V13). Grund Datenschutz: dafür braucht es die Abwesenheiten der
  Belegschaft, die nur der Betrieb liest (wie E85, E88).
- **Im Einblick des Supports wird „Neu eingegangen“ nicht als gesehen
  gemerkt** (V9). Grund Sicherheit: der Support schreibt nicht in den Betrieb
  (Trigger `support_schreibt_nicht`); die Zeile bleibt für den Betrieb, wie
  sie war.

### Paket 4a: Zeitkonto ab einem Tag und Monatsabschluss

- **Der Monatsabschluss sperrt Saldo-Start, Startwerte, Urlaubsanspruch und
  die Einstellung zum 24. und 31. Dezember nicht** (Z6). Grund fachlich: der
  Urlaubsanspruch gilt je Urlaubsjahr (etwa die sechste Urlaubswoche), die
  übrigen sind bewusste Berichtigungen des Büros. Ohne Modul
  Korrekturanträge bleibt dem Monteur nur das Wiederöffnen durch das Büro;
  das sagt die Einstellungskarte.
- **Die Austrittsübersicht erledigt nichts im Dialog, sie verweist** (Z2).
  Anträge, genehmigter Urlaub, Einsätze und Korrekturen nach dem
  Austrittstag werden über einen Link an ihrer Stelle erledigt (Urlaub
  kürzen oder zurücknehmen, Einsatzplanung). Grund fachlich: jede dieser
  Änderungen hat dort ihre Prüfungen, Rückfragen und Meldungen; ein zweiter
  Weg im Dialog müsste sie alle doppelt führen.
- **Am Verlauf von Arbeitszeit und Urlaubsanspruch steht kein Grund** (Z3).
  Grund Datenschutz: der Verlauf liegt an der Zeile `users`, die die
  Kollegen im Büro mitlesen; ein Freitext könnte dort Persönliches tragen.
  Wer wann geändert hat, steht dabei.
- **Gespeicherte Urlaubsanträge über einen Jahreswechsel werden nicht neu
  gerechnet** (Z3b). Grund Altdaten: die festgehaltene Tageszahl eines
  Antrags bleibt die Summe; neu verteilt wird nur die Zuordnung zu den
  Urlaubsjahren, mit den Arbeitstagen der jeweiligen Tage.

### Paket 4b: Urlaub, Offline, Exporte

- **Der Entwurf einer Buchung für eine andere Person** (das Büro bucht ohne
  Netz für jemanden) öffnet nicht in der eigenen Zeiterfassung (Z4). Er
  steht mit Person und Grund da und wird in der Mitarbeiterübersicht neu
  erfasst. Grund fachlich: die Buchung gehört dorthin, wo für andere gebucht
  wird.
- **Entwürfe liegen im Speicher des Geräts** (Z4), wie beim Timer. Grund
  liegt beim Gerät: ohne Netz gibt es keinen anderen Ort. Lässt sich nichts
  ablegen (privates Fenster), sagt die Meldung das, und „Nicht senden“ lässt
  die Buchung im Ausgangsfach.
- **Nicht gekürzt werden Betriebsurlaub, Urlaub zu einem Sonderurlaub und
  stundenweiser Zeitausgleich** (Z1). Grund fachlich: sie ändern sich über
  ihren eigenen Weg (Betriebsurlaub, Sonderurlaub) bzw. werden ganz
  zurückgenommen.
- **Die Vorschau beim Kürzen rechnet in Kalendertagen** (Z1); einen Teil
  ohne Arbeitstag lässt erst die Datenbank fallen. Grund fachlich: welche
  Tage zählen, entscheidet die Datenbank mit Arbeitszeit, Feiertagen und
  Verlauf; die Vorschau rechnet das nicht ein zweites Mal.

### Paket 5: Auftragskette

- **Kommende Einsätze halten den Abschluss einer Baustelle auf** (A11); alles
  andere Offene darf mit „Trotzdem abschließen“ bleiben. Grund fachlich: was
  mit Rüstliste und Reservierung eines geplanten Einsatzes geschieht, wird in
  der Einsatzplanung entschieden (P2), nicht beim Abschließen.
- **„Wartung erledigt?“ ist ein Vorschlag und bucht nichts von selbst** (A9).
  Grund fachlich: ein unterschriebener Schein ist nicht dasselbe wie eine
  erledigte Wartung; das bestätigt der Betrieb.
- **Eine über den Link erklärte Annahme nimmt nur das Büro zurück, nicht der
  Kunde selbst** (A1). Grund rechtlich: die Annahme ist eine Erklärung des
  Kunden; ihr Widerruf ist ein Vorgang zwischen Kunde und Betrieb, den die
  Geschäftsführung mit Grund festhält.
- **Schon versendete leere Angebote bleiben „Versendet“** (A5, A14). Grund
  Altdaten: ihr Stand wird nicht umgeschrieben. Es entsteht kein neuer Link,
  ein alter gilt als ungültig, und annehmen lassen sie sich auf keinem Weg.
- **Der Rücklauf einer Sicherung prüft die Positionen eines angenommenen
  Angebots nicht** (A14). Grund Altdaten: der Rücklauf stellt den gesicherten
  Stand wieder her, wie er war; er fügt nur ein und ändert keinen Stand.

### Paket 6: Geld

- **Bestehende Schlussrechnungen mit Rest 0 bleiben „Offen“**, bis ihr
  Zahlstand neu gerechnet wird (G4). Grund Altdaten: ein Nachrechnen aller
  Rechnungen änderte Produktionszeilen; neue stehen gleich nach dem
  Ausstellen als „Bezahlt“.
- **Ältere Rechnungen haben keinen gespeicherten Leistungsnachweis; ihr
  Nachdruck bleibt ohne** (G6). Grund Altdaten: was damals angehängt war,
  ist nirgends festgehalten.
- **Ältere Stornorechnungen haben keinen festgehaltenen bezahlten Betrag**;
  ihr Text folgt wie bisher dem heutigen Stand (G8). Grund Altdaten.
- **Mahnungen ohne festgehaltene Forderung werden wie bisher verbucht** (G3).
  Grund Altdaten: ihre Summe wurde beim Festhalten nicht gespeichert.
- **Die Oberfläche bietet kein abweichendes Rechnungsdatum an** (G5). Grund
  rechtlich: das Ausstellungsdatum ist der Tag der Ausstellung. Übernahmen
  und Prüfungen setzen ein Datum ausdrücklich in der Datenbank.
- **Ob die Kanzlei die Umbuchungszeile Debitoren an Debitoren übernimmt oder
  den offenen Posten selbst ausgleicht** (V7). Grund: liegt bei der Kanzlei.
- **Ein noch nicht neu geladenes Gerät schreibt Umbuchungen im
  Zahlungsstapel als Bankzeilen** (V7). Grund liegt beim Gerät: die alte App
  kennt die Art „Umbuchung“ nicht; nach dem Neuladen schreibt sie die
  Umbuchungszeile.
- **Angebots- und Baustellennummern lassen sich weiter ohne Beleg ziehen**
  (G11). Grund fachlich: sie sind Vorschläge, überschreibbar und müssen nicht
  lückenlos sein; lückenlos ist nur der Rechnungskreis, und der entsteht
  jetzt nur mit dem Beleg.

### Paket 7: Material

- **Rechnungen von vor M2 decken weiter über ihr Leistungsende**, aber nur
  Ausgaben, die es beim Anlegen schon gab; ohne bekannten Ausgabezeitpunkt
  zählt nur das Datum (M2). Grund Altdaten: welche Ausgabe ihre Vorschau
  enthielt, haben sie nicht festgehalten; nichts Verrechnetes wird wieder
  offen. Folge: Ausgaben, die nach einer solchen Rechnung entstanden, stehen
  jetzt im Vorschlag — sie standen nie auf einer Rechnung.
- **Bestehende Kommissionsartikel bleiben Lagerartikel**, bis das Lager sie
  mit „Kommissionsware aus dem Lager nehmen …“ herausnimmt (M6). Grund
  Altdaten: ob ein Artikel geführt werden soll, entscheidet der Betrieb, nicht
  eine Rechnung über alte Lieferungen.
- **Eine Gutschrift an den Kunden ist in der App ein Hinweis** (M7);
  Rechnungspositionen kennen keine negative Menge und keinen negativen Preis.
  Grund fachlich und rechtlich: eine ausgestellte Rechnung wird über Storno
  und neue Rechnung berichtigt — seit V6 in einem Zug mit „Stornieren und neu
  ausstellen“.
- **Die Höchstmenge einer Retoure kennt nur das in der App Ausgegebene** (M7);
  Ware von woanders wird ohne Baustelle erfasst, die Meldung sagt das. Grund
  fachlich: anderswo bezogene Ware ist nicht belegt.
- **Verbrauch am Schein nur für Lagerartikel mit Katalogbezug, einmal je
  Schein; Fahrzeuge nur mit eingeschaltetem Modul Lagerorte** (M3). Grund
  fachlich bzw. Einstellung je Betrieb: ohne Katalogartikel gibt es keinen
  Bestand; eine Korrektur nach dem Buchen geht über die Inventur.
- **Menge ändern und Zurückziehen einer Anforderung brauchen Netz** (M5).
  Grund liegt beim Gerät bzw. Netz: beide hängen am aktuellen Stand der
  Anforderung, den ein zweites Gerät inzwischen geändert haben kann. Anfordern
  ohne Netz (Ausgangsfach) geht unverändert.
- **Belege vor M8 haben keinen festgehaltenen Einkaufspreis**; die
  Nachkalkulation rechnet dort mit dem Stammpreis (M8). Grund Altdaten.
- **Die alte App bucht im Wareneingang nur den Bestand** und erledigt keine
  Bestellung (M12). Grund liegt beim Gerät: bis zum Neuladen kennt sie die
  Auswahl der Bestellungen nicht.

### Paket 8: Konto und Daten

- **Die nächtliche Ausleitung läuft höchstens für 6 Betriebe gleichzeitig**,
  je Minute nachgefüllt (rund 360 Betriebe je Stunde bei 10 s je Betrieb)
  (K3). Grund Sicherheit und Betrieb der Datenbank: jede Arbeitskopie
  belastet sie. Skaliert über `app.ausleitung_gleichzeitig()`.
- **Bis zu einer Minute, bis Betroffene einer neu eingeschalteten
  Zwei-Faktor-Pflicht zur Einrichtung kommen** (K6). Grund fachlich: die
  Pflicht wirkt in der Datenbank sofort, ohne Faktor wird nichts gelesen oder
  gespeichert; die App fragt nur nach, statt auf jedem Gerät ein dauerhaftes
  Live-Abo der Betriebszeile zu halten.
- ~~Nach einem neuen Startpasswort bleiben die Sitzungen bestehen~~ —
  **entfallen (Integration Welle 2, 15.11.2026)**: gemessen beendet der
  Anmeldedienst beim Setzen eines Passworts alle Sitzungen des Kontos
  (beim eigenen Wechsel alle außer der laufenden). Die Annahme stand in
  Akte, „Passwort ändern“, Handbuch und Function; berichtigt.
- **Die alte App nutzt bis zum Neuladen `betrieb_auszug` mit der 8-MB-Grenze
  und meldet ohne Push-Abmeldung global ab** (K4, K2). Grund liegt beim
  Gerät: Telefone laden die neue Fassung erst beim nächsten Öffnen.
- **Hat die gelöschte Person das Konto eines anderen umgestellt, bleibt die
  Zeile ohne ihre Kennung und ihren Namen stehen** (K9). Grund fachlich: die
  Umstellung gehört zum Verlauf des anderen Kontos; die Angaben zur
  gelöschten Person fallen weg.

### Nicht als Grenze geführt

- **L5** (Zeilen der Mitarbeiterübersicht aus der Datenbank) ist nicht
  gebaut, aber keine Grenze: der Punkt steht offen im Plan und ist an
  Paket 9a übergeben.

### Mit Welle 2 entfallen

- **„Nicht verrechnet“ sah nur die 60 jüngsten Scheine** — die Scheinliste
  sagte dazu „Unter den jüngsten Scheinen ist keiner unverrechnet.“, Startseite
  und Rechnungen nannten die Grenze nicht (Analyse 3, M2). Entfallen mit P3:
  eine Datenbankfunktion über alle unterschriebenen Scheine. Stand nie in
  dieser Übersicht.
- **Entfernen des letzten Eingeteilten bzw. Löschen eines Einsatzes ließ die
  Rüstliste ohne Mannschaft (`uids` leer) am alten Tag zurück** (Analyse 3, H2:
  `deleteAssignment` ganz ohne Rüstliste). Entfallen mit P2: Rüstliste zieht
  mit, beim Letzten die Frage „auflösen oder behalten“.
- **Überstunden und Teilzeit-Mehrarbeit mit der Arbeitszeit am Monatsende,
  Arbeitszeitgrenzen mit den heutigen Arbeitstagen** (Bericht 4a) — entfallen
  mit Z3a.
- **Urlaub über den Jahreswechsel mit den heutigen Arbeitstagen verteilt**
  (Bericht 4a) — entfallen mit Z3b; es bleibt nur die Altdaten-Grenze oben.
- **Unterbrochene Rechnungsantwort sperrt bis zum Neuladen**
  (`docs/ui-umbau/premium-2026-10-28.md`, „Bewusste Grenzen“ Nr. 2) —
  entfallen mit G2, dort als ausgetragen vermerkt.
- **Kein Browserweg für die Auftragskette** (Bericht 5) — entfallen mit
  `auftragskette.spec.ts`.

## Durchsicht vom 15.11.2026, Welle 3 (Pakete 9 und 11) — begründete Grenzen

Gesammelt aus den Berichten der Pakete 9a, 9b, 11a und 11b (Stand §106–§109).
Grenzen, die eine spätere Nacharbeit derselben Welle aufgehoben hat, stehen am
Ende unter „Mit Welle 3 entfallen“.

### Paket 9a: Ladezeiten in der Datenbank

- **Die Monatswerte der Mitarbeiterübersicht rechnet weiter die App aus den
  Buchungen des Monats ± Woche** (L5): Streifen, Monatswerte, Vollständigkeit,
  AZG/KJBG, Tagesnachweis, Korrektur und Lohn-CSV. Grund fachlich
  (Lohnrelevanz): in der Datenbank hieße das, diese Regeln ein zweites Mal in
  SQL zu führen; zwei Rechenwege für Zahlen auf dem Lohnzettel laufen
  auseinander. Diese Buchungen wachsen mit Personen × Tagen, nicht mit den
  Jahren; was mit den Jahren wuchs (Urlaubsbuchungen, Gesamtsaldo), kommt jetzt
  aus der Datenbank.
- **Die Monatsstände des Zeitkontos werden nur für aktive Konten gefüllt**
  (L13). Grund Datenschutz: nach der Löschung einer Person darf nichts neu
  entstehen. Ausgeschiedene rechnen wie bisher bei jeder Abfrage; ihre schon
  gespeicherten Stände bleiben gültig.
- **Bei einem häufigen Suchbegriff kostet die genaue Trefferzahl so viel, wie
  es Treffer gibt** (L3; 17.000 Treffer bei 120.000 Artikeln: 48 ms). Grund
  fachlich: „und N weitere“ nennt eine genaue Zahl; eine geschätzte stünde dort
  falsch.
- **Die acht Suchfunktionen `public.suche_<tabelle>` laufen mit den Rechten des
  Aufrufers, nicht als `security definer`** (Befund 1) — eine bewusste Ausnahme
  von der Regel für neue Datenbankfunktionen. Grund Sicherheit: die Leseregeln
  von Kunden, Baustellen, Wartungen, Scheinen, Anforderungen, Eingängen,
  Rechnungen und Angeboten sind zu verschieden, um sie in einer Funktion mit
  erweiterten Rechten sicher nachzubauen; eine nachgebaute Fassung könnte
  auseinanderlaufen und Zeilen herausgeben. So gilt die Leseregel der Tabelle
  unverändert. Mit erweiterten Rechten läuft nur `app.suche_treffer`, und die
  liefert nichts als Kennungen aus dem eigenen Betrieb.
- **Beim Einspielen der Suchindizes warten Schreibende kurz** (gemessen unter
  1,5 s bei 120.000 bzw. 119.000 Zeilen). Grund liegt bei jemand anderem
  (Werkzeug der Plattform): `supabase db push` spielt jede Migration in einer
  Transaktion ein, und darin geht `create index concurrently` nicht. Begründet
  im Kommentar jeder Migration.

### Paket 9b: Ladezeiten in der Oberfläche

- **Im Chat wird kein Original in voller Auflösung aufbewahrt** (L4); Bilder
  gehen auf die längste Kante 1600 verkleinert hinaus. Grund fachlich: 1600
  genügt schon am Schein als Nachweis (Riss in der Wand, Typenschild); wer eine
  Datei unverändert weitergeben muss, schickt sie als PDF, und PDF bleibt, wie
  es ist.
- **Ältere Chatbilder haben kein Vorschaubild** (L4) und zeigen das Bild
  selbst. Grund Altdaten: es wird nichts nachträglich erzeugt oder
  umgeschrieben.
- **Die Rechnungen in der Kundenakte werden nicht gemerkt, sie laden immer
  frisch** (L8). Grund fachlich: Geldstände zeigt die App nie aus einem älteren
  Stand (Regel aus Stand 16.3).
- **Eine Änderung an Hülle oder Datenkern benennt weiter 176 von 230
  Bausteinen um (772 KB)** (L7); eine Änderung an einer Ansicht nur noch 2.
  Grund Sicherheit (Betriebssicherheit: verlässliche Startreihenfolge): fast
  jede Ansicht bindet Hülle und Datenkern ein. Ein feinerer Schnitt erzeugt
  Kreise zwischen Bausteinen, und mit Kreisen ist nicht mehr gesichert, in
  welcher Reihenfolge die Teile beim Start ausgewertet werden — die App
  könnte auf einzelnen Geräten mit halb geladenen Teilen starten oder gar
  nicht. Ein unzuverlässiger Start nach jeder Auslieferung wiegt schwerer als
  das Nachladen nach einer der seltenen Änderungen an Hülle oder Datenkern.
- **Der Fassungswechsel am echten Telefon ist nicht geprüft** (L7, L10:
  iPhone, App auf dem Startbildschirm, „Jetzt laden“, danach ohne Netz
  starten). Grund liegt beim Gerät: die Unit-Prüfungen des Service Workers
  decken den Weg ab; am Gerät prüft ihn der Betrieb einmal nach der
  Auslieferung (Handbuch, „Nach einer neuen Fassung weniger laden“).
- **Der gewachsene Messbestand für den Stapel (`TESTBESTAND_GEWACHSEN`) bucht
  an Feiertagen wie an Arbeitstagen** (L11), wie der Grundbestand. Grund
  fachlich: er misst Ladezeiten, nicht Salden; die Saldo-Rechnung prüfen
  `zeitkontoZwischenstand`, `zeitkontoSaldo` und `arbeitszeitVerlauf` mit
  eigenem Bestand.

### Paket 11a: Kunden zusammenführen, Inventur, Nummern

- **Kunden zusammenführen ist nicht rückgängig zu machen** (F9). Grund
  fachlich: die Dublette wird gelöscht; eine Rücknahme müsste Baustellen,
  Belege und Verlauf wieder aufteilen, und welche Zeile zu wem gehörte, ist
  danach nicht mehr eindeutig. Vorschau und Handbuch sagen das vorher.
- **Die Personenkonten bei der Kanzlei legt die Kanzlei zusammen** (F9). Grund
  liegt bei jemand anderem (Kanzlei): unterscheiden sich die Kundennummern,
  nennt die Vorschau die Nummer im Export.
- **Ältere Belege ohne Kundenverknüpfung wandern nur, wenn kein dritter Kunde
  den Namen der Dublette trägt** (F9). Grund fachlich: bei mehrdeutigem Namen
  wiese die Zuordnung Belege womöglich dem falschen Kunden zu.
- **Zeitbuchungen behalten ihren Kundennamen als Text** (F9), wie beim
  Umbenennen. Grund rechtlich: sie sind Arbeitszeitaufzeichnung und werden
  nicht nachträglich umgeschrieben.
- **Der Support kann nicht zusammenführen** (F9). Grund Sicherheit: das
  Zusammenführen löscht endgültig einen Kunden; das tun nur Mitglieder des
  Betriebs.
- **Termine der Dublette für heute und morgen lösen beim Zusammenführen die
  Änderungsmeldung an die Teilnehmer aus** (F9). Grund fachlich: Ort und Name
  des Termins ändern sich tatsächlich; die Teilnehmer erfahren es so wie bei
  jeder anderen Änderung.
- **Die Inventur bewertet den Bestand nicht** (F14). Grund liegt bei jemand
  anderem (Steuerberatung) und Datenschutz bzw. Rechte: die Bewertung gehört in
  die Bilanz, und Einkaufspreise sieht nur die Spitze.
- **Zählen und buchen nur Verwaltung und Leitung, nicht der Fahrer** (F14).
  Grund fachlich: die Kontrolle macht nicht, wer für den Bestand
  verantwortlich ist; dieselben Rollen wie die Einzelinventur.
- **Der Stichtag einer Zählliste liegt frühestens am 30.09.2026 und höchstens
  60 Tage voraus** (F14). Grund Altdaten: das Soll wird aus dem
  Bewegungsprotokoll zurückgerechnet, und das beginnt dort.
- **Über den Rücklauf einer Sicherung hinweg stimmt das Soll einer Zählliste
  nicht** (F14): Bestandsänderungen mit dem Dienstschlüssel schreiben keine
  Bewegung. Grund Altdaten und Sicherheit: der Rücklauf stellt den gesicherten
  Stand wieder her, wie er war (bestehendes Verhalten); das Protokoll schreibt
  nur, was über die Funktionen des Betriebs geschieht.
- **Ohne Verbindung zeigen Nummernvorschau und Vorschlag der Baustellennummer
  ein Beispiel mit dem Jahr des Geräts** (G12 und Befund), als Beispiel
  gekennzeichnet. Grund liegt beim Gerät: ohne Verbindung kennt die App das
  Jahr des Servers nicht; verbindlich vergibt der Server beim Speichern.
- **Eine von Hand in der Dashboard-Maske angelegte Tabelle bekommt die
  Vorgaberechte von Supabase** (Tabellenrechte), auch TRUNCATE und MAINTAIN für
  `authenticated`. Grund liegt bei jemand anderem (Plattform): sie entsteht als
  `supabase_admin`, für den die geänderte Vorgabe nicht gilt. Der Wächter in
  `schema.test.ts` findet eine solche Tabelle, wie beim `anon`-Wächter.

### Paket 11b: Kontoauszug und Belege per Mail

- **Der Mailversand braucht die Secrets `SMTP_*`** (F16). Grund liegt bei
  jemand anderem (Betreiber): die Zugangsdaten des Mailservers gehören nicht
  ins Repository. Bis sie gesetzt sind, bietet das Fenster „PDF laden“ und
  „Mail-Programm öffnen“ an.
- **Die SMTP-Zugangsdaten der Anmeldemails sind nicht nutzbar, und die Ports
  25 und 587 sind gesperrt** (F16). Grund liegt bei jemand anderem (Supabase):
  die Einstellung Authentication → SMTP erreicht keine Edge Function, und
  gehostete Edge Functions dürfen auf diese Ports nicht verbinden. Deshalb
  eigene Secrets und Port 465 mit TLS als Vorgabe.
- **Rückläufer, die der Mailserver schon angenommen hatte, gehen an das
  Postfach von `SMTP_ABSENDER` und erscheinen nicht im Verlauf** (F16). Grund
  liegt bei jemand anderem (Betreiber) und fachlich: SPF und DKIM verlangen
  die Domain der Plattform als Absender; das Postfach liegt beim Betreiber.
- **Text und PDF einer Mail werden nicht gespeichert** (F16), nur Zeitpunkt,
  Person, Empfänger, Betreff, Name, Größe und Prüfsumme des Anhangs. Grund
  Datenschutz und fachlich: das PDF entsteht aus dem Beleg jederzeit gleich,
  die Prüfsumme belegt den Stand.
- **Ohne Antwortadresse des Betriebs geht keine Mail hinaus** (F16). Grund
  Datenschutz: Antworten der Kunden landeten sonst beim Betreiber.
- **Grenzen gegen Mailflut** (F16): je Person 30 Mails in der Stunde, je
  Betrieb 100 in der Stunde und 400 am Tag, je Beleg 5 in der Stunde; eine
  Rechnung und ihre Mahnungen teilen sich die Grenze je Beleg. Grund
  Sicherheit: Schutz des Kunden und des Absenderrufs der Plattform vor
  Mailflut.
- **Der Support sendet keine Belege** (F16). Grund Sicherheit: der Support
  schreibt nicht in den Betrieb, und eine Mail an einen Kunden ist eine
  Handlung des Betriebs.
- **Dieselbe Bewegung aus verschiedenen Formaten (camt gegen CSV) erkennt die
  Prüfsumme nicht immer** (F13). Grund fachlich: die Formate tragen
  unterschiedliche Angaben. Abgefangen über „gleiche Rechnung, gleicher Tag,
  gleicher Betrag“ („Schon erfasst“).
- **Fremdwährung wird nicht abgeglichen** (F13). Grund fachlich: Rechnungen
  werden in Euro gestellt.
- **Vorgemerkte Umsätze und Rückbuchungen werden gezählt und genannt, aber
  nicht übernommen** (F13). Grund fachlich: ein vorgemerkter Umsatz ist bei
  der Bank noch nicht gebucht, eine Rückbuchung hebt eine Buchung der Bank auf;
  beides ist kein Zahlungseingang zu einer Rechnung.
- **Abbuchungen ohne Rechnungsbezug werden nur gezählt, nicht verbucht**
  (F13, „Nicht Rechnungen betreffend“). Grund fachlich und liegt bei jemand
  anderem (Steuerberatung): Senklot führt keine Eingangsrechnungen und keine
  Buchhaltung.
- **Per Mail geht nur die jüngste Mahnung einer Rechnung** (F16). Grund
  fachlich: eine ältere Stufe nach einer neueren nähme die Mahnung zurück.
- **Keine Mahnung per Mail nach Bezahlung oder Storno** (F16). Grund
  fachlich: die Forderung besteht nicht mehr.
- **Das Senden einer Mahnung setzt die Mahnstufe nicht** (F16). Grund
  fachlich: die Stufe setzt der bestehende Ablauf beim Erzeugen der Mahnung;
  ein zweiter Weg zählte sie doppelt.

### Nicht als Grenze geführt

- **Messung gegen den Stapel mit gewachsenem Bestand** (L11, L22):
  **erledigt** bei der Integration der Welle 3 (15.11.2026). Gemessen als
  Geschäftsführung und Monteur (`docs/ui-umbau/messung-gewachsen.md`); der
  einzige Befund — Startseite und Rechnungen nach rund 12 s, weil die Liste
  „nicht verrechnet“ in 20 Seiten nacheinander kam — ist behoben (4,8 und
  4,3 s). Zeilen und Dauer je Abfrage prüft die CI weiter nicht, weil die
  Attrappen der Vorschau nicht nach Person und Zeitraum filtern; die CI prüft
  Datenaufrufe und Elemente je Seite, die Messung gegen den Stapel bleibt ein
  Lauf von Hand.
- **Kein eigener Browserweg für „Mahnung per Mail“** (F16): Komponenten- und
  Datenbankprüfung decken den Weg ab. Eine Lücke im Nachweis, keine Grenze.

### Mit Welle 3 entfallen

- **„Dunkel“ sieht bis zum ersten Skript helles Papier** (Bericht 9b, L10) —
  entfallen mit der Nacharbeit: ein eingebettetes Skript mit Hash setzt den
  dunklen Grund ab dem ersten Bild, die Inhaltsregel bleibt ohne
  `'unsafe-inline'`.
- **Die Suche der Baustellenliste steht nicht in der Adresse** (Bericht 9b) —
  entfallen: `?suche=` wie bei Kunden, Angeboten und Wartungen.
- **Abbuchungen werden im Kontoauszug nicht abgeglichen** und **Mahnung per
  Mail gibt es nicht** (Bericht 11b, als Lücken benannt) — entfallen mit den
  Rückzahlungen im Kontoauszug und „Mahnung per Mail“.
- **`authenticated` behält MAINTAIN** (Bericht 11a, offen wegen der
  Postgres-Version) — entfallen: entzogen ab Postgres 17 in einem Block, der
  unter Version 17 nichts tut.
- **Nach einem großen DATANORM-Import bleibt die Suche langsam, bis autovacuum
  aufräumt** (Bericht 9a, zur Entscheidung) — entfallen: die Übernahme räumt
  die Warteliste am Ende selbst auf.
- **Einsatzplanung prüft Feiertage je Tag; die Monatsliste des Zeitkontos
  nutzt den Zwischenspeicher nicht** (Bericht 9a, als begrenzt benannt) —
  entfallen mit den Befunden 3 und 4.
- **L5 offen** (Welle 2, „Nicht als Grenze geführt“) — gebaut; es bleibt die
  fachliche Grenze der Monatsrechnung oben.

## Durchsicht vom 15.11.2026, Paket 10 (Oberfläche und Bewegung) — begründete Grenzen

- **Gefahrfarbe (U5, E4)** (liegt beim Auftraggeber): Warn- und Fehlertext
  tragen jetzt immer ein Zeichen. Die eigene, deutlich vom Terrakotta
  abgesetzte Gefahrfarbe steht als gemessener Vorschlag auf `/_muster`
  (hell `#9e1c3a`, dunkel `#f28aa0`) und wird erst nach Zustimmung eingebaut.
- **Datums- und Zeitfelder (U10, E5)** (Gerät): das Rad und die Form des
  Felds zeichnet der Browser in der Sprache des Geräts; sie lässt sich nicht
  ändern. Auf einem nicht deutsch eingestellten Gerät steht der Wert deshalb
  zusätzlich deutsch unter dem Feld.
- **„Rückgängig“ nicht überall (F15)**: gebaut, wo der alte Stand genau
  zurückkommt (Angebot und Schein-Entwurf verwerfen, Warenkorb leeren,
  Geburtsdatum, Urlaubsanpassung, Arbeitszeit- und Anspruchsänderung,
  Rechtstext-Entwurf). Ohne „Rückgängig“, mit Rückfrage vorher:
  - rechtlich: Storno einer Rechnung (der Storno ist ein Beleg),
    Datenauskunft und Löschen einer Person (Art. 17 DSGVO);
  - fachlich: Kunde, Baustelle, Material, Zeitbuchung, Einsatz, Termin,
    Zahlung, Wartung, Liegenschaft, Eingang löschen — neu angelegt bekämen
    sie eine neue Kennung, an der alten hängen Verweise, Verlauf und
    Nummernkreis, und Meldungen gingen erneut hinaus; entschiedene Anträge
    sind der Person schon gemeldet; eine verworfene Zählliste hielte neu
    angelegt den heutigen Bestand fest; ein verworfener DATANORM-Lauf wird
    neu eingelesen;
  - Datenschutz: hochgeladene Nachweise und Pläne werden als Datei gelöscht;
  - „endgültig löschen“ im Papierkorb: endgültig ist der Zweck.
- **Ziehen zum Aktualisieren nur als installierte App** (fachlich): im Browser
  hat das Ziehen von oben schon eine Bedeutung (die ganze Seite neu laden);
  zwei Gesten auf einer Bewegung wären unberechenbar. Akten und Formulare
  holen beim Ziehen nicht nach — ein Neuholen mitten im Bearbeiten
  überschriebe Eingaben (P1/P10).
- **Wischen an der Zeile nur am Handy und nur mit dem Finger** (Gerät): mit
  Maus und Stift gibt es die Geste nicht; dieselbe Aktion steht an jeder
  Zeile auch anders erreichbar.
- **Bewegungen** (Gerät, Barrierefreiheit): mit „Bewegung reduzieren“ (Gerät
  oder Mein Konto → Darstellung und Bewegung) ohne Weg, nur der Zustand.
  Ohne Netz nach dem ersten Bild bleibt die App ohne die Bewegungen der
  Listen (sie laden nach dem ersten Bild nach, L11).

## Nacharbeit zur Durchsicht vom 15.11.2026 (Welle 4) — Grenzen und offene Punkte

Aus den vier Befunden der Nacharbeit (Stand §111).

- **Messbestand nur mit Eigentümerrechten** (Rechte): `tests/supabase/aufraeumen.ts`
  lässt `ui-testbestand` nur stehen, wenn es als Eigentümer der Datenbank
  löschen kann (lokal `supabase_admin`, sonst `SUPABASE_DB_ADMIN_URL`) — ohne
  Auslöser und ohne Prüfung der Fremdschlüssel, sonst kostet es neben dem
  Bestand über eine Minute. Ohne diesen Zugang leert es wie bisher, samt
  Messbestand, und sagt es.
- **Budget B3** — in der Nacharbeit zuerst offen gelassen, danach gebaut:
  - *Anforderungen „Laufend“* — **erledigt** (Nacharbeit, Teil 1):
    `anforderungen_laufend` gibt je Gruppe Zahl und gezeigte Seite, gefiltert
    wie von der Startseite verlangt, dazu Baustellen der Auswahl und die Zahl
    am Reiter „Einkauf“; der ganze Arbeitsstand kommt nur noch für die
    Einkaufsliste, die jede offene Bestellung je Großhändler zusammenfasst.
  - *Baustellen* — **erledigt** (Nacharbeit, Teil 2): `baustellen_liste` gibt
    je Statusgruppe Zahl und gezeigte Seite über alle Baustellen (Auswahl,
    Filter der Startseite aus der Adresse, „Nur meine“, Suche), dazu das
    Schriftfeld; `baustellen_budget_lage` den Budgetstand über alle aktiven.
    Es bleibt die Belegschaft (gewachsener Bestand: 51 Konten) für Namen und
    Auswahl im Formular — **Grenze (fachlich):** sie wächst mit dem einen
    Betrieb, nicht mit dem Bestand, und Senklot ist für Betriebe bis etwa 30
    Mitarbeiter gedacht (Auftraggeber, 20.10.2026).
  - *Offene Rechnungen der Startseite* — **erledigt** (Nacharbeit, Teil 3):
    die Regeln (Zahlstand, Rücklass, „darf gemahnt werden“, Mahnkosten,
    Mahnlauf) stehen in `shared/forderungen.ts`, `src/features/invoices`
    reicht sie weiter; die Edge Function `startseite-forderungen` wertet mit
    derselben Fassung aus und schickt Zahlen und die ersten drei je Abschnitt.
    Keine zweite Fassung in SQL: die Regeln sind keine einfachen Vergleiche.
- **Lager ohne Rechnung im Browser** (Richtigkeit): kommt die Antwort der
  Datenbank nicht, steht ein Fehler mit „Erneut versuchen“ statt einer eigenen
  Rechnung des Reservierten. Die eigene Rechnung griff bisher nur in diesem
  Fall und zählte anders als die Datenbank (jede offene Anforderung, Zuordnung
  über den Namen) — zwei Zahlen für „frei“ wären die schlechtere Auskunft.
- **Eine schon liegende `vite.config.js`** (Altbestand): sie entsteht nicht
  mehr, wird aber nicht automatisch gelöscht — einmal
  `rm -f vite.config.js vite.config.d.ts`.
- **WebKit nur in der CI** (Gerät/Umgebung): die Entwicklungsumgebung hat
  nur Chromium. Die Handy-Ansicht prüft dort `telefon-chromium` (dieselben
  Wege bei 390 px mit Finger); Eigenheiten von Safari selbst sieht erst die
  CI mit `webkit-telefon`.
