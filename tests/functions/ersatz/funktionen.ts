/**
 * `firebase-functions` als Ersatz — er gibt den Handler heraus, statt ihn
 * bei Google anzumelden.
 *
 * Genau das fehlte bisher: `onCall(...)` liefert im Betrieb ein Objekt, das
 * die Firebase-Laufzeit aufruft. Im Test bekommt man damit nichts in die
 * Hand. Hier wird die Funktion selbst mit zurückgegeben — und der Test ruft
 * denselben Code auf, den auch Google aufruft.
 */

export interface AufrufKontext<D> {
  data: D;
  auth?: { uid: string; token: Record<string, unknown> };
}

/** Was `onCall` zurueckgibt: aufrufbar, mit den Optionen daneben. */
export type Aufrufbar<D, R> = ((req: AufrufKontext<D>) => R) & {
  optionen: Record<string, unknown>;
};

/**
 * Der Fehlertyp der Functions.
 *
 * Ein echter Fehler mit `code`, damit ein Test die ART der Ablehnung prüfen
 * kann. „Wirft irgendwas" wäre zu wenig: zwischen `permission-denied` und
 * `failed-precondition` liegt der Unterschied zwischen „darf nicht" und
 * „geht gerade nicht", und der Aufrufer zeigt daraus verschiedene Meldungen.
 */
export class HttpsError extends Error {
  constructor(
    readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = 'HttpsError';
  }
}

export function onCall<D, R>(
  optionen: Record<string, unknown>,
  handler: (req: AufrufKontext<D>) => R,
): Aufrufbar<D, R> {
  return Object.assign(handler, { optionen });
}

export interface SchreibEreignis<T = Record<string, unknown>> {
  data?: {
    before?: { exists: boolean; data: () => T | undefined };
    after?: { exists: boolean; data: () => T | undefined };
  };
  params: Record<string, string>;
}

export type Ausgeloest<T> = ((event: SchreibEreignis<T>) => unknown) & {
  optionen: Record<string, unknown>;
};

export function onDocumentWritten<T>(
  optionen: Record<string, unknown>,
  handler: (event: SchreibEreignis<T>) => unknown,
): Ausgeloest<T> {
  return Object.assign(handler, { optionen });
}

export function onDocumentCreated<T>(
  optionen: Record<string, unknown>,
  handler: (event: SchreibEreignis<T>) => unknown,
): Ausgeloest<T> {
  return Object.assign(handler, { optionen });
}

/**
 * `onDocumentUpdated` reicht `before`/`after` NICHT optional durch — anders
 * als `onDocumentWritten`. Der Unterschied steht im Aufrufcode
 * (`event.data?.before.data()`) und gehoert deshalb auch hier getrennt.
 */
export interface AenderungsEreignis<T> {
  data?: {
    before: { data: () => T | undefined };
    after: { data: () => T | undefined };
  };
  params: Record<string, string>;
}

export function onDocumentUpdated<T>(
  optionen: Record<string, unknown>,
  handler: (event: AenderungsEreignis<T>) => unknown,
): ((event: AenderungsEreignis<T>) => unknown) & { optionen: Record<string, unknown> } {
  return Object.assign(handler, { optionen });
}

export type Geplant = ((event?: unknown) => unknown) & { optionen: Record<string, unknown> };

export function onSchedule(
  optionen: Record<string, unknown>,
  handler: (event?: unknown) => unknown,
): Geplant {
  return Object.assign(handler, { optionen });
}

/** Protokollzeilen sammeln, statt sie in den Testlauf zu schütten. */
export const protokoll: Array<{ stufe: string; text: string; daten?: unknown }> = [];

export const logger = {
  info: (text: string, daten?: unknown) => protokoll.push({ stufe: 'info', text, daten }),
  warn: (text: string, daten?: unknown) => protokoll.push({ stufe: 'warn', text, daten }),
  error: (text: string, daten?: unknown) => protokoll.push({ stufe: 'error', text, daten }),
  debug: (text: string, daten?: unknown) => protokoll.push({ stufe: 'debug', text, daten }),
};

export function protokollLeeren() {
  protokoll.length = 0;
}

export function defineSecret(name: string) {
  return { name, value: () => '' };
}

/*
 * ZWEI SICHTEN AUF DENSELBEN HANDLER — und beide sind richtig.
 *
 * Beim Laufen bekommt der Test über `resolve.alias` den Ersatz von oben:
 * `onCall` gibt die Funktion selbst heraus, und ein Aufruf ist ein Aufruf.
 *
 * Die TYPPRÜFUNG sieht etwas anderes. `tsc` löst `firebase-functions` für die
 * Dateien unter `functions/` aus deren eigenem `node_modules` auf — also die
 * echten Typen. Dort ist das Ergebnis von `onCall` der HTTP-Einstiegspunkt
 * `(req, res) => void`, und ein Ereignis ist ein vollständiges `CloudEvent`
 * mit `specversion`, `id`, `source` und `time`.
 *
 * Das ist kein Widerspruch, den man wegtypen sollte: die Laufzeit ruft den
 * Handler tatsächlich anders auf, als sein öffentlicher Typ es beschreibt.
 * Die beiden Brücken hier machen genau diesen Übergang — einmal, mit Grund,
 * statt als `as never` an achtzig Aufrufstellen.
 */

/** Einen `onCall`-Handler aufrufen, wie die Laufzeit es tut. */
export function rufAuf<D, R>(fn: unknown, req: AufrufKontext<D>): Promise<R> {
  return (fn as (r: AufrufKontext<D>) => Promise<R>)(req);
}

/** Einen Trigger auslösen, wie die Laufzeit es tut. */
export function loeseAus<E>(fn: unknown, event: E): Promise<void> {
  return Promise.resolve((fn as (e: E) => unknown)(event)) as Promise<void>;
}

/** Einen geplanten Lauf anstoßen. */
export function laufeGeplant(fn: unknown): Promise<void> {
  return Promise.resolve((fn as () => unknown)()) as Promise<void>;
}
