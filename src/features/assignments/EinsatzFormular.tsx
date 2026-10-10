import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { useAuth } from '@/app/AuthContext';
import { lagerFrei, type LagerStand } from '@/lib/db/materials';
import { createMaterialOrder } from '@/lib/db/materialOrders';
import { saveAssignments } from '@/lib/db/assignments';
import { saveEinsatzMaterial } from '@/lib/db/einsatzMaterial';
import type { Abwesenheit } from '@/lib/db/vacations';
import { todayStr, getAustrianHolidayName, isWeekend } from '@/lib/time';
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
import Hinweiszeile from '@/components/Hinweiszeile';
import Button from '@/components/Button';
import InfoHint from '@/components/InfoHint';
import { InputField, CheckboxField } from '@/components/Field';
import BaustellenSelect from '@/components/BaustellenSelect';
import PersonPicker from '@/components/PersonPicker';
import { List, ListRow } from '@/components/ListRow';
import { useModul } from '@/lib/useModule';
import { useToast } from '@/components/Toast';
import { ErrorState } from '@/components/States';
import { grundAus } from '@/lib/fehlerGrund';
import { terminKopf } from '@/features/termine/terminText';
import RuestlistePlanen from './RuestlistePlanen';
import { abwesendAm, fmtDay, useMaterialstamm } from './einsatzDaten';
import { alsHelferEingestuft, istLehrling, stufeImEinsatz } from './stufeImEinsatz';

/** Auswahlzustand je Mitarbeiter: eingeteilt und in welcher Rolle. */
interface Pick {
  on: boolean;
  asHelper: boolean;
}

const MATERIAL_HINWEIS = (
  <>
    Was der Monteur am Einsatztag mitnehmen soll. Er sieht die Liste auf seiner Startseite und hakt
    ab, was im Bus ist. Der Lagerstand ändert sich dadurch
    <strong> nicht</strong> — gebucht wird er weiterhin über die Materialanforderung und das
    Abholen.
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
  projects,
  onProjekt,
  tagesEinsaetze,
  urlaube,
  betriebsurlaube,
  termineDesTages,
  tagesListen,
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
  projects: Project[];
  /** Eine in der Auswahl nachgeladene Baustelle (etwa eine abgeschlossene). */
  onProjekt: (p: WithId<Project>) => void;
  /** Alle Einsätze DIESES Tages — gleichbleibend, solange sie sich nicht ändern. */
  tagesEinsaetze: WithId<Assignment>[];
  urlaube: Abwesenheit[];
  betriebsurlaube: Betriebsurlaub[];
  termineDesTages: Termin[];
  tagesListen: WithId<EinsatzMaterial>[];
  /** In der Tagesplanung als Karten; ohne die Angabe für das Seitenfenster. */
  karten?: { titel: string };
  /** Nach vollständigem Speichern (Einsatz und Rüstliste). */
  onGespeichert?: () => void;
  /**
   * Im Seitenfenster: die gespeicherten Einsätze dieser Baustelle einzeln
   * löschen. Erst nach der Rückfrage im Fenster; ein Fehlschlag wirft.
   */
  onLoeschen?: (a: WithId<Assignment>) => Promise<void>;
  /**
   * Im Seitenfenster: ein Nebenknopf in der Fußleiste neben dem Speichern
   * (Runde 4: „Ganzen Tag ansehen“).
   */
  fussNeben?: ReactNode;
}) {
  const { user } = useAuth();
  const toast = useToast();
  const materialAn = useModul('material');
  /*
    DER MATERIALSTAMM ERST MIT DER RÜSTLISTE (Analyse 09.10.2026, Maßnahme
    9): bis zu 1.000 Artikel, live — gebraucht nur, sobald eine Baustelle
    gewählt ist und damit die Rüstliste dasteht. Vorher holte ihn jede
    Tagesplanung und jedes Seitenfenster beim Öffnen.
  */
  const materials = useMaterialstamm(user?.companyId, materialAn && !!projectNumber);

  const [picks, setPicks] = useState<Record<string, Pick>>({});
  const [comment, setComment] = useState('');
  /** Optional die Uhrzeit des Einsatzes (M34). Leer: der ganze Tag. */
  const [zeitVon, setZeitVon] = useState('');
  const [zeitBis, setZeitBis] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  /*
    Die Rüstliste. Sie hängt am Paar aus Tag und Baustelle, nicht an der
    Person — deshalb ein eigener Zustand neben `picks`.
  */
  const [ruestliste, setRuestliste] = useState<RuestPosition[]>([]);
  /** Rüstpositionen, für die in dieser Sitzung eine Anforderung angelegt wurde (G14). */
  const [angefordert, setAngefordert] = useState<Set<string>>(new Set());
  /** Frei je Artikel laut Datenbank (M32) — `null`, solange unbekannt. */
  const [lagerStand, setLagerStand] = useState<Map<string, LagerStand> | null>(null);
  /** Eine freie Zeile der Rüstliste, die eingetippt, aber nicht hinzugefügt ist. */
  const [offeneRuestzeile, setOffeneRuestzeile] = useState<string | null>(null);
  const [ruestFehler, setRuestFehler] = useState<string | null>(null);
  const [anforderungLaeuft, setAnforderungLaeuft] = useState(false);
  /** Welcher Einsatz gerade gelöscht werden soll — die Rückfrage steht im Fenster. */
  const [loeschFrage, setLoeschFrage] = useState<WithId<Assignment> | null>(null);
  const [loeschtGerade, setLoeschtGerade] = useState(false);

  /** Mit welcher Person das Fenster geöffnet wurde — sie kommt zur übernommenen Planung dazu. */
  const startPick = useMemo(() => {
    if (!startPerson) return null;
    const p = staff.find((u) => u.uid === startPerson);
    return p ? { uid: p.uid, pick: { on: true, asHelper: alsHelferEingestuft(p) } } : null;
  }, [startPerson, staff]);

  /**
   * Vorhandene Planung ins Formular übernehmen, sobald Datum UND Baustelle
   * stehen. Ohne das startete das Formular leer und das Speichern hätte die
   * bestehenden Einsätze gelöscht (delete-then-recreate) — echter Datenverlust,
   * wenn eigentlich nur der Kommentar geändert werden sollte.
   *
   * Kommt das Fenster aus der freien Zelle einer Person, steht sie zusätzlich
   * angehakt da: genau dafür wurde die Zelle angetippt.
   */
  useEffect(() => {
    const dazu = startPick ? { [startPick.uid]: startPick.pick } : {};
    if (!projectNumber) {
      setPicks(dazu);
      setComment('');
      setZeitVon('');
      setZeitBis('');
      return;
    }
    const existing = tagesEinsaetze.filter((a) => a.projectNumber === projectNumber);
    const next: Record<string, Pick> = { ...dazu };
    for (const a of existing) next[a.userId] = { on: true, asHelper: !!a.asHelper };
    setPicks(next);
    setComment(existing[0]?.comment ?? '');
    setZeitVon(existing[0]?.zeitVon ?? '');
    setZeitBis(existing[0]?.zeitBis ?? '');
  }, [projectNumber, tagesEinsaetze, startPick]);

  /**
   * Dieselbe Vorsicht wie bei der Mannschaft: eine vorhandene Rüstliste kommt
   * ins Formular, bevor jemand speichern kann. Startete es leer, hätte ein
   * Speichern die geplante Liste gelöscht — und der Monteur führe am
   * nächsten Morgen ohne Material los.
   */
  useEffect(() => {
    if (!projectNumber) {
      setRuestliste([]);
      return;
    }
    const treffer = tagesListen.find((l) => l.projectNumber === projectNumber);
    setRuestliste(treffer?.positionen ?? []);
  }, [projectNumber, tagesListen]);

  /*
    WAS FÜR DIESE RÜSTLISTE FREI IST (Testbericht 30.09.2026, M32): frei
    nach Zusagen und allen Rüstlisten ab heute, die eigene gespeicherte
    Menge wieder dazugezählt — sonst reservierte sie sich selbst weg.
  */
  useEffect(() => {
    if (!user) return;
    let weg = false;
    Promise.resolve()
      .then(() => lagerFrei([
        ...materials.map((m) => m.id),
        // Eine Position kann auf einen Artikel zeigen, der nicht im geladenen Katalog steht.
        ...tagesListen.flatMap((l) => (l.positionen ?? []).map((p) => p.materialId ?? '')),
      ]))
      .then((k) => { if (!weg) setLagerStand(k); })
      .catch(() => undefined);
    return () => { weg = true; };
  }, [user, materials, tagesListen]);

  const ruestVerfuegbar = useMemo(() => {
    if (!lagerStand) return undefined;
    const eigene = new Map<string, number>();
    if (date >= todayStr()) {
      for (const p of tagesListen.find((l) => l.projectNumber === projectNumber)?.positionen ?? []) {
        if (p.materialId) eigene.set(p.materialId, (eigene.get(p.materialId) ?? 0) + p.menge);
      }
    }
    const karte = new Map<string, number>();
    for (const [id, st] of lagerStand) karte.set(id, st.frei + (eigene.get(id) ?? 0));
    return karte;
  }, [lagerStand, tagesListen, projectNumber, date]);

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

  const selectedCount = Object.values(picks).filter((p) => p.on).length;
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
  const existingForProject = tagesEinsaetze.filter((a) => a.projectNumber === projectNumber);
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

  async function save() {
    if (!user || !projectNumber) return;
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
    setSaving(true);
    setError(null);
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
          comment,
          zeitVon: zeitVon || null,
          zeitBis: zeitBis || null,
          createdBy: user.uid,
        }));
      await saveAssignments(user.companyId, date, projectNumber, rows);

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
      const positionen = ruestliste.filter((p) => p.menge > 0);
      const hatGespeicherteListe = tagesListen.some((l) => l.projectNumber === projectNumber);
      if (materialAn && (positionen.length > 0 || hatGespeicherteListe)) {
        try {
          await saveEinsatzMaterial(
            user.companyId,
            date,
            projectNumber,
            positionen,
            rows.map((r) => r.userId),
            user.uid,
          );
        } catch {
          /*
            Der Einsatz steht bereits — das muss dastehen. „Speichern
            fehlgeschlagen" liesse den Planer glauben, auch die Einteilung
            sei weg, und er teilte sie ein zweites Mal ein.
          */
          setError(
            'Der Einsatz ist gespeichert, die Rüstliste nicht. Bitte noch einmal speichern.',
          );
          return;
        }
        toast.success('Einsatz und Rüstliste gespeichert');
        onGespeichert?.();
        return;
      }

      toast.success('Einsatz gespeichert');
      onGespeichert?.();
    } catch (err) {
      setError(grundAus(err, 'Der Einsatz konnte nicht gespeichert werden.'));
    } finally {
      setSaving(false);
    }
  }

  /**
   * Aus einer Unterdeckung eine Materialanforderung machen — AUF TIPP.
   *
   * Nie von selbst: der Planer weiß vielleicht, dass morgen eine Lieferung
   * kommt oder das Teil schon im Bus liegt. Eine Schreibung in die
   * Arbeitsliste eines anderen, auf Grundlage einer Vermutung, ist genau die
   * Sorte Funktion, die das Vertrauen in die App kostet.
   *
   * Der LAGERSTAND BLEIBT UNANGETASTET. Abgezogen wird erst, wenn die
   * Anforderung erledigt oder abgeholt wird — dort, wo es schon immer
   * passiert. Zweimal abziehen hieße, den Bestand kaputtzurechnen.
   */
  async function anforderungAnlegen(position: RuestPosition, fehlmenge: number) {
    if (!user) return;
    /*
      WER ABHOLT, STEHT AUF DER ANFORDERUNG (Testbericht 30.09.2026, G31):
      der eingeteilte Monteur, nicht der Planer. Ein Facharbeiter vor einem
      Helfer; ist noch niemand eingeteilt, bleibt es der Planer. Wer sie
      angelegt hat, steht in der Notiz.
    */
    const eingeteilt = staff.filter((u) => picks[u.uid]?.on);
    const abholer =
      eingeteilt.find((u) =>
        ['Facharbeiter', 'Obermonteur'].includes(stufeImEinsatz(picks[u.uid]?.asHelper, u)),
      ) ?? eingeteilt[0] ?? { uid: user.uid, name: user.name };
    setAnforderungLaeuft(true);
    setRuestFehler(null);
    try {
      await createMaterialOrder(user.companyId, {
        materialId: position.materialId ?? '',
        materialName: position.name,
        quantity: fehlmenge,
        projectNumber,
        note:
          abholer.uid === user.uid
            ? `Für den Einsatz am ${fmtDay(date)}`
            : `Für den Einsatz am ${fmtDay(date)} · angelegt von ${user.name}`,
        status: 'Offen',
        transactionType: 'order',
        userId: abholer.uid,
        userName: abholer.name,
      });
      setAngefordert((alt) => new Set(alt).add(position.id));
      toast.success('Anforderung angelegt');
    } catch {
      setRuestFehler('Die Anforderung konnte nicht angelegt werden.');
    } finally {
      setAnforderungLaeuft(false);
    }
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

      <div className="mt-4">
        {/* Der Helfer-Haken haengt an der EINZELNEN Auswahl, deshalb als
            Zusatz je Zeile: ein vergessener Haken kostet den falschen
            Verrechnungssatz. */}
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
          onChange={(next) =>
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
            })
          }
          emptyHint="Keine aktiven Mitarbeiter vorhanden."
          renderExtra={(uid) => {
            // Helfer und Lehrling: die Einstufung steht fest, ein Haken
            // hätte keine Wirkung bzw. den falschen Satz.
            const person = staff.find((u) => u.uid === uid);
            if (alsHelferEingestuft(person) || istLehrling(person)) {
              return <span className="text-sm text-ink-muted">{stufeImEinsatz(false, person)}</span>;
            }
            return (
              <CheckboxField
                id={`helper-${uid}`}
                label="als Helfer"
                checked={!!picks[uid]?.asHelper}
                onChange={(e) =>
                  setPicks((c) => ({ ...c, [uid]: { on: true, asHelper: e.target.checked } }))
                }
              />
            );
          }}
        />
      </div>

      <div className="mt-4">
        <InputField id="acomment" label="Kommentar / Aufgabe" value={comment}
          onChange={(e) => setComment(e.target.value)} />
      </div>
      {/* M34: optional — ohne Uhrzeit gilt der ganze Tag. */}
      <div className="mt-4 grid grid-cols-2 gap-4 sm:max-w-sm">
        <InputField id="azeitvon" label="Beginn (optional)" type="time" value={zeitVon}
          onChange={(e) => setZeitVon(e.target.value)} />
        <InputField id="azeitbis" label="Ende (optional)" type="time" value={zeitBis}
          onChange={(e) => setZeitBis(e.target.value)} />
      </div>
      {/*
        DIE UHRZEIT WIEDER WEGNEHMEN (gemeldet am 03.10.2026). Das
        Uhrzeitfeld am iPhone hat keinen Knopf zum Leeren — einmal
        gesetzt, liess sich der Einsatz nur neu planen. Ohne Uhrzeit gilt
        wieder der ganze Tag; gespeichert wird es erst mit „Einsatz
        speichern“, wie jede andere Änderung hier.
      */}
      {(zeitVon || zeitBis) && (
        <Button type="button" variant="ghost" className="mt-1" onClick={() => { setZeitVon(''); setZeitBis(''); }}>
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
          materials={materials}
          positionen={ruestliste}
          onChange={setRuestliste}
          onAnforderung={anforderungAnlegen}
          anforderungLaeuft={anforderungLaeuft}
          onOffen={setOffeneRuestzeile}
          verfuegbar={ruestVerfuegbar}
          angefordert={angefordert}
        />
        {/*
          Der Fehler der ANFORDERUNG steht hier — sie ist ein eigener
          Vorgang mit eigenem Knopf. Der Fehler des Speicherns steht unten
          beim Speichern.
        */}
        {ruestFehler && <div className="mt-3"><ErrorState message={ruestFehler} /></div>}
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
      {error && <div className="mb-3"><ErrorState message={error} /></div>}
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
      disabled={!projectNumber || (materialAn && !!offeneRuestzeile)}
    >
      {materialAn && projectNumber ? 'Einsatz und Rüstliste speichern' : 'Einsatz speichern'}
    </Button>
  );
  const speichern = (
    <div>
      {speicherHinweise}
      {speicherKnopf}
    </div>
  );

  if (karten) {
    return (
      <>
        <Card title={karten.titel}>{einteilung}</Card>
        {material && (
          <Card title="Material für diesen Einsatz" hint={MATERIAL_HINWEIS}>
            {material}
          </Card>
        )}
        {speichern}
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
                  <div className="flex flex-wrap gap-2">
                    <Button
                      variant="danger"
                      loading={loeschtGerade}
                      onClick={async () => {
                        const weg = loeschFrage;
                        setLoeschtGerade(true);
                        try {
                          await onLoeschen(weg);
                          toast.success('Einsatz gelöscht');
                        } catch {
                          toast.error(`Der Einsatz von ${weg.userName} konnte nicht gelöscht werden.`);
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
