import { Fragment, useMemo, useState } from 'react';
import {
  groupProjectHours,
  calcBudgetState,
  normProjectNumber,
  calcWorkMin,
  fmtMin,
  fmtStd,
  balkenBreite,
  fmtStunden,
} from '@/lib/time';
import type { Project, TimeEntry } from '@/types';
import Card from '@/components/Card';
import { Warnung } from '@/components/Badge';
import Zeitmarker from '@/features/time/Zeitmarker';
import Icon from '@/components/Icon';
import { EmptyState } from '@/components/States';
import { AB_TABELLE, useAbBreite } from '@/lib/useAbBreite';

const BAR_TONE = {
  success: 'bg-success',
  warning: 'bg-warning',
  danger: 'bg-accent',
  neutral: 'bg-line',
} as const;

/** 'YYYY-MM-DD' -> 'Mo., 15.06.2026' — das Datum wie überall in der App. */
function dayLabel(iso: string): string {
  return new Date(`${iso}T00:00:00`).toLocaleDateString('de-AT', {
    weekday: 'short',
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  });
}

/** Dezimalstunden mit Komma — gemeinsam mit dem Dashboard, siehe `lib/time`. */
const h = fmtStd;

/**
 * Die Baustellennummer, wie sie überall sonst steht — MIT Vorsatz: „PR-187".
 *
 * Überall sonst wird die Nummer so ausgegeben, wie sie an der Baustelle
 * gespeichert ist (`projectNumber`); der Vorsatz ist Teil davon. Der
 * Gruppierungsschlüssel aus `groupProjectHours` hat ihn dagegen verloren —
 * `normProjectNumber` streicht „PR-", damit „187" und „PR-187" als DIESELBE
 * Baustelle zählen. Zum Vergleichen richtig, zum Zeigen falsch.
 *
 * Solange die Baustelle nicht geladen ist (oder nicht gefunden wird), steht
 * die Nummer an den Einträgen selbst noch in ihrer vollen Form; genommen wird
 * die, die den Vorsatz trägt. Erst wenn keine ihn hat, bleibt der Schlüssel.
 */
function angezeigteNummer(r: {
  project?: Project;
  projectNumber: string;
  entries: TimeEntry[];
}): string {
  return (
    r.project?.projectNumber ??
    r.entries.find((e) => e.projectNumber && e.projectNumber.trim() !== r.projectNumber)
      ?.projectNumber ??
    r.projectNumber
  );
}

type Zeile = ReturnType<typeof groupProjectHours>[number] & {
  project?: Project;
  gesamtFachMin: number | null;
  budget: ReturnType<typeof calcBudgetState> | null;
};

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
 *
 * AM SCHREIBTISCH EINE TABELLE wie die Mitarbeiterübersicht direkt darüber
 * (ab 1280 px, genau eine Form im DOM): Baustelle, Budgetstand, Stunden im
 * Monat, Helfer, gesamt — aufgeklappt darunter dieselben Einzelheiten wie in
 * der Karte am Telefon.
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
  const schreibtisch = useAbBreite(AB_TABELLE);

  const rows = useMemo<Zeile[]>(() => {
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

  if (schreibtisch) {
    return (
      <Card title={`Projektauswertung ${label}`}>
        <div className="tabelle-rahmen">
          <table className="tabelle">
            <thead className="tabelle-kopfzeile">
              <tr>
                <th className="tabelle-kopf">Baustelle</th>
                <th className="tabelle-kopf">Budget der Baustelle</th>
                <th className="tabelle-kopf-zahl">Fachzeit im Monat</th>
                <th className="tabelle-kopf-zahl">Helfer</th>
                <th className="tabelle-kopf-zahl">Fachzeit gesamt</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => {
                const isOpen = open === r.projectNumber;
                const nummer = angezeigteNummer(r);
                return (
                  <Fragment key={r.projectNumber}>
                    <tr className={isOpen ? 'tabelle-zeile-offen' : 'tabelle-zeile'}>
                      <td className="tabelle-name">
                        <button
                          type="button"
                          onClick={() => setOpen(isOpen ? null : r.projectNumber)}
                          aria-expanded={isOpen}
                          className="tabelle-aufklapper"
                        >
                          <Icon
                            name="chevron"
                            size={18}
                            className={`shrink-0 text-ink-muted transition-transform duration-200 ${isOpen ? 'rotate-180' : ''}`}
                          />
                          <span>
                            {r.project?.customerName ?? nummer}
                            <span className="tabelle-unter">{nummer}</span>
                          </span>
                        </button>
                      </td>
                      <td className="tabelle-zelle">
                        {r.budget && r.budget.pct !== null && r.gesamtFachMin !== null ? (
                          <span className="auswertung-budget">
                            <Balken r={r} />
                            {r.budget.over && <Warnung stufe="dringend">über Budget</Warnung>}
                          </span>
                        ) : (
                          <span className="text-ink-muted">
                            {r.gesamtFachMin === null
                              ? 'Gesamtstunden nicht geladen'
                              : 'Kein Stundenbudget hinterlegt'}
                          </span>
                        )}
                      </td>
                      <td className="tabelle-zahl">{h(r.fachMin)} h</td>
                      <td className="tabelle-zahl">
                        {r.helperMin > 0 ? `+${h(r.helperMin)} h` : '–'}
                      </td>
                      <td className="tabelle-zahl">
                        {r.gesamtFachMin === null ? '–' : `${h(r.gesamtFachMin)} h`}
                        {r.gesamtFachMin !== null && r.project?.estimatedHours
                          ? ` von ${fmtStunden(r.project.estimatedHours)} h`
                          : null}
                      </td>
                    </tr>
                    {isOpen && (
                      <tr>
                        <td colSpan={5} className="tabelle-detail">
                          <Einzelheiten r={r} label={label} />
                        </td>
                      </tr>
                    )}
                  </Fragment>
                );
              })}
            </tbody>
          </table>
        </div>
      </Card>
    );
  }

  return (
    <Card title={`Projektauswertung ${label}`}>
      <div className="space-y-3">
        {rows.map((r) => {
          const isOpen = open === r.projectNumber;
          const nummer = angezeigteNummer(r);

          return (
            /*
              KEIN BLAUER BLOCK BEIM AUFKLAPPEN — dieselbe Entscheidung wie in
              der Mitarbeiterübersicht, hier war sie stehengeblieben. Der
              farbige Kopf schrie lauter als der Inhalt, den er ankündigte,
              und zwang zugleich jede Zahl darin in eine zweite Farbfassung.
              Jetzt genügt der hellere Grund und die farbige Kante.

              `.karte` bringt Fläche, Rundung und Schatten mit; offen
              (`.karte-offen`) wird allein die Rahmenfarbe kräftiger.
            */
            <div
              key={r.projectNumber}
              className={isOpen ? 'karte-offen' : 'karte'}
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
                      {r.project?.customerName ?? nummer}
                    </span>
                    {/* Die Nummer, wie sie an der Baustelle steht — der Schlüssel
                        der Gruppierung hat den Vorsatz „PR-" verloren
                        (Launch-Check 25.09.2026: „187" statt „PR-187"). Auch
                        solange die Baustelle noch lädt, siehe
                        `angezeigteNummer`. */}
                    <span className="block text-sm text-ink-muted">{nummer}</span>
                  </span>
                  <span className="flex items-center gap-2">
                    {/*
                      DER MONAT, und er sagt das auch. Vorher stand hier
                      „22,5 h / 40 h" — Monatsstunden neben einem Budget für
                      die ganze Baustelle, also zwei Zahlen, die nichts
                      miteinander zu tun haben.
                    */}
                    <span className="text-sm text-ink">{h(r.fachMin)} h</span>
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
                      <span className="text-sm text-ink-muted">
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
                      <span>{h(r.fachMin)} h</span> in {label} · gesamt{' '}
                      <span className="font-semibold">{h(r.gesamtFachMin)} h</span> von{' '}
                      <span>{fmtStunden(r.project?.estimatedHours ?? 0)} h</span>
                    </p>
                    <div className="mt-1 flex items-center gap-2">
                      <Balken r={r} />
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

              {isOpen && <Einzelheiten r={r} label={label} />}
            </div>
          );
        })}
      </div>
    </Card>
  );
}

/** Der Budgetbalken der ganzen Baustelle mit Prozentwert. */
function Balken({ r }: { r: Zeile }) {
  if (!r.budget || r.budget.pct === null) return null;
  return (
    <>
      <span className="h-1.5 flex-1 overflow-hidden rounded-pill bg-surface-3">
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
    </>
  );
}

/**
 * Der aufgeklappte Teil einer Baustelle: wer wie viel, jeder Tag, die Summe.
 * In der Karte am Telefon und in der Tabellenzeile am Schreibtisch derselbe.
 */
function Einzelheiten({ r, label }: { r: Zeile; label: string }) {
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
    <div className="border-t border-line px-4 py-3">
      {/*
        WER WIE VIEL als eine Zeile Text, nicht als Pillen: Pillen sind in
        dieser Ansicht der Ausnahme vorbehalten („über Budget"), und ein Name
        mit Stunden ist keine.
      */}
      <p className="text-sm text-ink-muted">
        {people.map((p, i) => (
          <span key={p.name}>
            {i > 0 && ' · '}
            <span className="font-semibold text-ink">{p.name}</span> {h(p.fachMin)} h
            {p.helperMin > 0 && <> +{h(p.helperMin)} h Helfer</>}
          </span>
        ))}
      </p>

      <div className="tabelle-rahmen mt-3">
        <table className="tabelle min-w-[28rem]">
          <thead>
            <tr>
              <th className="tabelle-kopf">Tag</th>
              <th className="tabelle-kopf">Mitarbeiter</th>
              <th className="tabelle-kopf">Tätigkeit</th>
              <th className="tabelle-kopf-zahl">Stunden</th>
            </tr>
          </thead>
          <tbody>
            {[...r.entries]
              .sort((a, b) => b.date.localeCompare(a.date))
              .map((e) => (
                /*
                  KEIN GELBER GRUND MEHR für Helferzeilen: dieselbe Regel wie
                  oben — Helferstunden sind der Normalfall, keine Warnung.
                  Welche Zeile eine Helferstunde ist, sagt die Marke „Helfer"
                  am Namen.
                */
                <tr key={e.id}>
                  <td className="tabelle-zelle whitespace-nowrap">{dayLabel(e.date)}</td>
                  <td className="tabelle-zelle">
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
                  <td className="tabelle-zelle">
                    <span className="text-ink-muted">
                      {e.comment ? `„${e.comment}"` : '–'}
                    </span>
                  </td>
                  <td className="tabelle-zahl">
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
            · gesamt {h(r.gesamtFachMin)} h / {fmtStunden(r.project.estimatedHours)} h Budget
          </span>
        ) : null}
        {r.helperMin > 0 && (
          <span className="text-ink-muted">
            {' '}
            · + {h(r.helperMin)} h Helfer-Leistung (kostenneutral für das Budget)
          </span>
        )}
      </p>
    </div>
  );
}
