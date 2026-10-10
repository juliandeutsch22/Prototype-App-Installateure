import {
  briefkopf,
  empfaenger,
  fusszeilen,
  GRAU,
  kopfdaten,
  RAND,
  RECHTS,
  TABELLE_AB,
  TINTE,
  titel,
} from '@/lib/belegLayout';
import { ibanAnzeige } from '@shared/iban';
import { TEXTE, mahnkosten, type Mahnstufe, type Verzugszinsen } from './mahnung';
import { mahnbar, ruecklassFaelligAm, zahlstand } from './zahlstand';
import type { Company, Invoice, MahnungInhalt } from '@/types';
import { euroBetrag } from '@/lib/betrag';

/**
 * Die Mahnung als Beleg.
 *
 * WARUM EIN EIGENES DOKUMENT und nicht ein Vermerk auf der Rechnung: die
 * Rechnung ist bereits beim Kunden. Ein zweites Blatt mit derselben Nummer,
 * aber anderem Inhalt wäre ein Widerspruch in seinen Unterlagen — und der
 * Beleg, den sein Steuerberater bucht, soll genau einer sein.
 *
 * DIE MAHNUNG NENNT DIE RECHNUNG, ersetzt sie aber nicht: Nummer, Datum,
 * ursprüngliches Zahlungsziel und Betrag stehen darauf, damit der Kunde ohne
 * Suchen weiss, worum es geht.
 *
 * KEINE UMSATZSTEUER. Eine Mahnung ist keine Leistung; sie fordert nur, was
 * die Rechnung bereits ausgewiesen hat. Auch Mahnspesen und Verzugszinsen
 * sind kein Entgelt für eine Leistung, sondern Schadenersatz — sie tragen
 * deshalb keine Steuer.
 * Stünde hier eine, schuldete der Betrieb sie kraft Rechnungslegung.
 *
 * jsPDF wird dynamisch geladen — wie beim Handwerksschein: die Bibliothek
 * wiegt mehrere hundert Kilobyte und gehört nicht in das Paket, das jeder
 * Monteur beim Anmelden zieht.
 */

function fmtDatum(iso?: string): string {
  if (!iso || !/^\d{4}-\d{2}-\d{2}$/.test(iso)) return iso ?? '–';
  return new Date(`${iso}T00:00:00`).toLocaleDateString('de-AT', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  });
}

export interface MahnungOptionen {
  company: Company;
  invoice: Invoice;
  stufe: Mahnstufe;
  /** Der Tag, an dem gemahnt wird. */
  datum: string;
  /** Die neue Frist. */
  frist: string;
  /** Anschrift des Kunden, wie sie auf der Rechnung stand. */
  adresse?: string;
  /** UID des Kunden, falls bekannt. */
  kundenUid?: string;
  /**
   * Die Verzugszinsen, wie sie der Dialog vorher angezeigt hat — gerechnet
   * von `verzugszinsen`, nicht hier, damit Dialog und Beleg dieselbe Zahl
   * tragen.
   */
  zinsen?: Verzugszinsen;
  /** Firmenkunde (mit UID)? Bestimmt, welche Mahnkosten gelten — siehe `mahnkosten`. */
  unternehmer?: boolean;
}

/**
 * Was auf der Mahnung steht — gerechnet EINMAL, beim Erzeugen.
 *
 * WARUM GETRENNT VOM DRUCK (seit 10.10.2026): der Inhalt wird mit der
 * Mahnung gespeichert (`mahnungen.inhalt`). Archiv und erneutes Laden
 * drucken daraus genau das Schreiben, das hinausging. Aus dem Rechnungsstand
 * neu gerechnet stünden dort Zinsen, Kosten und Zahlungen von heute.
 */
export function mahnungInhalt(o: MahnungOptionen): MahnungInhalt {
  const text = TEXTE[o.stufe];

  /*
    DIE ZAHLEN ALS BLOCK, nicht im Fliesstext.

    Wer eine Mahnung bekommt, sucht drei Dinge: worum es geht, wie viel und
    bis wann. Im Satz versteckt muss er sie zusammenklauben; als Block stehen
    sie da.
  */
  const { spesen, pauschale } = mahnkosten(o.stufe, o.company.rates, !!o.unternehmer);
  const stand = zahlstand(o.invoice);
  const zeilen: [string, string][] = [
    ['Rechnungsdatum', fmtDatum(o.invoice.invoiceDate)],
    ['Ursprüngliches Zahlungsziel', fmtDatum(o.invoice.dueDate)],
    ['Rechnungsbetrag', `${euroBetrag(o.invoice.totalBrutto)} €`],
  ];
  /*
    TEILZAHLUNGEN GEHÖREN AUF DIE MAHNUNG, und zwar als eigene Zeile.

    Der Kunde, der 400 von 1.000 € überwiesen hat, prüft als Erstes, ob der
    Betrieb seine Zahlung überhaupt bemerkt hat. Stünde nur der Restbetrag da,
    sähe die Mahnung aus wie eine über eine andere, kleinere Rechnung; stünde
    nur das Brutto da, wäre sie schlicht falsch. Beides zusammen mit dem
    Abzug dazwischen ist die einzige Fassung, die er nachrechnen kann.
  */
  if (stand.bezahlt > 0) {
    // Ein ASCII-Minus: das typografische „−" fehlt in der Standardschrift des
    // PDFs, und jsPDF schrieb die ganze Zeile dann als Zeichensalat.
    zeilen.push(['Bereits bezahlt', `- ${euroBetrag(stand.bezahlt)} €`]);
  }
  /*
    DER RÜCKLASS, SOLANGE ER NICHT FÄLLIG IST (seit 05.10.2026): er steht
    da, wird aber nicht gefordert. Ohne die Zeile ginge die Rechnung des
    Kunden nicht auf — er hat ihn ja zu Recht einbehalten.
  */
  const gefordert = mahnbar(o.invoice, o.datum).rest;
  const nichtFaellig = Math.round((stand.rest - gefordert) * 100) / 100;
  if (nichtFaellig > 0) {
    zeilen.push([
      `${o.invoice.ruecklassArt === 'deckung' ? 'Deckungsrücklass' : 'Haftrücklass'}, fällig am ${fmtDatum(ruecklassFaelligAm(o.invoice))}`,
      `- ${euroBetrag(nichtFaellig)} €`,
    ]);
  }
  if (spesen > 0) zeilen.push(['Mahnspesen', `${euroBetrag(spesen)} €`]);
  if (pauschale > 0) zeilen.push(['Pauschale für Betreibungskosten (§ 458 UGB)', `${euroBetrag(pauschale)} €`]);
  const zinsen = o.zinsen?.art === 'berechnet' ? o.zinsen : null;
  if (zinsen && zinsen.abschnitte) {
    /*
      ÜBER MEHRERE HALBJAHRE (Testbericht 30.09.2026, G30): eine Zeile mit
      Tagen und Betrag, darunter je Halbjahr Satz und Zeitraum — sonst ist
      die Zahl nicht nachzurechnen, und in eine Zeile passt es nicht.
    */
    zeilen.push([
      `Verzugszinsen, ${zinsen.tage} Tage${zinsen.ab ? ` ab ${fmtDatum(zinsen.ab)}` : ''} (${zinsen.grundlage})`,
      `${euroBetrag(zinsen.betrag)} €`,
    ]);
    for (const a of zinsen.abschnitte) {
      zeilen.push([
        `    ${a.satz.toLocaleString('de-AT', { maximumFractionDigits: 2 })} % p. a. vom ${fmtDatum(a.von)} bis ${fmtDatum(a.bis)}, ${a.tage} Tage`,
        '',
      ]);
    }
  } else if (zinsen) {
    // Satz, Tage und Grundlage stehen dabei: sonst ist die Zahl nicht nachzurechnen.
    zeilen.push([
      `Verzugszinsen ${zinsen.satz.toLocaleString('de-AT', { maximumFractionDigits: 2 })} % p. a., ${zinsen.tage} Tage` +
        `${zinsen.ab ? ` ab ${fmtDatum(zinsen.ab)}` : ''} (${zinsen.grundlage})`,
      `${euroBetrag(zinsen.betrag)} €`,
    ]);
  }

  return {
    stufe: o.stufe,
    datum: o.datum,
    frist: o.frist,
    titel: text.titel,
    anrede: text.anrede,
    fristSatz: text.frist(fmtDatum(o.frist)),
    empfaenger: {
      name: o.invoice.customerName,
      ...(o.adresse ? { adresse: o.adresse } : {}),
      ...(o.kundenUid ? { uid: o.kundenUid } : {}),
    },
    rechnung: { nummer: o.invoice.invoiceNumber, baustelle: o.invoice.projectNumber },
    zeilen,
    offen: Math.round((gefordert + spesen + pauschale + (zinsen?.betrag ?? 0)) * 100) / 100,
    kosten: Math.round((spesen + pauschale) * 100) / 100,
  };
}

/**
 * Ob ein gespeicherter Inhalt sich drucken lässt — er kommt aus der
 * Datenbank, und ein halber Inhalt ergäbe ein halbes Schreiben.
 */
export function istMahnungInhalt(x: unknown): x is MahnungInhalt {
  const i = x as Partial<MahnungInhalt> | null;
  return !!i && typeof i === 'object'
    && (i.stufe === 1 || i.stufe === 2 || i.stufe === 3)
    && typeof i.datum === 'string' && typeof i.frist === 'string'
    && typeof i.titel === 'string' && typeof i.anrede === 'string' && typeof i.fristSatz === 'string'
    && !!i.empfaenger && typeof i.empfaenger.name === 'string'
    && !!i.rechnung && typeof i.rechnung.nummer === 'string'
    && Array.isArray(i.zeilen) && i.zeilen.every((z) => Array.isArray(z) && z.length === 2)
    && typeof i.offen === 'number';
}

/**
 * Das Schreiben aus seinem Inhalt drucken — beim Erzeugen und beim Nachdruck.
 *
 * Briefkopf, Bankverbindung und Fusszeile kommen aus den HEUTIGEN
 * Betriebsdaten, wie beim Nachdruck einer Rechnung (`druckAngaben`).
 */
export async function mahnungPdfAusInhalt(company: Company, i: MahnungInhalt): Promise<Blob> {
  const { default: jsPDF } = await import('jspdf');
  const doc = new jsPDF({ unit: 'mm', format: 'a4' });
  const rand = RAND;
  const rechts = RECHTS;

  // Briefkopf, Empfänger und Kopfdaten — dieselben wie auf der Rechnung.
  briefkopf(doc, company);
  empfaenger(doc, company, { name: i.empfaenger.name, adresse: i.empfaenger.adresse, uid: i.empfaenger.uid });
  kopfdaten(doc, [
    ['Datum', fmtDatum(i.datum)],
    ['Rechnung', i.rechnung.nummer],
    ['Baustelle', i.rechnung.baustelle],
  ]);
  titel(doc, i.titel);

  const breite = rechts - rand;
  /** Text umbrechen, schreiben und die Zeile danach zurückgeben. */
  const absatz = (inhalt: string, y: number, zeilenhoehe = 5): number => {
    const zeilen = doc.splitTextToSize(inhalt, breite) as string[];
    doc.text(zeilen, rand, y);
    return y + zeilen.length * zeilenhoehe;
  };

  let y = TABELLE_AB + 4;
  doc.setFontSize(10).setTextColor(...TINTE);
  doc.text('Sehr geehrte Damen und Herren,', rand, y);
  y = absatz(i.anrede, y + 7) + 5;

  // Beträge rechtsbündig untereinander, damit man sie nachrechnen kann.
  const betragX = rand + 110;
  for (const [k, v] of i.zeilen) {
    doc.setFont('helvetica', 'normal').setTextColor(...GRAU).text(k, rand, y);
    doc.setTextColor(...TINTE).text(v, betragX, y, { align: 'right' });
    y += 6;
  }

  doc.setDrawColor(...TINTE).setLineWidth(0.35).line(rand, y - 3.5, betragX, y - 3.5);
  doc.setFont('helvetica', 'bold');
  doc.text('Offener Betrag', rand, y + 1);
  doc.text(`${euroBetrag(i.offen)} €`, betragX, y + 1, { align: 'right' });
  doc.setFont('helvetica', 'normal');
  y += 12;

  y = absatz(i.fristSatz, y) + 5;

  if (company.iban) {
    y = absatz(
      `Bankverbindung: IBAN ${ibanAnzeige(company.iban)}` +
        (company.bic ? ` / BIC ${company.bic}` : '') +
        (company.bankName ? ` (${company.bankName})` : ''),
      y,
    );
  }
  doc.text(`Verwendungszweck: ${i.rechnung.nummer}`, rand, y);
  y += 12;

  /*
    DER SATZ ZUR ÜBERSCHNEIDUNG gehört auf jede Mahnung.

    Zwischen dem Ausdrucken und dem Eintreffen liegen Tage, und in dieser Zeit
    zahlen die meisten. Ohne diesen Satz bekommt jemand eine Mahnung für etwas,
    das er längst überwiesen hat — und ruft verärgert an.
  */
  doc.setFontSize(9).setTextColor(...GRAU);
  absatz(
    'Sollte sich Ihre Zahlung mit diesem Schreiben überschnitten haben, betrachten Sie es ' +
      'bitte als gegenstandslos.',
    y,
    4.5,
  );
  doc.setTextColor(...TINTE).setFontSize(10);

  // Fusszeile mit Bank und Pflichtangaben — wie auf der Rechnung.
  fusszeilen(doc, company);

  return doc.output('blob');
}

export async function buildMahnungPdf(o: MahnungOptionen): Promise<Blob> {
  return mahnungPdfAusInhalt(o.company, mahnungInhalt(o));
}

/** Ein sprechender Dateiname — nicht „download.pdf" im Ordner des Kunden. */
export function mahnungDateiname(inv: Pick<Invoice, 'invoiceNumber'>, stufe: Mahnstufe): string {
  const wort = stufe === 1 ? 'Zahlungserinnerung' : stufe === 2 ? 'Mahnung' : 'Letzte_Mahnung';
  return `${wort}_${inv.invoiceNumber}.pdf`;
}
