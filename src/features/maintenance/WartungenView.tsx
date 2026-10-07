import { useEffect, useMemo, useState, type FormEvent, type ReactNode } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import Adressfilter from '@/components/Adressfilter';
import { useAuth } from '@/app/AuthContext';
import {
  listWartungen,
  searchWartungen,
  createWartung,
  updateWartung,
  deleteWartung,
  wartungErledigt,
  type NewWartung,
} from '@/lib/db/wartungen';
import { wartungEingeplant } from '@/lib/db/wartungen';
import { listCustomers } from '@/lib/db/customers';
import { listRecentProjects, createProject, reserveProjectNumber } from '@/lib/db/projects';
import { belegNummer, hoechsteLfdImJahr, praefixeVon } from '@/lib/praefixe';
import { isGF } from '@/lib/permissions';
import { todayStr } from '@/lib/time';
import type { Customer, Wartung } from '@/types';
import type { WithId } from '@/lib/db/core';
import {
  beurteile,
  nachFaelligkeit,
  naechsterTermin,
  INTERVALLE,
  VORLAUF_TAGE,
  type Dringlichkeit,
} from './wartungsplan';
import {
  nummerFrei,
  baustelleAusWartung,
} from './wartungBaustelle';
import Card from '@/components/Card';
import KundenGrenze from '@/components/AuswahlGrenze';
import Button from '@/components/Button';
import { Zustand, type Stand } from '@/components/Badge';
import PageHeader from '@/components/PageHeader';
import Abschnitt from '@/components/Abschnitt';
import BottomSheet from '@/components/BottomSheet';
import InfoHint from '@/components/InfoHint';
import { LotVerlauf, MehrAnzeigen, Segmente, WeitereAngaben, type LotPunkt } from '@/components/LotBausteine';
import Nachladen from '@/components/Nachladen';
import ConfirmDialog from '@/components/ConfirmDialog';
import {
  InputField,
  SelectField,
  CheckboxField,
  FormGrid,
  Pflichthinweis,
} from '@/components/Field';
import { List, ListRow } from '@/components/ListRow';
import { useToast } from '@/components/Toast';
import { ErrorState, EmptyState, SkeletonList } from '@/components/States';
import { datumAT } from '@/lib/datum';
import { ZahlWertFeld } from '@/components/ZahlFeld';
import { euro } from '@/lib/betrag';

const fmtDatum = (iso?: string) =>
  datumAT(iso) || '—';

/*
  DIE LISTE IST DER AUFRUF, NICHT DIE ZEILE. „Überfällig" sagt, WO eine
  Wartung steht; dass sie zu tun ist, sagt die Ansicht, in der sie steht.
  Stünde beides als gefüllte Pille da, riefe die Liste zweimal dasselbe.
*/
const STAND: Record<Dringlichkeit, Stand> = {
  'überfällig': 'schlecht',
  'fällig': 'achtung',
  'später': 'laeuft',
  ruht: 'ruht',
  unklar: 'ruht',
};

/** Hersteller, Typ, Seriennummer und Baujahr in einer Zeile — was davon da ist. */
function anlagendaten(w: Pick<Wartung, 'hersteller' | 'typ' | 'seriennummer' | 'baujahr'>): string {
  return [
    [w.hersteller, w.typ].filter(Boolean).join(' '),
    w.seriennummer ? `SN ${w.seriennummer}` : '',
    w.baujahr ? `Bj. ${w.baujahr}` : '',
  ].filter(Boolean).join(', ');
}

const LEER = (): NewWartung => ({
  customerId: '',
  customerName: '',
  anlage: '',
  address: '',
  intervallMonate: 12,
  zuletztAm: '',
  faelligAm: '',
  aktiv: true,
  hinweis: '',
  hersteller: '',
  typ: '',
  seriennummer: '',
  baujahr: null,
  preis: null,
});

/**
 * DER NÄCHSTE TERMIN FOLGT AUS „ZULETZT GEWARTET“ PLUS INTERVALL
 * (Testbericht 30.09.2026, M39) — sobald sich eines von beiden ändert, nicht
 * erst beim Verlassen des Feldes. Das Feld bleibt änderbar (ein vereinbarter
 * Ausweichtag); die Datenbank rechnet dasselbe (`app.wartung_termin`).
 */
function mitTermin<T extends { zuletztAm?: string; intervallMonate: number; faelligAm: string }>(f: T): T {
  if (!f.zuletztAm) return f;
  try {
    return { ...f, faelligAm: naechsterTermin(f.zuletztAm, f.intervallMonate) };
  } catch {
    // Ein unfertiges Datum beim Tippen: dann bleibt der Termin, wie er ist.
    return f;
  }
}

/** Was gerade erledigt eingetragen wird. */
interface Erledigung {
  wartung: WithId<Wartung>;
  datum: string;
  intervall: number;
  baustelle: string;
}

/** Die Baustelle, die gerade aus einer Wartung entstehen soll. */
interface Einplanung {
  wartung: WithId<Wartung>;
  nummer: string;
  /** Der Vorschlag, wie er ins Feld kam — bleibt er stehen, vergibt der Zähler. */
  vorschlag: string;
}

/**
 * Wiederkehrende Wartungen.
 *
 * DER GANZE ABLAUF, nicht die Liste allein: erfassen, sehen was fällig wird,
 * erledigt eintragen — und mit dem Eintragen rückt der nächste Termin nach.
 * Ohne den letzten Schritt wäre das hier nach einem Jahr eine Sammlung roter
 * Zeilen, die niemand mehr ansieht, und die Vereinbarung wäre dieselbe
 * Karteileiche wie vorher im Kalender.
 *
 * Zwei Abschnitte, und die Reihenfolge ist die Aussage: oben steht, was zu
 * tun ist, darunter der Bestand. Wer die Seite öffnet, will nicht
 * dreihundert Vereinbarungen sehen, sondern die vier, die anstehen.
 */
/**
 * Wie viele Wartungsvereinbarungen auf einmal geholt werden.
 *
 * Zweihundert reichen für einen Betrieb mit ein paar Jahren Bestand; wer mehr
 * führt, lädt nach. Die Zahl ist bewusst kleiner als der Bestand sein kann —
 * die Antwort auf „was steht an" steht ohnehin oben und rechnet über das
 * Geladene hinaus nicht anders.
 */
const WARTUNGEN_JE_SEITE = 200;

/*
  DER ARBEITSSTAND IST DER STANDARD (Linie „Lot“, Regel 4): „Steht an“ —
  überfällig, fällig, ohne Termin. Der ganze Bestand steht unter „Alle“, die
  Wahl in der Adresse. Vorher standen beide als Karten untereinander, und
  jede fällige Wartung zweimal auf der Seite.
*/
type Ansicht = 'anstehend' | 'alle';
const ANSICHTEN: readonly { wert: Ansicht; text: string }[] = [
  { wert: 'anstehend', text: 'Steht an' },
  { wert: 'alle', text: 'Alle' },
];

/** Höchstens so viele Zeilen je Gruppe, dann „und N weitere“ (Linie „Lot“, Regel 4). */
const GRUPPE_HOECHSTENS = 20;

/** Eine Gruppe der Liste: Abschnittszeile mit Anzahl, höchstens 20 Zeilen, dann „und N weitere“. */
function Gruppe<T>({ titel, zeilen, zeile }: { titel: string; zeilen: T[]; zeile: (t: T) => ReactNode }) {
  const [alle, setAlle] = useState(false);
  const gezeigt = alle ? zeilen : zeilen.slice(0, GRUPPE_HOECHSTENS);
  return (
    <Abschnitt titel={titel} anzahl={zeilen.length}>
      <List>{gezeigt.map(zeile)}</List>
      <MehrAnzeigen anzahl={zeilen.length - gezeigt.length} onClick={() => setAlle(true)} />
    </Abschnitt>
  );
}

export default function WartungenView() {
  const { user, company } = useAuth();
  const vorsaetze = praefixeVon(company);
  const toast = useToast();
  const [wartungen, setWartungen] = useState<WithId<Wartung>[]>([]);
  const [kunden, setKunden] = useState<WithId<Customer>[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [suche, setSuche] = useState('');
  const [form, setForm] = useState<NewWartung>(LEER);
  const [bearbeitet, setBearbeitet] = useState<WithId<Wartung> | null>(null);
  const [formOffen, setFormOffen] = useState(false);
  const [speichert, setSpeichert] = useState(false);
  const [erledigung, setErledigung] = useState<Erledigung | null>(null);
  const [einplanung, setEinplanung] = useState<Einplanung | null>(null);
  /*
    Die vorhandenen Projektnummern — für den Vorschlag UND für die Prüfung,
    ob die Nummer noch frei ist. Zwei Baustellen mit derselben Nummer wären
    der teuerste Fehler dieser Kette, weil Zeiten, Scheine und Rechnungen an
    der Nummer hängen und nicht an der Dokument-ID.
  */
  const [nummern, setNummern] = useState<string[]>([]);
  /*
    Wie weit der Bestand geladen ist. Vorher stand hier die Voreinstellung der
    Abfrage — fünfhundert —, und ein Betrieb mit mehr Vereinbarungen verlor
    die späteren Termine lautlos. Ausgerechnet bei Wartungen ist das teuer:
    eine Vereinbarung, die niemand sieht, wird nicht ausgeführt.
  */
  const [grenze, setGrenze] = useState(WARTUNGEN_JE_SEITE);
  const [toDelete, setToDelete] = useState<WithId<Wartung> | null>(null);

  const darfAendern = user ? isGF(user.role) : false;
  const heute = todayStr();
  /** „Fällig, ohne Baustelle“ aus der Adresse — von der Startseite (Nachtest 01.10.2026). */
  const [adresse, setAdresse] = useSearchParams();
  const nurOhneBaustelle = adresse.get('filter') === 'faellig-ohne-baustelle';
  const ansicht: Ansicht = adresse.get('ansicht') === 'alle' ? 'alle' : 'anstehend';
  function ansichtWaehlen(neu: Ansicht) {
    // Den Filter von der Startseite lässt die Wahl stehen; „Alle zeigen“ nimmt ihn weg.
    const p = new URLSearchParams(adresse);
    if (neu === 'anstehend') p.delete('ansicht');
    else p.set('ansicht', neu);
    setAdresse(p, { replace: true });
  }
  /** Welche Vereinbarung im Seitenfenster steht — die Kennung, damit nach dem Neuladen der frische Stand gilt. */
  const [einzelheitenId, setEinzelheitenId] = useState<string | null>(null);
  /** Anlagendaten und Preis aufgeklappt — beim Öffnen des Formulars festgelegt, nicht bei jedem Tastendruck. */
  const [weitereOffen, setWeitereOffen] = useState(false);

  const companyId = user?.companyId;

  useEffect(() => {
    if (!companyId) return;
    let weg = false;
    setLoading(true);
    void (async () => {
      try {
        const [w, k, p] = await Promise.all([
          listWartungen(companyId, grenze),
          listCustomers(companyId),
          /*
            Nur für den Nummernvorschlag. Scheitert es — etwa weil eine Rolle
            die Baustellen nicht lesen darf —, bleibt die Liste leer und der
            Vorschlag beginnt beim ersten des Jahres. Die ganze Wartungsliste
            deswegen scheitern zu lassen, wäre die falsche Reihenfolge.
          */
          listRecentProjects(companyId, 300).catch(() => []),
        ]);
        if (weg) return;
        setWartungen(w);
        setKunden(k);
        setNummern(p.map((x) => x.projectNumber));
        setError(null);
      } catch (e) {
        if (!weg) setError((e as Error).message);
      } finally {
        if (!weg) setLoading(false);
      }
    })();
    return () => {
      weg = true;
    };
  }, [companyId, grenze]);

  const neuLaden = async () => {
    if (!companyId) return;
    setWartungen(await listWartungen(companyId, grenze));
  };

  /*
    GESUCHT WIRD SERVERSEITIG — und zwar NEBEN der geladenen Liste, nicht
    statt ihrer.

    Die geladene Liste `wartungen` bleibt stehen, solange gesucht wird: leert
    jemand das Suchfeld, ist sie sofort wieder da, ohne neue Abfrage. Die
    Suche ist eine zweite Abfrage über den ganzen Bestand und findet auch
    mitten im Wort. Seit der Linie „Lot“ wirkt sie in der gewählten Ansicht —
    „Steht an“ zeigt dann die anstehenden Treffer, das Suchfeld daneben sagt,
    warum die Liste kürzer ist.
  */
  const [gesucht, setGesucht] = useState<WithId<Wartung>[]>([]);
  const [suchtGerade, setSuchtGerade] = useState(false);

  useEffect(() => {
    if (!companyId) return;
    const begriff = suche.trim();
    if (!begriff) {
      setGesucht([]);
      setSuchtGerade(false);
      return;
    }
    let weg = false;
    setSuchtGerade(true);
    // Dreihundert Millisekunden: die Pause, nach der jemand aufgehört hat zu
    // tippen. Ohne sie stünden zwanzig Abfragen gleichzeitig in der Leitung.
    const verzoegert = setTimeout(() => {
      void searchWartungen(companyId, begriff, grenze)
        .then((treffer) => {
          if (!weg) setGesucht(treffer);
        })
        // Ein Fehlschlag lässt die geladene Liste stehen, statt sie zu leeren:
        // was da ist, ist deshalb nicht falsch.
        .catch(() => {
          if (!weg) setGesucht([]);
        })
        .finally(() => {
          if (!weg) setSuchtGerade(false);
        });
    }, 300);
    return () => {
      weg = true;
      clearTimeout(verzoegert);
    };
  }, [companyId, suche, grenze]);

  const gefiltert = useMemo(
    () => (suche.trim() ? gesucht : wartungen),
    [wartungen, gesucht, suche],
  );

  /**
   * Anstehend heisst überfällig, fällig binnen Vorlauf — und ohne Termin.
   *
   * Der letzte Fall gehört dazu, weil eine Vereinbarung ohne brauchbares
   * Datum sonst im Bestand verschwindet. Sie ist der einzige Eintrag, der
   * eine Eingabe braucht, und der einzige, den niemand vermisst.
   *
   * SEIT DER LINIE „LOT“ GILT DIE SUCHE AUCH HIER: „Steht an“ und „Alle“
   * sind zwei Ansichten derselben Liste, und eine Suche, die in der einen
   * wirkt und in der anderen nicht, wäre ein Rätsel. Ohne Suchbegriff ist
   * die Grundlage wie bisher das Geladene.
   */
  const anstehend = useMemo(
    () =>
      gefiltert
        .filter((w) => {
          const s = beurteile(w, heute).stand;
          if (nurOhneBaustelle) return (s === 'überfällig' || s === 'fällig') && !w.offeneBaustelle;
          return s === 'überfällig' || s === 'fällig' || s === 'unklar';
        })
        .sort(nachFaelligkeit),
    [gefiltert, heute, nurOhneBaustelle],
  );

  const formOeffnen = (w?: WithId<Wartung>) => {
    if (w) {
      setBearbeitet(w);
      setForm({
        customerId: w.customerId,
        customerName: w.customerName,
        anlage: w.anlage,
        address: w.address ?? '',
        intervallMonate: w.intervallMonate,
        zuletztAm: w.zuletztAm ?? '',
        faelligAm: w.faelligAm,
        aktiv: w.aktiv !== false,
        hinweis: w.hinweis ?? '',
        /*
          DIE ANLAGENDATEN KOMMEN MIT (M39). Fehlten sie hier, stünden die
          Felder leer, und `speichern` schriebe Hersteller, Typ und
          Seriennummer als leer zurück — eine Änderung am Hinweis löschte sie.
        */
        hersteller: w.hersteller ?? '',
        typ: w.typ ?? '',
        seriennummer: w.seriennummer ?? '',
        baujahr: w.baujahr ?? null,
        preis: w.preis ?? null,
      });
    } else {
      setBearbeitet(null);
      setForm(LEER());
    }
    /*
      BEIM ÄNDERN OFFEN: „Bearbeiten“ liegt seit der Linie „Lot“ einen Klick
      tiefer (im Seitenfenster); ein zugeklappter Abschnitt wäre ein zweiter.
      Beim Anlegen zugeklappt — Anlagendaten und Preis sind dort selten.
    */
    setWeitereOffen(!!w);
    setFormOffen(true);
  };

  const formSchliessen = () => {
    setFormOffen(false);
    setBearbeitet(null);
  };

  /**
   * Beim Wechsel des Kunden wandert der Name als Kopie mit.
   *
   * Dieselbe Überlegung wie bei den Baustellen: die Liste zeigt ihn und soll
   * dafür nicht die Kundensammlung nachladen müssen.
   */
  const kundeWaehlen = (id: string) => {
    const k = kunden.find((x) => x.id === id);
    setForm((f) => ({ ...f, customerId: id, customerName: k?.name ?? '' }));
  };

  /**
   * Aus „zuletzt gewartet" den Vorschlag für den nächsten Termin rechnen.
   *
   * VORSCHLAG, nicht Zwang: das Feld bleibt frei änderbar. Eine übernommene
   * Anlage kann eine Frist haben, die nicht in dieses Raster passt — etwa
   * weil der Vorbetrieb sie im Herbst gewartet hat und der Kunde die Wartung
   * künftig im Frühjahr will.
   */
  const terminVorschlagen = () => {
    if (!form.zuletztAm) return;
    try {
      setForm((f) => ({ ...f, faelligAm: naechsterTermin(f.zuletztAm!, f.intervallMonate) }));
    } catch {
      /* unbrauchbares Datum: dann bleibt der Termin, wie er ist */
    }
  };

  const speichern = async (e: FormEvent) => {
    e.preventDefault();
    if (!companyId) return;
    if (!form.customerId) {
      toast.error('Bitte einen Kunden wählen.');
      return;
    }
    if (!form.anlage.trim()) {
      toast.error('Bitte eintragen, was gewartet wird.');
      return;
    }
    if (form.baujahr != null && (form.baujahr < 1900 || form.baujahr > 2100)) {
      toast.error('Das Baujahr liegt zwischen 1900 und 2100.');
      return;
    }
    if (!form.faelligAm) {
      toast.error('Ohne Termin wüsste niemand, wann die Wartung ansteht.');
      return;
    }
    setSpeichert(true);
    try {
      const daten: NewWartung = {
        ...form,
        anlage: form.anlage.trim(),
        address: form.address?.trim() || undefined,
        hinweis: form.hinweis?.trim() || undefined,
        zuletztAm: form.zuletztAm || undefined,
        hersteller: form.hersteller?.trim() || null,
        typ: form.typ?.trim() || null,
        seriennummer: form.seriennummer?.trim() || null,
      };
      if (bearbeitet) {
        await updateWartung(bearbeitet.id, daten);
        toast.success('Wartung geändert.');
      } else {
        await createWartung(companyId, daten);
        toast.success('Wartung angelegt.');
      }
      setFormOffen(false);
      setBearbeitet(null);
      setForm(LEER());
      await neuLaden();
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setSpeichert(false);
    }
  };

  /**
   * Aus der Wartung eine Baustelle machen — und sie an der Wartung vormerken.
   *
   * ZWEI SCHREIBVORGÄNGE, UND DIE REIHENFOLGE IST DIE AUSSAGE. Zuerst
   * entsteht die Baustelle, dann wird sie vermerkt. Bricht der zweite Schritt
   * ab, steht eine Baustelle da, die niemand der Wartung zuordnet — ärgerlich,
   * aber sichtbar und von Hand nachtragbar. Andersherum verwiese die Wartung
   * auf eine Baustelle, die es nicht gibt, und der Monteur bekäme einen
   * Einsatz auf eine Nummer, unter der nichts steht.
   *
   * Eine Transaktion über beide wäre die saubere Antwort, und seit dem Umzug
   * wäre sie auch möglich — eine Datenbankfunktion, die Baustelle und Termin
   * in einem Zug schreibt. Sie ist noch nicht gebaut; bis dahin gilt die
   * Reihenfolge unten, und der schlimmste Ausgang ist eine Baustelle ohne
   * nachgerückten Termin, nicht ein Termin ohne Baustelle.
   */
  const einplanenSpeichern = async () => {
    if (!einplanung || !companyId) return;
    let nummer = einplanung.nummer.trim();
    if (!nummer) {
      toast.error('Ohne Projektnummer gibt es keine Baustelle.');
      return;
    }
    setSpeichert(true);
    try {
      /*
        DERSELBE WEG WIE BEI „NEUE BAUSTELLE". Blieb der Vorschlag stehen,
        vergibt der Zähler die verbindliche Nummer — mit dem Vorsatz, den der
        Betrieb eingestellt hat. Vorher schlug diese Stelle „2026-001" vor,
        während jede andere Anlage „B-2026-0001" schrieb: die eingestellten
        Vorsätze galten hier nicht, und neben B-2026-0014 stand plötzlich
        2026-015. Wer eine eigene Nummer tippt, behält sie.
      */
      if (nummer === einplanung.vorschlag) {
        const vergeben = await reserveProjectNumber(companyId, {
          seedFrom: 0, // Den Anfangsstand liest die Datenbank selbst.
          praefix: vorsaetze.baustelle,
        });
        if (vergeben) nummer = vergeben;
      }
      if (!nummerFrei(nummer, nummern)) {
        toast.error(`${nummer} ist schon vergeben. Bitte eine andere Nummer.`);
        return;
      }
      const kunde = kunden.find((k) => k.id === einplanung.wartung.customerId);
      await createProject(
        companyId,
        baustelleAusWartung(einplanung.wartung, kunde, nummer),
      );
      await wartungEingeplant(einplanung.wartung.id, nummer);
      setNummern((n) => [...n, nummer]);
      setEinplanung(null);
      await neuLaden();
      toast.success(`Baustelle ${nummer} angelegt. Jetzt im Einsatzplan einteilen.`);
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setSpeichert(false);
    }
  };

  const erledigtSpeichern = async () => {
    if (!erledigung) return;
    setSpeichert(true);
    try {
      await wartungErledigt(erledigung.wartung.id, {
        erledigtAm: erledigung.datum,
        intervallMonate: erledigung.intervall,
        projectNumber: erledigung.baustelle.trim() || undefined,
      });
      const naechster = naechsterTermin(erledigung.datum, erledigung.intervall);
      setErledigung(null);
      await neuLaden();
      toast.success(`Eingetragen. Nächste Wartung: ${fmtDatum(naechster)}.`);
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setSpeichert(false);
    }
  };

  const loeschen = async () => {
    if (!toDelete) return;
    try {
      await deleteWartung(toDelete.id);
      setToDelete(null);
      // Das Seitenfenster zeigte sonst weiter eine Vereinbarung, die es nicht mehr gibt.
      formSchliessen();
      await neuLaden();
      toast.success('Wartung gelöscht.');
    } catch (e) {
      toast.error((e as Error).message);
    }
  };

  if (!user) return null;
  if (error) return <ErrorState message={error} />;

  /** Die Erledigt-Rückfrage für eine Wartung — mit dem Tag von heute vorbelegt. */
  const erledigtFragen = (w: WithId<Wartung>) =>
    setErledigung({
      wartung: w,
      datum: heute,
      intervall: w.intervallMonate,
      // Die eingeplante Baustelle steht schon da: niemand soll
      // eine Nummer abtippen, die die App kennt.
      baustelle: w.offeneBaustelle ?? '',
    });

  const einplanenFragen = (w: WithId<Wartung>) => {
    const vorschlag = belegNummer(
      vorsaetze.baustelle,
      new Date().getFullYear(),
      hoechsteLfdImJahr(nummern, new Date().getFullYear()) + 1,
    );
    setEinplanung({ wartung: w, nummer: vorschlag, vorschlag });
  };

  /*
    Einplanen steht nur dort, wo es etwas zu planen gibt: bei einer
    anstehenden Wartung ohne offene Baustelle. An einer Vereinbarung,
    die erst in acht Monaten fällig wird, wäre der Knopf eine
    Einladung, Baustellen auf Vorrat anzulegen.
  */
  const kannEinplanen = (w: WithId<Wartung>) => {
    const s = beurteile(w, heute).stand;
    return !w.offeneBaustelle && s !== 'später' && s !== 'ruht';
  };

  /* Die eingeplante Baustelle — auf die Baustellenliste nur, wer sie sehen darf. */
  const baustelleVerweis = (nummer: string) =>
    darfAendern ? (
      // Über der Fläche der Zeile, die sonst jeden Tipp ins Seitenfenster lenkte.
      <Link className="link-hinweis-weiter relative z-[1]" to={`/admin-projects?baustelle=${encodeURIComponent(nummer)}`}>
        {nummer}
      </Link>
    ) : (
      nummer
    );

  /*
    DIE ZEILE TRÄGT ALLES WIE BISHER — Kunde, Stand, Anlage, Ort, Intervall,
    Termin, Hinweis, Anlagendaten, Preis — und die nächsten Schritte. Die
    ganze Zeile öffnet die Anlage im Seitenfenster: dieselben Angaben
    geordnet, die Wartungen als Lot und alle Schritte. Kürzer wäre die Zeile
    ruhiger, aber unter „Alle“ läge jede Angabe dann zwei Tipps tief.
  */
  const zeile = (w: WithId<Wartung>) => {
    const u = beurteile(w, heute);
    return (
      <ListRow
        key={w.id}
        onOeffnen={() => setEinzelheitenId(w.id)}
        title={
          // Eigener Abstand: der Titel steht jetzt im Knopf der Zeile, nicht mehr direkt im Zeilenkopf.
          <span className="flex flex-wrap items-center gap-x-2">
            <span>{w.customerName}</span>
            <Zustand stand={STAND[u.stand]}>{u.stand === 'ruht' ? 'ruht' : u.text}</Zustand>
          </span>
        }
        subtitle={
          <>
            {w.anlage}
            {w.address ? ` · ${w.address}` : ''} · alle {w.intervallMonate} Monate · Termin{' '}
            {fmtDatum(w.faelligAm)}
            {w.zuletztAm ? ` · zuletzt ${fmtDatum(w.zuletztAm)}` : ' · noch nie gewartet'}
            {w.hinweis ? ` · ${w.hinweis}` : ''}
            {anlagendaten(w) ? ` · ${anlagendaten(w)}` : ''}
            {w.preis != null ? ` · ${euro(w.preis)} je Wartung` : ''}
            {/*
              WAS SCHON EINGEPLANT IST, SAGT ES. Ohne diese Zeile hiess
              „fällig" zweierlei — „noch nichts passiert" und „steht längst im
              Einsatzplan" —, und wer die Liste zweimal durchging, legte die
              Baustelle zweimal an.
            */}
            {w.offeneBaustelle ? (
              <span className="mt-1 block text-xs text-ink-muted">
                Eingeplant auf Baustelle {baustelleVerweis(w.offeneBaustelle)}
              </span>
            ) : null}
          </>
        }
      >
        {darfAendern && (
          <>
            {/*
              EINE FESTE REIHENFOLGE (Testbericht 30.09.2026, G8): „Erledigt“
              zuerst, dann „Baustelle anlegen“. Vorher stand „Erledigt“ mal an
              erster, mal an zweiter Stelle — je nachdem, ob es etwas
              einzuplanen gab —, und der Daumen traf den falschen Knopf.
            */}
            <Button variant="secondary" onClick={() => erledigtFragen(w)}>
              Erledigt
            </Button>
            {/*
              JE ANSICHT IHR ZWEITER SCHRITT: unter „Steht an“ die Arbeit
              (Baustelle anlegen), unter „Alle“ die Pflege des Bestands
              (Bearbeiten) — dort stand „Bearbeiten“ schon bisher, und ein
              Klick mehr über das Seitenfenster wären dort zwei.
            */}
            {ansicht === 'anstehend'
              ? kannEinplanen(w) && <Button onClick={() => einplanenFragen(w)}>Baustelle anlegen</Button>
              : (
                <Button variant="ghost" onClick={() => formOeffnen(w)}>
                  Bearbeiten
                </Button>
              )}
          </>
        )}
      </ListRow>
    );
  };

  /*
    NACH DRINGLICHKEIT GRUPPIERT, in der Reihenfolge von `nachFaelligkeit`:
    ohne Termin zuerst (der einzige Fall, der eine Eingabe braucht und den
    sonst niemand vermisst), dann überfällig, dann fällig.
  */
  const gruppen: { id: string; titel: string; zeilen: WithId<Wartung>[] }[] =
    ansicht === 'anstehend'
      ? [
          { id: 'unklar', titel: 'Ohne Termin', zeilen: anstehend.filter((w) => beurteile(w, heute).stand === 'unklar') },
          { id: 'ueberfaellig', titel: 'Überfällig', zeilen: anstehend.filter((w) => beurteile(w, heute).stand === 'überfällig') },
          { id: 'faellig', titel: `Fällig in den nächsten ${VORLAUF_TAGE} Tagen`, zeilen: anstehend.filter((w) => beurteile(w, heute).stand === 'fällig') },
        ]
      : [{ id: 'alle', titel: 'Alle Vereinbarungen', zeilen: gefiltert }];
  const sichtbar = gruppen.filter((g) => g.zeilen.length > 0);
  const leer =
    ansicht === 'anstehend' && !suche.trim()
      ? `In den nächsten ${VORLAUF_TAGE} Tagen steht keine Wartung an.`
      : wartungen.length === 0
        ? 'Noch keine Wartung erfasst.'
        : 'Kein Treffer für diese Suche.';

  const einzelheiten = einzelheitenId
    ? (gefiltert.find((w) => w.id === einzelheitenId) ?? wartungen.find((w) => w.id === einzelheitenId) ?? null)
    : null;

  return (
    <div className="space-y-6">
      <PageHeader
        title="Wartungen"
        subtitle={`Wiederkehrende Wartungen · fällig gilt ab ${VORLAUF_TAGE} Tagen im Voraus`}
        action={
          darfAendern ? <Button onClick={() => formOeffnen()}>Neue Wartung</Button> : undefined
        }
      />

      {nurOhneBaustelle && <Adressfilter text="fällige Wartungen ohne Baustelle" parameter={['filter']} />}

      {/* Bündig: Wartungen als Zeilen von Kante zu Kante. */}
      <Card buendig>
        <div className="flex flex-wrap items-end gap-3 p-4">
          <div className="w-full md:w-auto">
            <Segmente name="Wartungen zeigen" werte={ANSICHTEN} wert={ansicht} onChange={ansichtWaehlen} />
          </div>
          <div className="min-w-[12rem] flex-1">
            <InputField id="w-suche"
              label="Suche"
              type="search"
              placeholder="Kunde, Anlage oder Standort"
              value={suche}
              onChange={(e) => setSuche(e.target.value)}
            />
          </div>
        </div>
        {loading || suchtGerade ? (
          /*
            WÄHREND DER SUCHE STEHT DAS GERÜST, NICHT DIE LEERE.

            Zwischen Tastendruck und Antwort liegen die Verzögerung und eine
            Netzrunde. Ohne diesen Zweig stünde in dieser Zeit „Kein Treffer
            für diese Suche" — eine Aussage über den Bestand, wo nur noch
            keine Antwort da ist. Wer schnell tippt, läse sie bei jedem
            Buchstaben.
          */
          <div className="px-4 pb-4">
            <SkeletonList />
          </div>
        ) : sichtbar.length === 0 ? (
          <div className="border-t border-line">
            <EmptyState>{leer}</EmptyState>
          </div>
        ) : (
          sichtbar.map((g) => <Gruppe key={`${ansicht}-${g.id}`} titel={g.titel} zeilen={g.zeilen} zeile={zeile} />)
        )}
        {!loading && (
          <div className="px-4 pb-3 empty:hidden">
            <Nachladen
              geladen={wartungen.length}
              grenze={grenze}
              einheit="Vereinbarungen"
              onMehr={() => setGrenze((n) => n + WARTUNGEN_JE_SEITE)}
            />
          </div>
        )}
      </Card>

      {/*
        DIE ANLAGE IM SEITENFENSTER (Protokoll E7, „Anlage mit Wartungen als
        Lot“): was die Zeile kurz sagt, hier ganz — und die Wartungen als Lot.
        Gezeigt wird nur, was gespeichert ist: die letzte Wartung, eine
        eingeplante Baustelle, der nächste Termin. Frühere Ausführungen führt
        die App nicht einzeln; jede rückt nur den Termin weiter.
      */}
      <BottomSheet
        open={!!einzelheiten}
        onClose={() => setEinzelheitenId(null)}
        label="Wartung"
        auchBreit
        // Kurz: ein langer Kundenname im Fensterkopf drückte „Schließen“ in zwei Zeilen.
        titel="Anlage"
      >
        {einzelheiten && (() => {
          const w = einzelheiten;
          const u = beurteile(w, heute);
          const punkte: LotPunkt[] = [
            w.zuletztAm
              ? { titel: 'Zuletzt gewartet', zeit: fmtDatum(w.zuletztAm), text: w.letzteBaustelle ? `Baustelle ${w.letzteBaustelle}` : undefined }
              : { titel: 'Noch nie gewartet' },
            ...(w.offeneBaustelle
              ? [{ titel: 'Eingeplant', text: <>auf Baustelle {baustelleVerweis(w.offeneBaustelle)}</> }]
              : []),
            u.stand === 'ruht'
              ? { titel: 'Ruht', text: 'Die Vereinbarung ist angehalten — kein Termin.' }
              : { titel: 'Nächste Wartung', zeit: fmtDatum(w.faelligAm), text: u.text, jetzt: true },
          ];
          return (
            <div className="space-y-5">
              <div>
                <p className="text-lg font-semibold text-ink-deep">{w.customerName}</p>
                <Zustand stand={STAND[u.stand]}>{u.stand === 'ruht' ? 'ruht' : u.text}</Zustand>
              </div>
              <dl className="grid grid-cols-1 gap-y-3">
                <Angabe wort="Anlage">{w.anlage}</Angabe>
                <Angabe wort="Standort">{w.address || 'Kundenadresse'}</Angabe>
                <Angabe wort="Intervall">alle {w.intervallMonate} Monate</Angabe>
                {anlagendaten(w) && <Angabe wort="Anlagendaten">{anlagendaten(w)}</Angabe>}
                {w.preis != null && <Angabe wort="Preis je Wartung">{euro(w.preis)} netto</Angabe>}
                {w.hinweis && <Angabe wort="Hinweis">{w.hinweis}</Angabe>}
              </dl>
              <div>
                <h3 className="section-label mb-3">Wartungen</h3>
                <LotVerlauf name="Wartungen dieser Anlage" punkte={punkte} />
              </div>
              {darfAendern && (
                <div className="fuss-aktionen">
                  <Button variant="ghost" onClick={() => { setEinzelheitenId(null); formOeffnen(w); }}>
                    Bearbeiten
                  </Button>
                  {kannEinplanen(w) && (
                    <Button variant="secondary" onClick={() => { setEinzelheitenId(null); einplanenFragen(w); }}>
                      Baustelle anlegen
                    </Button>
                  )}
                  <Button onClick={() => { setEinzelheitenId(null); erledigtFragen(w); }}>
                    Erledigt
                  </Button>
                </div>
              )}
            </div>
          );
        })()}
      </BottomSheet>

      {/*
        ANLEGEN UND ÄNDERN IM SEITENFENSTER (Regel 8). Vorher klappte das
        Formular oben auf der Seite auf — auch, wenn „Bearbeiten“ an einer
        Zeile weit unten stand, die dann aus dem Blick lief.
      */}
      <BottomSheet
        open={formOffen && darfAendern}
        onClose={formSchliessen}
        label={bearbeitet ? 'Wartung ändern' : 'Neue Wartung'}
        auchBreit
        titel={bearbeitet ? 'Wartung ändern' : 'Neue Wartung'}
      >
        <form onSubmit={speichern} className="formular space-y-4">
          <SelectField id="w-kunde"
            label="Kunde"
            pflicht
            value={form.customerId}
            onChange={(e) => kundeWaehlen(e.target.value)}
          >
            <option value="">— wählen —</option>
            {kunden.map((k) => (
              <option key={k.id} value={k.id}>
                {k.name}
              </option>
            ))}
          </SelectField>
          <KundenGrenze kunden={kunden} />
          <InputField id="w-anlage"
            label="Anlage"
            pflicht
            placeholder="z. B. Therme im Keller"
            value={form.anlage}
            onChange={(e) => setForm({ ...form, anlage: e.target.value })}
          />
          <InputField id="w-standort"
            label="Standort (leer = Kundenadresse)"
            value={form.address ?? ''}
            onChange={(e) => setForm({ ...form, address: e.target.value })}
          />
          <SelectField id="w-intervall"
            label="Intervall"
            value={String(form.intervallMonate)}
            onChange={(e) => setForm(mitTermin({ ...form, intervallMonate: Number(e.target.value) }))}
          >
            {INTERVALLE.map((m) => (
              <option key={m} value={m}>
                alle {m} Monate
              </option>
            ))}
          </SelectField>
          <InputField id="w-zuletzt"
            label="Zuletzt gewartet"
            type="date"
            value={form.zuletztAm ?? ''}
            onChange={(e) => setForm(mitTermin({ ...form, zuletztAm: e.target.value }))}
            onBlur={terminVorschlagen}
          />
          <div className="flex flex-col gap-1">
            <InputField id="w-termin"
              label="Nächster Termin"
              pflicht
              type="date"
              value={form.faelligAm}
              onChange={(e) => setForm({ ...form, faelligAm: e.target.value })}
            />
            {form.zuletztAm && (
              <p className="text-xs text-ink-muted">
                Aus „zuletzt gewartet“ plus Intervall berechnet — für einen vereinbarten Ausweichtag änderbar.
              </p>
            )}
          </div>
          <InputField id="w-hinweis"
            label="Hinweis"
            placeholder="z. B. Schlüssel bei der Hausverwaltung"
            value={form.hinweis ?? ''}
            onChange={(e) => setForm({ ...form, hinweis: e.target.value })}
          />
          <div className="flex flex-wrap items-center">
            <CheckboxField id="w-aktiv"
              label="Vereinbarung läuft"
              checked={form.aktiv}
              onChange={(e) => setForm({ ...form, aktiv: e.target.checked })}
            />
            <InfoHint about="Vereinbarung läuft">
              Eine gekündigte Vereinbarung wird nicht gelöscht, sondern angehalten — die
              Historie ist der Grund, warum man den Kunden später wieder anruft.
            </InfoHint>
          </div>
          {/* Anlagendaten (M39): stand vorher, wenn überhaupt, im Freitext. Selten zu pflegen. */}
          <WeitereAngaben titel="Anlagendaten und Preis" offen={weitereOffen}>
            <InputField id="w-hersteller"
              label="Hersteller"
              placeholder="z. B. Vaillant"
              value={form.hersteller ?? ''}
              onChange={(e) => setForm({ ...form, hersteller: e.target.value })}
            />
            <InputField id="w-typ"
              label="Typ"
              placeholder="z. B. ecoTEC plus VC 206"
              value={form.typ ?? ''}
              onChange={(e) => setForm({ ...form, typ: e.target.value })}
            />
            <InputField id="w-seriennummer"
              label="Seriennummer"
              value={form.seriennummer ?? ''}
              onChange={(e) => setForm({ ...form, seriennummer: e.target.value })}
            />
            <ZahlWertFeld id="w-baujahr"
              label="Baujahr"
              placeholder="z. B. 2018"
              wert={form.baujahr ?? null}
              onWert={(n) => setForm({ ...form, baujahr: n == null ? null : Math.round(n) })}
            />
            <ZahlWertFeld id="w-preis"
              label="Preis je Wartung netto (€)"
              placeholder="leer = nicht vereinbart"
              wert={form.preis ?? null}
              onWert={(n) => setForm({ ...form, preis: n })}
            />
          </WeitereAngaben>
          <Pflichthinweis />
          <div className="fuss-aktionen">
            {bearbeitet && (
              <Button type="button" variant="danger" onClick={() => setToDelete(bearbeitet)}>
                Löschen
              </Button>
            )}
            <Button type="button" variant="ghost" onClick={formSchliessen}>
              Abbrechen
            </Button>
            <Button type="submit" disabled={speichert}>
              {speichert ? 'Speichert …' : 'Speichern'}
            </Button>
          </div>
        </form>
      </BottomSheet>

      {erledigung && (
        <ConfirmDialog
          open
          title="Wartung erledigt eintragen"
          confirmLabel={speichert ? 'Trägt ein …' : 'Eintragen'}
          onConfirm={erledigtSpeichern}
          onCancel={() => setErledigung(null)}
        >
          <div className="space-y-3">
            <p className="text-sm">
              {erledigung.wartung.customerName} · {erledigung.wartung.anlage}
            </p>
            <FormGrid cols={1}>
              <InputField id="e-datum"
                label="Gewartet am"
                type="date"
                value={erledigung.datum}
                onChange={(e) => setErledigung({ ...erledigung, datum: e.target.value })}
              />
              <SelectField id="e-intervall"
                label="Intervall ab jetzt"
                value={String(erledigung.intervall)}
                onChange={(e) =>
                  setErledigung({ ...erledigung, intervall: Number(e.target.value) })
                }
              >
                {INTERVALLE.map((m) => (
                  <option key={m} value={m}>
                    alle {m} Monate
                  </option>
                ))}
              </SelectField>
              <InputField id="e-baustelle"
                label="Baustelle (optional)"
                placeholder="z. B. 2026-014"
                value={erledigung.baustelle}
                onChange={(e) => setErledigung({ ...erledigung, baustelle: e.target.value })}
              />
            </FormGrid>
            {/* Die Vorschau in einer Zeile, die Begründung hinter dem „i“ (Regel 9). */}
            <p className="flex flex-wrap items-center text-sm text-ink-muted">
              Nächster Termin: {fmtDatum(naechsterTermin(erledigung.datum, erledigung.intervall))}
              <InfoHint about="nächster Termin">
                Gerechnet ab dem Tag der Ausführung, nicht ab dem geplanten Termin — das
                Wartungsintervall läuft ab der letzten tatsächlichen Wartung.
              </InfoHint>
            </p>
          </div>
        </ConfirmDialog>
      )}

      {einplanung && (
        <ConfirmDialog
          open
          title="Baustelle für diese Wartung anlegen?"
          confirmLabel="Anlegen"
          confirmTone="primary"
          onConfirm={einplanenSpeichern}
          onCancel={() => setEinplanung(null)}
        >
          <div className="space-y-3">
            <p className="text-sm text-ink-muted">
              {einplanung.wartung.customerName} · {einplanung.wartung.anlage}
            </p>
            <FormGrid cols={1}>
              <InputField id="p-nummer"
                label="Projektnummer"
                pflicht
                value={einplanung.nummer}
                onChange={(e) => setEinplanung({ ...einplanung, nummer: e.target.value })}
              />
            </FormGrid>
            {/*
              VORSCHLAG, NICHT ZÄHLER — und das steht auch da. Projektnummern
              vergibt der Betrieb frei; wer ein eigenes System führt,
              überschreibt die Zahl. Vergeben ist sie deshalb erst, wenn
              gespeichert wird, und dabei wird sie noch einmal geprüft.
            */}
            <p className="flex flex-wrap items-center text-sm text-ink-muted">
              Vorgeschlagen nach dem Schema des Betriebs — änderbar.
              <InfoHint about="die neue Baustelle">
                Die Baustelle entsteht mit Kunde, Standort und der Anlage in der Beschreibung;
                einzuteilen ist sie danach im Einsatzplan. Die Abrechnungsart bleibt offen: was
                im Wartungsvertrag steht, weiß diese App nicht.
              </InfoHint>
            </p>
          </div>
        </ConfirmDialog>
      )}

      {toDelete && (
        <ConfirmDialog
          open
          title="Wartung löschen?"
          confirmLabel="Löschen"
          onConfirm={loeschen}
          onCancel={() => setToDelete(null)}
        >
          <p>
            {toDelete.customerName} · {toDelete.anlage}. Die Historie geht mit verloren. Wer die
            Vereinbarung nur beenden will, hält sie besser an.
          </p>
        </ConfirmDialog>
      )}
    </div>
  );
}

function Angabe({ wort, children }: { wort: string; children: ReactNode }) {
  return (
    <div>
      <dt className="section-label">{wort}</dt>
      <dd className="mt-0.5 text-sm text-ink">{children}</dd>
    </div>
  );
}
