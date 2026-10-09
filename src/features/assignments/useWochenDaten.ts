import { useCallback, useEffect, useMemo, useState } from 'react';
import { useAuth } from '@/app/AuthContext';
import { einplanbar } from '@/lib/permissions';
import { listActiveProjects } from '@/lib/db/projects';
import { listUsers } from '@/lib/db/users';
import { listAbwesendInRange, type Abwesenheit } from '@/lib/db/vacations';
import { listBetriebsurlaubeImZeitraum } from '@/lib/db/abwesenheiten';
import { subscribeAssignmentsInRange } from '@/lib/db/assignments';
import { listTermineImZeitraum } from '@/lib/db/termine';
import type { WithId } from '@/lib/db/core';
import type { Project, AppUser, Assignment, Betriebsurlaub, Termin } from '@/types';
import { einsatzZeit } from './einsatzZeit';
import { nachEinstufung, type Brett, type TagBaustelle, type TagStand, type Zelle } from './planTypen';

/**
 * WAS DIE WOCHE (UND DER MONAT) WISSEN — geladen und gerechnet an EINER
 * Stelle, für die Einsatzplanung und für die Team-Woche der Monteure.
 *
 * Seit Runde 4 zeichnen die beiden verschieden: die Einsatzplanung hat ein
 * eigenes Raster mit Seitenfenstern, die Team-Woche bleibt, wie sie war.
 * Gerechnet wird trotzdem nur hier — getrennte Rechnungen hiessen zwei
 * Orte, an denen „frei“ oder „fehlt“ etwas anderes heissen kann. Die
 * Abfragen sind dieselben wie vorher in `WochenplanView`, in derselben Form.
 */

/**
 * „Urlaub", „ZA 13:00–17:00", „abwesend".
 *
 * Den GRUND liefert die Datenbank nur dem, der ihn sehen darf; allen anderen
 * `null` — dann heisst es „abwesend". Die Uhrzeit bekommt jeder: „ab 13 Uhr
 * weg" ist eine Auskunft über die Verfügbarkeit, kein Grund.
 */
export function abwesendText(a: Pick<Abwesenheit, 'grund' | 'zeiten'>): string {
  return [a.grund ?? 'abwesend', a.zeiten].filter(Boolean).join(' ');
}

export function useWochenDaten(tage: string[]) {
  const { user, company } = useAuth();
  const von = tage[0];
  const bis = tage[tage.length - 1];

  const [users, setUsers] = useState<AppUser[]>([]);
  const [projects, setProjects] = useState<Project[]>([]);
  const [einsaetze, setEinsaetze] = useState<WithId<Assignment>[]>([]);
  const [urlaube, setUrlaube] = useState<Abwesenheit[]>([]);
  const [betriebsurlaube, setBetriebsurlaube] = useState<Betriebsurlaub[]>([]);
  const [termine, setTermine] = useState<Termin[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [nebenFehler, setNebenFehler] = useState<string | null>(null);
  /** Nach dem Anlegen, Ändern oder Löschen eines Termins: dieselbe Abfrage noch einmal. */
  const [termineStand, setTermineStand] = useState(0);

  useEffect(() => {
    if (!user) return;
    listUsers(user.companyId).then(setUsers).catch(() => setNebenFehler('Die Belegschaft'));
    listActiveProjects(user.companyId)
      .then(setProjects)
      .catch(() => setNebenFehler('Die Baustellen'));
  }, [user]);

  useEffect(() => {
    if (!user) return;
    return subscribeAssignmentsInRange(user.companyId, von, bis, setEinsaetze, (e) =>
      setError(e.message),
    );
  }, [user, von, bis]);

  /**
   * Wer im Zeitraum fehlt: genehmigter Urlaub und Zeitausgleich,
   * Krankmeldungen.
   *
   * Nur GENEHMIGTES: ein beantragter Urlaub ist noch keiner, und ihn hier als
   * Abwesenheit zu zeigen hieße, die Entscheidung vorwegzunehmen.
   *
   * FÜR BEIDE FASSUNGEN DIESELBE ABFRAGE. Sie gibt den Grund nur heraus, wo er
   * gesehen werden darf: der Projektleitung Urlaub und ZA, einen
   * Krankenstand nur dem Büro — sonst „abwesend".
   */
  useEffect(() => {
    if (!user) return;
    let verworfen = false;
    listAbwesendInRange(von, bis)
      .then((r) => {
        if (!verworfen) setUrlaube(r);
      })
      .catch(() => {
        if (!verworfen) setUrlaube([]);
        // Ohne Hinweis sähe „niemand abwesend" aus wie eine Auskunft.
        if (!verworfen) setNebenFehler('Die Abwesenheiten');
      });
    return () => {
      verworfen = true;
    };
  }, [user, von, bis]);

  /*
    DIE TERMINE DES ZEITRAUMS (Plan 10.4): eine Lieferung am Dienstag 8–10
    soll der Planer neben den Leuten sehen. Was jemand sieht, entscheidet der
    Zeilenschutz — in der Team-Woche nur die eigenen und die auf Baustellen,
    auf denen man an dem Tag steht.
  */
  useEffect(() => {
    if (!user) return;
    let verworfen = false;
    listTermineImZeitraum(user.companyId, von, bis)
      .then((t) => {
        if (!verworfen) setTermine(t);
      })
      .catch(() => {
        if (!verworfen) {
          setTermine([]);
          setNebenFehler('Die Termine');
        }
      });
    return () => {
      verworfen = true;
    };
  }, [user, von, bis, termineStand]);
  const termineAm = useCallback((tag: string) => termine.filter((t) => t.datum === tag), [termine]);
  const termineNeuLaden = useCallback(() => setTermineStand((n) => n + 1), []);

  /** Der Betrieb hat zu — an diesen Tagen ist niemand „frei". */
  useEffect(() => {
    if (!user) return;
    let verworfen = false;
    listBetriebsurlaubeImZeitraum(user.companyId, von, bis)
      .then((r) => {
        if (!verworfen) setBetriebsurlaube(r);
      })
      .catch(() => {
        if (!verworfen) setBetriebsurlaube([]);
      });
    return () => {
      verworfen = true;
    };
  }, [user, von, bis]);

  /** Tag -> Bezeichnung des Betriebsurlaubs, falls einer ist. */
  const zuAm = useMemo(() => {
    const m = new Map<string, string>();
    for (const b of betriebsurlaube) {
      for (const tag of tage) if (b.von <= tag && b.bis >= tag) m.set(tag, b.bezeichnung);
    }
    return m;
  }, [betriebsurlaube, tage]);

  /**
   * Hat der Betrieb an diesem Tag für DIESE Person zu?
   *
   * Wer beim Betriebsurlaub ausgenommen wurde, arbeitet in der Zeit (etwa
   * Notdienst oder Lager) — er ist dann „frei“ und einteilbar wie an jedem
   * anderen Tag. Die Spalte bleibt trotzdem grau: für den Betrieb ist zu.
   */
  const zuFuer = useCallback(
    (uid: string, tag: string) =>
      betriebsurlaube.some(
        (b) => b.von <= tag && b.bis >= tag && !(b.ausgenommen ?? []).includes(uid),
      ),
    [betriebsurlaube],
  );

  // Nur Außendienst wird eingeplant — dieselbe Auswahl wie in der Tagesplanung.
  const staff = useMemo(
    () =>
      users
        // Seit 30.09.2026 auf Wunsch des Betriebs auch die Projektleitung (M38).
        .filter((u) => einplanbar(u, company))
        .sort((a, b) => a.name.localeCompare(b.name, 'de')),
    [users, company],
  );
  const gruppen = useMemo(() => nachEinstufung(staff), [staff]);

  /** uid -> Tag -> was dort steht. */
  const brett = useMemo(() => {
    const m: Brett = new Map();
    const hole = (uid: string, tag: string): Zelle => {
      const proTag = m.get(uid) ?? new Map<string, Zelle>();
      m.set(uid, proTag);
      const z = proTag.get(tag) ?? { baustellen: [], imUrlaub: false, abwesendText: null };
      proTag.set(tag, z);
      return z;
    };
    for (const a of einsaetze) {
      const proj = projects.find((p) => p.projectNumber === a.projectNumber);
      hole(a.userId, a.date).baustellen.push({
        nummer: a.projectNumber,
        name: proj?.customerName ?? a.projectNumber,
        helfer: !!a.asHelper,
        zeit: einsatzZeit(a),
      });
    }
    for (const v of urlaube) {
      for (const tag of tage) {
        if (v.von <= tag && v.bis >= tag) {
          const z = hole(v.userId, tag);
          // Stundenweise (mit Uhrzeit) ist man nur teilweise weg: die Zelle
          // nennt es, eingeteilt werden kann trotzdem.
          if (!v.zeiten) z.imUrlaub = true;
          z.abwesendText = abwesendText(v);
        }
      }
    }
    return m;
  }, [einsaetze, urlaube, projects, tage]);

  /**
   * Je Tag zusammengefasst: welche Baustelle mit wem, wer frei, wer im Urlaub.
   *
   * ALLE DARSTELLUNGEN RECHNEN DAMIT — das Raster am Schreibtisch, die Sicht
   * nach Baustellen, die Tagesliste auf dem Telefon und das Seitenfenster
   * „Tag“. Getrennte Rechnungen hiessen mehrere Orte, an denen „frei" etwas
   * anderes heissen kann.
   */
  const proTag = useMemo(() => {
    const m = new Map<string, TagStand>();
    for (const tag of tage) {
      const nachNummer = new Map<string, TagBaustelle>();
      const eintrag = (b: Zelle['baustellen'][number]) => {
        const e = nachNummer.get(b.nummer) ?? { nummer: b.nummer, name: b.name, namen: [], helfer: [], fehlen: [], zeit: b.zeit };
        nachNummer.set(b.nummer, e);
        return e;
      };
      const frei: string[] = [];
      const freiIds: string[] = [];
      const urlaub: string[] = [];
      for (const u of staff) {
        const z = brett.get(u.uid)?.get(tag);
        // Ohne Grund steht nur der Name da — „Erna (abwesend)" hinter
        // „Abwesend:" wäre doppelt.
        if (z?.abwesendText) {
          urlaub.push(z.abwesendText === 'abwesend' ? u.name : `${u.name} (${z.abwesendText})`);
        }
        /*
          EINGETEILT UND GANZTAGS WEG (Testbericht 30.09.2026, M33): der
          Einsatz verschwindet nicht, er steht mit „fehlt“ da. Vorher fiel er
          hier weg, und die Baustelle sah aus, als wäre nichts geplant.
        */
        if (z?.imUrlaub) {
          for (const b of z.baustellen) {
            eintrag(b).fehlen.push(z.abwesendText && z.abwesendText !== 'abwesend' ? `${u.name} (${z.abwesendText})` : u.name);
          }
          continue;
        }
        if (!z || z.baustellen.length === 0) {
          // Am Betriebsurlaub ist niemand „frei" — ausser wer ausgenommen ist.
          if (!zuFuer(u.uid, tag)) {
            frei.push(u.name);
            freiIds.push(u.uid);
          }
          continue;
        }
        for (const b of z.baustellen) {
          const e = eintrag(b);
          e.namen.push(u.name);
          if (b.helfer) e.helfer.push(u.name);
        }
      }
      m.set(tag, {
        baustellen: [...nachNummer.values()].sort((a, b) => a.name.localeCompare(b.name, 'de')),
        frei,
        freiIds,
        urlaub,
      });
    }
    return m;
  }, [tage, staff, brett, zuFuer]);

  /** Wie viele sind an diesem Tag frei — die Zahl, um die es geht. */
  const freiJeTag = useMemo(() => {
    const m = new Map<string, number>();
    for (const tag of tage) m.set(tag, proTag.get(tag)?.frei.length ?? 0);
    return m;
  }, [tage, proTag]);

  /** Eine in der Auswahl nachgeladene Baustelle (etwa eine abgeschlossene) kommt dazu. */
  const projektDazu = useCallback(
    (p: Project) =>
      setProjects((alt) => (alt.some((x) => x.projectNumber === p.projectNumber) ? alt : [...alt, p])),
    [],
  );

  return {
    users,
    projects,
    projektDazu,
    einsaetze,
    urlaube,
    betriebsurlaube,
    termine,
    termineAm,
    termineNeuLaden,
    error,
    nebenFehler,
    zuAm,
    zuFuer,
    staff,
    gruppen,
    brett,
    proTag,
    freiJeTag,
  };
}
