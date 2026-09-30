# Umsetzungsplan zum Testbericht vom 30.09.2026

**Grundlage:** `Senklot_Testbericht_Fehler_2026-09-30.md` und
`Senklot_Arbeitsauftrag_Claude-Code_2026-09-30.md`. Die IDs (K, H, M, G, P)
sind die des Berichts.
**Stand des Codes:** `c3e0bd1` (30.09.2026, nach PR #189).

Der Bericht ist KI-gestützt entstanden. Deshalb steht vor jedem Paket ein
**Abgleich mit dem Code**: Einige Befunde sind bestätigt und die Ursache ist
gefunden, einige stimmen nur teilweise, zwei sind schon behoben. Was hier als
„bestätigt“ steht, ist im Quelltext nachgelesen. Im laufenden System
reproduziert ist es damit noch nicht — das ist der erste Schritt jedes Fixes
(Grundsatz 2).

---

## Wie gearbeitet wird

- **Ein Paket = ein PR** (große Pakete in Teil-PRs, siehe unten). Innerhalb
  eines PRs ein Befund pro Commit.
- **Je Befund:**
  1. im laufenden System reproduzieren;
  2. eine Prüfung schreiben, die am alten Stand fehlschlägt (Gegenprobe);
  3. an der Ursache beheben — gehört die Regel in die Datenbank, dann dort;
  4. dieselben Schritte nachmessen.
- **Vor jedem Merge:** Typen, Lint, alle Unit-, Ansichts- und
  Datenbankprüfungen sowie alle Wege im echten Browser.
- **Nach jedem Merge:** Live-Prüfung, `docs/FUNKTIONEN.md` und Handbuch
  nachziehen.
- **Bestehende Daten:** Ausgestellte Belege werden nie verändert. Wo sich ein
  abgeleiteter Wert ändert, geht das über eine Migration, die nur Abgeleitetes
  neu rechnet. Testdaten in der Produktion fasst der Code nicht an.
- **„Wartet auf Entscheidung“:** höchstens die Ursache analysieren und
  Optionen vorlegen, nichts bauen.

---

## Abgleich mit dem Code (Kurzfassung)

| Befund | Ergebnis | Ursache bzw. Stand |
|---|---|---|
| **K1** Links auf localhost | bestätigt | `resetPasswordForEmail` (`src/lib/auth/pg/sitzung.ts`) und `generate_link` in `betrieb-anlegen` übergeben **kein** `redirectTo`. Den Rücksprung (`PASSWORD_RECOVERY` → „Neues Passwort setzen“) erkennt die App bereits. |
| **K2** Schlussrechnung ohne Abzug | bestätigt, Ursache enger als vermutet | Der Abzug ist ein **nicht vorausgewähltes Häkchen**, und weder Maske noch Datenbank verlangen ihn. Mit gesetztem Abzug rechnen PDF, offene Posten, Skonto, Mahnlauf, Nachkalkulation und BMD-Auflösungsbuchung bereits richtig (Stufe 10.2). |
| **K3** Lücke im Rechnungskreis | **schon behoben** am 25.09. | `naechste_nummer` nimmt eine eigene Nummer nur vor der allerersten Rechnung an. Gegenprobe in `tests/supabase/modulGeld.test.ts` („danach lückenlos“). Die Lücke bei Perl stammt von davor. |
| **H1** `hours` ungeprüft | teilweise | Alle Summen rechnen aus Von/Bis/Pause. `hours` zählt nur, wenn **keine Uhrzeiten** eingetragen sind — ein Eintrag ohne Uhrzeit mit `hours = 12` zählt aber voll. |
| **H3** Betriebsurlaub über Silvester | bestätigt | Die Urlaubsseite (`urlaubsStand`) ordnet einen Antrag als Ganzes dem Jahr seines **Beginns** zu. Lohn-CSV und Mitarbeiterübersicht zählen je Tag. |
| **H4** Storno ohne Grund | bestätigt | Die Maske ersetzt einen leeren Grund durch „Storno ohne Angabe“; die Datenbank nimmt alles an. |
| **H5** „Überfällig“ von Hand | bestätigt | „Überfällig“ ist ein **gespeicherter** Status, den die Rechnungsliste beim Laden selbst setzt (`updateInvoiceStatus`). |
| **H8** Kunden, Krankmeldungen | bestätigt | `customers_lesen` erlaubt jedem im Betrieb alles. `krankmeldung_loeschen` erlaubt das Löschen jeder eigenen Meldung, auch einer vom Büro erfassten. |
| **G7** Suche Baustellenliste | nachprüfen | Die serverseitige Suche gibt es in der Admin-Liste (`searchProjects`). Vermutlich war eine andere Ansicht gemeint. |
| **M23** Mahnlauf nicht gefunden | nachprüfen | Den Mahnlauf gibt es; er erscheint erst bei echter Überfälligkeit. Bleibt als Test mit simuliertem Datum. |

---

## Paket 1 – Geld, Belege, Anmeldung (Startblocker)

**PR 1a: K1, K2, H4, H5**

- **K1 – Links führen auf localhost**
  - Rücksetzmail: `redirectTo` = Adresse der laufenden App (`window.location.origin`). Damit stimmt der Link auf jeder Domain, ohne Umgebungsvariable im Browser.
  - `betrieb-anlegen`: `redirect_to` aus dem Function-Geheimnis `APP_URL`; fehlt es, bricht die Function mit Hinweis ab, statt einen Localhost-Link zu liefern.
  - Prüfungen: Einheitstest für beide Aufrufe; ein Browser-Weg vom Rücksetzlink bis „Neues Passwort setzen“ bis zur Anmeldung.
  - Grenze: Den Mailversand selbst kann nur ein echter Nachtest prüfen (das machst du).
- **K2 – Schlussrechnung zieht Anzahlungen nicht ab**
  - Maske: Bei „Schlussrechnung“ sind alle abziehbaren Vorrechnungen **vorausgewählt**. Wer einen Abzug abwählt, bekommt eine harte Rückfrage.
  - Datenbank: `rechnung_ausstellen` weist eine Schlussrechnung ab, die eine abziehbare Vorrechnung derselben Baustelle mit gleicher Steuerbehandlung auslässt. Setzt es `vorrechnungen` und die Gesamtfelder, prüft es deren Summen serverseitig.
  - Bestand: Eine Prüfabfrage listet ausgestellte Schlussrechnungen mit übergangenen Anzahlungen, z. B. RE-2026-1502. Sie werden **nicht** verändert; der Weg für den Betrieb ist Storno und neue Schlussrechnung.
  - Abnahme: ein Durchstich „Anzahlung → Schlussrechnung → PDF, offene Posten, Skonto, Nachkalkulation, Ausgangsbuch, BMD“ mit den Sollzahlen aus dem Auftrag.
- **H4 – Storno ohne Grund**
  - Die Datenbank verlangt einen Grund: nicht leer, nicht nur Leerzeichen.
  - Die Maske zeigt den Fehler am Feld; der Ersatztext „Storno ohne Angabe“ entfällt.
  - Gegenprobe über die Schnittstelle.
- **H5 – „Überfällig“ von Hand**
  - „Überfällig“ wird nur noch abgeleitet (Fälligkeit plus offener Rest), nie gespeichert.
  - Der Menüpunkt und das Selbst-Setzen beim Laden entfallen.
  - Eine Migration setzt gespeicherte „Überfällig“ auf den abgeleiteten Zahlungsstand zurück.
  - Prüfung: Startseite, Liste, Ausgangsbuch, Mahnlauf.

**PR 1b: H1 – Stunden serverseitig**

- Sind Uhrzeiten eingetragen, rechnet ein Trigger `hours` aus Von, Bis, Pause, Datum und Mitternachtsregel; der Wert des Clients wird überschrieben.
- Ohne Uhrzeiten nimmt die Datenbank `hours` nur bei den Status an, die das brauchen (Urlaub, Krank, ZA ganztägig mit Tagessoll); sonst weist sie ab.
- Die Zeitumstellung muss in SQL dasselbe ergeben wie `shared/arbeitszeit.ts`. Eine Prüfung vergleicht beide an denselben Fällen.
- Im selben Schritt geprüft: Rechnungssummen (schon serverseitig) und Zuschläge.

**H6 – Datum der Stornorechnung:** wartet auf die Steuerberatung. Ich lege nur einen ausgearbeiteten Vorschlag bei: Ausstellungsdatum als Rechnungsdatum, Stornotag im Text.

---

## Paket 2 – Zeit, Urlaub, Zeitkonto

**PR 2a: H3, H2, M8, G18**
- **H3:** eine gemeinsame Urlaubsrechnung, die Anträge **je Tag** auf das Urlaubsjahr verteilt. Urlaubsseite, Genehmigung, Mitarbeiterübersicht und Lohn-CSV nutzen dieselbe Funktion. Prüfung: Betriebsurlaub 24.12.–10.01. und Neueintritt im November; alle Ansichten zeigen dieselbe Zahl.
- **H2:**
  - Die Rechnungsvorschau vergleicht nur mit noch nicht verrechneten Scheinen.
  - Neu: die Meldung „gebucht, aber ohne unterschriebenen Schein“ je Person, Tag und Satz.
  - „Stunden ohne Buchung“ prüft auch Personen ohne Zeitkonto.
- **M8:** Gesamtsaldo samt Start-Saldo und Zeitraum in der Mitarbeiterübersicht.
- **G18:** Zuschläge nach dem Buchen zurücksetzen; „bereits gebucht“ erst nach einer Eingabe zeigen.

**PR 2b: M4, M6, M7, M5**
- **M4:** „Resturlaub beim Umstieg“ wird Pflichtfeld bei „arbeitet schon im Betrieb“.
- **M6:** Eintrittsdatum und Saldo-Startdatum getrennt speichern. Die Migration übernimmt das Saldo-Startdatum als Eintritt, wo keins steht. Begriffe in Akte und Formular werden gleich.
- **M7** (Entscheidung, siehe unten): Buchungen vor dem Eintritt sperren; zwischen Eintritt und Saldo-Start warnen.
- **M5:** optional ein Tagessoll je Wochentag; die Standardverteilung bleibt unverändert.

**Wartet auf Klärung:**
- **M3** (WKO): aliquoter Urlaub.
- **M35** (Kollektivvertrag): Nachtzuschlag stundengenau.
- **Überstundenmodell** (deine Bestätigung vom 30.09. offen): Zeitkonto (Vorgabe) oder Tagesgrenze mit Überstunden in der Lohn-CSV, je Betrieb einstellbar.

---

## Paket 3 – Datenschutz und Rechte

**PR 3a: H8, H10, M9**
- **H8 – Kunden:** Monteure lesen nur Kunden ihrer eingeteilten Baustellen und nur Name, Adresse, Ansprechpartner und Telefon.
  - Umsetzung über eine eingeschränkte Sicht bzw. Funktion, weil Zeilenschutz keine Spalten ausblenden kann.
  - **Vorher** jede Ansicht des Monteurs gegen Kundendaten prüfen (Schein, Einsatz, Baustelle, Wartung), damit nichts leer wird.
- **H8 – Krankmeldungen:** Vom Büro erfasste Meldungen kann der Monteur nicht löschen, bei eigenen nur „Ende ändern“. Dafür braucht die Tabelle `erfasst_von`; bestehende Zeilen gelten als selbst erfasst.
- **H8 – Hochladen:** Die App legt Stundennachweise nicht selbst unter „Pläne“ ab (wird bestätigt). Deshalb ein fester Hinweis im Hochlade-Dialog und eine Warnung bei Dateinamen wie „Stunden“ oder einem Mitarbeiternamen.
- **H10:** Die Buchhaltung pflegt Basiszinssatz, Mahnspesen, Skonto und Zahlungsziel; die Stunden- und Kostensätze bleiben bei der Leitung. Datenbankregel und Oberfläche werden gemeinsam angepasst.
- **M9:**
  - Beim Abmelden alle benutzerbezogenen Schlüssel löschen.
  - Firestore-Reste entfernen.
  - Präfix `perl_` auf `senklot_` umstellen, mit einmaliger Übernahme der Schlüssel.

**PR 3b: M40, M41, M42, G12, G13**
- Im Supportmodus steht „nicht einsehbar“ statt falscher Salden und falscher Sicherungswarnung.
- Der Text zum Supportzugang nennt die ausgenommenen Bereiche.
- DSGVO-Löschen bei aktiven Konten zeigt „zuerst deaktivieren“.
- Kontenanlage:
  - neutrale Meldung bei vergebenem Namen;
  - E-Mail nur mit Domain-Endung;
  - Startpasswort ohne festes Muster.
- Der Urlaubszähler zählt nur, was die Person entscheiden darf. Resturlaub der Administration wird mit dem Handbuch abgeglichen.

**Wartet auf Entscheidung:** M37 und M38 (Zuschnitt für Lager und Projektleitung).

---

## Paket 4 – Stabilität der Oberfläche

**PR 4a: H9 – Klicks und Eingaben nach dem Laden**
- Zuerst im Browser **messen**, welche Ansichten nach dem Laden neu aufbauen: Genehmigen, Zeit erfassen, Positionen, Aus Lager, Supportzugang, Betriebsurlaub.
- Die Ursache je Ansicht beheben. Vermutlich wird ein Formular durch eine späte Ladefolge neu gesetzt oder durch eine Komponente mit wechselndem `key` ersetzt.
- Abnahme: ein Browser-Test, der unmittelbar nach dem Laden tippt und klickt.

**PR 4b: M1, M2, G2, G6, G10, G29**
- Warnung bei ungespeicherten Änderungen, beim Navigieren in der App und beim Schließen des Tabs.
- Neue Seiten starten oben; „Zurück“ stellt die Position wieder her.
- Vorbelegungen ersetzen beim Tippen, statt angehängt zu werden (Stk, Monteurname, Bezeichnung).
- Auswahllisten springen beim Anklicken nicht.
- Fehlermeldungen werden ins Blickfeld gescrollt.
- Toasts verdecken keine Hauptknöpfe.

**G20** geht in Paket 8 auf.

---

## Paket 5 – Rechnung und Buchhaltung

**PR 5a (klein, sofort): M19, M25, M26, G15, G16, G17, G27, G28**
- **M19:** Detailansicht einer Rechnung und eine Warnung ohne IBAN.
- **M25:** Die Monats-CSV zählt Projektstunden aller Personen, wie die Oberfläche.
- **M26:** Hinweis „Vorschlag – mit der Kanzlei abstimmen“ am Kontenrahmen.
- **G15:** Zahlungsdialog bei bezahlten bzw. stornierten Rechnungen nur mit klarem Hinweis.
- **G16:** keine unnötigen Vorbelegungen; Leistungszeitraum immer vorbelegt.
- **G17:** Spalte „Einheit“ breit genug; Tätigkeit aus dem Schein im Leistungsnachweis.
- **G27:** Kennzahl „bezahlt im laufenden Monat“, eindeutig beschriftet.
- **G28:** Stornorechnung als eigene Zeile in der Liste.

**PR 5b (größer): M12, M10, M20, M21, G30**
- **M12:** Strukturierte Adressen (Straße, PLZ, Ort, Land) für Kunden und Firma.
  - Die Migration zerlegt die einzeiligen Adressen, wo das eindeutig geht. Sonst bleibt die Zeile in „Straße“ stehen, und eine Liste zeigt, was zu prüfen ist.
  - Dazu Firmenbuchgericht und Kunden- bzw. Debitorennummer.
- **M10:**
  - UID-Formatprüfung für AT und die EU;
  - Feld „Kundenart“;
  - eine in der Rechnung korrigierte UID auf Wunsch in den Kunden übernehmen.
  - VIES bleibt optional und später: ein externer Dienst mit eigener Verfügbarkeit.
- **M20:** Anzahlung als Prozent vom Angebot, Leistungszeitraum übernehmen.
- **M21:** Rückzahlung eines Guthabens als Zahlungsausgang.
- **G30:** Basiszinssätze als Verlauf je Halbjahr.

**Wartet auf Klärung:**
- **H7** (Kanzlei-Importtest): Spalten, Steuercodes und Steuerbetrag im BMD-Stapel. Debitorennummern (M12) und Zahlungen/Skonto als eigenen Stapel kann ich vorher bauen.
- **M22:** Höhe der Mahnspesengrenze.
- **M23:** Test mit simuliertem Datum, in PR 5a.

---

## Paket 6 – Kunden, Baustellen, Angebote

**PR 6a: M15, M13, M14, G3, G4, G5, G7**
- **M15:** eine zentrale Zahleneingabe für alle Betrags- und Mengenfelder. Sie versteht „7.500,50“, „7500,50“ und „7500.50“ und meldet uneindeutige Eingaben, statt 0 zu setzen. Geprüft wird jedes Feld.
- **M13:** „Ende vor Beginn“ wird in der Datenbank und in der Maske abgewiesen.
- **M14:** Preisfeld oder klarer Hinweis bei Pauschalbaustellen ohne Angebot.
- **G3:** Adresse ohne Doppelung.
- **G4:** optionales Feld „Bezeichnung“ der Baustelle.
- **G5:** gleiche Felder beim Anlegen und in der Akte; Adresse aus dem Kunden vorschlagen.
- **G7:** die Suche auch in der Ansicht, die der Test meinte.

**Wartet auf Entscheidung:**
- M11 (Dubletten);
- M16–M18 (Angebote), mit Empfehlung zur Reihenfolge, siehe unten.

---

## Paket 7 – Lager, Planung, Wartung

**PR 7a (Planung): M33, M34, G23, G31**
- Unbesetzte Einsätze nach Krankmeldung oder Abwesenheit auf der Startseite und im Wochenplan; beim Monteur nicht mehr als „nächster Einsatz“.
- Optional eine Uhrzeit je Einsatz; die Projektleitung ist einteilbar.
- Info-Text im Wochenplan.
- Abholer der Rüstlisten-Anforderung ist der eingeteilte Monteur.

**PR 7b (Lager): M27, M28, M29, M32, M36, G8, G14, G19**
- **M27 – Dezimalmengen je Einheit:** Die Datenbanktypen ändern sich (`integer` → `numeric`), in Wareneingang, Anforderung, Rüstliste, Schein und Rechnung; bestehende Werte bleiben gleich.
- **M28:** Der Bestand ändert sich nur über Bewegungen; Inventurkorrektur mit Grund, Bewegungsprotokoll je Artikel.
- **M29:** Wareneingang mit Lieferant, Lieferschein und Bestellbezug.
- **M32:** Die Rüstliste reserviert Bestand.
- **M36:** Beschriftung des Warenkorbs.
- **G8, G14, G19:** Kleinigkeiten, Nachbestell-Knopf, freie Menge.

**PR 7c: M30, M31, M39**
- Katalog getrennt vom Lager, mit Mindestmenge.
- Materialaufschlag als Vorschlag.
- Anlagendaten der Wartung; nächster Termin aus „zuletzt gewartet“ plus Intervall.

---

## Paket 8 – Startseite neu (4.2, G33, M24, G20)

- Grundsatz: Handlungsbedarf, dann „Heute“, dann höchstens 4 Kennzahlen.
- Je Karte höchstens 3 Einträge plus „und N weitere →“ auf die gefilterte Fachseite.
- Leere Karten verschwinden; feste Reihenfolge je Rolle nach der Tabelle in 4.2.
- Voraussetzung: Die Fachseiten brauchen die Filter, auf die „und N weitere“ zeigt (z. B. Baustellen „über Budget“). Diese Filter entstehen im selben PR.
- Abnahme: ein Browser-Test mit 40 Baustellen, 20 Anforderungen und 10 Personen in Handy- und Schreibtischbreite; die Seite ist höchstens etwa zwei Bildschirmhöhen lang.
- Das ist eine sichtbare Umgestaltung. Bevor ich baue, lege ich je Rolle eine Skizze vor.

---

## Paket 9 – Plattform (globaler Admin)

- **M43 + G21 (sofort):**
  - Liste der Betriebe ohne Einblick in Inhalte; Auswahl für den Notzugang daraus;
  - Kennung aus dem Namen vorschlagen;
  - „Support (lesend)“ statt „Administrator“;
  - richtige Adresse nach dem Anmelden bzw. nach „Einblick beenden“;
  - Zeitstempel beschriftet.
- **P1 + P2 (zusammen, nach deiner Festlegung der Identitätsprüfung):**
  - erster Admin mit Benutzername;
  - eng begrenzte Reset-Funktion mit fünf Schutzregeln;
  - Gegenproben für E-Mail-Konten, Mitarbeiter-Konten und fehlenden Notzugang.

---

## Paket 10 – Texte und Einheitlichkeit

- **G1 – Schreibweise:**
  - durchgehend ß;
  - einheitliche Anführungszeichen „…“;
  - TT.MM.JJJJ und Dezimalkomma;
  - dazu eine Quelltext-Prüfung nach dem Muster der Eurozeichen-Prüfung.
  - Das berührt viele Dateien und läuft deshalb als eigener, rein textlicher PR ohne Verhaltensänderung.
- **Weitere Punkte:**
  - G9: abgeschnittener Platzhalter;
  - G11: Rückmeldung beim Zurücksetzen;
  - G24: Unterschrift mit Mindestfläche;
  - G25: Rollennamen einheitlich;
  - G26: Modulbeschreibung Nachkalkulation;
  - G32: Kleinigkeiten in Texten und Zählern.
- **G22:** Das Handbuch wird nach jedem Paket nachgezogen, nicht erst hier.

---

## Paket 11 – Erweiterungen (nach dem Start bzw. nach Klärung)

- **Lehrlinge (4.1):**
  - Einstufung an der Person;
  - Sätze je Stufe und Lehrjahr;
  - Status „Berufsschule“.
  - Die KJBG-Warnungen erst nach Klärung mit der WKO.
- **Weitere Lücken:**
  - Personalnummer, Lohnarten;
  - Fahrzeuglager, Inventur;
  - Prüfprotokoll;
  - Kalender-Export;
  - Mailversand;
  - ebInterface (wartet auf Klärung).

---

## Zuarbeit

- **Browser-Wege in Handy- (390 px) und Tabletbreite (834 px):** hier umsetzbar.
- **WebKit:** läuft nur in der CI (dort wird WebKit nachinstalliert), weil in dieser Umgebung nur Chromium vorhanden ist.
- **Mahnlauf-Test mit simuliertem Datum:** in PR 5a.
- **Anleitung bzw. Skript für den Rücklauf in ein frisches Projekt:** ausführen musst du.
- **Überwachung per Mail** (Absturz, fehlende Sicherung, Push-Fehler): braucht einen Mailanbieter und dessen Zugangsdaten als Function-Geheimnis. Das richtest du ein.
- **Rechtstexte:** einsetzen, sobald der Anwalt sie freigegeben hat.

---

## Entscheidungen, die ich brauche (mit Empfehlung)

| Punkt | Frage | Empfehlung |
|---|---|---|
| **M7** | Buchungen vor dem Eintritt sperren oder warnen? | **Vor dem Eintritt sperren** (Datenbank). Zwischen Eintritt und Saldo-Start **warnen**: der Anfangssaldo deckt diese Zeit ab. |
| **M11** | Dubletten | **Gleichen Namen zulassen, mit Rückfrage** „Es gibt schon … (Adresse) – trotzdem anlegen?“ |
| **M16–M18** | Angebote | Reihenfolge: **M17** Duplizieren/Version (klein) → **M16** Abrechnungsart beim Annehmen → **M18** Katalogartikel, Rabatt, Titel (groß, erst nach Rückmeldung der Pilotbetriebe). |
| **M37, M38** | Lager und Projektleitung | **Keine neuen Rollen**, sondern vergebbare Freigaben wie „Kunden pflegen“: „Katalog einspielen“, „Einkaufspreise sehen“, „Rechnungen lesen“. Dazu für die Projektleitung der Filter „meine Baustellen“. |
| **H1** | Falsche Stunden überschreiben oder abweisen? | **Überschreiben**, wenn Uhrzeiten da sind; **abweisen** bei Arbeitszeit ohne Uhrzeit. |
| **Überstunden** | Modell je Betrieb | wie am 30.09. vorgeschlagen; bitte bestätigen. |
| **Paket 8** | Startseite | vor dem Bau eine Skizze je Rolle zur Abnahme. |

**Extern bleibt offen:**
- H6, M26, H7: Steuerberatung bzw. Kanzlei;
- M3, M35, KJBG: WKO;
- K4: Anwalt;
- P2: Identitätsprüfung (du);
- K3: Umgang mit der bestehenden Lücke bei Perl (Steuerberatung).

---

## Reihenfolge und Umfang

| Schritt | Inhalt | Umfang |
|---|---|---|
| 1 | PR 1a (K1, K2, H4, H5) | mittel |
| 2 | PR 1b (H1) | mittel |
| 3 | PR 2a (H3, H2, M8, G18) | mittel |
| 4 | PR 3a (H8, H10, M9) | mittel bis groß (Kundenleserecht) |
| 5 | PR 4a (H9) | offen, bis die Ursache gemessen ist |
| 6 | PR 2b, 3b, 4b | je klein bis mittel |
| 7 | PR 5a, 6a, 7a, 9 (M43/G21) | je klein bis mittel |
| 8 | PR 5b, 7b | je groß (Datenmodell) |
| 9 | Paket 8 (Startseite) | groß, nach Skizzenabnahme |
| 10 | Paket 10 (Texte), 7c | mittel |

Mit den Schritten 1 bis 5 sind alle K- und H-Punkte erledigt, die im Code
liegen. Das entspricht Punkt 1 der Go/No-Go-Liste des Berichts.
