import { useEffect, useMemo, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useAuth } from '@/app/AuthContext';
import Adressfilter from '@/components/Adressfilter';
import { subscribeMaterials, LOW_STOCK_THRESHOLD, lagerFrei, type LagerStand } from '@/lib/db/materials';
import { imLager, istKnapp } from './lagerartikel';
import { KATALOG_GRENZE } from '@/lib/listengrenzen';
import {
  createMaterialOrderOhneEmpfang,
  subscribeOwnOrders,
  updateOrderStatus,
  createReturn,
} from '@/lib/db/materialOrders';
import { listActiveProjects } from '@/lib/db/projects';
import type { WithId } from '@/lib/db/core';
import type { Material, MaterialOrder, Project } from '@/types';
import Card from '@/components/Card';
import Nachladen from '@/components/Nachladen';
import Button from '@/components/Button';
import BottomSheet from '@/components/BottomSheet';
import RowMenu from '@/components/RowMenu';
import { MehrAnzeigen } from '@/components/LotBausteine';
import Hinweiszeile from '@/components/Hinweiszeile';
import { Marke, Warnung } from '@/components/Badge';
import IconButton from '@/components/IconButton';
import StatusBadge from '@/components/StatusBadge';
import PageHeader from '@/components/PageHeader';
import ConfirmDialog from '@/components/ConfirmDialog';
import { List, ListRow } from '@/components/ListRow';
import { InputField, SelectField, CheckboxField } from '@/components/Field';
import BaustellenSelect from '@/components/BaustellenSelect';
import InfoHint from '@/components/InfoHint';
import { useToast } from '@/components/Toast';
import { vorgemerktMeldung } from '@/lib/sync/ausgangsfach';
import { LoadingState, ErrorState, EmptyState, TeilFehler } from '@/components/States';
import { grundAus } from '@/lib/fehlerGrund';
import { datumAusMs } from '@/lib/datum';
import { abschlussText } from './abschlussText';
import { zahlAlsText, zahlOder } from '@/lib/zahl';
import { mengeFehler, mengeMitKomma } from '@/lib/einheit';
import ZahlFeld from '@/components/ZahlFeld';
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
  /** Die Retoure steht im Seitenfenster. */
  const [retoureOffen, setRetoureOffen] = useState(false);
  const [materials, setMaterials] = useState<WithId<Material>[]>([]);
  /*
    WAS FREI IST, NICHT WAS IM REGAL STEHT (Testbericht 30.09.2026, G19):
    „5 Stk (knapp)“, obwohl 3 davon zugesagt oder für einen Einsatz geplant
    waren. Die Zahl kommt aus der Datenbank; bis sie da ist oder wenn sie
    ausbleibt, steht der Bestand.
  */
  const [frei, setFrei] = useState<Map<string, LagerStand> | null>(null);
  useEffect(() => {
    if (!user) return;
    let weg = false;
    Promise.resolve()
      .then(() => lagerFrei(materials.map((m) => m.id)))
      .then((k) => { if (!weg) setFrei(k); })
      .catch(() => undefined);
    return () => { weg = true; };
  }, [user, materials]);
  const [projects, setProjects] = useState<Project[]>([]);
  const [myOrders, setMyOrders] = useState<WithId<MaterialOrder>[]>([]);
  const [loading, setLoading] = useState(true);
  /* Warum der Katalog eine Grenze braucht: siehe `lib/db/materials.ts`. */
  const [grenze, setGrenze] = useState(KATALOG_GRENZE);
  const [error, setError] = useState<string | null>(null);
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
  const [projectNumber, setProjectNumber] = useState('');
  const [note, setNote] = useState('');
  const [urgent, setUrgent] = useState(false);
  const [search, setSearch] = useState('');
  /** Ein Artikel, den der Katalog nicht kennt — frei getippt. */
  const [freiName, setFreiName] = useState('');
  const [freiMenge, setFreiMenge] = useState('1');
  const [toPickUp, setToPickUp] = useState<WithId<MaterialOrder> | null>(null);

  // Retoure
  const [retMaterial, setRetMaterial] = useState('');
  /** Suchtext für die Artikelauswahl der Retoure. */
  const [retSuche, setRetSuche] = useState('');
  const [retQty, setRetQty] = useState('1');
  const [retCondition, setRetCondition] = useState<'neu' | 'gebraucht' | 'defekt'>('neu');
  const [retProject, setRetProject] = useState('');
  const [retReason, setRetReason] = useState('');

  useEffect(() => {
    if (!user) return;
    // Ohne Hinweis waere das Baustellenfeld leer, und der Monteur haelt seine
    // Baustelle fuer nicht angelegt.
    listActiveProjects(user.companyId)
      .then(setProjects)
      .catch(() => setNebenFehler('Die Baustellen'));
    const unsubM = subscribeMaterials(
      user.companyId,
      (rows) => {
        setMaterials(rows);
        setLoading(false);
      },
      (e) => {
        setError(e.message);
        setLoading(false);
      },
      grenze,
    );
    // Siehe StockView: ein stumm gescheitertes Abo sieht aus wie „nichts da".
    const unsubO = subscribeOwnOrders(
      user.companyId,
      user.uid,
      EIGENE_ANFORDERUNGEN,
      setMyOrders,
      () => setNebenFehler('Deine Anforderungen'),
    );
    return () => {
      unsubM();
      unsubO();
    };
  }, [user, grenze]);

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

  const sortedMaterials = useMemo(
    () => [...materials].sort((a, b) => a.name.localeCompare(b.name, 'de')),
    [materials],
  );
  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return sortedMaterials;
    // Auch Kategorie und Artikelnummer durchsuchen — danach wird real gesucht.
    return sortedMaterials.filter((m) =>
      [m.name, m.category, m.articleNumber].some((v) => v?.toLowerCase().includes(q)),
    );
  }, [sortedMaterials, search]);

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

  /**
   * DIE ARTIKELAUSWAHL DER RETOURE IST EINE SUCHE, KEIN AUSWAHLFELD.
   *
   * Ein Auswahlfeld ist bei zwanzig Artikeln bequem und bei zweihundert
   * unbrauchbar: auf dem Telefon wird daraus eine Rolliste, durch die man
   * blind scrollt, ohne tippen zu können. Gesucht wird über dieselben drei
   * Felder wie im Katalog — Bezeichnung, Kategorie, Artikelnummer —, damit
   * man nicht zwei verschiedene Suchen lernen muss.
   */
  const retTreffer = useMemo(() => {
    const q = retSuche.trim().toLowerCase();
    if (!q) return [];
    return sortedMaterials
      .filter((m) => [m.name, m.category, m.articleNumber].some((v) => v?.toLowerCase().includes(q)))
      .slice(0, 8);
  }, [sortedMaterials, retSuche]);

  const retGewaehlt = useMemo(
    () => materials.find((m) => m.id === retMaterial) ?? null,
    [materials, retMaterial],
  );

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

  function addToCart(m: WithId<Material>, qty: number) {
    if (qty <= 0) return;
    setCart((prev) => {
      // Gleiches Material auf derselben Baustelle wird zusammengefasst.
      const i = prev.findIndex(
        (l) =>
          l.materialId === m.id &&
          l.projectNumber === projectNumber &&
          !!l.isUrgent === (urgent && !!projectNumber),
      );
      if (i >= 0) {
        const copy = [...prev];
        copy[i] = { ...copy[i], quantity: copy[i].quantity + qty };
        return copy;
      }
      return [
        ...prev,
        {
          materialId: m.id,
          materialName: m.name,
          quantity: qty,
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

  async function submitReturn() {
    if (!user || !retMaterial) return;
    // Ohne diese Prüfung ginge eine negative Menge als increment(-n) durch und
    // eine Retoure würde den Lagerbestand VERRINGERN.
    // Zentral gelesen (M15); „1,5“ wird nicht still zu 1.
    const qty = zahlOder(retQty, NaN, { negativ: true });
    // Je Einheit (M27): Rohr in Metern mit Komma, Stück ganz.
    const einheit = materials.find((m) => m.id === retMaterial)?.unit;
    const falsch = mengeFehler(qty, einheit);
    if (falsch) {
      setError(falsch);
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const mat = materials.find((m) => m.id === retMaterial);
      await createReturn(user.companyId, {
        materialId: retMaterial,
        materialName: mat?.name ?? '',
        quantity: qty,
        condition: retCondition,
        note: retReason,
        projectNumber: retProject,
        userId: user.uid,
        userName: user.name,
      });
      setRetMaterial('');
      setRetSuche('');
      setRetQty('1');
      setRetReason('');
      setRetoureOffen(false);
      toast.success(
        retCondition === 'neu'
          ? 'Retoure erfasst — Material wurde dem Lager gutgeschrieben'
          : 'Retoure erfasst',
      );
    } catch (err) {
      setError(grundAus(err, 'Die Retoure konnte nicht erfasst werden.'));
    } finally {
      setSaving(false);
    }
  }

  function retoureSchliessen() {
    setRetoureOffen(false);
    setError(null);
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
        subtitle="Von der Baustelle bei der Projektleitung anfordern, Lieferung verfolgen und Rückgaben erfassen"
        hilfe={
          <>
            Baustelle wählen, Artikel mit „Zur Anforderung“ sammeln und unten abschicken. Darunter
            stehen die eigenen Anforderungen mit ihrem Stand. Eine Rückgabe ans Lager steht im „⋯“.
          </>
        }
        mehr={
          <RowMenu
            about="Material"
            items={[{ label: 'Retoure erfassen …', onSelect: () => setRetoureOffen(true) }]}
          />
        }
      />

      {nebenFehler && <TeilFehler was={nebenFehler} />}

      {error && !retoureOffen && <ErrorState message={error} />}

      {/* Eine Zeile statt einer eigenen Karte: vorher stand die
          Baustellenauswahl wie eine Hürde vor dem Katalog und schob ihn
          auf dem Telefon unter den Falz. Die Notiz ist in den Warenkorb
          gewandert — sie gehört zum Absenden, nicht zum Suchen. */}
      <div className="space-y-2">
        <div className="flex flex-wrap items-end gap-3">
          <div className="min-w-[14rem] flex-1">
            <BaustellenSelect
              id="oproject"
              label="Für welche Baustelle?"
              companyId={user.companyId}
              value={projectNumber}
              onChange={(nr, p) => {
                setProjectNumber(nr);
                // Den Datensatz mit aufnehmen: die Warenkorbzeilen und die
                // Prüfung auf eine zuständige Projektleitung schlagen hier
                // nach. Ohne ihn stünde bei einer abgeschlossenen
                // Baustelle die nackte Nummer statt des Kundennamens.
                if (p) setProjects((alt) => (alt.some((x) => x.projectNumber === p.projectNumber) ? alt : [...alt, p]));
              }}
            />
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

      <Card title="Katalog">
        <InputField id="search" label="Suche"
          placeholder="Name, Kategorie oder Art.-Nr."
          value={search} onChange={(e) => {
            setSearch(e.target.value);
            setArtikelGezeigt(JE_SEITE);
          }} />
        <div className="mt-4">
          {loading ? (
            <LoadingState />
          ) : filtered.length === 0 ? (
            <EmptyState>
              {materials.length === 0
                ? 'Der Materialkatalog ist noch leer. Die Verwaltung pflegt ihn im Material-Dashboard.'
                : 'Kein Material passt zur Suche.'}
            </EmptyState>
          ) : (
            <List>
              {filtered.slice(0, artikelGezeigt).map((m) => {
                const verfuegbar = frei?.get(m.id)?.frei ?? m.stock ?? 0;
                // Nur im Katalog (M30): kein Regalbestand — das Büro bestellt ihn.
                const lager = imLager(m);
                const low = lager && istKnapp(verfuegbar, m, LOW_STOCK_THRESHOLD);
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
                      </>
                    }
                  >
                    <QtyAdder material={m} onAdd={addToCart} />
                  </ListRow>
                );
              })}
            </List>
          )}
          {/* Gruppen höchstens 20 Zeilen (Regel 4): sonst stünden „Meine
              Anforderungen“ unter dem ganzen Katalog. Die Suche findet
              weiter in allem, was geladen ist. */}
          <MehrAnzeigen
            anzahl={Math.max(0, filtered.length - artikelGezeigt)}
            onClick={() => setArtikelGezeigt((n) => n + JE_SEITE)}
          />
          {/*
            Der Monteur sucht hier den Artikel, den er braucht. Findet er
            ihn nicht, muss dastehen, ob es ihn nicht gibt oder ob die
            Liste nur nicht so weit reicht — sonst tippt er ihn von Hand
            ein, und der Katalogeintrag mit Preis und Bestand bleibt
            ungenutzt.
          */}
          <Nachladen
            geladen={materials.length}
            grenze={grenze}
            onMehr={() => setGrenze((g) => g + KATALOG_GRENZE)}
            einheit="Artikel"
            sucheSatz="Nach Name und Artikelnummer wird nur in diesen gesucht."
          />
        </div>
        <div className="mt-4 border-t border-line pt-4">
          <p className="section-label">Nicht im Katalog?</p>
          {/* `minmax(0,1fr)` statt `1fr`: sonst gibt die Spalte nicht unter
              die Eigenbreite des Eingabefelds nach, und bei 390 px liefen
              Menge und „Hinzufügen" 90–106 px aus der Karte, wo sie
              abgeschnitten wurden (Prüflauf 25.09.2026, P4-02). */}
          <div className="mt-2 grid grid-cols-[minmax(0,1fr)_5rem] gap-2 sm:grid-cols-[minmax(0,1fr)_6rem_auto] sm:items-end">
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
            <Button
              variant="secondary"
              className="col-span-2 sm:col-span-1"
              disabled={!freiName.trim() || !(zahlOder(freiMenge, NaN) > 0)}
              onClick={freiHinzufuegen}
            >
              In die Liste
            </Button>
          </div>
        </div>
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
            <span className="korb-info">noch nicht abgeschickt</span>
          </p>
          <div className="korb-knoepfe">
            <Button variant="ghost" onClick={() => setCart([])}>
              Liste leeren
            </Button>
            <Button onClick={submitCart} loading={saving}>
              {`Anforderung (${cart.length}) abschicken`}
            </Button>
          </div>
        </div>
      )}

      {/*
        DER WARENKORB IST SICHTBAR NOCH NICHT ABGESCHICKT (Testbericht
        30.09.2026, M36). „Anfordern“ legte nur in den Korb, und Monteure
        hielten die Anforderung nach dem ersten Tipp für erledigt. Jetzt
        heissen die Knöpfe „Zur Anforderung“ und „Anforderung abschicken“,
        und die Karte ist hervorgehoben, solange etwas darin liegt.

        LEER STEHT SIE NICHT DA (Analyse 03.10.2026, Paket 1): „Anforderung
        (0)“ war eine Karte ohne Inhalt unter dem Katalog. Sie erscheint
        mit dem ersten „Zur Anforderung“.
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
                  ✕
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
      <section id="meine-anforderungen" ref={meineRef} className="space-y-3 lg:space-y-5" aria-label="Meine Anforderungen">
        {nurAbholbereit && <Adressfilter text="nur abholbereite Anforderungen" parameter={['status']} />}
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
                  subtitle={[
                    o.projectNumber,
                    o.note,
                    /*
                      WARUM ES DAUERT. Liegt es nicht im Lager, wird es beim
                      Grosshändler bestellt — das sagt dem Monteur, dass er
                      nicht vergeblich ins Lager fährt.
                    */
                    o.beschaffung === 'einkauf' && !o.geliefertAm
                      ? o.bestelltAm
                        ? 'beim Großhändler bestellt'
                        : 'nicht im Lager — wird bestellt'
                      : '',
                  ].filter(Boolean).join(' · ')}
                >
                  {o.isUrgent && <Warnung stufe="dringend">Eil</Warnung>}
                  <StatusBadge status={o.status} />
                  {/*
                    ABGEHOLT GEHT IMMER, nicht erst ab „Abholbereit".

                    Der Status ist eine Absichtserklärung der Verwaltung, kein
                    Tatsachenbericht. Wer sich das Material selbst aus dem
                    Lager nimmt oder es beim Händler mitnimmt, ist fertig —
                    unabhängig davon, ob jemand im Büro dazu gekommen ist,
                    den Status weiterzuschalten. Vorher blieb so eine
                    Anforderung ewig offen, und der Lagerabzug unterblieb.

                    Der Abschluss zieht das Material vom Lager ab; deshalb
                    geht er weiterhin durch die Rückfrage.
                  */}
                  <Button variant="primary" onClick={() => setToPickUp(o)}>
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
      </section>

      {/*
        DIE RETOURE IM SEITENFENSTER (Linie „Lot“, Regel 8). Bis zum Umbau ein
        eigener Reiter; sie ist der seltene Weg, Katalog und eigene
        Anforderungen sind der häufige.
      */}
      <BottomSheet
        open={retoureOffen}
        onClose={retoureSchliessen}
        label="Material zurückgeben"
        auchBreit
        titel="Material zurückgeben"
      >
        <div className="formular space-y-4">
          <p className="flex flex-wrap items-center gap-1 text-sm text-ink-muted">
            Nur Neues wird dem Lager gutgeschrieben.
            <InfoHint about="die Retoure">
              Nur unbenutztes Material in Originalverpackung wird dem Lagerbestand wieder
              gutgeschrieben. Gebrauchtes und defektes Material wird nur erfasst.
            </InfoHint>
          </p>
          {retGewaehlt ? (
            // Die Wahl steht wie ein ausgefülltes Feld da: weiss mit Haarlinie.
            <div className="flex flex-wrap items-center justify-between gap-2 rounded border border-line bg-surface px-3 py-2">
              <div>
                <span className="section-label block">Material</span>
                <span className="font-semibold text-ink">{retGewaehlt.name}</span>
                <span className="block text-sm text-ink-muted">
                  {[retGewaehlt.category, retGewaehlt.articleNumber].filter(Boolean).join(' · ')}
                </span>
              </div>
              <Button
                variant="ghost"
                onClick={() => {
                  setRetMaterial('');
                  setRetSuche('');
                }}
              >
                Ändern
              </Button>
            </div>
          ) : (
            <div>
              <InputField
                id="retmat"
                label="Material"
                type="search"
                placeholder="Name, Kategorie oder Art.-Nr."
                value={retSuche}
                onChange={(e) => setRetSuche(e.target.value)}
              />
              {retSuche.trim() !== '' && (
                <div className="mt-2">
                  {retTreffer.length === 0 ? (
                    <p className="text-sm text-ink-muted">Kein Material passt zur Suche.</p>
                  ) : (
                    <List>
                      {retTreffer.map((m) => (
                        <ListRow
                          key={m.id}
                          title={m.name}
                          subtitle={[m.category, m.articleNumber].filter(Boolean).join(' · ') || undefined}
                        >
                          <Button
                            variant="secondary"
                            aria-label={`${m.name} zurückgeben`}
                            onClick={() => {
                              setRetMaterial(m.id);
                              setRetSuche('');
                            }}
                          >
                            Wählen
                          </Button>
                        </ListRow>
                      ))}
                    </List>
                  )}
                </div>
              )}
            </div>
          )}
          <ZahlFeld id="retqty" label="Menge" value={retQty} onChange={setRetQty} />
          <SelectField id="retcond" label="Zustand" value={retCondition}
            onChange={(e) => setRetCondition(e.target.value as typeof retCondition)}>
            <option value="neu">Neu / originalverpackt</option>
            <option value="gebraucht">Gebraucht</option>
            <option value="defekt">Defekt</option>
          </SelectField>
          <SelectField id="retproj" label="Von welcher Baustelle? (optional)" value={retProject}
            onChange={(e) => setRetProject(e.target.value)}>
            <option value="">— keine —</option>
            {projects.map((p) => (
              <option key={p.id} value={p.projectNumber}>
                {p.customerName} <span className="nr">({p.projectNumber})</span>
              </option>
            ))}
          </SelectField>
          <InputField id="retreason" label="Grund / Notiz" value={retReason}
            onChange={(e) => setRetReason(e.target.value)} />
          {/* Der Fehler der Retoure steht im Fenster, wo er entstand. */}
          {error && <ErrorState message={error} />}
          <div className="fuss-aktionen">
            <Button variant="ghost" onClick={retoureSchliessen}>
              Abbrechen
            </Button>
            <Button onClick={submitReturn} loading={saving} disabled={!retMaterial}>
              Retoure erfassen
            </Button>
          </div>
        </div>
      </BottomSheet>

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
            ? abschlussText(toPickUp)
            : ''
        }
        onCancel={() => setToPickUp(null)}
        onConfirm={async () => {
          if (toPickUp) {
            try {
              await updateOrderStatus(toPickUp.id, 'Erledigt');
              toast.success('Abholung bestätigt');
            } catch (err) {
              toast.error(grundAus(err, 'Die Abholung konnte nicht gebucht werden.'));
            }
          }
          setToPickUp(null);
        }}
      />
    </div>
  );
}

/** Mengenfeld mit Hinzufügen-Knopf; hält seine Menge lokal. */
/**
 * Anfordern mit einem Griff.
 *
 * Vorher: Menge ins Zahlenfeld tippen, dann „Hinzufügen" — zwei Bedienungen
 * je Artikel, auf dem Telefon mit Arbeitshandschuhen. Der Regelfall ist ein
 * Stück, deshalb fügt „+" sofort eines hinzu; die Zahl daneben zählt hoch und
 * lässt sich für größere Mengen weiter antippen.
 */
function QtyAdder({
  material,
  onAdd,
}: {
  material: WithId<Material>;
  onAdd: (m: WithId<Material>, qty: number) => void;
}) {
  const [menge, setMenge] = useState('1');
  const [added, setAdded] = useState(0);

  // Zentral gelesen (M15), und je Einheit (M27): Meter und Kilo mit Komma,
  // Stück ganz — „1,5 Stk“ ist ungültig, nicht still 1.
  const zahl = zahlOder(menge, NaN);
  const mitKomma = mengeMitKomma(material.unit);
  const gueltig = mengeFehler(zahl, material.unit) === null;

  function anfordern() {
    if (!gueltig) return;
    onAdd(material, zahl);
    setAdded((n) => n + zahl);
    // Nach dem Anfordern zurück auf eins: die nächste Position ist wieder
    // eine, und eine stehengebliebene 40 wäre die teurere Überraschung.
    setMenge('1');
  }

  return (
    <div className="flex items-center gap-1">
      {added > 0 && (
        <span className="mr-1 text-sm font-semibold text-accent-deep" aria-live="polite">
          ×{fmtMenge(added)}
        </span>
      )}
      {/*
        MINUS UND PLUS SIND DIE HAUPTBEDIENUNG, das Feld dazwischen der
        Ausweg für grosse Mengen. Auf der Baustelle wird mit Handschuhen
        getippt: zwei grosse Ziele treffen sicherer als ein Zahlenfeld, und
        wer dreissig Meter Rohr braucht, tippt die Zahl trotzdem direkt ein,
        statt dreissig Mal zu drücken.
      */}
      <IconButton
        label={`Menge für ${material.name} verringern`}
        onClick={() => setMenge(zahlAlsText(Math.max(1, (gueltig ? zahl : 1) - 1)))}
        disabled={gueltig && zahl <= 1}
      >
        −
      </IconButton>
      <input
        type="text"
        inputMode={mitKomma ? 'decimal' : 'numeric'}
        autoComplete="off"
        data-zahl=""
        value={menge}
        onChange={(e) => setMenge(e.target.value)}
        onFocus={(e) => e.currentTarget.select()}
        aria-label={`Menge ${material.unit ?? 'Stk'} für ${material.name}`}
        className={`h-11 w-14 rounded border bg-surface text-center text-base font-semibold ${
          gueltig ? 'border-line text-ink' : 'border-danger text-danger'
        }`}
      />
      <IconButton
        label={`Menge für ${material.name} erhöhen`}
        onClick={() => setMenge(zahlAlsText((gueltig ? zahl : 0) + 1))}
      >
        +
      </IconButton>
      <Button
        variant={added > 0 ? 'primary' : 'secondary'}
        aria-label={`${material.name} zur Anforderung`}
        disabled={!gueltig}
        onClick={anfordern}
      >
        Zur Anforderung
      </Button>
    </div>
  );
}
