import { test, expect, type BrowserContext, type Page, type CDPSession, type Worker } from '@playwright/test';
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
/*
  DER VOLLE CHROMIUM, NICHT DIE „HEADLESS SHELL“. Ohne Kanal nimmt Playwright
  ohne Fenster die abgespeckte Shell — und die kennt keine Meldungen: die
  Erlaubnis bleibt dort „denied“, obwohl sie erteilt ist, `showNotification`
  wirft (nachgestellt mit derselben Fassung wie in der CI). `channel:
  'chromium'` nimmt den vollen Browser ohne Fenster; `playwright install
  chromium` legt beide ab. Wo `CHROMIUM_PFAD` gesetzt ist, gilt dieser.
*/
test.use({ channel: 'chromium' });

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

/*
 * WAS DER WORKER ANZEIGT, GEMESSEN AM WORKER SELBST (10.11.2026). Vorher las
 * der Weg `getNotifications()`. In der CI fehlte dort eine Meldung, die der
 * Worker angezeigt hatte (1 von 48 Läufen lokal unter Last nachgestellt):
 * `showNotification` war erfüllt, 58 ms später war die Liste leer und blieb
 * es. Chrome gleicht die gespeicherten Meldungen mit denen ab, die seine
 * Anzeige gerade zeigt; ohne Bildschirm meldet die Anzeige eine neue Meldung
 * unter Last zu spät, und Chrome streicht sie aus der Liste. Mit unserem
 * Worker hat das nichts zu tun. Gezählt wird deshalb, was der Worker Chrome
 * zur Anzeige übergibt und Chrome angenommen hat (erfülltes Versprechen) —
 * genau die Entscheidung, die dieser Weg prüft: zeigen oder nicht.
 */
async function workerMitschnitt(context: BrowserContext): Promise<Worker> {
  const sw = context.serviceWorkers().find((w) => new URL(w.url()).pathname === '/sw.js')
    ?? await context.waitForEvent('serviceworker', { predicate: (w) => new URL(w.url()).pathname === '/sw.js' });
  await sw.evaluate(() => {
    const g = self as unknown as { registration: ServiceWorkerRegistration; __gezeigt?: string[] };
    if (g.__gezeigt) return;
    g.__gezeigt = [];
    const echt = g.registration.showNotification.bind(g.registration);
    g.registration.showNotification = async (titel: string, o: NotificationOptions = {}) => {
      await echt(titel, o);
      g.__gezeigt!.push(`${o.tag}|${titel}|${o.body}`);
    };
  });
  return sw;
}

const meldungen = (sw: Worker) =>
  sw.evaluate(() => [...((self as unknown as { __gezeigt?: string[] }).__gezeigt ?? [])]);
const vergessen = (sw: Worker) =>
  sw.evaluate(() => { (self as unknown as { __gezeigt?: string[] }).__gezeigt!.length = 0; });

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

  const sw = await workerMitschnitt(context);

  // Auf der Startseite, App sichtbar: die Meldung erscheint.
  await push({ title: 'Berta Büro', body: 'Neue Nachricht', link: '/nachrichten/k1', tag: 'nachricht-k1' });
  await expect.poll(() => meldungen(sw)).toEqual(['nachricht-k1|Berta Büro|Neue Nachricht']);

  // Im Gespräch k1 (ohne Neuladen dorthin gewechselt): keine neue Meldung.
  await vergessen(sw);
  await wechseln(page, '/nachrichten/k1');
  await push({ title: 'Berta Büro', body: 'Zweite', link: '/nachrichten/k1', tag: 'nachricht-k1' });
  // Ein anderes Gespräch meldet sich — danach steht fest, dass die erste Probe schon durch ist.
  await push({ title: 'Carla Chefin', body: 'Dritte', link: '/nachrichten/k2', tag: 'nachricht-k2' });
  await expect.poll(() => meldungen(sw)).toEqual(['nachricht-k2|Carla Chefin|Dritte']);
  // Und es bleibt dabei, auch wenn die Frage nach dem Ort (höchstens 500 ms) für „Zweite“ länger brauchte.
  await page.waitForTimeout(1000);
  expect(await meldungen(sw)).toEqual(['nachricht-k2|Carla Chefin|Dritte']);
});
