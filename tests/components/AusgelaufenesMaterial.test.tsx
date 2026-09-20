import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { Material } from '@/types';
import type { WithId } from '@/lib/db/core';
import MaterialErfassen from '@/features/worksheets/MaterialErfassen';
import RuestlistePlanen from '@/features/assignments/RuestlistePlanen';

/**
 * Ein Artikel, den der Grosshändler nicht mehr führt.
 *
 * ER WIRD NICHT GELÖSCHT, und das ist der Punkt: er steht auf alten
 * Handwerksscheinen und Rechnungen, und verschwände er, fehlte er
 * rückwirkend in jeder Auswertung. Er bleibt also im Katalog — aber wer
 * heute einen Schein schreibt, soll ihn nicht mehr angeboten bekommen. Ein
 * Artikel, der nicht mehr zu beschaffen ist, auf einem frischen Schein ist
 * eine Bestellung, die niemand ausliefern kann.
 */

const artikel = (p: Partial<Material> & { id: string }): WithId<Material> =>
  ({ companyId: 'perl', name: 'Eckventil', stock: 5, unit: 'Stk', ...p }) as WithId<Material>;

describe('Materialerfassung am Schein', () => {
  it('bietet einen ausgelaufenen Artikel nicht mehr an', async () => {
    render(
      <MaterialErfassen
        materials={[
          artikel({ id: 'm1', name: 'Eckventil alt', ausgelaufen: true }),
          artikel({ id: 'm2', name: 'Eckventil neu' }),
        ]}
        zeilen={[]}
        onChange={() => undefined}
      />,
    );

    await userEvent.type(screen.getByLabelText('Artikel aus dem Lager'), 'Eckventil');
    expect(await screen.findByText('Eckventil neu')).toBeInTheDocument();
    expect(screen.queryByText('Eckventil alt')).toBeNull();
  });

  it('bietet ihn wieder an, sobald er im Katalog zurück ist', async () => {
    // Die Gegenprobe: ohne sie prüfte der Test oben womöglich nur, dass die
    // Suche überhaupt nichts findet.
    render(
      <MaterialErfassen
        materials={[artikel({ id: 'm1', name: 'Eckventil alt', ausgelaufen: false })]}
        zeilen={[]}
        onChange={() => undefined}
      />,
    );
    await userEvent.type(screen.getByLabelText('Artikel aus dem Lager'), 'Eckventil');
    expect(await screen.findByText('Eckventil alt')).toBeInTheDocument();
  });
});

describe('Rüstliste für den Einsatz', () => {
  it('packt einen ausgelaufenen Artikel nicht mehr auf den Wagen', async () => {
    render(
      <RuestlistePlanen
        materials={[
          artikel({ id: 'm1', name: 'Eckventil alt', ausgelaufen: true }),
          artikel({ id: 'm2', name: 'Eckventil neu' }),
        ]}
        positionen={[]}
        onChange={() => undefined}
      />,
    );

    await userEvent.type(screen.getByLabelText('Artikel aus dem Lager'), 'Eckventil');
    expect(await screen.findByText('Eckventil neu')).toBeInTheDocument();
    expect(screen.queryByText('Eckventil alt')).toBeNull();
  });
});
