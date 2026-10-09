import type { AppUser, Project, Termin } from '@/types';
import BottomSheet from '@/components/BottomSheet';
import Button from '@/components/Button';
import { Warnung } from '@/components/Badge';
import { List, ListRow } from '@/components/ListRow';
import { bezugText, terminKopf } from '@/features/termine/terminText';
import { kalenderwoche } from './planungKopf';
import { stufeImEinsatz } from './stufeImEinsatz';
import type { Brett, TagStand } from './planTypen';
import type { FensterStart } from './EinsatzFenster';
import { feiertagAm, lieferungOhneAnnahme, ruhetag } from './wochenTermine';

/**
 * DAS SEITENFENSTER „TAG“ (Runde 4, Auftrag 4.3; Entscheidung R4-0, Frage 1):
 * der ganze Tag, ohne die Woche zu verlassen. Termine mit „Termin anlegen“,
 * die Einsätze je Baustelle mit „Bearbeiten“, wer frei ist mit „Einsatz
 * planen“, wer abwesend ist mit der Art.
 *
 * VORHER SPRANG DER TAGESKOPF NACH „TAG PLANEN“. Das steht jetzt unten als
 * „In ‚Tag‘ öffnen“ — mit dem Tag und, wenn das Fenster aus einem Einsatz
 * kam, der Baustelle, wie vorher „Ganzen Tag in ‚Tag planen‘ öffnen“.
 *
 * Gerechnet wird nichts Neues: die Einsätze und die Freien kommen aus
 * `proTag` (dieselbe Rechnung wie Raster und Kopf), die Termine aus der
 * Abfrage der Woche.
 */
export default function TagFenster({
  datum,
  stand,
  termine,
  einsaetze,
  projects,
  users,
  staff,
  brett,
  zu,
  darf,
  onClose,
  onTermin,
  onTerminNeu,
  onEinsatz,
  onInTag,
}: {
  datum: string;
  stand: TagStand | undefined;
  /** Alle Termine dieses Tages. */
  termine: Termin[];
  einsaetze: { date: string; projectNumber: string }[];
  projects: Project[];
  users: AppUser[];
  staff: AppUser[];
  brett: Brett;
  /** Betriebsurlaub an diesem Tag (Bezeichnung). */
  zu: string | undefined;
  darf: boolean;
  onClose: () => void;
  onTermin: (t: Termin) => void;
  onTerminNeu: (datum: string) => void;
  onEinsatz: (start: FensterStart) => void;
  /** „In ‚Tag‘ öffnen“: nach „Tag planen“ mit diesem Tag. */
  onInTag: () => void;
}) {
  const d = new Date(`${datum}T00:00:00`);
  // „Mittwoch, 07.10.“ — groß der Tag, darüber klein die Kalenderwoche.
  const titel = `${d.toLocaleDateString('de-AT', { weekday: 'long' })}, ${d.toLocaleDateString('de-AT', { day: '2-digit', month: '2-digit' })}`;
  const kurz = `${d.toLocaleDateString('de-AT', { weekday: 'short' }).replace('.', '')} ${d.toLocaleDateString('de-AT', { day: '2-digit', month: '2-digit' })}`;
  const feiertag = feiertagAm(datum);
  const ueber = [`KW ${kalenderwoche(datum)}`, feiertag, zu].filter(Boolean).join(' · ');
  const name = (uid: string) => users.find((u) => u.uid === uid)?.name;
  const baustellen = stand?.baustellen ?? [];
  const frei = (stand?.freiIds ?? []).map((uid) => staff.find((u) => u.uid === uid)).filter((u): u is AppUser => !!u);
  const weg = staff
    .map((u) => ({ u, text: brett.get(u.uid)?.get(datum)?.abwesendText }))
    .filter((x): x is { u: AppUser; text: string } => !!x.text);

  return (
    <BottomSheet open onClose={onClose} label={titel} auchBreit titel={titel}>
      <p className="fenster-ueber">{ueber}</p>

      <section aria-label={`Termine am ${kurz}`} className="tag-abschnitt">
        <div className="tag-abschnitt-kopf">
          <h3 className="planung-abschnitt">Termine am {kurz}</h3>
          {/* Anlegen nur, wer Termine schreiben darf — wie in der Terminkarte. */}
          {darf && (
            <Button variant="ghost" groesse="klein" onClick={() => onTerminNeu(datum)}>
              Termin anlegen
            </Button>
          )}
        </div>
        {termine.length === 0 ? (
          <p className="tag-leer">Keine Termine an diesem Tag.</p>
        ) : (
          <List>
            {termine.map((t) => {
              const teilnehmer = t.teilnehmer.map(name).filter(Boolean);
              return (
                <ListRow
                  key={t.id}
                  title={terminKopf(t)}
                  subtitle={[bezugText(t), teilnehmer.length ? `Teilnehmer: ${teilnehmer.join(', ')}` : null].filter(Boolean).join(' · ')}
                  zustand={lieferungOhneAnnahme(t, einsaetze) ? <Warnung>niemand dort</Warnung> : undefined}
                  onOeffnen={() => onTermin(t)}
                />
              );
            })}
          </List>
        )}
      </section>

      <section aria-label="Einsätze" className="tag-abschnitt">
        <div className="tag-abschnitt-kopf">
          <h3 className="planung-abschnitt">Einsätze</h3>
          <span className="gruppe-anzahl">
            {baustellen.length === 1 ? '1 Baustelle' : `${baustellen.length} Baustellen`}
          </span>
        </div>
        {baustellen.length === 0 ? (
          <p className="tag-leer">Noch kein Einsatz an diesem Tag.</p>
        ) : (
          <List>
            {baustellen.map((b) => {
              const p = projects.find((x) => x.projectNumber === b.nummer);
              const amSelbenTag = termine.filter((t) => t.projectNumber === b.nummer).map(terminKopf);
              return (
                <ListRow
                  key={b.nummer}
                  title={[b.name, p?.bezeichnung?.trim()].filter(Boolean).join(' · ')}
                  subtitle={
                    <>
                      <span className="block">
                        {[b.nummer, b.zeit ?? 'ganztags', b.namen.map((n) => (b.helfer.includes(n) ? `${n} (Helfer)` : n)).join(', ')]
                          .filter(Boolean)
                          .join(' · ')}
                      </span>
                      {amSelbenTag.length > 0 && <span className="block">Am selben Tag: {amSelbenTag.join('; ')}</span>}
                      {/* M33: wer eingeteilt ist und fehlt — Bernstein, kein Fehler. */}
                      {b.fehlen.length > 0 && (
                        <span className="tag-fehlt">
                          {b.namen.length === 0 ? 'Unbesetzt — ' : ''}fehlt: {b.fehlen.join(', ')}
                        </span>
                      )}
                    </>
                  }
                >
                  <Button
                    variant="secondary"
                    groesse="klein"
                    aria-label={`${b.name} (${b.nummer}) bearbeiten`}
                    onClick={() => onEinsatz({ datum, projectNumber: b.nummer })}
                  >
                    Bearbeiten
                  </Button>
                </ListRow>
              );
            })}
          </List>
        )}
      </section>

      <section aria-label="Frei" className="tag-abschnitt">
        <div className="tag-abschnitt-kopf">
          {/* Am Wochenende und Feiertag ist niemand „frei“, sondern ohne Einsatz. */}
          <h3 className="planung-abschnitt">{ruhetag(datum) ? 'Ohne Einsatz' : 'Frei'}</h3>
          <span className="gruppe-anzahl">{frei.length}</span>
        </div>
        {frei.length === 0 ? (
          <p className="tag-leer">{zu && !ruhetag(datum) ? `${zu} — niemand im Dienst.` : 'Niemand frei.'}</p>
        ) : (
          <List>
            {frei.map((u) => (
              <ListRow key={u.uid} title={u.name} subtitle={u.role === 'Projektleiter' ? 'Projektleitung' : stufeImEinsatz(false, u)}>
                <Button
                  variant="ghost"
                  groesse="klein"
                  aria-label={`${u.name} am ${kurz} einteilen`}
                  onClick={() => onEinsatz({ datum, person: u.uid })}
                >
                  Einsatz planen
                </Button>
              </ListRow>
            ))}
          </List>
        )}
        {weg.length > 0 && (
          <List>
            {weg.map(({ u, text }) => (
              <ListRow key={u.uid} title={u.name} subtitle={text === 'abwesend' ? 'abwesend' : `abwesend: ${text}`} />
            ))}
          </List>
        )}
      </section>

      <div className="planung-fuss">
        <div className="planung-fuss-knoepfe">
          <Button variant="secondary" onClick={onInTag}>
            In „Tag“ öffnen
          </Button>
          <Button onClick={() => onEinsatz({ datum })}>Einsatz planen</Button>
        </div>
      </div>
    </BottomSheet>
  );
}
