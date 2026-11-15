/**
 * Stammdaten des Betriebs — auf Postgres.
 *
 * Sonderfall gegenüber `kern.ts`: `companies` ist KEINE mandantengefilterte
 * Tabelle — die Zeile IST der Mandant. Deshalb wird hier über die Kennung
 * gelesen und geschrieben; wer schreiben darf, entscheidet der Zeilenschutz
 * (Geschäftsführung/Administration) und, feldweise, der Trigger
 * `app.firmeneinstellungen_geschuetzt`.
 */
import type { Company, InvoiceRates } from '@/types';
import { derClient } from './kern';
import { objektAlsZeile, zeileAlsObjekt } from './felder';

const BETRIEBE = 'companies';

export async function getCompany(companyId: string): Promise<Company | null> {
  const { data, error } = await derClient()
    .from(BETRIEBE).select('*').eq('id', companyId).maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) return null;
  return zeileAlsObjekt<Company>(BETRIEBE, data as Record<string, unknown>);
}

/** Aktualisiert Stammdaten. `id` ist die Kennung und wird nie geschrieben. */
export async function updateCompany(
  companyId: string,
  data: Partial<Omit<Company, 'id'>>,
): Promise<void> {
  const zeile = objektAlsZeile(BETRIEBE, data);
  if (Object.keys(zeile).length === 0) return;
  /*
    Auch hier gilt: ein Schreibvorgang, der nichts trifft, ist ein Fehler.
    Wer nicht zur Spitze gehört, ändert die Einstellungen nicht — und darf
    das nicht als „gespeichert" zurückgemeldet bekommen.
  */
  const { error, count } = await derClient()
    .from(BETRIEBE).update(zeile, { count: 'exact' }).eq('id', companyId);
  if (error) throw new Error(error.message);
  if (count === 0) {
    throw new Error('Die Einstellungen dieses Betriebs lassen sich nicht ändern.');
  }
}

/** Die nächste laufende Nummer je Kreis — was der Zähler als Nächstes vergäbe. */
export interface NaechsteNummern {
  rechnung: number;
  angebot: number;
  baustelle: number;
}

/**
 * Ohne sie zu verbrauchen: die Vorschau in den Einstellungen und die
 * Vorschläge der Masken sollen dieselbe Nummer zeigen, die der Zähler danach
 * vergibt (Launch-Check 25.09.2026, K6 — dort stand ein festes Beispiel).
 */
export async function naechsteNummern(jahr: number): Promise<NaechsteNummern> {
  const { data, error } = await derClient().rpc('naechste_nummern', { p_jahr: jahr });
  if (error) throw new Error(error.message);
  const je = new Map(((data ?? []) as { art: string; naechste: number }[]).map((z) => [z.art, Number(z.naechste)]));
  return {
    rechnung: je.get('invoices') ?? 1001,
    angebot: je.get('quotes') ?? 1,
    baustelle: je.get('projects') ?? 1,
  };
}

/** Die nächsten Nummern und das Jahr, in dem der Server sie vergäbe. */
export interface NaechsteNummernImJahr extends NaechsteNummern {
  jahr: number;
}

/**
 * DAS JAHR KOMMT MIT (Durchsicht 15.11.2026, G12). Seit G5/G10 vergibt der
 * Server im laufenden Jahr in Wien; die Vorschau mit dem Jahr des Geräts zu
 * bauen, zeigte bei falscher Uhr oder zu Silvester eine Nummer aus einem
 * Kreis, den es nicht gibt. Die Datenbank sagt deshalb beides: Zahl und Jahr.
 */
export async function naechsteNummernImJahr(): Promise<NaechsteNummernImJahr> {
  const { data, error } = await derClient().rpc('naechste_nummern_vorschau');
  if (error) throw new Error(error.message);
  const zeilen = (data ?? []) as { art: string; naechste: number; jahr: number }[];
  if (zeilen.length === 0) throw new Error('Die nächsten Nummern kamen nicht.');
  const je = new Map(zeilen.map((z) => [z.art, Number(z.naechste)]));
  return {
    jahr: Number(zeilen[0].jahr),
    rechnung: je.get('invoices') ?? 1001,
    angebot: je.get('quotes') ?? 1,
    baustelle: je.get('projects') ?? 1,
  };
}

/** Die Schlüssel in `rates`, die die Buchhaltung pflegt (Testbericht H10). */
export type Rechnungsvorgaben = Partial<
  Pick<
    InvoiceRates,
    | 'dueDays'
    | 'skontoProzent'
    | 'skontoTage'
    | 'mahnspesen'
    | 'mahnspesenVerbraucher'
    | 'pauschale458'
    | 'basiszinssatz'
    | 'basiszinssatzAb'
    | 'basiszinssaetze'
  >
>;

/**
 * Nur die Rechnungsvorgaben speichern — Zahlungsziel, Skonto, Mahnspesen,
 * Basiszinssatz (Testbericht 30.09.2026, H10).
 *
 * Über eine eigene Funktion der Datenbank, nicht über `updateCompany`: die
 * Firma ändert nur die Spitze, und die Buchhaltung soll an genau diese acht
 * Werte und an keine Stunden- oder Kostensätze. `undefined` wird als `null`
 * geschickt und nimmt den Wert heraus (etwa „kein Skonto“).
 */
export async function rechnungsvorgabenSpeichern(vorgaben: Rechnungsvorgaben): Promise<void> {
  const p_vorgaben = Object.fromEntries(
    (
      [
        'dueDays', 'skontoProzent', 'skontoTage', 'mahnspesen',
        'mahnspesenVerbraucher', 'pauschale458', 'basiszinssatz', 'basiszinssatzAb',
        'basiszinssaetze',
      ] as const
    ).map((k) => [k, vorgaben[k] ?? null]),
  );
  const { error } = await derClient().rpc('rechnungsvorgaben_speichern', { p_vorgaben });
  if (error) throw new Error(error.message);
}
