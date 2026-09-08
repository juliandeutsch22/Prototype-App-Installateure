import { describe, it, expect } from 'vitest';
import {
  zielMasse,
  fotoPfad,
  bildHash,
  nochNichtOben,
  fuerDenSchein,
  groesse,
  darfFotografieren,
  MAX_KANTE,
  MAX_FOTOS,
  type FotoEntwurf,
} from '@/features/worksheets/fotos';
import { kanonischerInhalt } from '@shared/scheinHash';
import type { WorkSheetFoto } from '@/types';

/**
 * Fotos am Handwerksschein.
 *
 * Der Schein sagt, was gemacht wurde; das Foto sagt, wie es aussah. Bei einem
 * Wasserschaden im Keller oder einer Leitung, die hinter der Wand anders lag
 * als geplant, ist das Bild das einzige, was sich später nicht
 * wegdiskutieren lässt.
 *
 * SIE SIND FREIWILLIG, und zwar aus einem technischen Grund mit
 * betrieblichen Folgen: Firestore hält einen Schreibvorgang offline vor,
 * Firebase Storage tut das nicht. Wäre ein Foto Bedingung, hinge der ganze
 * Beleg an einem Balken Empfang.
 */

const foto = (p: Partial<WorkSheetFoto> = {}): WorkSheetFoto => ({
  pfad: 'scheine/perl/s1/abc.jpg',
  hash: 'abc',
  bytes: 340_000,
  geraetZeit: 1_757_000_000_000,
  ...p,
});

describe('Das Verkleinern', () => {
  it('legt die längere Kante auf das Mass und behält das Verhältnis', () => {
    // Ein Handyfoto im Querformat: 4032 × 3024.
    expect(zielMasse(4032, 3024)).toEqual({ breite: MAX_KANTE, hoehe: 1200 });
  });

  it('rechnet im Hochformat genauso', () => {
    expect(zielMasse(3024, 4032)).toEqual({ breite: 1200, hoehe: MAX_KANTE });
  });

  /*
    EIN KLEINES BILD WIRD NICHT VERGRÖSSERT. Das kostete Bytes und brächte
    keinen einzigen Bildpunkt an Information dazu — und ausgerechnet auf einer
    Baustelle mit halbem Balken.
  */
  it('lässt ein ohnehin kleines Bild in Ruhe', () => {
    expect(zielMasse(800, 600)).toEqual({ breite: 800, hoehe: 600 });
  });

  it('kommt mit unbrauchbaren Massen zurecht, statt zu rechnen', () => {
    expect(zielMasse(0, 0)).toEqual({ breite: 0, hoehe: 0 });
    expect(zielMasse(-5, 100)).toEqual({ breite: 0, hoehe: 0 });
  });
});

describe('Der Pfad', () => {
  /*
    MANDANT ZUERST. Die Storage-Regel schneidet die Mandantengrenze an diesem
    ersten Abschnitt. Läge er weiter hinten, müsste sie den Pfad zerlegen —
    und eine Regel, die Zeichenketten zerlegt, liegt irgendwann daneben.
  */
  it('beginnt mit dem Mandanten, dann der Schein', () => {
    expect(fotoPfad('perl', 's1', 'abc.jpg')).toBe('scheine/perl/s1/abc.jpg');
  });
});

describe('Der Inhalts-Hash', () => {
  it('ist für gleiche Bytes gleich und für andere anders', async () => {
    const a = new TextEncoder().encode('ein bild').buffer;
    const b = new TextEncoder().encode('ein bild').buffer;
    const c = new TextEncoder().encode('ein anderes bild').buffer;
    expect(await bildHash(a)).toBe(await bildHash(b));
    expect(await bildHash(a)).not.toBe(await bildHash(c));
  });

  it('ist eine Hexadezimalkette in SHA-256-Länge', () => {
    return bildHash(new TextEncoder().encode('x').buffer).then((h) => {
      expect(h).toMatch(/^[0-9a-f]{64}$/);
    });
  });
});

/**
 * Die Naht zur Prüfsumme — hier hängt die Beweiskraft.
 */
describe('Die Fotos in der Prüfsumme', () => {
  const schein = (fotos?: Array<{ pfad: string; hash: string }>) => ({
    projectNumber: '2026-001',
    customerName: 'Huber',
    datum: '2026-09-07',
    abrechnung: 'Regie',
    zeiten: [],
    material: [],
    fotos,
  });

  /*
    DER KERN. Die Prüfsumme sieht nur Firestore, nicht die Bilddatei im
    Storage. Ginge der Inhalts-Hash nicht mit ein, liesse sich das Bild nach
    der Unterschrift austauschen, ohne dass irgendetwas auffiele — der Beleg
    wäre genau dort löcherig, wo er beweisen soll.
  */
  it('ändert sich, wenn ein Bild ausgetauscht wird', () => {
    const vorher = kanonischerInhalt(schein([{ pfad: 'scheine/perl/s1/a.jpg', hash: 'aaa' }]));
    const nachher = kanonischerInhalt(schein([{ pfad: 'scheine/perl/s1/a.jpg', hash: 'bbb' }]));
    expect(vorher).not.toBe(nachher);
  });

  it('ändert sich, wenn ein Bild dazukommt oder wegfällt', () => {
    const eins = kanonischerInhalt(schein([{ pfad: 'a', hash: 'aaa' }]));
    const zwei = kanonischerInhalt(
      schein([
        { pfad: 'a', hash: 'aaa' },
        { pfad: 'b', hash: 'bbb' },
      ]),
    );
    expect(eins).not.toBe(zwei);
  });

  it('ändert sich, wenn die Reihenfolge eine andere ist', () => {
    // Wie bei den Positionen: ein umsortierter Beleg ist ein anderer Beleg.
    const so = kanonischerInhalt(
      schein([
        { pfad: 'a', hash: 'aaa' },
        { pfad: 'b', hash: 'bbb' },
      ]),
    );
    const anders = kanonischerInhalt(
      schein([
        { pfad: 'b', hash: 'bbb' },
        { pfad: 'a', hash: 'aaa' },
      ]),
    );
    expect(so).not.toBe(anders);
  });

  /*
    RÜCKWÄRTS VERTRÄGLICH, und das ist keine Feinheit. Schriebe ein Schein
    ohne Fotos jetzt eine leere FOTO-Zeile, änderte allein das Einführen
    dieses Feldes die Prüfsumme JEDES bestehenden Scheins — und keiner davon
    liesse sich mehr nachrechnen.
  */
  it('lässt einen Schein ohne Fotos unverändert', () => {
    expect(kanonischerInhalt(schein(undefined))).toBe(kanonischerInhalt(schein([])));
    expect(kanonischerInhalt(schein(undefined))).not.toContain('FOTO');
  });
});

describe('Was in den Schein geschrieben wird', () => {
  const entwurf = (oben?: WorkSheetFoto): FotoEntwurf => ({
    vorschau: 'blob:x',
    daten: new Blob(),
    geraetZeit: 1,
    oben,
  });

  /*
    NUR DIE HOCHGELADENEN. Ein Eintrag für ein Bild, das nicht im Storage
    liegt, wäre ein Verweis ins Leere — und er ginge in die Prüfsumme ein,
    die damit einen Beleg zusicherte, den niemand ansehen kann.
  */
  it('nimmt nur mit, was wirklich oben ist', () => {
    expect(fuerDenSchein([entwurf(foto()), entwurf(undefined)])).toEqual([foto()]);
  });

  it('nennt die, die noch fehlen — vor dem Unterschreiben', () => {
    const offen = nochNichtOben([entwurf(foto()), entwurf(undefined), entwurf(undefined)]);
    expect(offen).toHaveLength(2);
  });

  it('meldet nichts, wenn alles oben ist', () => {
    expect(nochNichtOben([entwurf(foto())])).toEqual([]);
  });

  it('meldet auch bei gar keinem Foto nichts — der Schein ist vollständig', () => {
    expect(nochNichtOben([])).toEqual([]);
  });
});

describe('Ob noch ein Foto dazu darf', () => {
  it('lässt es am Entwurf zu', () => {
    expect(darfFotografieren('Entwurf', 0).moeglich).toBe(true);
  });

  /*
    NACH DER UNTERSCHRIFT NICHT MEHR. Ein nachgereichtes Bild wäre eine
    Änderung an einem Beleg, den der Kunde in der Hand hat — und die
    Prüfsumme wiese sie als solche aus.
  */
  it('sperrt am unterschriebenen Schein und sagt warum', () => {
    const p = darfFotografieren('Unterschrieben', 0);
    expect(p.moeglich).toBe(false);
    expect(p.grund).toMatch(/unterschrieben/i);
  });

  it('sperrt am stornierten Schein ebenso', () => {
    expect(darfFotografieren('Storniert', 0).moeglich).toBe(false);
  });

  it('hält bei der Obergrenze an', () => {
    // Nicht aus technischer Not — ein Beleg mit dreissig Bildern hilft
    // niemandem. Wer dokumentiert, wählt aus.
    expect(darfFotografieren('Entwurf', MAX_FOTOS).moeglich).toBe(false);
    expect(darfFotografieren('Entwurf', MAX_FOTOS - 1).moeglich).toBe(true);
  });
});

describe('Die Grössenangabe', () => {
  it('schreibt Kilobyte und Megabyte, wie man sie liest', () => {
    expect(groesse(900)).toBe('900 B');
    expect(groesse(340_000)).toBe('332 KB');
    expect(groesse(1_300_000)).toBe('1,2 MB');
  });
});
