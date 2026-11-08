import type { TimerEntwurf } from './zeitsitzungSpeicher';
/** Eine Sitzung sammelt Anwesenheit; ihre bestätigten Abschnitte werden normale Buchungen. */
export interface Zeitsegment { id: string; art: 'arbeit' | 'pause'; von: string; bis?: string; baustelle: string; buchung?: string; verworfen_grund?: string; vorgemerkt?: boolean }
export interface Zeitsitzung {
  id: string; company_id: string; user_id: string; stand: 'laeuft' | 'pause' | 'beendet' | 'verworfen'; revision: number;
  segmente: Zeitsegment[]; aktualisiert_am: string; erinnert_am: string | null; weiterlaufen_am?: string | null; abgeschlossen: boolean;
  entwuerfe?: TimerEntwurf[];
  nurLokal?: boolean;
}
export type TimerArt = 'start' | 'pause' | 'weiter' | 'wechsel' | 'stop' | 'verwerfen' | 'weiterlaufen';
export interface TimerBefehl { p_id: string; p_befehl: string; p_revision: number; p_art: TimerArt; p_zeit: string; p_baustelle: string }
/** Lokale Vorschau desselben Befehls, solange er im Ausgangsfach wartet. Keine Buchung. */
export function timerFortschreiben(s: Zeitsitzung | null, b: TimerBefehl, companyId: string, uid: string): Zeitsitzung {
  if (b.p_art === 'start') return { id: b.p_id, company_id: companyId, user_id: uid, stand: 'laeuft', revision: 1,
    segmente: [{ id: b.p_befehl, art: 'arbeit', von: b.p_zeit, baustelle: b.p_baustelle }], aktualisiert_am: b.p_zeit, erinnert_am: null, abgeschlossen: false };
  if (!s || s.revision !== b.p_revision) throw new Error('Die Zeitsitzung hat sich geändert. Bitte aktualisieren.');
  if (b.p_art === 'verwerfen') return { ...s, stand: 'verworfen', revision: s.revision + 1 };
  if (b.p_art === 'weiterlaufen') return { ...s, erinnert_am: b.p_zeit, weiterlaufen_am: b.p_zeit, revision: s.revision + 1 };
  const segmente = s.segmente.map((v, i) => i === s.segmente.length - 1 ? { ...v, bis: b.p_zeit } : v);
  if (b.p_art !== 'stop') segmente.push({ id: b.p_befehl, art: b.p_art === 'pause' ? 'pause' : 'arbeit', von: b.p_zeit, baustelle: b.p_baustelle });
  return { ...s, revision: s.revision + 1, stand: b.p_art === 'stop' ? 'beendet' : b.p_art === 'pause' ? 'pause' : 'laeuft', segmente, aktualisiert_am: b.p_zeit };
}
/** Österreichische Ortszeit, unabhängig von der Zeitzone des Geräts. */
export function timerOrtszeit(zeit: string): { date: string; time: string } {
  const p = new Intl.DateTimeFormat('sv-SE', { timeZone: 'Europe/Vienna', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).formatToParts(new Date(zeit));
  const teil = (typ: string) => p.find((x) => x.type === typ)?.value ?? '';
  return { date: `${teil('year')}-${teil('month')}-${teil('day')}`, time: `${teil('hour')}:${teil('minute')}` };
}
