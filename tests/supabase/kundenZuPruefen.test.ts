/**
 * Die Zahlen an den Reitern der Kundenliste (Design-Entwurf, Punkt 2) — in
 * der Datenbank geprüft.
 *
 * „Anschrift prüfen“ und „Ohne Kundenart“ tragen die Zahl der Kunden, die
 * jemand prüfen muss. Gezählt wird beim Server über den ganzen Stamm: die
 * Listen dahinter holen höchstens 500, und eine Zahl aus ihnen bliebe bei
 * einem großen Betrieb still bei 500 stehen.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { admin, betriebAnlegen, konto, type Konto } from './helfer';
import { clientEinreichen } from '@/lib/db/pg/kern';
import { kundenAdressePruefen, kundenOhneKundenart, kundenZuPruefenAnzahl } from '@/lib/db/pg/customers';

const BETRIEB = 'kunden-pruefen';
const FREMD = 'kunden-pruefen-fremd';
let buero: Konto;

beforeAll(async () => {
  await betriebAnlegen(BETRIEB);
  await betriebAnlegen(FREMD);
  buero = await konto(BETRIEB, 'Verwaltung', 'buero-kp');
  /*
    520 mit Straße ohne PLZ und Ort — die Datenbank markiert sie selbst als
    „Anschrift prüfen“ — und ohne Kundenart; 30 vollständig, davon 10 mit
    Kundenart. Dazu ein fremder Betrieb mit einem zu prüfenden Kunden.
  */
  const zeilen = [
    ...Array.from({ length: 520 }, (_, i) => ({ company_id: BETRIEB, name: `Offen ${i}`, strasse: `Gasse ${i}` })),
    ...Array.from({ length: 30 }, (_, i) => ({
      company_id: BETRIEB,
      name: `Fertig ${i}`,
      strasse: `Weg ${i}`,
      plz: '1010',
      ort: 'Wien',
      kundenart: i < 10 ? 'privat' : null,
    })),
    { company_id: FREMD, name: 'Fremd', strasse: 'Fremdgasse 1' },
  ];
  for (let i = 0; i < zeilen.length; i += 500) {
    const { error } = await admin.from('customers').insert(zeilen.slice(i, i + 500));
    if (error) throw new Error(error.message);
  }
  clientEinreichen(buero.client);
}, 120_000);

afterAll(() => clientEinreichen(null));

describe('Wie viele Kunden zu prüfen sind', () => {
  it('zählt über den ganzen Stamm, auch hinter den ersten 500', async () => {
    expect(await kundenZuPruefenAnzahl(BETRIEB)).toEqual({ adressePruefen: 520, ohneKundenart: 540 });
  });

  it('Gegenprobe: die Listen dahinter holen höchstens 500 — aus ihnen gezählt stünde 500', async () => {
    expect(await kundenAdressePruefen(BETRIEB)).toHaveLength(500);
    expect(await kundenOhneKundenart(BETRIEB)).toHaveLength(500);
  });

  it('dieselbe Bedingung wie die Listen: unter der Grenze gleich viele', async () => {
    const zahl = await kundenZuPruefenAnzahl(BETRIEB);
    expect((await kundenAdressePruefen(BETRIEB, 1000)).length).toBe(zahl.adressePruefen);
    expect((await kundenOhneKundenart(BETRIEB, 1000)).length).toBe(zahl.ohneKundenart);
  });

  it('nur der eigene Betrieb — der fremde zu prüfende Kunde zählt nicht', async () => {
    const fremd = await kundenZuPruefenAnzahl(FREMD);
    // Das Büro sieht den fremden Betrieb nicht: dort zählt es nichts.
    expect(fremd).toEqual({ adressePruefen: 0, ohneKundenart: 0 });
  });
});
