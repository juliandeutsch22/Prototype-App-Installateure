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

const createTimeEntryOhneEmpfang = vi.fn<(a0: string, a1: Partial<TimeEntry>) => Promise<string>>(
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

/*
  SEIT DER LINIE „LOT“ EIN <details> (Baustein `WeitereAngaben`): die Zeile ist
  dessen <summary>, offen heisst `open`, und zugeklappte Felder stehen zwar im
  Dokument, aber unsichtbar. Was die Tests schützen, bleibt: zugeklappt mit
  Inhaltsangabe, offen, wo schon etwas steht, gespeichert wird alles.
*/
const zeile = () => screen.getByText(/^Weitere Angaben/, { selector: 'summary' });
const offen = () => (zeile().closest('details') as HTMLDetailsElement).open;

beforeEach(() => {
  rolle = 'Mitarbeiter';
  createTimeEntryOhneEmpfang.mockClear();
});

describe('Weitere Angaben', () => {
  it('stehen beim Monteur zugeklappt da und nennen, was darin liegt', () => {
    zeichne();
    expect(offen()).toBe(false);
    expect(zeile()).toHaveTextContent('Wegzeit, Fahrzeug, Helfername, Zuschläge');
    expect(screen.getByLabelText('Wegzeit (Min.)')).not.toBeVisible();
    // Der Helfer-Haken bleibt draussen: er ändert den Stundensatz.
    expect(screen.getByLabelText(/Einsatz als Helfer/)).toBeInTheDocument();
  });

  it('zeigen gesetzte Werte in der Zeile, auch zugeklappt — und speichern sie', async () => {
    const nutzer = userEvent.setup();
    zeichne();
    await nutzer.type(screen.getByLabelText('Baustelle'), 'B-1');
    await nutzer.click(zeile());
    await nutzer.type(screen.getByLabelText('Fahrzeug (Kennzeichen)'), '123AB');
    await nutzer.click(screen.getByLabelText('Notdienst / Störungseinsatz'));
    await nutzer.click(zeile());

    expect(screen.getByLabelText('Fahrzeug (Kennzeichen)')).not.toBeVisible();
    expect(zeile()).toHaveTextContent('Fahrzeug WZ-123AB · Notdienst');

    await nutzer.click(screen.getByRole('button', { name: 'Zeit buchen' }));
    const daten = createTimeEntryOhneEmpfang.mock.calls[0][1];
    // Tagsüber (07:00–16:00) keine Nachtarbeit — sie zählt seit Runde 3, M4 von selbst.
    expect(daten).toMatchObject({ vehiclePlate: 'WZ-123AB', isEmergency: true, isNightWork: false, projectNumber: 'B-1' });
  });

  it('der Notdienst geht nach dem Buchen nicht in die nächste Buchung mit (Testbericht 30.09.2026, G18)', async () => {
    const nutzer = userEvent.setup();
    zeichne();
    await nutzer.type(screen.getByLabelText('Baustelle'), 'B-1');
    await nutzer.click(zeile());
    await nutzer.click(screen.getByLabelText('Notdienst / Störungseinsatz'));
    await nutzer.click(screen.getByRole('button', { name: 'Zeit buchen' }));
    expect(createTimeEntryOhneEmpfang.mock.calls[0][1]).toMatchObject({ isEmergency: true });

    // Die Maske bleibt für die nächste Buchung stehen — ohne den Zuschlag.
    expect(screen.getByLabelText('Notdienst / Störungseinsatz')).not.toBeChecked();
  });

  it('starten offen, wenn der letzte Eintrag solche Angaben trug', () => {
    zeichne({
      lastEntry: {
        date: '2026-09-23', status: 'Anwesend', startTime: '07:00', endTime: '15:30',
        vehiclePlate: 'WZ-12345A', userId: 'u1', userName: 'Max Mustermann',
      } as TimeEntry,
    });
    expect(offen()).toBe(true);
    expect(screen.getByLabelText('Wegzeit (Min.)')).toBeVisible();
  });

  it('starten beim Bearbeiten offen, wenn der Eintrag Zuschläge trägt', () => {
    zeichne({
      entry: {
        id: 'e1', date: '2026-09-23', status: 'Anwesend', startTime: '20:00', endTime: '23:00',
        isEmergency: true, projectNumber: 'B-1', userId: 'u1', userName: 'Max Mustermann',
      } as TimeEntry & { id: string },
    });
    expect(offen()).toBe(true);
    expect(screen.getByLabelText('Notdienst / Störungseinsatz')).toBeChecked();
  });

  it('stehen bei der erweiterten Erfassung des Büros ohne weitere Zeile da', async () => {
    // Wer „Erweiterte Erfassung" ankreuzt, will genau diese Felder sehen —
    // ein zweites Aufklappen wäre ein Griff zu viel.
    rolle = 'Geschäftsführung';
    const nutzer = userEvent.setup();
    zeichne();
    await nutzer.click(screen.getByLabelText(/Erweiterte Erfassung/));
    expect(screen.queryByText(/^Weitere Angaben/, { selector: 'summary' })).toBeNull();
    expect(screen.getByLabelText('Wegzeit (Min.)')).toBeVisible();
  });
});
