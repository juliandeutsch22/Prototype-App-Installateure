/**
 * Die Regeln des Annahme-Links (M02a, A06) — für die öffentliche Seite UND
 * die Edge Function `angebot-annahme`.
 *
 * WARUM HIER. Prüft die Seite anders als die Function, sieht der Kunde
 * entweder einen Knopf, der beim Server scheitert, oder einen Fehler, den
 * der Server gar nicht hätte. Die Datenbank prüft dasselbe noch einmal
 * (`angebot_link_annehmen`, `angebot_link_ablehnen`), damit auch ein Aufruf
 * an der Function vorbei nichts Halbes speichert; die Zahlen stehen dort
 * als Konstanten in SQL, und `tests/supabase/angebotLinkFunktion.test.ts`
 * misst sie gegen diese hier.
 *
 * Ohne Importe — die Function lädt die Kopie in `supabase/functions/_shared/`.
 */

/** 32 Zufallsbytes in Base64 ohne „+/=“ — genau das vergibt `angebot_link_erzeugen`. */
export const SCHLUESSEL_FORM = /^[A-Za-z0-9_-]{43}$/;

/** Name des Kunden bei Annahme und Ablehnung, ohne Leerzeichen am Rand. */
export const NAME_MIN = 2;
export const NAME_MAX = 120;

/** Grund einer Ablehnung — freiwillig. */
export const GRUND_MAX = 1000;

/**
 * Die Unterschrift als PNG-Data-URL, wie sie `SignaturePad` liefert. Ein
 * Namenszug auf einer Telefonfläche wiegt wenige Dutzend Kilobyte; die
 * Grenze lässt dichte Bildschirme weit hinter sich und hält trotzdem jemanden
 * auf, der Megabytes schicken will.
 */
export const UNTERSCHRIFT_MAX = 500_000;
export const UNTERSCHRIFT_FORM = /^data:image\/png;base64,[A-Za-z0-9+/]+=*$/;

/** Was eine Anfrage an die Function höchstens wiegen darf — die Unterschrift und etwas Rand. */
export const ANFRAGE_MAX_BYTES = UNTERSCHRIFT_MAX + 8_192;

/** Rate-Limit je Link: so viele Anfragen in einer Stunde (wie `app.angebot_link_anfrage_zaehlen`). */
export const ANFRAGEN_JE_STUNDE = 60;

/**
 * Zeichen wie `char_length` in Postgres: Codepunkte, nicht UTF-16-Einheiten —
 * sonst zählte ein Name mit Sonderzeichen hier anders als in der Datenbank.
 */
export function zeichen(text: string): number {
  return Array.from(text).length;
}

export interface AnnahmeEingabe {
  name: string;
  bestaetigt: boolean;
  unterschrift: string | null;
}

/** Was an einer Annahme fehlt — `null`, wenn sie so hinaus darf. */
export function annahmeFehler(e: AnnahmeEingabe): string | null {
  const name = zeichen(e.name.trim());
  if (name < NAME_MIN || name > NAME_MAX) {
    return `Bitte Ihren Namen angeben (${NAME_MIN} bis ${NAME_MAX} Zeichen).`;
  }
  if (e.bestaetigt !== true) return 'Bitte bestätigen, dass Sie das Angebot verbindlich annehmen.';
  if (!e.unterschrift || e.unterschrift.length > UNTERSCHRIFT_MAX || !UNTERSCHRIFT_FORM.test(e.unterschrift)) {
    return 'Bitte im Feld unterschreiben.';
  }
  return null;
}

export interface AblehnungEingabe {
  name: string;
  grund: string;
}

/** Was an einer Ablehnung fehlt — `null`, wenn sie so hinaus darf. */
export function ablehnungFehler(e: AblehnungEingabe): string | null {
  const name = zeichen(e.name.trim());
  if (name < NAME_MIN || name > NAME_MAX) {
    return `Bitte Ihren Namen angeben (${NAME_MIN} bis ${NAME_MAX} Zeichen).`;
  }
  if (zeichen(e.grund.trim()) > GRUND_MAX) return `Der Grund ist zu lang (höchstens ${GRUND_MAX} Zeichen).`;
  return null;
}
