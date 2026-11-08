import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  anhangAdressen, gelesen, nachrichtSenden, verlauf, wartendeNachrichten,
  type KanalKopf, type Nachricht, type NeueDatei, type VerlaufZeiger, type VorgemerkteNachricht,
} from '@/lib/db/nachrichten';
import { FACH_GELEERT } from '@/lib/sync/ausgangsfach';
import { postenNeuLaden } from '@/app/offenePosten';
import Card from '@/components/Card';
import Button from '@/components/Button';
import IconButton from '@/components/IconButton';
import Icon from '@/components/Icon';
import { Zustand } from '@/components/Badge';
import { ErrorState, SkeletonList } from '@/components/States';
import { MehrAnzeigen } from '@/components/LotBausteine';
import { grundAus } from '@/lib/fehlerGrund';
import { NACHRICHTEN_NEU } from './NachrichtenLive';
import {
  dateiPruefen, DATEI_TYPEN, erwaehnteIn, groesseText, GRUPPE_MS, istBild, tagText, tagVon, uhrText, zeitText,
} from './text';
import NachrichtAktionen from './NachrichtAktionen';
import PersonWahl from './PersonWahl';

/** Was gerade auf dem Weg ist — in dieser Sitzung gesendet, noch nicht bestätigt oder abgelehnt. */
interface Unterwegs {
  id: string;
  text: string;
  dateien: NeueDatei[];
  erwaehnt: string[];
  stand: 'laeuft' | 'fehler';
  grund?: string;
}

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
 * Vorlesehilfe steht vor jeder Nachricht der Absender, auch „Du“. Das ganze
 * Blatt öffnet, was man mit ihr tun kann (bearbeiten, löschen, melden,
 * übernehmen).
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
  const [gewaehlt, setGewaehlt] = useState<Nachricht | null>(null);
  const [erwaehnen, setErwaehnen] = useState(false);
  const [versuch, setVersuch] = useState(0);
  const lauf = useRef(0);
  const ende = useRef<HTMLDivElement>(null);
  const rahmen = useRef<HTMLDivElement>(null);
  const eingabe = useRef<HTMLTextAreaElement>(null);
  const dateiWahl = useRef<HTMLInputElement>(null);
  const privat = kopf.art !== 'baustelle';

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

  const wartendeLaden = useCallback(() => {
    void wartendeNachrichten(kanal).then(setWartend).catch(() => undefined);
  }, [kanal]);

  useEffect(() => {
    setUnterwegs([]);
    setText('');
    setDateien([]);
    void laden(false);
    wartendeLaden();
  }, [laden, wartendeLaden, versuch]);

  // Neues in diesem Gespräch (Live) oder nach dem Nachsenden aus dem Ausgangsfach.
  useEffect(() => {
    const neu = (e: Event) => {
      const k = (e as CustomEvent<string | null>).detail;
      if (!k || k === kanal) void laden(true);
    };
    const fach = () => { wartendeLaden(); void laden(true); };
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

  // Beim Öffnen und bei jeder neuen Nachricht ans Ende — dort steht das Neueste.
  const anzahl = (nachrichten?.length ?? 0) + wartend.length + unterwegs.length;
  // Ab dem Tablet rollt der Verlauf im eigenen Rahmen (die Eingabe steht
  // fest darunter), am Telefon rollt die Seite.
  useEffect(() => {
    const r = rahmen.current;
    if (r && r.scrollHeight > r.clientHeight && getComputedStyle(r).overflowY === 'auto') {
      r.scrollTop = r.scrollHeight;
      return;
    }
    ende.current?.scrollIntoView?.({ block: 'end' });
  }, [anzahl, kanal]);

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
      setUnterwegs((alt) => alt.filter((x) => x.id !== u.id));
      if (stand === 'queued') wartendeLaden();
      else void laden(true);
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
    ...aufsteigend.map((n): Eintrag => ({ art: 'server', id: n.id, eigene: n.eigene, von: n.vonUid ?? `weg:${n.id}`, zeit: n.gesendetAm, n })),
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
              <img src={url} alt={a.name} className="nachricht-bild" loading="lazy" />
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

  const zeile = (e: Eintrag, i: number) => {
    const vorher = eintraege[i - 1];
    const neuerTag = !vorher || tagVon(vorher.zeit) !== tagVon(e.zeit);
    const anfang = neuerTag || vorher.von !== e.von || Date.parse(e.zeit) - Date.parse(vorher.zeit) > GRUPPE_MS;
    // Den Namen braucht es nur, wo mehr als eine andere Person schreiben kann.
    const name = !e.eigene && anfang && kopf.art !== 'direkt' && e.art === 'server' ? e.n.vonName : null;
    const absender = e.eigene ? 'Du' : e.art === 'server' ? e.n.vonName : '';
    return (
      <li
        key={e.id}
        className="nachricht"
        data-eigene={e.eigene ? 'ja' : undefined}
        data-anfang={anfang ? 'ja' : undefined}
      >
        {neuerTag && <div className="verlauf-tag"><span>{tagText(e.zeit)}</span></div>}
        {name && <div className="nachricht-von" aria-hidden="true">{name}</div>}
        {e.art === 'server' && (
          <div className="nachricht-blatt" data-weg={e.n.geloeschtAm ? 'ja' : undefined}>
            {!e.n.geloeschtAm && anhaenge(e.n)}
            <button
              type="button"
              className="nachricht-ziel"
              onClick={() => setGewaehlt(e.n)}
              aria-label={`Nachricht von ${e.eigene ? 'dir' : e.n.vonName}, ${zeitText(e.n.gesendetAm)} — Möglichkeiten`}
            >
              <span className="sr-only">{absender}: </span>
              {e.n.geloeschtAm
                ? <span className="nachricht-weg">{e.n.vonUid ? 'Nachricht gelöscht' : 'Nachricht eines gelöschten Kontos'}</span>
                : e.n.text && <span className="nachricht-text">{e.n.text}</span>}
              <span className="nachricht-meta">
                {e.n.gemeldet && <span>gemeldet</span>}
                {e.n.uebernommen && <span>in die Baustelle übernommen</span>}
                {e.n.bearbeitetAm && !e.n.geloeschtAm && <span>bearbeitet</span>}
                <span className="nachricht-zeit">{uhrText(e.n.gesendetAm)}</span>
              </span>
            </button>
          </div>
        )}
        {e.art === 'fach' && (
          <div className="nachricht-blatt">
            {lokaleDateien(e.w.dateien)}
            <span className="sr-only">Du: </span>
            {e.w.text && <p className="nachricht-text">{e.w.text}</p>}
            <span className="nachricht-meta"><Zustand stand="offen">auf diesem Gerät vorgemerkt, wird gesendet</Zustand></span>
          </div>
        )}
        {e.art === 'unterwegs' && (
          <>
            <div className="nachricht-blatt">
              {lokaleDateien(e.u.dateien)}
              <span className="sr-only">Du: </span>
              {e.u.text && <p className="nachricht-text">{e.u.text}</p>}
              <span className="nachricht-meta">
                {e.u.stand === 'laeuft'
                  ? <Zustand stand="laeuft">wird gesendet</Zustand>
                  : <Zustand stand="schlecht">Nicht gesendet: {e.u.grund}</Zustand>}
              </span>
            </div>
            {e.u.stand === 'fehler' && (
              <div className="nachricht-nochmal">
                <Button variant="ghost" groesse="klein" onClick={() => setUnterwegs((alt) => alt.filter((x) => x.id !== e.u.id))}>Verwerfen</Button>
                <Button variant="secondary" groesse="klein" onClick={() => void hinaus(e.u)}>Erneut senden</Button>
              </div>
            )}
          </>
        )}
      </li>
    );
  };

  const leer = eintraege.length === 0;
  const kannSenden = !!text.trim() || dateien.length > 0;

  return (
    <Card title={mitTitel ? kopf.titel : undefined} buendig>
      <div className="gespraech">
        <div className="gespraech-verlauf" ref={rahmen}>
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
              <div ref={ende} />
            </>
          )}
        </div>

        {kopf.sperre ? (
          <p className="eingabe eingabe-gesperrt">{kopf.sperre}</p>
        ) : (
          <form className="eingabe" onSubmit={(ev) => { ev.preventDefault(); senden(); }}>
            {dateien.length > 0 && (
              <div className="eingabe-dateien" aria-label="Anhänge">
                {dateien.map((d) => (
                  <span key={d.id} className="eingabe-datei">
                    {vorschau.get(d.id)
                      ? <img src={vorschau.get(d.id)} alt="" className="eingabe-datei-bild" />
                      : <Icon name="file" size={18} aria-hidden="true" />}
                    <span className="nachricht-datei-name">{d.name}</span>
                    <span className="nachricht-datei-groesse">{groesseText(d.inhalt.size)}</span>
                    <IconButton label={`${d.name} entfernen`} onClick={() => setDateien((alt) => alt.filter((x) => x.id !== d.id))}>
                      <span aria-hidden="true">×</span>
                    </IconButton>
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
              <IconButton label="Anhang" onClick={() => dateiWahl.current?.click()}>
                <Icon name="klammer" size={22} />
              </IconButton>
              {kopf.art !== 'direkt' && (
                <IconButton label="Erwähnen" onClick={() => setErwaehnen(true)}>
                  <span aria-hidden="true" className="eingabe-at">@</span>
                </IconButton>
              )}
              <label htmlFor="nachricht-text" className="sr-only">Nachricht</label>
              <textarea
                id="nachricht-text"
                ref={eingabe}
                className="eingabe-feld"
                rows={1}
                maxLength={20000}
                value={text}
                placeholder={privat ? 'Nachricht' : 'Nachricht an alle auf dieser Baustelle'}
                onChange={(ev) => setText(ev.target.value)}
                onKeyDown={(ev) => {
                  // Am Schreibtisch sendet Strg + Eingabe (⌘ + Eingabe); Eingabe allein macht eine neue Zeile.
                  if (ev.key === 'Enter' && (ev.ctrlKey || ev.metaKey)) { ev.preventDefault(); senden(); }
                }}
              />
              <button
                type="submit"
                className="lot-knopf eingabe-senden"
                aria-label="Senden"
                title="Senden (Strg + Eingabe)"
                disabled={!kannSenden}
              >
                <Icon name="senden" size={22} />
              </button>
            </div>
          </form>
        )}
      </div>

      <NachrichtAktionen
        nachricht={gewaehlt}
        kopf={kopf}
        companyId={companyId}
        onClose={() => setGewaehlt(null)}
        onGeaendert={() => { setGewaehlt(null); void laden(true); }}
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
    </Card>
  );
}
