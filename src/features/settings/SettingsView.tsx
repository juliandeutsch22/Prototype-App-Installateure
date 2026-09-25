import { useEffect, useMemo, useState, type FormEvent } from 'react';
import { useAuth } from '@/app/AuthContext';
import { updateCompany, naechsteNummern, type NaechsteNummern } from '@/lib/db/company';
import { praefixeVon, praefixPutzen, praefixFehler, belegNummer, PRAEFIX_MAX } from '@/lib/praefixe';
import { listUsers } from '@/lib/db/users';
import { INVOICE_DEFAULTS } from '@/features/invoices/assemble';
import { isTopLevel } from '@/lib/permissions';
import type { AppUser, InvoiceRates } from '@/types';
import Card from '@/components/Card';
import Button from '@/components/Button';
import PageHeader from '@/components/PageHeader';
import { InputField, SelectField, CheckboxField, FormGrid } from '@/components/Field';
import PersonPicker from '@/components/PersonPicker';
import InfoHint from '@/components/InfoHint';
import { useToast } from '@/components/Toast';
import { ErrorState } from '@/components/States';
import { grundAus } from '@/lib/fehlerGrund';

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
/**
 * Monate und die Zahl ihrer Tage — für die Auswahl des Verfallsstichtags.
 *
 * DER 29. FEBRUAR STEHT BEWUSST NICHT ZUR WAHL. Es gibt ihn nur jedes vierte
 * Jahr; ein Verfallstag, der in drei von vier Jahren gar nicht eintritt, ist
 * keine Regel, sondern eine Falle. Dieselbe Grenze zieht die Datenbank.
 */
const MONATE = [
  ['01', 'Jänner', 31], ['02', 'Februar', 28], ['03', 'März', 31],
  ['04', 'April', 30], ['05', 'Mai', 31], ['06', 'Juni', 30],
  ['07', 'Juli', 31], ['08', 'August', 31], ['09', 'September', 30],
  ['10', 'Oktober', 31], ['11', 'November', 30], ['12', 'Dezember', 31],
] as const;

/**
 * Welche Unterseite der Einstellungen diese Ansicht zeigt.
 *
 * BIS ZUM 24.09.2026 WAR DAS EINE SEITE: unter „Sätze und Kosten" standen
 * auch Urlaubsjahr, Nummernkreise, Genehmigende und der Wochenplan — 5 000 px
 * am Telefon mit sechs Speichern-Knöpfen, und die Überschrift hiess
 * „Einstellungen" (Prüflauf, D10). Die Karten sind geblieben, wie sie waren;
 * sie stehen jetzt dort, wo man sie sucht.
 */
export type EinstellungsTeil = 'saetze' | 'nummern' | 'personal';

const KOPF: Record<EinstellungsTeil, { titel: string; unter: string }> = {
  saetze: { titel: 'Sätze und Kosten', unter: 'Stundensätze, Zuschläge, Rechnungsvorgaben und Kostensätze' },
  nummern: { titel: 'Nummernkreise', unter: 'Vorsätze für Rechnungen, Angebote, Baustellen und Kennzeichen' },
  personal: { titel: 'Personal', unter: 'Urlaubsjahr, Genehmigung und Wochenplan' },
};

export default function SettingsView({ teil = 'saetze' }: { teil?: EinstellungsTeil }) {
  const { user, company, reloadCompany } = useAuth();
  const toast = useToast();
  const [rates, setRates] = useState<InvoiceRates>(INVOICE_DEFAULTS);
  /**
   * Interne Kostensätze — was eine Stunde den BETRIEB kostet.
   *
   * Bewusst getrennt von den Verrechnungssätzen darüber. Wer beide
   * verwechselt, bekommt in der Nachkalkulation eine Marge von null und hält
   * sie für ein Ergebnis.
   *
   * LEER HEISST LEER, und das ist der Kern dieser Zeile. Vorher standen hier
   * 42 und 28 als „Hausnummer" — sichtbar im Formular, aber nirgends
   * gespeichert. Das ergab zwei Fehler auf einmal: die Nachkalkulation meldete
   * „Kostensätze fehlen", während daneben zwei gefüllte Felder standen, und
   * wer aus einem beliebigen anderen Grund auf Speichern drückte, schrieb
   * eine erfundene Zahl fest, auf der danach jede Marge des Betriebs beruhte.
   *
   * Als Text gehalten, weil eine Zahl kein „noch nichts eingetragen" kennt.
   */
  const [costRates, setCostRates] = useState({ fach: '', helper: '' });
  const [saving, setSaving] = useState(false);
  /*
    DER FEHLER WEISS, WO ER HINGEHÖRT. Vorher gab es einen für die ganze
    Seite, angezeigt unter „Sätze speichern" — scheiterte das Speichern der
    Nummernkreise, stand die Meldung zwei Karten weiter oben.
  */
  const [error, setError] = useState<{ wo: string; text: string } | null>(null);

  /**
   * Wer Urlaub genehmigen darf — eine betriebliche Festlegung, keine
   * Eigenschaft der Software. In dem einen Betrieb entscheidet die
   * Buchhaltung, im anderen ein Vorarbeiter, im dritten nur der Chef.
   */
  const [genehmiger, setGenehmiger] = useState<string[]>([]);
  const [nutzer, setNutzer] = useState<AppUser[]>([]);
  const [genehmigerSpeichert, setGenehmigerSpeichert] = useState(false);
  const darfGenehmigerSetzen = user ? isTopLevel(user.role) : false;

  /**
   * Wie nicht verbrauchter Urlaub zum Jahreswechsel behandelt wird.
   *
   * Der Stichtag steht als Monat und Tag getrennt, weil ein `<input
   * type="date">` ein Jahr verlangt — und das Jahr wäre hier eine Lüge: die
   * Regel wiederholt sich jedes Jahr.
   */
  const [rechnungsarten, setRechnungsarten] = useState(false);
  const [wochenplanFuerAlle, setWochenplanFuerAlle] = useState(false);
  const [wochenplanSpeichert, setWochenplanSpeichert] = useState(false);
  const [uebertrag, setUebertrag] = useState<'verjaehrung' | 'stichtag'>('verjaehrung');
  const [stichtagMonat, setStichtagMonat] = useState('03');
  const [stichtagTag, setStichtagTag] = useState('31');
  const [beginnMonat, setBeginnMonat] = useState('01');
  const [beginnTag, setBeginnTag] = useState('01');
  const [uebertragSpeichert, setUebertragSpeichert] = useState(false);
  /*
    DIE VIER VORSÄTZE. Was der Betrieb noch nicht festgelegt hat, kommt aus
    `PRAEFIX_VORGABE` — ausser beim Kennzeichen, das hat mit Absicht keine:
    `WZ` stand fest im Code und ist der Kenner eines bestimmten Bezirks.
  */
  const [vorsaetze, setVorsaetze] = useState(() => praefixeVon(company));
  const [vorsaetzeSpeichert, setVorsaetzeSpeichert] = useState(false);
  /*
    WAS DER ZÄHLER ALS NÄCHSTES VERGIBT — nicht ein festes Beispiel. Bis zum
    Launch-Check (25.09.2026, K6) stand hier PR-2026-0001, während schon
    PR-2026-0003 existierte. `null` heisst: noch nicht geladen oder nicht
    ladbar; dann steht nur das Format da, ausdrücklich als Beispiel.
  */
  const [naechste, setNaechste] = useState<NaechsteNummern | null>(null);

  useEffect(() => {
    if (company?.rates) setRates({ ...INVOICE_DEFAULTS, ...company.rates });
    if (company?.costRates) {
      setCostRates({
        fach: String(company.costRates.fach).replace('.', ','),
        helper: String(company.costRates.helper).replace('.', ','),
      });
    }
    setGenehmiger(company?.vacationApprovers ?? []);
    // Der Betrieb kommt womöglich erst nach dem ersten Zeichnen an; ohne
    // diese Zeile stünden hier die Vorgaben statt der gespeicherten Vorsätze.
    setVorsaetze(praefixeVon(company));
    setRechnungsarten(company?.rechnungsarten ?? false);
    setWochenplanFuerAlle(company?.wochenplanFuerAlle ?? false);
    const beginn = company?.urlaubJahresbeginn ?? '01-01';
    setBeginnMonat(beginn.slice(0, 2));
    setBeginnTag(beginn.slice(3, 5));
    setUebertrag(company?.urlaubUebertrag ?? 'verjaehrung');
    if (company?.urlaubStichtag) {
      const [m, d] = company.urlaubStichtag.split('-');
      setStichtagMonat(m);
      setStichtagTag(d);
    }
  }, [company]);

  useEffect(() => {
    if (!user || !darfGenehmigerSetzen) return;
    listUsers(user.companyId).then(setNutzer).catch(() => setNutzer([]));
  }, [user, darfGenehmigerSetzen]);

  useEffect(() => {
    if (teil !== 'nummern' || !darfGenehmigerSetzen) return;
    let weg = false;
    naechsteNummern(new Date().getFullYear())
      .then((n) => !weg && setNaechste(n))
      .catch(() => !weg && setNaechste(null));
    return () => {
      weg = true;
    };
  }, [teil, darfGenehmigerSetzen]);

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
    } catch (err) {
      setError({ wo: 'genehmiger', text: grundAus(err, 'Die Genehmigenden konnten nicht gespeichert werden.') });
    } finally {
      setGenehmigerSpeichert(false);
    }
  }

  /**
   * WAS HIER NICHT PASSIERT: die Auswahl auf gültige Tage je Monat prüfen.
   *
   * Das tut die Datenbank (`companies_urlaub_stichtag_check`), und zwar für
   * jeden Weg hinein — nicht nur für diese Maske. Die Auswahlfelder bieten
   * deshalb gar nicht erst den 31. Februar an; käme er doch durch, wiese ihn
   * der Server ab, und die Meldung stünde hier. Eine Prüfung im Browser
   * ALLEIN wäre eine Zusage, die niemand einhält.
   */
  /**
   * Die Vorsätze speichern.
   *
   * SIE GELTEN AB JETZT UND NICHT RÜCKWIRKEND. Eine ausgestellte Rechnung
   * behält ihre Nummer — `app.rechnung_eingefroren` lässt sie ohnehin nicht
   * mehr ändern (§ 132 BAO). Das steht auch am Kasten, denn sonst erwartet
   * jemand, dass die alten Belege mitwandern.
   *
   * Geprüft wird hier UND in der Datenbank (`companies_praefix_*`). Der Wert
   * landet im Dateinamen des PDFs und in der CSV für den Steuerberater; eine
   * Prüfung allein im Browser wäre eine Zusage, die niemand einhält.
   */
  async function vorsaetzeSpeichern() {
    if (!user) return;
    const fehler = (['rechnung', 'angebot', 'baustelle', 'kennzeichen'] as const)
      .map((k) => praefixFehler(vorsaetze[k]))
      .find(Boolean);
    if (fehler) {
      setError({ wo: 'nummern', text: fehler });
      return;
    }
    setVorsaetzeSpeichert(true);
    setError(null);
    try {
      await updateCompany(user.companyId, {
        praefixRechnung: vorsaetze.rechnung,
        praefixAngebot: vorsaetze.angebot,
        praefixBaustelle: vorsaetze.baustelle,
        praefixKennzeichen: vorsaetze.kennzeichen,
      });
      await reloadCompany();
      toast.success('Nummernkreise gespeichert');
    } catch (e) {
      setError({ wo: 'nummern', text: grundAus(e, 'Die Nummernkreise konnten nicht gespeichert werden.') });
    } finally {
      setVorsaetzeSpeichert(false);
    }
  }

  async function wochenplanSpeichern() {
    if (!user) return;
    setWochenplanSpeichert(true);
    setError(null);
    try {
      await updateCompany(user.companyId, { wochenplanFuerAlle });
      await reloadCompany();
      toast.success(wochenplanFuerAlle ? 'Wochenplan für alle sichtbar' : 'Wochenplan nur fürs Büro');
    } catch (err) {
      setError({ wo: 'wochenplan', text: grundAus(err, 'Die Einstellung zum Wochenplan konnte nicht gespeichert werden.') });
    } finally {
      setWochenplanSpeichert(false);
    }
  }

  async function uebertragSpeichern() {
    if (!user) return;
    setUebertragSpeichert(true);
    setError(null);
    try {
      await updateCompany(user.companyId, {
        urlaubJahresbeginn: `${beginnMonat}-${beginnTag}`,
        urlaubUebertrag: uebertrag,
        // `null` und nicht weglassen: wer von Stichtag auf Verjährung
        // zurückstellt, muss das alte Datum LOS werden. Ein weggelassenes
        // Feld liesse es stehen, und die Datenbank wiese den Zustand ab.
        urlaubStichtag: uebertrag === 'stichtag' ? `${stichtagMonat}-${stichtagTag}` : null,
      });
      await reloadCompany();
      toast.success('Urlaubsübertrag gespeichert');
    } catch (e) {
      setError({ wo: 'uebertrag', text: grundAus(e, 'Der Urlaubsübertrag konnte nicht gespeichert werden.') });
    } finally {
      setUebertragSpeichert(false);
    }
  }

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (!user) return;
    setSaving(true);
    setError(null);
    try {
      /*
        Die Kostensätze wandern nur mit, wenn BEIDE eingetragen sind. Ohne
        diese Bedingung schriebe jedes Speichern der Verrechnungssätze
        stillschweigend auch Kostensätze fest — und die Nachkalkulation
        rechnete ab da mit einer Zahl, die niemand entschieden hat. Ein halb
        gefülltes Paar ist ebenso wenig eine Entscheidung: ohne Helfersatz
        stünde die Helferstunde mit null Kosten da, also mit voller Marge.
      */
      const kostenGesetzt = costRates.fach.trim() !== '' && costRates.helper.trim() !== '';
      await updateCompany(user.companyId, {
        rates,
        rechnungsarten,
        ...(kostenGesetzt
          ? { costRates: { fach: num(costRates.fach, 0), helper: num(costRates.helper, 0) } }
          : {}),
      });
      await reloadCompany();
      toast.success('Sätze gespeichert');
    } catch (err) {
      setError({ wo: 'saetze', text: grundAus(err, 'Die Einstellungen konnten nicht gespeichert werden.') });
    } finally {
      setSaving(false);
    }
  }

  if (!user) return null;

  const nightFach = rates.fach * (1 + rates.nightSurcharge);
  const emergencyFach = rates.fach * (1 + rates.emergencySurcharge);
  const bothFach = rates.fach * (1 + rates.nightSurcharge + rates.emergencySurcharge);
  const fehlerBei = (wo: string) =>
    error?.wo === wo ? <div className="mt-3"><ErrorState message={error.text} /></div> : null;

  return (
    <div className="space-y-6">
      <PageHeader title={KOPF[teil].titel} subtitle={KOPF[teil].unter} />

      {teil === 'saetze' && (
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
                  <td className="py-1 text-right">{fmtEUR(rates.fach)} €/h</td>
                </tr>
                <tr className="border-b border-line/60">
                  <td className="py-1">Nachtarbeit</td>
                  <td className="py-1 text-right">{fmtEUR(nightFach)} €/h</td>
                </tr>
                <tr className="border-b border-line/60">
                  <td className="py-1">Notdienst</td>
                  <td className="py-1 text-right">{fmtEUR(emergencyFach)} €/h</td>
                </tr>
                <tr>
                  <td className="py-1">Notdienst in der Nacht</td>
                  <td className="py-1 text-right">{fmtEUR(bothFach)} €/h</td>
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
            {/*
              MAHNSPESEN JE STUFE — ohne Vorgabe.

              Was ein Betrieb verrechnen darf, hängt am Aufwand und am
              Vertrag; eine voreingestellte Zahl sähe aus wie eine Auskunft
              darüber. Leer heisst null, und dann steht auf der Mahnung keine
              Spesenzeile.

              Die Zahlungserinnerung steht bewusst mit dabei: manche Betriebe
              verrechnen auch dort etwas, und ihnen das Feld vorzuenthalten
              wäre eine Entscheidung, die uns nicht zusteht.
            */}
            {(['Zahlungserinnerung', 'Mahnung', 'Letzte Mahnung'] as const).map((wort, i) => (
              <InputField
                key={wort}
                id={`r-mahn-${i}`}
                label={`Mahnspesen ${wort} (€)`}
                type="number"
                min="0"
                step="0.01"
                placeholder="leer = keine"
                value={rates.mahnspesen?.[i] ? String(rates.mahnspesen[i]) : ''}
                onChange={(e) => {
                  const werte = [...(rates.mahnspesen ?? [0, 0, 0])];
                  werte[i] = Math.max(0, Number(e.target.value.replace(',', '.')) || 0);
                  setRates({ ...rates, mahnspesen: werte });
                }}
              />
            ))}
          </FormGrid>

          {/*
            ANZAHLUNGEN SIND NICHT FÜR JEDEN BETRIEB EIN THEMA.

            Die Auswahl „Art der Rechnung" steht sonst in der Maske, in der
            JEDE Rechnung entsteht — auch die vierhundert im Jahr, die schlicht
            Rechnungen sind. Wer nie eine Anzahlung stellt, bekäme ein Feld,
            das er jedes Mal überliest. Deshalb steht der Haken hier und ist
            ab Werk aus.
          */}
          <div className="mt-4 rounded-sm border border-line bg-surface-2 p-4">
            <CheckboxField
              id="rechnungsarten"
              label="Wir stellen Anzahlungs-, Teil- und Schlussrechnungen"
              checked={rechnungsarten}
              onChange={(e) => setRechnungsarten(e.target.checked)}
            />
            <p className="mt-2 flex flex-wrap items-center gap-1 text-sm text-ink-muted">
              Die Schlussrechnung zieht die Anzahlungen samt Umsatzsteuer wieder ab.
              <InfoHint about="Anzahlungs- und Schlussrechnungen">
                Beim Anlegen einer Rechnung steht dann die Art zur Wahl. Ohne den Abzug in der
                Schlussrechnung wäre dieselbe Steuer zweimal ausgewiesen und zweimal geschuldet
                (§ 11 Abs 12 UStG).
                <br />
                <br />
                <strong>Bereits ausgestellte Belege bleiben, wie sie sind:</strong> sie behalten
                ihre Art und ihre Abzüge und drucken unverändert, auch wenn der Haken später
                wieder weggeht.
              </InfoHint>
            </p>
          </div>
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
              placeholder="noch nicht hinterlegt"
              value={costRates.fach}
              onChange={(e) => setCostRates({ ...costRates, fach: e.target.value })}
            />
            <InputField
              id="costhelper"
              label="Kosten Helferstunde (€)"
              placeholder="noch nicht hinterlegt"
              value={costRates.helper}
              onChange={(e) => setCostRates({ ...costRates, helper: e.target.value })}
            />
          </FormGrid>
          {costRates.fach.trim() === '' || costRates.helper.trim() === '' ? (
            /*
              Kein Deckungsbeitrag ohne Kostensatz. Vorher stand hier eine
              Zahl, die aus der Hausnummer 42 gerechnet war — und sie sah
              genauso aus wie eine echte.
            */
            <p className="mt-3 text-sm text-ink-muted">
              Noch nicht hinterlegt. Solange beide Felder leer sind, rechnet die Nachkalkulation
              nicht und sagt das auch — eine erfundene Zahl wäre schlimmer als keine.
            </p>
          ) : (
            <p className="mt-3 text-sm text-ink">
              Deckungsbeitrag je Facharbeiterstunde:{' '}
              {/* Mit Zeichen: „21,50" allein war die einzige Geldangabe der
                  App ohne € (Prüflauf 25.09.2026, P4-11). Dahinter, wie die
                  Sätze auf dieser Seite („60,00 €/h") — dieses `fmtEUR`
                  stellt nicht voran, siehe tests/unit/eurozeichen.test.ts. */}
              <strong>{fmtEUR(rates.fach - num(costRates.fach, 0))} €</strong>
              {rates.fach - num(costRates.fach, 0) <= 0 && (
                <span className="ml-2 text-danger">
                  — der Verrechnungssatz liegt nicht über den Kosten.
                </span>
              )}
            </p>
          )}
        </Card>

        {fehlerBei('saetze')}

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
      )}

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
        Der Urlaubsübertrag — dieselbe Grenze wie bei den Genehmigenden.
        `companies_aendern` verlangt ohnehin die Spitze; die Bedingung hier
        nimmt nur den Weg weg, statt einen Knopf anzubieten, der abgewiesen
        wird.
      */}
      {teil === 'personal' && darfGenehmigerSetzen && (
        <Card
          title="Urlaubsjahr und Übertrag"
          hint={
            <>
              Was am Ende des Urlaubsjahrs offen ist, verschwindet nicht. Womit der Betrieb
              rechnet, steht hier — und danach richtet sich jeder Resturlaub, den die App anzeigt.
              <br />
              <br />
              <strong>Nicht abgebildet:</strong> ein Urlaubsjahr, das für jeden Mitarbeiter am
              Jahrestag seines Eintritts beginnt. Wer so rechnet, kann den Urlaubsteil dieser App
              nicht verwenden.
              <br />
              <br />
              <strong>Was die App nicht entscheidet:</strong> ob ein vereinbarter Verfallstag im
              Einzelfall trägt, ist eine arbeitsrechtliche Frage — die gesetzliche Verjährung steht
              dem Mitarbeiter unabhängig davon zu. Die Einstellung legt fest, womit die App rechnet,
              nicht was jemandem zusteht.
            </>
          }
        >
          {/*
            DER BEGINN STEHT VOR DEM VERFALL, und das ist keine Anordnung nach
            Wichtigkeit: der Verfallstag liegt IM Urlaubsjahr. Wo dieses Jahr
            anfängt, entscheidet, in welchem Kalenderjahr der Verfallstag zu
            suchen ist. Wer das Zweite einstellt, ohne das Erste gesehen zu
            haben, stellt es im Blindflug ein.

            BIS ZUM 20.09.2026 GAB ES DIESE ZEILE NICHT. Der Anspruch entstand
            fest am 1. Jänner — für jeden Betrieb mit einem anderen
            Urlaubsjahr rechnete die App still falsch.
          */}
          <div className="mb-4 flex flex-wrap items-end gap-3 rounded border border-line bg-surface-2 p-4">
            <SelectField
              id="urlaubsjahr-tag"
              label="Urlaubsjahr beginnt am"
              value={beginnTag}
              onChange={(e) => setBeginnTag(e.target.value)}
            >
              {Array.from(
                { length: MONATE.find((m) => m[0] === beginnMonat)?.[2] ?? 31 },
                (_, i) => String(i + 1).padStart(2, '0'),
              ).map((d) => (
                <option key={d} value={d}>{Number(d)}.</option>
              ))}
            </SelectField>
            <SelectField
              id="urlaubsjahr-monat"
              label="Monat"
              value={beginnMonat}
              onChange={(e) => {
                const m = e.target.value;
                setBeginnMonat(m);
                const tage = MONATE.find((x) => x[0] === m)?.[2] ?? 31;
                if (Number(beginnTag) > tage) setBeginnTag(String(tage));
              }}
            >
              {MONATE.map(([wert, name]) => (
                <option key={wert} value={wert}>{name}</option>
              ))}
            </SelectField>
            <p className="w-full text-sm text-ink-muted">
              An diesem Tag entsteht der neue Jahresanspruch — beim Kalenderjahr am 1. Jänner.
            </p>
          </div>

          <fieldset className="flex flex-col gap-3">
            <legend className="sr-only">Wie Resturlaub übertragen wird</legend>

            {/*
              KEIN `min-h-touch` AM PUNKT. Ein 48 px hoher Auswahlpunkt sitzt
              in seiner Mitte — also auf der zweiten Textzeile statt neben der
              Überschrift; genau so sah es im Browser aus. Der Fingerbereich
              ist ohnehin das ganze `label`, und das ist hier zweizeilig und
              damit von selbst gross genug.
            */}
            <label className="flex min-h-touch items-start gap-3 py-1">
              <input
                type="radio"
                name="uebertrag"
                id="uebertrag-verjaehrung"
                className="mt-1 h-5 w-5 shrink-0 accent-[color:var(--accent-deep)]"
                checked={uebertrag === 'verjaehrung'}
                onChange={() => setUebertrag('verjaehrung')}
              />
              <span className="text-sm">
                <strong className="text-ink">Gesetzliche Verjährung</strong>
                <span className="mt-1 block text-ink-muted">
                  Der Rest wird übertragen und verjährt zwei Jahre nach dem Jahr, in dem er
                  entstanden ist (§ 4 Abs 5 UrlG). Was 2026 offen bleibt, ist bis Ende 2028
                  da.
                </span>
              </span>
            </label>

            <label className="flex min-h-touch items-start gap-3 py-1">
              <input
                type="radio"
                name="uebertrag"
                id="uebertrag-stichtag"
                className="mt-1 h-5 w-5 shrink-0 accent-[color:var(--accent-deep)]"
                checked={uebertrag === 'stichtag'}
                onChange={() => setUebertrag('stichtag')}
              />
              <span className="text-sm">
                <strong className="text-ink">Vereinbarter Verfallstag</strong>
                <span className="mt-1 block text-ink-muted">
                  Der Rest wird übertragen und verfällt an einem festen Tag im Folgejahr.
                </span>
              </span>
            </label>
          </fieldset>

          {uebertrag === 'stichtag' && (
            <div className="mt-4 flex flex-wrap items-end gap-3 rounded border border-line bg-surface-2 p-4">
              <SelectField
                id="stichtag-tag"
                label="Verfällt am"
                value={stichtagTag}
                onChange={(e) => setStichtagTag(e.target.value)}
              >
                {Array.from(
                  { length: MONATE.find((m) => m[0] === stichtagMonat)?.[2] ?? 31 },
                  (_, i) => String(i + 1).padStart(2, '0'),
                ).map((d) => (
                  <option key={d} value={d}>{Number(d)}.</option>
                ))}
              </SelectField>
              <SelectField
                id="stichtag-monat"
                label="Monat"
                value={stichtagMonat}
                onChange={(e) => {
                  const m = e.target.value;
                  setStichtagMonat(m);
                  // Vom 31. Jänner auf Februar zu wechseln darf keinen 31.
                  // Februar stehen lassen — die Datenbank wiese ihn ab, und
                  // der Grund stünde erst beim Speichern da.
                  const tage = MONATE.find((x) => x[0] === m)?.[2] ?? 31;
                  if (Number(stichtagTag) > tage) setStichtagTag(String(tage));
                }}
              >
                {MONATE.map(([wert, name]) => (
                  <option key={wert} value={wert}>{name}</option>
                ))}
              </SelectField>
            </div>
          )}

          <div className="mt-4">
            <Button type="button" loading={uebertragSpeichert} onClick={uebertragSpeichern}>
              Urlaubsübertrag speichern
            </Button>
          </div>
          {fehlerBei('uebertrag')}
        </Card>
      )}

      {/*
        DIE NUMMERNKREISE UND DER FUHRPARK.

        Vier Zeichenfolgen, die bis zum 18.09. fest im Quelltext standen. Die
        letzte, `WZ`, ist der Kenner eines bestimmten Bezirks und stand auf
        jedem Zeiteintrag — ein zweiter Betrieb wäre ihn nicht losgeworden.

        Der Kasten steht der Spitze offen, wie die Sätze: `companies_aendern`
        lässt ohnehin nur sie an diese Tabelle, und ein Feld anzuzeigen, dessen
        Speichern der Server abweist, wäre ein Versprechen ohne Deckung.
      */}
      {teil === 'nummern' && darfGenehmigerSetzen && (
        <Card
          title="Nummernkreise und Fuhrpark"
          hint={
            <>
              Die Vorsätze gelten ab jetzt. Bereits ausgestellte Belege behalten ihre Nummer — eine
              Rechnung lässt sich nach § 132 BAO nicht mehr ändern.
              <br />
              <br />
              Erlaubt sind Großbuchstaben, Ziffern und Bindestrich, weil der Vorsatz im Dateinamen
              des Rechnungs-PDFs und in der Buchhaltungs-CSV steht.
            </>
          }
        >
          <FormGrid>
            {([
              ['rechnung', 'Rechnungen', 'RE', 1001],
              ['angebot', 'Angebote', 'AN', 1],
              ['baustelle', 'Baustellen', 'B', 1],
            ] as const).map(([schluessel, beschriftung, beispiel, ab]) => (
              <div key={schluessel} className="flex flex-col gap-1">
                <InputField
                  id={`vorsatz-${schluessel}`}
                  label={beschriftung}
                  value={vorsaetze[schluessel]}
                  maxLength={PRAEFIX_MAX}
                  placeholder={beispiel}
                  onChange={(e) =>
                    setVorsaetze({ ...vorsaetze, [schluessel]: praefixPutzen(e.target.value) })}
                />
                {/*
                  DIE VORSCHAU IST DIE EIGENTLICHE ANTWORT. „RE" sagt niemandem
                  etwas; „RE-2026-1001" beantwortet die Frage, die jemand hat,
                  wenn er hier steht — wie sieht die nächste Nummer aus?
                */}
                <p className="text-sm text-ink-muted">
                  {naechste
                    ? `Nächste: ${belegNummer(vorsaetze[schluessel], new Date().getFullYear(), naechste[schluessel])}`
                    : `z. B. ${belegNummer(vorsaetze[schluessel], new Date().getFullYear(), ab)}`}
                </p>
              </div>
            ))}

            <div className="flex flex-col gap-1">
              <InputField
                id="vorsatz-kennzeichen"
                label="Kennzeichen des Fuhrparks"
                value={vorsaetze.kennzeichen}
                maxLength={PRAEFIX_MAX}
                placeholder="z. B. WZ"
                onChange={(e) =>
                  setVorsaetze({ ...vorsaetze, kennzeichen: praefixPutzen(e.target.value) })}
              />
              <p className="text-sm text-ink-muted">
                {vorsaetze.kennzeichen
                  ? `${vorsaetze.kennzeichen}-12345A`
                  : 'Ohne Vorsatz — im Zeiteintrag steht das ganze Kennzeichen'}
              </p>
            </div>
          </FormGrid>

          <p className="mt-4 text-sm text-ink-muted">
            Großbuchstaben, Ziffern, Bindestrich, höchstens {PRAEFIX_MAX} Zeichen. Leer heißt
            „kein Vorsatz" — dann zählt der Kreis als
            <span> {belegNummer('', new Date().getFullYear(), 1001)}</span>.
          </p>

          <div className="mt-4">
            <Button type="button" loading={vorsaetzeSpeichert} onClick={vorsaetzeSpeichern}>
              Nummernkreise speichern
            </Button>
          </div>
          {fehlerBei('nummern')}
        </Card>
      )}

      {/*
        Wer Urlaub genehmigt — der Geschaeftsfuehrung vorbehalten.
        Duerfte die Projektleitung sie aendern, koennte sie sich selbst
        eintragen und ueber die Urlaube derer entscheiden, die sie einteilt.
        Dieselbe Grenze steht im Trigger `companies_einstellungen`.
      */}
      {teil === 'personal' && darfGenehmigerSetzen && (
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
          {fehlerBei('genehmiger')}
        </Card>
      )}

      {/*
        HIER STAND EIN KNOPF, UND DASS ER WEG IST, IST DIE AUSKUNFT.

        Die Monatsbilanzen mussten früher vorgerechnet und abgelegt werden —
        eine Sammlung, ein Aufbaulauf, ein Trigger zum Nachziehen, ein
        Nachtlauf zum Ausgleichen und ein Marker für die Vollständigkeit. Eine
        Bilanz war dadurch immer nur IRGENDWANN richtig, und eine fehlende war
        von einem Monat ohne Buchungen nicht zu unterscheiden.

        `monthly_stats` ist eine SICHT. Sie rechnet bei jeder Abfrage neu und
        kann nicht unvollständig sein. Der Knopf wurde deshalb nicht
        stillgelegt, sondern entfernt — und an seiner Stelle steht, warum. Wer
        ihn sucht, soll die Antwort dort finden, wo er ihn vermutet.
      */}
      {/*
        DER WOCHENPLAN FÜR ALLE — ein Schalter, ab Werk aus. Ob Kollegen
        sehen sollen, wer wo ist, entscheidet der Betrieb. Wer abwesend ist,
        steht dort ohne Grund: die Urlaube der anderen bleiben dem Monteur
        verschlossen, die Datenbank gibt nur Wer/Von/Bis heraus.
      */}
      {teil === 'personal' && (
      <Card
        title="Wochenplan für alle"
        hint={
          <>
            Eingeschaltet finden alle Mitarbeiter unter „Mein Einsatzplan" eine zweite Seite
            „Team-Woche": wer an welchem Tag auf welcher Baustelle ist. Zu ändern gibt es dort
            nichts. Wer Urlaub hat, steht als „abwesend" da — ohne Grund und ohne Antragsstand.
          </>
        }
      >
        <CheckboxField
          id="wochenplanFuerAlle"
          label="Alle Mitarbeiter sehen den Wochenplan (nur lesen)"
          checked={wochenplanFuerAlle}
          onChange={(e) => setWochenplanFuerAlle(e.target.checked)}
        />
        <div className="mt-4">
          <Button type="button" loading={wochenplanSpeichert} onClick={wochenplanSpeichern}>
            Speichern
          </Button>
        </div>
        {fehlerBei('wochenplan')}
      </Card>
      )}

      {teil === 'personal' && (
      <Card title="Monatsbilanzen">
        <p className="text-sm text-ink">
          Die Monatsbilanzen sind eine Sicht auf die Zeitbuchungen: sie rechnen bei jeder
          Abfrage neu. Es gibt nichts aufzubauen und nichts nachzuziehen — und damit auch
          keinen Stand, der stillstehen und auf einem Lohnzettel landen könnte.
        </p>
      </Card>
      )}
    </div>
  );
}
