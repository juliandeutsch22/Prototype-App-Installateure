import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { ToastProvider } from '@/components/Toast';
import { SeitenHilfeProvider } from '@/components/SeitenHilfe';
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
 *   2. Kein Modul behauptet eine Voraussetzung, die es nicht gibt.
 */

const updateCompany = vi.fn<(a0: string, a1: Record<string, unknown>) => Promise<void>>(
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
    // Im Router wie in der App: die Warnung vor ungespeicherten Änderungen (M1) navigiert.
    <MemoryRouter>
      <ToastProvider>
        <ModulesView />
      </ToastProvider>
    </MemoryRouter>,
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
    expect(screen.getByText(/Betrifft: Material anfordern, Anforderungen, Lager/))
      .toBeInTheDocument();
  });

  it('zählt, wie viele eingeschaltet sind', async () => {
    zeige();
    // Ohne Festlegung gelten die Standardwerte der Module.
    expect(screen.getByText(/^Eingeschaltet: \d+ von \d+$/)).toBeInTheDocument();
  });

  it('führt kein Modul mehr, das technisch nicht einrichtbar wäre', () => {
    /*
      HIER STAND DIE KI-SPRACHERFASSUNG. Sie brauchte hinterlegte Zugänge zu
      zwei fremden Diensten; ohne sie führte der Schalter nur in eine
      Fehlermeldung, also war er gesperrt und begründet — „nicht
      eingerichtet".

      Sie ist am 19.09.2026 ersatzlos entfernt worden, und mit ihr der dritte
      Zustand. Diese Zeile bleibt als AUSSAGE stehen: solange kein Modul eine
      Voraussetzung hat, darf auch keine Oberfläche dafür da sein. Eine
      gesperrte Schaltfläche ohne Modul, das sie sperrt, wäre ein Versprechen
      ohne Gegenstand.
    */
    zeige();
    expect(screen.queryByText('nicht eingerichtet')).toBeNull();
    expect(screen.queryByText(/ohne hinterlegte Zugänge/)).toBeNull();
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

describe('Was sich nicht zurückholen lässt (M01a, E52)', () => {
  it('fragt vor dem Abschalten der Einsatzplanung — die Kalender-Abos des ganzen Plans enden', async () => {
    /*
      Vorher schaltete die Einsatzplanung ohne Rückfrage aus, weil kein
      anderes Modul mitging. Der Server beendet dabei aber die Abos des
      Gesamtplans, und die Seite versprach „Daten bleiben unangetastet“.
    */
    const nutzer = userEvent.setup();
    zeige();
    await nutzer.click(schalter('Einsatzplanung'));

    const dialog = await screen.findByRole('dialog');
    expect(within(dialog).getByText(/Kalender-Abos des ganzen Einsatzplans enden/)).toBeInTheDocument();
    // Nur die ÜBRIGEN Daten bleiben — und „in beiden Fällen“ stimmt hier nicht, es geht nichts mit.
    expect(within(dialog).getByText(/Alle übrigen Daten bleiben erhalten/)).toBeInTheDocument();
    expect(within(dialog).queryByText(/in beiden Fällen/)).toBeNull();
    expect(schalter('Einsatzplanung')).toBeChecked();
  });

  it('sagt in der Hilfe, dass die Rückfrage solche Ausnahmen nennt, und wer die Liste ändern darf', async () => {
    // Wie im Layout: die Hilfe der Seite gesammelt hinter dem Zeichen im Kopf.
    render(
      <MemoryRouter>
        <ToastProvider>
          <SeitenHilfeProvider>
            <ModulesView />
          </SeitenHilfeProvider>
        </ToastProvider>
      </MemoryRouter>,
    );
    await userEvent.click(await screen.findByRole('button', { name: 'Hilfe zu dieser Seite' }));
    const text = (await screen.findByRole('dialog')).textContent ?? '';
    expect(text).toMatch(/nennt die Rückfrage vor dem\s+Abschalten/);
    // Der Server lässt nur den Administrator die Module schalten; die Hilfe sagte „Geschäftsführung“.
    expect(text).toMatch(/ändern darf sie nur der Administrator/);
    expect(text).not.toMatch(/ändern darf sie nur die Geschäftsführung/);
    /*
      E56, V3: bestehende Wege blendet ein Modul nur aus; neue Befehle prüft
      der Server. Vorher hieß es pauschal „Sie nehmen den Weg weg, nicht das
      Recht“ — für den Annahme-Link und den Auftragseingang stimmte das nicht.
    */
    expect(text).toMatch(/bestehenden Bereichen\s+nimmt ein Modul nur den Weg weg/);
    expect(text).toMatch(/prüft dagegen auch der Server: ausgeschaltet sind\s+sie auch über die Schnittstelle gesperrt/);
    expect(text).not.toMatch(/Module sind keine Rechteverwaltung/);
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

/*
  DER KERN AUF DER SEITE „MODULE“ (M02b): Baustellen und Kunden stehen als
  „immer an“ ohne Schalter da; ihre Teile — als erster der
  Auftragseingang — schaltet der Administrator wie die eines Moduls, und
  gespeichert wird unter ihrer Kennung. Die Zahl der Module bleibt neun.
*/
describe('Immer an: der Kern mit seinen Teilen (M02b)', () => {
  it('Baustellen und Kunden stehen da — ohne Schalter, nicht unter den neun Modulen', () => {
    zeige();
    const kern = screen.getByText('Immer an').closest('section') as HTMLElement;
    expect(within(kern).getByText('Baustellen')).toBeInTheDocument();
    expect(within(kern).getByText('Kunden')).toBeInTheDocument();
    expect(within(kern).getAllByText('immer an')).toHaveLength(2);
    expect(screen.queryByRole('checkbox', { name: /^Baustellen (ein|aus)schalten$/ })).toBeNull();
    expect(screen.queryByRole('checkbox', { name: /^Kunden (ein|aus)schalten$/ })).toBeNull();
    expect(screen.getByText(/^Eingeschaltet: \d+ von 9$/)).toBeInTheDocument();
  });

  it('der Auftragseingang steht als Teil der Baustellen und wird unter seiner Kennung gespeichert', async () => {
    const nutzer = userEvent.setup();
    zeige();
    expect(schalter('Auftragseingang')).toBeChecked();
    expect(screen.getByText('Teil von Baustellen')).toBeInTheDocument();
    // Keine Folge, die sich nicht zurückholen ließe — also keine Rückfrage.
    await nutzer.click(schalter('Auftragseingang'));
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(schalter('Auftragseingang')).not.toBeChecked();
    await nutzer.click(screen.getByRole('button', { name: 'Module speichern' }));
    expect(updateCompany).toHaveBeenCalledWith('perl', { modules: { 'baustellen.auftragseingang': false } });
  });

  it('eine gespeicherte Festlegung des Kerns selbst schaltet nichts ab', () => {
    firma = { id: 'perl', name: 'Perl Installationen', modules: { baustellen: false } };
    zeige();
    expect(schalter('Auftragseingang')).toBeChecked();
    expect(schalter('Auftragseingang')).not.toBeDisabled();
  });
});

/*
  LIEGENSCHAFTEN (M02c): die erste Unterfähigkeit der Kunden, „Optional“ und
  ab Werk aus. Sie steht als Teil der Kunden da und wird unter ihrer
  Kennung gespeichert; keine Rückfrage — nichts geht verloren.
*/
describe('Liegenschaften als Teil der Kunden (M02c)', () => {
  it('steht aus da und wird eingeschaltet unter ihrer Kennung gespeichert', async () => {
    const nutzer = userEvent.setup();
    zeige();
    expect(schalter('Liegenschaften und Tops')).not.toBeChecked();
    expect(screen.getByText('Teil von Kunden')).toBeInTheDocument();
    await nutzer.click(schalter('Liegenschaften und Tops'));
    expect(screen.queryByRole('dialog')).toBeNull();
    await nutzer.click(screen.getByRole('button', { name: 'Module speichern' }));
    expect(updateCompany).toHaveBeenCalledWith('perl', { modules: { 'kunden.liegenschaften': true } });
  });
});
