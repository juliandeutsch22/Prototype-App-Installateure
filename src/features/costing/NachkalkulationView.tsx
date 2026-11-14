import { useEffect, useMemo, useState } from 'react';
import { useAuth } from '@/app/AuthContext';
import { canAccess, zusatzrechte } from '@/app/navigation';
import { listRecentProjects } from '@/lib/db/projects';
import { margenTon } from './nachkalkulation';
import { rechneBaustellen, type NachkalkulationZeile } from './nachkalkulationLaden';
import NachkalkulationDetail from './NachkalkulationDetail';
import { erloesHerkunft, fmtProzent, lueckenKurz, zeichenVon } from './nachkalkulationText';
import { kostensaetze, type Kostensaetze } from '@/lib/db/kosten';
import type { Project } from '@/types';
import type { WithId } from '@/lib/db/core';
import Card from '@/components/Card';
import { Zustand } from '@/components/Badge';
import LotZeichnung from '@/components/LotZeichnung';
import { Masslinie } from '@/components/Planlinie';
import PageHeader from '@/components/PageHeader';
import { List, ListRow } from '@/components/ListRow';
import Metric, { MetricRow } from '@/components/Metric';
import { Segmente } from '@/components/LotBausteine';
import { ErrorState, EmptyState, SkeletonList } from '@/components/States';
import InfoHint from '@/components/InfoHint';
import KnopfLink from '@/components/KnopfLink';
import { euro } from '@/lib/betrag';
import { abfrageSpeicher, schluessel, useZwischengespeichert } from '@/lib/zwischenspeicher';

/** Wie viele Baustellen gleichzeitig gerechnet werden. */
const BAUSTELLEN_JE_LAUF = 25;

type Auswahl = 'Aktiv' | 'Abgeschlossen';

/**
 * Gehört die Baustelle in die Auswahl? „Laufend“ heißt Aktiv ODER Pausiert
 * (Befund 09.11.2026), wie in der Baustellenwahl (`BaustellenSelect`): eine
 * pausierte Baustelle ist nicht abgeschlossen, und vorher stand sie in
 * keiner der beiden Auswahlen — ihre Zahlen waren nirgends zu sehen.
 */
function inAuswahl(p: Pick<Project, 'status'>, status: Auswahl): boolean {
  return status === 'Aktiv' ? p.status === 'Aktiv' || p.status === 'Pausiert' : p.status === status;
}

/** Die Baustellen einer Auswahl, die gerechnet werden: die jüngsten zuerst, höchstens 25. */
function auswahlVon(projekte: readonly WithId<Project>[], status: Auswahl): WithId<Project>[] {
  return projekte
    .filter((p) => inAuswahl(p, status))
    // Abgeschlossene zuerst die jüngsten: sie sind noch im Gedächtnis.
    .sort((a, b) => b.projectNumber.localeCompare(a.projectNumber))
    .slice(0, BAUSTELLEN_JE_LAUF);
}

/**
 * Nachkalkulation — hat die Baustelle Geld verdient?
 *
 * Die Budget-Ampel in der Projektauswertung vergleicht Stunden gegen
 * Stundenbudget: sie sagt, ob mehr gearbeitet wurde als geplant. Sie sagt
 * nicht, ob dabei etwas übrig geblieben ist. Eine Baustelle kann im
 * Stundenbudget bleiben und trotzdem Verlust machen, wenn der Preis zu
 * niedrig kalkuliert war.
 *
 * Nur für die Geschäftsführung: hier stehen Margen.
 */
export default function NachkalkulationView() {
  const { user, company } = useAuth();
  const companyId = user?.companyId ?? '';

  /*
    Kostensätze und Einkaufspreise liegen seit dem 29.09.2026 in eigenen
    Tabellen, die nur die Spitze liest (offene Punkte B1) — nicht mehr am
    Betrieb und am Artikel, die jeder lesen kann.

    ZWISCHENGESPEICHERT (Auftrag 04.11.2026): beim zweiten Besuch steht der
    letzte Stand sofort da und wird im Hintergrund nachgesehen, wie auf den
    anderen Seiten (`zwischenspeicher.ts`).
  */
  const grund = useZwischengespeichert<{ projekte: WithId<Project>[]; kosten: Kostensaetze | null }>({
    queryKey: user ? schluessel('nachkalkulationGrund', user) : ['nachkalkulationGrund'],
    enabled: !!user,
    queryFn: async () => {
      const [projekte, kosten] = await Promise.all([listRecentProjects(companyId, 300), kostensaetze(companyId)]);
      return { projekte, kosten };
    },
  });
  const projekte = useMemo(() => grund.data?.projekte ?? [], [grund.data]);
  const kosten = grund.data?.kosten ?? null;

  /*
    OHNE ABGESCHLOSSENE BAUSTELLE BEGINNT DIE ANSICHT BEI DEN LAUFENDEN.
    Ein neuer Betrieb sah sonst „Keine Baustelle in dieser Auswahl", obwohl
    zwei laufende Baustellen Zahlen hätten (Prüflauf 24.09.2026, L7). Hat
    jemand selbst gewählt, bleibt seine Wahl.
  */
  const [gewaehlt, setGewaehlt] = useState<Auswahl | null>(null);
  const status: Auswahl = gewaehlt
    ?? (!projekte.some((x) => x.status === 'Abgeschlossen') && projekte.some((x) => inAuswahl(x, 'Aktiv')) ? 'Aktiv' : 'Abgeschlossen');

  /*
    EINE ABFRAGE JE AUSWAHL, GEMERKT (Auftrag 04.11.2026: „beim Tabwechsel
    wird Inhalt oft noch nachgeladen“). Vorher rechnete jeder Wechsel
    zwischen „Abgeschlossen“ und „Laufend“ alles neu, auch zurück zur eben
    gesehenen Auswahl. Jetzt hängt das Ergebnis an Auswahl, Baustellen und
    Kostensätzen; steht die eine Auswahl, wird die andere im Hintergrund
    gerechnet — der Wechsel zeigt sie sofort.
  */
  const abfrageFuer = (st: Auswahl) => {
    const baustellen = auswahlVon(projekte, st);
    return {
      queryKey: user
        ? schluessel('nachkalkulation', user, st, baustellen.map((p) => `${p.id}:${p.projectNumber}`), kosten)
        : ['nachkalkulation'],
      queryFn: () => rechneBaustellen(companyId, baustellen, kosten as Kostensaetze),
    };
  };
  const auswahl = useMemo(() => auswahlVon(projekte, status), [projekte, status]);
  const ergebnis = useZwischengespeichert<NachkalkulationZeile[]>({
    ...abfrageFuer(status),
    enabled: !!user && !!kosten && auswahl.length > 0,
  });
  const andere: Auswahl = status === 'Aktiv' ? 'Abgeschlossen' : 'Aktiv';
  const andereDa = auswahlVon(projekte, andere).length > 0;
  useEffect(() => {
    if (!user || !kosten || !ergebnis.isSuccess || !andereDa) return;
    // Schlägt das Vorrechnen fehl, rechnet der Wechsel selbst und sagt es dann.
    abfrageSpeicher.ensureQueryData(abfrageFuer(andere)).catch(() => undefined);
    // Am Inhalt hängen, nicht an der Identität der Funktion.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user, kosten, ergebnis.isSuccess, andere, andereDa, projekte]);

  const ergebnisse = useMemo<NachkalkulationZeile[] | null>(
    () => (auswahl.length === 0 ? [] : ergebnis.data ?? null),
    [auswahl.length, ergebnis.data],
  );
  const fehler = grund.isError
    ? grund.error.message
    : ergebnis.isError
      ? 'Zeiten, Rechnungen, Angebote oder Materialpreise der Baustellen konnten nicht geladen werden.'
      : null;
  /*
    EIN FEHLER MIT NÄCHSTEM SCHRITT (V10, 13.11.2026; Auftrag 9.6): dieselbe
    Abfrage noch einmal — die Grundlage, wenn sie fehlt, sonst das Ergebnis.
    Vorher stand nur „Das hat nicht geklappt“ ohne Weg weiter.
  */
  const nochmal = () => void (grund.isError ? grund.refetch() : ergebnis.refetch());

  /** Die Baustelle im Seitenfenster — über ihre Nummer, damit ein neuer Stand sie mitnimmt. */
  const [offen, setOffen] = useState<string | null>(null);
  const offeneZeile = ergebnisse?.find((k) => k.projectNumber === offen) ?? null;
  const katalogWeg = user && canAccess(user.role, '/lager', company?.modules, zusatzrechte(user, company))
    ? '/lager?reiter=katalog'
    : undefined;

  /*
    DIE KENNZAHLEN ZÄHLEN NUR, WAS DIE ZEILEN SCHON SAGEN: je Baustelle den
    Zustand aus `margenTon`. Eine Summe der Deckungsbeiträge steht bewusst
    nicht da — Baustellen ohne Erlös hätten sie mit ihren Personalkosten ins
    Minus gezogen, und eine solche Zahl wäre eine neue Rechnung, keine
    Darstellung.
  */
  const zaehlung = useMemo(() => {
    const z = { schlecht: 0, achtung: 0, ruht: 0 };
    for (const k of ergebnisse ?? []) {
      const t = margenTon(k);
      if (t === 'schlecht' || t === 'achtung' || t === 'ruht') z[t] += 1;
    }
    return z;
  }, [ergebnisse]);
  const zahlInAuswahl = projekte.filter((p) => inAuswahl(p, status)).length;
  const loading = grund.isPending;

  if (!user) return null;

  return (
    // Abstände der Designlinie „Fassung 3": 12 px am Telefon, 20 px am Schreibtisch.
    <div className="space-y-3 lg:space-y-5">
      <PageHeader
        ort="Geld"
        title="Nachkalkulation"
        subtitle="Erlös gegen Personal- und Materialkosten — je Baustelle"
        hilfe={
          <>
            „Mit Verlust“ heißt: der Deckungsbeitrag liegt unter null. „Zu prüfen“: unter 20 %
            Marge oder Material ohne Einkaufspreis. „Ohne Erlös“: weder Rechnung noch Angebot.
          </>
        }
        /*
          Höchstens vier Zahlen im Seitenkopf (E24): wie viele, und wie viele davon
          Aufmerksamkeit brauchen — für die Auswahl darunter, deshalb nennt der
          Zusatz bei „Baustellen“, welche es sind. Was die anderen drei meinen,
          steht in der Hilfe.
        */
        stand={kosten && !loading && ergebnisse && ergebnisse.length > 0 ? (
          <MetricRow>
            <Metric
              label="Baustellen"
              value={ergebnisse.length}
              hint={zahlInAuswahl > ergebnisse.length ? `die ${ergebnisse.length} jüngsten von ${zahlInAuswahl}` : status === 'Aktiv' ? 'laufend' : 'abgeschlossen'}
            />
            <Metric
              label="Mit Verlust"
              value={zaehlung.schlecht}
              tone={zaehlung.schlecht > 0 ? 'danger' : 'default'}
            />
            <Metric label="Zu prüfen" value={zaehlung.achtung} />
            <Metric label="Ohne Erlös" value={zaehlung.ruht} />
          </MetricRow>
        ) : undefined}
      />


      {/*
        Ohne interne Kostensaetze laesst sich nichts rechnen. Das ausdruecklich
        sagen und den Weg zeigen, statt eine leere Liste zu zeigen, die wie ein
        Fehler aussieht.
      */}
      {loading ? (
        <Card buendig>
          <div className="p-4">
            <SkeletonList rows={4} />
          </div>
        </Card>
      ) : grund.isError && !grund.data ? (
        /* Nicht geladen ist nicht „Kostensätze fehlen“: das wäre ein falscher Weg in die Einstellungen. */
        <ErrorState message={fehler ?? 'Die Nachkalkulation konnte nicht geladen werden.'} onRetry={nochmal} />
      ) : !kosten ? (
        /*
          EINE FEHLENDE VORAUSSETZUNG, KEINE LEERE (Planlinie § 6): die kleine
          Einrichtungs-Zeichnung wie bei den Firmendaten, nicht die große
          eines Leerzustands — hier fehlt keine Baustelle, sondern ein Satz.
        */
        <section className="lot-einrichtung nachkalk-einrichtung" aria-labelledby="nachkalk-saetze-fehlen">
          <LotZeichnung motiv="einrichtung" art="hinweis" />
          {/*
            EIN SATZ UND EIN KNOPF (D5, E86). Zwei Absätze Erklärung standen
            offen auf der Seite; warum der Verrechnungssatz nicht als Kosten
            taugt, steht jetzt in der Hilfe der Seite.
          */}
          <div>
            <h2 id="nachkalk-saetze-fehlen">Kostensätze fehlen</h2>
            <p className="mt-1">
              Gerechnet wird, sobald feststeht, was eine Arbeitsstunde den Betrieb kostet.
            </p>
            <InfoHint about="Kostensätze">
              Für die Nachkalkulation wird gebraucht, was eine Arbeitsstunde den <strong>Betrieb
              kostet</strong> — Lohn, Lohnnebenkosten und anteilige Gemeinkosten. Das ist eine
              andere Zahl als der Verrechnungssatz, der den Erlös bestimmt. Würde man den
              Verrechnungssatz als Kosten ansetzen, ergäbe jede Baustelle eine Marge von null —
              und das sähe aus wie ein Ergebnis. Eingetragen werden sie unter Einstellungen →
              Sätze und Kosten → Interne Kostensätze.
            </InfoHint>
            <div className="mt-3">
              <KnopfLink to="/settings/saetze">Kostensätze eintragen</KnopfLink>
            </div>
          </div>
        </section>
      ) : (
        <>
          {/*
            DIE AUSWAHL ALS SEGMENTE (Linie „Lot“): zwei Werte, ein Tipp —
            statt einer Auswahlliste in einer eigenen Karte. Die Erklärung
            dazu steht hinter dem „i“ (und damit in „Hilfe zu dieser Seite“);
            was sich MIT der Auswahl ändert, bleibt sichtbar: das ist keine
            Erklärung, sondern eine Aussage über das, was gerade dasteht.
          */}
          <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
            <Segmente
              name="Baustellen"
              werte={[
                { wert: 'Abgeschlossen', text: 'Abgeschlossen' },
                { wert: 'Aktiv', text: 'Laufend' },
              ]}
              wert={status}
              onChange={setGewaehlt}
            />
            <InfoHint about="die Auswahl">
              Ein <strong>laufender</strong> Stand ist ein Zwischenstand: es kommen noch
              Stunden dazu, und die Marge kann sich noch drehen. Laufend sind aktive und
              pausierte Baustellen. Bei{' '}
              <strong>abgeschlossenen</strong> Baustellen steht das Ergebnis fest. Gerechnet
              werden jeweils die {BAUSTELLEN_JE_LAUF} jüngsten.
            </InfoHint>
            {status === 'Aktiv' && (
              <p className="text-sm text-warning">Zwischenstand — es kommen noch Stunden dazu.</p>
            )}
          </div>

          {/* Scheitert nur das Nachsehen im Hintergrund, bleibt die Liste stehen und der Fehler darüber. */}
          {fehler && ergebnisse !== null && <ErrorState message={fehler} onRetry={nochmal} />}

          {/* Bündig: Baustellen als Zeilen von Kante zu Kante, darunter die
              Einschränkung als Zeile (Designlinie „Fassung 3"). */}
          <Card title="Ergebnis je Baustelle" buendig>
            {ergebnisse === null ? (
              <div className="p-4">
                {/* Nicht gerechnet ist nicht „lädt noch“: ohne Ergebnis steht der Fehler, kein Platzhalter. */}
                {fehler ? <ErrorState message={fehler} onRetry={nochmal} /> : <SkeletonList rows={4} />}
              </div>
            ) : ergebnisse.length === 0 ? (
              <EmptyState>Keine Baustelle in dieser Auswahl.</EmptyState>
            ) : (
              <>
                <List>
                  {ergebnisse.map((k) => {
                    /*
                      KOSTEN GEGEN ERLÖS ALS MASSLINIE (Planlinie B2): die
                      Kosten laufen gegen den Erlös als Grenze, ein Verlust
                      läuft rot über ihn hinaus; der Deckungsbeitrag steht als
                      Betrag daneben. Ohne Erlös gibt es keine Grenze und
                      damit keine Linie.

                      DIE ZEILE SAGT, WIE ES STEHT — DAS FENSTER, WARUM
                      (Auftrag 04.11.2026: „viel Text, sehr unübersichtlich“).
                      Bis dahin standen hier drei Zeilen: Personal und
                      Material, die Artikel ohne Einkaufspreis als ganzer
                      Satz, Stunden und Herkunft des Erlöses. Die Zeile nennt
                      jetzt nur die Herkunft und wie viele Artikel ohne Preis
                      sind; ein Tipp öffnet die Aufstellung.
                    */
                    const summe = k.personalkosten + k.materialkosten;
                    return (
                      <ListRow
                        key={k.projectNumber}
                        title={k.customerName}
                        nummer={k.projectNumber}
                        onOeffnen={() => setOffen(k.projectNumber)}
                        ausgewaehlt={offen === k.projectNumber}
                        pfeil
                        gestapelt
                        subtitle={
                          <span className="nachkalk-meta">
                            <span>{erloesHerkunft(k)}</span>
                            {k.materialLuecken.length > 0 && (
                              <span className="text-warning">{lueckenKurz(k.materialLuecken.length)}</span>
                            )}
                          </span>
                        }
                        zustand={
                          <Zustand stand={zeichenVon(margenTon(k))}>
                            {k.margeProzent === null ? 'keine Aussage' : fmtProzent(k.margeProzent)}
                          </Zustand>
                        }
                        wert={
                          <span className="zeile-zahlen">
                            {k.erloes > 0 && (
                              <span className="zeile-zahlen-linie">
                                <Masslinie
                                  schmal
                                  ist={summe}
                                  soll={k.erloes}
                                  istText={`Kosten ${euro(summe)}`}
                                  sollText={`Erlös ${euro(k.erloes)}`}
                                  name={`Kosten ${euro(summe)} von ${euro(k.erloes)} Erlös, Deckungsbeitrag ${euro(k.deckungsbeitrag)}`}
                                />
                              </span>
                            )}
                            <span className="zeile-zahlen-betrag">
                              {euro(k.deckungsbeitrag)}
                              <small>Deckungsbeitrag</small>
                            </span>
                          </span>
                        }
                      />
                    );
                  })}
                </List>

                {/*
                  Die Einschraenkung gehoert unter die Zahlen, nicht ins
                  Kleingedruckte: „Deckungsbeitrag" als „Gewinn" zu lesen ist
                  der naheliegende Fehler, und darauf trifft jemand
                  Entscheidungen.
                */}
                <div className="flex flex-wrap items-center border-t border-line px-4 py-3 text-sm text-ink-muted [&_strong]:text-ink-deep">
                  <strong>Deckungsbeitrag, nicht Gewinn.</strong>
                  {/*
                    Die Warnung selbst bleibt stehen — sie ist die Aussage.
                    Was NICHT enthalten ist, war der lange Teil und ist beim
                    zweiten Blick bekannt; das steht jetzt im „i".
                  */}
                  <InfoHint about="Deckungsbeitrag">
                    Material zählt mit, soweit im Materialstamm ein <strong>Einkaufspreis</strong>
                    {' '}hinterlegt ist — gezählt wird, was auf den unterschriebenen
                    Handwerksscheinen steht. Artikel ohne Preis werden beim Namen genannt und
                    nicht geschätzt; solange dort etwas steht, ist der Deckungsbeitrag zu hoch.
                    Nicht enthalten sind Gemeinkosten, soweit sie nicht schon im Stundenkostensatz
                    stecken.
                  </InfoHint>
                </div>
              </>
            )}
          </Card>

          <NachkalkulationDetail
            k={offeneZeile}
            laufend={status === 'Aktiv'}
            katalogWeg={katalogWeg}
            onClose={() => setOffen(null)}
          />
        </>
      )}
    </div>
  );
}
