import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { ToastProvider } from '@/components/Toast';
import type { AppUser, TimeEntry } from '@/types';

/**
 * „Weitere Angaben" in der Zeitmaske des Monteurs (Prüflauf 24.09.2026, D8).
 *
 * Vierzehn Felder bei jeder Buchung schoben die eigene Liste am Telefon auf
 * 2 000 px hinunter. Wegzeit, Fahrzeug, Helfername und Zuschläge stehen
 * deshalb hinter einer Zeile — aber nur so, dass nichts unbemerkt fehlt:
 * gesetzte Werte stehen in der Zeile, und wer sie gewohnheitsmässig einträgt,
 * findet sie offen vor.
 */

const createTimeEntryOhneEmpfang = vi.fn<[string, Partial<TimeEntry>], Promise<string>>(
  async () => 'confirmed',
);
vi.mock('@/lib/db/timeEntries', () => ({
  createTimeEntryOhneEmpfang: (firma: string, daten: Partial<TimeEntry>) =>
    createTimeEntryOhneEmpfang(firma, daten),
  updateTimeEntryOhneEmpfang: vi.fn(async () => 'confirmed'),
  eintraegeAmTag: vi.fn(async () => []),
  DuplicateEntryError: class extends Error {},
}));
// Die Baustelle ist Pflicht; hier steht sie als einfaches Feld, damit das
// Formular abschickbar bleibt.
vi.mock('@/components/BaustellenSelect', () => ({
  default: ({ onChange, value }: { onChange: (nr: string) => void; value: string }) => (
    <input aria-label="Baustelle" value={value} onChange={(e) => onChange(e.target.value)} />
  ),
}));

let rolle: AppUser['role'] = 'Mitarbeiter';
/*
  Je Rolle EIN festes Objekt: die Maske lädt die Einträge des Tages neu,
  sobald sich `user` ändert — ein bei jedem Aufruf neues Objekt hiesse
  Neuladen ohne Ende.
*/
const firma = { id: 'perl', name: 'Perl Installationen', praefixKennzeichen: 'WZ' };
const auth = new Map<string, { user: AppUser; company: typeof firma }>();
function authWert() {
  if (!auth.has(rolle)) {
    auth.set(rolle, {
      user: {
        uid: 'u1',
        email: 'max@perl.at',
        name: 'Max Mustermann',
        role: rolle,
        companyId: 'perl',
        docId: 'u1',
      } as unknown as AppUser,
      company: firma,
    });
  }
  return auth.get(rolle)!;
}
vi.mock('@/app/AuthContext', () => ({ useAuth: () => authWert() }));

const { default: TimeForm } = await import('@/features/time/TimeForm');

function zeichne(props: { lastEntry?: TimeEntry; entry?: TimeEntry & { id: string } } = {}) {
  return render(
    <MemoryRouter>
      <ToastProvider>
        <TimeForm onSaved={vi.fn()} {...props} />
      </ToastProvider>
    </MemoryRouter>,
  );
}

const zeile = () => screen.getByRole('button', { name: /Weitere Angaben/ });

beforeEach(() => {
  rolle = 'Mitarbeiter';
  createTimeEntryOhneEmpfang.mockClear();
});

describe('Weitere Angaben', () => {
  it('stehen beim Monteur zugeklappt da und nennen, was darin liegt', () => {
    zeichne();
    expect(zeile()).toHaveAttribute('aria-expanded', 'false');
    expect(zeile()).toHaveTextContent('Wegzeit, Fahrzeug, Helfername, Zuschläge');
    expect(screen.queryByLabelText('Wegzeit (Min.)')).toBeNull();
    // Der Helfer-Haken bleibt draussen: er ändert den Stundensatz.
    expect(screen.getByLabelText(/Einsatz als Helfer/)).toBeInTheDocument();
  });

  it('zeigen gesetzte Werte in der Zeile, auch zugeklappt — und speichern sie', async () => {
    const nutzer = userEvent.setup();
    zeichne();
    await nutzer.type(screen.getByLabelText('Baustelle'), 'B-1');
    await nutzer.click(zeile());
    await nutzer.type(screen.getByLabelText('Fahrzeug (Kennzeichen)'), '123AB');
    await nutzer.click(screen.getByLabelText('Nachtarbeit'));
    await nutzer.click(zeile());

    expect(screen.queryByLabelText('Nachtarbeit')).toBeNull();
    expect(zeile()).toHaveTextContent('Fahrzeug WZ-123AB · Nachtarbeit');

    await nutzer.click(screen.getByRole('button', { name: 'Zeit buchen' }));
    const daten = createTimeEntryOhneEmpfang.mock.calls[0][1];
    expect(daten).toMatchObject({ vehiclePlate: 'WZ-123AB', isNightWork: true, projectNumber: 'B-1' });
  });

  it('starten offen, wenn der letzte Eintrag solche Angaben trug', () => {
    zeichne({
      lastEntry: {
        date: '2026-09-23', status: 'Anwesend', startTime: '07:00', endTime: '15:30',
        vehiclePlate: 'WZ-12345A', userId: 'u1', userName: 'Max Mustermann',
      } as TimeEntry,
    });
    expect(zeile()).toHaveAttribute('aria-expanded', 'true');
    expect(screen.getByLabelText('Wegzeit (Min.)')).toBeInTheDocument();
  });

  it('starten beim Bearbeiten offen, wenn der Eintrag Zuschläge trägt', () => {
    zeichne({
      entry: {
        id: 'e1', date: '2026-09-23', status: 'Anwesend', startTime: '20:00', endTime: '23:00',
        isEmergency: true, projectNumber: 'B-1', userId: 'u1', userName: 'Max Mustermann',
      } as TimeEntry & { id: string },
    });
    expect(zeile()).toHaveAttribute('aria-expanded', 'true');
    expect(screen.getByLabelText('Notdienst / Störungseinsatz')).toBeChecked();
  });

  it('stehen bei der erweiterten Erfassung des Büros ohne weitere Zeile da', async () => {
    // Wer „Erweiterte Erfassung" ankreuzt, will genau diese Felder sehen —
    // ein zweites Aufklappen wäre ein Griff zu viel.
    rolle = 'Geschäftsführung';
    const nutzer = userEvent.setup();
    zeichne();
    await nutzer.click(screen.getByLabelText(/Erweiterte Erfassung/));
    expect(screen.queryByRole('button', { name: /Weitere Angaben/ })).toBeNull();
    expect(screen.getByLabelText('Wegzeit (Min.)')).toBeInTheDocument();
  });
});
