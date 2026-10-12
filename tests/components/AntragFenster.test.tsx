import { describe, it, expect, vi } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import type { Freistellung, Vacation } from '@/types';

/**
 * Der Verlauf eines Antrags im Seitenfenster (17 G, 12.10.2026).
 *
 * Wird ein genehmigter Urlaub zurückgenommen, überschrieb die Rücknahme die
 * Entscheidung — der Verlauf zeigte „Beantragt“ und „Storniert“, dass er
 * einmal genehmigt war, nicht mehr. Jetzt hält die Datenbank den Tag der
 * Genehmigung fest (`genehmigt_am`, `bestaetigt_am`), und er bleibt stehen.
 *
 * Gegenprobe: ohne die Änderung in `AntragFenster.tsx` fehlt der Punkt
 * „Genehmigt“ bzw. „Bestätigt“ (rot). Gleich bleibt: ältere Anträge ohne
 * diesen Tag, Ablehnungen und laufende Genehmigungen zeigen genau, was sie
 * vorher zeigten.
 */
vi.mock('@/lib/time', async () => {
  const echt = await vi.importActual<typeof import('@/lib/time')>('@/lib/time');
  return { ...echt, todayStr: () => '2026-10-12' };
});

const { UrlaubsantragFenster, SonderurlaubFenster } = await import('@/features/vacations/AntragFenster');

/** Mittags in Wien — so kippt der Tag in keiner Zeitzone des Tests. */
const tag = (iso: string) => new Date(`${iso}T12:00:00+02:00`).getTime();

const urlaub = (extra: Partial<Vacation> = {}): Vacation => ({
  id: 'u1', companyId: 'perl', userId: 'm1', userName: 'Max Muster',
  von: '2026-11-02', bis: '2026-11-06', tage: 5, status: 'Beantragt',
  createdAt: tag('2026-10-01'),
  ...extra,
});

const sonderurlaub = (extra: Partial<Freistellung> = {}): Freistellung => ({
  id: 'f1', companyId: 'perl', userId: 'm1', userName: 'Max Muster',
  art: 'dienstverhinderung', anlass: 'musterung', ereignisDatum: '2026-11-09',
  von: '2026-11-09', bis: '2026-11-09', status: 'Beantragt',
  createdAt: tag('2026-10-01'),
  ...extra,
});

/** Die Punkte des Verlaufs: Titel und Zeit, so wie sie dastehen. */
function verlauf() {
  const lot = screen.getByRole('list', { name: 'Verlauf des Antrags' });
  return within(lot).getAllByRole('listitem').map((p) => [
    p.querySelector('.lot-titel')?.textContent,
    p.querySelector('.lot-zeit')?.textContent ?? null,
  ]);
}

const urlaubZeigen = (v: Vacation) =>
  render(<UrlaubsantragFenster antrag={v} umfang="5 Urlaubstage" stand="—" onClose={() => undefined} />);
const sonderZeigen = (f: Freistellung) =>
  render(<SonderurlaubFenster antrag={f} stand="—" onClose={() => undefined} />);

describe('Urlaubsantrag: die Genehmigung bleibt nach der Rücknahme', () => {
  it('genehmigt, dann storniert — beide Tage stehen da', () => {
    urlaubZeigen(urlaub({
      status: 'Storniert', genehmigtAm: tag('2026-10-03'), entschiedenAm: tag('2026-10-08'),
      entschiedenVonName: 'Eva Chef', grund: 'Großauftrag',
    }));
    expect(verlauf()).toEqual([
      ['Beantragt', '01.10.2026'],
      ['Genehmigt', '03.10.2026'],
      ['Storniert', '08.10.2026'],
    ]);
    expect(screen.getByText('von Eva Chef — „Großauftrag“')).toBeInTheDocument();
  });

  it('gleich geblieben: ein älterer Antrag ohne Tag der Genehmigung erfindet keinen', () => {
    urlaubZeigen(urlaub({ status: 'Storniert', entschiedenAm: tag('2026-10-08') }));
    expect(verlauf()).toEqual([['Beantragt', '01.10.2026'], ['Storniert', '08.10.2026']]);
  });

  it('gleich geblieben: ein genehmigter Urlaub nennt die Genehmigung einmal', () => {
    urlaubZeigen(urlaub({ status: 'Genehmigt', genehmigtAm: tag('2026-10-03'), entschiedenAm: tag('2026-10-03') }));
    expect(verlauf().map(([t]) => t)).toEqual(['Beantragt', 'Genehmigt', 'Urlaub']);
  });

  it('gleich geblieben: eine Ablehnung bleibt ohne Genehmigung', () => {
    urlaubZeigen(urlaub({ status: 'Abgelehnt', entschiedenAm: tag('2026-10-04') }));
    expect(verlauf()).toEqual([['Beantragt', '01.10.2026'], ['Abgelehnt', '04.10.2026']]);
  });
});

describe('Sonderurlaub: die Bestätigung bleibt nach der Rücknahme', () => {
  it('bestätigt, dann storniert — beide Tage stehen da', () => {
    sonderZeigen(sonderurlaub({ status: 'Storniert', bestaetigtAm: tag('2026-10-02'), entschiedenAm: tag('2026-10-09') }));
    expect(verlauf()).toEqual([
      ['Beantragt', '01.10.2026'],
      ['Bestätigt', '02.10.2026'],
      ['Storniert', '09.10.2026'],
    ]);
  });

  it('gleich geblieben: ohne Tag der Bestätigung nur Antrag und Rücknahme', () => {
    sonderZeigen(sonderurlaub({ status: 'Storniert', entschiedenAm: tag('2026-10-09') }));
    expect(verlauf().map(([t]) => t)).toEqual(['Beantragt', 'Storniert']);
  });
});
