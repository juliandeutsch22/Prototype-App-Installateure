/**
 * Testbericht 30.09.2026, G31 — eine Anforderung aus der Rüstliste steht auf
 * dem eingeteilten Monteur, nicht auf dem Planer. Die Führung darf deshalb
 * auf eine Person DESSELBEN Betriebs anlegen. Gegenproben: ein Monteur
 * weiterhin nur auf den eigenen Namen, und niemand auf eine Person eines
 * anderen Betriebs.
 */
import { describe, it, expect, beforeAll } from 'vitest';
import { betriebAnlegen, konto, type Konto } from './helfer';

const A = 'g31-a';
const B = 'g31-b';
let planer: Konto;
let monteur: Konto;
let kollege: Konto;
let fremd: Konto;

function anforderung(uid: string) {
  return {
    id: crypto.randomUUID(), company_id: A, material_name: 'Mischbatterie', quantity: 2,
    status: 'Offen', transaction_type: 'order', user_id: uid, user_name: 'x',
  };
}

beforeAll(async () => {
  await betriebAnlegen(A);
  await betriebAnlegen(B);
  planer = await konto(A, 'Projektleiter', 'g31pl');
  monteur = await konto(A, 'Mitarbeiter', 'g31mo');
  kollege = await konto(A, 'Mitarbeiter', 'g31ko');
  fremd = await konto(B, 'Mitarbeiter', 'g31fr');
}, 120_000);

describe('Anforderung auf den Eingeteilten (G31)', () => {
  it('die Führung legt auf einen Monteur des Betriebs an', async () => {
    const { error } = await planer.client.from('material_orders').insert(anforderung(monteur.uid));
    expect(error).toBeNull();
  });

  it('Gegenprobe: ein Monteur nicht auf einen Kollegen', async () => {
    const { error } = await monteur.client.from('material_orders').insert(anforderung(kollege.uid));
    expect(error?.code).toBe('42501');
  });

  it('Gegenprobe: ein Monteur weiter auf sich selbst', async () => {
    const { error } = await monteur.client.from('material_orders').insert(anforderung(monteur.uid));
    expect(error).toBeNull();
  });

  it('Gegenprobe: auch die Führung nicht auf eine Person eines anderen Betriebs', async () => {
    const { error } = await planer.client.from('material_orders').insert(anforderung(fremd.uid));
    expect(error?.code).toBe('42501');
  });
});
