import { Fragment, useEffect, useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { useAuth } from '@/app/AuthContext';
import { nachtzeitVon } from '@/lib/lohnregeln';
import {
  subscribeRecentInvoices,
  listInvoicesInRange,
  listUnpaidInvoices,
  nextInvoiceNumber,
  isInvoiceNumberTaken,
  invoiceSeqOf,
  rechnungAusstellen,
  listInvoicesForProject,
  updateInvoiceStatus,
  cancelInvoice,
  reactivateInvoice,
  stornorechnungAusstellen,
  schlussrechnungenOhneAbzug,
  type SchlussOhneAbzug,
  mahnungFesthalten,
  sucheRechnungen,
  scheineAufRechnung,
  RECHNUNG_TREFFER,
  listInvoicesByIds,
} from '@/lib/db/invoices';
import { listZahlungen, listZahlungenImZeitraum, createZahlung, createZahlungMitSkonto, deleteZahlung } from '@/lib/db/zahlungen';
import { istUeberfaellig, zahlstand } from './zahlstand';
import { skontoBedingung, skontoZumAusgleich, zugesagterSkonto } from './skonto';
import { listActiveProjects } from '@/lib/db/projects';
import { listCustomers, updateCustomer } from '@/lib/db/customers';
import { buildInvoiceCsv, invoiceCsvFilename } from './buchhaltungExport';
import { buildBmdCsv, bmdCsvFilename, buildBmdZahlungenCsv, bmdZahlungenFilename } from './bmdExport';
import { buchungskonten, type Buchungskonto } from '@/lib/db/konten';
import { downloadCsv } from '@/features/accounting/export';
import { listEntriesForProjects } from '@/lib/db/timeEntries';
import { listWorkSheetsForProject, listRecentWorkSheets } from '@/lib/db/workSheets';
import { listMaterials } from '@/lib/db/materials';
import { katalogAbgeschnitten } from '@/lib/listengrenzen';
import { verrechneteScheine } from './materialPositionen';
import {
  darfMahnen,
  mahnkosten,
  naechsteStufe,
  TEXTE,
  FRIST_TAGE,
  verzugszinsen,
  zinssatzText,
  type Mahnstufe,
} from './mahnung';
import { postenNeuLaden } from '@/app/offenePosten';
import { mahnlauf } from './mahnlauf';
import {
  unverrechneteScheine,
  auffaellige,
  AUFFAELLIG_AB_TAGEN,
  UNVERRECHNET_BASIS,
} from '@/features/worksheets/unverrechnet';
import { geltenderSatz, pruefeReverseCharge } from './reverseCharge';
import { istUnternehmerKunde, uidFehler, uidNormalisieren } from '@/lib/uid';
import { pruefeEmpfaengerUid } from './empfaengerUid';
import { assembleInvoice, recalc, INVOICE_DEFAULTS, type AssembledInvoice } from './assemble';
import { abziehbar, alsVorrechnung, leistungAusVorrechnungen, mitAbzug, nachSteuer, pflichtAbzug } from './vorrechnungen';
import { scheinAbgleich } from './scheinAbgleich';
import { einheitspreisVorschau, pauschalAngebot, pauschaleVerrechnetMit, pauschalVorschau } from './pauschale';
import { ANZAHLUNG_PROZENT_VORGABE, anteilFehler, anzahlungVorschau } from './anzahlung';
import { listQuotesForProject } from '@/lib/db/quotes';
import { listBasiszinssaetze, type ZentralerBasiszinssatz } from '@/lib/db/basiszins';
import { discountLabel, istPreiszeile, positionsRabattText, type InvoicePosition } from './totals';
import { todayStr, localDateStr, fmtDauer, tageWort } from '@/lib/time';
import type { WithId } from '@/lib/db/core';
import type { Invoice, Project, RechnungsArt, WorkSheet, Zahlungseingang } from '@/types';
import Card from '@/components/Card';
import Button from '@/components/Button';
import Metric, { MetricRow } from '@/components/Metric';
import IconButton from '@/components/IconButton';
import StatusBadge from '@/components/StatusBadge';
import { Marke, Warnung } from '@/components/Badge';
import RechnungDetail from './RechnungDetail';
import ZahlFeld, { ZahlWertFeld, ZahlZelle } from '@/components/ZahlFeld';
import { leseZahl, unlesbareZahlIn, zahlAlsText, zahlOder } from '@/lib/zahl';
import PageHeader from '@/components/PageHeader';
import { praefixeVon } from '@/lib/praefixe';
import { isTopLevel } from '@/lib/permissions';
import ConfirmDialog from '@/components/ConfirmDialog';
import { List, ListRow } from '@/components/ListRow';
import Tabelle from '@/components/Tabelle';
import Hinweiszeile from '@/components/Hinweiszeile';
import { useSchreibtisch } from '@/lib/useSchreibtisch';
import RowMenu from '@/components/RowMenu';
import { InputField, SelectField, CheckboxField, FormGrid } from '@/components/Field';
import BaustellenSelect from '@/components/BaustellenSelect';
import InfoHint from '@/components/InfoHint';
import { useToast } from '@/components/Toast';
import { ErrorState, EmptyState, SkeletonList, TeilFehler } from '@/components/States';
import { grundAus } from '@/lib/fehlerGrund';
import { datumAT } from '@/lib/datum';
import { euro } from '@/lib/betrag';
import Adressfilter from '@/components/Adressfilter';
import { RECHNUNGS_SICHTEN, bekannt, type RechnungsSicht } from '@/features/dashboard/start/ziele';

/** Rechnungen: aus Baustelle erzeugen, Zahlung verfolgen, stornieren. */
/** Wie viele Rechnungen die Liste zunaechst zeigt. */
const RECHNUNGEN_JE_SEITE = 50;

/** Die Zahlstände, nach denen die Liste filtert — auch über `?status=`. */
/** Was eine Sicht aus der Adresse zeigt (Startseite, Nachtest 01.10.2026). */
const SICHT_TITEL: Record<RechnungsSicht, string> = {
  'mahnung-faellig': 'Mahnung fällig',
  'bezahlt-heute': 'Heute bezahlt',
  'bezahlt-monat': 'Im laufenden Monat bezahlt',
};

const FILTERSTATI = ['Offen', 'Überfällig', 'Teilbezahlt', 'Bezahlt', 'Überzahlt', 'Storniert'] as const satisfies readonly Invoice['paymentStatus'][];

export default function InvoicesView() {
  const { user, company } = useAuth();
  // Die Vorsätze des Betriebs — `RE-` stand hier bisher fest im Code.
  const vorsaetze = praefixeVon(company);
  const toast = useToast();
  const [invoices, setInvoices] = useState<WithId<Invoice>[]>([]);
  const [projects, setProjects] = useState<Project[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  /** Ein Nebenladevorgang ist ausgefallen — die Rechnungsliste steht trotzdem. */
  const [nebenFehler, setNebenFehler] = useState<string | null>(null);
  /**
   * Der zentral gepflegte Basiszinssatz (seit 05.10.2026). Kommt er nicht,
   * rechnet die Mahnung mit dem eigenen Verlauf des Betriebs wie bisher.
   */
  const [zentralerBasiszins, setZentralerBasiszins] = useState<ZentralerBasiszinssatz[]>([]);
  useEffect(() => {
    let weg = false;
    listBasiszinssaetze().then((l) => { if (!weg) setZentralerBasiszins(l); }, () => undefined);
    return () => { weg = true; };
  }, []);
  /**
   * Stammt die Vorschau aus der Pauschale? `null`: nein; `''`: ja, aber ohne
   * angenommenes Angebot; sonst Nummer und Betrag des Angebots.
   */
  const [pauschalAus, setPauschalAus] = useState<string | null>(null);
  /** Stammt die Vorschau aus einer Einheitspreis-Baustelle (M16)? Dann gilt der Hinweis zum Aufmaß. */
  const [nachAufmass, setNachAufmass] = useState(false);
  /** Anteil vom angenommenen Angebot für eine Anzahlung (M20). */
  const [anzahlungProzent, setAnzahlungProzent] = useState<number | null>(ANZAHLUNG_PROZENT_VORGABE);
  /** Die letzte Anzahlung entstand ohne angenommenes Angebot — Betrag von Hand. */
  const [anzahlungOhneAngebot, setAnzahlungOhneAngebot] = useState(false);
  /*
    Die unterschriebenen Scheine des Betriebs — für die Frage, welche Leistung
    noch auf keiner Rechnung steht. Einmal geladen, nicht abonniert: die
    Antwort ändert sich im Takt von Tagen, nicht von Sekunden, und ein
    zweiter laufender Zuhörer kostete auf einer Baustelle Verbindung für
    nichts.
  */
  const [scheineAllerBaustellen, setScheineAllerBaustellen] = useState<WithId<WorkSheet>[]>([]);
  /*
    Welche dieser Scheine auf einer gültigen Rechnung stehen — aus der
    Abdeckung ALLER Rechnungen, nicht aus den geladenen (Prüflauf 25.09.2026,
    P2-03). `null`: noch nicht bekannt oder nicht geladen.
  */
  const [scheineVerrechnet, setScheineVerrechnet] = useState<string[] | null>(null);
  const [abdeckungFehler, setAbdeckungFehler] = useState(false);
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
  /**
   * Zahlungen des Zeitraums samt ihren Rechnungen — für den eigenen
   * Zahlungsstapel (Testbericht 30.09.2026, H7 vorgebaut). `null`: nicht
   * geladen; der Rechnungsstapel hängt nicht davon ab.
   */
  const [exportZahlungen, setExportZahlungen] = useState<{
    zahlungen: Zahlungseingang[];
    rechnungen: WithId<Invoice>[];
  } | null>(null);
  /** Schlussrechnungen ohne Abzug ihrer Anzahlung — geholt mit dem Zeitraum (K2). */
  const [ohneAbzug, setOhneAbzug] = useState<SchlussOhneAbzug[]>([]);
  /*
    Der Kontenrahmen des Betriebs — ohne ihn gibt es keinen Buchungsstapel.
    Er wird einmal geladen und nicht abonniert: er ändert sich einmal beim
    Einrichten und danach so gut wie nie.
  */
  const [konten, setKonten] = useState<Buchungskonto[]>([]);
  const [exportLaeuft, setExportLaeuft] = useState(false);
  const [exportFehler, setExportFehler] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [toCancel, setToCancel] = useState<WithId<Invoice> | null>(null);
  /** Welcher Storno gerade aufgehoben werden soll — erst nach der Rückfrage. */
  const [aufheben, setAufheben] = useState<WithId<Invoice> | null>(null);
  /** Zu welchem Storno die Stornorechnung erst ausgestellt werden soll — nach der Rückfrage. */
  const [stornoBeleg, setStornoBeleg] = useState<WithId<Invoice> | null>(null);
  const [cancelNote, setCancelNote] = useState('');
  const [statusFilter, setStatusFilter] = useState<'alle' | Invoice['paymentStatus']>('alle');
  const schreibtisch = useSchreibtisch();
  /*
    DER FILTER KANN AUS DER ADRESSE KOMMEN — die Startseite verlinkt ihre
    Kachel „Überfällig" hierher. Ohne das landete man in der vollen Liste und
    musste die Rechnungen, deren Summe man eben gesehen hat, selbst suchen.
    Nur bekannte Werte: ein Tippfehler in der Adresse filtert nicht auf
    „nichts", sondern zeigt alle.
  */
  const [suchparameter] = useSearchParams();
  const statusAusAdresse = suchparameter.get('status');
  const sicht = bekannt(RECHNUNGS_SICHTEN, suchparameter.get('sicht'));
  useEffect(() => {
    if (statusAusAdresse && (FILTERSTATI as readonly string[]).includes(statusAusAdresse)) {
      setStatusFilter(statusAusAdresse as Invoice['paymentStatus']);
    }
  }, [statusAusAdresse]);
  /*
    DER ZAHLUNGSDIALOG. Er hängt an EINER Rechnung und lädt deren Eingänge
    beim Öffnen — nicht beim Laden der Liste. Dreihundert Rechnungen mal ihre
    Zahlungen wären dreihundert Abfragen für eine Ansicht, die in den meisten
    Fällen niemand aufklappt.
  */
  const [zahlungFuer, setZahlungFuer] = useState<(Invoice & { id: string }) | null>(null);
  const [zahlungen, setZahlungen] = useState<WithId<Zahlungseingang>[] | null>(null);
  const [zDatum, setZDatum] = useState(todayStr());
  const [zBetrag, setZBetrag] = useState('');
  const [zArt, setZArt] = useState<Zahlungseingang['art']>('Überweisung');
  const [zSkonto, setZSkonto] = useState(false);
  const [zHinweis, setZHinweis] = useState('');
  /**
   * Eingang vom Kunden oder Rückzahlung an ihn (Testbericht 30.09.2026, M21).
   * Die Rückzahlung wird positiv eingetragen und negativ gebucht.
   */
  const [zRichtung, setZRichtung] = useState<'eingang' | 'rueckzahlung'>('eingang');
  const [zLoeschen, setZLoeschen] = useState<string | null>(null);
  const [zFehler, setZFehler] = useState<string | null>(null);
  /*
    DIE SUCHE KANN AUS DER ADRESSE KOMMEN — die Kundenakte verlinkt eine
    Rechnung hierher, mit ihrer Nummer als Suchbegriff.
  */
  const [rechnungSuche, setRechnungSuche] = useState(() => suchparameter.get('suche') ?? '');
  /**
   * Die Treffer der Suche über ALLE Rechnungen — `null`, solange keine läuft
   * oder die Antwort noch aussteht.
   */
  const [treffer, setTreffer] = useState<{ begriff: string; zeilen: WithId<Invoice>[] } | null>(null);
  const [suchFehler, setSuchFehler] = useState(false);
  /** Anfangs sichtbare Rechnungen; der Rest kommt auf Wunsch. */

  // Entwurf
  const [projectNumber, setProjectNumber] = useState('');
  /*
    DIE ART WIRD VOR DEM ZUSAMMENSTELLEN GEWÄHLT, nicht danach.

    Sie entscheidet, WORAUS die Vorschau entsteht: eine Anzahlung kommt nicht
    aus Zeiteinträgen, es gibt noch keine. Nachträglich umzustellen hiesse,
    die Positionen unter der Hand auszutauschen.
  */
  const [artWahl, setArtWahl] = useState<RechnungsArt>('einzel');
  /** Rechnungen dieser Baustelle, die sich noch abziehen lassen. */
  const [abzugsfaehig, setAbzugsfaehig] = useState<WithId<Invoice>[]>([]);
  const [gewaehlteAbzuege, setGewaehlteAbzuege] = useState<string[]>([]);
  /*
    Scheitert die Abfrage, wird sie NICHT verschwiegen: eine Schlussrechnung
    ohne ihre Anzahlungen weist dieselbe Steuer zweimal aus (§ 11 Abs 12
    UStG), und der Betrieb schuldet sie zweimal, bis er berichtigt.
  */
  const [abzugFehler, setAbzugFehler] = useState(false);
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
  /** Die Bestellnummer des Kunden (seit 05.10.2026) — optional, gedruckt. */
  const [bestellnummer, setBestellnummer] = useState('');
  /** Eine in der Rechnung korrigierte UID auch in den Kundenstamm schreiben (M10). */
  const [uidInKunden, setUidInKunden] = useState(false);
  /** Grund der Steuerbefreiung — nur bei 0 % ohne Reverse Charge (A2). */
  const [steuerbefreiung, setSteuerbefreiung] = useState('');
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
  /** Die Rechnung, deren Detailansicht offen ist (M19). */
  const [detailFuer, setDetailFuer] = useState<WithId<Invoice> | null>(null);
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
  /**
   * Der Kunde zu einer Baustelle — über die Verknüpfung, sonst über den
   * Namen, aber nur, wenn der Name eindeutig ist. Zwei „Familie Huber" im
   * Stamm, und die Rechnung ginge an die Anschrift der falschen.
   */
  function kundeZu(customerId: string | undefined, name: string | undefined) {
    const verknuepft = customerId ? kunden.find((k) => k.id === customerId) : undefined;
    if (verknuepft) return verknuepft;
    const gesucht = (name ?? '').trim().toLowerCase();
    if (!gesucht) return undefined;
    const treffer = kunden.filter((k) => k.name.trim().toLowerCase() === gesucht);
    return treffer.length === 1 ? treffer[0] : undefined;
  }
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
    setSteuerbefreiung(company?.steuerbefreiungVorgabe ?? '');
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
    /*
      Der Kontenrahmen entscheidet, ob es den Buchungsstapel überhaupt gibt.
      Scheitert er, bleibt die Liste leer — dann wird der Knopf nicht
      angeboten, statt einen Stapel ohne Konten zu versprechen.
    */
    buchungskonten(user.companyId).then(setKonten).catch(() => setNebenFehler('Der Kontenrahmen'));
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
    listRecentWorkSheets(user.companyId, UNVERRECHNET_BASIS)
      .then(async (rows) => {
        if (weg) return;
        setScheineAllerBaustellen(rows);
        /*
          OB EIN SCHEIN VERRECHNET IST, SAGT DIE ABDECKUNG — über alle
          Rechnungen (P2-03). Vorher wurde das aus den fünfzig jüngsten und
          den offenen Rechnungen geschlossen; ein Schein auf einer älteren,
          längst bezahlten stand dann als „nicht verrechnet" da. Kommt die
          Antwort nicht, bleibt die Karte weg und eine Zeile sagt warum.
        */
        try {
          const verrechnet = await scheineAufRechnung(user.companyId, rows.map((r) => r.id));
          if (!weg) {
            setScheineVerrechnet(verrechnet);
            setAbdeckungFehler(false);
          }
        } catch {
          if (!weg) setAbdeckungFehler(true);
        }
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
  /*
    GESUCHT WIRD ÜBER ALLE RECHNUNGEN, auf dem Server. Bis die Antwort da ist
    (und falls sie ausbleibt), filtert die Liste das bereits Geladene — so
    steht beim Tippen sofort etwas da.
  */
  const suchbegriff = rechnungSuche.trim();
  useEffect(() => {
    if (!user || !suchbegriff) {
      setSuchFehler(false);
      return;
    }
    let weg = false;
    const zeit = setTimeout(() => {
      sucheRechnungen(user.companyId, suchbegriff)
        .then((zeilen) => {
          if (weg) return;
          setTreffer({ begriff: suchbegriff, zeilen });
          setSuchFehler(false);
        })
        .catch(() => {
          if (!weg) setSuchFehler(true);
        });
    }, 300);
    return () => {
      weg = true;
      clearTimeout(zeit);
    };
    // `invoices` als Auslöser: nach einer Zahlung oder einem Storno zeigen
    // die Treffer den neuen Stand, nicht den vom Tippen.
  }, [user, suchbegriff, invoices]);

  const serverTreffer = useMemo(
    () =>
      treffer && suchbegriff && treffer.begriff === suchbegriff
        ? [...treffer.zeilen].sort((a, b) => b.invoiceNumber.localeCompare(a.invoiceNumber))
        : null,
    [treffer, suchbegriff],
  );

  const visible = useMemo(() => {
    const heute = todayStr();
    const q = suchbegriff.toLowerCase();
    const grund = !q
      ? sorted
      : serverTreffer ??
        sorted.filter((i) =>
          [i.invoiceNumber, i.customerName, i.projectNumber].some((v) =>
            v?.toLowerCase().includes(q),
          ),
        );
    return statusFilter === 'alle'
      ? grund
      : grund.filter((i) =>
          // „Überfällig" zeigt auch die angezahlten, deren Ziel vorbei ist.
          statusFilter === 'Überfällig' ? istUeberfaellig(i, heute) : i.paymentStatus === statusFilter,
        );
  }, [sorted, statusFilter, suchbegriff, serverTreffer]);
  /*
    DIE KENNZAHLEN RECHNEN MIT DEM REST, nicht mit dem Rechnungsbetrag.

    „Offen" beantwortet die Frage, wie viel Geld noch kommen muss. Solange
    dort Bruttobeträge standen, war die Zahl bei jeder Teilzahlung zu hoch —
    und zwar genau um das, was schon da war. „Teilbezahlt" zählt deshalb mit
    seinem Rest unter „Offen" (bzw. „Überfällig", wenn die Frist abgelaufen
    ist); eine eigene vierte Kachel wäre eine Unterscheidung ohne Folge.

    „Bezahlt" ist dagegen die Summe des tatsächlich EINGEGANGENEN Geldes über
    alle Rechnungen — auch die Teilzahlung auf eine noch offene. Sie als Summe
    der vollständig bezahlten Rechnungen zu führen hiesse, das Geld erst zu
    zählen, wenn der letzte Cent da ist.
  */
  /*
    „OFFEN" UND „ÜBERFÄLLIG" ÜBER ALLE UNBEZAHLTEN, nicht über die fünfzig
    jüngsten (Prüflauf 25.09.2026, P2-12). Die älteste offene Forderung ist
    ausgerechnet die, die aus der Arbeitsliste zuerst herausfällt — die
    Kennzahl war damit genau um das Geld zu niedrig, dem man am längsten
    nachläuft. Grundlage sind die offenen Forderungen vom Server; eine
    Rechnung, die die Arbeitsliste auch kennt, zählt mit ihrem Stand von
    dort, weil der live nachgezogen wird (eine eben erfasste Zahlung).

    „BEZAHLT" hat keine solche Quelle — eine Summe über alle Zahlungen des
    Betriebs gibt es nicht. Die Zahl bleibt, sagt aber dazu, worüber sie
    gerechnet ist.
  */
  /*
    „BEZAHLT IM LAUFENDEN MONAT“ (Testbericht 30.09.2026, G27). Die alte Zahl
    summierte die Zahlungen auf die zuletzt geladenen Rechnungen — welcher
    Zeitraum, blieb offen, und die Zahl änderte sich mit „Ältere laden“.
    Jetzt: die Zahlungseingänge vom Monatsersten bis heute, nach
    Wertstellung, ohne Skonto (das ist kein Geld), Rückzahlungen abgezogen.
    Neu geholt, sobald sich an den Rechnungen etwas bewegt.
  */
  const [bezahltImMonat, setBezahltImMonat] = useState<number | null>(null);
  const monatsErster = `${todayStr().slice(0, 7)}-01`;
  useEffect(() => {
    if (!user) return;
    let weg = false;
    listZahlungenImZeitraum(user.companyId, monatsErster, todayStr())
      .then((z) => {
        if (weg) return;
        // Zahlungen auf eine stornierte Rechnung sind Guthaben des Kunden, keine
        // beglichene Forderung (Launch-Check, M13) — sie zählen hier nicht.
        const storniert = new Set(invoices.filter((i) => i.paymentStatus === 'Storniert').map((i) => i.id));
        const summe = z
          .filter((x) => x.art !== 'Skonto' && !storniert.has(x.invoiceId))
          .reduce((s, x) => s + (Number(x.betrag) || 0), 0);
        setBezahltImMonat(Math.round(summe * 100) / 100);
      })
      .catch(() => { if (!weg) setBezahltImMonat(null); });
    return () => { weg = true; };
  }, [user, monatsErster, invoices]);

  const stats = useMemo(() => {
    let offen = 0;
    let ueberfaellig = 0;
    let bezahlt = 0;
    const heute = todayStr();
    const unbezahlt = new Map(offeneRechnungen.map((i) => [i.id, i]));
    for (const i of invoices) unbezahlt.set(i.id, i);
    for (const i of unbezahlt.values()) {
      const stand = zahlstand(i);
      // Nach dem ZIEL, nicht nach dem Stand — siehe `istUeberfaellig`.
      if (istUeberfaellig(i, heute)) ueberfaellig += stand.rest;
      else if (i.paymentStatus !== 'Storniert') offen += stand.rest;
    }
    for (const i of invoices) {
      const stand = zahlstand(i);
      /*
        OHNE GUTHABEN (Launch-Check, M13). Die 200 € auf der stornierten
        RE-2026-1500 standen unter „Bezahlt" — sie gehören dem Kunden zurück.
        Dasselbe gilt für den Überschuss einer überzahlten Rechnung. Gezählt
        wird, was eine Forderung beglichen hat.
      */
      bezahlt += stand.bezahlt - stand.guthaben;
    }
    const runde = (n: number) => Math.round(n * 100) / 100;
    return { offen: runde(offen), ueberfaellig: runde(ueberfaellig), bezahlt: runde(bezahlt) };
  }, [invoices, offeneRechnungen]);

  /**
   * Den Zahlungsdialog öffnen.
   *
   * DER RESTBETRAG STEHT VORAUSGEFÜLLT DA, weil er in den allermeisten Fällen
   * der richtige ist: der Kunde überweist, was auf der Rechnung steht.
   * Änderbar bleibt er trotzdem — sonst wäre die Teilzahlung, wegen der es
   * diesen Dialog gibt, die mühsamste Eingabe darin.
   */
  const zahlungOeffnen = async (inv: Invoice & { id: string }) => {
    setZahlungFuer(inv);
    setZahlungen(null);
    setZFehler(null);
    setZLoeschen(null);
    setZDatum(todayStr());
    setZArt('Überweisung');
    setZHinweis('');
    setZSkonto(false);
    const { rest, guthaben } = zahlstand(inv);
    /*
      EIN GUTHABEN WILL ZURÜCK (M21). Steht eines offen, ist die Rückzahlung
      vorgewählt und der Betrag eingesetzt — das war der Fall aus dem Bericht:
      200 € auf der stornierten RE-2026-1500, und kein Weg, sie zu buchen.
    */
    if (guthaben > 0) {
      setZRichtung('rueckzahlung');
      setZBetrag(zahlAlsText(guthaben));
      setZHinweis('Rückzahlung des Guthabens');
    } else {
      setZRichtung('eingang');
      setZBetrag(rest > 0 ? String(rest) : '');
    }
    try {
      setZahlungen(await listZahlungen(inv.companyId, inv.id));
    } catch {
      /*
        HIER IST STILLE FALSCH. Eine leere Liste sähe aus wie „keine Zahlung
        erfasst" — und genau darauf würde jemand eine zweite Mahnung stützen.
      */
      setZFehler('Die bisherigen Zahlungen konnten nicht geladen werden.');
    }
  };

  /*
    DER KOPF DES DIALOGS RECHNET MIT DEN EINGÄNGEN, DIE ER ZEIGT (Launch-
    Check, M14). Er las den Stand der Rechnung vom Öffnen: nach einer
    Teilzahlung über 200 € stand darüber weiter „offen € 504,00". Solange die
    Liste noch lädt, gilt der Stand der Rechnung.
  */
  const zahlungsStand = zahlungFuer
    ? zahlungen
      ? { ...zahlungFuer, bezahltBetrag: Math.round(zahlungen.reduce((s, z) => s + z.betrag, 0) * 100) / 100 }
      : zahlungFuer
    : null;

  /*
    DER SKONTO WIRD ANGEBOTEN, NICHT GEBUCHT. Passt die Zahlung zur Zusage —
    in der Frist, und der Rest nicht mehr als der Skonto —, steht ein Haken
    da; gesetzt wird er bewusst. Die Skonto-Summe kommt aus derselben Liste
    wie der Kopf.
  */
  const zGuthaben = zahlungsStand ? zahlstand(zahlungsStand).guthaben : 0;
  const skontoAngebot = zahlungsStand && zArt !== 'Skonto' && zRichtung === 'eingang'
    ? skontoZumAusgleich(
      {
        ...zahlungsStand,
        skontoBetrag: zahlungen
          ? Math.round(zahlungen.filter((z) => z.art === 'Skonto').reduce((s, z) => s + z.betrag, 0) * 100) / 100
          : zahlungsStand.skontoBetrag,
      },
      zDatum,
      zahlOder(zBetrag, NaN, { negativ: true }),
    )
    : null;

  const zahlungSpeichern = async () => {
    if (!zahlungFuer || !user) return;
    const rueck = zRichtung === 'rueckzahlung';
    const gelesen = leseZahl(zBetrag, { negativ: !rueck });
    if (gelesen.fehler) {
      setZFehler(gelesen.fehler);
      return;
    }
    const eingetragen = gelesen.wert ?? 0;
    if (!Number.isFinite(eingetragen) || eingetragen === 0) {
      setZFehler(rueck ? 'Eine Rückzahlung über null ist keine.' : 'Ein Betrag von null ist kein Zahlungseingang.');
      return;
    }
    /*
      ZURÜCK GEHT HÖCHSTENS DAS GUTHABEN (M21). Danach ist es erledigt; mehr
      zurückzuzahlen hiesse, eine neue Forderung des Kunden zu erfinden. Wer
      eine Rücklastschrift buchen will, trägt sie als Eingang mit Minus ein.
    */
    if (rueck && Math.round(eingetragen * 100) > Math.round(zGuthaben * 100)) {
      setZFehler(`Zurückzuzahlen sind höchstens ${euro(zGuthaben)} — das Guthaben des Kunden.`);
      return;
    }
    const betrag = rueck ? -eingetragen : eingetragen;
    const zahlung = {
      invoiceId: zahlungFuer.id,
      datum: zDatum,
      betrag: Math.round(betrag * 100) / 100,
      art: zArt,
      hinweis: zHinweis.trim() || undefined,
      erfasstVon: user.uid,
      erfasstVonName: user.name,
    };
    if (zSkonto && skontoAngebot) {
      await createZahlungMitSkonto(zahlungFuer.companyId, zahlung, skontoAngebot);
    } else {
      await createZahlung(zahlungFuer.companyId, zahlung);
    }
    setZahlungen(await listZahlungen(zahlungFuer.companyId, zahlungFuer.id));
    setZBetrag('');
    setZHinweis('');
    setZSkonto(false);
    setZFehler(null);
    setZRichtung('eingang');
    toast.success(rueck ? 'Rückzahlung gebucht' : 'Zahlung erfasst');
  };

  const numberTaken = invoiceNumber !== '' && isInvoiceNumberTaken(invoices, invoiceNumber);
  /** Noch keine einzige Rechnung — nur dann darf die Nummer an den alten Kreis anschliessen. */
  const ersteRechnung = !loading && invoices.length === 0;

  /**
   * Rechnet jemand parallel ab, ist der angezeigte Vorschlag im selben Moment
   * überholt. Solange das Feld unangetastet ist, zieht es einfach nach —
   * sonst stünde dort eine rote Meldung „bereits vergeben" über einer Nummer,
   * die der Nutzer nie selbst gewählt hat, und der Knopf bliebe gesperrt.
   */
  useEffect(() => {
    if (!preview || !suggestedNumber) return;
    if (invoiceNumber.trim() !== suggestedNumber) return; // von Hand gesetzt
    const aktuell = nextInvoiceNumber(invoices, vorsaetze.rechnung);
    if (aktuell !== suggestedNumber) {
      setSuggestedNumber(aktuell);
      setInvoiceNumber(aktuell);
    }
  }, [invoices, preview, suggestedNumber, invoiceNumber, vorsaetze.rechnung]);

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
  const uidFormFehler = uidFehler(kundenUid);
  const kundeDerVorschau = (() => {
    const p = projects.find((x) => x.projectNumber === projectNumber);
    return p ? kundeZu(p.customerId, p.customerName) : undefined;
  })();
  const uidWeichtAb =
    !!kundeDerVorschau && !!uidNormalisieren(kundenUid) && !uidFormFehler
    && uidNormalisieren(kundenUid) !== uidNormalisieren(kundeDerVorschau.vatId);
  /*
    OHNE STEUER UND OHNE ÜBERGANG: der Grund gehört auf den Beleg (§ 11 Abs 1
    Z 3 lit e UStG, offene Punkte A2). Er sperrt den Knopf wie die fehlende
    UID bei Reverse Charge — die Datenbank weist ihn ohnehin ab.
  */
  const brauchtBefreiung = satz === 0 && !reverseCharge;
  const befreiungFehlt = brauchtBefreiung && !steuerbefreiung.trim();
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
    const v = zahlOder(discount.value, 0);
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
    setPauschalAus(null);
    setNachAufmass(false);
    try {
      /*
        EINE ANZAHLUNG KOMMT NICHT AUS DEN ZEITEINTRÄGEN — es gibt noch keine.

        Sie ist Geld auf eine Leistung, die erst kommt; sie verbraucht deshalb
        auch keine Belege. Genau daran hängt später der Abzug: nur eine
        Rechnung, die nichts verbraucht hat, darf die Schlussrechnung kürzen.
        Stünden hier Stunden drin, wären sie als verrechnet markiert, fielen
        aus der Schlussrechnung heraus — und der Abzug zöge sie ein zweites
        Mal ab.

        Der Betrag steht auf null und ist in der Positionszeile zu setzen. Die
        Null ist dort rot: sie sieht aus wie ein Preis, ist aber eine fehlende
        Entscheidung.
      */
      if (art === 'anzahlung') {
        /*
          ALS ANTEIL VOM ANGEBOT (Testbericht 30.09.2026, M20): mit einem
          angenommenen Angebot steht der Betrag schon da, und der
          voraussichtliche Zeitraum kommt aus Beginn und Ende der Baustelle.
          Ohne Angebot bleibt es bei der Null — siehe `anzahlung.ts`.
        */
        const baustelle = projects.find((x) => x.projectNumber === projectNumber);
        const angebote = baustelle?.id ? await listQuotesForProject(user.companyId, baustelle.id) : [];
        const angebot = pauschalAngebot(angebote);
        setAnzahlungOhneAngebot(!angebot);
        await vorschauUebernehmen(
          anzahlungVorschau({ angebot, prozent: anzahlungProzent, baustelle, vatRate: satz }),
        );
        return;
      }
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
      /*
        WAS SCHON VERRECHNET IST, KOMMT AUS ALLEN RECHNUNGEN DER BAUSTELLE
        (Prüflauf 25.09.2026, P2-03) — nicht aus den fünfzig jüngsten, die
        die Liste gerade zeigt. Stand ein Schein auf einer älteren Rechnung,
        kam sein Material sonst ein zweites Mal auf die Rechnung. Kommt die
        Abfrage nicht, entsteht keine Vorschau: eine, die doppelt verrechnen
        könnte, ist schlechter als keine.
      */
      const [entries, scheine, katalog, derBaustelle] = await Promise.all([
        listEntriesForProjects(user.companyId, [projectNumber]),
        listWorkSheetsForProject(user.companyId, projectNumber).catch(() => {
          setNebenFehler('Die Handwerksscheine');
          return [];
        }),
        listMaterials(user.companyId).catch(() => {
          setNebenFehler('Der Materialkatalog');
          return [];
        }),
        listInvoicesForProject(user.companyId, projectNumber).catch(() => null),
      ]);
      if (!derBaustelle) {
        setPreview(null);
        setError(
          'Die bisherigen Rechnungen dieser Baustelle konnten nicht geladen werden. Ohne sie lässt '
            + 'sich nicht ausschließen, dass Material ein zweites Mal verrechnet wird — bitte noch '
            + 'einmal zusammenstellen.',
        );
        return;
      }
      setKatalogUnvollstaendig(katalogAbgeschnitten(katalog));
      const assembled = assembleInvoice(projectNumber, entries, rates, {
        scheine,
        katalog,
        // Was auf einer bestehenden Rechnung steht, kommt nicht noch einmal.
        // Ein STORNIERTER Beleg zaehlt dabei nicht — sein Material ist wieder
        // offen.
        bereitsVerrechnet: verrechneteScheine(derBaustelle),
      }, nachtzeitVon(company));
      /*
        PAUSCHALBAUSTELLE: das Angebot ist die Rechnung, nicht die Stunden
        (Launch-Check, K3 — siehe `pauschale.ts`). Auch ohne eine einzige
        gebuchte Stunde: eine Pauschale lässt sich verrechnen, bevor der
        Monteur fertig gebucht hat.
      */
      const baustelle = projects.find((x) => x.projectNumber === projectNumber);
      if (baustelle?.billingMode === 'Pauschal' || baustelle?.billingMode === 'Einheitspreis') {
        const einheitspreis = baustelle.billingMode === 'Einheitspreis';
        const angebote = baustelle.id
          ? await listQuotesForProject(user.companyId, baustelle.id)
          : [];
        const schon = art === 'teil' ? null : pauschaleVerrechnetMit(derBaustelle, projectNumber);
        if (schon) {
          setPreview(null);
          setError(
            einheitspreis
              ? `Einheitspreisbaustelle: die Leistung ist mit ${schon} bereits verrechnet. Ein weiteres Aufmaß geht als eigene Rechnung nach Vereinbarung — oder wer die Baustelle in der Akte auf „Regie“ stellt.`
              : `Pauschalbaustelle: die Pauschale ist mit ${schon} bereits verrechnet. Stunden und Material danach sind darin enthalten. Mehrarbeit außerhalb des Angebots verrechnet, wer die Baustelle in der Akte auf „Regie“ stellt — oder als eigene Rechnung nach Vereinbarung.`,
          );
          return;
        }
        const angebot = pauschalAngebot(angebote);
        setPauschalAus(angebot ? `${angebot.quoteNumber} (${euro(angebot.totalNetto)} netto)` : '');
        setNachAufmass(einheitspreis);
        await vorschauUebernehmen(
          einheitspreis
            ? einheitspreisVorschau(art, assembled, angebot, satz)
            : pauschalVorschau(art, assembled, angebot, satz),
        );
        return;
      }
      if (assembled.positions.length === 0) {
        setPreview(null);
        setError('Keine offenen Stunden und kein offenes Material für diese Baustelle.');
        return;
      }
      await vorschauUebernehmen(assembled);
    } catch {
      setError('Die Positionen konnten nicht geladen werden.');
    } finally {
      setBusy(false);
    }
  }

  /**
   * Der gemeinsame Schluss jeder Vorschau — gleich, woraus sie entstanden ist.
   *
   * Hier wird auch geholt, was sich abziehen lässt. Das gehört NEBEN die
   * Positionen und nicht in die Rechnungsliste der Ansicht: abgezogen wird
   * eine Anzahlung, die der Kunde längst bezahlt hat. Sie steht damit weder in
   * den offenen Posten noch verlässlich unter den jüngsten Rechnungen.
   */
  async function vorschauUebernehmen(assembled: AssembledInvoice) {
    /*
      STEUERSATZ UND RABATT GELTEN AUCH FÜR EINE NEU ZUSAMMENGESTELLTE
      VORSCHAU. `assembleInvoice` rechnet mit dem Satz des Betriebs; war
      „Bauleistung“ (Reverse Charge) schon angehakt oder ein Rabatt
      eingetragen, stand danach USt im Betrag bzw. der Rabatt nur im Formular
      — gespeichert wurde eine Rechnung, die dem Formular widersprach
      (Prüflauf 25.09.2026, P2-01).

      Bringt die Vorschau ihren eigenen Rabatt mit (die Pauschale aus dem
      Angebot), steht er ab jetzt auch im Rabattfeld. Vorher ging er bei der
      ersten Änderung einer Position verloren (P2-09).
    */
    const eigenerRabatt = assembled.discount;
    if (eigenerRabatt) {
      setDiscount({
        mode: eigenerRabatt.mode,
        // Ein Textfeld mit zentraler Lesung (M15): mit Komma, wie man schreibt.
        value: zahlAlsText(eigenerRabatt.value),
        label: eigenerRabatt.label ?? '',
      });
    }
    setPreview(recalc(assembled, assembled.positions, satz, eigenerRabatt ?? rabatt));
    setLeistungVon(assembled.leistung?.von ?? '');
    setLeistungBis(assembled.leistung?.bis ?? '');
    setGewaehlteAbzuege([]);
    if (!user) return;
    try {
      const derBaustelle = await listInvoicesForProject(user.companyId, projectNumber);
      const abziehbare = abziehbar(derBaustelle, projectNumber);
      setAbzugsfaehig(abziehbare);
      /*
        OHNE ZEITRAUM AUS DEN SCHEINEN: der aus der Anzahlung (N3). Sie trägt
        „Leistung geplant von–bis“; eine Schlussrechnung mit leerem Feld
        müsste das Büro sonst von Hand abschreiben.
      */
      if (!assembled.leistung) {
        const ausAnzahlung = leistungAusVorrechnungen(abziehbare);
        if (ausAnzahlung) {
          setLeistungVon((v) => v || ausAnzahlung.von);
          setLeistungBis((b) => b || ausAnzahlung.bis);
        }
      }
      setAbzugFehler(false);
    } catch {
      setAbzugsfaehig([]);
      setAbzugFehler(true);
    }
    /*
      Die UID aus den Kundenstammdaten vorbelegen — über den Namen, wie es
      der Buchhaltungs-Export auch tut. Bei verknüpften Baustellen ist er
      aus den Stammdaten kopiert und damit verlässlich gleich geschrieben.
      Findet sich nichts, bleibt das Feld leer und will ausgefüllt werden.
    */
    const baustelle = projects.find((x) => x.projectNumber === projectNumber);
    const treffer = kundeZu(baustelle?.customerId, baustelle?.customerName);
    setKundenUid(treffer?.vatId?.trim() ?? '');
    setUidInKunden(false);
    /*
      DIE BESTELLNUMMER DER LETZTEN RECHNUNG DIESER BAUSTELLE vorbelegen.
      Anzahlung, Teil- und Schlussrechnung gehen auf dieselbe Bestellung;
      sie viermal abzutippen wäre viermal die Gelegenheit für einen Zahlendreher.
    */
    const letzte = invoices
      .filter((r) => r.projectNumber === projectNumber && r.bestellnummer?.trim())
      .sort((x, y) => (y.invoiceDate ?? '').localeCompare(x.invoiceDate ?? ''))[0];
    setBestellnummer(letzte?.bestellnummer?.trim() ?? '');
    const vorschlag = nextInvoiceNumber(invoices, vorsaetze.rechnung);
    setSuggestedNumber(vorschlag);
    setInvoiceNumber(vorschlag);
  }

  async function confirmInvoice() {
    if (!user || !company || !preview || !summen || !invoiceNumber || numberTaken || leer) return;
    // Eine UID in falscher Form kommt nicht auf den Beleg (M10); die
    // Datenbank weist sie ebenso ab.
    const uidFalsch = uidFehler(kundenUid);
    if (uidFalsch) {
      setError(uidFalsch);
      return;
    }
    // Eine Menge oder ein Preis, der sich nicht lesen lässt, steht nicht still
    // als letzte lesbare Zahl auf der Rechnung (M15).
    const unlesbar = unlesbareZahlIn(document);
    if (unlesbar) {
      setError(unlesbar);
      return;
    }
    /*
      EINE NEGATIVE SCHLUSSRECHNUNG IST EINE GUTSCHRIFT, und die gibt es hier
      noch nicht: Zahlungsstand, offene Posten und Mahnlauf rechnen alle mit
      einer Forderung, die man begleichen kann. Abgewiesen statt auf null
      gekappt — gekappt verschwände der Betrag, den der Betrieb dem Kunden
      zurückschuldet, lautlos und zu seinen Gunsten. Die Datenbank weist es
      ebenso ab; hier steht der Grund, bevor die Nummer verbraucht ist.
    */
    if (summen.gutschrift) {
      setError(
        'Die abgezogenen Rechnungen übersteigen die Gesamtleistung. Das wäre eine Gutschrift, '
          + 'und die kann diese App noch nicht — bitte im Büro von Hand klären.',
      );
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const project = projects.find((p) => p.projectNumber === projectNumber);
      const invoiceDate = todayStr();
      const due = new Date();
      due.setDate(due.getDate() + rates.dueDays);
      const dueDate = localDateStr(due);
      const skonto = skontoBedingung({
        prozent: rates.skontoProzent,
        tage: rates.skontoTage,
        rechnungsdatum: invoiceDate,
        zahlungsziel: dueDate,
        art,
      });

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
       *
       * NUMMER, SPERRE UND RECHNUNG IN EINEM AUFRUF (Prüflauf 25.09.2026,
       * P2-04). Vorher waren es drei: Nummer ziehen, Zeiteinträge sperren,
       * anlegen. Ein Abbruch dazwischen hinterliess eine verbrauchte Nummer
       * und gesperrte Stunden ohne Rechnung, und zwei gleichzeitige
       * Abrechnungen verrechneten dieselben Stunden. Jetzt geht alles ganz
       * durch oder gar nicht — und ein Beleg, der inzwischen auf einer
       * anderen Rechnung steht, bricht das Anlegen ab.
       */
      const typedSeq = invoiceSeqOf(invoiceNumber);
      const vonHand = ersteRechnung && invoiceNumber.trim() !== suggestedNumber && typedSeq != null;
      /*
        AN DEN KUNDEN, NICHT AN DIE BAUSTELLE (Prüflauf 25.09.2026, P2-02).
        Als Empfänger stand die Anschrift der Baustelle — die Hausverwaltung
        bekam ihre Rechnung an die Mietwohnung. Jetzt die Anschrift aus dem
        Kundenstamm, wie beim Angebot, und die Baustelle als „Ort der
        Leistung" daneben. Ohne Kunden im Stamm bleibt es, wie es war.
      */
      const kunde = kundeZu(project?.customerId, project?.customerName);
      const uidNeu = uidNormalisieren(kundenUid);
      const uidUebernehmen =
        uidInKunden && !!kunde && !!uidNeu && uidNeu !== uidNormalisieren(kunde.vatId);
      const anschrift = kunde?.address?.trim() || project?.address || '';
      const baustellenOrt = project?.address?.trim();
      const leistungsort =
        baustellenOrt && baustellenOrt !== anschrift.trim() ? baustellenOrt : undefined;
      const { invoiceNumber: reserved } = await rechnungAusstellen(user.companyId, {
        projectNumber,
        customerName: project?.customerName ?? '–',
        address: anschrift,
        leistungsort,
        invoiceDate,
        dueDate,
        positions: preview.positions,
        vatRate: satz,
        reverseCharge,
        // Leerstring statt undefined: ein fehlendes Feld und ein leeres sind
        // beim Lesen dasselbe — und „nicht angegeben" ist eine Aussage.
        /*
          IMMER MITGESCHRIEBEN, nicht nur bei Reverse Charge. Vorher wurde die
          UID aus dem Kundenstamm geladen, im Formular angezeigt — und beim
          Speichern weggeworfen, sobald der Haken aus war. Über 10.000 € brutto
          ist sie Pflichtangabe (§ 11 Abs 1 Z 2 UStG); darunter schadet sie
          nicht und hilft dem Empfänger beim Zuordnen.
        */
        customerVatId: uidNormalisieren(kundenUid),
        steuerbefreiung: brauchtBefreiung ? steuerbefreiung.trim() : undefined,
        bestellnummer: bestellnummer.trim() || null,
        subtotalNetto: preview.subtotalNetto,
        // null statt undefined: „kein Rabatt" soll als bewusster Wert in der
        // Zeile stehen, nicht als fehlendes Feld.
        discount: rabatt,
        discountAmount: preview.discountAmount,
        /*
          DIE FORDERUNG IST DER REST, nicht die volle Leistung. Daran hängen
          offene Posten, Mahnlauf und Zahlungsstand: sie dürfen nicht
          einfordern, was der Kunde auf die Anzahlung längst bezahlt hat.

          Die volle Leistung steht getrennt daneben — sie gehört auf den
          Beleg und in keine Summe der offenen Forderungen. Ohne Abzug bleibt
          sie leer: sie wäre dieselbe Zahl, und die Datenbank weist eine
          zweite Wahrheit über denselben Betrag ab.
        */
        totalNetto: summen.totalNetto,
        totalVat: summen.totalVat,
        totalBrutto: summen.totalBrutto,
        art,
        vorrechnungen: abzuege.length > 0 ? abzuege : undefined,
        gesamtNetto: abzuege.length > 0 ? summen.gesamtNetto : undefined,
        gesamtVat: abzuege.length > 0 ? summen.gesamtVat : undefined,
        gesamtBrutto: abzuege.length > 0 ? summen.gesamtBrutto : undefined,
        skontoProzent: skonto?.skontoProzent ?? null,
        skontoBis: skonto?.skontoBis ?? null,
        paymentStatus: 'Offen',
        // Leerstring statt undefined: ein leeres Feld sagt ehrlich
        // „nicht angegeben".
        leistungVon,
        leistungBis,
        linkedEntries: preview.linkedEntries,
        linkedOrders: preview.linkedOrders,
        // Die Scheine, deren Material eingeflossen ist. Sie sind damit
        // verbraucht — bis diese Rechnung storniert wird.
        linkedWorkSheets: preview.linkedWorkSheets,
      }, {
        praefix: vorsaetze.rechnung,
        desired: vonHand ? typedSeq : undefined,
      });

      // jsPDF erst hier nachladen — es wiegt mehrere hundert Kilobyte und
      // gehoert nicht ins Paket, das jeder Monteur beim Anmelden zieht.
      const { downloadInvoicePdf } = await import('./pdf');
      downloadInvoicePdf({
        company,
        project: {
          customerName: project?.customerName ?? '–',
          address: anschrift,
          projectNumber,
        },
        leistungsort,
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
        // `assembled` trägt die volle Leistung; den Rest rechnet das PDF
        // daraus selbst — so können Beleg und Datensatz nicht auseinanderlaufen.
        art,
        vorrechnungen: abzuege,
        /*
          IMMER MITGESCHRIEBEN, nicht nur bei Reverse Charge. Vorher wurde die
          UID aus dem Kundenstamm geladen, im Formular angezeigt — und beim
          Speichern weggeworfen, sobald der Haken aus war. Über 10.000 € brutto
          ist sie Pflichtangabe (§ 11 Abs 1 Z 2 UStG); darunter schadet sie
          nicht und hilft dem Empfänger beim Zuordnen.
        */
        customerVatId: uidNormalisieren(kundenUid),
        steuerbefreiung: brauchtBefreiung ? steuerbefreiung.trim() : undefined,
        bestellnummer: bestellnummer.trim() || undefined,
        skonto,
      });

      setPreview(null);
      setProjectNumber('');
      setDiscount({ mode: 'percent', value: '', label: '' });
      setReverseCharge(false);
      setKundenUid('');
      setUidInKunden(false);
      setBestellnummer('');
      setArtWahl('einzel');
      setAbzugsfaehig([]);
      setGewaehlteAbzuege([]);
      toast.success(`Rechnung ${reserved} erstellt`);
      /*
        DIE KORRIGIERTE UID IN DEN KUNDEN (Testbericht 30.09.2026, M10) — nur
        auf Wunsch und erst, wenn die Rechnung steht. Schlägt es fehl, ist die
        Rechnung trotzdem richtig; gesagt wird es dennoch.
      */
      if (uidUebernehmen && kunde) {
        try {
          await updateCustomer(user.companyId, kunde.id, { vatId: uidNeu, kundenart: 'unternehmen' });
          setKunden((alle) =>
            alle.map((k) => (k.id === kunde.id ? { ...k, vatId: uidNeu, kundenart: 'unternehmen' } : k)),
          );
          toast.success(`UID ${uidNeu} beim Kunden ${kunde.name} gespeichert`);
        } catch (err) {
          toast.error(grundAus(err, 'Die UID konnte nicht beim Kunden gespeichert werden.'));
        }
      }
    } catch (e) {
      /*
        Die Datenbank sagt genau, woran es lag — welche Nummer belegt ist
        und welche frei wäre, oder dass ein Beleg inzwischen verrechnet ist.
        Diese Auskunft ist mehr wert als ein Sammelsatz. Angelegt und
        gesperrt ist in jedem Fall nichts: alles lief in einer Transaktion.
      */
      setError(
        grundAus(
          e,
          'Die Rechnung konnte nicht erstellt werden. Es ist nichts angelegt und nichts gesperrt — bitte erneut versuchen.',
        ),
      );
    } finally {
      setBusy(false);
    }
  }

  /** Der Kunde einer Rechnung im Stamm — über die Baustelle, sonst über den Namen. */
  function kundeDerRechnung(inv: Invoice) {
    return kundeZu(projects.find((p) => p.projectNumber === inv.projectNumber)?.customerId, inv.customerName);
  }

  /**
   * Die Verzugszinsen einer Mahnung — einmal gerechnet für Dialog und Beleg,
   * damit beide dieselbe Zahl tragen. Unternehmer ist, wer eine UID hat: auf
   * der Rechnung oder im Kundenstamm.
   */
  function istUnternehmer(inv: Invoice) {
    return istUnternehmerKunde(kundeDerRechnung(inv), inv.customerVatId);
  }

  function zinsenFuer(inv: Invoice, stufe: Mahnstufe, datum: string) {
    return verzugszinsen({
      stufe,
      rest: zahlstand(inv).rest,
      faellig: inv.dueDate,
      bis: datum,
      unternehmer: istUnternehmer(inv),
      basiszinssatz: company?.rates?.basiszinssatz,
      basiszinssatzAb: company?.rates?.basiszinssatzAb,
      basiszinssaetze: company?.rates?.basiszinssaetze,
      zentral: zentralerBasiszins,
    });
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
      const unternehmer = istUnternehmer(inv);
      const kosten = mahnkosten(stufe, company.rates, unternehmer);
      // Festgehalten wird, was die Mahnung an Kosten verlangt — Spesen oder Pauschale.
      const spesen = kosten.spesen + kosten.pauschale;
      const { buildMahnungPdf, mahnungDateiname } = await import('./mahnungPdf');
      /*
        DIE MAHNUNG GEHT AN DIE ANSCHRIFT DES KUNDEN (P2-02) — heute, aus dem
        Stamm. Ältere Rechnungen tragen als Anschrift die der Baustelle; ein
        umgezogener Kunde bekäme sonst die Mahnung an die alte. Ohne Kunden
        im Stamm bleibt die Anschrift der Rechnung.
      */
      const kunde = kundeDerRechnung(inv);
      const blob = await buildMahnungPdf({
        company,
        invoice: inv,
        stufe,
        datum: heute,
        frist,
        adresse: kunde?.address?.trim() || inv.address,
        kundenUid: inv.customerVatId,
        zinsen: zinsenFuer(inv, stufe, heute),
        unternehmer,
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

      await mahnungFesthalten(inv.id, {
        stufe, gemahntAm: heute, frist, spesen, standJetzt: inv.paymentStatus,
      });
      // Das Abzeichen im Menü zählt mit: diese Rechnung ist bis zum Ablauf
      // der neuen Frist keine fällige Mahnung mehr.
      void postenNeuLaden();
      toast.success(`${TEXTE[stufe].titel} erzeugt`);
      setMahnFuer(null);
    } catch (err) {
      setError(grundAus(err, 'Die Mahnung konnte nicht erzeugt werden.'));
    } finally {
      setBusy(false);
    }
  }

  /**
   * Die Stornorechnung als PDF — beim ersten Mal wird sie ausgestellt, danach
   * nur neu gedruckt. Wirft, damit der Dialog beim Fehler offen bleibt.
   */
  /** Der Tag der Stornorechnung, TT.MM.JJJJ — `stornoAm` ist ein Zeitpunkt. */
  function stornoDatum(inv: Invoice): string {
    const t = inv.stornoAm ?? inv.cancelledAt;
    return t ? datumAT(localDateStr(new Date(t))) : '—';
  }

  async function stornorechnungDrucken(inv: WithId<Invoice>) {
    if (!company) return;
    const nummer = inv.stornoNummer ?? (await stornorechnungAusstellen(inv, vorsaetze.rechnung));
    const { buildStornoPdf, stornoDateiname } = await import('./stornoPdf');
    const blob = await buildStornoPdf({ company, invoice: inv, nummer });
    const { shareOrDownloadPdf } = await import('@/features/worksheets/worksheetPdf');
    await shareOrDownloadPdf(blob, stornoDateiname(nummer));
    if (!inv.stornoNummer) toast.success(`Stornorechnung ${nummer} ausgestellt`);
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
        /*
          DIE VOLLE LEISTUNG, nicht die Forderung.

          Gespeichert ist beides: `total*` ist, was diese Rechnung fordert,
          `gesamt*` die Leistung davor. Das PDF bekommt die Leistung und zieht
          selbst ab — bekäme es die Forderung, zöge es ein zweites Mal ab, und
          der zweite Druck einer Schlussrechnung wäre ein anderer Beleg über
          dieselbe Nummer. Ohne Abzug sind beide gleich.
        */
        totalNetto: inv.gesamtNetto ?? inv.totalNetto,
        totalVat: inv.gesamtVat ?? inv.totalVat,
        totalBrutto: inv.gesamtBrutto ?? inv.totalBrutto,
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
      steuerbefreiung: inv.steuerbefreiung,
      // Aus dem Dokument — Altbestand hat ihn nicht und bleibt, wie er war.
      leistungsort: inv.leistungsort,
      bestellnummer: inv.bestellnummer ?? undefined,
      art: inv.art,
      vorrechnungen: inv.vorrechnungen,
      skonto: inv.skontoProzent && inv.skontoBis
        ? { skontoProzent: inv.skontoProzent, skontoBis: inv.skontoBis }
        : null,
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
    () => mahnlauf(offeneRechnungen, todayStr(), company?.rates, istUnternehmer),
    // eslint-disable-next-line react-hooks/exhaustive-deps -- istUnternehmer liest Kunden und Baustellen
    [offeneRechnungen, company?.rates, kunden, projects],
  );

  /*
    SICHTEN AUS DER ADRESSE (Startseite, Nachtest 01.10.2026): „Mahnung
    fällig“ zeigt genau die Rechnungen des Mahnlaufs, „bezahlt heute“ und
    „bezahlt im Monat“ die mit einem Zahlungseingang in diesem Zeitraum —
    über ALLE Rechnungen, nicht nur die zuletzt geladenen.
  */
  const [zahlSicht, setZahlSicht] = useState<{ sicht: RechnungsSicht; zeilen: WithId<Invoice>[] } | null>(null);
  useEffect(() => {
    if (!user || (sicht !== 'bezahlt-heute' && sicht !== 'bezahlt-monat')) {
      setZahlSicht(null);
      return;
    }
    let weg = false;
    const heute = todayStr();
    const von = sicht === 'bezahlt-heute' ? heute : `${heute.slice(0, 7)}-01`;
    void (async () => {
      try {
        const zahlungen = (await listZahlungenImZeitraum(user.companyId, von, heute)).filter((z) => z.art !== 'Skonto');
        const ids = [...new Set(zahlungen.map((z) => z.invoiceId))];
        const zeilen = ids.length ? await listInvoicesByIds(user.companyId, ids) : [];
        if (!weg) {
          setZahlSicht({
            sicht,
            zeilen: zeilen
              .filter((i) => i.paymentStatus !== 'Storniert')
              .sort((a, b) => b.invoiceNumber.localeCompare(a.invoiceNumber)),
          });
        }
      } catch {
        if (!weg) setZahlSicht({ sicht, zeilen: [] });
      }
    })();
    return () => {
      weg = true;
    };
  }, [user, sicht, invoices]);
  const liste = useMemo(() => {
    if (sicht === 'mahnung-faellig') return lauf.zeilen.map((z) => z.rechnung as WithId<Invoice>);
    if (sicht === 'bezahlt-heute' || sicht === 'bezahlt-monat') {
      return zahlSicht?.sicht === sicht ? zahlSicht.zeilen : [];
    }
    return visible;
  }, [sicht, lauf, zahlSicht, visible]);

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
    () =>
      unverrechneteScheine(
        scheineAllerBaustellen,
        [
          ...invoices,
          ...offeneRechnungen,
          // Die Abdeckung ALLER gültigen Rechnungen (P2-03) — als eine
          // Rechnung gelesen, die genau diese Scheine trägt.
          { linkedWorkSheets: scheineVerrechnet ?? [], paymentStatus: 'Offen' },
        ],
        todayStr(),
      ),
    [scheineAllerBaustellen, invoices, offeneRechnungen, scheineVerrechnet],
  );

  /**
   * Stellt dieser Betrieb überhaupt Anzahlungen und Teilrechnungen?
   *
   * Ist der Haken aus, gibt es die Auswahl nicht — und damit auch keine
   * andere Art als die Einzelrechnung. ABGELEITET und nicht bloss
   * ausgeblendet: dreht jemand die Einstellung ab, während hier eine
   * Schlussrechnung vorbereitet wird, entstünde sonst ein Beleg über eine
   * Einstellung, die es nicht mehr gibt.
   */
  const artWaehlbar = !!company?.rechnungsarten;
  const art: RechnungsArt = artWaehlbar ? artWahl : 'einzel';

  /**
   * Die gewählten Abzüge als Kopie, wie sie auf dem Beleg stehen.
   *
   * Aus `abzugsfaehig` und nicht aus der Rechnungsliste der Ansicht: nur die
   * Baustellenabfrage kennt auch die längst bezahlte Anzahlung.
   */
  /*
    NUR WAS DIESELBE STEUERBEHANDLUNG TRÄGT (Prüflauf 25.09.2026, P2-08).
    Eine Anzahlung mit USt lässt sich nicht von einer Reverse-Charge-
    Schlussrechnung abziehen und umgekehrt — sie wird darunter benannt statt
    angeboten. Ein schon gesetzter Haken fällt mit heraus, wenn jemand
    „Bauleistung" danach umstellt.
  */
  const steuer = useMemo(() => nachSteuer(abzugsfaehig, reverseCharge), [abzugsfaehig, reverseCharge]);
  /*
    BEI DER SCHLUSSRECHNUNG KEIN HÄKCHEN, SONDERN PFLICHT (Testbericht
    30.09.2026, K2). Anzahlungen und Teilrechnungen werden abgezogen, ohne
    dass jemand daran denken muss, und lassen sich nicht abwählen — die
    Datenbank wiese die Rechnung sonst ab.
  */
  const pflicht = useMemo(
    () => (art === 'schluss' ? steuer.passend.filter(pflichtAbzug).map((r) => r.id) : []),
    [art, steuer],
  );
  const abzuege = useMemo(
    () =>
      steuer.passend
        .filter((r) => gewaehlteAbzuege.includes(r.id) || pflicht.includes(r.id))
        .map(alsVorrechnung),
    [steuer, gewaehlteAbzuege, pflicht],
  );

  /**
   * Was diese Rechnung fordert — die volle Leistung minus die Abzüge.
   *
   * EINE STELLE, DREI VERWENDUNGEN: Vorschau, gespeicherte Rechnung und PDF.
   * Rechnete jede für sich, stünde auf dem Beleg irgendwann eine andere Zahl
   * als in den offenen Posten.
   */
  const summen = useMemo(
    () => (preview ? mitAbzug(preview, abzuege) : null),
    [preview, abzuege],
  );

  /*
    OHNE POSITIONEN ODER ÜBER NULL EURO GIBT ES KEINE RECHNUNG (Prüflauf
    25.09.2026, P2-10). Wer die letzte Zeile entfernte, legte eine Rechnung
    über nichts an — mit einer verbrauchten Nummer, die sich nicht mehr
    wegräumen lässt. Gemessen wird die volle Leistung, nicht der Rest: eine
    Schlussrechnung, deren Anzahlung alles gedeckt hat, bleibt ein Beleg. Die
    Datenbank (`rechnung_anlegen`) weist beides ebenso ab.
  */
  const leer = !!preview && (preview.positions.length === 0 || preview.totalNetto <= 0);

  /** Abgezogen wird nur, wo es etwas abzuziehen gibt. */
  const zieheAb = art === 'teil' || art === 'schluss';

  /*
    Der Abgleich hängt an der Vorschau, nicht an der Liste: verglichen wird,
    was DIESE Rechnung nehmen würde, gegen die Scheine derselben Baustelle.
  */
  const abgleich = useMemo(
    () =>
      preview
        ? scheinAbgleich(
            projectNumber,
            preview.entries,
            scheineAllerBaustellen,
            new Set(offeneLeistung.map((o) => o.schein.id)),
          )
        : {
            verrechnetMin: 0, bestaetigtMin: 0, scheine: 0, mehrMin: 0, auffaellig: false,
            wenigerMin: 0, zuWenig: false, fehlend: [], ohneSchein: [],
          },
    [preview, projectNumber, scheineAllerBaustellen, offeneLeistung],
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
      /*
        ÜBER ALLE ZEITRÄUME, nicht nur über den gewählten: die Anzahlung liegt
        typischerweise Monate vor der Schlussrechnung.
      */
      const [zeilen, fehlAbzug] = await Promise.all([
        listInvoicesInRange(user.companyId, exportVon, exportBis),
        schlussrechnungenOhneAbzug(),
      ]);
      setExportZeilen(zeilen);
      setOhneAbzug(fehlAbzug);
      /*
        DIE ZAHLUNGEN LAUFEN NEBENHER. Schlägt ihr Laden fehl, fehlt nur der
        Zahlungsstapel — Journal und Rechnungsstapel stehen trotzdem.
      */
      try {
        const zahl = await listZahlungenImZeitraum(user.companyId, exportVon, exportBis);
        const bekannt = new Set(zeilen.map((r) => r.id));
        const fehlen = [...new Set(zahl.map((z) => z.invoiceId).filter((id) => !bekannt.has(id)))];
        const weitere = fehlen.length > 0
          ? await Promise.resolve().then(() => listInvoicesByIds(user.companyId, fehlen))
          : [];
        setExportZahlungen({ zahlungen: zahl, rechnungen: [...zeilen, ...weitere] });
      } catch {
        setExportZahlungen(null);
      }
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

  /*
    ZEILE UND TABELLE AUS DENSELBEN TEILEN. Am Telefon steht eine Rechnung als
    Zeile, am Schreibtisch als Tabellenzeile (`useSchreibtisch`). Was darunter
    klein steht — Mahnstand, Teilzahlung, Guthaben, Storno — und das Menü mit
    den Handlungen gibt es deshalb genau einmal, hier; beide Darstellungen
    rufen es auf, damit keine Handlung doppelt gepflegt wird.
  */
  const rechnungNotizen = (inv: (typeof visible)[number]) => (
    <>
      {/*
        WAS SCHON GEMAHNT WURDE, gehört in die Zeile.

        Ohne diese Angabe führt der Betrieb den Mahnstand
        weiterhin im Kopf — und genau das war der Zustand
        vorher. Zwei Erinnerungen an denselben Kunden in einer
        Woche sind peinlicher als gar keine.
      */}
      {/*
        IST SIE ERLEDIGT, IST DIE MAHNUNG GESCHICHTE. Sie bleibt
        stehen — man soll sehen, dass es eine gab —, aber ohne
        Frist und nicht in Warnfarbe: eine bezahlte Rechnung mit
        „Frist 08.10." in Gelb sah aus, als sei noch etwas zu tun
        (Prüflauf 24.09.2026, F14).
      */}
      {!!inv.mahnstufe &&
        (['Bezahlt', 'Überzahlt', 'Storniert'].includes(inv.paymentStatus) ? (
          <span className="mt-1 block text-xs text-ink-muted">
            {TEXTE[inv.mahnstufe as 1 | 2 | 3].titel} am {datumAT(inv.gemahntAm)}
          </span>
        ) : (
          <span className="mt-1 block text-xs text-warning">
            {TEXTE[inv.mahnstufe as 1 | 2 | 3].titel} am {datumAT(inv.gemahntAm)}
            {inv.mahnfrist ? ` · Frist ${datumAT(inv.mahnfrist)}` : ''}
            {inv.mahnspesen ? ` · ${euro(inv.mahnspesen)} Spesen` : ''}
          </span>
        ))}
      {/*
        WAS SCHON DA IST, STEHT IN DER ZEILE — aber nur, wenn es
        etwas zu sagen gibt. Bei einer unbezahlten Rechnung wäre
        „0 € bezahlt" eine Zeile ohne Inhalt, und bei einer ganz
        bezahlten sagt das Abzeichen schon alles. Übrig bleiben
        die beiden Fälle, die man sonst übersieht: die
        Teilzahlung und das Guthaben nach einem Storno.
      */}
      {(() => {
        const stand = zahlstand(inv);
        if (stand.guthaben > 0) {
          return (
            <span className="mt-1 block text-xs text-warning">
              Guthaben des Kunden: {euro(stand.guthaben)} — zurückzuzahlen
            </span>
          );
        }
        if (stand.bezahlt > 0 && stand.rest > 0) {
          return (
            <span className="mt-1 block text-xs text-ink-muted">
              {euro(stand.bezahlt)} bezahlt · {euro(stand.rest)} offen
              {/* Das Abzeichen sagt „Teilbezahlt" — dass der Rest
                  schon fällig war, sagt es nicht. */}
              {istUeberfaellig(inv, todayStr()) && (
                <span className="text-warning"> · überfällig</span>
              )}
            </span>
          );
        }
        return null;
      })()}
      {inv.cancellationNote && (
        <span className="mt-1 block text-xs text-ink-muted">
          Storno: {inv.cancellationNote}
        </span>
      )}
      {inv.stornoNummer && (
        <span className="mt-1 block text-xs text-ink-muted">
          Stornorechnung {inv.stornoNummer}
        </span>
      )}
    </>
  );
  /*
    DIE ZEILE DER STORNORECHNUNG MIT „⋯“ WIE JEDE ANDERE (Nachtest
    01.10.2026, U15) — vorher stand dort als einzige ein Knopf „PDF“.
  */
  const stornoMenue = (inv: (typeof visible)[number]) => (
    <RowMenu
      about={`Stornorechnung ${inv.stornoNummer}`}
      items={[{ label: 'Stornorechnung als PDF', onSelect: () => void stornorechnungDrucken(inv) }]}
    />
  );

  const rechnungMenue = (inv: (typeof visible)[number]) => (
    <>
    {/* Der Status stand doppelt in der Zeile: einmal farbig als
        Abzeichen, einmal als Auswahlfeld daneben. Das Abzeichen
        bleibt — beim Durchsehen zaehlt die Farbe, nicht die
        Bedienung. Das Umstellen ist in das Menue gewandert, wo
        es als benannte Handlung steht statt als Klappliste, die
        auf dem Telefon ohnehin ein eigenes Rad oeffnet. */}
    <RowMenu
      about={`Rechnung ${inv.invoiceNumber}`}
      items={[
        // Die Rechnung in der App lesen, ohne Datei (Testbericht 30.09.2026, M19).
        { label: 'Ansehen', onSelect: () => setDetailFuer(inv) },
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
        /*
          ZAHLUNG ERFASSEN STATT „AUF BEZAHLT SETZEN".

          Der Haken war eine Behauptung ohne Beleg: kein Datum,
          kein Betrag, keine Teilzahlung. „Bezahlt" ergibt sich
          jetzt aus den Eingängen, und die Datenbank weist einen
          Schreibversuch von Hand ab — der Menüpunkt wäre also
          nicht bloss überflüssig, sondern eine Sackgasse.

          Er steht AUCH bei einer stornierten Rechnung, und das
          ist kein Versehen: nach einem Storno kommt manchmal noch
          Geld an, und irgendwo muss es hin. Es wird dort zum
          Guthaben des Kunden.
        */
        {
          /*
            DIE BESCHRIFTUNG SAGT, WAS PASSIERT (Testbericht 30.09.2026,
            G15): bei einer bezahlten oder stornierten Rechnung wird aus einer
            weiteren Zahlung Guthaben des Kunden. Der Dialog sagt es noch
            einmal, bevor eingetragen wird.
          */
          label: zahlstand(inv).guthaben > 0
            ? 'Guthaben zurückzahlen …'
            : inv.paymentStatus === 'Storniert'
              ? 'Zahlung erfassen (wird Guthaben) …'
              : inv.paymentStatus === 'Bezahlt' || inv.paymentStatus === 'Überzahlt'
                ? 'Weitere Zahlung erfassen …'
                : 'Zahlung erfassen',
          onSelect: () => void zahlungOeffnen(inv),
        },
        ...(inv.paymentStatus !== 'Storniert'
          ? [
              /*
                KEIN STATUS VON HAND (Testbericht 30.09.2026, H5). Hier
                liess sich „Überfällig" setzen, auch zwei Wochen vor dem
                Zahlungsziel — und dann mahnen. Der Stand ergibt sich aus
                Zahlungsziel und Eingängen; die Datenbank lässt nichts
                anderes mehr zu.
              */
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
              /*
                NUR AM TAG DES STORNOS (Launch-Check, K9): für den
                Fehlgriff, nicht für später. Ab dem Folgetag steht
                der Storno im Buchungsstapel der Kanzlei — dann ist
                der Weg eine neue Rechnung. Die Datenbank zieht
                dieselbe Grenze.
              */
              /*
                DIE STORNORECHNUNG (B7): der Beleg für den Kunden. Beim
                ersten Mal mit Rückfrage — sie bekommt eine Nummer aus
                dem Rechnungskreis, und danach bleibt der Storno.
              */
              inv.stornoNummer
                ? {
                    label: 'Stornorechnung (PDF)',
                    onSelect: () =>
                      void stornorechnungDrucken(inv).catch((err: unknown) =>
                        toast.error(grundAus(err, 'Die Stornorechnung konnte nicht erstellt werden.')),
                      ),
                  }
                : { label: 'Stornorechnung ausstellen …', onSelect: () => setStornoBeleg(inv) },
              ...(!inv.stornoNummer && inv.cancelledAt && localDateStr(new Date(inv.cancelledAt)) === todayStr()
                ? [{ label: 'Storno aufheben', onSelect: () => setAufheben(inv) }]
                : []),
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
    </>
  );

  return (
    // Abstände der Designlinie „Fassung 3": 12 px am Telefon, 20 px am Schreibtisch.
    <div className="space-y-3 lg:space-y-5">
      <PageHeader title="Rechnungen" subtitle="Aus einer Baustelle erzeugen, Zahlung verfolgen, stornieren" />

      {nebenFehler && <TeilFehler was={nebenFehler} />}

      <MetricRow>
        {/* Kamen die offenen Forderungen nicht, sagen es die beiden Zahlen dazu —
            sonst stünde eine zu kleine Summe da, die niemand als solche erkennt. */}
        <Metric label="Offen" value={euro(stats.offen)}
          hint={forderungenFehler ? 'nur die jüngsten — offene Forderungen nicht geladen' : undefined} />
        <Metric label="Überfällig" tone={stats.ueberfaellig > 0 ? 'danger' : 'default'}
          value={euro(stats.ueberfaellig)}
          hint={forderungenFehler ? 'nur die jüngsten — offene Forderungen nicht geladen' : undefined} />
        {bezahltImMonat !== null ? (
          // „im laufenden Monat“ wurde am Telefon gekürzt (U10); was gilt, sagt der Zusatz.
          <Metric label="Bezahlt im Monat" tone="success" value={euro(bezahltImMonat)}
            hint={`Zahlungseingänge seit ${datumAT(monatsErster)}, ohne Skonto`} />
        ) : (
          <Metric label="Bezahlt" tone="success" value={euro(stats.bezahlt)}
            hint={`auf die ${invoices.length} zuletzt geladenen Rechnungen`} />
        )}
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
        <Hinweiszeile stufe="warn" role="status">
          <p>
            <strong>Die offenen Forderungen konnten nicht geladen werden.</strong> Mahnlauf und
            „nicht verrechnete Leistung“ sind deshalb unvollständig — was hier fehlt, heißt
            nicht, dass es nichts zu tun gibt. Bitte die Seite neu laden.
          </p>
        </Hinweiszeile>
      )}

      {!forderungenFehler && abdeckungFehler && (
        <Hinweiszeile stufe="warn" role="status">
          <p>
            <strong>Welche Handwerksscheine schon verrechnet sind, konnte nicht geladen werden.</strong>{' '}
            „Nicht verrechnete Leistung“ wird deshalb nicht angezeigt. Bitte die Seite neu laden.
          </p>
        </Hinweiszeile>
      )}

      {!forderungenFehler && !abdeckungFehler && scheineVerrechnet !== null
        && auffaellige(offeneLeistung).length > 0 && (
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
                  <span>
                    Baustelle <span className="nr">{schein.projectNumber}</span> · Leistung vom {datumAT(schein.datum)} ·{' '}
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
                <strong>{euro(lauf.summeOffen)}</strong> offen
                {lauf.summeSpesen > 0 ? ` · ${euro(lauf.summeSpesen)} Mahnspesen` : ''}
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
                      <span>
                        {z.rechnung.invoiceNumber} · {euro(z.offen)}
                        {/* Teilzahlungen sichtbar machen: „600 von 1.000" sagt,
                            warum hier eine andere Zahl steht als in der Liste. */}
                        {z.offen !== z.rechnung.totalBrutto
                          ? ` von ${euro(z.rechnung.totalBrutto)}`
                          : ''}{' '}
                        · {z.tageUeberfaellig} Tage überfällig
                        {z.spesen > 0 ? ` · ${euro(z.spesen)} Spesen` : ''}
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
            <div className="mt-4">
              <Hinweiszeile stufe="warn">
                <p>
                  <strong>
                    {lauf.ausgereizt.length}{' '}
                    {lauf.ausgereizt.length === 1 ? 'Forderung' : 'Forderungen'} braucht eine
                    Entscheidung:
                  </strong>{' '}
                  {lauf.ausgereizt.map((i) => `${i.invoiceNumber} (${i.customerName})`).join(', ')}. Die
                  dritte Mahnung ist verschickt — was jetzt folgt, entscheidet der Betrieb.
                </p>
              </Hinweiszeile>
            </div>
          )}
        </Card>
      )}

      <Card
        title="Neue Rechnung aus Baustelle"
        hint="Zusammengestellt wird, was auf dieser Baustelle als „Anwesend“ gebucht und noch NICHT verrechnet ist — dazu das ausgegebene Material. Eine Position kann deshalb nie zweimal auf eine Rechnung geraten. Gesperrt werden die Belege aber erst beim Anlegen, nicht schon beim Zusammenstellen: bis dahin lässt sich alles gefahrlos ansehen und wieder verwerfen."
      >
        <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-end">
          {/* Höchstens 20rem wie bisher, aber nachgiebig: erst gibt die
              Auswahl Platz her, und erst wenn auch das nicht reicht, rückt
              der Knopf in die nächste Zeile — statt dass seine Beschriftung
              silbenweise umbricht (P4-18). */}
          <div className="min-w-0 sm:max-w-80 sm:grow sm:basis-52">
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
          {/*
            DIE ART STEHT VOR DEM ZUSAMMENSTELLEN, nicht danach: sie
            entscheidet, woraus die Positionen entstehen. Eine Anzahlung kommt
            nicht aus Zeiteinträgen — es gibt noch keine.
          */}
          {artWaehlbar && (
          /* So breit wie die längste Art: mit fester Breite stand am
             Schreibtisch „Schlussrechnung (zieh…" (Prüflauf, D12). */
          <div className="sm:w-auto sm:min-w-56">
            <SelectField
              id="inv-art"
              label="Art der Rechnung"
              value={art}
              onChange={(e) => {
                setArtWahl(e.target.value as RechnungsArt);
                setPreview(null);
                setGewaehlteAbzuege([]);
                setError(null);
              }}
            >
              <option value="einzel">Rechnung (ganze Leistung)</option>
              <option value="anzahlung">Anzahlung (Leistung kommt noch)</option>
              <option value="teil">Teilrechnung (Bauabschnitt)</option>
              <option value="schluss">Schlussrechnung (zieht Anzahlungen ab)</option>
            </SelectField>
          </div>
          )}
          {/* Die Beschriftung bricht nicht um: bei 834 px stand
              „zusammenstell|en" auf drei Zeilen (Prüflauf 25.09.2026,
              P4-18). Platz gibt die Baustellenauswahl her. */}
          <Button
            onClick={buildPreview}
            loading={busy && !preview}
            disabled={!projectNumber}
            className="shrink-0 whitespace-nowrap"
          >
            {art === 'anzahlung' ? 'Anzahlung vorbereiten' : 'Positionen zusammenstellen'}
          </Button>
        </div>
        {art === 'anzahlung' && (
          <div className="mt-3 space-y-3">
            <div className="max-w-xs">
              <ZahlWertFeld
                id="anzahlung-prozent"
                label="Anteil vom angenommenen Angebot (%)"
                wert={anzahlungProzent}
                leerAls={null}
                onWert={(n) => setAnzahlungProzent(n)}
              />
              {anteilFehler(anzahlungProzent) && (
                <p className="mt-1 text-sm text-danger">{anteilFehler(anzahlungProzent)}</p>
              )}
            </div>
            <Hinweiszeile>
              <p>
                Eine Anzahlung verrechnet noch keine Leistung: sie nimmt keine Stunden und kein
                Material auf und sperrt deshalb auch keine Belege. Die Schlussrechnung führt später
                die ganze Leistung an und zieht diese Anzahlung samt Umsatzsteuer wieder ab.
              </p>
            </Hinweiszeile>
          </div>
        )}

        <details className="mt-4">
          <summary className="link min-h-touch cursor-pointer text-sm">
            Konditionen für diese Rechnung anpassen
          </summary>
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-sm text-ink-muted">Nur für diese Rechnung</span>
            <InfoHint about="die Konditionen dieser Rechnung">
              Die Änderung gilt nur für diese Rechnung und wirkt erst beim erneuten
              Zusammenstellen. Die dauerhaften Sätze des Betriebs stehen in den Einstellungen.
            </InfoHint>
          </div>
          <div className="mt-3 border-t border-line pt-4">
            <FormGrid cols={3}>
              <ZahlWertFeld id="r-fach" label="Facharbeiter €/h"
                wert={rates.fach}
                onWert={(n) => setRates({ ...rates, fach: n ?? 0 })} />
              <ZahlWertFeld id="r-helper" label="Helfer €/h"
                wert={rates.helper}
                onWert={(n) => setRates({ ...rates, helper: n ?? 0 })} />
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
              <ZahlWertFeld id="r-skonto" label="Skonto %"
                placeholder="leer = keines"
                wert={rates.skontoProzent || null}
                onWert={(n) => setRates({ ...rates, skontoProzent: n || undefined })} />
              <InputField id="r-skonto-tage" label="Skontofrist (Tage)" type="number" min="0"
                placeholder="leer = keines"
                value={rates.skontoTage ? String(rates.skontoTage) : ''}
                onChange={(e) => setRates({ ...rates, skontoTage: Number(e.target.value) || undefined })} />
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
              label={art === 'anzahlung' ? 'Leistung voraussichtlich von' : 'Leistung von'}
              type="date"
              value={leistungVon}
              onChange={(e) => setLeistungVon(e.target.value)}
            />
            <InputField
              id="leistung-bis"
              label={art === 'anzahlung' ? 'Leistung voraussichtlich bis' : 'Leistung bis'}
              type="date"
              value={leistungBis}
              onChange={(e) => setLeistungBis(e.target.value)}
            />
          </div>
          {/*
            BEI EINER ANZAHLUNG IST DER LEERE ZEITRAUM KEIN MANGEL, sondern
            die Wahrheit: die Leistung ist noch nicht erbracht. Die Warnung
            stünde hier gegen den Beleg — und wer sie befolgt, trägt ein
            Datum ein, das es nicht gibt.
          */}
          {art !== 'anzahlung' && (!leistungVon || !leistungBis) && (
            <div className="mb-3">
              <Hinweiszeile stufe="warn">
                <p>
                  Ohne Leistungszeitraum ist die Rechnung nach § 11 UStG unvollständig — beim Kunden
                  wackelt damit der Vorsteuerabzug.
                </p>
              </Hinweiszeile>
            </div>
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
            <div className="mb-3">
              <Hinweiszeile stufe="warn">
                <p>
                  „Leistung bis“ liegt vor „Leistung von“ — so stünde der Zeitraum verdreht auf der
                  Rechnung. Zurückzunehmen wäre das nur noch mit einem Storno.
                </p>
              </Hinweiszeile>
            </div>
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
          {(abgleich.scheine > 0 || abgleich.ohneSchein.length > 0) && (
            <div className="mb-3">
              <Hinweiszeile
                stufe={
                  abgleich.auffaellig || abgleich.zuWenig || abgleich.fehlend.length > 0 ||
                  abgleich.ohneSchein.length > 0
                    ? 'warn'
                    : undefined
                }
              >
                <p>
                  {abgleich.scheine > 0 && (
                  <>
                  {abgleich.scheine === 1
                    ? 'Ein noch nicht verrechneter Schein bestätigt'
                    : `${abgleich.scheine} noch nicht verrechnete Scheine bestätigen`}{' '}
                  <strong>{fmtDauer(abgleich.bestaetigtMin)}</strong>, verrechnet werden{' '}
                  <strong>{fmtDauer(abgleich.verrechnetMin)}</strong>
                  {abgleich.auffaellig ? (
                    <>
                      {' '}
                      — <strong>{fmtDauer(abgleich.mehrMin)} mehr, als der Kunde unterschrieben hat.</strong>{' '}
                      Das kann stimmen: Vorfertigung in der Werkstatt und der Weg zum Großhändler
                      zählen auf die Baustelle, stehen aber auf keinem Schein. Nur wird der Kunde
                      danach fragen — besser jetzt als nach dem Versand.
                    </>
                  ) : abgleich.zuWenig ? (
                    <>
                      {' '}
                      — <strong>{fmtDauer(abgleich.wenigerMin)} weniger, als auf noch nicht verrechneten
                      Scheinen unterschrieben ist.</strong>{' '}
                      Meist ist die Zeit noch nicht gebucht: der Nachtrag steht beim Monteur in der
                      Zeiterfassung offen. Gebucht kommt sie auf die nächste Rechnung dieser Baustelle —
                      dann bekommt der Kunde für einen Einsatz zwei.
                    </>
                  ) : abgleich.fehlend.length > 0 ? (
                    ' — aber nicht jede unterschriebene Stunde steht darauf:'
                  ) : (
                    '.'
                  )}
                  {/*
                    JE PERSON, TAG UND SATZ. Die Summe oben kann stimmen und trotzdem
                    einen Verlust verdecken: fehlen die Facharbeiterstunden vom 24.,
                    während Helferstunden vom 21. gebucht sind, ist sie gleich —
                    und der Kunde hat für die einen unterschrieben, nicht für die
                    anderen (Prüflauf 24.09.2026).
                  */}
                  {abgleich.fehlend.length > 0 && (
                    <span className="mt-1 block">
                      {abgleich.fehlend.map((f) => (
                        <span key={`${f.datum}|${f.name}|${f.helfer}`} className="block">
                          {f.datum.slice(8, 10)}.{f.datum.slice(5, 7)}. · {f.name} ·{' '}
                          {f.helfer ? 'Helfer' : 'Facharbeiter'}: unterschrieben{' '}
                          <strong>{fmtDauer(f.bestaetigtMin)}</strong>, verrechnet{' '}
                          <strong>{fmtDauer(f.verrechnetMin)}</strong>
                          {f.andererSatzMin > 0 &&
                            ` (als ${f.helfer ? 'Facharbeiter' : 'Helfer'} ${fmtDauer(f.andererSatzMin)})`}
                        </span>
                      ))}
                      <span className="mt-1 block">
                        Meist ist die Zeit noch nicht oder zum anderen Satz gebucht. Nachbuchen oder
                        berichtigen, dann die Positionen neu zusammenstellen.
                      </span>
                    </span>
                  )}
                  </>
                  )}
                  {/*
                    GEBUCHT, ABER OHNE UNTERSCHRIEBENEN SCHEIN (Testbericht
                    30.09.2026, H2) — je Person, Tag und Satz. Verrechnet
                    werden darf das; der Kunde hat es nur nirgends bestätigt.
                  */}
                  {abgleich.ohneSchein.length > 0 && (
                    <span className={`block ${abgleich.scheine > 0 ? 'mt-2' : ''}`}>
                      Gebucht, aber ohne unterschriebenen Schein:
                      {abgleich.ohneSchein.map((o) => (
                        <span key={`${o.datum}|${o.name}|${o.helfer}`} className="block">
                          {o.datum.slice(8, 10)}.{o.datum.slice(5, 7)}. · {o.name} ·{' '}
                          {o.helfer ? 'Helfer' : 'Facharbeiter'}: <strong>{fmtDauer(o.verrechnetMin)}</strong>
                        </span>
                      ))}
                    </span>
                  )}
                </p>
              </Hinweiszeile>
            </div>
          )}
          {pauschalAus !== null && (
            <div className="mb-3">
              <Hinweiszeile>
                <p>
                  {nachAufmass
                    ? art === 'teil'
                      ? `Einheitspreisbaustelle: die Mengen des bisherigen Aufmaßes bitte eintragen${pauschalAus ? ` — Positionen und Preise aus dem Angebot ${pauschalAus}` : ''}. Die Schlussrechnung zieht diese Teilrechnung ab.`
                      : pauschalAus
                        ? `Einheitspreisbaustelle: Positionen und Einheitspreise kommen aus dem Angebot ${pauschalAus}. Die Mengen bitte nach Aufmaß eintragen — vorbelegt sind die des Angebots. Stunden und Material der Scheine werden nicht einzeln verrechnet.`
                        : 'Einheitspreisbaustelle ohne angenommenes Angebot: Positionen, Mengen nach Aufmaß und Einheitspreise bitte eintragen. Stunden und Material der Scheine werden nicht einzeln verrechnet.'
                    : art === 'teil'
                    ? 'Pauschalbaustelle: den Teilbetrag legt die Vereinbarung fest — die Schlussrechnung zieht ihn ab.'
                    : pauschalAus
                      ? `Pauschalbaustelle: die Positionen kommen aus dem Angebot ${pauschalAus}. Stunden und Material der Scheine sind darin enthalten und werden nicht einzeln verrechnet.`
                      : 'Pauschalbaustelle ohne angenommenes Angebot: den vereinbarten Betrag bitte in der Zeile eintragen. Stunden und Material der Scheine sind darin enthalten.'}
                </p>
              </Hinweiszeile>
            </div>
          )}
          {art === 'anzahlung' && anzahlungOhneAngebot && (
            <div className="mb-3">
              <Hinweiszeile>
                <p>
                  Zu dieser Baustelle gibt es kein angenommenes Angebot: den vereinbarten Betrag
                  bitte in der Zeile eintragen.
                </p>
              </Hinweiszeile>
            </div>
          )}
          {preview.materialOhnePreis.length > 0 && (
            <div className="mb-3">
              <Hinweiszeile stufe="warn">
                <p>
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
              </Hinweiszeile>
            </div>
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
                {preview.positions.map((p, i) => !istPreiszeile(p) ? (
                  /*
                    TITEL UND TEXT AUS DEM ANGEBOT (M18): nur die Bezeichnung,
                    keine Menge und kein Preis — sie zählen nie zur Summe.
                  */
                  <tr key={i} className="border-b border-line/60">
                    <td colSpan={5} className="py-2 pr-3">
                      <input
                        aria-label={`${p.art === 'titel' ? 'Titel' : 'Text'} ${i + 1}`}
                        className={`min-h-touch w-full min-w-[10rem] rounded border border-line bg-surface px-2 py-1 text-sm focus:border-brand focus:outline-none focus:ring-2 focus:ring-brand/30 ${p.art === 'titel' ? 'font-semibold text-ink' : 'text-ink-muted'}`}
                        value={p.label}
                        onChange={(e) => setPos(i, { label: e.target.value })}
                      />
                    </td>
                    <td className="py-2 text-right">
                      <IconButton
                        label={`${p.art === 'titel' ? 'Titel' : 'Text'} ${i + 1} entfernen`}
                        tone="danger"
                        onClick={() => entfernePos(i)}
                      >
                        ✕
                      </IconButton>
                    </td>
                  </tr>
                ) : (
                  <tr key={i} className="border-b border-line/60">
                    <td className="py-2 pr-3">
                      <input
                        aria-label={`Bezeichnung Position ${i + 1}`}
                        className="min-h-touch w-full min-w-[10rem] rounded border border-line bg-surface px-2 py-1 text-sm text-ink focus:border-brand focus:outline-none focus:ring-2 focus:ring-brand/30"
                        value={p.label}
                        onChange={(e) => setPos(i, { label: e.target.value })}
                      />
                      {positionsRabattText(p.rabattProzent) && (
                        <span className="mt-1 block text-xs text-ink-muted">{positionsRabattText(p.rabattProzent)} (aus dem Angebot)</span>
                      )}
                    </td>
                    <td className="py-2 pr-3">
                      {/* Über die zentrale Zahlenlesung (M15): „7.500,50“ ist keine 0 mehr. */}
                      <ZahlZelle
                        aria-label={`Menge Position ${i + 1}`}
                        className="min-h-touch w-24 rounded border border-line bg-surface px-2 py-1 text-right text-sm text-ink focus:border-brand focus:outline-none focus:ring-2 focus:ring-brand/30"
                        wert={p.qty}
                        onWert={(n) => setPos(i, { qty: n })}
                      />
                    </td>
                    <td className="py-2 pr-3">
                      <input
                        aria-label={`Einheit Position ${i + 1}`}
                        className="min-h-touch w-20 rounded border border-line bg-surface px-2 py-1 text-sm text-ink focus:border-brand focus:outline-none focus:ring-2 focus:ring-brand/30"
                        value={p.unit}
                        // Vorbelegt: beim Hineintippen ersetzen statt anhängen (Testbericht 30.09.2026, G2).
                        onFocus={(e) => e.currentTarget.select()}
                        onChange={(e) => setPos(i, { unit: e.target.value })}
                      />
                    </td>
                    <td className="py-2 pr-3">
                      <ZahlZelle
                        aria-label={`Einzelpreis Position ${i + 1}`}
                        /*
                          EINE NULL FÄLLT AUF, statt sich als Zahl zu tarnen.

                          Der Hinweis über der Tabelle nennt die betroffenen
                          Artikel — in einer Rechnung mit zwanzig Zeilen ist
                          das trotzdem eine Suche. Ein Preis von 0,00 € sieht
                          aus wie ein Preis; nur die Farbe sagt, dass hier
                          noch eine Entscheidung fehlt.
                        */
                        className={
                          'min-h-touch w-28 rounded border bg-surface px-2 py-1 text-right text-sm text-ink focus:outline-none focus:ring-2 ' +
                          (p.unitPrice === 0
                            ? 'border-warning focus:border-warning focus:ring-warning/30'
                            : 'border-line focus:border-brand focus:ring-brand/30')
                        }
                        wert={p.unitPrice}
                        onWert={(n) => setPos(i, { unitPrice: n })}
                      />
                    </td>
                    <td className="py-2 pr-3 text-right font-medium">{euro(p.netto)}</td>
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
                  <td className="pt-2 pr-3 text-right">{euro(preview.subtotalNetto)}</td>
                  <td />
                </tr>
                {preview.discountAmount > 0 && preview.discount && (
                  <>
                    <tr className="text-danger">
                      <td colSpan={4} className="text-right">{discountLabel(preview.discount)}</td>
                      <td className="pr-3 text-right">−{euro(preview.discountAmount)}</td>
                      <td />
                    </tr>
                    <tr>
                      <td colSpan={4} className="text-right">Netto</td>
                      <td className="pr-3 text-right">{euro(preview.totalNetto)}</td>
                      <td />
                    </tr>
                  </>
                )}
                <tr>
                  <td colSpan={4} className="text-right">
                    {reverseCharge ? 'Umsatzsteuer' : `USt. ${Math.round(satz * 100)} %`}
                  </td>
                  <td className="pr-3 text-right">
                    {reverseCharge ? 'Übergang der Steuerschuld' : euro(preview.totalVat)}
                  </td>
                  <td />
                </tr>
                <tr className={abzuege.length > 0 ? '' : 'font-bold'}>
                  <td colSpan={4} className="text-right">
                    {/* Wo abgezogen wird, ist diese Zeile nicht der
                        Rechnungsbetrag, sondern die volle Leistung. */}
                    {abzuege.length > 0
                      ? 'Gesamtleistung brutto'
                      : reverseCharge
                        ? 'Rechnungsbetrag'
                        : 'Brutto'}
                  </td>
                  <td className="pr-3 text-right">{euro(preview.totalBrutto)}</td>
                  <td />
                </tr>
                {abzuege.map((v) => (
                  <tr key={v.invoiceId} className="text-danger">
                    <td colSpan={4} className="text-right">
                      abzüglich {v.invoiceNumber} vom {datumAT(v.invoiceDate)} (netto {euro(v.netto)} +
                      USt {euro(v.vat)})
                    </td>
                    <td className="pr-3 text-right">−{euro(v.brutto)}</td>
                    <td />
                  </tr>
                ))}
                {abzuege.length > 0 && summen && (
                  <tr className="font-bold">
                    <td colSpan={4} className="text-right">Restforderung brutto</td>
                    <td className="pr-3 text-right">{euro(summen.totalBrutto)}</td>
                    <td />
                  </tr>
                )}
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

          {/*
            DER ABZUG DER VORRECHNUNGEN — § 11 Abs 12 UStG.

            Wer eine Steuer ausweist, schuldet sie. Steht die Steuer der
            Anzahlung ein zweites Mal auf der Schlussrechnung, schuldet der
            Betrieb sie zweimal, bis er berichtigt. Deshalb steht die Auswahl
            NEBEN den Positionen und nicht in einem Untermenü.

            Angeboten wird nur, was keine Belege verbraucht hat: eine
            Teilrechnung über einen abgeschlossenen Bauabschnitt hat ihre
            Stunden mitgenommen, sie stehen in dieser Rechnung gar nicht mehr
            — ein Abzug zöge sie ein zweites Mal ab.
          */}
          {zieheAb && (
            <div className="mt-4 border-t border-line pt-4">
              <div className="mb-2 flex flex-wrap items-center gap-2">
                <span className="section-label">Bereits verrechnet — abziehen</span>
                <InfoHint about="den Abzug der Vorrechnungen">
                  Eine Anzahlung ist samt ihrer Umsatzsteuer schon in Rechnung gestellt. Steht sie
                  hier nicht mit Abzug, weist der Betrieb dieselbe Steuer zweimal aus und schuldet
                  sie zweimal (§ 11 Abs 12 UStG). Angeboten wird nur, was keine Stunden und kein
                  Material verbraucht hat.
                </InfoHint>
              </div>
              {abzugFehler ? (
                <p className="text-sm text-danger" role="alert">
                  Die bisherigen Rechnungen dieser Baustelle konnten nicht geladen werden. Eine
                  Schlussrechnung ohne ihre Anzahlungen wäre steuerlich falsch — bitte noch einmal
                  zusammenstellen.
                </p>
              ) : steuer.passend.length === 0 ? (
                <p className="text-sm text-ink-muted">
                  Auf dieser Baustelle gibt es nichts abzuziehen: keine Anzahlung, die nicht schon
                  abgezogen wäre.
                </p>
              ) : (
                <div className="space-y-2">
                  {steuer.passend.map((r) => (
                    <CheckboxField
                      key={r.id}
                      id={`abzug-${r.id}`}
                      label={`${r.invoiceNumber} vom ${datumAT(r.invoiceDate)} — ${euro(r.totalBrutto)} brutto (davon ${euro(r.totalVat)} USt)${pflicht.includes(r.id) ? ' — wird abgezogen' : ''}`}
                      checked={gewaehlteAbzuege.includes(r.id) || pflicht.includes(r.id)}
                      disabled={pflicht.includes(r.id)}
                      onChange={(e) =>
                        setGewaehlteAbzuege((alt) =>
                          e.target.checked ? [...alt, r.id] : alt.filter((x) => x !== r.id),
                        )
                      }
                    />
                  ))}
                </div>
              )}
              {!abzugFehler && steuer.andere.length > 0 && (
                <p className="mt-3 text-sm text-warning" role="status">
                  Nicht abziehbar, weil {reverseCharge ? 'mit Umsatzsteuer' : 'mit Übergang der Steuerschuld'}{' '}
                  ausgestellt: {steuer.andere.map((r) => r.invoiceNumber).join(', ')}. Anzahlung und
                  Schlussrechnung brauchen dieselbe Steuerbehandlung — sonst stimmt die abgezogene
                  Umsatzsteuer nicht. Das gehört mit der Kanzlei berichtigt.
                </p>
              )}
              {summen?.gutschrift && (
                <p className="mt-3 text-sm font-medium text-danger" role="alert">
                  Die Abzüge übersteigen die Gesamtleistung um {euro(-summen.totalBrutto)}. Das
                  wäre eine Gutschrift, und die kann diese App noch nicht — sie lässt sich hier
                  nicht anlegen.
                </p>
              )}
            </div>
          )}

          {/* Rabatt auf das Netto, nicht auf das Brutto: die Umsatzsteuer
              bemisst sich am tatsaechlich vereinbarten Entgelt. */}
          <div className="mt-4 border-t border-line pt-4">
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
              <ZahlFeld
                id="disc-value"
                label={discount.mode === 'percent' ? 'Rabatt %' : 'Rabatt €'}
                value={discount.value}
                onChange={(text) => setDiscount({ ...discount, value: text })}
              />
            </FormGrid>
          </div>

          <div className="mt-4 space-y-3">
            {/*
              LÜCKENLOS (Launch-Check, K8). RE-2026-1500 statt 1002 ging vorher
              ohne Warnung durch, und die 498 Nummern dazwischen fehlen für
              immer. Eine eigene Nummer gibt es nur bei der allerersten
              Rechnung — der Umstieg aus dem bisherigen Programm. Dieselbe
              Grenze zieht die Datenbank (`naechste_nummer`).
            */}
            {ersteRechnung ? (
              <div className="flex flex-wrap items-end gap-x-2">
                <div className="min-w-0 flex-1">
                  <InputField id="invnum" label="Rechnungsnummer" value={invoiceNumber}
                    onChange={(e) => setInvoiceNumber(e.target.value)} />
                </div>
                <InfoHint about="die erste Rechnungsnummer">
                  Die erste Rechnung in Senklot kann an den Nummernkreis des bisherigen Programms
                  anschließen: war dort die letzte 1499, hier 1500 eintragen. Danach vergibt die App
                  die Nummern lückenlos, und eine eigene Nummer geht nicht mehr.
                </InfoHint>
              </div>
            ) : (
              <p className="text-sm text-ink-muted">
                Rechnungsnummer <strong className="text-ink">{invoiceNumber}</strong> — die App
                vergibt sie beim Erstellen, lückenlos.
              </p>
            )}
            {numberTaken && (
              <p className="text-sm font-medium text-danger" role="alert">
                Diese Rechnungsnummer ist bereits vergeben.
              </p>
            )}
            {/*
              BEI EINER ANZAHLUNG GIBT ES NICHTS NACHZUWEISEN (G16): die Leistung
              ist noch nicht erbracht, das PDF liess den Nachweis ohnehin weg —
              der Haken stand trotzdem gesetzt da.
            */}
            {art !== 'anzahlung' && (
              <CheckboxField id="invdetail" label="Leistungsnachweis anhängen"
                checked={appendDetail} onChange={(e) => setAppendDetail(e.target.checked)} />
            )}
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
                placeholder="z. B. ATU…"
                value={kundenUid}
                onChange={(e) => setKundenUid(e.target.value)}
                pflicht={uidPruefung.pflicht}
              />
              {uidFormFehler && (
                <p className="mt-1 text-sm text-danger" role="alert">
                  {uidFormFehler}
                </p>
              )}
              {uidWeichtAb && kundeDerVorschau && (
                <CheckboxField
                  id="uid-in-kunden"
                  className="mt-2"
                  label={
                    kundeDerVorschau.vatId?.trim()
                      ? `Auch beim Kunden speichern (dort steht ${kundeDerVorschau.vatId.trim()})`
                      : 'Auch beim Kunden speichern'
                  }
                  checked={uidInKunden}
                  onChange={(e) => setUidInKunden(e.target.checked)}
                />
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

            <InputField
              id="bestellnummer"
              label="Bestellnummer des Kunden"
              placeholder="optional"
              maxLength={60}
              value={bestellnummer}
              onChange={(e) => setBestellnummer(e.target.value)}
            />

            {brauchtBefreiung && (
              <div>
                <InputField
                  id="steuerbefreiung"
                  label="Grund der Steuerbefreiung"
                  placeholder="z. B. Kleinunternehmer, § 6 Abs 1 Z 27 UStG"
                  value={steuerbefreiung}
                  onChange={(e) => setSteuerbefreiung(e.target.value)}
                  pflicht
                />
                <p className="mt-1 text-sm text-ink-muted">
                  Ohne Umsatzsteuer steht auf der Rechnung, warum — Pflicht nach § 11 UStG.
                </p>
              </div>
            )}

            <p className="text-sm text-ink-muted">
              {preview.linkedEntries.length}{' '}
              {preview.linkedEntries.length === 1 ? 'Zeiteintrag wird' : 'Zeiteinträge werden'} als
              verrechnet gesperrt.
            </p>
            {/*
              DER AUSSTELLER GEHÖRT AUF DIE RECHNUNG (Launch-Check, M1): Name
              und Anschrift des leistenden Unternehmers nach § 11 UStG. Nur der
              Name war Pflicht, und RE-2026-1500 ging ohne Anschrift hinaus.
              Die UID fehlt einem Kleinunternehmer zu Recht — sie wird deshalb
              nur angemahnt, nicht erzwungen.
            */}
            {!company?.addressLine?.trim() && (
              <Hinweiszeile stufe="fehl" role="alert">
                <p>
                    Die Anschrift des Betriebs fehlt — sie muss auf jeder Rechnung stehen (§ 11 UStG).{' '}
                    {user && isTopLevel(user.role) ? (
                      <Link to="/settings/firma" className="link-hinweis-weiter">
                        In den Firmendaten eintragen
                      </Link>
                    ) : (
                      'Die Geschäftsführung trägt sie in den Firmendaten ein.'
                    )}
                </p>
              </Hinweiszeile>
            )}
            {/*
              OHNE IBAN NENNT DIE RECHNUNG KEIN KONTO (Testbericht 30.09.2026,
              M19). Das PDF liess die Zeile still weg; bezahlt wird dann per
              Rückfrage oder gar nicht. Eine Warnung, keine Sperre — manche
              Betriebe kassieren bar.
            */}
            {company?.addressLine?.trim() && !company?.iban?.trim() && (
              <p className="text-sm text-warning">
                In den Firmendaten ist keine IBAN hinterlegt — die Rechnung nennt dann kein Konto für
                die Überweisung.
                {user && isTopLevel(user.role) && (
                  <>
                    {' '}
                    <Link to="/settings/firma" className="link-hinweis-weiter">
                      Firmendaten
                    </Link>
                  </>
                )}
              </p>
            )}
            {company?.addressLine?.trim() && !company?.vatId?.trim() && (
              <p className="text-sm text-warning">
                Keine UID-Nummer des Betriebs hinterlegt. Ohne sie ist eine Rechnung über 400 € brutto
                unvollständig — außer der Betrieb ist Kleinunternehmer.
                {user && isTopLevel(user.role) && (
                  <>
                    {' '}
                    <Link to="/settings/firma" className="link-hinweis-weiter">
                      Firmendaten
                    </Link>
                  </>
                )}
              </p>
            )}
            {leer && (
              <p className="text-sm text-warning" role="alert">
                {preview.positions.length === 0
                  ? 'Ohne Positionen gibt es keine Rechnung — bitte eine Position hinzufügen.'
                  : 'Eine Rechnung über null Euro wird nicht angelegt — bitte die Preise eintragen.'}
              </p>
            )}
            <div className="flex flex-col gap-2 sm:flex-row">
              <Button
                onClick={confirmInvoice}
                loading={busy}
                disabled={
                  numberTaken || !invoiceNumber || !rcPruefung.vollstaendig || befreiungFehlt
                  || !!uidFormFehler
                  || !!summen?.gutschrift
                  || !company?.addressLine?.trim() || leer
                }
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
        title={`${sicht ? SICHT_TITEL[sicht] : 'Alle Rechnungen'} (${liste.length})`}
        /*
          DER TEXT SAGT, WAS GILT (Prüflauf 25.09.2026, P2-20). Hier stand,
          „Bezahlt" trage jemand von Hand ein, eine stornierte Rechnung lasse
          sich löschen und ein Storno jederzeit aufheben — keines der drei
          stimmt seit den Zahlungseingängen, § 132 BAO und dem Launch-Check.
        */
        hint={
          'Der Status „Überfällig“ wird beim Öffnen dieser Ansicht automatisch gesetzt, ' +
          'sobald das Zahlungsziel überschritten ist. „Teilbezahlt“ und „Bezahlt“ ergeben ' +
          'sich aus den erfassten Zahlungen (im Menü der Rechnung: „Zahlung erfassen“). ' +
          'Gelöscht wird keine Rechnung — sie bleibt sieben Jahre in den Büchern. Die ' +
          'Korrektur ist der Storno: er behält die Rechnungsnummer (sie darf in der Reihe ' +
          'nicht fehlen) und gibt die verrechneten Stunden und Materialien wieder frei, sodass ' +
          'sie auf eine neue Rechnung können. Aufheben lässt er sich nur am Tag des Stornos. ' +
          'Die Liste zeigt die jüngsten Rechnungen; die Suche nach Nummer, Kunde oder ' +
          'Baustelle geht über alle.'
        }
        action={sicht ? undefined : (
          <SelectField id="invfilter" label="" aria-label="Rechnungen nach Status filtern" className="py-1 text-sm" value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value as typeof statusFilter)}>
            <option value="alle">Alle</option>
            {FILTERSTATI.map((st) => <option key={st} value={st}>{st}</option>)}
          </SelectField>
        )}
        buendig
      >
        {/* Bündig: die Suche gepolstert oben, darunter Zeilen bzw. Tabelle
            von Kante zu Kante (Designlinie „Fassung 3"). Eine Sicht aus der
            Adresse ist schon die Auswahl — dort steht statt der Suche, was
            gefiltert ist. */}
        {sicht ? (
          <div className="p-4">
            <Adressfilter text={SICHT_TITEL[sicht]} parameter={['sicht']} />
          </div>
        ) : (
        <div className="p-4">
          <InputField
            id="invsuche"
            label="Suche"
            type="search"
            placeholder="Rechnungsnummer, Kunde oder Baustelle"
            value={rechnungSuche}
            onChange={(e) => setRechnungSuche(e.target.value)}
          />
          {suchbegriff && suchFehler && (
            <p className="mt-1 text-xs text-warning">
              Die Suche über alle Rechnungen ist gerade nicht erreichbar — gezeigt werden Treffer unter
              den geladenen.
            </p>
          )}
          {serverTreffer && serverTreffer.length >= RECHNUNG_TREFFER && (
            <p className="mt-1 text-xs text-ink-muted">
              Die {RECHNUNG_TREFFER} jüngsten Treffer — für ältere genauer suchen.
            </p>
          )}
        </div>
        )}
        {loading ? (
          <div className="px-4 pb-4">
            <SkeletonList rows={4} />
          </div>
        ) : liste.length === 0 ? (
          <EmptyState>
            {suchbegriff
              ? !serverTreffer && !suchFehler
                ? 'Suche in allen Rechnungen …'
                : `Keine Rechnung passt zu „${suchbegriff}“.`
              : invoices.length === 0
                ? 'Noch keine Rechnungen.'
                : 'Keine Rechnung in dieser Auswahl.'}
          </EmptyState>
        ) : (
          schreibtisch ? (
            /*
              AM SCHREIBTISCH EINE TABELLE (Designlinie „Fassung 3"): Nummer,
              Kunde, Datum, Fällig, Betrag rechtsbündig, Stand. Mahnstand,
              Teilzahlung und Storno stehen klein unter dem Kunden — dieselben
              Zeilen wie am Telefon, aus derselben Funktion.
            */
            <Tabelle
              spalten={[
                { name: 'Nummer' },
                { name: 'Kunde' },
                { name: 'Datum' },
                { name: 'Fällig' },
                { name: 'Betrag', r: true },
                { name: 'Stand' },
                { name: 'Aktionen', versteckt: true },
              ]}
            >
              {liste.map((inv) => (
                <Fragment key={inv.id}>
                <tr>
                  <td className="whitespace-nowrap font-medium text-ink-deep">
                    <button type="button" className="link -my-3 inline-block py-3" onClick={() => setDetailFuer(inv)}>
                      {inv.invoiceNumber}
                    </button>
                  </td>
                  <td>
                    <span className="font-medium text-ink-deep">{inv.customerName}</span>
                    <span className="block text-meta text-ink-muted">{rechnungNotizen(inv)}</span>
                  </td>
                  <td className="whitespace-nowrap">{datumAT(inv.invoiceDate)}</td>
                  <td className="whitespace-nowrap">{datumAT(inv.dueDate)}</td>
                  <td className="r whitespace-nowrap font-medium text-ink-deep">{euro(inv.totalBrutto)}</td>
                  <td>
                    <StatusBadge status={inv.paymentStatus} />
                  </td>
                  <td className="r">{rechnungMenue(inv)}</td>
                </tr>
                {/*
                  DIE STORNORECHNUNG ALS EIGENE ZEILE (Testbericht 30.09.2026,
                  G28). Im Ausgangsbuch ist sie ein eigener Beleg; hier stand
                  sie nur als Vermerk unter der stornierten Rechnung. Sie
                  folgt ihr direkt — so bleibt sichtbar, wozu sie gehört.
                */}
                {inv.stornoNummer && (
                  <tr>
                    <td className="whitespace-nowrap font-medium text-ink-deep">{inv.stornoNummer}</td>
                    <td>
                      <span className="font-medium text-ink-deep">{inv.customerName}</span>
                      <span className="block text-meta text-ink-muted">Stornorechnung zu <span className="nr">{inv.invoiceNumber}</span></span>
                    </td>
                    <td className="whitespace-nowrap">{stornoDatum(inv)}</td>
                    <td className="whitespace-nowrap">—</td>
                    <td className="r whitespace-nowrap font-medium text-ink-deep">{euro(-inv.totalBrutto)}</td>
                    <td><Marke>Stornorechnung</Marke></td>
                    <td className="r">
                      {stornoMenue(inv)}
                    </td>
                  </tr>
                )}
                </Fragment>
              ))}
            </Tabelle>
          ) : (
            <List>
              {liste.map((inv) => (
                <ListRow
                  key={inv.id}
                  title={
                    // Tastfläche 48 px ohne höhere Zeile (U15): senkrechtes Polster, Gegenrand negativ.
                    <button type="button" className="-my-3 block py-3 text-left" onClick={() => setDetailFuer(inv)}>
                      <span className="nr">{inv.invoiceNumber}</span> · {inv.customerName}
                    </button>
                  }
                  wert={euro(inv.totalBrutto)}
                  zustand={<StatusBadge status={inv.paymentStatus} />}
                  subtitle={
                    <>
                      {/*
                        JEDE ANGABE BLEIBT AM STÜCK. Auf 375 px brach die Zeile
                        mitten im Datum — „fällig 2026-" in der einen Zeile,
                        „08-01" in der nächsten. Ein halbes Datum ist keine
                        Angabe mehr, sondern eine Zahlenfolge. Die Zeile darf
                        weiter umbrechen, aber nur ZWISCHEN den Angaben.
                      */}
                      <span className="whitespace-nowrap">{datumAT(inv.invoiceDate)}</span> ·{' '}
                      <span className="whitespace-nowrap">fällig {datumAT(inv.dueDate)}</span>
                      {rechnungNotizen(inv)}
                    </>
                  }
                >
                  {rechnungMenue(inv)}
                </ListRow>
              )).flatMap((zeile, i) => {
                const inv = liste[i];
                if (!inv.stornoNummer) return [zeile];
                return [
                  zeile,
                  <ListRow
                    key={`${inv.id}-storno`}
                    title={`${inv.stornoNummer} · ${inv.customerName}`}
                    wert={euro(-inv.totalBrutto)}
                    zustand={<Marke>Stornorechnung</Marke>}
                    subtitle={`${stornoDatum(inv)} · zu ${inv.invoiceNumber}`}
                  >
                    {stornoMenue(inv)}
                  </ListRow>,
                ];
              })}
            </List>
          )
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
        {!suchbegriff && invoices.length >= grenze && (
          <div className="flex flex-wrap items-center gap-3 border-t border-line px-4 py-3">
            <Button variant="secondary" onClick={() => setGrenze((n) => n + RECHNUNGEN_JE_SEITE)}>
              Ältere Rechnungen laden
            </Button>
            <span className="text-sm text-ink-muted">{grenze} jüngste geladen</span>
          </div>
        )}
      </Card>

      {/*
        Buchhaltungs-Export.

        AM ENDE DER SEITE, nicht mehr am Anfang (Prüflauf 24.09.2026, D12):
        er wird einmal im Monat gebraucht, Liste und „Neue Rechnung" täglich.

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
          'Zahldatum. Eine stornierte Rechnung bleibt mit ihrem Betrag in ihrem Zeitraum stehen ' +
          '— sonst fehlte eine Nummer in der Reihe —, und der Storno kommt als eigene ' +
          'Gegenzeile mit negativem Betrag in den Zeitraum, in dem storniert wurde. So ändert ' +
          'ein späterer Storno die Summe eines schon gemeldeten Monats nicht. Die UID ' +
          'kommt aus dem Kundenstamm; fehlt sie dort, bleibt die Spalte leer. ' +
          'Das ist eine LISTE, keine Buchung — sie beschreibt die Rechnungen und überlässt der ' +
          'Kanzlei, worauf sie bucht. Wer den Kontenrahmen in den Einstellungen hinterlegt, ' +
          'bekommt darunter zusätzlich den fertigen Buchungsstapel für BMD.'
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
              setExportZahlungen(null);
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
              setExportZahlungen(null);
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
            <span className="text-sm text-warning">„Von“ liegt nach „Bis“.</span>
          )}
        </div>
        {exportFehler && <div className="mt-3"><ErrorState message={exportFehler} /></div>}
        {exportZeilen !== null && (() => {
          const e = buildInvoiceCsv(exportZeilen, kunden, exportVon, exportBis);
          return (
            <>
              <p className="mt-3 text-sm text-ink">
                {e.anzahl} {e.anzahl === 1 ? 'Rechnung' : 'Rechnungen'} · Netto{' '}
                {euro(e.summeNetto)} · Brutto {euro(e.summeBrutto)}
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
                  {e.gegenbuchungen > 0 &&
                    ` Storniert wurde in dieser Zeit ${e.gegenbuchungen === 1 ? 'eine frühere Rechnung' : `${e.gegenbuchungen} frühere Rechnungen`} — ${e.gegenbuchungen === 1 ? 'sie steht' : 'sie stehen'} als Gegenzeile im Ausgangsbuch.`}
                </p>
              )}
              {/*
                Eine Luecke im Nummernkreis ist bei jeder Pruefung ein Befund:
                entweder fehlt eine Rechnung, oder sie wurde geloescht statt
                storniert. Das gehoert geklaert, BEVOR der Export in die
                Kanzlei geht — nicht danach.
              */}
              {ohneAbzug.length > 0 && (
                <div className="mt-3">
                  <Hinweiszeile stufe="warn">
                    <p>
                      <strong>Schlussrechnung ohne Abzug der Anzahlung:</strong>{' '}
                      {ohneAbzug.map((o) => `${o.invoiceNumber} (nicht abgezogen: ${o.fehlend})`).join('; ')}.
                      Die Umsatzsteuer der Anzahlung steht damit zweimal auf den Belegen. Berichtigt wird
                      über Storno und eine neue Schlussrechnung — am besten vor der Übergabe an die Kanzlei.
                    </p>
                  </Hinweiszeile>
                </div>
              )}
              {e.luecken.length > 0 && (
                <div className="mt-3">
                  <Hinweiszeile stufe="warn">
                    <p>
                      <strong>Lücke im Nummernkreis:</strong> {e.luecken.join(', ')}. Entweder fehlt
                      eine Rechnung, oder sie wurde gelöscht statt storniert. Das sollte vor der
                      Übergabe an die Kanzlei geklärt sein.
                    </p>
                  </Hinweiszeile>
                </div>
              )}
              <div className="mt-4 flex flex-wrap items-center gap-2">
                <Button
                  variant="secondary"
                  disabled={e.anzahl === 0 && e.gegenbuchungen === 0}
                  onClick={() => {
                    downloadCsv(e.csv, invoiceCsvFilename(exportVon, exportBis));
                    toast.success('Rechnungsausgangsbuch erzeugt');
                  }}
                >
                  Als CSV herunterladen
                </Button>
                {/*
                  DER BUCHUNGSSTAPEL STEHT NEBEN DEM JOURNAL, nicht an seiner
                  Stelle. Beide beantworten verschiedene Fragen, und ein
                  Betrieb ohne hinterlegten Kontenrahmen soll das Journal
                  weiter bekommen, als wäre nichts gewesen.
                */}
                {konten.length > 0 && (() => {
                  const debitorVon = (inv: Invoice) => kundeDerRechnung(inv)?.kundennummer;
                  const b = buildBmdCsv(exportZeilen, konten, exportVon, exportBis, debitorVon);
                  /*
                    DER ZAHLUNGSSTAPEL ERSCHEINT NUR, WENN EIN BANK- ODER
                    SKONTOKONTO HINTERLEGT IST (H7 vorgebaut). Wer die Bank
                    von der Kanzlei buchen lässt, sieht ihn gar nicht — und
                    kann ihn nicht versehentlich doppelt einspielen.
                  */
                  const zs = exportZahlungen && konten.some((k) => k.zweck === 'bank' || k.zweck === 'skonto')
                    ? buildBmdZahlungenCsv(
                      exportZahlungen.zahlungen, exportZahlungen.rechnungen, konten, exportVon, exportBis, debitorVon,
                    )
                    : null;
                  return (
                    <>
                      <Button
                        variant="secondary"
                        /* `fehlend` ist heute schon an den leeren Zeilen ablesbar —
                           die Bedingung steht trotzdem da, weil sie die Absicht
                           benennt und nicht auf eine Zusicherung von anderswo baut. */
                        disabled={b.fehlend.length > 0 || b.zeilen.length === 0}
                        onClick={() => {
                          downloadCsv(b.csv, bmdCsvFilename(exportVon, exportBis));
                          toast.success(`Buchungsstapel erzeugt — ${b.zeilen.length} Zeilen`);
                        }}
                      >
                        Buchungsstapel für BMD
                      </Button>
                      <InfoHint about="den Buchungsstapel">
                        Soll- und Habenkonto je Vorgang, brutto mit Steuercode — so, wie BMD es
                        einliest. Anzahlungen gehen auf das Konto der erhaltenen Anzahlungen und
                        werden mit der Schlussrechnung in den Erlös umgebucht; ein Storno kommt
                        als Gegenbuchung am Stornotag. <strong>Der erste Stapel gehört vor dem
                        Import von deiner Kanzlei geprüft</strong> — die Konten stehen in den
                        Einstellungen und stammen von dort, nicht aus dieser App.
                      </InfoHint>
                      {zs && (
                        <Button
                          variant="secondary"
                          disabled={zs.fehlend.length > 0 || zs.zeilen.length === 0}
                          onClick={() => {
                            downloadCsv(zs.csv, bmdZahlungenFilename(exportVon, exportBis));
                            toast.success(`Zahlungsstapel erzeugt — ${zs.zeilen.length} Zeilen`);
                          }}
                        >
                          Zahlungsstapel für BMD
                        </Button>
                      )}
                      {zs && zs.fehlend.length > 0 && (
                        <div className="mt-2 basis-full">
                          <Hinweiszeile stufe="warn">
                            <p>
                              <strong>Für den Zahlungsstapel fehlt:</strong> {zs.fehlend.join('; ')}.
                            </p>
                          </Hinweiszeile>
                        </div>
                      )}
                      {b.fehlend.length > 0 && (
                        <div className="mt-2 basis-full">
                          <Hinweiszeile stufe="warn">
                            <p>
                              <strong>Im Kontenrahmen fehlt:</strong> {b.fehlend.join('; ')}. Bis
                              dahin gibt es keinen Buchungsstapel — einer mit Lücken importiert
                              sich fehlerfrei und bucht einen zu niedrigen Umsatz.
                            </p>
                          </Hinweiszeile>
                        </div>
                      )}
                    </>
                  );
                })()}
              </div>
            </>
          );
        })()}
      </Card>

      <ConfirmDialog
        open={!!aufheben}
        title="Storno aufheben?"
        message={
          aufheben
            ? `${aufheben.invoiceNumber} gilt danach wieder, und ihre Stunden und ihr Material sind wieder verrechnet. Das geht nur heute, am Tag des Stornos.`
            : ''
        }
        confirmLabel="Storno aufheben"
        confirmTone="primary"
        onCancel={() => setAufheben(null)}
        onConfirm={async () => {
          const inv = aufheben;
          setAufheben(null);
          if (!inv) return;
          try {
            await reactivateInvoice(inv);
            toast.success('Storno aufgehoben');
          } catch (err) {
            toast.error(grundAus(err, 'Der Storno konnte nicht aufgehoben werden.'));
          }
        }}
      />

      <ConfirmDialog
        open={!!stornoBeleg}
        title="Stornorechnung ausstellen?"
        message={
          stornoBeleg
            ? `Sie bekommt die nächste Nummer aus dem Rechnungskreis und das Datum des Stornos. Danach lässt sich der Storno von ${stornoBeleg.invoiceNumber} nicht mehr aufheben.`
            : ''
        }
        confirmLabel="Ausstellen"
        confirmTone="primary"
        onCancel={() => setStornoBeleg(null)}
        onConfirm={async () => {
          if (!stornoBeleg) return;
          await stornorechnungDrucken(stornoBeleg);
          setStornoBeleg(null);
        }}
      />

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
            /*
              OHNE GRUND KEIN STORNO (Testbericht 30.09.2026, H4). Hier stand
              ein Ersatztext, „Storno ohne Angabe" — er beantwortet bei einer
              Prüfung nicht, warum der Umsatz fehlt. Die Datenbank verlangt
              den Grund ebenso; der Dialog bleibt mit der Meldung offen.
            */
            if (!cancelNote.trim()) {
              throw new Error('Bitte einen Grund angeben — er steht in der Liste, im Ausgangsbuch und im Buchungsstapel.');
            }
            await cancelInvoice(toCancel, cancelNote.trim());
            toast.success('Rechnung storniert');
          }
          setToCancel(null);
        }}
      >
        <InputField id="cancelnote" label="Grund (erscheint in der Liste)" required pflicht value={cancelNote}
          onChange={(e) => setCancelNote(e.target.value)} placeholder="z. B. Falscher Kunde" />
      </ConfirmDialog>

      {/*
        ZAHLUNGSEINGÄNGE — ERFASSEN UND NACHSEHEN IN EINEM FENSTER.

        Getrennt wäre es zwei Wege für eine Frage: wer eine Zahlung einträgt,
        will im selben Moment sehen, was schon da war — sonst bucht er die
        Überweisung vom Dienstag ein zweites Mal ein.
      */}
      <RechnungDetail
        inv={detailFuer}
        onClose={() => setDetailFuer(null)}
        onPdf={(i) => void redownload(i as WithId<Invoice>)}
      />
      <ConfirmDialog
        open={!!zahlungFuer}
        title={zahlungFuer ? `Zahlungen — ${zahlungFuer.invoiceNumber}` : 'Zahlungen'}
        message={
          zahlungFuer
            ? `${zahlungFuer.customerName} · Rechnungsbetrag ${euro(zahlungFuer.totalBrutto)}`
              + (zahlstand(zahlungsStand!).guthaben > 0
                ? ` · Guthaben ${euro(zahlstand(zahlungsStand!).guthaben)}`
                : ` · offen ${euro(zahlstand(zahlungsStand!).rest)}`)
            : ''
        }
        confirmLabel={zRichtung === 'rueckzahlung' ? 'Rückzahlung buchen' : 'Zahlung eintragen'}
        confirmTone="primary"
        onCancel={() => setZahlungFuer(null)}
        onConfirm={zahlungSpeichern}
      >
        {zahlungFuer && zRichtung === 'eingang' && (zahlungFuer.paymentStatus === 'Storniert'
          || zahlungFuer.paymentStatus === 'Bezahlt' || zahlungFuer.paymentStatus === 'Überzahlt') && (
          <div className="mb-3">
            <Hinweiszeile stufe="warn">
              <p>
                {zahlungFuer.paymentStatus === 'Storniert'
                  ? 'Diese Rechnung ist storniert. Eine Zahlung hierauf wird zum Guthaben des Kunden.'
                  : 'Diese Rechnung ist schon bezahlt. Eine weitere Zahlung wird zum Guthaben des Kunden.'}
              </p>
            </Hinweiszeile>
          </div>
        )}
        {(zGuthaben > 0 || zRichtung === 'rueckzahlung') && (
          <div className="mb-3">
            <SelectField
              id="z-richtung"
              label="Richtung"
              value={zRichtung}
              onChange={(e) => {
                const neu = e.target.value as 'eingang' | 'rueckzahlung';
                setZRichtung(neu);
                setZSkonto(false);
                setZFehler(null);
                if (neu === 'rueckzahlung') setZBetrag(zahlAlsText(zGuthaben));
              }}
            >
              <option value="eingang">Zahlungseingang vom Kunden</option>
              <option value="rueckzahlung">Rückzahlung an den Kunden (Zahlungsausgang)</option>
            </SelectField>
          </div>
        )}
        <FormGrid cols={2}>
          <InputField
            id="z-datum"
            label="Datum"
            type="date"
            value={zDatum}
            onChange={(e) => setZDatum(e.target.value)}
            required
            pflicht
          />
          <ZahlFeld
            id="z-betrag"
            label={zRichtung === 'rueckzahlung' ? 'Zurückgezahlt (€)' : 'Betrag (€)'}
            negativ={zRichtung === 'eingang'}
            value={zBetrag}
            onChange={(text) => setZBetrag(text)}
            required
            pflicht
          />
          <SelectField
            id="z-art"
            label="Art"
            value={zArt}
            onChange={(e) => setZArt(e.target.value as Zahlungseingang['art'])}
          >
            {(['Überweisung', 'Bar', 'Karte', 'Sonstiges'] as const).map((a) => (
              <option key={a} value={a}>{a}</option>
            ))}
          </SelectField>
          <InputField
            id="z-hinweis"
            label="Hinweis"
            value={zHinweis}
            onChange={(e) => setZHinweis(e.target.value)}
            placeholder="z. B. Kontoauszug 14"
          />
        </FormGrid>
        {/*
          SENKLOT IST KEINE REGISTRIERKASSE. Bar und Karte sind Barumsätze
          (§ 131b BAO); den Beleg dafür erteilt die Kasse des Betriebs. Ohne
          den Satz läge der Schluss nahe, mit dem Eintrag hier sei die
          Belegerteilungspflicht erfüllt.
        */}
        {zRichtung === 'eingang' && (zArt === 'Bar' || zArt === 'Karte') && (
          <p className="mt-2 text-sm text-ink-muted">
            Den Beleg für Bar- und Kartenzahlungen erteilt die Registrierkasse des Betriebs.
            Senklot vermerkt nur die Zahlung.
          </p>
        )}
        {zahlungFuer?.skontoProzent && zahlungFuer.skontoBis && (
          <p className="mt-2 text-sm text-ink-muted">
            Zugesagt: {zahlungFuer.skontoProzent.toLocaleString('de-AT', { maximumFractionDigits: 2 })} %
            Skonto ({euro(zugesagterSkonto(zahlungFuer))}) bei Zahlung bis {datumAT(zahlungFuer.skontoBis)}.
          </p>
        )}
        {skontoAngebot != null && (
          <div className="mt-2">
            <CheckboxField
              id="z-skonto"
              label={`Den Rest von ${euro(skontoAngebot)} als Skonto ausgleichen`}
              checked={zSkonto}
              onChange={(e) => setZSkonto(e.target.checked)}
            />
          </div>
        )}
        <InfoHint about="den Betrag">
          Vorausgefüllt steht der offene Rest, weil er fast immer stimmt. Bei einer Teilzahlung
          wird er überschrieben. Ein Guthaben des Kunden wird als Rückzahlung gebucht; ein
          negativer Eingang ist eine Rücklastschrift.
        </InfoHint>

        {zFehler && <p className="mt-3 text-sm text-danger">{zFehler}</p>}

        <div className="mt-4">
          <p className="section-label">Bisher eingegangen</p>
          {zahlungen === null ? (
            <p className="text-sm text-ink-muted">Wird geladen …</p>
          ) : zahlungen.length === 0 ? (
            <p className="text-sm text-ink-muted">Auf diese Rechnung ist noch nichts eingegangen.</p>
          ) : (
            <List>
              {zahlungen.map((z) => (
                <ListRow
                  key={z.id}
                  title={<span>{z.betrag < 0 ? `Rückzahlung ${euro(-z.betrag)}` : euro(z.betrag)}</span>}
                  subtitle={
                    <span>
                      {datumAT(z.datum)} · {z.art}
                      {z.hinweis ? ` · ${z.hinweis}` : ''}
                      {z.erfasstVonName ? ` · erfasst von ${z.erfasstVonName}` : ''}
                    </span>
                  }
                >
                  {/*
                    ZWEI SCHRITTE STATT EINES NESTED DIALOGS. Ein Fenster im
                    Fenster ist auf dem Telefon nicht zu bedienen; eine
                    Rückfrage braucht es trotzdem, denn hier verschwindet
                    Geld aus der Buchhaltung.
                  */}
                  {zLoeschen === z.id ? (
                    <>
                      <Button
                        variant="danger"
                        onClick={async () => {
                          await deleteZahlung(z.id);
                          if (zahlungFuer) {
                            setZahlungen(await listZahlungen(zahlungFuer.companyId, zahlungFuer.id));
                          }
                          setZLoeschen(null);
                          toast.success('Zahlung gelöscht');
                        }}
                      >
                        Ja, löschen
                      </Button>
                      <Button variant="secondary" onClick={() => setZLoeschen(null)}>
                        Abbrechen
                      </Button>
                    </>
                  ) : (
                    <Button variant="secondary" onClick={() => setZLoeschen(z.id)}>
                      Löschen
                    </Button>
                  )}
                </ListRow>
              ))}
            </List>
          )}
        </div>
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
            ? `${mahnFuer.invoiceNumber} über ${euro(mahnFuer.totalBrutto)}, fällig war ` +
              `${datumAT(mahnFuer.dueDate)}. Der Beleg wird als PDF erzeugt und heruntergeladen; ` +
              'versendet wird er von dir.'
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
        {mahnFuer && naechsteStufe(mahnFuer) && (() => {
          const z = zinsenFuer(mahnFuer, naechsteStufe(mahnFuer)!, todayStr());
          if (z.art === 'berechnet') {
            return (
              <p className="mt-3 text-sm text-ink-muted">
                Verzugszinsen {euro(z.betrag)} ({zinssatzText(z, datumAT)}, {z.tage} Tage
                {z.ab ? ` ab ${datumAT(z.ab)}` : ''}, {z.grundlage}) stehen auf dem
                Beleg.{z.ab ? ' Für die Zeit davor ist kein Basiszinssatz eingetragen.' : ''}
              </p>
            );
          }
          if (z.art === 'fehlt') {
            // Kein stiller Wegfall: wer mahnt, soll wissen, dass die Zinsen fehlen und warum.
            return (
              <p className="mt-3 text-sm text-warning">
                Der Kunde hat eine UID — für Verzugszinsen unter Unternehmern fehlt der
                Basiszinssatz des laufenden Halbjahres (Einstellungen → Rechnungsvorgaben, für die Leitung unter Sätze und Kosten). Die Mahnung
                geht ohne Zinsen hinaus.
              </p>
            );
          }
          return null;
        })()}
      </ConfirmDialog>
    </div>
  );
}
