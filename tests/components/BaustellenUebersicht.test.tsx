import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import type { Project, TimeEntry } from '@/types';

/**
 * Die Übersicht einer einzelnen Baustelle.
 *
 * SIE BEANTWORTET EINE ANDERE FRAGE als die Projektauswertung unter der
 * Mitarbeiterübersicht. Dort steht ein Monat über alle Baustellen; hier steht
 * EINE Baustelle über ihre ganze Laufzeit. Der Unterschied ist keine
 * Feinheit: genau daran ist die Projektauswertung schon einmal
 * auseinandergelaufen — sie verglich Monatsstunden mit einem Budget, das für
 * den ganzen Auftrag kalkuliert war, und meldete eine ausgereizte Baustelle
 * als halb offen.
 */

const projekt = (over: Partial<Project> = {}): Project =>
  ({
    companyId: 'perl',
    projectNumber: 'B-2026-0001',
    customerName: 'Max Musterkunde',
    status: 'Aktiv',
    estimatedHours: 40,
    ...over,
  }) as Project;

const eintrag = (over: Partial<TimeEntry>): TimeEntry =>
  ({
    companyId: 'perl',
    date: '2026-09-03',
    status: 'Anwesend',
    startTime: '07:00',
    endTime: '15:00',
    breakDuration: 0,
    userId: 'u1',
    userName: 'Max Mustermann',
    projectNumber: 'B-2026-0001',
    ...over,
  }) as TimeEntry;

let bestand: TimeEntry[] = [];
let faellt = false;
const listEntriesForProjects = vi.fn(async () => {
  if (faellt) throw new Error('Netz weg');
  return bestand;
});
vi.mock('@/lib/db/timeEntries', () => ({
  listEntriesForProjects: () => listEntriesForProjects(),
}));

const { default: BaustellenUebersicht } = await import(
  '@/features/projects/BaustellenUebersicht'
);

const zeige = (p: Project = projekt()) =>
  render(<BaustellenUebersicht companyId="perl" projekt={p} />);

/**
 * Die Summenzeile als Ganzes.
 *
 * Auf einer Ein-Personen-Baustelle steht dieselbe Stundenzahl zweimal auf dem
 * Schirm — einmal als Summe, einmal beim Mitarbeiter. Ein Test, der nur nach
 * „16,0 h" sucht, findet beide und sagt nicht, welche er meint.
 */
async function summenzeile() {
  const marke = await screen.findByText('Fachzeit');
  const p = marke.closest('p');
  if (!p) throw new Error('Summenzeile nicht gefunden');
  return p.textContent ?? '';
}

beforeEach(() => {
  bestand = [];
  faellt = false;
  listEntriesForProjects.mockClear();
});

describe('Baustellenübersicht', () => {
  it('rechnet über die ganze Laufzeit, nicht über einen Monat', async () => {
    // Acht Stunden im Juni, acht im September: zusammen 16, nicht 8.
    bestand = [
      eintrag({ id: 'a', date: '2026-06-02' }),
      eintrag({ id: 'b', date: '2026-09-03' }),
    ];
    zeige();
    expect(await summenzeile()).toContain('16,0 h');
    expect(await summenzeile()).toContain('von 40 h Budget');
    expect(screen.getByText('40 %')).toBeInTheDocument();
  });

  /*
    Helferstunden werden verrechnet, sind für die Kalkulation aber
    kostenneutral. Zählten sie hier mit, käme dieselbe Baustelle an zwei
    Stellen der App auf zwei verschiedene Prozentwerte.
  */
  it('lässt Helferstunden nicht gegen das Budget laufen', async () => {
    bestand = [
      eintrag({ id: 'a' }),
      eintrag({ id: 'b', isHelper: true } as Partial<TimeEntry>),
    ];
    zeige();
    const zeile = await summenzeile();
    expect(zeile).toContain('8,0 h');
    expect(zeile).toContain('+8,0 h Helfer');
    // 8 von 40, nicht 16 von 40.
    expect(screen.getByText('20 %')).toBeInTheDocument();
  });

  it('nennt die Mitarbeiter, größter Beitrag zuerst', async () => {
    bestand = [
      eintrag({ id: 'a', userId: 'u1', userName: 'Wenig Arbeiter', endTime: '09:00' }),
      eintrag({ id: 'b', userId: 'u2', userName: 'Viel Arbeiter' }),
    ];
    zeige();
    await screen.findByText('Viel Arbeiter');
    const namen = screen
      .getAllByText(/Arbeiter$/)
      .map((el) => el.textContent);
    expect(namen).toEqual(['Viel Arbeiter', 'Wenig Arbeiter']);
  });

  it('sagt ohne Budget, dass es keinen Stand gibt — statt einen zu erfinden', async () => {
    bestand = [eintrag({ id: 'a' })];
    zeige(projekt({ estimatedHours: undefined }));
    expect(await screen.findByText(/Kein Stundenbudget hinterlegt/)).toBeInTheDocument();
    expect(screen.queryByText(/%$/)).not.toBeInTheDocument();
  });

  it('unterscheidet „noch keine Stunde" von einem Fehler', async () => {
    zeige();
    expect(
      await screen.findByText('Auf diese Baustelle ist noch keine Stunde gebucht.'),
    ).toBeInTheDocument();
  });

  it('meldet einen Ladefehler, statt eine leere Baustelle zu behaupten', async () => {
    /*
      DER TEURE FALL. „Keine Stunden geladen" und „keine Stunden gebucht"
      sehen im Code gleich aus und heissen das Gegenteil: das eine ist eine
      Störung, das andere eine Aussage über die Baustelle. Wer die Störung
      als Aussage liest, hält eine volle Baustelle für unberührt.
    */
    faellt = true;
    zeige();
    expect(await screen.findByText(/konnte nicht geladen werden|nicht geladen/i)).toBeInTheDocument();
    expect(
      screen.queryByText('Auf diese Baustelle ist noch keine Stunde gebucht.'),
    ).not.toBeInTheDocument();
  });

  it('zeigt, wann zuletzt gebucht wurde', async () => {
    bestand = [
      eintrag({ id: 'a', date: '2026-06-02' }),
      eintrag({ id: 'b', date: '2026-09-03' }),
    ];
    zeige();
    expect(await screen.findByText('Zuletzt gebucht am 3.9.2026.')).toBeInTheDocument();
  });

  it('zählt abwesende Tage nicht mit', async () => {
    // Ein Urlaubstag trägt eine Baustellennummer, aber keine Arbeitszeit.
    bestand = [
      eintrag({ id: 'a' }),
      eintrag({ id: 'b', status: 'Urlaub' } as Partial<TimeEntry>),
    ];
    zeige();
    expect(await summenzeile()).toContain('8,0 h');
  });
});
