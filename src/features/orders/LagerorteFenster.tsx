import { useState } from 'react';
import type { Lagerort } from '@/types';
import { lagerortSpeichern } from '@/lib/db/lagerorte';
import { grundAus } from '@/lib/fehlerGrund';
import BottomSheet from '@/components/BottomSheet';
import Button from '@/components/Button';
import { List, ListRow } from '@/components/ListRow';
import { Zustand } from '@/components/Badge';
import { CheckboxField, InputField } from '@/components/Field';
import { ErrorState } from '@/components/States';
import { useToast } from '@/components/Toast';
import { HAUPTLAGER_NAME, ortReihenfolge } from './lagerorte';

/**
 * DIE LAGERORTE PFLEGEN (M04a): weitere Lager bzw. Regale an einer Anschrift
 * anlegen, umbenennen, stilllegen; das Hauptlager umbenennen. Fahrzeuglager
 * entstehen mit ihrem Fahrzeug (Einstellungen › Fahrzeuge) und stehen hier
 * nur zur Übersicht.
 *
 * Stilllegen geht nur ohne Bestand — die Datenbank sagt es sonst mit dem
 * Ort; Ware an einem stillgelegten Ort stünde in keiner Liste.
 */
interface Entwurf {
  id?: string;
  art: 'haupt' | 'lager';
  bezeichnung: string;
  anschrift: string;
  aktiv: boolean;
}

export default function LagerorteFenster({
  offen,
  orte,
  onClose,
  onGeaendert,
}: {
  offen: boolean;
  orte: readonly Lagerort[];
  onClose: () => void;
  onGeaendert: () => void;
}) {
  const toast = useToast();
  const [entwurf, setEntwurf] = useState<Entwurf | null>(null);
  const [fehler, setFehler] = useState<string | null>(null);
  const [speichert, setSpeichert] = useState(false);
  const haupt = orte.find((o) => o.art === 'haupt');
  const lager = ortReihenfolge(orte.filter((o) => o.art === 'lager'));
  const fahrzeuge = ortReihenfolge(orte.filter((o) => o.art === 'fahrzeug'));

  function schliessen() {
    setEntwurf(null);
    setFehler(null);
    onClose();
  }

  async function speichern() {
    if (!entwurf) return;
    setFehler(null);
    if (!entwurf.bezeichnung.trim()) {
      setFehler('Bitte eine Bezeichnung eintragen.');
      return;
    }
    setSpeichert(true);
    try {
      await lagerortSpeichern({
        id: entwurf.id,
        art: entwurf.art,
        bezeichnung: entwurf.bezeichnung.trim(),
        anschrift: entwurf.anschrift.trim() || null,
        aktiv: entwurf.aktiv,
      });
      toast.success(`${entwurf.bezeichnung.trim()} gespeichert`);
      setEntwurf(null);
      onGeaendert();
    } catch (err) {
      setFehler(grundAus(err, 'Der Lagerort konnte nicht gespeichert werden.'));
    } finally {
      setSpeichert(false);
    }
  }

  return (
    <BottomSheet open={offen} onClose={schliessen} label="Lagerorte" auchBreit titel={entwurf ? (entwurf.id ? 'Lagerort ändern' : 'Lager anlegen') : 'Lagerorte'}>
      {entwurf ? (
        <div className="formular space-y-4">
          <InputField
            id="lagerort-bezeichnung"
            label="Bezeichnung"
            pflicht
            placeholder={entwurf.art === 'haupt' ? HAUPTLAGER_NAME : 'z. B. Außenlager Liesing'}
            value={entwurf.bezeichnung}
            onChange={(e) => setEntwurf({ ...entwurf, bezeichnung: e.target.value })}
          />
          {entwurf.art === 'lager' && (
            <InputField
              id="lagerort-anschrift"
              label="Anschrift oder Regal (optional)"
              value={entwurf.anschrift}
              onChange={(e) => setEntwurf({ ...entwurf, anschrift: e.target.value })}
            />
          )}
          {entwurf.art === 'lager' && entwurf.id && (
            <CheckboxField
              id="lagerort-aktiv"
              label="In Betrieb"
              checked={entwurf.aktiv}
              onChange={(e) => setEntwurf({ ...entwurf, aktiv: e.target.checked })}
            />
          )}
          {fehler && <ErrorState message={fehler} />}
          <div className="fuss-aktionen">
            <Button variant="ghost" onClick={() => { setEntwurf(null); setFehler(null); }}>Zurück</Button>
            <Button loading={speichert} onClick={() => void speichern()}>Speichern</Button>
          </div>
        </div>
      ) : (
        <div className="space-y-5">
          <List>
            <ListRow
              title={haupt?.bezeichnung ?? HAUPTLAGER_NAME}
              subtitle="Hauptlager — der Bestand am Artikel"
              onOeffnen={() => setEntwurf({
                id: haupt?.id, art: 'haupt', bezeichnung: haupt?.bezeichnung ?? HAUPTLAGER_NAME, anschrift: '', aktiv: true,
              })}
              pfeil
            />
            {lager.map((o) => (
              <ListRow
                key={o.id}
                title={o.bezeichnung}
                subtitle={o.anschrift || 'weiteres Lager'}
                zustand={o.aktiv ? undefined : <Zustand stand="erledigt">stillgelegt</Zustand>}
                onOeffnen={() => setEntwurf({
                  id: o.id, art: 'lager', bezeichnung: o.bezeichnung, anschrift: o.anschrift ?? '', aktiv: o.aktiv,
                })}
                pfeil
              />
            ))}
            {fahrzeuge.map((o) => (
              <ListRow
                key={o.id}
                title={`Fahrzeug ${o.bezeichnung}`}
                subtitle="Fahrzeuglager — gepflegt unter Einstellungen › Fahrzeuge"
                zustand={o.aktiv ? undefined : <Zustand stand="erledigt">stillgelegt</Zustand>}
              />
            ))}
          </List>
          <Button
            variant="secondary"
            onClick={() => setEntwurf({ art: 'lager', bezeichnung: '', anschrift: '', aktiv: true })}
          >
            Lager anlegen
          </Button>
        </div>
      )}
    </BottomSheet>
  );
}
