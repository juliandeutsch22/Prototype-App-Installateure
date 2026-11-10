import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { ToastProvider } from '@/components/Toast';
import type { Auftragseingang } from '@/types';

/**
 * DAS FORMULAR EINES EINGANGS (M02b, A11): Pflicht sind Quelle, Kunde (ein
 * vorhandener oder der Name eines neuen) und Anliegen — ohne sie wird nichts
 * geschickt, und ein Satz sagt, was fehlt. Der Ort ist ohne Angabe die
 * Anschrift des Kunden. Ändern schickt dieselben Felder an den Eingang.
 *
 * Gegenprobe: ohne `EingangFormular.tsx` gibt es nichts zu zeigen — rot.
 */

const eingangAnlegen = vi.fn<(c: string, d: Record<string, unknown>) => Promise<string>>(async () => 'e-neu');
const eingangAendern = vi.fn<(id: string, d: Record<string, unknown>) => Promise<undefined>>(async () => undefined);
vi.mock('@/lib/db/auftragseingaenge', () => ({
  eingangAnlegen: (c: string, d: Record<string, unknown>) => eingangAnlegen(c, d),
  eingangAendern: (id: string, d: Record<string, unknown>) => eingangAendern(id, d),
}));
const HUBER = { id: 'k1', companyId: 'perl', name: 'Familie Huber', address: 'Hauptplatz 1, 8010 Graz', active: true };
vi.mock('@/lib/db/customers', () => ({
  searchCustomers: vi.fn(async () => [HUBER]),
  listCustomersByIds: vi.fn(async () => [HUBER]),
}));

const LIEGENSCHAFT = { id: 'l1', companyId: 'perl', bezeichnung: 'WHA Hauptstraße 12', anschrift: 'Hauptstraße 12, 1010 Wien', aktiv: true };
vi.mock('@/lib/db/liegenschaften', () => ({
  listLiegenschaften: vi.fn(async () => ({ zeilen: [LIEGENSCHAFT], weiter: null })),
  getLiegenschaft: vi.fn(async () => LIEGENSCHAFT),
  listTops: vi.fn(async () => [{ id: 't2', companyId: 'perl', liegenschaftId: 'l1', bezeichnung: 'Top 2', aktiv: true }]),
}));

const { default: EingangFormular } = await import('@/features/auftragseingang/EingangFormular');

const JETZT = new Date(2026, 10, 7, 9, 14).getTime();
const gespeichert = vi.fn();
const zeige = (eingang?: Auftragseingang) => render(
  <MemoryRouter>
    <ToastProvider>
      <EingangFormular companyId="perl" eingang={eingang} jetzt={JETZT} onGespeichert={gespeichert} onAbbrechen={vi.fn()} />
    </ToastProvider>
  </MemoryRouter>,
);

beforeEach(() => {
  eingangAnlegen.mockClear();
  eingangAendern.mockClear();
  gespeichert.mockClear();
});

describe('Pflichtangaben', () => {
  it('ohne Quelle, Kunde und Anliegen wird nichts geschickt — ein Satz sagt, was fehlt', async () => {
    const nutzer = userEvent.setup();
    zeige();
    await nutzer.click(screen.getByRole('button', { name: 'Eingang erfassen' }));
    expect(await screen.findByText(/woher der Eingang kam/)).toBeInTheDocument();
    await nutzer.selectOptions(screen.getByLabelText(/Quelle/), 'telefon');
    await nutzer.click(screen.getByRole('button', { name: 'Eingang erfassen' }));
    expect(await screen.findByText(/einen Kunden wählen/)).toBeInTheDocument();
    await nutzer.click(screen.getByRole('button', { name: 'Neuer Kunde' }));
    await nutzer.type(screen.getByLabelText(/^Name/), 'Familie Neu');
    await nutzer.click(screen.getByRole('button', { name: 'Eingang erfassen' }));
    expect(await screen.findByText(/das Anliegen beschreiben/)).toBeInTheDocument();
    expect(eingangAnlegen).not.toHaveBeenCalled();
  });
});

describe('Erfassen', () => {
  it('mit einem neuen Kunden: seine Angaben gehen mit, der Ort ist seine Anschrift, eingegangen jetzt', async () => {
    const nutzer = userEvent.setup();
    zeige();
    await nutzer.selectOptions(screen.getByLabelText(/Quelle/), 'hausverwaltung');
    await nutzer.selectOptions(screen.getByLabelText('Dringlichkeit'), 'dringend');
    await nutzer.type(screen.getByLabelText(/Schadensnummer/), 'HV-2026-17');
    await nutzer.click(screen.getByRole('button', { name: 'Neuer Kunde' }));
    await nutzer.type(screen.getByLabelText(/^Name/), 'Familie Neu');
    await nutzer.type(screen.getByLabelText('Straße'), 'Neugasse 3');
    await nutzer.type(screen.getByLabelText('PLZ'), '1010');
    await nutzer.type(screen.getByLabelText('Ort'), 'Wien');
    await nutzer.type(screen.getByLabelText('Telefon'), '0664 9');
    await nutzer.type(screen.getByLabelText('Ansprechpartner vor Ort'), 'Hr. Hausmeister');
    await nutzer.type(screen.getByLabelText('Anliegen'), 'Wasserfleck an der Decke');
    await nutzer.click(screen.getByRole('button', { name: 'Eingang erfassen' }));
    await waitFor(() => expect(eingangAnlegen).toHaveBeenCalledTimes(1));
    expect(eingangAnlegen.mock.calls[0][1]).toEqual({
      quelle: 'hausverwaltung', auftraggeberNummer: 'HV-2026-17', customerId: null,
      neukundeName: 'Familie Neu', neukundeStrasse: 'Neugasse 3', neukundePlz: '1010', neukundeOrt: 'Wien',
      neukundeTelefon: '0664 9', neukundeEmail: '', ort: 'Neugasse 3, 1010 Wien',
      ansprechpartnerName: 'Hr. Hausmeister', ansprechpartnerTelefon: '', anliegen: 'Wasserfleck an der Decke',
      dringlichkeit: 'dringend', wunschtermin: null, eingegangenAm: JETZT,
    });
    expect(gespeichert).toHaveBeenCalledWith('e-neu');
  });

  it('mit einem vorhandenen Kunden: der Ort steht als seine Anschrift vor und bleibt änderbar', async () => {
    const nutzer = userEvent.setup();
    zeige();
    await nutzer.selectOptions(screen.getByLabelText(/Quelle/), 'telefon');
    await nutzer.type(screen.getByRole('searchbox', { name: /^Kunde/ }), 'Hub');
    await nutzer.click(await screen.findByRole('button', { name: /Familie Huber/ }));
    expect(screen.getByLabelText('Ort des Einsatzes')).toHaveValue('Hauptplatz 1, 8010 Graz');
    await nutzer.clear(screen.getByLabelText('Ort des Einsatzes'));
    await nutzer.type(screen.getByLabelText('Ort des Einsatzes'), 'Ferienhaus, 8970 Schladming');
    await nutzer.type(screen.getByLabelText('Anliegen'), 'Therme störung');
    await nutzer.click(screen.getByRole('button', { name: 'Eingang erfassen' }));
    await waitFor(() => expect(eingangAnlegen).toHaveBeenCalledTimes(1));
    expect(eingangAnlegen.mock.calls[0][1]).toMatchObject({
      customerId: 'k1', neukundeName: null, ort: 'Ferienhaus, 8970 Schladming', dringlichkeit: 'normal',
    });
  });
});

describe('Ändern', () => {
  it('trägt den Stand ein und schickt die Änderung an denselben Eingang', async () => {
    const nutzer = userEvent.setup();
    const E: Auftragseingang = {
      id: 'e1', companyId: 'perl', nummer: 'EG-2026-0003', stand: 'offen', quelle: 'email', customerId: 'k1',
      kundeName: 'Familie Huber', anliegen: 'Tropft', dringlichkeit: 'normal', eingegangenAm: JETZT, ort: 'Hauptplatz 1, 8010 Graz',
    };
    zeige(E);
    expect(screen.getByLabelText('Anliegen')).toHaveValue('Tropft');
    expect(await screen.findByText('Familie Huber')).toBeInTheDocument();
    await nutzer.selectOptions(screen.getByLabelText('Dringlichkeit'), 'notfall');
    await nutzer.click(screen.getByRole('button', { name: 'Änderung speichern' }));
    await waitFor(() => expect(eingangAendern).toHaveBeenCalledTimes(1));
    expect(eingangAendern.mock.calls[0][0]).toBe('e1');
    expect(eingangAendern.mock.calls[0][1]).toMatchObject({ dringlichkeit: 'notfall', customerId: 'k1', quelle: 'email' });
    expect(gespeichert).toHaveBeenCalledWith('e1');
  });
});

/*
  LIEGENSCHAFT UND TOP AM EINGANG (M02c): nur, wenn die Seite es sagt (die
  Unterfähigkeit); die Anschrift der Liegenschaft wird zum Ort, wenn er leer
  ist; gespeichert werden beide Kennungen. Ohne Unterfähigkeit kein Feld und
  keine Angabe (die Fälle oben, unverändert).
*/
describe('Liegenschaft und Top (M02c)', () => {
  it('wählen, der Ort aus der Liegenschaft, beide Kennungen gehen mit', async () => {
    const nutzer = userEvent.setup();
    render(
      <MemoryRouter>
        <ToastProvider>
          <EingangFormular companyId="perl" jetzt={JETZT} mitLiegenschaft onGespeichert={gespeichert} onAbbrechen={vi.fn()} />
        </ToastProvider>
      </MemoryRouter>,
    );
    await nutzer.selectOptions(screen.getByLabelText(/Quelle/), 'hausverwaltung');
    await nutzer.type(screen.getByRole('searchbox', { name: /^Kunde/ }), 'Hub');
    await nutzer.click(await screen.findByRole('button', { name: /Familie Huber/ }));
    await nutzer.clear(screen.getByLabelText('Ort des Einsatzes'));
    await nutzer.type(screen.getByRole('searchbox', { name: 'Liegenschaft (freiwillig)' }), 'Haupt');
    await nutzer.click(await screen.findByRole('button', { name: 'WHA Hauptstraße 12' }));
    expect(screen.getByLabelText('Ort des Einsatzes')).toHaveValue('Hauptstraße 12, 1010 Wien');
    await nutzer.selectOptions(await screen.findByLabelText('Top'), 'Top 2');
    await nutzer.type(screen.getByLabelText('Anliegen'), 'Wasser im Keller');
    await nutzer.click(screen.getByRole('button', { name: 'Eingang erfassen' }));
    await waitFor(() => expect(eingangAnlegen).toHaveBeenCalledTimes(1));
    expect(eingangAnlegen.mock.calls[0][1]).toMatchObject({ liegenschaftId: 'l1', topId: 't2', ort: 'Hauptstraße 12, 1010 Wien' });
  });

  it('ohne Unterfähigkeit kein Feld', () => {
    zeige();
    expect(screen.queryByRole('searchbox', { name: 'Liegenschaft (freiwillig)' })).toBeNull();
  });
});

/*
  E72 (09.11.2026), D9: zugeklappt stand „Eingegangen am 2026-11-07, 09:14“ —
  das Feldformat. Gegenprobe: mit `f.eingegangenAm.replace('T', ', ')` steht
  die ISO-Form da, und die Prüfung schlägt fehl.
*/
describe('Eingegangen am (E72)', () => {
  it('steht zugeklappt österreichisch da: Tag.Monat.Jahr, Uhrzeit', () => {
    zeige();
    expect(screen.getByText(/07\.11\.2026, 09:14/)).toBeInTheDocument();
    expect(screen.queryByText(/2026-11-07/)).toBeNull();
  });
});
