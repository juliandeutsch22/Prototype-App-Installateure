import { getMessaging, getToken, deleteToken, isSupported } from 'firebase/messaging';
import { firebaseApp, istEingerichtet } from '@/lib/firebase';
import { addPushToken, getPrefs, removePushToken } from '@/lib/db/prefs';

/**
 * Push-Benachrichtigungen aufs Telefon.
 *
 * Der Weg ist bewusst dreistufig, weil jede Stufe eigenständig scheitern
 * kann und der Nutzer wissen soll, woran es liegt:
 *
 *  1. Unterstützt der Browser Web-Push überhaupt?
 *  2. Erlaubt der Nutzer Benachrichtigungen?
 *  3. Gibt Firebase ein Gerätetoken heraus?
 *
 * Auf dem iPhone gibt es Web-Push erst ab iOS 16.4 und NUR, wenn die App
 * über „Zum Home-Bildschirm" installiert wurde. Im Safari-Tab bleibt es
 * still — das ist eine Eigenheit von iOS, kein Fehler der App, und wird
 * deshalb in der Oberfläche erklärt statt verschwiegen.
 */

/** Aus der Firebase Console: Cloud Messaging → Web-Push-Zertifikate. */
const VAPID_KEY = import.meta.env.VITE_FIREBASE_VAPID_KEY || '';

export type PushState =
  | 'bereit' // Token vorhanden, Meldungen kommen an
  | 'aus' // technisch möglich, aber nicht eingeschaltet
  | 'blockiert' // Nutzer hat abgelehnt — nur über die Browsereinstellungen zurückzuholen
  | 'nicht-unterstuetzt' // Browser kann kein Web-Push
  | 'ios-installation-noetig' // Safari auf iOS ohne Installation
  | 'nicht-konfiguriert'; // VAPID-Schlüssel fehlt im Build

/** iOS erlaubt Web-Push nur in einer zum Home-Bildschirm hinzugefügten App. */
function isIosBrowserWithoutInstall(): boolean {
  const ua = navigator.userAgent;
  const isIos = /iPad|iPhone|iPod/.test(ua);
  if (!isIos) return false;
  const standalone =
    window.matchMedia('(display-mode: standalone)').matches ||
    // Safari setzt diese nicht standardisierte Eigenschaft.
    (navigator as Navigator & { standalone?: boolean }).standalone === true;
  return !standalone;
}

/**
 * Was gilt gerade — ohne etwas zu verändern.
 *
 * „Bereit“ heißt seit dem 09.11.2026 (E69): dieses Gerät ist für DIESE Person
 * beim Server angemeldet. Vorher genügte die Erlaubnis des Browsers — nach
 * einem Ab- und Anmelden stand dann „Dieses Gerät ist angemeldet und bekommt
 * Meldungen“, obwohl das Gerät beim Abmelden abgemeldet worden war und nichts
 * mehr bekam. Läuft der Abgleich beim Start noch, wird auf ihn gewartet.
 */
export async function getPushState(uid: string): Promise<PushState> {
  // Ohne Zugangsdaten gibt es keinen Versandweg — dasselbe Ergebnis wie ohne
  // VAPID-Schlüssel, und für den Benutzer dieselbe Auskunft.
  if (!VAPID_KEY || !istEingerichtet()) return 'nicht-konfiguriert';
  if (!(await isSupported().catch(() => false))) {
    return isIosBrowserWithoutInstall() ? 'ios-installation-noetig' : 'nicht-unterstuetzt';
  }
  if (typeof Notification === 'undefined') return 'nicht-unterstuetzt';
  if (Notification.permission === 'denied') return 'blockiert';
  if (Notification.permission !== 'granted') return 'aus';
  await laufenderAbgleich?.catch(() => undefined);
  const zeichen = gemerktesZeichen(uid);
  if (!zeichen) return 'aus';
  const registration = await navigator.serviceWorker?.getRegistration().catch(() => undefined);
  const abo = await registration?.pushManager?.getSubscription().catch(() => null);
  if (!abo) return 'aus';
  const bekannt = (await getPrefs(uid))?.pushTokens ?? [];
  return bekannt.includes(zeichen) ? 'bereit' : 'aus';
}

/**
 * Erlaubnis holen und das Gerät registrieren.
 * Gibt das Token zurück oder null, wenn es nicht geklappt hat.
 */
export async function enablePush(companyId: string, uid: string): Promise<string | null> {
  const app = firebaseApp();
  if (!VAPID_KEY || !app) return null;
  if (!(await isSupported().catch(() => false))) return null;

  const permission = await Notification.requestPermission();
  if (permission !== 'granted') return null;

  /**
   * Den BEREITS LAUFENDEN Worker mitbenutzen, keinen zweiten anmelden.
   *
   * Früher hat diese Stelle einen eigenen `/firebase-messaging-sw.js`
   * angemeldet. Seit die App ihre Hülle vorhält, läuft aber schon einer auf
   * demselben Bereich — und für einen Bereich kann nur einer zuständig sein.
   * Der zweite hätte den ersten verdrängt, und damit ausgerechnet beim
   * Einschalten der Meldungen das Vorhalten abgeschaltet.
   *
   * `ready` wartet, bis der Worker die Seite tatsächlich führt; er wird beim
   * Start angemeldet (siehe lib/sw.ts), nicht erst hier.
   */
  const registration = await navigator.serviceWorker.ready;

  const token = await getToken(getMessaging(app), {
    vapidKey: VAPID_KEY,
    serviceWorkerRegistration: registration,
  }).catch(() => null);

  if (!token) return null;
  await addPushToken(companyId, uid, token);
  const alt = gemerktesZeichen(uid);
  if (alt && alt !== token) await removePushToken(uid, alt).catch(() => undefined);
  zeichenMerken(uid, token);
  geraetEingeschaltet(true);
  return token;
}

/*
 * ZWEI MERKER AUF DEM GERÄT.
 *
 * `senklot.pushAn` — hier wurden Meldungen in der App eingeschaltet. Er gilt
 * für das GERÄT, nicht für eine Person, und bleibt beim Abmelden stehen: wer
 * sich danach anmeldet (dieselbe Person oder auf dem geteilten Tablet die
 * nächste), wird beim Start angemeldet. Nur „Auf diesem Gerät abschalten“
 * nimmt ihn weg — wer das gewählt hat, wird nicht still wieder angemeldet.
 *
 * `senklot.pushZeichen.<uid>` — welches Zeichen der Server für diese Person
 * von diesem Gerät kennt. Damit fällt ein erneuertes Zeichen auf, und das
 * alte wird abgemeldet.
 */
const AN_MERKER = 'senklot.pushAn';
const ZEICHEN_MERKER = 'senklot.pushZeichen';

function gemerktesZeichen(uid: string): string | null {
  try {
    return localStorage.getItem(`${ZEICHEN_MERKER}.${uid}`);
  } catch {
    return null;
  }
}

function zeichenMerken(uid: string, token: string | null): void {
  try {
    if (token) localStorage.setItem(`${ZEICHEN_MERKER}.${uid}`, token);
    else localStorage.removeItem(`${ZEICHEN_MERKER}.${uid}`);
  } catch {
    /* Privates Fenster: dann eben ohne Abgleich. */
  }
}

function geraetIstEingeschaltet(): boolean {
  try {
    return localStorage.getItem(AN_MERKER) === '1';
  } catch {
    return false;
  }
}

function geraetEingeschaltet(an: boolean): void {
  try {
    if (an) localStorage.setItem(AN_MERKER, '1');
    else localStorage.removeItem(AN_MERKER);
  } catch {
    /* Privates Fenster: dann eben ohne Merker. */
  }
}

/** Der Abgleich, der gerade läuft — `getPushState` wartet auf ihn. */
let laufenderAbgleich: Promise<void> | null = null;

/**
 * BEIM START: DAS GERÄT FÜR DIE ANGEMELDETE PERSON ANMELDEN (E69).
 *
 * Drei Fälle, in denen das Gerät bisher still nichts mehr bekam:
 *
 *  - Ab- und wieder angemeldet (oder auf dem geteilten Gerät ein anderes
 *    Konto): das Abmelden meldet das Gerät für die Person ab — richtig, sonst
 *    bekäme der Nächste ihre Meldungen —, danach meldete es aber niemand
 *    wieder an.
 *  - Firebase hat das Zeichen erneuert, oder iOS hat das Abonnement
 *    entzogen: `getToken` legt dann ein neues an, der Server kannte nur das
 *    alte.
 *  - Der Server hat ein Zeichen als ungültig abgeräumt.
 *
 * Deshalb wird bei jedem Start nachgesehen, ob der Server das Zeichen dieses
 * Geräts für die Person kennt, und es sonst angemeldet — aber nur, wo
 * Meldungen in der App eingeschaltet wurden und der Browser sie erlaubt.
 *
 * GERÄTE VON VORHER haben den Merker `senklot.pushAn` noch nicht. Bei ihnen
 * gilt als eingeschaltet, wer ein gemerktes Zeichen hat (E67) oder ein
 * Abonnement, dessen Zeichen der Server für die Person kennt. Wer früher
 * abgeschaltet hat, hat keines davon und bleibt aus.
 */
export function pushAbgleichen(companyId: string, uid: string): Promise<void> {
  const lauf = abgleichen(companyId, uid);
  laufenderAbgleich = lauf;
  return lauf.finally(() => {
    if (laufenderAbgleich === lauf) laufenderAbgleich = null;
  });
}

async function abgleichen(companyId: string, uid: string): Promise<void> {
  const app = firebaseApp();
  if (!VAPID_KEY || !app) return;
  if (typeof Notification === 'undefined' || Notification.permission !== 'granted') return;
  if (!(await isSupported().catch(() => false))) return;
  const registration = await navigator.serviceWorker.ready;
  const messaging = getMessaging(app);
  const holen = () => getToken(messaging, { vapidKey: VAPID_KEY, serviceWorkerRegistration: registration }).catch(() => null);

  if (!geraetIstEingeschaltet()) {
    let vonVorher = !!gemerktesZeichen(uid);
    if (!vonVorher && (await registration.pushManager?.getSubscription().catch(() => null))) {
      const jetzt = await holen();
      vonVorher = !!jetzt && ((await getPrefs(uid))?.pushTokens ?? []).includes(jetzt);
    }
    if (!vonVorher) return;
    geraetEingeschaltet(true);
  }

  const token = await holen();
  if (!token) return;
  const bekannt = (await getPrefs(uid))?.pushTokens ?? [];
  if (!bekannt.includes(token)) await addPushToken(companyId, uid, token);
  const alt = gemerktesZeichen(uid);
  if (alt && alt !== token) await removePushToken(uid, alt).catch(() => undefined);
  zeichenMerken(uid, token);
}

/**
 * Gerät abmelden. Das Token wird in userPrefs entfernt — bliebe es stehen,
 * schickte der Server weiter an ein Gerät, das nichts mehr anzeigen soll.
 *
 * `ausdruecklich` — „Auf diesem Gerät abschalten“: dann auch bei Firebase
 * abgemeldet, und das Gerät bleibt aus, bis jemand es wieder einschaltet.
 * Ohne (beim Abmelden aus der App) bleibt das Abonnement, und wer sich
 * danach anmeldet, wird beim Start angemeldet (`pushAbgleichen`).
 */
export async function disablePush(uid: string, ausdruecklich = false): Promise<void> {
  if (ausdruecklich) geraetEingeschaltet(false);
  const app = firebaseApp();
  if (!app) return zeichenMerken(uid, null);
  if (!(await isSupported().catch(() => false))) return zeichenMerken(uid, null);
  const messaging = getMessaging(app);
  // Ohne gemerktes Zeichen nur nachfragen, wo es ein Abonnement gibt: `getToken` legte sonst ausgerechnet beim Abmelden eines an.
  const registration = await navigator.serviceWorker?.getRegistration().catch(() => undefined);
  const abo = await registration?.pushManager?.getSubscription().catch(() => null);
  const token = gemerktesZeichen(uid)
    ?? (registration && abo ? await getToken(messaging, { vapidKey: VAPID_KEY, serviceWorkerRegistration: registration }).catch(() => null) : null);
  if (token) await removePushToken(uid, token).catch(() => undefined);
  if (ausdruecklich) await deleteToken(messaging).catch(() => undefined);
  zeichenMerken(uid, null);
}

/** Wie die Probemeldung ausging — in den Worten von „Mein Konto“. */
export type ProbeErgebnis =
  | { art: 'gesendet' }
  /** Google kannte das Gerät nicht mehr; es wurde neu angemeldet, und die Probe ging dann durch. */
  | { art: 'neu-angemeldet' }
  | { art: 'nicht-angemeldet' }
  | { art: 'abgelehnt'; code: string };

/**
 * PROBEMELDUNG AN DIESES GERÄT (E69) — derselbe Weg wie jede Meldung, mit
 * Googles Antwort zurück. Vorher wird abgeglichen, damit der Server das
 * Zeichen kennt. Sagt Google, das Gerät gebe es nicht mehr (iOS hat das
 * Abonnement entzogen, Browserdaten gelöscht), wird es einmal frisch
 * angemeldet und die Probe wiederholt.
 */
export async function pushProbe(companyId: string, uid: string): Promise<ProbeErgebnis> {
  const { probeSenden } = await import('@/lib/db/pushProbe');
  await pushAbgleichen(companyId, uid);
  const zeichen = gemerktesZeichen(uid);
  if (!zeichen) return { art: 'nicht-angemeldet' };
  const erste = await probeSenden(zeichen);
  if (erste.ergebnis === 'gesendet') return { art: 'gesendet' };
  if (erste.ergebnis === 'abgelehnt') return { art: 'abgelehnt', code: erste.code ?? 'unbekannt' };

  const app = firebaseApp();
  if (!app) return { art: 'nicht-angemeldet' };
  await deleteToken(getMessaging(app)).catch(() => undefined);
  zeichenMerken(uid, null);
  const neu = await enablePush(companyId, uid);
  if (!neu) return { art: 'nicht-angemeldet' };
  const zweite = await probeSenden(neu);
  if (zweite.ergebnis === 'gesendet') return { art: 'neu-angemeldet' };
  if (zweite.ergebnis === 'abgelehnt' || zweite.ergebnis === 'abgemeldet') return { art: 'abgelehnt', code: zweite.code ?? 'unbekannt' };
  return { art: 'nicht-angemeldet' };
}
