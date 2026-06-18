import { useEffect, useState } from 'react';
import { useAuth } from '@/app/AuthContext';
import {
  subscribeInvoices,
  nextInvoiceNumber,
  createInvoice,
  updateInvoiceStatus,
  cancelInvoice,
  deleteInvoice,
  markBilled,
} from '@/lib/db/invoices';
import { listAllProjects } from '@/lib/db/projects';
import { listAllEntries } from '@/lib/db/timeEntries';
import { listAllOrders } from '@/lib/db/materialOrders';
import { listMaterials } from '@/lib/db/materials';
import { assembleInvoice, INVOICE_DEFAULTS } from './assemble';
import { generateInvoicePdf } from './pdf';
import { todayStr } from '@/lib/time';
import type { WithId } from '@/lib/db/core';
import type { Invoice, Project } from '@/types';
import Card from '@/components/Card';
import Button from '@/components/Button';
import IconButton from '@/components/IconButton';
import StatusBadge from '@/components/StatusBadge';
import PageHeader from '@/components/PageHeader';
import ConfirmDialog from '@/components/ConfirmDialog';
import { List, ListRow } from '@/components/ListRow';
import { SelectField } from '@/components/Field';
import { useToast } from '@/components/Toast';
import { LoadingState, ErrorState, EmptyState } from '@/components/States';

const fmtEUR = (n: number) => `€ ${n.toFixed(2)}`;

/** Rechnungen: aus Projekt erzeugen (PDF + Beleg-Verknüpfung), Status, Storno. */
export default function InvoicesView() {
  const { user, company } = useAuth();
  const toast = useToast();
  const [invoices, setInvoices] = useState<WithId<Invoice>[]>([]);
  const [projects, setProjects] = useState<Project[]>([]);
  const [projectNumber, setProjectNumber] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [toCancel, setToCancel] = useState<WithId<Invoice> | null>(null);

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

  async function generate() {
    if (!user || !company || !projectNumber) return;
    setBusy(true);
    setError(null);
    try {
      const [entries, orders, materials] = await Promise.all([
        listAllEntries(user.companyId),
        listAllOrders(user.companyId),
        listMaterials(user.companyId),
      ]);
      const assembled = assembleInvoice(projectNumber, entries, orders, materials);
      if (assembled.positions.length === 0) {
        setError('Keine offenen, verrechenbaren Positionen für dieses Projekt.');
        return;
      }
      const project = projects.find((p) => p.projectNumber === projectNumber);
      const invoiceNumber = nextInvoiceNumber(invoices);
      const invoiceDate = todayStr();
      const due = new Date();
      due.setDate(due.getDate() + INVOICE_DEFAULTS.dueDays);
      const dueDate = due.toISOString().slice(0, 10);

      // PDF erzeugen (Download)
      generateInvoicePdf({
        company,
        project: {
          customerName: project?.customerName ?? '–',
          address: project?.address,
          projectNumber,
        },
        invoiceNumber,
        invoiceDate,
        dueDate,
        assembled,
        appendDetail: true,
      });

      // Rechnung speichern + Belege als verrechnet markieren
      await createInvoice(user.companyId, {
        invoiceNumber,
        projectNumber,
        customerName: project?.customerName ?? '–',
        invoiceDate,
        dueDate,
        totalNetto: assembled.totalNetto,
        totalVat: assembled.totalVat,
        totalBrutto: assembled.totalBrutto,
        paymentStatus: 'Offen',
        linkedEntries: assembled.linkedEntries,
        linkedOrders: assembled.linkedOrders,
      });
      await markBilled('timeEntries', assembled.linkedEntries, invoiceNumber);
      await markBilled('materialOrders', assembled.linkedOrders, invoiceNumber);
      toast.success(`Rechnung ${invoiceNumber} erstellt`);
    } catch {
      setError('Die Rechnung konnte nicht erstellt werden.');
    } finally {
      setBusy(false);
    }
  }

  if (!user) return null;
  const sorted = [...invoices].sort((a, b) => b.invoiceNumber.localeCompare(a.invoiceNumber));

  return (
    <div className="space-y-6">
      <PageHeader title="Rechnungen" subtitle="Aus einer Baustelle erzeugen, Zahlung verfolgen, stornieren" />

      <Card title="Neue Rechnung aus Baustelle">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
          <SelectField
            id="invproj"
            label="Baustelle"
            className="sm:w-80"
            value={projectNumber}
            onChange={(e) => setProjectNumber(e.target.value)}
          >
            <option value="">— wählen —</option>
            {projects.map((p) => (
              <option key={p.id} value={p.projectNumber}>
                {p.customerName} ({p.projectNumber})
              </option>
            ))}
          </SelectField>
          <Button onClick={generate} loading={busy} disabled={!projectNumber}>
            Rechnung erstellen & PDF
          </Button>
        </div>
        {error && <div className="mt-3"><ErrorState message={error} /></div>}
      </Card>

      <Card title="Alle Rechnungen">
        {loading ? (
          <LoadingState />
        ) : sorted.length === 0 ? (
          <EmptyState>Noch keine Rechnungen.</EmptyState>
        ) : (
          <List>
            {sorted.map((inv) => (
              <ListRow
                key={inv.id}
                title={`${inv.invoiceNumber} · ${inv.customerName}`}
                subtitle={`${inv.invoiceDate} · fällig ${inv.dueDate} · ${fmtEUR(inv.totalBrutto)}`}
              >
                <StatusBadge status={inv.paymentStatus} />
                {inv.paymentStatus !== 'Bezahlt' && inv.paymentStatus !== 'Storniert' && (
                  <Button
                    variant="secondary"
                    onClick={async () => {
                      await updateInvoiceStatus(inv.id, 'Bezahlt');
                      toast.success('Als bezahlt markiert');
                    }}
                  >
                    Bezahlt
                  </Button>
                )}
                {inv.paymentStatus !== 'Storniert' ? (
                  <Button variant="ghost" onClick={() => setToCancel(inv)}>
                    Stornieren
                  </Button>
                ) : (
                  <IconButton
                    label="Rechnung löschen"
                    tone="danger"
                    onClick={async () => {
                      await deleteInvoice(inv.id);
                      toast.success('Rechnung gelöscht');
                    }}
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
        open={!!toCancel}
        title="Rechnung stornieren?"
        message={
          toCancel
            ? `${toCancel.invoiceNumber} wird storniert; die verknüpften Zeiten und Materialien werden wieder freigegeben.`
            : ''
        }
        confirmLabel="Stornieren"
        onCancel={() => setToCancel(null)}
        onConfirm={async () => {
          if (toCancel) {
            await cancelInvoice(toCancel, 'Storno');
            toast.success('Rechnung storniert');
          }
          setToCancel(null);
        }}
      />
    </div>
  );
}
