# Unterlagen für die rechtliche Prüfung

Stand: 09.10.2026. Technische Bestandsbeschreibung und Vertragsentwurf;
keine rechtliche Freigabe. Die öffentlichen Texte in
`src/features/recht/` bleiben ausdrücklich als Entwurf gekennzeichnet.

## Noch einzutragen

Betreiberfirma, Anschrift, Kontakt, UID, Firmenbuch, Gewerbe/Behörde und
Kammerzugehörigkeit; zuständiger Datenschutzkontakt; tatsächliche
Supabase-Projektregion und Tarif; SMTP-Anbieter und Speicherort; externes
Sicherungsziel samt Standort und Ablauffrist; Verträge mit allen Anbietern.
Die Pilotfirma ersetzt diese Betreiberdaten nicht.

## Entwurf einer Auftragsverarbeitungsvereinbarung

Verantwortlicher: [Installationsbetrieb, Anschrift, vertretende Person].
Auftragsverarbeiter: [Senklot-Betreiber, Anschrift, vertretende Person].

1. Gegenstand: Bereitstellung und Betrieb von Senklot für Organisation,
   Arbeitszeitaufzeichnung und Abrechnung des Betriebs. Dauer: Laufzeit des
   Nutzungsvertrags einschließlich vereinbarter Rückgabe und Löschung.
2. Verarbeitung: Erheben, Speichern, Anzeigen, Berechnen, Bericht/Export,
   Sicherung und Wiederherstellung, Berichtigung und zulässige Löschung.
   Personen: Mitarbeiter, Kunden, Ansprechpartner und Benutzer. Daten:
   Kontaktdaten, Rollen, Einsatz- und Zeitdaten, Urlaubs-/Abwesenheitsdaten,
   Geburtsdaten bei Jugendlichen, Leistungsnachweise, Unterschriften/Fotos,
   Angebote/Rechnungen/Zahlungen, Bearbeitungsverlauf und Gerätekennungen.
   Krankenstände und bestimmte Freistellungsnachweise können besondere
   Kategorien personenbezogener Daten enthalten.
3. Der Auftragsverarbeiter verarbeitet ausschließlich nach dokumentierter
   Weisung, verpflichtet Berechtigte zur Vertraulichkeit und informiert über
   Weisungen, die er für rechtswidrig hält. Eigene Zwecke und unvereinbarte
   Weiterverwendung sind ausgeschlossen.
4. Technische und organisatorische Maßnahmen gemäß nachstehendem Bestand;
   Änderungen dürfen das vereinbarte Schutzniveau nicht unterschreiten.
   Konkrete organisatorische Verantwortliche und Nachweise sind zu ergänzen.
5. Unterauftragsverarbeiter: Supabase (Daten/Auth/Storage), Google Firebase
   Hosting und optional FCM, [SMTP], [S3-Sicherung]. Juristische Vertragspartner,
   Orte, Transfergrundlagen und Verfahren für Änderungen/Widersprüche sind
   vor Unterschrift einzutragen und mit den Anbietervereinbarungen abzugleichen.
6. Unterstützung bei Betroffenenrechten, Sicherheitsvorfällen, Folgenabschätzung
   und behördlichen Anfragen. Meldeweg [Kontakt], interne Meldefrist [vereinbaren];
   gesetzliche Fristen des Verantwortlichen bleiben unberührt.
7. Kontrollen: Bereitstellung der vereinbarten Nachweise und angemessene
   Prüfungen durch den Verantwortlichen oder einen gebundenen Prüfer;
   Umfang, Vorlauf und Schutz anderer Mandanten [vereinbaren].
8. Vertragsende: vollständige Datenrückgabe über JSON-/Dateisicherung und
   Belegarchiv; danach Löschung nach Weisung, soweit keine gesetzliche
   Aufbewahrung entgegensteht. Sicherungskopien und Ablauffristen gesondert
   berücksichtigen; Bestätigung und Nachweis [vereinbaren].
9. Anlagen: Daten-/Verarbeitungsverzeichnis, TOMs, Unterauftragsverarbeiter,
   Weisungs-/Kontaktliste. Datum/Unterschriften [beide Parteien].

## Technische und organisatorische Maßnahmen: Bestand und Nachweisgrenzen

| Maßnahme | Im Code vorhanden | Im Betrieb noch nachzuweisen |
|---|---|---|
| Mandantentrennung | Postgres-RLS, Rollen und Betrieb aus geschützten Auth-Ansprüchen; direkte API-Rechte geprüft | Region, Projektverwaltung und Administratorenliste |
| Zugang | Supabase Auth; TOTP verpflichtend ausschließlich für globalen Admin; Betriebsrollen freiwillig; bestätigte Sitzung wird wiederverwendet | Sichere Geräte, Entzug ausgeschiedener Zugänge, Wiederherstellungsverantwortlicher |
| Support | Befristeter, erteilter Zugriff; Lesen/Mitarbeiten getrennt; keine Zeit-/Gesundheitsdaten; Protokoll | Freigabe- und Vertraulichkeitsverfahren |
| Nachvollziehbarkeit | Belegsperren und Originalmahnungen; unveränderliches Zeitjournal für neue Ereignisse; Auskunft und Löschprüfung | Sichtung, rechtliche Fristen je Datenart; kein rückwirkendes Journal |
| Transport/Browser | HTTPS-Anbieter vorgesehen; lokale Fonts, keine Werbetracker; Sicherheitsheader lokal im Hosting-Emulator geprüft; CSP nur meldend | Produktive TLS-/Headerprüfung, Domain; CSP-Durchsetzung erst nach realen Berichten |
| Sicherung | Nächtliche Ausleitung, eigener Storage; optional S3-Ziel; lokaler Export/Lösch/Rücklauf geprüft, einschließlich Originalmahnung und Journal | Zweiter Anbieter, Schreibrechte ohne Löschen/Lesen, Lebenszyklus, Wiederherstellung aus externer Kopie |
| Datenminimierung | Rollenabhängige Gesundheitsdaten, Kunden-Auskunft ohne fremde private Zeitnotizen; Auskunft enthält neue Personentabellen | Rollenbedarf und personenbezogene Freitexte im Betrieb prüfen |
| Löschung/Aufbewahrung | Explizite Auskunft und Löschvorschau; sofort löschbare Beziehungen getrennt von aufbewahrten Daten | Automatische Löschung nach Fristablauf fehlt; kein zusätzlicher Sperrstatus bei aufbewahrten Daten |
| Geräte/Offline | Lokale Anmeldung und Arbeitsdaten für Offline-Nutzung; Hintergrundabgleich | Gerätesperre, Verschlüsselung des Endgeräts, Verlust-/Fernlöschverfahren |
| Wartung | Versionierte Änderungen, Tests und Deploy Schema → Functions → App | Produktionsmonitoring und Vorfallkontakt; ein unbehobenes braces-Advisory im Entwicklungswerkzeugbestand |

Provider-Verschlüsselung, Zertifizierungen, Reaktionszeiten und garantierte
RPO/RTO sind keine aus dem Repository nachweisbaren Zusagen.

## Entwurf des Verzeichnisses der Verarbeitungstätigkeiten

Für den Betrieb nach Art. 30 Abs. 1; der Betreiber benötigt zusätzlich sein
Verzeichnis als Auftragsverarbeiter nach Art. 30 Abs. 2. Namen/Kontakte,
Transfergrundlagen, tatsächliche Löschfristen und TOM-Anlage ergänzen.

| Tätigkeit/Zweck | Personen und Daten | Empfänger/technischer Dienst | Fristen und rechtliche Prüfung |
|---|---|---|---|
| Personal-/Zeitorganisation | Mitarbeiter, Zeiten, Einsätze, Urlaub, Krankheit, Jugend-Geburtsdatum, Änderungsverlauf | Berechtigte Betriebsrollen; Supabase; Lohnexport an ausgewählte Kanzlei | Code verwendet sieben Jahre ab Jahresende; Art. 6/9 und Frist je Datenart prüfen |
| Kunden-/Leistungsabrechnung | Kunden/Ansprechpartner, Angebot, Baustelle, Schein/Unterschrift/Foto, Rechnung, Zahlung, Mahnung | Betriebsrollen; Supabase; Exporte an Kanzlei | Belegaufbewahrung, Rücklass und Archivvertrag bestätigen |
| Anmeldung und Sicherheit | Kontaktdaten/Benutzername, Rollen, Auth- und Wiederherstellungsdaten | Supabase Auth, ausgewählter SMTP-Dienst | Kontoentzug und gesetzliche Ausnahmen von Löschung prüfen |
| Optionale Kalender-/Pushdienste | Gewählte Kalenderdaten einschließlich Kunden-/Einsatzbezug; Gerätekennung und Meldung | Vom Benutzer gewählter Kalenderdienst; FCM bei Zustimmung | Kalender-Abo widerrufbar; keine Abwesenheiten im betrieblichen Kalender; Transfers prüfen |
| Support und Fehlerbehebung | Technischer Fehlerbericht; bewusst übermittelter Meldungstext/Kontakt; Supportzugriffe | Senklot-Support, Supabase | Fehlerprotokoll 90 Tage laut bestehender Einrichtung; Freitexte und Rechtsgrund prüfen |
| Sicherung und Rückgabe | Vollständiger Betriebsbestand, einschließlich Gesundheitsdaten und Dateien | Supabase Storage; gewählter externer S3-Anbieter | Eigener Speicher Vorgabe 30 Tage; externe 90 Tage vorgesehen, noch nicht belegt |

## Konkrete Fragen an die rechtliche Prüfung

- Sind die getrennten Verantwortlichkeiten, Rechtsgrundlagen für Art.-9-Daten
  und die Information der Mitarbeiter vollständig? Braucht es eine DSFA?
- Welche Fristen gelten tatsächlich für Zeiten, Krankenstände, Nachweise,
  Journal, Support und Sicherungen? Der Code setzt sieben Jahre breit ein;
  das ist keine Bestätigung der Rechtsgrundlage für jede Datenart.
- Ist die vereinbarte Aufbewahrung unter bestehenden Rollenrechten zulässig?
  Eine zusätzliche Einschränkung/Sperre ist derzeit nicht implementiert.
- Sind die konkreten Anbieter-, EU-Region- und Drittlandangaben belegt?
- Welche organisatorischen Maßnahmen und Vertragspflichten fehlen dem
  Betreiber? Erst nach Freigabe Betreiberdaten eintragen und `GEPRUEFT` setzen.
