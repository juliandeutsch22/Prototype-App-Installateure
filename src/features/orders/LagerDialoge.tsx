import { useEffect, useState } from 'react';
import type { Lagerbewegung, Material } from '@/types';
import type { WithId } from '@/lib/db/core';
import { lagerEingang, lagerInventur, listLagerbewegungen } from '@/lib/db/materials';
import { listGrosshaendler } from '@/lib/db/einkauf';
import ConfirmDialog from '@/components/ConfirmDialog';
import ZahlFeld from '@/components/ZahlFeld';
import { InputField } from '@/components/Field';
import { List, ListRow } from '@/components/ListRow';
import { zahlAlsText, zahlOder } from '@/lib/zahl';
import { mengeFehler } from '@/lib/einheit';
import { fmtMenge } from '@/lib/belegLayout';
import { datumAT, datumAusMs } from '@/lib/datum';

/**
 * Wareneingang mit Lieferant, Lieferschein und Bezug (Testbericht 30.09.2026,
 * M29). Vorher war er nur eine Zahl.
 *
 * DER LIEFERANT IST PFLICHT, Lieferschein und Bezug nicht: ohne Lieferant ist
 * ein Eingang nicht zuzuordnen; ein Lieferschein liegt nicht immer schon da.
 * Vorgeschlagen werden die Grosshändler der Einkaufsliste.
 */
export function WareneingangDialog({
  companyId,
  artikel,
  onFertig,
  onAbbrechen,
}: {
  companyId: string;
  artikel: WithId<Material>;
  onFertig: (text: string) => void;
  onAbbrechen: () => void;
}) {
  const [menge, setMenge] = useState('1');
  const [lieferant, setLieferant] = useState('');
  const [lieferschein, setLieferschein] = useState('');
  const [bezug, setBezug] = useState('');
  const [vorschlaege, setVorschlaege] = useState<string[]>([]);

  useEffect(() => {
    let weg = false;
    // Ein fehlender Vorschlag hält den Eingang nicht auf — getippt geht immer.
    Promise.resolve()
      .then(() => listGrosshaendler(companyId))
      .then((g) => { if (!weg) setVorschlaege(g.filter((x) => x.active).map((x) => x.name)); })
      .catch(() => undefined);
    return () => { weg = true; };
  }, [companyId]);

  async function buchen() {
    const n = zahlOder(menge, NaN);
    const falsch = mengeFehler(n, artikel.unit);
    if (falsch) throw new Error(falsch);
    if (!lieferant.trim()) throw new Error('Von welchem Lieferanten kommt die Ware?');
    await lagerEingang({
      materialId: artikel.id,
      menge: n,
      lieferant: lieferant.trim(),
      lieferschein: lieferschein.trim() || undefined,
      bezug: bezug.trim() || undefined,
    });
    onFertig(`${fmtMenge(n)} ${artikel.unit ?? 'Stk'} ${artikel.name} eingebucht`);
  }

  return (
    <ConfirmDialog
      open
      title={`Wareneingang: ${artikel.name}`}
      message="Die Menge kommt zum Bestand dazu und steht mit Lieferant und Lieferschein im Bewegungsprotokoll."
      confirmLabel="Einbuchen"
      confirmTone="primary"
      onConfirm={buchen}
      onCancel={onAbbrechen}
    >
      <div className="space-y-3">
        <ZahlFeld
          id="eingang-menge"
          label={`Menge (${artikel.unit ?? 'Stk'})`}
          pflicht
          value={menge}
          onChange={setMenge}
        />
        <InputField
          id="eingang-lieferant"
          label="Lieferant"
          pflicht
          list="eingang-lieferanten"
          autoComplete="off"
          value={lieferant}
          onChange={(e) => setLieferant(e.target.value)}
        />
        <datalist id="eingang-lieferanten">
          {vorschlaege.map((v) => <option key={v} value={v} />)}
        </datalist>
        <InputField
          id="eingang-lieferschein"
          label="Lieferschein-Nr."
          value={lieferschein}
          onChange={(e) => setLieferschein(e.target.value)}
        />
        <InputField
          id="eingang-bezug"
          label="Bestellbezug (Bestellnummer)"
          placeholder="z. B. Bestellung 2026-114"
          value={bezug}
          onChange={(e) => setBezug(e.target.value)}
        />
      </div>
    </ConfirmDialog>
  );
}

/**
 * Inventur: der gezählte Bestand, mit Grund (Testbericht 30.09.2026, M28).
 * Vorher liess sich der Bestand im Katalog ohne Grund überschreiben.
 */
export function InventurDialog({
  artikel,
  onFertig,
  onAbbrechen,
}: {
  artikel: WithId<Material>;
  onFertig: (text: string) => void;
  onAbbrechen: () => void;
}) {
  const [bestand, setBestand] = useState(zahlAlsText(artikel.stock ?? 0));
  const [grund, setGrund] = useState('');

  async function buchen() {
    const n = zahlOder(bestand, NaN);
    if (!Number.isFinite(n) || n < 0) throw new Error('Der gezählte Bestand ist null oder mehr.');
    if (n > 0) {
      const falsch = mengeFehler(n, artikel.unit);
      if (falsch) throw new Error(falsch);
    }
    if (!grund.trim()) throw new Error('Ohne Grund keine Korrektur — etwa „Inventur 31.12.“ oder „Bruch“.');
    await lagerInventur(artikel.id, n, grund.trim());
    onFertig(
      n === (artikel.stock ?? 0)
        ? `Bestand ${artikel.name} bestätigt`
        : `Bestand ${artikel.name} auf ${fmtMenge(n)} ${artikel.unit ?? 'Stk'} gesetzt`,
    );
  }

  return (
    <ConfirmDialog
      open
      title={`Inventur: ${artikel.name}`}
      message={`Im System stehen ${fmtMenge(artikel.stock ?? 0)} ${artikel.unit ?? 'Stk'}. Eingetragen wird, was gezählt wurde — mit Grund im Bewegungsprotokoll.`}
      confirmLabel="Bestand buchen"
      confirmTone="primary"
      onConfirm={buchen}
      onCancel={onAbbrechen}
    >
      <div className="space-y-3">
        <ZahlFeld
          id="inventur-bestand"
          label={`Gezählter Bestand (${artikel.unit ?? 'Stk'})`}
          pflicht
          value={bestand}
          onChange={setBestand}
        />
        <InputField
          id="inventur-grund"
          label="Grund"
          pflicht
          placeholder="z. B. Inventur 31.12., Bruch, Fehlbuchung"
          value={grund}
          onChange={(e) => setGrund(e.target.value)}
        />
      </div>
    </ConfirmDialog>
  );
}

const ART: Record<Lagerbewegung['art'], string> = {
  anfangsbestand: 'Anfangsbestand',
  eingang: 'Wareneingang',
  entnahme: 'Entnahme',
  retoure: 'Retoure',
  inventur: 'Inventur',
  zugang: 'Zugang',
  abgang: 'Abgang',
};

/** Das Bewegungsprotokoll eines Artikels (M28). */
export function BewegungenDialog({
  artikel,
  onSchliessen,
}: {
  artikel: WithId<Material>;
  onSchliessen: () => void;
}) {
  const [zeilen, setZeilen] = useState<Lagerbewegung[] | null>(null);
  const [fehler, setFehler] = useState<string | null>(null);

  useEffect(() => {
    let weg = false;
    Promise.resolve()
      .then(() => listLagerbewegungen(artikel.id))
      .then((z) => { if (!weg) setZeilen(z); })
      .catch(() => { if (!weg) setFehler('Das Bewegungsprotokoll konnte nicht geladen werden.'); });
    return () => { weg = true; };
  }, [artikel.id]);

  const einheit = artikel.unit ?? 'Stk';
  return (
    <ConfirmDialog
      open
      title={`Bewegungen: ${artikel.name}`}
      message={`Jede Änderung des Bestands, jüngste zuerst. Heute: ${fmtMenge(artikel.stock ?? 0)} ${einheit}.`}
      confirmLabel="Schliessen"
      confirmTone="primary"
      onConfirm={onSchliessen}
      onCancel={onSchliessen}
    >
      {fehler ? (
        <p className="text-sm text-danger">{fehler}</p>
      ) : zeilen === null ? (
        <p className="text-sm text-ink-muted">Wird geladen …</p>
      ) : zeilen.length === 0 ? (
        <p className="text-sm text-ink-muted">
          Noch keine Bewegung protokolliert. Das Protokoll beginnt mit dem 30.09.2026; was davor
          geschah, steht nur im Bestand.
        </p>
      ) : (
        <List>
          {zeilen.map((b) => (
            <ListRow
              key={b.id}
              title={
                <span>
                  {ART[b.art]} {b.menge > 0 ? '+' : ''}{fmtMenge(b.menge)} {einheit}
                </span>
              }
              subtitle={
                <span>
                  {datumAT(datumAusMs(b.createdAt))} · danach {fmtMenge(b.bestandNachher)} {einheit}
                  {b.erfasstVonName ? ` · ${b.erfasstVonName}` : ''}
                  {b.lieferant ? ` · ${b.lieferant}` : ''}
                  {b.lieferschein ? ` · Lieferschein ${b.lieferschein}` : ''}
                  {b.bezug ? ` · ${b.bezug}` : ''}
                  {b.grund ? ` · Grund: ${b.grund}` : ''}
                </span>
              }
            />
          ))}
        </List>
      )}
    </ConfirmDialog>
  );
}
