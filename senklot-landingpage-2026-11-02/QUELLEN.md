# Grundlage des Landingpage-Entwurfs

Geprüfter Live-Stand: **964920e · 02.11.2026, 13:42**, übereinstimmend unter app.senklot.at und installateur-demo.firebaseapp.com. Source-Snapshot: `964920ef` auf main, PR #394.

| Aussage / Bildbereich | Quelle im aktuellen App-Quellcode |
|---|---|
| Aktuelle Planlinie, Raster und deckende Blattflächen | `src/styles/lot-planlinie.css`, `src/styles/lot-blatt.css`, `docs/ui-umbau/entscheidungen.md`, E29–E34 |
| Poppins und IBM Plex Mono | `src/main.tsx`, `src/index.css` |
| Produktzeichen und Wortmarke | `src/components/ProduktMarke.tsx` |
| Kunden, Baustellen und Akten | `src/features/customers/`, `src/features/projects/` |
| Tages-, Wochen-, Monats- und persönliche Planung | `src/features/assignments/`, `src/features/schedule/` bzw. Routen in `src/app/App.tsx` |
| Zeiterfassung und Zeitkonten | `src/features/time/`, `src/features/accounting/` |
| Digitale Handwerksscheine mit Fotos, Unterschrift, PDF | `src/features/worksheets/` |
| Material, Anforderungen, Lager, DATANORM | `src/features/orders/`, `src/features/materials/` |
| Angebote, Angebotsannahme und Baustellenerstellung | `src/features/quotes/`, `src/lib/db/quotes.ts` |
| Rechnungen, Zahlungen, Mahnwesen, ebInterface | `src/features/invoices/` |
| Nachkalkulation, wiederkehrende Wartungen | Routen `/costing`, `/wartungen` und zugehörige Ansichten |
| Rollen und wählbare Module | `src/app/navigation.ts`, `src/lib/permissions.ts`, `src/lib/module.ts` |
| Ausgangsfach für Zeiten und Materialanforderungen | `src/lib/sync/`, `docs/FUNKTIONEN.md` |

Anbieterkontakt office@senklot.at wurde vom Auftraggeber genannt. Die zunächst genannte Login-Adresse ohne „k“ war über die Umgebung nicht erreichbar; app.senklot.at lieferte HTTP 200, den Seitentitel „Senklot“ und die aktuelle Versionskennung.

Die Texte versprechen keine native App-Store-App, allgemeine Offline-Fähigkeit aller Bereiche, automatische Rechnungszustellung, direkte Kanzlei-Integration, Rechtszertifizierung oder bezifferte Zeit-/Kostenersparnis. Belegformate und Exporte werden als vorhandene Funktionen beschrieben. Preise und Telefonnummer stammen aus den nachfolgenden Vorgaben des Auftraggebers. Nettodarstellung und exakt 10 % Jahresrabatt wurden nach dessen Freigabe als B2B-Angebot festgelegt; die Einrichtungspreise bleiben unverändert, die begleitete Einrichtung ist seit 4. November 2026 ausdrücklich optional und wird nur bei Buchung berechnet. Testimonials werden nicht erfunden. Cloudflare Turnstile ist als spätere Option vorbereitet; für den lokalen Standardmodus ist kein Cloudflare-Konto nötig. Für World4you ist PHP/SMTP vorbereitet; Resend ist für diesen Weg nicht erforderlich.

Die Website besitzt eigene Rechtstexte mit den vom Betreiber bereitgestellten Angaben. Eine unabhängige rechtliche Freigabe ist damit nicht verbunden. Die App-Datenschutzerklärung ist separat verlinkt. Es wurde aus dieser Sitzung nicht auf World4you veröffentlicht.

Die SEO-Erweiterung ergänzt sechs statische Funktionsseiten anhand derselben geprüften Funktionen. Metadaten und strukturierte Daten enthalten keine erfundenen Bewertungen, Anbieteranschrift oder rechtliche Zertifizierung. Der öffentlich gelesene Stand von senklot.at entsprach vor dieser Erweiterung bytegleich dem vorherigen Landingpage-Download. Neue Seiten und Weiterleitungen wurden nur lokal getestet; Veröffentlichung und Kontoverifizierung stehen noch aus. Fachliche SEO-/Crawlerquellen stehen in VEROEFFENTLICHEN.md.

## Überarbeitung anhand des Website-Feedbacks vom 4. November 2026

Das bereitgestellte Feedback ist eine qualitative Marketinganalyse ohne eigenen aktuellen Live-Abruf. Die darin genannten Bewertungen, Besucherzahlen und Conversion-Szenarien wurden nicht als gemessene Ergebnisse übernommen. Umgesetzt wurden konkretere Abläufe, Einstieg und Einrichtungsumfang, ein verständlicher Supportumfang, ein reduzierter erster Formularschritt und die ausdrücklich freigegebenen Preise 129 / 180 / 250 € netto.

Zusätzlich geprüfte Belege: `src/features/settings/SicherungView.tsx` für Datenauszug und Belegarchiv; `src/components/Supportband.tsx`, `src/features/settings/SupportzugangView.tsx` und `src/features/recht/DatenschutzView.tsx` für befristeten Supportzugang. Technische Grenzen der Exporte und eine konkrete Einrichtung sind Teil der Vorführung; es wird keine universelle Altdatenmigration behauptet. Backup-Frequenz, Aufbewahrung, Wiederherstellung und Servicezeiten sind vor dem produktiven Start zu vereinbaren und zu prüfen.

Die private World4you-Konfiguration aktiviert weiterhin PHP/SMTP mit PHPMailer; der frühere Node-/Resend-Weg ist nur eine alternative Entwicklerkonfiguration. Die Website besitzt inzwischen eigene Rechtstexte mit den bereitgestellten Betreiberangaben. Diese Überarbeitung ist keine unabhängige rechtliche Freigabe oder Prüfung der produktiven Dienstleisterverträge.

Die Einführungspreise sind nach delegierter Entscheidung für zwölf Monate ab Vertragsbeginn garantiert. Mindestlaufzeit und Weiterführung werden vor Vertragsabschluss vereinbart. Die persönliche Einrichtung ist optional; ohne ausdrückliche Auswahl wird sie weder in der Formularzusammenfassung noch in der serverseitigen E-Mail als angefragt dargestellt.

Der Formularschutz wurde anschließend auf einen lokalen Standardmodus ohne Cloudflare erweitert. Signierte Einmal-Tokens, Mindestzeit, Honeypot und serverseitige Limits funktionieren ohne externe Dienste. Der optionale Turnstile-Modus und dessen ausdrückliche Aktivierung bleiben erhalten. Es wird keine Gleichwertigkeit mit externer Bot-Erkennung behauptet.
