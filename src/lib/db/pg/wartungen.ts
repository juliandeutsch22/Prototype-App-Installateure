/**
 * Wiederkehrende Wartungen — auf Postgres.
 *
 * Die Tabelle bleibt klein: eine Vereinbarung je Anlage, nicht je Termin. Ein
 * Betrieb mit dreihundert gewarteten Thermen hat dreihundert Zeilen, und zwar
 * dauerhaft — die Ausführungen wachsen nicht mit, sie rücken den Termin nur
 * weiter.
 */
import type { Wartung } from '@/types';
import { naechsterTermin } from '@/features/maintenance/wartungsplan';
import { abfragen, anlegen, aendern, loeschen, type WithId } from './kern';
import { oderUeberSpalten } from './suche';

const WARTUNGEN = 'wartungen';

/**
 * Alle Vereinbarungen, nach Termin.
 *
 * Sortiert nach `faelligAm` statt nach Name: diese Liste beantwortet „was
 * kommt", nicht „wo steht Huber". Zum Nachschlagen gibt es die Suche in der
 * Ansicht.
 */
export function listWartungen(companyId: string, max = 500) {
  return abfragen<Wartung>(WARTUNGEN, companyId, {
    sortiere: { feld: 'faelligAm' },
    grenze: max,
  });
}

/**
 * Was bis zu einem Stichtag fällig ist.
 *
 * HIER VERSCHWINDET EIN NACHFILTER, UND SEIN GRUND GLEICH MIT. In Firestore
 * lief der Ruht-Filter im Browser, weil eine Abfrage Dokumente nicht findet,
 * denen das Feld ganz fehlt: eine Vereinbarung ohne `aktiv` wäre
 * stillschweigend aus der Liste der fälligen Wartungen verschwunden, und das
 * ist der eine Fall, in dem Schweigen teuer ist.
 *
 * Eine Spalte kann nicht fehlen. `aktiv` trägt `not null default true`, also
 * gehört die Bedingung in die Abfrage — und damit greift die Obergrenze
 * endlich auf die richtige Menge statt auf eine, aus der danach noch etwas
 * herausfällt.
 */
export function listFaelligeWartungen(companyId: string, bis: string, max = 200) {
  return abfragen<Wartung>(WARTUNGEN, companyId, {
    wo: [
      { art: 'bis', feld: 'faelligAm', wert: bis },
      { art: 'gleich', feld: 'aktiv', wert: true },
    ],
    sortiere: { feld: 'faelligAm' },
    grenze: max,
  });
}

/** Die Vereinbarungen EINES Kunden — für die Kundenakte. */
export function listWartungenForCustomer(companyId: string, customerId: string, max = 100) {
  return abfragen<Wartung>(WARTUNGEN, companyId, {
    wo: [{ art: 'gleich', feld: 'customerId', wert: customerId }],
    grenze: max,
  });
}

export type NewWartung = Omit<Wartung, 'id' | 'companyId' | 'createdAt' | 'updatedAt'>;

export function createWartung(companyId: string, w: NewWartung): Promise<string> {
  return anlegen(WARTUNGEN, companyId, w);
}

export function updateWartung(id: string, data: Partial<NewWartung>): Promise<void> {
  return aendern(WARTUNGEN, id, data);
}

export function deleteWartung(id: string): Promise<void> {
  return loeschen(WARTUNGEN, id);
}

/**
 * Eine Wartung als erledigt eintragen — und damit den nächsten Termin setzen.
 *
 * DAS IST DER SCHRITT, AN DEM DIE VEREINBARUNG LEBT. Ohne ihn wäre die Liste
 * nach dem ersten Frühjahr eine Sammlung überfälliger Zeilen, die niemand
 * mehr ernst nimmt. Beides geschieht in EINEM Schreibvorgang: ein Zustand
 * „gewartet, aber ohne nächsten Termin" darf nicht entstehen.
 *
 * Das Intervall wird MITGEGEBEN, nicht aus der Zeile nachgelesen. Wer beim
 * Eintragen der erledigten Wartung zugleich das Intervall ändert (aus zwei
 * Jahren wird eines), erwartet, dass der neue Termin schon danach rechnet.
 */
export async function wartungErledigt(
  id: string,
  args: { erledigtAm: string; intervallMonate: number; projectNumber?: string },
): Promise<void> {
  /*
    `async`, obwohl der Rumpf nur weiterreicht: ein unbrauchbares Intervall
    lässt `naechsterTermin` werfen, und zwar SYNCHRON. Ohne `async` käme der
    Fehler nicht als abgelehntes Versprechen zurück, sondern flöge an jedem
    `.catch()` vorbei — ein Aufrufer, der nicht `await` benutzt, sähe einen
    Absturz statt einer Meldung.
  */
  /*
    Über `aendern` und nicht über `updateWartung`: `offeneBaustelle` wird hier
    auf `null` gesetzt, und der Typ der Wartung kennt für dieses Feld nur
    „ein Text" oder „nicht da". Ein Cast, um das zu verstecken, hiesse den
    Typprüfer zu belügen; der Weg an der getippten Fassade vorbei sagt
    stattdessen genau, was passiert.
  */
  return aendern(WARTUNGEN, id, {
    zuletztAm: args.erledigtAm,
    faelligAm: naechsterTermin(args.erledigtAm, args.intervallMonate),
    intervallMonate: args.intervallMonate,
    letzteBaustelle: args.projectNumber,
    /*
      Die eingeplante Baustelle ist mit dem Eintrag GEWESEN — sie wandert nach
      `letzteBaustelle` und wird hier geleert, im selben Schreibvorgang.
      Bliebe sie stehen, zeigte die Liste die Wartung bis zum nächsten Termin
      als „eingeplant", obwohl der Einsatz vorbei ist; beim nächsten Mal führe
      der Monteur auf eine abgeschlossene Baustelle.

      `null` statt Leerstring: in Firestore stand dort '', weil die Sammlung
      kein Löschen eines Felds kannte. Eine Spalte kann leer sein — dieselbe
      Aussage ohne Behelf.
    */
    offeneBaustelle: null,
  });
}

/**
 * Die Baustelle vormerken, die für die anstehende Wartung angelegt wurde.
 *
 * Getrennt von `wartungErledigt`, weil es der Schritt DAVOR ist: hier ist noch
 * nichts gewartet, es steht nur fest, wohin gefahren wird. Wer beides in eine
 * Funktion legte, müsste beim Anlegen schon ein Ausführungsdatum erfinden —
 * und der nächste Termin rückte, bevor jemand da war.
 */
export function wartungEingeplant(id: string, projectNumber: string): Promise<void> {
  return updateWartung(id, { offeneBaustelle: projectNumber.trim() });
}

/**
 * Wartungen suchen — serverseitig, mit Treffern in der Wortmitte.
 *
 * Die Wartungen sind das Einzige im Bestand, das in die ZUKUNFT zeigt:
 * welche Anlage wann wieder fällig wird. Eine, die sich nicht finden lässt,
 * ist ein verlorener Auftrag und nicht nur eine unbequeme Liste.
 */
export function searchWartungen(
  companyId: string, begriff: string, max = 500,
): Promise<WithId<Wartung>[]> {
  return abfragen<Wartung>(WARTUNGEN, companyId, {
    oder: oderUeberSpalten(['customer_name', 'anlage', 'address'], begriff),
    sortiere: { feld: 'faelligAm' },
    grenze: max,
  });
}
