import { useState } from 'react';
import { describe, it, expect } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import AktenBearbeiten from '@/components/AktenBearbeiten';

function Beispiel({ speichert = false }: { speichert?: boolean }) {
  const [offen, setOffen] = useState(false);
  const [wert, setWert] = useState('Bestand');
  return <><button onClick={() => setOffen(true)}>Bearbeiten</button>
    <AktenBearbeiten offen={offen} titel="Akte bearbeiten" geaendert={wert !== 'Bestand'} speichert={speichert}
      onSchliessen={() => setOffen(false)} onVerwerfen={() => setWert('Bestand')}>
      <input aria-label="Name" value={wert} onChange={(e) => setWert(e.target.value)} />
    </AktenBearbeiten></>;
}

describe('Aktenlinie 03 · Bearbeitungsfenster', () => {
  it('fragt vor dem Verwerfen, behält beim Abbrechen den Entwurf und gibt den Fokus zurück', async () => {
    render(<Beispiel />);
    await userEvent.click(screen.getByRole('button', { name: 'Bearbeiten' }));
    await userEvent.type(screen.getByLabelText('Name'), '!');
    await userEvent.keyboard('{Escape}');
    const rueckfrage = screen.getByRole('dialog', { name: 'Ungespeicherte Änderungen verwerfen?' });
    await userEvent.click(within(rueckfrage).getByRole('button', { name: 'Abbrechen' }));
    expect(screen.getByLabelText('Name')).toHaveValue('Bestand!');
    await userEvent.click(screen.getByRole('button', { name: 'Schließen' }));
    await userEvent.click(within(screen.getByRole('dialog', { name: 'Ungespeicherte Änderungen verwerfen?' })).getByRole('button', { name: 'Verwerfen' }));
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(screen.getByRole('button', { name: 'Bearbeiten' })).toHaveFocus();
    await userEvent.click(screen.getByRole('button', { name: 'Bearbeiten' }));
    expect(screen.getByLabelText('Name')).toHaveValue('Bestand');
  });
  it('schließt während des Speicherns weder mit Escape noch mit Schließen', async () => {
    render(<Beispiel speichert />);
    await userEvent.click(screen.getByRole('button', { name: 'Bearbeiten' }));
    await userEvent.keyboard('{Escape}');
    await userEvent.click(screen.getByRole('button', { name: 'Schließen' }));
    expect(screen.getByRole('dialog', { name: 'Akte bearbeiten' })).toBeInTheDocument();
  });
});
