import { Fragment } from 'react';
import type { AppUser, Assignment, Project, Termin } from '@/types';
import { tagKurz, type Brett, type Gruppe, type TagStand } from './planTypen';
import type { FensterStart } from './EinsatzFenster';
import { GruppenKopf } from './PlanRaster';
import { PersonEintraege, TerminEintrag, type BaustellenInfo } from './WochenEintraege';
import {
  feiertagAm,
  lieferungOhneAnnahme,
  ohneAnnahmeText,
  ortAus,
  personKurz,
  ruhetag,
  tagLang,
  termineText,
  zelleLeer,
} from './wochenTermine';

/*
  DAS RASTER DER EINSATZPLANUNG am Tablet und Schreibtisch (Runde 4,
  Auftrag 4.2 bis 4.5): Personen × Tage oder Baustellen × Tage. Am Handy
  steht statt dessen die Tageswahl mit der Tagesliste (`HandyWoche`).

  DIE BREITE TEILEN DIE SPALTEN SELBST (`table-layout: fixed`, Spalten aus
  `<colgroup>`): die Namensspalte fest, Samstag, Sonntag und Feiertag schmal,
  solange dort nichts steht, die übrigen Tage teilen den Rest gleich. Wie
  viele Tage breit sind, entscheidet die Mindestbreite des Rasters
  (`wp-raster-N`, N breite Tage) — wird es enger, rollt das Raster in sich,
  nie die Seite. Kopfzeile und Namensspalte stehen dabei fest.
*/

/** Die gemeinsamen Angaben beider Sichten. */
interface RasterGrund {
  tage: string[];
  heute: string;
  /** Der Tag aus der Adresse (`?tag=`), sein Kopf trägt einen Ring. */
  markiert: string | null;
  /** Samstag, Sonntag, Feiertag ohne Einsatz und Termin. */
  schmal: Set<string>;
  proTag: Map<string, TagStand>;
  freiJeTag: Map<string, number>;
  zuAm: Map<string, string>;
  einsaetze: Assignment[];
  termineAm: (tag: string) => Termin[];
  /** Darf Termine schreiben — sonst heißt es „Termin ansehen“. */
  darf: boolean;
  /** Das Seitenfenster „Tag“. */
  onTag: (tag: string) => void;
  onEinsatz: (start: FensterStart) => void;
  onTermin: (t: Termin) => void;
  /**
   * DIE TEAM-WOCHE DER MONTEURE (10.10.2026): dasselbe Raster, nur zum
   * Lesen — keine Knöpfe, kein „frei“, keine „Lieferung ohne Annahme“. Das
   * sind Fragen der Planung, nicht des Teams.
   */
  lesen?: boolean;
  /** Wer schaut — seine Zeile trägt „du“, damit er sich findet. */
  ich?: string;
}

/** Die Klasse einer Zelle: heute, Wochenende/Feiertag/Betriebsurlaub, schmal. */
function zellenKlasse(tag: string, g: RasterGrund): string {
  if (g.schmal.has(tag)) return 'wp-zelle-schmal';
  if (tag === g.heute) return 'wp-zelle-heute';
  return ruhetag(tag) || g.zuAm.has(tag) ? 'wp-zelle-ruhe' : 'wp-zelle';
}

/** Spalten und Mindestbreite — beides aus der Zahl der breiten Tage. */
function Spalten({ g }: { g: RasterGrund }) {
  return (
    <colgroup>
      <col className="wp-spalte-name" />
      {g.tage.map((tag) => (
        <col key={tag} className={g.schmal.has(tag) ? 'wp-spalte-schmal' : 'wp-spalte-tag'} />
      ))}
    </colgroup>
  );
}

/**
 * DER TAGESKOPF (Auftrag 4.3): Tag, „N frei“ bzw. Feiertag, „Lieferung ohne
 * Annahme“ in Bernstein, „N Termine“. Ein Klick öffnet das Seitenfenster
 * „Tag“ — vorher sprang er nach „Tag planen“; das steht jetzt dort unten.
 */
function TagesKopf({ ecke, g }: { ecke: string; g: RasterGrund }) {
  return (
    <thead>
      <tr>
        <th className="wp-ecke">
          <span className="section-label">{ecke}</span>
        </th>
        {g.tage.map((tag) => {
          const { wochentag, datum } = tagKurz(tag);
          const feiertag = feiertagAm(tag);
          const zu = g.zuAm.get(tag);
          const frei = g.freiJeTag.get(tag) ?? 0;
          const termine = g.termineAm(tag);
          const ohneAnnahme = g.lesen ? 0 : termine.filter((t) => lieferungOhneAnnahme(t, g.einsaetze)).length;
          /*
            Die Zahl, wegen der es dieses Brett gibt — an Wochenende und
            Feiertag nicht: dort ist niemand „frei“, sondern keiner im Dienst
            (Prüflauf 24.09.2026, D15). Mit Ausgenommenen ist auch am
            Betriebsurlaub jemand frei — dann steht beides da.
          */
          const info = g.lesen
            ? (feiertag ?? zu ?? null)
            : (feiertag ?? (zu ? (frei > 0 ? `${zu} · ${frei} frei` : zu) : ruhetag(tag) ? null : `${frei} frei`));
          const schmal = g.schmal.has(tag);
          const klasse =
            tag === g.markiert
              ? 'wp-kopf-markiert'
              : schmal
                ? 'wp-kopf-schmal'
                : tag === g.heute
                  ? 'wp-kopf-heute'
                  : ruhetag(tag) || zu
                    ? 'wp-kopf-ruhe'
                    : 'wp-kopf';
          const vorlesen = [
            info,
            ohneAnnahme > 0 ? ohneAnnahmeText(ohneAnnahme) : null,
            termine.length > 0 ? termineText(termine.length) : null,
          ].filter(Boolean);
          if (g.lesen) {
            return (
              <th key={tag} className={klasse} aria-current={tag === g.heute ? 'date' : undefined}>
                <span
                  className={`${schmal ? 'wp-kopf-knopf-schmal' : 'wp-kopf-knopf'} nur-lesen`}
                  title={schmal ? (feiertag ?? undefined) : undefined}
                >
                  {schmal ? (
                    <>
                      <span className="kopf-tag">{wochentag.replace('.', '')}</span>
                      <span className="kopf-info">{datum.slice(0, 3)}</span>
                    </>
                  ) : (
                    <>
                      <span className="kopf-tag">
                        {wochentag.replace('.', '')} {datum}
                      </span>
                      {info && <span className="kopf-info">{info}</span>}
                      {/* Ohne Knopf nicht unterstrichen — sonst sähe es aus wie ein Verweis. */}
                      {termine.length > 0 && <span className="kopf-info">{termineText(termine.length)}</span>}
                    </>
                  )}
                </span>
              </th>
            );
          }
          return (
            <th key={tag} className={klasse} aria-current={tag === g.heute ? 'date' : undefined}>
              <button
                type="button"
                className={schmal ? 'wp-kopf-knopf-schmal' : 'wp-kopf-knopf'}
                onClick={() => g.onTag(tag)}
                title={schmal ? (feiertag ?? undefined) : undefined}
                aria-label={`${tagLang(tag)}${vorlesen.length ? `: ${vorlesen.join(', ')}` : ''} – ganzen Tag ansehen`}
              >
                {schmal ? (
                  // Schmal: nur „Sa“ und „10.“, der Feiertag im `title`.
                  <>
                    <span className="kopf-tag">{wochentag.replace('.', '')}</span>
                    <span className="kopf-info">{datum.slice(0, 3)}</span>
                  </>
                ) : (
                  <>
                    <span className="kopf-tag">
                      {wochentag.replace('.', '')} {datum}
                    </span>
                    {info && <span className="kopf-info">{info}</span>}
                    {ohneAnnahme > 0 && <span className="kopf-warnung">{ohneAnnahmeText(ohneAnnahme)}</span>}
                    {termine.length > 0 && <span className="kopf-termine">{termineText(termine.length)}</span>}
                  </>
                )}
              </button>
            </th>
          );
        })}
      </tr>
    </thead>
  );
}

/**
 * Wie viele Tage breit sind — daran hängt die Mindestbreite. Die Klassen
 * stehen ausgeschrieben da: Tailwind behält nur Bausteine, deren Namen es im
 * Quelltext findet.
 */
const RASTER = ['wp-raster-0', 'wp-raster-1', 'wp-raster-2', 'wp-raster-3', 'wp-raster-4', 'wp-raster-5', 'wp-raster-6', 'wp-raster-7'];
const rasterKlasse = (g: RasterGrund) => RASTER[Math.max(0, Math.min(7, g.tage.length - g.schmal.size))];

/**
 * PERSONEN × TAGE. Eine leere Zelle ist leer; ein Klick darauf öffnet
 * „Einsatz planen“ mit Tag und Person (am Schreibtisch zeigt das
 * Darüberfahren „+ Einsatz planen“). Der Knopf liegt unter den Einträgen
 * über die ganze Zelle — so plant auch ein Klick neben einen Einsatz oder auf
 * einen grauen Block, und mit der Tastatur ist jede Zelle erreichbar.
 */
export function PersonenWoche({
  g,
  gruppen,
  zu,
  onGruppe,
  brett,
  zuFuer,
  infoFuer,
}: {
  g: RasterGrund;
  gruppen: Gruppe[];
  /** Eingeklappte Gruppen. */
  zu: Set<string>;
  onGruppe: (name: string) => void;
  brett: Brett;
  zuFuer: (uid: string, tag: string) => boolean;
  infoFuer: (tag: string, nummer: string) => BaustellenInfo;
}) {
  const mitKoepfen = gruppen.length > 1;
  return (
    <div className="wp-huelle">
      <table aria-label="Wochenplan als Tabelle" className={rasterKlasse(g)}>
        <Spalten g={g} />
        <TagesKopf ecke="Mitarbeiter" g={g} />
        <tbody>
          {gruppen.map((gr) => {
            const offen = !zu.has(gr.name);
            return (
              <Fragment key={gr.name}>
                {mitKoepfen && (
                  <GruppenKopf gruppe={gr} spalten={g.tage.length + 1} offen={offen} onUmschalten={() => onGruppe(gr.name)} />
                )}
                {(offen || !mitKoepfen) &&
                  gr.leute.map((u) => (
                    <tr key={u.uid}>
                      <th scope="row" className="wp-name">
                        {u.name}
                        {g.ich === u.uid && <span className="wp-name-ich"> · du</span>}
                      </th>
                      {g.tage.map((tag) => (
                        <PersonenZelle key={tag} u={u} tag={tag} g={g} brett={brett} zuFuer={zuFuer} infoFuer={infoFuer} />
                      ))}
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

function PersonenZelle({
  u,
  tag,
  g,
  brett,
  zuFuer,
  infoFuer,
}: {
  u: AppUser;
  tag: string;
  g: RasterGrund;
  brett: Brett;
  zuFuer: (uid: string, tag: string) => boolean;
  infoFuer: (tag: string, nummer: string) => BaustellenInfo;
}) {
  const z = brett.get(u.uid)?.get(tag);
  const { datum } = tagKurz(tag);
  const zu = zuFuer(u.uid, tag);
  const termine = g.termineAm(tag);
  const leer = zelleLeer(z, zu, termine, u.uid);
  const schmal = g.schmal.has(tag);
  const zustand = z?.imUrlaub
    ? z.baustellen.length > 0
      ? 'eingeteilt, fehlt'
      : (z.abwesendText ?? 'abwesend')
    : zu && !z?.baustellen.length
      ? 'Betriebsurlaub'
      : z?.baustellen.length
        ? 'eingeteilt'
        : ruhetag(tag)
          ? (feiertagAm(tag) ?? 'Wochenende')
          : 'frei';
  if (g.lesen) {
    return (
      <td className={zellenKlasse(tag, g)}>
        {/* Leer heißt leer; die Vorlesehilfe sagt es (in der Team-Woche gibt es kein „frei“). */}
        {leer && <span className="sr-only">{zustandLesen(zustand)}</span>}
        {!leer && !schmal && (
          <div className="zelle-inhalt">
            <PersonEintraege
              person={u}
              tag={tag}
              datum={datum}
              zelle={z}
              zu={zu}
              termine={termine}
              infoFuer={(nr) => infoFuer(tag, nr)}
              darf={false}
              lesen
              onEinsatz={g.onEinsatz}
              onTermin={g.onTermin}
            />
          </div>
        )}
      </td>
    );
  }
  return (
    <td className={zellenKlasse(tag, g)}>
      <button
        type="button"
        className="zelle-planen"
        onClick={() => g.onEinsatz({ datum: tag, person: u.uid })}
        aria-label={`${u.name}, ${tagLang(tag)}: ${zustand} – Einsatz planen`}
      >
        {leer && !schmal && <span className="zelle-plus">+ Einsatz planen</span>}
      </button>
      {/* Schmal steht nichts in der Zelle — der Tag ist leer, sonst wäre er breit. */}
      {!leer && !schmal && (
        <div className="zelle-inhalt">
          <PersonEintraege
            person={u}
            tag={tag}
            datum={datum}
            zelle={z}
            zu={zu}
            termine={termine}
            infoFuer={(nr) => infoFuer(tag, nr)}
            darf={g.darf}
            onEinsatz={g.onEinsatz}
            onTermin={g.onTermin}
          />
        </div>
      )}
    </td>
  );
}

/** In der Team-Woche gibt es kein „frei“ — eine leere Zelle heißt dort „nicht eingeteilt“. */
const zustandLesen = (zustand: string) => (zustand === 'frei' ? 'nicht eingeteilt' : zustand);

/**
 * BAUSTELLEN × TAGE (Auftrag 4.5): die Baustellen mit einem Einsatz oder
 * einem Termin in dieser Woche. Je Tag ein Block mit den Eingeteilten in
 * Kurzform und der Zeit — fehlt jemand, Bernstein —, dazu die Termine der
 * Baustelle. Ein leerer Tag plant genau diese Baustelle ein.
 */
export function BaustellenWoche({
  g,
  staff,
  brett,
  projects,
  termine,
}: {
  g: RasterGrund;
  staff: AppUser[];
  brett: Brett;
  projects: Project[];
  termine: Termin[];
}) {
  const zeilen = new Map<string, string>();
  for (const a of g.einsaetze) {
    if (!g.tage.includes(a.date)) continue;
    zeilen.set(a.projectNumber, projects.find((p) => p.projectNumber === a.projectNumber)?.customerName ?? a.projectNumber);
  }
  for (const t of termine) {
    if (!t.projectNumber || zeilen.has(t.projectNumber)) continue;
    zeilen.set(t.projectNumber, projects.find((p) => p.projectNumber === t.projectNumber)?.customerName ?? t.ortName ?? t.projectNumber);
  }
  const sortiert = [...zeilen.entries()].sort((a, b) => a[1].localeCompare(b[1], 'de'));
  const nameVon = (uid: string, ersatz: string | undefined) => staff.find((u) => u.uid === uid)?.name ?? ersatz ?? 'Mitarbeiter';

  return (
    <div className="wp-huelle">
      <table aria-label="Wochenplan nach Baustellen" className={rasterKlasse(g)}>
        <Spalten g={g} />
        <TagesKopf ecke="Baustelle" g={g} />
        <tbody>
          {sortiert.length === 0 && (
            <tr>
              <td colSpan={g.tage.length + 1} className="wp-leer">
                In dieser Woche ist keine Baustelle eingeplant.
              </td>
            </tr>
          )}
          {sortiert.map(([nummer, name]) => {
            const p = projects.find((x) => x.projectNumber === nummer);
            const ort = ortAus(p?.address);
            return (
              <tr key={nummer}>
                <th scope="row" className="wp-name">
                  <span className="wp-name-titel">{name}</span>
                  <span className="wp-name-info">{[nummer, ort].filter(Boolean).join(' · ')}</span>
                </th>
                {g.tage.map((tag) => {
                  const { datum } = tagKurz(tag);
                  const hier = g.einsaetze.filter((a) => a.date === tag && a.projectNumber === nummer);
                  const termineHier = g.termineAm(tag).filter((t) => t.projectNumber === nummer);
                  const schmal = g.schmal.has(tag);
                  const weg = (uid: string) => !!brett.get(uid)?.get(tag)?.imUrlaub;
                  const fehlen = hier.filter((a) => weg(a.userId));
                  const zeit = g.proTag.get(tag)?.baustellen.find((b) => b.nummer === nummer)?.zeit ?? null;
                  const volleNamen = hier.map((a) => {
                    const n = nameVon(a.userId, a.userName);
                    const grund = brett.get(a.userId)?.get(tag)?.abwesendText;
                    return weg(a.userId) ? `${n} fehlt${grund && grund !== 'abwesend' ? ` (${grund})` : ''}` : a.asHelper ? `${n} (Helfer)` : n;
                  });
                  return (
                    <td key={tag} className={zellenKlasse(tag, g)}>
                      <button
                        type="button"
                        className="zelle-planen"
                        onClick={() => g.onEinsatz({ datum: tag, projectNumber: nummer })}
                        aria-label={`${name} (${nummer}) am ${datum} einplanen`}
                      >
                        {hier.length === 0 && termineHier.length === 0 && !schmal && (
                          <span className="zelle-plus">+ Einsatz planen</span>
                        )}
                      </button>
                      {!schmal && (hier.length > 0 || termineHier.length > 0) && (
                        <div className="zelle-inhalt">
                          {hier.length > 0 && (
                            <button
                              type="button"
                              className={fehlen.length > 0 ? 'eintrag-konflikt' : 'eintrag'}
                              onClick={() => g.onEinsatz({ datum: tag, projectNumber: nummer })}
                              title={volleNamen.join(', ')}
                              aria-label={`${name} (${nummer}) am ${datum} bearbeiten – ${volleNamen.join(', ')}`}
                            >
                              <span className="e-titel">
                                {hier.map((a) => personKurz(nameVon(a.userId, a.userName))).join(', ')}
                              </span>
                              <span className="e-zeile">
                                {fehlen.length > 0
                                  ? `${fehlen.map((a) => personKurz(nameVon(a.userId, a.userName))).join(', ')} fehlt`
                                  : (zeit ?? 'ganztags')}
                              </span>
                            </button>
                          )}
                          {termineHier.map((t) => (
                            <TerminEintrag key={t.id} t={t} datum={datum} wer={name} darf={g.darf} onTermin={g.onTermin} />
                          ))}
                        </div>
                      )}
                    </td>
                  );
                })}
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

export type { RasterGrund };
