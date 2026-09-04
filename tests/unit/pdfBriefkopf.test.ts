import { describe, it, expect } from 'vitest';
import { firmenZeilen, istZeichenbar, logoZeichnen } from '@/lib/pdfBriefkopf';
import { einpassen, dataUrlBytes } from '@/lib/logoAufbereiten';

/**
 * Der gemeinsame Briefkopf der drei PDFs.
 *
 * WAS HIER ABGESICHERT WIRD, ist vor allem eine Zusicherung an den
 * BESTAND: ohne hinterlegtes Logo darf sich an keinem Beleg etwas ändern.
 * Die PDFs sind der einzige Teil der App ohne Sichtprüfung im Betrieb —
 * eine verschobene Zeile fiele erst auf, wenn ein Kunde sie in der Hand hält.
 */

/** Ein 1×1-PNG als Data-URL — kleinstmögliches gültiges Bild. */
const PNG =
  'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';

describe('Firmenzeilen', () => {
  it('lässt leere Felder ganz weg', () => {
    // Eine Lücke im Briefkopf sieht aus wie ein Fehler im Programm, nicht
    // wie ein nicht gepflegtes Feld.
    expect(firmenZeilen({ addressLine: 'Musterstraße 1', contactLine: '' })).toEqual([
      'Musterstraße 1',
    ]);
    expect(firmenZeilen({ addressLine: '   ', contactLine: undefined })).toEqual([]);
  });

  it('behält die Reihenfolge Anschrift, dann Kontakt', () => {
    expect(firmenZeilen({ addressLine: 'A', contactLine: 'K' })).toEqual(['A', 'K']);
  });
});

describe('Was gezeichnet werden darf', () => {
  it('nimmt Data-URLs mit Bilddaten', () => {
    expect(istZeichenbar(PNG)).toBe(true);
    expect(istZeichenbar('data:image/jpeg;base64,AAAA')).toBe(true);
  });

  it('lehnt eine fremde Adresse ab', () => {
    /*
      jsPDF braucht die BYTES. Eine fremde Adresse müsste der Browser holen,
      und daran scheitert er an CORS — ohne Meldung, mit einem PDF, das
      entweder kein Logo trägt oder gar nicht erst entsteht. Lieber hier
      abweisen als dort scheitern.
    */
    expect(istZeichenbar('https://example.com/logo.png')).toBe(false);
    expect(istZeichenbar('data:image/svg+xml;base64,AAAA')).toBe(false);
    expect(istZeichenbar(undefined)).toBe(false);
    expect(istZeichenbar('')).toBe(false);
  });
});

describe('Logo zeichnen', () => {
  it('zeichnet OHNE Logo nichts und verschiebt nichts', () => {
    /*
      DIE ZUSICHERUNG AN DEN BESTAND. Die Aufrufer schieben ihren Kopf um
      genau diesen Rückgabewert nach unten. Sind es 0 mm, bleibt jeder Beleg
      exakt so, wie er heute aussieht.
    */
    const gemalt: unknown[] = [];
    const doc = { addImage: (...a: unknown[]) => gemalt.push(a) };
    expect(logoZeichnen(doc, {}, 195, 14)).toBe(0);
    expect(logoZeichnen(doc, { logoUrl: 'https://example.com/l.png' }, 195, 14)).toBe(0);
    expect(gemalt).toHaveLength(0);
  });

  it('zeichnet MIT Logo und meldet die belegte Höhe', () => {
    const gemalt: unknown[][] = [];
    const doc = { addImage: (...a: unknown[]) => gemalt.push(a) };
    const hoehe = logoZeichnen(doc, { logoUrl: PNG }, 195, 14);

    expect(hoehe).toBeGreaterThan(0);
    expect(gemalt).toHaveLength(1);
    const [daten, format, x] = gemalt[0];
    expect(daten).toBe(PNG);
    expect(format).toBe('PNG');
    // Rechtsbündig: die Kante liegt bei x = 195, das Bild davor.
    expect(x as number).toBeLessThan(195);
  });

  it('lässt ein kaputtes Bild den Beleg nicht verhindern', () => {
    // Ein Logo ist nie wichtiger als die Rechnung, auf der es steht.
    const doc = {
      addImage: () => {
        throw new Error('kaputt');
      },
    };
    expect(() => logoZeichnen(doc, { logoUrl: PNG }, 195, 14)).not.toThrow();
    expect(logoZeichnen(doc, { logoUrl: PNG }, 195, 14)).toBe(0);
  });
});

describe('Logo einpassen', () => {
  it('behält die Form — ein quadratisches Logo bekommt Luft SEITLICH', () => {
    /*
      Der Briefkopf zeichnet in ein FESTES, breites Rechteck. Ohne Einpassen
      würde ein quadratisches Logo darin auseinandergezogen — ein verzogenes
      Firmenlogo auf einer Rechnung ist schlimmer als gar keins.

      Der Kasten ist breiter als hoch, das Quadrat stösst also an der HÖHE an
      und bekommt links und rechts Luft.
    */
    const q = einpassen(1000, 1000, 400, 188);
    expect(Math.round(q.b)).toBe(Math.round(q.h));
    expect(Math.round(q.h)).toBe(188);
    expect(q.x).toBeGreaterThan(0);
    expect(Math.round(q.y)).toBe(0);
  });

  it('passt ein sehr breites Logo an der Breite an', () => {
    const b = einpassen(2000, 200, 400, 188);
    expect(Math.round(b.b)).toBe(400);
    expect(Math.round(b.h)).toBe(40);
  });

  it('kommt mit einem leeren Bild zurecht', () => {
    expect(einpassen(0, 0)).toEqual({ x: 0, y: 0, b: 0, h: 0 });
  });
});

describe('Größe einer Data-URL', () => {
  it('rechnet die Base64-Aufblähung heraus', () => {
    // 4 Base64-Zeichen sind 3 Bytes; die Länge der URL täuscht sonst um ein
    // Drittel nach oben.
    expect(dataUrlBytes('data:image/png;base64,AAAA')).toBe(3);
    expect(dataUrlBytes('kein-komma')).toBe(0);
  });
});
