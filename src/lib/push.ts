import { getMessaging, getToken, deleteToken, isSupported } from 'firebase/messaging';
import { app } from '@/lib/firebase';
import { addPushToken, removePushToken } from '@/lib/db/prefs';

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
  if (!VAPID_KEY) return 'nicht-konfiguriert';
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
  if (!VAPID_KEY) return null;
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
  return token;
}

/**
 * Gerät abmelden. Das Token wird bei Firebase UND in userPrefs entfernt —
 * bliebe es stehen, schickte der Server weiter an ein Gerät, das nichts
 * mehr anzeigen will, und liefe irgendwann in Zustellfehler.
 */
export async function disablePush(uid: string): Promise<void> {
  if (!(await isSupported().catch(() => false))) return;
  const messaging = getMessaging(app);
  const token = await getToken(messaging, { vapidKey: VAPID_KEY }).catch(() => null);
  if (token) {
    await removePushToken(uid, token).catch(() => undefined);
    await deleteToken(messaging).catch(() => undefined);
  }
}
