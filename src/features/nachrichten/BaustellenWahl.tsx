import { useState } from 'react';
import type { Project, Role } from '@/types';
import type { WithId } from '@/lib/db/core';
import BottomSheet from '@/components/BottomSheet';
import { List, ListRow } from '@/components/ListRow';
import { Listenleiste } from '@/components/LotBausteine';
import { EmptyState, ErrorState, SkeletonList } from '@/components/States';
import { baustellenTitel } from '@/lib/baustellenTitel';
import { useBaustellenAuswahl } from './useBaustellenAuswahl';

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
  const { liste, treffer, fehler, begriff } = useBaustellenAuswahl(open, companyId, uid, rolle, suche);

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
