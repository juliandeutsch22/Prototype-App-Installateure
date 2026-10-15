# Lot v2 – vollständiges Gestaltungskonzept 06

Stand: 15.10.2026 · Projektstand `d4b8542821d86c7057761af16de1331d1de87e09`.

## Ziel und Grenze

Die ruhige Gestaltung von Entwurf 04 bleibt. Entwurf 05 wird um wiederholte Erklärungen, doppelte Aktionen und Grafiken ohne Entscheidungshilfe reduziert. Dieses Paket beschreibt die **gesamte App**, einschließlich der Rollenansichten, Unterseiten, Formulare, Dialoge und wesentlichen Zustände. Die App wird dabei nicht geändert.

Die 206 ausgearbeiteten Konzeptansichten sind **nicht 206 neue App-Seiten**: Darin stecken Rollenvarianten, vorhandene Dialoge, Formularschritte und Zustände. Grundlage sind alle 38 Routendeklarationen, die elf Einstellungs-Unterseiten, die impliziten Anmeldestufen/Plattformansicht und 132 Feature-Komponenten. Weiterleitungen und vorhandene App-Adressen bleiben bestehen.

## Gestaltungsentscheidungen

- Eine Fläche, feine Linien statt verschachtelter Karten. Weißraum bildet Gruppen.
- Poppins 400 für Text, 600 für Überschriften; große Kennzahlen 500 nach deiner Vorgabe. Desktoptitel 30 px, Handy 25 px; Kennzahlen 25/22 px.
- Eine hervorgehobene Hauptaktion. Ergänzende Aktionen im Kopfmenü oder am betreffenden Datensatz. Bei Formularen steht Speichern am Formularende.
- Listen und Details bleiben am Desktop verbunden, wenn beides gleichzeitig hilft. Am Handy erhält das Detail eine eigene Ansicht ohne allgemeine Summen darüber.
- Keine allgemeine Prozesskette. Schritte nur beim tatsächlichen mehrstufigen Erfassen, etwa beim Handwerksschein.
- Kennzahlen nur für eine Entscheidung auf der Seite. Auf Rechnungen reicht die Summenzeile; das zusätzliche Forderungsband entfällt. Das Stundenbudget bleibt an der Baustelle.
- Keine allgemeinen Nächster-Schritt-Banner. Handlungsbedarf nur bei echter Zuständigkeit, fehlender Angabe oder Blockade.
- Kontextlinks direkt am Kunden-/Baustellenbezug statt mehrfacher Gehört-zusammen-Blöcke.
- Formulare einspaltig bis 560 px; breite Positionstabellen nur wo nötig. Seltene Angaben in Weitere Angaben, bei gefüllten Werten offen.
- Suche/Filter/Auswahl/Scrollposition bleiben nach Detail und Speichern erhalten. Im echten Umbau bestehende URL-Parameter weiterverwenden.
- Eine Hilfe pro Seite. Notwendige unmittelbare Hinweise bei Fehlern und verbindlichen Aktionen bleiben am Ort.
- Hell als Standard; dunkel nur auf ausdrückliche Wahl. Keine neuen dekorativen Icons, Animationen oder Illustrationen.

## Rollen und sichtbare Funktionen

Navigation und Einstellungsrechte wurden aus `src/app/navigation.ts` exportiert; siehe `rollenmatrix.json`. Zusatzrechte kommen weiterhin aus `permissions.ts` und den Betriebsschaltern. Die Galerie ist ein Entwurfsverzeichnis, kein Sicherheitsmodell.

- Mitarbeiter: eigene Zeiten, eigene Einsätze/Baustellen, Scheine, Materialanforderung und eigene Abwesenheiten.
- Verwaltung: Anforderungen/Einkauf/Lager, Kunden nach Freigabe; Wartungen nur lesen.
- Buchhaltung: Rechnungen, Mitarbeiterübersicht und Rechnungsvorgaben; Angebote nur lesen.
- Projektleitung: Baustellen/Planung/Scheine/Angebote; keine fremden Zeitkonten oder Krankenstandsgründe. Rechnungen nur nach gesonderter Lesefreigabe, nur eigene Baustellen.
- Geschäftsführung: Leitungsfunktionen; Administratorrollen und Module bleiben enger.
- Administrator: Betriebsadministration; kein künstliches persönliches Zeitkonto allein aus der Rolle.
- Plattformadministrator: eigene Hülle ohne Betriebsdaten. Einblick/Notzugang bleiben ausdrücklich befristet und protokolliert.

Bei jeder Aktion müssen weiterhin **Rolle, Zusatzrecht, Modul, Datensatzstatus und ggf. Supportmodus** zusammen geprüft werden. Ein Entwurf mit maximal sichtbaren Angaben ist keine Freigabe an andere Rollen.

## Arbeitswege vollständig erhalten

| Arbeitsweg | Entwurfsfolge |
|---|---|
| Kundenauftrag | Kunden → Kundenakte → Angebot erstellen → Angebot prüfen/annehmen → Baustelle |
| Leistung vor Ort | Mein Einsatzplan → Material zum Einsatz → Zeit → Schein: Zeiten, Material, Fotos, Unterschrift → eingefrorener Schein |
| Abrechnung | Baustelle/Scheine → Rechnung vorbereiten → Vorschau → verbindlich erstellen → Zahlung/Teilzahlung/Rückzahlung → ggf. Mahnung/Storno |
| Material | Anfordern → Warenkorb → Anforderung → Annehmen/Einkauf → Bestellung/Liefertermin → Wareneingang/Abholbereit → Abholung → Erledigt |
| Retoure | Rückgabe → Prüfung → Einlagern oder Ausscheiden → Bewegungsprotokoll |
| Urlaub | Eigener Antrag → Anspruch/Überschneidungen → berechtigte Entscheidung → Verlauf; Krankmeldung separat ohne Genehmigung |
| Personal | Benutzer anlegen → Zugang übergeben → Zeitkonto/Arbeitstage → Monats-/Wochenübersicht → Tagesnachweis/Korrektur → Export |
| Wartung | Vereinbarung → Fälligkeit → Wartungsbaustelle/Ausführung → nächste Fälligkeit und Verlauf |
| Einrichtung | Einstellungen suchen → passendes bestehendes Formular → validieren/speichern → tatsächlichen Stand zeigen |

## Gemeinsame Zustände und Verhalten

1. Laden zeigt Platzhalter in passender Höhe, keine falschen Nullsummen.
2. Leer, keine Suchtreffer, fehlender Zugriff und Fehler sind verschiedene Zustände.
3. Ein Teilfehler ersetzt nicht die gesamte noch nutzbare Seite. Betroffene Gruppe mit erneutem Versuch.
4. Ungespeicherte Angaben bleiben bei Fehler und Detailwechsel erhalten; Verlassen wird wie bisher abgesichert.
5. Offline heißt lokal vorgemerkt, nicht im Betrieb gespeichert. Übertragung/Konflikt bleiben unterscheidbar.
6. Verbindliche Aktionen behalten ihre vorhandene Bestätigung; kein erfundenes Rückgängig.
7. Fokus kehrt aus einem Fenster zum Auslöser zurück; Escape schließt nur das oberste Fenster.
8. Tabellen werden am Handy zu lesbaren Zeilen oder Tageslisten. Kein seitliches Überlaufen der gesamten Seite.
9. Touchziele mindestens 44 px; im Text erkennbare Verlinkungen, sichtbarer Tastaturfokus, Status nie nur durch Farbe.
10. Zahlen/Beträge/Datum im österreichischen Format. Bestehende Berechnungen und Belegdateien bleiben fachlich unverändert.

## Ansichten nach Bereich

### Zugang

#### 001 · Anmelden (`anmelden`)

- Bestehender Ort: `/login`
- Darstellung: `auth`; Rollen: Mitarbeiter, Verwaltung, Buchhaltung, Projektleiter, Geschäftsführung, Administrator. Gezeigtes Beispiel: Mitarbeiter.
- Hauptaktion: Anmelden.
- Gestaltungsentscheidung: Marke trägt das Kopfband; das Formular braucht keine zusätzliche Illustration.
- Handy/Tablet: Zeilen statt zusätzlicher Karten; Hauptaktion bleibt gut erreichbar.
- Angaben/Felder: E-Mail oder Benutzername, Passwort, Angemeldet bleiben.
- Weitere Aktionen: Passwort vergessen?.
- Unverändert erhalten: Benutzername und E-Mail; Neutrale Fehlermeldung; Angemeldet bleiben; Rücksetzweg.
- Quelle: `src/features/auth/LoginPage.tsx`.

#### 002 · Passwort zurücksetzen (`passwort-vergessen`)

- Bestehender Ort: `/login · Rücksetzmodus`
- Darstellung: `auth`; Rollen: Mitarbeiter, Verwaltung, Buchhaltung, Projektleiter, Geschäftsführung, Administrator. Gezeigtes Beispiel: Mitarbeiter.
- Hauptaktion: Link anfordern.
- Gestaltungsentscheidung: Nur arbeitsrelevante Angaben; Details über die Zeile öffnen.
- Handy/Tablet: Zeilen statt zusätzlicher Karten; Hauptaktion bleibt gut erreichbar.
- Angaben/Felder: E-Mail.
- Inhaltsgruppen: Anmeldung mit Benutzername.
- Weitere Aktionen: Zur Anmeldung.
- Unverändert erhalten: Keine Auskunft, ob ein Konto existiert; Benutzerkonten erhalten keinen Mail-Link.
- Quelle: `src/features/auth/LoginPage.tsx`.

#### 003 · Eigenes Passwort vergeben (`passwort-setzen`)

- Bestehender Ort: `Nach Rücksetzlink / Startpasswort`
- Darstellung: `auth`; Rollen: Mitarbeiter, Verwaltung, Buchhaltung, Projektleiter, Geschäftsführung, Administrator. Gezeigtes Beispiel: Geschäftsführung.
- Hauptaktion: Passwort vergeben.
- Gestaltungsentscheidung: Nur arbeitsrelevante Angaben; Details über die Zeile öffnen.
- Handy/Tablet: Zeilen statt zusätzlicher Karten; Hauptaktion bleibt gut erreichbar.
- Angaben/Felder: Neues Passwort, Noch einmal.
- Weitere Aktionen: Zur Anmeldung.
- Unverändert erhalten: Passwortbestätigung; Bei normaler Änderung aktuelles Passwort; Kein Überspringen beim Startpasswort.
- Quelle: `src/features/auth/PasswortAendern.tsx`.

#### 004 · Passwort ändern (`passwort-aendern`)

- Bestehender Ort: `/settings/meldungen · Passwort`
- Darstellung: `form`; Rollen: Mitarbeiter, Verwaltung, Buchhaltung, Projektleiter, Geschäftsführung, Administrator. Gezeigtes Beispiel: Geschäftsführung.
- Hauptaktion: Passwort ändern.
- Gestaltungsentscheidung: Nur arbeitsrelevante Angaben; Details über die Zeile öffnen.
- Handy/Tablet: Zeilen statt zusätzlicher Karten; Hauptaktion bleibt gut erreichbar.
- Angaben/Felder: Aktuelles Passwort, Neues Passwort, Noch einmal.
- Unverändert erhalten: Passwortbestätigung; Bei normaler Änderung aktuelles Passwort; Kein Überspringen beim Startpasswort.
- Quelle: `src/features/auth/PasswortAendern.tsx`.

#### 005 · Zwei-Faktor-Anmeldung (`zwei-faktor`)

- Bestehender Ort: `Anmeldeprüfung`
- Darstellung: `auth`; Rollen: Mitarbeiter, Verwaltung, Buchhaltung, Projektleiter, Geschäftsführung, Administrator. Gezeigtes Beispiel: Geschäftsführung.
- Hauptaktion: Bestätigen.
- Gestaltungsentscheidung: Ein Feld und ein eindeutiger Schritt; die Wiederherstellung bleibt als Textaktion erreichbar.
- Handy/Tablet: Zeilen statt zusätzlicher Karten; Hauptaktion bleibt gut erreichbar.
- Angaben/Felder: Code aus der App.
- Weitere Aktionen: Wiederherstellungscode verwenden, Abmelden.
- Quelle: `src/features/auth/ZweiFaktorSeite.tsx`.

#### 006 · Mit Wiederherstellungscode anmelden (`zwei-faktor-code`)

- Bestehender Ort: `Anmeldeprüfung · Wiederherstellung`
- Darstellung: `auth`; Rollen: Mitarbeiter, Verwaltung, Buchhaltung, Projektleiter, Geschäftsführung, Administrator. Gezeigtes Beispiel: Geschäftsführung.
- Hauptaktion: Bestätigen.
- Gestaltungsentscheidung: Nur arbeitsrelevante Angaben; Details über die Zeile öffnen.
- Handy/Tablet: Zeilen statt zusätzlicher Karten; Hauptaktion bleibt gut erreichbar.
- Angaben/Felder: Wiederherstellungscode.
- Weitere Aktionen: Code aus der App verwenden.
- Quelle: `src/features/auth/ZweiFaktorSeite.tsx`.

#### 007 · Zweiten Faktor einrichten (`zwei-faktor-einrichten`)

- Bestehender Ort: `/settings/meldungen · Einrichtung`
- Darstellung: `form`; Rollen: Mitarbeiter, Verwaltung, Buchhaltung, Projektleiter, Geschäftsführung, Administrator. Gezeigtes Beispiel: Geschäftsführung.
- Hauptaktion: Bestätigen.
- Gestaltungsentscheidung: Der QR-Bereich ist eine Funktionsfläche, kein Schmuck. Im Konzept bleibt er neutral, ohne echtes Geheimnis.
- Handy/Tablet: Zeilen statt zusätzlicher Karten; Hauptaktion bleibt gut erreichbar.
- Angaben/Felder: Code aus der App.
- Inhaltsgruppen: 1 · Mit Authenticator verbinden, 2 · Code bestätigen.
- Unverändert erhalten: QR/Schlüssel nur für die angemeldete Person; Bestätigung vor Aktivierung.
- Quelle: `src/features/auth/ZweiFaktorEinrichten.tsx`, `src/features/settings/ZweiFaktorKarte.tsx`.

#### 008 · Wiederherstellungscodes sichern (`wiederherstellungscodes`)

- Bestehender Ort: `Nach Zwei-Faktor-Einrichtung`
- Darstellung: `auth`; Rollen: Mitarbeiter, Verwaltung, Buchhaltung, Projektleiter, Geschäftsführung, Administrator. Gezeigtes Beispiel: Geschäftsführung.
- Hauptaktion: Codes notiert – weiter.
- Gestaltungsentscheidung: Nur arbeitsrelevante Angaben; Details über die Zeile öffnen.
- Handy/Tablet: Zeilen statt zusätzlicher Karten; Hauptaktion bleibt gut erreichbar.
- Angaben/Felder: Ich habe die Codes sicher aufbewahrt..
- Inhaltsgruppen: Persönliche Codes.
- Unverändert erhalten: Codes bleiben bis zur ausdrücklichen Bestätigung sichtbar; Keine echten Codes im Entwurf.
- Quelle: `src/features/auth/ZweiFaktorEinrichten.tsx`.

#### 009 · Impressum (`impressum`)

- Bestehender Ort: `/impressum`
- Darstellung: `legal`; Rollen: Mitarbeiter, Verwaltung, Buchhaltung, Projektleiter, Geschäftsführung, Administrator. Gezeigtes Beispiel: Geschäftsführung.
- Hauptaktion: keine zusätzliche Hauptaktion.
- Gestaltungsentscheidung: Lesespalte mit ruhiger Hierarchie. Keine erfundenen Betreiberangaben und keine gekürzten Rechtstexte.
- Handy/Tablet: Zeilen statt zusätzlicher Karten; Hauptaktion bleibt gut erreichbar.
- Inhaltsgruppen: Rechtlicher Entwurf, Medieninhaber und Diensteanbieter, Unternehmensangaben, Grundlegende Richtung, Streitbeilegung.
- Unverändert erhalten: Öffentlich ohne Anmeldung erreichbar; Vollständiger Rechtstext aus dem Bestand; GEPRUEFT=false bleibt sichtbar; neue Gestaltung ersetzt keine rechtliche Freigabe; Wortlaut aus den bestehenden Abschnitten übernommen.
- Quelle: `src/features/recht/ImpressumView.tsx`.

#### 010 · Datenschutzerklärung (`datenschutz`)

- Bestehender Ort: `/datenschutz`
- Darstellung: `legal`; Rollen: Mitarbeiter, Verwaltung, Buchhaltung, Projektleiter, Geschäftsführung, Administrator. Gezeigtes Beispiel: Geschäftsführung.
- Hauptaktion: keine zusätzliche Hauptaktion.
- Gestaltungsentscheidung: Lesespalte mit ruhiger Hierarchie. Keine erfundenen Betreiberangaben und keine gekürzten Rechtstexte.
- Handy/Tablet: Zeilen statt zusätzlicher Karten; Hauptaktion bleibt gut erreichbar.
- Inhaltsgruppen: Rechtlicher Entwurf, Wer verantwortlich ist, Welche Daten die App verarbeitet, Wozu, Auf deinem Gerät, Wer die Daten technisch verarbeitet, Wie lange, Deine Rechte.
- Unverändert erhalten: Öffentlich ohne Anmeldung erreichbar; Vollständiger Rechtstext aus dem Bestand; GEPRUEFT=false bleibt sichtbar; neue Gestaltung ersetzt keine rechtliche Freigabe; Wortlaut aus den bestehenden Abschnitten übernommen.
- Quelle: `src/features/recht/DatenschutzView.tsx`.

### Start

#### 011 · Heute, Mittwoch (`heute`)

- Bestehender Ort: `/`
- Darstellung: `dashboard`; Rollen: Geschäftsführung. Gezeigtes Beispiel: Geschäftsführung.
- Hauptaktion: keine zusätzliche Hauptaktion.
- Gestaltungsentscheidung: Nur eigene Aufgaben bzw. Aufgaben mit Zuständigkeit. Keine Erfolgsbanner oder Fortschrittsketten.
- Handy/Tablet: Zeilen statt zusätzlicher Karten; Hauptaktion bleibt gut erreichbar.
- Inhaltsgruppen: Heute im Kalender.
- Unverändert erhalten: Rollenabhängiger Handlungsbedarf; Bestehende Ausfall- und Wartungshinweise; Keine Margen oder fremden Zeitkonten für Projektleitung.
- Quelle: `src/features/dashboard/DashboardView.tsx`, `src/features/dashboard/start/HeuteEigene.tsx`, `src/features/dashboard/start/HeuteLeitung.tsx`, `src/features/dashboard/start/Handlungsbedarf.tsx`.

#### 012 · Heute, Mittwoch (`heute-monteur`)

- Bestehender Ort: `/`
- Darstellung: `dashboard`; Rollen: Mitarbeiter. Gezeigtes Beispiel: Mitarbeiter.
- Hauptaktion: Zeit erfassen.
- Gestaltungsentscheidung: Nur eigene Aufgaben bzw. Aufgaben mit Zuständigkeit. Keine Erfolgsbanner oder Fortschrittsketten.
- Handy/Tablet: Zeilen statt zusätzlicher Karten; Hauptaktion bleibt gut erreichbar.
- Inhaltsgruppen: Heute im Kalender.
- Unverändert erhalten: Rollenabhängiger Handlungsbedarf; Bestehende Ausfall- und Wartungshinweise; Keine Margen oder fremden Zeitkonten für Projektleitung.
- Quelle: `src/features/dashboard/DashboardView.tsx`, `src/features/dashboard/start/HeuteEigene.tsx`, `src/features/dashboard/start/HeuteLeitung.tsx`, `src/features/dashboard/start/Handlungsbedarf.tsx`.

#### 013 · Heute, Mittwoch (`heute-verwaltung`)

- Bestehender Ort: `/`
- Darstellung: `dashboard`; Rollen: Verwaltung. Gezeigtes Beispiel: Verwaltung.
- Hauptaktion: keine zusätzliche Hauptaktion.
- Gestaltungsentscheidung: Nur eigene Aufgaben bzw. Aufgaben mit Zuständigkeit. Keine Erfolgsbanner oder Fortschrittsketten.
- Handy/Tablet: Zeilen statt zusätzlicher Karten; Hauptaktion bleibt gut erreichbar.
- Inhaltsgruppen: Heute im Kalender.
- Unverändert erhalten: Rollenabhängiger Handlungsbedarf; Bestehende Ausfall- und Wartungshinweise; Keine Margen oder fremden Zeitkonten für Projektleitung.
- Quelle: `src/features/dashboard/DashboardView.tsx`, `src/features/dashboard/start/HeuteEigene.tsx`, `src/features/dashboard/start/HeuteLeitung.tsx`, `src/features/dashboard/start/Handlungsbedarf.tsx`.

#### 014 · Heute, Mittwoch (`heute-buchhaltung`)

- Bestehender Ort: `/`
- Darstellung: `dashboard`; Rollen: Buchhaltung. Gezeigtes Beispiel: Buchhaltung.
- Hauptaktion: keine zusätzliche Hauptaktion.
- Gestaltungsentscheidung: Nur eigene Aufgaben bzw. Aufgaben mit Zuständigkeit. Keine Erfolgsbanner oder Fortschrittsketten.
- Handy/Tablet: Zeilen statt zusätzlicher Karten; Hauptaktion bleibt gut erreichbar.
- Inhaltsgruppen: Heute im Kalender.
- Unverändert erhalten: Rollenabhängiger Handlungsbedarf; Bestehende Ausfall- und Wartungshinweise; Keine Margen oder fremden Zeitkonten für Projektleitung.
- Quelle: `src/features/dashboard/DashboardView.tsx`, `src/features/dashboard/start/HeuteEigene.tsx`, `src/features/dashboard/start/HeuteLeitung.tsx`, `src/features/dashboard/start/Handlungsbedarf.tsx`.

#### 015 · Heute, Mittwoch (`heute-projektleitung`)

- Bestehender Ort: `/`
- Darstellung: `dashboard`; Rollen: Projektleiter. Gezeigtes Beispiel: Projektleiter.
- Hauptaktion: keine zusätzliche Hauptaktion.
- Gestaltungsentscheidung: Nur eigene Aufgaben bzw. Aufgaben mit Zuständigkeit. Keine Erfolgsbanner oder Fortschrittsketten.
- Handy/Tablet: Zeilen statt zusätzlicher Karten; Hauptaktion bleibt gut erreichbar.
- Inhaltsgruppen: Heute im Kalender.
- Unverändert erhalten: Rollenabhängiger Handlungsbedarf; Bestehende Ausfall- und Wartungshinweise; Keine Margen oder fremden Zeitkonten für Projektleitung.
- Quelle: `src/features/dashboard/DashboardView.tsx`, `src/features/dashboard/start/HeuteEigene.tsx`, `src/features/dashboard/start/HeuteLeitung.tsx`, `src/features/dashboard/start/Handlungsbedarf.tsx`.

#### 016 · Heute, Mittwoch (`heute-admin`)

- Bestehender Ort: `/`
- Darstellung: `dashboard`; Rollen: Administrator. Gezeigtes Beispiel: Administrator.
- Hauptaktion: keine zusätzliche Hauptaktion.
- Gestaltungsentscheidung: Nur eigene Aufgaben bzw. Aufgaben mit Zuständigkeit. Keine Erfolgsbanner oder Fortschrittsketten.
- Handy/Tablet: Zeilen statt zusätzlicher Karten; Hauptaktion bleibt gut erreichbar.
- Inhaltsgruppen: Heute im Kalender.
- Unverändert erhalten: Rollenabhängiger Handlungsbedarf; Bestehende Ausfall- und Wartungshinweise; Keine Margen oder fremden Zeitkonten für Projektleitung.
- Quelle: `src/features/dashboard/DashboardView.tsx`, `src/features/dashboard/start/HeuteEigene.tsx`, `src/features/dashboard/start/HeuteLeitung.tsx`, `src/features/dashboard/start/Handlungsbedarf.tsx`.

### Kunden

#### 017 · Kunden (`kunden`)

- Bestehender Ort: `/customers`
- Darstellung: `list`; Rollen: Verwaltung, Buchhaltung, Projektleiter, Geschäftsführung, Administrator. Gezeigtes Beispiel: Geschäftsführung.
- Hauptaktion: Neuer Kunde.
- Gestaltungsentscheidung: Nur arbeitsrelevante Angaben; Details über die Zeile öffnen.
- Handy/Tablet: Zeilen statt zusätzlicher Karten; Hauptaktion bleibt gut erreichbar.
- Bereiche: Aktiv, Alle.
- Weitere Aktionen: Kunden importieren, Baustellen zuordnen.
- Unverändert erhalten: Kundenpflegerecht je Benutzer; Dublettenprüfung; Import; Übernahme bestehender Baustellen; Verwaltung/Buchhaltung nur mit kundenPflegen; sonst lesend ohne Pflegeaktionen.
- Quelle: `src/features/customers/CustomersView.tsx`.

#### 018 · Neuer Kunde (`kunde-neu`)

- Bestehender Ort: `/customers · Anlegen`
- Darstellung: `form`; Rollen: Verwaltung, Buchhaltung, Projektleiter, Geschäftsführung, Administrator. Gezeigtes Beispiel: Geschäftsführung.
- Hauptaktion: Kunde anlegen.
- Gestaltungsentscheidung: Nur arbeitsrelevante Angaben; Details über die Zeile öffnen.
- Handy/Tablet: Zeilen statt zusätzlicher Karten; Hauptaktion bleibt gut erreichbar.
- Angaben/Felder: Name oder Firma, Rechnungsadresse, Kundennummer (bei Bedarf), Ansprechpartner, Telefon, E-Mail, Kundenart, UID-Nummer (bei Bedarf), Notiz (bei Bedarf).
- Unverändert erhalten: Kunden pflegen nur mit Berechtigung; Gleicher Name erfordert bewusste Bestätigung; Verwaltung/Buchhaltung nur mit kundenPflegen; sonst lesend ohne Pflegeaktionen.
- Quelle: `src/features/customers/CustomersView.tsx`.

#### 019 · Hausverwaltung Sonnenhof (`kundenakte`)

- Bestehender Ort: `/customers/:id`
- Darstellung: `record`; Rollen: Verwaltung, Buchhaltung, Projektleiter, Geschäftsführung, Administrator. Gezeigtes Beispiel: Geschäftsführung.
- Hauptaktion: Bearbeiten.
- Gestaltungsentscheidung: Die Akte verbindet vorhandene Vorgänge. Keine separate Prozessgrafik und keine duplizierten Linklisten.
- Handy/Tablet: Zeilen statt zusätzlicher Karten; Hauptaktion bleibt gut erreichbar.
- Bereiche: Überblick, Stammdaten, Wartungen, Angebote, Rechnungen, Termine.
- Inhaltsgruppen: Baustellen, Kontakt, Offene Rechnungen.
- Weitere Aktionen: Datenauskunft.
- Unverändert erhalten: Rechnungen und Angebote nur nach Recht/Modul; UID-/VIES-Prüfstatus; Löschen und Deaktivieren getrennt; Datenauskunft.
- Quelle: `src/features/customers/KundenakteView.tsx`, `src/features/customers/UidVies.tsx`, `src/features/recht/Datenauskunft.tsx`.

#### 020 · Kundenstammdaten bearbeiten (`kunde-bearbeiten`)

- Bestehender Ort: `/customers/:id · Stammdaten`
- Darstellung: `form`; Rollen: Verwaltung, Buchhaltung, Projektleiter, Geschäftsführung, Administrator. Gezeigtes Beispiel: Geschäftsführung.
- Hauptaktion: Änderungen speichern.
- Gestaltungsentscheidung: Nur arbeitsrelevante Angaben; Details über die Zeile öffnen.
- Handy/Tablet: Zeilen statt zusätzlicher Karten; Hauptaktion bleibt gut erreichbar.
- Angaben/Felder: Name oder Firma, Rechnungsadresse, Kundennummer (bei Bedarf), Ansprechpartner, Telefon, E-Mail, Kundenart, UID-Nummer (bei Bedarf), Notiz (bei Bedarf), Aktiv – erscheint in Auswahlfeldern.
- Weitere Aktionen: UID prüfen, Kunde löschen.
- Unverändert erhalten: Ungespeichert-Warnung; UID-Prüfung separat auslösbar; Aktive Bezüge verhindern unzulässiges Löschen; Verwaltung/Buchhaltung nur mit kundenPflegen; sonst lesend ohne Pflegeaktionen.
- Quelle: `src/features/customers/KundenakteView.tsx`, `src/features/customers/UidVies.tsx`.

#### 021 · Kunden aus Datei übernehmen (`kunden-import`)

- Bestehender Ort: `/customers · CSV-Import`
- Darstellung: `form`; Rollen: Verwaltung, Buchhaltung, Projektleiter, Geschäftsführung, Administrator. Gezeigtes Beispiel: Geschäftsführung.
- Hauptaktion: Gültige Zeilen übernehmen.
- Gestaltungsentscheidung: Nur arbeitsrelevante Angaben; Details über die Zeile öffnen.
- Handy/Tablet: Zeilen statt zusätzlicher Karten; Hauptaktion bleibt gut erreichbar.
- Angaben/Felder: CSV-Datei.
- Inhaltsgruppen: Vorschau.
- Weitere Aktionen: Vorlage herunterladen.
- Unverändert erhalten: Vorschau vor Übernahme; Vorhandene/fehlerhafte Zeilen getrennt; Teilresultate sichtbar; Verwaltung/Buchhaltung nur mit kundenPflegen; sonst lesend ohne Pflegeaktionen.
- Quelle: `src/features/customers/KundenImport.tsx`.

#### 022 · Bestehende Baustellen zuordnen (`kunden-zuordnen`)

- Bestehender Ort: `/customers · Übernahme`
- Darstellung: `form`; Rollen: Verwaltung, Buchhaltung, Projektleiter, Geschäftsführung, Administrator. Gezeigtes Beispiel: Geschäftsführung.
- Hauptaktion: Übernahme durchführen.
- Gestaltungsentscheidung: Nur arbeitsrelevante Angaben; Details über die Zeile öffnen.
- Handy/Tablet: Zeilen statt zusätzlicher Karten; Hauptaktion bleibt gut erreichbar.
- Angaben/Felder: Kunde.
- Inhaltsgruppen: Vorschau.
- Unverändert erhalten: Erst Vorschau erstellen; Baustellenänderungsrecht bleibt gesondert.
- Quelle: `src/features/customers/CustomersView.tsx`.

#### 194 · UID-Nummer prüfen (`uid-pruefung`)

- Bestehender Ort: `/customers/:id · UID-Nummer prüfen`
- Darstellung: `panel`; Rollen: Verwaltung, Buchhaltung, Projektleiter, Geschäftsführung, Administrator. Gezeigtes Beispiel: Geschäftsführung.
- Hauptaktion: Bei VIES prüfen.
- Gestaltungsentscheidung: Nur die konkrete Aufgabe mit ihren notwendigen Angaben. Keine zusätzliche Erklärungsebene.
- Handy/Tablet: Zeilen statt zusätzlicher Karten; Hauptaktion bleibt gut erreichbar.
- Angaben/Felder: UID-Nummer des Kunden.
- Inhaltsgruppen: Letzte Prüfung.
- Unverändert erhalten: Nur bestehende Prüfrechte; Firmen-UID erforderlich; Keine Echtheitszusage bei Netzfehler; Prüfergebnis mit Zeit und Person.
- Quelle: `src/features/customers/UidVies.tsx`.

### Angebote

#### 023 · Angebote (`angebote`)

- Bestehender Ort: `/quotes`
- Darstellung: `list`; Rollen: Buchhaltung, Projektleiter, Geschäftsführung, Administrator. Gezeigtes Beispiel: Geschäftsführung.
- Hauptaktion: Neues Angebot.
- Gestaltungsentscheidung: Nur arbeitsrelevante Angaben; Details über die Zeile öffnen.
- Handy/Tablet: Zeilen statt zusätzlicher Karten; Hauptaktion bleibt gut erreichbar.
- Bereiche: Offen, Erledigt, Alle.
- Unverändert erhalten: Gruppen nach Arbeitsstand; Suche über alle; Versendet/Ablehnen/Entwurf löschen; PDF.
- Quelle: `src/features/quotes/QuotesView.tsx`.

#### 024 · Angebot erstellen (`angebot-neu`)

- Bestehender Ort: `/quotes · Entwurf`
- Darstellung: `editor`; Rollen: Projektleiter, Geschäftsführung, Administrator. Gezeigtes Beispiel: Geschäftsführung.
- Hauptaktion: Angebot speichern.
- Gestaltungsentscheidung: Nur arbeitsrelevante Angaben; Details über die Zeile öffnen.
- Handy/Tablet: Zeilen statt zusätzlicher Karten; Hauptaktion bleibt gut erreichbar.
- Angaben/Felder: Kunde, Ort der Leistung, Gültig bis, Titel, Text, Anmerkungen (bei Bedarf).
- Inhaltsgruppen: Positionen.
- Unverändert erhalten: Text- und Titelpositionen; Menge/Einheit/Einzelpreis/Rabatt; Arbeitszeit markierbar; Katalogartikel; Belegsumme und Steuer; Katalog direkt an den Positionen erreichbar.
- Quelle: `src/features/quotes/QuotesView.tsx`, `src/features/quotes/KatalogSuche.tsx`.

#### 025 · Artikel ins Angebot übernehmen (`angebot-katalog`)

- Bestehender Ort: `/quotes · Katalogsuche`
- Darstellung: `panel`; Rollen: Projektleiter, Geschäftsführung, Administrator. Gezeigtes Beispiel: Geschäftsführung.
- Hauptaktion: Auswahl übernehmen.
- Gestaltungsentscheidung: Nur arbeitsrelevante Angaben; Details über die Zeile öffnen.
- Handy/Tablet: Zeilen statt zusätzlicher Karten; Hauptaktion bleibt gut erreichbar.
- Angaben/Felder: Suche.
- Unverändert erhalten: Suche und verfügbare Artikelpreise; Rückkehr zum unveränderten Entwurf.
- Quelle: `src/features/quotes/KatalogSuche.tsx`, `src/features/quotes/QuotesView.tsx`.

#### 026 · Angebot A-2026-0088 (`angebot-detail`)

- Bestehender Ort: `/quotes/:id`
- Darstellung: `record`; Rollen: Buchhaltung, Projektleiter, Geschäftsführung, Administrator. Gezeigtes Beispiel: Geschäftsführung.
- Hauptaktion: keine zusätzliche Hauptaktion.
- Gestaltungsentscheidung: Nur arbeitsrelevante Angaben; Details über die Zeile öffnen.
- Handy/Tablet: Zeilen statt zusätzlicher Karten; Hauptaktion bleibt gut erreichbar.
- Inhaltsgruppen: Positionen, Angaben, Verlauf.
- Weitere Aktionen: PDF laden.
- Unverändert erhalten: Angenommenes Angebot nicht als veränderbarer Entwurf darstellen; PDF; Bestehende Baustelle verlinken; Neue Fassung nur für versendet/abgelehnt; Buchhaltung liest nur.
- Quelle: `src/features/quotes/AngebotView.tsx`, `src/features/quotes/AbrechnungWahl.tsx`.

#### 027 · Angebot annehmen (`angebot-annehmen`)

- Bestehender Ort: `/quotes/:id · Annahme`
- Darstellung: `panel`; Rollen: Projektleiter, Geschäftsführung, Administrator. Gezeigtes Beispiel: Geschäftsführung.
- Hauptaktion: Annehmen und Baustelle anlegen.
- Gestaltungsentscheidung: Nur arbeitsrelevante Angaben; Details über die Zeile öffnen.
- Handy/Tablet: Zeilen statt zusätzlicher Karten; Hauptaktion bleibt gut erreichbar.
- Angaben/Felder: Abrechnung der Baustelle.
- Inhaltsgruppen: Wird angelegt.
- Unverändert erhalten: Bestätigung vor verbindlicher Annahme; Pauschale oder Regie; Kein doppeltes Anlegen.
- Quelle: `src/features/quotes/AngebotView.tsx`, `src/features/quotes/AbrechnungWahl.tsx`.

#### 203 · Angebot A-2026-0092 (`angebot-entwurf`)

- Bestehender Ort: `/quotes/:id`
- Darstellung: `record`; Rollen: Buchhaltung, Projektleiter, Geschäftsführung, Administrator. Gezeigtes Beispiel: Geschäftsführung.
- Hauptaktion: Bearbeiten.
- Gestaltungsentscheidung: Nur arbeitsrelevante Angaben; Details über die Zeile öffnen.
- Handy/Tablet: Zeilen statt zusätzlicher Karten; Hauptaktion bleibt gut erreichbar.
- Inhaltsgruppen: Positionen, Angaben, Verlauf.
- Weitere Aktionen: PDF laden, Als versendet markieren, Als abgelehnt markieren, Entwurf löschen.
- Unverändert erhalten: Angenommenes Angebot nicht als veränderbarer Entwurf darstellen; PDF; Bestehende Baustelle verlinken; Neue Fassung nur für versendet/abgelehnt; Buchhaltung liest nur.
- Quelle: `src/features/quotes/AngebotView.tsx`, `src/features/quotes/AbrechnungWahl.tsx`.

#### 204 · Angebot A-2026-0092 (`angebot-versendet`)

- Bestehender Ort: `/quotes/:id`
- Darstellung: `record`; Rollen: Buchhaltung, Projektleiter, Geschäftsführung, Administrator. Gezeigtes Beispiel: Geschäftsführung.
- Hauptaktion: Angebot annehmen.
- Gestaltungsentscheidung: Nur arbeitsrelevante Angaben; Details über die Zeile öffnen.
- Handy/Tablet: Zeilen statt zusätzlicher Karten; Hauptaktion bleibt gut erreichbar.
- Inhaltsgruppen: Positionen, Angaben, Verlauf.
- Weitere Aktionen: PDF laden, Neue Fassung, Als abgelehnt markieren.
- Unverändert erhalten: Angenommenes Angebot nicht als veränderbarer Entwurf darstellen; PDF; Bestehende Baustelle verlinken; Neue Fassung nur für versendet/abgelehnt; Buchhaltung liest nur.
- Quelle: `src/features/quotes/AngebotView.tsx`, `src/features/quotes/AbrechnungWahl.tsx`.

#### 205 · Angebot A-2026-0092 (`angebot-abgelehnt`)

- Bestehender Ort: `/quotes/:id`
- Darstellung: `record`; Rollen: Buchhaltung, Projektleiter, Geschäftsführung, Administrator. Gezeigtes Beispiel: Geschäftsführung.
- Hauptaktion: keine zusätzliche Hauptaktion.
- Gestaltungsentscheidung: Nur arbeitsrelevante Angaben; Details über die Zeile öffnen.
- Handy/Tablet: Zeilen statt zusätzlicher Karten; Hauptaktion bleibt gut erreichbar.
- Inhaltsgruppen: Positionen, Angaben, Verlauf.
- Weitere Aktionen: PDF laden, Neue Fassung.
- Unverändert erhalten: Angenommenes Angebot nicht als veränderbarer Entwurf darstellen; PDF; Bestehende Baustelle verlinken; Neue Fassung nur für versendet/abgelehnt; Buchhaltung liest nur.
- Quelle: `src/features/quotes/AngebotView.tsx`, `src/features/quotes/AbrechnungWahl.tsx`.

### Baustellen

#### 028 · Baustellen (`baustellen`)

- Bestehender Ort: `/admin-projects`
- Darstellung: `list`; Rollen: Projektleiter, Geschäftsführung, Administrator. Gezeigtes Beispiel: Geschäftsführung.
- Hauptaktion: Neue Baustelle.
- Gestaltungsentscheidung: Nur arbeitsrelevante Angaben; Details über die Zeile öffnen.
- Handy/Tablet: Zeilen statt zusätzlicher Karten; Hauptaktion bleibt gut erreichbar.
- Bereiche: Laufend, Geplant, Erledigt, Alle.
- Angaben/Felder: Nur meine Baustellen.
- Unverändert erhalten: Suche; Eigene/alle Baustellen; Status und Kundenbezug; Löschen bleibt geschützt.
- Quelle: `src/features/projects/AdminProjectsView.tsx`.

#### 029 · Neue Baustelle (`baustelle-neu`)

- Bestehender Ort: `/admin-projects · Anlegen`
- Darstellung: `form`; Rollen: Projektleiter, Geschäftsführung, Administrator. Gezeigtes Beispiel: Geschäftsführung.
- Hauptaktion: Baustelle anlegen.
- Gestaltungsentscheidung: Nur arbeitsrelevante Angaben; Details über die Zeile öffnen.
- Handy/Tablet: Zeilen statt zusätzlicher Karten; Hauptaktion bleibt gut erreichbar.
- Angaben/Felder: Projektnummer, Kunde, Bezeichnung, Baustellenadresse, Status, Abrechnung, Stundenbudget (kalkuliert), Beginn, Ende (geplant), Ansprechpartner vor Ort, Telefon vor Ort, Beschreibung / Auftragsumfang.
- Quelle: `src/features/projects/AdminProjectsView.tsx`.

#### 030 · Heizungstausch Sonnenhof (`baustelle`)

- Bestehender Ort: `/admin-projects/:id`
- Darstellung: `record`; Rollen: Projektleiter, Geschäftsführung, Administrator. Gezeigtes Beispiel: Geschäftsführung.
- Hauptaktion: Schein schreiben.
- Gestaltungsentscheidung: Arbeitsstand links, Budget und Notiz rechts. Keine zusätzliche Prozesskette und kein zweiter Verrechnungsbanner.
- Handy/Tablet: Zeilen statt zusätzlicher Karten; Hauptaktion bleibt gut erreichbar.
- Bereiche: Überblick, Stammdaten, Dokumente, Scheine, Termine.
- Inhaltsgruppen: Noch nicht verrechnet, Nächste Termine, Arbeitszeit, Notiz.
- Weitere Aktionen: Baustelle bearbeiten.
- Unverändert erhalten: Team und Projektleitung; Angebot der Baustelle; Abrechnung/Budget; Warnungen zum Betriebsurlaub; Kunde/Rechnungszugriff nach Recht.
- Quelle: `src/features/projects/BaustellenakteView.tsx`, `src/features/projects/BaustellenUebersicht.tsx`.

#### 031 · Baustellenstammdaten (`baustelle-daten`)

- Bestehender Ort: `/admin-projects/:id · Stammdaten`
- Darstellung: `form`; Rollen: Projektleiter, Geschäftsführung, Administrator. Gezeigtes Beispiel: Geschäftsführung.
- Hauptaktion: Änderungen speichern.
- Gestaltungsentscheidung: Nur arbeitsrelevante Angaben; Details über die Zeile öffnen.
- Handy/Tablet: Zeilen statt zusätzlicher Karten; Hauptaktion bleibt gut erreichbar.
- Bereiche: Überblick, Stammdaten, Dokumente, Scheine, Termine.
- Angaben/Felder: Projektnummer, Kunde, Bezeichnung, Baustellenadresse, Status, Abrechnung, Stundenbudget (kalkuliert), Beginn, Ende (geplant), Ansprechpartner vor Ort, Telefon vor Ort, Beschreibung / Auftragsumfang, Team, Projektleitung.
- Weitere Aktionen: Baustelle löschen.
- Unverändert erhalten: Warnung bei Nummernänderung; Ungespeicherte Angaben; Bisher zugeordnete deaktivierte Personen bleiben sichtbar.
- Quelle: `src/features/projects/BaustellenakteView.tsx`.

#### 032 · Pläne und Dokumente (`baustelle-dokumente`)

- Bestehender Ort: `/admin-projects/:id · Dokumente`
- Darstellung: `list`; Rollen: Projektleiter, Geschäftsführung, Administrator. Gezeigtes Beispiel: Geschäftsführung.
- Hauptaktion: Dokument hinzufügen.
- Gestaltungsentscheidung: Nur arbeitsrelevante Angaben; Details über die Zeile öffnen.
- Handy/Tablet: Zeilen statt zusätzlicher Karten; Hauptaktion bleibt gut erreichbar.
- Bereiche: Überblick, Stammdaten, Dokumente, Scheine, Termine.
- Unverändert erhalten: Bürodokumente nur für berechtigte Rollen; Pläne für Monteure; Löschen mit Bestätigung; Download/Öffnen.
- Quelle: `src/features/projects/BaustellenPlaene.tsx`, `src/features/projects/PlaeneListe.tsx`.

#### 033 · Dokument hinzufügen (`dokument-upload`)

- Bestehender Ort: `/admin-projects/:id · Upload`
- Darstellung: `panel`; Rollen: Projektleiter, Geschäftsführung, Administrator. Gezeigtes Beispiel: Geschäftsführung.
- Hauptaktion: Dokumente hochladen.
- Gestaltungsentscheidung: Nur arbeitsrelevante Angaben; Details über die Zeile öffnen.
- Handy/Tablet: Zeilen statt zusätzlicher Karten; Hauptaktion bleibt gut erreichbar.
- Angaben/Felder: Dokumente auswählen, Nur fürs Büro.
- Unverändert erhalten: Dateiformat/-größe prüfen; Bürobeleg nicht versehentlich als Plan freigeben; Uploadfehler je Datei.
- Quelle: `src/features/projects/BaustellenPlaene.tsx`.

#### 034 · Heizraum · Installationsplan (`dokument-vorschau`)

- Bestehender Ort: `Dokumentvorschau / Download`
- Darstellung: `document`; Rollen: Projektleiter, Geschäftsführung, Administrator. Gezeigtes Beispiel: Geschäftsführung.
- Hauptaktion: Herunterladen.
- Gestaltungsentscheidung: Dokumentfläche nutzt die verfügbare Breite. Metadaten und Download bleiben am Rand; kein zusätzlicher Dekorrahmen.
- Handy/Tablet: Zeilen statt zusätzlicher Karten; Hauptaktion bleibt gut erreichbar.
- Weitere Aktionen: Zur Dokumentliste.
- Unverändert erhalten: Tatsächlichen Inhalt anzeigen; Fehler/abgelaufenen Zugriff verständlich melden.
- Quelle: `src/features/projects/PlaeneListe.tsx`.

#### 035 · Handwerksscheine zur Baustelle (`baustelle-scheine`)

- Bestehender Ort: `/admin-projects/:id · Handwerksscheine`
- Darstellung: `list`; Rollen: Projektleiter, Geschäftsführung, Administrator. Gezeigtes Beispiel: Geschäftsführung.
- Hauptaktion: Schein schreiben.
- Gestaltungsentscheidung: Nur arbeitsrelevante Angaben; Details über die Zeile öffnen.
- Handy/Tablet: Zeilen statt zusätzlicher Karten; Hauptaktion bleibt gut erreichbar.
- Bereiche: Überblick, Stammdaten, Dokumente, Scheine, Termine.
- Unverändert erhalten: Alle Scheine der Baustelle; Entwurf/Unterschrieben/Verrechnet unterscheidbar.
- Quelle: `src/features/projects/BaustellenScheine.tsx`.

#### 036 · Meine Baustellen (`meine-baustellen`)

- Bestehender Ort: `/my-projects`
- Darstellung: `list`; Rollen: Mitarbeiter. Gezeigtes Beispiel: Mitarbeiter.
- Hauptaktion: keine zusätzliche Hauptaktion.
- Gestaltungsentscheidung: Nur arbeitsrelevante Angaben; Details über die Zeile öffnen.
- Handy/Tablet: Zeilen statt zusätzlicher Karten; Hauptaktion bleibt gut erreichbar.
- Unverändert erhalten: Teamzuordnung und Einteilung; Keine administrativen Stammdaten-/Margenaktionen; Kontakt vor Ort; Pläne.
- Quelle: `src/features/projects/MyProjectsView.tsx`, `src/features/projects/PlaeneListe.tsx`.

#### 037 · Pläne für Sonnenhof (`meine-plaene`)

- Bestehender Ort: `/my-projects · Pläne`
- Darstellung: `list`; Rollen: Mitarbeiter. Gezeigtes Beispiel: Mitarbeiter.
- Hauptaktion: keine zusätzliche Hauptaktion.
- Gestaltungsentscheidung: Nur arbeitsrelevante Angaben; Details über die Zeile öffnen.
- Handy/Tablet: Zeilen statt zusätzlicher Karten; Hauptaktion bleibt gut erreichbar.
- Unverändert erhalten: Nur freigegebene Teamdokumente; Keine Bürodokumente.
- Quelle: `src/features/projects/MyProjectsView.tsx`, `src/features/projects/PlaeneListe.tsx`.

#### 195 · Baustelle löschen (`baustelle-loeschen`)

- Bestehender Ort: `/admin-projects/:id · Baustelle löschen`
- Darstellung: `confirm`; Rollen: Projektleiter, Geschäftsführung, Administrator. Gezeigtes Beispiel: Geschäftsführung.
- Hauptaktion: Baustelle löschen.
- Gestaltungsentscheidung: Nur die konkrete Aufgabe mit ihren notwendigen Angaben. Keine zusätzliche Erklärungsebene.
- Handy/Tablet: Zeilen statt zusätzlicher Karten; Hauptaktion bleibt gut erreichbar.
- Inhaltsgruppen: Heizungstausch Sonnenhof.
- Unverändert erhalten: Bestehende Bestätigung und Löschgrenzen; Keine produktiven Daten im Entwurf.
- Quelle: `src/features/projects/AdminProjectsView.tsx`.

### Planung

#### 038 · Termine (`termine`)

- Bestehender Ort: `In Baustellen- und Kundenakte`
- Darstellung: `list`; Rollen: Verwaltung, Buchhaltung, Projektleiter, Geschäftsführung, Administrator. Gezeigtes Beispiel: Geschäftsführung.
- Hauptaktion: Termin anlegen.
- Gestaltungsentscheidung: Nur arbeitsrelevante Angaben; Details über die Zeile öffnen.
- Handy/Tablet: Zeilen statt zusätzlicher Karten; Hauptaktion bleibt gut erreichbar.
- Unverändert erhalten: Schreibrecht nur Verwaltung/Leitung; Kunden-/Baustellenbezug; Terminarten.
- Quelle: `src/features/termine/TermineKarte.tsx`, `src/features/termine/TerminListe.tsx`.

#### 039 · Termin planen (`termin`)

- Bestehender Ort: `Terminfenster`
- Darstellung: `panel`; Rollen: Verwaltung, Projektleiter, Geschäftsführung, Administrator. Gezeigtes Beispiel: Geschäftsführung.
- Hauptaktion: Termin speichern.
- Gestaltungsentscheidung: Nur arbeitsrelevante Angaben; Details über die Zeile öffnen.
- Handy/Tablet: Zeilen statt zusätzlicher Karten; Hauptaktion bleibt gut erreichbar.
- Angaben/Felder: Art, Tag, Beginn, Ende, Baustelle, Kunde, Notiz.
- Weitere Aktionen: Termin löschen.
- Quelle: `src/features/termine/TerminFenster.tsx`, `src/features/termine/TerminFormular.tsx`.

#### 040 · Einsatzplanung (`planung-woche`)

- Bestehender Ort: `/assignments/woche`
- Darstellung: `planner-week`; Rollen: Projektleiter, Geschäftsführung, Administrator. Gezeigtes Beispiel: Geschäftsführung.
- Hauptaktion: Einsatz planen.
- Gestaltungsentscheidung: Das Raster ist selbst das Arbeitswerkzeug. Freie Kapazität steht am betroffenen Tag, keine zusätzliche Statistikreihe.
- Handy/Tablet: Zeilen statt zusätzlicher Karten; Hauptaktion bleibt gut erreichbar.
- Bereiche: Woche, Monat, Tag.
- Weitere Aktionen: Kalender abonnieren.
- Unverändert erhalten: Personen-/Baustellenansicht; Tag/Woche/Monat; Abwesenheiten und Verfügbarkeit; Einteilung bearbeiten/löschen; Materialbedarf; Kalender-Abo.
- Quelle: `src/features/assignments/WochenplanView.tsx`, `src/features/assignments/MonatsAnsicht.tsx`, `src/features/assignments/AssignmentsView.tsx`.

#### 041 · Einsatzplanung (`planung-monat`)

- Bestehender Ort: `/assignments/woche?ansicht=monat`
- Darstellung: `planner-month`; Rollen: Projektleiter, Geschäftsführung, Administrator. Gezeigtes Beispiel: Geschäftsführung.
- Hauptaktion: Einsatz planen.
- Gestaltungsentscheidung: Das Raster ist selbst das Arbeitswerkzeug. Freie Kapazität steht am betroffenen Tag, keine zusätzliche Statistikreihe.
- Handy/Tablet: Zeilen statt zusätzlicher Karten; Hauptaktion bleibt gut erreichbar.
- Bereiche: Woche, Monat, Tag.
- Weitere Aktionen: Kalender abonnieren.
- Unverändert erhalten: Personen-/Baustellenansicht; Tag/Woche/Monat; Abwesenheiten und Verfügbarkeit; Einteilung bearbeiten/löschen; Materialbedarf; Kalender-Abo.
- Quelle: `src/features/assignments/WochenplanView.tsx`, `src/features/assignments/MonatsAnsicht.tsx`, `src/features/assignments/AssignmentsView.tsx`.

#### 042 · Einsatzplanung (`planung-tag`)

- Bestehender Ort: `/assignments/tag`
- Darstellung: `planner-day`; Rollen: Projektleiter, Geschäftsführung, Administrator. Gezeigtes Beispiel: Geschäftsführung.
- Hauptaktion: Einsatz planen.
- Gestaltungsentscheidung: Das Raster ist selbst das Arbeitswerkzeug. Freie Kapazität steht am betroffenen Tag, keine zusätzliche Statistikreihe.
- Handy/Tablet: Zeilen statt zusätzlicher Karten; Hauptaktion bleibt gut erreichbar.
- Bereiche: Woche, Monat, Tag.
- Weitere Aktionen: Kalender abonnieren.
- Unverändert erhalten: Personen-/Baustellenansicht; Tag/Woche/Monat; Abwesenheiten und Verfügbarkeit; Einteilung bearbeiten/löschen; Materialbedarf; Kalender-Abo.
- Quelle: `src/features/assignments/WochenplanView.tsx`, `src/features/assignments/MonatsAnsicht.tsx`, `src/features/assignments/AssignmentsView.tsx`.

#### 043 · Einsatz planen (`planung-einsatz`)

- Bestehender Ort: `/assignments · Einsatzfenster`
- Darstellung: `panel`; Rollen: Projektleiter, Geschäftsführung, Administrator. Gezeigtes Beispiel: Geschäftsführung.
- Hauptaktion: Einsatz speichern.
- Gestaltungsentscheidung: Nur arbeitsrelevante Angaben; Details über die Zeile öffnen.
- Handy/Tablet: Zeilen statt zusätzlicher Karten; Hauptaktion bleibt gut erreichbar.
- Angaben/Felder: Tag, Baustelle, Mitarbeiter, Als Helfer, Beginn (optional), Ende (optional), Kommentar / Aufgabe.
- Inhaltsgruppen: Material für diesen Einsatz.
- Weitere Aktionen: Material planen, Einsatz löschen.
- Unverändert erhalten: Doppelbelegung; Lehrlinge korrekt einstufen; Gespeicherte Einteilung bleibt bei Fehler sichtbar.
- Quelle: `src/features/assignments/EinsatzFenster.tsx`, `src/features/assignments/EinsatzFormular.tsx`.

#### 044 · Material für den Einsatz (`ruestliste-planen`)

- Bestehender Ort: `Einsatzfenster · Rüstliste`
- Darstellung: `panel`; Rollen: Projektleiter, Geschäftsführung, Administrator. Gezeigtes Beispiel: Geschäftsführung.
- Hauptaktion: Material hinzufügen.
- Gestaltungsentscheidung: Nur arbeitsrelevante Angaben; Details über die Zeile öffnen.
- Handy/Tablet: Zeilen statt zusätzlicher Karten; Hauptaktion bleibt gut erreichbar.
- Angaben/Felder: Artikel aus dem Lager, Menge.
- Unverändert erhalten: Lagerreservierung und freie Zeilen getrennt; Mengenprüfung.
- Quelle: `src/features/assignments/RuestlistePlanen.tsx`.

#### 045 · Material zum Einsatz (`ruestliste-abhaken`)

- Bestehender Ort: `/my-schedule · Rüstliste`
- Darstellung: `panel`; Rollen: Mitarbeiter, Projektleiter. Gezeigtes Beispiel: Mitarbeiter.
- Hauptaktion: Übernahme bestätigen.
- Gestaltungsentscheidung: Nur arbeitsrelevante Angaben; Details über die Zeile öffnen.
- Handy/Tablet: Zeilen statt zusätzlicher Karten; Hauptaktion bleibt gut erreichbar.
- Angaben/Felder: 8 Pressfitting Bogen 16 mm mitgenommen, 2 Thermostatventile mitgenommen.
- Unverändert erhalten: Nur eigener Einsatz; Bestandswirkung nicht doppelt auslösen.
- Quelle: `src/features/assignments/RuestlisteAbhaken.tsx`.

#### 046 · Mein Einsatzplan (`mein-plan`)

- Bestehender Ort: `/my-schedule/mein`
- Darstellung: `agenda`; Rollen: Mitarbeiter, Projektleiter. Gezeigtes Beispiel: Mitarbeiter.
- Hauptaktion: Zeit erfassen.
- Gestaltungsentscheidung: Nur arbeitsrelevante Angaben; Details über die Zeile öffnen.
- Handy/Tablet: Zeilen statt zusätzlicher Karten; Hauptaktion bleibt gut erreichbar.
- Weitere Aktionen: Team-Woche, Kalender abonnieren.
- Unverändert erhalten: Vergangene/nächste Einsätze und Termine; Kalender nur nach Betriebsschalter; Projektleitung nur wenn einplanbar freigegeben.
- Quelle: `src/features/assignments/MyScheduleView.tsx`.

#### 047 · Team-Woche (`team-woche`)

- Bestehender Ort: `/my-schedule/team`
- Darstellung: `planner-read`; Rollen: Mitarbeiter, Projektleiter. Gezeigtes Beispiel: Mitarbeiter.
- Hauptaktion: keine zusätzliche Hauptaktion.
- Gestaltungsentscheidung: Gleiches Raster wie Planung, aber ausschließlich lesend und ohne freie Kapazität oder Abwesenheitsgründe.
- Handy/Tablet: Zeilen statt zusätzlicher Karten; Hauptaktion bleibt gut erreichbar.
- Unverändert erhalten: Nur bei wochenplanFuerAlle; Abwesend ohne Grund; Keine Planungsaktionen; Datenbank-Sichtbarkeit bleibt gleich.
- Quelle: `src/features/assignments/TeamWoche.tsx`, `src/features/assignments/WochenplanView.tsx`.

#### 048 · Im eigenen Kalender (`kalender-abo`)

- Bestehender Ort: `Planung / Mein Einsatzplan · Kalender-Abo`
- Darstellung: `panel`; Rollen: Mitarbeiter, Verwaltung, Buchhaltung, Projektleiter, Geschäftsführung, Administrator. Gezeigtes Beispiel: Geschäftsführung.
- Hauptaktion: Kalender-Link erstellen.
- Gestaltungsentscheidung: Nur arbeitsrelevante Angaben; Details über die Zeile öffnen.
- Handy/Tablet: Zeilen statt zusätzlicher Karten; Hauptaktion bleibt gut erreichbar.
- Inhaltsgruppen: Kalender verbinden.
- Weitere Aktionen: Link widerrufen.
- Unverändert erhalten: Betriebsschalter; Geheimen Link nicht öffentlich zeigen; Widerruf bleibt erreichbar.
- Quelle: `src/features/assignments/KalenderAboKarte.tsx`.

### Scheine

#### 049 · Handwerksscheine (`scheine`)

- Bestehender Ort: `/worksheets`
- Darstellung: `list`; Rollen: Mitarbeiter, Verwaltung, Buchhaltung, Projektleiter, Geschäftsführung, Administrator. Gezeigtes Beispiel: Geschäftsführung.
- Hauptaktion: Neuer Schein.
- Gestaltungsentscheidung: Nur arbeitsrelevante Angaben; Details über die Zeile öffnen.
- Handy/Tablet: Zeilen statt zusätzlicher Karten; Hauptaktion bleibt gut erreichbar.
- Bereiche: Offen, Entwürfe, Verrechnet, Verworfen, Alle.
- Weitere Aktionen: Stunden ohne Buchung prüfen.
- Unverändert erhalten: Schreibrolle getrennt von Leserechten; Entwurf weiterbearbeiten; PDF; Verwerfen mit Pflichtgrund; Zeitnachtrag.
- Quelle: `src/features/worksheets/WorkSheetsListView.tsx`.

#### 050 · Handwerksschein 0318 (`schein-detail`)

- Bestehender Ort: `/worksheets · Einzelheiten`
- Darstellung: `record`; Rollen: Mitarbeiter, Verwaltung, Buchhaltung, Projektleiter, Geschäftsführung, Administrator. Gezeigtes Beispiel: Geschäftsführung.
- Hauptaktion: keine zusätzliche Hauptaktion.
- Gestaltungsentscheidung: Die unterschriebene Leistung steht im Mittelpunkt. Ein zusätzlicher Prozessstreifen und doppelte Verrechnungsaktionen entfallen.
- Handy/Tablet: Zeilen statt zusätzlicher Karten; Hauptaktion bleibt gut erreichbar.
- Inhaltsgruppen: Ausgeführte Arbeiten, Arbeitszeit, Material, Unterschriften.
- Weitere Aktionen: PDF laden, Zur Baustelle.
- Unverändert erhalten: Unterschriebene Scheine unveränderbar; PDF mit vollständigen Nachweisen; Abrechnung nur mit Rechnungsrecht.
- Quelle: `src/features/worksheets/WorkSheetsListView.tsx`, `src/features/worksheets/Schrittfolge.tsx`.

#### 051 · Handwerksschein – Entwurf (`schein-zeiten`)

- Bestehender Ort: `/worksheet · Zeiten`
- Darstellung: `form`; Rollen: Mitarbeiter, Projektleiter, Geschäftsführung, Administrator. Gezeigtes Beispiel: Mitarbeiter.
- Hauptaktion: Weiter zu Material.
- Gestaltungsentscheidung: Nur arbeitsrelevante Angaben; Details über die Zeile öffnen.
- Handy/Tablet: Handy/Tablet: vier direkt anwählbare Schritte. Desktop: alle Angaben auf einer Seite, ohne erzwungene Weiter-Klicks; die Daten bleiben erhalten.
- Bereiche: 1 · Zeiten, 2 · Material, 3 · Fotos, 4 · Unterschrift.
- Angaben/Felder: Baustelle, Leistungsdatum, Mitarbeiter, Von, Bis, Pause (Minuten), Tätigkeit, Als Helfer gearbeitet.
- Weitere Aktionen: Zeile hinzufügen.
- Unverändert erhalten: Entwurf bleibt beim Schrittwechsel erhalten; Mehrere Leistungszeiten; Kein doppeltes Buchen ins Zeitkonto.
- Quelle: `src/features/worksheets/WorkSheetView.tsx`, `src/features/worksheets/LeistungszeitErfassen.tsx`, `src/features/worksheets/Schrittfolge.tsx`.

#### 052 · Material erfassen (`schein-material`)

- Bestehender Ort: `/worksheet · Material`
- Darstellung: `form`; Rollen: Mitarbeiter, Projektleiter, Geschäftsführung, Administrator. Gezeigtes Beispiel: Mitarbeiter.
- Hauptaktion: Weiter zu Fotos.
- Gestaltungsentscheidung: Nur arbeitsrelevante Angaben; Details über die Zeile öffnen.
- Handy/Tablet: Handy/Tablet: vier direkt anwählbare Schritte. Desktop: alle Angaben auf einer Seite, ohne erzwungene Weiter-Klicks; die Daten bleiben erhalten.
- Bereiche: 1 · Zeiten, 2 · Material, 3 · Fotos, 4 · Unterschrift.
- Angaben/Felder: Artikel, Menge, Einheit.
- Weitere Aktionen: Material hinzufügen.
- Unverändert erhalten: Lagerartikel/freie Zeilen; Bestand/Reservierung; Einheiten und Nachkommastellen.
- Quelle: `src/features/worksheets/MaterialErfassen.tsx`, `src/features/worksheets/WorkSheetView.tsx`.

#### 053 · Fotos zum Schein (`schein-fotos`)

- Bestehender Ort: `/worksheet · Fotos`
- Darstellung: `form`; Rollen: Mitarbeiter, Projektleiter, Geschäftsführung, Administrator. Gezeigtes Beispiel: Mitarbeiter.
- Hauptaktion: Zur Unterschrift.
- Gestaltungsentscheidung: Nur arbeitsrelevante Angaben; Details über die Zeile öffnen.
- Handy/Tablet: Handy/Tablet: vier direkt anwählbare Schritte. Desktop: alle Angaben auf einer Seite, ohne erzwungene Weiter-Klicks; die Daten bleiben erhalten.
- Bereiche: 1 · Zeiten, 2 · Material, 3 · Fotos, 4 · Unterschrift.
- Angaben/Felder: Aufnahme vom Einsatz, Notizen, Regiearbeiten, Mängel (bei Bedarf).
- Inhaltsgruppen: Aufnahmen.
- Weitere Aktionen: Foto aufnehmen.
- Unverändert erhalten: Kamera und Dateiauswahl; Bild entfernen; Upload läuft/Fehler/offline; Fotos optional nach bestehender Regel.
- Quelle: `src/features/worksheets/WorkSheetView.tsx`, `src/features/worksheets/Fotostreifen.tsx`.

#### 054 · Leistung bestätigen (`schein-unterschrift`)

- Bestehender Ort: `/worksheet · Unterschrift`
- Darstellung: `signature`; Rollen: Mitarbeiter, Projektleiter, Geschäftsführung, Administrator. Gezeigtes Beispiel: Mitarbeiter.
- Hauptaktion: Unterschriebenen Schein abschließen.
- Gestaltungsentscheidung: Nur arbeitsrelevante Angaben; Details über die Zeile öffnen.
- Handy/Tablet: Handy/Tablet: vier direkt anwählbare Schritte. Desktop: alle Angaben auf einer Seite, ohne erzwungene Weiter-Klicks; die Daten bleiben erhalten.
- Bereiche: 1 · Zeiten, 2 · Material, 3 · Fotos, 4 · Unterschrift.
- Angaben/Felder: Monteur (Name in Druckbuchstaben), Unterschrift Monteur, Kunde (Name in Druckbuchstaben), Unterschrift Kunde.
- Inhaltsgruppen: Zusammenfassung.
- Unverändert erhalten: Zusammenfassung vor Unterschriften; Beide Signaturen; Danach unveränderbar; Offene Uploads blockieren Abschluss korrekt.
- Quelle: `src/features/worksheets/WorkSheetView.tsx`, `src/features/worksheets/Schrittfolge.tsx`.

#### 055 · Entwurf verwerfen (`schein-verwerfen`)

- Bestehender Ort: `/worksheets · Verwerfen`
- Darstellung: `confirm`; Rollen: Mitarbeiter, Projektleiter, Geschäftsführung, Administrator. Gezeigtes Beispiel: Geschäftsführung.
- Hauptaktion: Entwurf verwerfen.
- Gestaltungsentscheidung: Nur arbeitsrelevante Angaben; Details über die Zeile öffnen.
- Handy/Tablet: Zeilen statt zusätzlicher Karten; Hauptaktion bleibt gut erreichbar.
- Angaben/Felder: Grund (Pflicht).
- Unverändert erhalten: Pflichtgrund; Kein Löschen unterschriebener Leistung; Verworfene weiterhin auffindbar.
- Quelle: `src/features/worksheets/WorkSheetsListView.tsx`.

#### 056 · Stunden ohne Zeitbuchung (`schein-zeit-nachtragen`)

- Bestehender Ort: `/worksheets · Zeitnachtrag`
- Darstellung: `panel`; Rollen: Buchhaltung, Geschäftsführung, Administrator. Gezeigtes Beispiel: Geschäftsführung.
- Hauptaktion: Fehlende Buchung prüfen.
- Gestaltungsentscheidung: Nur arbeitsrelevante Angaben; Details über die Zeile öffnen.
- Handy/Tablet: Zeilen statt zusätzlicher Karten; Hauptaktion bleibt gut erreichbar.
- Unverändert erhalten: Scheinleistung und Zeitkonto getrennt; Vor Nachtrag auf vorhandene Buchungen prüfen.
- Quelle: `src/features/worksheets/WorkSheetsListView.tsx`, `src/features/worksheets/fehlendeZeitbuchung.ts`.

### Material

#### 057 · Material anfordern (`material`)

- Bestehender Ort: `/material`
- Darstellung: `catalog`; Rollen: Verwaltung, Projektleiter, Geschäftsführung, Administrator, Mitarbeiter. Gezeigtes Beispiel: Mitarbeiter.
- Hauptaktion: Warenkorb ansehen.
- Gestaltungsentscheidung: Nur arbeitsrelevante Angaben; Details über die Zeile öffnen.
- Handy/Tablet: Zeilen statt zusätzlicher Karten; Hauptaktion bleibt gut erreichbar.
- Bereiche: Katalog, Meine Anforderungen.
- Angaben/Felder: Für welche Baustelle?, Eilzustellung.
- Unverändert erhalten: Katalog und freie Bezeichnung; Menge/Einheit; Eilzustellung; Bestellnotiz; Retoure.
- Quelle: `src/features/orders/OrderView.tsx`.

#### 058 · Anforderung prüfen (`material-warenkorb`)

- Bestehender Ort: `/material · Warenkorb`
- Darstellung: `form`; Rollen: Verwaltung, Projektleiter, Geschäftsführung, Administrator, Mitarbeiter. Gezeigtes Beispiel: Mitarbeiter.
- Hauptaktion: Material anfordern.
- Gestaltungsentscheidung: Nur arbeitsrelevante Angaben; Details über die Zeile öffnen.
- Handy/Tablet: Zeilen statt zusätzlicher Karten; Hauptaktion bleibt gut erreichbar.
- Angaben/Felder: Notiz für die Projektleitung, Eilzustellung.
- Unverändert erhalten: Bearbeiten/Entfernen im Warenkorb; Keine Einkaufspreise ohne Recht; Fachlicher Status erst nach erfolgreichem Absenden.
- Quelle: `src/features/orders/OrderView.tsx`.

#### 059 · Meine Anforderungen (`material-meine`)

- Bestehender Ort: `/material · Meine Anforderungen`
- Darstellung: `list`; Rollen: Verwaltung, Projektleiter, Geschäftsführung, Administrator, Mitarbeiter. Gezeigtes Beispiel: Mitarbeiter.
- Hauptaktion: Material anfordern.
- Gestaltungsentscheidung: Nur arbeitsrelevante Angaben; Details über die Zeile öffnen.
- Handy/Tablet: Zeilen statt zusätzlicher Karten; Hauptaktion bleibt gut erreichbar.
- Bereiche: Laufend, Erledigt.
- Weitere Aktionen: Material zurückgeben.
- Unverändert erhalten: Abholbereit/Bestellt/Erledigt; Abholung bestätigen; Als eilig markieren; Rückgabe Zustand/Bezug.
- Quelle: `src/features/orders/OrderView.tsx`.

#### 060 · Material abholen (`anforderung-abholen`)

- Bestehender Ort: `/material · Abholung`
- Darstellung: `confirm`; Rollen: Verwaltung, Projektleiter, Geschäftsführung, Administrator, Mitarbeiter. Gezeigtes Beispiel: Mitarbeiter.
- Hauptaktion: Als abgeholt bestätigen.
- Gestaltungsentscheidung: Nur arbeitsrelevante Angaben; Details über die Zeile öffnen.
- Handy/Tablet: Zeilen statt zusätzlicher Karten; Hauptaktion bleibt gut erreichbar.
- Inhaltsgruppen: Abholbereit.
- Unverändert erhalten: Bestätigung und Bestandswirkung bleiben genau einmal.
- Quelle: `src/features/orders/OrderView.tsx`.

#### 061 · Material zurückgeben (`material-retoure`)

- Bestehender Ort: `/material · Retoure`
- Darstellung: `panel`; Rollen: Verwaltung, Projektleiter, Geschäftsführung, Administrator, Mitarbeiter. Gezeigtes Beispiel: Mitarbeiter.
- Hauptaktion: Retoure erfassen.
- Gestaltungsentscheidung: Nur arbeitsrelevante Angaben; Details über die Zeile öffnen.
- Handy/Tablet: Zeilen statt zusätzlicher Karten; Hauptaktion bleibt gut erreichbar.
- Angaben/Felder: Material, Menge, Zustand, Von welcher Baustelle?, Grund / Notiz.
- Unverändert erhalten: Menge/Zustand; Keine automatische Lagerfreigabe vor Prüfung.
- Quelle: `src/features/orders/OrderView.tsx`.

#### 062 · Anforderungen (`anforderungen`)

- Bestehender Ort: `/anforderungen`
- Darstellung: `list`; Rollen: Verwaltung, Projektleiter, Geschäftsführung, Administrator. Gezeigtes Beispiel: Verwaltung.
- Hauptaktion: keine zusätzliche Hauptaktion.
- Gestaltungsentscheidung: Nur arbeitsrelevante Angaben; Details über die Zeile öffnen.
- Handy/Tablet: Zeilen statt zusätzlicher Karten; Hauptaktion bleibt gut erreichbar.
- Bereiche: Laufend, Einkauf, Retouren, Erledigt.
- Unverändert erhalten: Baustellenfilter; Eilige/überfällige/abholbereite Anforderungen; Sammelaktionen und Teilfehler; Statusaktionen je Eintrag.
- Quelle: `src/features/orders/AdminOrdersView.tsx`.

#### 063 · Anforderung bearbeiten (`anforderung-detail`)

- Bestehender Ort: `/anforderungen · Einzelheiten`
- Darstellung: `panel`; Rollen: Verwaltung, Projektleiter, Geschäftsführung, Administrator. Gezeigtes Beispiel: Verwaltung.
- Hauptaktion: Annehmen.
- Gestaltungsentscheidung: Nur arbeitsrelevante Angaben; Details über die Zeile öffnen.
- Handy/Tablet: Zeilen statt zusätzlicher Karten; Hauptaktion bleibt gut erreichbar.
- Angaben/Felder: Großhändler, Notiz.
- Inhaltsgruppen: Bedarf.
- Weitere Aktionen: Auf die Einkaufsliste, Als abholbereit markieren, Anforderung abschließen.
- Unverändert erhalten: Bestellen/Liefern/Abholbereit/Abschließen nur passend zum Status; Lagerreservierung bleibt korrekt.
- Quelle: `src/features/orders/AdminOrdersView.tsx`.

#### 064 · Einkaufsliste (`einkauf`)

- Bestehender Ort: `/anforderungen · Einkauf`
- Darstellung: `list`; Rollen: Verwaltung, Projektleiter, Geschäftsführung, Administrator. Gezeigtes Beispiel: Verwaltung.
- Hauptaktion: Material dazusetzen.
- Gestaltungsentscheidung: Nur arbeitsrelevante Angaben; Details über die Zeile öffnen.
- Handy/Tablet: Zeilen statt zusätzlicher Karten; Hauptaktion bleibt gut erreichbar.
- Bereiche: Laufend, Einkauf, Retouren, Erledigt.
- Weitere Aktionen: Großhändler verwalten, Bestell-PDF laden.
- Unverändert erhalten: Nach Lieferant gruppieren; Bestell-PDF; Als bestellt markieren; Liefertermin ändern; Freier Zusatzartikel.
- Quelle: `src/features/orders/Einkaufsliste.tsx`.

#### 065 · Bestellung festhalten (`einkauf-bestellen`)

- Bestehender Ort: `/anforderungen · Als bestellt markieren`
- Darstellung: `panel`; Rollen: Verwaltung, Projektleiter, Geschäftsführung, Administrator. Gezeigtes Beispiel: Verwaltung.
- Hauptaktion: Als bestellt markieren.
- Gestaltungsentscheidung: Nur arbeitsrelevante Angaben; Details über die Zeile öffnen.
- Handy/Tablet: Zeilen statt zusätzlicher Karten; Hauptaktion bleibt gut erreichbar.
- Angaben/Felder: Großhändler, Erwarteter Liefertermin.
- Unverändert erhalten: Bewusste Bestätigung; Bestellaktion versendet nicht automatisch eine E-Mail; Liefertermin optional.
- Quelle: `src/features/orders/Einkaufsliste.tsx`.

#### 066 · Material dazusetzen (`einkauf-hinzufuegen`)

- Bestehender Ort: `/anforderungen · Einkauf ergänzen`
- Darstellung: `panel`; Rollen: Verwaltung, Projektleiter, Geschäftsführung, Administrator. Gezeigtes Beispiel: Verwaltung.
- Hauptaktion: Zur Einkaufsliste hinzufügen.
- Gestaltungsentscheidung: Nur arbeitsrelevante Angaben; Details über die Zeile öffnen.
- Handy/Tablet: Zeilen statt zusätzlicher Karten; Hauptaktion bleibt gut erreichbar.
- Angaben/Felder: Artikel, Menge, Großhändler, Anmerkung (bei Bedarf).
- Quelle: `src/features/orders/Einkaufsliste.tsx`.

#### 067 · Großhändler (`grosshaendler`)

- Bestehender Ort: `/anforderungen · Großhändler`
- Darstellung: `form`; Rollen: Verwaltung, Projektleiter, Geschäftsführung, Administrator. Gezeigtes Beispiel: Verwaltung.
- Hauptaktion: Großhändler speichern.
- Gestaltungsentscheidung: Nur arbeitsrelevante Angaben; Details über die Zeile öffnen.
- Handy/Tablet: Zeilen statt zusätzlicher Karten; Hauptaktion bleibt gut erreichbar.
- Angaben/Felder: Name, Kundennummer, Bestelladresse (E-Mail), Kontakt.
- Quelle: `src/features/orders/Einkaufsliste.tsx`.

#### 068 · Retouren prüfen (`retouren`)

- Bestehender Ort: `/anforderungen · Retouren`
- Darstellung: `list`; Rollen: Verwaltung, Projektleiter, Geschäftsführung, Administrator. Gezeigtes Beispiel: Verwaltung.
- Hauptaktion: keine zusätzliche Hauptaktion.
- Gestaltungsentscheidung: Nur arbeitsrelevante Angaben; Details über die Zeile öffnen.
- Handy/Tablet: Zeilen statt zusätzlicher Karten; Hauptaktion bleibt gut erreichbar.
- Bereiche: Laufend, Einkauf, Retouren, Erledigt.
- Unverändert erhalten: Einlagern oder ausscheiden; Keine ungeprüften Retouren im verfügbaren Lager.
- Quelle: `src/features/orders/AdminOrdersView.tsx`.

#### 069 · Retoure prüfen (`retoure-pruefen`)

- Bestehender Ort: `/anforderungen · Retoure bearbeiten`
- Darstellung: `panel`; Rollen: Verwaltung, Projektleiter, Geschäftsführung, Administrator. Gezeigtes Beispiel: Verwaltung.
- Hauptaktion: Ins Lager übernehmen.
- Gestaltungsentscheidung: Nur arbeitsrelevante Angaben; Details über die Zeile öffnen.
- Handy/Tablet: Zeilen statt zusätzlicher Karten; Hauptaktion bleibt gut erreichbar.
- Angaben/Felder: Prüfvermerk.
- Inhaltsgruppen: Rückgabe.
- Weitere Aktionen: Ausscheiden.
- Unverändert erhalten: Zustand und Bestandsbewegung nachvollziehbar.
- Quelle: `src/features/orders/AdminOrdersView.tsx`.

#### 070 · Erledigte Anforderungen (`anforderungen-archiv`)

- Bestehender Ort: `/anforderungen · Erledigt`
- Darstellung: `list`; Rollen: Verwaltung, Projektleiter, Geschäftsführung, Administrator. Gezeigtes Beispiel: Verwaltung.
- Hauptaktion: keine zusätzliche Hauptaktion.
- Gestaltungsentscheidung: Nur arbeitsrelevante Angaben; Details über die Zeile öffnen.
- Handy/Tablet: Zeilen statt zusätzlicher Karten; Hauptaktion bleibt gut erreichbar.
- Bereiche: Laufend, Einkauf, Retouren, Erledigt.
- Unverändert erhalten: Historie bleibt suchbar; Löschen mit bestehender Bestätigung.
- Quelle: `src/features/orders/AdminOrdersView.tsx`.

### Lager

#### 071 · Lager (`lager`)

- Bestehender Ort: `/lager`
- Darstellung: `list`; Rollen: Verwaltung, Projektleiter, Geschäftsführung, Administrator. Gezeigtes Beispiel: Verwaltung.
- Hauptaktion: Wareneingang.
- Gestaltungsentscheidung: Nur arbeitsrelevante Angaben; Details über die Zeile öffnen.
- Handy/Tablet: Zeilen statt zusätzlicher Karten; Hauptaktion bleibt gut erreichbar.
- Bereiche: Bestände, Katalog.
- Weitere Aktionen: Inventur, Katalog einspielen.
- Unverändert erhalten: Bestand/frei/reserviert getrennt; Knapp-Filter; Buchungen mit Grund/Bezug; Einkaufspreise nur mit Recht.
- Quelle: `src/features/orders/StockView.tsx`.

#### 072 · Pressfitting Bogen 16 mm (`lager-artikel`)

- Bestehender Ort: `/lager · Artikel`
- Darstellung: `record`; Rollen: Verwaltung, Projektleiter, Geschäftsführung, Administrator. Gezeigtes Beispiel: Verwaltung.
- Hauptaktion: Wareneingang.
- Gestaltungsentscheidung: Nur arbeitsrelevante Angaben; Details über die Zeile öffnen.
- Handy/Tablet: Zeilen statt zusätzlicher Karten; Hauptaktion bleibt gut erreichbar.
- Inhaltsgruppen: Angaben, Letzte Bewegungen.
- Weitere Aktionen: Inventur, Alle Bewegungen.
- Unverändert erhalten: Bewegungstypen nicht als identische Bestandsabgänge darstellen; Negativer/Reservierter Bestand transparent; Bestand 8 minus reserviert 6 = frei 2; diese Zahlen gelten für den gezeigten Artikel.
- Quelle: `src/features/orders/StockView.tsx`, `src/features/orders/LagerDialoge.tsx`.

#### 073 · Wareneingang buchen (`wareneingang`)

- Bestehender Ort: `/lager · Wareneingang`
- Darstellung: `panel`; Rollen: Verwaltung, Projektleiter, Geschäftsführung, Administrator. Gezeigtes Beispiel: Verwaltung.
- Hauptaktion: Einbuchen.
- Gestaltungsentscheidung: Nur arbeitsrelevante Angaben; Details über die Zeile öffnen.
- Handy/Tablet: Zeilen statt zusätzlicher Karten; Hauptaktion bleibt gut erreichbar.
- Angaben/Felder: Artikel, Menge, Lieferant, Lieferschein-Nr., Bestellbezug.
- Unverändert erhalten: Lieferant Pflicht; Freier Lieferant möglich; Mengen-/Einheitenprüfung; Bewegungsprotokoll.
- Quelle: `src/features/orders/LagerDialoge.tsx`.

#### 074 · Inventur erfassen (`inventur`)

- Bestehender Ort: `/lager · Inventur`
- Darstellung: `panel`; Rollen: Verwaltung, Projektleiter, Geschäftsführung, Administrator. Gezeigtes Beispiel: Verwaltung.
- Hauptaktion: Bestand berichtigen.
- Gestaltungsentscheidung: Nur arbeitsrelevante Angaben; Details über die Zeile öffnen.
- Handy/Tablet: Zeilen statt zusätzlicher Karten; Hauptaktion bleibt gut erreichbar.
- Angaben/Felder: Artikel, Gezählter Bestand, Grund.
- Unverändert erhalten: Gezählter Bestand statt Zu-/Abgang; Pflichtgrund; Reservierungen berücksichtigen.
- Quelle: `src/features/orders/LagerDialoge.tsx`.

#### 075 · Lagerbewegungen (`lager-bewegungen`)

- Bestehender Ort: `/lager · Bewegungsprotokoll`
- Darstellung: `record`; Rollen: Verwaltung, Projektleiter, Geschäftsführung, Administrator. Gezeigtes Beispiel: Verwaltung.
- Hauptaktion: keine zusätzliche Hauptaktion.
- Gestaltungsentscheidung: Nur arbeitsrelevante Angaben; Details über die Zeile öffnen.
- Handy/Tablet: Zeilen statt zusätzlicher Karten; Hauptaktion bleibt gut erreichbar.
- Unverändert erhalten: Verlauf chronologisch; Lieferant/Lieferschein/Bestellbezug; Mehr anzeigen.
- Quelle: `src/features/orders/LagerDialoge.tsx`.

#### 076 · Materialkatalog (`katalog`)

- Bestehender Ort: `/lager · Katalog`
- Darstellung: `list`; Rollen: Verwaltung, Projektleiter, Geschäftsführung, Administrator. Gezeigtes Beispiel: Verwaltung.
- Hauptaktion: Neues Material.
- Gestaltungsentscheidung: Nur arbeitsrelevante Angaben; Details über die Zeile öffnen.
- Handy/Tablet: Zeilen statt zusätzlicher Karten; Hauptaktion bleibt gut erreichbar.
- Bereiche: Bestände, Katalog.
- Weitere Aktionen: DATANORM einspielen.
- Unverändert erhalten: Kategorien/Warengruppen; Lagerführung; Verkaufs-/Einkaufspreise getrennt; Importrecht.
- Quelle: `src/features/orders/MaterialCatalog.tsx`.

#### 077 · Material bearbeiten (`katalog-artikel`)

- Bestehender Ort: `/lager · Katalogartikel`
- Darstellung: `form`; Rollen: Verwaltung, Projektleiter, Geschäftsführung, Administrator. Gezeigtes Beispiel: Administrator.
- Hauptaktion: Material speichern.
- Gestaltungsentscheidung: Nur arbeitsrelevante Angaben; Details über die Zeile öffnen.
- Handy/Tablet: Zeilen statt zusätzlicher Karten; Hauptaktion bleibt gut erreichbar.
- Angaben/Felder: Bezeichnung, Kategorie, Artikelnummer, Warengruppe, Einheit, Im Lager führen, Anfangsbestand (nur beim Anlegen), Mindestmenge, Verkaufspreis netto je Einheit (€), Einkaufspreis netto je Einheit (€).
- Weitere Aktionen: Material löschen.
- Unverändert erhalten: Anfangsbestand nicht als freie Bestandsänderung missbrauchen; Einkauf nur für Berechtigte.
- Quelle: `src/features/orders/MaterialCatalog.tsx`.

#### 078 · Katalog einspielen (`katalog-import`)

- Bestehender Ort: `/lager · DATANORM-Import`
- Darstellung: `form`; Rollen: Geschäftsführung, Administrator, Verwaltung. Gezeigtes Beispiel: Administrator.
- Hauptaktion: Probelauf starten.
- Gestaltungsentscheidung: Nur arbeitsrelevante Angaben; Details über die Zeile öffnen.
- Handy/Tablet: Zeilen statt zusätzlicher Karten; Hauptaktion bleibt gut erreichbar.
- Angaben/Felder: Lieferant, Name des Lieferanten, DATANORM-Datei.
- Inhaltsgruppen: Importstand.
- Unverändert erhalten: Freigabe katalogEinspielen; Lieferant wählen; Mapping abweichender Felder; Vorschau/Probelauf/Übernahme getrennt; Resultat neu/aktualisiert/ausgelaufen/ohne Preis.
- Quelle: `src/features/materials/KatalogImport.tsx`.

#### 079 · Katalogimport prüfen (`katalog-import-vorschau`)

- Bestehender Ort: `/lager · DATANORM-Import`
- Darstellung: `record`; Rollen: Geschäftsführung, Administrator, Verwaltung. Gezeigtes Beispiel: Administrator.
- Hauptaktion: Gültige Artikel übernehmen.
- Gestaltungsentscheidung: Nur arbeitsrelevante Angaben; Details über die Zeile öffnen.
- Handy/Tablet: Zeilen statt zusätzlicher Karten; Hauptaktion bleibt gut erreichbar.
- Inhaltsgruppen: Vorschau.
- Unverändert erhalten: Freigabe katalogEinspielen; Lieferant wählen; Mapping abweichender Felder; Vorschau/Probelauf/Übernahme getrennt; Resultat neu/aktualisiert/ausgelaufen/ohne Preis.
- Quelle: `src/features/materials/KatalogImport.tsx`.

#### 080 · Ergebnis des Katalogimports (`katalog-import-ergebnis`)

- Bestehender Ort: `/lager · DATANORM-Import`
- Darstellung: `record`; Rollen: Geschäftsführung, Administrator, Verwaltung. Gezeigtes Beispiel: Administrator.
- Hauptaktion: keine zusätzliche Hauptaktion.
- Gestaltungsentscheidung: Nur arbeitsrelevante Angaben; Details über die Zeile öffnen.
- Handy/Tablet: Zeilen statt zusätzlicher Karten; Hauptaktion bleibt gut erreichbar.
- Inhaltsgruppen: Importstand.
- Unverändert erhalten: Freigabe katalogEinspielen; Lieferant wählen; Mapping abweichender Felder; Vorschau/Probelauf/Übernahme getrennt; Resultat neu/aktualisiert/ausgelaufen/ohne Preis.
- Quelle: `src/features/materials/KatalogImport.tsx`.

### Rechnungen

#### 081 · Rechnungen (`rechnungen`)

- Bestehender Ort: `/invoices`
- Darstellung: `invoice-split`; Rollen: Buchhaltung, Geschäftsführung, Administrator. Gezeigtes Beispiel: Geschäftsführung.
- Hauptaktion: Neue Rechnung.
- Gestaltungsentscheidung: Summenzeile reicht. Forderungsdiagramm, wiederholte Statushinweise und getrennte Linkblöcke entfallen.
- Handy/Tablet: Zeilen statt zusätzlicher Karten; Hauptaktion bleibt gut erreichbar.
- Bereiche: Offen, Mahnungen, Alle.
- Weitere Aktionen: Buchhaltungs-Export.
- Unverändert erhalten: Alle bisherigen Filter/Status; Nicht verrechnete Leistung; Mahnlauf; Suche über alle; Beleg- und Stornoaktionen.
- Quelle: `src/features/invoices/InvoicesView.tsx`, `src/features/invoices/RechnungsListe.tsx`, `src/features/invoices/RechnungDetail.tsx`.

#### 082 · Rechnung RE-2026-0234 (`rechnung-detail`)

- Bestehender Ort: `/invoices · Detail`
- Darstellung: `record`; Rollen: Buchhaltung, Geschäftsführung, Administrator. Gezeigtes Beispiel: Geschäftsführung.
- Hauptaktion: Zahlung erfassen.
- Gestaltungsentscheidung: Nur arbeitsrelevante Angaben; Details über die Zeile öffnen.
- Handy/Tablet: Eigenständiges Detail ohne die allgemeinen Summen; Zurück erhält Filter, Auswahl und Scrollposition.
- Inhaltsgruppen: Rechnungsangaben, Zahlungen, Mahnungen.
- Weitere Aktionen: PDF laden, Mahnung prüfen, Bankgarantie, Stornieren.
- Unverändert erhalten: Teilzahlungen/Rückzahlungen; Guthaben; Rabatt/Skonto/Rücklass; Mahnverlauf; Stornobelege.
- Quelle: `src/features/invoices/RechnungDetail.tsx`, `src/features/invoices/InvoicesView.tsx`.

#### 083 · Rechnungen meiner Baustellen (`rechnungen-lesen`)

- Bestehender Ort: `/invoices · Projektleitung`
- Darstellung: `list`; Rollen: Projektleiter. Gezeigtes Beispiel: Projektleiter.
- Hauptaktion: keine zusätzliche Hauptaktion.
- Gestaltungsentscheidung: Nur arbeitsrelevante Angaben; Details über die Zeile öffnen.
- Handy/Tablet: Zeilen statt zusätzlicher Karten; Hauptaktion bleibt gut erreichbar.
- Unverändert erhalten: Nur mit rechnungenLesen; Nur eigene Baustellen; Keine Erstell-/Zahlungs-/Stornoaktionen.
- Quelle: `src/features/invoices/RechnungenLesen.tsx`, `src/features/invoices/RechnungenSeite.tsx`.

#### 084 · Rechnung vorbereiten (`rechnung-neu`)

- Bestehender Ort: `/invoices · Neue Rechnung`
- Darstellung: `editor`; Rollen: Buchhaltung, Geschäftsführung, Administrator. Gezeigtes Beispiel: Geschäftsführung.
- Hauptaktion: Vorschau erstellen.
- Gestaltungsentscheidung: Nur arbeitsrelevante Angaben; Details über die Zeile öffnen.
- Handy/Tablet: Zeilen statt zusätzlicher Karten; Hauptaktion bleibt gut erreichbar.
- Angaben/Felder: Baustelle, Art der Rechnung, Anteil vom angenommenen Angebot (%) (bei Bedarf), Facharbeiter €/h (bei Bedarf), Helfer €/h (bei Bedarf), Nachtzuschlag % (bei Bedarf), Notdienstzuschlag % (bei Bedarf), Zahlungsziel (Tage) (bei Bedarf), Skonto % (bei Bedarf), Skontofrist (Tage) (bei Bedarf).
- Inhaltsgruppen: Unterschriebene Scheine, Konditionen dieser Rechnung.
- Unverändert erhalten: Regie/Pauschale/Anzahlung/Teil/Schluss; Scheinabgleich; Konditionen aus Bestand; Keine Nummernvergabe vor Erstellung.
- Quelle: `src/features/invoices/InvoicesView.tsx`.

#### 085 · Rechnung prüfen (`rechnung-vorschau`)

- Bestehender Ort: `/invoices · Vorschau`
- Darstellung: `editor`; Rollen: Buchhaltung, Geschäftsführung, Administrator. Gezeigtes Beispiel: Geschäftsführung.
- Hauptaktion: Rechnung verbindlich erstellen.
- Gestaltungsentscheidung: Nur arbeitsrelevante Angaben; Details über die Zeile öffnen.
- Handy/Tablet: Zeilen statt zusätzlicher Karten; Hauptaktion bleibt gut erreichbar.
- Angaben/Felder: Rechnungsnummer, Leistungsnachweis anhängen, Umsatzsteuer, Bauleistung – Übergang der Steuerschuld (§ 19 Abs 1a UStG), UID-Nummer des Kunden (bei Bedarf), Grund der Steuerbefreiung (bei Bedarf), Bestellnummer des Kunden (bei Bedarf), Rabatt – Bezeichnung (bei Bedarf), Rabattart (bei Bedarf), Rabattwert (bei Bedarf), Rücklass (%) (bei Bedarf), Fällig am.
- Inhaltsgruppen: Leistungen, Summen.
- Unverändert erhalten: Nummernprüfung und Empfänger-/Firmensperren; Material-/Leistungspositionen bearbeitbar nach Bestandsregeln; Reverse Charge nur bei gültigen Voraussetzungen; Skonto/Rabatt/Rücklass; Serverwerte maßgeblich.
- Quelle: `src/features/invoices/InvoicesView.tsx`.

#### 086 · Anzahlungsrechnung vorbereiten (`rechnung-anzahlung`)

- Bestehender Ort: `/invoices · Anzahlung`
- Darstellung: `editor`; Rollen: Buchhaltung, Geschäftsführung, Administrator. Gezeigtes Beispiel: Geschäftsführung.
- Hauptaktion: Vorschau erstellen.
- Gestaltungsentscheidung: Nur arbeitsrelevante Angaben; Details über die Zeile öffnen.
- Handy/Tablet: Zeilen statt zusätzlicher Karten; Hauptaktion bleibt gut erreichbar.
- Angaben/Felder: Baustelle, Anteil vom angenommenen Angebot (%), Bestellnummer des Kunden (bei Bedarf).
- Inhaltsgruppen: Bisherige Abrechnung, Prüfung.
- Unverändert erhalten: Betriebsfreigabe für Teil-/Schlussrechnungen; Keine doppelte Verrechnung; Vorbelege und Anzahlungsabzüge; Kein neuer Berechnungsweg.
- Quelle: `src/features/invoices/InvoicesView.tsx`, `src/features/invoices/anzahlung.ts`, `src/features/invoices/vorrechnungen.ts`.

#### 087 · Teilrechnung vorbereiten (`rechnung-teil`)

- Bestehender Ort: `/invoices · Teilrechnung`
- Darstellung: `editor`; Rollen: Buchhaltung, Geschäftsführung, Administrator. Gezeigtes Beispiel: Geschäftsführung.
- Hauptaktion: Vorschau erstellen.
- Gestaltungsentscheidung: Nur arbeitsrelevante Angaben; Details über die Zeile öffnen.
- Handy/Tablet: Zeilen statt zusätzlicher Karten; Hauptaktion bleibt gut erreichbar.
- Angaben/Felder: Baustelle, Anteil vom angenommenen Angebot (%), Bestellnummer des Kunden (bei Bedarf).
- Inhaltsgruppen: Bisherige Abrechnung, Prüfung.
- Unverändert erhalten: Betriebsfreigabe für Teil-/Schlussrechnungen; Keine doppelte Verrechnung; Vorbelege und Anzahlungsabzüge; Kein neuer Berechnungsweg.
- Quelle: `src/features/invoices/InvoicesView.tsx`, `src/features/invoices/anzahlung.ts`, `src/features/invoices/vorrechnungen.ts`.

#### 088 · Schlussrechnung vorbereiten (`rechnung-schluss`)

- Bestehender Ort: `/invoices · Schlussrechnung`
- Darstellung: `editor`; Rollen: Buchhaltung, Geschäftsführung, Administrator. Gezeigtes Beispiel: Geschäftsführung.
- Hauptaktion: Vorschau erstellen.
- Gestaltungsentscheidung: Nur arbeitsrelevante Angaben; Details über die Zeile öffnen.
- Handy/Tablet: Zeilen statt zusätzlicher Karten; Hauptaktion bleibt gut erreichbar.
- Angaben/Felder: Baustelle, Anteil vom angenommenen Angebot (%), Bestellnummer des Kunden (bei Bedarf).
- Inhaltsgruppen: Bisherige Abrechnung, Prüfung.
- Unverändert erhalten: Betriebsfreigabe für Teil-/Schlussrechnungen; Keine doppelte Verrechnung; Vorbelege und Anzahlungsabzüge; Kein neuer Berechnungsweg.
- Quelle: `src/features/invoices/InvoicesView.tsx`, `src/features/invoices/anzahlung.ts`, `src/features/invoices/vorrechnungen.ts`.

#### 089 · Zahlung zuordnen (`zahlung`)

- Bestehender Ort: `/invoices · Zahlungen`
- Darstellung: `panel`; Rollen: Buchhaltung, Geschäftsführung, Administrator. Gezeigtes Beispiel: Geschäftsführung.
- Hauptaktion: Zahlung erfassen.
- Gestaltungsentscheidung: Nur arbeitsrelevante Angaben; Details über die Zeile öffnen.
- Handy/Tablet: Zeilen statt zusätzlicher Karten; Hauptaktion bleibt gut erreichbar.
- Angaben/Felder: Richtung, Datum, Betrag (€), Hinweis (bei Bedarf).
- Inhaltsgruppen: Bisherige Zahlungen.
- Unverändert erhalten: Teilzahlung/Rückzahlung; Überzahlung als Guthaben; Skontobedingungen; Protokoll und Korrekturwege.
- Quelle: `src/features/invoices/InvoicesView.tsx`.

#### 090 · Mahnungen (`mahnungen`)

- Bestehender Ort: `/invoices · Mahnungen`
- Darstellung: `list`; Rollen: Buchhaltung, Geschäftsführung, Administrator. Gezeigtes Beispiel: Geschäftsführung.
- Hauptaktion: Mahnlauf prüfen.
- Gestaltungsentscheidung: Nur arbeitsrelevante Angaben; Details über die Zeile öffnen.
- Handy/Tablet: Zeilen statt zusätzlicher Karten; Hauptaktion bleibt gut erreichbar.
- Bereiche: Offen, Mahnungen, Alle.
- Unverändert erhalten: Keine automatische Mahnung allein durch Datum; Zahlung/Frist prüfen; Nächste Mahnstufe je Rechnung.
- Quelle: `src/features/invoices/InvoicesView.tsx`.

#### 091 · Mahnung prüfen (`mahnen`)

- Bestehender Ort: `/invoices · Einzelmahnung`
- Darstellung: `panel`; Rollen: Buchhaltung, Geschäftsführung, Administrator. Gezeigtes Beispiel: Geschäftsführung.
- Hauptaktion: Zahlungserinnerung erzeugen.
- Gestaltungsentscheidung: Nur arbeitsrelevante Angaben; Details über die Zeile öffnen.
- Handy/Tablet: Zeilen statt zusätzlicher Karten; Hauptaktion bleibt gut erreichbar.
- Angaben/Felder: Neue Frist.
- Inhaltsgruppen: Vor dem Erzeugen.
- Unverändert erhalten: Mahnspesen/Zinsen/Privatkunde-Firma; Archiviertes Mahn-PDF; Bewusste Erzeugung.
- Quelle: `src/features/invoices/InvoicesView.tsx`.

#### 092 · Mahnlauf prüfen (`mahnlauf`)

- Bestehender Ort: `/invoices · Mahnlauf`
- Darstellung: `list`; Rollen: Buchhaltung, Geschäftsführung, Administrator. Gezeigtes Beispiel: Geschäftsführung.
- Hauptaktion: Ausgewählte Mahnungen erzeugen.
- Gestaltungsentscheidung: Nur arbeitsrelevante Angaben; Details über die Zeile öffnen.
- Handy/Tablet: Zeilen statt zusätzlicher Karten; Hauptaktion bleibt gut erreichbar.
- Unverändert erhalten: Einzeln auswählbar; Teilfehler pro Rechnung; Wiederholung erzeugt keine Doppelmahnung.
- Quelle: `src/features/invoices/InvoicesView.tsx`, `src/features/invoices/mahnlauf.ts`.

#### 093 · Buchhaltungs-Export (`rechnung-export`)

- Bestehender Ort: `/invoices · Export`
- Darstellung: `panel`; Rollen: Buchhaltung, Geschäftsführung, Administrator. Gezeigtes Beispiel: Geschäftsführung.
- Hauptaktion: Zeitraum zusammenstellen.
- Gestaltungsentscheidung: Nur arbeitsrelevante Angaben; Details über die Zeile öffnen.
- Handy/Tablet: Zeilen statt zusätzlicher Karten; Hauptaktion bleibt gut erreichbar.
- Angaben/Felder: Von, Bis.
- Inhaltsgruppen: Vor dem Export.
- Unverändert erhalten: Bestehende Formate unverändert; Konten-/Debitoren-/Steuercodeprüfung; Datumsbereich und Stornos.
- Quelle: `src/features/invoices/InvoicesView.tsx`.

#### 094 · Rücklass durch Bankgarantie ablösen (`bankgarantie`)

- Bestehender Ort: `/invoices · Bankgarantie`
- Darstellung: `panel`; Rollen: Buchhaltung, Geschäftsführung, Administrator. Gezeigtes Beispiel: Geschäftsführung.
- Hauptaktion: Bankgarantie speichern.
- Gestaltungsentscheidung: Nur arbeitsrelevante Angaben; Details über die Zeile öffnen.
- Handy/Tablet: Zeilen statt zusätzlicher Karten; Hauptaktion bleibt gut erreichbar.
- Angaben/Felder: Abgelöst am, Bank, Garantienummer, Garantie gültig bis.
- Unverändert erhalten: Rücklassberechnung unverändert; Gültigkeit und Nachweis.
- Quelle: `src/features/invoices/BankgarantieDialog.tsx`.

#### 095 · Rechnung stornieren (`rechnung-storno`)

- Bestehender Ort: `/invoices · Rechnung stornieren`
- Darstellung: `confirm`; Rollen: Buchhaltung, Geschäftsführung, Administrator. Gezeigtes Beispiel: Geschäftsführung.
- Hauptaktion: Rechnung stornieren.
- Gestaltungsentscheidung: Nur arbeitsrelevante Angaben; Details über die Zeile öffnen.
- Handy/Tablet: Zeilen statt zusätzlicher Karten; Hauptaktion bleibt gut erreichbar.
- Angaben/Felder: Grund.
- Inhaltsgruppen: Betroffener Beleg.
- Unverändert erhalten: Je Zustand getrennte zulässige Aktion; BMD-/Belegarchiv bleibt nachvollziehbar; Bestätigung bleibt verbindlich.
- Quelle: `src/features/invoices/InvoicesView.tsx`.

#### 096 · Stornorechnung ausstellen (`rechnung-stornobeleg`)

- Bestehender Ort: `/invoices · Stornorechnung ausstellen`
- Darstellung: `confirm`; Rollen: Buchhaltung, Geschäftsführung, Administrator. Gezeigtes Beispiel: Geschäftsführung.
- Hauptaktion: Stornorechnung ausstellen.
- Gestaltungsentscheidung: Nur arbeitsrelevante Angaben; Details über die Zeile öffnen.
- Handy/Tablet: Zeilen statt zusätzlicher Karten; Hauptaktion bleibt gut erreichbar.
- Angaben/Felder: Grund.
- Inhaltsgruppen: Betroffener Beleg.
- Unverändert erhalten: Je Zustand getrennte zulässige Aktion; BMD-/Belegarchiv bleibt nachvollziehbar; Bestätigung bleibt verbindlich.
- Quelle: `src/features/invoices/InvoicesView.tsx`.

#### 097 · Storno aufheben (`rechnung-storno-aufheben`)

- Bestehender Ort: `/invoices · Storno aufheben`
- Darstellung: `confirm`; Rollen: Buchhaltung, Geschäftsführung, Administrator. Gezeigtes Beispiel: Geschäftsführung.
- Hauptaktion: Storno aufheben.
- Gestaltungsentscheidung: Nur arbeitsrelevante Angaben; Details über die Zeile öffnen.
- Handy/Tablet: Zeilen statt zusätzlicher Karten; Hauptaktion bleibt gut erreichbar.
- Angaben/Felder: Grund.
- Inhaltsgruppen: Betroffener Beleg.
- Unverändert erhalten: Je Zustand getrennte zulässige Aktion; BMD-/Belegarchiv bleibt nachvollziehbar; Bestätigung bleibt verbindlich.
- Quelle: `src/features/invoices/InvoicesView.tsx`.

#### 206 · Export prüfen und herunterladen (`rechnung-export-ergebnis`)

- Bestehender Ort: `/invoices · Export`
- Darstellung: `record`; Rollen: Buchhaltung, Geschäftsführung, Administrator. Gezeigtes Beispiel: Geschäftsführung.
- Hauptaktion: Rechnungsausgangsbuch CSV herunterladen.
- Gestaltungsentscheidung: Nur arbeitsrelevante Angaben; Details über die Zeile öffnen.
- Handy/Tablet: Zeilen statt zusätzlicher Karten; Hauptaktion bleibt gut erreichbar.
- Inhaltsgruppen: Zeitraum 01.–14. Oktober 2026, Vor dem Herunterladen.
- Weitere Aktionen: BMD-Buchungsstapel herunterladen, Zahlungsstapel herunterladen.
- Unverändert erhalten: Bestehende Formate unverändert; Konten-/Debitoren-/Steuercodeprüfung; Datumsbereich und Stornos.
- Quelle: `src/features/invoices/InvoicesView.tsx`.

### Zeit

#### 098 · Zeit erfassen (`zeit`)

- Bestehender Ort: `/time`
- Darstellung: `time-form`; Rollen: Mitarbeiter, Verwaltung, Buchhaltung, Projektleiter, Geschäftsführung, Administrator. Gezeigtes Beispiel: Mitarbeiter.
- Hauptaktion: Zeit buchen.
- Gestaltungsentscheidung: Eingabe zuerst; Dauer wird unmittelbar berechnet. Weitere Angaben nur bei Bedarf, keine zweite Statistikspalte am Handy.
- Handy/Tablet: Zeilen statt zusätzlicher Karten; Hauptaktion bleibt gut erreichbar.
- Angaben/Felder: Baustelle, Datum, Status, Von, Bis, Pause (Min.), Wegzeit (Min.), Fahrzeug (bei Bedarf), Name des Helfers (bei Bedarf), Einsatz als Helfer (bei Bedarf), Notdienst / Störungseinsatz (bei Bedarf), Nicht als Nachtarbeit zählen (bei Bedarf), Grund (bei Bedarf), Kommentar (bei Bedarf).
- Weitere Aktionen: Meine Einträge, Auf Baustellen aufteilen.
- Unverändert erhalten: Alle Rollen eigene Zeit; Monteur immer volle Erfassung; Büro keine unnötigen Baustellen-/Zuschlagsfelder; Leitung kann erweitern; Jugendliche/Unterricht/Nachtzeitregeln; Abwesenheiten stunden-/tageweise.
- Quelle: `src/features/time/TimeView.tsx`, `src/features/time/TimeForm.tsx`.

#### 099 · Zeit erfassen (`zeit-buero`)

- Bestehender Ort: `/time`
- Darstellung: `time-form`; Rollen: Verwaltung, Buchhaltung. Gezeigtes Beispiel: Verwaltung.
- Hauptaktion: Zeit buchen.
- Gestaltungsentscheidung: Eingabe zuerst; Dauer wird unmittelbar berechnet. Weitere Angaben nur bei Bedarf, keine zweite Statistikspalte am Handy.
- Handy/Tablet: Zeilen statt zusätzlicher Karten; Hauptaktion bleibt gut erreichbar.
- Angaben/Felder: Datum, Status, Von, Bis, Pause (Min.), Kommentar (bei Bedarf).
- Weitere Aktionen: Meine Einträge.
- Unverändert erhalten: Alle Rollen eigene Zeit; Monteur immer volle Erfassung; Büro keine unnötigen Baustellen-/Zuschlagsfelder; Leitung kann erweitern; Jugendliche/Unterricht/Nachtzeitregeln; Abwesenheiten stunden-/tageweise.
- Quelle: `src/features/time/TimeView.tsx`, `src/features/time/TimeForm.tsx`.

#### 100 · Erweiterte Zeiterfassung (`zeit-erweitert`)

- Bestehender Ort: `/time`
- Darstellung: `time-form`; Rollen: Geschäftsführung. Gezeigtes Beispiel: Geschäftsführung.
- Hauptaktion: Zeit buchen.
- Gestaltungsentscheidung: Eingabe zuerst; Dauer wird unmittelbar berechnet. Weitere Angaben nur bei Bedarf, keine zweite Statistikspalte am Handy.
- Handy/Tablet: Zeilen statt zusätzlicher Karten; Hauptaktion bleibt gut erreichbar.
- Angaben/Felder: Baustelle, Datum, Status, Von, Bis, Pause (Min.), Wegzeit (Min.), Fahrzeug (bei Bedarf), Name des Helfers (bei Bedarf), Einsatz als Helfer (bei Bedarf), Notdienst / Störungseinsatz (bei Bedarf), Nicht als Nachtarbeit zählen (bei Bedarf), Grund (bei Bedarf), Kommentar (bei Bedarf).
- Weitere Aktionen: Meine Einträge, Auf Baustellen aufteilen.
- Unverändert erhalten: Alle Rollen eigene Zeit; Monteur immer volle Erfassung; Büro keine unnötigen Baustellen-/Zuschlagsfelder; Leitung kann erweitern; Jugendliche/Unterricht/Nachtzeitregeln; Abwesenheiten stunden-/tageweise.
- Quelle: `src/features/time/TimeView.tsx`, `src/features/time/TimeForm.tsx`.

#### 101 · Meine Einträge (`zeit-eintraege`)

- Bestehender Ort: `/time · Einträge`
- Darstellung: `list`; Rollen: Mitarbeiter, Verwaltung, Buchhaltung, Projektleiter, Geschäftsführung, Administrator. Gezeigtes Beispiel: Mitarbeiter.
- Hauptaktion: Zeit erfassen.
- Gestaltungsentscheidung: Nur arbeitsrelevante Angaben; Details über die Zeile öffnen.
- Handy/Tablet: Zeilen statt zusätzlicher Karten; Hauptaktion bleibt gut erreichbar.
- Bereiche: Diese Woche, Dieser Monat, Alle.
- Unverändert erhalten: Ändern/Löschen nur im erlaubten Zeitraum; Zukünftige Einträge; Fehlende Tage nicht als Nullstunden tarnen.
- Quelle: `src/features/time/TimeView.tsx`.

#### 102 · Zeitbuchung bearbeiten (`zeit-bearbeiten`)

- Bestehender Ort: `/time · Bearbeiten`
- Darstellung: `panel`; Rollen: Mitarbeiter, Verwaltung, Buchhaltung, Projektleiter, Geschäftsführung, Administrator. Gezeigtes Beispiel: Mitarbeiter.
- Hauptaktion: Änderungen speichern.
- Gestaltungsentscheidung: Nur arbeitsrelevante Angaben; Details über die Zeile öffnen.
- Handy/Tablet: Zeilen statt zusätzlicher Karten; Hauptaktion bleibt gut erreichbar.
- Angaben/Felder: Datum, Baustelle, Von, Bis, Pause (Min.), Bearbeitungsvermerk.
- Weitere Aktionen: Eintrag löschen.
- Unverändert erhalten: Bearbeitungsvermerk nach Bestand; Fremdbuchung nur mit Korrekturrecht; Löschen bestätigt.
- Quelle: `src/features/time/TimeView.tsx`, `src/features/time/TimeForm.tsx`.

#### 103 · Zeit auf Baustellen aufteilen (`zeit-aufteilen`)

- Bestehender Ort: `/time · Aufteilen`
- Darstellung: `panel`; Rollen: Mitarbeiter, Projektleiter, Geschäftsführung, Administrator. Gezeigtes Beispiel: Mitarbeiter.
- Hauptaktion: Aufteilung übernehmen.
- Gestaltungsentscheidung: Nur arbeitsrelevante Angaben; Details über die Zeile öffnen.
- Handy/Tablet: Zeilen statt zusätzlicher Karten; Hauptaktion bleibt gut erreichbar.
- Angaben/Felder: Erste Baustelle, Stunden erste Baustelle, Zweite Baustelle, Stunden zweite Baustelle.
- Unverändert erhalten: Summe muss ursprünglicher Zeit entsprechen; Keine doppelten Stunden.
- Quelle: `src/features/time/AufteilenDialog.tsx`.

#### 104 · Zeit erfassen (`zeit-gespeichert`)

- Bestehender Ort: `/time · gespeichert`
- Darstellung: `record`; Rollen: Mitarbeiter, Verwaltung, Buchhaltung, Projektleiter, Geschäftsführung, Administrator. Gezeigtes Beispiel: Mitarbeiter.
- Hauptaktion: keine zusätzliche Hauptaktion.
- Gestaltungsentscheidung: Eine kurze Bestätigung am Eintrag reicht; kein dauerhaftes Erfolgsbanner.
- Handy/Tablet: Zeilen statt zusätzlicher Karten; Hauptaktion bleibt gut erreichbar.
- Inhaltsgruppen: Zeit gespeichert, Diese Woche.
- Weitere Aktionen: Weitere Zeit erfassen.
- Unverändert erhalten: Nur tatsächlichen Servererfolg als gespeichert anzeigen; Offline separat als wartet kennzeichnen.
- Quelle: `src/features/time/TimeView.tsx`.

#### 191 · Abwesenheit erfassen (`zeit-abwesenheit`)

- Bestehender Ort: `/time · Statusabhängige Eingabe`
- Darstellung: `form`; Rollen: Mitarbeiter, Verwaltung, Buchhaltung, Projektleiter, Geschäftsführung, Administrator. Gezeigtes Beispiel: Mitarbeiter.
- Hauptaktion: Eintrag speichern.
- Gestaltungsentscheidung: Nur arbeitsrelevante Angaben; Details über die Zeile öffnen.
- Handy/Tablet: Zeilen statt zusätzlicher Karten; Hauptaktion bleibt gut erreichbar.
- Angaben/Felder: Datum, Status, Berufsschule bis, Unterricht je Schultag (Std., optional), Nur einige Stunden, Frei von, Frei bis.
- Inhaltsgruppen: Statusabhängige Felder.
- Unverändert erhalten: Kein Umgehen eines Urlaubsantrags durch Zeitstatus; Jugendliche und Unterricht; Stundenweise Abwesenheit.
- Quelle: `src/features/time/TimeForm.tsx`.

#### 202 · Zeit erfassen (`zeit-leitung`)

- Bestehender Ort: `/time · Leitung`
- Darstellung: `time-form`; Rollen: Projektleiter, Geschäftsführung, Administrator. Gezeigtes Beispiel: Geschäftsführung.
- Hauptaktion: Zeit buchen.
- Gestaltungsentscheidung: Nur die konkrete Aufgabe mit ihren notwendigen Angaben. Keine zusätzliche Erklärungsebene.
- Handy/Tablet: Zeilen statt zusätzlicher Karten; Hauptaktion bleibt gut erreichbar.
- Angaben/Felder: Datum, Status, Von, Bis, Pause (Min.).
- Unverändert erhalten: Einfache Erfassung als Standard; Leitung kann volle Erfassung zuschalten; Administration ohne künstliches Zeitkonto.
- Quelle: `src/features/time/TimeView.tsx`, `src/features/time/TimeForm.tsx`.

### Urlaub

#### 105 · Urlaub (`urlaub`)

- Bestehender Ort: `/vacations`
- Darstellung: `record`; Rollen: Mitarbeiter, Verwaltung, Buchhaltung, Projektleiter, Geschäftsführung, Administrator. Gezeigtes Beispiel: Mitarbeiter.
- Hauptaktion: Antrag stellen.
- Gestaltungsentscheidung: Nur arbeitsrelevante Angaben; Details über die Zeile öffnen.
- Handy/Tablet: Zeilen statt zusätzlicher Karten; Hauptaktion bleibt gut erreichbar.
- Inhaltsgruppen: Meine Anträge, Meine Krankmeldungen.
- Weitere Aktionen: Krank melden.
- Unverändert erhalten: Jede Rolle eigener Antrag; Sonderurlaub/Pflege/unbezahlt; Betriebsurlaub/Übertrag/Verfall; Eigene Krankmeldungen ändern.
- Quelle: `src/features/vacations/VacationsView.tsx`, `src/features/vacations/FreistellungListe.tsx`.

#### 106 · Urlaub beantragen (`urlaub-antrag`)

- Bestehender Ort: `/vacations · Urlaub`
- Darstellung: `form`; Rollen: Mitarbeiter, Verwaltung, Buchhaltung, Projektleiter, Geschäftsführung, Administrator. Gezeigtes Beispiel: Mitarbeiter.
- Hauptaktion: Antrag einreichen.
- Gestaltungsentscheidung: Nur arbeitsrelevante Angaben; Details über die Zeile öffnen.
- Handy/Tablet: Zeilen statt zusätzlicher Karten; Hauptaktion bleibt gut erreichbar.
- Angaben/Felder: Art, Von, Bis (einschließlich), Anmerkung (bei Bedarf).
- Inhaltsgruppen: Auswirkung.
- Unverändert erhalten: Überschneidungen prüfen; Teilzeit/halbe Tage; Resturlaub im richtigen Urlaubsjahr; Unbezahlter Urlaub nur Spitze entscheidet; Sonderurlaub bestätigen statt Ermessensurlaub.
- Quelle: `src/features/vacations/VacationsView.tsx`, `src/features/vacations/FreistellungFormular.tsx`.

#### 107 · Zeitausgleich beantragen (`za-antrag`)

- Bestehender Ort: `/vacations · Zeitausgleich`
- Darstellung: `form`; Rollen: Mitarbeiter, Verwaltung, Buchhaltung, Projektleiter, Geschäftsführung, Administrator. Gezeigtes Beispiel: Mitarbeiter.
- Hauptaktion: Antrag einreichen.
- Gestaltungsentscheidung: Nur arbeitsrelevante Angaben; Details über die Zeile öffnen.
- Handy/Tablet: Zeilen statt zusätzlicher Karten; Hauptaktion bleibt gut erreichbar.
- Angaben/Felder: Art, Von, Bis (einschließlich), Nur einige Stunden (an einem Tag), Frei von, Frei bis, Anmerkung (bei Bedarf).
- Inhaltsgruppen: Auswirkung.
- Unverändert erhalten: Überschneidungen prüfen; Teilzeit/halbe Tage; Resturlaub im richtigen Urlaubsjahr; Unbezahlter Urlaub nur Spitze entscheidet; Sonderurlaub bestätigen statt Ermessensurlaub.
- Quelle: `src/features/vacations/VacationsView.tsx`, `src/features/vacations/FreistellungFormular.tsx`.

#### 108 · Sonderurlaub beantragen (`sonderurlaub`)

- Bestehender Ort: `/vacations · Sonderurlaub`
- Darstellung: `form`; Rollen: Mitarbeiter, Verwaltung, Buchhaltung, Projektleiter, Geschäftsführung, Administrator. Gezeigtes Beispiel: Mitarbeiter.
- Hauptaktion: Antrag einreichen.
- Gestaltungsentscheidung: Nur arbeitsrelevante Angaben; Details über die Zeile öffnen.
- Handy/Tablet: Zeilen statt zusätzlicher Karten; Hauptaktion bleibt gut erreichbar.
- Angaben/Felder: Art, Von, Bis (einschließlich), Anlass, Tag des Ereignisses, Nachweis auswählen, Anmerkung (bei Bedarf).
- Inhaltsgruppen: Auswirkung.
- Unverändert erhalten: Überschneidungen prüfen; Teilzeit/halbe Tage; Resturlaub im richtigen Urlaubsjahr; Unbezahlter Urlaub nur Spitze entscheidet; Sonderurlaub bestätigen statt Ermessensurlaub.
- Quelle: `src/features/vacations/VacationsView.tsx`, `src/features/vacations/FreistellungFormular.tsx`.

#### 109 · Pflegefreistellung beantragen (`pflegefreistellung`)

- Bestehender Ort: `/vacations · Pflegefreistellung`
- Darstellung: `form`; Rollen: Mitarbeiter, Verwaltung, Buchhaltung, Projektleiter, Geschäftsführung, Administrator. Gezeigtes Beispiel: Mitarbeiter.
- Hauptaktion: Antrag einreichen.
- Gestaltungsentscheidung: Nur arbeitsrelevante Angaben; Details über die Zeile öffnen.
- Handy/Tablet: Zeilen statt zusätzlicher Karten; Hauptaktion bleibt gut erreichbar.
- Angaben/Felder: Art, Von, Bis (einschließlich), Für ein erkranktes Kind unter 12 Jahren, Zweite Woche (erste verbraucht), Nachweis auswählen, Anmerkung (bei Bedarf).
- Inhaltsgruppen: Auswirkung.
- Unverändert erhalten: Überschneidungen prüfen; Teilzeit/halbe Tage; Resturlaub im richtigen Urlaubsjahr; Unbezahlter Urlaub nur Spitze entscheidet; Sonderurlaub bestätigen statt Ermessensurlaub.
- Quelle: `src/features/vacations/VacationsView.tsx`, `src/features/vacations/FreistellungFormular.tsx`.

#### 110 · Unbezahlten Urlaub beantragen (`unbezahlter-urlaub`)

- Bestehender Ort: `/vacations · Unbezahlter Urlaub`
- Darstellung: `form`; Rollen: Mitarbeiter, Verwaltung, Buchhaltung, Projektleiter, Geschäftsführung, Administrator. Gezeigtes Beispiel: Mitarbeiter.
- Hauptaktion: Antrag einreichen.
- Gestaltungsentscheidung: Nur arbeitsrelevante Angaben; Details über die Zeile öffnen.
- Handy/Tablet: Zeilen statt zusätzlicher Karten; Hauptaktion bleibt gut erreichbar.
- Angaben/Felder: Art, Von, Bis (einschließlich), Anmerkung (bei Bedarf).
- Inhaltsgruppen: Auswirkung.
- Unverändert erhalten: Überschneidungen prüfen; Teilzeit/halbe Tage; Resturlaub im richtigen Urlaubsjahr; Unbezahlter Urlaub nur Spitze entscheidet; Sonderurlaub bestätigen statt Ermessensurlaub.
- Quelle: `src/features/vacations/VacationsView.tsx`, `src/features/vacations/FreistellungFormular.tsx`.

#### 111 · Urlaubsantrag (`urlaub-detail`)

- Bestehender Ort: `/vacations · Antrag`
- Darstellung: `panel`; Rollen: Mitarbeiter, Verwaltung, Buchhaltung, Projektleiter, Geschäftsführung, Administrator. Gezeigtes Beispiel: Mitarbeiter.
- Hauptaktion: keine zusätzliche Hauptaktion.
- Gestaltungsentscheidung: Nur arbeitsrelevante Angaben; Details über die Zeile öffnen.
- Handy/Tablet: Zeilen statt zusätzlicher Karten; Hauptaktion bleibt gut erreichbar.
- Inhaltsgruppen: Antrag, Verlauf.
- Weitere Aktionen: Antrag zurückziehen.
- Unverändert erhalten: Zurückziehen nur erlaubt/offen; Genehmigter Urlaub nur nach Rechten ändern.
- Quelle: `src/features/vacations/AntragFenster.tsx`.

#### 112 · Offene Anträge (`urlaub-entscheiden`)

- Bestehender Ort: `/vacations · Entscheidungen`
- Darstellung: `list`; Rollen: Mitarbeiter, Verwaltung, Buchhaltung, Projektleiter, Geschäftsführung, Administrator. Gezeigtes Beispiel: Buchhaltung.
- Hauptaktion: keine zusätzliche Hauptaktion.
- Gestaltungsentscheidung: Nur arbeitsrelevante Angaben; Details über die Zeile öffnen.
- Handy/Tablet: Zeilen statt zusätzlicher Karten; Hauptaktion bleibt gut erreichbar.
- Unverändert erhalten: Genehmiger betrieblich konfiguriert; Eigene Anträge nicht beiläufig selbst genehmigen; Älteste zuerst; Sonderurlaub/Pflege separat bestätigen.
- Quelle: `src/features/vacations/VacationsView.tsx`, `src/features/vacations/FreistellungenBestaetigen.tsx`.

#### 113 · Antrag entscheiden (`urlaub-entscheidung`)

- Bestehender Ort: `/vacations · Entscheidung`
- Darstellung: `panel`; Rollen: Mitarbeiter, Verwaltung, Buchhaltung, Projektleiter, Geschäftsführung, Administrator. Gezeigtes Beispiel: Buchhaltung.
- Hauptaktion: Genehmigen.
- Gestaltungsentscheidung: Nur arbeitsrelevante Angaben; Details über die Zeile öffnen.
- Handy/Tablet: Zeilen statt zusätzlicher Karten; Hauptaktion bleibt gut erreichbar.
- Angaben/Felder: Grund bei Ablehnung.
- Inhaltsgruppen: Antrag von Max Mustermann.
- Weitere Aktionen: Mit Begründung ablehnen.
- Unverändert erhalten: Entscheidungsrecht geprüft; Kein neuer Kapazitäts-/Anspruchsalgorithmus; Fehlende Auskunft als unbekannt anzeigen.
- Quelle: `src/features/vacations/VacationsView.tsx`, `src/features/vacations/FreistellungenBestaetigen.tsx`.

#### 114 · Krank melden (`krank-melden`)

- Bestehender Ort: `/vacations · Krankmeldung`
- Darstellung: `form`; Rollen: Mitarbeiter, Verwaltung, Buchhaltung, Projektleiter, Geschäftsführung, Administrator. Gezeigtes Beispiel: Mitarbeiter.
- Hauptaktion: Krankmeldung eintragen.
- Gestaltungsentscheidung: Nur arbeitsrelevante Angaben; Details über die Zeile öffnen.
- Handy/Tablet: Zeilen statt zusätzlicher Karten; Hauptaktion bleibt gut erreichbar.
- Angaben/Felder: Krank ab, Voraussichtlich bis, Anmerkung (freiwillig, keine Diagnose).
- Unverändert erhalten: Krankmeldung ist kein Urlaubsantrag; Keine Diagnose abfragen; Ende ändern/Löschen nach Recht.
- Quelle: `src/features/vacations/Krankmeldungen.tsx`, `src/features/vacations/VacationsView.tsx`.

#### 115 · Krankenstände (`krankenstaende`)

- Bestehender Ort: `/vacations · Krankenstände`
- Darstellung: `list`; Rollen: Buchhaltung, Geschäftsführung, Administrator. Gezeigtes Beispiel: Buchhaltung.
- Hauptaktion: Krankmeldung erfassen.
- Gestaltungsentscheidung: Nur arbeitsrelevante Angaben; Details über die Zeile öffnen.
- Handy/Tablet: Zeilen statt zusätzlicher Karten; Hauptaktion bleibt gut erreichbar.
- Unverändert erhalten: Gesundheitsdaten nicht an Projektleitung/Team; Ende ändern und Löschen bestätigt.
- Quelle: `src/features/vacations/Krankmeldungen.tsx`.

#### 116 · Krankmeldung erfassen (`krank-buero`)

- Bestehender Ort: `/vacations · Büro-Krankmeldung`
- Darstellung: `panel`; Rollen: Buchhaltung, Geschäftsführung, Administrator. Gezeigtes Beispiel: Buchhaltung.
- Hauptaktion: Krankmeldung speichern.
- Gestaltungsentscheidung: Nur arbeitsrelevante Angaben; Details über die Zeile öffnen.
- Handy/Tablet: Zeilen statt zusätzlicher Karten; Hauptaktion bleibt gut erreichbar.
- Angaben/Felder: Mitarbeiter, Krank ab, Voraussichtlich bis, Anmerkung (freiwillig, keine Diagnose).
- Quelle: `src/features/vacations/Krankmeldungen.tsx`.

#### 117 · Betriebsurlaub (`betriebsurlaub`)

- Bestehender Ort: `/vacations · Betriebsurlaub`
- Darstellung: `list`; Rollen: Buchhaltung, Geschäftsführung, Administrator. Gezeigtes Beispiel: Buchhaltung.
- Hauptaktion: Betriebsurlaub anlegen.
- Gestaltungsentscheidung: Nur arbeitsrelevante Angaben; Details über die Zeile öffnen.
- Handy/Tablet: Zeilen statt zusätzlicher Karten; Hauptaktion bleibt gut erreichbar.
- Weitere Aktionen: Betriebsurlaub löschen.
- Unverändert erhalten: Ausnahmen je Mitarbeiter; Abbuchung je Urlaubsjahr; Halbe Feiertage; Löschen mit Bestätigung.
- Quelle: `src/features/vacations/BetriebsurlaubReiter.tsx`, `src/features/vacations/UrlaubMonat.tsx`.

#### 118 · Betriebsurlaub anlegen (`betriebsurlaub-neu`)

- Bestehender Ort: `/vacations · Betriebsurlaub anlegen`
- Darstellung: `form`; Rollen: Buchhaltung, Geschäftsführung, Administrator. Gezeigtes Beispiel: Buchhaltung.
- Hauptaktion: Betriebsurlaub anlegen.
- Gestaltungsentscheidung: Nur arbeitsrelevante Angaben; Details über die Zeile öffnen.
- Handy/Tablet: Zeilen statt zusätzlicher Karten; Hauptaktion bleibt gut erreichbar.
- Angaben/Felder: Bezeichnung, Von, Bis (einschließlich), Urlaubskonto aller aktiven Mitarbeiter belasten, Max Mustermann ausnehmen, Anton Berger ausnehmen.
- Unverändert erhalten: Ausnahmen sichtbar wählen; Vor Anlage Auswirkung prüfen; Bestehende Überschneidungsregeln.
- Quelle: `src/features/vacations/BetriebsurlaubReiter.tsx`.

#### 190 · Urlaub im Monat (`urlaub-monat`)

- Bestehender Ort: `/vacations · Monatsübersicht`
- Darstellung: `planner-absence`; Rollen: Buchhaltung, Geschäftsführung, Administrator. Gezeigtes Beispiel: Buchhaltung.
- Hauptaktion: keine zusätzliche Hauptaktion.
- Gestaltungsentscheidung: Nur arbeitsrelevante Angaben; Details über die Zeile öffnen.
- Handy/Tablet: Zeilen statt zusätzlicher Karten; Hauptaktion bleibt gut erreichbar.
- Unverändert erhalten: Nur für berechtigte Büroansicht; Urlaub/Abwesenheit nicht mit freier Kapazität gleichsetzen.
- Quelle: `src/features/vacations/UrlaubMonat.tsx`.

#### 198 · Betriebsurlaub löschen (`betriebsurlaub-loeschen`)

- Bestehender Ort: `/vacations · Betriebsurlaub löschen`
- Darstellung: `confirm`; Rollen: Buchhaltung, Geschäftsführung, Administrator. Gezeigtes Beispiel: Buchhaltung.
- Hauptaktion: Betriebsurlaub löschen.
- Gestaltungsentscheidung: Nur die konkrete Aufgabe mit ihren notwendigen Angaben. Keine zusätzliche Erklärungsebene.
- Handy/Tablet: Zeilen statt zusätzlicher Karten; Hauptaktion bleibt gut erreichbar.
- Inhaltsgruppen: Weihnachtsurlaub 2026/27.
- Unverändert erhalten: Bestehende Bestätigung; Rücknahme der zugehörigen Buchungen nur nach bestehender Funktion.
- Quelle: `src/features/vacations/BetriebsurlaubReiter.tsx`.

### Auswertung

#### 119 · Mitarbeiterübersicht (`mitarbeiter-monat`)

- Bestehender Ort: `/accounting`
- Darstellung: `accounting`; Rollen: Buchhaltung, Geschäftsführung, Administrator. Gezeigtes Beispiel: Buchhaltung.
- Hauptaktion: Bericht exportieren.
- Gestaltungsentscheidung: Ein lesbarer Streifen je Person; Detail über die Zeile. Keine doppelte Tabelle neben denselben Kennzahlen.
- Handy/Tablet: Zeilen statt zusätzlicher Karten; Hauptaktion bleibt gut erreichbar.
- Bereiche: Monat, Woche.
- Weitere Aktionen: Stunden je Baustelle.
- Unverändert erhalten: Ist/Soll/Saldo getrennt; Fehlende Tage/Arbeitszeitgrenzen; Zeitkonto nur für berechtigte Personen; Kein Zeitkonto für Administration; Support ohne sensible Tagesdetails.
- Quelle: `src/features/accounting/AccountingView.tsx`, `src/features/accounting/UebersichtListe.tsx`, `src/features/accounting/Streifen.tsx`.

#### 120 · Mitarbeiterübersicht (`mitarbeiter-woche`)

- Bestehender Ort: `/accounting?ansicht=woche`
- Darstellung: `accounting`; Rollen: Buchhaltung, Geschäftsführung, Administrator. Gezeigtes Beispiel: Buchhaltung.
- Hauptaktion: Bericht exportieren.
- Gestaltungsentscheidung: Ein lesbarer Streifen je Person; Detail über die Zeile. Keine doppelte Tabelle neben denselben Kennzahlen.
- Handy/Tablet: Zeilen statt zusätzlicher Karten; Hauptaktion bleibt gut erreichbar.
- Bereiche: Monat, Woche.
- Weitere Aktionen: Stunden je Baustelle.
- Unverändert erhalten: Ist/Soll/Saldo getrennt; Fehlende Tage/Arbeitszeitgrenzen; Zeitkonto nur für berechtigte Personen; Kein Zeitkonto für Administration; Support ohne sensible Tagesdetails.
- Quelle: `src/features/accounting/AccountingView.tsx`, `src/features/accounting/UebersichtListe.tsx`, `src/features/accounting/Streifen.tsx`.

#### 121 · Max Mustermann (`mitarbeiter-person`)

- Bestehender Ort: `/accounting · Person`
- Darstellung: `record`; Rollen: Buchhaltung, Geschäftsführung, Administrator. Gezeigtes Beispiel: Buchhaltung.
- Hauptaktion: Zeit für Person erfassen.
- Gestaltungsentscheidung: Nur arbeitsrelevante Angaben; Details über die Zeile öffnen.
- Handy/Tablet: Zeilen statt zusätzlicher Karten; Hauptaktion bleibt gut erreichbar.
- Inhaltsgruppen: Tagesnachweis, Arbeitszeitgrenzen.
- Weitere Aktionen: Monat als CSV, Bericht für Zeitraum, Arbeitszeitgrenzen.
- Unverändert erhalten: Gesamtsaldo vs Monatssaldo; Arbeitszeitgrenzen; Unterricht/Jugendliche; Fremdkorrektur mit Vermerk.
- Quelle: `src/features/accounting/PersonFenster.tsx`, `src/features/accounting/Gesamtsaldo.tsx`, `src/features/accounting/ArbeitszeitGrenzenKarte.tsx`.

#### 122 · Stundenbericht exportieren (`stunden-export`)

- Bestehender Ort: `/accounting · Export`
- Darstellung: `panel`; Rollen: Buchhaltung, Geschäftsführung, Administrator. Gezeigtes Beispiel: Buchhaltung.
- Hauptaktion: Bericht herunterladen.
- Gestaltungsentscheidung: Nur arbeitsrelevante Angaben; Details über die Zeile öffnen.
- Handy/Tablet: Zeilen statt zusätzlicher Karten; Hauptaktion bleibt gut erreichbar.
- Angaben/Felder: Mitarbeiter, Von, Bis, Ausgabe.
- Unverändert erhalten: Bestehende PDF-/CSV-Berechnungen; Zeitraum und Person; Personen ohne Zeitkonto korrekt behandeln.
- Quelle: `src/features/accounting/ExportDialog.tsx`.

#### 123 · Stunden je Baustelle (`stunden-baustellen`)

- Bestehender Ort: `/accounting · Baustellenauswertung`
- Darstellung: `list`; Rollen: Buchhaltung, Geschäftsführung, Administrator. Gezeigtes Beispiel: Buchhaltung.
- Hauptaktion: keine zusätzliche Hauptaktion.
- Gestaltungsentscheidung: Nur arbeitsrelevante Angaben; Details über die Zeile öffnen.
- Handy/Tablet: Zeilen statt zusätzlicher Karten; Hauptaktion bleibt gut erreichbar.
- Unverändert erhalten: Gewählter Zeitraum; Gesamtstunden aller berechtigten Buchungen; Keine Margen offenlegen.
- Quelle: `src/features/accounting/ProjectSummary.tsx`.

#### 124 · Nachkalkulation (`nachkalkulation`)

- Bestehender Ort: `/costing`
- Darstellung: `list`; Rollen: Geschäftsführung, Administrator. Gezeigtes Beispiel: Geschäftsführung.
- Hauptaktion: keine zusätzliche Hauptaktion.
- Gestaltungsentscheidung: Nur arbeitsrelevante Angaben; Details über die Zeile öffnen.
- Handy/Tablet: Zeilen statt zusätzlicher Karten; Hauptaktion bleibt gut erreichbar.
- Bereiche: Laufend, Erledigt, Alle.
- Unverändert erhalten: Nur Spitze; Kostensätze fehlen sichtbar; Mit Verlust/zu prüfen/ohne Erlös; Keine erfundenen Margen bei fehlenden Daten.
- Quelle: `src/features/costing/NachkalkulationView.tsx`.

#### 125 · Ergebnis Sonnenhof (`nachkalkulation-detail`)

- Bestehender Ort: `/costing · Baustelle`
- Darstellung: `record`; Rollen: Geschäftsführung, Administrator. Gezeigtes Beispiel: Geschäftsführung.
- Hauptaktion: keine zusätzliche Hauptaktion.
- Gestaltungsentscheidung: Nur arbeitsrelevante Angaben; Details über die Zeile öffnen.
- Handy/Tablet: Zeilen statt zusätzlicher Karten; Hauptaktion bleibt gut erreichbar.
- Inhaltsgruppen: Erlös und Kosten.
- Weitere Aktionen: Kostensätze prüfen.
- Unverändert erhalten: Kostenhistorie und Datenqualität; Keine neue Kalkulation; Helferstunden/Budget zählen wie bisher.
- Quelle: `src/features/costing/NachkalkulationView.tsx`.

#### 196 · Arbeitszeitgrenze prüfen (`arbeitszeit-grenze`)

- Bestehender Ort: `/accounting · Arbeitszeitgrenze prüfen`
- Darstellung: `panel`; Rollen: Buchhaltung, Geschäftsführung, Administrator. Gezeigtes Beispiel: Buchhaltung.
- Hauptaktion: Begründung speichern.
- Gestaltungsentscheidung: Nur die konkrete Aufgabe mit ihren notwendigen Angaben. Keine zusätzliche Erklärungsebene.
- Handy/Tablet: Zeilen statt zusätzlicher Karten; Hauptaktion bleibt gut erreichbar.
- Angaben/Felder: Begründung.
- Inhaltsgruppen: Betroffener Tag.
- Unverändert erhalten: Bei Jugendlichen Verstoß statt genehmigbarer Ausnahme; Notiz ersetzt keine Korrektur; Bestehende Grenzen bleiben unverändert.
- Quelle: `src/features/accounting/ArbeitszeitGrenzenKarte.tsx`.

### Benutzer

#### 126 · Benutzerverwaltung (`benutzer`)

- Bestehender Ort: `/user-mgmt`
- Darstellung: `list`; Rollen: Geschäftsführung, Administrator. Gezeigtes Beispiel: Geschäftsführung.
- Hauptaktion: Benutzer anlegen.
- Gestaltungsentscheidung: Nur arbeitsrelevante Angaben; Details über die Zeile öffnen.
- Handy/Tablet: Zeilen statt zusätzlicher Karten; Hauptaktion bleibt gut erreichbar.
- Bereiche: Aktiv, Deaktiviert, Alle.
- Unverändert erhalten: Gruppierung nach Rolle; Administratoren nur durch Admin ändern; Zeitkonto nicht allein aus Rolle ableiten.
- Quelle: `src/features/users/UserMgmtView.tsx`.

#### 127 · Benutzer anlegen (`benutzer-neu`)

- Bestehender Ort: `/user-mgmt · Anlegen`
- Darstellung: `form`; Rollen: Geschäftsführung, Administrator. Gezeigtes Beispiel: Geschäftsführung.
- Hauptaktion: Benutzer anlegen.
- Gestaltungsentscheidung: Nur arbeitsrelevante Angaben; Details über die Zeile öffnen.
- Handy/Tablet: Zeilen statt zusätzlicher Karten; Hauptaktion bleibt gut erreichbar.
- Angaben/Felder: Name, Anmeldung mit, Benutzername, Rolle, Status, Einstufung, Geburtsdatum, Wochenstunden, Urlaubstage pro Jahr, Eintrittsdatum, Saldo-Startdatum, Start-Saldo (Stunden), Resturlaub beim Umstieg (Tage), Montag, Dienstag, Mittwoch, Donnerstag, Freitag, Tagessoll je Wochentag (bei Bedarf).
- Inhaltsgruppen: Arbeitstage.
- Unverändert erhalten: Benutzername benötigt Startpasswort statt Mail; Neueinstellung vs bestehender Mitarbeiter; Aliquoter Erstjahresurlaub; Lehrbeginn/-zeit/Budgetzählung; Kein neues Adminrecht für GF.
- Quelle: `src/features/users/UserMgmtView.tsx`, `src/features/users/EinstufungFelder.tsx`, `src/features/users/TagessollFelder.tsx`.

#### 128 · Max Mustermann (`benutzerakte`)

- Bestehender Ort: `/user-mgmt/:uid`
- Darstellung: `record`; Rollen: Geschäftsführung, Administrator. Gezeigtes Beispiel: Geschäftsführung.
- Hauptaktion: Bearbeiten.
- Gestaltungsentscheidung: Nur arbeitsrelevante Angaben; Details über die Zeile öffnen.
- Handy/Tablet: Zeilen statt zusätzlicher Karten; Hauptaktion bleibt gut erreichbar.
- Bereiche: Überblick, Stammdaten, Zugang.
- Inhaltsgruppen: Zeitkonto, Arbeitstage, Zugang.
- Weitere Aktionen: Urlaub anpassen, Datenauskunft.
- Unverändert erhalten: Geburtsdatum vertraulich; Start-Saldo und Gültigkeit; Kontoänderung und Zugang getrennt.
- Quelle: `src/features/users/BenutzerakteView.tsx`, `src/features/users/GeburtsdatumKarte.tsx`, `src/features/users/UrlaubsanspruchKarte.tsx`.

#### 129 · Benutzerdaten bearbeiten (`benutzer-daten`)

- Bestehender Ort: `/user-mgmt/:uid · Stammdaten`
- Darstellung: `form`; Rollen: Geschäftsführung, Administrator. Gezeigtes Beispiel: Geschäftsführung.
- Hauptaktion: Änderungen speichern.
- Gestaltungsentscheidung: Nur arbeitsrelevante Angaben; Details über die Zeile öffnen.
- Handy/Tablet: Zeilen statt zusätzlicher Karten; Hauptaktion bleibt gut erreichbar.
- Angaben/Felder: Name, Anmeldung mit, Benutzername, Rolle, Status, Einstufung, Geburtsdatum, Wochenstunden, Urlaubstage pro Jahr, Eintrittsdatum, Saldo-Startdatum, Start-Saldo (Stunden), Resturlaub beim Umstieg (Tage), Führt ein Zeitkonto.
- Unverändert erhalten: Zusatzrechte nur für passende Rollen; Zeitkonto der GF personenspezifisch; Tagessoll/Wochentage; Ungespeicherte Änderungen.
- Quelle: `src/features/users/BenutzerakteView.tsx`, `src/features/users/EinstufungFelder.tsx`, `src/features/users/TagessollFelder.tsx`.

#### 130 · Zugang von Max Mustermann (`benutzer-zugang`)

- Bestehender Ort: `/user-mgmt/:uid · Zugang`
- Darstellung: `record`; Rollen: Geschäftsführung, Administrator. Gezeigtes Beispiel: Geschäftsführung.
- Hauptaktion: Neues Startpasswort vergeben.
- Gestaltungsentscheidung: Nur arbeitsrelevante Angaben; Details über die Zeile öffnen.
- Handy/Tablet: Zeilen statt zusätzlicher Karten; Hauptaktion bleibt gut erreichbar.
- Inhaltsgruppen: Anmeldung.
- Weitere Aktionen: Anmeldeart umstellen, Benutzer deaktivieren.
- Unverändert erhalten: Bei E-Mail Passwort-Mail statt Startpasswort; Eigener Zugang unter Mein Konto; Letzter Administrator geschützt.
- Quelle: `src/features/users/BenutzerakteView.tsx`, `src/features/users/KontoUmstellen.tsx`.

#### 131 · Neues Startpasswort vergeben (`startpasswort`)

- Bestehender Ort: `/user-mgmt/:uid · Startpasswort`
- Darstellung: `confirm`; Rollen: Geschäftsführung, Administrator. Gezeigtes Beispiel: Geschäftsführung.
- Hauptaktion: Neues Startpasswort vergeben.
- Gestaltungsentscheidung: Nur arbeitsrelevante Angaben; Details über die Zeile öffnen.
- Handy/Tablet: Zeilen statt zusätzlicher Karten; Hauptaktion bleibt gut erreichbar.
- Inhaltsgruppen: Auswirkung.
- Unverändert erhalten: Bestätigung; Kennwort nur einmal zeigen und nicht loggen; Kein echter Zugang im Konzept.
- Quelle: `src/features/users/BenutzerakteView.tsx`.

#### 132 · Anmeldeart umstellen (`konto-umstellen`)

- Bestehender Ort: `/user-mgmt/:uid · Konto umstellen`
- Darstellung: `panel`; Rollen: Geschäftsführung, Administrator. Gezeigtes Beispiel: Geschäftsführung.
- Hauptaktion: Anmeldung umstellen.
- Gestaltungsentscheidung: Nur arbeitsrelevante Angaben; Details über die Zeile öffnen.
- Handy/Tablet: Zeilen statt zusätzlicher Karten; Hauptaktion bleibt gut erreichbar.
- Angaben/Felder: Neue Anmeldeart, E-Mail, Benutzername, Grund.
- Unverändert erhalten: Identität bleibt bestehen; Passwortübergabe und Wirkung ausdrücklich zeigen; Kein stiller Identitätswechsel.
- Quelle: `src/features/users/KontoUmstellen.tsx`.

#### 133 · Urlaubsanspruch anpassen (`urlaubsanspruch`)

- Bestehender Ort: `/user-mgmt/:uid · Urlaubsanspruch`
- Darstellung: `panel`; Rollen: Geschäftsführung, Administrator. Gezeigtes Beispiel: Geschäftsführung.
- Hauptaktion: Anpassung speichern.
- Gestaltungsentscheidung: Nur arbeitsrelevante Angaben; Details über die Zeile öffnen.
- Handy/Tablet: Zeilen statt zusätzlicher Karten; Hauptaktion bleibt gut erreichbar.
- Angaben/Felder: Urlaubsjahr, Tage (weniger mit Minus), Grund.
- Weitere Aktionen: Anpassung entfernen.
- Unverändert erhalten: Anpassung entfernen nur mit Bestätigung; Urlaubsjahr getrennt; Kein stilles Überschreiben des Grundanspruchs.
- Quelle: `src/features/users/UrlaubsanspruchKarte.tsx`.

#### 192 · Zusatzrechte nach Rolle (`benutzer-zusatzrechte`)

- Bestehender Ort: `/user-mgmt/:uid · Berechtigungen`
- Darstellung: `form`; Rollen: Geschäftsführung, Administrator. Gezeigtes Beispiel: Geschäftsführung.
- Hauptaktion: Berechtigungen speichern.
- Gestaltungsentscheidung: Nur arbeitsrelevante Angaben; Details über die Zeile öffnen.
- Handy/Tablet: Zeilen statt zusätzlicher Karten; Hauptaktion bleibt gut erreichbar.
- Angaben/Felder: Darf Kunden anlegen und ändern, Darf den Katalog einspielen, Darf Einkaufspreise sehen.
- Unverändert erhalten: Im echten Formular nur die zur aktuellen Rolle passenden Felder; Katalogfreigabe umfasst Einkaufspreise; Kein Rechnungs-Schreibrecht für Projektleitung; Projektleitung erhält ausschließlich das separate Feld Rechnungen seiner Baustellen lesen, kein Rechnungs-Schreibrecht.
- Quelle: `src/features/users/BenutzerakteView.tsx`.

#### 193 · Zusatzrecht der Projektleitung (`benutzer-projektleitung-recht`)

- Bestehender Ort: `/user-mgmt/:uid · Berechtigungen`
- Darstellung: `form`; Rollen: Geschäftsführung, Administrator. Gezeigtes Beispiel: Geschäftsführung.
- Hauptaktion: Berechtigungen speichern.
- Gestaltungsentscheidung: Nur arbeitsrelevante Angaben; Details über die Zeile öffnen.
- Handy/Tablet: Zeilen statt zusätzlicher Karten; Hauptaktion bleibt gut erreichbar.
- Angaben/Felder: Darf Rechnungen seiner Baustellen lesen.
- Unverändert erhalten: Im echten Formular nur die zur aktuellen Rolle passenden Felder; Katalogfreigabe umfasst Einkaufspreise; Kein Rechnungs-Schreibrecht für Projektleitung; Projektleitung erhält ausschließlich das separate Feld Rechnungen seiner Baustellen lesen, kein Rechnungs-Schreibrecht.
- Quelle: `src/features/users/BenutzerakteView.tsx`.

#### 197 · Einstufung als Lehrling (`lehrling-einstufung`)

- Bestehender Ort: `/user-mgmt/:uid · Einstufung als Lehrling`
- Darstellung: `form`; Rollen: Geschäftsführung, Administrator. Gezeigtes Beispiel: Geschäftsführung.
- Hauptaktion: Einstufung speichern.
- Gestaltungsentscheidung: Nur die konkrete Aufgabe mit ihren notwendigen Angaben. Keine zusätzliche Erklärungsebene.
- Handy/Tablet: Zeilen statt zusätzlicher Karten; Hauptaktion bleibt gut erreichbar.
- Angaben/Felder: Einstufung, Lehrbeginn, Lehrzeit, Stunden zählen ins Projekt-Budget.
- Inhaltsgruppen: Gültigkeit.
- Unverändert erhalten: Lehrbeginn kann vor Eintritt liegen; Budgetzählung je Person; Historische Stundensätze bleiben; Keine Rollenrechte aus Einstufung ableiten.
- Quelle: `src/features/users/EinstufungFelder.tsx`.

#### 201 · Urlaubsanpassung entfernen (`urlaubsanspruch-entfernen`)

- Bestehender Ort: `/user-mgmt/:uid · Urlaubsanpassung entfernen`
- Darstellung: `confirm`; Rollen: Geschäftsführung, Administrator. Gezeigtes Beispiel: Geschäftsführung.
- Hauptaktion: Anpassung entfernen.
- Gestaltungsentscheidung: Nur die konkrete Aufgabe mit ihren notwendigen Angaben. Keine zusätzliche Erklärungsebene.
- Handy/Tablet: Zeilen statt zusätzlicher Karten; Hauptaktion bleibt gut erreichbar.
- Inhaltsgruppen: Anpassung für 2026.
- Unverändert erhalten: Bestehende Bestätigung; Neuberechnung des richtigen Urlaubsjahres.
- Quelle: `src/features/users/UrlaubsanspruchKarte.tsx`.

### Einstellungen

#### 134 · Einstellungen (`einstellungen`)

- Bestehender Ort: `/settings/uebersicht`
- Darstellung: `list`; Rollen: Buchhaltung, Geschäftsführung, Administrator. Gezeigtes Beispiel: Geschäftsführung.
- Hauptaktion: keine zusätzliche Hauptaktion.
- Gestaltungsentscheidung: Suchbare Themenliste statt Kacheln. Nur konkrete offene Einrichtungspunkte zeigen; erledigte Grunddaten nicht ständig wiederholen.
- Handy/Tablet: Zeilen statt zusätzlicher Karten; Hauptaktion bleibt gut erreichbar.
- Unverändert erhalten: Unterseiten und Adressen; Sichtbarkeit je Rolle; Einrichtungsstand unbekannt nicht als erledigt.
- Quelle: `src/features/settings/EinstellungenUebersicht.tsx`.

#### 135 · Mein Konto (`konto`)

- Bestehender Ort: `/settings/meldungen`
- Darstellung: `record`; Rollen: Mitarbeiter, Verwaltung, Buchhaltung, Projektleiter, Geschäftsführung, Administrator. Gezeigtes Beispiel: Geschäftsführung.
- Hauptaktion: Einstellungen speichern.
- Gestaltungsentscheidung: Nur arbeitsrelevante Angaben; Details über die Zeile öffnen.
- Handy/Tablet: Zeilen statt zusätzlicher Karten; Hauptaktion bleibt gut erreichbar.
- Angaben/Felder: Neue Materialanforderung, Mein Material ist abholbereit, Eilzustellung für meine Baustellen, Urlaub, Zeitausgleich und Krankmeldungen.
- Inhaltsgruppen: Dieses Gerät, Wovon möchtest du erfahren?, Anmeldung.
- Weitere Aktionen: Testmeldung.
- Unverändert erhalten: Nur rollenpassende Meldungsthemen; Push pro Gerät; Passwort und MFA getrennt; Zwei-Faktor-Pflicht nur berechtigte Spitze setzt sie.
- Quelle: `src/features/settings/NotificationSettings.tsx`, `src/features/settings/ZweiFaktorKarte.tsx`, `src/features/settings/PushStatus.tsx`.

#### 136 · Benachrichtigungen auf diesem Gerät (`push-einrichten`)

- Bestehender Ort: `/settings/meldungen · Gerät`
- Darstellung: `panel`; Rollen: Mitarbeiter, Verwaltung, Buchhaltung, Projektleiter, Geschäftsführung, Administrator. Gezeigtes Beispiel: Geschäftsführung.
- Hauptaktion: Benachrichtigungen aktivieren.
- Gestaltungsentscheidung: Nur arbeitsrelevante Angaben; Details über die Zeile öffnen.
- Handy/Tablet: Zeilen statt zusätzlicher Karten; Hauptaktion bleibt gut erreichbar.
- Inhaltsgruppen: Gerätestatus.
- Weitere Aktionen: Testmeldung senden.
- Unverändert erhalten: Nicht unterstützt/abgelehnt/unbekannt unterscheiden; iOS Installation berücksichtigen; Erfolg erst nach echtem Test.
- Quelle: `src/features/settings/PushStatus.tsx`, `src/features/settings/NotificationSettings.tsx`.

#### 137 · Firmendaten (`firma`)

- Bestehender Ort: `/settings/firma`
- Darstellung: `form`; Rollen: Geschäftsführung, Administrator. Gezeigtes Beispiel: Geschäftsführung.
- Hauptaktion: Firmendaten speichern.
- Gestaltungsentscheidung: Nur arbeitsrelevante Angaben; Details über die Zeile öffnen.
- Handy/Tablet: Zeilen statt zusätzlicher Karten; Hauptaktion bleibt gut erreichbar.
- Angaben/Felder: Firmenname, Straße, PLZ, Ort, Kontakt (eine Zeile), Logo, UID-Nummer, Firmenbuchnummer, Firmenbuchgericht, IBAN, BIC, Bank, Hauptfarbe (#rrggbb) (bei Bedarf), Schrift auf der Hauptfarbe (bei Bedarf), Akzentfarbe (#rrggbb) (bei Bedarf), Schrift auf der Akzentfarbe (bei Bedarf).
- Unverändert erhalten: Briefkopf-/Logo-Vorschau; UID/IBAN-Prüfung; Kontrastprüfung; Bestehende PDF-Belegfarben unabhängig vom UI.
- Quelle: `src/features/settings/FirmendatenView.tsx`.

#### 138 · Sätze und Kosten (`saetze`)

- Bestehender Ort: `/settings/saetze`
- Darstellung: `form`; Rollen: Geschäftsführung, Administrator. Gezeigtes Beispiel: Geschäftsführung.
- Hauptaktion: Sätze speichern.
- Gestaltungsentscheidung: Nur arbeitsrelevante Angaben; Details über die Zeile öffnen.
- Handy/Tablet: Zeilen statt zusätzlicher Karten; Hauptaktion bleibt gut erreichbar.
- Angaben/Felder: Monteur / Facharbeiter (€/h), Helfer (€/h), Lehrling je Einstufung (€/h) (bei Bedarf), Nachtarbeit (%), Notdienst (%), Kosten Facharbeiterstunde (€), Kosten Helferstunde (€), Kosten je Einstufung (€) (bei Bedarf), Standard-Aufschlag (%), Warengruppe (bei Bedarf), Aufschlag der Warengruppe (%) (bei Bedarf).
- Inhaltsgruppen: Stundensätze, Zuschläge, Interne Kostensätze, Materialaufschlag.
- Weitere Aktionen: Auf Standardwerte zurücksetzen.
- Unverändert erhalten: Einstufungen und Lehrjahre; Interne Kosten nur Spitze; Historische Belegwerte unverändert; Warengruppenaufschläge.
- Quelle: `src/features/settings/SettingsView.tsx`, `src/features/settings/MaterialaufschlagFelder.tsx`.

#### 139 · Rechnungsvorgaben (`rechnungsvorgaben`)

- Bestehender Ort: `/settings/rechnung`
- Darstellung: `form`; Rollen: Buchhaltung, Geschäftsführung, Administrator. Gezeigtes Beispiel: Buchhaltung.
- Hauptaktion: Rechnungsvorgaben speichern.
- Gestaltungsentscheidung: Nur arbeitsrelevante Angaben; Details über die Zeile öffnen.
- Handy/Tablet: Zeilen statt zusätzlicher Karten; Hauptaktion bleibt gut erreichbar.
- Angaben/Felder: Umsatzsteuer, Grund der Steuerbefreiung (bei Bedarf), Wir stellen Anzahlungs-, Teil- und Schlussrechnungen, Zahlungsziel (Tage), Skonto (%), Skontofrist (Tage), Firmenkunden: Pauschale 40 € nach § 458 UGB statt Spesen, Erinnerung · Firmenkunden (€), Mahnung · Firmenkunden (€), Letzte Mahnung · Firmenkunden (€), Erinnerung · Privatkunden (€), Mahnung · Privatkunden (€), Letzte Mahnung · Privatkunden (€).
- Inhaltsgruppen: Umsatzsteuer, Zahlungsbedingungen, Mahnungen, Basiszinssatz.
- Unverändert erhalten: Privat-/Firmenkunde getrennt; Zentrale Basiszinsen nicht lokal erfinden; Historie/Gültigkeit; Keine Stundensätze für Buchhaltung.
- Quelle: `src/features/settings/SettingsView.tsx`, `src/features/settings/BasiszinsVerlauf.tsx`.

#### 140 · Basiszinssatz – Verlauf (`basiszins-verlauf`)

- Bestehender Ort: `/settings/rechnung · Basiszins`
- Darstellung: `record`; Rollen: Buchhaltung, Geschäftsführung, Administrator. Gezeigtes Beispiel: Buchhaltung.
- Hauptaktion: keine zusätzliche Hauptaktion.
- Gestaltungsentscheidung: Nur arbeitsrelevante Angaben; Details über die Zeile öffnen.
- Handy/Tablet: Zeilen statt zusätzlicher Karten; Hauptaktion bleibt gut erreichbar.
- Unverändert erhalten: Keine erfundenen aktuellen Zinssätze; Bestehende Historie und Datenquelle.
- Quelle: `src/features/settings/BasiszinsVerlauf.tsx`.

#### 141 · Nummernkreise und Fuhrpark (`nummern`)

- Bestehender Ort: `/settings/nummern`
- Darstellung: `form`; Rollen: Geschäftsführung, Administrator. Gezeigtes Beispiel: Geschäftsführung.
- Hauptaktion: Nummernkreise speichern.
- Gestaltungsentscheidung: Nur arbeitsrelevante Angaben; Details über die Zeile öffnen.
- Handy/Tablet: Zeilen statt zusätzlicher Karten; Hauptaktion bleibt gut erreichbar.
- Angaben/Felder: Rechnungen – Vorsatz, Angebote – Vorsatz, Baustellen – Vorsatz, Kennzeichen des Fuhrparks – Vorsatz.
- Inhaltsgruppen: Vorschau der nächsten Nummern.
- Unverändert erhalten: Keine Wiederverwendung vergebener Nummern; Präfixe und Jahreswechsel nach Bestand; Fuhrpark für Zeiterfassung; Nächste laufende Nummer ist eine Vorschau, kein freies Eingabefeld; Fuhrparkfeld ist der Vorsatz, keine neue Fahrzeugverwaltung.
- Quelle: `src/features/settings/SettingsView.tsx`.

#### 142 · Personal (`personal`)

- Bestehender Ort: `/settings/personal`
- Darstellung: `list`; Rollen: Geschäftsführung, Administrator. Gezeigtes Beispiel: Geschäftsführung.
- Hauptaktion: keine zusätzliche Hauptaktion.
- Gestaltungsentscheidung: Eine Themenliste führt direkt zu den vorhandenen Gruppen auf derselben Unterseite. Keine neue oberste Navigation.
- Handy/Tablet: Zeilen statt zusätzlicher Karten; Hauptaktion bleibt gut erreichbar.
- Unverändert erhalten: Alle bisherigen Untergruppen bleiben höchstens einen Klick weiter; Keine neuen Backend-Einstellungen.
- Quelle: `src/features/settings/SettingsView.tsx`, `src/features/settings/LohnregelnKarte.tsx`, `src/features/settings/SonderurlaubKarte.tsx`.

#### 143 · Urlaubsjahr und Übertrag (`personal-urlaub`)

- Bestehender Ort: `/settings/personal · Urlaub`
- Darstellung: `form`; Rollen: Geschäftsführung, Administrator. Gezeigtes Beispiel: Geschäftsführung.
- Hauptaktion: Urlaubsübertrag speichern.
- Gestaltungsentscheidung: Nur arbeitsrelevante Angaben; Details über die Zeile öffnen.
- Handy/Tablet: Zeilen statt zusätzlicher Karten; Hauptaktion bleibt gut erreichbar.
- Angaben/Felder: Urlaubsjahr beginnt am, Monat, Wie Resturlaub übertragen wird, Verfällt am, Verfallsmonat.
- Unverändert erhalten: Jahresübergreifende Anträge; Urlaubsjahr vs Kalenderjahr; Kein stiller Bestandsumbau; Verfallstag nur bei gewähltem Stichtagsmodell sichtbar; rechtlicher Hinweis bleibt in der Hilfe.
- Quelle: `src/features/settings/SettingsView.tsx`.

#### 144 · Wer Urlaub genehmigt (`personal-genehmiger`)

- Bestehender Ort: `/settings/personal · Genehmigende`
- Darstellung: `form`; Rollen: Geschäftsführung, Administrator. Gezeigtes Beispiel: Geschäftsführung.
- Hauptaktion: Genehmigende speichern.
- Gestaltungsentscheidung: Nur arbeitsrelevante Angaben; Details über die Zeile öffnen.
- Handy/Tablet: Zeilen statt zusätzlicher Karten; Hauptaktion bleibt gut erreichbar.
- Angaben/Felder: Geschäftsführung und Administration – immer, Buchhaltung, Franz Hinterleitner · Projektleitung.
- Unverändert erhalten: Spitze nicht abwählbar; Benutzerbezogene Freigaben; Unbezahlter Urlaub bleibt Spitze.
- Quelle: `src/features/settings/SettingsView.tsx`.

#### 145 · Wochenplan und Einsatzplan (`personal-planung`)

- Bestehender Ort: `/settings/personal · Planung`
- Darstellung: `form`; Rollen: Geschäftsführung, Administrator. Gezeigtes Beispiel: Geschäftsführung.
- Hauptaktion: Einstellungen speichern.
- Gestaltungsentscheidung: Nur arbeitsrelevante Angaben; Details über die Zeile öffnen.
- Handy/Tablet: Zeilen statt zusätzlicher Karten; Hauptaktion bleibt gut erreichbar.
- Angaben/Felder: Alle Mitarbeiter sehen den Wochenplan (nur lesen), Projektleiter sind einteilbar und sehen Mein Einsatzplan, Mitarbeiter dürfen ihren Einsatzplan als Kalender abonnieren.
- Unverändert erhalten: Team-Woche ohne Gründe und Schreibaktionen; Zusatznavigation nur bei Freigabe.
- Quelle: `src/features/settings/SettingsView.tsx`.

#### 146 · Nachtzeit und Überstunden (`personal-lohn`)

- Bestehender Ort: `/settings/personal · Lohnregeln`
- Darstellung: `form`; Rollen: Geschäftsführung, Administrator. Gezeigtes Beispiel: Geschäftsführung.
- Hauptaktion: Lohnregeln speichern.
- Gestaltungsentscheidung: Nur arbeitsrelevante Angaben; Details über die Zeile öffnen.
- Handy/Tablet: Zeilen statt zusätzlicher Karten; Hauptaktion bleibt gut erreichbar.
- Angaben/Felder: Nachtzeit von, Nachtzeit bis, Überstunden, Durchrechnung 48-Stunden-Schnitt (Wochen), Überstunden ab, Sonn- und Feiertage als Überstunden mit 100 %.
- Unverändert erhalten: Bestehende Zuschlagsrechnung; Jugendliche gesondert; Keine pauschale Gleichsetzung von Soll und Überstunden.
- Quelle: `src/features/settings/LohnregelnKarte.tsx`.

#### 147 · Sonderurlaub (`personal-sonder`)

- Bestehender Ort: `/settings/personal · Sonderurlaub`
- Darstellung: `form`; Rollen: Geschäftsführung, Administrator. Gezeigtes Beispiel: Geschäftsführung.
- Hauptaktion: Regeln speichern.
- Gestaltungsentscheidung: Nur arbeitsrelevante Angaben; Details über die Zeile öffnen.
- Handy/Tablet: Zeilen statt zusätzlicher Karten; Hauptaktion bleibt gut erreichbar.
- Angaben/Felder: Eigene Eheschließung oder eingetragene Partnerschaft (Arbeitstage), Tod des Ehepartners, Lebensgefährten oder eingetragenen Partners (Arbeitstage), Tod eigener Kinder, Adoptiv- oder Pflegekinder (Arbeitstage), Tod der Eltern oder Schwiegereltern (Arbeitstage), Tod von Geschwistern, Großeltern oder Schwiegerkindern (Arbeitstage), Geburt eines eigenen Kindes (Arbeitstage), Wohnungswechsel mit eigenem Hausstand (Arbeitstage), Kürzung vorschlagen ab (Kalendertage unbezahlt am Stück).
- Unverändert erhalten: Vollständige vorhandene Anlassliste; Gesetzliche/vertragliche Freigrenzen nicht neu definieren; Grund für Tage darüber.
- Quelle: `src/features/settings/SonderurlaubKarte.tsx`.

#### 148 · 24. und 31. Dezember (`personal-dezember`)

- Bestehender Ort: `/settings/personal · Dezember`
- Darstellung: `form`; Rollen: Geschäftsführung, Administrator. Gezeigtes Beispiel: Geschäftsführung.
- Hauptaktion: Regel speichern.
- Gestaltungsentscheidung: Nur arbeitsrelevante Angaben; Details über die Zeile öffnen.
- Handy/Tablet: Zeilen statt zusätzlicher Karten; Hauptaktion bleibt gut erreichbar.
- Angaben/Felder: Als halbe Tage rechnen (Normalarbeitszeit bis 12 Uhr).
- Unverändert erhalten: Zeit- und Urlaubsberechnung verwenden dieselbe Regel.
- Quelle: `src/features/settings/SettingsView.tsx`.

#### 149 · Kontenrahmen (`kontenrahmen`)

- Bestehender Ort: `/settings/konten`
- Darstellung: `form`; Rollen: Buchhaltung, Geschäftsführung, Administrator. Gezeigtes Beispiel: Buchhaltung.
- Hauptaktion: Kontenrahmen speichern.
- Gestaltungsentscheidung: Nur arbeitsrelevante Angaben; Details über die Zeile öffnen.
- Handy/Tablet: Zeilen statt zusätzlicher Karten; Hauptaktion bleibt gut erreichbar.
- Angaben/Felder: Forderungen (Debitorensammelkonto), Erhaltene Anzahlungen, Steuercode, Bauleistung mit Übergang der Steuerschuld, Bankkonto, Gewährte Skonti, 20 % – Erlöskonto, 13 % – Erlöskonto, 10 % – Erlöskonto, 0 % – Erlöskonto.
- Inhaltsgruppen: Grundkonten, Zahlungen – eigener Stapel, Erlöskonten je Steuersatz.
- Weitere Aktionen: Vorschlag einsetzen.
- Unverändert erhalten: Abstimmung mit Kanzlei; Steuercodes/Anzahlungen/Bauleistung; Keine internen Kostensätze öffnen.
- Quelle: `src/features/settings/KontenrahmenView.tsx`.

#### 150 · Supportzugang (`support`)

- Bestehender Ort: `/settings/support`
- Darstellung: `record`; Rollen: Geschäftsführung, Administrator. Gezeigtes Beispiel: Geschäftsführung.
- Hauptaktion: Einblick gewähren.
- Gestaltungsentscheidung: Nur arbeitsrelevante Angaben; Details über die Zeile öffnen.
- Handy/Tablet: Zeilen statt zusätzlicher Karten; Hauptaktion bleibt gut erreichbar.
- Inhaltsgruppen: Aktuelle Freigaben, Bisherige Zugänge.
- Unverändert erhalten: Zweck/Dauer; Befristung und Widerruf; Historie; Einblick im Betrieb sichtbar.
- Quelle: `src/features/settings/SupportzugangView.tsx`.

#### 151 · Einblick gewähren (`support-gewaehren`)

- Bestehender Ort: `/settings/support · Freigabe`
- Darstellung: `panel`; Rollen: Geschäftsführung, Administrator. Gezeigtes Beispiel: Geschäftsführung.
- Hauptaktion: Befristeten Einblick gewähren.
- Gestaltungsentscheidung: Nur arbeitsrelevante Angaben; Details über die Zeile öffnen.
- Handy/Tablet: Zeilen statt zusätzlicher Karten; Hauptaktion bleibt gut erreichbar.
- Angaben/Felder: Wofür, Zugangsart, Wie lange.
- Unverändert erhalten: Bewusste Freigabe durch Spitze; Sichtbarkeit und Widerruf; Keine dauerhafte Freigabe suggerieren; Mitarbeiten muss ausdrücklich gewählt werden; Zeitbuchungen, Urlaub, Krankenstände und Baustellenfotos bleiben ausgenommen wie im Bestand.
- Quelle: `src/features/settings/SupportzugangView.tsx`.

#### 152 · Module (`module`)

- Bestehender Ort: `/settings/module`
- Darstellung: `form`; Rollen: Administrator. Gezeigtes Beispiel: Administrator.
- Hauptaktion: Module speichern.
- Gestaltungsentscheidung: Nur arbeitsrelevante Angaben; Details über die Zeile öffnen.
- Handy/Tablet: Zeilen statt zusätzlicher Karten; Hauptaktion bleibt gut erreichbar.
- Angaben/Felder: Einsatzplanung, Material und Lager, Urlaub, Handwerksscheine, Angebote, Rechnungen, Nachkalkulation, Wiederkehrende Wartungen, Zeitkonten und Auswertung.
- Inhaltsgruppen: Abhängigkeiten.
- Unverändert erhalten: Nur Administrator; Kern nicht abschaltbar; Abhängige Module vorab nennen; Kein Ersatz für Rechteverwaltung.
- Quelle: `src/features/modules/ModulesView.tsx`.

#### 153 · Datensicherung (`sicherung`)

- Bestehender Ort: `/settings/sicherung`
- Darstellung: `record`; Rollen: Geschäftsführung, Administrator. Gezeigtes Beispiel: Geschäftsführung.
- Hauptaktion: Sicherung jetzt erstellen.
- Gestaltungsentscheidung: Nur arbeitsrelevante Angaben; Details über die Zeile öffnen.
- Handy/Tablet: Zeilen statt zusätzlicher Karten; Hauptaktion bleibt gut erreichbar.
- Angaben/Felder: Zeitraum.
- Inhaltsgruppen: Nächtliche Sicherung, Daten herunterladen, Belegarchiv.
- Unverändert erhalten: Erfolg/unbekannt/überfällig unterscheiden; Externes Ziel nicht aus erfolgreichem Lauf ableiten; Fotos/Dateien separat nachweisen; Kein Restore-Knopf ohne bestehende Funktion; Exportgrenzen und Teilfehler.
- Quelle: `src/features/settings/SicherungView.tsx`, `src/features/settings/LaufStatus.tsx`.

#### 199 · Supportzugang beenden (`support-widerrufen`)

- Bestehender Ort: `/settings/support · Supportzugang beenden`
- Darstellung: `confirm`; Rollen: Geschäftsführung, Administrator. Gezeigtes Beispiel: Geschäftsführung.
- Hauptaktion: Zugang beenden.
- Gestaltungsentscheidung: Nur die konkrete Aufgabe mit ihren notwendigen Angaben. Keine zusätzliche Erklärungsebene.
- Handy/Tablet: Zeilen statt zusätzlicher Karten; Hauptaktion bleibt gut erreichbar.
- Inhaltsgruppen: Aktiver Zugang.
- Unverändert erhalten: Nur bei tatsächlich offenem Zugang anbieten; Bestehender Widerruf und Protokoll bleiben.
- Quelle: `src/features/settings/SupportzugangView.tsx`.

### Plattform

#### 154 · Plattformverwaltung (`plattform`)

- Bestehender Ort: `/plattform`
- Darstellung: `list`; Rollen: Plattformadministrator. Gezeigtes Beispiel: Plattformadministrator.
- Hauptaktion: Betrieb anlegen.
- Gestaltungsentscheidung: Eigene reduzierte Hülle ohne betriebliche Menüpunkte. Administration darf nicht wie ein freier Betriebswechsel wirken.
- Handy/Tablet: Zeilen statt zusätzlicher Karten; Hauptaktion bleibt gut erreichbar.
- Weitere Aktionen: Fehler aus Betrieben, Notzugang, Basiszinssatz.
- Unverändert erhalten: Plattformkonto hat keinen Betriebszugriff; Einblick nur mit Freigabe/Notzugang; Gelöschte separat; Eigene MFA/Passwort erreichbar.
- Quelle: `src/features/plattform/PlattformView.tsx`.

#### 155 · Neuer Betrieb (`plattform-neu`)

- Bestehender Ort: `/plattform · Betrieb anlegen`
- Darstellung: `form`; Rollen: Plattformadministrator. Gezeigtes Beispiel: Plattformadministrator.
- Hauptaktion: Betrieb anlegen.
- Gestaltungsentscheidung: Nur arbeitsrelevante Angaben; Details über die Zeile öffnen.
- Handy/Tablet: Zeilen statt zusätzlicher Karten; Hauptaktion bleibt gut erreichbar.
- Angaben/Felder: Name des Betriebs, Kennung, Erster Administrator, Anmeldung mit, Dessen E-Mail, Benutzername (bei Bedarf), Testbetrieb.
- Unverändert erhalten: Einmalige Übergabe Link/Startpasswort; Betriebskennung eindeutig; Keine wiederverwendbaren Geheimnisse im Mockup.
- Quelle: `src/features/plattform/PlattformView.tsx`.

#### 156 · Betrieb verwalten (`plattform-betrieb`)

- Bestehender Ort: `/plattform · Betriebsfenster`
- Darstellung: `record`; Rollen: Plattformadministrator. Gezeigtes Beispiel: Plattformadministrator.
- Hauptaktion: Nächsten zulässigen Schritt prüfen.
- Gestaltungsentscheidung: Nur arbeitsrelevante Angaben; Details über die Zeile öffnen.
- Handy/Tablet: Zeilen statt zusätzlicher Karten; Hauptaktion bleibt gut erreichbar.
- Angaben/Felder: Grund (steht im Protokoll), Frist (Tage), Zur Löschbestätigung die Kennung eintippen.
- Inhaltsgruppen: Lebenszyklus, Protokoll.
- Unverändert erhalten: Stilllegen→Übergabe→Löschfrist→Löschen; Testbetrieb-Ausnahme nur wie Bestand; Kennungsbestätigung; Kein neuer pauschaler Löschknopf.
- Quelle: `src/features/plattform/BetriebVerwalten.tsx`, `src/features/plattform/PlattformView.tsx`.

#### 157 · Fehler aus den Betrieben (`plattform-fehler`)

- Bestehender Ort: `/plattform · Fehler`
- Darstellung: `list`; Rollen: Plattformadministrator. Gezeigtes Beispiel: Plattformadministrator.
- Hauptaktion: keine zusätzliche Hauptaktion.
- Gestaltungsentscheidung: Nur arbeitsrelevante Angaben; Details über die Zeile öffnen.
- Handy/Tablet: Zeilen statt zusätzlicher Karten; Hauptaktion bleibt gut erreichbar.
- Bereiche: Offen, Erledigt, Alle.
- Unverändert erhalten: Gruppierte Meldungen; Rohdetails nur berechtigter Support; Keine echten Fehlermeldungen/Personendaten im Entwurf.
- Quelle: `src/features/plattform/FehlerListe.tsx`.

#### 158 · Fehlergruppe ansehen (`plattform-fehlerdetail`)

- Bestehender Ort: `/plattform · Fehlerdetails`
- Darstellung: `record`; Rollen: Plattformadministrator. Gezeigtes Beispiel: Plattformadministrator.
- Hauptaktion: Als erledigt markieren.
- Gestaltungsentscheidung: Nur arbeitsrelevante Angaben; Details über die Zeile öffnen.
- Handy/Tablet: Zeilen statt zusätzlicher Karten; Hauptaktion bleibt gut erreichbar.
- Inhaltsgruppen: Meldung.
- Unverändert erhalten: Fehlerdetails sensibel; Erledigen betrifft genau die Gruppe.
- Quelle: `src/features/plattform/FehlerListe.tsx`.

#### 159 · Notzugang öffnen (`plattform-notzugang`)

- Bestehender Ort: `/plattform · Notzugang`
- Darstellung: `form`; Rollen: Plattformadministrator. Gezeigtes Beispiel: Plattformadministrator.
- Hauptaktion: Notzugang öffnen.
- Gestaltungsentscheidung: Nur arbeitsrelevante Angaben; Details über die Zeile öffnen.
- Handy/Tablet: Zeilen statt zusätzlicher Karten; Hauptaktion bleibt gut erreichbar.
- Angaben/Felder: Kennung des Betriebs, Stunden (1–24), Grund.
- Weitere Aktionen: Startpasswort zurücksetzen, Zweiten Faktor zurücksetzen.
- Unverändert erhalten: Befristung und Protokoll; Keine automatische Einsicht nur durch Kenntnis der Kennung; Kontrollierte Notfallrechte.
- Quelle: `src/features/plattform/PlattformView.tsx`.

#### 160 · Notzugang – Startpasswort (`plattform-notpasswort`)

- Bestehender Ort: `/plattform · Notzugang`
- Darstellung: `form`; Rollen: Plattformadministrator. Gezeigtes Beispiel: Plattformadministrator.
- Hauptaktion: Startpasswort erzeugen.
- Gestaltungsentscheidung: Nur arbeitsrelevante Angaben; Details über die Zeile öffnen.
- Handy/Tablet: Zeilen statt zusätzlicher Karten; Hauptaktion bleibt gut erreichbar.
- Angaben/Felder: Konto, Grund, Rückruf an (Firmenbuch / Gewerberegister), Identität durch Rückruf an diese Nummer bestätigt – nicht an die Nummer des Anrufers..
- Unverändert erhalten: Aktiver Notzugang nötig; Identitätsprüfung bleibt ausdrücklich; Kein echtes Kennwort/Code in der Vorschau.
- Quelle: `src/features/plattform/NotzugangPasswort.tsx`.

#### 161 · Notzugang – zweiter Faktor (`plattform-notfaktor`)

- Bestehender Ort: `/plattform · Notzugang`
- Darstellung: `form`; Rollen: Plattformadministrator. Gezeigtes Beispiel: Plattformadministrator.
- Hauptaktion: Zweiten Faktor zurücksetzen.
- Gestaltungsentscheidung: Nur arbeitsrelevante Angaben; Details über die Zeile öffnen.
- Handy/Tablet: Zeilen statt zusätzlicher Karten; Hauptaktion bleibt gut erreichbar.
- Angaben/Felder: Konto, Grund, Rückruf an (Firmenbuch / Gewerberegister), Identität durch Rückruf an diese Nummer bestätigt – nicht an die Nummer des Anrufers..
- Unverändert erhalten: Aktiver Notzugang nötig; Identitätsprüfung bleibt ausdrücklich; Kein echtes Kennwort/Code in der Vorschau.
- Quelle: `src/features/plattform/NotzugangZweiFaktor.tsx`.

#### 162 · Basiszinssatz zentral pflegen (`plattform-basiszins`)

- Bestehender Ort: `/plattform · Basiszinssatz`
- Darstellung: `form`; Rollen: Plattformadministrator. Gezeigtes Beispiel: Plattformadministrator.
- Hauptaktion: Basiszinssatz speichern.
- Gestaltungsentscheidung: Nur arbeitsrelevante Angaben; Details über die Zeile öffnen.
- Handy/Tablet: Zeilen statt zusätzlicher Karten; Hauptaktion bleibt gut erreichbar.
- Angaben/Felder: Halbjahr ab, Basiszinssatz (%).
- Unverändert erhalten: Keine erfundene aktuelle Rate; Gültigkeitszeitpunkt und Verlauf; Änderung wirkt nach bestehender Regel.
- Quelle: `src/features/plattform/BasiszinsZentral.tsx`.

### Querschnitt

#### 163 · Suchen (`suche`)

- Bestehender Ort: `Globale Suche`
- Darstellung: `search`; Rollen: Mitarbeiter, Verwaltung, Buchhaltung, Projektleiter, Geschäftsführung, Administrator. Gezeigtes Beispiel: Geschäftsführung.
- Hauptaktion: keine zusätzliche Hauptaktion.
- Gestaltungsentscheidung: Nur arbeitsrelevante Angaben; Details über die Zeile öffnen.
- Handy/Tablet: Zeilen statt zusätzlicher Karten; Hauptaktion bleibt gut erreichbar.
- Angaben/Felder: Baustelle, Kunde, Rechnung oder Einstellung.
- Unverändert erhalten: Nur für Rolle und Modul sichtbare Ziele; Tastatur und Fokus; Keine gesperrten Seiten als Treffer.
- Quelle: `src/app/Suchfenster.tsx`.

#### 164 · Meldungen (`meldungen`)

- Bestehender Ort: `Meldungsfenster`
- Darstellung: `panel`; Rollen: Mitarbeiter, Verwaltung, Buchhaltung, Projektleiter, Geschäftsführung, Administrator. Gezeigtes Beispiel: Geschäftsführung.
- Hauptaktion: keine zusätzliche Hauptaktion.
- Gestaltungsentscheidung: Nur arbeitsrelevante Angaben; Details über die Zeile öffnen.
- Handy/Tablet: Zeilen statt zusätzlicher Karten; Hauptaktion bleibt gut erreichbar.
- Unverändert erhalten: Rollen-/Empfängerbezug; Nur verfügbare Zielroute; Gelesen-Zustand wie Bestand.
- Quelle: `src/app/Layout.tsx`.

#### 165 · Hilfe zu dieser Seite (`hilfe`)

- Bestehender Ort: `Seitenhilfe`
- Darstellung: `panel`; Rollen: Mitarbeiter, Verwaltung, Buchhaltung, Projektleiter, Geschäftsführung, Administrator. Gezeigtes Beispiel: Geschäftsführung.
- Hauptaktion: keine zusätzliche Hauptaktion.
- Gestaltungsentscheidung: Nur arbeitsrelevante Angaben; Details über die Zeile öffnen.
- Handy/Tablet: Zeilen statt zusätzlicher Karten; Hauptaktion bleibt gut erreichbar.
- Inhaltsgruppen: Rechnungen, Offene Beträge.
- Unverändert erhalten: Alle vorhandenen Hilfetexte; Kontextbezogen statt allgemeiner Dauertipps.
- Quelle: `src/components/SeitenHilfe.tsx`.

#### 166 · Ohne Verbindung (`offline`)

- Bestehender Ort: `Globale Verbindungsanzeige`
- Darstellung: `record`; Rollen: Mitarbeiter, Verwaltung, Buchhaltung, Projektleiter, Geschäftsführung, Administrator. Gezeigtes Beispiel: Geschäftsführung.
- Hauptaktion: keine zusätzliche Hauptaktion.
- Gestaltungsentscheidung: Eine klare Meldung am betroffenen Vorgang; keine allgemeine grüne Gespeichert-Aussage.
- Handy/Tablet: Zeilen statt zusätzlicher Karten; Hauptaktion bleibt gut erreichbar.
- Inhaltsgruppen: Verbindung unterbrochen, Wartet auf Übertragung.
- Weitere Aktionen: Erneut verbinden.
- Unverändert erhalten: Nur bestehende Offline-Funktionen; Konflikt/Übertragung fehlgeschlagen getrennt; Keine automatische Zusage für neue Uploads.
- Quelle: `src/components/Verbindungsband.tsx`, `src/lib/sync/ausgangsfach.ts`.

#### 167 · Daten konnten nicht geladen werden (`fehler`)

- Bestehender Ort: `Fehlerzustand`
- Darstellung: `state`; Rollen: Mitarbeiter, Verwaltung, Buchhaltung, Projektleiter, Geschäftsführung, Administrator. Gezeigtes Beispiel: Geschäftsführung.
- Hauptaktion: Erneut versuchen.
- Gestaltungsentscheidung: Nur arbeitsrelevante Angaben; Details über die Zeile öffnen.
- Handy/Tablet: Zeilen statt zusätzlicher Karten; Hauptaktion bleibt gut erreichbar.
- Inhaltsgruppen: Rechnungen nicht verfügbar.
- Weitere Aktionen: Problem melden.
- Unverändert erhalten: Navigation bleibt nutzbar; Originale fachliche Fehlermeldung; Keine leere Liste als Erfolg.
- Quelle: `src/components/States.tsx`, `src/app/ErrorBoundary.tsx`.

#### 168 · Keine überfällige Rechnung (`leer`)

- Bestehender Ort: `/invoices · leerer Mahnzustand`
- Darstellung: `state`; Rollen: Mitarbeiter, Verwaltung, Buchhaltung, Projektleiter, Geschäftsführung, Administrator. Gezeigtes Beispiel: Geschäftsführung.
- Hauptaktion: keine zusätzliche Hauptaktion.
- Gestaltungsentscheidung: Eine klare Aussage und ein sinnvoller Rückweg. Keine Grafik, Erfolgszahl oder wiederholte Erklärung.
- Handy/Tablet: Zeilen statt zusätzlicher Karten; Hauptaktion bleibt gut erreichbar.
- Inhaltsgruppen: Hier ist alles erledigt..
- Weitere Aktionen: Offene Rechnungen ansehen.
- Unverändert erhalten: Leer vs Suche ohne Treffer vs Ladefehler unterscheiden.
- Quelle: `src/components/States.tsx`.

#### 169 · Rechnungen werden geladen (`laden`)

- Bestehender Ort: `Ladezustand`
- Darstellung: `loading`; Rollen: Mitarbeiter, Verwaltung, Buchhaltung, Projektleiter, Geschäftsführung, Administrator. Gezeigtes Beispiel: Geschäftsführung.
- Hauptaktion: keine zusätzliche Hauptaktion.
- Gestaltungsentscheidung: Nur arbeitsrelevante Angaben; Details über die Zeile öffnen.
- Handy/Tablet: Zeilen statt zusätzlicher Karten; Hauptaktion bleibt gut erreichbar.
- Unverändert erhalten: Gleiche Inhaltshöhe; Keine falschen Nullsummen; Navigation bleibt stehen.
- Quelle: `src/components/States.tsx`.

#### 170 · Kein Zugriff auf diese Ansicht (`gesperrt`)

- Bestehender Ort: `RequireNav / RequireRole / RequireModul`
- Darstellung: `state`; Rollen: Mitarbeiter, Verwaltung, Buchhaltung, Projektleiter, Geschäftsführung, Administrator. Gezeigtes Beispiel: Geschäftsführung.
- Hauptaktion: keine zusätzliche Hauptaktion.
- Gestaltungsentscheidung: Nur arbeitsrelevante Angaben; Details über die Zeile öffnen.
- Handy/Tablet: Zeilen statt zusätzlicher Karten; Hauptaktion bleibt gut erreichbar.
- Inhaltsgruppen: Ansicht nicht verfügbar.
- Weitere Aktionen: Zur Startseite.
- Unverändert erhalten: Keine sensiblen Vorschaudaten; Keine Selbstfreischaltung; Unbekannte Route führt wie bisher zur Startseite.
- Quelle: `src/app/guards.tsx`.

#### 171 · Neue Fassung verfügbar (`aktualisierung`)

- Bestehender Ort: `Globale Aktualisierung`
- Darstellung: `panel`; Rollen: Mitarbeiter, Verwaltung, Buchhaltung, Projektleiter, Geschäftsführung, Administrator. Gezeigtes Beispiel: Geschäftsführung.
- Hauptaktion: Jetzt aktualisieren.
- Gestaltungsentscheidung: Nur arbeitsrelevante Angaben; Details über die Zeile öffnen.
- Handy/Tablet: Zeilen statt zusätzlicher Karten; Hauptaktion bleibt gut erreichbar.
- Inhaltsgruppen: Aktualisierung bereit.
- Weitere Aktionen: Später.
- Unverändert erhalten: Keine ungespeicherten Eingaben verlieren; Ausgangsfach beachten; Keine erzwungene Neuladung während Unterschrift.
- Quelle: `src/components/NeueFassung.tsx`.

#### 172 · Datenauskunft zum Kunden (`kunde-auskunft`)

- Bestehender Ort: `Akte · Datenauskunft`
- Darstellung: `panel`; Rollen: Verwaltung, Buchhaltung, Projektleiter, Geschäftsführung, Administrator. Gezeigtes Beispiel: Geschäftsführung.
- Hauptaktion: Auskunft herunterladen.
- Gestaltungsentscheidung: Nur arbeitsrelevante Angaben; Details über die Zeile öffnen.
- Handy/Tablet: Zeilen statt zusätzlicher Karten; Hauptaktion bleibt gut erreichbar.
- Inhaltsgruppen: Auskunft.
- Unverändert erhalten: Bestehender Umfang und Berechtigungen; Ausgenommene Teile benennen; Keine echten Personendaten im Konzept.
- Quelle: `src/features/customers/KundenakteView.tsx`, `src/features/recht/Datenauskunft.tsx`.

#### 173 · Datenauskunft zur Person (`benutzer-auskunft`)

- Bestehender Ort: `Akte · Datenauskunft`
- Darstellung: `panel`; Rollen: Geschäftsführung, Administrator. Gezeigtes Beispiel: Geschäftsführung.
- Hauptaktion: Auskunft herunterladen.
- Gestaltungsentscheidung: Nur arbeitsrelevante Angaben; Details über die Zeile öffnen.
- Handy/Tablet: Zeilen statt zusätzlicher Karten; Hauptaktion bleibt gut erreichbar.
- Inhaltsgruppen: Auskunft.
- Unverändert erhalten: Bestehender Umfang und Berechtigungen; Ausgenommene Teile benennen; Keine echten Personendaten im Konzept.
- Quelle: `src/features/users/BenutzerakteView.tsx`, `src/features/recht/Datenauskunft.tsx`.

#### 200 · Problem melden (`problem-melden`)

- Bestehender Ort: `Fehlerzustand · Problem melden`
- Darstellung: `panel`; Rollen: Mitarbeiter, Verwaltung, Buchhaltung, Projektleiter, Geschäftsführung, Administrator. Gezeigtes Beispiel: Geschäftsführung.
- Hauptaktion: Meldung senden.
- Gestaltungsentscheidung: Nur die konkrete Aufgabe mit ihren notwendigen Angaben. Keine zusätzliche Erklärungsebene.
- Handy/Tablet: Zeilen statt zusätzlicher Karten; Hauptaktion bleibt gut erreichbar.
- Angaben/Felder: Was ist passiert?.
- Inhaltsgruppen: Empfänger.
- Unverändert erhalten: Keine unnötigen neuen Pflichtdaten; Bestehender Supportweg; Fehlerdetail und Nutzereingabe getrennt.
- Quelle: `src/components/ProblemMelden.tsx`.

### Bestätigungen

#### 174 · Kunde löschen (`bestaetigen-kunde`)

- Bestehender Ort: `Bestehender Bestätigungsdialog`
- Darstellung: `confirm`; Rollen: Mitarbeiter, Verwaltung, Buchhaltung, Projektleiter, Geschäftsführung, Administrator. Gezeigtes Beispiel: Geschäftsführung.
- Hauptaktion: Kunde löschen.
- Gestaltungsentscheidung: Nur arbeitsrelevante Angaben; Details über die Zeile öffnen.
- Handy/Tablet: Zeilen statt zusätzlicher Karten; Hauptaktion bleibt gut erreichbar.
- Inhaltsgruppen: Hausverwaltung Sonnenhof löschen?.
- Unverändert erhalten: Bestehende Bestätigung nicht lockern; Abbrechen mit Fokus-Rückkehr; Fehlversuch lässt Daten und Kontext stehen.
- Quelle: `src/features/customers/CustomersView.tsx`.

#### 175 · Angebot löschen (`bestaetigen-angebot`)

- Bestehender Ort: `Bestehender Bestätigungsdialog`
- Darstellung: `confirm`; Rollen: Mitarbeiter, Verwaltung, Buchhaltung, Projektleiter, Geschäftsführung, Administrator. Gezeigtes Beispiel: Geschäftsführung.
- Hauptaktion: Angebot löschen.
- Gestaltungsentscheidung: Nur arbeitsrelevante Angaben; Details über die Zeile öffnen.
- Handy/Tablet: Zeilen statt zusätzlicher Karten; Hauptaktion bleibt gut erreichbar.
- Inhaltsgruppen: Angebotsentwurf entfernen?.
- Unverändert erhalten: Bestehende Bestätigung nicht lockern; Abbrechen mit Fokus-Rückkehr; Fehlversuch lässt Daten und Kontext stehen.
- Quelle: `src/features/quotes/QuotesView.tsx`.

#### 176 · Termin löschen (`bestaetigen-termin`)

- Bestehender Ort: `Bestehender Bestätigungsdialog`
- Darstellung: `confirm`; Rollen: Mitarbeiter, Verwaltung, Buchhaltung, Projektleiter, Geschäftsführung, Administrator. Gezeigtes Beispiel: Geschäftsführung.
- Hauptaktion: Termin löschen.
- Gestaltungsentscheidung: Nur arbeitsrelevante Angaben; Details über die Zeile öffnen.
- Handy/Tablet: Zeilen statt zusätzlicher Karten; Hauptaktion bleibt gut erreichbar.
- Inhaltsgruppen: Heizkörperlieferung löschen?.
- Unverändert erhalten: Bestehende Bestätigung nicht lockern; Abbrechen mit Fokus-Rückkehr; Fehlversuch lässt Daten und Kontext stehen.
- Quelle: `src/features/termine/TerminFenster.tsx`.

#### 177 · Einsatz löschen (`bestaetigen-einsatz`)

- Bestehender Ort: `Bestehender Bestätigungsdialog`
- Darstellung: `confirm`; Rollen: Mitarbeiter, Verwaltung, Buchhaltung, Projektleiter, Geschäftsführung, Administrator. Gezeigtes Beispiel: Geschäftsführung.
- Hauptaktion: Einsatz löschen.
- Gestaltungsentscheidung: Nur arbeitsrelevante Angaben; Details über die Zeile öffnen.
- Handy/Tablet: Zeilen statt zusätzlicher Karten; Hauptaktion bleibt gut erreichbar.
- Inhaltsgruppen: Einteilung für Max entfernen?.
- Unverändert erhalten: Bestehende Bestätigung nicht lockern; Abbrechen mit Fokus-Rückkehr; Fehlversuch lässt Daten und Kontext stehen.
- Quelle: `src/features/assignments/EinsatzFenster.tsx`.

#### 178 · Bestellung abschließen (`bestaetigen-bestellung`)

- Bestehender Ort: `Bestehender Bestätigungsdialog`
- Darstellung: `confirm`; Rollen: Mitarbeiter, Verwaltung, Buchhaltung, Projektleiter, Geschäftsführung, Administrator. Gezeigtes Beispiel: Geschäftsführung.
- Hauptaktion: Bestellung abschließen.
- Gestaltungsentscheidung: Nur arbeitsrelevante Angaben; Details über die Zeile öffnen.
- Handy/Tablet: Zeilen statt zusätzlicher Karten; Hauptaktion bleibt gut erreichbar.
- Inhaltsgruppen: Anforderung abschließen?.
- Unverändert erhalten: Bestehende Bestätigung nicht lockern; Abbrechen mit Fokus-Rückkehr; Fehlversuch lässt Daten und Kontext stehen.
- Quelle: `src/features/orders/AdminOrdersView.tsx`.

#### 179 · Material löschen (`bestaetigen-material`)

- Bestehender Ort: `Bestehender Bestätigungsdialog`
- Darstellung: `confirm`; Rollen: Mitarbeiter, Verwaltung, Buchhaltung, Projektleiter, Geschäftsführung, Administrator. Gezeigtes Beispiel: Geschäftsführung.
- Hauptaktion: Material löschen.
- Gestaltungsentscheidung: Nur arbeitsrelevante Angaben; Details über die Zeile öffnen.
- Handy/Tablet: Zeilen statt zusätzlicher Karten; Hauptaktion bleibt gut erreichbar.
- Inhaltsgruppen: Pressfitting Bogen 16 mm löschen?.
- Unverändert erhalten: Bestehende Bestätigung nicht lockern; Abbrechen mit Fokus-Rückkehr; Fehlversuch lässt Daten und Kontext stehen.
- Quelle: `src/features/orders/MaterialCatalog.tsx`.

#### 180 · Eintrag löschen (`bestaetigen-zeit`)

- Bestehender Ort: `Bestehender Bestätigungsdialog`
- Darstellung: `confirm`; Rollen: Mitarbeiter, Verwaltung, Buchhaltung, Projektleiter, Geschäftsführung, Administrator. Gezeigtes Beispiel: Geschäftsführung.
- Hauptaktion: Eintrag löschen.
- Gestaltungsentscheidung: Nur arbeitsrelevante Angaben; Details über die Zeile öffnen.
- Handy/Tablet: Zeilen statt zusätzlicher Karten; Hauptaktion bleibt gut erreichbar.
- Inhaltsgruppen: Zeitbuchung vom 13.10.2026 löschen?.
- Unverändert erhalten: Bestehende Bestätigung nicht lockern; Abbrechen mit Fokus-Rückkehr; Fehlversuch lässt Daten und Kontext stehen.
- Quelle: `src/features/time/TimeView.tsx`.

#### 181 · Antrag zurückziehen (`bestaetigen-urlaub`)

- Bestehender Ort: `Bestehender Bestätigungsdialog`
- Darstellung: `confirm`; Rollen: Mitarbeiter, Verwaltung, Buchhaltung, Projektleiter, Geschäftsführung, Administrator. Gezeigtes Beispiel: Geschäftsführung.
- Hauptaktion: Antrag zurückziehen.
- Gestaltungsentscheidung: Nur arbeitsrelevante Angaben; Details über die Zeile öffnen.
- Handy/Tablet: Zeilen statt zusätzlicher Karten; Hauptaktion bleibt gut erreichbar.
- Inhaltsgruppen: Antrag 02.–04.11.2026 zurückziehen?.
- Unverändert erhalten: Bestehende Bestätigung nicht lockern; Abbrechen mit Fokus-Rückkehr; Fehlversuch lässt Daten und Kontext stehen.
- Quelle: `src/features/vacations/VacationsView.tsx`.

#### 182 · Benutzer deaktivieren (`bestaetigen-benutzer`)

- Bestehender Ort: `Bestehender Bestätigungsdialog`
- Darstellung: `confirm`; Rollen: Mitarbeiter, Verwaltung, Buchhaltung, Projektleiter, Geschäftsführung, Administrator. Gezeigtes Beispiel: Geschäftsführung.
- Hauptaktion: Benutzer deaktivieren.
- Gestaltungsentscheidung: Nur arbeitsrelevante Angaben; Details über die Zeile öffnen.
- Handy/Tablet: Zeilen statt zusätzlicher Karten; Hauptaktion bleibt gut erreichbar.
- Inhaltsgruppen: Max Mustermann deaktivieren?.
- Unverändert erhalten: Bestehende Bestätigung nicht lockern; Abbrechen mit Fokus-Rückkehr; Fehlversuch lässt Daten und Kontext stehen.
- Quelle: `src/features/users/BenutzerakteView.tsx`.

#### 183 · Auf Standardwerte zurücksetzen (`bestaetigen-standard`)

- Bestehender Ort: `Bestehender Bestätigungsdialog`
- Darstellung: `confirm`; Rollen: Mitarbeiter, Verwaltung, Buchhaltung, Projektleiter, Geschäftsführung, Administrator. Gezeigtes Beispiel: Geschäftsführung.
- Hauptaktion: Auf Standardwerte zurücksetzen.
- Gestaltungsentscheidung: Nur arbeitsrelevante Angaben; Details über die Zeile öffnen.
- Handy/Tablet: Zeilen statt zusätzlicher Karten; Hauptaktion bleibt gut erreichbar.
- Inhaltsgruppen: Sätze auf Standardwerte zurücksetzen?.
- Unverändert erhalten: Bestehende Bestätigung nicht lockern; Abbrechen mit Fokus-Rückkehr; Fehlversuch lässt Daten und Kontext stehen.
- Quelle: `src/features/settings/SettingsView.tsx`.

### Werkzeug

#### 184 · Musterseite (`muster`)

- Bestehender Ort: `/_muster`
- Darstellung: `record`; Rollen: Administrator, Plattformadministrator. Gezeigtes Beispiel: Administrator.
- Hauptaktion: keine zusätzliche Hauptaktion.
- Gestaltungsentscheidung: Nur arbeitsrelevante Angaben; Details über die Zeile öffnen.
- Handy/Tablet: Zeilen statt zusätzlicher Karten; Hauptaktion bleibt gut erreichbar.
- Inhaltsgruppen: Grundwerte, Arbeitsliste, Zustände.
- Unverändert erhalten: Werkzeug ohne betrieblichen Menüpunkt; Keine Wirkung auf den Betrieb.
- Quelle: `src/features/muster/MusterView.tsx`, `src/features/muster/MusterPlanung.tsx`, `src/features/muster/MusterMonat.tsx`, `src/features/muster/MusterUebersicht.tsx`.

### Wartungen

#### 185 · Wartungen (`wartungen`)

- Bestehender Ort: `/wartungen`
- Darstellung: `list`; Rollen: Verwaltung, Projektleiter, Geschäftsführung, Administrator. Gezeigtes Beispiel: Geschäftsführung.
- Hauptaktion: Wartung anlegen.
- Gestaltungsentscheidung: Nur arbeitsrelevante Angaben; Details über die Zeile öffnen.
- Handy/Tablet: Zeilen statt zusätzlicher Karten; Hauptaktion bleibt gut erreichbar.
- Bereiche: Fällig, Laufend, Alle.
- Unverändert erhalten: Verwaltung nur lesend; Kundenbezug unabhängig von Baustellen; Intervall und Fälligkeit; Ausführungshistorie; Das gezeigte Aktionsbeispiel ist Leitung; Verwaltung erhält diese Aktionen nicht.
- Quelle: `src/features/maintenance/WartungenView.tsx`, `src/features/maintenance/WartungVerlauf.tsx`.

#### 186 · Thermenwartung Sonnenhof (`wartung-detail`)

- Bestehender Ort: `/wartungen · Vereinbarung`
- Darstellung: `record`; Rollen: Verwaltung, Projektleiter, Geschäftsführung, Administrator. Gezeigtes Beispiel: Geschäftsführung.
- Hauptaktion: Wartung erledigt eintragen.
- Gestaltungsentscheidung: Nur arbeitsrelevante Angaben; Details über die Zeile öffnen.
- Handy/Tablet: Zeilen statt zusätzlicher Karten; Hauptaktion bleibt gut erreichbar.
- Inhaltsgruppen: Vereinbarung, Verlauf.
- Weitere Aktionen: Bearbeiten, Wartung löschen.
- Unverändert erhalten: Nicht für Verwaltung schreibbar; Keine Historie überschreiben; Baustelle aus Ausführung erreichbar; Das gezeigte Aktionsbeispiel ist Leitung; Verwaltung erhält diese Aktionen nicht.
- Quelle: `src/features/maintenance/WartungenView.tsx`, `src/features/maintenance/WartungVerlauf.tsx`.

#### 187 · Wartung bearbeiten (`wartung-neu`)

- Bestehender Ort: `/wartungen · Formular`
- Darstellung: `form`; Rollen: Projektleiter, Geschäftsführung, Administrator. Gezeigtes Beispiel: Geschäftsführung.
- Hauptaktion: Wartung speichern.
- Gestaltungsentscheidung: Nur arbeitsrelevante Angaben; Details über die Zeile öffnen.
- Handy/Tablet: Zeilen statt zusätzlicher Karten; Hauptaktion bleibt gut erreichbar.
- Angaben/Felder: Kunde, Anlage, Standort (leer = Kundenadresse), Intervall, Hersteller, Typ, Seriennummer, Baujahr, Preis je Wartung netto (€), Zuletzt gewartet, Nächster Termin, Vereinbarung läuft, Hinweis.
- Unverändert erhalten: Fälligkeit aus Intervall wie bisher; Verwaltung liest nur.
- Quelle: `src/features/maintenance/WartungenView.tsx`.

#### 188 · Wartung erledigt eintragen (`wartung-erledigt`)

- Bestehender Ort: `/wartungen · Ausführung`
- Darstellung: `panel`; Rollen: Projektleiter, Geschäftsführung, Administrator. Gezeigtes Beispiel: Geschäftsführung.
- Hauptaktion: Ausführung speichern.
- Gestaltungsentscheidung: Nur arbeitsrelevante Angaben; Details über die Zeile öffnen.
- Handy/Tablet: Zeilen statt zusätzlicher Karten; Hauptaktion bleibt gut erreichbar.
- Angaben/Felder: Gewartet am, Intervall ab jetzt, Baustelle (optional), Baustelle für diese Wartung anlegen?, Projektnummer.
- Unverändert erhalten: Neue Ausführung statt Datum überschreiben; Optionale Wartungsbaustelle; Leistungs-/Rechnungsweg bleibt bestehen.
- Quelle: `src/features/maintenance/WartungenView.tsx`.

#### 189 · Wartung löschen (`wartung-loeschen`)

- Bestehender Ort: `/wartungen · Löschen`
- Darstellung: `confirm`; Rollen: Projektleiter, Geschäftsführung, Administrator. Gezeigtes Beispiel: Geschäftsführung.
- Hauptaktion: Wartung löschen.
- Gestaltungsentscheidung: Nur arbeitsrelevante Angaben; Details über die Zeile öffnen.
- Handy/Tablet: Zeilen statt zusätzlicher Karten; Hauptaktion bleibt gut erreichbar.
- Inhaltsgruppen: Thermenwartung Sonnenhof.
- Quelle: `src/features/maintenance/WartungenView.tsx`.

## Umsetzung erst nach deiner Entscheidung

Diese Lieferung ist ein überprüfbares Gestaltungskonzept, keine Implementierungsfreigabe. Für den späteren Umbau wird je Bereich die bestehende Elementzuordnung übernommen: keine Felder, Reiter, Aktionen, Bestätigungen, Exporte oder Hinweise verlieren; ergänzende Dinge höchstens einen Klick weiter. Die in diesem Paket gewählten Formularunterteilungen sind Darstellung innerhalb bestehender Routen, keine zusätzliche Navigationsebene für das Tagesgeschäft.

Vor Umsetzung werden die freigegebenen Ansichten gegen jede konkrete Bestandsaktion abgeglichen; danach Komponenten-/Browserprüfungen für betroffene Arbeitswege und Rollen. Datenbank, Berechnungen, Belege und Exporte werden durch diesen Entwurf nicht verändert.

## Reale Inhaltslücken aus dem Bestand

Die öffentlichen Rechtstexte sind im Projekt bereits als Entwurf markiert (`GEPRUEFT=false`); Betreiberangaben und einige Dienstleisterangaben sind dort noch offen. Diese Kennzeichnung bleibt im Konzept sichtbar. Das ist kein durch das neue Design verursachter Fehler und wird hier nicht mit erfundenen Angaben geschlossen. Auch Sicherung/Push/Übertragung bekommen nur dann einen grünen Stand, wenn der echte Lauf ihn belegt.
