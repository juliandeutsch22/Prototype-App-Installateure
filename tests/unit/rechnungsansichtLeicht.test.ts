import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';

/*
  DIE RECHNUNGSANSICHT BLEIBT UNTER DER GRENZE DES LEISTUNGSWÄCHTERS (L11,
  Nacharbeit 15.11.2026): 134,4 von 135 KB, mit den nachgeladenen Fenstern
  129,3 KB (Bauprotokoll). Mail und Bankgarantie kommen erst beim ersten
  Öffnen. Die E-Rechnung bleibt fest: nachgeladen hinge ihr Baustein an dem
  der Ansicht (gemeinsames `ebinterface.ts`), und der Wächter erkennte die
  Ansicht nicht mehr als eigene — er sähe sie gar nicht (gemessen).
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
