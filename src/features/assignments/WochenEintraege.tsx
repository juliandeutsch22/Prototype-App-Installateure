import type { HTMLAttributes } from 'react';
import type { AppUser, Assignment, Project, Termin } from '@/types';
import Icon from '@/components/Icon';
import { naechsterWerktag, type Last } from './umplanen';
import { artName } from '@/features/termine/terminText';
import { alsHelferEingestuft, istLehrling } from './stufeImEinsatz';
import type { TagBaustelle, Zelle } from './planTypen';
import type { FensterStart } from './EinsatzFenster';
import { ortAus, terminOrtKurz, terminZeitKurz } from './wochenTermine';
import type { MaterialLage } from './materialDeckung';

/*
  DIE EINTRÄGE EINER PERSON AN EINEM TAG (Runde 4, Auftrag 4.2 und 4.4) —
  im Raster am Tablet und Schreibtisch und in der Tagesliste am Handy
  dieselben Bausteine: Einsatzblock, Termin-Eintrag, abwesend.
*/

/** Was ein Block über seine Baustelle braucht. */
export interface BaustellenInfo {
  projekt: Project | undefined;
  stand: TagBaustelle | undefined;
  /** Die Materialbereitschaft des Einsatzes (M04b) — nur mit Rüstliste und Modul. */
  material?: MaterialLage;
}

/**
 * DIE HANDLUNGEN AM EINSATZ (E88): Bearbeiten, Verschieben, Auf nächsten
 * Werktag kopieren, Entfernen — als Leiste beim Darüberfahren, beim Fokus
 * und nach langem Drücken, und das Ziehen selbst. Nur für die Führung im
 * eigenen Betrieb (`einsatz_umplanen`); ohne sie steht der Block wie bisher.
 */
export interface EinsatzAktionen {
  /** Die Zeile dieses Einsatzes: Person, Tag, Baustelle. */
  einsatzVon: (uid: string, tag: string, nummer: string) => Assignment | undefined;
  onVerschieben: (a: Assignment, titel: string) => void;
  onKopieren: (a: Assignment, titel: string, nach: string) => void;
  onEntfernen: (a: Assignment, titel: string) => void;
  /** Ziehen (`useZiehen`). */
  griff: (last: Last) => HTMLAttributes<HTMLElement> & { 'data-ziehbar': string };
  /** Der angehobene Einsatz (langes Drücken): seine Leiste steht offen. */
  offen: string | null;
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
  lesen,
  onEinsatz,
  aktionen,
}: {
  person: AppUser;
  tag: string;
  datum: string;
  b: Zelle['baustellen'][number];
  aktionen?: EinsatzAktionen;
  info: BaustellenInfo;
  /** Eingeteilt, aber ganztags weg: „Krank“ bzw. „abwesend“. */
  konflikt: string | null;
  zusatz: Termin[];
  /** Team-Woche: derselbe Block, aber kein Knopf. */
  lesen?: boolean;
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
  const titel = [b.name, p?.bezeichnung?.trim(), b.nummer, b.zeit, eingeteilt, info.material?.text].filter(Boolean).join(' · ');
  const alsHelfer = b.helfer && !alsHelferEingestuft(person) && !istLehrling(person);
  const inhalt = (
    <>
      <span className="e-titel">{b.name}</span>
      {konflikt ? (
        // Der Konflikt als Text mit Warnzeichen, nicht als Bernsteinkante (V10).
        <span className="e-zeile e-konflikt">
          <Icon name="warnung" size={12} />
          {konflikt === 'abwesend' ? 'fehlt' : `fehlt: ${konflikt}`}
        </span>
      ) : (
        <>
          {b.zeit ? <span className="e-zeit">{b.zeit}</span> : ort ? <span className="e-zeile">{ort}</span> : null}
          {alsHelfer && <span className="e-zeile">als Helfer</span>}
          <span className="e-nr">{b.nummer}</span>
          {/* Material mit Text, ohne Ampelfarbe (M04b): der Zustand steht im Wort. */}
          {info.material && <span className="e-zeile">{info.material.text}</span>}
          {zusatz.map((t) => (
            <span key={t.id} className="e-zusatz">
              {t.art} <span className="e-zeit">{terminZeitKurz(t)}</span>
            </span>
          ))}
        </>
      )}
    </>
  );
  if (lesen) {
    return (
      <span
        className={`${konflikt ? 'eintrag-konflikt' : 'eintrag'} nur-lesen`}
        title={konflikt ? `${titel} — eingeteilt, fehlt` : titel}
      >
        {inhalt}
      </span>
    );
  }
  const knopf = (zusatzProps: HTMLAttributes<HTMLElement> = {}) => (
    <button
      type="button"
      className={konflikt ? 'eintrag-konflikt' : 'eintrag'}
      title={konflikt ? `${titel} — eingeteilt, fehlt` : titel}
      // Mit Nummer: zwei Baustellen desselben Kunden am selben Tag hießen
      // für die Vorlesehilfe sonst gleich. Dazu Person und Zustand.
      aria-label={`${b.name} (${b.nummer}) am ${datum} bearbeiten – ${person.name}${
        konflikt ? `, eingeteilt, fehlt: ${konflikt}` : b.zeit ? `, ${b.zeit}` : ''
      }${info.material ? `, ${info.material.text}` : ''}`}
      onClick={() => onEinsatz({ datum: tag, projectNumber: b.nummer })}
      {...zusatzProps}
    >
      {inhalt}
    </button>
  );
  const a = aktionen?.einsatzVon(person.uid, tag, b.nummer);
  if (!aktionen || !a) return knopf();
  const nach = naechsterWerktag(tag);
  return (
    <div
      className="einsatz-halter"
      data-offen={aktionen.offen === a.id ? '' : undefined}
    >
      {knopf(aktionen.griff({ art: 'einsatz', id: a.id, tag, person: person.uid, nummer: b.nummer, titel: b.name }))}
      {/* Eckig mit Linie rundum, wie die Leiste im Chat (E77) — nur die Zeichen, ihr Name im `title`. */}
      <div role="toolbar" aria-label={`Einsatz ${b.name}, ${person.name}, ${datum}`} className="einsatz-leiste">
        <button type="button" className="einsatz-knopf" aria-label="Bearbeiten" title="Bearbeiten" onClick={() => onEinsatz({ datum: tag, projectNumber: b.nummer })}>
          <Icon name="pencil" size={18} />
        </button>
        <button type="button" className="einsatz-knopf" aria-label="Verschieben …" title="Verschieben …" onClick={() => aktionen.onVerschieben(a, b.name)}>
          <Icon name="verschieben" size={18} />
        </button>
        <button
          type="button"
          className="einsatz-knopf"
          aria-label={`Auf ${tagKurzText(nach)} kopieren`}
          title={`Auf ${tagKurzText(nach)} kopieren`}
          onClick={() => aktionen.onKopieren(a, b.name, nach)}
        >
          <Icon name="kopieren" size={18} />
        </button>
        <button type="button" className="einsatz-knopf" data-ton="gefahr" aria-label="Entfernen …" title="Entfernen …" onClick={() => aktionen.onEntfernen(a, b.name)}>
          <Icon name="papierkorb" size={18} />
        </button>
      </div>
    </div>
  );
}

/** „Mo 16.11.“ — für den Knopf „Auf … kopieren“. */
function tagKurzText(iso: string): string {
  const d = new Date(`${iso}T12:00:00`);
  return `${new Intl.DateTimeFormat('de-AT', { weekday: 'short' }).format(d).replace('.', '')} ${String(d.getDate()).padStart(2, '0')}.${String(d.getMonth() + 1).padStart(2, '0')}.`;
}

/** DER TERMIN-EINTRAG: helles Blatt mit feiner Linie, ohne Markierung; ein Klick öffnet „Termin ändern“. */
export function TerminEintrag({
  t,
  datum,
  wer,
  darf,
  lesen,
  onTermin,
}: {
  t: Termin;
  datum: string;
  /** Für die Vorlesehilfe: in wessen Zelle bzw. an welcher Baustelle. */
  wer: string;
  darf: boolean;
  /** Team-Woche: derselbe Eintrag, aber kein Knopf. */
  lesen?: boolean;
  onTermin: (t: Termin) => void;
}) {
  if (lesen) {
    return (
      <span className="eintrag-termin nur-lesen" title={`${artName(t.art)} · ${terminZeitKurz(t)} · ${terminOrtKurz(t)}`}>
        <span className="e-titel">{t.art}</span>
        <span className="e-zeit">{terminZeitKurz(t)}</span>
        <span className="e-zeile">{terminOrtKurz(t)}</span>
      </span>
    );
  }
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
      <span className="e-zeit">{terminZeitKurz(t)}</span>
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
  lesen,
  onEinsatz,
  onTermin,
  aktionen,
}: {
  person: AppUser;
  tag: string;
  datum: string;
  zelle: Zelle | undefined;
  aktionen?: EinsatzAktionen;
  /** Der Betrieb hat für diese Person zu. */
  zu: boolean;
  /** Alle Termine dieses Tages. */
  termine: Termin[];
  infoFuer: (nummer: string) => BaustellenInfo;
  darf: boolean;
  /** Team-Woche: dieselben Einträge, aber keine Knöpfe. */
  lesen?: boolean;
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
    // Der Betrieb hat zu — für alle derselbe schraffierte Block, nicht für Ausgenommene.
    teile.push(
      <span key="zu" className="eintrag-weg schraffur">
        Betriebsurlaub
      </span>,
    );
  } else if (zelle?.imUrlaub && baustellen.length === 0) {
    teile.push(
      <span key="weg" className="eintrag-weg schraffur">
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
        lesen={lesen}
        onEinsatz={onEinsatz}
        aktionen={lesen ? undefined : aktionen}
      />,
    );
  }
  for (const t of termine.filter((x) => x.teilnehmer.includes(person.uid))) {
    teile.push(
      <TerminEintrag key={t.id} t={t} datum={datum} wer={person.name} darf={darf} lesen={lesen} onTermin={onTermin} />,
    );
  }
  return <>{teile}</>;
}
