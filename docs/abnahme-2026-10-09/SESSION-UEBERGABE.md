# Übergabe für eine neue Session

Projekt: `juliandeutsch22/Prototype-App-Installateure`.
Arbeitsverzeichnis bisher: `/workspace/Prototype-App-Installateure`.
Arbeitsbranch: `chore/abnahme-und-belastung-2026-10-08`.
Stand dieser Übergabe: 09.10.2026, Arbeit noch nicht abgeschlossen.

## Auftrag und wichtige Entscheidungen

Der Nutzer hat eine gründliche Analyse des gesamten Projekts, Umsetzung aller
empfohlenen Korrekturen und danach Merge und Deployment beauftragt. Bestehendes
Verhalten darf nicht verschlechtert werden; nur belegte Fehler korrigieren.
Zusätzlich hat er eine erneute vollständige Codeprüfung am finalen Stand verlangt.

**MFA verpflichtend ausschließlich für den globalen Administrator.**
Betriebsrollen bleiben freiwillig. Eine gültige gespeicherte aal2-Sitzung wird
wiederverwendet, ohne erneute Einrichtung/Prüfung beim Wiederöffnen. Nach
ausdrücklichem Abmelden oder Ablauf wird der vorhandene Faktor geprüft.
Diese Interpretation wurde kommuniziert; kein unsicherer MFA-Bypass eingebaut.

Merge und Deployment sind ausdrücklich autorisiert; keine erneute Freigabe
verlangen. Keine Nachrichten an externe Personen versenden. Keine produktiven
Daten löschen oder umschreiben. Keine Subagents ohne ausdrücklichen Auftrag.
`CLAUDE.md` lesen und die Gegenproben, Rechte, Dokumentation und vollständige
Prüfungen beachten.

## GitHub und zwischenzeitliche Änderungen

Lesen funktioniert. Letzte tatsächliche Schreibprobe am 09.10.2026:
`create_branch` weiterhin HTTP 403 `Resource not accessible by integration`.
Auch vorhandene CLI-Zugangsdaten lieferten zuvor keinen Schreibzugriff.
Das ist ein technischer Blocker, keine ausstehende Nutzerentscheidung.
In einer neuen Session Zugriff erneut prüfen; Tokens nie im Chat ausgeben.

Neuester eingelesener Main-Commit:
`078429f33f63e29ea1df2a84fb55458fc1956cab` — PR #257, Runde 4 mit neuer
Mitarbeiterübersicht und Einsatzplanung/Monat. Er wurde tatsächlich per
`git fetch` geholt. Alle eigenen unveröffentlichten Themen wurden mit
`git rebase --update-refs origin/main` darauf übernommen. Dokumentationskonflikte
sind inhaltlich zusammengeführt; keine Remote-Historie umgeschrieben.
Die Änderungen aus #257 unbedingt erhalten und mitprüfen.

## Implementiert und gezielt geprüft

Die Themen liegen als getrennte lokale Commits/Branches vor:

1. Ursprüngliche acht Befunde: atomare Angebotsannahme, vollständiger Zahlungszeitraum,
   Kundenrechnungen bei vielen Baustellen, ältere Stornozahlungen in Monatskennzahl,
   Suchzustände/Fehler und globales Suchkürzel bei offenem Dialog.
2. Vollständiger freiwilliger MFA-/Wiederherstellungs-/Notzugangsweg für Buchhaltung;
   anschließend korrigierte Pflicht nur für globalen Admin, Betriebsschalter entfernt.
3. Vollständiges Belegarchiv für Angebote/Scheine und atomar gespeicherte Originalmahnungen,
   unveränderliche Mandantenrechte, Auskunft/Aufbewahrung/Sicherung. Fehlende historische
   Originale ausdrücklich benannt. Keine Rekonstruktion als angebliches Original.
4. Sichere Blattabhängigkeiten aktualisiert; Firebase 10/Tailwind 3 beibehalten.
   Produktionsabhängigkeiten: npm audit ohne Befund. Vollständiges Audit: ein noch
   unbehobenes braces-Advisory in elf Entwicklungspaketen; keine falsche Nullmeldung.
5. Serversuche und stabile 50er-Seiten für Angebote/Anforderungen; vollständige
   Einkaufssummen, Aktualisierung und verworfene alte Antworten.
6. Monatsübersicht für Genehmigende mit tatsächlich zulässigen Abwesenheitsgründen.
7. Eilig an/aus bei laufenden Anforderungen, ohne Status-/Bestandsänderung.
8. Unveränderliches Zeitjournal mit tatsächlichem Bearbeiter, Vorher/Nachher,
   Rechte für eigene Zeiten/Büro, Auskunft und Sicherungsrücklauf.
9. Firebase nosniff/Referrer-Policy und ausschließlich CSP-Report-Only;
   bestehende Cache-Regeln beibehalten, echte Emulatorantworten geprüft.
10. Belegte Probleme großer Bestände: SQL-Zeitüberschreitungen bei Lager, Zeiten,
    Scheinen und Anforderungen; sitzungsabhängige Rechte einmal statt je Zeile.
    Lager filtert geführte Artikel vor der 1.000er-Grenze, lädt weiter, berechnet
    Reservierungen gezielt und vollständig. Startseite liest alle knappen Lagerartikel.
11. Eigene Pagination-Regression gefunden und korrigiert: alte Eilfälle vor der
    Seitengrenze; Priorität im Cursor. Gleiche Suche, keine Lücke beim Übergang.
12. Zweite Pagination-Regression korrigiert: vollständige Baustellennummern
    unabhängig von Bildschirmseite/Suchtreffern; gleiche Mandanten-/Mitarbeiterrechte.

Einzelheiten und tatsächliche gezielte Testergebnisse stehen in
`docs/stand-2026-10-03.md`, Abschnitt 14. Ursprüngliche vollständige Prüfung
vom 08.10.: 4.422 Einheitstests, 1.760 Datenbankfälle, 45 Browserwege und sieben
Linkprüfungen, insgesamt 6.234. **Das ist ein historischer Stand und kein
Nachweis für den jetzigen Gesamtstand mit #257 und allen Erweiterungen.**

Letzte gezielte Ergebnisse vor Integration von #257:
- Große Bestände: 25 Datenbankfälle, 217 Ansichtsfälle, zusätzlich 87 alte
  Rechte-/Supportfälle und echter Lager-Browserablauf grün.
- Eil-Pagination: neun Datenbankfälle, 90 Ansichtsfälle, echter Browser grün;
  Gegenprobe im alten Stand mit korrekt angepasstem Selektor tatsächlich rot.
- Baustellenfilter: zwölf Datenbankfälle, 42 Ansichtsfälle und echter Browser
  (alte Baustelle auswählen/zurück, Suche, volle Einkaufsmengen) grün.
- 184 Migrationen tatsächlich erfolgreich von null auf lokaler Datenbank.
  #257 hat keine zusätzlichen Migrationen eingebracht.
- Zehn Belegreferenzen: neun eigenständige Dateien bytegleich; ZIP unterscheidet
  ausschließlich Hinweise.txt. Alle enthaltenen PDFs/CSV bytegleich mit
  tatsächlich erzeugtem alten ZIP. Nur ZIP-Referenz gezielt angepasst;
  fünf Referenztests danach grün. Details: `belegvergleich.md`.
- Produktionsbuild am auf #257 übernommenen Stand ist erfolgreich.

## Noch zu erledigen — keines davon als bestanden ausgeben

1. Vollständige Nachmessung gegen großen Bestand fertigstellen und auswerten.
   Aktuell läuft sie lokal unter `/tmp/final-performance-integrated.log`.
   Vorherige Nachmessung wurde durch die Session-Unterbrechung vor Abschluss
   beendet und ist **kein vollständiger Nachweis**. Der erste Vorherlauf ist
   vollständig unter `docs/ui-umbau/messung-vorher.{json,md}`: acht von zwölf
   Routen mit realen API-Fehlern. Lokales Profil: 390×844, langsames 4G, CPU×4,
   drei Läufe/Median. Referenzbackend war bereits der damalige aktuelle lokale
   Schema-/Abhängigkeitsstand; keine exakte historische Produktionsmessung.
   Gleiche Budgets ehrlich ausweisen; keine korrekten Gesamtsummen für bessere
   Messwerte abschneiden. CPU-intensive Prüfungen nicht parallel zur Messung.
2. Ganze Typ-/Lint-/Einheitssuite, ganze Datenbanksuite mit Edge Functions,
   alle Browserwege in Chromium plus Tablet und WebKit-Telefon, sieben Linkrollen.
   Datenbanktests leeren die lokale Datenbank global: niemals gleichzeitig mit
   Browserwegen oder Messung betreiben. Den großen Testbestand bei Bedarf danach
   erneut erzeugen; nur localhost. Keine Produktionsschlüssel für diese Prüfungen.
3. Neue #257-Ansichten und alle bisherigen Ansichten prüfen: 37 Seiten × vier
   Breiten mit `tools/vorschau/messen.mjs`; axe hell/dunkel und Tablet quer.
   Vorheriger eigener Stand hatte 148 Layoutfälle und 84 axe-Fälle ohne Befund,
   aber diese Nachweise müssen für den finalen Stand erneuert werden.
4. UI-Bestandsvergleich: ursprünglicher Vorherbestand hat 29.154 Elemente und
   39 Rollen/Breiten-Aufnahmen, aber **66 nicht vollständig erfasste Seiten**
   durch Browserabsturz/Zeitgrenze. Deshalb keinen vollständigen Vergleich
   behaupten. `playwright.bestand.config.ts` mit `BESTAND_ARBEITER=1` verwenden;
   `BESTAND_NUR=...` kann einzelne Aufnahmen nachholen. Nachher aufnehmen,
   tatsächliche Kennungen korrekt zuordnen; `zuordnung.json` ist leer und die
   Paketzuordnungen sind handerhobene Kennungen. Keine Zuordnung erfinden oder
   das Prüfsystem abschwächen. MFA-Schalterentfall ist ausdrückliche Nutzerentscheidung.
5. Abschließende erneute Codeprüfung: alle zusammengeführten Änderungen und
   relevante unveränderte Aufrufer/Regeln prüfen. Schon gefundene eigene
   Regressionen sind korrigiert; dennoch alle Zusammenhänge erneut prüfen.
6. Widersprüchliche alte Dokumentationsstellen nachführen, neue R4-Abschnitte
   erhalten. Insbesondere einige R4-Stellen nennen den Genehmigungsmonat noch
   ungebaut; die tatsächlich implementierte Übersicht korrekt beschreiben.
   Handbuchstempel nur mit tatsächlichen finalen Testergebnissen aktualisieren.
7. Bericht/PR-Beschreibungen/prüfbare Topic-Patches und finale Übergabeartefakte
   zusammenstellen. Danach Remote-Main erneut vergleichen, bei Schreibzugriff
   grüne CI abwarten und nur finalen korrigierten Stand mergen/deployen/live prüfen.
   Bestehende Kette: Schema → Edge Functions → App. Beim Merge mehrerer Themen
   automatische Main-Auslieferung bis zum finalen MFA-Stand anhalten; kein
   überholter Zwischenstand mit Pflicht für Betriebskonten darf live gehen.

## Externe Grenzen

Betreiberdaten, Domain/SMTP/Provider- und externes Sicherungsziel fehlen hier.
Kanzlei-/WKO-/Anwaltsfreigabe, echte iOS-Hardware, produktiver VIES-Abruf,
externer Sicherungsrücklauf und zwei Pilotwochen können nicht durch lokale
Tests ersetzt werden. Reale Ergebnisse fehlen, nicht als bestanden markieren.
Konkrete fachliche/rechtliche Unterlagen liegen in diesem Ordner; öffentliche
Rechtstexte bleiben Entwurf (`GEPRUEFT=false`). Bestehende unzutreffende Aussage
„aufbewahrte Daten bleiben gesperrt“ wurde korrigiert: bisherige Rechte gelten,
keine zusätzliche Sperre/automatische Löschung. Keine neue rechtliche Freigabe erfunden.

## Lokale Umgebung / Wiederaufnahme

Node/npm-Abhängigkeiten: `npm ci`. Lokaler Supabase-Stack: API 54321, DB 54322,
Postgres 17, Docker 2 CPU/8 GB. Öffentliche lokale Entwicklungsschlüssel stehen
bereits im Repository; keine Produktionszugänge mitgegeben.

In derselben Umgebung sind der Stack und der große Testbetrieb `ui-testbestand`
vorhanden. CLI bisher:
`/home/agent/.npm/_npx/b96a6bd565c470ce/node_modules/@supabase/cli-linux-x64/bin/supabase`.
Browser liegen in `/home/agent/.cache/ms-playwright`, **nicht** `/opt/pw-browsers`.
Keine nicht vorhandene `CHROMIUM_PFAD`-Variable setzen. Einheitssuite mit
`TZ=Europe/Vienna`; DB/Browser/Messung mit `NO_PROXY=127.0.0.1,localhost` und
gegebenenfalls vorhandene produktive SUPABASE_* Variablen ausdrücklich entfernen.
Vor DB-Suite gemeinsame Dateien übernehmen und Edge Functions lokal starten.

Werkzeug-Session-IDs und laufende Prozesse werden nicht verlässlich in eine
neue Session übertragen. Vor neuem Mess-/Browserlauf prüfen, ob eigene Server
auf 4320/5173 noch laufen; nur nach Prüfung von Prozess und Arbeitsverzeichnis
beenden. Unvollständige oder unterbrochene Läufe nicht zählen.

Das Paket enthält den vollständigen Quellstand, ein zusätzliches Git-Bundle
mit den unveröffentlichten Topic-Commits und dieses Protokoll. Das Bundle setzt
den oben genannten Main-Commit voraus. Wiederaufnahme mit Git:

```bash
git clone https://github.com/juliandeutsch22/Prototype-App-Installateure.git
cd Prototype-App-Installateure
git fetch /pfad/zum/arbeitsstand.bundle 'refs/heads/*:refs/heads/*'
git switch chore/abnahme-und-belastung-2026-10-08
npm ci
```

Ohne GitHub-Lesezugriff kann der beigefügte Quellstand direkt entpackt werden;
zum Erhalt der Topic-Historie später das Bundle gegen den passenden Main einlesen.
Keine Produktionsgeheimnisse, node_modules oder laufende Datenbank sind enthalten.
