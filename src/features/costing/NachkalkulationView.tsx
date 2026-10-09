import { useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '@/app/AuthContext';
import { listRecentProjects } from '@/lib/db/projects';
import { listEntriesForProjects } from '@/lib/db/timeEntries';
import { listInvoicesForProject } from '@/lib/db/invoices';
import { listQuotesForProject } from '@/lib/db/quotes';
import { rechneBaustelle, margenTon, type Nachkalkulation } from './nachkalkulation';
import { materialkosten, KEINE_MATERIALKOSTEN } from './materialkosten';
import { listWorkSheetsForProject } from '@/lib/db/workSheets';
import { listMaterials } from '@/lib/db/materials';
import { einkaufspreise, kostensaetze, type Kostensaetze } from '@/lib/db/kosten';
import { katalogAbgeschnitten } from '@/lib/listengrenzen';
import type { Material, Project, Quote } from '@/types';
import type { WithId } from '@/lib/db/core';
import Card from '@/components/Card';
import Hinweiszeile from '@/components/Hinweiszeile';
import { Zustand } from '@/components/Badge';
import PageHeader from '@/components/PageHeader';
import { List, ListRow } from '@/components/ListRow';
import Metric, { MetricRow } from '@/components/Metric';
import { Segmente } from '@/components/LotBausteine';
import { ErrorState, EmptyState, SkeletonList } from '@/components/States';
import InfoHint from '@/components/InfoHint';
import { fmtStd } from '@/lib/time';
import { euro } from '@/lib/betrag';

/** Prozent mit Komma — überall sonst schreibt die App deutsch. */
const fmtProzent = (n: number) =>
  `${new Intl.NumberFormat('de-AT', { maximumFractionDigits: 1 }).format(n)} %`;

/** Wie viele Baustellen gleichzeitig gerechnet werden. */
const BAUSTELLEN_JE_LAUF = 25;

/**
 * Das Angebot, das für die Baustelle zählt: das ANGENOMMENE, wenn es eines
 * gibt. Hängen mehrere an einer Baustelle (ein abgelehntes, ein neues), war
 * es vorher das erste in der Liste — und nur ein angenommenes ist ein Erlös.
 */
function angebotDerBaustelle(angebote: WithId<Quote>[]): WithId<Quote> | undefined {
  return angebote.find((q) => q.status === 'Angenommen') ?? angebote[0];
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
  const { user } = useAuth();
  const [projekte, setProjekte] = useState<WithId<Project>[]>([]);
  /*
    Der Materialstamm, einmal geladen: er trägt die Einkaufspreise. Ohne ihn
    stünde jede Baustelle als „Material ohne Preis" da — und das wäre eine
    Aussage über den Katalog, nicht über die Baustelle.
  */
  const [katalog, setKatalog] = useState<Material[]>([]);
  const [ergebnisse, setErgebnisse] = useState<Nachkalkulation[] | null>(null);
  const [status, setStatus] = useState<'Aktiv' | 'Abgeschlossen'>('Abgeschlossen');
  /*
    OHNE ABGESCHLOSSENE BAUSTELLE BEGINNT DIE ANSICHT BEI DEN LAUFENDEN.
    Ein neuer Betrieb sah sonst „Keine Baustelle in dieser Auswahl", obwohl
    zwei laufende Baustellen Zahlen hätten (Prüflauf 24.09.2026, L7). Hat
    jemand selbst gewählt, bleibt seine Wahl.
  */
  const selbstGewaehlt = useRef(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  /*
    Kostensätze und Einkaufspreise liegen seit dem 29.09.2026 in eigenen
    Tabellen, die nur die Spitze liest (offene Punkte B1) — nicht mehr am
    Betrieb und am Artikel, die jeder lesen kann.
  */
  const [kosten, setKosten] = useState<Kostensaetze | null>(null);

  useEffect(() => {
    if (!user) return;
    setLoading(true);
    Promise.all([
      listRecentProjects(user.companyId, 300),
      listMaterials(user.companyId).then(async (m) => {
        const preise = await einkaufspreise(user.companyId, m.map((x) => x.id));
        return m.map((x) => ({ ...x, einkaufspreis: preise.get(x.id) }));
      }),
      kostensaetze(user.companyId),
    ])
      .then(([p, m, k]) => {
        setKosten(k);
        setProjekte(p);
        if (
          !selbstGewaehlt.current &&
          !p.some((x) => x.status === 'Abgeschlossen') &&
          p.some((x) => x.status === 'Aktiv')
        ) {
          setStatus('Aktiv');
        }
        setKatalog(m);
      })
      .catch((e) => setError((e as Error).message))
      .finally(() => setLoading(false));
  }, [user]);

  const gefiltert = useMemo(
    () =>
      projekte
        .filter((p) => p.status === status)
        // Abgeschlossene zuerst die jüngsten: sie sind noch im Gedächtnis.
        .sort((a, b) => b.projectNumber.localeCompare(a.projectNumber))
        .slice(0, BAUSTELLEN_JE_LAUF),
    [projekte, status],
  );

  const nummern = gefiltert.map((p) => p.projectNumber).join('|');

  /**
   * Die Zeiten der angezeigten Baustellen — gezielt, nicht der ganze Bestand.
   *
   * `listEntriesForProjects` fragt je Baustelle einzeln; deshalb die
   * Obergrenze oben. Ohne sie liefe hier bei einem alten Betrieb genau die
   * Art Abfrage, gegen die die Wachstumsbremse gebaut wurde.
   */
  useEffect(() => {
    if (!user || !kosten || gefiltert.length === 0) {
      setErgebnisse(gefiltert.length === 0 ? [] : null);
      return;
    }
    let verworfen = false;
    const companyId = user.companyId;
    /*
      Die Scheine je Baustelle EINZELN — dieselbe Obergrenze wie oben schützt
      auch hier: höchstens 25 Baustellen, also höchstens 25 Abfragen. Ohne die
      Grenze liefe bei einem alten Betrieb genau die Art Abfrage, gegen die
      die Wachstumsbremse gebaut wurde.
    */
    /*
      RECHNUNGEN UND ANGEBOTE JE BAUSTELLE, nicht die zweihundert jüngsten
      Rechnungen und hundert jüngsten Angebote des Betriebs (Prüflauf
      25.09.2026, P2-13). Eine abgeschlossene Baustelle vom Frühjahr hatte
      ihre Rechnungen längst aus diesem Fenster verloren und stand mit
      „kein Erlös" da — oder mit dem Angebot, das zufällig als erstes kam.
      Dieselbe Obergrenze wie oben hält die Zahl der Abfragen klein.
    */
    Promise.all([
      listEntriesForProjects(
        companyId,
        gefiltert.map((p) => p.projectNumber),
      ),
      Promise.all(
        gefiltert.map((p) =>
          listWorkSheetsForProject(companyId, p.projectNumber).catch(() => null),
        ),
      ),
      Promise.all(gefiltert.map((p) => listInvoicesForProject(companyId, p.projectNumber))),
      Promise.all(
        gefiltert.map((p) => (p.id ? listQuotesForProject(companyId, p.id) : Promise.resolve([]))),
      ),
    ])
      .then(([eintraege, scheineJeBaustelle, rechnungenJeBaustelle, angeboteJeBaustelle]) => {
        if (verworfen) return;
        setErgebnisse(
          gefiltert
            .map((p, i) => {
              const scheine = scheineJeBaustelle[i];
              /*
                Konnten die Scheine nicht geladen werden, wird KEIN Material
                angesetzt — und die Lücke bleibt sichtbar, weil auch keine
                Artikel gemeldet werden. Eine Null wäre hier dasselbe wie
                „kein Material verbaut", und das ist eine andere Aussage.
              */
              const material = scheine ? materialkosten(scheine, katalog) : KEINE_MATERIALKOSTEN;
              return rechneBaustelle(
                p.projectNumber,
                p.customerName,
                eintraege,
                rechnungenJeBaustelle[i],
                angebotDerBaustelle(angeboteJeBaustelle[i]),
                kosten,
                material,
                katalog,
              );
            })
            // Die schlechtesten oben: eine Auswertung ist eine Arbeitsliste.
            .sort((a, b) => (a.margeProzent ?? 999) - (b.margeProzent ?? 999)),
        );
      })
      .catch(() => setError('Zeiten, Rechnungen oder Angebote der Baustellen konnten nicht geladen werden.'));
    return () => {
      verworfen = true;
    };
    // Am Inhalt haengen, nicht an der Array-Identitaet.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user, nummern, katalog, kosten?.fach, kosten?.helper]);

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
  const inAuswahl = projekte.filter((p) => p.status === status).length;

  if (!user) return null;

  return (
    // Abstände der Designlinie „Fassung 3": 12 px am Telefon, 20 px am Schreibtisch.
    <div className="space-y-3 lg:space-y-5">
      <PageHeader
        ort="Geld"
        title="Nachkalkulation"
        subtitle="Erlös gegen Personal- und Materialkosten — je Baustelle"
      />

      {/*
        WENN DER KATALOG NICHT GANZ GELADEN WURDE, MUSS DAS HIER STEHEN.

        Material wird über den NAMEN zugeordnet, nicht über eine Kennung — ein
        Artikel, der wegen der Obergrenze fehlt, findet seinen Einkaufspreis
        also nicht. Falsch wird die Zahl dadurch nicht: der Artikel landet in
        „ohne Einkaufspreis" und steht sichtbar bei der Baustelle. Aber der
        GRUND wäre ein anderer als sonst — dort heisst es „im Materialstamm
        nicht gepflegt", und hier stimmt das nicht. Wer dem nachginge, suchte
        an der falschen Stelle.
      */}
      {katalogAbgeschnitten(katalog) && (
        <Hinweiszeile stufe="warn">
          <p>
            Der Materialstamm wurde nur bis zur Obergrenze geladen ({katalog.length} Artikel).
            Artikel darüber hinaus erscheinen unten als „ohne Einkaufspreis“, obwohl einer
            hinterlegt sein kann — der Deckungsbeitrag ist dann zu hoch ausgewiesen.
          </p>
        </Hinweiszeile>
      )}

      {/*
        Ohne interne Kostensaetze laesst sich nichts rechnen. Das ausdruecklich
        sagen und den Weg zeigen, statt eine leere Liste zu zeigen, die wie ein
        Fehler aussieht.
      */}
      {!kosten ? (
        <Card title="Kostensätze fehlen">
          <p className="text-sm text-ink">
            Für die Nachkalkulation wird gebraucht, was eine Arbeitsstunde den <strong>Betrieb
            kostet</strong> — Lohn, Lohnnebenkosten und anteilige Gemeinkosten. Das ist eine
            andere Zahl als der Verrechnungssatz, der den Erlös bestimmt.
          </p>
          <p className="mt-2 text-sm text-ink-muted">
            Würde man den Verrechnungssatz als Kosten ansetzen, ergäbe jede Baustelle eine Marge
            von null — und das sähe aus wie ein Ergebnis.
          </p>
          <p className="mt-3">
            <Link to="/settings/saetze" className="link-weiter">
              Einstellungen → Sätze und Kosten → Interne Kostensätze
            </Link>
          </p>
        </Card>
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
              onChange={(w) => {
                selbstGewaehlt.current = true;
                setStatus(w);
              }}
            />
            <InfoHint about="die Auswahl">
              Ein <strong>laufender</strong> Stand ist ein Zwischenstand: es kommen noch
              Stunden dazu, und die Marge kann sich noch drehen. Bei{' '}
              <strong>abgeschlossenen</strong> Baustellen steht das Ergebnis fest. Gerechnet
              werden jeweils die {BAUSTELLEN_JE_LAUF} jüngsten.
            </InfoHint>
            {status === 'Aktiv' && (
              <p className="text-sm text-warning">Zwischenstand — es kommen noch Stunden dazu.</p>
            )}
          </div>

          {/* Höchstens vier Zahlen über der Liste: wie viele, und wie viele davon Aufmerksamkeit brauchen. */}
          {!loading && ergebnisse && ergebnisse.length > 0 && (
            <MetricRow>
              <Metric
                label="Baustellen"
                value={ergebnisse.length}
                hint={inAuswahl > ergebnisse.length ? `die ${ergebnisse.length} jüngsten von ${inAuswahl}` : status === 'Aktiv' ? 'laufend' : 'abgeschlossen'}
              />
              <Metric
                label="Mit Verlust"
                value={zaehlung.schlecht}
                tone={zaehlung.schlecht > 0 ? 'danger' : 'default'}
                hint="Deckungsbeitrag unter null"
              />
              <Metric label="Zu prüfen" value={zaehlung.achtung} hint="unter 20 % oder Material ohne Preis" />
              <Metric label="Ohne Erlös" value={zaehlung.ruht} hint="keine Rechnung, kein Angebot" />
            </MetricRow>
          )}

          {error && <ErrorState message={error} />}

          {/* Bündig: Baustellen als Zeilen von Kante zu Kante, darunter die
              Einschränkung als Zeile (Designlinie „Fassung 3"). */}
          <Card title="Ergebnis je Baustelle" buendig>
            {loading || ergebnisse === null ? (
              <div className="p-4">
                <SkeletonList rows={4} />
              </div>
            ) : ergebnisse.length === 0 ? (
              <EmptyState>Keine Baustelle in dieser Auswahl.</EmptyState>
            ) : (
              <>
                <List>
                  {ergebnisse.map((k) => (
                    <ListRow
                      key={k.projectNumber}
                      title={
                        <span>
                          {k.customerName}{' '}
                          <span className="text-sm font-normal text-ink-muted">
                            <span className="nr">({k.projectNumber})</span>
                          </span>
                        </span>
                      }
                      subtitle={
                        <>
                          <span className="block">
                            Erlös {euro(k.erloes)} − Personal {euro(k.personalkosten)}
                            {/*
                              Material steht nur da, wenn welches bekannt ist.
                              Ein „− 0,00 €" läse sich wie „kein Material
                              verbaut" und wäre bei fehlenden Einkaufspreisen
                              genau die falsche Auskunft.
                            */}
                            {k.materialkosten > 0 && <> − Material {euro(k.materialkosten)}</>} ={' '}
                            <strong>{euro(k.deckungsbeitrag)}</strong>
                          </span>
                          {k.materialLuecken.length > 0 && (
                            <span className="mt-1 block text-xs text-warning">
                              Ohne Einkaufspreis, deshalb nicht eingerechnet:{' '}
                              {k.materialLuecken.join(', ')}. Der Deckungsbeitrag ist um deren
                              Einkaufspreis zu hoch; der ist nicht hinterlegt.
                            </span>
                          )}
                          <span className="mt-1 block text-xs text-ink-muted">
                            {fmtStd(k.fachStunden * 60)} h Facharbeit
                            {k.helferStunden > 0 ? `, ${fmtStd(k.helferStunden * 60)} h Helfer` : ''}
                            {k.lehrlingStunden > 0 ? `, ${fmtStd(k.lehrlingStunden * 60)} h Lehrling` : ''}
                            {' · '}
                            {k.erloesQuelle === 'Rechnungen'
                              ? 'Erlös aus Rechnungen'
                              : k.erloesQuelle === 'Angebot'
                                ? 'Erlös aus dem Angebot — noch nicht verrechnet'
                                : 'kein Erlös hinterlegt'}
                          </span>
                        </>
                      }
                    >
                      <Zustand stand={margenTon(k)}>
                        {k.margeProzent === null ? 'keine Aussage' : fmtProzent(k.margeProzent)}
                      </Zustand>
                    </ListRow>
                  ))}
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
        </>
      )}
    </div>
  );
}
