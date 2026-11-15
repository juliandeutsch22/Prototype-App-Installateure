import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, within, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { ToastProvider } from '@/components/Toast';
import type { InventurVorschau, ZaehllisteVoll, ZaehllistenZeile } from '@/lib/db/inventur';

/**
 * Eine Zählliste der Inventur (Durchsicht 15.11.2026, F14): zählen am Handy,
 * Abweichungen prüfen, in einem Zug buchen, danach das Protokoll.
 * Vorher ging Inventur nur Artikel für Artikel im Dialog.
 */

const zeile = (id: string, name: string, rest: Partial<ZaehllistenZeile> = {}): ZaehllistenZeile => ({
  id, materialId: `m-${id}`, name, artikelnummer: `A-${id}`, einheit: 'Stk', warengruppe: 'Rohre',
  gezaehlt: null, gezaehltAm: null, gezaehltVonName: null, ergebnis: null, soll: null, abweichung: null,
  bestandVorher: null, bestandNachher: null, grund: null, ...rest,
});

let liste: ZaehllisteVoll;
const OFFEN = (): ZaehllisteVoll => ({
  id: 'i1', ort: 'h', ortName: 'Fahrzeug W-1A', imHauptlager: false, bezeichnung: null, stichtag: null, zustand: 'offen',
  angelegtAm: Date.parse('2026-11-17T08:00:00Z'), angelegtVonName: 'Vera', gebuchtAm: null, gebuchtVonName: null,
  auswahl: { umfang: 'bestand' }, grund: null,
  zeilen: [zeile('z1', 'Muffe'), zeile('z2', 'Schelle'), zeile('z3', 'Band', { gezaehlt: 2, gezaehltAm: Date.parse('2026-11-17T08:10:00Z'), gezaehltVonName: 'Vera' })],
});

const vorschau = (rest: Partial<InventurVorschau> = {}): InventurVorschau => ({
  stichtag: null,
  stand: 's1',
  zeilen: [
    { zeile: 'z1', material: 'm-z1', name: 'Muffe', artikelnummer: null, einheit: 'Stk', gezaehlt: 5, zeitpunkt: 1, soll: 4, abweichung: 1, jetzt: 4, danach: 5, ueberholt: false, konflikt: null },
    { zeile: 'z2', material: 'm-z2', name: 'Schelle', artikelnummer: null, einheit: 'Stk', gezaehlt: null, zeitpunkt: null, soll: null, abweichung: null, jetzt: 6, danach: 6, ueberholt: false, konflikt: null },
    { zeile: 'z3', material: 'm-z3', name: 'Band', artikelnummer: null, einheit: 'Stk', gezaehlt: 2, zeitpunkt: 1, soll: 2, abweichung: 0, jetzt: 0, danach: 0, ueberholt: false, konflikt: null },
  ],
  ...rest,
});

const laden = vi.fn(async () => liste);
const zaehlen = vi.fn(async (_z: string, menge: number | null) => ({ gezaehlt: menge, gezaehltAm: Date.now(), gezaehltVonName: 'Vera' }));
const vorschauHolen = vi.fn(async () => vorschau());
const buchen = vi.fn<(...a: unknown[]) => Promise<unknown>>(async () => ({ art: 'gebucht', gebucht: 2, abweichend: 1, ueberholt: 0, nichtGezaehlt: 1 }));
const verwerfen = vi.fn(async () => undefined);

vi.mock('@/lib/db/inventur', () => ({
  inventurLaden: () => laden(),
  inventurZaehlen: (z: string, m: number | null) => zaehlen(z, m),
  inventurVorschau: () => vorschauHolen(),
  inventurBuchen: (...a: unknown[]) => buchen(...a),
  inventurVerwerfen: () => verwerfen(),
  inventurArtikelHinzufuegen: vi.fn(),
}));
vi.mock('@/lib/db/materials', () => ({ sucheKatalog: vi.fn(async () => []) }));
const NUTZER = { uid: 'v', name: 'Vera', role: 'Verwaltung', companyId: 'b', docId: 'v' };
vi.mock('@/app/AuthContext', () => ({ useAuth: () => ({ user: NUTZER, company: { id: 'b', name: 'Betrieb' } }) }));

const { default: ZaehllisteView } = await import('@/features/orders/ZaehllisteView');

function zeigen() {
  return render(
    <MemoryRouter initialEntries={['/lager/inventur/i1']}>
      <ToastProvider>
        <Routes>
          <Route path="/lager/inventur/:id" element={<ZaehllisteView />} />
          <Route path="/lager" element={<p>Lager</p>} />
        </Routes>
      </ToastProvider>
    </MemoryRouter>,
  );
}

beforeEach(() => {
  liste = OFFEN();
  zaehlen.mockClear();
  buchen.mockClear();
  vorschauHolen.mockClear();
});

describe('Zählliste (F14)', () => {
  it('zählt Zeile für Zeile: „Weiter“ speichert und springt zur nächsten', async () => {
    const nutzer = userEvent.setup();
    zeigen();
    const muffe = await screen.findByRole('textbox', { name: 'Muffe: gezählt in Stk' });
    await nutzer.click(muffe);
    await nutzer.type(muffe, '5{Enter}');
    await waitFor(() => expect(zaehlen).toHaveBeenCalledWith('z1', 5));
    expect(screen.getByRole('textbox', { name: 'Schelle: gezählt in Stk' })).toHaveFocus();
  });

  it('zählen mehrere zugleich: beim Zurückkommen auf die Seite kommt der Stand der anderen', async () => {
    const nutzer = userEvent.setup();
    zeigen();
    await screen.findByText('Muffe');
    await nutzer.click(within(screen.getByRole('group', { name: 'Zeilen' })).getByRole('button', { name: /Alle/ }));
    const vorher = laden.mock.calls.length;
    liste = { ...OFFEN(), zeilen: OFFEN().zeilen.map((z) => (z.id === 'z1' ? { ...z, gezaehlt: 7, gezaehltVonName: 'Paul', gezaehltAm: Date.now() } : z)) };
    window.dispatchEvent(new Event('focus'));
    await waitFor(() => expect(laden.mock.calls.length).toBe(vorher + 1));
    expect(await screen.findByDisplayValue('7')).toBeInTheDocument();
  });

  it('die ganze Zeile setzt den Cursor ins Zählfeld', async () => {
    const nutzer = userEvent.setup();
    zeigen();
    await nutzer.click(await screen.findByText('Schelle'));
    expect(screen.getByRole('textbox', { name: 'Schelle: gezählt in Stk' })).toHaveFocus();
  });

  it('eine unlesbare Zahl wird nicht gespeichert und an der Zeile gesagt', async () => {
    const nutzer = userEvent.setup();
    zeigen();
    const muffe = await screen.findByRole('textbox', { name: 'Muffe: gezählt in Stk' });
    await nutzer.type(muffe, 'zwei');
    await nutzer.tab();
    expect(await screen.findByRole('alert')).toBeInTheDocument();
    expect(zaehlen).not.toHaveBeenCalled();
  });

  it('ein geleertes Feld nimmt die Zählung zurück', async () => {
    const nutzer = userEvent.setup();
    zeigen();
    await nutzer.click(within(await screen.findByRole('group', { name: 'Zeilen' })).getByRole('button', { name: /Gezählt/ }));
    const band = screen.getByRole('textbox', { name: 'Band: gezählt in Stk' });
    await nutzer.clear(band);
    await nutzer.tab();
    await waitFor(() => expect(zaehlen).toHaveBeenCalledWith('z3', null));
  });

  it('zeigt beim Zählen keine Zahl aus dem System — erst „Abweichungen buchen“', async () => {
    zeigen();
    await screen.findByText('Muffe');
    expect(screen.queryByText(/Soll/)).toBeNull();
  });

  it('Abweichungen buchen: Soll, Gezählt, danach — Grund für alle, ein eigener je Zeile, ein Zug', async () => {
    const nutzer = userEvent.setup();
    zeigen();
    await nutzer.click(await screen.findByRole('button', { name: 'Abweichungen buchen' }));
    const dialog = await screen.findByRole('dialog', { name: 'Abweichungen buchen' });
    expect(await within(dialog).findByText(/2 gezählt: 1 mit Abweichung, 1 stimmen/)).toBeInTheDocument();
    expect(within(dialog).getByText(/1 nicht gezählt — ihr Bestand bleibt, wie er ist/)).toBeInTheDocument();
    expect(within(dialog).getByText(/Soll 4, gezählt 5 → \+1 Stk · danach 5 Stk/)).toBeInTheDocument();
    const grund = within(dialog).getByRole('textbox', { name: /^Grund\s*\*?$/ });
    expect((grund as HTMLInputElement).value).toMatch(/^Inventur Fahrzeug W-1A \d{2}\.\d{2}\.\d{4}$/);
    await nutzer.type(within(dialog).getByRole('textbox', { name: 'Grund für Muffe (optional)' }), 'Fund unter dem Sitz');
    await nutzer.click(within(dialog).getByRole('button', { name: 'Buchen' }));
    expect(buchen).toHaveBeenCalledWith('i1', (grund as HTMLInputElement).value, { z1: 'Fund unter dem Sitz' }, 's1');
    expect(await screen.findByText(/Inventur gebucht — 1 Abweichung im Bewegungsprotokoll/)).toBeInTheDocument();
  });

  it('ein Konflikt sperrt das Buchen und nennt den Artikel', async () => {
    vorschauHolen.mockResolvedValueOnce(vorschau({
      zeilen: [{ zeile: 'z1', material: 'm', name: 'Muffe', artikelnummer: null, einheit: 'Stk', gezaehlt: 1, zeitpunkt: 1, soll: 4, abweichung: -3, jetzt: 1, danach: -2, ueberholt: false, konflikt: 'Nach der Zählung wurde mehr entnommen, als gezählt war — bitte neu zählen.' }],
    }));
    const nutzer = userEvent.setup();
    zeigen();
    await nutzer.click(await screen.findByRole('button', { name: 'Abweichungen buchen' }));
    const dialog = await screen.findByRole('dialog', { name: 'Abweichungen buchen' });
    expect(await within(dialog).findByText(/bitte neu zählen/)).toBeInTheDocument();
    expect(within(dialog).getByRole('button', { name: 'Buchen' })).toBeDisabled();
  });

  it('hat sich eine Zählung seit der Vorschau geändert, wird nichts gebucht — die neue Vorschau steht da', async () => {
    buchen.mockResolvedValueOnce({ art: 'veraltet', vorschau: vorschau({ stand: 's2' }) });
    const nutzer = userEvent.setup();
    zeigen();
    await nutzer.click(await screen.findByRole('button', { name: 'Abweichungen buchen' }));
    const dialog = await screen.findByRole('dialog', { name: 'Abweichungen buchen' });
    await within(dialog).findByText(/mit Abweichung/);
    await nutzer.click(within(dialog).getByRole('button', { name: 'Buchen' }));
    expect(await within(dialog).findByText(/es wurde nichts gebucht/)).toBeInTheDocument();
    await nutzer.click(within(dialog).getByRole('button', { name: 'Buchen' }));
    expect(buchen).toHaveBeenLastCalledWith('i1', expect.any(String), {}, 's2');
  });

  it('eine gebuchte Liste ist das Protokoll — mit Soll, Gezählt, Abweichung und Ergebnis', async () => {
    liste = {
      ...OFFEN(), zustand: 'gebucht', gebuchtAm: Date.parse('2026-11-17T12:00:00Z'), gebuchtVonName: 'Paul', grund: 'Inventur Fahrzeug',
      zeilen: [
        zeile('z1', 'Muffe', { gezaehlt: 5, soll: 4, abweichung: 1, bestandVorher: 4, bestandNachher: 5, ergebnis: 'gebucht', grund: 'Fund' }),
        zeile('z2', 'Schelle', { ergebnis: 'nicht_gezaehlt' }),
      ],
    };
    zeigen();
    expect(await screen.findByRole('heading', { level: 1, name: 'Inventurprotokoll' })).toBeInTheDocument();
    expect(screen.getByText('+1 Stk')).toBeInTheDocument();
    expect(screen.getByText(/Soll 4 · gezählt 5/)).toBeInTheDocument();
    expect(screen.getByText('nicht gezählt — Bestand unverändert')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Abweichungen buchen' })).toBeNull();
  });
});
