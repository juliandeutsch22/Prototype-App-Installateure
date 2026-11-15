import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { ToastProvider } from '@/components/Toast';
import type { BelegMailAuftrag, BelegMailErgebnis, BelegVersand } from '@/lib/db/belegMail';

/**
 * RECHNUNG UND ANGEBOT PER MAIL (F16) — das Fenster:
 * - vorbelegt aus Kunde und Vorlage des Betriebs, Kopie an den Betrieb
 *   vorgewählt, gesendet wird genau das Eingetragene samt PDF;
 * - nicht eingerichtet: der bisherige Weg (PDF laden, Mail-Programm) im
 *   selben Fenster, ohne Senden-Knopf;
 * - ohne Antwortadresse kein Senden, mit dem Weg in die Einstellungen;
 * - scheitert der Versand, steht die Meldung da und der bisherige Weg darunter.
 */

class NichtEingerichtet extends Error {}
let eingerichtet = true;
const belegPerMail = vi.fn<(a: BelegMailAuftrag) => Promise<BelegMailErgebnis>>();
let frueher: BelegVersand[] = [];
vi.mock('@/lib/db/belegMail', () => ({
  BelegMailNichtEingerichtet: NichtEingerichtet,
  belegMailStand: vi.fn(async () => (eingerichtet ? { eingerichtet: true, absender: 'office@senklot.at' } : { eingerichtet: false })),
  belegPerMail: (a: BelegMailAuftrag) => belegPerMail(a),
  listBelegVersand: vi.fn(async () => frueher),
}));

const auth: { company: Record<string, unknown> } = { company: {} };
vi.mock('@/app/AuthContext', () => ({
  useAuth: () => ({
    user: { uid: 'b', email: 'b@perl.at', name: 'Bea', role: 'Geschäftsführung', companyId: 'perl', docId: 'b' },
    company: auth.company,
  }),
}));

const { default: BelegMailDialog } = await import('@/features/belegMail/BelegMailDialog');

const onClose = vi.fn();
const pdfLaden = vi.fn();
const PDF = new Blob(['%PDF-1.4 Probe'], { type: 'application/pdf' });

function zeige(o: { kundenEmail?: string; link?: string; art?: 'rechnung' | 'angebot' } = {}) {
  return render(
    <MemoryRouter>
      <ToastProvider>
        <BelegMailDialog
          open
          art={o.art ?? 'rechnung'}
          belegId="r1"
          kundenEmail={'kundenEmail' in o ? o.kundenEmail : 'kunde@huber.at'}
          werte={{ nummer: 'RE-2026-1001', kunde: 'Maria Huber', betrag: '€ 120,00', faellig: '30.11.2026', baustelle: 'B-1', gueltig_bis: '01.12.2026', link: o.link }}
          pdfErzeugen={async () => PDF}
          pdfLaden={pdfLaden}
          onClose={onClose}
        />
      </ToastProvider>
    </MemoryRouter>,
  );
}

beforeEach(() => {
  eingerichtet = true;
  frueher = [];
  auth.company = { id: 'perl', name: 'Perl Installationen', belegMailAntwort: 'office@perl.at' };
  belegPerMail.mockReset();
  onClose.mockReset();
  pdfLaden.mockReset();
});

describe('Beleg per Mail', () => {
  it('vorbelegt aus Kunde und Vorlage; sendet genau das Eingetragene mit dem PDF und Kopie an den Betrieb', async () => {
    auth.company = { ...auth.company, belegMailVorlagen: { rechnung: { betreff: 'Ihre Rechnung {nummer} — {firma}' } } };
    belegPerMail.mockResolvedValue({ versand: 'v1', an: ['kunde@huber.at'], kopie: 'office@perl.at' });
    zeige();
    const fenster = await screen.findByRole('dialog', { name: 'Rechnung per Mail' });
    expect(within(fenster).getByLabelText(/^An/)).toHaveValue('kunde@huber.at');
    expect(within(fenster).getByLabelText(/^Betreff/)).toHaveValue('Ihre Rechnung RE-2026-1001 — Perl Installationen');
    expect((within(fenster).getByLabelText(/^Text/) as HTMLTextAreaElement).value)
      .toContain('unsere Rechnung RE-2026-1001 über € 120,00, zahlbar bis 30.11.2026.');
    expect(within(fenster).getByLabelText('Kopie an office@perl.at')).toBeChecked();
    expect(await within(fenster).findByText(/Gesendet über office@senklot.at im Namen von Perl Installationen/)).toBeInTheDocument();

    await userEvent.click(within(fenster).getByRole('button', { name: 'Senden' }));
    await waitFor(() => expect(belegPerMail).toHaveBeenCalledTimes(1));
    expect(belegPerMail.mock.calls[0][0]).toMatchObject({
      art: 'rechnung', beleg: 'r1', an: ['kunde@huber.at'], kopie: true, betreff: 'Ihre Rechnung RE-2026-1001 — Perl Installationen', mitLink: false,
    });
    expect(belegPerMail.mock.calls[0][0].pdf).toBe(PDF);
    await waitFor(() => expect(onClose).toHaveBeenCalledWith(true));
  });

  it('Angebot mit Annahme-Link: der Link steht im Text und geht als „mit Link“ hinaus', async () => {
    belegPerMail.mockResolvedValue({ versand: 'v1', an: ['kunde@huber.at'], kopie: null });
    zeige({ art: 'angebot', link: 'https://app.senklot.at/angebot/annehmen#abc' });
    const fenster = await screen.findByRole('dialog', { name: 'Angebot per Mail' });
    expect((within(fenster).getByLabelText(/^Text/) as HTMLTextAreaElement).value).toContain('annehmen: https://app.senklot.at/angebot/annehmen#abc');
    await userEvent.click(await within(fenster).findByRole('button', { name: 'Senden' }));
    await waitFor(() => expect(belegPerMail).toHaveBeenCalled());
    expect(belegPerMail.mock.calls[0][0].mitLink).toBe(true);
  });

  it('nicht eingerichtet: der bisherige Weg im selben Fenster, kein Senden', async () => {
    eingerichtet = false;
    zeige();
    const fenster = await screen.findByRole('dialog', { name: 'Rechnung per Mail' });
    expect(await within(fenster).findByText(/noch nicht eingerichtet — das erledigt der Betreiber/)).toBeInTheDocument();
    expect(within(fenster).queryByRole('button', { name: 'Senden' })).toBeNull();
    await userEvent.click(within(fenster).getByRole('button', { name: 'PDF laden' }));
    expect(pdfLaden).toHaveBeenCalled();
    const mailto = within(fenster).getByRole('link', { name: 'Mail-Programm öffnen' }).getAttribute('href')!;
    expect(mailto).toMatch(/^mailto:kunde@huber\.at\?subject=Rechnung%20RE-2026-1001%20von%20Perl%20Installationen&body=/);
  });

  it('ohne Antwortadresse kein Senden — mit dem Weg in die Rechnungsvorgaben', async () => {
    auth.company = { id: 'perl', name: 'Perl Installationen' };
    zeige();
    const fenster = await screen.findByRole('dialog', { name: 'Rechnung per Mail' });
    expect(within(fenster).getByRole('link', { name: 'In den Rechnungsvorgaben eintragen' })).toHaveAttribute('href', '/settings/rechnung');
    await waitFor(() => expect(within(fenster).getByRole('button', { name: 'Senden' })).toBeDisabled());
  });

  it('Gegenprobe: eine ungültige oder fehlende Adresse lässt nicht senden', async () => {
    zeige({ kundenEmail: undefined });
    const fenster = await screen.findByRole('dialog', { name: 'Rechnung per Mail' });
    expect(within(fenster).getByText(/Beim Kunden ist keine Adresse hinterlegt/)).toBeInTheDocument();
    await waitFor(() => expect(within(fenster).getByRole('button', { name: 'Senden' })).toBeDisabled());
    await userEvent.type(within(fenster).getByLabelText(/^An/), 'kunde@huber');
    expect(within(fenster).getByRole('button', { name: 'Senden' })).toBeDisabled();
    await userEvent.type(within(fenster).getByLabelText(/^An/), '.at');
    expect(within(fenster).getByRole('button', { name: 'Senden' })).toBeEnabled();
  });

  it('scheitert der Versand, bleiben Meldung und der bisherige Weg — nichts gilt als gesendet', async () => {
    belegPerMail.mockRejectedValue(new Error('Der Mailserver hat die Empfängeradresse abgelehnt. Bitte die Adresse prüfen.'));
    zeige();
    const fenster = await screen.findByRole('dialog', { name: 'Rechnung per Mail' });
    await userEvent.click(await within(fenster).findByRole('button', { name: 'Senden' }));
    expect(await within(fenster).findByRole('alert')).toHaveTextContent(/Empfängeradresse abgelehnt/);
    expect(within(fenster).getByRole('button', { name: 'PDF laden' })).toBeInTheDocument();
    expect(onClose).not.toHaveBeenCalled();
  });

  it('meldet die Function erst beim Senden „nicht eingerichtet“, wechselt das Fenster auf den bisherigen Weg', async () => {
    belegPerMail.mockRejectedValue(new NichtEingerichtet('nicht eingerichtet'));
    zeige();
    const fenster = await screen.findByRole('dialog', { name: 'Rechnung per Mail' });
    await userEvent.click(await within(fenster).findByRole('button', { name: 'Senden' }));
    expect(await within(fenster).findByText(/noch nicht eingerichtet/)).toBeInTheDocument();
    expect(within(fenster).queryByRole('button', { name: 'Senden' })).toBeNull();
  });

  it('zeigt, wann und an wen der Beleg schon hinausging', async () => {
    frueher = [{ id: 'v0', art: 'rechnung', belegNummer: 'RE-2026-1001', an: ['alt@huber.at'], betreff: 'x', anhangName: 'x.pdf', mitLink: false, zustand: 'versendet', angefragtAm: Date.parse('2026-11-12T13:05:00Z'), vonName: 'Bea' }];
    zeige();
    const fenster = await screen.findByRole('dialog', { name: 'Rechnung per Mail' });
    expect(await within(fenster).findByText(/12\.11\.2026, 14:05 an alt@huber\.at · Bea/)).toBeInTheDocument();
  });
});
