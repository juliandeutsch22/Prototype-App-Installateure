// @vitest-environment jsdom
import { describe, it, expect } from 'vitest';
import { buildMahnungPdf, mahnungDateiname } from '@/features/invoices/mahnungPdf';
import type { Company, Invoice } from '@/types';

/**
 * Die Mahnung als Beleg.
 *
 * Sie geht an den Kunden — und was darauf steht, entscheidet, ob er zahlt
 * oder anruft. Geprüft wird der TEXTSTROM des PDFs: er enthält die
 * gezeichneten Wörter samt Koordinaten.
 */

const firma: Company = {
  id: 'perl',
  name: 'Perl Installationen GmbH',
  iban: 'AT12 3456 7890 1234 5678',
  bic: 'RZOOAT2L',
  vatId: 'ATU12345678',
  rates: { fach: 65, helper: 45, nightSurcharge: 0.5, emergencySurcharge: 1, vatRate: 0.2, dueDays: 14, mahnspesen: [0, 5, 15] },
} as Company;

const rechnung: Invoice = {
  id: 'r1',
  companyId: 'perl',
  invoiceNumber: 'RE-2026-0042',
  projectNumber: 'B-001',
  customerName: 'Baumeister Gruber',
  invoiceDate: '2026-08-20',
  dueDate: '2026-09-03',
  totalNetto: 1000,
  totalVat: 200,
  totalBrutto: 1200,
  paymentStatus: 'Überfällig',
} as Invoice;

/**
 * Beträge werden mit einem TOLERANTEN Muster geprüft.
 *
 * `Intl.NumberFormat('de-AT')` trennt Tausender in dieser Laufzeit mit einem
 * GESCHÜTZTEN LEERZEICHEN (U+00A0), nicht mit einem Punkt: „1 200,00". Das ist
 * nach ÖNORM A 1080 richtig, hängt aber an den Gebietsdaten der Umgebung — im
 * Browser des Betriebs kann dasselbe Dokument einen Punkt tragen.
 *
 * Der Test prüft deshalb den BETRAG, nicht das Trennzeichen. Er soll die
 * Rechenregel halten, nicht die Schreibweise einer fremden Bibliothek.
 */
const betrag = (n: string) => new RegExp(n.replace(/[.]/g, '.'));

async function text(o: Partial<Parameters<typeof buildMahnungPdf>[0]> = {}): Promise<string> {
  const blob = await buildMahnungPdf({
    company: firma,
    invoice: rechnung,
    stufe: 1,
    datum: '2026-09-20',
    frist: '2026-09-27',
    adresse: 'Bergweg 3, 2700 Wiener Neustadt',
    ...o,
  });
  // jsdom kennt `Blob.arrayBuffer()` in dieser Fassung noch nicht.
  return await new Promise<string>((fertig, fehler) => {
    const leser = new FileReader();
    leser.onload = () => fertig(String(leser.result));
    leser.onerror = () => fehler(leser.error);
    leser.readAsText(blob, 'latin1');
  });
}

describe('Was auf jeder Mahnung steht', () => {
  it('nennt die Rechnung, um die es geht', async () => {
    // Der Kunde soll ohne Suchen wissen, worum es geht.
    const s = await text();
    expect(s).toContain('RE-2026-0042');
    expect(s).toContain('20.08.2026'); // Rechnungsdatum
    expect(s).toContain('03.09.2026'); // urspruengliches Zahlungsziel
  });

  it('nennt den Betrag und die neue Frist', async () => {
    const s = await text();
    expect(s).toMatch(betrag('1.200,00'));
    expect(s).toContain('27.09.2026');
  });

  it('trägt die Bankverbindung und den Verwendungszweck', async () => {
    // Ohne sie muss der Kunde die alte Rechnung heraussuchen — genau die, die
    // er nicht findet.
    const s = await text();
    expect(s).toContain('AT12 3456 7890 1234 5678');
    expect(s).toContain('Verwendungszweck');
  });

  it('sagt, dass eine überschnittene Zahlung sie gegenstandslos macht', async () => {
    /*
      Zwischen Ausdrucken und Eintreffen liegen Tage, und in dieser Zeit
      zahlen die meisten. Ohne diesen Satz bekommt jemand eine Mahnung für
      etwas, das er längst überwiesen hat — und ruft verärgert an.
    */
    expect(await text()).toContain('gegenstandslos');
  });

  it('weist KEINE Umsatzsteuer aus', async () => {
    /*
      Eine Mahnung ist keine Leistung; sie fordert nur, was die Rechnung
      bereits ausgewiesen hat. Stünde hier Steuer, schuldete der Betrieb sie
      kraft Rechnungslegung.
    */
    const s = await text();
    expect(s).not.toContain('USt');
    expect(s).not.toContain('Umsatzsteuer');
  });
});

describe('Die Stufen unterscheiden sich', () => {
  it('die erste nimmt an, dass es übersehen wurde', async () => {
    const s = await text({ stufe: 1 });
    expect(s).toContain('Zahlungserinnerung');
    expect(s).not.toContain('Letzte Mahnung');
  });

  it('die dritte kündigt an, dass es aus der Hand geht', async () => {
    const s = await text({ stufe: 3 });
    expect(s).toContain('Letzte Mahnung');
    expect(s).toContain('aus der Hand');
  });
});

describe('Mahnspesen', () => {
  it('stehen nur da, wenn welche festgelegt sind', async () => {
    // Stufe 1 ist im Beispiel mit 0 hinterlegt — dann keine Zeile.
    const ohne = await text({ stufe: 1 });
    expect(ohne).not.toContain('Mahnspesen');
  });

  it('werden zum offenen Betrag addiert', async () => {
    // Stufe 2: 5 € Spesen auf 1.200 € — der offene Betrag ist 1.205 €.
    const s = await text({ stufe: 2 });
    expect(s).toContain('Mahnspesen');
    expect(s).toMatch(betrag('1.205,00'));
  });

  it('bleiben weg, wenn der Betrieb nichts hinterlegt hat', async () => {
    const ohne = await text({
      stufe: 3,
      company: { ...firma, rates: { ...firma.rates!, mahnspesen: undefined } },
    });
    expect(ohne).not.toContain('Mahnspesen');
    expect(ohne).toMatch(betrag('1.200,00'));
  });
});

describe('Nach einer Teilzahlung', () => {
  /*
    GEFUNDEN BEIM NEUGESTALTEN DER BELEGE: die Zeile „Bereits bezahlt" trug
    ein typografisches Minus (U+2212). Das gibt es in der Standardschrift des
    PDFs nicht — jsPDF schrieb die Zeile dann in einer anderen Kodierung, und
    auf dem Papier stand „"  4 0 0 , 0 0". Geprüft wird deshalb, dass der
    Betrag als gewöhnlicher Text im Dokument steht.
  */
  const angezahlt = { ...rechnung, paymentStatus: 'Teilbezahlt', bezahltBetrag: 400 } as Invoice;

  it('nennt die Zahlung lesbar und rechnet den Rest', async () => {
    const s = await text({ invoice: angezahlt });
    expect(s).toContain('Bereits bezahlt');
    expect(s).toMatch(/\(- 400,00 /);
    expect(s).toMatch(betrag('800,00'));
  });
});

describe('Der Dateiname', () => {
  it('sagt, was drin ist', () => {
    // Nicht „download.pdf" im Ordner des Kunden.
    expect(mahnungDateiname(rechnung, 1)).toBe('Zahlungserinnerung_RE-2026-0042.pdf');
    expect(mahnungDateiname(rechnung, 3)).toBe('Letzte_Mahnung_RE-2026-0042.pdf');
  });
});
