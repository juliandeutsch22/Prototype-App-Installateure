/**
 * Inventur als Zählliste (Durchsicht 15.11.2026, F14) — auf Postgres.
 *
 * Geschrieben wird nur über die Funktionen der Datenbank
 * (`20261117032000_inventur_zaehlliste.sql`): sie prüfen Rolle, Zustand und
 * Menge und buchen die Abweichungen in einem Zug ins Bewegungsprotokoll.
 */
import { derClient } from './kern';

export type InventurUmfang = 'bestand' | 'lagerartikel';

/** Eine Zählliste in der Übersicht. */
export interface Zaehlliste {
  id: string;
  /** Kennung des Lagerorts (auch das Hauptlager hat eine). */
  ort: string;
  /** Sein Name, wie im Bewegungsprotokoll („Fahrzeug W-1A“). */
  ortName: string;
  bezeichnung: string | null;
  /** Millisekunden; leer: verglichen wird je Zeile mit dem Augenblick der Zählung. */
  stichtag: number | null;
  zustand: 'offen' | 'gebucht';
  angelegtAm: number;
  angelegtVonName: string | null;
  gebuchtAm: number | null;
  gebuchtVonName: string | null;
  artikel: number;
  gezaehlt: number;
  /** Gebuchte Zeilen mit einer Abweichung. */
  abweichend: number;
}

export type InventurErgebnis = 'gebucht' | 'ueberholt' | 'nicht_gezaehlt';

/** Eine Zeile der Liste — beim Buchen um das Protokoll ergänzt. */
export interface ZaehllistenZeile {
  id: string;
  materialId: string;
  name: string;
  artikelnummer: string | null;
  einheit: string;
  warengruppe: string | null;
  gezaehlt: number | null;
  gezaehltAm: number | null;
  gezaehltVonName: string | null;
  ergebnis: InventurErgebnis | null;
  soll: number | null;
  abweichung: number | null;
  bestandVorher: number | null;
  bestandNachher: number | null;
  /** Ein eigener Grund dieser Zeile — sonst gilt der der Liste. */
  grund: string | null;
}

export interface ZaehllisteVoll extends Omit<Zaehlliste, 'artikel' | 'gezaehlt' | 'abweichend'> {
  /** Im Hauptlager liegt nur, was als Lagerartikel geführt wird. */
  imHauptlager: boolean;
  auswahl: { umfang?: InventurUmfang; warengruppe?: string | null; suche?: string | null };
  grund: string | null;
  zeilen: ZaehllistenZeile[];
}

export interface InventurVorschauZeile {
  zeile: string;
  material: string;
  name: string;
  artikelnummer: string | null;
  einheit: string;
  gezaehlt: number | null;
  /** Wann gezählt — der Stichtag oder der Augenblick der Eingabe. */
  zeitpunkt: number | null;
  /** Der Bestand im System zum Zeitpunkt der Zählung. */
  soll: number | null;
  abweichung: number | null;
  jetzt: number;
  danach: number;
  /** Nach der Zählung einzeln inventiert — die spätere Zählung gilt, diese Zeile bucht nicht. */
  ueberholt: boolean;
  /** Was das Buchen verhindert (mehr entnommen als gezählt, kein Lagerartikel mehr). */
  konflikt: string | null;
}

export interface InventurVorschau {
  stichtag: number | null;
  zeilen: InventurVorschauZeile[];
  stand: string;
}

export type InventurBuchung =
  | { art: 'gebucht'; gebucht: number; abweichend: number; ueberholt: number; nichtGezaehlt: number }
  | { art: 'veraltet'; vorschau: InventurVorschau };

const ms = (w: unknown): number | null => (w == null || w === '' ? null : Date.parse(String(w)));
const zahl = (w: unknown): number | null => (w == null || w === '' ? null : Number(w));
const text = (w: unknown): string | null => (w == null || w === '' ? null : String(w));

async function rpc<T>(name: string, parameter: Record<string, unknown> = {}): Promise<T> {
  const { data, error } = await derClient().rpc(name, parameter);
  if (error) throw new Error(error.message);
  return data as T;
}

function alsListe(d: Record<string, unknown>): Zaehlliste {
  return {
    id: String(d.id),
    ort: String(d.ort ?? d.lagerort_id),
    ortName: String(d.ort_name ?? 'Hauptlager'),
    bezeichnung: text(d.bezeichnung),
    stichtag: ms(d.stichtag),
    zustand: d.zustand === 'gebucht' ? 'gebucht' : 'offen',
    angelegtAm: ms(d.angelegt_am) ?? 0,
    angelegtVonName: text(d.angelegt_von_name),
    gebuchtAm: ms(d.gebucht_am),
    gebuchtVonName: text(d.gebucht_von_name),
    artikel: Number(d.artikel ?? 0),
    gezaehlt: Number(d.gezaehlt ?? 0),
    abweichend: Number(d.abweichend ?? 0),
  };
}

function alsVorschau(d: Record<string, unknown>): InventurVorschau {
  return {
    stichtag: ms(d.stichtag),
    stand: String(d.stand ?? ''),
    zeilen: ((d.zeilen ?? []) as Record<string, unknown>[]).map((z) => ({
      zeile: String(z.zeile),
      material: String(z.material),
      name: String(z.name ?? ''),
      artikelnummer: text(z.artikelnummer),
      einheit: String(z.einheit ?? 'Stk'),
      gezaehlt: zahl(z.gezaehlt),
      zeitpunkt: ms(z.zeitpunkt),
      soll: zahl(z.soll),
      abweichung: zahl(z.abweichung),
      jetzt: Number(z.jetzt ?? 0),
      danach: Number(z.danach ?? 0),
      ueberholt: z.ueberholt === true,
      konflikt: text(z.konflikt),
    })),
  };
}

/** Die Zähllisten des Betriebs — offene zuerst, dann die jüngsten gebuchten. */
export async function inventurListen(grenze = 50): Promise<Zaehlliste[]> {
  const d = await rpc<Record<string, unknown>[] | null>('inventur_listen', { p_grenze: grenze });
  return (d ?? []).map(alsListe);
}

/** Eine Zählliste mit allen Zeilen. */
export async function inventurLaden(id: string): Promise<ZaehllisteVoll> {
  const d = await rpc<Record<string, unknown>>('inventur_laden', { p_inventur: id });
  const kopf = alsListe({ ...d, ort: d.lagerort_id });
  return {
    id: kopf.id, ort: kopf.ort, ortName: kopf.ortName, imHauptlager: d.ort_art === 'haupt', bezeichnung: kopf.bezeichnung, stichtag: kopf.stichtag, zustand: kopf.zustand,
    angelegtAm: kopf.angelegtAm, angelegtVonName: kopf.angelegtVonName, gebuchtAm: kopf.gebuchtAm,
    gebuchtVonName: kopf.gebuchtVonName,
    auswahl: (d.auswahl ?? {}) as ZaehllisteVoll['auswahl'],
    grund: text(d.grund),
    zeilen: ((d.zeilen ?? []) as Record<string, unknown>[]).map((z) => ({
      id: String(z.id),
      materialId: String(z.material_id),
      name: String(z.name ?? ''),
      artikelnummer: text(z.artikelnummer),
      einheit: String(z.einheit ?? 'Stk'),
      warengruppe: text(z.warengruppe),
      gezaehlt: zahl(z.gezaehlt),
      gezaehltAm: ms(z.gezaehlt_am),
      gezaehltVonName: text(z.gezaehlt_von_name),
      ergebnis: (text(z.ergebnis) as InventurErgebnis | null),
      soll: zahl(z.soll),
      abweichung: zahl(z.abweichung),
      bestandVorher: zahl(z.bestand_vorher),
      bestandNachher: zahl(z.bestand_nachher),
      grund: text(z.grund),
    })),
  };
}

export interface InventurAuswahl {
  /** Leer: das Hauptlager. */
  ort: string;
  umfang: InventurUmfang;
  warengruppe?: string;
  suche?: string;
  bezeichnung?: string;
  /** ISO-Zeitpunkt; leer: verglichen wird je Zeile mit dem Augenblick der Zählung. */
  stichtag?: string | null;
}

/** Eine Zählliste anlegen — was am Ort schon auf einer offenen Liste steht, zählt als übersprungen. */
export async function inventurAnlegen(a: InventurAuswahl): Promise<{ id: string; artikel: number; uebersprungen: number }> {
  const d = await rpc<Record<string, unknown>>('inventur_anlegen', {
    p: {
      ort: a.ort || null,
      umfang: a.umfang,
      warengruppe: a.warengruppe?.trim() || null,
      suche: a.suche?.trim() || null,
      bezeichnung: a.bezeichnung?.trim() || null,
      stichtag: a.stichtag || null,
    },
  });
  return { id: String(d.id), artikel: Number(d.artikel ?? 0), uebersprungen: Number(d.uebersprungen ?? 0) };
}

/** Einen Artikel ergänzen, der im Regal liegt, aber nicht auf der Liste steht. */
export async function inventurArtikelHinzufuegen(inventur: string, materialId: string): Promise<string> {
  return String(await rpc<string>('inventur_artikel_hinzufuegen', { p_inventur: inventur, p_material: materialId }));
}

/** Die gezählte Menge einer Zeile — `null` nimmt die Zählung zurück. */
export async function inventurZaehlen(
  zeile: string,
  menge: number | null,
): Promise<{ gezaehlt: number | null; gezaehltAm: number | null; gezaehltVonName: string | null }> {
  const d = await rpc<Record<string, unknown>>('inventur_zaehlen', { p_zeile: zeile, p_menge: menge });
  return { gezaehlt: zahl(d.gezaehlt), gezaehltAm: ms(d.gezaehlt_am), gezaehltVonName: text(d.gezaehlt_von_name) };
}

/** Was gebucht würde — ohne zu buchen. */
export async function inventurVorschau(inventur: string): Promise<InventurVorschau> {
  return alsVorschau(await rpc<Record<string, unknown>>('inventur_vorschau', { p_inventur: inventur }));
}

/**
 * Alle Abweichungen in einem Zug buchen — nach dem Schreibbefehls-Vertrag:
 * der Stand der Vorschau geht mit; hat sich eine Zählung seither geändert,
 * bucht die Datenbank nichts und gibt die neue Vorschau zurück.
 */
export async function inventurBuchen(
  inventur: string,
  grund: string,
  gruende: Record<string, string>,
  stand: string,
): Promise<InventurBuchung> {
  const d = await rpc<Record<string, unknown>>('inventur_buchen', {
    p_inventur: inventur, p_grund: grund, p_gruende: gruende, p_stand: stand,
  });
  if (d.art === 'veraltet') return { art: 'veraltet', vorschau: alsVorschau(d.vorschau as Record<string, unknown>) };
  return {
    art: 'gebucht',
    gebucht: Number(d.gebucht ?? 0),
    abweichend: Number(d.abweichend ?? 0),
    ueberholt: Number(d.ueberholt ?? 0),
    nichtGezaehlt: Number(d.nicht_gezaehlt ?? 0),
  };
}

/** Eine offene Liste verwerfen — gebucht ist nichts. */
export async function inventurVerwerfen(inventur: string): Promise<void> {
  await rpc<null>('inventur_verwerfen', { p_inventur: inventur });
}
