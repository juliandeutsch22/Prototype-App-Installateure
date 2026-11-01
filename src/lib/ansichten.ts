import { lazy, useSyncExternalStore, type ComponentType } from 'react';

/**
 * Die nachgeladenen Ansichten der App — mit Vorladen und Ladebalken.
 *
 * WARUM. Jede Ansicht ist ein eigener Baustein und kommt erst beim ersten
 * Öffnen übers Netz. Weil der Router den Wechsel als Übergang führt, bleibt
 * so lange die alte Seite stehen — gemessen 0,3 bis 1,6 s im langsamen Netz,
 * ohne jedes Zeichen, dass der Klick ankam (Analyse 10.10.2026). Hier melden
 * sich die Ansichten deshalb mit ihrem Menüpfad an: nach der Anmeldung lädt
 * `vorladen` im Leerlauf, was die Rolle in ihrer Navigation hat, und dauert
 * es doch einmal, zeigt `Ladebalken` den laufenden Wechsel.
 */

type Modul<T> = { default: T };

/**
 * WIE LANGE EIN BAUSTEIN UNTERWEGS SEIN DARF (01.11.2026: „lädt beim
 * Seitenwechsel manchmal gar nicht mehr“). Ein Baustein, dessen Abruf auf
 * einer halb toten Verbindung hängen bleibt, kommt nie an und meldet auch
 * keinen Fehler. Der Router hält beim Wechsel die alte Seite stehen, bis die
 * neue da ist — also blieb sie stehen, und weil das hängende Versprechen
 * gemerkt war, bei jedem weiteren Tipp auf denselben Menüpunkt wieder.
 *
 * Nach der Frist gilt der Abruf als gescheitertes Nachladen: die Fehlergrenze
 * erneuert die Hülle und lädt neu (`lib/nachladen.ts`) — das einzige, was
 * einen im Browser hängenden Modulabruf wirklich ersetzt. Die Frist ist
 * großzügig: ein Baustein ist wenige hundert Kilobyte groß, und der Service
 * Worker beendet einen stehenden Abruf schon vorher (`public/sw.js`).
 */
export const BAUSTEIN_FRIST_MS = 45_000;

function mitBausteinFrist<T>(laden: Promise<T>): Promise<T> {
  let uhr: ReturnType<typeof setTimeout> | undefined;
  const frist = new Promise<never>((_, ab) => {
    uhr = setTimeout(
      () => ab(new Error(`Failed to fetch dynamically imported module (keine Antwort in ${BAUSTEIN_FRIST_MS / 1000} s)`)),
      BAUSTEIN_FRIST_MS,
    );
  });
  return Promise.race([laden, frist]).finally(() => clearTimeout(uhr));
}

const LADER = new Map<string, Array<() => Promise<unknown>>>();

/** Ansichten, die React gerade braucht (ein Seitenwechsel wartet darauf). */
let vordergrund = 0;
/** Ansichten, die `vorladen` gerade holt. */
let hintergrund = 0;
const HOERER = new Set<() => void>();

function melden() {
  for (const h of HOERER) h();
}

/**
 * Wie `lazy`, dazu angemeldet unter dem Menüpfad, über den man die Ansicht
 * erreicht (bei Akten der Pfad ihrer Liste).
 *
 * EIN VERSPRECHEN FÜR BEIDE WEGE: was das Vorladen schon unterwegs hat,
 * übernimmt der Seitenwechsel, statt es ein zweites Mal zu holen. Scheitert
 * es, wird es nicht gemerkt — der nächste Versuch holt neu.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any -- dieselbe Schranke wie `lazy` selbst
export function ansicht<T extends ComponentType<any>>(pfad: string | readonly string[], laden: () => Promise<Modul<T>>) {
  let unterwegs: Promise<Modul<T>> | null = null;
  const holen = (): Promise<Modul<T>> => {
    unterwegs ??= mitBausteinFrist(laden()).then(
      (m) => {
        /*
          LEER HEISST GESCHEITERT. Fängt `nachladefehlerBeobachten` Vites
          Meldung ab, kommt das Modul als `undefined` an. Gemerkt, bekäme
          React es beim Öffnen — der Fall „undefined is not an object
          (evaluating 'e._result.default')" aus `lib/nachladen.ts`. Die
          Meldung ist so gewählt, dass die Fehlergrenze ihn als
          Nachladefehler erkennt.
        */
        if (!m) {
          unterwegs = null;
          throw new Error('Failed to fetch dynamically imported module (leer)');
        }
        return m;
      },
      (e: unknown) => {
        unterwegs = null;
        throw e;
      },
    );
    return unterwegs;
  };
  for (const p of typeof pfad === 'string' ? [pfad] : pfad) {
    const liste = LADER.get(p) ?? [];
    liste.push(holen);
    LADER.set(p, liste);
  }
  return lazy(() => {
    vordergrund += 1;
    melden();
    return holen().finally(() => {
      vordergrund -= 1;
      melden();
    });
  });
}

/**
 * Lädt eine Ansicht nach der anderen im Hintergrund — nur die, deren Pfade
 * genannt sind.
 *
 * NACHEINANDER, nicht alle zugleich: der Seitenwechsel, den jemand gerade
 * anstößt, soll sich die Leitung nicht mit zwanzig Bausteinen teilen.
 * SCHEITERT EINER, hört es auf: meist ist dann eine neue Fassung draußen,
 * und die Ansichten kommen wie bisher beim Öffnen — mit dem Neuladen, das
 * dort hingehört, nicht mitten in der Arbeit.
 */
export async function vorladen(pfade: readonly string[]): Promise<void> {
  for (const pfad of pfade) {
    for (const holen of LADER.get(pfad) ?? []) {
      hintergrund += 1;
      try {
        await holen();
      } catch {
        return;
      } finally {
        hintergrund -= 1;
      }
    }
  }
}

/**
 * DEN BAUSTEIN DER SEITE, DIE GERADE AUFGEHT, SCHON BEIM START HOLEN
 * (Ladezeit, 19.10.2026).
 *
 * Bis hierher fragte React nach ihm erst, wenn die Anmeldung geprüft war —
 * Zweitfaktor, Profil, Firma —, und erst dann ging er übers Netz. Er wird
 * aber auf jeden Fall gebraucht; geholt wird er jetzt währenddessen. Kein
 * Vorgriff auf andere Seiten, deshalb auch im Datensparmodus. Zu einem Pfad
 * gehört die Ansicht mit dem längsten passenden Menüpfad (die Akte unter
 * `/customers/…` gehört zu `/customers`); mehrere dort gleichzeitig.
 */
export function startansichtVorladen(pfad: string): void {
  const menuepfad = [...LADER.keys()]
    .filter((p) => p === pfad || (p !== '/' && pfad.startsWith(`${p}/`)))
    .sort((a, b) => b.length - a.length)[0];
  for (const holen of menuepfad ? LADER.get(menuepfad) ?? [] : []) {
    hintergrund += 1;
    // Scheitert es, kommt die Ansicht wie bisher beim Öffnen — mit dem Neuladen, das dort hingehört.
    holen().catch(() => undefined).finally(() => { hintergrund -= 1; });
  }
}

/**
 * Lädt gerade NUR das Vorladen? Dann ist ein gescheitertes Nachladen kein
 * Grund, die App neu zu laden (`lib/nachladen.ts`): niemand wartet darauf,
 * und ein Neuladen nähme womöglich eine halb ausgefüllte Maske mit.
 */
export function nurHintergrundLaedt(): boolean {
  return hintergrund > 0 && vordergrund === 0;
}

/** Wartet ein Seitenwechsel auf den Baustein seiner Ansicht? */
export function useAnsichtLaedt(): boolean {
  return useSyncExternalStore(
    (h) => {
      HOERER.add(h);
      return () => HOERER.delete(h);
    },
    () => vordergrund > 0,
  );
}

/**
 * Im Leerlauf ausführen — oder nach kurzer Pause, wo der Browser das nicht
 * kennt (Safari).
 */
export function imLeerlauf(tun: () => void): () => void {
  const w = window as Window & {
    requestIdleCallback?: (f: () => void, o?: { timeout: number }) => number;
    cancelIdleCallback?: (id: number) => void;
  };
  if (w.requestIdleCallback) {
    const id = w.requestIdleCallback(tun, { timeout: 4000 });
    return () => w.cancelIdleCallback?.(id);
  }
  const id = window.setTimeout(tun, 1500);
  return () => window.clearTimeout(id);
}

let abgeschaltet = false;

/**
 * Für Werkzeuge, die die App Seite für Seite neu laden (die Vorschau unter
 * `tools/vorschau`, auf der die Linkprüfung läuft): dort holte jedes
 * Neuladen alle Ansichten von vorn — im Entwicklungsserver Hunderte einzelne
 * Module je Seite, bis der Browser die Anfragen verweigerte.
 */
export function vorladenAbschalten(): void {
  abgeschaltet = true;
}

/** Der Datensparmodus des Geräts — dann wird nichts vorab geholt. */
export function datenSparen(): boolean {
  if (abgeschaltet) return true;
  const n = navigator as Navigator & { connection?: { saveData?: boolean } };
  return n.connection?.saveData === true;
}
