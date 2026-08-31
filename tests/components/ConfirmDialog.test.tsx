import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import ConfirmDialog from '@/components/ConfirmDialog';

/**
 * Der Dialog steht vor jeder Loeschung und vor jedem Storno. Sein wichtigstes
 * Verhalten ist das im Fehlerfall: schliesst er dann trotzdem, glaubt der
 * Nutzer, die Rechnung sei storniert — und sie ist es nicht.
 */

describe('Bestaetigungsdialog', () => {
  it('zeigt nichts, solange er geschlossen ist', () => {
    render(
      <ConfirmDialog open={false} title="Weg damit?" onConfirm={vi.fn()} onCancel={vi.fn()} />,
    );
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('nennt Titel und Meldung und bestaetigt auf Klick', async () => {
    const onConfirm = vi.fn();
    render(
      <ConfirmDialog
        open
        title="Eintrag löschen?"
        message="Der Eintrag vom 03.08. wird endgültig entfernt."
        onConfirm={onConfirm}
        onCancel={vi.fn()}
      />,
    );
    expect(screen.getByRole('dialog')).toHaveAccessibleName('Eintrag löschen?');
    expect(screen.getByText(/03\.08\./)).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Löschen' }));
    expect(onConfirm).toHaveBeenCalledOnce();
  });

  it('legt den Fokus auf Abbrechen, nicht auf die Loeschung', () => {
    // Ein versehentliches Enter darf nichts vernichten.
    render(<ConfirmDialog open title="Weg damit?" onConfirm={vi.fn()} onCancel={vi.fn()} />);
    expect(screen.getByRole('button', { name: 'Abbrechen' })).toHaveFocus();
  });

  it('schliesst mit Escape', async () => {
    const onCancel = vi.fn();
    render(<ConfirmDialog open title="Weg damit?" onConfirm={vi.fn()} onCancel={onCancel} />);
    await userEvent.keyboard('{Escape}');
    expect(onCancel).toHaveBeenCalledOnce();
  });

  it('BLEIBT offen und meldet, wenn die Aktion scheitert', async () => {
    // Der eigentliche Schaden ohne das: der Storno schlaegt fehl, der Dialog
    // verschwindet, und niemand erfaehrt es.
    const onConfirm = vi.fn(async () => {
      throw new Error('Die Rechnung ist bereits verbucht.');
    });
    render(
      <ConfirmDialog open title="Stornieren?" onConfirm={onConfirm} onCancel={vi.fn()} />,
    );
    await userEvent.click(screen.getByRole('button', { name: 'Löschen' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Die Rechnung ist bereits verbucht.');
    expect(screen.getByRole('dialog')).toBeInTheDocument();
  });

  it('uebernimmt Beschriftung und Ton der Bestaetigung', () => {
    // Eine Bestellung abzuschliessen ist kein Loeschen. Wo Rot ueberall steht,
    // uebersieht man es beim echten Loeschen.
    render(
      <ConfirmDialog
        open
        title="Bestellung abschließen?"
        confirmLabel="Abschließen"
        confirmTone="primary"
        onConfirm={vi.fn()}
        onCancel={vi.fn()}
      />,
    );
    const knopf = screen.getByRole('button', { name: 'Abschließen' });
    expect(knopf).toBeInTheDocument();
    expect(knopf.className).not.toMatch(/bg-danger/);
  });
});
