import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';

/*
  KANTEN, ABSCHLÜSSE UND DAS PLUS (E76, 10.11.2026). Gemeldet mit vier
  Bildschirmfotos: die mitfliegende Leiste ohne linke Kante, „Für wen“ am
  oberen Rand des Monatskalenders, Kalender ohne sauberen Abschluss unten,
  „Termin anlegen“ als Wortknopf. Ein Durchgang mit Messungen über alle
  Seiten fand dieselben Fehler an weiteren Stellen. Gemessen wird im Browser
  (`blattKanten.spec.ts`); hier steht, dass keine Einzelstelle zurückfällt.
  Gegenprobe: mit dem Stand vor E76 ist jede Prüfung rot.
*/
const q = (p: string) => readFileSync(p, 'utf8');
const regel = (css: string, selektor: string) =>
  css.split('\n').find((z) => z.trimStart().startsWith(`${selektor} {`)) ?? '';

describe('Nichts Klebendes deckt die Linie eines Blatts zu (E76)', () => {
  const BLATT = q('src/styles/lot-blatt.css');

  it('die Aktionsleiste im Blatt liegt innerhalb der Kontur, die Knöpfe bleiben auf dem Polster des Blatts', () => {
    // V10: die Kontur ist ein Umriss über dem Inhalt — die Leiste darf von Kante zu Kante reichen,
    // die Linie bleibt sichtbar. Gegenprobe: der Stand E76 (links einen Pixel innen, `-innen`) ist rot.
    expect(BLATT).toContain('.aktionsleiste { margin: 1.5rem var(--blatt-rand-minus) -24px; padding: 12px var(--blatt-rand); }');
  });

  /*
    DAS POLSTER DER BLÄTTER (D4, E86): 24 px ab dem Tablet, 16 px am Handy —
    und jedes Gegenstück (negativ, einen Pixel innen, mit Pfeil) passt dazu.
  */
  it('das Polster der Blätter ist ab dem Tablet eine Zelle, am Handy 16 px, mit passenden Gegenstücken', () => {
    expect(BLATT).toContain(':root { --blatt-rand: 24px; --blatt-rand-innen: 23px; --blatt-rand-minus: -24px; --blatt-rand-minus-innen: -23px; --blatt-rand-pfeil: 52px; --blatt-rand-einzug: 28px; }');
    expect(BLATT).toMatch(/@media \(max-width: 759px\) \{\s*:root \{ --blatt-rand: 16px; --blatt-rand-innen: 15px; --blatt-rand-minus: -16px; --blatt-rand-minus-innen: -15px; --blatt-rand-pfeil: 44px; --blatt-rand-einzug: 20px; \}/);
    // Keine Zeile im Blatt hat ihr seitliches Polster noch fest auf 24 px.
    const blattZeilen = BLATT.split('\n').filter((z) => z.includes(".inhalt .karte:not(.karte .karte)") && /padding(-inline)?: [^;]*\b24px [^;]*;|padding-inline: 24px/.test(z));
    expect(blattZeilen.filter((z) => /padding: \d+px 24px|padding-inline: 24px/.test(z))).toEqual([]);
  });

  it('frei auf der Seite ist die Leiste ein Streifen Blatt: Spaltenbreite, Umriss und Radius wie jedes Blatt (V10)', () => {
    // Gegenprobe: der Stand der Linie „Lot“ (gezeichnete eckige Linien per box-shadow) ist rot.
    expect(BLATT).toMatch(/\.inhalt \.aktionsleiste:not\(:is\(\.karte, \.fenster, \.fenster-breit, \.blatt, \[role='dialog'\], \.akten-editor\) \.aktionsleiste\) \{\s*margin: 1\.5rem 0 0; padding: 12px var\(--blatt-rand\); border-top: 0;[^}]*border-radius: var\(--radius-lg\); outline: 0; box-shadow: inset 0 0 0 1px var\(--border\);/);
  });

  it('Gruppenzeile der Planung und Kopfzeile des Monats zeichnen die Linie selbst', () => {
    expect(regel(q('src/styles/lot-planung.css'), '.planung-gruppe')).toContain('box-shadow: inset 1px 0 0 var(--border-strong);');
    expect(q('src/styles/lot-monat.css')).toContain('.mo-kopfzeile-31 { position: sticky; top: 0; z-index: 3; display: grid; background: var(--surface); border-bottom: 1px solid var(--border-strong); box-shadow: inset 1px 0 0 var(--border-strong), inset 0 1px 0 var(--border-strong); }');
  });

  it('die Sprungleiste der Akte: zwei Zellen hoch, Linie rundum, eine Zelle unter dem Kopf', () => {
    const lot = q('src/styles/lot.css');
    const leiste = regel(lot, '.sprungleiste');
    expect(leiste).toContain('margin-top: 1.5rem;');
    expect(leiste).toContain('background: var(--surface);');
    // V10 (14.11.2026): Kontur und Radius des Blatts statt gezeichneter eckiger Linien. Gegenprobe: der Stand „Lot“ ist rot.
    expect(leiste).toContain('box-shadow: inset 0 0 0 1px var(--border); border-radius: var(--radius-lg);');
    expect(regel(lot, '.sprung-link')).toContain('min-height: 3rem;');
    expect(regel(lot, '.sprung-link')).toContain('border-bottom: 2px solid transparent;');
  });

  it('das Schriftfeld ist rechts geschlossen', () => {
    // V10: geschlossen durch die Kontur rundum statt durch eine gezeichnete Linie rechts.
    expect(regel(q('src/styles/lot-planlinie.css'), '.schriftfeld')).toContain('border: 1px solid var(--border); border-radius: var(--radius-lg);');
  });
});

describe('Kalender in ganzen Zellen (E76)', () => {
  it('der Monatskalender: Kopf 48, Wochentage 24, jede Woche 72 px — ohne Linie an Sonntag und letzter Woche', () => {
    const k = q('src/components/MonthCalendar.tsx');
    expect(k).toContain('className="flex h-12 items-center justify-between border-b border-line px-2"');
    expect(k).toContain('className="grid h-6 grid-cols-7 border-b border-line bg-surface-2"');
    expect(k).toContain('className="h-[4.5rem] bg-surface-2"');
    expect(k).toContain("relative flex h-[4.5rem] flex-col items-center gap-0.5 border-line pb-2 pt-3 transition-colors ${i % 7 === 6 ? '' : 'border-r'} ${i >= cells.length - 7 ? '' : 'border-b'}");
    expect(k).not.toContain('min-h-[3.625rem]');
  });

  it('der Kalender am Handy: eine Zelle Polster rundum, Wochen zu 68 + 4 px', () => {
    const css = q('src/styles/lot-monat.css');
    expect(regel(css, '.kal-huelle')).toBe('  .kal-huelle { padding: 1.5rem; }');
    expect(regel(css, '.kal-raster')).toContain('grid-template-rows: 1.5rem; grid-auto-rows: 4.25rem; gap: 4px; margin-top: 1.5rem;');
    expect(regel(css, '.kal-kopf')).toContain('line-height: 1.5rem;');
    expect(q('src/features/assignments/MonatsAnsicht.tsx')).toContain('<div className="kal-huelle">');
    expect(q('src/features/assignments/MonatsAnsicht.tsx')).not.toContain('<div className="px-4 pb-4">');
  });

  it('die Legende zeigt die Zeichen des Kalenders — einmal, nicht abgeschrieben', () => {
    for (const datei of ['src/features/assignments/AssignmentsView.tsx', 'src/features/assignments/MyScheduleView.tsx']) {
      const d = q(datei);
      expect(d, datei).toContain('<KalenderLegende anzahl=');
      expect(d, datei).not.toContain('rounded-full bg-accent');
    }
    // V10: der Feiertag ist kein Warnzustand mehr — Legende und Kästchen tragen dieselbe ruhige Fläche.
    expect(q('src/components/MonthCalendar.tsx')).toMatch(/export function KalenderLegende[\s\S]*border-accent-deep[\s\S]*bg-surface-3 shadow-\[inset_0_2px_0_0_var\(--border-strong\)\]/);
    expect(q('src/components/MonthCalendar.tsx')).not.toMatch(/bg-warning-bg|inset_0_\dpx_0_0_var\(--warning\)/);
  });

  it('nach der letzten Person der Handy-Woche keine Linie vor der Kante', () => {
    expect(q('src/styles/lot-planung.css')).toContain('.tl-person-letzte { border-bottom: 0; }');
    expect(q('src/features/assignments/HandyWoche.tsx')).toContain('letzte={gi === alle.length - 1 && i === g.leute.length - 1}');
  });
});

describe('Etwas Neues in die Liste: der Petrol-Kreis mit Plus (E76)', () => {
  it('in jedem Kopf einer Liste, der etwas anlegt', () => {
    const faelle: [string, string][] = [
      ['src/features/termine/TermineKarte.tsx', '<NeuKnopf label="Termin anlegen"'],
      ['src/features/assignments/TagFenster.tsx', '<NeuKnopf label="Termin anlegen"'],
      ['src/features/assignments/HandyWoche.tsx', '<NeuKnopf label="Termin anlegen"'],
      ['src/features/liegenschaften/LiegenschaftView.tsx', '<NeuKnopf label="Top anlegen"'],
      ['src/features/liegenschaften/LiegenschaftView.tsx', '<NeuKnopf label="Beteiligten eintragen"'],
      ['src/features/orders/Einkaufsliste.tsx', '<NeuKnopf label="Großhändler anlegen"'],
      ['src/features/orders/MaterialCatalog.tsx', '<NeuKnopf label="Neues Material"'],
      ['src/features/orders/AdminOrdersView.tsx', '<NeuKnopf label="Retoure erfassen"'],
    ];
    for (const [datei, knopf] of faelle) expect(q(datei), datei).toContain(knopf);
    expect(q('src/features/orders/Einkaufsliste.tsx')).not.toContain('+ Großhändler');
    expect(q('src/components/Icon.tsx')).toContain("plus: 'M12 5v14M5 12h14',");
  });

  it('der Kreis sichtbar 40 px, die Tastfläche 48 px', () => {
    const kreis = regel(q('src/styles/lot.css'), '.symbol-rund');
    expect(kreis).toContain('width: 3rem; height: 3rem; padding: 4px;');
    expect(kreis).toContain('background-clip: content-box;');
    expect(regel(q('src/styles/lot.css'), '.symbol-rund:focus-visible')).toContain('outline-offset: -2px;');
  });

  it('beim Darüberfahren und gesperrt bleibt der Kreis 40 px — nur die Farbe ändert sich', () => {
    // Die Kurzform `background:` setzte `background-clip` zurück, der Kreis wuchs auf 48 px.
    const css = q('src/styles/lot.css');
    expect(regel(css, '.symbol-rund:hover:not(:disabled)')).toBe('  .symbol-rund:hover:not(:disabled) { background-color: var(--petrol-tief); }');
    expect(regel(css, '.symbol-rund:disabled')).toContain('background-color: var(--surface-3);');
    const zustaende = css.split('\n').filter((z) => /^\s*\.symbol-rund:[^{]*\{/.test(z));
    expect(zustaende.filter((z) => /[{;]\s*background:/.test(z))).toEqual([]);
  });

  it('ein Symbolknopf bleibt neben dem Titel, der Titel bricht um', () => {
    const css = q('src/index.css');
    expect(css).toContain('.karte-kopf > div:has(> [data-icon]:last-child) { flex-wrap: nowrap; }');
    expect(css).toContain('.karte-kopf > div:has(> [data-icon]:last-child) > h2 { min-width: 0; overflow-wrap: anywhere; }');
  });

  it('das ✕ statt „Schließen“ im Kopf der Karte, die an der Stelle eines Fensters steht', () => {
    expect(q('src/features/invoices/InvoicesView.tsx')).toContain('action={<IconButton label="Schließen" onClick={erstellenSchliessen}><Icon name="schliessen" size={22} /></IconButton>}');
  });

  it('gleich geblieben: im Fensterfuß bleibt das Wort', () => {
    // Seit U4 (15.11.2026) steht „Termin anlegen“ im ⋯ des Fensterfußes — als Wort, nicht als Zeichen.
    expect(q('src/features/assignments/MonatsVorschau.tsx')).toContain("weitere={onTerminNeu && darfTermine ? [{ label: 'Termin anlegen', onSelect: terminNeu }] : []}");
  });
});

describe('Kein Wort über den Rand (E76)', () => {
  it('„Speichern“ in den Firmendaten wie in den Akten — „Firmendaten speichern“ passte am Handy nicht', () => {
    const f = q('src/features/settings/FirmendatenView.tsx');
    // Seit U1 (15.11.2026) über die Speicherleiste — ohne eigenen Text heißt ihr Knopf „Speichern“.
    expect(f).toContain('<Speicherleiste');
    expect(f).not.toContain('speichernText=');
    expect(f).not.toContain('Firmendaten speichern');
  });

  it('am Schreibtisch hält der Hauptknopf der Leiste die Breite von „Gespeichert“', () => {
    expect(q('src/index.css')).toContain(".aktionsleiste-knoepfe > [type='submit'] { min-width: 9.5rem; }");
  });

  it('die Kennzahl im Angebot passt ins Feld', () => {
    const a = q('src/features/quotes/AngebotView.tsx');
    expect(a).toContain('<Metric label="Kalk. Stunden"');
    expect(a).not.toContain('<Metric label="Kalkulierte Arbeitszeit"');
  });

  it('die Baustellennummer im Termin bricht nicht um', () => {
    expect(q('src/features/termine/TerminListe.tsx')).toContain('{t.ortName} · <span className="nr">{t.projectNumber}</span>');
  });
});

/*
  DIE KONTUR LIEGT ZWISCHEN BLATT UND SEITE (S1, 15.11.2026). Auf Ebene 11
  zog sie beim Rollen ihre Linien durch die freie Speicherleiste der
  Firmendaten und die Sprungleiste der Angebotsakte (gemessen in
  `blattKontur.spec.ts`). Hier steht die Ordnung, und dass keine neue
  klebende Leiste unbemerkt darunter rutscht.
*/
describe('Die Kontur der Blätter liegt zwischen Blatt und Seite (S1)', () => {
  const BLATT = q('src/styles/lot-blatt.css');
  const ebene = (name: string) => Number(BLATT.match(new RegExp(`${name}: (\\d+);`))?.[1]);
  const STILE = ['src/index.css', ...readdirSync('src/styles').filter((f) => f.endsWith('.css')).map((f) => `src/styles/${f}`)];

  /** Jede Regel mit `position: sticky|fixed` und eigener Ebene: Datei, Selektor, Ebene. */
  function schwebende(): { datei: string; selektor: string; z: number }[] {
    const aus: { datei: string; selektor: string; z: number }[] = [];
    for (const datei of STILE) {
      const css = q(datei).replace(/\/\*[\s\S]*?\*\//g, '');
      for (const m of css.matchAll(/([^{}]+)\{([^{}]*)\}/g)) {
        if (!/position:\s*(sticky|fixed)/.test(m[2])) continue;
        const z = m[2].match(/z-index:\s*(-?\d+)/);
        if (z) aus.push({ datei, selektor: m[1].trim().replace(/\s+/g, ' '), z: Number(z[1]) });
      }
    }
    return aus;
  }

  it('im Blatt höchstens 3, die Kontur auf 4 — beide über die Variablen', () => {
    expect(ebene('--ebene-im-blatt')).toBe(3);
    expect(ebene('--ebene-blattkontur')).toBe(4);
    expect(BLATT).toContain('z-index: var(--ebene-blattkontur); pointer-events: none;');
    // Die Speicherleiste im Blatt liegt darunter (sonst deckte sie die Linie zu, E76).
    expect(BLATT).toMatch(/\.aktionsleiste:not\(:is\(\.fenster, \.fenster-breit, \.blatt, \[role='dialog'\]\) \.aktionsleiste\) \{\s*z-index: var\(--ebene-im-blatt\);\s*\}/);
  });

  it('was frei auf der Seite klebt, liegt über der Kontur: Sprungleiste, Speicherleiste, Warenkorb', () => {
    const z = (selektor: string) => schwebende().find((s) => s.selektor === selektor)?.z ?? NaN;
    // Gegenprobe: mit der Kontur auf 11 sind Sprungleiste (5) und Leiste (10) rot.
    for (const s of ['.sprungleiste', '.aktionsleiste', '.korb', '.rt-aktionen', '.timer-leiste-breit', '.daumen']) {
      expect(z(s), s).toBeGreaterThan(ebene('--ebene-blattkontur'));
    }
  });

  it('jede klebende oder feste Regel bis zur Ebene der Kontur gehört in ein Blatt oder Fenster', () => {
    /*
      Eine neue Leiste frei auf der Seite mit kleiner Ebene läge wieder unter
      den Konturen der Blätter, die darunter rollen. Wer hier ergänzen will,
      prüft vorher, dass das Element nur in einem Blatt oder Fenster steht.
    */
    const IM_BLATT = [
      '.mo-kopfzeile-28, .mo-kopfzeile-29, .mo-kopfzeile-30, .mo-kopfzeile-31', // Kopf im Monatskalender (Blatt)
      '.planung-gruppe', // Gruppenkopf in der Planungstabelle (Blatt)
      '.planung-fuss', // Fuß der Formulare in Fenster und Blatt von unten
      '.ue-kopfzeile', '.mw-kopfzeile', // Köpfe der Listen der Mitarbeiterübersicht (Blatt)
      '.pf-fuss', // Fuß im Personenfenster
    ];
    const niedrig = schwebende().filter((s) => s.z <= ebene('--ebene-blattkontur')).map((s) => s.selektor);
    expect([...new Set(niedrig)].sort()).toEqual([...IM_BLATT].sort());
  });
});
