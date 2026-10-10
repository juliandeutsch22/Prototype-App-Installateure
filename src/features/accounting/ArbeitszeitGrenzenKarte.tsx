import { useState } from 'react';
import Card from '@/components/Card';
import Button from '@/components/Button';
import { InputField } from '@/components/Field';
import { ErrorState } from '@/components/States';
import { useToast } from '@/components/Toast';
import { removeBegruendung, setBegruendung, type Begruendung } from '@/lib/db/arbeitszeitGrenzen';
import { datumAT } from '@/lib/datum';
import type { WithId } from '@/lib/db/core';
import type { AppUser, TimeEntry } from '@/types';
import { fallSchluessel, grenzText, kalenderwoche, type Grenzfall } from './arbeitszeitGrenzen';
import { grenzZusatz, useArbeitszeitGrenzen, type GrenzDaten } from './useArbeitszeitGrenzen';
import { istTagesfall } from './tagesauswertung';

const MONATE = ['Jänner', 'Februar', 'März', 'April', 'Mai', 'Juni', 'Juli', 'August',
  'September', 'Oktober', 'November', 'Dezember'];

function plusTage(iso: string, n: number): string {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

const kurz = (iso: string) => `${iso.slice(8, 10)}.${iso.slice(5, 7)}.`;

/** Die Überschrift der Karte: Zahl der Verstöße und der Fälle ohne Begründung. */
function grenzTitel(z: GrenzDaten['zaehlung']): string {
  const zusatz = grenzZusatz(z);
  return zusatz ? `Arbeitszeitgrenzen · ${zusatz}` : 'Arbeitszeitgrenzen';
}

interface KarteProps {
  companyId: string;
  personen: AppUser[];
  jahr: number;
  /** 0-basiert, wie in der Mitarbeiterübersicht. */
  monat: number;
  /** Ein Schlüssel für den Stand der Buchungen — ändert er sich, wird neu geprüft. Leer: noch nicht geladen. */
  aktualisiert?: string;
  /** Öffnet eine Buchung zum Korrigieren (bei Verstößen gegen das KJBG). */
  onKorrigieren?: (eintrag: WithId<TimeEntry>) => void;
  /**
   * Die Prüfung, wenn die Seite sie schon hält (Runde 4: Streifen
   * und Seitenfenster lesen dieselben Fälle). Ohne lädt die Karte selbst —
   * so wie bis Runde 4, und so prüfen sie ihre Tests.
   */
  daten?: GrenzDaten;
  /** Sprungziel in der Seite (`#arbeitszeitgrenzen`). */
  id?: string;
}

/**
 * Wo im Monat gebuchte Zeiten eine gesetzliche Grenze überschreiten — mit
 * Begründung je Fall (Stand-Datei 11.1, Punkt 4).
 *
 * EINE ZEILE, WENN NICHTS IST. Die Karte steht in jedem Monat da, damit man
 * weiss, dass geprüft wurde; ohne Fall ist sie ein Satz und keine Liste.
 *
 * DIE LADELOGIK steht seit Runde 4 in `useArbeitszeitGrenzen` — die Seite
 * hält die Fälle einmal und reicht sie hierher und ins Seitenfenster.
 *
 * JUGENDSCHUTZ IST KEIN „BEGRÜNDET“ (Runde 3, M3, vorbehaltlich der
 * WKO-Klärung). Beim AZG sind Notdienst und Gefahr in Verzug zulässige,
 * zu begründende Ausnahmen. Die Grenzen des KJBG sind weitgehend zwingend;
 * ein „begründeter“ Fall wirkte wie erlaubt. Dort steht deshalb „Verstoß —
 * Buchung korrigieren“ mit dem Weg zur Buchung, und eine Notiz ist möglich,
 * nimmt den Fall aber nicht aus der Zählung.
 */
export default function ArbeitszeitGrenzenKarte(props: KarteProps) {
  return props.daten ? <KarteInhalt {...props} daten={props.daten} /> : <KarteMitLaden {...props} />;
}

function KarteMitLaden(props: KarteProps) {
  const daten = useArbeitszeitGrenzen(props);
  return <KarteInhalt {...props} daten={daten} />;
}

function KarteInhalt({
  companyId,
  jahr,
  monat,
  onKorrigieren,
  daten,
  id,
}: KarteProps & { daten: GrenzDaten }) {
  const { stand, fehler, laden, zaehlung } = daten;
  return (
    <Card
      id={id}
      title={grenzTitel(zaehlung)}
      buendig={!!stand && stand.faelle.length > 0 && !fehler}
      hint={
        <>
          Geprüft wird, was bis heute gebucht ist: höchstens 12 Std. am Tag und 60 in der Woche (§ 9 AZG),
          11 Std. Ruhezeit (§ 12 AZG), 36 Std. Ruhe je Kalenderwoche (§§ 3, 4 ARG). Für Jugendliche unter
          18 — dafür braucht es das Geburtsdatum in der Benutzerakte — 8 Std. am Tag und 40 in der Woche
          samt Berufsschule, 12 Std. Ruhezeit, keine Arbeit zwischen 20 und 6 Uhr und zwei freie Tage am
          Stück mit dem Sonntag (KJBG). Notdienst und Gefahr in Verzug sind beim AZG zulässig, aber zu
          begründen. Die Grenzen für Jugendliche sind zwingend: dort steht „Verstoß“, die Buchung ist zu
          korrigieren, eine Notiz ist möglich. Vorbehaltlich der Klärung mit der WKO: ein Berufsschultag
          zählt mit der beim Eintragen angegebenen Unterrichtszeit, sonst mit dem Tagessoll; ist die
          Wochenarbeitszeit anders verteilt (eigenes Tagessoll mit kürzeren Tagen, höchstens 40 Std.),
          gelten am Tag 9 Std. (§ 11 Abs 2 KJBG). Ruhepause: ab mehr als 6 Std. Arbeit mindestens
          30 Min. (§ 11 AZG), bei Jugendlichen ab 4,5 Std. (§ 15 KJBG) — als Pause zählt die
          eingetragene und jede Lücke von mindestens 10 Min. zwischen zwei Buchungen; geprüft wird ein
          Tag erst, wenn er vorbei ist. Im Schnitt von 17 Wochen höchstens 48 Std. je Woche (§ 9 Abs 4
          AZG); Urlaub und Krankenstand zählen dabei neutral. Nicht geprüft: Durchrechnung und
          Gleitzeit, Ausnahmen aus dem Kollektivvertrag (etwa ein längerer Zeitraum als 17 Wochen).
        </>
      }
    >
      {fehler ? (
        <ErrorState message={fehler} onRetry={() => void laden()} />
      ) : !stand ? (
        <p className="text-sm text-ink-muted">Wird geprüft …</p>
      ) : stand.faelle.length === 0 ? (
        <p className="text-sm text-ink-muted">Im {MONATE[monat]} {jahr} wurde keine Grenze überschritten.</p>
      ) : (
        <GrenzListe companyId={companyId} daten={daten} onKorrigieren={onKorrigieren} />
      )}
    </Card>
  );
}

/**
 * DIE FÄLLE ALS ARBEITSLISTE (Runde 4, Auftrag 3.2 Punkt 5): eine Zeile je
 * Fall, rechts der Knopf für den nächsten Schritt („Begründen“ bzw. beim
 * Jugendschutz „Verstoß — Buchung korrigieren“), die übrigen Handgriffe
 * (Notiz, Ändern, Entfernen) in der Zeile. Inhalt und Knöpfe wie bisher.
 *
 * Dieselbe Liste steht im Seitenfenster der Person (`nurPerson`) — mit
 * denselben Knöpfen; gespeichert wird über dieselbe Prüfung (`daten.laden`),
 * damit Karte und Fenster nicht auseinanderlaufen.
 */
export function GrenzListe({
  companyId,
  daten,
  onKorrigieren,
  nurPerson,
}: {
  companyId: string;
  daten: GrenzDaten;
  onKorrigieren?: (eintrag: WithId<TimeEntry>) => void;
  /** Nur die Fälle dieser Person — und ohne ihren Namen in jeder Zeile. */
  nurPerson?: string;
}) {
  const toast = useToast();
  const { stand, laden } = daten;
  const [bearbeitet, setBearbeitet] = useState<string | null>(null);
  const [text, setText] = useState('');
  const [laeuft, setLaeuft] = useState(false);
  const vorsilbe = nurPerson ? 'fenster' : 'karte';

  if (!stand) return null;
  const faelle = nurPerson ? stand.faelle.filter(({ person }) => person.uid === nurPerson) : stand.faelle;
  if (faelle.length === 0) return null;

  async function speichern(person: AppUser, fall: Grenzfall) {
    if (!text.trim()) return;
    setLaeuft(true);
    try {
      await setBegruendung(companyId, { userId: person.uid, art: fall.art, bezug: fall.bezug, text: text.trim() });
      setBearbeitet(null);
      setText('');
      await laden();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : String(e));
    } finally {
      setLaeuft(false);
    }
  }

  async function entfernen(b: Begruendung) {
    setLaeuft(true);
    try {
      await removeBegruendung(companyId, b.id);
      await laden();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : String(e));
    } finally {
      setLaeuft(false);
    }
  }

  /**
   * Welche Buchungen an einem Fall hängen und sich korrigieren lassen: am Tag
   * selbst (auch bei der Pause), bei der Ruhezeit auch am Vortag. Woche,
   * Durchschnitt und Wochenfreizeit hängen an mehreren Tagen — dort führt
   * der Tagesnachweis hin.
   */
  function korrigierbar(person: AppUser, fall: Grenzfall): WithId<TimeEntry>[] {
    if (!stand || !istTagesfall(fall)) return [];
    const tage = fall.art === 'ruhezeit' ? [plusTage(fall.bezug, -1), fall.bezug] : [fall.bezug];
    return stand.eintraege
      .filter((e) => e.userId === person.uid && tage.includes(e.date) && e.status === 'Anwesend' && !e.isBilled)
      .sort((a, b) => a.date.localeCompare(b.date) || (a.startTime ?? '').localeCompare(b.startTime ?? ''));
  }

  /** Das Eingabefeld für Begründung (AZG) oder Notiz (KJBG). */
  const eingabe = (schluessel: string, person: AppUser, fall: Grenzfall) => (
    <div className="flex flex-col gap-2">
      <InputField
        id={`begruendung-${vorsilbe}-${schluessel}`}
        label={fall.jugendlich ? 'Notiz (optional)' : 'Begründung'}
        placeholder={fall.jugendlich ? 'z. B. mit dem Lehrling besprochen' : 'z. B. Notdienst, Rohrbruch'}
        maxLength={500}
        value={text}
        onChange={(e) => setText(e.target.value)}
      />
      <span className="flex flex-wrap gap-2">
        <Button
          variant="secondary"
          disabled={!text.trim() || laeuft}
          onClick={() => void speichern(person, fall)}
        >
          {fall.jugendlich ? 'Notiz speichern' : 'Begründung speichern'}
        </Button>
        <Button variant="ghost" onClick={() => setBearbeitet(null)}>Abbrechen</Button>
      </span>
    </div>
  );

  /** Was gespeichert ist — Begründung oder Notiz — mit Ändern und Entfernen. */
  const vermerk = (schluessel: string, b: Begruendung, wort: string) => (
    <span className="flex flex-wrap items-center gap-x-3 text-ink-muted">
      <span>
        {wort}: <span className="text-ink">{b.text}</span>
        {b.vonName ? ` · ${b.vonName}, ${datumAT(b.am.slice(0, 10))}` : ''}
      </span>
      <button
        type="button"
        className="link"
        onClick={() => { setBearbeitet(schluessel); setText(b.text); }}
      >
        Ändern
      </button>
      <button
        type="button"
        className="link"
        disabled={laeuft}
        onClick={() => void entfernen(b)}
      >
        Entfernen
      </button>
    </span>
  );

  /** Jugendschutz: Verstoß und der Weg zur Buchung — der nächste Schritt. */
  const verstoss = (person: AppUser, fall: Grenzfall) => {
    const buchungen = onKorrigieren ? korrigierbar(person, fall) : [];
    const mitTag = buchungen.some((e) => e.date !== buchungen[0].date);
    return (
      <span className="grenz-verstoss-zeile">
        <span className="grenz-verstoss">Verstoß —</span>
        {buchungen.length === 0 ? (
          <span className="text-ink-muted">
            {fall.art === 'woche' || fall.art === 'wochenfrei'
              ? `Buchungen der KW ${kalenderwoche(fall.bezug)} im Tagesnachweis korrigieren`
              : 'Buchung im Tagesnachweis korrigieren'}
          </span>
        ) : buchungen.length === 1 ? (
          <button type="button" className="grenz-schritt" onClick={() => onKorrigieren?.(buchungen[0])}>
            Buchung korrigieren
          </button>
        ) : (
          buchungen.map((e) => (
            <button key={e.id} type="button" className="grenz-schritt" onClick={() => onKorrigieren?.(e)}>
              {`Buchung ${mitTag ? `${kurz(e.date)} ` : ''}${e.startTime ?? ''}–${e.endTime ?? ''} korrigieren`}
            </button>
          ))
        )}
      </span>
    );
  };

  return (
    <ul className={nurPerson ? 'divide-y divide-line border-y border-line' : 'divide-y divide-line'}>
      {faelle.map(({ person, fall }) => {
        const schluessel = fallSchluessel(person.uid, fall);
        const b = stand.begruendungen.get(schluessel);
        const { titel: was, gesetz } = grenzText(fall);
        const offen = bearbeitet === schluessel;
        return (
          <li key={schluessel} className="grenz-fall">
            <div className="grenz-inhalt">
              {nurPerson ? (
                fall.jugendlich && <span className="grenz-person">unter 18</span>
              ) : (
                <span className="grenz-person">
                  {person.name}{fall.jugendlich ? ' · unter 18' : ''}
                </span>
              )}
              <span className="text-ink">
                {was} <span className="text-ink-muted">({gesetz})</span>
              </span>
              {fall.jugendlich ? (
                offen ? (
                  eingabe(schluessel, person, fall)
                ) : b ? (
                  vermerk(schluessel, b, 'Notiz')
                ) : (
                  <span>
                    <button
                      type="button"
                      className="link"
                      onClick={() => { setBearbeitet(schluessel); setText(''); }}
                    >
                      Notiz hinzufügen
                    </button>
                  </span>
                )
              ) : offen ? (
                eingabe(schluessel, person, fall)
              ) : (
                b && vermerk(schluessel, b, 'Begründung')
              )}
            </div>
            {fall.jugendlich ? (
              <div className="grenz-rechts">{verstoss(person, fall)}</div>
            ) : (
              !offen && !b && (
                <div className="grenz-rechts">
                  <button
                    type="button"
                    className="grenz-schritt"
                    onClick={() => { setBearbeitet(schluessel); setText(''); }}
                  >
                    Begründen
                  </button>
                </div>
              )
            )}
          </li>
        );
      })}
    </ul>
  );
}
