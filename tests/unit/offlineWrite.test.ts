import { describe, it, expect, afterEach, vi } from 'vitest';
import { writeWithOfflineNotice, queuedMessage } from '@/lib/offlineWrite';

/**
 * `navigator` gibt es in der Node-Umgebung von Vitest nicht immer; die Hülle
 * fragt es deshalb defensiv ab. Hier wird es gesetzt und danach wieder
 * entfernt, damit kein Test den nächsten beeinflusst.
 */
function setzeVerbindung(online: boolean | undefined) {
  if (online === undefined) {
    // @ts-expect-error absichtlich entfernt, um den Fall ohne navigator zu prüfen
    delete globalThis.navigator;
    return;
  }
  Object.defineProperty(globalThis, 'navigator', {
    value: { onLine: online },
    configurable: true,
    writable: true,
  });
}

const urspruenglich = Object.getOwnPropertyDescriptor(globalThis, 'navigator');

afterEach(() => {
  if (urspruenglich) Object.defineProperty(globalThis, 'navigator', urspruenglich);
  else setzeVerbindung(undefined);
  vi.useRealTimers();
});

describe('Schreiben mit Offline-Rueckmeldung', () => {
  it('meldet Bestaetigung, wenn der Server antwortet', async () => {
    setzeVerbindung(true);
    await expect(writeWithOfflineNotice(Promise.resolve('ok'))).resolves.toBe('confirmed');
  });

  it('meldet ohne Verbindung SOFORT vorgemerkt, ohne zu warten', async () => {
    // Der eigentliche Punkt: offline loest Firestore das Versprechen nie auf.
    // Wuerde hier gewartet, drehte sich der Knopf im Keller endlos.
    setzeVerbindung(false);
    const nie = new Promise<void>(() => undefined);
    const start = Date.now();
    await expect(writeWithOfflineNotice(nie, 5000)).resolves.toBe('queued');
    expect(Date.now() - start).toBeLessThan(500);
  });

  it('wartet online weiter, auch wenn es laenger dauert als die Frist', async () => {
    // "Vorgemerkt" zu melden, wo gleich ein echter Fehler kommt, waere
    // schlimmer als eine Sekunde Geduld.
    setzeVerbindung(true);
    const langsam = new Promise((r) => setTimeout(() => r('ok'), 60));
    await expect(writeWithOfflineNotice(langsam, 10)).resolves.toBe('confirmed');
  });

  it('reicht einen Fehler durch, statt ihn als vorgemerkt auszugeben', async () => {
    setzeVerbindung(true);
    await expect(
      writeWithOfflineNotice(Promise.reject(new Error('Zugriff verweigert'))),
    ).rejects.toThrow('Zugriff verweigert');
  });

  it('meldet vorgemerkt, wenn die Verbindung waehrend des Schreibens abreisst', async () => {
    setzeVerbindung(true);
    const nie = new Promise<void>(() => undefined);
    const lauf = writeWithOfflineNotice(nie, 20);
    setTimeout(() => setzeVerbindung(false), 5);
    await expect(lauf).resolves.toBe('queued');
  });

  it('kommt ohne navigator zurecht', async () => {
    // Serverseitiges Rendern oder eine aeltere Umgebung darf nicht abstuerzen.
    setzeVerbindung(undefined);
    await expect(writeWithOfflineNotice(Promise.resolve('ok'))).resolves.toBe('confirmed');
  });
});

describe('Meldungstext', () => {
  it('sagt, dass automatisch gesendet wird', () => {
    // Ohne diesen Zusatz tippt der Monteur ein zweites Mal.
    expect(queuedMessage('Zeit gebucht')).toBe(
      'Zeit gebucht — ohne Verbindung gespeichert, wird automatisch gesendet.',
    );
  });
});
