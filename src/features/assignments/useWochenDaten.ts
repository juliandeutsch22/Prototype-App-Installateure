import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useAuth } from '@/app/AuthContext';
import { einplanbar } from '@/lib/permissions';
import { listActiveProjects, listProjectsByNumbers } from '@/lib/db/projects';
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
/**
 * Die Gruppe für Eingeteilte, die nicht (mehr) eingeplant werden können —
 * deaktiviert, oder Projektleitung bei ausgeschaltetem Schalter (10.10.2026).
 */
export const NICHT_EINPLANBAR = 'Nicht mehr einplanbar';

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
  /**
   * Ist die Belegschaft da? Vorher ist „niemand im Außendienst“ keine
   * Auskunft, sondern ein Ladezustand (Team-Woche, 10.10.2026).
   */
  const [belegschaftGeladen, setBelegschaftGeladen] = useState(false);
  /** Kam die Belegschaft an? Ohne sie lässt sich „nicht einplanbar“ nicht sagen. */
  const [belegschaftDa, setBelegschaftDa] = useState(false);
  /** Nach dem Anlegen, Ändern oder Löschen eines Termins: dieselbe Abfrage noch einmal. */
  const [termineStand, setTermineStand] = useState(0);

  useEffect(() => {
    if (!user) return;
    listUsers(user.companyId)
      .then((u) => {
        setUsers(u);
        setBelegschaftDa(true);
      })
      .catch(() => setNebenFehler('Die Belegschaft'))
      .finally(() => setBelegschaftGeladen(true));
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
        if (!verworfen) {
          setBetriebsurlaube([]);
          // Ohne Hinweis sähe ein geschlossener Tag aus wie ein gewöhnlicher.
          setNebenFehler('Der Betriebsurlaub');
        }
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

  /*
    EINGETEILT, ABER NICHT (MEHR) EINPLANBAR (10.10.2026). Wer deaktiviert
    wird — oder als Projektleitung, wenn der Betrieb den Schalter ausschaltet —,
    behält seine schon geplanten Einsätze. Bis hierher fielen sie aus dem
    Raster, aus der Team-Woche und aus dem Tag, weil nur gezeichnet wurde, wer
    einplanbar ist: die Baustelle sah unbesetzt aus und war es nicht, oder sie
    war es und niemand sah es. Jetzt stehen diese Personen in einer eigenen
    Gruppe am Ende — nur mit ihren Einsätzen, nie „frei“.
  */
  const ausserhalb = useMemo(() => {
    // Erst mit der Belegschaft: vorher stünde jeder Eingeteilte kurz in dieser Gruppe.
    if (!belegschaftDa) return [];
    const planbar = new Set(staff.map((u) => u.uid));
    const m = new Map<string, AppUser>();
    for (const a of einsaetze) {
      if (planbar.has(a.userId) || m.has(a.userId)) continue;
      // Wer nicht in der Belegschaftsliste steht, behält den Namen aus dem Einsatz.
      m.set(
        a.userId,
        users.find((u) => u.uid === a.userId) ??
          ({ id: a.userId, uid: a.userId, companyId: a.companyId, name: a.userName?.trim() || 'Unbekannt', email: '', role: 'Mitarbeiter', active: false } as AppUser),
      );
    }
    return [...m.values()].sort((a, b) => a.name.localeCompare(b.name, 'de'));
  }, [belegschaftDa, einsaetze, staff, users]);
  const nichtEinplanbar = useMemo(() => new Set(ausserhalb.map((u) => u.uid)), [ausserhalb]);
  const gruppen = useMemo(() => {
    const g = nachEinstufung(staff);
    return ausserhalb.length > 0 ? [...g, { name: NICHT_EINPLANBAR, leute: ausserhalb }] : g;
  }, [staff, ausserhalb]);

  /*
    DIE KUNDEN ZU BAUSTELLEN, DIE NICHT MEHR LAUFEN (10.10.2026). Geladen
    werden die laufenden und pausierten Baustellen; ein Einsatz auf einer
    abgeschlossenen zeigte deshalb nur die Nummer. Die fehlenden kommen nach.
  */
  /** Schon gefragte Nummern — eine, die es nicht (mehr) gibt, wird nicht bei jeder Live-Meldung neu gesucht. */
  const nachgefragt = useRef(new Set<string>());
  useEffect(() => {
    if (!user) return;
    const bekannt = new Set(projects.map((p) => p.projectNumber));
    const fehlend = [...new Set(einsaetze.map((a) => a.projectNumber))].filter(
      (n) => n && !bekannt.has(n) && !nachgefragt.current.has(n),
    );
    if (fehlend.length === 0) return;
    for (const n of fehlend) nachgefragt.current.add(n);
    // Ohne Abbruch beim nächsten Lauf: die Nummern sind schon als gefragt
    // vermerkt, ein verworfenes Ergebnis käme nie wieder. Das Zusammenführen
    // ist ohnehin doppelt sicher.
    listProjectsByNumbers(user.companyId, fehlend)
      .then((gefunden) => {
        if (gefunden.length === 0) return;
        setProjects((alt) => [...alt, ...gefunden.filter((p) => !alt.some((x) => x.projectNumber === p.projectNumber))]);
      })
      // Ohne sie steht die Nummer da — wie bisher; kein eigener Hinweis.
      .catch(() => undefined);
  }, [user, einsaetze, projects]);

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
          // nennt es, eingeteilt werden kann trotzdem. Ganztags geht vor —
          // sonst hinge an der Reihenfolge der Zeilen, ob ein grauer Block
          // „abwesend 13:00–17:00“ hieße.
          if (!v.zeiten) {
            z.imUrlaub = true;
            z.abwesendText = abwesendText(v);
          } else if (!z.imUrlaub) {
            z.abwesendText = abwesendText(v);
          }
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
      for (const u of [...staff, ...ausserhalb]) {
        const planbar = !nichtEinplanbar.has(u.uid);
        const z = brett.get(u.uid)?.get(tag);
        // Ohne Grund steht nur der Name da — „Erna (abwesend)" hinter
        // „Abwesend:" wäre doppelt.
        if (z?.abwesendText && planbar) {
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
          // Wer nicht einplanbar ist, ist nie „frei".
          if (planbar && !zuFuer(u.uid, tag)) {
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
  }, [tage, staff, ausserhalb, nichtEinplanbar, brett, zuFuer]);

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
    belegschaftGeladen,
    zuAm,
    zuFuer,
    staff,
    nichtEinplanbar,
    gruppen,
    brett,
    proTag,
    freiJeTag,
  };
}
