import { useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '@/app/AuthContext';
import BottomSheet from '@/components/BottomSheet';
import BaustellenSelect from '@/components/BaustellenSelect';
import Button from '@/components/Button';
import Icon from '@/components/Icon';
import InfoHint from '@/components/InfoHint';
import { InputField } from '@/components/Field';
import { baustellenTitel } from '@/lib/baustellenTitel';
import { dauerText, timerBaustelle, timerDauer, timerOrtszeit } from '@/lib/zeitsitzung';
import { useBaustelleVorbelegung } from '@/features/projects/useBaustelleVorbelegung';
import { zuletztMerken } from '@/lib/baustelleVorbelegen';
import { useBaustellenAuswahl } from '@/features/nachrichten/useBaustellenAuswahl';
import { useZeitsitzung } from './zeitsitzungStand';
import { LoeschenKnopf } from '@/components/Symbolknoepfe';

/**
 * DIE KARTE „ARBEITSTAG“ (M06a, schlanke Fassung vom 08.11.2026) — auf der
 * Startseite und oben in der Zeiterfassung, dieselbe Sitzung.
 *
 * Ein Blatt der Linie „Lot“ (eckig, Linie rundum); rund sind nur die
 * Knöpfe. Darauf steht nur, was man im Laufen braucht:
 *   - vor Beginn: der runde Start-Knopf und die Baustelle (freiwillig);
 *   - läuft: seit wann, die Arbeitszeit bisher als Uhr, die Baustelle (ein
 *     Tipp wechselt sie), Pause und Feierabend;
 *   - Pause: seit wann und wie lange, die Arbeit bisher, Weiter und
 *     Feierabend.
 * Gebucht wird hier nichts: nach „Stoppen und prüfen“ bestätigt man je
 * Baustelle eine Zeit im gewohnten Formular (Zeiterfassung, „Arbeitstag
 * prüfen“, E73).
 */
export default function ArbeitstagKarte({ vorschlag, aufStart = false }: {
  /** Die Baustelle laut heutigem Einsatz — vorgewählt, solange nichts läuft. */
  vorschlag?: string;
  /** Auf der Startseite: offene Abschnitte als Verweis in die Zeiterfassung. */
  aufStart?: boolean;
}) {
  const { user } = useAuth();
  const z = useZeitsitzung();
  const navigate = useNavigate();
  const [gewaehlt, setGewaehlt] = useState<string | null>(null);
  const [wahl, setWahl] = useState(false);
  const [entwurf, setEntwurf] = useState('');
  const [verwerfen, setVerwerfen] = useState(false);
  const [grund, setGrund] = useState('');
  /*
    OHNE EINSATZ DIE ZULETZT BENUTZTE BAUSTELLE (B3, E83) — nach der einen
    Regel, nur solange nichts läuft und der Aufrufer nichts vorgibt. Sie steht
    sichtbar auf dem Knopf darunter und ist dort mit einem Tipp geändert.
  */
  const regel = useBaustelleVorbelegung({ aktiv: !!user && !vorschlag && z.an && !z.laeuft });
  const baustellen = useBaustellenAuswahl(!!user && (z.an || !!z.laeuft), user?.companyId ?? '', user?.uid ?? '', user?.role ?? 'Mitarbeiter', '');
  const namen = useMemo(() => new Map((baustellen.liste ?? []).map((p) => [p.projectNumber, baustellenTitel(p) || p.projectNumber])), [baustellen.liste]);

  if (!user) return null;
  const offen = z.offen.length;
  if (!z.an && !z.laeuft && !(aufStart && offen > 0)) return null;

  const s = z.laeuft;
  const pause = s?.stand === 'pause';
  const dauer = s ? timerDauer(s, z.jetzt) : null;
  // Vor Beginn: was jemand gewählt hat, sonst der heutige Einsatz laut Plan, sonst die zuletzt benutzte (E83).
  const startBaustelle = gewaehlt ?? vorschlag ?? regel?.nr ?? '';
  const laufendeBaustelle = s ? timerBaustelle(s) : '';
  const name = (nr: string) => namen.get(nr) ?? nr;
  const pruefen = aufStart && offen > 0 && (
    <Link to="/time" className={s || z.an ? 'arbeitstag-pruefen' : 'arbeitstag-pruefen arbeitstag-pruefen-allein'}>
      {offen === 1 ? 'Ein Arbeitstag wartet auf die Prüfung' : `${offen} Arbeitstage warten auf die Prüfung`}
      <Icon name="weiter" size={16} aria-hidden="true" />
    </Link>
  );

  /*
    FEIERABEND FÜHRT INS FORMULAR (E73): „Stoppen und prüfen“ geht in die
    Zeiterfassung, und dort öffnet sich die erste offene Zeit gleich
    vorbelegt (`ZeitsitzungPanel`). Vorher blieb man auf der Startseite
    stehen und musste den Arbeitstag erst suchen.
  */
  async function feierabend() {
    if (!s) return;
    if (await z.befehl('stop', s, laufendeBaustelle)) navigate('/time', { state: { pruefen: s.id } });
  }

  async function wechseln() {
    if (!s) { setGewaehlt(entwurf); setWahl(false); return; }
    if (await z.befehl('wechsel', s, entwurf)) setWahl(false);
  }

  return (
    <section className="arbeitstag" aria-labelledby="arbeitstag-titel" data-stand={s ? (pause ? 'pause' : 'laeuft') : 'bereit'}>
      <h2 id="arbeitstag-titel" className="sr-only">Arbeitstag</h2>
      <div className="arbeitstag-hilfe">
        <InfoHint about="Arbeitstag">
          Der Timer sammelt Anwesenheit, Pausen und Baustellenwechsel. Nach „Stoppen und prüfen“ bestätigst du je
          Baustelle eine Zeit im gewohnten Formular, die Pausen schon eingerechnet — dadurch gelten alle bisherigen
          Prüfungen, Pflichtfelder und Zuschläge. Ein vergessener Timer wird nie automatisch gebucht. Ohne Empfang warten Schritte im Ausgangsfach;
          ein anderer Gerätestand wird als Konflikt gemeldet.
        </InfoHint>
      </div>

      {z.fehler && (
        <p role="alert" className="arbeitstag-fehler">
          {z.fehler} <button type="button" className="link" onClick={() => void z.laden()}>Erneut laden</button>
        </p>
      )}

      {s && dauer && (
        <>
          <p className="arbeitstag-stand">
            <span className="arbeitstag-punkt" aria-hidden="true" />
            {pause && dauer.pauseSeit
              ? `Pause seit ${timerOrtszeit(dauer.pauseSeit).time}`
              : `Läuft seit ${timerOrtszeit(dauer.beginn).time}`}
          </p>
          <p className="arbeitstag-uhr" aria-label={pause ? `Pause ${dauerText(dauer.pauseMs, false)} Stunden` : `Arbeitszeit ${dauerText(dauer.arbeitMs, false)} Stunden`}>
            <UhrText ms={pause ? dauer.pauseMs : dauer.arbeitMs} />
          </p>
          {z.ueberfaellig && (
            <p role="status" className="arbeitstag-erinnerung">
              Der Timer läuft schon länger. Bitte prüfen: beenden und Zeiten berichtigen oder bewusst weiterlaufen lassen.{' '}
              <button type="button" className="link" disabled={z.speichert} onClick={() => void z.befehl('weiterlaufen', s, laufendeBaustelle)}>
                Weiterlaufen lassen
              </button>
            </p>
          )}
          <div className="arbeitstag-unten">
            {pause ? (
              <span className="arbeitstag-neben">Arbeit bisher <span className="font-mono">{dauerText(dauer.arbeitMs, false)}</span> h</span>
            ) : (
              <button
                type="button"
                className="arbeitstag-baustelle"
                disabled={!z.an || z.speichert}
                onClick={() => { setEntwurf(laufendeBaustelle); setWahl(true); }}
                aria-label={`Baustelle wechseln — jetzt ${laufendeBaustelle ? name(laufendeBaustelle) : 'ohne Baustelle'}`}
              >
                <Icon name="building" size={16} aria-hidden="true" />
                <span className="arbeitstag-baustelle-name">{laufendeBaustelle ? name(laufendeBaustelle) : 'Ohne Baustelle'}</span>
                {z.an && <Icon name="wechsel" size={16} aria-hidden="true" />}
              </button>
            )}
            <div className="arbeitstag-knoepfe">
              {pause ? (
                <>
                  <button type="button" className="rund-knopf rund-knopf-voll" aria-label="Weiterarbeiten" title="Weiterarbeiten" disabled={z.speichert} onClick={() => void z.befehl('weiter', s, laufendeBaustelle)}>
                    <Icon name="play" size={24} aria-hidden="true" />
                  </button>
                  <button type="button" className="rund-knopf" aria-label="Stoppen und prüfen" title="Feierabend: stoppen und prüfen" disabled={z.speichert} onClick={() => void feierabend()}>
                    <Icon name="stopp" size={22} aria-hidden="true" />
                  </button>
                </>
              ) : (
                <>
                  <button type="button" className="rund-knopf" aria-label="Pause beginnen" title="Pause beginnen" disabled={z.speichert} onClick={() => void z.befehl('pause', s, laufendeBaustelle)}>
                    <Icon name="pause" size={22} aria-hidden="true" />
                  </button>
                  <button type="button" className="rund-knopf rund-knopf-voll" aria-label="Stoppen und prüfen" title="Feierabend: stoppen und prüfen" disabled={z.speichert} onClick={() => void feierabend()}>
                    <Icon name="stopp" size={22} aria-hidden="true" />
                  </button>
                </>
              )}
            </div>
          </div>
          {/*
            VERWERFEN IST DER PAPIERKORB (E74, 10.11.2026), grau und klein unten
            links — weit weg von Pause und Stopp rechts, damit der Daumen ihn
            nicht beim Feierabend trifft. Oben rechts steht schon die Hilfe.
            Das Fenster mit dem Grund dahinter bleibt, wie es war.
          */}
          <div className="arbeitstag-fuss">
            <LoeschenKnopf label="Arbeitstag verwerfen …" disabled={z.speichert} onClick={() => setVerwerfen(true)} />
          </div>
        </>
      )}

      {!s && z.an && (
        <div className="arbeitstag-start">
          <button
            type="button"
            className="rund-knopf rund-knopf-voll rund-knopf-start"
            aria-label="Arbeitstag starten"
            disabled={z.speichert || !z.geladen}
            onClick={() => { zuletztMerken(user.companyId, user.uid, startBaustelle); void z.befehl('start', undefined, startBaustelle); }}
          >
            <Icon name="play" size={28} aria-hidden="true" />
          </button>
          <div className="arbeitstag-start-text">
            <span className="arbeitstag-start-titel" aria-hidden="true">Arbeitstag starten</span>
            <button type="button" className="arbeitstag-baustelle" onClick={() => { setEntwurf(startBaustelle); setWahl(true); }}>
              <Icon name="building" size={16} aria-hidden="true" />
              <span className="arbeitstag-baustelle-name">{startBaustelle ? name(startBaustelle) : 'Baustelle wählen'}</span>
              <Icon name="chevron" size={16} aria-hidden="true" />
            </button>
          </div>
        </div>
      )}

      {pruefen}

      <BottomSheet open={wahl} onClose={() => setWahl(false)} label={s ? 'Baustelle wechseln' : 'Baustelle wählen'} titel={s ? 'Baustelle wechseln' : 'Baustelle wählen'} auchBreit>
        {wahl && (
          <form className="space-y-3" onSubmit={(e) => { e.preventDefault(); void wechseln(); }}>
            <BaustellenSelect id="timer-baustelle" companyId={user.companyId} meineUid={user.uid} value={entwurf} onChange={(nr) => setEntwurf(nr)} nummerVorn />
            <p className="text-sm text-ink-muted">
              {s ? 'Ab jetzt zählt die Arbeit für die gewählte Baustelle; der bisherige Abschnitt endet.' : 'Ohne Baustelle zählt die Zeit als Anwesenheit; die Baustelle lässt sich beim Prüfen noch setzen.'}
            </p>
            {z.fehler && <p role="alert" className="text-sm text-danger">{z.fehler}</p>}
            <div className="fuss-aktionen">
              <Button type="button" variant="ghost" onClick={() => setWahl(false)}>Abbrechen</Button>
              <Button type="submit" loading={z.speichert} disabled={!!s && entwurf === laufendeBaustelle}>{s ? 'Baustelle wechseln' : 'Übernehmen'}</Button>
            </div>
          </form>
        )}
      </BottomSheet>

      <BottomSheet open={verwerfen} onClose={() => setVerwerfen(false)} label="Zeitsitzung verwerfen" titel="Zeitsitzung verwerfen" auchBreit>
        {verwerfen && s && (
          <form
            className="space-y-3"
            onSubmit={(e) => {
              e.preventDefault();
              void z.befehl('verwerfen', s, grund.trim()).then((ok) => { if (ok) { setVerwerfen(false); setGrund(''); } });
            }}
          >
            <p className="text-sm text-ink-muted">Hieraus wird keine Arbeitszeit gebucht. Der Grund bleibt nachvollziehbar erhalten.</p>
            {z.fehler && <p role="alert" className="text-sm text-danger">{z.fehler}</p>}
            <InputField id="arbeitstag-grund" label="Begründung" required pflicht value={grund} onChange={(e) => setGrund(e.target.value)} />
            <div className="fuss-aktionen">
              <Button type="button" variant="ghost" onClick={() => setVerwerfen(false)}>Abbrechen</Button>
              <Button type="submit" variant="danger" disabled={!grund.trim()} loading={z.speichert}>Begründet verwerfen</Button>
            </div>
          </form>
        )}
      </BottomSheet>
    </section>
  );
}

/** Stunden und Minuten groß, die Sekunden klein daneben — wie auf einer Stoppuhr. */
function UhrText({ ms }: { ms: number }) {
  const [hm, sek] = [dauerText(ms, false), dauerText(ms).slice(-2)];
  return <><span aria-hidden="true">{hm}</span><small aria-hidden="true">:{sek}</small></>;
}
