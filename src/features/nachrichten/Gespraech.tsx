import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  anhangAdressen, gelesen, nachrichtSenden, verlauf, wartendeNachrichten,
  type KanalKopf, type Nachricht, type NeueDatei, type VerlaufZeiger, type VorgemerkteNachricht,
} from '@/lib/db/nachrichten';
import { FACH_GELEERT } from '@/lib/sync/ausgangsfach';
import { postenNeuLaden } from '@/app/offenePosten';
import Card from '@/components/Card';
import Button from '@/components/Button';
import { Zustand } from '@/components/Badge';
import { ErrorState, SkeletonList } from '@/components/States';
import { MehrAnzeigen } from '@/components/LotBausteine';
import { grundAus } from '@/lib/fehlerGrund';
import { NACHRICHTEN_NEU } from './NachrichtenLive';
import { dateiPruefen, DATEI_TYPEN, erwaehnteIn, groesseText, istBild, zeitText } from './text';
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

/**
 * DAS GESPRÄCH — der Verlauf von oben nach unten, die Eingabe darunter.
 *
 * Eine Nachricht ist eine Zeile: Absender und Zeit (IBM Plex Mono) über dem
 * Text, Anhänge darunter. Die eigene trägt „Du“. Die ganze Zeile öffnet,
 * was man mit ihr tun kann (bearbeiten, löschen, melden, übernehmen).
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
}: {
  kopf: KanalKopf;
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
  useEffect(() => {
    ende.current?.scrollIntoView?.({ block: 'end' });
  }, [anzahl, kanal]);

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
            {a.name} <span className="font-mono text-xs text-ink-muted">{groesseText(a.bytes)}</span>
          </a>
        ) : (
          <span key={a.id} className="nachricht-datei">{a.name}</span>
        );
      })}
    </div>
  );

  const lokaleDateien = (liste: { id: string; name: string; inhalt: Blob }[]) => liste.length > 0 && (
    <div className="nachricht-anhaenge">
      {liste.map((d) => (vorschau.get(d.id)
        ? <img key={d.id} src={vorschau.get(d.id)} alt={d.name} className="nachricht-bild" />
        : <span key={d.id} className="nachricht-datei">{d.name}</span>))}
    </div>
  );

  return (
    <Card title={kopf.titel} buendig>
      {fehler && (
        <div className="px-4 pb-4">
          <ErrorState message={fehler} onRetry={() => setVersuch((v) => v + 1)} />
        </div>
      )}
      {!fehler && nachrichten === null && <SkeletonList rows={4} />}
      {nachrichten !== null && (
        <>
          {weiter && <MehrAnzeigen anzahl={null} laedt={mehrLaeuft} onClick={() => void aeltere()} />}
          <ol className="verlauf" aria-label="Verlauf">
            {aufsteigend.length === 0 && imFach.length === 0 && unterwegsSichtbar.length === 0 && (
              <li className="nachricht text-ink-muted">Noch keine Nachricht. Was hier steht, lesen {privat ? 'nur die Teilnehmer' : 'alle, die diese Baustelle sehen'}.</li>
            )}
            {aufsteigend.map((n) => (
              <li key={n.id} className="nachricht">
                <button type="button" className="nachricht-ziel" onClick={() => setGewaehlt(n)} aria-label={`Nachricht von ${n.eigene ? 'dir' : n.vonName}, ${zeitText(n.gesendetAm)} — Möglichkeiten`}>
                  <span className="nachricht-kopf">
                    <span className="nachricht-von">{n.eigene ? 'Du' : n.vonName}</span>
                    <span className="nachricht-zeit">{zeitText(n.gesendetAm)}</span>
                    {n.bearbeitetAm && !n.geloeschtAm && <span>bearbeitet</span>}
                    {n.uebernommen && <span>in die Baustelle übernommen</span>}
                    {n.gemeldet && <span>gemeldet</span>}
                  </span>
                  {n.geloeschtAm
                    ? <span className="nachricht-weg block">{n.vonUid ? 'Nachricht gelöscht' : 'Nachricht eines gelöschten Kontos'}</span>
                    : n.text && <span className="nachricht-text block">{n.text}</span>}
                </button>
                {!n.geloeschtAm && anhaenge(n)}
              </li>
            ))}
            {imFach.map((w) => (
              <li key={w.id} className="nachricht">
                <span className="nachricht-kopf"><span className="nachricht-von">Du</span></span>
                {w.text && <p className="nachricht-text">{w.text}</p>}
                {lokaleDateien(w.dateien)}
                <p className="nachricht-stand"><Zustand stand="offen">auf diesem Gerät vorgemerkt, wird gesendet</Zustand></p>
              </li>
            ))}
            {unterwegsSichtbar.map((u) => (
              <li key={u.id} className="nachricht">
                <span className="nachricht-kopf"><span className="nachricht-von">Du</span></span>
                {u.text && <p className="nachricht-text">{u.text}</p>}
                {lokaleDateien(u.dateien)}
                {u.stand === 'laeuft' ? (
                  <p className="nachricht-stand"><Zustand stand="laeuft">wird gesendet</Zustand></p>
                ) : (
                  <div className="nachricht-stand flex flex-wrap items-center gap-2">
                    <Zustand stand="schlecht">Nicht gesendet: {u.grund}</Zustand>
                    <Button variant="secondary" groesse="klein" onClick={() => void hinaus(u)}>Erneut senden</Button>
                    <Button variant="ghost" groesse="klein" onClick={() => setUnterwegs((alt) => alt.filter((x) => x.id !== u.id))}>Verwerfen</Button>
                  </div>
                )}
              </li>
            ))}
          </ol>
          <div ref={ende} />
        </>
      )}

      {kopf.sperre ? (
        <p className="eingabe text-sm text-ink-muted">{kopf.sperre}</p>
      ) : (
        <form className="eingabe" onSubmit={(e) => { e.preventDefault(); senden(); }}>
          <label htmlFor="nachricht-text" className="sr-only">Nachricht</label>
          <textarea
            id="nachricht-text"
            ref={eingabe}
            className="min-h-touch w-full rounded border border-line-strong bg-surface px-3 py-2 text-base text-ink placeholder:text-ink-placeholder focus:border-brand-fixed focus:ring-1 focus:ring-brand-fixed"
            rows={2}
            maxLength={20000}
            value={text}
            placeholder={privat ? 'Nachricht schreiben' : 'Nachricht an alle, die diese Baustelle sehen'}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={(e) => {
              // Am Schreibtisch sendet Strg + Eingabe (⌘ + Eingabe); Eingabe allein macht eine neue Zeile.
              if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) { e.preventDefault(); senden(); }
            }}
          />
          {dateien.length > 0 && (
            <div className="eingabe-dateien" aria-label="Anhänge">
              {dateien.map((d) => (
                <span key={d.id} className="eingabe-datei">
                  {d.name} <span className="font-mono text-xs text-ink-muted">{groesseText(d.inhalt.size)}</span>
                  <Button type="button" variant="ghost" groesse="klein" onClick={() => setDateien((alt) => alt.filter((x) => x.id !== d.id))} aria-label={`${d.name} entfernen`}>
                    Entfernen
                  </Button>
                </span>
              ))}
            </div>
          )}
          {dateiFehler && <p className="text-sm text-danger" role="alert">{dateiFehler}</p>}
          <div className="eingabe-knoepfe">
            <input
              ref={dateiWahl}
              id="nachricht-dateien"
              type="file"
              multiple
              accept={DATEI_TYPEN.join(',')}
              className="sr-only"
              onChange={(e) => dateienGewaehlt(e.target.files)}
            />
            <Button type="button" variant="secondary" onClick={() => dateiWahl.current?.click()}>Anhang</Button>
            {kopf.art !== 'direkt' && (
              <Button type="button" variant="ghost" onClick={() => setErwaehnen(true)}>Erwähnen</Button>
            )}
            <Button type="submit" className="eingabe-senden" disabled={!text.trim() && dateien.length === 0}>Senden</Button>
          </div>
        </form>
      )}

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
