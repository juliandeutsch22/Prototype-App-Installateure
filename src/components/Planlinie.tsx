import type { ReactNode } from 'react';
import { LOT_MOTIV_BAU } from './LotZeichnung';

/**
 * DIE BAUSTEINE DER PLANLINIE (Auftrag 30.10.2026, Entscheidung E30).
 *
 * Jeder Baustein ersetzt ein Element, das es schon gab — einen
 * Fortschrittsbalken, einen „x von y“-Satz, einen grauen Seitenkasten, eine
 * Nummer in Fließschrift. Die Gestaltung steht in `styles/lot-planlinie.css`;
 * hier steht, was Lage, Vorlesehilfe und Zahlen brauchen.
 */

/** Prozent auf eine Stelle, damit die Lage im Stil nicht als lange Kommazahl steht. */
function prozent(teil: number, ganz: number): string {
  if (!(ganz > 0)) return '0%';
  return `${Math.round(Math.min(1, Math.max(0, teil / ganz)) * 1000) / 10}%`;
}

/**
 * B2 MASSLINIE — eine Menge gegen eine Grenze.
 *
 * Bis zur Grenze liegt das Soll am rechten Ende; darüber rückt die
 * Soll-Marke nach links, und der Überhang läuft rot bis an eine eigene
 * Endmarke. So bleibt die ganze Strecke im Bild, egal wie weit es darüber
 * geht. Die Linie trägt NIE eine Aussage ohne Zahl: Ist und Soll stehen als
 * Text daran, der volle Satz für die Vorlesehilfe in `name`.
 */
export function Masslinie({
  ist,
  soll,
  istText,
  sollText,
  ueberText,
  name,
  schmal = false,
}: {
  ist: number;
  /** Die Grenze; ohne Grenze gibt es keine Maßlinie. */
  soll: number;
  /** Unter dem Anfang, in Mono: „45,0 h gebucht“. */
  istText: ReactNode;
  /** Über der Soll-Marke: „Budget 16 h“. */
  sollText?: ReactNode;
  /** Rechts oben, nur wenn es darüber geht: „+29,0 h“. */
  ueberText?: ReactNode;
  /** Der ganze Satz für die Vorlesehilfe: „45,0 h von 16 h Budget, 29,0 h darüber“. */
  name: string;
  /** Die schmale Fassung für Listenzeilen (32 px, ohne Notiz). */
  schmal?: boolean;
}) {
  const darueber = soll > 0 && ist > soll;
  const ganz = darueber ? ist : soll;
  const sollLage = prozent(soll, ganz);
  return (
    <div className={schmal ? 'masslinie masslinie-schmal' : 'masslinie'} role="img" aria-label={name} data-darueber={darueber || undefined}>
      {sollText && <span className="masslinie-soll" style={{ left: sollLage }}>{sollText}</span>}
      {darueber && ueberText && <span className="masslinie-plus">{ueberText}</span>}
      <span className="masslinie-grund" />
      <span className="masslinie-strecke" style={{ width: darueber ? sollLage : prozent(ist, soll) }} />
      {darueber && <span className="masslinie-ueber" style={{ left: sollLage, width: prozent(ist - soll, ist) }} />}
      <span className="masslinie-marke" style={{ left: 0 }} />
      <span className={darueber ? 'masslinie-marke' : 'masslinie-marke masslinie-marke-ende'} style={{ left: sollLage }} />
      {darueber && <span className="masslinie-marke masslinie-marke-ende masslinie-marke-rot" style={{ left: '100%' }} />}
      <span className="masslinie-ist">{istText}</span>
    </div>
  );
}

/** Eine Maßlinie mit ihrem Namen davor — in Akten untereinander („Stundenbudget“, „Leistungszeitraum“). */
export function MasslinieZeile({ name, children }: { name: ReactNode; children: ReactNode }) {
  return (
    <div className="masslinie-zeile">
      <span className="masslinie-name">{name}</span>
      {children}
    </div>
  );
}

/**
 * B2a SALDOLINIE — ein Saldo um die Nulllinie.
 *
 * Minus wächst nach links (Ocker), Plus nach rechts (Petrol). Der Maßstab
 * ist je Ansicht fest und wird dort genannt: nur so lassen sich zwei Zeilen
 * vergleichen. Was über den Maßstab hinausgeht, endet am Rand.
 */
export function Saldolinie({ minuten, massstabMinuten, name }: { minuten: number; massstabMinuten: number; name: string }) {
  const anteil = massstabMinuten > 0 ? Math.min(1, Math.abs(minuten) / massstabMinuten) : 0;
  const breite = `${Math.round(anteil * 5 * 1000) / 1000}rem`;
  return (
    <span className="saldolinie" role="img" aria-label={name}>
      <span className="saldolinie-grund" />
      {minuten < 0 && <span className="saldolinie-minus" style={{ left: `${Math.round((5 - anteil * 5) * 1000) / 1000}rem`, width: breite }} />}
      {minuten > 0 && <span className="saldolinie-plus" style={{ width: breite }} />}
      <span className="saldolinie-null" />
    </span>
  );
}

/**
 * B10 NUMMERNSTEMPEL — PR-, AN-, RE-, Schein- und Artikelnummern.
 *
 * Mono, gesperrt, in einem feinen Rahmen: die Nummer liest sich als Nummer,
 * und in einer Liste steht sie neben dem Namen, ohne mit ihm zu konkurrieren.
 */
export function Stempel({ children, gross = false }: { children: ReactNode; gross?: boolean }) {
  return <span className={gross ? 'stempel stempel-gross' : 'stempel'}>{children}</span>;
}

/** B7 ECKMARKEN — statt eines grauen Seitenkastens. Zählt als Akzent der Seite. */
export function Eckmarken({ children, className = '', als: Tag = 'div', ...rest }: {
  children: ReactNode;
  className?: string;
  als?: 'div' | 'aside' | 'section';
  'aria-label'?: string;
}) {
  return (
    <Tag className={`eckmarken ${className}`.trim()} {...rest}>
      {children}
    </Tag>
  );
}

/**
 * B8 HINWEISLINIE — eine Warnung an einem Feld oder Wert, wie eine Notiz im
 * Plan: Punkt, kurze Linie mit Knick, der Satz daneben. Ersetzt nur die
 * Hinweise unter Feldern, keine Rückfrage.
 */
export function Hinweislinie({ stufe = 'warn', children, id }: { stufe?: 'warn' | 'fehl'; children: ReactNode; id?: string }) {
  return (
    <p className={stufe === 'fehl' ? 'hinweislinie hinweislinie-fehl' : 'hinweislinie'} id={id}>
      <svg className="hinweislinie-strich" viewBox="0 0 36 20" fill="none" aria-hidden="true" focusable="false">
        <circle cx="2.5" cy="3" r="2" fill="currentColor" />
        <path d="M2.5 3 V11 H36" stroke="currentColor" strokeWidth="1" />
      </svg>
      <span>{children}</span>
    </p>
  );
}

/** B4 LOT — die senkrechte Linie mit Senkblei; markiert „hier“ und „jetzt“. */
export function LotZeichen({ pendelt = false }: { pendelt?: boolean }) {
  return <span className={pendelt ? 'lot-zeichen lot-pendel' : 'lot-zeichen'} aria-hidden="true" />;
}

/**
 * B11 MASSKETTE — ein Zeitraum aus Teilen (Arbeit, Pause, Arbeit), bemaßt
 * wie im Plan. Die Pause ist schraffiert. Ihre LAGE kennt die Zeiterfassung
 * nicht (gebucht wird ihre Dauer); sie steht deshalb in der Mitte, und der
 * Satz darunter sagt es.
 */
export function Masskette({
  vonText,
  bisText,
  gesamtMinuten,
  pauseMinuten,
  dauer,
  name,
}: {
  vonText: string;
  bisText: string;
  gesamtMinuten: number;
  pauseMinuten: number;
  /** Minuten als Text („4:00“). */
  dauer: (minuten: number) => string;
  name: string;
}) {
  if (!(gesamtMinuten > 0)) return null;
  const pause = Math.min(Math.max(0, pauseMinuten), gesamtMinuten);
  const arbeit = gesamtMinuten - pause;
  const erste = Math.round(arbeit / 2);
  const zweite = arbeit - erste;
  const lage = (m: number) => prozent(m, gesamtMinuten);
  return (
    <div className="masskette" role="img" aria-label={name}>
      <span className="masskette-grund" />
      <span className="masskette-marke" style={{ left: 0 }} />
      {pause > 0 ? (
        <>
          <span className="masskette-teil" style={{ left: 0, width: lage(erste) }}>{dauer(erste)}</span>
          <span className="masskette-marke" style={{ left: lage(erste) }} />
          <span className="masskette-pause" style={{ left: lage(erste), width: lage(pause) }} />
          <span className="masskette-teil masskette-pause-text" style={{ left: lage(erste), width: lage(pause) }}>{dauer(pause)}</span>
          <span className="masskette-marke" style={{ left: lage(erste + pause) }} />
          <span className="masskette-teil" style={{ left: lage(erste + pause), width: lage(zweite) }}>{dauer(zweite)}</span>
        </>
      ) : (
        <span className="masskette-teil" style={{ left: 0, width: '100%' }}>{dauer(arbeit)}</span>
      )}
      <span className="masskette-marke masskette-marke-ende" style={{ left: '100%' }} />
      <span className="masskette-zeit" style={{ left: 0 }}>{vonText}</span>
      <span className="masskette-zeit masskette-zeit-ende" style={{ left: '100%' }}>{bisText}</span>
    </div>
  );
}

/* ── B9 Modulskizzen ──────────────────────────────────────────────────── */

type Teil =
  | readonly ['path', string, { d: string }]
  | readonly ['rect', string, { x: number; y: number; width: number; height: number }];

/*
  DIE SKIZZEN DER BEREICHE (Zeichenraum 96 × 64), nach den Regeln der
  Zeichnungen: Kontur in Petrol, Hilfslinien in der Linienfarbe, höchstens
  eine helle Fläche. Feine Einzelheiten des Entwurfs (1,2 und 1,3) sind zu
  Konturen geworden — die Linie kennt zwei Strichstärken, nicht vier.
*/
const SKIZZEN = {
  baustelle: [
    ['path', 'hilfe', { d: 'M6 54 H90 M20 60 H76 M20 57 V63 M76 57 V63 M18 62 L22 58 M74 62 L78 58 M48 4 V11' }],
    ['path', 'flaeche', { d: 'M22 31 H74 V54 H22 Z' }],
    ['path', 'kontur', { d: 'M22 54 V31 M74 54 V31 M16 33 L48 11 L80 33 M22 42 H74 M42 54 V45 H52 V54 M58 35 H67 V40 H58 Z M28 35 H36 V40 H28 Z' }],
  ],
  planung: [
    ['path', 'hilfe', { d: 'M8 12 H88 M8 26 H88 M8 40 H88 M8 56 H88 M24 8 V58 M42 8 V58 M60 8 V58 M78 8 V58' }],
    ['path', 'flaeche kontur', { d: 'M26 29 H58 V37 H26 Z' }],
    ['path', 'kontur', { d: 'M44 15 H76 V23 H44 Z M68 4 V44' }],
    ['path', 'balken kontur', { d: 'M68 44 L65 48 L68 54 L71 48 Z' }],
  ],
  schein: [
    ['path', 'flaeche', { d: 'M26 6 H62 L72 16 V58 H26 Z' }],
    ['path', 'hilfe', { d: 'M32 22 H62 M32 28 H58 M32 34 H62 M30 52 H68' }],
    ['path', 'kontur', { d: 'M26 6 H62 L72 16 V58 H26 Z M62 6 V16 H72 M33 48 C36 41 39 52 43 46 S50 42 53 48 S58 46 61 44' }],
  ],
  angebot: [
    ['path', 'hilfe', { d: 'M36 12 H68 V56 H36 Z M28 8 H60 M28 5 V11 M60 5 V11 M26 10 L30 6 M58 10 L62 6' }],
    ['path', 'flaeche kontur', { d: 'M28 18 H60 V60 H28 Z' }],
    ['path', 'hilfe', { d: 'M34 28 H54 M34 34 H50 M34 40 H54 M42 50 H54 M42 52.5 H54' }],
  ],
  kunde: [
    ['path', 'hilfe', { d: 'M10 56 H86 M76 30 V56' }],
    ['path', 'flaeche kontur', { d: 'M30 56 V30 L48 16 L66 30 V56 Z' }],
    ['path', 'kontur', { d: 'M44 56 V45 H52 V56 M35 34 H42 V40 H35 Z M76 12 A5 5 0 1 1 75.99 12 M76 22 V30' }],
  ],
  wartung: [
    ['path', 'hilfe', { d: 'M18 58 H78 M66 10 H80 M66 7 V13 M80 7 V13' }],
    ['path', 'flaeche kontur', { d: 'M34 11 Q34 7 38 7 H58 Q62 7 62 11 V48 H34 Z' }],
    ['path', 'kontur', { d: 'M48 16 A6 6 0 1 1 47.99 16 M48 22 L51.5 18.5 M40 48 V58 M56 48 V58 M38 36 H58' }],
  ],
  rechnung: [
    ['path', 'flaeche kontur', { d: 'M30 6 H66 V52 L62 56 L58 52 L54 56 L50 52 L46 56 L42 52 L38 56 L34 52 L30 56 Z' }],
    ['path', 'hilfe', { d: 'M36 16 H60 M36 22 H56 M36 28 H60' }],
    ['path', 'kontur', { d: 'M44 38 H60 M44 41.5 H60' }],
  ],
  waage: [
    ['path', 'hilfe', { d: 'M10 60 H86' }],
    ['path', 'flaeche kontur', { d: 'M22 20 L16 34 H28 Z' }],
    ['path', 'kontur', { d: 'M48 14 V54 M38 56 H58 M22 20 H74 M48 12 A2 2 0 1 1 47.99 12 M74 20 L68 30 H80 Z' }],
  ],
  zeit: [
    ['path', 'hilfe', { d: 'M42 12 V15 M42 53 V56 M20 34 H23 M61 34 H64' }],
    ['path', 'flaeche kontur', { d: 'M42 16 A18 18 0 1 1 41.99 16' }],
    ['path', 'kontur', { d: 'M42 34 V23 M42 34 L50 38 M76 4 V40' }],
    ['path', 'balken kontur', { d: 'M76 40 L73 44 L76 50 L79 44 Z' }],
  ],
  team: [
    ['path', 'flaeche kontur', { d: 'M26 40 C26 26 36 20 48 20 C60 20 70 26 70 40 Z' }],
    ['path', 'hilfe', { d: 'M48 20 V40' }],
    ['path', 'kontur', { d: 'M20 40 H76 M28 50 H68 V56 H28 Z M48 51.2 A1.8 1.8 0 1 1 47.99 51.2' }],
  ],
  lager: [
    ['path', 'hilfe', { d: 'M8 58 H88' }],
    ['path', 'flaeche kontur', { d: 'M24 30 H36 V42 H24 Z' }],
    ['path', 'kontur', { d: 'M18 8 V58 M74 8 V58 M18 24 H74 M18 42 H74 M40 34 H50 V42 H40 Z M26 14 H44 V24 H26 Z' }],
    ['path', 'griff', { d: 'M56 58 V52 Q56 46 62 46 H70' }],
  ],
  einstellungen: [
    ['path', 'hilfe', { d: 'M28 56 A26 26 0 0 0 68 56' }],
    ['path', 'kontur', { d: 'M48 12 L34 56 M48 12 L62 56 M39 42 H57 M48 6 A3.5 3.5 0 1 1 47.99 6' }],
  ],
} as const satisfies Record<string, readonly Teil[]>;

export type SkizzenMotiv = keyof typeof SKIZZEN | 'bau';

/*
  DIE KLASSEN STEHEN AUSGESCHRIEBEN — wie bei `LotZeichnung`: Tailwind behält
  Regeln aus `@layer components` nur, wenn der Name wörtlich im Quelltext
  steht.
*/
const SKIZZE_KLASSE = {
  gross: 'lot-zeichnung lot-skizze',
  klein: 'lot-zeichnung lot-skizze lot-skizze-klein',
} as const;

/**
 * B9 MODULSKIZZE — die kleine Skizze eines Bereichs, rechts im Schriftfeld
 * (am Handy klein neben dem Titel). Sie ist der Akzent der Seite: höchstens
 * einer je Seite, keiner in Seitenfenstern und Dialogen. Rein dekorativ.
 */
export function Modulskizze({ motiv, klein = false }: { motiv: SkizzenMotiv; klein?: boolean }) {
  const klasse = klein ? SKIZZE_KLASSE.klein : SKIZZE_KLASSE.gross;
  if (motiv === 'bau') {
    // Der Start trägt das Gebäude mit dem Lot aus der Zeichnungsfamilie, verkleinert.
    return (
      <svg viewBox="0 0 96 64" fill="none" className={klasse} data-skizze="bau" aria-hidden="true" focusable="false">
        <svg x="0" y="2" width="96" height="60" viewBox="0 0 240 150">
          {LOT_MOTIV_BAU.map((t, i) => {
            const [tag, k, werte] = t;
            return tag === 'path' ? <path key={i} className={k} {...werte} /> : <rect key={i} className={k} {...werte} />;
          })}
        </svg>
      </svg>
    );
  }
  return (
    <svg viewBox="0 0 96 64" fill="none" className={klasse} data-skizze={motiv} aria-hidden="true" focusable="false">
      {SKIZZEN[motiv].map((t, i) => {
        const [tag, k, werte] = t;
        return tag === 'path' ? <path key={i} className={k} {...werte} /> : <rect key={i} className={k} {...werte} />;
      })}
    </svg>
  );
}
