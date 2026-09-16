import { useEffect, useMemo, useState } from 'react';
import { useAuth } from '@/app/AuthContext';
import {
  subscribeRecentInvoices,
  listInvoicesInRange,
  listUnpaidInvoices,
  nextInvoiceNumber,
  isInvoiceNumberTaken,
  reserveInvoiceNumber,
  highestInvoiceSeq,
  invoiceSeqOf,
  createInvoice,
  updateInvoiceStatus,
  cancelInvoice,
  reactivateInvoice,
  markBilled,
  mahnungFesthalten,
} from '@/lib/db/invoices';
import { listActiveProjects } from '@/lib/db/projects';
import { listCustomers } from '@/lib/db/customers';
import { buildInvoiceCsv, invoiceCsvFilename } from './buchhaltungExport';
import { downloadCsv } from '@/features/accounting/export';
import { listEntriesForProjects } from '@/lib/db/timeEntries';
import { listWorkSheetsForProject, listRecentWorkSheets } from '@/lib/db/workSheets';
import { listMaterials } from '@/lib/db/materials';
import { katalogAbgeschnitten } from '@/lib/listengrenzen';
import { verrechneteScheine } from './materialPositionen';
import { darfMahnen, naechsteStufe, spesenFuer, TEXTE, FRIST_TAGE } from './mahnung';
import { postenNeuLaden } from '@/app/offenePosten';
import { mahnlauf } from './mahnlauf';
import {
  unverrechneteScheine,
  auffaellige,
  AUFFAELLIG_AB_TAGEN,
} from '@/features/worksheets/unverrechnet';
import { geltenderSatz, pruefeReverseCharge, sichtAusWieUid } from './reverseCharge';
import { pruefeEmpfaengerUid } from './empfaengerUid';
import { assembleInvoice, recalc, INVOICE_DEFAULTS, type AssembledInvoice } from './assemble';
import { scheinAbgleich } from './scheinAbgleich';
import { discountLabel, type InvoicePosition } from './totals';
import { todayStr, localDateStr, fmtMin, tageWort } from '@/lib/time';
import type { WithId } from '@/lib/db/core';
import type { Invoice, Project, WorkSheet } from '@/types';
import Card from '@/components/Card';
import Button from '@/components/Button';
import Metric, { MetricRow } from '@/components/Metric';
import IconButton from '@/components/IconButton';
import StatusBadge from '@/components/StatusBadge';
import { Warnung } from '@/components/Badge';
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
  /*
    Die unterschriebenen Scheine des Betriebs — für die Frage, welche Leistung
    noch auf keiner Rechnung steht. Einmal geladen, nicht abonniert: die
    Antwort ändert sich im Takt von Tagen, nicht von Sekunden, und ein
    zweiter laufender Zuhörer kostete auf einer Baustelle Verbindung für
    nichts.
  */
  const [scheineAllerBaustellen, setScheineAllerBaustellen] = useState<WithId<WorkSheet>[]>([]);
  /*
    DIE OFFENEN FORDERUNGEN, EIGENS GEHOLT — nicht aus der Liste darüber.

    Der Mahnlauf und die unverrechnete Leistung liefen bisher über die
    Arbeitsliste, und die schneidet nach Anlagedatum ab. Damit sahen sie
    ausgerechnet die Forderungen NICHT, die am längsten offen sind: die
    ältesten fallen als erste heraus. Eine Mahnliste, die die älteste
    Forderung übersieht, ist schlimmer als keine.
  */
  const [offeneRechnungen, setOffeneRechnungen] = useState<WithId<Invoice>[]>([]);
  /** Kamen die offenen Forderungen nicht? Dann darf keine Karte so tun, als wüsste sie Bescheid. */
  const [forderungenFehler, setForderungenFehler] = useState(false);
  /*
    War der Materialstamm beim Zusammenstellen abgeschnitten? Ein Artikel
    darüber hinaus findet seinen Preis nicht — er steht dann unten als „ohne
    Preis im Katalog", und das wäre in diesem Fall die falsche Auskunft.
  */
  const [katalogUnvollstaendig, setKatalogUnvollstaendig] = useState(false);
  /*
    Der Export holt seinen Zeitraum SELBST. Vorher filterte er die geladene
    Liste nach Datum — ein Export für einen älteren Monat lieferte damit eine
    leere Datei, die wie ein Erfolg aussah.
  */
  const [exportZeilen, setExportZeilen] = useState<WithId<Invoice>[] | null>(null);
  const [exportLaeuft, setExportLaeuft] = useState(false);
  const [exportFehler, setExportFehler] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [toCancel, setToCancel] = useState<WithId<Invoice> | null>(null);
  const [cancelNote, setCancelNote] = useState('');
  const [statusFilter, setStatusFilter] = useState<'alle' | Invoice['paymentStatus']>('alle');
  const [rechnungSuche, setRechnungSuche] = useState('');
  /** Anfangs sichtbare Rechnungen; der Rest kommt auf Wunsch. */

  // Entwurf
  const [projectNumber, setProjectNumber] = useState('');
  const [preview, setPreview] = useState<AssembledInvoice | null>(null);
  /**
   * Der Leistungszeitraum, wie er auf die Rechnung kommt.
   *
   * Vorbelegt aus den Belegen, aber ÄNDERBAR — eine Teilrechnung oder eine
   * später gebuchte Nacharbeit soll den Zeitraum nicht verschieben, den der
   * Betrieb dem Kunden gegenüber nennen will.
   */
  const [leistungVon, setLeistungVon] = useState('');
  const [leistungBis, setLeistungBis] = useState('');
  /**
   * Bauleistung mit Übergang der Steuerschuld (§ 19 Abs 1a UStG).
   *
   * BEWUSST JE RECHNUNG und nicht am Kunden hinterlegt: ob der Übergang gilt,
   * hängt an der LEISTUNG, nicht am Empfänger. Derselbe Baumeister kann ein
   * Werkzeug kaufen (20 %) und eine Installation beauftragen (Reverse Charge).
   * Ein Haken am Kundenstamm hätte die Entscheidung stillschweigend
   * vorweggenommen.
   */
  /** Welche Rechnung gerade gemahnt wird — samt vorgeschlagener Frist. */
  const [mahnFuer, setMahnFuer] = useState<WithId<Invoice> | null>(null);
  const [mahnFrist, setMahnFrist] = useState('');
  const [reverseCharge, setReverseCharge] = useState(false);
  const [kundenUid, setKundenUid] = useState('');
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

  /*
    NUR FÜRS BÜRO. Der Monteur kommt hier gar nicht her; die Abfrage lädt die
    letzten Scheine des ganzen Betriebs und hat auf einem Gerät im Keller
    nichts verloren.
  */
  useEffect(() => {
    if (!user) return;
    let weg = false;
    /*
      SECHZIG, NICHT ZWEIHUNDERT — und die Zahl hat einen gemessenen Grund.

      Ein unterschriebener Schein trägt zwei Unterschriftsbilder als PNG im
      Dokument. Gemessen an einem Telefon mit dreifacher Punktdichte sind das
      rund 35 KB je Bild, also 70 KB je Schein: zweihundert Scheine wären
      vierzehn Megabyte, jedes Mal, wenn jemand die Rechnungen öffnet. Auf
      einer Baustelle mit halbem Balken sind das Minuten.

      Sechzig unterschriebene Scheine decken bei einem Fünf-Mann-Betrieb rund
      zwei Monate ab. Gemeldet wird ohnehin erst ab vier Wochen — was älter
      ist als dieses Fenster, ist längst gemeldet worden.
    */
    /*
      DIESE ABFRAGE DARF NICHT STILL SCHEITERN, und bis hierher tat sie es.

      Sie trägt ZWEI Karten, und beide sagen bei einem Fehlschlag etwas
      Falsches statt gar nichts:

        Mahnlauf                 rechnet über eine leere Liste, die Karte
                                 verschwindet — und das sieht aus wie
                                 „nichts zu mahnen". Es ist aber „ich weiss
                                 es nicht", und der Unterschied sind offene
                                 Forderungen, die niemand anmahnt.

        Nicht verrechnete        sucht Scheine, die auf KEINER Rechnung
        Leistung                 stehen. Fehlen die offenen Forderungen,
                                 erscheinen Scheine als unverrechnet, die
                                 längst auf einer offenen Rechnung stehen —
                                 eine falsche Anschuldigung, der jemand
                                 nachgeht.

      Der Kommentar weiter unten rechtfertigt das Schweigen mit
      „Zusatzangabe". Für die SCHEINE stimmt das; für die Forderungen nicht.
    */
    listUnpaidInvoices(user.companyId)
      .then((rows) => {
        if (!weg) {
          setOffeneRechnungen(rows);
          setForderungenFehler(false);
        }
      })
      .catch(() => {
        if (!weg) setForderungenFehler(true);
      });
    listRecentWorkSheets(user.companyId, 60)
      .then((rows) => {
        if (!weg) setScheineAllerBaustellen(rows);
      })
      /*
        Still: die Liste ist eine ZUSATZangabe. Fiele die ganze
        Rechnungsansicht aus, weil sie nicht kommt, wäre das Verhältnis
        zwischen Nutzen und Schaden verkehrt herum.
      */
      .catch(() => undefined);
    return () => {
      weg = true;
    };
  }, [user]);

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
  /**
   * Der Steuersatz, der tatsächlich gilt.
   *
   * EINE Stelle, an der aus „Reverse Charge" die Null wird. Stünde die
   * Entscheidung an drei Stellen — Vorschau, gespeicherte Rechnung, PDF —,
   * liefen sie irgendwann auseinander, und der Kunde bekäme einen Beleg mit
   * Steuer über einen Betrag ohne.
   */
  const satz = geltenderSatz(reverseCharge, rates.vatRate);

  /**
   * Ist die Rechnung als Reverse Charge vollständig?
   *
   * Sie SPERRT den Knopf. Anders als bei den Markenfarben ist hier nichts
   * abzuwägen: eine Rechnung ohne die UID des Empfängers belegt den Übergang
   * der Steuerschuld nicht, und der Empfänger kann sie nicht verwenden. Eine
   * Warnung, die man wegklicken kann, führte zu genau der Rechnung, die
   * später berichtigt werden muss.
   */
  const rcPruefung = pruefeReverseCharge(reverseCharge, kundenUid, company?.vatId);
  /*
    Die BETRAGSABHÄNGIGE Pflicht — eine andere Bestimmung als der Übergang der
    Steuerschuld, mit einer anderen Folge: sie kostet den KUNDEN den
    Vorsteuerabzug, nicht den Betrieb seine Steuer.
  */
  const uidPruefung = pruefeEmpfaengerUid({
    bruttoBetrag: preview?.totalBrutto ?? 0,
    reverseCharge,
    uid: kundenUid,
  });

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
    setPreview((p) => (p ? recalc(p, p.positions, satz, rabatt) : p));
  }, [rabatt, satz]);

  /** Eine Position aendern; die Summen ziehen sofort nach. */
  function setPos(i: number, patch: Partial<InvoicePosition>) {
    setPreview((p) => {
      if (!p) return p;
      const next = p.positions.map((x, k) => (k === i ? { ...x, ...patch } : x));
      return recalc(p, next, satz, rabatt);
    });
  }

  function entfernePos(i: number) {
    setPreview((p) =>
      p ? recalc(p, p.positions.filter((_, k) => k !== i), satz, rabatt) : p,
    );
  }

  /** Eigene Zeile anlegen — leer oder als vorbereitete Pauschale. */
  function neuePos(label = '', qty = 1, unit = 'Stk') {
    setPreview((p) =>
      p
        ? recalc(
            p,
            [...p.positions, { label, qty, unit, unitPrice: 0, netto: 0 }],
            satz,
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
      /*
        Scheine und Katalog laufen NEBEN den Zeiteintraegen, nicht davor.

        Sie liefern das Material. Schlaegt eines davon fehl, soll die Rechnung
        trotzdem entstehen — mit den Stunden allein und einem Hinweis, statt
        gar nicht. Ein Betrieb, der abrechnen will, wartet sonst auf eine
        Abfrage, die mit seinen Stunden nichts zu tun hat.
      */
      const [entries, scheine, katalog] = await Promise.all([
        listEntriesForProjects(user.companyId, [projectNumber]),
        listWorkSheetsForProject(user.companyId, projectNumber).catch(() => {
          setNebenFehler('Die Handwerksscheine');
          return [];
        }),
        listMaterials(user.companyId).catch(() => {
          setNebenFehler('Der Materialkatalog');
          return [];
        }),
      ]);
      setKatalogUnvollstaendig(katalogAbgeschnitten(katalog));
      const assembled = assembleInvoice(projectNumber, entries, rates, {
        scheine,
        katalog,
        // Was auf einer bestehenden Rechnung steht, kommt nicht noch einmal.
        // Ein STORNIERTER Beleg zaehlt dabei nicht — sein Material ist wieder
        // offen.
        bereitsVerrechnet: verrechneteScheine(invoices),
      });
      if (assembled.positions.length === 0) {
        setPreview(null);
        setError('Keine offenen Stunden und kein offenes Material für diese Baustelle.');
        return;
      }
      setPreview(assembled);
      setLeistungVon(assembled.leistung?.von ?? '');
      setLeistungBis(assembled.leistung?.bis ?? '');
      /*
        Die UID aus den Kundenstammdaten vorbelegen — über den Namen, wie es
        der Buchhaltungs-Export auch tut. Bei verknüpften Baustellen ist er
        aus den Stammdaten kopiert und damit verlässlich gleich geschrieben.
        Findet sich nichts, bleibt das Feld leer und will ausgefüllt werden.
      */
      const kunde = projects.find((x) => x.projectNumber === projectNumber)?.customerName ?? '';
      const treffer = kunden.find(
        (k) => k.name.trim().toLowerCase() === kunde.trim().toLowerCase(),
      );
      setKundenUid(treffer?.vatId?.trim() ?? '');
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
        vatRate: satz,
        reverseCharge,
        // Leerstring statt undefined: Firestore lehnt undefined ab.
        /*
          IMMER MITGESCHRIEBEN, nicht nur bei Reverse Charge. Vorher wurde die
          UID aus dem Kundenstamm geladen, im Formular angezeigt — und beim
          Speichern weggeworfen, sobald der Haken aus war. Über 10.000 € brutto
          ist sie Pflichtangabe (§ 11 Abs 1 Z 2 UStG); darunter schadet sie
          nicht und hilft dem Empfänger beim Zuordnen.
        */
        customerVatId: kundenUid.trim(),
        subtotalNetto: preview.subtotalNetto,
        // null statt undefined: Firestore laesst undefined nicht zu, und
        // "kein Rabatt" soll als bewusster Wert im Dokument stehen.
        discount: rabatt,
        discountAmount: preview.discountAmount,
        totalNetto: preview.totalNetto,
        totalVat: preview.totalVat,
        totalBrutto: preview.totalBrutto,
        paymentStatus: 'Offen',
        // Leerstring statt undefined: Firestore lehnt undefined ab, und ein
        // leeres Feld sagt ehrlich „nicht angegeben".
        leistungVon,
        leistungBis,
        linkedEntries: preview.linkedEntries,
        linkedOrders: preview.linkedOrders,
        // Die Scheine, deren Material eingeflossen ist. Sie sind damit
        // verbraucht — bis diese Rechnung storniert wird.
        linkedWorkSheets: preview.linkedWorkSheets,
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
        // Der GEÄNDERTE Zeitraum, nicht der abgeleitete: auf dem Beleg steht,
        // was im Feld steht.
        assembled: {
          ...preview,
          leistung: leistungVon && leistungBis ? { von: leistungVon, bis: leistungBis } : null,
        },
        appendDetail,
        vatRate: satz,
        reverseCharge,
        /*
          IMMER MITGESCHRIEBEN, nicht nur bei Reverse Charge. Vorher wurde die
          UID aus dem Kundenstamm geladen, im Formular angezeigt — und beim
          Speichern weggeworfen, sobald der Haken aus war. Über 10.000 € brutto
          ist sie Pflichtangabe (§ 11 Abs 1 Z 2 UStG); darunter schadet sie
          nicht und hilft dem Empfänger beim Zuordnen.
        */
        customerVatId: kundenUid.trim(),
      });

      setPreview(null);
      setProjectNumber('');
      setDiscount({ mode: 'percent', value: '', label: '' });
      setReverseCharge(false);
      setKundenUid('');
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

  /**
   * Eine Mahnung erzeugen und festhalten.
   *
   * IN DIESER REIHENFOLGE: erst der Beleg, dann der Vermerk. Scheitert das
   * PDF, ist schlimmstenfalls nichts geschehen — umgekehrt stünde die
   * Rechnung als gemahnt da, ohne dass je ein Schreiben entstanden wäre, und
   * die nächste Stufe begänne bei zwei.
   */
  async function mahnen(inv: WithId<Invoice>, frist: string) {
    if (!company) return;
    const stufe = naechsteStufe(inv);
    if (!stufe) return;
    setBusy(true);
    setError(null);
    try {
      const heute = todayStr();
      const spesen = spesenFuer(stufe, company.rates?.mahnspesen);
      const { buildMahnungPdf, mahnungDateiname } = await import('./mahnungPdf');
      const blob = await buildMahnungPdf({
        company,
        invoice: inv,
        stufe,
        datum: heute,
        frist,
        adresse: inv.address,
        kundenUid: inv.customerVatId,
      });
      /*
        DERSELBE WEG WIE BEIM HANDWERKSSCHEIN, nicht ein zweiter.

        `shareOrDownloadPdf` bietet auf dem Tablet zuerst das TEILEN an — und
        genau so geht eine Mahnung im Betrieb hinaus: als Anhang einer Mail
        vom Gerät, an dem man gerade sitzt. Ein selbst geschriebener Download
        hätte das nicht gekonnt, und zwei Wege zum selben Ziel laufen
        auseinander.
      */
      const { shareOrDownloadPdf } = await import('@/features/worksheets/worksheetPdf');
      await shareOrDownloadPdf(blob, mahnungDateiname(inv, stufe));

      await mahnungFesthalten(inv.id, { stufe, gemahntAm: heute, frist, spesen });
      // Das Abzeichen im Menü zählt mit: diese Rechnung ist bis zum Ablauf
      // der neuen Frist keine fällige Mahnung mehr.
      void postenNeuLaden();
      toast.success(`${TEXTE[stufe].titel} erzeugt`);
      setMahnFuer(null);
    } catch {
      setError('Die Mahnung konnte nicht erzeugt werden.');
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
        linkedWorkSheets: inv.linkedWorkSheets ?? [],
        // Aus dem DOKUMENT, nicht neu abgeleitet: der Zeitraum steht so beim
        // Kunden, auch wenn seither Buchungen dazugekommen sind.
        leistung:
          inv.leistungVon && inv.leistungBis
            ? { von: inv.leistungVon, bis: inv.leistungBis }
            : null,
        materialOhnePreis: [],
        entries: [],
      },
      appendDetail: false,
      vatRate: inv.vatRate,
      /*
        AUS DEM DOKUMENT, nicht aus dem Formular: der zweite Druck muss
        denselben Beleg ergeben wie der erste. Ohne diese zwei Zeilen verlöre
        eine Reverse-Charge-Rechnung beim erneuten Ausgeben ihren Pflichtsatz
        und die UID des Empfängers — und wäre damit ein anderer, ungültiger
        Beleg über dieselbe Nummer.
      */
      reverseCharge: inv.reverseCharge,
      customerVatId: inv.customerVatId,
    });
    toast.success('PDF erneut erzeugt');
  }

  /**
   * Der Mahnlauf: was heute zu mahnen ist, dringlichstes zuerst.
   *
   * Gerechnet aus denselben Rechnungen, die die Liste unten zeigt — keine
   * zweite Abfrage. Der Lauf ist eine Sicht auf den Bestand, kein eigener
   * Datenstand, der auseinanderlaufen könnte.
   */
  const lauf = useMemo(
    () => mahnlauf(offeneRechnungen, todayStr(), company?.rates?.mahnspesen),
    [offeneRechnungen, company?.rates?.mahnspesen],
  );

  /**
   * Unterschriebene Leistung, für die nie eine Rechnung geschrieben wurde.
   *
   * DIE LETZTE OFFENE STELLE IM KREIS. Die Rechnung merkt sich seit jeher,
   * welche Scheine sie verbraucht hat; gelesen wurde das nur, um beim
   * Zusammenstellen nichts doppelt zu verrechnen. Die Umkehrung fehlte — und
   * sie ist die betrieblich wichtigere: das ist kein Buchhaltungsfehler, den
   * man später sieht, sondern Geld, das nie eingefordert wird.
   */
  const offeneLeistung = useMemo(
    /*
      HIER BRAUCHT ES BEIDE LISTEN, und das ist kein Versehen: gesucht sind
      Scheine, die auf KEINER Rechnung stehen. Eine bezahlte Rechnung ist
      genauso ein Beleg dafür, dass verrechnet wurde, wie eine offene — sie
      steht nur nicht in `offeneRechnungen`. Die Arbeitsliste deckt die
      jüngeren ab, die offenen die älteren; zusammen ist das die belastbare
      Auskunft, die es vorher nicht gab.
    */
    () => unverrechneteScheine(scheineAllerBaustellen, [...invoices, ...offeneRechnungen], todayStr()),
    [scheineAllerBaustellen, invoices, offeneRechnungen],
  );

  /*
    Der Abgleich hängt an der Vorschau, nicht an der Liste: verglichen wird,
    was DIESE Rechnung nehmen würde, gegen die Scheine derselben Baustelle.
  */
  const abgleich = useMemo(
    () =>
      preview
        ? scheinAbgleich(projectNumber, preview.entries, scheineAllerBaustellen)
        : { verrechnetMin: 0, bestaetigtMin: 0, scheine: 0, mehrMin: 0, auffaellig: false },
    [preview, projectNumber, scheineAllerBaustellen],
  );

  if (!user) return null;

  /**
   * Den Zeitraum für den Buchhaltungs-Export vom Server holen.
   *
   * Ein eigener Schritt, kein Nebenprodukt der Liste. Ändert jemand den
   * Zeitraum, wird das vorige Ergebnis weggeräumt: eine Zusammenstellung, die
   * zu einem anderen Zeitraum gehört als der, der im Feld steht, ist die
   * gefährlichste Anzeige von allen.
   */
  async function exportHolen() {
    if (!user) return;
    setExportLaeuft(true);
    setExportFehler(null);
    try {
      setExportZeilen(await listInvoicesInRange(user.companyId, exportVon, exportBis));
    } catch {
      setExportZeilen(null);
      setExportFehler(
        'Der Zeitraum konnte nicht geladen werden. Ohne ihn wäre das Journal unvollständig — ' +
          'bitte erneut versuchen.',
      );
    } finally {
      setExportLaeuft(false);
    }
  }

  /** Den Mahndialog für eine Rechnung öffnen — mit der vorgeschlagenen Frist. */
  const mahnenOeffnen = (inv: WithId<Invoice>) => {
    const frist = new Date();
    frist.setDate(frist.getDate() + FRIST_TAGE);
    setMahnFrist(localDateStr(frist));
    setMahnFuer(inv);
  };

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
      <Card
        title="Buchhaltungs-Export"
        hint={
          'Rechnungsausgangsbuch als CSV — Nummer, Datum, Kunde, UID, Netto, USt, Brutto. ' +
          'Ausgegeben wird jede Rechnung, deren RECHNUNGSDATUM im Zeitraum liegt, nicht das ' +
          'Zahldatum. Stornierte sind enthalten und gekennzeichnet, zählen aber nicht in die ' +
          'Summe — sie gehören ins Ausgangsbuch, sonst fehlt eine Nummer in der Reihe. Die UID ' +
          'kommt aus dem Kundenstamm; fehlt sie dort, bleibt die Spalte leer. ' +
          'Das Zielformat mit dem Steuerberater abstimmen: ein geratenes BMD- oder DATEV-Layout ' +
          'sähe importierbar aus und bucht im Zweifel auf falsche Konten. Deshalb hier ein ' +
          'dokumentiertes CSV mit allen Feldern, die beide brauchen.'
        }
      >
        <FormGrid>
          <InputField
            id="expvon"
            label="Von"
            type="date"
            value={exportVon}
            onChange={(e) => {
              setExportVon(e.target.value);
              // Eine Zusammenstellung, die zu einem anderen Zeitraum gehört als der
              // im Feld, ist die gefährlichste Anzeige von allen.
              setExportZeilen(null);
            }}
          />
          <InputField
            id="expbis"
            label="Bis"
            type="date"
            value={exportBis}
            onChange={(e) => {
              setExportBis(e.target.value);
              // Eine Zusammenstellung, die zu einem anderen Zeitraum gehört als der
              // im Feld, ist die gefährlichste Anzeige von allen.
              setExportZeilen(null);
            }}
          />
        </FormGrid>
        {/*
          DER ZEITRAUM WIRD GEHOLT, NICHT GEFILTERT.

          Vorher stand hier `buildInvoiceCsv(invoices, …)` — die geladene
          Arbeitsliste, nach Datum gefiltert. Die reicht voreingestellt fünfzig
          Rechnungen zurück. Ein Export für einen älteren Monat lieferte damit
          eine LEERE Datei, und zwar eine, die wie ein erfolgreicher Export
          aussah: „0 Rechnungen", keine Lücken, Knopf grau.

          Schlimmer war die Lückenprüfung: sie meldete Lücken, die keine sind,
          weil die fehlenden Nummern schlicht nicht geladen waren. Ein Befund,
          den es nicht gibt, kostet in einer Kanzlei einen halben Tag.

          Deshalb ist der Export jetzt ein bewusster Schritt: Zeitraum wählen,
          holen, ansehen, herunterladen. Das Nachladen dauert einen Moment —
          und ein Moment ist billiger als ein falsches Journal.
        */}
        <div className="mt-4 flex flex-wrap items-center gap-3">
          <Button
            variant="secondary"
            loading={exportLaeuft}
            disabled={!exportVon || !exportBis || exportVon > exportBis}
            onClick={() => void exportHolen()}
          >
            Zeitraum zusammenstellen
          </Button>
          {exportVon > exportBis && (
            <span className="text-sm text-warning">„Von" liegt nach „Bis".</span>
          )}
        </div>
        {exportFehler && <div className="mt-3"><ErrorState message={exportFehler} /></div>}
        {exportZeilen !== null && (() => {
          const e = buildInvoiceCsv(exportZeilen, kunden, exportVon, exportBis);
          return (
            <>
              <p className="mt-3 text-sm text-ink">
                {e.anzahl} {e.anzahl === 1 ? 'Rechnung' : 'Rechnungen'} · Netto{' '}
                {fmtEUR(e.summeNetto)} · Brutto {fmtEUR(e.summeBrutto)}
              </p>
              {/*
                NULL RECHNUNGEN IST EINE AUSSAGE, keine Panne — aber nur, wenn
                dabeisteht, dass wirklich nachgesehen wurde. Genau daran fehlte
                es vorher: eine leere Ausgabe sah aus wie ein leerer Monat.
              */}
              {e.anzahl === 0 && (
                <p className="mt-1 text-sm text-ink-muted">
                  In diesem Zeitraum wurde keine Rechnung geschrieben. Nachgesehen wurde im
                  gesamten Bestand, nicht nur in der Liste unten.
                </p>
              )}
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

      {/*
        DER MAHNLAUF.

        Das Mahnen gab es schon — als Menüpunkt an der einzelnen Rechnung. Die
        Stufen stimmten, die Belege stimmten, nur kam niemand dorthin: wer
        wissen wollte, was zu mahnen ist, filterte auf „Überfällig", ging die
        Liste durch, öffnete an jeder Zeile das Menü und prüfte im Kopf, ob
        die dritte Mahnung schon draussen war.

        Genau daran bleibt Mahnwesen in kleinen Betrieben liegen — nicht am
        Schreiben, sondern am Zusammenstellen, das sich immer verschieben
        lässt. Diese Karte nimmt das Zusammenstellen ab. Verschickt wird
        weiterhin einzeln und bewusst: hinter jeder Forderung steht ein Kunde,
        den der Chef vielleicht gerade am Telefon hatte.

        Die Karte erscheint nur, wenn es etwas zu tun gibt. Eine dauerhaft
        sichtbare leere Mahnliste wäre ein Vorwurf ohne Anlass.
      */}
      {/*
        UNVERRECHNETE LEISTUNG.

        Der Weg vom Einsatz zum Geld war durchgehend gebaut — Zeit buchen,
        Schein unterschreiben, Rechnung daraus zusammenstellen —, aber niemand
        konnte sagen, WAS davon noch nicht durch ist. Das ist kein
        Buchhaltungsfehler, den man später sieht: es ist Geld, das schlicht
        nie eingefordert wird, und im Handwerk der klassische Weg, wie ein gut
        ausgelasteter Betrieb trotzdem knapp bei Kasse ist.

        Die Karte erscheint erst, wenn etwas AUFFÄLLIG lange offen ist. Ein
        Schein von vorgestern gehört nicht gemeldet — zwischen Einsatz und
        Rechnung liegt regelmässig ein Monatsabschluss, und eine Liste, die
        das anmahnt, sieht sich nach zwei Wochen niemand mehr an.
      */}
      {/*
        EINE ZEILE STATT ZWEIER LÜGEN.

        Kamen die offenen Forderungen nicht, dürfen Mahnlauf und
        „nicht verrechnete Leistung" nicht so tun, als hätten sie gerechnet:
        der eine verschwände als „nichts zu mahnen", die andere meldete
        Scheine, die längst auf einer offenen Rechnung stehen.

        Die Zeile steht über beiden Karten, nicht in ihnen — sie betrifft die
        Grundlage, nicht das Ergebnis.
      */}
      {forderungenFehler && (
        <p role="status" className="rounded-sm border border-warning/30 bg-warning-bg px-3 py-2 text-sm text-warning">
          <strong>Die offenen Forderungen konnten nicht geladen werden.</strong> Mahnlauf und
          „nicht verrechnete Leistung" sind deshalb unvollständig — was hier fehlt, heisst
          nicht, dass es nichts zu tun gibt. Bitte die Seite neu laden.
        </p>
      )}

      {!forderungenFehler && auffaellige(offeneLeistung).length > 0 && (
        <Card
          title={`Nicht verrechnete Leistung (${auffaellige(offeneLeistung).length})`}
          hint={
            'Unterschriebene Handwerksscheine, die auf keiner gültigen Rechnung stehen und ' +
            `älter als ${AUFFAELLIG_AB_TAGEN} Tage sind — älteste zuerst. Wird eine Rechnung ` +
            'storniert, tauchen ihre Scheine hier wieder auf: der Storno nimmt die Forderung ' +
            'zurück, also steht die Leistung wieder offen.'
          }
        >
          <List>
            {auffaellige(offeneLeistung).map(({ schein, tage }) => (
              <ListRow
                key={schein.id}
                title={
                  <>
                    <span>{schein.customerName}</span>
                    <Warnung stufe={tage >= 90 ? 'dringend' : 'achtung'}>{tageWort(tage)}</Warnung>
                  </>
                }
                subtitle={
                  <span className="tnum">
                    Baustelle {schein.projectNumber} · Leistung vom {schein.datum} ·{' '}
                    {schein.abrechnung}
                  </span>
                }
              >
                {/*
                  Der Weg zur Rechnung ist die Baustelle: aus ihr wird
                  zusammengestellt, nicht aus dem einzelnen Schein. Der Knopf
                  setzt deshalb nur die Auswahl oben — von Hand abzutippen war
                  genau die Reibung, die dazu führt, dass es liegen bleibt.
                */}
                <Button
                  variant="secondary"
                  onClick={() => {
                    setProjectNumber(schein.projectNumber);
                    setPreview(null);
                    window.scrollTo({ top: 0, behavior: 'smooth' });
                  }}
                >
                  Baustelle wählen
                </Button>
              </ListRow>
            ))}
          </List>
        </Card>
      )}

      {!forderungenFehler && (lauf.zeilen.length > 0 || lauf.ausgereizt.length > 0) && (
        <Card
          title={`Mahnlauf (${lauf.zeilen.length})`}
          hint={
            'Was heute gemahnt werden kann — die weit fortgeschrittenen Forderungen oben, denn ' +
            'eine Rechnung vor der letzten Mahnung ist dringender als eine, die gerade erst die ' +
            'Frist überschritten hat. Verschickt wird einzeln: jede Mahnung erzeugt ihren Beleg ' +
            'und wird an der Rechnung festgehalten. Verzugszinsen stehen bewusst auf keiner ' +
            'Mahnung — der gesetzliche Satz hängt am Basiszinssatz und ändert sich halbjährlich; ' +
            'eine falsch gerechnete Zinsforderung wäre schlechter als keine.'
          }
        >
          {lauf.zeilen.length > 0 ? (
            <>
              <p className="mb-3 text-sm text-ink">
                <strong>{fmtEUR(lauf.summeBrutto)} €</strong> offen
                {lauf.summeSpesen > 0 ? ` · ${fmtEUR(lauf.summeSpesen)} € Mahnspesen` : ''}
              </p>
              <List>
                {lauf.zeilen.map((z) => (
                  <ListRow
                    key={z.rechnung.id}
                    title={
                      <>
                        <span>{z.rechnung.customerName}</span>
                        {/* Die dritte Mahnung ist die letzte, die die App
                            schreibt — danach braucht es eine Entscheidung. */}
                        <Warnung stufe={z.stufe === 3 ? 'dringend' : 'achtung'}>
                          {TEXTE[z.stufe].titel}
                        </Warnung>
                      </>
                    }
                    subtitle={
                      <span className="tnum">
                        {z.rechnung.invoiceNumber} · {fmtEUR(z.rechnung.totalBrutto)} € ·{' '}
                        {z.tageUeberfaellig} Tage überfällig
                        {z.spesen > 0 ? ` · ${fmtEUR(z.spesen)} € Spesen` : ''}
                      </span>
                    }
                  >
                    <Button variant="secondary" onClick={() => mahnenOeffnen(z.rechnung)}>
                      Mahnen
                    </Button>
                  </ListRow>
                ))}
              </List>
            </>
          ) : (
            <p className="text-sm text-ink-muted">Heute ist nichts zu mahnen.</p>
          )}

          {/*
            NACH DER DRITTEN MAHNUNG HÖRT DIE APP AUF. Was folgt — Anwalt,
            Inkasso oder abschreiben — entscheidet ein Mensch. Fielen diese
            Rechnungen stillschweigend aus dem Lauf, wären ausgerechnet die
            ältesten Forderungen die unsichtbarsten.
          */}
          {lauf.ausgereizt.length > 0 && (
            <p className="mt-4 rounded-sm border border-warning/30 bg-warning-bg px-3 py-2 text-sm text-warning">
              <strong>
                {lauf.ausgereizt.length}{' '}
                {lauf.ausgereizt.length === 1 ? 'Forderung' : 'Forderungen'} braucht eine
                Entscheidung:
              </strong>{' '}
              {lauf.ausgereizt.map((i) => `${i.invoiceNumber} (${i.customerName})`).join(', ')}. Die
              dritte Mahnung ist verschickt — was jetzt folgt, entscheidet der Betrieb.
            </p>
          )}
        </Card>
      )}

      <Card
        title="Neue Rechnung aus Baustelle"
        hint="Zusammengestellt wird, was auf dieser Baustelle als „Anwesend“ gebucht und noch NICHT verrechnet ist — dazu das ausgegebene Material. Eine Position kann deshalb nie zweimal auf eine Rechnung geraten. Gesperrt werden die Belege aber erst beim Anlegen, nicht schon beim Zusammenstellen: bis dahin lässt sich alles gefahrlos ansehen und wieder verwerfen."
      >
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
              {/*
                „0 % (Reverse Charge)" STAND HIER UND WAR EINE FALLE.

                Die Auswahl setzte nur den Satz auf null. Weder der
                Pflichthinweis nach § 11 Abs 1a UStG noch die UID des
                Empfängers kamen dabei auf den Beleg — die Rechnung sah aus
                wie Reverse Charge und war keine. Und sie hätte gegolten: als
                Vorgabe für JEDE Rechnung des Betriebs, auch die an
                Privatkunden.

                Der Übergang der Steuerschuld hängt an der einzelnen Leistung,
                nicht am Betrieb. Er wird deshalb je Rechnung angehakt, unten
                in der Vorschau. Die Null bleibt als Satz wählbar — es gibt
                echte Nullfälle wie die Ausfuhrlieferung —, aber ohne die
                Beschriftung, die etwas anderes verspricht.
              */}
              <SelectField id="r-vat" label="USt-Satz" value={String(rates.vatRate)}
                onChange={(e) => setRates({ ...rates, vatRate: Number(e.target.value) })}>
                <option value="0.2">20 %</option>
                <option value="0.13">13 %</option>
                <option value="0.1">10 %</option>
                <option value="0">0 %</option>
              </SelectField>
            </FormGrid>
          </div>
        </details>

        {error && <div className="mt-3"><ErrorState message={error} /></div>}
      </Card>

      {/* Vorschau vor dem Erzeugen: danach sind die Belege gesperrt und eine
          Korrektur ginge nur noch über Storno. */}
      {preview && (
        <Card
          title="Vorschau"
          hint={
            'Hier ist noch nichts geschrieben. Positionen lassen sich ändern, löschen und ' +
            'ergänzen — auch das vorbereitete Material — denn eine Rechnung ist selten genau ' +
            'das, was Zeiterfassung und Scheine hergeben. Verbindlich wird alles erst mit ' +
            '„Rechnung anlegen“: dann zieht sie ihre Nummer, die Belege werden gesperrt, und ' +
            'beides ist nur noch über einen Storno rückgängig zu machen.'
          }
        >
          {/*
            DER LEISTUNGSZEITRAUM STEHT VOR DEN POSITIONEN.

            Er ist Pflichtangabe nach § 11 Abs 1 Z 4 UStG und fehlte auf jeder
            bisher geschriebenen Rechnung. Vorbelegt aus den Belegen, aber
            änderbar: eine Teilrechnung oder eine später gebuchte Nacharbeit
            soll den Zeitraum nicht verschieben, den der Betrieb dem Kunden
            gegenüber nennen will.
          */}
          <div className="mb-4 grid gap-3 sm:grid-cols-2">
            <InputField
              id="leistung-von"
              label="Leistung von"
              type="date"
              value={leistungVon}
              onChange={(e) => setLeistungVon(e.target.value)}
            />
            <InputField
              id="leistung-bis"
              label="Leistung bis"
              type="date"
              value={leistungBis}
              onChange={(e) => setLeistungBis(e.target.value)}
            />
          </div>
          {(!leistungVon || !leistungBis) && (
            <p className="mb-3 rounded-sm border border-warning/30 bg-warning-bg px-3 py-2 text-sm text-warning">
              Ohne Leistungszeitraum ist die Rechnung nach § 11 UStG unvollständig — beim Kunden
              wackelt damit der Vorsteuerabzug.
            </p>
          )}
          {/*
            VERDREHT IST NICHT DASSELBE WIE FEHLEND.

            Die Felder sind vorbelegt, aber änderbar — und wer eines der
            beiden von Hand korrigiert, kann sie vertauschen. Auf der Rechnung
            stünde dann „30.09.2026 – 01.09.2026". Anders als bei einem
            Tippfehler in einer Maske ist das hier nicht zurückzunehmen: eine
            geschriebene Rechnung geht nur noch über einen Storno weg, und
            zwischendurch ist sie beim Kunden und im Journal.

            Gesperrt wird trotzdem nicht — dieselbe Entscheidung wie eine
            Zeile darüber, wo der ganz FEHLENDE Zeitraum der schwerere Mangel
            ist und ebenfalls nur gemeldet wird. Zwei verschiedene Maßstäbe in
            derselben Maske wären für niemanden nachvollziehbar.
          */}
          {leistungVon && leistungBis && leistungBis < leistungVon && (
            <p className="mb-3 rounded-sm border border-warning/30 bg-warning-bg px-3 py-2 text-sm text-warning">
              „Leistung bis" liegt vor „Leistung von" — so stünde der Zeitraum verdreht auf der
              Rechnung. Zurückzunehmen wäre das nur noch mit einem Storno.
            </p>
          )}
          {/*
            WAS DER KUNDE UNTERSCHRIEBEN HAT, NEBEN DEM, WAS VERRECHNET WIRD.

            Die Rechnung nimmt alle unverrechneten Stunden der Baustelle; der
            Kunde hat einen Schein über die Zeit BEI IHM in der Hand — ohne
            Anfahrt, ohne Vorbereitung in der Werkstatt. Beides darf
            auseinandergehen, und zwar zu Recht. Nur sagte es niemandem, wenn
            die Rechnung deutlich darüber liegt, und die Reklamation kommt
            erst, wenn sie schon draussen ist.

            GEKAPPT WIRD NICHTS. Die Zahl steht da, entschieden wird im Büro.
          */}
          {abgleich.scheine > 0 && (
            <p
              className={`mb-3 rounded-sm border px-3 py-2 text-sm ${
                abgleich.auffaellig
                  ? 'border-warning/30 bg-warning-bg text-warning'
                  : 'border-line bg-surface-2 text-ink-muted'
              }`}
            >
              {abgleich.scheine === 1 ? 'Ein Schein bestätigt' : `${abgleich.scheine} Scheine bestätigen`}{' '}
              <strong>{fmtMin(abgleich.bestaetigtMin)}</strong>, verrechnet werden{' '}
              <strong>{fmtMin(abgleich.verrechnetMin)}</strong>
              {abgleich.auffaellig ? (
                <>
                  {' '}
                  — <strong>{fmtMin(abgleich.mehrMin)} mehr, als der Kunde unterschrieben hat.</strong>{' '}
                  Das kann stimmen: Vorfertigung in der Werkstatt und der Weg zum Grosshändler
                  zählen auf die Baustelle, stehen aber auf keinem Schein. Nur wird der Kunde
                  danach fragen — besser jetzt als nach dem Versand.
                </>
              ) : (
                '.'
              )}
            </p>
          )}
          {preview.materialOhnePreis.length > 0 && (
            <p className="mb-3 rounded-sm border border-warning/30 bg-warning-bg px-3 py-2 text-sm text-warning">
              Ohne Preis im Katalog und deshalb mit 0,00 € eingesetzt:{' '}
              {preview.materialOhnePreis.join(', ')}. Preis hier eintragen oder die Zeile
              entfernen — im Lager gepflegt, kommt er beim nächsten Mal von selbst.
              {/*
                „Im Lager gepflegt, kommt er beim nächsten Mal von selbst" ist
                der übliche Rat — und er wäre falsch, wenn der Katalog gar
                nicht vollständig geladen wurde. Dann liegt es nicht an der
                Pflege, und wer ihr nachginge, suchte an der falschen Stelle.
              */}
              {katalogUnvollstaendig && (
                <strong className="mt-1 block">
                  Achtung: der Materialstamm wurde nur bis zur Obergrenze geladen. Für diese
                  Artikel kann sehr wohl ein Preis hinterlegt sein.
                </strong>
              )}
            </p>
          )}
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
                        /*
                          EINE NULL FÄLLT AUF, statt sich als Zahl zu tarnen.

                          Der Hinweis über der Tabelle nennt die betroffenen
                          Artikel — in einer Rechnung mit zwanzig Zeilen ist
                          das trotzdem eine Suche. Ein Preis von 0,00 € sieht
                          aus wie ein Preis; nur die Farbe sagt, dass hier
                          noch eine Entscheidung fehlt.
                        */
                        className={
                          'tnum min-h-touch w-28 rounded border bg-surface px-2 py-1 text-right text-sm text-ink focus:outline-none focus:ring-2 ' +
                          (p.unitPrice === 0
                            ? 'border-warning focus:border-warning focus:ring-warning/30'
                            : 'border-line focus:border-brand focus:ring-brand/30')
                        }
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
                    {reverseCharge ? 'Umsatzsteuer' : `USt. ${Math.round(satz * 100)} %`}
                  </td>
                  <td className="tnum pr-3 text-right">
                    {reverseCharge ? 'Übergang der Steuerschuld' : fmtEUR(preview.totalVat)}
                  </td>
                  <td />
                </tr>
                <tr className="font-bold">
                  <td colSpan={4} className="text-right">
                    {reverseCharge ? 'Rechnungsbetrag' : 'Brutto'}
                  </td>
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
            <div className="mb-2 flex flex-wrap items-center gap-2">
              <span className="section-label">Rabatt</span>
              <InfoHint about="den Rabatt">
                Der Rabatt geht auf das NETTO, nicht auf das Brutto — die Umsatzsteuer bemisst
                sich am tatsächlich vereinbarten Entgelt. Die Bezeichnung steht auf der
                Rechnung; bleibt sie leer, erscheint dort nur „Rabatt“.
              </InfoHint>
            </div>
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
            {/* Die ZAHL bleibt stehen — sie gehört zu dem, was der Knopf gleich
                tut. Der allgemeine Teil („Material wird nicht verrechnet")
                steht im „i" der Karte. */}
            {/*
              BAULEISTUNG MIT ÜBERGANG DER STEUERSCHULD — § 19 Abs 1a UStG.

              Steht hier unten und nicht oben bei den Sätzen: es ist eine
              Entscheidung über DIESE Rechnung, keine Einstellung des Betriebs.
              Ob der Übergang gilt, hängt an der Leistung und am Empfänger —
              derselbe Baumeister kann ein Werkzeug kaufen (20 %) und eine
              Installation beauftragen (Reverse Charge).

              Bei einem Betrieb, der überwiegend für Private arbeitet, bleibt
              der Haken das ganze Jahr aus. Genau deshalb ist er ein Haken und
              keine Vorgabe: eine ungenutzte Steuerfunktion, die sich
              versehentlich einschaltet, kostet mehr als sie nützt.
            */}
            <div className="rounded-sm border border-line p-3">
              <CheckboxField
                id="rc"
                label="Bauleistung — Steuerschuld geht auf den Empfänger über (§ 19 Abs 1a UStG)"
                checked={reverseCharge}
                onChange={(e) => setReverseCharge(e.target.checked)}
              />
              <p className="mt-1 text-sm text-ink-muted">
                Nur bei Bauleistungen an einen anderen Bauunternehmer — also als Subunternehmer.
                Bei Privatkunden gilt der Übergang nicht.
              </p>
              {reverseCharge && (
                <div className="mt-3 space-y-2">
                  {!rcPruefung.vollstaendig && (
                    <p className="text-sm text-warning" role="alert">
                      Ohne {rcPruefung.fehlt.join(' und ')} ist der Übergang der Steuerschuld nicht
                      belegt — die Rechnung lässt sich so nicht anlegen.
                    </p>
                  )}
                  <p className="text-sm text-ink-muted">
                    Auf der Rechnung steht dann keine Umsatzsteuer, dafür der vorgeschriebene
                    Hinweis und beide UID-Nummern.
                  </p>
                </div>
              )}
            </div>

            {/*
              DIE UID DES KUNDEN STEHT AUSSERHALB DES REVERSE-CHARGE-BLOCKS,
              und das ist der Kern dieser Änderung.

              Sie stand vorher DARIN und wurde beim Speichern weggeworfen,
              sobald der Haken aus war. Über 10.000 € brutto ist sie aber auch
              auf einer ganz gewöhnlichen Rechnung Pflichtangabe — und ihr
              Fehlen kostet den KUNDEN den Vorsteuerabzug, nicht den Betrieb
              seine Steuer. Sie gehört zum Empfänger, nicht zur Steuerschuld.

              Vorausgefüllt aus dem Kundenstamm, wenn dort eine hinterlegt ist.
            */}
            <div className="rounded-sm border border-line p-3">
              <InputField
                id="rc-uid"
                label="UID-Nummer des Kunden"
                placeholder="ATU12345678"
                value={kundenUid}
                onChange={(e) => setKundenUid(e.target.value)}
                pflicht={uidPruefung.pflicht}
              />
              {kundenUid.trim() && !sichtAusWieUid(kundenUid) && (
                <p className="mt-1 text-sm text-warning">
                  Das sieht nicht nach einer UID-Nummer aus. Österreich: ATU und acht Ziffern.
                </p>
              )}
              {uidPruefung.text && (
                <p className="mt-1 text-sm text-warning" role="alert">
                  {uidPruefung.text}
                </p>
              )}
              {!uidPruefung.pflicht && !kundenUid.trim() && (
                <p className="mt-1 text-sm text-ink-muted">
                  Bei Privatkunden bleibt das Feld leer. Pflicht wird es über 10.000 € brutto
                  und bei Bauleistungen mit Übergang der Steuerschuld.
                </p>
              )}
            </div>

            <p className="text-sm text-ink-muted">
              {preview.linkedEntries.length}{' '}
              {preview.linkedEntries.length === 1 ? 'Zeiteintrag wird' : 'Zeiteinträge werden'} als
              verrechnet gesperrt.
            </p>
            <div className="flex flex-col gap-2 sm:flex-row">
              <Button
                onClick={confirmInvoice}
                loading={busy}
                disabled={numberTaken || !invoiceNumber || !rcPruefung.vollstaendig}
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
        hint={
          'Der Status „Überfällig“ wird beim Öffnen dieser Ansicht automatisch gesetzt, ' +
          'sobald das Zahlungsziel überschritten ist — „Bezahlt“ trägt jemand von Hand ein. ' +
          'STORNIEREN und LÖSCHEN sind zweierlei: ein Storno behält die Rechnungsnummer ' +
          '(sie darf in der Reihe nicht fehlen) und gibt die verrechneten Stunden und ' +
          'Materialien wieder frei, sodass sie auf eine neue Rechnung können; er lässt sich ' +
          'auch wieder aufheben. Gelöscht werden kann nur eine bereits stornierte Rechnung — ' +
          'alles andere bleibt in den Büchern. Geladen werden die jüngsten Rechnungen; Suche und '
          + 'Filter gelten für die geladenen — für ältere zuerst nachladen.'
        }
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
                    {/*
                      WAS SCHON GEMAHNT WURDE, gehört in die Zeile.

                      Ohne diese Angabe führt der Betrieb den Mahnstand
                      weiterhin im Kopf — und genau das war der Zustand
                      vorher. Zwei Erinnerungen an denselben Kunden in einer
                      Woche sind peinlicher als gar keine.
                    */}
                    {!!inv.mahnstufe && (
                      <span className="mt-1 block text-xs text-warning">
                        {TEXTE[inv.mahnstufe as 1 | 2 | 3].titel} am {inv.gemahntAm}
                        {inv.mahnfrist ? ` · Frist ${inv.mahnfrist}` : ''}
                        {inv.mahnspesen ? ` · ${fmtEUR(inv.mahnspesen)} € Spesen` : ''}
                      </span>
                    )}
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
                    /*
                      MAHNEN steht im Menü, nicht als Knopf in der Zeile.

                      Es ist die seltenere Handlung — die meisten Rechnungen
                      werden bezahlt. Ein eigener Knopf an jeder Zeile machte
                      das Mahnen zur naheliegendsten Sache in einer Liste, in
                      der es die Ausnahme ist.

                      Der Punkt erscheint nur, wenn gemahnt werden DARF: ein
                      Eintrag, der bei jedem Klick erklärt, warum er nicht
                      geht, ist eine Sackgasse mit Beschriftung.
                    */
                    ...(darfMahnen(inv, todayStr()).moeglich
                      ? [
                          {
                            label: `${TEXTE[naechsteStufe(inv)!].titel} erzeugen`,
                            onSelect: () => {
                              const frist = new Date();
                              frist.setDate(frist.getDate() + FRIST_TAGE);
                              setMahnFrist(localDateStr(frist));
                              setMahnFuer(inv);
                            },
                          },
                        ]
                      : []),
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
                          /*
                            HIER STAND „RECHNUNG LÖSCHEN", ohne Rückfrage,
                            direkt unter „Storno aufheben". Ein Fehlgriff im
                            Menü, und der Beleg war weg.

                            Ersatzlos gestrichen, nicht mit einer Rückfrage
                            versehen: § 132 BAO verlangt sieben Jahre
                            Aufbewahrung, und die gezogene Nummer hinterliesse
                            eine Lücke, die der Buchhaltungs-Export danach zu
                            Recht meldet — ohne dass noch jemand wüsste,
                            warum. Der Storno ist die vorgesehene Korrektur;
                            er bleibt stehen, trägt seinen Grund und lässt
                            sich aufheben. Die Rules sagen dasselbe
                            (`allow delete: if false`).
                          */
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
            <span className="text-sm text-ink-muted">{grenze} jüngste geladen</span>
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

      {/*
        DIE MAHNUNG MIT ÄNDERBARER FRIST.

        Eine Woche ist der Vorschlag, nicht die Regel: bei einem Stammkunden
        vor dem Urlaub sind zwei angemessen, bei der dritten Stufe vielleicht
        drei Tage. Wer die Frist nicht setzen kann, schreibt sie danach von
        Hand ins Begleitmail — und dann steht auf dem Beleg etwas anderes als
        im Text.

        NICHT ROT: eine Zahlungserinnerung ist ein normaler Arbeitsschritt und
        kein Löschen. Wer sich an Rot dafür gewöhnt, übersieht es beim Storno.
      */}
      <ConfirmDialog
        open={!!mahnFuer}
        title={
          mahnFuer && naechsteStufe(mahnFuer)
            ? `${TEXTE[naechsteStufe(mahnFuer)!].titel} — ${mahnFuer.customerName}`
            : 'Mahnen'
        }
        message={
          mahnFuer
            ? `${mahnFuer.invoiceNumber} über ${fmtEUR(mahnFuer.totalBrutto)} €, fällig war ` +
              `${mahnFuer.dueDate}. Der Beleg wird als PDF erzeugt und heruntergeladen; ` +
              'versendet wird er von Ihnen.'
            : undefined
        }
        confirmLabel="Erzeugen"
        confirmTone="primary"
        onCancel={() => setMahnFuer(null)}
        onConfirm={async () => {
          if (mahnFuer) await mahnen(mahnFuer, mahnFrist);
        }}
      >
        <InputField
          id="mahnfrist"
          label="Neue Frist"
          type="date"
          value={mahnFrist}
          onChange={(e) => setMahnFrist(e.target.value)}
        />
      </ConfirmDialog>
    </div>
  );
}
