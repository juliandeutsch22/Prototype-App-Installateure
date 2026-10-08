import { test, expect } from '@playwright/test';
import { admin, BETRIEB, CHEFIN } from './aufbau';
import { anmelden, keineFehlermeldung } from './helfer';

test('Das Original der erzeugten Mahnung steht zusammen mit Angebot und Schein im Archiv', async ({ page }) => {
  const firma = BETRIEB;
  const name = 'Archiv Originalkunde';
  const kunde = await admin.from('customers').insert({ company_id: firma, name,
    kundenart: 'privat', address: 'Ring 1, 1010 Wien', plz: '1010', ort: 'Wien',
  }).select('id').single();
  expect(kunde.error).toBeNull();
  const chef = await admin.from('users').select('id').eq('email', CHEFIN.email).single();
  expect(chef.error).toBeNull();
  const r = await admin.from('invoices').insert({ company_id: firma,
    invoice_number: 'RE-2026-9901', project_number: 'AR-1', customer_id: kunde.data!.id,
    customer_name: name, address: 'Ring 1, 1010 Wien', invoice_date: '2026-01-01',
    due_date: '2026-01-15', total_netto: 100, total_vat: 20, total_brutto: 120,
    vat_rate: 0.2, payment_status: 'Offen',
  }).select('id').single();
  expect(r.error).toBeNull();
  expect((await admin.from('invoice_lines').insert({ company_id: firma, invoice_id: r.data!.id,
    position: 0, label: 'Archivarbeit', qty: 1, unit: 'h', unit_price: 100, netto: 100,
  })).error).toBeNull();
  const q = await admin.from('quotes').insert({ company_id: firma,
    quote_number: 'AN-2026-9901', customer_id: kunde.data!.id, customer_name: name,
    quote_date: '2026-01-01', valid_until: '2026-02-01', status: 'Versendet', vat_rate: 0.2,
  }).select('id').single();
  expect(q.error).toBeNull();
  const schein = crypto.randomUUID();
  expect((await admin.from('work_sheets').insert({ id: schein, company_id: firma,
    project_number: 'AR-1', customer_id: kunde.data!.id, customer_name: name,
    datum: '2026-01-01', status: 'Unterschrieben', abrechnung: 'Regie',
    erstellt_von_uid: chef.data!.id, erstellt_von_name: CHEFIN.name,
  })).error).toBeNull();
  try {
    await anmelden(page, CHEFIN.email);
    await page.goto('/invoices');
    await page.getByRole('button', { name: /^RE-2026-9901 ·/ }).first().click();
    await page.getByRole('button', { name: 'Zahlungserinnerung erzeugen' }).click();
    const mahndownload = page.waitForEvent('download');
    await page.getByRole('button', { name: 'Erzeugen', exact: true }).click();
    const original = Buffer.concat(await (await (await mahndownload).createReadStream()).toArray());
    await expect(async () => {
      const m = await admin.from('mahnbelege').select('pdf_base64').eq('invoice_id', r.data!.id).single();
      expect(m.error).toBeNull();
      expect(Buffer.from(m.data!.pdf_base64, 'base64')).toEqual(original);
    }).toPass();
    await page.goto('/settings/sicherung');
    const zipdownload = page.waitForEvent('download');
    await page.getByRole('button', { name: 'Belegarchiv herunterladen' }).click();
    const zip = Buffer.concat(await (await (await zipdownload).createReadStream()).toArray());
    expect(zip.includes(original)).toBe(true);
    const text = zip.toString('latin1');
    expect(text).toContain('Angebote/Angebot_AN-2026-9901.pdf');
    expect(text).toContain(`Scheine/Handwerksschein_${schein}.pdf`);
    expect(text).toContain('Mahnungen/RE-2026-9901_Stufe-1_');
    await keineFehlermeldung(page);
  } finally {
    for (const [tabelle, id] of [['invoices', r.data!.id], ['quotes', q.data!.id], ['work_sheets', schein], ['customers', kunde.data!.id]]) {
      expect((await admin.from(tabelle).delete().eq('id', id)).error).toBeNull();
    }
  }
});
