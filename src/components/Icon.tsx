import type { SVGProps } from 'react';

export type IconName =
  | 'home'
  | 'clock'
  | 'package'
  | 'calendar'
  | 'building'
  | 'clipboard'
  | 'users'
  | 'receipt'
  | 'chart'
  | 'more'
  | 'chevron'
  | 'settings'
  | 'bell'
  | 'phone'
  | 'mail'
  | 'pin'
  | 'sun'
  | 'pencil'
  | 'file'
  | 'contact'
  | 'wrench'
  | 'archive'
  | 'calculator'
  | 'eingang'
  | 'liegenschaft'
  | 'nachricht'
  | 'weiter'
  | 'warnung'
  | 'hinweis'
  | 'haken'
  | 'hilfe'
  | 'lupe'
  | 'klammer'
  | 'kamera'
  | 'senden'
  | 'play'
  | 'pause'
  | 'stopp'
  | 'wechsel'
  | 'papierkorb'
  | 'zurueck'
  | 'schliessen'
  | 'heute'
  | 'pdf'
  | 'in-liste'
  | 'plus';

// Schlichte Linien-Icons (24×24, currentColor). Bewusst sachlich, kein Zierwerk.
// Ausserhalb der Navigation nur, wo das Zeichen mehr sagt als das Wort:
// anrufen, hinfahren, schreiben, aufklappen — und seit E74 (10.11.2026) die
// Handlungen an einer Sache, die jeder vom Telefon kennt: bearbeiten,
// löschen, PDF, schließen, blättern. Eine Bedeutung hat genau ein Zeichen.
// „Neu …“ und jede Hauptaktion sagt weiter die Beschriftung selbst.
const paths: Record<IconName, string> = {
  home: 'M3 11.5 12 4l9 7.5M5 10v9a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1v-9',
  clock: 'M12 7v5l3 2M12 21a9 9 0 1 1 0-18 9 9 0 0 1 0 18Z',
  package: 'M21 8 12 3 3 8m18 0-9 5m9-5v8l-9 5m0-8L3 8m9 5v8M3 8v8l9 5',
  calendar:
    'M8 3v3M16 3v3M4 8h16M5 6h14a1 1 0 0 1 1 1v12a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1Z',
  building: 'M4 21V5a1 1 0 0 1 1-1h9a1 1 0 0 1 1 1v16M15 21V9h4a1 1 0 0 1 1 1v11M3 21h18M8 8h3M8 12h3M8 16h3',
  clipboard:
    'M9 4h6a1 1 0 0 1 1 1v1H8V5a1 1 0 0 1 1-1ZM8 6H6a1 1 0 0 0-1 1v13a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1V7a1 1 0 0 0-1-1h-2',
  users:
    'M16 19v-1a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v1M9 11a3 3 0 1 0 0-6 3 3 0 0 0 0 6ZM22 19v-1a4 4 0 0 0-3-3.87M16 5.13A4 4 0 0 1 16 13',
  receipt: 'M6 3h12v18l-3-2-3 2-3-2-3 2V3ZM9 8h6M9 12h6',
  chart: 'M4 20V4M4 20h16M8 16v-4M12 16V8M16 16v-6',
  more: 'M5 12h.01M12 12h.01M19 12h.01',
  chevron: 'm6 9 6 6 6-6',
  bell: 'M18 16v-5a6 6 0 1 0-12 0v5l-2 3h16l-2-3M10 22h4',
  // Hoerer und Kartennadel: die beiden Handgriffe, die ein Monteur im Auto
  // macht — anrufen und hinfahren.
  phone:
    'M6.5 3h3l1.5 4-2 1.5a12 12 0 0 0 6.5 6.5L17 13l4 1.5v3a2 2 0 0 1-2.2 2A17 17 0 0 1 4.5 5.2 2 2 0 0 1 6.5 3Z',
  mail: 'M3 7a1 1 0 0 1 1-1h16a1 1 0 0 1 1 1v10a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V7Zm0 .5 9 6 9-6',
  pin: 'M12 21s7-5.5 7-11a7 7 0 1 0-14 0c0 5.5 7 11 7 11ZM12 12.5a2.5 2.5 0 1 0 0-5 2.5 2.5 0 0 0 0 5Z',
  /*
    SIEBEN ZEICHEN KAMEN AM 25.09.2026 DAZU, damit in der Navigation kein
    Zeichen zweimal steht. Vorher trugen Wartungen, Anforderungen und
    Handwerksscheine dasselbe Klemmbrett, Urlaub und Einsatzplanung denselben
    Kalender — wer nach dem Zeichen sucht, landete am falschen Ort. Gleiche
    Strichführung wie oben: 24er-Raster, nur Linien, keine Füllung.
  */
  // Urlaub
  sun: 'M12 8a4 4 0 1 0 0 8 4 4 0 0 0 0-8ZM12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4',
  // Handwerksscheine — hier wird geschrieben und unterschrieben.
  pencil: 'M5 20h3L19 9a2.12 2.12 0 0 0-3-3L5 17v3ZM14.5 7.5l2 2M13 20h6',
  // Angebote
  file: 'M14 3H7a1 1 0 0 0-1 1v16a1 1 0 0 0 1 1h10a1 1 0 0 0 1-1V7l-4-4ZM14 3v4h4M9 12h6M9 16h6',
  // Kunden — die Karteikarte, nicht die Personengruppe der Belegschaft.
  contact:
    'M4 5h16a1 1 0 0 1 1 1v12a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V6a1 1 0 0 1 1-1ZM9 12a2 2 0 1 0 0-4 2 2 0 0 0 0 4ZM5.5 16a3.5 3.5 0 0 1 7 0M15 9h3M15 13h3',
  // Ein Haus mit Stockwerken und Nebentrakt: die Liegenschaft (M02c) — ein Haus mit Wohnungen, nicht der Kunde.
  liegenschaft: 'M4 21V4h11v17M15 10h5v11M3 21h18M7 7h2M11 7h2M7 11h2M11 11h2M7 15h2M11 15h2',
  // Wartungen
  wrench:
    'M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.8-3.8a6 6 0 0 1-7.9 7.9l-6.9 6.9a2.12 2.12 0 0 1-3-3l6.9-6.9a6 6 0 0 1 7.9-7.9l-3.8 3.8Z',
  // Lager — der Kasten im Regal, nicht das einzelne Paket der Anforderung.
  archive: 'M3 4h18v4H3V4ZM5 8v11a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1V8M10 12h4',
  // Nachkalkulation
  // Ein Ablagefach mit Einwurf: der Auftragseingang (M02b) — was hereinkommt, bevor es Baustelle oder Angebot wird.
  eingang: 'M3 13h5l1.5 3h5l1.5-3h5M5.5 5h13L21 13v6a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1v-6L5.5 5Z',
  // Ein Blatt mit Zeilen und einer Ecke zum Absender: die Nachrichten (M10/B09) — Linie statt Sprechblase.
  nachricht: 'M4 5h16v11H10l-4 4v-4H4V5ZM8 9h8M8 12h5',
  calculator:
    'M7 3h10a1 1 0 0 1 1 1v16a1 1 0 0 1-1 1H7a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1ZM9 7h6v3H9V7ZM9 14h.01M12 14h.01M15 14h.01M9 17h.01M12 17h.01M15 17h.01',
  /*
    VIER ZEICHEN DER DESIGNLINIE „FASSUNG 3" (26.09.2026): der Pfeil am Ende
    einer Zeile, die eine Akte öffnet, und die Symbole der Hinweiszeile —
    Dreieck für „bitte ansehen", Kreis mit i für eine Auskunft, Haken für
    einen ruhigen Leerzustand („Alles erledigt").
  */
  weiter: 'm9 6 6 6-6 6',
  warnung: 'M12 4 2.5 20h19L12 4ZM12 10v4.5M12 17.5h.01',
  hinweis: 'M12 21a9 9 0 1 1 0-18 9 9 0 0 1 0 18ZM12 11v5.5M12 7.5h.01',
  haken: 'm5 12.5 4.5 4.5L19 7',
  // „Hilfe zu dieser Seite“ im Seitenkopf (Design-Entwurf, Punkt 1): ein ruhiges Zeichen statt eines unterstrichenen Worts.
  hilfe: 'M12 21a9 9 0 1 1 0-18 9 9 0 0 1 0 18ZM9.6 9.4a2.5 2.5 0 1 1 3.6 2.3c-.7.3-1.2.9-1.2 1.6v.4M12 17.2h.01',
  // In der Listenleiste ersetzt die Lupe die Beschriftung „Suche“ über dem Feld (Design-Entwurf, Punkt 2).
  lupe: 'M10.5 17a6.5 6.5 0 1 0 0-13 6.5 6.5 0 0 0 0 13ZM15.3 15.3 20 20',
  /*
    Die Eingabezeile der Nachrichten (M10/B09): Anhang und Senden als
    Zeichen, damit das Schreibfeld die Breite bekommt — am Telefon passen
    zwei beschriftete Knöpfe neben dem Feld nicht in eine Zeile. Die
    Beschriftung bleibt als `aria-label` und `title`.
  */
  klammer: 'M20 11.5 12.4 19a5 5 0 0 1-7.1-7.1l8-8a3.3 3.3 0 0 1 4.7 4.7l-8 8a1.7 1.7 0 0 1-2.4-2.4l7.3-7.3',
  senden: 'M12 20V5M5.5 11.5 12 5l6.5 6.5',
  // Foto direkt aus der Eingabezeile — am Telefon der häufigste Anhang einer Baustellen-Nachricht.
  kamera: 'M4 8h3l2-3h6l2 3h3v11H4V8ZM12 16.5a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7Z',
  /*
    Die runden Knöpfe der Karte „Arbeitstag“ (Timer, 08.11.2026): Start,
    Pause, Feierabend und Baustelle wechseln — die Zeichen einer Stoppuhr
    sagen hier mehr als das Wort, das als `aria-label` und `title` bleibt.
    Gleiche Strichführung wie die übrigen, nur Linien.
  */
  play: 'M8.5 5.5v13l10-6.5-10-6.5Z',
  pause: 'M8.5 5.5v13M15.5 5.5v13',
  stopp: 'M6.5 6.5h11v11h-11z',
  wechsel: 'M7 4v12M3.5 12.5 7 16l3.5-3.5M17 20V8M13.5 11.5 17 8l3.5 3.5',
  // Nicht buchen (Arbeitstag prüfen, E73): eine Zeit aus dem Tag herausnehmen — mit Grund, nichts geht verloren.
  // Löschen, entfernen, nicht buchen (E73, E74): überall dasselbe Zeichen für „das kommt weg“.
  papierkorb: 'M4 7h16M9.5 7V4.5h5V7M6.5 7l.9 12.1a1 1 0 0 0 1 .9h7.2a1 1 0 0 0 1-.9L17.5 7M10 11v5.5M14 11v5.5',
  /*
    SYMBOLKNÖPFE (E74, 10.11.2026). Blättern ist das Gegenstück zu `weiter`;
    „schliessen“ steht nur im Kopf eines Fensters, nie für Entfernen (das ist
    der Papierkorb). „heute“: der Kalender mit dem Punkt auf dem Tag —
    zurück zur Woche oder zum Monat, in dem heute liegt. „pdf“: das Blatt mit
    dem Pfeil hinaus, am Telefon teilen, am Rechner speichern. „in-liste“:
    eine Liste mit Zugang, bewusst kein Plus — das steht in der Menge daneben.
  */
  zurueck: 'm15 6-6 6 6 6',
  schliessen: 'M6 6l12 12M18 6 6 18',
  heute: 'M8 3v3M16 3v3M4 8h16M5 6h14a1 1 0 0 1 1 1v12a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1ZM12 13a1.5 1.5 0 1 0 0 3 1.5 1.5 0 0 0 0-3Z',
  pdf: 'M14 3H7a1 1 0 0 0-1 1v16a1 1 0 0 0 1 1h10a1 1 0 0 0 1-1V7l-4-4ZM14 3v4h4M12 10v7M9 14l3 3 3-3',
  'in-liste': 'M4 6h11M4 12h11M4 18h7M18 13v8M14 17h8',
  // Etwas Neues in diese Liste (E76): im Kopf einer Karte, als Petrol-Kreis.
  plus: 'M12 5v14M5 12h14',
  // Schieberegler statt Zahnrad: passt zur Linienführung der übrigen Icons
  // und meint hier genau das, was der Screen tut — Werte einstellen.
  settings:
    'M4 7h10M18 7h2M18 7a2 2 0 1 1-4 0 2 2 0 0 1 4 0M4 12h4M12 12h8M12 12a2 2 0 1 1-4 0 2 2 0 0 1 4 0M4 17h10M18 17h2M18 17a2 2 0 1 1-4 0 2 2 0 0 1 4 0',
};

export default function Icon({
  name,
  size = 22,
  ...rest
}: { name: IconName; size?: number } & SVGProps<SVGSVGElement>) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.8}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      {...rest}
    >
      <path d={paths[name]} />
    </svg>
  );
}
