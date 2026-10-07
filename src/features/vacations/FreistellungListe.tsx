import { useState } from 'react';
import type { Freistellung } from '@/types';
import { freistellungZurueckziehen, nachweisEntfernen, nachweisHochladen } from '@/lib/db/freistellungen';
import Button from '@/components/Button';
import ConfirmDialog from '@/components/ConfirmDialog';
import { List, ListRow } from '@/components/ListRow';
import { Zustand, type Stand } from '@/components/Badge';
import { useToast } from '@/components/Toast';
import { grundAus } from '@/lib/fehlerGrund';
import { freistellungWas, freistellungZeitraum, nachweisVermerk, ueberVermerk } from './freistellungText';
import { NachweisWahl } from './FreistellungFormular';
import { SonderurlaubFenster } from './AntragFenster';

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
  /** Der Antrag im Seitenfenster — als Id: nach dem Neuladen zeigt es den frischen Stand. */
  const [offenId, setOffenId] = useState<string | null>(null);
  const offen = offenId ? antraege.find((f) => f.id === offenId) ?? null : null;

  /*
    DIE HANDGRIFFE EINES OFFENEN ANTRAGS — in der Zeile und im Seitenfenster
    dieselben. Zurückziehen schliesst das Fenster zuerst: die Rückfrage
    gehört allein in den Vordergrund.
  */
  function knoepfe(f: Freistellung, ausFenster: boolean) {
    if (f.status !== 'Beantragt') return null;
    const art = ausFenster ? 'secondary' : 'ghost';
    return (
      <>
        {f.art !== 'unbezahlt' && (
          f.nachweisPfad ? (
            <Button variant={art} loading={arbeitet === f.id} onClick={() => void entfernen(f)}>
              Nachweis entfernen
            </Button>
          ) : (
            <NachweisWahl
              id={ausFenster ? `nachweis-fenster-${f.id}` : `nachweis-${f.id}`}
              laedt={arbeitet === f.id}
              onWahl={(d) => void hochladen(f, d)}
            />
          )
        )}
        <Button
          variant={art}
          loading={arbeitet === f.id}
          onClick={() => {
            if (ausFenster) setOffenId(null);
            setZurueck(f);
          }}
        >
          Zurückziehen
        </Button>
      </>
    );
  }

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
          const ueber = f.status === 'Bestätigt' ? ueberVermerk(f) : null;
          return (
            <ListRow
              key={f.id}
              title={
                <>
                  <span>{freistellungZeitraum(f)}</span>
                  {/* Die Zeile öffnet den Antrag mit seinem Verlauf (Seitenfenster). */}
                  <span className="sr-only"> – Verlauf anzeigen</span>
                </>
              }
              onOeffnen={() => setOffenId(f.id)}
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
                  {ueber && <span className="mt-1 block text-xs text-ink-muted">{ueber}</span>}
                  {f.status === 'Beantragt' && f.nachweisPfad && (
                    <span className="mt-1 block text-xs text-ink-muted">Nachweis liegt bei — wird nach der Entscheidung gelöscht.</span>
                  )}
                </>
              }
            >
              <Zustand stand={STAND[f.status]}>{f.status}</Zustand>
              {knoepfe(f, false)}
            </ListRow>
          );
        })}
      </List>

      <SonderurlaubFenster
        antrag={offen}
        anlaesse={anlaesse}
        stand={offen && <Zustand stand={STAND[offen.status]}>{offen.status}</Zustand>}
        onClose={() => setOffenId(null)}
      >
        {offen ? knoepfe(offen, true) : null}
      </SonderurlaubFenster>

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
