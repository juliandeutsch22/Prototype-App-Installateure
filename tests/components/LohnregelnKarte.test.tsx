import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { ToastProvider } from '@/components/Toast';
import type { Company } from '@/types';

/**
 * Der Durchrechnungszeitraum je Betrieb (10.10.2026) in der Karte
 * „Nachtzeit und Überstunden“: 17 Wochen ab Werk, laut Kollektivvertrag bis
 * 52. Gegenprobe: ausserhalb davon wird nicht gespeichert, und die übrigen
 * Einstellungen der Karte gehen unverändert mit.
 */

const updateCompany = vi.fn(async () => undefined);
vi.mock('@/lib/db/company', () => ({ updateCompany: (...a: unknown[]) => updateCompany(...(a as [])) }));

let firma: Partial<Company> = {};
vi.mock('@/app/AuthContext', () => ({
  useAuth: () => ({ user: { uid: 'gf', companyId: 'perl' }, company: firma, reloadCompany: vi.fn(async () => undefined) }),
}));

const { default: LohnregelnKarte } = await import('@/features/settings/LohnregelnKarte');

const zeige = () => render(<ToastProvider><LohnregelnKarte /></ToastProvider>);

beforeEach(() => {
  updateCompany.mockClear();
  firma = { id: 'perl', name: 'Perl' } as Partial<Company>;
});

describe('Durchrechnungszeitraum', () => {
  it('ab Werk 17 Wochen; gespeichert wird der eingetragene Zeitraum mit den übrigen Einstellungen', async () => {
    zeige();
    const feld = screen.getByLabelText(/Durchrechnung für den Schnitt von 48 Std\./);
    expect(feld).toHaveValue(17);
    fireEvent.change(feld, { target: { value: '26' } });
    fireEvent.click(screen.getByRole('button', { name: 'Speichern' }));
    await waitFor(() => expect(updateCompany).toHaveBeenCalledWith('perl', {
      nachtVon: '22:00', nachtBis: '06:00', ueberstundenModell: 'zeitkonto', ueberstundenGrenze: 'tagessoll',
      ueberstundenHundertSonnFeiertag: false, ueberstundenKvMetall: true, durchrechnungWochen: 26,
    }));
  });

  it('zeigt den gespeicherten Zeitraum', () => {
    firma = { ...firma, durchrechnungWochen: 52 };
    zeige();
    expect(screen.getByLabelText(/Durchrechnung für den Schnitt/)).toHaveValue(52);
  });

  it('Gegenprobe: unter 17 oder über 52 Wochen wird nicht gespeichert', async () => {
    zeige();
    const feld = screen.getByLabelText(/Durchrechnung für den Schnitt/);
    for (const wert of ['16', '53', '']) {
      fireEvent.change(feld, { target: { value: wert } });
      fireEvent.click(screen.getByRole('button', { name: 'Speichern' }));
      expect(await screen.findByRole('alert')).toHaveTextContent(/zwischen 17 Wochen .* und 52 Wochen/);
    }
    expect(updateCompany).not.toHaveBeenCalled();
  });
});

describe('Zuschläge nach dem KV Metallgewerbe (18.10.2026)', () => {
  it('der Hinweis bestätigt die Nachtzeit und nennt die 100-%-Fälle', () => {
    zeige();
    fireEvent.click(screen.getByRole('button', { name: 'Was bedeutet Nachtzeit und Überstunden?' }));
    const hinweis = screen.getByText(/Nachtarbeitszulage/);
    expect(hinweis).toHaveTextContent(/jede Arbeitsstunde zwischen 22 und 6 Uhr, ohne Mindestdauer \(Abschnitt XIV Punkt 5\)/);
    expect(hinweis).toHaveTextContent(/ab der dritten Überstunde am Tag, Überstunden zwischen 20 und 6 Uhr, ab der 51\. Stunde der Woche/);
    expect(hinweis).toHaveTextContent(/Für Angestellte gilt ein anderer Kollektivvertrag/);
  });

  it('der Schalter steht bei der Tagesgrenze, ab Werk an, und wird gespeichert', async () => {
    firma = { ...firma, ueberstundenModell: 'tagesgrenze' };
    zeige();
    const schalter = screen.getByLabelText('Zuschläge nach dem KV Metallgewerbe (Arbeiter und Lehrlinge)');
    expect(schalter).toBeChecked();
    expect(screen.getByLabelText(/Sonn- und Feiertagen als Überstunden mit 100 % — für Angestellte/)).toBeInTheDocument();
    fireEvent.click(schalter);
    fireEvent.click(screen.getByRole('button', { name: 'Speichern' }));
    await waitFor(() => expect(updateCompany).toHaveBeenCalledWith('perl', expect.objectContaining({ ueberstundenKvMetall: false })));
  });

  it('bleibt gleich: beim Zeitkonto steht kein Schalter', () => {
    zeige();
    expect(screen.queryByLabelText(/Zuschläge nach dem KV Metallgewerbe/)).not.toBeInTheDocument();
  });

  it('ein abgeschalteter Betrieb sieht den Schalter aus', () => {
    firma = { ...firma, ueberstundenModell: 'tagesgrenze', ueberstundenKvMetall: false };
    zeige();
    expect(screen.getByLabelText('Zuschläge nach dem KV Metallgewerbe (Arbeiter und Lehrlinge)')).not.toBeChecked();
  });
});

describe('Nachtzeit kürzer als 22 bis 6 Uhr (18.10.2026)', () => {
  const hinweis = () => screen.queryByText(/Kürzer als 22 bis 6 Uhr\./);

  it('zeigt beim Eintragen von 23–5 Uhr den Hinweis, gespeichert wird trotzdem', async () => {
    zeige();
    expect(hinweis()).toBeNull();
    fireEvent.change(screen.getByLabelText('Nachtzeit von'), { target: { value: '23:00' } });
    fireEvent.change(screen.getByLabelText('Nachtzeit bis'), { target: { value: '05:00' } });
    expect(hinweis()?.closest('.hinweiszeile')).toHaveTextContent(/abweichen nur zugunsten der Arbeitnehmer \(§ 3 Abs 1 ArbVG\)/);
    fireEvent.click(screen.getByRole('button', { name: 'Speichern' }));
    await waitFor(() => expect(updateCompany).toHaveBeenCalledWith('perl', expect.objectContaining({ nachtVon: '23:00', nachtBis: '05:00' })));
  });

  it('Gegenprobe: eine längere Nachtzeit (21–6 Uhr) braucht keinen Hinweis', () => {
    zeige();
    fireEvent.change(screen.getByLabelText('Nachtzeit von'), { target: { value: '21:00' } });
    expect(hinweis()).toBeNull();
  });

  it('Gegenprobe: ein Betrieb, der den KV Metallgewerbe abgeschaltet hat, sieht ihn nicht', () => {
    firma = { ...firma, ueberstundenModell: 'tagesgrenze', ueberstundenKvMetall: false, nachtVon: '23:00', nachtBis: '05:00' };
    zeige();
    expect(hinweis()).toBeNull();
  });
});

describe('Vollzeit je Woche für die Mehrarbeit in Teilzeit (19.10.2026)', () => {
  it('steht bei der Tagesgrenze über dem Tagessoll, ab Werk 38,5, und wird gespeichert', async () => {
    firma = { ...firma, ueberstundenModell: 'tagesgrenze' };
    zeige();
    const feld = screen.getByLabelText('Vollzeit je Woche (Std.)');
    expect(feld).toHaveValue('38,5');
    fireEvent.change(feld, { target: { value: '40' } });
    fireEvent.click(screen.getByRole('button', { name: 'Speichern' }));
    await waitFor(() => expect(updateCompany).toHaveBeenCalledWith('perl', expect.objectContaining({ vollzeitWochenstunden: 40 })));
  });

  it('zeigt den gespeicherten Wert mit Komma und nennt die Mehrarbeit in der Hilfe', () => {
    firma = { ...firma, ueberstundenModell: 'tagesgrenze', vollzeitWochenstunden: 38 };
    zeige();
    expect(screen.getByLabelText('Vollzeit je Woche (Std.)')).toHaveValue('38');
    fireEvent.click(screen.getByRole('button', { name: 'Was bedeutet Nachtzeit und Überstunden?' }));
    expect(screen.getByText(/Nachtarbeitszulage/)).toHaveTextContent(/zuerst Mehrarbeit \(§ 19d AZG\)/);
  });

  it('Gegenprobe: über 40 Std., null oder leer wird nicht gespeichert', async () => {
    firma = { ...firma, ueberstundenModell: 'tagesgrenze' };
    zeige();
    const feld = screen.getByLabelText('Vollzeit je Woche (Std.)');
    for (const wert of ['40,5', '0', '']) {
      fireEvent.change(feld, { target: { value: wert } });
      fireEvent.click(screen.getByRole('button', { name: 'Speichern' }));
      expect(await screen.findByRole('alert')).toHaveTextContent(/höchstens bei 40 Stunden/);
    }
    expect(updateCompany).not.toHaveBeenCalled();
  });

  it('bleibt gleich: beim Zeitkonto und bei „über 10 Stunden“ steht kein Feld, und es geht nichts mit', async () => {
    firma = { ...firma, ueberstundenModell: 'tagesgrenze', ueberstundenGrenze: 'zehn' };
    zeige();
    expect(screen.queryByLabelText('Vollzeit je Woche (Std.)')).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Speichern' }));
    await waitFor(() => expect(updateCompany).toHaveBeenCalled());
    expect(updateCompany.mock.calls[0]).not.toContainEqual(expect.objectContaining({ vollzeitWochenstunden: expect.anything() }));
  });
});
