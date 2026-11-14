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
  helles Arbeitsblatt mit feiner Kontur, Terrakotta-Markierung und dem
  normalen Einsatzradius — an jedem Tag gleich. Vollflächig Terrakotta ist
  nur der AUSGEWÄHLTE Einsatz. „Eingeteilt, aber abwesend“ ist dasselbe
  Blatt; den Konflikt sagt Text mit Warnzeichen, keine Bernsteinkante.
  Gegenprobe: mit dem Stand vor V10 (Petrol-Fläche heute, Bernsteinrahmen,
  eckig) ist jede Prüfung hier rot.
*/
describe('Einsatz als helles Arbeitsblatt (V10)', () => {
  it('Woche: helles Blatt, feine Kontur, Terrakotta-Markierung, normaler Radius, zwei Zellen hoch', () => {
    const r = regel(planung, '.eintrag, .eintrag-konflikt');
    expect(r).toMatch(/background: var\(--surface\)/);
    expect(r).toMatch(/color: var\(--ink-deep\)/);
    expect(r).toMatch(/border: 1px solid var\(--border-strong\); border-left: 3px solid var\(--petrol\)/);
    expect(r).toMatch(/border-radius: var\(--radius-sm\)/);
    expect(r).toMatch(/min-height: 3rem/);
    expect(r).not.toMatch(/background: var\(--(petrol|brand)\)/);
  });

  it('heute färbt die Einsätze nicht mehr — keine Regel setzt sie in der Spalte von heute voll', () => {
    expect(planung).not.toMatch(/:is\(\.wp-zelle-heute[^{]*\.eintrag[^{]*\{[^}]*background: var\(--petrol\)/);
    expect(planung).not.toMatch(/\.handy-woche\[data-heute\][^{]*\.eintrag/);
  });

  it('nur der ausgewählte Einsatz ist vollflächig Terrakotta — mit derselben Form', () => {
    const sel = ':is(.einsatz-halter:is(:focus-within, [data-offen]) > :is(.eintrag, .eintrag-konflikt), :is(.eintrag, .eintrag-konflikt):focus-visible)';
    const r = regel(planung, sel);
    expect(r).toMatch(/background: var\(--petrol\); color: var\(--auf-petrol\)/);
    expect(r).not.toMatch(/border-radius|padding|min-height/);
    expect(regel(planung, `${sel} :is(.e-zeile, .e-zeit, .e-nr, .e-konflikt)`)).toMatch(/color: var\(--auf-petrol\)/);
  });

  it('Gegenprobe: ein nicht ausgewählter Einsatz beim Darüberfahren bleibt hell', () => {
    const r = regel(planung, '.eintrag:hover, .eintrag-konflikt:hover');
    expect(r).not.toMatch(/background/);
    expect(r).toMatch(/border-color: var\(--auswahl-kontur\)/);
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
