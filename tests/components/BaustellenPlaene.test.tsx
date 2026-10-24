import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ToastProvider } from '@/components/Toast';

/**
 * Pläne hochladen — und die Rückfrage vor einem Beleg aus dem Büro.
 *
 * Im Launch-Check (25.09.2026, R1) lag ein Stundennachweis bei den Plänen,
 * sichtbar für jeden Monteur der Baustelle. Seit 11.10.2026 (17 D) lässt
 * sich ein Dokument „nur fürs Büro“ ablegen; in der Rückfrage ist das vorab
 * angekreuzt.
 */
const dokumentHochladen = vi.fn<(...a: unknown[]) => Promise<undefined>>(async () => undefined);
const dokumentNurBueroSetzen = vi.fn<(...a: unknown[]) => Promise<undefined>>(async () => undefined);
let vorhanden: unknown[] = [];
vi.mock('@/lib/db/baustellenDokumente', () => ({
  dokumentHochladen: (...a: unknown[]) => dokumentHochladen(...a),
  dokumentNurBueroSetzen: (...a: unknown[]) => dokumentNurBueroSetzen(...a),
  dokumentLoeschen: vi.fn(),
  dateiPruefen: () => null,
  listDokumente: vi.fn(async () => vorhanden),
  dokumentAdresse: vi.fn(async () => 'https://speicher/x'),
  dokumentBild: vi.fn(async () => new Blob(['x'])),
}));

const { default: BaustellenPlaene } = await import('@/features/projects/BaustellenPlaene');

function zeichne() {
  return render(
    <ToastProvider>
      <BaustellenPlaene companyId="perl" projectId="p1" darfAendern meinName="Chefin" />
    </ToastProvider>,
  );
}

const datei = (name: string) => new File(['%PDF'], name, { type: 'application/pdf' });

beforeEach(() => {
  dokumentHochladen.mockClear();
  dokumentNurBueroSetzen.mockClear();
  vorhanden = [];
});

/** Das letzte Argument von `dokumentHochladen`: nur fürs Büro? */
const nurBueroBeimHochladen = () => dokumentHochladen.mock.calls.map((c) => c[4]);

describe('Pläne hochladen', () => {
  it('sagt neben dem Knopf, wer alles sieht', async () => {
    zeichne();
    expect(await screen.findByText('Die Monteure dieser Baustelle sehen alles ohne „Nur Büro“.')).toBeInTheDocument();
  });

  it('lädt einen Plan ohne Rückfrage hoch', async () => {
    const nutzer = userEvent.setup();
    zeichne();
    await nutzer.upload(screen.getByLabelText('Dokumente auswählen'), datei('Grundriss EG.pdf'));
    await vi.waitFor(() => expect(dokumentHochladen).toHaveBeenCalledTimes(1));
    expect(screen.queryByText('Wirklich zu den Plänen?')).not.toBeInTheDocument();
    // Ohne Häkchen wie bisher: für die Monteure sichtbar.
    expect(nurBueroBeimHochladen()).toEqual([false]);
  });

  it('fragt vor einem Stundennachweis nach — und lädt erst nach dem Ja', async () => {
    const nutzer = userEvent.setup();
    zeichne();
    await nutzer.upload(
      screen.getByLabelText('Dokumente auswählen'),
      datei('Stundennachweis September.pdf'),
    );
    expect(await screen.findByText('Wirklich zu den Plänen?')).toBeInTheDocument();
    expect(dokumentHochladen).not.toHaveBeenCalled();

    // Vorab angekreuzt: wer weiterklickt, legt den Beleg nur fürs Büro ab.
    expect(screen.getByLabelText('Nur fürs Büro', { selector: '#plaene-rueckfrage-nur-buero' })).toBeChecked();
    await nutzer.click(screen.getByRole('button', { name: 'Hinzufügen' }));
    await vi.waitFor(() => expect(dokumentHochladen).toHaveBeenCalledTimes(1));
    expect(nurBueroBeimHochladen()).toEqual([true]);
  });

  it('wer es den Monteuren zeigen will, nimmt das Häkchen in der Rückfrage weg', async () => {
    const nutzer = userEvent.setup();
    zeichne();
    await nutzer.upload(screen.getByLabelText('Dokumente auswählen'), datei('Stundennachweis September.pdf'));
    await nutzer.click(await screen.findByLabelText('Nur fürs Büro', { selector: '#plaene-rueckfrage-nur-buero' }));
    await nutzer.click(screen.getByRole('button', { name: 'Hinzufügen' }));
    await vi.waitFor(() => expect(nurBueroBeimHochladen()).toEqual([false]));
  });

  it('mit „Nur fürs Büro“ angekreuzt: ohne Rückfrage, nur fürs Büro', async () => {
    const nutzer = userEvent.setup();
    zeichne();
    await nutzer.click(screen.getByLabelText('Nur fürs Büro', { selector: '#plaene-nur-buero' }));
    expect(screen.getByText('Was jetzt dazukommt, sehen die Monteure nicht.')).toBeInTheDocument();
    await nutzer.upload(screen.getByLabelText('Dokumente auswählen'), datei('Rechnung Lieferant.pdf'));
    await vi.waitFor(() => expect(nurBueroBeimHochladen()).toEqual([true]));
    expect(screen.queryByText('Wirklich zu den Plänen?')).not.toBeInTheDocument();
  });

  it('schaltet ein vorhandenes Dokument um — und zeigt „Nur Büro“ an', async () => {
    vorhanden = [
      { id: 'd1', projectId: 'p1', pfad: 'baustellen/perl/p1/a.pdf', dateiname: 'Grundriss.pdf', mime: 'application/pdf', bytes: 500 },
      { id: 'd2', projectId: 'p1', pfad: 'baustellen/perl/p1/b.xlsx', dateiname: 'Aufmaß.xlsx', bytes: 500, nurBuero: true,
        mime: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' },
    ];
    const nutzer = userEvent.setup();
    zeichne();
    expect(await screen.findByText('EXCEL')).toBeInTheDocument();
    expect(screen.getByText(/^Nur Büro · /)).toBeInTheDocument();
    await nutzer.click(screen.getByRole('button', { name: 'Nur fürs Büro' }));
    await nutzer.click(screen.getByRole('button', { name: 'Für Monteure freigeben' }));
    expect(dokumentNurBueroSetzen.mock.calls).toEqual([['d1', true], ['d2', false]]);
  });

  it('fragt auch bei einem Mitarbeiternamen im Dateinamen nach (Testbericht 30.09.2026, H8)', async () => {
    const nutzer = userEvent.setup();
    render(
      <ToastProvider>
        <BaustellenPlaene companyId="perl" projectId="p1" darfAendern meinName="Chefin" personen={['Max Mustermann', 'Eva Berger']} />
      </ToastProvider>,
    );
    await nutzer.upload(screen.getByLabelText('Dokumente auswählen'), datei('Nachweis_Max_Mustermann_09.pdf'));
    expect(await screen.findByText('Wirklich zu den Plänen?')).toBeInTheDocument();
    expect(dokumentHochladen).not.toHaveBeenCalled();
  });

  it('ein Plan mit nur einem Vornamen darin geht ohne Rückfrage', async () => {
    const nutzer = userEvent.setup();
    render(
      <ToastProvider>
        <BaustellenPlaene companyId="perl" projectId="p1" darfAendern meinName="Chefin" personen={['Max Mustermann']} />
      </ToastProvider>,
    );
    await nutzer.upload(screen.getByLabelText('Dokumente auswählen'), datei('Grundriss Max EG.pdf'));
    await vi.waitFor(() => expect(dokumentHochladen).toHaveBeenCalledTimes(1));
  });

  it('lädt nach „Abbrechen“ nichts hoch', async () => {
    const nutzer = userEvent.setup();
    zeichne();
    await nutzer.upload(screen.getByLabelText('Dokumente auswählen'), datei('Rechnung 1002.pdf'));
    await nutzer.click(await screen.findByRole('button', { name: 'Abbrechen' }));
    expect(dokumentHochladen).not.toHaveBeenCalled();
  });
});
