import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createEvent, fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { useState } from 'react';
import type { Customer } from '@/types';
import type { WithId } from '@/lib/db/core';

/**
 * DIE KUNDENAUSWAHL SUCHT AUF DEM SERVER (Ladezeit, 19.10.2026).
 *
 * Fünf Masken luden beim Öffnen bis zu 500 Kunden in ein Auswahlfeld; was
 * dahinter lag, fehlte. Jetzt kommt, was gesucht wird, und der gewählte Kunde
 * selbst. Gegenprobe: die alte Auswahl (`SelectField` mit `listCustomers`)
 * hatte weder Suchfeld noch Treffer — jede Prüfung hier wäre rot.
 */

let bestand: WithId<Customer>[] = [];
let sucheScheitert = false;
const searchCustomers = vi.fn(async (_c: string, begriff: string, max: number) => {
  if (sucheScheitert) throw new Error('kein Netz');
  const q = begriff.toLowerCase();
  return bestand.filter((k) => [k.name, k.address].some((x) => x?.toLowerCase().includes(q))).slice(0, max);
});
const listCustomersByIds = vi.fn(async (_c: string, ids: string[]) => bestand.filter((k) => ids.includes(k.id)));
vi.mock('@/lib/db/customers', () => ({
  searchCustomers: (c: string, b: string, m: number) => searchCustomers(c, b, m),
  listCustomersByIds: (c: string, ids: string[]) => listCustomersByIds(c, ids),
}));

const { default: KundenAuswahl, KUNDEN_TREFFER } = await import('@/components/KundenAuswahl');

const kunde = (id: string, name: string, extra: Partial<Customer> = {}): WithId<Customer> =>
  ({ id, companyId: 'perl', name, ...extra }) as WithId<Customer>;

const gewaehlt: Array<[string, WithId<Customer> | null]> = [];

function Formular({ start = '', pflicht = false, nurAktive = false }: { start?: string; pflicht?: boolean; nurAktive?: boolean }) {
  const [wert, setWert] = useState(start);
  return (
    <MemoryRouter>
      <form>
        <KundenAuswahl
          companyId="perl"
          id="k"
          value={wert}
          onChange={(id, k) => { gewaehlt.push([id, k]); setWert(id); }}
          pflicht={pflicht}
          required={pflicht}
          nurAktive={nurAktive}
        />
      </form>
    </MemoryRouter>
  );
}

beforeEach(() => {
  bestand = [
    kunde('k1', 'Familie Huber', { address: 'Gartengasse 12, 2700 Wiener Neustadt' }),
    kunde('k2', 'Hausverwaltung Nord', { address: 'Hauptplatz 1, 8010 Graz' }),
    kunde('k3', 'Huber Bau GmbH', { active: false }),
  ];
  sucheScheitert = false;
  searchCustomers.mockClear();
  listCustomersByIds.mockClear();
  gewaehlt.length = 0;
});

describe('KundenAuswahl', () => {
  it('lädt beim Öffnen nichts — gesucht wird, wenn jemand tippt', async () => {
    render(<Formular />);
    expect(screen.getByRole('searchbox', { name: 'Kunde' })).toBeInTheDocument();
    await new Promise((r) => setTimeout(r, 350));
    expect(searchCustomers).not.toHaveBeenCalled();
    expect(listCustomersByIds).not.toHaveBeenCalled();
  });

  it('sucht auf dem Server und übernimmt den gewählten Kunden samt Datensatz', async () => {
    const nutzer = userEvent.setup();
    render(<Formular />);
    await nutzer.type(screen.getByRole('searchbox', { name: 'Kunde' }), 'huber');
    await nutzer.click(await screen.findByRole('button', { name: 'Familie Huber' }));
    expect(searchCustomers).toHaveBeenLastCalledWith('perl', 'huber', KUNDEN_TREFFER * 2);
    expect(gewaehlt).toEqual([['k1', bestand[0]]]);
    // Steht der Kunde, zeigt die Auswahl ihn mit Anschrift — und bietet den Wechsel an.
    expect(screen.getByText('Familie Huber')).toBeInTheDocument();
    expect(screen.getByText('Gartengasse 12, 2700 Wiener Neustadt')).toBeInTheDocument();
    expect(screen.queryByRole('searchbox')).toBeNull();
    await nutzer.click(screen.getByRole('button', { name: 'Anderen Kunden wählen' }));
    expect(screen.getByRole('searchbox', { name: 'Kunde' })).toBeInTheDocument();
  });

  it('zeigt höchstens acht Treffer', async () => {
    bestand = Array.from({ length: 30 }, (_, i) => kunde(`k${i}`, `Kunde ${i}`));
    render(<Formular />);
    await userEvent.type(screen.getByRole('searchbox', { name: 'Kunde' }), 'Kunde');
    await screen.findByRole('button', { name: 'Kunde 0' });
    expect(screen.getAllByRole('button', { name: /^Kunde \d+$/ })).toHaveLength(KUNDEN_TREFFER);
  });

  it('lädt einen vorgegebenen Kunden einzeln — nicht die Liste aller', async () => {
    render(<Formular start="k2" />);
    expect(await screen.findByText('Hausverwaltung Nord')).toBeInTheDocument();
    expect(listCustomersByIds).toHaveBeenCalledWith('perl', ['k2']);
    expect(searchCustomers).not.toHaveBeenCalled();
  });

  it('als Pflicht: ohne gewählten Kunden meldet das Feld es — auch wenn ein Name getippt ist', async () => {
    render(<Formular pflicht />);
    const feld = screen.getByRole('searchbox', { name: 'Kunde' }) as HTMLInputElement;
    await userEvent.type(feld, 'Irgendwer');
    expect(feld.validationMessage).toBe('Bitte einen Kunden wählen.');
    expect(feld.checkValidity()).toBe(false);
  });

  it('Gleichbleiben: ohne Pflicht lässt sich das Formular ohne Kunden abschicken', async () => {
    render(<Formular />);
    expect((screen.getByRole('searchbox', { name: 'Kunde' }) as HTMLInputElement).checkValidity()).toBe(true);
  });

  it('bietet mit `nurAktive` keine inaktiven an; ohne steht „inaktiv“ dabei', async () => {
    const { unmount } = render(<Formular nurAktive />);
    await userEvent.type(screen.getByRole('searchbox', { name: 'Kunde' }), 'Huber');
    await screen.findByRole('button', { name: 'Familie Huber' });
    expect(screen.queryByRole('button', { name: /Huber Bau/ })).toBeNull();
    unmount();
    render(<Formular />);
    await userEvent.type(screen.getByRole('searchbox', { name: 'Kunde' }), 'Huber');
    expect(await screen.findByRole('button', { name: 'Huber Bau GmbH (inaktiv)' })).toBeInTheDocument();
  });

  it('sagt, wenn nichts passt — mit dem Weg in die Kundenverwaltung', async () => {
    render(<Formular />);
    await userEvent.type(screen.getByRole('searchbox', { name: 'Kunde' }), 'Niemand');
    expect(await screen.findByText(/Kein Kunde passt zur Suche/)).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Kundenverwaltung' })).toHaveAttribute('href', '/customers');
  });

  it('sagt, wenn die Suche nicht erreichbar ist', async () => {
    sucheScheitert = true;
    render(<Formular />);
    await userEvent.type(screen.getByRole('searchbox', { name: 'Kunde' }), 'Huber');
    expect(await screen.findByText(/Die Suche ist gerade nicht erreichbar/)).toBeInTheDocument();
  });

  it('„Anderen Kunden wählen“ und „Bei … bleiben“ schicken das Formular nicht ab', async () => {
    // Ein Knopf ohne Typ ist im Formular „absenden“ — das Angebot wäre angelegt.
    // jsdom schickt nicht ab; geprüft wird deshalb der Typ.
    const nutzer = userEvent.setup();
    render(<Formular start="k2" />);
    const anderer = await screen.findByRole('button', { name: 'Anderen Kunden wählen' });
    expect(anderer).toHaveAttribute('type', 'button');
    await nutzer.click(anderer);
    const bleiben = screen.getByRole('button', { name: 'Bei Hausverwaltung Nord bleiben' });
    expect(bleiben).toHaveAttribute('type', 'button');
    await nutzer.click(bleiben);
    expect(screen.getByText('Hausverwaltung Nord')).toBeInTheDocument();
  });

  it('die Eingabetaste schickt das Formular nicht ab', () => {
    render(<Formular />);
    const feld = screen.getByRole('searchbox', { name: 'Kunde' });
    // jsdom kennt kein implizites Abschicken; geprüft wird, dass die Taste abgefangen ist.
    const taste = createEvent.keyDown(feld, { key: 'Enter' });
    fireEvent(feld, taste);
    expect(taste.defaultPrevented).toBe(true);
  });
});
