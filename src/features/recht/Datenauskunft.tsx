import { useState } from 'react';
import { useAuth } from '@/app/AuthContext';
import {
  personAuskunft, personLoeschen, type AuskunftArt, type LoeschBericht,
} from '@/lib/db/auskunft';
import Card from '@/components/Card';
import Button from '@/components/Button';
import ConfirmDialog from '@/components/ConfirmDialog';
import Hinweiszeile from '@/components/Hinweiszeile';
import { useToast } from '@/components/Toast';
import { datumAT } from '@/lib/datum';
import { SOFORT_GELOESCHT, auskunftDateiname, zeigtAuskunft } from './auskunftDatei';

/**
 * Datenschutz je Person — Auskunft (Art. 15) und Löschung (Art. 17) — in der
 * Benutzer- und der Kundenakte.
 *
 * NUR FÜR DIE GESCHÄFTSFÜHRUNG, und nicht im Supporteinblick. Beides zieht
 * die Datenbank ohnehin (`person_auskunft`, `person_loeschen`); hier fehlt der
 * Knopf, wo er nur mit einer Fehlermeldung antworten könnte.
 *
 * DIE AUSKUNFT IST EINE DATEI, KEINE ANSICHT. Sie geht an die Person hinaus;
 * der Betrieb soll sie weitergeben können, wie sie ist.
 *
 * DIE LÖSCHUNG BEGINNT MIT DEM PROBELAUF. Erst steht im Dialog, was gelöscht
 * wird und was bis wann aufbewahrt werden muss; gelöscht wird erst danach.
 */
export default function Datenauskunft({
  art,
  id,
  onGeloescht,
}: {
  art: AuskunftArt;
  id: string;
  /** Nach der Löschung: die Akte neu laden, oder — war es der ganze Kunde — verlassen. */
  onGeloescht?: (ganz: boolean) => void;
}) {
  const { user, einblick } = useAuth();
  const toast = useToast();
  const [laedt, setLaedt] = useState<'auskunft' | 'probe' | null>(null);
  const [fehler, setFehler] = useState<string | null>(null);
  const [probe, setProbe] = useState<LoeschBericht | null>(null);

  if (!zeigtAuskunft(user?.role, !!einblick)) return null;

  async function herunterladen() {
    setLaedt('auskunft');
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
      setLaedt(null);
    }
  }

  async function pruefen() {
    setLaedt('probe');
    setFehler(null);
    try {
      setProbe(await personLoeschen(art, id, true));
    } catch (e) {
      // Etwa: „Zuerst das Konto deaktivieren".
      setFehler(e instanceof Error ? e.message : 'Die Löschung konnte nicht geprüft werden.');
    } finally {
      setLaedt(null);
    }
  }

  const sofort = probe
    ? Object.entries(probe.sofort).filter(([, n]) => n > 0)
    : [];

  return (
    <Card
      title="Datenschutz"
      hint={
        <>
          Nach der DSGVO kann jede Person erfahren, was der Betrieb über sie gespeichert hat
          (Auskunft, Art. 15), und die Löschung verlangen (Art. 17). Die Auskunft ist eine Datei mit
          allem zu {art === 'kunde' ? 'diesem Kunden' : 'dieser Person'} — Daten anderer bleiben
          draußen; vor dem Weitergeben den Hinweis darin lesen. Gelöscht wird, was nicht aufbewahrt
          werden muss; Belege und Zeitaufzeichnungen bleiben nach § 132 BAO sieben Jahre gesperrt
          erhalten. Vor dem Löschen zeigt ein Probelauf, was geschieht.
        </>
      }
    >
      <div className="space-y-3">
        <div className="flex flex-wrap gap-3">
          <Button variant="secondary" loading={laedt === 'auskunft'} onClick={() => void herunterladen()}>
            Auskunft herunterladen
          </Button>
          <Button variant="ghost" loading={laedt === 'probe'} onClick={() => void pruefen()}>
            Löschen …
          </Button>
        </div>
        {fehler && <Hinweiszeile stufe="fehl" role="alert">{fehler}</Hinweiszeile>}
      </div>

      <ConfirmDialog
        open={probe !== null}
        title={probe?.ganz ? `${probe.person} ganz löschen?` : `Daten von ${probe?.person ?? ''} löschen?`}
        confirmLabel="Jetzt löschen"
        onCancel={() => setProbe(null)}
        onConfirm={async () => {
          const bericht = await personLoeschen(art, id, false);
          setProbe(null);
          toast.success(bericht.ganz ? `${bericht.person} gelöscht` : 'Gelöscht, was gehen darf');
          onGeloescht?.(bericht.ganz);
        }}
      >
        {probe && (
          <div className="space-y-3 text-sm">
            {probe.ganz ? (
              <p>Keine Belege — der Kunde und seine Wartungen werden ganz gelöscht.</p>
            ) : (
              <>
                <div>
                  <p className="font-semibold">Wird gelöscht</p>
                  {sofort.length === 0 ? (
                    <p className="text-ink-muted">Nichts — es gibt nichts, was sofort gehen darf.</p>
                  ) : (
                    <ul className="list-disc pl-5">
                      {sofort.map(([schluessel, n]) => (
                        <li key={schluessel}>
                          {SOFORT_GELOESCHT[schluessel] ?? schluessel}: {n}
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
                {probe.aufbewahren.length > 0 && (
                  <div>
                    <p className="font-semibold">Bleibt gesperrt (§ 132 BAO)</p>
                    <ul className="list-disc pl-5">
                      {probe.aufbewahren.map((a) => (
                        <li key={a.was}>
                          {a.was}: {a.anzahl}, bis {datumAT(a.bis)}
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
                <p className="text-ink-muted">{probe.hinweis}</p>
              </>
            )}
          </div>
        )}
      </ConfirmDialog>
    </Card>
  );
}
