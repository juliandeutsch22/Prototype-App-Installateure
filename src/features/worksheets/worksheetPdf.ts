import type { Company, WorkSheet } from '@/types';
import { fmtMin } from '@/lib/time';
import { firmenZeilen, logoZeichnen } from '@/lib/pdfBriefkopf';
import { GRAU, ROT, TABELLENSTIL, TINTE, fmtMenge } from '@/lib/belegLayout';
import { datumAT } from '@/lib/datum';

/*
  DER SCHEIN GEHT AN DEN KUNDEN — also dieselben Tabellen wie Rechnung und
  Angebot: keine Flächenfarbe, feine Linien. Hier stand ein Kopfbalken in
  #1e293b, dem Schiefergrau einer fremden Bibliothek (Prüflauf 24.09.2026,
  C2). Nur Stil und Schrift kommen aus dem Belegschema; die Ränder des
  Scheins bleiben seine eigenen.
*/
/*
  WO DIE SEITE DEM FUSS GEHÖRT (Prüflauf 25.09.2026, P1-12). Der Fuss mit
  Prüfsumme steht ab 285 mm; bis hierher darf der Inhalt laufen. Vorher gab
  es keinen Seitenumbruch: bei einem langen Schein lagen Unterschriften und
  Anmerkungen über der Prüfsumme oder liefen aus dem Blatt.
*/
const SEITE_ENDE = 278;
/** Wo es auf einer Folgeseite weitergeht. */
const SEITE_OBEN = 20;

const SCHEIN_TABELLE = {
  theme: TABELLENSTIL.theme,
  styles: TABELLENSTIL.styles,
  headStyles: TABELLENSTIL.headStyles,
  bodyStyles: TABELLENSTIL.bodyStyles,
  // Nur oben und unten: eine lange Tabelle bricht vor dem Fuss um und setzt
  // auf der Folgeseite dort an, wo auch der übrige Inhalt beginnt.
  margin: { top: SEITE_OBEN, bottom: 297 - SEITE_ENDE },
};

/**
 * Handwerksschein als PDF.
 *
 * BEWUSST KEIN PDF/A. Echtes PDF/A verlangt eingebettete Schriften,
 * XMP-Metadaten und einen OutputIntent — mit jsPDF im Browser nicht seriös
 * herstellbar. Ein normales PDF „PDF/A" zu nennen wäre eine Behauptung, die
 * einer Prüfung nicht standhält.
 *
 * Was den Beleg tatsächlich schützt, steht ohnehin woanders: der
 * serverseitige Hash über den eingefrorenen Inhalt. Er beweist, dass ein
 * vorgelegtes Dokument genau das ist, was unterschrieben wurde. Deshalb steht
 * er auch im Fußbereich des PDFs.
 *
 * jsPDF wird dynamisch geladen — die Bibliothek ist groß und wird auf der
 * Baustelle nur gebraucht, wenn wirklich jemand einen Schein ausgibt.
 */
/** Was der Schein vom Betrieb braucht — Name, Anschrift, Kontakt, Logo. */
export type Betrieb = Pick<Company, 'name' | 'addressLine' | 'contactLine' | 'logoUrl'>;

export async function buildWorkSheetPdf(schein: WorkSheet, betrieb: Betrieb): Promise<Blob> {
  const [{ default: jsPDF }, { default: autoTable }] = await Promise.all([
    import('jspdf'),
    import('jspdf-autotable'),
  ]);

  const doc = new jsPDF({ unit: 'mm', format: 'a4' });
  const rand = 15;
  let y = rand;

  /** Reicht der Platz bis zum Fuss nicht, geht es auf einer neuen Seite weiter. */
  const platz = (hoehe: number) => {
    if (y + hoehe <= SEITE_ENDE) return;
    doc.addPage();
    y = SEITE_OBEN;
  };

  /*
    DER BELEG SAGT JETZT, VON WEM ER IST.

    Bis hierher stand rechts oben allein der Firmenname — kein Logo, keine
    Anschrift, keine Kontaktangabe. Auf einem Beleg, den der Kunde
    unterschreibt und behält, ist das die auffälligste Lücke von allen: er
    kann daraus nicht ersehen, an wen er sich wenden muss.

    Der Titel und der Name bleiben, wo sie waren; Logo und Zeilen kommen
    darunter dazu. Ohne beides sieht der Schein aus wie bisher.
  */
  const logoH = logoZeichnen(doc, betrieb, 195, y - 5);
  doc.setFontSize(16).setFont('helvetica', 'bold');
  doc.text('Handwerksschein', rand, y);
  doc.setFontSize(10).setFont('helvetica', 'normal');
  doc.text(betrieb.name || 'Installateur', 195, y + logoH, { align: 'right' });

  const zeilen = firmenZeilen(betrieb);
  doc.setFontSize(8).setTextColor(...GRAU);
  zeilen.forEach((z, i) => doc.text(z, 195, y + logoH + 5 + i * 4, { align: 'right' }));
  doc.setFontSize(10).setTextColor(...TINTE);

  y += 10 + logoH + zeilen.length * 4;

  /*
    Der verworfene Entwurf traegt es im PDF, nicht nur in der Liste.

    Aus dem Haus gehen soll er nicht — aber er KANN: das PDF laesst sich
    ausdrucken, ehe jemand ihn verwirft, und ein Blatt ohne Kennzeichnung
    sieht aus wie ein gueltiger Beleg. Deshalb steht es auf dem Papier.
  */
  /*
    AUCH DER GEWÖHNLICHE ENTWURF trägt es (Prüflauf 25.09.2026, P1-13). Sein
    PDF lässt sich aus der Liste ausgeben, und ohne Vermerk — dazu mit dem
    Fusssatz „Elektronisch unterschrieben" — sah es aus wie ein gültiger
    Beleg, obwohl niemand unterschrieben hat.
  */
  if (schein.status === 'Entwurf') {
    doc.setTextColor(...ROT).setFont('helvetica', 'bold');
    doc.text('ENTWURF — kein gültiger Beleg, noch nicht unterschrieben', rand, y);
    doc.setTextColor(...TINTE).setFont('helvetica', 'normal');
    y += 8;
  }

  if (schein.status === 'Verworfen') {
    doc.setTextColor(...GRAU).setFont('helvetica', 'bold');
    doc.text('VERWORFENER ENTWURF — kein gültiger Beleg', rand, y);
    doc.setTextColor(...TINTE).setFont('helvetica', 'normal');
    y += 8;
  }

  if (schein.status === 'Storniert') {
    doc.setTextColor(...ROT).setFont('helvetica', 'bold');
    doc.text(`STORNIERT — ${schein.stornoGrund ?? 'ohne Angabe'}`, rand, y);
    doc.setTextColor(...TINTE).setFont('helvetica', 'normal');
    y += 8;
  }

  const kopf: [string, string][] = [
    ['Kunde', schein.customerName],
    ['Baustelle', `${schein.projectNumber}${schein.address ? ` · ${schein.address}` : ''}`],
    ['Leistungsdatum', datumAT(schein.datum)],
    ['Abrechnung', schein.abrechnung],
  ];
  for (const [k, v] of kopf) {
    doc.setFont('helvetica', 'bold').text(`${k}:`, rand, y);
    doc.setFont('helvetica', 'normal').text(v, rand + 35, y);
    y += 6;
  }
  y += 4;

  if (schein.zeiten.length > 0) {
    autoTable(doc, {
      startY: y,
      head: [['Mitarbeiter', 'Von', 'Bis', 'Pause', 'Stunden', 'Tätigkeit']],
      body: schein.zeiten.map((z) => [
        z.mitarbeiter + (z.helfer ? ' (Helfer)' : ''),
        z.von ?? '—',
        z.bis ?? '—',
        z.pauseMin ? `${z.pauseMin} min` : '—',
        fmtMin(z.minuten),
        z.taetigkeit ?? '',
      ]),
      ...SCHEIN_TABELLE,
    });
    // @ts-expect-error — autotable haengt lastAutoTable ans Dokument
    y = (doc.lastAutoTable?.finalY ?? y) + 6;

    const gesamt = schein.zeiten.reduce((s, z) => s + z.minuten, 0);
    platz(8);
    doc.setFont('helvetica', 'bold');
    doc.text(`Summe: ${fmtMin(gesamt)}`, 195, y, { align: 'right' });
    doc.setFont('helvetica', 'normal');
    y += 8;
  }

  if (schein.material.length > 0) {
    autoTable(doc, {
      startY: y,
      head: [['Material', 'Menge']],
      // Deutsch geschrieben: „2,5 m", nicht „2.5 m" (Prüflauf 25.09.2026, P1-12).
      body: schein.material.map((m) => [
        m.name,
        `${fmtMenge(m.menge)}${m.einheit ? ` ${m.einheit}` : ''}`,
      ]),
      ...SCHEIN_TABELLE,
    });
    // @ts-expect-error — siehe oben
    y = (doc.lastAutoTable?.finalY ?? y) + 6;
  }

  if (schein.notizen) {
    // Die Überschrift nicht allein unten auf der Seite stehen lassen.
    platz(10);
    doc.setFont('helvetica', 'bold').text('Anmerkungen:', rand, y);
    y += 5;
    doc.setFont('helvetica', 'normal');
    for (const zeile of doc.splitTextToSize(schein.notizen, 180)) {
      platz(5);
      doc.text(zeile, rand, y);
      y += 5;
    }
    y += 4;
  }

  // Unterschriften nebeneinander, mit Name und Zeitpunkt darunter.
  const u = schein.unterschriften;
  if (u?.monteur || u?.kunde) {
    // Wie bisher unten auf der Seite — passt der Block dort nicht mehr hin,
    // steht er geschlossen auf einer neuen, statt über dem Fuss.
    platz(40);
    y = Math.max(y, 200);
    const spalten: [typeof u.monteur, string, number][] = [
      [u?.monteur, 'Monteur', rand],
      [u?.kunde, 'Kunde', 110],
    ];
    for (const [sig, rolle, x] of spalten) {
      if (!sig) continue;
      try {
        doc.addImage(sig.bild, 'PNG', x, y, 70, 25);
      } catch {
        // Ein defektes Bild darf das PDF nicht verhindern — der Name und der
        // Zeitpunkt tragen die Aussage ohnehin mit.
      }
      doc.line(x, y + 27, x + 70, y + 27);
      doc.setFontSize(9);
      doc.text(`${rolle}: ${sig.name}`, x, y + 32);
      doc.text(new Date(sig.geraetZeit).toLocaleString('de-AT'), x, y + 37);
      doc.setFontSize(10);
    }
    y += 45;
  }

  /*
    FOTOS WERDEN GENANNT, NICHT EINGEBETTET.

    Eingebettet würde das PDF um ein bis zwei Megabyte je Bild wachsen — und
    erzeugt wird es auf dem Gerät des Monteurs, meist auf einer Baustelle, um
    dort geteilt zu werden. Ein Beleg, der sich nicht verschicken lässt, ist
    kein Beleg.

    Der Nachweis leidet nicht darunter: die Prüfsumme des Scheins deckt die
    Fotoliste samt Inhalts-Hashes mit ab, und der Betrieb sieht die Bilder in
    der Scheinliste. Wer eines vorlegen muss, holt es dort — mit dem Hash
    daneben, der belegt, dass es dasselbe ist.
  */
  if (schein.fotos?.length) {
    platz(8);
    doc.setFontSize(9).setTextColor(...GRAU);
    doc.text(
      `${schein.fotos.length} ${schein.fotos.length === 1 ? 'Foto' : 'Fotos'} zu diesem Schein — ` +
        'beim Betrieb hinterlegt, von der Prüfsumme mit erfasst.',
      rand,
      y,
    );
    y += 8;
  }

  /*
    DER FUSS AUF JEDER SEITE (Prüflauf 25.09.2026, P1-12) — die Prüfsumme
    gehört zu jedem Blatt, das jemand vorlegt, nicht nur zum letzten.

    „Elektronisch unterschrieben" nur, wo unterschrieben wurde (P1-13): beim
    unterschriebenen und beim später stornierten Schein. Ein Entwurf oder ein
    verworfener Entwurf trägt stattdessen seinen Vermerk.
  */
  const unterschrieben = schein.status === 'Unterschrieben' || schein.status === 'Storniert';
  const fuss = schein.inhaltHash
    ? `Prüfsumme (SHA-256): ${schein.inhaltHash}`
    : unterschrieben
      ? 'Prüfsumme wird nach der Übertragung ergänzt.'
      : 'Noch nicht unterschrieben — ohne Prüfsumme.';
  const satz = unterschrieben
    ? 'Elektronisch unterschrieben. Nachträgliche Änderungen sind ausgeschlossen; Korrekturen erfolgen über einen Stornoschein.'
    : schein.status === 'Verworfen'
      ? 'VERWORFENER ENTWURF — kein gültiger Beleg.'
      : 'ENTWURF — kein gültiger Beleg, noch nicht unterschrieben.';
  const seiten = doc.getNumberOfPages();
  for (let i = 1; i <= seiten; i++) {
    doc.setPage(i);
    doc.setFontSize(7).setTextColor(...GRAU);
    doc.text(fuss, rand, 285);
    doc.text(satz, rand, 289);
    if (seiten > 1) doc.text(`Seite ${i} von ${seiten}`, 195, 293, { align: 'right' });
  }

  return doc.output('blob');
}

/**
 * PDF weitergeben — teilen, wo möglich, sonst herunterladen.
 *
 * Auf dem Tablet vor Ort ist Teilen der richtige Weg: der Kunde bekommt den
 * Schein sofort per Mail oder Messenger, ohne dass eine Adresse im System
 * hinterlegt sein muss. Genau daran scheitert ein automatischer Versand in
 * der Praxis — die Adresse hat vor Ort niemand zur Hand.
 */
export async function shareOrDownloadPdf(blob: Blob, dateiname: string): Promise<'geteilt' | 'geladen'> {
  const datei = new File([blob], dateiname, { type: 'application/pdf' });
  const nav = navigator as Navigator & { canShare?: (d: { files: File[] }) => boolean };
  if (nav.share && nav.canShare?.({ files: [datei] })) {
    try {
      await nav.share({ files: [datei], title: dateiname });
      return 'geteilt';
    } catch {
      // Abbruch durch den Nutzer oder kein Ziel — dann herunterladen.
    }
  }
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = dateiname;
  a.click();
  URL.revokeObjectURL(url);
  return 'geladen';
}
