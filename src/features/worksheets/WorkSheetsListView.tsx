import { useEffect, useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { useAuth } from '@/app/AuthContext';
import {
  listRecentWorkSheets,
  listSignedWorkSheetsInRange,
  listWorkSheetsInRange,
  listWorkSheetsForProject,
  cancelWorkSheet,
  discardWorkSheetDraft,
  restoreWorkSheetDraft,
} from '@/lib/db/workSheets';
import { buildWorkSheetPdf, shareOrDownloadPdf } from './worksheetPdf';
import Fotostreifen from './Fotostreifen';
import Nachladen from '@/components/Nachladen';
import { listEntriesInRange } from '@/lib/db/timeEntries';
import { scheineOhneBuchung, minutenOhneBuchung, OFFEN_AB_TAGEN } from './fehlendeZeitbuchung';
import { deuteSuche, suchHinweis } from './scheinSuche';
import { isGF, canWriteWorkSheet, canEditTime } from '@/lib/permissions';
import { fmtMin, tageWort, todayStr } from '@/lib/time';
import type { TimeEntry, WorkSheet } from '@/types';
import type { WithId } from '@/lib/db/core';
import Card from '@/components/Card';
import Icon from '@/components/Icon';
import Button from '@/components/Button';
import { Warnung, Zustand, type Stand } from '@/components/Badge';
import ConfirmDialog from '@/components/ConfirmDialog';
import PageHeader from '@/components/PageHeader';
import { List, ListRow } from '@/components/ListRow';
import { InputField } from '@/components/Field';
import { useToast } from '@/components/Toast';
import { ErrorState, EmptyState, SkeletonList } from '@/components/States';
import { grundAus } from '@/lib/fehlerGrund';

const STAND: Record<WorkSheet['status'], Stand> = {
  Unterschrieben: 'gut',
  Entwurf: 'laeuft',
  // Kein Rot: weder der Storno noch der aufgegebene Entwurf ist ein
  // Zwischenfall. Der eine ist die vorgesehene Korrektur, der andere der
  // Normalfall eines geplatzten Auftrags — beide sind abgeschlossen.
  Storniert: 'ruht',
  Verworfen: 'ruht',
};

/**
 * Die Handwerksscheine des Betriebs.
 *
 * Für das Büro der Beleg zur Rechnung, für die Baustelle der Nachweis. Ein
 * unterschriebener Schein lässt sich hier ansehen und als PDF weitergeben,
 * aber nicht mehr ändern — Korrekturen laufen ausschließlich über einen
 * Storno und einen neuen Schein.
 */
/**
 * Wie viele Handwerksscheine auf einmal geholt werden.
 *
 * Bewusst niedrig: ein unterschriebener Schein wiegt rund 70 KB, weil er die
 * beiden Unterschriftsbilder mitträgt. Die Zahl ist hier keine Frage der
 * Übersicht, sondern der Leitung.
 */
const SCHEINE_JE_SEITE = 50;

/**
 * Wie viele Scheine die tiefe Prüfung höchstens holt.
 *
 * Dieselbe Rechnung wie oben, nur über einen längeren Zeitraum: rund 70 KB je
 * unterschriebenem Schein. Hundertfünfzig sind knapp elf Megabyte — viel für
 * eine Ansicht, vertretbar für einen bewussten Griff am Bürorechner. Wird die
 * Grenze erreicht, sagt die Karte es; sie schneidet nicht still ab.
 */
const PRUEF_GRENZE = 150;

/** Zeiträume, die sich prüfen lassen. */
const PRUEF_ZEITRAEUME = [30, 90, 365];

export default function WorkSheetsListView() {
  const { user, company } = useAuth();
  const toast = useToast();
  const [suchparameter] = useSearchParams();
  const markiert = suchparameter.get('markiert');

  const [scheine, setScheine] = useState<WithId<WorkSheet>[]>([]);
  /*
    WIE WEIT DIE LISTE ZURÜCKREICHT — und hier wiegt jeder Datensatz schwer.

    Ein unterschriebener Schein trägt zwei Unterschriftsbilder als PNG im
    Dokument; nachgemessen sind das rund 70 KB je Schein. Hundert Scheine
    waren damit knapp sieben Megabyte, bei jedem Öffnen dieser Ansicht. Fünfzig
    decken bei einem Fünf-Mann-Betrieb gut einen Monat ab, und wer weiter
    zurück muss, lädt nach — sichtbar, statt es nie zu erfahren.
  */
  const [grenze, setGrenze] = useState(SCHEINE_JE_SEITE);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [suche, setSuche] = useState('');
  const [offen, setOffen] = useState<string | null>(markiert);
  const [stornoFuer, setStornoFuer] = useState<WithId<WorkSheet> | null>(null);
  const [stornoGrund, setStornoGrund] = useState('');
  const [verwerfenFuer, setVerwerfenFuer] = useState<WithId<WorkSheet> | null>(null);
  const [zeigeVerworfene, setZeigeVerworfene] = useState(false);
  const [busy, setBusy] = useState(false);

  const darfStornieren = user ? isGF(user.role) : false;
  /**
   * Wer darf einen Entwurf weiterbearbeiten?
   *
   * DIESELBE Prüfung wie die Route dahinter — sonst führte der Knopf für die
   * Buchhaltung und die Verwaltung, die diese Liste ebenfalls sehen, auf eine
   * Seite mit „Kein Zugriff".
   */
  const darfSchreiben = user ? canWriteWorkSheet(user.role) : false;

  const laden = useMemo(
    () => async () => {
      if (!user) return;
      setLoading(true);
      try {
        setScheine(await listRecentWorkSheets(user.companyId, grenze));
      } catch (e) {
        setError((e as Error).message);
      } finally {
        setLoading(false);
      }
    },
    [user, grenze],
  );

  useEffect(() => {
    void laden();
  }, [laden]);

  /*
    DIE KOLLEGENZEILE, AN DIE NIEMAND ERINNERT WIRD — nur fürs Büro.

    Der Nachtrag in der Zeiterfassung deckt nur die EIGENEN Zeilen des
    Monteurs ab, und das muss so bleiben: in derselben Tabelle stehen
    Kranken- und Urlaubstage der Kollegen, also Gesundheitsdaten nach Art. 9
    DSGVO. Der Zeilenschutz lässt den Monteur deshalb nur an die
    eigenen Einträge.

    Trägt er auf dem Schein die Zeile eines Kollegen ein, hat sie damit
    niemanden, der an sie erinnert wird: der Monteur sieht fremde Buchungen
    nicht, der Kollege sieht den fremden Schein nicht. Die Stunde steht
    unterschrieben beim Kunden — und wird nie gebucht, also nie verrechnet
    und nie aufgezeichnet.

    GELADEN WIRD NUR FÜR DIE, DIE ES AUCH DÜRFEN. `canEditTime` ist genau
    die Rolle, die fremde Zeiteinträge sehen UND anlegen darf; für alle
    anderen bliebe die Abfrage an den Regeln hängen und produzierte nichts
    als einen Fehler in einer Ansicht, die sie sonst benutzen können.
  */
  const [buchungen, setBuchungen] = useState<
    Array<Pick<TimeEntry, 'date' | 'status' | 'projectNumber' | 'userName'>>
  >([]);
  const darfZeitenSehen = user ? canEditTime(user.role) : false;

  /*
    WIE WEIT DIE PRÜFUNG ZURÜCKREICHT — und warum das eine Wahl ist.

    Zuerst über die Scheine, die die Liste ohnehin geladen hat: das kostet
    keine zusätzliche Abfrage und deckt den Alltag ab. Gerade der ALTE Schein
    ist aber der teure — was vier Monate zurückliegt, bucht niemand mehr von
    selbst nach, und der lag ausserhalb der geladenen fünfzig.

    Weiter zurück wird deshalb auf Anforderung geprüft, nicht bei jedem
    Aufruf. Ein unterschriebener Schein trägt zwei Unterschriftsbilder als PNG
    im Dokument, rund 70 KB je Stück; ein Jahr wären schnell zwanzig
    Megabyte. Das ist als bewusster Griff des Büros vertretbar, als stiller
    Nebeneffekt beim Öffnen eines Reiters nicht.
  */
  const [tiefePruefung, setTiefePruefung] = useState<number | null>(null);
  const [tiefeScheine, setTiefeScheine] = useState<WithId<WorkSheet>[] | null>(null);
  const [pruefungLaeuft, setPruefungLaeuft] = useState(false);

  /** Die Scheine, über die geprüft wird: die tiefe Prüfung schlägt die Liste. */
  const pruefBasis = tiefeScheine ?? scheine;

  /* Der Zeitraum für die Buchungen folgt der Prüfbasis, nicht dem Kalender:
     ein fester Monat holte entweder zu wenig oder viel zu viel. */
  const zeitraum = useMemo(() => {
    const tage = pruefBasis
      .filter((s) => s.status === 'Unterschrieben')
      .map((s) => s.datum)
      .sort();
    if (tage.length === 0) return null;
    return { von: tage[0], bis: tage[tage.length - 1] };
  }, [pruefBasis]);

  useEffect(() => {
    if (!user || !darfZeitenSehen || !zeitraum) {
      setBuchungen([]);
      return;
    }
    let abgemeldet = false;
    listEntriesInRange(user.companyId, zeitraum.von, zeitraum.bis)
      .then((rows) => {
        if (!abgemeldet) setBuchungen(rows);
      })
      /*
        STILL SCHEITERN, ABER NUR HIER. Die Scheinliste ist das, wofür diese
        Seite da ist; sie darf nicht wegen einer Zusatzauswertung mit einer
        Fehlermeldung stehenbleiben. Bleibt die Abfrage aus, bleibt die Karte
        leer — und die Karte sagt selbst, worauf sie sich stützt.
      */
      .catch(() => undefined);
    return () => {
      abgemeldet = true;
    };
  }, [user, darfZeitenSehen, zeitraum]);

  /** Weiter zurück prüfen — auf Anforderung, mit gewähltem Zeitraum. */
  async function tieferPruefen(tage: number) {
    if (!user) return;
    setPruefungLaeuft(true);
    try {
      const bis = todayStr();
      const von = new Date(Date.parse(`${bis}T00:00:00Z`) - tage * 86_400_000)
        .toISOString()
        .slice(0, 10);
      setTiefeScheine(await listSignedWorkSheetsInRange(user.companyId, von, bis, PRUEF_GRENZE));
      setTiefePruefung(tage);
    } catch {
      // Auch hier still: die Liste darunter bleibt benutzbar. Der Zustand
      // bleibt auf dem alten Stand, statt fälschlich „nichts offen" zu sagen.
      setTiefeScheine(null);
      setTiefePruefung(null);
    } finally {
      setPruefungLaeuft(false);
    }
  }

  const ohneBuchung = useMemo(
    () => (darfZeitenSehen ? scheineOhneBuchung(pruefBasis, buchungen, todayStr()) : []),
    [darfZeitenSehen, pruefBasis, buchungen],
  );

  const verworfene = useMemo(
    () => scheine.filter((s) => s.status === 'Verworfen').length,
    [scheine],
  );

  /**
   * Verworfene bleiben in der Datenbank, aber nicht im Weg.
   *
   * Sie AUCH aus der Ansicht zu nehmen waere das Loeschen durch die
   * Hintertuer: was niemand mehr sehen kann, ist verschwunden. Der Schalter
   * nennt deshalb ihre Zahl — auch eingeklappt sagt die Liste, was sie
   * gerade nicht zeigt.
   */
  /*
    SUCHE ÜBER DEN GELADENEN BESTAND HINAUS.

    Das Feld filterte bis hierher nur die geladenen fünfzig im Browser. Ein
    Schein vom März war damit nicht auffindbar, egal was jemand eintippte —
    und das Feld sagte nichts dazu, es lieferte einfach kein Ergebnis.
    Dieselbe Fehlerform wie beim Buchhaltungs-Export damals: eine leere
    Antwort, die wie ein Befund aussieht.

    Serverseitig gehen Baustellennummer (exakt) und Zeitraum. Nach Kundenname
    oder Notiz wird weiterhin nur im geladenen Bestand gesucht — nicht weil es
    nicht ginge (die Spalten sind da, siehe `scheinSuche.ts`), sondern weil es
    noch nicht nachgezogen ist. Das steht in der Ansicht, statt es zu
    behaupten.
  */
  const [treffer, setTreffer] = useState<WithId<WorkSheet>[] | null>(null);
  const [trefferZu, setTrefferZu] = useState('');
  const [sucheLaeuft, setSucheLaeuft] = useState(false);
  const absicht = useMemo(() => deuteSuche(suche), [suche]);

  async function serverseitigSuchen() {
    if (!user || absicht.art === 'text') return;
    setSucheLaeuft(true);
    try {
      const gefunden =
        absicht.art === 'baustelle'
          ? await listWorkSheetsForProject(user.companyId, absicht.nummer, PRUEF_GRENZE)
          : await listWorkSheetsInRange(user.companyId, absicht.von, absicht.bis, PRUEF_GRENZE);
      setTreffer(gefunden);
      setTrefferZu(suche.trim());
    } catch (e) {
      // Sichtbar, nicht still: wer sucht, wartet auf eine Antwort. „Nichts
      // gefunden" wäre hier die falsche — es wurde gar nicht gesucht.
      setError((e as Error).message);
      setTreffer(null);
    } finally {
      setSucheLaeuft(false);
    }
  }

  /*
    Das Ergebnis gilt für GENAU den Begriff, mit dem es geholt wurde. Tippt
    jemand weiter, ist es veraltet und verschwindet — stehen zu bleiben hiesse,
    Scheine unter einem Suchbegriff zu zeigen, zu dem sie nicht passen.
  */
  const trefferGelten = treffer !== null && trefferZu === suche.trim() && trefferZu !== '';

  const sichtbar = useMemo(() => {
    const q = suche.trim().toLowerCase();
    const grundmenge = trefferGelten ? (treffer as WithId<WorkSheet>[]) : scheine;
    return grundmenge.filter((s) => {
      if (s.status === 'Verworfen' && !zeigeVerworfene) return false;
      // Das Serverergebnis ist bereits die Antwort auf den Begriff; noch
      // einmal danach zu filtern würde einen Treffer wegwerfen, dessen
      // Baustellennummer anders geschrieben ist („PR-2026-042").
      if (!q || trefferGelten) return true;
      return [s.customerName, s.projectNumber, s.datum, s.notizen].some((v) =>
        v?.toLowerCase().includes(q),
      );
    });
  }, [scheine, treffer, trefferGelten, suche, zeigeVerworfene]);

  async function pdfAusgeben(s: WithId<WorkSheet>) {
    setBusy(true);
    try {
      // Der ganze Firmensatz, nicht nur der Name: der Beleg soll sagen, an
      // wen der Kunde sich wenden muss.
      const blob = await buildWorkSheetPdf(s, {
        name: company?.name ?? 'Installateur',
        addressLine: company?.addressLine,
        contactLine: company?.contactLine,
        logoUrl: company?.logoUrl,
      });
      const art = await shareOrDownloadPdf(
        blob,
        `Handwerksschein_${s.projectNumber}_${s.datum}.pdf`,
      );
      toast.success(art === 'geteilt' ? 'Schein geteilt' : 'PDF gespeichert');
    } catch {
      setError('Das PDF konnte nicht erzeugt werden.');
    } finally {
      setBusy(false);
    }
  }

  if (!user) return null;

  return (
    <div className="space-y-6">
      {/*
        DER KNOPF STEHT IM KOPF, wie „Neues Angebot" und „Neue Wartung".
        Gemeldet: „der Tab sieht vom Aufbau her ganz anders aus — der Button
        erstreckt sich über die ganze Zeile". Er stand als einzige Anlage-
        Aktion der App in einer eigenen Karte über volle Breite. Ein Link und
        kein Knopf, weil er eine andere Seite öffnet; er sieht aus wie der
        Hauptknopf der anderen Listen.
      */}
      <PageHeader
        title="Handwerksscheine"
        subtitle="Unterschriebene Leistungsnachweise der Baustellen"
        action={
          <Link
            to="/worksheet"
            className="inline-flex min-h-touch items-center justify-center gap-2 rounded bg-brand px-4 py-2 text-sm font-semibold text-brand-fg shadow-sm transition hover:opacity-95 active:scale-[0.98] sm:text-base"
          >
            <Icon name="plus" size={18} />
            Neuer Schein
          </Link>
        }
      />

      {/*
        NUR FÜRS BÜRO — `canEditTime` ist die Rolle, die fremde Zeiteinträge
        lesen UND anlegen darf. Für alle anderen wäre die Karte eine Liste
        ohne Handhabe.

        SIE STEHT AUCH DA, WENN NICHTS OFFEN IST, und das ist eine Abkehr von
        der ersten Fassung. Damals war sie ein reiner Befund, und ein leerer
        Kasten „alles gebucht" wäre Rauschen gewesen. Jetzt trägt sie eine
        HANDLUNG: weiter zurück prüfen. Verschwände sie bei null Befunden,
        gäbe es keinen Weg mehr zu der Prüfung, die den alten — und damit
        teuren — Schein überhaupt erst findet. Ohne Befund bleibt sie
        entsprechend knapp.

        Sie steht ÜBER der Scheinliste, weil sie eine Frist hat: eine Stunde,
        die niemand bucht, wird nie verrechnet und fehlt zugleich in der
        Arbeitszeitaufzeichnung nach § 26 AZG. Das ist dringender als das
        Nachschlagen eines Belegs.
      */}
      {darfZeitenSehen && (
        <Card
          title={`Stunden ohne Buchung (${ohneBuchung.length})`}
          hint={
            <>
              <strong>Was hier steht.</strong> Unterschriebene Handwerksscheine, auf denen Zeit
              vermerkt ist, zu der es in der Zeiterfassung keine passende Anwesenheit gibt —
              älteste zuerst, ab {OFFEN_AB_TAGEN} Tagen. Gebucht wird am Ende des Arbeitstags,
              oft erst am Morgen darauf; der Schein von gestern ist deshalb noch kein Befund.
              <br />
              <br />
              <strong>Warum das nicht der Monteur selbst sieht.</strong> Er wird in der
              Zeiterfassung an seine eigenen Scheine erinnert — aber nur an die eigenen Zeilen.
              Fremde Zeiteinträge darf er weder lesen noch schreiben: in derselben Ablage stehen
              Kranken- und Urlaubstage der Kollegen, also Gesundheitsdaten. Trägt er auf dem
              Schein die Zeile eines Kollegen ein, hat sie damit niemanden, der an sie erinnert
              wird — er sieht dessen Buchungen nicht, und der Kollege sieht diesen Schein nicht.
              Genau diese Lücke schliesst diese Liste.
              <br />
              <br />
              <strong>Was es kostet.</strong> Die Rechnung nimmt ihre Stunden aus den
              Zeiteinträgen, nicht vom Schein — der Schein liefert nur das Material. Eine
              ungebuchte Stunde wird also nie verrechnet, nicht „später korrigiert", sondern
              nie. Und sie fehlt in der Arbeitszeitaufzeichnung, die der Betrieb nach § 26 AZG
              zu führen hat: dort stünde ein Tag, an dem der Mann nachweislich beim Kunden war
              und laut Aufzeichnung nicht gearbeitet hat.
              <br />
              <br />
              <strong>„Auf einer anderen Baustelle gebucht"</strong> ist der mildere Fall: die
              Arbeitszeit ist aufgezeichnet, sie hängt nur am falschen Auftrag. Das kommt
              regelmässig vor, wenn jemand den ganzen Tag auf die Hauptbaustelle bucht und
              zwischendurch bei diesem Kunden war. Zu tun ist es trotzdem — die Zuordnung
              entscheidet, wem die Stunde verrechnet wird.
              <br />
              <br />
              <strong>Verglichen werden Tag und Name, nicht die Minuten.</strong> Sie dürfen
              abweichen: der Schein bestätigt die Zeit beim Kunden, der Eintrag umfasst den
              Arbeitstag samt Anfahrt. Der Name kommt vom Schein, wie ihn der Monteur getippt
              hat; Gross- und Kleinschreibung spielen keine Rolle, eine Abkürzung („F. Huber")
              findet die Buchung aber nicht. Deshalb steht hier „keine Buchung gefunden" und
              nicht „nicht gebucht".
              <br />
              <br />
              <strong>Woher die Daten stammen.</strong> Zunächst aus den unten geladenen
              Scheinen und den Zeiteinträgen desselben Zeitraums — das kostet keine zusätzliche
              Abfrage. Mit „Weiter zurück prüfen" wird stattdessen gezielt über alle
              unterschriebenen Scheine des gewählten Zeitraums geprüft; darüber steht jedes Mal,
              worauf sich das Ergebnis stützt.
              <br />
              <br />
              <strong>Warum das nicht automatisch passiert.</strong> Ein unterschriebener Schein
              trägt zwei Unterschriftsbilder im Dokument, rund 70 KB je Stück — ein Jahr wären
              schnell zwanzig Megabyte. Als bewusster Griff am Bürorechner ist das in Ordnung,
              als stiller Nebeneffekt beim Öffnen eines Reiters nicht. Aus demselben Grund holt
              die Prüfung höchstens {PRUEF_GRENZE} Scheine; wird die Grenze erreicht, steht es
              da, statt still zu wirken.
            </>
          }
        >
          {minutenOhneBuchung(ohneBuchung) > 0 && (
            <p className="mb-3 text-sm text-ink">
              <strong>{fmtMin(minutenOhneBuchung(ohneBuchung))}</strong> stehen unterschrieben
              beim Kunden und in keiner Zeiterfassung.
            </p>
          )}

          {/*
            WORAUF SICH DIE PRÜFUNG STÜTZT, steht sichtbar da — sonst hiesse
            „nichts offen" mal „im letzten Monat" und mal „im letzten Jahr",
            ohne dass es jemand unterscheiden könnte.
          */}
          <p className="mb-3 text-xs text-ink-muted">
            {tiefePruefung
              ? `Geprüft über die letzten ${tiefePruefung} Tage (${pruefBasis.length} unterschriebene Scheine).`
              : `Geprüft über die ${scheine.length} geladenen Scheine dieser Liste.`}
            {tiefeScheine && tiefeScheine.length >= PRUEF_GRENZE && (
              <>
                {' '}
                <strong className="text-warning">
                  Die Grenze von {PRUEF_GRENZE} Scheinen ist erreicht — ältere sind nicht dabei.
                </strong>
              </>
            )}
          </p>

          {/*
            DIE BESCHRIFTUNG STEHT ÜBER DER REIHE, nicht davor.

            Davor gesetzt, füllte sie auf einem Telefon die erste Zeile fast
            allein aus; der erste Schalter rutschte noch daneben, die beiden
            anderen in die nächste Zeile. Heraus kam ein Umbruch mitten in
            einer Auswahl, die zusammengehört — und drei fette Blöcke, von
            denen jeder aussah, als wäre er für sich wichtig.

            Jetzt: eine Zeile Beschriftung, darunter die drei Schalter in
            einer Reihe. `klein` nimmt ihnen Polsterung und Schriftgrösse,
            nicht die Höhe — anzutippen bleiben sie mit Arbeitshandschuhen.
          */}
          <div className="mb-3">
            <span className="mb-2 block text-sm text-ink-muted">Weiter zurück prüfen:</span>
            <div className="flex flex-wrap items-center gap-2">
              {PRUEF_ZEITRAEUME.map((tage) => (
                <Button
                  key={tage}
                  groesse="klein"
                  variant={tiefePruefung === tage ? 'primary' : 'secondary'}
                  disabled={pruefungLaeuft}
                  onClick={() => void tieferPruefen(tage)}
                >
                  {tage === 365 ? '1 Jahr' : `${tage} Tage`}
                </Button>
              ))}
              {pruefungLaeuft && <span className="text-sm text-ink-muted">Wird geprüft …</span>}
            </div>
          </div>

          {ohneBuchung.length === 0 && (
            <EmptyState>
              Zu jeder Stunde auf diesen Scheinen gibt es eine Buchung in der Zeiterfassung.
            </EmptyState>
          )}

          <List>
            {ohneBuchung.map(({ schein, zeilen, tage }) => (
              <ListRow
                key={schein.id}
                title={
                  <>
                    <span>{schein.customerName}</span>
                    <Warnung stufe={tage >= 30 ? 'dringend' : 'achtung'}>{tageWort(tage)}</Warnung>
                  </>
                }
                subtitle={
                  <>
                    <span className="tnum">
                      Baustelle {schein.projectNumber} · Leistung vom {schein.datum}
                    </span>
                    <span className="mt-1 block">
                      {zeilen.map((z) => (
                        <span key={z.name} className="block text-xs text-ink-muted">
                          {z.name} · {fmtMin(z.minuten)} ·{' '}
                          {z.art === 'keine'
                            ? 'keine Buchung gefunden'
                            : `gebucht auf ${z.gebuchtAuf?.join(', ')}`}
                        </span>
                      ))}
                    </span>
                  </>
                }
              >
                {/*
                  Der Weg führt zum SCHEIN, nicht direkt in ein Zeitformular:
                  wer eine fremde Stunde nachträgt, muss vorher sehen, was auf
                  dem Beleg steht — Spanne, Tätigkeit, Helferhaken. Ein Knopf,
                  der ein leeres Formular öffnet, verleitete zum Schätzen.
                */}
                <Button
                  variant="secondary"
                  onClick={() => {
                    // Die Suche mit aufmachen: steht dort noch ein Filter,
                    // klappte der Schein unten zwar auf, wäre aber nicht zu
                    // sehen — ein Knopf, der scheinbar nichts tut.
                    setSuche('');
                    setZeigeVerworfene(false);
                    setOffen(schein.id);
                  }}
                >
                  Schein ansehen
                </Button>
              </ListRow>
            ))}
          </List>
        </Card>
      )}

      <Card
        title={`Scheine (${scheine.length - verworfene})`}
        action={
          <input
            aria-label="Scheine durchsuchen"
            placeholder="Suchen …"
            value={suche}
            onChange={(e) => setSuche(e.target.value)}
            // `w-full sm:w-auto`: der Kartenkopf ist mobil eine SPALTE, und
            // ein Eingabefeld ohne Breitenangabe nimmt darin seine
            // Wunschbreite (rund 180 px plus Polsterung) — gemessen 18 px
            // mehr, als die Karte innen hat. Es ragte damit unter dem Titel
            // heraus. Volle Breite ist dort ohnehin das Richtige.
            className="min-h-touch w-full rounded border border-line bg-surface px-3 py-1 text-base text-ink sm:w-auto"
          />
        }
      >
        {error && <div className="mb-3"><ErrorState message={error} /></div>}

        {/*
          WAS DIE SUCHE GERADE ABDECKT — und was nicht.

          Ohne diese Zeile hiesse „kein Treffer" mal „gibt es nicht" und mal
          „ist nicht geladen", ohne dass es jemand unterscheiden könnte. Genau
          daran ist der Buchhaltungs-Export einmal gescheitert.
        */}
        {suche.trim() && (
          <div className="mb-3 rounded-sm border border-line bg-surface-2 px-3 py-2">
            {trefferGelten ? (
              <p className="text-sm text-ink">
                <strong>{sichtbar.length}</strong>{' '}
                {sichtbar.length === 1 ? 'Schein' : 'Scheine'} vom Server zu „{trefferZu}".
                {treffer && treffer.length >= PRUEF_GRENZE && (
                  <span className="text-warning">
                    {' '}
                    Die Grenze von {PRUEF_GRENZE} ist erreicht — ältere sind nicht dabei.
                  </span>
                )}{' '}
                <button
                  type="button"
                  className="underline"
                  onClick={() => {
                    setTreffer(null);
                    setTrefferZu('');
                  }}
                >
                  Zurück zur Liste
                </button>
              </p>
            ) : (
              <>
                <p className="text-sm text-ink-muted">
                  {sichtbar.length} von {scheine.length} geladenen Scheinen passen. Ältere sind
                  nicht geladen.
                </p>
                <p className="mt-1 text-sm text-ink-muted">{suchHinweis(absicht)}</p>
                {absicht.art !== 'text' && (
                  <div className="mt-2">
                    <Button
                      variant="secondary"
                      disabled={sucheLaeuft}
                      onClick={() => void serverseitigSuchen()}
                    >
                      {sucheLaeuft ? 'Wird gesucht …' : 'Auf dem Server suchen'}
                    </Button>
                  </div>
                )}
              </>
            )}
          </div>
        )}
        {verworfene > 0 && (
          <label className="mb-3 flex min-h-touch items-center gap-2 text-sm text-ink-muted">
            <input
              type="checkbox"
              checked={zeigeVerworfene}
              onChange={(e) => setZeigeVerworfene(e.target.checked)}
              className="checkbox"
            />
            {verworfene} verworfene{verworfene === 1 ? 'r Entwurf' : ' Entwürfe'} anzeigen
          </label>
        )}
        {loading ? (
          <SkeletonList rows={4} />
        ) : sichtbar.length === 0 ? (
          <EmptyState>
            {scheine.length === 0
              ? 'Noch kein Handwerksschein erstellt.'
              : suche.trim()
                ? `Kein Schein passt zu „${suche}".`
                : 'Kein offener Schein — nur verworfene Entwürfe.'}
          </EmptyState>
        ) : (
          <List>
            {sichtbar.map((s) => {
              const gesamt = s.zeiten.reduce((n, z) => n + z.minuten, 0);
              const auf = offen === s.id;
              return (
                <ListRow
                  key={s.id}
                  title={
                    <span>
                      {s.customerName}{' '}
                      <span className="tnum text-sm font-normal text-ink-muted">
                        ({s.projectNumber})
                      </span>
                    </span>
                  }
                  subtitle={
                    <>
                      {s.datum} · {fmtMin(gesamt)} · {s.abrechnung}
                      {s.unterschriften?.kunde && (
                        <span className="mt-1 block text-xs text-ink-muted">
                          Unterschrieben von {s.unterschriften.kunde.name}
                        </span>
                      )}
                      {s.status === 'Verworfen' && (
                        <span className="mt-1 block text-xs text-ink-muted">
                          Verworfen
                          {s.verworfenVonName ? ` von ${s.verworfenVonName}` : ''} — nicht
                          weiterbearbeitet, nicht gelöscht.
                        </span>
                      )}
                      {s.stornoGrund && (
                        <span className="mt-1 block text-xs text-danger">
                          Storno: {s.stornoGrund}
                          {s.storniertVonName ? ` (${s.storniertVonName})` : ''}
                        </span>
                      )}
                      {auf && (
                        <span className="mt-2 block rounded border border-line p-3">
                          {s.zeiten.length > 0 && (
                            <>
                              <span className="section-label block">Zeiten</span>
                              <span className="mt-1 block space-y-1">
                                {s.zeiten.map((z, i) => (
                                  <span key={i} className="block text-sm text-ink">
                                    {z.mitarbeiter}
                                    {z.helfer ? ' (Helfer)' : ''} ·{' '}
                                    {z.von && z.bis ? `${z.von}–${z.bis}` : '—'} ·{' '}
                                    {fmtMin(z.minuten)}
                                    {z.taetigkeit ? ` · ${z.taetigkeit}` : ''}
                                  </span>
                                ))}
                              </span>
                            </>
                          )}
                          {s.material.length > 0 && (
                            <>
                              <span className="section-label mt-3 block">Material</span>
                              <span className="mt-1 block space-y-1">
                                {s.material.map((m, i) => (
                                  <span key={i} className="block text-sm text-ink">
                                    {m.menge}× {m.name}
                                  </span>
                                ))}
                              </span>
                            </>
                          )}
                          {s.notizen && (
                            <>
                              <span className="section-label mt-3 block">Anmerkungen</span>
                              <span className="mt-1 block text-sm text-ink">{s.notizen}</span>
                            </>
                          )}
                          {/*
                            DIE FOTOS. Sie liegen in Firebase Storage und
                            werden erst beim Aufklappen geholt — eine Liste,
                            die beim Öffnen zwanzig Bilder nachlädt, ist auf
                            einer Baustelle keine Liste mehr.
                          */}
                          {s.fotos && s.fotos.length > 0 && (
                            <>
                              <span className="section-label mt-3 block">
                                Fotos ({s.fotos.length})
                              </span>
                              <Fotostreifen fotos={s.fotos} />
                            </>
                          )}
                          {/*
                            Die Prüfsumme sichtbar machen. Sie ist der
                            eigentliche Manipulationsschutz: mit ihr lässt
                            sich belegen, dass ein vorgelegtes PDF genau das
                            ist, was unterschrieben wurde.
                          */}
                          {/*
                            Die Pruefsumme entsteht serverseitig, kurz NACH
                            dem Unterschreiben — und offline erst beim
                            Uebertragen. Statt die Zeile dann einfach
                            wegzulassen, sagt sie, dass noch etwas aussteht:
                            eine fehlende Pruefsumme sieht sonst aus wie ein
                            Fehler, ist aber nur eine Frage von Sekunden.
                          */}
                          <span className="section-label mt-3 block">Prüfsumme</span>
                          {s.inhaltHash ? (
                            <span className="mt-1 block break-all font-mono text-xs text-ink-muted">
                              {s.inhaltHash}
                            </span>
                          ) : s.status === 'Entwurf' ? (
                            <span className="mt-1 block text-xs text-ink-muted">
                              Entsteht mit der Unterschrift.
                            </span>
                          ) : (
                            <span className="mt-1 flex flex-wrap items-center gap-2 text-xs text-ink-muted">
                              Wird berechnet — bei fehlender Verbindung erst nach der Übertragung.
                              <Button variant="ghost" onClick={() => void laden()}>
                                Neu laden
                              </Button>
                            </span>
                          )}
                        </span>
                      )}
                    </>
                  }
                >
                  <Zustand stand={STAND[s.status]}>{s.status}</Zustand>
                  <Button variant="ghost" onClick={() => setOffen(auf ? null : s.id)}>
                    {auf ? 'Zuklappen' : 'Details'}
                  </Button>
                  <Button variant="ghost" loading={busy} onClick={() => pdfAusgeben(s)}>
                    PDF
                  </Button>
                  {/*
                    „Als Entwurf speichern" war bis hierher eine Sackgasse: der
                    Schein landete in dieser Liste, und dort gab es nur
                    Aufklappen, PDF und Storno. Wer ihn anlegte, um ihn später
                    unterschreiben zu lassen, kam nie wieder hinein und musste
                    alles neu tippen — oder legte einen ZWEITEN Beleg über
                    dieselbe Arbeit an.
                  */}
                  {darfSchreiben && s.status === 'Entwurf' && (
                    <Link to={`/worksheet?entwurf=${s.id}`}>
                      <Button variant="secondary">Weiterbearbeiten</Button>
                    </Link>
                  )}
                  {/*
                    Verwerfen darf, wer auch weiterbearbeiten darf. Eine
                    engere Grenze waere hier eine Erfindung der Oberflaeche:
                    die Rules lassen jeden im Betrieb an den Entwurf, und ein
                    Knopf, den die Datenbank nicht deckt, taeuscht Ordnung nur
                    vor.
                  */}
                  {darfSchreiben && s.status === 'Entwurf' && (
                    <Button variant="ghost" onClick={() => setVerwerfenFuer(s)}>
                      Verwerfen
                    </Button>
                  )}
                  {darfSchreiben && s.status === 'Verworfen' && (
                    <Button
                      variant="secondary"
                      loading={busy}
                      onClick={async () => {
                        setBusy(true);
                        try {
                          await restoreWorkSheetDraft(s.id);
                          toast.success('Entwurf wieder aufgenommen');
                          await laden();
                        } catch (err) {
                          setError(grundAus(err, 'Der Entwurf ließ sich nicht zurückholen.'));
                        } finally {
                          setBusy(false);
                        }
                      }}
                    >
                      Wieder aufnehmen
                    </Button>
                  )}
                  {darfStornieren && s.status === 'Unterschrieben' && (
                    <Button variant="ghost" onClick={() => setStornoFuer(s)}>
                      Stornieren
                    </Button>
                  )}
                </ListRow>
              );
            })}
          </List>
        )}
        {!loading && (
          <Nachladen
            geladen={scheine.length}
            grenze={grenze}
            einheit="Scheine"
            laeuft={loading}
            onMehr={() => setGrenze((n) => n + SCHEINE_JE_SEITE)}
          />
        )}
      </Card>

      {/*
        Die Rueckfrage nennt Kunde, Tag und Umfang.

        „Wollen Sie wirklich?" allein hilft nicht: in einer Liste
        gleichaussehender Zeilen ist der Fehlgriff die falsche ZEILE, nicht
        der falsche Knopf. Was gleich verschwindet, muss dastehen.

        NICHT ROT, anders als beim Loeschen: der Entwurf bleibt unter dem
        Schalter sichtbar und laesst sich zurueckholen. Wer sich an Rot fuer
        Umkehrbares gewoehnt, uebersieht es beim Storno.
      */}
      <ConfirmDialog
        open={!!verwerfenFuer}
        title="Entwurf verwerfen"
        message={
          verwerfenFuer
            ? `${verwerfenFuer.customerName}, ${verwerfenFuer.datum} · ` +
              `${fmtMin(verwerfenFuer.zeiten.reduce((n, z) => n + z.minuten, 0))} · ` +
              `${verwerfenFuer.material.length} Materialposten. Der Entwurf verschwindet aus ` +
              'der Arbeitsliste, bleibt aber erhalten und lässt sich wieder aufnehmen.'
            : undefined
        }
        confirmLabel="Verwerfen"
        confirmTone="primary"
        onCancel={() => setVerwerfenFuer(null)}
        onConfirm={async () => {
          if (!verwerfenFuer) return;
          await discardWorkSheetDraft(verwerfenFuer.id, user.name);
          toast.success('Entwurf verworfen');
          setVerwerfenFuer(null);
          await laden();
        }}
      />

      {/*
        Storno mit Pflichtgrund. Ein unterschriebener Beleg verschwindet nicht
        und wird nicht überschrieben — er bleibt sichtbar und trägt den Grund.
        Ein spurlos gelöschter Schein wäre schlimmer als ein falscher.
      */}
      {stornoFuer && (
        <Card title={`Schein stornieren — ${stornoFuer.customerName}, ${stornoFuer.datum}`}>
          <p className="text-sm text-ink-muted">
            Der Schein bleibt erhalten und sichtbar, wird aber als storniert gekennzeichnet. Für
            eine Korrektur ist danach ein neuer Schein zu erstellen.
          </p>
          <div className="mt-3">
            <InputField
              id="stornogrund"
              label="Grund (Pflicht)"
              value={stornoGrund}
              onChange={(e) => setStornoGrund(e.target.value)}
              required
              pflicht
            />
          </div>
          <div className="mt-4 flex flex-col gap-2 sm:flex-row">
            <Button
              loading={busy}
              disabled={stornoGrund.trim().length < 3}
              onClick={async () => {
                setBusy(true);
                try {
                  await cancelWorkSheet(stornoFuer.id, stornoGrund.trim(), user.name);
                  toast.success('Schein storniert');
                  setStornoFuer(null);
                  setStornoGrund('');
                  await laden();
                } catch (err) {
                  setError(grundAus(err, 'Der Storno ist fehlgeschlagen.'));
                } finally {
                  setBusy(false);
                }
              }}
            >
              Storno bestätigen
            </Button>
            <Button
              variant="ghost"
              onClick={() => {
                setStornoFuer(null);
                setStornoGrund('');
              }}
            >
              Abbrechen
            </Button>
          </div>
        </Card>
      )}
    </div>
  );
}
