import { beforeEach, expect, it, vi } from 'vitest';
import { RechnungsAntwortUnklar } from '@/lib/rechnungsAntwort';
const rpc = vi.hoisted(() => vi.fn());
vi.mock('@/lib/db/pg/kern', () => ({
  derClient: () => ({ rpc }), abfragen: vi.fn(), aendern: vi.fn(), kanalHalten: vi.fn(), NACHFASSEN_MS: 1000,
}));
import { rechnungAusstellen } from '@/lib/db/pg/invoices';
const inv: Parameters<typeof rechnungAusstellen>[1] = {
  projectNumber: 'PR-2026-1', customerName: 'Testkunde', positions: [],
  invoiceDate: '2026-10-28', dueDate: '2026-11-11',
  totalNetto: 100, totalVat: 20, totalBrutto: 120, vatRate: 20, paymentStatus: 'Offen',
};
beforeEach(() => rpc.mockReset());
it('nur eine bestätigte ID und Nummer gelten als Erfolg', async () => {
  rpc.mockResolvedValueOnce({ data: { id: 'beleg-id', invoice_number: 'RE-2026-0001' }, error: null });
  await expect(rechnungAusstellen('firma', inv, {})).resolves.toEqual({ id: 'beleg-id', invoiceNumber: 'RE-2026-0001' });
  rpc.mockResolvedValueOnce({ data: null, error: null });
  await expect(rechnungAusstellen('firma', inv, {})).rejects.toBeInstanceOf(RechnungsAntwortUnklar);
  rpc.mockResolvedValueOnce({ data: { id: '', invoice_number: '' }, error: null });
  await expect(rechnungAusstellen('firma', inv, {})).rejects.toBeInstanceOf(RechnungsAntwortUnklar);
});
it('SQL-Ablehnung bleibt eine konkrete Ablehnung ohne Erfolgsmeldung', async () => {
  rpc.mockResolvedValueOnce({ data: null, error: { code: '23505', message: 'Nummer schon vergeben' } });
  await expect(rechnungAusstellen('firma', inv, {})).rejects.toThrow('Nummer schon vergeben');
});
it('eindeutige Authentifizierungsablehnung wird nicht als verlorene Erstellungsantwort dargestellt', async () => {
  rpc.mockResolvedValueOnce({ data: null, error: { code: 'PGRST301', message: 'JWT expired' } });
  await expect(rechnungAusstellen('firma', inv, {})).rejects.toThrow('JWT expired');
});
it('Transportabbruch und unbestimmte Gateway-Antwort sind kein Rollback-Beweis', async () => {
  rpc.mockRejectedValueOnce(new TypeError('Failed to fetch'));
  await expect(rechnungAusstellen('firma', inv, {})).rejects.toBeInstanceOf(RechnungsAntwortUnklar);
  rpc.mockResolvedValueOnce({ data: null, error: { code: '', message: 'Failed to fetch' } });
  await expect(rechnungAusstellen('firma', inv, {})).rejects.toBeInstanceOf(RechnungsAntwortUnklar);
  expect(rpc).toHaveBeenCalledTimes(2);
});
it('Datum und Jahr bestimmt die Datenbank: kein Gerätejahr im Aufruf, ein anderes Datum nur ausdrücklich (G5)', async () => {
  rpc.mockResolvedValue({ data: { id: 'beleg-id', invoice_number: 'RE-2026-1001', invoice_date: '2026-10-28' }, error: null });
  await expect(rechnungAusstellen('firma', inv, {})).resolves.toEqual({
    id: 'beleg-id', invoiceNumber: 'RE-2026-1001', invoiceDate: '2026-10-28',
  });
  const [, args] = rpc.mock.calls[0];
  expect(args).not.toHaveProperty('p_jahr');
  expect(args).not.toHaveProperty('p_datum_ausdruecklich');
  await rechnungAusstellen('firma', inv, { datumAusdruecklich: true });
  expect(rpc.mock.calls[1][1]).toMatchObject({ p_datum_ausdruecklich: true });
});
it('Klärung eines Versuchs: Antwort der Datenbank, Netzabbruch bleibt unklar (G2)', async () => {
  const { rechnungVersuchKlaeren } = await import('@/lib/db/pg/invoices');
  rpc.mockResolvedValueOnce({ data: { entstanden: true, id: 'r1', invoice_number: 'RE-2026-1001', invoice_date: '2026-11-15' }, error: null });
  await expect(rechnungVersuchKlaeren('v1')).resolves.toEqual({
    entstanden: true, id: 'r1', invoiceNumber: 'RE-2026-1001', invoiceDate: '2026-11-15',
  });
  expect(rpc).toHaveBeenLastCalledWith('rechnung_versuch_klaeren', { p_versuch: 'v1' });
  rpc.mockResolvedValueOnce({ data: { entstanden: false }, error: null });
  await expect(rechnungVersuchKlaeren('v2')).resolves.toEqual({ entstanden: false });
  rpc.mockRejectedValueOnce(new TypeError('Failed to fetch'));
  await expect(rechnungVersuchKlaeren('v3')).rejects.toBeInstanceOf(RechnungsAntwortUnklar);
  rpc.mockResolvedValueOnce({ data: null, error: null });
  await expect(rechnungVersuchKlaeren('v4')).rejects.toBeInstanceOf(RechnungsAntwortUnklar);
  rpc.mockResolvedValueOnce({ data: null, error: { code: '42501', message: 'Klären darf, wer Rechnungen ausstellt.' } });
  await expect(rechnungVersuchKlaeren('v5')).rejects.toThrow('Klären darf');
});
it('Ausstellen schickt die Kennung des Versuchs mit und meldet eine schon angelegte Rechnung (G2)', async () => {
  rpc.mockResolvedValueOnce({ data: { id: 'r1', invoice_number: 'RE-2026-1001', invoice_date: '2026-11-15', bereits: true }, error: null });
  await expect(rechnungAusstellen('firma', inv, { versuch: 'v1' })).resolves.toMatchObject({ id: 'r1', bereits: true });
  expect(rpc.mock.calls[0][1]).toMatchObject({ p_versuch: 'v1' });
});
