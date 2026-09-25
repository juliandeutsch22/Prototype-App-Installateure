import { useMemo, useState } from 'react';
import {
  groupProjectHours,
  calcBudgetState,
  normProjectNumber,
  calcWorkMin,
  fmtMin,
  fmtStd,
  balkenBreite,
} from '@/lib/time';
import type { Project, TimeEntry } from '@/types';
import Card from '@/components/Card';
import { Warnung } from '@/components/Badge';
import Zeitmarker from '@/features/time/Zeitmarker';
import Icon from '@/components/Icon';
import { EmptyState } from '@/components/States';

const BAR_TONE = {
  success: 'bg-success',
  warning: 'bg-warning',
  danger: 'bg-accent',
  neutral: 'bg-line',
} as const;

/** 'YYYY-MM-DD' -> 'Mo., 15.06.25'. */
function dayLabel(iso: string): string {
  return new Date(`${iso}T00:00:00`).toLocaleDateString('de-AT', {
    weekday: 'short',
    day: '2-digit',
    month: '2-digit',
    year: '2-digit',
  });
}

/** Dezimalstunden mit Komma — gemeinsam mit dem Dashboard, siehe `lib/time`. */
const h = fmtStd;

/**
 * Projektauswertung: Ist-Stunden gegen das kalkulierte Budget, getrennt nach
 * Fach- und Helferzeit. Helferstunden zählen bewusst NICHT gegen das Budget —
 * sie werden zwar verrechnet, sind für die Kalkulation aber kostenneutral.
 *
 * ZWEI ZEITRÄUME, UND DAS IST DER KERN DIESER ANSICHT.
 *
 * Die Liste unten zeigt den GEWÄHLTEN MONAT — dafür steht man in dieser
 * Ansicht. Der Budgetbalken darüber muss dagegen die GANZE Baustelle zeigen:
 * `estimatedHours` ist für den gesamten Auftrag kalkuliert, nicht je Monat.
 *
 * VORHER STAND HIER BEIDES AUS DEM MONAT, und das Ergebnis war eine
 * Falschaussage. Aus dem Betrieb aufgefallen: das Dashboard meldete
 * „39,5 von 40 h · 99 %", dieselbe Baustelle stand hier bei „22,5 h / 40 h ·
 * 56 %". Der Unterschied waren die Stunden aus dem Vormonat. Wer hier
 * nachsah, hielt eine ausgereizte Baustelle für halb offen und plante weiter.
 *
 * Beide Ansichten rechnen jetzt aus derselben Quelle
 * (`listEntriesForProjects`) und können nicht mehr auseinanderlaufen.
 */
export default function ProjectSummary({
  entries,
  projects,
  label,
  gesamtEntries,
}: {
  entries: TimeEntry[];
  projects: Project[];
  label: string;
  /**
   * ALLE Stunden dieser Baustellen, über den Monat hinaus — Grundlage des
   * Budgets.
   *
   * `null` heißt „konnte nicht geladen werden" und ist ausdrücklich NICHT
   * dasselbe wie „keine". Dann entfällt der Balken; ihn aus den Monatsstunden
   * zu rechnen wäre genau die Falschaussage, die es zu beheben galt.
   */
  gesamtEntries: TimeEntry[] | null;
}) {
  const [open, setOpen] = useState<string | null>(null);

  const rows = useMemo(() => {
    const gesamt = gesamtEntries ? groupProjectHours(gesamtEntries) : null;
    const grouped = groupProjectHours(entries);
    return grouped.map((g) => {
      const project = projects.find(
        (p) => normProjectNumber(p.projectNumber) === g.projectNumber,
      );
      const gesamtFachMin =
        gesamt?.find((x) => x.projectNumber === g.projectNumber)?.fachMin ?? null;
      return {
        ...g,
        project,
        gesamtFachMin,
        budget:
          gesamtFachMin === null
            ? null
            : calcBudgetState(gesamtFachMin, project?.estimatedHours),
      };
    });
  }, [entries, projects, gesamtEntries]);

  if (rows.length === 0) {
    return (
      <Card title={`Projektauswertung ${label}`}>
        <EmptyState>Keine Projektstunden in diesem Zeitraum.</EmptyState>
      </Card>
    );
  }

  return (
    <Card title={`Projektauswertung ${label}`}>
      <div className="space-y-3">
        {rows.map((r) => {
          const isOpen = open === r.projectNumber;
          // Mitarbeiter-Zwischensummen, größter Beitrag zuerst.
          const byUser = new Map<string, { name: string; fachMin: number; helperMin: number }>();
          for (const e of r.entries) {
            const key = e.userId || 'unbekannt';
            const cur = byUser.get(key) ?? {
              name: e.userName || 'Unbekannt',
              fachMin: 0,
              helperMin: 0,
            };
            const min = calcWorkMin(e);
            if (e.isHelper) cur.helperMin += min;
            else cur.fachMin += min;
            byUser.set(key, cur);
          }
          const people = [...byUser.values()].sort(
            (a, b) => b.fachMin + b.helperMin - (a.fachMin + a.helperMin),
          );

          return (
            /*
              KEIN BLAUER BLOCK BEIM AUFKLAPPEN — dieselbe Entscheidung wie in
              der Mitarbeiterübersicht, hier war sie stehengeblieben. Der
              farbige Kopf schrie lauter als der Inhalt, den er ankündigte,
              und zwang zugleich jede Zahl darin in eine zweite Farbfassung.
              Jetzt genügt der hellere Grund und die farbige Kante.

              `.panel` bringt Fläche, Rundung und Schatten mit; offen wird
              allein die Rahmenfarbe ausgetauscht.
            */
            <div
              key={r.projectNumber}
              className={`panel overflow-hidden transition-colors ${
                isOpen ? 'border-brand/40' : ''
              }`}
            >
              <button
                type="button"
                onClick={() => setOpen(isOpen ? null : r.projectNumber)}
                aria-expanded={isOpen}
                className={`w-full px-4 py-3 text-left transition-colors ${
                  isOpen ? 'bg-surface-2' : 'bg-surface hover:bg-surface-2'
                }`}
              >
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className="min-w-0">
                    <span className="block font-bold text-ink">
                      {r.project?.customerName ?? r.projectNumber}
                    </span>
                    <span className="block tnum text-sm text-ink-muted">{r.projectNumber}</span>
                  </span>
                  <span className="flex items-center gap-2">
                    {/*
                      DER MONAT, und er sagt das auch. Vorher stand hier
                      „22,5 h / 40 h" — Monatsstunden neben einem Budget für
                      die ganze Baustelle, also zwei Zahlen, die nichts
                      miteinander zu tun haben.
                    */}
                    <span className="tnum text-sm text-ink">{h(r.fachMin)} h</span>
                    {/*
                      NUR DIE AUSNAHME BEKOMMT EINE PILLE. „Über Budget" ist
                      eine — Helferstunden sind es nicht, sie sind auf vielen
                      Baustellen der Normalfall. Als gelbe Pille standen sie
                      neben jeder zweiten Zeile und machten aus einer Angabe
                      ein Warnsignal; die eine Baustelle, die wirklich über
                      dem Budget liegt, ging darin unter.
                    */}
                    {r.budget?.over && <Warnung stufe="dringend">über Budget</Warnung>}
                    {r.helperMin > 0 && (
                      <span className="tnum text-sm text-ink-muted">
                        +{h(r.helperMin)} h Helfer
                      </span>
                    )}
                    <Icon
                      name="chevron"
                      size={18}
                      className={`shrink-0 transition-transform duration-200 ${isOpen ? 'rotate-180' : ''}`}
                    />
                  </span>
                </div>

                {/*
                  DER BALKEN GEHÖRT DER GANZEN BAUSTELLE, nicht dem Monat.
                  Deshalb steht die Gesamtzahl daneben — sonst läse man den
                  Prozentwert gegen die Monatsstunden darüber und käme wieder
                  auf eine Aussage, die nicht stimmt.

                  Kein Balken ohne hinterlegtes Budget und keiner ohne die
                  Gesamtstunden: beides wäre eine Aussage, die gar nicht
                  getroffen werden kann.
                */}
                {r.budget && r.budget.pct !== null && r.gesamtFachMin !== null ? (
                  <>
                    <p className="mt-2 text-xs text-ink-muted">
                      <span className="tnum">{h(r.fachMin)} h</span> in {label} · gesamt{' '}
                      <span className="tnum font-semibold">{h(r.gesamtFachMin)} h</span> von{' '}
                      <span className="tnum">{r.project?.estimatedHours} h</span>
                    </p>
                    <div className="mt-1 flex items-center gap-2">
                      <span className="h-1.5 flex-1 overflow-hidden rounded-pill bg-line/60">
                        <span
                          className={`block h-full ${BAR_TONE[r.budget.tone]}`}
                          style={{ width: balkenBreite(r.budget.pct) }}
                        />
                      </span>
                      <span
                        className={`shrink-0 text-xs font-semibold ${
                          r.budget.over ? 'text-accent' : 'text-ink-muted'
                        }`}
                      >
                        {r.budget.pct} %
                      </span>
                    </div>
                  </>
                ) : (
                  <p className="mt-1 text-xs text-ink-muted">
                    {r.gesamtFachMin === null
                      ? 'Die Gesamtstunden der Baustelle konnten nicht geladen werden — ohne sie gibt es keinen Budgetstand.'
                      : 'Kein Stundenbudget hinterlegt.'}
                  </p>
                )}
              </button>

              {isOpen && (
                <div className="border-t border-line px-4 py-3">
                  <div className="flex flex-wrap gap-2">
                    {people.map((p) => (
                      <span
                        key={p.name}
                        className="inline-flex items-center gap-2 rounded-pill border border-line bg-surface px-3 py-1 text-xs"
                      >
                        <span className="font-semibold text-ink">{p.name}</span>
                        <span className="tnum text-ink-muted">{h(p.fachMin)} h</span>
                        {p.helperMin > 0 && (
                          <span className="tnum text-ink-muted">+{h(p.helperMin)} h Helfer</span>
                        )}
                      </span>
                    ))}
                  </div>

                  <div className="mt-3 overflow-x-auto">
                    <table className="w-full min-w-[28rem] text-sm">
                      <thead>
                        <tr className="border-b border-line text-left text-ink-muted">
                          <th className="py-1 pr-3 font-medium">Tag</th>
                          <th className="py-1 pr-3 font-medium">Mitarbeiter</th>
                          <th className="py-1 pr-3 font-medium">Tätigkeit</th>
                          <th className="py-1 text-right font-medium">Stunden</th>
                        </tr>
                      </thead>
                      <tbody>
                        {[...r.entries]
                          .sort((a, b) => b.date.localeCompare(a.date))
                          .map((e) => (
                            <tr
                              key={e.id}
                              className={`border-b border-line/60 ${e.isHelper ? 'bg-warning-bg/40' : ''}`}
                            >
                              <td className="py-1 pr-3 tnum">{dayLabel(e.date)}</td>
                              <td className="py-1 pr-3">
                                {/*
                                  ALLE Marker, nicht nur „Helfer". Gemeldet:
                                  „Notdienst wurde angehakt, aber das scheint
                                  beim Eintrag in der Projektauswertung nicht
                                  auf." Der Haken war gespeichert und hier
                                  schlicht nicht gezeigt — an einer Stunde mit
                                  +100 % Zuschlag die teuerste Art, etwas zu
                                  verschweigen.
                                */}
                                <span className="flex flex-wrap items-center gap-1">
                                  <span>{e.userName ?? '–'}</span>
                                  <Zeitmarker eintrag={e} />
                                </span>
                              </td>
                              <td className="py-1 pr-3 text-ink-muted">
                                {e.comment ? `„${e.comment}"` : '–'}
                              </td>
                              <td className="py-1 text-right tnum">
                                {fmtMin(calcWorkMin(e))}
                              </td>
                            </tr>
                          ))}
                      </tbody>
                    </table>
                  </div>

                  <p className="mt-3 border-t border-line pt-2 text-sm">
                    {/*
                      Auch hier stand die Monatszahl direkt neben dem Budget.
                      Das Budget gehört zur ganzen Baustelle; es gehört
                      deshalb neben die GESAMTZAHL, nicht neben den Monat.
                    */}
                    <span className="font-semibold text-ink">
                      Fachzeit in {label}: {h(r.fachMin)} h
                    </span>
                    {r.project?.estimatedHours && r.gesamtFachMin !== null ? (
                      <span className="text-ink-muted">
                        {' '}
                        · gesamt {h(r.gesamtFachMin)} h / {r.project.estimatedHours} h Budget
                      </span>
                    ) : null}
                    {r.helperMin > 0 && (
                      <>
                        <span className="text-ink-muted"> · </span>
                        <span className="font-semibold text-warning">
                          + {h(r.helperMin)} h Helfer-Leistung
                        </span>
                        <span className="text-ink-muted"> (kostenneutral für das Budget)</span>
                      </>
                    )}
                  </p>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </Card>
  );
}
