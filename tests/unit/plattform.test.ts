import { describe, it, expect } from 'vitest';
import { betriebFehler, kennungVorschlag } from '@shared/plattform';

// Testbericht 30.09.2026, G21 — die Kennung aus dem Namen vorschlagen.
describe('kennungVorschlag', () => {
  it('schreibt klein, Umlaute aus, alles andere wird Bindestrich', () => {
    expect(kennungVorschlag('Perl Haustechnik')).toBe('perl-haustechnik');
    expect(kennungVorschlag('Müller & Söhne')).toBe('mueller-soehne');
    expect(kennungVorschlag('Gießerei Weiß')).toBe('giesserei-weiss');
  });

  it('beginnt mit einem Buchstaben und hat höchstens 30 Zeichen', () => {
    expect(kennungVorschlag('3 Brüder Installateure')).toBe('brueder-installateure');
    expect(kennungVorschlag('Sehr langer Betriebsname für einen Installateur').length).toBeLessThanOrEqual(30);
  });

  it('der Vorschlag besteht die Prüfung, die die Anlage verlangt', () => {
    const kennung = kennungVorschlag('Perl Installationen GmbH');
    expect(betriebFehler({ name: 'Perl', companyId: kennung, adminEmail: 'a@b.at', adminName: 'A' })).toBeNull();
  });

  // Nachtest 01.10.2026, N4: früher „installateur-mueller-soehne-gm“.
  it('lässt die Rechtsform weg und kürzt an einer Wortgrenze', () => {
    expect(kennungVorschlag('Installateur Müller & Söhne GmbH')).toBe('installateur-mueller-soehne');
    expect(kennungVorschlag('Perl Installationen GmbH')).toBe('perl-installationen');
    expect(kennungVorschlag('Huber Haustechnik GmbH & Co KG')).toBe('huber-haustechnik');
    expect(kennungVorschlag('Wagner Bad e.U.')).toBe('wagner-bad');
    expect(kennungVorschlag('Gruber Ges.m.b.H.')).toBe('gruber');
    expect(kennungVorschlag('Steiner OG')).toBe('steiner');
    expect(kennungVorschlag('Hofer & Partner KG')).toBe('hofer-partner');
    expect(kennungVorschlag('Bauer GesbR')).toBe('bauer');
    expect(kennungVorschlag('Wimmer AG')).toBe('wimmer');
    // Steht die Rechtsform allein, bleibt sie — sonst bliebe nichts.
    expect(kennungVorschlag('GmbH')).toBe('gmbh');
    // Gekürzt wird zwischen Wörtern, nie in einem.
    const lang = kennungVorschlag('Sanitär Heizung Lüftung Oberösterreich Mitte GmbH');
    expect(lang).toBe('sanitaer-heizung-lueftung');
    expect(lang.length).toBeLessThanOrEqual(30);
    // Ein einzelnes Wort über 30 Zeichen wird geschnitten — es gibt keine Grenze.
    expect(kennungVorschlag('Wohnungseigentümergemeinschaftsverwaltung')).toHaveLength(30);
  });

  it('Gegenprobe: aus nichts Brauchbarem wird kein Vorschlag', () => {
    expect(kennungVorschlag('123 !!!')).toBe('');
  });
});
