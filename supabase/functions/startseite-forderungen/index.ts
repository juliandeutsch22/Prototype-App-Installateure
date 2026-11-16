/**
 * DIE OFFENEN FORDERUNGEN DER STARTSEITE — ZAHLEN UND DIE ERSTEN, NICHT ALLE
 * (Durchsicht 15.11.2026, Budget B3: höchstens 50 Zeilen je Anfrage).
 *
 * Die Startseite holte jede offene Rechnung (gewachsener Bestand: 198 Köpfe),
 * um Mahnlauf, „überfällig, nicht mahnbar“, bald fällige Rücklässe und die
 * Kacheln „Offen“ und „Überfällig“ zu rechnen — gezeigt werden je Abschnitt
 * drei. Die Regeln dafür sind keine einfachen Vergleiche (Mahnstufen, Fristen
 * aus der letzten Mahnung, Rücklass, Mahnkosten nach den Sätzen des
 * Betriebs); eine zweite Fassung in SQL wäre eine zweite Wahrheit. Deshalb
 * rechnet diese Function mit DERSELBEN Fassung wie die App
 * (`shared/forderungen.ts`, `forderungsStand`) und schickt nur das Ergebnis.
 *
 * GELESEN MIT DEN RECHTEN DER ANRUFENDEN PERSON: Schlüssel und Token der
 * Anfrage gehen unverändert an die Datenbank — der Zeilenschutz entscheidet,
 * welche Rechnungen sie sieht, wie bei der Abfrage aus dem Browser bisher.
 */
import { forderungsStand, type MahnkostenSaetze, type RechnungsKopf } from '../_shared/forderungen.ts';
import { mitCors } from '../_eigen/cors.ts';

const URL_BASIS = Deno.env.get('SUPABASE_URL')!;
/** Je Abschnitt so viele Zeilen, wie die Startseite zeigt (`JE_ABSCHNITT`). */
const JE_ABSCHNITT = 3;
/** Wie die Datenbank je Antwort höchstens liefert — darüber wird seitenweise gefragt. */
const SEITE = 1000;
/** Die Felder, die die Regeln lesen — unter den Namen der App. */
const SPALTEN = [
  'id', 'invoiceNumber:invoice_number', 'customerName:customer_name', 'invoiceDate:invoice_date', 'dueDate:due_date',
  'totalBrutto:total_brutto', 'customerVatId:customer_vat_id', 'ruecklassArt:ruecklass_art', 'ruecklassBetrag:ruecklass_betrag',
  'ruecklassBis:ruecklass_bis', 'ruecklassGarantieAm:ruecklass_garantie_am', 'paymentStatus:payment_status',
  'bezahltBetrag:bezahlt_betrag', 'mahnstufe', 'gemahntAm:gemahnt_am', 'mahnfrist',
].join(',');

const antwort = (inhalt: unknown, status = 200) =>
  new Response(JSON.stringify(inhalt), { status, headers: { 'Content-Type': 'application/json' } });

/** Der Betrieb aus dem Token — wie `app.betrieb()` in der Datenbank. */
function betriebAus(token: string): string | null {
  try {
    const teil = token.split('.')[1].replace(/-/g, '+').replace(/_/g, '/');
    const inhalt = JSON.parse(atob(teil.padEnd(teil.length + ((4 - (teil.length % 4)) % 4), '=')));
    const id = inhalt?.app_metadata?.company_id;
    return typeof id === 'string' && id ? id : null;
  } catch {
    return null;
  }
}

/** Leere Felder fallen weg, wie in der Datenschicht der App (`zeileAlsObjekt`). */
function ohneLeere(z: Record<string, unknown>): Record<string, unknown> {
  return Object.fromEntries(Object.entries(z).filter(([, w]) => w !== null));
}

/** Der heutige Tag in Wien, falls die Anfrage keinen nennt. */
function heuteInWien(): string {
  return new Date().toLocaleDateString('sv-SE', { timeZone: 'Europe/Vienna' });
}

Deno.serve(mitCors(async (req: Request): Promise<Response> => {
  if (req.method !== 'POST') return antwort({ error: 'Nur POST.' }, 405);
  const token = (req.headers.get('Authorization') ?? '').replace(/^Bearer\s+/i, '');
  const apikey = req.headers.get('apikey') || Deno.env.get('SUPABASE_ANON_KEY') || '';
  const betrieb = token ? betriebAus(token) : null;
  if (!betrieb) return antwort({ error: 'Nicht angemeldet.' }, 401);
  const rumpf = await req.json().catch(() => ({})) as { heute?: unknown };
  const heute = typeof rumpf.heute === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(rumpf.heute) ? rumpf.heute : heuteInWien();
  const kopf = { apikey, Authorization: `Bearer ${token}` };

  // Sätze des Betriebs und offene Rechnungen gleichzeitig — die Startseite wartet auf beides.
  const saetzeHolen = fetch(`${URL_BASIS}/rest/v1/companies?select=rates&id=eq.${encodeURIComponent(betrieb)}`, { headers: kopf })
    .then(async (r) => (r.ok ? ((await r.json()) as { rates?: MahnkostenSaetze | null }[])[0]?.rates ?? undefined : null));

  // „Teilbezahlt“ gehört dazu — wie `listUnpaidInvoiceKoepfe`: der Kunde schuldet noch etwas.
  const koepfe: Array<RechnungsKopf & { id: string }> = [];
  for (let von = 0; ; von += SEITE) {
    const r = await fetch(
      `${URL_BASIS}/rest/v1/invoices?select=${SPALTEN}&company_id=eq.${encodeURIComponent(betrieb)}`
        + `&payment_status=in.(Offen,%C3%9Cberf%C3%A4llig,Teilbezahlt)&order=id`,
      { headers: { ...kopf, Range: `${von}-${von + SEITE - 1}` } },
    );
    if (!r.ok) return antwort({ error: 'Die offenen Rechnungen ließen sich nicht lesen.' }, r.status === 401 || r.status === 403 ? r.status : 502);
    const teil = (await r.json()) as Record<string, unknown>[];
    koepfe.push(...teil.map((z) => ohneLeere(z) as unknown as RechnungsKopf & { id: string }));
    if (teil.length < SEITE) break;
  }
  const saetze = await saetzeHolen;
  if (saetze === null) return antwort({ error: 'Der Betrieb ließ sich nicht lesen.' }, 502);
  return antwort(forderungsStand(koepfe, heute, saetze, JE_ABSCHNITT));
}));
