/**
 * Lagerorte, Fahrzeuge, Bestand je Ort und die Umlagerung — auf Postgres
 * (SHK-Ausbau M04a, E10).
 *
 * Geschrieben wird nur über Datenbankfunktionen: Orte, Fahrzeuge und
 * Ortsbestände haben keine Schreibregel, damit jede Änderung durch dieselben
 * Prüfungen geht (Rechte, Betrieb, „kein Ort wird negativ“, Protokoll).
 */
import type { Fahrzeug, Lagerbestand, Lagerort } from '@/types';
import { abfragen, derClient, kanalHalten, type WithId } from './kern';

export function listLagerorte(companyId: string): Promise<WithId<Lagerort>[]> {
  return abfragen<Lagerort>('lagerorte', companyId, { sortiere: { feld: 'bezeichnung' } });
}

export function listFahrzeuge(companyId: string): Promise<WithId<Fahrzeug>[]> {
  return abfragen<Fahrzeug>('fahrzeuge', companyId, { sortiere: { feld: 'kennzeichen' } });
}

/** Ein Fahrzeug anlegen (ohne `id`) oder ändern — samt seinem Fahrzeuglager. */
export async function fahrzeugSpeichern(f: {
  id?: string;
  kennzeichen: string;
  bezeichnung?: string | null;
  standardfahrerUid?: string | null;
  aktiv: boolean;
}): Promise<string> {
  const { data, error } = await derClient().rpc('fahrzeug_speichern', {
    p_fahrzeug: {
      id: f.id ?? null,
      kennzeichen: f.kennzeichen,
      bezeichnung: f.bezeichnung ?? null,
      standardfahrer_uid: f.standardfahrerUid ?? null,
      aktiv: f.aktiv,
    },
  });
  if (error) throw new Error(error.message);
  return String(data);
}

/** Ein weiteres Lager anlegen oder ändern; beim Hauptlager nur die Bezeichnung. */
export async function lagerortSpeichern(o: {
  id?: string;
  art?: 'haupt' | 'lager';
  bezeichnung: string;
  anschrift?: string | null;
  aktiv: boolean;
}): Promise<string> {
  const { data, error } = await derClient().rpc('lagerort_speichern', {
    p_ort: {
      id: o.id ?? null,
      art: o.art ?? 'lager',
      bezeichnung: o.bezeichnung,
      anschrift: o.anschrift ?? null,
      aktiv: o.aktiv,
    },
  });
  if (error) throw new Error(error.message);
  return String(data);
}

export interface KennzeichenVorschlag {
  kennzeichen: string;
  buchungen: number;
  /** 'YYYY-MM-DD' der letzten Buchung mit diesem Kennzeichen. */
  zuletzt: string;
}

/** Kennzeichen aus Zeitbuchungen, die noch kein Fahrzeug sind — nur als Vorschlag. */
export async function kennzeichenAusBuchungen(): Promise<KennzeichenVorschlag[]> {
  const { data, error } = await derClient().rpc('kennzeichen_aus_buchungen');
  if (error) throw new Error(error.message);
  return ((data ?? []) as Array<Record<string, unknown>>).map((z) => ({
    kennzeichen: String(z.kennzeichen),
    buchungen: Number(z.buchungen),
    zuletzt: String(z.zuletzt),
  }));
}

const BESTAND = 'lagerbestaende';

/** Was an einem weiteren Ort liegt — nur Zeilen mit Bestand. */
export async function bestandAmOrt(companyId: string, lagerortId: string): Promise<Lagerbestand[]> {
  /*
    SEITENWEISE über `abfragen`: ein Außenlager kann mehr Artikel tragen, als
    der Server auf einmal ausgibt (`max_rows`), und eine abgeschnittene Liste
    sähe aus wie ein vollständiger Bestand. Die Menge ist nie negativ —
    „ungleich 0“ heißt „mit Bestand“.
  */
  return abfragen<Lagerbestand>(BESTAND, companyId, {
    wo: [
      { art: 'gleich', feld: 'lagerort_id', wert: lagerortId },
      { art: 'ungleich', feld: 'menge', wert: 0 },
    ],
  });
}

/** Wo ein Artikel außerhalb des Hauptlagers liegt — nur Orte mit Bestand. */
export async function bestandDesArtikels(companyId: string, materialId: string): Promise<Lagerbestand[]> {
  // Höchstens so viele Zeilen wie Orte; über `abfragen` aus demselben Grund wie oben.
  return abfragen<Lagerbestand>(BESTAND, companyId, {
    wo: [
      { art: 'gleich', feld: 'material_id', wert: materialId },
      { art: 'ungleich', feld: 'menge', wert: 0 },
    ],
  });
}

/**
 * Meldet, dass sich ein Ortsbestand geändert hat — gebündelt wie beim
 * Katalog (`katalogBeobachten`): eine Rüstliste mit zwanzig Haken schickt
 * zwanzig Meldungen, geholt wird einmal.
 */
export function bestandBeobachten(companyId: string, beiAenderung: () => void): () => void {
  let geplant: ReturnType<typeof setTimeout> | undefined;
  const bald = () => {
    if (geplant) return;
    geplant = setTimeout(() => {
      geplant = undefined;
      beiAenderung();
    }, 500);
  };
  const stopp = kanalHalten({
    tabelle: BESTAND,
    filter: `company_id=eq.${companyId}`,
    beiAenderung: bald,
    beiBereit: bald,
    client: derClient(),
  });
  return () => {
    if (geplant) clearTimeout(geplant);
    stopp();
  };
}

/** Eine Umlagerung, wie die Ansicht sie meint. Leer = Hauptlager. */
export interface UmlagerAuftrag {
  artikelId: string;
  vonId: string | null;
  nachId: string | null;
  menge: number;
  /** Die Einheit, in der die Ansicht die Menge zeigt — der Server vergleicht sie mit dem Artikel. */
  einheit: string;
  /** Der Bestand am Quellort, den die Ansicht gesehen hat. */
  erwartetVon: number;
  grund?: string;
}

export type UmlagerErgebnis =
  | { art: 'ausgefuehrt'; vorgang: string; bestandVon: number; bestandNach: number }
  /** Nichts geschrieben: der Quellort stand nicht mehr so da (oder die Einheit ist eine andere). */
  | { art: 'veraltet'; vorgang: string; bestandVon: number; einheit: string }
  /** Nichts geschrieben: am Quellort liegt weniger als verlangt. */
  | { art: 'fehlbestand'; vorgang: string; bestandVon: number; menge: number; einheit: string };

function ergebnisAus(d: Record<string, unknown>): UmlagerErgebnis {
  const vorgang = String(d.vorgang ?? '');
  if (d.ergebnis === 'ausgefuehrt') {
    return { art: 'ausgefuehrt', vorgang, bestandVon: Number(d.bestand_von), bestandNach: Number(d.bestand_nach) };
  }
  if (d.ergebnis === 'fehlbestand') {
    return {
      art: 'fehlbestand', vorgang, bestandVon: Number(d.bestand_von), menge: Number(d.menge), einheit: String(d.einheit ?? 'Stk'),
    };
  }
  return { art: 'veraltet', vorgang, bestandVon: Number(d.bestand_von), einheit: String(d.einheit ?? 'Stk') };
}

/**
 * Ob eine Antwort offenlässt, was geschah: das Netz riss ab (Status 0) oder
 * ein Tor davor antwortete statt der Datenbank. Eine Ablehnung der Datenbank
 * trägt immer einen Code — die ist eindeutig.
 */
function ausgangUnklar(status: number, code: string | undefined): boolean {
  return status === 0 || (status >= 502 && !code);
}

/** Was aus einem Vorgang wurde — `null`, wenn nichts geschrieben ist. */
export async function befehlStand(vorgang: string): Promise<Record<string, unknown> | null> {
  const { data, error } = await derClient().rpc('befehl_stand', { p_vorgang: vorgang });
  if (error) throw new Error(error.message);
  const d = (data ?? {}) as Record<string, unknown>;
  return d.stand === 'erledigt' ? (d.ergebnis as Record<string, unknown>) : null;
}

/**
 * UMLAGERN NACH DEM SCHREIBBEFEHLS-VERTRAG (Bauplanung 4.3).
 *
 * Die Vorgangskennung entsteht hier, EINMAL je Absicht, und bleibt bei jeder
 * Wiederholung dieselbe. Bleibt der Ausgang unklar (Netz weg, Antwort
 * verloren), fragt die Ansicht nach dem Stand, statt blind noch einmal zu
 * senden: war der Befehl durch, kommt sein Ergebnis; war er es nicht, wird
 * er mit derselben Kennung einmal neu gesendet — der Server führt ihn
 * höchstens einmal aus. Erst wenn auch das offenbleibt, sagt die Ansicht es.
 */
export async function umlagern(a: UmlagerAuftrag, vorgang: string = crypto.randomUUID()): Promise<UmlagerErgebnis> {
  const befehl = {
    vorgang,
    aktion: 'umlagerung',
    ziel: { artikel: a.artikelId, von: a.vonId, nach: a.nachId },
    erwartet: { bestand_von: a.erwartetVon },
    menge: a.menge,
    einheit: a.einheit,
    grund: a.grund?.trim() || null,
  };
  const senden = async () => {
    const { data, error, status } = await derClient().rpc('umlagern', { p_befehl: befehl });
    return { data: data as Record<string, unknown> | null, error, status };
  };
  for (let versuch = 0; versuch < 2; versuch += 1) {
    const r = await senden();
    if (!r.error) return ergebnisAus(r.data ?? {});
    if (!ausgangUnklar(r.status, r.error.code)) throw new Error(r.error.message);
    const stand = await befehlStand(vorgang).catch(() => null);
    if (stand) return ergebnisAus(stand);
  }
  throw new Error('Ob umgelagert wurde, ist offen — die Verbindung riss ab. Bitte die Bestände neu laden und nachsehen, bevor erneut umgelagert wird.');
}
