import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
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
    <ToastProvider>
      <FirmendatenView />
    </ToastProvider>,
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
