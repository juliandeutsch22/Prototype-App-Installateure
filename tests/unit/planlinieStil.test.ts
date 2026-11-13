import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

/*
  DIE GRENZEN DER PLANLINIE (Auftrag 30.10.2026, § 7; E30), soweit sie im
  Stil stehen. Was die Bausteine tun, prüft `tests/components/Planlinie.test.tsx`;
  hier steht, was die Regeln über ihren Ort sagen: jedes Statuszeichen hat
  sein eigenes Zeichen, das Lot steht nur am aktiven Punkt, das Raster nur
  auf Planung, Anmeldung und im dunklen Satz, die Mono-Schrift kommt aus
  dem eigenen Paket (die CSP lässt keine fremden Schriften zu).
*/
const stil = (datei: string) => readFileSync(join('src/styles', datei), 'utf8');
const PLANLINIE = stil('lot-planlinie.css');
const ALLE_STILE = [
  readFileSync('src/index.css', 'utf8'),
  ...readdirSync('src/styles').filter((d) => d.endsWith('.css')).map(stil),
].join('\n');

/** Die Deklarationen eines Selektors in der Planlinie (eine Regel je Zeile). */
function regel(selektor: string): string {
  const zeile = PLANLINIE.split('\n').find((z) => z.trim().startsWith(`${selektor} {`) || z.includes(`, ${selektor} {`));
  expect(zeile, `Regel für ${selektor}`).toBeDefined();
  return zeile!;
}

describe('B3 Statuszeichen', () => {
  const ZEICHEN: [string, string][] = [
    ['.stand-offen::before', 'offen'],
    ['.stand-geplant::before', 'geplant'],
    ['.stand-info::before', 'arbeit'],
    ['.stand-erledigt::before', 'erledigt'],
    ['.stand-warn::before', 'achtung'],
    ['.stand-fehl::before', 'ueberfaellig'],
    ['.stand-storniert::before', 'storniert'],
  ];

  it('jeder der sieben Zustände trägt sein eigenes Zeichen', () => {
    for (const [selektor, name] of ZEICHEN) {
      expect(regel(selektor)).toContain(`mask-image: var(--zeichen-${name})`);
    }
    expect(new Set(ZEICHEN.map(([, n]) => n)).size).toBe(7);
  });

  it('die Zeichen sind gezeichnete SVG mit fester Größe, in der Farbe des Zustands', () => {
    for (const [, name] of ZEICHEN) {
      const definition = PLANLINIE.split('\n').find((z) => z.includes(`--zeichen-${name}:`));
      expect(definition, name).toMatch(/url\("data:image\/svg\+xml,.*width='14' height='14'/);
    }
    // Die Farbe gibt die Fläche hinter der Maske — aus den Grundwerten, nie fest.
    expect(regel('.stand-warn::before')).toContain('background: var(--warning)');
    expect(regel('.stand-fehl::before')).toContain('background: var(--danger)');
  });

  it('Gegenprobe: kein Zustand fällt auf den alten Punkt zurück', () => {
    expect(regel('.stand::before')).toContain('border-radius: 0');
    expect(regel('.stand::before')).toContain('mask-image');
  });
});

describe('B4 Lot in der Navigation', () => {
  it('gleich geblieben: am Handy steht das Lot nur am aktiven Symbol der unteren Leiste', () => {
    expect(regel('.unten-lot')).toContain('display: none');
    expect(regel('.unten-punkt-aktiv .unten-lot')).toContain('display: block');
  });

  /*
    EIN LOT AM SEIL FÜR DIE SEITENLEISTE (E38, 03.11.2026). Das Seil wird nur
    gestreckt, das Blei nur verschoben — die Fahrt läuft über `transform` und
    braucht kein neues Layout. Das Lot je Menüpunkt ist weg.
  */
  it('Seitenleiste: Aufhängung, Seil und Blei stehen einmal da, bewegt nur über transform', () => {
    expect(regel('.navi-seil')).toContain('transform-origin: 0 0; transform: scaleY(0);');
    expect(regel('.navi-seil')).toContain('height: 1px;');
    // E39: das Blei in der Form der Marke, 9 px breit (ungerade) — Seil und Kappe auf einer Pixelspalte.
    expect(PLANLINIE).toMatch(/\n {2}\.navi-blei \{ left: 0; width: 9px; height: 14px;[^}]*mask:/);
    expect(regel('.navi-seil')).toMatch(/left: 4px;/);
    expect(PLANLINIE).toMatch(/\.navi-seil \{ left: 10px; \}\n {4}\.navi-blei \{ left: 6px; \}/);
    expect(PLANLINIE).toContain('.navi-blei[data-ohne-ziel] { opacity: 0; }');
    expect(PLANLINIE).toMatch(/\n {2}\.navi-aufhaengung \{[^}]*height: 1px;/);
    expect(PLANLINIE).not.toContain('.navi-lot');
  });

  it('der aktive Punkt hat keine gefüllte Fläche mehr — das Lot ersetzt sie', () => {
    expect(regel('.navi-punkt-aktiv')).toContain('background: none');
  });
});

describe('B12 Raster — das Zeichenblatt der Arbeitsfläche (E32)', () => {
  /*
    BIS 30.10.2026 nur auf Planung, Anmeldung und im dunklen Satz (Grenze 5
    der Planlinie). Auf Wunsch des Auftraggebers (31.10.2026) trägt die
    Arbeitsfläche das Raster hell wie dunkel; die Planungstabelle hat kein
    eigenes mehr, das an keiner Kante zu dem der Seite passte.
  */
  it('genau drei Gitter: Arbeitsfläche, Anmeldung und der Baustein zum Zeigen', () => {
    const mitGitter = ALLE_STILE.split('\n')
      .filter((z) => /linear-gradient\(var\([^)]+\) 1px, transparent 1px\), linear-gradient\(90deg/.test(z))
      .map((z) => z.trim().split(' {')[0]);
    expect(mitGitter.sort()).toEqual(['.anmelde-buehne', '.hauptflaeche', '.raster']);
  });

  it('hell wie dunkel, nur die Farbe der Linie wechselt — und an der Inhaltskante ausgerichtet', () => {
    expect(PLANLINIE).toContain(':root { --raster-linie: var(--surface-2); }');
    expect(PLANLINIE).toContain(":root[data-theme='dark'] { --raster-linie: var(--surface); }");
    expect(PLANLINIE).not.toMatch(/data-theme='dark'\] \.hauptflaeche/);
    // Die Polster von `.inhalt` (lot.css): 16, 24 bzw. 20, 40 bzw. 24 px.
    expect(PLANLINIE).toContain('background-size: 24px 24px; background-position: 16px 16px; }');
    expect(PLANLINIE).toContain('@media (min-width: 760px) { .hauptflaeche { background-position: 24px 20px; } }');
    expect(PLANLINIE).toContain('@media (min-width: 1200px) { .hauptflaeche { background-position: 40px 24px; } }');
    const lot = readFileSync('src/styles/lot.css', 'utf8');
    expect(lot).toContain('.inhalt { padding: 1rem;');
    expect(lot).toContain('@media (min-width: 760px) { .inhalt { padding: 1.25rem 1.5rem; } }');
    expect(lot).toContain('@media (min-width: 1200px) { .inhalt { padding: 1.5rem 2.5rem; } }');
  });

  it('Zeilen, Umschalter und die Kontextspalte legen keine eigene Fläche — sie liegen im Blatt oder auf dem Raster', () => {
    const INDEX = readFileSync('src/index.css', 'utf8');
    expect(INDEX).toMatch(/\n {2}\.karte \{[^}]*background: transparent;/);
    expect(INDEX).toMatch(/\n {2}\.zeile \{[^}]*background: transparent;/);
    expect(INDEX).toMatch(/\n {2}\.segment \{[^}]*background: transparent;/);
    expect(readFileSync('src/styles/lot.css', 'utf8')).toMatch(/\.arbeitszeile \{[^}]*background: transparent;/);
    const ue = stil('lot-uebersicht.css');
    for (const k of ['.ue-liste', '.ue-liste-woche', '.ue-vergleich', '.ue-zeile', '.mw-zeile', '.mw-zelle-frei']) {
      expect(ue, k).toMatch(new RegExp(`\\n {2}\\${k} \\{[^}]*background: transparent;`));
    }
    expect(stil('lot-akten.css')).toMatch(/\.akten-kontext \{[^}]*background-color: transparent;/);
  });

  it('Gegenprobe: was beim Rollen stehen bleibt, deckt weiter — als Band mit eigener Linie', () => {
    const planung = stil('lot-planung.css');
    for (const k of ['.wp-ecke', '.wp-name']) {
      expect(planung, k).toMatch(new RegExp(`\\${k} \\{[^}]*position: sticky;[^}]*background: var\\(--surface\\);`));
    }
    expect(planung).toMatch(/\.wp-kopf \{ background: var\(--surface\); \}/);
  });

  it('die Planungstabelle schließt oben mit einer Linie und steht an der Inhaltskante', () => {
    expect(stil('lot-planung.css')).toContain('.wp-huelle { display: block; overflow: auto; max-height: 74vh; border-top: 1px solid var(--border); }');
    expect(stil('lot-monat.css')).toContain('.mo-raster { display: block; border-top: 1px solid var(--border); }');
    // Seit E33 ragt keine Karte mehr in den Rand: die Planung ist ein Blatt wie jedes andere.
    expect(readFileSync('src/index.css', 'utf8')).not.toContain(':has(.wp-huelle, .mo-ecke)');
    expect(stil('lot-blatt.css')).toMatch(/\.inhalt \.karte:not\(\.karte \.karte\)[^{]*\{\s*position: relative;\s*margin-inline: 0;/);
  });

  it('die Klasse `raster` trägt nur noch die Musterseite', () => {
    // Als Klasse im Text einer Klassenliste — nicht die Variable `const raster = …`.
    const dateien: string[] = [];
    const gehe = (ordner: string) => {
      for (const e of readdirSync(ordner, { withFileTypes: true })) {
        const pfad = join(ordner, e.name);
        if (e.isDirectory()) gehe(pfad);
        else if (pfad.endsWith('.tsx') && /(["'`]|\s)raster(["'`]|\s(?!=))/.test(readFileSync(pfad, 'utf8'))) dateien.push(pfad);
      }
    };
    gehe('src');
    expect(dateien.sort()).toEqual(['src/features/muster/MusterPlanlinie.tsx']);
  });
});

describe('Schrift', () => {
  it('IBM Plex Mono kommt aus dem eigenen Paket, nicht aus dem Netz', () => {
    const start = readFileSync('src/main.tsx', 'utf8');
    expect(start).toContain("import '@fontsource/ibm-plex-mono/latin-400.css'");
    expect(ALLE_STILE).not.toMatch(/fonts\.googleapis|fonts\.gstatic/);
    expect(readFileSync('src/index.css', 'utf8')).toMatch(/--schrift-mono: 'IBM Plex Mono'/);
  });
});

/*
  RÜCKMELDUNG 31.10.2026: Auf der Startseite stand das Statuswort („⚠ nicht
  gebucht“) höher und kleiner als das Detail daneben. Die Zeile nahm ihre
  Grundlinie vom Zeichen ohne Text; das Wort war einen Grad kleiner.
*/
describe('Statuswort auf der Grundlinie des Texts', () => {
  const INDEX = readFileSync('src/index.css', 'utf8');
  const START = stil('lot-start.css');

  it('das Wort richtet sich an der Grundlinie aus, das Zeichen ebenso (seit 03.11.2026, mittig zur Schrift)', () => {
    expect(INDEX).toMatch(/\n {2}\.stand \{ display: inline-flex; align-items: baseline;/);
    // Bis 03.11.2026 stand das Zeichen mittig in der Box — 2,5 px unter der Mitte der Buchstaben.
    expect(regel('.stand::before')).toContain('align-self: baseline');
  });

  it('auf der Startseite ist das Statuswort so groß wie das Detail der Zeile', () => {
    const groesse = (selektor: string) => START.match(new RegExp(`${selektor.replace(/[.]/g, '\\.')} \\{ font-size: ([0-9.]+rem)`))?.[1];
    expect(groesse('.start-seite .start-zeile .stand')).toBeDefined();
    expect(groesse('.start-seite .start-zeile .stand')).toBe(groesse('.start-seite .start-zeile .text-meta'));
  });
});

/*
  RÜCKMELDUNG 02.11.2026: Text und Zeichen lagen auf der Linie der Blätter,
  und im Schriftfeld endete die obere Linie nach dem dritten Feld. Im Browser
  misst `tests/durchklick/rand.spec.ts` jeden Abstand; hier stehen die Regeln,
  die ihn tragen, damit `npm test` eine Rücknahme schon sieht.
*/
describe('Abstand zur Linie und die obere Linie des Schriftfelds (02.11.2026)', () => {
  const START = stil('lot-start.css');
  const UEBERSICHT = stil('lot-uebersicht.css');
  /** Die Deklarationen eines Selektors in einer Stildatei (die erste Regel, die mit ihm beginnt). */
  const deklarationen = (css: string, selektor: string) => {
    const zeile = css.split('\n').find((z) => z.trim().startsWith(`${selektor} {`));
    expect(zeile, `Regel für ${selektor}`).toBeDefined();
    return zeile!;
  };

  /* Das Polster ist das der Blätter (`--blatt-rand`, E86): eine Zelle ab dem Tablet, 16 px am Handy. */
  it('die Zeilen der Startseite stehen so weit von der Linie wie der Kartenkopf darüber', () => {
    expect(deklarationen(START, '.start-seite .start-zeile')).toContain('padding: 0.875rem var(--blatt-rand);');
    expect(deklarationen(START, '.start-seite .start-abschnitt')).toContain('padding: 1rem var(--blatt-rand) 0.5rem;');
    expect(deklarationen(START, '.start-seite .start-weiter')).toContain('padding: 0.5rem var(--blatt-rand);');
    expect(deklarationen(START, '.start-seite .start-terminfolge')).toContain('margin: 0 var(--blatt-rand) 0 var(--blatt-rand-einzug);');
    expect(deklarationen(START, '.start-einsatz')).toContain('padding: 1rem var(--blatt-rand);');
    expect(deklarationen(START, '.start-karte-verweis')).toContain('margin: 0.5rem var(--blatt-rand) 0;');
  });

  it('der Vergleich der Mitarbeiterübersicht hat auch am Handy sein Polster', () => {
    expect(deklarationen(UEBERSICHT, '.ue-vergleich-zeile')).toContain('padding: 1rem;');
    expect(deklarationen(UEBERSICHT, '.ue-vergleich .abschnitt')).toContain('padding: 1rem 1rem 0.5rem;');
    expect(UEBERSICHT).toContain('.ue-massstab { display: block; margin: 0; padding: 0.75rem 1rem 0.25rem;');
  });

  it('das Schriftfeld trägt die obere Linie über die ganze Breite, eine angebrochene Reihe führt sie zu Ende', () => {
    expect(regel('.schriftfeld::before')).toMatch(/left: 0; right: 0;.*border-top: 1px solid var\(--border-strong\)/);
    expect(regel('.schriftfeld .lage-zeile::after')).toMatch(/flex: 1 1 0;.*border-top: 1px solid var\(--border-strong\)/);
  });

  it('am Tablet sieben Zellen je Feld mit 12 px Polster rundum; die Skizze hält Abstand zu den Feldlinien', () => {
    const tablet = PLANLINIE.slice(PLANLINIE.indexOf('@media (min-width: 760px) and (max-width: 1199px)'));
    const block = tablet.slice(0, tablet.indexOf('\n  }'));
    expect(block).toContain('.schriftfeld .lage-punkt { flex-basis: 168px; }');
    expect(block).toContain('.schriftfeld .lage-eintrag { padding: 0.75rem; }');
    expect(block).toContain('.schriftfeld-skizze { flex-basis: 96px; }');
    expect(regel('.schriftfeld-skizze')).toContain('padding: 0 0.75rem;');
  });

  it('gleich geblieben: am Schreibtisch zehn Zellen je Feld mit 24 px Polster seitlich', () => {
    expect(regel('.schriftfeld .lage-punkt')).toContain('flex: 0 0 240px;');
  });

  /*
    AM HANDY EINE RUHIGE LISTE (E86, ersetzt die sieben Zellen je Feld):
    Bezeichnung links, Wert rechts, Zeilen von 48 px; Nullen, Ladendes und
    was am Handy schon anderswo steht, fallen weg — bleibt nichts, fehlt das
    Feld samt Lineal.
  */
  it('am Handy steht der Stand als Liste mit 48-px-Zeilen; Null, Laden und Doppeltes fehlen', () => {
    const handy = PLANLINIE.slice(PLANLINIE.indexOf('@media (max-width: 759px) {\n    .schriftfeld'));
    const block = handy.slice(0, handy.indexOf('\n  }'));
    expect(block).toContain('.schriftfeld .lage-zeile { display: flex; flex-direction: column;');
    expect(block).toMatch(/\.schriftfeld \.lage-eintrag \{ display: grid; grid-template-columns: minmax\(0, 1fr\) auto;[^}]*min-height: 3rem; padding: 0\.75rem 1rem;/);
    expect(block).toContain('.schriftfeld .lage-punkt-null, .schriftfeld .lage-punkt-laedt, .schriftfeld .lage-punkt-breit');
    expect(block).toContain('.schriftfeld:not(:has(.lage-punkt:not(.lage-punkt-null, .lage-punkt-laedt, .lage-punkt-breit))) { display: none; }');
    expect(block).toContain('.lineal { display: none; }');
    // Eine Warnung wird ein Hinweis mit farbiger Kante, nicht nur farbige Ziffern.
    expect(block).toContain('.schriftfeld .lage-punkt-achtung { background: var(--warning-bg);');
    expect(block).not.toContain('flex-basis: 168px');
  });

  /*
    LUFT IM SCHRIFTFELD (Auftrag 03.11.2026: „die Abstände sehen so klein aus,
    alles wirkt zusammengepfercht“). Beschriftung und Wert lagen an den
    Feldlinien; jetzt je eine halbe Zelle darüber und darunter — das Feld
    wird drei Zellen hoch und bleibt auf dem Raster. Ein Wort im Feld bricht
    um, statt ins Nachbarfeld zu laufen („Einheitspreis nach Aufmaß“).
  */
  it('Beschriftung und Wert haben oben und unten eine halbe Zelle Luft, in jeder Breite', () => {
    expect(regel('.schriftfeld .lage-eintrag')).toContain('padding: 0.75rem 1.5rem;');
    const handy = PLANLINIE.slice(PLANLINIE.indexOf('@media (max-width: 759px) {\n    .schriftfeld'));
    // Am Handy als Listenzeile: dieselbe halbe Zelle oben und unten, 16 px seitlich (E86).
    expect(handy.slice(0, handy.indexOf('\n  }'))).toMatch(/\.schriftfeld \.lage-eintrag \{[^}]*padding: 0\.75rem 1rem;/);
  });

  /*
    DAS ZUSTANDSZEICHEN MITTIG ZUR SCHRIFT (Auftrag 03.11.2026: „die Icons
    sind nicht mit dem Text zentriert“). Mittig in der 22 px hohen Box lag es
    2,5 px unter der Mitte der Buchstaben, die oben in der Box stehen. Jetzt
    auf der Grundlinie, um den Rest bis zur halben Versalhöhe gerückt.
  */
  it('das Zustandszeichen sitzt auf der Grundlinie der Schrift, nicht mittig in der Box', () => {
    const zeichen = regel('.stand::before');
    expect(zeichen).toContain('align-self: baseline;');
    // 7 px (halbes Zeichen) − 0,35 em: 13 px Schrift → 2,5 px, die 12-px-Zeilen der Startseite → 2,75 px.
    expect(zeichen).toContain('position: relative; top: 2.5px;');
    expect(stil('lot-start.css')).toContain('.start-seite .start-zeile .stand::before { top: 2.75px; }');
    expect(zeichen).not.toContain('align-self: center;');
  });

  it('rechts in der Startzeile steht das Statuswort mittig in seiner Box, wie der Pfeil daneben', () => {
    expect(stil('lot-start.css')).toContain('.start-seite .start-status-rechts .stand { line-height: 1.375rem; }');
  });

  it('ein Wort im Schriftfeld bricht um, statt über die Feldlinie zu laufen', () => {
    expect(regel('.schriftfeld .lage-wert-wort')).toMatch(/white-space: normal;.*overflow-wrap: anywhere;/);
  });
});

/*
  DURCHSICHT DER OBERFLÄCHE (09.11.2026): Titel am Handy, lange Namen,
  die untere Leiste und die Rückmeldung beim Antippen.
*/
describe('Durchsicht 09.11.2026', () => {
  const FEIN = stil('lot-feinschliff.css');

  /*
    SEIT E86 groß mit Luft: 28 px, in der Akte 24 px. Das Polster rechnet
    `useKopfTitel` aus der gemessenen Höhe (tests/components/KopfTitel.test.tsx);
    ohne Messung gilt eine Viertelzelle, damit ein Titel einzeilig 48 px hat.
  */
  it('am Handy steht der Titel groß, und sein Polster kommt aus der Messung auf dem Raster', () => {
    const handy = PLANLINIE.slice(PLANLINIE.indexOf('@media (max-width: 759px) {\n    .seitenkopf h1'));
    const block = handy.slice(0, handy.indexOf('\n  }'));
    expect(block).toContain('.seitenkopf h1 { font-size: 1.75rem; line-height: 2.25rem; padding-block: var(--titel-luft, 0.375rem); }');
    expect(block).toContain('.akten-kopf .seitenkopf h1 { font-size: 1.5rem; line-height: 2rem; }');
    expect(PLANLINIE).not.toContain('font-size: 1.25rem; line-height: 1.5rem; padding-block: 0.75rem;');
    // Gleich bleibt: Tablet und Schreibtisch mit 48-px-Zeile.
    expect(PLANLINIE).toContain('@media (min-width: 760px) { .seitenkopf h1 { font-size: 1.875rem; line-height: 3rem; } }');
  });

  it('der grosse Name der Einsatzkarte trennt lange Wörter mit Strich, kurze nicht', () => {
    expect(stil('lot-start.css')).toMatch(/\.start-einsatz-titel\.kein-trennen \{ hyphens: auto;[^}]*hyphenate-limit-chars: 13 6 5;/);
  });

  it('die untere Leiste lässt dem Wort die volle Fünftelbreite', () => {
    const LOT = stil('lot.css');
    expect(LOT).toMatch(/\.unten-punkt, \.unten-punkt-aktiv \{[^}]*padding: 0\.5rem 0 0\.625rem;/);
    expect(LOT).toMatch(/\.unten-text \{[^}]*padding: 0; \}/);
  });

  it('die Summenzeile im Rechnungsblatt steht eine Zelle vom Rand wie die Zeilen', () => {
    expect(stil('lot-blatt.css')).toMatch(/\.karte\) \.rechnungen-summe \{ min-height: 48px; padding: 12px var\(--blatt-rand\) 11px;/);
  });

  it('ein langer Suchhinweis endet mit Auslassungspunkten statt mitten im Wort', () => {
    expect(stil('lot.css')).toMatch(/\.listenleiste-suche input \{[^}]*text-overflow: ellipsis; \}/);
  });

  it('eine antippbare Zeile färbt sich beim Drücken, ohne Geometrie zu bewegen', () => {
    expect(FEIN).toContain('.zeile-ganz:active, .mehr-laden:active, .start-weiter:active, .mehr-punkt:active { background: var(--petrol-hell); }');
    expect(FEIN).toContain('transition: background-color var(--motion-press) var(--ease-response), color var(--motion-press) var(--ease-response);');
    expect(FEIN).toContain('.checkbox:checked { animation: lot-haken var(--motion-state)');
    // Keine Grössen- oder Lageanimation an Zeilen und Zähler (Premium-Linie).
    const block = FEIN.slice(FEIN.indexOf('ANTIPPEN UND KLEINE BESTÄTIGUNGEN'), FEIN.indexOf('@keyframes lot-haken'));
    expect(block).not.toMatch(/transform|scale|height|width/);
  });

  it('ein Aufklapper zeigt seinen Pfeil fest rechts und dreht ihn beim Öffnen', () => {
    const LOT = stil('lot.css');
    expect(LOT).toMatch(/\.weiteres-kopf::after, \.weiteres-knopf::after \{[^}]*position: absolute; right: 0; top: 50%;/);
    expect(LOT).toContain("details[open] > .weiteres-kopf::after, .weiteres-knopf[aria-expanded='true']::after { transform: translateY(-50%) rotate(180deg); }");
    // Platz für den Pfeil, auch am Knopf-Aufklapper, der seinen Innenabstand selbst setzt.
    expect(LOT).toContain('.weiteres-kopf, .weiteres-knopf { position: relative; padding-right: 1.75rem; }');
    expect(stil('lot-verwaltung.css')).toMatch(/\.weiteres-knopf \{[^}]*padding: 0 1\.75rem 0 0;/);
    expect(FEIN).toContain(':is(.weiteres-kopf, .weiteres-knopf)::after { transition: none !important; }');
  });

  it('der Textknopf der Planung ist weg — Nebenhandlungen sind Zweitknöpfe', () => {
    expect(ALLE_STILE).not.toContain('.wp-textknopf');
    for (const datei of ['src/features/assignments/HandyWoche.tsx', 'src/features/assignments/Einsatzplanung.tsx']) {
      expect(readFileSync(datei, 'utf8')).not.toContain('wp-textknopf');
    }
  });

  it('Hinweis und Änderungsprotokoll der Zeiterfassung stehen im Blatt eine Zelle vom Rand', () => {
    const BLATT = stil('lot-blatt.css');
    expect(BLATT).toMatch(/\.zeit-fenster-hinweis \{ padding-inline: var\(--blatt-rand\); \}/);
    expect(BLATT).toMatch(/\.zeit-verlauf > \.weiteres > \.weiteres-kopf \{ padding-inline: var\(--blatt-rand\) var\(--blatt-rand-pfeil\); \}/);
    // Das Ende der Liste im Takt: beide Handlungen 48 px hoch, der Hinweis eine Zelle plus eine halbe.
    const ZEIT = stil('lot-zeit.css');
    expect(ZEIT).toContain('.zeit-verlauf > .weiteres > .weiteres-kopf { min-height: 3rem; padding: 0.75rem 2.75rem 0.75rem 1rem;');
    expect(ZEIT).toContain('.zeit-fenster-hinweis { padding: 0 1rem 0.75rem; font-size: 0.8125rem; line-height: 1.5rem;');
  });

  it('das Gespräch ist kein Fremdkörper: am Schreibtisch ein Blatt mit dem Posteingang, am Handy randlos (E71)', () => {
    const N = stil('lot-nachrichten.css');
    expect(N).toMatch(/\.nachrichten-raster \{ gap: 0; height: 76dvh;[^}]*border: 1px solid var\(--border\); background: var\(--surface\); \}/);
    expect(N).toContain('.nachrichten-raster > .chat { min-height: 0; border: 0; }');
    expect(N).toContain('.chat { margin: 0 var(--takt-auslauf, -1rem) 0 -1rem; border-inline: 0; border-bottom: 0; }');
    // Apple-nah: Zeit über der Gruppe, nicht in der Blase; Zipfel an der letzten Blase.
    expect(N).not.toContain('.nachricht-zeit');
    expect(N).toMatch(/\.nachricht\[data-ende\]:not\(\[data-eigene\]\) \.nachricht-blatt:not\(\[data-weg\]\)::before/);
  });

  it('bei reduzierter Bewegung entfallen auch diese Rückmeldungen', () => {
    const reduziert = FEIN.slice(FEIN.lastIndexOf('@media (prefers-reduced-motion: reduce)'));
    expect(reduziert).toContain(':is(.zeile-ganz, .arbeitszeile-inhalt, .mehr-laden, .start-weiter, .mehr-punkt, .checkbox, .lot-zahl-neu) { animation: none !important; transition: none !important; }');
  });
});

/*
  E72 MATERIAL UND PLATTFORM (09.11.2026). Gemessen in der Vorschau: die
  Liste der Anforderungen sprang beim ersten Haken um 96 px, die Suche dort
  wechselte mit dem Reiter von 294 auf 480 px, der Zustand der Lagerliste
  stand je Zeile 14 px anders, „Status von Hand“ stand in drei Breiten unter
  Knöpfen voller Breite, beide Knöpfe des Warenkorbs brachen bei 390 px um,
  und unter dem letzten Supportzugang stand eine Linie ohne Folgezeile.
  Gegenprobe: mit dem Stand davor ist jede dieser Prüfungen rot.
*/
describe('E72 Material und Plattform', () => {
  const MAT = stil('lot-material.css');
  const PLATTFORM = stil('lot-plattform.css');

  it('die Sammelleiste klebt ab dem Tablet unten, statt die Liste zu verschieben', () => {
    expect(MAT).toContain('@media (min-width: 760px) { .anf-seite > .sammelleiste { top: auto; bottom: var(--reiter-hoehe, 0px); } }');
    const quelle = readFileSync('src/features/orders/AdminOrdersView.tsx', 'utf8');
    // Hinter der Liste: die Leiste steht im Quelltext nach dem Ende der Karte.
    expect(quelle.indexOf('<Sammelleiste')).toBeGreaterThan(quelle.indexOf("title={tab === 'retouren' ? 'Retouren'"));
  });

  it('die Suche der Anforderungen behält beim Reiterwechsel ihre Breite', () => {
    expect(MAT).toContain('@media (min-width: 760px) { .anf-leiste .listenleiste-suche { flex: 0 1 18rem; } }');
  });

  it('Lagerzeile: Maßlinie und Zahlen in derselben festen Breite, Zustand in fester Spalte', () => {
    expect(MAT).toMatch(/\.lager-masslinie \{ display: block; width: 15rem; max-width: 100%; white-space: normal; text-align: left; \}/);
    expect(MAT).toContain('.zeile-zustand:has(> .lager-ohne-zustand) { display: none; }');
    // Am Handy über die ganze Breite des Texts wie bei den Rechnungen (E41).
    expect(MAT).toContain('.zeile-stand .zeile-wert:has(> .lager-masslinie) { flex: 1 1 100%; }');
  });

  it('im Seitenfenster einer Anforderung eine Knopfgestalt: auch der Status von Hand untereinander', () => {
    expect(MAT).toContain('.material-status { display: flex; flex-direction: column; gap: 0.5rem; }');
    expect(MAT).toContain('.material-aktionen { display: flex; flex-direction: column; gap: 0.5rem; }');
  });

  it('der Warenkorb am Handy: „Leeren“ in seiner Breite, das Abschicken nimmt den Rest', () => {
    expect(MAT).toContain('.korb-knoepfe { display: grid; grid-template-columns: auto minmax(0, 1fr); gap: 0.5rem; width: 100%; }');
    expect(MAT).not.toContain('minmax(0, 2fr)');
  });

  it('Supportzugänge: die Linie steht zwischen den Einträgen, nicht unter dem letzten', () => {
    expect(PLATTFORM).toMatch(/\.plattform-supportzeile \{[^}]*padding: 1\.25rem 0; \}/);
    expect(PLATTFORM).not.toMatch(/\.plattform-supportzeile \{[^}]*border-bottom/);
    expect(PLATTFORM).toContain('.plattform-supportzeile + .plattform-supportzeile { border-top: 1px solid var(--border); }');
  });

  it('gleich geblieben: die Knöpfe der Plattform behalten ihr Polster, die Zeilen ihre Höhe aus dem Inhalt', () => {
    expect(PLATTFORM).not.toMatch(/padding-inline: 0/);
    expect(PLATTFORM).not.toContain('.plattform .zeile-ziel');
  });
});

/*
  E72 TEAM UND VERWALTUNG (09.11.2026): Start, Zeit, Team, Einstellungen,
  Nachrichten, Navigation. Gegenprobe je Regel: mit dem Stand vor E72 rot.
*/
describe('E72 Team und Verwaltung', () => {
  const quelle = (pfad: string) => readFileSync(pfad, 'utf8');
  const START = stil('lot-start.css');
  const TIMER = stil('lot-timer.css');
  const NACHRICHTEN = stil('lot-nachrichten.css');

  it('Reiterleiste: 48 px samt Linie, kein eigener Abstand, Schrift auf der Titelflucht (R12)', () => {
    const reiter = quelle('src/components/Unterreiter.tsx');
    expect(reiter).toContain('className="reiterleiste flex gap-x-6 overflow-x-auto shadow-[inset_0_-1px_0_0_var(--border)] lg:flex-wrap lg:overflow-visible"');
    expect(reiter).not.toMatch(/mb-4 reiterleiste|reiterleiste[^"]*border-b border-line/);
    expect(reiter).toContain("'lot-reiter min-h-touch whitespace-nowrap border-b-2 px-0 py-2 text-sm'");
  });

  it('Wochenköpfe in „Meine Einträge“ auf der Flucht des Blatts, 48 px hoch (M7)', () => {
    const abschnitt = quelle('src/components/Abschnitt.tsx');
    expect(abschnitt).toContain('className="-my-3 flex min-h-touch w-full items-center gap-3 px-0 py-2 text-left"');
    expect(abschnitt).not.toContain('className="abschnitt p-0"');
  });

  it('Startseite: Kontakt mit Symbol, Einsatz in der Hauptspalte bis 1.199 px, Zusatz folgt dem Titel', () => {
    expect(START).not.toContain('.start-einsatz-kontakt svg { display: none; }');
    expect(START).not.toContain('.start-wie-zuletzt');
    expect(START).not.toContain('grid-template-columns: minmax(0, 1fr) 15rem');
    expect(START).toContain('.start-rahmen { grid-template-columns: minmax(0, 1fr) 19.5rem; gap: 1.5rem; }');
    expect(START).toContain('.start-kontext .start-karte-kopf h2 { display: block; font-size: 0.8125rem; line-height: 1.375rem; }');
    expect(START).toMatch(/\.start-einsatz-name\.kein-trennen, \.start-einsatz-titel\.kein-trennen \{ hyphens: auto;/);
    expect(START).toContain('.start-kontext .einsatz-knoepfe { flex-direction: column; }');
  });

  it('Arbeitstag als Blatt: Linie in --border-strong, 24 px Polster, vom Taktgeber ausgerichtet (M8)', () => {
    expect(TIMER).toContain('.arbeitstag { position: relative; padding: 1.5rem; border: 0; background: var(--surface); box-shadow: 1px 0 0 var(--border-strong), 0 1px 0 var(--border-strong), 1px 1px 0 var(--border-strong); }');
    expect(TIMER).not.toContain('.link.arbeitstag-verwerfen');
    expect(quelle('src/lib/takt.ts')).toContain('.plattform-kontext, .arbeitstag)');
  });

  it('Timer-Leiste: 48 px, Linie in --border-strong, an der Kante der Blätter (M8)', () => {
    expect(TIMER).toMatch(/\.timer-leiste \{[^}]*padding: 0\.125rem 0\.125rem 0\.125rem 1rem;[^}]*box-shadow: inset 0 1px 0 var\(--border-strong\); \}/);
    expect(TIMER).not.toMatch(/\.timer-leiste \{[^}]*border-top/);
    expect(TIMER).toContain('max-width: var(--takt-breite, none); margin: 1.5rem 1.5rem 0;');
    expect(TIMER).toContain('.timer-leiste-breit { margin-inline: 2.5rem; }');
  });

  it('Nachrichten: Filter mit 44 px, Neue Nachricht auf einer linken Kante, Tablet-Spalte in ganzen Zellen (M9, N6)', () => {
    expect(NACHRICHTEN).toMatch(/\.chat-chip \{[^}]*min-height: 2\.75rem;/);
    expect(NACHRICHTEN).toContain('.neu-abschnitt { margin: 0.5rem 0 0.25rem;');
    expect(NACHRICHTEN).toContain('.neu-liste { list-style: none; margin: 0 -0.5rem;');
    expect(NACHRICHTEN).toContain('grid-template-columns: minmax(16rem, 21rem) minmax(0, 1fr)');
  });

  it('Mein Einsatzplan: Kalender 18 Zellen, eine Zelle Fuge (M5)', () => {
    const plan = quelle('src/features/assignments/MyScheduleView.tsx');
    expect(plan).toContain('grid grid-cols-1 gap-6 lg:grid-cols-[27rem_minmax(0,1fr)]');
    expect(plan).not.toContain('lg:grid-cols-5');
    expect(plan).not.toContain('im Kalender links nachschlagen');
  });

  it('Handlungen als Knöpfe, Füße nach R7, frei stehend nie klein (M3, M9, N13)', () => {
    // Benutzer anlegen: am Handy der Hauptknopf oben, beide volle Breite.
    expect(quelle('src/features/users/UserMgmtView.tsx')).toContain('<div className="fuss-aktionen flex-col-reverse md:flex-row">');
    // Standardfelder: gefüllt im Fuß wie jede Speichern-Aktion der Einstellungen.
    const standard = quelle('src/features/settings/StandardZeitfelder.tsx');
    expect(standard).toContain('<div className="fuss-aktionen mt-4"><Button disabled={!geaendert || speichert}');
    expect(standard).not.toContain('<Button variant="secondary" disabled={!geaendert');
    // Zeit bearbeiten: Aufteilen als Zweitknopf statt 20-px-Link.
    expect(quelle('src/features/time/TimeForm.tsx')).toMatch(/<Button type="button" variant="secondary" className="self-start" onClick=\{\(\) => setAufteilenOffen\(true\)\}>/);
    // Zu meinen Einträgen: Zweitknopf statt Petrol-Text.
    expect(quelle('src/features/time/TimeView.tsx')).not.toContain('text-sm font-normal text-accent-deep sm:hidden');
    // Hinweis ausblenden: frei stehend, normale Größe.
    expect(quelle('src/features/settings/FirmendatenView.tsx')).not.toContain('<Button variant="secondary" groesse="klein" onClick={hinweisAusblenden}>');
  });

  it('Schalterlisten mit 8 px, Einrichtungsstand am Handy vier Zellen hoch, Untertitel einzeilig (N1, N10, N11)', () => {
    expect(quelle('src/features/settings/SettingsView.tsx')).toMatch(/<div className="space-y-2">\s*<CheckboxField\s*id="wochenplanFuerAlle"/);
    expect(quelle('src/features/settings/NotificationSettings.tsx')).not.toContain('<div className="space-y-1">');
    expect(quelle('src/features/settings/EinstellungenUebersicht.tsx')).toContain('<div className="einrichtung-masslinie max-md:mt-3">');
    expect(quelle('src/features/settings/ZeitfelderView.tsx')).toContain('subtitle="Standardfelder und eigene Angaben je Buchung"');
    expect(quelle('src/features/nachrichten/NachrichtenEinstellungen.tsx')).toContain('subtitle="Aufbewahrung und gemeldete Nachrichten"');
  });

  it('gleich geblieben: Reiter behalten ihre Tastfläche, der große Einsatzname seine Trennregel', () => {
    expect(quelle('src/components/Unterreiter.tsx')).toContain('min-h-touch');
    expect(START).toContain('hyphenate-limit-chars: 13 6 5;');
    expect(START).toContain('.start-einsatz-titel { font-size: 1.375rem; line-height: 1.875rem; }');
  });
});

/*
  E72 AUFTRÄGE UND PLANUNG (09.11.2026): Angebote, Baustellen- und
  Kundenakte, Einsatzplanung, Termine, Liegenschaften, Scheine. Jede Prüfung
  hält die Stelle fest, an der der Befund stand — mit der alten Fassung
  schlägt sie fehl (Gegenprobe im Kommentar), mit der neuen nicht.
*/
describe('E72 Aufträge und Planung', () => {
  const quelle = (pfad: string) => readFileSync(pfad, 'utf8');
  const AKTEN = stil('lot-akten.css');
  const PLANUNG = stil('lot-planung.css');
  const MONAT = stil('lot-monat.css');
  /** Die Regeln eines Selektors (eine Regel je Zeile), über alle Treffer. */
  const regeln = (css: string, selektor: string) => css.split('\n').filter((z) => z.trim().startsWith(`${selektor} {`)).join('\n');

  it('Handlungen sind Knöpfe, kein Text (A1, A2)', () => {
    // Gegenprobe: vorher standen „Bearbeiten“ und „Neue Fassung“ als `.link` mit px-4 neben gerahmten Knöpfen.
    const angebot = quelle('src/features/quotes/AngebotView.tsx');
    expect(angebot).not.toContain('className="link inline-flex min-h-touch items-center px-4 text-sm"');
    expect(angebot).toContain('<KnopfLink to={`/quotes?neueFassung=${q.id}`} variant="secondary">');
    expect(angebot).toContain('<KnopfLink to={`/quotes?bearbeiten=${q.id}`} variant="secondary">');
    const akte = quelle('src/features/projects/BaustellenakteView.tsx');
    expect(akte).toMatch(/<KnopfLink\s+to=\{`\/worksheet\?projekt=\$\{encodeURIComponent\(b\.projectNumber\)\}`\}\s+variant="secondary"\s+groesse="klein"\s*>\s*Handwerksschein schreiben/);
    expect(quelle('src/components/SignaturePad.tsx')).toContain("className={`${knopfKlassen('secondary')} mt-2 shrink-0 lg:hidden`}");
    // Von Hand gebaute Knöpfe: Schatten, halbfett, Skalierung, graue Fläche.
    expect(quelle('src/features/worksheets/WorkSheetsListView.tsx')).not.toContain('shadow-sm transition hover:bg-surface-2 active:scale-[0.98]');
    const schein = quelle('src/features/worksheets/WorkSheetView.tsx');
    expect(schein).not.toContain("'cursor-pointer bg-surface-2 text-ink active:scale-[0.98]'");
    expect(schein).toContain("className={`${knopfKlassen('secondary')} mt-3 w-full sm:w-auto ${");
    // Blättern im Monatskalender seit E74 wie die Wochenleiste: schlichte Zeichen ‹ › (vorher gerahmt, R8).
    const kalender = quelle('src/components/MonthCalendar.tsx');
    expect(kalender).not.toContain('rounded text-lg font-semibold text-ink-muted hover:bg-surface-2');
    expect(kalender).toContain('<IconButton label="Vorheriger Monat" onClick={() => onShiftMonth(-1)}>');
    expect(kalender).toContain('<IconButton label="Nächster Monat" onClick={() => onShiftMonth(1)}>');
    expect(kalender).not.toMatch(/<Button type="button" variant="secondary" onClick=\{\(\) => onShiftMonth/);
  });

  it('Telefon, E-Mail und Adresse in der Akte mit Linie und Symbol wie überall (A1)', () => {
    // Gegenprobe: `.akten-kontext svg, .akten-mobil-kontakt svg { display: none; }` und `text-decoration: none`.
    expect(AKTEN).not.toMatch(/\.akten-(kontext|mobil-kontakt) svg[^{]*\{ display: none; \}/);
    expect(AKTEN).not.toMatch(/\.link-kontakt \{ text-decoration: none; \}/);
    expect(quelle('src/features/customers/KundenakteView.tsx')).toContain('<a className="link-weiter akten-verweis" href="#kunde-kontext">Kontakt</a>');
    expect(quelle('src/features/projects/BaustellenakteView.tsx')).toContain('<a className="link-weiter akten-verweis" href="#baustelle-kontext">Adresse und Kontakt</a>');
    // 44 px für „Wartungen öffnen“ im Kopf der Kontextspalte (vorher 40).
    expect(AKTEN).toContain('.akten-kontext .karte-kopf .akten-verweis { font-size: 0.75rem; line-height: 1rem; padding-block: 0.875rem; margin-block: -0.875rem; }');
  });

  /* Seit E86 (D6): bis vier gleich breit in einer Zeile, mehr rollen mit auslaufender Kante — nicht mehr zwei Reihen. */
  it('Aktenreiter am Handy: bis vier gleich breit, mehr rollen; jeder mit 44 px', () => {
    expect(AKTEN).not.toContain('.akten-bereiche { flex-wrap: wrap;');
    expect(AKTEN).toContain('.akten-bereiche:not([data-viele]) { display: grid; grid-auto-flow: column; grid-auto-columns: minmax(0, 1fr); gap: 0; overflow-x: visible; }');
    expect(quelle('src/index.css')).toContain(':is(.reiterleiste, .akten-bereiche)[data-mehr-rechts] {');
    expect(quelle('src/components/AktenBereiche.tsx')).toContain("data-viele={bereiche.length > 4 ? '' : undefined}");
    expect(regeln(AKTEN, '.akten-reiter')).toContain('min-width: 2.75rem;');
  });

  it('gleich geblieben: ab dem Tablet läuft die Reiterleiste in einer Zeile', () => {
    expect(regeln(AKTEN, '.akten-bereiche')).toContain('.akten-bereiche { display: flex; align-items: stretch; gap: 1.5rem; border-bottom: 1px solid var(--border); overflow-x: auto; scrollbar-width: none; }');
  });

  it('Positionen am Handy: Betrag unter der Bezeichnung (D3)', () => {
    expect(quelle('src/features/quotes/PositionenTabelle.tsx')).toContain('<table className="tabelle stueckliste positionen-tabelle">');
    expect(AKTEN).toContain('.positionen-tabelle tbody tr { grid-template-columns: 2.5rem minmax(0, 1fr); }');
    expect(AKTEN).toContain('.positionen-tabelle tbody td.r { grid-column: 1 / -1;');
  });

  it('Monatsvorschau: Fenster der Linie — eckig, ohne Schatten, „Schließen“, Fuß nach R7, nicht über der Navigation (B2, E2, D7, A3, E1)', () => {
    const vorschau = regeln(MONAT, '.vorschau');
    // Gegenprobe: vorher `border-radius: 12px; box-shadow: var(--shadow-lg)` und 18 px Innenrand.
    expect(vorschau).toContain('border-radius: 0;');
    expect(vorschau).not.toContain('box-shadow');
    expect(MONAT).not.toContain('.vorschau-zu');
    expect(MONAT).toContain('.vorschau-kopf { display: flex; align-items: center; justify-content: space-between; gap: 0.75rem; padding: 1rem 1.25rem;');
    expect(MONAT).toContain('.vorschau-fuss { display: flex; flex-wrap: wrap; justify-content: flex-end; gap: 0.5rem; margin-top: -1px; padding: 0.75rem 1.25rem; border-top: 1px solid var(--border); }');
    expect(MONAT).toContain('    .vorschau-fuss { flex-direction: column-reverse; padding: 0.75rem 1rem; }');
    const tsx = quelle('src/features/assignments/MonatsVorschau.tsx');
    expect(tsx).toContain('className="fenster-schliessen" aria-label="Vorschau schließen"');
    expect(tsx).not.toContain('groesse="klein" onClick={() => einsatz(haupt.start)}');
    expect(tsx).toContain("const links = (document.querySelector('main')?.getBoundingClientRect().left ?? 0) + RAND;");
  });

  it('Tagesfenster: Titel, Zahl und Knopf auf einer Mittellinie (C3)', () => {
    // Gegenprobe: der Rand saß am Titel (`.planung-abschnitt` margin-bottom 0.75rem) im Flex-Kopf.
    expect(PLANUNG).toContain('.tag-abschnitt-kopf { display: flex; align-items: center; justify-content: space-between; gap: 0.75rem; margin-bottom: 0.75rem; }');
    expect(PLANUNG).toContain('.tag-abschnitt-kopf .planung-abschnitt { margin-bottom: 0; }');
  });

  it('Fensterfüße einheitlich: Abbrechen gerahmt vor der Hauptaktion, am Handy gestapelt (E1, R7)', () => {
    expect(PLANUNG).toContain('@media (max-width: 759px) { .planung-fuss-knoepfe { flex-direction: column-reverse; } }');
    for (const datei of [
      'src/features/termine/TerminFormular.tsx',
      'src/features/liegenschaften/LiegenschaftFormular.tsx',
      'src/features/liegenschaften/TopFormular.tsx',
      'src/features/liegenschaften/BeteiligterFormular.tsx',
      'src/features/auftragseingang/EingangFormular.tsx',
    ]) {
      const q = quelle(datei);
      // Gegenprobe: `<div className="flex flex-wrap gap-2">` mit der Hauptaktion zuerst und Abbrechen als `ghost`.
      expect(q, datei).toMatch(/<div className="planung-fuss mt-0">\s*<div className="planung-fuss-knoepfe">\s*<Button type="button" variant="secondary" onClick=\{onAbbrechen\}[^\n]*\n\s*<Button type="submit"/);
    }
    expect(quelle('src/features/quotes/QuotesView.tsx')).toContain('<div className="fuss-aktionen flex-col-reverse md:flex-row">');
    expect(quelle('src/features/angebotAnnahme/AngebotAnnahmeSeite.tsx')).toContain('<div className="fuss-aktionen flex-col-reverse md:flex-row">');
  });

  it('Löschen ist rot und normal groß (A4, R4) — in der Zeile seit E74 der Papierkorb', () => {
    // In der Zeile der Papierkorb (E74); im Fenster bleibt Löschen der rote Wortknopf.
    expect(quelle('src/features/termine/TerminListe.tsx')).toContain('<LoeschenKnopf label={`${terminKopf(t)} am ${datumKurz(t.datum)} löschen`} onClick={() => onLoeschen(t)} />');
    expect(quelle('src/features/termine/TerminFenster.tsx')).toMatch(/<Button\s+type="button"\s+variant="danger"\s+onClick=\{\(\) => setLoeschFrage\(true\)\}/);
    expect(quelle('src/features/worksheets/WorkSheetsListView.tsx')).not.toMatch(/variant="danger"\s+groesse="klein"/);
    const lieg = quelle('src/features/liegenschaften/LiegenschaftView.tsx');
    expect(lieg).toContain('<Button type="button" variant="danger" onClick={() => setFrage({ art: \'top\', top: offenesTop })}>Top löschen</Button>');
    expect(lieg).toContain('<Button type="button" variant="danger" onClick={() => setFrage({ art: \'beteiligter\', beteiligter: offenerBeteiligter })}>Entfernen</Button>');
  });

  it('frei stehende Knöpfe am Handy in normaler Größe (D5, R3)', () => {
    // Gegenprobe: „Ganzen Tag ansehen“, „Termin anlegen“, „Noch einzuplanen …“ standen mit `groesse="klein"` (36 px).
    expect(quelle('src/features/assignments/HandyWoche.tsx')).not.toContain('groesse="klein"');
    expect(quelle('src/features/assignments/Einsatzplanung.tsx')).toContain("<Button variant=\"secondary\" onClick={() => setFenster({ art: 'noch' })}>");
  });

  it('Fluchten und rechte Kanten (B3, B4, B5, E6)', () => {
    expect(quelle('src/features/assignments/AssignmentsView.tsx')).toContain('<p className="blatt-einzug border-t border-line px-4 py-3 text-sm text-ink-muted">');
    const quotes = quelle('src/features/quotes/QuotesView.tsx');
    expect(quotes).not.toContain('max-w-[48rem]');
    expect(quotes).toMatch(/<div className="formular mt-6">\s*<h3 className="section-label">Positionen<\/h3>/);
    const einsatz = quelle('src/features/assignments/EinsatzFormular.tsx');
    expect(einsatz).not.toContain('grid grid-cols-2 gap-4 sm:max-w-sm');
    // Speichern schließt das letzte Blatt ab, statt nach `</Card>` frei zu stehen.
    expect(einsatz).toContain('<Aktionsleiste rechts={speicherKnopf} />');
    expect(einsatz).not.toMatch(/<\/Card>\s*\)\}\s*\{speichern\}/);
  });

  it('kein Wortbruch ohne Strich in den Zellen der Planung (D1, R10)', () => {
    expect(PLANUNG).toContain('.e-titel, .e-zeile, .e-zusatz, .eintrag-weg { hyphenate-limit-chars: 8 4 3; -webkit-hyphenate-limit-before: 4; -webkit-hyphenate-limit-after: 3; }');
  });

  it('gleich geblieben: Listen und Tabellen trennen weiter erst ab 13 Zeichen', () => {
    expect(readFileSync('src/index.css', 'utf8')).toContain('hyphenate-limit-chars: 13 6 5;');
  });

  it('Datum österreichisch, Untertitel einzeilig (D8, D9)', () => {
    const eingang = quelle('src/features/auftragseingang/EingangFormular.tsx');
    // Gegenprobe: `zusatz={f.eingegangenAm.replace('T', ', ')}` zeigte „2026-11-09, 22:24“.
    expect(eingang).not.toContain(".replace('T', ', ')");
    expect(eingang).toContain('zusatz={feldzeitAT(f.eingegangenAm)}');
    expect(quelle('src/features/customers/CustomersView.tsx')).toContain('subtitle="Ansprechpartner, Baustellen und Belege"');
    expect(quelle('src/features/worksheets/WorkSheetView.tsx')).toContain(": 'Zeiten, Material und Unterschrift vor Ort'");
  });
});
