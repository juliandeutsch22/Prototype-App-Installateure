/**
 * Die `in`-Grenze ist nicht weg — sie hat die Form gewechselt.
 *
 * Firestore liess höchstens 30 Werte je `in`-Abfrage zu, und die Module
 * bildeten dafür Blöcke. Beim Umstellen fiel die Blockbildung weg, mit dem
 * Vermerk „hier gibt es diese Grenze nicht". Für Postgres stimmt das. Nur
 * steht zwischen der App und Postgres PostgREST, und dort steht die
 * Werteliste in der ADRESSE — das Gateway weist eine zu lange mit
 * `414 URI too long` ab.
 *
 * WER DAS TRIFFT: jede Abfrage nach dem Muster „Köpfe laden, dann die Zeilen
 * dazu". Ein Monat Handwerksscheine, die Kunden zu dreihundert Baustellen,
 * die Positionen zu einem Stapel Rechnungen. Nicht der Grenzfall, sondern der
 * erste Betrieb mit ordentlich Daten — im Pilotbetrieb mit zehn Zeilen fällt
 * es nie auf.
 *
 * Geprüft wird gegen den ECHTEN Weg. Eine Attrappe würde hier nichts
 * beweisen: die Grenze steht nicht im Code, sondern im Gateway.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { admin, API, ANON, betriebAnlegen, nurStatus } from './helfer';
import { abfragen } from '@/lib/db/pg/kern';

const BETRIEB = 'in-grenze';

/**
 * So viele Zeilen, dass die Adresse ohne Stückelung mit Sicherheit platzt.
 *
 * Gemessen bricht die Annahme bei rund 8140 Zeichen Werteliste ab; eine
 * Kennung wiegt 36 Zeichen plus Komma und Anführungszeichen. 400 Stück sind
 * ungefähr das Doppelte.
 */
const ANZAHL = 400;

const kennung = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const alleKennungen = Array.from({ length: ANZAHL }, (_, i) => kennung(i));

beforeAll(async () => {
  await betriebAnlegen(BETRIEB);
  await admin.from('customers').delete().eq('company_id', BETRIEB);
  // In Blöcken einfügen: der Rumpf einer Anfrage darf zwar lang sein, aber
  // 400 Zeilen auf einmal sind auch dem Gateway zu viel.
  for (let i = 0; i < ANZAHL; i += 100) {
    const teil = alleKennungen.slice(i, i + 100).map((id, k) => ({
      id,
      company_id: BETRIEB,
      name: `Kunde ${i + k}`,
    }));
    const { error } = await admin.from('customers').insert(teil);
    if (error) throw new Error(error.message);
  }
}, 120_000);

afterAll(async () => {
  await admin.from('customers').delete().eq('company_id', BETRIEB);
});

describe('Eine lange Werteliste', () => {
  it('sprengt die Adresse, wenn sie in einem Stück geht', async () => {
    /*
      DIE MESSUNG, AUF DER DIE GRENZE BERUHT. Ohne sie wäre die Stückelung
      Vorsicht ins Blaue — und diese Prüfung bewiese nur, dass zwei Wege
      dasselbe Ergebnis liefern, nicht dass einer davon nötig ist.
    */
    const liste = alleKennungen.join(',');
    const antwort = await fetch(
      `${API}/rest/v1/customers?select=id&id=in.(${liste})`,
      { headers: { apikey: ANON } },
    );
    expect(await nurStatus(antwort)).toBe(414);
  }, 60_000);

  it('kommt gestückelt vollständig zurück', async () => {
    // Mit dem Dienstclient: geprüft wird die Stückelung, nicht der
    // Zeilenschutz — der steht in `tests/supabase/abos.test.ts`.
    const treffer = await abfragen<{ name: string }>(
      'customers',
      BETRIEB,
      { wo: [{ art: 'in', feld: 'id', werte: alleKennungen }] },
      admin,
    );

    expect(treffer).toHaveLength(ANZAHL);
    // Keine Zeile doppelt: ein Block, der sich mit dem nächsten überlappt,
    // brächte dieselbe Zeile zweimal — und eine Summe über Positionen wäre
    // danach falsch, ohne dass eine Liste kürzer aussähe.
    expect(new Set(treffer.map((z) => z.id)).size).toBe(ANZAHL);
  }, 120_000);

  it('bricht laut ab, wenn eine Grenze dazukommt', async () => {
    // Gestückelt brächte jeder Block seine eigenen `grenze` Zeilen mit; die
    // Auswahl wäre eine andere als die gefragte. Lieber laut als fast richtig.
    await expect(
      abfragen(
        'customers',
        BETRIEB,
        { wo: [{ art: 'in', feld: 'id', werte: alleKennungen }], grenze: 10 },
        admin,
      ),
    ).rejects.toThrow(/stückeln/);
  }, 60_000);
});
