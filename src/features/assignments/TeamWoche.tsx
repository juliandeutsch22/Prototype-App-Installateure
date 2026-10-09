import { useMemo, useState } from 'react';
import { bezugText, terminKopf } from '@/features/termine/terminText';
import { todayStr, getAustrianHolidayName, isWeekend } from '@/lib/time';
import type { Termin } from '@/types';
import Card from '@/components/Card';
import Button from '@/components/Button';
import PageHeader from '@/components/PageHeader';
import { ErrorState, EmptyState, TeilFehler } from '@/components/States';
import { useAuth } from '@/app/AuthContext';
import { montagDer, wocheAb, wocheVerschoben } from './wochenplan';
import { wochenTitel } from './planungKopf';
import { tagKurz, type TagStand } from './planTypen';
import { PersonenRaster } from './PlanRaster';
import { useWochenDaten } from './useWochenDaten';

/**
 * DIE TEAM-WOCHE für alle Mitarbeiter (Betriebseinstellung „Wochenplan für
 * alle"). Dieselbe Rechnung, dieselben Daten wie die Einsatzplanung — aber
 * nichts zum Antippen und kein „frei" (das ist eine Frage der Planung, nicht
 * des Teams). Die Abwesenheiten kommen aus `wochenplan_abwesend`; den Grund
 * gibt die Datenbank nur dem heraus, der ihn sehen darf — dem Monteur nie,
 * dort steht „abwesend".
 *
 * SEIT RUNDE 4 EINE EIGENE ANSICHT. Die Einsatzplanung hat ein neues Raster
 * mit Seitenfenstern bekommen; die Team-Woche bleibt genau, wie sie war
 * (Auftrag 4.8). Getrennt ist nur das Zeichnen — gerechnet wird für beide in
 * `useWochenDaten`. Das DOM hält `tests/components/TeamWoche.test.tsx` fest.
 */
export default function TeamWoche() {
  const { user } = useAuth();
  const heute = todayStr();
  const [montag, setMontag] = useState(() => montagDer(heute));
  /** Eingeklappte Gruppen im Raster. */
  const [zuGruppen, setZuGruppen] = useState<Set<string>>(new Set());
  const tage = useMemo(() => wocheAb(montag), [montag]);
  const d = useWochenDaten(tage);

  if (!user) return null;

  const kopf = wochenTitel(montag, heute);
  const jetzt = montag === montagDer(heute);

  return (
    <div className="space-y-4 lg:space-y-5">
      <PageHeader
        ort="Mein Einsatzplan"
        title="Team-Woche"
        subtitle="Wer ist diese Woche wo"
        hilfe={
          <>
            Zeigt, wer an welchem Tag auf welcher Baustelle eingeteilt ist. Geplant wird im
            Büro; bei Fragen zur Einteilung bitte dort melden. Wer abwesend ist, steht ohne
            Grund da. Der Plan zeigt Einsätze, nicht gebuchte Zeiten.
          </>
        }
      />

      {d.nebenFehler && <TeilFehler was={d.nebenFehler} />}
      {d.error && <ErrorState message={d.error} />}

      <div className="planung-steuerung">
        {/*
          EINE ZEILE, AUCH AUF 390 px: Pfeile, dazwischen groß „Diese Woche“
          und klein die KW. Die Pfeile sind 48 × 48 px (`min-h-touch` aus
          `Button`, `min-w-touch` hier); `sm:text-xl` neben `text-xl`, weil
          `Button` ab 640 px `sm:text-base` mitbringt (Launch-Check 25.09.2026).
        */}
        <div className="planung-woche">
          <Button variant="ghost" aria-label="Woche zurück" className="min-w-touch text-xl sm:text-xl" onClick={() => setMontag(wocheVerschoben(montag, -1))}>
            ‹
          </Button>
          <div className="planung-titelblock">
            <h2 className="planung-titel">{kopf.titel}</h2>
            <p className="planung-kw">{kopf.klein}</p>
          </div>
          <Button variant="ghost" aria-label="Woche vor" className="min-w-touch text-xl sm:text-xl" onClick={() => setMontag(wocheVerschoben(montag, 1))}>
            ›
          </Button>
          {/* Zurück zu heute — nur, wo man nicht schon dort ist. */}
          {!jetzt && (
            <Button variant="ghost" onClick={() => setMontag(montagDer(heute))}>
              Diese Woche
            </Button>
          )}
        </div>
      </div>

      {d.staff.length === 0 ? (
        <Card buendig>
          <EmptyState>
            Keine aktiven Mitarbeiter im Außendienst. Ohne sie gibt es nichts einzuteilen.
          </EmptyState>
        </Card>
      ) : (
        <div>
          <Card buendig>
            <PersonenRaster
              tage={tage}
              heute={heute}
              gruppen={d.gruppen}
              zu={zuGruppen}
              onGruppe={(g) =>
                setZuGruppen((alt) => {
                  const neu = new Set(alt);
                  if (neu.has(g)) neu.delete(g);
                  else neu.add(g);
                  return neu;
                })
              }
              brett={d.brett}
              zuAm={d.zuAm}
              zuFuer={d.zuFuer}
              termine={d.termine}
              termineAm={d.termineAm}
            />

            {/*
              DIE TAGESLISTE — die Telefonansicht: erst der Tag, dann wer dort
              ist. Kein waagrechter Bildlauf, keine stehende Spalte.
            */}
            <section aria-label="Wochenplan als Liste" className="md:hidden">
              {tage.map((tag) => (
                <TagesAbschnitt
                  key={tag}
                  tag={tag}
                  heute={heute}
                  stand={d.proTag.get(tag)}
                  zu={d.zuAm.get(tag)}
                  termine={d.termineAm(tag)}
                />
              ))}
            </section>
          </Card>
        </div>
      )}
    </div>
  );
}

/** Ein Tag der Telefonansicht: Termine, Baustellen mit Namen, abwesend. */
function TagesAbschnitt({
  tag,
  heute,
  stand,
  zu,
  termine,
}: {
  tag: string;
  heute: string;
  stand: TagStand | undefined;
  zu: string | undefined;
  termine: Termin[];
}) {
  const { wochentag, datum } = tagKurz(tag);
  const feiertag = getAustrianHolidayName(new Date(`${tag}T00:00:00`));
  const wochenende = isWeekend(new Date(`${tag}T00:00:00`));
  return (
    // Die Tage durch Linien getrennt von Kante zu Kante — keine Karte in der Karte.
    <div className={`border-t border-line ${tag === heute ? 'bg-petrol-hell' : feiertag || wochenende || zu ? 'bg-surface-2' : ''}`}>
      <div className="flex flex-wrap items-baseline justify-between gap-2 px-4 pb-1 pt-3">
        <span className="font-semibold text-ink">
          {wochentag}, {datum}
          {tag === heute && <span className="ml-2 text-sm text-ink-muted">heute</span>}
          {feiertag && <span className="ml-2 text-sm font-normal text-ink-muted">{feiertag}</span>}
        </span>
        {zu && <span className="text-sm text-ink-muted">Betriebsurlaub</span>}
      </div>

      <div className="space-y-2 px-4 pb-3">
        {termine.length > 0 && (
          <ul aria-label={`Termine am ${datum}`} className="space-y-1">
            {termine.map((tt) => (
              <li key={tt.id} className="text-sm">
                <span className="font-normal text-ink">{terminKopf(tt)}</span>{' '}
                <span className="text-ink-muted">· {bezugText(tt)}</span>
              </li>
            ))}
          </ul>
        )}
        {stand && stand.baustellen.length > 0 ? (
          stand.baustellen.map((b) => (
            <div key={b.nummer} className={b.fehlen.length > 0 ? 'tag-karte-konflikt-lesen' : 'tag-karte-lesen'}>
              <span className="block font-normal text-ink">
                {b.zeit && <span className="plan-zeit">{b.zeit}</span>}
                {b.name} <span className="font-normal text-ink-muted">· {b.nummer}</span>
              </span>
              <span className="block text-sm text-ink-muted">
                {b.namen.map((n) => (b.helfer.includes(n) ? `${n} (Helfer)` : n)).join(', ')}
              </span>
              {/*
                Wer eingeteilt ist und fehlt — und ob damit niemand mehr da ist
                (M33). Bernstein, nicht Rot: ein Konflikt, kein Fehler.
              */}
              {b.fehlen.length > 0 && (
                <span className="block text-sm font-semibold text-warning">
                  {b.namen.length === 0 ? 'Unbesetzt — ' : ''}fehlt: {b.fehlen.join(', ')}
                </span>
              )}
            </div>
          ))
        ) : zu ? (
          <p className="text-sm text-ink-muted">Betriebsurlaub — {zu}.</p>
        ) : (
          // Stehen darüber Termine, wäre „Nichts geplant" ein Widerspruch.
          <p className="text-sm text-ink-muted">{termine.length > 0 ? 'Kein Einsatz geplant.' : 'Nichts geplant.'}</p>
        )}

        {stand && stand.urlaub.length > 0 && (
          <p className="text-sm text-ink-muted">
            <span className="font-normal text-ink">Abwesend:</span> {stand.urlaub.join(', ')}
          </p>
        )}
      </div>
    </div>
  );
}
