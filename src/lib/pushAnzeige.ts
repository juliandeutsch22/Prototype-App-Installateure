/**
 * WIE EINE PUSH-MELDUNG ERSCHEINT — für den Service Worker (App im
 * Hintergrund, `public/sw.js`) und für die offene App (`lib/push.ts`)
 * dieselbe Form. Der Worker kann keine Module laden und trägt die Form
 * deshalb noch einmal selbst; `swPush.test.ts` hält beide gleich.
 */
export interface PushDaten {
  title?: string;
  body?: string;
  link?: string;
  tag?: string;
}

/**
 * `renotify` (09.11.2026: „Nachrichten senden keine Push-Benachrichtigungen“):
 * dieselbe Kennung je Gespräch ersetzt die vorige Meldung, statt dass sich
 * zwanzig stapeln — ohne `renotify` aber STILL, ohne Ton und Vibration. Die
 * zweite Nachricht im selben Gespräch meldete sich damit nicht mehr.
 */
export function meldungAnzeige(d: PushDaten | undefined): { titel: string; optionen: NotificationOptions & { renotify: boolean } } {
  return {
    titel: d?.title || 'Senklot',
    optionen: {
      body: d?.body || '',
      icon: '/marke/icon-192.png',
      badge: '/marke/badge-96.png',
      tag: d?.tag || 'perl-allgemein',
      renotify: true,
      data: { link: d?.link || '/' },
    },
  };
}

/**
 * Bei offener App: zeigen — außer man steht schon dort, wohin die Meldung
 * führt (etwa im Gespräch, in dem die Nachricht gerade erscheint).
 */
export function imVordergrundZeigen(d: PushDaten | undefined, pfad: string): boolean {
  return !(d?.link && d.link === pfad);
}
