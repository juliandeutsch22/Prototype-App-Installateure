import { useEffect, useMemo, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useAuth } from '@/app/AuthContext';
import Adressfilter from '@/components/Adressfilter';
import { katalogSeite, katalogBeobachten, katalogNachIds, LOW_STOCK_THRESHOLD, lagerFrei, type LagerStand } from '@/lib/db/materials';
import { gefundenUeberText, type MitNummer } from '@/lib/katalogTreffer';
import { Bereit, Wert } from '@/components/Wert';
import { imLager, istKnapp } from './lagerartikel';
import {
  createMaterialOrderOhneEmpfang,
  subscribeOwnOrders,
  updateOrderStatus,
  anforderungEiligSetzen,
} from '@/lib/db/materialOrders';
import { listActiveProjects } from '@/lib/db/projects';
import type { WithId } from '@/lib/db/core';
import type { Material, MaterialOrder, Project } from '@/types';
import Card from '@/components/Card';
import Button from '@/components/Button';
import { Listenleiste, MehrAnzeigen } from '@/components/LotBausteine';
import Hinweiszeile from '@/components/Hinweiszeile';
import { Marke, Warnung } from '@/components/Badge';
import Icon from '@/components/Icon';
import IconButton from '@/components/IconButton';
import StatusBadge from '@/components/StatusBadge';
import PageHeader from '@/components/PageHeader';
import ConfirmDialog from '@/components/ConfirmDialog';
import { List, ListRow } from '@/components/ListRow';
import { InputField, CheckboxField } from '@/components/Field';
import BaustellenSelect from '@/components/BaustellenSelect';
import { useBaustelleVorbelegung } from '@/features/projects/useBaustelleVorbelegung';
import { VORBELEG_TEXT, zuletztMerken, type VorbelegGrund } from '@/lib/baustelleVorbelegen';
import InfoHint from '@/components/InfoHint';
import { useToast } from '@/components/Toast';
import { vorgemerktMeldung } from '@/lib/sync/ausgangsfach';
import { LoadingState, ErrorState, EmptyState, TeilFehler } from '@/components/States';
import { grundAus } from '@/lib/fehlerGrund';
import { datumAusMs } from '@/lib/datum';
import { abschlussText, herkunftFragen } from './abschlussText';
import AnforderungFenster from './AnforderungFenster';
import { zuletztAngefordert, ZULETZT_TAGE } from './zuletztAngefordert';
import RetoureFenster from './RetoureFenster';
import MeinFahrzeug from './MeinFahrzeug';
import { zahlAlsText, zahlOder } from '@/lib/zahl';
import { mengeFehler, mengeMitKomma } from '@/lib/einheit';
import { fmtMenge } from '@/lib/belegLayout';

/** Gruppen höchstens 20 Zeilen (Regel 4), dann „und N weitere anzeigen“. */
const JE_SEITE = 20;

interface CartLine {
  materialId: string;
  materialName: string;
  quantity: number;
  /** Baustelle je Position — sonst landen Kosten auf der falschen Rechnung. */
  projectNumber: string;
  /**
   * Nur noch in Körben, die vor dem Umbau gespeichert wurden. Die Notiz gilt
   * für die ganze Anforderung und wird beim Absenden genommen (siehe
   * `submitCart`); an der Position ging sie verloren.
   */
  note?: string;
  /** Eilzustellung — nur mit gewählter Baustelle möglich. */
  isUrgent?: boolean;
}

/**
 * Warenkorb-Schlüssel je Mandant UND Nutzer. Mit einem festen Schlüssel sah
 * auf einem geteilten Baustellen-Tablet der nächste Angemeldete den Korb
 * seines Vorgängers — und bestellte ihn unter seinem Namen auf dessen
 * Baustelle.
 */
function cartKey(companyId: string, uid: string) {
  return `senklot.warenkorb:${companyId}:${uid}`;
}

/** Material anfordern, eigene Anforderungen verfolgen, Retouren erfassen. */
/** Wie viele eigene Anforderungen geladen werden — angesehen wird das Laufende. */
const EIGENE_ANFORDERUNGEN = 100;

export default function OrderView() {
  const { user } = useAuth();
  const toast = useToast();
  /*
    STAND AUS DER ADRESSE (Startseite, Nachtest 01.10.2026): „Material
    abholbereit →“ landet bei „Meine Anforderungen“, nur Abholbereites. Bis
    zum Umbau ein eigener Reiter; jetzt springt `?reiter=meine` zum Abschnitt
    unter dem Katalog.
  */
  const [adresse] = useSearchParams();
  const zuMeinen = adresse.get('reiter') === 'meine';
  const nurAbholbereit = adresse.get('status') === 'Abholbereit';
  const meineRef = useRef<HTMLElement>(null);
  const zuMeinenSpringen = () => meineRef.current?.scrollIntoView?.({ block: 'start' });
  useEffect(() => {
    if (zuMeinen) zuMeinenSpringen();
  }, [zuMeinen]);
  /** Wie viele Artikel, eigene und erledigte Anforderungen stehen (je 20, dann „und N weitere“). */
  const [artikelGezeigt, setArtikelGezeigt] = useState(JE_SEITE);
  const [meineGezeigt, setMeineGezeigt] = useState(JE_SEITE);
  const [erledigtGezeigt, setErledigtGezeigt] = useState(JE_SEITE);
  /*
    DIE RETOURE STEHT IM SEITENFENSTER. Aus der Rüstliste eines Einsatzes
    kommt man mit `?retoure=1&baustelle=…` gleich hinein, die Baustelle
    vorbelegt — dort, wo man merkt, dass etwas übrig ist.
  */
  const [retoureOffen, setRetoureOffen] = useState(adresse.get('retoure') === '1');
  const retoureBaustelle = adresse.get('baustelle') ?? '';
  /*
    DER KATALOG KOMMT SEITENWEISE VOM SERVER (Mengengerüst, 18.10.2026):
    die ersten zwanzig nach Namen, „und N weitere“ holt die nächsten, und
    gesucht wird auf dem Server — in Bezeichnung, Kategorie und
    Artikelnummer wie bisher. Bis dahin lud die Seite bis zu tausend Artikel
    (gemessen dreimal, 1,8 MB) und suchte nur in diesen; aus einem
    eingespielten Großhandelskatalog fand der Monteur so nur, was zufällig
    unter den ersten tausend lag.
  */
  const [seite, setSeite] = useState<{ zeilen: MitNummer<WithId<Material>>[]; gesamt: number } | null>(null);
  /** Der Katalog liess sich nicht holen — eigen, damit ein Neuladen nicht den Fehler einer Retoure wegwischt. */
  const [katalogFehler, setKatalogFehler] = useState<string | null>(null);
  const materials = useMemo(() => seite?.zeilen ?? [], [seite]);
  /*
    WAS FREI IST, NICHT WAS IM REGAL STEHT (Testbericht 30.09.2026, G19):
    „5 Stk (knapp)“, obwohl 3 davon zugesagt oder für einen Einsatz geplant
    waren. Die Zahl kommt aus der Datenbank; bleibt sie aus, steht der
    Bestand. Bis zur ersten Antwort ein Platzhalter — sonst stand erst der
    Bestand und Augenblicke später das Freie (Analyse 10.10.2026).
  */
  const [frei, setFrei] = useState<Map<string, LagerStand> | null>(null);
  const [freiFertig, setFreiFertig] = useState(false);
  useEffect(() => {
    if (!user) return;
    let weg = false;
    Promise.resolve()
      .then(() => lagerFrei(materials.map((m) => m.id)))
      .then((k) => { if (!weg) setFrei(k); })
      .catch(() => undefined)
      .finally(() => { if (!weg && materials.length > 0) setFreiFertig(true); });
    return () => { weg = true; };
  }, [user, materials]);
  const [projects, setProjects] = useState<Project[]>([]);
  const [myOrders, setMyOrders] = useState<WithId<MaterialOrder>[]>([]);
  /*
    Kamen die eigenen Anforderungen schon? Vorher stand bis dahin „Meine
    Anforderungen (0) – Keine offenen Bestellungen“ (gemessen sechs Sekunden
    im langsamen Netz, Analyse 10.10.2026) — eine Auskunft, die keine war.
  */
  const [meineGeladen, setMeineGeladen] = useState(false);
  const [loading, setLoading] = useState(true);
  /** Ein Nebenladevorgang ist ausgefallen — der Katalog steht trotzdem. */
  const [nebenFehler, setNebenFehler] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  /*
    DER FEHLER DES ABSCHICKENS STEHT AN DER LEISTE, an der abgeschickt wurde.
    Oben auf der Seite sähe ihn am Telefon niemand, der unten auf den Knopf
    getippt hat.
  */
  const [korbFehler, setKorbFehler] = useState<string | null>(null);

  // Warenkorb übersteht einen Reload — auf der Baustelle geht die Verbindung
  // oder die App schon mal verloren, bevor abgeschickt wurde.
  const [cart, setCart] = useState<CartLine[]>([]);
  /*
    DIE BAUSTELLE KOMMT MIT (B2/B3, E83). Vom Einsatz aus steht sie in der
    Adresse (`?projekt=`); sonst nach der einen Regel: laufender Arbeitstag,
    Einsatz von heute, zuletzt benutzt. Belegt wird nur das leere,
    unberührte Feld; darunter steht, woher der Wert kommt.
  */
  const projektAusAdresse = adresse.get('projekt') ?? '';
  const [projectNumber, setProjectNumber] = useState(projektAusAdresse);
  const [vorbelegt, setVorbelegt] = useState<VorbelegGrund | null>(null);
  const [baustelleBeruehrt, setBaustelleBeruehrt] = useState(!!projektAusAdresse);
  const [note, setNote] = useState('');
  const [urgent, setUrgent] = useState(false);
  const [search, setSearch] = useState('');
  /** Ein Artikel, den der Katalog nicht kennt — frei getippt. */
  const [freiName, setFreiName] = useState('');
  const [freiMenge, setFreiMenge] = useState('1');
  const [toPickUp, setToPickUp] = useState<WithId<MaterialOrder> | null>(null);
  /** Beim Abholen, solange nichts bereitgestellt ist (C7, E89): aus dem Lager oder vom Händler. */
  const [herkunft, setHerkunft] = useState<'lager' | 'haendler'>('lager');
  /** Die Anforderung im Seitenfenster (C7, E89). */
  const [fenster, setFenster] = useState<WithId<MaterialOrder> | null>(null);
  /** Nachträglich eilig (17 F) — mit Rückfrage, weil andere davon eine Meldung bekommen. */
  const [eilFrage, setEilFrage] = useState<WithId<MaterialOrder> | null>(null);
  /** Neu holen, wenn „Abgeholt“ einen veralteten Stand traf (Runde 7, R7-M3). */
  const [neuLaden, setNeuLaden] = useState(0);

  useEffect(() => {
    if (!user) return;
    // Ohne Hinweis waere das Baustellenfeld leer, und der Monteur haelt seine
    // Baustelle fuer nicht angelegt.
    listActiveProjects(user.companyId)
      .then(setProjects)
      .catch(() => setNebenFehler('Die Baustellen'));
    // Siehe StockView: ein stumm gescheitertes Abo sieht aus wie „nichts da".
    const unsubO = subscribeOwnOrders(
      user.companyId,
      user.uid,
      EIGENE_ANFORDERUNGEN,
      (rows) => {
        setMyOrders(rows);
        setMeineGeladen(true);
      },
      () => {
        setNebenFehler('Deine Anforderungen');
        setMeineGeladen(true);
      },
    );
    return unsubO;
  }, [user, neuLaden]);

  const vorbelegung = useBaustelleVorbelegung({
    aktiv: !baustelleBeruehrt,
    // Nur, was die Auswahl auch anbietet: eine abgeschlossene Baustelle wird nicht vorbelegt.
    waehlbar: (nr) => projects.some((p) => p.projectNumber === nr),
  });
  useEffect(() => {
    if (baustelleBeruehrt || !vorbelegung) return;
    setBaustelleBeruehrt(true);
    if (projectNumber) return;
    setProjectNumber(vorbelegung.nr);
    setVorbelegt(vorbelegung.grund);
  }, [vorbelegung, baustelleBeruehrt, projectNumber]);

  /** Der Suchbegriff, wie er an den Server geht — kurz nach dem letzten Tastendruck, nicht je Taste. */
  const [begriff, setBegriff] = useState('');
  useEffect(() => {
    const t = setTimeout(() => setBegriff(search.trim()), 250);
    return () => clearTimeout(t);
  }, [search]);
  /** Ändert sich im Katalog etwas (oder steht der Kanal wieder), wird die Seite neu geholt. */
  const [katalogStand, setKatalogStand] = useState(0);
  useEffect(() => {
    if (!user) return;
    return katalogBeobachten(user.companyId, () => setKatalogStand((n) => n + 1));
  }, [user]);
  useEffect(() => {
    if (!user) return;
    // Eine überholte Antwort (inzwischen anders gesucht oder mehr verlangt) setzt nichts mehr.
    let weg = false;
    // Ausgelaufenes nicht neu anfordern — außer dem Rest, der noch im Lager liegt.
    katalogSeite(user.companyId, begriff, artikelGezeigt, { nurAnforderbar: true })
      .then((s) => {
        if (weg) return;
        setSeite(s);
        setKatalogFehler(null);
      })
      .catch((e: Error) => { if (!weg) setKatalogFehler(e.message); })
      .finally(() => { if (!weg) setLoading(false); });
    return () => { weg = true; };
  }, [user, begriff, artikelGezeigt, katalogStand]);

  // Korb des angemeldeten Nutzers laden, sobald er feststeht.
  useEffect(() => {
    if (!user) return;
    try {
      const raw = localStorage.getItem(cartKey(user.companyId, user.uid));
      setCart(raw ? (JSON.parse(raw) as CartLine[]) : []);
    } catch {
      setCart([]);
    }
  }, [user]);

  useEffect(() => {
    if (!user) return;
    try {
      localStorage.setItem(cartKey(user.companyId, user.uid), JSON.stringify(cart));
    } catch {
      // Privater Modus o. Ä. — der Korb lebt dann nur im Speicher weiter.
    }
  }, [cart, user]);

  /**
   * Hat die gewaehlte Baustelle ueberhaupt jemanden, den eine Eilmeldung
   * erreicht? Wenn nicht, sagt die Oberflaeche das VOR dem Absenden — sonst
   * wartet der Monteur auf jemanden, der nie verstaendigt wurde.
   */
  const leitungDa = useMemo(() => {
    if (!projectNumber) return false;
    const p = projects.find((x) => x.projectNumber === projectNumber);
    return (p?.projectManagers ?? []).length > 0;
  }, [projects, projectNumber]);


  /*
    ZULETZT ANGEFORDERT (C5, E89): die eigenen letzten Artikel dieser
    Baustelle, sonst der letzten vier Wochen. Die Artikel kommen aus dem
    Katalog — was nicht auf der geladenen Seite steht, wird nachgeholt.
  */
  const zuletzt = useMemo(() => zuletztAngefordert(myOrders, projectNumber, Date.now()), [myOrders, projectNumber]);
  const [zuletztDazu, setZuletztDazu] = useState<Map<string, WithId<Material> | null>>(new Map());
  const zuletztFehlen = zuletzt.artikel
    .map((a) => a.materialId)
    .filter((id) => !zuletztDazu.has(id) && !materials.some((m) => m.id === id))
    .sort()
    .join('|');
  useEffect(() => {
    if (!user || !zuletztFehlen) return;
    let weg = false;
    katalogNachIds(user.companyId, zuletztFehlen.split('|'))
      .then((artikel) => {
        if (weg) return;
        // Auch was nicht (mehr) da ist, gilt als gefragt — sonst fragte jeder Durchlauf neu.
        setZuletztDazu((alt) => {
          const neu = new Map(alt);
          for (const id of zuletztFehlen.split('|')) if (!neu.has(id)) neu.set(id, null);
          for (const m of artikel) neu.set(m.id, m);
          return neu;
        });
      })
      .catch(() => undefined);
    return () => { weg = true; };
  }, [user, zuletztFehlen]);
  const zuletztZeilen = zuletzt.artikel
    .map((a) => ({ ...a, m: materials.find((m) => m.id === a.materialId) ?? zuletztDazu.get(a.materialId) ?? undefined }))
    // Ausgelaufenes nur, solange noch etwas im Lager liegt — wie im Katalog darunter.
    .filter((a): a is typeof a & { m: WithId<Material> } => !!a.m && (!a.m.ausgelaufen || (a.m.stock ?? 0) > 0));

  const activeOrders = useMemo(
    () => myOrders.filter((o) => o.status !== 'Erledigt' && o.transactionType !== 'return'
      && (!nurAbholbereit || o.status === 'Abholbereit')),
    [myOrders, nurAbholbereit],
  );
  const doneOrders = useMemo(
    () => myOrders.filter((o) => o.status === 'Erledigt' || o.transactionType === 'return'),
    [myOrders],
  );

  /*
    NICHT IM KATALOG (Launch-Check 25.09.2026). Der Monteur konnte nur
    anfordern, was die Verwaltung schon angelegt hatte — der Katalog eines
    Betriebs ist nie vollständig, und die Alternative war der Anruf. Die
    Anforderung trägt dann keinen Katalogartikel; die Verwaltung beschafft
    ihn wie jeden anderen, meist über die Einkaufsliste.
  */
  function freiHinzufuegen() {
    const name = freiName.trim();
    const menge = zahlOder(freiMenge, NaN);
    if (!name || !(menge > 0)) return;
    setCart((prev) => [
      ...prev,
      { materialId: '', materialName: name, quantity: menge, projectNumber, isUrgent: urgent && !!projectNumber },
    ]);
    setFreiName('');
    setFreiMenge('1');
  }

  /** Die Zeile der Liste für diesen Artikel, die gewählte Baustelle und den Eil-Haken. */
  function passtZurZeile(l: CartLine, materialId: string) {
    return l.materialId === materialId && l.projectNumber === projectNumber && !!l.isUrgent === (urgent && !!projectNumber);
  }

  /**
   * Die Menge eines Artikels in der Liste setzen (C1, E89): 0 nimmt ihn
   * heraus. Gleiches Material auf derselben Baustelle bleibt eine Zeile —
   * sonst stünden drei Zeilen „×1“ in der Anforderung.
   */
  function mengeImKorb(m: WithId<Material>, menge: number) {
    setCart((prev) => {
      const i = prev.findIndex((l) => passtZurZeile(l, m.id));
      if (menge <= 0) return i >= 0 ? prev.filter((_, x) => x !== i) : prev;
      if (i >= 0) {
        const copy = [...prev];
        copy[i] = { ...copy[i], quantity: menge };
        return copy;
      }
      return [
        ...prev,
        {
          materialId: m.id,
          materialName: m.name,
          quantity: menge,
          projectNumber,
          // Ohne Baustelle gibt es keine zustaendige Projektleitung, also
          // auch keine Eilzustellung — der Haken wird dann nicht uebernommen.
          isUrgent: urgent && !!projectNumber,
        },
      ];
    });
  }

  async function submitCart() {
    if (!user || cart.length === 0) return;
    setSaving(true);
    setKorbFehler(null);
    // Positionsweise absenden und nur die erfolgreichen entfernen — bei
    // Promise.all bliebe nach einem Teilfehler unklar, was schon geschrieben ist,
    // und ein zweiter Versuch erzeugte Duplikate.
    const failed: CartLine[] = [];
    // Ohne Empfang bestätigt der Server nichts; die Anforderung liegt dann im
    // lokalen Zwischenspeicher und geht später raus. Das muss der Monteur
    // erfahren, sonst tippt er sie im Keller ein zweites Mal.
    let vorgemerkt = false;
    for (const line of cart) {
      try {
        const stand = await createMaterialOrderOhneEmpfang(user.companyId, {
          // Leer heisst „frei getippt" — in der Datenbank ist das kein Artikel.
          materialId: line.materialId || null,
          materialName: line.materialName,
          quantity: line.quantity,
          // DIE NOTIZ WIRD HIER GENOMMEN, NICHT BEIM HINZUFÜGEN. Das Feld
          // erscheint erst, wenn schon etwas im Korb liegt — eine Notiz, die
          // beim Hinzufügen an die Position gehängt wurde, war also immer
          // leer, und was danach getippt wurde, ging beim Absenden still
          // verloren. Gefunden beim Probelauf.
          note: note.trim() || line.note || '',
          projectNumber: line.projectNumber,
          isUrgent: !!line.isUrgent,
          status: 'Offen',
          transactionType: 'order',
          userId: user.uid,
          userName: user.name,
          source: 'manual',
        });
        if (stand === 'queued') vorgemerkt = true;
      } catch {
        failed.push(line);
      }
    }
    setCart(failed);
    setSaving(false);
    if (failed.length === 0) {
      setNote('');
      zuletztMerken(user.companyId, user.uid, cart[cart.length - 1]?.projectNumber);
      if (vorgemerkt) toast.info(vorgemerktMeldung('Anforderung abgeschickt'));
      else toast.success('Anforderung abgeschickt');
      // Zur Verfolgung: dort steht die Anforderung jetzt mit ihrem Stand.
      zuMeinenSpringen();
    } else {
      setKorbFehler(
        `${failed.length} von ${failed.length + (cart.length - failed.length)} Positionen konnten nicht gesendet werden. Sie bleiben im Warenkorb.`,
      );
    }
  }


  /** „Abgeholt“ — die Rückfrage beginnt immer bei „Aus dem Lager“, wie bisher gebucht wurde. */
  function abholen(o: WithId<MaterialOrder>) {
    setHerkunft('lager');
    setToPickUp(o);
  }

  if (!user) return null;

  /** Für wen der Korb ist — eine Baustelle, mehrere oder keine. */
  const korbBaustellen = [...new Set(cart.map((l) => l.projectNumber))];
  const korbZiel =
    korbBaustellen.length > 1
      ? `für ${korbBaustellen.length} Baustellen`
      : korbBaustellen[0]
        ? `für ${projects.find((p) => p.projectNumber === korbBaustellen[0])?.customerName ?? korbBaustellen[0]}`
        : 'ohne Baustelle';

  return (
    <div className="space-y-3 lg:space-y-5">
      <PageHeader
        title="Material anfordern"
        subtitle="Anfordern, Lieferung verfolgen, zurückgeben"
        hilfe={
          <>
            Angefordert wird von der Baustelle bei der Projektleitung.
            Baustelle wählen, Artikel mit „In die Liste“ sammeln und unten abschicken. Darunter
            stehen die eigenen Anforderungen mit ihrem Stand. Was von der Baustelle übrig ist, geht
            über „Material zurückgeben“ ans Lager.
          </>
        }
      />

      {nebenFehler && <TeilFehler was={nebenFehler} />}

      {katalogFehler && <ErrorState message={katalogFehler} />}

      {/* Eine Zeile statt einer eigenen Karte: vorher stand die
          Baustellenauswahl wie eine Hürde vor dem Katalog und schob ihn
          auf dem Telefon unter den Falz. Die Notiz ist in den Warenkorb
          gewandert — sie gehört zum Absenden, nicht zum Suchen.
          SO BREIT WIE EIN FORMULAR (E72, 09.11.2026, Regel R5): frei über die
          Seite gezogen war die Auswahl am Schreibtisch 1128 px breit — für
          einen Baustellennamen. */}
      <div className="formular space-y-2">
        <div className="flex flex-wrap items-end gap-3">
          <div className="min-w-[14rem] flex-1">
            <BaustellenSelect
              id="oproject"
              label="Für welche Baustelle?"
              companyId={user.companyId}
              value={projectNumber}
              onChange={(nr, p) => {
                // Von Hand gewählt: ab jetzt keine Vorbelegung mehr, und der Satz darunter fällt weg.
                // Der Nachtrag des Datensatzes meldet dieselbe Nummer — das ist keine Wahl.
                if (nr !== projectNumber) {
                  setBaustelleBeruehrt(true);
                  setVorbelegt(null);
                }
                setProjectNumber(nr);
                // Den Datensatz mit aufnehmen: die Warenkorbzeilen und die
                // Prüfung auf eine zuständige Projektleitung schlagen hier
                // nach. Ohne ihn stünde bei einer abgeschlossenen
                // Baustelle die nackte Nummer statt des Kundennamens.
                if (p) setProjects((alt) => (alt.some((x) => x.projectNumber === p.projectNumber) ? alt : [...alt, p]));
              }}
            />
            {vorbelegt && projectNumber && (
              <p className="mt-1 text-sm text-ink-muted">{VORBELEG_TEXT[vorbelegt]}</p>
            )}
          </div>
        </div>
        {/* Direkt unter der Baustelle, weil er von ihr abhaengt: ohne
            Baustelle gibt es keine zustaendige Projektleitung und damit
            niemanden, den eine Eilmeldung erreichen koennte. */}
        <div className="flex flex-wrap items-center gap-2">
          <CheckboxField
            id="ourgent"
            label="Eilzustellung"
            checked={urgent && !!projectNumber}
            disabled={!projectNumber}
            onChange={(e) => setUrgent(e.target.checked)}
          />
          <InfoHint about="Eilzustellung">
            Die Projektleitung der Baustelle wird sofort verständigt — bei der Anforderung
            und noch einmal, sobald das Material abholbereit ist. So kann sie es auf dem
            Weg mitnehmen.
          </InfoHint>
          {/* Bleibt sichtbar statt im „i" zu verschwinden: ein
              ausgegrautes Kaestchen ohne Begruendung ist eine Sackgasse,
              und die Zeile verschwindet, sobald eine Baustelle steht. */}
          {!projectNumber && (
            <p className="basis-full text-sm text-ink-muted">
              Dafür zuerst die Baustelle wählen.
            </p>
          )}
        </div>
        {projectNumber && urgent && !leitungDa && (
          <Hinweiszeile stufe="warn">
            <p>
              Dieser Baustelle ist keine Projektleitung zugeteilt — die Eilmeldung erreicht
              niemanden. Die Verwaltung bekommt die Anforderung trotzdem.
            </p>
          </Hinweiszeile>
        )}
      </div>

      {/*
        DIE SUCHE WIE ÜBER JEDER LISTE (E72, 09.11.2026): die Listenleiste
        mit Lupe im Blatt, die Zeilen von Kante zu Kante — wie im Lager und
        im Katalog der Verwaltung. Vorher ein beschriftetes Feld „Suche“ ohne
        Lupe über die ganze Breite, das aussah wie ein Formularfeld.
      */}
      {/* Nur ohne Suche: wer tippt, sucht etwas Bestimmtes, und die Zeilen schöben die Treffer nach unten. */}
      {meineGeladen && search.trim() === '' && zuletztZeilen.length > 0 && (
        <Card title="Zuletzt angefordert" buendig>
          <p className="blatt-einzug pb-2 text-sm text-ink-muted">
            {zuletzt.fuerBaustelle ? 'Für diese Baustelle' : `In den letzten ${ZULETZT_TAGE / 7} Wochen`}
          </p>
          <List>
            {zuletztZeilen.map(({ m, menge, am }) => {
              const inListe = cart.reduce((s, l) => (l.materialId === m.id ? s + l.quantity : s), 0);
              const imKorb = cart.find((l) => passtZurZeile(l, m.id))?.quantity ?? 0;
              return (
                <ListRow
                  key={m.id}
                  title={m.name}
                  subtitle={[`zuletzt ${fmtMenge(menge)} ${m.unit ?? 'Stk'}`, datumAusMs(am)].filter(Boolean).join(' · ')}
                >
                  <KorbMenge material={m} imKorb={imKorb} insgesamt={inListe} onMenge={mengeImKorb} />
                </ListRow>
              );
            })}
          </List>
        </Card>
      )}

      <Card title="Katalog" buendig>
        <Listenleiste
          suche={{
            id: 'search',
            wert: search,
            onChange: (wert) => {
              setSearch(wert);
              setArtikelGezeigt(JE_SEITE);
            },
            platzhalter: 'Name, Kategorie oder Art.-Nr.',
          }}
        />
        <div>
          {loading ? (
            <div className="blatt-einzug pb-6">
              <LoadingState />
            </div>
          ) : materials.length === 0 ? (
            /*
              ECHTE LEERE MIT ZEICHNUNG (Planlinie § 6), wie im Lager: der leere
              Katalog bekommt das Regal, die Suche ohne Treffer die Lupe.
            */
            <EmptyState
              zeichnung={!begriff ? 'lager' : 'suche'}
              titel={!begriff ? 'Noch kein Material im Katalog' : 'Kein Material passt zur Suche.'}
            >
              {!begriff
                ? 'Die Verwaltung pflegt ihn im Material-Dashboard.'
                : `Gesucht wurde „${begriff}“ in Name, Kategorie und Artikelnummer.`}
            </EmptyState>
          ) : (
            <List>
              {materials.map((m) => {
                const verfuegbar = frei?.get(m.id)?.frei ?? m.stock ?? 0;
                // Nur im Katalog (M30): kein Regalbestand — das Büro bestellt ihn.
                const lager = imLager(m);
                const low = lager && istKnapp(verfuegbar, m, LOW_STOCK_THRESHOLD);
                const inListe = cart.reduce((s, l) => (l.materialId === m.id ? s + l.quantity : s), 0);
                const imKorb = cart.find((l) => passtZurZeile(l, m.id))?.quantity ?? 0;
                return (
                  <ListRow
                    key={m.id}
                    title={m.name}
                    subtitle={
                      <>
                        {/* Ohne Kategorie steht nichts davor — „ohne
                            Kategorie" unter jedem Artikel eines Katalogs,
                            der keine pflegt, war nur Rauschen (D16). */}
                        {m.category && `${m.category} · `}
                        {/* Knapp: Punkt in Warnfarbe, Wort in Grau — keine farbige
                            Schrift im Fliesstext (Designlinie „Fassung 3"). */}
                        {lager && !freiFertig ? (
                          <Wert bereit={false} muster="00 Stk frei">{null}</Wert>
                        ) : (
                        <span className={low ? 'stand stand-warn h-auto' : undefined}>
                          {!lager
                            ? 'wird bestellt'
                            : frei?.has(m.id)
                            ? verfuegbar > 0
                              ? `${fmtMenge(verfuegbar)} ${m.unit ?? 'Stk'} frei`
                              : 'nichts frei'
                            : `Lager: ${fmtMenge(m.stock ?? 0)} ${m.unit ?? 'Stk'}`}
                          {low && verfuegbar > 0 && ' (knapp)'}
                        </span>
                        )}
                        {/* M03a: über die Nummer eines Großhändlers gefunden. */}
                        {gefundenUeberText(m) && ` · ${gefundenUeberText(m)}`}
                      </>
                    }
                  >
                    <KorbMenge material={m} imKorb={imKorb} insgesamt={inListe} onMenge={mengeImKorb} />
                  </ListRow>
                );
              })}
            </List>
          )}
          {/* Gruppen höchstens 20 Zeilen (Regel 4): sonst stünden „Meine
              Anforderungen“ unter dem ganzen Katalog. Die Zahl der übrigen
              kommt vom Server — gesucht wird im ganzen Katalog, es gibt
              keine Grenze des Geladenen mehr, die jemand kennen müsste. */}
          {!loading && (
            <MehrAnzeigen
              anzahl={Math.max(0, (seite?.gesamt ?? 0) - materials.length)}
              onClick={() => setArtikelGezeigt((n) => n + JE_SEITE)}
            />
          )}
        </div>
        {/* Erst mit dem Katalog — sonst schob der Katalog die Zeile beim Eintreffen nach unten. */}
        {!loading && (
        <div className="blatt-einzug border-t border-line pb-6 pt-4">
          <p className="section-label">Nicht im Katalog?</p>
          {/* `minmax(0,1fr)` statt `1fr`: sonst gibt die Spalte nicht unter
              die Eigenbreite des Eingabefelds nach, und bei 390 px liefen
              Menge und „Hinzufügen" 90–106 px aus der Karte, wo sie
              abgeschnitten wurden (Prüflauf 25.09.2026, P4-02). */}
          {/* Derselbe Petrol-Kreis wie beim Artikel aus dem Katalog (E74): in jeder Breite in einer Reihe mit den Feldern. */}
          <div className="mt-2 grid grid-cols-[minmax(0,1fr)_5rem_auto] items-end gap-2 sm:grid-cols-[minmax(0,1fr)_6rem_auto]">
            <InputField
              id="frei-name"
              label="Bezeichnung"
              placeholder="z. B. Eckventil ½″ verchromt"
              value={freiName}
              onChange={(e) => setFreiName(e.target.value)}
            />
            <InputField
              id="frei-menge"
              label="Menge"
              inputMode="decimal"
              value={freiMenge}
              onChange={(e) => setFreiMenge(e.target.value)}
            />
            <IconButton
              rund
              label={freiName.trim() ? `${freiName.trim()} in die Liste` : 'In die Liste'}
              disabled={!freiName.trim() || !(zahlOder(freiMenge, NaN) > 0)}
              onClick={freiHinzufuegen}
            >
              <Icon name="in-liste" size={20} />
            </IconButton>
          </div>
        </div>
        )}
      </Card>

      {/*
        DER WARENKORB IM DAUMENBEREICH (Linie „Lot“, E5). Seit der Analyse
        vom 03.10.2026 (Paket 2) klebte „Anforderung abschicken“ am Telefon
        über der Reiterleiste; jetzt sagt die Leiste auch, wie viel für wen
        darin liegt, und klebt an jeder Breite unten, solange Katalog oder
        Korb im Bild sind. Sie KLEBT, statt fest zu stehen, und steht VOR der
        Korbkarte: ist man beim Korb angekommen, ruht sie an ihrem Platz
        darüber und verdeckt weder die Notiz noch eine Zeile des Korbs.
      */}
      {cart.length > 0 && (
        <div className="korb" role="region" aria-label="Warenkorb">
          {korbFehler && (
            <p className="korb-fehler" role="alert">
              {korbFehler}
            </p>
          )}
          <p className="korb-text">
            <a href="#anforderung-korb" className="korb-titel">
              {cart.length} Artikel {korbZiel}
            </a>
            {/* Ein Zustand der Linie („offen“), mit seinem Zeichen wie in den Listen (E47). */}
            <span className="korb-info stand stand-offen">noch nicht abgeschickt</span>
          </p>
          {/*
            EINZEILIG AM HANDY (E72, 09.11.2026): „Liste leeren“ und
            „Anforderung (2) abschicken“ brauchen zusammen 371 px, die Leiste
            hat bei 390 px 358 — beide Knöpfe brachen in zwei Zeilen. Sichtbar
            steht jetzt „Leeren“; der Name für die Vorlesehilfe bleibt „Liste
            leeren“ und enthält das sichtbare Wort.
          */}
          <div className="korb-knoepfe">
            <Button variant="ghost" aria-label="Liste leeren" onClick={() => setCart([])}>
              Leeren
            </Button>
            {/* Am Handy steht nur „Abschicken“ — die Zahl steht links; der Name für die Vorlesehilfe bleibt ganz (D2, E86). */}
            <Button onClick={submitCart} loading={saving} aria-label={`Anforderung (${cart.length}) abschicken`}>
              <span className="korb-lang">{`Anforderung (${cart.length}) abschicken`}</span>
              <span className="korb-kurz" aria-hidden="true">Abschicken</span>
            </Button>
          </div>
        </div>
      )}

      {/*
        DER WARENKORB IST SICHTBAR NOCH NICHT ABGESCHICKT (Testbericht
        30.09.2026, M36). „Anfordern“ legte nur in den Korb, und Monteure
        hielten die Anforderung nach dem ersten Tipp für erledigt. Jetzt
        heissen die Knöpfe „In die Liste“ (bis 04.11.2026 „Zur Anforderung“)
        und „Anforderung abschicken“,
        und die Karte ist hervorgehoben, solange etwas darin liegt.

        LEER STEHT SIE NICHT DA (Analyse 03.10.2026, Paket 1): „Anforderung
        (0)“ war eine Karte ohne Inhalt unter dem Katalog. Sie erscheint
        mit dem ersten „In die Liste“.
      */}
      {cart.length > 0 && (
        <Card
          id="anforderung-korb"
          title={`Anforderung (${cart.length}) — noch nicht abgeschickt`}
          className="border-brand-fixed"
        >
          <div className="mb-4">
            <InputField id="onote" label="Notiz für die Projektleitung (optional)"
              placeholder="z. B. dringend, bis Freitag"
              value={note} onChange={(e) => setNote(e.target.value)} />
          </div>
          <List>
            {cart.map((line, i) => (
              <ListRow
                key={`${line.materialId}-${i}`}
                title={
                  <span>
                    {line.materialName}{' '}
                    <span className="text-ink-muted">×{fmtMenge(line.quantity)}</span>
                  </span>
                }
                subtitle={
                  [
                    line.projectNumber
                      ? projects.find((p) => p.projectNumber === line.projectNumber)
                          ?.customerName ?? line.projectNumber
                      : 'ohne Baustelle',
                    line.note,
                  ]
                    .filter(Boolean)
                    .join(' · ')
                }
              >
                {line.isUrgent && <Warnung stufe="dringend">Eil</Warnung>}
                <IconButton
                  label={`${line.materialName} entfernen`}
                  tone="danger"
                  onClick={() => setCart((prev) => prev.filter((_, x) => x !== i))}
                >
                  <Icon name="papierkorb" size={22} />
                </IconButton>
              </ListRow>
            ))}
          </List>
          <p className="mt-4 text-sm text-ink-muted">
            Erst mit „Anforderung abschicken“ geht sie an die Verwaltung.
          </p>
        </Card>
      )}
      {/*
        MEINE ANFORDERUNGEN STEHEN UNTER DEM KATALOG (Linie „Lot“, E5), nicht
        mehr hinter einem eigenen Reiter: wer Material anfordert, sieht
        dabei, was noch aussteht und was abholbereit ist. Der Verweis der
        Startseite („Material abholbereit →“, `?reiter=meine`) springt hierher.
      */}
      {/*
        DIE RÜCKGABE STEHT SICHTBAR (20.10.2026, Auftrag „Retoure zu dezent“):
        im „⋯“ fand sie niemand, gerade dann, wenn Material übrig war. Kein
        Knopf im Seitenkopf — am Handy wandert die Hauptaktion nach unten, wo
        schon die Leiste des Warenkorbs steht.
      */}
      <Card buendig>
        <List>
          <ListRow
            title="Material zurückgeben"
            subtitle="Übrig von der Baustelle? Zurück ans Lager — Neues wird gutgeschrieben."
            onOeffnen={() => setRetoureOffen(true)}
            pfeil
          />
        </List>
      </Card>

      {/* Was im eigenen Fahrzeug liegt (M04a) — nur für den Standardfahrer, sonst nichts. */}
      <MeinFahrzeug />

      <section id="meine-anforderungen" ref={meineRef} className="space-y-3 lg:space-y-5" aria-label="Meine Anforderungen">
        {nurAbholbereit && <Adressfilter text="nur abholbereite Anforderungen" parameter={['status']} />}
        {/* Unter dem Katalog: erst wenn auch er steht, sonst schiebt er sie beim Eintreffen nach unten.
            Solange er lädt, auch kein Platzhalter — den schöbe die lange Liste ebenso weg (Messung
            11.10.2026: 0,29 am Handy); dass geladen wird, sagt der Katalog selbst. */}
        <Bereit wenn={meineGeladen && !loading} platzhalter={loading ? <></> : undefined} className="space-y-3 lg:space-y-5">
        <Card title={`${nurAbholbereit ? 'Meine Anforderungen: abholbereit' : 'Meine Anforderungen'} (${activeOrders.length})`} buendig>
          {activeOrders.length === 0 ? (
            <EmptyState>Keine offenen Bestellungen.</EmptyState>
          ) : (
            <List>
              {activeOrders.slice(0, meineGezeigt).map((o) => (
                <ListRow
                  key={o.id}
                  title={
                    <span>
                      {o.materialName} <span className="text-ink-muted">×{fmtMenge(o.quantity)}</span>
                    </span>
                  }
                  subtitle={[o.projectNumber, o.note, wasLaeuft(o)].filter(Boolean).join(' · ')}
                  // STAND ZUERST (C7, E89): die ganze Zeile öffnet die Anforderung — dort steht „Eilig“.
                  onOeffnen={() => setFenster(o)}
                >
                  {o.isUrgent && <Warnung stufe="dringend">Eil</Warnung>}
                  <StatusBadge status={o.status} />
                  {/*
                    ABGEHOLT GEHT IMMER, nicht erst ab „Abholbereit". Der Status
                    ist eine Absichtserklärung der Verwaltung, kein
                    Tatsachenbericht: wer sich das Material selbst nimmt oder
                    beim Händler mitnimmt, ist fertig. Solange nichts
                    bereitgestellt ist, fragt die Rückfrage, woher es kam (E89).
                    Ein Zweitknopf, kein gefüllter (E72, R2); volle Größe für
                    Handschuhe.
                  */}
                  <Button variant="secondary" onClick={() => abholen(o)}>
                    Abgeholt
                  </Button>
                </ListRow>
              ))}
            </List>
          )}
          <MehrAnzeigen
            anzahl={Math.max(0, activeOrders.length - meineGezeigt)}
            onClick={() => setMeineGezeigt((n) => n + JE_SEITE)}
          />
        </Card>

        <Card title={`Erledigt (${doneOrders.length})`} buendig>
          {doneOrders.length === 0 ? (
            <EmptyState>Noch nichts erledigt.</EmptyState>
          ) : (
            <List>
              {doneOrders.slice(0, erledigtGezeigt).map((o) => (
                <ListRow
                  key={o.id}
                  title={
                    <span>
                      {o.materialName} <span className="text-ink-muted">×{fmtMenge(o.quantity)}</span>
                    </span>
                  }
                  subtitle={[
                    o.projectNumber || 'ohne Baustelle',
                    // Wann es erledigt wurde — die letzte Änderung ist der Abschluss.
                    o.updatedAt ? datumAusMs(o.updatedAt) : '',
                    o.note,
                    // Warum der Lagerbestand gleich blieb (C7, E89).
                    o.abgeholtHerkunft === 'haendler' ? 'beim Händler mitgenommen' : '',
                  ].filter(Boolean).join(' · ')}
                >
                  {o.transactionType === 'return' ? (
                    <Marke>Retoure</Marke>
                  ) : (
                    <StatusBadge status={o.status} />
                  )}
                </ListRow>
              ))}
            </List>
          )}
          <MehrAnzeigen
            anzahl={Math.max(0, doneOrders.length - erledigtGezeigt)}
            onClick={() => setErledigtGezeigt((n) => n + JE_SEITE)}
          />
        </Card>
        </Bereit>
      </section>

      {/* Die Retoure im Seitenfenster (Linie „Lot“, Regel 8) — dasselbe Formular wie im Lager. */}
      <RetoureFenster
        offen={retoureOffen}
        onClose={() => setRetoureOffen(false)}
        companyId={user.companyId}
        user={user}
        baustelle={retoureBaustelle}
      />

      <ConfirmDialog
        open={!!toPickUp}
        title="Material abgeholt?"
        // Ohne diese beiden Zeilen stand auf dem Knopf die Vorgabe des
        // Dialogs: „Löschen", in Rot. Gefragt wurde „Material abgeholt?" —
        // wer das liest, tippt nicht auf Löschen, sondern bricht ab und
        // meldet, die Abholung lasse sich nicht bestätigen.
        confirmLabel="Abgeholt"
        confirmTone="primary"
        message={
          toPickUp
            ? abschlussText(toPickUp, herkunftFragen(toPickUp) ? herkunft : undefined)
            : ''
        }
        onCancel={() => setToPickUp(null)}
        onConfirm={async () => {
          if (toPickUp) {
            try {
              const r = await updateOrderStatus(toPickUp.id, 'Erledigt', {
                von: toPickUp.status,
                ...(herkunftFragen(toPickUp) ? { herkunft } : {}),
              });
              if (r.art === 'geaendert') {
                toast.success('Abholung bestätigt');
              } else {
                // Schon gebucht oder vom Lager geändert: keine Erfolgsmeldung für nichts (R7-M3).
                toast.info('Inzwischen schon als abgeholt gebucht oder vom Lager geändert — die Liste zeigt jetzt den neuen Stand.');
                setNeuLaden((n) => n + 1);
              }
            } catch (err) {
              toast.error(grundAus(err, 'Die Abholung konnte nicht gebucht werden.'));
            }
          }
          setToPickUp(null);
        }}
      >
        {/*
          WOHER DIE WARE KAM (C7, E89) — nur, solange das Büro nichts
          bereitgestellt und nichts bestellt hat. „Aus dem Lager“ bucht wie
          bisher ab; „Beim Händler mitgenommen“ lässt den Bestand stehen —
          das Regal hat die Ware nie gesehen.
        */}
        {toPickUp && herkunftFragen(toPickUp) && (
          <fieldset className="mt-3">
            <legend className="section-label mb-1">Woher kommt das Material?</legend>
            <div className="flex flex-col gap-1">
              {([['lager', 'Aus dem Lager genommen'], ['haendler', 'Beim Händler mitgenommen']] as const).map(([wert, text]) => (
                <label key={wert} className="flex min-h-touch items-center gap-3 py-1">
                  <input
                    type="radio"
                    name="abgeholt-herkunft"
                    className="h-5 w-5 shrink-0 accent-[color:var(--accent-deep)]"
                    checked={herkunft === wert}
                    onChange={() => setHerkunft(wert)}
                  />
                  <span>{text}</span>
                </label>
              ))}
            </div>
          </fieldset>
        )}
      </ConfirmDialog>

      {fenster && (
        <AnforderungFenster
          key={fenster.id}
          o={fenster}
          wasLaeuft={wasLaeuft(fenster)}
          onEilig={() => { setEilFrage(fenster); setFenster(null); }}
          onAbgeholt={() => { abholen(fenster); setFenster(null); }}
          onClose={() => setFenster(null)}
        />
      )}

      <ConfirmDialog
        open={!!eilFrage}
        title="Als eilig markieren?"
        confirmLabel="Eilig"
        confirmTone="primary"
        message={
          !eilFrage
            ? ''
            : // Dieselbe Auskunft wie beim Anlegen („Eilzustellung“): ohne Projektleitung erreicht die Meldung niemanden.
              (projects.find((p) => p.projectNumber === eilFrage.projectNumber)?.projectManagers ?? []).length > 0
              ? `${eilFrage.materialName} für ${eilFrage.projectNumber}: das Lager zieht sie vor, und die Projektleitung der Baustelle wird verständigt — sie kann es auf dem Weg mitnehmen.`
              : `${eilFrage.materialName} für ${eilFrage.projectNumber}: das Lager zieht sie vor. Dieser Baustelle ist keine Projektleitung zugeteilt — eine Eilmeldung erreicht dort niemanden.`
        }
        onCancel={() => setEilFrage(null)}
        onConfirm={async () => {
          if (eilFrage) {
            try {
              await anforderungEiligSetzen(eilFrage.id, true);
              toast.success('Als eilig markiert');
            } catch (err) {
              toast.error(grundAus(err, 'Die Anforderung ließ sich nicht als eilig markieren.'));
            }
          }
          setEilFrage(null);
        }}
      />
    </div>
  );
}

/**
 * EIN TIPP LEGT IN DIE LISTE (C1, E89, 13.11.2026).
 *
 * Vorher standen je Artikel Minus, Menge, Plus und daneben der Kreis „In die
 * Liste“ — zwei Bedienungen für eine Absicht, und was schon in der Liste lag,
 * stand in einer zweiten Zeile darunter. Jetzt:
 *
 * - Liegt der Artikel (für diese Baustelle) noch nicht in der Liste, steht da
 *   nur der Petrol-Kreis „In die Liste“: ein Tipp legt eines hinein — der
 *   Regelfall auf der Baustelle.
 * - Danach steht AN DERSELBEN STELLE die Menge mit Minus und Plus; sie ist
 *   die Menge in der Liste, nicht ein Vorschlag daneben. Plus legt eines
 *   dazu, Minus nimmt eines weg, bei eins nimmt es den Artikel heraus. Für
 *   dreißig Meter Rohr tippt man die Zahl ins Feld.
 *
 * Die Zeile bleibt einzeilig. Nur wenn derselbe Artikel auch für eine andere
 * Baustelle in der Liste liegt, steht die Summe klein darunter.
 */
function KorbMenge({
  material,
  imKorb,
  insgesamt,
  onMenge,
}: {
  material: WithId<Material>;
  /** Menge in der Zeile für die gewählte Baustelle (und Eil-Haken). */
  imKorb: number;
  /** Was insgesamt davon in der Liste liegt — auch für andere Baustellen. */
  insgesamt: number;
  onMenge: (m: WithId<Material>, menge: number) => void;
}) {
  const einheit = material.unit ?? 'Stk';
  const [text, setText] = useState(zahlAlsText(imKorb));
  // Ändert sich die Liste von außen (Plus, Minus, „Liste leeren“), zeigt das Feld es.
  useEffect(() => setText(zahlAlsText(imKorb)), [imKorb]);
  const zahl = zahlOder(text, NaN);
  const gueltig = mengeFehler(zahl, material.unit) === null;

  if (imKorb <= 0) {
    return (
      <div className="flex flex-col items-end gap-1">
        {/* Der Petrol-Kreis der Zeile (E74): er legt genau eines hinein. */}
        <IconButton rund label={`${material.name} in die Liste`} onClick={() => onMenge(material, 1)}>
          <Icon name="in-liste" size={20} />
        </IconButton>
        {insgesamt > 0 && (
          <p className="text-sm text-ink-muted" aria-live="polite">{`${fmtMenge(insgesamt)} ${einheit} in der Liste`}</p>
        )}
      </div>
    );
  }

  return (
    <div className="flex flex-col items-end gap-1">
      {/* Minus, Menge, Plus in einem Rahmen (E74) — die Menge IST die Liste. */}
      <div className={`mengen-wahl${gueltig ? '' : ' mengen-wahl-fehler'}`}>
        <button
          type="button"
          className="mengen-schritt"
          aria-label={imKorb <= 1 ? `${material.name} aus der Liste nehmen` : `${material.name}: eines weniger`}
          title={imKorb <= 1 ? 'Aus der Liste' : 'Weniger'}
          onClick={() => onMenge(material, imKorb <= 1 ? 0 : imKorb - 1)}
        >
          −
        </button>
        <input
          type="text"
          inputMode={mengeMitKomma(material.unit) ? 'decimal' : 'numeric'}
          autoComplete="off"
          data-zahl=""
          value={text}
          onChange={(e) => {
            setText(e.target.value);
            const n = zahlOder(e.target.value, NaN);
            // Erst eine brauchbare Menge geht in die Liste; leer heißt „ich tippe gerade“.
            if (mengeFehler(n, material.unit) === null) onMenge(material, n);
          }}
          // Wer mit einer unbrauchbaren Menge weggeht, findet wieder, was in der Liste liegt.
          onBlur={() => { if (!gueltig) setText(zahlAlsText(imKorb)); }}
          onFocus={(e) => e.currentTarget.select()}
          aria-label={`Menge ${einheit} für ${material.name} in der Liste`}
          aria-invalid={!gueltig || undefined}
          className="mengen-feld"
        />
        <button
          type="button"
          className="mengen-schritt"
          aria-label={`${material.name} in die Liste (eines mehr)`}
          title="Eines mehr"
          onClick={() => onMenge(material, imKorb + 1)}
        >
          +
        </button>
      </div>
      {insgesamt > imKorb && (
        <p className="text-sm text-ink-muted" aria-live="polite">{`insgesamt ${fmtMenge(insgesamt)} ${einheit} in der Liste`}</p>
      )}
    </div>
  );
}

/**
 * WARUM ES DAUERT. Liegt es nicht im Lager, wird es beim Großhändler
 * bestellt — das sagt dem Monteur, dass er nicht vergeblich ins Lager fährt.
 * In der Zeile und im Seitenfenster derselbe Satz.
 */
function wasLaeuft(o: MaterialOrder): string {
  if (o.beschaffung !== 'einkauf' || o.geliefertAm) return '';
  return o.bestelltAm ? 'beim Großhändler bestellt' : 'nicht im Lager — wird bestellt';
}
