import { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useAuth } from '@/app/AuthContext';
import { darfTermineSchreiben } from '@/lib/permissions';
import { todayStr } from '@/lib/time';
import type { Project, Termin } from '@/types';
import Card from '@/components/Card';
import Button from '@/components/Button';
import BottomSheet from '@/components/BottomSheet';
import { List, ListRow } from '@/components/ListRow';
import { MehrAnzeigen, Segmente } from '@/components/LotBausteine';
import { ErrorState, EmptyState, SkeletonList, TeilFehler } from '@/components/States';
import TerminFenster from '@/features/termine/TerminFenster';
import { montagDer, wocheAb, wocheVerschoben } from './wochenplan';
import { kwSchluessel, monatsTage, monatsTitel, montagAusKw, wochenTitel } from './planungKopf';
import MonatsAnsicht from './MonatsAnsicht';
import EinsatzFenster, { type FensterStart } from './EinsatzFenster';
import KalenderAboKarte from './KalenderAboKarte';
import TagFenster from './TagFenster';
import HandyWoche from './HandyWoche';
import { BaustellenWoche, PersonenWoche, type RasterGrund } from './WochenRaster';
import { AnsichtWahl, PlanungsSeitenkopf } from './PlanungsKopf';
import { useWochenDaten } from './useWochenDaten';
import { naechsterArbeitstag, schmalerTag } from './wochenTermine';

/**
 * DIE EINSATZPLANUNG: wer ist wann wo — und wer ist noch frei.
 *
 * WELCHE FRAGE SIE BEANTWORTET, und warum die Tagesplanung sie nicht kann.
 * Dort steht ein Tag und eine Baustelle. Wer wissen will, ob Donnerstag noch
 * jemand frei ist, muss sich durch sieben Tage klicken und sich die Namen
 * merken. Bei zwanzig Mitarbeitern behält das niemand im Kopf.
 *
 * GEPLANT WIRD IM SEITENFENSTER (Linie „Lot“, E2), mit Tag und Person bzw.
 * Baustelle schon gewählt — mit DEMSELBEN Formular wie „Tag planen“
 * (`EinsatzFormular`), nicht einem zweiten: der gefährliche Vorgang „alles
 * weg, dann alles neu“ für das Paar aus Tag und Baustelle steht nur dort.
 *
 * RUNDE 4 (Auftrag Abschnitt 4): volle Inhaltsbreite, „Woche | Monat | Tag“
 * statt der Reiter, Termine in der Zelle ihrer Teilnehmer und am Einsatz
 * ihrer Baustelle statt in einer eigenen Zeile, der Tageskopf öffnet das
 * Seitenfenster „Tag“, „Noch einzuplanen“ als Hinweiszeile. Gerechnet wird
 * wie vorher (`useWochenDaten`), mit denselben Abfragen.
 */

/** „Noch einzuplanen“: höchstens so viele, dann „und N weitere“ (Regel 4). */
const ABLAGE_SEITE = 20;

type Ansicht = 'woche' | 'monat';
type Sicht = 'personen' | 'baustellen';

/** Welches Seitenfenster offen ist — immer höchstens eines. */
type Fenster =
  | { art: 'einsatz'; start: FensterStart }
  | { art: 'tag'; datum: string; projectNumber?: string }
  | { art: 'termin'; termin: Termin | null; datum: string }
  | { art: 'noch' };

const ISO_TAG = /^\d{4}-\d{2}-\d{2}$/;

export default function Einsatzplanung() {
  const { user, company, einblick } = useAuth();
  const navigate = useNavigate();
  const heute = todayStr();

  /*
    ANSICHT, SICHT UND WOCHE STEHEN IN DER ADRESSE (Regel 4): die
    Monatsansicht als Lesezeichen, und der Zurück-Knopf führt dorthin
    zurück, wo man war. `?woche=2026-W41&tag=2026-10-07` (Runde 4) kommt aus
    „Zur Woche“ im Monat: diese Woche, der Tag im Kopf markiert. Ohne die
    Angaben ist alles wie vorher.
  */
  const [adresse, setAdresse] = useSearchParams();
  const ansicht: Ansicht = adresse.get('ansicht') === 'monat' ? 'monat' : 'woche';
  const sicht: Sicht = adresse.get('sicht') === 'baustellen' ? 'baustellen' : 'personen';
  const wocheAusAdresse = adresse.get('woche');
  const tagAusAdresse = ISO_TAG.test(adresse.get('tag') ?? '') ? adresse.get('tag') : null;
  const aendereAdresse = (aenderung: Record<string, string | null>, ersetzen = true) =>
    setAdresse(
      (alt) => {
        const neu = new URLSearchParams(alt);
        for (const [k, v] of Object.entries(aenderung)) {
          if (v) neu.set(k, v);
          else neu.delete(k);
        }
        return neu;
      },
      { replace: ersetzen },
    );

  const [montag, setMontag] = useState(() => montagAusKw(wocheAusAdresse) ?? montagDer(heute));
  const [monat, setMonat] = useState(() => ({ jahr: Number(heute.slice(0, 4)), monat: Number(heute.slice(5, 7)) - 1 }));
  // Kommt die Woche über die Adresse (auch „Zurück“ und „Vor“ im Browser), gilt sie.
  useEffect(() => {
    const m = montagAusKw(wocheAusAdresse);
    if (m) setMontag(m);
  }, [wocheAusAdresse]);

  const [fenster, setFenster] = useState<Fenster | null>(null);
  /** Eingeklappte Gruppen im Raster. */
  const [zuGruppen, setZuGruppen] = useState<Set<string>>(new Set());
  const [ablageGezeigt, setAblageGezeigt] = useState(ABLAGE_SEITE);
  /** Der am Handy gewählte Tag. */
  const [handyWahl, setHandyWahl] = useState<string | null>(null);

  const tage = useMemo(
    () => (ansicht === 'monat' ? monatsTage(monat.jahr, monat.monat) : wocheAb(montag)),
    [ansicht, monat.jahr, monat.monat, montag],
  );
  const d = useWochenDaten(tage);
  const darf = !!user && darfTermineSchreiben(user.role);

  /*
    EIN SEITENFENSTER GEHÖRT ZU SEINEM ZEITRAUM. Seit „Zur Woche“ einen
    Eintrag im Verlauf anlegt, wechselt „Zurück“ (am Handy die Zurück-Geste,
    mit der man ein Blatt schließen will) nur den Zeitraum, und ein offenes
    Fenster bliebe stehen. „Einsatz bearbeiten“ für einen Tag ausserhalb des
    neuen Zeitraums stünde dann ohne dessen Einsätze da — Speichern
    überschriebe die vorhandene Planung. Deshalb schließt es. Geöffnet wird
    jedes Fenster nur bei stehendem Zeitraum; Blättern geht nicht, solange
    eines offen ist.
  */
  const zeitraum = `${tage[0]}|${tage[tage.length - 1]}`;
  useEffect(() => {
    setFenster(null);
  }, [zeitraum]);

  const markiert = ansicht === 'woche' && tagAusAdresse && tage.includes(tagAusAdresse) ? tagAusAdresse : null;
  /** Für die Hauptaktion: heute, wenn er im Zeitraum liegt, sonst der erste Tag. */
  const standardTag = tage.includes(heute) ? heute : tage[0];
  const handyTag = handyWahl && tage.includes(handyWahl) ? handyWahl : (markiert ?? standardTag);

  /*
    NOCH EINZUPLANEN (Linie „Lot“, E2): laufende Baustellen ohne einen
    einzigen Einsatz in dieser Woche — aus den Daten, die die Seite ohnehin
    hat. Fällige Wartungen kennt der Wochenplan nicht; sie stehen weiter
    unter „Wartungen“.
  */
  const ohneEinsatz = useMemo(() => {
    if (ansicht !== 'woche') return [];
    const geplant = new Set(d.einsaetze.map((a) => a.projectNumber));
    return d.projects
      .filter((p) => !geplant.has(p.projectNumber))
      .sort((a, b) => (a.customerName ?? '').localeCompare(b.customerName ?? '', 'de'));
  }, [ansicht, d.einsaetze, d.projects]);

  /** Samstag, Sonntag, Feiertag ohne Einsatz und Termin — schmal (Auftrag 4.2). */
  const schmal = useMemo(
    () => new Set(ansicht === 'woche' ? tage.filter((t) => schmalerTag(t, d.einsaetze, d.termine)) : []),
    [ansicht, tage, d.einsaetze, d.termine],
  );

  const infoFuer = useCallback(
    (tag: string, nummer: string) => ({
      projekt: d.projects.find((p) => p.projectNumber === nummer),
      stand: d.proTag.get(tag)?.baustellen.find((b) => b.nummer === nummer),
    }),
    [d.projects, d.proTag],
  );

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
        const neu = new Date(m.jahr, m.monat + schritt, 1);
        return { jahr: neu.getFullYear(), monat: neu.getMonth() };
      });
    } else {
      setMontag(wocheVerschoben(montag, schritt));
      // Die Woche aus der Adresse gilt nicht mehr — sonst spränge ein Neuladen zurück.
      if (wocheAusAdresse || tagAusAdresse) aendereAdresse({ woche: null, tag: null });
    }
  }

  function zeitraumWechseln(neu: Ansicht) {
    if (neu === 'monat') {
      // Der Monat, in dem der Donnerstag der gezeigten Woche liegt — wie die KW.
      const donnerstag = wocheAb(montag)[3];
      setMonat({ jahr: Number(donnerstag.slice(0, 4)), monat: Number(donnerstag.slice(5, 7)) - 1 });
    }
    aendereAdresse({ ansicht: neu === 'monat' ? 'monat' : null, woche: null, tag: null });
  }

  /**
   * „Zur Woche“ aus dem Monat (Runde 4): die Woche dieses Tages, sein Kopf
   * markiert. Ein NEUER Eintrag im Verlauf — „Zurück“ führt in den Monat.
   */
  function zurWoche(tag: string) {
    setMontag(montagDer(tag));
    setHandyWahl(tag);
    aendereAdresse({ ansicht: null, woche: kwSchluessel(tag), tag }, false);
  }

  if (!user) return null;

  const kopf = ansicht === 'monat' ? monatsTitel(monat.jahr, monat.monat) : wochenTitel(montag, heute);
  const jetzt =
    ansicht === 'monat'
      ? monat.jahr === Number(heute.slice(0, 4)) && monat.monat === Number(heute.slice(5, 7)) - 1
      : montag === montagDer(heute);
  const einheit = ansicht === 'monat' ? 'Monat' : 'Woche';

  const grund: RasterGrund = {
    tage,
    heute,
    markiert,
    schmal,
    proTag: d.proTag,
    freiJeTag: d.freiJeTag,
    zuAm: d.zuAm,
    einsaetze: d.einsaetze,
    termineAm: d.termineAm,
    darf,
    onTag: (tag) => setFenster({ art: 'tag', datum: tag }),
    onEinsatz: (start) => setFenster({ art: 'einsatz', start }),
    onTermin: (termin) => setFenster({ art: 'termin', termin, datum: termin.datum }),
    nichtEinplanbar: d.nichtEinplanbar,
  };
  const termineDes = (tag: string) => d.termineAm(tag);

  return (
    // `einsatzplanung` gibt der Seite die volle Inhaltsbreite (lot-planung.css).
    <div className="einsatzplanung" lang="de-AT">
      <PlanungsSeitenkopf
        hilfe={
          <>
            <p>
              Ein Tipp auf eine leere Zelle, einen Einsatz oder eine Baustelle unter „Noch
              einzuplanen“ öffnet das Seitenfenster „Einsatz planen“ — Tag, Person und Baustelle
              sind schon gewählt. Ein Tipp auf den Kopf eines Tages öffnet das Seitenfenster
              „Tag“ mit den Terminen, allen Einsätzen und wer frei ist; von dort führt „In
              ‚Tag‘ öffnen“ in die Tagesplanung mit Kalender.
            </p>
            <p className="mt-2">
              Termine stehen in der Zelle ihrer Teilnehmer und als Zusatzzeile am Einsatz ihrer
              Baustelle; ein Tipp öffnet „Termin ändern“ (wer Termine nur sehen darf, sieht sie
              nur). „N Termine“ im Kopf zählt alle Termine des Tages, auch die ohne Baustelle.
              „Lieferung ohne Annahme“ heißt: eine Lieferung an einer Baustelle, auf der an dem
              Tag niemand eingeteilt ist.
            </p>
            <p className="mt-2">
              Gezählt als frei ist, wer an diesem Tag auf keiner Baustelle steht und keinen
              genehmigten Urlaub hat. Der Wochenplan zeigt Einsätze, nicht gebuchte Zeiten: wer
              ohne Einsatz Stunden bucht, steht hier trotzdem als frei. Samstag, Sonntag und
              Feiertage sind schmal, solange dort nichts steht — an einem Notdienst wird auch
              sonntags gearbeitet, dann ist die Spalte breit. Bernstein heißt: eingeteilt, aber
              abwesend.
            </p>
          </>
        }
        action={
          <Button onClick={() => setFenster({ art: 'einsatz', start: { datum: ansicht === 'woche' ? handyTag : standardTag } })}>
            Einsatz planen
          </Button>
        }
      />

      {d.nebenFehler && <TeilFehler was={d.nebenFehler} />}
      {d.error && <ErrorState message={d.error} />}

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
                if (wocheAusAdresse || tagAusAdresse) aendereAdresse({ woche: null, tag: null });
              }}
            >
              {ansicht === 'monat' ? 'Dieser Monat' : 'Diese Woche'}
            </Button>
          )}
        </div>
        <div className="planung-wahl">
          {/* Am Handy steht die Tagesliste — dort kein Umschalter (Auftrag 4.7). */}
          <div className="hidden md:block">
            <Segmente
              name="Sicht"
              werte={[{ wert: 'personen', text: 'Personen' }, { wert: 'baustellen', text: 'Baustellen' }]}
              wert={sicht}
              onChange={(s) => aendereAdresse({ sicht: s === 'baustellen' ? 'baustellen' : null })}
            />
          </div>
          {/* Zuletzt, ganz rechts — an derselben Stelle wie in „Tag“ (Runde 5, G9). */}
          <AnsichtWahl ansicht={ansicht} onWocheMonat={zeitraumWechseln} />
        </div>
      </div>

      {!d.geladen ? (
        <Card buendig>
          <SkeletonList rows={6} />
        </Card>
      ) : d.gruppen.length === 0 ? (
        <Card buendig>
          <EmptyState>
            Keine aktiven Mitarbeiter im Außendienst. Ohne sie gibt es nichts einzuteilen.
          </EmptyState>
        </Card>
      ) : ansicht === 'monat' ? (
        <MonatsAnsicht
          tage={tage}
          heute={heute}
          gruppen={d.gruppen}
          zu={zuGruppen}
          onGruppe={(g) => setZuGruppen((alt) => umschalten(alt, g))}
          brett={d.brett}
          zuFuer={d.zuFuer}
          einsaetze={d.einsaetze}
          projects={d.projects}
          urlaube={d.urlaube}
          staff={d.staff}
          onTag={zurWoche}
          sicht={sicht}
          termine={d.termine}
          zuAm={d.zuAm}
          onEinsatz={grund.onEinsatz}
          onTermin={grund.onTermin}
          onZurWoche={zurWoche}
        />
      ) : (
        <>
          {/*
            NOCH EINZUPLANEN ALS HINWEISZEILE (Auftrag 4.1): die Ablage rechts
            nahm dem Raster ein Viertel der Breite. Dieselbe Liste steht im
            Seitenfenster; sind alle eingeplant, entfällt die Zeile.
          */}
          {ohneEinsatz.length > 0 && (
            <div className="planung-hinweiszeile">
              <p className="hinweis-text">
                {ohneEinsatz.length === 1 ? '1 laufende Baustelle' : `${ohneEinsatz.length} laufende Baustellen`} ohne
                Einsatz in dieser Woche: {ohneEinsatz.slice(0, 3).map(mitNummer).join(', ')}
                {ohneEinsatz.length > 3 ? ` und ${ohneEinsatz.length - 3} weitere` : ''}
              </p>
              <button type="button" className="wp-textknopf" onClick={() => setFenster({ art: 'noch' })}>
                Noch einzuplanen …
              </button>
            </div>
          )}
          <Card buendig>
            {sicht === 'baustellen' ? (
              <BaustellenWoche g={grund} staff={d.staff} brett={d.brett} projects={d.projects} termine={d.termine} />
            ) : (
              <PersonenWoche
                g={grund}
                gruppen={d.gruppen}
                zu={zuGruppen}
                onGruppe={(g) => setZuGruppen((alt) => umschalten(alt, g))}
                brett={d.brett}
                zuFuer={d.zuFuer}
                infoFuer={infoFuer}
              />
            )}
            <div className="md:hidden">
              <HandyWoche
                tage={tage}
                heute={heute}
                gewaehlt={handyTag}
                onWahl={setHandyWahl}
                gruppen={d.gruppen}
                brett={d.brett}
                proTag={d.proTag}
                zuAm={d.zuAm}
                zuFuer={d.zuFuer}
                einsaetze={d.einsaetze}
                termineAm={d.termineAm}
                infoFuer={infoFuer}
                darf={darf}
                onTag={grund.onTag}
                onEinsatz={grund.onEinsatz}
                onTermin={grund.onTermin}
                onTerminNeu={(tag) => setFenster({ art: 'termin', termin: null, datum: tag })}
              />
            </div>
          </Card>
        </>
      )}

      {/*
        DER GANZE PLAN IM EIGENEN KALENDER (Plan 10.4, PR B) — nur für die,
        die planen (die Team-Woche der Monteure bekommt ihn nicht), nur wenn
        der Betrieb das Abo erlaubt, und nicht im Supportzugang. Unverändert.
      */}
      {company?.kalenderAboErlaubt && !einblick && <KalenderAboKarte userId={user.uid} art="gesamt" />}

      {fenster?.art === 'einsatz' && (
        <EinsatzFenster
          key={`${fenster.start.datum}|${fenster.start.projectNumber ?? ''}|${fenster.start.person ?? ''}`}
          start={fenster.start}
          tage={tage}
          einsaetze={d.einsaetze}
          users={d.users}
          staff={d.staff}
          projects={d.projects}
          onProjekt={d.projektDazu}
          urlaube={d.urlaube}
          betriebsurlaube={d.betriebsurlaube}
          termine={d.termine}
          onClose={() => setFenster(null)}
          onTagAnsehen={(datum, projectNumber) => setFenster({ art: 'tag', datum, projectNumber })}
        />
      )}
      {fenster?.art === 'tag' && (
        <TagFenster
          key={fenster.datum}
          datum={fenster.datum}
          stand={d.proTag.get(fenster.datum)}
          termine={termineDes(fenster.datum)}
          einsaetze={d.einsaetze}
          projects={d.projects}
          users={d.users}
          staff={d.staff}
          brett={d.brett}
          zu={d.zuAm.get(fenster.datum)}
          darf={darf}
          onClose={() => setFenster(null)}
          onTermin={grund.onTermin}
          onTerminNeu={(datum) => setFenster({ art: 'termin', termin: null, datum })}
          onEinsatz={grund.onEinsatz}
          onInTag={() => zurTagesplanung(fenster.datum, fenster.projectNumber)}
        />
      )}
      {fenster?.art === 'termin' && (
        <TerminFenster
          key={fenster.termin?.id ?? `neu-${fenster.datum}`}
          termin={fenster.termin}
          datum={fenster.datum}
          personen={d.users}
          onClose={() => setFenster(null)}
          onGeaendert={d.termineNeuLaden}
        />
      )}
      {fenster?.art === 'noch' && (
        <BottomSheet open onClose={() => setFenster(null)} label="Noch einzuplanen" auchBreit titel="Noch einzuplanen">
          <p className="fenster-ueber">Laufende Baustellen ohne Einsatz · {kopf.titel}</p>
          {ohneEinsatz.length === 0 ? (
            <EmptyState>Jede laufende Baustelle hat diese Woche einen Einsatz.</EmptyState>
          ) : (
            <>
              <List>
                {ohneEinsatz.slice(0, ablageGezeigt).map((p) => (
                  <ListRow
                    key={p.projectNumber}
                    title={baustellenName(p)}
                    subtitle={p.projectNumber}
                    // Mit der Baustelle und dem nächsten Arbeitstag der Woche ab heute.
                    onOeffnen={() =>
                      setFenster({
                        art: 'einsatz',
                        start: { datum: naechsterArbeitstag(tage, heute), projectNumber: p.projectNumber },
                      })
                    }
                  />
                ))}
              </List>
              <MehrAnzeigen
                anzahl={Math.max(0, ohneEinsatz.length - ablageGezeigt)}
                onClick={() => setAblageGezeigt((n) => n + ABLAGE_SEITE)}
              />
            </>
          )}
        </BottomSheet>
      )}
    </div>
  );
}

const baustellenName = (p: Project) => p.customerName ?? p.projectNumber;

/** „CT Bau GmbH (PR-2026-0193)“ — zwei Baustellen desselben Kunden sind sonst nicht zu unterscheiden (Runde 5, G3). */
const mitNummer = (p: Project) => (p.customerName ? `${p.customerName} (${p.projectNumber})` : p.projectNumber);

function umschalten(alt: Set<string>, name: string): Set<string> {
  const neu = new Set(alt);
  if (neu.has(name)) neu.delete(name);
  else neu.add(name);
  return neu;
}
