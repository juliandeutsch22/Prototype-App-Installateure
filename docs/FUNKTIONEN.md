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
| **Zeiterfassung** | Tag buchen: Status, Von–Bis, Pause, Baustelle, Zuschläge; **eigene Zuschlagsstunden als Kachel**. Schlank für das Büro, voll für den Monteur. | alle (eigene); Buchhaltung/GF auch fremde | `timeEntries` | Rechnung (44), Emulator (Rechte), Ansicht (8) | Der Ansichtstest prüft die Verdrahtung — welcher Weg zum Saldo, verrechnete Einträge gesperrt —, nicht das Formular |
| **Mein Einsatzplan** | Monatskalender der eigenen Einsätze, Kontaktdaten, Sprung zu Zeit und Schein | Mitarbeiter | `assignments`, `projects`, `vacations` | Ansicht (5) | — |
| **Meine Baustellen** | Die Baustellen, denen der Monteur zugeordnet ist, mit Route und Telefonnummer | Mitarbeiter | `projects` | Ansicht (7) | Abgeschlossene fallen heraus, pausierte bleiben; ein fehlender Ansprechpartner wird angemahnt statt verschwiegen |
| **Material anfordern** | Warenkorb, Eilzustellung, eigene Anforderungen | Mitarbeiter, Verwaltung, Leitung | `materials`, `materialOrders` | Rechnung (25, Meldungen), Ansicht (21), **Durchstich (7, echte Transaktion)** | Der Lagerabzug läuft jetzt gegen einen echten Firestore — auch **zwei gleichzeitige** Abschlüsse derselben Anforderung, der Fall, den kein Ersatz-Firestore prüfen kann |
| **Urlaub** | Beantragen, entscheiden, Stand sehen. Genehmigung schreibt die Tage ins Zeitkonto. | alle (Antrag); Entscheider laut Einstellung | `vacations`, `timeEntries`, `companies` | Emulator (18), Rechnung (15), Ansicht (15), Function (28), Durchstich (3) | Die Tage der ECHTEN Function laufen durch die ECHTE Saldorechnung — die Naht ist geprüft, nicht nur die beiden Hälften |
| **Handwerksscheine** | Zeiten vorausfüllen **oder vor Ort selbst eintragen**, Material von Hand erfassen, **Fotos (freiwillig)**, als Entwurf sichern und wieder öffnen, Entwurf verwerfen und zurückholen, unterschreiben, einfrieren, Storno mit Grund, PDF | Mitarbeiter, Büro, Leitung | `workSheets`, `timeEntries` (serverseitig), **Storage** | Emulator (Regeln + 3 Durchstiche + 12 Zustandsübergänge), Rechnung (20), Ansicht (31), Liste (18), PDF-Zustand (3), Nutzlast (3) | ein verworfener Entwurf bleibt in der Datenbank — gelöscht wird kein Schein (`allow delete: if false`), das schützt den unterschriebenen Beleg. **Leistungszeit vor Ort:** Der Monteur trägt Von/Bis/Pause selbst ein, wenn er noch nichts gebucht hat — das ist die Zeit BEIM KUNDEN, ohne Anfahrt, also genau die Zahl, die später auf der Rechnung steht. Danach erscheint der Einsatz in der Zeiterfassung als **offener Nachtrag**, weil die Rechnung ihre Stunden aus den Zeiteinträgen rechnet und eine nie gebuchte Stunde nie verrechnet wird. Gebucht wird **nicht automatisch**: der Schein kennt weder Anfahrt noch Fahrzeug (Kennzeichen) noch Zuschläge, und ein zu niedriger Eintrag, der vollständig aussieht, wäre schlimmer als ein Hinweis. **Fotos sind nie Voraussetzung:** Firestore hält einen Schreibvorgang offline vor, Storage nicht — wäre eines Bedingung, hinge der Beleg an einem Balken Empfang. Sie gehen über ihren **Inhalts-Hash** in die Prüfsumme ein; ein später im Storage ausgetauschtes Bild fällt damit auf. **Stunden ohne Buchung:** In der Scheinliste steht für Buchhaltung/Leitung, welche unterschriebenen Scheine Zeit tragen, zu der es keine Anwesenheit in der Zeiterfassung gibt — je Person und Tag, älteste zuerst, ab zwei Tagen und ohne Grenze nach oben. Das schliesst die Lücke des Nachtrags: der erinnert nur an die EIGENEN Zeilen, weil ein Monteur fremde Zeiteinträge weder lesen noch schreiben darf (Kranken- und Urlaubstage, Art. 9 DSGVO) — die von Hand eingetragene Kollegenzeile hätte sonst niemanden, der an sie erinnert wird. Unterschieden wird „keine Buchung gefunden“ (Stunden fehlen ganz) von „auf eine andere Baustelle gebucht“ (Arbeitszeit erfasst, Zuordnung falsch); nur das erste zählt in die Summe. Verglichen werden Tag und Name, nicht die Minuten. Geprüft wird zunächst über die geladenen Scheine; **„Weiter zurück prüfen“** (30 Tage / 90 Tage / 1 Jahr) holt gezielt die unterschriebenen Scheine des Zeitraums — auf Anforderung, weil jeder davon rund 70 KB Unterschriftsbilder trägt, mit Obergrenze 150 und sichtbarer Ansage, sobald sie greift. Über der Liste steht jedes Mal, worauf sich das Ergebnis stützt. **Fotos werden sofort ans Dokument geschrieben**, nicht erst beim Speichern: sonst blieb eine Datei im Storage zurück, auf die kein Dokument zeigt — Kosten, und ein Bild aus einer fremden Wohnung ohne Beleg für seine Aufbewahrung. **Suche:** Baustellennummer und Zeitraum gehen serverseitig und finden damit auch Scheine ausserhalb der geladenen Liste; nach Kundenname oder Notiz wird nur im geladenen Bestand gesucht, weil Firestore keine Volltextsuche kann und ein nachzutragendes `nameLower`-Feld alte Scheine stillschweigend übersähe. Die Ansicht sagt beides an und nennt den Ausweg |

## Verwaltung

| Bereich | Was es tut | Wer darf | Daten | Geprüft wodurch | Bekannte Lücke |
|---|---|---|---|---|---|
| **Kunden** | Stammdaten, Dublettenschutz, Übernahme der Altbestände; **Kundenakte** je Kunde mit allen Angaben, Baustellen, Wartungen und Angeboten, **dort auch bearbeitbar** | Buchhaltung, Verwaltung, Leitung | `customers`, `projects`, `quotes`, `wartungen` | Emulator (Regeln), Liste (6), Akte (23), Postgres (10) | — |
| **Angebote** | Positionen kalkulieren, Arbeitszeit getrennt ausweisen, beim Annehmen Baustelle mit Stundenbudget anlegen | Buchhaltung, Leitung | `quotes`, `projects`, `counters` | Ansicht (3), Emulator (Zähler: steigend, Neubeginn nur zum Jahreswechsel) | — |
| **Baustellen** | Anlegen, Kunde zuordnen, Team und Projektleitung, Stundenbudget; **Übersicht je Baustelle** (Stunden über die ganze Laufzeit gegen das Budget, Stunden je Mitarbeiter) | Leitung | `projects`, `timeEntries` | Ansicht (8), Übersicht (8) | Der Kundenname kommt aus dem Stammsatz; leeres Stundenbudget bleibt leer statt 0. Die Übersicht zeigt **kein Geld** — Erlös und Marge bleiben in der Nachkalkulation |
| **Anforderungen** | Eingehende Materialanforderungen bearbeiten, Status setzen | Verwaltung, Leitung | `materialOrders` | Rechnung (Meldungen), Ansicht (14) | — |
| **Lager** | Bestand, Mindestmenge, Katalogpflege mit Verkaufs- und **Einkaufspreis** | Verwaltung, Leitung; **Einkaufspreis nur GF/Admin** | `materials` | Emulator (15: wer pflegen darf, wer den Einkaufspreis setzt), Ansicht (12 + 5 Katalog), Durchstich (7) | Der Bestandsabzug ist jetzt gegen eine **echte Transaktion** geprüft, gleichzeitige Zugriffe eingeschlossen. Die Grenze beim Einkaufspreis läuft zwischen den FELDERN, nicht zwischen den Ansichten — sie schützt das Ändern, **nicht das Lesen**: Firestore gibt ein Dokument ganz oder gar nicht heraus |
| **Einsatzplanung** | Kalender, Mitarbeiter je Tag und Baustelle, Urlaubswarnung | Leitung | `assignments`, `vacations` | Emulator (4: wer planen darf), Ansicht (8) | Geprüft ist auch der gefährliche Teil: eine vorhandene Planung kommt ins Formular, statt beim Speichern gelöscht zu werden |
| **Benutzerverwaltung** | Anlegen, Rollen, Wochenstunden, Arbeitstage, Eintritt | Leitung (Admins nur durch Admins) | `users` | Emulator (Rollenhierarchie), Ansicht (18) | — |
| **Einstellungen** | Verrechnungs- und Kostensätze, Urlaubs-Genehmigende, Monatsbilanzen aufbauen | Leitung; Genehmigende nur GF/Admin | `companies` | Emulator (8), Ansicht (6) | — |
| **Module** | Bereiche für den Betrieb ein- und ausschalten; zeigt vorher, was mit abgeschaltet wird | **nur Administration** | `companies.modules` | Rechnung (15), Emulator (8), Ansicht (11) | Enger als der Rest der Einstellungen. Enger als der Rest der Einstellungen: ein abgeschaltetes Modul nimmt allen den Weg zu ihrer Arbeit, und zwar unsichtbar — das ist Einrichtung, keine Führung |
| **Datensicherung** | Nächtliche Ausleitung des ganzen Bestands an einen zweiten Ort; Sicherung von Hand anstoßen; Bestand herunterladen (DSGVO); **Zustand des letzten Laufs** | **nur GF/Admin** | alle Sammlungen, `systemLaeufe` | Rechnung (23 Aufräum-, Pfad- und Fristregeln), Ansicht (11), Function (24), Emulator (6) | Ohne `AUSLEITUNG_BUCKET` liegt die Sicherung im selben Google-Projekt — gegen einen Fehlgriff hilft das, gegen „der Zugang ist weg" nicht |

## Büro und Auswertung

| Bereich | Was es tut | Wer darf | Daten | Geprüft wodurch | Bekannte Lücke |
|---|---|---|---|---|---|
| **Rechnungen** | Aus Baustelle zusammenstellen — Stunden UND Material aus den unterschriebenen Handwerksscheinen —, Leistungszeitraum, Bauleistung mit Übergang der Steuerschuld (§ 19 Abs 1a UStG), Nummernkreis, Status, **Mahnwesen in drei Stufen mit Mahnlauf**, PDF, Buchhaltungs-Export mit Lückenprüfung. **Gelöscht wird keine Rechnung** — die Korrektur ist der Storno | Buchhaltung, Leitung | `invoices`, `counters`, `timeEntries`, `workSheets`, `materials` | Rechnung (122), Emulator (Zähler, Löschen nur beim Storno), Ansicht (44), Beleg (20) | Geprüft ist die Reihenfolge — Nummer ziehen, Belege sperren, dann anlegen; sie ist beim Anlegen die Sicherung selbst, denn ein Abbruch lässt Belege gesperrt zurück statt doppelt frei. **Storno und Storno-Aufhebung laufen dagegen als ein `writeBatch`**: sie schrieben vorher erst die Rechnung und dann die Belege, und ein Abbruch dazwischen sperrte Stunden für immer oder gab sie doppelt frei. **Vor dem Anlegen steht der Abgleich gegen die unterschriebenen Scheine** — „Ein Schein bestätigt 04:00, verrechnet werden 08:00"; als Warnung erst ab einer Stunde UND einem Viertel darüber. Gekappt wird nichts: Vorfertigung in der Werkstatt zählt auf die Baustelle und steht auf keinem Schein. **Der Buchhaltungs-Export holt seinen Zeitraum selbst vom Server** — er filterte vorher die geladene Arbeitsliste und lieferte für ältere Monate eine leere Datei, die wie ein Erfolg aussah; die Lückenprüfung meldete dann Lücken, die keine sind. Ebenso rechnen **Mahnlauf und unverrechnete Leistung über die offenen Forderungen**, nicht über die Liste: die ältesten Forderungen fallen als erste aus einer Liste, die nach Anlagedatum abschneidet — und genau die gehören gemahnt. **Nicht verrechnete Leistung** steht als eigene Karte da: unterschriebene Scheine, die auf keiner gültigen Rechnung stehen und älter als vier Wochen sind. Wird eine Rechnung storniert, tauchen ihre Scheine dort wieder auf — der Storno nimmt die Forderung zurück, also steht die Leistung wieder offen. Der **Mahnlauf** stellt zusammen, was heute zu mahnen ist, dringlichstes zuerst; verschickt wird weiterhin einzeln und bewusst. Nach der dritten Mahnung hört die App auf — diese Forderungen stehen **getrennt als „braucht eine Entscheidung“** da, statt aus dem Lauf zu fallen. Material ohne Preis im Katalog steht mit 0,00 € da und wird ausgewiesen: eine erfundene Zahl wäre schlimmer als eine sichtbare Lücke |
| **Wartungen** | Wiederkehrende Wartungsvereinbarungen je Anlage; **aus einer fälligen Wartung mit einem Griff eine Baustelle**; erledigt eintragen rückt den nächsten Termin nach; Hinweis auf der Startseite, wenn etwas ansteht | Lesen alle, ändern nur die Leitung | `wartungen`, `customers`, `projects` | Rechnung (40), Ansicht (13), Emulator (5), statischer Abgleich (Index, Export) | Die Baustelle entsteht mit Kunde, **Anlagen**adresse und Anlage in der Beschreibung; eingeteilt wird sie danach im Einsatzplan, den Termin vereinbart weiterhin ein Mensch am Telefon. Die Projektnummer ist ein **Vorschlag, kein Zähler** — Baustellennummern vergibt der Betrieb frei; gegen Doppelvergabe wird beim Speichern geprüft |
| **Mitarbeiterübersicht** | Zeitkonten, Salden, Monats- und Mitarbeiterexport, Stundennachweis — **mit Nacht- und Notdienststunden** | Buchhaltung, GF, Admin (**nicht** Projektleitung) | `timeEntries`, `monthlyStats` | Rechnung (20), Ansicht (4), Zuschläge (14), Nachweis (5) | Das Zusammenspiel Bilanz ↔ Rohdaten stand hier zuletzt als ungetestet — das stimmt nicht: `tests/unit/monatsbilanz.test.ts` prüft, dass beide Wege denselben Saldo ergeben, `TimeView.test.tsx` die Umschaltung samt Vollständigkeits-Marker. Eine Doku, die zu pessimistisch lügt, ist dasselbe Problem wie eine, die zu optimistisch lügt. **Zuschläge:** Die Rechnung bildet aus `isNightWork`/`isEmergency` seit jeher Positionen mit Aufschlag — der Kunde zahlt ihn. Die Lohnausleitung kannte die Felder bis 08.09.2026 gar nicht: verrechnet, aber nicht ausgewiesen, obwohl der Zuschlag ein Anspruch nach Kollektivvertrag ist. Jetzt je Zeile als Kennzeichen und je Mitarbeiter als Summe, dazu **„davon beides“** — Nacht und Notdienst schliessen einander nicht aus, und wer die zwei Zahlen addiert, zählt den Rohrbruch um zwei Uhr früh doppelt. **Gerechnet wird kein Geld:** die Höhe steht im Kollektivvertrag und hängt an Einstufung, Uhrzeit und Anlass — sie hier zu schätzen hiesse, eine Zahl zu erfinden, die in einem Lohnzettel landet |
| **Nachkalkulation** | Erlös gegen Personal- **und Materialkosten** je Baustelle, Deckungsbeitrag | GF, Admin | `projects`, `timeEntries`, `invoices`, `quotes`, `workSheets`, `materials` | Rechnung (23), Ansicht (13) | Geprüft ist auch die Verdrahtung: es rechnet mit den KOSTEN-, nicht den Verrechnungssätzen — der Fehler, den keine Formelprüfung findet. Material zählt seit 07.09.2026 mit, soweit ein **Einkaufspreis** hinterlegt ist; Artikel ohne Preis werden **beim Namen genannt statt geschätzt**, und die Ampel bleibt so lange gelb |

## Grundlagen

| Bereich | Was es tut | Geprüft wodurch | Bekannte Lücke |
|---|---|---|---|
| **Mandantentrennung** | Jede Abfrage auf `companyId`, serverseitig erzwungen | Emulator (Regeltests je Dokument **und** „Durchstich 8": zwei Betriebe, gleicher Tag, gleiche Baustellennummer) | Regeltests fragen „darf diese Rolle dieses Dokument?" — bei AUSWERTUNGEN entscheidet stattdessen, ob die Abfrage ihren Filter mitführt. Gegenprobe: ohne den Filter in `queryTenant` fallen 19 Tests. Der Nummernkreis trennt über die Dokumentkennung, nicht über den Filter, und hat deshalb eine eigene Gegenprobe. **Nicht belegt:** die Auslieferung an einen echten zweiten Betrieb |
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

1581 automatische Tests klingen nach viel. Aufgeschlüsselt:

| Art | Anzahl | Aussagekraft |
|---|---|---|
| **Cloud Functions mit ersetztem Firestore** | **109** | **Hoch für die Entscheidungen — der ECHTE Handler läuft, nur die Aussenwelt ist nachgebaut** |
| **Statischer Abgleich** (Indizes **inkl. Cloud Functions**, Navigation ↔ Routen, Exportumfang, Pflichtfelder, Abfragegrenzen) | **123** | **Hoch — fängt Widersprüche zwischen Listen, die dasselbe behaupten** |
| **Service Worker in einer Sandbox** | **20** | **Hoch — der echte Quelltext, nicht ein Nachbau** |
| Reine Rechnung (der Rest von `tests/unit`) | 608 | Hoch für die Formeln, **null** für die App |
| Ansichten, Datenbank ersetzt | 511 | Findet Bedienfehler, **keine** Datenfehler |
| *Zusammen `npm test`* | *1371* | |
| Regeltests gegen den Emulator (`npm run rules:test`) | 210 | Hoch — echtes Verhalten (inkl. Abfrage-Smoketest und Durchstich) |

> Die Tabelle ADDIERT SICH, und das ist Absicht: eine Aufschlüsselung, in der
> Zeilen fehlen, liest sich wie eine vollständige und ist keine. Die
> Emulatorläufe stehen getrennt, weil sie einen laufenden Emulator brauchen
> und deshalb nicht im selben Befehl stecken.

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

**Pflichtfelder tragen seit dem 07.09.2026 einen Stern.** Vorher erfuhr man
erst nach dem Absenden, dass etwas fehlt — bei einem Formular mit acht Feldern
heisst das: ausfüllen, abschicken, Meldung lesen, suchen.

> Der Stern steht **neben** dem Label, nicht darin: im Label wäre er Teil von
> dessen Text, und das Feld hiesse „Von \*" statt „Von". Die zweite Hälfte der
> Kennzeichnung ist `aria-required` am Feld selbst — ein Stern allein ist
> Farbe und Form und für einen Vorleser nichts.
>
> `tests/unit/pflichtfelder.test.ts` gleicht ab: **jedes Feld mit `required`
> trägt auch den Stern.** Beide Angaben stehen nebeneinander am selben
> Element, und man kann die eine ohne die andere setzen — beim nächsten neuen
> Formular ist genau das die naheliegende Nachlässigkeit.

**Die internen Kostensätze standen als Hausnummer im Formular.** Gemeldet
wurde: „Die Nachkalkulation sagt, man muss in den Einstellungen den Betrag
festlegen, ich finde aber kein Feld." Das Feld war da — es zeigte 42 und 28,
sichtbar, aber nirgends gespeichert.

> Daraus wurden zwei Fehler auf einmal. Die Nachkalkulation meldete
> „Kostensätze fehlen", während daneben zwei ausgefüllte Felder standen. Und
> wer aus einem beliebigen anderen Grund auf Speichern drückte — etwa um das
> Zahlungsziel zu ändern —, schrieb die erfundene Zahl fest: ab da beruhte
> jede Marge des Betriebs auf 42 €, die niemand entschieden hatte.
>
> Jetzt bleiben die Felder leer, bis der Betrieb sie füllt, und mitgeschrieben
> werden sie nur, wenn **beide** dastehen. Der Unterreiter heisst „Sätze und
> **Kosten**", damit man sie dort auch vermutet.

**Gelöscht wird nur mit Rückfrage — seit dem 07.09.2026 ausnahmslos.** Eine
Prüfung über alle Löschwege der App fand zwei ohne: „Rechnung löschen" im
Zeilenmenü einer stornierten Rechnung, und „Antrag zurückziehen" beim Urlaub.

> **Das Löschen einer Rechnung gibt es nicht mehr**, auch nicht für die
> stornierte — weder in der Oberfläche noch serverseitig
> (`allow delete: if false`). Nicht bloss mit einer Rückfrage versehen,
> sondern gestrichen: § 132 BAO verlangt sieben Jahre Aufbewahrung, und die
> gezogene Nummer hinterliesse eine Lücke im Kreis, die der
> Buchhaltungs-Export danach zu Recht meldet — ohne dass noch jemand wüsste,
> warum. Der **Storno** ist die vorgesehene Korrektur: er bleibt stehen,
> trägt seinen Grund und lässt sich wieder aufheben.
>
> **„Antrag zurückziehen"** fragt jetzt nach und nennt den Zeitraum. Betroffen
> ist nur der eigene, noch nicht entschiedene Antrag; der Schaden eines
> Fehlgriffs ist gering. Die Ausnahme im Verhalten war das Problem — auf einen
> Löschknopf ohne Rückfrage neben elf mit stellt sich niemand ein.
>
> Zwei Dinge bleiben ganz unlöschbar und waren es schon: der unterschriebene
> **Handwerksschein** und das **Benutzerkonto** (nur deaktivierbar, sonst
> verlören seine Buchungen ihren Besitzer).

**Die Auswertung steht jetzt an zwei Stellen, und das mit Absicht.** Bis zum
07.09.2026 gab es sie nur unter der Mitarbeiterübersicht — dort beantwortet
sie eine Monatsfrage über alle Baustellen („wohin gingen die Stunden im
September?"), und daran hängt auch der CSV-Export. Die Frage, die man beim
Blick auf eine Baustelle tatsächlich hat, ist eine andere: „wie steht DIESE
Baustelle?", über ihre ganze Laufzeit. Sie steht jetzt im Baustellen-Tab,
aufklappbar je Zeile.

> Beide rechnen aus derselben Quelle (`listEntriesForProjects`) und können
> nicht auseinanderlaufen. Genau daran ist die Auswertung schon einmal
> gescheitert: sie verglich Monatsstunden mit einem Budget, das für den
> ganzen Auftrag kalkuliert war, und meldete eine ausgereizte Baustelle als
> halb offen.
>
> **Ohne Geld.** Erlös, Kosten und Deckungsbeitrag bleiben in der
> Nachkalkulation und damit bei der Geschäftsführung; die Baustellenübersicht
> sieht auch die Projektleitung.
>
> Zugleich ist der blaue Kopfbereich der Projektauswertung weg — dieselbe
> Entscheidung, die in der Mitarbeiterübersicht längst getroffen war und hier
> stehengeblieben ist. Helferstunden sind keine Warnung mehr, sondern eine
> Angabe; eine Pille bekommt nur noch, was eine Ausnahme ist („über Budget").

**Die Naht zwischen der Urlaubs-Function und dem Zeitkonto, seit dem
07.09.2026.** Hier stand, es gebe „keinen Durchstich" — das war zu pauschal.
Beide Hälften waren geprüft: die Function mit 24 eigenen Tests, und
`durchstich.test.ts` prüfte, dass fünf Urlaubstage den Saldo nicht ins Minus
ziehen.

> **Nur bemerkte keine die andere.** Der Durchstich STELLTE NACH, was die
> Function schreibt, statt sie aufzurufen. Dazwischen lag eine Annahme, die
> niemand nachrechnete: dass die Datensätze der Function genau die Form haben,
> die die Saldorechnung erwartet. Hiesse das Feld einmal `'Urlaub'` und einmal
> `'Urlaubstag'`, blieben beide Testreihen grün — und der Monteur stünde nach
> seinem Urlaub mit vierzig Minusstunden da.
>
> Jetzt läuft die ECHTE Ausgabe der Function durch die ECHTE Rechnung: Saldo,
> offene Werktage, Monatsbilanz. Und nach der Rücknahme steht der Saldo wieder
> dort, wo er ohne Urlaub stünde.

**Die UID des Kunden landete nur bei Reverse Charge auf der Rechnung.**
Gefunden bei einer Durchsicht am 07.09.2026: die App lud sie aus dem
Kundenstamm, zeigte sie im Formular — und warf sie beim Speichern weg, sobald
der Haken aus war (`customerVatId: reverseCharge ? … : ''`).

> **Über 10.000 € brutto an ein Unternehmen ist sie Pflichtangabe**
> (§ 11 Abs 1 Z 2 UStG). Ihr Fehlen trifft nicht den Aussteller, sondern den
> KUNDEN: ihm steht der Vorsteuerabzug erst zu, wenn sämtliche
> Rechnungsmerkmale vorliegen. Wird die UID binnen eines Monats nachgereicht,
> wirkt die Berichtigung zurück, später erst ab dem Tag der Ergänzung.
>
> Das Feld steht jetzt AUSSERHALB des Reverse-Charge-Blocks — es gehört zum
> Empfänger, nicht zur Steuerschuld — und die UID wandert immer in die
> Rechnung. Über der Grenze wird **gewarnt, nicht gesperrt**: ob der Empfänger
> Unternehmer ist, steht in keinem Datenfeld, und eine Rechnung über 12.000 €
> an eine Privatperson ist vollkommen in Ordnung. Bei Reverse Charge bleibt
> es bei der Sperre — dort belegt die UID den Übergang der Steuerschuld.

**Die Kundenakte, seit dem 07.09.2026.** Gemeldet wurde: „Man kann Kunden
zwar eine Mail, Notiz, UID und weiteres hinzufügen, diese Daten scheinen
jedoch nirgendwo auf." Das stimmte — das Formular nahm sieben Felder
entgegen, die Liste zeigte drei. E-Mail, UID-Nummer und Notiz wurden erfasst
und danach nie wieder gezeigt.

> **Am teuersten war die UID.** Sie gehört auf jede Rechnung an ein
> Unternehmen, und wer sie nachsehen wollte, musste in die
> Bearbeitungsmaske — also genau dorthin, wo man sie versehentlich ändert,
> während man sie nachliest.
>
> Die Akte ist eine eigene Seite (`/customers/:id`), kein Aufklappen mehr.
> Die Historie hing bisher IN der Nebenzeile einer Listenzeile, mit `span`
> gebaut, weil ein Absatz keine Blöcke verträgt. Um Stammdaten und Wartungen
> erweitert wäre daraus vollends eine Ansicht in der Verkleidung einer Zeile.
> Und eine Seite hat eine Adresse: von der Baustelle oder der Rechnung lässt
> sich später darauf verlinken, auf ein Aufklappen nicht.
>
> Mitgenommen: `listWartungenForCustomer` war geschrieben und nie verdrahtet —
> jetzt stehen die Wartungen des Kunden in seiner Akte. Und die
> Kontakt-Regeln (`mapsUrl`, `telUrl`, der neue `mailUrl`) haben endlich
> eigene Tests; im Modul stand seit jeher, sie seien genau dafür ausgelagert.

**Bearbeitet wird seit dem 15.09.2026 in der Akte selbst.** Die
Stammdatenkarte IST das Formular — kein Umschalten in einen Bearbeiten-Modus,
und kein Rücksprung in die Kundenliste, aus der man gerade gekommen ist. Wer
ändern darf, tippt direkt; wer nur lesen darf, sieht dieselben Felder als
Liste. Die Grenze ist dieselbe wie in der Kundenliste (`isGF`:
Geschäftsführung, Projektleitung, Administration) — eine zweite Regel an
derselben Sache wäre der Anfang zweier verschiedener Antworten. Die
Speicherleiste erscheint erst, wenn sich wirklich etwas geändert hat.

> Dabei gefunden: der Angebotsblock der Akte suchte die Angebote über den
> KUNDENNAMEN, die Abfrage filtert aber auf die Kennung. Unter Postgres
> scheiterte er an jedem Kunden, unter Firestore blieb er still leer. Er hat
> nie funktioniert; jetzt tut er es, und eine Prüfung hält das Argument fest.

**Jede Ansicht der App hat seit dem 07.09.2026 einen Ansichtstest.** Zuletzt
offen waren Nachkalkulation, Module, Meine Baustellen, Firmendaten,
Einstellungen und die KI-Erfassung. Fünf weitere standen hier noch als
ungetestet und waren es längst nicht mehr — die Tabelle oben hinkte der
Wirklichkeit nach und ist nachgezogen.

> **Was ein Ansichtstest wert ist, bleibt begrenzt.** Er rendert und klickt,
> aber jeder Datenbankzugriff ist ersetzt: er findet Bedienfehler und
> Verdrahtungsfehler, keine Datenfehler. Der wertvollste Fund dieser Runde ist
> genau ein Verdrahtungsfehler-Test: die Nachkalkulation muss mit den
> KOSTEN-, nicht den Verrechnungssätzen rechnen. Die Formel dafür war immer
> richtig; geprüft war nie, welche Zahl hineingeht.
>
> Nebenbei aufgefallen und behoben: in den Firmendaten trugen zwei Felder die
> gleiche Beschriftung „Schrift darauf". Auf dem Bildschirm ordnet die Nähe
> das zu, eine Sprachausgabe liest die Beschriftung ohne ihre Umgebung.

**Wiederkehrende Wartungen seit dem 07.09.2026.** Die jährliche
Thermenwartung ist der einzige Umsatz eines Installateurs, der sich ein Jahr
im Voraus planen lässt. Geführt wurde sie bisher im Kalender oder im Kopf —
und dort geht sie nicht auffällig verloren, sondern still: sie fällt in einem
vollen Frühjahr niemandem ein, und der Kunde beschwert sich nicht, dass
niemand gekommen ist. Er wechselt beim nächsten Gebrechen den Betrieb.

> **Der Bereich lebt an einem einzigen Schritt: „erledigt eintragen".** Damit
> rückt der nächste Termin nach — gerechnet ab dem Tag der AUSFÜHRUNG, nicht
> ab dem geplanten Termin, weil das Wartungsintervall ab der letzten
> tatsächlichen Wartung läuft. Ohne diesen Schritt wäre die Liste nach einem
> Jahr eine Sammlung roter Zeilen, die niemand mehr ernst nimmt.
>
> Die Terminrechnung schlägt am Monatsende an: der 31. August plus sechs
> Monate ist der 28. Februar, nicht der 3. März. Ohne diesen Anschlag wandert
> der Termin bei jedem Durchlauf ein Stück, und nach ein paar Jahren steht
> die Sommerwartung im Herbst.
>
> Seit dieser Änderung laufen die Tests in `Europe/Vienna` statt in UTC. Ein
> Test, der eine Zeitumstellung prüft, prüfte auf einem Bauserver in UTC
> nichts — dort gibt es keine. `wartungsplan.test.ts` stellt eigens fest, dass
> die Einstellung wirkt.

**Mahnwesen seit dem 07.09.2026.** Vorher gab es den Status „Überfällig" — er
wurde beim Öffnen der Liste gesetzt und angezeigt, mehr nicht. Kein
Mahndatum, keine Stufe, kein Schreiben; der Betrieb führte das Mahnen im Kopf.
Jetzt drei Stufen mit eigenem Text und eigenem Beleg, änderbarer Frist und
Mahnspesen aus den Einstellungen.

> **Verzugszinsen werden bewusst NICHT gerechnet.** Zwischen Unternehmern sind
> es 9,2 Prozentpunkte über dem Basiszinssatz (§ 456 UGB) — und der ändert
> sich halbjährlich. Eine hier hinterlegte Zahl veraltet still und steht danach
> auf jeder Mahnung falsch; eine falsch berechnete Zinsforderung ist schlechter
> als keine.

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

7. **Zwei dieser Lücken sind am 07.09.2026 geschlossen worden.**

   **Nebenläufigkeit** — jedenfalls dort, wo sie am teuersten war: der
   Lagerabzug läuft jetzt als Durchstich gegen einen echten Firestore, mit
   zwei GLEICHZEITIGEN Abschlüssen derselben Anforderung. Der Fall ist keine
   Theorie: Verwaltung und Projektleitung arbeiten dieselbe Liste ab, oft am
   selben Vormittag; ohne Transaktion ginge der Bestand zweimal herunter, und
   beide Klicks meldeten Erfolg.

   > **Und der Test verdient seinen Platz.** Ersetzt man die Transaktion durch
   > ein schlichtes Lesen-dann-Schreiben, bleibt die Gegenprobe „zweimal
   > nacheinander" GRÜN — das `processed`-Flag steht beim zweiten Klick ja
   > schon. Nur der gleichzeitige Fall fällt durch. Genau dafür ist er da.

   **Die Firestore-Indizes im Function-Pfad**: der statische Index-Abgleich
   liest jetzt auch `functions/src`. Eine Function-Abfrage ohne Index
   scheitert in Produktion ins Protokoll, das niemand liest — der Bilanzlauf
   bliebe still stehen. Der Emulator hilft dort nicht, er legt Indizes selbst
   an.

   > **Dabei ist eine Regel korrigiert worden.** Der Abgleich verlangte einen
   > zusammengesetzten Index, sobald eine Abfrage mehr als ein Feld
   > einschränkt. Für `lib/db` fiel das nie auf, weil dort ohnehin überall
   > einer steht. Auf die Functions angewandt meldete er zwei Abfragen als
   > indexlos, die einwandfrei laufen: Firestore bedient mehrere
   > GLEICHHEITSfilter aus den Einzelfeld-Indizes. Die Regel hätte zwei
   > Indizes erzwungen, die bei jedem Schreibvorgang in `users` Leistung
   > kosten und nie gebraucht würden. Jetzt zählt, was über Gleichheit
   > hinausgeht — Bereich, `array-contains`, Sortierung.

   **Nebenbei gefunden, nicht behoben:** zwei Indizes, die keine Abfrage mehr
   braucht — `invoices: companyId + invoiceNumber` und `materials: companyId +
   name`. Sie kosten bei jedem Schreibvorgang in diese Sammlungen Leistung.
   Entfernt sind sie NICHT: einen Index zu löschen wirkt sofort in Produktion,
   und wenn doch etwas darauf zugreift, das der Abgleich nicht sieht, steht
   die Ansicht leer da. Das gehört mit Blick auf die echte Datenbank
   entschieden, nicht nebenbei.

8. **Was weiterhin offen bleibt:** Nebenläufigkeit ausserhalb des Lagerabzugs
   (zwei Läufe auf derselben Monatsbilanz), der Beweis, dass die nächtlichen
   Auslöser in Produktion tatsächlich feuern — dafür gibt es seit Ü1 die
   Überwachung, die es MELDET, aber keinen Test, der es vorher zusichert —,
   und die KI-Spracherfassung jenseits ihrer Entscheidungslogik.

## Eine Ungereimtheit, die noch offen ist

Die **Nachkalkulation** ist bewusst Geschäftsführungssache, weil sie Margen
zeigt. Die **Angebote** stehen dagegen auch der Projektleitung offen — und
darin steht die Vorkalkulation mit den Kostensätzen, also die Marge des
einzelnen Auftrags. Entweder ist die eine Grenze zu eng oder die andere zu
weit; entschieden ist es nicht. Das ist eine Produktfrage, keine
Programmierfrage: sie hängt daran, ob die Projektleitung im Betrieb
mitkalkulieren soll.
