import { describe, it, expect, vi, afterEach } from 'vitest';
import { mitFrist, mitFristOder, FristAbgelaufen } from '@/lib/frist';

/**
 * Die Frist ist die Antwort auf zwei gemeldete Fehler mit derselben Ursache:
 * „der Schein lädt ewig" und „auf dem iPhone lädt es manchmal gar nicht".
 *
 * Firestore-Abfragen und Cloud-Function-Aufrufe haben KEINE Zeitgrenze. Sie
 * werfen keinen Fehler und brechen nicht ab — sie warten. Sitzt der Client
 * auf einer toten Verbindung, ohne es schon gemerkt zu haben, wartet der
 * Aufrufer unbegrenzt, und der Benutzer sieht einen Ladebalken ohne Ende.
 */

afterEach(() => {
  vi.useRealTimers();
});

describe('Frist', () => {
  it('gibt das Ergebnis durch, wenn es rechtzeitig da ist', async () => {
    await expect(mitFrist(Promise.resolve('da'), 1000)).resolves.toBe('da');
  });

  it('reicht einen echten Fehler unveraendert weiter', async () => {
    // Wichtig fuer die Aufrufstelle: sie muss „kein Recht" von „keine
    // Antwort" unterscheiden koennen — das eine ist ein Programmfehler, das
    // andere schlechter Empfang.
    const eigen = new Error('permission-denied');
    await expect(mitFrist(Promise.reject(eigen), 1000)).rejects.toBe(eigen);
  });

  it('bricht ab, wenn nichts kommt', async () => {
    vi.useFakeTimers();
    const niemals = new Promise<string>(() => {});
    const lauf = mitFrist(niemals, 8000);
    // Ein Fangnetz sofort anhängen: sonst meldet Node einen unbehandelten
    // Fehler, bevor `rejects` unten überhaupt zum Zug kommt.
    const ergebnis = lauf.catch((e) => e);
    await vi.advanceTimersByTimeAsync(8000);
    expect(await ergebnis).toBeInstanceOf(FristAbgelaufen);
  });

  it('haelt den Ablauf nicht laenger auf als noetig', async () => {
    /**
     * Ohne Aufräumen des Zeitgebers bliebe nach jedem Aufruf ein Timer bis
     * zum Ende der Frist stehen. Bei einer Liste mit vielen Zeilen summiert
     * sich das — und in Tests hängt der Prozess danach.
     */
    vi.useFakeTimers();
    await mitFrist(Promise.resolve(1), 60_000);
    expect(vi.getTimerCount()).toBe(0);
  });
});

describe('Frist mit Ausweichweg', () => {
  it('nimmt den Ausweich, wenn die Zeit ablaeuft', async () => {
    vi.useFakeTimers();
    const lauf = mitFristOder(
      new Promise<string>(() => {}),
      () => Promise.resolve('aus dem Speicher'),
      8000,
    );
    await vi.advanceTimersByTimeAsync(8000);
    await expect(lauf).resolves.toBe('aus dem Speicher');
  });

  it('nimmt ihn NICHT bei einem echten Fehler', async () => {
    /**
     * Der Unterschied, auf den es ankommt. „Keine Antwort" heißt: nimm den
     * letzten bekannten Stand. „Zugriff verweigert" heißt: hier stimmt etwas
     * nicht — das darf nicht stillschweigend durch alte Daten ersetzt
     * werden, sonst arbeitet jemand mit einem Stand weiter, den er gar nicht
     * mehr sehen dürfte.
     */
    const ausweich = vi.fn(() => Promise.resolve('alt'));
    await expect(
      mitFristOder(Promise.reject(new Error('permission-denied')), ausweich, 1000),
    ).rejects.toThrow('permission-denied');
    expect(ausweich).not.toHaveBeenCalled();
  });

  it('reicht den Fehler des Ausweichs durch, wenn auch der nichts hat', async () => {
    // Erste Anmeldung auf einem Geraet, kein Empfang: dann liegt auch nichts
    // im Zwischenspeicher. Die App muss das sagen, nicht weiterdrehen.
    vi.useFakeTimers();
    const lauf = mitFristOder(
      new Promise<string>(() => {}),
      () => Promise.reject(new Error('nichts gespeichert')),
      8000,
    );
    const ergebnis = lauf.catch((e: Error) => e.message);
    await vi.advanceTimersByTimeAsync(8000);
    expect(await ergebnis).toBe('nichts gespeichert');
  });
});
