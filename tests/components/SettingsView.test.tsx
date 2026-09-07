import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ToastProvider } from '@/components/Toast';
import type { Company } from '@/types';

/**
 * Die Sätze des Betriebs — und die Falle, die hier stand.
 *
 * AUS DEM BETRIEB GEMELDET: „Die Nachkalkulation sagt, man muss in den
 * Einstellungen den Betrag festlegen, ich finde aber kein Feld." Das Feld war
 * da. Was fehlte, war die Wahrheit darin: es zeigte 42 und 28 — eine
 * Hausnummer, sichtbar im Formular, aber nirgends gespeichert.
 *
 * Daraus wurden zwei Fehler auf einmal:
 *
 *   1. Die Nachkalkulation meldete „Kostensätze fehlen", während daneben zwei
 *      ausgefüllte Felder standen. Wer das sieht, sucht das Feld woanders.
 *   2. Wer aus einem beliebigen anderen Grund auf Speichern drückte — etwa
 *      um das Zahlungsziel zu ändern —, schrieb die erfundene Zahl fest. Ab
 *      da beruhte jede Marge des Betriebs auf 42 €, die niemand entschieden
 *      hatte, und nichts wies mehr darauf hin.
 *
 * Der zweite ist der teurere: der erste nervt, der zweite lügt.
 */

// Die Signatur steht am Doppelgänger: der Test liest später die NUTZLAST des
// zweiten Arguments — was tatsächlich zum Betrieb geschrieben wird.
const updateCompany = vi.fn<[string, Record<string, unknown>], Promise<void>>(
  async () => undefined,
);
vi.mock('@/lib/db/company', () => ({
  updateCompany: (id: string, daten: Record<string, unknown>) => updateCompany(id, daten),
}));
vi.mock('@/lib/db/users', () => ({ listUsers: vi.fn(async () => []) }));

let firma: Partial<Company> = { id: 'perl', name: 'Perl Installationen' };

/*
  Der angemeldete Nutzer ist EIN Objekt, nicht bei jedem Rendern ein neues.

  Die Ansicht hängt einen Effekt an `user`. Läge hier ein Objektliteral im
  Mock, bekäme sie bei jedem Rendern eine neue Identität: Effekt läuft,
  Zustand ändert sich, neu gezeichnet, Effekt läuft wieder — der Testlauf
  bleibt hängen, ohne eine einzige Zusicherung zu melden. Genau das ist beim
  Schreiben dieser Datei passiert.
*/
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

const { default: SettingsView } = await import('@/features/settings/SettingsView');

function zeige() {
  return render(
    <ToastProvider>
      <SettingsView />
    </ToastProvider>,
  );
}

const feld = (label: string) => screen.getByLabelText(label) as HTMLInputElement;

beforeEach(() => {
  updateCompany.mockClear();
  firma = { id: 'perl', name: 'Perl Installationen' };
});

describe('Interne Kostensätze', () => {
  it('stehen leer da, solange der Betrieb keine hinterlegt hat', async () => {
    zeige();
    expect(feld('Kosten Facharbeiterstunde (€)').value).toBe('');
    expect(feld('Kosten Helferstunde (€)').value).toBe('');
    // Und die Ansicht sagt es auch, statt es nur nicht zu zeigen.
    expect(screen.getByText(/Noch nicht hinterlegt/)).toBeInTheDocument();
  });

  it('schreibt keine erfundenen Kosten, wenn nur die Sätze gespeichert werden', async () => {
    /*
      DER TEURE FALL. Wer das Zahlungsziel ändert und speichert, darf damit
      nicht nebenbei festlegen, was eine Arbeitsstunde den Betrieb kostet.
    */
    const nutzer = userEvent.setup();
    zeige();
    await nutzer.click(screen.getByRole('button', { name: 'Sätze speichern' }));

    expect(updateCompany).toHaveBeenCalled();
    expect(updateCompany.mock.calls[0][1]).not.toHaveProperty('costRates');
  });

  it('schreibt sie, sobald beide eingetragen sind', async () => {
    const nutzer = userEvent.setup();
    zeige();
    await nutzer.type(feld('Kosten Facharbeiterstunde (€)'), '38,50');
    await nutzer.type(feld('Kosten Helferstunde (€)'), '24');
    await nutzer.click(screen.getByRole('button', { name: 'Sätze speichern' }));

    expect(updateCompany.mock.calls[0][1]).toMatchObject({
      costRates: { fach: 38.5, helper: 24 },
    });
  });

  it('schreibt sie NICHT, wenn nur einer der beiden dasteht', async () => {
    /*
      Ein halbes Paar ist keine Entscheidung: ohne Helfersatz stünde die
      Helferstunde mit null Kosten da — also mit voller Marge.
    */
    const nutzer = userEvent.setup();
    zeige();
    await nutzer.type(feld('Kosten Facharbeiterstunde (€)'), '38,50');
    await nutzer.click(screen.getByRole('button', { name: 'Sätze speichern' }));

    expect(updateCompany.mock.calls[0][1]).not.toHaveProperty('costRates');
  });

  it('zeigt hinterlegte Sätze wieder an, mit Komma', async () => {
    firma = { ...firma, costRates: { fach: 38.5, helper: 24 } };
    zeige();
    expect(feld('Kosten Facharbeiterstunde (€)').value).toBe('38,5');
    expect(feld('Kosten Helferstunde (€)').value).toBe('24');
  });

  it('rechnet den Deckungsbeitrag erst, wenn er etwas aussagt', async () => {
    firma = {
      ...firma,
      rates: {
        fach: 60, helper: 40, nightSurcharge: 0.5, emergencySurcharge: 1,
        vatRate: 0.2, dueDays: 14,
      },
      costRates: { fach: 38.5, helper: 24 },
    };
    zeige();
    expect(screen.getByText(/Deckungsbeitrag je Facharbeiterstunde/)).toBeInTheDocument();
    expect(screen.queryByText(/Noch nicht hinterlegt/)).not.toBeInTheDocument();
  });
});
