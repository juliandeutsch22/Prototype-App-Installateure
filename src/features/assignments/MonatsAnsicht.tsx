import { Fragment, useMemo, useState } from 'react';
import type { Abwesenheit } from '@/lib/db/vacations';
import type { WithId } from '@/lib/db/core';
import type { AppUser, Assignment, Project, Termin } from '@/types';
import type { FensterStart } from './EinsatzFenster';
import { getAustrianHolidayName, isWeekend } from '@/lib/time';
import Card from '@/components/Card';
import { List, ListRow } from '@/components/ListRow';
import { EmptyState } from '@/components/States';
import { MehrAnzeigen } from '@/components/LotBausteine';
import { GruppenKopf } from './PlanRaster';
import { tagKurz, type Brett, type Gruppe } from './planTypen';

/** Gruppen höchstens 20 Zeilen, dann „und N weitere“ (Regel 4). */
const SEITE = 20;

/**
 * DER MONAT (Linie „Lot“, E2): je Person und Tag eingeplant, abwesend oder
 * frei; Wochenenden und Feiertage hinterlegt. Ein Tag springt in die Woche —
 * dort wird geplant. Am Handy statt des Rasters zwei Listen.
 *
 * Gerechnet wird mit denselben Zellen wie in der Woche (`brett`), geladen
 * mit denselben Abfragen über den Monat — wie es „Tag planen“ für seinen
 * Kalender schon immer tut.
 */
/**
 * RUNDE 4, DIE SCHNITTSTELLE DES MONATS (Auftrag 5): was die Seite der
 * Monatsansicht zusätzlich gibt. Die Seite (`WochenplanView`) hält die
 * Seitenfenster; der Monat ruft sie nur auf, damit „Bearbeiten“ aus der
 * Vorschau und der Klick in der Woche dasselbe Fenster öffnen.
 */
export interface MonatsSchnittstelle {
  /** Sicht „Personen“ oder „Baustellen“ (Umschalter ab Tablet). */
  sicht?: 'personen' | 'baustellen';
  /** Die Termine des Monats, schon geladen. */
  termine?: Termin[];
  /** Betriebsurlaub je Tag (Bezeichnung). */
  zuAm?: Map<string, string>;
  /** „Bearbeiten“ bzw. „Einsatz planen“: das Seitenfenster „Einsatz planen“ der Woche. */
  onEinsatz?: (start: FensterStart) => void;
  /** Ein Termin: „Termin ändern“ (ohne Recht schreibgeschützt) im Seitenfenster. */
  onTermin?: (t: Termin) => void;
  /** „Zur Woche“: Woche dieses Tages, Tageskopf markiert (`?woche=JJJJ-Www&tag=JJJJ-MM-TT`). */
  onZurWoche?: (tag: string) => void;
}

export default function MonatsAnsicht({
  tage,
  heute,
  gruppen,
  zu,
  onGruppe,
  brett,
  zuFuer,
  einsaetze,
  projects,
  urlaube,
  staff,
  onTag,
}: MonatsSchnittstelle & {
  tage: string[];
  heute: string;
  gruppen: Gruppe[];
  zu: Set<string>;
  onGruppe: (name: string) => void;
  brett: Brett;
  zuFuer: (uid: string, tag: string) => boolean;
  einsaetze: WithId<Assignment>[];
  projects: Project[];
  urlaube: Abwesenheit[];
  staff: AppUser[];
  /** In die Woche dieses Tages springen. */
  onTag: (tag: string) => void;
}) {
  const [baustellenGezeigt, setBaustellenGezeigt] = useState(SEITE);
  const [abwesendGezeigt, setAbwesendGezeigt] = useState(SEITE);
  const mitKoepfen = gruppen.length > 1;
  const erster = tage[0];
  const letzter = tage[tage.length - 1];

  /*
    DIE BAUSTELLEN DES MONATS mit erstem und letztem Einsatztag — statt der
    Balken des Entwurfs eine Zeile je Baustelle: sie sagt dasselbe (von wann
    bis wann, wie viele Tage) und bleibt am Handy lesbar.
  */
  const baustellen = useMemo(() => {
    const m = new Map<string, { nummer: string; name: string; tage: Set<string>; leute: Set<string> }>();
    for (const a of einsaetze) {
      const e =
        m.get(a.projectNumber) ??
        {
          nummer: a.projectNumber,
          name: projects.find((p) => p.projectNumber === a.projectNumber)?.customerName ?? a.projectNumber,
          tage: new Set<string>(),
          leute: new Set<string>(),
        };
      e.tage.add(a.date);
      e.leute.add(a.userId);
      m.set(a.projectNumber, e);
    }
    return [...m.values()]
      .map((e) => {
        const sortiert = [...e.tage].sort();
        return { ...e, von: sortiert[0], bis: sortiert[sortiert.length - 1] };
      })
      .sort((a, b) => a.von.localeCompare(b.von) || a.name.localeCompare(b.name, 'de'));
  }, [einsaetze, projects]);

  /** Wer diesen Monat fehlt — nur, wer eingeplant werden kann; der Grund, soweit sichtbar. */
  const abwesend = useMemo(() => {
    const namen = new Map(staff.map((u) => [u.uid, u.name]));
    return urlaube
      .filter((v) => namen.has(v.userId))
      .map((v) => ({
        ...v,
        name: namen.get(v.userId) as string,
        text: [v.grund ?? 'abwesend', v.zeiten].filter(Boolean).join(' '),
      }))
      .sort((a, b) => a.von.localeCompare(b.von) || a.name.localeCompare(b.name, 'de'));
  }, [urlaube, staff]);

  const spanne = (von: string, bis: string) => {
    const v = von < erster ? erster : von;
    const b = bis > letzter ? letzter : bis;
    return v === b ? tagKurz(v).datum : `${tagKurz(v).datum} – ${tagKurz(b).datum}`;
  };

  return (
    <div className="space-y-4">
      {/* Das Raster erst ab Tablet; am Handy stehen die Listen darunter. */}
      <div className="hidden md:block">
      <Card buendig>
        <div className="planung-huelle">
          <table
            aria-label="Monatsplan als Tabelle"
            className="w-full min-w-[44rem] table-fixed border-separate border-spacing-0 text-meta"
          >
            <thead>
              <tr>
                <th className="sticky left-0 top-0 z-30 w-28 border-b border-line bg-surface p-2 text-left align-bottom lg:w-36">
                  <span className="section-label">Mitarbeiter</span>
                </th>
                {tage.map((tag) => {
                  const d = new Date(`${tag}T00:00:00`);
                  const feiertag = getAustrianHolidayName(d);
                  const ruhe = !!feiertag || isWeekend(d);
                  return (
                    <th
                      key={tag}
                      className={`sticky top-0 z-20 border-b border-line p-0 font-normal ${
                        tag === heute ? 'bg-petrol-hell' : ruhe ? 'bg-surface-2' : 'bg-surface'
                      }`}
                    >
                      <button
                        type="button"
                        className="monat-tag"
                        onClick={() => onTag(tag)}
                        title={feiertag ?? undefined}
                        aria-label={`${tagKurz(tag).wochentag} ${tagKurz(tag).datum}${feiertag ? ` (${feiertag})` : ''} — Woche zeigen`}
                      >
                        {/* Zwei Buchstaben: „M“ hiesse Montag oder Mittwoch. */}
                        <span className="block">{tagKurz(tag).wochentag.slice(0, 2)}</span>
                        <span className="block">{d.getDate()}</span>
                      </button>
                    </th>
                  );
                })}
              </tr>
            </thead>
            <tbody>
              {gruppen.map((g) => {
                const offen = !zu.has(g.name);
                return (
                  <Fragment key={g.name}>
                    {mitKoepfen && (
                      <GruppenKopf gruppe={g} spalten={tage.length + 1} offen={offen} onUmschalten={() => onGruppe(g.name)} />
                    )}
                    {(offen || !mitKoepfen) &&
                      g.leute.map((u) => (
                        <tr key={u.uid}>
                          <th
                            scope="row"
                            className="sticky left-0 z-10 truncate border-b border-line bg-surface p-2 text-left font-normal text-ink"
                          >
                            {u.name}
                          </th>
                          {tage.map((tag) => {
                            const z = brett.get(u.uid)?.get(tag);
                            const d = new Date(`${tag}T00:00:00`);
                            const feiertag = getAustrianHolidayName(d);
                            const ruhe = !!feiertag || isWeekend(d);
                            const namen = (z?.baustellen ?? []).map((b) => `${b.name} (${b.nummer})`).join(', ');
                            let klasse = 'monat-frei';
                            let text = 'frei';
                            if (z?.imUrlaub && z.baustellen.length > 0) {
                              klasse = 'monat-konflikt';
                              text = `eingeteilt, aber ${z.abwesendText}: ${namen}`;
                            } else if (z?.imUrlaub) {
                              klasse = 'monat-weg';
                              text = z.abwesendText ?? 'abwesend';
                            } else if (z && z.baustellen.length > 0) {
                              klasse = 'monat-plan';
                              text = `eingeplant: ${namen}`;
                            } else if (zuFuer(u.uid, tag)) {
                              klasse = 'monat-weg';
                              text = 'Betriebsurlaub';
                            } else if (ruhe) {
                              klasse = 'monat-ruhe';
                              text = feiertag ?? 'Wochenende';
                            }
                            return (
                              <td key={tag} className="border-b border-line p-px" title={`${u.name}, ${tagKurz(tag).datum}: ${text}`}>
                                <span className={klasse}>
                                  {klasse === 'monat-plan' && z && z.baustellen.length > 1 ? z.baustellen.length : null}
                                  <span className="sr-only">{text}</span>
                                </span>
                              </td>
                            );
                          })}
                        </tr>
                      ))}
                  </Fragment>
                );
              })}
            </tbody>
          </table>
        </div>
        <p className="monat-legende">
          <span className="legende-plan">eingeplant</span>
          <span className="legende-weg">abwesend</span>
          <span className="legende-konflikt">eingeteilt und abwesend</span>
          <span className="legende-frei">frei</span>
          <span className="legende-ruhe">Wochenende, Feiertag</span>
          <span>Tag antippen – springt in die Woche</span>
        </p>
      </Card>
      </div>

      <Card title="Baustellen diesen Monat" buendig>
        {baustellen.length === 0 ? (
          <EmptyState>In diesem Monat ist keine Baustelle eingeplant.</EmptyState>
        ) : (
          <>
            <List>
              {baustellen.slice(0, baustellenGezeigt).map((b) => (
                <ListRow
                  key={b.nummer}
                  title={b.name}
                  subtitle={`${b.nummer} · ${spanne(b.von, b.bis)} · ${b.tage.size} ${b.tage.size === 1 ? 'Einsatztag' : 'Einsatztage'}`}
                  onOeffnen={() => onTag(b.von)}
                  pfeil
                />
              ))}
            </List>
            <MehrAnzeigen
              anzahl={Math.max(0, baustellen.length - baustellenGezeigt)}
              onClick={() => setBaustellenGezeigt((n) => n + SEITE)}
            />
          </>
        )}
      </Card>

      {/* Am Schreibtisch steht das im Raster; am Handy fehlt das Raster. */}
      <div className="md:hidden">
        <Card title="Diesen Monat abwesend" buendig>
          {abwesend.length === 0 ? (
            <EmptyState>Diesen Monat ist niemand abwesend.</EmptyState>
          ) : (
            <>
              <List>
                {abwesend.slice(0, abwesendGezeigt).map((v, i) => (
                  <ListRow key={`${v.userId}-${v.von}-${i}`} title={v.name} subtitle={`${spanne(v.von, v.bis)} · ${v.text}`} />
                ))}
              </List>
              <MehrAnzeigen
                anzahl={Math.max(0, abwesend.length - abwesendGezeigt)}
                onClick={() => setAbwesendGezeigt((n) => n + SEITE)}
              />
            </>
          )}
        </Card>
      </div>
    </div>
  );
}
