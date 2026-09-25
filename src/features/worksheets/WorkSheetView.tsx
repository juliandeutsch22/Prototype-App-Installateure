import { useEffect, useRef, useState } from 'react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom';
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
import { KontaktZeile } from '@/components/Kontakt';
import { InputField } from '@/components/Field';
import Avatar from '@/components/Avatar';
import Icon from '@/components/Icon';
import InfoHint from '@/components/InfoHint';
import { useToast } from '@/components/Toast';
import { ErrorState, EmptyState, LoadingState } from '@/components/States';
import Meldung from '@/components/Meldung';
import Aktionsleiste from '@/components/Aktionsleiste';
import { List, ListRow } from '@/components/ListRow';
import { ErledigtZeile, Pruefliste, Schrittleiste, Zusammenfassung } from './Schrittfolge';
import { SCHRITTE, useEineSeite, useZweiSpalten, type Schritt } from './schritte';
import MaterialErfassen from './MaterialErfassen';
import { neueKennung, ohneKennung, type MaterialZeile } from './materialZeilen';
import LeistungszeitErfassen, { ZeileEntfernen } from './LeistungszeitErfassen';
import { komprimiere, fotoHochladen, fotoEntfernen } from '@/lib/db/scheinFotos';
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
        if (nummern.length === 1 && !projektAusUrl) setProjectNumber(nummern[0]);
      })
      .catch(() => setHeutige([]));
    return () => {
      verworfen = true;
    };
    // `projektAusUrl` ist beim ersten Zeichnen fix und gehört nicht ins
    // Abhängigkeitsfeld: sonst liefe die Vorauswahl bei jeder Auswahl erneut.
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
        setProjectNumber(schein.projectNumber);
        setDatum(schein.datum);
        setZeiten(schein.zeiten);
        setMaterial(schein.material.map((m) => ({ ...m, id: neueKennung() })));
        setNotizen(schein.notizen ?? '');
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
          const eigene = bisher.filter((_, i) => selbstErfasstRef.current.has(i));
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
          const id = scheinId ?? (await inhaltSchreiben());
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
      const id = scheinId ?? (await inhaltSchreiben());
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
    if (scheinId) await festschreiben(scheinId);
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
    if (scheinId) {
      await updateWorkSheetDraft(scheinId, inhalt);
      return scheinId;
    }
    const neueId = await createWorkSheet(user.companyId, {
      ...inhalt,
      erstelltVonUid: user.uid,
      erstelltVonName: user.name,
    });
    setScheinId(neueId);
    return neueId;
  }

  async function alsEntwurfSichern() {
    if (!user || !projekt) return;
    setSpeichert(true);
    setError(null);
    try {
      await inhaltSchreiben();
      /*
        Nach `scheinId`, nicht nach der Adresse: seit ein Foto den Entwurf
        anlegen kann, gibt es ihn womöglich schon, obwohl man ohne
        `?entwurf=` hereingekommen ist. „Als Entwurf gespeichert" wäre dann
        die falsche Auskunft.
      */
      toast.success(scheinId ? 'Entwurf aktualisiert' : 'Als Entwurf gespeichert');
      navigate('/worksheets');
    } catch (err) {
      setError(grundAus(err, 'Der Entwurf konnte nicht gespeichert werden.'));
    } finally {
      setSpeichert(false);
    }
  }

  /*
    DIE SCHRITTFOLGE: am Telefon und Tablet Zeiten, Material, Fotos,
    Unterschrift nacheinander, am Schreibtisch eine Seite (`Schrittfolge.tsx`).

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

    AM SCHREIBTISCH ZWEISPALTIG (Mockup S. 8, ab 1280 px): links Zeiten,
    Material, Fotos, rechts die Unterschrift. DER BAUM BLEIBT DERSELBE, egal
    wie breit das Fenster ist — nur Klassen und Überschriften wechseln. Ein
    Tablet, das beim Drehen über 1024 oder 1280 px springt, hängte sonst die
    Unterschriftsfelder neu ein, und ihre Striche wären weg, während der
    Schein sich weiter „unterschrieben" merkt. Die frühere Begründung für
    eine Spalte — die rechte Spalte verschmälerte die Zeichenfläche und damit
    das Bild — ist entfallen: das Bild entsteht auf einer festen Fläche
    (`unterschriftExport.ts`), unabhängig von der Breite des Felds.
  */
  const eineSeite = useEineSeite();
  const zweiSpalten = useZweiSpalten();
  const [schritt, setSchritt] = useState<Schritt>(1);
  /** Zählt jeden Sprung — auch einen zum selben Schritt (Schreibtisch: hinrollen). */
  const [sprung, setSprung] = useState(0);
  const abschnitte = useRef<Partial<Record<Schritt, HTMLElement | null>>>({});
  const kopfRef = useRef<HTMLDivElement>(null);
  /**
   * Hat der Monteur seine schon gesetzte Unterschrift wieder aufgemacht?
   * Am Telefon steht sie danach als eine Zeile „Monteur hat unterschrieben"
   * (Mockup S. 5); „Ändern" holt Name und Feld zurück.
   */
  const [monteurAufgemacht, setMonteurAufgemacht] = useState(false);

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
    const ziel = abschnitte.current[schritt];
    if (eineSeite) ziel?.scrollIntoView?.({ block: 'start' });
    else kopfRef.current?.scrollIntoView?.({ block: 'start' });
    ziel?.focus({ preventScroll: true });
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

  /** Ist der Abschnitt gerade zu sehen? Ohne Baustelle gibt es nur den ersten. */
  const sichtbar = (nr: Schritt) => eineSeite || (projectNumber ? schritt === nr : nr === 1);
  const naechster = SCHRITTE.find((s) => s.nr === schritt + 1);
  const personen = new Set(zeiten.map((z) => z.mitarbeiter.trim().toLowerCase())).size;
  const fotosOffen = nochNichtOben(fotos).length;
  const positionen = `${material.length} ${material.length === 1 ? 'Position' : 'Positionen'}`;
  /** Zeilen aus der Zeiterfassung — alles, was nicht hier getippt wurde. */
  const ausErfassung = !vorfuellFehler && zeiten.length > selbstErfasst.size;
  /** Die Monteur-Unterschrift steht am Telefon als erledigte Zeile da. */
  const monteurZu = !eineSeite && monteurGesetzt && !monteurAufgemacht;

  /*
    DER KOPF: „Kunde · Nummer · Datum" (Mockup S. 2), am Schreibtisch mit
    Wochentag und Abrechnung (S. 8). Solange keine Baustelle gewählt ist,
    steht dort, wozu der Schein da ist.
  */
  const wochentag = (() => {
    const tag = new Date(`${datum}T12:00:00`);
    return Number.isNaN(tag.getTime()) ? '' : tag.toLocaleDateString('de-AT', { weekday: 'long' });
  })();
  const metaTeile = projectNumber
    ? [
        projekt?.customerName,
        projectNumber,
        eineSeite && wochentag ? `${wochentag}, ${datumAT(datum)}` : datumAT(datum),
        eineSeite && projekt ? (projekt.billingMode ?? 'Regie') : undefined,
      ].filter(Boolean)
    : [];
  const meta =
    metaTeile.length > 0
      ? metaTeile.join(' · ')
      : entwurfId
        ? 'Vorbereiteter Schein — ergänzen und unterschreiben lassen'
        : 'Leistung vor Ort bestätigen lassen — Zeiten, Material, Unterschrift';
  const titel = entwurfId
    ? 'Handwerksschein — Entwurf'
    : eineSeite
      ? 'Neuer Handwerksschein'
      : 'Handwerksschein';
  /** Was im Kopf des Unterschriftsblatts steht — was gerade unterschrieben wird. */
  const blattMeta = (name: string) =>
    [
      name.trim(),
      projectNumber,
      fmtDauer(gesamtMinuten),
      `${material.length} ${material.length === 1 ? 'Materialposition' : 'Materialpositionen'}`,
    ]
      .filter(Boolean)
      .join(' · ');

  /** Ein Knopf, zwei mögliche Plätze — gerendert wird er immer nur an einem. */
  const entwurfKnopf = (
    <Button
      variant="secondary"
      onClick={alsEntwurfSichern}
      loading={speichert}
      disabled={!projekt || entwurfLaedt}
      className="w-full sm:w-auto"
    >
      {scheinId ? 'Entwurf aktualisieren' : 'Als Entwurf speichern'}
    </Button>
  );

  /*
    WÄHREND DER ENTWURF LÄDT WIRD NICHT GESCHRIEBEN. Sonst schriebe ein
    schneller Finger den halb geladenen Zustand über den vollständigen — und
    der Monteur verlöre genau das, was er sich vorhin aufgehoben hat.
  */
  const abschlussKnopf = (
    <Button
      onClick={unterschreibenUndEinfrieren}
      loading={speichert}
      disabled={!bereit || entwurfLaedt || nichtUebernommen.length > 0}
      className={eineSeite ? 'w-full' : 'flex-1 sm:flex-none'}
    >
      Unterschreiben und abschließen
    </Button>
  );

  /* Die Zeiten: am Telefon Zeilen mit Kürzel, ab 1280 px eine Tabelle. */
  const zeitenListe = zweiSpalten ? (
    <table className="tabelle">
      <thead className="tabelle-kopfzeile">
        <tr>
          <th className="tabelle-kopf">Person</th>
          <th className="tabelle-kopf">Satz</th>
          <th className="tabelle-kopf">Von</th>
          <th className="tabelle-kopf">Bis</th>
          <th className="tabelle-kopf">Pause</th>
          <th className="tabelle-kopf-zahl">Stunden</th>
          <th className="tabelle-kopf-zahl">
            <span className="sr-only">Aktionen</span>
          </th>
        </tr>
      </thead>
      <tbody>
        {zeiten.map((z, i) => (
          <tr key={`${z.mitarbeiter}-${i}`} className="tabelle-zeile">
            <td className="tabelle-name">
              {z.mitarbeiter}
              {z.taetigkeit && <span className="tabelle-unter">{z.taetigkeit}</span>}
            </td>
            <td className="tabelle-zelle">{z.helfer ? 'Helfer' : 'Facharbeiter'}</td>
            <td className="tabelle-zelle">{z.von ?? '—'}</td>
            <td className="tabelle-zelle">{z.bis ?? '—'}</td>
            <td className="tabelle-zelle">{z.pauseMin ? `${z.pauseMin} min` : '—'}</td>
            <td className="tabelle-zahl-stark">{fmtMin(z.minuten)}</td>
            <td className="tabelle-aktionen">
              {/* Wegnehmen nur, was hier eingetragen wurde — siehe unten. */}
              {selbstErfasst.has(i) && (
                <span className="tabelle-knoepfe">
                  <ZeileEntfernen name={z.mitarbeiter} onWeg={() => zeileWegnehmen(i)} />
                </span>
              )}
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  ) : (
    <List>
      {zeiten.map((z, i) => (
        <ListRow
          key={`${z.mitarbeiter}-${i}`}
          vorne={<Avatar name={z.mitarbeiter} size={40} />}
          title={z.mitarbeiter}
          subtitle={[
            z.helfer ? 'Helfer' : 'Facharbeiter',
            z.von && z.bis ? `${z.von}–${z.bis}` : undefined,
            z.pauseMin ? `${z.pauseMin} min Pause` : undefined,
            z.taetigkeit,
          ]
            .filter(Boolean)
            .join(' · ')}
          wert={fmtMin(z.minuten)}
        >
          {/*
            WEGNEHMEN NUR, WAS HIER EINGETRAGEN WURDE. Zeilen aus
            der Zeiterfassung stehen für gebuchte Zeit; sie hier zu
            entfernen änderte den Beleg, nicht die Buchung — und die
            beiden liefen auseinander, ohne dass es jemand sähe.
          */}
          {selbstErfasst.has(i) && (
            <ZeileEntfernen name={z.mitarbeiter} onWeg={() => zeileWegnehmen(i)} />
          )}
        </ListRow>
      ))}
    </List>
  );

  /* Die Fotos als Raster; „Foto aufnehmen" ist die letzte Kachel darin. */
  const fotoRaster = (
    <ul className="schein-fotoraster">
      {fotos.map((f) => (
        <li key={f.vorschau} className="schein-foto">
          <img src={f.vorschau} alt="Aufnahme vom Einsatz" className="schein-foto-bild" />
          {/*
            Das Kreuz sitzt AUF dem Bild und braucht deshalb einen
            eigenen Untergrund — auf einem dunklen Foto wäre ein
            blosses Zeichen nicht zu sehen.
          */}
          <button
            type="button"
            aria-label="Foto entfernen"
            title="Foto entfernen"
            onClick={() => void fotoWegnehmen(f)}
            className="schein-foto-weg"
          >
            ✕
          </button>
          {f.oben ? (
            <p className="schein-foto-stand">{groesse(f.oben.bytes)}</p>
          ) : (
            <p className="schein-foto-stand-warnung">
              {f.fehler ?? 'Wird hochgeladen …'}
              {f.fehler && (
                <button
                  type="button"
                  onClick={() => void fotoNachreichen(f)}
                  className="textlink-allein"
                >
                  Nochmal versuchen
                </button>
              )}
            </p>
          )}
        </li>
      ))}
      <li className="schein-foto">
        {/*
          Eine Kachel mit durchgezogener Kante (Mockup S. 4, in der App ohne
          Strichelung). Ein <label> deshalb, weil die Dateiauswahl nur ein
          <input type="file"> auslöst; „disabled" kann ein Label nicht, also
          trägt das versteckte Feld die Sperre und das Label nur deren Aussehen.
        */}
        <label
          aria-disabled={fotoKnopfAus}
          className={fotoKnopfAus ? 'schein-foto-aufnehmen-aus' : 'schein-foto-aufnehmen'}
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
      </li>
    </ul>
  );

  const fotoHinweis = (
    <>
      {/* Gekürzt (Prüflauf 24.09.2026, D9) — und „Firebase Storage"
          gestrichen: die Bilder liegen seit dem Umzug im Speicher
          von Supabase. */}
      Bilder sind kein Pflichtteil, belegen aber, was im Text nur behauptet steht: den Zustand
      vor dem Eingriff, eine verdeckte Leitung, einen Schaden, der nicht von uns stammt.
      <br />
      <br />
      Nach dem Unterschreiben lassen sie sich nicht mehr ändern — sie gehen in die Prüfsumme des
      Scheins ein.
      <br />
      <br />
      Ohne Netz geht das Hochladen nicht. Der Schein lässt sich trotzdem unterschreiben, die
      Bilder müssten dann neu aufgenommen werden — im Keller also besser oben fotografieren.
      <br />
      <br />
      Keine Personen und keine fremden Unterlagen, wenn es nicht sein muss: die Bilder bleiben
      sieben Jahre in der Firmenablage.
    </>
  );

  /*
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
  */
  const notizHinweis = (
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
  );
  const notizFeld = (
    <InputField
      id="wsnotes"
      label="Notizen, Regiearbeiten, Mängel"
      value={notizen}
      onChange={(e) => setNotizen(e.target.value)}
    />
  );

  /** Die Zeile über den Knöpfen am Telefon: was in diesem Schritt zusammenkommt. */
  const summe =
    schritt === 1
      ? { name: 'Leistungszeit vor Ort', wert: fmtDauer(gesamtMinuten) }
      : schritt === 2
        ? { name: 'Material', wert: positionen }
        : schritt === 3
          ? { name: 'Fotos', wert: String(fotos.length) }
          : undefined;

  return (
    <div className="schein-seite">
      {eineSeite ? (
        <PageHeader
          ueber={
            <Link to="/worksheets" className="schein-zurueck">
              ← Handwerksscheine
            </Link>
          }
          title={titel}
          subtitle={meta}
        />
      ) : (
        /*
          DER KOPF AM TELEFON (Mockup S. 2): zurück, Titel, Metazeile, und
          darunter die Schritte. Die Leiste erst mit einer Baustelle: ohne sie
          gibt es die übrigen Schritte nicht, und eine Leiste mit drei toten
          Zielen wäre schlimmer als keine.
        */
        <div ref={kopfRef} className="schein-kopf">
          <div className="schein-kopf-zeile">
            <Link
              to="/worksheets"
              className="schein-kopf-zurueck"
              aria-label="Zurück zu den Handwerksscheinen"
            >
              <Icon name="zurueck" size={24} />
            </Link>
            <div className="schein-kopf-text">
              <h1 className="schein-kopf-titel">{titel}</h1>
              <p className="schein-kopf-meta">{meta}</p>
            </div>
          </div>
          {projectNumber && <Schrittleiste schritt={schritt} onWahl={springe} />}
        </div>
      )}

      <div className={zweiSpalten && projectNumber ? 'schein-raster' : 'schein-stapel'}>
        <div className="schein-stapel">
          <section
            ref={(el) => {
              abschnitte.current[1] = el;
            }}
            tabIndex={-1}
            aria-label="1 · Zeiten"
            hidden={!sichtbar(1)}
          >
            {/* Die Abstände trägt ein eigener Behälter: eine Klasse mit
                `display` am Abschnitt selbst höbe sein `hidden` auf. */}
            <div className="schein-stapel">
              <Card title="Baustelle und Tag">
                {/*
                  Die eigenen Einsätze zuerst und als Knopf, nicht als Listeneintrag:
                  das ist am Telefon mit Handschuhen ein Ziel, das man trifft.
                */}
                {heutige.length > 0 && (
                  <div className="schein-einsaetze-block">
                    <span className="section-label">Deine Einsätze an diesem Tag</span>
                    <div className="schein-einsaetze">
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
                          className={
                            projectNumber === e.projectNumber
                              ? 'schein-einsatz-gewaehlt'
                              : 'schein-einsatz'
                          }
                        >
                          {e.name}{' '}
                          <span
                            className={
                              projectNumber === e.projectNumber
                                ? 'schein-einsatz-nummer-gewaehlt'
                                : 'schein-einsatz-nummer'
                            }
                          >
                            ({e.projectNumber})
                          </span>
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
                  <div className="schein-baustelle-kontakt">
                    {/*
                      Adresse und Nummer als Chips (Linie, 5): wer den Schein
                      schreibt, steht vor dem Haus oder sucht es noch — und
                      braucht danach oft den Kunden ans Telefon, weil
                      unterschrieben werden soll.
                    */}
                    <KontaktZeile
                      adresse={projekt.address}
                      nummer={projekt.contactPhone}
                      name={projekt.contactName}
                    />
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
                  <div className="mt-2">
                    <Meldung ton="info">
                      Pauschalbaustelle: Der Schein dokumentiert die geleistete Arbeit, die Stunden
                      sind aber keine Grundlage für eine Nachverrechnung.
                    </Meldung>
                  </div>
                )}
                {bestehende.length > 0 && (
                  <div className="mt-2">
                    <Meldung ton="warnung">
                      Für diesen Tag gibt es bereits {bestehende.length}{' '}
                      {bestehende.length === 1 ? 'Schein' : 'Scheine'}. Ein zweiter ist möglich, etwa
                      für einen getrennt beauftragten Zusatz — doppelt bestätigen sollte man dieselben
                      Stunden aber nicht.
                    </Meldung>
                  </div>
                )}
              </Card>

              {projectNumber ? (
                <Card
                  title={
                    eineSeite
                      ? '1 · Zeiten vor Ort'
                      : `Zeiten am ${datumAT(datum)} · ${fmtDauer(gesamtMinuten)}`
                  }
                  action={
                    eineSeite && ausErfassung ? (
                      <span className="schein-karte-angabe">aus der Zeiterfassung übernommen</span>
                    ) : undefined
                  }
                >
                  {!eineSeite && ausErfassung && !laden && (
                    <p className="schein-leise">Aus der Zeiterfassung übernommen.</p>
                  )}
                  {/*
                    Der Ladezustand steckt IN dieser Karte, nicht davor. Vorher
                    verdeckte er das ganze Formular — auch die Unterschriften, die
                    mit der Vorausfüllung gar nichts zu tun haben. Wer vor Ort
                    wartet, wartete damit auf etwas, das er zum Unterschreiben nicht
                    braucht.
                  */}
                  {laden ? (
                    <LoadingState />
                  ) : vorfuellFehler ? (
                    <Meldung ton="warnung">
                      <p>{vorfuellFehler}</p>
                      <div className="mt-2">
                        <Button variant="secondary" onClick={() => setVersuch((v) => v + 1)}>
                          Erneut versuchen
                        </Button>
                      </div>
                    </Meldung>
                  ) : zeiten.length === 0 ? (
                    <EmptyState>
                      Noch keine Zeit gebucht. Unten eintragen — oder ohne Stunden lassen, wenn nur
                      Material geliefert wurde.
                    </EmptyState>
                  ) : (
                    zeitenListe
                  )}
                  {/* Am Schreibtisch steht die Summe unter den Zeilen (Linie, 4) —
                      am Telefon in der Leiste unten. */}
                  {eineSeite && zeiten.length > 0 && (
                    <p className="schein-gesamt">
                      Gesamt <strong className="schein-gesamt-wert">{fmtDauer(gesamtMinuten)}</strong>
                    </p>
                  )}

                  {/*
                    DIE EIGENE ERFASSUNG STEHT IMMER DA, auch wenn schon Zeilen aus
                    der Zeiterfassung gekommen sind: der Monteur war vielleicht
                    länger dort, als er gebucht hat, oder ein Kollege ist
                    dazugestossen.
                  */}
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
                </Card>
              ) : (
                <Card>
                  <EmptyState>Zuerst eine Baustelle wählen.</EmptyState>
                </Card>
              )}
            </div>
          </section>

          {projectNumber && (
            <section
              ref={(el) => {
                abschnitte.current[2] = el;
              }}
              tabIndex={-1}
              aria-label="2 · Material"
              hidden={!sichtbar(2)}
            >
              {/*
                KEIN Ladezustand über dieser Karte. Sie hängt an keiner Abfrage
                mehr — die Zeilen kommen aus der Hand des Monteurs. Ein Kreisel
                hier würde ihn warten lassen, obwohl er sofort tippen könnte.
              */}
              <Card
                title={eineSeite ? '2 · Material' : `Verbautes Material (${material.length})`}
                action={
                  eineSeite ? <span className="schein-karte-wert">{positionen}</span> : undefined
                }
              >
                <MaterialErfassen
                  materials={materials}
                  zeilen={material}
                  onChange={setMaterial}
                  onOffen={setOffenesMaterial}
                  tabelle={zweiSpalten}
                />
              </Card>
            </section>
          )}

          {projectNumber && (
            <section
              ref={(el) => {
                abschnitte.current[3] = el;
              }}
              tabIndex={-1}
              aria-label="3 · Fotos"
              hidden={!sichtbar(3)}
            >
              {/*
                FOTOS — FREIWILLIG, und das steht auch da.

                Der Schein muss im Keller ohne Netz unterschreibbar bleiben:
                Das Ausgangsfach hält einen Schreibvorgang ohne Empfang vor, der
                Dateispeicher tut das nicht. Wäre ein Foto Bedingung, hinge der Beleg an
                einem Balken Empfang — und der Monteur stünde mit einem Kunden vor
                sich da, der unterschreiben will.

                Der Abschnitt erscheint erst mit einer gewählten Baustelle: ein
                Foto ohne Schein hat keinen Ort, an den es gehört.

                AM SCHREIBTISCH stehen Fotos und Notizen in EINER Karte
                nebeneinander (Mockup S. 8); die Erklärung zu den Notizen hängt
                dort am „i" neben dem Feld. Am Telefon sind es zwei Karten
                untereinander.
              */}
              {eineSeite ? (
                <Card
                  title="3 · Fotos"
                  action={
                    <span className="schein-karte-angabe">
                      {fotos.length} von {MAX_FOTOS} · freiwillig
                    </span>
                  }
                  hint={fotoHinweis}
                >
                  <div className="schein-fotos-notizen">
                    <div>
                      {projekt ? (
                        fotoRaster
                      ) : (
                        <p className="schein-leise">
                          Fotos gehen, sobald die Stammdaten der Baustelle geladen sind.
                        </p>
                      )}
                    </div>
                    <div>
                      {notizFeld}
                      <p className="schein-notiz-hinweis">
                        Sieht jeder im Betrieb.
                        <InfoHint about="Ergänzungen">{notizHinweis}</InfoHint>
                      </p>
                    </div>
                  </div>
                </Card>
              ) : (
                <div className="schein-stapel">
                  {projekt && (
                    <Card title="Fotos" anzahl={`${fotos.length} von ${MAX_FOTOS}`} hint={fotoHinweis}>
                      <p className="schein-leise">
                        Freiwillig. Höchstens {MAX_FOTOS} Stück, am Gerät verkleinert.
                      </p>
                      {fotoRaster}
                    </Card>
                  )}
                  <Card title="Ergänzungen" hint={notizHinweis}>
                    {notizFeld}
                  </Card>
                </div>
              )}
            </section>
          )}
        </div>

        <div className="schein-stapel">
          {projectNumber && (
            <section
              ref={(el) => {
                abschnitte.current[4] = el;
              }}
              tabIndex={-1}
              aria-label="4 · Unterschrift"
              hidden={!sichtbar(4)}
            >
              {/*
                AM SCHREIBTISCH EINE KARTE „4 · Unterschrift", AM TELEFON
                EINZELNE KARTEN (Mockup S. 5 und 8). Die Behälter tragen nur
                andere Klassen — ihre Art und Reihenfolge bleibt, damit die
                Unterschriftsfelder beim Wechsel der Breite eingehängt bleiben.
              */}
              <div className={eineSeite ? 'karte' : 'schein-stapel'}>
                {eineSeite && (
                  <header className="karte-kopf">
                    <div className="karte-kopfzeile">
                      <h2 className="titel-karte">4 · Unterschrift</h2>
                    </div>
                  </header>
                )}
                <div className={eineSeite ? 'karte-inhalt' : 'schein-stapel'}>
                  {/*
                    WAS GLEICH UNTERSCHRIEBEN WIRD, bevor der Kunde den Stift
                    nimmt. Offenes steht in Warnfarbe dabei; am Telefon führt
                    „Ändern" in den Schritt.
                  */}
                  {eineSeite ? (
                    <Pruefliste
                      punkte={[
                        {
                          name: 'Zeiten',
                          wert: fmtDauer(gesamtMinuten),
                          ok: !offeneZeit,
                          warnung: offeneZeit
                            ? `Eingetippt, aber nicht übernommen: ${offeneZeit}`
                            : undefined,
                        },
                        {
                          name: 'Material',
                          wert: positionen,
                          ok: !offenesMaterial,
                          warnung: offenesMaterial
                            ? `Eingetippt, aber nicht hinzugefügt: ${offenesMaterial}`
                            : undefined,
                        },
                        {
                          name: 'Fotos',
                          wert: String(fotos.length),
                          ok: !fotosOffen,
                          warnung: fotosOffen
                            ? `${fotosOffen} ${fotosOffen === 1 ? 'Foto wartet' : 'Fotos warten'} aufs Hochladen`
                            : undefined,
                        },
                        {
                          name: 'Monteur',
                          wert: monteurName.trim() || user.name,
                          ok: monteurGesetzt,
                        },
                      ]}
                    />
                  ) : (
                    <div className="karte">
                      <div className="karte-inhalt">
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
                              unter: positionen,
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
                      </div>
                    </div>
                  )}

                  {/*
                    Name in Druckbuchstaben NEBEN dem Strich. Eine Unterschrift
                    ohne zuordenbaren Namen ist im Streitfall wenig wert — beim
                    Kunden ist das Feld deshalb Pflicht.
                  */}
                  <div className={eineSeite ? 'schein-teil' : 'karte'}>
                    <div className={eineSeite ? undefined : 'karte-inhalt'}>
                      {monteurZu && (
                        <ErledigtZeile
                          titel="Monteur hat unterschrieben"
                          unter={monteurName.trim() || user.name}
                        >
                          <button
                            type="button"
                            className="textlink-allein"
                            aria-label="Unterschrift Monteur ändern"
                            onClick={() => setMonteurAufgemacht(true)}
                          >
                            Ändern
                          </button>
                        </ErledigtZeile>
                      )}
                      {/* Ausgeblendet, nicht ausgehängt: das Feld hält die Striche. */}
                      <div hidden={monteurZu}>
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
                            blatt={!eineSeite}
                            meta={blattMeta(monteurName)}
                          />
                        </div>
                      </div>
                    </div>
                  </div>

                  <div className={eineSeite ? 'schein-teil' : 'karte'}>
                    <div className={eineSeite ? undefined : 'karte-inhalt'}>
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
                          blatt={!eineSeite}
                          meta={blattMeta(kundeName)}
                        />
                      </div>
                    </div>
                  </div>

                  <div className={eineSeite ? 'schein-teil' : 'schein-hinweise'}>
                    {/*
                      Wenn die Vorausfuellung nicht durchkam, traegt der Schein KEINE
                      Stunden. Unterschreiben laesst er sich trotzdem — aber das muss
                      vorher dastehen, denn danach ist er eingefroren.
                    */}
                    {vorfuellFehler && (
                      <Meldung ton="warnung">
                        <strong>Ohne Stunden.</strong> Sie konnten nicht geladen werden, und
                        eingefroren wird genau das, was hier steht. Für einen Beleg über die
                        Arbeitszeit bitte bei den Zeiten erneut versuchen; als reine Bestätigung
                        der Anwesenheit mit einer Notiz ist der Schein auch so gültig. Das Material
                        ist davon nicht betroffen — es wird hier ohnehin von Hand eingetragen.
                      </Meldung>
                    )}

                    {nichtUebernommen.length > 0 && (
                      <p className="schein-sperre" role="alert">
                        <strong>Noch nicht auf dem Schein:</strong> {nichtUebernommen.join(' und ')}.
                        Bitte übernehmen oder das Feld leeren — unterschrieben wird nur, was in den
                        Listen steht.{' '}
                        {/* Das Feld steht womöglich in einem anderen Schritt: der Weg
                            dorthin gehört an die Meldung. */}
                        {offeneZeit && (
                          <button type="button" className="textlink" onClick={() => springe(1)}>
                            Zu den Zeiten
                          </button>
                        )}
                        {offeneZeit && offenesMaterial && ' · '}
                        {offenesMaterial && (
                          <button type="button" className="textlink" onClick={() => springe(2)}>
                            Zum Material
                          </button>
                        )}
                      </p>
                    )}
                    {!bereit && (
                      <p className="schein-fehlt">
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

                    {/*
                      AM SCHREIBTISCH STEHT DER ABSCHLUSS IN DER KARTE, unter
                      den Unterschriften (Mockup S. 8) — „Als Entwurf
                      speichern" darunter, wo er immer neben dem Abschluss
                      stand.
                    */}
                    {eineSeite && error && <ErrorState message={error} />}
                    {eineSeite && (
                      <div className="schein-abschluss">
                        {abschlussKnopf}
                        {entwurfKnopf}
                      </div>
                    )}

                    <p className="schein-hinweis">
                      Nach dem Unterschreiben ist der Schein <strong>eingefroren</strong>.
                      Korrigiert wird über Storno und neuen Schein.
                    </p>
                  </div>
                </div>
              </div>
            </section>
          )}
        </div>
      </div>

      {projectNumber && !eineSeite && (
        <>
          {error && <ErrorState message={error} />}

          {/*
            „ALS ENTWURF SPEICHERN" GEHT IN JEDEM SCHRITT. Der Schein wird oft
            am Vormittag vorbereitet und am Nachmittag unterschrieben; wer nach
            Zeiten und Material aufhört, soll dafür nicht erst bis zur
            Unterschrift weiterklicken.
          */}
          {entwurfKnopf}

          {/* Zurück schmal, die Hauptaktion breit, darüber die Summe des
              Schritts (Linie, 6; Mockup S. 2–5). */}
          <Aktionsleiste summe={summe}>
            <div className="schein-knopfreihe">
              {schritt > 1 && (
                <Button variant="secondary" onClick={() => springe((schritt - 1) as Schritt)}>
                  Zurück
                </Button>
              )}
              {naechster ? (
                <Button className="flex-1 sm:flex-none" onClick={() => springe(naechster.nr)}>
                  Weiter: {naechster.name}
                  <Icon name="weiter" size={20} />
                </Button>
              ) : (
                abschlussKnopf
              )}
            </div>
          </Aktionsleiste>
        </>
      )}
    </div>
  );
}
