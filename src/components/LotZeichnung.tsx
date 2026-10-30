/**
 * DIE ZEICHNUNGEN DER LINIE „LOT“ (Konzept „Kleine Bilder. Klare nächste
 * Schritte.“, 29.10.2026; Entscheidung E29).
 *
 * Technische Zeichnungen im Zeichenraum 240 × 150: Konstruktionsschienen
 * und Grundlinie (`hilfe`), das Objekt in Petrol (`kontur`), deckendes
 * Papier dahinter (`papier`), helle Petrolflächen (`flaeche`), Textzeilen
 * (`zeile`) und ein betonter Balken (`balken`). Alles aus den
 * Theme-Variablen — hell und dunkel ohne zweite Fassung, keine halbdurch-
 * sichtigen Flächen. Die Linien bleiben bei jeder Größe gleich fein
 * (`vector-effect: non-scaling-stroke`).
 *
 * WAS SIE NICHT SIND: Statusanzeigen. Eine Zeichnung trägt keine Bedeutung,
 * die nicht auch im Text steht (`aria-hidden`, ohne Fokus und Klickfläche).
 *
 *   leer     über einem Leerzustand (Erstnutzung, Suche ohne Treffer, erledigt)
 *   hinweis  neben einem einmaligen Hinweis, in der Ablage
 *   buehne   groß auf der Bühne der Anmeldung am Schreibtisch
 */
type Teil =
  | readonly ['path', string, { d: string }]
  | readonly ['rect', string, { x: number; y: number; width: number; height: number }]
  | readonly ['circle', string, { cx: number; cy: number; r: number }];

const MOTIVE = {
  bau: [
    ['path', "hilfe", { d: "M18 134H222M30 16V142M210 16V142M26 34h8M26 58h8M26 82h8M26 106h8M206 34h8M206 58h8M206 82h8M206 106h8M120 10V24" }],
    ['path', "flaeche", { d: "M132 46L168 69V112H132Z" }],
    ['path', "kontur", { d: "M50 72L120 26L190 72M58 66.7V132M182 66.7V132" }],
    ['path', "kontur", { d: "M120 26V84" }],
    ['path', "papier kontur", { d: "M114 84h12v7h-12zM106 95h28l7 9H99zM99 108h42L120 132z" }],
    // Ein Lot überträgt einen Punkt: die Spitze zeigt auf eine Marke am Boden, nicht durch ihn hindurch.
    ['path', "kontur", { d: "M113 134h14" }],
    ['rect', "zeile", { x: 74, y: 84, width: 24, height: 3 }],
    ['rect', "zeile", { x: 74, y: 94, width: 18, height: 3 }],
    ['rect', "zeile", { x: 140, y: 122, width: 26, height: 3 }],
  ],
  akte: [
    ['path', "hilfe", { d: "M18 134H222M30 16V142M210 16V142M26 30h8M26 50h8M26 70h8M26 90h8M26 110h8M206 30h8M206 50h8M206 70h8M206 90h8M206 110h8" }],
    ['path', "papier hilfe", { d: "M100 112V30H132L139 23H194V112Z" }],
    ['rect', "flaeche", { x: 150, y: 38, width: 36, height: 66 }],
    ['path', "hilfe", { d: "M110 46H138M110 56H132" }],
    ['path', "papier kontur", { d: "M48 128V52H90L99 61H160V128Z" }],
    ['rect', "zeile", { x: 62, y: 76, width: 44, height: 3 }],
    ['rect', "zeile", { x: 62, y: 86, width: 62, height: 3 }],
    ['rect', "balken", { x: 62, y: 97, width: 40, height: 4 }],
    ['rect', "zeile", { x: 62, y: 109, width: 70, height: 3 }],
    ['rect', "zeile", { x: 62, y: 118, width: 52, height: 3 }],
  ],
  beleg: [
    ['path', "hilfe", { d: "M18 134H222M30 16V142M210 16V142M26 30h8M26 50h8M26 70h8M26 90h8M26 110h8M206 30h8M206 50h8M206 70h8M206 90h8M206 110h8" }],
    ['path', "papier hilfe", { d: "M112 22H176L192 38V118H112Z" }],
    ['path', "hilfe", { d: "M176 22V38H192M124 52H170M124 62H160" }],
    ['path', "papier kontur", { d: "M58 34H130L148 52V132H58Z" }],
    ['path', "kontur", { d: "M130 34V52H148" }],
    ['rect', "zeile", { x: 72, y: 54, width: 38, height: 3 }],
    ['rect', "zeile", { x: 72, y: 66, width: 60, height: 3 }],
    ['rect', "zeile", { x: 72, y: 76, width: 52, height: 3 }],
    ['rect', "zeile", { x: 72, y: 86, width: 60, height: 3 }],
    ['rect', "flaeche", { x: 98, y: 100, width: 40, height: 22 }],
    ['rect', "balken", { x: 104, y: 109, width: 28, height: 4 }],
  ],
  // Der Handwerksschein: ein Blatt, das erst mit der Unterschrift des Kunden gilt.
  schein: [
    ['path', "hilfe", { d: "M18 134H222M30 16V142M210 16V142M26 30h8M26 50h8M26 70h8M26 90h8M26 110h8M206 30h8M206 50h8M206 70h8M206 90h8M206 110h8" }],
    ['path', "papier hilfe", { d: "M112 22H176L192 38V118H112Z" }],
    ['path', "hilfe", { d: "M176 22V38H192M124 52H170M124 62H160" }],
    ['path', "papier kontur", { d: "M58 34H130L148 52V132H58Z" }],
    ['path', "kontur", { d: "M130 34V52H148" }],
    ['rect', "zeile", { x: 72, y: 54, width: 38, height: 3 }],
    ['rect', "zeile", { x: 72, y: 66, width: 60, height: 3 }],
    ['rect', "zeile", { x: 72, y: 76, width: 52, height: 3 }],
    ['rect', "balken", { x: 112, y: 86, width: 20, height: 4 }],
    ['path', "hilfe", { d: "M72 118H134" }],
    ['path', "kontur", { d: "M76 113c3-9 7-10 8-4s2 7 6 0 5-6 7-1 3 4 7-1 4-3 7 0" }],
  ],
  plan: [
    ['path', "hilfe", { d: "M18 134H222M30 16V142M210 16V142M26 30h8M26 50h8M26 70h8M26 90h8M26 110h8M206 30h8M206 50h8M206 70h8M206 90h8M206 110h8" }],
    ['path', "papier kontur", { d: "M50 26H190V122H50Z" }],
    ['path', "hilfe", { d: "M50 40H190M64 26V122M50 54H190M50 68H190M50 82H190M50 96H190M50 110H190M92 26V122M120 26V122M148 26V122M176 26V122" }],
    ['path', "flaeche", { d: "M78 50H136V92H78Z" }],
    ['path', "kontur", { d: "M78 50H160V92H78ZM136 50V72M136 80V92M110 92V72H136" }],
    ['path', "hilfe", { d: "M78 102V110M160 102V110M78 106H160" }],
    ['rect', "balken", { x: 162, y: 112, width: 20, height: 4 }],
  ],
  lager: [
    ['path', "hilfe", { d: "M18 134H222M30 16V142M210 16V142M26 34h8M26 58h8M26 82h8M26 106h8M206 34h8M206 58h8M206 82h8M206 106h8" }],
    ['path', "kontur", { d: "M56 132V24M184 132V24M56 60H184M56 98H184" }],
    ['rect', "papier kontur", { x: 68, y: 32, width: 40, height: 28 }],
    ['path', "kontur", { d: "M80 32v8h16v-8" }],
    ['rect', "papier hilfe", { x: 116, y: 40, width: 32, height: 20 }],
    ['rect', "flaeche", { x: 122, y: 70, width: 50, height: 28 }],
    ['rect', "papier kontur", { x: 70, y: 74, width: 42, height: 24 }],
    ['rect', "balken", { x: 80, y: 84, width: 22, height: 4 }],
    ['rect', "papier hilfe", { x: 68, y: 106, width: 30, height: 26 }],
    ['rect', "papier kontur", { x: 104, y: 112, width: 52, height: 20 }],
    ['rect', "zeile", { x: 112, y: 121, width: 26, height: 3 }],
  ],
  wartung: [
    ['path', "hilfe", { d: "M18 134H222M30 16V142M210 16V142M26 34h8M26 58h8M26 82h8M26 106h8M206 34h8M206 58h8M206 82h8M206 106h8" }],
    ['path', "kontur", { d: "M44 98H100V60H170M44 110H112V72H170" }],
    ['rect', "papier kontur", { x: 90, y: 90, width: 16, height: 26 }],
    ['path', "kontur", { d: "M94 90v-8h8v8M98 82V74M90 74H106" }],
    ['circle', "flaeche", { cx: 150, cy: 40, r: 16 }],
    ['circle', "kontur", { cx: 150, cy: 40, r: 16 }],
    ['path', "kontur", { d: "M150 40L159 32M150 56V60" }],
    ['path', "hilfe", { d: "M138 40h4M158 40h4M150 28v4" }],
    ['rect', "balken", { x: 164, y: 64, width: 6, height: 12 }],
  ],
  einrichtung: [
    ['path', "hilfe", { d: "M18 134H222M40 16V142M200 16V142M36 30h8M36 50h8M36 70h8M36 90h8M36 110h8M196 30h8M196 50h8M196 70h8M196 90h8M196 110h8" }],
    ['path', "hilfe", { d: "M82 22V136M60 128H180" }],
    ['path', "papier kontur", { d: "M74 20H166V124H74Z" }],
    ['rect', "balken", { x: 144, y: 30, width: 14, height: 14 }],
    ['rect', "zeile", { x: 86, y: 34, width: 34, height: 3 }],
    ['rect', "zeile", { x: 86, y: 42, width: 24, height: 3 }],
    ['rect', "zeile", { x: 86, y: 62, width: 62, height: 3 }],
    ['rect', "zeile", { x: 86, y: 72, width: 54, height: 3 }],
    ['rect', "zeile", { x: 86, y: 82, width: 62, height: 3 }],
    ['rect', "flaeche", { x: 112, y: 96, width: 44, height: 18 }],
    ['rect', "zeile", { x: 86, y: 104, width: 18, height: 3 }],
  ],
  suche: [
    ['path', "hilfe", { d: "M18 134H222M26 30V142M214 30V142" }],
    ['path', "papier hilfe", { d: "M40 28H200V124H40Z" }],
    ['path', "hilfe", { d: "M40 46H200M40 66H200M40 86H200M40 106H200M60 28V124" }],
    ['rect', "hilfe", { x: 46, y: 33, width: 8, height: 8 }],
    ['rect', "hilfe", { x: 46, y: 52, width: 8, height: 8 }],
    ['rect', "hilfe", { x: 46, y: 72, width: 8, height: 8 }],
    ['rect', "hilfe", { x: 46, y: 92, width: 8, height: 8 }],
    ['rect', "zeile", { x: 68, y: 36, width: 34, height: 3 }],
    ['rect', "zeile", { x: 68, y: 55, width: 28, height: 3 }],
    ['rect', "zeile", { x: 68, y: 75, width: 36, height: 3 }],
    ['rect', "zeile", { x: 68, y: 95, width: 24, height: 3 }],
    ['rect', "zeile", { x: 150, y: 36, width: 38, height: 3 }],
    ['rect', "zeile", { x: 150, y: 55, width: 30, height: 3 }],
    ['rect', "zeile", { x: 150, y: 95, width: 34, height: 3 }],
    ['rect', "hilfe", { x: 96, y: 50, width: 60, height: 36 }],
    ['circle', "papier kontur", { cx: 124, cy: 76, r: 26 }],
    ['rect', "zeile", { x: 108, y: 74, width: 32, height: 4 }],
    ['path', "griff", { d: "M143 95L160 112" }],
  ],
  fertig: [
    ['path', "hilfe", { d: "M18 138H222M58 18V146M182 18V146M54 32h8M54 52h8M54 72h8M54 92h8M54 112h8M178 32h8M178 52h8M178 72h8M178 92h8M178 112h8" }],
    ['path', "kontur", { d: "M120 8V20M120 92V98" }],
    ['rect', "papier kontur", { x: 76, y: 20, width: 88, height: 20 }],
    ['rect', "papier kontur", { x: 76, y: 46, width: 88, height: 20 }],
    ['rect', "papier hilfe", { x: 76, y: 72, width: 88, height: 20 }],
    ['rect', "zeile", { x: 86, y: 29, width: 40, height: 3 }],
    ['rect', "zeile", { x: 86, y: 55, width: 34, height: 3 }],
    ['rect', "zeile", { x: 86, y: 81, width: 38, height: 3 }],
    ['rect', "balken", { x: 144, y: 24, width: 12, height: 12 }],
    ['path', "haken", { d: "M146.5 30l2.5 2.5 5-5" }],
    ['rect', "balken", { x: 144, y: 50, width: 12, height: 12 }],
    ['path', "haken", { d: "M146.5 56l2.5 2.5 5-5" }],
    ['rect', "hilfe", { x: 144, y: 76, width: 12, height: 12 }],
    ['path', "papier kontur", { d: "M114 98h12v5h-12zM107 106h26l5 7H102zM102 116h36L120 136z" }],
    ['path', "kontur", { d: "M113 138h14" }],
  ],
  ablage: [
    ['path', "hilfe", { d: "M18 134H222M44 16V142M36 120H96M56 24V142" }],
    ['path', "papier hilfe", { d: "M104 22H150L166 38V108H104Z" }],
    ['path', "hilfe", { d: "M150 22V38H166M116 50H150M116 58H144" }],
    ['path', "papier kontur", { d: "M76 44H124L140 60V128H76Z" }],
    ['path', "kontur", { d: "M124 44V60H140" }],
    ['rect', "zeile", { x: 88, y: 70, width: 34, height: 3 }],
    ['rect', "zeile", { x: 88, y: 80, width: 40, height: 3 }],
    ['rect', "zeile", { x: 88, y: 90, width: 30, height: 3 }],
    ['rect', "balken", { x: 88, y: 104, width: 24, height: 4 }],
    ['path', "hilfe", { d: "M176 134V120M168 128h16" }],
  ],
} as const satisfies Record<string, readonly Teil[]>;

export type LotMotiv = keyof typeof MOTIVE;

/** Das Gebäude mit dem Lot — auch die Modulskizze der Startseite (`Planlinie`). */
export const LOT_MOTIV_BAU = MOTIVE.bau;

/*
  DIE KLASSEN STEHEN AUSGESCHRIEBEN: Tailwind behält Regeln aus
  `@layer components` nur, wenn der Klassenname wörtlich im Quelltext
  vorkommt. Zusammengesetzt (`lot-zeichnung-${art}`) fielen die Größen weg,
  und die Zeichnung füllte die ganze Breite.
*/
const KLASSE = {
  leer: 'lot-zeichnung lot-zeichnung-leer',
  hinweis: 'lot-zeichnung lot-zeichnung-hinweis',
  buehne: 'lot-zeichnung lot-zeichnung-buehne',
} as const;

export default function LotZeichnung({ motiv, art }: { motiv: LotMotiv; art: keyof typeof KLASSE }) {
  return (
    <svg viewBox="0 0 240 150" fill="none" className={KLASSE[art]} data-motiv={motiv} aria-hidden="true" focusable="false">
      {MOTIVE[motiv].map((t, i) => {
        const [tag, klasse, werte] = t;
        if (tag === 'path') return <path key={i} className={klasse} {...werte} />;
        if (tag === 'rect') return <rect key={i} className={klasse} {...werte} />;
        return <circle key={i} className={klasse} {...werte} />;
      })}
    </svg>
  );
}
