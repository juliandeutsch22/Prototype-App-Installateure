/**
 * Kunden aus einer CSV-Datei lesen — der Probelauf vor der Übernahme.
 *
 * WOHER DIE DATEIEN KOMMEN. Aus dem Altprogramm des Betriebs, aus Outlook oder
 * aus einer Excel-Liste, die über Jahre gewachsen ist. Das heisst: Strichpunkt
 * statt Komma (Excel in Österreich), Windows-1252 statt UTF-8, Spaltennamen
 * nach Laune („Firma", „Name 1", „PLZ", „Ort", „Tel.", „Handy"), und Felder mit
 * Zeilenumbruch in Anführungszeichen.
 *
 * WAS DIESER TEIL NICHT TUT: stillschweigend reparieren. Eine Zeile ohne
 * Namen, eine E-Mail-Adresse ohne @, eine UID in falscher Form, derselbe Kunde
 * zweimal in der Datei — jede davon steht im Probelauf mit Zeile und Grund und
 * wird nicht übernommen. Wer die Datei korrigiert und neu einliest, bekommt
 * sie. Eine erfundene Korrektur fiele erst auf, wenn die Rechnung an die
 * falsche Adresse geht.
 */
import type { NewCustomer } from '@/lib/db/customers';
import { sichtAusWieUid } from '@/features/invoices/reverseCharge';

/** Mehr auf einmal ist kein Kundenstamm eines Installationsbetriebs, sondern eine falsche Datei. */
export const HOECHSTENS = 5000;

type Feld =
  | 'firma' | 'name' | 'vorname' | 'nachname' | 'ansprechpartner'
  | 'adresse' | 'strasse' | 'hausnummer' | 'plz' | 'ort' | 'land'
  | 'telefon' | 'email' | 'uid' | 'notiz' | 'kundennummer';

/**
 * Welche Spaltennamen was bedeuten — verglichen ohne Gross-/Kleinschreibung,
 * Satzzeichen und Leerraum, „ß" als „ss".
 */
const NAMEN: Record<Feld, string[]> = {
  firma: ['firma', 'firmenname', 'unternehmen', 'firmierung'],
  name: ['name', 'name1', 'kunde', 'kundenname', 'bezeichnung', 'kundenbezeichnung'],
  vorname: ['vorname'],
  nachname: ['nachname', 'familienname', 'zuname'],
  ansprechpartner: ['ansprechpartner', 'ansprechperson', 'kontakt', 'kontaktperson', 'name2'],
  adresse: ['adresse', 'anschrift', 'rechnungsadresse'],
  strasse: ['strasse', 'str', 'strasseundhausnummer', 'strassehausnummer'],
  hausnummer: ['hausnummer', 'hausnr'],
  plz: ['plz', 'postleitzahl'],
  ort: ['ort', 'stadt', 'gemeinde', 'wohnort'],
  land: ['land', 'staat'],
  telefon: ['telefon', 'tel', 'telefonnummer', 'telefon1', 'telefon2', 'mobil', 'handy', 'mobiltelefon', 'phone'],
  email: ['email', 'mail', 'emailadresse'],
  uid: ['uid', 'uidnr', 'uidnummer', 'ustid', 'ustidnr', 'umsatzsteuerid'],
  notiz: ['notiz', 'notizen', 'bemerkung', 'bemerkungen', 'anmerkung', 'info'],
  kundennummer: ['kundennummer', 'kundennr', 'kdnr'],
};

const FELD_VON = new Map<string, Feld>(
  (Object.entries(NAMEN) as [Feld, string[]][]).flatMap(([feld, namen]) =>
    namen.map((n) => [n, feld] as [string, Feld]),
  ),
);

export function spaltenSchluessel(kopf: string): string {
  return kopf.toLowerCase().replace(/ß/g, 'ss').replace(/[^a-z0-9äöü]/g, '');
}

/** Wie in der Kundenliste: Gross-/Kleinschreibung und Leerraum zählen nicht. */
export function namensSchluessel(name: string): string {
  return name.trim().toLowerCase().replace(/\s+/g, ' ');
}

/**
 * CSV in Zeilen und Zellen — mit Anführungszeichen, verdoppelten
 * Anführungszeichen und Zeilenumbrüchen innerhalb eines Feldes.
 *
 * Das Trennzeichen wird an der KOPFZEILE abgelesen: das häufigste von
 * Strichpunkt, Komma und Tabulator ausserhalb von Anführungszeichen. Excel in
 * Österreich speichert mit Strichpunkt, fast alles andere mit Komma.
 */
export function liesCsv(text: string): string[][] {
  const t = text.replace(/^\uFEFF/, '');
  const trenner = erkenneTrenner(t);
  const zeilen: string[][] = [];
  let zeile: string[] = [];
  let feld = '';
  let inAnf = false;
  for (let i = 0; i < t.length; i++) {
    const c = t[i];
    if (inAnf) {
      if (c === '"') {
        if (t[i + 1] === '"') {
          feld += '"';
          i += 1;
        } else {
          inAnf = false;
        }
      } else {
        feld += c;
      }
      continue;
    }
    if (c === '"' && feld === '') {
      inAnf = true;
    } else if (c === trenner) {
      zeile.push(feld);
      feld = '';
    } else if (c === '\n' || c === '\r') {
      if (c === '\r' && t[i + 1] === '\n') i += 1;
      zeile.push(feld);
      zeilen.push(zeile);
      zeile = [];
      feld = '';
    } else {
      feld += c;
    }
  }
  if (feld !== '' || zeile.length > 0) {
    zeile.push(feld);
    zeilen.push(zeile);
  }
  return zeilen;
}

function erkenneTrenner(text: string): string {
  let kopf = '';
  let inAnf = false;
  for (const c of text) {
    if (c === '"') inAnf = !inAnf;
    if (!inAnf && (c === '\n' || c === '\r')) break;
    if (!inAnf) kopf += c;
  }
  const zahl = (z: string) => kopf.split(z).length - 1;
  const kandidaten: [string, number][] = [[';', zahl(';')], [',', zahl(',')], ['\t', zahl('\t')]];
  kandidaten.sort((a, b) => b[1] - a[1]);
  return kandidaten[0][1] > 0 ? kandidaten[0][0] : ';';
}

export interface ProbeFehler {
  zeile: number;
  grund: string;
  inhalt: string;
}

export interface KundenProbelauf {
  /** Welche Spalte wofür genommen wird — in der Reihenfolge der Datei. */
  erkannt: { spalte: string; feld: Feld }[];
  /** Spalten, mit denen nichts geschieht. Sie stehen da, damit niemand glaubt, sie seien übernommen. */
  ignoriert: string[];
  kunden: { zeile: number; kunde: NewCustomer }[];
  fehler: ProbeFehler[];
}

const EMAIL = /^[^\s@;,]+@[^\s@;,]+\.[^\s@;,]+$/;
const INLAND = new Set(['österreich', 'oesterreich', 'austria', 'at', 'aut', 'a']);

const verbinde = (teile: (string | undefined)[], mit = ' ') =>
  teile.map((x) => x?.trim() ?? '').filter(Boolean).join(mit);

/**
 * Aus den Zeilen einer Datei den Probelauf machen.
 *
 * Die erste Zeile ist die Kopfzeile. Ohne eine Spalte, aus der ein Name
 * entsteht (Firma, Name, Nachname), gibt es nichts zu übernehmen — dann
 * scheitert der ganze Lauf mit dieser Auskunft, statt fünfhundert Zeilen
 * „ohne Namen" zu melden.
 */
export function pruefeKunden(zeilen: string[][]): KundenProbelauf {
  const [kopf, ...daten] = zeilen;
  if (!kopf || kopf.every((z) => z.trim() === '')) {
    throw new Error('Die Datei ist leer.');
  }

  const erkannt: KundenProbelauf['erkannt'] = [];
  const ignoriert: string[] = [];
  const spalten: (Feld | null)[] = kopf.map((k) => {
    const feld = FELD_VON.get(spaltenSchluessel(k)) ?? null;
    if (feld) erkannt.push({ spalte: k.trim(), feld });
    else if (k.trim()) ignoriert.push(k.trim());
    return feld;
  });
  if (!spalten.some((f) => f === 'firma' || f === 'name' || f === 'nachname')) {
    throw new Error(
      'In der ersten Zeile steht keine Spalte für den Namen — erwartet wird etwa „Name", „Firma" oder „Nachname".',
    );
  }

  const befuellt = daten.filter((z) => z.some((x) => x.trim() !== '')).length;
  if (befuellt > HOECHSTENS) {
    throw new Error(`Die Datei hat ${befuellt} Zeilen — höchstens ${HOECHSTENS} auf einmal.`);
  }

  const kunden: KundenProbelauf['kunden'] = [];
  const fehler: ProbeFehler[] = [];
  const gesehen = new Map<string, number>();

  daten.forEach((werte, i) => {
    // Zeile 1 ist die Kopfzeile — so zählt auch Excel.
    const nr = i + 2;
    if (werte.every((x) => x.trim() === '')) return;

    const alle = (feld: Feld) =>
      spalten.flatMap((f, j) => (f === feld && werte[j]?.trim() ? [werte[j].trim()] : []));
    const eins = (feld: Feld) => alle(feld)[0];
    const inhalt = werte.map((x) => x.trim()).filter(Boolean).join(' · ').slice(0, 200);
    const falsch = (grund: string) => fehler.push({ zeile: nr, grund, inhalt });

    const firma = eins('firma');
    const vorname = eins('vorname');
    const nachname = eins('nachname');
    const nameSpalte = eins('name');
    let name: string;
    let person: string | undefined;
    if (firma) {
      name = firma;
      person = verbinde([vorname, nachname ?? nameSpalte]) || undefined;
    } else if (nachname || (vorname && nameSpalte)) {
      name = verbinde([vorname, nachname ?? nameSpalte]);
    } else {
      name = nameSpalte ?? '';
    }
    if (!name) {
      falsch('Kein Name');
      return;
    }

    const email = eins('email');
    if (email && !EMAIL.test(email)) {
      falsch(`E-Mail-Adresse „${email}" ist ungültig`);
      return;
    }
    const uidRoh = eins('uid');
    const uid = uidRoh?.replace(/\s/g, '').toUpperCase();
    if (uid && !sichtAusWieUid(uid)) {
      falsch(`„${uidRoh}" hat nicht die Form einer UID-Nummer`);
      return;
    }

    const schluessel = namensSchluessel(name);
    const erste = gesehen.get(schluessel);
    if (erste !== undefined) {
      falsch(`„${name}" steht schon in Zeile ${erste}`);
      return;
    }
    gesehen.set(schluessel, nr);

    const land = eins('land');
    const adresse =
      eins('adresse') ??
      (verbinde(
        [
          verbinde([eins('strasse'), eins('hausnummer')]),
          verbinde([eins('plz'), eins('ort')]),
          land && !INLAND.has(land.toLowerCase()) ? land : undefined,
        ],
        ', ',
      ) || undefined);
    const kundennummer = eins('kundennummer');
    const notiz = verbinde(
      [...alle('notiz'), kundennummer ? `Kundennummer im Altsystem: ${kundennummer}` : undefined],
      '\n',
    );

    kunden.push({
      zeile: nr,
      kunde: {
        name,
        address: adresse ?? '',
        contactName: eins('ansprechpartner') ?? person ?? '',
        contactPhone: [...new Set(alle('telefon'))].join(' / '),
        email: email ?? '',
        vatId: uid ?? '',
        notes: notiz,
        active: true,
      },
    });
  });

  return { erkannt, ignoriert, kunden, fehler };
}

/** Die Vorlage zum Herunterladen — mit Strichpunkt, wie Excel in Österreich sie öffnet. */
export const VORLAGE =
  'Firma;Vorname;Nachname;Straße;PLZ;Ort;Telefon;E-Mail;UID;Notiz\r\n' +
  'Muster Bau GmbH;Anna;Muster;Hauptstraße 1;1010;Wien;+43 1 234567;office@muster.at;ATU12345678;\r\n' +
  ';Franz;Huber;Dorfweg 3;3100;St. Pölten;0664 1234567;;;Schlüssel beim Nachbarn\r\n';
