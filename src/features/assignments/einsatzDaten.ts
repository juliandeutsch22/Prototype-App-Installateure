import { useEffect, useState } from 'react';
import { subscribeMaterials } from '@/lib/db/materials';
import { subscribeEinsatzMaterialForDate } from '@/lib/db/einsatzMaterial';
import type { Abwesenheit } from '@/lib/db/vacations';
import type { WithId } from '@/lib/db/core';
import type { EinsatzMaterial, Material } from '@/types';

/*
  WAS DAS EINSATZFORMULAR AN DATEN BRAUCHT, an einer Stelle — seit es an
  zwei Orten steht: in „Tag planen“ und im Seitenfenster des Wochenplans
  (Linie „Lot“, Schritt E2). Es sind dieselben Abfragen wie vorher in der
  Tagesplanung, nur hierher gezogen; die Datenschicht ist unverändert.
*/

/** 'YYYY-MM-DD' -> 'Fr., 28.08.2026'. */
export function fmtDay(iso: string): string {
  return new Date(`${iso}T00:00:00`).toLocaleDateString('de-AT', {
    weekday: 'short',
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  });
}

/**
 * Wer an einem Tag den GANZEN Tag fehlt — uid -> Grund („Urlaub", „ZA",
 * „Krank" oder „abwesend") — und wer nur stundenweise weg ist.
 *
 * Stundenweise weg (ZA 13–17 Uhr) zählt nicht als abwesend: vormittags ist
 * die Person da und darf ohne Warnung eingeteilt werden. Den Grund liefert
 * die Datenbank nur, wo er gesehen werden darf — sonst „abwesend".
 */
export function abwesendAm(
  urlaube: Abwesenheit[],
  date: string,
): { imUrlaub: Map<string, string>; teilweiseWeg: Map<string, string> } {
  const ganz = new Map<string, string>();
  const teils = new Map<string, string>();
  for (const v of urlaube) {
    if (v.von > date || v.bis < date) continue;
    const text = [v.grund ?? 'abwesend', v.zeiten].filter(Boolean).join(' ');
    if (v.zeiten) teils.set(v.userId, text);
    else ganz.set(v.userId, text);
  }
  return { imUrlaub: ganz, teilweiseWeg: teils };
}

/**
 * Der Materialstamm — nur wenn das Modul überhaupt an ist.
 *
 * Ein Fehlschlag bleibt folgenlos: ohne Katalog gibt es keine Suche, aber
 * die Einteilung selbst ist davon unberührt. Sie ist die Aufgabe des
 * Formulars; das Material ist die Zugabe.
 */
export function useMaterialstamm(companyId: string | undefined, an: boolean): WithId<Material>[] {
  const [materials, setMaterials] = useState<WithId<Material>[]>([]);
  useEffect(() => {
    if (!companyId || !an) return;
    return subscribeMaterials(companyId, setMaterials, () => setMaterials([]));
  }, [companyId, an]);
  return materials;
}

/** Die Rüstlisten eines Tages, live wie die Einteilung selbst. */
export function useRuestlistenDesTages(
  companyId: string | undefined,
  date: string,
  an: boolean,
): WithId<EinsatzMaterial>[] {
  const [tagesListen, setTagesListen] = useState<WithId<EinsatzMaterial>[]>([]);
  useEffect(() => {
    if (!companyId || !an) return;
    return subscribeEinsatzMaterialForDate(companyId, date, setTagesListen, () => setTagesListen([]));
  }, [companyId, date, an]);
  return tagesListen;
}
