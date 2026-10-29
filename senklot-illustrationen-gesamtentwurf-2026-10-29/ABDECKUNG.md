# Abdeckung des Gesamtentwurfs

Basis: Quellstand `1ae766f598045c35815df36aa48dab40a889b3e2`, inhaltlich identisch mit dem ausgelieferten Main-Stand `d133f64ddcf99f6378797e3a4fe9d73a0ae5a43c`. Keine Produktdatei wird für den Entwurf verändert.

Abgeglichen wurden die echten Routendefinitionen in `src/app/App.tsx`, die Hauptnavigation und Unterseiten in `src/app/navigation.ts` sowie die Aktenreiter und bereichseigenen Tabs. Die vorhandenen 69 Vorschaukontexte wurden auf 119 erweitert.

Enthalten: Startseiten aller sechs Betriebsrollen; sämtliche Hauptbereiche; Wochen-/Monats-/Tagesplanung; eigener Einsatzplan und Team-Woche; Monat, Woche und „Alle Tage vergleichen“ der Mitarbeiterübersicht; Anforderungen und alle Lagerreiter; Kunden-, Baustellen- und Benutzerakten mit allen vorhandenen Reitern; Angebote und Rechnungen samt Listensichten und wichtigen Dialogen; alle Einstellungsunterseiten; alle fünf Bereiche des globalen Admins einschließlich Betriebsakte und weiterer Unteransichten; Anmeldung, Passwort vergessen, zweiter Faktor, Wiederherstellung, Impressum und Datenschutz.

Ergänzend: tatsächliche lokale Leerzustände, Suche ohne Treffer, leerer Aufgabenbereich, nicht geladene Teamdaten und der einmalige Einrichtungshinweis. Die Zeichnungen werden im Browser ergänzt; der bestehende Text und die Bedienelemente bleiben erhalten. Der Einrichtungshinweis ergänzt ausdrücklich neuen Konzepttext. Ausgewählte Antwort- und Sitzungszustände werden nur in dieser Vorschau simuliert.

Nicht als eigene Fachseiten gezählt: interne Entwickler-Musterseite `/_muster`, alte Weiterleitungsadressen, jede mögliche Kombination von Suchbegriffen, Rollenrechten, Datensätzen oder Fehlerantworten. Ein Tab wird mit einem repräsentativen Beispieldatensatz gezeigt; dies ist kein Anspruch auf sämtliche denkbaren Zustände und keine vollständige Funktionsabnahme.

## Gestaltungsentscheidung je Kontext

| Kontext | Pfad | Rolle | Illustrationsregel |
|---|---|---|---|
| Start · Administration | `/` | Administrator | Kleiner Kopfakzent nur bei ausreichend Platz am Desktop |
| Start · Mitarbeiter | `/` | Mitarbeiter | Kleiner Kopfakzent nur bei ausreichend Platz am Desktop |
| Start · Buchhaltung | `/` | Buchhaltung | Kleiner Kopfakzent nur bei ausreichend Platz am Desktop |
| Zeit | `/time` | Mitarbeiter | Bewusst ohne Zusatzillustration; Inhalt und Bedienung bleiben im Fokus |
| Material | `/material` | Mitarbeiter | Kleiner Kopfakzent nur bei ausreichend Platz am Desktop |
| Anforderungen | `/anforderungen` | Verwaltung | Kleiner Kopfakzent nur bei ausreichend Platz am Desktop |
| Lager | `/lager` | Verwaltung | Kleiner Kopfakzent nur bei ausreichend Platz am Desktop |
| Eigener · plan | `/my-schedule/mein` | Mitarbeiter | Bewusst ohne Zusatzillustration; Inhalt und Bedienung bleiben im Fokus |
| Teamplan | `/my-schedule/team` | Mitarbeiter | Bewusst ohne Zusatzillustration; Inhalt und Bedienung bleiben im Fokus |
| Meine · baustellen | `/my-projects` | Mitarbeiter | Bewusst ohne Zusatzillustration; Inhalt und Bedienung bleiben im Fokus |
| Urlaub | `/vacations` | Administrator | Bewusst ohne Zusatzillustration; Inhalt und Bedienung bleiben im Fokus |
| Sonderurlaub | `/sonderurlaub` | Administrator | Bewusst ohne Zusatzillustration; Inhalt und Bedienung bleiben im Fokus |
| Scheine | `/worksheets` | Administrator | Kleiner Kopfakzent nur bei ausreichend Platz am Desktop |
| Schein · neu | `/worksheet` | Mitarbeiter | Bewusst ohne Zusatzillustration; Inhalt und Bedienung bleiben im Fokus |
| Angebote | `/quotes` | Administrator | Kleiner Kopfakzent nur bei ausreichend Platz am Desktop |
| Angebotsakte | `/quotes/q1` | Administrator | Bewusst ohne Zusatzillustration; Inhalt und Bedienung bleiben im Fokus |
| Kunden | `/customers` | Administrator | Kleiner Kopfakzent nur bei ausreichend Platz am Desktop |
| Kundenakte · Übersicht | `/customers/k1` | Administrator | Bewusst ohne Zusatzillustration; Inhalt und Bedienung bleiben im Fokus |
| Wartungen | `/wartungen` | Administrator | Kleiner Kopfakzent nur bei ausreichend Platz am Desktop |
| Baustellen | `/admin-projects` | Administrator | Kleiner Kopfakzent nur bei ausreichend Platz am Desktop |
| Baustellenakte · Auftrag | `/admin-projects/p1` | Administrator | Bewusst ohne Zusatzillustration; Inhalt und Bedienung bleiben im Fokus |
| Einsatzplanung · Woche | `/assignments/woche` | Projektleiter | Bewusst ohne Zusatzillustration; Inhalt und Bedienung bleiben im Fokus |
| Tagesplan | `/assignments/tag` | Projektleiter | Bewusst ohne Zusatzillustration; Inhalt und Bedienung bleiben im Fokus |
| Benutzer | `/user-mgmt` | Administrator | Kleiner Kopfakzent nur bei ausreichend Platz am Desktop |
| Benutzerakte · Person | `/user-mgmt/u1` | Administrator | Bewusst ohne Zusatzillustration; Inhalt und Bedienung bleiben im Fokus |
| Mein Konto | `/settings/meldungen` | Mitarbeiter | Bewusst ohne Zusatzillustration; Inhalt und Bedienung bleiben im Fokus |
| Einstellungen | `/settings/uebersicht` | Administrator | Kleiner Kopfakzent nur bei ausreichend Platz am Desktop |
| Einstellungen · Firmendaten | `/settings/firma` | Administrator | Bewusst ohne Zusatzillustration; Inhalt und Bedienung bleiben im Fokus |
| Sätze und Kosten | `/settings/saetze` | Administrator | Bewusst ohne Zusatzillustration; Inhalt und Bedienung bleiben im Fokus |
| Rechnungsvorgaben | `/settings/rechnung` | Buchhaltung | Bewusst ohne Zusatzillustration; Inhalt und Bedienung bleiben im Fokus |
| Nummernkreise | `/settings/nummern` | Administrator | Bewusst ohne Zusatzillustration; Inhalt und Bedienung bleiben im Fokus |
| Personal | `/settings/personal` | Administrator | Bewusst ohne Zusatzillustration; Inhalt und Bedienung bleiben im Fokus |
| Kontenrahmen | `/settings/konten` | Buchhaltung | Bewusst ohne Zusatzillustration; Inhalt und Bedienung bleiben im Fokus |
| Supportzugang | `/settings/support` | Administrator | Bewusst ohne Zusatzillustration; Inhalt und Bedienung bleiben im Fokus |
| Module | `/settings/module` | Administrator | Bewusst ohne Zusatzillustration; Inhalt und Bedienung bleiben im Fokus |
| Datensicherung | `/settings/sicherung` | Administrator | Bewusst ohne Zusatzillustration; Inhalt und Bedienung bleiben im Fokus |
| Kalkulation | `/costing` | Administrator | Bewusst ohne Zusatzillustration; Inhalt und Bedienung bleiben im Fokus |
| Rechnungen | `/invoices` | Buchhaltung | Kleiner Kopfakzent nur bei ausreichend Platz am Desktop |
| Mitarbeiterübersicht · Monat | `/accounting` | Buchhaltung | Kleiner Kopfakzent nur bei ausreichend Platz am Desktop |
| Impressum | `/impressum` | Administrator | Bewusst ohne Zusatzillustration; Inhalt und Bedienung bleiben im Fokus |
| Datenschutz | `/datenschutz` | Administrator | Bewusst ohne Zusatzillustration; Inhalt und Bedienung bleiben im Fokus |
| Globaler Admin · Betriebe | `/plattform` | Plattformadministrator | Kleiner Kopfakzent nur bei ausreichend Platz am Desktop |
| Planung · monat | `/assignments/woche?ansicht=monat` | Projektleiter | Bewusst ohne Zusatzillustration; Inhalt und Bedienung bleiben im Fokus |
| Mitarbeiter · woche | `/accounting?ansicht=woche` | Buchhaltung | Kleiner Kopfakzent nur bei ausreichend Platz am Desktop |
| Mitarbeiterübersicht · Alle Tage vergleichen | `/accounting?tage=alle` | Buchhaltung | Kleiner Kopfakzent nur bei ausreichend Platz am Desktop |
| Lager · katalog | `/lager?reiter=katalog` | Administrator | Kleiner Kopfakzent nur bei ausreichend Platz am Desktop |
| Lager · import | `/lager?reiter=import` | Administrator | Kleiner Kopfakzent nur bei ausreichend Platz am Desktop |
| Anforderungen · einkauf | `/anforderungen?reiter=einkauf` | Verwaltung | Kleiner Kopfakzent nur bei ausreichend Platz am Desktop |
| Anforderungen · retouren | `/anforderungen?reiter=retouren` | Verwaltung | Kleiner Kopfakzent nur bei ausreichend Platz am Desktop |
| Anforderungen · erledigt | `/anforderungen?reiter=erledigt` | Verwaltung | Kleiner Kopfakzent nur bei ausreichend Platz am Desktop |
| Plattform · support | `/plattform` | Plattformadministrator | Kleiner Kopfakzent nur bei ausreichend Platz am Desktop |
| Plattform · fehler | `/plattform` | Plattformadministrator | Kleiner Kopfakzent nur bei ausreichend Platz am Desktop |
| Plattform · zins | `/plattform` | Plattformadministrator | Kleiner Kopfakzent nur bei ausreichend Platz am Desktop |
| Plattform · konto | `/plattform` | Plattformadministrator | Kleiner Kopfakzent nur bei ausreichend Platz am Desktop |
| Urlaub · krank | `/vacations` | Administrator | Bewusst ohne Zusatzillustration; Inhalt und Bedienung bleiben im Fokus |
| Urlaub · betrieb | `/vacations` | Administrator | Bewusst ohne Zusatzillustration; Inhalt und Bedienung bleiben im Fokus |
| Baustellenakte · scheine | `/admin-projects/p1?bereich=dokumente` | Administrator | Bewusst ohne Zusatzillustration; Inhalt und Bedienung bleiben im Fokus |
| Baustellenakte · termine | `/admin-projects/p1?bereich=planung` | Administrator | Bewusst ohne Zusatzillustration; Inhalt und Bedienung bleiben im Fokus |
| Baustellenakte · plaene | `/admin-projects/p1?bereich=plaene` | Administrator | Bewusst ohne Zusatzillustration; Inhalt und Bedienung bleiben im Fokus |
| Kundenakte · baustellen | `/customers/k1?bereich=baustellen` | Administrator | Bewusst ohne Zusatzillustration; Inhalt und Bedienung bleiben im Fokus |
| Kundenakte · belege | `/customers/k1?bereich=belege` | Administrator | Bewusst ohne Zusatzillustration; Inhalt und Bedienung bleiben im Fokus |
| Kundenakte · termine | `/customers/k1?bereich=wartung` | Administrator | Bewusst ohne Zusatzillustration; Inhalt und Bedienung bleiben im Fokus |
| Kundenakte · stammdaten | `/customers/k1?bereich=daten` | Administrator | Bewusst ohne Zusatzillustration; Inhalt und Bedienung bleiben im Fokus |
| Benutzerakte · arbeitszeit | `/user-mgmt/u1?bereich=arbeitszeit` | Administrator | Bewusst ohne Zusatzillustration; Inhalt und Bedienung bleiben im Fokus |
| Benutzerakte · zugang | `/user-mgmt/u1?bereich=zugang` | Administrator | Bewusst ohne Zusatzillustration; Inhalt und Bedienung bleiben im Fokus |
| Anmeldung | `/login` | Mitarbeiter | Bewusst ohne Zusatzillustration; Inhalt und Bedienung bleiben im Fokus |
| Passwort · vergessen | `/login` | Mitarbeiter | Bewusst ohne Zusatzillustration; Inhalt und Bedienung bleiben im Fokus |
| Zweiter · faktor | `/` | Mitarbeiter | Bewusst ohne Zusatzillustration; Inhalt und Bedienung bleiben im Fokus |
| Wiederherstellung | `/` | Mitarbeiter | Bewusst ohne Zusatzillustration; Inhalt und Bedienung bleiben im Fokus |
| Start · Verwaltung | `/` | Verwaltung | Kleiner Kopfakzent nur bei ausreichend Platz am Desktop |
| Start · Projektleiter | `/` | Projektleiter | Kleiner Kopfakzent nur bei ausreichend Platz am Desktop |
| Start · Geschäftsführung | `/` | Geschäftsführung | Kleiner Kopfakzent nur bei ausreichend Platz am Desktop |
| Rechnungen · Erledigt | `/invoices?ansicht=erledigt` | Administrator | Kleiner Kopfakzent nur bei ausreichend Platz am Desktop |
| Rechnungen · Alle | `/invoices?ansicht=alle` | Administrator | Kleiner Kopfakzent nur bei ausreichend Platz am Desktop |
| Angebote · Erledigt | `/quotes?ansicht=erledigt` | Administrator | Kleiner Kopfakzent nur bei ausreichend Platz am Desktop |
| Angebote · Alle | `/quotes?ansicht=alle` | Administrator | Kleiner Kopfakzent nur bei ausreichend Platz am Desktop |
| Baustellen · Erledigt | `/admin-projects?stand=archiv` | Administrator | Kleiner Kopfakzent nur bei ausreichend Platz am Desktop |
| Baustellen · Alle | `/admin-projects?stand=alle` | Administrator | Kleiner Kopfakzent nur bei ausreichend Platz am Desktop |
| Kunden · Anschrift prüfen | `/customers?auswahl=pruefen` | Administrator | Kleiner Kopfakzent nur bei ausreichend Platz am Desktop |
| Kunden · Ohne Kundenart | `/customers?auswahl=ohne-art` | Administrator | Kleiner Kopfakzent nur bei ausreichend Platz am Desktop |
| Benutzer · Deaktivierte | `/user-mgmt?status=inaktiv` | Administrator | Kleiner Kopfakzent nur bei ausreichend Platz am Desktop |
| Benutzer · Alle | `/user-mgmt?status=alle` | Administrator | Kleiner Kopfakzent nur bei ausreichend Platz am Desktop |
| Handwerksscheine · Alle | `/worksheets?ansicht=alle` | Administrator | Kleiner Kopfakzent nur bei ausreichend Platz am Desktop |
| Lager · Knapp | `/lager?filter=knapp` | Administrator | Kleiner Kopfakzent nur bei ausreichend Platz am Desktop |
| Lager · Fehlend | `/lager?filter=fehlt` | Administrator | Kleiner Kopfakzent nur bei ausreichend Platz am Desktop |
| Urlaub · Eigene Anträge | `/vacations` | Mitarbeiter | Bewusst ohne Zusatzillustration; Inhalt und Bedienung bleiben im Fokus |
| Rechnungen · Lesender Zugriff | `/invoices` | Projektleiter | Kleiner Kopfakzent nur bei ausreichend Platz am Desktop |
| Wochenplan · Nach Baustellen | `/assignments/woche?sicht=baustellen` | Projektleiter | Bewusst ohne Zusatzillustration; Inhalt und Bedienung bleiben im Fokus |
| Einsatzplanung · Einsatz planen | `/assignments/woche` | Projektleiter | Bewusst ohne Zusatzillustration; Inhalt und Bedienung bleiben im Fokus |
| Mitarbeiterübersicht · Person im Monat | `/accounting` | Buchhaltung | Kleiner Kopfakzent nur bei ausreichend Platz am Desktop |
| Kunden · Anlegen | `/customers` | Administrator | Kleiner Kopfakzent nur bei ausreichend Platz am Desktop |
| Baustellen · Anlegen | `/admin-projects` | Administrator | Kleiner Kopfakzent nur bei ausreichend Platz am Desktop |
| Benutzer · Anlegen | `/user-mgmt` | Administrator | Kleiner Kopfakzent nur bei ausreichend Platz am Desktop |
| Angebote · Neuer Entwurf | `/quotes` | Administrator | Kleiner Kopfakzent nur bei ausreichend Platz am Desktop |
| Rechnungen · Erstellen | `/invoices` | Administrator | Kleiner Kopfakzent nur bei ausreichend Platz am Desktop |
| Globaler Admin · Betrieb anlegen | `/plattform` | Plattformadministrator | Kleiner Kopfakzent nur bei ausreichend Platz am Desktop |
| Globaler Admin · Notzugang | `/plattform` | Plattformadministrator | Kleiner Kopfakzent nur bei ausreichend Platz am Desktop |
| Globaler Admin · Löschprotokoll | `/plattform` | Plattformadministrator | Kleiner Kopfakzent nur bei ausreichend Platz am Desktop |
| Globaler Admin · Sitzungsübersicht | `/plattform` | Plattformadministrator | Kleiner Kopfakzent nur bei ausreichend Platz am Desktop |
| Globaler Admin · Passwort im Notzugang | `/plattform` | Plattformadministrator | Kleiner Kopfakzent nur bei ausreichend Platz am Desktop |
| Globaler Admin · Zweiten Faktor verwalten | `/plattform` | Plattformadministrator | Kleiner Kopfakzent nur bei ausreichend Platz am Desktop |
| Rechnung · Detaildialog | `/invoices` | Buchhaltung | Kleiner Kopfakzent nur bei ausreichend Platz am Desktop |
| Globaler Admin · Betriebsakte | `/plattform` | Plattformadministrator | Kleiner Kopfakzent nur bei ausreichend Platz am Desktop |
| Baustellenakte · Stammdaten bearbeiten | `/admin-projects/p1` | Administrator | Bewusst ohne Zusatzillustration; Inhalt und Bedienung bleiben im Fokus |
| Kundenakte · Stammdaten bearbeiten | `/customers/k1?bereich=daten` | Administrator | Bewusst ohne Zusatzillustration; Inhalt und Bedienung bleiben im Fokus |
| Benutzerakte · Profil bearbeiten | `/user-mgmt/u1` | Administrator | Bewusst ohne Zusatzillustration; Inhalt und Bedienung bleiben im Fokus |
| Baustellen · Erste Anlage | `/admin-projects` | Administrator | Erklärende Zeichnung im leeren Bereich |
| Kunden · Erste Anlage | `/customers` | Administrator | Erklärende Zeichnung im leeren Bereich |
| Angebote · Erster Entwurf | `/quotes` | Administrator | Erklärende Zeichnung im leeren Bereich |
| Rechnungen · Noch keine Belege | `/invoices` | Administrator | Erklärende Zeichnung im leeren Bereich |
| Handwerksscheine · Erster Schein | `/worksheets` | Administrator | Erklärende Zeichnung im leeren Bereich |
| Wartungen · Noch keine Vereinbarung | `/wartungen` | Administrator | Erklärende Zeichnung im leeren Bereich |
| Anforderungen · Nichts offen | `/anforderungen` | Administrator | Erklärende Zeichnung im leeren Bereich |
| Einsatzplanung · Leere Woche | `/assignments/woche` | Administrator | Leeres Planungsraster bleibt vollständig bedienbar; keine Zeichnung über dem Raster |
| Baustellenakte · Pläne hinzufügen | `/admin-projects/p1?bereich=plaene` | Administrator | Erklärende Zeichnung im leeren Bereich |
| Start · Aktuell nichts zu erledigen | `/` | Administrator | Erklärende Zeichnung im leeren Bereich |
| Start · Fehlende Daten bleiben als Warnung sichtbar | `/` | Administrator | Kleiner Kopfakzent nur bei ausreichend Platz am Desktop |
| Rechnungen · Keine Suchtreffer | `/invoices?suche=KeinTreffer` | Buchhaltung | Erklärende Zeichnung im leeren Bereich |
| Firmendaten · Ersteinrichtung | `/settings/firma` | Administrator | Einmaliger Einrichtungshinweis |
