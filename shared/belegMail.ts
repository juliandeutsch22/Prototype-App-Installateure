/**
 * Rechnung und Angebot per Mail aus der App (Durchsicht 15.11.2026, F16) —
 * die Regeln für die App UND die Edge Function `beleg-mail`.
 *
 * WARUM HIER. Prüft die Maske anders als die Function, sieht das Büro
 * entweder einen Knopf, der beim Server scheitert, oder eine Ablehnung, die
 * der Server gar nicht hätte. Die Datenbank prüft Adressen, Längen und das
 * Rate-Limit noch einmal (`beleg_versand_vorbereiten`); die Zahlen stehen
 * dort als Konstanten, und `tests/supabase/belegMail.test.ts` misst sie
 * gegen diese hier.
 *
 * Ohne Importe — die Function lädt die Kopie in `supabase/functions/_shared/`.
 */

/** Rechnung, Angebot — und die gespeicherte Mahnung einer Rechnung (Zahlungserinnerung, Mahnung, letzte Mahnung). */
export type BelegArt = 'rechnung' | 'angebot' | 'mahnung';

/** Höchstens so viele Empfänger je Mail — ein Kunde, eine Hausverwaltung, ein Planer. Mehr wäre ein Verteiler. */
export const EMPFAENGER_MAX = 3;
/** RFC 5321: eine Adresse hat höchstens 254 Zeichen. */
export const ADRESSE_MAX = 254;
export const BETREFF_MAX = 200;
export const TEXT_MAX = 10_000;
/**
 * Der Anhang höchstens 6 MiB. Base64 macht daraus gut 8 MB Mail — unter der
 * Grenze von 10 MB, die viele Postfächer (und manche Versanddienste) setzen.
 * Ein Beleg aus der App wiegt einige hundert Kilobyte; erst ein Leistungs-
 * nachweis über Monate kommt in die Nähe.
 */
export const ANHANG_MAX_BYTES = 6 * 1024 * 1024;

/**
 * RATE-LIMIT gegen Missbrauch — ein gestohlenes Konto soll nicht im Namen
 * des Betriebs Hunderte Mails verschicken. Gezählt wird jeder Versuch,
 * auch ein gescheiterter (Datenbank: `beleg_versand_vorbereiten`).
 */
export const JE_PERSON_JE_STUNDE = 30;
export const JE_BETRIEB_JE_STUNDE = 100;
export const JE_BETRIEB_JE_TAG = 400;
/** Derselbe Beleg in einer Stunde — mehr ist ein Doppelklick oder ein Irrtum. Eine Rechnung und ihre Mahnungen zählen zusammen. */
export const JE_BELEG_JE_STUNDE = 5;

/**
 * Eine Adresse, die jeder Mailserver annimmt — bewusst enger als RFC 5322
 * (keine Kommentare, keine Anführungszeichen, keine IP-Literale). Dasselbe
 * Muster steht in der Datenbank (`app.mailadresse_gueltig`).
 */
export const ADRESSE_FORM =
  /^[A-Za-z0-9.!#$%&'*+/=?^_`{|}~-]+@[A-Za-z0-9]([A-Za-z0-9-]{0,61}[A-Za-z0-9])?(\.[A-Za-z0-9]([A-Za-z0-9-]{0,61}[A-Za-z0-9])?)+$/;

/** Was an einer Adresse nicht stimmt — `null`, wenn sie so hinaus darf. */
export function adresseFehler(adresse: string): string | null {
  const a = adresse.trim();
  if (!a) return 'Bitte eine E-Mail-Adresse angeben.';
  if (a.length > ADRESSE_MAX || !ADRESSE_FORM.test(a)) return `„${a}“ ist keine gültige E-Mail-Adresse.`;
  return null;
}

/**
 * Empfänger aus einem Feld lesen: durch Komma, Strichpunkt oder Leerzeichen
 * getrennt, doppelte einmal. Gibt die Adressen und den ersten Fehler zurück.
 */
export function empfaengerLesen(text: string): { adressen: string[]; fehler: string | null } {
  const teile = text.split(/[\s,;]+/).map((t) => t.trim()).filter(Boolean);
  const adressen: string[] = [];
  for (const t of teile) {
    if (!adressen.some((a) => a.toLowerCase() === t.toLowerCase())) adressen.push(t);
  }
  if (adressen.length === 0) return { adressen, fehler: 'Bitte eine E-Mail-Adresse angeben.' };
  if (adressen.length > EMPFAENGER_MAX) {
    return { adressen, fehler: `Höchstens ${EMPFAENGER_MAX} Empfänger je Mail.` };
  }
  for (const a of adressen) {
    const f = adresseFehler(a);
    if (f) return { adressen, fehler: f };
  }
  return { adressen, fehler: null };
}

/** Steuerzeichen (außer Zeilenumbruch im Text) haben in einer Mail nichts verloren — im Betreff schon gar keinen Umbruch. */
// eslint-disable-next-line no-control-regex
const STEUERZEICHEN = /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/;

export function betreffFehler(betreff: string): string | null {
  const b = betreff.trim();
  if (!b) return 'Bitte einen Betreff angeben.';
  if (Array.from(b).length > BETREFF_MAX) return `Der Betreff ist zu lang (höchstens ${BETREFF_MAX} Zeichen).`;
  if (/[\r\n]/.test(b) || STEUERZEICHEN.test(b)) return 'Der Betreff steht in einer Zeile.';
  return null;
}

export function textFehler(text: string): string | null {
  if (!text.trim()) return 'Bitte einen Text angeben.';
  if (Array.from(text).length > TEXT_MAX) return `Der Text ist zu lang (höchstens ${TEXT_MAX} Zeichen).`;
  if (STEUERZEICHEN.test(text)) return 'Der Text enthält Steuerzeichen.';
  return null;
}

// ---------------------------------------------------------------------------
// Text-Vorlage je Betrieb
// ---------------------------------------------------------------------------

export interface MailVorlage {
  betreff: string;
  text: string;
}

export type MailVorlagen = Partial<Record<BelegArt, Partial<MailVorlage>>>;

/** Was in einer Vorlage eingesetzt wird — `{nummer}` usw. */
export const PLATZHALTER: Record<BelegArt, readonly string[]> = {
  rechnung: ['nummer', 'kunde', 'betrag', 'faellig', 'baustelle', 'firma'],
  angebot: ['nummer', 'kunde', 'betrag', 'gueltig_bis', 'link', 'firma'],
  mahnung: ['nummer', 'kunde', 'titel', 'offen', 'frist', 'firma'],
};

/**
 * Die Vorlage, wenn der Betrieb keine eigene hat. Sachlich und ohne Floskeln,
 * die nicht stimmen könnten; `{link}` steht im Angebot nur, wenn ein
 * Annahme-Link mitgeht (sonst fällt die Zeile weg, siehe `vorlageFuellen`).
 */
export const STANDARD_VORLAGEN: Record<BelegArt, MailVorlage> = {
  rechnung: {
    betreff: 'Rechnung {nummer} von {firma}',
    text: [
      'Sehr geehrte Damen und Herren,',
      '',
      'anbei erhalten Sie unsere Rechnung {nummer} über {betrag}, zahlbar bis {faellig}.',
      '',
      'Bei Fragen antworten Sie einfach auf diese Mail.',
      '',
      'Mit freundlichen Grüßen',
      '{firma}',
    ].join('\n'),
  },
  angebot: {
    betreff: 'Angebot {nummer} von {firma}',
    text: [
      'Sehr geehrte Damen und Herren,',
      '',
      'anbei erhalten Sie unser Angebot {nummer} über {betrag}, gültig bis {gueltig_bis}.',
      '',
      'Unter diesem Link können Sie es ansehen und mit Ihrer Unterschrift annehmen: {link}',
      '',
      'Mit freundlichen Grüßen',
      '{firma}',
    ].join('\n'),
  },
  mahnung: {
    betreff: '{titel} zu Rechnung {nummer} — {firma}',
    text: [
      'Sehr geehrte Damen und Herren,',
      '',
      'anbei erhalten Sie unsere {titel} zur Rechnung {nummer}. Offen sind {offen}; bitte begleichen Sie den Betrag samt den im Schreiben genannten Kosten bis {frist}.',
      '',
      'Haben Sie inzwischen bezahlt, betrachten Sie dieses Schreiben bitte als gegenstandslos.',
      '',
      'Mit freundlichen Grüßen',
      '{firma}',
    ].join('\n'),
  },
};

/** Die Vorlage des Betriebs, wo er eine hat — sonst die Standardvorlage, je Feld. */
export function vorlageFuer(art: BelegArt, eigene: MailVorlagen | null | undefined): MailVorlage {
  const v = eigene?.[art];
  return {
    betreff: v?.betreff?.trim() ? v.betreff : STANDARD_VORLAGEN[art].betreff,
    text: v?.text?.trim() ? v.text : STANDARD_VORLAGEN[art].text,
  };
}

/**
 * Platzhalter einsetzen. Ein Platzhalter ohne Wert (kein Link, kein Fälligkeits-
 * tag) nimmt seine ganze Zeile mit, wenn sie sonst nur noch Rahmen wäre
 * („Unter diesem Link …: “) — sonst bliebe ein Satz stehen, der ins Leere
 * zeigt. Unbekannte Platzhalter bleiben stehen, damit ein Tippfehler in der
 * Vorlage auffällt statt still zu verschwinden.
 */
export function vorlageFuellen(vorlage: string, werte: Record<string, string | undefined>): string {
  return vorlage
    .split('\n')
    .flatMap((zeile) => {
      let leer = false;
      const neu = zeile.replace(/\{([a-z_]+)\}/g, (ganz, name: string) => {
        if (!(name in werte)) return ganz;
        const w = werte[name];
        if (!w) leer = true;
        return w ?? '';
      });
      return leer ? [] : [neu];
    })
    .join('\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

/** Platzhalter, die eine Vorlage nennt, die es für diese Belegart nicht gibt. */
export function unbekanntePlatzhalter(art: BelegArt, vorlage: string): string[] {
  const bekannt = new Set(PLATZHALTER[art]);
  return [...new Set([...vorlage.matchAll(/\{([a-z_]+)\}/g)].map((m) => m[1]).filter((n) => !bekannt.has(n)))];
}

/**
 * Der Dateiname des Anhangs — dieselbe Regel wie `beleg_versand_vorbereiten`
 * (und für die Mahnung wie `mahnungDateiname`); `nummer` ist bei der Mahnung
 * die Nummer der Rechnung.
 */
export function anhangName(art: BelegArt, nummer: string, mahnstufe: 1 | 2 | 3 = 1): string {
  const wort = art === 'rechnung' ? 'Rechnung' : art === 'angebot' ? 'Angebot'
    : mahnstufe === 1 ? 'Zahlungserinnerung' : mahnstufe === 2 ? 'Mahnung' : 'Letzte_Mahnung';
  return `${wort}_${nummer.replace(/[^A-Za-z0-9._-]/g, '_')}.pdf`;
}

/** Die Antwort der Function, wenn der Versand nicht eingerichtet ist — die App zeigt dann den bisherigen Weg. */
export const NICHT_EINGERICHTET = 'nicht_eingerichtet';
