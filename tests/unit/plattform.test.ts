import { describe, it, expect } from 'vitest';
import { betriebFehler, kennungVorschlag } from '@shared/plattform';

// Testbericht 30.09.2026, G21 — die Kennung aus dem Namen vorschlagen.
describe('kennungVorschlag', () => {
  it('schreibt klein, Umlaute aus, alles andere wird Bindestrich', () => {
    expect(kennungVorschlag('Perl Installationen GmbH')).toBe('perl-installationen-gmbh');
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

  it('Gegenprobe: aus nichts Brauchbarem wird kein Vorschlag', () => {
    expect(kennungVorschlag('123 !!!')).toBe('');
  });
});
