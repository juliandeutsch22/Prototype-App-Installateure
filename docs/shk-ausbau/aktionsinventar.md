# SHK-Ausbau — Aktionsinventar

Für jede Ansicht, die ein Paket berührt, wird **vor** dem Bau festgehalten,
was sie heute kann:

- Felder;
- Knöpfe;
- Filter;
- Reiter;
- Exporte;
- Deep Links;
- Sonderfälle.

Nach dem Paket muss jede dieser Aktionen noch da sein oder ihr Wegfall als
Entscheidung mit Grund im Register stehen (Grundsatz 2: nichts
verschlimmbessern).

Das Inventar entsteht je Paket unmittelbar vor seinem Bau. Für alle Pakete
auf einmal würde es nichts taugen: Jedes Paket ändert Ansichten, die ein
späteres wieder berührt. Ein früh aufgenommenes Inventar wäre beim späteren
Paket veraltet und würde Vollständigkeit nur vortäuschen.

## M01a — Modulregister

### Einstellungen › Module (`/settings/module`, `ModulesView.tsx`)

- **Wer:** nur Administrator (Navigation `NUR_ADMIN`, Server-Trigger
  `companies_einstellungen`).
- **Kopf:** Ortszeile „Einstellungen“, Titel „Module“, Untertitel „Welche
  Bereiche dieser Betrieb benutzt“; keine Hauptaktion.
- **Liste** „Eingeschaltet: n von 9“ mit Hilfetext (Daten bleiben; keine
  Rechteverwaltung). Je Modul eine Zeile:
  - Name, Zweck, „Betrifft: …“;
  - Hinweis „braucht …“, wenn eine Abhängigkeit aus ist;
  - Schalter ein/aus. Er ist gesperrt, solange die Abhängigkeit fehlt und
    das Modul aus ist.
- **Abschalten mit Folgen:** Rückfrage „… ausschalten?“ mit der Liste der
  Module, die mitgehen, Knopf „Ausschalten“.
- **Fuß:**
  - „Verwerfen“ (nur bei Änderung), sonst „Keine Änderung offen.“;
  - „Module speichern“ (gesperrt ohne Änderung).
- **Weggehen mit Ungespeichertem:** Warnung.
- **Fehler beim Speichern:** Fehlermeldung mit Grund, Entwurf bleibt.
- **Alte Adresse** `/modules` leitet auf `/settings/module` um.

### Was je Modul verschwindet (Navigation, Routen, Startseite)

| Modul | Navigation und Route | Startseite | sonst |
|---|---|---|---|
| einsatzplanung | `/assignments`, `/my-schedule` | „Deine Termine“, Einsätze, Auslastung, unbesetzt | Gesamtplan-Abo serverseitig gesperrt und gelöscht; Verweise in den Akten |
| material | `/material`, `/anforderungen`, `/lager` | „Anforderungen und Lager“ | Material im Einsatzformular, in der Monatsansicht, in „Mein Plan“ |
| urlaub | `/vacations`; dafür erscheint `/sonderurlaub` | Urlaubsentscheidung, Sonderurlaub | „Antrag“ nimmt Urlaub am Tag zurück |
| scheine | `/worksheets`, `/worksheet` | Scheine des Monteurs und der Buchhaltung | Verweise in Akte, Plan, Zeiterfassung |
| angebote | `/quotes` | – | Kundenakte |
| rechnungen | `/invoices` | Buchhaltung, Einstellungen | zieht die Nachkalkulation mit ab |
| nachkalkulation | `/costing` | – | – |
| wartung | `/wartungen` | Wartungen der Leitung, Wartungshinweis der Verwaltung | Kundenakte |
| zeitkonten | `/accounting` | – | Karte in der Benutzerakte |

### Abgeschaltetes Modul aufgerufen (`RequireModul`)

Die Meldung „… ist ausgeschaltet“ sagt, dass die Daten erhalten sind. Der
Administrator bekommt dazu den Link „Unter ‚Module‘ wieder einschalten“,
alle anderen den Satz „Einschalten kann das der Administrator unter
‚Module‘“.
