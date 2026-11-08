import { useEffect, useMemo, useState } from 'react';
import type { Project, Role } from '@/types';
import type { WithId } from '@/lib/db/core';
import { listActiveProjects, listProjectsForEmployee, searchProjects } from '@/lib/db/projects';
import BottomSheet from '@/components/BottomSheet';
import { List, ListRow } from '@/components/ListRow';
import { Listenleiste } from '@/components/LotBausteine';
import { EmptyState, ErrorState, SkeletonList } from '@/components/States';
import { baustellenTitel } from '@/lib/baustellenTitel';

/**
 * Eine Baustelle wählen — für den Thread (Neue Nachricht) oder als Ziel
 * einer Übernahme. Der Monteur sieht seine Baustellen, das Büro die aktiven
 * und sucht über alle; ob jemand den Thread wirklich lesen darf, prüft der
 * Server (wie die Pläne, `app.baustelle_einsehbar`).
 */
export default function BaustellenWahl({
  open,
  titel,
  companyId,
  uid,
  rolle,
  onClose,
  onWahl,
}: {
  open: boolean;
  titel: string;
  companyId: string;
  uid: string;
  rolle: Role;
  onClose: () => void;
  onWahl: (p: WithId<Project>) => void;
}) {
  const [suche, setSuche] = useState('');
  const [begriff, setBegriff] = useState('');
  const [liste, setListe] = useState<WithId<Project>[] | null>(null);
  const [fehler, setFehler] = useState(false);
  const monteur = rolle === 'Mitarbeiter';

  useEffect(() => {
    const t = setTimeout(() => setBegriff(suche.trim()), 300);
    return () => clearTimeout(t);
  }, [suche]);

  useEffect(() => {
    if (!open) return;
    let weg = false;
    setFehler(false);
    const laden = monteur
      ? listProjectsForEmployee(companyId, uid)
      : begriff.length >= 2 ? searchProjects(companyId, begriff, 50) : listActiveProjects(companyId, 50);
    laden.then((r) => { if (!weg) setListe(r); }).catch(() => { if (!weg) setFehler(true); });
    return () => { weg = true; };
  }, [open, monteur, companyId, uid, begriff]);

  const treffer = useMemo(() => {
    const s = begriff.toLowerCase();
    // Beim Monteur wird in seinen Baustellen gesucht, beim Büro hat der Server schon gesucht.
    return (liste ?? []).filter((p) => !monteur || !s
      || `${p.projectNumber} ${baustellenTitel(p)} ${p.address ?? ''}`.toLowerCase().includes(s));
  }, [liste, begriff, monteur]);

  function schliessen() {
    setSuche('');
    onClose();
  }

  return (
    <BottomSheet open={open} onClose={schliessen} label={titel} titel={titel} auchBreit>
      {open && (
        <div className="space-y-3">
          <Listenleiste suche={{ id: 'baustelle-suche', wert: suche, onChange: setSuche, platzhalter: 'Nummer, Kunde, Ort', name: 'Baustellen suchen' }} />
          {fehler && <ErrorState message="Die Baustellen konnten nicht geladen werden." />}
          {!fehler && liste === null && <SkeletonList rows={3} />}
          {!fehler && liste && treffer.length === 0 && (
            <EmptyState titel="Keine Baustelle">{begriff ? `Keine Baustelle passt zu „${begriff}“.` : 'Hier steht noch keine Baustelle.'}</EmptyState>
          )}
          {!fehler && treffer.length > 0 && (
            <List>
              {treffer.map((p) => (
                <ListRow
                  key={p.id}
                  title={baustellenTitel(p) || p.projectNumber}
                  nummer={p.projectNumber}
                  subtitle={p.address}
                  onOeffnen={() => { setSuche(''); onWahl(p); }}
                  pfeil
                />
              ))}
            </List>
          )}
        </div>
      )}
    </BottomSheet>
  );
}
