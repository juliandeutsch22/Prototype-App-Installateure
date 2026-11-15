import { AnmeldeFehler, type AnmeldeAblehnung } from '@/lib/auth/kern';

/**
 * WAS DIE MASKE ZU EINER ABGELEHNTEN ANMELDUNG SAGT (K5, Durchsicht
 * 15.11.2026). Vorher hieß jede Ablehnung „Passwort prüfen“ — auch ohne Netz
 * im Keller oder nach zu vielen Versuchen, und der Monteur ließ sich ein
 * neues Passwort geben, das wieder nicht ging.
 *
 * Einen eigenen Satz bekommt nur, was nichts über ein Konto verrät. Ein
 * deaktiviertes Konto oder ein deaktivierter Betrieb gehört NICHT dazu: der
 * Anmeldedienst meldet die Sperre schon vor dem Passwort (siehe
 * `AnmeldeAblehnung`). Der Satz zu den Zugangsdaten nennt diese Möglichkeit
 * deshalb für jeden — „Konto gibt es nicht“ sagt er nie. Steht die Sperre
 * erst NACH dem richtigen Passwort fest (Konto mitten in der Anmeldung
 * deaktiviert), sagt es der Auth-Kontext ausdrücklich.
 */
export const ANMELDE_ABLEHNUNG: Record<AnmeldeAblehnung, string> = {
  zugangsdaten:
    'Anmeldung fehlgeschlagen. E-Mail bzw. Benutzername und Passwort prüfen. Stimmen beide, ist der Zugang vielleicht deaktiviert — das Büro kann es nachsehen.',
  netz:
    'Keine Verbindung zum Anmeldedienst. Bitte den Empfang prüfen und noch einmal versuchen — ob die Zugangsdaten stimmen, ist damit noch nicht geprüft.',
  zuViele:
    'Zu viele Anmeldeversuche in kurzer Zeit. Bitte ein paar Minuten warten und dann noch einmal versuchen.',
  dienst:
    'Der Anmeldedienst ist gerade gestört. Bitte in ein paar Minuten noch einmal versuchen.',
};

/** Der Satz zu einer abgelehnten Anmeldung; was nicht eingeordnet ist, bleibt beim Satz zu den Zugangsdaten — wie bisher. */
export function ablehnungsText(e: unknown): string {
  return ANMELDE_ABLEHNUNG[e instanceof AnmeldeFehler ? e.art : 'zugangsdaten'];
}
