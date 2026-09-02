import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '@/app/AuthContext';
import { listRecentProjects } from '@/lib/db/projects';
import { listEntriesForProjects } from '@/lib/db/timeEntries';
import { subscribeRecentInvoices } from '@/lib/db/invoices';
import { listRecentQuotes } from '@/lib/db/quotes';
import { rechneBaustelle, margenTon, type Nachkalkulation } from './nachkalkulation';
import type { Invoice, Project, Quote } from '@/types';
import type { WithId } from '@/lib/db/core';
import Card from '@/components/Card';
import Badge from '@/components/Badge';
import PageHeader from '@/components/PageHeader';
import { List, ListRow } from '@/components/ListRow';
import { SelectField } from '@/components/Field';
import { ErrorState, EmptyState, SkeletonList } from '@/components/States';

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
  const [ergebnisse, setErgebnisse] = useState<Nachkalkulation[] | null>(null);
  const [status, setStatus] = useState<'Aktiv' | 'Abgeschlossen'>('Abgeschlossen');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const kosten = company?.costRates;

  useEffect(() => {
    if (!user) return;
    setLoading(true);
    Promise.all([listRecentProjects(user.companyId, 300), listRecentQuotes(user.companyId)])
      .then(([p, q]) => {
        setProjekte(p);
        setAngebote(q);
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
    listEntriesForProjects(
      user.companyId,
      gefiltert.map((p) => p.projectNumber),
    )
      .then((eintraege) => {
        if (verworfen) return;
        setErgebnisse(
          gefiltert
            .map((p) =>
              rechneBaustelle(
                p.projectNumber,
                p.customerName,
                eintraege,
                rechnungen,
                angebote.find((q) => q.projectNumber === p.projectNumber),
                kosten,
              ),
            )
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
  }, [user, nummern, rechnungen, angebote, kosten?.fach, kosten?.helper]);

  if (!user) return null;

  return (
    <div className="space-y-6">
      <PageHeader
        title="Nachkalkulation"
        subtitle="Erlös gegen Personalkosten — je Baustelle"
      />

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
              In den Einstellungen hinterlegen
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
              onChange={(e) => setStatus(e.target.value as 'Aktiv' | 'Abgeschlossen')}
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
                          <span className="tnum text-sm font-normal text-ink-muted">
                            ({k.projectNumber})
                          </span>
                        </span>
                      }
                      subtitle={
                        <>
                          <span className="tnum block">
                            Erlös {fmtEUR(k.erloes)} − Personal {fmtEUR(k.personalkosten)} ={' '}
                            <strong>{fmtEUR(k.deckungsbeitrag)}</strong>
                          </span>
                          <span className="mt-1 block text-xs text-ink-muted">
                            {k.fachStunden} h Facharbeit
                            {k.helferStunden > 0 ? `, ${k.helferStunden} h Helfer` : ''}
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
                      <Badge tone={margenTon(k)}>
                        {k.margeProzent === null ? 'keine Aussage' : fmtProzent(k.margeProzent)}
                      </Badge>
                    </ListRow>
                  ))}
                </List>

                {/*
                  Die Einschraenkung gehoert unter die Zahlen, nicht ins
                  Kleingedruckte: „Deckungsbeitrag" als „Gewinn" zu lesen ist
                  der naheliegende Fehler, und darauf trifft jemand
                  Entscheidungen.
                */}
                <p className="mt-4 rounded-sm border border-info/30 bg-info-bg px-3 py-2 text-sm text-info">
                  <strong>Deckungsbeitrag, nicht Gewinn.</strong> Materialkosten sind nicht
                  enthalten — die Materialanforderung trägt in dieser App bewusst keinen Preis.
                  Ebenso wenig Gemeinkosten, soweit sie nicht schon im Kostensatz stecken. Eine
                  Baustelle mit dünnem Deckungsbeitrag ist damit im Ergebnis vermutlich negativ.
                </p>
              </>
            )}
          </Card>
        </>
      )}
    </div>
  );
}
