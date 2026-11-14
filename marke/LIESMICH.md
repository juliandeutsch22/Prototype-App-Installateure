# Senklot – gemeinsame Produktmarke

Seit 03.11.2026 gilt ein gemeinsames Markenpaket für die Produktmarke in der App, das Favicon und die installierte Web-App. Zeichen und Schriftzug sind flach, alles ist in Pfade umgewandelt (keine Schrift im SVG).

**Seit E93/E94 (14.11.2026)** ist das Zeichen ein weicher Tropfen mit rundem Kragen und feinem Faden, in Terrakotta (E93 hatte es kurz in Kuppel-Blau; E94 kehrte zu den V10-Farben zurück und behielt die Form); die Wortmarke ist Source Serif 4 Regular 400 (OFL-1.1, dieselbe Titelschrift wie in der App), 31 Einheiten groß, Laufweite −0,012 em. Ruhig und redaktionell wie die Oberfläche, ohne fremde Markenteile. Davor: Zeichen aus Band und Spitze, Wortmarke Poppins Regular, Laufweite 0,02 em.

## Vorlagen

- `logo.svg`: Zeichen in Terrakotta `#A85439`, Schriftzug in warmer Tinte `#25231F` (seit V10, 13.11.2026, E92; davor beides Petrol wie `senklot-logo-petrol.svg`).
- `logo-weiss.svg`: dieselbe Kontur für dunkle Flächen, Schriftzug weiß, Zeichen im hellen Terrakotta `#D08A68`.
- `zeichen.svg`: das einzelne Zeichen ohne Hintergrund; Quelle aller Icons.
- `schriftzug.svg`: die Wortmarke einzeln.
- `icon.svg`: Zeichen auf weißem, randlosem Quadrat, mit Abstand für Systemmasken.
- `favicon.svg`: dasselbe Zeichen auf Weiß mit runden Ecken (Radius 12 von 64, seit 04.11.2026, E43), etwas größer eingesetzt.

Die zentrale `ProduktMarke` lädt die passende Pfadvorlage als zugänglich beschriftetes Bild. Dunkle Inhaltsflächen zeigen die weiße Variante; feste dunkle Markenbänder verwenden sie ausdrücklich. Alle Produktmarken – Anmeldung, Plattform, Begrüßung, Rechtsseiten und Seitenleistenfuß – erhalten dadurch dieselbe Form. Im Handbuch steht dieselbe Pfadkontur.

**Betriebslogos gehören weiterhin dem Betrieb.** `BrandLogo`, Belegköpfe und hochgeladene Firmenlogos werden nicht durch Senklot ersetzt.

## Favicon, iOS, Android und Push

- Favicon als SVG und PNG in 16, 32 und 64 px, mit runden, durchsichtigen Ecken.
- Installationsicons „any“: 192 und 512 px, Terrakotta `#A85439` auf Weiß (bis 13.11.2026 Petrol `#0F4552`, am 14.11.2026 kurz Kuppel-Blau) mit denselben runden Ecken — so zeigen Schreibtisch, Benachrichtigung und Startbild sie unverändert.
- Apple-Touch-Icon: 180 × 180 px, randlos und deckend; iOS rundet selbst.
- Android maskable: 512 × 512 px; die gesamte Figur liegt innerhalb des garantierten Kreises mit Radius 40 % der Seitenlänge. Die Form bleibt dieselbe, nur ihre Größe innerhalb der Fläche wird angepasst.
- Push-Abzeichen: weiße Silhouette auf transparentem Grund, ohne vollflächige Kachel.

Neue Verweise unter `/marke/` umgehen die bisherigen Bildadressen im Cache. Manifest-Startadresse, Scope, Statusleistenfarbe und Service-Worker-Registrierung bleiben erhalten. Kompatible PNG-Dateien an den bisherigen Root-Adressen werden ebenfalls aktualisiert. Bei bereits installierten iOS-Web-Apps entscheidet das Betriebssystem, wann das gespeicherte Homescreen-Bild erneuert wird; gegebenenfalls muss die Verknüpfung neu hinzugefügt werden.

`app-zeichen.png` ist die historische, vom Betreiber gelieferte Vorlage aus Oktober. Sie wird nicht mehr zur Erzeugung oder Auslieferung der Icons verwendet. Der damalige Verlauf und die Fase gehören nicht zur neuen Produktmarke.

## Erneut erzeugen

```sh
CHROMIUM_PFAD=/pfad/zu/chromium node marke/rastern.mjs
```

Das Skript benötigt die vorhandene Playwright-Entwicklungsabhängigkeit und Chromium. Es schreibt die PNG-Dateien nach `marke/`, `public/marke/` und für bestehende Verweise nach `public/`. Die öffentlichen SVGs werden ebenfalls aus den Vorlagen übernommen. Der normale Produktionsbuild benötigt keinen zusätzlichen Browser: die erzeugten Dateien werden eingecheckt.

`ausgabe.json` verbindet Vorlagen und Exporte über SHA-256. Die Prüfung erkennt geänderte Vorlagen ohne neu erzeugte Icons. Pixelprüfungen sichern Größen, Deckkraft, weißen Hintergrund, das vorhandene Lot, die Android-Schutzzone und die identischen ausgelieferten Dateien.
