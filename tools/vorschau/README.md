# Vorschau — die echten Ansichten ohne Datenbank

Startet die App mit **echten** Komponenten, aber einer **gestubbten**
Datenschicht. Kein Firebase, kein Supabase, keine Anmeldung.

```bash
npm run vorschau                 # Server auf http://localhost:5199/tools/vorschau/
npm run vorschau:messen          # misst alle Routen auf drei Breiten (Server muss laufen)
npm run vorschau:fotos -- fotos  # Bilder je Route × Rolle × Breite nach ./fotos/ (optional Filter als 2. Argument)
npm run pruefen:links            # jeder Link je Rolle gegen deren Rechte (startet die Vorschau selbst; läuft in der CI)
```

Chromium: Standard ist der Pfad der Build-Umgebung; sonst `CHROMIUM_PFAD=…`
setzen.

Aufrufen lässt sich jede Route über Abfrageparameter:

```
http://localhost:5199/tools/vorschau/?pfad=/invoices&rolle=Buchhaltung
```

## Wofür das gut ist

Layoutfehler zeigen sich nicht im Test. `jsdom` rechnet kein Layout — eine
Karte, die 200 Pixel aus dem Bild läuft, ist dort grün. Diese Vorschau
rendert in einem echten Browser und lässt sich vermessen.

`npm run vorschau:messen` geht jede Route auf **390 / 834 / 1440 px** durch,
öffnet dabei jedes `<details>` und jede aufklappbare Karte und meldet:

- Seiten, die sich waagrecht schieben lassen
- Elemente, die aus ihrem Behälter laufen
- abgeschnittene Beschriftungen
- JavaScript-Fehler beim Rendern

**834 px ist die wichtigste Breite.** Dort steht die Seitenleiste schon, aber
der Platz ist knapp — die vier Layoutfehler aus dem Durchgang vom 18.09. waren
dort am schlimmsten oder ausschliesslich dort. Telefon (keine Seitenleiste) und
Schreibtisch (viel Platz) sind beide gutmütig.

## Was NICHT stimmt und auch nicht stimmen soll

Die Stubs liefern Beispieldaten, keine echte Logik. Was hier „0 Einträge"
zeigt oder eine Zahl anders rechnet, ist kein Befund über die App. Geprüft
wird die **Form**, nicht der Inhalt.

Falschmeldungen der Messung, die keine Fehler sind:

| Meldung | Warum sie kommt |
|---|---|
| `span.sr-only` abgeschnitten | Diese Elemente sind 1 px breit — das ist ihr Zweck |
| natives `input[type=file]` läuft über | Die Überbreite liegt im Schatten-DOM des Steuerelements |
| `h2.titel-karte` oder eine Zeile mit „i“ am rechten Rand läuft 8 px über | Die negativen Ränder, die dem „i" seine 44 px Tastfläche geben; die Tastfläche reicht in die Polsterung. Erkannt wird das „i“ selbst (Knopf mit `aria-controls` und `aria-expanded`), nicht ein Klassenname |
| Elemente mit `truncate` | Die kürzen absichtlich mit Auslassungspunkten |
| Textfeld (`input`) läuft über | Sein **Wert** ist länger als das Feld (etwa ein langer Kundenname) und scrollt darin — wie in jedem Textfeld. Ein Feld, das selbst aus der Seite ragt, meldet die Messung weiter als „ragt hinaus“ (wird herausgefiltert) |
| Formular mit `.aktionsleiste` läuft 16 px über | Die Leiste reicht in einer Karte absichtlich bis an deren Kanten; die Karte schneidet dort ab (wird herausgefiltert) |

## Aufbau

| Datei | Rolle |
|---|---|
| `daten.ts` | Beispieldaten. Absichtlich **lange** Namen — daran zeigen sich Umbrüche. |
| `stubs-erzeugen.mjs` | Liest die Exporte aus `src/lib/db/*.ts` und `src/lib/db/pg/*.ts` und schreibt passende Stubs nach `db/`. Läuft vor jedem Start. Formen, die sich nicht aus dem Namen ableiten lassen, stehen dort in `FEST`. |
| `fest/` | Handgeschriebene Stubs (Ausgangsfach, Katalogimport), werden nach dem Erzeugen über `db/` gelegt. |
| `fotos.mjs` | Fotografiert jede Route je Rolle auf 390 / 834 / 1440 px. |
| `AuthStub.tsx` | Ersetzt `AuthContext`. Gibt ein **stabiles** Objekt zurück — sonst laufen die Abos endlos neu auf. |
| `leer.ts` | Ersatz für Firebase, Supabase und Push. Nur Namen, keine Wirkung. |
| `messen.mjs` | Der Durchgang über alle Routen. |

Die Stubs unter `db/` werden **erzeugt** und sind nicht eingecheckt
(`.gitignore`). Damit können sie nicht veralten, wenn die Datenschicht eine
Funktion dazubekommt. Meldet die Vorschau „does not provide an export
named …“, fehlt eine Form: in `FEST` ergänzen oder als Datei nach `fest/`.
