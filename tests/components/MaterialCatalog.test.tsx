import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ToastProvider } from '@/components/Toast';
import type { Material, Role } from '@/types';
import type { WithId } from '@/lib/db/core';
import MaterialCatalog from '@/features/orders/MaterialCatalog';

/**
 * Der Einkaufspreis im Materialkatalog.
 *
 * ER IST DIE KOSTENSEITE DER NACHKALKULATION und damit Margendaten. Gepflegt
 * wird der Katalog von der Verwaltung, setzen darf dieses eine Feld aber nur
 * die Geschäftsführung — die Grenze läuft zwischen den FELDERN, nicht zwischen
 * den Ansichten.
 *
 * WARUM DAS FELD NICHT NUR AUSGEBLENDET WIRD, sondern ganz aus den Daten
 * fällt: das Formular der Verwaltung kennt den Wert nicht und trüge beim
 * Speichern eine 0 ein, wo der Chef 3,50 hinterlegt hat. Die Regel in
 * `firestore.rules` weist das zurück — richtig so, aber gescheitert wäre dann
 * ihr GANZES Speichern: der Knopf täte nichts, und niemand wüsste warum.
 * Genau das prüft der letzte Test hier.
 */

let materialien: WithId<Material>[] = [];
const anlegen = vi.fn();
const aendern = vi.fn();

vi.mock('@/lib/db/materials', () => ({
  LOW_STOCK_THRESHOLD: 5,
  subscribeMaterials: (_c: string, cb: (rows: WithId<Material>[]) => void) => {
    cb(materialien);
    return () => undefined;
  },
  createMaterial: (...a: unknown[]) => anlegen(...a),
  updateMaterial: (...a: unknown[]) => aendern(...a),
  deleteMaterial: vi.fn(),
}));

/*
  STABILE OBJEKTE, KEINE FRISCHEN LITERALE. Gäbe der Mock bei jedem Aufruf ein
  neues Objekt zurück, liefe der Effekt, der an `user` hängt, endlos — der
  Testlauf hängt dann ohne Fehlermeldung.
*/
const alsRolle = (uid: string, name: string, role: Role) => ({
  user: { uid, companyId: 'perl', name, role },
});
const VERWALTUNG = alsRolle('v1', 'Verwaltung', 'Verwaltung');
const CHEF = alsRolle('g1', 'Chef', 'Geschäftsführung');
let angemeldet = VERWALTUNG;
vi.mock('@/app/AuthContext', () => ({ useAuth: () => angemeldet }));

function zeige() {
  return render(
    <ToastProvider>
      <MaterialCatalog />
    </ToastProvider>,
  );
}

beforeEach(() => {
  materialien = [];
  angemeldet = VERWALTUNG;
  anlegen.mockReset();
  anlegen.mockResolvedValue('m1');
  aendern.mockReset();
  aendern.mockResolvedValue(undefined);
});

describe('Der Einkaufspreis', () => {
  it('steht der Geschäftsführung offen', async () => {
    angemeldet = CHEF;
    zeige();
    expect(await screen.findByLabelText(/Einkaufspreis/)).toBeInTheDocument();
  });

  it('wird der Verwaltung gar nicht angeboten', async () => {
    zeige();
    // Der Verkaufspreis ist da — es fehlt nicht das Formular, sondern das Feld.
    expect(await screen.findByLabelText(/Verkaufspreis/)).toBeInTheDocument();
    expect(screen.queryByLabelText(/Einkaufspreis/)).not.toBeInTheDocument();
  });

  it('geht mit, wenn die Geschäftsführung ihn einträgt', async () => {
    angemeldet = CHEF;
    const nutzer = userEvent.setup();
    zeige();

    await nutzer.type(await screen.findByLabelText(/Bezeichnung/), 'Eckventil');
    await nutzer.type(screen.getByLabelText(/Einkaufspreis/), '3.5');
    await nutzer.click(screen.getByRole('button', { name: 'Material anlegen' }));

    await waitFor(() => expect(anlegen).toHaveBeenCalled());
    expect(anlegen.mock.calls[0][1]).toMatchObject({ name: 'Eckventil', einkaufspreis: 3.5 });
  });

  it('fehlt im Datensatz der Verwaltung ganz — nicht als 0', async () => {
    const nutzer = userEvent.setup();
    zeige();

    await nutzer.type(await screen.findByLabelText(/Bezeichnung/), 'Eckventil');
    await nutzer.click(screen.getByRole('button', { name: 'Material anlegen' }));

    await waitFor(() => expect(anlegen).toHaveBeenCalled());
    const daten = anlegen.mock.calls[0][1] as Record<string, unknown>;
    // `toMatchObject` würde ein mitgeschicktes Feld übersehen: der Schlüssel
    // selbst ist hier der Fehler, nicht sein Wert.
    expect(Object.keys(daten)).not.toContain('einkaufspreis');
  });

  it('überschreibt beim Bearbeiten durch die Verwaltung keinen bestehenden Preis', async () => {
    // Der gefährlichste Fall: der Chef hat 3,50 hinterlegt, die Verwaltung
    // ändert die Kategorie. Ginge das Feld mit, wiese die Regel das Speichern
    // zurück — und ohne Regel stünde dort still eine 0.
    materialien = [
      { id: 'm1', companyId: 'perl', name: 'Eckventil', stock: 4, einkaufspreis: 3.5 } as WithId<Material>,
    ];
    const nutzer = userEvent.setup();
    zeige();

    await nutzer.click((await screen.findAllByRole('button', { name: 'Bearbeiten' }))[0]);
    await nutzer.type(screen.getByLabelText(/Kategorie/), 'Sanitär');
    await nutzer.click(screen.getByRole('button', { name: 'Änderungen speichern' }));

    await waitFor(() => expect(aendern).toHaveBeenCalled());
    const daten = aendern.mock.calls[0][1] as Record<string, unknown>;
    expect(Object.keys(daten)).not.toContain('einkaufspreis');
  });
});
