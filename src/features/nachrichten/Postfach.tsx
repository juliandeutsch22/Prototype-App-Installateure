import { useCallback, useEffect, useRef, useState } from 'react';
import { postfach, type PostfachAuswahl, type PostfachZeile, type PostfachZeiger } from '@/lib/db/nachrichten';
import { Link } from 'react-router-dom';
import Icon from '@/components/Icon';
import { MehrAnzeigen } from '@/components/LotBausteine';
import { EmptyState, ErrorState, SkeletonList } from '@/components/States';
import { NACHRICHTEN_NEU } from './NachrichtenLive';
import { ART_TEXT, kuerzel, zeitText } from './text';

/**
 * DER POSTEINGANG — die Gespräche, in denen man ist, und die Baustellen,
 * denen man folgt. Jüngstes zuerst, seitenweise vom Server; die Suche geht
 * über Titel und Text, nur in den eigenen Gesprächen.
 *
 * Die Zahl an der Zeile ist die eigene der ungelesenen Nachrichten — wer
 * sonst gelesen hat, zeigt die App nicht (D4).
 */
export default function Postfach({
  aktiv,
  direktAn,
}: {
  /** Das offene Gespräch — am Tablet und Schreibtisch hervorgehoben. */
  aktiv?: string;
  /** Sind Direktnachrichten eingeschaltet? Ohne sie gibt es den Reiter „Direkt“ nur, wenn es private Gespräche gibt. */
  direktAn: boolean;
}) {
  const [auswahl, setAuswahl] = useState<PostfachAuswahl>('alle');
  const [eingabe, setEingabe] = useState('');
  const [suche, setSuche] = useState('');
  const [zeilen, setZeilen] = useState<PostfachZeile[] | null>(null);
  const [weiter, setWeiter] = useState<PostfachZeiger | null>(null);
  const [fehler, setFehler] = useState(false);
  const [mehrLaeuft, setMehrLaeuft] = useState(false);
  const [versuch, setVersuch] = useState(0);
  const lauf = useRef(0);

  // Getippt wird sofort, gesucht nach einer kurzen Pause.
  useEffect(() => {
    const t = setTimeout(() => setSuche(eingabe.trim()), 300);
    return () => clearTimeout(t);
  }, [eingabe]);

  const laden = useCallback((still: boolean) => {
    const meiner = ++lauf.current;
    if (!still) { setZeilen(null); setFehler(false); }
    postfach(auswahl, suche)
      .then((seite) => {
        if (meiner !== lauf.current) return;
        setZeilen(seite.zeilen);
        setWeiter(seite.weiter);
        setFehler(false);
      })
      .catch(() => { if (meiner === lauf.current && !still) setFehler(true); });
  }, [auswahl, suche]);

  useEffect(() => { laden(false); }, [laden, versuch]);

  // Neues in einem Gespräch: still nachladen, die Liste bleibt stehen.
  useEffect(() => {
    const neu = () => laden(true);
    window.addEventListener(NACHRICHTEN_NEU, neu);
    return () => window.removeEventListener(NACHRICHTEN_NEU, neu);
  }, [laden]);

  async function mehr() {
    if (!weiter) return;
    setMehrLaeuft(true);
    try {
      const seite = await postfach(auswahl, suche, weiter);
      setZeilen((alt) => [...(alt ?? []), ...seite.zeilen]);
      setWeiter(seite.weiter);
    } catch {
      setFehler(true);
    } finally {
      setMehrLaeuft(false);
    }
  }

  const reiter: { wert: PostfachAuswahl; text: string }[] = [
    { wert: 'alle', text: 'Alle' },
    ...(direktAn || auswahl === 'privat' ? [{ wert: 'privat' as const, text: 'Direkt' }] : []),
    { wert: 'baustelle', text: 'Baustellen' },
    { wert: 'ungelesen', text: 'Ungelesen' },
  ];

  const zeile = (z: PostfachZeile) => {
    // Im Direktgespräch ist klar, wer schreibt, wenn nicht man selbst.
    const wer = z.letzteEigene ? 'Du: ' : z.art !== 'direkt' && z.letzteVon ? `${z.letzteVon}: ` : '';
    const vorschau = z.letzteText ? `${wer}${z.letzteText}` : 'Noch keine Nachricht';
    return (
      <li
        key={z.kanal}
        className="postfach-zeile"
        data-art={z.art}
        data-aktiv={z.kanal === aktiv ? 'ja' : undefined}
        data-neu={z.ungelesen > 0 ? 'ja' : undefined}
      >
        <span className="postfach-kuerzel" aria-hidden="true">
          {z.art === 'baustelle' ? <Icon name="building" size={20} /> : kuerzel(z.titel)}
        </span>
        <span className="postfach-text">
          <span className="postfach-oben">
            <Link
              to={`/nachrichten/${z.kanal}`}
              className="postfach-titel"
              aria-current={z.kanal === aktiv ? 'page' : undefined}
            >
              {z.titel}
            </Link>
            <span className="postfach-zeit">{zeitText(z.zuletzt)}</span>
          </span>
          <span className="postfach-unten">
            <span className="postfach-vorschau"><span className="sr-only">{ART_TEXT[z.art]} · </span>{vorschau}</span>
            {z.stumm && <span className="postfach-marke">stumm</span>}
            {z.geschlossen && <span className="postfach-marke">geschlossen</span>}
            {z.ungelesen > 0 && (
              <span className="postfach-zahl">{z.ungelesen}<span className="sr-only"> neu</span></span>
            )}
          </span>
        </span>
      </li>
    );
  };

  return (
    <section className="postfach" aria-label="Gespräche">
      <div className="postfach-leiste">
        <label className="chat-suche">
          <Icon name="lupe" size={20} aria-hidden="true" />
          <span className="sr-only">Gespräche suchen</span>
          <input
            id="nachrichten-suche"
            type="search"
            value={eingabe}
            onChange={(e) => setEingabe(e.target.value)}
            placeholder="Personen, Baustellen, Text"
            autoComplete="off"
          />
        </label>
        <div className="chat-chips" role="group" aria-label="Auswahl">
          {reiter.map((r) => (
            <button
              key={r.wert}
              type="button"
              className="chat-chip"
              aria-pressed={auswahl === r.wert}
              onClick={() => setAuswahl(r.wert)}
            >
              {r.text}
            </button>
          ))}
        </div>
      </div>
      <div className="postfach-blatt">
        {fehler && (
          <div className="p-4">
            <ErrorState message="Die Gespräche konnten nicht geladen werden." onRetry={() => setVersuch((v) => v + 1)} />
          </div>
        )}
        {!fehler && zeilen === null && <SkeletonList rows={4} />}
        {!fehler && zeilen && zeilen.length === 0 && (
          <EmptyState titel={suche ? 'Nichts gefunden' : auswahl === 'ungelesen' ? 'Alles gelesen' : 'Noch kein Gespräch'}>
            {suche
              ? `Kein Gespräch passt zu „${suche}“.`
              : auswahl === 'ungelesen'
                ? 'Keine neue Nachricht.'
                : auswahl === 'baustelle'
                  ? 'Den Thread einer Baustelle öffnet „Neue Nachricht“ oder die Baustelle selbst.'
                  : 'Mit „Neue Nachricht“ beginnt eines.'}
          </EmptyState>
        )}
        {!fehler && zeilen && zeilen.length > 0 && (
          <>
            <ul aria-label="Gespräche">{zeilen.map(zeile)}</ul>
            {weiter && <MehrAnzeigen anzahl={null} laedt={mehrLaeuft} onClick={() => void mehr()} />}
          </>
        )}
      </div>
    </section>
  );
}
