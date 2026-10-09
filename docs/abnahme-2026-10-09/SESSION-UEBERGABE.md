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

Neueste Nutzerentscheidung am 09.10.2026: **Merge und Deployment ausgesetzt.**
Zuerst den neuesten Repository-Stand, bereits eingebrachte Fixes und alle
Zusammenhänge erneut prüfen. Erst nach Vorlage des Prüfergebnisses und einem
ausdrücklichen neuen Go des Nutzers mergen; vorher auch keine Auslieferung.
Die frühere Freigabe ist damit überholt. Keine Nachrichten an externe Personen
versenden. Keine produktiven
Daten löschen oder umschreiben. Keine Subagents ohne ausdrücklichen Auftrag.
`CLAUDE.md` lesen und die Gegenproben, Rechte, Dokumentation und vollständige
Prüfungen beachten.

## GitHub und zwischenzeitliche Änderungen

Lesen funktioniert. Frühere Schreibproben lieferten HTTP 403
`Resource not accessible by integration`. Inzwischen ist am 09.10.2026 ein
echter CLI-Push des vollständigen Arbeitsbranches erfolgreich gewesen:
`chore/abnahme-und-belastung-2026-10-08`. Der Arbeitsstand ist damit auch
auf GitHub gesichert; Main wurde nicht gemergt, nicht deployt.
Verwendet wurde `git -c credential.helper='!gh auth git-credential' push origin …`.
In einer neuen Session Zugriff erneut prüfen; Tokens nie im Chat ausgeben.
Die zuvor angebotenen Chat-Downloadlinks funktionieren beim Nutzer nicht:
lokale Dateien wurden nicht als Chat-Anhänge registriert. Stattdessen den
gesicherten GitHub-Branch verwenden; kein Artefakt-Download nötig.

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

## Erneute Prüfung am 09.10. — maßgeblicher aktueller Bericht

[erneute-pruefung.md](erneute-pruefung.md) enthält den aktuellen Main-Abgleich,
Gegenproben, korrigierte eigene Regressionen und verlinkte Rohbelege.
Neu hinzugekommen: gezielte Mahnmetadaten, rückgerollter historischer
Migrationstest, präzise Schema-Wächter, Materialleserechte für 40.000 fremde
Artikel und lesbarer Wochenendkontrast. Es wurden keine korrekt arbeitenden
R4-Ansichten neu geschrieben.

Tatsächlich grün: 185 Migrationen von null, Typen/Lint/Produktionsbuild,
4.697 Einheitstests, 1.822 lokale Datenbankfälle, 55 Browserwege und sieben
Rollenlinks. Dazu 200 Layoutfälle (acht Meldungsansichten, null schwerwiegend)
und 128 axe-Fälle ohne Verstöße/JavaScriptfehler. Neun eigenständige Beleg-
referenzen sowie fünf PDF-/CSV-Dateien im bisherigen Archiv bleiben bytegleich.

Ein kontrollierter Sicherungslauf enthält 50.001 Zeiten, 15.001 Scheine und
30.001 Anforderungen vollständig; Firmen- und Dienstweg mit unverändertem
Sicherungscode grün. Vorheriger synthetischer Datenaufbau erzeugte 30.001
Push-Aufrufe und störte die Umgebung. Nur dieser direkte Massenaufbau ist jetzt
transaktional ohne Push, vor jeder eigentlichen Prüfung ist der Auslöser aktiv.
Keine SQL-/API-Zeitgrenzen erhöht. Die Aufräumfrist des 40.001-Artikel-Testbestands
entspricht mit 120 Sekunden seiner Aufbaufrist. Testhelfer melden fehlgeschlagene
Firmen-/Personenanlage sofort. Rote/ungültige Vorläufe sind nicht als bestanden gewertet.

Noch zu klären:

1. Abschließende GitHub-Datenbanksuite des Stands `983a8cb` abwarten; Typen/Lint/
   Einheiten und Browser/Rollenlinks dieses Stands sind bereits grün. URLs im
   Bericht. Alle Auslieferungsjobs auf dem Arbeitsbranch bleiben übersprungen.
2. Leistungsbudget: zwölf lokale Seiten ohne API-/Browserfehler, aber Accounting
   118,1 Sekunden bis Netzruhe und 22,2 MB bei gedrosseltem langsamen 4G.
   Der Seitenkopf erscheint nach 2,7 Sekunden; die lokale API ist unkomprimiert.
   Das ist kein belegter Produktionsfehler. Datenmenge und Komprimierung getrennt
   beurteilen; keine Jahres-/Baustellensummen durch Abschneiden verfälschen.
   Messungen in `docs/ui-umbau/messung-nachher.{json,md}` und Nachweis im Bericht.
3. Vollständiger maschineller UI-Bestandsvergleich fehlt weiterhin: 29.154 alte
   Elemente / 39 Rollen-Breiten-Aufnahmen, davon 66 unvollständige Seiten durch
   Absturz/Timeout. `zuordnung.json` leer. Aktuelle Layout-/axe-/Browsernachweise
   ersetzen keine erfundene Zuordnung. Bei Nachholen `BESTAND_ARBEITER=1`,
   `BESTAND_NUR=...` und echte Kennungen verwenden, Detektoren nicht abschwächen.
4. Remote-Main unmittelbar vor einer späteren Freigabe erneut vergleichen.
   Änderungen weiterhin auf dem Arbeitsbranch halten. **Kein Merge, keine
   Auslieferung ohne neues ausdrückliches Nutzer-Go.** Danach vorhandene Kette
   Schema → Edge Functions → App und echte Live-Prüfung. Kein Zwischenstand
   mit überholter verpflichtender Betriebs-MFA darf ausgeliefert werden.

Die komplette Codeprüfung der zusammengeführten Funktionsänderungen ist im
Bericht dokumentiert. Bei weiteren funktionalen Änderungen passende Gegenproben
und betroffene Integrations-/Gesamtprüfungen erneut ausführen, nicht allein auf
diese Zahlen verlassen.

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

Die lokale Suite leert die Datenbank vor jedem Lauf. Ein großer Messbetrieb
`ui-testbestand` muss bei Bedarf mit dem lokalen Testbestandsskript neu aufgebaut
werden; seine frühere Existenz ist kein aktueller Nachweis. Der Stack ist lokal
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
den oben genannten Main-Commit voraus. Die Topic-Commits sind inzwischen auch
im GitHub-Arbeitsbranch enthalten. Direkte Wiederaufnahme ohne Download:

```bash
git clone --branch chore/abnahme-und-belastung-2026-10-08 https://github.com/juliandeutsch22/Prototype-App-Installateure.git
cd Prototype-App-Installateure
npm ci
```

Alternativ Wiederaufnahme mit dem lokalen Git-Bundle:

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
