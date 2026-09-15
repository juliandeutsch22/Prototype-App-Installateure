/**
 * Ein abgerissenes Live-Abonnement baut sich wieder auf.
 *
 * WARUM DAS EINE PRÜFUNG BRAUCHT, und zwar genau diese. Das Abonnement hängt
 * an einer WebSocket-Verbindung. Schickt das Telefon die App in den
 * Hintergrund — Anruf, Bildschirmsperre, ein Blick in die Karten-App —,
 * schliesst das Betriebssystem sie. Beim Zurückkommen meldet der Kanal
 * `CHANNEL_ERROR`.
 *
 * Das war vorher ein roter Kasten, auf JEDER Ansicht mit Live-Daten. Auf
 * einer Baustelle heisst das: einmal weggesehen, und die App sagt „Das hat
 * nicht geklappt" — obwohl nichts kaputt ist und die Daten stimmen. Firestore
 * hat diesen Wiederaufbau selbst erledigt; unter Postgres steht er in
 * `abonnieren`.
 *
 * GEPRÜFT WIRD MIT EINEM GESTELLTEN CLIENT, nicht gegen den Stapel: ein
 * echter Verbindungsabbruch lässt sich von aussen nicht herbeiführen, ohne
 * das Netz abzuschalten. Der Rückruf, den Supabase bei einem Abbruch aufruft,
 * ist dagegen genau die Naht, um die es geht.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import { abonnieren } from '@/lib/db/pg/kern';

/** Ein Kanal, dessen Zustand die Prüfung selbst setzt. */
interface Kanal {
  melde: (status: string) => void;
}

function falscherClient() {
  const kanaele: Kanal[] = [];
  let entfernt = 0;

  const client = {
    channel: () => {
      const kanal = {
        on: () => kanal,
        subscribe: (cb: (status: string) => void) => {
          kanaele.push({ melde: cb });
          return kanal;
        },
      };
      return kanal;
    },
    removeChannel: () => { entfernt += 1; return Promise.resolve('ok'); },
    /*
      `abfragen` baut darauf auf; die Kette muss nur „leere Liste" liefern.

      JEDE METHODE, DIE `abfragen` RUFT, GEHÖRT HIERHER — und dieser Nachbau
      ist schon einmal hinterhergehinkt: als das Blättern dazukam, fehlten
      `order` und `range`, und der Lauf scheiterte an
      „b.order is not a function". Das ist der Preis eines nachgebauten
      Baukastens; die Alternative wäre, den Wiederaufbau der Live-Verbindung
      gegen eine echte Datenbank zu prüfen, und dafür braucht er gestellte
      Uhren.
    */
    from: () => {
      const bauer = {
        select: () => bauer,
        eq: () => bauer,
        order: () => bauer,
        range: () => bauer,
        limit: () => bauer,
        then: (aufl: (w: { data: unknown[]; error: null }) => unknown) =>
          Promise.resolve({ data: [], error: null }).then(aufl),
      };
      return bauer;
    },
  } as unknown as SupabaseClient;

  return { client, kanaele, entfernteKanaele: () => entfernt };
}

beforeEach(() => { vi.useFakeTimers(); });
afterEach(() => { vi.useRealTimers(); });

describe('abonnieren: ein Abbruch ist kein Fehler', () => {
  it('meldet CHANNEL_ERROR nicht, sondern verbindet neu', async () => {
    const { client, kanaele } = falscherClient();
    const fehler: Error[] = [];
    const stopp = abonnieren('time_entries', 'perl', () => {}, (e) => fehler.push(e), {}, client);

    expect(kanaele).toHaveLength(1);
    kanaele[0].melde('CHANNEL_ERROR');

    // Nichts gemeldet — und nach der ersten Wartezeit ein neuer Kanal.
    expect(fehler).toEqual([]);
    await vi.advanceTimersByTimeAsync(1100);
    expect(kanaele).toHaveLength(2);

    stopp();
  });

  it('gibt nach mehreren vergeblichen Anläufen doch Bescheid', async () => {
    /*
      Irgendwann ist es kein Hintergrundwechsel mehr, sondern eine Störung.
      Dann muss der Hinweis kommen — sonst zeigt die App stillschweigend
      veraltete Zahlen, und das ist schlimmer als ein roter Kasten.
    */
    const { client, kanaele } = falscherClient();
    const fehler: Error[] = [];
    const stopp = abonnieren('time_entries', 'perl', () => {}, (e) => fehler.push(e), {}, client);

    // Fünf Abstände sind hinterlegt; der sechste Abbruch meldet.
    for (const ms of [0, 1100, 2100, 4100, 8100, 15100]) {
      await vi.advanceTimersByTimeAsync(ms);
      kanaele[kanaele.length - 1].melde('CHANNEL_ERROR');
    }

    expect(fehler).toHaveLength(1);
    expect(fehler[0].message).toContain('Live-Verbindung');
    expect(fehler[0].message).toContain('veraltet');

    stopp();
  });

  it('setzt die Wartezeit zurück, sobald es wieder steht', async () => {
    const { client, kanaele } = falscherClient();
    const fehler: Error[] = [];
    const stopp = abonnieren('time_entries', 'perl', () => {}, (e) => fehler.push(e), {}, client);

    for (const ms of [0, 1100, 2100]) {
      await vi.advanceTimersByTimeAsync(ms);
      kanaele[kanaele.length - 1].melde('CHANNEL_ERROR');
    }
    await vi.advanceTimersByTimeAsync(4100);
    kanaele[kanaele.length - 1].melde('SUBSCRIBED');
    await vi.advanceTimersByTimeAsync(10);

    // Nach einem geglückten Aufbau zählt es wieder von vorn — sonst wäre die
    // App nach einem langen Arbeitstag mit vielen Wechseln bei fünfzehn
    // Sekunden Wartezeit angelangt und fühlte sich zäh an.
    const vorher = kanaele.length;
    kanaele[kanaele.length - 1].melde('CHANNEL_ERROR');
    expect(fehler).toEqual([]);
    await vi.advanceTimersByTimeAsync(1100);
    expect(kanaele).toHaveLength(vorher + 1);

    stopp();
  });

  it('und nach dem Abmelden wird nichts mehr aufgebaut', async () => {
    const { client, kanaele } = falscherClient();
    const fehler: Error[] = [];
    const stopp = abonnieren('time_entries', 'perl', () => {}, (e) => fehler.push(e), {}, client);

    stopp();
    /*
      `CLOSED` kommt beim eigenen Abmelden. Das darf keinen neuen Kanal
      auslösen — und auch keine Meldung, und zwar auch dann nicht, wenn es
      mehrfach kommt: eine Ansicht, die gerade verlassen wurde, hat kein
      Recht mehr, dem Nutzer etwas auf den Bildschirm zu schreiben. Sechsmal,
      weil die Meldung erst nach der letzten Wartezeit fällig wäre.
    */
    for (let i = 0; i < 6; i += 1) kanaele[0].melde('CLOSED');
    await vi.advanceTimersByTimeAsync(20000);

    expect(kanaele).toHaveLength(1);
    expect(fehler).toEqual([]);
  });
});
