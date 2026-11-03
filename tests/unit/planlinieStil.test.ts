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

  it('die Zeilen der Startseite stehen eine Zelle (24 px) von der Linie — wie der Kartenkopf darüber', () => {
    expect(deklarationen(START, '.start-seite .start-zeile')).toContain('padding: 0.875rem 1.5rem;');
    expect(deklarationen(START, '.start-seite .start-abschnitt')).toContain('padding: 1rem 1.5rem 0.5rem;');
    expect(deklarationen(START, '.start-seite .start-weiter')).toContain('padding: 0.5rem 1.5rem;');
    expect(deklarationen(START, '.start-seite .start-terminfolge')).toContain('margin: 0 1.5rem 0 1.75rem;');
    expect(deklarationen(START, '.start-einsatz')).toContain('padding: 1rem 1.5rem;');
    expect(deklarationen(START, '.start-karte-verweis')).toContain('margin: 0.5rem 1.5rem 0;');
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

  it('gleich geblieben: am Schreibtisch zehn Zellen je Feld mit 24 px Polster seitlich, am Handy sieben mit 12 px', () => {
    expect(regel('.schriftfeld .lage-punkt')).toContain('flex: 0 0 240px;');
    const handy = PLANLINIE.slice(PLANLINIE.indexOf('@media (max-width: 759px) {\n    .schriftfeld'));
    expect(handy.slice(0, handy.indexOf('\n  }'))).toContain('.schriftfeld .lage-punkt { flex-basis: 168px; }');
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
    expect(handy.slice(0, handy.indexOf('\n  }'))).toContain('.schriftfeld .lage-eintrag { padding: 0.75rem; }');
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
