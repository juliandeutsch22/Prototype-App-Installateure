import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ToastProvider } from '@/components/Toast';

/**
 * Der Kundenimport in der Ansicht: erst der Probelauf, dann die Übernahme.
 *
 * Was hier zählt, ist dasselbe wie beim Katalog: bis zum zweiten Klick ist
 * nichts geschrieben; was nicht mitkommt, steht mit Zeile und Grund da; und
 * übernommen wird genau das, was als „neu" gezählt wurde.
 */

const vorhanden = vi.fn();
const einspielen = vi.fn();
vi.mock('@/lib/db/customers', () => ({
  kundenVorhanden: (...a: unknown[]) => vorhanden(...a),
  kundenEinspielen: (...a: unknown[]) => einspielen(...a),
}));

const { default: KundenImport } = await import('@/features/customers/KundenImport');

function datei(inhalt: string, name = 'kunden.csv'): File {
  const f = new File([inhalt], name, { type: 'text/csv' });
  Object.defineProperty(f, 'arrayBuffer', {
    value: () => Promise.resolve(new TextEncoder().encode(inhalt).buffer),
  });
  return f;
}

const CSV =
  'Firma;Vorname;Nachname;Straße;PLZ;Ort;Telefon;E-Mail;Umsatz\n' +
  'Berger Bau;Anna;Berger;Hauptstraße 1;1010;Wien;01 234;office@berger.at;100\n' +
  ';Franz;Huber;Dorfweg 3;3100;St. Pölten;;;\n' +
  'Kaputt KG;;;;;;;keine-mail;\n' +
  'Maier GmbH;;;;;;;;\n';

let fertig: ReturnType<typeof vi.fn>;

function zeige() {
  fertig = vi.fn();
  return render(
    <ToastProvider>
      <KundenImport onUebernommen={fertig} />
    </ToastProvider>,
  );
}

beforeEach(() => {
  vorhanden.mockReset();
  einspielen.mockReset();
});

describe('Kunden aus einer Datei', () => {
  it('zeigt den Probelauf: neu, vorhanden, fehlerhaft — und schreibt noch nichts', async () => {
    // Die Datenbank kennt „Maier GmbH" schon — Stelle 2 in der Liste der gültigen Kunden.
    vorhanden.mockResolvedValue([2]);
    zeige();
    await userEvent.upload(screen.getByLabelText('CSV-Datei'), datei(CSV));

    expect(await screen.findByText('Probelauf')).toBeInTheDocument();
    expect(vorhanden).toHaveBeenCalledWith([
      expect.objectContaining({ name: 'Berger Bau' }),
      expect.objectContaining({ name: 'Franz Huber' }),
      expect.objectContaining({ name: 'Maier GmbH' }),
    ]);
    expect(screen.getByText('Nicht übernommen (2)')).toBeInTheDocument();
    expect(screen.getByText('Zeile 4: E-Mail-Adresse „keine-mail" ist ungültig')).toBeInTheDocument();
    expect(screen.getByText('Zeile 5: Gibt es schon als Kunden')).toBeInTheDocument();
    expect(screen.getByText(/Nicht übernommen: Umsatz/)).toBeInTheDocument();
    expect(screen.getByText(/Straße → Adresse \(Straße\)/)).toBeInTheDocument();
    expect(screen.getByText('Berger Bau')).toBeInTheDocument();
    expect(einspielen).not.toHaveBeenCalled();
    expect(screen.getByRole('button', { name: '2 Kunden übernehmen' })).toBeEnabled();
  });

  it('übernimmt genau die neuen, meldet das Ergebnis und lädt die Liste neu', async () => {
    vorhanden.mockResolvedValue([2]);
    einspielen.mockResolvedValue({ angelegt: 2, uebersprungen: 0 });
    const nutzer = userEvent.setup();
    zeige();
    await nutzer.upload(screen.getByLabelText('CSV-Datei'), datei(CSV));
    await nutzer.click(await screen.findByRole('button', { name: '2 Kunden übernehmen' }));

    await waitFor(() => expect(einspielen).toHaveBeenCalledTimes(1));
    expect(einspielen.mock.calls[0][0].map((k: { name: string }) => k.name)).toEqual(['Berger Bau', 'Franz Huber']);
    expect(einspielen.mock.calls[0][0][0]).toMatchObject({
      contactName: 'Anna Berger', address: 'Hauptstraße 1, 1010 Wien', email: 'office@berger.at',
    });
    expect(await screen.findByText('2 Kunden angelegt')).toBeInTheDocument();
    expect(screen.getByText(/Übernommen: 2 angelegt/)).toBeInTheDocument();
    expect(fertig).toHaveBeenCalled();
  });

  it('bleibt im Probelauf und sagt warum, wenn die Übernahme scheitert', async () => {
    vorhanden.mockResolvedValue([]);
    einspielen.mockRejectedValue(new Error('Kunden übernehmen dürfen Projektleitung, Geschäftsführung und Administration'));
    const nutzer = userEvent.setup();
    zeige();
    await nutzer.upload(screen.getByLabelText('CSV-Datei'), datei(CSV));
    await nutzer.click(await screen.findByRole('button', { name: '3 Kunden übernehmen' }));
    expect(await screen.findByText(/dürfen Projektleitung/)).toBeInTheDocument();
    expect(screen.getByText('Probelauf')).toBeInTheDocument();
    expect(fertig).not.toHaveBeenCalled();
  });

  it('sagt, wenn die Datei keine Namensspalte hat — und fragt die Datenbank gar nicht erst', async () => {
    zeige();
    await userEvent.upload(screen.getByLabelText('CSV-Datei'), datei('Ort;PLZ\nWien;1010'));
    expect(await screen.findByText(/keine Spalte für den Namen/)).toBeInTheDocument();
    expect(vorhanden).not.toHaveBeenCalled();
  });

  it('lässt nichts übernehmen, wenn es nichts Neues gibt, und Verwerfen führt zurück', async () => {
    vorhanden.mockResolvedValue([0]);
    const nutzer = userEvent.setup();
    zeige();
    await nutzer.upload(screen.getByLabelText('CSV-Datei'), datei('Name\nHuber'));
    expect(await screen.findByRole('button', { name: '0 Kunden übernehmen' })).toBeDisabled();
    await nutzer.click(screen.getByRole('button', { name: 'Verwerfen' }));
    expect(screen.getByLabelText('CSV-Datei')).toBeInTheDocument();
  });
});
