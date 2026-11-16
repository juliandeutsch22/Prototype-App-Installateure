import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';

/*
  DIE RECHNUNGSANSICHT BLEIBT UNTER DER GRENZE DES LEISTUNGSWÄCHTERS (L11,
  Nacharbeit 15.11.2026): 134,4 von 135 KB, mit den nachgeladenen Fenstern
  129,3 KB (Bauprotokoll). Mail und Bankgarantie kommen erst beim ersten
  Öffnen. Die E-Rechnung bleibt fest: nachgeladen bände ihr Baustein den der
  Ansicht ein (gemeinsames `ebinterface.ts`) und holte beim Öffnen 131,2 KB —
  gespart wäre nichts (gemessen; der Wächter misst beide seit der Nacharbeit).
  Gegenprobe: mit festem Import sind die ersten beiden Erwartungen rot.
*/
const q = readFileSync('src/features/invoices/InvoicesView.tsx', 'utf8');

describe('Rechnungsansicht: seltene Fenster nachgeladen', () => {
  it('Mail und Bankgarantie kommen über lazy(() => import(…))', () => {
    expect(q).toMatch(/const BelegMailDialog = lazy\(\(\) => import\('@\/features\/belegMail\/BelegMailDialog'\)\);/);
    expect(q).toMatch(/const BankgarantieDialog = lazy\(\(\) => import\('\.\/BankgarantieDialog'\)\);/);
    expect(q).not.toMatch(/^import BelegMailDialog|^import BankgarantieDialog/m);
  });
  it('die E-Rechnung bleibt fest eingebunden (Begründung oben)', () => {
    expect(q).toMatch(/^import EbInterfaceDialog from '\.\/EbInterfaceDialog';/m);
  });
});
