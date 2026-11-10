import { timerStandKey, timerStandLesen, timerStandMerken, timerEntwurfMerken, timerEntwuerfeLesen, timerEntwurfEntfernen, type TimerEntwurf } from '@/lib/zeitsitzungSpeicher';
import { istNetzfehler } from '@/lib/sync/netzfehler';
import { beimNutzerwechsel } from '@/lib/liveSpeicher';
import { derClient } from './pg/kern';
import { vorgangOhneEmpfang, wartendeVorgaenge } from './pg/ohneEmpfang';
import { objektAlsZeile } from './pg/felder';
import { timerFortschreiben, type TimerBefehl, type Zeitsitzung } from '@/lib/zeitsitzung';
import type { TimeEntry } from '@/types';

let cacheSchluessel: string | null = null;
const ladeStand = new Map<string, number>();
beimNutzerwechsel(() => { if (cacheSchluessel) { try { localStorage.removeItem(cacheSchluessel); } catch { /* Privates Fenster. */ } cacheSchluessel = null; ladeStand.clear(); } });
export function timerMerken(companyId: string, uid: string, sitzungen: Zeitsitzung[]) {
  cacheSchluessel = timerStandKey(companyId, uid);
  ladeStand.set(cacheSchluessel, (ladeStand.get(cacheSchluessel) ?? 0) + 1);
  timerStandMerken(companyId, uid, sitzungen);
}
export async function zeitsitzungenLaden(companyId: string, uid: string): Promise<Zeitsitzung[]> {
  const key = `senklot.timer.${uid}@${companyId}`;
  const nr = (ladeStand.get(key) ?? 0) + 1; ladeStand.set(key, nr);
  const gemerkt = timerStandLesen(companyId, uid);
  const entwuerfe = timerEntwuerfeLesen(companyId, uid);
  const wartend = await wartendeVorgaenge();
  const c = derClient();
  let zeilen: Zeitsitzung[] = [];
  let fehler: { message: string } | null = null;
  let cursor: string | undefined;
  for (;;) {
    let abfrage = c.from('zeitsitzungen').select('*', { count: 'exact' }).eq('company_id', companyId).eq('user_id', uid).eq('abgeschlossen', false).neq('stand', 'verworfen').order('id').limit(500);
    if (cursor) abfrage = abfrage.gt('id', cursor);
    const { data, error, count } = await abfrage;
    if (error) { fehler = error; break; }
    const seite = (data ?? []) as Zeitsitzung[];
    zeilen.push(...seite);
    if (!seite.length || (count !== null ? count <= seite.length : seite.length < 500)) break;
    cursor = seite[seite.length - 1].id;
  }
  if (fehler) {
    if (!istNetzfehler(fehler)) throw new Error(fehler.message);
    if (!gemerkt && !wartend.some((v) => v.uid === uid && (v.daten.parameter as { p_art?: string } | undefined)?.p_art === 'start') && !entwuerfe.length) throw new Error('Ohne Verbindung fehlt der letzte Timer-Stand. Bitte einmal mit Verbindung laden.');
    zeilen = gemerkt ?? [];
  }
  const sitzungen = new Map<string, Zeitsitzung>((zeilen ?? []).map((s) => [s.id, { ...s, segmente: s.segmente.map((v) => ({ ...v, vorgemerkt: false })) }]));
  // Auch nach einem Neuladen im Funkloch kommt der Zustand aus dem dauerhaften
  // Ausgangsfach, nicht aus einem zweiten, auseinanderlaufenden Speicher.
  for (const v of wartend) {
    if (v.uid !== uid || v.daten.funktion !== 'zeit_timer_befehl') continue;
    const b = v.daten.parameter as unknown as TimerBefehl;
    const s = sitzungen.get(b.p_id) ?? null;
    if (!s || s.revision === b.p_revision) sitzungen.set(b.p_id, timerFortschreiben(s, b, companyId, uid));
  }
  for (const d of entwuerfe) {
    let s = sitzungen.get(d.basis.id);
    if (!s) {
      let lookupFehler = false;
      if (!fehler) {
        const antwort = await c.from('zeitsitzungen').select('*').eq('company_id', companyId).eq('user_id', uid).eq('id', d.basis.id).maybeSingle();
        lookupFehler = !!antwort.error;
        if (antwort.data) s = antwort.data as Zeitsitzung;
      }
      s ??= { ...d.basis, nurLokal: !fehler && !lookupFehler };
      sitzungen.set(s.id, s);
    }
    const wartet = wartend.some((v) => v.uid === uid && (v.daten.timer as { kennung?: string } | undefined)?.kennung === d.kennung);
    s.entwuerfe ??= [];
    s.entwuerfe.push({ ...d, wartet });
    // Vorgemerkt ist der ganze gebuchte Zeitraum, nicht nur sein erster Abschnitt.
    if (wartet) {
      for (let i = d.segment; i <= (d.bis ?? d.segment); i += 1) {
        if (s.segmente[i]?.art === 'arbeit') s.segmente[i] = { ...s.segmente[i], vorgemerkt: true };
      }
    }
  }
  const stand = [...sitzungen.values()].sort((a, b) => Date.parse(b.aktualisiert_am) - Date.parse(a.aktualisiert_am));
  if (ladeStand.get(key) === nr) timerMerken(companyId, uid, stand);
  return stand;
}
export async function timerSenden(b: TimerBefehl) {
  return vorgangOhneEmpfang({ art: 'aufruf', tabelle: 'zeitsitzungen', zeile: b.p_id,
    daten: { funktion: 'zeit_timer_befehl', parameter: b } });
}
/** Ein fehlgeschlagener Nachsendeversuch verliert seine Eingaben nicht mit dem Ausgangsfach. */
async function abschlussSenden(s: Zeitsitzung, segment: number, art: TimerEntwurf['art'], eintrag?: Partial<TimeEntry>, grund?: string, bis = segment) {
  const basis = { ...s }; delete basis.entwuerfe;
  const d: TimerEntwurf = { kennung: crypto.randomUUID(), art, companyId: s.company_id, uid: s.user_id, segment, ...(art === 'buchen' ? { bis } : {}), basis, eintrag, grund, angelegtAm: Date.now() };
  // Gebucht wird ein Zeitraum (E73) — Arbeit, Pausen, Arbeit derselben Baustelle als eine Buchung.
  const funktion = art === 'buchen' ? 'zeit_timer_zeitraum_buchen' : 'zeit_timer_abschnitt_verwerfen';
  const parameter = art === 'buchen'
    ? { p_id: s.id, p_von: segment, p_bis: bis, p_eintrag: objektAlsZeile('time_entries', eintrag ?? {}) }
    : { p_id: s.id, p_segment: segment, p_grund: grund };
  if (!timerEntwurfMerken(d)) {
    // Ohne dauerhaften Entwurf kein Nachsendeversprechen — direkte Bestätigung bleibt möglich.
    const { error } = await derClient().rpc(funktion, parameter);
    if (error) throw new Error('Der Browser konnte keinen dauerhaften Entwurf sichern und der Server hat nicht bestätigt. Bitte Speicher freigeben oder mit Verbindung erneut versuchen.');
    return 'confirmed' as const;
  }
  try {
    const stand = await vorgangOhneEmpfang({ art: 'aufruf', tabelle: 'zeitsitzungen', zeile: s.id, daten: { funktion, parameter, timer: { uid: s.user_id, companyId: s.company_id, kennung: d.kennung } } });
    if (stand === 'confirmed') timerEntwurfEntfernen(d);
    return stand;
  } catch (e) { timerEntwurfMerken({ ...d, fehler: e instanceof Error ? e.message : 'Der Server hat den Vorgang nicht bestätigt.' }); throw e; }
}
/** Einen Zeitraum der Sitzung buchen — `von` bis `bis` sind Arbeitsabschnitte, die Pausen dazwischen gehören dazu (`timerVorschlaege`). */
export function timerBuchen(s: Zeitsitzung, von: number, bis: number, eintrag: Partial<TimeEntry>) { return abschlussSenden(s, von, 'buchen', eintrag, undefined, bis); }
export function timerAbschnittVerwerfen(s: Zeitsitzung, segment: number, grund: string) { return abschlussSenden(s, segment, 'verwerfen', undefined, grund); }
export function letzterTimerEntwurf(s: Zeitsitzung, segment: number): TimerEntwurf | undefined {
  return timerEntwuerfeLesen(s.company_id, s.user_id).filter((d) => d.basis.id === s.id && d.segment === segment && d.art === 'buchen').pop();
}
export function timerEntwurfVerwerfen(d: TimerEntwurf): void { timerEntwurfEntfernen(d); }
