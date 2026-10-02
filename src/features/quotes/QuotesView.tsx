import { useEffect, useMemo, useState } from 'react';
import OhneUmbruch from '@/components/OhneUmbruch';
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
import { todayStr, localDateStr, fmtStunden } from '@/lib/time';
import { isGF } from '@/lib/permissions';
import type { Abrechnungsart, Customer, InvoiceDiscount, Quote } from '@/types';
import type { WithId } from '@/lib/db/core';
import InfoHint from '@/components/InfoHint';
import KundenGrenze from '@/components/AuswahlGrenze';
import Card from '@/components/Card';
import Button from '@/components/Button';
import Hinweiszeile from '@/components/Hinweiszeile';
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
import { datumAT } from '@/lib/datum';
import { euro } from '@/lib/betrag';
import { leseZahl, zahlAlsText, zahlOder } from '@/lib/zahl';
import ZahlFeld from '@/components/ZahlFeld';
import AdresseFeld from '@/components/AdresseFeld';
import AbrechnungWahl from './AbrechnungWahl';

/**
 * Zahl aus einem Eingabefeld — über die zentrale Lesung (M15). „7.500,50“
 * ergab hier vorher 0; was sich nicht eindeutig lesen lässt, meldet das
 * Feld, und angelegt wird erst, wenn alles lesbar ist.
 */
function num(v: string): number {
  return zahlOder(v, 0);
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

  Jede neue Position begann mit „h" und angehaktem „Zählt als Arbeitszeit".
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

/*
  HELFERSTUNDEN SIND KEIN BUDGET DER AMPEL (Prüflauf 25.09.2026, P2-22). Die
  Budget-Ampel der Baustelle misst die FACHARBEITERzeit (`calcBudgetState`
  bekommt `fachMin`); eine Zeile „Helferstunden, 10 h" zählte trotzdem von
  selbst ins Budget, und die Ampel blieb um genau diese Stunden zu lange
  grün. Der Haken folgt deshalb auch der Bezeichnung — wer ihn von Hand
  setzt, behält ihn.
*/
function zaehltAlsArbeitszeit(einheit: string, bezeichnung: string): boolean {
  return istStundenEinheit(einheit) && !/helfer/i.test(bezeichnung);
}

/*
  EINE NEUE ZEILE BEGINNT OHNE EINHEIT UND OHNE HAKEN (Launch-Check
  25.09.2026, M7). Mit „h" vorbelegt zählte „1 Heizkörper", bei dem niemand
  die Einheit anfasste, als Stunde ins Budget (4,5 statt 3,5 h). Wer „h"
  einträgt, bekommt den Haken wie bisher von selbst.
*/
const LEERE_ZEILE: ZeilenEingabe = {
  label: '',
  qty: '',
  unit: '',
  unitPrice: '',
  istArbeitszeit: false,
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
  /** Welches Angebot gerade angenommen werden soll — erst nach der Rückfrage. */
  const [annehmenFragen, setAnnehmenFragen] = useState<WithId<Quote> | null>(null);
  /** Die Abrechnung der Baustelle, die beim Annehmen entsteht (M16). */
  const [abrechnung, setAbrechnung] = useState<Abrechnungsart>('Pauschal');

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
  /**
   * Das Angebot, das als NEUE FASSUNG überarbeitet wird (Testbericht
   * 30.09.2026, M17) — oder `null`. Es selbst bleibt, wie es beim Kunden
   * liegt; gespeichert wird ein neuer Entwurf, der darauf verweist.
   */
  const [fassungVon, setFassungVon] = useState<WithId<Quote> | null>(null);
  /** Der Rabatt eines übernommenen Angebots (neue Fassung oder Kopie). */
  const [rabattVorlage, setRabattVorlage] = useState<InvoiceDiscount | null>(null);
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
  const rabatt = bearbeitet ? (bearbeitet.discount ?? null) : rabattVorlage;
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
      /*
        NUR ZEILEN, DIE AUCH GESPEICHERT WERDEN (P2-22) — dieselbe Bedingung
        wie bei `positionen`. Eine Zeile ohne Bezeichnung fällt beim
        Speichern weg; ihre Stunden standen trotzdem im Budget.
      */
      zeilen
        .filter((z) => z.istArbeitszeit && z.label.trim() && num(z.qty) > 0)
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
    setFassungVon(null);
    setRabattVorlage(null);
    setStundenVorher(null);
  }

  /** Kunde, Anschrift, Anmerkungen und Positionen eines Angebots ins Formular. */
  function formularAus(q: WithId<Quote>) {
    setCustomerId(q.customerId ?? '');
    setAddress(q.address ?? '');
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
            qty: zahlAlsText(p.qty),
            unit: p.unit,
            unitPrice: zahlAlsText(p.unitPrice),
            istArbeitszeit: p.istArbeitszeit ?? zaehltAlsArbeitszeit(p.unit, p.label),
            hakenVonHand: p.istArbeitszeit !== undefined,
          }))
        : [{ ...LEERE_ZEILE }],
    );
    setError(null);
    setFormOffen(true);
    window.scrollTo?.({ top: 0 });
  }

  /** Einen Entwurf ins Formular holen. */
  function bearbeiten(q: WithId<Quote>) {
    formularAus(q);
    setValidUntil(q.validUntil);
    setFassungVon(null);
    setRabattVorlage(null);
    setBearbeitet(q);
  }

  /**
   * Ein Angebot als Vorlage für ein neues (M17): als NEUE FASSUNG mit
   * Verweis auf das alte, oder als unabhängige KOPIE. Das alte bleibt
   * unverändert; das neue bekommt eine eigene Nummer, ein neues Datum und
   * eine neue Gültigkeit.
   */
  function alsVorlage(q: WithId<Quote>, fassung: boolean) {
    formularAus(q);
    const d = new Date();
    d.setDate(d.getDate() + 30);
    setValidUntil(localDateStr(d));
    setBearbeitet(null);
    setFassungVon(fassung ? q : null);
    setRabattVorlage(q.discount ?? null);
  }

  /*
    VON DER ANGEBOTSSEITE KOMMEND: `/quotes?bearbeiten=<id>`. Geöffnet wird
    erst, wenn die Liste da ist — und nur ein Entwurf. Der Parameter geht
    danach weg, sonst öffnete jedes Neuladen die Maske wieder.
  */
  const zuBearbeiten = suchParameter.get('bearbeiten');
  const zuFassen = suchParameter.get('neueFassung');
  const zuKopieren = suchParameter.get('kopie');
  useEffect(() => {
    if ((!zuBearbeiten && !zuFassen && !zuKopieren) || loading) return;
    const q = angebote.find((a) => a.id === (zuBearbeiten ?? zuFassen ?? zuKopieren));
    if (q && darfAendern) {
      if (zuBearbeiten && q.status === 'Entwurf') bearbeiten(q);
      else if (zuFassen && q.status !== 'Entwurf') alsVorlage(q, true);
      else if (zuKopieren) alsVorlage(q, false);
    }
    setSuchParameter({}, { replace: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [zuBearbeiten, zuFassen, zuKopieren, loading, angebote]);

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
    const unlesbar = zeilen.find((z) => leseZahl(z.qty).fehler || leseZahl(z.unitPrice).fehler);
    if (unlesbar) {
      setError(leseZahl(unlesbar.qty).fehler ?? leseZahl(unlesbar.unitPrice).fehler);
      return;
    }
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
        // Neu: ohne Rabatt; als Fassung oder Kopie der des Vorbilds.
        discount: rabatt,
        // `calcTotals` liefert `discountAmount` mit — dieselbe Rechnung wie
        // bei der Rechnung selbst, damit beide nie auseinanderlaufen.
        ...summen,
        vatRate,
        kalkulierteStunden,
        notes,
        ...(fassungVon ? { vorgaengerId: fassungVon.id } : {}),
      });
      toast.success(
        fassungVon ? `Angebot ${nummer} als neue Fassung von ${fassungVon.quoteNumber} angelegt` : `Angebot ${nummer} angelegt`,
      );
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
      toast.success(annahmeMeldung(await angebotAnnehmen(user.companyId, q, vorsaetze.baustelle, abrechnung)));
      await laden();
    } catch (err) {
      setError(grundAus(err, 'Die Baustelle konnte nicht angelegt werden.'));
    } finally {
      setBusy(false);
    }
  }

  if (!user) return null;

  return (
    // Abstände der Designlinie „Fassung 3": 12 px am Telefon, 20 px am Schreibtisch.
    <div className="space-y-3 lg:space-y-5">
      <PageHeader
        title="Angebote"
        subtitle="Kalkulieren, versenden, in einen Auftrag überführen"
        action={
          darfAendern && !formOffen ? (
            <Button onClick={() => setFormOffen(true)}>Neues Angebot</Button>
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
        <Card
          title={
            bearbeitet
              ? `Angebot ${bearbeitet.quoteNumber} bearbeiten`
              : fassungVon
                ? `Neue Fassung von ${fassungVon.quoteNumber}`
                : 'Neues Angebot'
          }
        >
          {fassungVon && (
            <div className="mb-4">
              <Hinweiszeile>
                <p>
                  {fassungVon.quoteNumber} bleibt, wie es beim Kunden liegt. Diese Fassung bekommt eine eigene
                  Nummer und verweist darauf.
                </p>
              </Hinweiszeile>
            </div>
          )}
          <FormGrid>
            <SelectField
              id="anqk"
              label="Kunde"
              value={customerId}
              onChange={(e) => {
                const vorher = kunden.find((x) => x.id === customerId)?.address;
                setCustomerId(e.target.value);
                const k = kunden.find((x) => x.id === e.target.value);
                // Vorschlag, nicht Überschreiben: nur ein leeres Feld oder der
                // unveränderte Vorschlag des vorigen Kunden wird ersetzt (G3).
                if (!address || address === vorher) setAddress(k?.address ?? '');
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
            <AdresseFeld
              id="anqadr"
              label="Ort der Leistung"
              value={address}
              onChange={setAddress}
              vorschlag={kunden.find((k) => k.id === customerId)?.address}
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
                      setZeilen((v) =>
                        v.map((x, j) =>
                          j === i
                            ? {
                                ...x,
                                label: e.target.value,
                                istArbeitszeit: x.hakenVonHand
                                  ? x.istArbeitszeit
                                  : zaehltAlsArbeitszeit(x.unit, e.target.value),
                              }
                            : x,
                        ),
                      )
                    }
                  />
                  <FormGrid>
                    <ZahlFeld
                      id={`anqqty${i}`}
                      label="Menge"
                      value={z.qty}
                      onChange={(text) =>
                        setZeilen((v) => v.map((x, j) => (j === i ? { ...x, qty: text } : x)))
                      }
                    />
                    <InputField
                      id={`anqunit${i}`}
                      label="Einheit"
                      placeholder="z. B. h, Stk, m"
                      value={z.unit}
                      // Vorbelegt: beim Hineintippen ersetzen statt anhängen (Testbericht 30.09.2026, G2).
                      onFocus={(e) => e.currentTarget.select()}
                      onChange={(e) =>
                        setZeilen((v) =>
                          v.map((x, j) =>
                            j === i
                              ? {
                                  ...x,
                                  unit: e.target.value,
                                  istArbeitszeit: x.hakenVonHand
                                    ? x.istArbeitszeit
                                    : zaehltAlsArbeitszeit(e.target.value, x.label),
                                }
                              : x,
                          ),
                        )
                      }
                    />
                    <ZahlFeld
                      id={`anqprice${i}`}
                      label="Einzelpreis netto"
                      value={z.unitPrice}
                      onChange={(text) =>
                        setZeilen((v) =>
                          v.map((x, j) => (j === i ? { ...x, unitPrice: text } : x)),
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
                    <span className="text-sm text-ink-muted">
                      {euro(positionNetto(num(z.qty), cent(num(z.unitPrice))))}
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
              className="min-h-touch rounded border border-line bg-surface px-3 py-2 text-base text-ink placeholder:text-ink-placeholder focus:border-brand focus:ring-1 focus:ring-brand"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
            />
          </div>

          {/* Die Summen mit einer Linie abgesetzt, nicht in einem Kasten. */}
          <div className="mt-4 border-t border-line pt-3">
            <p className="text-sm text-ink">
              Netto {euro(summen.totalNetto)} · USt {euro(summen.totalVat)} ·{' '}
              <strong>Brutto {euro(summen.totalBrutto)}</strong>
            </p>
            {/*
              Die Zahl bleibt sichtbar, die Erklärung dazu nicht: sie steht
              beim ersten Angebot im Weg und beim fünfzigsten erst recht.
            */}
            <p className="mt-1 flex flex-wrap items-center text-sm text-ink-muted">
              Kalkulierte Arbeitszeit: <strong className="ml-1">{fmtStunden(kalkulierteStunden)} h</strong>
              <InfoHint about="kalkulierte Arbeitszeit">
                Diese Stundenzahl wird beim Annehmen des Angebots zum <strong>Stundenbudget</strong>{' '}
                der neuen Baustelle. Daran misst die Auswertung später, ob die Baustelle im Rahmen
                geblieben ist — und die Nachkalkulation, was sie verdient hat. Gemessen wird die
                Zeit der Facharbeiter; Helferstunden zählen deshalb nicht von selbst mit.
              </InfoHint>
            </p>
          </div>

          {stundenVorher !== null && (
            <div className="mt-3">
              <Hinweiszeile stufe="warn" role="status">
                <p>
                  Bei diesem Angebot war nicht gespeichert, welche Positionen als Arbeitszeit
                  zählen. Die Haken sind aus der Einheit abgeleitet — bitte prüfen. Bisher
                  kalkuliert: <strong>{fmtStunden(stundenVorher)} h</strong>.
                </p>
              </Hinweiszeile>
            </div>
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

      {/* Bündig: Angebote als Zeilen von Kante zu Kante (Designlinie „Fassung 3"). */}
      <Card title={`Angebote (${angebote.length})`} buendig>
        {loading ? (
          <div className="p-4">
            <SkeletonList rows={3} />
          </div>
        ) : angebote.length === 0 ? (
          <EmptyState>Noch kein Angebot erstellt.</EmptyState>
        ) : (
          <List>
            {angebote.map((q) => (
              <ListRow
                key={q.id}
                title={
                  // Die Nummer führt zur Angebotsseite — Positionen, Anmerkungen, PDF.
                  // Tastfläche 48 px, Zeile unverändert: Polster und Gegen-
                  // rand heben sich im Layout auf (Prüflauf 25.09.2026).
                  <Link to={`/quotes/${q.id}`} className="link py-3 -my-3">
                    <span className="nr">{q.quoteNumber}</span> · <OhneUmbruch text={q.customerName} />
                  </Link>
                }
                wert={`${euro(q.totalBrutto)} brutto`}
                zustand={<Zustand stand={STAND[q.status]}>{q.status}</Zustand>}
                subtitle={
                  <>
                    {datumAT(q.quoteDate)} · gültig bis {datumAT(q.validUntil)}
                    <span className="mt-1 block text-xs text-ink-muted">
                      {fmtStunden(q.kalkulierteStunden)} h kalkuliert
                      {q.projectNumber ? <> · Baustelle <span className="nr">{q.projectNumber}</span></> : ''}
                    </span>
                  </>
                }
              >
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
                {/* M17: was beim Kunden liegt, wird als neue Fassung überarbeitet. */}
                {darfAendern && (q.status === 'Versendet' || q.status === 'Abgelehnt') && (
                  <Button variant="ghost" disabled={busy} onClick={() => alsVorlage(q, true)}>
                    Neue Fassung
                  </Button>
                )}
                {darfAendern && (q.status === 'Versendet' || q.status === 'Entwurf') && (
                  <>
                    <Button variant="ghost" loading={busy} onClick={() => { setAbrechnung('Pauschal'); setAnnehmenFragen(q); }}>
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

      {/*
        ERST FRAGEN, DANN ANLEGEN (Launch-Check, M8). Annehmen legt eine
        Baustelle an und verbraucht eine Nummer — ein verrutschter Finger in
        der Liste darf das nicht auslösen.
      */}
      <ConfirmDialog
        open={!!annehmenFragen}
        title="Angebot annehmen?"
        message={
          annehmenFragen
            ? `${annehmenFragen.quoteNumber} wird angenommen, und für ${annehmenFragen.customerName} entsteht eine Baustelle mit der nächsten Baustellennummer.`
            : ''
        }
        confirmLabel="Annehmen"
        confirmTone="primary"
        onCancel={() => setAnnehmenFragen(null)}
        onConfirm={async () => {
          const q = annehmenFragen;
          setAnnehmenFragen(null);
          if (q) await annehmen(q);
        }}
      >
        <AbrechnungWahl wert={abrechnung} onWert={setAbrechnung} />
      </ConfirmDialog>

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
