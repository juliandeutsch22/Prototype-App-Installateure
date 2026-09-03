import { FASSUNG } from './fassung';

/**
 * Selbst beim Server nachfragen, welcher Stand ausgeliefert wird.
 *
 * WARUM ES DIESEN ZWEITEN WEG BRAUCHT. Bisher hing das Erkennen eines
 * Deploys allein am Service Worker: er vergleicht die ausgelieferte
 * `index.html` mit der gespeicherten. Das setzt voraus, dass der Worker
 * selbst aktuell ist und dass sein Vergleich läuft. Hängt er fest — und
 * genau das war die Ausgangslage auf dem Telefon —, erfährt die App nie
 * etwas, und niemand kann sagen, woran es liegt.
 *
 * Hier fragt die APP SELBST. `/fassung.txt` liegt nicht unter `/assets/`,
 * der Worker fasst sie also nicht an, und `cache: 'no-store'` schließt jeden
 * Zwischenspeicher aus. Was zurückkommt, ist der Stand auf dem Server.
 */

/** Wie oft höchstens gefragt wird — häufiger bringt nichts. */
const MINDESTABSTAND_MS = 30_000;

let zuletzt = 0;

/**
 * Ist die Antwort wirklich eine Fassungskennung?
 *
 * DIE FALLE, DIE DAS VERHINDERT, IST ECHT UND GEFÄHRLICH: Firebase Hosting
 * leitet mit `"source": "**"` JEDE unbekannte Adresse auf `index.html` um —
 * mit Status 200. Fehlte die Datei, käme also HTML zurück, das nie zur
 * eigenen Kennung passt. Die App hielte das für einen Deploy, lüde neu,
 * fände wieder HTML — eine Schleife, die das Telefon unbrauchbar macht.
 *
 * Eine Kennung ist kurz und einzeilig. HTML ist beides nicht.
 */
function istKennung(text: string): boolean {
  const t = text.trim();
  return t.length > 0 && t.length < 64 && !t.includes('<') && !t.includes('\n');
}

/**
 * Gibt es auf dem Server eine andere Fassung als die laufende?
 *
 * `null` heißt „konnte nicht festgestellt werden" — ohne Netz, mit einer
 * Fehlerantwort oder wenn die Datei fehlt. Das ist ausdrücklich NICHT
 * dasselbe wie „nein": wer beides gleich behandelt, baut sich entweder eine
 * Schleife oder eine App, die nie erfährt, dass es etwas Neues gibt.
 */
export async function andereFassungAufDemServer(): Promise<boolean | null> {
  try {
    const res = await fetch('/fassung.txt', { cache: 'no-store' });
    if (!res.ok) return null;
    const text = await res.text();
    if (!istKennung(text)) return null;
    return text.trim() !== FASSUNG;
  } catch {
    return null;
  }
}

/**
 * Beim Start und bei jeder Rückkehr in den Vordergrund nachsehen.
 *
 * Der Vordergrund ist auf dem Telefon der einzige Zeitpunkt, an dem eine
 * Startbildschirm-App verlässlich etwas tut: sie wird beim Öffnen
 * FORTGESETZT, nicht neu geladen.
 *
 * Gibt eine Funktion zum Abmelden zurück.
 */
export function fassungBeobachten(beiNeuerFassung: () => void): () => void {
  const pruefen = () => {
    const jetzt = Date.now();
    if (jetzt - zuletzt < MINDESTABSTAND_MS) return;
    zuletzt = jetzt;
    void andereFassungAufDemServer().then((anders) => {
      if (anders) beiNeuerFassung();
    });
  };

  const beiSichtbar = () => {
    if (document.visibilityState === 'visible') pruefen();
  };

  document.addEventListener('visibilitychange', beiSichtbar);
  pruefen();

  return () => document.removeEventListener('visibilitychange', beiSichtbar);
}

/** Nur für Tests: den Abstandszähler zurücksetzen. */
export function abstandZuruecksetzen(): void {
  zuletzt = 0;
}
