import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { ToastProvider } from '@/components/Toast';
import type { AppUser } from '@/types';
import { ueberschneidungen } from '@/features/vacations/freistellungUeberschneidung';

/**
 * STUNDENWEISER SONDERURLAUB ÜBER GEARBEITETER ZEIT (Befund 09.11.2026).
 * Die Pflegefreistellung von 12 bis 16 Uhr ging durch, obwohl bis 14 Uhr
 * gearbeitet war — beides zählte. Die Datenbank lehnt das Bestätigen jetzt
 * ab; die Karte nennt die Überschneidung vorher, wie beim Arztbesuch.
 */

describe('ueberschneidungen — dieselbe Auswahl wie die Datenbank', () => {
  const antrag = { id: 'f1', von: '2026-11-12', zeitVon: '12:00', zeitBis: '16:00' };

  it('nennt Arbeit zur selben Uhrzeit, auch die Nachtschicht vom Vortag', () => {
    expect(ueberschneidungen(antrag, [
      { date: '2026-11-12', status: 'Anwesend', startTime: '07:00', endTime: '14:00' },
      { date: '2026-11-11', status: 'Anwesend', startTime: '22:00', endTime: '13:00' },
      { date: '2026-11-12', status: 'Zeitausgleich', startTime: '15:00', endTime: '17:00' },
    ])).toEqual([
      { status: 'Anwesend', von: '07:00', bis: '14:00' },
      { status: 'Zeitausgleich', von: '15:00', bis: '17:00' },
      { status: 'Anwesend', von: '22:00', bis: '13:00' },
    ]);
  });

  it('gleich geblieben: Arbeit daneben, freie Zeit vom Vortag und der eigene Tag zählen nicht', () => {
    expect(ueberschneidungen(antrag, [
      { date: '2026-11-12', status: 'Anwesend', startTime: '07:00', endTime: '12:00' },
      { date: '2026-11-12', status: 'Anwesend', startTime: '16:00', endTime: '18:00' },
      { date: '2026-11-11', status: 'Zeitausgleich', startTime: '22:00', endTime: '23:00' },
      { date: '2026-11-12', status: 'Pflegefreistellung', startTime: '12:00', endTime: '16:00', freistellungId: 'f1' },
      { date: '2026-11-13', status: 'Anwesend', startTime: '12:00', endTime: '16:00' },
    ])).toEqual([]);
  });
});

const offene = [
  {
    id: 'f1', companyId: 'perl', userId: 'm1', userName: 'Max Mustermann', art: 'pflegefreistellung',
    von: '2026-11-12', bis: '2026-11-12', zeitVon: '12:00', zeitBis: '16:00', status: 'Beantragt',
  },
];
let tag: Array<Record<string, unknown>> = [];
vi.mock('@/lib/db/freistellungen', () => ({
  listOffeneFreistellungen: vi.fn(async () => offene),
  listBestaetigteFreistellungenAb: vi.fn(async () => []),
  listFreistellungenVon: vi.fn(async () => offene),
  freistellungEntscheiden: vi.fn(),
  nachweisAdresse: vi.fn(),
  nachweiseAufraeumen: vi.fn(async () => 0),
  arztbesuchVorschlag: vi.fn(),
}));
const monteur: AppUser = {
  id: 'm1', companyId: 'perl', uid: 'm1', name: 'Max Mustermann', email: 'm@perl.at', role: 'Mitarbeiter',
  workDays: [1, 2, 3, 4, 5], weeklyTargetHours: 40,
};
vi.mock('@/lib/db/users', () => ({ listUsers: vi.fn(async () => [monteur]) }));
const eintraegeUmDenTag = vi.fn(async () => tag);
vi.mock('@/lib/db/timeEntries', () => ({ eintraegeUmDenTag: () => eintraegeUmDenTag() }));

const { default: FreistellungenBestaetigen } = await import('@/features/vacations/FreistellungenBestaetigen');
const zeige = () =>
  render(
    <MemoryRouter>
      <ToastProvider>
        <FreistellungenBestaetigen user={{ uid: 'b1', companyId: 'perl', role: 'Buchhaltung' }} company={{ id: 'perl', name: 'Perl' }} />
      </ToastProvider>
    </MemoryRouter>,
  );

beforeEach(() => {
  tag = [];
  eintraegeUmDenTag.mockClear();
});

describe('Die Bestätigungskarte nennt die Überschneidung', () => {
  it('bei der Pflegefreistellung über gearbeiteter Zeit', async () => {
    tag = [{ id: 'e1', date: '2026-11-12', status: 'Anwesend', startTime: '07:00', endTime: '14:00' }];
    zeige();
    expect(await screen.findByText(/Zur selben Zeit gebucht: Arbeitszeit 07:00–14:00/)).toBeInTheDocument();
    expect(screen.getByText(/bestätigen geht erst, wenn die Zeit dort angepasst ist/)).toBeInTheDocument();
  });

  it('Gegenprobe: Arbeit daneben ist kein Hinweis', async () => {
    tag = [{ id: 'e1', date: '2026-11-12', status: 'Anwesend', startTime: '07:00', endTime: '11:30' }];
    zeige();
    expect(await screen.findByText('Max Mustermann · 12.11.2026, 12:00–16:00', { exact: false })).toBeInTheDocument();
    await vi.waitFor(() => expect(eintraegeUmDenTag).toHaveBeenCalled());
    expect(screen.queryByText(/Zur selben Zeit gebucht/)).toBeNull();
  });
});
