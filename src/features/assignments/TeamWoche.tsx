import { useCallback, useMemo, useState } from 'react';
import { todayStr } from '@/lib/time';
import Card from '@/components/Card';
import Button from '@/components/Button';
import PageHeader from '@/components/PageHeader';
import { ErrorState, EmptyState, LoadingState, TeilFehler } from '@/components/States';
import { useAuth } from '@/app/AuthContext';
import { montagDer, wocheAb, wocheVerschoben } from './wochenplan';
import { wochenTitel } from './planungKopf';
import { PersonenWoche, type RasterGrund } from './WochenRaster';
import HandyWoche from './HandyWoche';
import { schmalerTag } from './wochenTermine';
import { useWochenDaten } from './useWochenDaten';

/**
 * DIE TEAM-WOCHE für alle Mitarbeiter (Betriebseinstellung „Wochenplan für
 * alle"). Dieselbe Rechnung, dieselben Daten wie die Einsatzplanung — aber
 * nichts zum Antippen und kein „frei" (das ist eine Frage der Planung, nicht
 * des Teams). Die Abwesenheiten kommen aus `wochenplan_abwesend`; den Grund
 * gibt die Datenbank nur dem heraus, der ihn sehen darf — dem Monteur nie,
 * dort steht „abwesend".
 *
 * SEIT 10.10.2026 MIT DEN BAUSTEINEN DER EINSATZPLANUNG (`PersonenWoche`,
 * `HandyWoche`, je mit `lesen`). Bis dahin zeichnete sie ihr eigenes, älteres
 * Raster (Auftrag 4.8 „bleibt, wie sie war“); darin verschwanden Einsätze in
 * der Spalte von heute (gleiche Farbe wie der Block), am Handy standen
 * Kästen in der Karte, ein Lehrling hieß „Helfer“, und Namen wurden
 * abgeschnitten. Jetzt zeigt sie, was die Planung zeigt — und nur das.
 */
export default function TeamWoche() {
  const { user } = useAuth();
  const heute = todayStr();
  const [montag, setMontag] = useState(() => montagDer(heute));
  /** Eingeklappte Gruppen im Raster. */
  const [zuGruppen, setZuGruppen] = useState<Set<string>>(new Set());
  /** Der Tag am Handy — ohne Wahl heute, in einer anderen Woche ihr Montag. */
  const [handyWahl, setHandyWahl] = useState<string | null>(null);
  const tage = useMemo(() => wocheAb(montag), [montag]);
  const d = useWochenDaten(tage);

  /** Samstag, Sonntag, Feiertag ohne Einsatz und Termin — schmal, wie in der Planung. */
  const schmal = useMemo(
    () => new Set(tage.filter((t) => schmalerTag(t, d.einsaetze, d.termine))),
    [tage, d.einsaetze, d.termine],
  );
  const infoFuer = useCallback(
    (tag: string, nummer: string) => ({
      projekt: d.projects.find((p) => p.projectNumber === nummer),
      stand: d.proTag.get(tag)?.baustellen.find((b) => b.nummer === nummer),
    }),
    [d.projects, d.proTag],
  );

  if (!user) return null;

  const kopf = wochenTitel(montag, heute);
  const jetzt = montag === montagDer(heute);
  const handyTag = handyWahl && tage.includes(handyWahl) ? handyWahl : tage.includes(heute) ? heute : tage[0];
  const nichts = () => undefined;
  const grund: RasterGrund = {
    tage,
    heute,
    markiert: null,
    schmal,
    proTag: d.proTag,
    freiJeTag: d.freiJeTag,
    zuAm: d.zuAm,
    einsaetze: d.einsaetze,
    termineAm: d.termineAm,
    darf: false,
    onTag: nichts,
    onEinsatz: nichts,
    onTermin: nichts,
    lesen: true,
    ich: user.uid,
  };

  return (
    <div className="space-y-4 lg:space-y-5" lang="de-AT">
      <PageHeader
        ort="Mein Einsatzplan"
        title="Team-Woche"
        subtitle="Wer ist diese Woche wo"
        hilfe={
          <>
            Zeigt, wer an welchem Tag auf welcher Baustelle eingeteilt ist. Geplant wird im
            Büro; bei Fragen zur Einteilung bitte dort melden. Wer abwesend ist, steht ohne
            Grund da. Der Plan zeigt Einsätze, nicht gebuchte Zeiten. Termine stehen bei denen,
            die daran teilnehmen, und am Einsatz auf derselben Baustelle.
          </>
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
          <Button variant="ghost" aria-label="Woche zurück" className="min-w-touch text-xl sm:text-xl" onClick={() => setMontag(wocheVerschoben(montag, -1))}>
            ‹
          </Button>
          <div className="planung-titelblock">
            <h2 className="planung-titel">{kopf.titel}</h2>
            <p className="planung-kw">{kopf.klein}</p>
          </div>
          <Button variant="ghost" aria-label="Woche vor" className="min-w-touch text-xl sm:text-xl" onClick={() => setMontag(wocheVerschoben(montag, 1))}>
            ›
          </Button>
          {/* Zurück zu heute — nur, wo man nicht schon dort ist. */}
          {!jetzt && (
            <Button variant="ghost" onClick={() => setMontag(montagDer(heute))}>
              Diese Woche
            </Button>
          )}
        </div>
      </div>

      {!d.geladen ? (
        <Card buendig>
          <LoadingState />
        </Card>
      ) : d.gruppen.length === 0 ? (
        <Card buendig>
          <EmptyState>Im Außendienst ist niemand eingetragen — es gibt keinen Plan zu zeigen.</EmptyState>
        </Card>
      ) : (
        <Card buendig>
          <PersonenWoche
            g={grund}
            gruppen={d.gruppen}
            zu={zuGruppen}
            onGruppe={(g) =>
              setZuGruppen((alt) => {
                const neu = new Set(alt);
                if (neu.has(g)) neu.delete(g);
                else neu.add(g);
                return neu;
              })
            }
            brett={d.brett}
            zuFuer={d.zuFuer}
            infoFuer={infoFuer}
          />
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
              darf={false}
              onTag={nichts}
              onEinsatz={nichts}
              onTermin={nichts}
              onTerminNeu={nichts}
              lesen
              ich={user.uid}
            />
          </div>
        </Card>
      )}
    </div>
  );
}
