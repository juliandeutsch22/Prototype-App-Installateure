import { useCallback, useEffect, useRef, useState } from 'react';
import { postfach, type PostfachAuswahl, type PostfachZeile, type PostfachZeiger } from '@/lib/db/nachrichten';
import Card from '@/components/Card';
import { List, ListRow } from '@/components/ListRow';
import { Zustand } from '@/components/Badge';
import { Listenleiste, MehrAnzeigen, Segmente } from '@/components/LotBausteine';
import { EmptyState, ErrorState, SkeletonList } from '@/components/States';
import { NACHRICHTEN_NEU } from './NachrichtenLive';
import { ART_TEXT, zeitText } from './text';

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
  ];

  const zeile = (z: PostfachZeile) => {
    const vorschau = z.letzteText
      ? `${z.letzteEigene ? 'Du' : z.letzteVon ?? ''}: ${z.letzteText}`
      : 'Noch keine Nachricht';
    return (
      <ListRow
        key={z.kanal}
        to={`/nachrichten/${z.kanal}`}
        title={<span className={z.kanal === aktiv ? 'nachrichten-aktiv' : undefined}>{z.titel}</span>}
        subtitle={[ART_TEXT[z.art], vorschau, z.stumm ? 'stumm' : '', z.geschlossen ? 'geschlossen' : ''].filter(Boolean).join(' · ')}
        zustand={z.ungelesen > 0 ? <Zustand stand="offen">{z.ungelesen} neu</Zustand> : undefined}
        wert={<span className="font-mono text-xs text-ink-muted">{zeitText(z.zuletzt)}</span>}
      />
    );
  };

  return (
    <Card title="Gespräche" buendig>
      <Listenleiste
        reiter={<Segmente name="Gespräche" werte={reiter} wert={auswahl} onChange={setAuswahl} />}
        suche={{ id: 'nachrichten-suche', wert: eingabe, onChange: setEingabe, platzhalter: 'Name, Baustelle, Text', name: 'Gespräche suchen' }}
      />
      {fehler && (
        <div className="px-4 pb-4">
          <ErrorState message="Die Gespräche konnten nicht geladen werden." onRetry={() => setVersuch((v) => v + 1)} />
        </div>
      )}
      {!fehler && zeilen === null && <SkeletonList rows={4} />}
      {!fehler && zeilen && zeilen.length === 0 && (
        <EmptyState titel={suche ? 'Nichts gefunden' : 'Noch kein Gespräch'}>
          {suche
            ? `Kein Gespräch passt zu „${suche}“.`
            : auswahl === 'baustelle'
              ? 'Den Thread einer Baustelle öffnet „Neue Nachricht“ oder die Baustelle selbst.'
              : 'Mit „Neue Nachricht“ beginnt eines.'}
        </EmptyState>
      )}
      {!fehler && zeilen && zeilen.length > 0 && (
        <>
          <List>{zeilen.map(zeile)}</List>
          {weiter && <MehrAnzeigen anzahl={null} laedt={mehrLaeuft} onClick={() => void mehr()} />}
        </>
      )}
    </Card>
  );
}
