# Abdeckung des Gesamtkonzepts

Die Zuordnung belegt die berücksichtigten Ansichten. Sie ist keine produktive Funktionsprüfung.

## Alle Routendeklarationen und impliziten Bereiche

| Bestehender Pfad | Behandlung | Konzeptansichten |
|---|---|---|
| `/login` | Ansicht | `anmelden`, `passwort-vergessen` |
| `/impressum` | Ansicht | `impressum` |
| `/datenschutz` | Ansicht | `datenschutz` |
| `/*` | Hülle / Fallback | `fehler`, `gesperrt`, `laden` |
| `/` | Ansicht | `heute`, `heute-monteur`, `heute-verwaltung`, `heute-buchhaltung`, `heute-projektleitung`, `heute-admin` |
| `/_muster` | Ansicht | `muster` |
| `/time` | Ansicht | `zeit`, `zeit-buero`, `zeit-erweitert`, `zeit-eintraege`, `zeit-bearbeiten`, `zeit-aufteilen`, `zeit-gespeichert`, `zeit-abwesenheit` |
| `/material` | Ansicht | `material`, `material-warenkorb`, `material-meine`, `material-retoure`, `anforderung-abholen` |
| `/anforderungen` | Ansicht | `anforderungen`, `anforderung-detail`, `einkauf`, `einkauf-bestellen`, `einkauf-hinzufuegen`, `grosshaendler`, `retouren`, `retoure-pruefen`, `anforderungen-archiv` |
| `/lager` | Ansicht | `lager`, `lager-artikel`, `wareneingang`, `inventur`, `lager-bewegungen`, `katalog`, `katalog-artikel`, `katalog-import`, `katalog-import-vorschau`, `katalog-import-ergebnis` |
| `/material/anfordern` | Weiterleitung bleibt | `material`, `material-warenkorb`, `material-meine`, `material-retoure`, `anforderung-abholen` |
| `/material/anforderungen` | Weiterleitung bleibt | `anforderungen`, `anforderung-detail`, `einkauf`, `einkauf-bestellen`, `einkauf-hinzufuegen`, `grosshaendler`, `retouren`, `retoure-pruefen`, `anforderungen-archiv` |
| `/material/lager` | Weiterleitung bleibt | `lager`, `lager-artikel`, `wareneingang`, `inventur`, `lager-bewegungen`, `katalog`, `katalog-artikel`, `katalog-import`, `katalog-import-vorschau`, `katalog-import-ergebnis` |
| `/my-schedule/*` | Ansicht | `mein-plan`, `team-woche`, `kalender-abo`, `ruestliste-abhaken` |
| `/vacations` | Ansicht | `urlaub`, `urlaub-antrag`, `za-antrag`, `sonderurlaub`, `pflegefreistellung`, `unbezahlter-urlaub`, `urlaub-detail`, `urlaub-entscheiden`, `urlaub-entscheidung`, `krank-melden`, `krankenstaende`, `krank-buero`, `betriebsurlaub`, `betriebsurlaub-neu`, `urlaub-monat`, `betriebsurlaub-loeschen` |
| `/my-projects` | Ansicht | `meine-baustellen`, `meine-plaene` |
| `/worksheets` | Ansicht | `scheine`, `schein-detail`, `schein-verwerfen`, `schein-zeit-nachtragen` |
| `/worksheet` | Ansicht | `schein-zeiten`, `schein-material`, `schein-fotos`, `schein-unterschrift` |
| `/costing` | Ansicht | `nachkalkulation`, `nachkalkulation-detail` |
| `/quotes` | Ansicht | `angebote`, `angebot-neu`, `angebot-katalog` |
| `/quotes/:id` | Ansicht | `angebot-detail`, `angebot-annehmen` |
| `/customers` | Ansicht | `kunden`, `kunde-neu`, `kunden-import`, `kunden-zuordnen` |
| `/customers/:id` | Ansicht | `kundenakte`, `kunde-bearbeiten`, `kunde-auskunft` |
| `/wartungen` | Ansicht | `wartungen`, `wartung-detail`, `wartung-neu`, `wartung-erledigt`, `wartung-loeschen` |
| `/admin-projects` | Ansicht | `baustellen`, `baustelle-neu` |
| `/admin-projects/:id` | Ansicht | `baustelle`, `baustelle-daten`, `baustelle-dokumente`, `baustelle-scheine`, `dokument-vorschau`, `dokument-upload`, `termine`, `termin` |
| `/assignments/*` | Ansicht | `planung-woche`, `planung-monat`, `planung-tag`, `planung-einsatz`, `ruestliste-planen`, `kalender-abo` |
| `/user-mgmt` | Ansicht | `benutzer`, `benutzer-neu` |
| `/user-mgmt/:uid` | Ansicht | `benutzerakte`, `benutzer-daten`, `benutzer-zugang`, `startpasswort`, `konto-umstellen`, `urlaubsanspruch`, `benutzer-zusatzrechte`, `benutzer-projektleitung-recht`, `lehrling-einstufung`, `urlaubsanspruch-entfernen`, `benutzer-auskunft` |
| `/settings/*` | Ansicht | `einstellungen`, `konto`, `push-einrichten`, `firma`, `saetze`, `rechnungsvorgaben`, `basiszins-verlauf`, `nummern`, `personal`, `personal-urlaub`, `personal-genehmiger`, `personal-planung`, `personal-lohn`, `personal-sonder`, `personal-dezember`, `kontenrahmen`, `support`, `support-gewaehren`, `module`, `sicherung`, `support-widerrufen`, `passwort-aendern`, `zwei-faktor-einrichten` |
| `/invoices` | Ansicht | `rechnungen`, `rechnung-detail`, `rechnungen-lesen`, `rechnung-neu`, `rechnung-vorschau`, `rechnung-anzahlung`, `rechnung-teil`, `rechnung-schluss`, `zahlung`, `mahnungen`, `mahnen`, `mahnlauf`, `rechnung-export`, `bankgarantie`, `rechnung-storno`, `rechnung-stornobeleg`, `rechnung-storno-aufheben`, `rechnung-export-ergebnis` |
| `/accounting` | Ansicht | `mitarbeiter-monat`, `mitarbeiter-woche`, `mitarbeiter-person`, `stunden-export`, `stunden-baustellen`, `arbeitszeit-grenze` |
| `/order` | Weiterleitung bleibt | `material`, `material-warenkorb`, `material-meine`, `material-retoure`, `anforderung-abholen` |
| `/admin-orders` | Weiterleitung bleibt | `anforderungen`, `anforderung-detail`, `einkauf`, `einkauf-bestellen`, `einkauf-hinzufuegen`, `grosshaendler`, `retouren`, `retoure-pruefen`, `anforderungen-archiv` |
| `/stock` | Weiterleitung bleibt | `lager`, `lager-artikel`, `wareneingang`, `inventur`, `lager-bewegungen`, `katalog`, `katalog-artikel`, `katalog-import`, `katalog-import-vorschau`, `katalog-import-ergebnis` |
| `/notifications` | Weiterleitung bleibt | `konto` |
| `/modules` | Weiterleitung bleibt | `module` |
| `*` | Hülle / Fallback | `fehler`, `gesperrt`, `laden` |
| `/plattform` | Implizite AppInhalt-Verzweigung | `plattform`, `plattform-neu`, `plattform-betrieb`, `plattform-fehler`, `plattform-fehlerdetail`, `plattform-notzugang`, `plattform-notpasswort`, `plattform-notfaktor`, `plattform-basiszins` |
| `Anmeldung / verpflichtende Zwischenstufen` | Vor der Betriebs-App | `passwort-setzen`, `zwei-faktor`, `zwei-faktor-code`, `zwei-faktor-einrichten`, `wiederherstellungscodes` |

## Einstellungs-Unterseiten

Alle elf Unterseiten: Übersicht, Mein Konto, Firmendaten, Sätze und Kosten, Rechnungsvorgaben, Nummernkreise, Personal, Kontenrahmen, Supportzugang, Module und Datensicherung. Die rollenabhängige Zuordnung steht maschinenlesbar in `abdeckung.json`.

## 132 Feature-Komponenten

Teilbausteine sind dem ausarbeitenden Bereich zugeordnet, nicht als künstliche zusätzliche App-Seiten gezählt.

| Bestandsdatei | Zuordnung | Entwürfe |
|---|---|---|
| `src/features/accounting/AccountingView.tsx` | explizit | `mitarbeiter-monat`, `mitarbeiter-woche` |
| `src/features/accounting/ArbeitszeitGrenzenKarte.tsx` | explizit | `mitarbeiter-person`, `arbeitszeit-grenze` |
| `src/features/accounting/ExportDialog.tsx` | explizit | `stunden-export` |
| `src/features/accounting/Gesamtsaldo.tsx` | explizit | `mitarbeiter-person` |
| `src/features/accounting/PersonFenster.tsx` | explizit | `mitarbeiter-person` |
| `src/features/accounting/ProjectSummary.tsx` | explizit | `stunden-baustellen` |
| `src/features/accounting/Streifen.tsx` | explizit | `mitarbeiter-monat`, `mitarbeiter-woche` |
| `src/features/accounting/UebersichtListe.tsx` | explizit | `mitarbeiter-monat`, `mitarbeiter-woche` |
| `src/features/assignments/AssignmentsView.tsx` | explizit | `planung-woche`, `planung-monat`, `planung-tag` |
| `src/features/assignments/EinsatzFenster.tsx` | explizit | `planung-einsatz`, `bestaetigen-einsatz` |
| `src/features/assignments/EinsatzFormular.tsx` | explizit | `planung-einsatz` |
| `src/features/assignments/Einsatzplanung.tsx` | Teilbaustein des Bereichs | `termine`, `termin`, `planung-woche`, `planung-monat`, `planung-tag`, `planung-einsatz` … |
| `src/features/assignments/HandyWoche.tsx` | Teilbaustein des Bereichs | `termine`, `termin`, `planung-woche`, `planung-monat`, `planung-tag`, `planung-einsatz` … |
| `src/features/assignments/KalenderAboKarte.tsx` | explizit | `kalender-abo` |
| `src/features/assignments/MonatsAnsicht.tsx` | explizit | `planung-woche`, `planung-monat`, `planung-tag` |
| `src/features/assignments/MonatsKalender.tsx` | Teilbaustein des Bereichs | `termine`, `termin`, `planung-woche`, `planung-monat`, `planung-tag`, `planung-einsatz` … |
| `src/features/assignments/MonatsVorschau.tsx` | Teilbaustein des Bereichs | `termine`, `termin`, `planung-woche`, `planung-monat`, `planung-tag`, `planung-einsatz` … |
| `src/features/assignments/MyScheduleView.tsx` | explizit | `mein-plan` |
| `src/features/assignments/PlanRaster.tsx` | Teilbaustein des Bereichs | `termine`, `termin`, `planung-woche`, `planung-monat`, `planung-tag`, `planung-einsatz` … |
| `src/features/assignments/PlanungsKopf.tsx` | Teilbaustein des Bereichs | `termine`, `termin`, `planung-woche`, `planung-monat`, `planung-tag`, `planung-einsatz` … |
| `src/features/assignments/RuestlisteAbhaken.tsx` | explizit | `ruestliste-abhaken` |
| `src/features/assignments/RuestlistePlanen.tsx` | explizit | `ruestliste-planen` |
| `src/features/assignments/TagFenster.tsx` | Teilbaustein des Bereichs | `termine`, `termin`, `planung-woche`, `planung-monat`, `planung-tag`, `planung-einsatz` … |
| `src/features/assignments/TeamWoche.tsx` | explizit | `team-woche` |
| `src/features/assignments/WochenEintraege.tsx` | Teilbaustein des Bereichs | `termine`, `termin`, `planung-woche`, `planung-monat`, `planung-tag`, `planung-einsatz` … |
| `src/features/assignments/WochenRaster.tsx` | Teilbaustein des Bereichs | `termine`, `termin`, `planung-woche`, `planung-monat`, `planung-tag`, `planung-einsatz` … |
| `src/features/assignments/WochenplanView.tsx` | explizit | `planung-woche`, `planung-monat`, `planung-tag`, `team-woche` |
| `src/features/auth/LoginPage.tsx` | explizit | `anmelden`, `passwort-vergessen` |
| `src/features/auth/PasswortAendern.tsx` | explizit | `passwort-setzen`, `passwort-aendern` |
| `src/features/auth/ZweiFaktorEinrichten.tsx` | explizit | `zwei-faktor-einrichten`, `wiederherstellungscodes` |
| `src/features/auth/ZweiFaktorSeite.tsx` | explizit | `zwei-faktor`, `zwei-faktor-code` |
| `src/features/costing/NachkalkulationView.tsx` | explizit | `nachkalkulation`, `nachkalkulation-detail` |
| `src/features/customers/CustomersView.tsx` | explizit | `kunden`, `kunde-neu`, `kunden-zuordnen`, `bestaetigen-kunde` |
| `src/features/customers/KundenImport.tsx` | explizit | `kunden-import` |
| `src/features/customers/KundenakteView.tsx` | explizit | `kundenakte`, `kunde-bearbeiten`, `kunde-auskunft` |
| `src/features/customers/UidVies.tsx` | explizit | `kundenakte`, `kunde-bearbeiten`, `uid-pruefung` |
| `src/features/dashboard/DashboardView.tsx` | explizit | `heute`, `heute-monteur`, `heute-verwaltung`, `heute-buchhaltung`, `heute-projektleitung`, `heute-admin` |
| `src/features/dashboard/LaufWarnung.tsx` | Teilbaustein des Bereichs | `heute`, `heute-monteur`, `heute-verwaltung`, `heute-buchhaltung`, `heute-projektleitung`, `heute-admin` |
| `src/features/dashboard/WartungHinweis.tsx` | Teilbaustein des Bereichs | `heute`, `heute-monteur`, `heute-verwaltung`, `heute-buchhaltung`, `heute-projektleitung`, `heute-admin` |
| `src/features/dashboard/start/Handlungsbedarf.tsx` | explizit | `heute`, `heute-monteur`, `heute-verwaltung`, `heute-buchhaltung`, `heute-projektleitung`, `heute-admin` |
| `src/features/dashboard/start/HeuteEigene.tsx` | explizit | `heute`, `heute-monteur`, `heute-verwaltung`, `heute-buchhaltung`, `heute-projektleitung`, `heute-admin` |
| `src/features/dashboard/start/HeuteLeitung.tsx` | explizit | `heute`, `heute-monteur`, `heute-verwaltung`, `heute-buchhaltung`, `heute-projektleitung`, `heute-admin` |
| `src/features/dashboard/start/HeuteListe.tsx` | Teilbaustein des Bereichs | `heute`, `heute-monteur`, `heute-verwaltung`, `heute-buchhaltung`, `heute-projektleitung`, `heute-admin` |
| `src/features/dashboard/start/Kennzahlen.tsx` | Teilbaustein des Bereichs | `heute`, `heute-monteur`, `heute-verwaltung`, `heute-buchhaltung`, `heute-projektleitung`, `heute-admin` |
| `src/features/dashboard/start/StartKarte.tsx` | Teilbaustein des Bereichs | `heute`, `heute-monteur`, `heute-verwaltung`, `heute-buchhaltung`, `heute-projektleitung`, `heute-admin` |
| `src/features/dashboard/start/TermineHeute.tsx` | Teilbaustein des Bereichs | `heute`, `heute-monteur`, `heute-verwaltung`, `heute-buchhaltung`, `heute-projektleitung`, `heute-admin` |
| `src/features/invoices/BankgarantieDialog.tsx` | explizit | `bankgarantie` |
| `src/features/invoices/InvoicesView.tsx` | explizit | `rechnungen`, `rechnung-detail`, `rechnung-neu`, `rechnung-vorschau`, `rechnung-anzahlung`, `rechnung-teil` … |
| `src/features/invoices/RechnungDetail.tsx` | explizit | `rechnungen`, `rechnung-detail` |
| `src/features/invoices/RechnungenLesen.tsx` | explizit | `rechnungen-lesen` |
| `src/features/invoices/RechnungenSeite.tsx` | explizit | `rechnungen-lesen` |
| `src/features/invoices/RechnungsListe.tsx` | explizit | `rechnungen` |
| `src/features/maintenance/WartungVerlauf.tsx` | explizit | `wartungen`, `wartung-detail` |
| `src/features/maintenance/WartungenView.tsx` | explizit | `wartungen`, `wartung-detail`, `wartung-neu`, `wartung-erledigt`, `wartung-loeschen` |
| `src/features/materials/KatalogImport.tsx` | explizit | `katalog-import`, `katalog-import-vorschau`, `katalog-import-ergebnis` |
| `src/features/modules/ModulesView.tsx` | explizit | `module` |
| `src/features/muster/MusterMonat.tsx` | explizit | `muster` |
| `src/features/muster/MusterPlanung.tsx` | explizit | `muster` |
| `src/features/muster/MusterUebersicht.tsx` | explizit | `muster` |
| `src/features/muster/MusterView.tsx` | explizit | `muster` |
| `src/features/orders/AdminOrdersView.tsx` | explizit | `anforderungen`, `anforderung-detail`, `retouren`, `retoure-pruefen`, `anforderungen-archiv`, `bestaetigen-bestellung` |
| `src/features/orders/Einkaufsliste.tsx` | explizit | `einkauf`, `einkauf-bestellen`, `einkauf-hinzufuegen`, `grosshaendler` |
| `src/features/orders/LagerDialoge.tsx` | explizit | `lager-artikel`, `wareneingang`, `inventur`, `lager-bewegungen` |
| `src/features/orders/MaterialCatalog.tsx` | explizit | `katalog`, `katalog-artikel`, `bestaetigen-material` |
| `src/features/orders/OrderView.tsx` | explizit | `material`, `material-warenkorb`, `material-meine`, `anforderung-abholen`, `material-retoure` |
| `src/features/orders/StockView.tsx` | explizit | `lager`, `lager-artikel` |
| `src/features/plattform/BasiszinsZentral.tsx` | explizit | `plattform-basiszins` |
| `src/features/plattform/BetriebVerwalten.tsx` | explizit | `plattform-betrieb` |
| `src/features/plattform/FehlerListe.tsx` | explizit | `plattform-fehler`, `plattform-fehlerdetail` |
| `src/features/plattform/NotzugangPasswort.tsx` | explizit | `plattform-notpasswort` |
| `src/features/plattform/NotzugangZweiFaktor.tsx` | explizit | `plattform-notfaktor` |
| `src/features/plattform/PlattformView.tsx` | explizit | `plattform`, `plattform-neu`, `plattform-betrieb`, `plattform-notzugang` |
| `src/features/projects/AdminProjectsView.tsx` | explizit | `baustellen`, `baustelle-neu`, `baustelle-loeschen` |
| `src/features/projects/BaustellenPlaene.tsx` | explizit | `baustelle-dokumente`, `dokument-upload` |
| `src/features/projects/BaustellenScheine.tsx` | explizit | `baustelle-scheine` |
| `src/features/projects/BaustellenUebersicht.tsx` | explizit | `baustelle` |
| `src/features/projects/BaustellenakteView.tsx` | explizit | `baustelle`, `baustelle-daten` |
| `src/features/projects/BetriebsurlaubHinweis.tsx` | Teilbaustein des Bereichs | `baustellen`, `baustelle-neu`, `baustelle`, `baustelle-daten`, `baustelle-dokumente`, `dokument-upload` … |
| `src/features/projects/MyProjectsView.tsx` | explizit | `meine-baustellen`, `meine-plaene` |
| `src/features/projects/PlaeneListe.tsx` | explizit | `baustelle-dokumente`, `dokument-vorschau`, `meine-baustellen`, `meine-plaene` |
| `src/features/quotes/AbrechnungWahl.tsx` | explizit | `angebot-detail`, `angebot-annehmen`, `angebot-entwurf`, `angebot-versendet`, `angebot-abgelehnt` |
| `src/features/quotes/AngebotView.tsx` | explizit | `angebot-detail`, `angebot-annehmen`, `angebot-entwurf`, `angebot-versendet`, `angebot-abgelehnt` |
| `src/features/quotes/KatalogSuche.tsx` | explizit | `angebot-neu`, `angebot-katalog` |
| `src/features/quotes/QuotesView.tsx` | explizit | `angebote`, `angebot-neu`, `angebot-katalog`, `bestaetigen-angebot` |
| `src/features/recht/Datenauskunft.tsx` | explizit | `kundenakte`, `kunde-auskunft`, `benutzer-auskunft` |
| `src/features/recht/DatenschutzView.tsx` | explizit | `datenschutz` |
| `src/features/recht/ImpressumView.tsx` | explizit | `impressum` |
| `src/features/recht/RechtSeite.tsx` | Teilbaustein des Bereichs | `anmelden`, `passwort-vergessen`, `passwort-setzen`, `passwort-aendern`, `zwei-faktor`, `zwei-faktor-code` … |
| `src/features/settings/BasiszinsVerlauf.tsx` | explizit | `rechnungsvorgaben`, `basiszins-verlauf` |
| `src/features/settings/EinstellungenUebersicht.tsx` | explizit | `einstellungen` |
| `src/features/settings/FirmendatenView.tsx` | explizit | `firma` |
| `src/features/settings/KontenrahmenView.tsx` | explizit | `kontenrahmen` |
| `src/features/settings/LaufStatus.tsx` | explizit | `sicherung` |
| `src/features/settings/LohnregelnKarte.tsx` | explizit | `personal`, `personal-lohn` |
| `src/features/settings/MaterialaufschlagFelder.tsx` | explizit | `saetze` |
| `src/features/settings/NotificationSettings.tsx` | explizit | `konto`, `push-einrichten` |
| `src/features/settings/PushStatus.tsx` | explizit | `konto`, `push-einrichten` |
| `src/features/settings/SettingsView.tsx` | explizit | `saetze`, `rechnungsvorgaben`, `nummern`, `personal`, `personal-urlaub`, `personal-genehmiger` … |
| `src/features/settings/SicherungView.tsx` | explizit | `sicherung` |
| `src/features/settings/SonderurlaubKarte.tsx` | explizit | `personal`, `personal-sonder` |
| `src/features/settings/SupportzugangView.tsx` | explizit | `support`, `support-gewaehren`, `support-widerrufen` |
| `src/features/settings/ZweiFaktorKarte.tsx` | explizit | `zwei-faktor-einrichten`, `konto` |
| `src/features/termine/TerminFenster.tsx` | explizit | `termin`, `bestaetigen-termin` |
| `src/features/termine/TerminFormular.tsx` | explizit | `termin` |
| `src/features/termine/TerminListe.tsx` | explizit | `termine` |
| `src/features/termine/TermineKarte.tsx` | explizit | `termine` |
| `src/features/time/AntragKnopf.tsx` | Teilbaustein des Bereichs | `zeit`, `zeit-buero`, `zeit-erweitert`, `zeit-eintraege`, `zeit-bearbeiten`, `zeit-aufteilen` … |
| `src/features/time/AufteilenDialog.tsx` | explizit | `zeit-aufteilen` |
| `src/features/time/TimeForm.tsx` | explizit | `zeit`, `zeit-buero`, `zeit-erweitert`, `zeit-bearbeiten`, `zeit-abwesenheit`, `zeit-leitung` |
| `src/features/time/TimeView.tsx` | explizit | `zeit`, `zeit-buero`, `zeit-erweitert`, `zeit-eintraege`, `zeit-bearbeiten`, `zeit-gespeichert` … |
| `src/features/time/Zeitmarker.tsx` | Teilbaustein des Bereichs | `zeit`, `zeit-buero`, `zeit-erweitert`, `zeit-eintraege`, `zeit-bearbeiten`, `zeit-aufteilen` … |
| `src/features/users/BenutzerakteView.tsx` | explizit | `benutzerakte`, `benutzer-daten`, `benutzer-zugang`, `startpasswort`, `benutzer-auskunft`, `bestaetigen-benutzer` … |
| `src/features/users/EinstufungFelder.tsx` | explizit | `benutzer-neu`, `benutzer-daten`, `lehrling-einstufung` |
| `src/features/users/GeburtsdatumKarte.tsx` | explizit | `benutzerakte` |
| `src/features/users/KontoUmstellen.tsx` | explizit | `benutzer-zugang`, `konto-umstellen` |
| `src/features/users/TagessollFelder.tsx` | explizit | `benutzer-neu`, `benutzer-daten` |
| `src/features/users/UrlaubsanspruchKarte.tsx` | explizit | `benutzerakte`, `urlaubsanspruch`, `urlaubsanspruch-entfernen` |
| `src/features/users/UserMgmtView.tsx` | explizit | `benutzer`, `benutzer-neu` |
| `src/features/vacations/AntragFenster.tsx` | explizit | `urlaub-detail` |
| `src/features/vacations/BetriebsurlaubReiter.tsx` | explizit | `betriebsurlaub`, `betriebsurlaub-neu`, `betriebsurlaub-loeschen` |
| `src/features/vacations/FreistellungFormular.tsx` | explizit | `urlaub-antrag`, `za-antrag`, `sonderurlaub`, `pflegefreistellung`, `unbezahlter-urlaub` |
| `src/features/vacations/FreistellungListe.tsx` | explizit | `urlaub` |
| `src/features/vacations/FreistellungenBestaetigen.tsx` | explizit | `urlaub-entscheiden`, `urlaub-entscheidung` |
| `src/features/vacations/Krankmeldungen.tsx` | explizit | `krank-melden`, `krankenstaende`, `krank-buero` |
| `src/features/vacations/UrlaubMonat.tsx` | explizit | `betriebsurlaub`, `urlaub-monat` |
| `src/features/vacations/VacationsView.tsx` | explizit | `urlaub`, `urlaub-antrag`, `za-antrag`, `sonderurlaub`, `pflegefreistellung`, `unbezahlter-urlaub` … |
| `src/features/worksheets/Fotostreifen.tsx` | explizit | `schein-fotos` |
| `src/features/worksheets/LeistungszeitErfassen.tsx` | explizit | `schein-zeiten` |
| `src/features/worksheets/MaterialErfassen.tsx` | explizit | `schein-material` |
| `src/features/worksheets/Schrittfolge.tsx` | explizit | `schein-detail`, `schein-zeiten`, `schein-unterschrift` |
| `src/features/worksheets/WorkSheetView.tsx` | explizit | `schein-zeiten`, `schein-material`, `schein-fotos`, `schein-unterschrift` |
| `src/features/worksheets/WorkSheetsListView.tsx` | explizit | `scheine`, `schein-detail`, `schein-verwerfen`, `schein-zeit-nachtragen` |
