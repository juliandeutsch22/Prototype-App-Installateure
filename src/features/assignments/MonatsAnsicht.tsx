import { Fragment, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type MouseEvent } from 'react';
import { createPortal } from 'react-dom';
import { useAuth } from '@/app/AuthContext';
import { canAccess } from '@/app/navigation';
import { darfTermineSchreiben } from '@/lib/permissions';
import { useModul } from '@/lib/useModule';
import { AB_TABLET } from '@/lib/breiten';
import { getAustrianHolidayName, isWeekend, todayStr } from '@/lib/time';
import type { Abwesenheit } from '@/lib/db/vacations';
import type { WithId } from '@/lib/db/core';
import type { AppUser, Assignment, Project, RuestPosition, Termin } from '@/types';
import { bezugText } from '@/features/termine/terminText';
import Card from '@/components/Card';
import { List, ListRow } from '@/components/ListRow';
import { EmptyState } from '@/components/States';
import { MehrAnzeigen } from '@/components/LotBausteine';
import type { FensterStart } from './EinsatzFenster';
import { lokalesDatum } from './wochenplan';
import { tagKurz, type Brett, type Gruppe } from './planTypen';
import { kurzname, kurzPerson } from './kurzname';
import { ortAus } from './wochenTermine';
import {
  balkenBilden,
  baustellenDesMonats,
  baustelleTag,
  beschriftet,
  lieferungOhneAnnahme,
  personTag,
  tagImBalken,
  type Balken,
} from './monatsBalken';
import { ruestZeile, vorschauInhalt, type ProjektKurz, type TagesDaten, type VorschauZiel } from './monatsVorschau';
import MonatsVorschau from './MonatsVorschau';
import MonatsKalender from './MonatsKalender';
import { DB_QUELLE, type MonatsQuelle } from './monatsQuelle';

/** Gruppen höchstens 20 Zeilen, dann „und N weitere“ (Regel 4). */
const SEITE = 20;

/**
 * DER MONAT (Runde 4, Auftrag 5): wer ist wann wo — als Balken.
 *
 * Aufeinanderfolgende Tage einer Person auf derselben Baustelle sind EIN
 * Balken; ein Klick auf einen Balken oder einen Tag zeigt die Vorschau genau
 * dieses Tages — was geplant ist, wer mit dabei ist, die Rüstliste, die
 * Termine — mit „Bearbeiten“ (dasselbe Seitenfenster wie in der Woche) und
 * „Zur Woche“. Bis Runde 4 war jeder Tag ein farbiges Feld, und ein Klick
 * sprang nur in die Woche: was geplant war, sah man erst dort.
 *
 * Gerechnet wird mit denselben Zellen wie in der Woche (`brett`), geladen
 * mit denselben Abfragen über den Monat. Am Handy steht statt des Rasters
 * ein Kalender.
 */
/**
 * RUNDE 4, DIE SCHNITTSTELLE DES MONATS (Auftrag 5): was die Seite der
 * Monatsansicht zusätzlich gibt. Die Seite (`WochenplanView`) hält die
 * Seitenfenster; der Monat ruft sie nur auf, damit „Bearbeiten“ aus der
 * Vorschau und der Klick in der Woche dasselbe Fenster öffnen.
 */
export interface MonatsSchnittstelle {
  /** Sicht „Personen“ oder „Baustellen“ (Umschalter ab Tablet). */
  sicht?: 'personen' | 'baustellen';
  /** Die Termine des Monats, schon geladen. */
  termine?: Termin[];
  /** Betriebsurlaub je Tag (Bezeichnung). */
  zuAm?: Map<string, string>;
  /** „Bearbeiten“ bzw. „Einsatz planen“: das Seitenfenster „Einsatz planen“ der Woche. */
  onEinsatz?: (start: FensterStart) => void;
  /** Ein Termin: „Termin ändern“ (ohne Recht schreibgeschützt) im Seitenfenster. */
  onTermin?: (t: Termin) => void;
  /** „Zur Woche“: Woche dieses Tages, Tageskopf markiert (`?woche=JJJJ-Www&tag=JJJJ-MM-TT`). */
  onZurWoche?: (tag: string) => void;
}

/** Wo die Vorschau steht: Ziel, Zeile (für die Markierung) und Klickstelle. */
interface VorschauStand {
  ziel: VorschauZiel;
  /** `p:uid`, `b:nummer` oder `k` (Kopf eines Tages); am Handy `kal`. */
  zeile: string;
  anker: HTMLElement | null;
  klickX: number | null;
}

/*
  DIE KLASSEN DES RASTERS JE MONATSLÄNGE ausgeschrieben, nicht zusammengesetzt:
  Tailwind behält in `@layer components` nur Klassen, die es im Quelltext
  wörtlich findet — `mo-zeile-${n}` fände es nicht, und das Raster fiele aus.
*/
const ZEILE: Record<number, string> = { 28: 'mo-zeile-28', 29: 'mo-zeile-29', 30: 'mo-zeile-30', 31: 'mo-zeile-31' };
const KOPFZEILE: Record<number, string> = { 28: 'mo-kopfzeile-28', 29: 'mo-kopfzeile-29', 30: 'mo-kopfzeile-30', 31: 'mo-kopfzeile-31' };

/** Ein Tag weiter oder zurück, lokal gerechnet (nicht über UTC, siehe `wochenplan.ts`). */
function tagPlus(iso: string, n: number): string {
  const d = new Date(`${iso}T00:00:00`);
  d.setDate(d.getDate() + n);
  return lokalesDatum(d);
}

/** Handy (unter 760 px)? Ohne `matchMedia` (Komponententests) gilt der Schreibtisch. */
function useHandy(): boolean {
  const frage = () => typeof window !== 'undefined' && typeof window.matchMedia === 'function' && !window.matchMedia(AB_TABLET).matches;
  const [handy, setHandy] = useState(frage);
  useEffect(() => {
    if (typeof window.matchMedia !== 'function') return;
    const m = window.matchMedia(AB_TABLET);
    const neu = () => setHandy(!m.matches);
    neu();
    m.addEventListener?.('change', neu);
    return () => m.removeEventListener?.('change', neu);
  }, []);
  return handy;
}

/** Ein nachgeladener Tag ausserhalb des Monats (← → über die Monatsgrenze). */
type Nachgeladen = TagesDaten | 'fehler';



export default function MonatsAnsicht({
  tage,
  heute,
  gruppen,
  zu,
  onGruppe,
  brett,
  zuFuer,
  einsaetze,
  projects,
  urlaube,
  staff,
  onTag,
  sicht = 'personen',
  termine: termineProp,
  zuAm,
  onEinsatz,
  onTermin,
  onZurWoche,
  quelle = DB_QUELLE,
}: MonatsSchnittstelle & {
  tage: string[];
  heute: string;
  gruppen: Gruppe[];
  zu: Set<string>;
  onGruppe: (name: string) => void;
  brett: Brett;
  zuFuer: (uid: string, tag: string) => boolean;
  einsaetze: WithId<Assignment>[];
  projects: Project[];
  urlaube: Abwesenheit[];
  staff: AppUser[];
  /**
   * Früher: ein Tag sprang in die Woche. Ersetzt durch `onZurWoche`; bleibt
   * als Rückfall, bis die Seite die neue Schnittstelle übergibt.
   */
  onTag?: (tag: string) => void;
  /** Woher die Vorschau nachlädt — die Musterseite gibt ihre Beispieldaten. */
  quelle?: MonatsQuelle;
}) {
  const { user, company } = useAuth();
  // Nach der Kennung, nicht nach dem Objekt: ein neu gebautes Benutzerobjekt soll nicht nachladen.
  const betrieb = user?.companyId ?? null;
  const materialAn = useModul('material');
  const handy = useHandy();
  const termine = useMemo(() => termineProp ?? [], [termineProp]);
  const zurWoche = onZurWoche ?? onTag;
  const [vorschau, setVorschau] = useState<VorschauStand | null>(null);
  /** Zählt jedes Öffnen: eine neu geöffnete Vorschau setzt den Fokus wieder auf ×. */
  const [oeffnungen, setOeffnungen] = useState(0);
  const [kalPerson, setKalPerson] = useState('');
  const [baustellenGezeigt, setBaustellenGezeigt] = useState(SEITE);
  const [abwesendGezeigt, setAbwesendGezeigt] = useState(SEITE);
  const mitKoepfen = gruppen.length > 1;
  const erster = tage[0];
  const letzter = tage[tage.length - 1];
  const n = tage.length;

  /* ── Die Breite eines Tages, gemessen (für die Beschriftung ab 46 px) ── */
  const kopfRef = useRef<HTMLButtonElement | null>(null);
  const [tagBreite, setTagBreite] = useState(0);
  useLayoutEffect(() => {
    const el = kopfRef.current;
    if (!el) return;
    const messen = () => setTagBreite(el.getBoundingClientRect().width);
    messen();
    if (typeof ResizeObserver === 'undefined') return;
    const beobachter = new ResizeObserver(messen);
    beobachter.observe(el);
    return () => beobachter.disconnect();
  }, [n, sicht]);

  /* ── Namen ── */
  const namen = useMemo(() => new Map(staff.map((u) => [u.uid, u.name])), [staff]);
  const nameVon = useCallback(
    (a: Pick<Assignment, 'userId' | 'userName'>) => namen.get(a.userId) ?? (a.userName?.trim() || 'Unbekannt'),
    [namen],
  );
  const kundeVon = useCallback(
    (nummer: string) => projects.find((p) => p.projectNumber === nummer)?.customerName ?? nummer,
    [projects],
  );

  /* ── Kopf: Termine je Tag, Lieferung ohne Annahme ── */
  const kopfInfo = useMemo(() => {
    const m = new Map<string, { termine: number; achtung: boolean }>();
    for (const t of termine) {
      const e = m.get(t.datum) ?? { termine: 0, achtung: false };
      e.termine += 1;
      if (lieferungOhneAnnahme(t, einsaetze)) e.achtung = true;
      m.set(t.datum, e);
    }
    return m;
  }, [termine, einsaetze]);

  /* ── Balken je Person ── */
  const personenBalken = useMemo(() => {
    const m = new Map<string, { balken: Balken[]; bahnen: number }>();
    for (const g of gruppen) {
      for (const u of g.leute) {
        const proTag = brett.get(u.uid);
        m.set(u.uid, balkenBilden(n, (i) => personTag(proTag?.get(tage[i]), zuFuer(u.uid, tage[i]))));
      }
    }
    return m;
  }, [gruppen, brett, tage, n, zuFuer]);

  /* ── Die Baustellen des Monats (Sicht „Baustellen“, am Handy als Liste) ── */
  const baustellen = useMemo(() => baustellenDesMonats(einsaetze, kundeVon), [einsaetze, kundeVon]);
  const baustellenBalken = useMemo(() => {
    const m = new Map<string, { balken: Balken[]; bahnen: number }>();
    for (const b of baustellen) {
      m.set(b.nummer, balkenBilden(n, (i) => baustelleTag(b.tage.get(tage[i]), urlaube, tage[i], nameVon)));
    }
    return m;
  }, [baustellen, tage, n, urlaube, nameVon]);

  /** Wer diesen Monat fehlt — nur, wer eingeplant werden kann; der Grund, soweit sichtbar. */
  const abwesend = useMemo(
    () =>
      urlaube
        .filter((v) => namen.has(v.userId))
        .map((v) => ({
          ...v,
          name: namen.get(v.userId) as string,
          text: [v.grund ?? 'abwesend', v.zeiten].filter(Boolean).join(' '),
        }))
        .sort((a, b) => a.von.localeCompare(b.von) || a.name.localeCompare(b.name, 'de')),
    [urlaube, namen],
  );

  const spanne = (von: string, bis: string) => {
    const v = von < erster ? erster : von;
    const b = bis > letzter ? letzter : bis;
    return v === b ? tagKurz(v).datum : `${tagKurz(v).datum} – ${tagKurz(b).datum}`;
  };

  /* ══ DIE VORSCHAU ══════════════════════════════════════════════════════ */

  /** Das markierte Element (Balken, Tag oder Kalendertag) — dorthin geht der Fokus zurück. */
  const gewaehltEl = useRef<HTMLElement | null>(null);
  const gewaehltRef = useCallback((el: HTMLElement | null) => {
    if (el) gewaehltEl.current = el;
  }, []);

  const oeffnen = useCallback((stand: VorschauStand) => {
    gewaehltEl.current = stand.anker;
    setVorschau(stand);
    setOeffnungen((x) => x + 1);
  }, []);

  const schliessen = useCallback((zurueck: boolean) => {
    const ziel = gewaehltEl.current;
    setVorschau(null);
    if (zurueck && ziel?.isConnected) ziel.focus({ preventScroll: true });
  }, []);

  const blaettern = useCallback((schritt: -1 | 1) => {
    setVorschau((v) => {
      if (!v) return v;
      // Ein anderer Tag: der angeklickte Einsatz gilt nicht mehr als „zuerst“.
      const ziel = { ...v.ziel, tag: tagPlus(v.ziel.tag, schritt) } as VorschauZiel;
      if (ziel.art === 'person') delete ziel.nummer;
      return { ...v, ziel };
    });
  }, []);

  // Ein anderer Monat oder eine andere Sicht: die Vorschau gehörte zum alten Bild.
  useEffect(() => {
    setVorschau(null);
  }, [erster, sicht]);

  const tag = vorschau?.ziel.tag ?? null;
  const imMonat = !!tag && tag >= erster && tag <= letzter;

  /*
    ← → ÜBER DIE MONATSGRENZE (Abnahme 5.5): Tage ausserhalb des Monats hat
    die Seite nicht geladen. Die Vorschau holt sie mit den BESTEHENDEN
    Abfragen (Einsätze des Tages, Abwesenheiten, Termine, Betriebsurlaub) —
    einmal je Tag, solange sie offen ist. Das Raster bleibt stehen.
  */
  const [nachgeladen, setNachgeladen] = useState<Map<string, Nachgeladen>>(new Map());
  useEffect(() => {
    if (!vorschau) setNachgeladen(new Map());
  }, [vorschau]);
  useEffect(() => {
    if (!tag || imMonat || !betrieb || nachgeladen.has(tag)) return;
    let weg = false;
    // Über `Promise.resolve()`: auch ein Fehler beim Aufruf selbst landet im `catch`.
    Promise.resolve()
      .then(() => quelle.tag(betrieb, tag))
      .then((daten) => {
        if (weg) return;
        setNachgeladen((m) => new Map(m).set(tag, daten));
      })
      .catch(() => {
        if (!weg) setNachgeladen((m) => new Map(m).set(tag, 'fehler'));
      });
    return () => {
      weg = true;
    };
  }, [tag, imMonat, betrieb, nachgeladen, quelle]);

  const tagesDaten = useMemo((): Nachgeladen | null => {
    if (!tag) return null;
    if (!imMonat) return nachgeladen.get(tag) ?? null;
    return { einsaetze, urlaube, termine, zu: zuAm?.get(tag) ?? null, zuFuer: (uid) => zuFuer(uid, tag) };
  }, [tag, imMonat, nachgeladen, einsaetze, urlaube, termine, zuAm, zuFuer]);

  /*
    DIE ADRESSE steht an der Baustelle. Die Seite lädt die laufenden; eine
    pausierte oder abgeschlossene Baustelle eines Einsatzes holt die
    Vorschau beim Öffnen über die bestehende Abfrage nach Nummern.
  */
  const [nachProjekte, setNachProjekte] = useState<Map<string, ProjektKurz | null>>(new Map());
  const projektVon = useCallback(
    (nummer: string): ProjektKurz | null | undefined =>
      projects.find((p) => p.projectNumber === nummer) ?? nachProjekte.get(nummer),
    [projects, nachProjekte],
  );
  const fehlendeProjekte = useMemo(() => {
    if (!tag || !tagesDaten || tagesDaten === 'fehler') return [];
    const nummern = new Set(tagesDaten.einsaetze.filter((a) => a.date === tag).map((a) => a.projectNumber));
    return [...nummern].filter((nr) => projektVon(nr) === undefined).sort();
  }, [tag, tagesDaten, projektVon]);
  const fehlendeSchluessel = fehlendeProjekte.join('|');
  useEffect(() => {
    if (!betrieb || !fehlendeSchluessel) return;
    const nummern = fehlendeSchluessel.split('|');
    let weg = false;
    Promise.resolve()
      .then(() => quelle.projekte(betrieb, nummern))
      .then((liste) => {
        if (weg) return;
        setNachProjekte((alt) => {
          const neu = new Map(alt);
          // Was nicht kam, gibt es nicht (mehr) — dann „–“ statt ewig „…“.
          for (const nr of nummern) neu.set(nr, liste.find((p) => p.projectNumber === nr) ?? null);
          return neu;
        });
      })
      .catch(() => {
        if (!weg) setNachProjekte((alt) => new Map([...alt, ...nummern.map((nr) => [nr, null] as const)]));
      });
    return () => {
      weg = true;
    };
  }, [betrieb, fehlendeSchluessel, quelle]);

  /*
    DIE RÜSTLISTE beim Öffnen über die bestehenden Abfragen: die Listen des
    Tages (`listEinsatzMaterialForDate`) und das Freie im Lager
    (`lager_frei`, wie das Formular) — nur mit dem Modul „Material“, wie im
    Seitenfenster. Bis dahin „…“.
  */
  const [ruest, setRuest] = useState<{ tag: string; listen: Map<string, RuestPosition[]> | 'fehler' } | null>(null);
  const [lager, setLager] = useState<Map<string, { frei: number }> | null | undefined>(undefined);
  const offen = !!vorschau;
  useEffect(() => {
    if (!offen) {
      setRuest(null);
      setLager(undefined);
    }
  }, [offen]);
  useEffect(() => {
    if (!offen || !materialAn || lager !== undefined) return;
    let weg = false;
    Promise.resolve()
      .then(() => quelle.lager())
      .then((k) => {
        if (!weg) setLager(k);
      })
      .catch(() => {
        if (!weg) setLager(null);
      });
    return () => {
      weg = true;
    };
  }, [offen, materialAn, lager, quelle]);
  useEffect(() => {
    if (!tag || !materialAn || !betrieb) return;
    let weg = false;
    Promise.resolve()
      .then(() => quelle.ruestlisten(betrieb, tag))
      .then((listen) => {
        if (weg) return;
        const m = new Map<string, RuestPosition[]>();
        for (const l of listen) if (l.date === tag) m.set(l.projectNumber, l.positionen ?? []);
        setRuest({ tag, listen: m });
      })
      .catch(() => {
        if (!weg) setRuest({ tag, listen: 'fehler' });
      });
    return () => {
      weg = true;
    };
  }, [tag, materialAn, betrieb, quelle]);
  const ruestText = useMemo(() => {
    if (!materialAn || !tag) return undefined;
    return (nummer: string) => {
      if (!ruest || ruest.tag !== tag || lager === undefined) return '…';
      if (ruest.listen === 'fehler') return 'konnte nicht geladen werden';
      return ruestZeile(ruest.listen.get(nummer), lager, tag, todayStr());
    };
  }, [materialAn, tag, ruest, lager]);

  const inhalt = useMemo(() => {
    if (!vorschau || !tagesDaten) return null;
    if (tagesDaten === 'fehler') {
      return {
        ...vorschauInhalt(vorschau.ziel, { einsaetze: [], urlaube: [], termine: [], zu: null, zuFuer: () => false }, projektVon, nameVon, bezugText, staff),
        frei: 'Dieser Tag konnte nicht geladen werden.',
      };
    }
    return vorschauInhalt(vorschau.ziel, tagesDaten, projektVon, nameVon, bezugText, staff);
  }, [vorschau, tagesDaten, projektVon, nameVon, staff]);

  const darfTermine = !!user && darfTermineSchreiben(user.role);
  const baustelleSichtbar = !!user && canAccess(user.role, '/admin-projects', company?.modules);

  /* ── Auslöser ── */
  const tagIndex = tag ? tage.indexOf(tag) : -1;
  /** Welcher Hintergrund-Tag einer Zeile per Tab erreichbar ist: heute, sonst der erste. */
  const tabTag = Math.max(0, tage.indexOf(heute));

  function balkenKlick(e: MouseEvent<HTMLButtonElement>, zeile: string, b: Balken, ziel: (tag: string) => VorschauZiel) {
    e.stopPropagation();
    const r = e.currentTarget.getBoundingClientRect();
    // `detail` 0: mit der Tastatur ausgelöst — dann der erste Tag des Balkens.
    const maus = e.detail > 0 ? { x: e.clientX, links: r.left, breite: r.width } : null;
    const i = tagImBalken(b, maus);
    oeffnen({ ziel: ziel(tage[i]), zeile, anker: e.currentTarget, klickX: maus ? e.clientX : null });
  }

  /** Steht die Vorschau auf diesem Balken? Dann ist er markiert. */
  function balkenGewaehlt(zeile: string, b: Balken, alle: Balken[]): boolean {
    if (!vorschau || vorschau.zeile !== zeile || tagIndex < 0 || b.start > tagIndex || b.ende < tagIndex) return false;
    const z = vorschau.ziel;
    const nummer = z.art === 'person' ? z.nummer : undefined;
    const amTag = alle.filter((x) => x.start <= tagIndex && x.ende >= tagIndex);
    const bevorzugt = (nummer && amTag.find((x) => x.nummer === nummer)) || amTag[0];
    return bevorzugt === b;
  }

  /*
    EINE ZEILE als Zeichenfunktion, nicht als Komponente: als Komponente
    innerhalb dieser Funktion bekäme sie bei jedem Zeichnen eine neue
    Kennung, React baute alle Zeilen neu auf, und der Fokus ginge verloren.
  */
  function zeile({
    schluessel,
    name,
    kurz,
    titel,
    info,
    stand,
    ziel,
  }: {
    schluessel: string;
    name: string;
    kurz: string;
    titel: string;
    /** Zweite Zeile der Namensspalte — in der Sicht „Baustellen“ Nummer · Ort, wie in der Woche. */
    info?: string;
    stand: { balken: Balken[]; bahnen: number };
    ziel: (tag: string, nummer?: string) => VorschauZiel;
  }) {
    const { balken, bahnen } = stand;
    const spalte = { gridRow: `1 / span ${bahnen}` };
    const markiertImBalken = vorschau?.zeile === schluessel && balken.some((b) => balkenGewaehlt(schluessel, b, balken));
    return (
      <div key={schluessel} className={ZEILE[n] ?? 'mo-zeile-31'} role="group" aria-label={name}>
        <div className="mo-name" style={{ ...spalte, gridColumn: '1' }} title={titel}>
          <span className="mo-name-lang">{name}</span>
          <span className="mo-name-kurz" aria-hidden="true">
            {kurz}
          </span>
          {info && <span className="mo-name-info">{info}</span>}
        </div>
        {tage.map((t, i) => {
          const d = new Date(`${t}T00:00:00`);
          const feiertag = getAustrianHolidayName(d);
          const ruhe = !!feiertag || isWeekend(d);
          const gewaehlt = vorschau?.zeile === schluessel && tagIndex === i && !markiertImBalken;
          const klasse = gewaehlt ? 'mo-hg-gewaehlt' : t === heute ? 'mo-hg-heute' : ruhe ? 'mo-hg-we' : 'mo-hg';
          const amTag = balken.filter((b) => b.start <= i && b.ende >= i);
          const zustand =
            amTag.length > 0
              ? amTag.map((b) => `${b.art === 'plan' ? 'eingeplant' : b.art === 'konflikt' ? 'eingeteilt, aber abwesend' : 'abwesend'}: ${b.lang}`).join('; ')
              : (feiertag ?? (ruhe ? 'Wochenende' : 'frei'));
          return (
            <button
              key={t}
              ref={gewaehlt ? gewaehltRef : undefined}
              type="button"
              className={klasse}
              style={{ ...spalte, gridColumn: String(i + 2) }}
              tabIndex={i === tabTag ? 0 : -1}
              data-vorschau-ausloeser=""
              aria-label={`${name}, ${tagKurz(t).wochentag} ${tagKurz(t).datum}: ${zustand} – Vorschau`}
              onClick={(e) => {
                e.stopPropagation();
                oeffnen({ ziel: ziel(t), zeile: schluessel, anker: e.currentTarget, klickX: e.detail > 0 ? e.clientX : null });
              }}
            />
          );
        })}
        {balken.map((b) => {
          const gewaehlt = balkenGewaehlt(schluessel, b, balken);
          const klasse =
            b.art === 'konflikt'
              ? gewaehlt ? 'mo-balken-konflikt-gewaehlt' : 'mo-balken-konflikt'
              : b.art === 'weg'
                ? gewaehlt ? 'mo-balken-weg-gewaehlt' : 'mo-balken-weg'
                : gewaehlt ? 'mo-balken-gewaehlt' : 'mo-balken';
          const span = b.ende - b.start + 1;
          const von = tagKurz(tage[b.start]);
          const bis = tagKurz(tage[b.ende]);
          const wann = span > 1 ? `${von.wochentag} ${von.datum} – ${bis.wochentag} ${bis.datum}` : `${von.wochentag} ${von.datum}`;
          const zustand = b.art === 'plan' ? 'eingeplant' : b.art === 'konflikt' ? 'eingeteilt, aber abwesend' : 'abwesend';
          return (
            <button
              key={`${b.schluessel}-${b.start}`}
              ref={gewaehlt ? gewaehltRef : undefined}
              type="button"
              className={klasse}
              style={{ gridColumn: `${b.start + 2} / span ${span}`, gridRow: String(b.bahn + 1) }}
              title={`${b.lang} · ${wann}`}
              data-vorschau-ausloeser=""
              aria-label={`${name}, ${wann}: ${zustand}, ${b.lang} – Vorschau`}
              onClick={(e) => balkenKlick(e, schluessel, b, (t) => ziel(t, b.nummer))}
            >
              {beschriftet(span, tagBreite) ? b.text : null}
            </button>
          );
        })}
      </div>
    );
  }

  const kopfGewaehlt = (i: number) => vorschau?.zeile === 'k' && tagIndex === i;

  const raster = (
    <div role="region" aria-label={sicht === 'baustellen' ? 'Monatsplan nach Baustellen' : 'Monatsplan nach Personen'}>
      <div className={KOPFZEILE[n] ?? 'mo-kopfzeile-31'}>
        <div className="mo-ecke">
          {sicht === 'baustellen' ? 'Baustelle' : 'Mitarbeiter'}
        </div>
        {tage.map((t, i) => {
          const d = new Date(`${t}T00:00:00`);
          const feiertag = getAustrianHolidayName(d);
          const ruhe = !!feiertag || isWeekend(d);
          const info = kopfInfo.get(t);
          const { wochentag, datum } = tagKurz(t);
          const wt = wochentag.replace('.', '');
          const klasse = kopfGewaehlt(i) ? 'mo-kopf-gewaehlt' : t === heute ? 'mo-kopf-heute' : ruhe ? 'mo-kopf-we' : 'mo-kopf';
          const vorlesen = [
            `${wochentag} ${datum}`,
            feiertag,
            t === heute ? 'heute' : null,
            info ? (info.termine === 1 ? '1 Termin' : `${info.termine} Termine`) : null,
            info?.achtung ? 'Lieferung ohne Annahme' : null,
          ].filter(Boolean);
          return (
            <button
              key={t}
              ref={(el) => {
                if (i === 0) kopfRef.current = el;
                if (kopfGewaehlt(i)) gewaehltRef(el);
              }}
              type="button"
              className={klasse}
              title={vorlesen.join(' · ')}
              data-vorschau-ausloeser=""
              aria-label={`${vorlesen.join(', ')} – alle Einsätze des Tages`}
              onClick={(e) => {
                e.stopPropagation();
                oeffnen({ ziel: { art: 'tag', tag: t }, zeile: 'k', anker: e.currentTarget, klickX: null });
              }}
            >
              <span className="mo-wt" aria-hidden="true">
                {wt.slice(0, 2)}
              </span>
              <span className="mo-wt-kurz" aria-hidden="true">
                {wt.slice(0, 1)}
              </span>
              <span className="mo-nr" aria-hidden="true">
                {d.getDate()}
              </span>
              <span className={info?.achtung ? 'mo-punkt-achtung' : info ? 'mo-punkt' : 'mo-punkt-ohne'} aria-hidden="true" />
            </button>
          );
        })}
      </div>

      {sicht === 'baustellen' ? (
        baustellen.length === 0 ? (
          <EmptyState>In diesem Monat ist keine Baustelle eingeplant.</EmptyState>
        ) : (
          baustellen.map((b) =>
            zeile({
              schluessel: `b:${b.nummer}`,
              name: b.name,
              kurz: kurzname(b.name),
              titel: `${b.name} (${b.nummer})`,
              // Zwei Baustellen desselben Kunden standen sonst gleich da (Testbericht Runde 5, G3).
              info: [b.nummer, ortAus(projects.find((p) => p.projectNumber === b.nummer)?.address)].filter(Boolean).join(' · '),
              stand: baustellenBalken.get(b.nummer) ?? { balken: [], bahnen: 1 },
              ziel: (t) => ({ art: 'baustelle', nummer: b.nummer, name: b.name, tag: t }),
            }),
          )
        )
      ) : (
        gruppen.map((g) => {
          const offenG = !zu.has(g.name);
          return (
            <Fragment key={g.name}>
              {mitKoepfen && (
                <button type="button" className="mo-gruppe" aria-expanded={offenG} onClick={() => onGruppe(g.name)}>
                  <span aria-hidden="true">{offenG ? '▾' : '▸'}</span>
                  {g.name} · {g.leute.length}
                </button>
              )}
              {(offenG || !mitKoepfen) &&
                g.leute.map((u) =>
                  zeile({
                    schluessel: `p:${u.uid}`,
                    name: u.name,
                    kurz: kurzPerson(u.name),
                    titel: u.name,
                    stand: personenBalken.get(u.uid) ?? { balken: [], bahnen: 1 },
                    ziel: (t, nummer) => ({ art: 'person', uid: u.uid, name: u.name, tag: t, nummer }),
                  }),
                )}
            </Fragment>
          );
        })
      )}

      <p className="mo-legende">
        {sicht === 'baustellen' ? (
          <>
            <span className="mo-legende-plan">eingeplant</span>
            <span className="mo-legende-konflikt">jemand Eingeteiltes fehlt</span>
          </>
        ) : (
          <>
            <span className="mo-legende-plan">eingeplant</span>
            <span className="mo-legende-konflikt">eingeteilt, aber abwesend</span>
            <span className="mo-legende-weg">abwesend</span>
          </>
        )}
        <span className="mo-legende-ruhe">Wochenende, Feiertag</span>
        <span className="mo-legende-satz">Punkt im Kopf: Termine an diesem Tag · Tag antippen zeigt die Vorschau</span>
      </p>
    </div>
  );

  return (
    <div className="space-y-4">
      {/* Das Raster ab Tablet; am Handy der Kalender (beide blendet CSS aus). */}
      <div className="mo-raster">
        <Card buendig>{raster}</Card>
      </div>

      <div className="kal">
        <Card buendig>
          <div className="px-4 pb-4 pt-4">
            <MonatsKalender
              tage={tage}
              heute={heute}
              staff={staff}
              brett={brett}
              zuFuer={zuFuer}
              einsaetze={einsaetze}
              termine={termine}
              person={kalPerson}
              onPerson={(uid) => {
                setKalPerson(uid);
                setVorschau(null);
              }}
              gewaehlt={vorschau?.zeile === 'kal' ? tag : null}
              gewaehltRef={gewaehltRef}
              onTag={(t, el) => {
                const p = staff.find((u) => u.uid === kalPerson);
                oeffnen({
                  ziel: p ? { art: 'person', uid: p.uid, name: p.name, tag: t } : { art: 'tag', tag: t },
                  zeile: 'kal',
                  anker: el,
                  klickX: null,
                });
              }}
            />
          </div>
        </Card>

        {/*
          AM HANDY BLEIBEN DIE BEIDEN LISTEN. „Baustellen diesen Monat“ ersetzt
          ab dem Tablet die Sicht „Baustellen“; das Handy hat diese Sicht nicht
          (der Umschalter steht erst ab Tablet) — ohne die Liste fehlte dort
          der Überblick, welche Baustelle von wann bis wann läuft.
        */}
        <div className="mt-4 space-y-4">
          <Card title="Baustellen diesen Monat" buendig>
            {baustellen.length === 0 ? (
              <EmptyState>In diesem Monat ist keine Baustelle eingeplant.</EmptyState>
            ) : (
              <>
                <List>
                  {baustellen.slice(0, baustellenGezeigt).map((b) => (
                    <ListRow
                      key={b.nummer}
                      title={b.name}
                      subtitle={`${b.nummer} · ${spanne(b.von, b.bis)} · ${b.tage.size} ${b.tage.size === 1 ? 'Einsatztag' : 'Einsatztage'}`}
                      onOeffnen={() =>
                        oeffnen({ ziel: { art: 'baustelle', nummer: b.nummer, name: b.name, tag: b.von }, zeile: `b:${b.nummer}`, anker: null, klickX: null })
                      }
                      pfeil
                    />
                  ))}
                </List>
                <MehrAnzeigen anzahl={Math.max(0, baustellen.length - baustellenGezeigt)} onClick={() => setBaustellenGezeigt((x) => x + SEITE)} />
              </>
            )}
          </Card>

          <Card title="Diesen Monat abwesend" buendig>
            {abwesend.length === 0 ? (
              <EmptyState>Diesen Monat ist niemand abwesend.</EmptyState>
            ) : (
              <>
                <List>
                  {abwesend.slice(0, abwesendGezeigt).map((v, i) => (
                    <ListRow key={`${v.userId}-${v.von}-${i}`} title={v.name} subtitle={`${spanne(v.von, v.bis)} · ${v.text}`} />
                  ))}
                </List>
                <MehrAnzeigen anzahl={Math.max(0, abwesend.length - abwesendGezeigt)} onClick={() => setAbwesendGezeigt((x) => x + SEITE)} />
              </>
            )}
          </Card>
        </div>
      </div>

      {vorschau &&
        createPortal(
          <MonatsVorschau
            key={oeffnungen}
            ziel={vorschau.ziel}
            inhalt={inhalt}
            ruest={ruestText}
            imMonat={imMonat}
            handy={handy}
            anker={vorschau.anker}
            klickX={vorschau.klickX}
            darfTermine={darfTermine}
            baustelleSichtbar={baustelleSichtbar}
            onSchliessen={schliessen}
            onBlaettern={blaettern}
            onEinsatz={onEinsatz}
            onTermin={onTermin}
            onZurWoche={zurWoche}
          />,
          document.body,
        )}
    </div>
  );
}
