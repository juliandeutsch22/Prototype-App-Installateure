import { describe, it, expect, vi, beforeEach } from 'vitest';

/*
 * DAS GERÄT BLEIBT ANGEMELDET — UND „MEIN KONTO“ SAGT DIE WAHRHEIT (E69,
 * 09.11.2026: „Push-Benachrichtigungen für Nachrichten funktionieren immer
 * noch nicht“).
 *
 * Vorher meldete das Abmelden aus der App das Gerät ab, und beim nächsten
 * Anmelden meldete es niemand wieder an. „Mein Konto“ zeigte trotzdem
 * „angemeldet“, weil es nur die Erlaubnis des Browsers ansah. Jetzt gleicht
 * der Start ab, und der Zustand ist die Anmeldung beim Server.
 *
 * Gegenprobe: mit `lib/push.ts` vor E69 sind „nach Ab- und Anmelden“, „anderes
 * Konto“, „Server hat es abgeräumt“ und „Zustand ohne Anmeldung“ rot.
 */
let zeichen = 'zeichen-1';
let abo: object | null = {};
const getToken = vi.fn(async () => zeichen);
// Wie Firebase: das Abmelden kündigt das Abonnement.
const deleteToken = vi.fn(async () => { abo = null; return true; });
let server: Record<string, string[]> = {};
const addPushToken = vi.fn(async (_f: string, uid: string, t: string) => {
  for (const k of Object.keys(server)) server[k] = server[k].filter((x) => x !== t);
  server[uid] = [...(server[uid] ?? []), t];
});
const removePushToken = vi.fn(async (uid: string, t: string) => {
  server[uid] = (server[uid] ?? []).filter((x) => x !== t);
});
const probeSenden = vi.fn();

vi.mock('firebase/messaging', () => ({
  getMessaging: () => ({}),
  getToken: () => getToken(),
  deleteToken: () => deleteToken(),
  isSupported: async () => true,
}));
vi.mock('@/lib/firebase', () => ({ firebaseApp: () => ({}), istEingerichtet: () => true }));
vi.mock('@/lib/db/prefs', () => ({
  addPushToken: (f: string, u: string, t: string) => addPushToken(f, u, t),
  removePushToken: (u: string, t: string) => removePushToken(u, t),
  getPrefs: async (uid: string) => ({ pushTokens: server[uid] ?? [] }),
}));
vi.mock('@/lib/db/pushProbe', () => ({ probeSenden: (t: string) => probeSenden(t) }));

vi.stubEnv('VITE_FIREBASE_VAPID_KEY', 'vapid');
const registrierung = { pushManager: { getSubscription: async () => abo } };
Object.defineProperty(navigator, 'serviceWorker', {
  value: { ready: Promise.resolve(registrierung), getRegistration: async () => registrierung },
  configurable: true,
});
Object.defineProperty(globalThis, 'Notification', {
  value: { permission: 'granted', requestPermission: async () => 'granted' },
  configurable: true,
});

const { enablePush, disablePush, pushAbgleichen, getPushState, pushProbe } = await import('@/lib/push');

beforeEach(() => {
  localStorage.clear();
  zeichen = 'zeichen-1';
  server = {};
  abo = {};
  for (const f of [getToken, deleteToken, addPushToken, removePushToken, probeSenden]) f.mockClear();
});

describe('Nach dem Abmelden', () => {
  it('nach Ab- und Anmelden wird das Gerät beim Start wieder angemeldet', async () => {
    await enablePush('perl', 'ich');
    expect(server.ich).toEqual(['zeichen-1']);
    await disablePush('ich');
    // Abgemeldet für die Person — sonst bekäme der Nächste am Gerät ihre Meldungen.
    expect(server.ich).toEqual([]);
    expect(deleteToken).not.toHaveBeenCalled();
    expect(await getPushState('ich')).toBe('aus');

    await pushAbgleichen('perl', 'ich');
    expect(server.ich).toEqual(['zeichen-1']);
    expect(await getPushState('ich')).toBe('bereit');
  });

  it('meldet sich danach ein anderes Konto an, bekommt es die Meldungen dieses Geräts', async () => {
    await enablePush('perl', 'vorher');
    await disablePush('vorher');
    await pushAbgleichen('perl', 'nachher');
    expect(server).toEqual({ vorher: [], nachher: ['zeichen-1'] });
  });

  it('wer „Auf diesem Gerät abschalten“ gewählt hat, wird nicht still wieder angemeldet', async () => {
    await enablePush('perl', 'ich');
    await disablePush('ich', true);
    expect(deleteToken).toHaveBeenCalled();
    getToken.mockClear();
    await pushAbgleichen('perl', 'ich');
    await pushAbgleichen('perl', 'andere');
    expect(getToken).not.toHaveBeenCalled();
    expect(server.ich).toEqual([]);
    expect(server.andere).toBeUndefined();
  });

  it('ohne Abonnement legt das Abmelden keines an', async () => {
    abo = null;
    await disablePush('ich');
    expect(getToken).not.toHaveBeenCalled();
  });
});

describe('Abgleich beim Start', () => {
  it('ein erneuertes Zeichen wird angemeldet, das alte abgemeldet', async () => {
    await enablePush('perl', 'ich');
    zeichen = 'zeichen-2';
    await pushAbgleichen('perl', 'ich');
    expect(server.ich).toEqual(['zeichen-2']);
  });

  it('hat der Server das Zeichen abgeräumt, wird es wieder angemeldet', async () => {
    await enablePush('perl', 'ich');
    server.ich = [];
    await pushAbgleichen('perl', 'ich');
    expect(server.ich).toEqual(['zeichen-1']);
  });

  it('gleich geblieben und bekannt: nichts geschrieben', async () => {
    await enablePush('perl', 'ich');
    addPushToken.mockClear();
    await pushAbgleichen('perl', 'ich');
    expect(addPushToken).not.toHaveBeenCalled();
    expect(removePushToken).not.toHaveBeenCalled();
  });

  it('Geräte von vorher: übernommen, wenn der Server das bestehende Zeichen für die Person kennt', async () => {
    server.ich = ['zeichen-1'];
    await pushAbgleichen('perl', 'ich');
    expect(localStorage.getItem('senklot.pushAn')).toBe('1');
    expect(localStorage.getItem('senklot.pushZeichen.ich')).toBe('zeichen-1');
    expect(addPushToken).not.toHaveBeenCalled();
  });

  it('Geräte von vorher ohne Anmeldung (früher abgeschaltet) bleiben aus', async () => {
    server.ich = ['fremd'];
    await pushAbgleichen('perl', 'ich');
    abo = null;
    await pushAbgleichen('perl', 'ich');
    expect(addPushToken).not.toHaveBeenCalled();
    expect(localStorage.getItem('senklot.pushAn')).toBeNull();
  });

  it('nichts ohne Erlaubnis des Browsers', async () => {
    await enablePush('perl', 'ich');
    server.ich = [];
    Object.defineProperty(globalThis, 'Notification', { value: { permission: 'default' }, configurable: true });
    try {
      await pushAbgleichen('perl', 'ich');
      expect(server.ich).toEqual([]);
      expect(await getPushState('ich')).toBe('aus');
    } finally {
      Object.defineProperty(globalThis, 'Notification', {
        value: { permission: 'granted', requestPermission: async () => 'granted' }, configurable: true,
      });
    }
  });
});

describe('Zustand in „Mein Konto“', () => {
  it('„bereit“ nur, wenn der Server das Zeichen dieses Geräts für die Person kennt', async () => {
    expect(await getPushState('ich')).toBe('aus');
    await enablePush('perl', 'ich');
    expect(await getPushState('ich')).toBe('bereit');
    server.ich = [];
    expect(await getPushState('ich')).toBe('aus');
    server.ich = ['zeichen-1'];
    abo = null;
    expect(await getPushState('ich')).toBe('aus');
  });
});

describe('Probemeldung', () => {
  it('geht an das Zeichen dieses Geräts', async () => {
    await enablePush('perl', 'ich');
    probeSenden.mockResolvedValue({ ergebnis: 'gesendet' });
    expect(await pushProbe('perl', 'ich')).toEqual({ art: 'gesendet' });
    expect(probeSenden).toHaveBeenCalledWith('zeichen-1');
  });

  it('kennt Google das Gerät nicht mehr, wird es frisch angemeldet und die Probe wiederholt', async () => {
    await enablePush('perl', 'ich');
    probeSenden.mockResolvedValueOnce({ ergebnis: 'abgemeldet', code: 'messaging/registration-token-not-registered' });
    probeSenden.mockResolvedValueOnce({ ergebnis: 'gesendet' });
    server.ich = [];
    zeichen = 'zeichen-frisch';
    expect(await pushProbe('perl', 'ich')).toEqual({ art: 'neu-angemeldet' });
    expect(deleteToken).toHaveBeenCalled();
    expect(probeSenden).toHaveBeenLastCalledWith('zeichen-frisch');
    expect(server.ich).toEqual(['zeichen-frisch']);
  });

  it('eine Ablehnung nennt Googles Code', async () => {
    await enablePush('perl', 'ich');
    probeSenden.mockResolvedValue({ ergebnis: 'abgelehnt', code: 'messaging/third_party_auth_error' });
    expect(await pushProbe('perl', 'ich')).toEqual({ art: 'abgelehnt', code: 'messaging/third_party_auth_error' });
  });
});
