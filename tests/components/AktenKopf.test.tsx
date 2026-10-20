import { expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import AktenKopf from '@/components/AktenKopf';

it('Aktenkontext 04 · trennt Rückweg, Identität und Hauptaktion und erhält den Bearbeitungseinstieg', async () => {
  let bearbeitet = false;
  render(<MemoryRouter><AktenKopf art="Kunde" title="Hausverwaltung Nord" zurueck="/customers"
    zurueckText="Zur Kundenliste" meta="K-42 · aktiv" action={<button onClick={() => { bearbeitet = true; }}>Bearbeiten</button>} />
  </MemoryRouter>);
  expect(screen.getByRole('heading', { level: 1, name: 'Hausverwaltung Nord' })).toBeVisible();
  expect(screen.getByRole('link', { name: /Zur Kundenliste/ })).toHaveAttribute('href', '/customers');
  expect(screen.getByText('K-42 · aktiv')).toBeVisible();
  await userEvent.click(screen.getByRole('button', { name: 'Bearbeiten' }));
  expect(bearbeitet).toBe(true);
});
