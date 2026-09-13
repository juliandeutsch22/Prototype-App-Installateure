/**
 * Handwerksscheine — auf Postgres.
 *
 * AUS EINEM DOKUMENT WERDEN VIER TABELLEN. Zeiten, Material und Fotos lagen
 * in Firestore als Arrays im Schein; hier sind es eigene Zeilen. Beim Lesen
 * setzt `zusammensetzen` sie wieder zum Schein zusammen, beim Schreiben hält
 * `public.schein_speichern` sie zusammen — ein Kopf ohne seine Stunden wäre
 * ein halber Beleg, und wenn genau dann unterschrieben wird, ist er
 * eingefroren.
 *
 * Die Zeilen sind KOPIEN, keine Verweise: was der Kunde unterschrieben hat,
 * muss lesbar bleiben, auch wenn die zugehörige Zeitbuchung später korrigiert
 * oder der Mitarbeiter gelöscht wird. Deshalb steht dort der Name und keine
 * Kennung (siehe den Kopf von `…_vorgaenge.sql`).
 */
import type { SupabaseClient } from '@supabase/supabase-js';
import type {
  WorkSheet, WorkSheetFoto, WorkSheetMaterial, WorkSheetUnterschrift, WorkSheetZeit,
} from '@/types';
import { abfragen, aendern, derClient, type WithId } from './kern';
import { objektAlsZeile, zeileAlsObjekt } from './felder';

const SCHEINE = 'work_sheets';
const ZEITEN = 'work_sheet_hours';
const MATERIAL = 'work_sheet_material';
const FOTOS = 'work_sheet_photos';

/** Der Kopf, so wie er in der Datenbank steht: ohne die drei Listen. */
type KopfZeile = Omit<WorkSheet, 'zeiten' | 'material' | 'fotos' | 'unterschriften'> & {
  unterschriftMonteur?: WorkSheetUnterschrift | null;
  unterschriftKunde?: WorkSheetUnterschrift | null;
};

interface MitSchein {
  workSheetId: string;
  position?: number;
}

/**
 * Die Positionszeilen dreier Tabellen holen und den Scheinen zuordnen.
 *
 * DREI ABFRAGEN FÜR BELIEBIG VIELE SCHEINE, nicht drei je Schein. Eine
 * Prüfliste über ein Quartal holt sonst hundertfünfzigmal drei Abfragen — auf
 * dem Mobilfunknetz einer Baustelle ist das der Unterschied zwischen einer
 * Sekunde und einer Minute.
 */
async function zusammensetzen(
  koepfe: WithId<KopfZeile>[],
  companyId: string,
  client?: SupabaseClient,
): Promise<WithId<WorkSheet>[]> {
  if (koepfe.length === 0) return [];
  const kennungen = koepfe.map((k) => k.id);

  const teile = async <T>(tabelle: string, sortiert: boolean) =>
    abfragen<T & MitSchein>(
      tabelle,
      companyId,
      {
        wo: [{ art: 'in', feld: 'workSheetId', werte: kennungen }],
        ...(sortiert ? { sortiere: { feld: 'position' } } : {}),
      },
      client,
    );

  const [zeiten, material, fotos] = await Promise.all([
    teile<WorkSheetZeit>(ZEITEN, true),
    teile<WorkSheetMaterial>(MATERIAL, true),
    /*
      AUCH DIE FOTOS HABEN EINE REIHENFOLGE, und sie gehört zum Beleg: die
      Prüfsumme schreibt sie in dieser Folge. Käme die Liste einmal anders
      sortiert zurück, ergäbe derselbe Schein eine andere Prüfsumme.
    */
    teile<WorkSheetFoto>(FOTOS, true),
  ]);

  /*
    Nur die Felder, die der Schein kennt. `id`, `companyId`, `workSheetId` und
    `position` sind Buchhaltung der Datenbank; kämen sie mit, gingen sie beim
    nächsten Speichern wieder mit hinaus und stünden in der Prüfsumme, die
    den unterschriebenen Inhalt absichert.
  */
  const ordnen = <T>(zeilen: (T & MitSchein)[], felder: readonly (keyof T)[]) => {
    const nach = new Map<string, T[]>();
    for (const z of zeilen) {
      const rein: Record<string, unknown> = {};
      for (const f of felder) {
        const w = (z as unknown as Record<string, unknown>)[f as string];
        if (w !== null && w !== undefined) rein[f as string] = w;
      }
      const liste = nach.get(z.workSheetId) ?? [];
      liste.push(rein as T);
      nach.set(z.workSheetId, liste);
    }
    return nach;
  };

  const nachZeiten = ordnen<WorkSheetZeit>(zeiten, [
    'datum', 'mitarbeiter', 'von', 'bis', 'pauseMin', 'minuten', 'taetigkeit', 'helfer',
  ]);
  const nachMaterial = ordnen<WorkSheetMaterial>(material, ['name', 'menge', 'einheit']);
  const nachFotos = ordnen<WorkSheetFoto>(fotos, ['pfad', 'hash', 'bytes', 'geraetZeit']);

  return koepfe.map((k) => {
    const { unterschriftMonteur, unterschriftKunde, ...rest } = k;
    const schein: WithId<WorkSheet> = {
      ...(rest as unknown as WithId<WorkSheet>),
      zeiten: nachZeiten.get(k.id) ?? [],
      material: nachMaterial.get(k.id) ?? [],
    };
    const bilder = nachFotos.get(k.id);
    if (bilder && bilder.length > 0) schein.fotos = bilder;
    /*
      Zwei Spalten, ein Feld. Die App kennt `unterschriften.monteur` und
      `unterschriften.kunde`; in der Datenbank sind es zwei Spalten, weil ein
      Beleg mit genau zwei Unterschriften kein Anlass für eine weitere Tabelle
      ist. Fehlen beide, fehlt das Feld — ein leeres Objekt sähe aus wie ein
      unterschriebener Schein ohne Unterschrift.
    */
    if (unterschriftMonteur || unterschriftKunde) {
      schein.unterschriften = {};
      if (unterschriftMonteur) schein.unterschriften.monteur = unterschriftMonteur;
      if (unterschriftKunde) schein.unterschriften.kunde = unterschriftKunde;
    }
    return schein;
  });
}

/** Die jüngsten Scheine, mit Obergrenze — eine Arbeitsliste, kein Archiv. */
export async function listRecentWorkSheets(companyId: string, max = 100) {
  const koepfe = await abfragen<KopfZeile>(SCHEINE, companyId, {
    sortiere: { feld: 'createdAt', absteigend: true },
    grenze: max,
  });
  return zusammensetzen(koepfe, companyId);
}

/**
 * Die EIGENEN Scheine ab einem Tag — für die offenen Zeit-Nachtragungen.
 *
 * Eng gefasst, und zwar aus Gewicht: ein unterschriebener Schein trägt zwei
 * Unterschriftsbilder als PNG, nachgemessen rund 70 KB je Stück. Sie alle zu
 * holen, um die eigenen herauszufiltern, wären auf dem Telefon eines
 * Monteurs schnell mehrere Megabyte für eine Handvoll Zeilen.
 */
export async function listOwnWorkSheetsSince(
  companyId: string,
  uid: string,
  abDatum: string,
  max = 20,
) {
  const koepfe = await abfragen<KopfZeile>(SCHEINE, companyId, {
    wo: [
      { art: 'gleich', feld: 'erstelltVonUid', wert: uid },
      { art: 'ab', feld: 'datum', wert: abDatum },
    ],
    sortiere: { feld: 'datum', absteigend: true },
    grenze: max,
  });
  return zusammensetzen(koepfe, companyId);
}

/**
 * UNTERSCHRIEBENE Scheine eines Zeitraums — für die Prüfung des Büros auf
 * Stunden, die nie gebucht wurden.
 *
 * Nur `Unterschrieben`: ein Entwurf ist noch in Arbeit, ein Storno
 * zurückgezogen, ein verworfener nie beim Kunden gewesen. Für keinen davon
 * wäre eine fehlende Buchung ein Befund.
 */
export async function listSignedWorkSheetsInRange(
  companyId: string,
  von: string,
  bis: string,
  max = 150,
) {
  const koepfe = await abfragen<KopfZeile>(SCHEINE, companyId, {
    wo: [
      { art: 'gleich', feld: 'status', wert: 'Unterschrieben' },
      { art: 'ab', feld: 'datum', wert: von },
      { art: 'bis', feld: 'datum', wert: bis },
    ],
    sortiere: { feld: 'datum', absteigend: true },
    grenze: max,
  });
  return zusammensetzen(koepfe, companyId);
}

/** Die Scheine EINER Baustelle. */
export async function listWorkSheetsForProject(
  companyId: string,
  projectNumber: string,
  max = 100,
) {
  const koepfe = await abfragen<KopfZeile>(SCHEINE, companyId, {
    wo: [{ art: 'gleich', feld: 'projectNumber', wert: projectNumber }],
    grenze: max,
  });
  return zusammensetzen(koepfe, companyId);
}

/**
 * Alle Scheine eines Zeitraums — für die Suche über den geladenen Bestand
 * hinaus.
 *
 * Ohne Status-Filter: gesucht wird auch der Entwurf, den jemand vor Monaten
 * liegen liess, und der stornierte Beleg, zu dem gerade eine Rückfrage kommt.
 * Wer sucht, weiss nicht, in welchem Zustand der Schein ist — sonst müsste er
 * nicht suchen.
 */
export async function listWorkSheetsInRange(
  companyId: string,
  von: string,
  bis: string,
  max = 150,
) {
  const koepfe = await abfragen<KopfZeile>(SCHEINE, companyId, {
    wo: [
      { art: 'ab', feld: 'datum', wert: von },
      { art: 'bis', feld: 'datum', wert: bis },
    ],
    sortiere: { feld: 'datum', absteigend: true },
    grenze: max,
  });
  return zusammensetzen(koepfe, companyId);
}

/**
 * EINEN Schein holen — für das Weiterbearbeiten eines Entwurfs.
 *
 * WAS HIER ANDERS IST ALS UNTER FIRESTORE. Dort WARF der Aufruf, wenn es den
 * Schein nicht gab: die Regel las `resource.data.companyId`, und bei einem
 * fehlenden Dokument war `resource` null. Ein fehlender und ein fremder
 * Schein sahen von aussen gleich aus — beide als abgewiesener Zugriff.
 *
 * Der Zeilenschutz antwortet anders: eine Zeile, die man nicht sehen darf,
 * ist einfach nicht in der Ergebnismenge. Beide Fälle kommen deshalb als
 * `undefined` zurück statt als Fehler. Für den Aufrufer ändert sich nichts —
 * er musste beide Ausgänge schon immer gleich behandeln —, und die Antwort
 * ist jetzt die ehrlichere: „ich zeige dir das nicht" statt eines Fehlers,
 * der wie eine Störung aussieht.
 */
export async function getWorkSheet(id: string): Promise<WithId<WorkSheet> | undefined> {
  const c = derClient();
  const { data, error } = await c.from(SCHEINE).select('*').eq('id', id).maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) return undefined;
  const kopf = zeileAlsObjekt<WithId<KopfZeile>>(SCHEINE, data as Record<string, unknown>);
  const [schein] = await zusammensetzen([kopf], kopf.companyId);
  return schein;
}

export type NewWorkSheet = Omit<WorkSheet, 'id' | 'companyId' | 'createdAt'>;

/**
 * Eine Positionsliste für die Datenbank übersetzen — oder `null` durchreichen.
 *
 * `null` heisst dort UNBERÜHRT LASSEN und nicht „leeren": die Fotoliste wird
 * nach jedem Upload einzeln geschrieben, ohne dass der Entwurf gespeichert
 * wäre, und eine leere Liste wäre dort das Gegenteil dessen, was gemeint ist.
 */
function alsZeilen<T>(tabelle: string, liste: T[] | undefined): Record<string, unknown>[] | null {
  if (!liste) return null;
  return liste.map((z) => objektAlsZeile(tabelle, z as Record<string, unknown>));
}

/** Der Aufruf der Datenbankfunktion — eine Stelle für Anlegen und Ändern. */
async function speichern(
  id: string,
  inhalt: Partial<NewWorkSheet>,
  client?: SupabaseClient,
): Promise<string> {
  const { zeiten, material, fotos, unterschriften: _weg, status: _zustand, ...kopf } = inhalt;
  void _weg;
  /*
    `status` geht NICHT mit. Die Ansicht schickt „Entwurf" bei jedem Speichern
    mit; die Datenbankfunktion setzt ihn beim Anlegen selbst und rührt ihn
    beim Ändern nicht an. Ein Zustandswechsel läuft ausschliesslich über
    `signWorkSheet`, `cancelWorkSheet` und die beiden Entwurfswege — nur dort
    beurteilt ihn der Trigger.
  */
  void _zustand;

  const { error, data } = await derClient(client).rpc('schein_speichern', {
    p_id: id,
    p_kopf: Object.keys(kopf).length > 0 ? objektAlsZeile(SCHEINE, kopf) : null,
    p_zeiten: alsZeilen(ZEITEN, zeiten),
    p_material: alsZeilen(MATERIAL, material),
    p_fotos: alsZeilen(FOTOS, fotos),
  });
  if (error) throw new Error(error.message);
  return String(data ?? id);
}

/**
 * Anlegen — mit einer Kennung VOM GERÄT.
 *
 * Deshalb trägt `work_sheets.id` keinen Standardwert: ein Schein entsteht im
 * Keller und geht ohne Empfang in die Warteschlange. Nur wenn die Kennung
 * feststeht, bevor der Server sie bestätigt, darf derselbe Vorgang zweimal
 * ankommen, ohne zweimal zu landen.
 */
export function createWorkSheet(companyId: string, s: NewWorkSheet): Promise<string> {
  void companyId;
  return speichern(crypto.randomUUID(), s);
}

/** Ändern — nur im Entwurf. Danach lehnt der Trigger ab. */
export async function updateWorkSheetDraft(
  id: string,
  data: Partial<NewWorkSheet>,
): Promise<void> {
  await speichern(id, data);
}

/**
 * NUR die Fotoliste am Entwurf festschreiben.
 *
 * Ein Bild liegt nach dem Upload im Storage; ohne diesen Schritt entstünde
 * der Verweis darauf erst, wenn der Monteur den Entwurf speichert. Wer
 * fotografiert und dann das Fenster schliesst, hinterliesse eine Datei, auf
 * die nichts zeigt — dauerhaft bezahlt und ein Bild aus einer fremden
 * Wohnung ohne Beleg, der seine Aufbewahrung rechtfertigt.
 *
 * Kopf, Zeiten und Material bleiben unberührt: was der Monteur gerade tippt,
 * gehört ihm, bis er speichert.
 */
export async function fotosAmEntwurf(id: string, fotos: WorkSheetFoto[]): Promise<void> {
  await speichern(id, { fotos });
}

/** Unterschreiben und einfrieren — in EINEM Schreibvorgang. */
export async function signWorkSheet(
  id: string,
  monteur: WorkSheetUnterschrift,
  kunde: WorkSheetUnterschrift,
): Promise<void> {
  const { error } = await derClient().rpc('schein_unterschreiben', {
    p_id: id,
    p_monteur: monteur,
    p_kunde: kunde,
  });
  if (error) throw new Error(error.message);
}

/**
 * Stornieren.
 *
 * Der einzige Weg, einen unterschriebenen Schein aus dem Verkehr zu ziehen.
 * Er bleibt bestehen und sichtbar — ein spurlos verschwundener Beleg wäre
 * schlimmer als ein falscher. Dass nur die Führung darf und dass ein Grund
 * dabeisteht, hält der Trigger fest, nicht diese Zeile.
 */
export function cancelWorkSheet(id: string, grund: string, vonName: string): Promise<void> {
  return aendern(SCHEINE, id, {
    status: 'Storniert',
    stornoGrund: grund,
    storniertVonName: vonName,
  });
}

/**
 * Einen Entwurf aufgeben.
 *
 * Gekennzeichnet, nicht gelöscht: es gibt für Scheine überhaupt keine
 * Löschrichtlinie, und das soll so bleiben. Der Preis einer Löschbedingung,
 * die „nur Entwürfe" meint und sich um ein Feld vertut, wäre ein spurlos
 * verschwundener Kundenbeleg.
 */
export function discardWorkSheetDraft(id: string, vonName: string): Promise<void> {
  return aendern(SCHEINE, id, { status: 'Verworfen', verworfenVonName: vonName });
}

/**
 * Einen verworfenen Entwurf zurückholen — der einzige Rückweg im Schein.
 *
 * Er muss es geben: „Verwerfen" ist der Knopf für den Fehlgriff, und ein
 * Knopf gegen Fehlgriffe, dessen eigener Fehlgriff das Getippte kostet, hätte
 * den Fehler nur verschoben.
 */
export function restoreWorkSheetDraft(id: string): Promise<void> {
  return aendern(SCHEINE, id, { status: 'Entwurf' });
}

/** Eine Zeile, die die Vorausfüllung auf den Schein legt. */
export interface ScheinZeit {
  datum: string;
  mitarbeiter: string;
  von?: string;
  bis?: string;
  pauseMin?: number;
  minuten: number;
  taetigkeit?: string;
  helfer?: boolean;
}

/**
 * Die Stunden der ganzen Mannschaft für einen Schein — serverseitig.
 *
 * Bis zum Umzug war das eine Cloud Function; der Grund für beides ist
 * derselbe und hat nichts mit dem Ort zu tun: der Kunde unterschreibt für
 * alle, die dort waren, ein Monteur darf die Zeiteinträge seiner Kollegen
 * aber nicht lesen (Kranken- und Urlaubstage sind Gesundheitsdaten nach
 * Art. 9 DSGVO). Zurück kommt nur, was auf dem Beleg steht.
 */
export async function vorbereiten(
  projectNumber: string, datum: string,
): Promise<{ zeiten: ScheinZeit[] }> {
  const { data, error } = await derClient().rpc('schein_vorbereiten', {
    p_baustelle: projectNumber,
    p_datum: datum,
  });
  if (error) throw new Error(error.message);
  return data as { zeiten: ScheinZeit[] };
}
