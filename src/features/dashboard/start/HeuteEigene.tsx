import { Link } from 'react-router-dom';
import RuestlisteAbhaken from '@/features/assignments/RuestlisteAbhaken';
import { KontaktZeile } from '@/components/Kontakt';
import { Marke } from '@/components/Badge';
import { calcWorkMin, fmtMin } from '@/lib/time';
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
}: {
  einsaetze: EinsatzZeile[];
  letzteBuchung: LetzteBuchung | null | undefined;
  materialAn: boolean;
  /** Darf „Schein schreiben“ angeboten werden (Modul an, Rolle darf)? */
  scheinVerweis: boolean;
  planVerweis: boolean;
  titel?: string;
}) {
  if (einsaetze.length === 0) return null;
  const [erster, ...danach] = einsaetze;
  return (
    <StartKarte
      titel={titel}
      zusatz={einsaetze.length === 1 ? '1 Einsatz' : `${einsaetze.length} Einsätze`}
      verweis={planVerweis ? { to: '/my-schedule', text: 'Mein Einsatzplan' } : undefined}
    >
      <Einsatz e={erster} letzteBuchung={letzteBuchung} materialAn={materialAn} scheinVerweis={scheinVerweis} gross />
      {danach.length > 0 && (
        <section aria-label="Danach" className="border-t border-line">
          <h3 className="start-abschnitt">
            Danach{danach[0].zeit ? <span className="font-normal"> · ab {danach[0].zeit.split('–')[0]}</span> : null}
          </h3>
          <div className="divide-y divide-line">
            {danach.map((e) => (
              <Einsatz key={e.id} e={e} letzteBuchung={letzteBuchung} materialAn={materialAn} scheinVerweis={scheinVerweis} />
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
}: {
  e: EinsatzZeile;
  letzteBuchung: LetzteBuchung | null | undefined;
  materialAn: boolean;
  scheinVerweis: boolean;
  gross?: boolean;
}) {
  const zuletzt = letzteBuchung ? calcWorkMin({ ...letzteBuchung, status: 'Anwesend' }) : 0;
  return (
    <div className="px-4 py-4">
      <p className={`kein-trennen flex flex-wrap items-center gap-2 font-semibold text-ink-deep ${gross ? 'text-base' : ''}`}>
        {e.customerName}
        {e.asHelper && <Marke>Helfer</Marke>}
      </p>
      <p className="kein-trennen text-meta text-ink-muted">
        {e.projectNumber}
        {e.zeit ? ` · ${e.zeit}` : ''}
      </p>
      <KontaktZeile adresse={e.address} nummer={e.contactPhone} name={e.contactName} className="mt-3" />
      {/* Die Notiz des Büros: was heute zu tun ist. */}
      {e.comment && (
        <p className="mt-2 text-sm text-ink">
          <b>Aufgabe:</b> {e.comment}
        </p>
      )}
      {gross && (
        <div className="mt-3 grid grid-cols-2 gap-2 sm:flex sm:flex-wrap [&>:only-child]:col-span-2">
          {letzteBuchung ? (
            <Link
              to="/time"
              state={{
                projectNumber: e.projectNumber,
                asHelper: e.asHelper,
                startTime: letzteBuchung.startTime,
                endTime: letzteBuchung.endTime,
                breakDuration: letzteBuchung.breakDuration,
              }}
              className="col-span-2 flex min-h-touch flex-col items-center justify-center rounded bg-brand px-3 py-2 text-center text-brand-fg shadow-sm sm:px-5"
            >
              <span className="text-fliess font-semibold">Wie zuletzt buchen</span>
              <span className="text-xs">
                {letzteBuchung.startTime}–{letzteBuchung.endTime} · {letzteBuchung.breakDuration} min Pause · {fmtMin(zuletzt)} Std
              </span>
            </Link>
          ) : (
            <Link
              to="/time"
              state={{ projectNumber: e.projectNumber, asHelper: e.asHelper }}
              className="flex min-h-touch items-center justify-center rounded bg-brand px-2 py-2 text-center text-fliess font-semibold text-brand-fg shadow-sm sm:px-5"
            >
              Zeit erfassen
            </Link>
          )}
          {letzteBuchung && (
            <Link
              to="/time"
              state={{ projectNumber: e.projectNumber, asHelper: e.asHelper }}
              className="flex min-h-touch items-center justify-center rounded border border-line bg-surface px-2 py-2 text-center text-fliess font-medium text-ink-deep shadow-sm sm:px-5"
            >
              Andere Zeit
            </Link>
          )}
          {scheinVerweis && (
            <Link
              to={`/worksheet?projekt=${encodeURIComponent(e.projectNumber)}`}
              className="flex min-h-touch items-center justify-center rounded border border-line bg-surface px-2 py-2 text-center text-fliess font-medium text-ink-deep shadow-sm sm:px-5"
            >
              Schein schreiben
            </Link>
          )}
        </div>
      )}
      {!gross && (
        <div className="mt-2 flex flex-wrap gap-x-4 text-sm">
          <Link to="/time" state={{ projectNumber: e.projectNumber, asHelper: e.asHelper }} className="link-weiter inline-flex min-h-touch items-center">
            Zeit erfassen
          </Link>
          {scheinVerweis && (
            <Link to={`/worksheet?projekt=${encodeURIComponent(e.projectNumber)}`} className="link-weiter inline-flex min-h-touch items-center">
              Schein schreiben
            </Link>
          )}
        </div>
      )}
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
