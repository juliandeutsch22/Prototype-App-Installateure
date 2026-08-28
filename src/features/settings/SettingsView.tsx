import { useEffect, useState, type FormEvent } from 'react';
import { useAuth } from '@/app/AuthContext';
import { updateCompany } from '@/lib/db/company';
import { INVOICE_DEFAULTS } from '@/features/invoices/assemble';
import type { InvoiceRates } from '@/types';
import Card from '@/components/Card';
import Button from '@/components/Button';
import PageHeader from '@/components/PageHeader';
import { InputField, SelectField, FormGrid } from '@/components/Field';
import { useToast } from '@/components/Toast';
import { ErrorState } from '@/components/States';

const fmtEUR = (n: number) =>
  new Intl.NumberFormat('de-AT', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(n);

/** Zahl aus einem Eingabefeld — akzeptiert Komma wie Punkt. */
function num(v: string, fallback: number): number {
  const n = Number(v.replace(',', '.'));
  return Number.isFinite(n) ? n : fallback;
}

/**
 * Einstellungen der Geschäftsführung: Stundensätze und Zuschläge.
 *
 * Zuschläge sind Anteile des Stundensatzes, keine eigenen Beträge — eine
 * Preiserhöhung beim Grundsatz zieht damit automatisch durch. Die Vorschau
 * zeigt sofort, was eine Nacht- oder Notdienststunde tatsächlich kostet.
 */
export default function SettingsView() {
  const { user, company, reloadCompany } = useAuth();
  const toast = useToast();
  const [rates, setRates] = useState<InvoiceRates>(INVOICE_DEFAULTS);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (company?.rates) setRates({ ...INVOICE_DEFAULTS, ...company.rates });
  }, [company]);

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (!user) return;
    setSaving(true);
    setError(null);
    try {
      await updateCompany(user.companyId, { rates });
      await reloadCompany();
      toast.success('Sätze gespeichert');
    } catch {
      setError('Die Einstellungen konnten nicht gespeichert werden.');
    } finally {
      setSaving(false);
    }
  }

  if (!user) return null;

  const nightFach = rates.fach * (1 + rates.nightSurcharge);
  const emergencyFach = rates.fach * (1 + rates.emergencySurcharge);
  const bothFach = rates.fach * (1 + rates.nightSurcharge + rates.emergencySurcharge);

  return (
    <div className="space-y-6">
      <PageHeader
        title="Einstellungen"
        subtitle="Stundensätze und Zuschläge für die Rechnungsstellung"
      />

      <form onSubmit={submit} className="space-y-6">
        <Card title="Stundensätze" accent="brand">
          <FormGrid>
            <InputField
              id="r-fach"
              label="Monteur / Facharbeiter (€/h)"
              type="number"
              min="0"
              step="0.5"
              value={String(rates.fach)}
              onChange={(e) => setRates({ ...rates, fach: num(e.target.value, 0) })}
            />
            <InputField
              id="r-helper"
              label="Helfer (€/h)"
              type="number"
              min="0"
              step="0.5"
              value={String(rates.helper)}
              onChange={(e) => setRates({ ...rates, helper: num(e.target.value, 0) })}
            />
          </FormGrid>

          <p className="mt-3 text-sm text-ink-muted">
            Der Helfersatz gilt für Einsätze, die im Zeiteintrag als Helferarbeit gebucht sind —
            er hängt am Einsatz, nicht dauerhaft an einer Person.
          </p>
        </Card>

        <Card title="Zuschläge" accent="accent">
          <FormGrid>
            <InputField
              id="r-night"
              label="Nachtarbeit (%)"
              type="number"
              min="0"
              step="5"
              value={String(Math.round(rates.nightSurcharge * 100))}
              onChange={(e) => setRates({ ...rates, nightSurcharge: num(e.target.value, 0) / 100 })}
            />
            <InputField
              id="r-emergency"
              label="Notdienst (%)"
              type="number"
              min="0"
              step="5"
              value={String(Math.round(rates.emergencySurcharge * 100))}
              onChange={(e) =>
                setRates({ ...rates, emergencySurcharge: num(e.target.value, 0) / 100 })
              }
            />
          </FormGrid>

          <p className="mt-3 text-sm text-ink-muted">
            Zuschläge gelten als Aufschlag auf den Stundensatz. Nacht und Notdienst können
            zusammentreffen — dann addieren sich beide.
          </p>

          {/* Sofort sehen, was die Sätze bedeuten — Prozentwerte allein sind
              im Kundengespräch wenig greifbar. */}
          <div className="mt-4 overflow-x-auto rounded-sm border border-line bg-surface-2 p-3">
            <table className="w-full text-sm">
              <caption className="mb-2 text-left section-label">
                So wird ein Monteur verrechnet
              </caption>
              <tbody>
                <tr className="border-b border-line/60">
                  <td className="py-1">Regulär</td>
                  <td className="py-1 text-right font-mono">{fmtEUR(rates.fach)} €/h</td>
                </tr>
                <tr className="border-b border-line/60">
                  <td className="py-1">Nachtarbeit</td>
                  <td className="py-1 text-right font-mono">{fmtEUR(nightFach)} €/h</td>
                </tr>
                <tr className="border-b border-line/60">
                  <td className="py-1">Notdienst</td>
                  <td className="py-1 text-right font-mono">{fmtEUR(emergencyFach)} €/h</td>
                </tr>
                <tr>
                  <td className="py-1">Notdienst in der Nacht</td>
                  <td className="py-1 text-right font-mono">{fmtEUR(bothFach)} €/h</td>
                </tr>
              </tbody>
            </table>
          </div>
        </Card>

        <Card title="Rechnungsvorgaben">
          <FormGrid>
            <SelectField
              id="r-vat"
              label="Umsatzsteuer"
              value={String(rates.vatRate)}
              onChange={(e) => setRates({ ...rates, vatRate: Number(e.target.value) })}
            >
              <option value="0.2">20 %</option>
              <option value="0.13">13 %</option>
              <option value="0.1">10 %</option>
              <option value="0">0 % (Reverse Charge)</option>
            </SelectField>
            <InputField
              id="r-due"
              label="Zahlungsziel (Tage)"
              type="number"
              min="0"
              value={String(rates.dueDays)}
              onChange={(e) => setRates({ ...rates, dueDays: num(e.target.value, 14) })}
            />
          </FormGrid>
          <p className="mt-3 text-sm text-ink-muted">
            Diese Werte sind die Vorgabe für neue Rechnungen. Beim Erstellen lassen sie sich
            für den Einzelfall noch anpassen.
          </p>
        </Card>

        {error && <ErrorState message={error} />}

        <div className="flex flex-col gap-2 sm:flex-row">
          <Button type="submit" loading={saving} className="w-full sm:w-auto">
            Sätze speichern
          </Button>
          <Button
            type="button"
            variant="ghost"
            onClick={() => setRates(INVOICE_DEFAULTS)}
            className="w-full sm:w-auto"
          >
            Auf Standardwerte zurücksetzen
          </Button>
        </div>
      </form>
    </div>
  );
}
