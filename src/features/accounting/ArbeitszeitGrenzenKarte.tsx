import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Card from '@/components/Card';
import Button from '@/components/Button';
import { InputField } from '@/components/Field';
import { ErrorState } from '@/components/States';
import { useToast } from '@/components/Toast';
import { listEntriesInRange } from '@/lib/db/timeEntries';
import {
  listBegruendungen, listGeburtsdaten, removeBegruendung, setBegruendung, type Begruendung,
} from '@/lib/db/arbeitszeitGrenzen';
import { tagessollStunden, todayStr } from '@/lib/time';
import { datumAT } from '@/lib/datum';
import type { WithId } from '@/lib/db/core';
import type { AppUser, TimeEntry } from '@/types';
import {
  andereVerteilung, fallSchluessel, grenzfaelle, grenzText, kalenderwoche, montagVon, type Grenzfall,
} from './arbeitszeitGrenzen';

const MONATE = ['Jänner', 'Februar', 'März', 'April', 'Mai', 'Juni', 'Juli', 'August',
  'September', 'Oktober', 'November', 'Dezember'];

function plusTage(iso: string, n: number): string {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

const kurz = (iso: string) => `${iso.slice(8, 10)}.${iso.slice(5, 7)}.`;

/**
 * Wo im Monat gebuchte Zeiten eine gesetzliche Grenze überschreiten — mit
 * Begründung je Fall (Stand-Datei 11.1, Punkt 4).
 *
 * EINE ZEILE, WENN NICHTS IST. Die Karte steht in jedem Monat da, damit man
 * weiss, dass geprüft wurde; ohne Fall ist sie ein Satz und keine Liste.
 *
 * EIGENE ABFRAGE STATT DER GELADENEN JAHRESZEITEN: die Woche am Monatsrand,
 * die Ruhezeit am Ersten und der Montag nach dem letzten Sonntag liegen
 * ausserhalb des Monats — und um den Jahreswechsel ausserhalb des Jahres.
 *
 * NACH EINER BUCHUNG NEU GEPRÜFT (Runde 3, G12): `aktualisiert` ist der
 * Stand der Buchungen, den die Seite ohnehin live hält. Ändert er sich, prüft
 * die Karte still neu — ohne „Wird geprüft …“ dazwischen. Vorher stand nach
 * dem Buchen bis zum Neuladen „keine Grenze überschritten“.
 *
 * JUGENDSCHUTZ IST KEIN „BEGRÜNDET“ (Runde 3, M3, vorbehaltlich der
 * WKO-Klärung). Beim AZG sind Notdienst und Gefahr in Verzug zulässige,
 * zu begründende Ausnahmen. Die Grenzen des KJBG sind weitgehend zwingend;
 * ein „begründeter“ Fall wirkte wie erlaubt. Dort steht deshalb „Verstoß —
 * Buchung korrigieren“ mit dem Weg zur Buchung, und eine Notiz ist möglich,
 * nimmt den Fall aber nicht aus der Zählung.
 */
export default function ArbeitszeitGrenzenKarte({
  companyId,
  personen,
  jahr,
  monat,
  aktualisiert,
  onKorrigieren,
}: {
  companyId: string;
  personen: AppUser[];
  jahr: number;
  /** 0-basiert, wie in der Mitarbeiterübersicht. */
  monat: number;
  /** Ein Schlüssel für den Stand der Buchungen — ändert er sich, wird neu geprüft. Leer: noch nicht geladen. */
  aktualisiert?: string;
  /** Öffnet eine Buchung zum Korrigieren (bei Verstößen gegen das KJBG). */
  onKorrigieren?: (eintrag: WithId<TimeEntry>) => void;
}) {
  const toast = useToast();
  const von = `${jahr}-${String(monat + 1).padStart(2, '0')}-01`;
  const bis = new Date(Date.UTC(jahr, monat + 1, 0)).toISOString().slice(0, 10);

  const [stand, setStand] = useState<{
    faelle: Array<{ person: AppUser; fall: Grenzfall }>;
    begruendungen: Map<string, Begruendung>;
    eintraege: WithId<TimeEntry>[];
  } | null>(null);
  const [fehler, setFehler] = useState<string | null>(null);
  const [bearbeitet, setBearbeitet] = useState<string | null>(null);
  const [text, setText] = useState('');
  const [laeuft, setLaeuft] = useState(false);
  // Eine ältere Antwort darf eine neuere nicht überschreiben (Monat schnell gewechselt).
  const lauf = useRef(0);

  const laden = useCallback(async () => {
    const meiner = ++lauf.current;
    setFehler(null);
    try {
      const [eintraege, geburtsdaten, begruendungen] = await Promise.all([
        listEntriesInRange(companyId, plusTage(von, -7), plusTage(bis, 7)),
        listGeburtsdaten(companyId),
        listBegruendungen(companyId, montagVon(von), bis),
      ]);
      // Was nach heute liegt, ist noch nicht gearbeitet (Runde 3, M1).
      const heute = todayStr();
      const faelle = personen.flatMap((person) =>
        grenzfaelle(
          eintraege.filter((e) => e.userId === person.uid),
          { von, bis },
          {
            geburtsdatum: geburtsdaten.get(person.uid) ?? null,
            schultagMin: (tag) => tagessollStunden(person, tag) * 60,
            andereVerteilung: andereVerteilung(person),
          },
          { stichtag: heute },
        ).map((fall) => ({ person, fall })),
      );
      if (meiner !== lauf.current) return;
      setStand({
        faelle,
        begruendungen: new Map(begruendungen.map((b) => [fallSchluessel(b.userId, b), b])),
        eintraege,
      });
    } catch (e) {
      if (meiner !== lauf.current) return;
      setFehler(e instanceof Error ? e.message : String(e));
    }
  }, [companyId, personen, von, bis]);

  /*
    EIN EFFEKT FÜR BEIDE ANLÄSSE. Ein neuer Monat (oder Betrieb, oder eine
    andere Belegschaft) zeigt „Wird geprüft …“; ein neuer Stand der Buchungen
    prüft still nach. Der erste Stand nach dem Laden der Seite ist keine
    Änderung — sonst prüfte die Karte beim Öffnen zweimal.
  */
  const vorher = useRef<{ laden: typeof laden; aktualisiert: string | undefined } | null>(null);
  useEffect(() => {
    const v = vorher.current;
    vorher.current = { laden, aktualisiert };
    if (v && v.laden === laden) {
      if (v.aktualisiert === undefined || v.aktualisiert === aktualisiert) return;
    } else {
      setStand(null);
    }
    void laden();
  }, [laden, aktualisiert]);

  const zaehlung = useMemo(() => {
    if (!stand) return { kjbg: 0, azg: 0, offen: 0 };
    const kjbg = stand.faelle.filter(({ fall }) => fall.jugendlich).length;
    const offen = stand.faelle.filter(
      ({ person, fall }) => !fall.jugendlich && !stand.begruendungen.has(fallSchluessel(person.uid, fall)),
    ).length;
    return { kjbg, azg: stand.faelle.length - kjbg, offen };
  }, [stand]);

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
   * selbst, bei der Ruhezeit auch am Vortag. Woche und Wochenfreizeit hängen
   * an mehreren Tagen — dort führt der Tagesnachweis hin.
   */
  function korrigierbar(person: AppUser, fall: Grenzfall): WithId<TimeEntry>[] {
    if (!stand || (fall.art !== 'tag' && fall.art !== 'nacht' && fall.art !== 'ruhezeit')) return [];
    const tage = fall.art === 'ruhezeit' ? [plusTage(fall.bezug, -1), fall.bezug] : [fall.bezug];
    return stand.eintraege
      .filter((e) => e.userId === person.uid && tage.includes(e.date) && e.status === 'Anwesend' && !e.isBilled)
      .sort((a, b) => a.date.localeCompare(b.date) || (a.startTime ?? '').localeCompare(b.startTime ?? ''));
  }

  const teile = [
    zaehlung.kjbg > 0 && (zaehlung.kjbg === 1 ? '1 Verstoß Jugendschutz' : `${zaehlung.kjbg} Verstöße Jugendschutz`),
    zaehlung.azg > 0 && (zaehlung.offen > 0 ? `${zaehlung.offen} ohne Begründung` : 'alle begründet'),
  ].filter(Boolean);
  const titel = teile.length > 0 ? `Arbeitszeitgrenzen · ${teile.join(' · ')}` : 'Arbeitszeitgrenzen';

  /** Das Eingabefeld für Begründung (AZG) oder Notiz (KJBG). */
  const eingabe = (schluessel: string, person: AppUser, fall: Grenzfall) => (
    <div className="flex flex-col gap-2">
      <InputField
        id={`begruendung-${schluessel}`}
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

  /** Jugendschutz: Verstoß, der Weg zur Buchung, eine Notiz. */
  const verstoss = (person: AppUser, fall: Grenzfall) => {
    const buchungen = onKorrigieren ? korrigierbar(person, fall) : [];
    const mitTag = buchungen.some((e) => e.date !== buchungen[0].date);
    return (
      <span className="flex flex-wrap items-center gap-x-3">
        <span className="font-normal text-ink">Verstoß —</span>
        {buchungen.length === 0 ? (
          <span className="text-ink-muted">
            {fall.art === 'woche' || fall.art === 'wochenfrei'
              ? `Buchungen der KW ${kalenderwoche(fall.bezug)} im Tagesnachweis korrigieren`
              : 'Buchung im Tagesnachweis korrigieren'}
          </span>
        ) : buchungen.length === 1 ? (
          <button type="button" className="link" onClick={() => onKorrigieren?.(buchungen[0])}>
            Buchung korrigieren
          </button>
        ) : (
          buchungen.map((e) => (
            <button key={e.id} type="button" className="link" onClick={() => onKorrigieren?.(e)}>
              {`Buchung ${mitTag ? `${kurz(e.date)} ` : ''}${e.startTime ?? ''}–${e.endTime ?? ''} korrigieren`}
            </button>
          ))
        )}
      </span>
    );
  };

  return (
    <Card
      title={titel}
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
          gelten am Tag 9 Std. (§ 11 Abs 2 KJBG). Nicht geprüft: Ruhepausen, Durchrechnung und
          Gleitzeit, Ausnahmen aus dem Kollektivvertrag.
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
        <ul className="divide-y divide-line">
          {stand.faelle.map(({ person, fall }) => {
            const schluessel = fallSchluessel(person.uid, fall);
            const b = stand.begruendungen.get(schluessel);
            const { titel: was, gesetz } = grenzText(fall);
            return (
              <li key={schluessel} className="flex flex-col gap-1 py-2 text-sm">
                <span className="font-normal text-ink-deep">
                  {person.name}{fall.jugendlich ? ' · unter 18' : ''}
                </span>
                <span className="text-ink">
                  {was} <span className="text-ink-muted">({gesetz})</span>
                </span>
                {fall.jugendlich ? (
                  <>
                    {verstoss(person, fall)}
                    {bearbeitet === schluessel ? (
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
                    )}
                  </>
                ) : bearbeitet === schluessel ? (
                  eingabe(schluessel, person, fall)
                ) : b ? (
                  vermerk(schluessel, b, 'Begründung')
                ) : (
                  <span>
                    <button
                      type="button"
                      className="link"
                      onClick={() => { setBearbeitet(schluessel); setText(''); }}
                    >
                      Begründen
                    </button>
                  </span>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </Card>
  );
}
