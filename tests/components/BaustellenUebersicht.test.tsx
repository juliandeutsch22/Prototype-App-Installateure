import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import type { Project } from '@/types';
import type { BaustellenStunden } from '@/lib/db/timeEntries';

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
 *
 * SEIT RUNDE 5 (M1) KOMMEN SUMMEN, KEINE BUCHUNGEN: die Projektleitung liest
 * die Buchungen anderer nicht. Was zählt (nur „Anwesend“, die ganze Laufzeit,
 * beide Schreibweisen der Nummer) entscheidet `baustellen_stunden` — geprüft
 * in `tests/supabase/baustellenStunden.test.ts`. Hier: was die Akte daraus macht.
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

const summe = (over: Partial<BaustellenStunden>): BaustellenStunden => ({
  projectNumber: 'B-2026-0001',
  userId: 'u1',
  userName: 'Max Mustermann',
  art: 'fach',
  minuten: 480,
  zuletzt: '2026-09-03',
  ...over,
});

let bestand: BaustellenStunden[] = [];
let faellt = false;
const stundenDerBaustellen = vi.fn<(nummern: string[]) => Promise<BaustellenStunden[]>>(async () => {
  if (faellt) throw new Error('Netz weg');
  return bestand;
});
vi.mock('@/lib/db/timeEntries', () => ({
  stundenDerBaustellen: (n: string[]) => stundenDerBaustellen(n),
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
  stundenDerBaustellen.mockClear();
});

describe('Baustellenübersicht', () => {
  it('zeigt die Summe gegen das Budget und fragt nach genau dieser Baustelle', async () => {
    bestand = [summe({ minuten: 960 })];
    zeige();
    expect(await summenzeile()).toContain('16,0 h');
    expect(await summenzeile()).toContain('von 40 h Budget');
    expect(screen.getByText('40 %')).toBeInTheDocument();
    expect(stundenDerBaustellen).toHaveBeenCalledWith(['B-2026-0001']);
  });

  /*
    Helferstunden werden verrechnet, sind für die Kalkulation aber
    kostenneutral. Zählten sie hier mit, käme dieselbe Baustelle an zwei
    Stellen der App auf zwei verschiedene Prozentwerte.
  */
  it('lässt Helferstunden nicht gegen das Budget laufen', async () => {
    bestand = [summe({}), summe({ art: 'helfer' })];
    zeige();
    const zeile = await summenzeile();
    expect(zeile).toContain('8,0 h');
    expect(zeile).toContain('+8,0 h Helfer');
    // 8 von 40, nicht 16 von 40.
    expect(screen.getByText('20 %')).toBeInTheDocument();
  });

  // Entscheidung 03.10.2026 — Lehrlingsstunden ohne Budget als eigene Summe.
  it('führt Lehrlingsstunden ohne Budget eigens an — nicht als Helfer, nicht gegen das Budget', async () => {
    bestand = [summe({}), summe({ userId: 'l1', userName: 'Lena Lehrling', art: 'lehrling' })];
    zeige();
    const zeile = await summenzeile();
    expect(zeile).toContain('+8,0 h Lehrling, nicht im Budget');
    expect(zeile).not.toContain('Helfer');
    expect(screen.getByText('20 %')).toBeInTheDocument();
  });

  it('nennt die Mitarbeiter, größter Beitrag zuerst', async () => {
    bestand = [
      summe({ userId: 'u1', userName: 'Wenig Arbeiter', minuten: 120 }),
      summe({ userId: 'u2', userName: 'Viel Arbeiter' }),
    ];
    zeige();
    await screen.findByText('Viel Arbeiter');
    const namen = screen
      .getAllByText(/Arbeiter$/)
      .map((el) => el.textContent);
    expect(namen).toEqual(['Viel Arbeiter', 'Wenig Arbeiter']);
  });

  it('sagt ohne Budget, dass es keinen Stand gibt — statt einen zu erfinden', async () => {
    bestand = [summe({})];
    zeige(projekt({ estimatedHours: undefined }));
    expect(await screen.findByText(/Kein Stundenbudget hinterlegt/)).toBeInTheDocument();
    expect(screen.queryByText(/%$/)).not.toBeInTheDocument();
  });

  it('unterscheidet „noch keine Stunde“ von einem Fehler', async () => {
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
    // Der jüngste Tag über alle Personen und Arten.
    bestand = [
      summe({ zuletzt: '2026-06-02' }),
      summe({ userId: 'u2', art: 'helfer', zuletzt: '2026-09-03' }),
    ];
    zeige();
    expect(await screen.findByText('Zuletzt gebucht am 03.09.2026.')).toBeInTheDocument();
  });

  it('fasst eine Person mit zwei Arten in einer Zeile zusammen', async () => {
    // Derselbe Monteur einmal als Fach-, einmal als Helferzeit gebucht.
    bestand = [summe({}), summe({ art: 'helfer', minuten: 120 })];
    zeige();
    await screen.findByText('Max Mustermann');
    expect(screen.getAllByText('Max Mustermann')).toHaveLength(1);
  });
});

/*
  LINIE „LOT“: über dem Budget ist ein Fehler und steht in Rot. Bis zum Umbau
  stand es in der Hausfarbe — meist dasselbe Petrol wie „im Rahmen“.
*/
describe('Die Farbe des Budgetstands', () => {
  it('steht über dem Budget in Rot', async () => {
    // 2 × 8 h auf 10 h Budget: 160 %.
    bestand = [summe({ minuten: 960 })];
    zeige(projekt({ estimatedHours: 10 }));
    const zahl = await screen.findByText('160 %');
    expect(zahl).toHaveClass('text-danger');
    expect(zahl.previousElementSibling?.firstElementChild).toHaveClass('bg-danger');
  });

  it('Gegenprobe: im Rahmen weder Rot noch Hausfarbe', async () => {
    bestand = [summe({})];
    zeige();
    const zahl = await screen.findByText('20 %');
    expect(zahl).not.toHaveClass('text-danger');
    expect(zahl.previousElementSibling?.firstElementChild).toHaveClass('bg-success');
    expect(zahl.previousElementSibling?.firstElementChild).not.toHaveClass('bg-accent');
  });
});
