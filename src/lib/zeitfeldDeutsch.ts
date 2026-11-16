/**
 * DATUM UND UHRZEIT DEUTSCH NEBEN DEM FELD (U10, Entscheidung E5 vom
 * 15.11.2026).
 *
 * Datums- und Zeitfelder behalten das Rad des Geräts — am Handy die beste
 * Eingabe. Das Feld selbst zeigt den Wert aber im Format des Geräts: auf
 * einem englisch eingestellten Telefon „11/15/2026“ und „07:00 AM“ — mitten
 * in einer deutschen App, und „11/12“ ist dort der 12. November. Die Form
 * des Felds lässt sich nicht ändern (der Browser zeichnet es); deshalb steht
 * der Wert darunter deutsch: TT.MM.JJJJ, HH:MM.
 *
 * Nur, wo das Gerät nicht deutsch zeichnet: auf einem deutschen Gerät stünde
 * derselbe Wert zweimal da.
 */
export type Zeitfeldtyp = 'date' | 'time' | 'datetime-local' | 'month';

export function istZeitfeld(typ: unknown): typ is Zeitfeldtyp {
  return typ === 'date' || typ === 'time' || typ === 'datetime-local' || typ === 'month';
}

/** Der Wert eines Datums- oder Zeitfelds (ISO) als deutscher Text — leer, wenn nichts Lesbares drinsteht. */
export function zeitfeldDeutsch(wert: string, typ: Zeitfeldtyp): string {
  const v = wert.trim();
  if (!v) return '';
  if (typ === 'time') {
    const m = /^(\d{2}):(\d{2})/.exec(v);
    return m ? `${m[1]}:${m[2]}` : '';
  }
  if (typ === 'month') {
    const m = /^(\d{4})-(\d{2})$/.exec(v);
    return m ? `${m[2]}.${m[1]}` : '';
  }
  const m = /^(\d{4})-(\d{2})-(\d{2})(?:T(\d{2}):(\d{2}))?/.exec(v);
  if (!m) return '';
  const tag = `${m[3]}.${m[2]}.${m[1]}`;
  return typ === 'datetime-local' && m[4] ? `${tag}, ${m[4]}:${m[5]}` : tag;
}

/**
 * Zeichnet der Browser dieses Feld deutsch? Er nimmt dafür die Sprache seiner
 * Oberfläche — in Chrome dieselbe, die `navigator.language` nennt.
 *
 * GEFRAGT WIRD NACH DEM FORMAT, NICHT NACH DEM SPRACHKÜRZEL: ein englisch
 * eingestelltes Gerät in Großbritannien zeichnet die Uhrzeit wie wir
 * („07:05“), das Datum aber nicht („05/11/2026“) — dort steht nur unter dem
 * Datum eine Zeile. Ein Schweizer Gerät („de-CH“) zeichnet beides deutsch.
 */
export function geraetZeigtDeutsch(
  typ: Zeitfeldtyp,
  sprache: string | undefined = typeof navigator === 'undefined' ? undefined : navigator.language,
): boolean {
  if (!sprache) return true;
  const schluessel = `${sprache}|${typ}`;
  const gemerkt = formatGemerkt.get(schluessel);
  if (gemerkt !== undefined) return gemerkt;
  let deutsch = true;
  try {
    const probe = new Date(2026, 10, 5, 7, 5);
    const datum = new Intl.DateTimeFormat(sprache, { day: '2-digit', month: '2-digit', year: 'numeric' }).format(probe) === '05.11.2026';
    const zeit = new Intl.DateTimeFormat(sprache, { hour: '2-digit', minute: '2-digit' }).format(probe) === '07:05';
    deutsch = typ === 'time' ? zeit : typ === 'datetime-local' ? datum && zeit : datum;
  } catch {
    // Eine Sprache, die `Intl` nicht kennt: lieber keine zweite Zeile als eine geratene.
  }
  formatGemerkt.set(schluessel, deutsch);
  return deutsch;
}

/** Je Sprache und Feldart einmal gefragt — `InputField` zeichnet oft. */
const formatGemerkt = new Map<string, boolean>();
