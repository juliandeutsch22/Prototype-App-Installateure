/**
 * HANDWERKSSCHEINE, DIE NOCH IM GERÄT WARTEN (E49, 05.11.2026).
 *
 * Seit E49 legt der Schein seine Schreibvorgänge ins Ausgangsfach, wenn kein
 * Netz da ist: Fotos, Speichern, Unterschreiben, je ein Vorgang, in der
 * Reihenfolge, in der sie entstanden. Bis sie angekommen sind, kennt sie nur
 * dieses Gerät. Zwei Stellen müssen sie trotzdem zeigen:
 *
 *   DIE LISTE, damit der Monteur sieht, dass sein Schein da ist und wartet.
 *   Fände er ihn nicht, legte er ihn ein zweites Mal an — und der Kunde hätte
 *   zwei Belege für denselben Einsatz unterschrieben.
 *
 *   DAS WIEDERÖFFNEN EINES ENTWURFS OHNE NETZ. Wer im Keller als Entwurf
 *   speichert, weil der Kunde gerade nicht da ist, muss ihn dort auch wieder
 *   aufmachen und unterschreiben lassen können.
 *
 * Diese Datei setzt die Vorgänge eines Scheins zusammen, wie die Datenbank es
 * tun wird: der Kopf Feld für Feld, Zeiten, Material und Fotos jeweils als
 * ganze Liste (`schein_speichern` ersetzt sie so). Sie liest nur, sie
 * schreibt nichts, und sie kennt weder IndexedDB noch Supabase.
 */
import type { Vormerkung } from '@/lib/sync/ausgangsfach';
import { zeileAlsObjekt } from '@/lib/db/pg/felder';
import type { WorkSheet, WorkSheetFoto, WorkSheetMaterial, WorkSheetZeit } from '@/types';

/** Unter diesem Namen legt der Schein seine Vorgänge ab (Gruppe für Reihenfolge und Aufgeben). */
export const SCHEIN_TABELLE = 'work_sheets';
/** Unter diesem Namen liegen Hochladen und Entfernen eines Fotos — je Datei eine eigene Gruppe. */
export const FOTO_TABELLE = 'scheinfotos';

/** Was ein vorgemerktes Speichern trägt — die Parameter von `schein_speichern`. */
export interface SpeichernParameter {
  p_id: string;
  p_kopf: Record<string, unknown> | null;
  p_zeiten: Record<string, unknown>[] | null;
  p_material: Record<string, unknown>[] | null;
  p_fotos: Record<string, unknown>[] | null;
}

export interface VorgemerkterSchein {
  id: string;
  /** Der Kopf, wie ihn das Gerät zuletzt vorgemerkt hat — fehlt, wenn nur Fotos warten. */
  kopf?: Partial<WorkSheet>;
  zeiten?: WorkSheetZeit[];
  material?: WorkSheetMaterial[];
  fotos?: WorkSheetFoto[];
  /** Die Bilder, die noch hochgehen, nach ihrem Pfad — für die Vorschau ohne Netz. */
  dateien: Record<string, Blob>;
  /** Wartet auch die Unterschrift? Dann ist der Schein vor Ort abgeschlossen. */
  unterschrieben: boolean;
  /** Wann der erste wartende Vorgang dieses Scheins vorgemerkt wurde. */
  seit: number;
}

function liste<T>(tabelle: string, zeilen: Record<string, unknown>[] | null): T[] | undefined {
  if (!zeilen) return undefined;
  return zeilen.map((z) => zeileAlsObjekt<T>(tabelle, z));
}

/**
 * Die wartenden Scheine aus dem Inhalt des Fachs — neueste zuerst.
 *
 * Nimmt alles, was im Fach liegt, und sucht sich die Vorgänge der Scheine
 * selbst heraus: Zeitbuchungen und Anforderungen gehen an ihm vorbei.
 */
export function vorgemerkteScheine(vormerkungen: readonly Vormerkung[]): VorgemerkterSchein[] {
  const nach = new Map<string, VorgemerkterSchein>();
  const holen = (id: string, angelegt: number) => {
    let s = nach.get(id);
    if (!s) {
      s = { id, dateien: {}, unterschrieben: false, seit: angelegt };
      nach.set(id, s);
    }
    return s;
  };

  for (const v of [...vormerkungen].sort((a, b) => a.folge - b.folge)) {
    if (v.tabelle === SCHEIN_TABELLE && v.art === 'aufruf') {
      const { funktion, parameter } = v.daten as { funktion?: string; parameter?: Record<string, unknown> };
      if (!parameter) continue;
      const s = holen(v.zeile, v.angelegt);
      if (funktion === 'schein_unterschreiben') {
        s.unterschrieben = true;
        continue;
      }
      if (funktion !== 'schein_speichern') continue;
      const p = parameter as unknown as SpeichernParameter;
      if (p.p_kopf) s.kopf = { ...s.kopf, ...zeileAlsObjekt<Partial<WorkSheet>>('work_sheets', p.p_kopf) };
      s.zeiten = liste<WorkSheetZeit>('work_sheet_hours', p.p_zeiten) ?? s.zeiten;
      s.material = liste<WorkSheetMaterial>('work_sheet_material', p.p_material) ?? s.material;
      s.fotos = liste<WorkSheetFoto>('work_sheet_photos', p.p_fotos) ?? s.fotos;
      continue;
    }
    if (v.tabelle === FOTO_TABELLE && v.art === 'hochladen') {
      const { pfad, datei, schein } = v.daten as { pfad?: string; datei?: Blob; schein?: string };
      if (!pfad || !datei || !schein) continue;
      holen(schein, v.angelegt).dateien[pfad] = datei;
    }
  }

  return [...nach.values()].sort((a, b) => b.seit - a.seit);
}

/**
 * Einen Entwurf so, wie er nach dem Senden auf dem Server stehen wird: der
 * Stand vom Server (falls es ihn dort schon gibt), darüber das, was noch
 * wartet. Ohne beides gibt es nichts zu öffnen.
 */
export function entwurfMitVorgemerktem(
  server: WorkSheet | undefined,
  wartend: VorgemerkterSchein | undefined,
): WorkSheet | undefined {
  if (!wartend) return server;
  /*
    NUR IM GERÄT, ALSO NUR VOLLSTÄNDIG. Ohne den Stand vom Server öffnet nur,
    was die Maske ganz vorgemerkt hat: Kopf, Zeiten und Material. Ein Teil
    davon (etwa nur die Fotoliste) ergäbe ein Formular mit leeren Listen —
    und dessen Speichern leerte sie auch auf dem Server.
  */
  if (!server && !(wartend.kopf && wartend.zeiten && wartend.material)) return undefined;
  const basis = (server ?? { zeiten: [], material: [], status: 'Entwurf' }) as WorkSheet;
  return {
    ...basis,
    ...wartend.kopf,
    // Der Zustand kommt nie aus dem Fach: `schein_speichern` setzt ihn nicht.
    status: server?.status ?? 'Entwurf',
    zeiten: wartend.zeiten ?? basis.zeiten ?? [],
    material: wartend.material ?? basis.material ?? [],
    ...(wartend.fotos ? { fotos: wartend.fotos } : basis.fotos ? { fotos: basis.fotos } : {}),
  } as WorkSheet;
}
