import { describe, it, expect } from 'vitest';
import {
  naechsteProjektnummer,
  nummerFrei,
  baustelleAusWartung,
} from '@/features/maintenance/wartungBaustelle';
import type { Customer, Wartung } from '@/types';

/**
 * Aus einer fälligen Wartung eine Baustelle machen.
 *
 * Die Wartungsliste sagte, was fällig ist, und hörte dort auf. Alles Weitere
 * lief von Hand — und die Liste kannte den Fortschritt nicht: „fällig" hiess
 * sowohl „noch nichts passiert" als auch „steht längst im Einsatzplan".
 */

const wartung = (p: Partial<Wartung> = {}): Wartung =>
  ({
    id: 'w1',
    companyId: 'perl',
    customerId: 'k1',
    customerName: 'Hausverwaltung Stein',
    anlage: 'Therme Vaillant ecoTEC, Keller',
    intervallMonate: 12,
    faelligAm: '2026-09-01',
    aktiv: true,
    ...p,
  }) as Wartung;

describe('Der Vorschlag für die Projektnummer', () => {
  it('zählt die höchste des Jahres hoch', () => {
    expect(naechsteProjektnummer(['2026-001', '2026-014', '2026-009'], 2026)).toBe('2026-015');
  });

  it('beginnt beim ersten, wenn das Jahr noch leer ist', () => {
    // Der Jahreswechsel: 2025 lief bis 087, 2026 fängt wieder bei 001 an.
    expect(naechsteProjektnummer(['2025-087'], 2026)).toBe('2026-001');
  });

  it('übernimmt die Stellenzahl aus dem Bestand', () => {
    // Wer vierstellig führt, bekommt vierstellig zurück — sonst sortiert die
    // Liste als Text falsch, sobald 2026-999 überschritten wird.
    expect(naechsteProjektnummer(['2026-0087'], 2026)).toBe('2026-0088');
  });

  /*
    FREMDE MUSTER SIND KEIN FEHLER. Projektnummern vergibt der Betrieb frei;
    in manchen hängt sie am Auftrag des Kunden. Ein Zähler würde diese
    Freiheit stillschweigend abschaffen — deshalb ist es ein Vorschlag in
    einem Feld, das man überschreibt.
  */
  it('lässt sich von einem fremden Muster nicht aus dem Tritt bringen', () => {
    expect(naechsteProjektnummer(['Huber-Therme', 'W-2026-3', ''], 2026)).toBe('2026-001');
  });

  it('zählt nur, was wirklich diesem Jahr gehört', () => {
    expect(naechsteProjektnummer(['2026-003', '2027-100', '2025-500'], 2026)).toBe('2026-004');
  });
});

describe('Die Prüfung auf eine freie Nummer', () => {
  /*
    SIE ERSETZT DEN ZÄHLER, DEN ES BEWUSST NICHT GIBT. Der Vorschlag kann
    doppelt sein, wenn zwei Leute gleichzeitig anlegen — oder wenn jemand ihn
    überschreibt. Zwei Baustellen mit derselben Nummer wären der teuerste
    Fehler dieser Kette: Zeiten, Scheine und Rechnungen hängen an der Nummer,
    nicht an der Dokument-ID.
  */
  it('erkennt eine schon vergebene Nummer', () => {
    expect(nummerFrei('2026-014', ['2026-014'])).toBe(false);
  });

  it('lässt sich von Leerraum und Grossschreibung nicht täuschen', () => {
    expect(nummerFrei(' w-2026-3 ', ['W-2026-3'])).toBe(false);
  });

  it('hält eine leere Nummer nicht für frei', () => {
    expect(nummerFrei('   ', [])).toBe(false);
  });

  it('gibt eine wirklich freie Nummer frei', () => {
    expect(nummerFrei('2026-015', ['2026-014'])).toBe(true);
  });
});

describe('Die Baustelle aus der Wartung', () => {
  /*
    DIE ADRESSE IST DER GRUND FÜR DIESE FUNKTION. Eine Hausverwaltung hat eine
    Rechnungsadresse und zwanzig Heizungen an zwanzig anderen. Gewönne die
    Kundenadresse, führe der Monteur ins Büro der Verwaltung.
  */
  it('nimmt die Anlagenadresse, nicht die des Kunden', () => {
    const p = baustelleAusWartung(
      wartung({ address: 'Lindengasse 4/12, 1070 Wien' }),
      { id: 'k1', companyId: 'perl', name: 'Hausverwaltung Stein', address: 'Ringstraße 1' } as Customer,
      '2026-015',
    );
    expect(p.address).toBe('Lindengasse 4/12, 1070 Wien');
  });

  it('nimmt die Kundenadresse nur, wenn die Anlage keine hat', () => {
    // Der Einfamilienhaus-Fall: die Therme steht dort, wo die Rechnung
    // hingeht. Dann ist die Kundenadresse die richtige Auskunft.
    const p = baustelleAusWartung(
      wartung({ address: '  ' }),
      { id: 'k1', companyId: 'perl', name: 'Huber', address: 'Ringstraße 1' } as Customer,
      '2026-015',
    );
    expect(p.address).toBe('Ringstraße 1');
  });

  it('kommt auch ohne Kundenstammsatz zurecht', () => {
    const p = baustelleAusWartung(wartung({ address: undefined }), undefined, '2026-015');
    expect(p.address).toBeUndefined();
    expect(p.customerName).toBe('Hausverwaltung Stein');
  });

  it('schreibt die Anlage und den Hinweis in die Beschreibung', () => {
    // Der Hinweis trägt, wer aufsperrt und wo der Schlüssel liegt — genau
    // das, was der Monteur am Morgen wissen muss.
    const p = baustelleAusWartung(
      wartung({ hinweis: 'Schlüssel bei Frau Berger, Tür 3' }),
      undefined,
      '2026-015',
    );
    expect(p.description).toBe(
      'Wartung: Therme Vaillant ecoTEC, Keller · Schlüssel bei Frau Berger, Tür 3',
    );
  });

  it('nimmt die Kundenverknüpfung mit, nicht nur den Namen', () => {
    // Sonst hinge die neue Baustelle nicht in der Kundenakte — und genau dort
    // sucht sie jemand, der den Kunden am Telefon hat.
    const p = baustelleAusWartung(wartung(), undefined, '2026-015');
    expect(p.customerId).toBe('k1');
    expect(p.status).toBe('Aktiv');
  });

  /*
    OB PAUSCHAL ODER NACH AUFWAND, steht im Wartungsvertrag und nicht in
    dieser App. Eine Vorbelegung wäre eine Behauptung über den Vertrag — und
    sie stünde auf jedem Handwerksschein dieser Baustelle.
  */
  it('behauptet nichts über die Abrechnungsart', () => {
    const p = baustelleAusWartung(wartung(), undefined, '2026-015');
    expect(p.billingMode).toBeUndefined();
  });
});
