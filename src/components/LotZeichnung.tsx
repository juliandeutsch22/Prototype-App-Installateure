/**
 * DIE ZEICHNUNGEN DER LINIE „LOT“ (freigegebener Illustrationsentwurf vom
 * 29.10.2026, `senklot-illustrationen-gesamtentwurf-2026-10-29`).
 *
 * Kleine technische Linienzeichnungen: helle Konstruktionslinien (`guide`),
 * eine petrolfarbene Kontur (`ink`) und wenige getönte Flächen (`wash`),
 * alle im selben Zeichenraum 160 × 104. Die Farben kommen aus den
 * Theme-Variablen — hell und dunkel ohne zweite Fassung.
 *
 * WAS SIE NICHT SIND: Statusanzeigen. Eine Zeichnung trägt keine Bedeutung,
 * die nicht auch im Text steht (`aria-hidden`, ohne Fokus und Klickfläche),
 * und ersetzt nie einen Wert, eine Warnung oder einen Termin.
 *
 *   kopf     kleiner Akzent im Seitenkopf der Hauptseiten, erst ab 1280 px
 *   leer     erklärende Zeichnung im tatsächlich leeren Bereich
 *   hinweis  kompakt neben einem einmaligen Einrichtungshinweis
 *   buehne   groß auf der Bühne der Anmeldung am Schreibtisch
 */
const MOTIVE = {
  bau: {
    guide: ["M15 87h130M25 16v76m-4-62h8m-8 16h8m-8 16h8m-8 16h8M136 16v76m-4-62h8m-8 16h8m-8 16h8m-8 16h8", "M36 84V43l45-27 45 27v41M33 45l48-29 48 29M76 25v59M50 52h13m-13 9h13m30-9h17m-17 9h17"],
    ink: ["M37 82V45l44-26 44 26v37M43 43l38-23 38 23M78 25v36m-3 5h6v4h-6zM72 75h12l4 5H68zM68 83h20L78 99"],
    wash: ["M91 34l24 15v16H91z"],
  },
  akte: {
    guide: ["M15 87h130M25 16v76m-4-62h8m-8 16h8m-8 16h8m-8 16h8M136 16v76m-4-62h8m-8 16h8m-8 16h8m-8 16h8", "M53 26V15h31l9 9h37v53H53M57 37h49m-49 10h41M45 83h78"],
    ink: ["M34 82V32h29l9 10h50v40zM34 32h29l9 10h50M46 55h48m-48 9h35m-35 9h42M57 24h27l8 8h30"],
    wash: ["M44 48h19v5H44z"],
  },
  beleg: {
    guide: ["M15 87h130M25 16v76m-4-62h8m-8 16h8m-8 16h8m-8 16h8M136 16v76m-4-62h8m-8 16h8m-8 16h8m-8 16h8", "M45 20h48l16 16v49M93 20v16h16M40 43h9m-9 12h9M57 48h36m-36 10h25m-25 10h34"],
    ink: ["M36 84V28h44l15 16v40zM80 28v16h15M48 54h32m-32 10h23M48 74h32M102 49h21m-21 12h21m-21 12h13"],
    wash: ["M48 35h18v6H48z"],
  },
  plan: {
    guide: ["M15 87h130M25 16v76m-4-62h8m-8 16h8m-8 16h8m-8 16h8M136 16v76m-4-62h8m-8 16h8m-8 16h8m-8 16h8", "M33 27h93v56H33zM33 43h93m-93 18h93M62 27v56m33-56v56M46 19v15m66-15v15"],
    ink: ["M34 82h92M33 27h93M33 27v56M62 48v7m33 13v9M68 49h20v9H68zM100 67h20v9h-20z"],
    wash: ["M38 46h18v10H38z"],
  },
  lager: {
    guide: ["M15 87h130M25 16v76m-4-62h8m-8 16h8m-8 16h8m-8 16h8M136 16v76m-4-62h8m-8 16h8m-8 16h8m-8 16h8", "M33 27h94M33 55h94M33 83h94M36 19v68m88-68v68M48 37h28v15H48zM85 62h25v18H85z"],
    ink: ["M36 83V25m88 58V25M37 55h87M37 83h87M48 35h27v18H48zM86 28h24v25H86zM48 65h24v16H48zM84 66h27v15H84zM55 36v6h12v-6"],
    wash: ["M87 29h22v7H87z"],
  },
  team: {
    guide: ["M15 87h130M25 16v76m-4-62h8m-8 16h8m-8 16h8m-8 16h8M136 16v76m-4-62h8m-8 16h8m-8 16h8m-8 16h8", "M37 23h87v17H37zM37 47h87v17H37zM37 71h87v17H37zM49 17v76M115 17v76"],
    ink: ["M37 40h87M37 64h87M37 88h87M44 29h22m-22 24h29m-29 24h18M84 29h26m-26 24h26m-26 24h26"],
    wash: ["M43 32h19v4H43zM82 56h28v4H82z"],
  },
  wartung: {
    guide: ["M15 87h130M25 16v76m-4-62h8m-8 16h8m-8 16h8m-8 16h8M136 16v76m-4-62h8m-8 16h8m-8 16h8m-8 16h8", "M39 80V48h32V24h48M33 46h13m23-29v14M97 18v16M47 55h17m-17 9h17"],
    ink: ["M40 84V48h31V25h49M48 84V56h31V33h41M84 22v15m9-15v15M36 70h16m-16 6h16M100 56a12 12 0 1 0 24 0a12 12 0 1 0-24 0M112 56l5-5M112 68v16"],
    wash: ["M87 23h4v13h-4z"],
  },
  einrichtung: {
    guide: ["M15 87h130M25 16v76m-4-62h8m-8 16h8m-8 16h8m-8 16h8M136 16v76m-4-62h8m-8 16h8m-8 16h8m-8 16h8", "M47 19h60l13 14v54H47M107 19v14h13M33 37h13m-13 22h13m-13 22h13"],
    ink: ["M37 27h57l14 14v44H37zM94 27v14h14M48 45h28m-28 10h42m-42 12h34m-34 10h45"],
    wash: ["M79 34h8v8h-8z"],
  },
  betrieb: {
    guide: ["M15 87h130M25 16v76m-4-62h8m-8 16h8m-8 16h8m-8 16h8M136 16v76m-4-62h8m-8 16h8m-8 16h8m-8 16h8", "M34 82V37h36V23h33v25h24v34M45 50h13m-13 12h13M81 38h11m-11 12h11m-11 12h11"],
    ink: ["M34 84V37h36V23h33v25h24v36M29 84h104M78 83V70h16v13M42 46h17m-17 11h17m22-24h11m-11 11h11m22 13h6m-6 11h6"],
    wash: ["M76 28h20v6H76z"],
  },
  suche: {
    guide: ["M15 87h130M25 16v76m-4-62h8m-8 16h8m-8 16h8m-8 16h8M136 16v76m-4-62h8m-8 16h8m-8 16h8m-8 16h8", "M32 27h93M32 45h93M32 64h93M32 83h93M45 20v68m61-68v68"],
    ink: ["M53 32h24m-24 13h17M83 58a17 17 0 1 0 34 0a17 17 0 1 0-34 0M112 70l14 14M54 73h18"],
    wash: ["M118 77l9 9-3 3-9-9z"],
  },
  fertig: {
    guide: ["M15 87h130M25 16v76m-4-62h8m-8 16h8m-8 16h8m-8 16h8M136 16v76m-4-62h8m-8 16h8m-8 16h8m-8 16h8", "M40 21h72v20H40zM40 48h72v20H40zM40 75h72v12H40zM49 16v75M115 16v75"],
    ink: ["M41 41h71M41 68h71M49 28h30m-30 27h30M92 28l4 4 8-9M92 55l4 4 8-9M34 87h93"],
    wash: ["M49 32h26v4H49zM49 59h21v4H49z"],
  },
  ablage: {
    guide: ["M15 87h130M25 16v76m-4-62h8m-8 16h8m-8 16h8m-8 16h8M136 16v76m-4-62h8m-8 16h8m-8 16h8m-8 16h8", "M56 17h40l14 14v45H56M96 17v14h14M53 49h39m-39 9h29"],
    ink: ["M37 32h40l15 15v35H37zM77 32v15h15M48 55h26m-26 10h20M28 87h104"],
    wash: ["M48 41h16v5H48z"],
  },
} as const satisfies Record<string, { guide: readonly string[]; ink: readonly string[]; wash: readonly string[] }>;

export type LotMotiv = keyof typeof MOTIVE;

/*
  DIE KLASSEN STEHEN AUSGESCHRIEBEN: Tailwind behält Regeln aus
  `@layer components` nur, wenn der Klassenname wörtlich im Quelltext
  vorkommt. Zusammengesetzt (`lot-zeichnung-${art}`) fielen die Größen weg,
  und die Zeichnung füllte die ganze Breite.
*/
const KLASSE = {
  kopf: 'lot-zeichnung lot-zeichnung-kopf',
  leer: 'lot-zeichnung lot-zeichnung-leer',
  hinweis: 'lot-zeichnung lot-zeichnung-hinweis',
  buehne: 'lot-zeichnung lot-zeichnung-buehne',
} as const;

export default function LotZeichnung({ motiv, art }: { motiv: LotMotiv; art: keyof typeof KLASSE }) {
  const m = MOTIVE[motiv];
  return (
    <svg
      viewBox="0 0 160 104"
      fill="none"
      className={KLASSE[art]}
      data-motiv={motiv}
      aria-hidden="true"
      focusable="false"
    >
      {m.guide.map((d) => <path key={d} className="guide" d={d} />)}
      {m.ink.map((d) => <path key={d} className="ink" d={d} />)}
      {m.wash.map((d) => <path key={d} className="wash" d={d} />)}
    </svg>
  );
}
