import { useEffect, useMemo, useState } from 'react';
import { listBeteiligte } from '@/lib/db/liegenschaften';
import { listCustomersByIds } from '@/lib/db/customers';
import type { Customer, Liegenschaft, LiegenschaftBeteiligter } from '@/types';
import type { WithId } from '@/lib/db/core';
import Button from '@/components/Button';
import { ROLLE_TEXT, vorschlaege } from './liegenschaftText';

/**
 * VORSCHLÄGE AUS DER LIEGENSCHAFT beim Anlegen einer Baustelle (M02c).
 *
 * Kunde aus den Beteiligten (Rechnungsempfänger, Auftraggeber,
 * Hausverwaltung — nur, wer Kunde ist), Ansprechpartner aus dem Nutzer bzw.
 * Mieter des Tops, Adresse aus der Liegenschaft. ES BLEIBT VORSCHLAG: jede
 * Zeile wird erst mit „Übernehmen“ ins Formular geschrieben, und was dort
 * steht, bleibt änderbar. Rechnungen gehen weiter an den Kunden der
 * Baustelle, wie bisher; eine abweichende Rechnungsanschrift je Rechnung
 * gibt es nicht.
 */
export default function LiegenschaftVorschlaege({
  companyId,
  liegenschaft,
  topId,
  heute,
  kundeGewaehlt,
  adresse,
  ansprechpartner,
  onKunde,
  onAdresse,
  onAnsprechpartner,
}: {
  companyId: string;
  liegenschaft: Liegenschaft | null;
  topId: string;
  heute: string;
  /** Die Kennung des Kunden im Formular — ein schon gewählter Vorschlag steht nicht noch einmal da. */
  kundeGewaehlt: string;
  adresse: string;
  ansprechpartner: { name: string; telefon: string };
  onKunde: (kunde: WithId<Customer>) => void;
  onAdresse: (anschrift: string) => void;
  onAnsprechpartner: (a: { name: string; telefon: string }) => void;
}) {
  const [beteiligte, setBeteiligte] = useState<LiegenschaftBeteiligter[] | null>(null);
  const [kunden, setKunden] = useState<Map<string, WithId<Customer>>>(new Map());
  const [fehler, setFehler] = useState(false);
  const liegenschaftId = liegenschaft?.id ?? '';

  useEffect(() => {
    setBeteiligte(null);
    setFehler(false);
    if (!liegenschaftId) return;
    let weg = false;
    void (async () => {
      try {
        const b = await listBeteiligte(companyId, liegenschaftId);
        const ids = [...new Set(b.map((x) => x.customerId).filter((x): x is string => !!x))];
        const k = ids.length > 0 ? await listCustomersByIds(companyId, ids) : [];
        if (weg) return;
        setKunden(new Map(k.map((x) => [x.id, x])));
        setBeteiligte(b);
      } catch {
        if (!weg) setFehler(true);
      }
    })();
    return () => { weg = true; };
  }, [companyId, liegenschaftId]);

  const v = useMemo(
    () => (beteiligte ? vorschlaege(liegenschaft, topId, beteiligte, kunden, heute) : null),
    [beteiligte, liegenschaft, topId, kunden, heute],
  );

  if (!liegenschaft) return null;
  if (fehler) return <p className="text-sm text-ink-deep">Die Beteiligten der Liegenschaft konnten nicht geladen werden — Vorschläge gibt es dann keine.</p>;
  if (!v) return <p className="text-sm text-ink-muted">Vorschläge aus der Liegenschaft werden geladen …</p>;

  const kundenZeilen = v.kunden.filter((k) => k.customerId !== kundeGewaehlt && kunden.has(k.customerId));
  const adresseZeile = v.adresse && v.adresse !== adresse.trim() ? v.adresse : null;
  const ap = v.ansprechpartner && (v.ansprechpartner.name !== ansprechpartner.name.trim() || v.ansprechpartner.telefon !== ansprechpartner.telefon.trim())
    ? v.ansprechpartner : null;
  if (kundenZeilen.length === 0 && !adresseZeile && !ap) return null;

  return (
    <section aria-label="Vorschläge aus der Liegenschaft" className="flex flex-col gap-2">
      <p className="section-label">Vorschläge aus der Liegenschaft</p>
      <ul className="divide-y divide-line">
        {kundenZeilen.map((k) => {
          const kunde = kunden.get(k.customerId)!;
          return (
            <li key={k.customerId} className="flex flex-wrap items-center justify-between gap-2 py-1">
              <span className="min-w-0 text-sm text-ink">
                Kunde: {kunde.name}
                <span className="block text-xs text-ink-muted">{ROLLE_TEXT[k.rolle]}{k.amTop ? ' des Tops' : ''}</span>
              </span>
              <Button type="button" variant="secondary" groesse="klein" onClick={() => onKunde(kunde)}
                aria-label={`${kunde.name} als Kunde übernehmen`}>
                Übernehmen
              </Button>
            </li>
          );
        })}
        {adresseZeile && (
          <li className="flex flex-wrap items-center justify-between gap-2 py-1">
            <span className="min-w-0 text-sm text-ink">Baustellenadresse: {adresseZeile}</span>
            <Button type="button" variant="secondary" groesse="klein" onClick={() => onAdresse(adresseZeile)}
              aria-label="Anschrift der Liegenschaft als Baustellenadresse übernehmen">
              Übernehmen
            </Button>
          </li>
        )}
        {ap && (
          <li className="flex flex-wrap items-center justify-between gap-2 py-1">
            <span className="min-w-0 text-sm text-ink">
              Ansprechpartner vor Ort: {[ap.name, ap.telefon].filter(Boolean).join(' · ')}
              <span className="block text-xs text-ink-muted">{ROLLE_TEXT.nutzer} des Tops</span>
            </span>
            <Button type="button" variant="secondary" groesse="klein" onClick={() => onAnsprechpartner(ap)}
              aria-label="Nutzer des Tops als Ansprechpartner übernehmen">
              Übernehmen
            </Button>
          </li>
        )}
      </ul>
    </section>
  );
}
