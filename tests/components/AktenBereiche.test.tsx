import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, useLocation } from 'react-router-dom';
import AktenBereiche from '@/components/AktenBereiche';

function Adresse() { return <output aria-label="Adresse">{useLocation().search}</output>; }
function zeige(adresse = '/akte', ohnePlanung = false) {
  return render(<MemoryRouter initialEntries={[adresse]}>
    <Adresse />
    <AktenBereiche kennung="probe" bereiche={[
      { id: 'profil', titel: 'Profil', sprungziele: ['alt-profil'], inhalt: <input aria-label="Entwurf" defaultValue="Bestand" /> },
      ...(!ohnePlanung ? [{ id: 'planung', titel: 'Planung', sprungziele: ['alt-termine'], inhalt: <p>Alle Termine</p> }] : []),
      { id: 'zugang', titel: 'Zugang', inhalt: <p>Kontostatus</p> },
    ]} />
  </MemoryRouter>);
}

describe('Aktenlinie 03 · Bereiche', () => {
  it('behält Entwürfe beim Wechsel und andere Adressparameter', async () => {
    zeige('/akte?suche=Anna');
    await userEvent.type(screen.getByLabelText('Entwurf'), '!');
    await userEvent.click(screen.getByRole('tab', { name: 'Planung' }));
    expect(screen.queryByRole('textbox', { name: 'Entwurf' })).toBeNull();
    expect(screen.getByLabelText('Adresse')).toHaveTextContent('suche=Anna&bereich=planung');
    await userEvent.click(screen.getByRole('tab', { name: 'Profil' }));
    expect(screen.getByLabelText('Entwurf')).toHaveValue('Bestand!');
  });
  it('bedient die Reiter mit Pfeiltasten sowie Pos1 und Ende', async () => {
    zeige();
    screen.getByRole('tab', { name: 'Profil' }).focus();
    await userEvent.keyboard('{ArrowRight}');
    expect(screen.getByRole('tab', { name: 'Planung' })).toHaveFocus();
    expect(screen.getByRole('tab', { name: 'Planung' })).toHaveAttribute('aria-selected', 'true');
    await userEvent.keyboard('{End}');
    expect(screen.getByRole('tab', { name: 'Zugang' })).toHaveFocus();
    await userEvent.keyboard('{Home}');
    expect(screen.getByRole('tab', { name: 'Profil' })).toHaveFocus();
  });
  it('öffnet ein bestehendes Sprungziel im richtigen Bereich', () => {
    zeige('/akte#alt-termine');
    expect(screen.getByRole('tab', { name: 'Planung' })).toHaveAttribute('aria-selected', 'true');
    expect(screen.getByText('Alle Termine')).toBeVisible();
  });
  it('fällt bei einem nicht verfügbaren Bereich auf den ersten zurück', () => {
    zeige('/akte?bereich=planung', true);
    expect(screen.queryByRole('tab', { name: 'Planung' })).toBeNull();
    expect(screen.getByRole('tab', { name: 'Profil' })).toHaveAttribute('aria-selected', 'true');
  });
});
