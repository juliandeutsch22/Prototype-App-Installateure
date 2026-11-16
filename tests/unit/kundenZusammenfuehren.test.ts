/**
 * Kunden zusammenführen (Durchsicht 15.11.2026, F9) — was die Ansicht vor
 * dem Zusammenführen rechnet und was der Verlauf danach sagt. Die Arbeit
 * selbst prüft `tests/supabase/kundenZusammenfuehren.test.ts`.
 */
import { describe, it, expect } from 'vitest';
import {
  hinweise,
  unterschiede,
  vorgabeWahl,
  wahlFehler,
  wandertZeilen,
  wertDanach,
} from '@/features/customers/zusammenfuehren';
import { verlaufEintrag } from '@/features/verlauf/objektVerlaufText';
import type { ZusammenfuehrenVorschau } from '@/lib/db/customers';
import type { ObjektVerlaufZeile } from '@/lib/db/objektVerlauf';

const bleibt = {
  id: 'k1', companyId: 'b', name: 'Maier GmbH', kundennummer: 'K-1', kundenart: 'unternehmen' as const,
  address: 'Hauptstraße 1, 1010 Wien', contactName: 'Frau Maier', email: '', notes: 'Schlüssel beim Hausmeister',
  active: true,
};
const geht = {
  id: 'k2', companyId: 'b', name: 'Meier GmbH', kundennummer: 'K-2', kundenart: null,
  address: 'Hauptstraße 1, 1010 Wien', contactName: '', email: 'office@meier.at', vatId: 'ATU12345678',
  notes: 'Zahlt immer pünktlich', active: true,
};

const NULL_ZAHLEN = {
  baustellen: 0, angebote: 0, rechnungen: 0, scheine: 0, wartungen: 0, termine: 0, eingaenge: 0,
  beteiligungen: 0, uidPruefungen: 0, verlauf: 0, beteiligungenDoppelt: 0,
};
const NULL_NAMEN = { baustellen: 0, angebote: 0, rechnungen: 0, scheine: 0, wartungen: 0 };

function vorschau(rest: Partial<ZusammenfuehrenVorschau> = {}): ZusammenfuehrenVorschau {
  return { bleibt, geht, zahlen: NULL_ZAHLEN, ueberNamen: NULL_NAMEN, nameEindeutig: true, stand: 's', ...rest };
}

describe('Stammfelder beim Zusammenführen', () => {
  it('zur Wahl steht nur, was sich unterscheidet — gleiche Anschrift nicht', () => {
    expect(unterschiede(bleibt, geht)).toEqual([
      'name', 'kundennummer', 'kundenart', 'vat_id', 'contact_name', 'email', 'notes',
    ]);
  });

  it('vorbelegt gewinnt der bleibende Kunde — außer er hat dort nichts; zwei Notizen bleiben beide', () => {
    expect(vorgabeWahl(bleibt, geht)).toEqual({
      name: 'bleibt', kundennummer: 'bleibt', kundenart: 'bleibt', vat_id: 'geht', contact_name: 'bleibt',
      email: 'geht', notes: 'beide',
    });
  });

  it('der Wert danach ist der gewählte; „beide“ hängt die Notiz der Dublette an', () => {
    const wahl = vorgabeWahl(bleibt, geht);
    expect(wertDanach('email', bleibt, geht, wahl)).toBe('office@meier.at');
    expect(wertDanach('name', bleibt, geht, wahl)).toBe('Maier GmbH');
    expect(wertDanach('notes', bleibt, geht, wahl)).toBe('Schlüssel beim Hausmeister\n\nZahlt immer pünktlich');
  });

  it('eine Privatperson mit UID-Nummer weist schon die Ansicht ab — wie die Datenbank', () => {
    const privat = { ...bleibt, kundenart: 'privat' as const };
    expect(wahlFehler(privat, geht, { vat_id: 'geht' })).toMatch(/Privatperson hat keine UID/);
    expect(wahlFehler(privat, geht, { vat_id: 'geht', kundenart: 'geht' })).toBeNull();
    // Bleibt gleich: ohne UID keine Einwände.
    expect(wahlFehler(privat, geht, { vat_id: 'bleibt' })).toBeNull();
  });
});

describe('Was wandert und was gesagt wird', () => {
  it('je Bereich eine Zeile, nur was es gibt, in Ein- und Mehrzahl', () => {
    expect(wandertZeilen({ ...NULL_ZAHLEN, baustellen: 3, rechnungen: 1, beteiligungen: 2, verlauf: 7 })).toEqual([
      '3 Baustellen', '1 Rechnung', '2 Beteiligungen an Liegenschaften', '7 Einträge im Verlauf',
    ]);
  });

  it('sagt, dass ausgestellte Belege ihren Text behalten, und nennt den Wechsel der Kundennummer für die Kanzlei', () => {
    const s = hinweise(vorschau({ zahlen: { ...NULL_ZAHLEN, rechnungen: 2 } }), { kundennummer: 'geht' });
    expect(s[0]).toMatch(/behalten Name und Anschrift/);
    expect(s.join(' ')).toMatch(/künftig unter Kundennummer K-2, nicht mehr unter K-1/);
  });

  it('Altbelege mit dem Namen der Dublette: wandern mit — oder bleiben, wenn der Name mehrdeutig ist', () => {
    const mit = hinweise(vorschau({ ueberNamen: { ...NULL_NAMEN, baustellen: 2, rechnungen: 1 } }), {});
    expect(mit.join(' ')).toMatch(/2 Baustellen und 1 Rechnung ohne Kundenverknüpfung, die den Namen „Meier GmbH“ tragen/);
    const ohne = hinweise(vorschau({ nameEindeutig: false, ueberNamen: { ...NULL_NAMEN, baustellen: 2 } }), {});
    expect(ohne.join(' ')).toMatch(/den auch ein anderer Kunde trägt — sie bleiben, wie sie sind/);
  });

  it('bleibt gleich: ohne Belege und mit gleicher Kundennummer gibt es nichts zu sagen', () => {
    const gleich = { ...geht, kundennummer: 'K-1' };
    expect(hinweise(vorschau({ geht: gleich }), {})).toEqual([]);
  });
});

describe('Der Verlauf nach dem Zusammenführen', () => {
  const zeile = (aenderungen: Record<string, unknown>): ObjektVerlaufZeile => ({
    quelle: 'journal', id: 'j1', objektart: 'kunde', objektId: 'k1', art: 'geaendert', aenderungen,
    am: Date.parse('2026-11-17T10:00:00Z'), vonName: 'Chefin',
  } as ObjektVerlaufZeile);

  it('nennt den Vorgang, die Dublette und was mitkam — statt „Angabe … geändert“', () => {
    const e = verlaufEintrag(zeile({
      zusammengefuehrt: {
        alt: { id: 'k2', name: 'Meier GmbH', kundennummer: 'K-2', anschrift: 'Nebengasse 2, 1020 Wien', uid: null },
        neu: { zahlen: { baustellen: 2, rechnungen: 1, verlauf: 4 }, ueber_namen: { baustellen: 1 } },
      },
    }));
    expect(e.titel).toBe('Kunden zusammengeführt von Chefin');
    expect(e.zeilen).toEqual([
      'Hierher zusammengeführt: „Meier GmbH“ (Nr. K-2)',
      'Dessen Anschrift Nebengasse 2, 1020 Wien',
      'Mitgekommen: 3 Baustellen, 1 Rechnung',
    ]);
  });

  it('nach der Löschung des Kunden (DSGVO) nur noch, dass die Angaben gelöscht sind', () => {
    expect(verlaufEintrag(zeile({ zusammengefuehrt: { entfernt: true } })).zeilen).toEqual(['Angaben mit den Kundendaten gelöscht']);
  });

  it('bleibt gleich: eine gewöhnliche Änderung am Kunden', () => {
    const e = verlaufEintrag(zeile({ name: { alt: 'Meier', neu: 'Maier' } }));
    expect(e.titel).toBe('Geändert von Chefin');
    expect(e.zeilen).toEqual(['Name Meier → Maier']);
  });
});
