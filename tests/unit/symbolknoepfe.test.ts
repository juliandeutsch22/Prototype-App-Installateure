import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

/*
  SYMBOLE STATT TEXT (E74, 10.11.2026). Vier Knopfarten, je eine Regel:
  A schlichtes Symbol (Stift, Papierkorb, PDF, ✕, ‹ ›), B der kleine
  Petrol-Kreis (zurück zu heute, in die Liste), C gerahmt nur als Gruppe
  (− Menge +), D das Wort bleibt (Entscheidungen, Fensterfuß, Hauptaktion).
  Diese Prüfungen halten die Regeln quer durch die App: keine Einzelstelle
  soll wieder ein eigenes Wort oder ein eigenes Zeichen für dieselbe
  Handlung bekommen. Gegenprobe: mit dem Stand vor E74 ist jede rot.
*/
const alle = (ordner: string): string[] =>
  readdirSync(ordner).flatMap((n) => {
    const p = join(ordner, n);
    return statSync(p).isDirectory() ? alle(p) : p.endsWith('.tsx') ? [p] : [];
  });
const QUELLEN = alle('src').map((p) => ({ p, q: readFileSync(p, 'utf8') }));
const quelle = (p: string) => readFileSync(p, 'utf8');
const regel = (css: string, selektor: string) =>
  css.split('\n').find((z) => z.trimStart().startsWith(`${selektor} {`)) ?? '';

describe('Eine Bedeutung, ein Zeichen (E74)', () => {
  it('den gerahmten Symbolknopf gibt es nicht mehr — gerahmt wird nur die Menge als Gruppe', () => {
    const mitRahmen = QUELLEN.filter(({ q }) => /<IconButton[^>]*\bgerahmt\b/.test(q)).map(({ p }) => p);
    expect(mitRahmen).toEqual([]);
    expect(quelle('src/features/orders/OrderView.tsx')).toContain('className={`mengen-wahl${gueltig ? \'\' : \' mengen-wahl-fehler\'}`}');
  });

  it('Entfernen in einer Zeile ist der Papierkorb, nie das Satzzeichen ✕', () => {
    const mitKreuz = QUELLEN.filter(({ q }) => /<IconButton[\s\S]{0,400}?>\s*✕\s*<\/IconButton>/.test(q)).map(({ p }) => p);
    expect(mitKreuz).toEqual([]);
  });

  it('Blättern zeigt überall dasselbe Zeichen, nicht „‹“ und „›“ als Text', () => {
    for (const datei of [
      'src/components/MonthCalendar.tsx',
      'src/features/assignments/Einsatzplanung.tsx',
      'src/features/assignments/TeamWoche.tsx',
      'src/features/assignments/MonatsVorschau.tsx',
      'src/features/accounting/AccountingView.tsx',
    ]) {
      const q = quelle(datei);
      expect(q, datei).toContain('<Icon name="zurueck" size={22} />');
      expect(q, datei).toContain('<Icon name="weiter" size={22} />');
      expect(q, datei).not.toMatch(/^\s*[‹›]\s*$/m);
    }
  });

  it('zurück zu heute ist der Petrol-Kreis mit dem Kalender, in Planung und Team-Woche gleich', () => {
    for (const datei of ['src/features/assignments/Einsatzplanung.tsx', 'src/features/assignments/TeamWoche.tsx']) {
      const q = quelle(datei);
      expect(q, datei).toMatch(/<IconButton\s+rund\s+className="planung-heute"/);
      expect(q, datei).toContain('<Icon name="heute" size={20} />');
      expect(q, datei).not.toMatch(/>\s*Diese Woche\s*</);
    }
  });

  /*
    V10 (13.11.2026): „In die Liste“ ist der feine Linienkreis `InDieListe`
    statt des gefüllten Petrol-Kreises — an beiden Stellen derselbe Baustein,
    ein Zeichen. Gegenprobe: mit dem Stand E74 (zweimal `IconButton rund`)
    ist die erste Erwartung rot.
  */
  it('„In die Liste“ ist an beiden Stellen derselbe Kreis mit demselben Zeichen', () => {
    const q = quelle('src/features/orders/OrderView.tsx');
    expect(q.match(/<InDieListe\b/g)).toHaveLength(2);
    expect(q).not.toMatch(/<IconButton\s+rund\b/);
    expect(q.match(/<Icon name="in-liste" size=\{18\} \/>/g)).toHaveLength(1);
    expect(q).not.toMatch(/>\s*In die Liste\s*</);
  });

  it('die Zeilenaktionen kommen aus den Symbolknöpfen, nicht als Wortknopf', () => {
    // Je Datei die Handlung, die in der Zeile vorher ein Wort war.
    const faelle: [string, string, RegExp][] = [
      ['src/features/time/TimeView.tsx', 'LoeschenKnopf', /<Button variant="ghost" onClick=\{\(\) => setToDelete\(e\)\}>/],
      ['src/features/accounting/PersonFenster.tsx', 'BearbeitenKnopf', /<Button variant="ghost" onClick=\{\(\) => onBearbeiten\(e\)\}>/],
      ['src/features/accounting/PersonFenster.tsx', 'LoeschenKnopf', /<Button variant="ghost" onClick=\{\(\) => onLoeschen\(e\)\}>/],
      ['src/features/termine/TerminListe.tsx', 'BearbeitenKnopf', /<Button variant="secondary" onClick=\{\(\) => onAendern\(t\)\}/],
      ['src/features/termine/TerminListe.tsx', 'LoeschenKnopf', /<Button variant="danger" onClick=\{\(\) => onLoeschen\(t\)\}/],
      ['src/features/quotes/QuotesView.tsx', 'BearbeitenKnopf', /<Button variant="ghost" disabled=\{busy\} onClick=\{\(\) => bearbeiten\(q\)\}>/],
      ['src/features/worksheets/WorkSheetsListView.tsx', 'PdfKnopf', /<Button variant="ghost" loading=\{busy\} onClick=\{\(\) => pdfAusgeben\(s\)\}>/],
      ['src/features/maintenance/WartungenView.tsx', 'BearbeitenKnopf', /<Button variant="ghost" onClick=\{\(\) => formOeffnen\(w\)\}>/],
      ['src/features/assignments/AssignmentsView.tsx', 'LoeschenKnopf', /aria-label=\{`Einsatz von \$\{a\.userName\} löschen`\}/],
      ['src/features/assignments/AssignmentsView.tsx', 'BearbeitenKnopf', /groesse="klein"\s+onClick=\{\(\) => \{\s+setProjectNumber\(pn\)/],
      ['src/features/assignments/TagFenster.tsx', 'BearbeitenKnopf', /<Button\s+variant="secondary"\s+groesse="klein"\s+aria-label=\{`\$\{b\.name\}/],
      ['src/features/vacations/Krankmeldungen.tsx', 'LoeschenKnopf', /onClick=\{\(\) => setLoeschen\(k\)\}\s*>\s*Löschen/],
      ['src/features/vacations/BetriebsurlaubReiter.tsx', 'LoeschenKnopf', /<Button variant="ghost" onClick=\{\(\) => setLoeschen\(b\)\}>Löschen/],
      ['src/features/vacations/ArztbesuchFormular.tsx', 'LoeschenKnopf', />Entfernen<\/Button>/],
      ['src/features/vacations/FreistellungFormular.tsx', 'LoeschenKnopf', />Entfernen<\/Button>/],
      ['src/features/users/UrlaubsanspruchKarte.tsx', 'LoeschenKnopf', /setEntfernen\(a\); \}\}>\s*Entfernen/],
      ['src/features/invoices/InvoicesView.tsx', 'LoeschenKnopf', /onClick=\{\(\) => setZLoeschen\(z\.id\)\}>\s*Löschen/],
      ['src/features/orders/Einkaufsliste.tsx', 'BearbeitenKnopf', /onClick=\{\(\) => oeffnen\(h\)\}>Bearbeiten/],
      ['src/features/settings/ZeitfelderView.tsx', 'LoeschenKnopf', /entwurf\.optionen\.filter[^\n]*\n\s*>\s*Entfernen/],
      ['src/features/settings/BasiszinsVerlauf.tsx', 'LoeschenKnopf', />\s*Entfernen\s*<\/Button>/],
      ['src/features/plattform/BasiszinsZentral.tsx', 'LoeschenKnopf', />\s*Entfernen\s*<\/Button>/],
      ['src/features/accounting/ArbeitszeitGrenzenKarte.tsx', 'BearbeitenKnopf', />\s*Ändern\s*<\/button>/],
      ['src/features/worksheets/Schrittfolge.tsx', 'BearbeitenKnopf', />\s*Ändern\s*<\/Button>/],
      ['src/components/DokumentAblage.tsx', 'LoeschenKnopf', />\s*Entfernen\s*<\/Button>/],
      ['src/features/time/ArbeitstagKarte.tsx', 'LoeschenKnopf', />Verwerfen …<\/Button>/],
    ];
    for (const [datei, knopf, alt] of faelle) {
      const q = quelle(datei);
      expect(q, `${datei}: ${knopf}`).toContain(`<${knopf}`);
      expect(q, `${datei}: alter Wortknopf`).not.toMatch(alt);
    }
  });

  it('gleich geblieben: das Wort bleibt, wo eine Entscheidung Folgen hat oder es die Hauptaktion ist', () => {
    // Fensterfuß und Rückfragen: Löschen bleibt der rote Wortknopf.
    expect(quelle('src/features/worksheets/WorkSheetsListView.tsx')).toMatch(/variant="danger"[\s\S]{0,200}?>\s*Löschen\s*<\/Button>/);
    expect(quelle('src/features/maintenance/WartungenView.tsx')).toMatch(/variant="danger" onClick=\{\(\) => setToDelete\(bearbeitet\)\}>\s*Löschen/);
    // Die Hauptaktion einer Seite und eines Abschnitts.
    expect(quelle('src/features/quotes/AngebotView.tsx')).toMatch(/>\s*PDF herunterladen\s*</);
    expect(quelle('src/features/customers/KundenakteView.tsx')).toContain('<Button onClick={() => setBearbeitet(true)}>Bearbeiten</Button>');
    // Entscheidungen.
    expect(quelle('src/features/worksheets/WorkSheetsListView.tsx')).toMatch(/>\s*Weiterbearbeiten\s*</);
    expect(quelle('src/features/quotes/QuotesView.tsx')).toMatch(/>\s*Annehmen → Baustelle\s*</);
  });
});

describe('Die Gestalt der Knopfarten (E74)', () => {
  const LOT = readFileSync('src/styles/lot.css', 'utf8');
  const PLANUNG = readFileSync('src/styles/lot-planung.css', 'utf8');
  const MATERIAL = readFileSync('src/styles/lot-material.css', 'utf8');

  it('der Petrol-Kreis: rund, gefüllt, 48 px Tastfläche, gesperrt in der Fläche der gesperrten Hauptaktion', () => {
    const r = regel(LOT, '.symbol-rund');
    expect(r).toContain('width: 3rem; height: 3rem;');
    expect(r).toContain('border-radius: 999px');
    expect(r).toContain('background: var(--petrol)');
    expect(r).toContain('color: var(--auf-petrol)');
    // Nur die Farbe (11.11.2026): die Kurzform `background:` setzte `background-clip` zurück.
    expect(regel(LOT, '.symbol-rund:disabled')).toContain('background-color: var(--surface-3)');
  });

  it('der Kreis steht am Handy allein am rechten Rand, ab dem Tablet mit Abstand zum Pfeil', () => {
    expect(regel(PLANUNG, '.planung-heute')).toContain('margin-left: auto;');
    expect(PLANUNG).toMatch(/@media \(min-width: 760px\) \{\s*\.planung-woche \{ width: auto; \}\s*\.planung-heute \{ margin-left: 1\.25rem; \}/);
  });

  it('die Menge: ein Rahmen, Trennstriche zum Feld, die Zahl in Mono, ungültig der ganze Rahmen rot', () => {
    expect(regel(MATERIAL, '.mengen-wahl')).toContain('border: 1px solid var(--border-strong)');
    expect(regel(MATERIAL, '.mengen-schritt')).toContain('border: 0');
    const feld = regel(MATERIAL, '.mengen-feld');
    expect(feld).toContain('border-left: 1px solid var(--border)');
    expect(feld).toContain('font-family: var(--schrift-mono)');
    expect(regel(MATERIAL, '.mengen-wahl-fehler')).toContain('border-color: var(--danger)');
  });
});
