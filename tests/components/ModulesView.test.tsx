import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ToastProvider } from '@/components/Toast';
import type { Company } from '@/types';

/**
 * Die Modulverwaltung — die Ansicht, mit der man dem ganzen Betrieb den Weg
 * zu seiner Arbeit nehmen kann.
 *
 * Ein abgeschaltetes Modul verschwindet aus der Navigation, und seine
 * Adressen sind zu. Das ist gewollt; gefährlich ist nur, es aus Versehen zu
 * tun. Zwei Dinge müssen deshalb stimmen, und beide prüft diese Datei:
 *
 *   1. Was MIT abgeschaltet wird, steht VORHER da. Die Nachkalkulation
 *      braucht die Rechnungen — wer sie abschaltet und das erst hinterher
 *      merkt, ist überrascht, und Überraschung ist bei Einstellungen das
 *      Gegenteil von Kontrolle.
 *   2. Ein Schalter, der nichts bewirken kann, ist gesperrt UND begründet.
 */

const updateCompany = vi.fn<[string, Record<string, unknown>], Promise<void>>(
  async () => undefined,
);
vi.mock('@/lib/db/company', () => ({
  updateCompany: (id: string, daten: Record<string, unknown>) => updateCompany(id, daten),
}));

let firma: Partial<Company> = { id: 'perl', name: 'Perl Installationen' };

const NUTZER = {
  uid: 'admin',
  email: 'admin@perl.at',
  name: 'Julian Deutsch',
  role: 'Administrator' as const,
  companyId: 'perl',
  docId: 'admin',
};
const reloadCompany = vi.fn();
vi.mock('@/app/AuthContext', () => ({
  useAuth: () => ({ user: NUTZER, company: firma, reloadCompany }),
}));

const { default: ModulesView } = await import('@/features/modules/ModulesView');

function zeige() {
  return render(
    <ToastProvider>
      <ModulesView />
    </ToastProvider>,
  );
}

/** Der Schalter eines Moduls — heisst je nach Zustand anders. */
const schalter = (name: string) =>
  screen.getByRole('checkbox', { name: new RegExp(`^${name} (ein|aus)schalten$`) });

beforeEach(() => {
  updateCompany.mockClear();
  reloadCompany.mockClear();
  firma = { id: 'perl', name: 'Perl Installationen' };
});

describe('Die Liste', () => {
  it('zeigt, was ein Modul betrifft — nicht nur seinen Namen', async () => {
    // „Material und Lager" sagt niemandem, dass damit drei Reiter
    // verschwinden. Die Aufzählung tut es.
    zeige();
    expect(screen.getByText(/Betrifft: Material bestellen, Anforderungen, Lager/))
      .toBeInTheDocument();
  });

  it('zählt, wie viele eingeschaltet sind', async () => {
    zeige();
    // Ohne Festlegung gelten die Standards; die KI-Erfassung ist ohne
    // hinterlegte Zugänge nicht verfügbar und zählt deshalb nicht mit.
    expect(screen.getByText(/^Eingeschaltet: \d+ von \d+$/)).toBeInTheDocument();
  });

  it('sperrt einen Schalter, der nichts bewirken kann — und sagt warum', async () => {
    /*
      Die KI-Erfassung braucht hinterlegte Zugänge. Ohne sie führt der Knopf
      nur in eine Fehlermeldung; ein Schalter, der nichts tut, ist schlimmer
      als keiner. Deshalb gesperrt UND begründet.
    */
    zeige();
    expect(schalter('KI-Spracherfassung')).toBeDisabled();
    expect(screen.getByText('nicht eingerichtet')).toBeInTheDocument();
    expect(screen.getByText(/ohne hinterlegte Zugänge führt dieser Bereich/))
      .toBeInTheDocument();
  });
});

describe('Ein Modul abschalten', () => {
  it('fragt vorher, wenn etwas mitgeht', async () => {
    /*
      DER KERN. Die Nachkalkulation hängt an den Rechnungen. Wer die
      Rechnungen abschaltet, verliert beide — und soll das vorher erfahren,
      nicht danach.
    */
    const nutzer = userEvent.setup();
    zeige();
    await nutzer.click(schalter('Rechnungen'));

    const dialog = await screen.findByRole('dialog');
    expect(within(dialog).getByText(/Rechnungen ausschalten\?/)).toBeInTheDocument();
    expect(within(dialog).getByText(/Nachkalkulation/)).toBeInTheDocument();
    // Und noch ist nichts geschaltet.
    expect(schalter('Rechnungen')).toBeChecked();
  });

  it('sagt im selben Atemzug, dass die Daten bleiben', async () => {
    // Ohne diesen Satz traut sich niemand, etwas abzuschalten — dann wäre
    // die ganze Einstellung für nichts da.
    const nutzer = userEvent.setup();
    zeige();
    await nutzer.click(schalter('Rechnungen'));
    const dialog = await screen.findByRole('dialog');
    expect(within(dialog).getByText(/Daten bleiben in beiden Fällen erhalten/))
      .toBeInTheDocument();
  });

  it('schaltet erst nach der Bestätigung', async () => {
    const nutzer = userEvent.setup();
    zeige();
    await nutzer.click(schalter('Rechnungen'));
    const dialog = await screen.findByRole('dialog');
    await nutzer.click(within(dialog).getByRole('button', { name: 'Ausschalten' }));

    expect(schalter('Rechnungen')).not.toBeChecked();
    // Die Nachkalkulation ist mitgegangen und lässt sich nicht einzeln zurückholen.
    expect(schalter('Nachkalkulation')).not.toBeChecked();
    expect(schalter('Nachkalkulation')).toBeDisabled();
  });

  it('und gar nicht, wenn man abbricht', async () => {
    const nutzer = userEvent.setup();
    zeige();
    await nutzer.click(schalter('Rechnungen'));
    const dialog = await screen.findByRole('dialog');
    await nutzer.click(within(dialog).getByRole('button', { name: /Abbrechen/i }));

    expect(schalter('Rechnungen')).toBeChecked();
  });

  it('fragt NICHT, wenn nichts mitgeht', async () => {
    // Eine Rückfrage, die immer kommt, wird weggeklickt — und dann fehlt sie
    // bei der einen, die zählt.
    const nutzer = userEvent.setup();
    zeige();
    await nutzer.click(schalter('Urlaub'));

    expect(screen.queryByRole('dialog')).toBeNull();
    expect(schalter('Urlaub')).not.toBeChecked();
  });
});

describe('Speichern', () => {
  it('bleibt gesperrt, solange nichts geändert ist', async () => {
    zeige();
    expect(screen.getByRole('button', { name: 'Module speichern' })).toBeDisabled();
    expect(screen.getByText('Keine Änderung offen.')).toBeInTheDocument();
  });

  it('schreibt den ganzen Entwurf, nicht nur die Änderung', async () => {
    const nutzer = userEvent.setup();
    zeige();
    await nutzer.click(schalter('Urlaub'));
    await nutzer.click(screen.getByRole('button', { name: 'Module speichern' }));

    expect(updateCompany).toHaveBeenCalledWith('perl', { modules: { urlaub: false } });
  });

  it('lässt den Entwurf verwerfen', async () => {
    const nutzer = userEvent.setup();
    zeige();
    await nutzer.click(schalter('Urlaub'));
    expect(schalter('Urlaub')).not.toBeChecked();

    await nutzer.click(screen.getByRole('button', { name: 'Verwerfen' }));
    expect(schalter('Urlaub')).toBeChecked();
    expect(updateCompany).not.toHaveBeenCalled();
  });
});
