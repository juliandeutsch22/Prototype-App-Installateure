import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ToastProvider } from '@/components/Toast';

/**
 * Pläne hochladen — und die Rückfrage vor einem Beleg aus dem Büro.
 *
 * Im Launch-Check (25.09.2026, R1) lag ein Stundennachweis bei den Plänen,
 * sichtbar für jeden Monteur der Baustelle.
 */
const dokumentHochladen = vi.fn(async () => undefined);
vi.mock('@/lib/db/baustellenDokumente', () => ({
  dokumentHochladen: (...a: unknown[]) => dokumentHochladen(...(a as [])),
  dokumentLoeschen: vi.fn(),
  dateiPruefen: () => null,
  listDokumente: vi.fn(async () => []),
  dokumentAdressen: vi.fn(async () => new Map()),
  GUELTIG_SEKUNDEN: 3600,
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

beforeEach(() => dokumentHochladen.mockClear());

describe('Pläne hochladen', () => {
  it('sagt neben dem Knopf, wer alles sieht', async () => {
    zeichne();
    expect(await screen.findByText('Die Monteure dieser Baustelle sehen alles hier.')).toBeInTheDocument();
  });

  it('lädt einen Plan ohne Rückfrage hoch', async () => {
    const nutzer = userEvent.setup();
    zeichne();
    await nutzer.upload(screen.getByLabelText('Pläne oder Bilder auswählen'), datei('Grundriss EG.pdf'));
    await vi.waitFor(() => expect(dokumentHochladen).toHaveBeenCalledTimes(1));
    expect(screen.queryByText('Wirklich zu den Plänen?')).not.toBeInTheDocument();
  });

  it('fragt vor einem Stundennachweis nach — und lädt erst nach dem Ja', async () => {
    const nutzer = userEvent.setup();
    zeichne();
    await nutzer.upload(
      screen.getByLabelText('Pläne oder Bilder auswählen'),
      datei('Stundennachweis September.pdf'),
    );
    expect(await screen.findByText('Wirklich zu den Plänen?')).toBeInTheDocument();
    expect(dokumentHochladen).not.toHaveBeenCalled();

    await nutzer.click(screen.getByRole('button', { name: 'Trotzdem hinzufügen' }));
    await vi.waitFor(() => expect(dokumentHochladen).toHaveBeenCalledTimes(1));
  });

  it('lädt nach „Abbrechen" nichts hoch', async () => {
    const nutzer = userEvent.setup();
    zeichne();
    await nutzer.upload(screen.getByLabelText('Pläne oder Bilder auswählen'), datei('Rechnung 1002.pdf'));
    await nutzer.click(await screen.findByRole('button', { name: 'Abbrechen' }));
    expect(dokumentHochladen).not.toHaveBeenCalled();
  });
});
