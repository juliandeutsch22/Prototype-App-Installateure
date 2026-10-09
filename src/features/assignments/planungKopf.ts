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

/**
 * „2026-W41“ — die Woche eines Tages als Adresse (`?woche=`, Runde 4). Das
 * Jahr ist das der Kalenderwoche, nicht des Tages: der 31.12.2024 liegt in
 * „2025-W01“. Sonst zeigte ein Lesezeichen um den Jahreswechsel die falsche
 * Woche.
 */
export function kwSchluessel(iso: string): string {
  const donnerstag = wocheAb(montagDer(iso))[3];
  return `${donnerstag.slice(0, 4)}-W${String(kalenderwoche(iso)).padStart(2, '0')}`;
}

/** Der Montag zu „2026-W41“ — oder `null`, wenn die Angabe keine Woche ist. */
export function montagAusKw(schluessel: string | null): string | null {
  const m = /^(\d{4})-W(\d{2})$/.exec(schluessel ?? '');
  if (!m) return null;
  const nr = Number(m[2]);
  if (nr < 1 || nr > 53) return null;
  // Die erste Woche ist die mit dem 4. Jänner (ISO 8601).
  const erste = new Date(`${montagDer(`${m[1]}-01-04`)}T00:00:00`);
  erste.setDate(erste.getDate() + (nr - 1) * 7);
  const montag = lokalesDatum(erste);
  // „2026-W53“ gibt es nicht: die Woche läge schon im nächsten Jahr.
  return kwSchluessel(montag) === `${m[1]}-W${m[2]}` ? montag : null;
}
