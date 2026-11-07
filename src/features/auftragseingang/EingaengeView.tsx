import { useEffect, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useAuth } from '@/app/AuthContext';
import { listEingaenge, zaehleOffeneEingaenge, type EingangZeiger } from '@/lib/db/auftragseingaenge';
import { darfEingangErfassen } from '@/lib/permissions';
import type { Auftragseingang, EingangStand } from '@/types';
import PageHeader from '@/components/PageHeader';
import Card from '@/components/Card';
import Button from '@/components/Button';
import BottomSheet from '@/components/BottomSheet';
import { List, ListRow } from '@/components/ListRow';
import { Zustand } from '@/components/Badge';
import { Listenleiste, MehrAnzeigen, Segmente } from '@/components/LotBausteine';
import { EmptyState, ErrorState, SkeletonList } from '@/components/States';
import { bekannt } from '@/features/dashboard/start/ziele';
import EingangFormular from './EingangFormular';
import { QUELLE_TEXT, STAENDE, STAND_TEXT, kundeText, wannText, zustandVon } from './eingangText';

/**
 * DER AUFTRAGSEINGANG (M02b, A03/A11): was hereinkam, bevor es Baustelle
 * oder Angebot wird.
 *
 * - Drei Reiter (offen, übernommen, abgelehnt), in der Adresse (`?stand=`),
 *   dazu die Suche über Nummer, Kunde, Ort, Anliegen und die Nummer des
 *   Auftraggebers (`?suche=`) — gesucht auf dem Server, über den ganzen
 *   Bestand.
 * - Offen: Notfall und dringend zuerst, dann der älteste — er wartet am
 *   längsten. Übernommen und abgelehnt: der jüngste zuerst.
 * - Seitenweise vom Server; „Weitere anzeigen“ holt die nächste Seite. Die
 *   Zahl der offenen steht am Reiter, gezählt auf dem Server.
 * - Die ganze Zeile öffnet den Eingang auf seiner Seite (eine Adresse, auf
 *   die Baustelle, Angebot und Kunde verweisen).
 */
export default function EingaengeView() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [parameter, setParameter] = useSearchParams();
  const stand: EingangStand = bekannt(STAENDE, parameter.get('stand')) ?? 'offen';
  const suche = parameter.get('suche') ?? '';
  const [eingabe, setEingabe] = useState(suche);

  const [zeilen, setZeilen] = useState<Auftragseingang[] | null>(null);
  const [weiter, setWeiter] = useState<EingangZeiger | null>(null);
  const [offenZahl, setOffenZahl] = useState<number | undefined>(undefined);
  const [fehler, setFehler] = useState(false);
  const [mehrLaeuft, setMehrLaeuft] = useState(false);
  const [mehrFehler, setMehrFehler] = useState(false);
  const [versuch, setVersuch] = useState(0);
  const [neu, setNeu] = useState(false);

  const companyId = user?.companyId;

  // Getippt wird sofort, gesucht nach einer kurzen Pause — und die Suche steht in der Adresse.
  useEffect(() => {
    if (eingabe === suche) return;
    const t = setTimeout(() => {
      setParameter((alt) => {
        const p = new URLSearchParams(alt);
        if (eingabe.trim()) p.set('suche', eingabe.trim());
        else p.delete('suche');
        return p;
      }, { replace: true });
    }, 300);
    return () => clearTimeout(t);
  }, [eingabe, suche, setParameter]);

  useEffect(() => {
    if (!companyId) return;
    let weg = false;
    setZeilen(null);
    setFehler(false);
    setMehrFehler(false);
    void Promise.all([listEingaenge(companyId, { stand, suche }), zaehleOffeneEingaenge(companyId)])
      .then(([seite, zahl]) => {
        if (weg) return;
        setZeilen(seite.zeilen);
        setWeiter(seite.weiter);
        setOffenZahl(zahl.offen);
      })
      .catch(() => { if (!weg) setFehler(true); });
    return () => { weg = true; };
  }, [companyId, stand, suche, versuch]);

  if (!user || !companyId) return null;
  const darfErfassen = darfEingangErfassen(user.role);

  function reiter(w: EingangStand) {
    setParameter((alt) => {
      const p = new URLSearchParams(alt);
      if (w === 'offen') p.delete('stand');
      else p.set('stand', w);
      return p;
    });
  }

  async function mehr() {
    if (!companyId || !weiter) return;
    setMehrLaeuft(true);
    setMehrFehler(false);
    try {
      const seite = await listEingaenge(companyId, { stand, suche, nach: weiter });
      setZeilen((alt) => [...(alt ?? []), ...seite.zeilen]);
      setWeiter(seite.weiter);
    } catch {
      setMehrFehler(true);
    } finally {
      setMehrLaeuft(false);
    }
  }

  const zeile = (e: Auftragseingang) => {
    const z = zustandVon(e);
    return (
      <ListRow
        key={e.id}
        to={`/eingaenge/${e.id}`}
        title={kundeText(e)}
        nummer={e.nummer}
        zustand={<Zustand stand={z.stand}>{z.text}</Zustand>}
        subtitle={[
          e.ort?.trim(),
          e.anliegen.trim().split('\n')[0],
          `${QUELLE_TEXT[e.quelle]}${e.auftraggeberNummer ? ` ${e.auftraggeberNummer}` : ''}`,
          wannText(e.eingegangenAm),
        ].filter(Boolean).join(' · ')}
        pfeil
      />
    );
  };

  return (
    <div className="space-y-6">
      <PageHeader
        title="Auftragseingang"
        subtitle="Anfragen und Aufträge, bevor sie Baustelle oder Angebot werden"
        action={darfErfassen ? <Button onClick={() => setNeu(true)}>Neuer Eingang</Button> : undefined}
      />

      <Card
        title={STAND_TEXT[stand]}
        hint={
          <>
            Ein Eingang hält fest, was am Telefon, per E-Mail, von der Hausverwaltung oder der
            Versicherung hereinkommt — mit der Auftrags- bzw. Schadensnummer des Auftraggebers.
            Offen bleibt er, bis die Führung daraus eine Baustelle oder ein Angebot macht oder
            jemand im Büro ihn mit Grund ablehnt. Notfälle und dringende stehen oben. Einen Import
            aus den Portalen der Auftraggeber gibt es nicht: dafür fehlen deren Formate.
          </>
        }
        buendig
      >
        <Listenleiste
          reiter={(
            <Segmente
              name="Stand"
              werte={STAENDE.map((w) => ({ wert: w, text: STAND_TEXT[w], ...(w === 'offen' && offenZahl !== undefined ? { anzahl: offenZahl } : {}) }))}
              wert={stand}
              onChange={reiter}
            />
          )}
          suche={{
            id: 'eingang-suche',
            wert: eingabe,
            onChange: setEingabe,
            platzhalter: 'Nummer, Kunde, Ort, Anliegen',
            name: 'Eingänge suchen',
          }}
        />
        {fehler && (
          <div className="px-4 pb-4">
            <ErrorState message="Die Eingänge konnten nicht geladen werden." onRetry={() => setVersuch((v) => v + 1)} />
          </div>
        )}
        {!fehler && zeilen === null && <SkeletonList rows={4} />}
        {!fehler && zeilen && zeilen.length === 0 && (
          <EmptyState titel={suche ? 'Nichts gefunden' : stand === 'offen' ? 'Kein offener Eingang' : `Kein Eingang „${STAND_TEXT[stand]}“`}>
            {suche ? `Kein Eingang passt zu „${suche}“.` : stand === 'offen' && darfErfassen ? 'Was hereinkommt, mit „Neuer Eingang“ festhalten.' : 'Hier steht noch nichts.'}
          </EmptyState>
        )}
        {!fehler && zeilen && zeilen.length > 0 && (
          <>
            <List>{zeilen.map(zeile)}</List>
            {weiter && <MehrAnzeigen anzahl={null} laedt={mehrLaeuft} onClick={() => void mehr()} />}
            {mehrFehler && (
              <div className="px-4 pb-4">
                <ErrorState message="Weitere Eingänge konnten nicht geladen werden." onRetry={() => void mehr()} />
              </div>
            )}
          </>
        )}
      </Card>

      <BottomSheet open={neu} onClose={() => setNeu(false)} label="Neuer Eingang" auchBreit titel="Neuer Eingang">
        {neu && (
          <EingangFormular
            companyId={companyId}
            onGespeichert={(id) => {
              setNeu(false);
              navigate(`/eingaenge/${id}`);
            }}
            onAbbrechen={() => setNeu(false)}
          />
        )}
      </BottomSheet>
    </div>
  );
}
