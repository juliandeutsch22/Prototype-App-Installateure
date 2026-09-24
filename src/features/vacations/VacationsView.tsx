import { useEffect, useMemo, useState, type FormEvent } from 'react';
import { useAuth } from '@/app/AuthContext';
import {
  listOwnVacations,
  listOpenVacations,
  createVacation,
  deleteVacation,
  entscheiden as urlaubEntscheiden,
} from '@/lib/db/vacations';
import { getUserByUid } from '@/lib/db/users';
import {
  krankmeldungSpeichern,
  listEigeneKrankmeldungen,
  listBetriebsurlaubeAb,
} from '@/lib/db/abwesenheiten';
import { darfUrlaubEntscheiden, canEditTime } from '@/lib/permissions';
import { postenNeuLaden } from '@/app/offenePosten';
import {
  todayStr,
  urlaubsTage,
  urlaubsStand,
  uebertragsRegel,
  urlaubsJahrVon,
  JAHRESBEGINN_VORGABE,
  fmtMin,
  type SaldoResult,
} from '@/lib/time';
import type { AppUser, Betriebsurlaub, Krankmeldung, Vacation } from '@/types';
import type { WithId } from '@/lib/db/core';
import InfoHint from '@/components/InfoHint';
import Metric, { MetricRow } from '@/components/Metric';
import Card from '@/components/Card';
import Button from '@/components/Button';
import { Zustand, type Stand } from '@/components/Badge';
import PageHeader from '@/components/PageHeader';
import ConfirmDialog from '@/components/ConfirmDialog';
import { InputField, SelectField, CheckboxField, FormGrid, Pflichthinweis } from '@/components/Field';
import { List, ListRow } from '@/components/ListRow';
import { useToast } from '@/components/Toast';
import { ErrorState, EmptyState, SkeletonList } from '@/components/States';
import { zeitguthabenLaden } from './zeitguthaben';
import { KrankmeldungListe, KrankenstaendeReiter } from './Krankmeldungen';
import { ergebnisText, tageText } from './abwesenheitText';
import BetriebsurlaubReiter from './BetriebsurlaubReiter';

/** 'YYYY-MM-DD' -> '15.06.2026'. */
function fmt(iso: string): string {
  if (!iso) return '—';
  return new Date(`${iso}T00:00:00`).toLocaleDateString('de-AT', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  });
}

function zeitraum(v: Pick<Vacation, 'von' | 'bis'>): string {
  return v.von === v.bis ? fmt(v.von) : `${fmt(v.von)} – ${fmt(v.bis)}`;
}

const istZa = (v: Pick<Vacation, 'art'>) => v.art === 'Zeitausgleich';

/** „13:00" aus „13:00" oder „13:00:00". */
const hhmm = (t?: string | null) => (t ?? '').slice(0, 5);

/** Stunden mit Komma: 4 → „4", 7,5 → „7,5". */
const std = (h: number) => h.toLocaleString('de-AT', { maximumFractionDigits: 2 });

/**
 * Was ein ZA-Antrag kostet, in Worten — für die Listen.
 *
 * „ZA – 4 Std. (13:00–17:00)" oder „ZA – 2 Tage (16 Std.)". Beim Urlaub
 * bleibt es bei den Arbeitstagen, wie bisher.
 */
function umfang(v: Vacation): string {
  if (!istZa(v)) return `${v.tage} ${v.tage === 1 ? 'Arbeitstag' : 'Arbeitstage'}`;
  const stunden = v.zaStunden != null ? `${std(Number(v.zaStunden))} Std.` : '';
  if (v.zaVon && v.zaBis) return `ZA – ${stunden} (${hhmm(v.zaVon)}–${hhmm(v.zaBis)})`;
  return `ZA – ${v.tage} ${v.tage === 1 ? 'Tag' : 'Tage'}${stunden ? ` (${stunden})` : ''}`;
}

/** Minuten zwischen 'HH:MM' und 'HH:MM'; negativ, wenn verdreht. */
function spanne(von: string, bis: string): number {
  const [h1, m1] = von.split(':').map(Number);
  const [h2, m2] = bis.split(':').map(Number);
  return h2 * 60 + m2 - (h1 * 60 + m1);
}

/** Saldo in Stunden → „+12:30" / „−3:30". */
const vorzeichen = (min: number) => (min >= 0 ? `+${fmtMin(min)}` : `−${fmtMin(-min)}`);

type Art = 'Urlaub' | 'Zeitausgleich' | 'Krank';
type Reiter = 'antraege' | 'krank' | 'betrieb';

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
   * Ausgangszustand. Dieselbe Regel steht in `app.darf_urlaub_entscheiden()`
   * und damit in der Datenbankfunktion, die tatsächlich entscheidet.
   */
  const darfEntscheiden = user
    ? darfUrlaubEntscheiden(user.role, user.uid, company?.vacationApprovers)
    : false;
  /** Buchhaltung und Spitze: Krankenstände und Betriebsurlaub. */
  const buero = user ? canEditTime(user.role) : false;
  const [reiter, setReiter] = useState<Reiter>('antraege');

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

  /** Urlaub, Zeitausgleich oder Krankmeldung. */
  const [art, setArt] = useState<Art>('Urlaub');
  const [zaStundenweise, setZaStundenweise] = useState(false);
  const [zaVon, setZaVon] = useState('13:00');
  const [zaBis, setZaBis] = useState('17:00');
  /** Das eigene Zeitguthaben — geladen, sobald Zeitausgleich gewählt ist. */
  const [guthaben, setGuthaben] = useState<SaldoResult | 'laedt' | 'fehler' | null>(null);
  const [eigeneKrank, setEigeneKrank] = useState<WithId<Krankmeldung>[]>([]);
  const [betriebsurlaube, setBetriebsurlaube] = useState<WithId<Betriebsurlaub>[]>([]);

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
        /*
          NEBENBEI, UND STILL BEI EINEM FEHLER: die eigenen Krankmeldungen und
          der kommende Betriebsurlaub sind Zusatzauskünfte. Scheitern sie,
          darf der Antrag trotzdem gehen.
        */
        listEigeneKrankmeldungen(user.companyId, user.uid)
          .then(setEigeneKrank)
          .catch(() => setEigeneKrank([]));
        listBetriebsurlaubeAb(user.companyId, todayStr())
          .then(setBetriebsurlaube)
          .catch(() => setBetriebsurlaube([]));
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
  /*
    DAS LAUFENDE URLAUBSJAHR, nicht das laufende Kalenderjahr.

    Beginnt das Urlaubsjahr des Betriebs nicht am 1. Jänner, sind das zwei
    verschiedene Zahlen — und die Kalenderjahreszahl zeigte im halben Jahr
    einen Anspruch, der noch gar nicht entstanden ist. Bei der Vorgabe
    (Kalenderjahr) kommt dieselbe Zahl heraus wie vorher.
  */
  const regel = useMemo(() => uebertragsRegel(company), [company]);
  const jahr = urlaubsJahrVon(todayStr(), regel.jahresbeginn);
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
          // Zeitausgleich geht vom Zeitguthaben ab, nicht vom Urlaub.
          .filter((v) => v.status === 'Genehmigt' && !istZa(v))
          .map((v) => ({ von: v.von, tage: v.tage })),
        regel,
      ),
    [eigene, jahr, profil, regel],
  );
  const genommen = stand.genommen;
  const anspruch = stand.anspruch;

  /** Eigene Urlaubsanträge, über die noch niemand entschieden hat. */
  const beantragt = useMemo(
    () =>
      eigene
        .filter((v) => v.status === 'Beantragt' && !istZa(v))
        .reduce((summe, v) => summe + (Number(v.tage) || 0), 0),
    [eigene],
  );

  /*
    DER REST IM URLAUBSJAHR DES ANTRAGS. Wer im Dezember für Jänner plant,
    zieht vom neuen Anspruch ab, nicht vom alten — bei einem Urlaubsjahr ab
    Juli entsprechend. Liegt der Antrag im laufenden Jahr, ist es dieselbe
    Zahl wie oben.
  */
  const antragsJahr = urlaubsJahrVon(von, regel.jahresbeginn);
  const restImAntragsjahr = useMemo(
    () =>
      antragsJahr === jahr || !profil
        ? stand.rest
        : urlaubsStand(
            profil,
            antragsJahr,
            eigene
              .filter((v) => v.status === 'Genehmigt' && !istZa(v))
              .map((v) => ({ von: v.von, tage: v.tage })),
            regel,
          ).rest,
    [antragsJahr, jahr, profil, stand.rest, eigene, regel],
  );

  /**
   * DER RESTURLAUB DER ANTRAGSTELLER — für die, die entscheiden.
   *
   * Ohne ihn genehmigt man blind: ob der Monteur noch drei oder dreissig Tage
   * hat, stand bisher nirgends auf dieser Seite. Gerechnet wird wie beim
   * Antragsteller selbst (`urlaubsStand`); lesen dürfen es die Genehmigenden
   * ohnehin — Profil und Urlaube der Belegschaft.
   */
  const [antragsteller, setAntragsteller] = useState<
    Record<string, { profil: AppUser; genehmigt: { von: string; tage: number }[] } | 'fehler'>
  >({});
  useEffect(() => {
    if (!user || !darfEntscheiden) return;
    const uids = [...new Set(offene.filter((v) => !istZa(v)).map((v) => v.userId))];
    if (uids.length === 0) return;
    let weg = false;
    void Promise.all(
      uids.map(async (uid) => {
        try {
          const [p, urlaube] = await Promise.all([
            getUserByUid(user.companyId, uid),
            listOwnVacations(user.companyId, uid, 500),
          ]);
          if (!p) return [uid, 'fehler'] as const;
          return [
            uid,
            {
              profil: p,
              genehmigt: urlaube
                .filter((v) => v.status === 'Genehmigt' && !istZa(v))
                .map((v) => ({ von: v.von, tage: v.tage })),
            },
          ] as const;
        } catch {
          return [uid, 'fehler'] as const;
        }
      }),
    ).then((paare) => {
      if (!weg) setAntragsteller(Object.fromEntries(paare));
    });
    return () => {
      weg = true;
    };
  }, [user, darfEntscheiden, offene]);

  /** Resturlaub vor und nach diesem Antrag, im Urlaubsjahr seines Beginns. */
  function restZeile(v: WithId<Vacation>) {
    const a = antragsteller[v.userId];
    if (!a) return null;
    if (a === 'fehler') {
      return (
        <span className="mt-1 block text-xs text-ink-muted">Resturlaub konnte nicht ermittelt werden.</span>
      );
    }
    const rest = urlaubsStand(a.profil, urlaubsJahrVon(v.von, regel.jahresbeginn), a.genehmigt, regel).rest;
    const danach = rest - (Number(v.tage) || 0);
    return (
      <span className={`tnum mt-1 block text-xs ${danach < 0 ? 'font-medium text-warning' : 'text-ink-muted'}`}>
        Resturlaub: {tageText(rest)} — nach Genehmigung {tageText(danach)}
        {danach < 0 ? ' (reicht nicht)' : ''}
      </span>
    );
  }

  /**
   * Wie das laufende Urlaubsjahr heisst.
   *
   * „In diesem Jahr" ist beim Kalenderjahr eindeutig und sonst nicht: wer im
   * März liest, sein Anspruch gelte für „dieses Jahr", denkt an 2027 — dabei
   * läuft bei einem Urlaubsjahr ab Juli noch das von 2026. Deshalb steht der
   * Zeitraum dann ausgeschrieben da. Beim Kalenderjahr bleibt der Satz, wie
   * er war; eine zusätzliche Angabe wäre dort nur Lärm.
   */
  const jahresName =
    regel.jahresbeginn === JAHRESBEGINN_VORGABE
      ? 'In diesem Jahr'
      : `Im Urlaubsjahr ${jahr}/${String((jahr + 1) % 100).padStart(2, '0')}`;

  useEffect(() => {
    if (art !== 'Zeitausgleich' || !profil) return;
    let weg = false;
    setGuthaben('laedt');
    zeitguthabenLaden(profil)
      .then((g) => {
        if (!weg) setGuthaben(g);
      })
      .catch(() => {
        if (!weg) setGuthaben('fehler');
      });
    return () => {
      weg = true;
    };
  }, [art, profil]);

  /** Der Tag, an dem der stundenweise ZA liegt, muss ein Arbeitstag sein. */
  const zaTage = useMemo(
    () => (profil ? urlaubsTage(profil, von, zaStundenweise ? von : bis) : []),
    [profil, von, bis, zaStundenweise],
  );
  const tagessollMin = profil
    ? ((Number(profil.weeklyTargetHours ?? 40) || 40) / (profil.workDays?.length || 5)) * 60
    : 0;
  /** Was der Zeitausgleich an Zeitguthaben kostet, in Minuten. */
  const zaMin = zaStundenweise
    ? Math.max(0, spanne(zaVon, zaBis))
    : Math.round(zaTage.length * tagessollMin);

  async function beantragen(e: FormEvent) {
    e.preventDefault();
    if (!user || !profil) return;
    if (art === 'Krank') {
      await krankMelden();
      return;
    }
    if (art === 'Zeitausgleich') {
      await zaBeantragen();
      return;
    }
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
        art: 'Urlaub',
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
   * Zeitausgleich beantragen — wie Urlaub, mit Stunden statt Tagen.
   *
   * Das Zeitguthaben wird GEZEIGT und mitgeschickt, aber nicht zur Sperre:
   * ob jemand ins Minus gehen darf, entscheidet der Genehmigende. Er sieht
   * die Zahl beim Antrag.
   */
  async function zaBeantragen() {
    if (!user || !profil) return;
    const bisTag = zaStundenweise ? von : bis;
    if (zaTage.length === 0) {
      setError(
        bisTag < von
          ? 'Das Ende liegt vor dem Beginn.'
          : 'In diesem Zeitraum liegt kein Arbeitstag — da braucht es keinen Zeitausgleich.',
      );
      return;
    }
    if (zaStundenweise && spanne(zaVon, zaBis) <= 0) {
      setError('„Frei bis" muss nach „Frei von" liegen.');
      return;
    }
    const kollision = eigene.find(
      (v) => (v.status === 'Beantragt' || v.status === 'Genehmigt') && v.von <= bisTag && v.bis >= von,
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
        bis: bisTag,
        tage: zaTage.length,
        status: 'Beantragt',
        art: 'Zeitausgleich',
        zaVon: zaStundenweise ? zaVon : null,
        zaBis: zaStundenweise ? zaBis : null,
        zaStunden: Math.round((zaMin / 60) * 100) / 100,
        saldoBeiAntrag:
          guthaben && typeof guthaben === 'object' && guthaben.hasConfig ? guthaben.saldoH : null,
        notiz: notiz.trim(),
      });
      toast.success('Antrag auf Zeitausgleich eingereicht');
      setNotiz('');
      await laden_();
    } catch {
      setError('Der Antrag konnte nicht eingereicht werden.');
    } finally {
      setSendet(false);
    }
  }

  /**
   * Krank melden — ohne Genehmigung.
   *
   * Krank ist man; das beantragt niemand. Die Tage stehen sofort im
   * Zeitkonto, das Büro sieht die Meldung.
   */
  async function krankMelden() {
    if (!user) return;
    if (bis < von) {
      setError('Das Ende liegt vor dem Beginn.');
      return;
    }
    setSendet(true);
    setError(null);
    try {
      const r = await krankmeldungSpeichern({ von, bis, notiz: notiz.trim(), melderName: user.name });
      toast.success(`Krankmeldung eingetragen — ${ergebnisText(r)}. Gute Besserung!`);
      setNotiz('');
      setEigeneKrank(await listEigeneKrankmeldungen(user.companyId, user.uid).catch(() => eigeneKrank));
    } catch (err) {
      setError(err instanceof Error && err.message ? err.message : 'Die Krankmeldung konnte nicht eingetragen werden.');
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
      const data = await urlaubEntscheiden({
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

  /** Das Zeitguthaben beim ZA-Antrag — Zahl und Einschätzung. */
  function guthabenZeile() {
    if (guthaben === 'laedt' || guthaben === null) {
      return <span className="block text-xs">Zeitguthaben wird geladen …</span>;
    }
    if (guthaben === 'fehler') {
      return (
        <span className="block text-xs text-warning">
          Das Zeitguthaben konnte nicht geladen werden — der Antrag geht trotzdem.
        </span>
      );
    }
    if (!guthaben.hasConfig) {
      return (
        <span className="block text-xs">
          Für dieses Konto wird kein Zeitguthaben geführt — der Genehmigende entscheidet ohne Zahl.
        </span>
      );
    }
    const jetzt = Math.round(guthaben.saldoH * 60);
    const danach = jetzt - zaMin;
    if (jetzt > 0 && danach >= 0) {
      return (
        <span className="mt-1 flex flex-wrap items-center gap-2 text-xs">
          <Zustand stand="gut">ausreichend Zeitguthaben</Zustand>
          <span className="tnum">
            {vorzeichen(jetzt)} Std., danach {vorzeichen(danach)} Std.
          </span>
        </span>
      );
    }
    return (
      <span className="mt-1 block text-xs font-medium text-warning" role="alert">
        {jetzt <= 0
          ? `Kein Zeitguthaben (${vorzeichen(jetzt)} Std.) — der Zeitausgleich ginge ins Minus.`
          : `Das Zeitguthaben (${vorzeichen(jetzt)} Std.) reicht nicht — danach stünden ${vorzeichen(danach)} Std.`}{' '}
        Beantragen geht trotzdem; entschieden wird bei der Genehmigung.
      </span>
    );
  }

  const REITER: { key: Reiter; label: string }[] = [
    { key: 'antraege', label: 'Anträge' },
    { key: 'krank', label: 'Krankenstände' },
    { key: 'betrieb', label: 'Betriebsurlaub' },
  ];

  return (
    <div className="space-y-6">
      <PageHeader title="Urlaub" subtitle="Urlaub, Zeitausgleich und Krankmeldung" />

      {/*
        DIE BÜRO-REITER nur für Buchhaltung und Spitze: Krankenstände sind
        Gesundheitsdaten, und den Betrieb zusperren ist deren Sache. Alle
        anderen sehen die Seite wie bisher, ohne Reiterleiste.
      */}
      {buero && (
        <div className="flex gap-1 overflow-x-auto border-b border-line" role="tablist">
          {REITER.map((r) => (
            <button
              key={r.key}
              role="tab"
              aria-selected={reiter === r.key}
              onClick={() => setReiter(r.key)}
              className={`flex min-h-touch shrink-0 items-center gap-2 border-b-2 px-3 py-2 text-sm transition sm:px-4 ${
                reiter === r.key
                  ? 'border-b-accent-deep font-bold text-accent-deep'
                  : 'border-b-transparent font-medium text-ink-muted hover:text-ink'
              }`}
            >
              {r.label}
            </button>
          ))}
        </div>
      )}

      {buero && reiter === 'krank' && <KrankenstaendeReiter companyId={user.companyId} meinName={user.name} />}
      {buero && reiter === 'betrieb' && <BetriebsurlaubReiter companyId={user.companyId} meinName={user.name} />}

      {(!buero || reiter === 'antraege') && (
      <>
      {error && <ErrorState message={error} />}

      {/*
        DER EIGENE RESTURLAUB, gleich oben: das ist die Frage, mit der man
        diese Seite öffnet. Wie er zustande kommt (Übertrag, Anfangsbestand,
        verfallene Tage), steht beim Antrag darunter.
      */}
      {profil && !laden && (
        <MetricRow>
          <Metric
            label="Resturlaub"
            value={tageText(stand.rest)}
            tone={stand.rest < 0 ? 'warning' : 'brand'}
            hint={`${genommen} von ${anspruch} genehmigt`}
          />
          {beantragt > 0 && (
            <Metric label="Beantragt" value={tageText(beantragt)} hint="noch nicht entschieden" />
          )}
        </MetricRow>
      )}

      <Card title={art === 'Krank' ? 'Krank melden' : 'Antrag stellen'}>
        {/*
          KOMMENDER BETRIEBSURLAUB steht hier, wo jemand seinen Urlaub plant —
          sonst beantragt er Tage, die ohnehin zu sind.
        */}
        {betriebsurlaube.length > 0 && (
          <p className="mb-4 rounded-sm border border-line bg-surface-2 px-3 py-2 text-sm text-info">
            {betriebsurlaube.map((b) => (
              <span key={b.id} className="block">
                <strong>{b.bezeichnung}</strong> {zeitraum(b)}
                {b.urlaubAbbuchen ? ' — wird vom Urlaub abgebucht' : ''}
              </span>
            ))}
          </p>
        )}
        <form onSubmit={beantragen} className="space-y-4">
          <SelectField
            id="uart"
            label="Art"
            value={art}
            onChange={(e) => {
              setArt(e.target.value as Art);
              setError(null);
            }}
          >
            <option value="Urlaub">Urlaub</option>
            <option value="Zeitausgleich">Zeitausgleich</option>
            <option value="Krank">Krankmeldung</option>
          </SelectField>

          {art === 'Zeitausgleich' && (
            <CheckboxField
              id="uzastunden"
              label="Nur einige Stunden (an einem Tag)"
              checked={zaStundenweise}
              onChange={(e) => setZaStundenweise(e.target.checked)}
            />
          )}

          <FormGrid>
            <InputField
              id="uvon"
              label={art === 'Krank' ? 'Krank ab' : art === 'Zeitausgleich' && zaStundenweise ? 'Tag' : 'Von'}
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
            {!(art === 'Zeitausgleich' && zaStundenweise) && (
              <InputField
                id="ubis"
                label={art === 'Krank' ? 'Voraussichtlich bis' : 'Bis (einschließlich)'}
                type="date"
                value={bis}
                min={von}
                onChange={(e) => setBis(e.target.value)}
                required
                pflicht
              />
            )}
          </FormGrid>
          {art === 'Zeitausgleich' && zaStundenweise && (
            <FormGrid>
              <InputField
                id="uzavon"
                label="Frei von"
                type="time"
                value={zaVon}
                onChange={(e) => setZaVon(e.target.value)}
                required
                pflicht
              />
              <InputField
                id="uzabis"
                label="Frei bis"
                type="time"
                value={zaBis}
                onChange={(e) => setZaBis(e.target.value)}
                required
                pflicht
              />
            </FormGrid>
          )}
          <InputField
            id="unotiz"
            label={art === 'Krank' ? 'Anmerkung (freiwillig, keine Diagnose)' : 'Anmerkung (freiwillig)'}
            value={notiz}
            onChange={(e) => setNotiz(e.target.value)}
          />

          {/*
            Die ZAHL bleibt sichtbar — sie ändert sich mit jeder Eingabe und
            ist der eigentliche Inhalt dieses Kastens. Warum sie so
            zustandekommt, steht hinter dem „i": das ist einmal interessant
            und danach nur noch lang.
          */}
          {art === 'Urlaub' && (
          <div className="flex flex-wrap items-center rounded-sm border border-line bg-surface-2 px-3 py-2 text-sm text-info">
            <strong className="tnum">
              {tage.length} {tage.length === 1 ? 'Arbeitstag' : 'Arbeitstage'}
            </strong>
            <span className="ml-1">in diesem Zeitraum</span>
            <span className="tnum ml-1">
              — danach bleiben {tageText(restImAntragsjahr - tage.length)}
              {antragsJahr !== jahr ? ` im Urlaubsjahr ${antragsJahr}` : ''}.
            </span>
            <InfoHint about="Arbeitstage">
              Gezählt werden nur die Tage, an denen dieser Mitarbeiter ohnehin arbeiten würde.
              Wochenenden, gesetzliche Feiertage und freie Wochentage bei Teilzeit fallen heraus:
              Wer eine Woche mit Feiertag nimmt, verbraucht vier Tage, nicht fünf.
            </InfoHint>
            <span className="mt-1 block basis-full text-xs">
              {jahresName} genehmigt: <span className="tnum">{genommen}</span> von{' '}
              <span className="tnum">{anspruch}</span> Tagen
              {/* Eine richtige Zahl mit falscher Erklärung ist auch eine
                  falsche Auskunft: „von 25" stimmt weder im Umstiegsjahr
                  (dort sind es die mitgebrachten Tage) noch dort, wo ein
                  Übertrag aus dem Vorjahr dabei ist. */}
              {stand.ausAnfangsbestand
                ? ' (Restanspruch beim Umstieg).'
                : stand.uebertrag > 0
                  ? `, davon ${stand.uebertrag} aus dem vorigen Urlaubsjahr.`
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
          )}

          {art === 'Zeitausgleich' && (
            <div className="flex flex-wrap items-center rounded-sm border border-line bg-surface-2 px-3 py-2 text-sm text-info">
              <strong className="tnum">{std(zaMin / 60)} Std.</strong>
              <span className="ml-1">
                Zeitausgleich
                {zaStundenweise
                  ? ''
                  : ` (${zaTage.length} ${zaTage.length === 1 ? 'Arbeitstag' : 'Arbeitstage'})`}
                .
              </span>
              <InfoHint about="Zeitausgleich">
                Zeitausgleich geht vom Zeitguthaben (Überstunden), nicht vom Urlaub. Ein ganzer Tag
                kostet das Tagessoll, stundenweise genau die freien Stunden. Nach der Genehmigung
                steht er im Zeitkonto und im Wochenplan.
              </InfoHint>
              <span className="basis-full">{guthabenZeile()}</span>
            </div>
          )}

          {art === 'Krank' && (
            <p className="rounded-sm border border-line bg-surface-2 px-3 py-2 text-sm text-info">
              Eine Krankmeldung braucht keine Genehmigung: die Tage stehen sofort als „Krank" im
              Zeitkonto, und das Büro sieht die Meldung. Ist das Ende noch offen, das
              voraussichtliche eintragen — ändern geht jederzeit.
            </p>
          )}

          <Pflichthinweis />

          <Button
            type="submit"
            loading={sendet}
            disabled={
              art === 'Urlaub' ? tage.length === 0 : art === 'Zeitausgleich' ? zaTage.length === 0 : false
            }
          >
            {art === 'Krank' ? 'Krank melden' : 'Antrag einreichen'}
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
              Eine Genehmigung trägt die Tage sofort ins Zeitkonto ein — Urlaub mit vollem
              Tagessoll, Zeitausgleich ohne Ist (er geht vom Zeitguthaben ab). Deshalb erscheint
              beides weder als fehlende Zeit auf der Startseite noch als falsches Minus im Saldo.
              Tage, an denen bereits gebucht war, bleiben unangetastet, und eine Rücknahme entfernt
              nur die Tage, die durch die Genehmigung entstanden sind.
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
                const saldoMin = v.saldoBeiAntrag != null ? Math.round(Number(v.saldoBeiAntrag) * 60) : null;
                const kostet = v.zaStunden != null ? Math.round(Number(v.zaStunden) * 60) : 0;
                return (
                  <ListRow
                    key={v.id}
                    title={v.userName}
                    subtitle={
                      <>
                        <span className="tnum block">
                          {zeitraum(v)} · {istZa(v) ? umfang(v) : `${v.tage} ${v.tage === 1 ? 'Tag' : 'Tage'}`}
                        </span>
                        {v.notiz && <span className="mt-1 block">{v.notiz}</span>}
                        {!istZa(v) && restZeile(v)}
                        {/*
                          DAS ZEITGUTHABEN BEIM ANTRAG — die Zahl, nach der
                          beim Zeitausgleich entschieden wird.
                        */}
                        {istZa(v) && saldoMin !== null && (
                          <span
                            className={`tnum mt-1 block text-xs ${
                              saldoMin - kostet < 0 ? 'font-medium text-warning' : 'text-ink-muted'
                            }`}
                          >
                            Zeitguthaben beim Antrag: {vorzeichen(saldoMin)} Std.
                            {saldoMin - kostet < 0 ? ' — reicht nicht' : ''}
                          </span>
                        )}
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
          <EmptyState>Noch kein Antrag gestellt.</EmptyState>
        ) : (
          <List>
            {eigene.map((v) => (
              <ListRow
                key={v.id}
                title={<span className="tnum">{zeitraum(v)}</span>}
                subtitle={
                  <>
                    <span className="block">
                      {umfang(v)}
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

      {eigeneKrank.length > 0 && (
        <Card title="Meine Krankmeldungen">
          <KrankmeldungListe
            meldungen={eigeneKrank}
            mitNamen={false}
            meinName={user.name}
            onGeaendert={() =>
              void listEigeneKrankmeldungen(user.companyId, user.uid)
                .then(setEigeneKrank)
                .catch(() => undefined)
            }
          />
        </Card>
      )}

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
      </>
      )}
    </div>
  );
}
