/**
 * Pläne und Dokumente an der Baustelle — Zeile in `project_documents`, Datei
 * im Eimer `baustellendokumente`.
 *
 * WER WAS SIEHT, entscheidet die Datenbank, nicht diese Datei: das Büro alle,
 * der Monteur die Pläne der Baustellen, auf die er gehört (Team, Leitung oder
 * ein Einsatz dort). Eine Abfrage hier liefert also für jeden genau das, was
 * er sehen darf — und sonst nichts.
 */
import type { BaustellenDokument } from '@/types';
import { abfragen, anlegen, derClient, loeschen, type WithId } from './kern';

const TABELLE = 'project_documents';
const EIMER = 'baustellendokumente';

/**
 * Wie lange eine Dateiadresse gilt. Eine Stunde reicht, um einen Plan zu
 * öffnen; eine weitergegebene Adresse ist am nächsten Tag kein offener
 * Zugang mehr. Die Ansicht erneuert sie, solange sie offen ist.
 */
export const GUELTIG_SEKUNDEN = 60 * 60;

/** Was der Eimer annimmt — dieselbe Liste wie in der Migration. */
export const ERLAUBTE_TYPEN = [
  'application/pdf',
  'image/jpeg',
  'image/png',
  'image/webp',
  'image/heic',
] as const;

/** Dieselbe Grenze wie am Eimer. */
export const HOECHSTENS_BYTES = 25 * 1024 * 1024;

const ENDUNG_ZU_TYP: Record<string, (typeof ERLAUBTE_TYPEN)[number]> = {
  pdf: 'application/pdf',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  png: 'image/png',
  webp: 'image/webp',
  heic: 'image/heic',
};

/**
 * Der Dateityp — vom Browser, ersatzweise aus der Endung.
 *
 * Manche Geräte melden bei einer Datei aus der Dateien-App gar keinen Typ.
 * Die Endung ist dann der einzige Hinweis; ohne sie hier nachzuschlagen,
 * scheiterte ein gewöhnliches PDF am Eimer.
 */
export function dateiTyp(datei: Pick<File, 'name' | 'type'>): string | null {
  const typ = datei.type?.toLowerCase();
  if (typ && (ERLAUBTE_TYPEN as readonly string[]).includes(typ)) return typ;
  const endung = datei.name.split('.').pop()?.toLowerCase() ?? '';
  return ENDUNG_ZU_TYP[endung] ?? null;
}

/**
 * Warum eine Datei nicht hochgehen kann — oder `null`, wenn sie kann.
 *
 * VORHER GEPRÜFT, nicht erst am Eimer: dessen Meldung ist englisch und nennt
 * weder die Grenze noch die erlaubten Typen.
 */
export function dateiPruefen(datei: Pick<File, 'name' | 'type' | 'size'>): string | null {
  if (!dateiTyp(datei)) {
    return `„${datei.name}": nur PDF und Bilder (JPEG, PNG, WebP, HEIC). Pläne aus einem CAD-Programm bitte als PDF exportieren.`;
  }
  if (datei.size > HOECHSTENS_BYTES) {
    const mb = (datei.size / 1024 / 1024).toFixed(1).replace('.', ',');
    return `„${datei.name}" ist ${mb} MB gross — höchstens 25 MB.`;
  }
  if (datei.size === 0) return `„${datei.name}" ist leer.`;
  return null;
}

/** Die Pläne mehrerer Baustellen in einer Abfrage, neueste zuerst. */
export function listDokumente(
  companyId: string,
  projectIds: string[],
): Promise<WithId<BaustellenDokument>[]> {
  const ids = [...new Set(projectIds.filter(Boolean))];
  if (ids.length === 0) return Promise.resolve([]);
  return abfragen<BaustellenDokument>(TABELLE, companyId, {
    wo: [{ art: 'in', feld: 'projectId', werte: ids }],
    sortiere: { feld: 'createdAt', absteigend: true },
  });
}

/**
 * Hochladen: erst die Datei, dann die Zeile — und scheitert die Zeile, geht
 * die Datei wieder weg.
 *
 * IN DIESER REIHENFOLGE, weil eine Zeile ohne Datei ein Plan wäre, der sich
 * nicht öffnen lässt. Und die Datei wird wieder entfernt, weil sie ohne Zeile
 * niemand mehr fände: Speicher, der kostet, und ein Grundriss aus einer
 * fremden Wohnung ohne Beleg für seine Aufbewahrung.
 */
export async function dokumentHochladen(
  companyId: string,
  projectId: string,
  datei: File,
  hochgeladenVonName: string,
): Promise<WithId<BaustellenDokument>> {
  const fehler = dateiPruefen(datei);
  if (fehler) throw new Error(fehler);
  const mime = dateiTyp(datei)!;
  const endung = Object.entries(ENDUNG_ZU_TYP).find(([, t]) => t === mime)?.[0] ?? 'bin';
  /*
    EINE NEUE KENNUNG JE DATEI, nicht der Dateiname. Zwei Pläne mit dem Namen
    „Grundriss.pdf" überschrieben einander sonst — und die Sicherung, die nach
    Pfad überspringt, verliesse sich darauf, dass ein Pfad nie zwei Inhalte
    trägt.
  */
  const pfad = `baustellen/${companyId}/${projectId}/${crypto.randomUUID()}.${endung}`;
  const speicher = derClient().storage.from(EIMER);
  const { error: hoch } = await speicher.upload(pfad, datei, { contentType: mime, upsert: false });
  if (hoch) throw new Error(hoch.message);

  const daten: Omit<BaustellenDokument, 'id' | 'companyId' | 'createdAt' | 'hochgeladenVon'> = {
    projectId,
    pfad,
    dateiname: datei.name.trim().slice(0, 200) || `Plan.${endung}`,
    mime,
    bytes: datei.size,
    hochgeladenVonName,
  };
  try {
    const id = await anlegen(TABELLE, companyId, daten);
    return { id, companyId, ...daten, createdAt: Date.now() };
  } catch (e) {
    await speicher.remove([pfad]).catch(() => undefined);
    throw e;
  }
}

/**
 * Die Adressen, unter denen sich Dateien öffnen lassen — in einem Aufruf.
 *
 * `herunterladen` setzt den ursprünglichen Dateinamen: sonst hiesse jeder
 * gespeicherte Plan wie seine Kennung.
 */
export async function dokumentAdressen(
  dokumente: Pick<BaustellenDokument, 'pfad'>[],
): Promise<Map<string, string>> {
  const pfade = [...new Set(dokumente.map((d) => d.pfad))];
  if (pfade.length === 0) return new Map();
  const { data, error } = await derClient()
    .storage.from(EIMER)
    .createSignedUrls(pfade, GUELTIG_SEKUNDEN);
  if (error) throw new Error(error.message);
  const adressen = new Map<string, string>();
  for (const eintrag of data ?? []) {
    if (eintrag.path && eintrag.signedUrl && !eintrag.error) adressen.set(eintrag.path, eintrag.signedUrl);
  }
  return adressen;
}

/**
 * Löschen: erst die Zeile, dann die Datei.
 *
 * DIESE REIHENFOLGE, weil die Zeile das ist, was die Leute sehen. Scheitert
 * danach das Entfernen der Datei, ist der Plan aus der App verschwunden, und
 * die Datei liegt als Waise im Speicher — das wird gemeldet (`dateiBlieb`),
 * nicht verschwiegen. Umgekehrt stünde ein Plan in der Liste, der sich nicht
 * mehr öffnen lässt.
 */
export async function dokumentLoeschen(
  dokument: Pick<BaustellenDokument, 'id' | 'pfad'>,
): Promise<{ dateiBlieb: boolean }> {
  await loeschen(TABELLE, dokument.id);
  const { error } = await derClient().storage.from(EIMER).remove([dokument.pfad]);
  return { dateiBlieb: !!error };
}
