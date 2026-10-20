import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { arbeitszeitVorlauf, listEntriesInRange } from '@/lib/db/timeEntries';
import { listBegruendungen, listGeburtsdaten, type Begruendung } from '@/lib/db/arbeitszeitGrenzen';
import { tagessollStunden, todayStr } from '@/lib/time';
import type { WithId } from '@/lib/db/core';
import type { AppUser, TimeEntry } from '@/types';
import { andereVerteilung, durchrechnungsWochen, fallSchluessel, grenzfaelle, montagVon, type GrenzEintrag, type Grenzfall } from './arbeitszeitGrenzen';

/** So viele Personen prüft die Karte, bevor sie den Browser zeichnen lässt. */
const HAEPPCHEN = 10;

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
  eintraegeDerSeite,
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
  /**
   * Die Buchungen, die die Seite ohnehin live hält — mindestens der Monat
   * samt einer Woche davor und danach (Ladezeit, 19.10.2026). Dann holt die
   * Karte sie nicht ein zweites Mal; ohne Angabe wie bisher selbst.
   */
  eintraegeDerSeite?: WithId<TimeEntry>[];
}): GrenzDaten {
  const wochen = durchrechnungsWochen(durchrechnungWochen);
  const von = `${jahr}-${String(monat + 1).padStart(2, '0')}-01`;
  const bis = new Date(Date.UTC(jahr, monat + 1, 0)).toISOString().slice(0, 10);

  const [stand, setStand] = useState<GrenzStand | null>(null);
  const [fehler, setFehler] = useState<string | null>(null);
  // Eine ältere Antwort darf eine neuere nicht überschreiben (Monat schnell gewechselt).
  const lauf = useRef(0);
  // Über eine Referenz: der Stand der Buchungen löst das Prüfen schon über `aktualisiert` aus.
  const seitenEintraege = useRef(eintraegeDerSeite);
  seitenEintraege.current = eintraegeDerSeite;

  const laden = useCallback(async () => {
    const meiner = ++lauf.current;
    setFehler(null);
    try {
      /*
        DER VORLAUF FÜR DEN DURCHSCHNITT: die 16 Wochen (oder der längere Zeitraum
        des Betriebs, bis 51) vor der ersten Woche
        des Monats, je Person und Tag verdichtet (`arbeitszeitVorlauf`). Er
        zählt nur in den Durchschnitt: Tag, Woche und Ruhezeit des Monats
        rechnen mit den Buchungen ab einer Woche davor. Die Buchungen rund
        um den Monat bleiben die vollen Zeilen — an ihnen hängen
        „Buchung korrigieren“ und der Tagesnachweis.
      */
      const vorlaufAb = plusTage(montagVon(von), -7 * (wochen - 1));
      const ab = plusTage(von, -7);
      const bisMit = plusTage(bis, 7);
      const vonDerSeite = seitenEintraege.current;
      const [eintraege, vorlauf, geburtsdaten, begruendungen] = await Promise.all([
        vonDerSeite
          ? Promise.resolve(vonDerSeite.filter((e) => e.date >= ab && e.date <= bisMit))
          : listEntriesInRange(companyId, ab, bisMit),
        arbeitszeitVorlauf(companyId, vorlaufAb, plusTage(von, -8)),
        listGeburtsdaten(companyId),
        listBegruendungen(companyId, montagVon(von), bis),
      ]);
      // Was nach heute liegt, ist noch nicht gearbeitet (Runde 3, M1).
      const heute = todayStr();
      // Einmal nach Person geordnet: je Person über alle gefiltert wuchs mit Belegschaft MAL Buchungen (Ladezeit, 19.10.2026).
      const jePerson = new Map<string, GrenzEintrag[]>();
      for (const e of [...vorlauf, ...eintraege]) {
        const l = jePerson.get(e.userId);
        if (l) l.push(e);
        else jePerson.set(e.userId, [e]);
      }
      /*
        IN HÄPPCHEN ZU ZEHN PERSONEN (Nachweis mit dreifachem Bestand,
        19.10.2026): bei 75 Leuten rechnete die Prüfung am Stück eine halbe
        Sekunde auf dem Handy, und so lange konnte die Liste nicht zeichnen.
        Dazwischen kommt der Browser zum Zug; das Ergebnis ist dasselbe.
      */
      const faelle: GrenzStand['faelle'] = [];
      for (let i = 0; i < personen.length; i += HAEPPCHEN) {
        if (i > 0) {
          await new Promise((weiter) => setTimeout(weiter, 0));
          if (meiner !== lauf.current) return;
        }
        for (const person of personen.slice(i, i + HAEPPCHEN)) {
          for (const fall of grenzfaelle(
            jePerson.get(person.uid) ?? [],
            { von, bis },
            {
              geburtsdatum: geburtsdaten.get(person.uid) ?? null,
              schultagMin: (tag) => tagessollStunden(person, tag) * 60,
              andereVerteilung: andereVerteilung(person),
              arbeitstageJeWoche: person.workDays?.length || undefined,
            },
            { stichtag: heute, durchrechnungWochen: wochen },
          )) faelle.push({ person, fall });
        }
      }
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
