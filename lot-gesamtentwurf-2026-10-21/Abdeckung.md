# Seiten, Tabs und Funktionen

[Zur Screenübersicht](README.md)

Grundlage ist der aktuelle Quellstand `3e49090` vom 21.10.2026. Das Navigationsinventar wurde direkt aus `src/app/navigation.ts` gelesen; die sichtbaren Bausteine wurden in 134 TSX-Dateien aufgenommen. Es enthält 709 ausgewählte Überschriften, Formularelemente und Dialoge. Interne Komponenten sind Teil einer Seite und erhalten deshalb nicht jeweils eine zusätzliche Entwurfsseite.

**257 neue Ansichten + sechs Startseiten-Referenzen = 263 Ansichten, jeweils in drei Größen.** Die 263 Ansichten enthalten Listen, Register, Filter, Formulare, Detailakten, Dialoge sowie ausgewählte Lade-, Leer- und Fehlerzustände. Sie sind keine Behauptung, dass sämtliche möglichen Daten- und Rechtekombinationen in einem statischen Entwurf dargestellt werden können.

## Alle 19 Ziele der Hauptnavigation

| Aktuelles Ziel | Entwurfsansichten / Einstieg |
| --- | --- |
| Start · `/` | [Heute, Mittwoch](ansichten/heute.md), [Heute, Mittwoch](ansichten/heute-monteur.md), [Heute, Mittwoch](ansichten/heute-verwaltung.md), [Heute, Mittwoch](ansichten/heute-buchhaltung.md), [Heute, Mittwoch](ansichten/heute-projektleitung.md), [Heute, Mittwoch](ansichten/heute-admin.md) |
| Mein Einsatzplan · `/my-schedule` | [Mein Einsatzplan](ansichten/mein-plan.md), [Team-Woche](ansichten/team-woche.md) |
| Meine Baustellen · `/my-projects` | [Meine Baustellen](ansichten/meine-baustellen.md), [Pläne für Sonnenhof](ansichten/meine-plaene.md) |
| Handwerksscheine · `/worksheets` | [Handwerksscheine](ansichten/scheine.md), [Handwerksscheine · Alle](ansichten/scheine-filter-1.md), [Handwerksschein 0318](ansichten/schein-detail.md), [Handwerksschein – Entwurf](ansichten/schein-zeiten.md), [Material erfassen](ansichten/schein-material.md), [Fotos zum Schein](ansichten/schein-fotos.md), [Leistung bestätigen](ansichten/schein-unterschrift.md) |
| Zeiterfassung · `/time` | [Zeit erfassen](ansichten/zeit.md), [Zeit erfassen](ansichten/zeit-buero.md), [Zeit erfassen](ansichten/zeit-leitung.md), [Zeit für Mitarbeiter erfassen](ansichten/zeit-person.md), [Meine Einträge](ansichten/zeit-eintraege.md), [Erweiterte Zeiterfassung](ansichten/zeit-erweitert.md) |
| Urlaub · `/vacations` | [Urlaub](ansichten/urlaub.md), [Urlaub](ansichten/urlaub-buero.md), [Krankenstände](ansichten/krankenstaende.md), [Betriebsurlaub](ansichten/betriebsurlaub.md), [Urlaub im Monat](ansichten/urlaub-monat.md), [Offene Anträge](ansichten/urlaub-entscheiden.md) |
| Material anfordern · `/material` | [Material anfordern](ansichten/material.md), [Meine Anforderungen](ansichten/material-meine.md), [Anforderung prüfen](ansichten/material-warenkorb.md) |
| Einstellungen · `/settings` | [Einstellungen](ansichten/einstellungen.md), [Mein Konto](ansichten/konto.md), [Firmendaten](ansichten/firma.md), [Sätze und Kosten](ansichten/saetze.md), [Rechnungsvorgaben](ansichten/rechnungsvorgaben.md), [Nummernkreise](ansichten/nummern.md), [Personal](ansichten/personal.md), [Kontenrahmen](ansichten/kontenrahmen.md), [Supportzugang](ansichten/support.md), [Module](ansichten/module.md), [Datensicherung](ansichten/sicherung.md) |
| Kunden · `/customers` | [Kunden](ansichten/kunden.md), [Kunden · Anschrift prüfen](ansichten/kunden-filter-1.md), [Kunden · Ohne Kundenart](ansichten/kunden-filter-2.md), [Hausverwaltung Sonnenhof](ansichten/kundenakte.md), [Neuer Kunde](ansichten/kunde-neu.md), [Kunden aus Datei übernehmen](ansichten/kunden-import.md) |
| Wartungen · `/wartungen` | [Wartungen](ansichten/wartungen.md), [Wartungen · Alle](ansichten/wartungen-filter-1.md), [Thermenwartung Sonnenhof](ansichten/wartung-detail.md), [Wartung bearbeiten](ansichten/wartung-neu.md), [Wartung erledigt eintragen](ansichten/wartung-erledigt.md) |
| Anforderungen · `/anforderungen` | [Anforderungen](ansichten/anforderungen.md), [Anforderung bearbeiten](ansichten/anforderung-detail.md), [Einkaufsliste](ansichten/einkauf.md), [Großhändler](ansichten/grosshaendler.md), [Retouren prüfen](ansichten/retouren.md), [Erledigte Anforderungen](ansichten/anforderungen-archiv.md) |
| Lager · `/lager` | [Lager](ansichten/lager.md), [Lager · knapp](ansichten/lager-knapp.md), [Lager · fehlt](ansichten/lager-fehlt.md), [Materialkatalog](ansichten/katalog.md), [Wareneingang buchen](ansichten/wareneingang.md), [Inventur erfassen](ansichten/inventur.md), [Lagerbewegungen](ansichten/lager-bewegungen.md) |
| Angebote · `/quotes` | [Angebote](ansichten/angebote.md), [Angebote · Erledigt](ansichten/angebote-filter-1.md), [Angebote · Alle](ansichten/angebote-filter-2.md), [Angebot erstellen](ansichten/angebot-neu.md), [Angebot A-2026-0088](ansichten/angebot-detail.md), [Angebot bearbeiten](ansichten/angebot-bearbeiten.md) |
| Rechnungen · `/invoices` | [Rechnungen](ansichten/rechnungen.md), [Rechnungen · Erledigt](ansichten/rechnungen-filter-1.md), [Rechnungen · Alle](ansichten/rechnungen-filter-2.md), [Rechnung RE-2026-0234](ansichten/rechnung-detail.md), [Rechnung vorbereiten](ansichten/rechnung-neu.md), [Mahnungen](ansichten/mahnungen.md), [E-Rechnung · Bund](ansichten/e-rechnung-bund.md) |
| Mitarbeiterübersicht · `/accounting` | [Mitarbeiterübersicht](ansichten/mitarbeiter-monat.md), [Mitarbeiterübersicht](ansichten/mitarbeiter-woche.md), [Max Mustermann](ansichten/mitarbeiter-person.md), [Monatskalender](ansichten/mitarbeiter-kalender.md), [Gemeinsamer Monatsvergleich](ansichten/mitarbeiter-monatsraster.md), [Stundenbericht exportieren](ansichten/stunden-export.md), [Stunden je Baustelle](ansichten/stunden-baustellen.md) |
| Baustellen · `/admin-projects` | [Baustellen](ansichten/baustellen.md), [Baustellen · Erledigt](ansichten/baustellen-filter-1.md), [Baustellen · Alle](ansichten/baustellen-filter-2.md), [Heizungstausch Sonnenhof](ansichten/baustelle.md), [Neue Baustelle](ansichten/baustelle-neu.md) |
| Einsatzplanung · `/assignments` | [Einsatzplanung](ansichten/planung-woche.md), [Einsatzplanung](ansichten/planung-monat.md), [Einsatzplanung](ansichten/planung-tag.md), [Einsatzplanung · Baustellen](ansichten/planung-baustellen.md), [Einsatz planen](ansichten/planung-einsatz.md), [Termin planen](ansichten/termin.md) |
| Nachkalkulation · `/costing` | [Nachkalkulation](ansichten/nachkalkulation.md), [Nachkalkulation · Abgeschlossen](ansichten/nachkalkulation-filter-1.md), [Ergebnis Sonnenhof](ansichten/nachkalkulation-detail.md) |
| Benutzerverwaltung · `/user-mgmt` | [Benutzerverwaltung](ansichten/benutzer.md), [Benutzerverwaltung · Deaktivierte](ansichten/benutzer-filter-1.md), [Benutzerverwaltung · Alle](ansichten/benutzer-filter-2.md), [Max Mustermann](ansichten/benutzerakte.md), [Benutzer anlegen](ansichten/benutzer-neu.md) |

## Alle elf Einstellungsseiten

Die Register folgen den vorhandenen Rollen. „Module“ wird nur für die Administration gezeigt; für die Buchhaltung stehen Übersicht, Mein Konto, Rechnungsvorgaben und Kontenrahmen bereit. Mitarbeiter, Verwaltung und Projektleitung behalten ausschließlich ihren eigenen Kontobereich.

| Einstellungsseite | Weitere Unteransichten |
| --- | --- |
| [Einstellungen](ansichten/einstellungen.md) | – |
| [Mein Konto](ansichten/konto.md) | [Passwort ändern](ansichten/passwort-aendern.md), [Zweiten Faktor einrichten](ansichten/zwei-faktor-einrichten.md), [Wiederherstellungscodes sichern](ansichten/wiederherstellungscodes.md), [Benachrichtigungen auf diesem Gerät](ansichten/push-einrichten.md) |
| [Firmendaten](ansichten/firma.md) | [Firmendaten · IBAN prüfen](ansichten/firma-iban-fehler.md) |
| [Sätze und Kosten](ansichten/saetze.md) | – |
| [Rechnungsvorgaben](ansichten/rechnungsvorgaben.md) | [Basiszinssatz – Verlauf](ansichten/basiszins-verlauf.md) |
| [Nummernkreise](ansichten/nummern.md) | [Fuhrpark](ansichten/fuhrpark.md) |
| [Personal](ansichten/personal.md) | [Urlaubsjahr und Übertrag](ansichten/personal-urlaub.md), [Urlaub im Eintrittsjahr](ansichten/personal-eintrittsjahr.md), [Wer Urlaub genehmigt](ansichten/personal-genehmiger.md), [Wochenplan und Einsatzplan](ansichten/personal-planung.md), [Nachtzeit und Überstunden](ansichten/personal-lohn.md), [Sonderurlaub](ansichten/personal-sonder.md), [24. und 31. Dezember](ansichten/personal-dezember.md) |
| [Kontenrahmen](ansichten/kontenrahmen.md) | – |
| [Supportzugang](ansichten/support.md) | [Einblick gewähren](ansichten/support-gewaehren.md), [Supportzugang beenden](ansichten/support-widerrufen.md) |
| [Module](ansichten/module.md) | – |
| [Datensicherung](ansichten/sicherung.md) | [Belegarchiv herunterladen](ansichten/belegarchiv.md), [Nächtliche Läufe](ansichten/sicherung-lauf.md) |

## Register und Listenfilter

Jeder hier verlinkte Zustand besitzt einen eigenen Desktop-, Tablet- und Mobilscreen. Die Tabellen beschreiben bestehende Zustände und benennen deren Entwurfsziel.

| Bereich | Register / Filter |
| --- | --- |
| Kunden · Kunden | [Alle](ansichten/kunden.md), [Anschrift prüfen](ansichten/kunden-filter-1.md), [Ohne Kundenart](ansichten/kunden-filter-2.md) |
| Angebote · Angebote | [Offen](ansichten/angebote.md), [Erledigt](ansichten/angebote-filter-1.md), [Alle](ansichten/angebote-filter-2.md) |
| Baustellen · Baustellen | [Laufend](ansichten/baustellen.md), [Erledigt](ansichten/baustellen-filter-1.md), [Alle](ansichten/baustellen-filter-2.md) |
| Scheine · Handwerksscheine | [Offen](ansichten/scheine.md), [Alle](ansichten/scheine-filter-1.md) |
| Benutzer · Benutzerverwaltung | [Aktive](ansichten/benutzer.md), [Deaktivierte](ansichten/benutzer-filter-1.md), [Alle](ansichten/benutzer-filter-2.md) |
| Wartungen · Wartungen | [Steht an](ansichten/wartungen.md), [Alle](ansichten/wartungen-filter-1.md) |
| Auswertung · Nachkalkulation | [Laufend](ansichten/nachkalkulation.md), [Abgeschlossen](ansichten/nachkalkulation-filter-1.md) |
| Rechnungen · Rechnungen | [Offen](ansichten/rechnungen.md), [Erledigt](ansichten/rechnungen-filter-1.md), [Alle](ansichten/rechnungen-filter-2.md) |
| Kunden · Hausverwaltung Sonnenhof | [Übersicht](ansichten/kundenakte.md), [Baustellen](ansichten/kundenakte-baustellen.md), [Belege](ansichten/kundenakte-belege.md), [Termine und Wartungen](ansichten/kundenakte-termine.md), [Stammdaten](ansichten/kundenakte-stammdaten.md) |
| Baustellen · Heizungstausch Sonnenhof | [Übersicht](ansichten/baustelle.md), [Scheine](ansichten/baustelle-scheine.md), [Termine](ansichten/baustelle-termine.md), [Pläne](ansichten/baustelle-dokumente.md) |
| Benutzer · Max Mustermann | [Profil](ansichten/benutzerakte.md), [Arbeitszeit und Urlaub](ansichten/benutzer-arbeitszeit.md), [Zugang und Rechte](ansichten/benutzer-zugang.md) |
| Urlaub · Urlaub | [Anträge](ansichten/urlaub-buero.md), [Krankenstände](ansichten/krankenstaende.md), [Betriebsurlaub](ansichten/betriebsurlaub.md) |
| Auswertung · Mitarbeiterübersicht | [Monat](ansichten/mitarbeiter-monat.md), [Woche](ansichten/mitarbeiter-woche.md) |
| Planung · Einsatzplanung | [Woche](ansichten/planung-woche.md), [Monat](ansichten/planung-monat.md), [Tag](ansichten/planung-tag.md) |
| Lager | [Lager](ansichten/lager.md), [Lager · knapp](ansichten/lager-knapp.md), [Lager · fehlt](ansichten/lager-fehlt.md), [Materialkatalog](ansichten/katalog.md) |
| Mitarbeiterübersicht – Kalender / Vergleich | [Monatskalender](ansichten/mitarbeiter-kalender.md), [Gemeinsamer Monatsvergleich](ansichten/mitarbeiter-monatsraster.md), [Max Mustermann](ansichten/mitarbeiter-person.md) |
| Rechnungsstatus | [Rechnungen · Überfällig](ansichten/rechnung-status-ueberfaellig.md), [Rechnungen · Teilbezahlt](ansichten/rechnung-status-teilbezahlt.md), [Rechnungen · Bezahlt](ansichten/rechnung-status-bezahlt.md), [Rechnungen · Überzahlt](ansichten/rechnung-status-ueberzahlt.md), [Rechnungen · Storniert](ansichten/rechnung-status-storniert.md) |
| Mein Einsatzplan | [Mein Einsatzplan](ansichten/mein-plan.md), [Team-Woche](ansichten/team-woche.md) · Team-Woche weiterhin nur bei Betriebsfreigabe |

## Wichtige Unterabläufe


**Belege und E-Rechnung**

[Anzahlungsrechnung vorbereiten](ansichten/rechnung-anzahlung.md), [Teilrechnung vorbereiten](ansichten/rechnung-teil.md), [Schlussrechnung vorbereiten](ansichten/rechnung-schluss.md), [Rechnung stornieren](ansichten/rechnung-storno.md), [Stornorechnung ausstellen](ansichten/rechnung-stornobeleg.md), [Storno aufheben](ansichten/rechnung-storno-aufheben.md), [E-Rechnung · Bund](ansichten/e-rechnung-bund.md), [E-Rechnung · Andere öffentliche Stelle](ansichten/e-rechnung-andere.md), [E-Rechnung · Unternehmen](ansichten/e-rechnung-allgemein.md), [Stornorechnung als E-Rechnung](ansichten/e-rechnung-storno.md), [Buchhaltungs-Export](ansichten/rechnung-export.md), [Export prüfen und herunterladen](ansichten/rechnung-export-ergebnis.md)

**Zahlung, Rücklass und Guthaben**

[Zahlung zuordnen](ansichten/zahlung.md), [Guthaben zurückzahlen](ansichten/zahlung-rueckzahlung.md), [Rechnung mit Rücklass](ansichten/rechnung-ruecklass.md), [Rücklass durch Bankgarantie ablösen](ansichten/bankgarantie.md), [Rechnung · Kundenguthaben](ansichten/rechnung-guthaben.md), [Mahnung prüfen](ansichten/mahnen.md), [Mahnlauf prüfen](ansichten/mahnlauf.md)

**Planen und Material vorbereiten**

[Einsatz planen](ansichten/planung-einsatz.md), [Einsatz bearbeiten](ansichten/planung-einsatz-bearbeiten.md), [Termin aus der Woche anlegen](ansichten/planung-termin-woche.md), [Termin aus dem Monat anlegen](ansichten/planung-termin-monat.md), [Termin bearbeiten](ansichten/termin-bearbeiten.md), [Zwischenabnahme](ansichten/termin-lesen.md), [Material für den Einsatz](ansichten/ruestliste-planen.md), [Material zum Einsatz](ansichten/ruestliste-abhaken.md), [Im eigenen Kalender](ansichten/kalender-abo.md)

**Personal und Rechte**

[Arbeitszeit und Urlaub](ansichten/benutzer-arbeitszeit.md), [Zugang von Max Mustermann](ansichten/benutzer-zugang.md), [Zusatzrechte nach Rolle](ansichten/benutzer-zusatzrechte.md), [Zusatzrecht der Projektleitung](ansichten/benutzer-projektleitung-recht.md), [Benutzer · Eintrittsjahr](ansichten/benutzer-eintritt.md), [Einstufung als Lehrling](ansichten/lehrling-einstufung.md), [Neues Startpasswort vergeben](ansichten/startpasswort.md), [Anmeldeart umstellen](ansichten/konto-umstellen.md), [Urlaubsanspruch anpassen](ansichten/urlaubsanspruch.md)

**Zeiten und Abwesenheiten**

[Zeitbuchung bearbeiten](ansichten/zeit-bearbeiten.md), [Zeit auf Baustellen aufteilen](ansichten/zeit-aufteilen.md), [Abwesenheit erfassen](ansichten/zeit-abwesenheit.md), [Urlaub beantragen](ansichten/urlaub-antrag.md), [Zeitausgleich beantragen](ansichten/za-antrag.md), [Sonderurlaub beantragen](ansichten/sonderurlaub.md), [Pflegefreistellung beantragen](ansichten/pflegefreistellung.md), [Unbezahlten Urlaub beantragen](ansichten/unbezahlter-urlaub.md), [Krankmeldung erfassen](ansichten/krank-buero.md), [Krank melden](ansichten/krank-melden.md)

**Zugang und Plattform**

[Anmelden](ansichten/anmelden.md), [Passwort zurücksetzen](ansichten/passwort-vergessen.md), [Eigenes Passwort vergeben](ansichten/passwort-setzen.md), [Zwei-Faktor-Anmeldung](ansichten/zwei-faktor.md), [Mit Wiederherstellungscode anmelden](ansichten/zwei-faktor-code.md), [Plattformverwaltung](ansichten/plattform.md), [Betrieb verwalten](ansichten/plattform-betrieb.md), [Fehler aus den Betrieben](ansichten/plattform-fehler.md), [Notzugang öffnen](ansichten/plattform-notzugang.md), [Basiszinssatz zentral pflegen](ansichten/plattform-basiszins.md)

**Übergreifende Zustände**

[Suchen](ansichten/suche.md), [Meldungen](ansichten/meldungen.md), [Hilfe zu dieser Seite](ansichten/hilfe.md), [Ohne Verbindung](ansichten/offline.md), [Daten konnten nicht geladen werden](ansichten/fehler.md), [Übersicht teilweise geladen](ansichten/teilfehler.md), [Keine überfällige Rechnung](ansichten/leer.md), [Rechnungen werden geladen](ansichten/laden.md), [Kein Zugriff auf diese Ansicht](ansichten/gesperrt.md), [Neue Fassung verfügbar](ansichten/aktualisierung.md), [Ungespeicherte Änderungen](ansichten/entwurf-verwerfen.md), [Weitere Bereiche](ansichten/mobil-mehr.md)

## Funktionserhalt bei der späteren Umsetzung

Jede [Seitendokumentation](README.md) führt vorhandene Funktionen, Felder, Aktionen und die zuständigen Quelldateien auf. Diese Anforderungen bleiben erhalten. Insbesondere werden weder Materialbereiche zusammengelegt noch Planungsansichten, Rechte, Personalwerte oder Belegarten entfernt.

Die sechs Startansichten sind Referenzscreens der bereits umgesetzten Startseite. Der neue Entwurf verändert diese Seite nicht erneut.

Bei einer Umsetzung sind alle vorhandenen Berechnungen, Pflichtfelder, Rollen, Zusatzrechte, Modulschalter, Datenbankregeln, Importe/Exporte und Fehlerfälle anhand der echten App zu prüfen. Die lokale Vorschau zeigt die Gestaltung und ausgewählte Interaktionen; sie ersetzt diesen Nachweis nicht.

## Nachvollziehbare Inventare

- [Entwurfsdaten: alle 263 Ansichten](konzept.json)
- [Aktuelle Rollen- und Navigationsmatrix](rollenmatrix.json)
- [Quelleninventar mit Datei- und Zeilenbezug](quelleninventar.json)
- [Automatische Darstellungsprüfungen](darstellungspruefung.json)
