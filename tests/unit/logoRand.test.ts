import { describe, it, expect } from 'vitest';
import { inhaltsRahmen } from '@/lib/logoRand';
import { ZIEL_BREITE_PX, ZIEL_HOEHE_PX, einpassen } from '@/lib/logoAufbereiten';

/*
  DAS LOGO OHNE RAND (E100). Ein hochgeladenes Logo wird für den Briefkopf in
  400 × 188 px eingepasst; ein quadratisches Zeichen bekommt dabei links und
  rechts je über 100 px leere Fläche, und im Kopf der App stand das Logo so
  nur halb so groß wie sein Platz. Hier wird geprüft, dass der Rand gefunden
  wird — durchsichtig wie aus `logoAufbereiten`, einfarbig wie bei einem
  JPEG — und dass ein Bild ohne klaren Rand bleibt, wie es ist.

  Gegenprobe: mit einem `inhaltsRahmen`, der das ganze Bild zurückgibt (der
  Stand vor E100: kein Zuschnitt), sind alle sechs Prüfungen rot.
*/

type Farbe = [number, number, number, number];
const DURCHSICHTIG: Farbe = [0, 0, 0, 0];
const WEISS: Farbe = [255, 255, 255, 255];
const PETROL: Farbe = [0, 92, 102, 255];

/** Eine Fläche in der Grundfarbe, darin ein Rechteck in der Inhaltsfarbe. */
function bild(breite: number, hoehe: number, grund: Farbe, inhalt?: { x: number; y: number; b: number; h: number; farbe: Farbe }) {
  const daten = new Uint8ClampedArray(breite * hoehe * 4);
  for (let y = 0; y < hoehe; y++) {
    for (let x = 0; x < breite; x++) {
      const drin = inhalt && x >= inhalt.x && x < inhalt.x + inhalt.b && y >= inhalt.y && y < inhalt.y + inhalt.h;
      daten.set(drin ? inhalt.farbe : grund, (y * breite + x) * 4);
    }
  }
  return daten;
}

describe('E100 Logo ohne Rand', () => {
  it('findet ein quadratisches Zeichen in der Briefkopffläche — wie es `logoAufbereiten` ablegt', () => {
    const lage = einpassen(500, 500);
    const flaeche = { x: Math.round(lage.x), y: Math.round(lage.y), b: Math.round(lage.b), h: Math.round(lage.h) };
    const daten = bild(ZIEL_BREITE_PX, ZIEL_HOEHE_PX, DURCHSICHTIG, { ...flaeche, farbe: PETROL });
    const rahmen = inhaltsRahmen(daten, ZIEL_BREITE_PX, ZIEL_HOEHE_PX)!;
    expect(rahmen).toEqual(flaeche);
    // Vorher stand das Zeichen in einer Fläche mit 2,1 : 1 — jetzt mit seinem eigenen Format.
    expect(rahmen.b / rahmen.h).toBeCloseTo(1, 1);
  });

  it('schneidet einen weißen Rand ab, wie ihn ein JPEG mitbringt', () => {
    const daten = bild(120, 60, WEISS, { x: 10, y: 20, b: 90, h: 15, farbe: PETROL });
    expect(inhaltsRahmen(daten, 120, 60)).toEqual({ x: 10, y: 20, b: 90, h: 15 });
  });

  it('nimmt leichtes Rauschen im Rand hin — ein JPEG ist nie ganz einfarbig', () => {
    const daten = bild(40, 20, WEISS, { x: 5, y: 5, b: 10, h: 10, farbe: PETROL });
    // Ein Bildpunkt im Rand, knapp neben Weiß.
    daten.set([240, 245, 250, 255], (2 * 40 + 30) * 4);
    expect(inhaltsRahmen(daten, 40, 20)).toEqual({ x: 5, y: 5, b: 10, h: 10 });
  });

  it('lässt ein Bild ohne klaren Rand, wie es ist — Ecken uneins (ein Foto, ein Verlauf)', () => {
    const daten = bild(20, 10, WEISS);
    daten.set(PETROL, (9 * 20 + 19) * 4);
    expect(inhaltsRahmen(daten, 20, 10)).toBeNull();
  });

  it('findet in einer leeren Fläche nichts — dann bleibt das Bild, wie es ist', () => {
    expect(inhaltsRahmen(bild(20, 10, DURCHSICHTIG), 20, 10)).toBeNull();
    expect(inhaltsRahmen(bild(20, 10, WEISS), 20, 10)).toBeNull();
    expect(inhaltsRahmen(new Uint8ClampedArray(0), 0, 0)).toBeNull();
  });

  it('ein Logo, das bis an den Rand reicht, bleibt ganz', () => {
    const daten = bild(30, 10, DURCHSICHTIG, { x: 0, y: 0, b: 30, h: 10, farbe: PETROL });
    expect(inhaltsRahmen(daten, 30, 10)).toBeNull();
  });
});
