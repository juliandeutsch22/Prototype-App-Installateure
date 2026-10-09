import type { AppUser, Project, Termin } from '@/types';
import { artName } from '@/features/termine/terminText';
import { alsHelferEingestuft, istLehrling } from './stufeImEinsatz';
import type { TagBaustelle, Zelle } from './planTypen';
import type { FensterStart } from './EinsatzFenster';
import { ortAus, terminOrtKurz, terminZeitKurz } from './wochenTermine';

/*
  DIE EINTRÄGE EINER PERSON AN EINEM TAG (Runde 4, Auftrag 4.2 und 4.4) —
  im Raster am Tablet und Schreibtisch und in der Tagesliste am Handy
  dieselben Bausteine: Einsatzblock, Termin-Eintrag, abwesend.
*/

/** Was ein Block über seine Baustelle braucht. */
export interface BaustellenInfo {
  projekt: Project | undefined;
  stand: TagBaustelle | undefined;
}

/**
 * DER EINSATZBLOCK: Kunde (nie abgeschnitten — er bricht um), Uhrzeit bzw.
 * Ort, die Nummer (am Tablet nur im `title`), darunter die Termine derselben
 * Baustelle am selben Tag. Der `title` trägt den vollen Text.
 *
 * „ALS HELFER“ steht im Block nur, wo es von der Einstufung abweicht: ein
 * Facharbeiter oder Obermonteur, der hier mit dem Helfersatz arbeitet. Bei
 * Helfer und Lehrling steht die Stufe ohnehin fest (`stufeImEinsatz`) und
 * die Gruppe im Raster sagt es schon — dort wäre die Zeile Lärm, beim
 * Lehrling sogar falsch (er arbeitet mit dem Lehrlingssatz). Im `title`
 * stehen die Helfer immer, wie in der Tagesplanung.
 */
function Einsatzblock({
  person,
  tag,
  datum,
  b,
  info,
  konflikt,
  zusatz,
  onEinsatz,
}: {
  person: AppUser;
  tag: string;
  datum: string;
  b: Zelle['baustellen'][number];
  info: BaustellenInfo;
  /** Eingeteilt, aber ganztags weg: „Krank“ bzw. „abwesend“. */
  konflikt: string | null;
  zusatz: Termin[];
  onEinsatz: (start: FensterStart) => void;
}) {
  const p = info.projekt;
  const ort = ortAus(p?.address);
  const eingeteilt = info.stand
    ? [
        ...info.stand.namen.map((n) => (info.stand!.helfer.includes(n) ? `${n} (Helfer)` : n)),
        ...info.stand.fehlen.map((f) => `${f} fehlt`),
      ].join(', ')
    : person.name;
  const titel = [b.name, p?.bezeichnung?.trim(), b.nummer, b.zeit, eingeteilt].filter(Boolean).join(' · ');
  const alsHelfer = b.helfer && !alsHelferEingestuft(person) && !istLehrling(person);
  return (
    <button
      type="button"
      className={konflikt ? 'eintrag-konflikt' : 'eintrag'}
      title={konflikt ? `${titel} — eingeteilt, fehlt` : titel}
      // Mit Nummer: zwei Baustellen desselben Kunden am selben Tag hießen
      // für die Vorlesehilfe sonst gleich. Dazu Person und Zustand.
      aria-label={`${b.name} (${b.nummer}) am ${datum} bearbeiten – ${person.name}${
        konflikt ? `, eingeteilt, fehlt: ${konflikt}` : b.zeit ? `, ${b.zeit}` : ''
      }`}
      onClick={() => onEinsatz({ datum: tag, projectNumber: b.nummer })}
    >
      <span className="e-titel">{b.name}</span>
      {konflikt ? (
        <span className="e-zeile">{konflikt === 'abwesend' ? 'fehlt' : `fehlt: ${konflikt}`}</span>
      ) : (
        <>
          {(b.zeit || ort) && <span className="e-zeile">{b.zeit ?? ort}</span>}
          {alsHelfer && <span className="e-zeile">als Helfer</span>}
          <span className="e-nr">{b.nummer}</span>
          {zusatz.map((t) => (
            <span key={t.id} className="e-zusatz">
              {t.art} {terminZeitKurz(t)}
            </span>
          ))}
        </>
      )}
    </button>
  );
}

/** DER TERMIN-EINTRAG: weiß, Petrol links; ein Klick öffnet „Termin ändern“. */
export function TerminEintrag({
  t,
  datum,
  wer,
  darf,
  onTermin,
}: {
  t: Termin;
  datum: string;
  /** Für die Vorlesehilfe: in wessen Zelle bzw. an welcher Baustelle. */
  wer: string;
  darf: boolean;
  onTermin: (t: Termin) => void;
}) {
  return (
    <button
      type="button"
      className="eintrag-termin"
      title={`${artName(t.art)} · ${terminZeitKurz(t)} · ${terminOrtKurz(t)}`}
      aria-label={`${artName(t.art)} am ${datum}, ${terminZeitKurz(t)}, ${terminOrtKurz(t)} – ${wer} – ${
        darf ? 'Termin ändern' : 'Termin ansehen'
      }`}
      onClick={() => onTermin(t)}
    >
      <span className="e-titel">{t.art}</span>
      <span className="e-zeile">{terminZeitKurz(t)}</span>
      <span className="e-zeile">{terminOrtKurz(t)}</span>
    </button>
  );
}

/**
 * Was in der Zelle einer Person an einem Tag steht. Leer heißt leer: kein
 * Kasten „frei“ mehr (Auftrag 4.2) — ob etwas dasteht, sagt `zelleLeer`.
 */
export function PersonEintraege({
  person,
  tag,
  datum,
  zelle,
  zu,
  termine,
  infoFuer,
  darf,
  onEinsatz,
  onTermin,
}: {
  person: AppUser;
  tag: string;
  datum: string;
  zelle: Zelle | undefined;
  /** Der Betrieb hat für diese Person zu. */
  zu: boolean;
  /** Alle Termine dieses Tages. */
  termine: Termin[];
  infoFuer: (nummer: string) => BaustellenInfo;
  darf: boolean;
  onEinsatz: (start: FensterStart) => void;
  onTermin: (t: Termin) => void;
}) {
  const teile = [];
  const baustellen = zelle?.baustellen ?? [];
  /*
    STUNDENWEISE WEG steht über dem, was sonst in der Zelle steht:
    vormittags eingeteilt, nachmittags ZA.
  */
  if (zelle?.abwesendText && !zelle.imUrlaub) {
    teile.push(
      <span key="teilweise" className="e-teilweise">
        {zelle.abwesendText}
      </span>,
    );
  }
  if (zu && baustellen.length === 0) {
    // Der Betrieb hat zu — für alle derselbe graue Block, nicht für Ausgenommene.
    teile.push(
      <span key="zu" className="eintrag-weg">
        Betriebsurlaub
      </span>,
    );
  } else if (zelle?.imUrlaub && baustellen.length === 0) {
    teile.push(
      <span key="weg" className="eintrag-weg">
        {zelle.abwesendText}
      </span>,
    );
  }
  for (const b of baustellen) {
    teile.push(
      <Einsatzblock
        key={b.nummer}
        person={person}
        tag={tag}
        datum={datum}
        b={b}
        info={infoFuer(b.nummer)}
        konflikt={zelle?.imUrlaub ? (zelle.abwesendText ?? 'abwesend') : null}
        // Termine derselben Baustelle — nicht bei dem, der selbst teilnimmt:
        // bei ihm steht der Termin schon als eigener Eintrag.
        zusatz={termine.filter((t) => t.projectNumber === b.nummer && !t.teilnehmer.includes(person.uid))}
        onEinsatz={onEinsatz}
      />,
    );
  }
  for (const t of termine.filter((x) => x.teilnehmer.includes(person.uid))) {
    teile.push(<TerminEintrag key={t.id} t={t} datum={datum} wer={person.name} darf={darf} onTermin={onTermin} />);
  }
  return <>{teile}</>;
}
