/**
 * Sonderurlaub, Pflegefreistellung, unbezahlter Urlaub — auf Postgres
 * (Plan 10.3).
 *
 * GESCHRIEBEN WIRD NUR ÜBER DIE DATENBANKFUNKTIONEN: sie prüfen die harten
 * Grenzen und legen beim Bestätigen die Tage im Zeitkonto an. Gelesen wird
 * direkt; der Zeilenschutz zeigt der Person die eigenen, dem Büro alle.
 *
 * DER NACHWEIS lebt nur bis zur Entscheidung. Die Datenbank leert den Pfad
 * mit jeder Entscheidung und gibt den alten zurück; die Datei löscht die App
 * hier über die Speicher-API. Bleibt eine liegen (Netz weg), räumt
 * `nachweiseAufraeumen` sie beim nächsten Öffnen der Liste weg.
 */
import type { Freistellung } from '@/types';
import { abfragen, derClient } from './kern';
import { dateiTyp } from './baustellenDokumente';

const TABELLE = 'freistellungen';
const EIMER = 'freistellungsnachweise';
export const NACHWEIS_HOECHSTENS_BYTES = 10 * 1024 * 1024;

export interface FreistellungAntrag {
  art: Freistellung['art'];
  anlass?: string | null;
  ereignisDatum?: string | null;
  von: string;
  bis: string;
  zeitVon?: string | null;
  zeitBis?: string | null;
  kindUnter12?: boolean;
  zusatzwoche?: boolean;
  notiz?: string;
}

export interface FreistellungErgebnis {
  status: Freistellung['status'];
  angelegt: number;
  uebersprungen: number;
  entfernt: number;
  nachweis: string | null;
}

/** Die eigenen Anträge, jüngste zuerst. */
export function listEigeneFreistellungen(companyId: string, uid: string, max = 200) {
  return abfragen<Freistellung>(TABELLE, companyId, {
    wo: [{ art: 'gleich', feld: 'userId', wert: uid }],
    sortiere: { feld: 'von', absteigend: true },
    grenze: max,
  });
}

/** Alle offenen Anträge des Betriebs — fürs Büro. Andere sehen nur ihre eigenen. */
export function listOffeneFreistellungen(companyId: string) {
  return abfragen<Freistellung>(TABELLE, companyId, {
    wo: [{ art: 'gleich', feld: 'status', wert: 'Beantragt' }],
    sortiere: { feld: 'von' },
    grenze: 300,
  });
}

/** Bestätigte Anträge, die ab `abIso` noch laufen — fürs Büro, zum Zurücknehmen. */
export function listBestaetigteFreistellungenAb(companyId: string, abIso: string) {
  return abfragen<Freistellung>(TABELLE, companyId, {
    wo: [
      { art: 'gleich', feld: 'status', wert: 'Bestätigt' },
      { art: 'ab', feld: 'bis', wert: abIso },
    ],
    sortiere: { feld: 'von' },
    grenze: 300,
  });
}

/** Alle Anträge der genannten Personen — für Warnungen und Pflege-Kontingent. */
export function listFreistellungenVon(companyId: string, uids: string[]) {
  const ids = [...new Set(uids.filter(Boolean))];
  if (ids.length === 0) return Promise.resolve([] as Freistellung[]);
  return abfragen<Freistellung>(TABELLE, companyId, {
    wo: [{ art: 'in', feld: 'userId', werte: ids }],
    sortiere: { feld: 'von', absteigend: true },
    grenze: 1000,
  });
}

export async function freistellungBeantragen(a: FreistellungAntrag): Promise<string> {
  const { data, error } = await derClient().rpc('freistellung_beantragen', {
    p_art: a.art,
    p_anlass: a.anlass ?? null,
    p_ereignis: a.ereignisDatum ?? null,
    p_von: a.von,
    p_bis: a.bis,
    p_zeit_von: a.zeitVon ?? null,
    p_zeit_bis: a.zeitBis ?? null,
    p_kind_unter_12: a.kindUnter12 ?? false,
    p_zusatzwoche: a.zusatzwoche ?? false,
    p_notiz: a.notiz ?? null,
  });
  if (error) throw new Error(error.message);
  return data as string;
}

/** Vorher geprüft, nicht erst am Eimer: dessen Meldung ist englisch. */
export function nachweisPruefen(datei: Pick<File, 'name' | 'type' | 'size'>): string | null {
  if (!dateiTyp(datei)) return `„${datei.name}“: nur PDF und Bilder (JPEG, PNG, WebP, HEIC).`;
  if (datei.size > NACHWEIS_HOECHSTENS_BYTES) {
    const mb = (datei.size / 1024 / 1024).toFixed(1).replace('.', ',');
    return `„${datei.name}“ ist ${mb} MB groß — höchstens 10 MB.`;
  }
  if (datei.size === 0) return `„${datei.name}“ ist leer.`;
  return null;
}

/**
 * Den Nachweis hochladen und am Antrag eintragen. Scheitert das Eintragen,
 * geht die Datei wieder weg — ohne Antrag fände sie niemand mehr.
 */
export async function nachweisHochladen(companyId: string, uid: string, antragId: string, datei: File): Promise<string> {
  const fehler = nachweisPruefen(datei);
  if (fehler) throw new Error(fehler);
  const mime = dateiTyp(datei)!;
  const endung = mime === 'application/pdf' ? 'pdf' : mime.split('/')[1] ?? 'bin';
  const pfad = `${companyId}/${uid}/${antragId}/${crypto.randomUUID()}.${endung}`;
  const speicher = derClient().storage.from(EIMER);
  const { error: hoch } = await speicher.upload(pfad, datei, { contentType: mime, upsert: false });
  if (hoch) throw new Error(hoch.message);
  const { error } = await derClient().rpc('freistellung_nachweis_setzen', { p_id: antragId, p_pfad: pfad });
  if (error) {
    await speicher.remove([pfad]).catch(() => undefined);
    throw new Error(error.message);
  }
  return pfad;
}

/** Den eigenen Nachweis wieder herausnehmen, solange der Antrag offen ist. */
export async function nachweisEntfernen(antrag: Pick<Freistellung, 'id' | 'nachweisPfad'>): Promise<void> {
  if (!antrag.nachweisPfad) return;
  const { error: weg } = await derClient().storage.from(EIMER).remove([antrag.nachweisPfad]);
  if (weg) throw new Error(weg.message);
  const { error } = await derClient().rpc('freistellung_nachweis_setzen', { p_id: antrag.id, p_pfad: null });
  if (error) throw new Error(error.message);
}

/** Eine Adresse zum Ansehen, eine Minute gültig. */
export async function nachweisAdresse(pfad: string): Promise<string> {
  const { data, error } = await derClient().storage.from(EIMER).createSignedUrl(pfad, 60);
  if (error || !data?.signedUrl) throw new Error(error?.message ?? 'Der Nachweis lässt sich nicht öffnen.');
  return data.signedUrl;
}

/**
 * Den eigenen Antrag zurückziehen: zuerst die Datei, dann der Pfad, dann
 * der Antrag. Die Datenbank lehnt das Zurückziehen ab, solange ein Pfad
 * eingetragen ist — so bleibt keine Datei ohne Antrag liegen.
 */
export async function freistellungZurueckziehen(antrag: Pick<Freistellung, 'id' | 'nachweisPfad'>): Promise<void> {
  if (antrag.nachweisPfad) {
    const { error: weg } = await derClient().storage.from(EIMER).remove([antrag.nachweisPfad]);
    if (weg) throw new Error(weg.message);
    const { error } = await derClient().rpc('freistellung_nachweis_setzen', { p_id: antrag.id, p_pfad: null });
    if (error) throw new Error(error.message);
  }
  const { error } = await derClient().rpc('freistellung_zurueckziehen', { p_id: antrag.id });
  if (error) throw new Error(error.message);
}

/**
 * Entscheiden. Die Datei des Nachweises wird danach gelöscht — auch beim
 * Ablehnen und Stornieren (Entscheidung 5). Scheitert das Löschen, steht
 * das in `dateiBlieb`; die nächste Liste räumt sie weg.
 */
export async function freistellungEntscheiden(daten: {
  id: string;
  entscheidung: 'Bestätigt' | 'Abgelehnt' | 'Storniert';
  grund?: string;
  nachweisGeprueft?: boolean;
  kuerzung?: Array<{ urlaubsjahr: number; tage: number }>;
}): Promise<FreistellungErgebnis & { dateiBlieb: boolean }> {
  const { data, error } = await derClient().rpc('freistellung_entscheiden', {
    p_id: daten.id,
    p_entscheidung: daten.entscheidung,
    p_grund: daten.grund ?? '',
    p_nachweis_geprueft: daten.nachweisGeprueft ?? false,
    p_kuerzung: daten.kuerzung && daten.kuerzung.length > 0 ? daten.kuerzung : null,
  });
  if (error) throw new Error(error.message);
  const ergebnis = data as FreistellungErgebnis;
  let dateiBlieb = false;
  if (ergebnis.nachweis) {
    const { error: weg } = await derClient().storage.from(EIMER).remove([ergebnis.nachweis]);
    dateiBlieb = !!weg;
  }
  return { ...ergebnis, dateiBlieb };
}

/**
 * LIEGENGEBLIEBENE NACHWEISE WEGRÄUMEN — jede Datei, deren Antrag entschieden
 * oder nicht mehr da ist. Fürs Büro, beim Öffnen der Bestätigungsliste.
 *
 * GEFRAGT WIRD DIE DATENBANK, nicht eine vorher geladene Liste: lädt jemand
 * gerade einen Nachweis zu einem eben gestellten Antrag hoch, stünde der
 * noch in keiner Liste — und seine Datei wäre weg. Still bei einem Fehler:
 * das Aufräumen darf die Liste nicht aufhalten.
 *
 * Gibt zurück, wie viele Dateien entfernt wurden.
 */
export async function nachweiseAufraeumen(companyId: string): Promise<number> {
  const speicher = derClient().storage.from(EIMER);
  let weg = 0;
  try {
    const ordner: string[] = [];
    const { data: personen } = await speicher.list(companyId, { limit: 1000 });
    for (const person of personen ?? []) {
      if (person.id) continue; // eine Datei, kein Ordner — gehört nicht hierher
      const { data: antraege } = await speicher.list(`${companyId}/${person.name}`, { limit: 1000 });
      for (const antrag of antraege ?? []) {
        if (!antrag.id) ordner.push(`${companyId}/${person.name}/${antrag.name}`);
      }
    }
    if (ordner.length === 0) return 0;
    const ids = ordner.map((o) => o.split('/')[2]);
    const zeilen = await abfragen<Freistellung>(TABELLE, companyId, {
      wo: [{ art: 'in', feld: 'id', werte: ids }],
      grenze: 1000,
    });
    const offen = new Set(zeilen.filter((z) => z.status === 'Beantragt').map((z) => z.id));
    for (const o of ordner) {
      if (offen.has(o.split('/')[2])) continue;
      const { data: dateien } = await speicher.list(o, { limit: 100 });
      const pfade = (dateien ?? []).filter((d) => d.id).map((d) => `${o}/${d.name}`);
      if (pfade.length === 0) continue;
      const { error } = await speicher.remove(pfade);
      if (!error) weg += pfade.length;
    }
  } catch {
    // still — siehe oben
  }
  return weg;
}
