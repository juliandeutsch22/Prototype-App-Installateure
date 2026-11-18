import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useNavigate } from 'react-router-dom';
import { AbschnittBlock } from './Handlungsbedarf';
import StartKarte from './StartKarte';
import { abschnitt, type Zeile } from './abschnitte';
import { datumAT } from '@/lib/datum';
import { fehlenText } from '@/features/assignments/besetzung';
import MonatsVorschau from '@/features/assignments/MonatsVorschau';
import { DB_QUELLE, type MonatsQuelle } from '@/features/assignments/monatsQuelle';
import { vorschauInhalt, type ProjektKurz, type TagesDaten } from '@/features/assignments/monatsVorschau';
import { useHandy, useRuestText } from '@/features/assignments/vorschauDaten';
import { bezugText } from '@/features/termine/terminText';
import type { Assignment, Project } from '@/types';
import { ZIEL } from './ziele';
import type { Abwesend } from './laden';
import type { TagesBaustelle } from './regeln';

/** Was die Vorschau eines Einsatzes von der Startseite braucht (E98). */
export interface EinsatzVorschauGrund {
  betrieb: string;
  /** Die laufenden Baustellen, die die Startseite schon hat — für Adresse und Akte. */
  projekte: Project[];
  namen: { uid: string; name: string }[];
  materialAn: boolean;
  /** Darf die Person die Baustellenakte öffnen? Dann „Baustelle öffnen“. */
  baustelleSichtbar: boolean;
  /** Darf sie einteilen? Dann „Bearbeiten“ — in der Tagesplanung, mit dieser Baustelle gewählt. */
  darfBearbeiten: boolean;
  /** Woher die Vorschau lädt; die Musterseite und Tests geben ihre eigene Quelle. */
  quelle?: MonatsQuelle;
}

interface Offen {
  nummer: string;
  name: string;
  anker: HTMLButtonElement;
  klickX: number | null;
}

/**
 * HEUTE, AUS SICHT DER LEITUNG (Skizzen 04, 05): wer fehlt und wer wo ist,
 * je höchstens drei. Alles Weitere steht in der Einsatzplanung, Tag heute.
 *
 * EIN EINSATZ ÖFFNET SEINE VORSCHAU (E98, Auftrag 18.11.2026): bis dahin
 * führte jede Zeile auf den Tag der Planung, und dort stand nicht, um welchen
 * Einsatz es ging. Jetzt öffnet sie dasselbe Fenster wie ein Balken im Monat
 * — Zeit, Adresse, Eingeteilte, Aufgabe, Rüstliste, wer fehlt. Geplant wird
 * dort nicht: „Bearbeiten“ führt in die Tagesplanung, die Baustelle schon
 * gewählt (derselbe Weg wie aus der Woche), sonst gäbe es einen zweiten
 * Schreibweg neben dem Formular.
 */
export default function HeuteLeitung({
  heute,
  abwesend,
  tag,
  vorschau,
}: {
  heute: string;
  abwesend: Abwesend[];
  tag: TagesBaustelle[];
  /** Ohne bleiben die Einsätze Verweise auf den Tag (etwa ohne Betrieb). */
  vorschau?: EinsatzVorschauGrund;
}) {
  const imEinsatz = tag.filter((b) => !b.unbesetzt);
  const personen = new Set(imEinsatz.flatMap((b) => b.namen)).size;
  const [offen, setOffen] = useState<Offen | null>(null);
  const [oeffnungen, setOeffnungen] = useState(0);
  /** Die zuletzt angetippte Zeile — beim Schließen bekommt sie den Fokus zurück. */
  const ausloeser = useRef<HTMLButtonElement | null>(null);

  const oeffnen = useCallback((stand: Offen) => {
    ausloeser.current = stand.anker;
    setOffen(stand);
    setOeffnungen((n) => n + 1);
  }, []);
  const schliessen = useCallback((zurueck: boolean) => {
    setOffen(null);
    const el = ausloeser.current;
    if (zurueck && el?.isConnected) el.focus({ preventScroll: true });
  }, []);

  if (abwesend.length === 0 && imEinsatz.length === 0) return null;
  const ziel = ZIEL.tag(heute);
  const unbesetztBei = new Map<string, string>();
  for (const b of tag) {
    if (!b.unbesetzt) continue;
    for (const f of b.fehlen) unbesetztBei.set(f.name, b.projectNumber);
  }

  const weg = abschnitt(
    'abwesend',
    'Abwesend',
    abwesend.map<Zeile>((a) => ({
      key: `weg-${a.uid}`,
      titel: a.name,
      detail: unbesetztBei.has(a.name)
        ? `${unbesetztBei.get(a.name)} unbesetzt`
        : a.zeiten
          ? a.zeiten
          : a.bis > heute
            ? `bis ${datumAT(a.bis)}`
            : 'heute',
      status: { text: a.grund ?? 'abwesend', ton: a.grund === 'Krank' ? 'warn' : 'abwesend' },
      to: ziel,
    })),
    ziel,
  );
  const da = abschnitt(
    'im-einsatz',
    'Im Einsatz',
    imEinsatz.map<Zeile>((b) => ({
      key: `da-${b.projectNumber}`,
      titel: b.customerName,
      detail: [b.namen.join(', '), b.fehlen.length ? `fehlt: ${fehlenText(b.fehlen)}` : ''].filter(Boolean).join(' · '),
      status: { text: b.namen.length === 1 ? '1 Person' : `${b.namen.length} Personen`, ton: 'einsatz' },
      to: ziel,
      oeffnen: vorschau
        ? (anker, klickX) => oeffnen({ nummer: b.projectNumber, name: b.customerName, anker, klickX })
        : undefined,
    })),
    ziel,
  );

  return (
    <>
      <StartKarte verweisUnten titel="Die Mannschaft heute" zusatz={`${personen} im Einsatz`} verweis={{ to: ziel, text: 'Einsatzplanung' }}>
        {weg && <AbschnittBlock a={weg} />}
        {da && <AbschnittBlock a={da} />}
      </StartKarte>
      {vorschau && offen && (
        <EinsatzVorschau key={oeffnungen} heute={heute} offen={offen} grund={vorschau} onSchliessen={schliessen} />
      )}
    </>
  );
}

/**
 * Die Vorschau selbst: lädt den Tag beim Öffnen frisch über dieselben
 * Abfragen wie der Monat (`DB_QUELLE.tag`) — die Startseite hält nur die
 * zusammengefasste Mannschaft, nicht Aufgabe, Zeiten und Termine.
 */
function EinsatzVorschau({
  heute,
  offen,
  grund,
  onSchliessen,
}: {
  heute: string;
  offen: Offen;
  grund: EinsatzVorschauGrund;
  onSchliessen: (zurueck: boolean) => void;
}) {
  const quelle = grund.quelle ?? DB_QUELLE;
  const { betrieb, projekte, namen: belegschaft } = grund;
  const handy = useHandy();
  const navigate = useNavigate();
  const [daten, setDaten] = useState<TagesDaten | 'fehler' | null>(null);
  const [nachgeholt, setNachgeholt] = useState<ProjektKurz | null | undefined>(undefined);

  useEffect(() => {
    let weg = false;
    // Über `Promise.resolve()`: auch ein Fehler beim Aufruf selbst landet im `catch`.
    Promise.resolve()
      .then(() => quelle.tag(betrieb, heute))
      .then((d) => {
        if (!weg) setDaten(d);
      })
      .catch(() => {
        if (!weg) setDaten('fehler');
      });
    return () => {
      weg = true;
    };
  }, [quelle, betrieb, heute]);

  /*
    DIE ADRESSE einer pausierten oder abgeschlossenen Baustelle: die
    Startseite hat nur die laufenden. Wie im Monat über die bestehende
    Abfrage nach Nummern — kommt nichts, steht „–“ statt ewig „…“.
  */
  const bekannt = projekte.find((p) => p.projectNumber === offen.nummer);
  useEffect(() => {
    if (bekannt) return;
    let weg = false;
    Promise.resolve()
      .then(() => quelle.projekte(betrieb, [offen.nummer]))
      .then((liste) => {
        if (!weg) setNachgeholt(liste.find((p) => p.projectNumber === offen.nummer) ?? null);
      })
      .catch(() => {
        if (!weg) setNachgeholt(null);
      });
    return () => {
      weg = true;
    };
  }, [quelle, bekannt, betrieb, offen.nummer]);

  const namen = useMemo(() => new Map(belegschaft.map((u) => [u.uid, u.name])), [belegschaft]);
  const nameVon = useCallback(
    (a: Pick<Assignment, 'userId' | 'userName'>) => namen.get(a.userId) ?? (a.userName?.trim() || 'Unbekannt'),
    [namen],
  );
  const projektVon = useCallback(
    (nummer: string): ProjektKurz | null | undefined => (nummer === offen.nummer ? (bekannt ?? nachgeholt) : projekte.find((p) => p.projectNumber === nummer)),
    [offen.nummer, bekannt, nachgeholt, projekte],
  );
  const ziel = useMemo(() => ({ art: 'baustelle' as const, nummer: offen.nummer, name: offen.name, tag: heute }), [offen.nummer, offen.name, heute]);
  const inhalt = useMemo(() => {
    if (!daten) return null;
    if (daten === 'fehler') {
      return {
        ...vorschauInhalt(ziel, { einsaetze: [], urlaube: [], termine: [], zu: null, zuFuer: () => false }, projektVon, nameVon, bezugText, belegschaft),
        frei: 'Dieser Tag konnte nicht geladen werden.',
      };
    }
    return vorschauInhalt(ziel, daten, projektVon, nameVon, bezugText, belegschaft);
  }, [daten, ziel, projektVon, nameVon, belegschaft]);
  const ruest = useRuestText(heute, grund.materialAn, betrieb, quelle);

  return createPortal(
    <MonatsVorschau
      ziel={ziel}
      inhalt={inhalt}
      ruest={ruest}
      imMonat
      handy={handy}
      anker={offen.anker}
      klickX={offen.klickX}
      darfTermine={false}
      baustelleSichtbar={grund.baustelleSichtbar}
      onSchliessen={onSchliessen}
      onEinsatz={
        grund.darfBearbeiten
          ? (start) => navigate('/assignments/tag', { state: { datum: start.datum, projectNumber: start.projectNumber } })
          : undefined
      }
    />,
    document.body,
  );
}
