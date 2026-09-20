import type { Invoice } from '@/types';

/**
 * Buchungsstapel für BMD NTCS.
 *
 * WAS DIESE DATEI VOM RECHNUNGSAUSGANGSBUCH UNTERSCHEIDET. Das Journal
 * (`buchhaltungExport.ts`) ist eine LISTE: es beschreibt Rechnungen und
 * überlässt der Kanzlei, was sie damit bucht. Diese Datei hier ist eine
 * BUCHUNG — sie sagt, welches Konto im Soll und welches im Haben steht.
 * Damit ist sie um Größenordnungen nützlicher und um Größenordnungen
 * gefährlicher: eine falsch kontierte Zeile fällt frühestens beim
 * Jahresabschluss auf.
 *
 * DESHALB RÄT SIE NICHT. Jedes Konto kommt aus dem Kontenrahmen des Betriebs
 * (`buchungskonten`), den Administrator, Geschäftsführung oder Buchhaltung in
 * den Einstellungen pflegen. Fehlt auch nur eines, das für den Zeitraum
 * gebraucht wird, entsteht KEINE Datei — es kommt eine Liste dessen heraus,
 * was fehlt. Eine Datei mit Lücken sähe importierbar aus.
 *
 * GEBUCHT WIRD BRUTTO MIT STEUERCODE, wie BMD es erwartet: eine Zeile je
 * Vorgang, der Steuerbetrag ergibt sich aus dem Code. Zwei Zeilen mit Netto
 * und Steuer getrennt wären dasselbe Ergebnis mit doppeltem Abstimmaufwand.
 */

export type Kontozweck = 'erloes' | 'reverse_charge' | 'anzahlung' | 'debitoren';

export interface Buchungskonto {
  zweck: Kontozweck;
  /** Nur beim Erlöskonto: der Steuersatz als Anteil (0.2 = 20 %). */
  ustSatz?: number | null;
  konto: string;
  steuercode?: string | null;
}

export interface BmdZeile {
  soll: string;
  haben: string;
  /** TT.MM.JJJJ — so, wie BMD es liest. */
  belegdatum: string;
  belegnummer: string;
  buchungstext: string;
  betrag: number;
  steuercode: string;
}

export interface BmdErgebnis {
  /** Leer, solange etwas fehlt. */
  csv: string;
  zeilen: BmdZeile[];
  /**
   * Was im Kontenrahmen fehlt — in Worten, nicht als Schlüssel. Genau diese
   * Sätze stehen in der Ansicht.
   */
  fehlend: string[];
}

const KOPF = [
  'Sollkonto', 'Habenkonto', 'Belegdatum', 'Belegnummer', 'Buchungstext', 'Betrag', 'Steuercode',
];

function cell(v: unknown): string {
  const s = v === null || v === undefined ? '' : String(v);
  return /[";\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

/** Beträge mit Komma — BMD liest in deutscher Schreibweise. */
const betrag = (n: number) => n.toFixed(2).replace('.', ',');

function datum(iso: string): string {
  const [j, m, t] = iso.slice(0, 10).split('-');
  return `${t}.${m}.${j}`;
}

/** Aus einem Zeitstempel wird das Datum in ORTSZEIT, nicht in UTC. */
function tagVon(ms: number): string {
  const d = new Date(ms);
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

/** Steuersätze werden auf vier Nachkommastellen verglichen, nicht auf Gleitkomma. */
const satzSchluessel = (s: number | null | undefined) => (s ?? 0).toFixed(4);

const prozent = (s: number) => `${(s * 100).toFixed(2).replace(/[.,]?0+$/, '')} %`;

/**
 * Baut den Buchungsstapel für einen Zeitraum.
 *
 * STORNIERTE RECHNUNGEN GEHEN MIT, UND ZWAR ZWEIMAL, wenn beides in den
 * Zeitraum fällt: die ursprüngliche Buchung, weil sie stattgefunden hat, und
 * die Stornobuchung mit vertauschten Konten am Stornotag. Eine stornierte
 * Rechnung wegzulassen hiesse, einen Vorgang zu unterschlagen, der einmal in
 * den Büchern stand.
 */
export function buildBmdCsv(
  invoices: Invoice[],
  konten: Buchungskonto[],
  von: string,
  bis: string,
): BmdErgebnis {
  const erloes = new Map<string, Buchungskonto>();
  let rc: Buchungskonto | undefined;
  let anzahlung: Buchungskonto | undefined;
  let debitoren: Buchungskonto | undefined;
  for (const k of konten) {
    if (k.zweck === 'erloes') erloes.set(satzSchluessel(k.ustSatz), k);
    else if (k.zweck === 'reverse_charge') rc = k;
    else if (k.zweck === 'anzahlung') anzahlung = k;
    else if (k.zweck === 'debitoren') debitoren = k;
  }

  const fehlend: string[] = [];
  const vermisst = (satz: string) => {
    if (!fehlend.includes(satz)) fehlend.push(satz);
  };

  /** Das Gegenkonto einer Rechnung — und `undefined`, wenn es nicht hinterlegt ist. */
  function gegenkonto(i: Invoice): Buchungskonto | undefined {
    if (i.reverseCharge) {
      if (!rc) vermisst('Erlöskonto für Bauleistungen mit Übergang der Steuerschuld (§ 19 Abs 1a UStG)');
      return rc;
    }
    /*
      EIN FEHLENDER STEUERSATZ IST NICHT NULL PROZENT. Am Beleg ist `vatRate`
      erst seit einer späteren Fassung Pflicht; ein Altbestand kann ohne ihn
      dastehen. Ihn als 0 zu lesen hiesse, eine Rechnung mit 20 % auf das
      Erlöskonto für steuerfreie Umsätze zu buchen — richtig aussehend,
      falsch gebucht, und erst der Jahresabschluss merkt es. Lieber steht der
      Export still und nennt die Rechnung beim Namen.
    */
    if (i.vatRate == null) {
      vermisst(
        `Die Rechnung ${i.invoiceNumber} trägt keinen Steuersatz — ohne ihn ist kein Erlöskonto `
        + 'zuzuordnen. Bitte den Beleg prüfen.',
      );
      return undefined;
    }
    const k = erloes.get(satzSchluessel(i.vatRate));
    if (!k) vermisst(`Erlöskonto für ${prozent(i.vatRate)} Umsatzsteuer`);
    return k;
  }

  const imZeitraum = invoices
    .filter((i) => {
      if (i.invoiceDate >= von && i.invoiceDate <= bis) return true;
      return i.cancelledAt != null && tagVon(i.cancelledAt) >= von && tagVon(i.cancelledAt) <= bis;
    })
    .sort((a, b) => a.invoiceNumber.localeCompare(b.invoiceNumber, 'de'));

  if (imZeitraum.length > 0 && !debitoren) {
    vermisst('Sammelkonto für Forderungen aus Lieferungen und Leistungen (Debitoren)');
  }

  const zeilen: BmdZeile[] = [];

  for (const i of imZeitraum) {
    const gegen = gegenkonto(i);
    const storniert = i.paymentStatus === 'Storniert';
    const text = `${i.customerName}${i.projectNumber ? ` / ${i.projectNumber}` : ''}`;

    /*
      DIE ANZAHLUNGSRECHNUNG BUCHT KEINEN ERLÖS. Was der Kunde vorab zahlt,
      ist eine Verbindlichkeit, solange die Leistung aussteht — erst die
      Schlussrechnung macht daraus Umsatz. Die Umsatzsteuer schuldet der
      Betrieb trotzdem schon; darum trägt auch diese Zeile den Steuercode.
    */
    const habenKonto = i.art === 'anzahlung' ? anzahlung : gegen;
    if (i.art === 'anzahlung' && !anzahlung) {
      vermisst('Konto für erhaltene Anzahlungen (eine Verbindlichkeit, kein Erlös)');
    }

    if (i.invoiceDate >= von && i.invoiceDate <= bis && debitoren && habenKonto) {
      zeilen.push({
        soll: debitoren.konto,
        haben: habenKonto.konto,
        belegdatum: datum(i.invoiceDate),
        belegnummer: i.invoiceNumber,
        buchungstext: text,
        betrag: i.totalBrutto ?? 0,
        steuercode: habenKonto.steuercode ?? '',
      });

      /*
        DIE SCHLUSSRECHNUNG HOLT DIE ANZAHLUNG AUS DER VERBINDLICHKEIT IN DEN
        ERLÖS. Ohne diese Zeile bliebe das Anzahlungskonto für immer stehen
        und der Umsatz wäre um die Anzahlung zu niedrig — die Rechnung selbst
        bucht ja nur die RESTforderung.
      */
      for (const v of i.vorrechnungen ?? []) {
        if (!anzahlung) {
          vermisst('Konto für erhaltene Anzahlungen (eine Verbindlichkeit, kein Erlös)');
          continue;
        }
        if (!gegen) continue;
        zeilen.push({
          soll: anzahlung.konto,
          haben: gegen.konto,
          belegdatum: datum(i.invoiceDate),
          belegnummer: i.invoiceNumber,
          buchungstext: `Anzahlung ${v.invoiceNumber} verrechnet`,
          betrag: v.brutto,
          steuercode: gegen.steuercode ?? '',
        });
      }
    }

    /*
      Die Stornobuchung ist die ursprüngliche mit vertauschten Konten, am
      Stornotag. Ein negativer Betrag auf der ursprünglichen Seite wäre
      dasselbe Ergebnis — aber keine Buchhaltung kennzeichnet einen Storno so,
      und eine Kanzlei, die ihn übersieht, korrigiert ihn nie.
    */
    if (storniert && i.cancelledAt != null && debitoren && habenKonto) {
      const tag = tagVon(i.cancelledAt);
      if (tag >= von && tag <= bis) {
        zeilen.push({
          soll: habenKonto.konto,
          haben: debitoren.konto,
          belegdatum: datum(tag),
          belegnummer: i.invoiceNumber,
          buchungstext: `Storno ${i.invoiceNumber}${i.cancellationNote ? ` — ${i.cancellationNote}` : ''}`,
          betrag: i.totalBrutto ?? 0,
          steuercode: habenKonto.steuercode ?? '',
        });
      }
    }
  }

  /*
    ALLES ODER NICHTS. Fehlt ein Konto, entsteht keine Datei — auch dann
    nicht, wenn neunzig Prozent der Zeilen stünden. Ein Stapel, dem die
    Zeilen eines Steuersatzes fehlen, importiert sich fehlerfrei und bucht
    einen zu niedrigen Umsatz.
  */
  if (fehlend.length > 0) return { csv: '', zeilen: [], fehlend };

  const csv = [
    KOPF.join(';'),
    ...zeilen.map((z) =>
      [z.soll, z.haben, z.belegdatum, z.belegnummer, z.buchungstext, betrag(z.betrag), z.steuercode]
        .map(cell)
        .join(';'),
    ),
  ].join('\r\n');

  return { csv: `${csv}\r\n`, zeilen, fehlend };
}

export function bmdCsvFilename(von: string, bis: string): string {
  return `Buchungsstapel_BMD_${von}_bis_${bis}.csv`;
}
