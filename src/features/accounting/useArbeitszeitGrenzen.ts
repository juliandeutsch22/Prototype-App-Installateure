import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { listArbeitszeitenInRange, listEntriesInRange } from '@/lib/db/timeEntries';
import { listBegruendungen, listGeburtsdaten, type Begruendung } from '@/lib/db/arbeitszeitGrenzen';
import { tagessollStunden, todayStr } from '@/lib/time';
import type { WithId } from '@/lib/db/core';
import type { AppUser, TimeEntry } from '@/types';
import { andereVerteilung, durchrechnungsWochen, fallSchluessel, grenzfaelle, montagVon, type Grenzfall } from './arbeitszeitGrenzen';

function plusTage(iso: string, n: number): string {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

export interface GrenzStand {
  faelle: Array<{ person: AppUser; fall: Grenzfall }>;
  begruendungen: Map<string, Begruendung>;
  eintraege: WithId<TimeEntry>[];
}

/** Was die Karte, der Streifen und das Seitenfenster aus EINER Prüfung lesen. */
export interface GrenzDaten {
  /** `null`, solange geprüft wird. */
  stand: GrenzStand | null;
  fehler: string | null;
  /** Neu prüfen (nach einer Begründung, oder „Erneut versuchen“). */
  laden: () => Promise<void>;
  /** Wie viele Fälle: Jugendschutz, AZG, davon ohne Begründung. */
  zaehlung: { kjbg: number; azg: number; offen: number };
}

/**
 * Die Zählung in Worten — im Kopf der Karte:
 * „1 Verstoß Jugendschutz · 2 ohne Begründung“, „alle begründet“, sonst leer.
 */
export function grenzZusatz(z: GrenzDaten['zaehlung']): string {
  return [
    z.kjbg > 0 && (z.kjbg === 1 ? '1 Verstoß Jugendschutz' : `${z.kjbg} Verstöße Jugendschutz`),
    z.azg > 0 && (z.offen > 0 ? `${z.offen} ohne Begründung` : 'alle begründet'),
  ]
    .filter(Boolean)
    .join(' · ');
}

/**
 * DIE PRÜFUNG DER ARBEITSZEITGRENZEN EINES MONATS — als Hook (Runde 4).
 *
 * Bis Runde 4 lud die Karte „Arbeitszeitgrenzen“ ihre Fälle selbst. Seit der
 * Streifen einen Grenzfall am Tag zeigt (`.st-grenze`) und das Seitenfenster
 * die Fälle der Person nennt, braucht die
 * SEITE dieselben Fälle. Geladen wird trotzdem nur EINMAL: die Seite ruft
 * diesen Hook und reicht das Ergebnis an Karte und Seitenfenster weiter. Die
 * Ladelogik ist unverändert aus der Karte herübergehoben.
 *
 * EIGENE ABFRAGE STATT DER GELADENEN JAHRESZEITEN: die Woche am Monatsrand,
 * die Ruhezeit am Ersten und der Montag nach dem letzten Sonntag liegen
 * ausserhalb des Monats — und um den Jahreswechsel ausserhalb des Jahres.
 *
 * NACH EINER BUCHUNG NEU GEPRÜFT (Runde 3, G12): `aktualisiert` ist der
 * Stand der Buchungen, den die Seite ohnehin live hält. Ändert er sich, prüft
 * der Hook still neu — ohne „Wird geprüft …“ dazwischen.
 */
export function useArbeitszeitGrenzen({
  companyId,
  personen,
  jahr,
  monat,
  aktualisiert,
  aus = false,
  durchrechnungWochen,
}: {
  companyId: string;
  personen: AppUser[];
  jahr: number;
  /** 0-basiert, wie in der Mitarbeiterübersicht. */
  monat: number;
  /** Ein Schlüssel für den Stand der Buchungen — ändert er sich, wird neu geprüft. Leer: noch nicht geladen. */
  aktualisiert?: string;
  /** Gar nicht prüfen (Supportzugang: Zeitbuchungen sind dort verschlossen). */
  aus?: boolean;
  /** Durchrechnungszeitraum des Betriebs in Wochen (`company.durchrechnungWochen`); ohne: 17. */
  durchrechnungWochen?: number;
}): GrenzDaten {
  const wochen = durchrechnungsWochen(durchrechnungWochen);
  const von = `${jahr}-${String(monat + 1).padStart(2, '0')}-01`;
  const bis = new Date(Date.UTC(jahr, monat + 1, 0)).toISOString().slice(0, 10);

  const [stand, setStand] = useState<GrenzStand | null>(null);
  const [fehler, setFehler] = useState<string | null>(null);
  // Eine ältere Antwort darf eine neuere nicht überschreiben (Monat schnell gewechselt).
  const lauf = useRef(0);

  const laden = useCallback(async () => {
    const meiner = ++lauf.current;
    setFehler(null);
    try {
      /*
        DER VORLAUF FÜR DEN DURCHSCHNITT: die 16 Wochen (oder der längere Zeitraum
        des Betriebs, bis 51) vor der ersten Woche
        des Monats, nur mit den Spalten der Arbeitszeit. Die Buchungen rund
        um den Monat bleiben die vollen Zeilen — an ihnen hängen
        „Buchung korrigieren“ und der Tagesnachweis.
      */
      const vorlaufAb = plusTage(montagVon(von), -7 * (wochen - 1));
      const [eintraege, vorlauf, geburtsdaten, begruendungen] = await Promise.all([
        listEntriesInRange(companyId, plusTage(von, -7), plusTage(bis, 7)),
        listArbeitszeitenInRange(companyId, vorlaufAb, plusTage(von, -8)),
        listGeburtsdaten(companyId),
        listBegruendungen(companyId, montagVon(von), bis),
      ]);
      // Was nach heute liegt, ist noch nicht gearbeitet (Runde 3, M1).
      const heute = todayStr();
      const faelle = personen.flatMap((person) =>
        grenzfaelle(
          [...vorlauf, ...eintraege].filter((e) => e.userId === person.uid),
          { von, bis },
          {
            geburtsdatum: geburtsdaten.get(person.uid) ?? null,
            schultagMin: (tag) => tagessollStunden(person, tag) * 60,
            andereVerteilung: andereVerteilung(person),
            arbeitstageJeWoche: person.workDays?.length || undefined,
          },
          { stichtag: heute, durchrechnungWochen: wochen },
        ).map((fall) => ({ person, fall })),
      );
      if (meiner !== lauf.current) return;
      setStand({
        faelle,
        begruendungen: new Map(begruendungen.map((b) => [fallSchluessel(b.userId, b), b])),
        eintraege,
      });
    } catch (e) {
      if (meiner !== lauf.current) return;
      setFehler(e instanceof Error ? e.message : String(e));
    }
  }, [companyId, personen, von, bis, wochen]);

  /*
    EIN EFFEKT FÜR BEIDE ANLÄSSE. Ein neuer Monat (oder Betrieb, oder eine
    andere Belegschaft) zeigt „Wird geprüft …“; ein neuer Stand der Buchungen
    prüft still nach. Der erste Stand nach dem Laden der Seite ist keine
    Änderung — sonst prüfte die Karte beim Öffnen zweimal.
  */
  const vorher = useRef<{ laden: typeof laden; aktualisiert: string | undefined } | null>(null);
  useEffect(() => {
    if (aus) return;
    const v = vorher.current;
    vorher.current = { laden, aktualisiert };
    if (v && v.laden === laden) {
      if (v.aktualisiert === undefined || v.aktualisiert === aktualisiert) return;
    } else {
      setStand(null);
    }
    void laden();
  }, [laden, aktualisiert, aus]);

  const zaehlung = useMemo(() => {
    if (!stand) return { kjbg: 0, azg: 0, offen: 0 };
    const kjbg = stand.faelle.filter(({ fall }) => fall.jugendlich).length;
    const offen = stand.faelle.filter(
      ({ person, fall }) => !fall.jugendlich && !stand.begruendungen.has(fallSchluessel(person.uid, fall)),
    ).length;
    return { kjbg, azg: stand.faelle.length - kjbg, offen };
  }, [stand]);

  return { stand, fehler, laden, zaehlung };
}
