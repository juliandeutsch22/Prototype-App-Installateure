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
      kjbgVerteilungKv: false,
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

/*
  DIE VOLLZEIT JE WOCHENTAG (A6, 24.10.2026): ungleich verteilt — etwa vier
  lange Tage und ein kurzer Freitag. Gespeichert nur, was als Woche aufgeht.
*/
describe('Vollzeit je Wochentag', () => {
  const tagesgrenze = () => { firma = { ...firma, ueberstundenModell: 'tagesgrenze' }; };
  const eintragen = (werte: Record<string, string>) => {
    for (const [name, wert] of Object.entries(werte)) {
      fireEvent.change(screen.getByLabelText(`${name} (Std.)`), { target: { value: wert } });
    }
  };

  it('vier lange Tage und ein kurzer Freitag werden mit der Vollzeit gespeichert', async () => {
    tagesgrenze();
    zeige();
    expect(screen.queryByLabelText('Montag (Std.)')).not.toBeInTheDocument();
    fireEvent.click(screen.getByLabelText('Vollzeit ungleich auf die Tage verteilt'));
    eintragen({ Montag: '8,5', Dienstag: '8,5', Mittwoch: '8,5', Donnerstag: '8,5', Freitag: '4,5' });
    fireEvent.click(screen.getByRole('button', { name: 'Speichern' }));
    await waitFor(() => expect(updateCompany).toHaveBeenCalledWith('perl', expect.objectContaining({
      vollzeitWochenstunden: 38.5, vollzeitVerteilung: { 1: 8.5, 2: 8.5, 3: 8.5, 4: 8.5, 5: 4.5 },
    })));
  });

  it('zeigt eine gespeicherte Verteilung mit Komma', () => {
    firma = { ...firma, ueberstundenModell: 'tagesgrenze', vollzeitVerteilung: { 1: 8.5, 2: 8.5, 3: 8.5, 4: 8.5, 5: 4.5 } };
    zeige();
    expect(screen.getByLabelText('Vollzeit ungleich auf die Tage verteilt')).toBeChecked();
    expect(screen.getByLabelText('Freitag (Std.)')).toHaveValue('4,5');
    expect(screen.getByLabelText('Samstag (Std.)')).toHaveValue('');
  });

  it('Gegenprobe: was nicht die Vollzeit ergibt oder über 10 Std. liegt, wird nicht gespeichert', async () => {
    tagesgrenze();
    zeige();
    fireEvent.click(screen.getByLabelText('Vollzeit ungleich auf die Tage verteilt'));
    eintragen({ Montag: '8', Dienstag: '8', Mittwoch: '8', Donnerstag: '8', Freitag: '8' });
    fireEvent.click(screen.getByRole('button', { name: 'Speichern' }));
    expect(await screen.findByRole('alert')).toHaveTextContent(/ergeben 40 Stunden .* Vollzeit je Woche ergeben \(38,5\)/);
    eintragen({ Montag: '10,5', Freitag: '2' });
    fireEvent.click(screen.getByRole('button', { name: 'Speichern' }));
    expect(await screen.findByRole('alert')).toHaveTextContent(/Montag: zwischen 0 und 10 Stunden/);
    expect(updateCompany).not.toHaveBeenCalled();
  });

  it('abgewählt geht die Verteilung weg — dann wieder ein Fünftel je Tag', async () => {
    firma = { ...firma, ueberstundenModell: 'tagesgrenze', vollzeitVerteilung: { 1: 8.5, 2: 8.5, 3: 8.5, 4: 8.5, 5: 4.5 } };
    zeige();
    fireEvent.click(screen.getByLabelText('Vollzeit ungleich auf die Tage verteilt'));
    fireEvent.click(screen.getByRole('button', { name: 'Speichern' }));
    await waitFor(() => expect(updateCompany).toHaveBeenCalledWith('perl', expect.objectContaining({
      vollzeitWochenstunden: 38.5, vollzeitVerteilung: null,
    })));
  });
});

/*
  ANDERE VERTEILUNG FÜR JUGENDLICHE LAUT KOLLEKTIVVERTRAG (A9, 24.10.2026;
  § 11 Abs 3 KJBG): eine Einstellung je Betrieb, ab Werk aus.
*/
describe('Kollektivvertrag und die Verteilung für Jugendliche', () => {
  const haken = () => screen.getByLabelText(/Kollektivvertrag lässt für Jugendliche eine andere Verteilung/);

  it('ab Werk aus; gesetzt wird sie gespeichert', async () => {
    zeige();
    expect(haken()).not.toBeChecked();
    fireEvent.click(haken());
    fireEvent.click(screen.getByRole('button', { name: 'Speichern' }));
    await waitFor(() => expect(updateCompany).toHaveBeenCalledWith('perl', expect.objectContaining({ kjbgVerteilungKv: true })));
  });

  it('zeigt die gespeicherte Einstellung und nimmt sie wieder weg', async () => {
    firma = { ...firma, kjbgVerteilungKv: true };
    zeige();
    expect(haken()).toBeChecked();
    fireEvent.click(haken());
    fireEvent.click(screen.getByRole('button', { name: 'Speichern' }));
    await waitFor(() => expect(updateCompany).toHaveBeenCalledWith('perl', expect.objectContaining({ kjbgVerteilungKv: false })));
  });
});

/*
  DIE MELDUNG AM FELD (Testbericht Runde 6, G14): bei „Vollzeit ungleich
  verteilt“ stand sie unter dem KJBG-Haken, und das Feld „Montag“ sah aus
  wie jedes andere. Gegenprobe: mit der einen Meldung unten ist kein Feld
  `aria-invalid`, und die Meldung folgt nicht dem Feld.
*/
describe('Die Meldung steht beim Feld (Runde 6, G14)', () => {
  const verteilen = () => {
    firma = { ...firma, ueberstundenModell: 'tagesgrenze' };
    zeige();
    fireEvent.click(screen.getByLabelText('Vollzeit ungleich auf die Tage verteilt'));
  };
  /** Liegt die Meldung im selben Feldblock wie das Feld — und nach ihm? */
  const beimFeld = (feld: HTMLElement, meldung: HTMLElement) => {
    const block = feld.closest('div')!.parentElement!;
    expect(block.contains(meldung)).toBe(true);
    expect(feld.compareDocumentPosition(meldung) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  };

  it('ein Tag über 10 Std.: Meldung unter „Montag“, das Feld markiert und verknüpft', async () => {
    verteilen();
    fireEvent.change(screen.getByLabelText('Montag (Std.)'), { target: { value: '10,5' } });
    fireEvent.click(screen.getByRole('button', { name: 'Speichern' }));
    const meldung = await screen.findByRole('alert');
    expect(meldung).toHaveTextContent(/Montag: zwischen 0 und 10 Stunden/);
    const montag = screen.getByLabelText('Montag (Std.)');
    expect(montag).toHaveAttribute('aria-invalid', 'true');
    expect(montag).toHaveAttribute('aria-describedby', meldung.id);
    beimFeld(montag, meldung);
    expect(screen.getByLabelText('Dienstag (Std.)')).not.toHaveAttribute('aria-invalid');
    // Nicht mehr unter dem KJBG-Haken: der steht nach der Meldung.
    const haken = screen.getByLabelText(/Kollektivvertrag lässt für Jugendliche/);
    expect(meldung.compareDocumentPosition(haken) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    await waitFor(() => expect(montag).toHaveFocus());
  });

  it('stimmt die Summe nicht, sind alle Tage markiert und die Meldung steht unter ihnen', async () => {
    verteilen();
    for (const tag of ['Montag', 'Dienstag', 'Mittwoch', 'Donnerstag', 'Freitag']) {
      fireEvent.change(screen.getByLabelText(`${tag} (Std.)`), { target: { value: '8' } });
    }
    fireEvent.click(screen.getByRole('button', { name: 'Speichern' }));
    const meldung = await screen.findByRole('alert');
    expect(meldung).toHaveTextContent(/ergeben 40 Stunden/);
    for (const tag of ['Montag', 'Sonntag']) {
      expect(screen.getByLabelText(`${tag} (Std.)`)).toHaveAttribute('aria-invalid', 'true');
    }
    const sonntag = screen.getByLabelText('Sonntag (Std.)');
    expect(sonntag.compareDocumentPosition(meldung) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it('der Durchrechnungszeitraum: Meldung bei seinem Feld', async () => {
    zeige();
    const feld = screen.getByLabelText(/Durchrechnung für den Schnitt/);
    fireEvent.change(feld, { target: { value: '16' } });
    fireEvent.click(screen.getByRole('button', { name: 'Speichern' }));
    const meldung = await screen.findByRole('alert');
    expect(feld).toHaveAttribute('aria-invalid', 'true');
    beimFeld(feld, meldung);
  });

  it('gleich geblieben: scheitert das Speichern, steht die Meldung beim Knopf und kein Feld ist markiert', async () => {
    updateCompany.mockRejectedValueOnce(new Error('Netz weg'));
    zeige();
    fireEvent.click(screen.getByRole('button', { name: 'Speichern' }));
    const meldung = await screen.findByRole('alert');
    expect(meldung).toHaveTextContent(/Netz weg|konnten nicht gespeichert werden/);
    expect(document.querySelector('[aria-invalid="true"]')).toBeNull();
    const knopf = screen.getByRole('button', { name: 'Speichern' });
    expect(meldung.compareDocumentPosition(knopf) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });
});

/* Die gemeldete Stelle aus G14: „Tagesgrenze (Überstunden j…“ in der halben Zeile. */
describe('Die Auswahl „Überstunden“ (Runde 6, G14)', () => {
  it('nimmt die ganze Zeile — ihre Optionen passen nicht in die halbe', () => {
    firma = { ...firma, ueberstundenModell: 'tagesgrenze' };
    zeige();
    expect(screen.getByLabelText('Überstunden').closest('.feld-breit')).not.toBeNull();
    expect(screen.getByLabelText('Überstunden ab').closest('.feld-breit')).not.toBeNull();
    // Gleich geblieben: die Uhrzeiten stehen weiter nebeneinander.
    expect(screen.getByLabelText('Nachtzeit von').closest('.feld-breit')).toBeNull();
  });
});
