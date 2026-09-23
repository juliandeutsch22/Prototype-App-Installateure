/**
 * Die Entscheidungen hinter den Push-Benachrichtigungen — ohne Firebase.
 *
 * Getrennt aus demselben Grund wie `extractLogic.ts`: was in `notify.ts`
 * steht, läuft serverseitig und in Ereignis-Triggern. Ein Fehler dort ist
 * unsichtbar — niemand bekommt eine Meldung, und niemand merkt, dass eine
 * gefehlt hat. Genau die Regeln, an denen das hängt (wer bekommt was, wann
 * gilt ein Übergang, wann ist ein Gerät wirklich tot), stehen deshalb hier
 * und sind einzeln prüfbar.
 */

/** Rollen, die von jeder neuen Materialanforderung erfahren. */
export const EMPFAENGER_NEUE_ANFORDERUNG = ['Verwaltung', 'Geschäftsführung', 'Administrator'];

export interface OrderDoc {
  companyId?: string;
  materialName?: string;
  quantity?: number;
  projectNumber?: string;
  userId?: string;
  userName?: string;
  status?: string;
  transactionType?: string;
  isUrgent?: boolean;
}

export type MeldungsArt =
  | 'notifyNewOrder'
  | 'notifyOrderReady'
  | 'notifyUrgentDelivery'
  | 'notifyAbwesenheit';

/**
 * Eine Postgres-Zeile als `OrderDoc`.
 *
 * WARUM DIESE SECHS ZEILEN HIER STEHEN und nicht in der Edge Function: sie
 * sind eine ENTSCHEIDUNG, keine Mechanik. Verwechselt man `is_urgent` mit
 * `isUrgent`, ist `istEilRelevant` immer falsch — und die Projektleitung
 * erfährt nie von einer Eilzustellung. Das fällt niemandem auf: es kommt ja
 * keine Fehlermeldung, es kommt nur nichts. Genau dafür ist diese Datei da,
 * und deshalb wird auch das hier einzeln geprüft.
 */
export function orderAusZeile(zeile: Record<string, unknown> | undefined): OrderDoc | undefined {
  if (!zeile) return undefined;
  return {
    companyId: zeile.company_id as string | undefined,
    materialName: zeile.material_name as string | undefined,
    quantity: zeile.quantity === undefined || zeile.quantity === null
      ? undefined
      : Number(zeile.quantity),
    projectNumber: zeile.project_number as string | undefined,
    userId: zeile.user_id as string | undefined,
    userName: zeile.user_name as string | undefined,
    status: zeile.status as string | undefined,
    transactionType: zeile.transaction_type as string | undefined,
    isUrgent: zeile.is_urgent === true,
  };
}

/**
 * Die Nutzlast einer Meldung.
 *
 * Die Indexsignatur ist kein Beiwerk: FCM nimmt als `data` ausschliesslich
 * eine Abbildung String -> String entgegen. Steht hier je ein Feld mit einer
 * Zahl oder einem Objekt, faellt das nicht beim Uebersetzen auf, sondern
 * beim Versand — also erst in der Produktion.
 */
export interface Meldung {
  title: string;
  body: string;
  link: string;
  /** Gleiche Kennung = die neue Meldung ersetzt die alte im Sperrbildschirm. */
  tag: string;
  [feld: string]: string;
}

/**
 * Ist das überhaupt eine Anforderung, für die gemeldet wird?
 *
 * Retouren laufen durch dieselbe Sammlung, sind aber Rückgaben — dafür muss
 * niemand laufen.
 */
export function istMeldepflichtigeAnforderung(order?: OrderDoc): boolean {
  if (!order?.companyId) return false;
  return order.transactionType !== 'return';
}

/**
 * Wer erfährt von einer neuen Anforderung?
 *
 * Deaktivierte Konten fallen heraus — sie sollen keine Meldungen mehr
 * bekommen, auch wenn ihr Gerät noch registriert ist. Und wer selbst
 * angefordert hat, braucht die eigene Meldung nicht.
 */
export function empfaengerNeueAnforderung(
  users: { uid?: string; active?: boolean }[],
  besteller?: string,
): string[] {
  return users
    .filter((u) => u.uid && u.active !== false)
    .map((u) => u.uid as string)
    .filter((uid) => uid !== besteller);
}

/**
 * Will dieser Nutzer diese Meldung?
 *
 * Wer nichts eingestellt hat, bekommt sie. Nichts zu verpassen ist der
 * hilfreichere Ausgangszustand; Abschalten bleibt ein bewusster Schritt.
 * Nur ein ausdrückliches `false` zählt als Nein — ein fehlendes Feld nicht.
 */
export function willMeldung(
  prefs: Record<string, unknown> | undefined,
  art: MeldungsArt,
): boolean {
  if (!prefs) return false; // kein Dokument -> auch kein registriertes Gerät
  return prefs[art] !== false;
}

/**
 * Nur der ÜBERGANG auf „Abholbereit" zählt.
 *
 * Ohne diese Prüfung löste jede spätere Änderung an einer bereits
 * abholbereiten Anforderung dieselbe Meldung erneut aus — der Monteur bekäme
 * sie ein zweites und drittes Mal und liefe womöglich noch einmal los.
 */
export function istUebergangAufAbholbereit(before?: OrderDoc, after?: OrderDoc): boolean {
  if (!after?.userId) return false;
  if (after.status !== 'Abholbereit') return false;
  return before?.status !== after.status;
}

/** Eilzustellung nur mit Baustelle — ohne sie gibt es keine Projektleitung. */
export function istEilRelevant(order?: OrderDoc): boolean {
  return !!order?.isUrgent && !!order.projectNumber && !!order.companyId;
}

function menge(order: OrderDoc): string {
  return `${order.quantity ?? 1}× ${order.materialName ?? 'Material'}`;
}

export function textNeueAnforderung(order: OrderDoc): Meldung {
  return {
    title: 'Neue Materialanforderung',
    body: `${menge(order)}${order.userName ? ` — ${order.userName}` : ''}${
      order.projectNumber ? ` (${order.projectNumber})` : ''
    }`,
    link: '/material/anforderungen',
    // Alle offenen Anforderungen teilen sich eine Kennung: bei fünf Meldungen
    // kurz hintereinander bleibt eine im Sperrbildschirm stehen statt fünf.
    tag: 'material-neu',
  };
}

export function textEilAngefordert(order: OrderDoc, id: string): Meldung {
  return {
    title: 'Eilzustellung angefordert',
    body: `${menge(order)} für ${order.projectNumber}${
      order.userName ? ` — ${order.userName}` : ''
    }`,
    link: '/material/anforderungen',
    // Eigene Kennung je Anforderung: eine Eilmeldung darf nicht von der
    // Sammelmeldung für gewöhnliche Anforderungen verdrängt werden.
    tag: `eil-neu-${id}`,
  };
}

export function textAbholbereit(order: OrderDoc, id: string): Meldung {
  return {
    title: 'Material abholbereit',
    body: `${menge(order)} liegt bereit${order.projectNumber ? ` (${order.projectNumber})` : ''}`,
    link: '/material/anfordern',
    tag: `material-bereit-${id}`,
  };
}

export function textEilAbholbereit(order: OrderDoc, id: string): Meldung {
  return {
    title: 'Eilzustellung abholbereit',
    body: `${menge(order)} für ${order.projectNumber} liegt bereit`,
    link: '/material/anforderungen',
    tag: `eil-bereit-${id}`,
  };
}

/**
 * Welche Tokens hat der Dienst als ENDGÜLTIG ungültig gemeldet?
 *
 * Nur diese beiden Codes bedeuten „dieses Gerät gibt es nicht mehr" (App
 * deinstalliert, Browserdaten gelöscht). Alles andere — Zeitüberschreitung,
 * Kontingent, interner Fehler — ist vorübergehend. Würde man dabei aufräumen,
 * meldete eine halbe Stunde Störung beim Anbieter sämtliche Geräte des
 * Betriebs ab, und niemand bekäme je wieder eine Meldung, ohne zu wissen
 * warum.
 */
const ENDGUELTIG = new Set([
  'messaging/registration-token-not-registered',
  'messaging/invalid-registration-token',
]);
// Bewusst NICHT in der Liste: `messaging/invalid-argument`. Der Code kommt
// zwar bei einem kaputten Token vor, aber ebenso bei einer fehlerhaften
// Nachricht — und die betrifft dann ALLE Empfänger auf einmal. Ein Tippfehler
// im Meldungstext würde damit sämtliche Geräte des Betriebs abmelden. Im
// Zweifel lieber ein totes Token in der Liste behalten als ein lebendes
// verlieren: das eine kostet einen fehlgeschlagenen Versand, das andere die
// Erreichbarkeit eines Menschen.

export function toteTokens(
  tokens: string[],
  responses: { error?: { code?: string } }[],
): string[] {
  const tot: string[] = [];
  responses.forEach((r, i) => {
    const code = r.error?.code;
    if (code && ENDGUELTIG.has(code) && tokens[i]) tot.push(tokens[i]);
  });
  return [...new Set(tot)];
}

/* ------------------------------------------------------------------ */
/* Abwesenheiten: Antrag, Entscheidung, Krankmeldung                   */
/* ------------------------------------------------------------------ */

/** Ein Urlaubs-/ZA-Antrag oder eine Krankmeldung, so weit die Meldung sie braucht. */
export interface AbwesenheitDoc {
  companyId?: string;
  userId?: string;
  userName?: string;
  von?: string;
  bis?: string;
  art?: string;
  status?: string;
  zaVon?: string | null;
  zaBis?: string | null;
  zaStunden?: number | null;
}

/** Eine Postgres-Zeile (`vacations` oder `krankmeldungen`) als `AbwesenheitDoc`. */
export function abwesenheitAusZeile(zeile: Record<string, unknown> | undefined): AbwesenheitDoc | undefined {
  if (!zeile) return undefined;
  return {
    companyId: zeile.company_id as string | undefined,
    userId: zeile.user_id as string | undefined,
    userName: zeile.user_name as string | undefined,
    von: zeile.von as string | undefined,
    bis: zeile.bis as string | undefined,
    art: (zeile.art as string | undefined) ?? undefined,
    status: zeile.status as string | undefined,
    zaVon: (zeile.za_von as string | null | undefined) ?? null,
    zaBis: (zeile.za_bis as string | null | undefined) ?? null,
    zaStunden: zeile.za_stunden === undefined || zeile.za_stunden === null ? null : Number(zeile.za_stunden),
  };
}

export interface Belegschaftsmitglied {
  uid: string;
  role?: string;
  active?: boolean;
  /** Darf über Urlaub entscheiden — dieselbe Regel wie `app.darf_urlaub_entscheiden`. */
  entscheidet?: boolean;
  /** Buchhaltung, Geschäftsführung, Administration. */
  buero?: boolean;
}

/**
 * Wer von einem neuen Antrag erfährt: wer entscheidet — ausser dem
 * Antragsteller selbst (eine Geschäftsführerin, die Urlaub beantragt,
 * braucht keine Meldung über ihren eigenen Antrag).
 */
export function empfaengerAntrag(leute: Belegschaftsmitglied[], antragsteller?: string): string[] {
  return leute
    .filter((u) => u.active !== false && u.entscheidet && u.uid !== antragsteller)
    .map((u) => u.uid);
}

/**
 * Wer von einer Krankmeldung erfährt: das Büro — ohne den, der krank ist.
 *
 * Nicht die Projektleitung: ein Krankenstand ist ein Gesundheitsdatum, und
 * sie sieht im Wochenplan ohnehin „abwesend".
 */
export function empfaengerKrankmeldung(leute: Belegschaftsmitglied[], person?: string): string[] {
  return leute
    .filter((u) => u.active !== false && u.buero && u.uid !== person)
    .map((u) => u.uid);
}

/** '2026-10-27' -> '27.10.' — kurz, weil der Sperrbildschirm kurz ist. */
function kurzTag(iso?: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso ?? '');
  return m ? `${m[3]}.${m[2]}.` : '';
}

function zeitraumKurz(a: AbwesenheitDoc): string {
  if (!a.von) return '';
  return !a.bis || a.bis === a.von ? kurzTag(a.von) : `${kurzTag(a.von)}–${kurzTag(a.bis)}`;
}

function istZa(a: AbwesenheitDoc): boolean {
  return a.art === 'Zeitausgleich';
}

/** „27.10., 13:00–17:00 (4 Std.)" für ZA, sonst der Zeitraum. */
function umfangKurz(a: AbwesenheitDoc): string {
  const teile = [zeitraumKurz(a)];
  if (istZa(a) && a.zaVon && a.zaBis) teile.push(`${a.zaVon.slice(0, 5)}–${a.zaBis.slice(0, 5)}`);
  const text = teile.filter(Boolean).join(', ');
  const std = istZa(a) && a.zaStunden ? ` (${String(a.zaStunden).replace('.', ',')} Std.)` : '';
  return text + std;
}

export function textAntrag(a: AbwesenheitDoc, id: string): Meldung {
  return {
    title: istZa(a) ? 'Neuer Antrag auf Zeitausgleich' : 'Neuer Urlaubsantrag',
    body: `${a.userName ?? 'Ein Mitarbeiter'}: ${umfangKurz(a)}`,
    link: '/vacations',
    tag: `antrag-${id}`,
  };
}

export function textEntscheidung(a: AbwesenheitDoc, id: string): Meldung {
  const was = istZa(a) ? 'Zeitausgleich' : 'Urlaub';
  const wie = a.status === 'Genehmigt' ? 'genehmigt' : a.status === 'Abgelehnt' ? 'abgelehnt' : 'zurückgenommen';
  return {
    title: `${was} ${wie}`,
    body: umfangKurz(a),
    link: '/vacations',
    // Dieselbe Kennung wie der Antrag: die Entscheidung ersetzt ihn.
    tag: `antrag-${id}`,
  };
}

/**
 * Die Krankmeldung ans Büro. Der Titel sagt nur „Krankmeldung" — keine
 * Anmerkung, nichts, was auf einem fremden Sperrbildschirm mehr verriete.
 */
export function textKrankmeldung(a: AbwesenheitDoc, id: string): Meldung {
  return {
    title: 'Krankmeldung',
    body: `${a.userName ?? 'Ein Mitarbeiter'}: ${zeitraumKurz(a)}`,
    link: '/vacations',
    tag: `krank-${id}`,
  };
}
