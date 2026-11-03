/*
  DAS LOT DER NAVIGATION IN BEWEGUNG (Auftrag 03.11.2026: „der Senklot sollte
  sich immer von oben mit dem Seil zu dem jeweiligen Menüpunkt runter bzw.
  rauf lassen … smooth, nicht ruckelig“). Hier steht nur die Rechnung —
  Dauer und Verlauf —, damit sie ohne Browser prüfbar ist; das Messen und
  Abspielen macht `app/NaviLot.tsx`.
*/

/**
 * Die Dauer einer Fahrt nach ihrer Strecke: der Nachbarpunkt in etwa 200 ms,
 * von „Start“ bis ganz unten höchstens 450 ms. Kurze Wege wirken so nie
 * träge, lange nie hektisch.
 */
export function fahrtDauer(strecke: number): number {
  return Math.round(Math.min(450, Math.max(200, 160 + Math.abs(strecke) * 0.75)));
}

/** Wie weit das Blei beim Herablassen ins Seil nachfedert: höchstens 3 px, bei kurzen Wegen weniger. */
export function nachfedern(strecke: number): number {
  return strecke > 0 ? Math.min(3, strecke / 8) : 0;
}

/** Ein Schritt der Seillänge, so wie `Element.animate` ihn nimmt. */
export interface SeilSchritt {
  laenge: number;
  offset?: number;
  easing?: string;
}

/**
 * Der Verlauf der Seillänge von `von` nach `nach` (in Pixeln ab der
 * Aufhängung). Herab: zügig, weich gebremst, dann 2–3 px ins Seil und zurück.
 * Herauf: eingeholt, gleichmäßig gebremst, ohne Überschwingen — ein
 * hochgezogenes Lot schwingt nicht über.
 */
export function seilVerlauf(von: number, nach: number): SeilSchritt[] {
  const feder = nachfedern(nach - von);
  if (feder === 0) {
    return [
      { laenge: von, easing: 'cubic-bezier(0.4, 0, 0.2, 1)' },
      { laenge: nach },
    ];
  }
  return [
    { laenge: von, offset: 0, easing: 'cubic-bezier(0.3, 0, 0.25, 1)' },
    { laenge: nach + feder, offset: 0.8, easing: 'cubic-bezier(0.4, 0, 0.6, 1)' },
    { laenge: nach, offset: 1 },
  ];
}
