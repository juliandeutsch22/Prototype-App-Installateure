# Vorschau — die echten Ansichten ohne Datenbank

Startet die App mit **echten** Komponenten, aber einer **gestubbten**
Datenschicht. Kein Firebase, kein Supabase, keine Anmeldung.

```bash
npm run vorschau          # Server auf http://localhost:5199/tools/vorschau/
npm run vorschau:messen   # misst alle Routen auf drei Breiten
```

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
| `h2.section-label` läuft 8 px über | Die negativen Ränder, die dem „i" seine 44 px Tastfläche geben |
| Elemente mit `truncate` | Die kürzen absichtlich mit Auslassungspunkten |

## Aufbau

| Datei | Rolle |
|---|---|
| `daten.ts` | Beispieldaten. Absichtlich **lange** Namen — daran zeigen sich Umbrüche. |
| `stubs-erzeugen.mjs` | Liest die Exporte aus `src/lib/db/*.ts` und schreibt passende Stubs nach `db/`. Läuft vor jedem Start. |
| `AuthStub.tsx` | Ersetzt `AuthContext`. Gibt ein **stabiles** Objekt zurück — sonst laufen die Abos endlos neu auf. |
| `leer.ts` | Ersatz für Firebase, Supabase und Push. Nur Namen, keine Wirkung. |
| `messen.mjs` | Der Durchgang über alle Routen. |

Die Stubs unter `db/` werden **erzeugt** und sind nicht eingecheckt. Damit
können sie nicht veralten, wenn die Datenschicht eine Funktion dazubekommt.
