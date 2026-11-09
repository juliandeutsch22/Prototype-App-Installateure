import { describe, it, expect, vi, beforeEach } from 'vitest';

/*
 * PUSH BEI OFFENER APP UND DAS ZEICHEN DES GERÄTS (09.11.2026: „Nachrichten
 * senden keine Push-Benachrichtigungen“).
 *
 * - Ist die App sichtbar, gibt Firebase die Meldung an die Seite statt an den
 *   Service Worker; die Seite hörte nicht zu, es erschien nichts. Jetzt zeigt
 *   sie sie über den Worker — nur nicht, wenn man schon dort steht.
 * - Firebase erneuert das Zeichen von Zeit zu Zeit; geholt wurde es nur beim
 *   Einschalten. Jetzt beim Start abgeglichen, aber nur, wo Meldungen in der
 *   App eingeschaltet wurden.
 *
 * Gegenprobe: ohne `onMessage` oder ohne den Abgleich ist je eine Prüfung rot.
 */
let zuhoerer: ((p: { data?: Record<string, string> }) => void) | null = null;
let zeichen = 'zeichen-neu';
const getToken = vi.fn(async () => zeichen);
const addPushToken = vi.fn(async () => undefined);
const removePushToken = vi.fn(async () => undefined);
let bekannt: string[] = [];
let angemeldet: object | null = {};
const gezeigt: { titel: string; optionen: NotificationOptions }[] = [];

vi.mock('firebase/messaging', () => ({
  getMessaging: () => ({}),
  getToken: () => getToken(),
  deleteToken: vi.fn(async () => true),
  isSupported: async () => true,
  onMessage: (_m: unknown, h: (p: { data?: Record<string, string> }) => void) => {
    zuhoerer = h;
    return () => { zuhoerer = null; };
  },
}));
vi.mock('@/lib/firebase', () => ({ firebaseApp: () => ({}), istEingerichtet: () => true }));
vi.mock('@/lib/db/prefs', () => ({
  addPushToken: (...a: unknown[]) => addPushToken(...(a as [])),
  removePushToken: (...a: unknown[]) => removePushToken(...(a as [])),
  getPrefs: async () => ({ pushTokens: bekannt }),
}));

vi.stubEnv('VITE_FIREBASE_VAPID_KEY', 'vapid');
const registrierung = {
  showNotification: async (titel: string, optionen: NotificationOptions) => { gezeigt.push({ titel, optionen }); },
  pushManager: { getSubscription: async () => angemeldet },
};
Object.defineProperty(navigator, 'serviceWorker', { value: { ready: Promise.resolve(registrierung) }, configurable: true });
Object.defineProperty(globalThis, 'Notification', { value: { permission: 'granted' }, configurable: true });

const { pushImVordergrund } = await import('@/lib/push');

beforeEach(() => {
  localStorage.clear();
  zuhoerer = null;
  gezeigt.length = 0;
  zeichen = 'zeichen-neu';
  bekannt = [];
  angemeldet = {};
  getToken.mockClear();
  addPushToken.mockClear();
  removePushToken.mockClear();
});

describe('Push bei offener App', () => {
  it('zeigt eine Meldung über den Worker an — mit renotify', async () => {
    await pushImVordergrund('perl', 'ich', () => '/');
    zuhoerer!({ data: { title: 'Max Monteur', body: 'Neue Nachricht', link: '/nachrichten/k1', tag: 'nachricht-k1' } });
    expect(gezeigt).toHaveLength(1);
    expect(gezeigt[0].titel).toBe('Max Monteur');
    expect(gezeigt[0].optionen).toMatchObject({ tag: 'nachricht-k1', renotify: true, data: { link: '/nachrichten/k1' } });
  });

  it('nicht, wenn man schon im Gespräch steht', async () => {
    await pushImVordergrund('perl', 'ich', () => '/nachrichten/k1');
    zuhoerer!({ data: { title: 'Max', link: '/nachrichten/k1', tag: 'nachricht-k1' } });
    expect(gezeigt).toHaveLength(0);
  });
});

describe('Das Zeichen des Geräts', () => {
  it('ein erneuertes Zeichen wird beim Start hinterlegt, das alte abgemeldet', async () => {
    localStorage.setItem('senklot.pushZeichen.ich', 'zeichen-alt');
    await pushImVordergrund('perl', 'ich', () => '/');
    expect(addPushToken).toHaveBeenCalledWith('perl', 'ich', 'zeichen-neu');
    expect(removePushToken).toHaveBeenCalledWith('ich', 'zeichen-alt');
    expect(localStorage.getItem('senklot.pushZeichen.ich')).toBe('zeichen-neu');
  });

  it('gleich geblieben: unverändertes Zeichen — nichts geschrieben', async () => {
    localStorage.setItem('senklot.pushZeichen.ich', 'zeichen-neu');
    await pushImVordergrund('perl', 'ich', () => '/');
    expect(addPushToken).not.toHaveBeenCalled();
    expect(removePushToken).not.toHaveBeenCalled();
  });

  it('wer Meldungen abgeschaltet hat (kein Gerät angemeldet), wird nicht still wieder angemeldet', async () => {
    angemeldet = null;
    await pushImVordergrund('perl', 'ich', () => '/');
    expect(getToken).not.toHaveBeenCalled();
    expect(addPushToken).not.toHaveBeenCalled();
  });

  it('Geräte von vorher: das bestehende Zeichen wird übernommen, wenn der Server es für die Person kennt', async () => {
    bekannt = ['zeichen-neu'];
    await pushImVordergrund('perl', 'ich', () => '/');
    expect(localStorage.getItem('senklot.pushZeichen.ich')).toBe('zeichen-neu');
    expect(addPushToken).not.toHaveBeenCalled();
  });

  it('kennt der Server das Zeichen nicht (etwa eines Vorgängers am Gerät), wird nichts übernommen', async () => {
    bekannt = ['fremd'];
    await pushImVordergrund('perl', 'ich', () => '/');
    expect(localStorage.getItem('senklot.pushZeichen.ich')).toBeNull();
    expect(addPushToken).not.toHaveBeenCalled();
  });
});
