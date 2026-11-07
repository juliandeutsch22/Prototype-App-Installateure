import { describe, it, expect } from 'vitest';
import {
  ANNAHME_PFAD, annahmeAdresse, annahmeMail, spaetestensGueltigBis, vorgabeGueltigBis,
} from '@/features/quotes/annahmeLink';
import {
  NAME_MAX, SCHLUESSEL_FORM, UNTERSCHRIFT_MAX, ablehnungFehler, annahmeFehler, zeichen,
} from '@shared/angebotLink';
import { standLesen } from '@/lib/db/pg/angebotAnnahme';

/**
 * Die Regeln rund um den Annahme-Link (M02a, A06), ohne Datenbank: die
 * Adresse mit dem Schlüssel im Fragment, die Vorgabe der Gültigkeit, der
 * Text fürs Mailprogramm, die Pflichtangaben des Kunden und das Lesen des
 * Stands.
 */

describe('Die Adresse', () => {
  it('trägt den Schlüssel im Fragment — nie in Pfad oder Abfrage', () => {
    const a = annahmeAdresse('https://app.senklot.at/', 'S'.repeat(43));
    expect(a).toBe(`https://app.senklot.at${ANNAHME_PFAD}#${'S'.repeat(43)}`);
    const u = new URL(a);
    expect(u.pathname).toBe('/angebot/annehmen');
    expect(u.search).toBe('');
    expect(u.hash.slice(1)).toMatch(SCHLUESSEL_FORM);
  });
});

describe('Die Gültigkeit', () => {
  it('bis zur Bindefrist, höchstens ein Jahr; liegt sie zurück, 30 Tage (wie `angebot_link_erzeugen`)', () => {
    expect(vorgabeGueltigBis('2026-12-01', '2026-11-06')).toBe('2026-12-01');
    expect(vorgabeGueltigBis('2026-11-06', '2026-11-06')).toBe('2026-11-06');
    expect(vorgabeGueltigBis('2026-11-05', '2026-11-06')).toBe('2026-12-06');
    expect(vorgabeGueltigBis('2099-01-01', '2026-11-06')).toBe('2027-11-06');
    expect(spaetestensGueltigBis('2028-02-29')).toBe('2029-02-28');
    // Über die Zeitumstellung hinweg ohne Versatz.
    expect(vorgabeGueltigBis(undefined, '2026-10-20')).toBe('2026-11-19');
  });
});

describe('Per Mail-Programm', () => {
  it('Empfänger, Betreff und Text mit dem Link — kurz genug für jedes Mailprogramm', () => {
    const href = annahmeMail({
      an: 'amt@neudorf.at', angebotsnummer: 'AN-2026-0007', firma: 'Perl Installationen',
      adresse: `https://app.senklot.at/angebot/annehmen#${'S'.repeat(43)}`, gueltigBis: '2026-12-31',
    });
    expect(href.startsWith('mailto:amt@neudorf.at?subject=')).toBe(true);
    const u = new URL(href);
    expect(u.searchParams.get('subject')).toBe('Angebot AN-2026-0007 von Perl Installationen');
    expect(u.searchParams.get('body')).toContain(`https://app.senklot.at/angebot/annehmen#${'S'.repeat(43)}`);
    expect(u.searchParams.get('body')).toContain('Der Link gilt bis 31.12.2026.');
    // Wie `bestellMail`: unter der Grenze, an der Mailprogramme stillschweigend kürzen.
    expect(href.length).toBeLessThan(1800);
  });

  it('ohne E-Mail des Kunden: das Mailprogramm fragt nach dem Empfänger', () => {
    const href = annahmeMail({ angebotsnummer: 'AN-1', firma: 'F', adresse: 'https://x/#y', gueltigBis: '2026-12-31' });
    expect(href.startsWith('mailto:?subject=')).toBe(true);
  });
});

describe('Die Pflichtangaben des Kunden (shared/angebotLink.ts)', () => {
  const BILD = 'data:image/png;base64,iVBORw0KGgo=';
  it('Annahme: Name, Bestätigung, Unterschrift als PNG', () => {
    expect(annahmeFehler({ name: 'Maria Huber', bestaetigt: true, unterschrift: BILD })).toBeNull();
    expect(annahmeFehler({ name: ' M ', bestaetigt: true, unterschrift: BILD })).toMatch(/Namen/);
    expect(annahmeFehler({ name: 'x'.repeat(NAME_MAX + 1), bestaetigt: true, unterschrift: BILD })).toMatch(/Namen/);
    expect(annahmeFehler({ name: 'Maria Huber', bestaetigt: false, unterschrift: BILD })).toMatch(/bestätigen/);
    expect(annahmeFehler({ name: 'Maria Huber', bestaetigt: true, unterschrift: null })).toMatch(/unterschreiben/);
    expect(annahmeFehler({ name: 'Maria Huber', bestaetigt: true, unterschrift: 'data:image/jpeg;base64,AAAA' })).toMatch(/unterschreiben/);
    expect(annahmeFehler({ name: 'Maria Huber', bestaetigt: true, unterschrift: `${BILD}${'A'.repeat(UNTERSCHRIFT_MAX)}` })).toMatch(/unterschreiben/);
  });

  it('Ablehnung: Name Pflicht, Grund freiwillig', () => {
    expect(ablehnungFehler({ name: 'Maria Huber', grund: '' })).toBeNull();
    expect(ablehnungFehler({ name: '', grund: 'Zu teuer' })).toMatch(/Namen/);
    expect(ablehnungFehler({ name: 'Maria Huber', grund: 'g'.repeat(1001) })).toMatch(/zu lang/);
  });

  it('zählt Zeichen wie Postgres — Codepunkte, nicht UTF-16-Einheiten', () => {
    expect(zeichen('Jörg')).toBe(4);
    expect(zeichen('𝔐a')).toBe(2);
    expect('𝔐a'.length).toBe(3);
  });
});

describe('Den Stand lesen', () => {
  it('liest Angebot, Kunde und Firmendaten — Titel und Rabatt der Position wie die Datenschicht', () => {
    const s = standLesen({
      fassung: 1,
      angebot: {
        quoteNumber: 'AN-1', quoteDate: '2026-11-01', validUntil: '2026-12-01', customerName: 'Huber', address: null,
        notes: null, vatRate: 0.2, discount: { mode: 'percent', value: 5, label: null }, discountAmount: 10,
        subtotalNetto: 200, totalNetto: 190, totalVat: 38, totalBrutto: 228,
        positions: [
          { art: 'titel', label: 'Bad', qty: 0, unit: '', unitPrice: 0, netto: 0, rabattProzent: null },
          { art: 'position', label: 'WC', qty: 1, unit: 'Stk', unitPrice: 200, netto: 180, rabattProzent: 10 },
        ],
      },
      kunde: null,
      aussteller: { name: 'Perl', iban: null },
    });
    expect(s.angebot).toMatchObject({ quoteNumber: 'AN-1', discount: { mode: 'percent', value: 5 }, totalBrutto: 228 });
    expect(s.angebot).not.toHaveProperty('address');
    expect(s.angebot.positions).toEqual([
      { art: 'titel', label: 'Bad', qty: 0, unit: '', unitPrice: 0, netto: 0 },
      { label: 'WC', qty: 1, unit: 'Stk', unitPrice: 200, netto: 180, rabattProzent: 10 },
    ]);
    expect(s.kunde).toBeNull();
    expect(s.aussteller.name).toBe('Perl');
  });

  it('wirft bei einem unvollständigen Stand, statt eine halbe Seite zu zeigen', () => {
    expect(() => standLesen({ angebot: { positions: [] } })).toThrow(/unvollständig/);
    expect(() => standLesen(null)).toThrow(/unvollständig/);
  });
});
