import { Fragment } from 'react';
import type { Termin } from '@/types';
import { getAustrianHolidayName, isWeekend } from '@/lib/time';
import { bezugText, terminKopf } from '@/features/termine/terminText';
import { tagKurz, type Brett, type Gruppe, type TagStand } from './planTypen';
import type { FensterStart } from './EinsatzFenster';

/*
  DAS RASTER DER WOCHE am Tablet und Schreibtisch: Personen × Tage oder
  Baustellen × Tage. Am Handy steht statt dessen die Tagesliste (in
  `WochenplanView`) — sieben Spalten auf 390 px wären ein Guckloch.
*/

const feiertagAm = (tag: string) => getAustrianHolidayName(new Date(`${tag}T00:00:00`));
const wochenendeAm = (tag: string) => isWeekend(new Date(`${tag}T00:00:00`));

/** Der Hintergrund einer Spalte: heute petrol-hell, Wochenende, Feiertag und Betriebsurlaub grau. */
function spaltenGrund(tag: string, heute: string, zu: boolean): string {
  if (tag === heute) return 'bg-petrol-hell';
  return feiertagAm(tag) || wochenendeAm(tag) || zu ? 'bg-surface-2' : '';
}

/**
 * Der Kopf mit den Tagen — gemeinsam für beide Sichten. Die Kopfzeile steht
 * beim Rollen fest (`sticky top-0`), die Ecke zusätzlich links.
 */
function TageKopf({
  ecke,
  tage,
  heute,
  nurLesen,
  freiJeTag,
  zuAm,
  onTag,
}: {
  ecke: string;
  tage: string[];
  heute: string;
  nurLesen: boolean;
  freiJeTag: Map<string, number>;
  zuAm: Map<string, string>;
  onTag: (tag: string) => void;
}) {
  return (
    <thead>
      <tr>
        <th className="sticky left-0 top-0 z-30 w-28 border-b border-line bg-surface p-2 text-left align-bottom lg:w-36 xl:w-40">
          <span className="section-label">{ecke}</span>
        </th>
        {tage.map((tag) => {
          const { wochentag, datum } = tagKurz(tag);
          const feiertag = feiertagAm(tag);
          const wochenende = wochenendeAm(tag);
          const frei = freiJeTag.get(tag) ?? 0;
          const zu = zuAm.get(tag);
          const inhalt = (
            <>
              <span className={`block font-semibold ${tag === heute ? 'text-ink-deep' : 'text-ink'}`}>
                {wochentag}
              </span>
              <span className="block text-xs text-ink-muted">{datum}</span>
              {/* Der Feiertag beim Namen statt als Farbe: Bernstein heisst „Achtung“. */}
              {feiertag && <span className="block truncate text-xs text-ink-muted" title={feiertag}>{feiertag}</span>}
            </>
          );
          return (
            <th
              key={tag}
              // Samstag und Sonntag schmäler, bis Platz ist: meist leer, und
              // so bleiben den Werktagen bei 834 px rund 64 px statt 47.
              className={`sticky top-0 z-20 border-b border-line px-1 py-2 text-center font-normal ${
                wochenende ? 'w-12 xl:w-auto' : ''
              } ${spaltenGrund(tag, heute, !!zu) || 'bg-surface'}`}
            >
              {nurLesen ? (
                <span className="block px-1 py-1">
                  {inhalt}
                  {zu && <span className="mt-1 block text-xs text-ink-muted">{zu}</span>}
                </span>
              ) : (
                <button
                  type="button"
                  onClick={() => onTag(tag)}
                  className="w-full rounded px-1 py-1"
                  aria-label={`${wochentag} ${datum} in der Tagesplanung öffnen`}
                >
                  {inhalt}
                  {/* Die Zahl, wegen der es dieses Brett gibt — an
                      Wochenende und Feiertag nicht: dort ist niemand
                      „frei", sondern keiner im Dienst (Prüflauf
                      24.09.2026, D15). */}
                  {(zu || (!wochenende && !feiertag)) && (
                    <span className="mt-1 block text-xs text-ink-muted">
                      {/* Mit Ausgenommenen ist auch am Betriebsurlaub
                          jemand frei — dann steht beides da. */}
                      {zu ? (frei > 0 ? `${zu} · ${frei} frei` : zu) : `${frei} frei`}
                    </span>
                  )}
                </button>
              )}
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
 * PERSONEN × TAGE.
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
  nurLesen,
  gruppen,
  zu,
  onGruppe,
  brett,
  freiJeTag,
  zuAm,
  zuFuer,
  termine,
  termineAm,
  onTag,
  onZelle,
}: {
  tage: string[];
  heute: string;
  nurLesen: boolean;
  gruppen: Gruppe[];
  /** Eingeklappte Gruppen. */
  zu: Set<string>;
  onGruppe: (name: string) => void;
  brett: Brett;
  freiJeTag: Map<string, number>;
  zuAm: Map<string, string>;
  zuFuer: (uid: string, tag: string) => boolean;
  termine: Termin[];
  termineAm: (tag: string) => Termin[];
  onTag: (tag: string) => void;
  onZelle: (start: FensterStart) => void;
}) {
  const mitKoepfen = gruppen.length > 1;
  return (
    <div className="planung-huelle">
      <table
        aria-label="Wochenplan als Tabelle"
        className="w-full min-w-[30rem] table-fixed border-separate border-spacing-0 text-meta"
      >
        <TageKopf ecke="Mitarbeiter" tage={tage} heute={heute} nurLesen={nurLesen} freiJeTag={freiJeTag} zuAm={zuAm} onTag={onTag} />
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
                        const { datum } = tagKurz(tag);
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
                                arbeiten und sind einteilbar. Wer trotzdem eingeteilt ist (etwa
                                ein Notdienst), steht mit seiner Baustelle da.
                              */
                              <span className="plan-weg">Betriebsurlaub</span>
                            ) : z?.imUrlaub ? (
                              <span className="flex flex-col gap-1">
                                <span className="plan-weg">{z.abwesendText}</span>
                                {/*
                                  M33: der Einsatz, den die Abwesenheit trifft,
                                  bleibt sichtbar — als Konflikt in Bernstein,
                                  und antippbar, damit gleich umgeplant wird.
                                */}
                                {z.baustellen.map((b) =>
                                  nurLesen ? (
                                    <span key={b.nummer} title={`${b.name} · ${b.nummer} — eingeteilt, fehlt`} className="plan-konflikt-lesen">
                                      <span className="block truncate">fehlt: {b.nummer}</span>
                                    </span>
                                  ) : (
                                    <button
                                      key={b.nummer}
                                      type="button"
                                      title={`${b.name} · ${b.nummer} — eingeteilt, fehlt`}
                                      aria-label={`${b.name} (${b.nummer}) am ${datum} bearbeiten — eingeteilt, fehlt`}
                                      className="plan-konflikt"
                                      onClick={() => onZelle({ datum: tag, projectNumber: b.nummer })}
                                    >
                                      <span className="block truncate">fehlt: {b.nummer}</span>
                                    </button>
                                  ),
                                )}
                              </span>
                            ) : leer && nurLesen ? (
                              <span className="block text-center text-xs text-ink-muted" aria-label="nicht eingeteilt">
                                –
                              </span>
                            ) : leer ? (
                              /*
                                Eine leere Zelle ist die WICHTIGSTE Information
                                dieses Bretts. Ein Tipp öffnet das Seitenfenster
                                mit Tag und Person schon gewählt.
                              */
                              <button
                                type="button"
                                onClick={() => onZelle({ datum: tag, person: u.uid })}
                                aria-label={`${u.name} am ${datum} einteilen`}
                                className="plan-frei"
                              >
                                frei
                              </button>
                            ) : (
                              <span className="flex flex-col gap-1">
                                {z!.baustellen.map((b) => {
                                  const text = (
                                    <>
                                      {b.zeit && <span className="plan-zeit">{b.zeit}</span>}
                                      <span className="block truncate">{b.name}</span>
                                      <span className="block truncate">{b.nummer}</span>
                                      {b.helfer && <span className="block truncate">als Helfer</span>}
                                    </>
                                  );
                                  return nurLesen ? (
                                    <span key={b.nummer} title={`${b.name} · ${b.nummer}`} className="plan-block-lesen">
                                      {text}
                                    </span>
                                  ) : (
                                    <button
                                      key={b.nummer}
                                      type="button"
                                      onClick={() => onZelle({ datum: tag, projectNumber: b.nummer })}
                                      // Mit Nummer: zwei Baustellen desselben Kunden am selben Tag
                                      // hießen für die Vorlesehilfe sonst gleich.
                                      aria-label={`${b.name} (${b.nummer}) am ${datum} bearbeiten`}
                                      // Gekürzt in der engen Zelle — der volle Name beim Überfahren.
                                      title={`${b.name} · ${b.nummer}`}
                                      className="plan-block"
                                    >
                                      {text}
                                    </button>
                                  );
                                })}
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

/**
 * BAUSTELLEN × TAGE — nur die Baustellen mit einem Einsatz in dieser Woche
 * (Linie „Lot“, E2). Beantwortet „ist jede Baustelle besetzt?“; ein Tipp auf
 * einen leeren Tag plant genau diese Baustelle dort ein.
 */
export function BaustellenRaster({
  tage,
  heute,
  proTag,
  freiJeTag,
  zuAm,
  termine,
  termineAm,
  onTag,
  onZelle,
}: {
  tage: string[];
  heute: string;
  proTag: Map<string, TagStand>;
  freiJeTag: Map<string, number>;
  zuAm: Map<string, string>;
  termine: Termin[];
  termineAm: (tag: string) => Termin[];
  onTag: (tag: string) => void;
  onZelle: (start: FensterStart) => void;
}) {
  const baustellen = new Map<string, string>();
  for (const tag of tage) for (const b of proTag.get(tag)?.baustellen ?? []) baustellen.set(b.nummer, b.name);
  const zeilen = [...baustellen.entries()].sort((a, b) => a[1].localeCompare(b[1], 'de'));

  return (
    <div className="planung-huelle">
      <table
        aria-label="Wochenplan nach Baustellen"
        className="w-full min-w-[30rem] table-fixed border-separate border-spacing-0 text-meta"
      >
        <TageKopf ecke="Baustelle" tage={tage} heute={heute} nurLesen={false} freiJeTag={freiJeTag} zuAm={zuAm} onTag={onTag} />
        <tbody>
          {termine.length > 0 && <TermineZeile tage={tage} termineAm={termineAm} />}
          {zeilen.length === 0 && (
            <tr>
              <td colSpan={tage.length + 1} className="p-4 text-sm text-ink-muted">
                In dieser Woche ist keine Baustelle eingeplant.
              </td>
            </tr>
          )}
          {zeilen.map(([nummer, name]) => (
            <tr key={nummer}>
              <th scope="row" className="sticky left-0 z-10 border-b border-line bg-surface p-2 text-left font-normal text-ink">
                <span className="block truncate" title={`${name} · ${nummer}`}>{name}</span>
                <span className="block truncate text-xs text-ink-muted">{nummer}</span>
              </th>
              {tage.map((tag) => {
                const e = proTag.get(tag)?.baustellen.find((b) => b.nummer === nummer);
                const { datum } = tagKurz(tag);
                return (
                  <td key={tag} className={`border-b border-line p-1 align-top ${spaltenGrund(tag, heute, !!zuAm.get(tag))}`}>
                    {e ? (
                      <button
                        type="button"
                        onClick={() => onZelle({ datum: tag, projectNumber: nummer })}
                        aria-label={`${name} (${nummer}) am ${datum} bearbeiten`}
                        // Gekürzt in der engen Zelle — die vollen Namen beim Überfahren.
                        title={[...e.namen, ...e.fehlen.map((f) => `fehlt: ${f}`)].join(', ')}
                        className={e.fehlen.length > 0 ? 'plan-konflikt' : 'plan-block'}
                      >
                        {e.zeit && <span className="plan-zeit">{e.zeit}</span>}
                        {e.namen.map((n) => (
                          <span key={n} className="block truncate">
                            {e.helfer.includes(n) ? `${n} (Helfer)` : n}
                          </span>
                        ))}
                        {e.fehlen.length > 0 && (
                          <span className="block">
                            {e.namen.length === 0 ? 'Unbesetzt — ' : ''}fehlt: {e.fehlen.join(', ')}
                          </span>
                        )}
                      </button>
                    ) : (
                      <button
                        type="button"
                        onClick={() => onZelle({ datum: tag, projectNumber: nummer })}
                        aria-label={`${name} (${nummer}) am ${datum} einplanen`}
                        className="plan-frei"
                      >
                        –
                      </button>
                    )}
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
