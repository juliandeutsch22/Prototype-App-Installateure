import { useEffect, useRef, useState } from 'react';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { useAuth } from '@/app/AuthContext';
import { listAssignmentsForUserInRange } from '@/lib/db/assignments';
import { listProjectsByNumbers } from '@/lib/db/projects';
import { listMaterials } from '@/lib/db/materials';
import { vorbereiten as scheinVorbereiten } from '@/lib/db/workSheets';
import {
  createWorkSheet,
  getWorkSheet,
  signWorkSheet,
  updateWorkSheetDraft,
  listWorkSheetsForProject,
  fotosAmEntwurf,
  type NewWorkSheet,
} from '@/lib/db/workSheets';
import { fmtDauer, fmtMin, todayStr } from '@/lib/time';
import type { Material, Project, WorkSheet, WorkSheetZeit } from '@/types';
import type { WithId } from '@/lib/db/core';
import Card from '@/components/Card';
import Button from '@/components/Button';
import { Marke } from '@/components/Badge';
import PageHeader from '@/components/PageHeader';
import SignaturePad, { type SignaturePadHandle } from '@/components/SignaturePad';
import BaustellenSelect from '@/components/BaustellenSelect';
import { AdresseLink, TelefonLink } from '@/components/Kontakt';
import { InputField } from '@/components/Field';
import { useToast } from '@/components/Toast';
import { ErrorState, EmptyState, LoadingState } from '@/components/States';
import { Schrittleiste, Zusammenfassung } from './Schrittfolge';
import { SCHRITTE, useEineSeite, type Schritt } from './schritte';
import MaterialErfassen from './MaterialErfassen';
import { neueKennung, ohneKennung, type MaterialZeile } from './materialZeilen';
import LeistungszeitErfassen, { ZeileEntfernen } from './LeistungszeitErfassen';
import { komprimiere, fotoHochladen, fotoEntfernen, fotoAdresse } from '@/lib/db/scheinFotos';
import {
  darfFotografieren,
  nochNichtOben,
  fuerDenSchein,
  groesse,
  MAX_FOTOS,
  type FotoEntwurf,
} from './fotos';
import { grundAus } from '@/lib/fehlerGrund';
import { datumAT } from '@/lib/datum';

/**
 * Handwerksschein erstellen, unterschreiben lassen, einfrieren.
 *
 * DER WERT LIEGT NICHT IM UNTERSCHREIBEN, sondern darin, dass die Kette
 * Zeit → Schein → Rechnung geschlossen wird. Regiestunden sind die am
 * häufigsten bestrittene Rechnungsposition; ohne unterschriebenen Beleg lässt
 * sich eine Mehrstunde im Zweifel nicht durchsetzen.
 *
 * Vorausgefüllt werden die ZEITEN — die weiß das System, und zwar für die
 * ganze Mannschaft des Tages; der Monteur soll auf der Baustelle nichts
 * abtippen, was ohnehin erfasst ist.
 *
 * DAS MATERIAL TRÄGT ER SELBST EIN. Gemeldet: „der Schein ist größtenteils
 * für private Kunden mit kleineren Aufträgen und Reparaturen, da ist es
 * schwierig, das schon im Voraus zu sagen." Vorausgefüllt wurde bis hierher
 * aus den MaterialANFORDERUNGEN der Baustelle — also aus dem, was jemand
 * vorab bestellt hatte. Bei einer Reparatur bestellt niemand vorab. Näheres
 * in `MaterialErfassen.tsx`.
 *
 * EIN ENTWURF LÄSST SICH WIEDER ÖFFNEN — über `?entwurf=<Kennung>`.
 *
 * „Als Entwurf speichern" war bis hierher eine Sackgasse: der Schein landete
 * in der Liste, und dort gab es nur Aufklappen, PDF und Storno. Wer ihn
 * anlegte, um ihn später unterschreiben zu lassen, kam nie wieder hinein und
 * musste alles neu tippen. Das ist der Regelfall, für den der Knopf da ist:
 * der Schein wird am Vormittag vorbereitet und am Nachmittag unterschrieben.
 */
/**
 * EINE Meldung für beide Ausgänge, und das ist keine Bequemlichkeit.
 *
 * Gegen den Emulator nachgemessen: eine Kennung, die es nicht gibt, kommt
 * NICHT als „nicht gefunden" zurück, sondern als abgewiesener Zugriff — die
 * Regel liest `resource.data.companyId`, und `resource` ist bei einem
 * fehlenden Dokument null. Ein fehlender und ein fremder Schein sehen von
 * hier aus also gleich aus. Zwei verschiedene Meldungen wären eine
 * Behauptung, die die Datenbank gar nicht gemacht hat.
 */
const NICHT_ZU_OEFFNEN =
  'Dieser Entwurf lässt sich nicht öffnen — die Kennung stimmt nicht, oder er gehört nicht zu diesem Betrieb.';

/**
 * Steht diese Entwurfszeile auch in der Vorausfüllung?
 *
 * Verglichen wird, was die Zeit ausmacht — wer, von wann bis wann, Pause,
 * Minuten. Die Tätigkeit bleibt aussen vor: sie ist Freitext und darf sich
 * seit dem Speichern geändert haben, ohne dass es eine andere Zeit wäre.
 */
function gleicheZeile(a: WorkSheetZeit, b: WorkSheetZeit): boolean {
  return (
    a.mitarbeiter.trim().toLowerCase() === b.mitarbeiter.trim().toLowerCase() &&
    (a.von ?? '') === (b.von ?? '') &&
    (a.bis ?? '') === (b.bis ?? '') &&
    (a.pauseMin ?? 0) === (b.pauseMin ?? 0) &&
    a.minuten === b.minuten
  );
}

export default function WorkSheetView() {
  const { user } = useAuth();
  const toast = useToast();
  const navigate = useNavigate();
  const params = useParams();
  const [suchparameter] = useSearchParams();

  const projektAusUrl = params.projectNumber ?? suchparameter.get('projekt') ?? '';
  const datumAusUrl = suchparameter.get('datum') ?? todayStr();
  /** Die Kennung eines bestehenden Entwurfs — dann wird geändert statt angelegt. */
  const entwurfId = suchparameter.get('entwurf');

  const [projekt, setProjekt] = useState<WithId<Project> | undefined>();
  const [projectNumber, setProjectNumber] = useState(projektAusUrl);
  const [datum, setDatum] = useState(datumAusUrl);
  const [zeiten, setZeiten] = useState<WorkSheetZeit[]>([]);
  const [material, setMaterial] = useState<MaterialZeile[]>([]);
  /** Der Lagerkatalog für die Suche beim Eintragen — mehr braucht es hier nicht. */
  const [materials, setMaterials] = useState<WithId<Material>[]>([]);
  const [notizen, setNotizen] = useState('');
  /*
    Die Kennung des Scheins, an dem gerade gearbeitet wird.

    Beginnt mit dem Entwurf aus der Adresse und wird gesetzt, sobald ein
    Entwurf entsteht — was das erste Foto auslöst. Fotos brauchen einen Ort im
    Storage, und der hängt an der Kennung; ohne sie landeten sie in einem
    Ordner, den später nichts mehr einem Schein zuordnet.
  */
  const [scheinId, setScheinId] = useState<string | null>(entwurfId);
  /*
    DIESELBE KENNUNG ALS REF, dazu die laufende Anlage (Prüflauf 25.09.2026,
    P1-04). Der Zustand oben kommt in einer Funktion erst beim nächsten
    Zeichnen an; wer ihn aus der Closure las — die Schleife über mehrere
    gewählte Fotos, oder „Entwurf speichern", während das erste Foto den
    Entwurf gerade anlegt —, sah noch `null` und legte einen ZWEITEN Entwurf
    an. Zwei Belege über dieselbe Arbeit, und niemand weiss, welcher gilt.
  */
  const scheinIdRef = useRef<string | null>(entwurfId);
  const anlageRef = useRef<Promise<string> | null>(null);
  /** Die Fotos im Formular — hochgeladen oder noch nicht. Immer freiwillig. */
  const [fotos, setFotosZustand] = useState<FotoEntwurf[]>([]);
  /*
    SPIEGEL DER LISTE, damit sie sich AUSSERHALB eines Zustands-Aktualisierers
    lesen lässt. Die Liste muss nach jedem Upload sofort ans Dokument
    geschrieben werden; `setFotos((f) => …)` liefert den aktuellen Stand nur
    innerhalb der Rückrufe, und ein Schreibvorgang von dort wäre ein
    Seiteneffekt in einer Funktion, die React zweimal aufrufen darf.
  */
  const fotosRef = useRef<FotoEntwurf[]>([]);
  function setFotos(naechste: FotoEntwurf[]) {
    fotosRef.current = naechste;
    setFotosZustand(naechste);
  }
  const [fotoLaeuft, setFotoLaeuft] = useState(false);
  /*
    WELCHE ZEILEN VOR ORT ENTSTANDEN SIND — nach Position in `zeiten`.

    Nur sie lassen sich wieder wegnehmen. Eine Zeile aus der Zeiterfassung
    steht für eine gebuchte Zeit; sie hier zu entfernen änderte den Beleg,
    nicht die Buchung, und die beiden liefen auseinander, ohne dass es jemand
    sähe. Der Zustand lebt nur im Formular — im Schein steht am Ende einfach
    eine Liste von Zeilen, und woher sie kam, ist für den Kunden ohne Belang.
  */
  const [selbstErfasst, setSelbstErfasst] = useState<Set<number>>(new Set());
  /*
    Dieselbe Menge als Ref. Der Vorausfüll-Effekt braucht sie beim Eintreffen
    der Antwort, darf aber nicht an ihr HÄNGEN — sonst liefe er bei jeder
    getippten Zeile neu und holte die Vorausfüllung ein zweites Mal.
  */
  const selbstErfasstRef = useRef<Set<number>>(new Set());
  /** Hat der Monteur die Warnung „Fotos fehlen" schon gesehen? */
  const [ohneFotosBestaetigt, setOhneFotosBestaetigt] = useState(false);
  const [laden, setLaden] = useState(false);
  const [error, setError] = useState<string | null>(null);
  /**
   * Fehler der VORAUSFÜLLUNG — getrennt von `error`.
   *
   * Er hält das Formular nicht auf: der Schein ist ein Beleg über Arbeit, die
   * geleistet wurde, und der Kunde steht daneben. Dass die Stunden nicht
   * automatisch eingetragen werden konnten, ist ärgerlich — aber kein Grund,
   * das Unterschreiben zu verweigern.
   */
  const [vorfuellFehler, setVorfuellFehler] = useState<string | null>(null);
  /** Hochzählen erzwingt einen neuen Anlauf der Vorausfüllung. */
  const [versuch, setVersuch] = useState(0);
  const [speichert, setSpeichert] = useState(false);
  /**
   * Solange der Entwurf geholt wird, darf NICHTS gespeichert werden.
   *
   * Sonst schriebe ein schneller Finger den halb geladenen Zustand über den
   * vollständigen — und der Monteur verlöre genau das, was er sich vorhin
   * aufgehoben hat.
   */
  const [entwurfLaedt, setEntwurfLaedt] = useState(!!entwurfId);
  const [entwurfFehler, setEntwurfFehler] = useState<string | null>(null);
  /**
   * Die im Entwurf gespeicherten Zeiten — der Rückfall, wenn das Auffrischen
   * scheitert. Ohne ihn stünde der wieder geöffnete Schein ohne Stunden da,
   * obwohl sie im Entwurf sauber gespeichert sind.
   */
  const entwurfZeiten = useRef<WorkSheetZeit[] | null>(null);
  /**
   * Die Zeilen des Entwurfs, die mit der ersten gelungenen Vorausfüllung
   * noch abzugleichen sind — samt Baustelle und Tag, zu denen sie gehören.
   *
   * Im Entwurf steht nicht, woher eine Zeile kam. Vor Ort getippte Zeilen
   * haben aber keine Buchung hinter sich; ersetzte die Vorausfüllung die
   * Liste, wären sie weg (Prüflauf 25.09.2026, P1-02). Deshalb bleibt jede
   * Entwurfszeile stehen, der keine gebuchte entspricht — als selbst
   * erfasst, also mit Kreuz, falls sie doch überholt ist.
   */
  const entwurfAbgleich = useRef<{ schluessel: string; zeilen: WorkSheetZeit[] } | null>(null);
  /**
   * Zu welchem Schein — Baustelle UND Tag — das eingetragene Material gehört.
   *
   * Der Wechsel auf einen anderen Schein räumt die Zeilen weg. Ein GELADENER
   * Entwurf setzt Baustelle und Tag aber auch, und ohne diesen Merker sähe
   * das Wegräumen wie ein Wechsel aus: es löschte genau das Material, das
   * gerade aus dem Entwurf gekommen ist.
   */
  const materialGehoertZu = useRef(`${projektAusUrl}|${datumAusUrl}`);

  /** Unterschriften — erst wenn beide da sind, lässt sich einfrieren. */
  const [monteurName, setMonteurName] = useState(user?.name ?? '');
  const [kundeName, setKundeName] = useState('');
  /**
   * Nur OB unterschrieben ist, nicht WOMIT.
   *
   * Vorher lag hier bei jedem Strichende ein frisch erzeugtes PNG von rund
   * hundert Kilobyte — zwei Felder, jeder Strich, jedes Mal ein Neurendern
   * dieser ganzen Ansicht. Das Bild wird jetzt genau einmal geholt: beim
   * Einfrieren.
   */
  const [monteurGesetzt, setMonteurGesetzt] = useState(false);
  const [kundeGesetzt, setKundeGesetzt] = useState(false);
  const monteurFeld = useRef<SignaturePadHandle>(null);
  const kundeFeld = useRef<SignaturePadHandle>(null);

  const [bestehende, setBestehende] = useState<WithId<WorkSheet>[]>([]);

  /**
   * Die eigenen Einsätze am gewählten Tag — der eigentliche Einstieg.
   *
   * EIN MONTEUR SUCHT SEINE BAUSTELLE NICHT IN EINER LISTE. Er war heute auf
   * ein, zwei Baustellen, und für eine davon schreibt er den Schein. Die
   * Auswahl über alle Baustellen des Betriebs ist der Umweg für den Fall, dass
   * die Einteilung fehlt oder jemand aus dem Büro einen Schein nachträgt.
   *
   * Bei genau einem Einsatz wird vorausgewählt: dann ist die Frage, die das
   * Auswahlfeld stellt, bereits beantwortet.
   */
  const [heutige, setHeutige] = useState<{ projectNumber: string; name: string }[]>([]);

  useEffect(() => {
    if (!user) return;
    let verworfen = false;
    listAssignmentsForUserInRange(user.companyId, user.uid, datum, datum)
      .then(async (einsaetze) => {
        if (verworfen || einsaetze.length === 0) {
          if (!verworfen) setHeutige([]);
          return;
        }
        const nummern = [...new Set(einsaetze.map((a) => a.projectNumber))];
        const stamm = await listProjectsByNumbers(user.companyId, nummern);
        if (verworfen) return;
        setHeutige(
          nummern.map((nr) => ({
            projectNumber: nr,
            name: stamm.find((p) => p.projectNumber === nr)?.customerName ?? nr,
          })),
        );
        // Nur vorauswählen, wenn nichts vorgegeben ist und die Lage eindeutig
        // ist — eine falsche Vorauswahl wäre schlimmer als gar keine.
        /*
          UND NUR INS LEERE FELD (Prüflauf 25.09.2026, P1-03). Die Antwort
          kommt womöglich erst, nachdem der Monteur schon gewählt hat oder
          ein Entwurf seine Baustelle gesetzt hat; sie zu überschreiben hiesse
          den Schein auf eine andere Baustelle zu legen — und der Wechsel
          räumt obendrein das eingetragene Material weg. Deshalb der Blick
          auf den AKTUELLEN Wert statt auf den beim Abschicken, und beim
          Entwurf gar nicht: seine Baustelle steht im Entwurf.
        */
        if (nummern.length === 1 && !projektAusUrl && !entwurfId) {
          setProjectNumber((bisher) => bisher || nummern[0]);
        }
      })
      .catch(() => setHeutige([]));
    return () => {
      verworfen = true;
    };
    // `projektAusUrl` und `entwurfId` sind beim ersten Zeichnen fix und
    // gehören nicht ins Abhängigkeitsfeld: sonst liefe die Vorauswahl bei
    // jeder Auswahl erneut.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user, datum]);

  /**
   * Die Zeiten der Baustelle vorausfüllen.
   *
   * Die Zeiten werden auf das gewählte Datum eingegrenzt — ein Schein geht
   * über einen Tag, nicht über die Laufzeit der Baustelle. Wer mehrere Tage
   * zusammenfassen will, legt mehrere Scheine an; das entspricht dem
   * Papierbeleg und hält den Streitfall klein.
   */
  /**
   * Baustelle oder Tag gewechselt = ein ANDERER Schein. Das eingetragene
   * Material gehört zum vorigen und muss weg.
   *
   * Bewusst ein eigener Effekt und nicht der der Vorausfüllung: der hängt
   * auch an `versuch`, und ein zweiter Anlauf für die Zeiten darf die von
   * Hand getippten Zeilen nicht mitnehmen.
   */
  useEffect(() => {
    const jetzt = `${projectNumber}|${datum}`;
    if (materialGehoertZu.current === jetzt) return;
    materialGehoertZu.current = jetzt;
    setMaterial([]);
    /*
      Die vor Ort getippten Zeiten bleiben stehen (die Vorausfüllung lässt
      sie ausdrücklich leben), trugen aber noch den ALTEN Tag — ein Schein
      über den 12. mit einer Zeile vom 11. (Prüflauf 25.09.2026, P1-20). Ein
      Schein geht über genau einen Tag; seine Zeilen tragen diesen.
    */
    setZeiten((z) => (z.some((r) => r.datum !== datum) ? z.map((r) => ({ ...r, datum })) : z));
  }, [projectNumber, datum]);

  /**
   * Einen bestehenden Entwurf ins Formular holen.
   *
   * WAS ÜBERNOMMEN WIRD UND WAS NEU GEHOLT WIRD, ist eine Unterscheidung
   * zwischen ABGELEITETEN und VON HAND ERFASSTEN Angaben:
   *
   *   Zeiten    — abgeleitet. Sie kommen frisch vom Server (der Effekt
   *               darunter läuft, sobald die Baustelle steht). Wer den
   *               Entwurf am Vormittag anlegt und erst danach seine Zeit
   *               bucht, fände sonst am Nachmittag einen Schein ohne
   *               Stunden. Unterschrieben ist noch nichts, es geht also
   *               nichts verloren.
   *   Material,
   *   Notizen,
   *   Namen     — von Hand erfasst. Die stehen so im Entwurf und werden
   *               unverändert übernommen; sie neu zu holen gibt es gar nicht.
   *
   * NUR ENTWÜRFE. Ein unterschriebener oder stornierter Schein ist
   * eingefroren; ihn hier zu öffnen ergäbe ein Formular, dessen Speichern die
   * Rules ablehnen — ein Knopf, der nichts tut, ist schlimmer als keiner.
   *
   * Der VERWORFENE Entwurf bekommt eine eigene Meldung. „Lässt sich nicht
   * mehr ändern" wäre bei ihm schlicht falsch: er lässt sich sehr wohl
   * wieder aufnehmen, nur nicht von hier aus.
   */
  useEffect(() => {
    if (!entwurfId) return;
    let verworfen = false;
    setEntwurfLaedt(true);
    setEntwurfFehler(null);
    getWorkSheet(entwurfId)
      .then((schein) => {
        if (verworfen) return;
        if (!schein) {
          setEntwurfFehler(NICHT_ZU_OEFFNEN);
          return;
        }
        if (schein.status === 'Verworfen') {
          setEntwurfFehler(
            'Dieser Entwurf ist verworfen. In der Liste der Handwerksscheine lässt er sich unter „verworfene Entwürfe anzeigen" wieder aufnehmen.',
          );
          return;
        }
        if (schein.status !== 'Entwurf') {
          setEntwurfFehler(
            `Dieser Schein ist ${schein.status.toLowerCase()} und lässt sich nicht mehr ändern.`,
          );
          return;
        }
        materialGehoertZu.current = `${schein.projectNumber}|${schein.datum}`;
        entwurfZeiten.current = schein.zeiten;
        entwurfAbgleich.current = {
          schluessel: `${schein.projectNumber}|${schein.datum}`,
          zeilen: schein.zeiten,
        };
        setProjectNumber(schein.projectNumber);
        setDatum(schein.datum);
        setZeiten(schein.zeiten);
        setMaterial(schein.material.map((m) => ({ ...m, id: neueKennung() })));
        setNotizen(schein.notizen ?? '');
        /*
          DIE FOTOS KOMMEN MIT (Prüflauf 25.09.2026, P1-01). Vorher blieben
          sie im Entwurf liegen und nicht im Formular — und weil Speichern
          und Unterschreiben die Fotoliste aus dem Formular schicken, ging
          eine LEERE Liste hinaus, die die Datenbank als „alle weg" liest.
          Das nächste Foto überschrieb sie ebenso.

          Sie sind schon oben, also tragen sie `oben`; die Bytes gibt es hier
          nicht und braucht es nicht — nachgereicht wird nur, was noch nicht
          oben ist. Die Vorschau kommt als signierte Adresse nach; bis dahin
          (oder wenn sie ausbleibt) steht ein Platzhalter da.
        */
        const geladen: FotoEntwurf[] = (schein.fotos ?? []).map((f) => ({
          vorschau: '',
          daten: new Blob(),
          geraetZeit: f.geraetZeit,
          oben: f,
        }));
        setFotos(geladen);
        for (const eintrag of geladen) {
          fotoAdresse(eintrag.oben!.pfad)
            .then((adresse) => {
              if (verworfen) return;
              setFotos(
                fotosRef.current.map((x) => (x === eintrag ? { ...x, vorschau: adresse } : x)),
              );
            })
            .catch(() => undefined);
        }
      })
      .catch(() => {
        if (!verworfen) setEntwurfFehler(NICHT_ZU_OEFFNEN);
      })
      .finally(() => {
        if (!verworfen) setEntwurfLaedt(false);
      });
    return () => {
      verworfen = true;
    };
  }, [entwurfId]);

  useEffect(() => {
    if (!user) return;
    let verworfen = false;
    listMaterials(user.companyId)
      .then((m) => {
        if (!verworfen) setMaterials(m);
      })
      .catch(() => {
        // Ohne Katalog bleibt die freie Zeile. Der Schein hängt nicht daran.
        if (!verworfen) setMaterials([]);
      });
    return () => {
      verworfen = true;
    };
  }, [user]);

  useEffect(() => {
    if (!user || !projectNumber) {
      setZeiten([]);
      setVorfuellFehler(null);
      return;
    }
    let verworfen = false;
    setLaden(true);
    setError(null);
    setVorfuellFehler(null);

    /**
     * Die Vorausfüllung bekommt eine FRIST.
     *
     * Sie läuft über die Datenbankfunktion `schein_vorbereiten`, und die liest
     * fremde Zeiteinträge — mehr Arbeit als eine Liste zu holen. Im Keller mit
     * einem Balken LTE kann das beliebig lange brauchen, und tat es vorher
     * hinter einem Kreisel ohne Ende und ohne Ausweg. Nach der Frist steht da,
     * was los ist, mit einem Knopf zum Erneut-Versuchen.
     */
    const mitFrist = <T,>(p: Promise<T>, ms = 12000) =>
      Promise.race([
        p,
        new Promise<never>((_, ab) => setTimeout(() => ab(new Error('Zeit abgelaufen')), ms)),
      ]);

    mitFrist(scheinVorbereiten(projectNumber, datum))
      .then((data) => {
        if (verworfen) return;
        /*
          Einmal abgeglichen ist abgeglichen: ein späterer Anlauf holte sonst
          Zeilen zurück, die der Monteur inzwischen weggenommen hat. Für eine
          andere Baustelle oder einen anderen Tag gilt der Entwurf nicht.
        */
        const abgleich = entwurfAbgleich.current;
        entwurfAbgleich.current = null;
        const ausEntwurf =
          abgleich && abgleich.schluessel === `${projectNumber}|${datum}`
            ? abgleich.zeilen.filter((z) => !data.zeiten.some((g) => gleicheZeile(g, z)))
            : [];
        /*
          DIE VOR ORT GETIPPTEN ZEILEN ÜBERLEBEN DIE VORAUSFÜLLUNG.

          Die Frist läuft zwölf Sekunden, und im Keller mit einem Balken LTE
          tippt der Monteur in dieser Zeit längst. Käme die Antwort danach und
          ersetzte die Liste, wäre seine Eingabe weg — kommentarlos, während
          der Kunde danebensteht. Dasselbe beim „Erneut versuchen": es soll
          die gebuchten Zeiten nachholen, nicht seine Arbeit löschen.

          Die gebuchten Zeilen kommen nach vorne, die eigenen dahinter; die
          Merkliste wird entsprechend verschoben.
        */
        setZeiten((bisher) => {
          const eigene = [
            ...ausEntwurf,
            ...bisher.filter((_, i) => selbstErfasstRef.current.has(i)),
          ];
          selbstErfasstRef.current = new Set(
            eigene.map((_, i) => data.zeiten.length + i),
          );
          setSelbstErfasst(selbstErfasstRef.current);
          return [...data.zeiten, ...eigene];
        });
      })
      .catch(() => {
        if (verworfen) return;
        /*
          BEIM ENTWURF DIE GESPEICHERTEN ZEITEN STEHENLASSEN.

          Sie sind im Entwurf sauber abgelegt. Sie wegen einer
          fehlgeschlagenen AUFFRISCHUNG zu leeren hiesse, aus einem
          vollstaendigen Schein einen leeren zu machen — und zwar in dem
          Moment, in dem der Kunde danebensteht und unterschreiben will.
        */
        /*
          Auch hier bleiben die selbst getippten Zeilen stehen — aus demselben
          Grund wie oben, nur ist der Fall der wahrscheinlichere: die
          Vorausfüllung ist gescheitert, der Monteur hat in der Wartezeit
          eingetragen, und genau jetzt seine Eingabe zu verwerfen wäre die
          schlechteste aller Antworten.
        */
        setZeiten((bisher) => {
          const eigene = bisher.filter((_, i) => selbstErfasstRef.current.has(i));
          const gebucht = entwurfZeiten.current ?? [];
          selbstErfasstRef.current = new Set(eigene.map((_, i) => gebucht.length + i));
          setSelbstErfasst(selbstErfasstRef.current);
          return [...gebucht, ...eigene];
        });
        /*
          DAS EINGETRAGENE MATERIAL BLEIBT STEHEN.

          Die Frist läuft zwölf Sekunden; im Keller mit einem Balken LTE
          tippt der Monteur in dieser Zeit längst seine Zeilen. Sie hier
          mitzuräumen hiesse, ihm seine Eingabe wegen einer FREMDEN
          fehlgeschlagenen Abfrage zu löschen.
        */
        setVorfuellFehler(
          entwurfZeiten.current
            ? 'Die Zeiten konnten nicht aufgefrischt werden. Es stehen die Zeiten aus dem Entwurf.'
            : 'Die Zeiten konnten nicht geladen werden. Der Schein lässt sich trotzdem schreiben und unterschreiben.',
        );
      })
      .finally(() => {
        if (!verworfen) setLaden(false);
      });

    /**
     * Die bestehenden Scheine laufen NEBENHER, nicht im selben `Promise.all`.
     *
     * Vorher hing das ganze Formular an beiden Abfragen: blieb eine hängen,
     * blieb alles hängen. Diese hier ist nur ein Hinweis darauf, dass für
     * denselben Tag schon ein Schein existiert — kein Grund, das Unterschreiben
     * aufzuhalten.
     */
    listWorkSheetsForProject(user.companyId, projectNumber)
      .then((scheine) => {
        // Ein aufgegebener Entwurf ist kein „es gibt hier schon einen
        // Schein". Er zaehlte sonst als Warnung gegen genau den Schein, den
        // er ersetzen sollte.
        if (!verworfen) {
          setBestehende(
            scheine.filter((s) => s.datum === datum && s.status !== 'Verworfen'),
          );
        }
      })
      .catch(() => {
        if (!verworfen) setBestehende([]);
      });

    return () => {
      verworfen = true;
    };
  }, [user, projectNumber, datum, versuch]);

  const gesamtMinuten = zeiten.reduce((s, z) => s + z.minuten, 0);

  /**
   * Keine weitere Aufnahme: es läuft gerade eine, oder das Fach ist voll.
   *
   * Steht hier und nicht in der Ansicht, weil sowohl das versteckte Feld
   * (das die Sperre wirklich trägt) als auch das Label (das sie zeigt) den
   * Wert brauchen — und zwei getrennte Ausdrücke irgendwann auseinanderlaufen.
   */
  const fotoKnopfAus = fotoLaeuft || fotos.length >= MAX_FOTOS;
  /**
   * Der Datensatz gehört in die Bedingung, nicht nur die Nummer.
   *
   * Vorher prüfte der Knopf auf die Nummer, das Speichern aber auf den
   * Datensatz und brach ohne Meldung ab, wenn er fehlte. Ein Knopf, der
   * anklickbar aussieht und nichts tut, ist schlimmer als ein gesperrter.
   */
  const bereit =
    !!projekt && monteurGesetzt && kundeGesetzt && kundeName.trim().length > 1;

  /*
    EINGETIPPT, ABER NICHT ÜBERNOMMEN. Leistungszeit und freie Materialzeile
    kommen erst mit „Zeile hinzufügen" bzw. „Hinzufügen" auf den Schein. Wer
    Von und Bis eintippt und dann nach unten zum Unterschreiben geht — die
    naheliegende Reihenfolge —, bekam einen Schein OHNE Leistungszeit, und
    der Kunde unterschrieb einen Beleg, auf dem nur das Material stand.
    Gefunden beim Probelauf; nichts hatte davor gewarnt.

    NICHT STILL ÜBERNOMMEN, sondern angehalten: ein halb getippter Wert soll
    nicht ungefragt auf einem Beleg landen, der gleich eingefroren wird.
  */
  const [offeneZeit, setOffeneZeit] = useState<string | null>(null);
  const [offenesMaterial, setOffenesMaterial] = useState<string | null>(null);
  const nichtUebernommen = [
    offeneZeit && `die Zeit ${offeneZeit} („Zeile hinzufügen")`,
    offenesMaterial && `das Material ${offenesMaterial} („Hinzufügen")`,
  ].filter(Boolean);

  /**
   * Ein Foto aufnehmen: verkleinern, hochladen, ans Formular hängen.
   *
   * DER ENTWURF ENTSTEHT HIER, falls es noch keinen gibt. Fotos brauchen
   * einen Ort im Storage, und der hängt an der Kennung des Scheins; ohne sie
   * landeten sie in einem Ordner, den später nichts mehr zuordnet. Der
   * Moment passt auch inhaltlich: wer fotografiert, hat etwas, das er behalten
   * will.
   *
   * SCHEITERT DER UPLOAD, BLEIBT DAS BILD LIEGEN — im Formular, mit einer
   * Meldung daran. Genau dafür ist `FotoEntwurf.daten` da. Im Keller ohne
   * Netz ist ein fehlgeschlagener Upload der Normalfall, und ein Bild, das
   * dabei still verschwindet, wäre die schlechteste aller Antworten.
   */
  async function fotoAufnehmen(dateien: FileList | null) {
    if (!dateien?.length || !user || !projekt) return;
    const pruefung = darfFotografieren('Entwurf', fotos.length);
    if (!pruefung.moeglich) {
      toast.error(pruefung.grund ?? 'Es geht kein weiteres Foto.');
      return;
    }
    setFotoLaeuft(true);
    try {
      for (const datei of Array.from(dateien).slice(0, MAX_FOTOS - fotos.length)) {
        const klein = await komprimiere(datei);
        const eintrag: FotoEntwurf = {
          vorschau: URL.createObjectURL(klein),
          daten: klein,
          geraetZeit: Date.now(),
        };
        setFotos([...fotosRef.current, eintrag]);
        try {
          const id = await kennungHolen();
          const oben = await fotoHochladen(user.companyId, id, klein, eintrag.geraetZeit);
          setFotos(
            fotosRef.current.map((x) => (x === eintrag ? { ...x, oben, fehler: undefined } : x)),
          );
          await festschreiben(id);
        } catch {
          setFotos(
            fotosRef.current.map((x) =>
              x === eintrag ? { ...x, fehler: 'Nicht hochgeladen — kein Netz?' } : x,
            ),
          );
        }
      }
    } catch {
      toast.error('Das Bild liess sich auf diesem Gerät nicht verarbeiten.');
    } finally {
      setFotoLaeuft(false);
    }
  }

  /** Einen einzelnen Upload nachholen — der Knopf am fehlgeschlagenen Bild. */
  async function fotoNachreichen(eintrag: FotoEntwurf) {
    if (!user || !projekt) return;
    setFotoLaeuft(true);
    try {
      const id = await kennungHolen();
      const oben = await fotoHochladen(user.companyId, id, eintrag.daten, eintrag.geraetZeit);
      setFotos(
        fotosRef.current.map((x) => (x === eintrag ? { ...x, oben, fehler: undefined } : x)),
      );
      await festschreiben(id);
    } catch {
      setFotos(
        fotosRef.current.map((x) =>
          x === eintrag ? { ...x, fehler: 'Immer noch kein Netz.' } : x,
        ),
      );
    } finally {
      setFotoLaeuft(false);
    }
  }

  /**
   * Ein Foto wieder wegnehmen.
   *
   * Aus dem Storage wird es MITGELÖSCHT, wenn es schon oben ist — sonst
   * sammelte der Bucket über die Jahre die Bilder, die jemand versehentlich
   * aufgenommen und gleich wieder verworfen hat. Scheitert das Löschen,
   * verschwindet es trotzdem aus dem Formular: der Monteur wollte es weg
   * haben, und eine verwaiste Datei im Storage ist sein kleinstes Problem.
   */
  async function fotoWegnehmen(eintrag: FotoEntwurf) {
    setFotos(fotosRef.current.filter((x) => x !== eintrag));
    URL.revokeObjectURL(eintrag.vorschau);
    /*
      ERST AUS DEM DOKUMENT, DANN AUS DEM STORAGE. Andersherum entstünde
      zwischendurch ein Eintrag, der auf eine gelöschte Datei zeigt — und
      genau der ginge beim Unterschreiben in die Prüfsumme ein.
    */
    if (scheinIdRef.current) await festschreiben(scheinIdRef.current);
    if (eintrag.oben) await fotoEntfernen(eintrag.oben.pfad).catch(() => undefined);
  }

  /**
   * Die Fotoliste sofort ans Dokument schreiben.
   *
   * OHNE DAS ENTSTEHEN WAISEN. Das Bild liegt nach dem Upload im Storage; der
   * Verweis darauf entstand bisher erst, wenn der Monteur den Entwurf
   * speicherte. Wer fotografierte und dann das Fenster schloss, hinterliess
   * eine Datei, auf die kein Dokument zeigt — sie kostet dauerhaft, und es
   * ist ein Bild aus einer fremden Wohnung ohne Beleg, der seine Aufbewahrung
   * rechtfertigt.
   *
   * STILL, UND DAS IST ABSICHT. Der Monteur hat sein Bild im Formular und
   * kann weiterarbeiten; ein Fehlerbalken für einen Schreibvorgang, den er
   * nicht ausgelöst hat, hülfe ihm nicht. Beim Speichern oder Unterschreiben
   * geht die Liste ohnehin vollständig mit — misslingt es hier, ist es
   * spätestens dann geheilt.
   */
  async function festschreiben(id: string) {
    // try/catch, nicht `.catch()`: der Aufruf darf auch dann nicht
    // durchschlagen, wenn er gar nicht erst zu einem Versprechen kommt.
    try {
      await fotosAmEntwurf(id, fuerDenSchein(fotosRef.current));
    } catch {
      /* still — siehe oben */
    }
  }

  /** Eine vor Ort erfasste Zeile wieder wegnehmen. */
  function zeileWegnehmen(index: number) {
    setZeiten((z) => z.filter((_, i) => i !== index));
    /*
      Die Merkliste rutscht mit: alles hinter der entfernten Zeile verschiebt
      sich um eins nach vorne. Ohne dieses Nachziehen zeigte das Kreuz nach
      dem ersten Löschen auf die falsche Zeile — und der Monteur nähme eine
      gebuchte Zeit vom Beleg statt seiner eigenen.
    */
    const nachgezogen = new Set<number>();
    for (const i of selbstErfasstRef.current) {
      if (i < index) nachgezogen.add(i);
      else if (i > index) nachgezogen.add(i - 1);
    }
    selbstErfasstRef.current = nachgezogen;
    setSelbstErfasst(nachgezogen);
  }

  async function unterschreibenUndEinfrieren() {
    if (!user || !projekt) return;
    // Die Bilder erst JETZT aus den Feldern holen — und beide, bevor
    // irgendetwas geschrieben wird. Fehlt eines, wird gar nichts angelegt:
    // ein Schein mit nur einer Unterschrift waere ein halber Beleg.
    const monteurBild = monteurFeld.current?.bildLesen() ?? null;
    const kundeBild = kundeFeld.current?.bildLesen() ?? null;
    if (!monteurBild || !kundeBild) {
      setError('Die Unterschriften konnten nicht gelesen werden. Bitte noch einmal zeichnen.');
      return;
    }
    /*
      FOTOS, DIE NOCH NICHT OBEN SIND, WERDEN NICHT STILL FALLEN GELASSEN.

      Sie kommen nicht mit in den Schein — ein Verweis auf eine Datei, die es
      nicht gibt, wäre schlimmer als kein Verweis. Aber der Monteur erfährt es
      VORHER und entscheidet: nochmal versuchen, oder ohne. Im Keller ohne
      Netz ist genau das der Alltag, und ein Bild, das beim Unterschreiben
      lautlos verschwindet, wäre die schlechteste aller Antworten.
    */
    const offen = nochNichtOben(fotos);
    if (offen.length > 0 && !ohneFotosBestaetigt) {
      setOhneFotosBestaetigt(true);
      setError(
        `${offen.length} ${offen.length === 1 ? 'Foto ist' : 'Fotos sind'} noch nicht ` +
          'hochgeladen und würden fehlen. Nochmal auf „Nochmal versuchen" tippen — oder ' +
          'gleich noch einmal unterschreiben, dann geht der Schein ohne sie hinaus.',
      );
      return;
    }
    setSpeichert(true);
    setError(null);
    try {
      const id = await inhaltSchreiben();

      // Gerätezeit: offline im Keller ist die Serverzeit die der späteren
      // Übertragung, nicht die der Unterschrift.
      const jetzt = Date.now();
      await signWorkSheet(
        id,
        { name: monteurName.trim() || user.name, bild: monteurBild, geraetZeit: jetzt },
        { name: kundeName.trim(), bild: kundeBild, geraetZeit: jetzt },
      );

      toast.success('Handwerksschein unterschrieben und eingefroren');
      navigate(`/worksheets?markiert=${id}`);
    } catch (err) {
      setError(grundAus(err, 'Der Schein konnte nicht gespeichert werden.'));
    } finally {
      setSpeichert(false);
    }
  }

  /**
   * Den Inhalt schreiben — anlegen oder den geöffneten Entwurf ändern — und
   * die Kennung des Scheins zurückgeben.
   *
   * EINE STELLE FÜR BEIDE KNÖPFE. „Als Entwurf speichern" und
   * „Unterschreiben und abschließen" schreiben denselben Inhalt; stünde er
   * zweimal da, liefen die beiden Fassungen früher oder später auseinander —
   * und zwar unbemerkt, weil beide für sich richtig aussehen.
   *
   * Der Inhalt wird KOPIERT, nicht referenziert: korrigiert die Buchhaltung
   * morgen einen Zeiteintrag, ändert sich nicht rückwirkend, was der Kunde
   * unterschrieben hat.
   *
   * BEIM ÄNDERN BLEIBT DER URHEBER STEHEN. Wer den Entwurf angelegt hat, hat
   * ihn angelegt — auch wenn ihn ein Kollege zu Ende bringt. Ihn zu
   * überschreiben verfälschte den einzigen Hinweis darauf, wer den Beleg
   * aufgesetzt hat.
   */
  async function inhaltSchreiben(): Promise<string> {
    if (!user || !projekt) throw new Error('Ohne Anmeldung und Baustelle geht nichts.');
    /*
      Der Typ haelt die Regel fest, nicht nur der Kommentar: „wer angelegt
      hat" ist KEIN Inhalt und darf beim Aendern gar nicht erst mitgeschickt
      werden koennen.
    */
    const inhalt: Omit<NewWorkSheet, 'erstelltVonUid' | 'erstelltVonName'> = {
      projectNumber,
      customerId: projekt.customerId,
      customerName: projekt.customerName,
      address: projekt.address,
      datum,
      status: 'Entwurf' as const,
      abrechnung: projekt.billingMode ?? 'Regie',
      zeiten,
      material: ohneKennung(material),
      /*
        Nur die hochgeladenen. Ein Eintrag für ein Bild, das nicht im Storage
        liegt, wäre ein Verweis ins Leere — und er ginge in die Prüfsumme ein,
        die damit einen Beleg zusicherte, den niemand ansehen kann.
      */
      fotos: fuerDenSchein(fotos),
      notizen,
    };
    /*
      Läuft die Anlage gerade, wird auf sie gewartet und danach geändert —
      nicht ein zweites Mal angelegt. Scheitert sie, darf dieser Aufruf es
      selbst versuchen.
    */
    const bestehend =
      scheinIdRef.current ?? (anlageRef.current ? await anlageRef.current.catch(() => null) : null);
    if (bestehend) {
      await updateWorkSheetDraft(bestehend, inhalt);
      return bestehend;
    }
    const anlage = createWorkSheet(user.companyId, {
      ...inhalt,
      erstelltVonUid: user.uid,
      erstelltVonName: user.name,
    }).then((neueId) => {
      scheinIdRef.current = neueId;
      setScheinId(neueId);
      return neueId;
    });
    anlageRef.current = anlage;
    try {
      return await anlage;
    } finally {
      if (anlageRef.current === anlage) anlageRef.current = null;
    }
  }

  /**
   * Die Kennung des Scheins für ein Foto — die bestehende, die gerade
   * entstehende, oder eine neue Anlage. Nur die Anlage schreibt den Inhalt;
   * steht der Schein schon, geht es allein um den Ort im Speicher.
   */
  async function kennungHolen(): Promise<string> {
    if (scheinIdRef.current) return scheinIdRef.current;
    if (anlageRef.current) {
      const id = await anlageRef.current.catch(() => null);
      if (id) return id;
    }
    return inhaltSchreiben();
  }

  async function alsEntwurfSichern() {
    if (!user || !projekt) return;
    setSpeichert(true);
    setError(null);
    // Vor dem Schreiben gelesen: danach gibt es die Kennung in jedem Fall.
    const warSchonDa = !!(scheinIdRef.current ?? anlageRef.current);
    try {
      await inhaltSchreiben();
      /*
        Nach `scheinId`, nicht nach der Adresse: seit ein Foto den Entwurf
        anlegen kann, gibt es ihn womöglich schon, obwohl man ohne
        `?entwurf=` hereingekommen ist. „Als Entwurf gespeichert" wäre dann
        die falsche Auskunft.
      */
      toast.success(warSchonDa ? 'Entwurf aktualisiert' : 'Als Entwurf gespeichert');
      navigate('/worksheets');
    } catch (err) {
      setError(grundAus(err, 'Der Entwurf konnte nicht gespeichert werden.'));
    } finally {
      setSpeichert(false);
    }
  }

  /*
    DIE SCHRITTFOLGE: am Telefon und Tablet Zeiten, Material, Fotos,
    Unterschrift nacheinander, am Schreibtisch die eine Seite wie bisher
    (`Schrittfolge.tsx`).

    Sie ist REINE ANORDNUNG. Kein Teil wird je ausgehängt — ein Schritt blendet
    die übrigen nur aus —, und nichts hier greift in Speichern, Prüfen oder
    Unterschreiben ein. Die Sperren des Abschlussknopfs (`bereit`,
    `nichtUebernommen`, `entwurfLaedt`) sind dieselben wie vorher; sie gelten,
    egal in welchem Schritt das Feld steht, aus dem sie kommen.

    „WEITER" SPERRT NIE. Keiner der Schritte hat eine Pflichtangabe, die die
    bestehende Logik als Fehler meldet: ein Schein ohne Stunden, ohne Material
    oder ohne Fotos ist gültig. Geprüft wird, wie bisher, beim Unterschreiben.

    EIN WIEDER GEÖFFNETER ENTWURF BEGINNT BEI SCHRITT 1. Seine Zeiten werden
    beim Öffnen frisch geholt und können sich seit dem Speichern geändert
    haben — das soll als Erstes zu sehen sein, nicht hinter einer
    Zusammenfassung. Wer gleich unterschreiben lassen will, ist mit einem
    Tipp auf „4 Unterschrift" dort.
  */
  const eineSeite = useEineSeite();
  const [schritt, setSchritt] = useState<Schritt>(1);
  /** Zählt jeden Sprung, damit auch ein Tipp auf den aktuellen Schritt hinrollt. */
  const [sprung, setSprung] = useState(0);
  const abschnitte = useRef<Partial<Record<Schritt, HTMLDivElement | null>>>({});
  const leisteRef = useRef<HTMLDivElement>(null);

  function springe(nr: Schritt) {
    setSchritt(nr);
    setSprung((n) => n + 1);
  }

  /*
    NACH EINEM SPRUNG STEHT MAN AM ANFANG DES SCHRITTS. „Weiter" sitzt unten;
    ohne das stünde man nach dem Tippen mitten im nächsten Schritt, und dessen
    Anfang läge über dem Bildschirmrand. Der Fokus wandert mit, damit Tastatur
    und Vorlesehilfe dort weitermachen, wo das Auge ist.
  */
  useEffect(() => {
    if (sprung === 0) return;
    leisteRef.current?.scrollIntoView?.({ block: 'start' });
    abschnitte.current[schritt]?.focus({ preventScroll: true });
    // Nur beim Sprung — nicht, wenn sich die Breite ändert.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sprung]);

  if (!user) return null;

  /*
    DER ENTWURF LIESS SICH NICHT ÖFFNEN — dann steht hier auch kein Formular.

    Ein leeres Formular unter der Überschrift „Entwurf" sähe aus wie ein
    verlorener Schein: der Nächste tippte alles neu und legte damit einen
    ZWEITEN Beleg über dieselbe Arbeit an. Lieber eine Meldung und der Weg
    zurück in die Liste, wo der Entwurf ja steht.
  */
  if (entwurfFehler) {
    return (
      <div className="space-y-6">
        <PageHeader title="Handwerksschein — Entwurf" subtitle="Konnte nicht geöffnet werden" />
        <Card>
          <ErrorState message={entwurfFehler} />
          <div className="mt-3">
            <Button variant="secondary" onClick={() => navigate('/worksheets')}>
              Zur Liste der Scheine
            </Button>
          </div>
        </Card>
      </div>
    );
  }

  /** Ist der Schritt gerade zu sehen? Ohne Baustelle gibt es nur den ersten. */
  const sichtbar = (nr: Schritt) => eineSeite || (projectNumber ? schritt === nr : nr === 1);
  /** Nur in der Schrittfolge: Name und Rolle, damit der Fokus beim Sprung etwas ansagt. */
  const alsSchritt = (nr: Schritt) =>
    eineSeite
      ? {}
      : { role: 'group', 'aria-label': `Schritt ${nr} von ${SCHRITTE.length}: ${SCHRITTE[nr - 1].name}` };
  const naechster = SCHRITTE.find((s) => s.nr === schritt + 1);
  const personen = new Set(zeiten.map((z) => z.mitarbeiter.trim().toLowerCase())).size;
  const fotosOffen = nochNichtOben(fotos).length;

  /*
    Zwei Knöpfe, zwei mögliche Plätze — gerendert wird jeder immer nur an
    einem: am Schreibtisch in der Karte der Unterschriften wie bisher, in der
    Schrittfolge unten neben „Zurück" und „Weiter".
  */
  const unterschreibenKnopf = (className: string) => (
    /*
      WÄHREND DER ENTWURF LÄDT WIRD NICHT GESCHRIEBEN. Sonst
      schriebe ein schneller Finger den halb geladenen Zustand über
      den vollständigen — und der Monteur verlöre genau das, was er
      sich vorhin aufgehoben hat.

      WÄHREND EIN FOTO HOCHGEHT EBENSO NICHT (Prüflauf 25.09.2026, P1-04):
      das Foto legt womöglich gerade den Entwurf an, und ein zweiter
      Schreibvorgang daneben verlöre das Bild oder legte einen zweiten an.
    */
    <Button
      onClick={unterschreibenUndEinfrieren}
      loading={speichert}
      disabled={!bereit || entwurfLaedt || fotoLaeuft || nichtUebernommen.length > 0}
      className={className}
    >
      Unterschreiben und abschließen
    </Button>
  );
  const entwurfKnopf = (className: string) => (
    <Button
      variant="secondary"
      onClick={alsEntwurfSichern}
      loading={speichert}
      disabled={!projekt || entwurfLaedt || fotoLaeuft}
      className={className}
    >
      {scheinId ? 'Entwurf aktualisieren' : 'Als Entwurf speichern'}
    </Button>
  );

  return (
    <div className="space-y-6">
      <PageHeader
        title={entwurfId ? 'Handwerksschein — Entwurf' : 'Handwerksschein'}
        subtitle={
          entwurfId
            ? 'Vorbereiteter Schein — ergänzen und unterschreiben lassen'
            : 'Leistung vor Ort bestätigen lassen — Zeiten, Material, Unterschrift'
        }
      />

      {/*
        Die Leiste erst mit einer Baustelle: ohne sie gibt es die übrigen
        Schritte nicht, und eine Leiste mit drei toten Zielen wäre schlimmer
        als keine.
      */}
      {projectNumber && !eineSeite && (
        <div ref={leisteRef}>
          <Schrittleiste schritt={schritt} onWahl={springe} />
        </div>
      )}

      {/* ── Schritt 1: Zeiten ─────────────────────────────────────────── */}
      <div
        ref={(el) => {
          abschnitte.current[1] = el;
        }}
        tabIndex={-1}
        hidden={!sichtbar(1)}
        className="space-y-6"
        {...alsSchritt(1)}
      >
        <Card title="Baustelle und Tag">
          {/*
            Die eigenen Einsätze zuerst und als Knopf, nicht als Listeneintrag:
            das ist am Telefon mit Handschuhen ein Ziel, das man trifft.
          */}
          {heutige.length > 0 && (
            <div className="mb-4">
              <span className="section-label block">Deine Einsätze an diesem Tag</span>
              <div className="mt-2 flex flex-wrap gap-2">
                {heutige.map((e) => (
                  <button
                    key={e.projectNumber}
                    type="button"
                    onClick={() => {
                      // Den alten Datensatz mit weglegen: sonst zeigte die
                      // Kontaktzeile für einen Wimpernschlag die vorige
                      // Baustelle, und genau die ruft dann jemand an.
                      setProjekt(undefined);
                      setProjectNumber(e.projectNumber);
                    }}
                    className={`min-h-touch rounded border px-3 py-2 text-left text-sm ${
                      projectNumber === e.projectNumber
                        ? 'border-brand bg-brand text-brand-fg'
                        : 'border-line bg-surface text-ink'
                    }`}
                  >
                    {e.name}
                    <span className="ml-1 opacity-70">({e.projectNumber})</span>
                  </button>
                ))}
              </div>
            </div>
          )}

          <BaustellenSelect
            id="wsproj"
            companyId={user.companyId}
            value={projectNumber}
            onChange={(nr, p) => {
              setProjectNumber(nr);
              setProjekt(p);
            }}
            required
          />
          <div className="mt-4">
            <InputField
              id="wsdate"
              label="Leistungsdatum"
              type="date"
              value={datum}
              onChange={(e) => setDatum(e.target.value)}
            />
          </div>
          {projekt && (
            <div className="mt-3 space-y-2">
              {/*
                Adresse und Nummer anklickbar: wer den Schein schreibt, steht vor
                dem Haus oder sucht es noch — und braucht danach oft den Kunden
                ans Telefon, weil unterschrieben werden soll.
              */}
              <span className="flex flex-wrap items-center gap-x-3 text-sm">
                <AdresseLink adresse={projekt.address} />
                <TelefonLink nummer={projekt.contactPhone} name={projekt.contactName} />
              </span>
              {/* Regie oder Pauschal ist eine Tatsache über die Baustelle, keine
                  Bewertung — vorher hiess Pauschal grau und Regie türkis. */}
              <Marke>{projekt.billingMode ?? 'Regie'}</Marke>
            </div>
          )}
          {/*
            Auf einer Pauschalbaustelle belegt der Schein nur, DASS gearbeitet
            wurde — die Stunden sind dort keine Rechnungsgrundlage. Das gehört
            gesagt, sonst rechnet jemand später damit.
          */}
          {projekt?.billingMode === 'Pauschal' && (
            <p className="mt-2 rounded-sm border border-line bg-surface-2 px-3 py-2 text-sm text-info">
              Pauschalbaustelle: Der Schein dokumentiert die geleistete Arbeit, die Stunden sind
              aber keine Grundlage für eine Nachverrechnung.
            </p>
          )}
          {bestehende.length > 0 && (
            <p className="mt-2 rounded-sm border border-line bg-surface-2 px-3 py-2 text-sm text-warning">
              Für diesen Tag gibt es bereits {bestehende.length}{' '}
              {bestehende.length === 1 ? 'Schein' : 'Scheine'}. Ein zweiter ist möglich, etwa für
              einen getrennt beauftragten Zusatz — doppelt bestätigen sollte man dieselben Stunden
              aber nicht.
            </p>
          )}
        </Card>

        {projectNumber ? (
          <Card title={`Zeiten am ${datumAT(datum)} · ${fmtDauer(gesamtMinuten)}`}>
            {/*
              Der Ladezustand steckt jetzt IN dieser Karte, nicht davor. Vorher
              verdeckte er das ganze Formular — auch die Unterschriften, die
              mit der Vorausfüllung gar nichts zu tun haben. Wer vor Ort
              wartet, wartete damit auf etwas, das er zum Unterschreiben nicht
              braucht.
            */}
            {laden ? (
              <LoadingState />
            ) : vorfuellFehler ? (
              <div className="rounded-sm border border-line bg-surface-2 px-3 py-2">
                <p className="text-sm text-warning">{vorfuellFehler}</p>
                <div className="mt-2">
                  <Button variant="secondary" onClick={() => setVersuch((v) => v + 1)}>
                    Erneut versuchen
                  </Button>
                </div>
              </div>
            ) : zeiten.length === 0 ? (
              <EmptyState>
                Noch keine Zeit gebucht. Unten eintragen — oder ohne Stunden lassen, wenn nur
                Material geliefert wurde.
              </EmptyState>
            ) : (
              <ul className="divide-y divide-line">
                {zeiten.map((z, i) => (
                  <li key={`${z.mitarbeiter}-${i}`} className="flex flex-wrap items-center justify-between gap-2 py-2">
                    <span className="min-w-0">
                      <span className="block truncate text-ink">{z.mitarbeiter}</span>
                      <span className="block text-xs text-ink-muted">
                        {z.von && z.bis ? `${z.von}–${z.bis}` : '—'}
                        {z.pauseMin ? ` · ${z.pauseMin} min Pause` : ''}
                        {z.taetigkeit ? ` · ${z.taetigkeit}` : ''}
                      </span>
                    </span>
                    <span className="flex shrink-0 items-center gap-2">
                      {z.helfer && <Marke>Helfer</Marke>}
                      <span className="font-medium text-ink">{fmtMin(z.minuten)}</span>
                    </span>
                    {/*
                      WEGNEHMEN NUR, WAS HIER EINGETRAGEN WURDE. Zeilen aus
                      der Zeiterfassung stehen für gebuchte Zeit; sie hier zu
                      entfernen änderte den Beleg, nicht die Buchung — und die
                      beiden liefen auseinander, ohne dass es jemand sähe.
                    */}
                    {selbstErfasst.has(i) && (
                      <ZeileEntfernen
                        name={z.mitarbeiter}
                        onWeg={() => zeileWegnehmen(i)}
                      />
                    )}
                  </li>
                ))}
              </ul>
            )}

            {/*
              DIE EIGENE ERFASSUNG STEHT IMMER DA, auch wenn schon Zeilen aus
              der Zeiterfassung gekommen sind: der Monteur war vielleicht
              länger dort, als er gebucht hat, oder ein Kollege ist
              dazugestossen.
            */}
            <div className="mt-4">
              <LeistungszeitErfassen
                eigenerName={user?.name ?? ''}
                onHinzufuegen={(zeile) =>
                  setZeiten((z) => {
                    selbstErfasstRef.current = new Set(selbstErfasstRef.current).add(z.length);
                    setSelbstErfasst(selbstErfasstRef.current);
                    return [...z, { ...zeile, datum }];
                  })
                }
                onOffen={setOffeneZeit}
              />
            </div>
          </Card>
        ) : (
          <Card>
            <EmptyState>Zuerst eine Baustelle wählen.</EmptyState>
          </Card>
        )}
      </div>

      {projectNumber && (
        <>
          {/* ── Schritt 2: Material ─────────────────────────────────────── */}
          <div
            ref={(el) => {
              abschnitte.current[2] = el;
            }}
            tabIndex={-1}
            hidden={!sichtbar(2)}
            {...alsSchritt(2)}
          >
            {/*
              KEIN Ladezustand über dieser Karte. Sie hängt an keiner Abfrage
              mehr — die Zeilen kommen aus der Hand des Monteurs. Ein Kreisel
              hier würde ihn warten lassen, obwohl er sofort tippen könnte.
            */}
            <Card title={`Verbautes Material (${material.length})`}>
              <MaterialErfassen
                materials={materials}
                zeilen={material}
                onChange={setMaterial}
                onOffen={setOffenesMaterial}
              />
            </Card>
          </div>

          {/* ── Schritt 3: Fotos (und die Ergänzungen) ──────────────────── */}
          {/*
            Am Schreibtisch in der alten Reihenfolge — Ergänzungen, dann Fotos.
            In der Schrittfolge steht vorne, wonach der Schritt heisst.
          */}
          <div
            ref={(el) => {
              abschnitte.current[3] = el;
            }}
            tabIndex={-1}
            hidden={!sichtbar(3)}
            {...alsSchritt(3)}
          >
            {/* Die Reihenfolge per `order`, deshalb eine eigene Flexbox: am
                Rahmen selbst hebelte `flex` das `hidden` aus. */}
            <div className="flex flex-col gap-6">
              {/*
                DAS NOTIZFELD IST DIE EINE STELLE, AN DER DIE TRENNUNG VON HAND ZU
                UMGEHEN IST.

                Fremde Zeiteinträge darf ein Monteur weder lesen noch schreiben —
                in derselben Ablage stehen Kranken- und Urlaubstage, also
                Gesundheitsdaten nach Art. 9 DSGVO. Den SCHEIN dagegen sieht jeder
                im Betrieb, und das ist Absicht: er ist ein Geschäftsbeleg über
                einen Kundenauftrag, und der Kollege braucht ihn fachlich.

                Wer hier „Kollege war krank" hineinschreibt, hebt damit die
                Trennung auf, die die App an jeder anderen Stelle hält — ohne dass
                ihn etwas daran hindert oder auch nur darauf hinweist. Sperren
                liesse sich das nicht: kein Filter unterscheidet zuverlässig eine
                Krankmeldung von einer Mängelbeschreibung. Sagen lässt es sich, und
                zwar dort, wo getippt wird.
              */}
              <Card
                title="Ergänzungen"
                hint={
                  <>
                    <strong>Was hier steht, sieht jeder im Betrieb.</strong> Der Schein ist ein
                    Geschäftsbeleg über einen Kundenauftrag, keine Personalakte — auch Kollegen, die
                    später auf dieselbe Baustelle kommen, lesen ihn.
                    <br />
                    <br />
                    Angaben zur <strong>Gesundheit</strong> gehören deshalb nicht hierher: „war krank",
                    „darf nicht heben", „Rücken". Solche Daten sind nach Art. 9 DSGVO besonders
                    geschützt, und die App hält sie sonst überall getrennt — Kranken- und Urlaubstage
                    stehen in der Zeiterfassung, die kein Kollege einsehen kann. Eine Notiz hier hebt
                    diese Trennung auf.
                    <br />
                    <br />
                    Gemeint sind: Mängel, Regiearbeiten, Absprachen mit dem Kunden, alles, was zum
                    Auftrag gehört.
                  </>
                }
              >
                <InputField
                  id="wsnotes"
                  label="Notizen, Regiearbeiten, Mängel"
                  value={notizen}
                  onChange={(e) => setNotizen(e.target.value)}
                />
              </Card>

              {/*
                FOTOS — FREIWILLIG, und das steht auch da.

                Der Schein muss im Keller ohne Netz unterschreibbar bleiben:
                Das Ausgangsfach hält einen Schreibvorgang ohne Empfang vor, der
                Dateispeicher tut das nicht. Wäre ein Foto Bedingung, hinge der Beleg an
                einem Balken Empfang — und der Monteur stünde mit einem Kunden vor
                sich da, der unterschreiben will.

                Der Abschnitt erscheint erst mit einer gewählten Baustelle: ein
                Foto ohne Schein hat keinen Ort, an den es gehört.

                EIGENE KARTE, nicht mehr im Kopf der Unterschriften. Dort standen
                ein unterstrichener Link in Akzentfarbe und drei Zeilen graues
                Kleingedrucktes unmittelbar über „Monteur (Name in
                Druckbuchstaben)" — die Zeile las sich wie eine Fehlermeldung zu
                genau diesem Feld. Das Kleingedruckte ist ins „i" der Karte
                gewandert, sichtbar bleibt der eine Satz, der vor Ort zählt.
              */}
              {projekt && (
                <Card
                  className={eineSeite ? '' : 'order-first'}
                  title={`Fotos (${fotos.length}/${MAX_FOTOS})`}
                  hint={
                    <>
                      {/* Gekürzt (Prüflauf 24.09.2026, D9) — und „Firebase Storage"
                          gestrichen: die Bilder liegen seit dem Umzug im Speicher
                          von Supabase. */}
                      Bilder sind kein Pflichtteil, belegen aber, was im Text nur behauptet steht: den
                      Zustand vor dem Eingriff, eine verdeckte Leitung, einen Schaden, der nicht von
                      uns stammt.
                      <br />
                      <br />
                      Nach dem Unterschreiben lassen sie sich nicht mehr ändern — sie gehen in die
                      Prüfsumme des Scheins ein.
                      <br />
                      <br />
                      Ohne Netz geht das Hochladen nicht. Der Schein lässt sich trotzdem unterschreiben,
                      die Bilder müssten dann neu aufgenommen werden — im Keller also besser oben
                      fotografieren.
                      <br />
                      <br />
                      Keine Personen und keine fremden Unterlagen, wenn es nicht sein muss: die Bilder
                      bleiben sieben Jahre in der Firmenablage.
                    </>
                  }
                >
                  <p className="text-sm text-ink-muted">
                    Freiwillig. Höchstens {MAX_FOTOS} Stück, am Gerät verkleinert.
                  </p>

                  {fotos.length > 0 && (
                    <ul className="mt-3 grid grid-cols-3 gap-2 sm:grid-cols-4">
                      {fotos.map((f, i) => (
                        // Ein Foto aus dem Entwurf hat bis zum Eintreffen
                        // seiner Adresse keine Vorschau — dann trägt der Pfad
                        // den Schlüssel.
                        <li key={f.vorschau || `${f.oben?.pfad}#${i}`} className="relative">
                          {f.vorschau ? (
                            <img
                              src={f.vorschau}
                              alt="Aufnahme vom Einsatz"
                              className="aspect-square w-full rounded-sm border border-line object-cover"
                            />
                          ) : (
                            <span
                              role="img"
                              aria-label="Aufnahme vom Einsatz"
                              className="flex aspect-square w-full items-center justify-center rounded-sm border border-line bg-surface-2 text-xs text-ink-muted"
                            >
                              …
                            </span>
                          )}
                          {/*
                            Das Kreuz sitzt AUF dem Bild und braucht deshalb einen
                            eigenen Untergrund — auf einem dunklen Foto wäre ein
                            blosses Zeichen nicht zu sehen.

                            Tastfläche 44 × 44 px, sichtbar bleibt der kleine
                            Kreis an derselben Stelle wie bisher: der Knopf ragt
                            dafür 4 px über die Bildecke hinaus, der Kreis steht
                            in seiner Mitte.
                          */}
                          <button
                            type="button"
                            aria-label="Foto entfernen"
                            title="Foto entfernen"
                            onClick={() => void fotoWegnehmen(f)}
                            className="absolute -right-1 -top-1 flex h-11 w-11 items-center justify-center"
                          >
                            <span
                              aria-hidden="true"
                              className="flex h-7 w-7 items-center justify-center rounded-full bg-surface text-sm text-danger shadow-sm"
                            >
                              ✕
                            </span>
                          </button>
                          {f.oben ? (
                            <p className="mt-1 text-center text-xs text-ink-muted">
                              {groesse(f.oben.bytes)}
                            </p>
                          ) : (
                            <p className="mt-1 text-center text-xs text-warning">
                              {f.fehler ?? 'Wird hochgeladen …'}
                              {f.fehler && (
                                <button
                                  type="button"
                                  onClick={() => void fotoNachreichen(f)}
                                  className="link-hinweis ml-1"
                                >
                                  Nochmal versuchen
                                </button>
                              )}
                            </p>
                          )}
                        </li>
                      ))}
                    </ul>
                  )}

                  {/*
                    Ein Knopf, kein unterstrichener Link. Ein <label> deshalb, weil
                    die Dateiauswahl nur ein <input type="file"> auslöst; „disabled"
                    kann ein Label nicht, also trägt das versteckte Feld die Sperre
                    und das Label nur deren Aussehen.
                  */}
                  <label
                    aria-disabled={fotoKnopfAus}
                    className={`mt-3 inline-flex min-h-touch w-full items-center justify-center gap-2 rounded border border-line px-4 py-2 text-base font-semibold transition sm:w-auto ${
                      fotoKnopfAus
                        ? 'cursor-not-allowed bg-surface-2 text-ink-muted opacity-60'
                        : 'cursor-pointer bg-surface-2 text-ink active:scale-[0.98]'
                    }`}
                  >
                    <input
                      type="file"
                      accept="image/*"
                      capture="environment"
                      multiple
                      className="sr-only"
                      disabled={fotoKnopfAus}
                      onChange={(e) => {
                        void fotoAufnehmen(e.target.files);
                        // Zurücksetzen, sonst löst dieselbe Datei kein
                        // zweites Mal aus — der Monteur tippt und nichts tut sich.
                        e.target.value = '';
                      }}
                    />
                    {fotoLaeuft
                      ? 'Wird verarbeitet …'
                      : fotos.length >= MAX_FOTOS
                        ? `Höchstens ${MAX_FOTOS} Fotos`
                        : fotos.length === 0
                          ? 'Foto aufnehmen'
                          : 'Weiteres Foto'}
                  </label>
                </Card>
              )}
            </div>
          </div>

          {/* ── Schritt 4: Unterschrift ─────────────────────────────────── */}
          <div
            ref={(el) => {
              abschnitte.current[4] = el;
            }}
            tabIndex={-1}
            hidden={!sichtbar(4)}
            className="space-y-6"
            {...alsSchritt(4)}
          >
            {/*
              WAS GLEICH UNTERSCHRIEBEN WIRD, bevor der Kunde den Stift nimmt —
              nur in der Schrittfolge; am Schreibtisch steht ohnehin alles
              darüber. Offenes steht in Warnfarbe dabei; „Ändern" führt in den
              Schritt.
            */}
            {!eineSeite && (
              <Card title="Zusammenfassung">
                <Zusammenfassung
                  onAendern={springe}
                  zeilen={[
                    {
                      name: 'Baustelle und Tag',
                      unter: (
                        <>
                          {projekt?.customerName && (
                            <span className="block">{projekt.customerName}</span>
                          )}
                          <span className="block">
                            {projectNumber} · {datumAT(datum)}
                          </span>
                        </>
                      ),
                      schritt: 1,
                    },
                    {
                      name: 'Zeiten',
                      unter:
                        zeiten.length === 0
                          ? 'Keine Zeit auf dem Schein'
                          : `${personen} ${personen === 1 ? 'Person' : 'Personen'}`,
                      wert: fmtDauer(gesamtMinuten),
                      warnung: offeneZeit
                        ? `Eingetippt, aber nicht übernommen: ${offeneZeit}`
                        : undefined,
                      schritt: 1,
                    },
                    {
                      name: 'Material',
                      unter: `${material.length} ${material.length === 1 ? 'Position' : 'Positionen'}`,
                      warnung: offenesMaterial
                        ? `Eingetippt, aber nicht hinzugefügt: ${offenesMaterial}`
                        : undefined,
                      schritt: 2,
                    },
                    {
                      name: 'Fotos und Notizen',
                      unter: `${fotos.length} ${fotos.length === 1 ? 'Foto' : 'Fotos'} · ${
                        notizen.trim() ? 'mit Notiz' : 'ohne Notiz'
                      }`,
                      warnung: fotosOffen
                        ? `${fotosOffen} ${fotosOffen === 1 ? 'Foto wartet' : 'Fotos warten'} aufs Hochladen`
                        : undefined,
                      schritt: 3,
                    },
                  ]}
                />
              </Card>
            )}

            <Card title="Unterschriften">
              {/*
                Name in Druckbuchstaben NEBEN dem Strich. Eine Unterschrift ohne
                zuordenbaren Namen ist im Streitfall wenig wert — beim Kunden ist
                das Feld deshalb Pflicht.
              */}
              <div className="space-y-6">
                <div>
                  <InputField
                    id="wsmname"
                    label="Monteur (Name in Druckbuchstaben)"
                    value={monteurName}
                    onChange={(e) => setMonteurName(e.target.value)}
                  />
                  <div className="mt-2">
                    <SignaturePad
                      ref={monteurFeld}
                      titel="Unterschrift Monteur"
                      onChange={setMonteurGesetzt}
                    />
                  </div>
                </div>
                <div>
                  <InputField
                    id="wskname"
                    label="Kunde (Name in Druckbuchstaben)"
                    value={kundeName}
                    onChange={(e) => setKundeName(e.target.value)}
                    required
                    pflicht
                  />
                  <div className="mt-2">
                    <SignaturePad
                      ref={kundeFeld}
                      titel="Unterschrift Kunde"
                      onChange={setKundeGesetzt}
                    />
                  </div>
                </div>
              </div>

              {/*
                Wenn die Vorausfuellung nicht durchkam, traegt der Schein KEINE
                Stunden. Unterschreiben laesst er sich trotzdem — aber das muss
                vorher dastehen, denn danach ist er eingefroren.
              */}
              {vorfuellFehler && (
                <p className="mt-4 rounded-sm border border-line bg-surface-2 px-3 py-2 text-sm text-warning">
                  <strong>Ohne Stunden.</strong> Sie konnten nicht geladen werden, und eingefroren
                  wird genau das, was hier steht. Für einen Beleg über die Arbeitszeit bitte bei den
                  Zeiten erneut versuchen; als reine Bestätigung der Anwesenheit mit einer Notiz ist
                  der Schein auch so gültig. Das Material ist davon nicht betroffen — es wird hier
                  ohnehin von Hand eingetragen.
                </p>
              )}
              <p className="mt-4 rounded-sm border border-line bg-surface-2 px-3 py-2 text-sm text-ink-muted">
                Nach dem Unterschreiben ist der Schein <strong>eingefroren</strong>. Korrigiert wird
                über Storno und neuen Schein.
              </p>

              {eineSeite && (
                <>
                  {error && <div className="mt-3"><ErrorState message={error} /></div>}

                  <div className="mt-4 flex flex-col gap-2 sm:flex-row">
                    {unterschreibenKnopf('w-full sm:w-auto')}
                    {entwurfKnopf('w-full sm:w-auto')}
                  </div>
                </>
              )}
              {nichtUebernommen.length > 0 && (
                <p className="mt-2 text-sm text-warning" role="alert">
                  <strong>Noch nicht auf dem Schein:</strong> {nichtUebernommen.join(' und ')}.
                  Bitte übernehmen oder das Feld leeren — unterschrieben wird nur, was in den
                  Listen steht.
                  {/* In der Schrittfolge steht das Feld in einem anderen
                      Schritt: der Weg dorthin gehört an die Meldung. */}
                  {!eineSeite && (offeneZeit || offenesMaterial) && (
                    // Eine eigene Zeile: 48 px hohe Knöpfe mitten im Satz
                    // rissen den Zeilenabstand auf.
                    <span className="mt-1 flex flex-wrap gap-x-4">
                      {offeneZeit && (
                        <button
                          type="button"
                          className="link-hinweis min-h-touch"
                          onClick={() => springe(1)}
                        >
                          Zu den Zeiten
                        </button>
                      )}
                      {offenesMaterial && (
                        <button
                          type="button"
                          className="link-hinweis min-h-touch"
                          onClick={() => springe(2)}
                        >
                          Zum Material
                        </button>
                      )}
                    </span>
                  )}
                </p>
              )}
              {!bereit && projectNumber && (
                <p className="mt-2 text-sm text-ink-muted">
                  {!projekt
                    ? 'Die Stammdaten der Baustelle werden noch geladen.'
                    : `Zum Abschließen fehlen: ${[
                        !monteurGesetzt && 'Unterschrift Monteur',
                        !kundeGesetzt && 'Unterschrift Kunde',
                        kundeName.trim().length < 2 && 'Name des Kunden',
                      ]
                        .filter(Boolean)
                        .join(', ')}`}
                </p>
              )}
            </Card>
          </div>

          {/*
            UNTEN IN DER SCHRITTFOLGE: Zurück, Weiter — im letzten Schritt an
            dessen Stelle der Abschluss — und „Als Entwurf speichern" in JEDEM
            Schritt. Der Schein wird oft am Vormittag vorbereitet und am
            Nachmittag unterschrieben; wer nach Zeiten und Material aufhört,
            soll dafür nicht erst bis zur Unterschrift weiterklicken.

            Die Fehlermeldung steht hier und nicht in der Karte der
            Unterschriften: dort wäre sie ausgeblendet, wenn der Entwurf aus
            Schritt 1 gespeichert wird.
          */}
          {!eineSeite && (
            <div className="space-y-3">
              {error && <ErrorState message={error} />}
              <div className="flex flex-wrap gap-2">
                {schritt > 1 && (
                  <Button variant="secondary" onClick={() => springe((schritt - 1) as Schritt)}>
                    Zurück
                  </Button>
                )}
                {naechster ? (
                  <Button className="flex-1 sm:flex-none" onClick={() => springe(naechster.nr)}>
                    Weiter: {naechster.name}
                  </Button>
                ) : (
                  unterschreibenKnopf('flex-1 sm:flex-none')
                )}
                {entwurfKnopf('w-full sm:ml-auto sm:w-auto')}
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}
