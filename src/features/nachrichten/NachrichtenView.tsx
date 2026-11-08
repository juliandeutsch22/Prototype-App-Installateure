import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { useAuth } from '@/app/AuthContext';
import {
  folgen, kanalKopf, rundeBenennen, rundeHinzufuegen, rundeVerlassen, stummSchalten, type KanalKopf,
} from '@/lib/db/nachrichten';
import { listUsers } from '@/lib/db/users';
import { useModul } from '@/lib/useModule';
import { useAbTablet } from '@/lib/useAbTablet';
import { canAccess } from '@/app/navigation';
import PageHeader from '@/components/PageHeader';
import Button from '@/components/Button';
import Card from '@/components/Card';
import RowMenu, { type RowMenuItem } from '@/components/RowMenu';
import BottomSheet from '@/components/BottomSheet';
import ConfirmDialog from '@/components/ConfirmDialog';
import { InputField } from '@/components/Field';
import { List, ListRow } from '@/components/ListRow';
import { EmptyState, ErrorState, SkeletonList } from '@/components/States';
import { useToast } from '@/components/Toast';
import { grundAus } from '@/lib/fehlerGrund';
import Postfach from './Postfach';
import Gespraech from './Gespraech';
import NeueNachricht from './NeueNachricht';
import PersonWahl, { type Person } from './PersonWahl';
import { NACHRICHTEN_NEU } from './NachrichtenLive';
import { ART_TEXT } from './text';

/**
 * DIE NACHRICHTEN (M10/B09, E64) — ein Posteingang für alle Arten von
 * Gesprächen und das offene Gespräch daneben.
 *
 *   Handy (bis 759 px)   zwei Seiten: der Posteingang, dann das Gespräch
 *                        mit „← Nachrichten“ zurück.
 *   ab Tablet            links der Posteingang, rechts das Gespräch, beide
 *                        als Blätter auf dem Raster.
 *
 * Die Möglichkeiten des Gesprächs (stumm, folgen, Teilnehmer, verlassen)
 * stehen im ⋯ des Seitenkopfs — die einer einzelnen Nachricht an ihr selbst.
 */
export default function NachrichtenView() {
  const { kanal } = useParams<{ kanal?: string }>();
  const { user, company, einblick } = useAuth();
  const navigate = useNavigate();
  const toast = useToast();
  const breit = useAbTablet();
  const direktAn = useModul('nachrichten.direktnachrichten');
  const [kopf, setKopf] = useState<KanalKopf | null>(null);
  const [kopfFehler, setKopfFehler] = useState<string | null>(null);
  const [personen, setPersonen] = useState<Person[]>([]);
  const [neu, setNeu] = useState(false);
  const [teilnehmer, setTeilnehmer] = useState(false);
  const [hinzu, setHinzu] = useState(false);
  const [benennen, setBenennen] = useState(false);
  const [name, setName] = useState('');
  const [verlassen, setVerlassen] = useState(false);
  const [versuch, setVersuch] = useState(0);

  const companyId = user?.companyId;
  const uid = user?.uid;

  useEffect(() => {
    if (!companyId || !uid) return;
    let weg = false;
    listUsers(companyId)
      .then((alle) => {
        if (weg) return;
        setPersonen(alle.filter((p) => p.active !== false && p.uid !== uid)
          .map((p) => ({ uid: p.uid, name: p.name, rolle: p.role })));
      })
      .catch(() => undefined);
    return () => { weg = true; };
  }, [companyId, uid]);

  const kopfLaden = useCallback(async (still = false) => {
    if (!kanal || einblick) { setKopf(null); return; }
    if (!still) { setKopf(null); setKopfFehler(null); }
    try {
      setKopf(await kanalKopf(kanal));
    } catch (e) {
      if (!still) setKopfFehler(grundAus(e, 'Dieses Gespräch gibt es nicht oder es ist nicht deines.'));
    }
  }, [kanal, einblick]);

  useEffect(() => { void kopfLaden(); }, [kopfLaden, versuch]);

  // Ein neuer Teilnehmer, ein deaktiviertes Konto: der Kopf zieht still nach.
  useEffect(() => {
    const neuIn = (e: Event) => {
      const k = (e as CustomEvent<string | null>).detail;
      if (kanal && (!k || k === kanal)) void kopfLaden(true);
    };
    window.addEventListener(NACHRICHTEN_NEU, neuIn);
    return () => window.removeEventListener(NACHRICHTEN_NEU, neuIn);
  }, [kanal, kopfLaden]);

  // Wer erwähnt werden kann: in der Runde die Teilnehmer, am Thread jeder im Betrieb (der Server prüft, wer ihn liest).
  const erwaehnbar = useMemo(() => {
    if (!kopf || kopf.art === 'direkt') return [];
    if (kopf.art === 'runde') return (kopf.teilnehmer ?? []).filter((t) => !t.ich && t.aktiv).map((t) => ({ uid: t.uid, name: t.name }));
    return personen.map((p) => ({ uid: p.uid, name: p.name }));
  }, [kopf, personen]);

  if (!user || !companyId) return null;
  // Im Einblick des Supports gibt es nichts zu lesen: Kanäle und Nachrichten
  // liest nur, wer teilnimmt (`support_niemals`). Ein Satz statt Fehlern.
  if (einblick) {
    return (
      <div className="space-y-6">
        <PageHeader title="Nachrichten" />
        <Card>
          <EmptyState titel="Im Einblick nicht einsehbar">
            Nachrichten sind vertraulich: Der Support sieht keine Gespräche, auch nicht mit „mitarbeiten“.
          </EmptyState>
        </Card>
      </div>
    );
  }

  async function tun(was: () => Promise<unknown>, erfolg: string) {
    try {
      await was();
      toast.success(erfolg);
      await kopfLaden(true);
      window.dispatchEvent(new CustomEvent(NACHRICHTEN_NEU, { detail: null }));
    } catch (e) {
      toast.error(grundAus(e, 'Das hat nicht geklappt.'));
    }
  }

  const menue: RowMenuItem[] = [];
  if (kopf) {
    menue.push({
      label: kopf.stumm ? 'Wieder melden' : 'Stumm schalten',
      onSelect: () => void tun(() => stummSchalten(kopf.kanal, !kopf.stumm), kopf.stumm ? 'Meldet sich wieder' : 'Stumm geschaltet — außer jemand erwähnt dich'),
    });
    if (kopf.art === 'baustelle') {
      menue.push({
        label: kopf.folgt ? 'Nicht mehr folgen' : 'Folgen',
        onSelect: () => void tun(() => folgen(kopf.kanal, !kopf.folgt), kopf.folgt ? 'Du folgst nicht mehr' : 'Du folgst diesem Thread'),
      });
      if (kopf.projectId && canAccess(user.role, '/admin-projects', company?.modules)) {
        menue.push({ label: 'Zur Baustelle', onSelect: () => navigate(`/admin-projects/${kopf.projectId}`) });
      }
    }
    if (kopf.teilnehmer) menue.push({ label: 'Teilnehmer', onSelect: () => setTeilnehmer(true) });
    if (kopf.art === 'runde' && !kopf.sperre) {
      menue.push({ label: 'Personen hinzufügen …', onSelect: () => setHinzu(true) });
      menue.push({ label: 'Umbenennen …', onSelect: () => { setName(kopf.name ?? ''); setBenennen(true); } });
    }
    if (kopf.art === 'runde') menue.push({ label: 'Runde verlassen', onSelect: () => setVerlassen(true), danger: true });
  }

  const hilfe = (
    <>
      Ein Posteingang für alle Gespräche. <strong>Baustelle:</strong> der Thread einer Baustelle — lesen
      und schreiben alle, die die Baustelle sehen; wer im Team steht, schreibt oder erwähnt wird, folgt
      und bekommt Push. <strong>Direkt und Runden</strong>
      {direktAn ? '' : ' (in diesem Betrieb ausgeschaltet)'}: lesen und schreiben nur die Teilnehmer — auch
      die Geschäftsführung, die Administration und der Support nicht. Wer eine Nachricht meldet, gibt genau
      diese eine als Kopie an die Geschäftsführung.
      <br /><br />
      Senklot zeigt keine Lesebestätigung und keinen Online-Status; „gesendet“ heißt: auf dem Server. Ohne Netz
      wird eine Nachricht auf dem Gerät vorgemerkt und mit Netz gesendet. Gelöscht heißt gelöscht: Text und
      Anhänge gehen, für alle. Nachrichten sind vertraulich gegenüber Betrieb, Kollegen und Support, aber nicht
      Ende-zu-Ende verschlüsselt — mit Zugang zur Datenbank des Betreibers wären sie lesbar. Private Gespräche
      stehen nicht im Datenauszug und nicht in der Sicherung des Betriebs; deine eigenen exportierst du unter
      Mein Konto.
    </>
  );

  const imGespraech = !!kanal;
  const neueKnopf = <Button onClick={() => setNeu(true)}>Neue Nachricht</Button>;
  const mehr = menue.length > 0 ? <RowMenu about={kopf?.titel ?? 'Gespräch'} items={menue} /> : undefined;

  const gespraech = kanal ? (
    kopfFehler ? (
      <Card title="Gespräch">
        <ErrorState message={kopfFehler} onRetry={() => setVersuch((v) => v + 1)} />
        <p className="mt-3"><Link to="/nachrichten" className="link-weiter">Zu allen Gesprächen</Link></p>
      </Card>
    ) : kopf ? (
      <Gespraech key={kopf.kanal} kopf={kopf} companyId={companyId} personen={erwaehnbar} mitTitel={breit} />
    ) : (
      <Card title="Gespräch" buendig><SkeletonList rows={4} /></Card>
    )
  ) : null;

  return (
    <div className="space-y-6">
      {imGespraech && !breit ? (
        <PageHeader
          zurueck={{ to: '/nachrichten', text: 'Nachrichten' }}
          title={kopf?.titel ?? 'Gespräch'}
          subtitle={kopf ? [ART_TEXT[kopf.art], kopf.stumm ? 'stumm' : ''].filter(Boolean).join(' · ') : undefined}
          hilfe={hilfe}
          mehr={mehr}
        />
      ) : (
        <PageHeader
          title="Nachrichten"
          subtitle={direktAn ? 'Baustellen-Threads, Direktnachrichten und Runden' : 'Die Threads der Baustellen'}
          hilfe={hilfe}
          mehr={imGespraech ? mehr : undefined}
          action={neueKnopf}
        />
      )}

      {breit ? (
        <div className="nachrichten-raster">
          <Postfach aktiv={kanal} direktAn={direktAn} />
          {gespraech ?? (
            <Card title="Gespräch">
              <p className="text-ink-muted">Links ein Gespräch wählen — oder mit „Neue Nachricht“ eines beginnen.</p>
            </Card>
          )}
        </div>
      ) : imGespraech ? gespraech : (
        <Postfach direktAn={direktAn} />
      )}

      <NeueNachricht open={neu} onClose={() => setNeu(false)} direktAn={direktAn} personen={personen} />

      <BottomSheet open={teilnehmer} onClose={() => setTeilnehmer(false)} label="Teilnehmer" titel="Teilnehmer" auchBreit>
        {teilnehmer && kopf?.teilnehmer && (
          <div className="space-y-3">
            <List>
              {kopf.teilnehmer.map((t) => (
                <ListRow key={t.uid} title={t.ich ? `${t.name} (du)` : t.name} subtitle={t.aktiv ? undefined : 'Konto deaktiviert'} />
              ))}
            </List>
            <p className="text-sm text-ink-muted">
              {kopf.art === 'runde'
                ? 'Wer später dazukommt, liest ab dem Beitritt. Wer die Runde verlässt, liest sie nicht mehr.'
                : 'Ein Gespräch zu zweit — es gibt es zwischen zwei Personen nur einmal.'}
            </p>
          </div>
        )}
      </BottomSheet>

      <PersonWahl
        open={hinzu}
        titel="Personen hinzufügen"
        personen={personen.filter((p) => !(kopf?.teilnehmer ?? []).some((t) => t.uid === p.uid))}
        mehrere
        bestaetigen="Hinzufügen"
        onClose={() => setHinzu(false)}
        onWahl={(liste) => {
          setHinzu(false);
          if (kopf) void tun(() => rundeHinzufuegen(kopf.kanal, liste.map((p) => p.uid)), 'Hinzugefügt — sie lesen ab jetzt mit');
        }}
      />

      <BottomSheet open={benennen} onClose={() => setBenennen(false)} label="Runde umbenennen" titel="Runde umbenennen" auchBreit>
        {benennen && kopf && (
          <form
            className="space-y-3"
            onSubmit={(e) => {
              e.preventDefault();
              setBenennen(false);
              void tun(() => rundeBenennen(kopf.kanal, name), 'Runde umbenannt');
            }}
          >
            <InputField id="runde-umbenennen" label="Name (leer: die Teilnehmer stehen da)" maxLength={80} value={name} onChange={(e) => setName(e.target.value)} />
            <div className="fuss-aktionen">
              <Button type="button" variant="ghost" onClick={() => setBenennen(false)}>Abbrechen</Button>
              <Button type="submit">Speichern</Button>
            </div>
          </form>
        )}
      </BottomSheet>

      <ConfirmDialog
        open={verlassen}
        title="Runde verlassen?"
        confirmLabel="Verlassen"
        message="Danach siehst du die Runde nicht mehr. Deine Nachrichten bleiben für die anderen stehen — wer sie entfernen will, löscht sie vorher. Gehst du als Letzter, ist die Runde ganz weg."
        onCancel={() => setVerlassen(false)}
        onConfirm={async () => {
          setVerlassen(false);
          if (!kopf) return;
          try {
            await rundeVerlassen(kopf.kanal);
            toast.success('Runde verlassen');
            window.dispatchEvent(new CustomEvent(NACHRICHTEN_NEU, { detail: null }));
            navigate('/nachrichten');
          } catch (e) {
            toast.error(grundAus(e, 'Die Runde konnte nicht verlassen werden.'));
          }
        }}
      />
    </div>
  );
}
