import { describe, it, expect, vi, beforeEach } from 'vitest';
import { act, fireEvent, render, screen, within, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { ToastProvider } from '@/components/Toast';
import type { Company } from '@/types';

/**
 * Die Firmendaten — alles, was auf Rechnung, Stundenbericht und
 * Handwerksschein gedruckt wird.
 *
 * Zwei Dinge machen diese Ansicht heikler, als sie aussieht:
 *
 *   1. EIN LEERES FELD MUSS LEER GESPEICHERT WERDEN. Wird es beim Schreiben
 *      ausgelassen, lässt `merge` den alten Wert stehen — eine einmal
 *      eingetragene UID-Nummer liesse sich nie wieder entfernen und stünde
 *      weiter auf jeder Rechnung.
 *   2. DIE HAUSFARBE KANN DIE APP UNLESBAR MACHEN. Weiss auf Gelb besteht
 *      jede Speicherprüfung und ist trotzdem nicht zu lesen. Deshalb prüft
 *      die Ansicht den Kontrast gegen die Norm und sagt es, bevor gespeichert
 *      wird.
 */

const updateCompany = vi.fn<(a0: string, a1: Record<string, unknown>) => Promise<void>>(
  async () => undefined,
);
vi.mock('@/lib/db/company', () => ({
  updateCompany: (id: string, daten: Record<string, unknown>) => updateCompany(id, daten),
}));

let firma: Partial<Company> = { id: 'perl', name: 'Perl Installationen' };

const NUTZER = {
  uid: 'chef',
  email: 'chefin@perl.at',
  name: 'Julian Deutsch',
  role: 'Geschäftsführung' as const,
  companyId: 'perl',
  docId: 'chef',
};
const reloadCompany = vi.fn();
vi.mock('@/app/AuthContext', () => ({
  useAuth: () => ({ user: NUTZER, company: firma, reloadCompany }),
}));

const { default: FirmendatenView } = await import('@/features/settings/FirmendatenView');

function zeige() {
  return render(
    <MemoryRouter><ToastProvider>
      <FirmendatenView />
    </ToastProvider></MemoryRouter>,
  );
}

const feld = (label: string) => screen.getByLabelText(label) as HTMLInputElement;
const speichern = () => screen.getByRole('button', { name: 'Firmendaten speichern' });

beforeEach(() => {
  updateCompany.mockClear();
  reloadCompany.mockClear();
  firma = { id: 'perl', name: 'Perl Installationen' };
});

describe('Speichern', () => {
  it('schreibt eine geleerte Angabe als leer, nicht als „unverändert“', async () => {
    /*
      DER TEURE FALL. Liesse die Ansicht das Feld einfach weg, bliebe die alte
      UID-Nummer im Firmendokument stehen — und damit auf jeder Rechnung, die
      danach gedruckt wird. Eine falsche UID auf einer Rechnung ist ein
      Problem des Finanzamts, kein Anzeigefehler.
    */
    firma = { ...firma, vatId: 'ATU12345678' };
    const nutzer = userEvent.setup();
    zeige();

    expect(feld('UID-Nummer').value).toBe('ATU12345678');
    await nutzer.clear(feld('UID-Nummer'));
    await nutzer.click(speichern());

    expect(updateCompany.mock.calls[0][1]).toMatchObject({ vatId: '' });
  });

  it('schneidet Leerraum weg, statt ihn zu drucken', async () => {
    const nutzer = userEvent.setup();
    zeige();
    await nutzer.clear(feld('Firmenname'));
    await nutzer.type(feld('Firmenname'), '  Perl Installationen  ');
    await nutzer.click(speichern());

    expect(updateCompany.mock.calls[0][1]).toMatchObject({ name: 'Perl Installationen' });
  });

  it('nimmt alle Briefkopf-Angaben mit', async () => {
    const nutzer = userEvent.setup();
    zeige();
    await nutzer.type(feld('IBAN'), 'AT61 1904 3002 3457 3201');
    await nutzer.type(feld('Firmenbuchnummer'), 'FN 123456a');
    await nutzer.click(speichern());

    const nutzlast = updateCompany.mock.calls[0][1];
    // Gespeichert ohne Leerzeichen (Runde 3, H3); gedruckt wird in Vierergruppen.
    expect(nutzlast).toMatchObject({
      iban: 'AT611904300234573201',
      companyRegister: 'FN 123456a',
    });
    // Und die Felder, die man nicht angefasst hat, fehlen nicht.
    expect(nutzlast).toHaveProperty('bic');
    expect(nutzlast).toHaveProperty('contactLine');
  });

  /* Runde 3, H3 — eine ungültige IBAN hält auf; ein Altbestand ist markiert. */
  it('hält eine falsche IBAN auf und sagt warum', async () => {
    const nutzer = userEvent.setup();
    zeige();
    await nutzer.type(feld('IBAN'), 'AT74123456');
    expect(screen.getByText(/Eine IBAN aus AT hat 20 Zeichen, diese hat 10/)).toBeInTheDocument();
    await nutzer.click(speichern());
    expect(updateCompany).not.toHaveBeenCalled();
  });

  it('Gegenprobe: eine falsche BIC hält ebenso auf, eine richtige nicht', async () => {
    const nutzer = userEvent.setup();
    zeige();
    await nutzer.type(feld('BIC'), 'BKAU');
    await nutzer.click(speichern());
    expect(updateCompany).not.toHaveBeenCalled();
    await nutzer.clear(feld('BIC'));
    await nutzer.type(feld('BIC'), 'BKAUATWW');
    await nutzer.click(speichern());
    expect(updateCompany.mock.calls[0][1]).toMatchObject({ bic: 'BKAUATWW' });
  });

  /* Testbericht 30.09.2026, M12 — Anschrift in Teilen, Firmenbuchgericht (§ 14 UGB). */
  it('speichert die Anschrift in Teilen und das Firmenbuchgericht (M12)', async () => {
    const nutzer = userEvent.setup();
    zeige();
    await nutzer.type(feld('Straße und Hausnummer'), 'Teststraße 1');
    await nutzer.type(feld('PLZ'), '8200');
    await nutzer.type(feld('Ort'), 'Gleisdorf');
    await nutzer.type(feld('Firmenbuchgericht'), 'Landesgericht Graz');
    expect(screen.getByText('Im Briefkopf: Teststraße 1, 8200 Gleisdorf')).toBeInTheDocument();
    await nutzer.click(speichern());
    expect(updateCompany.mock.calls[0][1]).toMatchObject({
      strasse: 'Teststraße 1', plz: '8200', ort: 'Gleisdorf', land: 'AT', firmenbuchgericht: 'Landesgericht Graz',
    });
    // Die Zeile schreibt die Datenbank, nicht die Maske.
    expect(updateCompany.mock.calls[0][1]).not.toHaveProperty('addressLine');
  });
});

describe('Die Hausfarbe', () => {
  it('meldet zu wenig Kontrast, bevor gespeichert wird', async () => {
    /*
      Weiss auf Gelb ist ein zulässiger Hex-Wert und trotzdem nicht zu lesen.
      Der Betrieb sieht es hier — nicht erst auf der ersten Rechnung beim
      Kunden.
    */
    const nutzer = userEvent.setup();
    zeige();
    await nutzer.type(feld('Hauptfarbe (#rrggbb)'), '#ffee00');
    await nutzer.type(feld('Schrift auf der Hauptfarbe'), '#ffffff');

    const meldung = await screen.findByRole('alert');
    expect(meldung.textContent).toMatch(/1|:/);
  });

  it('schweigt, wenn der Kontrast reicht', async () => {
    // Eine Warnung, die immer dasteht, wird nicht gelesen.
    const nutzer = userEvent.setup();
    zeige();
    await nutzer.type(feld('Hauptfarbe (#rrggbb)'), '#123a5f');
    await nutzer.type(feld('Schrift auf der Hauptfarbe'), '#ffffff');

    expect(screen.queryByRole('alert')).toBeNull();
  });

  it('zeigt die Farbe als Knopf, nicht als Fläche', async () => {
    // Eine Farbfläche allein sagt nichts über Lesbarkeit. Die Vorschau zeigt,
    // was der Nutzer später überall sieht.
    const nutzer = userEvent.setup();
    zeige();
    await nutzer.type(feld('Hauptfarbe (#rrggbb)'), '#123a5f');
    expect(await screen.findByText('Hauptfarbe')).toBeInTheDocument();
  });
});

describe('Das Logo', () => {
  it('sagt, dass ohne Logo nur der Name auf den Belegen steht', async () => {
    zeige();
    expect(
      screen.getByText(/Noch kein Logo hinterlegt. Die Belege tragen dann nur den Firmennamen./),
    ).toBeInTheDocument();
  });
});

/*
  IM FIRMENBUCH EINGETRAGEN (A12, 24.10.2026): vorbelegt nach dem Namen,
  gespeichert nur, wo die Angabe davon abweicht.
*/
describe('Im Firmenbuch eingetragen', () => {
  const haken = () => screen.getByLabelText('Im Firmenbuch eingetragen') as HTMLInputElement;

  it('ein Einzelunternehmen ohne Zusatz setzt den Haken — gespeichert als eigene Angabe', async () => {
    const nutzer = userEvent.setup();
    zeige();
    expect(haken().checked).toBe(false);
    await nutzer.click(haken());
    await nutzer.click(speichern());
    expect(updateCompany.mock.calls[0][1]).toMatchObject({ imFirmenbuch: true });
  });

  it('vorbelegt nach dem Namen; unverändert wird keine eigene Angabe gespeichert', async () => {
    firma = { ...firma, name: 'Perl Installationen GmbH' };
    const nutzer = userEvent.setup();
    zeige();
    expect(haken().checked).toBe(true);
    await nutzer.click(speichern());
    expect(updateCompany.mock.calls[0][1]).toMatchObject({ imFirmenbuch: null });
  });

  it('zeigt die gespeicherte Angabe', () => {
    firma = { ...firma, imFirmenbuch: true };
    zeige();
    expect(haken().checked).toBe(true);
  });
});

/*
  RUNDE 6, M6 (Teil C): Einstellungen › Firmendaten speicherte die PLZ „82“
  mit „Firmendaten gespeichert“; ältere Belege druckten sie im Briefkopf.
*/
describe('PLZ der Firma (Runde 6, M6)', () => {
  it('fragt bei einer PLZ, die nicht zum Land passt, nach — und speichert auf Bestätigung', async () => {
    firma = { ...firma, strasse: 'Teststraße 1', plz: '8200', ort: 'Gleisdorf', land: 'AT' };
    const nutzer = userEvent.setup();
    zeige();
    await nutzer.clear(feld('PLZ'));
    await nutzer.type(feld('PLZ'), '82');
    await nutzer.click(speichern());
    const dialog = await screen.findByRole('dialog', { name: /PLZ prüfen/ });
    expect(within(dialog).getByText(/PLZ „82“: Die PLZ hat in diesem Land vier Ziffern/)).toBeInTheDocument();
    expect(updateCompany).not.toHaveBeenCalled();
    await nutzer.click(within(dialog).getByRole('button', { name: 'Trotzdem speichern' }));
    await waitFor(() => expect(updateCompany).toHaveBeenCalledTimes(1));
    expect(updateCompany.mock.calls[0][1]).toMatchObject({ plz: '82' });
  });

  it('Gegenprobe: abgebrochen wird nichts gespeichert', async () => {
    const nutzer = userEvent.setup();
    zeige();
    await nutzer.type(feld('PLZ'), '82');
    await nutzer.click(speichern());
    const dialog = await screen.findByRole('dialog', { name: /PLZ prüfen/ });
    await nutzer.click(within(dialog).getByRole('button', { name: 'Abbrechen' }));
    expect(updateCompany).not.toHaveBeenCalled();
  });

  it('eine schon gespeicherte, unveränderte PLZ fragt nicht bei jedem Speichern', async () => {
    firma = { ...firma, strasse: 'Teststraße 1', plz: '82', ort: 'Gleisdorf', land: 'AT' };
    const nutzer = userEvent.setup();
    zeige();
    await nutzer.click(speichern());
    await waitFor(() => expect(updateCompany).toHaveBeenCalledTimes(1));
    expect(screen.queryByRole('dialog', { name: /PLZ prüfen/ })).toBeNull();
  });
});


describe('Premium: bestätigter Stand und offene Eingaben', () => {
  it('verhindert Doppel-Submit und erhält Eingaben, die während des Schreibens entstehen', async () => {
    let fertig: (() => void) | undefined;
    updateCompany.mockImplementationOnce(() => new Promise<void>((r) => { fertig = r; }));
    zeige();
    fireEvent.change(feld('Firmenname'), { target: { value: 'Gesendeter Name' } });
    const form = speichern().closest('form')!;
    fireEvent.submit(form); fireEvent.submit(form); fireEvent.submit(form);
    expect(updateCompany).toHaveBeenCalledOnce();
    expect(screen.getByRole('button', { name: 'Speichert …' })).toBeDisabled();
    fireEvent.change(feld('Firmenname'), { target: { value: 'Weitere offene Änderung' } });
    await act(async () => fertig?.());
    expect(feld('Firmenname')).toHaveValue('Weitere offene Änderung');
    expect(screen.getByText('Vorheriger Stand gespeichert · weitere Änderungen noch offen')).toBeInTheDocument();
    expect(speichern()).toBeEnabled();
    fireEvent.click(screen.getByRole('button', { name: 'Verwerfen' }));
    expect(feld('Firmenname')).toHaveValue('Gesendeter Name');
    expect(screen.getByRole('button', { name: 'Gespeichert' })).toBeDisabled();
  });
  it('bestätigtes Schreiben bleibt bestätigt, wenn nur das Nachladen scheitert', async () => {
    reloadCompany.mockRejectedValueOnce(new Error('Nachladen ausgefallen'));
    zeige();
    fireEvent.change(feld('Firmenname'), { target: { value: 'Bestätigter Name' } });
    fireEvent.click(speichern());
    await screen.findByText('Firmendaten gespeichert. Die Anzeige konnte noch nicht aktualisiert werden.');
    expect(screen.getByRole('button', { name: 'Gespeichert' })).toBeDisabled();
    expect(screen.queryByText('Die Firmendaten konnten nicht gespeichert werden.')).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Anzeige erneut laden' }));
    await waitFor(() => expect(screen.queryByText('Firmendaten gespeichert. Die Anzeige konnte noch nicht aktualisiert werden.')).not.toBeInTheDocument());
    expect(updateCompany).toHaveBeenCalledOnce();
  });
  it('fehlgeschlagenes Schreiben behält Eingaben und bleibt wiederholbar', async () => {
    updateCompany.mockRejectedValueOnce(new Error('Keine Schreibverbindung'));
    zeige();
    fireEvent.change(feld('Firmenname'), { target: { value: 'Nicht verlieren' } });
    fireEvent.click(speichern());
    await screen.findByText('Keine Schreibverbindung');
    expect(feld('Firmenname')).toHaveValue('Nicht verlieren');
    expect(screen.queryByRole('button', { name: 'Gespeichert' })).not.toBeInTheDocument();
    expect(speichern()).toBeEnabled();
  });
  it('warnt nur bei tatsächlicher Änderung vor Neuladen und gibt den Listener wieder frei', () => {
    const { unmount } = zeige();
    const fragen = () => { const e = new Event('beforeunload', { cancelable: true }); window.dispatchEvent(e); return e.defaultPrevented; };
    expect(fragen()).toBe(false);
    fireEvent.change(feld('Firmenname'), { target: { value: 'Offener Name' } });
    expect(fragen()).toBe(true);
    fireEvent.click(screen.getByRole('button', { name: 'Verwerfen' }));
    expect(fragen()).toBe(false);
    unmount(); expect(fragen()).toBe(false);
  });
  it('ordnet UID-, IBAN- und BIC-Fehler dem jeweiligen Feld zu', () => {
    zeige();
    for (const label of ['UID-Nummer', 'IBAN', 'BIC']) {
      fireEvent.change(feld(label), { target: { value: 'ungültig' } });
      const id = feld(label).getAttribute('aria-describedby');
      expect(id).toBeTruthy(); expect(document.getElementById(id!)).toBeInTheDocument();
      expect(feld(label)).toHaveAttribute('aria-invalid', 'true');
    }
  });
});
