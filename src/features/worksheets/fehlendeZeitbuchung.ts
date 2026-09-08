import type { TimeEntry, WorkSheet } from '@/types';
import { normProjectNumber } from '@/lib/time';

/**
 * Stunden, die auf einem unterschriebenen Schein stehen und sonst nirgends.
 *
 * WARUM DER NACHTRAG IN DER ZEITERFASSUNG NICHT REICHT. Seit dem 08.09.2026
 * trägt der Monteur die Leistungszeit direkt auf dem Schein ein, und die
 * Zeiterfassung erinnert ihn danach daran, sie zu buchen. Dieser Hinweis
 * deckt aber nur SEINE EIGENEN Zeilen ab, und das ist keine Nachlässigkeit,
 * sondern eine Grenze, die so bleiben muss: ein Monteur darf fremde
 * Zeiteinträge weder lesen noch schreiben. In derselben Sammlung stehen
 * Kranken- und Urlaubstage der Kollegen — Gesundheitsdaten nach Art. 9
 * DSGVO. Die Firestore-Regeln lassen ihn deshalb nur an die eigenen, und das
 * ist richtig so.
 *
 * DIE LÜCKE, DIE DABEI ENTSTEHT. Ein Schein deckt die ganze Partie ab. Trägt
 * der Monteur die Zeile „Kollege Huber, 07:00–15:30" ein, hat diese Zeile
 * niemanden, der an sie erinnert wird: der Monteur sieht fremde Buchungen
 * nicht, und Huber sieht den Schein nicht, den ein anderer geschrieben hat.
 * Die Stunde steht unterschrieben beim Kunden — und wird nie gebucht.
 *
 * WAS DAS KOSTET, ZWEIMAL. Die Rechnung nimmt ihre Stunden aus den
 * ZEITEINTRÄGEN, nicht vom Schein; der Schein liefert nur das Material. Eine
 * ungebuchte Stunde wird also nie verrechnet — nicht „später korrigiert",
 * sondern nie. Und sie fehlt zugleich in der Arbeitszeitaufzeichnung, die
 * der Betrieb nach § 26 AZG zu führen hat: dort steht dann ein Tag, an dem
 * der Mann nachweislich beim Kunden war und laut Aufzeichnung nicht
 * gearbeitet hat.
 *
 * DESHALB EINE BÜROSICHT. Das Büro darf fremde Zeiteinträge sehen und
 * anlegen (`canEditTime`), der Monteur nicht. Die Liste gehört also dorthin,
 * wo jemand sie auch abarbeiten kann.
 *
 * ABGELEITET, NICHT GESPEICHERT — wie beim Nachtrag: es gibt kein Feld
 * „noch zu buchen", das jemand setzen und wieder löschen müsste. Der Befund
 * ergibt sich aus dem Vergleich und verschwindet von selbst, sobald der
 * Eintrag da ist.
 */

/**
 * Ab wann ein Schein hier auftaucht, in Tagen.
 *
 * Zwei. Gebucht wird am Ende des Arbeitstags, oft erst am Morgen darauf —
 * der Schein von heute oder gestern ist noch kein Befund, sondern der
 * Normalfall. Eine Liste, die den Normalfall meldet, wird nicht gelesen.
 *
 * Nach oben KEINE Grenze, anders als beim Nachtrag des Monteurs (vierzehn
 * Tage). Der Monteur soll an das erinnert werden, was er noch weiss; das
 * Büro muss auch den Schein von vor drei Monaten finden, denn genau der ist
 * der teure.
 */
export const OFFEN_AB_TAGEN = 2;

export interface FehlendeZeile {
  /** Der Name, wie er auf dem Schein steht. */
  name: string;
  /** Summe der Scheinminuten dieser Person auf diesem Schein. */
  minuten: number;
  /**
   * `keine` — an diesem Tag gar keine Anwesenheit gebucht. Die Stunden
   * fehlen vollständig: nicht verrechenbar, nicht aufgezeichnet.
   *
   * `andereBaustelle` — es gibt eine Buchung an diesem Tag, aber auf eine
   * andere Baustelle. Die Arbeitszeit ist damit aufgezeichnet; falsch ist
   * nur die Zuordnung, und die entscheidet, wem die Stunde verrechnet wird.
   */
  art: 'keine' | 'andereBaustelle';
  /** Bei `andereBaustelle`: worauf stattdessen gebucht wurde. */
  gebuchtAuf?: string[];
}

export interface ScheinOhneBuchung {
  schein: WorkSheet & { id: string };
  zeilen: FehlendeZeile[];
  /** Nur die Minuten der Art `keine` — das ist die Zeit, die nirgends steht. */
  minutenOhneBuchung: number;
  /** Tage seit dem Leistungsdatum. */
  tage: number;
}

/** Tage zwischen zwei ISO-Tagen, in UTC — ohne Sommerzeitfallen. */
function tageZwischen(vonIso: string, bisIso: string): number {
  const von = Date.parse(`${vonIso}T00:00:00Z`);
  const bis = Date.parse(`${bisIso}T00:00:00Z`);
  if (Number.isNaN(von) || Number.isNaN(bis)) return 0;
  return Math.round((bis - von) / 86_400_000);
}

/**
 * Namen vergleichbar machen.
 *
 * Der Schein trägt den Namen als TEXT — der Monteur tippt ihn auf der
 * Baustelle ein. Der Zeiteintrag trägt ihn aus dem Benutzerkonto. „Huber
 * Franz", „huber franz" und „Huber  Franz" sind derselbe Mann, und ein
 * Vergleich Zeichen für Zeichen meldete drei fehlende Buchungen, wo keine
 * fehlt.
 *
 * WAS DAMIT NICHT GEHT: „F. Huber" bleibt ein anderer Name als „Franz
 * Huber". Das ist eine bewusste Grenze — geraten wird hier nicht. Die
 * Ansicht sagt deshalb „keine Buchung gefunden", nicht „nicht gebucht", und
 * nennt den Namen so, wie er auf dem Schein steht.
 */
function normName(name: string): string {
  return name.trim().toLowerCase().replace(/\s+/g, ' ');
}

/**
 * Unterschriebene Scheine, deren Stunden in der Zeiterfassung fehlen.
 *
 * Der Abgleich läuft je PERSON und Tag, nicht je Schein: auf einem Schein
 * kann die Zeile des Monteurs gebucht sein und die des Kollegen nicht — und
 * genau das ist der häufige Fall.
 *
 * DIE MINUTEN WERDEN NICHT VERGLICHEN, nur ob überhaupt gebucht wurde. Sie
 * dürfen abweichen, und zwar regelmässig: der Schein bestätigt die Zeit beim
 * Kunden, der Eintrag umfasst den Arbeitstag samt Anfahrt und weiteren
 * Baustellen. Ein Wächter, der jede Abweichung meldet, schlüge ständig zu
 * Recht an — und wäre nach einer Woche weggeklickt.
 *
 * Nur `Anwesend` zählt als Buchung. Steht dort Urlaub oder Krankenstand,
 * während der Mann laut Schein beim Kunden war, ist die Arbeitszeit ebenso
 * wenig aufgezeichnet — der Widerspruch gehört gesehen, nicht überdeckt.
 */
export function scheineOhneBuchung(
  scheine: Array<WorkSheet & { id: string }>,
  eintraege: Array<Pick<TimeEntry, 'date' | 'status' | 'projectNumber' | 'userName'>>,
  heute: string,
  abTagen = OFFEN_AB_TAGEN,
): ScheinOhneBuchung[] {
  /* Wer an welchem Tag Anwesenheit gebucht hat — und auf welche Baustellen. */
  const gebucht = new Map<string, Set<string>>();
  for (const e of eintraege) {
    if (e.status !== 'Anwesend') continue;
    if (!e.userName) continue;
    const schluessel = `${e.date}|${normName(e.userName)}`;
    const orte = gebucht.get(schluessel) ?? new Set<string>();
    orte.add(normProjectNumber(e.projectNumber ?? ''));
    gebucht.set(schluessel, orte);
  }

  const befunde: ScheinOhneBuchung[] = [];

  for (const schein of scheine) {
    if (schein.status !== 'Unterschrieben') continue;
    const tage = tageZwischen(schein.datum, heute);
    if (tage < abTagen) continue;

    /* Mehrere Spannen desselben Manns sind eine Zeile — er bucht einmal. */
    const jePerson = new Map<string, { name: string; minuten: number }>();
    for (const z of schein.zeiten ?? []) {
      if (z.minuten <= 0) continue;
      const schluessel = normName(z.mitarbeiter);
      if (!schluessel) continue;
      const bisher = jePerson.get(schluessel);
      if (bisher) bisher.minuten += z.minuten;
      else jePerson.set(schluessel, { name: z.mitarbeiter.trim(), minuten: z.minuten });
    }
    if (jePerson.size === 0) continue;

    const ort = normProjectNumber(schein.projectNumber);
    const zeilen: FehlendeZeile[] = [];
    for (const [schluessel, person] of jePerson) {
      const orte = gebucht.get(`${schein.datum}|${schluessel}`);
      if (!orte) {
        zeilen.push({ name: person.name, minuten: person.minuten, art: 'keine' });
      } else if (!orte.has(ort)) {
        zeilen.push({
          name: person.name,
          minuten: person.minuten,
          art: 'andereBaustelle',
          // Leerer Eintrag heisst „ohne Baustelle gebucht" — das ist eine
          // Aussage, kein fehlender Wert, und gehört deshalb sichtbar.
          gebuchtAuf: [...orte].map((o) => o || 'ohne Baustelle').sort(),
        });
      }
    }
    if (zeilen.length === 0) continue;

    befunde.push({
      schein,
      zeilen,
      minutenOhneBuchung: zeilen
        .filter((z) => z.art === 'keine')
        .reduce((s, z) => s + z.minuten, 0),
      tage,
    });
  }

  /*
    ÄLTESTE ZUERST — das ist die Aussage. Ein Schein von vorgestern wird noch
    gebucht, einer von vor drei Monaten nicht mehr von selbst.
  */
  return befunde.sort((a, b) => b.tage - a.tage);
}

/** Wie viele Stunden auf diesen Scheinen nirgends gebucht sind, in Minuten. */
export function minutenOhneBuchung(befunde: ScheinOhneBuchung[]): number {
  return befunde.reduce((s, b) => s + b.minutenOhneBuchung, 0);
}
