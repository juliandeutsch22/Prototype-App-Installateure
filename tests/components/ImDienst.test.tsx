import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, within, fireEvent } from '@testing-library/react';
import type { AppUser } from '@/types';
import type { Zeitsitzung } from '@/lib/zeitsitzung';

/**
 * F11: „Wer ist heute im Dienst“ — laufende Arbeitstage fürs Büro. Daten
 * (`zeitsitzungen`) und Leserecht gab es, die Ansicht fehlte; das Büro rief an.
 *
 * Gegenprobe: ohne `ImDienst.tsx` gibt es die Karte nicht (rot). Gleich
 * bleibt: ohne Start/Stopp und ohne laufenden Tag steht nichts da.
 */
let sitzungen: Zeitsitzung[] | Error = [];
vi.mock('@/lib/db/zeitsitzungen', () => ({
  laufendeZeitsitzungen: vi.fn(async () => { if (sitzungen instanceof Error) throw sitzungen; return sitzungen; }),
}));
const { default: ImDienst } = await import('@/features/accounting/ImDienst');

const personen = [
  { uid: 'u1', name: 'Max Monteur' }, { uid: 'u2', name: 'Anna Arbeit' }, { uid: 'u3', name: 'Otto Oft' },
] as AppUser[];

const sitzung = (user_id: string, stand: 'laeuft' | 'pause', segmente: Zeitsitzung['segmente']): Zeitsitzung => ({
  id: `s-${user_id}`, company_id: 'perl', user_id, stand, revision: 1, segmente,
  aktualisiert_am: segmente[0].von, erinnert_am: null, abgeschlossen: false,
});

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] });
  // 10:30 in Wien
  vi.setSystemTime(new Date('2026-11-16T10:30:00+01:00'));
});
afterEach(() => vi.useRealTimers());

describe('Heute im Dienst (F11)', () => {
  it('nennt je Person Beginn, Baustelle, Pause und die Arbeitszeit bisher — ein alter Tag fällt auf', async () => {
    sitzungen = [
      sitzung('u1', 'laeuft', [{ id: 'a', art: 'arbeit', von: '2026-11-16T07:00:00+01:00', baustelle: 'PR-14' }]),
      sitzung('u2', 'pause', [
        { id: 'a', art: 'arbeit', von: '2026-11-16T07:30:00+01:00', bis: '2026-11-16T10:00:00+01:00', baustelle: 'PR-7' },
        { id: 'b', art: 'pause', von: '2026-11-16T10:00:00+01:00', baustelle: 'PR-7' },
      ]),
      sitzung('u3', 'laeuft', [{ id: 'a', art: 'arbeit', von: '2026-11-14T15:00:00+01:00', baustelle: '' }]),
    ];
    const person = vi.fn();
    render(<ImDienst companyId="perl" personen={personen} timerAn onPerson={person} />);
    expect(await screen.findByText('Heute im Dienst (3)')).toBeInTheDocument();
    const zeilen = screen.getAllByRole('listitem');
    // Nach Namen geordnet: Anna, Max, Otto.
    expect(zeilen[0]).toHaveTextContent(/Anna Arbeit.*seit 07:30 · PR-7 · Pause seit 10:00.*2:30.*Pause/);
    expect(zeilen[1]).toHaveTextContent(/Max Monteur.*seit 07:00 · PR-14.*3:30.*läuft/);
    expect(zeilen[2]).toHaveTextContent(/Otto Oft.*seit 14\.11\.2026, 15:00 · ohne Baustelle.*„Stopp“ vergessen/);
    fireEvent.click(within(zeilen[1]).getByRole('button', { name: /Max Monteur – Person öffnen/ }));
    expect(person).toHaveBeenCalledWith('u1');
  });

  it('sagt es, wenn niemand im Dienst ist, und wenn das Laden scheitert', async () => {
    sitzungen = [];
    const { unmount } = render(<ImDienst companyId="perl" personen={personen} timerAn onPerson={() => undefined} />);
    expect(await screen.findByText('Gerade läuft bei niemandem ein Arbeitstag.')).toBeInTheDocument();
    unmount();
    sitzungen = new Error('weg');
    render(<ImDienst companyId="perl" personen={personen} timerAn onPerson={() => undefined} />);
    expect(await screen.findByText(/Die Liste „Heute im Dienst“ konnte nicht geladen werden/)).toBeInTheDocument();
  });

  it('bleibt gleich: ohne Start/Stopp und ohne laufenden Tag steht keine Karte da — mit laufendem schon', async () => {
    sitzungen = [];
    const { container, unmount } = render(<ImDienst companyId="perl" personen={personen} timerAn={false} onPerson={() => undefined} />);
    await Promise.resolve();
    expect(container).toBeEmptyDOMElement();
    unmount();
    sitzungen = [sitzung('u1', 'laeuft', [{ id: 'a', art: 'arbeit', von: '2026-11-16T07:00:00+01:00', baustelle: 'PR-14' }])];
    render(<ImDienst companyId="perl" personen={personen} timerAn={false} onPerson={() => undefined} />);
    expect(await screen.findByText('Heute im Dienst (1)')).toBeInTheDocument();
  });
});
