/**
 * Wie Zeit, Größe und Art in den Nachrichten stehen — ohne Oberfläche, damit
 * es sich prüfen lässt.
 */
import type { KanalArt } from '@/lib/db/nachrichten';

const WIEN = 'Europe/Vienna';

function tag(d: Date): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: WIEN }).format(d);
}

/**
 * „09:41“ heute, „gestern 18:02“, „Mo 07:15“ in dieser Woche, sonst
 * „05.11.2026 07:15“ — in Wiener Zeit, wie überall in der App.
 */
export function zeitText(iso: string, jetzt: Date = new Date()): string {
  const d = new Date(iso);
  const uhr = d.toLocaleTimeString('de-AT', { hour: '2-digit', minute: '2-digit', timeZone: WIEN });
  const heute = tag(jetzt);
  const gestern = tag(new Date(jetzt.getTime() - 86_400_000));
  const t = tag(d);
  if (t === heute) return uhr;
  if (t === gestern) return `gestern ${uhr}`;
  const tage = (Date.parse(`${heute}T00:00:00Z`) - Date.parse(`${t}T00:00:00Z`)) / 86_400_000;
  if (tage > 0 && tage < 7) {
    return `${d.toLocaleDateString('de-AT', { weekday: 'short', timeZone: WIEN }).replace('.', '')} ${uhr}`;
  }
  return `${d.toLocaleDateString('de-AT', { day: '2-digit', month: '2-digit', year: 'numeric', timeZone: WIEN })} ${uhr}`;
}

/** „09:41“ — die Uhrzeit an der Nachricht; den Tag nennt der Trenner darüber. */
export function uhrText(iso: string): string {
  return new Date(iso).toLocaleTimeString('de-AT', { hour: '2-digit', minute: '2-digit', timeZone: WIEN });
}

/** Der Kalendertag in Wiener Zeit — gleich heißt: derselbe Trenner. */
export function tagVon(iso: string): string {
  return tag(new Date(iso));
}

/**
 * Der Trenner im Verlauf: „Heute“, „Gestern“, sonst „Mittwoch, 5. November“
 * — mit Jahr, wenn es nicht das laufende ist.
 */
export function tagText(iso: string, jetzt: Date = new Date()): string {
  const d = new Date(iso);
  const t = tag(d);
  if (t === tag(jetzt)) return 'Heute';
  if (t === tag(new Date(jetzt.getTime() - 86_400_000))) return 'Gestern';
  const mitJahr = t.slice(0, 4) !== tag(jetzt).slice(0, 4);
  return d.toLocaleDateString('de-AT', {
    weekday: 'long', day: 'numeric', month: 'long', ...(mitJahr ? { year: 'numeric' } : {}), timeZone: WIEN,
  });
}

/**
 * Nachrichten derselben Person dicht hintereinander (bis 5 Minuten) stehen
 * als eine Gruppe: Name nur über der ersten, wenig Abstand dazwischen.
 */
export const GRUPPE_MS = 5 * 60_000;

/**
 * Nach so langer Stille steht über der nächsten Nachricht wieder eine Zeile
 * mit Tag und Uhrzeit (E71) — am Tageswechsel ohnehin. Eine Viertelstunde:
 * kürzer, und ein lebhaftes Gespräch stünde voller Zeitzeilen; länger, und
 * Vormittag und Nachmittag desselben Tages flössen ineinander.
 */
export const PAUSE_MS = 15 * 60_000;

/** „AH“ für Anna Huber, „B“ für Büro — das Kürzel im Posteingang. */
export function kuerzel(name: string): string {
  const teile = name.split(/\s+/).map((w) => w.replace(/^[^\p{L}]+/u, '')).filter((w) => /^\p{L}/u.test(w));
  if (teile.length === 0) return '·';
  const erst = teile[0][0];
  const letzt = teile.length > 1 ? teile[teile.length - 1][0] : '';
  return `${erst}${letzt}`.toLocaleUpperCase('de-AT');
}

/** „830 KB“, „2,4 MB“ */
export function groesseText(bytes: number): string {
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1).replace('.', ',')} MB`;
}

export const ART_TEXT: Record<KanalArt, string> = {
  baustelle: 'Baustelle',
  direkt: 'Direkt',
  runde: 'Runde',
};

/** Ist das ein Bild, das der Browser zeigen kann? HEIC zeigt nur Safari — dort als Datei. */
export function istBild(inhaltsart: string): boolean {
  return /^image\/(jpeg|png|webp)$/.test(inhaltsart);
}

/** Welche Dateien eine Nachricht mitnehmen kann — dieselben wie der Speicher (25 MB je Datei). */
export const DATEI_TYPEN = [
  'image/jpeg', 'image/png', 'image/webp', 'image/heic', 'application/pdf',
  'application/msword', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.ms-excel', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
];
export const DATEI_HOECHSTENS = 25 * 1024 * 1024;

/** Warum eine Datei nicht mitgeht — oder `null`. */
export function dateiPruefen(f: { name: string; size: number; type: string }): string | null {
  if (!DATEI_TYPEN.includes(f.type)) return `„${f.name}“: Diese Art von Datei geht nicht mit — Bilder, PDF, Word und Excel schon.`;
  if (f.size > DATEI_HOECHSTENS) return `„${f.name}“ ist größer als 25 MB.`;
  if (f.size === 0) return `„${f.name}“ ist leer.`;
  return null;
}

/**
 * Wer in einer Nachricht erwähnt werden kann: „@Name“ am Wortanfang. Gibt die
 * Kennungen der Genannten zurück — nur von Personen, die zur Auswahl stehen.
 */
export function erwaehnteIn(text: string, personen: { uid: string; name: string }[]): string[] {
  const raus = new Set<string>();
  for (const p of personen) {
    const name = p.name.trim();
    if (!name) continue;
    const muster = new RegExp(`(^|\\s)@${name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}(?=$|[\\s.,!?;:])`, 'iu');
    if (muster.test(text)) raus.add(p.uid);
  }
  return [...raus];
}

/** „nachrichten-anna-huber-2026-11-08.json“ — ein Name, der sagt, was drin ist. */
export function exportDateiname(person: string, wann: Date): string {
  const name = person.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/ß/g, 'ss').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'person';
  return `nachrichten-${name}-${wann.toISOString().slice(0, 10)}.json`;
}

/**
 * Eine Maus und eine richtige Tastatur? Dann sendet „Eingabe“ wie in jedem
 * Messenger am Schreibtisch (E71). Am Telefon und Tablet mit Bildschirm-
 * tastatur bleibt „Eingabe“ ein Zeilenumbruch, gesendet wird mit dem Pfeil —
 * wie bei iMessage, sonst ginge jede halbe Nachricht mit dem Zeilenumbruch
 * hinaus.
 */
export function mitMausUndTastatur(): boolean {
  return typeof window !== 'undefined' && typeof window.matchMedia === 'function'
    && window.matchMedia('(hover: hover) and (pointer: fine)').matches;
}

/**
 * Sendet diese Taste die Nachricht? Am Schreibtisch „Eingabe“, mit Umschalt
 * (oder Alt) eine neue Zeile; überall Strg/⌘ + Eingabe. Nie während einer
 * Zusammensetzung (Akzente, Wortvorschläge, asiatische Eingabe): dort
 * bestätigt „Eingabe“ das Zeichen, nicht die Nachricht.
 */
export function sendetMitTaste(
  ev: { key: string; shiftKey: boolean; altKey: boolean; ctrlKey: boolean; metaKey: boolean; nativeEvent?: { isComposing?: boolean }; keyCode?: number },
  amSchreibtisch: boolean,
): boolean {
  if (ev.key !== 'Enter') return false;
  if (ev.nativeEvent?.isComposing || ev.keyCode === 229) return false;
  if (ev.ctrlKey || ev.metaKey) return true;
  return amSchreibtisch && !ev.shiftKey && !ev.altKey;
}
