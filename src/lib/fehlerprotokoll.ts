/**
 * Fehler aus der App ins eigene Protokoll — ohne Inhaltsdaten.
 *
 * WARUM ÜBERHAUPT. Ein Absturz landete bisher nur in der Konsole des Geräts.
 * Auf der Baustelle schaut dort niemand hin; man erfuhr nur, was jemand
 * meldete, und meistens meldet niemand etwas — er hört auf, die App zu
 * benutzen.
 *
 * WARUM NICHT EIN DIENST WIE SENTRY. Der schickte Bildschirminhalte, Adressen
 * und Eingaben an einen weiteren Anbieter in einem weiteren Land, mit einem
 * weiteren Auftragsverarbeitungsvertrag. Das eigene Protokoll liegt in
 * derselben Datenbank wie alles andere, und was hineingeht, ist hier
 * festgelegt und geputzt.
 *
 * WAS NICHT HINEINGEHT: Formularinhalte, die Adresse samt Suchbegriff, die
 * Kennung eines Kunden in der Adresse, Text in Anführungszeichen (dort
 * stehen in dieser App Namen: „Huber" gibt es bereits), E-Mail-Adressen und
 * lange Ziffernfolgen (Telefon, IBAN).
 */
import { fehlerEintragen, type NeuerFehlerEintrag } from '@/lib/db/fehlerprotokoll';
import { istNachladeFehler } from '@/lib/nachladen';
import { FASSUNG } from '@/lib/fassung';

/** Höchstens so viele Einträge je geladener Seite — eine Schleife schreibt sonst weiter. */
const HOECHSTENS_JE_SEITE = 20;
/** Derselbe Fehler kommt frühestens nach dieser Pause wieder ins Protokoll. */
const RUHE_MS = 10 * 60 * 1000;

const zuletzt = new Map<string, number>();
let geschrieben = 0;
let letzter: { nachricht: string; zeit: number } | null = null;

/**
 * Inhaltsdaten aus einer Fehlermeldung nehmen.
 *
 * Die Regeln sind grob, und das ist gewollt: eine Meldung, der ein Wort zu
 * viel fehlt, ist immer noch eine Spur. Eine, in der ein Kundenname steht,
 * ist ein Datenschutzvorfall.
 */
export function bereinige(text: string, max = 500): string {
  return text
    .replace(/[\w.+-]+@[\w-]+(\.[\w-]+)+/g, '[E-Mail]')
    .replace(/=\([^)]*\)/g, '=(…)')
    .replace(/„[^“”"]*[“”"]/g, '„…“')
    .replace(/"[^"\n]*"/g, '"…"')
    .replace(/\d[\d /-]{5,}\d/g, '#')
    .trim()
    .slice(0, max);
}

/**
 * Welche Ansicht — ohne die Kennung darin.
 *
 * `/customers/3f1c…` verriete, WELCHER Kunde geöffnet war. Für die Suche
 * nach dem Fehler genügt „eine Kundenakte". Suchbegriff und Anker bleiben
 * ganz weg: `?suche=Huber` ist Inhalt.
 */
export function ansichtOhneKennung(pfad: string): string {
  return pfad
    .split(/[?#]/)[0]
    .replace(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi, ':id')
    .slice(0, 200);
}

/**
 * Fehler, die keine sind — oder keine, an denen die App etwas ändern kann.
 *
 * Ein Nachladefehler heilt sich selbst durch Neuladen (lib/nachladen.ts); ein
 * abgebrochener Abruf ohne Netz ist Baustellenalltag; „Script error." kommt
 * aus fremden Skripten (Erweiterungen des Browsers) und sagt nichts. Das
 * Protokoll soll zeigen, was kaputt ist — nicht rauschen.
 */
export function istRauschen(nachricht: string, name = ''): boolean {
  if (!nachricht.trim()) return true;
  if (istNachladeFehler({ name, message: nachricht })) return true;
  if (name === 'AbortError') return true;
  return /^Script error\.?$|ResizeObserver loop|Failed to fetch|NetworkError when attempting|Load failed|Network request failed/i.test(
    nachricht,
  );
}

function alsFehler(grund: unknown): { name: string; nachricht: string; stapel?: string } {
  if (grund instanceof Error) {
    return { name: grund.name, nachricht: grund.message, stapel: grund.stack };
  }
  if (typeof grund === 'string') return { name: '', nachricht: grund };
  try {
    return { name: '', nachricht: JSON.stringify(grund) ?? String(grund) };
  } catch {
    return { name: '', nachricht: String(grund) };
  }
}

function umgebung(): Pick<NeuerFehlerEintrag, 'pfad' | 'fassung' | 'geraet'> {
  return {
    pfad: ansichtOhneKennung(window.location.pathname),
    fassung: FASSUNG.slice(0, 40),
    geraet: navigator.userAgent.slice(0, 300),
  };
}

/**
 * Einen Absturz oder unbehandelten Fehler festhalten — ohne je selbst zu werfen.
 *
 * Ein Fehler beim Melden eines Fehlers darf nichts auslösen: keine Tafel,
 * keine zweite Meldung, keine Schleife. Deshalb wird alles verschluckt.
 */
export function fehlerErfassen(art: 'absturz' | 'fehler', grund: unknown, zusatz?: string): void {
  try {
    const f = alsFehler(grund);
    if (istRauschen(f.nachricht, f.name)) return;
    if (typeof navigator !== 'undefined' && navigator.onLine === false) return;

    const nachricht = bereinige(`${f.name && f.name !== 'Error' ? `${f.name}: ` : ''}${f.nachricht}`);
    letzter = { nachricht, zeit: Date.now() };

    const schluessel = `${art}|${nachricht}`;
    const vorher = zuletzt.get(schluessel);
    if (vorher !== undefined && Date.now() - vorher < RUHE_MS) return;
    if (geschrieben >= HOECHSTENS_JE_SEITE) return;
    zuletzt.set(schluessel, Date.now());
    geschrieben += 1;

    // Der Stapel trägt Dateinamen und Zeilennummern des Bundles, keine
    // Inhalte; der Komponentenstapel nur Namen von Bausteinen.
    const stapel = [f.stapel, zusatz].filter(Boolean).join('\n').slice(0, 4000) || null;
    void fehlerEintragen({ art, nachricht, stapel, ...umgebung() }).catch(() => undefined);
  } catch {
    /* siehe oben: nie werfen */
  }
}

/**
 * Was zuletzt schiefging — für „Problem melden", wenn es gerade eben war.
 *
 * Wer nach einem Fehler auf „Problem melden" tippt, meint meistens genau den.
 * Nach zehn Minuten ist die Verbindung nicht mehr sicher, und eine falsche
 * Spur ist schlechter als keine.
 */
export function letzterFehler(): string | undefined {
  if (!letzter || Date.now() - letzter.zeit > RUHE_MS) return undefined;
  return letzter.nachricht;
}

/**
 * Ein Problem von Hand melden — an den Senklot-Support, dorthin geht jede
 * Meldung (das setzt die Datenbank). Wirft, damit die Maske sagen kann, dass
 * es nicht ging.
 */
export async function problemMelden(beschreibung: string): Promise<void> {
  const text = beschreibung.trim();
  if (!text) throw new Error('Bitte beschreiben, was passiert ist.');
  await fehlerEintragen({
    art: 'meldung',
    beschreibung: text.slice(0, 2000),
    nachricht: letzterFehler() ?? null,
    ...umgebung(),
  });
}

/**
 * Die Fehler, die an React vorbeigehen.
 *
 * Die Fehlergrenze fängt nur, was beim ZEICHNEN scheitert. Ein Fehler in
 * einem Klick oder ein abgelehntes Versprechen, das niemand auffängt, landet
 * hier — und sonst nirgends.
 */
export function fehlerBeobachten(): () => void {
  const beiFehler = (e: ErrorEvent) => fehlerErfassen('fehler', e.error ?? e.message);
  const beiAblehnung = (e: PromiseRejectionEvent) => fehlerErfassen('fehler', e.reason);
  window.addEventListener('error', beiFehler);
  window.addEventListener('unhandledrejection', beiAblehnung);
  return () => {
    window.removeEventListener('error', beiFehler);
    window.removeEventListener('unhandledrejection', beiAblehnung);
  };
}

/** Nur für die Prüfungen: den Zustand einer geladenen Seite zurücksetzen. */
export function _zuruecksetzen(): void {
  zuletzt.clear();
  geschrieben = 0;
  letzter = null;
}
