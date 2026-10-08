import { test, expect } from '@playwright/test';
import { admin, BETRIEB, CHEFIN } from './aufbau';
import { anmelden, keineFehlermeldung } from './helfer';

const pruefangebote: { id: string; nummer: string }[] = [];
test.afterEach(async () => {
  for (const q of pruefangebote.splice(0)) {
    const { error: angebotFehler } = await admin.from('quotes').delete().eq('company_id', BETRIEB).eq('id', q.id);
    if (angebotFehler) throw angebotFehler;
    const { error: baustelleFehler } = await admin.from('projects').delete().eq('company_id', BETRIEB)
      .eq('description', `Heizung tauschen\n\nAus Angebot ${q.nummer}`);
    if (baustelleFehler) throw baustelleFehler;
  }
});

// Beide Ansichten müssen denselben atomaren Ablauf erreichen. Zwei bereits
// geladene Seiten stellen auch den alten Browserstand nach einer Annahme nach.
for (const weg of ['Liste', 'Angebotsseite'] as const) {
  test(`${weg}: zwei geladene Seiten nehmen dasselbe Angebot genau einmal an`, async ({ page, context }) => {
    const nummer = `AN-PRUEF-${crypto.randomUUID().slice(0, 8)}`;
    const { data: q, error } = await admin.from('quotes').insert({
      company_id: BETRIEB, quote_number: nummer, customer_name: 'Annahmeprüfung',
      address: 'Hauptplatz 1, 8200 Gleisdorf', quote_date: '2026-10-08', valid_until: '2099-12-31',
      status: 'Versendet', subtotal_netto: 100, total_netto: 100, total_vat: 20,
      total_brutto: 120, vat_rate: 0.2, kalkulierte_stunden: 12, notes: 'Heizung tauschen',
    }).select('id').single();
    if (error) throw error;
    pruefangebote.push({ id: q!.id, nummer });
    await anmelden(page, CHEFIN.email);
    const zweite = await context.newPage();
    const adresse = weg === 'Liste' ? '/quotes' : `/quotes/${q!.id}`;
    await Promise.all([page.goto(adresse), zweite.goto(adresse)]);
    const seiten = [page, zweite];
    for (const p of seiten) {
      if (weg === 'Liste') await expect(p.getByText(nummer, { exact: true }).first()).toBeVisible();
      else await expect(p.getByRole('heading', { name: `Angebot ${nummer}`, exact: true })).toBeVisible();
      const zeile = weg === 'Liste' ? p.getByRole('listitem').filter({ hasText: nummer }) : p.locator('main');
      await zeile.getByRole('button', { name: 'Annehmen → Baustelle' }).click();
      await expect(p.getByRole('dialog')).toBeVisible();
    }
    await Promise.all(seiten.map((p) => p.getByRole('dialog').getByRole('button', { name: 'Annehmen', exact: true }).click()));
    for (const p of seiten) {
      await expect(p.getByText(/^Baustelle .* angelegt$/)).toBeVisible();
      await keineFehlermeldung(p);
    }
    const { data: aktuell } = await admin.from('quotes').select('status, project_id, project_number').eq('id', q!.id).single();
    expect(aktuell?.status).toBe('Angenommen');
    const { data: baustellen } = await admin.from('projects').select('*').eq('company_id', BETRIEB)
      .eq('description', `Heizung tauschen\n\nAus Angebot ${nummer}`);
    expect(baustellen).toHaveLength(1);
    expect(baustellen![0].id).toBe(aktuell?.project_id);
    expect(baustellen![0].project_number).toBe(aktuell?.project_number);
    expect(Number(baustellen![0].estimated_hours)).toBe(12);
    await zweite.close();
  });
}
