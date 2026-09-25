import { useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '@/app/AuthContext';
import { listRecentProjects } from '@/lib/db/projects';
import { listEntriesForProjects } from '@/lib/db/timeEntries';
import { subscribeRecentInvoices } from '@/lib/db/invoices';
import { listRecentQuotes } from '@/lib/db/quotes';
import { rechneBaustelle, margenTon, type Nachkalkulation } from './nachkalkulation';
import { materialkosten, KEINE_MATERIALKOSTEN } from './materialkosten';
import { listWorkSheetsForProject } from '@/lib/db/workSheets';
import { listMaterials } from '@/lib/db/materials';
import { katalogAbgeschnitten } from '@/lib/listengrenzen';
import type { Invoice, Material, Project, Quote } from '@/types';
import type { WithId } from '@/lib/db/core';
import Card from '@/components/Card';
import { Zustand } from '@/components/Badge';
import PageHeader from '@/components/PageHeader';
import { List, ListRow } from '@/components/ListRow';
import { SelectField } from '@/components/Field';
import { ErrorState, EmptyState, SkeletonList } from '@/components/States';
import InfoHint from '@/components/InfoHint';
import { fmtStd } from '@/lib/time';

const fmtEUR = (n: number) =>
  `€ ${new Intl.NumberFormat('de-AT', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(n)}`;

/** Prozent mit Komma — überall sonst schreibt die App deutsch. */
const fmtProzent = (n: number) =>
  `${new Intl.NumberFormat('de-AT', { maximumFractionDigits: 1 }).format(n)} %`;

/** Wie viele Baustellen gleichzeitig gerechnet werden. */
const BAUSTELLEN_JE_LAUF = 25;

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
  const [projekte, setProjekte] = useState<WithId<Project>[]>([]);
  const [rechnungen, setRechnungen] = useState<WithId<Invoice>[]>([]);
  const [angebote, setAngebote] = useState<WithId<Quote>[]>([]);
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

  const kosten = company?.costRates;

  useEffect(() => {
    if (!user) return;
    setLoading(true);
    Promise.all([
      listRecentProjects(user.companyId, 300),
      listRecentQuotes(user.companyId),
      listMaterials(user.companyId),
    ])
      .then(([p, q, m]) => {
        setProjekte(p);
        if (
          !selbstGewaehlt.current &&
          !p.some((x) => x.status === 'Abgeschlossen') &&
          p.some((x) => x.status === 'Aktiv')
        ) {
          setStatus('Aktiv');
        }
        setAngebote(q);
        setKatalog(m);
      })
      .catch((e) => setError((e as Error).message))
      .finally(() => setLoading(false));
    return subscribeRecentInvoices(user.companyId, 200, setRechnungen, (e) => setError(e.message));
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
    ])
      .then(([eintraege, scheineJeBaustelle]) => {
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
                rechnungen,
                angebote.find((q) => q.projectNumber === p.projectNumber),
                kosten,
                material,
              );
            })
            // Die schlechtesten oben: eine Auswertung ist eine Arbeitsliste.
            .sort((a, b) => (a.margeProzent ?? 999) - (b.margeProzent ?? 999)),
        );
      })
      .catch(() => setError('Die Zeiten konnten nicht geladen werden.'));
    return () => {
      verworfen = true;
    };
    // Am Inhalt haengen, nicht an der Array-Identitaet.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user, nummern, rechnungen, angebote, katalog, kosten?.fach, kosten?.helper]);

  if (!user) return null;

  return (
    <div className="space-y-6">
      <PageHeader
        title="Nachkalkulation"
        subtitle="Erlös gegen Personalkosten — je Baustelle"
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
        <p className="rounded border border-line bg-surface-2 px-3 py-2 text-sm text-warning">
          Der Materialstamm wurde nur bis zur Obergrenze geladen ({katalog.length} Artikel). Artikel
          darüber hinaus erscheinen unten als „ohne Einkaufspreis", obwohl einer hinterlegt sein
          kann — der Deckungsbeitrag ist dann zu hoch ausgewiesen.
        </p>
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
            <Link to="/settings/saetze" className="font-semibold text-brand underline">
              Einstellungen → Sätze und Kosten → Interne Kostensätze
            </Link>
          </p>
        </Card>
      ) : (
        <>
          {/*
            Der Hinweis zur Auswahl stand hier dauerhaft unter dem Feld. Beim
            ersten Mal erklärt er etwas, ab dem zweiten Mal steht er im Weg —
            deshalb hinter dem „i". Was sich MIT der Auswahl ändert (laufend
            oder abgeschlossen), bleibt sichtbar: das ist keine Erklärung,
            sondern eine Aussage über das, was gerade auf dem Schirm steht.
          */}
          <Card
            title="Auswahl"
            hint={
              <>
                Ein <strong>laufender</strong> Stand ist ein Zwischenstand: es kommen noch
                Stunden dazu, und die Marge kann sich noch drehen. Bei{' '}
                <strong>abgeschlossenen</strong> Baustellen steht das Ergebnis fest. Gerechnet
                werden jeweils die {BAUSTELLEN_JE_LAUF} jüngsten.
              </>
            }
          >
            <SelectField
              id="nkstatus"
              label="Baustellen"
              value={status}
              onChange={(e) => {
                selbstGewaehlt.current = true;
                setStatus(e.target.value as 'Aktiv' | 'Abgeschlossen');
              }}
            >
              <option value="Abgeschlossen">Abgeschlossen</option>
              <option value="Aktiv">Laufend</option>
            </SelectField>
            {status === 'Aktiv' && (
              <p className="mt-2 text-sm text-warning">Zwischenstand — es kommen noch Stunden dazu.</p>
            )}
          </Card>

          {error && <ErrorState message={error} />}

          <Card title="Ergebnis je Baustelle">
            {loading || ergebnisse === null ? (
              <SkeletonList rows={4} />
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
                            ({k.projectNumber})
                          </span>
                        </span>
                      }
                      subtitle={
                        <>
                          <span className="block">
                            Erlös {fmtEUR(k.erloes)} − Personal {fmtEUR(k.personalkosten)}
                            {/*
                              Material steht nur da, wenn welches bekannt ist.
                              Ein „− 0,00 €" läse sich wie „kein Material
                              verbaut" und wäre bei fehlenden Einkaufspreisen
                              genau die falsche Auskunft.
                            */}
                            {k.materialkosten > 0 && <> − Material {fmtEUR(k.materialkosten)}</>} ={' '}
                            <strong>{fmtEUR(k.deckungsbeitrag)}</strong>
                          </span>
                          {k.materialLuecken.length > 0 && (
                            <span className="mt-1 block text-xs text-warning">
                              Ohne Einkaufspreis, deshalb nicht eingerechnet:{' '}
                              {k.materialLuecken.join(', ')}. Der Deckungsbeitrag ist um diesen
                              Betrag zu hoch.
                            </span>
                          )}
                          <span className="mt-1 block text-xs text-ink-muted">
                            {fmtStd(k.fachStunden * 60)} h Facharbeit
                            {k.helferStunden > 0 ? `, ${fmtStd(k.helferStunden * 60)} h Helfer` : ''}
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
                <div className="mt-4 flex flex-wrap items-center rounded-sm border border-line bg-surface-2 px-3 py-2 text-sm text-info">
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
