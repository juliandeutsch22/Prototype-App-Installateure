/**
 * Der Support mit „mitarbeiten" erledigt auch, was die App über den Server
 * schickt — gegen die echte Datenbank (offene Punkte B2, Prüflauf P3-14).
 *
 * Bis zum 29.09.2026 holten die Datenbankfunktionen den Betrieb aus dem
 * Anmeldekonto, und ein Plattformkonto hat keinen: Einsatz, Rüstliste,
 * Angebot, Nummern, Kundenübernahme und Katalog scheiterten mit „Nicht
 * angemeldet". Geprüft wird hier jeder dieser Wege über die Funktionen der
 * App — und die Kante: mit „ansehen", nach dem Wechsel in einen anderen
 * Betrieb und nach dem Widerruf bleibt es beim Nein, und eine
 * Rechnungsnummer bekommt der Support nie.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { admin, betriebAnlegen, einblickBeginnen, konto, plattformkonto, type Konto } from './helfer';
import { clientEinreichen } from '@/lib/db/pg/kern';
import { saveAssignments } from '@/lib/db/pg/assignments';
import { ladenUmschalten, saveEinsatzMaterial } from '@/lib/db/pg/einsatzMaterial';
import { reserveQuoteNumber } from '@/lib/db/pg/quotes';
import { reserveProjectNumber } from '@/lib/db/pg/projects';
import { reserveInvoiceNumber } from '@/lib/db/pg/invoices';
import { naechsteNummern } from '@/lib/db/pg/company';
import { kundenEinspielen, kundenVorhanden, type NewCustomer } from '@/lib/db/pg/customers';
import * as dn from '@/lib/db/pg/datanorm';

const BETRIEB = 'sup-arbeit';
const ANDERER = 'sup-arbeit-b';
const BAU = 'B-SUP-1';
const JAHR = new Date().getFullYear();

let chef: Konto;
let monteur: Konto;
let anderChef: Konto;
let plattform: Konto;

beforeAll(async () => {
  await betriebAnlegen(BETRIEB, 'Mitarbeit GmbH');
  await betriebAnlegen(ANDERER, 'Anderer Betrieb GmbH');
  chef = await konto(BETRIEB, 'Geschäftsführung', 'sachef');
  monteur = await konto(BETRIEB, 'Mitarbeiter', 'samon');
  anderChef = await konto(ANDERER, 'Geschäftsführung', 'sbchef');
  plattform = await plattformkonto('sarbeit');
}, 180_000);

afterAll(async () => {
  clientEinreichen(null);
  for (const b of [BETRIEB, ANDERER]) {
    await admin.from('support_zugriffe').delete().eq('company_id', b);
    await admin.from('support_freigaben').delete().eq('company_id', b);
  }
});

/** Eine Freigabe geben und den Einblick beginnen, wie die App es tut. */
async function einblick(stufe: 'ansehen' | 'mitarbeiten', betrieb = BETRIEB, wer: Konto = chef) {
  const { data, error } = await wer.client.from('support_freigaben').insert({
    company_id: betrieb, gewaehrt_von: wer.uid, grund: 'Einteilung nachziehen',
    gilt_bis: new Date(Date.now() + 2 * 3_600_000).toISOString(), stufe,
  }).select('id').single();
  if (error) throw new Error(error.message);
  const id = (data as { id: string }).id;
  await einblickBeginnen(plattform, betrieb, id);
  clientEinreichen(plattform.client);
  return id;
}

const einteilung = (tag: string) => [{
  date: tag, projectNumber: BAU, userId: monteur.uid, userName: 'Monteur',
  asHelper: false, createdBy: 'Support',
}];

const eingeteilt = async (tag: string, betrieb = BETRIEB) => {
  const { data } = await admin.from('assignments').select('user_id')
    .eq('company_id', betrieb).eq('date', tag);
  return (data ?? []) as { user_id: string }[];
};

const zaehler = async (art: string) => {
  const { data } = await admin.from('number_counters').select('stand')
    .eq('company_id', BETRIEB).eq('art', art).eq('jahr', JAHR).maybeSingle();
  return (data as { stand: number } | null)?.stand ?? null;
};

describe('Mit „mitarbeiten" geht, was über den Server läuft', () => {
  beforeAll(async () => {
    await einblick('mitarbeiten');
  });

  it('einen Einsatz einteilen — im Betrieb des Einblicks', async () => {
    await saveAssignments(BETRIEB, '2099-03-02', BAU, einteilung('2099-03-02'));
    expect(await eingeteilt('2099-03-02')).toEqual([{ user_id: monteur.uid }]);
  });

  it('die Rüstliste anlegen und eine Position abhaken', async () => {
    await saveEinsatzMaterial(BETRIEB, '2099-03-02', BAU,
      [{ id: 'p1', name: 'Eckventil', menge: 2 }], [monteur.uid], 'Support');
    await ladenUmschalten(BETRIEB, '2099-03-02', BAU, 'p1', true, 'Support');
    const { data } = await admin.from('einsatz_material').select('company_id, geladen, uids')
      .eq('company_id', BETRIEB).eq('date', '2099-03-02').single();
    const kopf = data as { company_id: string; geladen: Record<string, unknown>; uids: string[] };
    expect(Object.keys(kopf.geladen)).toEqual(['p1']);
    expect(kopf.uids).toEqual([monteur.uid]);
  });

  it('Angebots- und Baustellennummer ziehen — der Zähler des Betriebs läuft', async () => {
    const angebot = await reserveQuoteNumber(BETRIEB);
    expect(angebot).toMatch(new RegExp(`${JAHR}`));
    expect(await zaehler('quotes')).toBe(1);
    await reserveProjectNumber(BETRIEB, { seedFrom: 0 });
    expect(await zaehler('projects')).toBe(1);
  });

  it('die Vorschau der nächsten Nummern zeigt den Stand dieses Betriebs', async () => {
    const naechste = await naechsteNummern(JAHR);
    expect(naechste).toEqual({ rechnung: 1001, angebot: 2, baustelle: 2 });
  });

  it('ein Angebot samt Positionen anlegen', async () => {
    const { data, error } = await plattform.client.rpc('angebot_speichern', {
      p_id: null,
      p_kopf: {
        quote_number: `AN-${JAHR}-0001`, customer_name: 'Familie Huber',
        quote_date: '2099-03-01', valid_until: '2099-03-31', vat_rate: 20,
      },
      p_positionen: [{ label: 'Arbeitszeit', qty: 2, unit: 'h', unit_price: 80, netto: 160, ist_arbeitszeit: true }],
    });
    expect(error).toBeNull();
    const { data: kopf } = await admin.from('quotes').select('company_id, status').eq('id', data as string).single();
    expect(kopf).toEqual({ company_id: BETRIEB, status: 'Entwurf' });
    const { data: zeilen } = await admin.from('quote_lines').select('company_id').eq('quote_id', data as string);
    expect(zeilen).toEqual([{ company_id: BETRIEB }]);
  });

  it('Kunden übernehmen — Probelauf und Übernahme', async () => {
    const liste = [{ name: 'Installateurkunde Support', active: true }] as NewCustomer[];
    expect(await kundenVorhanden(liste)).toEqual([]);
    expect(await kundenEinspielen(liste)).toEqual({ angelegt: 1, uebersprungen: 0 });
    const { data } = await admin.from('customers').select('company_id')
      .eq('name', 'Installateurkunde Support');
    expect(data).toEqual([{ company_id: BETRIEB }]);
  });

  it('einen Katalog einspielen — mit Einkaufspreis', async () => {
    const lieferant = await dn.lieferantAnlegen(BETRIEB, 'Grosshandel Support', plattform.client);
    const lauf = await dn.laufAnlegen(BETRIEB, lieferant, 'k.001', 'cp850', {}, plattform.client);
    await dn.zeilenSchicken(BETRIEB, lauf, [{
      zeile: 1, artikelnummer: 'SUP-1', name: 'Kugelhahn 1/2', einheit: 'Stk',
      preis: 12.4, preisArt: 'netto', verarbeitung: 'neu',
    }], undefined, plattform.client);
    const bericht = await dn.uebernehmen(lauf, plattform.client);
    expect(bericht.angelegt).toBe(1);

    // Kein Belegschaftskonto — das Feld bleibt leer, statt am Fremdschlüssel zu scheitern.
    const { data: kopf } = await admin.from('datanorm_laeufe').select('angelegt_von').eq('id', lauf).single();
    expect(kopf).toEqual({ angelegt_von: null });
    // Die Gegenprobe: beim Betrieb selbst steht, wer es war.
    const eigener = await dn.laufAnlegen(BETRIEB, lieferant, 'k.002', 'cp850', {}, chef.client);
    const { data: eigenerKopf } = await admin.from('datanorm_laeufe').select('angelegt_von').eq('id', eigener).single();
    expect(eigenerKopf).toEqual({ angelegt_von: chef.uid });
    await dn.laufVerwerfen(eigener, chef.client);

    const { data: artikel } = await admin.from('materials').select('id')
      .eq('company_id', BETRIEB).eq('article_number', 'SUP-1').single();
    const { data: preis } = await admin.from('material_einkaufspreise').select('einkaufspreis')
      .eq('material_id', (artikel as { id: string }).id).single();
    expect(preis).toEqual({ einkaufspreis: 12.4 });
  });

  it('den Einkaufspreis am Artikel ändern, wie die Spitze', async () => {
    const { data: artikel } = await admin.from('materials').select('id')
      .eq('company_id', BETRIEB).eq('article_number', 'SUP-1').single();
    const id = (artikel as { id: string }).id;
    const { error } = await plattform.client.from('materials').update({ einkaufspreis: 11.9 }).eq('id', id);
    expect(error).toBeNull();
    const { data: preis } = await admin.from('material_einkaufspreise').select('einkaufspreis')
      .eq('material_id', id).single();
    expect(preis).toEqual({ einkaufspreis: 11.9 });
  });

  it('eine Rechnungsnummer NICHT — und der Zähler bleibt stehen', async () => {
    const vorher = await zaehler('invoices');
    await expect(reserveInvoiceNumber(BETRIEB, { seedFrom: 0 }))
      .rejects.toThrow(/Rechnungsnummern vergibt nur der Betrieb selbst/);
    expect(await zaehler('invoices')).toBe(vorher);

    // Die Gegenprobe: der Betrieb selbst zieht sie.
    clientEinreichen(chef.client);
    await reserveInvoiceNumber(BETRIEB, { seedFrom: 0 });
    expect(await zaehler('invoices')).toBe(1001);
    clientEinreichen(plattform.client);
  });
});

describe('Und sonst bleibt es beim Nein', () => {
  it('mit „ansehen" — weder Einsatz noch Nummer noch Preis', async () => {
    await einblick('ansehen');
    await expect(saveAssignments(BETRIEB, '2099-03-03', BAU, einteilung('2099-03-03')))
      .rejects.toThrow(/Nicht angemeldet/);
    expect(await eingeteilt('2099-03-03')).toEqual([]);

    const vorher = await zaehler('quotes');
    await expect(reserveQuoteNumber(BETRIEB)).rejects.toThrow();
    expect(await zaehler('quotes')).toBe(vorher);

    const { data: artikel } = await admin.from('materials').select('id')
      .eq('company_id', BETRIEB).eq('article_number', 'SUP-1').single();
    const id = (artikel as { id: string }).id;
    await plattform.client.from('materials').update({ einkaufspreis: 1 }).eq('id', id);
    const { data: preis } = await admin.from('material_einkaufspreise').select('einkaufspreis')
      .eq('material_id', id).single();
    expect(preis).toEqual({ einkaufspreis: 11.9 });
  });

  it('nach dem Wechsel in einen anderen Betrieb — der jüngste Einblick zählt', async () => {
    await einblick('mitarbeiten');
    // Die Gegenprobe: in A geht es jetzt.
    await saveAssignments(BETRIEB, '2099-03-04', BAU, einteilung('2099-03-04'));
    expect(await eingeteilt('2099-03-04')).toHaveLength(1);

    await einblick('ansehen', ANDERER, anderChef);
    await expect(saveAssignments(BETRIEB, '2099-03-05', BAU, einteilung('2099-03-05')))
      .rejects.toThrow(/Nicht angemeldet/);
    expect(await eingeteilt('2099-03-05')).toEqual([]);
    expect(await eingeteilt('2099-03-05', ANDERER)).toEqual([]);
  });

  it('nach dem Widerruf', async () => {
    const id = await einblick('mitarbeiten');
    const { error } = await chef.client.from('support_freigaben')
      .update({ widerrufen_am: new Date().toISOString(), widerrufen_von: chef.uid }).eq('id', id);
    expect(error).toBeNull();
    await expect(saveAssignments(BETRIEB, '2099-03-06', BAU, einteilung('2099-03-06')))
      .rejects.toThrow(/Nicht angemeldet/);
    expect(await eingeteilt('2099-03-06')).toEqual([]);
  });

  it('der Betrieb selbst merkt nichts davon', async () => {
    clientEinreichen(chef.client);
    await saveAssignments(BETRIEB, '2099-03-07', BAU, einteilung('2099-03-07'));
    expect(await eingeteilt('2099-03-07')).toHaveLength(1);
    expect((await naechsteNummern(JAHR)).angebot).toBe(2);
  });
});
