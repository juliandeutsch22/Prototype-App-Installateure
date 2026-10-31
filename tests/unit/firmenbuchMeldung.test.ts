/**
 * Die einmalige Meldung zum zurückgesetzten Firmenbuch-Haken (Runde 7, 6.1)
 * kommt nur bei der Geschäftsführung an — sie pflegt die Firmendaten. Die
 * Buchhaltung lädt dieselben Einstellungen für den Basiszinssatz, bekommt
 * die Meldung aber nicht.
 */
import { describe, it, expect, vi } from 'vitest';
import type { Company } from '@/types';

vi.mock('@/lib/db/basiszins', () => ({ listBasiszinssaetze: vi.fn(async () => []) }));

const { einstellungen } = await import('@/features/dashboard/start/laden');

const kontext = (firmenbuchKorrigiertAm: number | null) => ({
  user: { uid: 'u', companyId: 'perl', role: 'Geschäftsführung' as const },
  company: { id: 'perl', name: 'Perl Installationen GmbH', firmenbuchKorrigiertAm } as unknown as Company,
  heute: '2026-10-31',
});

describe('Startseite: zurückgesetzter Firmenbuch-Haken', () => {
  it('lädt den Zeitpunkt für die Geschäftsführung', async () => {
    const am = Date.parse('2026-10-31T08:00:00Z');
    const d = await einstellungen(kontext(am), { rechnungen: true, konten: false, personen: false, firma: true });
    expect(d.firmenbuchKorrigiertAm).toBe(am);
  });

  it('Gegenprobe: ohne `firma` (Buchhaltung) bleibt die Meldung draußen', async () => {
    const d = await einstellungen(kontext(Date.parse('2026-10-31T08:00:00Z')), { rechnungen: true, konten: false, personen: false });
    expect(d.firmenbuchKorrigiertAm).toBeUndefined();
  });
});
