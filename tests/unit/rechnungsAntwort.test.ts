import { beforeEach, expect, it, vi } from 'vitest';
import { RechnungsAntwortUnklar } from '@/lib/rechnungsAntwort';
const rpc = vi.hoisted(() => vi.fn());
vi.mock('@/lib/db/pg/kern', () => ({
  derClient: () => ({ rpc }), abfragen: vi.fn(), aendern: vi.fn(), kanalHalten: vi.fn(), NACHFASSEN_MS: 1000,
}));
import { rechnungAusstellen } from '@/lib/db/pg/invoices';
const inv = { projectNumber: 'PR-2026-1', positions: [] } as Parameters<typeof rechnungAusstellen>[1];
beforeEach(() => rpc.mockReset());
it('nur eine bestätigte ID und Nummer gelten als Erfolg', async () => {
  rpc.mockResolvedValueOnce({ data: { id: 'beleg-id', invoice_number: 'RE-2026-0001' }, error: null });
  await expect(rechnungAusstellen('firma', inv, {})).resolves.toEqual({ id: 'beleg-id', invoiceNumber: 'RE-2026-0001' });
  rpc.mockResolvedValueOnce({ data: null, error: null });
  await expect(rechnungAusstellen('firma', inv, {})).rejects.toBeInstanceOf(RechnungsAntwortUnklar);
});
it('SQL-Ablehnung bleibt eine konkrete Ablehnung ohne Erfolgsmeldung', async () => {
  rpc.mockResolvedValueOnce({ data: null, error: { code: '23505', message: 'Nummer schon vergeben' } });
  await expect(rechnungAusstellen('firma', inv, {})).rejects.toThrow('Nummer schon vergeben');
});
it('Transportabbruch und unbestimmte Gateway-Antwort sind kein Rollback-Beweis', async () => {
  rpc.mockRejectedValueOnce(new TypeError('Failed to fetch'));
  await expect(rechnungAusstellen('firma', inv, {})).rejects.toBeInstanceOf(RechnungsAntwortUnklar);
  rpc.mockResolvedValueOnce({ data: null, error: { code: '', message: 'Failed to fetch' } });
  await expect(rechnungAusstellen('firma', inv, {})).rejects.toBeInstanceOf(RechnungsAntwortUnklar);
  expect(rpc).toHaveBeenCalledTimes(2);
});
