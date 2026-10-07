import { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useAuth } from '@/app/AuthContext';
import { einplanbar } from '@/lib/permissions';
import { listActiveProjects } from '@/lib/db/projects';
import { listUsers } from '@/lib/db/users';
import { listAbwesendInRange, type Abwesenheit } from '@/lib/db/vacations';
import { listBetriebsurlaubeImZeitraum } from '@/lib/db/abwesenheiten';
import { subscribeAssignmentsInRange } from '@/lib/db/assignments';
import { listTermineImZeitraum } from '@/lib/db/termine';
import { bezugText, terminKopf } from '@/features/termine/terminText';
import { todayStr, getAustrianHolidayName, isWeekend } from '@/lib/time';
import type { WithId } from '@/lib/db/core';
import type { Project, AppUser, Assignment, Betriebsurlaub, Termin } from '@/types';
import Card from '@/components/Card';
import Button from '@/components/Button';
import PageHeader from '@/components/PageHeader';
import { List, ListRow } from '@/components/ListRow';
import { MehrAnzeigen, Segmente } from '@/components/LotBausteine';
import { ErrorState, EmptyState, TeilFehler } from '@/components/States';
import { montagDer, wocheAb, wocheVerschoben } from './wochenplan';
import { monatsTage, monatsTitel, wochenTitel } from './planungKopf';
import { einsatzZeit } from './einsatzZeit';
import { nachEinstufung, tagKurz, type Brett, type TagBaustelle, type TagStand, type Zelle } from './planTypen';
import { BaustellenRaster, PersonenRaster } from './PlanRaster';
import MonatsAnsicht from './MonatsAnsicht';
import EinsatzFenster, { type FensterStart } from './EinsatzFenster';
import KalenderAboKarte from './KalenderAboKarte';

/**
 * DIE PLANUNG DER WOCHE: wer ist wo — wer ist frei — und gleich einteilen.
 *
 * WELCHE FRAGE ES BEANTWORTET, und warum die Tagesplanung sie nicht kann.
 * Dort steht ein Tag und eine Baustelle. Wer wissen will, ob Donnerstag noch
 * jemand frei ist, muss sich durch sieben Tage klicken und sich die Namen
 * merken. Bei zwanzig Mitarbeitern behält das niemand im Kopf — und genau
 * daran scheitert die Planung, nicht am Eintragen.
 *
 * SEIT DER LINIE „LOT“ (Protokoll E2) WIRD HIER AUCH EINGETEILT — im
 * Seitenfenster, mit Tag und Person bzw. Baustelle schon gewählt. Bis dahin
 * führte jeder Tipp in die Tagesplanung, weil ein zweiter Schreibweg
 * denselben gefährlichen Vorgang („alles weg, dann alles neu“ für das Paar
 * aus Tag und Baustelle) zweimal gebraucht hätte. Das bleibt wahr: das
 * Fenster benutzt DASSELBE Formular wie „Tag planen“ (`EinsatzFormular`),
 * nicht ein zweites. Der Kopf eines Tages führt weiter in „Tag planen“.
 */

/**
 * „Urlaub", „ZA 13:00–17:00", „abwesend".
 *
 * Den GRUND liefert die Datenbank nur dem, der ihn sehen darf; allen anderen
 * `null` — dann heisst es „abwesend". Die Uhrzeit bekommt jeder: „ab 13 Uhr
 * weg" ist eine Auskunft über die Verfügbarkeit, kein Grund.
 */
function abwesendText(a: Pick<Abwesenheit, 'grund' | 'zeiten'>): string {
  return [a.grund ?? 'abwesend', a.zeiten].filter(Boolean).join(' ');
}

/** „Noch einzuplanen“: höchstens so viele, dann „und N weitere“ (Regel 4). */
const ABLAGE_SEITE = 20;

type Ansicht = 'woche' | 'monat';
type Sicht = 'personen' | 'baustellen';

/**
 * `nurLesen`: die Team-Woche für alle Mitarbeiter (Betriebseinstellung
 * „Wochenplan für alle"). Dieselbe Rechnung, dieselben Daten — aber nichts zum
 * Antippen und kein „frei" (das ist eine Frage der Planung, nicht des Teams).
 * Die Abwesenheiten kommen in beiden Fassungen aus `wochenplan_abwesend`; den
 * Grund gibt die Datenbank nur dem heraus, der ihn sehen darf — dem Monteur
 * nie, dort steht „abwesend".
 */
export default function WochenplanView({ nurLesen = false }: { nurLesen?: boolean }) {
  const { user, company, einblick } = useAuth();
  const navigate = useNavigate();
  const heute = todayStr();

  /*
    ANSICHT UND SICHT STEHEN IN DER ADRESSE (Regel 4): die Monatsansicht als
    Lesezeichen, und der Zurück-Knopf führt dorthin zurück, wo man war. Die
    Team-Woche der Monteure kennt nur die Woche.
  */
  const [adresse, setAdresse] = useSearchParams();
  const ansicht: Ansicht = !nurLesen && adresse.get('ansicht') === 'monat' ? 'monat' : 'woche';
  const sicht: Sicht = !nurLesen && adresse.get('sicht') === 'baustellen' ? 'baustellen' : 'personen';
  const setzeAdresse = (schluessel: string, wert: string | null) =>
    setAdresse(
      (alt) => {
        const neu = new URLSearchParams(alt);
        if (wert) neu.set(schluessel, wert);
        else neu.delete(schluessel);
        return neu;
      },
      { replace: true },
    );

  const [montag, setMontag] = useState(() => montagDer(heute));
  const [monat, setMonat] = useState(() => ({ jahr: Number(heute.slice(0, 4)), monat: Number(heute.slice(5, 7)) - 1 }));
  const [users, setUsers] = useState<AppUser[]>([]);
  const [projects, setProjects] = useState<Project[]>([]);
  const [einsaetze, setEinsaetze] = useState<WithId<Assignment>[]>([]);
  const [urlaube, setUrlaube] = useState<Abwesenheit[]>([]);
  const [betriebsurlaube, setBetriebsurlaube] = useState<Betriebsurlaub[]>([]);
  const [termine, setTermine] = useState<Termin[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [nebenFehler, setNebenFehler] = useState<string | null>(null);
  /** Das Seitenfenster „Einsatz planen“ — offen mit Tag, Person oder Baustelle. */
  const [fenster, setFenster] = useState<FensterStart | null>(null);
  /** Eingeklappte Gruppen im Raster. */
  const [zuGruppen, setZuGruppen] = useState<Set<string>>(new Set());
  const [ablageGezeigt, setAblageGezeigt] = useState(ABLAGE_SEITE);

  const tage = useMemo(
    () => (ansicht === 'monat' ? monatsTage(monat.jahr, monat.monat) : wocheAb(montag)),
    [ansicht, monat.jahr, monat.monat, montag],
  );
  const von = tage[0];
  const bis = tage[tage.length - 1];

  useEffect(() => {
    if (!user) return;
    listUsers(user.companyId).then(setUsers).catch(() => setNebenFehler('Die Belegschaft'));
    listActiveProjects(user.companyId)
      .then(setProjects)
      .catch(() => setNebenFehler('Die Baustellen'));
  }, [user]);

  useEffect(() => {
    if (!user) return;
    return subscribeAssignmentsInRange(user.companyId, von, bis, setEinsaetze, (e) =>
      setError(e.message),
    );
  }, [user, von, bis]);

  /**
   * Wer im Zeitraum fehlt: genehmigter Urlaub und Zeitausgleich,
   * Krankmeldungen.
   *
   * Nur GENEHMIGTES: ein beantragter Urlaub ist noch keiner, und ihn hier als
   * Abwesenheit zu zeigen hieße, die Entscheidung vorwegzunehmen.
   *
   * FÜR BEIDE FASSUNGEN DIESELBE ABFRAGE. Sie gibt den Grund nur heraus, wo er
   * gesehen werden darf: der Projektleitung Urlaub und ZA, einen
   * Krankenstand nur dem Büro — sonst „abwesend".
   */
  useEffect(() => {
    if (!user) return;
    let verworfen = false;
    listAbwesendInRange(von, bis)
      .then((r) => {
        if (!verworfen) setUrlaube(r);
      })
      .catch(() => {
        if (!verworfen) setUrlaube([]);
        // Ohne Hinweis sähe „niemand abwesend" aus wie eine Auskunft.
        if (!verworfen) setNebenFehler('Die Abwesenheiten');
      });
    return () => {
      verworfen = true;
    };
  }, [user, von, bis]);

  /*
    DIE TERMINE DES ZEITRAUMS (Plan 10.4): eine Lieferung am Dienstag 8–10
    soll der Planer neben den Leuten sehen. Was jemand sieht, entscheidet der
    Zeilenschutz — in der Team-Woche nur die eigenen und die auf Baustellen,
    auf denen man an dem Tag steht.
  */
  useEffect(() => {
    if (!user) return;
    let verworfen = false;
    listTermineImZeitraum(user.companyId, von, bis)
      .then((t) => {
        if (!verworfen) setTermine(t);
      })
      .catch(() => {
        if (!verworfen) {
          setTermine([]);
          setNebenFehler('Die Termine');
        }
      });
    return () => {
      verworfen = true;
    };
  }, [user, von, bis]);
  const termineAm = useCallback((tag: string) => termine.filter((t) => t.datum === tag), [termine]);

  /** Der Betrieb hat zu — an diesen Tagen ist niemand „frei". */
  useEffect(() => {
    if (!user) return;
    let verworfen = false;
    listBetriebsurlaubeImZeitraum(user.companyId, von, bis)
      .then((r) => {
        if (!verworfen) setBetriebsurlaube(r);
      })
      .catch(() => {
        if (!verworfen) setBetriebsurlaube([]);
      });
    return () => {
      verworfen = true;
    };
  }, [user, von, bis]);

  /** Tag -> Bezeichnung des Betriebsurlaubs, falls einer ist. */
  const zuAm = useMemo(() => {
    const m = new Map<string, string>();
    for (const b of betriebsurlaube) {
      for (const tag of tage) if (b.von <= tag && b.bis >= tag) m.set(tag, b.bezeichnung);
    }
    return m;
  }, [betriebsurlaube, tage]);

  /**
   * Hat der Betrieb an diesem Tag für DIESE Person zu?
   *
   * Wer beim Betriebsurlaub ausgenommen wurde, arbeitet in der Zeit (etwa
   * Notdienst oder Lager) — er ist dann „frei“ und einteilbar wie an jedem
   * anderen Tag. Die Spalte bleibt trotzdem grau: für den Betrieb ist zu.
   */
  const zuFuer = useCallback(
    (uid: string, tag: string) =>
      betriebsurlaube.some(
        (b) => b.von <= tag && b.bis >= tag && !(b.ausgenommen ?? []).includes(uid),
      ),
    [betriebsurlaube],
  );

  // Nur Außendienst wird eingeplant — dieselbe Auswahl wie in der Tagesplanung.
  const staff = useMemo(
    () =>
      users
        // Seit 30.09.2026 auf Wunsch des Betriebs auch die Projektleitung (M38).
        .filter((u) => einplanbar(u, company))
        .sort((a, b) => a.name.localeCompare(b.name, 'de')),
    [users, company],
  );
  const gruppen = useMemo(() => nachEinstufung(staff), [staff]);

  /** uid -> Tag -> was dort steht. */
  const brett = useMemo(() => {
    const m: Brett = new Map();
    const hole = (uid: string, tag: string): Zelle => {
      const proTag = m.get(uid) ?? new Map<string, Zelle>();
      m.set(uid, proTag);
      const z = proTag.get(tag) ?? { baustellen: [], imUrlaub: false, abwesendText: null };
      proTag.set(tag, z);
      return z;
    };
    for (const a of einsaetze) {
      const proj = projects.find((p) => p.projectNumber === a.projectNumber);
      hole(a.userId, a.date).baustellen.push({
        nummer: a.projectNumber,
        name: proj?.customerName ?? a.projectNumber,
        helfer: !!a.asHelper,
        zeit: einsatzZeit(a),
      });
    }
    for (const v of urlaube) {
      for (const tag of tage) {
        if (v.von <= tag && v.bis >= tag) {
          const z = hole(v.userId, tag);
          // Stundenweise (mit Uhrzeit) ist man nur teilweise weg: die Zelle
          // nennt es, eingeteilt werden kann trotzdem.
          if (!v.zeiten) z.imUrlaub = true;
          z.abwesendText = abwesendText(v);
        }
      }
    }
    return m;
  }, [einsaetze, urlaube, projects, tage]);

  /**
   * Je Tag zusammengefasst: welche Baustelle mit wem, wer frei, wer im Urlaub.
   *
   * ALLE DARSTELLUNGEN RECHNEN DAMIT — das Raster am Schreibtisch, die Sicht
   * nach Baustellen und die Tagesliste auf dem Telefon. Getrennte Rechnungen
   * hiessen mehrere Orte, an denen „frei" etwas anderes heissen kann.
   */
  const proTag = useMemo(() => {
    const m = new Map<string, TagStand>();
    for (const tag of tage) {
      const nachNummer = new Map<string, TagBaustelle>();
      const eintrag = (b: Zelle['baustellen'][number]) => {
        const e = nachNummer.get(b.nummer) ?? { nummer: b.nummer, name: b.name, namen: [], helfer: [], fehlen: [], zeit: b.zeit };
        nachNummer.set(b.nummer, e);
        return e;
      };
      const frei: string[] = [];
      const urlaub: string[] = [];
      for (const u of staff) {
        const z = brett.get(u.uid)?.get(tag);
        // Ohne Grund steht nur der Name da — „Erna (abwesend)" hinter
        // „Abwesend:" wäre doppelt.
        if (z?.abwesendText) {
          urlaub.push(z.abwesendText === 'abwesend' ? u.name : `${u.name} (${z.abwesendText})`);
        }
        /*
          EINGETEILT UND GANZTAGS WEG (Testbericht 30.09.2026, M33): der
          Einsatz verschwindet nicht, er steht mit „fehlt“ da. Vorher fiel er
          hier weg, und die Baustelle sah aus, als wäre nichts geplant.
        */
        if (z?.imUrlaub) {
          for (const b of z.baustellen) {
            eintrag(b).fehlen.push(z.abwesendText && z.abwesendText !== 'abwesend' ? `${u.name} (${z.abwesendText})` : u.name);
          }
          continue;
        }
        if (!z || z.baustellen.length === 0) {
          // Am Betriebsurlaub ist niemand „frei" — ausser wer ausgenommen ist.
          if (!zuFuer(u.uid, tag)) frei.push(u.name);
          continue;
        }
        for (const b of z.baustellen) {
          const e = eintrag(b);
          e.namen.push(u.name);
          if (b.helfer) e.helfer.push(u.name);
        }
      }
      m.set(tag, {
        baustellen: [...nachNummer.values()].sort((a, b) => a.name.localeCompare(b.name, 'de')),
        frei,
        urlaub,
      });
    }
    return m;
  }, [tage, staff, brett, zuFuer]);

  /** Wie viele sind an diesem Tag frei — die Zahl, um die es geht. */
  const freiJeTag = useMemo(() => {
    const m = new Map<string, number>();
    for (const tag of tage) m.set(tag, proTag.get(tag)?.frei.length ?? 0);
    return m;
  }, [tage, proTag]);

  /*
    NOCH EINZUPLANEN (Linie „Lot“, E2): laufende Baustellen ohne einen
    einzigen Einsatz in dieser Woche — aus den Daten, die die Seite ohnehin
    hat. Fällige Wartungen kennt der Wochenplan nicht; sie stehen weiter
    unter „Wartungen“.
  */
  const ohneEinsatz = useMemo(() => {
    if (ansicht !== 'woche') return [];
    const geplant = new Set(einsaetze.map((a) => a.projectNumber));
    return projects
      .filter((p) => !geplant.has(p.projectNumber))
      .sort((a, b) => (a.customerName ?? '').localeCompare(b.customerName ?? '', 'de'));
  }, [ansicht, einsaetze, projects]);

  /** Für das Fenster aus dem Kopf: heute, wenn er im Zeitraum liegt, sonst der erste Tag. */
  const standardTag = tage.includes(heute) ? heute : tage[0];

  /**
   * In „Tag planen“ — mit Tag und, wo eindeutig, Baustelle eingestellt.
   *
   * Bei mehreren Baustellen wird nur der Tag mitgegeben: welche gemeint ist,
   * kann das Brett nicht wissen, und eine geratene Vorauswahl wäre schlimmer
   * als keine — sie führte zum Speichern auf der falschen Baustelle.
   */
  function zurTagesplanung(tag: string, nummer?: string) {
    navigate('/assignments/tag', { state: { datum: tag, projectNumber: nummer } });
  }

  function blaettern(schritt: number) {
    if (ansicht === 'monat') {
      setMonat((m) => {
        const d = new Date(m.jahr, m.monat + schritt, 1);
        return { jahr: d.getFullYear(), monat: d.getMonth() };
      });
    } else {
      setMontag(wocheVerschoben(montag, schritt));
    }
  }

  function zeitraumWechseln(neu: Ansicht) {
    if (neu === 'monat') {
      // Der Monat, in dem der Donnerstag der gezeigten Woche liegt — wie die KW.
      const donnerstag = wocheAb(montag)[3];
      setMonat({ jahr: Number(donnerstag.slice(0, 4)), monat: Number(donnerstag.slice(5, 7)) - 1 });
    }
    setzeAdresse('ansicht', neu === 'monat' ? 'monat' : null);
  }

  /** Vom Monat in die Woche dieses Tages. */
  function zurWoche(tag: string) {
    setMontag(montagDer(tag));
    setzeAdresse('ansicht', null);
  }

  if (!user) return null;

  const kopf =
    ansicht === 'monat' ? monatsTitel(monat.jahr, monat.monat) : wochenTitel(montag, heute);
  const jetzt =
    ansicht === 'monat'
      ? monat.jahr === Number(heute.slice(0, 4)) && monat.monat === Number(heute.slice(5, 7)) - 1
      : montag === montagDer(heute);
  const einheit = ansicht === 'monat' ? 'Monat' : 'Woche';

  return (
    <div className="space-y-4 lg:space-y-5">
      <PageHeader
        ort={nurLesen ? 'Mein Einsatzplan' : 'Einsatzplanung'}
        title={nurLesen ? 'Team-Woche' : 'Wochenplan'}
        subtitle={nurLesen ? 'Wer ist diese Woche wo' : 'Wer ist diese Woche wo — und wer ist noch frei'}
        hilfe={
          nurLesen ? (
            <>
              Zeigt, wer an welchem Tag auf welcher Baustelle eingeteilt ist. Geplant wird im
              Büro; bei Fragen zur Einteilung bitte dort melden. Wer abwesend ist, steht ohne
              Grund da. Der Plan zeigt Einsätze, nicht gebuchte Zeiten.
            </>
          ) : (
            <>
              <p>
                Ein Tipp auf eine freie Zelle, einen Einsatz oder eine Baustelle unter „Noch
                einzuplanen“ öffnet das Seitenfenster — Tag, Person und Baustelle sind schon
                gewählt. Ein Tipp auf den Kopf eines Tages öffnet ihn in „Tag planen“, mit den
                Terminen und allen Einsätzen des Tages.
              </p>
              <p className="mt-2">
                Gezählt als frei ist, wer an diesem Tag auf keiner Baustelle steht und keinen
                genehmigten Urlaub hat. Der Wochenplan zeigt Einsätze, nicht gebuchte Zeiten: wer
                ohne Einsatz Stunden bucht, steht hier trotzdem als frei. Wochenende und Feiertage
                sind hinterlegt, aber nicht ausgenommen — an einem Notdienst wird auch sonntags
                gearbeitet. Bernstein heißt: eingeteilt, aber abwesend.
              </p>
            </>
          )
        }
        action={
          nurLesen ? undefined : (
            <Button onClick={() => setFenster({ datum: standardTag })}>Einsatz planen</Button>
          )
        }
      />

      {nebenFehler && <TeilFehler was={nebenFehler} />}
      {error && <ErrorState message={error} />}

      <div className="planung-steuerung">
        {/*
          EINE ZEILE, AUCH AUF 390 px: Pfeile, dazwischen groß „Diese Woche“
          und klein die KW. Die Pfeile sind 48 × 48 px (`min-h-touch` aus
          `Button`, `min-w-touch` hier); `sm:text-xl` neben `text-xl`, weil
          `Button` ab 640 px `sm:text-base` mitbringt (Launch-Check 25.09.2026).
        */}
        <div className="planung-woche">
          <Button variant="ghost" aria-label={`${einheit} zurück`} className="min-w-touch text-xl sm:text-xl" onClick={() => blaettern(-1)}>
            ‹
          </Button>
          <div className="planung-titelblock">
            <h2 className="planung-titel">{kopf.titel}</h2>
            <p className="planung-kw">{kopf.klein}</p>
          </div>
          <Button variant="ghost" aria-label={`${einheit} vor`} className="min-w-touch text-xl sm:text-xl" onClick={() => blaettern(1)}>
            ›
          </Button>
          {/* Zurück zu heute — nur, wo man nicht schon dort ist. */}
          {!jetzt && (
            <Button
              variant="ghost"
              onClick={() => {
                setMontag(montagDer(heute));
                setMonat({ jahr: Number(heute.slice(0, 4)), monat: Number(heute.slice(5, 7)) - 1 });
              }}
            >
              {ansicht === 'monat' ? 'Dieser Monat' : 'Diese Woche'}
            </Button>
          )}
        </div>
        {!nurLesen && (
          <div className="planung-wahl">
            <Segmente
              name="Zeitraum"
              werte={[{ wert: 'woche', text: 'Woche' }, { wert: 'monat', text: 'Monat' }]}
              wert={ansicht}
              onChange={zeitraumWechseln}
            />
            {/* Am Handy steht ohnehin die Tagesliste nach Baustellen — dort kein Umschalter. */}
            {ansicht === 'woche' && (
              <div className="hidden md:block">
              <Segmente
                name="Sicht"
                werte={[{ wert: 'personen', text: 'Personen' }, { wert: 'baustellen', text: 'Baustellen' }]}
                wert={sicht}
                onChange={(s) => setzeAdresse('sicht', s === 'baustellen' ? 'baustellen' : null)}
              />
              </div>
            )}
          </div>
        )}
      </div>

      {staff.length === 0 ? (
        <Card buendig>
          <EmptyState>
            Keine aktiven Mitarbeiter im Außendienst. Ohne sie gibt es nichts einzuteilen.
          </EmptyState>
        </Card>
      ) : ansicht === 'monat' ? (
        <MonatsAnsicht
          tage={tage}
          heute={heute}
          gruppen={gruppen}
          zu={zuGruppen}
          onGruppe={(g) => setZuGruppen((alt) => umschalten(alt, g))}
          brett={brett}
          zuFuer={zuFuer}
          einsaetze={einsaetze}
          projects={projects}
          urlaube={urlaube}
          staff={staff}
          onTag={zurWoche}
        />
      ) : (
        <div className={nurLesen ? undefined : 'planung-layout'}>
          <Card buendig>
            {sicht === 'baustellen' ? (
              <BaustellenRaster
                tage={tage}
                heute={heute}
                proTag={proTag}
                freiJeTag={freiJeTag}
                zuAm={zuAm}
                termine={termine}
                termineAm={termineAm}
                onTag={(tag) => zurTagesplanung(tag)}
                onZelle={setFenster}
              />
            ) : (
              <PersonenRaster
                tage={tage}
                heute={heute}
                nurLesen={nurLesen}
                gruppen={gruppen}
                zu={zuGruppen}
                onGruppe={(g) => setZuGruppen((alt) => umschalten(alt, g))}
                brett={brett}
                freiJeTag={freiJeTag}
                zuAm={zuAm}
                zuFuer={zuFuer}
                termine={termine}
                termineAm={termineAm}
                onTag={(tag) => zurTagesplanung(tag)}
                onZelle={setFenster}
              />
            )}

            {/*
              DIE TAGESLISTE — die Telefonansicht.

              Sie beantwortet dieselbe Frage in der Reihenfolge, in der man sie
              auf dem Telefon stellt: erst der Tag, dann wer dort ist, dann wer
              noch frei wäre. Kein waagrechter Bildlauf, keine stehende Spalte,
              nichts, was sich überlagern kann.

              Die freien Namen stehen AUSGESCHRIEBEN, nicht nur als Zahl. Am
              Schreibtisch liest man sie aus der Spalte ab; hier gäbe es dafür
              keine Spalte.
            */}
            <section aria-label="Wochenplan als Liste" className="md:hidden">
              {tage.map((tag) => (
                <TagesAbschnitt
                  key={tag}
                  tag={tag}
                  heute={heute}
                  nurLesen={nurLesen}
                  stand={proTag.get(tag)}
                  zu={zuAm.get(tag)}
                  termine={termineAm(tag)}
                  onFenster={setFenster}
                />
              ))}
            </section>
          </Card>

          {!nurLesen && (
            <Card title="Noch einzuplanen" buendig>
              <p className="zeile-meta px-4 pb-3">Laufende Baustellen ohne Einsatz in dieser Woche</p>
              {ohneEinsatz.length === 0 ? (
                <EmptyState>Jede laufende Baustelle hat diese Woche einen Einsatz.</EmptyState>
              ) : (
                <>
                  <List>
                    {ohneEinsatz.slice(0, ablageGezeigt).map((p) => (
                      <ListRow
                        key={p.projectNumber}
                        title={p.customerName ?? p.projectNumber}
                        subtitle={p.projectNumber}
                        onOeffnen={() => setFenster({ datum: standardTag, projectNumber: p.projectNumber })}
                      />
                    ))}
                  </List>
                  <MehrAnzeigen
                    anzahl={Math.max(0, ohneEinsatz.length - ablageGezeigt)}
                    onClick={() => setAblageGezeigt((n) => n + ABLAGE_SEITE)}
                  />
                </>
              )}
            </Card>
          )}
        </div>
      )}

      {/*
        DER GANZE PLAN IM EIGENEN KALENDER (Plan 10.4, PR B) — nur für die,
        die planen (die Team-Woche der Monteure bekommt ihn nicht), nur wenn
        der Betrieb das Abo erlaubt, und nicht im Supportzugang.
      */}
      {!nurLesen && company?.kalenderAboErlaubt && !einblick && (
        <KalenderAboKarte userId={user.uid} art="gesamt" />
      )}

      {fenster && !nurLesen && (
        <EinsatzFenster
          key={`${fenster.datum}|${fenster.projectNumber ?? ''}|${fenster.person ?? ''}`}
          start={fenster}
          tage={tage}
          einsaetze={einsaetze}
          users={users}
          staff={staff}
          projects={projects}
          onProjekt={(p) =>
            setProjects((alt) => (alt.some((x) => x.projectNumber === p.projectNumber) ? alt : [...alt, p]))
          }
          urlaube={urlaube}
          betriebsurlaube={betriebsurlaube}
          termine={termine}
          onClose={() => setFenster(null)}
          onTagPlanen={zurTagesplanung}
        />
      )}
    </div>
  );
}

function umschalten(alt: Set<string>, name: string): Set<string> {
  const neu = new Set(alt);
  if (neu.has(name)) neu.delete(name);
  else neu.add(name);
  return neu;
}

/** Ein Tag der Telefonansicht: Termine, Baustellen mit Namen, frei, abwesend. */
function TagesAbschnitt({
  tag,
  heute,
  nurLesen,
  stand,
  zu,
  termine,
  onFenster,
}: {
  tag: string;
  heute: string;
  nurLesen: boolean;
  stand: TagStand | undefined;
  zu: string | undefined;
  termine: Termin[];
  onFenster: (start: FensterStart) => void;
}) {
  const { wochentag, datum } = tagKurz(tag);
  const feiertag = getAustrianHolidayName(new Date(`${tag}T00:00:00`));
  const wochenende = isWeekend(new Date(`${tag}T00:00:00`));
  return (
    // Die Tage durch Linien getrennt von Kante zu Kante — keine Karte in der Karte.
    <div className={`border-t border-line ${tag === heute ? 'bg-petrol-hell' : feiertag || wochenende || zu ? 'bg-surface-2' : ''}`}>
      <div className="flex flex-wrap items-baseline justify-between gap-2 px-4 pb-1 pt-3">
        <span className="font-semibold text-ink">
          {wochentag}, {datum}
          {tag === heute && <span className="ml-2 text-sm text-ink-muted">heute</span>}
          {feiertag && <span className="ml-2 text-sm font-normal text-ink-muted">{feiertag}</span>}
        </span>
        {zu ? (
          <span className="text-sm text-ink-muted">Betriebsurlaub</span>
        ) : (
          !nurLesen && !wochenende && !feiertag && (
            <span className="text-sm text-ink-muted">{stand?.frei.length ?? 0} frei</span>
          )
        )}
      </div>

      <div className="space-y-2 px-4 pb-3">
        {termine.length > 0 && (
          <ul aria-label={`Termine am ${datum}`} className="space-y-1">
            {termine.map((tt) => (
              <li key={tt.id} className="text-sm">
                <span className="font-normal text-ink">{terminKopf(tt)}</span>{' '}
                <span className="text-ink-muted">· {bezugText(tt)}</span>
              </li>
            ))}
          </ul>
        )}
        {stand && stand.baustellen.length > 0 ? (
          stand.baustellen.map((b) => {
            const konflikt = b.fehlen.length > 0;
            const inhalt = (
              <>
                <span className="block font-normal text-ink">
                  {b.zeit && <span className="plan-zeit">{b.zeit}</span>}
                  {b.name} <span className="font-normal text-ink-muted">· {b.nummer}</span>
                </span>
                <span className="block text-sm text-ink-muted">
                  {b.namen.map((n) => (b.helfer.includes(n) ? `${n} (Helfer)` : n)).join(', ')}
                </span>
                <FehltZeile namen={b.namen} fehlen={b.fehlen} />
              </>
            );
            return nurLesen ? (
              <div key={b.nummer} className={konflikt ? 'tag-karte-konflikt-lesen' : 'tag-karte-lesen'}>
                {inhalt}
              </div>
            ) : (
              <button
                key={b.nummer}
                type="button"
                onClick={() => onFenster({ datum: tag, projectNumber: b.nummer })}
                aria-label={`${b.name} (${b.nummer}) am ${datum} bearbeiten`}
                className={konflikt ? 'tag-karte-konflikt' : 'tag-karte'}
              >
                {inhalt}
              </button>
            );
          })
        ) : zu ? (
          <p className="text-sm text-ink-muted">Betriebsurlaub — {zu}.</p>
        ) : (
          // Stehen darüber Termine, wäre „Nichts geplant" ein Widerspruch.
          <p className="text-sm text-ink-muted">{termine.length > 0 ? 'Kein Einsatz geplant.' : 'Nichts geplant.'}</p>
        )}

        {!nurLesen && !wochenende && !feiertag && stand && stand.frei.length > 0 && (
          <p className="text-sm text-ink-muted">
            <span className="font-normal text-ink">Frei:</span> {stand.frei.join(', ')}
          </p>
        )}
        {stand && stand.urlaub.length > 0 && (
          <p className="text-sm text-ink-muted">
            <span className="font-normal text-ink">Abwesend:</span> {stand.urlaub.join(', ')}
          </p>
        )}

        {!nurLesen && (
          <button
            type="button"
            onClick={() => onFenster({ datum: tag })}
            aria-label={`Am ${datum} einteilen`}
            className="tag-einteilen"
          >
            Einteilen
          </button>
        )}
      </div>
    </div>
  );
}

/**
 * Wer auf dieser Baustelle eingeteilt ist und fehlt — und ob damit niemand
 * mehr da ist (M33). Bernstein, nicht Rot: ein Konflikt, kein Fehler.
 */
function FehltZeile({ namen, fehlen }: { namen: string[]; fehlen: string[] }) {
  if (fehlen.length === 0) return null;
  return (
    <span className="block text-sm font-semibold text-warning">
      {namen.length === 0 ? 'Unbesetzt — ' : ''}fehlt: {fehlen.join(', ')}
    </span>
  );
}
