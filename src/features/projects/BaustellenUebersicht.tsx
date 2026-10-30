import { useEffect, useState } from 'react';
import { stundenDerBaustellen, type BaustellenStunden } from '@/lib/db/timeEntries';
import { calcBudgetState, fmtStd, fmtStunden } from '@/lib/time';
import type { Project } from '@/types';
import { TeilFehler } from '@/components/States';
import { Masslinie, MasslinieZeile } from '@/components/Planlinie';
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

/*
  DIE FÜNF ZUSTÄNDE DER LINIE „LOT“: im Rahmen Petrol, knapp Bernstein, über
  dem Budget Rot. Bis zum Umbau stand „über Budget“ in der Hausfarbe
  (`accent`) — und die ist bei den meisten Betrieben dasselbe Petrol wie „im
  Rahmen“; das Überziehen sah aus wie ein guter Stand.
*/
const RING_TON = {
  success: 'text-success',
  warning: 'text-warning',
  danger: 'text-danger',
  neutral: 'text-ink-muted',
} as const;

interface Person {
  name: string;
  /** Was gegen das Budget läuft — Fach und Lehrlinge, deren Stunden ins Budget zählen. */
  fachMin: number;
  /** Davon von einem Lehrling (Runde 6, G18). */
  lehrlingImBudgetMin: number;
  helperMin: number;
  lehrlingMin: number;
}

/*
  „FACHZEIT“ WAR FALSCH, SOBALD EIN LEHRLING MITZÄHLT (Runde 6, G18): „45,0 h
  Fachzeit von 16 h Budget“ enthielt 16 h Lehrling. Die Zahl bleibt dieselbe
  — sie ist, was gegen das Budget läuft —, die Beschriftung nennt den Anteil.
*/
function davonLehrling(min: number): string {
  return min > 0 ? ` (davon ${fmtStd(min)} h Lehrling)` : '';
}

type Stand =
  | { art: 'laedt' }
  | { art: 'fehler' }
  | {
      art: 'bereit';
      fachMin: number;
      lehrlingImBudgetMin: number;
      helperMin: number;
      lehrlingMin: number;
      personen: Person[];
      zuletzt: string | null;
    };

/** 'YYYY-MM-DD' -> '15.06.2026'. */
const fmtDatum = (iso: string) => datumAT(iso);

export default function BaustellenUebersicht({
  companyId,
  projekt,
  kompakt = false,
}: {
  companyId: string;
  projekt: Project;
  kompakt?: boolean;
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
        const stunden = await stundenDerBaustellen([nummer]);
        if (weg) return;
        setStand(auswerten(stunden));
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

  if (stand.fachMin === 0 && stand.helperMin === 0 && stand.lehrlingMin === 0) {
    return (
      <p className="text-sm text-ink-muted">
        Auf diese Baustelle ist noch keine Stunde gebucht.
      </p>
    );
  }

  /*
    DIE MASSLINIE STATT SATZ UND BALKEN (Planlinie B2): gebucht gegen das
    Budget, was darüber geht läuft rot über die Marke hinaus. Was frei
    bleibt, steht an der Marke; nahe am Budget in Ocker wie zuvor der Satz.
  */
  const restMin = projekt.estimatedHours ? Math.abs(projekt.estimatedHours * 60 - stand.fachMin) : 0;
  if (kompakt) return <div className="akten-stunden">
    {projekt.estimatedHours ? (
      <MasslinieZeile name="Stundenbudget">
        <Masslinie
          ist={stand.fachMin / 60}
          soll={projekt.estimatedHours}
          achtung={budget.tone === 'warning'}
          istText={`${fmtStd(stand.fachMin)} h gebucht${davonLehrling(stand.lehrlingImBudgetMin)}`}
          sollText={budget.over ? `Budget ${fmtStunden(projekt.estimatedHours)} h` : `Budget ${fmtStunden(projekt.estimatedHours)} h · ${fmtStd(restMin)} h verbleibend`}
          ueberText={`+${fmtStd(restMin)} h über Budget`}
          name={`${fmtStd(stand.fachMin)} h gebucht von ${fmtStunden(projekt.estimatedHours)} h Budget (${budget.pct} %), ${fmtStd(restMin)} h ${budget.over ? 'über Budget' : 'verbleibend'}`}
        />
      </MasslinieZeile>
    ) : (
      <p className="baustelle-summe"><span className="akten-stunden-zahl">{fmtStd(stand.fachMin)} h</span>
        {' Arbeitszeit'}{davonLehrling(stand.lehrlingImBudgetMin)}{' · kein Stundenbudget hinterlegt'}</p>
    )}
    {stand.helperMin > 0 && <p className="text-sm text-ink-muted">zusätzlich {fmtStd(stand.helperMin)} h Helfer · separat vom Budget</p>}
    {stand.lehrlingMin > 0 && <p className="text-sm text-ink-muted">+{fmtStd(stand.lehrlingMin)} h Lehrling, nicht im Budget</p>}
    {/* Stunden nach Person als Stückliste (Planlinie B6): Pos, Person, Stunden, Summe über der Doppellinie. */}
    <details><summary>Stunden nach Person</summary>
      <div className="overflow-x-auto">
        <table className="tabelle tabelle-eng">
          <thead><tr><th scope="col">Pos</th><th scope="col">Person</th><th scope="col" className="r">Stunden</th></tr></thead>
          <tbody>
            {stand.personen.map((p, i) => <tr key={p.name}>
              <td className="pos">{String(i + 1).padStart(2, '0')}</td>
              <td>{p.name}{(p.lehrlingImBudgetMin > 0 || p.helperMin > 0 || p.lehrlingMin > 0) && <span className="block text-xs text-ink-muted">
                {davonLehrling(p.lehrlingImBudgetMin).trim()}{p.helperMin > 0 && <> +{fmtStd(p.helperMin)} h Helfer</>}
                {p.lehrlingMin > 0 && <> +{fmtStd(p.lehrlingMin)} h nicht im Budget</>}</span>}</td>
              <td className="r">{fmtStd(p.fachMin)} h</td>
            </tr>)}
            <tr className="summe"><td /><td>Summe</td><td className="r">{fmtStd(stand.fachMin)} h</td></tr>
          </tbody>
        </table>
      </div>
      {stand.zuletzt && <p className="text-xs text-ink-muted">Zuletzt gebucht am {fmtDatum(stand.zuletzt)}.</p>}</details>
  </div>;

  return (
    <div className="space-y-3">
      <p className="baustelle-summe text-sm">
        <span className="font-semibold text-ink">{fmtStd(stand.fachMin)} h</span>
        <span className="text-ink-muted">
          {projekt.estimatedHours ? ` von ${fmtStunden(projekt.estimatedHours)} h Budget` : ' Arbeitszeit'}
          {davonLehrling(stand.lehrlingImBudgetMin)}
        </span>
        {/*
          Helferstunden zählen NICHT gegen das Budget — sie werden zwar
          verrechnet, sind für die Kalkulation aber kostenneutral. Dieselbe
          Regel wie in der Projektauswertung; stünden sie hier mit drin, käme
          dieselbe Baustelle an zwei Stellen auf zwei Prozentwerte.
        */}
        {stand.helperMin > 0 && (
          <span className="text-ink-muted"> · +{fmtStd(stand.helperMin)} h Helfer</span>
        )}
        {/* Lehrlinge, deren Stunden nicht ins Budget zählen (Entscheidung 03.10.2026). */}
        {stand.lehrlingMin > 0 && (
          <span className="text-ink-muted"> · +{fmtStd(stand.lehrlingMin)} h Lehrling, nicht im Budget</span>
        )}
      </p>

      {budget.pct !== null ? (
        <div className="budget-grafik">
          <svg className="budget-ring" viewBox="0 0 100 100" role="img" aria-label={`${budget.pct} % des Stundenbudgets verbraucht`}>
            <circle className="budget-grund" cx="50" cy="50" r="42" />
            {/* Nur die Zeichnung endet bei einem Vollkreis; die tatsächliche Überschreitung steht unverändert daneben. */}
            <circle className={`budget-anteil ${RING_TON[budget.tone]}`} cx="50" cy="50" r="42" pathLength="100"
              strokeDasharray={`${Math.max(0, Math.min(100, budget.pct))} 100`} transform="rotate(-90 50 50)" />
          </svg>
          <div>
            <span
              className={`budget-prozent ${
                budget.over ? 'text-danger' : 'text-ink-muted'
              }`}
            >
              {budget.pct} %
            </span>
            <p className="text-meta text-ink-muted">des Stundenbudgets</p>
          </div>
        </div>
      ) : (
        <p className="text-xs text-ink-muted">
          Kein Stundenbudget hinterlegt — ohne Budget gibt es keinen Stand, nur eine Summe.
        </p>
      )}

      {/* Als Textzeile, nicht als umrandete Pillen (Designlinie „Fassung 3"). */}
      <div className="flex flex-wrap gap-x-4 gap-y-1">
        {stand.personen.map((p) => (
          <span
            key={p.name}
            className="inline-flex items-baseline gap-1.5 text-xs"
          >
            <span className="font-semibold text-ink">{p.name}</span>
            <span className="text-ink-muted">{fmtStd(p.fachMin)} h{davonLehrling(p.lehrlingImBudgetMin)}</span>
            {p.helperMin > 0 && (
              <span className="text-ink-muted">+{fmtStd(p.helperMin)} h Helfer</span>
            )}
            {p.lehrlingMin > 0 && (
              <span className="text-ink-muted">+{fmtStd(p.lehrlingMin)} h nicht im Budget</span>
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
 * Aus den Summen je Person die drei Zahlen, auf die es ankommt.
 *
 * Ausgelagert, weil sie sich so prüfen lassen, ohne eine Ansicht zu zeichnen.
 * Was überhaupt zählt (nur „Anwesend“, nur mit Arbeitszeit) und welche Art
 * eine Buchung hat, entscheidet schon die Datenbank (`baustellen_stunden`,
 * dieselbe Aufteilung wie `budgetArt`) — die Projektleitung liest die
 * einzelnen Buchungen anderer nicht (Runde 5, M1).
 */
function auswerten(stunden: BaustellenStunden[]): Extract<Stand, { art: 'bereit' }> {
  const nachPerson = new Map<string, Person>();
  let fachMin = 0;
  let lehrlingImBudgetMin = 0;
  let helperMin = 0;
  let lehrlingMin = 0;
  let zuletzt: string | null = null;
  for (const s of stunden) {
    const schluessel = s.userId || 'unbekannt';
    const cur = nachPerson.get(schluessel) ?? {
      name: s.userName || 'Unbekannt',
      fachMin: 0,
      lehrlingImBudgetMin: 0,
      helperMin: 0,
      lehrlingMin: 0,
    };
    if (s.art === 'helfer') {
      cur.helperMin += s.minuten;
      helperMin += s.minuten;
    } else if (s.art === 'lehrling') {
      cur.lehrlingMin += s.minuten;
      lehrlingMin += s.minuten;
    } else {
      cur.fachMin += s.minuten;
      fachMin += s.minuten;
      cur.lehrlingImBudgetMin += s.lehrlingImBudget ?? 0;
      lehrlingImBudgetMin += s.lehrlingImBudget ?? 0;
    }
    nachPerson.set(schluessel, cur);
    if (zuletzt === null || s.zuletzt > zuletzt) zuletzt = s.zuletzt;
  }

  return {
    art: 'bereit',
    fachMin,
    lehrlingImBudgetMin,
    helperMin,
    lehrlingMin,
    // Groesster Beitrag zuerst: wer die Baustelle getragen hat, steht vorn.
    personen: [...nachPerson.values()].sort(
      (a, b) => b.fachMin + b.helperMin + b.lehrlingMin - (a.fachMin + a.helperMin + a.lehrlingMin),
    ),
    zuletzt,
  };
}
