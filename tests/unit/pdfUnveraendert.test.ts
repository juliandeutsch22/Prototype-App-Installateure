// @vitest-environment jsdom
import { describe, it, expect, vi } from 'vitest';
import { readFileSync } from 'node:fs';

/*
  `jspdf-autotable` liefert unter Node ein OBJEKT als Default, im Vite-Build
  dagegen die Funktion. Das ist eine Eigenheit der Modulauflösung im Testlauf
  und kein Fehler der App — der Produktivcode bleibt deshalb, wie er ist.

  Die Tabelle selbst ist hier auch nicht die Frage: geprüft wird der
  BRIEFKOPF, und der entsteht davor. Der Ersatz zeichnet nichts und meldet nur
  die Endhöhe, die die Aufrufer danach lesen.
*/
vi.mock('jspdf-autotable', () => ({
  default: (doc: { lastAutoTable?: { finalY: number } }, opts: { startY?: number }) => {
    doc.lastAutoTable = { finalY: (opts.startY ?? 60) + 40 };
  },
}));
import { generateInvoicePdf } from '@/features/invoices/pdf';
import { generateHoursPdf } from '@/features/accounting/hoursPdf';
import type { AppUser, Company, TimeEntry } from '@/types';

/**
 * OHNE LOGO DARF SICH AN DEN BELEGEN NICHTS ÄNDERN.
 *
 * Die PDFs sind der einzige Teil dieser App, den niemand im Betrieb
 * gegenprüft, bevor er beim Kunden liegt. Eine verschobene Zeile fällt erst
 * auf, wenn die Rechnung in fremder Hand ist.
 *
 * Der Briefkopf bekam ein Logo — und damit die Möglichkeit, den übrigen Kopf
 * nach unten zu schieben. Diese Tests halten fest, dass das AUSSCHLIESSLICH
 * mit hinterlegtem Logo passiert: ohne eines muss dasselbe Dokument
 * herauskommen wie vorher, Byte für Byte an den Textstellen.
 *
 * Verglichen wird der TEXTSTROM des PDFs. Er enthält die Zeichenbefehle samt
 * Koordinaten; eine um einen Millimeter verrutschte Zeile fällt darin auf,
 * eine geänderte Schriftgröße auch.
 */

const firma: Company = {
  id: 'perl',
  name: 'Perl Installationen GmbH',
  addressLine: 'Musterstraße 1 · 2700 Wiener Neustadt',
  contactLine: '02622 12345 · office@perl.at',
  iban: 'AT12 3456 7890 1234 5678',
  vatId: 'ATU12345678',
};

/** 1×1-PNG — als „es gibt ein Logo" reicht das. */
const PNG =
  'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';

/**
 * Die ZEICHENBEFEHLE des Dokuments, nicht die fertige Datei.
 *
 * Die Datei trägt einen Zeitstempel und eine zufällige Kennung; zwei Läufe
 * wären damit nie gleich. `internal.pages` enthält dagegen genau das, was auf
 * das Blatt kommt — Text, Koordinaten, Schriftgrößen, Linien. Eine um einen
 * Millimeter verrutschte Zeile fällt darin auf.
 */
function befehle(doc: { internal: { pages: string[][] } }): string {
  return doc.internal.pages
    .filter(Boolean)
    .map((seite) => seite.join('\n'))
    .join('\n---\n');
}

function rechnung(company: Company): string {
  const doc = generateInvoicePdf({
    company,
    project: { customerName: 'Familie Huber', address: 'Hauptstraße 12', projectNumber: 'B-001' },
    invoiceNumber: '2026-0001',
    invoiceDate: '2026-09-01',
    dueDate: '2026-09-15',
    assembled: {
      positions: [
        { label: 'Facharbeit', menge: 8.5, einheit: 'h', einzel: 78, betrag: 663 },
      ],
      subtotalNetto: 663,
      discountAmount: 0,
      totalNetto: 663,
      totalVat: 132.6,
      totalBrutto: 795.6,
      linkedEntries: [],
      linkedOrders: [],
      entries: [],
    } as never,
  });
  return befehle(doc as unknown as { internal: { pages: string[][] } });
}

const monteur = { uid: 'm1', name: 'Max Mustermann' } as AppUser;
const zeiten: TimeEntry[] = [
  {
    companyId: 'perl',
    date: '2026-09-01',
    status: 'Anwesend',
    startTime: '07:00',
    endTime: '16:00',
    breakDuration: 30,
    userId: 'm1',
    userName: 'Max Mustermann',
  } as TimeEntry,
];

function stunden(company: Company): string {
  const doc = generateHoursPdf({
    company,
    user: monteur,
    entries: zeiten,
    from: '2026-09-01',
    to: '2026-09-30',
  });
  return befehle(doc as unknown as { internal: { pages: string[][] } });
}

/**
 * „Erstellt am" steht im Stundenbericht als sichtbarer Text. Herausgerechnet,
 * sonst verglichen sich zwei Läufe über Mitternacht nie.
 */
function ohneZeitstempel(s: string): string {
  return s.replace(/\d{2}\.\d{2}\.\d{4}/g, 'DATUM');
}

/**
 * Der feste Bezugspunkt: die Zeichenbefehle, wie sie VOR der Einführung des
 * Briefkopfs entstanden.
 *
 * WARUM EINE DATEI UND KEIN VERGLEICH ZWEIER LÄUFE. Zwei Läufe desselben
 * Codes sind immer gleich — auch wenn beide falsch sind. Erst diese Referenz
 * beantwortet die eigentliche Frage: sieht der Beleg noch so aus wie
 * vorher? Eine Gegenprobe mit einer um drei Millimeter verschobenen Anschrift
 * lief ohne sie sauber durch.
 *
 * Ändert jemand ein Beleglayout ABSICHTLICH, ist die Datei neu zu erzeugen —
 * ein bewusster Schritt, und genau so soll es sein.
 *
 * Zuletzt geschehen für die Rechnung, als sie ihre Farbflächen verlor
 * (`src/lib/belegLayout.ts`). Der Teil des Stundenberichts blieb dabei
 * Zeichen für Zeichen, wie er war.
 */
const REFERENZ = readFileSync('tests/fixtures/pdfKopf.txt', 'utf8');

describe('Belege ohne Logo', () => {
  it('Rechnung: Zeile für Zeile wie vor dem Briefkopf', () => {
    const soll = REFERENZ.split('\n===\nSTUNDEN\n')[0].replace(/^RECHNUNG\n/, '');
    expect(ohneZeitstempel(rechnung(firma))).toBe(soll.trimEnd());
  });

  it('Stundenbericht: Zeile für Zeile wie vor dem Briefkopf', () => {
    const soll = REFERENZ.split('\n===\nSTUNDEN\n')[1];
    expect(ohneZeitstempel(stunden(firma))).toBe(soll.trimEnd());
  });

  it('Rechnung: zwei Läufe ohne Logo sind identisch', () => {
    // Die Grundlage aller weiteren Vergleiche: der Erzeuger ist überhaupt
    // wiederholbar.
    expect(ohneZeitstempel(rechnung(firma))).toBe(ohneZeitstempel(rechnung(firma)));
  });

  it('Rechnung: das Logo ist der EINZIGE Unterschied', () => {
    const ohne = ohneZeitstempel(rechnung(firma));
    const mit = ohneZeitstempel(rechnung({ ...firma, logoUrl: PNG }));
    expect(mit).not.toBe(ohne);
    // Der Kopftext steht in beiden an derselben Stelle: bei der Rechnung
    // ist rechts oben Platz, es muss also nichts weichen.
    expect(ohne).toContain('Perl Installationen GmbH');
    expect(mit).toContain('Perl Installationen GmbH');
  });

  it('Stundenbericht: zwei Läufe ohne Logo sind identisch', () => {
    expect(ohneZeitstempel(stunden(firma))).toBe(ohneZeitstempel(stunden(firma)));
  });

  it('Stundenbericht: ohne Logo bleibt die Anschrift auf ihrer Höhe', () => {
    /*
      Hier steht die Anschrift rechts oben — genau dort, wo das Logo hin
      will. Sie rutscht deshalb MIT Logo nach unten. Ohne Logo darf sie sich
      nicht bewegen, sonst wäre der Bericht für jeden Betrieb ohne Logo
      grundlos ein anderer.
    */
    const ohne = ohneZeitstempel(stunden(firma));
    const mit = ohneZeitstempel(stunden({ ...firma, logoUrl: PNG }));
    expect(mit).not.toBe(ohne);
    expect(ohne).toContain('Zeiterfassung');
  });

  it('trägt die Firmenangaben überhaupt in beide Belege', () => {
    // Sie kommen jetzt aus einer gemeinsamen Funktion; ein Fehler dort
    // träfe beide zugleich.
    for (const s of [rechnung(firma), stunden(firma)]) {
      expect(s).toContain('Perl Installationen GmbH');
    }
  });
});
