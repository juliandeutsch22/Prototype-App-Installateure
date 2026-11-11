import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { useAuth } from '@/app/AuthContext';
import {
  anhangAdressen, gelesen, nachrichtReagieren, nachrichtSenden, verlauf, wartendeNachrichten,
  type KanalKopf, type Nachricht, type NeueDatei, type Reaktionszeichen, type VerlaufZeiger, type VorgemerkteNachricht,
} from '@/lib/db/nachrichten';
import { FACH_GELEERT } from '@/lib/sync/ausgangsfach';
import { postenNeuLaden } from '@/app/offenePosten';
import Button from '@/components/Button';
import Icon from '@/components/Icon';
import { Zustand } from '@/components/Badge';
import { ErrorState, SkeletonList } from '@/components/States';
import { MehrAnzeigen } from '@/components/LotBausteine';
import { useToast } from '@/components/Toast';
import { grundAus } from '@/lib/fehlerGrund';
import { useModul } from '@/lib/useModule';
import { NACHRICHTEN_NEU } from './NachrichtenLive';
import {
  ART_TEXT, dateiPruefen, DATEI_TYPEN, erwaehnteIn, groesseText, GRUPPE_MS, istBild, kuerzel, mitMausUndTastatur, PAUSE_MS, sendetMitTaste, tagText, tagVon, uhrText, zeitText,
} from './text';
import NachrichtAktionen, { type Auftrag } from './NachrichtAktionen';
import { NachrichtLeiste, ReaktionsKaestchen } from './NachrichtLeiste';
import PersonWahl from './PersonWahl';
import { useLangDruck } from './langDruck';
import { alsKasten, leistenPlatz, type Kasten } from './leistenPlatz';
import { irgendwas, moeglichkeiten, textKopieren, type Handlung } from './moeglichkeiten';
import { mitReaktion } from './reaktionen';

/** Was gerade auf dem Weg ist — in dieser Sitzung gesendet, noch nicht bestätigt oder abgelehnt. */
interface Unterwegs {
  id: string;
  text: string;
  dateien: NeueDatei[];
  erwaehnt: string[];
  /**
   * `gesendet`: der Server hat sie angenommen, sie steht aber noch, bis der
   * neu geladene Verlauf sie enthält — so verschwindet sie nie kurz.
   */
  stand: 'laeuft' | 'gesendet' | 'fehler';
  grund?: string;
}

/**
 * Wo die Leiste einer Nachricht steht: noch beim Messen, frei schwebend an
 * einem Platz ohne Text, oder in einer eigenen Zeile über (`oben`) oder
 * unter der Blase, wenn nirgends Platz frei ist (E77).
 */
type Lage = 'messen' | 'zeile' | { links: number; oben: number; zeilen: 1 | 2 };
interface Leiste { id: string; seite: 'oben' | 'unten'; lage: Lage }

/** Was neben einer Nachricht steht und nicht verdeckt werden darf. */
const HINDERNISSE = '.nachricht-blatt, .nachricht-reaktionen, .verlauf-tag > span, .nachricht-von, .nachricht-status, .nachricht-nochmal, .verlauf-leer, .mehr-laden';
const zeileIn = (r: HTMLElement | null, id: string) => r?.querySelector<HTMLElement>(`li[data-nachricht="${CSS.escape(id)}"]`) ?? null;
const blattIn = (r: HTMLElement | null, id: string) => zeileIn(r, id)?.querySelector<HTMLElement>('.nachricht-blatt') ?? null;
/** Der Rest am Ende des Verlaufs (siehe `halten`); 12 px ist das eigene untere Polster der Liste. */
function restSetzen(r: HTMLElement | null, rest: { current: number }, wert: number) {
  rest.current = Math.max(0, wert);
  const liste = r?.querySelector<HTMLElement>('.verlauf');
  if (liste) liste.style.paddingBottom = rest.current ? `${rest.current + 12}px` : '';
}

/**
 * Die Blase bleibt, wo sie war: zuerst rollt der Rahmen um die Differenz.
 * Geht das nicht weit genug — ganz unten, wo eine verschwundene Zeile der
 * Leiste den Verlauf kürzer macht, oder in einem kurzen Gespräch, das unten
 * an der Eingabe steht —, nimmt ein Rest am Ende des Verlaufs die Höhe auf
 * (gemessen 11.11.2026: sonst rückte die Blase am Tablet um 44 px). Der
 * Rest geht, wenn die Leiste zugeht.
 */
function halten(blatt: HTMLElement, oben: number, r: HTMLElement | null, rest: { current: number }) {
  for (let versuch = 0; versuch < 3; versuch++) {
    const d = blatt.getBoundingClientRect().top - oben;
    if (Math.abs(d) < 0.5) return;
    // Am Telefon rollt die Seite, nicht der Rahmen.
    if (!r || getComputedStyle(r).overflowY !== 'auto') { window.scrollBy?.(0, d); return; }
    r.scrollTop += d;
    const bleibt = blatt.getBoundingClientRect().top - oben;
    if (Math.abs(bleibt) < 0.5) return;
    // Nach unten gerückt: mehr Rest hebt den Verlauf (oder gibt Platz zum Rollen); nach oben gerückt: weniger Rest.
    if (bleibt < 0 && rest.current === 0) return;
    restSetzen(r, rest, rest.current + bleibt);
  }
}

/** So lange ruht die Maus auf einer Nachricht, bis die Leiste kommt — beim Überstreichen bleibt es ruhig. */
const LEISTE_MS = 120;

/** Ein Eintrag im Verlauf — vom Server, im Ausgangsfach oder gerade unterwegs. */
type Eintrag = { id: string; eigene: boolean; von: string; zeit: string } & (
  | { art: 'server'; n: Nachricht }
  | { art: 'fach'; w: VorgemerkteNachricht }
  | { art: 'unterwegs'; u: Unterwegs }
);

/**
 * DAS GESPRÄCH — der Verlauf von oben nach unten, die Eingabe darunter.
 *
 * Eine Nachricht ist ein kleines Blatt: die eigenen rechts in Petrol-hell,
 * die der anderen links in der zweiten Fläche — eckig, ohne Schatten, wie
 * alles in der Linie „Lot“. Die Uhrzeit (IBM Plex Mono) steht unten im
 * Blatt, der Tag als Trenner darüber. Nachrichten derselben Person dicht
 * hintereinander bilden eine Gruppe; den Namen trägt nur die erste, und nur
 * wo mehr als eine andere Person schreibt (Runde, Baustelle). Für die
 * Vorlesehilfe steht vor jeder Nachricht der Absender, auch „Du“.
 *
 * WAS MAN MIT IHR TUN KANN (E77): am Schreibtisch kommt beim Darüberfahren
 * (und mit der Tastatur beim Fokus) eine Leiste mit den Reaktionen und den
 * Handlungen als Zeichen; am Handy öffnet langes Drücken die Wahl. Darunter
 * stehen die Reaktionen als Kästchen.
 *
 * DIE FÜNF ZUSTÄNDE mit Text, nicht mit Farbe:
 *   - „wird gesendet“ (läuft), solange der Server noch nicht geantwortet hat;
 *   - „auf diesem Gerät vorgemerkt, wird gesendet“ (offen) — im
 *     Ausgangsfach, auch nach einem Neustart der App;
 *   - „Nicht gesendet: …“ (Fehler) mit „Erneut senden“;
 *   - „bearbeitet“ und „Nachricht gelöscht“.
 * Eine Lesebestätigung gibt es nicht (D4): „gesendet“ heißt „auf dem Server“.
 */
export default function Gespraech({
  kopf,
  companyId,
  personen,
  mitTitel = true,
}: {
  kopf: KanalKopf;
  /** Am Handy steht der Name schon im Seitenkopf — das Blatt trägt ihn dann nicht noch einmal. */
  mitTitel?: boolean;
  companyId: string;
  /** Wer erwähnt werden kann — in der Runde die Teilnehmer, am Thread alle im Betrieb (der Server prüft, wer ihn liest). */
  personen: { uid: string; name: string }[];
}) {
  const kanal = kopf.kanal;
  const [nachrichten, setNachrichten] = useState<Nachricht[] | null>(null);
  const [weiter, setWeiter] = useState<VerlaufZeiger | null>(null);
  const [fehler, setFehler] = useState<string | null>(null);
  const [mehrLaeuft, setMehrLaeuft] = useState(false);
  const [wartend, setWartend] = useState<VorgemerkteNachricht[]>([]);
  const [unterwegs, setUnterwegs] = useState<Unterwegs[]>([]);
  const [adressen, setAdressen] = useState<Map<string, string>>(new Map());
  const [vorschau, setVorschau] = useState<Map<string, string>>(new Map());
  const [text, setText] = useState('');
  const [dateien, setDateien] = useState<NeueDatei[]>([]);
  const [dateiFehler, setDateiFehler] = useState<string | null>(null);
  const [auftrag, setAuftrag] = useState<Auftrag | null>(null);
  const [leiste, setLeiste] = useState<Leiste | null>(null);
  const [erwaehnen, setErwaehnen] = useState(false);
  const [versuch, setVersuch] = useState(0);
  const lauf = useRef(0);
  const kameraWahl = useRef<HTMLInputElement>(null);
  const rahmen = useRef<HTMLDivElement>(null);
  const eingabe = useRef<HTMLTextAreaElement>(null);
  const dateiWahl = useRef<HTMLInputElement>(null);
  const privat = kopf.art !== 'baustelle';
  const { user } = useAuth();
  const toast = useToast();
  const nachrichtenAn = useModul('nachrichten');
  const langDruck = useLangDruck();

  /** Die erste Seite (neueste zuerst) — still heißt: der Verlauf bleibt stehen, bis die Antwort da ist. */
  const laden = useCallback(async (still: boolean) => {
    const meiner = ++lauf.current;
    if (!still) { setNachrichten(null); setFehler(null); }
    try {
      const seite = await verlauf(kanal);
      if (meiner !== lauf.current) return;
      setNachrichten((alt) => {
        // Ältere, schon nachgeladene Seiten bleiben stehen.
        if (!still || !alt) return seite.nachrichten;
        const neu = new Set(seite.nachrichten.map((n) => n.id));
        const aelteste = seite.nachrichten[seite.nachrichten.length - 1]?.gesendetAm ?? '';
        return [...seite.nachrichten, ...alt.filter((n) => !neu.has(n.id) && n.gesendetAm < aelteste)];
      });
      if (!still) setWeiter(seite.weiter);
      setFehler(null);
      // Gelesen ist, was man sieht — die eigene Zahl geht auf null; sonst erfährt es niemand (D4).
      await gelesen(kanal).catch(() => undefined);
      void postenNeuLaden();
    } catch (e) {
      if (meiner === lauf.current && !still) setFehler(grundAus(e, 'Das Gespräch konnte nicht geladen werden.'));
    }
  }, [kanal]);

  const wartendeLaden = useCallback(
    () => wartendeNachrichten(kanal).then(setWartend).catch(() => undefined),
    [kanal],
  );

  useEffect(() => {
    setUnterwegs([]);
    setText('');
    setDateien([]);
    void laden(false);
    void wartendeLaden();
  }, [laden, wartendeLaden, versuch]);

  // Neues in diesem Gespräch (Live) oder nach dem Nachsenden aus dem Ausgangsfach.
  useEffect(() => {
    const neu = (e: Event) => {
      const k = (e as CustomEvent<string | null>).detail;
      if (!k || k === kanal) void laden(true);
    };
    // Erst der Server-Stand, dann das Fach: dazwischen fehlt sonst die eben gesendete Nachricht.
    const fach = () => { void laden(true).then(wartendeLaden); };
    window.addEventListener(NACHRICHTEN_NEU, neu);
    window.addEventListener(FACH_GELEERT, fach);
    return () => {
      window.removeEventListener(NACHRICHTEN_NEU, neu);
      window.removeEventListener(FACH_GELEERT, fach);
    };
  }, [kanal, laden, wartendeLaden]);

  // Die Anhänge über kurzlebige Adressen — neu signiert mit jedem Laden.
  useEffect(() => {
    const alle = (nachrichten ?? []).flatMap((n) => n.anhaenge);
    if (alle.length === 0) return;
    let weg = false;
    void anhangAdressen(alle).then((m) => { if (!weg) setAdressen(m); }).catch(() => undefined);
    return () => { weg = true; };
  }, [nachrichten]);

  // Vorschau der Bilder, die noch auf dem Gerät liegen (vor dem Senden und im Ausgangsfach).
  useEffect(() => {
    const m = new Map<string, string>();
    for (const d of [...dateien, ...wartend.flatMap((w) => w.dateien), ...unterwegs.flatMap((u) => u.dateien)]) {
      if (istBild(d.inhalt.type)) m.set(d.id, URL.createObjectURL(d.inhalt));
    }
    setVorschau(m);
    return () => { for (const u of m.values()) URL.revokeObjectURL(u); };
  }, [dateien, wartend, unterwegs]);

  // Was im Verlauf steht — vom Server, im Fach und unterwegs, jede Kennung einmal.
  const angekommenIds = useMemo(() => new Set((nachrichten ?? []).map((n) => n.id)), [nachrichten]);
  const anzahl = angekommenIds.size
    + wartend.filter((w) => !angekommenIds.has(w.id)).length
    + unterwegs.filter((u) => !angekommenIds.has(u.id) && !wartend.some((w) => w.id === u.id)).length;

  // Was der Server-Stand enthält, braucht die eigene Fassung nicht mehr.
  useEffect(() => {
    if (unterwegs.some((u) => angekommenIds.has(u.id))) setUnterwegs((alt) => alt.filter((u) => !angekommenIds.has(u.id)));
  }, [angekommenIds, unterwegs]);

  /*
    ROLLEN OHNE RUCKELN. Ab dem Tablet rollt der Verlauf im eigenen Rahmen
    (die Eingabe steht fest darunter), am Telefon rollt die Seite. Beim
    Öffnen steht das Neueste sofort unten; kommt etwas dazu, rollt es sanft —
    aber nur, wer schon unten war oder selbst gesendet hat. Wer oben liest,
    bleibt, wo er ist. Wird es weniger (etwa nach dem Löschen), rollt nichts.
  */
  const imRahmen = () => {
    const r = rahmen.current;
    return r && getComputedStyle(r).overflowY === 'auto' ? r : null;
  };
  const untenRef = useRef(true);
  const selbstGesendet = useRef(false);
  const vorher = useRef<{ kanal: string; anzahl: number } | null>(null);
  const ansEnde = useCallback((sanft: boolean) => {
    const r = imRahmen();
    const behavior: ScrollBehavior = sanft ? 'smooth' : 'auto';
    if (r) r.scrollTo?.({ top: r.scrollHeight, behavior });
    else window.scrollTo?.({ top: document.documentElement.scrollHeight, behavior });
  }, []);
  useEffect(() => {
    const r = rahmen.current;
    const pruefen = () => {
      const im = imRahmen();
      untenRef.current = im
        ? im.scrollHeight - im.scrollTop - im.clientHeight < 160
        : window.innerHeight + window.scrollY >= document.documentElement.scrollHeight - 160;
    };
    r?.addEventListener('scroll', pruefen, { passive: true });
    window.addEventListener('scroll', pruefen, { passive: true });
    return () => { r?.removeEventListener('scroll', pruefen); window.removeEventListener('scroll', pruefen); };
  }, []);
  useEffect(() => {
    if (nachrichten === null) return;
    const v = vorher.current;
    vorher.current = { kanal, anzahl };
    if (!v || v.kanal !== kanal) { ansEnde(false); return; }
    if (anzahl > v.anzahl && (untenRef.current || selbstGesendet.current)) ansEnde(true);
    selbstGesendet.current = false;
  }, [anzahl, kanal, nachrichten, ansEnde]);
  // Ein Bild, das nachlädt, schiebt den Verlauf — wer unten war, bleibt unten.
  const bildGeladen = useCallback(() => { if (untenRef.current) ansEnde(false); }, [ansEnde]);

  // Wie hoch die Eingabe gerade ist — am Telefon hält der Verlauf unten so viel frei (sie steht dort fest).
  const chatRef = useRef<HTMLElement>(null);
  const eingabeRef = useRef<HTMLElement | null>(null);
  useEffect(() => {
    const e = eingabeRef.current;
    const c = chatRef.current;
    if (!e || !c || typeof ResizeObserver === 'undefined') return;
    const beobachter = new ResizeObserver(() => c.style.setProperty('--eingabe-hoehe', `${e.offsetHeight}px`));
    beobachter.observe(e);
    return () => beobachter.disconnect();
  }, [kopf.sperre]);

  /*
    DIE LEISTE BEIM DARÜBERFAHREN (E77) — „sie darf den Text nicht verdecken“.

    Erst wird sie unsichtbar gemessen, dann sucht `leistenPlatz` einen freien
    Platz neben, über oder unter der Blase. Gibt es keinen, rückt der Verlauf
    auseinander: die Leiste bekommt eine eigene Zeile. Damit dabei nichts
    unter der Maus wegrutscht, bleibt die Blase, auf die man zeigt, an ihrer
    Stelle (`anker`) — der Rest rückt. Die Zeile öffnet sich auf der Seite,
    von der die Maus kommt: von oben kommend über der Blase, von unten
    darunter. So hebt das Schließen der alten das Öffnen der neuen auf, und
    auch ein kurzes Gespräch, das unten an der Eingabe steht, rutscht nicht.
  */
  const leisteJetzt = useRef<Leiste | null>(null);
  leisteJetzt.current = leiste;
  const leisteRef = useRef<HTMLDivElement>(null);
  const anker = useRef<{ id: string; oben: number } | null>(null);
  const oeffnenZeit = useRef<number | null>(null);
  const schliessenZeit = useRef<number | null>(null);
  const zeigerDrin = useRef(false);

  const warteNicht = () => {
    if (oeffnenZeit.current !== null) window.clearTimeout(oeffnenZeit.current);
    oeffnenZeit.current = null;
  };
  const schliessNicht = () => {
    if (schliessenZeit.current !== null) window.clearTimeout(schliessenZeit.current);
    schliessenZeit.current = null;
  };
  useEffect(() => () => { warteNicht(); schliessNicht(); }, []);

  const leisteAuf = useCallback((id: string) => {
    const alt = leisteJetzt.current;
    if (alt?.id === id) return;
    const blatt = blattIn(rahmen.current, id);
    if (!blatt) return;
    let seite: Leiste['seite'] = 'oben';
    const vorher = alt && zeileIn(rahmen.current, alt.id);
    // Liegt die neue über der alten, kommt die Maus von unten.
    if (vorher && (vorher.compareDocumentPosition(blatt) & Node.DOCUMENT_POSITION_PRECEDING)) seite = 'unten';
    anker.current = { id, oben: blatt.getBoundingClientRect().top };
    setLeiste({ id, seite, lage: 'messen' });
  }, []);

  /*
    HALTEN: zuerst rollt der Rahmen um die Differenz. Geht das nicht weit
    genug — ganz unten, wo eine verschwundene Zeile der Leiste den Verlauf
    kürzer macht, oder in einem kurzen Gespräch, das unten an der Eingabe
    steht —, nimmt ein Rest am Ende des Verlaufs die Höhe auf (gemessen
    11.11.2026: sonst rückte die Blase am Tablet um 44 px). Der Rest geht,
    wenn die Leiste zugeht und die Maus nicht mehr im Verlauf ist.
  */
  const rest = useRef(0);

  const leisteZu = useCallback(() => {
    warteNicht();
    anker.current = null;
    setLeiste(null);
    restSetzen(rahmen.current, rest, 0);
  }, []);

  useLayoutEffect(() => {
    // 1. Die Blase unter der Maus bleibt, wo sie war.
    const a = anker.current;
    const blatt = a && blattIn(rahmen.current, a.id);
    if (a && blatt) halten(blatt, a.oben, rahmen.current, rest);
    if (leiste?.lage !== 'messen') { anker.current = null; return; }

    // 2. Messen und einen freien Platz suchen.
    const l = leisteRef.current;
    const zeile = zeileIn(rahmen.current, leiste.id);
    const eigenesBlatt = zeile?.querySelector<HTMLElement>('.nachricht-blatt');
    const liste = zeile?.closest('.verlauf');
    const r = rahmen.current;
    if (!l || !zeile || !eigenesBlatt || !liste || !r) { setLeiste(null); return; }
    const groesse = (z: '1' | '2') => { l.dataset.zeilen = z; return { breite: l.offsetWidth, hoehe: l.offsetHeight }; };
    const eine = groesse('1');
    const zwei = groesse('2');
    l.dataset.zeilen = '1';
    const b = alsKasten(eigenesBlatt.getBoundingClientRect());
    const reaktionen = zeile.querySelector('.nachricht-reaktionen');
    const unten = reaktionen ? Math.max(b.unten, reaktionen.getBoundingClientRect().bottom) : b.unten;
    const hindernisse: Kasten[] = [...r.querySelectorAll(HINDERNISSE)]
      .filter((el) => el !== eigenesBlatt)
      .map((el) => alsKasten(el.getBoundingClientRect()));
    const v = liste.getBoundingClientRect();
    const sichtbar = r.getBoundingClientRect();
    const eingabe = eingabeRef.current;
    // Am Telefon steht die Eingabe fest über dem Verlauf — unter ihr ist nichts frei.
    const eingabeOben = eingabe && getComputedStyle(eingabe).position === 'fixed' ? eingabe.getBoundingClientRect().top : Infinity;
    const platz = leistenPlatz({
      blatt: b,
      zeile: { ...b, unten },
      eigene: zeile.dataset.eigene === 'ja',
      eine,
      zwei,
      hindernisse,
      grenze: { links: v.left, rechts: v.right, oben: Math.max(sichtbar.top, 0), unten: Math.min(sichtbar.bottom, window.innerHeight, eingabeOben) },
    });
    const z = zeile.getBoundingClientRect();
    setLeiste({ ...leiste, lage: platz ? { links: platz.links - z.left, oben: platz.oben - z.top, zeilen: platz.zeilen } : 'zeile' });
  }, [leiste]);

  // Ändert sich der Verlauf (eine Reaktion, eine neue Nachricht) oder die Breite, wird neu gesucht.
  const neuMessen = useCallback(() => {
    const l = leisteJetzt.current;
    if (!l || l.lage === 'messen') return;
    const blatt = blattIn(rahmen.current, l.id);
    if (!blatt) { setLeiste(null); return; }
    anker.current = { id: l.id, oben: blatt.getBoundingClientRect().top };
    setLeiste({ ...l, lage: 'messen' });
  }, []);
  useLayoutEffect(neuMessen, [nachrichten, wartend, unterwegs, neuMessen]);
  useEffect(() => {
    window.addEventListener('resize', neuMessen);
    return () => window.removeEventListener('resize', neuMessen);
  }, [neuMessen]);

  /*
    REAGIEREN (E77): sofort im eigenen Verlauf, der Server bestätigt im
    Hintergrund. Geht es nicht durch (kein Netz, keine Rechte mehr), steht
    die Reaktion wieder wie vorher, mit dem Grund als Meldung. Vorgemerkt
    wird nicht: eine Reaktion Stunden später hätte keinen Zusammenhang mehr.
  */
  const reagieren = useCallback(async (n: Nachricht, z: Reaktionszeichen, an: boolean) => {
    if (!user) return;
    const ich = { uid: user.uid, name: user.name };
    const umschalten = (wert: boolean) =>
      setNachrichten((alt) => alt && alt.map((x) => (x.id === n.id ? mitReaktion(x, z, wert, ich) : x)));
    umschalten(an);
    try {
      await nachrichtReagieren(n.id, z, an);
    } catch (e) {
      umschalten(!an);
      toast.error(grundAus(e, 'Die Reaktion ging nicht durch.'));
    }
    void laden(true);
  }, [user, toast, laden]);

  async function handlung(n: Nachricht, h: Handlung) {
    if (h === 'kopieren') {
      if (await textKopieren(n.text ?? '')) toast.success('Text kopiert');
      else toast.error('Kopieren geht hier nicht — bitte den Text markieren.');
      return;
    }
    setAuftrag({ n, schritt: h });
  }

  // Das Schreibfeld wächst mit dem Text bis zur Obergrenze im Stil (max-height), dann rollt es.
  useEffect(() => {
    const f = eingabe.current;
    if (!f) return;
    f.style.height = 'auto';
    f.style.height = `${f.scrollHeight + 2}px`;
  }, [text]);

  async function aeltere() {
    if (!weiter) return;
    setMehrLaeuft(true);
    try {
      const seite = await verlauf(kanal, weiter);
      setNachrichten((alt) => [...(alt ?? []), ...seite.nachrichten]);
      setWeiter(seite.weiter);
    } catch (e) {
      setFehler(grundAus(e, 'Ältere Nachrichten konnten nicht geladen werden.'));
    } finally {
      setMehrLaeuft(false);
    }
  }

  async function hinaus(u: Unterwegs) {
    setUnterwegs((alt) => [...alt.filter((x) => x.id !== u.id), { ...u, stand: 'laeuft', grund: undefined }]);
    try {
      const stand = await nachrichtSenden({
        id: u.id, kanal, privat, companyId, text: u.text, dateien: u.dateien, erwaehnt: u.erwaehnt,
      });
      if (stand === 'queued') {
        // Erst wenn das Fach sie zeigt, geht die eigene Fassung weg — nie eine Lücke.
        await wartendeLaden();
        setUnterwegs((alt) => alt.filter((x) => x.id !== u.id));
      } else {
        setUnterwegs((alt) => alt.map((x) => (x.id === u.id ? { ...x, stand: 'gesendet' } : x)));
        await laden(true);
      }
    } catch (e) {
      setUnterwegs((alt) => alt.map((x) => (x.id === u.id
        ? { ...x, stand: 'fehler', grund: grundAus(e, 'Der Server hat sie nicht angenommen.') } : x)));
    }
  }

  function senden() {
    const inhalt = text.trim();
    if (!inhalt && dateien.length === 0) return;
    const u: Unterwegs = {
      id: crypto.randomUUID(),
      text: inhalt,
      dateien,
      erwaehnt: kopf.art === 'direkt' ? [] : erwaehnteIn(inhalt, personen),
      stand: 'laeuft',
    };
    setText('');
    setDateien([]);
    setDateiFehler(null);
    selbstGesendet.current = true;
    void hinaus(u);
    eingabe.current?.focus();
  }

  function dateienGewaehlt(liste: FileList | null) {
    if (!liste) return;
    const neu: NeueDatei[] = [];
    const abgewiesen: string[] = [];
    for (const f of Array.from(liste)) {
      const grund = dateiPruefen(f);
      if (grund) abgewiesen.push(grund);
      else neu.push({ id: crypto.randomUUID(), name: f.name, inhalt: f });
    }
    setDateien((alt) => [...alt, ...neu]);
    setDateiFehler(abgewiesen.length ? abgewiesen.join(' ') : null);
    if (dateiWahl.current) dateiWahl.current.value = '';
  }

  const aufsteigend = useMemo(() => [...(nachrichten ?? [])].reverse(), [nachrichten]);
  // Was im Fach liegt, steht nicht noch einmal als „unterwegs“ da — und nicht, sobald der Server es hat.
  const angekommen = useMemo(() => new Set((nachrichten ?? []).map((n) => n.id)), [nachrichten]);
  const imFach = wartend.filter((w) => !angekommen.has(w.id));
  const unterwegsSichtbar = unterwegs.filter((u) => !angekommen.has(u.id) && !imFach.some((w) => w.id === u.id));

  /*
    EINE ZEILE JE NACHRICHT, IN DER REIHENFOLGE DES VERLAUFS — die vom
    Server, dann die vorgemerkten, dann die gerade gesendeten. Für jede
    steht fest, ob über ihr ein neuer Tag beginnt und ob sie eine Gruppe
    eröffnet (anderer Absender, anderer Tag oder mehr als fünf Minuten).
  */
  const jetzt = Date.now();
  const eintraege: Eintrag[] = [
    // Die eigenen tragen „ich“ wie die vorgemerkten und unterwegs — sonst beginnt mit der Bestätigung eine andere Gruppe, und der Abstand springt.
    ...aufsteigend.map((n): Eintrag => ({ art: 'server', id: n.id, eigene: n.eigene, von: n.eigene ? 'ich' : n.vonUid ?? `weg:${n.id}`, zeit: n.gesendetAm, n })),
    ...imFach.map((w): Eintrag => ({ art: 'fach', id: w.id, eigene: true, von: 'ich', zeit: new Date(w.seit).toISOString(), w })),
    ...unterwegsSichtbar.map((u): Eintrag => ({ art: 'unterwegs', id: u.id, eigene: true, von: 'ich', zeit: new Date(jetzt).toISOString(), u })),
  ];

  const anhaenge = (n: Nachricht) => n.anhaenge.length > 0 && (
    <div className="nachricht-anhaenge">
      {n.anhaenge.map((a) => {
        const url = adressen.get(`${a.eimer}/${a.pfad}`);
        if (istBild(a.inhaltsart) && url) {
          return (
            <a key={a.id} href={url} target="_blank" rel="noreferrer" aria-label={`${a.name} öffnen`}>
              <img src={url} alt={a.name} className="nachricht-bild" loading="lazy" onLoad={bildGeladen} />
            </a>
          );
        }
        return url ? (
          <a key={a.id} href={url} target="_blank" rel="noreferrer" className="nachricht-datei">
            <Icon name="file" size={18} aria-hidden="true" />
            <span className="nachricht-datei-name">{a.name}</span>
            <span className="nachricht-datei-groesse">{groesseText(a.bytes)}</span>
          </a>
        ) : (
          <span key={a.id} className="nachricht-datei">
            <Icon name="file" size={18} aria-hidden="true" />
            <span className="nachricht-datei-name">{a.name}</span>
          </span>
        );
      })}
    </div>
  );

  const lokaleDateien = (liste: { id: string; name: string; inhalt: Blob }[]) => liste.length > 0 && (
    <div className="nachricht-anhaenge">
      {liste.map((d) => (vorschau.get(d.id)
        ? <img key={d.id} src={vorschau.get(d.id)} alt={d.name} className="nachricht-bild" />
        : (
          <span key={d.id} className="nachricht-datei">
            <Icon name="file" size={18} aria-hidden="true" />
            <span className="nachricht-datei-name">{d.name}</span>
          </span>
        )))}
    </div>
  );

  /** Gehören zwei aufeinanderfolgende Einträge in eine Gruppe (dieselbe Person, derselbe Tag, kurz nacheinander)? */
  const zusammen = (a: Eintrag, b: Eintrag) =>
    tagVon(a.zeit) === tagVon(b.zeit) && a.von === b.von && Date.parse(b.zeit) - Date.parse(a.zeit) <= GRUPPE_MS;
  /** Die letzte eigene Nachricht im Verlauf — nur unter ihr steht, ob sie gesendet ist (wie bei Apple „Zugestellt“). */
  const letzteEigene = [...eintraege].reverse().find((x) => x.eigene);

  const zeile = (e: Eintrag, i: number) => {
    const vorher = eintraege[i - 1];
    const naechste = eintraege[i + 1];
    const neuerTag = !vorher || tagVon(vorher.zeit) !== tagVon(e.zeit);
    const anfang = !vorher || !zusammen(vorher, e);
    const ende = !naechste || !zusammen(e, naechste);
    /*
      DIE ZEIT STEHT ÜBER DER GRUPPE, NICHT IN JEDER BLASE (E71, 09.11.2026):
      am Tageswechsel und nach einer längeren Pause eine leise Zeile
      „Heute 13:30“ — wie bei Apple. Jede Blase mit eigener Uhrzeit machte das
      Gespräch unruhig. Den genauen Zeitpunkt jeder Nachricht nennt ihr
      Fenster (Antippen) und der Vorleser.
    */
    const zeitKopf = neuerTag || Date.parse(e.zeit) - Date.parse(vorher.zeit) > PAUSE_MS;
    const status = e === letzteEigene && e.art !== 'fach' && !(e.art === 'unterwegs' && e.u.stand === 'fehler')
      ? (e.art === 'unterwegs' && e.u.stand === 'laeuft' ? 'Wird gesendet …' : 'Gesendet')
      : null;
    // Den Namen braucht es nur, wo mehr als eine andere Person schreiben kann.
    const name = !e.eigene && anfang && kopf.art !== 'direkt' && e.art === 'server' ? e.n.vonName : null;
    const absender = e.eigene ? 'Du' : e.art === 'server' ? e.n.vonName : '';
    // Was man mit ihr tun kann — nur bei Nachrichten vom Server, gelöschte haben nichts mehr.
    const m = e.art === 'server' ? moeglichkeiten(e.n, kopf, nachrichtenAn) : null;
    const mitLeiste = !!m && irgendwas(m);
    const l = mitLeiste && leiste?.id === e.id ? leiste : null;
    const leisteHier = l && e.art === 'server' && m && (
      <NachrichtLeiste
        ref={leisteRef}
        n={e.n}
        m={m}
        zeilen={typeof l.lage === 'object' ? l.lage.zeilen : 1}
        schwebend={l.lage !== 'zeile'}
        seite={l.seite}
        style={l.lage === 'messen' ? { visibility: 'hidden', left: 0, top: 0 } : typeof l.lage === 'object' ? { left: l.lage.links, top: l.lage.oben } : undefined}
        onReagieren={(z, an) => void reagieren(e.n, z, an)}
        onHandlung={(h) => void handlung(e.n, h)}
      />
    );
    return (
      <li
        key={e.id}
        className="nachricht"
        data-nachricht={e.id}
        data-eigene={e.eigene ? 'ja' : undefined}
        data-anfang={anfang ? 'ja' : undefined}
        data-ende={ende ? 'ja' : undefined}
        onPointerEnter={mitLeiste ? (ev) => {
          // Mit dem Finger gibt es kein Darüberfahren — dort öffnet langes Drücken.
          if (ev.pointerType === 'touch') return;
          warteNicht();
          oeffnenZeit.current = window.setTimeout(() => { oeffnenZeit.current = null; leisteAuf(e.id); }, LEISTE_MS);
        } : undefined}
        onPointerLeave={mitLeiste ? warteNicht : undefined}
        // Nur mit der Tastatur: auch ein Tipp setzt den Fokus, und am Handy öffnet langes Drücken.
        onFocus={mitLeiste ? (ev) => { if (ev.target.matches(':focus-visible')) { warteNicht(); leisteAuf(e.id); } } : undefined}
        onBlur={mitLeiste ? (ev) => {
          // Weiter in der Leiste oder zur nächsten Nachricht: dort entscheidet deren Fokus.
          if (ev.relatedTarget instanceof Node && ev.currentTarget.contains(ev.relatedTarget)) return;
          if (ev.relatedTarget instanceof Element && ev.relatedTarget.closest('li[data-nachricht]')) return;
          if (leisteJetzt.current?.id === e.id && !zeigerDrin.current) leisteZu();
        } : undefined}
      >
        {zeitKopf && (
          <div className="verlauf-tag">
            <span><span className="verlauf-tag-tag">{tagText(e.zeit)}</span> {uhrText(e.zeit)}</span>
          </div>
        )}
        {name && <div className="nachricht-von" aria-hidden="true">{name}</div>}
        {e.art === 'server' && (
          <div className="nachricht-blatt" data-weg={e.n.geloeschtAm ? 'ja' : undefined}>
            {!e.n.geloeschtAm && anhaenge(e.n)}
            <button
              type="button"
              className="nachricht-ziel"
              {...(mitLeiste ? langDruck(() => { leisteZu(); setAuftrag({ n: e.n, schritt: 'wahl' }); }) : {})}
              /*
                Maus und Finger öffnen hier nichts mehr (E77): die Maus hat die
                Leiste, der Finger das lange Drücken. Mit der Tastatur oder der
                Vorlesehilfe (ein Klick ohne Zeiger, `detail` 0) öffnet sich die
                Wahl mit allen Möglichkeiten beim Namen.
              */
              onClick={(ev) => { if (mitLeiste && ev.detail === 0) setAuftrag({ n: e.n, schritt: 'wahl' }); }}
              aria-label={`Nachricht von ${e.eigene ? 'dir' : e.n.vonName}, ${zeitText(e.n.gesendetAm)}${mitLeiste ? ' — Möglichkeiten' : ''}`}
            >
              <span className="sr-only">{absender}: </span>
              {e.n.geloeschtAm
                ? <span className="nachricht-weg">{e.n.vonUid ? 'Nachricht gelöscht' : 'Nachricht eines gelöschten Kontos'}</span>
                : e.n.text && <span className="nachricht-text">{e.n.text}</span>}
              {(e.n.gemeldet || e.n.uebernommen || (e.n.bearbeitetAm && !e.n.geloeschtAm)) && (
                <span className="nachricht-meta">
                  {e.n.gemeldet && <span>gemeldet</span>}
                  {e.n.uebernommen && <span>in die Baustelle übernommen</span>}
                  {e.n.bearbeitetAm && !e.n.geloeschtAm && <span>bearbeitet</span>}
                </span>
              )}
            </button>
          </div>
        )}
        {e.art === 'server' && !e.n.geloeschtAm && (
          <ReaktionsKaestchen
            reaktionen={e.n.reaktionen}
            ichUid={user?.uid}
            kannSetzen={!kopf.sperre}
            onUmschalten={(z, an) => void reagieren(e.n, z, an)}
            langDruck={() => langDruck(() => { leisteZu(); setAuftrag({ n: e.n, schritt: 'reaktionen' }); })}
          />
        )}
        {/*
          EINE STELLE IM BAUM, ob schwebend oder in eigener Zeile (E78): so
          bleibt es dasselbe Element, und es blendet nur einmal ein — nicht
          bei jedem Neumessen (etwa nach einer Reaktion). Über oder unter der
          Blase ordnet die Zeile per `order` (lot-nachrichten.css).
        */}
        {leisteHier}
        {e.art === 'fach' && (
          <div className="nachricht-blatt" data-lokal="ja">
            {lokaleDateien(e.w.dateien)}
            <div className="nachricht-ziel">
              <span className="sr-only">Du: </span>
              {e.w.text && <span className="nachricht-text">{e.w.text}</span>}
              <span className="nachricht-meta"><Zustand stand="offen">auf diesem Gerät vorgemerkt, wird gesendet</Zustand></span>
            </div>
          </div>
        )}
        {e.art === 'unterwegs' && (
          <>
            {/* Unterwegs steht sie schon so da, wie sie bleibt — nur Abgelehntes ist hell. */}
            <div className="nachricht-blatt" data-lokal={e.u.stand === 'fehler' ? 'ja' : undefined}>
              {lokaleDateien(e.u.dateien)}
              {/* Derselbe Aufbau wie die bestätigte Nachricht: der Wechsel ändert keine Höhe. */}
              <div className="nachricht-ziel">
                <span className="sr-only">Du: </span>
                {e.u.text && <span className="nachricht-text">{e.u.text}</span>}
                {e.u.stand === 'fehler' && (
                  <span className="nachricht-meta"><Zustand stand="schlecht">Nicht gesendet: {e.u.grund}</Zustand></span>
                )}
              </div>
            </div>
            {e.u.stand === 'fehler' && (
              <div className="nachricht-nochmal">
                <Button variant="ghost" groesse="klein" onClick={() => setUnterwegs((alt) => alt.filter((x) => x.id !== e.u.id))}>Verwerfen</Button>
                <Button variant="secondary" groesse="klein" onClick={() => void hinaus(e.u)}>Erneut senden</Button>
              </div>
            )}
          </>
        )}
        {/*
          OHNE SPRINGEN (E65): „Wird gesendet …“ und „Gesendet“ sind gleich
          hoch, und die bestätigte Nachricht ersetzt die unterwegs an Ort und
          Stelle — die Zeile darunter bleibt, nur ihr Wort wechselt.
        */}
        {status && <div className="nachricht-status" aria-live="polite">{status}</div>}
      </li>
    );
  };

  const leer = eintraege.length === 0;
  const kannSenden = !!text.trim() || dateien.length > 0;
  const amSchreibtisch = mitMausUndTastatur();

  return (
    <>
    <section className="chat" aria-label={kopf.titel} ref={chatRef}>
      {mitTitel && (
        <div className="chat-kopf">
          <span className="chat-kuerzel" data-art={kopf.art} aria-hidden="true">
            {kopf.art === 'baustelle' ? <Icon name="building" size={18} /> : kuerzel(kopf.titel)}
          </span>
          <span className="chat-kopf-text">
            <span className="chat-kopf-titel">{kopf.titel}</span>
            <span className="chat-kopf-art">{ART_TEXT[kopf.art]}{kopf.stumm ? ' · stumm' : ''}</span>
          </span>
        </div>
      )}
      <div className="gespraech">
        <div
          className="gespraech-verlauf"
          ref={rahmen}
          onPointerEnter={(ev) => { if (ev.pointerType !== 'touch') { zeigerDrin.current = true; schliessNicht(); } }}
          onPointerLeave={(ev) => {
            if (ev.pointerType === 'touch') return;
            zeigerDrin.current = false;
            warteNicht();
            schliessNicht();
            // Wer mit der Tastatur in der Leiste steht, behält sie.
            schliessenZeit.current = window.setTimeout(() => {
              schliessenZeit.current = null;
              if (!rahmen.current?.contains(document.activeElement)) leisteZu();
            }, LEISTE_MS);
          }}
        >
          {fehler && (
            <div className="px-4 py-4">
              <ErrorState message={fehler} onRetry={() => setVersuch((v) => v + 1)} />
            </div>
          )}
          {!fehler && nachrichten === null && <SkeletonList rows={4} />}
          {nachrichten !== null && (
            <>
              {weiter && <MehrAnzeigen anzahl={null} laedt={mehrLaeuft} onClick={() => void aeltere()} />}
              <ol className="verlauf" aria-label="Verlauf">
                {leer && (
                  <li className="verlauf-leer">
                    Noch keine Nachricht. Was hier steht, lesen {privat ? 'nur die Teilnehmer' : 'alle, die diese Baustelle sehen'}.
                  </li>
                )}
                {eintraege.map(zeile)}
              </ol>
            </>
          )}
        </div>

        {kopf.sperre ? (
          <p className="eingabe eingabe-gesperrt" ref={(el) => { eingabeRef.current = el; }}>{kopf.sperre}</p>
        ) : (
          <form className="eingabe" ref={(el) => { eingabeRef.current = el; }} onSubmit={(ev) => { ev.preventDefault(); senden(); }}>
            {dateien.length > 0 && (
              <div className="eingabe-dateien" aria-label="Anhänge">
                {dateien.map((d) => (
                  <span key={d.id} className="eingabe-datei">
                    {vorschau.get(d.id)
                      ? <img src={vorschau.get(d.id)} alt="" className="eingabe-datei-bild" />
                      : <Icon name="file" size={18} aria-hidden="true" />}
                    <span className="nachricht-datei-name">{d.name}</span>
                    <span className="nachricht-datei-groesse">{groesseText(d.inhalt.size)}</span>
                    <button type="button" className="chat-rund chat-rund-klein" aria-label={`${d.name} entfernen`} title="Entfernen" onClick={() => setDateien((alt) => alt.filter((x) => x.id !== d.id))}>
                      <span aria-hidden="true">×</span>
                    </button>
                  </span>
                ))}
              </div>
            )}
            {dateiFehler && <p className="text-sm text-danger" role="alert">{dateiFehler}</p>}
            <div className="eingabe-zeile">
              <input
                ref={dateiWahl}
                id="nachricht-dateien"
                type="file"
                multiple
                accept={DATEI_TYPEN.join(',')}
                className="sr-only"
                onChange={(ev) => dateienGewaehlt(ev.target.files)}
              />
              <input
                ref={kameraWahl}
                id="nachricht-kamera"
                type="file"
                accept="image/*"
                capture="environment"
                className="sr-only"
                onChange={(ev) => { dateienGewaehlt(ev.target.files); ev.target.value = ''; }}
              />
              <button type="button" className="chat-rund" aria-label="Anhang" title="Anhang" onClick={() => dateiWahl.current?.click()}>
                <Icon name="klammer" size={22} />
              </button>
              {/* Die Kamera direkt — am Telefon der häufigste Anhang; ab dem Tablet reicht der Anhang. */}
              <button type="button" className="chat-rund chat-nur-telefon" aria-label="Foto aufnehmen" title="Foto aufnehmen" onClick={() => kameraWahl.current?.click()}>
                <Icon name="kamera" size={22} />
              </button>
              {kopf.art !== 'direkt' && (
                <button type="button" className="chat-rund" aria-label="Erwähnen" title="Erwähnen" onClick={() => setErwaehnen(true)}>
                  <span aria-hidden="true" className="eingabe-at">@</span>
                </button>
              )}
              <label htmlFor="nachricht-text" className="sr-only">Nachricht</label>
              {/* Feld und Senden in einer Pille, der Pfeil rechts im Feld (E71) — wie bei Apple. */}
              <div className="eingabe-pille">
                <textarea
                  id="nachricht-text"
                  ref={eingabe}
                  className="eingabe-feld"
                  rows={1}
                  maxLength={20000}
                  value={text}
                  placeholder={privat ? 'Nachricht' : 'Nachricht an alle auf dieser Baustelle'}
                  aria-describedby={amSchreibtisch ? 'nachricht-tasten' : undefined}
                  onChange={(ev) => setText(ev.target.value)}
                  onKeyDown={(ev) => {
                    if (sendetMitTaste(ev, amSchreibtisch)) { ev.preventDefault(); senden(); }
                  }}
                />
                <button
                  type="submit"
                  className="chat-senden"
                  aria-label="Senden"
                  title={amSchreibtisch ? 'Senden (Eingabe) — neue Zeile mit Umschalt + Eingabe' : 'Senden'}
                  disabled={!kannSenden}
                >
                  <Icon name="senden" size={18} />
                </button>
              </div>
              {amSchreibtisch && <span id="nachricht-tasten" className="sr-only">Eingabe sendet, Umschalt und Eingabe beginnt eine neue Zeile.</span>}
            </div>
          </form>
        )}
      </div>

    </section>

      <NachrichtAktionen
        auftrag={auftrag}
        kopf={kopf}
        companyId={companyId}
        onClose={() => setAuftrag(null)}
        onGeaendert={() => { setAuftrag(null); void laden(true); }}
        onReagieren={(n, z, an) => void reagieren(n, z, an)}
      />
      <PersonWahl
        open={erwaehnen}
        titel="Erwähnen"
        personen={personen}
        mehrere={false}
        onClose={() => setErwaehnen(false)}
        onWahl={([p]) => {
          setErwaehnen(false);
          if (!p) return;
          setText((alt) => `${alt}${alt && !/\s$/.test(alt) ? ' ' : ''}@${p.name} `);
          eingabe.current?.focus();
        }}
      />
    </>
  );
}
