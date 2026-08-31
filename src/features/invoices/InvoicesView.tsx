import { useEffect, useMemo, useState } from 'react';
import { useAuth } from '@/app/AuthContext';
import {
  subscribeInvoices,
  nextInvoiceNumber,
  isInvoiceNumberTaken,
  reserveInvoiceNumber,
  highestInvoiceSeq,
  invoiceSeqOf,
  createInvoice,
  updateInvoiceStatus,
  cancelInvoice,
  reactivateInvoice,
  deleteInvoice,
  markBilled,
} from '@/lib/db/invoices';
import { listAllProjects } from '@/lib/db/projects';
import { listAllEntries } from '@/lib/db/timeEntries';
import { assembleInvoice, recalc, INVOICE_DEFAULTS, type AssembledInvoice } from './assemble';
import { discountLabel, type InvoicePosition } from './totals';
import { todayStr, localDateStr } from '@/lib/time';
import type { WithId } from '@/lib/db/core';
import type { Invoice, Project } from '@/types';
import Card from '@/components/Card';
import Button from '@/components/Button';
import Metric from '@/components/Metric';
import IconButton from '@/components/IconButton';
import StatusBadge from '@/components/StatusBadge';
import PageHeader from '@/components/PageHeader';
import ConfirmDialog from '@/components/ConfirmDialog';
import { List, ListRow } from '@/components/ListRow';
import { InputField, SelectField, CheckboxField, FormGrid } from '@/components/Field';
import { useToast } from '@/components/Toast';
import { ErrorState, EmptyState, SkeletonList } from '@/components/States';

const fmtEUR = (n: number) =>
  `€ ${new Intl.NumberFormat('de-AT', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(n)}`;

/** Rechnungen: aus Baustelle erzeugen, Zahlung verfolgen, stornieren. */
export default function InvoicesView() {
  const { user, company } = useAuth();
  const toast = useToast();
  const [invoices, setInvoices] = useState<WithId<Invoice>[]>([]);
  const [projects, setProjects] = useState<Project[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [toCancel, setToCancel] = useState<WithId<Invoice> | null>(null);
  const [cancelNote, setCancelNote] = useState('');
  const [statusFilter, setStatusFilter] = useState<'alle' | Invoice['paymentStatus']>('alle');
  const [rechnungSuche, setRechnungSuche] = useState('');
  /** Anfangs sichtbare Rechnungen; der Rest kommt auf Wunsch. */
  const [rechnungLimit, setRechnungLimit] = useState(50);

  // Entwurf
  const [projectNumber, setProjectNumber] = useState('');
  const [preview, setPreview] = useState<AssembledInvoice | null>(null);
  const [invoiceNumber, setInvoiceNumber] = useState('');
  /**
   * Der zuletzt EINGESETZTE Vorschlag. Nur daran ist erkennbar, ob jemand die
   * Nummer wirklich von Hand gesetzt hat. Ein beim Bestätigen frisch
   * berechneter Vorschlag taugt dafür nicht: rechnet jemand parallel ab,
   * wandert der Vorschlag weiter, und der unveränderte Wert im Feld sähe
   * plötzlich wie eine Wunschnummer aus — die dann als vergeben abgelehnt
   * würde.
   */
  const [suggestedNumber, setSuggestedNumber] = useState('');
  const [appendDetail, setAppendDetail] = useState(true);
  /**
   * Rabatt als Formularzustand: `value` bleibt Text, damit ein halb getipptes
   * „1" nicht sofort als 1 % durchschlaegt und das Feld beim Weitertippen
   * springt.
   */
  const [discount, setDiscount] = useState<{
    mode: 'percent' | 'amount';
    value: string;
    label: string;
  }>({ mode: 'percent', value: '', label: '' });
  // Startwert sind die Sätze des Betriebs aus den Einstellungen; für den
  // Einzelfall lassen sie sich hier noch abweichend setzen.
  const [rates, setRates] = useState({ ...INVOICE_DEFAULTS });

  useEffect(() => {
    if (company?.rates) setRates({ ...INVOICE_DEFAULTS, ...company.rates });
  }, [company]);

  useEffect(() => {
    if (!user) return;
    listAllProjects(user.companyId).then(setProjects).catch(() => undefined);
    const unsub = subscribeInvoices(
      user.companyId,
      (rows) => {
        setInvoices(rows);
        setLoading(false);
      },
      (e) => {
        setError(e.message);
        setLoading(false);
      },
    );
    return unsub;
  }, [user]);

  // Mahnwesen: offene Rechnungen mit überschrittener Frist automatisch auf
  // "Überfällig" setzen. Ohne das blieb der Status ungenutzt und der Betrieb
  // sah nie, welche Rechnung angemahnt gehört.
  useEffect(() => {
    const today = todayStr();
    invoices
      .filter((i) => i.paymentStatus === 'Offen' && i.dueDate && i.dueDate < today)
      .forEach((i) => void updateInvoiceStatus(i.id, 'Überfällig').catch(() => undefined));
  }, [invoices]);

  const sorted = useMemo(
    () => [...invoices].sort((a, b) => b.invoiceNumber.localeCompare(a.invoiceNumber)),
    [invoices],
  );
  const visible = useMemo(() => {
    const nachStatus =
      statusFilter === 'alle' ? sorted : sorted.filter((i) => i.paymentStatus === statusFilter);
    // Nach ein paar Jahren stehen hier hunderte Rechnungen. Gesucht wird nach
    // Nummer oder Kunde — beides steht in der Zeile, aber niemand scrollt
    // dafuer durch drei Jahrgaenge.
    const q = rechnungSuche.trim().toLowerCase();
    if (!q) return nachStatus;
    return nachStatus.filter((i) =>
      [i.invoiceNumber, i.customerName, i.projectNumber].some((v) =>
        v?.toLowerCase().includes(q),
      ),
    );
  }, [sorted, statusFilter, rechnungSuche]);
  const stats = useMemo(() => {
    const sum = (s: Invoice['paymentStatus']) =>
      invoices.filter((i) => i.paymentStatus === s).reduce((a, i) => a + i.totalBrutto, 0);
    return { offen: sum('Offen'), ueberfaellig: sum('Überfällig'), bezahlt: sum('Bezahlt') };
  }, [invoices]);

  const numberTaken = invoiceNumber !== '' && isInvoiceNumberTaken(invoices, invoiceNumber);

  /**
   * Rechnet jemand parallel ab, ist der angezeigte Vorschlag im selben Moment
   * überholt. Solange das Feld unangetastet ist, zieht es einfach nach —
   * sonst stünde dort eine rote Meldung „bereits vergeben" über einer Nummer,
   * die der Nutzer nie selbst gewählt hat, und der Knopf bliebe gesperrt.
   */
  useEffect(() => {
    if (!preview || !suggestedNumber) return;
    if (invoiceNumber.trim() !== suggestedNumber) return; // von Hand gesetzt
    const aktuell = nextInvoiceNumber(invoices);
    if (aktuell !== suggestedNumber) {
      setSuggestedNumber(aktuell);
      setInvoiceNumber(aktuell);
    }
  }, [invoices, preview, suggestedNumber, invoiceNumber]);

  /** Der Rabatt in der Form, in der er gespeichert und gedruckt wird. */
  const rabatt = useMemo(() => {
    const v = Number(discount.value.replace(',', '.'));
    if (!Number.isFinite(v) || v <= 0) return null;
    return { mode: discount.mode, value: v, label: discount.label.trim() || undefined };
  }, [discount]);

  /**
   * Positionen und Rabatt wirken sofort auf die Summen.
   *
   * Wer eine Menge aendert und erst nach dem Speichern sieht, was das kostet,
   * rechnet im Kopf mit — und irrt sich.
   */
  useEffect(() => {
    // Nur an Rabatt und Steuersatz gehaengt; die Positionen rechnen ihre
    // eigenen Aenderungen bereits in setPos mit.
    setPreview((p) => (p ? recalc(p, p.positions, rates.vatRate, rabatt) : p));
  }, [rabatt, rates.vatRate]);

  /** Eine Position aendern; die Summen ziehen sofort nach. */
  function setPos(i: number, patch: Partial<InvoicePosition>) {
    setPreview((p) => {
      if (!p) return p;
      const next = p.positions.map((x, k) => (k === i ? { ...x, ...patch } : x));
      return recalc(p, next, rates.vatRate, rabatt);
    });
  }

  function entfernePos(i: number) {
    setPreview((p) =>
      p ? recalc(p, p.positions.filter((_, k) => k !== i), rates.vatRate, rabatt) : p,
    );
  }

  /** Eigene Zeile anlegen — leer oder als vorbereitete Pauschale. */
  function neuePos(label = '', qty = 1, unit = 'Stk') {
    setPreview((p) =>
      p
        ? recalc(
            p,
            [...p.positions, { label, qty, unit, unitPrice: 0, netto: 0 }],
            rates.vatRate,
            rabatt,
          )
        : p,
    );
  }

  /** Positionen zusammenstellen und zur Kontrolle anzeigen — noch nichts schreiben. */
  async function buildPreview() {
    if (!user || !projectNumber) return;
    setBusy(true);
    setError(null);
    try {
      const entries = await listAllEntries(user.companyId);
      const assembled = assembleInvoice(projectNumber, entries, rates);
      if (assembled.positions.length === 0) {
        setPreview(null);
        setError('Keine offenen, verrechenbaren Stunden für diese Baustelle.');
        return;
      }
      setPreview(assembled);
      const vorschlag = nextInvoiceNumber(invoices);
      setSuggestedNumber(vorschlag);
      setInvoiceNumber(vorschlag);
    } catch {
      setError('Die Positionen konnten nicht geladen werden.');
    } finally {
      setBusy(false);
    }
  }

  async function confirmInvoice() {
    if (!user || !company || !preview || !invoiceNumber || numberTaken) return;
    setBusy(true);
    setError(null);
    try {
      const project = projects.find((p) => p.projectNumber === projectNumber);
      const invoiceDate = todayStr();
      const due = new Date();
      due.setDate(due.getDate() + rates.dueDays);
      const dueDate = localDateStr(due);

      /**
       * Nummer JETZT verbindlich ziehen, nicht schon beim Aufbau der Vorschau.
       *
       * Der Vorschlag im Feld stammt aus der Liste im Browser und kann
       * veraltet sein, sobald jemand parallel abrechnet. Erst hier entscheidet
       * eine Transaktion, und erst hier ist die Nummer verbraucht — bräche der
       * Nutzer vorher ab, entstünde sonst eine Lücke im Nummernkreis.
       *
       * Weicht die Eingabe vom Vorschlag ab, hat jemand bewusst eine Nummer
       * gesetzt; die geht mit als Wunsch in die Transaktion.
       */
      const typedSeq = invoiceSeqOf(invoiceNumber);
      const vonHand = invoiceNumber.trim() !== suggestedNumber && typedSeq != null;
      const reserved = await reserveInvoiceNumber(user.companyId, {
        seedFrom: highestInvoiceSeq(invoices),
        desired: vonHand ? typedSeq : undefined,
      });

      // Belege ZUERST sperren: bricht es danach ab, ist schlimmstenfalls eine
      // Rechnung offen — nicht aber ein Beleg doppelt verrechenbar.
      await markBilled('timeEntries', preview.linkedEntries, reserved);

      await createInvoice(user.companyId, {
        invoiceNumber: reserved,
        projectNumber,
        customerName: project?.customerName ?? '–',
        address: project?.address ?? '',
        invoiceDate,
        dueDate,
        positions: preview.positions,
        vatRate: rates.vatRate,
        subtotalNetto: preview.subtotalNetto,
        // null statt undefined: Firestore laesst undefined nicht zu, und
        // "kein Rabatt" soll als bewusster Wert im Dokument stehen.
        discount: rabatt,
        discountAmount: preview.discountAmount,
        totalNetto: preview.totalNetto,
        totalVat: preview.totalVat,
        totalBrutto: preview.totalBrutto,
        paymentStatus: 'Offen',
        linkedEntries: preview.linkedEntries,
        linkedOrders: preview.linkedOrders,
      });

      // jsPDF erst hier nachladen — es wiegt mehrere hundert Kilobyte und
      // gehoert nicht ins Paket, das jeder Monteur beim Anmelden zieht.
      const { downloadInvoicePdf } = await import('./pdf');
      downloadInvoicePdf({
        company,
        project: {
          customerName: project?.customerName ?? '–',
          address: project?.address,
          projectNumber,
        },
        invoiceNumber: reserved,
        invoiceDate,
        dueDate,
        assembled: preview,
        appendDetail,
        vatRate: rates.vatRate,
      });

      setPreview(null);
      setProjectNumber('');
      setDiscount({ mode: 'percent', value: '', label: '' });
      toast.success(`Rechnung ${reserved} erstellt`);
    } catch (e) {
      // Die Nummernvergabe sagt genau, welche Nummer belegt ist und welche
      // frei wäre — diese Auskunft ist mehr wert als ein Sammelsatz.
      setError(
        e instanceof Error && e.message.includes('bereits vergeben')
          ? e.message
          : 'Die Rechnung konnte nicht vollständig erstellt werden. Bitte die Liste prüfen, bevor du es erneut versuchst.',
      );
    } finally {
      setBusy(false);
    }
  }

  /** Eine bereits erstellte Rechnung erneut als PDF ausgeben. */
  async function redownload(inv: WithId<Invoice>) {
    if (!company) return;
    if (!inv.positions?.length) {
      toast.error('Für diese Rechnung sind keine Positionen gespeichert.');
      return;
    }
    const { downloadInvoicePdf } = await import('./pdf');
    downloadInvoicePdf({
      company,
      project: {
        customerName: inv.customerName,
        address: inv.address,
        projectNumber: inv.projectNumber,
      },
      invoiceNumber: inv.invoiceNumber,
      invoiceDate: inv.invoiceDate,
      dueDate: inv.dueDate,
      // Aus den gespeicherten Positionen — nicht neu berechnet, damit das
      // Dokument exakt dem entspricht, was der Kunde erhalten hat.
      assembled: {
        positions: inv.positions,
        subtotalNetto: inv.subtotalNetto ?? inv.totalNetto,
        discount: inv.discount ?? null,
        discountAmount: inv.discountAmount ?? 0,
        totalNetto: inv.totalNetto,
        totalVat: inv.totalVat,
        totalBrutto: inv.totalBrutto,
        linkedEntries: inv.linkedEntries ?? [],
        linkedOrders: inv.linkedOrders ?? [],
        entries: [],
      },
      appendDetail: false,
      vatRate: inv.vatRate,
    });
    toast.success('PDF erneut erzeugt');
  }

  if (!user) return null;

  return (
    <div className="space-y-6">
      <PageHeader title="Rechnungen" subtitle="Aus einer Baustelle erzeugen, Zahlung verfolgen, stornieren" />

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <Metric label="Offen" icon="receipt" value={fmtEUR(stats.offen)} />
        <Metric label="Überfällig" icon="clock" tone={stats.ueberfaellig > 0 ? 'danger' : 'default'}
          value={fmtEUR(stats.ueberfaellig)} />
        <Metric label="Bezahlt" icon="chart" tone="success" value={fmtEUR(stats.bezahlt)} />
      </div>

      <Card title="Neue Rechnung aus Baustelle">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
          <SelectField id="invproj" label="Baustelle" className="sm:w-80" value={projectNumber}
            onChange={(e) => {
              setProjectNumber(e.target.value);
              setPreview(null);
              setError(null);
            }}>
            <option value="">— wählen —</option>
            {projects.map((p) => (
              <option key={p.id} value={p.projectNumber}>
                {p.customerName} ({p.projectNumber})
              </option>
            ))}
          </SelectField>
          <Button onClick={buildPreview} loading={busy && !preview} disabled={!projectNumber}>
            Positionen zusammenstellen
          </Button>
        </div>

        <details className="mt-4">
          <summary className="min-h-touch cursor-pointer text-sm font-medium text-brand underline">
            Konditionen für diese Rechnung anpassen
          </summary>
          <div className="mt-3 rounded-sm border border-line bg-surface-2 p-4">
            <FormGrid cols={3}>
              <InputField id="r-fach" label="Facharbeiter €/h" type="number" min="0" step="0.5"
                value={String(rates.fach)}
                onChange={(e) => setRates({ ...rates, fach: Number(e.target.value) || 0 })} />
              <InputField id="r-helper" label="Helfer €/h" type="number" min="0" step="0.5"
                value={String(rates.helper)}
                onChange={(e) => setRates({ ...rates, helper: Number(e.target.value) || 0 })} />
              <InputField id="r-night" label="Nachtzuschlag %" type="number" min="0" step="5"
                value={String(Math.round(rates.nightSurcharge * 100))}
                onChange={(e) =>
                  setRates({ ...rates, nightSurcharge: (Number(e.target.value) || 0) / 100 })
                } />
              <InputField id="r-emergency" label="Notdienstzuschlag %" type="number" min="0" step="5"
                value={String(Math.round(rates.emergencySurcharge * 100))}
                onChange={(e) =>
                  setRates({ ...rates, emergencySurcharge: (Number(e.target.value) || 0) / 100 })
                } />
              <InputField id="r-due" label="Zahlungsziel (Tage)" type="number" min="0"
                value={String(rates.dueDays)}
                onChange={(e) => setRates({ ...rates, dueDays: Number(e.target.value) || 0 })} />
              <SelectField id="r-vat" label="USt-Satz" value={String(rates.vatRate)}
                onChange={(e) => setRates({ ...rates, vatRate: Number(e.target.value) })}>
                <option value="0.2">20 %</option>
                <option value="0.13">13 %</option>
                <option value="0.1">10 %</option>
                <option value="0">0 % (Reverse Charge)</option>
              </SelectField>
            </FormGrid>
            <p className="mt-2 text-sm text-ink-muted">
              Gilt nur für diese Rechnung und wirkt erst beim erneuten Zusammenstellen. Die
              dauerhaften Sätze des Betriebs stehen in den Einstellungen.
            </p>
          </div>
        </details>

        {error && <div className="mt-3"><ErrorState message={error} /></div>}
      </Card>

      {/* Vorschau vor dem Erzeugen: danach sind die Belege gesperrt und eine
          Korrektur ginge nur noch über Storno. */}
      {preview && (
        <Card title="Vorschau">
          {/* Positionen sind bearbeitbar, nicht nur ansehbar.
              Eine Rechnung ist selten genau das, was die Zeiterfassung
              hergibt: eine Anfahrt kommt dazu, eine Stunde wird dem Kunden
              erlassen, ein Pauschalposten ersetzt drei Zeilen. Wer das nicht
              hier tun kann, tut es danach von Hand in Word — und dann stimmt
              die Rechnung im System nicht mehr mit der ueberein, die der
              Kunde bekommen hat. */}
          <div className="overflow-x-auto">
            <table className="w-full min-w-[34rem] text-sm">
              <thead>
                <tr className="border-b border-line text-left text-ink-muted">
                  <th className="py-1 pr-3 font-medium">Position</th>
                  <th className="py-1 pr-3 text-right font-medium">Menge</th>
                  <th className="py-1 pr-3 font-medium">Einheit</th>
                  <th className="py-1 pr-3 text-right font-medium">EP</th>
                  <th className="py-1 pr-3 text-right font-medium">Netto</th>
                  <th className="py-1 text-right font-medium">
                    <span className="sr-only">Entfernen</span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {preview.positions.map((p, i) => (
                  <tr key={i} className="border-b border-line/60">
                    <td className="py-1.5 pr-3">
                      <input
                        aria-label={`Bezeichnung Position ${i + 1}`}
                        className="min-h-touch w-full min-w-[10rem] rounded border border-line bg-surface px-2 py-1 text-sm text-ink focus:border-brand focus:outline-none focus:ring-2 focus:ring-brand/30"
                        value={p.label}
                        onChange={(e) => setPos(i, { label: e.target.value })}
                      />
                    </td>
                    <td className="py-1.5 pr-3">
                      <input
                        aria-label={`Menge Position ${i + 1}`}
                        type="number"
                        min="0"
                        step="0.25"
                        className="tnum min-h-touch w-24 rounded border border-line bg-surface px-2 py-1 text-right text-sm text-ink focus:border-brand focus:outline-none focus:ring-2 focus:ring-brand/30"
                        value={String(p.qty)}
                        onChange={(e) => setPos(i, { qty: Number(e.target.value) || 0 })}
                      />
                    </td>
                    <td className="py-1.5 pr-3">
                      <input
                        aria-label={`Einheit Position ${i + 1}`}
                        className="min-h-touch w-20 rounded border border-line bg-surface px-2 py-1 text-sm text-ink focus:border-brand focus:outline-none focus:ring-2 focus:ring-brand/30"
                        value={p.unit}
                        onChange={(e) => setPos(i, { unit: e.target.value })}
                      />
                    </td>
                    <td className="py-1.5 pr-3">
                      <input
                        aria-label={`Einzelpreis Position ${i + 1}`}
                        type="number"
                        min="0"
                        step="0.01"
                        className="tnum min-h-touch w-28 rounded border border-line bg-surface px-2 py-1 text-right text-sm text-ink focus:border-brand focus:outline-none focus:ring-2 focus:ring-brand/30"
                        value={String(p.unitPrice)}
                        onChange={(e) => setPos(i, { unitPrice: Number(e.target.value) || 0 })}
                      />
                    </td>
                    <td className="tnum py-1.5 pr-3 text-right font-medium">{fmtEUR(p.netto)}</td>
                    <td className="py-1.5 text-right">
                      <IconButton
                        label={`Position ${i + 1} entfernen`}
                        tone="danger"
                        onClick={() => entfernePos(i)}
                      >
                        ✕
                      </IconButton>
                    </td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr>
                  <td colSpan={4} className="pt-2 text-right">
                    {preview.discountAmount > 0 ? 'Zwischensumme' : 'Netto'}
                  </td>
                  <td className="tnum pt-2 pr-3 text-right">{fmtEUR(preview.subtotalNetto)}</td>
                  <td />
                </tr>
                {preview.discountAmount > 0 && preview.discount && (
                  <>
                    <tr className="text-danger">
                      <td colSpan={4} className="text-right">{discountLabel(preview.discount)}</td>
                      <td className="tnum pr-3 text-right">−{fmtEUR(preview.discountAmount)}</td>
                      <td />
                    </tr>
                    <tr>
                      <td colSpan={4} className="text-right">Netto</td>
                      <td className="tnum pr-3 text-right">{fmtEUR(preview.totalNetto)}</td>
                      <td />
                    </tr>
                  </>
                )}
                <tr>
                  <td colSpan={4} className="text-right">
                    USt. {Math.round(rates.vatRate * 100)} %
                  </td>
                  <td className="tnum pr-3 text-right">{fmtEUR(preview.totalVat)}</td>
                  <td />
                </tr>
                <tr className="font-bold">
                  <td colSpan={4} className="text-right">Brutto</td>
                  <td className="tnum pr-3 text-right">{fmtEUR(preview.totalBrutto)}</td>
                  <td />
                </tr>
              </tfoot>
            </table>
          </div>

          <div className="mt-3 flex flex-wrap gap-2">
            <Button variant="secondary" onClick={() => neuePos()}>
              Position hinzufügen
            </Button>
            <Button variant="ghost" onClick={() => neuePos('Anfahrt', 1, 'Pauschale')}>
              Anfahrt
            </Button>
          </div>

          {/* Rabatt auf das Netto, nicht auf das Brutto: die Umsatzsteuer
              bemisst sich am tatsaechlich vereinbarten Entgelt. */}
          <div className="mt-4 rounded border border-line bg-surface-2 p-4">
            <FormGrid cols={3}>
              <InputField
                id="disc-label"
                label="Rabatt — Bezeichnung"
                placeholder="z. B. Stammkundenrabatt"
                value={discount.label}
                onChange={(e) => setDiscount({ ...discount, label: e.target.value })}
              />
              <SelectField
                id="disc-mode"
                label="Art"
                value={discount.mode}
                onChange={(e) =>
                  setDiscount({ ...discount, mode: e.target.value as 'percent' | 'amount' })
                }
              >
                <option value="percent">Prozent</option>
                <option value="amount">Betrag (€)</option>
              </SelectField>
              <InputField
                id="disc-value"
                label={discount.mode === 'percent' ? 'Rabatt %' : 'Rabatt €'}
                type="number"
                min="0"
                step={discount.mode === 'percent' ? '0.5' : '0.01'}
                max={discount.mode === 'percent' ? '100' : undefined}
                value={discount.value}
                onChange={(e) => setDiscount({ ...discount, value: e.target.value })}
              />
            </FormGrid>
          </div>

          <div className="mt-4 space-y-3">
            <InputField id="invnum" label="Rechnungsnummer" value={invoiceNumber}
              onChange={(e) => setInvoiceNumber(e.target.value)} />
            {numberTaken && (
              <p className="text-sm font-medium text-danger" role="alert">
                Diese Rechnungsnummer ist bereits vergeben.
              </p>
            )}
            <CheckboxField id="invdetail" label="Leistungsnachweis anhängen"
              checked={appendDetail} onChange={(e) => setAppendDetail(e.target.checked)} />
            <p className="text-sm text-ink-muted">
              {preview.linkedEntries.length} Zeiteinträge werden als verrechnet gesperrt.
              Material wird über diese App nicht verrechnet.
            </p>
            <div className="flex flex-col gap-2 sm:flex-row">
              <Button onClick={confirmInvoice} loading={busy} disabled={numberTaken || !invoiceNumber}
                className="w-full sm:w-auto">
                Rechnung erstellen &amp; PDF
              </Button>
              <Button variant="ghost" onClick={() => setPreview(null)} className="w-full sm:w-auto">
                Verwerfen
              </Button>
            </div>
          </div>
        </Card>
      )}

      <Card
        title={`Alle Rechnungen (${visible.length})`}
        action={
          <SelectField id="invfilter" label="" className="py-1 text-sm" value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value as typeof statusFilter)}>
            <option value="alle">Alle</option>
            <option value="Offen">Offen</option>
            <option value="Überfällig">Überfällig</option>
            <option value="Bezahlt">Bezahlt</option>
            <option value="Storniert">Storniert</option>
          </SelectField>
        }
      >
        {invoices.length >= 10 && (
          <div className="mb-4">
            <InputField
              id="invsuche"
              label="Suche"
              type="search"
              placeholder="Rechnungsnummer, Kunde oder Baustelle"
              value={rechnungSuche}
              onChange={(e) => setRechnungSuche(e.target.value)}
            />
          </div>
        )}
        {loading ? (
          <SkeletonList rows={4} />
        ) : visible.length === 0 ? (
          <EmptyState>
            {invoices.length === 0
              ? 'Noch keine Rechnungen.'
              : rechnungSuche
                ? `Keine Rechnung passt zu „${rechnungSuche}".`
                : 'Keine Rechnung in dieser Auswahl.'}
          </EmptyState>
        ) : (
          <List>
            {visible.slice(0, rechnungLimit).map((inv) => (
              <ListRow
                key={inv.id}
                title={`${inv.invoiceNumber} · ${inv.customerName}`}
                subtitle={
                  <>
                    {inv.invoiceDate} · fällig {inv.dueDate} · {fmtEUR(inv.totalBrutto)}
                    {inv.cancellationNote && (
                      <span className="mt-0.5 block text-xs text-ink-muted">
                        Storno: {inv.cancellationNote}
                      </span>
                    )}
                  </>
                }
              >
                <StatusBadge status={inv.paymentStatus} />

                {inv.paymentStatus !== 'Storniert' && (
                  <SelectField id={`inv-st-${inv.id}`} label="" className="py-1 text-sm"
                    value={inv.paymentStatus}
                    onChange={async (e) => {
                      await updateInvoiceStatus(inv.id, e.target.value as Invoice['paymentStatus']);
                      toast.success('Status geändert');
                    }}>
                    <option value="Offen">Offen</option>
                    <option value="Überfällig">Überfällig</option>
                    <option value="Bezahlt">Bezahlt</option>
                  </SelectField>
                )}

                <Button variant="ghost" onClick={() => redownload(inv)}>PDF</Button>

                {inv.paymentStatus !== 'Storniert' ? (
                  <Button variant="ghost" onClick={() => { setToCancel(inv); setCancelNote(''); }}>
                    Stornieren
                  </Button>
                ) : (
                  <>
                    <Button
                      variant="ghost"
                      onClick={async () => {
                        await reactivateInvoice(inv);
                        toast.success('Storno aufgehoben');
                      }}
                    >
                      Reaktivieren
                    </Button>
                    <IconButton label={`${inv.invoiceNumber} löschen`} tone="danger"
                      onClick={async () => {
                        await deleteInvoice(inv.id);
                        toast.success('Rechnung gelöscht');
                      }}>
                      ✕
                    </IconButton>
                  </>
                )}
              </ListRow>
            ))}
          </List>
        )}
        {visible.length > rechnungLimit && (
          <div className="mt-4">
            <Button variant="secondary" onClick={() => setRechnungLimit((n) => n + 50)}>
              Weitere anzeigen ({visible.length - rechnungLimit})
            </Button>
          </div>
        )}
      </Card>

      <ConfirmDialog
        open={!!toCancel}
        title="Rechnung stornieren?"
        message={
          toCancel
            ? `${toCancel.invoiceNumber} wird storniert; die verknüpften Zeiteinträge werden wieder freigegeben.`
            : ''
        }
        confirmLabel="Stornieren"
        onCancel={() => setToCancel(null)}
        onConfirm={async () => {
          if (toCancel) {
            await cancelInvoice(toCancel, cancelNote.trim() || 'Storno ohne Angabe');
            toast.success('Rechnung storniert');
          }
          setToCancel(null);
        }}
      >
        <InputField id="cancelnote" label="Grund (erscheint in der Liste)" value={cancelNote}
          onChange={(e) => setCancelNote(e.target.value)} placeholder="z. B. Falscher Kunde" />
      </ConfirmDialog>
    </div>
  );
}
