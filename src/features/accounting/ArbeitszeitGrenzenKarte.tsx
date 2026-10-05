import { useCallback, useEffect, useMemo, useState } from 'react';
import Card from '@/components/Card';
import Button from '@/components/Button';
import { InputField } from '@/components/Field';
import { ErrorState } from '@/components/States';
import { useToast } from '@/components/Toast';
import { listEntriesInRange } from '@/lib/db/timeEntries';
import {
  listBegruendungen, listGeburtsdaten, removeBegruendung, setBegruendung, type Begruendung,
} from '@/lib/db/arbeitszeitGrenzen';
import { tagessollStunden } from '@/lib/time';
import { datumAT } from '@/lib/datum';
import type { AppUser } from '@/types';
import {
  fallSchluessel, grenzfaelle, grenzText, montagVon, type Grenzfall,
} from './arbeitszeitGrenzen';

const MONATE = ['Jänner', 'Februar', 'März', 'April', 'Mai', 'Juni', 'Juli', 'August',
  'September', 'Oktober', 'November', 'Dezember'];

function plusTage(iso: string, n: number): string {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

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
 */
export default function ArbeitszeitGrenzenKarte({
  companyId,
  personen,
  jahr,
  monat,
}: {
  companyId: string;
  personen: AppUser[];
  jahr: number;
  /** 0-basiert, wie in der Mitarbeiterübersicht. */
  monat: number;
}) {
  const toast = useToast();
  const von = `${jahr}-${String(monat + 1).padStart(2, '0')}-01`;
  const bis = new Date(Date.UTC(jahr, monat + 1, 0)).toISOString().slice(0, 10);

  const [stand, setStand] = useState<{
    faelle: Array<{ person: AppUser; fall: Grenzfall }>;
    begruendungen: Map<string, Begruendung>;
  } | null>(null);
  const [fehler, setFehler] = useState<string | null>(null);
  const [bearbeitet, setBearbeitet] = useState<string | null>(null);
  const [text, setText] = useState('');
  const [laeuft, setLaeuft] = useState(false);

  const laden = useCallback(async () => {
    setFehler(null);
    try {
      const [eintraege, geburtsdaten, begruendungen] = await Promise.all([
        listEntriesInRange(companyId, plusTage(von, -7), plusTage(bis, 7)),
        listGeburtsdaten(companyId),
        listBegruendungen(companyId, montagVon(von), bis),
      ]);
      const faelle = personen.flatMap((person) =>
        grenzfaelle(
          eintraege.filter((e) => e.userId === person.uid),
          { von, bis },
          {
            geburtsdatum: geburtsdaten.get(person.uid) ?? null,
            schultagMin: (tag) => tagessollStunden(person, tag) * 60,
          },
        ).map((fall) => ({ person, fall })),
      );
      setStand({
        faelle,
        begruendungen: new Map(begruendungen.map((b) => [fallSchluessel(b.userId, b), b])),
      });
    } catch (e) {
      setFehler(e instanceof Error ? e.message : String(e));
    }
  }, [companyId, personen, von, bis]);

  useEffect(() => {
    setStand(null);
    void laden();
  }, [laden]);

  const offen = useMemo(
    () => stand?.faelle.filter(({ person, fall }) => !stand.begruendungen.has(fallSchluessel(person.uid, fall))).length ?? 0,
    [stand],
  );

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

  const titel = stand && stand.faelle.length > 0
    ? `Arbeitszeitgrenzen · ${offen > 0 ? `${offen} ohne Begründung` : 'alle begründet'}`
    : 'Arbeitszeitgrenzen';

  return (
    <Card
      title={titel}
      hint={
        <>
          Geprüft wird, was gebucht ist: höchstens 12 Std. am Tag und 60 in der Woche (§ 9 AZG), 11 Std.
          Ruhezeit (§ 12 AZG), 36 Std. Ruhe je Kalenderwoche (§§ 3, 4 ARG). Für Jugendliche unter 18 —
          dafür braucht es das Geburtsdatum in der Benutzerakte — 8 Std. am Tag und 40 in der Woche samt
          Berufsschule, 12 Std. Ruhezeit, keine Arbeit zwischen 20 und 6 Uhr und zwei freie Tage am Stück
          mit dem Sonntag (KJBG). Notdienst und Gefahr in Verzug sind zulässig, aber zu begründen. Nicht
          geprüft: Ruhepausen, Durchrechnung und Gleitzeit, Ausnahmen aus dem Kollektivvertrag.
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
                <span className="font-medium text-ink-deep">
                  {person.name}{fall.jugendlich ? ' · unter 18' : ''}
                </span>
                <span className="text-ink">
                  {was} <span className="text-ink-muted">({gesetz})</span>
                </span>
                {bearbeitet === schluessel ? (
                  <div className="flex flex-col gap-2">
                    <InputField
                      id={`begruendung-${schluessel}`}
                      label="Begründung"
                      placeholder="z. B. Notdienst, Rohrbruch"
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
                        Begründung speichern
                      </Button>
                      <Button variant="ghost" onClick={() => setBearbeitet(null)}>Abbrechen</Button>
                    </span>
                  </div>
                ) : b ? (
                  <span className="flex flex-wrap items-center gap-x-3 text-ink-muted">
                    <span>
                      Begründung: <span className="text-ink">{b.text}</span>
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
