# Übergabe

Stand: 02.09.2026, Commit `47c1bce` auf `main`.

**Wofür dieses Dokument da ist.** Es soll jemanden, der die App noch nie
gesehen hat, in einer halben Stunde arbeitsfähig machen — und zwar so, dass er
die Entscheidungen versteht, die schon getroffen sind, statt sie versehentlich
rückgängig zu machen. Es ersetzt nicht:

| Datei | Beantwortet |
|---|---|
| [`FUNKTIONEN.md`](./FUNKTIONEN.md) | *Was gibt es, wer darf was, worauf kann ich mich verlassen?* Eine Zeile je Bereich, inklusive der Lücken. |
| [`ROADMAP.md`](./ROADMAP.md) | *Was wurde wann warum gebaut?* Änderungsprotokoll, neueste Einträge oben. |
| [`DEPLOYMENT.md`](./DEPLOYMENT.md) | Einrichtung von Firebase, Secrets, Scheduler. |
| [`LEGACY-ANALYSIS.md`](./LEGACY-ANALYSIS.md) | Das Datenmodell und die Geschäftslogik aus der alten Einzeldatei. |

Wer schnell etwas sucht: **Funktionsfrage → `FUNKTIONEN.md`. Warum-Frage →
`ROADMAP.md` oder der Kommentar direkt über dem Code.** Die Kommentare in
diesem Projekt erklären *warum*, nicht *was* — das ist Absicht und sollte so
bleiben.

---

## 1. Worum es geht

Betriebssoftware für einen österreichischen Installationsbetrieb (Perl
Installationen): Zeiterfassung, Baustellen, Material, Einsatzplanung,
Angebote, Rechnungen, Handwerksscheine, Urlaub.

**Mandantenfähig** — jedes Dokument trägt eine `companyId`, und die Trennung
wird serverseitig erzwungen, nicht nur in der Oberfläche.

Zwei Dinge, die den Zuschnitt bestimmen und bei jeder Entscheidung mitgedacht
gehören:

1. **Der Monteur bedient das am Telefon, mit Handschuhen, im Keller.** Nicht
   das Büro ist der schwierige Fall, sondern er. Tastflächen mindestens 44 px
   (`min-h-touch`), keine Sprechblasen, die Formularfelder verdecken, keine
   Ansicht, die ohne Verbindung stumm bleibt.
2. **Es geht um Geld und um Gesundheitsdaten.** Zeiteinträge tragen
   Krankenstände und Urlaub — Art. 9 DSGVO. Deshalb liegen alle Cloud
   Functions in `europe-west3`, und deshalb entscheiden mehrere Abläufe
   serverseitig statt im Browser (siehe §5).

**Was ausdrücklich NICHT das Ziel ist:** Funktionsgleichstand mit einer
dreißig Jahre alten Handwerkersoftware. Deren Büroseite ist mächtig, und ihre
Monteure tragen trotzdem wieder Zettel ins Auto.

---

## 2. Stack und Aufbau

React 18 + TypeScript (strict) + Vite, Tailwind mit eigenen Design-Tokens.
Firebase: Firestore, Auth mit Custom Claims, Cloud Functions v2, Hosting.

```
src/
  app/          Routing (App.tsx), Layout, AuthContext, guards.tsx,
                navigation.ts  ← DIE Liste, wer wohin darf
  features/     ein Verzeichnis je Bereich (time, invoices, vacations, …)
  lib/
    db/         die EINZIGE Stelle mit rohen Firestore-Aufrufen
    permissions.ts   Knopf-Freigaben je Rolle
    module.ts        welche Bereiche der Betrieb benutzt
    time.ts          Feiertage, Tagessoll, Saldo
  components/   wiederverwendbare Bausteine (Card, Button, InfoHint, …)
  types/        zentrale Datentypen
shared/         Logik, die Browser UND Server brauchen (Feiertage,
                Arbeitszeit, Monatsbilanz, Schein-Prüfsumme)
functions/src/  Cloud Functions; `shared/` wird beim Bauen nach
                functions/src/generated/ kopiert
firestore.rules Die eigentliche Sicherheitsgrenze
tests/          siehe §6
```

**Zwei Regeln, die durchgehalten wurden:**

- Rohe Firestore-Aufrufe **nur** in `src/lib/db/`. Ein Test (`abfragegrenzen`)
  erzwingt außerdem, dass dort **jede** Abfrage ein `limit()` hat.
- Logik, die Browser und Server beide brauchen, liegt in `shared/` und wird
  kopiert — nicht abgeschrieben. Zwei Implementierungen derselben Zahl wären
  der gefährlichste Fehler dieses Projekts: sie geht auf den Lohnzettel.

### Sechs Rollen

`Mitarbeiter` (Monteur) · `Verwaltung` · `Buchhaltung` · `Projektleiter` ·
`Geschäftsführung` · `Administrator`

Die feinen Unterschiede, die immer wieder Fragen aufwerfen:

- **`isGF()` schließt die Projektleitung ein, `isTopLevel()` nicht.** Ersteres
  gilt für Baustellen, Planung, Material; letzteres für Geld, Rollen und
  Betriebseinstellungen.
- Die **Projektleitung** plant und führt Baustellen, sieht aber **keine**
  Rechnungen, **keine** Zeitkonten, **keine** Margen und vergibt **keine**
  Rollen.
- Die **Buchhaltung** rechnet ab und darf fremde Zeiteinträge korrigieren,
  verwaltet aber keine Baustellen.
- **Administrator anlegen oder ändern darf nur ein Administrator** — sonst
  könnte sich eine Geschäftsführung zum Superuser machen.

### Neun abschaltbare Module

`einsatzplanung` · `material` · `urlaub` · `scheine` · `angebote` ·
`rechnungen` · `nachkalkulation` (hängt an `rechnungen`) · `zeitkonten` ·
`ki` (nur mit hinterlegten Zugängen wählbar)

Geschaltet unter **Einstellungen → Module**, gespeichert in
`companies/{id}.modules`, änderbar nur durch Geschäftsführung/Administrator.

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
npm run dev          # Vite

npm run typecheck    # tsc --noEmit
npm run lint         # eslint, --max-warnings 0
npm test             # 409 Tests ohne Emulator

# Die Emulator-Tests brauchen einen laufenden Firestore-Emulator:
npx firebase emulators:start --project demo-test --only firestore
npm run rules:test   # 111 Tests gegen den Emulator
```

**Der Emulator braucht eine `--project`-Angabe**, sonst bricht er mit „No
currently active project" ab. `npm run emulators` allein genügt nicht.

**Vor jedem Commit:** `npm run typecheck && npm run lint && npm test`. Die CI
prüft dasselbe plus die Emulator-Tests und lässt ohne grünes Ergebnis nichts
live.

### Deploy

Zwei Workflows, beide auf `main`:

| Workflow | Was |
|---|---|
| `deploy.yml` | Tests → Hosting + `firestore:rules` + `firestore:indexes` |
| `deploy-functions.yml` | Cloud Functions |

Regeln und **Indizes** gehen mit dem Frontend zusammen live. Das ist wichtig:
eine neue Abfrage ohne ihren Index läuft lokal (der Emulator legt Indizes
still selbst an) und scheitert produktiv.

### Branch-Regeln

Entwickelt wird auf `claude/epic-bardeen-d6x1jc`, gemergt per PR nach `main`.
**Ist der PR eines Zweigs bereits gemergt, wird nicht darauf aufgebaut** —
dann den Zweig frisch von `main` starten (gleicher Name) und einen neuen PR
öffnen.

---

## 4. Die Fallen, die schon zugeschnappt sind

Diese Liste ist teuer bezahlt. Wer sie liest, spart sich die Wiederholung.

| Falle | Was passiert |
|---|---|
| **Der Emulator legt fehlende Indizes still selbst an.** | Lokal läuft alles, produktiv bleibt die Ansicht leer. So entstand „Kundenakte ohne Baustellen". Dagegen steht `tests/unit/indexabgleich.test.ts`, rein statisch. |
| **Ein fehlendes Dokument wird ABGELEHNT, nicht leer beantwortet.** | `ownsExisting()` liest `resource.data.companyId`; fehlt das Dokument, ist `resource` null. `getUserByUid` gibt also nicht `null` zurück — es wirft. |
| **`vi.useFakeTimers()` ohne Einschränkung friert den Firestore-Client ein.** | Alle Emulator-Tests laufen in die Zeitgrenze. Richtig: `vi.useFakeTimers({ toFake: ['Date'] })`. |
| **`canvas.width = …` löscht die Zeichenfläche.** | Die Unterschrift verschwand bei jedem Neuberechnen der Größe. `SignaturePad` sichert und stellt jetzt wieder her — und reagiert auf `ResizeObserver` statt auf `window.resize`. |
| **`catch(() => undefined)` versteckt vier Zustände hinter einem.** | „lädt", „leer", „Fehler", „fertig" sahen alle gleich aus. Deshalb `BaustellenSelect` als eigene Komponente, die nie stumm leer bleibt. |
| **Ein Cloud-Function-Aufruf ohne Frist wartet ewig.** | „Es lädt ewig" beim Handwerksschein. Jetzt eine 12-Sekunden-Frist mit Wiederholungsknopf. |
| **Dieselbe Aussage an zwei Stellen läuft auseinander.** | Wer wohin darf, stand dreimal geschrieben; an sieben Stellen widersprachen sich die Listen. Siehe §5. |
| **Firestore-Trigger laufen MINDESTENS einmal, nicht genau einmal.** | Ein `+= delta` verzählt sich beim Wiederholungslauf. Die Monatsbilanz rechnet den betroffenen Monat deshalb komplett neu. |
| **Firestore-Abfragen haben KEINE Zeitgrenze.** | Sie werfen keinen Fehler und brechen nicht ab — sie warten. Auf einer toten Verbindung wartet der Aufrufer unbegrenzt. Zweimal als Fehler gemeldet („Schein lädt ewig", „iPhone lädt gar nicht"). Dagegen steht `lib/frist.ts`. |
| **iOS friert eine Startbildschirm-App ein, statt sie neu zu laden.** | Beim Zurückkommen ist der JavaScript-Zustand noch da, die Netzverbindungen nicht. Ein Browser-Tab am Schreibtisch wird stattdessen neu geladen — deshalb sieht man es dort nie. |
| **Die Fassungsnummer eines Service Workers darf nicht aus dem Bundle kommen.** | Sie käme aus der ALTEN Fassung, der Worker meldete sich unter der alten Adresse an und erneuerte sich nie. Nur der Server weiß, ob es etwas Neues gibt — deshalb vergleicht der Worker die ausgelieferte `index.html` mit der gespeicherten. |
| **Ein Service Worker darf beendet werden, sobald er geantwortet hat.** | Ohne `event.waitUntil` bricht die Hintergrundprüfung mitten im Laden ab — auf dem Telefon also fast immer, und der Deploy fällt nie auf. |

---

## 5. Die tragenden Entscheidungen

Wer hieran etwas ändert, sollte wissen, warum es so ist.

**Die Sicherheitsgrenze steht in `firestore.rules`, nirgends sonst.**
Navigation, Wächter und Knopf-Freigaben sind Bedienführung. Jede Regel hat
einen Kommentar, der sagt, wovor sie schützt.

**Wer wohin darf, steht NUR in `src/app/navigation.ts`.** `RequireNav` liest
Rolle *und* Modul aus demselben Eintrag, aus dem auch der Reiter gebaut wird.
Vorher stand es zusätzlich als `RequireRole` an jeder Route — die Listen
liefen auseinander, und die Projektleitung sah fünf Reiter, die „Kein Zugriff"
sagten. **Nicht wieder auseinanderziehen.** Ein statischer Test wacht darüber.

**Was der Server tut, statt der Browser — und warum:**

| Cloud Function | Warum nicht im Browser |
|---|---|
| `urlaubEntscheiden` | Muss fremde Zeiteinträge lesen und schreiben. Die enthalten Krankenstände (Art. 9 DSGVO); ein Genehmigender darf sie nicht sehen. |
| `scheinVorbereiten` | Füllt den Schein aus fremden Zeiteinträgen vor — dieselbe Grenze. |
| `syncUserClaims` | Setzt `companyId` und `role` ins Auth-Token. Ohne sie hat ein neuer Benutzer keine Rechte. |
| `bilanzNachziehen` / `bilanzenNachtlauf` | Verdichtete Zeitkonten, damit der Saldo nicht die ganze Historie lädt. |
| `notifyNewOrder` / `notifyOrderReady` | Push. |
| `scheinPruefsumme` | Friert den unterschriebenen Schein ein. |
| `exportCompanyData` | Datenausleitung — **wird von der App nirgends aufgerufen** (siehe §6). |

**Nur das Ist speichern, nie den Saldo.** Der Saldo hängt an Wochenstunden,
Arbeitstagen, Eintrittsdatum und Feiertagen. Ändert die Geschäftsführung
jemandes Wochenstunden, ändert sich rückwirkend jeder Tag — ein gespeicherter
Saldo wäre ab dem Moment falsch.

**Nummernkreise nur steigend.** `counters` darf nicht gelöscht werden: ein neu
angelegter Zähler begänne wieder von vorn, und der Betrieb hätte zwei
Rechnungen mit derselben Nummer in den Büchern.

**Erklärungen hinter das „i" (`InfoHint`), Zustandsmeldungen nicht.** Was
immer gilt, klappt auf Tipp auf. Was gerade passiert oder gleich passieren
wird — eine Warnung vor doppelten Datensätzen, die Folgen eines Stornos —
bleibt sichtbar. **Eine Folge hinter einem Aufklapper ist keine Warnung.**

**Jedes Warten hat eine Grenze.** Firestore und die Cloud Functions kennen
keine; `lib/frist.ts` legt sie darum. Der Start der App weicht nach acht
Sekunden auf den Zwischenspeicher aus, statt weiter zu warten. Schreibvorgänge
sind ausgenommen — die nimmt Firestore lokal an und reicht sie nach, dort wäre
eine Frist ein Rückschritt.

**Der Service Worker fasst nur eigene Dateien an.** Firestore, Auth und die
Cloud Functions gehen unberührt durch. Eine vorgehaltene Datenbankantwort wäre
ein falscher Kontostand — und der Firestore-Client hat seinen eigenen,
richtigen Zwischenspeicher. Ein Test in `tests/unit/serviceWorker.test.ts`
lädt die echte `public/sw.js` in eine Sandbox und hält genau das fest.

---

## 6. Wo die Schwachstellen sind

Ehrlich und in der Reihenfolge, in der sie wehtun.

### Ungetestete Ansichten — die größte Lücke

**14 von 26 Ansichten haben keinen eigenen Test**, darunter die vier
wichtigsten: **Zeiterfassung** (meistbenutzt), **Rechnungen** (Geld),
**Einsatzplanung** (löscht Daten), **Baustellen**.

Und selbst wo Ansichtstests existieren, ist **jeder Datenbankzugriff ersetzt**.
Sie finden Bedienfehler, keine Datenfehler. Jeder aus dem Betrieb gemeldete
Fehler lag bisher in genau den Nähten, die diese Tests per Konstruktion nicht
sehen.

### Kein echter Browser

Kein Playwright, kein Ende-zu-Ende-Test. Zwei gemeldete Fehler wären damit
gefunden worden und sind es nicht: die Unterschrift auf dem Telefon und das
endlose Laden. Beide sind repariert, aber ungeschützt gegen Rückfall.

### Cloud Functions laufen ungetestet

Ihre Wirkung wird in den Durchstich-Tests **nachgestellt**, nicht ausgeführt.
`bilanzNachziehen` und `bilanzenNachtlauf` laufen produktiv, ohne dass ein
Test sie je gestartet hat.

### Toter oder unerreichbarer Code

| Was | Zustand |
|---|---|
| **KI-Spracherfassung** (`/voice`, `voiceExtract`) | Vollständig gebaut, als Modul aus. Ohne Schlüssel führt sie nur in eine Fehlermeldung, und Sprachaufnahmen von Mitarbeitern gingen an US-Anbieter — das braucht vorher Auftragsverarbeitungsverträge. |
| **Wiedervorlagen** (`followUps`) | Sammlung, Regeln und Abfragen existieren; geschrieben wird nur aus der KI-Erfassung. Also faktisch tot, solange die aus ist. |
| **`exportCompanyData`** | Deployed, wird nirgends aufgerufen. Eine Datenausleitung, die niemand auslösen kann. |

### Eine offene Produktfrage

Die **Nachkalkulation** ist Geschäftsführungssache, weil sie Margen zeigt. Die
**Angebote** stehen auch der Projektleitung offen — und darin steht die
Vorkalkulation mit den Kostensätzen, also die Marge des einzelnen Auftrags.
Entweder ist die eine Grenze zu eng oder die andere zu weit. **Das ist keine
Programmierfrage:** sie hängt daran, ob die Projektleitung im Betrieb
mitkalkulieren soll. Muss der Auftraggeber entscheiden.

### Skalierbarkeit: die eine verbleibende Ausnahme

Jede Abfrage ist begrenzt, aber der Projekt-Radar lädt für **eine** lange
laufende Baustelle weiterhin deren gesamte Stundenhistorie. Bei der Messung
lagen alle 15.660 Einträge auf einer aktiven Baustelle — dort brachte die
Begrenzung nichts. Unrealistisch, aber es zeigt, wo die Lösung endet.

### Kein zweiter Datenstandort

Alles liegt bei Google. Es gibt **keine** automatische Ausleitung an einen
zweiten Ort. Fällt das Projekt aus oder wird der Zugang gesperrt, sind die
Daten des Betriebs nicht greifbar. Das ist die einzige Lücke auf dieser Liste,
die nicht nur die App betrifft, sondern den Betrieb.

---

## 7. Nächste Schritte

In dieser Reihenfolge, mit Begründung.

1. **Ansichtstests für die vier ungetesteten Kernansichten** — Zeiterfassung,
   Rechnungen, Einsatzplanung, Baustellen. Größte Lücke, klarster Nutzen.
2. **Nächtliche Ausleitung aller Daten an einen zweiten Ort.** Technisch
   klein (`exportCompanyData` existiert bereits und braucht einen Aufrufer),
   in der Wirkung das Wichtigste auf dieser Liste. Steht seit Längerem an.
3. **Ende-zu-Ende-Test mit echtem Browser** für die zwei Wege, die schon
   einmal am Telefon gebrochen sind: Schein unterschreiben, Zeit buchen.
4. **Handwerksschein Stufen 2–4** — Fotos, Versand an den Kunden, Verbindung
   zur Rechnung. Der Fahrplan steht in `ROADMAP.md`.
5. **Wartungsverträge und wiederkehrende Termine.** Die jährliche
   Thermenwartung ist planbare Auslastung — betriebswirtschaftlich der
   nächstgrößte Hebel.
6. **Prüfungen gegen das Arbeitszeitgesetz** (Höchstarbeitszeit, Ruhezeiten).
   Bei Notdiensten über Mitternacht kein akademischer Punkt.
7. Kleineres, aufgeschoben: halbe Urlaubstage, Urlaubsübertrag ins Folgejahr,
   Meldung an den Antragsteller bei einer Urlaubsentscheidung, Fahrzeug- und
   Werkzeugverwaltung.

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
  Schmuck: mehrere Regeln in `firestore.rules` sehen ohne den Kommentar
  willkürlich aus.
- **Deutsche Bezeichner in neuem Code**, wo sie den Fachbegriff treffen
  (`urlaubsTage`, `aktiveModule`, `zieheMit`). Älterer Code ist gemischt; das
  ist kein Grund, ihn anzufassen.
- **Ein Test, der eine Funktion prüft, die niemand aufruft, prüft nichts.**
  `canAccess()` war so ein Fall und ist es nicht mehr.
