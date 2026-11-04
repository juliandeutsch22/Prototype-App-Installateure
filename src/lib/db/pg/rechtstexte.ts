/**
 * Impressum, Datenschutzerklärung und Betreiberangaben (seit 04.11.2026).
 *
 * Lesen der geltenden Fassungen darf jeder, auch ohne Anmeldung
 * (`rechtstexte_aktuell`). Die Tabelle selbst mit Entwürfen und allen
 * Fassungen liest nur das Plattformkonto; geschrieben wird nur über die drei
 * Funktionen — eine veröffentlichte Fassung ändert sich nie wieder.
 */
import { derClient } from './kern';
import type { Betreiber, GeltendeTexte, RechtstextArt, TextInhalt } from '@/features/recht/rechtstext';

/** Eine Zeile der Tabelle, wie die Plattform sie sieht: ein Entwurf oder eine Fassung. */
export interface RechtstextZeile {
  id: number;
  art: RechtstextArt;
  /** Leer bei einem Entwurf. */
  nummer: number | null;
  inhalt: Betreiber | TextInhalt;
  veroeffentlichtAm: string | null;
  geprueft: boolean;
  geprueftVon: string | null;
  hinweisen: boolean;
  neueVerarbeiter: string[];
  geaendertAm: string;
}

export async function rechtstexteAktuell(): Promise<GeltendeTexte> {
  const { data, error } = await derClient().rpc('rechtstexte_aktuell');
  if (error) throw new Error(error.message);
  return (data ?? {}) as GeltendeTexte;
}

/** Entwurf und alle Fassungen einer Art, die jüngste zuerst — nur für die Plattform. */
export async function rechtstextVerlauf(art: RechtstextArt): Promise<RechtstextZeile[]> {
  const { data, error } = await derClient()
    .from('rechtstexte')
    .select('id, art, nummer, inhalt, veroeffentlicht_am, geprueft, geprueft_von, hinweisen, neue_verarbeiter, geaendert_am')
    .eq('art', art)
    .order('nummer', { ascending: false, nullsFirst: true })
    // Eine Fassung je Änderung; tausend sind Jahrzehnte.
    .limit(1000);
  if (error) throw new Error(error.message);
  return (data ?? []).map((z) => ({
    id: Number(z.id),
    art: z.art as RechtstextArt,
    nummer: z.nummer == null ? null : Number(z.nummer),
    inhalt: z.inhalt as Betreiber | TextInhalt,
    veroeffentlichtAm: z.veroeffentlicht_am as string | null,
    geprueft: Boolean(z.geprueft),
    geprueftVon: (z.geprueft_von as string | null) ?? null,
    hinweisen: Boolean(z.hinweisen),
    neueVerarbeiter: (z.neue_verarbeiter as string[] | null) ?? [],
    geaendertAm: String(z.geaendert_am),
  }));
}

export async function rechtstextEntwurfSpeichern(art: RechtstextArt, inhalt: Betreiber | TextInhalt): Promise<void> {
  const { error } = await derClient().rpc('rechtstext_entwurf_speichern', { p_art: art, p_inhalt: inhalt });
  if (error) throw new Error(error.message);
}

export async function rechtstextEntwurfVerwerfen(art: RechtstextArt): Promise<void> {
  const { error } = await derClient().rpc('rechtstext_entwurf_verwerfen', { p_art: art });
  if (error) throw new Error(error.message);
}

/** Den Entwurf als nächste Fassung veröffentlichen; gibt ihre Nummer zurück. */
export async function rechtstextVeroeffentlichen(
  art: RechtstextArt,
  { geprueft, geprueftVon, hinweisen }: { geprueft: boolean; geprueftVon: string; hinweisen: boolean },
): Promise<number> {
  const { data, error } = await derClient().rpc('rechtstext_veroeffentlichen', {
    p_art: art, p_geprueft: geprueft, p_geprueft_von: geprueftVon, p_hinweisen: hinweisen,
  });
  if (error) throw new Error(error.message);
  return Number(data);
}

/** Fassungen der Datenschutzerklärung mit neuen Unterauftragsverarbeitern, die die Leitung noch nicht kennt. */
export interface VerarbeiterAenderung {
  nummer: number;
  veroeffentlichtAm: string;
  neueVerarbeiter: string[];
}

export async function verarbeiterAenderungen(): Promise<VerarbeiterAenderung[]> {
  const { data, error } = await derClient().rpc('verarbeiter_aenderungen');
  if (error) throw new Error(error.message);
  return (data ?? []) as VerarbeiterAenderung[];
}

export async function verarbeiterZurKenntnisNehmen(): Promise<void> {
  const { error } = await derClient().rpc('verarbeiter_zur_kenntnis_nehmen');
  if (error) throw new Error(error.message);
}
