import { useState } from 'react';
import { useAuth } from '@/app/AuthContext';
import { ausleitungJetzt } from '@/lib/db/laeufe';
import { auszug } from '@/lib/db/company';
import { mitFrist, FristAbgelaufen } from '@/lib/frist';
import Card from '@/components/Card';
import Button from '@/components/Button';
import PageHeader from '@/components/PageHeader';
import { ErrorState } from '@/components/States';
import LaufStatus from './LaufStatus';
import { useToast } from '@/components/Toast';
import { SelectField } from '@/components/Field';
import { listGemahntInRange, listInvoicesInRange, listMahnungenInRange } from '@/lib/db/invoices';
import { listQuotesInRange } from '@/lib/db/quotes';
import { getWorkSheetsVoll, listBelegScheineInRange } from '@/lib/db/workSheets';
import { listCustomers } from '@/lib/db/customers';
import { todayStr } from '@/lib/time';

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

/**
 * Die wählbaren Zeiträume des Belegarchivs: alle Belege, oder ein Jahr der
 * Aufbewahrungsfrist (§ 132 BAO: sieben Jahre) samt dem laufenden.
 */
function archivZeitraeume(heute: string): { wert: string; label: string; von: string; bis: string }[] {
  const jahr = Number(heute.slice(0, 4));
  return [
    { wert: 'alle', label: 'Alle Belege', von: '2000-01-01', bis: heute },
    ...Array.from({ length: 8 }, (_, i) => {
      const j = jahr - i;
      return { wert: String(j), label: String(j), von: `${j}-01-01`, bis: i === 0 ? heute : `${j}-12-31` };
    }),
  ];
}

/** Zwei Minuten. Der Lauf liest den ganzen Mandanten; das dauert. */
const FRIST_MS = 120_000;

function mb(bytes: number): string {
  // Mit Komma, wie überall sonst in der App — vorher stand hier „0.0 MB".
  return `${(bytes / 1024 / 1024).toLocaleString('de-AT', { minimumFractionDigits: 1, maximumFractionDigits: 1 })} MB`;
}

export default function SicherungView() {
  const { user, company } = useAuth();
  const toast = useToast();

  const [laeuft, setLaeuft] = useState<'sicherung' | 'download' | 'archiv' | null>(null);
  const [archivWahl, setArchivWahl] = useState('alle');
  const [archivStand, setArchivStand] = useState<{ fertig: number; gesamt: number } | null>(null);
  const [archivErgebnis, setArchivErgebnis] = useState<{
    rechnungen: number; stornos: number; angebote: number; scheine: number; mahnungen: number; hinweise: number;
  } | null>(null);
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

  async function archivErstellen() {
    if (!user || !company) return;
    const z = archivZeitraeume(todayStr()).find((x) => x.wert === archivWahl);
    if (!z) return;
    setLaeuft('archiv');
    setFehler(null);
    setArchivErgebnis(null);
    setArchivStand(null);
    try {
      const [rechnungen, kunden, angebote, scheine, gemahnt, mahnungen] = await Promise.all([
        listInvoicesInRange(user.companyId, z.von, z.bis),
        listCustomers(user.companyId),
        listQuotesInRange(user.companyId, z.von, z.bis),
        listBelegScheineInRange(user.companyId, z.von, z.bis),
        listGemahntInRange(user.companyId, z.von, z.bis),
        listMahnungenInRange(user.companyId, z.von, z.bis),
      ]);
      const { belegArchiv, ersterBelegTag } = await import('@/features/invoices/belegArchiv');
      // „Alle Belege“ beginnt beim ersten Beleg, nicht am 01.01.2000 (Runde 3, G11).
      const von = z.wert === 'alle'
        ? ersterBelegTag(rechnungen, z.bis, [...angebote.map((q) => q.quoteDate), ...scheine.map((w) => w.datum)])
        : z.von;
      const e = await belegArchiv({
        company, rechnungen, kunden, von, bis: z.bis, angebote, scheine, gemahnt, mahnungen,
        scheineVoll: (ids) => getWorkSheetsVoll(user.companyId, ids),
        fortschritt: (fertig, gesamt) => setArchivStand({ fertig, gesamt }),
      });
      const url = URL.createObjectURL(e.blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${company.name}-Belegarchiv-${z.wert === 'alle' ? `${von}-bis-${z.bis}` : z.wert}.zip`;
      a.click();
      URL.revokeObjectURL(url);
      setArchivErgebnis({
        rechnungen: e.rechnungen, stornos: e.stornos, angebote: e.angebote, scheine: e.scheine,
        mahnungen: e.mahnungen, hinweise: e.hinweise.length,
      });
    } catch (e) {
      setFehler(e instanceof Error ? e.message : 'Das Belegarchiv konnte nicht erstellt werden.');
    } finally {
      setLaeuft(null);
      setArchivStand(null);
    }
  }

  return (
    <div className="space-y-6">
      <PageHeader
        ort="Einstellungen"
        title="Datensicherung"
        subtitle="Der Bestand des Betriebs an einem zweiten Ort — und zum Herunterladen"
      />

      {fehler && <ErrorState message={fehler} />}

      {/*
        Kartentitel wie überall, nicht als eigene Überschrift: vorher stand
        hier eine fette h2 mit dem „i" darin, und der aufgeklappte Text erbte
        die Fettschrift (Prüflauf 24.09.2026, D18).
      */}
      <Card
        title="Nächtliche Sicherung"
        hint={
          <>
            Jede Nacht um 02:30 schreibt die App den kompletten Bestand jedes Betriebs an einen
            zweiten Ort — Kunden, Baustellen, Zeiten, Rechnungen, Scheine und die Nummernkreise.
            Aufbewahrt werden die letzten dreißig Stände, der jüngste immer.
          </>
        }
      >
        <div className="space-y-3">
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

      <Card
        title="Daten herunterladen"
        hint={
          <>
            Der komplette Bestand als Datei, für eine Auskunft nach Art. 15 DSGVO oder für den
            Umzug zu einem anderen Anbieter. Bei einem großen Betrieb kann der Download an seine
            Grenze stoßen — dann ist die nächtliche Sicherung der vollständige Weg, und die
            Meldung sagt das auch.
          </>
        }
      >
        <div className="space-y-3">
          {/* Als Knopf mit Rand: ohne Rand stand er da wie ein Satz (Linie „Lot“). */}
          <Button variant="secondary" onClick={() => void herunterladen()} disabled={laeuft !== null}>
            {laeuft === 'download' ? 'Wird zusammengestellt …' : 'Alle Daten herunterladen'}
          </Button>
        </div>
      </Card>

      <Card
        title="Belegarchiv"
        hint={
          <>
            Alle Rechnungen und Stornorechnungen des Zeitraums als PDF, dazu das
            Rechnungsausgangsbuch als CSV, in einer ZIP-Datei; ebenso die Angebote (ohne Entwürfe)
            die unterschriebenen oder stornierten Handwerksscheine und die Mahnungen als PDF.
            Rechnungen sind sieben Jahre aufzubewahren (§ 132 BAO), auch nach dem Ende des
            Senklot-Vertrags; das Archiv lässt sich ohne Senklot öffnen. Die PDFs entstehen aus den
            gespeicherten Belegen, genau wie beim erneuten Laden; eine Mahnung so, wie sie
            hinausging. Mahnungen von vor dem 10.10.2026 sind nur mit ihrer letzten Stufe
            gespeichert — sie stehen in „Mahnungen.csv“, ohne Schreiben. Was fehlt, etwa eine nie
            ausgestellte Stornorechnung, steht in der Datei „Hinweise.txt“.
          </>
        }
      >
        <div className="flex flex-wrap items-end gap-3">
          <SelectField
            id="archiv-zeitraum"
            label="Zeitraum"
            value={archivWahl}
            onChange={(e) => setArchivWahl(e.target.value)}
            disabled={laeuft !== null}
          >
            {archivZeitraeume(todayStr()).map((z) => (
              <option key={z.wert} value={z.wert}>{z.label}</option>
            ))}
          </SelectField>
          <Button variant="secondary" onClick={() => void archivErstellen()} disabled={laeuft !== null}>
            {laeuft === 'archiv'
              ? archivStand
                ? `Belege: ${archivStand.fertig} von ${archivStand.gesamt}`
                : 'Wird zusammengestellt …'
              : 'Belegarchiv herunterladen'}
          </Button>
        </div>
        {archivErgebnis && (
          <p className="mt-3 text-sm text-ink">
            Im Archiv: {archivErgebnis.rechnungen} {archivErgebnis.rechnungen === 1 ? 'Rechnung' : 'Rechnungen'},{' '}
            {archivErgebnis.stornos} {archivErgebnis.stornos === 1 ? 'Stornorechnung' : 'Stornorechnungen'},{' '}
            {archivErgebnis.angebote} {archivErgebnis.angebote === 1 ? 'Angebot' : 'Angebote'},{' '}
            {archivErgebnis.scheine} {archivErgebnis.scheine === 1 ? 'Handwerksschein' : 'Handwerksscheine'},{' '}
            {archivErgebnis.mahnungen} {archivErgebnis.mahnungen === 1 ? 'Mahnung' : 'Mahnungen'}
            {archivErgebnis.hinweise > 0
              ? `. ${archivErgebnis.hinweise === 1 ? 'Ein Hinweis steht' : `${archivErgebnis.hinweise} Hinweise stehen`} in „Hinweise.txt“.`
              : '.'}
          </p>
        )}
      </Card>
    </div>
  );
}
