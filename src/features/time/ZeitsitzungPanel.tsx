import ConfirmDialog from '@/components/ConfirmDialog';
import type { TimerEntwurf } from '@/lib/zeitsitzungSpeicher';
import { gemerkterFeldsatz } from '@/lib/db/zeitfelder';
import { angabenText } from '@/lib/zeitfelder';
import { datumAusMs } from '@/lib/datum';
import type { AppUser } from '@/types';
import { useState } from 'react';
import { useAuth } from '@/app/AuthContext';
import { grundAus } from '@/lib/fehlerGrund';
import { timerAbschnittVerwerfen, timerBuchen, letzterTimerEntwurf, timerEntwurfVerwerfen } from '@/lib/db/zeitsitzungen';
import { timerOrtszeit } from '@/lib/zeitsitzung';
import { datumAT } from '@/lib/datum';
import Card from '@/components/Card';
import Button from '@/components/Button';
import BottomSheet from '@/components/BottomSheet';
import { InputField } from '@/components/Field';
import { List, ListRow } from '@/components/ListRow';
import { useToast } from '@/components/Toast';
import TimeForm from './TimeForm';
import { useZeitsitzung } from './zeitsitzungStand';

/**
 * ABSCHNITTE PRÜFEN (M06a) — nach „Stoppen und prüfen“ bestätigt man jeden
 * Arbeitsabschnitt im gewohnten Formular, verwirft ihn begründet oder
 * übernimmt einen gesicherten Entwurf. Starten, Pause und Stopp stehen seit
 * dem 08.11.2026 auf der Karte „Arbeitstag“ (`ArbeitstagKarte`); beide lesen
 * denselben Stand (`useZeitsitzung`).
 */
export default function ZeitsitzungPanel({ profil }: { profil?: AppUser | null }) {
  const { user } = useAuth();
  const { sitzungen, offen, fehler, setFehler, speichert, setSpeichert, laden, befehl } = useZeitsitzung();
  const [auswahl, setAuswahl] = useState<{ id: string; index: number; entwurf?: TimerEntwurf; manuell?: boolean } | null>(null);
  const [verwerfen, setVerwerfen] = useState<{ id: string; index?: number } | null>(null);
  const [entwurfEntfernen, setEntwurfEntfernen] = useState<TimerEntwurf | null>(null);
  const [grund, setGrund] = useState('');
  const toast = useToast();
  const gewaehlt = sitzungen.find((s) => s.id === auswahl?.id);
  const segment = gewaehlt && auswahl ? gewaehlt.segmente[auswahl.index] : undefined;
  const von = segment && timerOrtszeit(segment.von);
  const bis = segment?.bis && timerOrtszeit(segment.bis);
  if (!user || (!offen.length && !auswahl && !verwerfen)) return null;
  return <>
    <ConfirmDialog open={!!entwurfEntfernen} title="Gesicherten Entwurf entfernen?" message="Die lokal gesicherten Eingaben dieses Versuchs werden entfernt. Vorhandene Buchungen und Aufzeichnungen der Sitzung bleiben erhalten." confirmLabel="Entwurf entfernen" onCancel={() => setEntwurfEntfernen(null)} onConfirm={() => { if (entwurfEntfernen) timerEntwurfVerwerfen(entwurfEntfernen); setEntwurfEntfernen(null); void laden(); }} />
    {offen.length > 0 && <Card title="Abschnitte prüfen" hint="Nach „Stoppen und prüfen“ bestätigst du jeden Arbeitsabschnitt im gewohnten Formular. Dadurch gelten alle bisherigen Prüfungen, Pflichtfelder und Zuschläge. Was nicht gebucht werden soll, verwirfst du mit Grund. Ein vergessener Timer wird nie automatisch gebucht.">
      {fehler && <div role="alert" className="mb-3 text-sm text-danger">{fehler} <button type="button" className="link" onClick={() => void laden()}>Erneut laden</button></div>}
      {offen.map((s) => <div key={s.id} className="mt-4 border-t border-line pt-3">
        <p className="section-label">Arbeitstag · {datumAT(timerOrtszeit(s.segmente[0].von).date)}</p>
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
    </Card>}
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
      <Button disabled={!grund.trim() || speichert} onClick={() => { const s = sitzungen.find((x) => x.id === verwerfen?.id); if (!s || !verwerfen) return; if (verwerfen.index === undefined) void befehl('verwerfen', s, grund).then((ok) => { if (ok) { setVerwerfen(null); setGrund(''); } }); else { setSpeichert(true); void timerAbschnittVerwerfen(s, verwerfen.index, grund).then((stand) => { if (stand === 'queued') toast.info('Verwerfen auf diesem Gerät vorgemerkt'); setVerwerfen(null); setGrund(''); return laden(); }).catch((e) => setFehler(grundAus(e, 'Der Abschnitt konnte nicht verworfen werden.'))).finally(() => setSpeichert(false)); } }}>Begründet verwerfen</Button>
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
