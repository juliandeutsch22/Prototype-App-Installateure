import ConfirmDialog from '@/components/ConfirmDialog';
import type { TimerEntwurf } from '@/lib/zeitsitzungSpeicher';
import { gemerkterFeldsatz } from '@/lib/db/zeitfelder';
import { angabenText } from '@/lib/zeitfelder';
import { datumAusMs } from '@/lib/datum';
import type { AppUser } from '@/types';
import { useEffect, useMemo, useRef, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '@/app/AuthContext';
import { grundAus } from '@/lib/fehlerGrund';
import { timerAbschnittVerwerfen, timerBuchen, letzterTimerEntwurf, timerEntwurfVerwerfen } from '@/lib/db/zeitsitzungen';
import { dauerText, timerDauer, timerOrtszeit, timerPauseMs, timerVorschlaege, type TimerVorschlag, type Zeitsitzung } from '@/lib/zeitsitzung';
import { datumAT } from '@/lib/datum';
import Card from '@/components/Card';
import Button from '@/components/Button';
import BottomSheet from '@/components/BottomSheet';
import Icon from '@/components/Icon';
import IconButton from '@/components/IconButton';
import { InputField } from '@/components/Field';
import { List, ListRow } from '@/components/ListRow';
import { useToast } from '@/components/Toast';
import TimeForm from './TimeForm';
import { useZeitsitzung } from './zeitsitzungStand';
import { baustellenTitel } from '@/lib/baustellenTitel';
import { useBaustellenAuswahl } from '@/features/nachrichten/useBaustellenAuswahl';

/**
 * ARBEITSTAG PRÜFEN (M06a, neu gefasst in E73 am 10.11.2026) — nach
 * „Stoppen und prüfen“ steht hier, was aus dem Tag gebucht wird.
 *
 * Je Baustelle EINE Zeit von Beginn bis Ende, die Pausen dazwischen als
 * Pausenminuten (`timerVorschlaege`) — so, wie man eine Buchung auch von Hand
 * schreibt. Ein Tipp auf die Zeile öffnet das gewohnte Formular, vorbelegt;
 * dort gelten alle Prüfungen, Pflichtfelder und Zuschläge. Was nicht gebucht
 * werden soll, nimmt der Papierkorb heraus, mit Grund — bei mehreren offenen
 * Zeiten wahlweise alle auf einmal. Vorher gab es je Abschnitt ein Formular
 * mit 0 Minuten Pause und zwei Textlinks zum Verwerfen, die bei einem
 * Abschnitt dasselbe taten.
 *
 * Kommt man über „Stoppen und prüfen“ hierher, öffnet sich die erste offene
 * Zeit gleich im Formular. Starten, Pause und Stopp stehen auf der Karte
 * „Arbeitstag“ (`ArbeitstagKarte`); beide lesen denselben Stand.
 */
interface Auswahl { id: string; von: number; bis: number; pauseMin: number; entwurf?: TimerEntwurf; manuell?: boolean }

export default function ZeitsitzungPanel({ profil }: { profil?: AppUser | null }) {
  const { user } = useAuth();
  const { sitzungen, offen, fehler, setFehler, speichert, setSpeichert, laden } = useZeitsitzung();
  const [auswahl, setAuswahl] = useState<Auswahl | null>(null);
  const [verwerfen, setVerwerfen] = useState<{ id: string; vorschlag: TimerVorschlag } | null>(null);
  const [alleVerwerfen, setAlleVerwerfen] = useState(false);
  const [entwurfEntfernen, setEntwurfEntfernen] = useState<TimerEntwurf | null>(null);
  const [grund, setGrund] = useState('');
  const toast = useToast();
  const ort = useLocation();
  const navigate = useNavigate();
  const geoeffnet = useRef<string | null>(null);
  // Die Baustelle mit Namen wie auf der Karte „Arbeitstag“ — die Nummer allein sagt am Feierabend wenig.
  const baustellen = useBaustellenAuswahl(!!user && offen.length > 0, user?.companyId ?? '', user?.uid ?? '', user?.role ?? 'Mitarbeiter', '');
  const namen = useMemo(() => new Map((baustellen.liste ?? []).map((p) => [p.projectNumber, baustellenTitel(p) || p.projectNumber])), [baustellen.liste]);

  /*
    „STOPPEN UND PRÜFEN“ HÄLT, WAS ES SAGT: wer über den Feierabend-Knopf
    kommt (Karte oder Leiste), landet gleich im Formular der ersten offenen
    Zeit. Einmal je Sitzung; der Hinweis in der Adresse wird danach
    entfernt, damit Zurück oder Neuladen das Formular nicht wieder öffnet.
  */
  const zuPruefen = (ort.state as { pruefen?: string } | null)?.pruefen;
  useEffect(() => {
    if (!zuPruefen || geoeffnet.current === zuPruefen) return;
    const s = offen.find((x) => x.id === zuPruefen);
    if (!s) return;
    geoeffnet.current = zuPruefen;
    const erste = s.stand === 'beendet' ? timerVorschlaege(s).find((v) => v.stand === 'offen') : undefined;
    if (erste) setAuswahl({ id: s.id, von: erste.von, bis: erste.bis, pauseMin: erste.pauseMin, entwurf: letzterTimerEntwurf(s, erste.von) });
    navigate(ort.pathname + ort.search, { replace: true, state: null });
  }, [zuPruefen, offen, navigate, ort.pathname, ort.search]);

  const gewaehlt = sitzungen.find((s) => s.id === auswahl?.id);
  const beginn = gewaehlt && auswahl ? gewaehlt.segmente[auswahl.von] : undefined;
  const ende = gewaehlt && auswahl ? gewaehlt.segmente[auswahl.bis] : undefined;
  const von = beginn && timerOrtszeit(beginn.von);
  const bis = ende?.bis && timerOrtszeit(ende.bis);
  const schonErledigt = !!beginn && (!!beginn.buchung || !!beginn.verworfen_grund);
  const verwerfenSitzung = sitzungen.find((x) => x.id === verwerfen?.id);
  const offeneZeiten = verwerfenSitzung ? timerVorschlaege(verwerfenSitzung).filter((v) => v.stand === 'offen') : [];
  if (!user || (!offen.length && !auswahl && !verwerfen)) return null;

  function oeffnen(s: Zeitsitzung, v: TimerVorschlag) {
    setAuswahl({ id: s.id, von: v.von, bis: v.bis, pauseMin: v.pauseMin, entwurf: letzterTimerEntwurf(s, v.von) });
  }

  async function nichtBuchen() {
    const s = verwerfenSitzung;
    if (!s || !verwerfen || !grund.trim()) return;
    // Alle Arbeitsabschnitte der gewählten Zeiten — jeder einzeln, wiederholbar und ohne Netz vorzumerken.
    const ziele = (alleVerwerfen ? offeneZeiten : [verwerfen.vorschlag]).flatMap((v) => v.arbeit);
    setSpeichert(true);
    setFehler(null);
    try {
      let vorgemerkt = false;
      for (const index of ziele) {
        if ((await timerAbschnittVerwerfen(s, index, grund.trim())) === 'queued') vorgemerkt = true;
      }
      if (vorgemerkt) toast.info('Auf diesem Gerät vorgemerkt — wird bei Verbindung gesendet');
      setVerwerfen(null);
      setGrund('');
      setAlleVerwerfen(false);
      await laden();
    } catch (e) {
      setFehler(grundAus(e, 'Die Zeit konnte nicht herausgenommen werden.'));
    } finally {
      setSpeichert(false);
    }
  }

  return <>
    <ConfirmDialog open={!!entwurfEntfernen} title="Gesicherten Entwurf entfernen?" message="Die lokal gesicherten Eingaben dieses Versuchs werden entfernt. Vorhandene Buchungen und Aufzeichnungen der Sitzung bleiben erhalten." confirmLabel="Entwurf entfernen" onCancel={() => setEntwurfEntfernen(null)} onConfirm={() => { if (entwurfEntfernen) timerEntwurfVerwerfen(entwurfEntfernen); setEntwurfEntfernen(null); void laden(); }} />
    {offen.length > 0 && <Card title="Arbeitstag prüfen" hint="Nach dem Feierabend steht hier, was gebucht wird: je Baustelle eine Zeit von Beginn bis Ende, die Pausen dazwischen eingerechnet. Ein Tipp öffnet das gewohnte Formular, vorbelegt — dort gelten alle Prüfungen, Pflichtfelder und Zuschläge. Was nicht gebucht werden soll, nimmst du mit dem Papierkorb heraus und nennst den Grund; er bleibt nachvollziehbar erhalten. Ein vergessener Timer wird nie automatisch gebucht.">
      {fehler && !verwerfen && <div role="alert" className="mb-3 text-sm text-danger">{fehler} <button type="button" className="link" onClick={() => void laden()}>Erneut laden</button></div>}
      {offen.map((s, nr) => {
        const beendet = s.stand === 'beendet';
        const vorschlaege = timerVorschlaege(s);
        const arbeitMs = timerDauer(s, Date.now()).arbeitMs;
        const pauseMs = timerPauseMs(s);
        return <section key={s.id} className={nr === 0 ? '' : 'mt-4 border-t border-line pt-3'} aria-label={`Arbeitstag ${datumAT(timerOrtszeit(s.segmente[0].von).date)}`}>
          <p className="section-label">
            {datumAT(timerOrtszeit(s.segmente[0].von).date)} · Arbeit <span className="font-mono">{dauerText(arbeitMs, false)}</span> h
            {pauseMs > 0 && <> · Pause <span className="font-mono">{dauerText(pauseMs, false)}</span> h</>}
          </p>
          <List>{vorschlaege.map((v) => {
            const kannBuchen = beendet && v.stand === 'offen';
            const zeit = `${timerOrtszeit(v.beginn).time}–${v.ende ? timerOrtszeit(v.ende).time : '…'}`;
            const wo = v.baustelle ? namen.get(v.baustelle) ?? v.baustelle : 'Ohne Baustelle';
            return <ListRow key={v.von} title={zeit}
              subtitle={`${wo} · ${vorschlagStand(v)}`}
              onOeffnen={kannBuchen ? () => oeffnen(s, v) : undefined} pfeil={kannBuchen}>
              {kannBuchen && <IconButton label={`${zeit} nicht buchen`} tone="danger" disabled={speichert} onClick={() => { setFehler(null); setAlleVerwerfen(false); setVerwerfen({ id: s.id, vorschlag: v }); }}>
                <Icon name="papierkorb" size={20} aria-hidden="true" />
              </IconButton>}
            </ListRow>;
          })}</List>
          {s.entwuerfe?.filter((d) => !d.wartet).map((d) => <details key={d.kennung} className="my-3 break-words border-t border-line pt-3">
            <summary className="weiteres-kopf text-sm">Gesicherter Entwurf · {datumAusMs(d.angelegtAm)}</summary>
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
              {d.art === 'buchen' && !s.segmente[d.segment]?.buchung && (beendet || s.nurLokal || s.stand === 'verworfen') && <Button variant="secondary" onClick={() => setAuswahl({ id: s.id, von: d.segment, bis: d.bis ?? d.segment, pauseMin: d.eintrag?.breakDuration ?? 0, entwurf: d, manuell: s.nurLokal || s.stand === 'verworfen' })}>{s.nurLokal || s.stand === 'verworfen' ? 'Als Nachtrag öffnen' : 'Entwurf prüfen'}</Button>}
              <Button variant="ghost" onClick={() => setEntwurfEntfernen(d)}>Gesicherten Entwurf entfernen</Button>
            </div>
          </details>)}
        </section>;
      })}
    </Card>}
    <BottomSheet open={!!beginn} onClose={() => setAuswahl(null)} label="Arbeitszeit buchen" titel="Arbeitszeit buchen" auchBreit>
      {beginn && gewaehlt && auswahl && von && bis && !schonErledigt && !beginn.vorgemerkt && <>
        <p className="mb-3 text-sm text-ink-muted">
          Aufgezeichnet: {datumAT(von.date)} {von.time} bis {von.date === bis.date ? '' : `${datumAT(bis.date)} `}{bis.time}
          {auswahl.pauseMin > 0 ? `, darin ${auswahl.pauseMin} Min. Pause` : ''}. Bitte tatsächliche Zeiten und Angaben prüfen.
        </p>
        <TimeForm baustelleFrei besitzerProfil={profil} key={`${gewaehlt.id}:${auswahl.von}`} vorbelegung={{ date: von.date, startTime: von.time, endTime: bis.time, breakDuration: auswahl.pauseMin, projectNumber: beginn.baustelle, ...auswahl.entwurf?.eintrag }}
          speichernMit={auswahl.manuell ? undefined : (werte) => timerBuchen(gewaehlt, auswahl.von, auswahl.bis, werte)} onCancel={() => setAuswahl(null)} onSaved={() => { setAuswahl(null); void laden(); }} />
      </>}
      {schonErledigt && <p role="status">Diese Zeit wurde inzwischen abgeschlossen. Bitte die vorhandene Buchung prüfen.</p>}
    </BottomSheet>
    <BottomSheet open={!!verwerfen} onClose={() => setVerwerfen(null)} label="Nicht buchen" titel="Nicht buchen" auchBreit>
      {verwerfen && <form className="space-y-3" onSubmit={(e) => { e.preventDefault(); void nichtBuchen(); }}>
        <p className="text-sm text-ink-muted">Hieraus wird keine Arbeitszeit gebucht. Der Grund bleibt nachvollziehbar erhalten.</p>
        {offeneZeiten.length > 1 && <fieldset className="space-y-1">
          <legend className="sr-only">Was nicht gebucht wird</legend>
          <label className="flex min-h-touch cursor-pointer items-center gap-2 text-base text-ink">
            <input type="radio" name="nicht-buchen-umfang" className="h-5 w-5 shrink-0 accent-[color:var(--accent-deep)]" checked={!alleVerwerfen} onChange={() => setAlleVerwerfen(false)} />
            Nur {timerOrtszeit(verwerfen.vorschlag.beginn).time}–{verwerfen.vorschlag.ende ? timerOrtszeit(verwerfen.vorschlag.ende).time : '…'}
          </label>
          <label className="flex min-h-touch cursor-pointer items-center gap-2 text-base text-ink">
            <input type="radio" name="nicht-buchen-umfang" className="h-5 w-5 shrink-0 accent-[color:var(--accent-deep)]" checked={alleVerwerfen} onChange={() => setAlleVerwerfen(true)} />
            Den ganzen Arbeitstag ({offeneZeiten.length} offene Zeiten)
          </label>
        </fieldset>}
        {fehler && <p role="alert" className="text-sm text-danger">{fehler}</p>}
        <InputField id="timer-grund" label="Grund" required pflicht value={grund} onChange={(e) => setGrund(e.target.value)} />
        <div className="fuss-aktionen">
          <Button type="button" variant="ghost" onClick={() => setVerwerfen(null)}>Abbrechen</Button>
          <Button type="submit" variant="danger" disabled={!grund.trim()} loading={speichert}>Nicht buchen</Button>
        </div>
      </form>}
    </BottomSheet>
  </>;
}

/** Die zweite Zeile einer Zeit: Pause und Stand in einem Satz. */
function vorschlagStand(v: TimerVorschlag): string {
  if (v.stand === 'vorgemerkt') return 'auf diesem Gerät vorgemerkt';
  if (v.stand === 'verworfen') return `nicht gebucht: ${v.grund ?? ''}`;
  if (v.stand === 'gebucht') return 'gebucht';
  return v.pauseMin > 0 ? `${v.pauseMin} Min. Pause · noch nicht gebucht` : 'noch nicht gebucht';
}

function entwurfAngaben(d: TimerEntwurf): string[] {
  const werte = d.eintrag?.zeitfelder?.werte;
  if (!werte) return [];
  const definitionen = gemerkterFeldsatz(d.companyId)?.definitionen ?? [];
  const vorhanden = Object.fromEntries(Object.entries(werte).filter(([, w]) => w !== null)) as Record<string, string | number | boolean>;
  return [...angabenText(definitionen, vorhanden), ...Object.entries(vorhanden).filter(([id]) => !definitionen.some((f) => f.id === id)).map(([, w], i) => `Frühere Angabe ${i + 1}: ${String(w)}`)];
}
