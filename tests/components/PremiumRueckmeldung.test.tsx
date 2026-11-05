import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ToastProvider, useToast } from '@/components/Toast';
import VerloreneBuchung from '@/components/VerloreneBuchung';
import KatalogSuche from '@/features/quotes/KatalogSuche';

const katalog = vi.hoisted(() => vi.fn());
type Fehlschlag = { zeile: string; tabelle: string; grund: string };
const vormerkung = vi.hoisted(() => ({ melden: null as null | ((f: Fehlschlag) => void) }));
vi.mock('@/lib/db/materials', () => ({ sucheKatalog: (...a: unknown[]) => katalog(...a) }));
vi.mock('@/lib/sync/ausgangsfach', () => ({ beiVormerkungFehlgeschlagen: (f: null | ((f: Fehlschlag) => void)) => { vormerkung.melden = f; } }));
afterEach(() => { vi.useRealTimers(); katalog.mockReset(); });

function Melder() {
  const toast = useToast();
  return <><button onClick={() => toast.info('Normaler Hinweis', { label: 'Aktion', onClick() {} })}>Hinweis zeigen</button></>;
}

describe('Rückmeldungen', () => {
  it('endgültiger Nachsendefehler bleibt bis zur bewussten Bestätigung', () => {
    vi.useFakeTimers();
    render(<ToastProvider><VerloreneBuchung /></ToastProvider>);
    act(() => vormerkung.melden?.({ zeile: 'z1', tabelle: 'time_entries', grund: 'abgelehnt' }));
    act(() => vi.advanceTimersByTime(60_000));
    expect(screen.getByRole('alert')).toHaveTextContent('Eine vorgemerkte Buchung konnte nicht gesendet werden.');
    fireEvent.click(screen.getByRole('button', { name: 'Gelesen' }));
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });
  it('ein vorgemerkter Schein sagt, warum er nicht ankam (E49)', () => {
    render(<ToastProvider><VerloreneBuchung /></ToastProvider>);
    act(() => vormerkung.melden?.({
      zeile: 's1', tabelle: 'work_sheets',
      grund: 'Ein Schein im Zustand Unterschrieben lässt sich nicht mehr ändern (Ziel: Unterschrieben)',
    }));
    expect(screen.getByRole('alert')).toHaveTextContent(
      'Ein vorgemerkter Handwerksschein konnte nicht gesendet werden: Ein Schein im Zustand Unterschrieben lässt sich nicht mehr ändern (Ziel: Unterschrieben). Bitte unter Handwerksscheine nachsehen.',
    );
  });
  it('ein vorgemerktes Foto sagt, dass der Schein es verzeichnet, die Datei aber fehlt (E49)', () => {
    render(<ToastProvider><VerloreneBuchung /></ToastProvider>);
    act(() => vormerkung.melden?.({ zeile: 'scheine/perl/s1/a.jpg', tabelle: 'scheinfotos', grund: 'Payload too large.' }));
    expect(screen.getByRole('alert')).toHaveTextContent(
      'Ein vorgemerktes Foto konnte nicht hochgeladen werden: Payload too large. Der Schein verzeichnet es, die Datei fehlt.',
    );
  });
  it('pausiert bei Hover und Fokus unabhängig und verwendet danach nur die Restzeit', () => {
    vi.useFakeTimers();
    render(<ToastProvider><Melder /></ToastProvider>);
    fireEvent.click(screen.getByRole('button', { name: 'Hinweis zeigen' }));
    const zeile = screen.getByText('Normaler Hinweis').parentElement!;
    act(() => vi.advanceTimersByTime(2000));
    fireEvent.mouseEnter(zeile);
    fireEvent.focus(screen.getByRole('button', { name: 'Aktion' }));
    act(() => vi.advanceTimersByTime(10_000));
    fireEvent.mouseLeave(zeile);
    act(() => vi.advanceTimersByTime(10_000));
    expect(screen.getByText('Normaler Hinweis')).toBeInTheDocument();
    fireEvent.blur(screen.getByRole('button', { name: 'Aktion' }), { relatedTarget: document.body });
    act(() => vi.advanceTimersByTime(4999));
    expect(screen.getByText('Normaler Hinweis')).toBeInTheDocument();
    act(() => vi.advanceTimersByTime(2));
    expect(screen.queryByText('Normaler Hinweis')).not.toBeInTheDocument();
  });
});

describe('Katalog: nur der aktuelle Suchlauf ist bedienbar', () => {
  it('entfernt alte Treffer sofort und verwirft eine überholte Antwort', async () => {
    let alteAntwort: ((v: unknown[]) => void) | undefined;
    katalog.mockResolvedValueOnce([{ id: 'v1', name: 'Eckventil', unit: 'Stk' }]);
    katalog.mockImplementationOnce(() => new Promise((r) => { alteAntwort = r; }));
    katalog.mockResolvedValueOnce([{ id: 'k1', name: 'Kupferrohr', unit: 'm' }]);
    render(<KatalogSuche companyId="firma" onWahl={vi.fn()} onSchliessen={vi.fn()} />);
    const input = screen.getByLabelText('Artikel aus dem Katalog');
    fireEvent.change(input, { target: { value: 'Ventil' } });
    await screen.findByRole('button', { name: 'Eckventil übernehmen' });
    fireEvent.change(input, { target: { value: 'Alt' } });
    expect(screen.queryByRole('button', { name: 'Eckventil übernehmen' })).not.toBeInTheDocument();
    await waitFor(() => expect(katalog).toHaveBeenCalledTimes(2));
    fireEvent.change(input, { target: { value: 'Kupfer' } });
    await screen.findByRole('button', { name: 'Kupferrohr übernehmen' });
    await act(async () => alteAntwort?.([{ id: 'falsch', name: 'Falsche alte Antwort' }]));
    expect(screen.queryByText('Falsche alte Antwort')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Kupferrohr übernehmen' })).toBeEnabled();
  });
  it('Fehler bleibt wiederholbar, übernommenes Material bleibt bestätigt, Reset löst keine leere Suche aus', async () => {
    katalog.mockResolvedValueOnce([{ id: 'v1', name: 'Eckventil', unit: 'Stk' }]);
    katalog.mockRejectedValueOnce(new Error('Netz weg'));
    katalog.mockResolvedValueOnce([]);
    const wahl = vi.fn();
    render(<KatalogSuche companyId="firma" onWahl={wahl} onSchliessen={vi.fn()} />);
    const input = screen.getByLabelText('Artikel aus dem Katalog');
    fireEvent.change(input, { target: { value: 'Ventil' } });
    fireEvent.click(await screen.findByRole('button', { name: 'Eckventil übernehmen' }));
    fireEvent.change(input, { target: { value: 'Kupfer' } });
    expect(await screen.findByRole('alert')).toHaveTextContent('Bereits übernommene Positionen bleiben erhalten.');
    expect(screen.getByText('„Eckventil“ übernommen.')).toBeInTheDocument();
    expect(wahl).toHaveBeenCalledOnce();
    fireEvent.click(screen.getByRole('button', { name: 'Suche wiederholen' }));
    fireEvent.click(await screen.findByRole('button', { name: 'Suche zurücksetzen' }));
    expect(input).toHaveValue('');
    expect(katalog).toHaveBeenCalledTimes(3);
  });
});
