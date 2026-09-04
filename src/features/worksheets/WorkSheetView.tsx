import { useEffect, useRef, useState } from 'react';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { useAuth } from '@/app/AuthContext';
import { listAssignmentsForUserInRange } from '@/lib/db/assignments';
import { listProjectsByNumbers } from '@/lib/db/projects';
import { listMaterials } from '@/lib/db/materials';
import { callScheinVorbereiten } from '@/lib/functions';
import {
  createWorkSheet,
  getWorkSheet,
  signWorkSheet,
  updateWorkSheetDraft,
  listWorkSheetsForProject,
  type NewWorkSheet,
} from '@/lib/db/workSheets';
import { fmtMin, todayStr } from '@/lib/time';
import type { Material, Project, WorkSheet, WorkSheetZeit } from '@/types';
import type { WithId } from '@/lib/db/core';
import Card from '@/components/Card';
import Button from '@/components/Button';
import Badge from '@/components/Badge';
import PageHeader from '@/components/PageHeader';
import SignaturePad, { type SignaturePadHandle } from '@/components/SignaturePad';
import BaustellenSelect from '@/components/BaustellenSelect';
import { AdresseLink, TelefonLink } from '@/components/Kontakt';
import { InputField } from '@/components/Field';
import { useToast } from '@/components/Toast';
import { ErrorState, EmptyState, LoadingState } from '@/components/States';
import MaterialErfassen from './MaterialErfassen';
import { neueKennung, ohneKennung, type MaterialZeile } from './materialZeilen';

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
     * Sie läuft über eine Cloud Function, und die startet kalt schon einmal
     * mehrere Sekunden. Im Keller mit einem Balken LTE kann sie beliebig
     * lange brauchen — und tat das vorher hinter einem Kreisel ohne Ende und
     * ohne Ausweg. Nach der Frist steht da, was los ist, mit einem Knopf zum
     * Erneut-Versuchen.
     */
    const mitFrist = <T,>(p: Promise<T>, ms = 12000) =>
      Promise.race([
        p,
        new Promise<never>((_, ab) => setTimeout(() => ab(new Error('Zeit abgelaufen')), ms)),
      ]);

    mitFrist(callScheinVorbereiten({ projectNumber, datum }))
      .then(({ data }) => {
        if (verworfen) return;
        setZeiten(data.zeiten);
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
        setZeiten(entwurfZeiten.current ?? []);
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
        if (!verworfen) setBestehende(scheine.filter((s) => s.datum === datum));
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
   * Der Datensatz gehört in die Bedingung, nicht nur die Nummer.
   *
   * Vorher prüfte der Knopf auf die Nummer, das Speichern aber auf den
   * Datensatz und brach ohne Meldung ab, wenn er fehlte. Ein Knopf, der
   * anklickbar aussieht und nichts tut, ist schlimmer als ein gesperrter.
   */
  const bereit =
    !!projekt && monteurGesetzt && kundeGesetzt && kundeName.trim().length > 1;

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
    } catch {
      setError('Der Schein konnte nicht gespeichert werden.');
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
      notizen,
    };
    if (entwurfId) {
      await updateWorkSheetDraft(entwurfId, inhalt);
      return entwurfId;
    }
    return createWorkSheet(user.companyId, {
      ...inhalt,
      erstelltVonUid: user.uid,
      erstelltVonName: user.name,
    });
  }

  async function alsEntwurfSichern() {
    if (!user || !projekt) return;
    setSpeichert(true);
    setError(null);
    try {
      await inhaltSchreiben();
      toast.success(entwurfId ? 'Entwurf aktualisiert' : 'Als Entwurf gespeichert');
      navigate('/worksheets');
    } catch {
      setError('Der Entwurf konnte nicht gespeichert werden.');
    } finally {
      setSpeichert(false);
    }
  }

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
                  <span className="tnum ml-1 opacity-70">({e.projectNumber})</span>
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
            <Badge tone={projekt.billingMode === 'Pauschal' ? 'gray' : 'info'}>
              {projekt.billingMode ?? 'Regie'}
            </Badge>
          </div>
        )}
        {/*
          Auf einer Pauschalbaustelle belegt der Schein nur, DASS gearbeitet
          wurde — die Stunden sind dort keine Rechnungsgrundlage. Das gehört
          gesagt, sonst rechnet jemand später damit.
        */}
        {projekt?.billingMode === 'Pauschal' && (
          <p className="mt-2 rounded-sm border border-info/30 bg-info-bg px-3 py-2 text-sm text-info">
            Pauschalbaustelle: Der Schein dokumentiert die geleistete Arbeit, die Stunden sind
            aber keine Grundlage für eine Nachverrechnung.
          </p>
        )}
        {bestehende.length > 0 && (
          <p className="mt-2 rounded-sm border border-warning/30 bg-warning-bg px-3 py-2 text-sm text-warning">
            Für diesen Tag gibt es bereits {bestehende.length}{' '}
            {bestehende.length === 1 ? 'Schein' : 'Scheine'}. Ein zweiter ist möglich, etwa für
            einen getrennt beauftragten Zusatz — doppelt bestätigen sollte man dieselben Stunden
            aber nicht.
          </p>
        )}
      </Card>

      {projectNumber ? (
        <>
          <Card title={`Zeiten am ${datum} · ${fmtMin(gesamtMinuten)}`}>
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
              <div className="rounded-sm border border-warning/30 bg-warning-bg px-3 py-2">
                <p className="text-sm text-warning">{vorfuellFehler}</p>
                <div className="mt-2">
                  <Button variant="secondary" onClick={() => setVersuch((v) => v + 1)}>
                    Erneut versuchen
                  </Button>
                </div>
              </div>
            ) : zeiten.length === 0 ? (
              <EmptyState>
                Für diesen Tag ist auf dieser Baustelle keine Zeit gebucht. Ein Schein ohne
                Stunden ergibt nur Sinn, wenn ausschließlich Material geliefert wurde.
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
                      {z.helfer && <Badge tone="warning">Helfer</Badge>}
                      <span className="tnum font-medium text-ink">{fmtMin(z.minuten)}</span>
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </Card>

          {/*
            KEIN Ladezustand über dieser Karte. Sie hängt an keiner Abfrage
            mehr — die Zeilen kommen aus der Hand des Monteurs. Ein Kreisel
            hier würde ihn warten lassen, obwohl er sofort tippen könnte.
          */}
          <Card title={`Verbautes Material (${material.length})`}>
            <MaterialErfassen materials={materials} zeilen={material} onChange={setMaterial} />
          </Card>

          <Card title="Ergänzungen">
            <InputField
              id="wsnotes"
              label="Notizen, Regiearbeiten, Mängel"
              value={notizen}
              onChange={(e) => setNotizen(e.target.value)}
            />
          </Card>

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
              <p className="mt-4 rounded-sm border border-warning/30 bg-warning-bg px-3 py-2 text-sm text-warning">
                <strong>Ohne Stunden.</strong> Sie konnten nicht geladen werden, und eingefroren
                wird genau das, was hier steht. Für einen Beleg über die Arbeitszeit bitte oben
                erneut versuchen; als reine Bestätigung der Anwesenheit mit einer Notiz ist der
                Schein auch so gültig. Das Material ist davon nicht betroffen — es wird hier
                ohnehin von Hand eingetragen.
              </p>
            )}
            <p className="mt-4 rounded-sm border border-line bg-surface-2 px-3 py-2 text-sm text-ink-muted">
              Mit dem Unterschreiben wird der Schein <strong>eingefroren</strong>: Zeiten,
              Material und Notizen lassen sich danach nicht mehr ändern. Eine Korrektur läuft über
              einen Storno und einen neuen Schein.
            </p>

            {error && <div className="mt-3"><ErrorState message={error} /></div>}

            <div className="mt-4 flex flex-col gap-2 sm:flex-row">
              {/*
                WÄHREND DER ENTWURF LÄDT WIRD NICHT GESCHRIEBEN. Sonst
                schriebe ein schneller Finger den halb geladenen Zustand über
                den vollständigen — und der Monteur verlöre genau das, was er
                sich vorhin aufgehoben hat.
              */}
              <Button
                onClick={unterschreibenUndEinfrieren}
                loading={speichert}
                disabled={!bereit || entwurfLaedt}
                className="w-full sm:w-auto"
              >
                Unterschreiben und abschließen
              </Button>
              <Button
                variant="secondary"
                onClick={alsEntwurfSichern}
                loading={speichert}
                disabled={!projekt || entwurfLaedt}
                className="w-full sm:w-auto"
              >
                {entwurfId ? 'Entwurf aktualisieren' : 'Als Entwurf speichern'}
              </Button>
            </div>
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
        </>
      ) : (
        <Card>
          <EmptyState>Zuerst eine Baustelle wählen.</EmptyState>
        </Card>
      )}
    </div>
  );
}
