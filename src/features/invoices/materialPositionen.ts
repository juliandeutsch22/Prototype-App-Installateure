import type { Material, WorkSheet } from '@/types';
import { cent, positionNetto, type InvoicePosition } from './totals';

/**
 * Material aus den Handwerksscheinen einer Baustelle als Rechnungspositionen.
 *
 * WOHER DAS MATERIAL KOMMT, und warum nicht aus den Anforderungen.
 *
 * Es gäbe zwei Quellen. Die MaterialANFORDERUNGEN sind interne Zurufe des
 * Monteurs an die Projektleitung („bring mir das auf die Baustelle") — sie
 * tragen bewusst keine Preise, und was angefordert wurde, ist nicht, was
 * verbaut wurde. Genau daran ist die frühere Vorausfüllung am Schein
 * gescheitert.
 *
 * Der HANDWERKSSCHEIN dagegen listet, was tatsächlich verbaut wurde — und der
 * Kunde hat es unterschrieben. Was auf der Rechnung steht, hat er damit
 * bereits in der Hand. Das ist die belastbarste Grundlage, die es im System
 * gibt.
 *
 * NUR UNTERSCHRIEBENE SCHEINE. Ein Entwurf ist noch änderbar, ein stornierter
 * Schein ist widerrufen, ein verworfener aufgegeben. Nur der unterschriebene
 * bindet den Kunden.
 *
 * DER PREIS KOMMT AUS DEM KATALOG — über den Artikel, aus dem die Zeile
 * gewählt wurde, sonst über den Namen. Seit 24.10.2026 trägt eine am Schein
 * aus dem Lager gewählte Zeile die Kennung ihres Katalogartikels; über sie
 * findet die Rechnung den Preis auch dann, wenn der Artikel inzwischen
 * anders heisst (etwa nach einem DATANORM-Import). Zeilen von davor und
 * freie Zeilen haben keine Kennung und werden wie bisher am Namen gesucht.
 * Wer eine freie Zeile getippt hat, findet meist keinen Preis. Dann steht die
 * Position mit 0,00 € da und will ausgefüllt werden.
 *
 * Das ist Absicht und keine Notlösung: eine erfundene Zahl auf einer Rechnung
 * wäre schlimmer als eine sichtbare Lücke.
 */

/** Vergleichsschlüssel für Materialnamen — Groß-/Kleinschreibung und Leerraum egal. */
export function normName(n?: string): string {
  return (n ?? '').trim().toLowerCase().replace(/\s+/g, ' ');
}

/**
 * Ordnet Materialzeilen ihrem Artikel zu: über die Katalogkennung, wo es sie
 * gibt, sonst über den Namen. Zeilen desselben Artikels landen beim selben
 * Schlüssel, auch wenn eine davon keine Kennung trägt (ein Schein von vor dem
 * 24.10.2026) oder der Artikel inzwischen anders heisst. Der Schlüssel ist der
 * angeglichene Name der ersten Zeile.
 */
export function artikelZuordnung(): (name: string, materialId?: string | null) => string {
  const nachId = new Map<string, string>();
  const nachName = new Map<string, string>();
  return (name, materialId) => {
    const n = normName(name);
    const schluessel = (materialId ? nachId.get(materialId) : undefined) ?? nachName.get(n) ?? n;
    if (materialId && !nachId.has(materialId)) nachId.set(materialId, schluessel);
    if (!nachName.has(n)) nachName.set(n, schluessel);
    return schluessel;
  };
}

export interface MaterialHerkunft {
  /** Die Scheine, deren Material eingeflossen ist. */
  scheine: string[];
  /** Positionen ohne Preis im Katalog — die Ansicht weist darauf hin. */
  ohnePreis: string[];
}

export interface MaterialErgebnis {
  positionen: InvoicePosition[];
  herkunft: MaterialHerkunft;
}

/**
 * Fasst gleiche Artikel zusammen.
 *
 * Drei Scheine über dieselbe Baustelle mit je zwei Eckventilen ergeben EINE
 * Zeile über sechs Stück, nicht drei Zeilen über zwei. Der Kunde liest eine
 * Rechnung, keine Chronik der Anfahrten — und wer die Aufteilung braucht,
 * findet sie auf den Scheinen, die er unterschrieben hat.
 *
 * Zusammengefasst wird über Name UND Einheit: „5 m Rohr" und „5 Stk Rohr"
 * sind nicht dasselbe, auch wenn der Artikel gleich heisst.
 */
export function materialPositionen(
  scheine: Array<WorkSheet & { id: string }>,
  katalog: Material[],
  bereitsVerrechnet: ReadonlySet<string> = new Set(),
): MaterialErgebnis {
  /*
    PREIS UND EINHEIT WERDEN GETRENNT NACHGESCHLAGEN, und das ist kein Detail.

    Die Einheit ist eine TATSACHE über den Artikel — „Dichtung" wird in Paketen
    geführt, ob jemand den Preis gepflegt hat oder nicht. Der Preis ist eine
    ENTSCHEIDUNG, und eine fehlende Entscheidung ist kein Preis von null.

    Beides in einer Tabelle zu führen hiesse: wer den Preis noch nicht gepflegt
    hat, bekommt auf der Rechnung auch die falsche Einheit — ein „Stk", das
    niemand so gemeint hat.
  */
  const einheiten = new Map<string, string>();
  const preise = new Map<string, number>();
  // Über die Kennung gilt genau dieser Artikel — auch ohne gepflegten Preis
  // kein Ausweichen auf einen gleichnamigen anderen.
  const nachId = new Map(katalog.map((m) => [m.id, m]));
  for (const m of katalog) {
    const schluessel = normName(m.name);
    if (m.unit) einheiten.set(schluessel, m.unit);
    // Ein Katalogeintrag OHNE gepflegten Preis ist fuer die Rechnung dasselbe
    // wie kein Eintrag. Ein stillschweigendes 0,00 € waere schlimmer als eine
    // Luecke, die auffaellt — und `0` ist genau das, was das leere Feld im
    // Katalogformular speichert.
    if (typeof m.verkaufspreis === 'number' && m.verkaufspreis > 0) {
      preise.set(schluessel, m.verkaufspreis);
    }
  }

  const gesammelt = new Map<
    string,
    { name: string; einheit: string; menge: number; preis: number }
  >();
  const verbrauchteScheine: string[] = [];
  const zuordnen = artikelZuordnung();

  for (const schein of scheine) {
    if (schein.status !== 'Unterschrieben') continue;
    if (bereitsVerrechnet.has(schein.id)) continue;
    if (!schein.material?.length) continue;

    verbrauchteScheine.push(schein.id);
    for (const zeile of schein.material) {
      if (!zeile.name?.trim() || !(zeile.menge > 0)) continue;
      const artikel = zuordnen(zeile.name, zeile.materialId);
      const ausKatalog = zeile.materialId ? nachId.get(zeile.materialId) : undefined;
      const einheit = zeile.einheit
        || (ausKatalog ? ausKatalog.unit : einheiten.get(normName(zeile.name)))
        || 'Stk';
      const preis = ausKatalog
        ? (typeof ausKatalog.verkaufspreis === 'number' && ausKatalog.verkaufspreis > 0 ? ausKatalog.verkaufspreis : 0)
        : (preise.get(normName(zeile.name)) ?? 0);
      const schluessel = `${artikel}|${normName(einheit)}`;
      const vorhanden = gesammelt.get(schluessel);
      if (vorhanden) {
        vorhanden.menge = cent(vorhanden.menge + zeile.menge);
      } else {
        gesammelt.set(schluessel, {
          name: zeile.name.trim(),
          einheit,
          menge: zeile.menge,
          preis,
        });
      }
    }
  }

  const positionen: InvoicePosition[] = [];
  const ohnePreis: string[] = [];
  // Alphabetisch: eine feste Ordnung, damit dieselbe Baustelle nicht bei
  // jedem Aufbau eine andere Reihenfolge ergibt.
  for (const m of [...gesammelt.values()].sort((a, b) => a.name.localeCompare(b.name, 'de'))) {
    if (m.preis === 0) ohnePreis.push(m.name);
    positionen.push({
      label: m.name,
      qty: m.menge,
      unit: m.einheit,
      unitPrice: m.preis,
      netto: positionNetto(m.menge, m.preis),
    });
  }

  return { positionen, herkunft: { scheine: verbrauchteScheine, ohnePreis } };
}

/**
 * Welche Scheine schon auf einer Rechnung stehen.
 *
 * Ein STORNIERTER Beleg zählt nicht: sein Material ist wieder offen. Das ist
 * der Grund, warum diese Zuordnung an der Rechnung hängt und nicht am Schein
 * — der Storno gibt sie von selbst frei, ohne dass jemand ein Feld
 * zurücksetzen müsste.
 */
export function verrechneteScheine(
  rechnungen: Array<{ linkedWorkSheets?: string[]; paymentStatus?: string }>,
): Set<string> {
  const raus = new Set<string>();
  for (const r of rechnungen) {
    if (r.paymentStatus === 'Storniert') continue;
    for (const id of r.linkedWorkSheets ?? []) raus.add(id);
  }
  return raus;
}

/**
 * Der Leistungszeitraum aus den Belegen, die in die Rechnung eingehen.
 *
 * Beides zählt: die verrechneten ZEITEN und die Tage der Scheine, deren
 * Material mitgeht. Ein Schein kann einen Tag betreffen, an dem keine Stunden
 * gebucht wurden — etwa wenn nur Material geliefert und verbaut wurde.
 *
 * Gibt `null`, wenn es gar keinen datierten Beleg gibt. Dann bleibt das Feld
 * leer und will ausgefüllt werden; ein erfundener Zeitraum auf einer Rechnung
 * wäre eine falsche Angabe gegenüber dem Finanzamt.
 */
export function leistungszeitraum(
  daten: Array<string | undefined>,
): { von: string; bis: string } | null {
  const gueltige = daten.filter((d): d is string => !!d && /^\d{4}-\d{2}-\d{2}$/.test(d)).sort();
  if (gueltige.length === 0) return null;
  return { von: gueltige[0], bis: gueltige[gueltige.length - 1] };
}
