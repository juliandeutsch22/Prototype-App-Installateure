import { lazy, Suspense, useEffect, useMemo, useState } from 'react';
import Fensteraktionen from '@/components/Fensteraktionen';
import { istKnapp } from './lagerartikel';
import { useSearchParams } from 'react-router-dom';
import RowMenu from '@/components/RowMenu';
import { useAuth } from '@/app/AuthContext';
import { canProcessOrders, darfKatalogEinspielen } from '@/lib/permissions';
import { useModul } from '@/lib/useModule';
import {
  katalogAnzahl,
  katalogBeobachten,
  LOW_STOCK_THRESHOLD,
  lagerListe,
  lagerBeobachten,
  nummernTreffer,
  NUMMER_AB,
  kommissionsartikelImLager,
  type LagerListe,
  type LagerZeile,
} from '@/lib/db/materials';
import ConfirmDialog from '@/components/ConfirmDialog';
import { grundAus } from '@/lib/fehlerGrund';
import { fmtMenge } from '@/lib/belegLayout';
import { bestandBeobachten, bestandDesArtikels } from '@/lib/db/lagerorte';
import type { WithId } from '@/lib/db/core';
import type { Material } from '@/types';
import Card from '@/components/Card';
import Button from '@/components/Button';
import { Warnung } from '@/components/Badge';
import Metric, { MetricRow } from '@/components/Metric';
import PageHeader from '@/components/PageHeader';
import BottomSheet from '@/components/BottomSheet';
import { List, ListRow } from '@/components/ListRow';
import { Masslinie } from '@/components/Planlinie';
import { InputField } from '@/components/Field';
import { Listenleiste, MehrAnzeigen, Segmente } from '@/components/LotBausteine';
import { useToast } from '@/components/Toast';
import { schluessel, useGemerkt } from '@/lib/zwischenspeicher';
import { ErrorState, EmptyState, SkeletonList } from '@/components/States';
import MaterialCatalog from './MaterialCatalog';
import { Bewegungsverlauf, InventurDialog, OrtWahl, UmlagernDialog, WareneingangDialog } from './LagerDialoge';
import LagerorteFenster from './LagerorteFenster';
import Zaehllisten from './Zaehllisten';
import { useLagerorte } from './useLagerorte';
import { HAUPTLAGER, ortNameVon, ortReihenfolge, weitereOrte } from './lagerorte';

/*
  Der Katalogimport wird erst beim Öffnen geladen. Er bringt den
  DATANORM-Leser mit, und den braucht niemand, der nur den Bestand nachsieht.
*/
const KatalogImport = lazy(() => import('@/features/materials/KatalogImport'));
const OffeneLieferantenartikel = lazy(() => import('@/features/materials/OffeneLieferantenartikel'));

type Tab = 'bestand' | 'katalog' | 'inventur' | 'import' | 'zuordnen';
/** Der Filter des Bestands — „knapp“ schliesst „fehlt“ ein, wie auf der Startseite. */
type Filter = 'alle' | 'knapp' | 'fehlt';

const darfEinspielenFuer = (user: Parameters<typeof darfKatalogEinspielen>[0] | null | undefined) =>
  user ? darfKatalogEinspielen(user) : false;

/** Gruppen höchstens 20 Zeilen (Regel 4) — auch die Artikelwahl. */
const JE_SEITE = 20;

/**
 * Lager — eigener Bereich statt versteckter vierter Reiter unter
 * „Bestellungen".
 *
 * Dort hat ihn niemand vermutet, und das ist kein Wunder: Wer Bestand
 * pflegen will, sucht nicht unter Bestellungen. Der Katalog ist derselbe
 * geblieben; neu ist die Bestandsansicht davor, die zeigt, was knapp wird
 * und wie viel bereits für offene Anforderungen reserviert ist.
 */
export default function StockView() {
  const { user } = useAuth();
  const toast = useToast();
  /*
    DER REITER STEHT IN DER ADRESSE (Testbericht 30.09.2026, G8): „Zurück“,
    Neuladen und ein geteilter Link landen auf demselben Reiter. Vorher
    blieb die Adresse /lager, und ein Neuladen im Katalog sprang auf den
    Bestand zurück. Ein unbekannter oder nicht erlaubter Wert gilt als Bestand.
  */
  const [params, setParams] = useSearchParams();
  const gewuenscht = params.get('reiter');
  /*
    OFFENE LIEFERANTENARTIKEL (M03a): wie das Einspielen nur für wen
    Kataloge einspielt, und nur mit dem Modul „Kataloge mehrerer
    Großhändler“.
  */
  const zuordnenAn = useModul('material.katalogversionen');
  const tab: Tab = gewuenscht === 'katalog' || gewuenscht === 'inventur'
    || (gewuenscht === 'import' && darfEinspielenFuer(user))
    || (gewuenscht === 'zuordnen' && darfEinspielenFuer(user) && zuordnenAn)
    ? gewuenscht
    : 'bestand';
  const setTab = (t: Tab) => {
    const neu = new URLSearchParams(params);
    if (t === 'bestand') neu.delete('reiter');
    else neu.set('reiter', t);
    setParams(neu);
  };
  // Die Leitung — oder die Verwaltung mit Freigabe „Katalog einspielen“ (M37).
  const darfEinspielen = user ? darfKatalogEinspielen(user) : false;
  /*
    DIE LAGERLISTE KOMMT AUS DER DATENBANK (`lager_liste`, Durchsicht
    15.11.2026, Budget B3): die gezeigte Seite und die Zahlen über alle
    Lagerartikel — gesucht, gefiltert, nach dem Freien sortiert und gezählt
    nach denselben Regeln wie bisher hier. Vorher kam jeder Lagerartikel samt
    seinem Freien in den Browser (gewachsener Bestand: 2.000 und 1.000
    Zeilen), um 20 davon zu zeigen. `null`: noch nicht da.
  */
  const [liste, setListe] = useState<LagerListe | null>(null);
  /** Für welchen Ort die Liste gefragt war (leer = Hauptlager) — beim Wechsel steht bis zur Antwort ein Platzhalter. */
  const [listeOrt, setListeOrt] = useState('');
  const [error, setError] = useState<string | null>(null);
  /**
   * Eine Runde weiter, wenn sich im Lager etwas geändert hat (Artikel,
   * Anforderungen, eine eigene Buchung) oder nach „Erneut versuchen“: die
   * Liste fragt dann neu.
   */
  const [runde, setRunde] = useState(0);
  const [search, setSearch] = useState('');
  /*
    DER FILTER STEHT IN DER ADRESSE (Regel 7.5). „knapp“ kam schon vorher von
    der Startseite (`/lager?filter=knapp`, Nachtest 01.10.2026) und stand als
    Hinweiszeile über der Liste; jetzt ist er eines der drei Segmente.
  */
  /*
    DER LAGERORT STEHT IN DER ADRESSE (M04a), wie Reiter und Filter: leer =
    Hauptlager, die Ansicht wie bisher. Ein weiterer Ort zeigt, was dort
    liegt — ohne Reservierung, frei ist dort, was liegt.
  */
  const lo = useLagerorte();
  const ortWert = params.get('ort') ?? HAUPTLAGER;
  const weitere = useMemo(() => weitereOrte(lo.orte), [lo.orte]);
  const ort = weitere.some((o) => o.id === ortWert) ? ortWert : HAUPTLAGER;
  const setOrt = (o: string) => {
    const neu = new URLSearchParams(params);
    if (o) neu.set('ort', o);
    else neu.delete('ort');
    setParams(neu, { replace: true });
  };
  const filterWert = params.get('filter');
  const filter: Filter = filterWert === 'knapp' || filterWert === 'fehlt' ? filterWert : 'alle';
  const setFilter = (f: Filter) => {
    const neu = new URLSearchParams(params);
    if (f === 'alle') neu.delete('filter');
    else neu.set('filter', f);
    setParams(neu, { replace: true });
  };
  /**
   * Welcher Artikel im Katalog geöffnet werden soll.
   *
   * AUS DEM BETRIEB: im Lager gab es nur den Wareneingang. Alles andere —
   * eine falsche Bezeichnung, eine vertauschte Artikelnummer, ein Bestand,
   * der nach der Inventur nicht stimmt — ging nur über den Katalogreiter, wo
   * man den Artikel erneut suchen musste. Die Bearbeitung liegt weiterhin
   * dort (sie ist dieselbe und soll es bleiben), aber der Weg dorthin führt
   * jetzt direkt aus dem Artikel.
   */
  const [zuBearbeiten, setZuBearbeiten] = useState<WithId<Material> | null>(null);
  const [gezeigt, setGezeigt] = useState(JE_SEITE);

  /*
    DER LETZTE STAND (Stufe 3, `lib/zwischenspeicher.ts`): Liste und Zahl des
    Katalogs stehen beim zweiten Besuch sofort da; frisch geholt wird im
    Hintergrund. Gemerkt wird nur die Liste ohne Suche, Filter und Ort, so wie
    sie beim Öffnen steht.
  */
  const { anfang, merken } = useGemerkt<{ liste: LagerListe; imKatalog: number }>(
    user ? schluessel('lagerStand', user) : null,
  );
  const listeJetzt = liste ?? anfang?.liste ?? null;

  /*
    AUCH ÜBER DIE NUMMER EINES GROSSHÄNDLERS (M03a): die Nummern der
    zugeordneten Großhändler und die EAN kennt eine eigene Suche. Sie nennt
    die passenden Artikel (ab drei Zeichen, kurz nach dem letzten
    Tastendruck), und die Lagerliste nimmt sie dazu.
  */
  const [ueberNummer, setUeberNummer] = useState<{ fuer: string; ids: Set<string> }>({ fuer: '', ids: new Set() });
  useEffect(() => {
    const q = search.trim();
    if (q.length < NUMMER_AB) return;
    let weg = false;
    const t = setTimeout(() => {
      void nummernTreffer(q).then((treffer) => {
        if (!weg) setUeberNummer({ fuer: q, ids: new Set(treffer.keys()) });
      });
    }, 250);
    return () => {
      weg = true;
      clearTimeout(t);
    };
  }, [search]);
  const begriff = search.trim();
  const nummernIds = ueberNummer.fuer === begriff ? [...ueberNummer.ids].sort().join(',') : '';

  useEffect(() => {
    if (!user) return;
    try {
      return lagerBeobachten(user.companyId, () => setRunde((n) => n + 1));
    } catch {
      // Ohne Meldeweg steht die Liste trotzdem; sie fragt nach eigenen Buchungen neu.
      return undefined;
    }
  }, [user]);

  /*
    BESTAND AN WEITEREN ORTEN (M04a): live — bucht jemand (eine Umlagerung,
    ein Haken aus dem Fahrzeug), holt die Ansicht neu. Nur mit der Fähigkeit.
  */
  const [ortStand, setOrtStand] = useState(0);
  useEffect(() => {
    if (!user || !lo.an) return;
    try {
      return bestandBeobachten(user.companyId, () => setOrtStand((n) => n + 1));
    } catch {
      // Ohne Meldeweg steht der Bestand trotzdem; er wird nach eigenen Buchungen neu geholt.
      return undefined;
    }
  }, [user, lo.an]);

  /*
    DIE GEZEIGTE SEITE: Suche (samt Treffern über Nummern), Filter, am
    weiteren Ort dessen Bestand nach Namen, so viele Zeilen wie gezeigt.
    Getippt wird kurz abgewartet; eine Antwort zu einem älteren Begriff wird
    verworfen. Neu gefragt wird bei jeder Runde und an einem weiteren Ort bei
    jeder Buchung dort.
  */
  const imOrtStand = ort ? ortStand : 0;
  useEffect(() => {
    if (!user) return;
    let weg = false;
    const t = setTimeout(() => {
      lagerListe({
        begriff,
        treffer: nummernIds ? nummernIds.split(',') : [],
        filter: ort ? 'alle' : filter,
        reihenfolge: ort ? 'name' : 'frei',
        anzahl: gezeigt,
        grenze: LOW_STOCK_THRESHOLD,
        ort: ort || null,
      })
        .then((l) => {
          if (weg) return;
          setListe(l);
          setListeOrt(ort);
          setError(null);
          if (!begriff && !ort && filter === 'alle' && gezeigt === JE_SEITE) merken({ liste: l });
        })
        .catch((e: Error) => { if (!weg) setError(e.message); });
    }, begriff ? 200 : 0);
    return () => {
      weg = true;
      clearTimeout(t);
    };
  }, [user, begriff, nummernIds, filter, ort, gezeigt, runde, imOrtStand, merken]);
  function neuVersuchen() {
    setError(null);
    setRunde((n) => n + 1);
  }
  /** Die Liste steht (gemerkt oder frisch) — oder ihr Fehler. */
  const bestandBereit = listeJetzt !== null || error !== null;
  /** Die Zeilen gelten für den gewählten Ort: am weiteren Ort tragen sie dessen Menge. */
  const zeilenGelten = liste ? listeOrt === ort : !ort && listeJetzt !== null;
  const zeilen: LagerZeile[] = zeilenGelten ? listeJetzt?.zeilen ?? [] : [];
  const lowCount = listeJetzt?.knapp ?? 0;
  const fehltCount = listeJetzt?.fehlt ?? 0;
  const imLagerZahl = listeJetzt?.imLager ?? 0;

  /*
    DIE GRÖSSE DES KATALOGS — gezählt, nicht geholt (18.10.2026). Sie steht
    nur im Hinweis „von N im Katalog“ und unterscheidet „Katalog leer“ von
    „nichts im Lager geführt“. Neu gezählt, sobald sich im Katalog etwas
    ändert; gemerkt wie die Liste, damit sie beim zweiten Besuch gleich
    dasteht.
  */
  /** Wie viele Artikel der Katalog hat; `null` = nicht bekannt. */
  const [imKatalog, setImKatalog] = useState<number | null>(() => anfang?.imKatalog ?? null);
  /** Die Zahl ist da (gemerkt oder frisch gezählt) oder die Zählung scheiterte — erst dann steht die Kennzahl samt Hinweis. */
  const [gezaehlt, setGezaehlt] = useState(() => anfang?.imKatalog !== undefined);
  useEffect(() => {
    if (!user) return;
    let weg = false;
    const zaehlen = () => {
      katalogAnzahl(user.companyId)
        .then((n) => {
          if (weg) return;
          setImKatalog(n);
          merken({ imKatalog: n });
        })
        // Ohne die Zahl fehlt nur der Hinweis; der Bestand steht.
        .catch(() => undefined)
        .finally(() => { if (!weg) setGezaehlt(true); });
    };
    zaehlen();
    const stopp = katalogBeobachten(user.companyId, zaehlen);
    return () => {
      weg = true;
      stopp();
    };
  }, [user, merken]);

  /*
    DER WARENEINGANG FRAGT IN EINEM DIALOG DER APP, nicht über
    `window.prompt` (Prüflauf 24.09.2026, F7) — seit dem Testbericht vom
    30.09.2026 (M29) mit Lieferant, Lieferschein und Bestellbezug. Dazu die
    Inventur mit Grund und das Bewegungsprotokoll je Artikel (M28): der
    Bestand ändert sich nur noch über Bewegungen.
  */
  const [eingang, setEingang] = useState<WithId<Material> | null>(null);
  const [inventur, setInventur] = useState<WithId<Material> | null>(null);
  /** Umlagern (M04a) — der Artikel; Quelle ist der gewählte Ort. */
  const [umlagern, setUmlagern] = useState<WithId<Material> | null>(null);
  const [orteOffen, setOrteOffen] = useState(false);
  /*
    KOMMISSIONSWARE IM LAGER (M6). Bis 16.11.2026 machte jede Lieferung für
    eine Anforderung den Artikel für immer zum Lagerartikel; er stand danach
    mit Bestand null unter „knapp“. Die Datenbank nennt genau die, die nie
    anders ins Lager kamen — die Rückfrage zeigt sie, bevor etwas geschieht.
  */
  const [kommission, setKommission] = useState<Array<{ id: string; name: string }> | null>(null);
  async function kommissionPruefen() {
    try {
      const liste = await kommissionsartikelImLager();
      if (liste.length === 0) toast.success('Kein Artikel kam nur als Kommissionsware ins Lager.');
      else setKommission(liste);
    } catch (e) {
      toast.error(grundAus(e, 'Die Artikel konnten nicht geprüft werden.'));
    }
  }
  /**
   * Was der Artikel im Fenster oder im Dialog an den weiteren Orten hat
   * (Kennung des Ortes → Menge). Inventur und Umlagern öffnen erst mit dieser
   * Zahl: sie fragen nach ihr bzw. schicken sie als erwarteten Stand mit.
   */
  const [artikelOrte, setArtikelOrte] = useState<{ id: string; menge: Map<string, number> } | null>(null);
  /** Der Artikel im Seitenfenster — die Kennung, damit Bestand und Zahlen live mitgehen. */
  const [artikelId, setArtikelId] = useState<string | null>(null);
  /** Lädt das Bewegungsprotokoll neu, wenn aus dem Fenster gebucht wurde. */
  const [bewegungStand, setBewegungStand] = useState(0);
  /*
    WARENEINGANG UND INVENTUR AUS DEM SEITENKOPF fragen zuerst nach dem
    Artikel. Eine Lieferung kommt mit dem Lieferschein in der Hand, nicht mit
    der Zeile im Blick — wer sie einbucht, sucht den Artikel, statt die Liste
    nach ihm abzurollen.
  */
  const [wahl, setWahl] = useState<'eingang' | 'inventur' | 'umlagern' | null>(null);
  const [wahlSuche, setWahlSuche] = useState('');
  const [wahlGezeigt, setWahlGezeigt] = useState(JE_SEITE);

  /*
    DER ARTIKEL IM FENSTER — eigens gefragt, nicht aus der gezeigten Seite:
    nach einer Buchung rückt er in der Sortierung weiter und stünde sonst
    nicht mehr da. Bis zur Antwort die Zeile aus der Liste.
  */
  const [artikelFrisch, setArtikelFrisch] = useState<LagerZeile | null>(null);
  useEffect(() => {
    if (!user || !artikelId) {
      setArtikelFrisch(null);
      return;
    }
    let weg = false;
    lagerListe({ nur: [artikelId], anzahl: 1, grenze: LOW_STOCK_THRESHOLD })
      .then((l) => { if (!weg) setArtikelFrisch(l.zeilen[0] ?? null); })
      .catch(() => undefined);
    return () => { weg = true; };
  }, [user, artikelId, runde]);
  const artikel: LagerZeile | null = !artikelId
    ? null
    : artikelFrisch?.id === artikelId
      ? artikelFrisch
      : zeilen.find((m) => m.id === artikelId) ?? null;

  /*
    DER BESTAND JE ORT DES ARTIKELS IM FENSTER — neu, sobald irgendwo gebucht
    wird. Ohne die Fähigkeit gibt es nur das Hauptlager, und es wird nichts
    geholt.
  */
  const fokus = umlagern?.id ?? inventur?.id ?? artikelId;
  useEffect(() => {
    if (!user || !lo.an || !fokus) return;
    let weg = false;
    Promise.resolve()
      .then(() => bestandDesArtikels(user.companyId, fokus))
      .then((b) => {
        if (weg) return;
        setArtikelOrte({ id: fokus, menge: new Map(b.map((z) => [z.lagerortId, Number(z.menge)])) });
      })
      .catch(() => undefined);
    return () => { weg = true; };
  }, [user, lo.an, fokus, ortStand]);
  const ortMengen = (id: string): Map<string, number> | null =>
    !lo.an ? new Map() : artikelOrte?.id === id ? artikelOrte.menge : null;

  /*
    INVENTUR UND UMLAGERN ERST MIT DEN ZAHLEN DER ORTE — sonst fragten sie
    nach einem falschen Stand. Ohne weitere Orte gibt es nichts zu holen, und
    beide öffnen wie bisher. Kommen die Zahlen nicht, zählt die Inventur im
    Hauptlager (dessen Zahl am Artikel steht); Umlagern geht dann nicht.
  */
  const [nurHauptlager, setNurHauptlager] = useState(false);
  const mitOrten = async (m: WithId<Material>, weiter: (m: WithId<Material>) => void, ohneZahlenNicht = false) => {
    setNurHauptlager(false);
    if (!lo.mitWeiteren || !user) {
      weiter(m);
      return;
    }
    try {
      const b = await bestandDesArtikels(user.companyId, m.id);
      setArtikelOrte({ id: m.id, menge: new Map(b.map((z) => [z.lagerortId, Number(z.menge)])) });
      weiter(m);
    } catch {
      if (ohneZahlenNicht) {
        toast.error('Der Bestand an den Lagerorten konnte nicht geladen werden — bitte noch einmal.');
        return;
      }
      setNurHauptlager(true);
      weiter(m);
    }
  };
  /*
    DIE ARTIKELWAHL fragt ihre eigene Seite: nach Namen, gesucht wie die
    Liste, so viele wie gezeigt — erst, wenn sie offen ist.
  */
  const [wahlListe, setWahlListe] = useState<LagerListe | null>(null);
  useEffect(() => {
    if (!user || !wahl) {
      setWahlListe(null);
      return;
    }
    let weg = false;
    const t = setTimeout(() => {
      lagerListe({ begriff: wahlSuche.trim(), reihenfolge: 'name', anzahl: wahlGezeigt, grenze: LOW_STOCK_THRESHOLD })
        .then((l) => { if (!weg) setWahlListe(l); })
        .catch((e: Error) => { if (!weg) toast.error(grundAus(e, 'Die Lagerartikel konnten nicht geladen werden.')); });
    }, wahlSuche.trim() ? 200 : 0);
    return () => {
      weg = true;
      clearTimeout(t);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- toast ist stabil
  }, [user, wahl, wahlSuche, wahlGezeigt, runde]);
  const wahlTreffer = wahlListe?.zeilen ?? [];

  if (!user) return null;

  const wahlOeffnen = (w: 'eingang' | 'inventur' | 'umlagern') => {
    setWahlSuche('');
    setWahlGezeigt(JE_SEITE);
    setWahl(w);
  };

  return (
    <div className="space-y-3 lg:space-y-5">
      <PageHeader
        title="Lager"
        subtitle="Bestände führen und den Materialkatalog pflegen"
        hilfe={
          <>
            Der Bestand zeigt je Artikel, was frei ist und was schon für Anforderungen oder
            Rüstlisten reserviert ist. Eine Zeile öffnet den Artikel mit Kennzahlen,
            Bewegungsprotokoll, Wareneingang und Inventur.
            {' '}„Knapp“ heißt: unter der Mindestmenge, ohne Mindestmenge höchstens{' '}
            {LOW_STOCK_THRESHOLD} frei — gemeint ist immer das Freie. „Reserviert“ ist,
            was Anforderungen zugesagt ist oder auf Rüstlisten steht.
            {lo.mitWeiteren && (
              <>
                {' '}Mit „Ort“ zeigt die Liste, was an einem weiteren Lager oder in einem Fahrzeug liegt.
                Reserviert wird nur gegen das Hauptlager; an einem weiteren Ort ist frei, was dort liegt.
                Umlagern bucht beide Orte in einem Zug.
              </>
            )}
          </>
        }
        action={<Button onClick={() => wahlOeffnen('eingang')}>Wareneingang</Button>}
        /*
          Der Stand steht im Seitenkopf (E24), auch auf dem Reiter „Katalog“:
          verschwände er dort, sprängen die Reiter beim Wechseln hoch und
          wieder herunter. „Knapp“ führt von jedem Reiter in den Bestand.
        */
        stand={
          <MetricRow>
            {/*
              NACH EINEM LADEFEHLER KEINE GLAUBWÜRDIGEN NULLEN (V10, 13.11.2026):
              vorher stand „Im Lager 0 · Knapp 0“ — als sei das Lager leer und
              nichts knapp. Jetzt ein Strich und „nicht geladen“.
            */}
            <Metric
              label="Im Lager"
              value={error ? '—' : imLagerZahl}
              // Mit dem Hinweis zusammen — käme er später, rückte die Zeile darunter nach.
              bereit={bestandBereit && gezaehlt}
              // Katalog und Lager sind getrennt (M30): nicht jeder Katalogartikel liegt im Regal.
              hint={error ? 'nicht geladen' : imKatalog === null ? undefined : `von ${imKatalog} im Katalog`}
            />
            <Metric
              label="Knapp"
              tone={error ? 'default' : lowCount > 0 ? 'warning' : 'success'}
              value={error ? '—' : lowCount}
              bereit={bestandBereit}
              to={!error && lowCount > 0 && filter !== 'knapp' ? '/lager?filter=knapp' : undefined}
            />
            <Metric
              label="Reserviert"
              value={error ? '—' : fmtMenge(listeJetzt?.reserviert ?? 0)}
              bereit={bestandBereit}
            />
          </MetricRow>
        }
        mehr={
          <RowMenu
            about="Lager"
            items={[
              { label: 'Inventur …', onSelect: () => wahlOeffnen('inventur') },
              // M04a: mit weiteren Orten — und die Orte selbst pflegt, wer das Lager führt.
              ...(lo.mitWeiteren ? [{ label: 'Umlagern …', onSelect: () => wahlOeffnen('umlagern') }] : []),
              ...(lo.an && canProcessOrders(user.role) ? [{ label: 'Lagerorte …', onSelect: () => setOrteOffen(true) }] : []),
              /*
                EINSPIELEN DARF NUR, WER AUCH EINZELN EINKAUFSPREISE SETZEN DARF.
                Dieselbe Grenze steht in der Datenbank; hier wird der Eintrag nur
                nicht angeboten — für die Verwaltung wäre er ein Knopf, der
                zuverlässig abweist.
              */
              ...(darfEinspielen ? [{ label: 'Katalog einspielen', onSelect: () => setTab('import') }] : []),
              ...(darfEinspielen && zuordnenAn
                ? [{ label: 'Offene Lieferantenartikel', onSelect: () => setTab('zuordnen') }]
                : []),
              // M6: Altdaten — wer das Lager führt, räumt Kommissionsware aus der Lagerliste.
              ...(canProcessOrders(user.role)
                ? [{ label: 'Kommissionsware aus dem Lager nehmen …', onSelect: () => void kommissionPruefen() }]
                : []),
            ]}
          />
        }
      />

      {/*
        DIE BEREICHE SCHMAL LINKS, WIE IN DEN ANFORDERUNGEN (E72, 09.11.2026):
        außerhalb einer Listenleiste streckten sich „Bestand“ und „Katalog“
        über die ganze Breite, je 558 px mit dem Wort in der Mitte.
      */}
      <div className="anf-leiste">
        <Listenleiste
          reiter={
            <Segmente
              name="Bereich"
              werte={[
                { wert: 'bestand' as Tab, text: 'Bestand' },
                { wert: 'katalog' as Tab, text: 'Katalog' },
                // F14: Zähllisten je Ort — die Inventur des ganzen Lagers oder Fahrzeugs.
                { wert: 'inventur' as Tab, text: 'Inventur' },
                /*
                  DAS EINSPIELEN STEHT ALS REITER DA, SOLANGE ES OFFEN IST (Runde 6,
                  G28): erreicht wird es über das „⋯“, und ohne eigenen Reiter war
                  in der Leiste keiner markiert — man wusste nicht, wo man ist.
                */
                ...(tab === 'import' ? [{ wert: 'import' as Tab, text: 'Einspielen' }] : []),
                ...(tab === 'zuordnen' ? [{ wert: 'zuordnen' as Tab, text: 'Zuordnen' }] : []),
              ]}
              wert={tab}
              onChange={setTab}
            />
          }
        />
      </div>

      {/* Im Bestand steht der Fehler in der Liste selbst (unten); auf den anderen Reitern hier. */}
      {error && tab !== 'bestand' && <ErrorState message={error} onRetry={neuVersuchen} />}

      {tab === 'import' ? (
        // Die Überschrift trägt die Karte des Einspielens selbst; eine zweite darüber stand doppelt (G28).
        <Suspense fallback={<SkeletonList rows={3} />}>
          <KatalogImport onZuordnen={zuordnenAn ? () => setTab('zuordnen') : undefined} />
        </Suspense>
      ) : tab === 'zuordnen' ? (
        <Suspense fallback={<SkeletonList rows={3} />}>
          <OffeneLieferantenartikel />
        </Suspense>
      ) : tab === 'inventur' ? (
        <Zaehllisten
          orte={lo.orte}
          mitOrten={lo.mitWeiteren}
          warengruppen={listeJetzt?.warengruppen ?? []}
        />
      ) : tab === 'katalog' ? (
        <MaterialCatalog
          zuBearbeiten={zuBearbeiten}
          onUebernommen={() => setZuBearbeiten(null)}
          knappImLager={listeJetzt?.knappBestand ?? 0}
          suche={params.get('suche') ?? undefined}
        />
      ) : (
        <>
          <Card title="Bestände" buendig>
            {lo.mitWeiteren && (
              <div className="px-4 pb-2">
                <OrtWahl id="lager-ort" label="Ort" alle={lo.orte} wahl={weitere} wert={ort} onChange={(o) => { setOrt(o); setGezeigt(JE_SEITE); }} />
              </div>
            )}
            {ort ? (
              <>
                <Listenleiste
                  suche={{ id: 'stocksearch', wert: search, onChange: setSearch, platzhalter: 'Name, Kategorie oder Art.-Nr.' }}
                />
                <div>
                  {error ? (
                    <div className="px-4 pb-4"><ErrorState message="Der Bestand an diesem Ort konnte nicht geladen werden." onRetry={neuVersuchen} /></div>
                  ) : !zeilenGelten ? (
                    <div className="px-4 pb-4"><SkeletonList rows={4} /></div>
                  ) : zeilen.length === 0 ? (
                    <EmptyState>
                      {search.trim()
                        ? `Gesucht wurde „${search.trim()}“ in Name, Kategorie und Artikelnummer.`
                        : `${ortNameVon(lo.orte, ort)}: hier liegt nichts. Bestand kommt durch Umlagern oder eine Zählung am Ort.`}
                    </EmptyState>
                  ) : (
                    <List>
                      {zeilen.map((m) => (
                        <ListRow
                          key={m.id}
                          title={m.name}
                          onOeffnen={() => setArtikelId(m.id)}
                          ausgewaehlt={artikelId === m.id}
                          subtitle={[m.category, m.articleNumber && `Art.-Nr. ${m.articleNumber}`].filter(Boolean).join(' · ') || undefined}
                          wert={`${fmtMenge(m.amOrt ?? 0)} ${m.unit ?? 'Stk'}`}
                          pfeil
                        />
                      ))}
                    </List>
                  )}
                  {zeilenGelten && (
                    <MehrAnzeigen anzahl={Math.max(0, (listeJetzt?.treffer ?? 0) - zeilen.length)} onClick={() => setGezeigt((n) => n + JE_SEITE)} />
                  )}
                </div>
              </>
            ) : (
            <>
            <Listenleiste
              reiter={
                /*
                  Die Zahlen zählen, was zu tun ist (Protokoll 7.7) — über
                  alle Lagerartikel, gezählt in der Datenbank.
                */
                <Segmente
                  name="Filter"
                  werte={[
                    { wert: 'alle' as Filter, text: 'Alle' },
                    { wert: 'knapp' as Filter, text: 'knapp', anzahl: bestandBereit ? lowCount : undefined },
                    { wert: 'fehlt' as Filter, text: 'fehlt', anzahl: bestandBereit ? fehltCount : undefined },
                  ]}
                  wert={filter}
                  onChange={setFilter}
                />
              }
              suche={{ id: 'stocksearch', wert: search, onChange: setSearch, platzhalter: 'Name, Kategorie oder Art.-Nr.' }}
            />
            <div>
              {/*
                FEHLER ≠ LEER (V10, 13.11.2026): kamen die Lagerartikel nicht,
                stand hier „Noch kein Artikel im Lager geführt“ — eine Auskunft
                über ein Lager, das gar nicht gelesen wurde.
              */}
              {error ? (
                <div className="px-4 pb-4">
                  <ErrorState
                    message={`Der Bestand konnte nicht geladen werden. (${error})`}
                    onRetry={neuVersuchen}
                  />
                </div>
              ) : /* Ein leeres Lager wartet auf die Zahl des Katalogs: sie wählt den Hinweis. */
              !zeilenGelten || (imLagerZahl === 0 && !gezaehlt) ? (
                <div className="px-4 pb-4">
                  <SkeletonList rows={5} />
                </div>
              ) : zeilen.length === 0 ? (
                <EmptyState
                  /*
                    ECHTE LEERE MIT ZEICHNUNG (Planlinie § 6): ein leerer Katalog
                    bekommt das Regal wie die anderen Bereiche ihr Motiv; die
                    Suche ohne Treffer die Lupe. „Kein Artikel knapp“ ist keine
                    Leere, sondern eine gute Nachricht — dort bleibt der Satz.
                  */
                  zeichnung={imKatalog === 0 ? 'lager' : imKatalog !== 0 && imLagerZahl > 0 && search.trim() ? 'suche' : undefined}
                  titel={imKatalog === 0 ? 'Noch kein Material im Katalog' : imKatalog !== 0 && imLagerZahl > 0 && search.trim() ? 'Keine passenden Artikel.' : undefined}
                  action={imKatalog !== 0 && imLagerZahl > 0 && search.trim() ? <Button variant="secondary" onClick={() => setSearch('')}>Suche zurücksetzen</Button> : undefined}
                >
                  {imKatalog === 0
                    ? 'Der Bereich „Katalog“ legt den ersten Eintrag an.'
                    : imLagerZahl === 0
                      ? 'Noch kein Artikel im Lager geführt. Im Katalog beim Artikel „Im Lager führen“ anhaken.'
                      : search.trim()
                        ? `Gesucht wurde „${search.trim()}“ in Name, Kategorie und Artikelnummer.`
                        : filter === 'fehlt'
                          ? 'Kein Artikel fehlt.'
                          : 'Kein Artikel ist knapp.'}
                </EmptyState>
              ) : (
                <List>
                  {zeilen.map((m) => {
                    const low = istKnapp(m.free, m, LOW_STOCK_THRESHOLD);
                    const einheit = m.unit ?? 'Stk';
                    return (
                      /*
                        GESTAPELT WIE RECHNUNGEN UND BAUSTELLEN (E40/E41; E72,
                        09.11.2026): neben Zustand und Maßlinie blieben dem
                        Namen am Tablet rund 200 px — er brach in zwei Zeilen,
                        die Artikelnummer mitten in sich („CU-/22-5H“). Jetzt
                        stehen Zustand und Maßlinie am Handy und Tablet unter
                        dem Text, der Zustand links; am Schreibtisch rechts in
                        festen Spalten.
                      */
                      <ListRow
                        key={m.id}
                        gestapelt
                        title={m.name}
                        onOeffnen={() => setArtikelId(m.id)}
                        ausgewaehlt={artikelId === m.id}
                        subtitle={
                          [
                            m.category,
                            m.articleNumber && `Art.-Nr. ${m.articleNumber}`,
                            m.mindestmenge != null && `Mindestmenge ${fmtMenge(m.mindestmenge)}`,
                          ]
                            .filter(Boolean)
                            .join(' · ') || undefined
                        }
                        /*
                          STATUS NUR, WO ETWAS ZU TUN IST (Linie „Lot“, E3): „knapp“
                          oder „fehlen“. Unter null heisst „fehlen“, nicht „−926
                          frei“ (Launch-Check, K2): mehr angefordert, als im Regal
                          liegt. Aus dem Lager zusagen lässt die Datenbank dann
                          nur noch, was wirklich da ist — der Rest gehört auf die
                          Einkaufsliste.
                        */
                        zustand={
                          m.free < 0 ? (
                            <Warnung stufe="dringend">{fmtMenge(-m.free)} {einheit} fehlen</Warnung>
                          ) : low ? (
                            <Warnung>knapp</Warnung>
                          ) : (
                            // Die Spalte bleibt frei, damit die Maßlinie in jeder Zeile an derselben Stelle beginnt (R11).
                            <span className="lager-ohne-zustand" aria-hidden="true" />
                          )
                        }
                        pfeil
                        wert={
                          /*
                            FREI, RESERVIERT, REGAL ALS MASSLINIE (Planlinie B2)
                            statt „28 Stk frei · 20 reserviert“: das Reservierte
                            läuft gegen den Regalbestand als Grenze, frei ist der
                            Rest der Strecke. Wird mehr reserviert, als im Regal
                            liegt, läuft es rot darüber — das sind die „fehlen“
                            daneben. Die Zahlen stehen weiter an der Linie.
                            Mit Linie und ohne in derselben festen Breite
                            (`lager-masslinie`, Regel R11), sonst spränge der
                            Zustand davor je Zeile.
                          */
                          <span className="lager-masslinie">
                            {(m.stock ?? 0) > 0 ? (
                              <Masslinie
                                schmal
                                ist={m.reserved}
                                soll={m.stock ?? 0}
                                istText={<><span>{fmtMenge(Math.max(m.free, 0))} {einheit} frei</span> · {fmtMenge(m.reserved)} reserviert</>}
                                sollText={`Regal ${fmtMenge(m.stock ?? 0)}`}
                                name={`${fmtMenge(Math.max(m.free, 0))} ${einheit} frei, ${fmtMenge(m.reserved)} reserviert von ${fmtMenge(m.stock ?? 0)} ${einheit} im Regal`}
                              />
                            ) : (
                              // Ein leeres Regal ist keine Grenze: ohne sie gibt es keine Maßlinie, nur die Zahlen.
                              <>
                                <span>{fmtMenge(Math.max(m.free, 0))} {einheit} frei</span>
                                <span className="text-ink-muted"> · {fmtMenge(m.reserved)} reserviert</span>
                              </>
                            )}
                          </span>
                        }
                      />
                    );
                  })}
                </List>
              )}
              {/* Erst mit der Liste: unter dem kürzeren Platzhalter schob die Liste sie beim Eintreffen nach unten (Messung 11.10.2026). */}
              {zeilenGelten && !error && (
                <MehrAnzeigen anzahl={Math.max(0, (listeJetzt?.treffer ?? 0) - zeilen.length)} onClick={() => setGezeigt((n) => n + JE_SEITE)} />
              )}
            </div>
            </>
            )}
          </Card>
        </>
      )}

      {/*
        DER ARTIKEL IM SEITENFENSTER (Linie „Lot“, E3): Kennzahlen, das
        Bewegungsprotokoll als Lot und alle Aktionen, die bis zum Umbau als
        Knopf und im „⋯“ der Zeile standen — Wareneingang, Inventur,
        Bearbeiten. Die Rückfragen der Buchungen stehen allein; das Fenster
        tritt so lange zurück und kommt danach mit der neuen Bewegung wieder.
      */}
      <BottomSheet
        open={!!artikel && !eingang && !inventur && !umlagern}
        onClose={() => setArtikelId(null)}
        label="Artikel"
        auchBreit
        titel={artikel?.name ?? 'Artikel'}
      >
        {artikel && (
          <div className="space-y-5">
            {(artikel.category || artikel.articleNumber) && (
              <p className="text-sm text-ink-muted">
                {[artikel.category, artikel.articleNumber && `Art.-Nr. ${artikel.articleNumber}`].filter(Boolean).join(' · ')}
              </p>
            )}
            <dl className="fenster-zahlen">
              <div className="fenster-zahl">
                <dt>im Lager</dt>
                <dd>{fmtMenge(artikel.stock ?? 0)} {artikel.unit ?? 'Stk'}</dd>
              </div>
              <div className="fenster-zahl">
                <dt>reserviert</dt>
                <dd>{fmtMenge(artikel.reserved)}</dd>
                {artikel.geplant ? (
                  <p className="fenster-zahl-zusatz">davon {fmtMenge(artikel.geplant)} auf Rüstlisten</p>
                ) : null}
              </div>
              <div className="fenster-zahl">
                <dt>frei</dt>
                <dd className={artikel.free < 0 ? 'text-danger' : undefined}>{fmtMenge(artikel.free)}</dd>
              </div>
              <div className="fenster-zahl">
                <dt>Mindestmenge</dt>
                <dd>{artikel.mindestmenge != null ? fmtMenge(artikel.mindestmenge) : '—'}</dd>
                {artikel.mindestmenge == null && (
                  <p className="fenster-zahl-zusatz">knapp ab höchstens {LOW_STOCK_THRESHOLD} frei</p>
                )}
              </div>
            </dl>

            {/*
              BESTAND JE ORT (M04a): das Hauptlager mit den Zahlen oben, dazu
              jeder weitere Ort, an dem etwas liegt. Nur mit der Fähigkeit.
            */}
            {lo.an && weitere.length > 0 && (
              <div>
                <h3 className="section-label mb-1">Bestand je Ort</h3>
                <dl className="divide-y divide-line border-y border-line">
                  <div className="flex min-h-touch items-center justify-between gap-3 py-2">
                    <dt>{ortNameVon(lo.orte, HAUPTLAGER)}</dt>
                    <dd className="zeile-wert">{fmtMenge(artikel.stock ?? 0)} {artikel.unit ?? 'Stk'}</dd>
                  </div>
                  {ortReihenfolge(lo.orte)
                    .filter((o) => o.art !== 'haupt' && (ortMengen(artikel.id)?.get(o.id) ?? 0) > 0)
                    .map((o) => (
                      <div key={o.id} className="flex min-h-touch items-center justify-between gap-3 py-2">
                        <dt>{ortNameVon(lo.orte, o.id)}{o.aktiv ? '' : ' (stillgelegt)'}</dt>
                        <dd className="zeile-wert">{fmtMenge(ortMengen(artikel.id)?.get(o.id) ?? 0)} {artikel.unit ?? 'Stk'}</dd>
                      </div>
                    ))}
                </dl>
                {ortMengen(artikel.id) === null && <p className="pt-1 text-sm text-ink-muted">Wird geladen …</p>}
              </div>
            )}

            {/* U4: „Wareneingang“ gefüllt, „Inventur“ daneben, das Seltene im ⋯. */}
            <Fensteraktionen
              about={`Artikel ${artikel.name}`}
              haupt={<Button onClick={() => setEingang(artikel)}>Wareneingang</Button>}
              zweit={<Button variant="secondary" onClick={() => void mitOrten(artikel, setInventur)}>Inventur</Button>}
              weitere={[
                ...(lo.mitWeiteren ? [{ label: 'Umlagern', onSelect: () => void mitOrten(artikel, setUmlagern, true) }] : []),
                {
                  label: 'Im Katalog bearbeiten',
                  // Bearbeitet wird im Katalog — eine zweite Stelle mit denselben Regeln gibt es nicht.
                  onSelect: () => {
                    setArtikelId(null);
                    setZuBearbeiten(artikel);
                    setTab('katalog');
                  },
                },
              ]}
            />

            <div>
              <h3 className="section-label mb-3">Bewegungen</h3>
              <Bewegungsverlauf artikel={artikel} stand={bewegungStand} orte={lo.an ? lo.orte : []} />
            </div>
          </div>
        )}
      </BottomSheet>

      <BottomSheet
        open={wahl !== null}
        onClose={() => setWahl(null)}
        label="Artikel wählen"
        auchBreit
        titel={wahl === 'inventur' ? 'Inventur: Artikel wählen' : wahl === 'umlagern' ? 'Umlagern: Artikel wählen' : 'Wareneingang: Artikel wählen'}
      >
        <div className="space-y-3">
          <InputField
            id="lager-wahl-suche"
            label="Artikel suchen"
            type="search"
            placeholder="Name, Kategorie oder Art.-Nr."
            value={wahlSuche}
            onChange={(e) => {
              setWahlSuche(e.target.value);
              setWahlGezeigt(JE_SEITE);
            }}
          />
          {wahlTreffer.length === 0 ? (
            <p className="text-sm text-ink-muted">
              {wahlListe?.imLager === 0
                ? 'Noch kein Artikel im Lager geführt. Im Katalog beim Artikel „Im Lager führen“ anhaken.'
                : 'Kein Lagerartikel passt zur Suche.'}
            </p>
          ) : (
            <ul className="wahl-liste" aria-label="Lagerartikel">
              {wahlTreffer.map((m) => (
                <li key={m.id}>
                  <button
                    type="button"
                    className="wahl-zeile"
                    onClick={() => {
                      const w = wahl;
                      setWahl(null);
                      if (w === 'inventur') void mitOrten(m, setInventur);
                      else if (w === 'umlagern') void mitOrten(m, setUmlagern, true);
                      else setEingang(m);
                    }}
                  >
                    <span className="min-w-0">{m.name}</span>
                    <span className="wahl-zeile-info">
                      {fmtMenge(m.stock ?? 0)} {m.unit ?? 'Stk'}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )}
          <MehrAnzeigen
            anzahl={Math.max(0, (wahlListe?.treffer ?? 0) - wahlTreffer.length)}
            onClick={() => setWahlGezeigt((n) => n + JE_SEITE)}
          />
        </div>
      </BottomSheet>

      {eingang && (
        <WareneingangDialog
          companyId={user.companyId}
          artikel={eingang}
          orte={lo.orte}
          zielorte={weitere}
          ortVorgabe={ort}
          onAbbrechen={() => setEingang(null)}
          onFertig={(text) => {
            setEingang(null);
            setBewegungStand((n) => n + 1);
            setOrtStand((n) => n + 1);
            // Die Liste fragt gleich neu — nicht erst, wenn der Kanal die Änderung meldet.
            setRunde((n) => n + 1);
            toast.success(text);
          }}
        />
      )}
      {inventur && (
        <InventurDialog
          artikel={inventur}
          orte={lo.orte}
          zaehlorte={nurHauptlager ? [] : weitere}
          bestaende={ortMengen(inventur.id) ?? new Map()}
          ortVorgabe={nurHauptlager ? HAUPTLAGER : ort}
          onAbbrechen={() => setInventur(null)}
          onFertig={(text) => {
            setInventur(null);
            setBewegungStand((n) => n + 1);
            setOrtStand((n) => n + 1);
            // Die Liste fragt gleich neu — nicht erst, wenn der Kanal die Änderung meldet.
            setRunde((n) => n + 1);
            toast.success(text);
          }}
        />
      )}
      {umlagern && (
        <UmlagernDialog
          artikel={artikel?.id === umlagern.id ? artikel : umlagern}
          orte={lo.orte}
          wahl={weitere}
          bestaende={ortMengen(umlagern.id) ?? new Map()}
          vonVorgabe={ort}
          onAbbrechen={() => setUmlagern(null)}
          onVeraltet={() => setOrtStand((n) => n + 1)}
          onFertig={(text) => {
            setUmlagern(null);
            setBewegungStand((n) => n + 1);
            setOrtStand((n) => n + 1);
            // Die Liste fragt gleich neu — nicht erst, wenn der Kanal die Änderung meldet.
            setRunde((n) => n + 1);
            toast.success(text);
          }}
        />
      )}
      {lo.an && (
        <LagerorteFenster
          offen={orteOffen}
          orte={lo.orte}
          onClose={() => setOrteOffen(false)}
          onGeaendert={lo.neuLaden}
        />
      )}
      <ConfirmDialog
        open={kommission !== null}
        title="Kommissionsware aus dem Lager nehmen?"
        confirmLabel={kommission && kommission.length === 1 ? 'Aus dem Lager nehmen' : `${kommission?.length ?? 0} aus dem Lager nehmen`}
        confirmTone="primary"
        message={
          'Diese Artikel kamen nur als Lieferung für eine Anforderung ins Lager, haben keinen Bestand und '
          + 'keine Mindestmenge. Danach stehen sie nur noch im Katalog — nicht mehr im Bestand und nicht mehr '
          + 'unter „knapp“. „Im Lager führen“ im Katalog nimmt einen wieder auf.'
        }
        onCancel={() => setKommission(null)}
        onConfirm={async () => {
          const liste = kommission ?? [];
          try {
            const raus = await kommissionsartikelImLager(liste.map((m) => m.id));
            setKommission(null);
            setRunde((n) => n + 1);
            toast.success(raus.length === 1 ? '1 Artikel aus dem Lager genommen' : `${raus.length} Artikel aus dem Lager genommen`);
          } catch (e) {
            toast.error(grundAus(e, 'Die Artikel konnten nicht aus dem Lager genommen werden.'));
          }
        }}
      >
        <List>
          {(kommission ?? []).map((m) => <ListRow key={m.id} title={m.name} />)}
        </List>
      </ConfirmDialog>
    </div>
  );
}
