# Variante A · Akte mit Kontext

Freigabe am 20.10.2026: „ja finde ich gut. Setze das um“, nach dem Vergleich
von Akte mit Kontext, Registerakte und Leseblatt. Grundlage ist
[Studie 04](https://github.com/juliandeutsch22/Prototype-App-Installateure/blob/5fa73ca/Lot-Akten-Alternativen-04-2026-10-20/README.md).
Dies ersetzt die Anordnung von Entwurf 03. Die vollständige Funktionszuordnung
aus [dessen Abnahme](../lot-akten-03/umsetzung.md) gilt weiterhin.

## Gemeinsamer Aufbau

`AktenKopf` verwendet weiterhin `PageHeader`, stellt den Rückweg davor und
trennt Identität und Aktionen. Die Hilfe bleibt zugänglich. Die CSS-Regeln
gelten nur innerhalb der drei Akten. Andere Seitenköpfe ändern sich nicht.

`AktenBereiche` hält die bestehende Tastatursteuerung, Adressparameter,
Abschnittsanker und montierten Panels. Der Kontext liegt einmal neben allen
Panels; sein Zustand bleibt beim Wechsel erhalten. Auf Tablet und Desktop
stehen Hauptinhalt und Kontext nebeneinander; am Handy untereinander.
Telefon und E-Mail sind dort zusätzlich direkt unter dem Kopf erreichbar.

## Zuordnung

| Akte | Übersicht / Profil | Vollständige Bereiche | Fester Kontext |
| --- | --- | --- | --- |
| Baustelle | Auftrag und Beschreibung, Abrechnungsart, Termine, kompakte Fachzeit/Budget mit Linie, Angebotsverweise und Verlauf; nächster Kundentermin; jüngste drei Scheine | Scheine mit Verrechnungsstand, Dauer, Autor, Unterschrift und Nachladen; Termine mit allen bisherigen Schreibwegen; Pläne mit Hochladen, Kennzeichnung und Löschen | Kunde und fehlende Verknüpfung, vollständige Adresse, Ansprechpartner und Anruf, Bezeichnung, Team, Leitung und deren Warnung |
| Kunde | Bis zu drei aktive Baustellen einschließlich pausierter; nächster Kundentermin; jüngste drei zulässige Rechnungen/Angebote nach Datum, immer ausdrücklich brutto/netto | Baustellen einschließlich alter Namensbestände und Zuordnen; Belege mit bisherigen fünf/allen Rechnungen und allen Angeboten; Termine und Wartungen; Stammdaten mit Kundenart, UID/VIES, Lieferantennummer und Datenschutz | Ansprechpartner, Telefon/E-Mail, Rechnungsanschrift, mehrzeilige Notiz und Zugang zu den Wartungen |
| Benutzer | Beschäftigung, unabhängiges Geburtsdatum, Vertragswerte und ausdrücklich bezeichnete Startwerte | Arbeitszeit und Urlaub mit allen bisherigen Einstellungen und Anspruchsanpassungen; Zugang mit Passwort, Kontoumstellung, Aktivieren/Deaktivieren und Datenschutz | Anmeldekonto, Rolle und Zusatzfreigaben; Link zur Mitarbeiterübersicht nur mit vorhandenem Menüzugriff |

Die Baustelle bekommt keinen zusätzlichen Stammdatenreiter mit weitgehend
denselben Angaben wie Auftrag und Kontext. Alle Felder bleiben unmittelbar
über das bestehende vollständige Bearbeiten erreichbar. Beim Kunden teilen
Termine und Wartungen ihren Bereich; ohne eines der Module heißt er nur
„Termine“ beziehungsweise „Wartungen“. Nicht erlaubte Belege und Scheine
bekommen weder Vorschau noch vollständigen Bereich.

Bestehende `?bereich=planung`, `?bereich=dokumente`, `?bereich=wartung` und
`?bereich=belege` bleiben gültig. Alte Anker wie `#b-plaene`, `#k-baustellen`
und `#k-daten` führen zum neu zugeordneten vollständigen Bereich. Kunden-
Baustellenzeilen öffnen jetzt durchgehend die bestehende direkte Aktenroute.

## Daten und Schutzregeln

- `BaustellenScheine` meldet seinen ohnehin geladenen Stand an die Akte.
  Vollständige Liste und Vorschau verwenden dieselben `ScheinZeilen`,
  dieselbe Rechnungsabfrage und dieselbe 20er-Nachladegrenze. Die Vorschau
  löst keine zweite Abfrage aus und zeigt „verrechnet“ nur im bisherigen
  Rechteumfang. Termin- und Belegvorschauen verwenden ebenfalls vorhandene
  Bestände. Teilfehler werden nicht als leere Listen ausgegeben.
- Fachzeit, Helfer, ausgenommene Lehrlingszeit, Prozent und Warnstufen kommen
  unverändert aus der bestehenden Auswertung. Nur die Grafik wird zur
  schmalen Linie; die tatsächliche Überschreitung bleibt als Text und
  zugänglicher Prozentwert erhalten. Ohne Budget entsteht kein Prozentwert.
- Benutzer-Vertragswerte und Startwerte stammen aus derselben Leseausgabe
  wie der vollständige Arbeitszeitbereich. Es wird kein aktueller Saldo
  daraus erfunden. Konto und Freigaben sind keine zusätzlichen Schreibwege.
- Die bisherigen Formulare, Validierung, Nummernwechsel, VIES-Anfragen,
  unabhängiges Geburtsdatum, KJBG, Kontoumstellung, Datenschutz und Schutz
  ungespeicherter Eingaben bleiben unverändert.
- Keine Änderung an Migrationen, Datenbankregeln, Rollen, Exporten oder
  Berechnungen; keine Änderungen an Produktionsdaten für die Prüfung.

## Abnahme

Neue Gegenproben gegen den vorherigen Stand decken den festen Kontext,
Schein-/Rechnungsvorschauen ohne zweite Abfrage, den gemeinsamen Kopf,
Startwerte und die Budgetlinie ab. Der zusätzliche Belegfall prüft die
Datumsreihenfolge, Netto/Brutto und das Erhalten älterer Belege im Vollbestand.
Bestehende Fachprüfungen wurden auf die neuen Bereiche und den Kontext
umgestellt; die Aussagen zu Rechten, Schreibargumenten, Sonderfällen und
Fehlern bleiben bestehen.

Die Browserabnahme umfasst alle drei Akten mit echten lokalen Speichervorgängen
und erneuter Datenbankkontrolle, außerdem Scheinöffnung, Termine und
Benutzernamenkonto. Darstellung und axe werden für jeden Bereich und das
Bearbeitungsfenster bei 390, 834 und 1440 Pixeln in Hell/Dunkel geprüft.
Die vollständige CI und Auslieferung werden im zugehörigen PR nachgewiesen.
Screens verwenden fiktive Vorschauwerte; diese Prüfung ersetzt nicht die
getrennte Abnahme der echten Schreibwege.
