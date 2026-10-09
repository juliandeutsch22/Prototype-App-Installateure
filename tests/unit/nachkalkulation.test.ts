import { describe, it, expect } from 'vitest';
import { rechneBaustelle, margenTon } from '@/features/costing/nachkalkulation';
import type { Invoice, Material, Quote, TimeEntry } from '@/types';

/**
 * Die Nachkalkulation beantwortet die eine Frage, die die Budget-Ampel NICHT
 * beantwortet: hat die Baustelle Geld verdient?
 *
 * Der gefährlichste Fehler wäre, den Verrechnungssatz als Kosten anzusetzen.
 * Dann ergäbe jede Baustelle eine Marge von null, und das sähe aus wie ein
 * Ergebnis. Deshalb sind Kosten- und Verrechnungssätze hier durchgehend
 * getrennt.
 */

const kosten = { fach: 42, helper: 28 };

const zeit = (min: number, helfer = false): TimeEntry =>
  ({
    id: `e${min}${helfer}`,
    companyId: 'perl',
    userId: 'u1',
    userName: 'Monteur',
    date: '2026-08-10',
    status: 'Anwesend',
    startTime: '07:00',
    // Endzeit so, dass calcWorkMin genau `min` ergibt (ohne Pause).
    endTime: `${String(7 + Math.floor(min / 60)).padStart(2, '0')}:${String(min % 60).padStart(2, '0')}`,
    breakDuration: 0,
    projectNumber: 'B-001',
    isHelper: helfer,
  }) as TimeEntry;

const rechnung = (netto: number, status: Invoice['paymentStatus'] = 'Bezahlt'): Invoice =>
  ({
    id: `r${netto}`,
    companyId: 'perl',
    invoiceNumber: `RE-2026-000${netto}`,
    projectNumber: 'B-001',
    customerName: 'Familie Huber',
    invoiceDate: '2026-08-20',
    dueDate: '2026-09-03',
    totalNetto: netto,
    totalVat: netto * 0.2,
    totalBrutto: netto * 1.2,
    paymentStatus: status,
  }) as Invoice;

describe('Nachkalkulation', () => {
  it('rechnet Personalkosten mit dem KOSTEN-Satz, nicht dem Verrechnungssatz', () => {
    // 10 Facharbeiterstunden.
    const k = rechneBaustelle('B-001', 'Familie Huber', [zeit(600)], [rechnung(1000)], undefined, kosten);
    expect(k.fachStunden).toBe(10);
    expect(k.personalkosten).toBe(420); // 10 × 42, nicht 10 × 65
    expect(k.erloes).toBe(1000);
    expect(k.deckungsbeitrag).toBe(580);
    expect(k.margeProzent).toBe(58);
  });

  it('unterscheidet Facharbeiter- und Helferstunden', () => {
    const k = rechneBaustelle(
      'B-001',
      'Familie Huber',
      [zeit(600), zeit(300, true)],
      [rechnung(1000)],
      undefined,
      kosten,
    );
    expect(k.fachStunden).toBe(10);
    expect(k.helferStunden).toBe(5);
    expect(k.personalkosten).toBe(10 * 42 + 5 * 28); // 560
  });

  it('nimmt Rechnungen als Erlös, sobald es welche gibt', () => {
    const angebot = { status: 'Angenommen', totalNetto: 2000 } as Quote;
    const k = rechneBaustelle('B-001', 'Huber', [zeit(60)], [rechnung(900)], angebot, kosten);
    // Verrechnet schlägt kalkuliert: was tatsächlich fakturiert wurde, ist
    // die belastbare Zahl.
    expect(k.erloes).toBe(900);
    expect(k.erloesQuelle).toBe('Rechnungen');
  });

  it('greift auf das Angebot zurück, solange nicht abgerechnet ist', () => {
    const angebot = { status: 'Angenommen', totalNetto: 2000 } as Quote;
    const k = rechneBaustelle('B-001', 'Huber', [zeit(60)], [], angebot, kosten);
    expect(k.erloes).toBe(2000);
    // Die Quelle wird mitgegeben, damit die Ansicht sagen kann, dass das eine
    // Erwartung ist und kein Ergebnis.
    expect(k.erloesQuelle).toBe('Angebot');
  });

  it('zählt Anzahlung und Schlussrechnung zusammen, nicht doppelt', () => {
    /*
      DER TEUERSTE FEHLER DIESER AUSWERTUNG WÄRE HIER.

      Seit Stufe 10.2 trägt eine Schlussrechnung zwei Zahlen: `totalNetto` ist
      die RESTFORDERUNG nach Abzug der Anzahlungen, `gesamtNetto` die volle
      Leistung. Summierte diese Auswertung die Gesamtleistung, käme die
      Anzahlung zweimal vor — die Baustelle sähe um ihren Betrag einträglicher
      aus, als sie ist.

      Anzahlung 1.000 + Schlussrechnung (Gesamt 3.000, Rest 2.000) = 3.000.
    */
    const anzahlung = { ...rechnung(1000), art: 'anzahlung' } as Invoice;
    const schluss = {
      ...rechnung(2000),
      art: 'schluss',
      gesamtNetto: 3000,
      gesamtVat: 600,
      gesamtBrutto: 3600,
      vorrechnungen: [
        { invoiceId: 'r1000', invoiceNumber: 'RE-2026-0001000', invoiceDate: '2026-08-20', netto: 1000, vat: 200, brutto: 1200 },
      ],
    } as Invoice;

    const k = rechneBaustelle('B-001', 'Huber', [zeit(600)], [anzahlung, schluss], undefined, kosten);
    expect(k.erloes).toBe(3000);
    expect(k.erloesQuelle).toBe('Rechnungen');
  });

  it('zählt stornierte Rechnungen nicht als Erlös', () => {
    const k = rechneBaustelle(
      'B-001',
      'Huber',
      [zeit(600)],
      [rechnung(1000), rechnung(500, 'Storniert')],
      undefined,
      kosten,
    );
    expect(k.erloes).toBe(1000);
  });

  it('meldet keine Marge, wenn kein Erlös bekannt ist', () => {
    /**
     * Null Prozent läse sich wie „nichts verdient". Ohne Rechnung und ohne
     * angenommenes Angebot gibt es aber gar keine Aussage — und die Ansicht
     * muss das unterscheiden können.
     */
    const k = rechneBaustelle('B-001', 'Huber', [zeit(600)], [], undefined, kosten);
    expect(k.erloes).toBe(0);
    expect(k.margeProzent).toBeNull();
    expect(k.erloesQuelle).toBe('unbekannt');
    expect(margenTon(k)).toBe('ruht');
  });

  it('lässt Zeiten anderer Baustellen liegen', () => {
    const fremd = { ...zeit(600), projectNumber: 'B-999' } as TimeEntry;
    const k = rechneBaustelle('B-001', 'Huber', [zeit(120), fremd], [], undefined, kosten);
    expect(k.fachStunden).toBe(2);
  });

  it('findet Buchungen mit führendem „PR-“ aus Altbeständen', () => {
    const alt = { ...zeit(600), projectNumber: 'PR-B-001' } as TimeEntry;
    const k = rechneBaustelle('B-001', 'Huber', [alt], [], undefined, kosten);
    // Würden sie übersehen, sähe die Baustelle profitabler aus, als sie ist.
    expect(k.fachStunden).toBe(10);
  });

  it('warnt bei dünner Marge und schlägt bei Verlust aus', () => {
    // Erlös 500, Kosten 420 -> 16 % Deckungsbeitrag. Formal positiv, aber nach
    // Gemeinkosten bleibt davon nichts.
    const duenn = rechneBaustelle('B-001', 'Huber', [zeit(600)], [rechnung(500)], undefined, kosten);
    expect(margenTon(duenn)).toBe('achtung');

    const verlust = rechneBaustelle('B-001', 'Huber', [zeit(600)], [rechnung(300)], undefined, kosten);
    expect(verlust.deckungsbeitrag).toBeLessThan(0);
    expect(margenTon(verlust)).toBe('schlecht');

    const gut = rechneBaustelle('B-001', 'Huber', [zeit(600)], [rechnung(1000)], undefined, kosten);
    expect(margenTon(gut)).toBe('gut');
  });
});

describe('Material aus dem Angebot (Launch-Check 25.09.2026, M9)', () => {
  const angebot = {
    status: 'Angenommen',
    totalNetto: 500,
    positions: [
      { label: 'Montage', qty: 3.5, unit: 'h', unitPrice: 70, netto: 245, istArbeitszeit: true },
      { label: 'Anfahrt', qty: 1, unit: 'h', unitPrice: 5, netto: 5, istArbeitszeit: false },
      { label: 'Heizkörper', qty: 1, unit: 'Stk', unitPrice: 250, netto: 250, istArbeitszeit: false },
    ],
  } as unknown as Quote;

  it('nennt verkauftes Material ohne Einkaufspreis, statt 100 % auszuweisen', () => {
    const k = rechneBaustelle('B-4', 'Huber', [], [], angebot, kosten);
    expect(k.materialLuecken).toEqual(['Heizkörper (aus dem Angebot)']);
    expect(margenTon(k)).toBe('achtung');
  });

  it('schweigt, sobald ein Schein Material mit Preis trägt — sonst wäre es doppelt', () => {
    const k = rechneBaustelle('B-4', 'Huber', [], [], angebot, kosten, { kosten: 180, ohnePreis: [], scheine: 1 });
    expect(k.materialLuecken).toEqual([]);
  });

  it('ein nicht angenommenes Angebot zählt nicht', () => {
    const k = rechneBaustelle('B-4', 'Huber', [], [], { ...angebot, status: 'Versendet' } as Quote, kosten);
    expect(k.materialLuecken).toEqual([]);
  });
});

/*
  TESTBERICHT RUNDE 5, M3: PR-2026-0192 meldete „Ohne Einkaufspreis …:
  Badsanierung pauschal (aus dem Angebot)“. Eine Pauschale ist eine Leistung;
  ihre Arbeit steht in den Personalkosten.
*/
describe('Pauschale Leistung im Angebot (Runde 5, M3)', () => {
  const mit = (positions: object[]) => ({ status: 'Angenommen', totalNetto: 3000, positions }) as unknown as Quote;

  it('ist keine Materiallücke — in jeder üblichen Schreibweise', () => {
    for (const unit of ['pauschal', 'Pauschale', 'PAUSCHAL', 'pausch.', 'psch', 'Psch.', ' pauschal ']) {
      const k = rechneBaustelle('B-6', 'Huber', [], [], mit([
        { label: 'Badsanierung pauschal', qty: 1, unit, unitPrice: 3000, netto: 3000 },
      ]), kosten);
      expect(k.materialLuecken, unit).toEqual([]);
      expect(margenTon(k), unit).not.toBe('achtung');
    }
  });

  it('Gegenprobe: Ware bleibt eine Lücke — Stück, ohne Einheit, „PA“, und eine Pauschale mit Katalogartikel ohne Preis', () => {
    const k = rechneBaustelle('B-6', 'Huber', [], [], mit([
      { label: 'Heizkörper', qty: 1, unit: 'Stk', unitPrice: 250, netto: 250 },
      { label: 'Kleinteile', qty: 1, unit: '', unitPrice: 40, netto: 40 },
      { label: 'Handtuchhalter', qty: 1, unit: 'PA', unitPrice: 30, netto: 30 },
      { label: 'Ventilset', qty: 1, unit: 'pauschal', unitPrice: 80, netto: 80, materialId: 'm-ohne' },
    ]), kosten, undefined, [{ id: 'm-ohne', companyId: 'perl', name: 'Ventilset', stock: 0 } as Material]);
    expect(k.materialLuecken).toEqual([
      'Heizkörper (aus dem Angebot)', 'Kleinteile (aus dem Angebot)',
      'Handtuchhalter (aus dem Angebot)', 'Ventilset (aus dem Angebot)',
    ]);
  });

  it('eine Pauschale mit bekanntem Einkaufspreis zählt weiter als Material', () => {
    const k = rechneBaustelle('B-6', 'Huber', [], [], mit([
      { label: 'Kleinmaterial', qty: 1, unit: 'pauschal', unitPrice: 80, netto: 80, materialId: 'm-k' },
    ]), kosten, undefined, [{ id: 'm-k', companyId: 'perl', name: 'Kleinmaterial', stock: 0, einkaufspreis: 35 } as Material]);
    expect(k.materialLuecken).toEqual([]);
    expect(k.materialkosten).toBe(35);
  });
});

/*
  Runde 3, M12: PR-2026-0193 meldete „Ohne Einkaufspreis: Pressfitting Bogen
  15 mm (aus dem Angebot)", obwohl der Katalogartikel 2,10 € EK hat. Die
  Angebotszeile trägt den Artikel; die Nachkalkulation sieht ihn jetzt an.
*/
describe('Katalogartikel im Angebot (Runde 3, M12)', () => {
  const katalog = [
    { id: 'm-press', companyId: 'perl', name: 'Pressfitting Bogen 15 mm', stock: 0, einkaufspreis: 2.1 },
    { id: 'm-ohne', companyId: 'perl', name: 'Ventil', stock: 0 },
  ] as Material[];
  const angebot = {
    status: 'Angenommen',
    totalNetto: 300,
    positions: [
      // Bezeichnung nach der Übernahme geändert — der Artikel bleibt.
      { label: 'Bogen 15 mm verpresst', qty: 10, unit: 'Stk', unitPrice: 6, netto: 60, materialId: 'm-press' },
      { label: 'Ventil', qty: 1, unit: 'Stk', unitPrice: 40, netto: 40, materialId: 'm-ohne' },
      { label: 'Montage', qty: 2, unit: 'h', unitPrice: 100, netto: 200, istArbeitszeit: true },
    ],
  } as unknown as Quote;

  it('rechnet den Einkaufspreis des Artikels ein, statt ihn als Lücke zu melden', () => {
    const k = rechneBaustelle('B-5', 'Huber', [], [rechnung(300)], angebot, kosten, undefined, katalog);
    expect(k.materialLuecken).toEqual(['Ventil (aus dem Angebot)']);
    expect(k.materialkosten).toBe(21);
    expect(k.deckungsbeitrag).toBe(279);
  });

  it('findet den Artikel ohne Bezug über den Namen, wie bei den Scheinen', () => {
    const ohneBezug = {
      ...angebot,
      positions: [{ label: 'pressfitting bogen 15 mm', qty: 4, unit: 'Stk', unitPrice: 6, netto: 24 }],
    } as unknown as Quote;
    const k = rechneBaustelle('B-5', 'Huber', [], [], ohneBezug, kosten, undefined, katalog);
    expect(k.materialLuecken).toEqual([]);
    expect(k.materialkosten).toBe(8.4);
  });

  it('bleibt ohne Katalog beim Hinweis — nichts wird geschätzt', () => {
    const k = rechneBaustelle('B-5', 'Huber', [], [], angebot, kosten);
    expect(k.materialLuecken).toEqual(['Bogen 15 mm verpresst (aus dem Angebot)', 'Ventil (aus dem Angebot)']);
    expect(k.materialkosten).toBe(0);
  });

  it('zählt nichts doppelt, sobald ein Schein Material trägt', () => {
    const k = rechneBaustelle('B-5', 'Huber', [], [rechnung(300)], angebot, kosten, { kosten: 50, ohnePreis: [], scheine: 1 }, katalog);
    expect(k.materialkosten).toBe(50);
    expect(k.materialLuecken).toEqual([]);
  });
});
