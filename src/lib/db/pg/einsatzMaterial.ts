/**
 * Die Rüstliste eines Einsatzes — auf Postgres.
 *
 * AUS EINEM DOKUMENT WERDEN ZWEI TABELLEN. In Firestore lag die ganze Liste
 * in einem Dokument, die Positionen als Array darin. Hier ist eine Position
 * eine Zeile: sortierbar, einzeln änderbar, nicht auf eine Dokumentgrösse
 * angewiesen. Der Preis ist, dass Kopf und Positionen zusammengehalten
 * werden müssen — beim Schreiben durch `public.ruestliste_speichern`, beim
 * Lesen durch `zusammensetzen` weiter unten.
 */
import type { SupabaseClient } from '@supabase/supabase-js';
import type { EinsatzMaterial, RuestPosition } from '@/types';
import { abfragen, derClient, NACHFASSEN_MS, type WithId } from './kern';

const KOPF = 'einsatz_material';
const POSITIONEN = 'einsatz_material_positionen';

/** Die Kopfzeile, so wie sie in der Datenbank steht — ohne die Positionen. */
type KopfZeile = Omit<EinsatzMaterial, 'positionen'>;

/** Eine Positionszeile, so wie sie in der Datenbank steht. */
interface PositionsZeile extends RuestPosition {
  einsatzMaterialId: string;
  position: number;
}

/**
 * Kopfzeilen und ihre Positionen zu ganzen Rüstlisten zusammenfügen.
 *
 * ZWEI ABFRAGEN, NICHT EINE JE KOPF. Ein Tag hat eine Handvoll Baustellen;
 * je Baustelle nachzuschlagen wären fünf Abfragen statt zwei, und auf einem
 * Mobilfunknetz im Keller zählt jede einzelne.
 *
 * Die Reihenfolge kommt aus der Spalte `position` und nicht aus der
 * Rückgabereihenfolge der Datenbank: ohne `order by` darf Postgres liefern,
 * wie es ihm passt, und die Liste im Bus stünde jeden Tag anders.
 */
async function zusammensetzen(
  koepfe: WithId<KopfZeile>[],
  companyId: string,
  client?: SupabaseClient,
): Promise<WithId<EinsatzMaterial>[]> {
  if (koepfe.length === 0) return [];

  const zeilen = await abfragen<PositionsZeile>(
    POSITIONEN,
    companyId,
    {
      wo: [{ art: 'in', feld: 'einsatzMaterialId', werte: koepfe.map((k) => k.id) }],
      sortiere: { feld: 'position' },
    },
    client,
  );

  const nachKopf = new Map<string, RuestPosition[]>();
  for (const z of zeilen) {
    const liste = nachKopf.get(z.einsatzMaterialId) ?? [];
    /*
      Nur die Felder, die eine Rüstposition ausmachen. `companyId`,
      `einsatzMaterialId` und `position` sind Buchhaltung der Datenbank; sie
      mitzuführen hiesse, dass sie beim nächsten Speichern wieder mitkämen
      und dort nichts zu suchen hätten.
    */
    const pos: RuestPosition = { id: z.id, name: z.name, menge: z.menge };
    if (z.materialId != null) pos.materialId = z.materialId;
    if (z.einheit != null) pos.einheit = z.einheit;
    liste.push(pos);
    nachKopf.set(z.einsatzMaterialId, liste);
  }

  return koepfe.map((k) => ({ ...k, positionen: nachKopf.get(k.id) ?? [] }));
}

/** Alle Rüstlisten EINES TAGES. */
export async function listEinsatzMaterialForDate(
  companyId: string,
  date: string,
  client?: SupabaseClient,
): Promise<WithId<EinsatzMaterial>[]> {
  const koepfe = await abfragen<KopfZeile>(
    KOPF,
    companyId,
    { wo: [{ art: 'gleich', feld: 'date', wert: date }] },
    client,
  );
  return zusammensetzen(koepfe, companyId, client);
}

/**
 * Dasselbe, live — für die Planung, die auch die Einteilung live hält.
 *
 * EIGENES ABONNEMENT STATT `abonnieren`, und zwar aus einem Grund: eine
 * Rüstliste besteht aus zwei Tabellen, der allgemeine Weg meldet aber
 * einzelne Zeilen einer einzigen. Hier wird deshalb der KOPF beobachtet und
 * bei jeder Meldung der ganze Tag neu geholt.
 *
 * DAS TRÄGT NUR, WEIL JEDES SCHREIBEN DEN KOPF BERÜHRT. `ruestliste_speichern`
 * legt ihn an, ändert ihn oder löscht ihn — auch dann, wenn sich nur eine
 * Position geändert hat, denn zum Schluss räumt es `geladen` auf.
 * `laden_umschalten` schreibt ohnehin nur am Kopf. Gäbe es einen Weg, eine
 * Position ohne den Kopf zu ändern, bliebe diese Ansicht stumm; deshalb ist
 * genau das geprüft (`tests/supabase/modulEinsatz.test.ts`).
 *
 * Nachgefasst wird wie überall einmal: `SUBSCRIBED` sagt, dass der Kanal
 * steht, nicht dass die Datenbank schon meldet.
 */
export function subscribeEinsatzMaterialForDate(
  companyId: string,
  date: string,
  cb: (rows: WithId<EinsatzMaterial>[]) => void,
  onError: (e: Error) => void,
  client?: SupabaseClient,
): () => void {
  const c = derClient(client);
  let gestoppt = false;
  let laeuft: Promise<void> | null = null;
  let nochmal = false;
  let nachfassen: ReturnType<typeof setTimeout> | undefined;

  /*
    Meldungen werden zusammengefasst, nicht gestapelt. Ein Speichern löst
    mehrere Änderungen am Kopf aus; liefen die Nachladungen nebeneinander,
    könnte die ältere als letzte zurückkommen und die Ansicht auf einen
    überholten Stand zurückwerfen.
  */
  const anstossen = (): void => {
    if (laeuft) {
      nochmal = true;
      return;
    }
    laeuft = listEinsatzMaterialForDate(companyId, date, c)
      .then((zeilen) => {
        if (!gestoppt) cb(zeilen);
      })
      .catch((e: unknown) => {
        if (!gestoppt) onError(e as Error);
      })
      .finally(() => {
        laeuft = null;
        if (nochmal && !gestoppt) {
          nochmal = false;
          anstossen();
        }
      });
  };

  const kanal = c
    .channel(`${KOPF}-${companyId}-${date}-${Math.random().toString(36).slice(2)}`)
    .on(
      'postgres_changes',
      { event: '*', schema: 'public', table: KOPF, filter: `company_id=eq.${companyId}` },
      () => anstossen(),
    )
    .subscribe((status) => {
      if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
        onError(new Error(`Live-Abonnement für ${KOPF}: ${status}`));
        return;
      }
      if (status !== 'SUBSCRIBED') return;
      anstossen();
      nachfassen = setTimeout(anstossen, NACHFASSEN_MS);
    });

  return () => {
    gestoppt = true;
    if (nachfassen) clearTimeout(nachfassen);
    void c.removeChannel(kanal);
  };
}

/** Die Rüstliste eines einzelnen Einsatzes — oder null, wenn keine geplant ist. */
export async function getEinsatzMaterial(
  companyId: string,
  date: string,
  projectNumber: string,
  client?: SupabaseClient,
): Promise<WithId<EinsatzMaterial> | null> {
  const tag = await listEinsatzMaterialForDate(companyId, date, client);
  return tag.find((r) => r.projectNumber === projectNumber) ?? null;
}

/**
 * Die Liste speichern (Planung).
 *
 * EIN AUFRUF, WEIL ES EIN VORGANG IST. Kopf und Positionen gehören zusammen;
 * getrennt geschrieben stünde nach einem Abbruch ein Kopf ohne Positionen da
 * — eine Rüstliste, die es nicht gibt und die trotzdem angezeigt wird.
 *
 * DIE KENNUNG JEDER POSITION GEHT MIT und wird übernommen. An ihr hängt die
 * Abhakliste `geladen`. Vergäbe die Datenbank eigene Kennungen, verlöre jedes
 * Speichern der Planung sämtliche Haken der Monteure.
 *
 * Die Reihenfolge der Liste wird als `position` mitgeschickt — im Dokument
 * war sie der Platz im Array, in einer Tabelle muss sie eine Spalte sein.
 *
 * Eine Liste ohne Positionen wird GELÖSCHT, nicht leer gespeichert. Sonst
 * bliebe für jeden je geplanten Einsatz ein leerer Kopf liegen, und die
 * Startseite müsste zwischen „keine Liste" und „leere Liste" unterscheiden,
 * ohne dass der Unterschied jemandem etwas sagt.
 */
export async function saveEinsatzMaterial(
  companyId: string,
  date: string,
  projectNumber: string,
  positionen: RuestPosition[],
  uids: string[],
  updatedBy: string,
  client?: SupabaseClient,
): Promise<void> {
  /*
    Der Betrieb steht im Anmeldekontext, die Datenbankfunktion holt ihn sich
    dort (`app.betrieb()`). Der Parameter bleibt trotzdem in der Signatur:
    sie ist für beide Datenquellen dieselbe, und die Firestore-Fassung braucht
    ihn. Ihn hier wegzulassen hiesse, die Weiche könnte nicht mehr beide
    Seiten bedienen.
  */
  void companyId;

  const { error } = await derClient(client).rpc('ruestliste_speichern', {
    p_datum: date,
    p_baustelle: projectNumber,
    p_positionen: positionen.map((p, i) => ({
      id: p.id,
      position: i,
      material_id: p.materialId ?? null,
      name: p.name,
      menge: p.menge,
      einheit: p.einheit ?? null,
    })),
    p_uids: uids,
    p_von: updatedBy,
  });
  if (error) throw new Error(error.message);
}

/**
 * Eine Position ab- oder wieder aufhaken — das darf der Monteur.
 *
 * Geschrieben wird AUSSCHLIESSLICH an `geladen`. Das ist keine Stilfrage:
 * der Trigger `app.ruestliste_geschuetzt` lässt dem eingeteilten Monteur
 * genau dieses eine Feld und sonst nichts.
 *
 * Die Zeit kommt aus der Datenbank, nicht mehr vom Gerät. In Firestore war
 * ein Serverzeitstempel in einer verschachtelten Karte nicht zu haben; hier
 * schon, und „eingeladen von Max, 06:12" stimmt damit auch, wenn die Uhr des
 * Telefons falsch geht.
 */
export async function ladenUmschalten(
  companyId: string,
  date: string,
  projectNumber: string,
  positionId: string,
  an: boolean,
  vonName: string,
  client?: SupabaseClient,
): Promise<void> {
  /*
    Der Betrieb steht im Anmeldekontext, die Datenbankfunktion holt ihn sich
    dort (`app.betrieb()`). Der Parameter bleibt trotzdem in der Signatur:
    sie ist für beide Datenquellen dieselbe, und die Firestore-Fassung braucht
    ihn. Ihn hier wegzulassen hiesse, die Weiche könnte nicht mehr beide
    Seiten bedienen.
  */
  void companyId;

  const { error } = await derClient(client).rpc('laden_umschalten', {
    p_datum: date,
    p_baustelle: projectNumber,
    p_position: positionId,
    p_an: an,
    p_von: vonName,
  });
  if (error) throw new Error(error.message);
}
