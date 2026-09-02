import { useState } from 'react';
import { useAuth } from '@/app/AuthContext';
import { callDatenAusleitungJetzt, callExportCompanyData } from '@/lib/functions';
import { mitFrist, FristAbgelaufen } from '@/lib/frist';
import Card from '@/components/Card';
import Button from '@/components/Button';
import PageHeader from '@/components/PageHeader';
import InfoHint from '@/components/InfoHint';
import { ErrorState } from '@/components/States';
import { useToast } from '@/components/Toast';

/**
 * Datensicherung und Auskunft.
 *
 * WOFÜR DIESE ANSICHT DA IST. Es gab die Cloud Function für den Datenexport
 * seit Langem — nur rief sie niemand auf. Eine Ausleitung, die niemand
 * auslösen kann, ist ein Versprechen und keine Sicherung; und eine, die
 * niemand je geprüft hat, ist auch keine. Hier steht beides: der Knopf, der
 * den nächtlichen Lauf sofort ausführt, und der, der den Bestand
 * herunterlädt.
 *
 * ZWEI WEGE, WEIL ES ZWEI FRAGEN SIND:
 *
 *   „Sind meine Daten woanders?"    → Sicherung jetzt erstellen.
 *   „Gib mir meine Daten heraus."   → Herunterladen (DSGVO Art. 15/20).
 *
 * Der Unterschied ist nicht kosmetisch: der Download kommt in EINER Antwort
 * zurück und ist bei 10 MB gedeckelt — für einen Betrieb mit Historie zu
 * wenig. Die Ausleitung schreibt in einen Speicherort und kennt diese Grenze
 * nicht. Deshalb steht sie oben.
 */

/** Zwei Minuten. Der Lauf liest den ganzen Mandanten; das dauert. */
const FRIST_MS = 120_000;

function mb(bytes: number): string {
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

export default function SicherungView() {
  const { user, company } = useAuth();
  const toast = useToast();

  const [laeuft, setLaeuft] = useState<'sicherung' | 'download' | null>(null);
  const [fehler, setFehler] = useState<string | null>(null);
  const [letzte, setLetzte] = useState<{ zeilen: number; bytes: number; ziel: string } | null>(null);

  if (!user) return null;

  async function sicherungJetzt() {
    setLaeuft('sicherung');
    setFehler(null);
    try {
      const { data } = await mitFrist(callDatenAusleitungJetzt({}), FRIST_MS);
      setLetzte({ zeilen: data.zeilen, bytes: data.bytes, ziel: data.ziel });
      toast.success(`Sicherung erstellt: ${data.zeilen} Datensätze`);
    } catch (e) {
      // Der Text der Function ist bewusst verständlich gehalten — sie sagt
      // etwa, dass der Bestand zu gross ist. Ihn zu verschlucken und durch
      // „hat nicht geklappt" zu ersetzen, nähme genau die Auskunft weg.
      setFehler(
        e instanceof FristAbgelaufen
          ? 'Der Lauf hat nicht innerhalb von zwei Minuten geantwortet. Er läuft möglicherweise weiter — bitte später noch einmal nachsehen.'
          : e instanceof Error
            ? e.message
            : 'Die Sicherung konnte nicht erstellt werden.',
      );
    } finally {
      setLaeuft(null);
    }
  }

  async function herunterladen() {
    setLaeuft('download');
    setFehler(null);
    try {
      const { data } = await mitFrist(callExportCompanyData({}), FRIST_MS);
      const inhalt = JSON.stringify(data, null, 2);
      const url = URL.createObjectURL(new Blob([inhalt], { type: 'application/json' }));
      const a = document.createElement('a');
      a.href = url;
      a.download = `${company?.name ?? 'betrieb'}-${data.exportedAt.slice(0, 10)}.json`;
      a.click();
      // Ohne das Freigeben bleibt der ganze Bestand im Speicher der Seite
      // liegen, bis sie neu geladen wird.
      URL.revokeObjectURL(url);
      const gesamt = Object.values(data.anzahl).reduce((s, n) => s + n, 0);
      toast.success(`${gesamt} Datensätze heruntergeladen`);
    } catch (e) {
      setFehler(
        e instanceof FristAbgelaufen
          ? 'Der Export hat nicht innerhalb von zwei Minuten geantwortet.'
          : e instanceof Error
            ? e.message
            : 'Der Export konnte nicht erstellt werden.',
      );
    } finally {
      setLaeuft(null);
    }
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Datensicherung"
        subtitle="Der Bestand des Betriebs an einem zweiten Ort — und zum Herunterladen"
      />

      {fehler && <ErrorState message={fehler} />}

      <Card>
        <div className="space-y-3">
          <h2 className="font-semibold text-ink">
            Nächtliche Sicherung
            <InfoHint about="die nächtliche Sicherung">
              Jede Nacht um 02:30 schreibt die App den kompletten Bestand jedes Betriebs an
              einen zweiten Ort — Kunden, Baustellen, Zeiten, Rechnungen, Scheine und die
              Nummernkreise. Aufbewahrt werden die letzten dreißig Stände, der jüngste immer.
            </InfoHint>
          </h2>
          <p className="text-sm text-ink-muted">
            Sie läuft von selbst. Der Knopf ist zum Nachsehen da: er macht denselben Lauf
            sofort und sagt, wie viel dabei herauskommt.
          </p>
          <Button onClick={() => void sicherungJetzt()} disabled={laeuft !== null}>
            {laeuft === 'sicherung' ? 'Sicherung läuft …' : 'Sicherung jetzt erstellen'}
          </Button>
          {letzte && (
            <p className="text-sm text-ink">
              Zuletzt gesichert: <strong>{letzte.zeilen}</strong> Datensätze,{' '}
              {mb(letzte.bytes)} — Ziel: {letzte.ziel}
            </p>
          )}
        </div>
      </Card>

      <Card>
        <div className="space-y-3">
          <h2 className="font-semibold text-ink">Daten herunterladen</h2>
          <p className="text-sm text-ink-muted">
            Der komplette Bestand als Datei, für eine Auskunft nach Art. 15 DSGVO oder für den
            Umzug zu einem anderen Anbieter. Bei einem großen Betrieb kann der Download an
            seine Grenze stoßen — dann ist die nächtliche Sicherung der vollständige Weg, und
            die Meldung sagt das auch.
          </p>
          <Button variant="ghost" onClick={() => void herunterladen()} disabled={laeuft !== null}>
            {laeuft === 'download' ? 'Wird zusammengestellt …' : 'Alle Daten herunterladen'}
          </Button>
        </div>
      </Card>
    </div>
  );
}
