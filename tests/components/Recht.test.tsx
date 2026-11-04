import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, within, fireEvent } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import ImpressumView from '@/features/recht/ImpressumView';
import DatenschutzView from '@/features/recht/DatenschutzView';
import RechtLinks from '@/components/RechtLinks';
import { LEERER_BETREIBER, type GeltendeTexte } from '@/features/recht/rechtstext';

/**
 * Impressum und Datenschutz.
 *
 * Geprüft wird nicht der Rechtstext — den gibt jemand mit Rechtskenntnis
 * frei —, sondern dass die Seiten ehrlich sind: solange nicht geprüft oder
 * eine Angabe offen ist, steht „Entwurf" darüber; jeder Unterauftragsverarbeiter
 * steht auf der Seite; die Wege dorthin gibt es. Seit 04.11.2026 (E45) kommt
 * der Text aus der Datenbank; hier aus einer nachgebildeten Antwort, den
 * echten Weg prüfen `tests/supabase/rechtstexte.test.ts` und der Browser.
 */

const lade = vi.fn<() => Promise<GeltendeTexte>>();
vi.mock('@/lib/db/rechtstexte', () => ({ rechtstexteAktuell: () => lade() }));

const VERARBEITER = [
  { wer: 'Supabase Inc.', wofuer: 'Datenbank', wo: 'EU' },
  { wer: '[Mailanbieter — wird ergänzt]', wofuer: 'Mails', wo: '[Standort — wird ergänzt]' },
];
const fassung = <T,>(inhalt: T, rest: Partial<{ geprueft: boolean; veroeffentlichtAm: string; nummer: number }> = {}) => ({
  nummer: 1, inhalt, veroeffentlichtAm: '2026-10-05T10:00:00+00:00', geprueft: false, hinweisen: false, neueVerarbeiter: [], ...rest,
});
const TEXTE: GeltendeTexte = {
  betreiber: fassung({ ...LEERER_BETREIBER }),
  impressum: fassung({ abschnitte: [
    { titel: 'Medieninhaber und Diensteanbieter', text: '{Name}\n{Anschrift}\n\nE-Mail: {E-Mail}' },
    { titel: 'Grundlegende Richtung', text: 'Eine **Arbeitsanwendung**. Siehe [RIS](https://www.ris.bka.gv.at). <img src=x onerror=alert(1)>' },
  ] }),
  datenschutz: fassung({
    abschnitte: [
      { titel: 'Wer die Daten technisch verarbeitet', text: 'Der Betreiber setzt diese Unterauftragsverarbeiter ein:\n\n{Unterauftragsverarbeiter}' },
      { titel: 'Deine Rechte', text: 'Beschwerden bei der Österreichischen Datenschutzbehörde.' },
    ],
    verarbeiter: VERARBEITER,
  }),
};

const zeige = (el: JSX.Element) => render(<MemoryRouter>{el}</MemoryRouter>);

beforeEach(() => {
  lade.mockReset();
  lade.mockResolvedValue(TEXTE);
});

describe('Rechtsseiten', () => {
  it('kennzeichnen den Entwurf, solange die Fassung nicht freigegeben ist', async () => {
    zeige(<ImpressumView />);
    expect(await screen.findByRole('note')).toHaveTextContent('Dieser Text ist noch nicht rechtlich geprüft');
    expect(screen.getByRole('heading', { level: 1, name: 'Impressum' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Zur App' })).toHaveAttribute('href', '/');
    expect(screen.getByText('Stand: 05.10.2026')).toBeInTheDocument();
  });

  it('nennt im Impressum den Betreiber der Software; ein leeres Feld steht in eckigen Klammern', async () => {
    zeige(<ImpressumView />);
    expect(await screen.findByText('Medieninhaber und Diensteanbieter')).toBeInTheDocument();
    expect(screen.getByText(/Name bzw. Firma des Betreibers — wird ergänzt/)).toBeInTheDocument();
  });

  it('setzt die Betreiberangaben ein; „Stand“ ist die jüngere Fassung; geprüft und vollständig fällt das Band', async () => {
    lade.mockResolvedValue({
      ...TEXTE,
      betreiber: fassung({ ...LEERER_BETREIBER, name: 'Senklot Prüf GmbH', anschrift: 'Lotgasse 1\n1010 Wien', email: 'office@senklot.test' }, { veroeffentlichtAm: '2026-11-04T16:00:00+00:00', nummer: 2 }),
      impressum: fassung(TEXTE.impressum!.inhalt, { geprueft: true }),
    });
    const { container } = zeige(<ImpressumView />);
    expect(await screen.findByText(/Senklot Prüf GmbH/)).toBeInTheDocument();
    expect(container.querySelector('.recht p')!.innerHTML).toBe('Senklot Prüf GmbH<br>Lotgasse 1<br>1010 Wien');
    expect(screen.getByText('Stand: 04.11.2026')).toBeInTheDocument();
    expect(screen.queryByRole('note')).not.toBeInTheDocument();
  });

  it('geprüft, aber mit offener Angabe: das Band bleibt — ohne zu behaupten, der Text sei ungeprüft', async () => {
    lade.mockResolvedValue({ ...TEXTE, datenschutz: fassung(TEXTE.datenschutz!.inhalt, { geprueft: true }) });
    zeige(<DatenschutzView />);
    const band = await screen.findByRole('note');
    expect(band).toHaveTextContent('Entwurf. Angaben in eckigen Klammern werden ergänzt.');
    expect(band).not.toHaveTextContent('nicht rechtlich geprüft');
  });

  it('setzt fett und Verweis, lässt Markup als Text stehen und führt nichts davon aus', async () => {
    const { container } = zeige(<ImpressumView />);
    expect(await screen.findByText('Arbeitsanwendung', { selector: 'strong' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'RIS' })).toHaveAttribute('href', 'https://www.ris.bka.gv.at');
    expect(screen.getByText(/<img src=x onerror=alert\(1\)>/)).toBeInTheDocument();
    expect(container.querySelector('.recht img')).toBeNull();
  });

  it('führt in der Datenschutzerklärung jeden Unterauftragsverarbeiter als Zeile mit Linie auf', async () => {
    const { container } = zeige(<DatenschutzView />);
    const abschnitt = (await screen.findByRole('heading', { name: 'Wer die Daten technisch verarbeitet' })).closest('section')!;
    for (const v of VERARBEITER) expect(within(abschnitt).getByText(v.wer)).toBeInTheDocument();
    expect(container.querySelectorAll('ul.recht-liste > li')).toHaveLength(VERARBEITER.length);
    expect(container.querySelector('.border-l-2')).toBeNull();
    expect(screen.getByText(/Österreichischen Datenschutzbehörde/)).toBeInTheDocument();
  });

  it('sagt ehrlich, wenn der Text nicht lädt, und lädt auf Wunsch erneut — ohne einen mitgelieferten Ersatztext', async () => {
    lade.mockRejectedValueOnce(new Error('Netz weg'));
    zeige(<ImpressumView />);
    expect(await screen.findByText(/Der Text ließ sich nicht laden: Netz weg/)).toBeInTheDocument();
    expect(screen.queryByText('Medieninhaber und Diensteanbieter')).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /Erneut/ }));
    expect(await screen.findByText('Medieninhaber und Diensteanbieter')).toBeInTheDocument();
  });

  /*
    LINIE „LOT“ (E44, 04.11.2026): Seitenkopf wie in der App (Ortszeile,
    Titel, Stand), der Text auf einem Blatt im Raster, „Entwurf“ als
    Hinweiszeile, kein dunkles Band. Die Lage auf dem Raster misst
    `tests/durchklick/rechtLot.spec.ts` im Browser.
  */
  it('stehen im Aufbau der Linie „Lot“: Raster, Seitenkopf, ein Blatt, Hinweiszeile', async () => {
    const { container } = zeige(<ImpressumView />);
    await screen.findByText('Medieninhaber und Diensteanbieter');
    expect(container.querySelector('.hauptflaeche > main.inhalt')).not.toBeNull();
    expect(container.querySelector('.panel-dark')).toBeNull();
    const kopf = container.querySelector('.plankopf') as HTMLElement;
    expect(within(kopf).getByText('Rechtliches')).toBeInTheDocument();
    expect(within(kopf).getByRole('heading', { level: 1, name: 'Impressum' })).toBeInTheDocument();
    expect(within(kopf).getByText(/^Stand: \d{2}\.\d{2}\.\d{4}$/)).toBeInTheDocument();
    expect(container.querySelectorAll('.inhalt .karte')).toHaveLength(1);
    expect(screen.getByRole('note').querySelector('.hinweiszeile-warn')).not.toBeNull();
    expect(screen.getByRole('link', { name: 'Datenschutz' })).toHaveAttribute('href', '/datenschutz');
  });

  it('verlinkt beide Seiten', () => {
    zeige(<RechtLinks />);
    expect(screen.getByRole('link', { name: 'Datenschutz' })).toHaveAttribute('href', '/datenschutz');
    expect(screen.getByRole('link', { name: 'Impressum' })).toHaveAttribute('href', '/impressum');
  });
});
