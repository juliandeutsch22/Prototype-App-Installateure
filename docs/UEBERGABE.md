# Übergabe

Stand: 19.09.2026.

**Wofür dieses Dokument da ist.** Es soll jemanden, der die App noch nie
gesehen hat, in einer halben Stunde arbeitsfähig machen — und zwar so, dass er
die Entscheidungen versteht, die schon getroffen sind, statt sie versehentlich
rückgängig zu machen. Es ersetzt nicht:

| Datei | Beantwortet |
|---|---|
| [`FUNKTIONEN.md`](./FUNKTIONEN.md) | *Was gibt es, wer darf was, worauf kann ich mich verlassen?* Eine Zeile je Bereich, inklusive der Lücken. |
| [`ROADMAP.md`](./ROADMAP.md) | *Was wurde wann warum gebaut?* Änderungsprotokoll, neueste Einträge oben. |
| [`DEPLOYMENT.md`](./DEPLOYMENT.md) | Ein Supabase-Projekt einrichten, Secrets setzen, ausliefern. |
| [`LEGACY-ANALYSIS.md`](./LEGACY-ANALYSIS.md) | Das Datenmodell und die Geschäftslogik aus der alten Einzeldatei. |
| [`MIGRATION-SUPABASE.md`](./MIGRATION-SUPABASE.md) | Der Umzug von Firestore nach Postgres: Entscheidung, Reihenfolge, was dabei gelernt wurde. |

Wer schnell etwas sucht: **Funktionsfrage → `FUNKTIONEN.md`. Warum-Frage →
`ROADMAP.md` oder der Kommentar direkt über dem Code.** Die Kommentare in
diesem Projekt erklären *warum*, nicht *was* — das ist Absicht und sollte so
bleiben.

---

## 1. Worum es geht

Betriebssoftware für einen österreichischen Installationsbetrieb (Perl
Installationen), als Produkt **Senklot**: Zeiterfassung, Baustellen, Material,
Einsatzplanung, Angebote, Rechnungen, Mahnwesen, Handwerksscheine, Urlaub,
Wartungen.

**Mandantenfähig** — jede Zeile trägt eine `companyId`, und die Trennung wird
in der Datenbank erzwungen, nicht in der Oberfläche.

Zwei Dinge, die den Zuschnitt bestimmen und bei jeder Entscheidung mitgedacht
gehören:

1. **Der Monteur bedient das am Telefon, mit Handschuhen, im Keller.** Nicht
   das Büro ist der schwierige Fall, sondern er. Tastflächen mindestens 44 px
   (`min-h-touch`), keine Sprechblasen, die Formularfelder verdecken, keine
   Ansicht, die ohne Verbindung stumm bleibt.
2. **Es geht um Geld und um Gesundheitsdaten.** Zeiteinträge tragen
   Krankenstände und Urlaub — Art. 9 DSGVO. Deshalb liegt das Supabase-Projekt
   in der EU-Region, und deshalb entscheiden mehrere Abläufe in der Datenbank
   statt im Browser (siehe §5).

**Was ausdrücklich NICHT das Ziel ist:** Funktionsgleichstand mit einer
dreißig Jahre alten Handwerkersoftware. Deren Büroseite ist mächtig, und ihre
Monteure tragen trotzdem wieder Zettel ins Auto.

---

## 2. Stack und Aufbau

React 18 + TypeScript (strict) + Vite, Tailwind mit eigenen Design-Tokens.
**Supabase**: Postgres mit Zeilenschutz (RLS), Supabase Auth mit Ansprüchen im
Token, Supabase Storage, `pg_cron`, vier Edge Functions. Von Firebase sind nur
noch **Hosting** und **Cloud Messaging** übrig; Firestore, die Firebase-
Anmeldung und vierzehn Cloud Functions sind am 19.09.2026 abgebaut worden
(siehe `MIGRATION-SUPABASE.md`).

```
src/
  app/          Routing (App.tsx), Layout, AuthContext, guards.tsx,
                navigation.ts  ← DIE Liste, wer wohin darf
  features/     ein Verzeichnis je Bereich (time, invoices, vacations, …)
  lib/
    db/         die EINZIGE Stelle mit rohen Datenbankaufrufen:
                je Bereich eine Weiche, darunter pg/ mit der Umsetzung
    auth/       Anmeldung, Sitzung, Ansprüche aus dem Token
    permissions.ts   Knopf-Freigaben je Rolle
    module.ts        welche Bereiche der Betrieb benutzt
    time.ts          Feiertage, Tagessoll, Saldo
  components/   wiederverwendbare Bausteine (Card, Button, InfoHint, …)
  types/        zentrale Datentypen
shared/         Logik, die Browser UND Server brauchen (Feiertage,
                Arbeitszeit, Schein-Prüfsumme) — wird beim Bauen nach
                supabase/functions/_shared/ kopiert
supabase/
  migrations/   Schema, Zeilenschutz, Datenbankfunktionen, Trigger
                — DIE eigentliche Sicherheitsgrenze
  functions/    die vier Edge Functions
tests/          siehe §6
```

**Zwei Regeln, die durchgehalten wurden:**

- Rohe Datenbankaufrufe **nur** in `src/lib/db/`. Ein Test
  (`abfragegrenzen`) erzwingt außerdem, dass dort jede Abfrage eine **Grenze**
  hat. Das ist bewusst weiter gefasst als `limit()`: ein Zeitraum oder ein
  Gleichheitsfilter auf eine von Natur aus kleine Menge zählt auch. Wer die
  Regel für „überall ein `limit()`" hält, hält die Bremse für dichter, als sie
  ist — durch genau diese Öffnung passt der Projekt-Radar, siehe §6.
- Logik, die Browser und Server beide brauchen, liegt in `shared/` und wird
  kopiert — nicht abgeschrieben. Zwei Implementierungen derselben Zahl wären
  der gefährlichste Fehler dieses Projekts: sie geht auf den Lohnzettel.
  Für die Datenbank gilt dasselbe noch schärfer: wo eine Formel in SQL
  nachgebaut ist (`app.arbeitsminuten`, `app.ist_feiertag`,
  `app.schein_kanonisch`), steht daneben ein Test, der sie gegen die
  JavaScript-Fassung rechnet (`app.zahl_wie_js`, `app.text_wie_js`).

### Sechs Rollen

`Mitarbeiter` (Monteur) · `Verwaltung` · `Buchhaltung` · `Projektleiter` ·
`Geschäftsführung` · `Administrator`

Die feinen Unterschiede, die immer wieder Fragen aufwerfen:

- **`isGF()` schließt die Projektleitung ein, `isTopLevel()` nicht.** Ersteres
  gilt für Baustellen, Planung, Material; letzteres für Geld, Rollen und
  Betriebseinstellungen. In der Datenbank heißen dieselben zwei Grenzen
  `app.ist_fuehrung()` und `app.ist_spitze()`.
- Die **Projektleitung** plant und führt Baustellen, sieht aber **keine**
  Rechnungen, **keine** Zeitkonten, **keine** Margen und vergibt **keine**
  Rollen.
- Die **Buchhaltung** rechnet ab und darf fremde Zeiteinträge korrigieren,
  verwaltet aber keine Baustellen.
- **Administrator anlegen oder ändern darf nur ein Administrator** — sonst
  könnte sich eine Geschäftsführung zum Superuser machen. Durchgesetzt vom
  Trigger `users_adminrolle`, nicht nur von der Oberfläche.

Dazu kommt eine Rolle, die in keinem Betrieb steht: der **Plattformverwalter**
(`platform_admins`). Sein Token trägt **keine `companyId`** — er legt Betriebe
an und sieht in keinen hinein. Siehe `README.md` und §5.

### Neun abschaltbare Module

`einsatzplanung` · `material` · `urlaub` · `scheine` · `angebote` ·
`rechnungen` · `nachkalkulation` (hängt an `rechnungen`) · `wartung` ·
`zeitkonten`

Geschaltet unter **Einstellungen → Module**, gespeichert in `companies.modules`
(JSON), änderbar nur durch Geschäftsführung/Administrator.

> **Ein Modul ist KEINE Sicherheitsgrenze.** Wer die Rolle hat, dürfte die
> Daten ohnehin — ein abgeschaltetes Modul nimmt nur den Weg dorthin weg.
> Wer das verwechselt, baut irgendwann ein Recht auf einen Schalter.

Nicht abschaltbar und das mit Absicht: Zeiterfassung, Kunden, Baustellen,
Benutzerverwaltung, Einstellungen. Ein Schalter, mit dem man sich selbst aus
den Einstellungen aussperrt, ist kein Freiheitsgrad.

---

## 3. Arbeiten am Projekt

```bash
npm install
cp .env.example .env   # Supabase-Werte eintragen, Firebase nur für Push
npm run dev            # Vite

npm run typecheck      # tsc --noEmit
npm run lint           # eslint, --max-warnings 0
npm test               # 1716 Tests: Rechnung und Ansichten, ohne Datenbank

# Die Datenbankprüfungen brauchen den lokalen Stack (Docker):
npm run stack          # Supabase lokal hochfahren, Migrationen einspielen
npm run supabase:test  # 728 Tests gegen eine ECHTE Postgres-Datenbank

npm run durchklick     # vier Wege im echten Browser (Playwright)
```

**Vor jedem Commit:** `npm run typecheck && npm run lint && npm test`. Wer am
Schema, an einer Richtlinie oder an der Datenschicht war, zusätzlich
`npm run supabase:test`. Die CI prüft alles und lässt ohne grünes Ergebnis
nichts live.

### Deploy

Zwei Workflows, beide auf `main`:

| Workflow | Was |
|---|---|
| `deploy.yml` | Typprüfung, Lint, Tests → Firebase Hosting (`--only hosting`) |
| `supabase-migrationen.yml` | Migrationen und Edge Functions: auf jedem Pull Request gegen eine **frische** Datenbank, auf `main` ins echte Projekt |

Die Prüfung steht **vor** dem Einspielen. Das ist wichtig: eine Migration, die
einmal im Projekt liegt, ist dort — anders als ein Frontend-Deploy lässt sie
sich nicht einfach zurückrollen.

### Branch-Regeln

Entwickelt wird auf einem Zweig, gemergt per PR nach `main`.
**Ist der PR eines Zweigs bereits gemergt, wird nicht darauf aufgebaut** —
dann den Zweig frisch von `main` starten (gleicher Name) und einen neuen PR
öffnen.

---

## 4. Die Fallen, die schon zugeschnappt sind

Diese Liste ist teuer bezahlt. Wer sie liest, spart sich die Wiederholung.

| Falle | Was passiert |
|---|---|
| **`canvas.width = …` löscht die Zeichenfläche.** | Die Unterschrift verschwand bei jedem Neuberechnen der Größe. `SignaturePad` sichert und stellt jetzt wieder her — und reagiert auf `ResizeObserver` statt auf `window.resize`. |
| **`catch(() => undefined)` versteckt vier Zustände hinter einem.** | „lädt", „leer", „Fehler", „fertig" sahen alle gleich aus. Deshalb `BaustellenSelect` als eigene Komponente, die nie stumm leer bleibt. |
| **Ein Serveraufruf ohne Frist wartet ewig.** | Weder eine Firestore-Abfrage noch ein `fetch` bricht von selbst ab — sie warten, bis eine Antwort kommt, und auf einer toten Verbindung wartet der Aufrufer unbegrenzt. Zweimal als Fehler gemeldet („Schein lädt ewig", „iPhone lädt gar nicht"). Dagegen steht `lib/frist.ts`, gesetzt dort, wo ein Warten den Benutzer festhält — siehe §5. |
| **Dieselbe Aussage an zwei Stellen läuft auseinander.** | Wer wohin darf, stand dreimal geschrieben; an sieben Stellen widersprachen sich die Listen. Siehe §5. |
| **Ein Filter auf „ungleich" überspringt Zeilen OHNE Wert.** | Der nächtliche Bilanzlauf fragte `active != false` und übersprang damit stillschweigend jeden übernommenen Altbestand ohne `active`. In SQL ist es dieselbe Falle mit anderem Mechanismus: `active <> false` ist für `NULL` weder wahr noch falsch, die Zeile fällt heraus. In dieser App heißt „kein Wert" **aktiv** — wer darauf filtert, schreibt `coalesce(active, true)` oder `active is not false`. So steht es auch in `app.aktiv()`, das den fehlenden Anspruch im Token als aktiv liest: ein Deploy darf nicht den ganzen Betrieb aussperren. |
| **iOS friert eine Startbildschirm-App ein, statt sie neu zu laden.** | Beim Zurückkommen ist der JavaScript-Zustand noch da, die Netzverbindungen nicht. Ein Browser-Tab am Schreibtisch wird stattdessen neu geladen — deshalb sieht man es dort nie. Unter Firestore brauchte es dafür eine eigene Erneuerung der Dauerverbindung; Postgres-Abfragen gehen über gewöhnliche Anfragen, die beim Aufwachen neu aufgebaut werden. **Die Live-Verbindung (Realtime) tut es nicht von selbst** — sie meldet sich über ihren eigenen Zustand zurück. |
| **Die Fassungsnummer eines Service Workers darf nicht aus dem Bundle kommen.** | Sie käme aus der ALTEN Fassung, der Worker meldete sich unter der alten Adresse an und erneuerte sich nie. Nur der Server weiß, ob es etwas Neues gibt — deshalb vergleicht der Worker die ausgelieferte `index.html` mit der gespeicherten. |
| **Ein Service Worker darf beendet werden, sobald er geantwortet hat.** | Ohne `event.waitUntil` bricht die Hintergrundprüfung mitten im Laden ab — auf dem Telefon also fast immer, und der Deploy fällt nie auf. |
| **Die alten Bausteine wegzuwerfen, sobald ein Deploy erkannt wird, bricht die laufende Seite.** | Sie ist noch die alte und fordert die alten Namen an — im Speicher gelöscht, auf dem Server nach dem Deploy nicht mehr vorhanden. Seit dem Code-Splitting lädt jede Ansicht erst beim Öffnen nach; wer auf „Später" tippt, bekommt danach eine Fehlermeldung statt der Ansicht. Aufgeräumt wird beim Übernehmen. |
| **Es gibt keinen 404 für eine fehlende Datei.** | Der Hosting-Rewrite `"source": "**"` schickt JEDE unbekannte Adresse auf `index.html` — Status 200, `text/html`. Eine Bausteindatei, die es nach einem Deploy nicht mehr gibt, sieht damit aus wie ein Erfolg. Der Service Worker hat die Startseite daraufhin unter dem Namen der JavaScript-Datei gespeichert, und der Fehler blieb stehen. Gemeldet als „'text/html' is not a valid JavaScript MIME type". |
| **Eine Fehlererkennung nach Wortlaut ist immer zu kurz.** | Dieselbe Meldung heißt in Safari, Chrome und Firefox anders. Die erste Fassung der Nachlade-Erkennung traf die Safari-Formulierung nicht — die Selbstheilung lief deshalb nicht an, und der Monteur bekam die Tafel mit dem Knopf, der nicht wirken kann. Erkennung UND ein sauberer Fehlschlag aus dem Worker, nicht eines von beiden. |
| **„Erneut versuchen" kann einen Nachladefehler nicht heilen.** | React merkt sich das abgelehnte Versprechen eines `lazy`-Imports und scheitert sofort wieder, ohne das Netz zu fragen. Nur ein echtes Neuladen hilft — die Fehlergrenze tut das jetzt selbst. |
| **Ein Pfadfilter im Workflow ist eine Aussage über Abhängigkeiten.** | Der alte Functions-Deploy hörte nur auf `functions/**`. `shared/` wird beim Bauen dorthin kopiert, liegt aber daneben — eine Änderung ging damit ins Hosting und nicht in die Functions. Dieselbe Abhängigkeit besteht heute zwischen `shared/` und `supabase/functions/_shared/`. |
| **Ein `pointercancel` beendet die Zeigerspur endgültig, die Berührungsspur läuft weiter.** | Beansprucht der Browser die Geste für sich, kommt kein `pointermove` mehr — die Unterschrift blieb ein Punkt. In derselben Geste kamen noch neun `touchmove` an. Wer mit dem Finger zeichnet, gehört deshalb an `touchstart`/`touchmove`, nicht an die Zeigerereignisse. Nachgemessen in einem echten Browser: 8285 gezeichnete Pixel ungestört, 36 nach dem Abbruch. |
| **React meldet Berührungsereignisse an der Wurzel als PASSIV an.** | In einem passiven Listener ist `preventDefault()` wirkungslos, und ohne das scrollt die Seite unter dem Finger weg, statt dass er zeichnet. Wer eine Berührung abfangen muss, hängt den Listener nativ ans Element mit `{ passive: false }` — nicht über `onTouchStart`. |
| **`setPointerCapture` ist auf WebKit keine Hilfe, sondern ein Verdächtiger.** | Es sollte den Strich über den Feldrand halten. Dieselbe Aufgabe erledigen Listener am FENSTER, solange ein Strich läuft — ohne die Nebenwirkung. |
| **Ein Probestand ohne die echte CSS misst den eigenen Aufbau, nicht die App.** | Der erste Messlauf zeigte den Fehler sofort — aber nur, weil die Stylesheets 404 gaben und damit `touch-action: none` fehlte. Mit geladener CSS lief alles. Erst danach war die Messung etwas wert. Genauso: Vite liefert aus dem Zwischenspeicher, ein Wechsel der Fassung auf der Platte kommt ohne Neustart NICHT im Browser an — zwei Läufe lieferten deshalb identische Zahlen für zwei verschiedene Stände. |
| **„Der Eigentümer darf seinen eigenen Beleg ändern" ist keine Grenze, solange nicht dabeisteht: WELCHES FELD.** | `isBilled` und `invoiceNumber` entscheiden, ob eine Stunde je auf eine Rechnung kommt. Der Eigentümer konnte sie an seinem eigenen Zeiteintrag setzen und damit seine Arbeitszeit aus der Verrechnung nehmen — ohne Fehlermeldung, und die Zeile steht im Zeitkonto ganz normal weiter. Wo eine Rolle eine Zeile nur teilweise bearbeiten darf, gehört die Feldliste in die Regel: `app.nur_diese_felder()`, angewandt im Trigger `time_entries_verrechnung`. |
| **Ein Test, der prüft, dass etwas VERBOTEN ist, ist erst die halbe Miete.** | Zu jedem neuen Riegel gehört die Gegenprobe, dass die echten Arbeitswege weiter durchgehen. Beim Materialstamm fehlte sie, und ein Knopf tat drei Wochen lang nichts. Beim Verrechnet-Kennzeichen waren es vier Verbots- und **sieben** Gegenprobe-Tests — und zwei davon schlugen sofort fehl (falsche Benutzerkennung im Testdatensatz). Ohne sie hätte ich es nicht gemerkt. |
| **Eine Regel einzugrenzen heißt, jeden Schreibweg zu kennen — auch die unsichtbaren.** | Der Materialstamm wurde auf Verwaltung und Leitung eingegrenzt, mit der Begründung, gebucht werde ohnehin nur unter „Material → Lager". Falsch: der Monteur bewegt den Bestand beim Abholen und bei jeder Retoure, aus einem Vorgang heraus, der Anforderung UND Bestand zusammen schreibt. Der Bestandsteil scheiterte, also scheiterte alles — der Knopf tat nichts, ohne Meldung. Wo eine Rolle nur EIN Feld bewegen darf, ist die Feldliste die Grenze, nicht die Rolle. |
| **Ein grüner Regeltest kann den Irrtum mitschreiben, den er prüfen sollte.** | Zur Regel oben gehörte ein Test „der Monteur ändert den Bestand nicht". Er war grün und hat die falsche Annahme drei Wochen festgehalten. Ein Regeltest ist erst dann etwas wert, wenn die Annahme dahinter am ABLAUF geprüft wurde — nicht am Kommentar über der Regel. |
| **Zwei Schreibvorgänge hintereinander sind kein Vorgang.** | Die Retoure schrieb erst den Beleg, dann die Gutschrift. Scheiterte die zweite, stand der Beleg da (mit `processed: true`) und der Bestand war nicht erhöht — die Meldung „konnte nicht erfasst werden" war eine Lüge, und der zweite Versuch legte einen zweiten Beleg an. Was zusammengehört, gehört in EINEN Vorgang: heute eine Datenbankfunktion (`public.retoure_anlegen`), die entweder ganz oder gar nicht durchgeht. |
| **Ein Bestätigungsdialog ohne `confirmLabel` sagt „Löschen".** | Zweimal aufgetreten: unter „Material abgeholt?" und unter „Benutzer deaktivieren?" stand je ein roter Löschen-Knopf — bei der Benutzerverwaltung in einer Ansicht, die per Entscheidung NIE etwas löscht. Wer das liest, tippt nicht darauf und meldet, die Aktion lasse sich nicht bestätigen. Bei jedem `ConfirmDialog` gehört `confirmLabel` gesetzt. |
| **`Number(x) \|\| VORGABE` verschluckt die eingetragene Null.** | In JavaScript ist die Null unwahr. Wer null Wochenstunden einträgt, bekam vierzig — und danach rund 170 Minusstunden im Monat, auf dem Lohnzettel. Der Rückfall darf nur bei LEERER oder unbrauchbarer Eingabe greifen, denn leer heißt „nicht entschieden", null heißt „null". |
| **Ein deaktiviertes Konto war nur im Browser deaktiviert.** | Die Sicherheitsregeln kannten `active` nicht, und die Ansprüche wurden unabhängig davon gesetzt. Wer ausschied, behielt ein gültiges Konto und kam am UI vorbei an alles. Heute prüft `app.angemeldet()` den Aktiv-Zustand — also unter jeder Richtlinie — und `app.konto_sperren()` sperrt zusätzlich das Anmeldekonto. |
| **Ein Anspruch im Token ist bis zu einer Stunde alt.** | Wer die Rolle wechselt oder deaktiviert wird, trägt sein altes Token weiter. Deshalb hängt der Aktiv-Zustand nicht nur am Token: die Sperre steht zusätzlich in der Datenbank, und das Anmeldekonto wird gesperrt. Drei Riegel, weil jeder für sich eine Lücke lässt. |
| **Ein neuer Schlüsseltyp ist kein JWT.** | Ein `sb_secret_…` gehört nur in den `apikey`-Kopf; im `Authorization`-Kopf prüft das Tor ihn als JWT und weist ihn ab. Dieselbe Regel steht in `shared/dienstSchluessel.ts`, in `scripts/bootstrap-postgres.mjs` und in `app.anstoss_kopfzeilen()`. |
| **`having count(*) = 1` gibt bei Mehrdeutigkeit NULL zurück, nicht einen Fehler.** | `app.katalogeintrag` sucht den Lagerartikel zum Namen einer Position. Tragen zwei Artikel denselben Namen, ist das Ergebnis leer — die Retoure geht durch und schreibt **keinen** Bestand zurück. Festgehalten in `tests/supabase/modulLager.test.ts`; die Lösung (Artikelnummer statt Name) steht auf der Roadmap. |

### Fallen aus der Firestore-Zeit — was davon bleibt

Diese vier waren teuer und sind mit dem Umzug gegenstandslos geworden. Sie
stehen hier, weil die Frage dahinter jedes Mal wiederkommt, wenn jemand eine
neue Technik einführt.

| Falle von damals | Was heute an ihrer Stelle steht |
|---|---|
| **Der Emulator legt fehlende Indizes still selbst an** — lokal lief alles, produktiv blieb die Ansicht leer („Kundenakte ohne Baustellen"). | Postgres kennt keine Pflichtindizes; eine Abfrage ohne Index ist langsam, nicht leer. Dafür wacht `tests/supabase/schema.test.ts` darüber, dass jede Mandantentabelle einen Index mit `company_id` oder einem Fremdschlüssel als führender Spalte hat. **Die Lehre bleibt: ein lokaler Stand, der mehr verzeiht als der echte, ist eine Falle.** |
| **Ein fehlendes Dokument wurde ABGELEHNT, nicht leer beantwortet** — `getUserByUid` warf, statt `null` zu liefern. | Unter dem Zeilenschutz ist es genau umgekehrt und das ist die bessere Eigenschaft: eine Zeile, die man nicht sehen darf, ist nicht „verboten", sondern nicht vorhanden. Fehlender und fremder Datensatz sehen von aussen gleich aus. |
| **`vi.useFakeTimers()` ohne Einschränkung fror den Firestore-Client ein.** | Der Supabase-Client hängt an `fetch`, nicht an eigenen Zeitgebern. `vi.useFakeTimers({ toFake: ['Date'] })` steht trotzdem überall, wo Zeit gestellt wird — es ist die richtige Gewohnheit. |
| **Trigger liefen MINDESTENS einmal, nicht genau einmal** — ein `+= delta` verzählte sich beim Wiederholungslauf, deshalb rechnete die Monatsbilanz jeden betroffenen Monat komplett neu. | Postgres-Trigger laufen im selben Vorgang wie die Änderung, also genau einmal. Die verdichteten Monatszahlen sind heute die Sicht `monthly_stats` — sie rechnet bei der Abfrage und kann sich gar nicht mehr verzählen. |
| **Ein Schnappschuss kam zweimal** — einmal aus dem lokalen Zwischenspeicher, einmal vom Server, mit gleichem Inhalt und neuem Array. | Die Live-Verbindung liefert einzelne Änderungen, keine ganzen Listen. Wer einen Effekt an die Identität eines Arrays hängt, rechnet trotzdem doppelt — das ist eine React-Falle, keine Datenbank-Falle. |

---

## 5. Die tragenden Entscheidungen

Wer hieran etwas ändert, sollte wissen, warum es so ist.

**Die Sicherheitsgrenze steht in der Datenbank, nirgends sonst.** Jede Tabelle
trägt Zeilenschutz, jede Richtlinie prüft den Betrieb aus dem Token. Navigation,
Wächter und Knopf-Freigaben sind Bedienführung. Jede Richtlinie hat einen
Kommentar, der sagt, wovor sie schützt — und `tests/supabase/schema.test.ts`
fragt die Datenbank nach ihren Tabellen, statt eine Liste zu pflegen: eine neue
Tabelle ist damit automatisch geprüft oder fällt durch.

**Wer wohin darf, steht NUR in `src/app/navigation.ts`.** `RequireNav` liest
Rolle *und* Modul aus demselben Eintrag, aus dem auch der Reiter gebaut wird.
Vorher stand es zusätzlich als `RequireRole` an jeder Route — die Listen
liefen auseinander, und die Projektleitung sah fünf Reiter, die „Kein Zugriff"
sagten. **Nicht wieder auseinanderziehen.** Ein statischer Test wacht darüber.

**Was der Server tut, statt der Browser — und warum:**

| Wo | Warum nicht im Browser |
|---|---|
| `public.urlaub_entscheiden` (Datenbankfunktion) | Schreibt fremde Zeiteinträge. Die enthalten Krankenstände (Art. 9 DSGVO); ein Genehmigender darf sie nicht sehen. Die Funktion läuft mit erhöhten Rechten und prüft selbst, wer sie ruft (`app.darf_urlaub_entscheiden`). |
| `public.schein_vorbereiten` | Füllt den Schein aus fremden Zeiteinträgen vor — dieselbe Grenze. |
| Trigger `users_ansprueche` und `users_adminrolle` | Setzen Betrieb, Rolle und Aktiv-Zustand ins Token. Ohne sie hat ein neuer Benutzer keine Rechte. Und: wer Administratoren ernennen darf, entscheidet die Datenbank, nicht das Formular. |
| Sicht `monthly_stats` | Verdichtete Zeitkonten, damit der Saldo nicht die ganze Historie lädt. Früher ein nächtlicher Lauf mit eigenem Zählwerk — heute rechnet die Datenbank es bei der Abfrage. |
| Trigger `material_orders_push` → Edge Function `push-melden` | Push. Der Auslöser gehört an die Änderung, nicht an den Browser, der sie ausgelöst hat: der kann weg sein, bevor die Meldung raus ist. |
| `app.schein_pruefsumme_setzen` (Trigger) | Friert den unterschriebenen Schein ein. Eine Prüfsumme, die der Browser rechnet, beweist nichts. |
| `app.zahlstand_setzen` (Trigger) | Leitet den Zahlungsstand einer Rechnung aus ihren Eingängen ab. Ein Haken von Hand wird abgewiesen: „Bezahlt" ist eine Zahl, keine Meinung. |
| `app.vorrechnungen_pruefen` (Trigger) | Der Abzug auf der Schlussrechnung. Der teure Fehler ist der doppelte Abzug — der Kunde zahlt zu wenig, und es fällt beim Jahresabschluss auf. Eine Prüfung im Browser sähe nur, was gerade geladen ist. Geprüft wird ausserdem, dass die Rechnung aufgeht: Gesamtleistung − Abzüge = Rechnungsbetrag. |
| `public.betrieb_auszug` | Auskunft nach Art. 15 DSGVO: der ganze Bestand als Datei. Seitenweise gelesen und gedeckelt — deshalb ist sie NICHT die Sicherung. |
| Edge Function `daten-ausleitung` + `pg_cron` | Die Sicherung: schreibt jede Nacht den Bestand jedes Mandanten zeilenweise weg, samt Dateien, und räumt alte Stände auf. Von Hand anstoßbar, damit sich überhaupt prüfen lässt, ob sie läuft. |
| Edge Function `mitarbeiter-anlegen` | Ein Anmeldekonto anlegen braucht den Dienstschlüssel. Der steht sonst im ausgelieferten JavaScript. Die Zeile in der Belegschaft schreibt weiterhin der Browser — siehe `README.md`, das ist Absicht. |
| Edge Function `passwort-vergeben` | Ein neues Startpasswort für ein Konto, das sich mit **Benutzernamen** anmeldet — es hat kein Postfach für einen Rücksetzlink. Nur Geschäftsführung/Administration, nur im eigenen Betrieb, einem Administrator nur durch einen Administrator, und **nie für ein Konto mit E-Mail-Adresse** (sonst könnte das Büro sich still in das Konto eines Kollegen setzen). |
| Edge Function `betrieb-anlegen` | Legt einen ganzen Mandanten an. Lässt nur herein, wer in `platform_admins` steht. |

**Nur das Ist speichern, nie den Saldo.** Der Saldo hängt an Wochenstunden,
Arbeitstagen, Eintrittsdatum und Feiertagen. Ändert die Geschäftsführung
jemandes Wochenstunden, ändert sich rückwirkend jeder Tag — ein gespeicherter
Saldo wäre ab dem Moment falsch.

**Nummernkreise nur steigend.** `public.naechste_nummer` zählt in einer
eigenen Tabelle hoch, und die darf nicht geleert werden: ein neu angelegter
Zähler begänne wieder von vorn, und der Betrieb hätte zwei Rechnungen mit
derselben Nummer in den Büchern.

**Erklärungen hinter das „i" (`InfoHint`), Zustandsmeldungen nicht.** Was
immer gilt, klappt auf Tipp auf. Was gerade passiert oder gleich passieren
wird — eine Warnung vor doppelten Datensätzen, die Folgen eines Stornos —
bleibt sichtbar. **Eine Folge hinter einem Aufklapper ist keine Warnung.**

**Ein Warten, das den Benutzer festhält, bekommt eine Grenze.** `lib/frist.ts`
legt sie, und sie steht an drei Stellen: der Start der App weicht nach acht
Sekunden auf den gespeicherten Anspruch aus, statt weiter zu warten; die
Prüfung auf Doppelbuchung gibt vor dem Buchen auf, statt die Buchung zu
verhindern; und die von Hand angestossene Sicherung meldet, dass keine Antwort
kam, statt endlos zu drehen. **Nicht jede Abfrage trägt eine Frist** — eine
Liste, die lädt, darf laden.

**Schreibvorgänge tragen nie eine Frist, sondern ein Ausgangsfach.** Firestore
nahm einen Schreibvorgang ohne Netz lokal an und reichte ihn nach; Supabase tut
das nicht. `lib/sync/ausgangsfach.ts` baut die Eigenschaft nach — für die zwei
Dinge, die der Monteur ohne Empfang tut: **Zeit buchen** und **Material
anfordern**. Die Kennung der Zeile kommt dabei vom Gerät, damit derselbe
Vorgang zweimal ankommen darf, ohne zweimal zu landen, und eine späte Ablehnung
erreicht ihn über `VerloreneBuchung`. Ein **Empfang** für fremde Änderungen
gehört ausdrücklich nicht dazu: das Ausgangsfach sendet, es gleicht nicht ab.

**Zugang endet serverseitig, nicht in der Oberfläche.** Der Aktiv-Zustand
steht als Anspruch im Token und wird in `app.angemeldet()` geprüft — also
unter jeder Richtlinie, damit eine neue Tabelle die Sperre nicht vergessen
kann. Dazu sperrt `app.konto_sperren()` das Anmeldekonto. Zwei Riegel, weil
jeder für sich eine Lücke lässt: die Kontosperre wirkt erst beim nächsten
Anmelden, ein ausgestelltes Token liefe bis zu einer Stunde weiter.

**Farbe, Verlauf und Fläche kommen aus Tokens, nicht aus der Aufrufstelle.**
Alles Sichtbare liegt in `src/index.css` (`:root`) und wird über
`tailwind.config.js` als Rolle angeboten: `bg-surface`, `border-line`,
`text-ink-muted`, `bg-grad-brand`. Wer in einer Ansicht einen Hexwert oder ein
eigenes `linear-gradient(...)` schreibt, nimmt diese Fläche aus der
Mandantenfähigkeit heraus — `applyBranding` setzt `--brand` und `--accent` zur
Laufzeit aus den Stammdaten des Betriebs — und aus jeder künftigen Änderung des
Erscheinungsbilds.

Drei Flächen tragen die ganze App, alle drei stehen in `index.css` unter
`@layer components`:

| Klasse | Wofür |
|---|---|
| `.panel` | Helle Arbeitsfläche: Karten, Dialoge, Kästen. Heller Verlauf, türkis getönte Haarlinie, langer flacher Schatten. |
| `.panel-dark` | Dunkle Trägerfläche: Seitenleiste, mobile Kopfleiste, Tableiste, Anmeldekopf. |
| `.edge-accent` | Leuchtende Kante (Cyan → Mint) als Markierung. Reine Dekoration. |

`@layer components` ist kein Schmuck: freies CSS am Dateiende stünde NACH den
Utilities und gewänne gegen sie. Dann schlüge `.panel { border-radius }` ein
`rounded-sm` an der Aufrufstelle, und `.panel-dark { position }` das `fixed`
der unteren Leiste.

**Die Marke färbt, was HANDELT. Die Oberfläche färbt, was STRUKTUR ist.**
`--brand` und `--accent` gehören dem Mandanten (`applyBranding` setzt sie zur
Laufzeit) und stehen auf Knöpfen, Abzeichen und Links. Alles Strukturelle —
Trägerflächen, Kanten, Reitermarkierung, Kästchen, Kalender — nimmt die festen
Töne `--ink-deep`, `--accent-deep`, `--accent-bright`, `--mint`. Der Anlass
war ein roter Strich: der Pilotbetrieb hat `#d51f26` als Akzentfarbe
hinterlegt, und solange die Reitermarkierung aus `--accent` kam, war sie der
einzige rote Punkt auf einer türkisen Seite. **Eine Markierung ist keine
Handlung.**

**Verläufe nur auf den grossen dunklen Trägerflächen** — Seitenleiste,
Kopfleiste, Tableiste, Anmeldekopf, Sprach-Banner — und auf der 3 px hohen
Markenkante. Alles andere ist einfarbig: Karten, Knöpfe, Kästen, Blätter,
Dialoge. Der erste Entwurf hatte überall welche; nebeneinander war das kein
Rang mehr, sondern Unruhe.

**`html` bekommt ausdrücklich KEINEN Grund.** Nur `body`. Der Versuch, die
Ränder der Startbildschirm-App über einen dunklen `html`-Grund einzufärben,
sah auf kurzen Seiten richtig aus und legte unter jede längere Seite ein
dunkles Band: `body` ist 100 % hoch, also genau einen Bildschirm, und alles
darunter gehört dem `html`. Die dunklen Ränder malt deshalb die App selbst —
Kopf- und Tableiste rechnen `env(safe-area-inset-*)` in ihr Innenmaß ein.

**Das Kästchen ist `.checkbox`, nicht `accent-color`.** `accent-color` färbt
den Haken und sonst nichts; Grösse, Rundung und Rahmen bleiben die des
Betriebssystems. Es gibt acht Kästchen in der App und nur eines davon läuft
durch `CheckboxField` — eine Klasse in `index.css` ist die einzige Fassung,
die alle acht gleich hält.

**Farbe lebt auf KANTEN und in SCHRIFT, nicht in Flächen.** Die
Reitermarkierung ist eine Unterkante, der aktive Navigationseintrag eine linke
Kante, die Seitenüberschrift ein kurzer Strich, die Warnpille ein Rand mit
farbiger Schrift auf der Fläche der Karte.

**Ein MELDUNGSKASTEN trägt die Farbe nur in der Schrift** — `border-line` wie
jeder andere Rahmen, `bg-surface-2` als Fläche. Das ging über zwei Irrwege:
zuerst die pastellgelb und pastellrot GEFÜLLTEN Kästen (die einzigen
Farbflächen der App ausserhalb der Familie Türkis/Tinte — sie fielen auf, weil
sie fremd waren, nicht weil sie dringend waren), dann eine 3 px breite linke
Kante in der Zustandsfarbe. Die Kante war ein DRITTES Idiom neben Pille und
Kartenkante, und drei verschiedenfarbige Balken untereinander sahen verspielt
aus. Aus dem Betrieb: „ich bin kein Fan von diesen einseitigen Balken."

Die Begründung für den jetzigen Stand ist einfacher als beide Vorgänger: in
einem Meldungskasten IST der Text die Meldung. Die Farbe sitzt damit genau
dort, wo die Bedeutung steht, und der Kasten bleibt ein Behälter. Der Kontrast
ist dabei gestiegen — `--success` lag auf seinem alten Pastellgrund bei
**4,42:1 und damit unter AA**, auf `--surface-2` sind es 4,67:1.

**NICHT umgestellt sind Flächen, die keine Meldung sind:** Tageszellen im
Kalender und im Wochenplan, der aktive Navigationseintrag, die Auswahl im
PersonPicker, das Band am Kopf einer Akte, die Helferzeile in der
Projektauswertung und das Verbindungsband. Das Verbindungsband ist die eine
bewusste Ausnahme unter den Meldungen: es läuft von Rand zu Rand, und eine
Kante allein könnte es nicht vom Seitengrund abheben — dafür braucht es eine
Fläche.

**Die leuchtenden Töne tragen nie Text.** `--accent-bright` (#12b0c6) und
`--mint` (#66ffb0) erreichen auf Weiß 2,6:1 bzw. 1,3:1. Sie sind Kante und
Fläche. Gelesen wird auf `--text`, `--text-muted`, `--brand` oder `--accent` —
und wo weißer Text auf einem Verlauf steht, ist dessen HELLSTES Ende der
Maßstab; deshalb endet `--grad-brand` bei #107a8c (5,0:1) und nicht, wie die
Vorlage, bei #12889b (4,2:1).

**Abtönungen gehen über `color-mix`.** `bg-ink/40`, `border-info/30`,
`text-brand-fg/80` funktionieren nur, weil die Farbrollen in
`tailwind.config.js` als FUNKTION hinterlegt sind (`token('--ink')`) — die
Datei erklärt an Ort und Stelle, was sonst passiert. **Nicht zurück auf
Strings setzen.**

**Der Service Worker fasst nur eigene Dateien an.** Datenbank-, Anmelde- und
Function-Aufrufe gehen unberührt durch. Eine vorgehaltene Datenbankantwort
wäre ein falscher Kontostand. Ein Test in `tests/unit/serviceWorker.test.ts`
lädt die echte `public/sw.js` in eine Sandbox und hält genau das fest.

---

## 6. Wo die Schwachstellen sind

Ehrlich und in der Reihenfolge, in der sie wehtun.

### Ansichtstests: vollständig, aber flach

**Alle 28 Ansichten haben einen eigenen Test.** Der Materialablauf ist
zusätzlich als ganzer ABLAUF geprüft — anfordern, bearbeiten, Bestand führen —
und das hat sich sofort ausgezahlt: der Fehler, den er zutage gefördert hat,
lag in keiner der drei Ansichten, sondern in der Regel darunter. Wer eine
Ansicht allein prüft, sieht so etwas nie.

**Die Einschränkung gilt unverändert:** in jedem dieser Tests ist jeder
Datenbankzugriff ersetzt. Sie finden Bedienfehler und falsche Verdrahtung,
keine Datenfehler. Jeder aus dem Betrieb gemeldete Fehler lag bisher in genau
den Nähten, die sie per Konstruktion nicht sehen — dafür sind die
Datenbanktests da (`tests/supabase/`, gegen eine echte Postgres-Instanz) und
der Durchklick im echten Browser.

### Der echte Browser deckt vier Wege ab, nicht alle

`npm run durchklick` fährt vier Wege in einem echten Chromium gegen den
lokalen Stack: **Zeit buchen**, **Material anfordern**, **Schein
unterschreiben**, **Rechnung stellen**. Genau die drei gemeldeten Fehler, die
kein Ansichtstest je gefunden hätte (Unterschrift am Telefon, endloses Laden,
weißer Bildschirm nach einem Deploy), liegen damit unter Beobachtung.

*Bleibt offen:* Chromium ist nicht Safari, und der Durchklick läuft nicht auf
einem echten Telefon. Die Unterschrift ist im Mechanismus nachgewiesen, die
Bestätigung auf einem iPhone steht weiter aus.

**Wie die Fingereingabe gemessen wurde**, falls es jemand wiederholen muss:
eine kleine Seite, die nur diese eine Komponente rendert, über den
Vite-Dev-Server; dazu `playwright-core` gegen das vorhandene Chromium und
`Input.dispatchTouchEvent` über das CDP für echte Berührungen. **Zwei
Fallstricke dabei**, beide selbst hineingetappt: ohne die echte CSS fehlt
`touch-action: none` und man misst seinen eigenen Aufbau statt der App; und
Vite liefert aus dem Zwischenspeicher — ohne Neustart zeigen zwei Läufe für
zwei verschiedene Codestände dieselben Zahlen.

### Die vier Edge Functions laufen ungetestet

Was sie tun, ist geprüft — aber an der Datenbank, nicht an der Function:
`betrieb-anlegen` und `mitarbeiter-anlegen` haben ihre Tests auf der
Datenbankfunktion darunter, die Ausleitung auf ihren Entscheidungen (welcher
Pfad, was darf gelöscht werden, wie sieht eine Zeile aus), die Push-Meldung
auf dem Auslöser und dem Empfängerkreis. **Das Lesen und Schreiben der
Function selbst hat nie ein Test ausgeführt.** Das ist die grösste
verbliebene Lücke im Prüfnetz.

### Toter oder unerreichbarer Code

| Was | Zustand |
|---|---|
| **Wiedervorlagen** (`follow_ups`) | Tabelle, Richtlinien und Datenschicht existieren; geschrieben wurde nur aus der KI-Spracherfassung, und die ist am 19.09.2026 ersatzlos entfernt worden. Damit ist der Bereich unerreichbar — keine Ansicht liest oder schreibt ihn. Entweder bekommt er einen echten Eingang (Wiedervorlage aus Angebot oder Mahnung) oder er fällt weg; beides ist eine Produktentscheidung, keine Programmierfrage. |

### Eine offene Produktfrage

Die **Nachkalkulation** ist Geschäftsführungssache, weil sie Margen zeigt. Die
**Angebote** stehen auch der Projektleitung offen — und darin steht die
Vorkalkulation mit den Kostensätzen, also die Marge des einzelnen Auftrags.
Entweder ist die eine Grenze zu eng oder die andere zu weit. **Das ist keine
Programmierfrage:** sie hängt daran, ob die Projektleitung im Betrieb
mitkalkulieren soll. Muss der Auftraggeber entscheiden.

### Skalierbarkeit: die eine verbleibende Ausnahme

Jede Abfrage ist begrenzt, aber der Projekt-Radar
(`listEntriesForProjects`) lädt die Stunden der Baustellen **mit Budget** in
einem Zug — begrenzt durch die Zahl dieser Baustellen, nicht durch eine
Zeilenzahl. Bei der Messung lagen alle 15.660 Einträge auf einer aktiven
Baustelle; dort bringt die Begrenzung nichts. Unrealistisch, aber es zeigt,
wo die Lösung endet.

### Der zweite Datenstandort

`daten-ausleitung` schreibt jede Nacht den kompletten Bestand jedes Mandanten
weg — zeilenweise, mit Aufbewahrung, samt Scheinfotos, von Hand anstoßbar, und
mit einem Wächter, der meldet, wenn ein Lauf ausbleibt. Der Rücklauf
(aus der Sicherung wird wieder ein Betrieb) ist gebaut und getestet.

**Wohin geschrieben wird, entscheidet ein Secret.** Ohne einen gesetzten
externen Speicherort landet der Stand im Storage DESSELBEN Supabase-Projekts.
Fällt das Projekt aus oder wird der Zugang gesperrt, ist die Sicherung genauso
weg wie die Daten. Der Handgriff dagegen steht in `DEPLOYMENT.md`; er braucht
eine Entscheidung darüber, wohin — und ein Konto dort. **Die Zugangsdaten
dafür gehören ausschliesslich in die Edge-Function-Secrets des
Supabase-Projekts**, nicht ins Repository, nicht in GitHub-Secrets.

---

## 7. Nächste Schritte

Der vollständige Fahrplan mit Begründung je Stufe steht in `ROADMAP.md`
unter „Der Weg zum Start in Österreich". Die Reihenfolge dort, kurz:

1. ~~**Zahlungseingang**~~ — **erledigt am 19.09.2026.** Datum, Betrag und
   Art je Rechnung; der Zahlungsstand wird daraus abgeleitet und lässt sich
   nicht mehr von Hand setzen.
2. ~~**Anzahlung, Teilrechnung, Schlussrechnung**~~ — **erledigt am
   20.09.2026.** Die Schlussrechnung zieht die Anzahlungen samt Steuer ab
   (§ 11 Abs 12 UStG). `total_*` ist die Restforderung, `gesamt_*` die volle
   Leistung; abgezogen wird nur, was keine Belege verbraucht hat.
3. **Was von Stufe 10 noch offen ist** — Skonto und Verzugszinsen (beide
   hängen am Zahlungseingang und sind damit jetzt baubar), der Rücklass, die
   Gutschrift und die innergemeinschaftliche Leistung.
4. **Arbeitszeit: Gleitzeit oder Durchrechnung** — nur, wenn der Betrieb eine
   entsprechende Vereinbarung hat. Die Frage ist gestellt und noch offen.
5. **Registrierkasse** — erst zu klären, ob der Betrieb überhaupt
   Barumsätze hat. Wenn nein, entfällt die ganze Stufe.
6. **Ansichtstests sind fertig; als Nächstes Prüfnetz für die Edge Functions**
   (siehe §6) und ein zweiter Betrieb von Hand, um die Mandantentrennung
   einmal von aussen zu sehen.

---

## 8. Wie hier gearbeitet wird

Der Auftraggeber hat eine Anforderung mehrfach und deutlich formuliert:

> „Die App soll nicht aus lauter Funktionen bestehen, die nur zur Hälfte
> funktionieren und nicht zu Ende gedacht sind."

Praktisch heißt das:

- **Den vollständigen Arbeitsablauf bauen, nicht die Funktion.** Ein Urlaub,
  der beantragt, aber nicht genehmigt werden kann, ist kein halbes Feature,
  sondern keines.
- **Lücken benennen, statt sie zu verschweigen.** `FUNKTIONEN.md` hat eine
  Spalte „Bekannte Lücke", und sie ist gefüllt. Eine Behauptung, etwas sei
  geprüft, muss stimmen.
- **Kommentare erklären, warum.** Bei jeder nicht offensichtlichen
  Entscheidung steht daneben, welcher Fehler sie verhindert. Das ist kein
  Schmuck: mehrere Richtlinien in den Migrationen sehen ohne den Kommentar
  willkürlich aus.
- **Deutsche Bezeichner in neuem Code**, wo sie den Fachbegriff treffen
  (`urlaubsTage`, `aktiveModule`, `zieheMit`). Älterer Code ist gemischt; das
  ist kein Grund, ihn anzufassen.
- **Ein Test, der eine Funktion prüft, die niemand aufruft, prüft nichts.**
  `canAccess()` war so ein Fall und ist es nicht mehr.
- **Jeder neue Test muss gegen absichtlich kaputten Code fehlschlagen.** Ein
  Test, der auch dann grün bleibt, hält nichts fest — er beruhigt nur.
