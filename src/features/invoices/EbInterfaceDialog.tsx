import { useEffect, useMemo, useState } from 'react';
import ConfirmDialog from '@/components/ConfirmDialog';
import { CheckboxField, InputField } from '@/components/Field';
import Hinweiszeile from '@/components/Hinweiszeile';
import { Segmente } from '@/components/LotBausteine';
import { useToast } from '@/components/Toast';
import { kundenNachNamen, updateCustomer } from '@/lib/db/customers';
import { belegFirma } from '@/lib/db/aussteller';
import type { WithId } from '@/lib/db/core';
import type { Company, Customer, Invoice } from '@/types';
import { ebiDateiname, ebInterfaceXml, ebiPruefen, type EbiEmpfaengerArt } from './ebinterface';

/**
 * DIE E-RECHNUNG ZU EINER RECHNUNG (ebInterface 6.1, 19.10.2026).
 *
 * Ein Dialog statt eines stillen Downloads: an wen die Datei geht, entscheidet
 * über Pflichtangaben (beim Bund Auftragsreferenz und Lieferantennummer), und
 * was fehlt, soll VOR dem Hochladen dastehen — nicht als Ablehnung von
 * e-Rechnung.gv.at Tage später. Die Prüfung ist dieselbe, die das Erzeugen
 * zurückhält (`ebiPruefen`).
 */

const ARTEN = [
  { wert: 'allgemein', text: 'Unternehmen' },
  { wert: 'bund', text: 'Bund' },
  { wert: 'andere', text: 'Land, Gemeinde, andere' },
] as const;

/** Name für den Abgleich mit dem Kundenstamm — wie die Rechnungsliste ihn vergleicht. */
const namensSchluessel = (s: string) => s.trim().toLowerCase().replace(/\s+/g, ' ');

function dateiSpeichern(inhalt: string, name: string) {
  const url = URL.createObjectURL(new Blob([inhalt], { type: 'application/xml;charset=utf-8' }));
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

export default function EbInterfaceDialog({
  inv,
  storno = false,
  company,
  darfKundenPflegen,
  onClose,
}: {
  inv: WithId<Invoice> | null;
  /** Die Stornorechnung statt der Rechnung. */
  storno?: boolean;
  company: Company | null;
  darfKundenPflegen: boolean;
  onClose: () => void;
}) {
  const toast = useToast();
  const [art, setArt] = useState<EbiEmpfaengerArt>('allgemein');
  const [referenz, setReferenz] = useState('');
  const [position, setPosition] = useState('10');
  const [lieferant, setLieferant] = useState('');
  const [kunde, setKunde] = useState<WithId<Customer> | null>(null);
  const [merken, setMerken] = useState(true);
  /*
    DER RECHNUNGSSTELLER, WIE ER AUF DER RECHNUNG STAND (seit 24.10.2026) —
    Anschrift, UID, Bank. Die E-Rechnung muss zum PDF passen, das der Kunde
    hat, nicht zu den heutigen Firmendaten.
  */
  const [firma, setFirma] = useState<Company | null>(null);
  const [firmaFehler, setFirmaFehler] = useState<string | null>(null);
  useEffect(() => {
    setFirma(null);
    setFirmaFehler(null);
    if (!inv || !company) return;
    let aktiv = true;
    belegFirma(company, storno ? inv.stornoAusstellerStand : inv.ausstellerStand)
      .then((f) => {
        if (aktiv) setFirma(f);
      })
      .catch((e: unknown) => {
        if (aktiv) setFirmaFehler(e instanceof Error ? e.message : 'Die Firmendaten der Rechnung konnten nicht geladen werden.');
      });
    return () => {
      aktiv = false;
    };
  }, [inv, company, storno]);

  useEffect(() => {
    if (!inv || !company) return;
    setArt('allgemein');
    setReferenz(inv.bestellnummer?.trim() ?? '');
    setPosition('10');
    setLieferant('');
    setKunde(null);
    setMerken(true);
    let aktiv = true;
    // Der Kunde der Rechnung — für Lieferantennummer, E-Mail und Kundennummer.
    kundenNachNamen(company.id, [inv.customerName])
      .then((treffer) => {
        if (!aktiv) return;
        const k = treffer.find((t) => namensSchluessel(t.name) === namensSchluessel(inv.customerName)) ?? null;
        setKunde(k);
        if (k?.lieferantennummer?.trim()) setLieferant(k.lieferantennummer.trim());
      })
      // Ohne Kundenstamm geht es auch: dann fehlen nur die Vorschläge.
      .catch(() => undefined);
    return () => {
      aktiv = false;
    };
  }, [inv, company]);

  const optionen = useMemo(
    () => (inv && firma
      ? {
          company: firma, invoice: inv, storno, empfaengerArt: art,
          auftragsreferenz: referenz, bestellposition: position, lieferantennummer: lieferant,
          kunde,
        }
      : null),
    [inv, firma, storno, art, referenz, position, lieferant, kunde],
  );
  const pruefung = useMemo(() => (optionen ? ebiPruefen(optionen) : { fehler: [], hinweise: [] }), [optionen]);
  const zehnstellig = /^\d{10}$/.test(referenz.trim());
  const neueNummer = !!kunde && lieferant.trim() !== (kunde.lieferantennummer ?? '').trim();
  const nummer = inv ? (storno ? inv.stornoNummer ?? inv.invoiceNumber : inv.invoiceNumber) : '';

  return (
    <ConfirmDialog
      open={!!inv}
      title={`E-Rechnung — ${storno ? 'Stornorechnung ' : ''}${nummer}`}
      message="Die Rechnung als ebInterface-Datei (6.1), mit denselben Positionen und Beträgen wie das PDF."
      confirmLabel="Datei laden"
      confirmTone="primary"
      onCancel={onClose}
      onConfirm={async () => {
        if (firmaFehler) throw new Error(firmaFehler);
        if (inv && company && !firma) throw new Error('Die Firmendaten der Rechnung werden noch geladen — bitte gleich noch einmal.');
        if (!optionen) return;
        if (pruefung.fehler.length > 0) throw new Error('Erst die Angaben unten ergänzen — so würde die E-Rechnung abgewiesen.');
        const xml = ebInterfaceXml(optionen);
        dateiSpeichern(xml, ebiDateiname(optionen));
        if (kunde && neueNummer && merken && darfKundenPflegen) {
          try {
            await updateCustomer(kunde.companyId, kunde.id, { lieferantennummer: lieferant.trim() || null });
          } catch {
            toast.error('Die Datei ist geladen; die Lieferantennummer ließ sich beim Kunden nicht speichern.');
            onClose();
            return;
          }
        }
        toast.success(`E-Rechnung ${nummer} geladen`);
        onClose();
      }}
    >
      <div className="space-y-3">
        {firmaFehler && (
          <Hinweiszeile stufe="fehl">
            <p>{firmaFehler}</p>
          </Hinweiszeile>
        )}
        <Segmente name="Empfänger" werte={ARTEN} wert={art} onChange={setArt} />
        <InputField
          id="ebi-referenz"
          label={art === 'allgemein' ? 'Bestellnummer des Kunden (freiwillig)' : 'Auftragsreferenz'}
          pflicht={art !== 'allgemein'}
          placeholder={art === 'bund' ? 'z. B. 4700000001 oder Z01' : art === 'andere' ? 'z. B. Z0/Akt 4711' : undefined}
          value={referenz}
          onChange={(e) => setReferenz(e.target.value)}
        />
        {art === 'bund' && zehnstellig && (
          <InputField id="ebi-position" label="Bestellposition" pflicht value={position} onChange={(e) => setPosition(e.target.value)} />
        )}
        <InputField
          id="ebi-lieferant"
          label={art === 'allgemein' ? 'Unsere Lieferantennummer beim Kunden (freiwillig)' : 'Unsere Lieferantennummer'}
          pflicht={art !== 'allgemein'}
          placeholder={art === 'bund' ? 'achtstellig, z. B. 50012345' : undefined}
          value={lieferant}
          onChange={(e) => setLieferant(e.target.value)}
        />
        {kunde && neueNummer && lieferant.trim() !== '' && (
          darfKundenPflegen
            ? <CheckboxField id="ebi-merken" label="Lieferantennummer beim Kunden merken" checked={merken} onChange={(e) => setMerken(e.target.checked)} />
            : <p className="text-sm text-ink-muted">Gilt nur für diese Datei. Beim Kunden hinterlegen kann sie, wer Kunden pflegt.</p>
        )}
        {pruefung.fehler.map((f) => (
          <Hinweiszeile key={f} stufe="fehl"><p>{f}</p></Hinweiszeile>
        ))}
        {pruefung.hinweise.map((h) => (
          <Hinweiszeile key={h} stufe="warn"><p>{h}</p></Hinweiszeile>
        ))}
        <p className="text-sm text-ink-muted">
          {art === 'allgemein'
            ? 'Die Datei geht per E-Mail oder über das Portal des Kunden an ihn.'
            : 'Die Datei unter e-rechnung.gv.at hochladen (Anmeldung über das Unternehmensserviceportal, „Upload“).'}
        </p>
      </div>
    </ConfirmDialog>
  );
}
