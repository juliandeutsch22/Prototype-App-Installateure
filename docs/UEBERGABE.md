# Übergabe

Stand: 02.09.2026.

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
  erzwingt außerdem, dass dort jede Abfrage eine **Grenze** hat. Das ist
  bewusst weiter gefasst als `limit()`: ein Zeitraum oder ein Gleichheitsfilter
  auf eine von Natur aus kleine Menge zählt auch. Wer die Regel für „überall
  ein `limit()`" hält, hält die Bremse für dichter, als sie ist — durch genau
  diese Öffnung passt der Projekt-Radar, siehe §6.
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
npm test             # 590 Tests ohne Emulator

# Die Emulator-Tests brauchen einen laufenden Firestore-Emulator:
npx firebase emulators:start --project demo-test --only firestore
npm run rules:test   # 148 Tests gegen den Emulator
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
| **Die alten Bausteine wegzuwerfen, sobald ein Deploy erkannt wird, bricht die laufende Seite.** | Sie ist noch die alte und fordert die alten Namen an — im Speicher gelöscht, auf dem Server nach dem Deploy nicht mehr vorhanden. Seit dem Code-Splitting lädt jede Ansicht erst beim Öffnen nach; wer auf „Später" tippt, bekommt danach eine Fehlermeldung statt der Ansicht. Aufgeräumt wird beim Übernehmen. |
| **Es gibt keinen 404 für eine fehlende Datei.** | Der Hosting-Rewrite `"source": "**"` schickt JEDE unbekannte Adresse auf `index.html` — Status 200, `text/html`. Eine Bausteindatei, die es nach einem Deploy nicht mehr gibt, sieht damit aus wie ein Erfolg. Der Service Worker hat die Startseite daraufhin unter dem Namen der JavaScript-Datei gespeichert, und der Fehler blieb stehen. Gemeldet als „'text/html' is not a valid JavaScript MIME type". |
| **Eine Fehlererkennung nach Wortlaut ist immer zu kurz.** | Dieselbe Meldung heißt in Safari, Chrome und Firefox anders. Die erste Fassung der Nachlade-Erkennung traf die Safari-Formulierung nicht — die Selbstheilung lief deshalb nicht an, und der Monteur bekam die Tafel mit dem Knopf, der nicht wirken kann. Erkennung UND ein sauberer Fehlschlag aus dem Worker, nicht eines von beiden. |
| **Ein Firestore-Schnappschuss kommt zweimal.** | Einmal sofort aus dem lokalen Zwischenspeicher, einmal nach der Bestätigung des Servers — mit gleichem Inhalt, aber neuem Array. Ein Effekt, der an der Array-Identität hängt, rechnet damit alles doppelt. |
| **„Erneut versuchen" kann einen Nachladefehler nicht heilen.** | React merkt sich das abgelehnte Versprechen eines `lazy`-Imports und scheitert sofort wieder, ohne das Netz zu fragen. Nur ein echtes Neuladen hilft — die Fehlergrenze tut das jetzt selbst. |
| **`where('feld', '!=', wert)` überspringt Dokumente OHNE das Feld.** | Der nächtliche Bilanzlauf fragte `where('active', '!=', false)` und übersprang damit stillschweigend jeden übernommenen Altbestand ohne `active`. Überall sonst heißt „kein Feld" aktiv. Filtern gehört in diesem Fall in den Code, nicht in die Abfrage. |
| **Ein Pfadfilter im Workflow ist eine Aussage über Abhängigkeiten.** | `deploy-functions.yml` hörte nur auf `functions/**`. `shared/` wird beim Bauen dorthin kopiert, liegt aber daneben — eine Änderung ging damit ins Hosting und nicht in die Functions. |
| **Ein `pointercancel` beendet die Zeigerspur endgültig, die Berührungsspur läuft weiter.** | Beansprucht der Browser die Geste für sich, kommt kein `pointermove` mehr — die Unterschrift blieb ein Punkt. In derselben Geste kamen noch neun `touchmove` an. Wer mit dem Finger zeichnet, gehört deshalb an `touchstart`/`touchmove`, nicht an die Zeigerereignisse. Nachgemessen in einem echten Browser: 8285 gezeichnete Pixel ungestört, 36 nach dem Abbruch. |
| **React meldet Berührungsereignisse an der Wurzel als PASSIV an.** | In einem passiven Listener ist `preventDefault()` wirkungslos, und ohne das scrollt die Seite unter dem Finger weg, statt dass er zeichnet. Wer eine Berührung abfangen muss, hängt den Listener nativ ans Element mit `{ passive: false }` — nicht über `onTouchStart`. |
| **`setPointerCapture` ist auf WebKit keine Hilfe, sondern ein Verdächtiger.** | Es sollte den Strich über den Feldrand halten. Dieselbe Aufgabe erledigen Listener am FENSTER, solange ein Strich läuft — ohne die Nebenwirkung. |
| **Ein Probestand ohne die echte CSS misst den eigenen Aufbau, nicht die App.** | Der erste Messlauf zeigte den Fehler sofort — aber nur, weil die Stylesheets 404 gaben und damit `touch-action: none` fehlte. Mit geladener CSS lief alles. Erst danach war die Messung etwas wert. Genauso: Vite liefert aus dem Zwischenspeicher, ein Wechsel der Fassung auf der Platte kommt ohne Neustart NICHT im Browser an — zwei Läufe lieferten deshalb identische Zahlen für zwei verschiedene Stände. |
| **„Der Eigentümer darf seinen eigenen Beleg ändern" ist keine Grenze, solange nicht dabeisteht: WELCHES FELD.** | `isBilled` und `invoiceNumber` entscheiden, ob eine Stunde je auf eine Rechnung kommt. Der Eigentümer konnte sie an seinem eigenen Zeiteintrag setzen und damit seine Arbeitszeit aus der Verrechnung nehmen — ohne Fehlermeldung, und die Zeile steht im Zeitkonto ganz normal weiter. Wo eine Rolle ein Dokument nur teilweise bearbeiten darf, gehört die Feldliste in die Regel. |
| **Ein Test, der prüft, dass etwas VERBOTEN ist, ist erst die halbe Miete.** | Zu jedem neuen Riegel gehört die Gegenprobe, dass die echten Arbeitswege weiter durchgehen. Beim Materialstamm fehlte sie, und ein Knopf tat drei Wochen lang nichts. Beim Verrechnet-Kennzeichen waren es vier Verbots- und **sieben** Gegenprobe-Tests — und zwei davon schlugen sofort fehl (falsche Benutzerkennung im Testdatensatz). Ohne sie hätte ich es nicht gemerkt. |
| **Eine Regel einzugrenzen heißt, jeden Schreibweg zu kennen — auch die unsichtbaren.** | Der Materialstamm wurde auf Verwaltung und Leitung eingegrenzt, mit der Begründung, gebucht werde ohnehin nur unter „Material → Lager". Falsch: der Monteur bewegt den Bestand beim Abholen und bei jeder Retoure, aus einer Transaktion heraus, die Anforderung UND Bestand zusammen schreibt. Der Bestandsteil scheiterte, also scheiterte alles — der Knopf tat nichts, ohne Meldung. Wo eine Rolle nur EIN Feld bewegen darf, ist `hasOnly(['feld'])` die Grenze, nicht die Rolle. |
| **Ein grüner Regeltest kann den Irrtum mitschreiben, den er prüfen sollte.** | Zur Regel oben gehörte ein Test „der Monteur ändert den Bestand nicht". Er war grün und hat die falsche Annahme drei Wochen festgehalten. Ein Regeltest ist erst dann etwas wert, wenn die Annahme dahinter am ABLAUF geprüft wurde — nicht am Kommentar über der Regel. |
| **Zwei Schreibvorgänge hintereinander sind kein Vorgang.** | Die Retoure schrieb erst den Beleg, dann die Gutschrift. Scheiterte die zweite, stand der Beleg da (mit `processed: true`) und der Bestand war nicht erhöht — die Meldung „konnte nicht erfasst werden" war eine Lüge, und der zweite Versuch legte einen zweiten Beleg an. Was zusammengehört, gehört in EINE Transaktion. |
| **Ein Bestätigungsdialog ohne `confirmLabel` sagt „Löschen".** | Zweimal aufgetreten: unter „Material abgeholt?" und unter „Benutzer deaktivieren?" stand je ein roter Löschen-Knopf — bei der Benutzerverwaltung in einer Ansicht, die per Entscheidung NIE etwas löscht. Wer das liest, tippt nicht darauf und meldet, die Aktion lasse sich nicht bestätigen. Bei jedem `ConfirmDialog` gehört `confirmLabel` gesetzt. |
| **`Number(x) \|\| VORGABE` verschluckt die eingetragene Null.** | In JavaScript ist die Null unwahr. Wer null Wochenstunden einträgt, bekam vierzig — und danach rund 170 Minusstunden im Monat, auf dem Lohnzettel. Der Rückfall darf nur bei LEERER oder unbrauchbarer Eingabe greifen, denn leer heißt „nicht entschieden", null heißt „null". |
| **Ein deaktiviertes Konto war nur im Browser deaktiviert.** | `firestore.rules` kannte `active` nicht, und `syncUserClaims` setzte die Claims unabhängig davon. Wer ausschied, behielt ein gültiges Konto und kam am UI vorbei an alles. Die Prüfung steht jetzt in `signedIn()`, plus gesperrtes Auth-Konto und widerrufene Token. |

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
| `exportCompanyData` | Auskunft nach Art. 15 DSGVO: der ganze Bestand als Datei. Liest den Mandanten seitenweise; die Antwort ist bei 10 MB gedeckelt, deshalb ist sie NICHT die Sicherung. |
| `datenAusleitung` / `datenAusleitungJetzt` | Die Sicherung: schreibt jede Nacht um 02:30 den Bestand jedes Mandanten zeilenweise weg und räumt alte Stände auf. Von Hand anstoßbar, damit sich überhaupt prüfen lässt, ob sie läuft. |

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

**Zugang endet serverseitig, nicht in der Oberfläche.** `active` steht als
Claim im Token und wird in `signedIn()` geprüft — also unter jeder Regel
dieser Datei, damit eine neue Sammlung die Sperre nicht vergessen kann. Dazu
sperrt `syncUserClaims` das Auth-Konto und widerruft die Token. Drei Riegel,
weil jeder für sich eine Lücke lässt: die Kontosperre wirkt erst beim nächsten
Anmelden, ein ausgestelltes Token liefe bis zu einer Stunde weiter, und der
Claim greift auch dort. **Fehlt der Claim, gilt aktiv** — bestehende Token
tragen ihn nicht, und ein Deploy darf nicht den ganzen Betrieb aussperren.

**Der Service Worker fasst nur eigene Dateien an.** Firestore, Auth und die
Cloud Functions gehen unberührt durch. Eine vorgehaltene Datenbankantwort wäre
ein falscher Kontostand — und der Firestore-Client hat seinen eigenen,
richtigen Zwischenspeicher. Ein Test in `tests/unit/serviceWorker.test.ts`
lädt die echte `public/sw.js` in eine Sandbox und hält genau das fest.

---

## 6. Wo die Schwachstellen sind

Ehrlich und in der Reihenfolge, in der sie wehtun.

### Ungetestete Ansichten — kleiner geworden, nicht weg

Die vier wichtigsten sind seit dem 02.09.2026 abgedeckt: **Zeiterfassung**
(meistbenutzt), **Rechnungen** (Geld), **Einsatzplanung** (löscht Daten),
**Baustellen**. Danach der **Materialablauf** als ganzer Weg — anfordern,
bearbeiten, Bestand führen — und die **Benutzerverwaltung**. Bleiben
**6 von 27** ohne eigenen Test — die kleineren.

Der Materialablauf ist bewusst als ABLAUF geprüft worden und nicht Ansicht für
Ansicht, und das hat sich sofort ausgezahlt: der Fehler, den er zutage
gefördert hat, lag in keiner der drei Ansichten, sondern in der Regel darunter.
Wer eine Ansicht allein prüft, sieht so etwas nie.

**Die Einschränkung gilt unverändert:** in jedem dieser Tests ist jeder
Datenbankzugriff ersetzt. Sie finden Bedienfehler und falsche Verdrahtung,
keine Datenfehler. Jeder aus dem Betrieb gemeldete Fehler lag bisher in genau
den Nähten, die sie per Konstruktion nicht sehen — dafür sind die
Emulator-Tests da, und für den Rest fehlt weiterhin ein echter Browser.

### Kein echter Browser in der CI — und was das dreimal gekostet hat

Kein Playwright, kein Ende-zu-Ende-Test **im Testlauf**. Drei gemeldete Fehler
wären damit gefunden worden und sind es nicht: die Unterschrift auf dem
Telefon (dreimal gemeldet), das endlose Laden, der weiße Bildschirm nach einem
Deploy. Alle repariert, alle ungeschützt gegen Rückfall.

**Das Unterschriftsfeld ist der Beleg dafür, dass hier eine echte Lücke ist.**
Es wurde zweimal „repariert" und war zweimal weiter kaputt, weil jeder
Ansichtstest den Eingabeweg nur nachstellt: jsdom kennt kein `pointercancel`,
das eine echte Geste abräumt, und `setPointerCapture` ist dort eine Attrappe,
die nie etwas auslöst. Erst als die Komponente in einem echten Browser mit
echter Fingereingabe lief, war die Ursache in zehn Minuten sichtbar.

**Wie es gemessen wurde**, falls es jemand wiederholen muss: eine kleine
Seite, die nur diese eine Komponente rendert, über den Vite-Dev-Server; dazu
`playwright-core` gegen das vorhandene Chromium und `Input.dispatchTouchEvent`
über das CDP für echte Berührungen. Das ist keine halbe Stunde Arbeit. **Zwei
Fallstricke dabei**, beide selbst hineingetappt: ohne die echte CSS fehlt
`touch-action: none` und man misst seinen eigenen Aufbau statt der App; und
Vite liefert aus dem Zwischenspeicher — ohne Neustart zeigen zwei Läufe für
zwei verschiedene Codestände dieselben Zahlen.

*Bleibt trotzdem offen:* Chromium ist nicht Safari. Der Mechanismus ist
nachgewiesen, die Bestätigung auf einem iPhone steht aus.

### Cloud Functions laufen ungetestet

Ihre Wirkung wird in den Durchstich-Tests **nachgestellt**, nicht ausgeführt.
`bilanzNachziehen` und `bilanzenNachtlauf` laufen produktiv, ohne dass ein
Test sie je gestartet hat.

### Toter oder unerreichbarer Code

| Was | Zustand |
|---|---|
| **KI-Spracherfassung** (`/voice`, `voiceExtract`) | Vollständig gebaut, als Modul aus. Ohne Schlüssel führt sie nur in eine Fehlermeldung, und Sprachaufnahmen von Mitarbeitern gingen an US-Anbieter — das braucht vorher Auftragsverarbeitungsverträge. |
| **Wiedervorlagen** (`followUps`) | Sammlung, Regeln und Abfragen existieren; geschrieben wird nur aus der KI-Erfassung. Also faktisch tot, solange die aus ist. |
| **`exportCompanyData`** | Nicht mehr tot: vollständig und unter Einstellungen → Datensicherung erreichbar. |

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

### Der zweite Datenstandort ist erst zur Hälfte gewonnen

Seit dem 02.09.2026 schreibt `datenAusleitung` jede Nacht den kompletten
Bestand jedes Mandanten weg — zeilenweise, mit Aufbewahrung, von Hand
anstoßbar. Gegen einen Fehlgriff, eine kaputte Migration oder eine
versehentlich geleerte Sammlung hilft das ab sofort.

**Gegen den Fall, um den es eigentlich ging, noch nicht.** Ohne die
Repository-Variable `AUSLEITUNG_BUCKET` landet der Stand im Standard-Bucket
DESSELBEN Google-Projekts. Fällt das Projekt aus oder wird der Zugang
gesperrt, ist die Sicherung genauso weg wie die Daten. Der Handgriff dagegen
ist klein und steht in `DEPLOYMENT.md`; er braucht eine Entscheidung darüber,
wohin — und ein Konto dort.

Ungetestet ist der Lauf selbst: geprüft sind die Entscheidungen (welcher Pfad,
was darf gelöscht werden, wie sieht eine Zeile aus), nicht das Lesen und
Schreiben. Wie bei allen Cloud Functions.

---

## 7. Nächste Schritte

In dieser Reihenfolge, mit Begründung.

1. **Ende-zu-Ende-Test mit echtem Browser** für die zwei Wege, die schon
   einmal am Telefon gebrochen sind: Schein unterschreiben, Zeit buchen. Seit
   die vier Kernansichten Tests haben (02.09.2026), ist das die größte
   verbliebene Lücke — und die einzige, die die Unterschrift auf dem Telefon
   je abdecken kann.
2. **`AUSLEITUNG_BUCKET` auf einen Speicherort ausserhalb dieses Projekts
   setzen.** Der nächtliche Lauf existiert seit dem 02.09.2026 und
   funktioniert; er schreibt nur noch an die falsche Stelle, nämlich in
   dasselbe Google-Projekt. Kein Programmieraufwand mehr, sondern eine
   Entscheidung plus ein Konto. Siehe §6.
3. **Ansichtstests für die verbliebenen zehn Ansichten** — deutlich kleinere
   Stücke als die vier Kernansichten, und mit denen als Vorlage schnell
   geschrieben.
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
