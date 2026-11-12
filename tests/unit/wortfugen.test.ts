import { describe, expect, it } from 'vitest';
import { wortfugen, WEICHES_TRENNZEICHEN as S } from '@/lib/wortfugen';

describe('wortfugen (E86)', () => {
  it('trennt an der Fuge der Zusammensetzung, nicht an der letzten Silbe', () => {
    expect(wortfugen('Wohnungseigentümergemeinschaft')).toBe(`Wohnungs${S}eigentümer${S}gemeinschaft`);
    expect(wortfugen('Mitarbeiterübersicht')).toBe(`Mitarbeiter${S}übersicht`);
    expect(wortfugen('Benutzerverwaltung')).toBe(`Benutzer${S}verwaltung`);
    expect(wortfugen('Handwerksscheine')).toBe(`Handwerks${S}scheine`);
  });

  it('lässt kurze Wörter, Grundwörter allein und Unbekanntes, wie es ist', () => {
    expect(wortfugen('Baustellen')).toBe('Baustellen');
    expect(wortfugen('Übersicht')).toBe('Übersicht');
    expect(wortfugen('Familie Huber')).toBe('Familie Huber');
    expect(wortfugen('Donaudampfschiff')).toBe('Donaudampfschiff');
  });

  it('teilt nie ein Stück unter vier Buchstaben ab', () => {
    // „Bau“ vor „stellen“ wäre zu kurz; „Nach“ vor „kalkulation“ genügt.
    expect(wortfugen('Nachkalkulation')).toBe(`Nach${S}kalkulation`);
    expect(wortfugen('Teilbaustelle')).toBe(`Teil${S}baustelle`);
  });

  it('hält Hausnummernbereiche zusammen, Nummern wie B-2026-0001 bleiben unberührt', () => {
    expect(wortfugen('Hauptstraße 12–14')).toBe('Hauptstraße 12⁠–⁠14');
    expect(wortfugen('Gasse 3a - 5')).toBe('Gasse 3a - 5');
    expect(wortfugen('B-2026-0001')).toBe('B-2026-0001');
  });

  it('ändert den lesbaren Text nicht: ohne die unsichtbaren Zeichen bleibt er gleich', () => {
    const t = 'Wohnungseigentümergemeinschaft Hauptstraße 112–118';
    expect(wortfugen(t).replace(/[­⁠]/g, '')).toBe(t);
  });
});
