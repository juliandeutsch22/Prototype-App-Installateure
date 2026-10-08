import { useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useAuth } from '@/app/AuthContext';
import { postenNeuLaden } from '@/app/offenePosten';
import {
  subscribeAllOrders,
  updateOrderStatus,
  deleteOrder,
  ORDER_STATUS_FLOW,
} from '@/lib/db/materialOrders';
import type { WithId } from '@/lib/db/core';
import {
  listGrosshaendler,
  ausLager,
  aufEinkaufsliste,
  listLagerPosten,
  lieferantVorschlag,
  type Grosshaendler,
} from '@/lib/db/einkauf';
import Einkaufsliste from './Einkaufsliste';
import { aufEinkaufsliste as aufDerListe } from './einkauf';
import type { EinkaufPosten, MaterialOrder } from '@/types';
import Card from '@/components/Card';
import Nachladen from '@/components/Nachladen';
import { Marke, Warnung } from '@/components/Badge';
import StatusBadge from '@/components/StatusBadge';
import PageHeader from '@/components/PageHeader';
import ConfirmDialog from '@/components/ConfirmDialog';
import BottomSheet from '@/components/BottomSheet';
import { List, ListRow } from '@/components/ListRow';
import { InputField, SelectField } from '@/components/Field';
import Abschnitt from '@/components/Abschnitt';
import Button from '@/components/Button';
import {
  Arbeitszeile,
  LotVerlauf,
  MehrAnzeigen,
  Sammelleiste,
  Segmente,
  type LotPunkt,
} from '@/components/LotBausteine';
import { byNewest, dayKey, dayHeading, toMillis } from '@/lib/timestamps';
import { useToast } from '@/components/Toast';
import { ErrorState, EmptyState, SkeletonList } from '@/components/States';
import { grundAus } from '@/lib/fehlerGrund';
import { abschlussText } from './abschlussText';
import { fmtMenge } from '@/lib/belegLayout';
import { todayStr } from '@/lib/time';
import Adressfilter from '@/components/Adressfilter';
import { ANFORDERUNGS_FILTER, bekannt, type AnforderungsFilter } from '@/features/dashboard/start/ziele';
import { istAbholbereitAlt, istLieferungHeute, istLieferungUeberfaellig } from './anforderungStand';
import { lieferterminText } from './einkauf';

/** Was ein Filter aus der Adresse zeigt (Startseite, Nachtest 01.10.2026). */
const FILTER_TEXT: Record<AnforderungsFilter, string> = {
  offen: 'nur offene Anforderungen, Eil zuerst',
  eil: 'nur Eilanforderungen',
  'abholbereit-alt': 'seit über 3 Tagen abholbereit',
  'bestellt-ueberfaellig': 'bestellt, Liefertermin überschritten',
  'lieferung-heute': 'Lieferung heute erwartet',
};

function passtZuFilter(o: MaterialOrder, f: AnforderungsFilter, heute: string, jetzt: number): boolean {
  switch (f) {
    case 'offen':
      return o.status === 'Offen';
    case 'eil':
      return !!o.isUrgent && (o.status === 'Offen' || o.status === 'In Bearbeitung');
    case 'abholbereit-alt':
      return istAbholbereitAlt(o, jetzt);
    case 'bestellt-ueberfaellig':
      return istLieferungUeberfaellig(o, heute);
    case 'lieferung-heute':
      return istLieferungHeute(o, heute);
  }
}

type Tab = 'aktiv' | 'einkauf' | 'retouren' | 'archiv';

/*
  DER REITER STEHT IN DER ADRESSE (Regel 7.5 der Linie): „Zurück“, Neuladen
  und ein Lesezeichen landen auf demselben Reiter. „Laufend“ ist der
  Arbeitsstand und braucht keinen Parameter; so bleiben die Verweise der
  Startseite (`/anforderungen?filter=…`) gültig.
*/
const REITER_IN_ADRESSE: Record<Exclude<Tab, 'aktiv'>, string> = {
  einkauf: 'einkauf',
  retouren: 'retouren',
  archiv: 'erledigt',
};

function reiterAusAdresse(wert: string | null): Tab {
  const gefunden = (Object.entries(REITER_IN_ADRESSE) as [Exclude<Tab, 'aktiv'>, string][])
    .find(([, w]) => w === wert);
  return gefunden ? gefunden[0] : 'aktiv';
}

const CONDITION_LABEL: Record<string, string> = {
  neu: 'Neu / OVP',
  gebraucht: 'Gebraucht',
  defekt: 'Defekt',
};

/**
 * Wie viele Anforderungen geladen werden.
 *
 * Ohne Grenze wurde jede Anforderung des Betriebs seit jeher abonniert, nur
 * um die aktuellen zu zeigen. Bei zwanzig Monteuren kommen im Jahr mehrere
 * tausend zusammen.
 */
const ANFORDERUNGEN_JE_SEITE = 200;

/** Gruppen höchstens 20 Zeilen (Regel 4), dann „und N weitere anzeigen“. */
const JE_GRUPPE = 20;

/**
 * DER EINE NÄCHSTE SCHRITT einer Anforderung — der Knopf in der Zeile und
 * die Sammelaktion rufen dafür DIESELBE Funktion der Datenschicht.
 *
 *   Noch niemand hat nachgesehen   „Aus Lager“  → `ausLager` (abholbereit,
 *                                                  der Monteur bekommt die Meldung)
 *   Abholbereit                    „Abgeholt“   → `updateOrderStatus(…, 'Erledigt')`
 *                                                  nach der Rückfrage, denn dabei
 *                                                  wird der Bestand abgezogen
 *
 * Was über die Einkaufsliste läuft, hat hier keinen Schritt: bestellt und
 * geliefert wird im Reiter „Einkauf“. Retouren sind bei der Erfassung schon
 * gebucht.
 */
type Schritt = { art: 'auslager' | 'abholung'; text: string };

function schrittFuer(o: MaterialOrder): Schritt | null {
  if (o.transactionType === 'return') return null;
  if (!o.beschaffung && (o.status === 'Offen' || o.status === 'In Bearbeitung')) {
    return { art: 'auslager', text: 'Aus Lager' };
  }
  if (o.status === 'Abholbereit') return { art: 'abholung', text: 'Abgeholt' };
  return null;
}

/** Datum und Uhrzeit eines Zeitstempels — für den Verlauf. */
function zeitpunkt(v: unknown): string {
  const ms = toMillis(v);
  if (!ms) return '';
  return new Date(ms).toLocaleString('de-AT', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

/**
 * DER VERLAUF EINER ANFORDERUNG, aus den Zeitstempeln, die sie trägt.
 *
 * Ein Protokoll jedes Statuswechsels führt die Datenbank nicht; gezeigt wird
 * deshalb nur, was sich belegen lässt — Anlage, Einkauf, Lieferung, „seit
 * wann abholbereit“. Ein Schritt ohne Zeitstempel steht ohne Zeit da, statt
 * eine Uhrzeit zu erfinden.
 */
function verlaufVon(o: MaterialOrder, haendler: string | undefined): LotPunkt[] {
  const punkte: LotPunkt[] = [
    {
      titel: o.transactionType === 'return' ? 'Retoure erfasst' : 'Angefordert',
      zeit: zeitpunkt(o.createdAt),
      text: o.userName,
    },
  ];
  if (o.transactionType === 'return') return punkte;
  if (o.beschaffung === 'lager') punkte.push({ titel: 'Aus dem Lager zugesagt' });
  if (o.beschaffung === 'einkauf') {
    punkte.push({ titel: 'Auf der Einkaufsliste', text: haendler ?? 'Großhändler noch offen' });
  }
  if (o.bestelltAm) {
    punkte.push({
      titel: 'Beim Großhändler bestellt',
      zeit: zeitpunkt(o.bestelltAm),
      text: !o.geliefertAm && o.liefertermin ? lieferterminText(o.liefertermin) : undefined,
    });
  }
  if (o.geliefertAm) punkte.push({ titel: 'Geliefert', zeit: zeitpunkt(o.geliefertAm) });
  if (o.status === 'In Bearbeitung' && !o.beschaffung) punkte.push({ titel: 'In Bearbeitung' });
  if (o.status === 'Abholbereit' || o.status === 'Erledigt') {
    if (o.abholbereitSeit || o.status === 'Abholbereit') {
      punkte.push({ titel: 'Abholbereit', zeit: zeitpunkt(o.abholbereitSeit) });
    }
  }
  if (o.status === 'Erledigt') punkte.push({ titel: 'Erledigt' });
  // Der letzte Punkt ist der jetzige — ausser die Anforderung ist erledigt.
  if (o.status !== 'Erledigt') punkte[punkte.length - 1] = { ...punkte[punkte.length - 1], jetzt: true };
  return punkte;
}

/** Material-Dashboard: Bestellungen abarbeiten, Retouren sichten, Einkauf. */
export default function AdminOrdersView() {
  const { user, company } = useAuth();
  const toast = useToast();
  /*
    DIE GROSSHÄNDLER — für „Nicht auf Lager" und die Einkaufsliste. Scheitert
    das Laden, bleibt die Liste leer und die Zeile kommt „ohne Grosshändler"
    auf die Einkaufsliste; zugeordnet wird dann dort.
  */
  const [grosshaendler, setGrosshaendler] = useState<WithId<Grosshaendler>[]>([]);
  const [ghStand, setGhStand] = useState(0);
  /**
   * Die eigenen Posten des Büros auf der Einkaufsliste. Kein Live-Abo: sie
   * ändern sich nur hier, und nach jeder Aktion wird neu geladen. Scheitert
   * das Laden, fehlen sie auf der Liste — das sagt die Liste dann auch.
   */
  const [lagerPosten, setLagerPosten] = useState<WithId<EinkaufPosten>[]>([]);
  const [lagerFehler, setLagerFehler] = useState(false);
  const [lagerStand, setLagerStand] = useState(0);
  /** „Nicht auf Lager" — bei welchem Grosshändler eingekauft wird. */
  const [einkaufFragen, setEinkaufFragen] = useState<{ o: WithId<MaterialOrder>; bei: string } | null>(null);
  const [orders, setOrders] = useState<WithId<MaterialOrder>[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [toDelete, setToDelete] = useState<WithId<MaterialOrder> | null>(null);
  const [adresse, setAdresse] = useSearchParams();
  const tab = reiterAusAdresse(adresse.get('reiter'));
  const setTab = (t: Tab) => {
    const neu = new URLSearchParams(adresse);
    if (t === 'aktiv') neu.delete('reiter');
    else neu.set('reiter', REITER_IN_ADRESSE[t]);
    setAdresse(neu);
    // Eine Auswahl gilt für die Liste, auf der sie getroffen wurde.
    setGewaehlt([]);
  };
  /** Ein Filter aus der Adresse — von der Startseite („und N weitere →“). */
  const adressFilter = bekannt(ANFORDERUNGS_FILTER, adresse.get('filter'));
  const [projectFilter, setProjectFilter] = useState('');
  const [suche, setSuche] = useState('');
  /**
   * Wie viele erledigte Anforderungen gezeigt werden.
   *
   * Nach einem Jahr sind das mehrere hundert, und sie standen als eine
   * einzige Liste untereinander. Wer darin etwas sucht, scrollt — und
   * findet nichts. Jetzt: Tagesgruppen, ein Suchfeld und ein Anfang von
   * fünfzig Zeilen, der sich erweitern lässt.
   */
  const [limit, setLimit] = useState(50);
  /** Wie viele Zeilen je Gruppe im Reiter „Laufend“ stehen (Regel 4). */
  const [jeGruppe, setJeGruppe] = useState<Record<string, number>>({});
  /**
   * Wie viele Anforderungen ÜBERHAUPT geholt werden.
   *
   * Das darüber ist die ANZEIGE-Grenze: sie sagt, wie viele der geholten
   * Zeilen untereinander stehen, und lässt sich am Knopf erweitern. Diese
   * hier ist die ABFRAGE-Grenze, und die stand fest bei zweihundert.
   *
   * Der Unterschied fällt erst im Archiv auf: es wächst mit jeder erledigten
   * Anforderung, und ab der zweihundertsten fehlten die ältesten — die Suche
   * fand sie nicht, und nichts unterschied das von „gibt es nicht". Genau
   * derselbe Fehler wie bei den Baustellen im September.
   */
  const [holgrenze, setHolgrenze] = useState(ANFORDERUNGEN_JE_SEITE);
  /** Bestätigung vor dem Abschluss — dabei wird das Lager reduziert. */
  const [toComplete, setToComplete] = useState<WithId<MaterialOrder> | null>(null);
  /** Welche Anforderung im Seitenfenster steht — die Kennung, damit es live mitgeht. */
  const [offenId, setOffenId] = useState<string | null>(null);
  /** Die Auswahl für die Sammelaktion. */
  const [gewaehlt, setGewaehlt] = useState<string[]>([]);
  const [sammelLaeuft, setSammelLaeuft] = useState(false);
  /** Die Sammelaktion enthält Abholungen — sie fragt wie die Einzelaktion vorher nach. */
  const [sammelFrage, setSammelFrage] = useState<WithId<MaterialOrder>[] | null>(null);
  /** Teilfehler der Sammelaktion — je Zeile, damit man sieht, welche hängen blieb. */
  const [zeilenFehler, setZeilenFehler] = useState<Record<string, string>>({});

  useEffect(() => {
    if (!user) return;
    const unsub = subscribeAllOrders(
      user.companyId,
      holgrenze,
      (rows) => {
        setOrders(rows);
        setLoading(false);
      },
      (e) => {
        setError(e.message);
        setLoading(false);
      },
    );
    return unsub;
  }, [user, holgrenze]);

  useEffect(() => {
    if (!user) return;
    let weg = false;
    void listGrosshaendler(user.companyId)
      .then((g) => {
        if (!weg) setGrosshaendler(g);
      })
      .catch(() => undefined);
    return () => {
      weg = true;
    };
  }, [user, ghStand]);

  useEffect(() => {
    if (!user) return;
    let weg = false;
    void listLagerPosten(user.companyId)
      .then((p) => {
        if (weg) return;
        setLagerPosten(p);
        setLagerFehler(false);
      })
      .catch(() => {
        if (!weg) setLagerFehler(true);
      });
    return () => {
      weg = true;
    };
  }, [user, lagerStand]);

  const purchases = useMemo(() => orders.filter((o) => o.transactionType !== 'return'), [orders]);
  /** Wie viele Anforderungen auf der Einkaufsliste noch nicht bestellt sind. */
  const zuBestellen = useMemo(
    () =>
      purchases.filter((o) => aufDerListe(o) && !o.bestelltAm).length +
      lagerPosten.filter((p) => !p.bestelltAm && !p.geliefertAm).length,
    [purchases, lagerPosten],
  );
  const returns = useMemo(() => orders.filter((o) => o.transactionType === 'return'), [orders]);

  const projectOptions = useMemo(
    () => [...new Set(purchases.map((o) => o.projectNumber).filter(Boolean))].sort() as string[],
    [purchases],
  );

  const rows = useMemo(() => {
    const base =
      tab === 'retouren'
        ? returns
        : tab === 'archiv'
          ? purchases.filter((o) => o.status === 'Erledigt')
          : purchases.filter((o) => o.status !== 'Erledigt');
    const heute = todayStr();
    const jetzt = Date.now();
    const gefiltert = adressFilter && tab === 'aktiv'
      ? base.filter((o) => passtZuFilter(o, adressFilter, heute, jetzt))
      : base;
    const nachProjekt = projectFilter
      ? gefiltert.filter((o) => o.projectNumber === projectFilter)
      : gefiltert;
    const q = suche.trim().toLowerCase();
    if (!q) return nachProjekt;
    return nachProjekt.filter((o) =>
      [o.materialName, o.userName, o.projectNumber, o.note].some((v) =>
        v?.toLowerCase().includes(q),
      ),
    );
  }, [tab, purchases, returns, projectFilter, suche, adressFilter]);

  /**
   * Offene Anforderungen nach Arbeitsschritt gruppiert, Eilfälle oben.
   *
   * Vorher lagen Offen, In Bearbeitung und Abholbereit in einer Liste — man
   * musste jede Zeile lesen, um zu wissen, was als Nächstes zu tun ist. Und
   * eine Eilzustellung ging zwischen zwanzig gewöhnlichen Zeilen unter,
   * obwohl genau sie den Anlass zum Handeln gibt.
   */
  const aktivGruppen = useMemo(() => {
    if (tab !== 'aktiv') return [];
    const reihenfolge: MaterialOrder['status'][] = ['Offen', 'In Bearbeitung', 'Abholbereit'];
    return reihenfolge
      .map((status) => ({
        titel: status,
        zeilen: rows
          .filter((o) => o.status === status)
          // Eil zuerst, dann die ältesten: wer am längsten wartet, steht oben.
          .sort((a, b) => Number(!!b.isUrgent) - Number(!!a.isUrgent) || byNewest(b, a)),
      }))
      .filter((g) => g.zeilen.length > 0);
  }, [tab, rows]);

  /** Erledigtes und Retouren nach Tag gruppiert, neueste zuerst. */
  const tagesGruppen = useMemo(() => {
    if (tab === 'aktiv') return [];
    const sortiert = [...rows].sort(byNewest);
    const map = new Map<string, WithId<MaterialOrder>[]>();
    for (const o of sortiert.slice(0, limit)) {
      const k = dayKey(o.createdAt);
      const list = map.get(k) ?? [];
      list.push(o);
      map.set(k, list);
    }
    return [...map.entries()].map(([k, zeilen]) => ({ titel: dayHeading(k), zeilen }));
  }, [tab, rows, limit]);

  const activeCount = purchases.filter((o) => o.status !== 'Erledigt').length;
  const haendlerName = (id?: string | null) => (id ? grosshaendler.find((g) => g.id === id)?.name : undefined);
  const offen = offenId ? orders.find((o) => o.id === offenId) ?? null : null;

  function fehlerWeg(id: string) {
    setZeilenFehler((f) => {
      if (!(id in f)) return f;
      const rest = { ...f };
      delete rest[id];
      return rest;
    });
  }

  async function setStatus(o: WithId<MaterialOrder>, next: MaterialOrder['status']) {
    if (next === o.status) return;
    setBusyId(o.id);
    try {
      await updateOrderStatus(o.id, next);
      // Das Abzeichen im Menü zählt mit — „Offen" ist genau das, was es zählt.
      void postenNeuLaden();
      fehlerWeg(o.id);
      toast.success(`Status: ${next}`);
    } catch (err) {
      // Ohne diesen Zweig blieb ein fehlgeschlagenes Update unbemerkt: der
      // Status sprang nicht um, der Nutzer sah aber keinerlei Hinweis.
      toast.error(grundAus(err, 'Der Status konnte nicht geändert werden.'));
    } finally {
      setBusyId(null);
    }
  }

  async function nimmAusLager(o: WithId<MaterialOrder>) {
    setBusyId(o.id);
    try {
      await ausLager(o.id);
      void postenNeuLaden();
      fehlerWeg(o.id);
      toast.success(`${o.materialName}: aus dem Lager — abholbereit`);
    } catch (err) {
      toast.error(grundAus(err, 'Das konnte nicht gespeichert werden.'));
    } finally {
      setBusyId(null);
    }
  }

  async function fragEinkauf(o: WithId<MaterialOrder>) {
    // Vorschlag: bei wem der Artikel zuletzt einen Preis hatte. Ein Vorschlag
    // — der Lagerist sieht ihn und kann ihn ändern.
    let vorschlag: string | null = null;
    try {
      vorschlag = o.materialId ? await lieferantVorschlag(o.companyId, o.materialId) : null;
    } catch {
      vorschlag = null;
    }
    const bekannt = vorschlag && grosshaendler.some((g) => g.id === vorschlag) ? vorschlag : '';
    setEinkaufFragen({ o, bei: bekannt || (grosshaendler.length === 1 ? grosshaendler[0].id : '') });
  }

  /** Der Knopf in der Zeile: „Aus Lager“ gleich, „Abgeholt“ über die Rückfrage. */
  function schrittEinzeln(o: WithId<MaterialOrder>) {
    const s = schrittFuer(o);
    if (!s) return;
    if (s.art === 'auslager') void nimmAusLager(o);
    else setToComplete(o);
  }

  /*
    DIE SAMMELAKTION GEHT JEDE ANFORDERUNG EINZELN DURCH — mit derselben
    Funktion wie der Knopf in der Zeile. Ein Sammelaufruf an der Datenschicht
    vorbei hätte eigene Regeln, und ein Fehler in der Mitte liesse offen,
    welche durchgingen. So bleibt jede gescheiterte Zeile gewählt und trägt
    ihren Grund.

    KEIN „RÜCKGÄNGIG“: „Aus Lager“ setzt Beschaffung, Status und den
    Zeitstempel „abholbereit seit“ und schickt dem Monteur seine Meldung;
    „Abgeholt“ zieht den Bestand ab. Keine bestehende Funktion stellt das
    genau wieder her — ein Zurücksetzen auf „Offen“ liesse Beschaffung,
    Zeitstempel und Meldung stehen.
  */
  async function sammelAusfuehren(liste: WithId<MaterialOrder>[]) {
    setSammelLaeuft(true);
    const fehler: Record<string, string> = {};
    let gut = 0;
    for (const o of liste) {
      const s = schrittFuer(o);
      if (!s) continue;
      try {
        if (s.art === 'auslager') await ausLager(o.id);
        else await updateOrderStatus(o.id, 'Erledigt');
        gut += 1;
      } catch (err) {
        fehler[o.id] = grundAus(err, 'Das konnte nicht gespeichert werden.');
      }
    }
    void postenNeuLaden();
    setZeilenFehler(fehler);
    setGewaehlt(Object.keys(fehler));
    setSammelLaeuft(false);
    const schlecht = Object.keys(fehler).length;
    if (schlecht === 0) {
      toast.success(gut === 1 ? '1 Anforderung einen Schritt weiter' : `${gut} Anforderungen einen Schritt weiter`);
    } else {
      toast.error(`${gut} weiter, ${schlecht} nicht — der Grund steht an der Zeile.`);
    }
  }

  function sammelStarten() {
    const liste = orders.filter((o) => gewaehlt.includes(o.id) && schrittFuer(o));
    if (liste.length === 0) return;
    // Wer einzeln abschliesst, wird gefragt — gesammelt also auch.
    if (liste.some((o) => schrittFuer(o)?.art === 'abholung')) setSammelFrage(liste);
    else void sammelAusfuehren(liste);
  }

  if (!user) return null;

  /*
    „LAUFEND", NICHT „OFFEN". Der Reiter zählt alles, was noch nicht erledigt
    ist — offen, in Bearbeitung, abholbereit. Das Abzeichen im Menü zählt nur
    die noch unberührten, die auf jemanden warten. Hiessen beide „offen",
    stünde im Menü 1 und am Reiter 3, und eine der beiden Zahlen sähe falsch
    aus (Prüflauf 24.09.2026, F13).
  */
  const TABS: { key: Tab; label: string; count?: number }[] = [
    { key: 'aktiv', label: 'Laufend', count: activeCount },
    { key: 'einkauf', label: 'Einkauf', count: zuBestellen },
    { key: 'retouren', label: 'Retouren', count: returns.length },
    { key: 'archiv', label: 'Erledigt' },
  ];

  /** Was unter dem Titel einer Anforderung steht — in jedem Reiter gleich. */
  const meta = (o: WithId<MaterialOrder>) => (
    <>
      {o.userName}
      {o.projectNumber && <> · <span className="nr">{o.projectNumber}</span></>}
      {o.condition && ` · ${CONDITION_LABEL[o.condition] ?? o.condition}`}
      {o.bestelltAm && !o.geliefertAm && o.liefertermin && ` · ${lieferterminText(o.liefertermin)}`}
    </>
  );

  /*
    DIE NOTIZ BEKOMMT EINE EIGENE ZEILE. Angehängt an Name und Baustelle, im
    selben Grau, ging sie unter — gemeldet als „wird nirgends angezeigt". Sie
    ist oft das Einzige, was die Projektleitung wirklich lesen muss („bis
    Donnerstag", „Kiste im Keller").
  */
  const notiz = (o: WithId<MaterialOrder>) =>
    o.note ? (
      <span className="mt-1 block text-meta text-ink">
        <span className="font-normal">Notiz:</span> {o.note}
      </span>
    ) : null;

  /** Woher das Material kommt — Lager oder Einkauf samt Großhändler. */
  const beschaffungMarke = (o: WithId<MaterialOrder>) =>
    o.beschaffung === 'lager' ? (
      <Marke>aus Lager</Marke>
    ) : o.beschaffung === 'einkauf' ? (
      <Marke>
        {o.geliefertAm ? 'geliefert' : o.bestelltAm ? 'bestellt' : 'Einkaufsliste'}
        {haendlerName(o.supplierId) ? ` · ${haendlerName(o.supplierId)}` : ''}
      </Marke>
    ) : null;

  const darfNichtAufLager = (o: WithId<MaterialOrder>) =>
    o.transactionType !== 'return' && !o.beschaffung && (o.status === 'Offen' || o.status === 'In Bearbeitung');

  const ausgewaehlteMitSchritt = gewaehlt.filter((id) => {
    const o = orders.find((x) => x.id === id);
    return !!o && !!schrittFuer(o);
  });

  return (
    <div className="space-y-3 lg:space-y-5">
      <PageHeader
        title="Anforderungen"
        subtitle="Materialanforderungen der Monteure bearbeiten und Rückgaben sichten"
        hilfe={
          <>
            Laufend steht nach Arbeitsschritt geordnet, Eilzustellungen oben. Eine Zeile öffnet die
            Anforderung mit Verlauf und allen Aktionen; der Knopf daneben ist der übliche nächste
            Schritt. Mit den Kästchen lassen sich mehrere auf einmal weiterschalten.
          </>
        }
      />

      <div className="bereichswahl">
      <Segmente
        name="Bereich"
        werte={TABS.map((t) => ({
          wert: t.key,
          text: t.count ? `${t.label} ${t.count}` : t.label,
        }))}
        wert={tab}
        onChange={setTab}
      />
      </div>

      {adressFilter && tab === 'aktiv' && (
        <Adressfilter text={FILTER_TEXT[adressFilter]} parameter={['filter']} />
      )}

      {tab === 'aktiv' && (
        <Sammelleiste
          anzahl={ausgewaehlteMitSchritt.length}
          aktion={{ text: 'Alle: nächster Schritt', onClick: sammelStarten, laeuft: sammelLaeuft }}
          onAufheben={() => setGewaehlt([])}
        />
      )}

      {tab === 'einkauf' && company ? (
        <>
          {lagerFehler && (
            <ErrorState message="Das eigene Material auf der Einkaufsliste konnte nicht geladen werden — die Liste zeigt nur die Anforderungen." />
          )}
          <Einkaufsliste
            company={company}
            meinUid={user.uid}
            meinName={user.name}
            anforderungen={purchases}
            lagerPosten={lagerPosten}
            grosshaendler={grosshaendler}
            onGrosshaendlerGeaendert={() => setGhStand((n) => n + 1)}
            onLagerGeaendert={() => setLagerStand((n) => n + 1)}
          />
        </>
      ) : (
        <Card
          title={tab === 'retouren' ? 'Retouren' : tab === 'archiv' ? 'Erledigt' : 'Offene Bestellungen'}
          action={
            tab !== 'retouren' && projectOptions.length > 0 ? (
              <SelectField id="ofilter" label="" aria-label="Bestellungen nach Baustelle filtern" className="py-1 text-sm" value={projectFilter}
                onChange={(e) => setProjectFilter(e.target.value)}>
                <option value="">Alle Baustellen</option>
                {projectOptions.map((p) => <option key={p} value={p}>{p}</option>)}
              </SelectField>
            ) : undefined
          }
          buendig
        >
          {orders.length >= 10 && (
            <div className="p-4">
              <InputField
                id="osuche"
                label="Suche"
                type="search"
                placeholder="Material, Besteller, Baustelle oder Notiz"
                value={suche}
                onChange={(e) => setSuche(e.target.value)}
              />
            </div>
          )}
          {loading ? (
            <div className="p-4">
              <SkeletonList rows={4} />
            </div>
          ) : error ? (
            <div className="p-4">
              <ErrorState message={error} />
            </div>
          ) : rows.length === 0 ? (
            <EmptyState>
              {suche
                ? `Nichts passt zu „${suche}“.`
                : tab === 'retouren'
                  ? 'Keine Retouren erfasst.'
                  : tab === 'archiv'
                    ? 'Noch nichts erledigt.'
                    : adressFilter
                      ? 'Zu diesem Filter steht nichts an.'
                      : 'Aktuell keine offenen Bestellungen.'}
            </EmptyState>
          ) : tab === 'aktiv' ? (
            <div>
              {aktivGruppen.map((g) => {
                const zeigen = jeGruppe[g.titel] ?? JE_GRUPPE;
                return (
                  <div key={g.titel}>
                    <Abschnitt titel={g.titel} anzahl={g.zeilen.length} />
                    <ul>
                      {g.zeilen.slice(0, zeigen).map((o) => {
                        const s = schrittFuer(o);
                        const name = `${o.materialName} ×${fmtMenge(o.quantity)}`;
                        return (
                          <Arbeitszeile
                            key={o.id}
                            name={name}
                            gewaehlt={gewaehlt.includes(o.id)}
                            onWahl={
                              s
                                ? (an) => setGewaehlt((alt) => (an ? [...alt, o.id] : alt.filter((x) => x !== o.id)))
                                : undefined
                            }
                            onOeffnen={() => setOffenId(o.id)}
                            schritt={
                              s
                                ? { text: s.text, onClick: () => schrittEinzeln(o), laeuft: busyId === o.id || sammelLaeuft }
                                : undefined
                            }
                          >
                            <span className="zeile-text">
                              <span className="zeile-titel block">
                                {o.materialName}{' '}
                                <span className="text-ink-muted">×{fmtMenge(o.quantity)}</span>
                              </span>
                              <span className="zeile-meta block">{meta(o)}</span>
                              {notiz(o)}
                              {zeilenFehler[o.id] && (
                                <span className="mt-1 block text-sm text-danger" role="alert">
                                  {zeilenFehler[o.id]}
                                </span>
                              )}
                            </span>
                            <span className="anf-marken">
                              {o.isUrgent && <Warnung stufe="dringend">Eil</Warnung>}
                              {beschaffungMarke(o)}
                            </span>
                          </Arbeitszeile>
                        );
                      })}
                    </ul>
                    <MehrAnzeigen
                      anzahl={Math.max(0, g.zeilen.length - zeigen)}
                      onClick={() => setJeGruppe((j) => ({ ...j, [g.titel]: zeigen + JE_GRUPPE }))}
                    />
                  </div>
                );
              })}
              {/*
                Die ABFRAGE-Grenze: „und N weitere“ zeigt nur mehr von dem, was
                schon geladen ist. Wer sucht und nichts findet, muss den
                Unterschied erfahren.
              */}
              <Nachladen
                geladen={orders.length}
                grenze={holgrenze}
                onMehr={() => setHolgrenze((g) => g + ANFORDERUNGEN_JE_SEITE)}
                einheit="Anforderungen"
                sucheSatz="Nach Artikel, Person, Baustelle und Notiz wird nur in diesen gesucht."
              />
              {ausgewaehlteMitSchritt.length > 0 && <div className="sammel-platz" aria-hidden="true" />}
            </div>
          ) : (
            <div>
              {tagesGruppen.map((g) => (
                <div key={g.titel}>
                  <Abschnitt titel={g.titel} anzahl={g.zeilen.length} />
                  <List>
                    {g.zeilen.map((o) => (
                      <ListRow
                        key={o.id}
                        onOeffnen={() => setOffenId(o.id)}
                        title={
                          <span>
                            {o.materialName}{' '}
                            <span className="text-ink-muted">×{fmtMenge(o.quantity)}</span>
                          </span>
                        }
                        subtitle={
                          <>
                            {meta(o)}
                            {notiz(o)}
                          </>
                        }
                        zustand={
                          o.transactionType === 'return' ? <Marke>Retoure</Marke> : <StatusBadge status={o.status} />
                        }
                        pfeil
                      >
                        {o.isUrgent && <Warnung stufe="dringend">Eil</Warnung>}
                        {beschaffungMarke(o)}
                      </ListRow>
                    ))}
                  </List>
                </div>
              ))}

              <MehrAnzeigen
                anzahl={Math.max(0, rows.length - limit)}
                onClick={() => setLimit((n) => n + 50)}
              />

              <Nachladen
                geladen={orders.length}
                grenze={holgrenze}
                onMehr={() => setHolgrenze((g) => g + ANFORDERUNGEN_JE_SEITE)}
                einheit="Anforderungen"
                sucheSatz="Nach Artikel, Person, Baustelle und Notiz wird nur in diesen gesucht."
              />
            </div>
          )}
        </Card>
      )}

      {/*
        DAS SEITENFENSTER EINER ANFORDERUNG: Angaben, Notiz, Verlauf und ALLE
        Aktionen — der nächste Schritt, „Nicht auf Lager“, jeder andere Status
        (damit lässt sich eine versehentlich abgeschlossene Anforderung
        zurückholen) und das Löschen. Bis zum Umbau lagen Status und Löschen
        im „⋯“ der Zeile. Jede Aktion schliesst das Fenster zuerst, damit ihre
        Rückfrage nicht hinter ihm steht.
      */}
      <BottomSheet
        open={!!offen}
        onClose={() => setOffenId(null)}
        label="Anforderung"
        auchBreit
        titel={offen?.materialName ?? 'Anforderung'}
      >
        {offen && (
          <div className="space-y-5">
            <dl className="angaben">
              <div className="angabe">
                <dt>Menge</dt>
                <dd>{fmtMenge(offen.quantity)}</dd>
              </div>
              <div className="angabe">
                <dt>Angefordert von</dt>
                <dd>{offen.userName || '—'}</dd>
              </div>
              <div className="angabe">
                <dt>Baustelle</dt>
                <dd className="nr">{offen.projectNumber || 'ohne Baustelle'}</dd>
              </div>
              <div className="angabe">
                <dt>Stand</dt>
                <dd>
                  {offen.transactionType === 'return' ? <Marke>Retoure</Marke> : <StatusBadge status={offen.status} />}
                  {offen.isUrgent && <> <Warnung stufe="dringend">Eil</Warnung></>}
                </dd>
              </div>
              {offen.condition && (
                <div className="angabe">
                  <dt>Zustand</dt>
                  <dd>{CONDITION_LABEL[offen.condition] ?? offen.condition}</dd>
                </div>
              )}
              {offen.beschaffung && (
                <div className="angabe">
                  <dt>Beschaffung</dt>
                  <dd>{beschaffungMarke(offen)}</dd>
                </div>
              )}
            </dl>

            {offen.note && (
              <div>
                <p className="section-label">Notiz</p>
                <p className="text-fliess text-ink">{offen.note}</p>
              </div>
            )}

            <LotVerlauf name="Verlauf der Anforderung" punkte={verlaufVon(offen, haendlerName(offen.supplierId))} />

            <div className="material-aktionen">
              {(() => {
                const s = schrittFuer(offen);
                return s ? (
                  <Button
                    loading={busyId === offen.id}
                    onClick={() => {
                      setOffenId(null);
                      schrittEinzeln(offen);
                    }}
                  >
                    {s.text}
                  </Button>
                ) : null;
              })()}
              {darfNichtAufLager(offen) && (
                <Button
                  variant="secondary"
                  disabled={busyId === offen.id}
                  onClick={() => {
                    setOffenId(null);
                    void fragEinkauf(offen);
                  }}
                >
                  Nicht auf Lager – auf die Einkaufsliste
                </Button>
              )}
            </div>

            {/*
              DIE FREIE STATUSWAHL BLEIBT (Prüflauf 24.09.2026, D11): eine
              versehentlich abgeschlossene Anforderung lässt sich so
              zurückholen — „Auf „Offen“ setzen“ ist das „Zurück auf Offen“.
            */}
            {offen.transactionType !== 'return' && busyId !== offen.id && (
              <div>
                <p className="section-label mb-2">Status von Hand setzen</p>
                <div className="material-status">
                  {ORDER_STATUS_FLOW.filter((st) => st !== offen.status).map((st) => (
                    <Button
                      key={st}
                      variant="secondary"
                      onClick={() => {
                        setOffenId(null);
                        if (st === 'Erledigt') setToComplete(offen);
                        else void setStatus(offen, st);
                      }}
                    >
                      {`Auf „${st}“ setzen`}
                    </Button>
                  ))}
                </div>
              </div>
            )}

            <div className="material-gefahr">
              <Button
                variant="danger"
                onClick={() => {
                  setOffenId(null);
                  setToDelete(offen);
                }}
              >
                Anforderung löschen …
              </Button>
            </div>
          </div>
        )}
      </BottomSheet>

      <ConfirmDialog
        open={!!einkaufFragen}
        title="Auf die Einkaufsliste?"
        confirmLabel="Auf die Liste"
        confirmTone="primary"
        message={
          einkaufFragen
            ? `„${einkaufFragen.o.materialName}“ ×${einkaufFragen.o.quantity} ist nicht im Lager und wird beim Großhändler bestellt.`
            : ''
        }
        onCancel={() => setEinkaufFragen(null)}
        onConfirm={async () => {
          const f = einkaufFragen;
          setEinkaufFragen(null);
          if (!f) return;
          try {
            await aufEinkaufsliste(f.o.id, f.bei || null);
            void postenNeuLaden();
            fehlerWeg(f.o.id);
            toast.success('Auf der Einkaufsliste');
          } catch (err) {
            toast.error(grundAus(err, 'Das konnte nicht gespeichert werden.'));
          }
        }}
      >
        {einkaufFragen && (
          <SelectField
            id="einkauf-bei"
            label="Großhändler"
            value={einkaufFragen.bei}
            onChange={(e) => setEinkaufFragen({ ...einkaufFragen, bei: e.target.value })}
          >
            <option value="">— später zuordnen —</option>
            {grosshaendler.map((g) => (
              <option key={g.id} value={g.id}>{g.name}</option>
            ))}
          </SelectField>
        )}
      </ConfirmDialog>

      <ConfirmDialog
        open={!!toComplete}
        title="Bestellung abschließen?"
        confirmLabel="Abschließen"
        confirmTone="primary"
        message={
          toComplete
            ? abschlussText(toComplete)
            : ''
        }
        onCancel={() => setToComplete(null)}
        onConfirm={async () => {
          if (toComplete) await setStatus(toComplete, 'Erledigt');
          setToComplete(null);
        }}
      />

      {/*
        DIE RÜCKFRAGE DER SAMMELAKTION. Sie nennt jede Abholung mit demselben
        Satz wie die Rückfrage der Einzelaktion — nicht strenger, aber auch
        nicht lockerer: was vom Bestand abgezogen wird, steht da.
      */}
      <ConfirmDialog
        open={!!sammelFrage}
        title={
          sammelFrage && sammelFrage.length === 1
            ? '1 Anforderung weiterschalten?'
            : `${sammelFrage?.length ?? 0} Anforderungen weiterschalten?`
        }
        confirmLabel="Weiterschalten"
        confirmTone="primary"
        message={(() => {
          const ausLagerZahl = (sammelFrage ?? []).filter((o) => schrittFuer(o)?.art === 'auslager').length;
          return ausLagerZahl > 0
            ? `${ausLagerZahl === 1 ? '1 Anforderung wird' : `${ausLagerZahl} Anforderungen werden`} aus dem Lager abholbereit. Abgeholt und abgeschlossen werden:`
            : 'Abgeholt und abgeschlossen werden:';
        })()}
        onCancel={() => setSammelFrage(null)}
        onConfirm={async () => {
          const liste = sammelFrage;
          setSammelFrage(null);
          if (liste) await sammelAusfuehren(liste);
        }}
      >
        <ul className="space-y-2 text-sm">
          {(sammelFrage ?? [])
            .filter((o) => schrittFuer(o)?.art === 'abholung')
            .map((o) => (
              <li key={o.id}>{abschlussText(o)}</li>
            ))}
        </ul>
      </ConfirmDialog>

      <ConfirmDialog
        open={!!toDelete}
        title="Eintrag löschen?"
        message={toDelete ? `„${toDelete.materialName}“ ×${toDelete.quantity} wird entfernt.` : ''}
        onCancel={() => setToDelete(null)}
        onConfirm={async () => {
          if (toDelete) {
            await deleteOrder(toDelete.id);
            // Auch das Löschen nimmt einen offenen Posten weg.
            void postenNeuLaden();
            setGewaehlt((alt) => alt.filter((x) => x !== toDelete.id));
            toast.success('Eintrag gelöscht');
          }
          setToDelete(null);
        }}
      />
    </div>
  );
}
