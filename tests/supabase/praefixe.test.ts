/**
 * Die Vorsätze in der Datenbank — Form, Rolle und der Zähler für Baustellen.
 *
 * WAS HIER WIRKLICH AUF DEM PRÜFSTAND STEHT, ist nicht das Speichern eines
 * Textes. Es sind drei Grenzen, und jede einzelne fällt im Betrieb erst weit
 * entfernt auf:
 *
 *   FORM   Der Vorsatz landet im Dateinamen des Rechnungs-PDFs und in der
 *          CSV für den Steuerberater. Ein Leerzeichen darin fällt dort auf.
 *   ROLLE  Wer ihn ändert, ändert die Nummer jeder künftigen Rechnung.
 *   ZÄHLER Zwei gleichzeitige Anlagen dürfen nicht dieselbe Nummer ziehen.
 */
import { describe, it, expect, beforeAll } from 'vitest';
import { admin, betriebAnlegen, konto, type Konto } from './helfer';

const BETRIEB = 'praefix-b';

let chef: Konto;
let buch: Konto;
let leiter: Konto;
let anton: Konto;

beforeAll(async () => {
  await betriebAnlegen(BETRIEB);
  chef = await konto(BETRIEB, 'Geschäftsführung', 'chef');
  buch = await konto(BETRIEB, 'Buchhaltung', 'buch');
  leiter = await konto(BETRIEB, 'Projektleiter', 'leiter');
  anton = await konto(BETRIEB, 'Mitarbeiter', 'anton');
}, 180_000);

describe('Was als Vorsatz in die Spalte darf', () => {
  it('nimmt an, was die Oberfläche durchlässt', async () => {
    const { error } = await admin.from('companies')
      .update({
        praefix_rechnung: 'RE', praefix_angebot: 'AN',
        praefix_baustelle: 'B', praefix_kennzeichen: 'WZ',
      })
      .eq('id', BETRIEB);
    expect(error).toBeNull();
  });

  it('nimmt LEER an — „ausdrücklich kein Vorsatz"', async () => {
    // Ein Betrieb, der ohne Vorsatz zählt („2026-1001"), soll das können.
    const { error } = await admin.from('companies')
      .update({ praefix_rechnung: '' }).eq('id', BETRIEB);
    expect(error).toBeNull();
    await admin.from('companies').update({ praefix_rechnung: 'RE' }).eq('id', BETRIEB);
  });

  it('nimmt NULL an — „noch nicht festgelegt"', async () => {
    /*
      DER UNTERSCHIED ZU LEER IST NICHT AKADEMISCH. `null` fällt auf die
      Vorgabe zurück, leer bleibt leer. Ohne ihn käme ein Betrieb seinen
      Vorsatz nie los.
    */
    const { error } = await admin.from('companies')
      .update({ praefix_kennzeichen: null }).eq('id', BETRIEB);
    expect(error).toBeNull();
  });

  it('weist ab, was in einen Dateinamen nicht gehört', async () => {
    for (const schlecht of ['R E', 'RÄ', 're', 'ABCDEFG', 'RE/2026']) {
      const { error } = await admin.from('companies')
        .update({ praefix_rechnung: schlecht }).eq('id', BETRIEB);
      expect(error, `„${schlecht}" hätte abgewiesen werden müssen`).not.toBeNull();
    }
    await admin.from('companies').update({ praefix_rechnung: 'RE' }).eq('id', BETRIEB);
  });
});

describe('Wer den Vorsatz ändern darf', () => {
  it('die Geschäftsführung', async () => {
    const { error } = await chef.client.from('companies')
      .update({ praefix_rechnung: 'R' }).eq('id', BETRIEB);
    expect(error).toBeNull();

    const { data } = await chef.client.from('companies')
      .select('praefix_rechnung').eq('id', BETRIEB).single();
    expect(data?.praefix_rechnung).toBe('R');
    await admin.from('companies').update({ praefix_rechnung: 'RE' }).eq('id', BETRIEB);
  });

  it('die Buchhaltung NICHT — sie stellt Rechnungen, sie richtet den Betrieb nicht ein', async () => {
    /*
      DIE RICHTLINIE `companies_aendern` TRÄGT DAS SCHON, und genau deshalb
      steht hier keine eigene Regel je Spalte: eine zweite Wahrheit über
      dieselbe Frage läuft irgendwann auseinander. Geprüft wird das ERGEBNIS.

      Der Zeilenschutz antwortet dabei nicht mit einem Fehler, sondern mit
      „keine Zeile geändert" — eine Zeile, die man nicht schreiben darf, ist
      von einer nicht vorhandenen nicht zu unterscheiden.
    */
    await buch.client.from('companies').update({ praefix_rechnung: 'XX' }).eq('id', BETRIEB);

    const { data } = await admin.from('companies')
      .select('praefix_rechnung').eq('id', BETRIEB).single();
    expect(data?.praefix_rechnung).toBe('RE');
  });

  it('der Monteur erst recht nicht', async () => {
    await anton.client.from('companies').update({ praefix_rechnung: 'YY' }).eq('id', BETRIEB);

    const { data } = await admin.from('companies')
      .select('praefix_rechnung').eq('id', BETRIEB).single();
    expect(data?.praefix_rechnung).toBe('RE');
  });
});

describe('Der Zähler für Baustellennummern', () => {
  /** Eine Nummer ziehen — so, wie es die Ansicht tut. */
  async function ziehen(k: Konto, seed = 0) {
    return k.client.rpc('naechste_nummer', {
      p_art: 'projects', p_jahr: 2026, p_seed: seed, p_wunsch: null,
    });
  }

  it('gibt es überhaupt — die Prüfregel der Tabelle liess ihn vorher nicht zu', async () => {
    /*
      `number_counters.art` kannte nur `invoices` und `quotes`. Ohne die
      erweiterte Prüfregel scheiterte der erste Versuch an der TABELLE statt
      an der Rolle — und die Meldung nennte den falschen Grund.
    */
    const { data, error } = await ziehen(chef);
    expect(error).toBeNull();
    expect(Number(data)).toBe(1);
  });

  it('zählt hoch und vergibt keine Nummer zweimal', async () => {
    const a = await ziehen(chef);
    const b = await ziehen(chef);
    expect(Number(b.data)).toBe(Number(a.data) + 1);
  });

  it('springt über eine Nummer, die schon jemand von Hand vergeben hat (Launch-Check, K6)', async () => {
    const vorher = Number((await ziehen(chef)).data);
    const vonHand = `B-2026-${String(vorher + 1).padStart(4, '0')}`;
    const { error } = await admin.from('projects').insert({
      company_id: BETRIEB, project_number: vonHand, customer_name: 'Bauträger', status: 'Aktiv',
    });
    expect(error).toBeNull();
    expect(Number((await ziehen(chef)).data)).toBe(vorher + 2);
  });

  it('die Projektleitung darf — sie legt Baustellen an', async () => {
    const { error } = await ziehen(leiter);
    expect(error).toBeNull();
  });

  it('die Buchhaltung nicht — sie legt keine Baustellen an', async () => {
    const { error } = await ziehen(buch);
    expect(error).not.toBeNull();
    expect(error?.message).toContain('Baustellennummern');
  });

  it('der Monteur nicht', async () => {
    const { error } = await ziehen(anton);
    expect(error).not.toBeNull();
  });

  it('der Altbestand zählt beim ALLERERSTEN Mal — danach führt der Zähler', async () => {
    /*
      Ein Betrieb, der seine Baustellen bisher von Hand nummeriert hat, steht
      womöglich schon bei 47. Finge der Zähler bei 1 an, vergäbe er
      siebenundvierzig Nummern, die es längst gibt — und die eindeutige
      Regel auf `projects` wiese jede davon ab.

      Der Stand zählt nur, solange es die Zeile noch nicht gibt: sonst könnte
      ein später geladener, unvollständiger Bestand den Zähler zurückdrehen.
      Dieser Betrieb hat schon gezogen — ein hoher Stand ändert also nichts.
      Ein zweiter Betrieb zeigt die andere Hälfte.
     */
    const vorher = Number((await ziehen(chef)).data);
    const mitStand = Number((await ziehen(chef, 9000)).data);
    expect(mitStand).toBe(vorher + 1);

    /*
      SEIT DEM LAUNCH-CHECK (25.09.2026, K6) liest die Datenbank den Bestand
      selbst, und nur Nummern im Schema des Jahres. „PR-187" — eine von Hand
      vergebene — hob den Zähler vorher auf 188.
    */
    const FRISCH = 'praefix-neu';
    await betriebAnlegen(FRISCH);
    const neuerChef = await konto(FRISCH, 'Geschäftsführung', 'neu');
    const { error: angelegt } = await admin.from('projects').insert([
      { company_id: FRISCH, project_number: 'B-2026-0047', customer_name: 'A', status: 'Aktiv' },
      { company_id: FRISCH, project_number: 'PR-187', customer_name: 'B', status: 'Aktiv' },
      { company_id: FRISCH, project_number: 'B-2025-0900', customer_name: 'C', status: 'Aktiv' },
    ]);
    expect(angelegt).toBeNull();
    const vorschau = await neuerChef.client.rpc('naechste_nummern', { p_jahr: 2026 });
    expect(vorschau.data).toContainEqual({ art: 'projects', naechste: 48 });
    const { data } = await neuerChef.client.rpc('naechste_nummer', {
      p_art: 'projects', p_jahr: 2026, p_seed: 9000, p_wunsch: null,
    });
    expect(Number(data)).toBe(48);
  }, 120_000);
});
