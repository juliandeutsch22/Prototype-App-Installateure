import { test, expect, type Page, type CDPSession } from '@playwright/test';
import { MONTEUR } from './aufbau';
import { anmelden } from './helfer';

/**
 * DIE PUSH-MELDUNG IM ECHTEN BROWSER (E69, 09.11.2026: „Push-Benachrichtigungen
 * für Nachrichten funktionieren immer noch nicht“).
 *
 * Angemeldete App, echter `public/sw.js`, und eine Push-Nachricht, wie Google
 * sie zustellt — über die DevTools-Schnittstelle des Browsers
 * (`ServiceWorker.deliverPushMessage`), deshalb nur in Chromium. Was hier
 * nicht geprüft wird, ist die Runde zu Google und das Telefon selbst; dafür
 * gibt es in „Mein Konto“ die Probemeldung.
 *
 * Gegenprobe: mit dem Worker vor E69 erscheint in keinem der drei Fälle eine
 * Meldung (bei offener App gab Firebase sie an die Seite weiter); ohne die
 * Antwort des Fensters auf „ortGefragt“ erscheint sie auch im Gespräch, in
 * dem man gerade liest — die App wechselt Seiten ohne Neuladen.
 */
test.skip(({ browserName }) => browserName !== 'chromium', 'Push über die DevTools-Schnittstelle gibt es nur in Chromium');

async function workerAnmelden(page: Page): Promise<{ cdp: CDPSession; registrierung: () => string }> {
  const cdp = await page.context().newCDPSession(page);
  let registrierung = '';
  cdp.on('ServiceWorker.workerRegistrationUpdated', (e) => {
    for (const r of e.registrations) if (!r.isDeleted && r.scopeURL.endsWith('/')) registrierung = r.registrationId;
  });
  await cdp.send('ServiceWorker.enable');
  // Im Entwicklungsbetrieb meldet die App ihn nicht selbst an (`lib/sw.ts`).
  await page.evaluate(async () => {
    await navigator.serviceWorker.register('/sw.js');
    await navigator.serviceWorker.ready;
  });
  await expect.poll(() => registrierung).not.toBe('');
  return { cdp, registrierung: () => registrierung };
}

async function meldungen(page: Page): Promise<string[]> {
  return page.evaluate(async () => {
    const r = await navigator.serviceWorker.ready;
    return (await r.getNotifications()).map((n) => `${n.tag}|${n.title}|${n.body}`);
  });
}

/** Seitenwechsel wie in der App: ohne Neuladen. */
async function wechseln(page: Page, pfad: string) {
  await page.evaluate((p) => {
    window.history.pushState({}, '', p);
    window.dispatchEvent(new PopStateEvent('popstate'));
  }, pfad);
}

test('Push bei offener App: Meldung erscheint, im Gespräch selbst nicht', async ({ page, context, baseURL }) => {
  await context.grantPermissions(['notifications'], { origin: new URL(baseURL!).origin });
  await anmelden(page, MONTEUR.email);
  const { cdp, registrierung } = await workerAnmelden(page);
  const push = (daten: Record<string, string>) => cdp.send('ServiceWorker.deliverPushMessage', {
    origin: new URL(baseURL!).origin,
    registrationId: registrierung(),
    data: JSON.stringify({ data: daten, from: '1', fcmMessageId: 'probe' }),
  });

  // Auf der Startseite, App sichtbar: die Meldung erscheint.
  await push({ title: 'Berta Büro', body: 'Neue Nachricht', link: '/nachrichten/k1', tag: 'nachricht-k1' });
  await expect.poll(() => meldungen(page)).toEqual(['nachricht-k1|Berta Büro|Neue Nachricht']);

  // Im Gespräch k1 (ohne Neuladen dorthin gewechselt): keine neue Meldung.
  await page.evaluate(async () => (await (await navigator.serviceWorker.ready).getNotifications()).forEach((n) => n.close()));
  await wechseln(page, '/nachrichten/k1');
  await push({ title: 'Berta Büro', body: 'Zweite', link: '/nachrichten/k1', tag: 'nachricht-k1' });
  // Ein anderes Gespräch meldet sich — danach steht fest, dass die erste Probe schon durch ist.
  await push({ title: 'Carla Chefin', body: 'Dritte', link: '/nachrichten/k2', tag: 'nachricht-k2' });
  await expect.poll(() => meldungen(page)).toEqual(['nachricht-k2|Carla Chefin|Dritte']);
});
