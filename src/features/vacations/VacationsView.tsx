import { useEffect, useMemo, useState, type FormEvent } from 'react';
import { useAuth } from '@/app/AuthContext';
import {
  listOwnVacations,
  listOpenVacations,
  createVacation,
  deleteVacation,
  approveVacation,
  rejectVacation,
  cancelApprovedVacation,
} from '@/lib/db/vacations';
import { listUsers, getUserByUid } from '@/lib/db/users';
import { listEntriesInRange } from '@/lib/db/timeEntries';
import { canEditTime } from '@/lib/permissions';
import { todayStr, urlaubsTage } from '@/lib/time';
import type { AppUser, Vacation } from '@/types';
import type { WithId } from '@/lib/db/core';
import Card from '@/components/Card';
import Button from '@/components/Button';
import Badge from '@/components/Badge';
import PageHeader from '@/components/PageHeader';
import { InputField, FormGrid } from '@/components/Field';
import { List, ListRow } from '@/components/ListRow';
import { useToast } from '@/components/Toast';
import { ErrorState, EmptyState, SkeletonList } from '@/components/States';

/** 'YYYY-MM-DD' -> '15.06.2026'. */
function fmt(iso: string): string {
  if (!iso) return '—';
  return new Date(`${iso}T00:00:00`).toLocaleDateString('de-AT', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  });
}

function zeitraum(v: Vacation): string {
  return v.von === v.bis ? fmt(v.von) : `${fmt(v.von)} – ${fmt(v.bis)}`;
}

const TON: Record<Vacation['status'], 'success' | 'warning' | 'danger' | 'gray'> = {
  Genehmigt: 'success',
  Beantragt: 'warning',
  Abgelehnt: 'danger',
  Storniert: 'gray',
};

/**
 * Urlaub: beantragen, entscheiden, sehen.
 *
 * VORHER WAR URLAUB EIN TAGESSTATUS in der Zeiterfassung. Jeder konnte ihn
 * sich selbst eintragen; genehmigt war er damit nicht, und niemand hatte den
 * Überblick, wer wann weg ist. Es fehlte genau das, worum es beim Urlaub geht:
 * ein Antrag, eine Entscheidung, und für beide Seiten die Gewissheit, woran
 * man ist.
 *
 * Drei Rollen, drei Blickwinkel — in einer Ansicht, weil es eine Sache ist:
 *
 *  - Der Monteur stellt den Antrag und sieht den Stand jedes Antrags. Für ihn
 *    ist die wichtigste Auskunft nicht „wie viele Tage", sondern „ist es
 *    genehmigt" — danach bucht er den Flug.
 *  - Geschäftsführung, Administration und Buchhaltung entscheiden. Sie sehen
 *    dabei, wer im selben Zeitraum schon Urlaub genehmigt bekommen hat; ohne
 *    das wäre die Entscheidung ein Blindflug.
 *  - Wer Einsätze plant, sieht den genehmigten Urlaub in der Einsatzplanung
 *    selbst — dort, wo er stört, nicht hier.
 */
export default function VacationsView() {
  const { user } = useAuth();
  const toast = useToast();

  const darfEntscheiden = user ? canEditTime(user.role) : false;

  const [eigene, setEigene] = useState<WithId<Vacation>[]>([]);
  const [offene, setOffene] = useState<WithId<Vacation>[]>([]);
  const [profil, setProfil] = useState<AppUser | null>(null);
  const [team, setTeam] = useState<AppUser[]>([]);
  const [laden, setLaden] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [arbeitet, setArbeitet] = useState<string | null>(null);

  const [von, setVon] = useState(todayStr());
  const [bis, setBis] = useState(todayStr());
  const [notiz, setNotiz] = useState('');
  const [sendet, setSendet] = useState(false);

  const laden_ = useMemo(
    () => async () => {
      if (!user) return;
      setLaden(true);
      setError(null);
      try {
        const [meine, profilDaten] = await Promise.all([
          listOwnVacations(user.companyId, user.uid),
          getUserByUid(user.companyId, user.uid),
        ]);
        setEigene(meine);
        setProfil(profilDaten ?? null);
        if (darfEntscheiden) {
          const [warten, alle] = await Promise.all([
            listOpenVacations(user.companyId),
            listUsers(user.companyId),
          ]);
          // Ältester Antrag zuerst: wer am längsten wartet, wartet nicht noch länger.
          setOffene([...warten].sort((a, b) => a.von.localeCompare(b.von)));
          setTeam(alle);
        }
      } catch {
        setError('Die Urlaubsanträge konnten nicht geladen werden.');
      } finally {
        setLaden(false);
      }
    },
    [user, darfEntscheiden],
  );

  useEffect(() => {
    void laden_();
  }, [laden_]);

  /** Die Arbeitstage im gewählten Zeitraum — die Zahl, die zählt. */
  const tage = useMemo(
    () => (profil ? urlaubsTage(profil, von, bis) : []),
    [profil, von, bis],
  );

  /**
   * Was in diesem Jahr schon genehmigt ist.
   *
   * Der Anspruch steht in den Stammdaten (`yearlyVacationDays`). Ohne diese
   * Gegenüberstellung müsste jeder selbst mitzählen — und genau das führt zu
   * dem Anruf beim Chef, den die Ansicht ersparen soll.
   */
  const jahr = String(new Date().getFullYear());
  const genommen = useMemo(
    () =>
      eigene
        .filter((v) => v.status === 'Genehmigt' && v.von.startsWith(jahr))
        .reduce((s, v) => s + v.tage, 0),
    [eigene, jahr],
  );
  const anspruch = profil?.yearlyVacationDays ?? 25;

  async function beantragen(e: FormEvent) {
    e.preventDefault();
    if (!user || !profil) return;
    if (tage.length === 0) {
      setError(
        bis < von
          ? 'Das Ende liegt vor dem Beginn.'
          : 'In diesem Zeitraum liegt kein Arbeitstag — da braucht es keinen Urlaub.',
      );
      return;
    }
    // Eine Überschneidung mit einem laufenden oder genehmigten Antrag ist fast
    // immer ein Versehen. Sie hier abzufangen ist freundlicher, als sie den
    // Genehmigenden finden zu lassen.
    const kollision = eigene.find(
      (v) => (v.status === 'Beantragt' || v.status === 'Genehmigt') && v.von <= bis && v.bis >= von,
    );
    if (kollision) {
      setError(`Überschneidet sich mit einem Antrag vom ${zeitraum(kollision)} (${kollision.status}).`);
      return;
    }
    setSendet(true);
    setError(null);
    try {
      await createVacation(user.companyId, {
        userId: user.uid,
        userName: user.name,
        von,
        bis,
        tage: tage.length,
        status: 'Beantragt',
        notiz: notiz.trim(),
      });
      toast.success('Antrag eingereicht');
      setNotiz('');
      await laden_();
    } catch {
      setError('Der Antrag konnte nicht eingereicht werden.');
    } finally {
      setSendet(false);
    }
  }

  async function genehmigen(antrag: WithId<Vacation>) {
    if (!user) return;
    setArbeitet(antrag.id);
    setError(null);
    try {
      const mitarbeiter = team.find((u) => u.uid === antrag.userId);
      /**
       * Erst nachsehen, an welchen Tagen dieser Mitarbeiter schon gebucht hat.
       *
       * Ein bereits erfasster Arbeitstag darf von einer Genehmigung nicht
       * stillschweigend überschrieben werden — das wäre eine gelöschte
       * Arbeitsleistung, und niemand würde es merken.
       */
      const vorhandene = await listEntriesInRange(user.companyId, antrag.von, antrag.bis);
      const belegt = new Set(
        vorhandene.filter((e) => e.userId === antrag.userId).map((e) => e.date),
      );
      const { angelegt, uebersprungen } = await approveVacation(
        user.companyId,
        antrag,
        mitarbeiter ?? {},
        { uid: user.uid, name: user.name },
        belegt,
      );
      toast.success(
        uebersprungen > 0
          ? `Genehmigt — ${angelegt} Tage eingetragen, ${uebersprungen} übersprungen (dort war schon gebucht)`
          : `Genehmigt — ${angelegt} ${angelegt === 1 ? 'Tag' : 'Tage'} im Zeitkonto eingetragen`,
      );
      await laden_();
    } catch {
      setError('Die Genehmigung ist fehlgeschlagen.');
    } finally {
      setArbeitet(null);
    }
  }

  async function ablehnen(antrag: WithId<Vacation>) {
    if (!user) return;
    // Pflichtgrund: eine Ablehnung ohne Begründung ist für den, der sie
    // bekommt, nicht von Willkür zu unterscheiden.
    const grund = window.prompt(`Warum wird der Urlaub von ${antrag.userName} abgelehnt?`);
    if (grund === null) return;
    if (grund.trim().length < 3) {
      setError('Bitte einen Grund angeben.');
      return;
    }
    setArbeitet(antrag.id);
    try {
      await rejectVacation(antrag.id, { uid: user.uid, name: user.name }, grund.trim());
      toast.success('Antrag abgelehnt');
      await laden_();
    } catch {
      setError('Die Ablehnung konnte nicht gespeichert werden.');
    } finally {
      setArbeitet(null);
    }
  }

  async function zuruecknehmen(antrag: WithId<Vacation>) {
    if (!user) return;
    const grund = window.prompt(`Warum wird der genehmigte Urlaub von ${antrag.userName} zurückgenommen?`);
    if (grund === null) return;
    if (grund.trim().length < 3) {
      setError('Bitte einen Grund angeben.');
      return;
    }
    setArbeitet(antrag.id);
    try {
      // Die bei der Genehmigung erzeugten Zeiteinträge wieder einsammeln —
      // sonst stünde der Urlaub weiter im Zeitkonto.
      const imZeitraum = await listEntriesInRange(user.companyId, antrag.von, antrag.bis);
      await cancelApprovedVacation(
        antrag,
        imZeitraum.filter((e) => e.vacationId === antrag.id),
        { uid: user.uid, name: user.name },
        grund.trim(),
      );
      toast.success('Urlaub zurückgenommen');
      await laden_();
    } catch {
      setError('Die Rücknahme ist fehlgeschlagen.');
    } finally {
      setArbeitet(null);
    }
  }

  async function zurueckziehen(antrag: WithId<Vacation>) {
    setArbeitet(antrag.id);
    try {
      await deleteVacation(antrag.id);
      toast.success('Antrag zurückgezogen');
      await laden_();
    } catch {
      setError('Der Antrag konnte nicht zurückgezogen werden.');
    } finally {
      setArbeitet(null);
    }
  }

  if (!user) return null;

  /** Genehmigter Urlaub anderer im Zeitraum eines offenen Antrags. */
  function gleichzeitig(antrag: WithId<Vacation>): string[] {
    return offene
      .concat(eigene)
      .filter(
        (v) =>
          v.id !== antrag.id &&
          v.status === 'Genehmigt' &&
          v.von <= antrag.bis &&
          v.bis >= antrag.von,
      )
      .map((v) => v.userName);
  }

  return (
    <div className="space-y-6">
      <PageHeader title="Urlaub" subtitle="Beantragen, genehmigen, im Blick behalten" />

      {error && <ErrorState message={error} />}

      <Card title="Urlaub beantragen">
        <form onSubmit={beantragen} className="space-y-4">
          <FormGrid>
            <InputField
              id="uvon"
              label="Von"
              type="date"
              value={von}
              onChange={(e) => {
                setVon(e.target.value);
                // Das Ende mitziehen, solange es davor läge — sonst steht dort
                // ein Zeitraum, den niemand so gemeint hat.
                if (bis < e.target.value) setBis(e.target.value);
              }}
              required
            />
            <InputField
              id="ubis"
              label="Bis (einschließlich)"
              type="date"
              value={bis}
              min={von}
              onChange={(e) => setBis(e.target.value)}
              required
            />
          </FormGrid>
          <InputField
            id="unotiz"
            label="Anmerkung (freiwillig)"
            value={notiz}
            onChange={(e) => setNotiz(e.target.value)}
          />

          {/*
            Die Zahl, um die es geht — und zwar in Arbeitstagen. Wochenende und
            Feiertage zählen nicht; wer eine Woche mit Feiertag nimmt, verbraucht
            vier Tage, nicht fünf.
          */}
          <p className="rounded-sm border border-info/30 bg-info-bg px-3 py-2 text-sm text-info">
            <strong className="tnum">
              {tage.length} {tage.length === 1 ? 'Arbeitstag' : 'Arbeitstage'}
            </strong>{' '}
            in diesem Zeitraum. Wochenenden und Feiertage sind nicht mitgezählt.
            <span className="mt-1 block text-xs">
              In diesem Jahr genehmigt: <span className="tnum">{genommen}</span> von{' '}
              <span className="tnum">{anspruch}</span> Tagen.
            </span>
          </p>

          <Button type="submit" loading={sendet} disabled={tage.length === 0}>
            Antrag einreichen
          </Button>
        </form>
      </Card>

      {/* Die Arbeitsliste der Genehmigenden steht VOR der eigenen Historie:
          hier wartet jemand auf eine Antwort. */}
      {darfEntscheiden && (
        <Card title={`Offene Anträge (${offene.length})`}>
          {laden ? (
            <SkeletonList rows={2} />
          ) : offene.length === 0 ? (
            <EmptyState>Kein Antrag wartet auf eine Entscheidung.</EmptyState>
          ) : (
            <List>
              {offene.map((v) => {
                const parallel = gleichzeitig(v);
                return (
                  <ListRow
                    key={v.id}
                    title={v.userName}
                    subtitle={
                      <>
                        <span className="tnum block">
                          {zeitraum(v)} · {v.tage} {v.tage === 1 ? 'Tag' : 'Tage'}
                        </span>
                        {v.notiz && <span className="mt-1 block">{v.notiz}</span>}
                        {/*
                          Wer sonst noch weg ist. Ohne diese Zeile wäre die
                          Entscheidung ein Blindflug — und der zweite Monteur
                          bekäme dieselbe Woche genehmigt.
                        */}
                        {parallel.length > 0 && (
                          <span className="mt-1 block text-xs text-warning">
                            Gleichzeitig im Urlaub: {parallel.join(', ')}
                          </span>
                        )}
                      </>
                    }
                  >
                    <Button
                      loading={arbeitet === v.id}
                      onClick={() => genehmigen(v)}
                    >
                      Genehmigen
                    </Button>
                    <Button
                      variant="ghost"
                      loading={arbeitet === v.id}
                      onClick={() => ablehnen(v)}
                    >
                      Ablehnen
                    </Button>
                  </ListRow>
                );
              })}
            </List>
          )}
        </Card>
      )}

      <Card title="Meine Anträge">
        {laden ? (
          <SkeletonList rows={3} />
        ) : eigene.length === 0 ? (
          <EmptyState>Noch kein Urlaubsantrag gestellt.</EmptyState>
        ) : (
          <List>
            {eigene.map((v) => (
              <ListRow
                key={v.id}
                title={<span className="tnum">{zeitraum(v)}</span>}
                subtitle={
                  <>
                    <span className="block">
                      {v.tage} {v.tage === 1 ? 'Arbeitstag' : 'Arbeitstage'}
                      {v.notiz ? ` · ${v.notiz}` : ''}
                    </span>
                    {/*
                      Wer entschieden hat und warum. „Abgelehnt" allein ist
                      keine Auskunft, sondern eine Kränkung.
                    */}
                    {v.entschiedenVonName && (
                      <span className="mt-1 block text-xs text-ink-muted">
                        {v.status} von {v.entschiedenVonName}
                        {v.grund ? ` — ${v.grund}` : ''}
                      </span>
                    )}
                    {v.status === 'Beantragt' && (
                      <span className="mt-1 block text-xs text-ink-muted">
                        Noch nicht entschieden — bitte noch nichts fix buchen.
                      </span>
                    )}
                  </>
                }
              >
                <Badge tone={TON[v.status]}>{v.status}</Badge>
                {v.status === 'Beantragt' && (
                  <Button
                    variant="ghost"
                    loading={arbeitet === v.id}
                    onClick={() => zurueckziehen(v)}
                  >
                    Zurückziehen
                  </Button>
                )}
                {v.status === 'Genehmigt' && darfEntscheiden && (
                  <Button
                    variant="ghost"
                    loading={arbeitet === v.id}
                    onClick={() => zuruecknehmen(v)}
                  >
                    Zurücknehmen
                  </Button>
                )}
              </ListRow>
            ))}
          </List>
        )}
      </Card>

      {darfEntscheiden && (
        <p className="text-sm text-ink-muted">
          Ein genehmigter Urlaub trägt die Tage automatisch ins Zeitkonto ein — als „Urlaub", mit
          vollem Tagessoll. Deshalb taucht er weder als fehlende Zeit auf der Startseite noch als
          Minus im Saldo auf. Tage, an denen schon gebucht war, bleiben unangetastet.
        </p>
      )}
    </div>
  );
}
