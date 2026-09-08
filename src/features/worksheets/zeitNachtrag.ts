import type { TimeEntry, WorkSheet } from '@/types';
import { normProjectNumber } from '@/lib/time';

/**
 * Unterschriebene Scheine, für die noch kein Zeiteintrag existiert.
 *
 * WARUM ES DAS BRAUCHT. Der Monteur stellt den Schein beim Kunden aus, oft
 * bevor er die Zeit gebucht hat — bei einer Reparatur zwischendurch hat er
 * vorher gar nichts erfasst. Bis zum 08.09.2026 konnte er auf dem Schein
 * auch keine Zeit eintragen: die Zeilen kamen ausschliesslich aus der
 * Zeiterfassung, und war dort nichts gebucht, stand auf dem Beleg „keine
 * Zeit gebucht". Der Kunde unterschrieb einen Zettel, der nur Material
 * dokumentierte.
 *
 * DAS IST NICHT NUR UNSCHÖN, ES KOSTET GELD. Die Rechnung rechnet ihre
 * Stunden aus den ZEITEINTRÄGEN, nicht vom Schein — der Schein liefert nur
 * das Material. Eine Stunde, die nie gebucht wird, wird also nie verrechnet.
 * Nicht „später korrigiert": nie. Und es fehlt zugleich die
 * Arbeitszeitaufzeichnung, die der Betrieb nach § 26 AZG führen muss.
 *
 * WARUM DER EINTRAG NICHT AUTOMATISCH ENTSTEHT. Der Schein kennt die Zeit
 * BEIM KUNDEN. Er kennt nicht die Anfahrt, nicht das Fahrzeug, nicht die
 * Zuschläge und nicht den Rest des Arbeitstags. Ein automatisch erzeugter
 * Eintrag wäre eine zu niedrige Arbeitszeitaufzeichnung, die vollständig
 * aussieht — und niemand sähe je wieder hin. Ein Hinweis, den man
 * wegarbeiten muss, ist besser als ein Eintrag, der falsch ist.
 *
 * WARUM ABGELEITET STATT GESPEICHERT. Es gibt kein Feld „noch nachzutragen",
 * das jemand setzen und wieder löschen müsste. Der Hinweis ergibt sich aus
 * dem Vergleich und verschwindet von selbst, sobald der Eintrag da ist. Ein
 * gespeicherter Zustand liefe irgendwann auseinander, und dann stünde eine
 * Mahnung für etwas da, das längst erledigt ist.
 */

/**
 * Wie weit zurück erinnert wird, in Tagen.
 *
 * Vierzehn Tage. Kürzer wäre zu knapp — wer eine Woche auf Montage ist,
 * bucht am Freitag nach. Länger würde zur Dauerliste: hat jemand den Tag auf
 * eine andere Baustelle gebucht, bleibt der Hinweis stehen, und ein Hinweis,
 * der ständig zu Unrecht dasteht, wird nicht mehr gelesen.
 *
 * Der lange Schwanz gehört nicht hierher, sondern ins Büro: „nicht
 * verrechnete Leistung" in den Rechnungen fängt den Schein, aus dem nie eine
 * Rechnung wurde.
 */
export const NACHTRAG_TAGE = 14;

export interface OffenerNachtrag {
  schein: WorkSheet & { id: string };
  /** Die auf dem Schein bestätigte Zeit beim Kunden, in Minuten. */
  minuten: number;
  /** Vorschlag fürs Formular — die Spanne der ersten eigenen Zeile. */
  von?: string;
  bis?: string;
  pauseMin?: number;
}

/** Tage zwischen zwei ISO-Tagen, in UTC — ohne Sommerzeitfallen. */
function tageZwischen(vonIso: string, bisIso: string): number {
  const von = Date.parse(`${vonIso}T00:00:00Z`);
  const bis = Date.parse(`${bisIso}T00:00:00Z`);
  if (Number.isNaN(von) || Number.isNaN(bis)) return 0;
  return Math.round((bis - von) / 86_400_000);
}

/**
 * Was noch nachzutragen ist.
 *
 * DER ABGLEICH IST BEWUSST GROB: gesucht wird ein Anwesenheitseintrag am
 * SELBEN TAG auf DERSELBEN BAUSTELLE. Die Minuten werden NICHT verglichen.
 *
 * Sie dürfen abweichen, und zwar regelmässig: der Schein bestätigt die Zeit
 * beim Kunden, der Eintrag umfasst den Arbeitstag. Ein Wächter, der jede
 * Abweichung meldet, schlüge ständig zu Recht an — und würde nach einer
 * Woche weggeklickt wie jede Meldung, die immer kommt.
 */
export function offeneNachtraege(
  scheine: Array<WorkSheet & { id: string }>,
  eintraege: Array<Pick<TimeEntry, 'date' | 'status' | 'projectNumber'>>,
  heute: string,
  tageZurueck = NACHTRAG_TAGE,
): OffenerNachtrag[] {
  const gebucht = new Set<string>();
  for (const e of eintraege) {
    if (e.status !== 'Anwesend') continue;
    gebucht.add(`${e.date}|${normProjectNumber(e.projectNumber ?? '')}`);
  }

  return scheine
    .filter((s) => {
      if (s.status !== 'Unterschrieben') return false;
      const alter = tageZwischen(s.datum, heute);
      if (alter < 0 || alter > tageZurueck) return false;
      /*
        OHNE ZEITEN AUF DEM SCHEIN GIBT ES NICHTS NACHZUTRAGEN. Ein reiner
        Materialschein ist vollständig — dafür war niemand stundenlang dort.
      */
      if (!s.zeiten?.some((z) => z.minuten > 0)) return false;
      return !gebucht.has(`${s.datum}|${normProjectNumber(s.projectNumber)}`);
    })
    .map((schein) => {
      const zeilen = schein.zeiten.filter((z) => z.minuten > 0);
      const erste = zeilen[0];
      return {
        schein,
        minuten: zeilen.reduce((s, z) => s + z.minuten, 0),
        von: erste?.von,
        bis: erste?.bis,
        pauseMin: erste?.pauseMin,
      };
    })
    // Älteste zuerst: was zwei Wochen her ist, weiss niemand mehr genau.
    .sort((a, b) => a.schein.datum.localeCompare(b.schein.datum));
}
