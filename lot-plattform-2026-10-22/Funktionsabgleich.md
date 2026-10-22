# Funktionsabgleich · globaler Admin

Entwurf vom 22.10.2026, abgeglichen mit App-Stand `7b223888c7e2c92e30a940868a8b08d81162d87c`.

Die Screens zeigen fiktive Beispieldaten. Insbesondere Fehler, Zinssätze, Löschfristen und Zugangsprobleme sind **keine Befunde zur Live-App**. Der Prototyp führt keine echten Aktionen aus. Die folgende Zuordnung beschreibt den vorgesehenen Funktionserhalt bei einer späteren Umsetzung.

| Bestehende Funktion / Grenze | Platz im Entwurf | Bei der Umsetzung erhalten |
| --- | --- | --- |
| Plattform außerhalb der Betriebs-App | Eigenes Markenband, lokale Bereichswahl | Kein Betriebsmenü, keine Betriebszuordnung; Zugang nach verpflichtender Zwei-Faktor-Anmeldung. `/plattform` bleibt die Route. |
| Betriebsverzeichnis | Betriebe | Name, Kennung, Anlagedatum, Zahl aktiver Leitungskonten, Anzahl mit E-Mail, Testkennzeichnung, Deaktivierung, Löschtermin, Notzugang bis. Keine neuen Betriebsstatistiken. |
| Betrieb verwalten | Ganze Zeile → Seitenfenster | Identität bleibt sichtbar. Auf Mobilgeräten ist Notzugang auch direkt im Fenster erreichbar. |
| Betrieb anlegen | Betrieb anlegen → Betrieb / Erster Zugang | Name, Kennung mit bisherigem Vorschlag, Administratorname, Anmeldeart, E-Mail oder Benutzername, Testbetrieb. Bestehende gemeinsame Validierung und unveränderliche Kennung. |
| Einmalige Ausgabe | Betrieb angelegt | Link oder Benutzername / Startpasswort direkt beim Ergebnis; nur in dieser Sitzung, kein automatischer Versand. Teilhinweise aus dem Anlegeergebnis bleiben beim Ergebnis. Im Entwurf ausschließlich ungültige Platzhalter. |
| Gewährter Einblick | Supportzugänge; Vorschau in der Betriebsübersicht | Betrieb, Grund, Ablauf, Stufe; Öffnen führt später in dieselbe echte Betriebs-App. Rechte und Ausschlüsse werden weiterhin serverseitig durchgesetzt. |
| Ansehen / Mitarbeiten | Text und Zustand direkt am Zugang | Lesen und ausdrücklich erlaubte Mitarbeit unterscheiden. Mitarbeit in Bernstein. Keine neue Berechtigung aus der Bereichswahl. |
| Notzugang | Supportzugänge → Notzugang öffnen; Auswahl auch beim Betrieb | Betrieb oder als Rückfall manuelle Kennung, Grund, Dauer 1–24 Stunden. Ausschließlich lesend, im Betrieb sichtbar, protokolliert und durch den Betrieb beendbar. |
| Passwort im Notzugang | Aktion nur am passenden Notzugang | Aktives Leitungskonto mit Benutzername; Grund, unabhängiger Rückruf, ausdrückliche Identitätsbestätigung. Bei unbekannter Eignung kein versprochener Reset. Ohne geeignetes Konto: Erklärung, bei E-Mail Hinweis auf „Passwort vergessen“. |
| Passwort-Ergebnis | Einmalige Wiederherstellung | Neues Startpasswort nur jetzt; Sitzungen beendet; eigenes Passwort bei nächster Anmeldung; Vorgang protokolliert. |
| Zweiten Faktor zurücksetzen | Eigener Vorgang am Notzugang | Aktive Leitung / Buchhaltung mit Faktor, Grund, Rückruf und Bestätigung. Ergebnis, beendete Sitzungen und Neueinrichtung bei bestehender Pflicht bleiben erhalten. Ohne geeignetes Konto entsprechender Leerzustand. |
| Deaktivieren | Verwaltung · aktiv | Grund erforderlich; Konten sperren, Sitzungen beenden, Push und Nachtlauf ruhen, Daten erhalten. |
| Wieder aktivieren | Verwaltung · deaktiviert | Grund erforderlich; geplante Löschung wird damit abgebrochen. Dieser Zusammenhang steht auch vor der Aktion. |
| Testbetrieb setzen / entfernen | Verwaltung · Testbetrieb / ohne echte Daten | Nachträglich nur zulässig wie im Bestand: Testflag setzen nur ohne echte Daten; entfernen weiterhin möglich. Entfernen bricht eine geplante Testlöschung ab. Keine Erleichterung für echte Betriebe. |
| Übergabe | Verwaltung · deaktiviert → Übergabe bereit | Grund, vollständiger Datenstand, bei Bedarf mehrere Teile, Dateiverzeichnis, Ergebnis mit Umfang und Gültigkeitsfrist von einer Woche. Einteilige Ausgabe bleibt möglich. PDFs entstehen weiterhin in der bestehenden App. |
| Löschung planen | Verwaltung · deaktiviert / Testbetrieb | Deaktivierung zuerst; echte Betriebe mit Übergabe, Vorschlag 30 Tage, mindestens 7, höchstens 365. Testbetrieb ohne Übergabe ab 0 Tagen. |
| Löschung abbrechen | Verwaltung · geplante Löschung | Grund erforderlich; Betrieb bleibt deaktiviert. |
| Fristablauf | Verwaltung · Frist / Frist abgelaufen | Vor Ablauf kein endgültiger Löschschritt. Bestehende automatische Aktualisierung beim Fristablauf bleibt. |
| Endgültig löschen | Verwaltung · Frist abgelaufen | Grund und genaue Kennung; bestehende serverseitige Voraussetzungen. Vollständige Konsequenzen, Sicherungsablauf und dauerhafte Kennungssperre. Teilresultat mit nicht entfernten, gesperrten Konten bleibt beim Ergebnis sichtbar. |
| Verwaltungsprotokoll | Unten im Seitenfenster | Letzte zehn Einträge, Aktion, Datum, Grund, als Lot-Verlauf. Keine erfundene Historie „Betrieb angelegt“ aus einer anderen Quelle. |
| Gelöschte Betriebe | Löschprotokoll | Name, Kennung, Datum und Testhinweis, keine Inhalte; Kennung nicht wiederverwenden. |
| Gemeldete Probleme | Fehlerprotokoll, eigener Abschnitt zuerst | Nur bewusst an Support gesendete Meldungen, mit vorhandenen Angaben zu Datum, Betrieb, Person, Pfad, Beschreibung und vorheriger technischer Nachricht. Kein neues Betreff-Feld nötig. |
| Technische Fehler | Fehlerprotokoll, eigener Abschnitt | Letzte 14 Tage, Gruppierung nach Art und Meldung, Anzahl, zuletzt, gegebenenfalls Betroffene, Pfade und Fassungen. Gerät, Stapel, erstes Auftreten und gegebenenfalls vorhandene bereinigte Betrieb-/Personangaben aufklappbar. Kein neuer Erledigt-Status und kein neuer Datenzugriff. |
| Fehler neu laden | Seitenkopf des Fehlerprotokolls | Bestehende Abfrage; Lade-, Leer- und Fehlerzustände mit erneutem Versuch bleiben. |
| Zentraler Basiszinssatz | Basiszinssatz | Bestehende Liste, Entfernen, Halbjahresauswahl, Eingabe auch negativer Werte, Eintragen / Ersetzen, Warnung bei fehlendem laufenden Halbjahr. Zentrale Vorrangregel und Rückfall auf Betriebseintrag unverändert. Beispielwerte sind ausdrücklich fiktiv. |
| Eigenes Passwort | Mein Konto | Aktuelles Passwort, neues Passwort ab acht Zeichen, Wiederholung, bestehende Fehlermeldungen und Erfolg. |
| Eigener zweiter Faktor | Mein Konto | Pflicht, Restzahl von zehn Wiederherstellungscodes, zuletzt verwendet, neue Codes mit einmaliger Ausgabe. Kein Ausschalten für das Plattformkonto. Die bestehende erstmalige Einrichtung / Anmeldeprüfung bleibt Voraussetzung außerhalb dieser Verwaltungsansichten. |
| Abmelden | Mein Konto → Sitzung | Bisheriger `signOut`, keine versteckte Betriebsaktion. |
| Hilfe und Rückmeldungen | Eine Hilfe je Seite; Ergebnis am Vorgang | Bestehende fachliche Erklärungen, Eingabe- und Serverfehler, Lade- und Leerzustände sowie Teilresultate erhalten. Nicht jeder technische Fehlerzustand hat einen eigenen Bildscreen. |

## Konkrete Gestaltungsentscheidungen

- Dieselben Poppins-Stärken, Petroltöne, Trennlinien, Seitentitel und Formulare wie in der übrigen Lot-Linie. Zahlen bei Bedarf in 500; normale Texte und Titel 400/600.
- Vier lokale Bereiche: **Betriebe, Supportzugänge, Fehlerprotokoll, Basiszinssatz**. Eigenes Konto im Markenband. Der frühere lange Seitenstapel wird nach Aufgaben geordnet; die Plattform bekommt keine Betriebsnavigation.
- Übersicht startet bei Betrieben. Anlegen liegt eine Aktion entfernt. Es gibt keine große Kennzahlenleiste.
- Name / Kennung und Leitungskonten stehen zusammen. Zustände erscheinen nur, wo sie eine tatsächliche Folge haben. Suche und Statusfilter sind reine Filter der schon geladenen Betriebsübersicht, ohne neue Backend-Abfrage.
- Befristete Zugänge stehen im Kontext und vollständig im Supportbereich. Unter „Öffnen“ gilt weiterhin exakt die bestehende Freigabe.
- Verwaltung bleibt im Seitenfenster. Lebenszyklus als schmale, beschriftete Linie; kein großer Fortschrittskasten. Das Protokoll folgt unter den Aktionen.
- Mobil ist die lokale Bereichswahl offen zweizeilig erreichbar. Das bestehende mobile Menü der Betriebs-App wird durch diesen Entwurf nicht verändert.
- Kontext wandert mobil nach unten; kritische Angaben zu Betrieb und Handlung bleiben im Vorgang. Für die Durchsicht gibt es zusätzlich vollständige Bilder der mobilen Verwaltungsblätter.

## Quellabgleich

- `src/features/plattform/PlattformView.tsx`
- `src/features/plattform/BetriebVerwalten.tsx`
- `src/features/plattform/FehlerListe.tsx` und `fehlergruppen.ts`
- `src/features/plattform/BasiszinsZentral.tsx`
- `src/features/plattform/NotzugangPasswort.tsx`
- `src/features/plattform/NotzugangZweiFaktor.tsx`
- `src/features/auth/PasswortAendern.tsx`
- `src/features/settings/ZweiFaktorKarte.tsx`
- `src/lib/db/plattform.ts`, `src/lib/db/pg/plattform.ts`, `src/lib/db/pg/support.ts`
- `src/app/App.tsx`, `docs/ui-umbau/seiten-leitfaden.md`, `CLAUDE.md`

Der Abgleich ist eine Entwurfsgrundlage. Backend, Datenbankrechte, reale Wiederherstellung, Exporte, Löschung und Auslieferung wurden dafür nicht verändert oder neu abgenommen.
