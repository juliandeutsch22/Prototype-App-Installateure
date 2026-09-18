import { useEffect, useMemo, useState } from 'react';
import { useAuth } from '@/app/AuthContext';
import {
  listRecentQuotes,
  createQuote,
  updateQuote,
  deleteQuote,
  reserveQuoteNumber,
} from '@/lib/db/quotes';
import { listCustomers } from '@/lib/db/customers';
import { createProject, listActiveProjects } from '@/lib/db/projects';
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
import { Zustand, type Stand } from '@/components/Badge';
import IconButton from '@/components/IconButton';
import PageHeader from '@/components/PageHeader';
import { praefixeVon } from '@/lib/praefixe';
import ConfirmDialog from '@/components/ConfirmDialog';
import { InputField, SelectField, FormGrid } from '@/components/Field';
import { List, ListRow } from '@/components/ListRow';
import { useToast } from '@/components/Toast';
import { ErrorState, EmptyState, SkeletonList } from '@/components/States';

const fmtEUR = (n: number) =>
  `€ ${new Intl.NumberFormat('de-AT', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(n)}`;

/*
  „Abgelehnt" war rot. Es ist ein ENDZUSTAND und keine Störung: der Kunde hat
  entschieden, zu tun ist nichts mehr. Rot hiesse „hier ist etwas für dich"
  und schickte jemanden auf eine Liste, an der er nichts ändern kann.
*/
const STAND: Record<Quote['status'], Stand> = {
  Entwurf: 'ruht',
  Versendet: 'laeuft',
  Angenommen: 'gut',
  Abgelehnt: 'ruht',
};

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

  const vatRate = company?.rates?.vatRate ?? INVOICE_DEFAULTS.vatRate;
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
          };
        }),
    [zeilen],
  );

  const summen = useMemo(() => calcTotals(positionen, vatRate), [positionen, vatRate]);

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
      await laden();
    } catch {
      setError('Das Angebot konnte nicht angelegt werden.');
    } finally {
      setBusy(false);
    }
  }

  /**
   * Annehmen — und daraus die Baustelle machen.
   *
   * Der eigentliche Zweck des ganzen Schritts. Die kalkulierten Stunden
   * wandern als Stundenbudget mit; die Budget-Ampel misst danach gegen eine
   * Zahl, die aus der Kalkulation stammt und nicht aus einem Gedächtnis.
   */
  async function annehmen(q: WithId<Quote>) {
    if (!user) return;
    setBusy(true);
    setError(null);
    try {
      const vorhandene = await listActiveProjects(user.companyId);
      /*
        BAUSTELLENNUMMER AUS DER ANGEBOTSNUMMER — damit beide ohne weiteres
        Zutun einander zuordenbar bleiben.

        Hier stand `replace(/^AN-/, 'B-')`, also beide Vorsätze fest im Code.
        Seit der Betrieb sie selbst festlegt, wird der eigene Vorsatz des
        Angebots abgezogen und der eigene der Baustelle gesetzt. Abgezogen wird
        die Nummer, wie sie WIRKLICH DASTEHT: ein Angebot von vor der Umstellung
        trägt noch den alten Vorsatz, und den kennt diese Ansicht nicht mehr.
        Deshalb wird alles vor der Jahreszahl ersetzt, statt auf einen
        bestimmten Anfang zu hoffen.
      */
      const rumpf = q.quoteNumber.replace(/^.*?(?=\d{4}-)/, '');
      const projectNumber = vorsaetze.baustelle
        ? `${vorsaetze.baustelle}-${rumpf}`
        : rumpf;
      if (vorhandene.some((p) => p.projectNumber === projectNumber)) {
        setError(`Baustelle ${projectNumber} gibt es bereits.`);
        return;
      }
      await createProject(user.companyId, {
        projectNumber,
        customerId: q.customerId,
        customerName: q.customerName,
        address: q.address,
        status: 'Aktiv',
        billingMode: 'Pauschal',
        estimatedHours: q.kalkulierteStunden > 0 ? q.kalkulierteStunden : undefined,
        description: `Aus Angebot ${q.quoteNumber}`,
        projectManagers: [],
        assignedEmployees: [],
      });
      await updateQuote(q.id, { status: 'Angenommen', projectNumber });
      toast.success(`Baustelle ${projectNumber} angelegt`);
      await laden();
    } catch {
      setError('Die Baustelle konnte nicht angelegt werden.');
    } finally {
      setBusy(false);
    }
  }

  if (!user) return null;

  return (
    <div className="space-y-6">
      <PageHeader title="Angebote" subtitle="Kalkulieren, versenden, in einen Auftrag überführen" />

      {darfAendern && (
        <Card title="Neues Angebot">
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
                        setZeilen((v) => v.map((x, j) => (j === i ? { ...x, unit: e.target.value } : x)))
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
                          v.map((x, j) => (j === i ? { ...x, istArbeitszeit: e.target.checked } : x)),
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

          <div className="mt-4">
            <InputField
              id="anqnotes"
              label="Anmerkungen"
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

          {error && <div className="mt-3"><ErrorState message={error} /></div>}

          <div className="mt-4">
            <Button
              onClick={anlegen}
              loading={busy}
              disabled={!customerId || positionen.length === 0}
            >
              Angebot anlegen
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
                  <span>
                    {q.quoteNumber} · {q.customerName}
                  </span>
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
                  <Button
                    variant="ghost"
                    loading={busy}
                    onClick={async () => {
                      await updateQuote(q.id, { status: 'Versendet' });
                      toast.success('Als versendet markiert');
                      await laden();
                    }}
                  >
                    Versendet
                  </Button>
                )}
                {darfAendern && (q.status === 'Versendet' || q.status === 'Entwurf') && (
                  <>
                    <Button variant="ghost" loading={busy} onClick={() => annehmen(q)}>
                      Annehmen → Baustelle
                    </Button>
                    <Button
                      variant="ghost"
                      loading={busy}
                      onClick={async () => {
                        await updateQuote(q.id, { status: 'Abgelehnt' });
                        toast.success('Als abgelehnt vermerkt');
                        await laden();
                      }}
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
          if (toDelete) {
            await deleteQuote(toDelete.id);
            toast.success('Angebot gelöscht');
            await laden();
          }
          setToDelete(null);
        }}
      />
    </div>
  );
}
