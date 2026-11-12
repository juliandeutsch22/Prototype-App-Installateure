import { Link } from 'react-router-dom';
import Card from '@/components/Card';
import StatusBadge from '@/components/StatusBadge';
import { Stempel } from '@/components/Planlinie';
import { AktenAngaben, AktenAngabe, AktenVerweis } from '@/components/AktenBereiche';
import { EmptyState, SkeletonList, TeilFehler } from '@/components/States';
import { datumAT } from '@/lib/datum';
import { euro } from '@/lib/betrag';
import { offenerRest } from '@/features/invoices/zahlstand';
import type { Assignment, Invoice } from '@/types';
import type { WithId } from '@/lib/db/core';
import type { Materialstand } from '@/lib/db/projects';
import { nachTag } from './akteEinsatztage';

/**
 * DIE AKTE ALS DREHSCHEIBE (B1, E84, 12.11.2026).
 *
 * Zur Baustelle mit Rechnung, zwei Anforderungen und Einsatz heute zeigte
 * die Akte nichts davon: Einsätze standen nur in der Planung, Material nur
 * in den Anforderungen, Rechnungen nur in den Rechnungen. Die Übersicht
 * trägt jetzt drei kurze Blöcke mit dem Weg zu „Alle …“. Die Daten gab es;
 * die Rechte bleiben, wie sie sind — wer etwas nicht sehen darf, bekommt
 * den Block nicht, statt eines leeren.
 *
 * Alle drei lesen nur, was die Akte ihnen gibt: `null` heißt „lädt“,
 * `'fehler'` „nicht geladen“ — das ist nie dasselbe wie „keiner“.
 */

export type Laden<T> = T | null | 'fehler';

export interface EinsatzLage {
  kommend: WithId<Assignment>[];
  vorher: WithId<Assignment>[];
}

const tagText = (iso: string) =>
  `${new Intl.DateTimeFormat('de-AT', { weekday: 'short', timeZone: 'UTC' }).format(new Date(`${iso}T00:00:00Z`))} ${datumAT(iso)}`;

function TagZeile({ tag }: { tag: { datum: string; leute: string[] } }) {
  return <><span className="font-mono">{tagText(tag.datum)}</span>{tag.leute.length > 0 ? ` · ${tag.leute.join(', ')}` : ''}</>;
}

/** In der Übersicht: der nächste und der letzte Einsatztag. */
export function EinsaetzeVorschau({ lage, namen }: { lage: Laden<EinsatzLage>; namen: (uid: string) => string | undefined }) {
  return (
    <Card title="Einsätze" action={<AktenVerweis bereich="planung">Alle Einsätze</AktenVerweis>}>
      {lage === 'fehler' ? <TeilFehler was="die Einsätze" />
        : lage === null ? <SkeletonList rows={1} />
        : lage.kommend.length + lage.vorher.length === 0 ? <EmptyState>Noch kein Einsatz geplant.</EmptyState>
        : (() => {
            const naechster = nachTag(lage.kommend, namen)[0];
            const letzter = nachTag(lage.vorher, namen)[0];
            return (
              <AktenAngaben>
                <AktenAngabe wort="Nächster Einsatz">{naechster ? <TagZeile tag={naechster} /> : 'keiner geplant'}</AktenAngabe>
                <AktenAngabe wort="Zuletzt">{letzter ? <TagZeile tag={letzter} /> : 'noch keiner'}</AktenAngabe>
              </AktenAngaben>
            );
          })()}
    </Card>
  );
}

/**
 * Im Bereich „Termine“: die Einsatztage selbst, kommend und zuletzt. Mit
 * Grenze je Richtung (`einsaetzeDerBaustelle`); ist sie erreicht, steht es
 * da, und die Planung zeigt den Rest.
 */
export function EinsaetzeListe({ lage, namen, grenze }: { lage: Laden<EinsatzLage>; namen: (uid: string) => string | undefined; grenze: number }) {
  if (lage === 'fehler') return <Card title="Einsätze"><TeilFehler was="die Einsätze" /></Card>;
  if (lage === null) return <Card title="Einsätze"><SkeletonList rows={2} /></Card>;
  const kommend = nachTag(lage.kommend, namen);
  const vorher = nachTag(lage.vorher, namen);
  const abschnitt = (titel: string, tage: typeof kommend, voll: boolean, leer: string) => (
    <section aria-label={titel}>
      <h3 className="section-label">{titel}</h3>
      {tage.length === 0 ? <p className="text-sm text-ink-muted">{leer}</p> : (
        <ul className="akten-einsaetze">
          {tage.map((t) => <li key={t.datum}><TagZeile tag={t} /></li>)}
        </ul>
      )}
      {voll && <p className="mt-1 text-sm text-ink-muted">Weitere Tage stehen in der Einsatzplanung.</p>}
    </section>
  );
  return (
    <Card title="Einsätze" id="b-einsaetze">
      {kommend.length + vorher.length === 0 ? <EmptyState>Noch kein Einsatz geplant.</EmptyState> : (
        <div className="space-y-4">
          {abschnitt('Kommend', kommend, lage.kommend.length >= grenze, 'Keiner geplant.')}
          {abschnitt('Zuletzt', vorher, lage.vorher.length >= grenze, 'Noch keiner.')}
        </div>
      )}
    </Card>
  );
}

/** Material: angefordert, abgeholt, zurückgebracht und laut Scheinen verbaut — gezählt in der Datenbank. */
export function MaterialVorschau({ stand, projectNumber }: { stand: Laden<Materialstand>; projectNumber: string }) {
  return (
    <Card
      title="Material"
      action={<Link to={`/anforderungen?suche=${encodeURIComponent(projectNumber)}`} className="link-still link-still-weiter akten-verweis">Alle Anforderungen</Link>}
    >
      {stand === 'fehler' ? <TeilFehler was="das Material" />
        : stand === null ? <SkeletonList rows={1} />
        : stand.angefordert + stand.abholbereit + stand.abgeholt + stand.zurueck + stand.scheineMitMaterial === 0
          ? <EmptyState>Für diese Baustelle ist noch kein Material angefordert oder verbaut.</EmptyState>
          : (
            <AktenAngaben>
              <AktenAngabe wort="Angefordert, offen"><span className="font-mono">{stand.angefordert}</span></AktenAngabe>
              <AktenAngabe wort="Abholbereit"><span className="font-mono">{stand.abholbereit}</span></AktenAngabe>
              <AktenAngabe wort="Abgeholt"><span className="font-mono">{stand.abgeholt}</span></AktenAngabe>
              <AktenAngabe wort="Zurückgebracht"><span className="font-mono">{stand.zurueck}</span></AktenAngabe>
              <AktenAngabe wort="Laut Scheinen verbaut" breit>
                {stand.positionen === 0 ? 'noch nichts'
                  : <><span className="font-mono">{stand.positionen}</span> {stand.positionen === 1 ? 'Position' : 'Positionen'} auf <span className="font-mono">{stand.scheineMitMaterial}</span> {stand.scheineMitMaterial === 1 ? 'Schein' : 'Scheinen'}</>}
              </AktenAngabe>
            </AktenAngaben>
          )}
    </Card>
  );
}

/** Rechnungen: Stand und Summe, die jüngsten drei — nur für Rollen, die Rechnungen sehen. */
export function RechnungenVorschau({ rechnungen, projectNumber }: { rechnungen: Laden<WithId<Invoice>[]>; projectNumber: string }) {
  const gueltig = Array.isArray(rechnungen) ? rechnungen.filter((r) => r.paymentStatus !== 'Storniert') : [];
  const offen = gueltig.reduce((s, r) => s + offenerRest(r), 0);
  const gestellt = gueltig.reduce((s, r) => s + (Number(r.totalBrutto) || 0), 0);
  const juengste = [...gueltig].sort((a, b) => (b.invoiceDate ?? '').localeCompare(a.invoiceDate ?? '')).slice(0, 3);
  return (
    <Card
      title="Rechnungen"
      action={<Link to={`/invoices?suche=${encodeURIComponent(projectNumber)}`} className="link-still link-still-weiter akten-verweis">Alle Rechnungen</Link>}
    >
      {rechnungen === 'fehler' ? <TeilFehler was="die Rechnungen" />
        : rechnungen === null ? <SkeletonList rows={1} />
        : gueltig.length === 0 ? <EmptyState>Zu dieser Baustelle gibt es noch keine Rechnung.</EmptyState>
        : (
          <>
            <AktenAngaben>
              <AktenAngabe wort="Gestellt">
                <span className="font-mono">{euro(gestellt)}</span> brutto · {gueltig.length === 1 ? '1 Rechnung' : `${gueltig.length} Rechnungen`}
              </AktenAngabe>
              <AktenAngabe wort="Offen"><span className="font-mono">{euro(offen)}</span></AktenAngabe>
            </AktenAngaben>
            <ul className="akten-belege">
              {juengste.map((r) => (
                <li key={r.id}>
                  <Link className="akten-belegzeile" to={`/invoices?oeffnen=${encodeURIComponent(r.id)}`}>
                    <span className="akten-zeile-inhalt"><span>Rechnung · {datumAT(r.invoiceDate)}</span><span><Stempel>{r.invoiceNumber}</Stempel></span></span>
                    <span className="akten-belegstand"><StatusBadge status={r.paymentStatus} /></span>
                    <span className="akten-belegbetrag">{euro(r.totalBrutto)} <small>brutto</small></span>
                  </Link>
                </li>
              ))}
            </ul>
          </>
        )}
    </Card>
  );
}
