import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ToastProvider } from '@/components/Toast';
import SupportzugangView from '@/features/settings/SupportzugangView';
import Supportband from '@/components/Supportband';

/**
 * Einblick gewähren, beenden — und das Band, das jeder sieht.
 *
 * DAS BAND IST DER TEIL, DER DEN UNTERSCHIED MACHT. Ein Supportzugang, von
 * dem der Betrieb nichts merkt, ist ein Generalschlüssel mit Protokoll. Die
 * Prüfungen hier fragen deshalb vor allem, ob es da ist, wenn es da sein
 * muss — und ob es verschwindet, wenn es verschwinden muss.
 */

let vorhanden: Array<Record<string, unknown>> = [];
let angesehen: Array<Record<string, unknown>> = [];
const geben = vi.fn();
const widerrufen = vi.fn();

vi.mock('@/lib/db/support', async (echt) => {
  const e = await echt<Record<string, unknown>>();
  return {
    ...e,
    freigaben: vi.fn(async () => vorhanden),
    bereiche: vi.fn(async () => angesehen),
    freigabeGeben: (...a: unknown[]) => geben(...a),
    freigabeWiderrufen: (...a: unknown[]) => widerrufen(...a),
  };
});

const authWert = {
  user: { uid: 'g1', companyId: 'perl', name: 'Chefin', role: 'Geschäftsführung' as const },
  company: { id: 'perl', name: 'Perl Installationen' },
};
vi.mock('@/app/AuthContext', () => ({ useAuth: () => authWert }));

const inStunden = (n: number) => Date.now() + n * 3_600_000;

const freigabe = (p: Record<string, unknown> = {}) => ({
  id: 'f1', companyId: 'perl', gewaehrtVon: 'g1', grund: 'Rechnung RE-2026-0042',
  notzugang: false, giltBis: inStunden(4), widerrufenAm: null, createdAt: Date.now(),
  ...p,
});

function zeige() {
  return render(
    <ToastProvider>
      <SupportzugangView />
    </ToastProvider>,
  );
}

beforeEach(() => {
  vorhanden = [];
  angesehen = [];
  geben.mockReset().mockResolvedValue('neu');
  widerrufen.mockReset().mockResolvedValue(undefined);
});

describe('Einblick gewähren', () => {
  it('verlangt einen Grund, bevor überhaupt gewährt werden kann', async () => {
    /*
      OHNE GRUND KEINE FREIGABE — die Datenbank weist sie ohnehin ab. Den
      Knopf trotzdem anzubieten hiesse, den Fehler mit einer
      Datenbankmeldung zu beantworten.
    */
    zeige();
    expect(await screen.findByRole('button', { name: 'Einblick gewähren' })).toBeDisabled();
    await userEvent.type(screen.getByLabelText('Wofür'), 'Rechnung stimmt nicht');
    expect(screen.getByRole('button', { name: 'Einblick gewähren' })).toBeEnabled();
  });

  it('gibt Grund und Dauer so weiter, wie sie dastehen', async () => {
    zeige();
    await userEvent.type(await screen.findByLabelText('Wofür'), 'Rechnung stimmt nicht');
    await userEvent.selectOptions(screen.getByLabelText('Wie lange'), '4');
    await userEvent.click(screen.getByRole('button', { name: 'Einblick gewähren' }));

    await waitFor(() => expect(geben).toHaveBeenCalled());
    expect(geben).toHaveBeenCalledWith('perl', 'g1', 'Rechnung stimmt nicht', 4);
  });

  it('zeigt statt des Formulars den offenen Zugang, sobald einer gilt', async () => {
    // Zwei Freigaben nebeneinander wären eine Frage, die niemand gestellt
    // hat. Solange eine offen ist, gibt es nur sie und den Weg, sie zu
    // beenden.
    vorhanden = [freigabe()];
    zeige();
    expect(await screen.findByText('Ein Zugang ist offen')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Einblick gewähren' })).toBeNull();
    expect(screen.getByRole('button', { name: 'Zugang sofort beenden' })).toBeInTheDocument();
  });

  it('behandelt eine abgelaufene Freigabe wie keine', async () => {
    vorhanden = [freigabe({ giltBis: Date.now() - 1000 })];
    zeige();
    expect(await screen.findByRole('button', { name: 'Einblick gewähren' })).toBeInTheDocument();
  });

  it('behandelt eine widerrufene Freigabe wie keine', async () => {
    vorhanden = [freigabe({ widerrufenAm: Date.now() - 1000 })];
    zeige();
    expect(await screen.findByRole('button', { name: 'Einblick gewähren' })).toBeInTheDocument();
  });

  it('beendet den Zugang auf Tastendruck', async () => {
    vorhanden = [freigabe()];
    zeige();
    await userEvent.click(await screen.findByRole('button', { name: 'Zugang sofort beenden' }));
    await waitFor(() => expect(widerrufen).toHaveBeenCalledWith('f1', 'g1'));
  });

  it('nennt einen Notzugang beim Namen', async () => {
    /*
      Er kommt nicht vom Betrieb. Ihn wie eine gewöhnliche Freigabe
      darzustellen hiesse, dem Betrieb zu unterstellen, er habe ihn selbst
      erteilt.
    */
    vorhanden = [freigabe({ notzugang: true, gewaehrtVon: null, grund: 'Ausgesperrt' })];
    zeige();
    expect(
      await screen.findByText(/Notzugang — vom Support geöffnet/),
    ).toBeInTheDocument();
  });
});

describe('Das Band über der App', () => {
  it('erscheint nicht, solange niemand Einblick hat', async () => {
    vorhanden = [];
    const { container } = render(<Supportband />);
    await waitFor(() => expect(container).toBeEmptyDOMElement());
  });

  it('erscheint mit dem Grund, solange ein Zugang offen ist', async () => {
    /*
      JEDER IM BETRIEB SIEHT ES, nicht nur die Chefin. Gewährt hat den Zugang
      die Führung; betroffen ist der ganze Betrieb — ein Monteur, dessen
      Schein gerade jemand von aussen ansieht, soll das wissen können, ohne
      jemanden zu fragen.
    */
    vorhanden = [freigabe()];
    render(<Supportband />);
    expect(await screen.findByRole('status')).toHaveTextContent(/Support hat gerade Einblick/);
    expect(screen.getByRole('status')).toHaveTextContent(/RE-2026-0042/);
  });

  it('erscheint nicht bei einer abgelaufenen Freigabe', async () => {
    vorhanden = [freigabe({ giltBis: Date.now() - 1000 })];
    const { container } = render(<Supportband />);
    await waitFor(() => expect(container).toBeEmptyDOMElement());
  });

  it('kennzeichnet den Notzugang auch im Band', async () => {
    vorhanden = [freigabe({ notzugang: true, gewaehrtVon: null })];
    render(<Supportband />);
    expect(await screen.findByRole('status')).toHaveTextContent(/Notzugang/);
  });

  it('behauptet nichts, wenn die Abfrage scheitert', async () => {
    /*
      Ein Band, das bei jedem Wackler „Support sieht mit" behauptet, wäre
      schlimmer als keines — beim dritten Mal glaubt es niemand mehr, und
      beim vierten ist es echt.
    */
    const support = await import('@/lib/db/support');
    vi.mocked(support.freigaben).mockRejectedValueOnce(new Error('kein Netz'));
    const { container } = render(<Supportband />);
    await waitFor(() => expect(container).toBeEmptyDOMElement());
  });
});

describe('Was in einem Zugang angesehen wurde', () => {
  /*
    EINE ZEILE JE ZUGANG, NICHT JE KLICK. Hier stand eine Aufzählung der
    einzelnen Aufrufe; zwei Minuten Support ergaben vierzehn Zeilen. Der
    Betrieb fragt aber nicht „welche Klicks", sondern „was hat der Support in
    diesem Zugang gesehen".
  */
  it('fasst die Aufrufe je Bereich zusammen', async () => {
    vorhanden = [freigabe({ widerrufenAm: Date.now(), giltBis: inStunden(-1) })];
    angesehen = [
      { freigabe_id: 'f1', bereich: 'Rechnungen', anzahl: 3, zuletzt: new Date().toISOString() },
      { freigabe_id: 'f1', bereich: 'Baustellen', anzahl: 1, zuletzt: new Date().toISOString() },
    ];
    render(
      <ToastProvider>
        <SupportzugangView />
      </ToastProvider>,
    );

    await screen.findByText(/Rechnungen 3×/);
    expect(screen.getByText(/Baustellen 1×/)).toBeInTheDocument();
  });

  it('sagt ausdrücklich, wenn nichts angesehen wurde', async () => {
    /*
      „Nichts angesehen" ist die beruhigendste Aussage von allen: gewährt,
      aber nie benutzt. Sie wegzulassen hiesse, sie mit „noch nicht geladen"
      zu verwechseln.
    */
    vorhanden = [freigabe({ widerrufenAm: Date.now(), giltBis: inStunden(-1) })];
    angesehen = [];
    render(
      <ToastProvider>
        <SupportzugangView />
      </ToastProvider>,
    );

    await screen.findByText('Nichts angesehen.');
  });
});
