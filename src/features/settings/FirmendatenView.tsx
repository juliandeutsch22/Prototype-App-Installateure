import { useState, type FormEvent } from 'react';
import { useAuth } from '@/app/AuthContext';
import { updateCompany } from '@/lib/db/company';
import { isTopLevel } from '@/lib/permissions';
import { logoAufbereiten, LogoFehler, dataUrlBytes } from '@/lib/logoAufbereiten';
import { istZeichenbar } from '@/lib/pdfBriefkopf';
import { urteil } from '@/lib/kontrast';
import Card from '@/components/Card';
import Button from '@/components/Button';
import PageHeader from '@/components/PageHeader';
import { InputField, FormGrid } from '@/components/Field';
import { useToast } from '@/components/Toast';
import { ErrorState } from '@/components/States';

/**
 * Die Stammdaten des Betriebs — was auf Rechnung, Stundenbericht und
 * Handwerksschein steht.
 *
 * WARUM ES DIESE SEITE BRAUCHT. Die Felder gab es längst im Datenmodell, und
 * Rechnung und Stundenbericht lesen sie auch. Nur pflegen konnte sie niemand:
 * es gab kein einziges Formular dafür. Wer den Briefkopf ändern wollte,
 * musste das Dokument in der Firebase-Konsole von Hand bearbeiten — für einen
 * Installationsbetrieb keine ernsthafte Antwort.
 *
 * WAS HIER NICHT STEHT: die Markenfarben. Sie greifen in das ganze
 * Erscheinungsbild ein, und eine falsch gewählte Kombination macht Text
 * unlesbar. Das gehört mit einer Vorschau und Kontrastprüfung gebaut, nicht
 * nebenbei in ein Formular für Anschriften.
 *
 * SEIT DEM 07.09.2026 SIND SIE DA — mit genau dieser Vorschau und dieser
 * Prüfung. Die Mechanik dahinter gab es längst (`lib/tenant.ts` setzt die
 * CSS-Variablen); gefehlt hat der Weg, sie zu pflegen, ohne sich die
 * Oberfläche unlesbar zu machen.
 */
export default function FirmendatenView() {
  const { user, company, reloadCompany } = useAuth();
  const toast = useToast();

  const [name, setName] = useState(company?.name ?? '');
  const [addressLine, setAddressLine] = useState(company?.addressLine ?? '');
  const [contactLine, setContactLine] = useState(company?.contactLine ?? '');
  const [vatId, setVatId] = useState(company?.vatId ?? '');
  const [companyRegister, setCompanyRegister] = useState(company?.companyRegister ?? '');
  const [iban, setIban] = useState(company?.iban ?? '');
  const [bic, setBic] = useState(company?.bic ?? '');
  const [bankName, setBankName] = useState(company?.bankName ?? '');
  const [logoUrl, setLogoUrl] = useState(company?.logoUrl ?? '');
  const [brandColor, setBrandColor] = useState(company?.brandColor ?? '');
  const [brandForeground, setBrandForeground] = useState(company?.brandForeground ?? '');
  const [accentColor, setAccentColor] = useState(company?.accentColor ?? '');
  const [accentForeground, setAccentForeground] = useState(company?.accentForeground ?? '');

  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [logoFehler, setLogoFehler] = useState<string | null>(null);
  const [logoLaeuft, setLogoLaeuft] = useState(false);

  if (!user) return null;
  if (!isTopLevel(user.role)) {
    return (
      <div className="space-y-6">
        <PageHeader title="Firmendaten" subtitle="Was auf den Belegen steht" />
        <Card>
          <p className="text-sm text-ink-muted">
            Diese Angaben pflegt die Geschäftsführung. Sie stehen auf Rechnungen und Belegen und
            gelten für den ganzen Betrieb.
          </p>
        </Card>
      </div>
    );
  }

  async function logoWaehlen(datei: File | undefined) {
    if (!datei) return;
    setLogoFehler(null);
    setLogoLaeuft(true);
    try {
      setLogoUrl(await logoAufbereiten(datei));
    } catch (e) {
      /*
        Der Text kommt aus `LogoFehler` und ist für den Betrieb geschrieben.
        Alles andere bekommt einen eigenen Satz — eine durchgereichte
        technische Meldung hilft hier niemandem.
      */
      setLogoFehler(
        e instanceof LogoFehler ? e.message : 'Das Logo konnte nicht verarbeitet werden.',
      );
    } finally {
      setLogoLaeuft(false);
    }
  }

  async function submit(e: FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError(null);
    try {
      /*
        Leere Felder werden als leerer Text gespeichert, nicht ausgelassen:
        sonst liesse sich eine einmal eingetragene Angabe nie wieder
        entfernen — `merge` würde den alten Wert stehen lassen.
      */
      await updateCompany(user!.companyId, {
        name: name.trim(),
        addressLine: addressLine.trim(),
        contactLine: contactLine.trim(),
        vatId: vatId.trim(),
        companyRegister: companyRegister.trim(),
        iban: iban.trim(),
        bic: bic.trim(),
        bankName: bankName.trim(),
        logoUrl,
        brandColor: brandColor.trim(),
        brandForeground: brandForeground.trim(),
        accentColor: accentColor.trim(),
        accentForeground: accentForeground.trim(),
      });
      await reloadCompany();
      toast.success('Firmendaten gespeichert');
    } catch {
      setError('Die Firmendaten konnten nicht gespeichert werden.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Firmendaten"
        subtitle="Briefkopf für Rechnung, Stundenbericht und Handwerksschein"
      />

      <form onSubmit={submit} className="space-y-6">
        <Card
          title="Briefkopf"
          hint="Diese Angaben stehen oben auf jedem Beleg, den der Betrieb ausgibt."
        >
          <FormGrid>
            <InputField
              id="fd-name"
              label="Firmenname"
              value={name}
              onChange={(e) => setName(e.target.value)}
              required
            />
            <InputField
              id="fd-adresse"
              label="Anschrift (eine Zeile)"
              placeholder="Musterstraße 1 · 2700 Wiener Neustadt"
              value={addressLine}
              onChange={(e) => setAddressLine(e.target.value)}
            />
            <InputField
              id="fd-kontakt"
              label="Kontakt (eine Zeile)"
              placeholder="02622 12345 · office@betrieb.at · www.betrieb.at"
              value={contactLine}
              onChange={(e) => setContactLine(e.target.value)}
            />
          </FormGrid>
        </Card>

        <Card
          title="Logo"
          hint={
            <>
              Erscheint oben rechts auf allen drei Belegen. Das Bild wird beim Auswählen
              verkleinert und in das Briefkopf-Format eingepasst — es behält seine Form und wird
              nicht beschnitten. PNG mit durchsichtigem Grund sieht am besten aus.
            </>
          }
        >
          {istZeichenbar(logoUrl) ? (
            <div className="space-y-3">
              {/*
                Vorschau auf hellem Grund und im Seitenverhältnis des
                Briefkopfs: so sieht man vorher, was auf dem Beleg landet.
              */}
              <div className="inline-flex items-center justify-center rounded border border-line bg-white p-2">
                <img src={logoUrl} alt="Logo des Betriebs" className="h-12 w-auto" />
              </div>
              <p className="text-xs text-ink-muted">
                Rund <span className="tnum">{Math.round(dataUrlBytes(logoUrl) / 1024)}</span> kB.
              </p>
              <Button variant="danger" onClick={() => setLogoUrl('')}>
                Logo entfernen
              </Button>
            </div>
          ) : (
            <p className="text-sm text-ink-muted">
              {logoUrl
                ? 'Hier steht eine Adresse statt eines Bildes. Für die Oberfläche reicht das, für das PDF nicht — dort muss das Bild selbst hinterlegt sein. Bitte die Datei auswählen.'
                : 'Noch kein Logo hinterlegt. Die Belege tragen dann nur den Firmennamen.'}
            </p>
          )}

          <div className="mt-3">
            <label htmlFor="fd-logo" className="section-label block">
              Bilddatei wählen
            </label>
            <input
              id="fd-logo"
              type="file"
              accept="image/png,image/jpeg,image/webp"
              disabled={logoLaeuft}
              onChange={(e) => void logoWaehlen(e.target.files?.[0])}
              className="mt-1 block w-full text-sm text-ink file:mr-3 file:min-h-touch file:rounded file:border file:border-line file:bg-surface-2 file:px-4 file:py-2 file:text-sm file:font-semibold file:text-ink"
            />
          </div>
          {logoFehler && (
            <div className="mt-3">
              <ErrorState message={logoFehler} />
            </div>
          )}
        </Card>

        <Card
          title="Rechnungsangaben"
          hint="UID und Firmenbuchnummer stehen im Fuß der Rechnung, die Bankverbindung im Zahlungshinweis."
        >
          <FormGrid>
            <InputField
              id="fd-uid"
              label="UID-Nummer"
              placeholder="ATU12345678"
              value={vatId}
              onChange={(e) => setVatId(e.target.value)}
            />
            <InputField
              id="fd-fn"
              label="Firmenbuchnummer"
              placeholder="FN 123456a"
              value={companyRegister}
              onChange={(e) => setCompanyRegister(e.target.value)}
            />
            <InputField
              id="fd-iban"
              label="IBAN"
              value={iban}
              onChange={(e) => setIban(e.target.value)}
            />
            <InputField
              id="fd-bic"
              label="BIC"
              value={bic}
              onChange={(e) => setBic(e.target.value)}
            />
            <InputField
              id="fd-bank"
              label="Bank"
              value={bankName}
              onChange={(e) => setBankName(e.target.value)}
            />
          </FormGrid>
        </Card>

        {/*
          DIE MARKENFARBEN — mit Vorschau und Prüfung, oder gar nicht.

          Zwei Werte, die über die ganze Oberfläche wirken: `--brand` trägt
          jeden Hauptknopf, `--accent` jede Hervorhebung. Wer sie aussucht,
          weiss ja, was auf dem Knopf steht — der Monteur im Keller bei
          schlechtem Licht nicht.

          Die Prüfung SPERRT NICHT, sie sagt. Es gibt Betriebe mit einer
          Hausfarbe, die knapp unter der Schwelle liegt, und ihnen die eigene
          Marke zu verbieten wäre anmassend. Aber niemand soll sie
          versehentlich unlesbar machen.
        */}
        <Card
          title="Farben"
          hint={
            'Die Hausfarben des Betriebs. Sie färben Knöpfe und Hervorhebungen in der ganzen ' +
            'App — die Belege bleiben davon unberührt. Leer lassen heisst: die Vorgabe gilt.'
          }
        >
          <FormGrid>
            <InputField
              id="fd-brand"
              label="Hauptfarbe (#rrggbb)"
              placeholder="#003366"
              value={brandColor}
              onChange={(e) => setBrandColor(e.target.value)}
            />
            <InputField
              id="fd-brand-fg"
              label="Schrift darauf"
              placeholder="#ffffff"
              value={brandForeground}
              onChange={(e) => setBrandForeground(e.target.value)}
            />
            <InputField
              id="fd-accent"
              label="Akzentfarbe (#rrggbb)"
              placeholder="#c8102e"
              value={accentColor}
              onChange={(e) => setAccentColor(e.target.value)}
            />
            <InputField
              id="fd-accent-fg"
              label="Schrift darauf"
              placeholder="#ffffff"
              value={accentForeground}
              onChange={(e) => setAccentForeground(e.target.value)}
            />
          </FormGrid>

          <div className="mt-4 space-y-3">
            {(
              [
                ['Hauptfarbe', brandColor, brandForeground],
                ['Akzentfarbe', accentColor, accentForeground],
              ] as const
            ).map(([bezeichnung, hintergrund, schrift]) => {
              if (!hintergrund && !schrift) return null;
              const u = urteil(hintergrund, schrift);
              return (
                <div key={bezeichnung} className="flex flex-wrap items-center gap-3">
                  {/*
                    Die Vorschau zeigt, was der Nutzer bekommt: ein Knopf, wie
                    er später überall steht. Eine Farbfläche allein sagt nichts
                    über Lesbarkeit.
                  */}
                  <span
                    className="inline-flex min-h-touch items-center rounded px-4 py-2 text-sm font-semibold"
                    style={{ backgroundColor: hintergrund || undefined, color: schrift || undefined }}
                  >
                    {bezeichnung}
                  </span>
                  <span
                    className={`text-sm ${u.reicht ? 'text-ink-muted' : 'text-warning'}`}
                    role={u.reicht ? undefined : 'alert'}
                  >
                    {u.text}
                  </span>
                </div>
              );
            })}
          </div>
        </Card>

        {error && <ErrorState message={error} />}

        <Button type="submit" loading={saving} disabled={logoLaeuft}>
          Firmendaten speichern
        </Button>
      </form>
    </div>
  );
}
