import { useEffect, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useAuth } from '@/app/AuthContext';
import { listLiegenschaften, type LiegenschaftZeiger } from '@/lib/db/liegenschaften';
import { darfKundenPflegen } from '@/lib/permissions';
import type { Liegenschaft } from '@/types';
import PageHeader from '@/components/PageHeader';
import Card from '@/components/Card';
import Button from '@/components/Button';
import BottomSheet from '@/components/BottomSheet';
import { List, ListRow } from '@/components/ListRow';
import { Zustand } from '@/components/Badge';
import { Listenleiste, MehrAnzeigen, Segmente } from '@/components/LotBausteine';
import { EmptyState, ErrorState, SkeletonList } from '@/components/States';
import LiegenschaftFormular from './LiegenschaftFormular';

type Auswahl = 'aktiv' | 'alle';
const AUSWAHL: readonly { wert: Auswahl; text: string }[] = [
  { wert: 'aktiv', text: 'Aktiv' },
  { wert: 'alle', text: 'Alle' },
];

/**
 * DIE LIEGENSCHAFTEN (M02c, A09) — Häuser und Anlagen, für die der Betrieb
 * arbeitet.
 *
 * - Gesucht wird auf dem Server über Bezeichnung, Anschrift und Beteiligte
 *   (wer die Hausverwaltung oder den Mieter kennt, findet das Haus) — über
 *   den ganzen Bestand; Suche und Auswahl stehen in der Adresse.
 * - Seitenweise nach Bezeichnung; „Weitere anzeigen“ holt die nächste Seite.
 * - Die ganze Zeile öffnet die Akte der Liegenschaft.
 * - Anlegen darf, wer Kunden pflegen darf (wie der Server).
 */
export default function LiegenschaftenView() {
  const { user, einblick } = useAuth();
  const navigate = useNavigate();
  const [parameter, setParameter] = useSearchParams();
  const auswahl: Auswahl = parameter.get('auswahl') === 'alle' ? 'alle' : 'aktiv';
  const suche = parameter.get('suche') ?? '';
  const [eingabe, setEingabe] = useState(suche);

  const [zeilen, setZeilen] = useState<Liegenschaft[] | null>(null);
  const [weiter, setWeiter] = useState<LiegenschaftZeiger | null>(null);
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
    listLiegenschaften(companyId, { suche, nurAktive: auswahl === 'aktiv' })
      .then((seite) => {
        if (weg) return;
        setZeilen(seite.zeilen);
        setWeiter(seite.weiter);
      })
      .catch(() => { if (!weg) setFehler(true); });
    return () => { weg = true; };
  }, [companyId, auswahl, suche, versuch]);

  if (!user || !companyId) return null;
  // Im Supporteinblick nur lesen, wie bei den Kunden: anlegen geht dort nur mit „mitarbeiten“ — die Seite bietet es nicht an.
  const darfAnlegen = darfKundenPflegen(user) && !einblick;

  function waehlen(w: Auswahl) {
    setParameter((alt) => {
      const p = new URLSearchParams(alt);
      if (w === 'aktiv') p.delete('auswahl');
      else p.set('auswahl', w);
      return p;
    });
  }

  async function mehr() {
    if (!companyId || !weiter) return;
    setMehrLaeuft(true);
    setMehrFehler(false);
    try {
      const seite = await listLiegenschaften(companyId, { suche, nurAktive: auswahl === 'aktiv', nach: weiter });
      setZeilen((alt) => [...(alt ?? []), ...seite.zeilen]);
      setWeiter(seite.weiter);
    } catch {
      setMehrFehler(true);
    } finally {
      setMehrLaeuft(false);
    }
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Liegenschaften"
        subtitle="Häuser und Anlagen mit ihren Tops und Beteiligten"
        action={darfAnlegen ? <Button onClick={() => setNeu(true)}>Neue Liegenschaft</Button> : undefined}
      />

      <Card
        title={auswahl === 'aktiv' ? 'Aktive Liegenschaften' : 'Alle Liegenschaften'}
        hint={
          <>
            Eine Liegenschaft ist ein Haus oder eine Anlage mit Anschrift, darin die Tops (Wohnungen
            bzw. Einheiten). Sie gehört keinem Kunden: Eigentümer, Hausverwaltung, Mieter und die
            übrigen Beteiligten stehen in ihrer Akte, jeder mit seiner Rolle. Baustellen, Wartungen
            und Eingänge lassen sich einer Liegenschaft und einem Top zuordnen — so zeigt die Akte,
            was in diesem Haus schon gemacht wurde. Gesucht wird auch über die Beteiligten.
          </>
        }
        buendig
      >
        <Listenleiste
          reiter={<Segmente name="Auswahl" werte={AUSWAHL} wert={auswahl} onChange={waehlen} />}
          suche={{
            id: 'liegenschaft-suche',
            wert: eingabe,
            onChange: setEingabe,
            platzhalter: 'Bezeichnung, Anschrift, Beteiligte',
            name: 'Liegenschaften suchen',
          }}
        />
        {fehler && (
          <div className="px-4 pb-4">
            <ErrorState message="Die Liegenschaften konnten nicht geladen werden." onRetry={() => setVersuch((v) => v + 1)} />
          </div>
        )}
        {!fehler && zeilen === null && <SkeletonList rows={4} />}
        {!fehler && zeilen && zeilen.length === 0 && (
          <EmptyState titel={suche ? 'Nichts gefunden' : 'Noch keine Liegenschaft'}>
            {suche
              ? `Keine Liegenschaft passt zu „${suche}“.`
              : darfAnlegen ? 'Ein Haus mit „Neue Liegenschaft“ anlegen.' : 'Hier steht noch nichts.'}
          </EmptyState>
        )}
        {!fehler && zeilen && zeilen.length > 0 && (
          <>
            <List>
              {zeilen.map((l) => (
                <ListRow
                  key={l.id}
                  to={`/liegenschaften/${l.id}`}
                  title={l.bezeichnung}
                  subtitle={l.anschrift || 'ohne Anschrift'}
                  zustand={l.aktiv === false ? <Zustand stand="storniert">inaktiv</Zustand> : undefined}
                  pfeil
                />
              ))}
            </List>
            {weiter && <MehrAnzeigen anzahl={null} laedt={mehrLaeuft} onClick={() => void mehr()} />}
            {mehrFehler && (
              <div className="px-4 pb-4">
                <ErrorState message="Weitere Liegenschaften konnten nicht geladen werden." onRetry={() => void mehr()} />
              </div>
            )}
          </>
        )}
      </Card>

      <BottomSheet open={neu} onClose={() => setNeu(false)} label="Neue Liegenschaft" auchBreit titel="Neue Liegenschaft">
        {neu && (
          <LiegenschaftFormular
            companyId={companyId}
            onGespeichert={(id) => {
              setNeu(false);
              navigate(`/liegenschaften/${id}`);
            }}
            onAbbrechen={() => setNeu(false)}
          />
        )}
      </BottomSheet>
    </div>
  );
}
