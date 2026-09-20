/**
 * Der Kontenrahmen — gegen eine echte Datenbank.
 *
 * ZWEI FRAGEN, die eine Ansicht nicht beantworten kann: wer ihn ändern darf,
 * und ob zwei Erlöskonten für denselben Steuersatz nebeneinander stehen
 * können. Das zweite ist der stillere Fehler — der Export nähme irgendeines
 * von beiden, und welches, hinge an der Sortierung.
 */
import { describe, it, expect, beforeAll, afterAll, afterEach } from 'vitest';
import { admin, betriebAnlegen, konto, type Konto } from './helfer';
import * as k from '@/lib/db/pg/konten';
import { clientEinreichen } from '@/lib/db/pg/kern';

const BETRIEB = 'konten-a';
const FREMD = 'konten-b';

let chefin: Konto;
let buch: Konto;
let monteur: Konto;
let fremd: Konto;

beforeAll(async () => {
  await betriebAnlegen(BETRIEB);
  await betriebAnlegen(FREMD);
  chefin = await konto(BETRIEB, 'Geschäftsführung', 'kngf');
  buch = await konto(BETRIEB, 'Buchhaltung', 'knbuch');
  monteur = await konto(BETRIEB, 'Mitarbeiter', 'knmont');
  fremd = await konto(FREMD, 'Geschäftsführung', 'knfremd');
  clientEinreichen(chefin.client);
}, 180_000);

afterAll(() => clientEinreichen(null));
afterEach(async () => {
  clientEinreichen(chefin.client);
  await admin.from('buchungskonten').delete().eq('company_id', BETRIEB);
});

describe('Wer den Kontenrahmen pflegt', () => {
  it('lässt die Buchhaltung ein Konto anlegen', async () => {
    /*
      SIE IST DIE ROLLE, DIE MIT DER KANZLEI SPRICHT. Für jede Kontenänderung
      die Chefin zu holen wäre eine Grenze ohne Zweck.
    */
    const id = await k.kontoAnlegen(
      BETRIEB, { zweck: 'debitoren', konto: '2000' }, buch.client,
    );
    expect(id).toBeTruthy();
  });

  it('lässt den Monteur nichts anlegen', async () => {
    await expect(
      k.kontoAnlegen(BETRIEB, { zweck: 'debitoren', konto: '2000' }, monteur.client),
    ).rejects.toThrow();
  });

  it('lässt den Monteur trotzdem lesen', async () => {
    // Ein Kontenrahmen ist keine Margeninformation; er steht auf jedem
    // Beleg, den die Kanzlei zurückschickt. Ihn zu verstecken brächte
    // nichts und machte die Ansicht kaputt.
    await k.kontoAnlegen(BETRIEB, { zweck: 'debitoren', konto: '2000' });
    expect(await k.buchungskonten(BETRIEB, monteur.client)).toHaveLength(1);
  });

  it('lässt einen fremden Betrieb weder lesen noch schreiben', async () => {
    await k.kontoAnlegen(BETRIEB, { zweck: 'debitoren', konto: '2000' });
    expect(await k.buchungskonten(BETRIEB, fremd.client)).toEqual([]);
    await expect(
      k.kontoAnlegen(BETRIEB, { zweck: 'anzahlung', konto: '3500' }, fremd.client),
    ).rejects.toThrow();
  });
});

describe('Was die Datenbank nicht zulässt', () => {
  it('weist zwei Erlöskonten für denselben Steuersatz ab', async () => {
    /*
      DER STILLERE FEHLER. Stünden beide da, nähme der Export irgendeines —
      und welches, hinge an der Sortierung. Ein halbes Jahr später steht die
      Hälfte der Umsätze auf dem falschen Konto.
    */
    await k.kontoAnlegen(BETRIEB, { zweck: 'erloes', ustSatz: 0.2, konto: '4000' });
    await expect(
      k.kontoAnlegen(BETRIEB, { zweck: 'erloes', ustSatz: 0.2, konto: '4020' }),
    ).rejects.toThrow();
  });

  it('lässt zwei Erlöskonten für VERSCHIEDENE Sätze zu', async () => {
    // Die Gegenprobe: ohne sie prüfte der Test oben womöglich nur, dass
    // überhaupt kein zweites Erlöskonto möglich ist.
    await k.kontoAnlegen(BETRIEB, { zweck: 'erloes', ustSatz: 0.2, konto: '4000' });
    await k.kontoAnlegen(BETRIEB, { zweck: 'erloes', ustSatz: 0.1, konto: '4010' });
    expect(await k.buchungskonten(BETRIEB)).toHaveLength(2);
  });

  it('weist ein zweites Debitorensammelkonto ab', async () => {
    await k.kontoAnlegen(BETRIEB, { zweck: 'debitoren', konto: '2000' });
    await expect(
      k.kontoAnlegen(BETRIEB, { zweck: 'debitoren', konto: '2100' }),
    ).rejects.toThrow();
  });

  it('weist ein Erlöskonto ohne Steuersatz ab', async () => {
    // Ein Erlöskonto ohne Satz liesse sich keiner Rechnung zuordnen — es
    // stünde im Rahmen und wäre nie das gesuchte.
    await expect(
      k.kontoAnlegen(BETRIEB, { zweck: 'erloes', konto: '4000' }),
    ).rejects.toThrow();
  });

  it('weist einen Steuersatz beim Debitorenkonto ab', async () => {
    // „Forderungen für 20 %" ist ein Widerspruch in sich.
    await expect(
      k.kontoAnlegen(BETRIEB, { zweck: 'debitoren', ustSatz: 0.2, konto: '2000' }),
    ).rejects.toThrow();
  });

  it('weist eine leere Kontonummer ab', async () => {
    // Eine Lücke, die sich als Angabe ausgibt: der Export meldete den Zweck
    // als vorhanden und schriebe eine Zeile mit leerem Konto.
    await expect(k.kontoAnlegen(BETRIEB, { zweck: 'debitoren', konto: '   ' })).rejects.toThrow();
  });

  it('weist einen Steuersatz von 100 % oder mehr ab', async () => {
    await expect(
      k.kontoAnlegen(BETRIEB, { zweck: 'erloes', ustSatz: 1, konto: '4000' }),
    ).rejects.toThrow();
  });
});
