/**
 * Die Taille der neuen Datenschicht, gegen die echte Datenbank.
 *
 * Der interessante Teil ist das Abonnement. Firestore lieferte den ersten
 * Bestand aus demselben Abo; hier sind Abonnieren und Holen zwei Vorgänge,
 * und dazwischen ist eine Lücke. Der letzte Test dieser Datei zwingt genau
 * diese Lücke auf und prüft, dass nichts hineinfällt.
 */
import { describe, it, expect, beforeAll } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import { admin, betriebAnlegen, konto, type Konto } from './helfer';
import {
  abfragen, anlegen, anlegenMitKennung, aendern, loeschen, abonnieren, NACHFASSEN_MS,
} from '@/lib/db/pg/kern';

let chef: Konto;

beforeAll(async () => {
  await betriebAnlegen('kern-a');
  await betriebAnlegen('kern-b');
  chef = await konto('kern-a', 'Geschäftsführung', 'chef');
}, 120_000);

const warte = (ms: number) => new Promise((r) => setTimeout(r, ms));

const kunde = (name: string) => ({ name, active: true });

describe('Abfragen', () => {
  it('holt nur den eigenen Betrieb', async () => {
    await anlegen('customers', 'kern-a', kunde('Berger'), chef.client);
    await admin.from('customers').insert({ company_id: 'kern-b', name: 'Fremd GmbH' });

    const meine = await abfragen<{ name: string }>('customers', 'kern-a', {}, chef.client);
    expect(meine.map((k) => k.name)).toEqual(['Berger']);
  });

  it('rechnet die Feldnamen in beide Richtungen um', async () => {
    const id = await anlegen('projects', 'kern-a', {
      projectNumber: '2026-050', customerName: 'Berger', status: 'Aktiv',
      estimatedHours: 40,
    }, chef.client);

    const [b] = await abfragen<{ projectNumber: string; estimatedHours: number }>(
      'projects', 'kern-a', { wo: [{ art: 'gleich', feld: 'id', wert: id }] }, chef.client,
    );
    expect(b.projectNumber).toBe('2026-050');
    expect(Number(b.estimatedHours)).toBe(40);
  });

  it('filtert, sortiert und begrenzt', async () => {
    for (const nr of ['2026-061', '2026-062', '2026-063']) {
      await anlegen('projects', 'kern-a', {
        projectNumber: nr, customerName: 'Reihe', status: 'Aktiv',
      }, chef.client);
    }
    const zeilen = await abfragen<{ projectNumber: string }>('projects', 'kern-a', {
      wo: [{ art: 'gleich', feld: 'customerName', wert: 'Reihe' }],
      sortiere: { feld: 'projectNumber', absteigend: true },
      grenze: 2,
    }, chef.client);
    expect(zeilen.map((z) => z.projectNumber)).toEqual(['2026-063', '2026-062']);
  });

  it('kennt die Bedingungen ab, bis, in und ungleich', async () => {
    const alle = await abfragen<{ projectNumber: string }>('projects', 'kern-a', {
      wo: [
        { art: 'ab', feld: 'projectNumber', wert: '2026-061' },
        { art: 'bis', feld: 'projectNumber', wert: '2026-062' },
      ],
      sortiere: { feld: 'projectNumber' },
    }, chef.client);
    expect(alle.map((z) => z.projectNumber)).toEqual(['2026-061', '2026-062']);

    const drin = await abfragen<{ projectNumber: string }>('projects', 'kern-a', {
      wo: [{ art: 'in', feld: 'projectNumber', werte: ['2026-050', '2026-063'] }],
      sortiere: { feld: 'projectNumber' },
    }, chef.client);
    expect(drin.map((z) => z.projectNumber)).toEqual(['2026-050', '2026-063']);

    const ohne = await abfragen<{ customerName: string }>('projects', 'kern-a', {
      wo: [{ art: 'ungleich', feld: 'customerName', wert: 'Reihe' }],
    }, chef.client);
    expect(ohne.every((z) => z.customerName !== 'Reihe')).toBe(true);
  });

  it('weist einen unbrauchbaren Feldnamen ab, statt ihn durchzureichen', async () => {
    await expect(abfragen('projects', 'kern-a', {
      wo: [{ art: 'gleich', feld: 'name; drop table projects', wert: 1 }],
    }, chef.client)).rejects.toThrow('Unbrauchbarer Feldname');
  });
});

describe('Schreiben', () => {
  it('setzt den Betrieb aus dem Kontext, nicht aus den Daten', async () => {
    const id = await anlegen('customers', 'kern-a',
      { name: 'Mit Schmuggel', companyId: 'kern-b' }, chef.client);
    const [k] = await abfragen<{ companyId: string }>('customers', 'kern-a',
      { wo: [{ art: 'gleich', feld: 'id', wert: id }] }, chef.client);
    expect(k.companyId).toBe('kern-a');
  });

  it('legt mit einer Kennung vom Gerät an — und zweimal landet einmal', async () => {
    const id = crypto.randomUUID();
    const daten = {
      userId: chef.uid, date: '2026-02-02', status: 'Anwesend',
      startTime: '07:00', endTime: '16:00', breakDuration: 30,
    };
    await anlegenMitKennung('time_entries', 'kern-a', id, daten, chef.client);
    await anlegenMitKennung('time_entries', 'kern-a', id, daten, chef.client);

    const zeilen = await abfragen('time_entries', 'kern-a',
      { wo: [{ art: 'gleich', feld: 'id', wert: id }] }, chef.client);
    expect(zeilen).toHaveLength(1);
  });

  it('ändert, ohne den Betrieb mitzuändern', async () => {
    const id = await anlegen('customers', 'kern-a', kunde('Umzugskandidat'), chef.client);
    // companyId in den Daten wird stillschweigend verworfen — nicht, weil es
    // harmlos wäre, sondern weil der Aufrufer es nie mitschicken sollte und
    // der Zeilenschutz es ohnehin abwiese.
    await aendern('customers', id, { notes: 'geändert', companyId: 'kern-b' }, chef.client);
    const [k] = await abfragen<{ companyId: string; notes: string }>('customers', 'kern-a',
      { wo: [{ art: 'gleich', feld: 'id', wert: id }] }, chef.client);
    expect(k).toMatchObject({ companyId: 'kern-a', notes: 'geändert' });
  });

  it('unterscheidet „nicht mitgeschickt" von „ausdrücklich geleert"', async () => {
    const id = await anlegen('customers', 'kern-a',
      { name: 'Mit Notiz', notes: 'steht da' }, chef.client);

    // Ein Aufruf, in dem jedes Feld `undefined` ist, schreibt nichts — und
    // scheitert auch nicht daran, dass er nichts getroffen hat.
    await aendern('customers', id, { email: undefined }, chef.client);
    let [k] = await abfragen<{ notes?: string }>('customers', 'kern-a',
      { wo: [{ art: 'gleich', feld: 'id', wert: id }] }, chef.client);
    expect(k.notes).toBe('steht da');

    /*
      GELEERT HEISST IN DER DATENBANK `null` UND IN DER APP „nicht da".

      Das ist kein Widerspruch, sondern die Grenze zwischen beiden Welten.
      Firestore kannte nur „Feld nicht da"; die App-Typen sagen deshalb
      `notes?: string` und nicht `string | null`. Käme `null` durch, stünde es
      in jedem gelieferten Objekt und liefe irgendwo in ein `.trim()`.

      Geprüft wird beides: dass die Spalte wirklich geleert wurde, und dass
      die Datenschicht sie als abwesend meldet.
    */
    await aendern('customers', id, { notes: null }, chef.client);
    [k] = await abfragen<{ notes?: string }>('customers', 'kern-a',
      { wo: [{ art: 'gleich', feld: 'id', wert: id }] }, chef.client);
    expect('notes' in k).toBe(false);

    const { data: roh } = await admin.from('customers').select('notes').eq('id', id).single();
    expect(roh!.notes).toBeNull();
  });

  it('löscht', async () => {
    const id = await anlegen('customers', 'kern-a', kunde('Zum Löschen'), chef.client);
    await loeschen('customers', id, chef.client);
    expect(await abfragen('customers', 'kern-a',
      { wo: [{ art: 'gleich', feld: 'id', wert: id }] }, chef.client)).toEqual([]);
  });

  it('ein Schreibvorgang, der nichts trifft, ist ein Fehler', async () => {
    /*
      DER UNTERSCHIED, DER BEIM UMZUG AM LEICHTESTEN DURCHRUTSCHT. Firestore
      warf, wenn ein Dokument fehlte oder die Regeln es verwehrten. Der
      Zeilenschutz antwortet anders: eine Zeile, die man nicht anfassen darf,
      ist für die Anweisung schlicht nicht da — PostgREST meldet dann keinen
      Fehler, sondern null geänderte Zeilen.

      Draussen hiesse das: die Verwaltung ändert die Wochenstunden eines
      Mitarbeiters, bekommt „gespeichert" und sieht beim nächsten Laden den
      alten Wert. Kein Fehler, keine Meldung, kein Hinweis.
    */
    const erfunden = crypto.randomUUID();
    await expect(aendern('customers', erfunden, { notes: 'x' }, chef.client)).rejects.toThrow();
    await expect(loeschen('customers', erfunden, chef.client)).rejects.toThrow();

    // Und ebenso, wenn die Zeile einem anderen Betrieb gehört.
    const { data: fremd } = await admin.from('customers')
      .select('id').eq('company_id', 'kern-b').limit(1).single();
    await expect(
      aendern('customers', fremd!.id as string, { notes: 'x' }, chef.client),
    ).rejects.toThrow();
  });
});

describe('Abonnieren', () => {
  it('liefert den Bestand und danach jede Änderung', async () => {
    await anlegen('materials', 'kern-a', { name: 'Rohr A', stock: 5 }, chef.client);

    const stände: Array<Array<{ name: string }>> = [];
    const ab = abonnieren<{ name: string }>('materials', 'kern-a',
      (z) => stände.push(z), (e) => { throw e; }, { sortiere: { feld: 'name' } }, chef.client);

    for (let i = 0; i < 60 && stände.length === 0; i += 1) await warte(50);
    expect(stände[0].map((m) => m.name)).toEqual(['Rohr A']);

    await anlegen('materials', 'kern-a', { name: 'Rohr B', stock: 3 }, chef.client);
    /*
      GEWARTET WIRD AUF DEN INHALT, NICHT AUF DIE ZAHL DER MELDUNGEN.

      Das Nachfassen nach `NACHFASSEN_MS` meldet ohnehin einen zweiten Stand —
      und wenn es zufällig vor dem Schreiben lief, enthält der nur „Rohr A".
      Eine Schleife, die bis „zwei Meldungen" wartet, hört dann genau einen
      Wimpernschlag zu früh auf und prüft den falschen Stand. Genau so hat
      diese Prüfung geflattert.
    */
    const hatB = () => stände[stände.length - 1].some((m) => m.name === 'Rohr B');
    for (let i = 0; i < 80 && !hatB(); i += 1) await warte(50);
    expect(stände[stände.length - 1].map((m) => m.name)).toEqual(['Rohr A', 'Rohr B']);

    ab();
  });

  it('meldet nichts aus einem fremden Betrieb', async () => {
    const gesehen: Array<Array<{ name: string }>> = [];
    const ab = abonnieren<{ name: string }>('materials', 'kern-a',
      (z) => gesehen.push(z), (e) => { throw e; }, {}, chef.client);
    for (let i = 0; i < 60 && gesehen.length === 0; i += 1) await warte(50);

    await admin.from('materials').insert({ company_id: 'kern-b', name: 'Fremdes Rohr', stock: 1 });
    await warte(800);

    expect(gesehen[gesehen.length - 1].some((m) => m.name === 'Fremdes Rohr')).toBe(false);
    ab();
  });

  it('holt den Bestand ERST, nachdem das Abonnement steht', async () => {
    /*
     * DIE REIHENFOLGE IST DIE ENTSCHEIDUNG, und nur sie lässt sich sauber
     * prüfen.
     *
     * Wer zuerst holt und dann abonniert, verliert alles, was dazwischen
     * passiert — lautlos. Andersherum deckt das Holen ab, was während der
     * Anlaufzeit des Abonnements noch nicht gemeldet wurde, und der Puffer
     * deckt ab, was zwischen dem Abzug und dem Bereitmelden hereinkommt.
     *
     * Ein Test, der die Lücke künstlich aufreisst, bewiese dagegen nichts:
     * er verlöre die Meldung an die Anlaufzeit des Abonnements und nicht an
     * die Lücke — das war der erste Anlauf hier, und er ist verworfen.
     */
    const verlauf: string[] = [];
    const beobachtet = {
      ...chef.client,
      removeChannel: chef.client.removeChannel.bind(chef.client),
      channel: (name: string) => {
        const k = chef.client.channel(name);
        const echtSubscribe = k.subscribe.bind(k);
        (k as unknown as { subscribe: unknown }).subscribe = (cb: (s: string) => void) =>
          echtSubscribe((status) => {
            if (status === 'SUBSCRIBED') verlauf.push('abonniert');
            cb(status);
          });
        return k;
      },
      from: (tabelle: string) => {
        const bauer = chef.client.from(tabelle);
        const echt = bauer.select.bind(bauer);
        (bauer as unknown as { select: unknown }).select = (...args: unknown[]) => {
          verlauf.push('geholt');
          return (echt as (...a: unknown[]) => unknown)(...args);
        };
        return bauer;
      },
    } as unknown as SupabaseClient;

    const stände: Array<unknown[]> = [];
    const ab = abonnieren('follow_ups', 'kern-a',
      (z) => stände.push(z), (e) => { throw e; }, {}, beobachtet);

    for (let i = 0; i < 80 && stände.length === 0; i += 1) await warte(50);
    expect(verlauf).toEqual(['abonniert', 'geholt']);

    // Und danach GENAU EINMAL nachgefasst — siehe Punkt 3 im Kopf von
    // `abonnieren`. Ohne das fehlte manchmal eine Zeile, und zwar lautlos.
    await warte(NACHFASSEN_MS + 600);
    expect(verlauf).toEqual(['abonniert', 'geholt', 'geholt']);
    ab();
  });

  /**
   * Ein gestellter Kanal.
   *
   * Die beiden folgenden Prüfungen betreffen MEINE Ablauflogik — den Puffer
   * und das vollständige Ersetzen des Bestands —, nicht den Meldeweg von
   * Supabase. Über den echten Kanal wären sie von dessen Anlaufzeit abhängig
   * und damit wieder ein Glücksspiel. Hier wird stattdessen der Kanal
   * gestellt: er meldet, was der Test sagt, und wann der Test es sagt.
   */
  function gestellterKanal(client: SupabaseClient, verzoegereHolen = 0) {
    let melde: ((n: unknown) => void) | undefined;
    const kanal = {
      on(_e: string, _o: unknown, cb: (n: unknown) => void) { melde = cb; return kanal; },
      subscribe(cb: (s: string) => void) { queueMicrotask(() => cb('SUBSCRIBED')); return kanal; },
    };
    const gestellt = {
      ...client,
      channel: () => kanal,
      removeChannel: () => {},
      from: (tabelle: string) => {
        const bauer = client.from(tabelle);
        if (!verzoegereHolen) return bauer;
        const echt = bauer.select.bind(bauer);
        (bauer as unknown as { select: unknown }).select = (...args: unknown[]) => {
          const kette = (echt as (...a: unknown[]) => unknown)(...args) as PromiseLike<unknown>;
          // Anfrage SOFORT abschicken, Antwort spät durchreichen — nur so
          // entsteht das Fenster, um das es geht.
          const laufend = Promise.resolve(kette);
          const spaeter = Object.create(kette as object);
          spaeter.then = (auf: (w: unknown) => unknown, ab: (e: unknown) => unknown) =>
            laufend.then((w) => warte(verzoegereHolen).then(() => w)).then(auf, ab);
          return spaeter;
        };
        return bauer;
      },
    } as unknown as SupabaseClient;
    return { gestellt, melden: (n: unknown) => melde?.(n) };
  }

  it('nimmt auf, was während des Holens gemeldet wird', async () => {
    const { gestellt, melden } = gestellterKanal(chef.client, 600);
    const stände: Array<Array<{ title: string }>> = [];
    const ab = abonnieren<{ title: string }>('follow_ups', 'kern-a',
      (z) => stände.push(z), (e) => { throw e; }, {}, gestellt);

    await warte(150);
    melden({
      eventType: 'INSERT',
      new: { id: crypto.randomUUID(), company_id: 'kern-a', title: 'Im Fenster', done: false },
      old: {},
    });

    for (let i = 0; i < 40 && stände.length === 0; i += 1) await warte(50);
    // Sofort da — nicht erst beim Nachfassen.
    expect(stände[0].map((f) => f.title)).toContain('Im Fenster');
    ab();
  });

  it('lässt beim Nachfassen fallen, was es nicht mehr gibt', async () => {
    const id = await anlegen('follow_ups', 'kern-a',
      { title: 'Verschwindet gleich', createdFrom: 'manual' }, chef.client);

    const { gestellt } = gestellterKanal(chef.client);
    const stände: Array<Array<{ title: string }>> = [];
    const ab = abonnieren<{ title: string }>('follow_ups', 'kern-a',
      (z) => stände.push(z), (e) => { throw e; }, {}, gestellt);

    for (let i = 0; i < 40 && stände.length === 0; i += 1) await warte(50);
    expect(stände[0].map((f) => f.title)).toContain('Verschwindet gleich');

    // Gelöscht, ohne dass eine Meldung darüber ankommt — der Kanal ist ja
    // gestellt. Nur das Nachfassen kann das noch bemerken.
    await loeschen('follow_ups', id, chef.client);
    await warte(NACHFASSEN_MS + 600);

    expect(stände[stände.length - 1].map((f) => f.title)).not.toContain('Verschwindet gleich');
    ab();
  });

  it('fasst nach dem Abmelden nicht mehr nach', async () => {
    // Sonst liefe nach jedem Verlassen einer Ansicht noch eine Abfrage los —
    // und bei einem Konto, das sich gerade abgemeldet hat, scheiterte sie.
    const verlauf: string[] = [];
    const beobachtet = {
      ...chef.client,
      channel: chef.client.channel.bind(chef.client),
      removeChannel: chef.client.removeChannel.bind(chef.client),
      from: (tabelle: string) => {
        const bauer = chef.client.from(tabelle);
        const echt = bauer.select.bind(bauer);
        (bauer as unknown as { select: unknown }).select = (...args: unknown[]) => {
          verlauf.push('geholt');
          return (echt as (...a: unknown[]) => unknown)(...args);
        };
        return bauer;
      },
    } as unknown as SupabaseClient;

    const ab = abonnieren('follow_ups', 'kern-a', () => {}, (e) => { throw e; }, {}, beobachtet);
    for (let i = 0; i < 80 && verlauf.length === 0; i += 1) await warte(50);
    ab();
    await warte(NACHFASSEN_MS + 600);
    expect(verlauf).toEqual(['geholt']);
  });

  it('bekommt mit, was kurz nach dem Abonnieren geschrieben wird', async () => {
    // Über welchen Weg die Zeile ankommt — Bestand oder Meldung —, ist dem
    // Aufrufer gleich. Dass sie ankommt, ist der Punkt.
    const stände: Array<Array<{ title: string }>> = [];
    const ab = abonnieren<{ title: string }>('follow_ups', 'kern-a',
      (z) => stände.push(z), (e) => { throw e; }, {}, chef.client);

    await anlegen('follow_ups', 'kern-a',
      { title: 'Gleich nach dem Abonnieren', createdFrom: 'manual' }, chef.client);

    for (let i = 0; i < 100; i += 1) {
      const letzter = stände[stände.length - 1] ?? [];
      if (letzter.some((f) => f.title === 'Gleich nach dem Abonnieren')) break;
      await warte(50);
    }
    expect((stände[stände.length - 1] ?? []).map((f) => f.title))
      .toContain('Gleich nach dem Abonnieren');
    ab();
  });
});
