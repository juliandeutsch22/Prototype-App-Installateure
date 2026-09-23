/**
 * Angebote — auf Postgres.
 *
 * Die Kette im Betrieb beginnt bei Anfrage → Angebot → Auftrag. Ein
 * angenommenes Angebot legt die Baustelle an und bringt sein Stundenbudget
 * mit; erst damit bedeutet die Budget-Ampel etwas, statt gegen eine von Hand
 * abgetippte Zahl zu messen, der niemand traut.
 *
 * Kopf und Positionen liegen in zwei Tabellen und werden von
 * `public.angebot_speichern` zusammen geschrieben.
 */
import type { SupabaseClient } from '@supabase/supabase-js';
import type { Quote, InvoiceDiscount } from '@/types';
import { abfragen, derClient, loeschen, type WithId } from './kern';
import { objektAlsZeile } from './felder';
import { belegNummer, PRAEFIX_VORGABE } from '@/lib/praefixe';

const ANGEBOTE = 'quotes';
const POSITIONEN = 'quote_lines';

type Position = Quote['positions'][number];

type KopfZeile = Omit<Quote, 'positions' | 'discount'> & {
  discountMode?: InvoiceDiscount['mode'];
  discountValue?: number;
  discountLabel?: string;
};

/** Köpfe und Positionen zu ganzen Angeboten zusammenfügen. */
async function zusammensetzen(
  koepfe: WithId<KopfZeile>[],
  companyId: string,
  client?: SupabaseClient,
): Promise<WithId<Quote>[]> {
  if (koepfe.length === 0) return [];

  const zeilen = await abfragen<Position & { quoteId: string; position: number }>(
    POSITIONEN,
    companyId,
    {
      wo: [{ art: 'in', feld: 'quoteId', werte: koepfe.map((k) => k.id) }],
      sortiere: { feld: 'position' },
    },
    client,
  );

  const nachAngebot = new Map<string, Position[]>();
  for (const z of zeilen) {
    const liste = nachAngebot.get(z.quoteId) ?? [];
    liste.push({ label: z.label, qty: z.qty, unit: z.unit, unitPrice: z.unitPrice, netto: z.netto });
    nachAngebot.set(z.quoteId, liste);
  }

  return koepfe.map((k) => {
    const { discountMode, discountValue, discountLabel, ...rest } = k;
    const angebot: WithId<Quote> = {
      ...(rest as unknown as WithId<Quote>),
      positions: nachAngebot.get(k.id) ?? [],
    };
    // Drei Spalten, ein Feld — wie bei der Rechnung. Ohne Modus gab es keinen
    // Rabatt; ein leeres Objekt sähe aus wie einer über null.
    if (discountMode) {
      const rabatt: InvoiceDiscount = { mode: discountMode, value: discountValue ?? 0 };
      if (discountLabel) rabatt.label = discountLabel;
      angebot.discount = rabatt;
    }
    return angebot;
  });
}

/** Die jüngsten Angebote, mit Obergrenze — eine Arbeitsliste, kein Archiv. */
export async function listRecentQuotes(companyId: string, max = 100) {
  const koepfe = await abfragen<KopfZeile>(ANGEBOTE, companyId, {
    sortiere: { feld: 'createdAt', absteigend: true },
    grenze: max,
  });
  return zusammensetzen(koepfe, companyId);
}

/** Die Angebote EINES Kunden. */
export async function listQuotesForCustomer(companyId: string, customerId: string, max = 100) {
  const koepfe = await abfragen<KopfZeile>(ANGEBOTE, companyId, {
    wo: [{ art: 'gleich', feld: 'customerId', wert: customerId }],
    grenze: max,
  });
  return zusammensetzen(koepfe, companyId);
}

/** EIN Angebot — für seine eigene Seite. `null`, wenn es das nicht (mehr) gibt. */
export async function getQuote(companyId: string, id: string): Promise<WithId<Quote> | null> {
  // Eine Kennung, die keine uuid ist (altes Lesezeichen, Tippfehler in der
  // Adresse), ist „gibt es nicht" — nicht ein Datenbankfehler.
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id)) return null;
  const koepfe = await abfragen<KopfZeile>(ANGEBOTE, companyId, {
    wo: [{ art: 'gleich', feld: 'id', wert: id }],
    grenze: 1,
  });
  return (await zusammensetzen(koepfe, companyId))[0] ?? null;
}

/**
 * Die Angebote, aus denen eine Baustelle entstanden ist.
 *
 * ÜBER DIE KENNUNG, NICHT DIE NUMMER. Die Baustellennummer lässt sich in der
 * Akte ändern; `project_number` am Angebot bliebe dann stehen, `project_id`
 * zeigt weiter auf dieselbe Baustelle.
 */
export async function listQuotesForProject(companyId: string, projectId: string) {
  const koepfe = await abfragen<KopfZeile>(ANGEBOTE, companyId, {
    wo: [{ art: 'gleich', feld: 'projectId', wert: projectId }],
    grenze: 20,
  });
  return zusammensetzen(koepfe, companyId);
}

export type NewQuote = Omit<Quote, 'id' | 'companyId' | 'createdAt' | 'projectId'>;

/** Der Aufruf der Datenbankfunktion — eine Stelle für Anlegen und Ändern. */
async function speichern(id: string | null, daten: Partial<NewQuote>): Promise<string> {
  const { positions, discount, ...kopf } = daten;
  const zeile: Record<string, unknown> = objektAlsZeile(ANGEBOTE, kopf);
  /*
    Der Rabatt geht nur mit, wenn er auch mitgeschickt wurde. `discount: null`
    heisst ausdrücklich „kein Rabatt" und räumt die drei Spalten; fehlt das
    Feld ganz, bleiben sie stehen — ein Teilschreiben darf keinen Rabatt
    löschen, von dem es gar nichts wusste.
  */
  if (discount !== undefined) {
    zeile.discount_mode = discount?.mode ?? null;
    zeile.discount_value = discount?.value ?? null;
    zeile.discount_label = discount?.label ?? null;
  }

  const { data, error } = await derClient().rpc('angebot_speichern', {
    p_id: id,
    p_kopf: zeile,
    p_positionen: positions ? positions.map((p) => objektAlsZeile(POSITIONEN, p)) : null,
  });
  if (error) throw new Error(error.message);
  return String(data);
}

export function createQuote(companyId: string, q: NewQuote): Promise<string> {
  void companyId;
  return speichern(null, q);
}

export async function updateQuote(id: string, data: Partial<NewQuote>): Promise<void> {
  await speichern(id, data);
}

/**
 * Löschen.
 *
 * Dass nur ein Entwurf gehen darf, hält die Ansicht fest — im Schema steht
 * dieselbe Grenze nicht, und das ist ein bewusst offener Punkt: anders als
 * bei der Rechnung gibt es für ein Angebot keine Aufbewahrungspflicht, die
 * ein Löschen verböte.
 */
export function deleteQuote(id: string): Promise<void> {
  return loeschen(ANGEBOTE, id);
}

/**
 * Angebotsnummer verbindlich ziehen.
 *
 * Dieselbe Überlegung wie bei den Rechnungsnummern: würde die Nummer aus der
 * geladenen Liste abgeleitet, bekämen zwei Personen, die gleichzeitig
 * kalkulieren, dieselbe. Bei Rechnungen ist das ein Fall für den
 * Steuerberater, bei Angeboten ein peinlicher Doppler beim Kunden —
 * vermeidbar ist beides mit demselben Handgriff.
 *
 * Ein eigener Zähler, getrennt von den Rechnungen: zwei Nummernkreise, und
 * ein gemeinsamer Zähler machte beide löchrig. Zum Jahreswechsel beginnt er
 * neu bei 1 — das Jahr steht in der Nummer.
 */
export async function reserveQuoteNumber(companyId: string, praefix?: string): Promise<string> {
  void companyId;
  const jahr = new Date().getFullYear();
  const { data, error } = await derClient().rpc('naechste_nummer', {
    p_art: 'quotes',
    p_jahr: jahr,
  });
  if (error) throw new Error(error.message);
  return belegNummer(praefix ?? PRAEFIX_VORGABE.angebot, jahr, Number(data));
}
