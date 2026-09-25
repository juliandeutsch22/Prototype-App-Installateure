/**
 * Den Handwerksschein schreibt, wer rausfährt oder die Baustelle
 * verantwortet — gegen die echte Datenbank.
 *
 * PRÜFLAUF 25.09.2026 (P3-10): Anlegen fragte keine Rolle, Ändern nur den
 * Betrieb. Buchhaltung und Verwaltung schrieben über die Schnittstelle an
 * fremden Entwürfen, und aus einem Entwurf ging jeder Übergang —
 * „Unterschrieben" ohne Unterschrift, „Storniert" ohne je unterschrieben
 * gewesen zu sein.
 */
import { describe, it, expect, beforeAll } from 'vitest';
import { admin, betriebAnlegen, konto, type Konto } from './helfer';

const BETRIEB = 'schein-recht';

let monteur: Konto;
let kollege: Konto;
let leitung: Konto;
let buch: Konto;
let verwaltung: Konto;

const UNTERSCHRIFT = { name: 'Huber', bild: 'data:image/png;base64,AAA', geraetZeit: 1776000000000 };

async function entwurf(k: Konto = monteur): Promise<string> {
  const id = crypto.randomUUID();
  const { error } = await k.client.from('work_sheets').insert({
    id, company_id: BETRIEB, project_number: 'SR-1', customer_name: 'Familie Huber',
    datum: '2026-05-04', status: 'Entwurf', abrechnung: 'Regie',
    erstellt_von_uid: k.uid, erstellt_von_name: 'Monteur',
  });
  if (error) throw new Error(error.message);
  return id;
}

async function schein(id: string) {
  const { data } = await admin.from('work_sheets')
    .select('status, notizen, customer_name').eq('id', id).single();
  return data!;
}

async function stunden(id: string): Promise<number> {
  const { data } = await admin.from('work_sheet_hours').select('id').eq('work_sheet_id', id);
  return (data ?? []).length;
}

beforeAll(async () => {
  await betriebAnlegen(BETRIEB, 'Scheinrechte');
  monteur = await konto(BETRIEB, 'Mitarbeiter', 'srmon');
  kollege = await konto(BETRIEB, 'Mitarbeiter', 'srkol');
  leitung = await konto(BETRIEB, 'Projektleiter', 'srpl');
  buch = await konto(BETRIEB, 'Buchhaltung', 'srbuch');
  verwaltung = await konto(BETRIEB, 'Verwaltung', 'srverw');
}, 180_000);

describe('Wer einen Schein anlegt', () => {
  it('Monteur und Leitung — Buchhaltung und Verwaltung nicht', async () => {
    await expect(entwurf(monteur)).resolves.toBeTruthy();
    await expect(entwurf(leitung)).resolves.toBeTruthy();
    await expect(entwurf(buch)).rejects.toThrow();
    await expect(entwurf(verwaltung)).rejects.toThrow();
  });

  it('auch nicht über `schein_speichern`', async () => {
    const { error } = await buch.client.rpc('schein_speichern', {
      p_id: crypto.randomUUID(),
      p_kopf: {
        project_number: 'SR-1', customer_name: 'Huber', datum: '2026-05-04',
        abrechnung: 'Regie', erstellt_von_name: 'Buchhaltung',
      },
      p_zeiten: null, p_material: null, p_fotos: null,
    });
    expect(error?.code).toBe('42501');
  });
});

describe('Wer einen Entwurf ändert', () => {
  it('der Monteur seinen eigenen', async () => {
    const id = await entwurf();
    const { error } = await monteur.client.from('work_sheets').update({ notizen: 'fertig' }).eq('id', id);
    expect(error).toBeNull();
    expect(await schein(id)).toMatchObject({ notizen: 'fertig' });
  });

  it('die Buchhaltung keinen — weder den Kopf noch die Stunden', async () => {
    const id = await entwurf();
    await buch.client.from('work_sheets').update({ customer_name: 'Jemand anderer' }).eq('id', id);
    const { error } = await buch.client.rpc('schein_speichern', {
      p_id: id, p_kopf: null,
      p_zeiten: [{ datum: '2026-05-04', mitarbeiter: 'Erfunden', minuten: 600 }],
      p_material: null, p_fotos: null,
    });
    expect(error).not.toBeNull();
    expect(await schein(id)).toMatchObject({ customer_name: 'Familie Huber' });
    expect(await stunden(id)).toBe(0);
  });

  it('der Kollege keinen fremden', async () => {
    const id = await entwurf();
    await kollege.client.from('work_sheets').update({ notizen: 'vom Kollegen' }).eq('id', id);
    await kollege.client.from('work_sheets')
      .update({ status: 'Verworfen', verworfen_von_name: 'Kollege' }).eq('id', id);
    // Die Richtlinie trifft still null Zeilen — geprüft wird das Ergebnis.
    expect(await schein(id)).toMatchObject({ status: 'Entwurf', notizen: null });
  });

  it('die Leitung jeden', async () => {
    const id = await entwurf();
    const { error } = await leitung.client.from('work_sheets').update({ notizen: 'von der Leitung' }).eq('id', id);
    expect(error).toBeNull();
    expect(await schein(id)).toMatchObject({ notizen: 'von der Leitung' });
  });
});

describe('Aus dem Entwurf', () => {
  it('wird er nicht ohne Unterschriften „Unterschrieben"', async () => {
    const id = await entwurf();
    const ohne = await monteur.client.from('work_sheets').update({ status: 'Unterschrieben' }).eq('id', id);
    expect(ohne.error?.code).toBe('42501');
    const halb = await monteur.client.from('work_sheets')
      .update({ status: 'Unterschrieben', unterschrift_monteur: UNTERSCHRIFT }).eq('id', id);
    expect(halb.error?.code).toBe('42501');
    expect(await schein(id)).toMatchObject({ status: 'Entwurf' });
  });

  it('mit beiden schon — über den Weg der App', async () => {
    const id = await entwurf();
    const { error } = await monteur.client.rpc('schein_unterschreiben', {
      p_id: id, p_monteur: UNTERSCHRIFT, p_kunde: UNTERSCHRIFT,
    });
    expect(error).toBeNull();
    expect(await schein(id)).toMatchObject({ status: 'Unterschrieben' });
  });

  it('wird er nie „Storniert" — auch nicht von der Leitung', async () => {
    const id = await entwurf();
    const { error } = await leitung.client.from('work_sheets')
      .update({ status: 'Storniert', storno_grund: 'Irrtum' }).eq('id', id);
    expect(error?.code).toBe('42501');
    // Der Weg für einen Entwurf, den niemand mehr braucht, bleibt offen.
    const verworfen = await monteur.client.from('work_sheets')
      .update({ status: 'Verworfen', verworfen_von_name: 'Monteur' }).eq('id', id);
    expect(verworfen.error).toBeNull();
  });
});
