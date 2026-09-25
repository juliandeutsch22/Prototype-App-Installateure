import type { Customer, Invoice } from '@/types';
import { zahlstand } from './zahlstand';

/**
 * Rechnungsausgangsbuch für den Steuerberater.
 *
 * WOZU. Bis hierher bekam der Steuerberater PDFs und tippte jede Rechnung ab.
 * Das kostet Geld, dauert, und jede Abtipperei ist eine Gelegenheit für einen
 * Zahlendreher — ausgerechnet bei den Zahlen, die in die Umsatzsteuervoranmeldung
 * gehen.
 *
 * WARUM EIN DOKUMENTIERTES CSV UND KEIN BMD- ODER DATEV-FORMAT. Beide haben
 * feste Spaltenlayouts mit Konten- und Steuerschlüsseln, die sich nach dem
 * Kontenplan der Kanzlei richten — welche Erlöskonten dieser Betrieb bebucht,
 * weiß nur der Steuerberater. Ein geratenes Format wäre schlimmer als keins:
 * es sieht importierbar aus und bucht auf die falschen Konten. Dieses CSV
 * enthält alle Felder, die BMD, RZL und DATEV für einen Import brauchen; die
 * Zuordnung zu Konten macht die Kanzlei einmal beim Einrichten.
 *
 * WAS BESONDERS WICHTIG IST:
 *
 *  - STORNIERTE RECHNUNGEN GEHEN MIT. Sie wegzulassen wäre der naheliegende
 *    Fehler: eine stornierte Rechnung ist kein Nichts, sondern ein Vorgang,
 *    der im Journal stehen muss. Ein Nummernkreis mit Lücken ist für jede
 *    Prüfung ein Befund.
 *  - DER STORNO STEHT IN SEINEM EIGENEN ZEITRAUM (Prüflauf 25.09.2026,
 *    P2-14). Die Rechnung bleibt mit ihrem Betrag in ihrem Monat stehen; der
 *    Storno kommt als eigene Gegenzeile mit negativem Betrag in den Monat, in
 *    dem storniert wurde. Vorher fiel die Rechnung beim nächsten Export des
 *    Ursprungsmonats aus der Summe — eines Monats, dessen Umsatzsteuer längst
 *    gemeldet war.
 *  - DIE LÜCKENPRÜFUNG läuft mit und meldet fehlende Nummern, statt sie
 *    stillschweigend zu übergehen.
 *  - DIE UID-NUMMER kommt aus den Kundenstammdaten. Für Rechnungen an
 *    Unternehmen im EU-Ausland ist sie Pflichtangabe — vor den
 *    Kundenstammdaten gab es sie im System schlicht nicht.
 */

function num(n: number | undefined): string {
  return (n ?? 0).toFixed(2).replace('.', ',');
}

function prozent(anteil: number | undefined): string {
  return ((anteil ?? 0) * 100).toFixed(2).replace('.', ',');
}

function fmtDate(iso: string | undefined): string {
  if (!iso) return '';
  return new Date(`${iso}T00:00:00`).toLocaleDateString('de-AT', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  });
}

/** Aus einem Zeitstempel wird das Datum in ORTSZEIT, nicht in UTC — wie im Buchungsstapel. */
function tagVon(ms: number): string {
  const d = new Date(ms);
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

function cell(value: unknown): string {
  const s = value === null || value === undefined ? '' : String(value);
  return /[";\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

function row(values: unknown[]): string {
  return values.map(cell).join(';');
}

const KOPF = [
  'Rechnungsnummer',
  'Rechnungsdatum',
  /*
    Der Leistungszeitraum gehört auch in das Journal, nicht nur auf den Beleg.
    Er entscheidet über die PERIODE, in die der Umsatz fällt — und das ist
    genau die Frage, die der Steuerberater an dieser Datei stellt. Ein
    Rechnungsdatum vom 2. Jänner über eine Leistung vom Dezember gehört in die
    Dezemberumsatzsteuer.
  */
  'Leistung von',
  'Leistung bis',
  'Fälligkeitsdatum',
  'Kunde',
  'UID-Nummer',
  'Baustelle',
  'Netto',
  'USt-Satz %',
  'USt-Betrag',
  /*
    Reverse Charge gehört als EIGENE Spalte ins Journal, nicht als Null im
    Steuersatz. Beides ergibt 0,00 € und bedeutet etwas anderes: „0 %" ist ein
    Steuersatz, der Übergang der Steuerschuld ist ein anderer Umsatz, den der
    Steuerberater getrennt erklären muss (Kennzahl 021 der UVA). Wer die
    beiden Fälle über eine Null zusammenlegt, kann sie im Nachhinein nicht
    mehr trennen.
  */
  'Reverse Charge',
  'Brutto',
  'Zahlungsstatus',
  /*
    DER ZAHLUNGSSTAND GEHÖRT INS JOURNAL, nicht nur in die App.

    Die Kanzlei führt die offenen Posten mit — das ist der halbe Grund, aus
    dem sie diese Datei bekommt. Ohne diese beiden Spalten steht dort zu jeder
    Rechnung der volle Betrag als Forderung, auch wenn die Hälfte längst da
    ist, und der Abgleich mit dem Bankkonto beginnt wieder beim Abtippen.

    ZWEI SPALTEN UND NICHT EINE: „bezahlt" und „offen" sind zwei Aussagen. Aus
    einer liesse sich die andere zwar rechnen, aber nur, wenn man weiss, ob
    storniert wurde — und bei einer stornierten Rechnung mit Zahlung ist der
    offene Rest null UND der bezahlte Betrag positiv. Genau dieser Fall ist
    es, den ein Steuerberater sehen muss: dort liegt ein Guthaben.
  */
  'Bezahlt',
  'Offener Rest',
  'Storniert',
  'Stornogrund',
  /*
    DIE RECHNUNGSART STEHT AM ENDE, und das ist Absicht: eine Kanzlei ordnet
    die Spalten dieser Datei einmal beim Einrichten ihren Feldern zu. Eine
    neue Spalte in der Mitte verschiebt jede Zuordnung danach — ein Fehler,
    der beim ersten Import nach dem nächsten Deploy aufschlägt und wie ein
    Zahlendreher aussieht.

    Gebraucht wird sie, weil die Beträge allein nicht sagen, WAS der Beleg
    ist. „Netto" einer Schlussrechnung ist das Restentgelt nach Abzug der
    Anzahlungen — steuerlich richtig, aber nur erklärbar, wenn danebensteht,
    dass abgezogen wurde.
  */
  'Rechnungsart',
];

export interface RechnungsExport {
  csv: string;
  anzahl: number;
  summeNetto: number;
  summeBrutto: number;
  /** Fehlende Nummern im Kreis — leer ist gut. */
  luecken: string[];
  /** Storni dieses Zeitraums als Gegenzeile — auch von Rechnungen aus früheren. */
  gegenbuchungen: number;
}

/**
 * Baut das Journal für einen Zeitraum.
 *
 * Sortiert nach Rechnungsnummer, nicht nach Datum: der Steuerberater prüft
 * den Nummernkreis, und der ist die eigentliche Ordnung eines
 * Rechnungsausgangsbuchs.
 */
export function buildInvoiceCsv(
  invoices: Invoice[],
  kunden: Customer[],
  von: string,
  bis: string,
): RechnungsExport {
  const imZeitraum = invoices
    .filter((i) => i.invoiceDate >= von && i.invoiceDate <= bis)
    .sort((a, b) => a.invoiceNumber.localeCompare(b.invoiceNumber, 'de'));
  /*
    DIE STORNI DIESES ZEITRAUMS — nach dem Tag des Stornos, gleich wann die
    Rechnung geschrieben wurde. Ohne Stornodatum (Altbestand) weiss niemand,
    in welchen Zeitraum er gehört; eine solche Rechnung zählt wie bisher gar
    nicht in die Summe.
  */
  const storniertIm = (i: Invoice) => {
    if (i.paymentStatus !== 'Storniert' || i.cancelledAt == null) return false;
    const tag = tagVon(i.cancelledAt);
    return tag >= von && tag <= bis;
  };
  const eintraege = [
    ...imZeitraum.map((i) => ({ i, storno: false })),
    ...invoices.filter(storniertIm).map((i) => ({ i, storno: true })),
  ].sort(
    (a, b) =>
      a.i.invoiceNumber.localeCompare(b.i.invoiceNumber, 'de') || Number(a.storno) - Number(b.storno),
  );

  // Die UID hängt am Kunden, die Rechnung trägt nur seinen Namen. Der
  // Abgleich läuft deshalb über den Namen — bei verknüpften Baustellen ist er
  // aus den Stammdaten kopiert und damit verlässlich gleich geschrieben.
  const uidNachName = new Map(
    kunden.filter((k) => k.vatId?.trim()).map((k) => [k.name.trim().toLowerCase(), k.vatId!.trim()]),
  );

  const zeilen = [row(KOPF)];
  let summeNetto = 0;
  let summeBrutto = 0;

  for (const { i, storno } of eintraege) {
    const storniert = i.paymentStatus === 'Storniert';
    const uid =
      i.customerVatId?.trim() || uidNachName.get(i.customerName.trim().toLowerCase()) || '';
    if (storno) {
      /*
        DIE GEGENZEILE: dieselbe Rechnung mit negativem Betrag, datiert auf
        den Tag des Stornos. Zahlungsstand und offener Rest gehören zur
        Rechnung, nicht zum Storno, und bleiben hier leer.
      */
      zeilen.push(
        row([
          i.invoiceNumber,
          fmtDate(tagVon(i.cancelledAt!)),
          i.leistungVon ? fmtDate(i.leistungVon) : '',
          i.leistungBis ? fmtDate(i.leistungBis) : '',
          '',
          i.customerName,
          uid,
          i.projectNumber,
          num(-(i.totalNetto ?? 0)),
          prozent(i.vatRate),
          num(-(i.totalVat ?? 0)),
          i.reverseCharge ? 'ja' : 'nein',
          num(-(i.totalBrutto ?? 0)),
          'Storniert',
          '',
          '',
          'Gegenbuchung',
          i.cancellationNote ?? '',
          i.art ?? 'einzel',
        ]),
      );
      summeNetto -= i.totalNetto ?? 0;
      summeBrutto -= i.totalBrutto ?? 0;
      continue;
    }
    zeilen.push(
      row([
        i.invoiceNumber,
        fmtDate(i.invoiceDate),
        i.leistungVon ? fmtDate(i.leistungVon) : '',
        i.leistungBis ? fmtDate(i.leistungBis) : '',
        fmtDate(i.dueDate),
        i.customerName,
        // Die auf der RECHNUNG festgehaltene UID hat Vorrang: sie stand auf
        // dem Beleg, den der Kunde bekommen hat. Die Stammdaten koennen sich
        // seither geaendert haben.
        uid,
        i.projectNumber,
        num(i.totalNetto),
        prozent(i.vatRate),
        num(i.totalVat),
        i.reverseCharge ? 'ja' : 'nein',
        num(i.totalBrutto),
        i.paymentStatus,
        num(zahlstand(i).bezahlt),
        num(zahlstand(i).rest),
        storniert ? 'ja' : 'nein',
        i.cancellationNote ?? '',
        // Altbestand trägt keine Art — er ist durchwegs eine Einzelrechnung.
        i.art ?? 'einzel',
      ]),
    );
    /**
     * Die Rechnung zählt in IHREM Zeitraum, auch wenn sie später storniert
     * wurde — der Storno zieht sie in seinem Zeitraum wieder ab. So ändert
     * ein späterer Storno die Summe eines schon gemeldeten Monats nicht.
     * Nur ein Storno ohne Datum (Altbestand) nimmt sie wie bisher gleich
     * heraus: für ihn gibt es keinen anderen Zeitraum.
     */
    if (!storniert || i.cancelledAt != null) {
      summeNetto += i.totalNetto ?? 0;
      summeBrutto += i.totalBrutto ?? 0;
    }
  }

  /*
    Summenzeile, damit sich der Export gegen die Voranmeldung abgleichen lässt.

    DIE SUMMEN STEHEN UNTER IHREN SPALTEN, und das war bis zum 19.09.2026
    nicht so: die Nettosumme sass unter „UID-Nummer", die Bruttosumme unter
    „USt-Satz %". Wer die Datei in einer Tabellenkalkulation öffnet und die
    Spalte markiert, bekommt damit eine Summe, die nicht zu ihr gehört.
    Aufgefallen ist es beim Einfügen zweier neuer Spalten — die Zeile wurde
    von Hand mit leeren Feldern aufgefüllt, und eine solche Zählung stimmt
    genau bis zur nächsten Änderung.

    Deshalb jetzt über die Kopfzeile ausgerichtet: die Position kommt aus dem
    Namen, nicht aus abgezählten Strichen.
  */
  const summenzeile = KOPF.map((spalte) => {
    if (spalte === 'Rechnungsnummer') return 'Summe (Storni als Gegenbuchung im Stornozeitraum)';
    if (spalte === 'Netto') return num(summeNetto);
    if (spalte === 'Brutto') return num(summeBrutto);
    return '';
  });
  zeilen.push(row([]));
  zeilen.push(row(summenzeile));

  return {
    csv: zeilen.join('\n'),
    anzahl: imZeitraum.length,
    summeNetto: Math.round(summeNetto * 100) / 100,
    summeBrutto: Math.round(summeBrutto * 100) / 100,
    luecken: findeLuecken(imZeitraum),
    gegenbuchungen: eintraege.filter((e) => e.storno).length,
  };
}

/**
 * Fehlende Nummern im Kreis.
 *
 * Ein lückenhafter Nummernkreis ist bei jeder Prüfung ein Befund — entweder
 * fehlt eine Rechnung, oder sie wurde gelöscht statt storniert. Beides gehört
 * geklärt, BEVOR der Export in die Kanzlei geht. Die Prüfung läuft nur
 * innerhalb eines Jahres, weil der Kreis jährlich neu beginnt.
 */
export function findeLuecken(invoices: Invoice[]): string[] {
  /*
    VORSATZ UND JAHR AUS DER NUMMER SELBST. Hier stand „RE-" fest und das
    Jahr als zweites Stück zwischen Bindestrichen — bei einem Betrieb ohne
    Vorsatz („2026-1001") wäre das die laufende Nummer gewesen.
  */
  const nachJahr = new Map<string, { vorsatz: string; nummern: number[] }>();
  for (const i of invoices) {
    const m = /^(.*?)(\d{4})-(\d+)$/.exec(i.invoiceNumber.trim());
    if (!m) continue;
    const eintrag = nachJahr.get(m[2]) ?? { vorsatz: m[1], nummern: [] };
    eintrag.nummern.push(Number(m[3]));
    nachJahr.set(m[2], eintrag);
  }

  const fehlend: string[] = [];
  for (const [jahr, { vorsatz, nummern }] of nachJahr) {
    const sortiert = [...new Set(nummern)].sort((a, b) => a - b);
    const da = new Set(sortiert);
    const name = (n: number) => `${vorsatz}${jahr}-${String(n).padStart(4, '0')}`;
    /*
      ALS BEREICH, NICHT ALS LISTE (Launch-Check, M15): 498 Nummern einzeln
      aufgezählt sind keine Auskunft mehr, „RE-2026-1002 bis RE-2026-1499"
      schon. Ab drei fehlenden am Stück wird zusammengefasst.
    */
    let n = sortiert[0];
    while (n < sortiert[sortiert.length - 1]) {
      if (da.has(n)) {
        n += 1;
        continue;
      }
      let bis = n;
      while (!da.has(bis + 1) && bis + 1 < sortiert[sortiert.length - 1]) bis += 1;
      if (bis - n >= 2) fehlend.push(`${name(n)} bis ${name(bis)} (${bis - n + 1} Nummern)`);
      else for (let k = n; k <= bis; k++) fehlend.push(name(k));
      n = bis + 1;
    }
  }
  return fehlend;
}

export function invoiceCsvFilename(von: string, bis: string): string {
  return `Rechnungsausgangsbuch_${von}_bis_${bis}.csv`;
}
