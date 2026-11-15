/**
 * LANGE WARNTEXTE: EIN SATZ PLUS „ANZEIGEN“ (U9, Durchsicht 15.11.2026).
 *
 * Auf einer Seite steht von einer Warnung der eine Satz, der sagt, was los
 * ist; was ihn erklärt oder aufzählt, steht in `einzelheiten` der
 * `Hinweiszeile` und kommt erst auf „Anzeigen“ (Regel „eine Hilfe pro
 * Seite“). Der Wächter misst den festen Text einer Warn- oder Fehlerzeile
 * ohne `einzelheiten`: mehr als 160 Zeichen gelten als lang.
 *
 * In einem Fenster gilt das nicht: dort ist die Warnung oft die Entscheidung
 * selbst (eine Rückfrage nennt, was sie nach sich zieht), und das Fenster hat
 * nur diese eine Aufgabe. Fenster erkennt der Wächter am Baustein in derselben
 * Datei; Teile, die nur in einem Fenster stehen, nennt `IM_FENSTER`.
 *
 * Ebenso wenig für eine Warnung, die einen Knopf trägt: ihr Text sagt, was
 * die Handlung daneben bewirkt („Eigene Änderungen gehen dabei verloren“) —
 * das muss vor dem Tipp dastehen, wie in einer Rückfrage.
 */
import { describe, it, expect } from 'vitest';
import ts from 'typescript';
import { attribut, elemente, ort, tagName, tsxDateien } from './bedienregelnQuelle';

export const GRENZE = 160;

const FENSTER = new Set(['BottomSheet', 'ConfirmDialog', 'AktenBearbeiten', 'NeuFormular']);

/** Dateien, deren Hinweise nur in einem Fenster stehen — oder die etwas zeigen, das man nicht wegklappen darf. */
const IM_FENSTER: Record<string, string> = {
  'src/features/accounting/PersonFenster.tsx': 'Inhalt des Fensters „Person im Monat“',
  'src/features/belegMail/BelegMailDialog.tsx': 'Inhalt des Fensters „Per Mail senden“',
  'src/features/nachrichten/NachrichtAktionen.tsx': 'Rückfrage „Nachricht melden“: die Zusage, wer die Meldung sieht (K1), muss vor dem Absenden dastehen',
  'src/features/orders/RetoureFenster.tsx': 'Inhalt des Fensters „Rückgabe“',
  'src/features/plattform/BetriebVerwalten.tsx': 'Rückfrage „Betrieb löschen“: was endgültig gelöscht wird, muss vor der Bestätigung dastehen',
  'src/features/plattform/NotzugangPasswort.tsx': 'zeigt ein Startpasswort, das nur jetzt zu sehen ist — darf nicht weggeklappt sein',
  'src/features/users/BenutzerakteView.tsx': 'Hinweis mit Startpasswort, das nur jetzt zu sehen ist — darf nicht weggeklappt sein',
  'src/features/users/UserMgmtView.tsx': 'Hinweis mit Zugangsdaten nach dem Anlegen — dürfen nicht weggeklappt sein',
  'src/features/assignments/EinsatzFormular.tsx': 'Inhalt des Fensters „Einsatz“',
  'src/features/assignments/RuestlistePlanen.tsx': 'Teil des Fensters „Einsatz“',
  'src/features/time/TimeForm.tsx': 'Formular der Zeitbuchung — am Handy ein Blatt (E90), die Warnung erklärt, warum der Tag gesperrt ist',
  'src/features/quotes/AnnahmeLink.tsx': 'Inhalt des Fensters „Annahme-Link“',
};

function text(n: ts.Node): string {
  let s = '';
  const gehen = (k: ts.Node) => {
    if (ts.isJsxText(k)) s += k.text.replace(/\s+/g, ' ');
    else if (ts.isStringLiteral(k) || ts.isNoSubstitutionTemplateLiteral(k)) s += k.text;
    else if (ts.isTemplateExpression(k)) { s += k.head.text; k.templateSpans.forEach((sp) => { s += `X${sp.literal.text}`; }); return; }
    else if (ts.isConditionalExpression(k)) { const a = text(k.whenTrue); const b = text(k.whenFalse); s += a.length > b.length ? a : b; return; }
    else if (ts.isJsxAttributes(k)) return;
    if ((ts.isJsxElement(k) || ts.isJsxSelfClosingElement(k)) && /^(Button|KnopfLink|Link|InfoHint)$/.test(tagName(k))) return;
    ts.forEachChild(k, gehen);
  };
  // Beim Knoten selbst beginnen: ein Kind, das selbst Text ist (oder ein Zweig `a ? 'Satz' : …`), zählt mit.
  gehen(n);
  return s.replace(/\s+/g, ' ').trim();
}

function traegtKnopf(e: ts.Node): boolean {
  let ja = false;
  const gehen = (n: ts.Node) => {
    if ((ts.isJsxElement(n) || ts.isJsxSelfClosingElement(n)) && /^(Button|KnopfLink)$/.test(tagName(n))) ja = true;
    ts.forEachChild(n, gehen);
  };
  gehen(e);
  return ja;
}

export function langeWarntexte(datei: string, quelltext?: string): string[] {
  if (IM_FENSTER[datei]) return [];
  return elemente(datei, quelltext).filter((e) => {
    if (tagName(e) !== 'Hinweiszeile' || !ts.isJsxElement(e)) return false;
    const st = attribut(e, 'stufe');
    if (!st || st === true) return false;
    if (attribut(e, 'einzelheiten')) return false;
    // Bleibt mit Grund offen (`offenWeil`): die Zahlen der Warnung sind die Auskunft selbst.
    const weil = attribut(e, 'offenWeil');
    if (weil && weil !== true && weil.getText().length > 25) return false;
    if (traegtKnopf(e)) return false;
    for (let n: ts.Node | undefined = e.parent; n; n = n.parent) {
      if ((ts.isJsxElement(n) || ts.isJsxSelfClosingElement(n)) && FENSTER.has(tagName(n))) return false;
    }
    return e.children.map(text).join(' ').length > GRENZE;
  }).map((e) => `${ort(e)}: ${(e as ts.JsxElement).children.map(text).join(' ').slice(0, 60)}…`);
}

describe('U9 · lange Warntexte: ein Satz plus „Anzeigen“', () => {
  it('keine Warn- oder Fehlerzeile mit mehr als 160 Zeichen offen auf einer Seite', () => {
    expect(tsxDateien().flatMap((d) => langeWarntexte(d))).toEqual([]);
  }, 60_000);

  it('die Hinweiszeile kennt die Einzelheiten — „Anzeigen“ mit aria-expanded', async () => {
    const { readFileSync } = await import('node:fs');
    const q = readFileSync('src/components/Hinweiszeile.tsx', 'utf8');
    expect(q).toContain('einzelheiten?: ReactNode;');
    expect(q).toContain('aria-expanded={offen}');
    expect(q).toContain("{offen ? 'Ausblenden' : 'Anzeigen'}");
  });

  it('Gegenprobe: die alte Warnung der Zeiterfassung über doppelte Buchungen fiele auf', () => {
    const alt = `export const X = () => <Hinweiszeile stufe="fehl" role="alert"><p><strong>{n === 1 ? 'An einem Tag steht dieselbe Buchung zweimal.' : \`An \${n} Tagen steht dieselbe Buchung zweimal.\`}</strong>{' '}
      Der Saldo zählt beide. Betroffen:{' '}{tage.join(', ')} — bitte unten in der Liste den überflüssigen Eintrag löschen. Mehrere Baustellen an einem Tag sind dagegen in Ordnung und stehen hier nicht.</p></Hinweiszeile>;`;
    expect(langeWarntexte('alt.tsx', alt)).toHaveLength(1);
    const neu = `export const X = () => <Hinweiszeile stufe="fehl" role="alert" einzelheiten={<p>Der Saldo zählt beide. Betroffen: … — bitte unten in der Liste den überflüssigen Eintrag löschen. Mehrere Baustellen an einem Tag sind dagegen in Ordnung.</p>}><p><strong>An 10 Tagen steht dieselbe Buchung zweimal.</strong></p></Hinweiszeile>;`;
    expect(langeWarntexte('neu.tsx', neu)).toEqual([]);
  });

  it('Gegenprobe: auch Text direkt in der Zeile und in beiden Zweigen einer Bedingung zählt', () => {
    const lang = 'Der Saldo zählt beide Buchungen, bitte unten in der Liste den überflüssigen Eintrag löschen. ';
    expect(langeWarntexte('direkt.tsx', `export const X = () => <Hinweiszeile stufe="warn">${lang}${lang}</Hinweiszeile>;`)).toHaveLength(1);
    expect(langeWarntexte('zweig.tsx', `export const X = () => <Hinweiszeile stufe="warn"><p>{n ? '${lang}${lang}' : 'kurz'}</p></Hinweiszeile>;`)).toHaveLength(1);
  });
});
