import RuestlisteAbhaken from '@/features/assignments/RuestlisteAbhaken';
import { EinsatzKnoepfe, EinsatzKontakt, type EinsatzWege } from '@/features/assignments/Einsatzaktionen';
import { Marke } from '@/components/Badge';
import StartKarte from './StartKarte';
import type { EinsatzZeile, LetzteBuchung } from './laden';

/** Wie viele Zeilen der Rüstliste die Startseite zeigt — der Rest klappt auf. */
const RUESTLISTE_ZEILEN = 3;

/**
 * HEUTE, AUS SICHT DES MONTEURS (Skizze 01): der erste Einsatz ausführlich —
 * Adresse, Telefon, Aufgabe, „Wie zuletzt buchen“, Rüstliste —, weitere
 * Einsätze darunter unter „Danach“.
 *
 * „WIE ZULETZT BUCHEN“ BUCHT NICHT. Er öffnet die Zeiterfassung mit der
 * Baustelle von heute und den Zeiten der letzten Buchung; gespeichert wird
 * dort. Anfahrt, Fahrzeug und Zuschläge kennt nur der Monteur — ein
 * automatisch angelegter Eintrag sähe vollständig aus und wäre es nicht.
 */
export default function HeuteEigene({
  einsaetze,
  letzteBuchung,
  materialAn,
  scheinVerweis,
  planVerweis,
  titel = 'Heute',
  zeitImKopf = false,
  zeitAn = true,
  wege,
}: {
  einsaetze: EinsatzZeile[];
  letzteBuchung: LetzteBuchung | null | undefined;
  materialAn: boolean;
  /** Darf „Schein schreiben“ angeboten werden (Modul an, Rolle darf)? */
  scheinVerweis: boolean;
  planVerweis: boolean;
  titel?: string;
  /** Der direkte Zeit-Einstieg steht dann bereits im gemeinsamen Seitenkopf. */
  zeitImKopf?: boolean;
  zeitAn?: boolean;
  /** Material und Nachricht am Einsatz (E83) — was die Rolle darf. */
  wege?: EinsatzWege;
}) {
  if (einsaetze.length === 0) return null;
  const [erster, ...danach] = einsaetze;
  return (
    <StartKarte
      titel={titel}
      zusatz={einsaetze.length === 1 ? '1 Einsatz' : `${einsaetze.length} Einsätze`}
      verweis={planVerweis ? { to: '/my-schedule', text: 'Mein Einsatzplan' } : undefined}
    >
      <Einsatz e={erster} letzteBuchung={letzteBuchung} materialAn={materialAn} scheinVerweis={scheinVerweis} zeitAn={zeitAn} zeitImKopf={zeitImKopf} wege={wege} gross />
      {danach.length > 0 && (
        <section aria-label="Danach" className="border-t border-line">
          <h3 className="start-abschnitt">
            Danach{danach[0].zeit ? <span className="font-normal"> · ab {danach[0].zeit.split('–')[0]}</span> : null}
          </h3>
          <div className="divide-y divide-line">
            {danach.map((e) => (
              <Einsatz key={e.id} e={e} letzteBuchung={letzteBuchung} materialAn={materialAn} scheinVerweis={scheinVerweis} zeitAn={zeitAn} wege={wege} />
            ))}
          </div>
        </section>
      )}
    </StartKarte>
  );
}

function Einsatz({
  e,
  letzteBuchung,
  materialAn,
  scheinVerweis,
  gross = false,
  zeitImKopf = false,
  zeitAn = true,
  wege,
}: {
  e: EinsatzZeile;
  letzteBuchung: LetzteBuchung | null | undefined;
  materialAn: boolean;
  scheinVerweis: boolean;
  gross?: boolean;
  zeitImKopf?: boolean;
  zeitAn?: boolean;
  wege?: EinsatzWege;
}) {
  /*
    DIE KNÖPFE WIE IM EINSATZPLAN (E72, 09.11.2026): Zweitknöpfe, Adresse und
    Telefon als Kontakt mit Symbol (`Einsatzaktionen`). Am ersten Einsatz
    „Wie zuletzt buchen“ — beim Monteur ohne „Andere Zeit“, weil „Zeit
    erfassen“ schon im Seitenkopf steht; ohne letzte Buchung dort gar kein
    Zeitknopf. Die weiteren Einsätze tragen „Zeit erfassen“ für ihre eigene
    Baustelle.
  */
  const zeit = zeitAn && (gross ? !!letzteBuchung || !zeitImKopf : true);
  return (
    <div className={`start-einsatz ${gross ? 'start-einsatz-erster' : ''}`}>
      {/* `start-einsatz-name`: lange Namen trennen mit Strich — auch unter „Danach“ (R10). */}
      <p className={`start-einsatz-name kein-trennen flex flex-wrap items-center gap-2 font-semibold text-ink-deep ${gross ? 'start-einsatz-titel' : ''}`}>
        {e.customerName}
        {e.asHelper && <Marke>Helfer</Marke>}
      </p>
      <p className="kein-trennen text-meta text-ink-muted">
        <span className="nr">{e.projectNumber}</span>
        {e.zeit ? ` · ${e.zeit}` : ''}
      </p>
      <EinsatzKontakt adresse={e.address} nummer={e.contactPhone} name={e.contactName} projectNumber={e.projectNumber} projectId={e.projectId} wege={wege} className="start-einsatz-kontakt" />
      {/* Die Notiz des Büros: was heute zu tun ist. */}
      {e.comment && (
        <p className="start-einsatz-aufgabe">
          <b>Aufgabe:</b> {e.comment}
        </p>
      )}
      <EinsatzKnoepfe
        projectNumber={e.projectNumber}
        asHelper={e.asHelper}
        zeit={zeit}
        zuletzt={gross ? letzteBuchung : null}
        andereZeit={!zeitImKopf}
        schein={scheinVerweis}
        className="start-einsatz-aktionen"
      />
      {materialAn && e.material && e.material.length > 0 && (
        <RuestlisteAbhaken
          date={e.date}
          projectNumber={e.projectNumber}
          positionen={e.material}
          geladen={e.geladen ?? {}}
          max={RUESTLISTE_ZEILEN}
        />
      )}
    </div>
  );
}
