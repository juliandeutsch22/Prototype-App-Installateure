import { useEffect, useState } from 'react';
import { useAuth } from '@/app/AuthContext';
import { ladeLauf } from '@/lib/db/laeufe';
import { beurteile, type Lauf, type NachtLaufArt } from '@shared/laufStatus';

/**
 * Was ein nächtlicher Lauf zuletzt getan hat.
 *
 * WOZU DIESE ZEILE. Ausleitung (02:30) und Bilanzlauf (03:15) arbeiten
 * unbeaufsichtigt. Scheiterten sie, stand das im Google-Protokoll und sonst
 * nirgends — und dorthin sieht in einem Installationsbetrieb niemand.
 *
 * DREI ZUSTÄNDE, und der dritte ist der wichtigste:
 *
 *   GUT           — lief zuletzt vor n Stunden durch.
 *   ÜBERFÄLLIG    — der letzte Erfolg ist zwei Nächte her.
 *   UNBEKANNT     — es ist nichts festgehalten.
 *
 * „Unbekannt" ist NICHT „gut". Ein Betrieb ohne Aufzeichnung sieht genauso
 * aus wie einer, bei dem nie etwas lief — und beides heisst: es gibt keine
 * Sicherung, von der jemand weiss.
 */
export default function LaufStatus({ art }: { art: NachtLaufArt }) {
  const { user } = useAuth();
  const [lauf, setLauf] = useState<Lauf<NachtLaufArt> | undefined>();
  const [geladen, setGeladen] = useState(false);

  /*
    AN DER MANDANTEN-KENNUNG, nicht am `user`-OBJEKT.

    Der Effekt braucht genau einen Wert daraus. Hinge er am Objekt, liefe er
    bei jedem Kontext neu, der einen frischen Wert liefert — Laden, Zustand
    setzen, neu zeichnen, wieder laden. Das ist keine theoretische Sorge: der
    Testlauf ist genau daran hängengeblieben, und ein `AuthContext`, der
    seinen Wert nicht merkt, täte im Betrieb dasselbe.
  */
  const companyId = user?.companyId;

  useEffect(() => {
    if (!companyId) return;
    let weg = false;
    void ladeLauf(companyId, art).then((l) => {
      if (weg) return;
      setLauf(l);
      setGeladen(true);
    });
    return () => {
      weg = true;
    };
  }, [companyId, art]);

  // Solange nichts geladen ist, wird auch nichts behauptet: eine Zeile
  // „unbekannt", die gleich zu „gut" wird, ist ein Fehlalarm im Sekundentakt.
  if (!geladen) return null;

  const u = beurteile(lauf, Date.now());
  const farbe =
    u.stand === 'gut'
      ? 'border-line text-ink-muted'
      : 'border-warning/40 bg-warning-bg text-warning';

  return (
    <p
      className={`rounded-sm border px-3 py-2 text-sm ${farbe}`}
      /*
        `status`, nicht `alert`.

        `alert` unterbricht den Vorleser mitten im Satz. Das ist richtig für
        die Meldung auf der Startseite, die jemanden von etwas anderem
        wegholen soll — hier steht der Nutzer bereits auf der Seite und sieht
        genau darauf. Eine stehende Zustandszeile berichtet, sie unterbricht
        nicht.

        Nebenbei stand dadurch zweimal `alert` auf derselben Seite, sobald ein
        Fehler dazukam; ein bestehender Test hat das gemeldet.
      */
      role={u.stand === 'gut' ? undefined : 'status'}
    >
      {u.text}
      {lauf?.kennzahl != null && lauf.kennzahl > 0 && u.stand === 'gut' && (
        <>
          {' '}
          <span className="tnum">{lauf.kennzahl.toLocaleString('de-AT')}</span>{' '}
          {lauf.kennzahlEinheit}.
        </>
      )}
      {/*
        WO DIE SICHERUNG LIEGT — und das ist keine Nebensache.

        Ohne eingerichteten Zielspeicher schreibt die Ausleitung in dasselbe
        Projekt wie die Daten. Gegen einen Fehlgriff hilft das sofort; gegen
        „der Zugang zum Projekt ist weg" gar nicht. Bis hierher stand diese
        halbe Wirkung allein in `docs/DEPLOYMENT.md` — eine Sicherung, deren
        Grenze man nur durch Lesen einer Datei erfährt, hält man für ganz.

        NUR BEI `false`, nicht bei `undefined`: ein Lauf, der es noch nicht
        mitteilt, ist kein Befund, sondern eine ältere Fassung. Und nicht
        gelb: es ist eine Einrichtungsgrenze, kein Fehler — gelb neben einem
        „lief durch" hiesse, da sei etwas kaputt.

        DER DRITTE FALL BRAUCHT HIER NICHTS: ist ein Ziel eingerichtet und
        die Ablage scheitert, ist der LAUF gescheitert. Dann steht unten
        „Letzter Versuch: …" mit der Antwort des Zielspeichers — und das ist
        die richtige Stelle, weil es ein Ausfall ist und keine Grenze.
      */}
      {art === 'ausleitung' && lauf?.zielExtern === false && (
        <span className="mt-1 block text-xs text-ink-muted">
          Der Stand liegt im selben Projekt wie die Daten. Gegen einen Fehlgriff hilft das,
          gegen einen Verlust des Zugangs nicht — dafür muss ein Zielspeicher ausserhalb
          eingerichtet sein (siehe DEPLOYMENT.md).
        </span>
      )}
      {/*
        Die Meldung des letzten Versuchs steht nur dann da, wenn er scheiterte
        — sonst wäre sie eine Fehlermeldung an einem Tag, an dem alles ging.
      */}
      {lauf?.erfolg === false && lauf.meldung && (
        <span className="mt-1 block">Letzter Versuch: {lauf.meldung}</span>
      )}
    </p>
  );
}
