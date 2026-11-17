import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';

/*
  DER EINSATZ IM PLAN — Geschichte: helle Fläche mit Endmarken (Planlinie
  B11, 30.10.), volle Petrol-Fläche (E33, Variante B, 01.11.), weißes Blatt
  mit Kante und heute voll (E88, 13.11.), seit V10 (13.11.2026) das helle
  Arbeitsblatt unten. Was bleibt: Schraffur für Abwesenheit.
*/

const planung = readFileSync('src/styles/lot-planung.css', 'utf8');
const monat = readFileSync('src/styles/lot-monat.css', 'utf8');

/**
 * Die Rümpfe aller Regeln, deren Selektorliste genau `selektor` ist, aneinander —
 * ab 1.200 px setzt eine zweite Regel nur die Innenabstände.
 */
function regel(css: string, selektor: string): string {
  const esc = selektor.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const treffer = [...css.matchAll(new RegExp(`(?:^|[}\\n])\\s*${esc}\\s*\\{([^}]*)\\}`, 'g'))];
  expect(treffer.length, `eine Regel für ${selektor}`).toBeGreaterThan(0);
  return treffer.map((t) => t[1]).join(' ');
}

/*
  V10 „WARMES PAPIER“ (13.11.2026, style.md „Einsatzplanung · E88“, Auftrag
  11.2) löst E33 und die volle Fläche „heute“ ab: jeder Einsatz ist ein
  helles Arbeitsblatt mit feiner Kontur, Akzentmarkierung und dem
  normalen Einsatzradius — an jedem Tag gleich. Vollflächig im Akzent ist
  nur der AUSGEWÄHLTE Einsatz. „Eingeteilt, aber abwesend“ ist dasselbe
  Blatt; den Konflikt sagt Text mit Warnzeichen, keine Bernsteinkante.
  Gegenprobe: mit dem Stand vor V10 (Petrol-Fläche heute, Bernsteinrahmen,
  eckig) ist jede Prüfung hier rot.
*/
describe('Einsatz als helles Arbeitsblatt (V10)', () => {
  it('Woche: helles Blatt, Kontur rundum, normaler Radius, zwei Zellen hoch', () => {
    const r = regel(planung, '.eintrag, .eintrag-konflikt');
    expect(r).toMatch(/background: var\(--surface\)/);
    expect(r).toMatch(/color: var\(--ink-deep\)/);
    // E96: 2 px helles Petrol rundum statt grauer Linie mit 3 px Petrol links.
    expect(r).toMatch(/border: 2px solid var\(--auswahl-kontur\)/);
    expect(r).not.toMatch(/border-left/);
    expect(r).toMatch(/border-radius: var\(--radius-sm\)/);
    expect(r).toMatch(/min-height: 3rem/);
    expect(r).not.toMatch(/background: var\(--(petrol|brand)\)/);
  });

  /*
    E96 (17.11.2026): DIESELBE KONTUR ÜBERALL, WO EIN EINSATZ ERSCHEINT — im
    Raster, beim Ziehen und in „Noch einzuplanen“ —, und nirgends mehr die
    Kante nur links. Gegenprobe: der Stand davor (1 px grau, links 3 px
    Petrol) ist in jeder Zeile hier rot.
  */
  it('E96: Raster, Ziehbild und Ablage tragen 2 px helles Petrol rundum, keine Kante links', () => {
    for (const sel of ['.eintrag, .eintrag-konflikt', '.zieh-schatten', '.ablage-baustelle']) {
      const r = regel(planung, sel);
      expect(r, sel).toMatch(/border: 2px solid var\(--auswahl-kontur\)/);
      expect(r, sel).not.toMatch(/border-left/);
    }
    expect(planung).not.toMatch(/border-left: 3px solid var\(--petrol\)/);
    expect(planung).not.toMatch(/border-left-color: var\(--petrol\)/);
  });

  it('E96: beim Darüberfahren wird die Kontur Petrol; nur zum Lesen bleibt sie hell', () => {
    expect(regel(planung, '.eintrag:hover, .eintrag-konflikt:hover')).toMatch(/border-color: var\(--petrol\)/);
    expect(regel(planung, '.eintrag.nur-lesen:hover, .eintrag-konflikt.nur-lesen:hover')).toMatch(/border-color: var\(--auswahl-kontur\)/);
  });

  it('E96 gleich geblieben: der Text steht, wo er stand — die Polsterung gibt ab, was die Kontur dazunimmt', () => {
    // Vorher: links 3 px Kante + 6 px, sonst 1 + 6 (Tablet); 3 + 8 / 1 + 8 und 1 + 6 oben (Schreibtisch).
    const rem = (w: string) => Math.round(parseFloat(w) * 16);
    const abstand = (polster: string, kante: number) => polster.split(' ').map((w) => rem(w) + kante);
    const [basis, breit] = [...planung.matchAll(/\.eintrag, \.eintrag-konflikt \{[^}]*?padding: ([0-9. rem]+);/g)].map((t) => t[1]);
    expect(abstand(basis, 2)).toEqual([7, 7, 7, 9]);
    expect(abstand(breit, 2)).toEqual([7, 9, 7, 11]);
  });

  it('E96 gleich geblieben: ein Termin behält die feine graue Linie und ist so vom Einsatz zu unterscheiden', () => {
    const r = regel(planung, '.eintrag-termin');
    expect(r).toMatch(/border: 1px solid var\(--border\)/);
    expect(r).not.toMatch(/auswahl-kontur|--petrol/);
  });

  it('heute färbt die Einsätze nicht mehr — keine Regel setzt sie in der Spalte von heute voll', () => {
    expect(planung).not.toMatch(/:is\(\.wp-zelle-heute[^{]*\.eintrag[^{]*\{[^}]*background: var\(--petrol\)/);
    expect(planung).not.toMatch(/\.handy-woche\[data-heute\][^{]*\.eintrag/);
  });

  it('nur der ausgewählte Einsatz ist vollflächig im Akzent — mit derselben Form', () => {
    const sel = ':is(.einsatz-halter:is(:focus-within, [data-offen]) > :is(.eintrag, .eintrag-konflikt), :is(.eintrag, .eintrag-konflikt):focus-visible)';
    const r = regel(planung, sel);
    expect(r).toMatch(/background: var\(--petrol\); color: var\(--auf-petrol\)/);
    expect(r).not.toMatch(/border-radius|padding|min-height/);
    expect(regel(planung, `${sel} :is(.e-zeile, .e-zeit, .e-nr, .e-konflikt)`)).toMatch(/color: var\(--auf-petrol\)/);
  });

  it('Gegenprobe: ein nicht ausgewählter Einsatz beim Darüberfahren bleibt hell', () => {
    const r = regel(planung, '.eintrag:hover, .eintrag-konflikt:hover');
    expect(r).not.toMatch(/background/);
    // Nur die Kontur wird kräftiger (E96: vom hellen zum vollen Petrol).
    expect(r).toMatch(/border-color: var\(--petrol\)/);
  });

  it('Ort, Zeit und Nummer eine Stufe leiser', () => {
    expect(regel(planung, ':is(.eintrag, .eintrag-konflikt) :is(.e-zeile, .e-zeit, .e-nr)')).toMatch(/color: var\(--text-muted\)/);
  });

  it('eingeteilt, aber abwesend: keine Bernsteinfläche und kein Bernsteinrahmen — Text mit Warnzeichen', () => {
    expect(planung).not.toMatch(/\.eintrag-konflikt \{[^}]*(warning-bg|solid var\(--warning\))/);
    expect(regel(planung, '.eintrag-konflikt .e-konflikt')).toMatch(/color: var\(--warning\)/);
    const block = readFileSync('src/features/assignments/WochenEintraege.tsx', 'utf8');
    expect(block).toMatch(/<span className="e-zeile e-konflikt">\s*<Icon name="warnung"/);
  });

  it('Monat: helle Balken mit Markierung, nur der gewählte voll; Konflikt ohne Bernsteinrahmen', () => {
    const r = regel(monat, '.mo-balken');
    expect(r).toMatch(/background: var\(--surface-3\)/);
    expect(r).toMatch(/inset 3px 0 0 var\(--petrol\)/);
    expect(r).not.toMatch(/background: var\(--(petrol|brand)\)/);
    expect(regel(monat, '.mo-balken-gewaehlt')).toMatch(/background: var\(--petrol\); color: var\(--auf-petrol\)/);
    expect(regel(monat, '.mo-balken-konflikt')).not.toMatch(/warning-bg|inset 0 0 0 2px var\(--warning\)/);
    expect(monat).not.toMatch(/\.mo-legende-konflikt::before/);
  });

  it('gleich geblieben: der Musterbaustein der Planlinie', () => {
    expect(regel(readFileSync('src/styles/lot-planlinie.css', 'utf8'), '.einsatzbalken')).toMatch(/background: var\(--petrol\); color: var\(--auf-petrol\)/);
  });

  it('abwesend trägt keine eigene Fläche — die Schraffur kommt aus `.schraffur`', () => {
    expect(regel(planung, '.eintrag-weg')).not.toMatch(/background/);
    expect(monat).not.toMatch(/\.mo-balken-weg \{/);
    const schraffur = regel(readFileSync('src/styles/lot-planlinie.css', 'utf8'), '.schraffur');
    expect(schraffur).toMatch(/repeating-linear-gradient\(135deg/);
  });
});
