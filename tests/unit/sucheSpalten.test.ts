import { describe, it, expect, vi } from 'vitest';

vi.mock('@/lib/supabase', () => ({ supabaseClient: () => ({}) }));
const { spaltenFuerSuche } = await import('@/lib/db/pg/kern');

/*
  Integration Welle 3: PostgREST sortiert das Ergebnis einer Funktion nur nach
  Spalten, die es ausgibt. Die Suche über `suche_<tabelle>` nimmt deshalb die
  Spalte der Reihenfolge und den Zweitschlüssel in die Auswahl auf.
  Gegenprobe: `sucheNummern.test.ts` (Angebote nach Nummer) ist ohne das rot.
*/
describe('Spalten einer Suche über die Datenbankfunktion', () => {
  it('nimmt die Spalte der Reihenfolge und die Kennung dazu', () => {
    expect(spaltenFuerSuche({ spalten: 'quote_number,status', sortiere: { feld: 'createdAt', absteigend: true } }, 'quotes'))
      .toBe('quote_number,status,created_at,id');
  });

  it('bleibt gleich: was schon dasteht, kommt nicht doppelt; `*` und ohne Auswahl bleiben', () => {
    expect(spaltenFuerSuche({ spalten: 'id,created_at', sortiere: { feld: 'createdAt' } }, 'quotes')).toBe('id,created_at');
    expect(spaltenFuerSuche({ spalten: '*', sortiere: { feld: 'createdAt' } }, 'quotes')).toBe('*');
    expect(spaltenFuerSuche({ sortiere: { feld: 'createdAt' } }, 'quotes')).toBeUndefined();
  });

  it('kennt die Zweitschlüssel ohne Kennung', () => {
    expect(spaltenFuerSuche({ spalten: 'menge' }, 'lagerbestaende')).toBe('menge,lagerort_id,material_id');
  });
});
