import { lokalesDatum, montagDer, wocheAb } from './wochenplan';

/*
  DER KOPF DER PLANUNG (Linie „Lot“, Protokoll E2): groß, worüber man
  spricht — „Diese Woche“, „Nächste Woche“ —, klein die Kalenderwoche. Im
  Betrieb heißt es „nächste Woche“ und „KW 42“, nicht „12.10. – 18.10.“.
  Getrennt von der Ansicht, weil es für sich prüfbar ist; gerechnet wird
  lokal wie in `wochenplan.ts`.
*/

/** Die Kalenderwoche nach ISO 8601 (in Österreich üblich): die Woche mit dem Donnerstag. */
export function kalenderwoche(iso: string): number {
  const d = new Date(`${montagDer(iso)}T00:00:00`);
  d.setDate(d.getDate() + 3);
  const jahr = d.getFullYear();
  const ersterDonnerstag = new Date(`${montagDer(`${jahr}-01-04`)}T00:00:00`);
  ersterDonnerstag.setDate(ersterDonnerstag.getDate() + 3);
  const tage = Math.round((d.getTime() - ersterDonnerstag.getTime()) / 86_400_000);
  return 1 + Math.round(tage / 7);
}

function tagUndMonat(iso: string, mitJahr: boolean): string {
  return new Date(`${iso}T00:00:00`).toLocaleDateString('de-AT', {
    day: 'numeric',
    month: 'long',
    ...(mitJahr ? { year: 'numeric' } : {}),
  });
}

/** „31.08. – 06.09.“ — kurz, für die kleine Zeile. */
function spanneKurz(von: string, bis: string): string {
  const f = (iso: string) =>
    new Date(`${iso}T00:00:00`).toLocaleDateString('de-AT', { day: '2-digit', month: '2-digit' });
  return `${f(von)} – ${f(bis)}`;
}

/**
 * Titel und Unterzeile einer Woche ab `montag`, gesehen von `heute`.
 *
 * Die Jahreszahl steht nur, wenn die Woche nicht im laufenden Jahr liegt —
 * sonst wäre sie in jeder Zeile dieselbe Zahl, die niemand braucht.
 */
export function wochenTitel(montag: string, heute: string): { titel: string; klein: string } {
  const bis = wocheAb(montag)[6];
  const kw = `KW ${kalenderwoche(montag)}`;
  const abstand = Math.round(
    (new Date(`${montag}T00:00:00`).getTime() - new Date(`${montagDer(heute)}T00:00:00`).getTime()) /
      (7 * 86_400_000),
  );
  const relativ = abstand === 0 ? 'Diese Woche' : abstand === 1 ? 'Nächste Woche' : abstand === -1 ? 'Letzte Woche' : null;
  if (relativ) return { titel: relativ, klein: `${kw} · ${spanneKurz(montag, bis)}` };

  const jahrHeute = heute.slice(0, 4);
  const jahrVon = montag.slice(0, 4);
  const jahrBis = bis.slice(0, 4);
  const titel =
    jahrVon !== jahrBis
      ? `${tagUndMonat(montag, true)} – ${tagUndMonat(bis, true)}`
      : `${tagUndMonat(montag, false)} – ${tagUndMonat(bis, jahrBis !== jahrHeute)}`;
  return { titel, klein: kw };
}

/** „Oktober“, klein das Jahr. */
export function monatsTitel(jahr: number, monat: number): { titel: string; klein: string } {
  return {
    titel: new Date(jahr, monat, 1).toLocaleDateString('de-AT', { month: 'long' }),
    klein: String(jahr),
  };
}

/** Alle Tage eines Monats (`monat` ab 0), lokal gerechnet. */
export function monatsTage(jahr: number, monat: number): string[] {
  const letzter = new Date(jahr, monat + 1, 0).getDate();
  return Array.from({ length: letzter }, (_, i) => lokalesDatum(new Date(jahr, monat, i + 1)));
}
