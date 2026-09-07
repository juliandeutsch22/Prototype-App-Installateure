import { useEffect, useMemo, useState, type FormEvent } from 'react';
import { useAuth } from '@/app/AuthContext';
import { updateCompany } from '@/lib/db/company';
import { listUsers } from '@/lib/db/users';
import { INVOICE_DEFAULTS } from '@/features/invoices/assemble';
import { isTopLevel } from '@/lib/permissions';
import type { AppUser, InvoiceRates } from '@/types';
import Card from '@/components/Card';
import LaufStatus from './LaufStatus';
import Button from '@/components/Button';
import PageHeader from '@/components/PageHeader';
import { InputField, SelectField, FormGrid } from '@/components/Field';
import PersonPicker from '@/components/PersonPicker';
import { useToast } from '@/components/Toast';
import { ErrorState } from '@/components/States';
import { callBilanzenNeuAufbauen } from '@/lib/functions';

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
  /** Erstaufbau der Monatsbilanzen — Zustand des einmaligen Laufs. */
  const [aufbauLaeuft, setAufbauLaeuft] = useState(false);
  const [aufbauErgebnis, setAufbauErgebnis] = useState<string | null>(null);
  const toast = useToast();
  const [rates, setRates] = useState<InvoiceRates>(INVOICE_DEFAULTS);
  /**
   * Interne Kostensätze — was eine Stunde den BETRIEB kostet.
   *
   * Bewusst getrennt von den Verrechnungssätzen darüber. Wer beide
   * verwechselt, bekommt in der Nachkalkulation eine Marge von null und hält
   * sie für ein Ergebnis. Der Startwert liegt bei rund zwei Dritteln des
   * Verrechnungssatzes — eine Hausnummer, die der Betrieb ersetzen muss.
   */
  const [costRates, setCostRates] = useState({ fach: 42, helper: 28 });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  /**
   * Wer Urlaub genehmigen darf — eine betriebliche Festlegung, keine
   * Eigenschaft der Software. In dem einen Betrieb entscheidet die
   * Buchhaltung, im anderen ein Vorarbeiter, im dritten nur der Chef.
   */
  const [genehmiger, setGenehmiger] = useState<string[]>([]);
  const [nutzer, setNutzer] = useState<AppUser[]>([]);
  const [genehmigerSpeichert, setGenehmigerSpeichert] = useState(false);
  const darfGenehmigerSetzen = user ? isTopLevel(user.role) : false;

  useEffect(() => {
    if (company?.rates) setRates({ ...INVOICE_DEFAULTS, ...company.rates });
    if (company?.costRates) setCostRates({ ...company.costRates });
    setGenehmiger(company?.vacationApprovers ?? []);
  }, [company]);

  useEffect(() => {
    if (!user || !darfGenehmigerSetzen) return;
    listUsers(user.companyId).then(setNutzer).catch(() => setNutzer([]));
  }, [user, darfGenehmigerSetzen]);

  /**
   * Zur Auswahl stehen alle AKTIVEN ausser der Leitung.
   *
   * Geschaeftsfuehrung und Administration koennen ohnehin immer entscheiden
   * und stehen deshalb nicht in der Liste. Waeren sie abwaehlbar, koennte eine
   * Fehleingabe den ganzen Betrieb aussperren — und niemand koennte sie
   * zuruecknehmen, weil auch das Aendern dieser Liste ihnen vorbehalten ist.
   */
  const auswaehlbar = useMemo(
    () =>
      nutzer
        .filter(
          (u) =>
            u.active !== false &&
            u.role !== 'Geschäftsführung' &&
            u.role !== 'Administrator',
        )
        .sort((a, b) => a.name.localeCompare(b.name, 'de')),
    [nutzer],
  );

  const immerDabei = useMemo(
    () =>
      nutzer
        .filter(
          (u) =>
            u.active !== false &&
            (u.role === 'Geschäftsführung' || u.role === 'Administrator'),
        )
        .map((u) => u.name),
    [nutzer],
  );

  async function genehmigerSpeichern() {
    if (!user) return;
    setGenehmigerSpeichert(true);
    setError(null);
    try {
      await updateCompany(user.companyId, { vacationApprovers: genehmiger });
      await reloadCompany();
      toast.success('Genehmigende gespeichert');
    } catch {
      setError('Die Genehmigenden konnten nicht gespeichert werden.');
    } finally {
      setGenehmigerSpeichert(false);
    }
  }

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (!user) return;
    setSaving(true);
    setError(null);
    try {
      await updateCompany(user.companyId, { rates, costRates });
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
        <Card
          title="Stundensätze"
          hint="Der Helfersatz gilt für Einsätze, die im Zeiteintrag als Helferarbeit gebucht sind — er hängt am Einsatz, nicht dauerhaft an einer Person."
        >
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

        </Card>

        <Card
          title="Zuschläge"
          hint="Zuschläge gelten als Aufschlag auf den Stundensatz. Nacht und Notdienst können zusammentreffen — dann addieren sich beide."
        >
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
                  <td className="py-1 text-right tnum">{fmtEUR(rates.fach)} €/h</td>
                </tr>
                <tr className="border-b border-line/60">
                  <td className="py-1">Nachtarbeit</td>
                  <td className="py-1 text-right tnum">{fmtEUR(nightFach)} €/h</td>
                </tr>
                <tr className="border-b border-line/60">
                  <td className="py-1">Notdienst</td>
                  <td className="py-1 text-right tnum">{fmtEUR(emergencyFach)} €/h</td>
                </tr>
                <tr>
                  <td className="py-1">Notdienst in der Nacht</td>
                  <td className="py-1 text-right tnum">{fmtEUR(bothFach)} €/h</td>
                </tr>
              </tbody>
            </table>
          </div>
        </Card>

        <Card
          title="Rechnungsvorgaben"
          hint="Diese Werte sind die Vorgabe für neue Rechnungen. Beim Erstellen lassen sie sich für den Einzelfall noch anpassen."
        >
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
              {/*
                „0 % (Reverse Charge)" STAND HIER UND WAR EINE FALLE.

                Die Auswahl setzte nur den Satz auf null. Weder der
                Pflichthinweis nach § 11 Abs 1a UStG noch die UID des
                Empfängers kamen dabei auf den Beleg — die Rechnung sah aus
                wie Reverse Charge und war keine. Und sie galt als VORGABE für
                jede Rechnung des Betriebs, auch die an Privatkunden.

                Der Übergang der Steuerschuld hängt an der einzelnen Leistung,
                nicht am Betrieb. Er wird deshalb je Rechnung angehakt, in der
                Vorschau beim Erstellen. Die Null bleibt als Satz wählbar — es
                gibt echte Nullfälle wie die Ausfuhrlieferung —, aber ohne die
                Beschriftung, die etwas anderes verspricht.
              */}
              <option value="0">0 %</option>
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
        </Card>

        {/*
          Kostensaetze — die andere Haelfte der Rechnung.

          Oben steht, was der Kunde zahlt. Hier steht, was die Stunde den
          Betrieb kostet: Lohn, Lohnnebenkosten und anteilige Gemeinkosten.
          Ohne diese Zahl laesst sich nicht sagen, ob eine Baustelle etwas
          verdient hat — und mit dem Verrechnungssatz an ihrer Stelle ergaebe
          jede Baustelle glatt null.
        */}
        <Card
          title="Interne Kostensätze"
          hint={
            <>
              Was eine Arbeitsstunde den Betrieb kostet — nicht, was sie dem Kunden verrechnet
              wird. Grundlage der Nachkalkulation. Üblich sind Lohn plus Lohnnebenkosten plus ein
              Anteil der Gemeinkosten.
            </>
          }
        >
          <FormGrid>
            <InputField
              id="costfach"
              label="Kosten Facharbeiterstunde (€)"
              value={String(costRates.fach).replace('.', ',')}
              onChange={(e) => setCostRates({ ...costRates, fach: num(e.target.value, 42) })}
            />
            <InputField
              id="costhelper"
              label="Kosten Helferstunde (€)"
              value={String(costRates.helper).replace('.', ',')}
              onChange={(e) => setCostRates({ ...costRates, helper: num(e.target.value, 28) })}
            />
          </FormGrid>
          <p className="mt-3 tnum text-sm text-ink">
            Deckungsbeitrag je Facharbeiterstunde:{' '}
            <strong>{fmtEUR(rates.fach - costRates.fach)}</strong>
            {rates.fach - costRates.fach <= 0 && (
              <span className="ml-2 text-danger">
                — der Verrechnungssatz liegt nicht über den Kosten.
              </span>
            )}
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

      {/*
        Monatsbilanzen — der einmalige Erstaufbau.

        Der Stundensaldo läuft seit dem ersten Arbeitstag und braucht deshalb
        als einzige Zahl im Programm wirklich jede Buchung; nach zehn
        Dienstjahren sind das über zweitausend Dokumente bei jedem Aufruf des
        Zeitkontos. Die Bilanzen verdichten das auf eine Zeile je Monat.

        Bewusst ein Knopf und keine automatische Umstellung: der Lauf liest
        einmal die gesamte Buchungsgeschichte — genau das, was danach
        vermieden wird. Er gehört zu einem ruhigen Zeitpunkt angestoßen, nicht
        beim ersten Seitenaufruf eines beliebigen Mitarbeiters.

        Bis er gelaufen ist, rechnet das Zeitkonto weiter direkt aus den
        Buchungen. Langsamer, aber richtig — und niemals eine falsche Zahl.
      */}
      {/*
        Wer Urlaub genehmigt — der Geschaeftsfuehrung vorbehalten.
        Duerfte die Projektleitung sie aendern, koennte sie sich selbst
        eintragen und ueber die Urlaube derer entscheiden, die sie einteilt.
        Dieselbe Grenze steht in firestore.rules.
      */}
      {darfGenehmigerSetzen && (
        <Card
          title="Wer Urlaub genehmigt"
          hint={
            <>
              Eine Genehmigung trägt die Urlaubstage ins Zeitkonto ein. Wer sie aussprechen darf,
              entscheidet damit über bezahlte Tage — die Auswahl gilt deshalb auch serverseitig,
              nicht nur in der Oberfläche.
            </>
          }
        >
          <p className="text-sm text-ink">
            Über Urlaubsanträge entscheiden <strong>{immerDabei.join(', ') || 'Geschäftsführung und Administration'}</strong> immer
            — das lässt sich nicht abwählen, sonst könnte eine Fehleingabe den ganzen Betrieb
            aussperren. Hier kommen weitere Personen dazu.
          </p>
          <p className="mt-2 text-sm text-ink-muted">
            Bleibt die Auswahl leer, entscheidet zusätzlich die <strong>Buchhaltung</strong> — so
            war es, bevor es diese Einstellung gab.
          </p>

          <div className="mt-4">
            <PersonPicker
              legend="Zusätzlich genehmigungsberechtigt"
              idPrefix="urlaubgen"
              people={auswaehlbar.map((u) => ({ uid: u.uid, name: u.name, hint: u.role }))}
              selected={genehmiger}
              onChange={setGenehmiger}
              emptyHint="Keine weiteren aktiven Benutzer vorhanden."
            />
          </div>

          <div className="mt-4">
            <Button
              type="button"
              loading={genehmigerSpeichert}
              onClick={genehmigerSpeichern}
            >
              Genehmigende speichern
            </Button>
          </div>
        </Card>
      )}

      <Card
        title="Monatsbilanzen"
        hint={
          <>
            Das Zeitkonto lädt danach ein Dokument je Monat statt aller Buchungen seit Eintritt —
            bei langer Betriebszugehörigkeit der Unterschied zwischen ein paar hundert und ein
            paar tausend Dokumenten. Danach wird jede Bilanz bei jeder Buchung nachgezogen, und
            ein nächtlicher Lauf gleicht Abweichungen von selbst aus. Solange der Aufbau nicht
            gelaufen ist, rechnet das Zeitkonto wie bisher — die angezeigten Salden ändern sich
            durch den Aufbau nicht.
          </>
        }
      >
        <p className="text-sm text-ink">
          Verdichtet die Zeitbuchungen zu einer Bilanz je Mitarbeiter und Monat. Einmalig
          anzustoßen.
        </p>
        {/*
          DER NÄCHTLICHE LAUF war die stillste Stelle der ganzen App. Er
          gleicht Abweichungen aus; fällt er aus, steht ein Saldo still
          daneben und landet auf einem Lohnzettel. Bemerkt hätte das niemand.
        */}
        <div className="mt-3">
          <LaufStatus art="bilanzen" />
        </div>
        {aufbauErgebnis && (
          <p className="mt-3 rounded-sm border border-success/30 bg-success-bg px-3 py-2 text-sm text-success">
            {aufbauErgebnis}
          </p>
        )}
        <div className="mt-4">
          <Button
            type="button"
            variant="secondary"
            loading={aufbauLaeuft}
            onClick={async () => {
              setAufbauLaeuft(true);
              setAufbauErgebnis(null);
              try {
                const { data } = await callBilanzenNeuAufbauen({});
                setAufbauErgebnis(
                  `${data.bilanzen} Bilanzen für ${data.mitarbeiter} Mitarbeiter aufgebaut.`,
                );
                toast.success('Monatsbilanzen aufgebaut');
              } catch {
                setError('Der Aufbau ist fehlgeschlagen. Bitte später erneut versuchen.');
              } finally {
                setAufbauLaeuft(false);
              }
            }}
          >
            Monatsbilanzen aufbauen
          </Button>
        </div>
      </Card>
    </div>
  );
}
