import { REAKTIONEN, REAKTION_NAME, type Nachricht, type Reaktion, type Reaktionszeichen } from '@/lib/db/nachrichten';

/**
 * REAKTIONEN AUF EINE NACHRICHT (E77, 11.11.2026) — was die Oberfläche
 * daraus macht, ohne den Server zu fragen.
 *
 * Gesetzt wird sofort im eigenen Verlauf (`mitReaktion`), der Server
 * bestätigt im Hintergrund; der neu geladene Verlauf ersetzt die eigene
 * Fassung. Wer reagiert hat, heißt für einen selbst „Du“ — wie überall im
 * Gespräch.
 */

/** Die eigene Reaktion setzen oder zurücknehmen — als neue Nachricht, die alte bleibt unberührt. */
export function mitReaktion(n: Nachricht, zeichen: Reaktionszeichen, an: boolean, ich: { uid: string; name: string }): Nachricht {
  const alt = n.reaktionen.find((r) => r.zeichen === zeichen);
  if (an === !!alt?.meine) return n;
  let reaktionen: Reaktion[];
  if (an) {
    const neu: Reaktion = alt
      ? { ...alt, anzahl: alt.anzahl + 1, meine: true, personen: [{ uid: ich.uid, name: ich.name }, ...alt.personen] }
      : { zeichen, anzahl: 1, meine: true, personen: [{ uid: ich.uid, name: ich.name }] };
    reaktionen = alt ? n.reaktionen.map((r) => (r === alt ? neu : r)) : [...n.reaktionen, neu];
  } else {
    reaktionen = n.reaktionen.flatMap((r) => {
      if (r !== alt) return [r];
      if (r.anzahl <= 1) return [];
      return [{ ...r, anzahl: r.anzahl - 1, meine: false, personen: r.personen.filter((p) => p.uid !== ich.uid) }];
    });
  }
  // Immer in der Reihenfolge der Leiste, wie der Server sie liefert.
  reaktionen.sort((a, b) => REAKTIONEN.indexOf(a.zeichen) - REAKTIONEN.indexOf(b.zeichen));
  return { ...n, reaktionen };
}

/** „Du, Lena Pichler“ — die eigene Person zuerst und als „Du“. */
export function wer(r: Reaktion, ichUid: string | undefined): string {
  const namen = r.personen.map((p) => (p.uid === ichUid ? 'Du' : p.name || 'Gelöschtes Konto'));
  const fehlen = r.anzahl - r.personen.length;
  return fehlen > 0 ? [...namen, `${fehlen} weitere`].join(', ') : namen.join(', ');
}

/** Für die Vorlesehilfe: „Daumen hoch, 2: Du, Lena Pichler“. */
export function reaktionText(r: Reaktion, ichUid: string | undefined): string {
  return `${REAKTION_NAME[r.zeichen]}, ${r.anzahl}: ${wer(r, ichUid)}`;
}
