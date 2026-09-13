/**
 * Die Vorausfüllung des Handwerksscheins — in der Datenbank statt in einer
 * Cloud Function.
 *
 * Zwei Dinge stehen auf dem Prüfstand. Erstens die DATENSCHUTZGRENZE: die
 * Funktion liest die Zeiteinträge der ganzen Mannschaft, der Monteur darf das
 * nicht. Zurück darf deshalb genau der Inhalt des Belegs kommen und nichts
 * daneben — kein fremder Kranken- oder Urlaubstag, keine andere Baustelle,
 * kein anderer Tag, kein anderer Betrieb.
 *
 * Zweitens die FORM: Uhrzeiten als „07:00", nicht „07:00:00", und die
 * Sortierung nach derselben ICU-Tabelle, die der Browser benutzt. Beides
 * steht sichtbar auf einem Beleg, den der Kunde unterschreibt.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { admin, betriebAnlegen, konto, buchung, type Konto } from './helfer';
import { clientEinreichen } from '@/lib/db/pg/kern';

const BETRIEB = 'schein-vor-b';
const TAG = '2026-03-10';

let monteur: Konto;
let kollege: Konto;

beforeAll(async () => {
  await betriebAnlegen(BETRIEB);
  monteur = await konto(BETRIEB, 'Mitarbeiter', 'sv-monteur');
  kollege = await konto(BETRIEB, 'Mitarbeiter', 'sv-kollege');
  clientEinreichen(monteur.client);
}, 120_000);

afterAll(() => clientEinreichen(null));

/*
  EIN FEHLGESCHLAGENES EINFÜGEN DARF NICHT STILL BLEIBEN.

  `supabase-js` wirft nicht, es legt den Fehler in `error` — und ein Test, der
  nur die leere Liste danach prüft, wird grün, weil beide Seiten nichts haben.
  Genau das ist hier einmal passiert.
*/
async function buchen(zeilen: Record<string, unknown>[]): Promise<void> {
  /*
    IM STAPEL GIBT ES KEINEN SPALTENVORGABEWERT.

    PostgREST bildet aus allen Zeilen eines Stapels EINE Spaltenliste: nennt
    eine Zeile `is_helper`, bekommen die anderen dort ausdrücklich `null` —
    und `not null default false` greift nicht mehr. Deshalb steht unten
    überall `is_helper` ausgeschrieben, auch wo `false` gemeint ist.
  */
  const { error } = await admin.from('time_entries').insert(zeilen);
  if (error) throw new Error(`Buchung nicht angelegt: ${error.message}`);
}

async function vorbereiten(k: Konto, baustelle: string, datum = TAG) {
  const { data, error } = await k.client.rpc('schein_vorbereiten', {
    p_baustelle: baustelle, p_datum: datum,
  });
  return { data: data as { zeiten: Array<Record<string, unknown>> } | null, error };
}

describe('Der Schein bekommt die Stunden der ganzen Mannschaft', () => {
  it('auch die des Kollegen, den der Monteur selbst nicht lesen darf', async () => {
    await buchen([
      buchung(monteur, TAG, { project_number: '2026-041', user_name: 'Berger',
        comment: 'Rohrbruch behoben', is_helper: false }),
      buchung(kollege, TAG, { project_number: '2026-041', user_name: 'Auer',
        start_time: '08:00', end_time: '12:00', break_duration: 0, is_helper: true }),
    ]);

    // Was der Monteur direkt fragt: nur die eigene Zeile.
    const { data: direkt } = await monteur.client.from('time_entries')
      .select('user_id').eq('date', TAG);
    expect(direkt!.every((z) => z.user_id === monteur.uid)).toBe(true);

    const { data } = await vorbereiten(monteur, '2026-041');
    expect(data!.zeiten).toHaveLength(2);
    // Auer vor Berger — sortiert wird nach dem Namen, nicht nach dem Einfügen.
    expect(data!.zeiten.map((z) => z.mitarbeiter)).toEqual(['Auer', 'Berger']);
  }, 60_000);

  it('rechnet die Minuten wie die App und schreibt die Uhrzeit wie bisher', async () => {
    const { data } = await vorbereiten(monteur, '2026-041');
    const auer = data!.zeiten.find((z) => z.mitarbeiter === 'Auer')!;
    const berger = data!.zeiten.find((z) => z.mitarbeiter === 'Berger')!;

    expect(auer).toMatchObject({
      datum: TAG, von: '08:00', bis: '12:00', pauseMin: 0, minuten: 240, helfer: true,
    });
    // 07:00–16:00 abzüglich 30 Minuten Pause.
    expect(berger).toMatchObject({
      von: '07:00', bis: '16:00', pauseMin: 30, minuten: 510,
      taetigkeit: 'Rohrbruch behoben', helfer: false,
    });
  }, 30_000);

  it('was leer ist, fehlt — und steht nicht als null da', async () => {
    /*
      Die Cloud Function liess `undefined` weg, und `undefined` überlebt den
      Weg durch JSON nicht: die Ansicht bekam den Schlüssel gar nicht. Stünde
      dort jetzt `null`, prüfte `if (z.von)` zwar weiter richtig — aber alles,
      was die Zeile weiterreicht, trüge ein Feld mit dem Wert null mit sich,
      bis es irgendwo als „null" auf einem Beleg steht.

      Die Spracherfassung bucht so: Dezimalstunden statt Kommen und Gehen.
    */
    const datum = '2026-03-25';
    await buchen([buchung(kollege, datum, {
      project_number: '2026-leer', user_name: 'Sprachbuchung',
      start_time: null, end_time: null, break_duration: 0, hours: 3.5, comment: null,
    })]);

    const zeile = (await vorbereiten(monteur, '2026-leer', datum)).data!.zeiten[0];
    expect(Object.keys(zeile).sort())
      .toEqual(['datum', 'helfer', 'minuten', 'mitarbeiter', 'pauseMin']);
    expect(zeile.minuten).toBe(210);
  }, 30_000);

  it('ein führendes „PR-" aus Altbeständen zählt als dieselbe Baustelle', async () => {
    await buchen([buchung(kollege, TAG, { project_number: 'PR-2026-099', user_name: 'Alt' })]);
    // Gefragt ohne Präfix, gebucht mit — und umgekehrt.
    expect((await vorbereiten(monteur, '2026-099')).data!.zeiten).toHaveLength(1);
    expect((await vorbereiten(monteur, 'pr-2026-099')).data!.zeiten).toHaveLength(1);
  }, 30_000);
});

describe('Was NICHT auf den Beleg kommt', () => {
  it('kein Kranken- oder Urlaubstag — auch nicht der eigene', async () => {
    await buchen([
      buchung(kollege, TAG, { project_number: '2026-041', status: 'Krank',
        user_name: 'Krank-Kollege', start_time: null, end_time: null }),
      buchung(kollege, TAG, { project_number: '2026-041', status: 'Urlaub',
        user_name: 'Urlaub-Kollege', start_time: null, end_time: null }),
    ]);
    const namen = (await vorbereiten(monteur, '2026-041')).data!.zeiten
      .map((z) => z.mitarbeiter);
    expect(namen).toEqual(['Auer', 'Berger']);
  }, 30_000);

  it('kein anderer Tag und keine andere Baustelle', async () => {
    await buchen([
      buchung(kollege, '2026-03-11', { project_number: '2026-041', user_name: 'Tagsdrauf' }),
      buchung(kollege, TAG, { project_number: '2026-042', user_name: 'Nebenan' }),
    ]);
    const namen = (await vorbereiten(monteur, '2026-041')).data!.zeiten
      .map((z) => z.mitarbeiter);
    expect(namen).toEqual(['Auer', 'Berger']);
  }, 30_000);

  it('kein fremder Betrieb', async () => {
    await betriebAnlegen('schein-vor-c');
    const fremd = await konto('schein-vor-c', 'Mitarbeiter', 'sv-fremd');
    await buchen([buchung(fremd, TAG, { project_number: '2026-041', user_name: 'Fremder' })]);
    const namen = (await vorbereiten(monteur, '2026-041')).data!.zeiten
      .map((z) => z.mitarbeiter);
    expect(namen).not.toContain('Fremder');
    // Und der Fremde sieht seinerseits nur seine eigene Zeile.
    expect((await vorbereiten(fremd, '2026-041')).data!.zeiten
      .map((z) => z.mitarbeiter)).toEqual(['Fremder']);
  }, 60_000);

  it('ohne Baustelle gibt es keine Antwort', async () => {
    expect((await vorbereiten(monteur, '   ')).error).not.toBeNull();
  }, 30_000);

  it('eine Baustelle ohne Buchungen ergibt eine leere Liste, keinen Fehler', async () => {
    const { data, error } = await vorbereiten(monteur, '2026-999');
    expect(error).toBeNull();
    expect(data!.zeiten).toEqual([]);
  }, 30_000);
});

describe('Die Sortierung ist dieselbe wie im Browser', () => {
  it('Umlaute stehen bei ihrem Grundbuchstaben, nicht hinter Z', async () => {
    /*
      `localeCompare(…, 'de')` und `collate "de-x-icu"` müssen dieselbe
      Reihenfolge ergeben. Eine ASCII-Sortierung schöbe Öllinger und Zäh ans
      Ende — auf einem unterschriebenen Beleg fällt das auf.
    */
    const namen = ['Zehner', 'Öllinger', 'Ostermann', 'Aigner', 'Ärztin', 'Szabo', 'Zäh'];
    const datum = '2026-03-20';
    await buchen(namen.map((n) => buchung(
      kollege, datum, { project_number: '2026-sort', user_name: n },
    )));

    const ausDb = (await vorbereiten(monteur, '2026-sort', datum)).data!.zeiten
      .map((z) => z.mitarbeiter as string);
    const imBrowser = [...namen].sort((a, b) => a.localeCompare(b, 'de'));

    expect(ausDb).toEqual(imBrowser);
    expect(ausDb.indexOf('Öllinger')).toBeLessThan(ausDb.indexOf('Ostermann'));
  }, 60_000);
});
