/**
 * EINE ZAHLENEINGABE FÜR ALLE BETRÄGE UND MENGEN (Testbericht 30.09.2026, M15).
 *
 * Vorher las jede Maske selbst: `Number(text.replace(',', '.'))`. Aus
 * „7.500,50“ wurde damit „7.500.50“, also keine Zahl, also stillschweigend
 * 0,00 € — im Angebot, ohne ein Wort.
 *
 * DIE REGELN, wie man in Österreich schreibt:
 *  - „7500,50“ und „7500.50“: ein Trenner ist das Dezimalzeichen.
 *  - „7.500,50“ und „7,500.50“: beide Trenner — der letzte ist das
 *    Dezimalzeichen, der andere trennt Tausender (in Dreiergruppen).
 *  - „7.500.000“: mehrere gleiche Trenner sind Tausenderpunkte.
 *  - „7.500“ oder „7,500“: ein einzelner Trenner vor genau drei Ziffern ist
 *    UNEINDEUTIG — 7500 oder 7,5? Das wird gemeldet, nicht geraten.
 *  - Leerzeichen und Apostrophe als Tausendertrenner werden überlesen.
 *
 * Leer ist keine Zahl und kein Fehler: `{ wert: null, fehler: null }` — was
 * leer bedeutet, entscheidet das Feld.
 */
export interface ZahlGelesen {
  wert: number | null;
  fehler: string | null;
}

export function leseZahl(eingabe: string | number | null | undefined, optionen: { negativ?: boolean } = {}): ZahlGelesen {
  if (typeof eingabe === 'number') {
    return Number.isFinite(eingabe) ? { wert: eingabe, fehler: null } : { wert: null, fehler: 'Das ist keine Zahl.' };
  }
  let t = (eingabe ?? '').trim().replace(/[\s\u00a0\u202f']/g, '').replace(/^\u20ac|\u20ac$/g, '');
  if (t === '') return { wert: null, fehler: null };

  let vorzeichen = 1;
  if (t.startsWith('-') || t.startsWith('\u2212')) {
    if (!optionen.negativ) return { wert: null, fehler: 'Hier ist keine negative Zahl vorgesehen.' };
    vorzeichen = -1;
    t = t.slice(1);
  } else if (t.startsWith('+')) {
    t = t.slice(1);
  }
  if (!/^[\d.,]+$/.test(t) || !/\d/.test(t)) {
    return { wert: null, fehler: `„${eingabe}“ ist keine Zahl.` };
  }

  const punkte = (t.match(/\./g) ?? []).length;
  const kommas = (t.match(/,/g) ?? []).length;
  let ganz: string;
  let dezimal = '';

  const tausender = (teil: string, trenner: string): string | null => {
    const gruppen = teil.split(trenner);
    if (gruppen.length === 1) return teil;
    if (gruppen[0] === '' || gruppen[0].length > 3 || gruppen.slice(1).some((g) => g.length !== 3)) return null;
    return gruppen.join('');
  };

  if (punkte > 0 && kommas > 0) {
    const letzter = Math.max(t.lastIndexOf('.'), t.lastIndexOf(','));
    const dez = t[letzter];
    const andere = dez === ',' ? '.' : ',';
    const vorne = t.slice(0, letzter);
    if (vorne.includes(dez)) return { wert: null, fehler: `„${eingabe}“ ist keine eindeutige Zahl.` };
    const g = tausender(vorne, andere);
    if (g === null) return { wert: null, fehler: `„${eingabe}“: die Tausenderpunkte stehen nicht in Dreiergruppen.` };
    ganz = g;
    dezimal = t.slice(letzter + 1);
  } else if (punkte + kommas === 0) {
    ganz = t;
  } else {
    const trenner = punkte > 0 ? '.' : ',';
    const anzahl = punkte + kommas;
    if (anzahl > 1) {
      const g = tausender(t, trenner);
      if (g === null) return { wert: null, fehler: `„${eingabe}“ ist keine eindeutige Zahl.` };
      ganz = g;
    } else {
      const [vorne, hinten] = t.split(trenner);
      if (hinten.length === 3 && vorne.length >= 1 && vorne.length <= 3 && vorne !== '0') {
        return {
          wert: null,
          fehler: `„${eingabe}“ ist nicht eindeutig: ${vorne}${hinten} oder ${vorne},${hinten}? Bitte ohne Tausenderpunkt schreiben, etwa ${vorne}${hinten} oder ${vorne},${hinten}.`,
        };
      }
      ganz = vorne === '' ? '0' : vorne;
      dezimal = hinten;
    }
  }

  const wert = Number(`${ganz}.${dezimal || '0'}`) * vorzeichen;
  if (!Number.isFinite(wert)) return { wert: null, fehler: `„${eingabe}“ ist keine Zahl.` };
  return { wert, fehler: null };
}

/** Kurzform, wo ein Fehler schon angezeigt wurde: die Zahl, sonst `ersatz`. */
export function zahlOder(eingabe: string | number | null | undefined, ersatz: number, optionen?: { negativ?: boolean }): number {
  return leseZahl(eingabe, optionen).wert ?? ersatz;
}

/** Eine Zahl so, wie man sie in ein Feld zurückschreibt: Komma, ohne Tausenderpunkt. */
export function zahlAlsText(n: number | null | undefined): string {
  if (n === null || n === undefined || !Number.isFinite(n)) return '';
  const text = String(n).replace('.', ',');
  // „1,125“ läse `leseZahl` als uneindeutig (1125 oder 1,125?) — „1,1250“ nicht.
  return /,\d{3}$/.test(text) ? `${text}0` : text;
}

/**
 * Vor dem Speichern: steht in einem Zahlenfeld dieses Bereichs etwas, das
 * sich nicht lesen lässt? Dann die Meldung (mit der Beschriftung des Feldes),
 * sonst `null`. Die Felder melden sich zwar selbst, halten aber bis zur
 * Korrektur die letzte lesbare Zahl — ohne diese Prüfung würde still die
 * alte gespeichert.
 */
export function unlesbareZahlIn(bereich: ParentNode | null | undefined): string | null {
  if (!bereich) return null;
  for (const feld of Array.from(bereich.querySelectorAll<HTMLInputElement>('input[data-zahl]'))) {
    const { fehler } = leseZahl(feld.value, { negativ: feld.dataset.zahl === 'negativ' });
    if (fehler) {
      const name = feld.labels?.[0]?.textContent?.trim() || feld.getAttribute('aria-label') || 'Zahl';
      feld.focus();
      return `${name}: ${fehler}`;
    }
  }
  return null;
}
