import { describe, it, expect, vi } from 'vitest';
import { AUSSTELLER_FELDER, mitAussteller } from '@/lib/aussteller';
import type { Company } from '@/types';

/**
 * Die Firmendaten eines Belegs zum Zeitpunkt seiner Ausstellung (A1,
 * 24.10.2026): der Stand legt sich über die heutigen Firmendaten — ganz,
 * auch mit seinen Lücken.
 */
const staende = vi.fn();
vi.mock('@/lib/db/pg/aussteller', () => ({ ausstellerStaende: (...a: unknown[]) => staende(...a) }));
const { belegFirma } = await import('@/lib/db/aussteller');

const heute = {
  id: 'perl', name: 'Perl Installationen GmbH', addressLine: 'Neugasse 9 · 2700 Wiener Neustadt',
  strasse: 'Neugasse 9', plz: '2700', ort: 'Wiener Neustadt', iban: 'AT483200000012345864', bic: 'RLNWATWW',
  bankName: 'Neue Bank', vatId: 'ATU12345678', logoUrl: 'data:image/png;base64,NEU', brandColor: '#123456',
  rates: { stufen: {} },
} as unknown as Company;

describe('mitAussteller', () => {
  it('legt die Angaben des Belegs über die heutigen — Bank und Anschrift von damals', () => {
    const f = mitAussteller(heute, {
      name: 'Perl Installationen GmbH', addressLine: 'Hauptplatz 1 · 2700 Wiener Neustadt', strasse: 'Hauptplatz 1',
      plz: '2700', ort: 'Wiener Neustadt', iban: 'AT611904300234573201', bic: 'BKAUATWW', bankName: 'Alte Bank',
      vatId: 'ATU12345678', logoUrl: 'data:image/png;base64,ALT',
    });
    expect(f).toMatchObject({ iban: 'AT611904300234573201', bankName: 'Alte Bank', strasse: 'Hauptplatz 1', logoUrl: 'data:image/png;base64,ALT' });
    // Was nicht als Absender auf dem Beleg steht, kommt von heute.
    expect(f.brandColor).toBe('#123456');
    expect(f.rates).toBe(heute.rates);
  });

  it('eine Lücke von damals bleibt eine Lücke — keine Bank, die erst später kam', () => {
    const f = mitAussteller(heute, { name: 'Perl Installationen GmbH', iban: null, bic: null, bankName: null, logoUrl: null });
    expect(f.iban).toBeUndefined();
    expect(f.bankName).toBeUndefined();
    expect(f.logoUrl).toBeUndefined();
  });

  it('bleibt gleich: ohne Stand die heutigen Daten, unverändert', () => {
    expect(mitAussteller(heute, undefined)).toBe(heute);
    expect(mitAussteller(heute, null)).toBe(heute);
  });

  it('kennt genau die Felder, die die Datenbank festhält', () => {
    expect([...AUSSTELLER_FELDER].sort()).toEqual([
      'addressLine', 'bankName', 'bic', 'companyRegister', 'contactLine', 'firmenbuchgericht', 'iban', 'land',
      'logoUrl', 'name', 'ort', 'plz', 'strasse', 'vatId',
    ]);
  });
});

describe('belegFirma', () => {
  it('ohne Stand ohne Abfrage', async () => {
    staende.mockClear();
    expect(await belegFirma(heute, undefined)).toBe(heute);
    expect(staende).not.toHaveBeenCalled();
  });

  it('mit Stand die Daten von damals; fehlt er, ein Fehler statt eines falschen Belegs', async () => {
    staende.mockResolvedValueOnce(new Map([['st-1', { name: 'Perl Installationen GmbH', bankName: 'Alte Bank' }]]));
    expect((await belegFirma(heute, 'st-1')).bankName).toBe('Alte Bank');
    staende.mockResolvedValueOnce(new Map());
    await expect(belegFirma(heute, 'st-2')).rejects.toThrow(/Firmendaten/);
  });
});
