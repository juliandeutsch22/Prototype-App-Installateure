import { useState } from 'react';
import type { Freistellung } from '@/types';
import { freistellungZurueckziehen, nachweisEntfernen, nachweisHochladen } from '@/lib/db/freistellungen';
import Button from '@/components/Button';
import ConfirmDialog from '@/components/ConfirmDialog';
import { List, ListRow } from '@/components/ListRow';
import { Zustand, type Stand } from '@/components/Badge';
import { useToast } from '@/components/Toast';
import { grundAus } from '@/lib/fehlerGrund';
import { freistellungWas, freistellungZeitraum, nachweisVermerk } from './freistellungText';
import { NachweisWahl } from './FreistellungFormular';

const STAND: Record<Freistellung['status'], Stand> = {
  Bestätigt: 'gut',
  Beantragt: 'achtung',
  Abgelehnt: 'ruht',
  Storniert: 'ruht',
};

/**
 * DIE EIGENEN ANTRÄGE AUF SONDERURLAUB — Stand, Entscheidung und Vermerk.
 * Solange offen: Nachweis nachreichen oder herausnehmen, zurückziehen.
 */
export default function FreistellungListe({
  antraege,
  companyId,
  uid,
  anlaesse,
  onGeaendert,
}: {
  antraege: Freistellung[];
  companyId: string;
  uid: string;
  anlaesse?: Record<string, number> | null;
  onGeaendert: () => void;
}) {
  const toast = useToast();
  const [arbeitet, setArbeitet] = useState<string | null>(null);
  const [zurueck, setZurueck] = useState<Freistellung | null>(null);

  async function hochladen(f: Freistellung, datei: File) {
    setArbeitet(f.id);
    try {
      await nachweisHochladen(companyId, uid, f.id, datei);
      toast.success('Nachweis hochgeladen');
      onGeaendert();
    } catch (e) {
      toast.error(grundAus(e, 'Der Nachweis konnte nicht hochgeladen werden.'));
    } finally {
      setArbeitet(null);
    }
  }

  async function entfernen(f: Freistellung) {
    setArbeitet(f.id);
    try {
      await nachweisEntfernen(f);
      toast.success('Nachweis entfernt');
      onGeaendert();
    } catch (e) {
      toast.error(grundAus(e, 'Der Nachweis konnte nicht entfernt werden.'));
    } finally {
      setArbeitet(null);
    }
  }

  return (
    <>
      <List>
        {antraege.map((f) => {
          const vermerk = nachweisVermerk(f);
          return (
            <ListRow
              key={f.id}
              title={<span>{freistellungZeitraum(f)}</span>}
              subtitle={
                <>
                  <span className="block">
                    {freistellungWas(f, anlaesse)}
                    {f.notiz ? ` · ${f.notiz}` : ''}
                  </span>
                  {f.entschiedenVonName && (
                    <span className="mt-1 block text-xs text-ink-muted">
                      {f.status} von {f.entschiedenVonName}
                      {f.grund ? ` — ${f.grund}` : ''}
                    </span>
                  )}
                  {vermerk && <span className="mt-1 block text-xs text-ink-muted">{vermerk}</span>}
                  {f.status === 'Beantragt' && f.nachweisPfad && (
                    <span className="mt-1 block text-xs text-ink-muted">Nachweis liegt bei — wird nach der Entscheidung gelöscht.</span>
                  )}
                </>
              }
            >
              <Zustand stand={STAND[f.status]}>{f.status}</Zustand>
              {f.status === 'Beantragt' && f.art !== 'unbezahlt' && (
                f.nachweisPfad ? (
                  <Button variant="ghost" loading={arbeitet === f.id} onClick={() => void entfernen(f)}>
                    Nachweis entfernen
                  </Button>
                ) : (
                  <NachweisWahl id={`nachweis-${f.id}`} laedt={arbeitet === f.id} onWahl={(d) => void hochladen(f, d)} />
                )
              )}
              {f.status === 'Beantragt' && (
                <Button variant="ghost" loading={arbeitet === f.id} onClick={() => setZurueck(f)}>
                  Zurückziehen
                </Button>
              )}
            </ListRow>
          );
        })}
      </List>

      <ConfirmDialog
        open={!!zurueck}
        title="Antrag zurückziehen?"
        message={zurueck ? `${freistellungWas(zurueck, anlaesse)}, ${freistellungZeitraum(zurueck)} — der Antrag wird gelöscht, ein Nachweis mit ihm.` : undefined}
        confirmLabel="Zurückziehen"
        onCancel={() => setZurueck(null)}
        onConfirm={async () => {
          if (!zurueck) return;
          await freistellungZurueckziehen(zurueck);
          setZurueck(null);
          toast.success('Antrag zurückgezogen');
          onGeaendert();
        }}
      />
    </>
  );
}
