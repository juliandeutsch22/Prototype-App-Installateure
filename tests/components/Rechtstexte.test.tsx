import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react';
import { ToastProvider } from '@/components/Toast';
import Rechtstexte from '@/features/plattform/Rechtstexte';
import { LEERER_BETREIBER, type RechtstextArt } from '@/features/recht/rechtstext';
import type { RechtstextZeile } from '@/lib/db/rechtstexte';

/**
 * Der Bereich „Rechtstexte“ der Plattform (E45): Übersicht, Editor,
 * Veröffentlichen, Fassungen. Die Datenschicht ist nachgebildet; den echten
 * Weg prüfen `tests/supabase/rechtstexte.test.ts` und
 * `tests/durchklick/rechtstexte.spec.ts`.
 */

const verlauf = vi.fn<(art: RechtstextArt) => Promise<RechtstextZeile[]>>();
const speichern = vi.fn<(art: RechtstextArt, inhalt: unknown) => Promise<void>>();
const verwerfen = vi.fn<(art: RechtstextArt) => Promise<void>>();
const veroeffentlichen = vi.fn<(art: RechtstextArt, o: { geprueft: boolean; geprueftVon: string; hinweisen: boolean }) => Promise<number>>();
vi.mock('@/lib/db/rechtstexte', () => ({
  rechtstextVerlauf: (a: RechtstextArt) => verlauf(a),
  rechtstextEntwurfSpeichern: (a: RechtstextArt, i: unknown) => speichern(a, i),
  rechtstextEntwurfVerwerfen: (a: RechtstextArt) => verwerfen(a),
  rechtstextVeroeffentlichen: (a: RechtstextArt, o: { geprueft: boolean; geprueftVon: string; hinweisen: boolean }) => veroeffentlichen(a, o),
}));

const zeile = (art: RechtstextArt, nummer: number | null, inhalt: unknown, rest: Partial<RechtstextZeile> = {}): RechtstextZeile => ({
  id: Math.round(Math.random() * 1e9), art, nummer, inhalt: inhalt as RechtstextZeile['inhalt'],
  veroeffentlichtAm: nummer == null ? null : '2026-10-05T10:00:00+00:00', geprueft: false, geprueftVon: null, hinweisen: false,
  neueVerarbeiter: [], geaendertAm: '2026-11-04T10:00:00+00:00', ...rest,
});
const VOLL = { name: 'Senklot Prüf GmbH', anschrift: 'Lotgasse 1', email: 'office@senklot.test', telefon: '1', uid: 'ATU1', firmenbuch: 'FN 1', gewerbe: 'IT' };
let daten: Record<RechtstextArt, RechtstextZeile[]>;

beforeEach(() => {
  daten = {
    betreiber: [zeile('betreiber', 1, { ...LEERER_BETREIBER })],
    impressum: [zeile('impressum', 1, { abschnitte: [{ titel: 'Medieninhaber', text: '{Name}\n{Telefon}' }] })],
    datenschutz: [zeile('datenschutz', 1, { abschnitte: [{ titel: 'Verarbeiter', text: '{Unterauftragsverarbeiter}' }], verarbeiter: [{ wer: 'Supabase Inc.', wofuer: 'Datenbank', wo: 'EU' }] })],
  };
  verlauf.mockReset().mockImplementation(async (a) => daten[a]);
  speichern.mockReset().mockResolvedValue();
  verwerfen.mockReset().mockResolvedValue();
  veroeffentlichen.mockReset().mockResolvedValue(2);
});

const zeige = () => render(<ToastProvider><Rechtstexte /></ToastProvider>);
const oeffnen = async (name: RegExp) => fireEvent.click(await screen.findByRole('button', { name }));

describe('Übersicht', () => {
  it('nennt je Text die geltende Fassung, ob geprüft, einen offenen Entwurf und was fehlt', async () => {
    daten.impressum.unshift(zeile('impressum', null, daten.impressum[0].inhalt));
    zeige();
    const zeileVon = (name: RegExp) => screen.getByRole('button', { name }).closest('li')!;
    await screen.findByRole('button', { name: /Angaben zum Betreiber/ });
    const betreiber = zeileVon(/Angaben zum Betreiber/);
    expect(betreiber).toHaveTextContent('Fassung 1 vom 05.10.2026');
    expect(betreiber).toHaveTextContent('7 von 7 Feldern leer');
    const impressum = zeileVon(/^Impressum/);
    expect(impressum).toHaveTextContent('nicht rechtlich geprüft');
    expect(impressum).toHaveTextContent('Entwurf vom 04.11.2026');
    expect(impressum).toHaveTextContent('2 Angaben offen');
  });
});

describe('Editor', () => {
  it('Betreiberangaben: ändern, als Entwurf speichern, veröffentlichen — „geprüft“ gibt es dort nicht', async () => {
    zeige();
    await oeffnen(/Angaben zum Betreiber/);
    const speichernKnopf = screen.getByRole('button', { name: 'Entwurf speichern' });
    expect(speichernKnopf).toBeDisabled();
    fireEvent.change(screen.getByLabelText(/^Name bzw\. Firma/), { target: { value: 'Senklot Prüf GmbH' } });
    expect(speichernKnopf).toBeEnabled();
    fireEvent.click(speichernKnopf);
    await waitFor(() => expect(speichern).toHaveBeenCalledWith('betreiber', { ...LEERER_BETREIBER, name: 'Senklot Prüf GmbH' }));

    fireEvent.click(screen.getByRole('button', { name: 'Veröffentlichen …' }));
    const dialog = await screen.findByRole('dialog', { name: 'Angaben zum Betreiber veröffentlichen' });
    expect(dialog).toHaveTextContent('Wird Fassung 2.');
    expect(dialog).toHaveTextContent('Geändert: Name bzw. Firma.');
    expect(within(dialog).queryByLabelText('Rechtlich geprüft und freigegeben')).not.toBeInTheDocument();
    fireEvent.click(within(dialog).getByRole('button', { name: 'Veröffentlichen' }));
    await waitFor(() => expect(veroeffentlichen).toHaveBeenCalledWith('betreiber', { geprueft: false, geprueftVon: '', hinweisen: false }));
  });

  it('ein vertippter Platzhalter sperrt „Veröffentlichen“ und sagt, was falsch ist', async () => {
    zeige();
    await oeffnen(/^Impressum/);
    fireEvent.change(screen.getByLabelText('Text 1'), { target: { value: '{Nmae}' } });
    expect(screen.getByText(/\{Nmae\} ist kein bekannter Platzhalter/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Veröffentlichen …' })).toBeDisabled();
  });

  it('„geprüft“ geht erst ohne offene Angaben, und dann nur mit dem Namen dessen, der geprüft hat', async () => {
    zeige();
    await oeffnen(/^Impressum/);
    fireEvent.click(screen.getByRole('button', { name: 'Veröffentlichen …' }));
    const dialog = await screen.findByRole('dialog', { name: 'Impressum veröffentlichen' });
    expect(within(dialog).getByLabelText('Rechtlich geprüft und freigegeben')).toBeDisabled();
    expect(dialog).toHaveTextContent('Erst ohne offene Angaben');
  });

  it('Gegenprobe: mit vollständigen Betreiberangaben ist nichts offen, und „geprüft“ lässt sich wählen', async () => {
    daten.betreiber = [zeile('betreiber', 2, VOLL)];
    zeige();
    await oeffnen(/^Impressum/);
    fireEvent.click(screen.getByRole('button', { name: 'Veröffentlichen …' }));
    const dialog = await screen.findByRole('dialog', { name: 'Impressum veröffentlichen' });
    expect(within(dialog).getByLabelText('Rechtlich geprüft und freigegeben')).toBeEnabled();
    expect(dialog).not.toHaveTextContent('Erst ohne offene Angaben');
  });

  it('veröffentlicht geprüft mit Namen; die Datenschutzerklärung nennt neue Unterauftragsverarbeiter und weist auf Wunsch alle hin', async () => {
    daten.betreiber = [zeile('betreiber', 2, VOLL)];
    zeige();
    await oeffnen(/^Datenschutzerklärung/);
    fireEvent.click(screen.getByRole('button', { name: 'Unterauftragsverarbeiter hinzufügen' }));
    fireEvent.change(screen.getByLabelText('Anbieter 2'), { target: { value: 'Prüfpost GmbH' } });
    fireEvent.change(screen.getAllByLabelText('Zweck')[1], { target: { value: 'Mails' } });
    fireEvent.change(screen.getAllByLabelText('Standort')[1], { target: { value: 'Wien' } });
    expect(screen.getByText('neu gegenüber der geltenden Fassung')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Veröffentlichen …' }));
    const dialog = await screen.findByRole('dialog', { name: 'Datenschutzerklärung veröffentlichen' });
    expect(dialog).toHaveTextContent('Neue Unterauftragsverarbeiter: Prüfpost GmbH.');
    expect(dialog).toHaveTextContent('Die Geschäftsführung und die Administration jedes Betriebs bekommen dazu einen Hinweis');
    fireEvent.click(within(dialog).getByLabelText('Rechtlich geprüft und freigegeben'));
    const los = within(dialog).getByRole('button', { name: 'Veröffentlichen' });
    expect(los).toBeDisabled();
    fireEvent.change(within(dialog).getByLabelText(/Geprüft von/), { target: { value: 'Kanzlei Muster' } });
    expect(los).toBeEnabled();
    expect(within(dialog).getByLabelText('Alle, die die App benutzen, auf die Änderung hinweisen')).toBeChecked();
    fireEvent.click(los);
    await waitFor(() => expect(veroeffentlichen).toHaveBeenCalledWith('datenschutz', { geprueft: true, geprueftVon: 'Kanzlei Muster', hinweisen: true }));
    // Erst gespeichert, dann veröffentlicht — veröffentlicht wird, was im Editor steht.
    expect(speichern).toHaveBeenCalledWith('datenschutz', expect.objectContaining({
      verarbeiter: [{ wer: 'Supabase Inc.', wofuer: 'Datenbank', wo: 'EU' }, { wer: 'Prüfpost GmbH', wofuer: 'Mails', wo: 'Wien' }],
    }));
    expect(speichern.mock.invocationCallOrder[0]).toBeLessThan(veroeffentlichen.mock.invocationCallOrder[0]);
  });

  it('ein Entwurf lässt sich verwerfen; eine frühere Fassung lässt sich als Entwurf übernehmen', async () => {
    daten.impressum = [
      zeile('impressum', null, { abschnitte: [{ titel: 'Neu', text: 'x' }] }),
      zeile('impressum', 2, { abschnitte: [{ titel: 'Zwei', text: 'y' }] }),
      zeile('impressum', 1, { abschnitte: [{ titel: 'Eins', text: 'z' }] }),
    ];
    zeige();
    await oeffnen(/^Impressum/);
    expect(screen.getByLabelText('Überschrift 1')).toHaveValue('Neu');
    fireEvent.click(screen.getByRole('button', { name: 'Fassung 1 als Entwurf übernehmen' }));
    expect(screen.getByLabelText('Überschrift 1')).toHaveValue('Eins');
    fireEvent.click(screen.getByRole('button', { name: 'Entwurf verwerfen' }));
    const dialog = await screen.findByRole('dialog', { name: 'Entwurf verwerfen' });
    expect(dialog).toHaveTextContent('Es gilt weiter Fassung 2.');
    fireEvent.click(within(dialog).getByRole('button', { name: 'Verwerfen' }));
    await waitFor(() => expect(verwerfen).toHaveBeenCalledWith('impressum'));
  });

  it('wer mit ungespeicherten Änderungen zurückgeht, wird gefragt', async () => {
    zeige();
    await oeffnen(/^Impressum/);
    fireEvent.change(screen.getByLabelText('Überschrift 1'), { target: { value: 'Anders' } });
    fireEvent.click(screen.getByRole('button', { name: '← Rechtstexte' }));
    const dialog = await screen.findByRole('dialog', { name: 'Nicht gespeicherte Änderungen' });
    fireEvent.click(within(dialog).getByRole('button', { name: 'Änderungen verwerfen' }));
    expect(await screen.findByRole('heading', { level: 1, name: 'Rechtstexte' })).toBeInTheDocument();
    expect(speichern).not.toHaveBeenCalled();
  });

  it('die Vorschau setzt den Entwurf wie die Seite', async () => {
    daten.betreiber = [zeile('betreiber', 2, VOLL)];
    zeige();
    await oeffnen(/^Impressum/);
    fireEvent.change(screen.getByLabelText('Text 1'), { target: { value: 'Betreiber: **{Name}**' } });
    fireEvent.click(screen.getByRole('button', { name: 'Vorschau' }));
    const vorschau = await screen.findByRole('dialog', { name: /Impressum: Vorschau/ });
    expect(within(vorschau).getByText('Senklot Prüf GmbH', { selector: 'strong' })).toBeInTheDocument();
  });
});
