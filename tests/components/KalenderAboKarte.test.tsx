import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ToastProvider } from '@/components/Toast';
import type { KalenderAbo } from '@/types';

/**
 * Das Kalender-Abo in „Mein Einsatzplan“ (Entscheidung vom 02.10.2026). Der
 * Link steht nur einmal da; „Neuer Link“ und „Abo beenden“ fragen vorher,
 * weil der Kalender danach nichts mehr zeigt, bis der neue Link eingetragen
 * ist.
 */

let stand: KalenderAbo | null = null;
let standWirft = false;
const kalenderAboStand = vi.fn<(...a: unknown[]) => Promise<KalenderAbo | null>>(async () => {
  if (standWirft) throw new Error('weg');
  return stand;
});
const kalenderAboAnlegen = vi.fn<(...a: unknown[]) => Promise<string>>(async () => 'Abc_-123');
const kalenderAboBeenden = vi.fn<(...a: unknown[]) => Promise<void>>(async () => undefined);
vi.mock('@/lib/db/assignments', () => ({
  kalenderAboStand: (...a: unknown[]) => kalenderAboStand(...a),
  kalenderAboAnlegen: (...a: unknown[]) => kalenderAboAnlegen(...a),
  kalenderAboBeenden: (...a: unknown[]) => kalenderAboBeenden(...a),
}));

const { default: KalenderAboKarte } = await import('@/features/assignments/KalenderAboKarte');

const zeige = () => render(<ToastProvider><KalenderAboKarte userId="m1" /></ToastProvider>);

beforeEach(() => {
  vi.stubEnv('VITE_SUPABASE_URL', 'https://abc.supabase.co');
  stand = null;
  standWirft = false;
  kalenderAboStand.mockClear();
  kalenderAboAnlegen.mockClear();
  kalenderAboBeenden.mockClear();
});

afterEach(() => {
  vi.unstubAllEnvs();
});

describe('Kalender-Abo', () => {
  it('einrichten: der Link steht einmal da, zum Kopieren und zum Antippen', async () => {
    const u = userEvent.setup();
    zeige();
    await u.click(await screen.findByRole('button', { name: 'Kalender-Abo einrichten' }));
    expect(kalenderAboAnlegen).toHaveBeenCalledTimes(1);
    const feld = await screen.findByLabelText('Dein Link — nur jetzt sichtbar');
    expect(feld).toHaveValue('https://abc.supabase.co/functions/v1/kalender?t=Abc_-123');
    expect(screen.getByRole('link', { name: 'Im Kalender öffnen' }))
      .toHaveAttribute('href', 'webcal://abc.supabase.co/functions/v1/kalender?t=Abc_-123');
    expect(screen.getByRole('button', { name: 'Link kopieren' })).toBeInTheDocument();
    // Daneben nichts, was den Link gleich wieder ungültig macht.
    expect(screen.queryByRole('button', { name: /Abo beenden|Neuen Link/ })).toBeNull();
  });

  it('eingerichtet: wann, und wann zuletzt abgeholt — der Link selbst steht nicht da', async () => {
    stand = { angelegtAm: Date.parse('2026-10-01T06:00:00Z'), zuletztAbgerufen: Date.parse('2026-10-02T20:15:00Z') };
    zeige();
    expect(await screen.findByText(/Eingerichtet am 01\.10\.2026, 08:00/)).toBeInTheDocument();
    expect(screen.getByText(/Zuletzt abgeholt am 02\.10\.2026, 22:15/)).toBeInTheDocument();
    expect(screen.queryByLabelText(/Dein Link/)).toBeNull();
  });

  it('noch nicht abgeholt sagt es', async () => {
    stand = { angelegtAm: Date.parse('2026-10-01T06:00:00Z'), zuletztAbgerufen: null };
    zeige();
    expect(await screen.findByText('Noch von keinem Kalender abgeholt.')).toBeInTheDocument();
  });

  it('„Abo beenden“ fragt vorher; „Abbrechen“ beendet nichts (Gegenprobe: bestätigt)', async () => {
    stand = { angelegtAm: Date.now() };
    const u = userEvent.setup();
    zeige();
    await u.click(await screen.findByRole('button', { name: 'Abo beenden …' }));
    expect(screen.getByText(/zeigt deine Einsätze danach nicht mehr/)).toBeInTheDocument();
    await u.click(screen.getByRole('button', { name: 'Abbrechen' }));
    expect(kalenderAboBeenden).not.toHaveBeenCalled();
    await u.click(screen.getByRole('button', { name: 'Abo beenden …' }));
    stand = null;
    await u.click(screen.getByRole('button', { name: 'Abo beenden' }));
    expect(kalenderAboBeenden).toHaveBeenCalledTimes(1);
    expect(await screen.findByRole('button', { name: 'Kalender-Abo einrichten' })).toBeInTheDocument();
  });

  it('ein neuer Link fragt vorher und zeigt dann den neuen', async () => {
    stand = { angelegtAm: Date.now() };
    const u = userEvent.setup();
    zeige();
    await u.click(await screen.findByRole('button', { name: 'Neuen Link erstellen …' }));
    expect(screen.getByText(/bisherige Link hört dann auf/)).toBeInTheDocument();
    await u.click(screen.getByRole('button', { name: 'Neuen Link erstellen' }));
    expect(kalenderAboAnlegen).toHaveBeenCalledTimes(1);
    expect(await screen.findByLabelText('Dein Link — nur jetzt sichtbar')).toBeInTheDocument();
  });

  it('sagt den Grund, wenn der Betrieb es inzwischen ausgeschaltet hat', async () => {
    kalenderAboAnlegen.mockRejectedValueOnce(new Error('Das Kalender-Abo ist in diesem Betrieb nicht eingeschaltet'));
    const u = userEvent.setup();
    zeige();
    await u.click(await screen.findByRole('button', { name: 'Kalender-Abo einrichten' }));
    expect(await screen.findByRole('alert')).toHaveTextContent(/nicht eingeschaltet/);
  });

  it('ein Ladefehler sieht nicht aus wie „kein Abo“ und lässt sich wiederholen', async () => {
    standWirft = true;
    const u = userEvent.setup();
    zeige();
    expect(await screen.findByRole('alert')).toHaveTextContent(/ließ sich nicht laden/);
    expect(screen.queryByRole('button', { name: 'Kalender-Abo einrichten' })).toBeNull();
    standWirft = false;
    await u.click(screen.getByRole('button', { name: 'Erneut versuchen' }));
    expect(await screen.findByRole('button', { name: 'Kalender-Abo einrichten' })).toBeInTheDocument();
  });
});

describe('Kalender-Abo — der ganze Einsatzplan (Plan 10.4, PR B)', () => {
  const zeigeGesamt = () => render(<ToastProvider><KalenderAboKarte userId="pl" art="gesamt" /></ToastProvider>);

  it('fragt, legt an und beendet mit der Art „gesamt" — ein eigener Link', async () => {
    const u = userEvent.setup();
    zeigeGesamt();
    expect(await screen.findByText(/Der ganze Einsatzplan im Kalender deines Telefons/)).toBeInTheDocument();
    expect(kalenderAboStand).toHaveBeenCalledWith('pl', 'gesamt');
    await u.click(screen.getByRole('button', { name: 'Kalender-Abo einrichten' }));
    expect(kalenderAboAnlegen).toHaveBeenCalledWith('gesamt');
    expect(await screen.findByRole('link', { name: 'Im Kalender öffnen' })).toBeInTheDocument();
  });

  it('beim Beenden steht, dass der Einsatzplan danach fehlt', async () => {
    const u = userEvent.setup();
    stand = { angelegtAm: Date.parse('2026-10-01T06:00:00Z'), zuletztAbgerufen: null };
    zeigeGesamt();
    await u.click(await screen.findByRole('button', { name: 'Abo beenden …' }));
    expect(screen.getByText('Der Kalender zeigt den Einsatzplan danach nicht mehr.')).toBeInTheDocument();
    await u.click(screen.getByRole('button', { name: 'Abo beenden' }));
    expect(kalenderAboBeenden).toHaveBeenCalledWith('gesamt');
  });

  it('Gegenprobe: ohne Art bleibt es das eigene Abo', async () => {
    const u = userEvent.setup();
    zeige();
    expect(await screen.findByText(/Deine Einsätze und Termine im Kalender deines Telefons/)).toBeInTheDocument();
    expect(kalenderAboStand).toHaveBeenCalledWith('m1', 'eigen');
    await u.click(screen.getByRole('button', { name: 'Kalender-Abo einrichten' }));
    expect(kalenderAboAnlegen).toHaveBeenCalledWith('eigen');
  });
});
