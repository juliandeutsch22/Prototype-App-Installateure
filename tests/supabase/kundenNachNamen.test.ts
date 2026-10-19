/**
 * Kunden zu Namen (Ladezeit, 19.10.2026) — in der Datenbank geprüft.
 *
 * Rechnungen, Mahnlauf, Ausgangsbuch und Belegarchiv holten die ersten 500
 * Kunden des Betriebs und schlugen darin über den Namen nach. Was dahinter
 * lag, fand seine UID nicht und galt beim Mahnen als Verbraucher. Jetzt
 * fragen sie genau nach den Namen, über den ganzen Stamm; das Muster darf
 * dabei weiter sein als der genaue Vergleich in der Ansicht, aber nichts
 * auslassen, was dort passt.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { admin, betriebAnlegen, konto, type Konto } from './helfer';
import { clientEinreichen } from '@/lib/db/pg/kern';
import { kundenNachNamen, listCustomers } from '@/lib/db/pg/customers';

const BETRIEB = 'kunden-namen';
const FREMD = 'kunden-namen-fremd';
const STAMM = 600;
let buero: Konto;
const besondere = ['Huber & Söhne, Installationen', 'Aktion 50% GmbH', 'Bau_Team KG', 'Familie  Maier', 'Gemeinde (Neudorf)'];

beforeAll(async () => {
  await betriebAnlegen(BETRIEB);
  await betriebAnlegen(FREMD);
  buero = await konto(BETRIEB, 'Verwaltung', 'buero-kn');
  const zeilen = Array.from({ length: STAMM }, (_, i) => ({ company_id: BETRIEB, name: `Kunde ${String(i).padStart(4, '0')}` }));
  for (let i = 0; i < zeilen.length; i += 500) {
    const { error } = await admin.from('customers').insert(zeilen.slice(i, i + 500));
    if (error) throw new Error(error.message);
  }
  const { error } = await admin.from('customers').insert([
    ...besondere.map((name) => ({ company_id: BETRIEB, name })),
    { company_id: FREMD, name: 'Kunde 0001' },
  ]);
  if (error) throw new Error(error.message);
  clientEinreichen(buero.client);
}, 120_000);

afterAll(() => clientEinreichen(null));

describe('Kunden nach Namen', () => {
  it('findet jeden genannten Kunden, auch hinter den ersten 500', async () => {
    const namen = ['Kunde 0003', 'Kunde 0550', 'Kunde 0599'];
    const treffer = await kundenNachNamen(BETRIEB, namen);
    expect(treffer.map((k) => k.name).sort()).toEqual(namen);
  });

  it('Gegenprobe: der alte Weg holt nur 500 der Kunden', async () => {
    expect(await listCustomers(BETRIEB)).toHaveLength(500);
  });

  it('nur aus dem eigenen Betrieb — gleich heissende Kunden anderer Betriebe nicht', async () => {
    const treffer = await kundenNachNamen(BETRIEB, ['Kunde 0001']);
    expect(treffer).toHaveLength(1);
    expect(treffer[0].companyId).toBe(BETRIEB);
  });

  it('verträgt Komma, Prozent, Unterstrich, Und-Zeichen und Klammern — ohne sie als Joker zu lesen', async () => {
    const ohneDoppelte = besondere.filter((n) => !n.includes('  '));
    const treffer = await kundenNachNamen(BETRIEB, ohneDoppelte);
    expect(treffer.map((k) => k.name).sort()).toEqual([...ohneDoppelte].sort());
    expect(await kundenNachNamen(BETRIEB, ['Bau_Tea'])).toEqual([]);
  });

  it('ohne Rücksicht auf Gross- und Kleinschreibung und doppelte Leerzeichen — wie der Vergleich in der Ansicht', async () => {
    const treffer = await kundenNachNamen(BETRIEB, [' familie maier ', 'KUNDE 0007']);
    expect(treffer.map((k) => k.name).sort()).toEqual(['Familie  Maier', 'Kunde 0007']);
  });

  it('fragt in Stücken: auch sechzig Namen auf einmal', async () => {
    const namen = Array.from({ length: 60 }, (_, i) => `Kunde ${String(i * 10).padStart(4, '0')}`);
    expect(await kundenNachNamen(BETRIEB, namen)).toHaveLength(60);
  });

  it('ohne Namen keine Abfrage und kein ganzer Stamm', async () => {
    expect(await kundenNachNamen(BETRIEB, ['', '   '])).toEqual([]);
  });
});
