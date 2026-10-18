import { describe, it, expect } from 'vitest';
import { decktKvNacht, fensterSchnitt } from '@/lib/lohnregeln';

/**
 * Die Nachtzeit gegen den Kollektivvertrag Metallgewerbe (18.10.2026): die
 * Zulage steht für 22 bis 6 Uhr zu (Abschnitt XIV Pkt 5), kürzer darf ein
 * Betrieb nicht gehen (§ 3 Abs 1 ArbVG).
 */
const h = (std: number) => std * 60;

describe('deckt die Nachtzeit 22 bis 6 Uhr?', () => {
  it('ja bei 22–6 und bei längeren Nachtzeiten', () => {
    expect(decktKvNacht({ von: h(22), bis: h(6) })).toBe(true);
    expect(decktKvNacht({ von: h(21), bis: h(6) })).toBe(true);
    expect(decktKvNacht({ von: h(22), bis: h(7) })).toBe(true);
  });

  it('Gegenprobe: nein, wenn sie später beginnt, früher endet oder Mitternacht nicht umfasst', () => {
    expect(decktKvNacht({ von: h(23), bis: h(6) })).toBe(false);
    expect(decktKvNacht({ von: h(22), bis: h(5) })).toBe(false);
    expect(decktKvNacht({ von: 0, bis: h(6) })).toBe(false);
  });
});

describe('wo sich zwei Zeitfenster schneiden', () => {
  const ueNacht = { von: h(20), bis: h(6) };

  it('22–6 liegt ganz in 20–6', () => {
    expect(fensterSchnitt({ von: h(22), bis: h(6) }, ueNacht)).toEqual([{ von: h(22), bis: h(6) }]);
  });

  it('auch Fenster ohne Mitternacht und solche, die darüber hinausreichen', () => {
    expect(fensterSchnitt({ von: 0, bis: h(6) }, ueNacht)).toEqual([{ von: 0, bis: h(6) }]);
    expect(fensterSchnitt({ von: h(18), bis: h(23) }, ueNacht)).toEqual([{ von: h(20), bis: h(23) }]);
    expect(fensterSchnitt({ von: h(19), bis: h(7) }, ueNacht)).toEqual([{ von: h(20), bis: h(6) }]);
  });

  it('in zwei Stücken, wenn ein Fenster den Tag überspannt', () => {
    expect(fensterSchnitt({ von: h(5), bis: h(21) }, ueNacht)).toEqual([{ von: h(5), bis: h(6) }, { von: h(20), bis: h(21) }]);
  });
});
