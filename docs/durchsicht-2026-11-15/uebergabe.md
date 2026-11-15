# Übergabe: Umsetzung der Durchsicht vom 15.11.2026

Für die Sitzung, die den Plan umsetzt. Wer das liest, kennt die
Vorgeschichte nicht — hier steht alles, was nicht im Code und nicht in
`CLAUDE.md` steht. Reihenfolge beim Lesen:

1. `CLAUDE.md` (Grundsätze, Ablauf je Thema, Sicherheit) — gilt unverändert.
2. `plan.md` in diesem Ordner — **was** zu tun ist (127 Punkte mit Kennung).
3. Diese Datei — **wie**, in welcher Reihenfolge, mit welchen Freigaben und
   Fallstricken.
4. `analyse/N-….md` — der Beleg je Punkt mit Datei und Zeile. Zeilennummern
   gelten für `main` 062407b; danach über den Text suchen, nicht über die Zahl.

## 1. Was freigegeben ist (Auftraggeber, 15.11.2026)

- **Der ganze Plan ist zur Umsetzung freigegeben**, in der Reihenfolge aus
  `plan.md`, Abschnitt 7. Die Pakete werden hintereinander abgearbeitet, ohne
  nach jedem Paket auf ein Okay zu warten.
- **Je Paket (Thema) ein Branch und ein PR nach `main`.** Mergen, sobald die
  CI grün ist (Squash, wie #455 und #456); danach prüfen, ob die Auslieferung
  durchgelaufen ist. Ein Paket darf in mehrere PRs geteilt werden, wenn es zu
  groß wird — nie umgekehrt mehrere Themen in einen.
- **Entscheidungen E1–E6** stehen in `plan.md`, Abschnitt 8 (alle wie
  empfohlen; E3: Schalter für alles, was sofort wirkt).
- **Nicht freigegeben, vorher fragen:** alles, was über den Plan hinausgeht;
  eine neue Farbe für „Gefahr“ (E4: erst Vorschlag auf `/_muster` zeigen,
  dann einbauen); Funktionen F9–F16 (Reihung durch den Auftraggeber).

Weiter gilt aus dieser Sitzung:

- **Keine Benachrichtigungen:** keine Kommentare an PRs oder Issues.
- **Produktionsdatenbank:** nichts löschen, nichts umschreiben. Migrationen
  ergänzen; Altdaten bekommen Anfangswerte (z. B. „gültig ab Saldostart“),
  sie werden nicht nachgerechnet oder ersetzt.
- **Geheimnisse** nie ins Repository, nie in GitHub-Secrets.
- Die Bilder `/a-*.png` im Wurzelverzeichnis **nicht löschen**.
- Im Commit oder PR steht kein Modellname außer der Zeile, die die Sitzung
  vorgibt.

## 2. Werkzeug und Fallstricke (in dieser Sitzung gelernt)

**Umgebung.** Der Container ist frisch: `npm ci` zuerst. Node 22 ist da.
Docker und der Supabase-Stack laufen nicht von selbst.

- Stack: `bash scripts/stack.sh` (startet auch den Docker-Dienst; klemmt er:
  `rm -f /var/run/docker.pid`, dann `scripts/stack.sh neu`).
- `supabase` liegt nicht im Pfad: `npx -y supabase@3.1.0 …`
  (`db reset --local`, `functions serve`).
- Scheitert der Browser-Aufbau mit „duplicate key … projects_nummer_je_betrieb“,
  liegen alte Daten in der lokalen Datenbank: `npx -y supabase@3.1.0 db reset --local`.
- Wege, die Edge Functions brauchen, laufen nur mit
  `npx -y supabase@3.1.0 functions serve` im Hintergrund — nach Änderungen an
  `shared/` vorher `node scripts/edge-shared-uebernehmen.mjs`.
- Vorschau ohne Datenbank: `npm run vorschau`, dann
  `http://localhost:5199/tools/vorschau/?pfad=/settings/firma&rolle=Administrator`.
  Die Daten sind Attrappen (`tools/vorschau/stubs-erzeugen.mjs`); fehlt eine
  Attrappe, sieht das wie ein Fehler der App aus und ist keiner.

**Git.**

- Erzwungenes Pushen (`--force`, auch `--force-with-lease`) wird abgewiesen.
  Hängt der Branch hinter `main`, weil der letzte PR per Squash gemergt
  wurde: `git checkout -B <branch> origin/main`, dann
  `git merge -s ours origin/<branch>`, dann normal pushen.
- Dieser Ordner (`docs/durchsicht-2026-11-15/`) liegt bisher nur auf dem
  Branch `claude/stoic-meitner-hkci6t`. Er kommt mit dem ersten PR (S1) nach
  `main`.

**Prüfungen.**

- Die volle Liste steht in `CLAUDE.md`, „Ablauf je Thema“, Punkt 3. Die
  Browserwege dauern lange; im Hintergrund laufen lassen.
- `page.mouse.wheel` gibt es im mobilen WebKit nicht — in Wegen
  `page.evaluate(() => window.scrollTo(…))` verwenden.
- Der Handy-Rand rechts liegt absichtlich nicht auf dem Raster
  (`rechtLot`-Wege überspringen „rechts“ am Handy).
- **Handbuch:** Stempel oben *und* Fußzeile unten tragen Datum und Zahl der
  Prüfungen (`tests/unit/handbuchStempel.test.ts` vergleicht beide). Beim
  Nachziehen immer beide Stellen.
- **Tailwind 3:** eine Hilfsklasse wie `pl-3` verliert gegen eine
  spezifischere Regel aus `src/styles/` (z. B. `.tabelle-eng td`). Abstände,
  die wirken müssen, als benannte Klasse im passenden `lot-*.css` setzen und
  im Browser messen.
- **Ein Bildvergleich beweist keine Schichtung.** Genau daran ist die
  Korrektur aus #456 gescheitert (siehe S1): der falsche Zustand war stabil
  und damit „gleich“. Wo es um „was liegt oben“ geht, mit
  `document.elementFromPoint` oder der berechneten Ebene prüfen.

**Auslieferung.** Ein Merge nach `main` startet „Supabase-Migrationen“; erst
wenn Schema und Functions eingespielt sind, ruft dieser Ablauf „Test und
Deploy“ auf (Firebase Hosting). „Live“ heißt: beide Läufe zum Merge-Commit
sind grün. Scheitert eine Migration, geht die App nicht hinaus — dann zuerst
den Lauf lesen, nichts von Hand nachschieben.

**Alte App gegen neues Schema** bleibt unvermeidlich (Telefone laden erst beim
nächsten Öffnen neu): Spalten nie in einem Schritt umbenennen oder entfernen,
Datenbankfunktionen nur verträglich erweitern (`docs/DEPLOYMENT.md`).

## 3. Wie mit den Befunden umzugehen ist

- **✔** im Plan: von der Vorgängersitzung im Code oder Browser nachgeprüft.
  Trotzdem zuerst die Prüfung schreiben, die den Fehler zeigt (rot), dann
  beheben (grün) — Gegenprobe nach `CLAUDE.md`.
- **○**: belegt aus der Analyse, nicht einzeln nachgestellt. **Zuerst
  nachstellen.** Bestätigt sich ein Punkt nicht, wird er nicht „vorsorglich“
  umgebaut (Grundsatz 2), sondern im PR und im Plan als „nicht bestätigt“
  vermerkt, mit dem, was geprüft wurde.
- **Verdacht** (G9): nur nachstellen; beheben nur, wenn bestätigt.
- Vor jedem Umbau die Kommentare an der Stelle lesen. Dieses Projekt
  begründet seine Entscheidungen im Code; mehrere „Schwächen“ sind benannte
  Grenzen mit Grund (`docs/grenzen-durchsicht-2026-10-24.md`). Eine Grenze
  wird nur aufgehoben, wenn ihr Grund entfällt — dann auch dort austragen.
- Nach jedem Paket: Handbuch, `docs/stand-2026-10-03.md` (neuer Abschnitt ab
  §95, fortlaufend), bei Oberflächen-Regeln `docs/ui-umbau/entscheidungen.md`
  (nächste freie Nummer nach E94; die Kennungen E1–E6 aus dem Plan sind
  *keine* Nummern dieser Liste) und der Stand in `plan.md` (Spalte oder
  Vermerk „erledigt mit #…“).

## 4. Paket 1 — S1: Speicherleiste (zuerst) — erledigt

Danach S2 (Taktgeber, `plan.md`) als eigener PR, vor Paket 2.

**Was man sieht.** `/settings/firma` am Handy (390 px) und Tablet (834 px):
Beim Rollen laufen Rahmenstücke der Blätter „Rechnungsangaben“ und „Farben“
quer durch die klebende Leiste mit „Speichern“. Ebenso die Sprungleiste der
Angebotsakte am Tablet. Am Schreibtisch (1440 px) nicht.

**Ursache (nachgestellt in Chromium).** `src/styles/lot-blatt.css`, Regel mit
`::before { … z-index: 11 … border: 1px solid var(--border) }`: die Kontur
jedes Blatts ist eine Ebene 11 im Stapel der *Seite*. Die frei stehende
`.aktionsleiste` klebt mit `z-index: 10` (`src/index.css`, „.aktionsleiste {
position: sticky …“). Rollt ein Blatt unter der Leiste durch, liegt seine
Kontur darüber. Die Ebene 11 ist Absicht — sie soll über der Leiste *im
eigenen Blatt* liegen (Kommentar dort, E76). Der Fehler ist, dass sie auch
über Fremdes reicht.

**Was #456 fälschlich tat.** In `lot-blatt.css` bekam die freie Leiste
`outline: 0; box-shadow: inset 0 0 0 1px var(--border)` mit der Begründung,
Safari zeichne den Umriss nicht nach. Das war nicht die Ursache. Prüfen, ob
diese Änderung für sich sinnvoll bleibt oder zurückgenommen wird; die
Begründung im Kommentar, im Handbuch und in `stand` §92 berichtigen.

**Erledigt am 15.11.2026 (Stand §95)** — anders als hier empfohlen: der
eigene Stapel je Blatt war schon einmal probiert und verworfen
(Kopfkommentar in `lot-blatt.css`, `runde4.spec.ts`). Gelöst über eine
Ordnung der Ebenen (Kontur 4, im Blatt höchstens 3). Der ursprüngliche
Vorschlag bleibt zur Nachvollziehbarkeit stehen:

**Lösung, empfohlen.** Jedes Blatt bildet seinen eigenen Stapel
(`isolation: isolate` an denselben Selektoren, die das `::before` tragen).
Dann liegt die Kontur weiter über dem eigenen Inhalt samt eigener Leiste,
aber nicht mehr über der freien Leiste außerhalb.

**Was dabei kaputtgehen könnte — vorher prüfen:**

- Menüs, Auswahllisten und Sprechblasen, die *in* einem Blatt aufgehen und
  über das nächste Blatt ragen (`RowMenu`, ⋯-Menü, Datums-/Suchlisten,
  `InfoHint`). Liegen sie nicht in einem Portal, säßen sie nach der Änderung
  unter dem Nachbarblatt. Jede Art einmal im Browser öffnen, am unteren Rand
  eines Blatts.
- Klebende Elemente in Blättern, die über das Blatt hinaus kleben sollen
  (Korb in `/material`, Leisten in `lot-plattform.css`, `lot-timer.css`,
  `lot-planung.css`, je `z-index: 10`; Sprungleiste `z-index: 5`).
- Gibt es so ein Menü ohne Portal, ist die Alternative: Kontur-Ebene auf
  einen Wert unter der freien Leiste senken und nur die Leiste *im* Blatt
  gezielt unter die Kontur legen.

**Prüfung (Gegenprobe).** Ein Browserweg für 390 und 834 px: Seite so
rollen, dass eine Blattkante hinter der Leiste liegt, dann an mehreren
Punkten *in* der Leiste per `elementFromPoint` und per Suche nach fremden
`::before`-Rechtecken sicherstellen, dass nichts Fremdes darüber liegt.
Dasselbe für die Sprungleiste der Angebotsakte. Ohne die Änderung rot. Dazu
ein Test „bleibt gleich“: Kontur liegt weiter über der Leiste im eigenen
Blatt (E76).

## 5. Paket 2 — stille Fehler und gebrochene Zusagen

Acht kleine, voneinander unabhängige Punkte. Als ein PR gedacht; wird es
unübersichtlich, nach Fachgebiet teilen. Alle ✔ — Stellen geprüft am
15.11.2026:

| Punkt | Stelle | Was dort falsch ist | Hinweis zur Lösung |
|---|---|---|---|
| A2 | `supabase/migrations/20260930330000_uid_und_kundenart.sql` (`kunde_umbenennen`), `src/lib/db/pg/customers.ts` (leitet jede Änderung mit Namen über die Funktion) | Die Funktion kennt `lieferantennummer` nicht; der Wert wird verschluckt, die Maske meldet Erfolg | Neue Migration, die die Funktion ersetzt (Vorgaben aus `CLAUDE.md` für Datenbankfunktionen). Prüfung gegen die Datenbank: jedes Feld der Kundenmaske ändern und zurücklesen — fängt auch das nächste vergessene Feld |
| A7 | `src/features/auftragseingang/EingangFormular.tsx`, Zeile mit `ort: alt.ort.trim() ? alt.ort : k?.address` | Beim Kundenwechsel bleibt der Ort des vorigen Kunden stehen | Merken, ob der Ort von Hand geändert wurde; sonst folgt er dem Kunden |
| G1 | `src/features/invoices/InvoicesView.tsx`: `useState({ ...INVOICE_DEFAULTS })` für `rates`; gesetzt nur aus `company.rates`; das Zurücksetzen nach dem Anlegen lässt `rates` aus | Angepasste Konditionen gelten still für alle weiteren Rechnungen | Nach dem Ausstellen und beim Wechsel der Baustelle auf die Sätze des Betriebs zurück. Zahlungsziel, Skonto, Rücklass, Zahlbetrag als Zeile in der Vorschau; Abweichung vom Betrieb dort markiert |
| G7 | `src/features/invoices/totals.ts`, `cent(n)`; eigene Rundungen in `mahnlauf.ts`, `zahlstand.ts`, `skonto.ts`, `nachkalkulation.ts` | 4,25 × 72,30 ergibt 307,27 statt 307,28; Skonto App 2,13 gegen Datenbank 2,14 | Eine Rundungsfunktion für Geld, überall dieselbe, mit der Datenbank abgeglichen (Grenzfälle als Prüfung gegen die Datenbank). **Ausgestellte Belege werden nicht neu gerechnet** — der Nachdruck nimmt die gespeicherten Beträge. Vorher messen, welche bestehenden Prüfungen sich dadurch ändern, und jede Abweichung begründen |
| K1 | `supabase/migrations/20261108800000_nachrichten.sql` (`app.darf_meldungen_sehen()`), `src/features/nachrichten/NachrichtAktionen.tsx` (Dialogtext) | Eine gemeldete Leitung sieht die Meldung über sich samt Melder und kann sie erledigen und löschen | Zeilenschutz: Meldung ist für die gemeldete Person unsichtbar (lesen, ändern, löschen); Regeln nach `CLAUDE.md` (`(select …)`, `leseregelnGleichwertig.test.ts`). Gibt es keine zweite Leitung, sagt der Dialog das vor dem Absenden. Prüfung gegen die Datenbank mit zwei Leitungen und mit einer |
| K5 | `src/features/auth/LoginPage.tsx` | Ein Fehlertext für jede Ablehnung | Unterscheiden: kein Netz, zu viele Versuche, Konto oder Betrieb deaktiviert. Nichts verraten, was erst nach richtigem Passwort bekannt sein darf (kein „Konto gibt es nicht“) |
| M1 | `supabase/migrations/20260930380000_lagerbewegungen.sql` (`on delete cascade`), `20260911150000_betrieb.sql` (Anforderungen ohne Löschregel), `src/features/orders/MaterialCatalog.tsx` (Dialog) | Löschen nimmt Bestand und Protokoll still mit — oder scheitert mit nichtssagender Meldung | In diesem Paket: Dialog sagt, was am Artikel hängt; Löschen mit Bestand, Bewegungen oder Anforderungen wird abgewiesen, stattdessen „auslaufen lassen“ (nicht mehr anforderbar, bleibt lesbar). Prüfen, ob es so einen Zustand am Artikel schon gibt, bevor ein neuer entsteht |
| P1 | `src/features/assignments/EinsatzFormular.tsx` (Effekte, die bei jeder Live-Änderung Auswahl, Kommentar, Uhrzeit und Rüstliste zurücksetzen), `src/lib/db/pg/einsatzMaterial.ts` (Kanal je Betrieb) | Fremde Änderung im Betrieb leert das offene Formular | Live-Daten nur beim Öffnen und beim Wechsel der Baustelle übernehmen; bei fremder Änderung ein Hinweis mit „übernehmen“. Danach dieselbe Stelle in anderen Formularen über Live-Listen suchen und im PR nennen, was gefunden wurde |

## 6. Pakete 3 bis 11

Reihenfolge und Zuschnitt: `plan.md`, Abschnitt 7. Je Paket zuerst den
zugehörigen Bericht in `analyse/` ganz lesen — er enthält den Ablauf, wie er
heute ist, und was die Analyse *nicht* angesehen hat.

| Paket | Bericht | Worauf besonders zu achten ist |
|---|---|---|
| 3 Planung | `3-planung-scheine.md` | P2 gehört in die Datenbankfunktion aus `20261113200000_einsatz_umplanen.sql` (Rüstliste, Fehlmengen und Helfer-Kennzeichen in einem Zug). P3 und P8: Zähler und Liste aus *einer* Datenbankfunktion |
| 4 Zeit, Personal | `1-zeit-personal.md`, `7-ladezeiten.md` (B1, B2) | Z3/F2 ist der größte Umbau des Plans und trägt L1/L2: Arbeitszeit und Urlaubsanspruch als Verlauf mit „gültig ab“, Monatsbilanzen speichern das Soll. Erst Entwurf des Datenmodells samt Übergang der Altdaten in den PR-Text, dann bauen. Bestehende Salden dürfen sich für Betriebe ohne Änderung der Arbeitszeit **nicht** ändern — das ist der „bleibt gleich“-Test. Den Rechenkern (AZG, KJBG, Überstunden) hat die Analyse nur überflogen: nichts anfassen, was nicht nötig ist |
| 5 Auftragskette | `2-auftragskette.md` | A1 (Annahme zurücknehmen) löscht nur Baustellen ohne Buchungen; sonst abschließen. F1 (geführtes Abschließen) sammelt, was A11 nennt |
| 6 Geld | `4-geld.md` | Belege sind nach dem Ausstellen eingefroren; nichts rückwirkend ändern. G2 braucht eine Kennung je Erstellungsversuch in der Datenbank — die frühere Grenze steht in `docs/ui-umbau/premium-2026-10-28.md` und wird damit ausgetragen. G9 erst nachstellen |
| 7 Material | `5-material.md` | M2: „verrechnet“ als Verknüpfung je Ausgabe statt Datumsvergleich (`20261027400000_r6_ruestliste_fehlmenge.sql`, `a.datum > grenze`). Altdaten: was vor der Umstellung verrechnet wurde, gilt weiter als verrechnet |
| 8 Konto, Daten | `6-grundlagen-sicherheit.md` | K2 (Push-Anmeldungen löschen) und K3 (Nachtlauf je Betrieb) berühren Edge Functions: `shared/` übernehmen, lokal mit `functions serve` prüfen |
| 9 Ladezeiten | `7-ladezeiten.md` | Vor und nach jeder Änderung messen (`npm run vorschau:messen`, die SQL-Messungen im Bericht). L7 (Bausteine der Auslieferung) einzeln und zuletzt — Fassungswechsel auf Telefonen prüfen. L11 (Wächter in der CI, großer Testbestand) früh anlegen, damit die übrigen Punkte daran gemessen werden |
| 10 Oberfläche | `plan.md` Abschnitte 3 und 4 | Zuerst U1–U4 als Regel in `docs/design/v10/style.md` und als Muster auf `/_muster`, dann Seite für Seite umstellen. Schalter (E3) als eigener Baustein in `src/components/`. Bewegungen nur über die Stufen in `src/styles/lot-feinschliff.css`, nur `transform` und Deckkraft, „Bewegung reduzieren“ befolgen. `docs/ui-umbau/premium-2026-10-28.md` schließt Feder- und Skalierungsanimation an Knöpfen aus — das gilt weiter. Vorher/Nachher-Aufnahmen bei 390, 834 und 1440 px |
| 11 Funktionen | `plan.md` Abschnitt 6 | F9–F16 erst nach Reihung durch den Auftraggeber |

## 7. Was die Durchsicht nicht geprüft hat

Echtes iPhone und Android, die gehostete Datenbank, Edge Functions im
Betrieb, PDF-Inhalte im Einzelnen, DATANORM-Übernahme, Liegenschaften, Pläne
und Dokumente. Es ist keine Testsuite gelaufen. Wer dort etwas ändert, hat
keinen Befund aus dieser Durchsicht als Rückhalt.
