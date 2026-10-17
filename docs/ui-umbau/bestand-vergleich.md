# Bestandsvergleich vorher → nachher (Stand 18, K4)

Abnahme 8.1 des Protokolls: jedes Element des alten Stands hat im neuen sein
Gegenstück oder eine Zuordnung (Anhang 12.2), der Klickweg wird höchstens um
einen Schritt länger, nichts wird schwerer erreichbar.

## Woraus

| | vorher | nachher |
|---|---|---|
| Stand | `vor-ui-lot` (4abb9ca) | `main` nach #309 (fb13f7a) samt diesem PR |
| Aufnahme | `bestand-vorher.json` | `bestand-nachher.json` |
| Elemente | ‹V› | ‹N› |
| Varianten × Breiten | 13 × 3 | 13 × 3 |

Aufgenommen mit `tests/ui-umbau/bestand.spec.ts` in der Vorschau
(`tools/vorschau`, Beispieldaten, feste Uhr): je Rolle mit und ohne
Freigaben, der Supportzugang zweimal, die Plattform — je 390, 834 und
1.440 px. Die Aufnahme drückt jeden Knopf einer Seite einzeln, öffnet
Menüs, Fenster, Reiter und Segmente und merkt je Element den kürzesten
Klickweg. Nachher sind es mehr Elemente, weil Seitenfenster, Hilfe und
Segmente eigene Zustände sind, die die Aufnahme jetzt einzeln betritt.

Verglichen mit `scripts/ui-umbau/bestand-vergleich.mjs`; die Zuordnung
erzeugt `scripts/ui-umbau/zuordnung-erzeugen.mjs` aus den Handregeln
`zuordnung-hand.json` nach `zuordnung.json`.

## Ergebnis

‹ERGEBNIS›

## Wie zugeordnet wurde

Ein altes Element ohne dieselbe Kennung (Seite, Art, Beschriftung) in
derselben Variante und Breite bekommt seinen neuen Ort auf zwei Wegen:

- **Nach Regel** (‹R› Paare): dieselbe Seite, dieselbe Beschriftung und
  dieselbe Sorte — aus einem Knopf darf ein Menüeintrag werden, aus einem
  Reiter ein Segment, aus einem „i“ der Eintrag unter „Hilfe zu dieser
  Seite“, aus einem Kästchen aber kein Knopf. Allgemeine Wörter
  („Speichern“, „Abbrechen“) nur, wo der letzte Schritt des Wegs derselbe
  ist. Jedes Paar ist durchgesehen; die Durchsicht fand drei falsche
  (Kästchen einer Person → Knopf mit ihrem Namen) und führte zur Regel
  „gleiche Sorte“.
- **Von Hand** (‹H› Paare, ‹HR› Regeln): jede mit ihrer Begründung,
  nachgesehen im Code oder in der Vorschau. Die häufigsten Fälle:
  - **Ganze Zeile statt eigener Knopf** (Linie „Lot“): „Akte“, „Details“,
    „Bearbeiten“, das ⋯ einer Zeile — die Zeile öffnet jetzt ihr
    Seitenfenster mit denselben Aktionen.
  - **Reiter und Auswahlfelder → Segmente**, Kästchen, die einander
    ausschalteten → Segmente (Kunden), umbenannte Einträge („Alle“ →
    „Jeder Stand“) unter `optionen`.
  - **Erklärungen unter „Hilfe zu dieser Seite“** (eine Hilfe je Seite).
    Steht ein „i“ in einem Formular, das erst ein Klick öffnet, erscheint
    es dort erst dann — die Aufnahme öffnet die Hilfe aber nur im
    Grundzustand. Solche Fälle sind einzeln im Code nachgesehen.
  - **Zahlen aus den Beispieldaten**: „Handlungsbedarf · 22“ heisst jetzt
    „Zu erledigen · 18“ — die Zahl hängt am Tag der Aufnahme, nicht an der
    Oberfläche.
  - **Fehleranzeigen der alten Vorschau** („geburtsdaten.get is not a
    function“, „Erneut versuchen“): keine Funktion der App; zugeordnet der
    Karte, in der sie standen, die nachher lädt.

Eine Zuordnung ohne `neu` gibt es nicht (Anhang 12.2). Was weder Gegenstück
noch Zuordnung hat, steht unten als offen.

## Was die Aufnahme nicht sah — und was dafür geändert ist

Jede Änderung mit Gegenprobe: dieselbe Seite vorher und nachher
aufgenommen, mit dem alten Stand fehlt das Element.

1. **Das ⋯ im Seitenkopf ist eine eigene Sorte.** Seit „Lot“ haben viele
   Seiten ein ⋯ im Kopf neben dem ⋯ jeder Zeile; beide hiessen für die
   Aufnahme gleich, nur das erste wurde geöffnet.
2. **Knöpfe im Seitenfenster.** Was vorher an der Zeile stand
   („Stornieren“, „Zahlung erfassen“), steht jetzt im Fenster der Zeile;
   die Aufnahme drückt dort die Knöpfe einzeln (je Seite drei Fenster, je
   Fenster sechs Knöpfe).
3. **Aufklappen nach einem Klick, auch `<details>` und im Fenster**
   („Konditionen für diese Rechnung anpassen“ hinter „Neue Rechnung“).
4. **Segmente wie Reiter**: jedes Segment ein eigener Zustand, dessen Knöpfe
   einzeln gedrückt werden („+ Material“ unter „Einkauf“).
5. **Kennzahlen der Linie „Lot“** (`.pf-kennzahl`, `.ue-kennzahl-fest`).
6. **Ein Aufklapper, der ein Fenster öffnet, wird wieder geschlossen**
   (13.10.2026). „Verwalten“ auf der Plattform trägt `aria-expanded`, öffnet
   aber das Seitenfenster des Betriebs; es blieb offen und lag über der
   Seite, jeder weitere Klick lief ins Leere. Gegenprobe Plattform,
   390 px: 50 Elemente ohne ein einziges aus dem Fenster → 65, darunter
   „Deaktivieren“, „Kein Testbetrieb“, „Wieder aktivieren“, „Übergabe
   erstellen“, „Löschung abbrechen“, „Grund“.
7. **Ersatzmodule der Vorschau** (13.10.2026, `tools/vorschau/stubs-erzeugen.mjs`).
   Ein Eintrag in DATEN galt nur, wenn der Name mit list, get … begann:
   `kundenAdressePruefen` und `kundenOhneKundenart` lieferten `undefined`,
   die Kundenseite stürzte bei „Anschrift prüfen“ ab („Da ist etwas
   schiefgelaufen“), und `stundenDerBaustellen` meldete „konnte nicht
   geladen werden“. Und weil `invoices` in FEST zweimal stand, fehlte
   `scheineAufRechnung` (Startseite, Scheine, Rechnungen, Baustelle). In
   der App war nichts davon falsch — sie fragt die Datenbank, nicht die
   Ersatzmodule. Prüfung `vorschauErsatz.test.ts`; Gegenprobe: mit dem
   alten Erzeuger 2 von 7 rot. Der Bestand nachher ist danach ganz neu
   aufgenommen.

Der Vergleich selbst (`bestandVergleich.test.ts`, 7 Prüfungen, mit dem
alten Skript 3 rot): eine Zuordnung zählt nur in derselben Variante und
Breite, sie kann ein ausgeblendetes Gegenstück gleicher Kennung ersetzen
(„Impressum“ am Tablet jetzt im Profil), Klickweg und Zustand gelten auch
für Zugeordnetes, und aus einer Auswahl dürfen Segmente auf derselben Seite
geworden sein.

## Grenzen der Aufnahme (benannt)

- **Je Beschriftung ein Knopf.** Mehrere „Löschen“ einer Seite drückt sie
  einmal; die Rückfrage hinter den anderen fehlt dann im Bestand (Beispiel:
  „Einsatz löschen?“ in der Tagesplanung — im Code unverändert).
- **Gleiche Kennung heisst gleiche Seite, Art und Beschriftung**, nicht
  gleiche Funktion: das ⋯ einer Zeile und das ⋯ im Seitenkopf tragen
  beide „weitere-aktionen“. Die Einträge der Menüs werden einzeln
  verglichen, und dort fällt eine fehlende Funktion auf.
- **Hilfe nur im Grundzustand** (siehe oben) und **Fließtext nicht als
  Element**: „240 h kalkuliert“ steht nachher in der Zeile unter dem Titel
  der Karte, nicht mehr als Abzeichen — von Hand im Code nachgesehen.
- **Was nur mit Datenbank geht**, zeigt die Vorschau als Fehler, wenn man
  es auslöst (Auskunft herunterladen, Sicherung erstellen, Genehmigen,
  Gerät für Meldungen anmelden, Verkaufspreise vorschlagen). Das sind
  Aktionen, keine Elemente, die fehlen.

## Offen

‹OFFEN›
