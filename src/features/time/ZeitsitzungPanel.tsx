import ConfirmDialog from '@/components/ConfirmDialog';
import type { TimerEntwurf } from '@/lib/zeitsitzungSpeicher';
import { gemerkterFeldsatz } from '@/lib/db/zeitfelder';
import { angabenText } from '@/lib/zeitfelder';
import { datumAusMs } from '@/lib/datum';
import type { AppUser } from '@/types';
import { useCallback, useEffect, useRef, useState } from 'react';
import { useAuth } from '@/app/AuthContext';
import { istAn } from '@/lib/module';
import { grundAus } from '@/lib/fehlerGrund';
import { timerAbschnittVerwerfen, timerBuchen, timerSenden, timerMerken, zeitsitzungenLaden, letzterTimerEntwurf, timerEntwurfVerwerfen } from '@/lib/db/zeitsitzungen';
import { timerFortschreiben, timerOrtszeit, type TimerArt, type Zeitsitzung } from '@/lib/zeitsitzung';
import { FACH_GELEERT } from '@/lib/sync/ausgangsfach';
import { datumAT } from '@/lib/datum';
import Card from '@/components/Card';
import Button from '@/components/Button';
import BottomSheet from '@/components/BottomSheet';
import BaustellenSelect from '@/components/BaustellenSelect';
import { InputField } from '@/components/Field';
import { List, ListRow } from '@/components/ListRow';
import { useToast } from '@/components/Toast';
import TimeForm from './TimeForm';

export default function ZeitsitzungPanel({ profil }: { profil?: AppUser | null }) {
  const { user, company } = useAuth();
  const an = istAn(company?.modules, 'zeiterfassung.timer');
  const [sitzungen, setSitzungen] = useState<Zeitsitzung[]>([]);
  const [geladen, setGeladen] = useState(false);
  const [fehler, setFehler] = useState<string | null>(null);
  const [speichert, setSpeichert] = useState(false);
  const [baustelle, setBaustelle] = useState('');
  const [auswahl, setAuswahl] = useState<{ id: string; index: number; entwurf?: TimerEntwurf; manuell?: boolean } | null>(null);
  const [verwerfen, setVerwerfen] = useState<{ id: string; index?: number } | null>(null);
  const [entwurfEntfernen, setEntwurfEntfernen] = useState<TimerEntwurf | null>(null);
  const [grund, setGrund] = useState('');
  const [jetzt, setJetzt] = useState(Date.now());
  const toast = useToast();
  const uid = user?.uid, firma = user?.companyId;
  const ladeNummer = useRef(0);
  const laden = useCallback(async () => {
    if (!firma || !uid) return;
    const nr = ++ladeNummer.current;
    try { const stand = await zeitsitzungenLaden(firma, uid); if (nr !== ladeNummer.current) return; setSitzungen(stand); setGeladen(true); setFehler(null); }
    catch (e) { if (nr === ladeNummer.current) setFehler(grundAus(e, 'Der Timer konnte nicht geladen werden.')); }
  }, [firma, uid]);
  const abgleichen = an || sitzungen.some((s) => s.stand !== 'verworfen' && !s.abgeschlossen);
  useEffect(() => {
    void laden();
    const intervall = abgleichen ? window.setInterval(() => { setJetzt(Date.now()); if (document.visibilityState === 'visible') void laden(); }, 30_000) : null;
    const wiederDa = () => { void laden(); };
    window.addEventListener('online', wiederDa); window.addEventListener(FACH_GELEERT, wiederDa);
    return () => { if (intervall !== null) window.clearInterval(intervall); window.removeEventListener('online', wiederDa); window.removeEventListener(FACH_GELEERT, wiederDa); };
  }, [laden, abgleichen]);
  const laeuft = sitzungen.find((s) => s.stand === 'laeuft' || s.stand === 'pause');
  const offen = sitzungen.filter((s) => (s.stand === 'beendet' && !s.abgeschlossen) || !!s.entwuerfe?.length);
  const ausSitzung = useRef<string | null>(null);
  useEffect(() => { if (laeuft && ausSitzung.current !== laeuft.id) { ausSitzung.current = laeuft.id; setBaustelle([...laeuft.segmente].reverse().find((s) => s.art === 'arbeit')?.baustelle ?? ''); } }, [laeuft]);
  if (!user || (!an && !laeuft && !offen.length)) return null;
  async function befehl(art: TimerArt, s?: Zeitsitzung, begruendung?: string) {
    if (!firma || !uid || speichert) return;
    setSpeichert(true); setFehler(null); ladeNummer.current += 1;
    const b = { p_id: s?.id ?? crypto.randomUUID(), p_befehl: crypto.randomUUID(), p_revision: s?.revision ?? 0,
      p_art: art, p_zeit: new Date().toISOString(), p_baustelle: begruendung ?? baustelle };
    try {
      const stand = await timerSenden(b);
      if (stand === 'queued') {
        const neu = timerFortschreiben(s ?? null, b, firma, uid);
        setSitzungen((alt) => { const stand = [neu, ...alt.filter((x) => x.id !== neu.id)]; timerMerken(firma, uid, stand); return stand; });
        toast.info('Timer-Schritt auf diesem Gerät vorgemerkt. Er wird bei Verbindung gesendet.');
      } else await laden();
      setVerwerfen(null); setGrund('');
    } catch (e) { setFehler(grundAus(e, 'Der Timer-Schritt konnte nicht übernommen werden.')); }
    finally { setSpeichert(false); }
  }
  const gewaehlt = sitzungen.find((s) => s.id === auswahl?.id);
  const segment = gewaehlt && auswahl ? gewaehlt.segmente[auswahl.index] : undefined;
  const von = segment && timerOrtszeit(segment.von);
  const bis = segment?.bis && timerOrtszeit(segment.bis);
  const ueberfaellig = istAn(company?.modules, 'zeiterfassung.timer_erinnerung') && laeuft && jetzt - Date.parse(laeuft.weiterlaufen_am ?? laeuft.segmente[0].von) >= (company?.timerErinnerungMin ?? 600) * 60_000;
  return <>
    <ConfirmDialog open={!!entwurfEntfernen} title="Gesicherten Entwurf entfernen?" message="Die lokal gesicherten Eingaben dieses Versuchs werden entfernt. Vorhandene Buchungen und Aufzeichnungen der Sitzung bleiben erhalten." confirmLabel="Entwurf entfernen" onCancel={() => setEntwurfEntfernen(null)} onConfirm={() => { if (entwurfEntfernen) timerEntwurfVerwerfen(entwurfEntfernen); setEntwurfEntfernen(null); void laden(); }} />
    <Card title="Start / Stopp" hint="Der Timer sammelt Anwesenheit, Pausen und Baustellenwechsel. Erst nach Stopp bestätigst du jeden Arbeitsabschnitt im gewohnten Formular. Dadurch gelten alle bisherigen Prüfungen, Pflichtfelder und Zuschläge. Ein vergessener Timer wird nie automatisch gebucht. Ohne Empfang warten Schritte im Ausgangsfach; ein anderer Gerätestand wird als Konflikt gemeldet.">
      {fehler && <div role="alert" className="mb-3 text-sm text-danger">{fehler} <button type="button" className="link" onClick={() => void laden()}>Erneut laden</button></div>}
      {laeuft ? <p className="mb-3 font-semibold">{laeuft.stand === 'pause' ? 'In Pause' : 'Läuft'} seit {timerOrtszeit(laeuft.segmente[laeuft.segmente.length - 1].von).time} Uhr</p> : <p className="mb-3 text-sm text-ink-muted">Erfasse deinen Arbeitstag oder trage Zeiten weiterhin direkt unten ein.</p>}
      {ueberfaellig && <p role="status" className="mb-3 text-sm text-ink">Der Timer läuft schon länger. Bitte prüfen: beenden und Zeiten berichtigen oder bewusst weiterlaufen lassen.</p>}
      {an && <BaustellenSelect id="timer-baustelle" companyId={user.companyId} meineUid={user.uid} value={baustelle} onChange={(nr) => setBaustelle(nr)} />}
      <div className="mt-3 flex flex-wrap gap-2">
        {!laeuft && an && <Button variant="secondary" disabled={speichert || !geladen} onClick={() => void befehl('start')}>Starten</Button>}
        {laeuft && <>
          <Button variant="secondary" disabled={speichert} onClick={() => void befehl(laeuft.stand === 'pause' ? 'weiter' : 'pause', laeuft)}>{laeuft.stand === 'pause' ? 'Weiterarbeiten' : 'Pause beginnen'}</Button>
          {an && laeuft.stand === 'laeuft' && <Button variant="secondary" disabled={speichert} onClick={() => void befehl('wechsel', laeuft)}>Baustelle wechseln</Button>}
          <Button disabled={speichert} onClick={() => void befehl('stop', laeuft)}>Stoppen und prüfen</Button>
          {ueberfaellig && <Button variant="secondary" disabled={speichert} onClick={() => void befehl('weiterlaufen', laeuft)}>Weiterlaufen lassen</Button>}
          <button type="button" className="link text-sm" disabled={speichert} onClick={() => setVerwerfen({ id: laeuft.id })}>Verwerfen …</button>
        </>}
      </div>
      {offen.map((s) => <div key={s.id} className="mt-4 border-t border-line pt-3">
        <p className="section-label">Abschnitte prüfen · {datumAT(timerOrtszeit(s.segmente[0].von).date)}</p>
        <List>{s.segmente.map((v, index) => <ListRow key={v.id} title={`${timerOrtszeit(v.von).time}–${v.bis ? timerOrtszeit(v.bis).time : '…'} · ${v.art === 'pause' ? 'Pause' : v.baustelle || 'Arbeitszeit'}`}
          subtitle={v.vorgemerkt ? 'Abschluss auf diesem Gerät vorgemerkt' : v.verworfen_grund ? `Nicht gebucht: ${v.verworfen_grund}` : v.buchung ? 'Gebucht' : v.art === 'pause' ? 'Wird nicht als Arbeit gebucht' : 'Noch nicht gebucht'}
          onOeffnen={s.stand === 'beendet' && v.art === 'arbeit' && !v.buchung && !v.verworfen_grund && !v.vorgemerkt ? () => setAuswahl({ id: s.id, index, entwurf: letzterTimerEntwurf(s, index) }) : undefined} pfeil={s.stand === 'beendet' && v.art === 'arbeit' && !v.buchung && !v.verworfen_grund && !v.vorgemerkt}>
          {s.stand === 'beendet' && v.art === 'arbeit' && !v.buchung && !v.verworfen_grund && !v.vorgemerkt && <button type="button" className="link text-sm" onClick={() => setVerwerfen({ id: s.id, index })}>Nicht buchen …</button>}
        </ListRow>)}</List>
        {s.entwuerfe?.filter((d) => !d.wartet).map((d) => <details key={d.kennung} className="my-3 break-words border-t border-line pt-3">
          <summary className="cursor-pointer text-sm">Gesicherter Entwurf · {datumAusMs(d.angelegtAm)}</summary>
          <p className="my-2 text-sm text-ink-muted">{d.fehler ?? 'Dieser Entwurf ist noch nicht vom Server bestätigt. Bitte prüfen.'}</p>
          {d.art === 'buchen' && d.eintrag && <dl className="space-y-1 text-sm">
            <div><dt className="inline">Datum und Zeit: </dt><dd className="inline">{datumAT(d.eintrag.date)} {d.eintrag.startTime}–{d.eintrag.endTime} · {d.eintrag.breakDuration ?? 0} Min. Pause</dd></div>
            <div><dt className="inline">Baustelle: </dt><dd className="inline">{d.eintrag.projectNumber || 'ohne Zuordnung'}</dd></div>
            <div><dt className="inline">Weitere Angaben: </dt><dd className="inline">{d.eintrag.travelTime ?? 0} Min. Wegzeit · {d.eintrag.vehiclePlate || 'kein Fahrzeug'} · {d.eintrag.helperName || 'kein Helfername'}{d.eintrag.isHelper ? ' · Helfereinsatz' : ''}{d.eintrag.isEmergency ? ' · Notdienst' : ''}</dd></div>
            {d.eintrag.comment && <div><dt className="inline">Tätigkeiten: </dt><dd className="inline whitespace-pre-wrap">{d.eintrag.comment}</dd></div>}
            {entwurfAngaben(d).map((text, i) => <div key={i}><dd>{text}</dd></div>)}
          </dl>}
          {d.art === 'verwerfen' && <p className="my-2 text-sm">Grund: {d.grund}</p>}
          {s.nurLokal && <p className="my-2 text-sm text-ink-muted">Die Sitzung liegt noch nicht auf dem Server. Modul und Rechte bitte mit der Administration klären. Der gesicherte Entwurf kann als normaler Nachtrag übernommen werden; keine Zeit wird doppelt automatisch gebucht.</p>}
          {(s.stand === 'laeuft' || s.stand === 'pause') && <p className="my-2 text-sm text-ink-muted">Die Sitzung läuft auf dem Server noch. Bitte zuerst beenden und anschließend den gesicherten Entwurf prüfen.</p>}
          <div className="mt-3 flex flex-wrap gap-2">
            {d.art === 'buchen' && !s.segmente[d.segment]?.buchung && (s.stand === 'beendet' || s.nurLokal || s.stand === 'verworfen') && <Button variant="secondary" onClick={() => setAuswahl({ id: s.id, index: d.segment, entwurf: d, manuell: s.nurLokal || s.stand === 'verworfen' })}>{s.nurLokal || s.stand === 'verworfen' ? 'Als Nachtrag öffnen' : 'Entwurf prüfen'}</Button>}
            <button type="button" className="link text-sm" onClick={() => setEntwurfEntfernen(d)}>Gesicherten Entwurf entfernen</button>
          </div>
        </details>)}
        {s.stand === 'beendet' && !s.segmente.some((v) => v.buchung || v.vorgemerkt) && <button type="button" className="link text-sm" onClick={() => setVerwerfen({ id: s.id })}>Sitzung begründet verwerfen …</button>}
      </div>)}
    </Card>
    <BottomSheet open={!!segment} onClose={() => setAuswahl(null)} label="Timer-Abschnitt prüfen" titel="Timer-Abschnitt prüfen" auchBreit>
      {segment && gewaehlt && auswahl && von && bis && !segment.buchung && !segment.verworfen_grund && !segment.vorgemerkt && <>
        <p className="mb-3 text-sm text-ink-muted">Aufgezeichnet: {datumAT(von.date)} {von.time} bis {datumAT(bis.date)} {bis.time}. Bitte tatsächliche Zeiten und Angaben prüfen.</p>
        <TimeForm baustelleFrei besitzerProfil={profil} key={`${gewaehlt.id}:${auswahl.index}`} vorbelegung={{ date: von.date, startTime: von.time, endTime: bis.time, breakDuration: 0, projectNumber: segment.baustelle, ...auswahl.entwurf?.eintrag }}
          speichernMit={auswahl.manuell ? undefined : (werte) => timerBuchen(gewaehlt, auswahl.index, werte)} onCancel={() => setAuswahl(null)} onSaved={() => { setAuswahl(null); void laden(); }} />
      </>}
      {(segment?.buchung || segment?.verworfen_grund) && <p role="status">Dieser Abschnitt wurde inzwischen abgeschlossen. Bitte die vorhandene Buchung prüfen.</p>}
    </BottomSheet>
    <BottomSheet open={!!verwerfen} onClose={() => setVerwerfen(null)} label="Zeitsitzung verwerfen" titel="Zeitsitzung verwerfen" auchBreit>
      <p className="mb-3 text-sm text-ink-muted">Hieraus wird keine Arbeitszeit gebucht. Der Grund bleibt nachvollziehbar erhalten.</p>
      {fehler && <p role="alert" className="text-sm text-danger">{fehler}</p>}
      <InputField id="timer-grund" label="Begründung" required pflicht value={grund} onChange={(e) => setGrund(e.target.value)} />
      <Button disabled={!grund.trim() || speichert} onClick={() => { const s = sitzungen.find((x) => x.id === verwerfen?.id); if (!s || !verwerfen) return; if (verwerfen.index === undefined) void befehl('verwerfen', s, grund); else { setSpeichert(true); void timerAbschnittVerwerfen(s, verwerfen.index, grund).then((stand) => { if (stand === 'queued') toast.info('Verwerfen auf diesem Gerät vorgemerkt'); setVerwerfen(null); setGrund(''); return laden(); }).catch((e) => setFehler(grundAus(e, 'Der Abschnitt konnte nicht verworfen werden.'))).finally(() => setSpeichert(false)); } }}>Begründet verwerfen</Button>
    </BottomSheet>
  </>;
}

function entwurfAngaben(d: TimerEntwurf): string[] {
  const werte = d.eintrag?.zeitfelder?.werte;
  if (!werte) return [];
  const definitionen = gemerkterFeldsatz(d.companyId)?.definitionen ?? [];
  const vorhanden = Object.fromEntries(Object.entries(werte).filter(([, w]) => w !== null)) as Record<string, string | number | boolean>;
  return [...angabenText(definitionen, vorhanden), ...Object.entries(vorhanden).filter(([id]) => !definitionen.some((f) => f.id === id)).map(([, w], i) => `Frühere Angabe ${i + 1}: ${String(w)}`)];
}
