/**
 * Zeitausgleich, Krankmeldung, Betriebsurlaub — gegen die echte Datenbank.
 *
 * WAS HIER AUF DEM SPIEL STEHT, ist das Zeitkonto. Jeder der drei Wege legt
 * Tage an und muss beim Zurücknehmen GENAU diese wieder wegräumen — nie einen
 * von Hand gebuchten Tag daneben. Und wer welchen Grund sieht, ist eine
 * Datenschutzfrage: ein Krankenstand ist ein Gesundheitsdatum.
 *
 * Die Wochen liegen im November 2026: Montag 2.11. bis Freitag 27.11., ohne
 * Feiertag (Allerheiligen ist Sonntag, der 1.11.).
 */
import { describe, it, expect, beforeAll } from 'vitest';
import { admin, betriebAnlegen, buchung, konto, type Konto } from './helfer';

const BETRIEB = 'abwesend-a';

let chef: Konto;
let buch: Konto;
let leitung: Konto;
let monteur: Konto;
let kollegin: Konto;
let ausgeschieden: Konto;

async function eintraege(k: Konto, von: string, bis: string) {
  const { data } = await admin.from('time_entries')
    .select('date, status, start_time, end_time, vacation_id, krankmeldung_id')
    .eq('user_id', k.uid).gte('date', von).lte('date', bis).order('date');
  return data ?? [];
}

async function antrag(k: Konto, felder: Record<string, unknown>): Promise<string> {
  const id = crypto.randomUUID();
  const { error } = await k.client.from('vacations').insert({
    id, company_id: BETRIEB, user_id: k.uid, user_name: 'x', tage: 1, status: 'Beantragt', ...felder,
  });
  if (error) throw new Error(error.message);
  return id;
}

const entscheiden = (id: string, e: string, grund = '') =>
  chef.client.rpc('urlaub_entscheiden', { p_antrag: id, p_entscheidung: e, p_grund: grund });

const krank = (k: Konto, a: { id?: string; user?: string; von: string; bis: string; notiz?: string }) =>
  k.client.rpc('krankmeldung_speichern', {
    p_id: a.id ?? null, p_user: a.user ?? null, p_von: a.von, p_bis: a.bis, p_notiz: a.notiz ?? null,
  });

beforeAll(async () => {
  await betriebAnlegen(BETRIEB, 'Abwesend A');
  chef = await konto(BETRIEB, 'Geschäftsführung', 'abwgf');
  buch = await konto(BETRIEB, 'Buchhaltung', 'abwbu');
  leitung = await konto(BETRIEB, 'Projektleiter', 'abwpl');
  monteur = await konto(BETRIEB, 'Mitarbeiter', 'abwmon');
  kollegin = await konto(BETRIEB, 'Mitarbeiter', 'abwkol');
  ausgeschieden = await konto(BETRIEB, 'Mitarbeiter', 'abwaus', false);
}, 180_000);

describe('Zeitausgleich', () => {
  it('bucht einen genehmigten ZA-Antrag als „Zeitausgleich" — und die Rücknahme nimmt ihn weg', async () => {
    const id = await antrag(monteur, {
      von: '2026-11-05', bis: '2026-11-06', tage: 2, art: 'Zeitausgleich', za_stunden: 16,
    });
    const { data, error } = await entscheiden(id, 'Genehmigt');
    expect(error).toBeNull();
    expect(data).toMatchObject({ angelegt: 2, uebersprungen: 0 });
    expect((await eintraege(monteur, '2026-11-05', '2026-11-06')).map((e) => e.status))
      .toEqual(['Zeitausgleich', 'Zeitausgleich']);

    await entscheiden(id, 'Storniert', 'doch gebraucht');
    expect(await eintraege(monteur, '2026-11-05', '2026-11-06')).toEqual([]);
  });

  it('stundenweise: steht neben gearbeiteter Zeit, mit Von und Bis', async () => {
    await admin.from('time_entries').insert(buchung(monteur, '2026-11-10', {
      start_time: '07:00', end_time: '12:00', break_duration: 0,
    }));
    const id = await antrag(monteur, {
      von: '2026-11-10', bis: '2026-11-10', art: 'Zeitausgleich',
      za_von: '13:00', za_bis: '17:00', za_stunden: 4,
    });
    const { data } = await entscheiden(id, 'Genehmigt');
    expect(data).toMatchObject({ angelegt: 1 });
    const tag = await eintraege(monteur, '2026-11-10', '2026-11-10');
    expect(tag.map((e) => [e.status, e.start_time, e.end_time])).toEqual(
      expect.arrayContaining([
        ['Anwesend', '07:00:00', '12:00:00'],
        ['Zeitausgleich', '13:00:00', '17:00:00'],
      ]),
    );
  });

  it('zählt in der Monatsbilanz null Minuten — der Saldo sinkt über das Soll', async () => {
    const { data } = await admin.from('monthly_stats')
      .select('anwesend_min').eq('user_id', monteur.uid).eq('monat', '2026-11').single();
    // Nur die fünf Stunden Arbeit vom 10.11. — der ZA daneben nicht.
    expect(Number(data?.anwesend_min)).toBe(5 * 60);
  });

  it('stundenweise über mehrere Tage oder rückwärts gibt es nicht', async () => {
    await expect(antrag(monteur, {
      von: '2026-11-11', bis: '2026-11-12', art: 'Zeitausgleich', za_von: '13:00', za_bis: '17:00',
    })).rejects.toThrow(/vacations_za/);
    await expect(antrag(monteur, {
      von: '2026-11-11', bis: '2026-11-11', art: 'Zeitausgleich', za_von: '17:00', za_bis: '13:00',
    })).rejects.toThrow(/vacations_za/);
    await expect(antrag(monteur, {
      von: '2026-11-11', bis: '2026-11-11', art: 'Urlaub', za_stunden: 4,
    })).rejects.toThrow(/vacations_za/);
  });
});

describe('Krankmeldung', () => {
  it('meldet sich der Monteur selbst — nur Arbeitstage, gebuchte Tage bleiben', async () => {
    // Montag gearbeitet und dann heimgegangen: der Tag bleibt, wie er ist.
    await admin.from('time_entries').insert(buchung(monteur, '2026-11-16'));
    const { data, error } = await krank(monteur, { von: '2026-11-16', bis: '2026-11-22' });
    expect(error).toBeNull();
    expect(data).toMatchObject({ angelegt: 4, entfernt: 0, uebersprungen: 1 });
    const tage = await eintraege(monteur, '2026-11-16', '2026-11-22');
    expect(tage.map((e) => [e.date, e.status])).toEqual([
      ['2026-11-16', 'Anwesend'],
      ['2026-11-17', 'Krank'], ['2026-11-18', 'Krank'], ['2026-11-19', 'Krank'], ['2026-11-20', 'Krank'],
    ]);
  });

  it('„wieder gesund ab Donnerstag" räumt die Tage danach weg, „doch länger" legt nach', async () => {
    const { data: m } = await admin.from('krankmeldungen').select('id').eq('user_id', monteur.uid).single();
    const kuerzer = await krank(monteur, { id: m!.id, von: '2026-11-16', bis: '2026-11-18' });
    expect(kuerzer.data).toMatchObject({ entfernt: 2, angelegt: 0 });
    const laenger = await krank(monteur, { id: m!.id, von: '2026-11-16', bis: '2026-11-19' });
    expect(laenger.data).toMatchObject({ entfernt: 0, angelegt: 1 });
    expect((await eintraege(monteur, '2026-11-17', '2026-11-20')).map((e) => e.date))
      .toEqual(['2026-11-17', '2026-11-18', '2026-11-19']);
  });

  it('lehnt eine zweite Meldung über dieselben Tage ab', async () => {
    const { error } = await krank(monteur, { von: '2026-11-19', bis: '2026-11-20' });
    expect(error?.message).toMatch(/Überschneidet sich mit der Krankmeldung vom 16\.11\.2026/);
  });

  it('für jemand anderen meldet nur das Büro', async () => {
    const fremd = await krank(monteur, { user: kollegin.uid, von: '2026-11-23', bis: '2026-11-23' });
    expect(fremd.error?.message).toMatch(/erfasst das Büro/);
    const buero = await krank(buch, { user: kollegin.uid, von: '2026-11-23', bis: '2026-11-24' });
    expect(buero.error).toBeNull();
    expect(buero.data).toMatchObject({ angelegt: 2 });
  });

  it('liest nur die Person selbst und das Büro — nicht Kollegen, nicht die Projektleitung', async () => {
    const lesen = async (k: Konto) =>
      ((await k.client.from('krankmeldungen').select('user_id')).data ?? []).map((z) => z.user_id);
    expect(await lesen(monteur)).toEqual([monteur.uid]);
    expect(await lesen(kollegin)).toEqual([kollegin.uid]);
    expect(await lesen(leitung)).toEqual([]);
    expect((await lesen(buch)).sort()).toEqual([monteur.uid, kollegin.uid].sort());
  });

  it('lässt sich nicht direkt schreiben — nur über die Funktion, die das Zeitkonto mitnimmt', async () => {
    const { error } = await monteur.client.from('krankmeldungen').insert({
      company_id: BETRIEB, user_id: monteur.uid, user_name: 'x', von: '2026-11-25', bis: '2026-11-25',
    });
    expect(error).not.toBeNull();
  });

  it('beim Löschen gehen genau ihre Tage — ein von Hand gebuchter Krank-Tag bleibt', async () => {
    await admin.from('time_entries').insert(buchung(kollegin, '2026-11-25', {
      status: 'Krank', start_time: null, end_time: null, break_duration: 0,
    }));
    const { data: m } = await admin.from('krankmeldungen').select('id').eq('user_id', kollegin.uid).single();
    const fremd = await monteur.client.rpc('krankmeldung_loeschen', { p_id: m!.id });
    expect(fremd.error?.message).toMatch(/löscht das Büro/);

    const { data, error } = await buch.client.rpc('krankmeldung_loeschen', { p_id: m!.id });
    expect(error).toBeNull();
    expect(data).toBe(2);
    expect((await eintraege(kollegin, '2026-11-23', '2026-11-25')).map((e) => e.date)).toEqual(['2026-11-25']);
  });
});

describe('Betriebsurlaub', () => {
  const anlegen = (k: Konto, abbuchen: boolean, von = '2026-12-28', bis = '2026-12-31') =>
    k.client.rpc('betriebsurlaub_anlegen', {
      p_von: von, p_bis: bis, p_bezeichnung: 'Weihnachten', p_abbuchen: abbuchen, p_name: 'Büro',
    });

  it('legt der Monteur nicht an', async () => {
    const { error } = await anlegen(monteur, true);
    expect(error?.message).toMatch(/Buchhaltung, Geschäftsführung oder Administration/);
  });

  it('bucht mit Häkchen jedem aktiven Mitarbeiter Urlaub — gebuchte Tage übersprungen', async () => {
    // Die Kollegin hat am 29.12. schon gearbeitet (Notdienst).
    await admin.from('time_entries').insert(buchung(kollegin, '2026-12-29'));
    const { data, error } = await anlegen(buch, true);
    expect(error).toBeNull();
    // Fünf aktive Konten; der Ausgeschiedene nicht.
    expect(data).toMatchObject({ mitarbeiter: 5, tage: 5 * 4 - 1, uebersprungen: 1 });

    expect((await eintraege(monteur, '2026-12-28', '2026-12-31')).map((e) => e.status))
      .toEqual(['Urlaub', 'Urlaub', 'Urlaub', 'Urlaub']);
    expect(await eintraege(ausgeschieden, '2026-12-28', '2026-12-31')).toEqual([]);

    const { data: v } = await admin.from('vacations')
      .select('tage, status, art').eq('user_id', kollegin.uid).not('betriebsurlaub_id', 'is', null).single();
    // Der übersprungene Tag zählt nicht in den Resturlaub.
    expect(v).toMatchObject({ tage: 3, status: 'Genehmigt', art: 'Urlaub' });
  });

  it('lehnt einen zweiten Betriebsurlaub über dieselben Tage ab', async () => {
    const { error } = await anlegen(chef, false, '2026-12-31', '2027-01-02');
    expect(error?.message).toMatch(/Überschneidet sich mit „Weihnachten"/);
  });

  it('liest jeder im Betrieb', async () => {
    const { data } = await monteur.client.from('betriebsurlaube').select('bezeichnung, von, bis');
    expect(data).toEqual([{ bezeichnung: 'Weihnachten', von: '2026-12-28', bis: '2026-12-31' }]);
  });

  it('niemand schreibt sich den Bezug zum Betriebsurlaub selbst in einen Antrag', async () => {
    const { data: b } = await admin.from('betriebsurlaube').select('id').single();
    await expect(antrag(monteur, { von: '2027-01-11', bis: '2027-01-11', betriebsurlaub_id: b!.id }))
      .rejects.toThrow();
    const eigener = await antrag(monteur, { von: '2027-01-12', bis: '2027-01-12' });
    const { error } = await monteur.client.from('vacations')
      .update({ betriebsurlaub_id: b!.id }).eq('id', eigener);
    expect(error?.message).toMatch(/Bezug zum Betriebsurlaub/);
  });

  it('Löschen nimmt zurück, was er gebucht hat — der eigene Urlaub daneben bleibt', async () => {
    // Die Arbeit der Kollegin am 29.12. stammt nicht vom Betriebsurlaub.
    const { data: b } = await admin.from('betriebsurlaube').select('id').single();
    const fremd = await monteur.client.rpc('betriebsurlaub_loeschen', { p_id: b!.id });
    expect(fremd.error).not.toBeNull();

    const { data, error } = await buch.client.rpc('betriebsurlaub_loeschen', { p_id: b!.id });
    expect(error).toBeNull();
    expect(data).toMatchObject({ tage: 19, mitarbeiter: 5 });
    expect(await eintraege(monteur, '2026-12-28', '2026-12-31')).toEqual([]);
    expect((await eintraege(kollegin, '2026-12-28', '2026-12-31')).map((e) => e.status)).toEqual(['Anwesend']);
    const { count } = await admin.from('vacations').select('id', { count: 'exact', head: true })
      .eq('company_id', BETRIEB).not('betriebsurlaub_id', 'is', null);
    expect(count).toBe(0);
  });

  it('ohne Häkchen wird nichts gebucht', async () => {
    const { data, error } = await anlegen(chef, false);
    expect(error).toBeNull();
    expect(data).toMatchObject({ mitarbeiter: 0, tage: 0 });
    expect(await eintraege(monteur, '2026-12-28', '2026-12-31')).toEqual([]);
  });
});

describe('Wochenplan — wer den Grund sieht', () => {
  const woche = (k: Konto) =>
    k.client.rpc('wochenplan_abwesend', { p_von: '2026-11-16', p_bis: '2026-11-22' });

  beforeAll(async () => {
    await admin.from('companies').update({ wochenplan_fuer_alle: true }).eq('id', BETRIEB);
    const id = await antrag(kollegin, {
      von: '2026-11-18', bis: '2026-11-18', art: 'Zeitausgleich', za_von: '13:00', za_bis: '17:00', za_stunden: 4,
    });
    await entscheiden(id, 'Genehmigt');
  });

  type Zeile = { user_id: string; grund: string | null; zeiten: string | null };
  const von = (rows: unknown, k: Konto) => (rows as Zeile[]).filter((z) => z.user_id === k.uid);

  it('das Büro sieht Krank und ZA', async () => {
    const { data } = await woche(buch);
    expect(von(data, monteur).map((z) => z.grund)).toEqual(['Krank']);
    expect(von(data, kollegin)).toEqual([expect.objectContaining({ grund: 'ZA', zeiten: '13:00–17:00' })]);
  });

  it('die Projektleitung sieht den ZA, beim Krankenstand nur „abwesend"', async () => {
    const { data } = await woche(leitung);
    expect(von(data, monteur).map((z) => z.grund)).toEqual([null]);
    expect(von(data, kollegin).map((z) => z.grund)).toEqual(['ZA']);
  });

  it('Kollegen sehen nie einen Grund — die Uhrzeit schon', async () => {
    const { data } = await woche(kollegin);
    expect((data as Zeile[]).every((z) => z.grund === null)).toBe(true);
    expect(von(data, kollegin)[0].zeiten).toBe('13:00–17:00');
  });
});
