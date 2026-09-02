import { useEffect, useMemo, useState } from 'react';
import { useAuth } from '@/app/AuthContext';
import {
  subscribeRecentInvoices,
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
import { listActiveProjects } from '@/lib/db/projects';
import { listCustomers } from '@/lib/db/customers';
import { buildInvoiceCsv, invoiceCsvFilename } from './buchhaltungExport';
import { downloadCsv } from '@/features/accounting/export';
import { listEntriesForProjects } from '@/lib/db/timeEntries';
import { assembleInvoice, recalc, INVOICE_DEFAULTS, type AssembledInvoice } from './assemble';
import { discountLabel, type InvoicePosition } from './totals';
import { todayStr, localDateStr } from '@/lib/time';
import type { WithId } from '@/lib/db/core';
import type { Invoice, Project } from '@/types';
import Card from '@/components/Card';
import Button from '@/components/Button';
import Metric, { MetricRow } from '@/components/Metric';
import IconButton from '@/components/IconButton';
import StatusBadge from '@/components/StatusBadge';
import PageHeader from '@/components/PageHeader';
import ConfirmDialog from '@/components/ConfirmDialog';
import { List, ListRow } from '@/components/ListRow';
import RowMenu from '@/components/RowMenu';
import { InputField, SelectField, CheckboxField, FormGrid } from '@/components/Field';
import BaustellenSelect from '@/components/BaustellenSelect';
import InfoHint from '@/components/InfoHint';
import { useToast } from '@/components/Toast';
import { ErrorState, EmptyState, SkeletonList, TeilFehler } from '@/components/States';

const fmtEUR = (n: number) =>
  `€ ${new Intl.NumberFormat('de-AT', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(n)}`;

/** Rechnungen: aus Baustelle erzeugen, Zahlung verfolgen, stornieren. */
/** Wie viele Rechnungen die Liste zunaechst zeigt. */
const RECHNUNGEN_JE_SEITE = 50;

export default function InvoicesView() {
  const { user, company } = useAuth();
  const toast = useToast();
  const [invoices, setInvoices] = useState<WithId<Invoice>[]>([]);
  const [projects, setProjects] = useState<Project[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  /** Ein Nebenladevorgang ist ausgefallen — die Rechnungsliste steht trotzdem. */
  const [nebenFehler, setNebenFehler] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [toCancel, setToCancel] = useState<WithId<Invoice> | null>(null);
  const [cancelNote, setCancelNote] = useState('');
  const [statusFilter, setStatusFilter] = useState<'alle' | Invoice['paymentStatus']>('alle');
  const [rechnungSuche, setRechnungSuche] = useState('');
  /** Anfangs sichtbare Rechnungen; der Rest kommt auf Wunsch. */

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
  /**
   * Wie weit die Liste zurueckreicht.
   *
   * Die Rechnungsliste ist eine Arbeitsliste: gearbeitet wird an dem, was
   * zuletzt entstanden ist. Ohne Grenze abonnierte sie jede jemals
   * geschriebene Rechnung — nach zehn Jahren die vollstaendige
   * Rechnungshistorie, bei jedem Aufruf, um die letzten zwanzig zu zeigen.
   * Wer weiter zurueck muss, laedt nach.
   */
  const [grenze, setGrenze] = useState(RECHNUNGEN_JE_SEITE);
  /** Buchhaltungs-Export: Zeitraum und Kundenstammdaten fuer die UID. */
  const [kunden, setKunden] = useState<Awaited<ReturnType<typeof listCustomers>>>([]);
  const [exportVon, setExportVon] = useState(() => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-01`;
  });
  const [exportBis, setExportBis] = useState(() => {
    const d = new Date();
    const letzter = new Date(d.getFullYear(), d.getMonth() + 1, 0);
    return `${letzter.getFullYear()}-${String(letzter.getMonth() + 1).padStart(2, '0')}-${String(letzter.getDate()).padStart(2, '0')}`;
  });

  useEffect(() => {
    if (company?.rates) setRates({ ...INVOICE_DEFAULTS, ...company.rates });
  }, [company]);

  useEffect(() => {
    if (!user) return;
    // Nur laufende Baustellen: abgerechnet wird, was laeuft oder gerade
    // fertig wurde. Vorher stand der gesamte Bestand im Auswahlfeld — nach
    // Jahren eine Liste, in der man die aktuelle Baustelle suchen muss.
    // Schlaegt eines davon fehl, bleibt das Auswahlfeld leer — und „keine
    // Baustellen" sieht dann genauso aus wie „nicht geladen". Der Hinweis
    // unterscheidet die beiden.
    listActiveProjects(user.companyId)
      .then(setProjects)
      .catch(() => setNebenFehler('Die Baustellen'));
    // Fuer die UID-Nummer im Buchhaltungs-Export.
    listCustomers(user.companyId).then(setKunden).catch(() => setNebenFehler('Die Kunden'));
    const unsub = subscribeRecentInvoices(
      user.companyId,
      grenze,
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
  }, [user, grenze]);

  // Mahnwesen: offene Rechnungen mit überschrittener Frist automatisch auf
  // "Überfällig" setzen. Ohne das blieb der Status ungenutzt und der Betrieb
  // sah nie, welche Rechnung angemahnt gehört.
  useEffect(() => {
    const today = todayStr();
    invoices
      .filter((i) => i.paymentStatus === 'Offen' && i.dueDate && i.dueDate < today)
      // Hier ist Stille richtig: die Umstellung ist eine Nebenleistung, sie
      // laeuft bei jedem Laden erneut und heilt sich damit selbst. Ein Hinweis
      // je Rechnung waere Laerm ohne Handlungsmoeglichkeit.
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
      /**
       * Nur die Eintraege DIESER Baustelle.
       *
       * Vorher wurde jeder Zeiteintrag des Betriebs geladen, um eine einzige
       * Baustelle abzurechnen — bei zwanzig Monteuren und drei Jahren rund
       * 15.000 Dokumente fuer eine Rechnung ueber vielleicht vierzig
       * Stunden. `listEntriesForProjects` sucht ausserdem nach mehreren
       * Schreibweisen der Baustellennummer und findet damit auch Buchungen
       * mit fuehrendem „PR-" aus Altbestaenden — dieselbe Angleichung, die
       * `assembleInvoice` beim Filtern ohnehin vornimmt. Am Ergebnis der
       * Rechnung aendert sich also nichts, nur an der Menge.
       */
      const entries = await listEntriesForProjects(user.companyId, [projectNumber]);
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

      {nebenFehler && <TeilFehler was={nebenFehler} />}

      {/*
        Buchhaltungs-Export.

        Bisher bekam der Steuerberater PDFs und tippte jede Rechnung ab —
        Kosten, Zeit, und jede Abtipperei eine Gelegenheit fuer einen
        Zahlendreher, ausgerechnet bei den Zahlen fuer die
        Umsatzsteuervoranmeldung.
      */}
      <Card title="Buchhaltungs-Export">
        <p className="text-sm text-ink-muted">
          Rechnungsausgangsbuch als CSV — mit Nummer, Datum, Kunde, UID, Netto, USt und Brutto.
          Importierbar in BMD, RZL und DATEV; die Zuordnung zu den Erlöskonten macht die Kanzlei
          einmal beim Einrichten.
        </p>
        <FormGrid>
          <InputField
            id="expvon"
            label="Von"
            type="date"
            value={exportVon}
            onChange={(e) => setExportVon(e.target.value)}
          />
          <InputField
            id="expbis"
            label="Bis"
            type="date"
            value={exportBis}
            onChange={(e) => setExportBis(e.target.value)}
          />
        </FormGrid>
        {(() => {
          const e = buildInvoiceCsv(invoices, kunden, exportVon, exportBis);
          return (
            <>
              <p className="mt-3 text-sm text-ink">
                {e.anzahl} {e.anzahl === 1 ? 'Rechnung' : 'Rechnungen'} · Netto{' '}
                {fmtEUR(e.summeNetto)} · Brutto {fmtEUR(e.summeBrutto)}
                <span className="block text-xs text-ink-muted">
                  Stornierte Rechnungen sind enthalten, zählen aber nicht in die Summe.
                </span>
              </p>
              {/*
                Eine Luecke im Nummernkreis ist bei jeder Pruefung ein Befund:
                entweder fehlt eine Rechnung, oder sie wurde geloescht statt
                storniert. Das gehoert geklaert, BEVOR der Export in die
                Kanzlei geht — nicht danach.
              */}
              {e.luecken.length > 0 && (
                <p className="mt-3 rounded-sm border border-warning/30 bg-warning-bg px-3 py-2 text-sm text-warning">
                  <strong>Lücke im Nummernkreis:</strong> {e.luecken.join(', ')}. Entweder fehlt
                  eine Rechnung, oder sie wurde gelöscht statt storniert. Das sollte vor der
                  Übergabe an die Kanzlei geklärt sein.
                </p>
              )}
              <div className="mt-4">
                <Button
                  variant="secondary"
                  disabled={e.anzahl === 0}
                  onClick={() => {
                    downloadCsv(e.csv, invoiceCsvFilename(exportVon, exportBis));
                    toast.success('Rechnungsausgangsbuch erzeugt');
                  }}
                >
                  Als CSV herunterladen
                </Button>
              </div>
              <p className="mt-2 text-xs text-ink-muted">
                Das genaue Zielformat mit dem Steuerberater abstimmen. Ein geratenes BMD- oder
                DATEV-Layout sähe importierbar aus und bucht im Zweifel auf falsche Konten —
                deshalb hier ein dokumentiertes CSV mit allen Feldern, die beide brauchen.
              </p>
            </>
          );
        })()}
      </Card>

      <MetricRow>
        <Metric label="Offen" value={fmtEUR(stats.offen)} />
        <Metric label="Überfällig" tone={stats.ueberfaellig > 0 ? 'danger' : 'default'}
          value={fmtEUR(stats.ueberfaellig)} />
        <Metric label="Bezahlt" tone="success" value={fmtEUR(stats.bezahlt)} />
      </MetricRow>

      <Card title="Neue Rechnung aus Baustelle">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
          <div className="sm:w-80">
            <BaustellenSelect
              id="invproj"
              companyId={user.companyId}
              value={projectNumber}
              onChange={(nr, p) => {
                setProjectNumber(nr);
                setPreview(null);
                setError(null);
                // Abgerechnet wird typischerweise NACH dem Abschluss der
                // Baustelle. Sie muss deshalb auch dann auffindbar sein, wenn
                // sie nicht mehr laeuft — und ihre Stammdaten mit ihr.
                if (p) setProjects((alt) => (alt.some((x) => x.projectNumber === p.projectNumber) ? alt : [...alt, p]));
              }}
            />
          </div>
          <Button onClick={buildPreview} loading={busy && !preview} disabled={!projectNumber}>
            Positionen zusammenstellen
          </Button>
        </div>

        <details className="mt-4">
          <summary className="min-h-touch cursor-pointer text-sm font-medium text-brand underline">
            Konditionen für diese Rechnung anpassen
          </summary>
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-sm text-ink-muted">Nur für diese Rechnung</span>
            <InfoHint about="die Konditionen dieser Rechnung">
              Die Änderung gilt nur für diese Rechnung und wirkt erst beim erneuten
              Zusammenstellen. Die dauerhaften Sätze des Betriebs stehen in den Einstellungen.
            </InfoHint>
          </div>
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
                    <td className="py-2 pr-3">
                      <input
                        aria-label={`Bezeichnung Position ${i + 1}`}
                        className="min-h-touch w-full min-w-[10rem] rounded border border-line bg-surface px-2 py-1 text-sm text-ink focus:border-brand focus:outline-none focus:ring-2 focus:ring-brand/30"
                        value={p.label}
                        onChange={(e) => setPos(i, { label: e.target.value })}
                      />
                    </td>
                    <td className="py-2 pr-3">
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
                    <td className="py-2 pr-3">
                      <input
                        aria-label={`Einheit Position ${i + 1}`}
                        className="min-h-touch w-20 rounded border border-line bg-surface px-2 py-1 text-sm text-ink focus:border-brand focus:outline-none focus:ring-2 focus:ring-brand/30"
                        value={p.unit}
                        onChange={(e) => setPos(i, { unit: e.target.value })}
                      />
                    </td>
                    <td className="py-2 pr-3">
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
                    <td className="tnum py-2 pr-3 text-right font-medium">{fmtEUR(p.netto)}</td>
                    <td className="py-2 text-right">
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
            {visible.map((inv) => (
              <ListRow
                key={inv.id}
                title={`${inv.invoiceNumber} · ${inv.customerName}`}
                subtitle={
                  <>
                    {inv.invoiceDate} · fällig {inv.dueDate} · {fmtEUR(inv.totalBrutto)}
                    {inv.cancellationNote && (
                      <span className="mt-1 block text-xs text-ink-muted">
                        Storno: {inv.cancellationNote}
                      </span>
                    )}
                  </>
                }
              >
                {/* Der Status stand doppelt in der Zeile: einmal farbig als
                    Abzeichen, einmal als Auswahlfeld daneben. Das Abzeichen
                    bleibt — beim Durchsehen zaehlt die Farbe, nicht die
                    Bedienung. Das Umstellen ist in das Menue gewandert, wo
                    es als benannte Handlung steht statt als Klappliste, die
                    auf dem Telefon ohnehin ein eigenes Rad oeffnet. */}
                <StatusBadge status={inv.paymentStatus} />
                <RowMenu
                  about={`Rechnung ${inv.invoiceNumber}`}
                  items={[
                    { label: 'PDF erneut laden', onSelect: () => void redownload(inv) },
                    ...(inv.paymentStatus !== 'Storniert'
                      ? [
                          ...(['Offen', 'Überfällig', 'Bezahlt'] as const)
                            .filter((s) => s !== inv.paymentStatus)
                            .map((s) => ({
                              label: `Auf „${s}" setzen`,
                              onSelect: async () => {
                                await updateInvoiceStatus(inv.id, s);
                                toast.success('Status geändert');
                              },
                            })),
                          {
                            label: 'Stornieren',
                            danger: true,
                            onSelect: () => {
                              setToCancel(inv);
                              setCancelNote('');
                            },
                          },
                        ]
                      : [
                          {
                            label: 'Storno aufheben',
                            onSelect: async () => {
                              await reactivateInvoice(inv);
                              toast.success('Storno aufgehoben');
                            },
                          },
                          {
                            label: 'Rechnung löschen',
                            danger: true,
                            onSelect: async () => {
                              await deleteInvoice(inv.id);
                              toast.success('Rechnung gelöscht');
                            },
                          },
                        ]),
                  ]}
                />
              </ListRow>
            ))}
          </List>
        )}
        {/*
          Nachladen heisst hier: die ABFRAGE ausweiten, nicht nur mehr vom
          Geladenen zeigen. Vorher gab es an dieser Stelle schon einen Knopf,
          der aber nur einen Ausschnitt der ohnehin vollstaendig geladenen
          Liste freigab — die Datenmenge war dieselbe. Jetzt steuert er, wie
          weit die Liste ueberhaupt zurueckreicht.

          Der Hinweis daneben ist wichtig: Suche und Filter laufen im
          Browser und damit nur ueber das Geladene. Ohne diesen Satz sucht
          jemand eine alte Rechnungsnummer, findet nichts und schliesst
          daraus, es gebe sie nicht.
        */}
        {invoices.length >= grenze && (
          <div className="mt-4 flex flex-wrap items-center gap-3">
            <Button variant="secondary" onClick={() => setGrenze((n) => n + RECHNUNGEN_JE_SEITE)}>
              Ältere Rechnungen laden
            </Button>
            <span className="text-sm text-ink-muted">
              Angezeigt werden die {grenze} jüngsten Rechnungen. Suche und Filter gelten für
              diese.
            </span>
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
