import { useEffect, useMemo, useState, type FormEvent } from 'react';
import type { AppUser, Krankmeldung } from '@/types';
import type { WithId } from '@/lib/db/core';
import {
  getKrankmeldung,
  krankmeldungLoeschen,
  krankmeldungSpeichern,
  listKrankmeldungenAb,
} from '@/lib/db/abwesenheiten';
import { listUsers } from '@/lib/db/users';
import { localDateStr, todayStr } from '@/lib/time';
import Card from '@/components/Card';
import Button from '@/components/Button';
import ConfirmDialog from '@/components/ConfirmDialog';
import { Marke } from '@/components/Badge';
import { InputField, SelectField, FormGrid } from '@/components/Field';
import { List, ListRow } from '@/components/ListRow';
import { EmptyState, ErrorState, SkeletonList } from '@/components/States';
import { useToast } from '@/components/Toast';
import { ergebnisText, zeitraumText } from './abwesenheitText';

/**
 * Krankmeldungen — die eigene Liste und die des Büros.
 *
 * „Ende ändern" ist der häufigste Handgriff: krank gemeldet wird, bevor man
 * weiss, wie lange es dauert. Die Datenbank rechnet die Tage im Zeitkonto
 * dabei nach — was wegfällt, geht heraus; was dazukommt und frei ist,
 * kommt hinein.
 */

/** Die Liste — mit „Ende ändern" und „Löschen". */
export function KrankmeldungListe({
  meldungen,
  mitNamen,
  meinName,
  onGeaendert,
}: {
  meldungen: WithId<Krankmeldung>[];
  mitNamen: boolean;
  meinName: string;
  onGeaendert: () => void;
}) {
  const toast = useToast();
  const [bearbeitet, setBearbeitet] = useState<string | null>(null);
  const [neuesEnde, setNeuesEnde] = useState('');
  const [laeuft, setLaeuft] = useState<string | null>(null);
  const [fehler, setFehler] = useState<string | null>(null);
  const [loeschen, setLoeschen] = useState<WithId<Krankmeldung> | null>(null);
  const heute = todayStr();

  async function endeSpeichern(k: WithId<Krankmeldung>) {
    if (!neuesEnde || neuesEnde < k.von) {
      setFehler('Das Ende liegt vor dem Beginn.');
      return;
    }
    setLaeuft(k.id);
    setFehler(null);
    try {
      const e = await krankmeldungSpeichern({
        id: k.id, von: k.von, bis: neuesEnde, notiz: k.notiz ?? '', melderName: meinName,
      });
      toast.success(`Ende geändert — ${ergebnisText(e)}`);
      setBearbeitet(null);
      onGeaendert();
    } catch (e) {
      setFehler(e instanceof Error && e.message ? e.message : 'Das Ende konnte nicht geändert werden.');
    } finally {
      setLaeuft(null);
    }
  }

  async function loeschenBestaetigt(k: WithId<Krankmeldung>) {
    setLoeschen(null);
    setLaeuft(k.id);
    setFehler(null);
    try {
      const n = await krankmeldungLoeschen(k.id);
      toast.success(`Krankmeldung gelöscht — ${n} ${n === 1 ? 'Tag' : 'Tage'} aus dem Zeitkonto entfernt`);
      onGeaendert();
    } catch (e) {
      setFehler(e instanceof Error && e.message ? e.message : 'Die Krankmeldung konnte nicht gelöscht werden.');
    } finally {
      setLaeuft(null);
    }
  }

  return (
    <>
      {fehler && <ErrorState message={fehler} />}
      <List>
        {meldungen.map((k) => (
          <ListRow
            key={k.id}
            title={
              <span>
                {mitNamen && <span className="mr-2">{k.userName}</span>}
                <span className="tnum">{zeitraumText(k.von, k.bis)}</span>
              </span>
            }
            subtitle={[
              k.notiz ?? '',
              k.gemeldetVonName && k.gemeldetVonName !== k.userName ? `erfasst von ${k.gemeldetVonName}` : '',
            ].filter(Boolean).join(' · ') || undefined}
          >
            {k.von <= heute && k.bis >= heute && <Marke>läuft</Marke>}
            {bearbeitet === k.id ? (
              <span className="flex flex-wrap items-end gap-2">
                <InputField
                  id={`ende-${k.id}`}
                  label="Krank bis"
                  type="date"
                  value={neuesEnde}
                  min={k.von}
                  onChange={(e) => setNeuesEnde(e.target.value)}
                />
                <Button loading={laeuft === k.id} onClick={() => void endeSpeichern(k)}>Speichern</Button>
                <Button variant="ghost" onClick={() => setBearbeitet(null)}>Abbrechen</Button>
              </span>
            ) : (
              <>
                <Button
                  variant="ghost"
                  disabled={laeuft !== null}
                  onClick={() => {
                    setNeuesEnde(k.bis);
                    setFehler(null);
                    setBearbeitet(k.id);
                  }}
                >
                  Ende ändern
                </Button>
                <Button
                  variant="ghost"
                  loading={laeuft === k.id}
                  onClick={() => setLoeschen(k)}
                >
                  Löschen
                </Button>
              </>
            )}
          </ListRow>
        ))}
      </List>

      <ConfirmDialog
        open={!!loeschen}
        title="Krankmeldung löschen?"
        confirmLabel="Löschen"
        message={
          loeschen
            ? `${mitNamen ? `${loeschen.userName}, ` : ''}${zeitraumText(loeschen.von, loeschen.bis)} — die Meldung und die Krank-Tage, die sie eingetragen hat, verschwinden aus dem Zeitkonto. Gedacht für eine irrtümliche Meldung; ist jemand früher gesund, bitte „Ende ändern".`
            : ''
        }
        onCancel={() => setLoeschen(null)}
        onConfirm={() => (loeschen ? loeschenBestaetigt(loeschen) : undefined)}
      />
    </>
  );
}

/**
 * Die Krankmeldung zu einem Krank-Tag — aus der Zeiterfassung heraus.
 *
 * KRANK ÄNDERT NUR NOCH DIE KRANKMELDUNG, und die Zeiterfassung ist der Ort,
 * an dem jemand den Tag sieht. Hier stehen deshalb dieselben Handgriffe wie
 * auf der Urlaubsseite („Ende ändern", „Löschen") — auch für einen Betrieb,
 * der das Modul Urlaub abgeschaltet hat und die Seite gar nicht kennt.
 */
export function KrankmeldungKarte({
  companyId,
  id,
  meinName,
  mitNamen,
  onGeaendert,
  onSchliessen,
}: {
  companyId: string;
  id: string;
  meinName: string;
  mitNamen: boolean;
  onGeaendert: () => void;
  onSchliessen: () => void;
}) {
  const [meldung, setMeldung] = useState<WithId<Krankmeldung> | null | 'laedt' | 'fehler'>('laedt');

  useEffect(() => {
    let weg = false;
    setMeldung('laedt');
    getKrankmeldung(companyId, id)
      .then((k) => {
        if (!weg) setMeldung(k);
      })
      .catch(() => {
        if (!weg) setMeldung('fehler');
      });
    return () => {
      weg = true;
    };
  }, [companyId, id]);

  return (
    <Card
      title="Krankmeldung"
      action={<Button variant="ghost" onClick={onSchliessen}>Schliessen</Button>}
    >
      {meldung === 'laedt' ? (
        <SkeletonList rows={1} />
      ) : meldung === 'fehler' ? (
        <ErrorState message="Die Krankmeldung konnte nicht geladen werden." />
      ) : meldung === null ? (
        <EmptyState>Diese Krankmeldung gibt es nicht mehr.</EmptyState>
      ) : (
        <KrankmeldungListe
          meldungen={[meldung]}
          mitNamen={mitNamen}
          meinName={meinName}
          onGeaendert={onGeaendert}
        />
      )}
    </Card>
  );
}

/**
 * Der Büro-Reiter: Krankmeldungen erfassen (etwa nach einem Anruf) und die
 * laufenden und jüngeren im Blick.
 */
export function KrankenstaendeReiter({ companyId, meinName }: { companyId: string; meinName: string }) {
  const toast = useToast();
  const [leute, setLeute] = useState<AppUser[]>([]);
  const [meldungen, setMeldungen] = useState<WithId<Krankmeldung>[]>([]);
  const [laden, setLaden] = useState(true);
  const [fehler, setFehler] = useState<string | null>(null);
  const [stand, setStand] = useState(0);

  const [wer, setWer] = useState('');
  const [von, setVon] = useState(todayStr());
  const [bis, setBis] = useState(todayStr());
  const [notiz, setNotiz] = useState('');
  const [sendet, setSendet] = useState(false);

  // Die letzten acht Wochen und alles, was noch läuft: das ist, was das Büro
  // für die Lohnverrechnung und die Planung braucht. Ältere stehen im
  // Zeitkonto.
  const ab = useMemo(() => {
    const d = new Date();
    d.setDate(d.getDate() - 56);
    return localDateStr(d);
  }, []);

  useEffect(() => {
    listUsers(companyId)
      .then((u) =>
        setLeute(u.filter((x) => x.active !== false).sort((a, b) => a.name.localeCompare(b.name, 'de'))),
      )
      .catch(() => setFehler('Die Belegschaft konnte nicht geladen werden.'));
  }, [companyId]);

  useEffect(() => {
    let weg = false;
    setLaden(true);
    listKrankmeldungenAb(companyId, ab)
      .then((m) => {
        if (!weg) setMeldungen(m);
      })
      .catch(() => {
        if (!weg) setFehler('Die Krankmeldungen konnten nicht geladen werden.');
      })
      .finally(() => {
        if (!weg) setLaden(false);
      });
    return () => {
      weg = true;
    };
  }, [companyId, ab, stand]);

  async function erfassen(e: FormEvent) {
    e.preventDefault();
    if (!wer) {
      setFehler('Bitte einen Mitarbeiter wählen.');
      return;
    }
    if (bis < von) {
      setFehler('Das Ende liegt vor dem Beginn.');
      return;
    }
    setSendet(true);
    setFehler(null);
    try {
      const r = await krankmeldungSpeichern({ userId: wer, von, bis, notiz: notiz.trim(), melderName: meinName });
      toast.success(`Krankmeldung erfasst — ${ergebnisText(r)}`);
      setNotiz('');
      setStand((n) => n + 1);
    } catch (err) {
      setFehler(err instanceof Error && err.message ? err.message : 'Die Krankmeldung konnte nicht erfasst werden.');
    } finally {
      setSendet(false);
    }
  }

  return (
    <div className="space-y-6">
      {fehler && <ErrorState message={fehler} />}
      <Card
        title="Krankmeldung erfassen"
        hint={
          <>
            Für jemanden, der sich telefonisch krank meldet. Eingetragen wird „Krank" an den
            Arbeitstagen des Zeitraums; Tage, an denen schon gearbeitet oder Urlaub gebucht ist,
            bleiben, wie sie sind. Eine Diagnose gehört nicht in die Anmerkung — Krankenstände sind
            Gesundheitsdaten und nur für die Person selbst und das Büro sichtbar.
          </>
        }
      >
        <form onSubmit={erfassen} className="space-y-4">
          <SelectField id="krank-wer" label="Mitarbeiter" value={wer} onChange={(e) => setWer(e.target.value)} pflicht>
            <option value="">— wählen —</option>
            {leute.map((u) => (
              <option key={u.uid} value={u.uid}>{u.name}</option>
            ))}
          </SelectField>
          <FormGrid>
            <InputField
              id="krank-von"
              label="Krank ab"
              type="date"
              value={von}
              onChange={(e) => {
                setVon(e.target.value);
                if (bis < e.target.value) setBis(e.target.value);
              }}
              pflicht
            />
            <InputField
              id="krank-bis"
              label="Voraussichtlich bis"
              type="date"
              value={bis}
              min={von}
              onChange={(e) => setBis(e.target.value)}
              pflicht
            />
          </FormGrid>
          <InputField
            id="krank-notiz"
            label="Anmerkung (freiwillig, keine Diagnose)"
            value={notiz}
            onChange={(e) => setNotiz(e.target.value)}
          />
          <Button type="submit" loading={sendet}>Krankmeldung erfassen</Button>
        </form>
      </Card>

      <Card title="Krankenstände">
        {laden ? (
          <SkeletonList rows={2} />
        ) : meldungen.length === 0 ? (
          <EmptyState>In den letzten acht Wochen keine Krankmeldung.</EmptyState>
        ) : (
          <KrankmeldungListe
            meldungen={meldungen}
            mitNamen
            meinName={meinName}
            onGeaendert={() => setStand((n) => n + 1)}
          />
        )}
      </Card>
    </div>
  );
}
