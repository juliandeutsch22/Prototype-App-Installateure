import { Fragment } from 'react';
import type { Termin } from '@/types';
import { getAustrianHolidayName, isWeekend } from '@/lib/time';
import { bezugText, terminKopf } from '@/features/termine/terminText';
import { tagKurz, type Brett, type Gruppe } from './planTypen';

/*
  DAS RASTER DER TEAM-WOCHE am Tablet und Schreibtisch: Personen × Tage, nur
  zum Lesen. Am Handy steht statt dessen die Tagesliste (in `TeamWoche`).

  SEIT RUNDE 4 NUR NOCH FÜR DIE TEAM-WOCHE. Die Einsatzplanung zeichnet ihr
  eigenes Raster (`WochenRaster`) mit Tageskopf, Termin-Einträgen und
  Seitenfenstern; die Team-Woche der Monteure bleibt genau, wie sie war
  (Auftrag 4.8, geprüft in `tests/components/TeamWoche.test.tsx`). Die
  Knöpfe der Planung sind deshalb hier heraus. `GruppenKopf` benutzen beide
  Raster und der Monat.
*/

const feiertagAm = (tag: string) => getAustrianHolidayName(new Date(`${tag}T00:00:00`));
const wochenendeAm = (tag: string) => isWeekend(new Date(`${tag}T00:00:00`));

/** Der Hintergrund einer Spalte: heute petrol-hell, Wochenende, Feiertag und Betriebsurlaub grau. */
function spaltenGrund(tag: string, heute: string, zu: boolean): string {
  if (tag === heute) return 'bg-petrol-hell';
  return feiertagAm(tag) || wochenendeAm(tag) || zu ? 'bg-surface-2' : '';
}

/**
 * Der Kopf mit den Tagen. Die Kopfzeile steht beim Rollen fest
 * (`sticky top-0`), die Ecke zusätzlich links.
 */
function TageKopf({ tage, heute, zuAm }: { tage: string[]; heute: string; zuAm: Map<string, string> }) {
  return (
    <thead>
      <tr>
        <th className="sticky left-0 top-0 z-30 w-28 border-b border-line bg-surface p-2 text-left align-bottom lg:w-36 xl:w-40">
          <span className="section-label">Mitarbeiter</span>
        </th>
        {tage.map((tag) => {
          const { wochentag, datum } = tagKurz(tag);
          const feiertag = feiertagAm(tag);
          const wochenende = wochenendeAm(tag);
          const zu = zuAm.get(tag);
          return (
            <th
              key={tag}
              // Samstag und Sonntag schmäler, bis Platz ist: meist leer, und
              // so bleiben den Werktagen bei 834 px rund 64 px statt 47.
              className={`sticky top-0 z-20 border-b border-line px-1 py-2 text-center font-normal ${
                wochenende ? 'w-12 xl:w-auto' : ''
              } ${spaltenGrund(tag, heute, !!zu) || 'bg-surface'}`}
            >
              <span className="block px-1 py-1">
                <span className={`block font-semibold ${tag === heute ? 'text-ink-deep' : 'text-ink'}`}>
                  {wochentag}
                </span>
                <span className="block text-xs text-ink-muted">{datum}</span>
                {/* Der Feiertag beim Namen statt als Farbe: Bernstein heisst „Achtung“. */}
                {feiertag && <span className="block truncate text-xs text-ink-muted" title={feiertag}>{feiertag}</span>}
                {zu && <span className="mt-1 block text-xs text-ink-muted">{zu}</span>}
              </span>
            </th>
          );
        })}
      </tr>
    </thead>
  );
}

/** Die Termine der Woche als eigene Zeile über den Personen bzw. Baustellen. */
function TermineZeile({ tage, termineAm }: { tage: string[]; termineAm: (tag: string) => Termin[] }) {
  return (
    <tr>
      <th scope="row" className="sticky left-0 z-10 border-b border-line bg-surface p-2 text-left font-normal text-ink">
        Termine
      </th>
      {tage.map((tag) => (
        <td key={tag} className="border-b border-line p-1 align-top">
          <span className="flex flex-col gap-1">
            {termineAm(tag).map((t) => (
              <span
                key={t.id}
                title={`${terminKopf(t)} · ${bezugText(t)}`}
                className="block rounded-sm border border-line bg-surface px-1.5 py-1 text-left text-xs"
              >
                <span className="block truncate font-normal text-ink">{terminKopf(t)}</span>
                <span className="block truncate text-ink-muted">{bezugText(t)}</span>
              </span>
            ))}
          </span>
        </td>
      ))}
    </tr>
  );
}

/**
 * Ein Gruppenkopf (Einstufung) — nur, wenn es mehr als eine Gruppe gibt.
 * Eingeklappt bleiben die Zeilen weg; der Kopf sagt, wie viele es sind.
 */
export function GruppenKopf({
  gruppe,
  spalten,
  offen,
  onUmschalten,
}: {
  gruppe: Gruppe;
  spalten: number;
  offen: boolean;
  onUmschalten: () => void;
}) {
  return (
    <tr>
      <th colSpan={spalten} scope="rowgroup" className="border-b border-line bg-surface-2 p-0 text-left">
        <button type="button" className="planung-gruppe" aria-expanded={offen} onClick={onUmschalten}>
          <span aria-hidden="true">{offen ? '▾' : '▸'}</span>
          {gruppe.name} · {gruppe.leute.length}
        </button>
      </th>
    </tr>
  );
}

/**
 * PERSONEN × TAGE, nur zum Lesen.
 *
 * FESTES TABELLENLAYOUT (`table-fixed`): feste Namensspalte, die sieben Tage
 * teilen sich den Rest zu gleichen Teilen. Im automatischen Layout nahm ein
 * Tag mit langem Kundennamen die ganze Breite, Mo–Do schrumpften bei 834 px
 * auf 17–29 px und brachen je Buchstabe um (Prüflauf 25.09.2026, P4-01).
 * Namensspalte 112 px, ab 1200 px 144 px, ab 1280 px 160 px; Samstag und
 * Sonntag bis 1280 px je 48 px.
 */
export function PersonenRaster({
  tage,
  heute,
  gruppen,
  zu,
  onGruppe,
  brett,
  zuAm,
  zuFuer,
  termine,
  termineAm,
}: {
  tage: string[];
  heute: string;
  gruppen: Gruppe[];
  /** Eingeklappte Gruppen. */
  zu: Set<string>;
  onGruppe: (name: string) => void;
  brett: Brett;
  zuAm: Map<string, string>;
  zuFuer: (uid: string, tag: string) => boolean;
  termine: Termin[];
  termineAm: (tag: string) => Termin[];
}) {
  const mitKoepfen = gruppen.length > 1;
  return (
    <div className="planung-huelle">
      <table
        aria-label="Wochenplan als Tabelle"
        className="w-full min-w-[30rem] table-fixed border-separate border-spacing-0 text-meta"
      >
        <TageKopf tage={tage} heute={heute} zuAm={zuAm} />
        <tbody>
          {termine.length > 0 && <TermineZeile tage={tage} termineAm={termineAm} />}
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
                        className="sticky left-0 z-10 max-w-[7rem] truncate border-b border-line bg-surface p-2 text-left font-normal text-ink lg:max-w-[9rem] xl:max-w-[10rem]"
                      >
                        {u.name}
                      </th>
                      {tage.map((tag) => {
                        const z = brett.get(u.uid)?.get(tag);
                        const leer = !z || (z.baustellen.length === 0 && !z.imUrlaub);
                        return (
                          <td
                            key={tag}
                            className={`border-b border-line p-1 align-top ${spaltenGrund(tag, heute, !!zuAm.get(tag))}`}
                          >
                            {/*
                              STUNDENWEISE WEG steht über dem, was sonst in der
                              Zelle steht: vormittags eingeteilt, nachmittags ZA.
                            */}
                            {z?.abwesendText && !z.imUrlaub && (
                              <span className="mb-1 block text-center text-xs text-ink-muted">{z.abwesendText}</span>
                            )}
                            {zuFuer(u.uid, tag) && (!z || z.baustellen.length === 0) ? (
                              /*
                                DER BETRIEB HAT ZU — für alle derselbe graue
                                Block, auch für den, der dabei persönlich Urlaub
                                gebucht bekam. Nicht für Ausgenommene: die
                                arbeiten. Wer trotzdem eingeteilt ist (etwa ein
                                Notdienst), steht mit seiner Baustelle da.
                              */
                              <span className="plan-weg">Betriebsurlaub</span>
                            ) : z?.imUrlaub ? (
                              <span className="flex flex-col gap-1">
                                <span className="plan-weg">{z.abwesendText}</span>
                                {/* M33: der Einsatz, den die Abwesenheit trifft, bleibt sichtbar. */}
                                {z.baustellen.map((b) => (
                                  <span key={b.nummer} title={`${b.name} · ${b.nummer} — eingeteilt, fehlt`} className="plan-konflikt-lesen">
                                    <span className="block truncate">fehlt: {b.nummer}</span>
                                  </span>
                                ))}
                              </span>
                            ) : leer ? (
                              <span className="block text-center text-xs text-ink-muted" aria-label="nicht eingeteilt">
                                –
                              </span>
                            ) : (
                              <span className="flex flex-col gap-1">
                                {z!.baustellen.map((b) => (
                                  <span key={b.nummer} title={`${b.name} · ${b.nummer}`} className="plan-block-lesen">
                                    {b.zeit && <span className="plan-zeit">{b.zeit}</span>}
                                    <span className="block truncate">{b.name}</span>
                                    <span className="block truncate">{b.nummer}</span>
                                    {b.helfer && <span className="block truncate">als Helfer</span>}
                                  </span>
                                ))}
                              </span>
                            )}
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
  );
}
