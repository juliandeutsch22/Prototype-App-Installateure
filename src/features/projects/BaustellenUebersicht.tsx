import { useEffect, useState } from 'react';
import { listEntriesForProjects } from '@/lib/db/timeEntries';
import { groupProjectHours, calcBudgetState, calcWorkMin, fmtStd, balkenBreite, fmtStunden } from '@/lib/time';
import type { Project, TimeEntry } from '@/types';
import { EmptyState, TeilFehler } from '@/components/States';
import { datumAT } from '@/lib/datum';

/**
 * Wie eine einzelne Baustelle steht — an der Baustelle, nicht im Monatsbericht.
 *
 * WARUM ES DIESE ANSICHT ZUSÄTZLICH GIBT. Die Projektauswertung unter der
 * Mitarbeiterübersicht beantwortet eine Monatsfrage über alle Baustellen:
 * „wohin gingen die Stunden im September?" Hier steht die andere Frage, und
 * es ist die, die man beim Blick auf eine Baustelle tatsächlich hat: „wie
 * steht DIESE Baustelle?" — über ihre ganze Laufzeit, nicht über einen Monat.
 *
 * Beide aus einer Quelle (`listEntriesForProjects`), damit sie nicht
 * auseinanderlaufen können.
 *
 * OHNE GELD. Erlös, Kosten und Deckungsbeitrag stehen in der
 * Nachkalkulation und sind Geschäftsführungssache; diese Ansicht sieht auch
 * die Projektleitung. Stunden gegen ein Stundenbudget sind kein Einblick in
 * Margen — das Budget steht in derselben Liste ohnehin schon als Pille.
 */

const BAR_TONE = {
  success: 'bg-success',
  warning: 'bg-warning',
  danger: 'bg-accent',
  neutral: 'bg-line',
} as const;

interface Person {
  name: string;
  fachMin: number;
  helperMin: number;
}

type Stand =
  | { art: 'laedt' }
  | { art: 'fehler' }
  | {
      art: 'bereit';
      fachMin: number;
      helperMin: number;
      personen: Person[];
      zuletzt: string | null;
    };

/** 'YYYY-MM-DD' -> '15.06.2026'. */
const fmtDatum = (iso: string) => datumAT(iso);

export default function BaustellenUebersicht({
  companyId,
  projekt,
}: {
  companyId: string;
  projekt: Project;
}) {
  const [stand, setStand] = useState<Stand>({ art: 'laedt' });
  const [versuch, setVersuch] = useState(0);

  const nummer = projekt.projectNumber;

  /*
    ERST BEIM AUFKLAPPEN GELADEN. Alle Baustellen im Voraus zu laden hiesse,
    für zwanzig Zeilen zwanzig Abfragen zu stellen — für die eine, die
    jemanden interessiert.
  */
  useEffect(() => {
    let weg = false;
    setStand({ art: 'laedt' });
    void (async () => {
      try {
        const eintraege = await listEntriesForProjects(companyId, [nummer]);
        if (weg) return;
        setStand(auswerten(eintraege));
      } catch {
        if (!weg) setStand({ art: 'fehler' });
      }
    })();
    return () => {
      weg = true;
    };
  }, [companyId, nummer, versuch]);

  if (stand.art === 'laedt') {
    return <p className="text-sm text-ink-muted">Stunden werden geladen …</p>;
  }
  if (stand.art === 'fehler') {
    return <TeilFehler was="die Stunden dieser Baustelle" onRetry={() => setVersuch((v) => v + 1)} />;
  }

  const budget = calcBudgetState(stand.fachMin, projekt.estimatedHours);

  if (stand.fachMin === 0 && stand.helperMin === 0) {
    return (
      <EmptyState>Auf diese Baustelle ist noch keine Stunde gebucht.</EmptyState>
    );
  }

  return (
    <div className="space-y-3">
      <p className="text-sm">
        <span className="font-semibold text-ink">{fmtStd(stand.fachMin)} h</span>{' '}
        <span className="text-ink-muted">Fachzeit</span>
        {projekt.estimatedHours ? (
          <span className="text-ink-muted"> von {fmtStunden(projekt.estimatedHours)} h Budget</span>
        ) : null}
        {/*
          Helferstunden zählen NICHT gegen das Budget — sie werden zwar
          verrechnet, sind für die Kalkulation aber kostenneutral. Dieselbe
          Regel wie in der Projektauswertung; stünden sie hier mit drin, käme
          dieselbe Baustelle an zwei Stellen auf zwei Prozentwerte.
        */}
        {stand.helperMin > 0 && (
          <span className="text-ink-muted"> · +{fmtStd(stand.helperMin)} h Helfer</span>
        )}
      </p>

      {budget.pct !== null ? (
        <div className="flex items-center gap-2">
          <span className="h-1.5 flex-1 overflow-hidden rounded-pill bg-surface-3">
            <span
              className={`block h-full ${BAR_TONE[budget.tone]}`}
              style={{ width: balkenBreite(budget.pct) }}
            />
          </span>
          <span
            className={`shrink-0 text-xs font-semibold ${
              budget.over ? 'text-accent' : 'text-ink-muted'
            }`}
          >
            {budget.pct} %
          </span>
        </div>
      ) : (
        <p className="text-xs text-ink-muted">
          Kein Stundenbudget hinterlegt — ohne Budget gibt es keinen Stand, nur eine Summe.
        </p>
      )}

      <div className="flex flex-wrap gap-2">
        {stand.personen.map((p) => (
          <span
            key={p.name}
            className="inline-flex items-center gap-2 rounded-pill border border-line bg-surface px-3 py-1 text-xs"
          >
            <span className="font-semibold text-ink">{p.name}</span>
            <span className="text-ink-muted">{fmtStd(p.fachMin)} h</span>
            {p.helperMin > 0 && (
              <span className="text-ink-muted">+{fmtStd(p.helperMin)} h Helfer</span>
            )}
          </span>
        ))}
      </div>

      {stand.zuletzt && (
        <p className="text-xs text-ink-muted">Zuletzt gebucht am {fmtDatum(stand.zuletzt)}.</p>
      )}
    </div>
  );
}

/**
 * Aus den Einträgen die drei Zahlen, auf die es ankommt.
 *
 * Ausgelagert, weil sie sich so prüfen lassen, ohne eine Ansicht zu zeichnen —
 * und weil `groupProjectHours` bereits entscheidet, was zählt: nur
 * „Anwesend", nur Einträge mit Baustelle, nur solche mit Arbeitszeit.
 */
function auswerten(eintraege: TimeEntry[]): Extract<Stand, { art: 'bereit' }> {
  const gruppe = groupProjectHours(eintraege)[0];
  if (!gruppe) {
    return { art: 'bereit', fachMin: 0, helperMin: 0, personen: [], zuletzt: null };
  }

  const nachPerson = new Map<string, Person>();
  for (const e of gruppe.entries) {
    const schluessel = e.userId || 'unbekannt';
    const cur = nachPerson.get(schluessel) ?? {
      name: e.userName || 'Unbekannt',
      fachMin: 0,
      helperMin: 0,
    };
    // Dieselbe Aufteilung wie in `groupProjectHours` — dort steht auch, was
    // ueberhaupt als Arbeitszeit zaehlt.
    const min = calcWorkMin(e);
    if (e.isHelper) cur.helperMin += min;
    else cur.fachMin += min;
    nachPerson.set(schluessel, cur);
  }

  return {
    art: 'bereit',
    fachMin: gruppe.fachMin,
    helperMin: gruppe.helperMin,
    // Groesster Beitrag zuerst: wer die Baustelle getragen hat, steht vorn.
    personen: [...nachPerson.values()].sort(
      (a, b) => b.fachMin + b.helperMin - (a.fachMin + a.helperMin),
    ),
    zuletzt: gruppe.entries.reduce<string | null>(
      (max, e) => (max === null || e.date > max ? e.date : max),
      null,
    ),
  };
}
