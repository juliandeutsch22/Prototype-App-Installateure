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

Die Texte versprechen keine native App-Store-App, allgemeine Offline-Fähigkeit aller Bereiche, automatische Rechnungszustellung, direkte Kanzlei-Integration, Rechtszertifizierung oder bezifferte Zeit-/Kostenersparnis. Belegformate und Exporte werden als vorhandene Funktionen beschrieben. Preise und Testimonials werden nicht ergänzt.

Die Rechtsseiten werden durch diesen Entwurf nicht neu verfasst oder freigegeben. Verlinkt werden die bestehenden App-Seiten. Eine Veröffentlichung auf der Produktdomain ist nicht Teil dieses Entwurfs.
