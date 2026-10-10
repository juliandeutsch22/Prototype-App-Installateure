import type { TimeEntry } from '@/types';
import { normProjectNumber } from '@/lib/time';
import { buchungKonflikt } from '@/lib/tagesbuchungen';

/**
 * EINE ZEIT ZWISCHEN BESTEHENDE BUCHUNGEN EINFÜGEN (10.10.2026) — die
 * Rechnung dazu, ohne Oberfläche. Die Datenbank (`public.zeit_einfuegen`)
 * rechnet dasselbe noch einmal und schreibt es in einem Zug; hier steht es,
 * damit die Maske vor dem Buchen zeigt, was aus den anderen Buchungen wird.
 *
 * WOZU. Der Monteur bucht morgens den ganzen Tag auf die Baustelle aus dem
 * Einsatzplan, fährt zwischendurch zu einem Notfall und schreibt dort einen
 * Handwerksschein. Am Abend trägt er die Zeit des Scheins nach — sie fällt
 * mitten in die Tagesbuchung. Statt die Tagesbuchung von Hand zu zerlegen,
 * wird die neue Zeit eingefügt:
 *
 *   A 07:00–16:00 (Pause 30) + Schein B 10:00–12:00
 *   → A 07:00–10:00, B 10:00–12:00, A 12:00–16:00
 *
 * Der Tag bleibt derselbe: Beginn, Ende und Pause, nur die Baustellen teilen
 * ihn sich anders. Die Pause bleibt als Zahl an EINEM Teil — am längeren,
 * weil sie dort am ehesten hingehört und Platz hat.
 *
 * NUR, WAS SICH EINDEUTIG ZERLEGEN LÄSST. Nicht eingefügt wird in eine
 * Buchung derselben Baustelle (dann ist die Zeit schon gebucht — bearbeiten
 * statt doppelt), in eine verrechnete, in eine über Mitternacht und in eine,
 * die die neue Zeit ganz bedeckt würde (sie verschwände — das soll ein
 * Mensch entscheiden). Jeder andere Konflikt des Tages (Urlaub, Zeitausgleich
 * zur selben Stunde …) bleibt ein Konflikt.
 */

export interface Einfuegung {
  id: string;
  projectNumber?: string;
  /** „07:00–16:00“ */
  vorher: string;
  /** Die Spannen danach — eine (gekürzt) oder zwei (geteilt). */
  nachher: string[];
}

export type EinfuegenPlan =
  /** Die neue Zeit lässt sich einfügen; so ändern sich die anderen Buchungen. */
  | { art: 'geht'; aenderungen: Einfuegung[] }
  /** Sie überschneidet sich, lässt sich aber nicht einfügen — warum. */
  | { art: 'nicht'; grund: string };

type Vorhanden = Pick<TimeEntry, 'id' | 'status' | 'projectNumber' | 'startTime' | 'endTime' | 'breakDuration' | 'isBilled'>;

function minuten(hhmm?: string): number | null {
  const m = /^(\d{1,2}):(\d{2})/.exec(hhmm ?? '');
  return m ? Number(m[1]) * 60 + Number(m[2]) : null;
}

const uhr = (min: number) => `${String(Math.floor(min / 60)).padStart(2, '0')}:${String(min % 60).padStart(2, '0')}`;
const spanneText = (von: number, bis: number) => `${uhr(von)}–${uhr(bis)}`;

/** Die Spanne in Minuten, über Mitternacht in den nächsten Tag — wie `buchungKonflikt`. */
function spanne(e: { startTime?: string; endTime?: string }): [number, number] | null {
  const von = minuten(e.startTime);
  const bis = minuten(e.endTime);
  if (von === null || bis === null || von === bis) return null;
  return [von, bis > von ? bis : bis + 24 * 60];
}

/**
 * Was beim Buchen von `neu` mit den anderen Buchungen des Tages geschähe —
 * oder `null`, wenn sich nichts überschneidet, was einzufügen wäre.
 */
export function einfuegenPlan(
  neu: { status: TimeEntry['status']; projectNumber?: string; startTime?: string; endTime?: string },
  vorhandene: Vorhanden[],
): EinfuegenPlan | null {
  if (neu.status !== 'Anwesend') return null;
  const n = spanne(neu);
  const nummer = normProjectNumber(neu.projectNumber);
  if (!n || !nummer) return null;

  const getroffen = vorhandene.filter((v) => {
    if (v.status !== 'Anwesend') return false;
    const s = spanne(v);
    return !!s && s[0] < n[1] && n[0] < s[1];
  });
  if (getroffen.length === 0) return null;

  // Was der Tag ohne die getroffenen Buchungen noch einwendet, bleibt ein Konflikt.
  const getroffenIds = new Set(getroffen.map((v) => v.id));
  if (buchungKonflikt(neu, vorhandene.filter((v) => !getroffenIds.has(v.id)))) return null;

  if (n[1] > 24 * 60) {
    return { art: 'nicht', grund: 'Eine Zeit über Mitternacht lässt sich nicht einfügen — bitte die andere Buchung anpassen.' };
  }

  const aenderungen: Einfuegung[] = [];
  for (const v of [...getroffen].sort((a, b) => (minuten(a.startTime) ?? 0) - (minuten(b.startTime) ?? 0))) {
    const [von, bis] = spanne(v)!;
    const name = `${spanneText(von, bis % (24 * 60))}${v.projectNumber ? ` (${v.projectNumber})` : ''}`;
    if (normProjectNumber(v.projectNumber) === nummer) {
      return { art: 'nicht', grund: `Auf derselben Baustelle ist ${name} schon gebucht — bitte diese Buchung ändern, statt die Zeit einzufügen.` };
    }
    if (v.isBilled) {
      return { art: 'nicht', grund: `${name} ist schon verrechnet und bleibt, wie sie ist — einfügen geht dort nicht.` };
    }
    if (bis > 24 * 60) {
      return { art: 'nicht', grund: `${name} geht über Mitternacht — dort lässt sich nichts einfügen.` };
    }
    if (n[0] <= von && bis <= n[1]) {
      return { art: 'nicht', grund: `Die neue Zeit bedeckt ${name} ganz — bitte diese Buchung zuerst löschen oder ändern.` };
    }
    const pause = v.breakDuration ?? 0;
    const teile: [number, number][] = [];
    if (von < n[0]) teile.push([von, n[0]]);
    if (n[1] < bis) teile.push([n[1], bis]);
    // Die Pause bleibt am längeren Teil; sie muss kürzer sein als er.
    const laengster = teile.reduce((b, t, i) => (t[1] - t[0] > teile[b][1] - teile[b][0] ? i : b), 0);
    const [lv, lb] = teile[laengster];
    if (pause >= lb - lv) {
      return {
        art: 'nicht',
        grund: `Die Pause von ${pause} Min. aus ${name} passt in keinen der verbleibenden Teile — bitte die Pause dort anpassen.`,
      };
    }
    aenderungen.push({
      id: v.id,
      projectNumber: v.projectNumber,
      vorher: spanneText(von, bis),
      nachher: teile.map(([a, b]) => spanneText(a, b)),
    });
  }
  return { art: 'geht', aenderungen };
}

/** Der Satz für die Maske: was beim Buchen aus den anderen Buchungen wird. */
export function einfuegenText(aenderungen: Einfuegung[]): string {
  const teile = aenderungen.map((a) =>
    `${a.projectNumber ? `${a.projectNumber} ` : ''}${a.vorher} wird zu ${a.nachher.join(' und ')}`);
  return `Die Zeit überschneidet sich mit einer anderen Buchung und wird beim Buchen dazwischen eingefügt: ${teile.join('; ')}. Die Pause bleibt am längeren Teil.`;
}
