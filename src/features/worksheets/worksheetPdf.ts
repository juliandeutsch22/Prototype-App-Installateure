import type { WorkSheet } from '@/types';
import { fmtMin } from '@/lib/time';

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
export async function buildWorkSheetPdf(schein: WorkSheet, betrieb: string): Promise<Blob> {
  const [{ default: jsPDF }, { default: autoTable }] = await Promise.all([
    import('jspdf'),
    import('jspdf-autotable'),
  ]);

  const doc = new jsPDF({ unit: 'mm', format: 'a4' });
  const rand = 15;
  let y = rand;

  doc.setFontSize(16).setFont('helvetica', 'bold');
  doc.text('Handwerksschein', rand, y);
  doc.setFontSize(10).setFont('helvetica', 'normal');
  doc.text(betrieb, 195, y, { align: 'right' });
  y += 10;

  if (schein.status === 'Storniert') {
    doc.setTextColor(180, 30, 30).setFont('helvetica', 'bold');
    doc.text(`STORNIERT — ${schein.stornoGrund ?? 'ohne Angabe'}`, rand, y);
    doc.setTextColor(0, 0, 0).setFont('helvetica', 'normal');
    y += 8;
  }

  const kopf: [string, string][] = [
    ['Kunde', schein.customerName],
    ['Baustelle', `${schein.projectNumber}${schein.address ? ` · ${schein.address}` : ''}`],
    ['Leistungsdatum', schein.datum],
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
      styles: { fontSize: 9 },
      headStyles: { fillColor: [30, 41, 59] },
    });
    // @ts-expect-error — autotable haengt lastAutoTable ans Dokument
    y = (doc.lastAutoTable?.finalY ?? y) + 6;

    const gesamt = schein.zeiten.reduce((s, z) => s + z.minuten, 0);
    doc.setFont('helvetica', 'bold');
    doc.text(`Summe: ${fmtMin(gesamt)}`, 195, y, { align: 'right' });
    doc.setFont('helvetica', 'normal');
    y += 8;
  }

  if (schein.material.length > 0) {
    autoTable(doc, {
      startY: y,
      head: [['Material', 'Menge']],
      body: schein.material.map((m) => [m.name, `${m.menge}${m.einheit ? ` ${m.einheit}` : ''}`]),
      styles: { fontSize: 9 },
      headStyles: { fillColor: [30, 41, 59] },
    });
    // @ts-expect-error — siehe oben
    y = (doc.lastAutoTable?.finalY ?? y) + 6;
  }

  if (schein.notizen) {
    doc.setFont('helvetica', 'bold').text('Anmerkungen:', rand, y);
    y += 5;
    doc.setFont('helvetica', 'normal');
    for (const zeile of doc.splitTextToSize(schein.notizen, 180)) {
      doc.text(zeile, rand, y);
      y += 5;
    }
    y += 4;
  }

  // Unterschriften nebeneinander, mit Name und Zeitpunkt darunter.
  const u = schein.unterschriften;
  if (u?.monteur || u?.kunde) {
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

  doc.setFontSize(7).setTextColor(120, 120, 120);
  const fuss = schein.inhaltHash
    ? `Prüfsumme (SHA-256): ${schein.inhaltHash}`
    : 'Prüfsumme wird nach der Übertragung ergänzt.';
  doc.text(fuss, rand, 285);
  doc.text(
    'Elektronisch unterschrieben. Nachträgliche Änderungen sind ausgeschlossen; Korrekturen erfolgen über einen Stornoschein.',
    rand,
    289,
  );

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
