/**
 * Audit der Monats-Zahlungskennzahlen auf der Startseite.
 * Erwartete Fehltests dokumentieren unklare Datenlage; sie sind KEIN Fix.
 * Rein lokale Mocks: keine Produktionsdatenbank.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

const kontrollen = vi.hoisted(() => ({
  zahlungenFehler: false,
  rechnungenFehler: false,
  hatZahlung: true,
}));
vi.mock('@/lib/db/invoices', () => ({
  listUnpaidInvoices: vi.fn(async () => []),
  listInvoicesByIds: vi.fn(async () => {
    if (kontrollen.rechnungenFehler) throw new Error('Rechnungen nicht erreichbar');
    return [{
      id: 're-1', invoiceNumber: 'RE-2026-1', paymentStatus: 'Offen',
      totalBrutto: 100, companyId: 'audit',
    }];
  }),
  listGarantienEndenIn: vi.fn(async () => []),
}));
vi.mock('@/lib/db/zahlungen', () => ({
  listZahlungenImZeitraum: vi.fn(async () => {
    if (kontrollen.zahlungenFehler) throw new Error('Zahlungen nicht erreichbar');
    return kontrollen.hatZahlung
      ? [{ id: 'z1', invoiceId: 're-1', art: 'Zahlung', datum: '2026-10-12', betrag: 50 }]
      : [];
  }),
}));

const { buchhaltung } = await import('@/features/dashboard/start/laden');
const kontext = {
  user: { uid: 'chef', companyId: 'audit', role: 'Geschäftsführung' as const },
  company: null,
  heute: '2026-10-12',
};

beforeEach(() => {
  kontrollen.zahlungenFehler = false;
  kontrollen.rechnungenFehler = false;
  kontrollen.hatZahlung = true;
});

describe('Audit: Monatszahlungen auf der Startseite', () => {
  it('berechnet bestätigte Zahlungseingänge korrekt', async () => {
    const daten = await buchhaltung(kontext, { rechnungen: true, scheine: false });
    expect(daten.bezahltImMonat).toEqual({ summe: 50, anzahl: 1 });
  });

  it('zeigt bei tatsächlich leerer Zahlungsliste korrekt null', async () => {
    kontrollen.hatZahlung = false;
    const daten = await buchhaltung(kontext, { rechnungen: true, scheine: false });
    expect(daten.bezahltImMonat).toEqual({ summe: 0, anzahl: 0 });
  });

  it.fails('stellt Ladefehler der Zahlungen nicht als bestätigte Null-Umsätze dar', async () => {
    kontrollen.zahlungenFehler = true;
    const daten = await buchhaltung(kontext, { rechnungen: true, scheine: false });
    // Soll: Kennzahl fehlt oder ihr Abruffehler wird sichtbar – nicht 0,00 Euro.
    expect(daten.bezahltImMonat).toBeUndefined();
  });

  it.fails('wertet Zahlung bei fehlgeschlagenem Rechnungsabgleich nicht als zuverlässig gezählt', async () => {
    kontrollen.rechnungenFehler = true;
    const daten = await buchhaltung(kontext, { rechnungen: true, scheine: false });
    // Ohne Rechnungsstatus können Stornos nicht sicher ausgeschlossen werden.
    expect(daten.bezahltImMonat).toBeUndefined();
  });
});
