import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { useAuth } from '@/app/AuthContext';
import { materialdeckung, type DeckungsDaten } from '@/lib/db/materialdeckung';
import { einsatzFolgetage, einsatzFolgetageEntfernen, saveAssignments } from '@/lib/db/assignments';
import { FOLGETAGE_HOECHSTENS, entferntBericht, folgeBericht, folgetageGueltig, tagDanach, tageEinschliesslich, type FolgetageStand } from './folgetage';
import FolgetageWahl from './FolgetageWahl';
import { saveEinsatzMaterial } from '@/lib/db/einsatzMaterial';
import { PaarGeaendert, type EinteilungsZeile, type ListenZeile, type PaarGrundlage } from '@/lib/db/paarFassung';
import { entferntText, RuestlisteFrage, type RuestlisteErgebnis, type RuestlisteWahl as Wahl } from '@/lib/db/ruestlisteFrage';
import RuestlisteWahl from './RuestlisteWahl';
import type { Abwesenheit } from '@/lib/db/vacations';
import { getAustrianHolidayName, isWeekend } from '@/lib/time';
import type { WithId } from '@/lib/db/core';
import type {
  Project,
  AppUser,
  Assignment,
  Betriebsurlaub,
  EinsatzMaterial,
  RuestPosition,
  Termin,
} from '@/types';
import Card from '@/components/Card';
import Aktionsleiste from '@/components/Aktionsleiste';
import Hinweiszeile from '@/components/Hinweiszeile';
import Button from '@/components/Button';
import InfoHint from '@/components/InfoHint';
import { InputField } from '@/components/Field';
import BaustellenSelect from '@/components/BaustellenSelect';
import PersonPicker from '@/components/PersonPicker';
import { List, ListRow } from '@/components/ListRow';
import { useModul } from '@/lib/useModule';
import { useToast } from '@/components/Toast';
import { ErrorState, SkeletonList } from '@/components/States';
import { grundAus } from '@/lib/fehlerGrund';
import { terminKopf } from '@/features/termine/terminText';
import RuestlistePlanen from './RuestlistePlanen';
import { formularDeckung } from './materialDeckung';
import { abwesendAm, fmtDay, useMaterialstamm } from './einsatzDaten';
import { alsHelferEingestuft, istLehrling, stufeImEinsatz } from './stufeImEinsatz';
import Schalter from '@/components/Schalter';

/** Auswahlzustand je Mitarbeiter: eingeteilt und in welcher Rolle. */
interface Pick {
  on: boolean;
  asHelper: boolean;
}

/*
  WORAN DAS FORMULAR EINE FREMDE ÄNDERUNG ERKENNT (Durchsicht 15.11.2026,
  P1). Die Live-Daten kommen bei JEDER Meldung des Betriebs als neue Listen
  herein — auch wenn ein Monteur auf einer anderen Baustelle abhakt. Die
  Identität der Listen sagt deshalb nichts; verglichen wird der Inhalt des
  Paares aus Tag und Baustelle. Ohne Kennungen: Speichern ist „alles weg,
  alles neu“, dieselbe Einteilung kommt mit neuen Kennungen zurück. Die
  Uhrzeit nur bis zur Minute, wie das Formular sie schreibt.
*/
interface Einteilungszeile {
  userId: string;
  asHelper?: boolean | null;
  comment?: string | null;
  zeitVon?: string | null;
  zeitBis?: string | null;
}

function einteilungsSchluessel(zeilen: Einteilungszeile[]): string {
  const uhr = (t?: string | null) => (t ?? '').slice(0, 5);
  return zeilen
    .map((a) => JSON.stringify([a.userId, !!a.asHelper, a.comment ?? '', uhr(a.zeitVon), uhr(a.zeitBis)]))
    .sort()
    .join('\n');
}

/**
 * Was an der Rüstliste Eingabe ist. `angefordert` gehört nicht dazu: das
 * rechnet die Datenbank aus den verknüpften Anforderungen, getippt wird es
 * nie (siehe `anforderungsSchluessel`).
 */
function listenSchluessel(positionen: RuestPosition[] = []): string {
  return positionen.map((p) => JSON.stringify([p.id, p.materialId ?? '', p.name, p.menge, p.einheit ?? ''])).join('\n');
}

function anforderungsSchluessel(positionen: RuestPosition[] = []): string {
  return positionen.map((p) => `${p.id}:${p.angefordert ?? 0}`).join('|');
}

/**
 * Wie das Formular zu den Live-Daten seines Paares steht.
 *
 * ZWEI STÄNDE, NICHT EINER: `grundlage` ist, worauf die Eingabe im Formular
 * beruht — übernommen oder selbst gespeichert. `gesehen` ist, was zuletzt
 * live dastand. Eine fremde Änderung ist eine NEUE Meldung, die nicht zur
 * Grundlage passt. Nach dem eigenen Speichern steht live noch eine Weile
 * der alte Stand; wer nur „live ≠ Grundlage“ prüfte, hielte das für fremd —
 * oder holte den alten Stand zurück ins Formular.
 */
interface Abgleich {
  /** Tag, Baustelle und die vorgewählte Person: ändert sich eins, gilt die neue Planung. */
  paar: string;
  /** Übernommen, als die Planung des Tages schon geladen war? Vorher ist es noch das Öffnen. */
  bereit: boolean;
  grundlage: Teile<string>;
  gesehen: Teile<string> & { anforderungen: string };
  /** Fremd geändert, während hier getippt war — bis übernommen oder behalten. */
  fremd: Teile<boolean>;
  /**
   * Selbst gespeichert, die Live-Meldung aber noch nicht ganz da: der
   * geschriebene Stand. Kommt die Meldung in Teilschritten, ist ein
   * Zwischenstand die eigene Meldung und nichts Fremdes.
   */
  erwartet: Teile<string | null>;
  /**
   * Von der Datenbank abgewiesen (`PaarGeaendert`): ihr Stand in diesem
   * Moment, bis die Live-Meldung ihn bringt. Darauf speichert „Meine Eingabe
   * behalten“; „Übernehmen“ braucht die Zeilen und wartet auf die Meldung.
   */
  abgelehnt: Teile<string | null>;
}
type Teile<T> = { einteilung: T; liste: T };

const KEINE: Teile<null> = { einteilung: null, liste: null };

/**
 * Wie lange eine eigene Meldung höchstens in Teilschritten kommen darf. Was
 * danach noch vom Gespeicherten abweicht, ist nicht mehr die eigene Meldung:
 * dann fragt das Formular. Großzügig, weil ein schwaches Netz dauert — zu
 * lang kostet nichts, denn überschrieben wird ohnehin nur, was die Datenbank
 * als unverändert bestätigt.
 */
const EIGENE_MELDUNG_MS = 10_000;

/** Der Schlüssel als Stand, wie ihn die Datenbank prüft (`paarFassung.ts`). */
function standAus<T>(schluessel: string): T[] {
  return schluessel ? schluessel.split('\n').map((z) => JSON.parse(z) as T) : [];
}

/** Der Stand, den die Datenbank bei einer Ablehnung meldet, als Schlüssel — wie die Live-Daten ihn hätten. */
function schluesselAus(teil: keyof Teile<unknown>, stand: unknown[]): string {
  const zeilen = stand.map((z) => JSON.stringify(z));
  return (teil === 'einteilung' ? zeilen.sort() : zeilen).join('\n');
}

const MATERIAL_HINWEIS = (
  <>
    Was der Monteur am Einsatztag mitnehmen soll. Er sieht die Liste auf seiner Startseite und hakt
    ab, was im Bus ist; der Haken bucht es vom Lager ab. Ab dem Einsatztag ist die Menge für diese
    Liste reserviert. Fehlt etwas im Lager, wird auf Wunsch eine Anforderung über die Fehlmenge
    mit dem Einsatz gespeichert — diesen Teil holt der Monteur über die Anforderung ab, der Haken
    bucht nur den Rest aus dem Regal.
  </>
);

/**
 * DAS FORMULAR „EINSATZ PLANEN“ — Baustelle, Mannschaft, Aufgabe, Uhrzeit,
 * Rüstliste, ein Knopf zum Speichern.
 *
 * WARUM ES EINE EIGENE KOMPONENTE IST (Linie „Lot“, Schritt E2): Planen und
 * Bearbeiten geschehen jetzt auch im Seitenfenster des Wochenplans, mit Tag
 * und Person schon vorbelegt. Ein zweites Formular daneben hieße, den
 * gefährlichsten Vorgang der App — „alles weg, dann alles neu“ für das Paar
 * aus Tag und Baustelle — zweimal richtig zu halten. Deshalb steht er nur
 * hier, und beide Orte benutzen ihn. Inhalt und Ablauf sind die der
 * bisherigen Tagesplanung.
 *
 * DIE EINTEILUNG DES TAGES MUSS GELADEN SEIN, bevor das Formular steht: aus
 * ihr wird die vorhandene Planung übernommen. Der Aufrufer reicht deshalb
 * nur Tage herein, deren Einsätze er schon hat.
 */
export default function EinsatzFormular({
  date,
  projectNumber,
  onProjectNumber,
  startPerson,
  users,
  staff,
  staffGeladen = true,
  projects,
  onProjekt,
  tagesEinsaetze,
  urlaube,
  betriebsurlaube,
  termineDesTages,
  tagesListen,
  bereit = true,
  karten,
  onGespeichert,
  onLoeschen,
  fussNeben,
}: {
  date: string;
  projectNumber: string;
  onProjectNumber: (nr: string) => void;
  /** Aus der freien Zelle des Wochenplans: diese Person ist schon gewählt. */
  startPerson?: string;
  users: AppUser[];
  /** Wer eingeplant werden kann — sortiert. */
  staff: AppUser[];
  /**
   * Ist die Belegschaft da (oder ihr Fehler)? Vorher hieße eine leere Auswahl
   * „Keine aktiven Mitarbeiter vorhanden.“ — eine Auskunft, wo „weiß ich noch
   * nicht“ gemeint ist (Messung 11.10.2026). Ab Werk da: das Fenster des
   * Wochenplans öffnet erst, wenn die Woche geladen ist.
   */
  staffGeladen?: boolean;
  projects: Project[];
  /** Eine in der Auswahl nachgeladene Baustelle (etwa eine abgeschlossene). */
  onProjekt: (p: WithId<Project>) => void;
  /** Alle Einsätze DIESES Tages — gleichbleibend, solange sie sich nicht ändern. */
  tagesEinsaetze: WithId<Assignment>[];
  urlaube: Abwesenheit[];
  betriebsurlaube: Betriebsurlaub[];
  termineDesTages: Termin[];
  tagesListen: WithId<EinsatzMaterial>[];
  /**
   * Gehören `tagesEinsaetze` und `tagesListen` schon zu `date`? Vorher wird
   * nicht gespeichert: Speichern ersetzt alle Einsätze und die Rüstliste des
   * Paares aus Tag und Baustelle, und ein Formular, das die vorhandenen noch
   * nicht kennt, löschte sie.
   */
  bereit?: boolean;
  /** In der Tagesplanung als Karten; ohne die Angabe für das Seitenfenster. */
  karten?: { titel: string };
  /** Nach vollständigem Speichern (Einsatz und Rüstliste). */
  onGespeichert?: () => void;
  /**
   * Im Seitenfenster: die gespeicherten Einsätze dieser Baustelle einzeln
   * löschen. Erst nach der Rückfrage im Fenster; ein Fehlschlag wirft.
   */
  onLoeschen?: (a: WithId<Assignment>, wahl: Wahl) => Promise<RuestlisteErgebnis | null>;
  /**
   * Im Seitenfenster: ein Nebenknopf in der Fußleiste neben dem Speichern
   * (Runde 4: „Ganzen Tag ansehen“).
   */
  fussNeben?: ReactNode;
}) {
  const { user, einblick } = useAuth();
  const toast = useToast();
  const materialAn = useModul('material');
  // Der Zustand je Position (M04b); die Fehlmenge selbst gibt es auch ohne.
  const bereitschaftAn = useModul('material.materialbereitschaft');
  /*
    DER MATERIALSTAMM ERST MIT DER RÜSTLISTE (Analyse 09.10.2026, Maßnahme
    9): bis zu 1.000 Artikel, live — gebraucht nur, sobald eine Baustelle
    gewählt ist und damit die Rüstliste dasteht. Vorher holte ihn jede
    Tagesplanung und jedes Seitenfenster beim Öffnen.
  */
  const materials = useMaterialstamm(user?.companyId, materialAn && !!projectNumber);

  const [picks, setPicks] = useState<Record<string, Pick>>({});
  /** Nicht mehr Einplanbare, die hier ausdrücklich aus dem Einsatz genommen wurden. */
  const [herausgenommen, setHerausgenommen] = useState<Set<string>>(new Set());
  const [comment, setComment] = useState('');
  /** Optional die Uhrzeit des Einsatzes (M34). Leer: der ganze Tag. */
  const [zeitVon, setZeitVon] = useState('');
  const [zeitBis, setZeitBis] = useState('');
  /**
   * Haben die Eingeteilten verschiedene Aufgaben oder Uhrzeiten, bleiben sie
   * beim Speichern — außer der Planer will ausdrücklich allen dieselbe geben
   * (Durchsicht 15.11.2026, P7).
   */
  const [angleichen, setAngleichen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  /*
    ÜBER MEHRERE TAGE (B4, E85): dieselbe Einteilung bis einschließlich
    einem Tag, ab Werk nur an Werktagen. Der erste Tag wird wie bisher
    gespeichert, samt Rüstliste; die Folgetage übernimmt die Datenbank in
    einem Aufruf (`einsatz_folgetage`) und sagt je Tag, was anders lief.
  */
  const [mehrereTage, setMehrereTage] = useState(false);
  const [bisTag, setBisTag] = useState('');
  const [nurWerktage, setNurWerktage] = useState(true);
  /** Die Tage, an denen etwas anders lief — bis „Fertig“ bleibt das Formular stehen. */
  const [folgeZeilen, setFolgeZeilen] = useState<string[] | null>(null);
  // Ein anderer Tag oder eine andere Baustelle: der Bericht gehört zum vorigen Speichern.
  useEffect(() => { setFolgeZeilen(null); }, [date, projectNumber]);

  /*
    Die Rüstliste. Sie hängt am Paar aus Tag und Baustelle, nicht an der
    Person — deshalb ein eigener Zustand neben `picks`.
  */
  const [ruestliste, setRuestliste] = useState<RuestPosition[]>([]);
  // Am Inhalt, nicht an der Array-Identität: jede Mengenänderung wäre sonst eine neue Abfrage.
  const ruestIds = [...new Set(ruestliste.map((p) => p.materialId ?? '').filter(Boolean))].sort().join('|');
  /**
   * Rüstpositionen, deren Fehlmenge beim Speichern angefordert wird (Runde 6,
   * M5) — mit der Menge, die beim Tipp dastand. Gespeichert wird die dann
   * aktuelle; die gemerkte gilt nur, wenn sich der Artikel nicht mehr
   * nachschlagen lässt.
   */
  const [vorgemerkt, setVorgemerkt] = useState<Map<string, number>>(new Map());
  /**
   * Die Eingaben der Deckungsrechnung für diese Liste (M04b; vorher nur
   * `lager_frei`, M32) — `null`, solange unbekannt oder nicht erreichbar.
   */
  const [deckung, setDeckung] = useState<DeckungsDaten | null>(null);
  /** Eine freie Zeile der Rüstliste, die eingetippt, aber nicht hinzugefügt ist. */
  const [offeneRuestzeile, setOffeneRuestzeile] = useState<string | null>(null);
  /** Welcher Einsatz gerade gelöscht werden soll — die Rückfrage steht im Fenster. */
  const [loeschFrage, setLoeschFrage] = useState<WithId<Assignment> | null>(null);
  const [loeschtGerade, setLoeschtGerade] = useState(false);
  /** Beim Letzten des Paares: was mit der Rüstliste geschieht (P2) — gehört zur offenen Rückfrage. */
  const [ruestFrage, setRuestFrage] = useState<{ frage: RuestlisteFrage; wahl: 'aufloesen' | 'behalten' | null } | null>(null);
  /** Beim Löschen: auch an den folgenden Tagen (V13). Gehört zur offenen Rückfrage. */
  const [loeschFolge, setLoeschFolge] = useState<FolgetageStand>({ an: false, bis: '' });
  useEffect(() => { setRuestFrage(null); setLoeschFolge({ an: false, bis: '' }); }, [loeschFrage]);

  /** Mit welcher Person das Fenster geöffnet wurde — sie kommt zur übernommenen Planung dazu. */
  const startPick = useMemo(() => {
    if (!startPerson) return null;
    const p = staff.find((u) => u.uid === startPerson);
    return p ? { uid: p.uid, pick: { on: true, asHelper: alsHelferEingestuft(p) } } : null;
  }, [startPerson, staff]);

  /** Die gespeicherten Einsätze und die Rüstliste genau dieses Paares, wie sie live dastehen. */
  const existingForProject = useMemo(
    () => (projectNumber ? tagesEinsaetze.filter((a) => a.projectNumber === projectNumber) : []),
    [tagesEinsaetze, projectNumber],
  );
  const listeHier = useMemo(
    () => (projectNumber ? tagesListen.find((l) => l.projectNumber === projectNumber) : undefined),
    [tagesListen, projectNumber],
  );
  /*
    VERSCHIEDENE AUFGABEN ODER UHRZEITEN IM SELBEN PAAR (P7). Seit den
    Folgetagen (E85) und dem Umplanen (E88) kommen Zeilen mit eigener Uhrzeit
    und Aufgabe in ein Paar — Anton 07:00–12:00 „Rohinstallation“, Bernd
    13:00–16:00 „Silikon“. Das Formular kannte nur eine Aufgabe und Uhrzeit
    für alle und glich beim Speichern still an — welche, hing an der
    Reihenfolge der Live-Liste. Jetzt steht da, wer was hat; gespeichert wird
    je Person ihr Stand, und die Felder gelten für neu Eingeteilte. Angeglichen
    wird nur auf Wunsch.
  */
  const abweichungen = useMemo(() => {
    const uhr = (t?: string | null) => (t ?? '').slice(0, 5);
    const schluessel = (a: WithId<Assignment>) => JSON.stringify([a.comment ?? '', uhr(a.zeitVon), uhr(a.zeitBis)]);
    if (new Set(existingForProject.map(schluessel)).size <= 1) return [];
    return existingForProject.map((a) => ({
      userId: a.userId,
      name: a.userName ?? 'Mitarbeiter',
      text: [
        a.zeitVon || a.zeitBis ? `${uhr(a.zeitVon) || '…'}–${uhr(a.zeitBis) || '…'}` : 'ganzer Tag',
        a.comment?.trim() ? `„${a.comment.trim()}“` : 'ohne Aufgabe',
      ].join(' · '),
    }));
  }, [existingForProject]);
  const jePerson = abweichungen.length > 0 && !angleichen;
  const paar = `${date}|${projectNumber}|${startPick?.uid ?? ''}`;
  const liveEinteilung = einteilungsSchluessel(existingForProject);
  const liveListe = listenSchluessel(listeHier?.positionen);
  const liveAnforderungen = anforderungsSchluessel(listeHier?.positionen);

  // Für das Ende eines Speicherns: steht noch das Paar da, für das gespeichert wurde?
  const paarJetzt = useRef(paar);
  useEffect(() => {
    paarJetzt.current = paar;
  }, [paar]);
  /** Die Wartezeiten auf eigene Meldungen (`eigenesSpeichern`) — beim Schließen weg damit. */
  const zeitgeber = useRef(new Set<ReturnType<typeof setTimeout>>());
  useEffect(() => {
    const offen = zeitgeber.current;
    return () => {
      for (const t of offen) clearTimeout(t);
      offen.clear();
    };
  }, []);

  /** Wie das Formular zu den Live-Daten steht; `null` nur vor dem ersten Übernehmen. */
  const [abgleich, setAbgleich] = useState<Abgleich | null>(null);
  /**
   * Hat der Planer seit dem letzten Übernehmen etwas getippt — getrennt nach
   * Einteilung und Rüstliste? Wer nur die Aufgabe ändert, verliert nichts,
   * wenn die Rüstliste still nachzieht, und umgekehrt.
   */
  const [bearbeitet, setBearbeitet] = useState({ einteilung: false, liste: false });
  const einteilungGetippt = () => setBearbeitet((b) => (b.einteilung ? b : { ...b, einteilung: true }));
  const listeGetippt = () => setBearbeitet((b) => (b.liste ? b : { ...b, liste: true }));

  /**
   * Vorhandene Planung ins Formular übernehmen, sobald Datum UND Baustelle
   * stehen. Ohne das startete das Formular leer und das Speichern hätte die
   * bestehenden Einsätze gelöscht (delete-then-recreate) — echter Datenverlust,
   * wenn eigentlich nur der Kommentar geändert werden sollte.
   *
   * Kommt das Fenster aus der freien Zelle einer Person, steht sie zusätzlich
   * angehakt da: genau dafür wurde die Zelle angetippt.
   */
  const einteilungUebernehmen = useCallback(() => {
    const next: Record<string, Pick> = startPick ? { [startPick.uid]: startPick.pick } : {};
    for (const a of existingForProject) next[a.userId] = { on: true, asHelper: !!a.asHelper };
    setHerausgenommen(new Set());
    setPicks(next);
    setComment(existingForProject[0]?.comment ?? '');
    setZeitVon(existingForProject[0]?.zeitVon ?? '');
    setZeitBis(existingForProject[0]?.zeitBis ?? '');
    setAngleichen(false);
    setBearbeitet((b) => ({ ...b, einteilung: false }));
  }, [existingForProject, startPick]);

  /**
   * Dieselbe Vorsicht wie bei der Mannschaft: eine vorhandene Rüstliste kommt
   * ins Formular, bevor jemand speichern kann. Startete es leer, hätte ein
   * Speichern die geplante Liste gelöscht — und der Monteur führe am
   * nächsten Morgen ohne Material los.
   */
  const listeUebernehmen = useCallback(() => {
    setRuestliste(listeHier?.positionen ?? []);
    // Gespeichert ist gespeichert: was vorgemerkt war, ist jetzt angelegt (oder verworfen).
    setVorgemerkt(new Map());
    setBearbeitet((b) => ({ ...b, liste: false }));
  }, [listeHier]);

  /**
   * ÜBERNOMMEN WIRD BEIM ÖFFNEN UND BEIM WECHSEL VON TAG ODER BAUSTELLE — und
   * danach nur eine neue Meldung zu DIESEM Paar, und nur in den Teil, an dem
   * noch nichts getippt ist (Durchsicht 15.11.2026, P1). Vorher setzte jede
   * Meldung des Betriebs Mannschaft, Aufgabe, Uhrzeit und Rüstliste zurück:
   * der Planer stellte morgens die Rüstliste zusammen, ein Monteur hakte auf
   * seiner Baustelle ab, und alles Ungespeicherte war still weg. Ist im
   * betroffenen Teil schon getippt, bleibt die Eingabe stehen und das
   * Formular fragt (`inzwischenGeaendert`).
   */
  useEffect(() => {
    const a = abgleich;
    const live = { einteilung: liveEinteilung, liste: liveListe, anforderungen: liveAnforderungen };
    if (!a || a.paar !== paar) {
      einteilungUebernehmen();
      listeUebernehmen();
      setAbgleich({
        paar,
        bereit,
        grundlage: { einteilung: liveEinteilung, liste: liveListe },
        gesehen: live,
        fremd: { einteilung: false, liste: false },
        erwartet: KEINE,
        abgelehnt: KEINE,
      });
      return;
    }
    const neuEinteilung = liveEinteilung !== a.gesehen.einteilung;
    const neuListe = liveListe !== a.gesehen.liste;
    const neuAngefordert = liveAnforderungen !== a.gesehen.anforderungen;
    if (!neuEinteilung && !neuListe && !neuAngefordert && bereit === a.bereit) return;

    const grundlage = { ...a.grundlage };
    const fremd = { ...a.fremd };
    const erwartet = { ...a.erwartet };
    // Was live kommt, ist mindestens so neu wie das, was die Datenbank beim Abweisen sagte.
    const abgelehnt = {
      einteilung: neuEinteilung ? null : a.abgelehnt.einteilung,
      liste: neuListe ? null : a.abgelehnt.liste,
    };
    // Bis die Planung des Tages geladen ist, gilt jede Antwort als Teil des Öffnens.
    if (neuEinteilung) {
      if (liveEinteilung === grundlage.einteilung) {
        // Zurück auf der Grundlage — etwa die Meldung des eigenen Speicherns.
        fremd.einteilung = false;
        erwartet.einteilung = null;
      } else if (erwartet.einteilung !== null) {
        // Ein Zwischenstand der eigenen Meldung — das Ganze kommt gleich.
      } else if (!a.bereit || !bearbeitet.einteilung) {
        einteilungUebernehmen();
        grundlage.einteilung = liveEinteilung;
        fremd.einteilung = false;
      } else {
        fremd.einteilung = true;
      }
    }
    let listeGeholt = false;
    if (neuListe) {
      if (liveListe === grundlage.liste) {
        fremd.liste = false;
        erwartet.liste = null;
      } else if (erwartet.liste !== null) {
        // Zwischenstand der eigenen Meldung.
      } else if (!a.bereit || !bearbeitet.liste) {
        listeUebernehmen();
        listeGeholt = true;
        grundlage.liste = liveListe;
        fremd.liste = false;
      } else {
        fremd.liste = true;
      }
    }
    /*
      NUR `angefordert` NACHZIEHEN, wenn die Liste selbst nicht übernommen
      wurde: eine Anforderung zur Position ist dazugekommen, etwa aus dem
      eigenen Speichern. Ohne sie böte das Formular dieselbe Fehlmenge noch
      einmal zum Anfordern an. Getipptes bleibt dabei unberührt.
    */
    if (neuAngefordert && !listeGeholt) {
      const angefordert = new Map((listeHier?.positionen ?? []).map((p) => [p.id, p.angefordert]));
      setRuestliste((alt) =>
        alt.map((p) => {
          const n = { ...p };
          const menge = angefordert.get(p.id);
          if (menge) n.angefordert = menge;
          else delete n.angefordert;
          return n;
        }),
      );
    }
    setAbgleich({ paar, bereit, grundlage, gesehen: live, fremd, erwartet, abgelehnt });
  }, [
    abgleich, paar, bereit, bearbeitet, listeHier, einteilungUebernehmen, listeUebernehmen,
    liveEinteilung, liveListe, liveAnforderungen,
  ]);

  /*
    WAS FÜR DIESE RÜSTLISTE FREI IST (Testbericht 30.09.2026, M32; seit
    M04b nach Vorrang, K02): frei nach Zusagen und den Listen, die VOR
    dieser dran sind — die eigene zählt nicht gegen sich. Dazu der Stand
    ihrer Anforderungen und der Zulauf für das Lager. Gefragt wird nach den
    Artikeln der Liste, wie sie dasteht; kommt einer dazu, wird neu gefragt.
  */
  useEffect(() => {
    if (!user || !projectNumber || !materialAn) {
      setDeckung(null);
      return;
    }
    let weg = false;
    Promise.resolve()
      .then(() => materialdeckung(date, date, { baustelle: projectNumber, dazu: ruestIds ? ruestIds.split('|') : [] }))
      .then((k) => { if (!weg) setDeckung(k); })
      // Ohne Antwort rechnet das Formular mit dem Bestand, wie vorher ohne `lager_frei`.
      .catch(() => { if (!weg) setDeckung(null); });
    return () => { weg = true; };
  }, [user, materialAn, date, projectNumber, ruestIds, tagesListen]);

  /**
   * Wo steht diese Person an diesem Tag SCHON — auf anderen Baustellen?
   *
   * Mehrere Einsätze am selben Tag waren technisch immer möglich: gespeichert
   * wird je Paar aus Tag und Baustelle, ein Mitarbeiter kann also in mehreren
   * Paaren vorkommen. Nur SAH das niemand. Wer vormittags die eine Baustelle
   * plant und nachmittags die andere, teilte denselben Monteur zweimal ein,
   * ohne es zu merken — oder traute sich umgekehrt nicht, weil das Formular
   * so aussah, als würde die zweite Einteilung die erste ersetzen.
   *
   * Die eigene Baustelle bleibt draußen: dass jemand auf der Baustelle steht,
   * die man gerade plant, zeigt schon der gesetzte Haken.
   */
  const schonVerplant = useMemo(() => {
    const m = new Map<string, string[]>();
    for (const a of tagesEinsaetze) {
      if (a.projectNumber === projectNumber) continue;
      const proj = projects.find((p) => p.projectNumber === a.projectNumber);
      const liste = m.get(a.userId) ?? [];
      liste.push(proj?.customerName ?? a.projectNumber);
      m.set(a.userId, liste);
    }
    return m;
  }, [tagesEinsaetze, projectNumber, projects]);

  const { imUrlaub, teilweiseWeg } = useMemo(() => abwesendAm(urlaube, date), [urlaube, date]);
  const nameVon = (uid: string) => users.find((u) => u.uid === uid)?.name ?? 'Mitarbeiter';

  /** Hat der Betrieb am gewählten Tag zu? */
  const betriebsurlaubHeute = betriebsurlaube.find((b) => b.von <= date && b.bis >= date);

  /*
    INZWISCHEN GEÄNDERT (P1): an diesem Paar hat jemand anderes gespeichert,
    während hier getippt wurde. Speichern ersetzt die Einteilung und die
    Rüstliste des Paares ganz — es überschriebe die fremde Änderung, ohne
    dass der Planer sie je gesehen hat. Deshalb bleibt der Knopf zu, bis er
    entschieden hat. Während das eigene Speichern oder Löschen läuft, ist die
    Meldung, die hereinkommt, die eigene; danach gilt sie als Grundlage.
  */
  const fremdeEinteilung = abgleich?.paar === paar && abgleich.fremd.einteilung;
  const fremdeListe = abgleich?.paar === paar && abgleich.fremd.liste;
  const inzwischenGeaendert = (fremdeEinteilung || fremdeListe) && !saving && !loeschtGerade;
  /*
    Die Datenbank hat abgewiesen, die Live-Meldung mit dem neuen Stand ist
    aber noch unterwegs: „Übernehmen“ hätte nichts zu übernehmen.
  */
  const neuerStandUnterwegs = (fremdeEinteilung && abgleich?.abgelehnt.einteilung != null)
    || (fremdeListe && abgleich?.abgelehnt.liste != null);
  /*
    EINGETEILT, ABER NICHT (MEHR) EINPLANBAR (10.10.2026): deaktiviert, oder
    Projektleitung bei ausgeschaltetem Schalter. Die Auswahl unten kennt nur
    Einplanbare; gespeichert wurde bisher nur, was dort angehakt war — so fiel
    ein solcher Einsatz beim Ändern des Kommentars still weg. Jetzt bleibt er,
    bis ihn jemand ausdrücklich herausnimmt.
  */
  const ausserhalb = existingForProject.filter((a) => !staff.some((u) => u.uid === a.userId));
  const bleiben = ausserhalb.filter((a) => !herausgenommen.has(a.userId));
  const selectedCount = staff.filter((u) => picks[u.uid]?.on).length + bleiben.length;
  /**
   * Jemanden im Urlaub einzuteilen ist kein Fehler des Programms, sondern
   * fast immer ein Versehen. Verboten wird es nicht — bei einem Notdienst
   * holt man auch mal jemanden aus dem Urlaub — aber es steht dann dabei.
   */
  const verplanteUrlauber = useMemo(
    () =>
      Object.entries(picks)
        .filter(([uid, p]) => p.on && imUrlaub.has(uid))
        .map(([uid]) => `${users.find((u) => u.uid === uid)?.name ?? 'Mitarbeiter'} (${imUrlaub.get(uid)})`),
    [picks, imUrlaub, users],
  );
  const holiday = getAustrianHolidayName(new Date(`${date}T00:00:00`));
  const weekend = isWeekend(new Date(`${date}T00:00:00`));

  /*
    TERMINE AUF DERSELBEN BAUSTELLE AM SELBEN TAG (Runde 3, G23). Lieferung
    und Einsatz standen getrennt: wer einteilte, sah die Lieferung um 8 Uhr
    nur in der Terminkarte — und niemand stand zur Annahme da.
  */
  const termineHier = projectNumber
    ? termineDesTages.filter((t) => t.datum === date && t.projectNumber === projectNumber).map(terminKopf)
    : [];

  /**
   * Nach dem eigenen Speichern: das Geschriebene wird Grundlage, und der Teil
   * gilt wieder als unbearbeitet — das Formular zeigt ja genau den
   * gespeicherten Stand. Nur, wenn noch dasselbe Paar dasteht; wurde während
   * des Speicherns umgeschaltet, hat das Formular die neue Planung schon.
   */
  function eigenesSpeichern(fuer: string, welcher: keyof Teile<unknown>, geschrieben: string) {
    if (paarJetzt.current !== fuer) return;
    setAbgleich((a) =>
      a && a.paar === fuer
        ? {
            ...a,
            grundlage: { ...a.grundlage, [welcher]: geschrieben },
            fremd: { ...a.fremd, [welcher]: false },
            abgelehnt: { ...a.abgelehnt, [welcher]: null },
            // Schon live angekommen (während des Speicherns)? Dann wird nichts mehr erwartet.
            erwartet: { ...a.erwartet, [welcher]: a.gesehen[welcher] === geschrieben ? null : geschrieben },
          }
        : a,
    );
    setBearbeitet((b) => ({ ...b, [welcher]: false }));
    /*
      Kommt die eigene Meldung nicht vollständig, war etwas anderes dazwischen.
      Dann fragt das Formular, statt den Unterschied weiter für eigen zu halten.
    */
    const t = setTimeout(() => {
      zeitgeber.current.delete(t);
      setAbgleich((a) =>
        a && a.paar === fuer && a.erwartet[welcher] === geschrieben
          ? {
              ...a,
              erwartet: { ...a.erwartet, [welcher]: null },
              fremd: { ...a.fremd, [welcher]: a.fremd[welcher] || a.gesehen[welcher] !== a.grundlage[welcher] },
            }
          : a,
      );
    }, EIGENE_MELDUNG_MS);
    zeitgeber.current.add(t);
  }

  /**
   * Die Datenbank hat abgewiesen: das Paar sieht inzwischen anders aus (P1).
   * Der Teil gilt als getippt — es ist ja die Eingabe, die gespeichert werden
   * sollte — und das Formular fragt wie bei einer fremden Live-Meldung.
   */
  function abgewiesen(fuer: string, e: PaarGeaendert) {
    if (paarJetzt.current !== fuer) return;
    const welcher = e.teil;
    setBearbeitet((b) => ({ ...b, [welcher]: true }));
    setAbgleich((a) =>
      a && a.paar === fuer
        ? {
            ...a,
            fremd: { ...a.fremd, [welcher]: true },
            erwartet: { ...a.erwartet, [welcher]: null },
            abgelehnt: { ...a.abgelehnt, [welcher]: e.stand ? schluesselAus(welcher, e.stand) : null },
          }
        : a,
    );
  }

  /**
   * Der fremde Stand ist gesehen — übernommen oder bewusst nicht. Er wird
   * Grundlage; erst die nächste fremde Meldung fragt wieder.
   */
  function fremdGesehen() {
    setAbgleich((a) =>
      a
        ? {
            ...a,
            grundlage: {
              einteilung: a.fremd.einteilung ? (a.abgelehnt.einteilung ?? liveEinteilung) : a.grundlage.einteilung,
              liste: a.fremd.liste ? (a.abgelehnt.liste ?? liveListe) : a.grundlage.liste,
            },
            fremd: { einteilung: false, liste: false },
            abgelehnt: KEINE,
          }
        : a,
    );
  }

  /**
   * Aufgabe und Uhrzeit, die eine Person beim Speichern bekommt (P7): bei
   * verschiedenen Ständen ihr eigener, wer neu dazukommt die Felder — sonst,
   * und beim Angleichen, die Felder für alle.
   */
  function eigenerStand(uid: string): { comment: string; zeitVon: string | null; zeitBis: string | null } {
    const eigen = jePerson ? existingForProject.find((a) => a.userId === uid) : undefined;
    return eigen
      ? { comment: eigen.comment ?? '', zeitVon: eigen.zeitVon || null, zeitBis: eigen.zeitBis || null }
      : { comment, zeitVon: zeitVon || null, zeitBis: zeitBis || null };
  }

  async function save() {
    if (!user || !projectNumber || !bereit || inzwischenGeaendert) return;
    if (selectedCount === 0) {
      setError(
        existingForProject.length > 0
          ? 'Kein Mitarbeiter ausgewählt. Zum Entfernen der Planung bitte die Einsätze unten einzeln löschen.'
          : 'Bitte mindestens einen Mitarbeiter auswählen.',
      );
      return;
    }
    // M34: eine Uhrzeit ist freiwillig — wenn beide da sind, dann in der richtigen Folge.
    if (zeitVon && zeitBis && zeitBis <= zeitVon) {
      setError('Das Ende des Einsatzes liegt vor dem Beginn — bitte die Uhrzeiten prüfen.');
      return;
    }
    if (mehrereTage && (!bisTag || bisTag <= date)) {
      setError('Bitte „bis einschließlich“ nach dem ersten Tag wählen.');
      return;
    }
    if (mehrereTage && tageEinschliesslich(date, bisTag) > FOLGETAGE_HOECHSTENS) {
      setError(`Über höchstens ${FOLGETAGE_HOECHSTENS} Tage auf einmal — weiter reicht die Prüfung der Abwesenheiten nicht.`);
      return;
    }
    setSaving(true);
    setError(null);
    const gespeichertesPaar = paar;
    try {
      const rows = staff
        .filter((u) => picks[u.uid]?.on)
        .map((u) => ({
          date,
          projectNumber,
          userId: u.uid,
          userName: u.name,
          // Helfer werden mit einem anderen Satz verrechnet — ein vergessener
          // Haken kostet bare Münze. Bei Helfer und Lehrling entscheidet die
          // Einstufung, nicht der Haken (`stufeImEinsatz`).
          asHelper: alsHelferEingestuft(u) || (!istLehrling(u) && !!picks[u.uid]?.asHelper),
          ...eigenerStand(u.uid),
          createdBy: user.uid,
        }))
        .concat(
          bleiben.map((a) => ({
            date,
            projectNumber,
            userId: a.userId,
            userName: a.userName ?? '',
            asHelper: !!a.asHelper,
            ...eigenerStand(a.userId),
            createdBy: user.uid,
          })),
        );
      /*
        DIE RUESTLISTE GEHT IM SELBEN ZUG MIT.

        Gemeldet: „ich würde es besser finden, Einsatz plus Rüstliste
        gemeinsam zu speichern und nicht einzeln. Das ist ein zusätzlicher
        Knopfdruck, auf den man potenziell vergessen kann."

        Der Einwand trifft genau die teure Stelle. Wer den zweiten Knopf
        vergisst, merkt es nicht — die Liste steht ja ausgefüllt vor ihm.
        Auffallen würde es erst am nächsten Morgen, wenn der Monteur auf
        seiner Startseite kein Material findet und ohne losfährt.

        DIE KENNUNGEN KOMMEN AUS `rows`, nicht aus der gespeicherten
        Einteilung. An dieser Liste haengt die Regel, die entscheidet, wer
        abhaken darf. Vorher musste die Mannschaft dafuer schon gespeichert
        sein — jetzt ist sie es in derselben Handlung, und zwar mit genau
        den Leuten, die eben geschrieben wurden.

        GESCHRIEBEN WIRD NUR, WENN ES ETWAS ZU SCHREIBEN GIBT: Positionen im
        Formular, oder eine bereits gespeicherte Liste, die geleert werden
        soll. Sonst entstuende fuer jeden Einsatz ein leeres Dokument.
      */
      /*
        DIE VORGEMERKTE FEHLMENGE GEHT MIT (Runde 6, M5): die Anforderung
        entsteht im selben Zug wie die Liste und trägt ihre Position. Die
        Menge ist die, die jetzt dasteht — wer nach dem Tipp die Menge
        ändert, fordert die neue Fehlmenge an.
      */
      const abholer = abholerFuer(rows.map((r) => r.userId));
      // Dieselbe Rechnung wie die Anzeige (`formularDeckung`): angefordert wird, was niemand deckt.
      const jetzt = formularDeckung(date, ruestliste, deckung, (id) => materials.find((m) => m.id === id));
      const positionen = ruestliste
        .filter((p) => p.menge > 0)
        .map((p) => {
          const gemerkt = vorgemerkt.get(p.id);
          /*
            Der Artikel kann aus der Suche über den ganzen Katalog stammen und
            nicht unter den geladenen stehen — dann rechnet das Freie der
            Datenbank, sonst gilt die gemerkte Menge.
          */
          const bekannt = !!p.materialId
            && (materials.some((m) => m.id === p.materialId) || !!deckung?.fuer?.freiVor.has(p.materialId));
          const menge = gemerkt === undefined ? 0 : bekannt ? (jetzt.get(p.id)?.fehlt ?? 0) : gemerkt;
          return menge > 0
            ? {
                ...p,
                anfordern: {
                  menge,
                  userId: abholer.uid,
                  userName: abholer.name,
                  note:
                    abholer.uid === user.uid
                      ? `Für den Einsatz am ${fmtDay(date)}`
                      : `Für den Einsatz am ${fmtDay(date)} · angelegt von ${user.name}`,
                },
              }
            : p;
        });
      const hatGespeicherteListe = tagesListen.some((l) => l.projectNumber === projectNumber);
      const listeMit = materialAn && (positionen.length > 0 || hatGespeicherteListe);
      /*
        WORAUF DIE EINGABE BERUHT (P1), für die Prüfung in der Datenbank:
        Einteilung und — wenn sie mitgeht — Rüstliste. Weicht eins davon ab,
        schreibt `einsatz_speichern` gar nichts; die Rüstliste prüft beim
        eigenen Speichern noch einmal, denn dazwischen kann jemand speichern.
      */
      const listenGrundlage = abgleich?.paar === paar ? standAus<ListenZeile>(abgleich.grundlage.liste) : undefined;
      const grundlage: PaarGrundlage | undefined = abgleich?.paar === paar
        ? {
            einteilung: standAus<EinteilungsZeile>(abgleich.grundlage.einteilung),
            ...(listeMit ? { liste: listenGrundlage } : {}),
          }
        : undefined;
      /*
        WAR DAS PAAR SCHON GEPLANT, IST „AUCH AN DEN FOLGENDEN TAGEN“ EIN
        ÄNDERN (V13): die Folgetage werden angeglichen — wer hier nicht mehr
        steht, geht auch dort. Beim Anlegen wird nur ergänzt; ein anderes Team
        an einem Folgetag bliebe sonst nicht stehen.
      */
      const angleichen = existingForProject.length > 0;
      await saveAssignments(user.companyId, date, projectNumber, rows, grundlage);
      /*
        DAS EIGENE SPEICHERN IST KEINE FREMDE ÄNDERUNG (P1): was gleich live
        zurückkommt, ist genau das hier Geschriebene. Es wird zur Grundlage,
        bevor die Meldung da ist — sonst hielte das Formular die eigene
        Einteilung für eine fremde, sobald danach weitergetippt wird.
      */
      eigenesSpeichern(gespeichertesPaar, 'einteilung', einteilungsSchluessel(rows));

      if (listeMit) {
        try {
          await saveEinsatzMaterial(
            user.companyId,
            date,
            projectNumber,
            positionen,
            rows.map((r) => r.userId),
            user.uid,
            listenGrundlage,
          );
        } catch (err) {
          /*
            Der Einsatz steht bereits — das muss dastehen. „Speichern
            fehlgeschlagen" liesse den Planer glauben, auch die Einteilung
            sei weg, und er teilte sie ein zweites Mal ein.
          */
          if (err instanceof PaarGeaendert) {
            abgewiesen(gespeichertesPaar, err);
            setError('Der Einsatz ist gespeichert, die Rüstliste nicht: sie wurde inzwischen anderswo geändert.');
            return;
          }
          setError(
            'Der Einsatz ist gespeichert, die Rüstliste nicht. Bitte noch einmal speichern.',
          );
          return;
        }
        setVorgemerkt(new Map());
        /*
          DAS GESPEICHERTE STEHT DA, wie vorher nach der Live-Meldung: Zeilen
          mit Menge 0 sind nicht gespeichert und fallen weg. Die Meldung selbst
          bringt dann nur noch `angefordert` der neuen Anforderungen.
        */
        setRuestliste(
          positionen.map((p) => {
            const ohne = { ...p };
            delete ohne.anfordern;
            return ohne;
          }),
        );
        // Leer gespeichert heißt gelöscht (`saveEinsatzMaterial`) — live steht dann keine Liste, also ''.
        eigenesSpeichern(gespeichertesPaar, 'liste', listenSchluessel(positionen));
        const angefordertJetzt = positionen.filter((p) => p.anfordern).length;
        await abschliessen(
          angefordertJetzt > 0
            ? `Einsatz und Rüstliste gespeichert, ${angefordertJetzt === 1 ? 'eine Anforderung' : `${angefordertJetzt} Anforderungen`} angelegt`
            : 'Einsatz und Rüstliste gespeichert',
          rows,
          angleichen,
        );
        return;
      }

      await abschliessen('Einsatz gespeichert', rows, angleichen);
    } catch (err) {
      // Abgewiesen, weil das Paar inzwischen anders aussieht: nichts ist geschrieben, der Hinweis fragt.
      if (err instanceof PaarGeaendert) abgewiesen(gespeichertesPaar, err);
      else setError(grundAus(err, 'Der Einsatz konnte nicht gespeichert werden.'));
    } finally {
      setSaving(false);
    }
  }

  /**
   * Nach dem ersten Tag: die Folgetage, falls gewählt, dann die Meldung.
   * Ging an einem Tag etwas anders, bleibt das Formular mit dem Bericht
   * stehen — schlösse es, wüsste niemand, dass Anton am Dienstag fehlt.
   */
  async function abschliessen(meldung: string, rows: Parameters<typeof saveAssignments>[3], angleichen = false) {
    if (!user) return;
    if (!mehrereTage || !bisTag || bisTag <= date) {
      toast.success(meldung);
      onGespeichert?.();
      return;
    }
    let bericht: ReturnType<typeof folgeBericht>;
    try {
      bericht = folgeBericht(await einsatzFolgetage(user.companyId, tagDanach(date), bisTag, projectNumber, rows, nurWerktage, angleichen));
    } catch (err) {
      // Der erste Tag steht — das muss dastehen, sonst plante man ihn ein zweites Mal.
      setError(`${meldung}. Die weiteren Tage sind nicht gespeichert: ${grundAus(err, 'unbekannter Fehler')} Bitte noch einmal speichern.`);
      return;
    }
    toast.success(`${meldung}, dazu ${bericht.geplant === 1 ? 'ein weiterer Tag' : `${bericht.geplant} weitere Tage`}`);
    if (bericht.zeilen.length > 0) {
      setFolgeZeilen(bericht.zeilen);
      return;
    }
    setMehrereTage(false);
    onGespeichert?.();
  }

  /**
   * WER DIE ANFORDERUNG ÜBER DIE FEHLMENGE ABHOLT (Testbericht 30.09.2026,
   * G31): der eingeteilte Monteur, nicht der Planer. Ein Facharbeiter vor
   * einem Helfer; ist niemand eingeteilt, bleibt es der Planer. Wer sie
   * angelegt hat, steht in der Notiz.
   *
   * Angelegt wird sie seit Runde 6 (M5) nicht mehr auf den Tipp, sondern
   * beim Speichern — siehe `save`. Nie von selbst: der Planer weiß
   * vielleicht, dass morgen eine Lieferung kommt oder das Teil schon im Bus
   * liegt.
   */
  function abholerFuer(eingeteilt: string[]): { uid: string; name: string } {
    const leute = staff.filter((u) => eingeteilt.includes(u.uid));
    const fach = leute.find((u) =>
      ['Facharbeiter', 'Obermonteur'].includes(stufeImEinsatz(picks[u.uid]?.asHelper, u)),
    );
    const wer = fach ?? leute[0];
    return wer ? { uid: wer.uid, name: wer.name } : { uid: user!.uid, name: user!.name };
  }

  if (!user) return null;

  /*
    IM SEITENFENSTER STEHT DER TERMIN-HINWEIS DIREKT UNTER DER BAUSTELLE
    (Runde 4, Auftrag 4.6): wer die Baustelle wählt, soll die Lieferung
    sofort sehen. In „Tag planen“ bleibt er, wo er war.
  */
  const terminHinweis = termineHier.length > 0 && (
    <div className="mt-3">
      <Hinweiszeile>
        <p>
          <strong>Am selben Tag auf dieser Baustelle:</strong> {termineHier.join('; ')}.
          Steht jemand zur Annahme da?
        </p>
      </Hinweiszeile>
    </div>
  );

  const einteilung = (
    <>
      <BaustellenSelect
        id="aproj"
        companyId={user.companyId}
        pausiertGetrennt
        value={projectNumber}
        onChange={(nr, p) => {
          onProjectNumber(nr);
          if (p) onProjekt(p);
        }}
      />
      {!karten && terminHinweis}

      {(holiday || weekend) && (
        <div className="mt-3">
          <Hinweiszeile stufe="warn">
            <p>
              {holiday ? `${holiday} — gesetzlicher Feiertag.` : 'Wochenende.'} Einsatz ist
              trotzdem planbar.
            </p>
          </Hinweiszeile>
        </div>
      )}

      {/*
        Wer an diesem Tag im Urlaub ist — VOR der Auswahlliste, nicht
        hinterher. Diese Zeile ist der Grund, warum der Urlaub überhaupt
        in dieser Ansicht auftaucht.
      */}
      {betriebsurlaubHeute && (
        <div className="mt-3">
          <Hinweiszeile stufe="warn" role="alert">
            <p>
              <strong>{betriebsurlaubHeute.bezeichnung}:</strong> Der Betrieb hat an diesem
              Tag zu. Einteilen geht trotzdem — etwa für einen Notdienst.
              {/* Wer ausgenommen ist, arbeitet — das gehört an dieselbe Stelle. */}
              {(betriebsurlaubHeute.ausgenommen ?? []).length > 0 && (
                <>
                  {' '}Es arbeiten:{' '}
                  {(betriebsurlaubHeute.ausgenommen ?? []).map(nameVon).join(', ')}.
                </>
              )}
            </p>
          </Hinweiszeile>
        </div>
      )}
      {imUrlaub.size > 0 && (
        <div className="mt-3">
          <Hinweiszeile>
            <p>
              <strong>Abwesend an diesem Tag:</strong>{' '}
              {[...imUrlaub].map(([uid, grund]) => `${nameVon(uid)} (${grund})`).join(', ')}
            </p>
          </Hinweiszeile>
        </div>
      )}

      {/*
        Ausdrücklich sagen, dass Mehrfach-Einteilung geht. Das Formular
        speichert je Paar aus Tag und Baustelle; wer das nicht weiß,
        vermutet hinter dem Speichern ein Überschreiben des ganzen Tages.
      */}
      {projectNumber && schonVerplant.size > 0 && (
        <div className="mt-3">
          <Hinweiszeile>
            <p>
              Einige Mitarbeiter sind heute bereits auf anderen Baustellen eingeteilt (siehe
              Hinweis am Namen). Eine zusätzliche Einteilung ist möglich — die bestehende
              bleibt bestehen.
            </p>
          </Hinweiszeile>
        </div>
      )}

      {karten && terminHinweis}

      {projectNumber && existingForProject.length > 0 && (
        <div className="mt-3">
          <Hinweiszeile>
            <p>
              Für diese Baustelle ist der Tag bereits geplant. Die Auswahl unten ist
              übernommen — Speichern überschreibt sie.
            </p>
          </Hinweiszeile>
        </div>
      )}

      {bleiben.length > 0 && (
        <div className="mt-3">
          <Hinweiszeile stufe="warn">
            <p>
              Außerdem eingeteilt, aber nicht mehr einplanbar:{' '}
              {bleiben.map((a) => a.userName || 'Mitarbeiter').join(', ')}. Bleibt beim Speichern im
              Einsatz.
            </p>
            {bleiben.map((a) => (
              <button
                key={a.userId}
                type="button"
                className="link-hinweis min-h-touch"
                onClick={() => {
                  einteilungGetippt();
                  setHerausgenommen((alt) => new Set(alt).add(a.userId));
                }}
              >
                {a.userName || 'Mitarbeiter'} aus dem Einsatz nehmen
              </button>
            ))}
          </Hinweiszeile>
        </div>
      )}

      <div className="mt-4">
        {/* Der Helfer-Haken haengt an der EINZELNEN Auswahl, deshalb als
            Zusatz je Zeile: ein vergessener Haken kostet den falschen
            Verrechnungssatz. */}
        {!staffGeladen ? (
          <fieldset>
            <legend className="mb-2 text-sm font-semibold">Mitarbeiter</legend>
            <SkeletonList rows={4} />
          </fieldset>
        ) : (
          <PersonPicker
            legend="Mitarbeiter"
            idPrefix="assign"
            people={staff.map((u) => {
              const andere = schonVerplant.get(u.uid);
              // Der Urlaub zuerst: er ist der Grund, jemanden GAR NICHT
              // einzuteilen. Eine zweite Baustelle ist nur eine Warnung.
              const hinweise = [
                imUrlaub.has(u.uid) ? (imUrlaub.get(u.uid) as string) : null,
                teilweiseWeg.has(u.uid) ? (teilweiseWeg.get(u.uid) as string) : null,
                andere?.length ? `schon eingeteilt: ${andere.join(', ')}` : null,
              ].filter(Boolean);
              return {
                uid: u.uid,
                name: u.name,
                /*
                  „FREI“ STEHT DA, nicht nur das Gegenteil (Linie „Lot“, E2):
                  wer einteilt, sucht die Freien — bei zwanzig Namen soll er
                  nicht aus dem Fehlen eines Hinweises schliessen müssen.
                */
                hint: hinweise.length > 0 ? hinweise.join(' · ') : 'frei',
                // Genau dieselben zwei Gruende, die schon im Hinweis
                // stehen — nur maschinenlesbar, damit die Liste sie
                // sortieren und filtern kann.
                // Stundenweise weg macht niemanden unfrei — vormittags
                // ist er da.
                nichtFrei: imUrlaub.has(u.uid) || !!andere?.length,
                abwesend: imUrlaub.has(u.uid),
              };
            })}
            selected={staff.filter((u) => picks[u.uid]?.on).map((u) => u.uid)}
            onChange={(next) => {
              einteilungGetippt();
              setPicks(() => {
                const out: Record<string, Pick> = {};
                // Neu Gewählte bekommen den Haken aus der Einstufung.
                for (const uid of next) {
                  out[uid] = {
                    on: true,
                    asHelper: picks[uid]
                      ? !!picks[uid].asHelper
                      : alsHelferEingestuft(staff.find((u) => u.uid === uid)),
                  };
                }
                return out;
              });
            }}
            emptyHint="Keine aktiven Mitarbeiter vorhanden."
            renderExtra={(uid) => {
              // Helfer und Lehrling: die Einstufung steht fest, ein Haken
              // hätte keine Wirkung bzw. den falschen Satz.
              const person = staff.find((u) => u.uid === uid);
              if (alsHelferEingestuft(person) || istLehrling(person)) {
                return <span className="text-sm text-ink-muted">{stufeImEinsatz(false, person)}</span>;
              }
              return (
                <Schalter
                  id={`helper-${uid}`}
                  label="als Helfer"
                  an={!!picks[uid]?.asHelper}
                  onChange={(wert) => {
                    einteilungGetippt();
                    setPicks((c) => ({ ...c, [uid]: { on: true, asHelper: wert } }));
                  }}
                />
              );
            }}
          />
        )}
      </div>

      {abweichungen.length > 0 && (
        <div className="mt-4 space-y-2" role="group" aria-label="Verschiedene Aufgaben und Uhrzeiten">
          <Hinweiszeile>
            <p>
              <strong>Die Eingeteilten haben verschiedene Aufgaben oder Uhrzeiten.</strong>{' '}
              {angleichen
                ? 'Beim Speichern bekommen alle die Aufgabe und Uhrzeit unten.'
                : 'Sie bleiben beim Speichern erhalten; Aufgabe und Uhrzeit unten gelten für neu Eingeteilte.'}
            </p>
          </Hinweiszeile>
          <ul className="text-sm text-ink">
            {abweichungen.map((a) => (
              <li key={a.userId}>{a.name}: {a.text}</li>
            ))}
          </ul>
          <Schalter id="aangleichen" label="Allen dieselbe Aufgabe und Uhrzeit geben" an={angleichen}
            onChange={(wert) => { einteilungGetippt(); setAngleichen(wert); }} />
        </div>
      )}
      <div className="mt-4">
        {/* Die Beschriftung bleibt dieselbe; wofür das Feld bei verschiedenen Ständen gilt, sagt der Hinweis darüber. */}
        <InputField id="acomment" label="Kommentar / Aufgabe" value={comment}
          onChange={(e) => { einteilungGetippt(); setComment(e.target.value); }} />
      </div>
      {/*
        M34: optional — ohne Uhrzeit gilt der ganze Tag. Volle Breite wie
        „Kommentar / Aufgabe“ darüber: mit `sm:max-w-sm` endete „Ende“ 16 px
        vor der rechten Kante des Formulars (E72, R5).
      */}
      <div className="mt-4 grid grid-cols-2 gap-4">
        <InputField id="azeitvon" label="Beginn (optional)" type="time" value={zeitVon}
          onChange={(e) => { einteilungGetippt(); setZeitVon(e.target.value); }} />
        <InputField id="azeitbis" label="Ende (optional)" type="time" value={zeitBis}
          onChange={(e) => { einteilungGetippt(); setZeitBis(e.target.value); }} />
      </div>
      {/*
        DIE UHRZEIT WIEDER WEGNEHMEN (gemeldet am 03.10.2026). Das
        Uhrzeitfeld am iPhone hat keinen Knopf zum Leeren — einmal
        gesetzt, liess sich der Einsatz nur neu planen. Ohne Uhrzeit gilt
        wieder der ganze Tag; gespeichert wird es erst mit „Einsatz
        speichern“, wie jede andere Änderung hier.
      */}
      {(zeitVon || zeitBis) && (
        <Button type="button" variant="ghost" className="mt-1" onClick={() => { einteilungGetippt(); setZeitVon(''); setZeitBis(''); }}>
          Uhrzeit entfernen
        </Button>
      )}
      {/* Verdrehte Zeiten gleich sagen, nicht erst beim Speichern (05.10.2026). */}
      {zeitVon && zeitBis && zeitBis <= zeitVon && (
        <div className="mt-2">
          <Hinweiszeile stufe="warn">
            <p>Das Ende liegt nicht nach dem Beginn — so lässt sich der Einsatz nicht speichern.</p>
          </Hinweiszeile>
        </div>
      )}
      {/*
        ÜBER MEHRERE TAGE (B4, E85). Zugeklappt hinter einem Haken: der
        einzelne Tag bleibt der gewohnte Weg und das Formular so kurz wie
        bisher. Nicht im Einblick des Supports: die Abwesenheiten der
        Belegschaft sieht nur der Betrieb; ohne sie würde still jemand im
        Urlaub eingeteilt.
      */}
      {!einblick && (
        <div className="mt-4 space-y-3">
          <Schalter id="amehrere" label="Auch an den folgenden Tagen" an={mehrereTage}
            onChange={(wert) => { setMehrereTage(wert); setFolgeZeilen(null); }} />
          {mehrereTage && existingForProject.length > 0 && (
            // V13: am geplanten Paar ist das ein Ändern der Folgetage, kein Ergänzen.
            <p className="text-sm text-ink-muted">
              Die folgenden Tage werden angeglichen: wer hier nicht mehr eingeteilt ist, wird dort herausgenommen;
              Aufgabe und Uhrzeit kommen von hier.
            </p>
          )}
          {mehrereTage && (
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 sm:items-end">
              <InputField id="abis" label="bis einschließlich" type="date" value={bisTag} min={tagDanach(date)}
                max={tagDanach(date, FOLGETAGE_HOECHSTENS - 1)} onChange={(e) => setBisTag(e.target.value)} />
              <Schalter id="awerktage" label="nur Werktage" an={nurWerktage}
                onChange={(wert) => setNurWerktage(wert)} />
            </div>
          )}
        </div>
      )}
      {/*
        Nicht verbieten, sondern sagen. Bei einem Notdienst holt man auch
        mal jemanden aus dem Urlaub; eine Sperre stünde dann im Weg. Ein
        stilles Durchwinken wäre aber genauso falsch.
      */}
      {verplanteUrlauber.length > 0 && (
        <div className="mt-2">
          <Hinweiszeile stufe="warn">
            <p>
              <strong>{verplanteUrlauber.join(', ')}</strong>{' '}
              {verplanteUrlauber.length === 1 ? 'ist' : 'sind'} an diesem Tag abwesend. Das
              Einteilen geht trotzdem — gemeint ist es meistens nicht.
            </p>
          </Hinweiszeile>
        </div>
      )}
    </>
  );

  /*
    NACH dem Einsatz, VOR dem Speichern. Erst steht fest, wer hinfährt;
    dann, was mitkommt. Und nur mit gewählter Baustelle — eine Rüstliste
    ohne Baustelle gehört zu nichts.
  */
  const material: ReactNode =
    materialAn && projectNumber ? (
      <>
        <RuestlistePlanen
          companyId={user?.companyId}
          materials={materials}
          positionen={ruestliste}
          onChange={(neu) => {
            listeGetippt();
            setRuestliste(neu);
          }}
          onVormerken={(id, menge) => {
            listeGetippt();
            setVorgemerkt((alt) => {
              const neu = new Map(alt);
              if (menge != null) neu.set(id, menge);
              else neu.delete(id);
              return neu;
            });
          }}
          vorgemerkt={vorgemerkt}
          onOffen={setOffeneRuestzeile}
          datum={date}
          deckung={deckung}
          zustaende={bereitschaftAn}
        />
      </>
    ) : null;

  /*
    EIN Knopf fuer das ganze Formular, am Ende des Formulars.

    Vorher standen hier zwei: einer fuer die Mannschaft, einer fuer die
    Ruestliste. Gemeldet: „das ist ein zusätzlicher Knopfdruck, auf den man
    potenziell vergessen kann." Und vergessen faellt nicht auf — die
    ausgefuellte Liste steht ja da; auffallen wuerde es erst dem Monteur am
    naechsten Morgen.

    Er steht UNTER der Ruestliste, nicht darueber: sonst scrollte man beim
    Ausfuellen an ihm vorbei und suchte ihn danach unten.
  */
  const speicherHinweise = (
    <>
      {/*
        DIREKT AM SPEICHERN, nicht oben im Formular: hier entscheidet sich, ob
        überschrieben wird, und im Seitenfenster steht die Fußleiste immer im
        Blick. Ruhig gehalten — eine Zeile mit Symbol, keine Fläche. Der Knopf
        ist bis zur Entscheidung gesperrt; hier steht, warum.
      */}
      {inzwischenGeaendert && (
        <div className="mb-3" role="status">
          <Hinweiszeile>
            <div className="space-y-2">
              <p>
                <strong>Inzwischen geändert — übernehmen?</strong>{' '}
                {fremdeEinteilung && fremdeListe
                  ? 'Einteilung und Rüstliste dieser Baustelle wurden'
                  : fremdeEinteilung
                    ? 'Die Einteilung dieser Baustelle wurde'
                    : 'Die Rüstliste dieser Baustelle wurde'}{' '}
                für diesen Tag anderswo geändert, während hier bearbeitet wurde. Wer die eigene
                Eingabe behält, überschreibt die Änderung beim Speichern.
                {neuerStandUnterwegs && ' Die Eingabe ist noch nicht gespeichert; der neue Stand wird geladen.'}
              </p>
              <div className="flex flex-wrap gap-2">
                <Button
                  variant="secondary"
                  disabled={neuerStandUnterwegs}
                  onClick={() => {
                    // Nur der fremd geänderte Teil; was sonst getippt ist, bleibt.
                    if (fremdeEinteilung) einteilungUebernehmen();
                    if (fremdeListe) listeUebernehmen();
                    fremdGesehen();
                  }}
                >
                  Übernehmen
                </Button>
                <Button
                  variant="ghost"
                  // Der fremde Stand ist gesehen; Speichern ersetzt ihn jetzt mit Wissen.
                  onClick={fremdGesehen}
                >
                  Meine Eingabe behalten
                </Button>
              </div>
            </div>
          </Hinweiszeile>
        </div>
      )}
      {error && <div className="mb-3"><ErrorState message={error} /></div>}
      {folgeZeilen && (
        <div className="mb-3" role="status">
          <Hinweiszeile stufe="warn">
            <p><strong>Nicht an jedem Tag wie gewählt:</strong></p>
            <ul className="mt-1 space-y-1">{folgeZeilen.map((z) => <li key={z}>{z}</li>)}</ul>
          </Hinweiszeile>
          <Button type="button" variant="secondary" className="mt-2"
            onClick={() => { setFolgeZeilen(null); setMehrereTage(false); onGespeichert?.(); }}>
            Fertig
          </Button>
        </div>
      )}
      {/* Der Knopf ist gesperrt — hier steht, warum, statt dass er grundlos grau bleibt. */}
      {projectNumber && !bereit && (
        <p className="mb-3 text-sm text-ink-muted" role="status">
          Die Planung dieses Tages wird noch geladen. Speichern geht, sobald sie da ist.
        </p>
      )}
      {/*
        EINGETIPPT, ABER NICHT HINZUGEFÜGT — wie am Handwerksschein. Die
        freie Zeile kommt erst mit „Hinzufügen" auf die Rüstliste; wer sie
        eintippt und gleich speichert, verlor sie still, und der Monteur
        stand ohne das Leihgerät auf der Baustelle.
      */}
      {offeneRuestzeile && materialAn && (
        <div className="mb-3">
          <Hinweiszeile stufe="warn" role="alert">
            <p>
              <strong>Noch nicht auf der Rüstliste:</strong> {offeneRuestzeile}. Bitte
              „Hinzufügen“ oder das Feld leeren.
            </p>
          </Hinweiszeile>
        </div>
      )}
    </>
  );
  const speicherKnopf = (
    <Button
      onClick={save}
      loading={saving}
      disabled={!projectNumber || !bereit || inzwischenGeaendert || (materialAn && !!offeneRuestzeile)}
    >
      {materialAn && projectNumber ? 'Einsatz und Rüstliste speichern' : 'Einsatz speichern'}
    </Button>
  );
  /*
    SPEICHERN IM BLATT, NICHT DARUNTER (E72, 09.11.2026): der Knopf stand
    nach der letzten Karte frei auf dem Raster. Jetzt schließt er das letzte
    Blatt ab — mit der Rüstliste das Material, sonst die Einteilung — als
    Formularfuß wie überall (`Aktionsleiste`).
  */
  const speichern = (
    <>
      {speicherHinweise}
      <Aktionsleiste rechts={speicherKnopf} />
    </>
  );

  if (karten) {
    return (
      <>
        {/*
          `lg:space-y-4`: ab 1.200 px steht der Fuß ohne Linie und ohne Rand
          (index.css) — ohne die 16 px klebte „Einsatz speichern“ am Feld
          „Ende“ (R7). Darunter bringt die Leiste ihren Abstand selbst mit.
        */}
        <Card title={karten.titel}>
          <div className="lg:space-y-4">
            {einteilung}
            {!material && speichern}
          </div>
        </Card>
        {material && (
          <Card title="Material für diesen Einsatz" hint={MATERIAL_HINWEIS}>
            <div className="lg:space-y-4">
              {material}
              {speichern}
            </div>
          </Card>
        )}
      </>
    );
  }

  /*
    IM SEITENFENSTER: eine Fläche, Abschnitte statt Karten (Regel 1). Das
    „i“ bleibt hier am Platz — ein Fenster verdeckt die Hilfe der Seite.
  */
  return (
    <div className="space-y-6">
      <div>{einteilung}</div>
      {material && (
        <section aria-label="Material für diesen Einsatz">
          <h3 className="planung-abschnitt">
            Material für diesen Einsatz
            <InfoHint about="Material für diesen Einsatz">{MATERIAL_HINWEIS}</InfoHint>
          </h3>
          {material}
        </section>
      )}
      {/*
        „EINSATZ LÖSCHEN“ BEIM BEARBEITEN (Linie „Lot“, E2) — je Person, wie
        bisher in der Tagesplanung: gespeichert wird je Paar aus Tag und
        Baustelle, gelöscht je Eingeteiltem.

        DIE RÜCKFRAGE BLEIBT, und zwar IM FENSTER statt als Dialog darüber.
        Ein „Rückgängig“ stellte den Einsatz nicht exakt wieder her (neue
        Kennung, neuer Zeitstempel), also bleibt es bei der Rückfrage. Als
        zweiter Dialog über dem Fenster schlösse Esc beide zugleich — und
        nähme ungespeicherte Eingaben im Formular mit.
      */}
      {onLoeschen && existingForProject.length > 0 && (
        <section aria-label="Gespeichert eingeteilt">
          <h3 className="planung-abschnitt">Gespeichert eingeteilt</h3>
          <List>
            {existingForProject.map((a) => (
              <ListRow
                key={a.id}
                title={a.userName}
                subtitle={stufeImEinsatz(a.asHelper, users.find((u) => u.uid === a.userId))}
              >
                <Button
                  variant="secondary"
                  aria-label={`Einsatz von ${a.userName} löschen`}
                  onClick={() => setLoeschFrage(a)}
                  disabled={loeschtGerade}
                >
                  Einsatz löschen
                </Button>
              </ListRow>
            ))}
          </List>
          {loeschFrage && (
            <div className="mt-3" role="alertdialog" aria-label="Einsatz löschen?">
              <Hinweiszeile stufe="warn">
                <div className="space-y-3">
                  <p>
                    <strong>Einsatz löschen?</strong> Der Einsatz von {loeschFrage.userName} am{' '}
                    {fmtDay(loeschFrage.date)} wird entfernt.
                  </p>
                  {ruestFrage && (
                    <RuestlisteWahl
                      name="formular-ruestliste"
                      frage={ruestFrage.frage}
                      wahl={ruestFrage.wahl}
                      onWahl={(w) => setRuestFrage((f) => (f ? { ...f, wahl: w } : f))}
                    />
                  )}
                  {!einblick && (
                    <FolgetageWahl id="formular-folge" tag={loeschFrage.date} stand={loeschFolge} onStand={setLoeschFolge} />
                  )}
                  <div className="flex flex-wrap gap-2">
                    <Button
                      variant="danger"
                      loading={loeschtGerade}
                      disabled={(!!ruestFrage && !ruestFrage.wahl) || !folgetageGueltig(loeschFrage.date, loeschFolge)}
                      onClick={async () => {
                        const weg = loeschFrage;
                        setLoeschtGerade(true);
                        let ergebnis: RuestlisteErgebnis | null;
                        try {
                          ergebnis = await onLoeschen(weg, ruestFrage?.wahl ?? 'fragen');
                        } catch (e) {
                          setLoeschtGerade(false);
                          // Der Letzte, und eine Rüstliste hängt daran: die Frage bleibt im Fenster stehen.
                          if (e instanceof RuestlisteFrage) {
                            setRuestFrage({ frage: e, wahl: null });
                            return;
                          }
                          toast.error(`Der Einsatz von ${weg.userName} konnte nicht gelöscht werden.`);
                          setLoeschFrage(null);
                          return;
                        }
                        try {
                          /*
                            DAS EIGENE LÖSCHEN IST KEINE FREMDE ÄNDERUNG (P1):
                            die Person geht aus der Auswahl, der Rest wird
                            Grundlage — was sonst getippt ist, bleibt stehen.
                          */
                          const rest = existingForProject.filter((a) => a.id !== weg.id);
                          const fuer = paar;
                          if (paarJetzt.current === fuer) {
                            setAbgleich((a) =>
                              a && a.paar === fuer
                                ? { ...a, grundlage: { ...a.grundlage, einteilung: einteilungsSchluessel(rest) } }
                                : a,
                            );
                            if (!rest.some((a) => a.userId === weg.userId)) {
                              setPicks((alt) => {
                                const ohne = { ...alt };
                                delete ohne[weg.userId];
                                return ohne;
                              });
                            }
                          }
                          /*
                            AUCH AN DEN FOLGENDEN TAGEN (V13): dieselbe Person,
                            dieselbe Baustelle — leer gewordene Tage behalten
                            ihre Rüstliste nach derselben Wahl wie heute.
                          */
                          let folge = '';
                          if (loeschFolge.an) {
                            try {
                              folge = entferntBericht(await einsatzFolgetageEntfernen(
                                tagDanach(weg.date), loeschFolge.bis, weg.projectNumber, weg.userId,
                                ruestFrage?.wahl === 'aufloesen' ? 'aufloesen' : 'behalten',
                              ));
                            } catch (e) {
                              folge = ` · an den folgenden Tagen nicht entfernt: ${grundAus(e, 'unbekannter Fehler')}`;
                            }
                          }
                          toast.success(`Einsatz gelöscht${entferntText(ergebnis)}${folge}`);
                        } finally {
                          setLoeschtGerade(false);
                          setLoeschFrage(null);
                        }
                      }}
                    >
                      Löschen
                    </Button>
                    <Button variant="ghost" onClick={() => setLoeschFrage(null)} disabled={loeschtGerade}>
                      Abbrechen
                    </Button>
                  </div>
                </div>
              </Hinweiszeile>
            </div>
          )}
        </section>
      )}
      {/*
        DIE FUSSLEISTE BLEIBT STEHEN (Runde 4, Auftrag 4.6): Speichern ist
        immer zu sehen, auch bei langer Personenliste und Rüstliste. Daneben
        „Ganzen Tag ansehen“ — der ganze Tag ist einen Tipp entfernt.
      */}
      <div className="planung-fuss">
        {speicherHinweise}
        <div className="planung-fuss-knoepfe">
          {fussNeben}
          {speicherKnopf}
        </div>
      </div>
    </div>
  );
}
