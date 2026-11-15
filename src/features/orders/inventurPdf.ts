import type { Company } from '@/types';
import type { ZaehllisteVoll } from '@/lib/db/inventur';
import {
  briefkopf,
  fusszeilen,
  kopfdaten,
  RAND,
  TABELLE_AB,
  TABELLENSTIL,
  TINTE,
  titel,
} from '@/lib/belegLayout';
import { datumAusMs } from '@/lib/datum';
import { fortschritt, protokollTabelle, zaehllistenTabelle, zaehlzeitText } from './inventur';

/**
 * ZÄHLLISTE UND INVENTURPROTOKOLL ALS PDF (F14), im Layout der Belege.
 *
 * Die ZÄHLLISTE ist für die Zählung auf Papier — vor Arbeitsbeginn, im
 * Fahrzeug ohne Netz, zu zweit am Regal. Die Spalte „Gezählt“ bleibt leer,
 * wo noch nichts eingetragen ist; was schon gezählt ist, steht darin.
 * Die Zahl im System steht absichtlich NICHT darauf: wer sie sieht, zählt
 * leicht die erwartete Zahl ab.
 *
 * Das PROTOKOLL hält eine gebuchte Liste fest: Soll zum Zeitpunkt der
 * Zählung, Gezählt, Abweichung, Bestand danach, Ergebnis und Grund. Es ist
 * die Unterlage für die Buchhaltung; die Bewertung zum Stichtag setzt die
 * Steuerberatung an.
 *
 * jsPDF wird erst beim Erzeugen geladen, wie bei allen Belegen.
 */
export async function buildInventurPdf(o: {
  company: Company;
  liste: ZaehllisteVoll;
  art: 'zaehlliste' | 'protokoll';
}) {
  const [{ default: jsPDF }, { default: autoTable }] = await Promise.all([
    import('jspdf'),
    import('jspdf-autotable'),
  ]);
  const doc = new jsPDF({ unit: 'mm', format: 'a4' });
  briefkopf(doc, o.company);

  const { gezaehlt, gesamt } = fortschritt(o.liste.zeilen);
  const kopf: [string, string][] = [
    ['Ort', o.liste.ortName],
    ['Gezählt', zaehlzeitText(o.liste.stichtag)],
  ];
  if (o.liste.bezeichnung) kopf.unshift(['Liste', o.liste.bezeichnung]);
  if (o.art === 'protokoll' && o.liste.gebuchtAm) {
    kopf.push(['Gebucht', `${datumAusMs(o.liste.gebuchtAm)}${o.liste.gebuchtVonName ? ` von ${o.liste.gebuchtVonName}` : ''}`]);
    if (o.liste.grund) kopf.push(['Grund', o.liste.grund]);
  } else {
    kopf.push(['Stand', `${gezaehlt} von ${gesamt} gezählt`]);
  }
  kopfdaten(doc, kopf);
  titel(doc, o.art === 'protokoll' ? 'Inventurprotokoll' : 'Zählliste');

  doc.setFontSize(10).setTextColor(...TINTE);
  if (o.art === 'zaehlliste') {
    doc.text('Gezählt wird, was am Ort liegt — die Zahl im System steht absichtlich nicht hier.', RAND, TABELLE_AB);
    autoTable(doc, {
      ...TABELLENSTIL,
      startY: TABELLE_AB + 4,
      head: [['Pos.', 'Art.-Nr.', 'Artikel', 'Einheit', 'Gezählt']],
      body: zaehllistenTabelle(o.liste.zeilen),
      columnStyles: {
        0: { cellWidth: 11, halign: 'right' },
        1: { cellWidth: 28 },
        3: { cellWidth: 17 },
        4: { cellWidth: 28, halign: 'right' },
      },
    });
  } else {
    autoTable(doc, {
      ...TABELLENSTIL,
      startY: TABELLE_AB,
      head: [['Art.-Nr.', 'Artikel', 'Einh.', 'Soll', 'Gezählt', 'Abw.', 'Danach', 'Ergebnis']],
      body: protokollTabelle(o.liste.zeilen),
      styles: { ...(TABELLENSTIL.styles ?? {}), fontSize: 8 },
      columnStyles: {
        0: { cellWidth: 22 },
        2: { cellWidth: 11 },
        3: { cellWidth: 14, halign: 'right' },
        4: { cellWidth: 14, halign: 'right' },
        5: { cellWidth: 16, halign: 'right' },
        6: { cellWidth: 14, halign: 'right' },
        7: { cellWidth: 36 },
      },
    });
  }

  fusszeilen(doc, o.company);
  return doc;
}
