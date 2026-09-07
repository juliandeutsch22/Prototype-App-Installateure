# Funktionsübersicht

Stand: 02.09.2026.

**Wofür dieses Dokument da ist.** Die Roadmap ist inzwischen ein
Änderungsprotokoll: sie erzählt, was wann warum gebaut wurde, und sie ist
dafür auch richtig. Was sie nicht mehr beantwortet, ist die Frage, mit der man
vor der App sitzt — *was gibt es, wer darf was, und worauf kann ich mich
verlassen?* Diese Datei beantwortet genau das, und zwar auch da, wo die
Antwort unangenehm ist.

Eine Zeile je Bereich. Die Spalte **Geprüft wodurch** ist die wichtigste; sie
unterscheidet drei Stufen:

| Stufe | Was sie wert ist |
|---|---|
| **Emulator** | Läuft gegen einen echten Firestore. Prüft Regeln, Indizes, tatsächliches Verhalten. Belastbar. |
| **Rechnung** | Reine Funktionstests der Formeln. Sagen, dass die Mathematik stimmt — nicht, dass die App läuft. |
| **Ansicht** | Rendern und Klicken, **aber jeder Datenbankzugriff ist ersetzt**. Findet Bedienfehler, keine Datenfehler. |
| **—** | Nicht automatisch geprüft. |

---

## Außendienst

| Bereich | Was es tut | Wer darf | Daten | Geprüft wodurch | Bekannte Lücke |
|---|---|---|---|---|---|
| **Zeiterfassung** | Tag buchen: Status, Von–Bis, Pause, Baustelle, Zuschläge. Schlank für das Büro, voll für den Monteur. | alle (eigene); Buchhaltung/GF auch fremde | `timeEntries` | Rechnung (44), Emulator (Rechte), Ansicht (8) | Der Ansichtstest prüft die Verdrahtung — welcher Weg zum Saldo, verrechnete Einträge gesperrt —, nicht das Formular |
| **Mein Einsatzplan** | Monatskalender der eigenen Einsätze, Kontaktdaten, Sprung zu Zeit und Schein | Mitarbeiter | `assignments`, `projects`, `vacations` | — | Ansicht ungetestet |
| **Meine Baustellen** | Die Baustellen, denen der Monteur zugeordnet ist | Mitarbeiter | `projects` | — | Ansicht ungetestet |
| **Material anfordern** | Warenkorb, Eilzustellung, eigene Anforderungen | Mitarbeiter, Verwaltung, Leitung | `materials`, `materialOrders` | Rechnung (25, Meldungen) | Ansicht ungetestet; Lagerabzug nur im Code geprüft |
| **Urlaub** | Beantragen, entscheiden, Stand sehen. Genehmigung schreibt die Tage ins Zeitkonto. | alle (Antrag); Entscheider laut Einstellung | `vacations`, `timeEntries`, `companies` | Emulator (18), Rechnung (15), Ansicht (11) | Kein Durchstich: dass die Tage *wirklich* im Zeitkonto landen, prüft kein Test |
| **Handwerksscheine** | Zeiten vorausfüllen, Material von Hand erfassen, als Entwurf sichern und wieder öffnen, Entwurf verwerfen und zurückholen, unterschreiben, einfrieren, Storno mit Grund, PDF | Mitarbeiter, Büro, Leitung | `workSheets`, `timeEntries` (serverseitig) | Emulator (Regeln + 3 Durchstiche + 9 Zustandsübergänge), Rechnung (4), Ansicht (22), Liste (14), PDF-Zustand (3), Nutzlast (3) | ein verworfener Entwurf bleibt in der Datenbank — gelöscht wird kein Schein (`allow delete: if false`), das schützt den unterschriebenen Beleg |

## Verwaltung

| Bereich | Was es tut | Wer darf | Daten | Geprüft wodurch | Bekannte Lücke |
|---|---|---|---|---|---|
| **Kunden** | Stammdaten, Dublettenschutz, Akte mit Baustellen und Angeboten, Übernahme der Altbestände | Buchhaltung, Verwaltung, Leitung | `customers`, `projects`, `quotes` | Emulator (Regeln), Ansicht (8) | Umbenennen zieht Baustellen nach — ungetestet |
| **Angebote** | Positionen kalkulieren, Arbeitszeit getrennt ausweisen, beim Annehmen Baustelle mit Stundenbudget anlegen | Buchhaltung, Leitung | `quotes`, `projects`, `counters` | Ansicht (3), Emulator (Zähler: steigend, Neubeginn nur zum Jahreswechsel) | — |
| **Baustellen** | Anlegen, Kunde zuordnen, Team und Projektleitung, Stundenbudget | Leitung | `projects` | Ansicht (6) | Der Kundenname kommt aus dem Stammsatz; leeres Stundenbudget bleibt leer statt 0 |
| **Anforderungen** | Eingehende Materialanforderungen bearbeiten, Status setzen | Verwaltung, Leitung | `materialOrders` | Rechnung (Meldungen) | Ansicht ungetestet |
| **Lager** | Bestand, Mindestmenge, Katalogpflege | Verwaltung, Leitung | `materials` | Emulator (3: wer pflegen darf) | Ansicht ungetestet; Bestandsabzug per Transaktion ungetestet |
| **Einsatzplanung** | Kalender, Mitarbeiter je Tag und Baustelle, Urlaubswarnung | Leitung | `assignments`, `vacations` | Emulator (4: wer planen darf), Ansicht (8) | Geprüft ist auch der gefährliche Teil: eine vorhandene Planung kommt ins Formular, statt beim Speichern gelöscht zu werden |
| **Benutzerverwaltung** | Anlegen, Rollen, Wochenstunden, Arbeitstage, Eintritt | Leitung (Admins nur durch Admins) | `users` | Emulator (Rollenhierarchie) | Ansicht ungetestet |
| **Einstellungen** | Verrechnungs- und Kostensätze, Urlaubs-Genehmigende, Monatsbilanzen aufbauen | Leitung; Genehmigende nur GF/Admin | `companies` | Emulator (8) | Ansicht ungetestet |
| **Module** | Bereiche für den Betrieb ein- und ausschalten; zeigt vorher, was mit abgeschaltet wird | **nur Administration** | `companies.modules` | Rechnung (15), Emulator (8) | Ansicht ungetestet. Enger als der Rest der Einstellungen: ein abgeschaltetes Modul nimmt allen den Weg zu ihrer Arbeit, und zwar unsichtbar — das ist Einrichtung, keine Führung |
| **Datensicherung** | Nächtliche Ausleitung des ganzen Bestands an einen zweiten Ort; Sicherung von Hand anstoßen; Bestand herunterladen (DSGVO); **Zustand des letzten Laufs** | **nur GF/Admin** | alle Sammlungen, `systemLaeufe` | Rechnung (23 Aufräum-, Pfad- und Fristregeln), Ansicht (11), Function (24), Emulator (6) | Ohne `AUSLEITUNG_BUCKET` liegt die Sicherung im selben Google-Projekt — gegen einen Fehlgriff hilft das, gegen „der Zugang ist weg" nicht |

## Büro und Auswertung

| Bereich | Was es tut | Wer darf | Daten | Geprüft wodurch | Bekannte Lücke |
|---|---|---|---|---|---|
| **Rechnungen** | Aus Baustelle zusammenstellen — Stunden UND Material aus den unterschriebenen Handwerksscheinen —, Leistungszeitraum, Bauleistung mit Übergang der Steuerschuld (§ 19 Abs 1a UStG), Nummernkreis, Status, PDF, Buchhaltungs-Export mit Lückenprüfung | Buchhaltung, Leitung | `invoices`, `counters`, `timeEntries`, `workSheets`, `materials` | Rechnung (86), Emulator (Zähler, Löschen nur beim Storno), Ansicht (21), Beleg (9) | Geprüft ist die Reihenfolge — Nummer ziehen, Belege sperren, dann anlegen. Material ohne Preis im Katalog steht mit 0,00 € da und wird ausgewiesen: eine erfundene Zahl wäre schlimmer als eine sichtbare Lücke |
| **Mitarbeiterübersicht** | Zeitkonten, Salden, Monats- und Mitarbeiterexport, Stundennachweis | Buchhaltung, GF, Admin (**nicht** Projektleitung) | `timeEntries`, `monthlyStats` | Rechnung (20), Ansicht (4) | Zusammenspiel Bilanz ↔ Rohdaten ungetestet |
| **Nachkalkulation** | Erlös gegen Personalkosten je Baustelle, Deckungsbeitrag | GF, Admin | `projects`, `timeEntries`, `invoices`, `quotes` | Rechnung (9) | Ansicht ungetestet |

## Grundlagen

| Bereich | Was es tut | Geprüft wodurch | Bekannte Lücke |
|---|---|---|---|
| **Mandantentrennung** | Jede Abfrage auf `companyId`, serverseitig erzwungen | Emulator (59 Regeltests) | — |
| **Deaktivierte Konten** | Gesperrtes Auth-Konto, widerrufene Token und `active` als Claim in `signedIn()` — also unter jeder Regel | Emulator (5) | Ein bereits ausgestelltes Token bleibt bis zum Widerruf gültig; der Widerruf läuft in der Function, nicht im Browser |
| **Wachstumsbremse** | Test verbietet jede Abfrage ohne Grenze in `lib/db` | Rechnung (40) | Prüft die Form der Abfrage, nicht ihre Laufzeit |
| **Module** | Umfangsentscheidung des Betriebs: was ausgeschaltet ist, verschwindet aus Navigation, Startseite, Querverweisen **und** aus der Adresszeile | Rechnung (14), Emulator (7) | **Keine Sicherheitsgrenze.** Wer die Rolle hat, dürfte die Daten ohnehin — ein Modul nimmt nur den Weg weg, nicht das Recht. Die Regeln bleiben die einzige Grenze. |
| **Navigation** | Wer wohin darf, steht **nur** in `navigation.ts`; `RequireNav` liest Rolle und Modul aus demselben Eintrag, aus dem der Reiter gebaut wird | Statisch (29), Ansicht (5) | — |
| **Monatsbilanzen** | Verdichtete Zeitkonten, Trigger + Nachtlauf + Neuaufbau | Rechnung (8) | Trigger und Nachtlauf laufen ungetestet in Produktion |
| **Offline-Betrieb** | Lokaler Zwischenspeicher, Hinweis beim Speichern ohne Verbindung | Rechnung (7) | Kein Test mit tatsächlich unterbrochener Verbindung |
| **Startgeschwindigkeit** | Ansichten einzeln nachladbar, Service Worker hält die App-Hülle vor, Frist auf jedem Start-Zugriff | Rechnung (27: Frist, Service Worker und Fehlergrenze gegen den echten Quelltext) | **Auf keinem echten iPhone gemessen** — die Ursachen sind aus dem Code belegt, die Wirkung ist es nicht |
| **Fassungswechsel** | Der Worker behält die alten Bausteine, bis die neue Fassung übernommen wird; ein fehlgeschlagenes Nachladen lädt einmal von selbst neu | Rechnung (11 Sandbox + 9 Fehlergrenze) | Nicht auf einem echten Gerät über einen echten Deploy gefahren |
| **Meldungen (Push)** | Wer wird wann benachrichtigt | Rechnung (25) | Zustellung selbst ungetestet |

## Abgeschaltet oder ohne Weg dorthin

| Was | Zustand |
|---|---|
| **KI-Spracherfassung** (`/voice`, `voiceExtract`) | Vollständig gebaut, **aus** — jetzt als Modul, das ohne `VITE_ENABLE_VOICE` gar nicht erst einschaltbar ist. Grund: ohne Schlüssel führt der Knopf nur in eine Fehlermeldung, und Sprachaufnahmen von Mitarbeitern gehen an US-Anbieter — das braucht vorher Auftragsverarbeitungsverträge. Ein Schalter, den man umlegen kann, ohne dass etwas passiert, wäre schlimmer als keiner: deshalb steht er im Modulpanel sichtbar, aber gesperrt, mit dem Grund daneben. |
| **Wiedervorlagen** (`followUps`) | Sammlung, Regeln und Abfragen existieren, geschrieben wird nur aus der KI-Erfassung. Also faktisch **tot**, solange die aus ist. |
| **`exportCompanyData`** | Nicht mehr hier: die Function führt alle sechzehn Sammlungen (vorher neun) und ist unter **Einstellungen → Datensicherung** erreichbar. Ein statischer Abgleich gegen `firestore.rules` meldet jede vergessene Sammlung. |

---

## Die ehrliche Bilanz zur Prüftiefe

1000 automatische Tests klingen nach viel. Aufgeschlüsselt:

| Art | Anzahl | Aussagekraft |
|---|---|---|
| Regeltests gegen den Emulator | 187 | Hoch — echtes Verhalten (inkl. Abfrage-Smoketest und Durchstich) |
| **Cloud Functions mit ersetztem Firestore** | **98** | **Hoch für die Entscheidungen — der ECHTE Handler läuft, nur die Aussenwelt ist nachgebaut** |
| **Statischer Abgleich** (Indizes, Navigation ↔ Routen, Exportumfang) | **91** | **Hoch — fängt Widersprüche zwischen Listen, die dasselbe behaupten** |
| Reine Rechnung | 289 | Hoch für die Formeln, **null** für die App |
| Ansichten, Datenbank ersetzt | 226 | Findet Bedienfehler, **keine** Datenfehler |
| **Service Worker in einer Sandbox** | **12** | **Hoch — der echte Quelltext, nicht ein Nachbau** |

**Zu den Function-Tests, weil „ersetzter Firestore" nach Nachbau klingt.**
Getestet wird der unveränderte Handler; untergeschoben ist nur, was ihn
umgibt. Möglich wurde das über `resolve.alias` in `vitest.config.ts` — an
`functions/src/` ist für diese Tests KEINE Zeile geändert worden. Was der
Ersatz nicht kann: Indizes, Nebenläufigkeit, Regeln. Die Regeln prüft der
Emulatorlauf; die anderen beiden bleiben offen und stehen unten.

**Die Nachtläufe melden sich seit dem 07.09.2026.** Ausleitung (02:30) und
Bilanzlauf (03:15) halten fest, ob sie durchgegangen sind; bleibt der letzte
Erfolg zwei Nächte aus, steht das auf der Startseite der Leitung. Es war der
einzige Mangel dieser App, bei dem der Schaden mit der Zeit WÄCHST statt
aufzufallen: die Sicherung konnte wochenlang ausfallen, und bemerkt hätte man
es an dem Tag, an dem man sie braucht.

> **„Unbekannt" ist nicht „gut".** Ein Betrieb ohne Aufzeichnung sieht in den
> Daten genauso aus wie einer, bei dem nie etwas lief — und beides heisst: es
> gibt keine Sicherung, von der jemand weiss. Beide Fälle melden sich.
>
> Geschrieben wird der Zustand **ausschliesslich vom Server**
> (`allow write: if false`). Eine Überwachung, die der Überwachte selbst
> beschreiben kann, überwacht nichts.

**Reverse Charge seit dem 07.09.2026.** Erbringt der Betrieb eine Bauleistung
an einen anderen Bauunternehmer — als Subunternehmer —, geht die
Umsatzsteuerschuld auf den Empfänger über (§ 19 Abs 1a UStG). Ein Haken je
RECHNUNG, nicht am Kunden: derselbe Baumeister kann ein Werkzeug kaufen (20 %)
und eine Installation beauftragen (Übergang). Ohne die UID des Empfängers
lässt sich die Rechnung nicht anlegen — ohne sie ist der Übergang nicht
belegt.

> **Vorgefunden wurde eine Falle, und zwar ZWEIMAL:** im USt-Feld stand
> „0 % (Reverse Charge)" — einmal in den Einstellungen, einmal in einer
> zweiten Fassung desselben Formulars in der Rechnungsansicht. Das setzte nur
> den Satz auf null; weder der Pflichthinweis noch die UID kamen auf den
> Beleg, und als Vorgabe hätte es für JEDE Rechnung gegolten, auch die an
> Privatkunden.
>
> Beim Beheben ist mir die zweite Stelle durchgegangen — aufgefallen ist es
> erst beim Durchsuchen des ausgelieferten Bundles. Dagegen hilft kein
> Ansichtstest, sondern ein statischer Abgleich über ALLE Dateien
> (`tests/unit/reverseChargeKeinSatz.test.ts`), dasselbe Muster wie bei
> Navigation ↔ Routen.

**Die Rechnung schliesst den Kreis erst seit dem 07.09.2026.** Bis dahin
verrechnete diese App ausschliesslich STUNDEN — bei einem Installateur schnell
die halbe Rechnungssumme, die das Büro von Hand nachtippte. Und der
Leistungszeitraum, Pflichtangabe nach § 11 Abs 1 Z 4 UStG, fehlte auf jedem
Beleg. Beides ist jetzt vorbereitet und beides bleibt änderbar: Material aus
den unterschriebenen Scheinen lässt sich in der Vorschau bearbeiten und
entfernen, der Zeitraum ist vorbelegt und überschreibbar.

> **Was ein Automatismus hier NICHT heissen darf.** Eine Rechnung ist selten
> genau das, was die Belege hergeben — eine Anfahrt kommt dazu, eine Stunde
> wird erlassen, ein Pauschalposten ersetzt drei Zeilen. Wer das nicht in der
> App tun kann, tut es danach in Word, und dann stimmt die Rechnung im System
> nicht mehr mit der überein, die der Kunde bekommen hat.

**Und die echten Firebase-Typen?** Die prüft seit dem 06.09.2026 ein eigener
Lauf (`functions-pruefen.yml`) mit `functions/tsconfig.json` — auch auf Pull
Requests. Vorher wurden die Functions ausschliesslich beim DEPLOY übersetzt,
und der läuft nur auf `main`: ein Typfehler in einem Handler kam erst nach dem
Merge zum Vorschein, im selben Lauf, der ihn ausliefern sollte. Getrennt vom
Hosting bleibt er, weil eine kaputte Abhängigkeit der Functions keine
Auslieferung der Oberfläche blockieren darf.

Abgedeckt sind damit: Urlaubsentscheidung (24), Monatsbilanzen (15), Push-
Meldungen (13), Schein-Vorbereitung (12), DSGVO-Export (10), Ausleitung (9),
Prüfsumme (8), Custom Claims (7). Ungetestet bleibt die KI-Spracherfassung —
ihre Entscheidungslogik liegt in `extractLogic.ts` und ist dort geprüft; was
bleibt, ist der Aufruf beim Anbieter.

Die 178 gegen den Emulator teilen sich in 139 Regeltests, 33 Abfragen je Rolle
und 6 Durchstiche über Ansichtsgrenzen hinweg.

**Zu den 20 neuen Regeltests, weil die Zahl allein nichts sagt:** jeder von
ihnen schlägt gegen die vorherigen Regeln fehl. Das ist nachgemessen, nicht
angenommen — ein Test, der vorher und nachher grün ist, hält keine Grenze
fest, sondern beschreibt nur, was ohnehin galt.

**6 von 27 Ansichten haben keinen eigenen Test.** Seit dem 02.09.2026 dabei:
zuerst die vier wichtigsten einzelnen — Zeiterfassung, Rechnungen,
Einsatzplanung, Baustellen —, danach der ganze MATERIALABLAUF über drei
Ansichten hinweg: anfordern, bearbeiten, Bestand führen. Was fehlt, sind die
kleineren: Mein Einsatzplan, Meine Baustellen, Einstellungen, Module,
Nachkalkulation, Handwerksschein-Liste.

**Warum der Materialablauf als GANZES getestet wurde und nicht Ansicht für
Ansicht:** der Fehler, den er zutage gefördert hat, lag in keiner der drei
Ansichten. Er lag in der Regel darunter — der Monteur durfte den Lagerbestand
nicht mehr bewegen, seit der Materialstamm eingegrenzt wurde, und damit tat
sein „Abgeholt"-Knopf nichts. Wer eine Ansicht allein prüft, sieht so etwas
nie.

**Und die Einschränkung gilt unverändert:** auch in den neuen Tests ist jeder
Datenbankzugriff ersetzt. Sie prüfen die Verdrahtung — welche Zahl in welche
Kachel geht, in welcher Reihenfolge geschrieben wird, was passiert, wenn ein
Ladevorgang scheitert. Einen fehlenden Index oder eine an den Regeln
scheiternde Abfrage finden sie weiterhin nicht; dafür sind die
Emulator-Tests da.

**Warum das nicht theoretisch ist.** Jeder Fehler, der bisher aus dem Betrieb
gemeldet wurde, lag in den Nähten, die ersetzte Datenbankzugriffe per
Konstruktion nicht sehen:

| Gemeldet | Ursache | Wird jetzt abgefangen? |
|---|---|---|
| Kundenakte ohne Baustellen | fehlender Firestore-Index | **Ja** — Index-Abgleich. Er hat beim ersten Lauf gleich einen zweiten fehlenden gefunden (`followUps`). |
| Projektleitung: fünf Reiter mit „Kein Zugriff" | drei Listen behaupteten dasselbe und waren auseinandergelaufen (`navigation.ts`, `RequireRole`, `permissions.ts`) | **Ja** — der Abgleich Navigation ↔ Routen. Und die Doppelung selbst ist weg: `RequireNav` liest aus derselben Liste. |
| Leeres Auswahlfeld beim Schein | verschluckter Fehler | **Teilweise** — der Smoketest findet eine Abfrage, die an den Regeln scheitert; eine schlicht leere Menge findet er nicht. |
| „Lädt ewig" (Schein) | Cloud Function ohne Frist | **Ja** — die Frist liegt jetzt in `lib/frist.ts` und ist geprüft |
| „iPhone lädt gar nicht" | Start hing an zwei Abfragen ohne Zeitgrenze; kein Vorhalten der App-Hülle | **Teilweise** — Frist und Service Worker sind geprüft, die Wirkung auf einem echten Gerät ist es nicht |
| Unterschrift ohne Wirkung | `canvas.width` löscht die Fläche | **Vom Betrieb auf einem echten Gerät nachgeprüft (07.09.2026) — sie funktioniert.** Automatisiert weiterhin nicht abgedeckt; dagegen hülfe nur ein echter Browser im Testlauf |

**Zwei Fallen, die der Emulator selbst stellt** — beide inzwischen als Test
festgehalten:

1. **Fehlende Indizes verschweigt er.** Er legt zusammengesetzte Indizes bei
   Bedarf still selbst an. Lokal läuft alles, in Produktion scheitert die
   Abfrage. Deshalb der statische Abgleich.
2. **Ein fehlendes Dokument wird abgelehnt, nicht leer beantwortet.**
   `ownsExisting()` liest `resource.data.companyId`; bei einem Dokument, das
   es nicht gibt, ist `resource` null. `getUserByUid` gibt also nicht `null`
   zurück, wenn das Nutzerdokument fehlt — es wirft.

## Woran man in dieser Reihenfolge arbeiten sollte

1. ~~Abfrage-Smoketest~~ — **erledigt.** Läuft in CI mit den Regeltests.
2. ~~Index-Abgleich~~ — **erledigt.** Rein statisch, ohne Emulator.
3. ~~Vier Durchstich-Tests für die Geldwege~~ — **erledigt.** Zeit →
   Auswertung, Urlaub → Genehmigung → Zeitkonto, Angebot → Baustelle →
   Rechnung → Nachkalkulation, Schein → einfrieren → Storno. Sie haben beim
   Schreiben zwei eigene Fehlannahmen aufgedeckt: dass ein Monteur seinen
   unterschriebenen Schein selbst stornieren dürfe (darf er nicht — nur die
   Leitung), und dass eine Juniwoche fünf Arbeitstage habe (der 4. Juni 2026
   ist Fronleichnam).
4. ~~Navigation verdichten~~ — **erledigt, aber zur Hälfte zurückgenommen.**
   Von 18 Reitern auf 14: Material (anfordern, Anforderungen, Lager) und
   Einstellungen (Meldungen, Sätze, Module) fassten je drei Ansichten unter
   einem Reiter. Dabei kam der Reiter-ins-Leere-Fehler heraus, siehe oben.

   > **Material ist seit 03.09.2026 wieder getrennt.** Aus dem Betrieb kam die
   > klare Ansage, dass die Zusammenfassung dort nicht stimmt. Das Argument
   > überzeugt: es sind zwar drei Blicke auf dasselbe THEMA, aber drei
   > verschiedene TÄTIGKEITEN von drei verschiedenen Leuten — der Monteur
   > fordert an, die Verwaltung arbeitet ab, das Lager führt Bestand. Wer eines
   > davon tut, sucht es dort, wo es hingehört, und nicht hinter einem
   > Unterreiter in einem fremden Bereich. Bei den Einstellungen bleibt es
   > dagegen: Sätze, Module und Sicherung richtet man einmal ein und fasst sie
   > danach selten an — das ist wirklich ein Bereich.
   >
   > Die Lehre daraus ist nicht „Verdichten war falsch", sondern: **die richtige
   > Frage ist nicht, ob etwas thematisch zusammengehört, sondern ob es
   > dieselbe Person in derselben Situation tut.**
5. ~~Ansichtstests nachziehen~~ — **erledigt** für die vier wichtigsten
   (Zeiterfassung, Rechnungen, Einsatzplanung, Baustellen) und den ganzen
   Materialablauf. Es fehlen die kleineren, siehe oben.
6. ~~Cloud Functions von innen prüfen~~ — **erledigt am 05.09.2026.** Acht von
   neun Handlern, 98 Tests, der Produktivcode unverändert. Die Hürde war nie
   der Aufwand, sondern die Auflösung: `firebase-admin` und
   `firebase-functions` liegen nur unter `functions/node_modules`. Ein Ersatz
   per `resolve.alias` löst das, ohne beides ins Wurzelprojekt zu holen.

   > **Was dabei herauskam, ist so wichtig wie die Tests selbst:** eine
   > Gegenprobe ging zunächst durch. `{ merge: false }` gegen `{ merge: true }`
   > zu tauschen änderte am Ergebnis nichts — die Bilanz liefert immer
   > dieselben Felder, sie überschreiben sich gegenseitig. Der Unterschied
   > zeigt sich erst an einem Feld aus einer FRÜHEREN Fassung, das die heutige
   > Rechnung nicht mehr kennt. Genau dafür ist die Zusage da, und genau so
   > steht der Test jetzt da.

7. **Was weiterhin offen bleibt:** Nebenläufigkeit (zwei Läufe auf demselben
   Dokument), die echten Firestore-Indizes im Function-Pfad, und die
   KI-Spracherfassung jenseits ihrer Entscheidungslogik.

## Eine Ungereimtheit, die noch offen ist

Die **Nachkalkulation** ist bewusst Geschäftsführungssache, weil sie Margen
zeigt. Die **Angebote** stehen dagegen auch der Projektleitung offen — und
darin steht die Vorkalkulation mit den Kostensätzen, also die Marge des
einzelnen Auftrags. Entweder ist die eine Grenze zu eng oder die andere zu
weit; entschieden ist es nicht. Das ist eine Produktfrage, keine
Programmierfrage: sie hängt daran, ob die Projektleitung im Betrieb
mitkalkulieren soll.
