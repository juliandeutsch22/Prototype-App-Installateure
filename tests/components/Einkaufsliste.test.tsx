import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ToastProvider } from '@/components/Toast';
import type { Company, MaterialOrder } from '@/types';
import type { WithId } from '@/lib/db/core';
import type { Grosshaendler } from '@/lib/db/einkauf';
import Einkaufsliste from '@/features/orders/Einkaufsliste';

/**
 * Die Einkaufsliste — was das Büro beim Grosshändler bestellt.
 *
 * Hier hängt, dass drei Anforderungen für denselben Artikel EINE Zeile beim
 * Grosshändler werden, dass „bestellt" und „geliefert" die Anforderungen
 * dahinter treffen und dass die E-Mail an die Bestelladresse geht.
 */

const alsBestellt = vi.fn();
const geliefert = vi.fn();
const zuordnen = vi.fn();
const vonListe = vi.fn();
const speichern = vi.fn();
const pdf = vi.fn();

vi.mock('@/lib/db/einkauf', () => ({
  katalogFuer: () =>
    Promise.resolve(new Map([['m1', { articleNumber: 'EV-12', unit: 'Stk' }]])),
  alsBestelltMarkieren: (...a: unknown[]) => alsBestellt(...a),
  geliefert: (...a: unknown[]) => geliefert(...a),
  grosshaendlerZuordnen: (...a: unknown[]) => zuordnen(...a),
  vonEinkaufslisteNehmen: (...a: unknown[]) => vonListe(...a),
  grosshaendlerSpeichern: (...a: unknown[]) => speichern(...a),
}));
vi.mock('@/features/orders/bestellungPdf', () => ({
  downloadBestellungPdf: (...a: unknown[]) => pdf(...a),
}));
vi.mock('@/app/offenePosten', () => ({ postenNeuLaden: () => Promise.resolve() }));

const company = { id: 'perl', name: 'Perl Installationen', addressLine: 'Hauptstraße 1, 1010 Wien' } as Company;

const HOLTER: WithId<Grosshaendler> = {
  id: 'gh1', companyId: 'perl', name: 'Holter', customerNumber: '4711',
  bestellEmail: 'vertreter@holter.test', active: true,
};
const FRAUENTHAL: WithId<Grosshaendler> = { id: 'gh2', companyId: 'perl', name: 'Frauenthal', active: true };

function anf(p: Partial<MaterialOrder> & { id: string }): WithId<MaterialOrder> {
  return {
    companyId: 'perl', materialId: 'm1', materialName: 'Eckventil 1/2', quantity: 2,
    status: 'In Bearbeitung', transactionType: 'order', userId: 'u1', userName: 'Max',
    beschaffung: 'einkauf', supplierId: 'gh1', projectNumber: 'B-1', ...p,
  } as WithId<MaterialOrder>;
}

function zeige(anforderungen: WithId<MaterialOrder>[], gh = [HOLTER, FRAUENTHAL]) {
  const geaendert = vi.fn();
  render(
    <ToastProvider>
      <Einkaufsliste
        company={company}
        meinName="Petra Büro"
        anforderungen={anforderungen}
        grosshaendler={gh}
        onGrosshaendlerGeaendert={geaendert}
      />
    </ToastProvider>,
  );
  return geaendert;
}

beforeEach(() => {
  for (const f of [alsBestellt, geliefert, zuordnen, vonListe, speichern, pdf]) {
    f.mockReset();
    f.mockResolvedValue(undefined);
  }
});

describe('Einkaufsliste — zusammengefasst je Grosshändler', () => {
  it('macht aus drei Anforderungen EINE Zeile, mit allen Kommissionen', async () => {
    zeige([
      anf({ id: 'a', projectNumber: 'B-2' }),
      anf({ id: 'b', projectNumber: 'B-1' }),
      anf({ id: 'c', projectNumber: 'B-1' }),
    ]);
    expect(await screen.findByText('6 Stk × Eckventil 1/2')).toBeInTheDocument();
    expect(screen.getByText('Kommission B-1, B-2')).toBeInTheDocument();
    expect(screen.getByText('Art.-Nr. EV-12')).toBeInTheDocument();
  });

  it('lässt Lagerware, Geliefertes und Retouren weg', async () => {
    zeige([
      anf({ id: 'a', beschaffung: 'lager', status: 'Abholbereit' }),
      anf({ id: 'b', geliefertAm: Date.now() as never, status: 'Abholbereit' }),
      anf({ id: 'c', transactionType: 'return' }),
    ]);
    expect(await screen.findByText(/Nichts auf der Einkaufsliste/)).toBeInTheDocument();
  });

  it('öffnet die E-Mail an die Bestelladresse, mit Kundennummer und Liste', async () => {
    zeige([anf({ id: 'a' })]);
    const link = await screen.findByRole('link', { name: 'E-Mail an vertreter@holter.test' });
    const href = link.getAttribute('href')!;
    expect(href.startsWith('mailto:vertreter@holter.test?')).toBe(true);
    const text = decodeURIComponent(href.split('&body=')[1]);
    expect(text).toContain('Kundennummer 4711');
    expect(text).toContain('- 2 Stk × Art.-Nr. EV-12 – Eckventil 1/2 (Kommission B-1)');
    expect(text).toContain('Petra Büro');
  });

  it('sagt, wenn die Bestelladresse fehlt — statt einen leeren Link anzubieten', async () => {
    zeige([anf({ id: 'a', supplierId: 'gh2' })]);
    await screen.findByText(/Eckventil/);
    expect(screen.queryByRole('link', { name: /E-Mail an/ })).not.toBeInTheDocument();
    expect(screen.getByText(/Keine Bestelladresse/)).toBeInTheDocument();
  });

  it('erstellt das PDF mit den Zeilen des Grosshändlers', async () => {
    zeige([anf({ id: 'a' })]);
    await userEvent.click(await screen.findByRole('button', { name: 'PDF' }));
    await waitFor(() => expect(pdf).toHaveBeenCalledTimes(1));
    const o = pdf.mock.calls[0][0] as { grosshaendler: { name: string }; zeilen: { menge: number }[] };
    expect(o.grosshaendler.name).toBe('Holter');
    expect(o.zeilen).toHaveLength(1);
  });
});

describe('Einkaufsliste — bestellt und geliefert', () => {
  it('markiert erst nach der Rückfrage alle Anforderungen dahinter als bestellt', async () => {
    zeige([anf({ id: 'a' }), anf({ id: 'b' })]);
    await userEvent.click(await screen.findByRole('button', { name: 'Als bestellt markieren' }));
    expect(alsBestellt).not.toHaveBeenCalled();
    const dialog = await screen.findByRole('dialog');
    await userEvent.click(within(dialog).getByRole('button', { name: 'Bestellt' }));
    await waitFor(() => expect(alsBestellt).toHaveBeenCalledWith(['a', 'b']));
  });

  it('bucht „Geliefert" je Anforderung — und „Alles geliefert" für alle', async () => {
    const jetzt = Date.now() as never;
    zeige([anf({ id: 'a', bestelltAm: jetzt }), anf({ id: 'b', bestelltAm: jetzt })]);
    const knoepfe = await screen.findAllByRole('button', { name: 'Geliefert' });
    await userEvent.click(knoepfe[0]);
    await waitFor(() => expect(geliefert).toHaveBeenCalledWith(['a']));
    await userEvent.click(screen.getByRole('button', { name: 'Alles geliefert' }));
    await waitFor(() => expect(geliefert).toHaveBeenLastCalledWith(['a', 'b']));
  });

  it('nimmt eine Zeile samt aller Anforderungen von der Liste', async () => {
    zeige([anf({ id: 'a' }), anf({ id: 'b' })]);
    await userEvent.click(
      await screen.findByRole('button', { name: 'Eckventil 1/2 von der Einkaufsliste nehmen' }),
    );
    await waitFor(() => expect(vonListe).toHaveBeenCalledTimes(2));
    expect(vonListe.mock.calls.map((c) => c[0])).toEqual(['a', 'b']);
  });

  it('zeigt einen Serverfehler, statt ihn zu verschlucken', async () => {
    geliefert.mockRejectedValueOnce(new Error('Keine Berechtigung'));
    zeige([anf({ id: 'a', bestelltAm: Date.now() as never })]);
    await userEvent.click(await screen.findByRole('button', { name: 'Geliefert' }));
    expect(await screen.findByText(/Keine Berechtigung/)).toBeInTheDocument();
  });
});

describe('Einkaufsliste — ohne Grosshändler', () => {
  it('lässt erst zuordnen, dann bestellen', async () => {
    zeige([anf({ id: 'a', supplierId: null }), anf({ id: 'b', supplierId: null })]);
    expect(await screen.findByText('Ohne Grosshändler')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Als bestellt markieren' })).not.toBeInTheDocument();
    await userEvent.selectOptions(
      screen.getByRole('combobox', { name: 'Grosshändler für Eckventil 1/2' }),
      'gh2',
    );
    await waitFor(() => expect(zuordnen).toHaveBeenCalledWith(['a', 'b'], 'gh2'));
  });
});

describe('Einkaufsliste — die Grosshändler pflegen', () => {
  it('legt einen Grosshändler an und meldet es nach oben', async () => {
    const geaendert = zeige([], []);
    await userEvent.click(await screen.findByRole('button', { name: '+ Grosshändler' }));
    await userEvent.type(screen.getByLabelText(/^Name/), 'Holter');
    await userEvent.type(screen.getByLabelText('Bestelladresse (E-Mail)'), 'bestellung@holter.test');
    await userEvent.click(screen.getByRole('button', { name: 'Speichern' }));
    await waitFor(() =>
      expect(speichern).toHaveBeenCalledWith('perl', null, expect.objectContaining({
        name: 'Holter', bestellEmail: 'bestellung@holter.test',
      })),
    );
    expect(geaendert).toHaveBeenCalled();
  });

  it('lehnt eine Bestelladresse ab, die keine E-Mail ist', async () => {
    zeige([], []);
    await userEvent.click(await screen.findByRole('button', { name: '+ Grosshändler' }));
    await userEvent.type(screen.getByLabelText(/^Name/), 'Holter');
    await userEvent.type(screen.getByLabelText('Bestelladresse (E-Mail)'), 'holter');
    await userEvent.click(screen.getByRole('button', { name: 'Speichern' }));
    expect(await screen.findByRole('alert')).toHaveTextContent(/keine|nicht wie eine E-Mail/);
    expect(speichern).not.toHaveBeenCalled();
  });
});
