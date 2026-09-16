/*
  MIT BROWSER-UMGEBUNG, und das ist keine Bequemlichkeit: der Wiederaufbau
  hängt an `document.visibilityState` und an `visibilitychange`. Ohne
  `document` fiele genau der Zweig aus der Prüfung, um den es hier geht —
  und zwar lautlos, weil `kanalHalten` ohne Browser „sichtbar" annimmt.
*/
// @vitest-environment jsdom

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
import { verbindungSteht, verbindungZuruecksetzen } from '@/lib/liveVerbindung';

/**
 * Den Tab in den Hintergrund schicken und wieder hervorholen.
 *
 * `visibilityState` ist nur lesbar; jsdom lässt es über den Prototyp setzen.
 * Das Ereignis muss von Hand kommen — der Browser feuert es, hier tut es die
 * Prüfung.
 */
function sichtbarkeit(wert: 'visible' | 'hidden'): void {
  Object.defineProperty(document, 'visibilityState', { value: wert, configurable: true });
  document.dispatchEvent(new Event('visibilitychange'));
}

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

/**
 * Ein Client, dessen `removeChannel` den Status-Rückruf SYNCHRON noch einmal
 * auslöst — genau so, wie es die echte Bibliothek tut.
 *
 * Das ist keine Bosheit des Nachbaus, sondern das gemessene Verhalten:
 * `removeChannel` meldet den Kanal ab, und das Abmelden meldet `CLOSED` an
 * denselben Rückruf, aus dem es gerade aufgerufen wurde.
 */
function clientDerBeimAbmeldenMeldet() {
  const kanaele: Kanal[] = [];
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
    removeChannel: () => {
      kanaele[kanaele.length - 1]?.melde('CLOSED');
      return Promise.resolve('ok');
    },
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
  return { client, kanaele };
}

beforeEach(() => {
  vi.useFakeTimers();
  verbindungZuruecksetzen();
  sichtbarkeit('visible');
});
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
      veraltete Zahlen.

      GEMELDET WIRD NICHT MEHR AN DIE ANSICHT. `onError` ersetzte dort den
      ganzen Inhalt und ging nie wieder weg; der Vorbehalt steht jetzt in
      `liveVerbindung` und lässt sich zurücknehmen. Dass er NICHT über
      `onError` läuft, ist hier mitgeprüft: sonst stünde beides da.
    */
    const { client, kanaele } = falscherClient();
    const fehler: Error[] = [];
    const stopp = abonnieren('time_entries', 'perl', () => {}, (e) => fehler.push(e), {}, client);

    // Fünf Abstände sind hinterlegt; der sechste Abbruch meldet.
    for (const ms of [0, 1100, 2100, 4100, 8100, 15100]) {
      await vi.advanceTimersByTimeAsync(ms);
      kanaele[kanaele.length - 1].melde('CHANNEL_ERROR');
    }

    expect(verbindungSteht()).toBe(false);
    expect(fehler).toEqual([]);

    stopp();
  });

  it('zählt die Leiter in WARTEZEIT, nicht in Rückmeldungen', async () => {
    /*
      DER EIGENTLICHE GRUND FÜR DIE MELDUNG AUS DEM BETRIEB — und er wurde
      erst im echten Browser sichtbar. Ein sterbender Kanal ruft seinen
      Rückruf nicht einmal, sondern mehrfach in einem Atemzug:
      `CHANNEL_ERROR`, dann `CLOSED`, dann noch einmal beim nächsten
      vergeblichen Anlauf des darunterliegenden Sockets.

      Gezählt wurde je Rückruf. Die Leiter von dreissig Sekunden war damit in
      unter einer Sekunde abgelaufen, und der Hinweis stand da, BEVOR der
      erste Wiederaufbau überhaupt stattgefunden hatte — gemessen: nach 4,7
      Sekunden statt nach dreissig. „Kurz den Tab gewechselt, sofort die
      Meldung" ist genau das.
    */
    const { client, kanaele } = falscherClient();
    const stopp = abonnieren('time_entries', 'perl', () => {}, () => {}, {}, client);

    // Zwanzig Rufe desselben Kanals, ohne dass auch nur eine Wartezeit
    // vergeht.
    for (let i = 0; i < 20; i += 1) kanaele[0].melde('CHANNEL_ERROR');

    expect(verbindungSteht()).toBe(true);
    // Und geplant ist genau EIN Wiederaufbau, nicht zwanzig.
    await vi.advanceTimersByTimeAsync(1100);
    expect(kanaele).toHaveLength(2);

    stopp();
  });

  it('läuft nicht in sich selbst, wenn das Abmelden gleich wieder meldet', () => {
    /*
      DIE URSACHE DER MELDUNG AUS DEM BETRIEB, im echten Browser gefunden.

      `removeChannel` meldet den Kanal ab — und das Abmelden ruft denselben
      Rückruf noch einmal auf, synchron, mitten aus der Behandlung heraus.
      Die Behandlung lief damit in sich selbst: fünf Ebenen tief, und die
      unterste meldete den Vorbehalt. Die Leiter von dreissig Sekunden war
      nach ZWEI ZEHNTELSEKUNDEN abgelaufen — gemessen, nicht geschätzt.

      Die Sperre muss deshalb VOR dem Aufräumen stehen, nicht danach.
      „Kurz den Tab gewechselt, sofort die Meldung" ist genau dieser Ablauf.
    */
    const { client, kanaele } = clientDerBeimAbmeldenMeldet();
    const stopp = abonnieren('time_entries', 'perl', () => {}, () => {}, {}, client);

    kanaele[0].melde('CHANNEL_ERROR');

    expect(verbindungSteht()).toBe(true);
    // Und nur EIN Wiederaufbau ist eingeplant, nicht fünf.
    expect(kanaele).toHaveLength(1);

    stopp();
  });

  it('nimmt den Vorbehalt zurück, sobald der Kanal wieder steht', async () => {
    /*
      DER FEHLER, DEN DER BETRIEB GEMELDET HAT. Einmal kurz in einen anderen
      Browser-Tab gewechselt, und die Meldung stand bis zum Neuladen da —
      obwohl die Verbindung längst wieder hielt. Ein Hinweis, der nicht
      verschwinden kann, ist keine Auskunft mehr, sondern Lärm.
    */
    const { client, kanaele } = falscherClient();
    const stopp = abonnieren('time_entries', 'perl', () => {}, () => {}, {}, client);

    for (const ms of [0, 1100, 2100, 4100, 8100, 15100]) {
      await vi.advanceTimersByTimeAsync(ms);
      kanaele[kanaele.length - 1].melde('CHANNEL_ERROR');
    }
    expect(verbindungSteht()).toBe(false);

    // Zurück aus dem Hintergrund: ein neuer Kanal, und der kommt durch.
    sichtbarkeit('visible');
    kanaele[kanaele.length - 1].melde('SUBSCRIBED');
    await vi.advanceTimersByTimeAsync(10);

    expect(verbindungSteht()).toBe(true);
    stopp();
  });

  it('zählt im Hintergrund gar nicht erst mit', async () => {
    /*
      DAS IST DIE URSACHE DES GEMELDETEN FEHLERS, nicht bloss sein Symptom.
      Liegt der Tab im Hintergrund, drosselt der Browser die Zeitgeber, der
      Herzschlag der Verbindung bleibt aus und der Server legt auf. Die
      Leiter der Wartezeiten lief dann ungesehen ab — und der Nutzer fand
      beim Zurückkommen eine Meldung über etwas vor, das in seiner
      Abwesenheit geschah.

      Im Hintergrund wird deshalb weder gezählt noch neu aufgebaut: es gibt
      nichts anzuzeigen, und ein Wiederaufbau käme ohnehin nicht durch.
    */
    const { client, kanaele } = falscherClient();
    const stopp = abonnieren('time_entries', 'perl', () => {}, () => {}, {}, client);

    sichtbarkeit('hidden');
    for (let i = 0; i < 10; i += 1) {
      kanaele[kanaele.length - 1].melde('CLOSED');
      await vi.advanceTimersByTimeAsync(20000);
    }

    expect(verbindungSteht()).toBe(true);
    expect(kanaele).toHaveLength(1);

    // Und beim Zurückkommen wird sofort neu verbunden, nicht erst nach einer
    // Wartezeit.
    sichtbarkeit('visible');
    expect(kanaele).toHaveLength(2);

    stopp();
  });

  it('räumt den Vorbehalt weg, wenn die Ansicht verlassen wird', async () => {
    /*
      Ein Abonnement, das beim Verlassen der Ansicht abgeräumt wird, nimmt
      sein Urteil mit. Ohne das bliebe das Band stehen und spräche über
      etwas, das es nicht mehr gibt.
    */
    const { client, kanaele } = falscherClient();
    const stopp = abonnieren('time_entries', 'perl', () => {}, () => {}, {}, client);

    for (const ms of [0, 1100, 2100, 4100, 8100, 15100]) {
      await vi.advanceTimersByTimeAsync(ms);
      kanaele[kanaele.length - 1].melde('CHANNEL_ERROR');
    }
    expect(verbindungSteht()).toBe(false);

    stopp();
    expect(verbindungSteht()).toBe(true);
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
