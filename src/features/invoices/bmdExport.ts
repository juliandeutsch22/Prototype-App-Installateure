import { stornoBelegTag } from './stornoBelegTag';
import type { Invoice, Zahlungseingang } from '@/types';
import { csvZelle as cell } from '@/lib/csvZelle';

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

export type Kontozweck = 'erloes' | 'reverse_charge' | 'anzahlung' | 'debitoren' | 'bank' | 'skonto';

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
  /**
   * Die Kunden- bzw. Debitorennummer aus dem Kundenstamm (Testbericht
   * 30.09.2026, H7 vorgebaut) — leer, wo keine hinterlegt ist.
   */
  debitor?: string;
}

/** Die Debitorennummer einer Rechnung — aus dem Kundenstamm, von der Ansicht gereicht. */
export type DebitorVon = (inv: Invoice) => string | null | undefined;

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

/*
  DIE SPALTENNAMEN SIND UNGEPRÜFT (offene Punkte C4). Es gab keine
  Importdefinition, gegen die sie hätten geprüft werden können; BMD liest
  eine CSV über eine Definition, die in der Kanzlei angelegt wird. Vor dem
  ersten Import eine Beispieldatei mit der Kanzlei abgleichen — ändert sie
  einen Namen, dann hier, und `tests/unit/bmdExport.test.ts` zieht mit.
*/
const KOPF = [
  'Sollkonto', 'Habenkonto', 'Belegdatum', 'Belegnummer', 'Buchungstext', 'Betrag', 'Steuercode',
];

/*
  DIE KUNDENNUMMER STEHT AM ENDE — IN JEDER ZEILE (Runde 3, M5). Eine Kanzlei
  ordnet die Spalten einmal zu; eine neue Spalte in der Mitte verschöbe jede
  Zuordnung danach. Bis zum 06.10. kam die Spalte nur, wenn wenigstens ein
  Kunde eine Nummer hatte — der Pilotbetrieb sah sie deshalb nie, obwohl das
  Handbuch sie beschrieb. Jetzt steht sie immer da: die Kundennummer, sonst
  das Sammelkonto der Debitoren. Ob BMD sie als Personenkonto liest, klärt der
  Importtest mit der Kanzlei; bis dahin ist der Stapel vorgebaut.
*/
const KUNDENNUMMER = 'Kundennummer';

function alsCsv(zeilen: BmdZeile[]): string {
  const csv = [
    [...KOPF, KUNDENNUMMER].join(';'),
    ...zeilen.map((z) =>
      [
        z.soll, z.haben, z.belegdatum, z.belegnummer, z.buchungstext, betrag(z.betrag), z.steuercode,
        z.debitor ?? '',
      ]
        .map(cell)
        .join(';'),
    ),
  ].join('\r\n');
  return `${csv}\r\n`;
}

/** Beträge mit Komma — BMD liest in deutscher Schreibweise. */
const betrag = (n: number) => n.toFixed(2).replace('.', ',');

function datum(iso: string): string {
  const [j, m, t] = iso.slice(0, 10).split('-');
  return `${t}.${m}.${j}`;
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
  debitorVon?: DebitorVon,
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
      // Runde 3, M7: dasselbe Belegdatum wie Liste, PDF, Archiv und Ausgangsbuch.
      const t = stornoBelegTag(i);
      return t != null && t >= von && t <= bis;
    })
    .sort((a, b) => a.invoiceNumber.localeCompare(b.invoiceNumber, 'de'));

  if (imZeitraum.length > 0 && !debitoren) {
    vermisst('Sammelkonto für Forderungen aus Lieferungen und Leistungen (Debitoren)');
  }

  const zeilen: BmdZeile[] = [];

  /*
    WIE DIE ANZAHLUNG IN DEN ERLÖS WANDERT — so, wie sie gebucht wurde
    (offene Punkte A1, Prüflauf P2-06).

    Trägt das Anzahlungskonto einen Steuercode, hat BMD die Umsatzsteuer der
    Anzahlung schon beim Buchen der Anzahlungsrechnung abgespalten: auf dem
    Konto steht das NETTO. Die Umbuchung schiebt dann genau das hinüber —
    netto und ohne Steuercode. Bisher ging sie brutto mit dem Steuercode des
    Erlöskontos, und BMD rechnete die Steuer der Anzahlung ein zweites Mal
    heraus: in der Voranmeldung stand sie doppelt.

    Ohne Steuercode am Anzahlungskonto steht dort das Brutto, und die Steuer
    ist noch nicht gebucht; dann entsteht sie beim Umbuchen, wie bisher.
  */
  const umbuchung = (v: { netto: number; brutto: number }, erloesCode: string | null | undefined) =>
    anzahlung?.steuercode
      ? { betrag: v.netto, steuercode: '' }
      : { betrag: v.brutto, steuercode: erloesCode ?? '' };

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
          ...umbuchung(v, gegen.steuercode),
        });
      }
    }

    /*
      Die Stornobuchung ist die ursprüngliche mit vertauschten Konten, am
      Belegtag des Stornos (`stornoBelegTag`, Runde 3 M7). Ein negativer Betrag auf der ursprünglichen Seite wäre
      dasselbe Ergebnis — aber keine Buchhaltung kennzeichnet einen Storno so,
      und eine Kanzlei, die ihn übersieht, korrigiert ihn nie.
    */
    const stornoTag = storniert ? stornoBelegTag(i) : null;
    if (stornoTag != null && debitoren && habenKonto) {
      const tag = stornoTag;
      if (tag >= von && tag <= bis) {
        zeilen.push({
          soll: habenKonto.konto,
          haben: debitoren.konto,
          belegdatum: datum(tag),
          // Mit Stornorechnung (B7) ist sie der Beleg der Stornobuchung.
          belegnummer: i.stornoNummer ?? i.invoiceNumber,
          buchungstext: `${i.stornoNummer ? `Stornorechnung ${i.stornoNummer} zu` : 'Storno'} ${i.invoiceNumber}${i.cancellationNote ? ` — ${i.cancellationNote}` : ''}`,
          betrag: i.totalBrutto ?? 0,
          steuercode: habenKonto.steuercode ?? '',
        });

        /*
          UND DIE UMBUCHUNG DER ANZAHLUNG GEHT MIT ZURÜCK (Prüflauf
          25.09.2026, P2-05). Die Schlussrechnung hatte die Anzahlung aus der
          Verbindlichkeit in den Erlös geholt; ihr Storno buchte bisher nur
          die Restforderung zurück. Der Erlös blieb um die Anzahlung zu hoch
          und das Anzahlungskonto um sie zu niedrig — obwohl die Anzahlung
          nach dem Storno wieder offen auf die Leistung steht. Dieselbe Zeile
          wie beim Verrechnen, mit vertauschten Konten, am Stornotag.
        */
        for (const v of i.vorrechnungen ?? []) {
          if (!anzahlung) {
            vermisst('Konto für erhaltene Anzahlungen (eine Verbindlichkeit, kein Erlös)');
            continue;
          }
          if (!gegen) continue;
          zeilen.push({
            soll: gegen.konto,
            haben: anzahlung.konto,
            belegdatum: datum(tag),
            belegnummer: i.stornoNummer ?? i.invoiceNumber,
            buchungstext: `Storno: Anzahlung ${v.invoiceNumber} verrechnet`,
            ...umbuchung(v, gegen.steuercode),
          });
        }
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

  // Kundennummer, sonst das Sammelkonto der Debitoren (Runde 3, M5).
  const nummer = new Map(imZeitraum.map((i) => [i.invoiceNumber, debitorVon?.(i)?.trim() || '']));
  for (const z of zeilen) {
    const r = imZeitraum.find((i) => i.invoiceNumber === z.belegnummer || i.stornoNummer === z.belegnummer);
    z.debitor = (r ? nummer.get(r.invoiceNumber) : '') || debitoren?.konto || '';
  }

  return { csv: alsCsv(zeilen), zeilen, fehlend };
}

/**
 * Zahlungen, Rückzahlungen und Skonto als EIGENER Stapel (Testbericht
 * 30.09.2026, H7 vorgebaut).
 *
 * GETRENNT VOM RECHNUNGSSTAPEL, weil viele Kanzleien die Bank selbst aus dem
 * Kontoauszug buchen; wer beides importiert, bucht jede Zahlung doppelt.
 * Deshalb ein eigener Knopf und eine eigene Datei, die der Betrieb nur auf
 * Wunsch der Kanzlei weitergibt.
 *
 * - Eingang: Bank an Debitoren.
 * - Rückzahlung (negativer Betrag): Debitoren an Bank, mit dem Betrag ohne
 *   Vorzeichen — wie die Stornobuchung mit vertauschten Konten.
 * - Skonto: Erlösschmälerung an Debitoren, mit dem Steuercode des
 *   Erlöskontos der Rechnung; so berichtigt BMD die Umsatzsteuer im Satz
 *   der Rechnung.
 *
 * Wie beim Rechnungsstapel: fehlt ein Konto, entsteht keine Datei.
 */
export function buildBmdZahlungenCsv(
  zahlungen: Pick<Zahlungseingang, 'invoiceId' | 'datum' | 'betrag' | 'art' | 'hinweis'>[],
  rechnungen: (Invoice & { id: string })[],
  konten: Buchungskonto[],
  von: string,
  bis: string,
  debitorVon?: DebitorVon,
): BmdErgebnis {
  const zweck = (z: Kontozweck) => konten.find((k) => k.zweck === z);
  const erloes = new Map(konten.filter((k) => k.zweck === 'erloes').map((k) => [satzSchluessel(k.ustSatz), k]));
  const bank = zweck('bank');
  const skonto = zweck('skonto');
  const debitoren = zweck('debitoren');
  const rc = zweck('reverse_charge');
  const nachId = new Map(rechnungen.map((r) => [r.id, r]));

  const fehlend: string[] = [];
  const vermisst = (satz: string) => {
    if (!fehlend.includes(satz)) fehlend.push(satz);
  };

  const imZeitraum = zahlungen
    .filter((z) => z.datum >= von && z.datum <= bis)
    .sort((a, b) => a.datum.localeCompare(b.datum));

  if (imZeitraum.length > 0 && !debitoren) {
    vermisst('Sammelkonto für Forderungen aus Lieferungen und Leistungen (Debitoren)');
  }

  const zeilen: BmdZeile[] = [];
  for (const z of imZeitraum) {
    const r = nachId.get(z.invoiceId);
    if (!r) {
      vermisst('Eine Zahlung gehört zu einer Rechnung, die nicht geladen werden konnte — bitte erneut laden.');
      continue;
    }
    const text = `${r.customerName}${z.hinweis ? ` / ${z.hinweis}` : ''}`;
    // Kundennummer, sonst das Sammelkonto der Debitoren (Runde 3, M5).
    const debitor = debitorVon?.(r)?.trim() || debitoren?.konto || '';
    if (z.art === 'Skonto') {
      if (!skonto) {
        vermisst('Konto für gewährte Skonti (Erlösschmälerung)');
        continue;
      }
      const code = r.reverseCharge ? rc?.steuercode : erloes.get(satzSchluessel(r.vatRate))?.steuercode;
      if (!debitoren) continue;
      zeilen.push({
        soll: skonto.konto, haben: debitoren.konto, belegdatum: datum(z.datum), belegnummer: r.invoiceNumber,
        buchungstext: `Skonto ${r.invoiceNumber} ${text}`, betrag: Math.abs(z.betrag), steuercode: code ?? '', debitor,
      });
      continue;
    }
    if (!bank) {
      vermisst('Bankkonto (für Zahlungseingänge und Rückzahlungen)');
      continue;
    }
    if (!debitoren) continue;
    const rueck = z.betrag < 0;
    zeilen.push({
      soll: rueck ? debitoren.konto : bank.konto,
      haben: rueck ? bank.konto : debitoren.konto,
      belegdatum: datum(z.datum),
      belegnummer: r.invoiceNumber,
      buchungstext: `${rueck ? 'Rückzahlung' : 'Zahlung'} ${r.invoiceNumber} ${text}`,
      betrag: Math.abs(z.betrag),
      steuercode: '',
      debitor,
    });
  }

  if (fehlend.length > 0) return { csv: '', zeilen: [], fehlend };
  return { csv: alsCsv(zeilen), zeilen, fehlend };
}

export function bmdZahlungenFilename(von: string, bis: string): string {
  return `Zahlungsstapel_BMD_${von}_bis_${bis}.csv`;
}

export function bmdCsvFilename(von: string, bis: string): string {
  return `Buchungsstapel_BMD_${von}_bis_${bis}.csv`;
}
