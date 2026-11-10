import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';

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

  it('die Aktionsleiste im Blatt beginnt einen Pixel innen, die Knöpfe bleiben auf 24 px', () => {
    expect(BLATT).toContain('.aktionsleiste { margin: 1.5rem -24px -24px -23px; padding: 12px 24px 12px 23px; }');
  });

  it('frei auf der Seite ist die Leiste ein Streifen Blatt: Spaltenbreite, Linie rundum', () => {
    expect(BLATT).toMatch(/\.inhalt \.aktionsleiste:not\(:is\(\.karte, \.fenster, \.fenster-breit, \.blatt, \[role='dialog'\], \.akten-editor\) \.aktionsleiste\) \{\s*margin: 1\.5rem 0 0; padding: 12px 24px; border-top: 0;\s*box-shadow: inset 1px 0 0 var\(--border-strong\), inset 0 1px 0 var\(--border-strong\), 1px 0 0/);
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
    expect(leiste).toContain('box-shadow: inset 1px 0 0 var(--border-strong)');
    expect(regel(lot, '.sprung-link')).toContain('min-height: 3rem;');
    expect(regel(lot, '.sprung-link')).toContain('border-bottom: 2px solid transparent;');
  });

  it('das Schriftfeld ist rechts geschlossen', () => {
    expect(regel(q('src/styles/lot-planlinie.css'), '.schriftfeld')).toContain('box-shadow: 0 1px 0 var(--accent-deep), 1px 0 0 var(--border-strong);');
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
    expect(q('src/components/MonthCalendar.tsx')).toMatch(/export function KalenderLegende[\s\S]*border-accent-deep[\s\S]*bg-warning-bg/);
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

  it('ein Symbolknopf bleibt neben dem Titel, der Titel bricht um', () => {
    const css = q('src/index.css');
    expect(css).toContain('.karte-kopf > div:has(> [data-icon]:last-child) { flex-wrap: nowrap; }');
    expect(css).toContain('.karte-kopf > div:has(> [data-icon]:last-child) > h2 { min-width: 0; overflow-wrap: anywhere; }');
  });

  it('das ✕ statt „Schließen“ im Kopf der Karte, die an der Stelle eines Fensters steht', () => {
    expect(q('src/features/invoices/InvoicesView.tsx')).toContain('action={<IconButton label="Schließen" onClick={erstellenSchliessen}><Icon name="schliessen" size={22} /></IconButton>}');
  });

  it('gleich geblieben: im Fensterfuß bleibt das Wort', () => {
    expect(q('src/features/assignments/MonatsVorschau.tsx')).toMatch(/<Button variant="secondary" onClick=\{terminNeu\}>\s*Termin anlegen\s*<\/Button>/);
  });
});

describe('Kein Wort über den Rand (E76)', () => {
  it('„Speichern“ in den Firmendaten wie in den Akten — „Firmendaten speichern“ passte am Handy nicht', () => {
    const f = q('src/features/settings/FirmendatenView.tsx');
    expect(f).toContain(": 'Speichern'}</Button>}");
    expect(f).not.toContain('Firmendaten speichern');
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
