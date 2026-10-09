import type { AppUser, Termin } from '@/types';
import { Warnung } from '@/components/Badge';
import { terminZeit } from '@/features/termine/terminText';
import { tagKurz, type Brett, type Gruppe, type TagStand } from './planTypen';
import type { FensterStart } from './EinsatzFenster';
import { PersonEintraege, type BaustellenInfo } from './WochenEintraege';
import {
  feiertagAm,
  lieferungOhneAnnahme,
  ohneAnnahmeText,
  ruhetag,
  tagLang,
  termineText,
  terminOrtKurz,
  zelleLeer,
} from './wochenTermine';

/**
 * DIE WOCHE AM HANDY (Runde 4, Auftrag 4.7): oben die Tage Mo–So als
 * Leiste, darunter der gewählte Tag. Sieben Spalten auf 390 px wären ein
 * Guckloch; ein Tag nach dem anderen beantwortet dieselbe Frage.
 *
 * Unter dem Datum ein Punkt: Petrol, wenn Termine bestehen, Bernstein bei
 * einer Lieferung ohne Annahme. In der Liste zuerst die Termine, dann je
 * Einstufung die Personen mit denselben Blöcken wie im Raster; wer frei ist,
 * trägt „frei – Einsatz planen“. Die Einsätze je Baustelle und alle Freien
 * stehen im Seitenfenster „Tag“ („Ganzen Tag ansehen“).
 */
export default function HandyWoche({
  tage,
  heute,
  gewaehlt,
  onWahl,
  gruppen,
  brett,
  proTag,
  zuAm,
  zuFuer,
  einsaetze,
  termineAm,
  infoFuer,
  darf,
  onTag,
  onEinsatz,
  onTermin,
  onTerminNeu,
}: {
  tage: string[];
  heute: string;
  gewaehlt: string;
  onWahl: (tag: string) => void;
  gruppen: Gruppe[];
  brett: Brett;
  proTag: Map<string, TagStand>;
  zuAm: Map<string, string>;
  zuFuer: (uid: string, tag: string) => boolean;
  einsaetze: { date: string; projectNumber: string }[];
  termineAm: (tag: string) => Termin[];
  infoFuer: (tag: string, nummer: string) => BaustellenInfo;
  darf: boolean;
  onTag: (tag: string) => void;
  onEinsatz: (start: FensterStart) => void;
  onTermin: (t: Termin) => void;
  onTerminNeu: (tag: string) => void;
}) {
  const termine = termineAm(gewaehlt);
  const { datum } = tagKurz(gewaehlt);
  const feiertag = feiertagAm(gewaehlt);
  const zu = zuAm.get(gewaehlt);
  const frei = proTag.get(gewaehlt)?.frei.length ?? 0;
  // Wie im Tageskopf: „N frei“, am Betriebsurlaub mit den Ausgenommenen.
  const info = feiertag ?? (zu ? (frei > 0 ? `${zu} · ${frei} frei` : zu) : ruhetag(gewaehlt) ? 'Wochenende' : `${frei} frei`);

  return (
    <section aria-label="Wochenplan als Liste" className="handy-woche">
      <div className="tagwahl" role="group" aria-label="Tag wählen">
        {tage.map((tag) => {
          const { wochentag } = tagKurz(tag);
          const ts = termineAm(tag);
          const ohne = ts.filter((t) => lieferungOhneAnnahme(t, einsaetze)).length;
          const an = tag === gewaehlt;
          return (
            <button
              key={tag}
              type="button"
              className={an ? 'tagwahl-tag-an' : tag === heute ? 'tagwahl-tag-heute' : 'tagwahl-tag'}
              aria-pressed={an}
              aria-label={[tagLang(tag), ts.length ? termineText(ts.length) : null, ohne ? ohneAnnahmeText(ohne) : null]
                .filter(Boolean)
                .join(', ')}
              onClick={() => onWahl(tag)}
            >
              <span className="tagwahl-wt">{wochentag.replace('.', '')}</span>
              <span className="tagwahl-nr">{new Date(`${tag}T00:00:00`).getDate()}</span>
              <span className={ohne ? 'tagwahl-punkt-achtung' : ts.length ? 'tagwahl-punkt' : 'tagwahl-ohne'} aria-hidden="true" />
            </button>
          );
        })}
      </div>

      <div className="tl-kopf">
        <div>
          <p className="tl-tag">
            {tagLang(gewaehlt)}
            {gewaehlt === heute ? ' · heute' : ''}
          </p>
          <p className="tl-info">{info}</p>
        </div>
        <button type="button" className="wp-textknopf" onClick={() => onTag(gewaehlt)}>
          Ganzen Tag ansehen
        </button>
      </div>

      <div className="tl-gruppe">
        <span>{termine.length ? termineText(termine.length) : 'Keine Termine'}</span>
        {darf && (
          <button type="button" className="wp-textknopf" onClick={() => onTerminNeu(gewaehlt)}>
            Termin anlegen
          </button>
        )}
      </div>
      {termine.map((t) => (
        <button key={t.id} type="button" className="tl-termin" onClick={() => onTermin(t)}>
          <span className="tl-termin-text">
            <span className="tl-termin-titel">{[terminZeit(t), t.art].filter(Boolean).join(' ')}</span>
            <span className="tl-termin-ort">{terminOrtKurz(t)}</span>
          </span>
          {lieferungOhneAnnahme(t, einsaetze) && <Warnung>niemand dort</Warnung>}
        </button>
      ))}

      {gruppen.map((g) => (
        <div key={g.name}>
          <p className="tl-gruppe">
            {g.name} · {g.leute.length}
          </p>
          {g.leute.map((u) => (
            <TagesPerson
              key={u.uid}
              u={u}
              tag={gewaehlt}
              datum={datum}
              brett={brett}
              zu={zuFuer(u.uid, gewaehlt)}
              frei={!!proTag.get(gewaehlt)?.freiIds.includes(u.uid)}
              termine={termine}
              infoFuer={infoFuer}
              darf={darf}
              onEinsatz={onEinsatz}
              onTermin={onTermin}
            />
          ))}
        </div>
      ))}
    </section>
  );
}

function TagesPerson({
  u,
  tag,
  datum,
  brett,
  zu,
  frei,
  termine,
  infoFuer,
  darf,
  onEinsatz,
  onTermin,
}: {
  u: AppUser;
  tag: string;
  datum: string;
  brett: Brett;
  zu: boolean;
  /** Frei wie im Kopf gezählt (`proTag`). */
  frei: boolean;
  termine: Termin[];
  infoFuer: (tag: string, nummer: string) => BaustellenInfo;
  darf: boolean;
  onEinsatz: (start: FensterStart) => void;
  onTermin: (t: Termin) => void;
}) {
  const z = brett.get(u.uid)?.get(tag);
  return (
    <div className="tl-person">
      <p className="tl-name">{u.name}</p>
      <div className="tl-eintraege">
        {!zelleLeer(z, zu, termine, u.uid) && (
          <PersonEintraege
            person={u}
            tag={tag}
            datum={datum}
            zelle={z}
            zu={zu}
            termine={termine}
            infoFuer={(nr) => infoFuer(tag, nr)}
            darf={darf}
            onEinsatz={onEinsatz}
            onTermin={onTermin}
          />
        )}
        {/*
          WER FREI IST, wird hier gleich eingeteilt — auch mit einem Termin
          oder stundenweise weg: „frei“ heißt dasselbe wie im Kopf („N frei“).
        */}
        {frei && (
          <button
            type="button"
            className="tl-frei"
            aria-label={`${u.name} am ${datum} einteilen`}
            onClick={() => onEinsatz({ datum: tag, person: u.uid })}
          >
            frei – Einsatz planen
          </button>
        )}
      </div>
    </div>
  );
}
