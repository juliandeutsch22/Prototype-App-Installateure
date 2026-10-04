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

import { stufeImEinsatz, type Einstufung } from './stufeImEinsatz';

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

/** Ein Termin, wie ihn `kalender_abruf` liefert (`app.termin_fuers_abo`). */
export interface KalenderTermin {
  id: string;
  art: string;
  datum: string;
  von?: string | null;
  bis?: string | null;
  baustelle?: string | null;
  ort?: string | null;
  adresse?: string | null;
  notiz?: string | null;
  teilnehmer?: string[];
}

/** Eine Baustelle an einem Tag im Gesamtplan, mit allen Eingeteilten. */
export interface KalenderBaustelle {
  datum: string;
  baustelle: string;
  kunde?: string | null;
  adresse?: string | null;
  leute: { name: string; helfer?: boolean; einstufung?: Einstufung | null; von?: string | null; bis?: string | null }[];
}

/** „Lieferung" heißt am Telefon „Aviso" — so steht es in der App und im Kalender. */
export function terminArtName(art: string): string {
  return art === 'Lieferung' ? 'Lieferung (Aviso)' : art;
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

function kopf(name: string): string[] {
  return [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//Senklot//Einsatzplan//DE',
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
    `X-WR-CALNAME:${icsText(name)}`,
    'X-WR-TIMEZONE:Europe/Vienna',
    // Wie oft nachsehen — die meisten Apps nehmen es als Wunsch, nicht als Regel.
    'REFRESH-INTERVAL;VALUE=DURATION:PT1H',
    'X-PUBLISHED-TTL:PT1H',
    ...ZEITZONE,
  ];
}

/** Ein Eintrag — mit Uhrzeit, ab Uhrzeit oder ganztägig, wie oben beschrieben. */
function eintrag(
  zeilen: string[],
  e: { uid: string; stempel: string; datum: string; von: string; bis: string; titel: string; ort?: string | null; notiz: string },
): void {
  zeilen.push('BEGIN:VEVENT', `UID:${e.uid}`, `DTSTAMP:${e.stempel}`);
  if (e.von) {
    zeilen.push(`DTSTART;TZID=Europe/Vienna:${tag(e.datum)}T${uhr(e.von)}`);
    if (e.bis) zeilen.push(`DTEND;TZID=Europe/Vienna:${tag(e.datum)}T${uhr(e.bis)}`);
  } else {
    zeilen.push(`DTSTART;VALUE=DATE:${tag(e.datum)}`, `DTEND;VALUE=DATE:${tag(folgetag(e.datum))}`);
  }
  zeilen.push(`SUMMARY:${icsText(e.titel)}`);
  if (e.ort?.trim()) zeilen.push(`LOCATION:${icsText(e.ort.trim())}`);
  zeilen.push(`DESCRIPTION:${icsText(e.notiz)}`, 'END:VEVENT');
}

/**
 * Ein Termin (Plan 10.4): Art und Ort als Titel, die Adresse als Ort, in der
 * Notiz Baustelle, Teilnehmer und die Notiz des Büros. Die Kennung hängt am
 * Termin — ändert das Büro die Uhrzeit, ersetzt der Kalender den Eintrag.
 */
function terminEintrag(zeilen: string[], t: KalenderTermin, stempel: string, person: string): void {
  const von = t.von?.slice(0, 5) || '';
  const bis = t.bis?.slice(0, 5) || '';
  const ort = [t.ort?.trim() || null, t.baustelle || null].filter(Boolean).join(' · ');
  const notiz = [
    t.baustelle ? `Baustelle ${t.baustelle}` : t.ort?.trim() ? 'Beim Kunden, ohne Baustelle' : null,
    t.art === 'Lieferung' && (von || bis) ? `Zeitfenster ${[von, bis].filter(Boolean).join('–')}` : null,
    t.teilnehmer && t.teilnehmer.length > 0 ? `Teilnehmer: ${t.teilnehmer.join(', ')}` : null,
    t.notiz?.trim() || null,
    'Ein Termin, kein Einsatz — gebucht wird wie immer.',
  ].filter(Boolean).join('\n');
  eintrag(zeilen, {
    uid: `${t.id.replace(/[^A-Za-z0-9-]/g, '_')}-${person.replace(/[^A-Za-z0-9-]/g, '_')}@termin.senklot`,
    stempel,
    datum: t.datum,
    von,
    bis,
    titel: [terminArtName(t.art), ort || null].filter(Boolean).join(' · ') + (!von && bis ? ` (bis ${bis})` : ''),
    ort: t.adresse,
    notiz,
  });
}

export function kalenderDatei(args: {
  /** Kennung der Person — macht die Einträge eindeutig. */
  person: string;
  betrieb: string;
  einsaetze: KalenderEinsatz[];
  /** Die Termine der Person (Plan 10.4) — ohne Angabe keine. */
  termine?: KalenderTermin[];
  jetzt: Date;
}): string {
  const zeilen = kopf(`Einsätze – ${args.betrieb}`);
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

    eintrag(zeilen, { uid: kennung(e, args.person), stempel, datum: e.datum, von, bis, titel, ort: e.adresse, notiz });
  }
  for (const t of args.termine ?? []) terminEintrag(zeilen, t, stempel, args.person);

  zeilen.push('END:VCALENDAR');
  return zeilen.map(icsFalten).join('\r\n') + '\r\n';
}

/**
 * DER GANZE EINSATZPLAN für die Leitung (Plan 10.4, PR B): je Baustelle und
 * Tag EIN Eintrag, nicht je Person — bei zehn Leuten bliebe der Kalender
 * sonst unlesbar. Im Titel Kunde und Baustelle, in der Notiz die
 * Eingeteilten mit Stufe und Uhrzeit, die Adresse als Ort. Dazu die Termine
 * des Betriebs. Keine Abwesenheiten.
 *
 * Die Uhrzeit des Eintrags: haben alle Eingeteilten eine, von der frühesten
 * bis zur spätesten; fehlt sie bei einem, ganztägig — sonst stünde der
 * Eintrag kürzer da, als dort gearbeitet wird.
 */
export function gesamtplanDatei(args: {
  person: string;
  betrieb: string;
  baustellen: KalenderBaustelle[];
  termine: KalenderTermin[];
  jetzt: Date;
}): string {
  const zeilen = kopf(`Einsatzplan – ${args.betrieb}`);
  const stempel = utc(args.jetzt);
  const sauber = (t: string) => t.replace(/[^A-Za-z0-9-]/g, '_');

  for (const b of args.baustellen) {
    const leute = b.leute ?? [];
    const alleMitZeit = leute.length > 0 && leute.every((l) => l.von);
    const von = alleMitZeit ? leute.map((l) => l.von!.slice(0, 5)).sort()[0] : '';
    const bisse = leute.map((l) => l.bis?.slice(0, 5) || '').filter(Boolean).sort();
    const bis = alleMitZeit && bisse.length === leute.length ? bisse[bisse.length - 1] : '';
    const notiz = [
      `Baustelle ${b.baustelle}`,
      ...leute.map((l) => {
        const zeit = [l.von?.slice(0, 5), l.bis?.slice(0, 5)].filter(Boolean).join('–');
        return [l.name, stufeImEinsatz(l.helfer, l), zeit || null].filter(Boolean).join(' · ');
      }),
    ].join('\n');
    eintrag(zeilen, {
      uid: `${tag(b.datum)}-${sauber(b.baustelle)}-${sauber(args.person)}@gesamt.senklot`,
      stempel,
      datum: b.datum,
      von,
      bis: von ? bis : '',
      titel: [b.kunde?.trim() || null, b.baustelle, `${leute.length} ${leute.length === 1 ? 'Person' : 'Personen'}`]
        .filter(Boolean).join(' · '),
      ort: b.adresse,
      notiz,
    });
  }
  for (const t of args.termine) terminEintrag(zeilen, t, stempel, args.person);

  zeilen.push('END:VCALENDAR');
  return zeilen.map(icsFalten).join('\r\n') + '\r\n';
}
