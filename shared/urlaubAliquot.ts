/**
 * Aliquoter Urlaubsanspruch — eine Rechnung für zwei Fragen.
 *
 * 1. Wie viel Anspruch hat jemand, der mitten im Urlaubsjahr eintritt?
 *    (`aliquoterAnspruch` in der Benutzeranlage)
 * 2. Um wie viel sinkt der Anspruch durch einen längeren unbezahlten Urlaub?
 *    (`kuerzungsVorschlag`, Plan 10.3)
 *
 * Beide Male: Jahresanspruch × Kalendertage ÷ Tage des Urlaubsjahres, auf
 * zwei Stellen. Stünde die Formel zweimal, rundete sie nach der ersten
 * Änderung an einer Stelle anders als an der anderen.
 */

/** Kalendertage von `von` bis ausschließlich `bis` (ISO-Daten, ohne Zeitzone). */
export function tageZwischen(von: string, bis: string): number {
  const utc = (iso: string) => Date.UTC(Number(iso.slice(0, 4)), Number(iso.slice(5, 7)) - 1, Number(iso.slice(8, 10)));
  return Math.round((utc(bis) - utc(von)) / 86_400_000);
}

/** Jahresanspruch × Tage ÷ Tage des Jahres, auf zwei Stellen. */
export function aliquot(jahresanspruch: number, tage: number, jahresTage: number): number {
  if (jahresTage <= 0) return 0;
  return Math.round(((jahresanspruch * tage) / jahresTage) * 100) / 100;
}

/** Das Urlaubsjahr eines Datums, benannt nach dem Kalenderjahr seines Beginns. */
function urlaubsjahrVon(iso: string, beginn: string): number {
  const jahr = Number(iso.slice(0, 4));
  return iso.slice(5, 10) >= beginn ? jahr : jahr - 1;
}

/** Ein ISO-Datum plus `n` Tage. */
function plusTage(iso: string, n: number): string {
  const d = new Date(Date.UTC(Number(iso.slice(0, 4)), Number(iso.slice(5, 7)) - 1, Number(iso.slice(8, 10)) + n));
  return d.toISOString().slice(0, 10);
}

export interface KuerzungsTeil {
  urlaubsjahr: number;
  /** Kalendertage des Zeitraums in diesem Urlaubsjahr. */
  kalendertage: number;
  /** Tage dieses Urlaubsjahres (365 oder 366). */
  jahresTage: number;
  /** Vorschlag: um so viele Tage sinkt der Anspruch (positiv). */
  tage: number;
}

/**
 * DIE KÜRZUNG DURCH EINEN UNBEZAHLTEN URLAUB, je Urlaubsjahr.
 *
 * Über einen Jahreswechsel des Urlaubsjahres hinweg trifft jedes Jahr nur
 * sein Teil — der Dezember gehört zum alten, der Jänner zum neuen.
 *
 * @param von erster Tag (einschließlich)
 * @param bis letzter Tag (einschließlich)
 * @param beginn 'MM-DD', an dem das Urlaubsjahr beginnt
 */
export function kuerzungsVorschlag(
  jahresanspruch: number,
  von: string,
  bis: string,
  beginn = '01-01',
): KuerzungsTeil[] {
  if (bis < von) return [];
  const teile: KuerzungsTeil[] = [];
  let ab = von;
  while (ab <= bis) {
    const jahr = urlaubsjahrVon(ab, beginn);
    const naechster = `${jahr + 1}-${beginn}`;
    const ende = plusTage(bis, 1) < naechster ? plusTage(bis, 1) : naechster;
    const kalendertage = tageZwischen(ab, ende);
    const jahresTage = tageZwischen(`${jahr}-${beginn}`, naechster);
    teile.push({ urlaubsjahr: jahr, kalendertage, jahresTage, tage: aliquot(jahresanspruch, kalendertage, jahresTage) });
    ab = ende;
  }
  return teile;
}
