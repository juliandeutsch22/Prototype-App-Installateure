import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import {
  ADRESSE_FORM, ANHANG_MAX_BYTES, EMPFAENGER_MAX, JE_BELEG_JE_STUNDE, JE_BETRIEB_JE_STUNDE, JE_BETRIEB_JE_TAG,
  JE_PERSON_JE_STUNDE, STANDARD_VORLAGEN, adresseFehler, anhangName, betreffFehler, empfaengerLesen, textFehler,
  unbekanntePlatzhalter, vorlageFuellen, vorlageFuer,
} from '@shared/belegMail';

/*
  DIE REGELN DES MAILVERSANDS (F16) — dieselben in Maske, Function und
  Datenbank. Die Datenbank prüft mit eigenen Konstanten; hier steht fest,
  dass die Zahlen in der Migration dieselben sind wie in `shared/`.
*/

const MIGRATION = readFileSync('supabase/migrations/20261117041000_beleg_versand.sql', 'utf8');

describe('Empfänger', () => {
  it('liest getrennt durch Komma, Strichpunkt oder Leerzeichen, doppelte einmal', () => {
    expect(empfaengerLesen(' kunde@huber.at; hv@verwaltung.at ,KUNDE@huber.at')).toEqual({
      adressen: ['kunde@huber.at', 'hv@verwaltung.at'], fehler: null,
    });
  });
  it('weist leer, zu viele und ungültige zurück', () => {
    expect(empfaengerLesen('').fehler).toMatch(/E-Mail-Adresse angeben/);
    expect(empfaengerLesen('a@b.at c@d.at e@f.at g@h.at').fehler).toMatch(`Höchstens ${EMPFAENGER_MAX}`);
    expect(empfaengerLesen('kunde@huber').fehler).toMatch(/keine gültige/);
    expect(adresseFehler('kunde@huber.at\r\nBcc: x@y.at')).not.toBeNull();
    expect(adresseFehler('"Huber" <kunde@huber.at>')).not.toBeNull();
    expect(adresseFehler(`${'a'.repeat(250)}@b.at`)).not.toBeNull();
    expect(adresseFehler('maria.huber+rechnung@sub.huber-bau.at')).toBeNull();
  });
});

describe('Betreff und Text', () => {
  it('Betreff in einer Zeile, höchstens 200 Zeichen; Text nicht leer, ohne Steuerzeichen', () => {
    expect(betreffFehler('Rechnung RE-2026-1001')).toBeNull();
    expect(betreffFehler('Rechnung\nBcc: x@y.at')).toMatch(/einer Zeile/);
    expect(betreffFehler('x'.repeat(201))).toMatch(/zu lang/);
    expect(textFehler('Guten Tag,\n\nanbei …')).toBeNull();
    expect(textFehler('  ')).toMatch(/Text angeben/);
    expect(textFehler('a\u0007b')).toMatch(/Steuerzeichen/);
  });
});

describe('Vorlagen', () => {
  it('die Vorlage des Betriebs geht vor, je Feld; leer heißt Standard', () => {
    expect(vorlageFuer('rechnung', { rechnung: { betreff: 'RE {nummer}' } })).toEqual({
      betreff: 'RE {nummer}', text: STANDARD_VORLAGEN.rechnung.text,
    });
    expect(vorlageFuer('angebot', { angebot: { betreff: '  ', text: 'Hallo' } })).toEqual({
      betreff: STANDARD_VORLAGEN.angebot.betreff, text: 'Hallo',
    });
    expect(vorlageFuer('angebot', null)).toEqual(STANDARD_VORLAGEN.angebot);
  });

  it('setzt Platzhalter ein; eine Zeile mit leerem Platzhalter fällt weg (kein Link ohne Link)', () => {
    const v = STANDARD_VORLAGEN.angebot.text;
    const mit = vorlageFuellen(v, { nummer: 'AN-2026-0007', betrag: '€ 168,00', gueltig_bis: '01.12.2026', link: 'https://app.senklot.at/angebot/annehmen#x', firma: 'Perl' });
    expect(mit).toContain('unser Angebot AN-2026-0007 über € 168,00, gültig bis 01.12.2026.');
    expect(mit).toContain('annehmen: https://app.senklot.at/angebot/annehmen#x');
    const ohne = vorlageFuellen(v, { nummer: 'AN-2026-0007', betrag: '€ 168,00', gueltig_bis: '01.12.2026', link: undefined, firma: 'Perl' });
    expect(ohne).not.toMatch(/Link/);
    expect(ohne).not.toMatch(/\n{3}/);
  });

  it('Gegenprobe: ein unbekannter Platzhalter bleibt stehen und wird gemeldet', () => {
    expect(vorlageFuellen('Rechnung {numer}', { nummer: '1' })).toBe('Rechnung {numer}');
    expect(unbekanntePlatzhalter('rechnung', 'Rechnung {numer} {link}')).toEqual(['numer', 'link']);
    expect(unbekanntePlatzhalter('angebot', STANDARD_VORLAGEN.angebot.text)).toEqual([]);
    expect(unbekanntePlatzhalter('rechnung', STANDARD_VORLAGEN.rechnung.text)).toEqual([]);
  });

  it('der Dateiname folgt der Nummer — wie in der Datenbank', () => {
    expect(anhangName('rechnung', 'RE-2026-1001')).toBe('Rechnung_RE-2026-1001.pdf');
    expect(anhangName('angebot', 'AN/2026 7')).toBe('Angebot_AN_2026_7.pdf');
    expect(MIGRATION).toContain("regexp_replace(nummer, '[^A-Za-z0-9._-]', '_', 'g') || '.pdf'");
  });
});

describe('Dieselben Zahlen in der Datenbank', () => {
  it('Rate-Limit, Anhang, Empfänger, Betreff', () => {
    expect(MIGRATION).toContain(`interval '1 hour') >= ${JE_PERSON_JE_STUNDE}`);
    expect(MIGRATION).toContain(`interval '1 hour') >= ${JE_BETRIEB_JE_STUNDE}`);
    expect(MIGRATION).toContain(`interval '1 day') >= ${JE_BETRIEB_JE_TAG}`);
    expect(MIGRATION).toMatch(new RegExp(`\\(v\\.invoice_id = p_beleg or v\\.quote_id = p_beleg\\)\\) >= ${JE_BELEG_JE_STUNDE}`));
    expect(MIGRATION).toContain(`p_anhang_bytes not between 1 and ${ANHANG_MAX_BYTES}`);
    expect(MIGRATION).toContain(`cardinality(p_an) not between 1 and ${EMPFAENGER_MAX}`);
  });

  it('dasselbe Adressmuster', () => {
    const sql = /p_adresse ~ '(.*)'\n/.exec(MIGRATION)![1].replace(/''/g, "'");
    expect(sql).toBe(ADRESSE_FORM.source);
  });
});

/*
  DIE MAHNUNG PER MAIL (F16, Nacharbeit): eigene Vorlage, eigener Dateiname
  je Stufe — derselbe wie beim „PDF“ der Mahnung und wie in der Datenbank.
*/
const MAHNUNG_MIGRATION = readFileSync('supabase/migrations/20261117043000_mahnung_per_mail.sql', 'utf8');

describe('Mahnung per Mail', () => {
  it('die Standardvorlage nennt Titel, Rechnung, offenen Betrag und Frist — ohne unbekannte Platzhalter', () => {
    expect(unbekanntePlatzhalter('mahnung', STANDARD_VORLAGEN.mahnung.betreff)).toEqual([]);
    expect(unbekanntePlatzhalter('mahnung', STANDARD_VORLAGEN.mahnung.text)).toEqual([]);
    const text = vorlageFuellen(STANDARD_VORLAGEN.mahnung.text, {
      nummer: 'RE-2026-1001', titel: 'Mahnung', offen: '€ 120,00', frist: '30.11.2026', firma: 'Perl',
    });
    expect(text).toContain('unsere Mahnung zur Rechnung RE-2026-1001. Offen sind € 120,00');
    expect(text).toContain('bis 30.11.2026.');
    expect(vorlageFuellen(STANDARD_VORLAGEN.mahnung.betreff, { nummer: 'RE-2026-1001', titel: 'Zahlungserinnerung', firma: 'Perl' }))
      .toBe('Zahlungserinnerung zu Rechnung RE-2026-1001 — Perl');
  });

  it('Gegenprobe: der Link des Angebots ist bei der Mahnung unbekannt, Titel und Frist bei der Rechnung', () => {
    expect(unbekanntePlatzhalter('mahnung', '{link} {betrag}')).toEqual(['link', 'betrag']);
    expect(unbekanntePlatzhalter('rechnung', '{titel} {frist}')).toEqual(['titel', 'frist']);
  });

  it('Dateiname je Stufe — wie `mahnungDateiname` und wie in der Datenbank', async () => {
    const { mahnungDateiname } = await import('@/features/invoices/mahnungPdf');
    for (const stufe of [1, 2, 3] as const) {
      expect(anhangName('mahnung', 'RE-2026-1001', stufe)).toBe(mahnungDateiname({ invoiceNumber: 'RE-2026-1001' }, stufe));
    }
    expect(MAHNUNG_MIGRATION).toContain(
      "case mahnung.stufe when 1 then 'Zahlungserinnerung_' when 2 then 'Mahnung_' else 'Letzte_Mahnung_' end",
    );
  });

  it('das Rate-Limit zählt Rechnung und Mahnungen zusammen; die Datenbank kennt die Vorlage', () => {
    expect(MAHNUNG_MIGRATION).toMatch(new RegExp(
      `\\(v\\.invoice_id = coalesce\\(rechnung\\.id, p_beleg\\) or v\\.quote_id = p_beleg\\)\\) >= ${JE_BELEG_JE_STUNDE}`,
    ));
    expect(MAHNUNG_MIGRATION).toContain("k not in ('rechnung', 'angebot', 'mahnung')");
  });
});
