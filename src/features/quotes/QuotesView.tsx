import { useEffect, useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { useAuth } from '@/app/AuthContext';
import {
  listRecentQuotes,
  createQuote,
  updateQuote,
  deleteQuote,
  reserveQuoteNumber,
} from '@/lib/db/quotes';
import { listCustomers } from '@/lib/db/customers';
import { angebotAnnehmen, annahmeMeldung } from './angebotAnnehmen';
import { calcTotals, cent, positionNetto, type InvoicePosition } from '@/features/invoices/totals';
import { INVOICE_DEFAULTS } from '@/features/invoices/assemble';
import { todayStr, localDateStr } from '@/lib/time';
import { isGF } from '@/lib/permissions';
import type { Customer, Quote } from '@/types';
import type { WithId } from '@/lib/db/core';
import InfoHint from '@/components/InfoHint';
import KundenGrenze from '@/components/AuswahlGrenze';
import Card from '@/components/Card';
import Button from '@/components/Button';
import Icon from '@/components/Icon';
import { Zustand } from '@/components/Badge';
import { STAND } from './stand';
import IconButton from '@/components/IconButton';
import PageHeader from '@/components/PageHeader';
import { praefixeVon } from '@/lib/praefixe';
import ConfirmDialog from '@/components/ConfirmDialog';
import { InputField, SelectField, FormGrid } from '@/components/Field';
import { List, ListRow } from '@/components/ListRow';
import { useToast } from '@/components/Toast';
import { ErrorState, EmptyState, SkeletonList } from '@/components/States';
import { grundAus } from '@/lib/fehlerGrund';

const fmtEUR = (n: number) =>
  `€ ${new Intl.NumberFormat('de-AT', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(n)}`;

/** Zahl aus einem Eingabefeld — akzeptiert Komma wie Punkt. */
function num(v: string): number {
  const n = Number(v.replace(',', '.'));
  return Number.isFinite(n) ? n : 0;
}

interface ZeilenEingabe {
  label: string;
  qty: string;
  unit: string;
  unitPrice: string;
  /** Zählt diese Zeile als Facharbeiterstunde ins Budget? */
  istArbeitszeit: boolean;
  /**
   * Hat jemand den Haken selbst gesetzt oder entfernt? Solange nicht, folgt
   * er der Einheit — siehe `istStundenEinheit`.
   */
  hakenVonHand?: boolean;
}

/*
  DER HAKEN FOLGT DER EINHEIT, BIS JEMAND IHN ANFASST.

  Jede neue Position beginnt mit „h" und angehaktem „Zählt als Arbeitszeit".
  Wer die Einheit auf „Stk" änderte, behielt den Haken — und die Armatur
  zählte als Stunde. Im Probelauf: 16 Stunden Montage plus eine Armatur
  ergaben ein Budget von 17 h; zwanzig Rohrschellen wären zwanzig Stunden
  gewesen. Die Ampel der Baustelle misst danach gegen ein Budget, das es nie
  gab, und bleibt grün, während der Auftrag reisst.

  Wer den Haken von Hand setzt oder entfernt, behält ihn: die
  Anfahrtspauschale in „h" ist genau der Fall, für den es ihn gibt.
*/
function istStundenEinheit(einheit: string): boolean {
  return /^(h|std\.?|stunden?)$/i.test(einheit.trim());
}

const LEERE_ZEILE: ZeilenEingabe = {
  label: '',
  qty: '',
  unit: 'h',
  unitPrice: '',
  istArbeitszeit: true,
};

/**
 * Angebote und Vorkalkulation.
 *
 * Der fehlende Schritt vor der Baustelle. Bisher begann alles beim Auftrag,
 * und die kalkulierten Stunden landeten von Hand abgetippt im
 * Baustellenformular — die Budget-Ampel maß gegen eine Zahl ohne Herkunft.
 *
 * Wird ein Angebot angenommen, entsteht die Baustelle daraus, samt
 * Stundenbudget. Erst damit bedeutet die Ampel etwas.
 */
export default function QuotesView() {
  const { user, company } = useAuth();
  const vorsaetze = praefixeVon(company);
  const toast = useToast();

  const [angebote, setAngebote] = useState<WithId<Quote>[]>([]);
  const [kunden, setKunden] = useState<WithId<Customer>[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  /*
    LISTE ZUERST — gemessen: am Telefon begann „Angebote" bei 1332 px, also
    gut zwei Bildschirme unter der Kante. Das Kalkulationsformular ist das
    längste der vier und der seltenste Vorgang; nachgeschlagen wird täglich.

    Dasselbe Muster wie in `WartungenView`, nicht ein neues.
  */
  const [formOffen, setFormOffen] = useState(false);
  const [toDelete, setToDelete] = useState<WithId<Quote> | null>(null);

  // Formular
  const [customerId, setCustomerId] = useState('');
  const [address, setAddress] = useState('');
  const [validUntil, setValidUntil] = useState(() => {
    const d = new Date();
    d.setDate(d.getDate() + 30);
    return localDateStr(d);
  });
  const [notes, setNotes] = useState('');
  const [zeilen, setZeilen] = useState<ZeilenEingabe[]>([{ ...LEERE_ZEILE }]);
  /**
   * Der Entwurf, der gerade bearbeitet wird — oder `null` beim Anlegen.
   *
   * Nur Entwürfe: was beim Kunden liegt, ändert sich nicht mehr. Dieselbe
   * Grenze steht in `angebot_speichern`.
   */
  const [bearbeitet, setBearbeitet] = useState<WithId<Quote> | null>(null);
  /** Gespeicherte Stunden eines alten Angebots, dessen Haken abgeleitet wurden. */
  const [stundenVorher, setStundenVorher] = useState<number | null>(null);
  const [suchParameter, setSuchParameter] = useSearchParams();

  /*
    DER STEUERSATZ DES ANGEBOTS, nicht der heutige des Betriebs. Ein Entwurf
    vom Juni rechnet beim Bearbeiten mit dem Satz, mit dem er entstand.
  */
  const vatRate = bearbeitet?.vatRate ?? company?.rates?.vatRate ?? INVOICE_DEFAULTS.vatRate;
  const darfAendern = user ? isGF(user.role) : false;

  const laden = useMemo(
    () => async () => {
      if (!user) return;
      setLoading(true);
      try {
        const [q, k] = await Promise.all([
          listRecentQuotes(user.companyId),
          listCustomers(user.companyId),
        ]);
        setAngebote(q);
        setKunden(k);
      } catch (e) {
        setError((e as Error).message);
      } finally {
        setLoading(false);
      }
    },
    [user],
  );

  useEffect(() => {
    void laden();
  }, [laden]);

  /** Positionen und Summen — dieselbe Rechnung wie bei der Rechnung selbst. */
  const positionen: InvoicePosition[] = useMemo(
    () =>
      zeilen
        .filter((z) => z.label.trim() && num(z.qty) > 0)
        .map((z) => {
          const qty = num(z.qty);
          const unitPrice = cent(num(z.unitPrice));
          return {
            label: z.label.trim(),
            qty,
            unit: z.unit,
            unitPrice,
            netto: positionNetto(qty, unitPrice),
            // Gespeichert, damit ein wieder geöffneter Entwurf ihn nicht raten muss.
            istArbeitszeit: z.istArbeitszeit,
          };
        }),
    [zeilen],
  );

  // Ein Rabatt, den der Entwurf schon trägt, bleibt beim Bearbeiten stehen.
  const rabatt = bearbeitet?.discount ?? null;
  const summen = useMemo(() => calcTotals(positionen, vatRate, rabatt), [positionen, vatRate, rabatt]);

  /**
   * Die kalkulierten Facharbeiterstunden — nur aus Zeilen, die tatsächlich
   * Arbeitszeit sind.
   *
   * Eine Anfahrtspauschale kann die Einheit „h" tragen und ist trotzdem keine
   * Arbeitszeit. Würde man einfach alle Stunden-Zeilen summieren, bekäme die
   * Baustelle ein zu hohes Budget und die Ampel bliebe grün, während der
   * Auftrag längst gerissen ist.
   */
  const kalkulierteStunden = useMemo(
    () =>
      zeilen
        .filter((z) => z.istArbeitszeit && num(z.qty) > 0)
        .reduce((s, z) => s + num(z.qty), 0),
    [zeilen],
  );

  const kunde = kunden.find((k) => k.id === customerId);

  function formularLeeren() {
    setCustomerId('');
    setAddress('');
    setNotes('');
    setZeilen([{ ...LEERE_ZEILE }]);
    setBearbeitet(null);
    setStundenVorher(null);
  }

  /** Einen Entwurf ins Formular holen. */
  function bearbeiten(q: WithId<Quote>) {
    setCustomerId(q.customerId ?? '');
    setAddress(q.address ?? '');
    setValidUntil(q.validUntil);
    setNotes(q.notes ?? '');
    /*
      DER HAKEN „ARBEITSZEIT" STEHT ERST SEIT DEM 24.09. AN DER POSITION.
      Fehlt er, wird er aus der Einheit abgeleitet — und die Ansicht sagt
      das, samt der Stundenzahl, die bisher gespeichert war. Sonst würde aus
      einer Anfahrtspauschale in „h" beim Speichern still Budget.
    */
    const geraten = q.positions.some((p) => p.istArbeitszeit === undefined);
    setStundenVorher(geraten ? q.kalkulierteStunden : null);
    setZeilen(
      q.positions.length
        ? q.positions.map((p) => ({
            label: p.label,
            qty: String(p.qty).replace('.', ','),
            unit: p.unit,
            unitPrice: String(p.unitPrice).replace('.', ','),
            istArbeitszeit: p.istArbeitszeit ?? istStundenEinheit(p.unit),
            hakenVonHand: p.istArbeitszeit !== undefined,
          }))
        : [{ ...LEERE_ZEILE }],
    );
    setBearbeitet(q);
    setError(null);
    setFormOffen(true);
    window.scrollTo?.({ top: 0 });
  }

  /*
    VON DER ANGEBOTSSEITE KOMMEND: `/quotes?bearbeiten=<id>`. Geöffnet wird
    erst, wenn die Liste da ist — und nur ein Entwurf. Der Parameter geht
    danach weg, sonst öffnete jedes Neuladen die Maske wieder.
  */
  const zuBearbeiten = suchParameter.get('bearbeiten');
  useEffect(() => {
    if (!zuBearbeiten || loading) return;
    const q = angebote.find((a) => a.id === zuBearbeiten);
    if (q && q.status === 'Entwurf' && darfAendern) bearbeiten(q);
    setSuchParameter({}, { replace: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [zuBearbeiten, loading, angebote]);

  async function aenderungenSpeichern() {
    if (!bearbeitet || !kunde || positionen.length === 0) return;
    setBusy(true);
    setError(null);
    try {
      await updateQuote(bearbeitet.id, {
        customerId: kunde.id,
        customerName: kunde.name,
        address,
        validUntil,
        positions: positionen,
        discount: rabatt,
        ...summen,
        vatRate,
        kalkulierteStunden,
        notes,
      });
      toast.success(`Angebot ${bearbeitet.quoteNumber} gespeichert`);
      formularLeeren();
      setFormOffen(false);
      await laden();
    } catch (e) {
      // Die Datenbank sagt, warum — etwa „Nur ein Entwurf lässt sich ändern".
      setError(grundAus(e, 'Das Angebot konnte nicht gespeichert werden.'));
    } finally {
      setBusy(false);
    }
  }

  async function anlegen() {
    if (!user || !kunde || positionen.length === 0) return;
    setBusy(true);
    setError(null);
    try {
      const nummer = await reserveQuoteNumber(user.companyId, vorsaetze.angebot);
      await createQuote(user.companyId, {
        quoteNumber: nummer,
        customerId: kunde.id,
        customerName: kunde.name,
        address,
        quoteDate: todayStr(),
        validUntil,
        status: 'Entwurf',
        positions: positionen,
        discount: null,
        // `calcTotals` liefert `discountAmount` mit — dieselbe Rechnung wie
        // bei der Rechnung selbst, damit beide nie auseinanderlaufen.
        ...summen,
        vatRate,
        kalkulierteStunden,
        notes,
      });
      toast.success(`Angebot ${nummer} angelegt`);
      formularLeeren();
      setFormOffen(false);
      await laden();
    } catch (err) {
      setError(grundAus(err, 'Das Angebot konnte nicht angelegt werden.'));
    } finally {
      setBusy(false);
    }
  }

  /*
    STATUS SETZEN MIT MELDUNG. Die Knöpfe riefen `updateQuote` ohne Fang auf:
    scheiterte es, geschah für den Betrachter nichts, und der Fehler landete
    unbemerkt in der Konsole.
  */
  async function status(q: WithId<Quote>, neu: Quote['status'], meldung: string) {
    setBusy(true);
    setError(null);
    try {
      await updateQuote(q.id, { status: neu });
      toast.success(meldung);
      await laden();
    } catch (err) {
      setError(grundAus(err, 'Der Status konnte nicht gespeichert werden.'));
    } finally {
      setBusy(false);
    }
  }

  /** Annehmen — der Ablauf steht in `angebotAnnehmen`, für Liste und Angebotsseite. */
  async function annehmen(q: WithId<Quote>) {
    if (!user) return;
    setBusy(true);
    setError(null);
    try {
      toast.success(annahmeMeldung(await angebotAnnehmen(user.companyId, q, vorsaetze.baustelle)));
      await laden();
    } catch (err) {
      setError(grundAus(err, 'Die Baustelle konnte nicht angelegt werden.'));
    } finally {
      setBusy(false);
    }
  }

  if (!user) return null;

  return (
    <div className="space-y-6">
      <PageHeader
        title="Angebote"
        subtitle="Kalkulieren, versenden, in einen Auftrag überführen"
        action={
          darfAendern && !formOffen ? (
            <Button onClick={() => setFormOffen(true)}><Icon name="plus" size={18} />Neues Angebot</Button>
          ) : undefined
        }
      />

      {/*
        DIE MELDUNG STAND NUR IM AUFGEKLAPPTEN FORMULAR. Annehmen passiert aber
        in der Liste, bei zugeklapptem Formular — scheiterte es, geschah für
        den Betrachter schlicht nichts. Gefunden beim Probelauf; ein Ladefehler
        der Liste blieb auf dieselbe Weise unsichtbar.
      */}
      {error && !formOffen && <ErrorState message={error} />}

      {darfAendern && formOffen && (
        <Card title={bearbeitet ? `Angebot ${bearbeitet.quoteNumber} bearbeiten` : 'Neues Angebot'}>
          <FormGrid>
            <SelectField
              id="anqk"
              label="Kunde"
              value={customerId}
              onChange={(e) => {
                setCustomerId(e.target.value);
                const k = kunden.find((x) => x.id === e.target.value);
                if (k?.address && !address) setAddress(k.address);
              }}
              required
              pflicht
            >
              <option value="">— wählen —</option>
              {kunden.map((k) => (
                <option key={k.id} value={k.id}>
                  {k.name}
                </option>
              ))}
            </SelectField>
            <KundenGrenze kunden={kunden} />
            <InputField
              id="anqgueltig"
              label="Gültig bis"
              type="date"
              value={validUntil}
              onChange={(e) => setValidUntil(e.target.value)}
            />
          </FormGrid>
          <div className="mt-4">
            <InputField
              id="anqadr"
              label="Ort der Leistung"
              value={address}
              onChange={(e) => setAddress(e.target.value)}
            />
          </div>

          <div className="mt-6">
            <span className="section-label">Positionen</span>
            <div className="mt-2 space-y-3">
              {zeilen.map((z, i) => (
                <div key={i} className="rounded border border-line p-3">
                  <InputField
                    id={`anqlabel${i}`}
                    label="Bezeichnung"
                    value={z.label}
                    onChange={(e) =>
                      setZeilen((v) => v.map((x, j) => (j === i ? { ...x, label: e.target.value } : x)))
                    }
                  />
                  <FormGrid>
                    <InputField
                      id={`anqqty${i}`}
                      label="Menge"
                      value={z.qty}
                      onChange={(e) =>
                        setZeilen((v) => v.map((x, j) => (j === i ? { ...x, qty: e.target.value } : x)))
                      }
                    />
                    <InputField
                      id={`anqunit${i}`}
                      label="Einheit"
                      value={z.unit}
                      onChange={(e) =>
                        setZeilen((v) =>
                          v.map((x, j) =>
                            j === i
                              ? {
                                  ...x,
                                  unit: e.target.value,
                                  istArbeitszeit: x.hakenVonHand
                                    ? x.istArbeitszeit
                                    : istStundenEinheit(e.target.value),
                                }
                              : x,
                          ),
                        )
                      }
                    />
                    <InputField
                      id={`anqprice${i}`}
                      label="Einzelpreis netto"
                      value={z.unitPrice}
                      onChange={(e) =>
                        setZeilen((v) =>
                          v.map((x, j) => (j === i ? { ...x, unitPrice: e.target.value } : x)),
                        )
                      }
                    />
                  </FormGrid>
                  {/*
                    Der Haken entscheidet, was als Stundenbudget in die
                    Baustelle wandert. Eine Anfahrtspauschale kann die Einheit
                    „h" tragen und ist trotzdem keine Arbeitszeit — würde sie
                    mitzählen, bekäme die Baustelle ein zu hohes Budget und die
                    Ampel bliebe grün, während der Auftrag längst gerissen ist.
                  */}
                  <label className="mt-2 flex min-h-touch items-center gap-2 text-sm text-ink">
                    <input
                      type="checkbox"
                      checked={z.istArbeitszeit}
                      onChange={(e) =>
                        setZeilen((v) =>
                          v.map((x, j) =>
                            j === i ? { ...x, istArbeitszeit: e.target.checked, hakenVonHand: true } : x,
                          ),
                        )
                      }
                      className="checkbox"
                    />
                    Zählt als Arbeitszeit ins Stundenbudget
                  </label>
                  <div className="mt-2 flex items-center justify-between">
                    <span className="tnum text-sm text-ink-muted">
                      {fmtEUR(positionNetto(num(z.qty), cent(num(z.unitPrice))))}
                    </span>
                    {zeilen.length > 1 && (
                      <IconButton
                        label="Position entfernen"
                        tone="danger"
                        onClick={() => setZeilen((v) => v.filter((_, j) => j !== i))}
                      >
                        ✕
                      </IconButton>
                    )}
                  </div>
                </div>
              ))}
            </div>
            <div className="mt-3">
              <Button
                variant="ghost"
                onClick={() => setZeilen((v) => [...v, { ...LEERE_ZEILE }])}
              >
                Position hinzufügen
              </Button>
            </div>
          </div>

          {/*
            MEHRZEILIG: die Anmerkungen werden beim Annehmen zum Auftragsumfang
            der Baustelle — und der ist oft eine Liste. Dasselbe Feld wie dort.
          */}
          <div className="mt-4 flex flex-col gap-1">
            <label htmlFor="anqnotes" className="text-sm font-medium text-ink">
              Anmerkungen
            </label>
            <textarea
              id="anqnotes"
              rows={3}
              className="min-h-touch rounded border border-line bg-surface px-3 py-2 text-base text-ink placeholder:text-ink-muted focus:border-brand focus:ring-1 focus:ring-brand"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
            />
          </div>

          <div className="mt-4 rounded border border-line bg-surface-2 p-3">
            <p className="tnum text-sm text-ink">
              Netto {fmtEUR(summen.totalNetto)} · USt {fmtEUR(summen.totalVat)} ·{' '}
              <strong>Brutto {fmtEUR(summen.totalBrutto)}</strong>
            </p>
            {/*
              Die Zahl bleibt sichtbar, die Erklärung dazu nicht: sie steht
              beim ersten Angebot im Weg und beim fünfzigsten erst recht.
            */}
            <p className="mt-1 flex flex-wrap items-center text-sm text-ink-muted">
              Kalkulierte Arbeitszeit: <strong className="ml-1">{kalkulierteStunden} h</strong>
              <InfoHint about="kalkulierte Arbeitszeit">
                Diese Stundenzahl wird beim Annehmen des Angebots zum <strong>Stundenbudget</strong>{' '}
                der neuen Baustelle. Daran misst die Auswertung später, ob die Baustelle im Rahmen
                geblieben ist — und die Nachkalkulation, was sie verdient hat.
              </InfoHint>
            </p>
          </div>

          {stundenVorher !== null && (
            <p className="mt-3 rounded border border-line bg-surface-2 p-3 text-sm text-warning" role="status">
              Bei diesem Angebot war nicht gespeichert, welche Positionen als Arbeitszeit zählen.
              Die Haken sind aus der Einheit abgeleitet — bitte prüfen. Bisher kalkuliert:{' '}
              <strong className="tnum">{stundenVorher} h</strong>.
            </p>
          )}

          {error && <div className="mt-3"><ErrorState message={error} /></div>}

          <div className="mt-4">
            <Button
              onClick={bearbeitet ? aenderungenSpeichern : anlegen}
              loading={busy}
              disabled={!customerId || positionen.length === 0}
            >
              {bearbeitet ? 'Änderungen speichern' : 'Angebot anlegen'}
            </Button>
            {/* Der Weg zurück zur Liste. */}
            <Button
              type="button"
              variant="ghost"
              onClick={() => {
                // Ein halb bearbeiteter Entwurf bleibt nicht im Formular stehen.
                if (bearbeitet) formularLeeren();
                setFormOffen(false);
              }}
            >
              Abbrechen
            </Button>
          </div>
        </Card>
      )}

      <Card title={`Angebote (${angebote.length})`}>
        {loading ? (
          <SkeletonList rows={3} />
        ) : angebote.length === 0 ? (
          <EmptyState>Noch kein Angebot erstellt.</EmptyState>
        ) : (
          <List>
            {angebote.map((q) => (
              <ListRow
                key={q.id}
                title={
                  // Die Nummer führt zur Angebotsseite — Positionen, Anmerkungen, PDF.
                  <Link to={`/quotes/${q.id}`} className="text-brand underline">
                    {q.quoteNumber} · {q.customerName}
                  </Link>
                }
                subtitle={
                  <>
                    {q.quoteDate} · gültig bis {q.validUntil} · {fmtEUR(q.totalBrutto)} brutto
                    <span className="mt-1 block text-xs text-ink-muted">
                      {q.kalkulierteStunden} h kalkuliert
                      {q.projectNumber ? ` · Baustelle ${q.projectNumber}` : ''}
                    </span>
                  </>
                }
              >
                <Zustand stand={STAND[q.status]}>{q.status}</Zustand>
                {darfAendern && q.status === 'Entwurf' && (
                  <>
                    <Button variant="ghost" disabled={busy} onClick={() => bearbeiten(q)}>
                      Bearbeiten
                    </Button>
                    <Button
                      variant="ghost"
                      loading={busy}
                      onClick={() => void status(q, 'Versendet', 'Als versendet markiert')}
                    >
                      Versendet
                    </Button>
                  </>
                )}
                {darfAendern && (q.status === 'Versendet' || q.status === 'Entwurf') && (
                  <>
                    <Button variant="ghost" loading={busy} onClick={() => annehmen(q)}>
                      Annehmen → Baustelle
                    </Button>
                    <Button
                      variant="ghost"
                      loading={busy}
                      onClick={() => void status(q, 'Abgelehnt', 'Als abgelehnt vermerkt')}
                    >
                      Abgelehnt
                    </Button>
                  </>
                )}
                {/* Löschen nur im Entwurf: alles Versendete bleibt
                    nachvollziehbar, auch ein abgelehntes Angebot. */}
                {darfAendern && q.status === 'Entwurf' && (
                  <IconButton
                    label={`Angebot ${q.quoteNumber} löschen`}
                    tone="danger"
                    onClick={() => setToDelete(q)}
                  >
                    ✕
                  </IconButton>
                )}
              </ListRow>
            ))}
          </List>
        )}
      </Card>

      <ConfirmDialog
        open={!!toDelete}
        title="Angebot löschen?"
        message={toDelete ? `${toDelete.quoteNumber} wird entfernt. Nur Entwürfe sind löschbar.` : ''}
        onCancel={() => setToDelete(null)}
        onConfirm={async () => {
          const weg = toDelete;
          setToDelete(null);
          if (!weg) return;
          try {
            await deleteQuote(weg.id);
            toast.success('Angebot gelöscht');
            await laden();
          } catch (err) {
            setError(grundAus(err, 'Das Angebot konnte nicht gelöscht werden.'));
          }
        }}
      />
    </div>
  );
}
