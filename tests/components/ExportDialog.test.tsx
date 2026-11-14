import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import ExportDialog from '@/features/accounting/ExportDialog';
import type { AppUser } from '@/types';

/*
  EINE HAUPTAKTION IM BERICHT-DIALOG (Anzeigefehler 14.11.2026): „Projekt-
  auswertung (CSV)“ hatte keine Variante und war damit ebenso gefüllt wie
  „Stundennachweis (PDF)“ — zwei Terrakotta-Knöpfe untereinander. Gefüllt
  bleibt allein der Stundennachweis; beide tun weiter, was sie taten.
*/
describe('Bericht exportieren', () => {
  const zeigen = () => {
    const pdf = vi.fn(async () => undefined);
    const csv = vi.fn(async () => undefined);
    render(
      <ExportDialog user={{ uid: 'u1', name: 'Max Mustermann' } as AppUser} year={2026} month={10}
        onClose={() => undefined} onExportPdf={pdf} onExportProjectCsv={csv} />,
    );
    return { pdf, csv };
  };

  it('hat genau eine gefüllte Hauptaktion: den Stundennachweis', () => {
    zeigen();
    const gefuellt = screen.getAllByRole('button').filter((k) => k.className.includes('bg-brand'));
    expect(gefuellt.map((k) => k.textContent)).toEqual(['Stundennachweis (PDF)']);
    expect(screen.getByRole('button', { name: 'Projektauswertung (CSV)' }).className).not.toContain('bg-brand');
  });

  it('gleich geblieben: beide Knöpfe exportieren den gewählten Zeitraum', async () => {
    const { pdf, csv } = zeigen();
    await userEvent.click(screen.getByRole('button', { name: 'Stundennachweis (PDF)' }));
    expect(pdf).toHaveBeenCalledWith('2026-11-01', '2026-11-30');
    await userEvent.click(screen.getByRole('button', { name: 'Projektauswertung (CSV)' }));
    expect(csv).toHaveBeenCalledWith('2026-11-01', '2026-11-30');
  });
});
