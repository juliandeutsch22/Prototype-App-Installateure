import { useEffect, useRef, useState } from 'react';
import type { Lagerbewegung, Material } from '@/types';
import type { WithId } from '@/lib/db/core';
import { lagerEingang, lagerInventur, listLagerbewegungen } from '@/lib/db/materials';
import { listGrosshaendler } from '@/lib/db/einkauf';
import ConfirmDialog from '@/components/ConfirmDialog';
import ZahlFeld from '@/components/ZahlFeld';
import { InputField, SelectField } from '@/components/Field';
import { LotVerlauf, MehrAnzeigen } from '@/components/LotBausteine';
import { zahlAlsText, zahlOder } from '@/lib/zahl';
import { mengeFehler } from '@/lib/einheit';
import { fmtMenge } from '@/lib/belegLayout';
import { datumAusMs } from '@/lib/datum';

/**
 * Wareneingang mit Lieferant, Lieferschein und Bezug (Testbericht 30.09.2026,
 * M29). Vorher war er nur eine Zahl.
 *
 * DER LIEFERANT IST PFLICHT, Lieferschein und Bezug nicht: ohne Lieferant ist
 * ein Eingang nicht zuzuordnen; ein Lieferschein liegt nicht immer schon da.
 *
 * DIE GROSSHÄNDLER ALS AUSWAHL (Runde 3, G19). Vorher standen sie nur als
 * Vorschlagsliste unter einem Textfeld — am Handy sieht man die erst beim
 * Tippen, und im Test wirkte das Feld wie reiner Freitext. Jetzt eine
 * Auswahl der angelegten Großhändler; „Anderer Lieferant …“ öffnet das
 * Textfeld, denn Ware kommt auch vom Baumarkt oder direkt vom Hersteller.
 * Ohne angelegte Großhändler bleibt es beim Textfeld allein.
 */
const ANDERER = '__anderer';

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
  /** Gewählter Großhändler; leer = noch keiner, `ANDERER` = getippt. */
  const [wahl, setWahl] = useState('');
  // Wer schon tippte, bevor die Liste kam, verliert seinen Text nicht.
  const getippt = useRef('');

  useEffect(() => {
    let weg = false;
    // Ein fehlender Vorschlag hält den Eingang nicht auf — getippt geht immer.
    Promise.resolve()
      .then(() => listGrosshaendler(companyId))
      .then((g) => {
        if (weg) return;
        setVorschlaege(g.filter((x) => x.active).map((x) => x.name));
        if (getippt.current.trim()) setWahl(ANDERER);
      })
      .catch(() => undefined);
    return () => { weg = true; };
  }, [companyId]);

  const tippen = vorschlaege.length === 0 || wahl === ANDERER;
  const name = tippen ? lieferant.trim() : wahl;

  async function buchen() {
    const n = zahlOder(menge, NaN);
    const falsch = mengeFehler(n, artikel.unit);
    if (falsch) throw new Error(falsch);
    if (!name) throw new Error('Von welchem Lieferanten kommt die Ware?');
    await lagerEingang({
      materialId: artikel.id,
      menge: n,
      lieferant: name,
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
        {vorschlaege.length > 0 && (
          <SelectField
            id="eingang-grosshaendler"
            label="Lieferant"
            pflicht
            value={wahl}
            onChange={(e) => setWahl(e.target.value)}
          >
            <option value="">Bitte wählen …</option>
            {vorschlaege.map((v) => <option key={v} value={v}>{v}</option>)}
            <option value={ANDERER}>Anderer Lieferant …</option>
          </SelectField>
        )}
        {tippen && (
          <InputField
            id="eingang-lieferant"
            label={vorschlaege.length > 0 ? 'Name des Lieferanten' : 'Lieferant'}
            pflicht
            autoComplete="off"
            value={lieferant}
            onChange={(e) => { getippt.current = e.target.value; setLieferant(e.target.value); }}
          />
        )}
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
  // Keine Rückgabe von der Baustelle, sondern ein zurückgenommener Haken (G15).
  einladen_zurueck: 'Einladen zurückgenommen',
  inventur: 'Inventur',
  zugang: 'Zugang',
  abgang: 'Abgang',
};

/** Wie viele Bewegungen zuerst stehen (Regel 4: Gruppen höchstens 20 Zeilen). */
const BEWEGUNGEN_ZUERST = 20;

/**
 * Das Bewegungsprotokoll eines Artikels (M28) — als Lot im Seitenfenster
 * des Artikels (Linie „Lot“, Regel 7). Bis zum Umbau stand es in einem
 * eigenen Lesedialog hinter dem „⋯“ der Zeile.
 *
 * `stand` lädt neu: nach einem Wareneingang oder einer Inventur aus dem
 * Fenster soll die neue Bewegung gleich oben stehen.
 */
export function Bewegungsverlauf({
  artikel,
  stand = 0,
}: {
  artikel: WithId<Material>;
  stand?: number;
}) {
  const [zeilen, setZeilen] = useState<Lagerbewegung[] | null>(null);
  const [fehler, setFehler] = useState<string | null>(null);
  const [zeigen, setZeigen] = useState(BEWEGUNGEN_ZUERST);

  useEffect(() => {
    let weg = false;
    setFehler(null);
    Promise.resolve()
      .then(() => listLagerbewegungen(artikel.id))
      .then((z) => { if (!weg) setZeilen(z); })
      .catch(() => { if (!weg) setFehler('Das Bewegungsprotokoll konnte nicht geladen werden.'); });
    return () => { weg = true; };
  }, [artikel.id, stand]);

  const einheit = artikel.unit ?? 'Stk';
  if (fehler) return <p className="text-sm text-danger">{fehler}</p>;
  if (zeilen === null) return <p className="text-sm text-ink-muted">Wird geladen …</p>;
  if (zeilen.length === 0) {
    return (
      <p className="text-sm text-ink-muted">
        Noch keine Bewegung protokolliert. Das Protokoll beginnt mit dem 30.09.2026; was davor
        geschah, steht nur im Bestand.
      </p>
    );
  }
  return (
    <>
      <LotVerlauf
        name={`Bewegungen: ${artikel.name}`}
        punkte={zeilen.slice(0, zeigen).map((b) => ({
          titel: `${ART[b.art]} ${b.menge > 0 ? '+' : ''}${fmtMenge(b.menge)} ${einheit}`,
          zeit: `${datumAusMs(b.createdAt)} · danach ${fmtMenge(b.bestandNachher)} ${einheit}`,
          text:
            [
              b.erfasstVonName,
              b.lieferant,
              b.lieferschein ? `Lieferschein ${b.lieferschein}` : '',
              b.bezug,
              b.grund ? `Grund: ${b.grund}` : '',
            ]
              .filter(Boolean)
              .join(' · ') || undefined,
        }))}
      />
      <MehrAnzeigen anzahl={Math.max(0, zeilen.length - zeigen)} onClick={() => setZeigen((n) => n + BEWEGUNGEN_ZUERST)} />
    </>
  );
}
