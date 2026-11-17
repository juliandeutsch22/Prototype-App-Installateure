import { test, expect } from '@playwright/test';
import { admin, BAUSTELLE, BETRIEB, CHEFIN } from './aufbau';
import { anmelden, keineFehlermeldung } from './helfer';

/*
  DER LEERE SATZ UNTER DER LISTENLEISTE (E95, 17.11.2026, mit Bild vom
  Auftraggeber): „In den nächsten 30 Tagen steht keine Wartung an.“ klebte
  am linken Rand des Blatts. Der Leerzustand steht dort in einem Rahmen mit
  Trennlinie zur Leiste und fiel deshalb durch die Regel, die bündigen Karten
  ihren Rand gibt. Gemessen wird der erste Buchstabe gegen die Kante des
  Blatts: mindestens der Rand des Blatts (16 px am Handy, 24 px ab Tablet),
  wie die Suche in der Leiste darüber.

  Gegenprobe: ohne die zweite Zeile der Regel in src/index.css steht der
  Satz 0 px vom Rand (rot).
*/
test('Wartungen: der Satz „steht keine Wartung an“ steht auf dem Rand des Blatts', async ({ page }) => {
  const { data: kunde } = await admin.from('customers').select('id').eq('company_id', BETRIEB).eq('name', BAUSTELLE.kunde).single();
  const inEinemJahr = new Date(Date.now() + 365 * 86_400_000).toISOString().slice(0, 10);
  const { data: w, error } = await admin.from('wartungen').insert({
    company_id: BETRIEB, customer_id: kunde!.id, customer_name: BAUSTELLE.kunde,
    anlage: 'Prüfung Leerzustand', intervall_monate: 12, faellig_am: inEinemJahr,
  }).select('id').single();
  if (error) throw new Error(error.message);
  try {
    await anmelden(page, CHEFIN.email);
    // Am Handy (16 px Rand) und am Schreibtisch (24 px) — beide Breiten in einem Weg.
    for (const breite of [390, 1440]) {
      await page.setViewportSize({ width: breite, height: 900 });
      await page.goto('/wartungen');
      const satz = page.getByText('In den nächsten 30 Tagen steht keine Wartung an.', { exact: true });
      await expect(satz).toBeVisible({ timeout: 15_000 });
      const m = await satz.evaluate((el) => {
        const karte = el.closest('.karte')!.getBoundingClientRect();
        const r = document.createRange();
        r.selectNodeContents(el.firstChild!);
        const rand = parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--blatt-rand'));
        return { abstand: r.getClientRects()[0].left - karte.left, rand };
      });
      expect(m.rand, `${breite} px`).toBe(breite < 760 ? 16 : 24);
      expect(m.abstand, `${breite} px`).toBeGreaterThanOrEqual(m.rand - 1);
    }
    await keineFehlermeldung(page);
  } finally {
    await admin.from('wartungen').delete().eq('id', w!.id);
  }
});
