/**
 * AUDIT 12.10.2026 – zusätzliche fachliche Durchstiche.
 * Nur Testdaten in einem frischen lokalen Supabase-Stack, keine Änderungen an
 * Produktivcode oder Migrationen.
 *
 * `it.fails` bedeutet: Das gewünschte Verhalten ist derzeit NICHT erfüllt.
 * Nicht als behoben werten; nach einem isolierten Fix in `it` umwandeln.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { betriebAnlegen, konto, type Konto } from './helfer';
import { clientEinreichen } from '@/lib/db/pg/kern';
import { createWorkSheet, listOwnWorkSheetsSince, signWorkSheet } from '@/lib/db/pg/workSheets';
import { updateOrderStatus } from '@/lib/db/pg/materialOrders';

const FIRMA = 'audit-nachtrag-1012';
let leitung: Konto;
let monteur: Konto;
let scheinId: string;

beforeAll(async () => {
  await betriebAnlegen(FIRMA);
  leitung = await konto(FIRMA, 'Geschäftsführung', 'audit-leitung');
  monteur = await konto(FIRMA, 'Mitarbeiter', 'audit-monteur');
  const heute = '2026-10-10';
  clientEinreichen(leitung.client);
  scheinId = await createWorkSheet(FIRMA, {
    projectNumber: 'AUDIT-2026-001',
    customerName: 'Auditkunde',
    datum: heute,
    status: 'Entwurf',
    abrechnung: 'Regie',
    zeiten: [{
      datum: heute,
      mitarbeiter: 'Audit Monteur',
      von: '08:00',
      bis: '10:00',
      pauseMin: 0,
      minuten: 120,
    }],
    material: [],
    erstelltVonUid: leitung.uid,
    erstelltVonName: 'Audit Leitung',
  } as Parameters<typeof createWorkSheet>[1]);
  const unterschrift = { name: 'Audit', bild: 'data:image/png;base64,AAA', geraetZeit: 1781300000000 };
  await signWorkSheet(scheinId, unterschrift, unterschrift);
}, 180_000);
afterAll(() => clientEinreichen(null));

describe('Audit: Nachtrag bei für Mitarbeiter erstelltem Schein', () => {
  it('der Ersteller sieht den von ihm angelegten Schein', async () => {
    clientEinreichen(leitung.client);
    const scheine = await listOwnWorkSheetsSince(FIRMA, leitung.uid, '2026-10-01');
    expect(scheine.some((s) => s.id === scheinId)).toBe(true);
  });

  it.fails('der arbeitende Monteur erhält auch einen von der Leitung erstellten Schein für seinen Nachtragsabgleich', async () => {
    clientEinreichen(monteur.client);
    const scheine = await listOwnWorkSheetsSince(FIRMA, monteur.uid, '2026-10-01');
    // Fachlicher Sollzustand: Stunden-Nachtrag hängt an der arbeitenden Person,
    // nicht am Erstellerkonto des Scheins.
    expect(scheine.some((s) => s.id === scheinId)).toBe(true);
  });
});

describe('Audit: Materialanforderung mit fehlender ID', () => {
  it.fails('meldet einen fehlenden Status-UPDATE-Treffer als Fehler', async () => {
    clientEinreichen(leitung.client);
    // Eine zufällige UUID kann kein Datensatz dieses Testbetriebs sein.
    const nichtVorhanden = crypto.randomUUID();
    await expect(updateOrderStatus(nichtVorhanden, 'In Bearbeitung')).rejects.toThrow();
  });
});
