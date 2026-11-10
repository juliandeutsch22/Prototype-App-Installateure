import { useEffect, useRef, useState } from 'react';
import type { Lagerbewegung, Lagerort, Material } from '@/types';
import type { WithId } from '@/lib/db/core';
import { lagerEingang, lagerInventur, listLagerbewegungen } from '@/lib/db/materials';
import { umlagern } from '@/lib/db/lagerorte';
import { listGrosshaendler } from '@/lib/db/einkauf';
import ConfirmDialog from '@/components/ConfirmDialog';
import ZahlFeld from '@/components/ZahlFeld';
import { InputField, SelectField } from '@/components/Field';
import { LotVerlauf, MehrAnzeigen } from '@/components/LotBausteine';
import { zahlAlsText, zahlOder } from '@/lib/zahl';
import { mengeFehler } from '@/lib/einheit';
import { fmtMenge } from '@/lib/belegLayout';
import { datumAusMs } from '@/lib/datum';
import { HAUPTLAGER, ortName, ortNameVon } from './lagerorte';

/**
 * DIE WAHL EINES LAGERORTS (M04a) — in jedem Dialog dieselbe: das Hauptlager
 * zuerst (leerer Wert), dann die weiteren aktiven Orte. Ohne weitere Orte
 * (oder wenn „Lagerorte und Fahrzeuglager“ aus ist) steht sie gar nicht da,
 * und gebucht wird ins Hauptlager wie bisher.
 */
export function OrtWahl({
  id,
  label,
  alle,
  wahl,
  wert,
  onChange,
  ohneHauptlager = false,
  zahl,
}: {
  id: string;
  label: string;
  /** Alle Orte des Betriebs — für den Namen des Hauptlagers. */
  alle: readonly Lagerort[];
  /** Die weiteren Orte, die hier in Frage kommen. */
  wahl: readonly Lagerort[];
  /** `''` = Hauptlager. */
  wert: string;
  onChange: (ort: string) => void;
  ohneHauptlager?: boolean;
  /** Was hinter dem Namen steht, etwa der Bestand dort. */
  zahl?: (ort: string) => string | undefined;
}) {
  const hinter = (ort: string) => {
    const z = zahl?.(ort);
    return z ? ` — ${z}` : '';
  };
  return (
    <SelectField id={id} label={label} value={wert} onChange={(e) => onChange(e.target.value)}>
      {!ohneHauptlager && <option value={HAUPTLAGER}>{ortNameVon(alle, HAUPTLAGER)}{hinter(HAUPTLAGER)}</option>}
      {wahl.map((o) => <option key={o.id} value={o.id}>{ortName(o)}{hinter(o.id)}</option>)}
    </SelectField>
  );
}

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
  orte = [],
  zielorte = [],
  ortVorgabe = HAUPTLAGER,
}: {
  companyId: string;
  artikel: WithId<Material>;
  onFertig: (text: string) => void;
  onAbbrechen: () => void;
  /** Alle Orte des Betriebs (M04a) — leer: nur das Hauptlager, wie bisher. */
  orte?: readonly Lagerort[];
  /** Die weiteren Orte, an die die Ware kommen kann. */
  zielorte?: readonly Lagerort[];
  ortVorgabe?: string;
}) {
  const [menge, setMenge] = useState('1');
  const [ort, setOrt] = useState(ortVorgabe);
  const [lieferant, setLieferant] = useState('');
  const [lieferschein, setLieferschein] = useState('');
  const [bezug, setBezug] = useState('');
  /*
    EINE KENNUNG JE GEÖFFNETEM DIALOG (E58): ein zweiter Tipp nach einem
    Netzabbruch schickt denselben Vorgang, und die Datenbank bucht ihn
    höchstens einmal ein. Erst ein neu geöffneter Dialog ist ein neuer Eingang.
  */
  const [vorgang] = useState(() => crypto.randomUUID());
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
      ...(ort ? { ortId: ort } : {}),
      vorgang,
    });
    onFertig(
      ort
        ? `${fmtMenge(n)} ${artikel.unit ?? 'Stk'} ${artikel.name} eingebucht — ${ortNameVon(orte, ort)}`
        : `${fmtMenge(n)} ${artikel.unit ?? 'Stk'} ${artikel.name} eingebucht`,
    );
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
        {zielorte.length > 0 && (
          <OrtWahl id="eingang-ort" label="Wohin" alle={orte} wahl={zielorte} wert={ort} onChange={setOrt} />
        )}
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
  orte = [],
  zaehlorte = [],
  bestaende,
  ortVorgabe = HAUPTLAGER,
}: {
  artikel: WithId<Material>;
  onFertig: (text: string) => void;
  onAbbrechen: () => void;
  /** Alle Orte des Betriebs (M04a) — leer: gezählt wird im Hauptlager, wie bisher. */
  orte?: readonly Lagerort[];
  /** Die weiteren Orte, an denen gezählt werden kann — auch einer ohne Bestand (Eröffnungsbestand). */
  zaehlorte?: readonly Lagerort[];
  /** Was an den weiteren Orten im System steht (Kennung des Ortes → Menge). */
  bestaende?: ReadonlyMap<string, number>;
  ortVorgabe?: string;
}) {
  const [ort, setOrt] = useState(ortVorgabe);
  const imSystem = (o: string) => (o ? bestaende?.get(o) ?? 0 : artikel.stock ?? 0);
  const [bestand, setBestand] = useState(zahlAlsText(imSystem(ortVorgabe)));
  const [grund, setGrund] = useState('');

  async function buchen() {
    const n = zahlOder(bestand, NaN);
    if (!Number.isFinite(n) || n < 0) throw new Error('Der gezählte Bestand ist null oder mehr.');
    if (n > 0) {
      const falsch = mengeFehler(n, artikel.unit);
      if (falsch) throw new Error(falsch);
    }
    if (!grund.trim()) throw new Error('Ohne Grund keine Korrektur — etwa „Inventur 31.12.“ oder „Bruch“.');
    // Im Hauptlager derselbe Aufruf wie vor den Lagerorten.
    if (ort) await lagerInventur(artikel.id, n, grund.trim(), ort);
    else await lagerInventur(artikel.id, n, grund.trim());
    const wo = ort ? ` — ${ortNameVon(orte, ort)}` : '';
    onFertig(
      n === imSystem(ort)
        ? `Bestand ${artikel.name} bestätigt${wo}`
        : `Bestand ${artikel.name} auf ${fmtMenge(n)} ${artikel.unit ?? 'Stk'} gesetzt${wo}`,
    );
  }

  return (
    <ConfirmDialog
      open
      title={`Inventur: ${artikel.name}`}
      message={`Im System stehen ${fmtMenge(imSystem(ort))} ${artikel.unit ?? 'Stk'}${zaehlorte.length > 0 ? ` (${ortNameVon(orte, ort)})` : ''}. Eingetragen wird, was gezählt wurde — mit Grund im Bewegungsprotokoll.`}
      confirmLabel="Bestand buchen"
      confirmTone="primary"
      onConfirm={buchen}
      onCancel={onAbbrechen}
    >
      <div className="space-y-3">
        {zaehlorte.length > 0 && (
          <OrtWahl
            id="inventur-ort"
            label="Wo gezählt"
            alle={orte}
            wahl={zaehlorte}
            wert={ort}
            onChange={(o) => {
              setOrt(o);
              setBestand(zahlAlsText(imSystem(o)));
            }}
          />
        )}
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
  umlagerung: 'Umlagerung',
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
  orte = [],
}: {
  artikel: WithId<Material>;
  stand?: number;
  /**
   * Die Orte des Betriebs (M04a). Mit ihnen sagt jede Zeile, an welchem Ort
   * sie den Bestand änderte, und eine Umlagerung, woher bzw. wohin. Ohne sie
   * (Fähigkeit aus) steht der Verlauf wie bisher da.
   */
  orte?: readonly Lagerort[];
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
          zeit: `${datumAusMs(b.createdAt)} · danach ${fmtMenge(b.bestandNachher)} ${einheit}${
            orte.length > 0 ? ` · ${ortNameVon(orte, b.lagerortId)}` : ''}`,
          text:
            [
              b.art === 'umlagerung' && orte.length > 0
                ? `${b.menge < 0 ? 'nach' : 'von'} ${ortNameVon(orte, b.gegenortId)}`
                : '',
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

/**
 * UMLAGERN (M04a, E10): eine Menge eines Artikels von einem Ort an einen
 * anderen — Hauptlager → Fahrzeug, Fahrzeug → Hauptlager, Fahrzeug →
 * Fahrzeug und ebenso mit weiteren Lagern.
 *
 * NACH DEM SCHREIBBEFEHLS-VERTRAG: der Dialog schickt den Bestand am
 * Quellort mit, den er zeigt. Hat sich dort inzwischen etwas bewegt, bucht
 * der Server nichts und sagt es; die Ansicht holt neu, und es wird mit den
 * neuen Zahlen noch einmal gefragt. Mehr umlagern, als am Quellort liegt,
 * geht nicht — auch nicht „trotzdem“: was nicht da ist, lässt sich nicht
 * bewegen; stimmt die Zahl nicht, ist die Antwort eine Zählung am Ort.
 *
 * ZUGESAGTES IM HAUPTLAGER (Prüfbericht 10.11.2026): was Anforderungen
 * oder Rüstlisten zugesagt ist, liegt zwar im Regal, gehört aber schon
 * jemandem. Will die Umlagerung mehr als frei ist, bucht der Server nichts
 * und nennt die Zahlen; der Dialog fragt damit nach, und erst die
 * ausdrückliche Bestätigung bucht — vermerkt im Bewegungsprotokoll. Vorher
 * ging das still durch, und der Monteur sah „abholbereit“ für Ware, die im
 * Fahrzeug lag.
 *
 * `nurRueckgabe`: der Fahrer gibt aus seinem Fahrzeug ins Hauptlager zurück
 * (wenn der Betrieb es erlaubt) — Quelle und Ziel stehen fest.
 */
export function UmlagernDialog({
  artikel,
  orte,
  wahl,
  bestaende,
  vonVorgabe = HAUPTLAGER,
  nachVorgabe,
  nurRueckgabe = false,
  onFertig,
  onVeraltet,
  onAbbrechen,
}: {
  artikel: WithId<Material>;
  /** Alle Orte des Betriebs. */
  orte: readonly Lagerort[];
  /** Die weiteren aktiven Orte zur Wahl. */
  wahl: readonly Lagerort[];
  /** Was an den weiteren Orten liegt (Kennung → Menge); das Hauptlager ist `artikel.stock`. */
  bestaende: ReadonlyMap<string, number>;
  vonVorgabe?: string;
  nachVorgabe?: string;
  nurRueckgabe?: boolean;
  onFertig: (text: string) => void;
  /** Der Server sah einen anderen Bestand — die Ansicht soll neu holen. */
  onVeraltet?: () => void;
  onAbbrechen: () => void;
}) {
  const [von, setVon] = useState(vonVorgabe);
  const [nach, setNach] = useState(
    nachVorgabe ?? (vonVorgabe === HAUPTLAGER ? wahl[0]?.id ?? HAUPTLAGER : HAUPTLAGER),
  );
  const [menge, setMenge] = useState('1');
  const [notiz, setNotiz] = useState('');
  /** Die Rückfrage, wenn im Hauptlager zu wenig frei ist — die Zahlen des Servers. */
  const [reserviert, setReserviert] = useState<
    { bestand: number; zugesagt: number; frei: number; menge: number; einheit: string } | null
  >(null);
  // Wer danach Menge oder Orte ändert, bestätigt nicht mehr, was gefragt war.
  useEffect(() => {
    setReserviert(null);
  }, [menge, von, nach]);
  const einheit = artikel.unit ?? 'Stk';
  const imSystem = (o: string) => (o ? bestaende.get(o) ?? 0 : artikel.stock ?? 0);
  const zahl = (o: string) => `${fmtMenge(imSystem(o))} ${einheit}`;

  async function buchen() {
    const n = zahlOder(menge, NaN);
    const falsch = mengeFehler(n, artikel.unit);
    if (falsch) throw new Error(falsch);
    if (von === nach) throw new Error('Quelle und Ziel sind derselbe Ort.');
    const da = imSystem(von);
    if (n > da) {
      throw new Error(`${ortNameVon(orte, von)}: dort liegen nur ${fmtMenge(da)} ${einheit}.`);
    }
    const r = await umlagern({
      artikelId: artikel.id,
      vonId: von || null,
      nachId: nach || null,
      menge: n,
      einheit,
      erwartetVon: da,
      grund: notiz,
      ...(reserviert ? { trotzReserviert: true } : {}),
    });
    if (r.art === 'reserviert') {
      // Nichts gebucht: erst fragen, mit genau diesen Zahlen.
      setReserviert({ bestand: r.bestandVon, zugesagt: r.zugesagt, frei: r.frei, menge: r.menge, einheit: r.einheit });
      return;
    }
    if (r.art === 'veraltet') {
      onVeraltet?.();
      throw new Error(
        `Inzwischen hat sich dort etwas bewegt — ${ortNameVon(orte, von)} hat jetzt ${fmtMenge(r.bestandVon)} ${r.einheit}. Nichts wurde umgelagert; bitte mit der neuen Zahl noch einmal.`,
      );
    }
    if (r.art === 'fehlbestand') {
      onVeraltet?.();
      throw new Error(
        `${ortNameVon(orte, von)}: dort liegen nur ${fmtMenge(r.bestandVon)} ${r.einheit}. Nichts wurde umgelagert.`,
      );
    }
    onFertig(`${fmtMenge(n)} ${einheit} ${artikel.name} umgelagert: ${ortNameVon(orte, von)} → ${ortNameVon(orte, nach)}`);
  }

  return (
    <ConfirmDialog
      open
      title={nurRueckgabe ? `Zurücklagern: ${artikel.name}` : `Umlagern: ${artikel.name}`}
      message={
        reserviert
          ? `Im ${ortNameVon(orte, HAUPTLAGER)} ist nicht genug frei — ein Teil ist Anforderungen oder Rüstlisten zugesagt. Umgelagert fehlt diese Ware dort, wo sie zugesagt ist. Die Übersteuerung steht im Bewegungsprotokoll.`
          : nurRueckgabe
            ? `Aus ${ortNameVon(orte, von)} (${zahl(von)}) zurück ins ${ortNameVon(orte, HAUPTLAGER)}. Beide Bestände ändern sich in einem Zug und stehen im Bewegungsprotokoll.`
            : 'Quelle und Ziel ändern sich in einem Zug — mit je einer Bewegung im Protokoll. Mehr als am Quellort liegt, lässt sich nicht umlagern; Zugesagtes nur nach Rückfrage.'
      }
      confirmLabel={reserviert ? 'Trotzdem umlagern' : nurRueckgabe ? 'Zurücklagern' : 'Umlagern'}
      confirmTone={reserviert ? 'danger' : 'primary'}
      onConfirm={buchen}
      onCancel={onAbbrechen}
    >
      <div className="space-y-3">
        {reserviert && (
          <dl className="angaben">
            {(
              [
                ['Im Regal', reserviert.bestand],
                ['Schon zugesagt', reserviert.zugesagt],
                ['Frei', Math.max(reserviert.frei, 0)],
                ['Umlagern', reserviert.menge],
              ] as const
            ).map(([wort, wert]) => (
              <div className="angabe" key={wort}>
                <dt>{wort}</dt>
                <dd className="nr">{fmtMenge(wert)} {reserviert.einheit}</dd>
              </div>
            ))}
          </dl>
        )}
        {!nurRueckgabe && (
          <>
            <OrtWahl id="umlagern-von" label="Von" alle={orte} wahl={wahl} wert={von} onChange={setVon} zahl={zahl} />
            <OrtWahl id="umlagern-nach" label="Nach" alle={orte} wahl={wahl} wert={nach} onChange={setNach} zahl={zahl} />
          </>
        )}
        <ZahlFeld id="umlagern-menge" label={`Menge (${einheit})`} pflicht value={menge} onChange={setMenge} />
        <InputField
          id="umlagern-notiz"
          label="Notiz (optional)"
          placeholder="z. B. für Baustelle Hauptstraße"
          value={notiz}
          onChange={(e) => setNotiz(e.target.value)}
        />
      </div>
    </ConfirmDialog>
  );
}
