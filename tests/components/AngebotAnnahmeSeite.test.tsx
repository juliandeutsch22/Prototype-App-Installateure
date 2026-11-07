import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { forwardRef, useImperativeHandle } from 'react';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import type { AnnahmeAntwort, AnnahmeAnfrage, AnnahmeStand } from '@/lib/db/angebotAnnahme';

/**
 * DIE SEITE DES ANNAHME-LINKS (M02a, A06) — für den Kunden, ohne Anmeldung.
 *
 * Alle Zustände: wird geladen; Angebot; angenommen (Bestätigung); bereits
 * angenommen; abgelehnt; nicht (mehr) gültig (eine Meldung für unbekannt,
 * abgelaufen, widerrufen — und für einen falsch geformten Schlüssel, der gar
 * nicht erst hinausgeht); zu viele Aufrufe; Fehler mit „Erneut versuchen“.
 * Dazu: Pflichtangaben vor dem Senden, das PDF aus dem Stand, nichts im
 * Speicher des Browsers.
 */

const SCHLUESSEL = 'K'.repeat(43);
const BILD = 'data:image/png;base64,iVBORw0KGgo=';

/* Das Unterschriftsfeld zeichnet auf ein Canvas — in jsdom gibt es keins (wie `WorkSheetView.test.tsx`). */
vi.mock('@/components/SignaturePad', () => ({
  default: forwardRef<{ bildLesen: () => string | null }, { titel: string; onChange: (gesetzt: boolean) => void }>(
    function Feld({ titel, onChange }, ref) {
      useImperativeHandle(ref, () => ({ bildLesen: () => BILD }));
      return <button type="button" onClick={() => onChange(true)}>{titel} zeichnen</button>;
    },
  ),
}));

const anfrage = vi.fn<(a: AnnahmeAnfrage) => Promise<AnnahmeAntwort>>();
vi.mock('@/lib/db/angebotAnnahme', () => ({
  annahmeAnfrage: (a: AnnahmeAnfrage) => anfrage(a),
}));
const pdf = vi.fn<(o: unknown) => Promise<void>>(async () => undefined);
vi.mock('@/features/quotes/angebotPdf', () => ({ downloadAngebotPdf: (o: unknown) => pdf(o) }));

const STAND: AnnahmeStand = {
  angebot: {
    id: '', companyId: '', status: 'Versendet', kalkulierteStunden: 0,
    quoteNumber: 'AN-2026-0042', quoteDate: '2026-11-02', validUntil: '2026-12-02',
    customerName: 'Familie Huber', address: 'Gartenweg 3, 2340 Mödling', notes: 'Therme im Keller.',
    vatRate: 0.2, discount: null, discountAmount: 0, subtotalNetto: 2700, totalNetto: 2700, totalVat: 540, totalBrutto: 3240,
    positions: [
      { label: 'Gastherme', qty: 1, unit: 'Stk', unitPrice: 2400, netto: 2400 },
      { label: 'Montage', qty: 4, unit: 'h', unitPrice: 75, netto: 300 },
    ],
  },
  kunde: { name: 'Familie Huber', address: 'Hauptstraße 1, 2340 Mödling' },
  aussteller: { name: 'Perl Installationen GmbH', addressLine: 'Werkstraße 1, 1100 Wien', contactLine: 'office@perl.at' },
};

const OFFEN: AnnahmeAntwort = { zustand: 'offen', gueltigBis: '2026-12-02', stand: STAND, pruefsumme: 'f'.repeat(64) };

const { default: AngebotAnnahmeSeite } = await import('@/features/angebotAnnahme/AngebotAnnahmeSeite');

function zeige(hash = `#${SCHLUESSEL}`) {
  window.history.replaceState(null, '', `/angebot/annehmen${hash}`);
  return render(
    <MemoryRouter>
      <AngebotAnnahmeSeite />
    </MemoryRouter>,
  );
}

let gespeichert: ReturnType<typeof vi.spyOn>;
beforeEach(() => {
  anfrage.mockReset();
  pdf.mockClear();
  gespeichert = vi.spyOn(Storage.prototype, 'setItem');
});
afterEach(() => {
  // Nichts im Speicher des Browsers — weder Schlüssel noch Name noch Unterschrift.
  expect(gespeichert).not.toHaveBeenCalled();
  gespeichert.mockRestore();
});

describe('Die Seite des Annahme-Links', () => {
  it('lädt mit dem Schlüssel aus dem Fragment und zeigt das Angebot', async () => {
    let fertig: (a: AnnahmeAntwort) => void = () => undefined;
    anfrage.mockImplementationOnce(() => new Promise((r) => { fertig = r; }));
    zeige();
    expect(screen.getByText('Das Angebot wird geladen …')).toBeInTheDocument();
    expect(anfrage).toHaveBeenCalledWith({ aktion: 'abruf', schluessel: SCHLUESSEL });
    fertig(OFFEN);
    expect(await screen.findByText('Positionen (2)')).toBeInTheDocument();
    expect(screen.getByRole('heading', { level: 1, name: 'Angebot' })).toBeInTheDocument();
    // Von wem: der Betrieb im Briefkopf und in der Ortszeile.
    expect(screen.getAllByText('Perl Installationen GmbH').length).toBeGreaterThan(0);
    expect(screen.getByText('AN-2026-0042')).toBeInTheDocument();
    const positionen = screen.getByText('Positionen (2)').closest('section')!;
    expect(within(positionen).getByText('Gastherme')).toBeInTheDocument();
    expect(within(positionen).getByText('Brutto').nextSibling).toHaveTextContent(/3.240,00/);
    expect(screen.getByText('Therme im Keller.')).toBeInTheDocument();
    expect(screen.getByText('Gartenweg 3, 2340 Mödling')).toBeInTheDocument();
    expect(screen.getByText('f'.repeat(64))).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Verbindlich annehmen' })).toBeInTheDocument();
  });

  it('nimmt erst mit Name, Bestätigung und Unterschrift an — dann die Bestätigung mit Datum', async () => {
    const nutzer = userEvent.setup();
    anfrage.mockResolvedValueOnce(OFFEN);
    zeige();
    const knopf = await screen.findByRole('button', { name: 'Verbindlich annehmen' });
    await nutzer.click(knopf);
    expect(await screen.findByText(/Bitte Ihren Namen angeben/)).toBeInTheDocument();
    await nutzer.type(screen.getByLabelText(/Ihr Name/), '  Maria Huber ');
    await nutzer.click(knopf);
    expect(await screen.findByText(/Bitte bestätigen/)).toBeInTheDocument();
    await nutzer.click(screen.getByLabelText('Ich nehme dieses Angebot verbindlich an.'));
    await nutzer.click(knopf);
    expect(await screen.findByText('Bitte im Feld unterschreiben.')).toBeInTheDocument();
    expect(anfrage).toHaveBeenCalledTimes(1);

    anfrage.mockResolvedValueOnce({ ...OFFEN, zustand: 'angenommen', entschiedenAm: '2026-11-06T13:05:00Z', name: 'Maria Huber', neu: true });
    await nutzer.click(screen.getByRole('button', { name: 'Ihre Unterschrift zeichnen' }));
    await nutzer.click(knopf);
    await waitFor(() => expect(anfrage).toHaveBeenLastCalledWith({
      aktion: 'annehmen', schluessel: SCHLUESSEL, name: 'Maria Huber', bestaetigt: true, unterschrift: BILD,
    }));
    expect(await screen.findByText(/Vielen Dank\. Sie haben das Angebot am 06\.11\.2026, 14:05 verbindlich angenommen \(Maria Huber\)\./)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Verbindlich annehmen' })).toBeNull();
    // Das PDF bleibt.
    expect(screen.getByRole('button', { name: 'Als PDF' })).toBeInTheDocument();
  });

  it('ein zweiter Aufruf zeigt „Bereits angenommen am …“ — ohne Formular', async () => {
    anfrage.mockResolvedValueOnce({ ...OFFEN, zustand: 'angenommen', entschiedenAm: '2026-11-05T08:00:00Z', name: 'Maria Huber' });
    zeige();
    expect(await screen.findByText('Bereits angenommen am 05.11.2026, 09:00 von Maria Huber.')).toBeInTheDocument();
    expect(screen.queryByLabelText(/Ihr Name/)).toBeNull();
  });

  it('ablehnen mit Name und freiwilligem Grund', async () => {
    const nutzer = userEvent.setup();
    anfrage.mockResolvedValueOnce(OFFEN);
    zeige();
    await nutzer.click(await screen.findByRole('button', { name: 'Ablehnen …' }));
    expect(screen.queryByLabelText('Ich nehme dieses Angebot verbindlich an.')).toBeNull();
    await nutzer.type(screen.getByLabelText(/Ihr Name/), 'Maria Huber');
    await nutzer.type(screen.getByLabelText('Grund (freiwillig)'), 'Zu teuer');
    anfrage.mockResolvedValueOnce({ ...OFFEN, zustand: 'abgelehnt', entschiedenAm: '2026-11-06T13:05:00Z', name: 'Maria Huber', neu: true });
    await nutzer.click(screen.getByRole('button', { name: 'Angebot ablehnen' }));
    await waitFor(() => expect(anfrage).toHaveBeenLastCalledWith({ aktion: 'ablehnen', schluessel: SCHLUESSEL, name: 'Maria Huber', grund: 'Zu teuer' }));
    expect(await screen.findByText(/Sie haben das Angebot am 06\.11\.2026, 14:05 abgelehnt/)).toBeInTheDocument();
  });

  it('nicht (mehr) gültig: eine Meldung — ein falsch geformter Schlüssel geht gar nicht erst hinaus', async () => {
    zeige('#zu-kurz');
    expect(await screen.findByRole('heading', { level: 1, name: 'Link nicht gültig' })).toBeInTheDocument();
    expect(anfrage).not.toHaveBeenCalled();
  });

  it('dieselbe Meldung, wenn der Server den Link nicht kennt', async () => {
    anfrage.mockResolvedValueOnce({ zustand: 'ungueltig' });
    zeige();
    expect(await screen.findByText(/Dieser Link ist nicht \(mehr\) gültig/)).toBeInTheDocument();
  });

  it('zu viele Aufrufe und ein Fehler: mit „Erneut versuchen“', async () => {
    const nutzer = userEvent.setup();
    anfrage.mockResolvedValueOnce({ zustand: 'zu_viele', grund: 'Dieser Link wurde in der letzten Stunde zu oft aufgerufen.' });
    const r = zeige();
    expect(await screen.findByText(/zu oft aufgerufen/)).toBeInTheDocument();
    r.unmount();

    anfrage.mockRejectedValueOnce(new Error('Der Dienst ist gerade nicht erreichbar.'));
    zeige();
    expect(await screen.findByText(/Das Angebot ließ sich nicht laden/)).toBeInTheDocument();
    anfrage.mockResolvedValueOnce(OFFEN);
    await nutzer.click(screen.getByRole('button', { name: 'Erneut versuchen' }));
    expect(await screen.findByRole('button', { name: 'Verbindlich annehmen' })).toBeInTheDocument();
  });

  it('meldet der Server einen Fehler der Angaben, steht er am Formular — die Seite bleibt', async () => {
    const nutzer = userEvent.setup();
    anfrage.mockResolvedValueOnce(OFFEN);
    zeige();
    await nutzer.type(await screen.findByLabelText(/Ihr Name/), 'Maria Huber');
    await nutzer.click(screen.getByLabelText('Ich nehme dieses Angebot verbindlich an.'));
    await nutzer.click(screen.getByRole('button', { name: 'Ihre Unterschrift zeichnen' }));
    anfrage.mockResolvedValueOnce({ zustand: 'fehler', grund: 'Bitte im Feld unterschreiben.' });
    await nutzer.click(screen.getByRole('button', { name: 'Verbindlich annehmen' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Bitte im Feld unterschreiben.');
    expect(screen.getByRole('button', { name: 'Verbindlich annehmen' })).toBeInTheDocument();
  });

  it('„Als PDF“ erzeugt das Angebot aus dem Stand — mit den Firmendaten des Versands', async () => {
    const nutzer = userEvent.setup();
    anfrage.mockResolvedValueOnce(OFFEN);
    zeige();
    await nutzer.click(await screen.findByRole('button', { name: 'Als PDF' }));
    await waitFor(() => expect(pdf).toHaveBeenCalledTimes(1));
    expect(pdf.mock.calls[0][0]).toMatchObject({
      company: { name: 'Perl Installationen GmbH', addressLine: 'Werkstraße 1, 1100 Wien' },
      quote: { quoteNumber: 'AN-2026-0042', totalBrutto: 3240 },
      kunde: { name: 'Familie Huber', address: 'Hauptstraße 1, 2340 Mödling' },
    });
  });
});
