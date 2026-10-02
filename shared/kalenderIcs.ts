/**
 * Die Einsätze einer Person als Kalenderdatei (iCalendar, RFC 5545) — für
 * das Kalender-Abo (Entscheidung vom 02.10.2026; aus offene Punkte E3).
 *
 * Gebaut wird in der Serverfunktion `kalender`; hier steht es, damit es
 * ohne Server geprüft werden kann.
 *
 * WAS IM KALENDER STEHT, steht auch in „Mein Einsatzplan“: Kunde und
 * Baustelle als Titel, die Adresse als Ort (Karten-Apps finden sie), in der
 * Notiz Rolle, Ansprechpartner mit Telefon und der Kommentar des Büros.
 *
 * UHRZEIT: mit „von“ und „bis“ ein Termin in Wiener Zeit, nur „von“ ein
 * Termin zu dieser Uhrzeit, ohne Uhrzeit oder nur mit „bis“ ein ganztägiger
 * Eintrag. Die Zeitzone steht mit in der Datei; sonst rechnete manche App in
 * UTC und alles stünde eine oder zwei Stunden daneben.
 */

export interface KalenderEinsatz {
  datum: string; // 'YYYY-MM-DD'
  baustelle: string;
  von?: string | null; // 'HH:MM'
  bis?: string | null;
  helfer?: boolean;
  kommentar?: string | null;
  kunde?: string | null;
  adresse?: string | null;
  ansprechpartner?: string | null;
  telefon?: string | null;
}

const ZEITZONE = [
  'BEGIN:VTIMEZONE',
  'TZID:Europe/Vienna',
  'BEGIN:DAYLIGHT',
  'TZOFFSETFROM:+0100',
  'TZOFFSETTO:+0200',
  'TZNAME:CEST',
  'DTSTART:19700329T020000',
  'RRULE:FREQ=YEARLY;BYMONTH=3;BYDAY=-1SU',
  'END:DAYLIGHT',
  'BEGIN:STANDARD',
  'TZOFFSETFROM:+0200',
  'TZOFFSETTO:+0100',
  'TZNAME:CET',
  'DTSTART:19701025T030000',
  'RRULE:FREQ=YEARLY;BYMONTH=10;BYDAY=-1SU',
  'END:STANDARD',
  'END:VTIMEZONE',
];

/** Text nach RFC 5545: Backslash, Strichpunkt, Beistrich und Zeilenumbruch maskiert. */
export function icsText(t: string): string {
  return t
    .replace(/\\/g, '\\\\')
    .replace(/;/g, '\\;')
    .replace(/,/g, '\\,')
    .replace(/\r\n|\r|\n/g, '\\n');
}

/**
 * Zeilen über 75 Byte umbrechen — nach BYTES, nicht nach Zeichen, und nie
 * mitten in einem Umlaut. Ein halbes „ä“ zeigt Outlook als Fragezeichen.
 */
export function icsFalten(zeile: string): string {
  const enc = new TextEncoder();
  const teile: string[] = [];
  let aktuell = '';
  let bytes = 0;
  let grenze = 75;
  for (const z of zeile) {
    const n = enc.encode(z).length;
    if (bytes + n > grenze) {
      teile.push(aktuell);
      aktuell = '';
      bytes = 0;
      // Folgezeilen beginnen mit einem Leerzeichen, das mitzählt.
      grenze = 74;
    }
    aktuell += z;
    bytes += n;
  }
  teile.push(aktuell);
  return teile.join('\r\n ');
}

const tag = (iso: string) => iso.replace(/-/g, '');
const uhr = (hhmm: string) => `${hhmm.slice(0, 2)}${hhmm.slice(3, 5)}00`;

function folgetag(iso: string): string {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + 1);
  return d.toISOString().slice(0, 10);
}

/** Zeitstempel in UTC, Grundform: 20261002T221500Z. */
function utc(d: Date): string {
  return d.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');
}

/** Gleiche Einsätze behalten ihre Kennung — der Kalender ersetzt statt zu verdoppeln. */
function kennung(e: KalenderEinsatz, person: string): string {
  const sauber = (t: string) => t.replace(/[^A-Za-z0-9-]/g, '_');
  return `${tag(e.datum)}-${sauber(e.baustelle)}-${sauber(person)}@einsatz.senklot`;
}

export function kalenderDatei(args: {
  /** Kennung der Person — macht die Einträge eindeutig. */
  person: string;
  betrieb: string;
  einsaetze: KalenderEinsatz[];
  jetzt: Date;
}): string {
  const zeilen: string[] = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//Senklot//Einsatzplan//DE',
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
    `X-WR-CALNAME:${icsText(`Einsätze – ${args.betrieb}`)}`,
    'X-WR-TIMEZONE:Europe/Vienna',
    // Wie oft nachsehen — die meisten Apps nehmen es als Wunsch, nicht als Regel.
    'REFRESH-INTERVAL;VALUE=DURATION:PT1H',
    'X-PUBLISHED-TTL:PT1H',
    ...ZEITZONE,
  ];
  const stempel = utc(args.jetzt);

  for (const e of args.einsaetze) {
    const von = e.von?.slice(0, 5) || '';
    const bis = e.bis?.slice(0, 5) || '';
    const titel = [e.kunde?.trim() || null, e.baustelle, e.helfer ? 'Helfer' : null]
      .filter(Boolean).join(' · ') + (!von && bis ? ` (bis ${bis})` : '');
    const notiz = [
      `Baustelle ${e.baustelle}`,
      e.helfer ? 'Als Helfer eingeteilt' : null,
      e.ansprechpartner?.trim() || e.telefon?.trim()
        ? `Ansprechpartner: ${[e.ansprechpartner?.trim(), e.telefon?.trim()].filter(Boolean).join(', ')}`
        : null,
      e.kommentar?.trim() || null,
    ].filter(Boolean).join('\n');

    zeilen.push('BEGIN:VEVENT', `UID:${kennung(e, args.person)}`, `DTSTAMP:${stempel}`);
    if (von) {
      zeilen.push(`DTSTART;TZID=Europe/Vienna:${tag(e.datum)}T${uhr(von)}`);
      if (bis) zeilen.push(`DTEND;TZID=Europe/Vienna:${tag(e.datum)}T${uhr(bis)}`);
    } else {
      zeilen.push(`DTSTART;VALUE=DATE:${tag(e.datum)}`, `DTEND;VALUE=DATE:${tag(folgetag(e.datum))}`);
    }
    zeilen.push(`SUMMARY:${icsText(titel)}`);
    if (e.adresse?.trim()) zeilen.push(`LOCATION:${icsText(e.adresse.trim())}`);
    zeilen.push(`DESCRIPTION:${icsText(notiz)}`, 'END:VEVENT');
  }

  zeilen.push('END:VCALENDAR');
  return zeilen.map(icsFalten).join('\r\n') + '\r\n';
}
