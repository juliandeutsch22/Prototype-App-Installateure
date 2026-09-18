import { useEffect, useMemo, useState, type FormEvent } from 'react';
import { useAuth } from '@/app/AuthContext';
import {
  listOwnVacations,
  listOpenVacations,
  createVacation,
  deleteVacation,
} from '@/lib/db/vacations';
import { getUserByUid } from '@/lib/db/users';
import { callUrlaubEntscheiden } from '@/lib/functions';
import { darfUrlaubEntscheiden } from '@/lib/permissions';
import { postenNeuLaden } from '@/app/offenePosten';
import { todayStr, urlaubsTage, urlaubsStand, uebertragsRegel } from '@/lib/time';
import type { AppUser, Vacation } from '@/types';
import type { WithId } from '@/lib/db/core';
import InfoHint from '@/components/InfoHint';
import Card from '@/components/Card';
import Button from '@/components/Button';
import { Zustand, type Stand } from '@/components/Badge';
import PageHeader from '@/components/PageHeader';
import ConfirmDialog from '@/components/ConfirmDialog';
import { InputField, FormGrid, Pflichthinweis } from '@/components/Field';
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

/*
  „Beantragt" bleibt der einzige Zustand mit Aufmerksamkeit: dort wartet eine
  Entscheidung. „Abgelehnt" war rot und ist es nicht mehr — entschieden ist
  entschieden, zu tun bleibt nichts.
*/
const STAND: Record<Vacation['status'], Stand> = {
  Genehmigt: 'gut',
  Beantragt: 'achtung',
  Abgelehnt: 'ruht',
  Storniert: 'ruht',
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
  const { user, company } = useAuth();
  const toast = useToast();

  /**
   * Wer entscheiden darf, steht in den Einstellungen — nicht in der Rolle.
   *
   * In dem einen Betrieb entscheidet die Buchhaltung, im anderen ein
   * Vorarbeiter, im dritten ausschließlich der Chef. Geschäftsführung und
   * Administration können immer; ohne Festlegung bleibt es beim
   * Ausgangszustand. Dieselbe Regel steht in firestore.rules und in der
   * Cloud Function, die tatsächlich entscheidet.
   */
  const darfEntscheiden = user
    ? darfUrlaubEntscheiden(user.role, user.uid, company?.vacationApprovers)
    : false;

  const [eigene, setEigene] = useState<WithId<Vacation>[]>([]);
  const [offene, setOffene] = useState<WithId<Vacation>[]>([]);
  const [profil, setProfil] = useState<AppUser | null>(null);
  const [laden, setLaden] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [arbeitet, setArbeitet] = useState<string | null>(null);
  /** Welcher eigene Antrag zurückgezogen werden soll — null heisst: keiner. */
  const [zurueckzuziehen, setZurueckzuziehen] = useState<WithId<Vacation> | null>(null);

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
          /*
            MEHR ALS DIE LETZTEN SECHZIG. Die Vorgabe reichte, solange nur das
            laufende Jahr zählte. Für den Übertrag hängt der Anspruch am
            ganzen Verlauf seit dem Startdatum — und abgeschnitten würde
            ausgerechnet das Älteste, also genau das, woraus der Übertrag
            kommt. 500 sind bei einem Menschen ein Berufsleben.
          */
          listOwnVacations(user.companyId, user.uid, 500),
          getUserByUid(user.companyId, user.uid),
        ]);
        setEigene(meine);
        setProfil(profilDaten ?? null);
        if (darfEntscheiden) {
          const warten = await listOpenVacations(user.companyId);
          // Ältester Antrag zuerst: wer am längsten wartet, wartet nicht noch länger.
          setOffene([...warten].sort((a, b) => a.von.localeCompare(b.von)));
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
   * Was in diesem Jahr zur Verfügung steht und was davon schon weg ist.
   *
   * Ohne diese Gegenüberstellung müsste jeder selbst mitzählen — und genau
   * das führt zu dem Anruf beim Chef, den die Ansicht ersparen soll. Dann
   * muss die Zahl aber auch stimmen: im Jahr der Inbetriebnahme zählt der
   * mitgebrachte Bestand, nicht der volle Jahresanspruch. Gerechnet wird das
   * in `urlaubsStand` — derselben Stelle, aus der auch die Buchhaltung ihre
   * Zahl bekommt.
   *
   * GEZÄHLT WIRD, WAS GENEHMIGT IST. Die Buchhaltung zählt stattdessen die
   * Urlaubstage in der Zeiterfassung. Das sind zwei verschiedene Fragen —
   * „zugesagt" und „gebucht" —, und sie bleiben absichtlich getrennt.
   */
  const jahr = new Date().getFullYear();
  const stand = useMemo(
    () =>
      urlaubsStand(
        profil ?? { yearlyVacationDays: undefined, initialVacationDays: null, appStartDate: null },
        jahr,
        /*
          ALLE genehmigten Urlaube, nicht nur die dieses Jahres. Der Anspruch
          hängt am Rest des Vorjahres; mit einem Jahresfilter wäre der Übertrag
          immer null, und die Zahl wäre wieder die falsche — nur an einer
          anderen Stelle als vorher.
        */
        eigene
          .filter((v) => v.status === 'Genehmigt')
          .map((v) => ({ von: v.von, tage: v.tage })),
        uebertragsRegel(company),
      ),
    [eigene, jahr, profil, company],
  );
  const genommen = stand.genommen;
  const anspruch = stand.anspruch;

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

  /**
   * Entscheiden — der Server tut es, nicht der Browser.
   *
   * Die Genehmigung muss nachsehen, an welchen Tagen der Antragsteller schon
   * gebucht hat, und dann fremde Zeiteinträge schreiben. Beides darf ein
   * Genehmigender nicht selbst: Zeiteinträge tragen Kranken- und Urlaubstage
   * und damit Gesundheitsdaten nach Art. 9 DSGVO. Der Aufruf schickt deshalb
   * nur, WELCHER Antrag wie entschieden wird.
   */
  async function entscheiden(
    antrag: WithId<Vacation>,
    entscheidung: 'Genehmigt' | 'Abgelehnt' | 'Storniert',
    grund?: string,
  ) {
    if (!user) return;
    setArbeitet(antrag.id);
    setError(null);
    try {
      const { data } = await callUrlaubEntscheiden({
        vacationId: antrag.id,
        entscheidung,
        grund,
        entscheiderName: user.name,
      });
      if (entscheidung === 'Genehmigt') {
        toast.success(
          data.uebersprungen > 0
            ? `Genehmigt — ${data.angelegt} Tage eingetragen, ${data.uebersprungen} übersprungen (dort war schon gebucht)`
            : `Genehmigt — ${data.angelegt} ${data.angelegt === 1 ? 'Tag' : 'Tage'} im Zeitkonto eingetragen`,
        );
      } else if (entscheidung === 'Abgelehnt') {
        toast.success('Antrag abgelehnt');
      } else {
        toast.success(
          `Urlaub zurückgenommen — ${data.entfernt} ${data.entfernt === 1 ? 'Tag' : 'Tage'} aus dem Zeitkonto entfernt`,
        );
      }
      await laden_();
      /*
        DAS ABZEICHEN IM MENÜ ZÄHLT MIT. Ohne diese Zeile stünde nach der
        letzten Entscheidung weiter eine Zahl daneben, bis jemand die Seite
        wechselt — und ein Hinweis, der nach getaner Arbeit stehen bleibt,
        ist schlimmer als keiner: beim nächsten Mal glaubt man ihm nicht.
      */
      void postenNeuLaden();
    } catch {
      setError(
        entscheidung === 'Genehmigt'
          ? 'Die Genehmigung ist fehlgeschlagen.'
          : 'Die Entscheidung konnte nicht gespeichert werden.',
      );
    } finally {
      setArbeitet(null);
    }
  }

  async function ablehnen(antrag: WithId<Vacation>) {
    // Pflichtgrund: eine Ablehnung ohne Begründung ist für den, der sie
    // bekommt, nicht von Willkür zu unterscheiden. Der Server verlangt ihn
    // ebenfalls — hier steht er nur früher.
    const grund = window.prompt(`Warum wird der Urlaub von ${antrag.userName} abgelehnt?`);
    if (grund === null) return;
    if (grund.trim().length < 3) {
      setError('Bitte einen Grund angeben.');
      return;
    }
    await entscheiden(antrag, 'Abgelehnt', grund.trim());
  }

  async function zuruecknehmen(antrag: WithId<Vacation>) {
    const grund = window.prompt(
      `Warum wird der genehmigte Urlaub von ${antrag.userName} zurückgenommen?`,
    );
    if (grund === null) return;
    if (grund.trim().length < 3) {
      setError('Bitte einen Grund angeben.');
      return;
    }
    await entscheiden(antrag, 'Storniert', grund.trim());
  }

  /**
   * Den eigenen, noch nicht entschiedenen Antrag zurückziehen.
   *
   * MIT RÜCKFRAGE, obwohl der Schaden klein ist. Der Knopf steht direkt neben
   * dem Antrag und heisst nicht danach, was er tut: er LÖSCHT ihn. Ein
   * Fehlgriff kostet zwar nur das erneute Eintippen, aber ein Löschknopf ohne
   * Rückfrage neben elf Löschknöpfen mit Rückfrage ist genau die Ausnahme,
   * auf die sich niemand einstellt.
   *
   * Betroffen ist ausschliesslich ein Antrag im Zustand „Beantragt". Ein
   * genehmigter wird nicht gelöscht, sondern über `zuruecknehmen`
   * zurückgenommen — dabei räumt der Server auch die erzeugten Urlaubstage
   * wieder aus dem Zeitkonto.
   */
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
      setZurueckzuziehen(null);
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
              pflicht
            />
            <InputField
              id="ubis"
              label="Bis (einschließlich)"
              type="date"
              value={bis}
              min={von}
              onChange={(e) => setBis(e.target.value)}
              required
              pflicht
            />
          </FormGrid>
          <InputField
            id="unotiz"
            label="Anmerkung (freiwillig)"
            value={notiz}
            onChange={(e) => setNotiz(e.target.value)}
          />

          {/*
            Die ZAHL bleibt sichtbar — sie ändert sich mit jeder Eingabe und
            ist der eigentliche Inhalt dieses Kastens. Warum sie so
            zustandekommt, steht hinter dem „i": das ist einmal interessant
            und danach nur noch lang.
          */}
          <div className="flex flex-wrap items-center rounded-sm border-l-[3px] border-info bg-surface-2 px-3 py-2 text-sm text-info">
            <strong className="tnum">
              {tage.length} {tage.length === 1 ? 'Arbeitstag' : 'Arbeitstage'}
            </strong>
            <span className="ml-1">in diesem Zeitraum.</span>
            <InfoHint about="Arbeitstage">
              Gezählt werden nur die Tage, an denen dieser Mitarbeiter ohnehin arbeiten würde.
              Wochenenden, gesetzliche Feiertage und freie Wochentage bei Teilzeit fallen heraus:
              Wer eine Woche mit Feiertag nimmt, verbraucht vier Tage, nicht fünf.
            </InfoHint>
            <span className="mt-1 block basis-full text-xs">
              In diesem Jahr genehmigt: <span className="tnum">{genommen}</span> von{' '}
              <span className="tnum">{anspruch}</span> Tagen
              {/* Eine richtige Zahl mit falscher Erklärung ist auch eine
                  falsche Auskunft: „von 25" stimmt weder im Umstiegsjahr
                  (dort sind es die mitgebrachten Tage) noch dort, wo ein
                  Übertrag aus dem Vorjahr dabei ist. */}
              {stand.ausAnfangsbestand
                ? ' (Restanspruch beim Umstieg).'
                : stand.uebertrag > 0
                  ? `, davon ${stand.uebertrag} aus dem Vorjahr.`
                  : '.'}
              {/* Verfallene Tage werden GENANNT. Sie lautlos abzuziehen wäre
                  genau die Sorte Zahl, über die sich jemand später beschwert
                  — und dann ist es ein Streit statt einer Auskunft. */}
              {stand.verfallen > 0 && (
                <span className="mt-1 block">
                  <span className="tnum">{stand.verfallen}</span>
                  {stand.verfallen === 1 ? ' Tag ist' : ' Tage sind'} heuer verfallen.
                </span>
              )}
            </span>
          </div>

          <Pflichthinweis />

          <Button type="submit" loading={sendet} disabled={tage.length === 0}>
            Antrag einreichen
          </Button>
        </form>
      </Card>

      {/* Die Arbeitsliste der Genehmigenden steht VOR der eigenen Historie:
          hier wartet jemand auf eine Antwort. */}
      {darfEntscheiden && (
        <Card
          title={`Offene Anträge (${offene.length})`}
          hint={
            <>
              Eine Genehmigung trägt die Tage sofort ins Zeitkonto ein — als „Urlaub", mit vollem
              Tagessoll. Deshalb erscheint der Urlaub weder als fehlende Zeit auf der Startseite
              noch als Minus im Saldo. Tage, an denen bereits gebucht war, bleiben unangetastet,
              und eine Rücknahme entfernt nur die Tage, die durch die Genehmigung entstanden sind.
            </>
          }
        >
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
                      onClick={() => entscheiden(v, 'Genehmigt')}
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
                <Zustand stand={STAND[v.status]}>{v.status}</Zustand>
                {v.status === 'Beantragt' && (
                  <Button
                    variant="ghost"
                    loading={arbeitet === v.id}
                    onClick={() => setZurueckzuziehen(v)}
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

      {zurueckzuziehen && (
        <ConfirmDialog
          open
          title="Antrag zurückziehen?"
          confirmLabel="Zurückziehen"
          onConfirm={() => zurueckziehen(zurueckzuziehen)}
          onCancel={() => setZurueckzuziehen(null)}
        >
          <p>
            {zeitraum(zurueckzuziehen)} — der Antrag wird gelöscht und
            verschwindet aus der Liste der offenen Anträge. Ein neuer Antrag
            für denselben Zeitraum ist jederzeit möglich.
          </p>
        </ConfirmDialog>
      )}

    </div>
  );
}
