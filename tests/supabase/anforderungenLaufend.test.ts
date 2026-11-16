/**
 * ANFORDERUNGEN „LAUFEND“ AUS DER DATENBANK (`anforderungen_laufend`,
 * Durchsicht 15.11.2026, Budget B3).
 *
 * „Laufend“ holte jede offene Anforderung und rechnete im Browser: Gruppen,
 * Reihenfolge (Eil zuerst, dann die älteste), die Filter der Startseite
 * (`anforderungStand.ts`), die Baustellen der Auswahl, die Zahl am Reiter
 * „Einkauf“. Jetzt rechnet die Datenbank und gibt je Gruppe die gezeigte Seite.
 *
 * Geprüft wird „bleibt gleich“: für jeden Filter dieselben Anforderungen in
 * derselben Reihenfolge wie die Regeln der App über alle offenen; dazu die
 * Seite, die Rechte (der Monteur sieht nur seine) und der fremde Betrieb.
 *
 * Gegenprobe: ohne 20261118032000 fehlt die Funktion (rot).
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { randomUUID } from 'node:crypto';
import { admin, betriebAnlegen, konto, type Konto } from './helfer';
import { clientEinreichen } from '@/lib/db/pg/kern';
import { anforderungenLaufend, listOpenOrders } from '@/lib/db/pg/materialOrders';
import { istAbholbereitAlt, istLieferungHeute, istLieferungUeberfaellig } from '@/features/orders/anforderungStand';
import type { MaterialOrder } from '@/types';

const A = 'laufend-a';
const B = 'laufend-b';
const HEUTE = '2026-11-16';
const JETZT = Date.parse('2026-11-16T10:00:00Z');
let lager: Konto;
let monteur: Konto;
let fremd: Konto;

const tagZurueck = (n: number) => new Date(JETZT - n * 86_400_000).toISOString();

beforeAll(async () => {
  await betriebAnlegen(A);
  await betriebAnlegen(B);
  lager = await konto(A, 'Verwaltung', 'lf-lager');
  monteur = await konto(A, 'Mitarbeiter', 'lf-monteur');
  fremd = await konto(B, 'Verwaltung', 'lf-fremd');
  const o = (p: Record<string, unknown>) => ({
    id: randomUUID(), company_id: A, material_name: 'Fitting', quantity: 1, status: 'Offen', transaction_type: 'order',
    user_id: lager.uid, is_urgent: false, project_number: null, beschaffung: null, bestellt_am: null, geliefert_am: null,
    liefertermin: null, abholbereit_seit: null, created_at: tagZurueck(30), ...p,
  });
  const zeilen = [
    ...Array.from({ length: 23 }, (_, i) => o({ material_name: `Offen ${i}`, created_at: tagZurueck(40 - i), project_number: i % 2 ? 'PR-1' : 'PR-2' })),
    o({ material_name: 'Eil offen', is_urgent: true, created_at: tagZurueck(1) }),
    o({ material_name: 'Eil in Arbeit', is_urgent: true, status: 'In Bearbeitung' }),
    o({ material_name: 'Bestellt überfällig', status: 'In Bearbeitung', beschaffung: 'einkauf', bestellt_am: tagZurueck(10), liefertermin: '2026-11-10' }),
    o({ material_name: 'Bestellt heute', status: 'In Bearbeitung', beschaffung: 'einkauf', bestellt_am: tagZurueck(5), liefertermin: HEUTE }),
    o({ material_name: 'Einkauf offen', status: 'In Bearbeitung', beschaffung: 'einkauf' }),
    o({ material_name: 'Abholbereit alt', status: 'Abholbereit', abholbereit_seit: tagZurueck(5) }),
    o({ material_name: 'Abholbereit drei Tage', status: 'Abholbereit', abholbereit_seit: tagZurueck(3) }),
    o({ material_name: 'Vom Monteur', user_id: monteur.uid }),
    o({ material_name: 'Erledigt', status: 'Erledigt' }),
    o({ material_name: 'Retoure', transaction_type: 'return' }),
  ];
  const { error } = await admin.from('material_orders').insert(zeilen);
  if (error) throw new Error(error.message);
  const f = await admin.from('material_orders').insert(o({ company_id: B, user_id: fremd.uid, material_name: 'Fremd' }));
  if (f.error) throw new Error(f.error.message);
  clientEinreichen(lager.client);
}, 120_000);

afterAll(() => clientEinreichen(null));

/** Die Rechnung der App bis 15.11.2026: alle offenen, gefiltert, gruppiert, sortiert. */
async function wieBisher(filter: string | null, projekt: string | null = null) {
  const offen = (await listOpenOrders(A)).filter((x) => x.transactionType === 'order');
  const passt = (x: MaterialOrder) => {
    switch (filter) {
      case 'offen': return x.status === 'Offen';
      case 'eil': return !!x.isUrgent && (x.status === 'Offen' || x.status === 'In Bearbeitung');
      case 'abholbereit-alt': return istAbholbereitAlt(x, JETZT);
      case 'bestellt-ueberfaellig': return istLieferungUeberfaellig(x, HEUTE);
      case 'lieferung-heute': return istLieferungHeute(x, HEUTE);
      default: return true;
    }
  };
  return (['Offen', 'In Bearbeitung', 'Abholbereit'] as const).map((status) => offen
    .filter((x) => x.status === status && passt(x) && (!projekt || x.projectNumber === projekt))
    .sort((a, b) => Number(!!b.isUrgent) - Number(!!a.isUrgent) || (a.createdAt ?? 0) - (b.createdAt ?? 0))
    .map((x) => x.materialName));
}

const alleZeilen = { Offen: 100, 'In Bearbeitung': 100, Abholbereit: 100 };

describe('Anforderungen „Laufend“ aus der Datenbank', () => {
  it.each([null, 'offen', 'eil', 'abholbereit-alt', 'bestellt-ueberfaellig', 'lieferung-heute'])(
    'bleibt gleich: Filter %s — dieselben Anforderungen in derselben Reihenfolge wie die Regeln der App',
    async (filter) => {
      const l = await anforderungenLaufend({ heute: HEUTE, jetzt: JETZT, filter, anzahl: alleZeilen });
      const erwartet = await wieBisher(filter);
      expect(l.gruppen.map((g) => g.zeilen.map((x) => x.materialName))).toEqual(erwartet);
      expect(l.gruppen.map((g) => g.anzahl)).toEqual(erwartet.map((e) => e.length));
    },
  );

  it('gibt je Gruppe nur die gefragte Seite — die Zahl über alle; Baustelle filtert', async () => {
    const l = await anforderungenLaufend({ heute: HEUTE, jetzt: JETZT, anzahl: { Offen: 20 } });
    const offen = l.gruppen.find((g) => g.status === 'Offen')!;
    expect(offen.zeilen).toHaveLength(20);
    expect(offen.anzahl).toBe(25);
    expect(offen.zeilen[0].materialName).toBe('Eil offen');
    const pr1 = await anforderungenLaufend({ heute: HEUTE, jetzt: JETZT, projekt: 'PR-1', anzahl: alleZeilen });
    expect(pr1.gruppen[0].zeilen.map((x) => x.materialName)).toEqual((await wieBisher(null, 'PR-1'))[0]);
    expect(l.projekte).toEqual(['PR-1', 'PR-2']);
    // Auf der Einkaufsliste, noch nicht bestellt: nur „Einkauf offen“.
    expect(l.zuBestellen).toBe(1);
  });

  it('Rechte: der Monteur nur seine, der fremde Betrieb nur seine', async () => {
    clientEinreichen(monteur.client);
    const m = await anforderungenLaufend({ heute: HEUTE, jetzt: JETZT, anzahl: alleZeilen });
    expect(m.gruppen.flatMap((g) => g.zeilen.map((x) => x.materialName))).toEqual(['Vom Monteur']);
    clientEinreichen(fremd.client);
    const b = await anforderungenLaufend({ heute: HEUTE, jetzt: JETZT, anzahl: alleZeilen });
    expect(b.gruppen.flatMap((g) => g.zeilen.map((x) => x.materialName))).toEqual(['Fremd']);
    clientEinreichen(lager.client);
    await expect(anforderungenLaufend({ heute: HEUTE, jetzt: JETZT, filter: 'quatsch', anzahl: {} })).rejects.toThrow(/Unbekannte Angabe/);
  });
});
