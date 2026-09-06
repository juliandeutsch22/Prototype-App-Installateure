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

/**
 * `onDocumentCreated` bekommt den Schnappschuss DIREKT, nicht in `before`/
 * `after` verpackt — es gibt beim Anlegen nur einen Zustand.
 *
 * Dass die drei Ereignisformen hier getrennt stehen, ist kein Formalismus:
 * genau diesen Unterschied liest der Aufrufcode
 * (`event.data?.data()` gegen `event.data?.after?.data()`), und ein
 * gemeinsamer Typ hätte einen Vertipper darin durchgehen lassen.
 */
export interface AnlageEreignis<T> {
  data?: { exists: boolean; data: () => T | undefined };
  params: Record<string, string>;
}

export function onDocumentCreated<T>(
  optionen: Record<string, unknown>,
  handler: (event: AnlageEreignis<T>) => unknown,
): ((event: AnlageEreignis<T>) => unknown) & { optionen: Record<string, unknown> } {
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
