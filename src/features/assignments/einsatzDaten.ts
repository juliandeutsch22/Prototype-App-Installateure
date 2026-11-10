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

/** Gleichbleibend leer: an der Identität der Liste hängt das Übernehmen ins Formular. */
const KEINE_LISTEN: WithId<EinsatzMaterial>[] = [];

/**
 * Die Rüstlisten eines Tages, live wie die Einteilung selbst.
 *
 * `geladen` SAGT, OB DIE LISTEN ZU GENAU DIESEM TAG GEHÖREN. Nach einem
 * Wechsel des Tages stand bis zur ersten Antwort noch die Liste des vorigen
 * Tages da; das Formular übernahm sie für dieselbe Baustelle, und ein
 * Speichern in dieser Zeit schrieb sie über die Liste des neuen Tages. Bis
 * die Antwort für den Tag da ist, gibt es deshalb keine Liste und kein
 * Speichern. Ein Fehlschlag zählt wie bisher als „keine Liste“ — die
 * Einteilung ist die Aufgabe, das Material die Zugabe.
 */
export function useRuestlistenDesTages(
  companyId: string | undefined,
  date: string,
  an: boolean,
): { listen: WithId<EinsatzMaterial>[]; geladen: boolean } {
  const [stand, setStand] = useState<{ fuer: string; listen: WithId<EinsatzMaterial>[] } | null>(null);
  useEffect(() => {
    if (!companyId || !an) return;
    // Eine späte Meldung des abgelösten Tages darf den neuen nicht überschreiben.
    let aktiv = true;
    const beenden = subscribeEinsatzMaterialForDate(
      companyId,
      date,
      (listen) => {
        if (aktiv) setStand({ fuer: date, listen });
      },
      () => {
        if (aktiv) setStand({ fuer: date, listen: KEINE_LISTEN });
      },
    );
    return () => {
      aktiv = false;
      beenden();
    };
  }, [companyId, date, an]);
  if (!an) return { listen: KEINE_LISTEN, geladen: true };
  return stand?.fuer === date ? { listen: stand.listen, geladen: true } : { listen: KEINE_LISTEN, geladen: false };
}

/**
 * Derselbe Tag im Nachbarmonat — für das Blättern im Kalender.
 *
 * Der gewählte Tag wandert mit, damit Formular, Tagesliste und
 * Abwesenheiten immer zum angezeigten (und geladenen) Monat gehören. Blieb
 * er im alten Monat stehen, waren dessen Einsätze nicht mehr geladen: das
 * Formular stand leer da, und Speichern löschte die bestehende Einteilung
 * des Tages. Gibt es den Tag im neuen Monat nicht (31. → Februar), gilt
 * dessen letzter.
 */
export function gleicherTagImMonat(iso: string, delta: number): string {
  const [jahr, monat, tag] = iso.split('-').map(Number);
  // Lokal gerechnet, nicht über toISOString: das rechnet in UTC.
  const erster = new Date(jahr, monat - 1 + delta, 1);
  const letzter = new Date(erster.getFullYear(), erster.getMonth() + 1, 0).getDate();
  const zwei = (n: number) => String(n).padStart(2, '0');
  return `${erster.getFullYear()}-${zwei(erster.getMonth() + 1)}-${zwei(Math.min(tag, letzter))}`;
}
