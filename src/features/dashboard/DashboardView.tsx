import { useEffect, useMemo, useState } from 'react';
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
import Icon from '@/components/Icon';
import Hinweiszeile from '@/components/Hinweiszeile';
import PageHeader from '@/components/PageHeader';
import { LoadingState } from '@/components/States';
import { rolleAnzeige } from '@/lib/rolleAnzeige';
import LaufWarnung from './LaufWarnung';
import WartungHinweis from './WartungHinweis';
import Handlungsbedarf from './start/Handlungsbedarf';
import Kennzahlen from './start/Kennzahlen';
import HeuteEigene from './start/HeuteEigene';
import HeuteLeitung from './start/HeuteLeitung';
import HeuteListe from './start/HeuteListe';
import { startseite } from './start/aufbau';
import { grundpfad } from './start/ziele';
import {
  buchhaltung,
  einstellungen,
  lager,
  leitung,
  persoenlich,
  startRolle,
  team,
  type Kontext,
  type StartDaten,
  type StartRolle,
} from './start/laden';

/**
 * DIE STARTSEITE (Testbericht 4.2, Nachtest 01.10.2026 Paket B; Skizzen in
 * `docs/design/startseite-skizzen`).
 *
 * Für jede Rolle derselbe Aufbau:
 *   1. Seitenkopf — der Tag als Überschrift, KW, Betrieb, Rolle.
 *   2. Handlungsbedarf — EINE Karte, je Thema ein Abschnitt mit höchstens
 *      drei Zeilen und „und N weitere →“ auf die gefilterte Fachseite.
 *   3. Heute — was heute ansteht (Einsatz, Lieferungen, Zahlungseingänge,
 *      wer wo ist).
 *   4. Kennzahlen — höchstens vier, jede ein Verweis.
 *
 * Am Schreibtisch links Handlungsbedarf, rechts Heute und Kennzahlen; am
 * Telefon eine Spalte in dieser Reihenfolge. Ist nichts zu tun: „Heute
 * liegt nichts an“ und darunter, über die ganze Breite, Heute (bei der
 * Leitung, wenn es Einsätze gibt) und die Kennzahlen — keine leere Spalte
 * (G20).
 *
 * Was eine Rolle zeigt, steht in `start/aufbau.ts` und `start/regeln.ts`;
 * geladen wird in `start/laden.ts`.
 */
export default function DashboardView() {
  const { user, company, einblick } = useAuth();
  const scheineAn = useModul('scheine');
  const materialAn = useModul('material');
  const rechnungenAn = useModul('rechnungen');
  const wartungAn = useModul('wartung');
  const urlaubAn = useModul('urlaub');
  const einsatzAn = useModul('einsatzplanung');
  const [data, setData] = useState<StartDaten>({});
  /*
    Wie viele Ladeblöcke noch laufen. Beginnt bei 1, nicht bei 0: bis der
    Effekt seine Blöcke zählt, ist die Seite noch nicht geladen — sonst stand
    einen Augenblick „Heute liegt nichts an“ da.
  */
  const [laeuft, setLaeuft] = useState(1);
  /*
    WELCHER TEIL NICHT KAM — und dass es jemand erfährt. Jeder Block für
    sich: fällt die Buchhaltung aus, sieht der Monteur trotzdem, wo er heute
    hin muss, und die Seite sagt, was fehlt. Eine Startseite, die weniger
    zeigt als sonst, sähe sonst aus wie ein ruhiger Tag.
  */
  const [nichtGeladen, setNichtGeladen] = useState<string[]>([]);

  const rolle: StartRolle = user ? startRolle(user.role) : 'monteur';
  const mitZeitkonto = user ? fuehrtZeitkonto(user) : false;
  const heute = todayStr();

  const darf = useMemo(() => {
    const zusatz = zusatzrechte(user, company);
    return (ziel: string) => !!user && canAccess(user.role, grundpfad(ziel), company?.modules, zusatz);
  }, [user, company]);
  const urlaubEntscheiden = !!user && urlaubAn && darfUrlaubEntscheiden(user.role, user.uid, company?.vacationApprovers);

  useEffect(() => {
    if (!user) return;
    let weg = false;
    const k: Kontext = { user, company, heute: todayStr() };
    const r = startRolle(user.role);
    setData({});
    setNichtGeladen([]);

    const bloecke: [string, () => Promise<Partial<StartDaten>>][] = [];
    if (mitZeitkonto || isMitarbeiter(user.role)) {
      bloecke.push(['Deine Tage und Einsätze', () => persoenlich(k, {
        material: materialAn,
        scheine: scheineAn && r === 'monteur',
        kennzahlen: r === 'monteur',
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
      bloecke.push(['Die Mannschaft', () => team(k, { luecken: canEditTime(user.role), urlaub: urlaubEntscheiden })]);
    }
    if (isGF(user.role)) {
      bloecke.push(['Baustellen und Einsätze', () => leitung(k, { einsatzplanung: einsatzAn, wartung: wartungAn, budget: true })]);
    }
    if (isTopLevel(user.role)) {
      bloecke.push(['Einstellungen', () => einstellungen(k, { rechnungen: rechnungenAn, konten: true })]);
    }

    setLaeuft(bloecke.length);
    for (const [name, lauf] of bloecke) {
      void Promise.resolve()
        .then(lauf)
        .then((teil) => {
          if (!weg) setData((v) => ({ ...v, ...teil }));
        })
        .catch(() => {
          if (!weg) setNichtGeladen((f) => (f.includes(name) ? f : [...f, name]));
        })
        .finally(() => {
          if (!weg) setLaeuft((n) => n - 1);
        });
    }
    return () => {
      weg = true;
    };
  }, [user, company, mitZeitkonto, materialAn, scheineAn, rechnungenAn, wartungAn, einsatzAn, urlaubEntscheiden]);

  const seite = useMemo(
    () => startseite(data, { rolle, heute, jetzt: Date.now(), darf, urlaubEntscheiden }),
    [data, rolle, heute, darf, urlaubEntscheiden],
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

  const nochAmLaden = laeuft > 0;
  const eigene = data.heuteEigene ?? [];
  const planVerweis = darf('/my-schedule');
  const scheinVerweis = scheineAn && canWriteWorkSheet(user.role);

  const heuteKarten = (
    <>
      {eigene.length > 0 && (
        <HeuteEigene
          einsaetze={eigene}
          letzteBuchung={data.letzteBuchung}
          materialAn={materialAn}
          scheinVerweis={scheinVerweis}
          planVerweis={planVerweis}
          titel={rolle === 'monteur' ? 'Heute' : 'Dein Einsatz heute'}
        />
      )}
      {seite.heute?.art === 'liste' && (
        <HeuteListe zusatz={seite.heute.zusatz} zeilen={seite.heute.zeilen} verweis={seite.heute.verweis} />
      )}
      {seite.heute?.art === 'leitung' && (
        <HeuteLeitung heute={heute} abwesend={data.abwesendHeute ?? []} tag={data.heuteBetrieb ?? []} />
      )}
    </>
  );
  const hatHeute = eigene.length > 0 || !!seite.heute;
  const hatBedarf = seite.abschnitte.length > 0;
  const hatRechts = hatHeute || seite.kennzahlen.length > 0;

  return (
    <div className="space-y-3 lg:space-y-5" data-geladen={nochAmLaden ? 'nein' : 'ja'}>
      {/* Der Tag ist die Überschrift: die App hält Ansichten vor, und ein
          sichtbares Datum ist die billigste Auskunft, dass man auf heute schaut. */}
      <PageHeader
        title={kopf.datum}
        subtitle={
          <>
            {/* Umbrechen nur zwischen den Teilen (D13). */}
            <span className="whitespace-nowrap">KW {kopf.kw}</span> ·{' '}
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
      />

      {/* Die Nachtläufe zuerst: ihr Schaden wächst mit der Zeit, statt aufzufallen. */}
      <LaufWarnung />

      {/* Die Verwaltung vereinbart Wartungstermine; bei der Leitung stehen sie im Handlungsbedarf. */}
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

      {nochAmLaden && !hatBedarf && !hatHeute ? (
        <Card>
          <LoadingState />
        </Card>
      ) : hatBedarf ? (
        hatRechts ? (
          <div className="zwei-spalten">
            <div className="spalte start-breit">
              <Handlungsbedarf abschnitte={seite.abschnitte} zaehlwort={seite.zaehlwort} />
            </div>
            <div className="spalte">
              {heuteKarten}
              <Kennzahlen werte={seite.kennzahlen} raster />
            </div>
          </div>
        ) : (
          <div className="start-breit">
            <Handlungsbedarf abschnitte={seite.abschnitte} zaehlwort={seite.zaehlwort} />
          </div>
        )
      ) : (
        /* Nichts zu tun: EINE Spalte über die ganze Breite (G20). */
        <div className="spalte start-breit">
          {!nochAmLaden && (
            <section className="panel karte flex items-start gap-3 p-4" aria-label="Heute liegt nichts an">
              <Icon name="haken" size={20} className="mt-0.5 shrink-0 text-success" />
              <div>
                <h2 className="titel-karte">Heute liegt nichts an</h2>
                <p className="mt-0.5 text-sm text-ink-muted">{leerText(rolle)}</p>
              </div>
            </section>
          )}
          {heuteKarten}
          <Kennzahlen werte={seite.kennzahlen} />
        </div>
      )}

      {nochAmLaden && (hatBedarf || hatHeute) && (
        <p className="text-sm text-ink-muted" role="status">Wird noch geladen …</p>
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
