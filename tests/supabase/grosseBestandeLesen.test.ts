import { beforeAll, expect, it } from 'vitest';
import { Client } from 'pg';
import { betriebAnlegen, konto, type Konto } from './helfer';

const betrieb = 'bestands-leserechte';
const mengen = { time_entries: 50001, work_sheets: 15001, material_orders: 30001 } as const;
let chef: Konto;
let monteur: Konto;

beforeAll(async () => {
  await betriebAnlegen(betrieb);
  chef = await konto(betrieb, 'Geschäftsführung', 'bestand-chef');
  monteur = await konto(betrieb, 'Mitarbeiter', 'bestand-monteur');
  const db = new Client({ connectionString: 'postgresql://postgres:postgres@127.0.0.1:54322/postgres' });
  await db.connect();
  try {
    await db.query("select set_config('request.jwt.claims', '{\"role\":\"service_role\"}', false)");
    // Importdaten für die Abfrageausführung, keine nachgestellte Lohnabrechnung.
    await db.query(`insert into public.time_entries(id,company_id,user_id,date,status)
      select gen_random_uuid(),$1,$2,'2026-01-01'::date,'Anwesend' from generate_series(1,50001)`, [betrieb, chef.uid]);
    await db.query(`insert into public.work_sheets(id,company_id,project_number,customer_name,datum,
        status,abrechnung,erstellt_von_uid,erstellt_von_name)
      select gen_random_uuid(),$1,'B-1','Testkunde','2026-01-01'::date,'Entwurf','Regie',$2,'Testchef'
        from generate_series(1,15001)`, [betrieb, chef.uid]);
    await db.query(`insert into public.material_orders(id,company_id,material_name,quantity,status,
        transaction_type,user_id,processed)
      select gen_random_uuid(),$1,'Testmaterial',1,'Erledigt','order',$2,true
        from generate_series(1,30001)`, [betrieb, chef.uid]);
  } finally {
    await db.end();
  }
}, 120_000);

for (const [tabelle, anzahl] of Object.entries(mengen)) {
  it(`liest ${anzahl.toLocaleString('de-AT')} ${tabelle} innerhalb des bestehenden SQL-Zeitlimits`, async () => {
    const r = await chef.client.from(tabelle).select('id', { count: 'exact', head: true }).eq('company_id', betrieb);
    expect(r.error).toBeNull();
    expect(r.count).toBe(anzahl);
  });
}

it('gibt dem Monteur weiterhin keine fremden Zeiten oder Anforderungen', async () => {
  for (const tabelle of ['time_entries', 'material_orders']) {
    const r = await monteur.client.from(tabelle).select('id', { count: 'exact', head: true }).eq('company_id', betrieb);
    expect(r.error).toBeNull();
    expect(r.count).toBe(0);
  }
});

it('behält Scheine als Betriebsdaten bei und sperrt alle fremden Betriebszeilen', async () => {
  const eigene = await monteur.client.from('work_sheets').select('id', { count: 'exact', head: true }).eq('company_id', betrieb);
  expect(eigene.error).toBeNull();
  expect(eigene.count).toBe(mengen.work_sheets);
  for (const tabelle of Object.keys(mengen)) {
    const r = await monteur.client.from(tabelle).select('id', { count: 'exact', head: true }).neq('company_id', betrieb);
    expect(r.error).toBeNull();
    expect(r.count).toBe(0);
  }
});
