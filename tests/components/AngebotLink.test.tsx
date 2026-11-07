import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { ToastProvider } from '@/components/Toast';
import type { Quote } from '@/types';
import type { AngebotLink } from '@/lib/db/angebotLinks';

/**
 * DER ANNAHME-LINK IM ANGEBOT (M02a, A06): der Dialog zum Erzeugen und der
 * Abschnitt „Annahme per Link“.
 *
 * Geprüft wird:
 * - ohne Abrechnungsart kein Link; der Vorsatz kommt vom Betrieb und muss
 *   seine Form haben; die Gültigkeit höchstens ein Jahr;
 * - der Link steht einmal da, mit „Kopieren“ und „Per Mail-Programm senden“;
 * - erst nach dem Schließen lädt die Seite neu (sonst wäre der Link weg);
 * - wer den Knopf sieht (Führung, Modul an, Angebot offen, kein Einblick);
 * - der Abschnitt zeigt offen, angenommen mit Unterschrift, abgelehnt mit
 *   Grund, und widerruft nach Rückfrage.
 */

const ANGEBOT: Quote & { id: string } = {
  id: '11111111-2222-3333-4444-555555555555',
  companyId: 'perl',
  quoteNumber: 'AN-2026-0007',
  customerId: 'k1',
  customerName: 'Gemeinde Neudorf',
  address: 'Schulgasse 2, 2700 Wiener Neustadt',
  quoteDate: '2026-09-01',
  validUntil: '2099-10-01',
  status: 'Versendet',
  positions: [{ label: 'Montage', qty: 2, unit: 'h', unitPrice: 70, netto: 140 }],
  subtotalNetto: 140,
  totalNetto: 140,
  totalVat: 28,
  totalBrutto: 168,
  vatRate: 0.2,
  kalkulierteStunden: 2,
};

let angebot: Quote & { id: string } = ANGEBOT;
const getQuote = vi.fn(async () => angebot);
vi.mock('@/lib/db/quotes', () => ({
  getQuote: () => getQuote(),
  listFassungen: vi.fn(async () => []),
  updateQuote: vi.fn(async () => undefined),
}));
vi.mock('@/lib/db/customers', () => ({
  listCustomersByIds: vi.fn(async () => [{ id: 'k1', companyId: 'perl', name: 'Gemeinde Neudorf', email: 'amt@neudorf.at' }]),
}));
vi.mock('@/lib/db/aussteller', () => ({ belegFirma: vi.fn(async (f: unknown) => f) }));
vi.mock('@/features/quotes/angebotPdf', () => ({ downloadAngebotPdf: vi.fn() }));

let links: AngebotLink[] = [];
const listAngebotLinks = vi.fn<(id: string) => Promise<AngebotLink[]>>(async () => links);
type Erzeugen = (id: string, o: { abrechnung: string; praefix: string; gueltigBis?: string | null }) =>
  Promise<{ id: string; schluessel: string; gueltigBis: string }>;
const angebotLinkErzeugen = vi.fn<Erzeugen>(async () => ({ id: 'l-neu', schluessel: 'S'.repeat(43), gueltigBis: '2026-12-31' }));
const angebotLinkWiderrufen = vi.fn<(id: string) => Promise<void>>(async () => undefined);
const angebotLinkGesehen = vi.fn<(id: string) => Promise<void>>(async () => undefined);
vi.mock('@/lib/db/angebotLinks', () => ({
  listAngebotLinks: (id: string) => listAngebotLinks(id),
  angebotLinkErzeugen: (id: string, o: { abrechnung: string; praefix: string; gueltigBis?: string | null }) => angebotLinkErzeugen(id, o),
  angebotLinkWiderrufen: (id: string) => angebotLinkWiderrufen(id),
  angebotLinkGesehen: (id: string) => angebotLinkGesehen(id),
}));

const rolle = { wert: 'Geschäftsführung' as string };
let module: Record<string, boolean> | undefined;
let einblick: object | null = null;
vi.mock('@/app/AuthContext', () => ({
  useAuth: () => ({
    user: { uid: 'chef', email: 'c@perl.at', name: 'Chefin', role: rolle.wert, companyId: 'perl', docId: 'chef' },
    company: { id: 'perl', name: 'Perl Installationen', praefixBaustelle: 'PB', modules: module },
    einblick,
  }),
}));

const { default: AngebotView } = await import('@/features/quotes/AngebotView');

function zeige() {
  return render(
    <MemoryRouter initialEntries={[`/quotes/${ANGEBOT.id}`]}>
      <ToastProvider>
        <Routes>
          <Route path="/quotes/:id" element={<AngebotView />} />
        </Routes>
      </ToastProvider>
    </MemoryRouter>,
  );
}

const LINK: AngebotLink = {
  id: 'l1', quoteId: ANGEBOT.id, abrechnung: 'Pauschal', praefix: 'PB', gueltigBis: '2099-10-01',
  schnappschussHash: 'a'.repeat(64), erzeugtAm: Date.UTC(2026, 10, 2, 9, 0), erzeugtVonName: 'Carla Chefin',
  geoeffnetAnzahl: 0, zustand: 'offen',
};

beforeEach(() => {
  angebot = { ...ANGEBOT };
  links = [];
  rolle.wert = 'Geschäftsführung';
  module = undefined;
  einblick = null;
  getQuote.mockClear();
  listAngebotLinks.mockClear();
  angebotLinkErzeugen.mockClear();
  angebotLinkWiderrufen.mockClear();
  angebotLinkGesehen.mockClear();
});

describe('Der Dialog „Annahme-Link“', () => {
  it('ohne Abrechnungsart kein Link — mit ihr, dem Vorsatz des Betriebs und der Gültigkeit', async () => {
    const nutzer = userEvent.setup();
    zeige();
    await nutzer.click(await screen.findByRole('button', { name: 'Annahme-Link' }));
    const fenster = await screen.findByRole('dialog', { name: 'Annahme-Link' });
    const knopf = within(fenster).getByRole('button', { name: 'Link erzeugen' });
    expect(knopf).toBeDisabled();
    expect(within(fenster).getByText(/Ohne Abrechnungsart gibt es keinen Link/)).toBeInTheDocument();
    await nutzer.click(knopf);
    expect(angebotLinkErzeugen).not.toHaveBeenCalled();

    // Der Vorsatz kommt vom Betrieb; die Gültigkeit von der Bindefrist, höchstens ein Jahr.
    expect(within(fenster).getByLabelText('Vorsatz der Baustellennummer')).toHaveValue('PB');
    const gueltig = within(fenster).getByLabelText(/Gültig bis/) as HTMLInputElement;
    expect(gueltig.value).toBe(gueltig.max);

    await nutzer.selectOptions(within(fenster).getByLabelText(/Abrechnung der Baustelle/), 'Einheitspreis');
    expect(within(fenster).getByText(/Einheitspreisen; die Mengen kommen aus dem Aufmaß/)).toBeInTheDocument();
    expect(knopf).toBeEnabled();
    await nutzer.click(knopf);
    await waitFor(() => expect(angebotLinkErzeugen).toHaveBeenCalledWith(ANGEBOT.id, {
      abrechnung: 'Einheitspreis', praefix: 'PB', gueltigBis: gueltig.max,
    }));

    // Der Link steht einmal da — mit Kopieren und dem Mailprogramm.
    const adresse = await within(fenster).findByLabelText(/Link für den Kunden — nur jetzt sichtbar/);
    expect(adresse).toHaveValue(`${window.location.origin}/angebot/annehmen#${'S'.repeat(43)}`);
    const mail = within(fenster).getByRole('link', { name: 'Per Mail-Programm senden' });
    const href = mail.getAttribute('href')!;
    expect(href.startsWith('mailto:amt@neudorf.at?subject=')).toBe(true);
    expect(decodeURIComponent(href)).toContain('Angebot AN-2026-0007 von Perl Installationen');
    expect(decodeURIComponent(href)).toContain(`/angebot/annehmen#${'S'.repeat(43)}`);
    expect(decodeURIComponent(href)).toContain('Der Link gilt bis 31.12.2026.');
    expect(within(fenster).getByRole('button', { name: 'Kopieren' })).toBeInTheDocument();

    // Erst beim Schließen lädt die Seite neu: vorher wäre der Link mit ihr verschwunden.
    const geladen = getQuote.mock.calls.length;
    await nutzer.click(within(fenster).getByRole('button', { name: 'Fertig' }));
    await waitFor(() => expect(getQuote.mock.calls.length).toBeGreaterThan(geladen));
  });

  it('ein Vorsatz in falscher Form und eine Gültigkeit über ein Jahr sperren das Erzeugen', async () => {
    const nutzer = userEvent.setup();
    zeige();
    await nutzer.click(await screen.findByRole('button', { name: 'Annahme-Link' }));
    const fenster = await screen.findByRole('dialog', { name: 'Annahme-Link' });
    await nutzer.selectOptions(within(fenster).getByLabelText(/Abrechnung der Baustelle/), 'Regie');
    const knopf = within(fenster).getByRole('button', { name: 'Link erzeugen' });
    expect(knopf).toBeEnabled();
    const vorsatz = within(fenster).getByLabelText('Vorsatz der Baustellennummer');
    await nutzer.clear(vorsatz);
    await nutzer.type(vorsatz, 'b_x');
    expect(knopf).toBeDisabled();
    await nutzer.clear(vorsatz);
    expect(knopf).toBeEnabled();
    expect(within(fenster).getByText(/Ohne Vorsatz: eine Nummer wie 2026-0001/)).toBeInTheDocument();
    const gueltig = within(fenster).getByLabelText(/Gültig bis/);
    await nutzer.clear(gueltig);
    await nutzer.type(gueltig, '2199-01-01');
    expect(knopf).toBeDisabled();
  });

  it('ein Entwurf: der Dialog sagt, dass er damit versendet ist; ein offener Link: dass er aufhört', async () => {
    const nutzer = userEvent.setup();
    angebot = { ...ANGEBOT, status: 'Entwurf' };
    links = [LINK];
    zeige();
    await nutzer.click(await screen.findByRole('button', { name: 'Annahme-Link' }));
    const fenster = await screen.findByRole('dialog', { name: 'Annahme-Link' });
    expect(within(fenster).getByText(/gilt damit als versendet/)).toBeInTheDocument();
    expect(within(fenster).getByText(/bisherige Link hört damit auf/)).toBeInTheDocument();
  });

  it('nur die Führung, nur mit eingeschalteter Annahme per Link, nur für ein offenes Angebot, nicht im Einblick', async () => {
    const { unmount } = zeige();
    expect(await screen.findByRole('button', { name: 'Annahme-Link' })).toBeInTheDocument();
    unmount();
    for (const fall of [
      () => { rolle.wert = 'Buchhaltung'; },
      () => { module = { 'angebote.online_annahme': false }; },
      () => { angebot = { ...ANGEBOT, status: 'Angenommen', projectNumber: 'B-1' }; },
      () => { angebot = { ...ANGEBOT, status: 'Abgelehnt' }; },
      () => { einblick = { betrieb: 'perl' }; },
    ]) {
      fall();
      const r = zeige();
      await screen.findByText('Positionen (1)');
      expect(screen.queryByRole('button', { name: 'Annahme-Link' })).toBeNull();
      r.unmount();
      angebot = { ...ANGEBOT };
      rolle.wert = 'Geschäftsführung';
      module = undefined;
      einblick = null;
    }
  });
});

describe('Der Abschnitt „Annahme per Link“', () => {
  it('ohne Link gibt es ihn nicht — und im Einblick wird gar nicht erst geladen', async () => {
    zeige();
    await screen.findByText('Positionen (1)');
    expect(screen.queryByText('Annahme per Link')).toBeNull();
    expect(listAngebotLinks).toHaveBeenCalledWith(ANGEBOT.id);
    listAngebotLinks.mockClear();
    einblick = { betrieb: 'perl' };
    const r = zeige();
    await screen.findAllByText('Positionen (1)');
    expect(listAngebotLinks).not.toHaveBeenCalled();
    r.unmount();
  });

  it('offen: bis wann, wer ihn erzeugt hat, wie oft geöffnet — Widerrufen nach Rückfrage', async () => {
    const nutzer = userEvent.setup();
    links = [{
      ...LINK, geoeffnetAnzahl: 3, zuerstGeoeffnetAm: Date.UTC(2026, 10, 3, 8, 0), zuletztGeoeffnetAm: Date.UTC(2026, 10, 4, 17, 30),
    }];
    zeige();
    const karte = (await screen.findByRole('heading', { name: 'Annahme per Link' })).closest('section')!;
    expect(within(karte).getByText('Offen bis 01.10.2099')).toBeInTheDocument();
    expect(within(karte).getByText(/Baustelle: Pauschal, Vorsatz PB/)).toBeInTheDocument();
    expect(within(karte).getByText(/Erzeugt von Carla Chefin am 02\.11\.2026, 10:00/)).toBeInTheDocument();
    expect(within(karte).getByText(/Geöffnet 3-mal, zuerst am 03\.11\.2026, 09:00, zuletzt am 04\.11\.2026, 18:30/)).toBeInTheDocument();
    // Die Sprungleiste führt hin.
    const leiste = screen.getByRole('navigation', { name: 'Auf dieser Seite' });
    expect(within(leiste).getByRole('link', { name: 'Annahme per Link' })).toHaveAttribute('href', '#angebot-annahmelink');

    await nutzer.click(within(karte).getByRole('button', { name: 'Widerrufen' }));
    const frage = await screen.findByRole('dialog', { name: 'Annahme-Link widerrufen?' });
    await nutzer.click(within(frage).getByRole('button', { name: 'Widerrufen' }));
    await waitFor(() => expect(angebotLinkWiderrufen).toHaveBeenCalledWith('l1'));
    expect(await screen.findByText('Annahme-Link widerrufen')).toBeInTheDocument();
  });

  it('angenommen: von wem, wann, mit der Unterschrift — kein Widerrufen, kein neuer Link', async () => {
    angebot = { ...ANGEBOT, status: 'Angenommen', projectNumber: 'PB-2026-0001' };
    links = [{
      ...LINK, zustand: 'angenommen', angenommenAm: Date.UTC(2026, 10, 5, 13, 5), angenommenName: 'Maria Kundin',
      angenommenUnterschrift: 'data:image/png;base64,AAAA',
    }];
    zeige();
    const karte = (await screen.findByRole('heading', { name: 'Annahme per Link' })).closest('section')!;
    expect(within(karte).getByText('Angenommen von Maria Kundin am 05.11.2026, 14:05')).toBeInTheDocument();
    expect(within(karte).getByRole('img', { name: 'Unterschrift von Maria Kundin' })).toHaveAttribute('src', 'data:image/png;base64,AAAA');
    expect(within(karte).queryByRole('button', { name: 'Widerrufen' })).toBeNull();
    expect(within(karte).queryByRole('button', { name: 'Neuer Link' })).toBeNull();
    expect(within(karte).getByText('a'.repeat(64))).toBeInTheDocument();
  });

  it('abgelehnt mit Grund; frühere Links stehen darunter; ein neuer geht, wenn das Angebot offen ist', async () => {
    links = [
      { ...LINK, id: 'l2', zustand: 'widerrufen', widerrufenAm: Date.UTC(2026, 10, 6, 8, 0), widerrufenVonName: 'Carla Chefin' },
      { ...LINK, id: 'l1', zustand: 'abgelaufen', gueltigBis: '2026-11-01' },
    ];
    zeige();
    const karte = (await screen.findByRole('heading', { name: 'Annahme per Link' })).closest('section')!;
    expect(within(karte).getByText(/Widerrufen von Carla Chefin am 06\.11\.2026, 09:00/)).toBeInTheDocument();
    expect(within(karte).getByText(/Abgelaufen am 01\.11\.2026/)).toBeInTheDocument();
    expect(within(karte).getByRole('button', { name: 'Neuer Link' })).toBeInTheDocument();
  });

  it('öffnet die Führung ein über den Link angenommenes Angebot, geht der Hinweis auf der Startseite (gesehen)', async () => {
    angebot = { ...ANGEBOT, status: 'Angenommen', projectNumber: 'PB-2026-0001' };
    links = [{ ...LINK, zustand: 'angenommen', angenommenAm: Date.UTC(2026, 10, 5, 13, 5), angenommenName: 'Maria Kundin' }];
    const r = zeige();
    await waitFor(() => expect(angebotLinkGesehen).toHaveBeenCalledWith('l1'));
    r.unmount();
    // Gegenprobe: schon gesehen, nicht angenommen, die Buchhaltung oder der Einblick — kein Vermerk.
    for (const fall of [
      () => { links = [{ ...links[0], gesehenAm: Date.UTC(2026, 10, 5, 14, 0) }]; },
      () => { links = [{ ...LINK }]; },
      () => { rolle.wert = 'Buchhaltung'; },
      () => { einblick = { betrieb: 'perl' }; },
    ]) {
      links = [{ ...LINK, zustand: 'angenommen', angenommenAm: Date.UTC(2026, 10, 5, 13, 5), angenommenName: 'Maria Kundin' }];
      rolle.wert = 'Geschäftsführung';
      einblick = null;
      fall();
      angebotLinkGesehen.mockClear();
      const z = zeige();
      await screen.findByText('Positionen (1)');
      await new Promise((w) => setTimeout(w, 20));
      expect(angebotLinkGesehen).not.toHaveBeenCalled();
      z.unmount();
    }
  });

  it('abgelehnt: der Grund steht da', async () => {
    angebot = { ...ANGEBOT, status: 'Abgelehnt' };
    links = [{ ...LINK, zustand: 'abgelehnt', abgelehntAm: Date.UTC(2026, 10, 5, 13, 5), abgelehntName: 'Maria Kundin', abgelehntGrund: 'Zu teuer' }];
    zeige();
    const karte = (await screen.findByRole('heading', { name: 'Annahme per Link' })).closest('section')!;
    expect(within(karte).getByText('Abgelehnt von Maria Kundin am 05.11.2026, 14:05')).toBeInTheDocument();
    expect(within(karte).getByText('Grund: Zu teuer')).toBeInTheDocument();
  });

  it('ist die Annahme per Link ausgeschaltet, sagt der Abschnitt, dass der Link nicht antwortet', async () => {
    module = { 'angebote.online_annahme': false };
    links = [LINK];
    zeige();
    const karte = (await screen.findByRole('heading', { name: 'Annahme per Link' })).closest('section')!;
    expect(within(karte).getByText(/Annahme per Link ist ausgeschaltet/)).toBeInTheDocument();
    expect(within(karte).queryByRole('button', { name: 'Neuer Link' })).toBeNull();
  });

  it('scheitert das Laden, sagt ein Teilfehler es — das Angebot bleibt lesbar', async () => {
    listAngebotLinks.mockRejectedValueOnce(new Error('kein Netz'));
    zeige();
    expect(await screen.findByText(/die Annahme-Links/)).toBeInTheDocument();
    expect(screen.getByText('Positionen (1)')).toBeInTheDocument();
  });
});
