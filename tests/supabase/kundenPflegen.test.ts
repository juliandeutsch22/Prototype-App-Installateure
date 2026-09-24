/**
 * „Kunden pflegen“ — eine Freigabe je Person, gegen die echte Datenbank.
 *
 * Entschieden am 24.09.2026 (Prüflauf F11): ob Verwaltung und Buchhaltung
 * Kunden anlegen und ändern, legt die Geschäftsführung je Person fest. Hier
 * hängt, dass die Freigabe wirkt, dass sie beim Entziehen SOFORT wegfällt
 * (nicht erst mit dem nächsten Token), dass niemand sie sich selbst gibt,
 * und dass ein umbenannter Kunde seinen Namen auch dann an die Baustellen
 * weitergibt, wenn die Bürokraft umbenennt — die darf Baustellen sonst nicht
 * ändern.
 */
import { describe, it, expect, beforeAll } from 'vitest';
import { admin, betriebAnlegen, konto, type Konto } from './helfer';

const BETRIEB = 'kunden-pflegen';

let buero: Konto;
let buchhaltung: Konto;
let monteur: Konto;
let chefin: Konto;

async function freigabe(k: Konto, an: boolean) {
  const { error } = await admin.from('users').update({ kunden_pflegen: an }).eq('id', k.uid);
  if (error) throw error;
}

async function anlegen(k: Konto, name: string) {
  return k.client.from('customers').insert({ company_id: BETRIEB, name }).select('id').maybeSingle();
}

beforeAll(async () => {
  await betriebAnlegen(BETRIEB);
  await admin.from('projects').delete().eq('company_id', BETRIEB);
  await admin.from('customers').delete().eq('company_id', BETRIEB);
  buero = await konto(BETRIEB, 'Verwaltung', 'kpbuero');
  buchhaltung = await konto(BETRIEB, 'Buchhaltung', 'kpbuch');
  monteur = await konto(BETRIEB, 'Mitarbeiter', 'kpmont');
  chefin = await konto(BETRIEB, 'Geschäftsführung', 'kpchef');
}, 120_000);

describe('Ohne Freigabe', () => {
  it('legt das Büro keinen Kunden an', async () => {
    for (const k of [buero, buchhaltung]) {
      const { error } = await anlegen(k, `Ohne ${k.rolle}`);
      expect(error?.code).toBe('42501');
    }
  });
});

describe('Mit Freigabe', () => {
  it('legt Verwaltung und Buchhaltung an, ändern und löschen', async () => {
    for (const k of [buero, buchhaltung]) {
      await freigabe(k, true);
      const neu = await anlegen(k, `Mit ${k.rolle}`);
      expect(neu.error).toBeNull();
      const id = neu.data!.id as string;
      const geaendert = await k.client.from('customers').update({ notes: 'angerufen' }).eq('id', id).select('id');
      expect(geaendert.data).toHaveLength(1);
      const weg = await k.client.from('customers').delete().eq('id', id).select('id');
      expect(weg.data).toHaveLength(1);
    }
  });

  it('entzogen gilt sie sofort — mit demselben Token', async () => {
    await freigabe(buero, false);
    const { error } = await anlegen(buero, 'Nach dem Entzug');
    expect(error?.code).toBe('42501');
    await freigabe(buero, true);
  });

  it('wirkt nicht für Monteure, auch wenn der Haken gesetzt ist', async () => {
    await freigabe(monteur, true);
    const { error } = await anlegen(monteur, 'Vom Monteur');
    expect(error?.code).toBe('42501');
  });

  it('eine deaktivierte Person verliert sie', async () => {
    const weg = await konto(BETRIEB, 'Verwaltung', 'kpweg');
    await freigabe(weg, true);
    await admin.from('users').update({ active: false }).eq('id', weg.uid);
    const { error } = await anlegen(weg, 'Nach dem Austritt');
    expect(error).not.toBeNull();
  });
});

describe('Die Freigabe selbst', () => {
  it('gibt sich niemand selbst — nur die Spitze vergibt sie', async () => {
    const selbst = await buchhaltung.client.from('users')
      .update({ kunden_pflegen: true }).eq('id', monteur.uid).select('id');
    expect(selbst.data ?? []).toHaveLength(0);
    const eigen = await monteur.client.from('users')
      .update({ kunden_pflegen: true }).eq('id', monteur.uid).select('id');
    expect(eigen.data ?? []).toHaveLength(0);
    const vonDerChefin = await chefin.client.from('users')
      .update({ kunden_pflegen: false }).eq('id', monteur.uid).select('id');
    expect(vonDerChefin.data).toHaveLength(1);
  });
});

describe('Umbenennen durch das Büro', () => {
  it('nimmt die Baustellen mit, obwohl das Büro sie nicht ändern darf', async () => {
    const { data: k } = await admin.from('customers')
      .insert({ company_id: BETRIEB, name: 'Alt GmbH' }).select('id').single();
    await admin.from('projects').insert({
      company_id: BETRIEB, project_number: 'KP-1', customer_id: k!.id, customer_name: 'Alt GmbH', status: 'Aktiv',
    });
    const { data, error } = await buero.client.rpc('kunde_umbenennen', {
      p_kunde: k!.id, p_name: 'Neu GmbH', p_rest: {},
    });
    expect(error).toBeNull();
    expect(data).toBe(1);
    const { data: p } = await admin.from('projects').select('customer_name').eq('project_number', 'KP-1').single();
    expect(p!.customer_name).toBe('Neu GmbH');
  });

  it('ohne Freigabe bleibt beides, wie es war', async () => {
    await freigabe(buchhaltung, false);
    const { data: k } = await admin.from('customers').select('id').eq('company_id', BETRIEB).eq('name', 'Neu GmbH').single();
    const { error } = await buchhaltung.client.rpc('kunde_umbenennen', {
      p_kunde: k!.id, p_name: 'Heimlich GmbH', p_rest: {},
    });
    expect(error?.code).toBe('42501');
    const { data: p } = await admin.from('projects').select('customer_name').eq('project_number', 'KP-1').single();
    expect(p!.customer_name).toBe('Neu GmbH');
  });

  it('der Nachzieher allein öffnet keine Tür', async () => {
    const { data: k } = await admin.from('customers').select('id').eq('company_id', BETRIEB).eq('name', 'Neu GmbH').single();
    const { error } = await monteur.client.schema('app').rpc('kundenname_nachziehen', {
      p_kunde: k!.id, p_name: 'Vom Monteur',
    });
    expect(error).not.toBeNull();
    const { data: p } = await admin.from('projects').select('customer_name').eq('project_number', 'KP-1').single();
    expect(p!.customer_name).toBe('Neu GmbH');
  });
});
