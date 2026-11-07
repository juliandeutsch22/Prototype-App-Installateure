/**
 * Annahme-Links der Angebote (M02a, A06) — auf Postgres.
 *
 * Alles läuft über Funktionen der Datenbank: geschrieben wird die Tabelle
 * von niemandem direkt (`angebot_links` hat keine Schreibregel), und den
 * Zustand eines Links rechnet sie aus derselben Quelle, die dem Kunden
 * antwortet (`app.angebot_link_zustand`). So kann das Büro nicht „offen“
 * sehen, während der Kunde „nicht mehr gültig“ liest.
 */
import type { Abrechnungsart } from '@/types';
import { derClient } from './kern';
import { zeileAlsObjekt } from './felder';

/**
 * Der Zustand eines Links:
 * - `offen` — der Kunde kann annehmen oder ablehnen,
 * - `angenommen`, `abgelehnt` — der Kunde hat entschieden,
 * - `widerrufen` — von der Führung oder durch einen neuen Link,
 * - `abgelaufen` — nach dem letzten Gültigkeitstag,
 * - `gegenstandslos` — das Angebot ist nicht mehr versendet (intern
 *   angenommen, abgelehnt, ersetzt) oder eine andere Fassung angenommen,
 * - `geaendert` — das Angebot wurde nach dem Erzeugen geändert.
 */
export type AngebotLinkZustand =
  | 'offen' | 'angenommen' | 'abgelehnt' | 'widerrufen' | 'abgelaufen' | 'gegenstandslos' | 'geaendert';

export interface AngebotLink {
  id: string;
  quoteId: string;
  abrechnung: Abrechnungsart;
  /** Der Vorsatz der Baustellennummer; leer heißt „ohne Vorsatz“. */
  praefix: string;
  /** Letzter gültiger Tag (Wien), `JJJJ-MM-TT`. */
  gueltigBis: string;
  /** Prüfsumme des Stands, den der Kunde sieht (SHA-256, hex). */
  schnappschussHash: string;
  erzeugtAm: number;
  erzeugtVonName?: string;
  widerrufenAm?: number;
  widerrufenVonName?: string;
  angenommenAm?: number;
  angenommenName?: string;
  /** PNG als Data-URL. */
  angenommenUnterschrift?: string;
  abgelehntAm?: number;
  abgelehntName?: string;
  abgelehntGrund?: string;
  zuerstGeoeffnetAm?: number;
  zuletztGeoeffnetAm?: number;
  geoeffnetAnzahl: number;
  /** Wann die Führung per Push davon erfuhr (genau einmal je Entscheidung). */
  gemeldetAm?: number;
  /** Wann jemand aus der Führung das angenommene Angebot geöffnet hat — bis dahin steht es auf der Startseite. */
  gesehenAm?: number;
  zustand: AngebotLinkZustand;
}

/** Was beim Erzeugen zurückkommt — der Schlüssel im Klartext, das einzige Mal. */
export interface NeuerAngebotLink {
  id: string;
  schluessel: string;
  gueltigBis: string;
}

/**
 * Die Links eines Angebots, der jüngste zuerst. Ein lesender Aufruf
 * (`stable`) — er steht in `LESENDE_FUNKTIONEN` und endet bei Stillstand.
 */
export async function listAngebotLinks(angebotId: string): Promise<AngebotLink[]> {
  const { data, error } = await derClient().rpc('angebot_links_stand', { p_angebot: angebotId });
  if (error) throw new Error(error.message);
  const zeilen = data as Record<string, unknown>[] | null;
  return (zeilen ?? []).map((z) => {
    const l = zeileAlsObjekt<AngebotLink>('angebot_links', z);
    return { ...l, geoeffnetAnzahl: Number(l.geoeffnetAnzahl ?? 0) };
  });
}

/**
 * Einen Link erzeugen. Ein Entwurf ist danach versendet, ein offener
 * älterer Link widerrufen. Ohne Gültigkeit gilt der Link bis zur Bindefrist
 * des Angebots (höchstens ein Jahr), liegt sie zurück 30 Tage.
 */
export async function angebotLinkErzeugen(
  angebotId: string,
  o: { abrechnung: Abrechnungsart; praefix: string; gueltigBis?: string | null },
): Promise<NeuerAngebotLink> {
  const { data, error } = await derClient().rpc('angebot_link_erzeugen', {
    p_angebot: angebotId,
    p_abrechnung: o.abrechnung,
    p_praefix: o.praefix,
    p_gueltig_bis: o.gueltigBis || null,
  });
  if (error) throw new Error(error.message);
  const d = data as { id: string; schluessel: string; gueltig_bis: string } | null;
  if (!d?.schluessel) throw new Error('Der Link konnte nicht erzeugt werden.');
  return { id: d.id, schluessel: d.schluessel, gueltigBis: d.gueltig_bis };
}

/** Einen offenen Link widerrufen; ein schon widerrufener bleibt es. */
export async function angebotLinkWiderrufen(linkId: string): Promise<void> {
  const { error } = await derClient().rpc('angebot_link_widerrufen', { p_link: linkId });
  if (error) throw new Error(error.message);
}

/** Ein über den Link angenommenes Angebot, das die Führung noch nicht geöffnet hat (höchstens 7 Tage). */
export interface UeberLinkAngenommen {
  link: string;
  angebot: string;
  nummer: string;
  kunde: string;
  baustelle?: string;
  baustelleId?: string;
  /** Millisekunden. */
  angenommenAm: number;
  name?: string;
}

/** Für die Startseite der Führung — ein lesender Aufruf (`stable`, `LESENDE_FUNKTIONEN`). */
export async function listUeberLinkAngenommen(): Promise<UeberLinkAngenommen[]> {
  const { data, error } = await derClient().rpc('angebot_links_neu_angenommen');
  if (error) throw new Error(error.message);
  return ((data as Record<string, unknown>[] | null) ?? []).map((z) => ({
    link: String(z.link),
    angebot: String(z.angebot),
    nummer: String(z.nummer ?? ''),
    kunde: String(z.kunde ?? ''),
    ...(typeof z.baustelle === 'string' && z.baustelle ? { baustelle: z.baustelle } : {}),
    ...(typeof z.baustelle_id === 'string' ? { baustelleId: z.baustelle_id } : {}),
    angenommenAm: Date.parse(String(z.angenommen_am)),
    ...(typeof z.name === 'string' ? { name: z.name } : {}),
  }));
}

/** Die Führung hat das angenommene Angebot geöffnet — der Hinweis auf der Startseite geht. */
export async function angebotLinkGesehen(linkId: string): Promise<void> {
  const { error } = await derClient().rpc('angebot_link_gesehen', { p_link: linkId });
  if (error) throw new Error(error.message);
}
