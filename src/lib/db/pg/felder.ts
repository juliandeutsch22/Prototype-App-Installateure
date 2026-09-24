/**
 * Zwischen den Feldnamen der App und den Spaltennamen der Datenbank.
 *
 * Die App spricht seit jeher `camelCase` (`companyId`, `breakDuration`), und
 * jede Ansicht, jeder Typ und jeder Test hängt daran. Postgres spricht
 * `snake_case`, und das ist dort keine Geschmacksfrage: unzitierte Bezeichner
 * werden klein geschrieben, also wäre `companyId` in SQL ohnehin `companyid`
 * — ein Feld, das sich nur noch mit Anführungszeichen ansprechen lässt.
 *
 * Also wird umgerechnet. DIE UMRECHNUNG IST MECHANISCH, und genau deshalb
 * braucht sie einen Wächter: `tests/supabase/felder.test.ts` prüft, dass jede
 * echte Spalte jeder echten Tabelle den Hin- und Rückweg unverändert
 * übersteht. Eine Spalte, die das nicht tut, fällt auf, bevor sie still Daten
 * verschluckt.
 */
import { SPALTENTYPEN } from './spaltentypen';

/** `break_duration` → `breakDuration` */
export function alsFeld(spalte: string): string {
  return spalte.replace(/_([a-z0-9])/g, (_, z: string) => z.toUpperCase());
}

/** `breakDuration` → `break_duration` */
export function alsSpalte(feld: string): string {
  return feld.replace(/[A-Z]/g, (z) => `_${z.toLowerCase()}`);
}

/**
 * `"2026-09-11T22:09:23.036724+00:00"` → `1789...` (Millisekunden).
 *
 * Die App-Typen sagen `number`; so lagen die Zeitstempel in Firestore, und so
 * rechnet jede Anzeige damit.
 */
function alsZeitpunkt(wert: unknown): unknown {
  if (wert === null || wert === undefined) return wert;
  if (typeof wert === 'number') return wert;
  const ms = Date.parse(String(wert));
  return Number.isNaN(ms) ? wert : ms;
}

/**
 * `"07:00:00"` → `"07:00"`.
 *
 * Das ist es, was ein `<input type="time">` liefert und annimmt. Sekunden
 * führt die App nirgends; sie stünden nur da und wären beim Vergleich zweier
 * Zeichenketten sogar schädlich.
 */
function alsUhrzeit(wert: unknown): unknown {
  if (typeof wert !== 'string') return wert;
  const treffer = /^(\d{2}:\d{2})(:\d{2})?/.exec(wert);
  return treffer ? treffer[1] : wert;
}

/** Umgekehrt: `1789...` → ISO, damit Postgres es als Zeitpunkt annimmt. */
function alsZeitpunktFuerDB(wert: unknown): unknown {
  if (typeof wert !== 'number') return wert;
  return new Date(wert).toISOString();
}

/**
 * Eine ganze Zeile aus der Datenbank in die Sprache der App.
 *
 * Die Tabelle muss mit, weil die Umrechnung von der SPALTE abhängt und nicht
 * von der Form des Werts — siehe `spaltentypen.ts`.
 */
export function zeileAlsObjekt<T>(tabelle: string, zeile: Record<string, unknown>): T {
  const arten = SPALTENTYPEN[tabelle] ?? {};
  const raus: Record<string, unknown> = {};
  for (const [spalte, wert] of Object.entries(zeile)) {
    /*
      LEERE SPALTEN FALLEN WEG, UND ZWAR AUS EINEM GRUND.

      In Firestore gab es „Feld nicht da". In Postgres gibt es eine Spalte mit
      `null`. Die App-Typen sagen aber `notizen?: string` — nicht
      `string | null` —, und der Umweg über `as T` lässt den Typprüfer diese
      Lüge nicht sehen. Käme `null` durch, stünde es in jedem Objekt, das die
      Datenschicht liefert: `Object.keys` zählte anders, ein `=== undefined`
      ginge daneben, und ein `null.trim()` fiele erst draussen auf.

      Umgekehrt bleibt `null` beim SCHREIBEN erhalten (siehe
      `objektAlsZeile`): „ausdrücklich geleert" ist eine Absicht, „nicht
      mitgeschickt" eine andere. Gelesen bedeuten beide dasselbe — nichts —,
      und genau so hat es Firestore auch gehalten.
    */
    if (wert === null) continue;
    const art = arten[spalte];
    raus[alsFeld(spalte)] =
      art === 'zeitpunkt' ? alsZeitpunkt(wert) : art === 'uhrzeit' ? alsUhrzeit(wert) : wert;
  }
  return raus as T;
}

/**
 * Ein Objekt der App in eine Zeile für die Datenbank.
 *
 * `undefined` fällt heraus — nicht, weil Postgres das verlangte (es kennt nur
 * `null`), sondern weil „Feld nicht mitgeschickt" und „Feld ausdrücklich
 * geleert" zwei verschiedene Absichten sind. `null` bleibt deshalb stehen.
 * Das ist dieselbe Unterscheidung, die `stripUndefined` in der alten
 * Datenschicht getroffen hat.
 */
export function objektAlsZeile(
  tabelle: string,
  daten: Record<string, unknown>,
): Record<string, unknown> {
  const arten = SPALTENTYPEN[tabelle] ?? {};
  const raus: Record<string, unknown> = {};
  for (const [feld, wert] of Object.entries(daten)) {
    if (wert === undefined) continue;
    const spalte = alsSpalte(feld);
    /*
      EINE LEERE UHRZEIT IST KEINE UHRZEIT. Ein Zeitfeld, das niemand
      ausfüllt, liefert `''`, und Postgres nimmt das für eine `time`-Spalte
      nicht an. Aufgefallen am Urlaubstag in der Zeiterfassung: er trägt keine
      Zeiten, schickte `''`, und das Speichern scheiterte jedes Mal mit „bitte
      erneut versuchen". Hier, weil es jede Uhrzeitspalte betrifft — nicht nur
      die eine Maske, bei der es zuerst aufgefallen ist.
    */
    raus[spalte] =
      arten[spalte] === 'zeitpunkt'
        ? alsZeitpunktFuerDB(wert)
        : arten[spalte] === 'uhrzeit' && wert === ''
          ? null
          : wert;
  }
  return raus;
}
