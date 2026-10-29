import { useMemo } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '@/app/AuthContext';
import { useModul } from '@/lib/useModule';
import { localDateStr, todayStr, getISOWeek } from '@/lib/time';
import { getAustrianHolidayName } from '@shared/feiertage';
import { datumAT } from '@/lib/datum';
import {
  fuehrtZeitkonto,
  canProcessOrders,
  isGF,
  isTopLevel,
  canInvoice,
  canEditTime,
  isMitarbeiter,
  canWriteWorkSheet,
  darfUrlaubEntscheiden,
  darfEinkaufSehen,
} from '@/lib/permissions';
import { canAccess, zusatzrechte } from '@/app/navigation';
import Card from '@/components/Card';
import Hinweiszeile from '@/components/Hinweiszeile';
import LotZeichnung from '@/components/LotZeichnung';
import PageHeader from '@/components/PageHeader';
import { SkeletonList, SkeletonMetrics } from '@/components/States';
import { rolleAnzeige } from '@/lib/rolleAnzeige';
import LaufWarnung from './LaufWarnung';
import WartungHinweis from './WartungHinweis';
import Handlungsbedarf from './start/Handlungsbedarf';
import Kennzahlen from './start/Kennzahlen';
import HeuteEigene from './start/HeuteEigene';
import HeuteLeitung from './start/HeuteLeitung';
import HeuteListe from './start/HeuteListe';
import TermineHeute from './start/TermineHeute';
import { startseite } from './start/aufbau';
import { grundpfad, ZIEL } from './start/ziele';
import {
  buchhaltung,
  einstellungen,
  lager,
  leitung,
  persoenlich,
  startRolle,
  team,
  termineHeute,
  type Kontext,
  type StartDaten,
  type StartRolle,
} from './start/laden';
import { listUsers } from '@/lib/db/users';
import { schluessel, useZwischengespeichert } from '@/lib/zwischenspeicher';

/**
 * Kennzahlen bleiben über der Arbeit; Aufgaben und Tageskontext verwenden
 * weiterhin dieselben rollen- und modulabhängigen Daten. Beim Monteur steht
 * der eigene Einsatz vor den Nachträgen. Der Kontext bleibt bei wenig Arbeit
 * sichtbar und entfällt ganz, wenn er nichts enthält.
 */
const KEINE_DATEN: StartDaten = {};
const KEINE_NAMEN: string[] = [];

export default function DashboardView() {
  const { user, company, einblick } = useAuth();
  const scheineAn = useModul('scheine');
  const materialAn = useModul('material');
  const rechnungenAn = useModul('rechnungen');
  const wartungAn = useModul('wartung');
  const urlaubAn = useModul('urlaub');
  const einsatzAn = useModul('einsatzplanung');
  const rolle: StartRolle = user ? startRolle(user.role) : 'monteur';
  const mitZeitkonto = user ? fuehrtZeitkonto(user) : false;
  const heute = todayStr();

  const darf = useMemo(() => {
    const zusatz = zusatzrechte(user, company);
    return (ziel: string) => !!user && canAccess(user.role, grundpfad(ziel), company?.modules, zusatz);
  }, [user, company]);
  const urlaubEntscheiden = !!user && urlaubAn && darfUrlaubEntscheiden(user.role, user.uid, company?.vacationApprovers);
  /*
    Sonderurlaub bestätigen Büro und Spitze (Plan 10.3) — seit A15
    (24.10.2026) auch ohne das Modul Urlaub: die Pflegefreistellung ist ein
    gesetzlicher Anspruch. Dann führt der Abschnitt auf die eigene Seite.
  */
  const freistellungBestaetigen = !!user && canEditTime(user.role);
  const sonderurlaubZiel = urlaubAn ? undefined : ZIEL.sonderurlaub;

  /*
    ALLE LADEBLÖCKE IN EINER ABFRAGE, ZWISCHENGESPEICHERT (Stufe 3,
    `lib/zwischenspeicher.ts`). Erscheinen tun sie seit Stufe 2 ohnehin
    zusammen; so steht beim zweiten Besuch sofort der letzte Stand da, und im
    Hintergrund wird frisch geholt. Der Schlüssel enthält alles, wovon die
    Blöcke abhängen — ändert sich etwas davon, wird neu geladen wie bisher.

    WELCHER TEIL NICHT KAM — und dass es jemand erfährt. Jeder Block für
    sich: fällt die Buchhaltung aus, sieht der Monteur trotzdem, wo er heute
    hin muss, und die Seite sagt, was fehlt. Eine Startseite, die weniger
    zeigt als sonst, sähe sonst aus wie ein ruhiger Tag.
  */
  const abfrage = useZwischengespeichert<{ data: StartDaten; nichtGeladen: string[] }>({
    queryKey: user
      ? schluessel('startseite', user, heute, { user, company, mitZeitkonto, materialAn, scheineAn, rechnungenAn, wartungAn, einsatzAn, urlaubEntscheiden, freistellungBestaetigen })
      : ['startseite'],
    enabled: !!user,
    queryFn: async () => {
      if (!user) return { data: {}, nichtGeladen: [] };
      // Die Belegschaft einmal für alle Blöcke dieses Aufbaus.
      let belegschaft: ReturnType<typeof listUsers> | null = null;
      const k: Kontext = {
        user, company, heute: todayStr(),
        belegschaft: () => (belegschaft ??= listUsers(user.companyId)),
      };
      const r = startRolle(user.role);
      const bloecke: [string, () => Promise<Partial<StartDaten>>][] = [];
      if (mitZeitkonto || isMitarbeiter(user.role)) {
        bloecke.push(['Deine Tage und Einsätze', () => persoenlich(k, {
          material: materialAn,
          scheine: scheineAn && r === 'monteur',
          kennzahlen: r === 'monteur',
          // Nach dem Alter, nicht nach der Rolle (A8, 24.10.2026): auch ein Bürolehrling ist jugendlich.
          jugendschutz: true,
        })]);
      }
      if (materialAn && canProcessOrders(user.role)) {
        const lagerSelbst = r === 'verwaltung' || r === 'leitung';
        bloecke.push(['Anforderungen und Lager', () => lager(k, {
          posten: lagerSelbst && darfEinkaufSehen(user),
          bestand: lagerSelbst,
        })]);
      }
      if (canInvoice(user.role) && (rechnungenAn || scheineAn)) {
        bloecke.push(['Rechnungen und Scheine', () => buchhaltung(k, { rechnungen: rechnungenAn, scheine: scheineAn })]);
      }
      if (canEditTime(user.role) || urlaubEntscheiden) {
        bloecke.push(['Die Mannschaft', () => team(k, {
          luecken: canEditTime(user.role), urlaub: urlaubEntscheiden, freistellungen: freistellungBestaetigen,
        })]);
      }
      if (isGF(user.role)) {
        bloecke.push(['Baustellen und Einsätze', () => leitung(k, { einsatzplanung: einsatzAn, wartung: wartungAn, budget: true })]);
      }
      // Termine gehören zur Einsatzplanung (Plan 10.4) — jede Rolle kann Teilnehmer sein.
      if (einsatzAn) {
        bloecke.push(['Deine Termine', () => termineHeute(k)]);
      }
      if (isTopLevel(user.role)) {
        bloecke.push(['Einstellungen', () => einstellungen(k, { rechnungen: rechnungenAn, konten: true, personen: true })]);
      } else if (r === 'buchhaltung' && rechnungenAn) {
        // Den Basiszinssatz pflegt die Buchhaltung selbst (Paket 2, 03.10.2026).
        bloecke.push(['Einstellungen', () => einstellungen(k, { rechnungen: true, konten: false, personen: false })]);
      }

      const data: StartDaten = {};
      const nichtGeladen: string[] = [];
      const ergebnisse = await Promise.allSettled(bloecke.map(([, lauf]) => Promise.resolve().then(lauf)));
      ergebnisse.forEach((e, i) => {
        if (e.status === 'fulfilled') Object.assign(data, e.value);
        else nichtGeladen.push(bloecke[i][0]);
      });
      return { data, nichtGeladen };
    },
  });
  // Feste leere Werte: ein neues `{}` je Zeichnen rechnete die Seite jedes Mal neu.
  const data = abfrage.data?.data ?? KEINE_DATEN;
  const nichtGeladen = abfrage.data?.nichtGeladen ?? KEINE_NAMEN;

  const seite = useMemo(
    () => startseite(data, { rolle, heute, jetzt: Date.now(), darf, urlaubEntscheiden, freistellungBestaetigen, sonderurlaubZiel, ich: user?.uid }),
    [data, rolle, heute, darf, urlaubEntscheiden, freistellungBestaetigen, sonderurlaubZiel, user?.uid],
  );

  if (!user) return null;

  const kopf = (() => {
    const d = new Date();
    return {
      datum: `${d.toLocaleDateString('de-AT', { weekday: 'long' })}, ${datumAT(localDateStr(d))}`,
      kw: getISOWeek(d).week,
      feiertag: getAustrianHolidayName(d),
    };
  })();

  // Bis zum ersten Stand — beim zweiten Besuch steht der letzte sofort da.
  const nochAmLaden = abfrage.isPending;
  const eigene = data.heuteEigene ?? [];
  const termine = data.termineHeute ?? [];
  const planVerweis = darf('/my-schedule');
  const scheinVerweis = scheineAn && canWriteWorkSheet(user.role);

  const vorname = user.name.trim().split(/\s+/)[0];
  const monteurMitEinsatz = rolle === 'monteur' && eigene.length > 0;
  const eigenerEinsatz = (
    <>
      {eigene.length > 0 && (
        <HeuteEigene
          einsaetze={eigene}
          letzteBuchung={data.letzteBuchung}
          materialAn={materialAn}
          scheinVerweis={scheinVerweis}
          planVerweis={planVerweis}
          titel="Dein Einsatz heute"
          zeitImKopf={monteurMitEinsatz}
        />
      )}
    </>
  );
  const tagesKontext = (
    <>
      {!monteurMitEinsatz && eigenerEinsatz}
      {termine.length > 0 && (
        <TermineHeute termine={termine} planVerweis={planVerweis} />
      )}
      {seite.heute?.art === 'liste' && (
        <HeuteListe zusatz={seite.heute.zusatz} zeilen={seite.heute.zeilen} verweis={seite.heute.verweis} />
      )}
      {seite.heute?.art === 'leitung' && (
        <HeuteLeitung heute={heute} abwesend={data.abwesendHeute ?? []} tag={data.heuteBetrieb ?? []} />
      )}
    </>
  );
  const hatKontext = (!monteurMitEinsatz && eigene.length > 0) || termine.length > 0 || !!seite.heute;
  const hatBedarf = seite.abschnitte.length > 0;

  return (
    <div className="start-seite space-y-3 lg:space-y-5" data-geladen={nochAmLaden ? 'nein' : 'ja'}>
      <div className="start-kopf">
        <PageHeader
          ort={<>Start · KW {kopf.kw}</>}
          title={rolle === 'monteur' ? `Dein Tag${vorname ? `, ${vorname}` : ''}` : 'Heute im Überblick'}
          action={monteurMitEinsatz ? (
            <Link
              to="/time"
              state={{ projectNumber: eigene[0].projectNumber, asHelper: eigene[0].asHelper }}
              className="start-hauptaktion"
            >
              Zeit erfassen
            </Link>
          ) : undefined}
          subtitle={
            <>
              {/* Umbrechen nur zwischen den Teilen (D13). */}
              <span className="whitespace-nowrap">{kopf.datum}</span> ·{' '}
              {company?.name ?? 'Installateur-App'} ·{' '}
              <span className="whitespace-nowrap">Rolle: {rolleAnzeige(user.role, einblick)}</span>
              {kopf.feiertag && (
                <>
                  {' · '}
                  <span className="font-semibold text-warning">{kopf.feiertag}</span>
                </>
              )}
            </>
          }
          /*
            Der Stand im Seitenkopf (E22, E24). Bis alle Blöcke da sind, ein
            Platzhalter in seiner Form; ist alles leer, fällt er weg.
          */
          stand={nochAmLaden
            ? <SkeletonMetrics />
            : seite.kennzahlen.some((k) => !k.leer) ? <Kennzahlen werte={seite.kennzahlen} /> : undefined}
        />
        {darf('/assignments/woche') && (
          <Link to="/assignments/woche" className="start-planaktion start-hauptaktion">Einsatzplanung</Link>
        )}
      </div>

      {/* Die Nachtläufe zuerst: ihr Schaden wächst mit der Zeit, statt aufzufallen. */}
      <LaufWarnung />

      {/* Die Verwaltung vereinbart Wartungstermine; bei der Leitung stehen sie unter „Zu erledigen“. */}
      {rolle === 'verwaltung' && <WartungHinweis />}

      {/* Ohne Eintrittsdatum lässt sich nicht sagen, welche Tage fehlen — gesagt, nicht verschwiegen. */}
      {mitZeitkonto && data.hatEintritt === false && (
        <Hinweiszeile>
          <p>
            <b>Kein Eintrittsdatum hinterlegt</b> — Ohne Eintrittsdatum lässt sich nicht sagen,
            welche Tage fehlen und wie der Saldo steht. Die Geschäftsführung kann es in der
            Benutzerverwaltung nachtragen.
          </p>
        </Hinweiszeile>
      )}

      {/*
        ALLES AUF EINMAL, WENN ALLE BLÖCKE DA SIND (Analyse 10.10.2026).
        Vorher wuchs „Zu erledigen“ Block für Block — gemessen von 4 auf 10
        Themen, bei der Buchhaltung von 1 auf 66 Zeilen —, neue Punkte
        schoben sich dazwischen, und die Kennzahlen kamen nachträglich
        darüber. Jetzt stehen bis dahin Platzhalter in derselben Form;
        scheitert ein Block, sagt es der Hinweis darunter wie bisher.
      */}
      {nochAmLaden ? (
        <div className="space-y-3 lg:space-y-5">
          <Card>
            <SkeletonList rows={5} />
          </Card>
        </div>
      ) : (
        <div className="wert-erscheint space-y-3 lg:space-y-5">
          <div className={hatKontext ? 'start-rahmen' : 'start-einspaltig'}>
            <div className="start-arbeit start-breit">
              {monteurMitEinsatz && eigenerEinsatz}
              {hatBedarf ? (
                <Handlungsbedarf abschnitte={seite.abschnitte} zaehlwort={seite.zaehlwort} />
              ) : nichtGeladen.length > 0 ? (
                /*
                  NICHT ALLES KAM AN — DANN IST NICHTS „ERLEDIGT“. Vorher stand
                  hier auch dann „Heute liegt nichts an“, wenn ein Block nicht
                  geladen war; die Warnung darunter widersprach der Überschrift.
                  Ein fehlender Block ist keine leere Arbeit (Designlinie der
                  Zeichnungen, Regel 5: kein Erfolgsmotiv bei Ladefehlern).
                */
                <section className="start-leer" aria-label="Nicht vollständig geladen">
                  <h2>Aus den geladenen Bereichen steht nichts an.</h2>
                  <p>Nicht alles kam an — der Hinweis unten nennt, was fehlt. Ob dort etwas ansteht, zeigt erst ein neuer Versuch.</p>
                </section>
              ) : (
                <section className="start-leer" aria-label="Heute liegt nichts an">
                  <LotZeichnung motiv="fertig" art="leer" />
                  <h2>Heute liegt nichts an.</h2>
                  <p>{leerText(rolle)}</p>
                </section>
              )}
            </div>
            {hatKontext && (
              <aside className="start-kontext" aria-label="Dein Tagesüberblick">{tagesKontext}</aside>
            )}
          </div>
        </div>
      )}

      {/* Was nicht kam — unten, nach allem, was geladen wurde. */}
      {nichtGeladen.length > 0 && (
        <Hinweiszeile stufe="warn" role="status">
          <p>
            <strong>Nicht geladen: {nichtGeladen.join(' · ')}.</strong> Was hier fehlt, heißt
            nicht, dass nichts ansteht — bitte die Seite neu laden. Die Reiter oben zeigen den
            vollständigen Stand.
          </p>
        </Hinweiszeile>
      )}
    </div>
  );
}

function leerText(rolle: StartRolle): string {
  switch (rolle) {
    case 'monteur':
      return 'Alle Tage gebucht, kein Schein ohne Zeit, nichts zum Abholen.';
    case 'verwaltung':
      return 'Keine offene Anforderung, nichts überfällig, kein Artikel unter der Mindestmenge.';
    case 'buchhaltung':
      return 'Keine Mahnung fällig, keine Rechnung überfällig, alle Scheine verrechnet, alle Zeiten gebucht.';
    case 'projektleitung':
      return 'Alle Einsätze besetzt, keine Baustelle am Budgetlimit, keine ohne Einsatz.';
    default:
      return 'Keine Entscheidung offen, alle Einsätze besetzt, alle Zeiten gebucht, keine Rechnung überfällig.';
  }
}
