/**
 * Die öffentliche Seite des Annahme-Links (M02a) spricht mit der Edge
 * Function `angebot-annahme` — ohne Anmeldung, ohne den Client der App.
 *
 * WARUM NICHT `supabaseClient().functions.invoke`. Der Kunde hat kein Konto;
 * der Client der App würde beim Erzeugen nach einer Sitzung in der Adresse
 * suchen und eine vorhandene Sitzung (das Büro, das den Link selbst
 * ausprobiert) mitschicken. Beides braucht die Function nicht, und eine
 * Anmeldung im Kopf sähe aus, als hinge die Antwort an ihr. Ein schlichtes
 * `fetch` an dieselbe Adresse, die die App ohnehin anspricht
 * (`VITE_SUPABASE_URL`), passt zur Inhaltsregel (`connect-src`).
 *
 * Der Schlüssel geht im Rumpf, nie in der Adresse: so steht er in keinem
 * Zugriffsprotokoll.
 */
import type { InvoiceDiscount, Quote } from '@/types';
import type { AusstellerAngaben } from '@/lib/aussteller';

/** Der Stand, den der Kunde sieht — so, wie `app.angebot_link_schnappschuss` ihn festhält. */
export interface AnnahmeStand {
  angebot: Quote;
  kunde: { name?: string; address?: string; vatId?: string } | null;
  aussteller: AusstellerAngaben;
}

export type AnnahmeAntwort =
  | {
      zustand: 'offen' | 'angenommen' | 'abgelehnt';
      /** Letzter gültiger Tag, `JJJJ-MM-TT`. */
      gueltigBis: string;
      stand: AnnahmeStand;
      /** Prüfsumme des Stands (SHA-256, hex). */
      pruefsumme: string;
      /** Bei einer Entscheidung: wann (ISO) und von wem. */
      entschiedenAm?: string;
      name?: string;
      /** Bei Annahme und Ablehnung: diese Anfrage hat entschieden (nicht eine frühere). */
      neu?: boolean;
    }
  | { zustand: 'ungueltig' }
  | { zustand: 'zu_viele'; grund: string }
  | { zustand: 'fehler'; grund: string };

export type AnnahmeAnfrage =
  | { aktion: 'abruf'; schluessel: string }
  | { aktion: 'annehmen'; schluessel: string; name: string; bestaetigt: boolean; unterschrift: string }
  | { aktion: 'ablehnen'; schluessel: string; name: string; grund: string };

const zahl = (w: unknown): number => (typeof w === 'number' && Number.isFinite(w) ? w : Number(w ?? 0) || 0);
const text = (w: unknown): string | undefined => (typeof w === 'string' && w !== '' ? w : undefined);

/**
 * Den Stand aus der Antwort lesen — und nur, was wirklich darin steht. Was
 * fehlt oder eine andere Form hat, wirft: eine halbe Seite, auf der der
 * Kunde etwas verbindlich annimmt, ist schlimmer als eine Fehlermeldung.
 */
export function standLesen(roh: unknown): AnnahmeStand {
  const s = roh as Record<string, unknown> | null;
  const a = s?.angebot as Record<string, unknown> | undefined;
  if (!a || typeof a.quoteNumber !== 'string' || !Array.isArray(a.positions)) {
    throw new Error('Der Stand des Angebots ist unvollständig.');
  }
  const rabatt = a.discount as Record<string, unknown> | null | undefined;
  const discount: InvoiceDiscount | null = rabatt && (rabatt.mode === 'percent' || rabatt.mode === 'amount')
    ? { mode: rabatt.mode, value: zahl(rabatt.value), ...(text(rabatt.label) ? { label: text(rabatt.label) } : {}) }
    : null;
  const positions: Quote['positions'] = (a.positions as Record<string, unknown>[]).map((p) => {
    const pos: Quote['positions'][number] = {
      label: String(p.label ?? ''),
      qty: zahl(p.qty),
      unit: String(p.unit ?? ''),
      unitPrice: zahl(p.unitPrice),
      netto: zahl(p.netto),
    };
    // Wie die Datenschicht: nur, was von der gewöhnlichen Position abweicht (M18).
    if (p.art === 'titel' || p.art === 'text') pos.art = p.art;
    if (p.rabattProzent != null) pos.rabattProzent = zahl(p.rabattProzent);
    return pos;
  });
  const angebot: Quote = {
    id: '',
    companyId: '',
    status: 'Versendet',
    kalkulierteStunden: 0,
    quoteNumber: a.quoteNumber,
    quoteDate: String(a.quoteDate ?? ''),
    validUntil: String(a.validUntil ?? ''),
    customerName: String(a.customerName ?? ''),
    ...(text(a.address) ? { address: text(a.address) } : {}),
    ...(text(a.notes) ? { notes: text(a.notes) } : {}),
    vatRate: zahl(a.vatRate),
    discount,
    discountAmount: zahl(a.discountAmount),
    subtotalNetto: zahl(a.subtotalNetto),
    totalNetto: zahl(a.totalNetto),
    totalVat: zahl(a.totalVat),
    totalBrutto: zahl(a.totalBrutto),
    positions,
  };
  const k = s?.kunde as Record<string, unknown> | null | undefined;
  const kunde = k ? { name: text(k.name), address: text(k.address), vatId: text(k.vatId) } : null;
  const aussteller = (s?.aussteller && typeof s.aussteller === 'object' ? s.aussteller : {}) as AusstellerAngaben;
  return { angebot, kunde, aussteller };
}

/** Eine Anfrage an die Function — der Abruf beim Öffnen, Annahme und Ablehnung. */
export async function annahmeAnfrage(anfrage: AnnahmeAnfrage): Promise<AnnahmeAntwort> {
  const basis = String(import.meta.env.VITE_SUPABASE_URL ?? '').trim().replace(/\/+$/, '');
  const frist = typeof AbortSignal !== 'undefined' && typeof AbortSignal.timeout === 'function'
    ? AbortSignal.timeout(30_000)
    : undefined;
  const r = await fetch(`${basis}/functions/v1/angebot-annahme`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(anfrage),
    signal: frist,
  });
  const d = (await r.json().catch(() => null)) as Record<string, unknown> | null;
  if (r.status === 404) return { zustand: 'ungueltig' };
  if (r.status === 429) return { zustand: 'zu_viele', grund: String(d?.grund ?? 'Bitte später erneut versuchen.') };
  if (r.status === 400 || r.status === 413 || r.status === 422) {
    return { zustand: 'fehler', grund: String(d?.grund ?? 'Die Angaben sind unvollständig.') };
  }
  if (!r.ok || !d) throw new Error(String(d?.grund ?? 'Der Dienst ist gerade nicht erreichbar.'));
  const zustand = d.zustand;
  if (zustand !== 'offen' && zustand !== 'angenommen' && zustand !== 'abgelehnt') return { zustand: 'ungueltig' };
  return {
    zustand,
    gueltigBis: String(d.gueltig_bis ?? ''),
    stand: standLesen(d.schnappschuss),
    pruefsumme: String(d.pruefsumme ?? ''),
    ...(typeof d.entschieden_am === 'string' ? { entschiedenAm: d.entschieden_am } : {}),
    ...(typeof d.name === 'string' ? { name: d.name } : {}),
    ...(typeof d.neu === 'boolean' ? { neu: d.neu } : {}),
  };
}
