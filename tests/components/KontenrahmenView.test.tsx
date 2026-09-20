import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ToastProvider } from '@/components/Toast';
import KontenrahmenView from '@/features/settings/KontenrahmenView';

/**
 * Der Kontenrahmen des Betriebs.
 *
 * WARUM HIER ÜBERHAUPT ETWAS ZU PRÜFEN IST. Auf den ersten Blick ist das ein
 * Formular mit fünf Feldern. Was daran hängt, ist der Buchungsstapel: eine
 * Zahl, die hier falsch oder leer steht, bucht später auf ein falsches Konto
 * oder verhindert den Export ganz. Beides soll passieren, wenn es passieren
 * MUSS — und dann sichtbar.
 */

let gespeichert: Array<Record<string, unknown>> = [];
let geladen: Array<Record<string, unknown>> = [];
const anlegen = vi.fn();
const aendern = vi.fn();
const loeschen = vi.fn();

vi.mock('@/lib/db/konten', () => ({
  buchungskonten: vi.fn(async () => geladen),
  kontoAnlegen: (...a: unknown[]) => {
    gespeichert.push({ art: 'anlegen', ...(a[1] as Record<string, unknown>) });
    return anlegen(...a);
  },
  kontoAendern: (...a: unknown[]) => {
    gespeichert.push({ art: 'aendern', id: a[0], ...(a[1] as Record<string, unknown>) });
    return aendern(...a);
  },
  kontoLoeschen: (...a: unknown[]) => {
    gespeichert.push({ art: 'loeschen', id: a[0] });
    return loeschen(...a);
  },
}));

const authWert = {
  user: { uid: 'g1', companyId: 'perl', name: 'Chefin', role: 'Geschäftsführung' as const },
  company: { id: 'perl', name: 'Perl Installationen' },
};
vi.mock('@/app/AuthContext', () => ({ useAuth: () => authWert }));

function zeige() {
  return render(
    <ToastProvider>
      <KontenrahmenView />
    </ToastProvider>,
  );
}

const speichern = () => screen.getByRole('button', { name: 'Kontenrahmen speichern' });

beforeEach(() => {
  gespeichert = [];
  geladen = [];
  anlegen.mockReset().mockResolvedValue('neu');
  aendern.mockReset().mockResolvedValue(undefined);
  loeschen.mockReset().mockResolvedValue(undefined);
});

describe('Was hinterlegt ist, steht in den Feldern', () => {
  it('zeigt den Steuersatz in Prozent und nicht als Anteil', async () => {
    // In der Datenbank steht 0.2, im Kontenplan der Kanzlei steht „20 %".
    // Wer hier 0,2 liest, tippt 20 hinein und hat ab dann 2000 %.
    geladen = [
      { id: 'a', companyId: 'perl', zweck: 'erloes', ustSatz: 0.2, konto: '4000', steuercode: 'M20' },
      { id: 'b', companyId: 'perl', zweck: 'debitoren', ustSatz: null, konto: '2000' },
    ];
    zeige();
    expect(((await screen.findByLabelText('Satz %')) as HTMLInputElement).value).toBe('20');
    expect((screen.getByLabelText('Erlöskonto') as HTMLInputElement).value).toBe('4000');
    expect(
      (screen.getByLabelText('Forderungen (Debitorensammelkonto)') as HTMLInputElement).value,
    ).toBe('2000');
  });

  it('setzt den Vorschlag ein, speichert ihn aber nicht von selbst', async () => {
    /*
      EIN VORSCHLAG IST KEINE VORBELEGUNG. Stünde der Einheitskontenrahmen von
      Anfang an in den Feldern, sähe er aus wie eine Auskunft — und wer ihn
      stehen lässt, bucht ein Jahr lang auf Konten, die er nie geprüft hat.
    */
    zeige();
    await userEvent.click(await screen.findByRole('button', { name: 'Vorschlag einsetzen' }));

    expect((screen.getByLabelText('Forderungen (Debitorensammelkonto)') as HTMLInputElement).value).toBe('2000');
    expect((screen.getAllByLabelText('Erlöskonto')[0] as HTMLInputElement).value).toBe('4000');
    expect(gespeichert).toEqual([]);
  });
});

describe('Speichern', () => {
  it('legt neue Konten an und rechnet den Satz in einen Anteil um', async () => {
    zeige();
    await userEvent.click(await screen.findByRole('button', { name: 'Vorschlag einsetzen' }));
    await userEvent.click(speichern());

    await waitFor(() => expect(gespeichert.length).toBeGreaterThan(0));
    expect(gespeichert).toContainEqual({
      art: 'anlegen', zweck: 'erloes', ustSatz: 0.2, konto: '4000', steuercode: 'M20',
    });
    expect(gespeichert).toContainEqual({
      art: 'anlegen', zweck: 'debitoren', ustSatz: null, konto: '2000', steuercode: null,
    });
  });

  it('ändert ein vorhandenes Konto, statt ein zweites anzulegen', async () => {
    geladen = [
      { id: 'a', companyId: 'perl', zweck: 'erloes', ustSatz: 0.2, konto: '4000', steuercode: 'M20' },
    ];
    zeige();
    const feld = (await screen.findByLabelText('Erlöskonto')) as HTMLInputElement;
    await userEvent.clear(feld);
    await userEvent.type(feld, '4020');
    await userEvent.click(speichern());

    await waitFor(() => expect(gespeichert.length).toBeGreaterThan(0));
    expect(gespeichert).toEqual([
      { art: 'aendern', id: 'a', zweck: 'erloes', ustSatz: 0.2, konto: '4020', steuercode: 'M20' },
    ]);
  });

  it('löscht ein geleertes Konto, statt ein leeres zu speichern', async () => {
    /*
      Sonst stünde im Kontenrahmen ein Zweck mit leerer Kontonummer — und der
      Export meldete ihn als vorhanden, statt ihn anzumahnen. Eine Lücke, die
      sich als Angabe ausgibt, ist schlimmer als eine offene.
    */
    geladen = [
      { id: 'a', companyId: 'perl', zweck: 'debitoren', ustSatz: null, konto: '2000' },
    ];
    zeige();
    await userEvent.clear(await screen.findByLabelText('Forderungen (Debitorensammelkonto)'));
    await userEvent.click(speichern());

    await waitFor(() => expect(gespeichert.length).toBeGreaterThan(0));
    expect(gespeichert).toEqual([{ art: 'loeschen', id: 'a' }]);
  });

  it('löscht eine entfernte Zeile auch wirklich', async () => {
    geladen = [
      { id: 'a', companyId: 'perl', zweck: 'erloes', ustSatz: 0.1, konto: '4010', steuercode: 'M10' },
    ];
    zeige();
    await userEvent.click(await screen.findByRole('button', { name: /10 % entfernen/ }));
    await userEvent.click(speichern());

    await waitFor(() => expect(gespeichert.length).toBeGreaterThan(0));
    expect(gespeichert).toEqual([{ art: 'loeschen', id: 'a' }]);
  });
});

describe('Was gar nicht erst gespeichert wird', () => {
  it('weist zwei Erlöskonten für denselben Steuersatz ab', async () => {
    /*
      Das ist keine Auswahl, sondern eine offene Frage beim nächsten Export —
      und die Datenbank weist es ohnehin ab. Sie hier erst beim Speichern
      auflaufen zu lassen, hiesse, den Fehler mit einer Datenbankmeldung zu
      beantworten.
    */
    geladen = [
      { id: 'a', companyId: 'perl', zweck: 'erloes', ustSatz: 0.2, konto: '4000', steuercode: 'M20' },
    ];
    zeige();
    await userEvent.click(await screen.findByRole('button', { name: '+ Steuersatz' }));
    const felder = screen.getAllByLabelText('Satz %');
    await userEvent.type(felder[1], '20');
    await userEvent.type(screen.getAllByLabelText('Erlöskonto')[1], '4021');

    expect(await screen.findByText(/denselben Steuersatz/)).toBeInTheDocument();
    expect(speichern()).toBeDisabled();
  });

  it('weist einen Satz ab, der keiner ist', async () => {
    zeige();
    await userEvent.click(await screen.findByRole('button', { name: '+ Steuersatz' }));
    await userEvent.type(screen.getByLabelText('Satz %'), 'zwanzig');
    await userEvent.type(screen.getByLabelText('Erlöskonto'), '4000');

    expect(await screen.findByText(/kein Steuersatz zwischen 0 und 100/)).toBeInTheDocument();
    expect(speichern()).toBeDisabled();
  });

  it('stört sich nicht an einer leeren Zeile, die noch niemand ausgefüllt hat', async () => {
    // Wer auf „+ Steuersatz" tippt, hat noch nichts falsch gemacht.
    zeige();
    await userEvent.click(await screen.findByRole('button', { name: '+ Steuersatz' }));
    expect(speichern()).toBeEnabled();
  });
});
