// @vitest-environment jsdom
/**
 * Referenzen für Belege und Exporte (Umbau „Lot“, Phase A, A4).
 *
 * Der Umbau ist eine reine Darstellungsänderung; an Belegen und Exporten darf
 * sich KEIN Byte ändern (Protokoll 0.1, Abnahme 8.5). Diese Datei erzeugt aus
 * festen Testdaten jeden Beleg und jeden Export der App und hält ihre
 * SHA-256-Prüfsummen gegen `docs/ui-umbau/referenz.json`.
 *
 *   REFERENZ_SCHREIBEN=1 TZ=Europe/Vienna npx vitest run tests/unit/belegReferenz.test.ts
 *
 * schreibt die Referenz neu — ein bewusster Schritt, nur wenn sich ein Beleg
 * ABSICHTLICH ändert. Ohne die Variable prüft die Datei dagegen und läuft im
 * gewöhnlichen Unit-Lauf mit.
 *
 * DETERMINISMUS. jsPDF schreibt das Erstellungsdatum und eine zufällige
 * Dateikennung in jede Datei, das ZIP die Uhrzeit jeder Datei. Die Uhr steht
 * deshalb fest (`vi.setSystemTime`, nur `Date` — Zeitgeber laufen normal, das
 * Archiv wartet zwischendurch auf sie), und `Math.random` liefert eine feste
 * Folge. Damit sind auch die PDFs Byte für Byte gleich; gehasht wird die
 * ganze Datei, nicht nur ihr Text.
 *
 * DIE TABELLEN WERDEN ECHT GEZEICHNET. Andere Beleg-Tests ersetzen
 * `jspdf-autotable`, weil unter Node der Default ein Objekt statt der
 * Funktion ist; hier wird nur dieser Unterschied ausgeglichen und die echte
 * Funktion benutzt — sonst fehlten die Positionen in der Prüfsumme.
 */
import { describe, it, expect, vi, beforeAll, afterAll } from 'vitest';
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';

vi.mock('jspdf-autotable', async (original) => {
  const m = (await original()) as Record<string, unknown> & { default: unknown };
  const d = m.default as { default?: unknown; autoTable?: unknown } | ((...a: unknown[]) => unknown);
  const fn = typeof d === 'function' ? d : (d.default ?? d.autoTable ?? m.autoTable);
  return { ...m, default: fn };
});

import { generateInvoicePdf } from '@/features/invoices/pdf';
import { druckAngaben } from '@/features/invoices/nachdruck';
import { buildStornoPdf } from '@/features/invoices/stornoPdf';
import { buildMahnungPdf } from '@/features/invoices/mahnungPdf';
import { buildWorkSheetPdf } from '@/features/worksheets/worksheetPdf';
import { generateHoursPdf } from '@/features/accounting/hoursPdf';
import { buildInvoiceCsv } from '@/features/invoices/buchhaltungExport';
import { buildBmdCsv, buildBmdZahlungenCsv, type Buchungskonto } from '@/features/invoices/bmdExport';
import { buildMonthCsv, type UserWithEntries } from '@/features/accounting/export';
import { belegArchiv } from '@/features/invoices/belegArchiv';
import { calcMonthStats } from '@/lib/time';
import type { AppUser, Company, Customer, Invoice, TimeEntry, WorkSheet } from '@/types';

const REFERENZ = 'docs/ui-umbau/referenz.json';
const UHR = new Date('2026-10-07T10:00:00+02:00');

/* ------------------------------------------------------------------ */
/* Feste Testdaten — ein kleiner, aber vollständiger Monat             */
/* ------------------------------------------------------------------ */

const firma: Company = {
  id: 'perl',
  name: 'Perl Installationen GmbH',
  addressLine: 'Musterstraße 1 · 2700 Wiener Neustadt',
  contactLine: 'Tel 02622 12345 · office@perl.at',
  iban: 'AT12 3456 7890 1234 5678',
  bic: 'RZOOAT2L',
  bankName: 'Raiffeisenbank',
  vatId: 'ATU12345678',
  companyRegister: 'FN 123456a',
  rates: { fach: 78, helper: 52, nightSurcharge: 0.5, emergencySurcharge: 1, vatRate: 0.2, dueDays: 14, mahnspesen: [0, 5, 15] },
} as Company;

const kunden: Customer[] = [
  { id: 'k1', companyId: 'perl', name: 'Hausverwaltung Nord', address: 'Ringstraße 1, 1010 Wien', vatId: 'ATU87654321', kundennummer: '10042' } as Customer,
  { id: 'k2', companyId: 'perl', name: 'Familie Huber', address: 'Hauptstraße 12, 2700 Wiener Neustadt' } as Customer,
];

const rechnung = (p: Partial<Invoice>): Invoice & { id: string } => ({
  id: 'r1',
  companyId: 'perl',
  invoiceNumber: 'RE-2026-0001',
  projectNumber: 'B-2026-0147',
  customerName: 'Hausverwaltung Nord',
  address: 'Ringstraße 1, 1010 Wien',
  invoiceDate: '2026-09-02',
  dueDate: '2026-09-16',
  totalNetto: 1180.5,
  totalVat: 236.1,
  totalBrutto: 1416.6,
  vatRate: 0.2,
  paymentStatus: 'Offen',
  positions: [
    { label: 'Facharbeiter', qty: 12.5, unit: 'h', unitPrice: 78, netto: 975 },
    { label: 'Kupferrohr 22 mm, Stange 5 m', qty: 5, unit: 'Stk', unitPrice: 41.1, netto: 205.5 },
  ],
  ...p,
}) as Invoice & { id: string };

const RECHNUNGEN: Array<Invoice & { id: string }> = [
  rechnung({}),
  rechnung({
    id: 'r2', invoiceNumber: 'RE-2026-0002', customerName: 'Familie Huber',
    address: 'Hauptstraße 12, 2700 Wiener Neustadt', invoiceDate: '2026-09-10', dueDate: '2026-09-24',
    totalNetto: 640, totalVat: 128, totalBrutto: 768, paymentStatus: 'Bezahlt',
    positions: [{ label: 'Thermentausch pauschal', qty: 1, unit: 'pausch', unitPrice: 640, netto: 640 }],
  }),
  rechnung({
    id: 'r3', invoiceNumber: 'RE-2026-0003', invoiceDate: '2026-09-15', dueDate: '2026-09-29',
    reverseCharge: true, vatRate: 0, totalNetto: 2000, totalVat: 0, totalBrutto: 2000, paymentStatus: 'Storniert',
    cancellationNote: 'Doppelt verrechnet', cancelledAt: Date.parse('2026-09-20T09:00:00+02:00'),
    stornoAm: Date.parse('2026-09-20T09:00:00+02:00'), stornoNummer: 'RE-2026-0004',
    positions: [{ label: 'Steigleitung Bauleistung', qty: 1, unit: 'pausch', unitPrice: 2000, netto: 2000 }],
  }),
];

const KONTEN: Buchungskonto[] = [
  { zweck: 'debitoren', konto: '2000' },
  { zweck: 'erloes', ustSatz: 0.2, konto: '4000', steuercode: 'M20' },
  { zweck: 'erloes', ustSatz: 0, konto: '4009', steuercode: 'M00' },
  { zweck: 'reverse_charge', konto: '4005', steuercode: 'M00' },
  { zweck: 'anzahlung', konto: '3500', steuercode: 'M20' },
  { zweck: 'bank', konto: '2800' },
  { zweck: 'skonto', konto: '4420' },
];

const ZAHLUNGEN = [
  { invoiceId: 'r2', datum: '2026-09-18', betrag: 752.64, art: 'Überweisung' },
  { invoiceId: 'r2', datum: '2026-09-18', betrag: 15.36, art: 'Skonto' },
  { invoiceId: 'r1', datum: '2026-09-25', betrag: 500, art: 'Überweisung', hinweis: 'Teilzahlung' },
] as Parameters<typeof buildBmdZahlungenCsv>[0];

const monteur = {
  id: 'u1', companyId: 'perl', uid: 'u1', name: 'Max Mustermann', email: 'max@perl.at',
  role: 'Mitarbeiter', active: true, weeklyTargetHours: 38.5, yearlyVacationDays: 25,
  workDays: [1, 2, 3, 4, 5], appStartDate: '2026-01-01', initialOvertime: 0,
} as AppUser;

const ZEITEN: TimeEntry[] = [
  { id: 't1', date: '2026-09-01', status: 'Anwesend', startTime: '07:00', endTime: '16:00', breakDuration: 30, travelTime: 20, projectNumber: 'B-2026-0147', customerName: 'Hausverwaltung Nord', comment: 'Verteiler gesetzt' },
  { id: 't2', date: '2026-09-02', status: 'Anwesend', startTime: '06:30', endTime: '17:15', breakDuration: 45, projectNumber: 'B-2026-0147', customerName: 'Hausverwaltung Nord', isNightWork: true },
  { id: 't3', date: '2026-09-03', status: 'Krank' },
  { id: 't4', date: '2026-09-04', status: 'Urlaub' },
  { id: 't5', date: '2026-09-07', status: 'Anwesend', startTime: '07:00', endTime: '15:30', breakDuration: 30, projectNumber: 'B-2026-0148', customerName: 'Familie Huber', isEmergency: true, vehiclePlate: 'WN-123XY' },
].map((e) => ({ companyId: 'perl', userId: 'u1', userName: 'Max Mustermann', ...e }) as TimeEntry);

const SCHEIN: WorkSheet = {
  id: 's1',
  companyId: 'perl',
  projectNumber: 'B-2026-0147',
  customerName: 'Hausverwaltung Nord',
  address: 'Ringstraße 1, 1010 Wien',
  datum: '2026-09-02',
  status: 'Unterschrieben',
  abrechnung: 'Regie',
  beschreibung: 'Heizungsverteiler getauscht, Anlage gespült und entlüftet',
  zeiten: [
    { datum: '2026-09-02', mitarbeiter: 'Max Mustermann', minuten: 570 },
    { datum: '2026-09-02', mitarbeiter: 'Anton Berger', minuten: 480, istHelfer: true },
  ],
  material: [
    { name: 'Kupferrohr 22 mm, Stange 5 m', menge: 5, einheit: 'Stk' },
    { name: 'Pressfitting Bogen 90°', menge: 12.5, einheit: 'Stk' },
  ],
  erstelltVonUid: 'u1',
  erstelltVonName: 'Max Mustermann',
  unterschriebenAm: Date.parse('2026-09-02T17:20:00+02:00'),
  unterschriftName: 'Hr. Gruber',
} as unknown as WorkSheet;

/* ------------------------------------------------------------------ */
/* Erzeugen                                                            */
/* ------------------------------------------------------------------ */

type Datei = { name: string; bytes: Uint8Array };

function lesen(blob: Blob): Promise<Uint8Array> {
  // jsdom kennt `Blob.arrayBuffer()` in dieser Fassung nicht.
  return new Promise((fertig, fehler) => {
    const leser = new FileReader();
    leser.onload = () => fertig(new Uint8Array(leser.result as ArrayBuffer));
    leser.onerror = () => fehler(leser.error);
    leser.readAsArrayBuffer(blob);
  });
}

const text = (s: string) => new TextEncoder().encode(s);
const pdf = (doc: { output: (t: 'arraybuffer') => ArrayBuffer }) => new Uint8Array(doc.output('arraybuffer'));

/** Eine feste Zufallsfolge (LCG) — jsPDF zieht daraus seine Dateikennung. */
function zufallFestsetzen(): void {
  let s = 20261007;
  vi.spyOn(Math, 'random').mockImplementation(() => {
    s = (s * 1103515245 + 12345) % 2147483648;
    return s / 2147483648;
  });
}

async function erzeugen(daten = { rechnungen: RECHNUNGEN }): Promise<Datei[]> {
  zufallFestsetzen();
  const { rechnungen } = daten;
  const [r1, , r3] = rechnungen;
  const dateien: Datei[] = [];

  dateien.push({ name: 'rechnung.pdf', bytes: pdf(generateInvoicePdf(druckAngaben(firma, r1))) });
  dateien.push({
    name: 'stornorechnung.pdf',
    bytes: await lesen(await buildStornoPdf({ company: firma, invoice: r3, nummer: 'RE-2026-0004' })),
  });
  dateien.push({
    name: 'mahnung.pdf',
    bytes: await lesen(await buildMahnungPdf({
      company: firma, invoice: { ...r1, paymentStatus: 'Überfällig' }, stufe: 2,
      datum: '2026-10-01', frist: '2026-10-15', adresse: r1.address, kundenUid: 'ATU87654321', unternehmer: true,
    })),
  });
  dateien.push({
    name: 'handwerksschein.pdf',
    bytes: await lesen(await buildWorkSheetPdf(SCHEIN, { name: firma.name, addressLine: firma.addressLine, contactLine: firma.contactLine })),
  });
  dateien.push({
    name: 'stundennachweis.pdf',
    bytes: pdf(generateHoursPdf({ company: firma, user: monteur, entries: ZEITEN, from: '2026-09-01', to: '2026-09-30' })),
  });
  dateien.push({ name: 'ausgangsbuch.csv', bytes: text(buildInvoiceCsv(rechnungen, kunden, '2026-09-01', '2026-09-30').csv) });

  // Wie die Rechnungsseite: die Kundennummer über den Kunden der Rechnung.
  const debitor = (inv: Invoice) => kunden.find((k) => k.name === inv.customerName)?.kundennummer;
  dateien.push({ name: 'bmd-buchungen.csv', bytes: text(buildBmdCsv(rechnungen, KONTEN, '2026-09-01', '2026-09-30', debitor).csv) });
  dateien.push({
    name: 'bmd-zahlungen.csv',
    bytes: text(buildBmdZahlungenCsv(ZAHLUNGEN, rechnungen, KONTEN, '2026-09-01', '2026-09-30', debitor).csv),
  });

  const zeile: UserWithEntries = {
    user: monteur, monthEntries: ZEITEN, stats: calcMonthStats(monteur, ZEITEN, ZEITEN, 2026, 8, true),
  };
  dateien.push({ name: 'lohn.csv', bytes: text(buildMonthCsv([zeile], 2026, 8, true, {}, ZEITEN)) });

  const archiv = await belegArchiv({ company: firma, rechnungen, kunden, von: '2026-09-01', bis: '2026-09-30' });
  dateien.push({ name: 'belegarchiv.zip', bytes: await lesen(archiv.blob) });

  vi.mocked(Math.random).mockRestore();
  return dateien;
}

const sha = (b: Uint8Array) => createHash('sha256').update(b).digest('hex');

function pruefsummen(dateien: Datei[]): Record<string, { sha256: string; bytes: number }> {
  return Object.fromEntries(dateien.map((d) => [d.name, { sha256: sha(d.bytes), bytes: d.bytes.length }]));
}

/* ------------------------------------------------------------------ */

describe('Belege und Exporte gleich der Referenz vor dem Umbau', () => {
  let erster: Datei[];

  beforeAll(async () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(UHR);
    erster = await erzeugen();
    // Dieselben geprüften Beispieldateien für die fachliche Abnahme bereitstellen.
    const ziel = process.env.BELEG_BEISPIELE_ZIEL;
    if (ziel) {
      mkdirSync(ziel, { recursive: true });
      for (const datei of erster) writeFileSync(`${ziel}/${datei.name}`, datei.bytes);
    }
  });
  afterAll(() => {
    vi.useRealTimers();
  });

  it('erzeugt alle zehn Dateien, keine leer', () => {
    expect(erster.map((d) => d.name)).toEqual([
      'rechnung.pdf', 'stornorechnung.pdf', 'mahnung.pdf', 'handwerksschein.pdf', 'stundennachweis.pdf',
      'ausgangsbuch.csv', 'bmd-buchungen.csv', 'bmd-zahlungen.csv', 'lohn.csv', 'belegarchiv.zip',
    ]);
    for (const d of erster) expect(d.bytes.length, d.name).toBeGreaterThan(100);
  });

  it('die Tabellen sind wirklich gezeichnet (Positionen im Textstrom)', () => {
    // Sonst hinge die Prüfsumme nur am Kopf, und eine verschobene Position fiele nicht auf.
    const lies = (n: string) => new TextDecoder('latin1').decode(erster.find((d) => d.name === n)!.bytes);
    expect(lies('rechnung.pdf')).toContain('Kupferrohr 22 mm');
    expect(lies('stundennachweis.pdf')).toContain('Verteiler gesetzt');
    expect(lies('handwerksschein.pdf')).toContain('Pressfitting');
  });

  it('zwei Läufe hintereinander ergeben Byte für Byte dasselbe', async () => {
    // Ohne das wäre jede Abweichung von der Referenz nur Rauschen.
    const zweiter = await erzeugen();
    expect(pruefsummen(zweiter)).toEqual(pruefsummen(erster));
  });

  it('Gegenprobe: eine andere Rechnungsnummer ändert Beleg, Exporte und Archiv', async () => {
    // Zeigt, dass die Prüfsummen eine Änderung am Inhalt überhaupt sehen.
    const anders = RECHNUNGEN.map((r, i) => (i === 0 ? { ...r, invoiceNumber: 'RE-2026-0009' } : r));
    const a = pruefsummen(await erzeugen({ rechnungen: anders }));
    const b = pruefsummen(erster);
    for (const n of ['rechnung.pdf', 'mahnung.pdf', 'ausgangsbuch.csv', 'bmd-buchungen.csv', 'bmd-zahlungen.csv', 'belegarchiv.zip']) {
      expect(a[n].sha256, n).not.toBe(b[n].sha256);
    }
    // Und was die Rechnung nicht berührt, bleibt gleich.
    for (const n of ['handwerksschein.pdf', 'stundennachweis.pdf', 'lohn.csv', 'stornorechnung.pdf']) {
      expect(a[n].sha256, n).toBe(b[n].sha256);
    }
  });

  it('Prüfsummen gleich docs/ui-umbau/referenz.json', () => {
    const jetzt = pruefsummen(erster);
    if (process.env.REFERENZ_SCHREIBEN === '1') {
      const inhalt = {
        hinweis: 'Erzeugt von tests/unit/belegReferenz.test.ts aus festen Testdaten (Uhr 07.10.2026 10:00, feste Zufallsfolge). Neu schreiben nur bei absichtlicher Änderung eines Belegs: REFERENZ_SCHREIBEN=1.',
        dateien: jetzt,
      };
      writeFileSync(REFERENZ, `${JSON.stringify(inhalt, null, 2)}\n`);
    }
    expect(existsSync(REFERENZ), `${REFERENZ} fehlt — mit REFERENZ_SCHREIBEN=1 erzeugen`).toBe(true);
    const soll = (JSON.parse(readFileSync(REFERENZ, 'utf8')) as { dateien: typeof jetzt }).dateien;
    expect(jetzt).toEqual(soll);
  });
});
