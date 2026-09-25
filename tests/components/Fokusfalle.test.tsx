import { describe, it, expect, vi, afterEach } from 'vitest';
import { useState } from 'react';
import { render, screen, within, act } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import ConfirmDialog from '@/components/ConfirmDialog';
import BottomSheet from '@/components/BottomSheet';
import SignaturePad from '@/components/SignaturePad';
import ExportDialog from '@/features/accounting/ExportDialog';
import type { AppUser } from '@/types';

/**
 * Prüflauf 25.09.2026, P4-05 und P4-14: `aria-modal` ohne Fokusfalle.
 *
 * Alle Dialoge der App trugen `aria-modal="true"` — das verspricht der
 * Vorlesehilfe, dass es dahinter nichts zu bedienen gibt. Tab wanderte aber
 * aus jedem hinaus in die verdeckte Seite, und das Blatt von unten holte den
 * Fokus gar nicht erst hinein. Geprüft wird hier mit echter Tastenfolge
 * (`userEvent.tab`), nicht mit gesetztem Fokus.
 */

afterEach(() => {
  document.head.querySelectorAll('style[data-probe]').forEach((s) => s.remove());
});

describe('Bestätigungsdialog', () => {
  it('lässt Tab und Shift+Tab im Dialog kreisen', async () => {
    render(
      <>
        <button type="button">Dahinter</button>
        <ConfirmDialog open title="Weg damit?" onConfirm={vi.fn()} onCancel={vi.fn()} />
      </>,
    );
    const abbrechen = screen.getByRole('button', { name: 'Abbrechen' });
    const loeschen = screen.getByRole('button', { name: 'Löschen' });
    expect(abbrechen).toHaveFocus();
    await userEvent.tab();
    expect(loeschen).toHaveFocus();
    await userEvent.tab();
    expect(abbrechen).toHaveFocus();
    await userEvent.tab({ shift: true });
    expect(loeschen).toHaveFocus();
    expect(screen.getByRole('button', { name: 'Dahinter', hidden: true })).not.toHaveFocus();
  });

  it('schliesst nicht, solange die Aktion läuft — weder mit Escape noch daneben', async () => {
    let fertig: () => void = () => undefined;
    const onConfirm = vi.fn(() => new Promise<void>((r) => (fertig = r)));
    const onCancel = vi.fn();
    render(<ConfirmDialog open title="Stornieren?" onConfirm={onConfirm} onCancel={onCancel} />);
    await userEvent.click(screen.getByRole('button', { name: 'Löschen' }));
    await userEvent.keyboard('{Escape}');
    await userEvent.click(screen.getByRole('dialog'));
    expect(onCancel).not.toHaveBeenCalled();
    await act(async () => fertig());
    // Danach wieder wie gewohnt.
    await userEvent.keyboard('{Escape}');
    expect(onCancel).toHaveBeenCalledOnce();
  });
});

function MitBlatt() {
  const [offen, setOffen] = useState(false);
  return (
    <>
      <button type="button" onClick={() => setOffen(true)}>
        Mehr
      </button>
      <button type="button">Dahinter</button>
      <BottomSheet open={offen} onClose={() => setOffen(false)} label="Weitere Bereiche">
        <a href="/eins">Eins</a>
        <a href="/zwei">Zwei</a>
      </BottomSheet>
    </>
  );
}

describe('Blatt von unten', () => {
  it('holt den Fokus hinein, hält ihn drin und gibt ihn dem Auslöser zurück', async () => {
    render(<MitBlatt />);
    const mehr = screen.getByRole('button', { name: 'Mehr' });
    await userEvent.click(mehr);
    const blatt = screen.getByRole('dialog', { name: 'Weitere Bereiche' });
    expect(blatt).toHaveFocus();

    // Erst „Schließen" (für die Tastatur), dann die Einträge — und wieder vorn.
    await userEvent.tab();
    expect(within(blatt).getByRole('button', { name: 'Schließen' })).toHaveFocus();
    await userEvent.tab();
    expect(within(blatt).getByRole('link', { name: 'Eins' })).toHaveFocus();
    await userEvent.tab();
    expect(within(blatt).getByRole('link', { name: 'Zwei' })).toHaveFocus();
    await userEvent.tab();
    expect(within(blatt).getByRole('button', { name: 'Schließen' })).toHaveFocus();

    await userEvent.keyboard('{Escape}');
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(mehr).toHaveFocus();
  });
});

describe('Export-Dialog der Mitarbeiterübersicht', () => {
  function MitExport() {
    const [offen, setOffen] = useState(false);
    return (
      <>
        <button type="button" onClick={() => setOffen(true)}>
          Exportieren
        </button>
        {offen && (
          <ExportDialog
            user={{ uid: 'u1', name: 'Max Mustermann' } as AppUser}
            year={2026}
            month={8}
            onClose={() => setOffen(false)}
            onExportPdf={vi.fn()}
            onExportProjectCsv={vi.fn()}
          />
        )}
      </>
    );
  }

  it('holt den Fokus hinein, lässt Tab kreisen und gibt ihn zurück', async () => {
    render(<MitExport />);
    const ausloeser = screen.getByRole('button', { name: 'Exportieren' });
    await userEvent.click(ausloeser);
    const dialog = screen.getByRole('dialog', { name: 'Bericht exportieren' });
    expect(dialog).toHaveFocus();
    const schliessen = within(dialog).getByRole('button', { name: 'Schließen' });
    await userEvent.tab({ shift: true });
    expect(schliessen).toHaveFocus();
    await userEvent.tab();
    expect(within(dialog).getByLabelText('Von')).toHaveFocus();
    await userEvent.click(schliessen);
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(ausloeser).toHaveFocus();
  });
});

describe('Blatt „Groß unterschreiben"', () => {
  function canvasStellen() {
    HTMLCanvasElement.prototype.getContext = (() => ({
      setTransform: vi.fn(), scale: vi.fn(), beginPath: vi.fn(), moveTo: vi.fn(), lineTo: vi.fn(),
      stroke: vi.fn(), clearRect: vi.fn(), drawImage: vi.fn(),
    })) as unknown as HTMLCanvasElement['getContext'];
    HTMLCanvasElement.prototype.getBoundingClientRect = () =>
      ({ width: 300, height: 160, left: 0, top: 0, right: 300, bottom: 160, x: 0, y: 0 }) as DOMRect;
  }

  it('lässt Tab im Blatt kreisen', async () => {
    canvasStellen();
    render(<SignaturePad titel="Unterschrift Kunde" onChange={vi.fn()} />);
    await userEvent.click(screen.getByRole('button', { name: 'Groß unterschreiben' }));
    const blatt = screen.getByRole('dialog', { name: 'Unterschrift Kunde' });
    const fertig = within(blatt).getByRole('button', { name: 'Fertig' });
    expect(fertig).toHaveFocus();
    // „Neu zeichnen" ist gesperrt, solange nichts gezeichnet ist — „Fertig"
    // ist dann das einzige Ziel, und Tab bleibt darauf.
    await userEvent.tab();
    expect(fertig).toHaveFocus();
    await userEvent.tab({ shift: true });
    expect(fertig).toHaveFocus();
  });

  it('gibt den Fokus an das Feld, wenn „Groß unterschreiben" ausgeblendet ist (P4-14)', async () => {
    canvasStellen();
    render(<SignaturePad titel="Unterschrift Kunde" onChange={vi.fn()} />);
    await userEvent.click(screen.getByRole('button', { name: 'Groß unterschreiben' }));
    // Wie ab 1024 px (`lg:hidden`): das Tablet wurde im Blatt quer gedreht.
    const stil = document.createElement('style');
    stil.dataset.probe = '';
    stil.textContent = '.lg\\:hidden { display: none; }';
    document.head.appendChild(stil);
    await userEvent.click(screen.getByRole('button', { name: 'Fertig' }));
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(document.body).not.toHaveFocus();
    expect(screen.getByLabelText(/Unterschrift Kunde — mit dem Finger/)).toHaveFocus();
  });
});
