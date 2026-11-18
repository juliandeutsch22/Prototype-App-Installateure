/*
  „NICHT VERRECHNETE LEISTUNG“ UND „MAHNLAUF“ ZUGEKLAPPT (E98, 18.11.2026):
  „die nehmen extrem viel Platz weg“ — mit sechs Baustellen und fünf
  Mahnungen standen über der Rechnungsliste zwei Bildschirmhöhen. Zugeklappt
  bleibt je Karte eine Zeile mit dem Wichtigsten (wie viele, wie alt, wie
  viel offen). Wer eine aufklappt, findet sie beim nächsten Mal so wieder —
  je Person auf diesem Gerät, wie die Ablage der Planung (E96). Eine Ansicht,
  keine Angabe über die Person: deshalb im Speicher des Browsers. Ohne
  Speicher (privates Fenster) beginnen beide zugeklappt.
*/
export type ArbeitsKarte = 'unverrechnet' | 'mahnlauf';

const schluessel = (karte: ArbeitsKarte, uid: string) => `senklot.rechnungen.offen.${karte}.${uid}`;

export function arbeitOffenLesen(karte: ArbeitsKarte, uid: string): boolean {
  try {
    return window.localStorage.getItem(schluessel(karte, uid)) === '1';
  } catch {
    return false;
  }
}

export function arbeitOffenMerken(karte: ArbeitsKarte, uid: string, offen: boolean): void {
  try {
    if (offen) window.localStorage.setItem(schluessel(karte, uid), '1');
    else window.localStorage.removeItem(schluessel(karte, uid));
  } catch {
    // Kein Speicher: dann gilt es nur bis zum nächsten Öffnen.
  }
}

/** `?zeige=…` — ein Weg von außen (Startseite), der genau diese Karte offen sehen will. */
export function zeigeAusAdresse(wert: string | null): ArbeitsKarte | null {
  return wert === 'unverrechnet' || wert === 'mahnlauf' ? wert : null;
}
