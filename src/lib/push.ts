import { getMessaging, getToken, deleteToken, isSupported, onMessage } from 'firebase/messaging';
import { firebaseApp, istEingerichtet } from '@/lib/firebase';
import { addPushToken, getPrefs, removePushToken } from '@/lib/db/prefs';
import { imVordergrundZeigen, meldungAnzeige, type PushDaten } from '@/lib/pushAnzeige';

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

/** Was gilt gerade — ohne etwas zu verändern oder nachzufragen. */
export async function getPushState(): Promise<PushState> {
  // Ohne Zugangsdaten gibt es keinen Versandweg — dasselbe Ergebnis wie ohne
  // VAPID-Schlüssel, und für den Benutzer dieselbe Auskunft.
  if (!VAPID_KEY || !istEingerichtet()) return 'nicht-konfiguriert';
  if (!(await isSupported().catch(() => false))) {
    return isIosBrowserWithoutInstall() ? 'ios-installation-noetig' : 'nicht-unterstuetzt';
  }
  if (typeof Notification === 'undefined') return 'nicht-unterstuetzt';
  if (Notification.permission === 'denied') return 'blockiert';
  if (Notification.permission === 'granted') return 'bereit';
  return 'aus';
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
  zeichenMerken(uid, token);
  return token;
}

/*
 * DAS ZEICHEN DIESES GERÄTS, wie es beim Einschalten hinterlegt wurde — je
 * Person. Es sagt zweierlei: hier wurden Meldungen in der App eingeschaltet
 * (nur dann wird beim Start abgeglichen), und welches Zeichen der Server
 * dafür kennt.
 */
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

/**
 * BEI OFFENER APP — Meldungen zeigen und das Zeichen abgleichen
 * (09.11.2026: „Nachrichten senden keine Push-Benachrichtigungen“).
 *
 * Ist die App sichtbar geöffnet, gibt Firebase eine Meldung an die Seite
 * statt an den Service Worker — und die Seite hörte nicht zu: es erschien
 * nichts. Jetzt zeigt sie die Meldung über denselben Worker an, in derselben
 * Form (`lib/pushAnzeige.ts`); ein Tipp darauf führt wie sonst hin. Nicht,
 * wenn man schon dort steht.
 *
 * Und das Zeichen: Firebase erneuert es von Zeit zu Zeit. Geholt wurde es
 * bisher nur beim Einschalten — danach schickte der Server an ein Zeichen,
 * das es nicht mehr gibt, räumte es als ungültig ab, und das Gerät bekam
 * still gar nichts mehr. Firebase sieht vor, es bei jedem Start abzugleichen;
 * das geschieht hier, aber nur, wo Meldungen in der App eingeschaltet wurden
 * — wer sie abgeschaltet hat, wird nicht still wieder angemeldet.
 *
 * Gibt die Abmeldung des Zuhörers zurück.
 */
export async function pushImVordergrund(companyId: string, uid: string, pfad: () => string): Promise<() => void> {
  const app = firebaseApp();
  const nichts = () => undefined;
  if (!VAPID_KEY || !app) return nichts;
  if (typeof Notification === 'undefined' || Notification.permission !== 'granted') return nichts;
  if (!(await isSupported().catch(() => false))) return nichts;
  const registration = await navigator.serviceWorker.ready;
  const messaging = getMessaging(app);

  /*
    GERÄTE VON VORHER: wer Meldungen vor dem 09.11.2026 eingeschaltet hat,
    hat noch kein gemerktes Zeichen. Nachgetragen wird es nur, wenn das Gerät
    schon angemeldet ist (dann holt `getToken` das bestehende Zeichen und legt
    kein neues an) und der Server genau dieses Zeichen für die Person kennt.
  */
  if (!gemerktesZeichen(uid) && (await registration.pushManager?.getSubscription().catch(() => null))) {
    const jetzt = await getToken(messaging, { vapidKey: VAPID_KEY, serviceWorkerRegistration: registration }).catch(() => null);
    const bekannt = jetzt ? (await getPrefs(uid).catch(() => null))?.pushTokens ?? [] : [];
    if (jetzt && bekannt.includes(jetzt)) zeichenMerken(uid, jetzt);
  }

  const alt = gemerktesZeichen(uid);
  if (alt) {
    const neu = await getToken(messaging, { vapidKey: VAPID_KEY, serviceWorkerRegistration: registration }).catch(() => null);
    if (neu && neu !== alt) {
      try {
        await addPushToken(companyId, uid, neu);
        zeichenMerken(uid, neu);
        await removePushToken(uid, alt);
      } catch {
        /* Ohne Netz: beim nächsten Start wieder. */
      }
    }
  }

  return onMessage(messaging, (payload) => {
    const daten = payload.data as PushDaten | undefined;
    if (!imVordergrundZeigen(daten, pfad())) return;
    const { titel, optionen } = meldungAnzeige(daten);
    void registration.showNotification(titel, optionen);
  });
}

/**
 * Gerät abmelden. Das Token wird bei Firebase UND in userPrefs entfernt —
 * bliebe es stehen, schickte der Server weiter an ein Gerät, das nichts
 * mehr anzeigen will, und liefe irgendwann in Zustellfehler.
 */
export async function disablePush(uid: string): Promise<void> {
  const app = firebaseApp();
  if (!app) return;
  if (!(await isSupported().catch(() => false))) return;
  const messaging = getMessaging(app);
  const token = await getToken(messaging, { vapidKey: VAPID_KEY }).catch(() => null);
  if (token) {
    await removePushToken(uid, token).catch(() => undefined);
    await deleteToken(messaging).catch(() => undefined);
  }
  zeichenMerken(uid, null);
}
