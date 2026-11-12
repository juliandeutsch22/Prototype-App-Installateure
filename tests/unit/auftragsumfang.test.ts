/**
 * E82 (A5): „Aus Eingang EG-…“ stand in der Baustellenakte zweimal — im
 * Auftragsumfang (von der Datenbank angehängt) und als Verweis darunter.
 */
import { describe, it, expect } from 'vitest';
import { auftragsumfangZeigen } from '@/features/projects/auftragsumfang';

// Genau so schreibt `eingang_baustelle_anlegen` die Beschreibung.
const ausDerDatenbank = 'Therme tropft, bitte rasch\n\nNummer des Auftraggebers: HV-17\n\nAus Eingang EG-2026-0012';

describe('auftragsumfangZeigen', () => {
  it('lässt den Anhang weg, wenn der Verweis auf den Eingang darunter steht', () => {
    expect(auftragsumfangZeigen(ausDerDatenbank, 'EG-2026-0012'))
      .toBe('Therme tropft, bitte rasch\n\nNummer des Auftraggebers: HV-17');
  });

  it('ohne Anliegen bleibt nichts übrig — die Akte zeigt dann „nicht hinterlegt“', () => {
    expect(auftragsumfangZeigen('\n\nAus Eingang EG-2026-0012', 'EG-2026-0012')).toBe('');
  });

  it('ohne gezeigten Verweis bleibt der Text, wie er ist', () => {
    expect(auftragsumfangZeigen(ausDerDatenbank, null)).toBe(ausDerDatenbank);
  });

  it('entfernt nur den Anhang dieses Eingangs, am Ende und in eigener Zeile', () => {
    // Ein anderer Eingang, mitten im Text, im Satz: alles bleibt.
    expect(auftragsumfangZeigen('Wie Aus Eingang EG-2026-0012 besprochen', 'EG-2026-0012'))
      .toBe('Wie Aus Eingang EG-2026-0012 besprochen');
    expect(auftragsumfangZeigen('Nachbar meldet: Aus Eingang EG-2026-0012', 'EG-2026-0012'))
      .toBe('Nachbar meldet: Aus Eingang EG-2026-0012');
    expect(auftragsumfangZeigen('Text\n\nAus Eingang EG-2026-0001', 'EG-2026-0012'))
      .toBe('Text\n\nAus Eingang EG-2026-0001');
    // Nummer als Präfix einer längeren: kein Treffer.
    expect(auftragsumfangZeigen('Text\n\nAus Eingang EG-2026-00123', 'EG-2026-0012'))
      .toBe('Text\n\nAus Eingang EG-2026-00123');
  });

  it('ein von Hand bearbeiteter Text ohne Anhang bleibt unverändert (nur getrimmt, wie vorher)', () => {
    expect(auftragsumfangZeigen('  Bad neu  ', 'EG-2026-0012')).toBe('Bad neu');
    expect(auftragsumfangZeigen(undefined, 'EG-2026-0012')).toBe('');
  });
});
