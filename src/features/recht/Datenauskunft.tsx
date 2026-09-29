import { useState } from 'react';
import { useAuth } from '@/app/AuthContext';
import { personAuskunft, type AuskunftArt } from '@/lib/db/auskunft';
import Card from '@/components/Card';
import Button from '@/components/Button';
import Hinweiszeile from '@/components/Hinweiszeile';
import { useToast } from '@/components/Toast';
import { auskunftDateiname, zeigtAuskunft } from './auskunftDatei';

/**
 * Die Datenauskunft nach Art. 15 DSGVO — in der Benutzer- und der Kundenakte.
 *
 * NUR FÜR DIE GESCHÄFTSFÜHRUNG, und nicht im Supporteinblick. Beides zieht
 * die Datenbank ohnehin (`person_auskunft`); hier fehlt der Knopf, wo er nur
 * mit einer Fehlermeldung antworten könnte.
 *
 * EINE DATEI, KEINE ANSICHT. Die Auskunft geht an die Person hinaus; der
 * Betrieb soll sie weitergeben können, wie sie ist, und vorher durchsehen,
 * was der Hinweis darin nennt.
 */
export default function Datenauskunft({ art, id }: { art: AuskunftArt; id: string }) {
  const { user, einblick } = useAuth();
  const toast = useToast();
  const [laedt, setLaedt] = useState(false);
  const [fehler, setFehler] = useState<string | null>(null);

  if (!zeigtAuskunft(user?.role, !!einblick)) return null;

  async function herunterladen() {
    setLaedt(true);
    setFehler(null);
    try {
      const auskunft = await personAuskunft(art, id);
      const url = URL.createObjectURL(
        new Blob([JSON.stringify(auskunft, null, 2)], { type: 'application/json' }),
      );
      const a = document.createElement('a');
      a.href = url;
      a.download = auskunftDateiname(auskunft.person, auskunft.erstellt_am);
      a.click();
      URL.revokeObjectURL(url);
      toast.success('Datenauskunft heruntergeladen');
    } catch (e) {
      // Die Meldung der Datenbank ist für Menschen geschrieben — etwa, dass
      // die Auskunft zu gross ist und welcher Weg dann bleibt.
      setFehler(e instanceof Error ? e.message : 'Die Auskunft konnte nicht erstellt werden.');
    } finally {
      setLaedt(false);
    }
  }

  return (
    <Card
      title="Datenauskunft"
      hint={
        <>
          Nach Art. 15 DSGVO hat jede Person das Recht zu erfahren, was der Betrieb über sie
          gespeichert hat. Die Datei enthält alles zu {art === 'kunde' ? 'diesem Kunden' : 'dieser Person'} —
          Tabelle für Tabelle, maschinenlesbar. Daten anderer Personen bleiben draußen. Vor dem
          Weitergeben den Hinweis in der Datei lesen: ältere Einträge ohne Kennung sind über den
          Namen zugeordnet.
        </>
      }
    >
      <div className="space-y-3">
        <Button variant="secondary" loading={laedt} onClick={() => void herunterladen()}>
          Auskunft herunterladen
        </Button>
        {fehler && <Hinweiszeile stufe="fehl" role="alert">{fehler}</Hinweiszeile>}
      </div>
    </Card>
  );
}
