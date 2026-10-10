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
    unterwegs ??= laden().then(
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
