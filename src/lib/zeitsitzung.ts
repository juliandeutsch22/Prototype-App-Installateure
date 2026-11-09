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

/**
 * WAS DIE KARTE „ARBEITSTAG“ ZEIGT — aus den Abschnitten gerechnet, nichts
 * gebucht: die Arbeitszeit bisher (alle Arbeitsabschnitte, der laufende bis
 * jetzt), seit wann der Tag läuft und, in der Pause, seit wann sie dauert.
 */
export function timerDauer(s: Zeitsitzung, jetzt: number): { arbeitMs: number; beginn: string; pauseSeit: string | null; pauseMs: number } {
  let arbeitMs = 0;
  for (const v of s.segmente) {
    if (v.art !== 'arbeit') continue;
    const bis = v.bis ? Date.parse(v.bis) : jetzt;
    arbeitMs += Math.max(0, bis - Date.parse(v.von));
  }
  const letzte = s.segmente[s.segmente.length - 1];
  const inPause = s.stand === 'pause' && letzte?.art === 'pause' && !letzte.bis;
  return {
    arbeitMs,
    beginn: s.segmente[0]?.von ?? s.aktualisiert_am,
    pauseSeit: inPause ? letzte.von : null,
    pauseMs: inPause ? Math.max(0, jetzt - Date.parse(letzte.von)) : 0,
  };
}

/** „4:17:32“ bzw. ohne Sekunden „4:17“ — Stunden ohne führende Null, wie auf einer Stoppuhr. */
export function dauerText(ms: number, mitSekunden = true): string {
  const s = Math.floor(Math.max(0, ms) / 1000);
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sek = s % 60;
  const zwei = (n: number) => String(n).padStart(2, '0');
  return mitSekunden ? `${h}:${zwei(m)}:${zwei(sek)}` : `${h}:${zwei(m)}`;
}

/** Die Baustelle, auf der gerade gearbeitet wird (der letzte Arbeitsabschnitt). */
export function timerBaustelle(s: Zeitsitzung): string {
  return [...s.segmente].reverse().find((v) => v.art === 'arbeit')?.baustelle ?? '';
}
