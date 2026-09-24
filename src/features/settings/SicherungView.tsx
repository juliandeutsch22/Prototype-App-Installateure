import { useState } from 'react';
import { useAuth } from '@/app/AuthContext';
import { ausleitungJetzt } from '@/lib/db/laeufe';
import { auszug } from '@/lib/db/company';
import { mitFrist, FristAbgelaufen } from '@/lib/frist';
import Card from '@/components/Card';
import Button from '@/components/Button';
import PageHeader from '@/components/PageHeader';
import InfoHint from '@/components/InfoHint';
import { ErrorState } from '@/components/States';
import LaufStatus from './LaufStatus';
import { useToast } from '@/components/Toast';

/**
 * Datensicherung und Auskunft.
 *
 * WOFÜR DIESE ANSICHT DA IST. Den Datenexport gab es seit Langem — nur rief
 * ihn niemand auf. Eine Ausleitung, die niemand
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
  const [laufStand, setLaufStand] = useState(0);
  const [letzte, setLetzte] = useState<
    { zeilen: number; bytes: number; ziel: string; dateien?: number; dateienOffen?: number } | null
  >(null);

  if (!user) return null;

  async function sicherungJetzt() {
    setLaeuft('sicherung');
    setFehler(null);
    try {
      const data = await mitFrist(ausleitungJetzt(), FRIST_MS);
      setLetzte({
        zeilen: data.zeilen, bytes: data.bytes, ziel: data.ziel,
        dateien: data.dateien, dateienOffen: data.dateienOffen,
      });
      toast.success(`Sicherung erstellt: ${data.zeilen} Datensätze`);
      setLaufStand((n) => n + 1);
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
      const data = await mitFrist(auszug(), FRIST_MS);
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
          {/* Der Knopf darunter sagt bereits, was er tut. Uebrig bleibt der
              eine Satz, der jemanden davon abhaelt, ihn fuer noetig zu
              halten — das Warum steht im „i" darueber. */}
          <p className="text-sm text-ink-muted">Sie läuft von selbst.</p>
          {/*
            „SIE LÄUFT VON SELBST" WAR EINE BEHAUPTUNG, bis diese Zeile
            dazukam. Ob sie tatsächlich lief, stand nur im Google-Protokoll —
            und dorthin sieht in einem Installationsbetrieb niemand. Die
            Sicherung konnte wochenlang ausfallen; bemerkt hätte man es an dem
            Tag, an dem man sie braucht.
          */}
          <LaufStatus art="ausleitung" stand={laufStand} />
          <Button onClick={() => void sicherungJetzt()} disabled={laeuft !== null}>
            {laeuft === 'sicherung' ? 'Sicherung läuft …' : 'Sicherung jetzt erstellen'}
          </Button>
          {letzte && (
            <p className="text-sm text-ink">
              Zuletzt gesichert: <strong>{letzte.zeilen}</strong> Datensätze,{' '}
              {mb(letzte.bytes)} — Ziel: {letzte.ziel}
              {/*
                DIE FOTOS STEHEN DANEBEN, WEIL SIE EINEN EIGENEN ZUSTAND
                HABEN. Der Bestand geht in einem Zug hinaus; die Bilder nicht
                — ein Lauf nimmt so viele, wie in seine Laufzeit passen, und
                holt den Rest in den nächsten Nächten nach. Stünde hier nur
                „gesichert", hielte jemand einen Rückstand von dreitausend
                Fotos für erledigt.

                NUR WENN DIE FUNCTION ES SAGT: eine ältere Fassung schickt das
                Feld nicht mit, und dann wird nichts behauptet.
              */}
              {letzte.dateien !== undefined && (
                <span className="mt-1 block">
                  Fotos: <strong>{letzte.dateien}</strong> mitgesichert
                  {letzte.dateienOffen
                    ? `, ${letzte.dateienOffen} noch offen — sie gehen in den nächsten Läufen mit.`
                    : ' — es fehlt keines.'}
                </span>
              )}
            </p>
          )}
        </div>
      </Card>

      <Card>
        <div className="space-y-3">
          <h2 className="flex flex-wrap items-center font-semibold text-ink">
            Daten herunterladen
            <InfoHint about="das Herunterladen">
              Der komplette Bestand als Datei, für eine Auskunft nach Art. 15 DSGVO oder für den
              Umzug zu einem anderen Anbieter. Bei einem großen Betrieb kann der Download an
              seine Grenze stoßen — dann ist die nächtliche Sicherung der vollständige Weg, und
              die Meldung sagt das auch.
            </InfoHint>
          </h2>
          <Button variant="ghost" onClick={() => void herunterladen()} disabled={laeuft !== null}>
            {laeuft === 'download' ? 'Wird zusammengestellt …' : 'Alle Daten herunterladen'}
          </Button>
        </div>
      </Card>
    </div>
  );
}
