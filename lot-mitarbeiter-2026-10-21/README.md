# Mitarbeiterübersicht · überarbeiteter Entwurf

**Die Personenliste kommt früher ins Bild.** Zeitraum und Ansicht bilden eine kompakte Bedienzeile. Die große Kennzahlenfläche entfällt; die vorhandenen Summen erscheinen ruhig unter der Liste. Monatssaldo und Gesamtsaldo bleiben bei jeder Person sichtbar.

[Vorher/Nachher auf dem Smartphone](vergleich-vorher-nachher.jpg) · [Smartphone – sichtbarer Anfang](vergleich-mobil-ausschnitt.png) · [Desktop – sichtbarer Anfang](vergleich-desktop-ausschnitt.png) · [Download mit lokaler Galerie](../lot-mitarbeiter-2026-10-21.zip?raw=true)

## Alle Ansichten

| Ansicht | Desktop | Tablet | Mobil |
| --- | --- | --- | --- |
| Monatsvergleich | [Öffnen](bilder/vergleich-desktop.jpg) | [Öffnen](bilder/vergleich-tablet.jpg) | [Öffnen](bilder/vergleich-mobil.jpg) |
| Nur Tage ohne Buchung | [Öffnen](bilder/fehlende-tage-desktop.jpg) | [Öffnen](bilder/fehlende-tage-tablet.jpg) | [Öffnen](bilder/fehlende-tage-mobil.jpg) |
| Wochenvergleich | [Öffnen](bilder/woche-desktop.jpg) | [Öffnen](bilder/woche-tablet.jpg) | [Öffnen](bilder/woche-mobil.jpg) |
| Alle Personen im Tagesraster | [Öffnen](bilder/tagesraster-desktop.jpg) | [Öffnen](bilder/tagesraster-tablet.jpg) | [Öffnen](bilder/tagesraster-mobil.jpg) |
| Person mit offenen Tagen | [Öffnen](bilder/person-desktop.jpg) | [Öffnen](bilder/person-tablet.jpg) | [Öffnen](bilder/person-mobil.jpg) |
| Person mit Kalender | [Öffnen](bilder/person-kalender-desktop.jpg) | [Öffnen](bilder/person-kalender-tablet.jpg) | [Öffnen](bilder/person-kalender-mobil.jpg) |
| Person mit Arbeitszeitgrenze | [Öffnen](bilder/grenzpruefung-desktop.jpg) | [Öffnen](bilder/grenzpruefung-tablet.jpg) | [Öffnen](bilder/grenzpruefung-mobil.jpg) |
| Zeit für fehlenden Tag erfassen | [Öffnen](bilder/zeit-erfassen-desktop.jpg) | [Öffnen](bilder/zeit-erfassen-tablet.jpg) | [Öffnen](bilder/zeit-erfassen-mobil.jpg) |
| Monat und Jahr wählen | [Öffnen](bilder/monatswahl-desktop.jpg) | [Öffnen](bilder/monatswahl-tablet.jpg) | [Öffnen](bilder/monatswahl-mobil.jpg) |
| Suche ohne Treffer | [Öffnen](bilder/suche-desktop.jpg) | [Öffnen](bilder/suche-tablet.jpg) | [Öffnen](bilder/suche-mobil.jpg) |

## Änderungen

- Zeitraum, Wechsel Monat/Woche und Suche stehen zusammen; keine große Zahlenfläche darüber.
- „Nur Tage ohne Buchung“ bleibt ein direkter Filter mit derselben Bedeutung. Ein Arbeitszeitgrenzen-Fall wird dadurch nicht mit fehlenden Buchungen gleichgesetzt.
- Auf Desktop und Tablet stehen Gebucht, Soll bisher, Monatssaldo und Gesamtsaldo im direkten Vergleich.
- Mobil werden die beiden Salden gleichwertig gezeigt; Gebucht und Soll stehen als kompakte Zeile darunter. Ein negativer Saldo erhält keine Fehlerfarbe.
- Die Gesamtsumme ist ausdrücklich mit „alle 6 Personen“ beschriftet, auch wenn die sichtbare Liste gefiltert ist. Die Wochensicht verwendet die Wochensumme.
- Das Personendetail bündelt Zeitkonto, fehlende Tage, Tagesnachweis und den optionalen Kalender. Beide Buchungen eines Tages bleiben einzeln sichtbar.
- Bestehendes mobiles Menü und alle anderen akzeptierten Entwürfe bleiben erhalten.

## Funktionserhalt für die Umsetzung

| Vorhandene Funktion | Anordnung im Entwurf |
| --- | --- |
| Monat/Jahr, voriger/nächster Zeitraum | Bedienzeile über der Liste |
| Monat und Woche | Direkter Ansichtswechsel neben dem Zeitraum |
| Suche und Filter für fehlende Buchungen | Unter bzw. neben der Zeitraumwahl |
| Gebucht, Soll, Monats- und Gesamtsaldo | Vergleichstabelle bzw. Personenzeilen |
| Alle Monatstage vergleichen | „Tagesraster anzeigen“, mit feststehenden Namen |
| Person und einzelnen Tag öffnen | Name, gesamte Personenzeile oder Tagesfeld |
| Fehlenden Tag buchen | „Zeit erfassen“ am konkreten Datum, vorbelegt |
| Mehrere Einträge an einem Tag | Einzelne Zeilen im Tagesnachweis |
| Bearbeiten, Löschen, verrechnete Einträge schützen | Bestehende Regeln bleiben bei der Implementierung erhalten |
| Urlaub, Krankmeldung, Freistellung und ihre Herkunft | Bestehende Abwesenheitsarten und erlaubte Aktionen bleiben erhalten |
| Monat als CSV, Bericht für Zeitraum | Seitenmenü bzw. Exportaktionen der Person |
| Resturlaub, Anpassung, Soll je Wochentag, Eintritt und Start-Saldo | Personendetail; Bedingungen und Hinweise bleiben erhalten |
| Arbeitszeitgrenzen und Korrektur | Konkreter Prüfhinweis und Abschnitt unter der Liste |
| Stunden je Baustelle, Fach-/Helferzeit, Gesamtbudget | Bestehende Auswertung bleibt erreichbar; Budget wird nicht mit Monatsstunden gleichgesetzt |
| Unterstützung mit eingeschränktem Zugriff | Bestehende Supportgrenzen und Rollen bleiben erhalten |

Der neue Entwurf ist **keine fertig implementierte Auswertung**. Die Vorschau simuliert ausgewählte Bedienwege mit Beispieldaten; sie enthält keine produktive Speicherung und keine serverseitige Berechtigungsprüfung. Schutzbedingungen für verrechnete Einträge, Antragshistorie, fehlende Konfiguration, Supportzugang, Fehlerzustände und Exporte müssen bei der Umsetzung aus der echten App übernommen und geprüft werden.

## Daten und Quellen

Fiktiver Datenstand: 14.10.2026. Soll bisher umfasst die Arbeitstage bis 13.10.2026, in diesem Beispiel 69:00 h je Person. Zwei offene Tage bei Max ergeben 53:00 gebucht und −16:00 Monatssaldo; Daniels 13-Stunden-Tag ergibt +5:00. Der Gesamtvergleich beträgt 403:00 / 414:00, der Wochenvergleich 93:00 / 96:00. Urlaub ist im Beispiel als angerechnete Zeit berücksichtigt. Zukünftige Tage werden nicht als fehlend markiert.

Grundlage ist der unveränderte App-Quellstand `3e49090`. Relevante Komponenten:

- `src/features/accounting/AccountingView.tsx`
- `src/features/accounting/UebersichtListe.tsx`
- `src/features/accounting/PersonFenster.tsx`
- `src/features/accounting/Gesamtsaldo.tsx`
- `src/features/accounting/ArbeitszeitGrenzenKarte.tsx`
- `src/features/accounting/ProjectSummary.tsx`

## Dateien öffnen

Alle Bilder sind direkt über diese GitHub-Übersicht erreichbar. Für die lokale Galerie das ZIP entpacken und `galerie.html` öffnen. `index.html#mitarbeiter-monat` enthält die klickbare Studie. Ganze Seiten werden vollständig abgebildet; das mobile Menü ist dafür am Bildende angeordnet. Die zusätzlichen Ausschnitte zeigen das tatsächlich am unteren Fensterrand fixierte Menü.

[Akzeptierter Stand der übrigen Seiten](Freigabestand.md) · [Prüfbericht](Pruefung.md)
