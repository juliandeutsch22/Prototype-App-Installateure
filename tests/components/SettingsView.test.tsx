import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
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
const updateCompany = vi.fn<(a0: string, a1: Record<string, unknown>) => Promise<void>>(
  async () => undefined,
);
/** Was der Zähler als Nächstes vergäbe (Launch-Check, K6). */
const naechsteNummern = vi.fn(async () => ({ rechnung: 1002, angebot: 4, baustelle: 5 }));
const rechnungsvorgabenSpeichern = vi.fn<(a0: Record<string, unknown>) => Promise<void>>(
  async () => undefined,
);
vi.mock('@/lib/db/company', () => ({
  updateCompany: (id: string, daten: Record<string, unknown>) => updateCompany(id, daten),
  naechsteNummern: () => naechsteNummern(),
  rechnungsvorgabenSpeichern: (v: Record<string, unknown>) => rechnungsvorgabenSpeichern(v),
}));
vi.mock('@/lib/db/users', () => ({ listUsers: vi.fn(async () => []) }));
/*
  Die Kostensätze kommen seit dem 29.09.2026 nicht mit dem Betrieb, sondern
  aus einer eigenen Tabelle, die nur die Spitze liest (offene Punkte B1).
*/
let gespeicherteKosten: { fach: number; helper: number } | null = null;
const kostensaetze = vi.fn(async () => gespeicherteKosten);
vi.mock('@/lib/db/kosten', () => ({ kostensaetze: () => kostensaetze() }));

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

function zeige(teil: 'saetze' | 'rechnung' | 'nummern' | 'personal' = 'saetze') {
  return render(
    <ToastProvider>
      <SettingsView teil={teil} />
    </ToastProvider>,
  );
}

const feld = (label: string) => screen.getByLabelText(label) as HTMLInputElement;

beforeEach(() => {
  updateCompany.mockClear();
  rechnungsvorgabenSpeichern.mockClear();
  firma = { id: 'perl', name: 'Perl Installationen' };
  gespeicherteKosten = null;
  kostensaetze.mockClear();
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
    // Danach neu gelesen — aus der Tabelle, in die die Datenbank sie gelegt hat.
    await waitFor(() => expect(kostensaetze).toHaveBeenCalledTimes(2));
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
    gespeicherteKosten = { fach: 38.5, helper: 24 };
    zeige();
    await waitFor(() => expect(feld('Kosten Facharbeiterstunde (€)').value).toBe('38,5'));
    expect(feld('Kosten Helferstunde (€)').value).toBe('24');
  });

  it('sagt es, wenn die Kostensätze nicht geladen werden konnten — statt leerer Felder', async () => {
    kostensaetze.mockRejectedValueOnce(new Error('Keine Verbindung.'));
    zeige();
    expect(await screen.findByText(/Keine Verbindung/)).toBeInTheDocument();
  });

  it('rechnet den Deckungsbeitrag erst, wenn er etwas aussagt', async () => {
    firma = {
      ...firma,
      rates: {
        fach: 60, helper: 40, nightSurcharge: 0.5, emergencySurcharge: 1,
        vatRate: 0.2, dueDays: 14,
      },
    };
    gespeicherteKosten = { fach: 38.5, helper: 24 };
    zeige();
    expect(await screen.findByText(/Deckungsbeitrag je Facharbeiterstunde/)).toBeInTheDocument();
    expect(screen.queryByText(/Noch nicht hinterlegt/)).not.toBeInTheDocument();
    // 60 − 38,50 — mit Eurozeichen, wie jede Geldangabe (Prüflauf
    // 25.09.2026, P4-11: hier stand „21,50" ohne Einheit).
    expect(screen.getByText('21,50 €')).toBeInTheDocument();
  });
});

describe('Anzahlungen und Teilrechnungen', () => {
  it('sind ab Werk aus — der Haken ist leer', async () => {
    /*
      Die Auswahl „Art der Rechnung" steht sonst in der Maske, in der JEDE
      Rechnung entsteht. Wer nie eine Anzahlung stellt, soll dort kein Feld
      bekommen, das er jedes Mal überliest.
    */
    zeige();
    expect(feld('Wir stellen Anzahlungs-, Teil- und Schlussrechnungen').checked).toBe(false);
  });

  it('gehen mit dem Speichern der Sätze mit', async () => {
    const nutzer = userEvent.setup();
    zeige();
    await nutzer.click(feld('Wir stellen Anzahlungs-, Teil- und Schlussrechnungen'));
    await nutzer.click(screen.getByRole('button', { name: 'Sätze speichern' }));

    expect(updateCompany.mock.calls[0][1]).toMatchObject({ rechnungsarten: true });
  });

  it('zeigen den eingeschalteten Zustand des Betriebs', async () => {
    firma = { id: 'perl', name: 'Perl Installationen', rechnungsarten: true };
    zeige();
    expect(feld('Wir stellen Anzahlungs-, Teil- und Schlussrechnungen').checked).toBe(true);
  });

  it('sagen, dass bestehende Belege unberührt bleiben', async () => {
    // Ohne diesen Satz sähe das Abdrehen aus, als würde es an ausgestellten
    // Rechnungen etwas ändern — und niemand traut sich, es zu probieren.
    // Der Satz steht seit dem Prüflauf (D10) im „i" neben dem Haken.
    const nutzer = userEvent.setup();
    zeige();
    await nutzer.click(screen.getByRole('button', { name: /Anzahlungs- und Schlussrechnungen/ }));
    expect(screen.getByText(/Bereits ausgestellte Belege bleiben, wie sie sind/)).toBeInTheDocument();
  });
});

describe('Wochenplan für alle', () => {
  it('ist ab Werk aus', async () => {
    // Wer wo arbeitet, zeigt ein Betrieb seinen Leuten nur, wenn er es will.
    zeige('personal');
    expect(feld('Alle Mitarbeiter sehen den Wochenplan (nur lesen)').checked).toBe(false);
  });

  it('schreibt nur den Schalter — nicht nebenbei die Sätze', async () => {
    const nutzer = userEvent.setup();
    zeige('personal');
    await nutzer.click(feld('Alle Mitarbeiter sehen den Wochenplan (nur lesen)'));
    const karte = feld('Alle Mitarbeiter sehen den Wochenplan (nur lesen)').closest('section')!;
    await nutzer.click(within(karte).getByRole('button', { name: 'Speichern' }));

    expect(updateCompany).toHaveBeenCalledTimes(1);
    expect(updateCompany.mock.calls[0]).toEqual(['perl', { wochenplanFuerAlle: true }]);
    expect(reloadCompany).toHaveBeenCalled();
  });

  it('zeigt den eingeschalteten Zustand des Betriebs', async () => {
    firma = { id: 'perl', name: 'Perl Installationen', wochenplanFuerAlle: true };
    zeige('personal');
    expect(feld('Alle Mitarbeiter sehen den Wochenplan (nur lesen)').checked).toBe(true);
  });
});

describe('24. und 31. Dezember', () => {
  const HALB = '24. und 31. Dezember als halbe Tage rechnen (Normalarbeitszeit bis 12 Uhr)';

  it('ist ab Werk an — der Kollektivvertrag gilt, bis der Betrieb etwas anderes sagt', () => {
    zeige('personal');
    expect(feld(HALB).checked).toBe(true);
  });

  it('schreibt beim Abschalten nur diesen Schalter', async () => {
    const nutzer = userEvent.setup();
    zeige('personal');
    await nutzer.click(feld(HALB));
    await nutzer.click(within(feld(HALB).closest('section')!).getByRole('button', { name: 'Speichern' }));

    expect(updateCompany).toHaveBeenCalledTimes(1);
    expect(updateCompany.mock.calls[0]).toEqual(['perl', { dezemberHalbtage: false }]);
    expect(reloadCompany).toHaveBeenCalled();
  });

  it('Gegenprobe: zeigt einen abgeschalteten Betrieb als abgeschaltet', () => {
    firma = { id: 'perl', name: 'Perl Installationen', dezemberHalbtage: false };
    zeige('personal');
    expect(feld(HALB).checked).toBe(false);
  });
});

describe('Drei Unterseiten statt einer (Prüflauf 24.09.2026, D10)', () => {
  it('trägt jede ihre eigene Überschrift und nur ihre eigenen Karten', () => {
    const { unmount } = zeige('saetze');
    expect(screen.getByRole('heading', { level: 1, name: 'Sätze und Kosten' })).toBeInTheDocument();
    expect(screen.getByText('Stundensätze')).toBeInTheDocument();
    expect(screen.queryByText('Nummernkreise und Fuhrpark')).toBeNull();
    expect(screen.queryByText('Urlaubsjahr und Übertrag')).toBeNull();
    expect(screen.queryByText('Wochenplan für alle')).toBeNull();
    unmount();

    const n = zeige('nummern');
    expect(screen.getByRole('heading', { level: 1, name: 'Nummernkreise' })).toBeInTheDocument();
    expect(screen.getByText('Nummernkreise und Fuhrpark')).toBeInTheDocument();
    expect(screen.queryByText('Stundensätze')).toBeNull();
    expect(screen.queryByRole('button', { name: 'Sätze speichern' })).toBeNull();
    n.unmount();

    zeige('personal');
    expect(screen.getByRole('heading', { level: 1, name: 'Personal' })).toBeInTheDocument();
    for (const t of [
      'Urlaubsjahr und Übertrag', 'Wer Urlaub genehmigt', 'Wochenplan für alle', '24. und 31. Dezember',
      'Monatsbilanzen',
    ]) {
      expect(screen.getByText(t)).toBeInTheDocument();
    }
    expect(screen.queryByText('Nummernkreise und Fuhrpark')).toBeNull();
  });

  it('zeigt die NÄCHSTE Nummer jedes Kreises, nicht ein festes Beispiel (Launch-Check, K6)', async () => {
    // Vorher stand hier PR-2026-0001, während PR-2026-0003 schon existierte.
    zeige('nummern');
    const jahr = new Date().getFullYear();
    expect(await screen.findByText(`Nächste: RE-${jahr}-1002`)).toBeInTheDocument();
    expect(screen.getByText(`Nächste: AN-${jahr}-0004`)).toBeInTheDocument();
    expect(screen.getByText(`Nächste: B-${jahr}-0005`)).toBeInTheDocument();
  });

  it('sagt ausdrücklich „z. B.", wenn die nächste Nummer nicht geladen werden kann', async () => {
    naechsteNummern.mockRejectedValueOnce(new Error('offline'));
    zeige('nummern');
    const jahr = new Date().getFullYear();
    expect(await screen.findByText(`z. B. RE-${jahr}-1001`)).toBeInTheDocument();
  });

  it('zeigt einen Fehler an der Karte, deren Speichern scheiterte', async () => {
    // Vorher stand jede Meldung unter „Sätze speichern" — auch die der
    // Genehmigenden, drei Karten weiter unten.
    updateCompany.mockRejectedValueOnce(new Error('Dafür fehlt die Berechtigung.'));
    const nutzer = userEvent.setup();
    zeige('personal');
    await nutzer.click(screen.getByRole('button', { name: 'Genehmigende speichern' }));
    const karte = screen.getByText('Wer Urlaub genehmigt').closest('section') as HTMLElement;
    expect(await within(karte).findByText(/Dafür fehlt die Berechtigung/)).toBeInTheDocument();
    const wochenplan = screen.getByText('Wochenplan für alle').closest('section') as HTMLElement;
    expect(within(wochenplan).queryByText(/Dafür fehlt die Berechtigung/)).toBeNull();
  });
});

/*
  Testbericht 30.09.2026, H10: die Buchhaltung pflegt Zahlungsziel, Skonto,
  Mahnspesen und Basiszinssatz — auf einem eigenen Reiter, ohne Stunden- und
  Kostensätze. Gespeichert wird über die eigene Funktion der Datenbank.
*/
describe('Rechnungsvorgaben (Reiter der Buchhaltung)', () => {
  it('zeigt nur die Vorgaben — keine Stunden-, Zuschlags- oder Kostensätze', async () => {
    firma = { id: 'perl', name: 'Perl Installationen', rates: { dueDays: 21, skontoProzent: 2, skontoTage: 10 } as Company['rates'] };
    zeige('rechnung');
    expect(await screen.findByLabelText('Zahlungsziel (Tage)')).toHaveValue(21);
    expect(screen.getByLabelText('Basiszinssatz (%)')).toBeInTheDocument();
    expect(screen.queryByText('Stundensätze')).not.toBeInTheDocument();
    expect(screen.queryByText('Interne Kostensätze')).not.toBeInTheDocument();
    expect(screen.queryByLabelText('Umsatzsteuer')).not.toBeInTheDocument();
    // Die Kostensätze liest nur die Spitze — hier wird gar nicht erst gefragt.
    expect(kostensaetze).not.toHaveBeenCalled();
  });

  it('speichert über die eigene Funktion und nicht über den ganzen Betrieb', async () => {
    const nutzer = userEvent.setup();
    zeige('rechnung');
    const ziel = await screen.findByLabelText('Zahlungsziel (Tage)');
    await nutzer.clear(ziel);
    await nutzer.type(ziel, '30');
    await nutzer.click(screen.getByRole('button', { name: 'Rechnungsvorgaben speichern' }));
    await waitFor(() => expect(rechnungsvorgabenSpeichern).toHaveBeenCalled());
    expect(rechnungsvorgabenSpeichern.mock.calls[0][0]).toMatchObject({ dueDays: 30 });
    expect(Object.keys(rechnungsvorgabenSpeichern.mock.calls[0][0])).not.toContain('fach');
    expect(updateCompany).not.toHaveBeenCalled();
  });
});
