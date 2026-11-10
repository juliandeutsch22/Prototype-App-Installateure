import KnopfLink from '@/components/KnopfLink';
import { AdresseLink, TelefonLink } from '@/components/Kontakt';
import { calcWorkMin, fmtMin } from '@/lib/time';

/**
 * WAS MAN AN EINEM EINSATZ TUT — überall in derselben Gestalt (E72, 09.11.2026).
 *
 * Dieselben Handlungen sahen je Seite anders aus: auf der Startseite war die
 * Adresse ein unterstrichener Text ohne Symbol, „Wie zuletzt buchen“ beim
 * Monteur reiner Petrol-Text und ab dem zweiten Einsatz „Zeit erfassen ›“ ein
 * Verweis; im Einsatzplan trug jeder Einsatz einen gefüllten „Zeit erfassen“,
 * Adresse und Telefon standen dort als gerahmte Knöpfe; in „Meine Baustellen“
 * war die Adresse ein gefüllter Balken „Route: …“. Jetzt:
 *
 *   - Zeit, Schein und „Wie zuletzt buchen“ sind Zweitknöpfe. Gefüllt ist die
 *     eine Hauptaktion der Seite — beim Monteur steht „Zeit erfassen“ dafür
 *     schon im Seitenkopf; im Einsatzplan ist jeder Einsatz eine Zeile einer
 *     Liste, und in Listenzeilen steht nie ein gefüllter Knopf (R2).
 *   - Adresse und Telefon sind `.link-kontakt` mit Symbol, wie in Akten,
 *     Listen und Terminen: als antippbar erkennbar, aber leiser als die Knöpfe.
 *
 * Funktion bleibt dieselbe: Baustelle und Helfer-Rolle wandern ins
 * Zeitformular, der Schein bekommt die Baustelle (und im Einsatzplan das
 * Datum) mit, „Wie zuletzt buchen“ bringt die Zeiten der letzten Buchung mit
 * und bucht nicht selbst.
 */

export interface ZuletztGebucht {
  startTime: string;
  endTime: string;
  breakDuration: number;
}

export function EinsatzKnoepfe({
  projectNumber,
  asHelper,
  datum,
  zeit,
  andereZeit = false,
  zuletzt,
  schein,
  className = '',
}: {
  projectNumber: string;
  asHelper?: boolean;
  /** Tag des Einsatzes — der Schein übernimmt ihn (Einsatzplan). */
  datum?: string;
  /** „Zeit erfassen“ anbieten. Mit `zuletzt` heißt der Knopf „Wie zuletzt buchen“. */
  zeit: boolean;
  /** Neben „Wie zuletzt buchen“ der Weg zu anderen Zeiten — wo „Zeit erfassen“ nicht schon im Seitenkopf steht. */
  andereZeit?: boolean;
  zuletzt?: ZuletztGebucht | null;
  /** Darf „Schein schreiben“ angeboten werden (Modul an, Rolle darf)? */
  schein: boolean;
  className?: string;
}) {
  const helfer = !!asHelper;
  const minuten = zuletzt ? calcWorkMin({ ...zuletzt, status: 'Anwesend' }) : 0;
  if (!zeit && !schein) return null;
  return (
    // Am Handy untereinander in voller Breite (wie der Formularfuß, R7) — nebeneinander brachen sie je nach Wortlänge ungleich um.
    <div className={`einsatz-knoepfe flex flex-col gap-2 md:flex-row md:flex-wrap ${className}`}>
      {zeit && zuletzt ? (
        <KnopfLink
          variant="secondary"
          to="/time"
          state={{
            projectNumber,
            asHelper: helfer,
            startTime: zuletzt.startTime,
            endTime: zuletzt.endTime,
            breakDuration: zuletzt.breakDuration,
          }}
          className="einsatz-wie-zuletzt"
        >
          <span className="flex flex-col items-center">
            <span>Wie zuletzt buchen</span>
            <span className="text-xs tabular-nums text-ink-muted">
              {zuletzt.startTime}–{zuletzt.endTime} · {zuletzt.breakDuration} min Pause · {fmtMin(minuten)} Std
            </span>
          </span>
        </KnopfLink>
      ) : zeit ? (
        <KnopfLink variant="secondary" to="/time" state={{ projectNumber, asHelper: helfer }}>
          Zeit erfassen
        </KnopfLink>
      ) : null}
      {zeit && zuletzt && andereZeit && (
        <KnopfLink variant="secondary" to="/time" state={{ projectNumber, asHelper: helfer }}>
          Andere Zeit
        </KnopfLink>
      )}
      {schein && (
        <KnopfLink
          variant="secondary"
          to={`/worksheet?projekt=${encodeURIComponent(projectNumber)}${datum ? `&datum=${datum}` : ''}`}
        >
          Schein schreiben
        </KnopfLink>
      )}
    </div>
  );
}

/** Adresse und Telefon des Einsatzes: Navigation und Anruf mit einem Tipp. Fehlt eines, rutscht das andere nach. */
export function EinsatzKontakt({
  adresse,
  nummer,
  name,
  className = '',
}: {
  adresse?: string | null;
  nummer?: string | null;
  name?: string | null;
  className?: string;
}) {
  if (!adresse?.trim() && !nummer?.trim()) return null;
  return (
    <div className={`einsatz-kontakt flex flex-wrap gap-x-6 ${className}`}>
      <AdresseLink adresse={adresse} />
      <TelefonLink nummer={nummer} name={name} />
    </div>
  );
}
