import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react';
import { ToastProvider } from '@/components/Toast';
import Datenauskunft from '@/features/recht/Datenauskunft';
import { auskunftDateiname, zeigtAuskunft } from '@/features/recht/auskunftDatei';

/**
 * Die Karte „Datenauskunft" in Benutzer- und Kundenakte (DSGVO Art. 15,
 * offene Punkte B8). Was hineingehört, prüft `tests/supabase/datenauskunft.test.ts`
 * gegen die Datenbank; hier: wer den Knopf sieht, dass er die richtige
 * Person holt und als Datei speichert, und dass eine Absage lesbar ankommt.
 */

let auth: { user: { role: string } | null; einblick: unknown } = { user: null, einblick: null };
vi.mock('@/app/AuthContext', () => ({ useAuth: () => auth }));

const holen = vi.fn();
const loeschen = vi.fn();
vi.mock('@/lib/db/auskunft', () => ({
  personAuskunft: (...a: unknown[]) => holen(...a),
  personLoeschen: (...a: unknown[]) => loeschen(...a),
}));

const geloescht = vi.fn();
const zeichne = () =>
  render(
    <ToastProvider>
      <Datenauskunft art="kunde" id="k-1" onGeloescht={geloescht} />
    </ToastProvider>,
  );

beforeEach(() => {
  holen.mockReset();
  loeschen.mockReset();
  geloescht.mockReset();
  auth = { user: { role: 'Geschäftsführung' }, einblick: null };
});

describe('Wer die Auskunft holt', () => {
  it('die Geschäftsführung und die Administration', () => {
    expect(zeigtAuskunft('Geschäftsführung', false)).toBe(true);
    expect(zeigtAuskunft('Administrator', false)).toBe(true);
  });

  it('sonst niemand — und im Supporteinblick auch die Administration nicht', () => {
    for (const r of ['Buchhaltung', 'Verwaltung', 'Projektleiter', 'Mitarbeiter'] as const) {
      expect(zeigtAuskunft(r, false)).toBe(false);
    }
    expect(zeigtAuskunft('Administrator', true)).toBe(false);
    expect(zeigtAuskunft(undefined, false)).toBe(false);
  });

  it('die Karte fehlt, wo der Knopf nur abgewiesen würde', () => {
    auth = { user: { role: 'Buchhaltung' }, einblick: null };
    const { container } = zeichne();
    expect(container.textContent).not.toContain('Auskunft herunterladen');
  });
});

describe('Der Knopf', () => {
  it('holt die Auskunft dieser Person und speichert sie als Datei', async () => {
    holen.mockResolvedValue({ person: 'Familie Huber', erstellt_am: '2026-09-29T10:00:00Z', daten: {} });
    const url = vi.fn(() => 'blob:auskunft');
    const frei = vi.fn();
    Object.assign(URL, { createObjectURL: url, revokeObjectURL: frei });
    const klick = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {});

    zeichne();
    fireEvent.click(screen.getByRole('button', { name: 'Auskunft herunterladen' }));

    await waitFor(() => expect(klick).toHaveBeenCalled());
    expect(holen).toHaveBeenCalledWith('kunde', 'k-1');
    const a = klick.mock.instances[0] as unknown as HTMLAnchorElement;
    expect(a.download).toBe('datenauskunft-Familie-Huber-2026-09-29.json');
    expect(frei).toHaveBeenCalledWith('blob:auskunft');
    klick.mockRestore();
  });

  it('zeigt die Absage der Datenbank, wie sie ist', async () => {
    holen.mockRejectedValue(new Error('Die Auskunft ist mit 9 MB zu groß für den Abruf in der App.'));
    zeichne();
    fireEvent.click(screen.getByRole('button', { name: 'Auskunft herunterladen' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('9 MB zu groß');
  });
});

describe('Das Löschen', () => {
  const bericht = (geloescht: boolean, ganz = false) => ({
    art: 'kunde', person: 'Familie Huber', geloescht, ganz,
    hinweis: 'Der Kunde bleibt inaktiv.',
    sofort: { wartungen: 1, kontaktdaten: 0 },
    aufbewahren: [{ was: 'Rechnungen samt Zahlungen', anzahl: 3, bis: '2033-12-31', grund: '§ 132 BAO' }],
  });

  it('zeigt erst den Probelauf — was geht, was bis wann bleibt — und löscht erst danach', async () => {
    loeschen.mockImplementation((_a: string, _id: string, nurPruefen: boolean) =>
      Promise.resolve(bericht(!nurPruefen)));
    zeichne();
    fireEvent.click(screen.getByRole('button', { name: 'Löschen …' }));

    const dialog = await screen.findByRole('dialog');
    expect(loeschen).toHaveBeenCalledWith('kunde', 'k-1', true);
    expect(dialog).toHaveTextContent('Wartungen: 1');
    // Was null Einträge hat, steht nicht in der Liste.
    expect(dialog).not.toHaveTextContent('Kontaktdaten');
    expect(dialog).toHaveTextContent('Rechnungen samt Zahlungen: 3, bis 31.12.2033');
    expect(geloescht).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole('button', { name: 'Jetzt löschen' }));
    await waitFor(() => expect(geloescht).toHaveBeenCalledWith(false));
    expect(loeschen).toHaveBeenLastCalledWith('kunde', 'k-1', false);
  });

  it('nennt die Auftragseingänge, die mitgehen, beim Namen (M02b)', async () => {
    loeschen.mockImplementation((_a: string, _id: string, nurPruefen: boolean) =>
      Promise.resolve({ ...bericht(!nurPruefen), sofort: { wartungen: 0, kontaktdaten: 0, auftragseingaenge: 2 } }));
    zeichne();
    fireEvent.click(screen.getByRole('button', { name: 'Löschen …' }));
    expect(await screen.findByRole('dialog')).toHaveTextContent('Offene und abgelehnte Auftragseingänge: 2');
  });

  it('ein Kunde ohne Belege geht ganz — die Akte erfährt es', async () => {
    loeschen.mockImplementation((_a: string, _id: string, nurPruefen: boolean) =>
      Promise.resolve({ ...bericht(!nurPruefen, true), aufbewahren: [] }));
    zeichne();
    fireEvent.click(screen.getByRole('button', { name: 'Löschen …' }));
    expect(await screen.findByRole('dialog')).toHaveTextContent('ganz gelöscht');
    fireEvent.click(screen.getByRole('button', { name: 'Jetzt löschen' }));
    await waitFor(() => expect(geloescht).toHaveBeenCalledWith(true));
  });

  it('nennt die Absage der Datenbank, statt einen Dialog zu öffnen', async () => {
    loeschen.mockRejectedValue(new Error('Zuerst das Konto deaktivieren'));
    zeichne();
    fireEvent.click(screen.getByRole('button', { name: 'Löschen …' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Zuerst das Konto deaktivieren');
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });
});

describe('Der Löschdialog nennt jeden Teil beim Namen (Prüfbefund 09.11.2026)', () => {
  const zeichneMitarbeiter = () =>
    render(
      <ToastProvider>
        <Datenauskunft art="mitarbeiter" id="u-1" />
      </ToastProvider>,
    );
  const probe = (teil: Record<string, unknown>) => ({
    art: 'mitarbeiter', person: 'Max', geloescht: false, ganz: false, hinweis: 'Das Konto bleibt deaktiviert.',
    sofort: {}, aufbewahren: [], ...teil,
  });

  it('ohne Ende kein „bis“, und jeder Eintrag sagt seinen Grund', async () => {
    loeschen.mockResolvedValue(probe({
      aufbewahren: [
        { was: 'Zeitbuchungen', anzahl: 12, bis: '2033-12-31', grund: '§ 132 BAO — sieben Jahre ab Ende des Kalenderjahrs' },
        { was: 'Gemeldete Nachrichten', anzahl: 2, bis: null,
          grund: 'Art. 17 Abs. 3 lit. e DSGVO — bis die Geschäftsführung die Meldung als erledigt löscht' },
      ],
    }));
    zeichneMitarbeiter();
    fireEvent.click(screen.getByRole('button', { name: /Löschen/ }));
    const dialog = await screen.findByRole('dialog');

    const eintraege = within(dialog).getAllByRole('listitem');
    const meldungen = eintraege.find((e) => e.textContent?.startsWith('Gemeldete Nachrichten'))!;
    expect(meldungen).toHaveTextContent('Gemeldete Nachrichten: 2');
    expect(meldungen).not.toHaveTextContent(/bis \d|Invalid|–/);
    expect(meldungen).toHaveTextContent('Art. 17 Abs. 3 lit. e DSGVO');
    const zeiten = eintraege.find((e) => e.textContent?.startsWith('Zeitbuchungen'))!;
    expect(zeiten).toHaveTextContent('Zeitbuchungen: 12, bis 31.12.2033');
    expect(zeiten).toHaveTextContent('§ 132 BAO');
    // Die Überschrift behauptet nicht für alle Einträge denselben Grund.
    expect(within(dialog).getByText('Bleibt gesperrt')).toBeInTheDocument();
    expect(within(dialog).queryByText(/Bleibt gesperrt \(§ 132 BAO\)/)).not.toBeInTheDocument();
  });

  it('die neueren Teile einer Person heissen, was sie sind — nicht wie ihr Schlüssel', async () => {
    loeschen.mockResolvedValue(probe({
      sofort: { termine: 3, geburtsdatum: 1, standardfahrer: 1, nachrichten: 4, nachrichten_teilnehmer: 2, startseite: 1 },
    }));
    zeichneMitarbeiter();
    fireEvent.click(screen.getByRole('button', { name: /Löschen/ }));
    const dialog = await screen.findByRole('dialog');

    // Bei einer Person bleibt der Termin; nur ihre Teilnahme geht.
    expect(dialog).toHaveTextContent('Teilnahmen an Terminen: 3');
    expect(dialog).toHaveTextContent('Geburtsdatum: 1');
    expect(dialog).toHaveTextContent('Eintragungen als Standardfahrer eines Fahrzeugs: 1');
    expect(dialog).toHaveTextContent('Eigene Nachrichten (Text und Anhänge): 4');
    expect(dialog).toHaveTextContent('Teilnahmen an Gesprächen: 2');
    expect(dialog).toHaveTextContent('Eingerichtete Startseite: 1');
    expect(dialog).not.toHaveTextContent(/nachrichten_teilnehmer|standardfahrer|startseite/);
  });

  it('beim Kunden gehen die Termine selbst', async () => {
    loeschen.mockResolvedValue({
      art: 'kunde', person: 'Familie Huber', geloescht: false, ganz: false, hinweis: '',
      sofort: { termine: 2 }, aufbewahren: [],
    });
    zeichne();
    fireEvent.click(screen.getByRole('button', { name: 'Löschen …' }));
    const dialog = await screen.findByRole('dialog');
    expect(dialog).toHaveTextContent('Termine: 2');
    expect(dialog).not.toHaveTextContent('Teilnahmen');
  });

  it('ein unbekannter Schlüssel erscheint nicht roh, die Zahl zählt trotzdem mit', async () => {
    loeschen.mockResolvedValue(probe({ sofort: { einsaetze: 1, kuenftig_neu: 3, noch_einer: 2 } }));
    zeichneMitarbeiter();
    fireEvent.click(screen.getByRole('button', { name: /Löschen/ }));
    const dialog = await screen.findByRole('dialog');
    expect(dialog).toHaveTextContent('Einsätze: 1');
    expect(dialog).toHaveTextContent('Weitere Einträge: 5');
    expect(dialog).not.toHaveTextContent(/kuenftig_neu|noch_einer/);
  });
});

describe('Der Dateiname', () => {
  it('nimmt Umlaute mit und lässt, was ein Dateisystem stört, weg', () => {
    expect(auskunftDateiname('Jürgen Öztürk / Bau: GmbH', '2026-09-29T08:00:00Z'))
      .toBe('datenauskunft-Jürgen-Öztürk-Bau-GmbH-2026-09-29.json');
    expect(auskunftDateiname('  ', '2026-09-29')).toBe('datenauskunft-person-2026-09-29.json');
  });
});

describe('Löschen bei einem aktiven Konto (Testbericht 30.09.2026, M42)', () => {
  const zeichneMitarbeiter = (aktiv: boolean) =>
    render(
      <ToastProvider>
        <Datenauskunft art="mitarbeiter" id="u-1" aktiv={aktiv} />
      </ToastProvider>,
    );

  it('sagt vorher „zuerst deaktivieren“, und der Knopf ruht', () => {
    zeichneMitarbeiter(true);
    expect(screen.getByRole('button', { name: /Löschen/ })).toBeDisabled();
    expect(screen.getByText(/Zuerst deaktivieren\./)).toBeInTheDocument();
    expect(loeschen).not.toHaveBeenCalled();
  });

  it('Gegenprobe: bei einem deaktivierten Konto startet der Probelauf', async () => {
    loeschen.mockResolvedValue({ art: 'mitarbeiter', person: 'Max', geloescht: false, ganz: false, hinweis: '', sofort: {}, aufbewahren: [] });
    zeichneMitarbeiter(false);
    expect(screen.queryByText(/Zuerst deaktivieren\./)).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /Löschen/ }));
    await waitFor(() => expect(loeschen).toHaveBeenCalledWith('mitarbeiter', 'u-1', true));
  });
});
