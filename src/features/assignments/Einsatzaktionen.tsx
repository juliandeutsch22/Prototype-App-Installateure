import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import KnopfLink from '@/components/KnopfLink';
import Icon from '@/components/Icon';
import { AdresseLink, TelefonLink } from '@/components/Kontakt';
import { useToastWennDa } from '@/components/Toast';
import { kanalBaustelle } from '@/lib/db/nachrichten';
import { grundAus } from '@/lib/fehlerGrund';
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
  zeitNurBreit = false,
  scheinNurBreit = false,
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
  /** Der Zeitknopf nur ab dem Tablet — am Handy ist der Timer der Weg zur Zeit (D7, E90). */
  zeitNurBreit?: boolean;
  /** „Schein schreiben“ nur ab dem Tablet — am Handy steht er in der Leiste darunter (`EinsatzWegeleiste`). */
  scheinNurBreit?: boolean;
}) {
  const helfer = !!asHelper;
  const nb = (an: boolean) => (an ? 'max-md:hidden' : '');
  const minuten = zuletzt ? calcWorkMin({ ...zuletzt, status: 'Anwesend' }) : 0;
  if (!zeit && !schein) return null;
  // Steht am Handy keiner der Knöpfe da, auch der Abstand ihrer Reihe nicht.
  const amHandyLeer = (!zeit || zeitNurBreit) && (!schein || scheinNurBreit);
  return (
    // Am Handy untereinander in voller Breite (wie der Formularfuß, R7) — nebeneinander brachen sie je nach Wortlänge ungleich um.
    <div className={`einsatz-knoepfe flex flex-col gap-2 md:flex-row md:flex-wrap ${className} ${nb(amHandyLeer)}`}>
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
          className={`einsatz-wie-zuletzt ${nb(zeitNurBreit)}`}
        >
          <span className="flex flex-col items-center">
            <span>Wie zuletzt buchen</span>
            <span className="text-xs tabular-nums text-ink-muted">
              {zuletzt.startTime}–{zuletzt.endTime} · {zuletzt.breakDuration} min Pause · {fmtMin(minuten)} Std
            </span>
          </span>
        </KnopfLink>
      ) : zeit ? (
        <KnopfLink variant="secondary" to="/time" state={{ projectNumber, asHelper: helfer }} className={nb(zeitNurBreit)}>
          Zeit erfassen
        </KnopfLink>
      ) : null}
      {zeit && zuletzt && andereZeit && (
        <KnopfLink variant="secondary" to="/time" state={{ projectNumber, asHelper: helfer }} className={nb(zeitNurBreit)}>
          Andere Zeit
        </KnopfLink>
      )}
      {schein && (
        <KnopfLink
          variant="secondary"
          to={`/worksheet?projekt=${encodeURIComponent(projectNumber)}${datum ? `&datum=${datum}` : ''}`}
          className={nb(scheinNurBreit)}
        >
          Schein schreiben
        </KnopfLink>
      )}
    </div>
  );
}

/**
 * Adresse und Telefon des Einsatzes: Navigation und Anruf mit einem Tipp.
 * Fehlt eines, rutscht das andere nach.
 *
 * DAZU MATERIAL UND NACHRICHT (B2, E83, 12.11.2026). Vor Ort braucht der
 * Monteur vier Dinge: hinfahren, anrufen, Material nachfordern, Bescheid
 * geben. Die letzten zwei fehlten am Einsatz — der Thread einer Baustelle
 * erschien im Posteingang erst nach der ersten Nachricht, ein Einstieg vom
 * Einsatz aus fehlte ganz. Sie stehen in derselben leisen Gestalt wie
 * Adresse und Telefon: vier Knöpfe untereinander wären am Handy eine Wand.
 * Sichtbar stehen nur „Anfordern“ (mit dem Paket der Navigation für
 * Material) und „Nachricht“, damit beide am Handy in EINE Zeile passen —
 * mit zwei Einsätzen wuchs die Startseite sonst um vier Zeilen. Der Name
 * für Vorlesen und Suche bleibt vollständig. „Material“ allein ginge nicht:
 * im Einsatzplan heißt so die Rüstliste darunter.
 * Angeboten wird nur, was die Rolle mit ihren Modulen darf — das entscheidet
 * die Seite (`wege`), wie bei Zeit und Schein.
 */
export function EinsatzKontakt({
  adresse,
  nummer,
  name,
  projectNumber,
  projectId,
  wege,
  className = '',
  wegeNurBreit = false,
}: {
  adresse?: string | null;
  nummer?: string | null;
  name?: string | null;
  /** Mit der Nummer: „Material anfordern“ für diese Baustelle. */
  projectNumber?: string;
  /** Mit der Kennung: „Nachricht“ in den Thread der Baustelle. */
  projectId?: string;
  /** Was die Rolle mit ihren Modulen darf; ohne Angabe nur Adresse und Telefon. */
  wege?: EinsatzWege;
  className?: string;
  /** Anfordern und Nachricht nur ab dem Tablet — am Handy stehen sie in der Leiste darunter (`EinsatzWegeleiste`). */
  wegeNurBreit?: boolean;
}) {
  const material = !!wege?.material && !!projectNumber;
  const nachricht = !!wege?.nachricht && !!projectId;
  if (!adresse?.trim() && !nummer?.trim() && !material && !nachricht) return null;
  const nb = wegeNurBreit ? 'max-md:hidden' : '';
  return (
    <div className={`einsatz-kontakt flex flex-wrap gap-x-6 ${className} ${!adresse?.trim() && !nummer?.trim() ? nb : ''}`}>
      <AdresseLink adresse={adresse} />
      <TelefonLink nummer={nummer} name={name} />
      {material && (
        <Link
          to={`/material?projekt=${encodeURIComponent(projectNumber!)}`}
          className={`link-kontakt inline-flex min-h-touch items-center gap-1.5 ${nb}`}
          aria-label="Material anfordern"
        >
          <Icon name="package" size={16} aria-hidden />
          Anfordern
        </Link>
      )}
      {nachricht && <NachrichtZurBaustelle projectId={projectId!} className={nb} />}
    </div>
  );
}

/**
 * DIE DREI WEGE AM EINSATZ ALS LEISTE (D7, E90) — nur am Handy. Anfordern,
 * Nachricht und Schein in einer Zeile unter dem Blatt, statt zweier Links
 * zwischen Adresse und Aufgabe und eines großen Knopfs darunter. Ab dem
 * Tablet bleibt es, wie es war (`EinsatzKontakt`, `EinsatzKnoepfe`).
 */
export function EinsatzWegeleiste({
  projectNumber,
  projectId,
  wege,
  schein,
  datum,
}: {
  projectNumber: string;
  projectId?: string;
  wege?: EinsatzWege;
  schein: boolean;
  datum?: string;
}) {
  const material = !!wege?.material && !!projectNumber;
  const nachricht = !!wege?.nachricht && !!projectId;
  if (!material && !nachricht && !schein) return null;
  return (
    <div className="einsatz-wegeleiste md:hidden">
      {material && (
        <Link to={`/material?projekt=${encodeURIComponent(projectNumber)}`} className="einsatz-weg" aria-label="Material anfordern">
          <Icon name="package" size={16} aria-hidden />
          Anfordern
        </Link>
      )}
      {nachricht && <NachrichtZurBaustelle projectId={projectId!} className="einsatz-weg" leiste />}
      {schein && (
        <Link
          to={`/worksheet?projekt=${encodeURIComponent(projectNumber)}${datum ? `&datum=${datum}` : ''}`}
          className="einsatz-weg"
          aria-label="Schein schreiben"
        >
          {/* Dasselbe Zeichen wie „Handwerksscheine“ in der Navigation. */}
          <Icon name="pencil" size={16} aria-hidden />
          Schein
        </Link>
      )}
    </div>
  );
}

/** Die zwei Wege am Einsatz, die nicht jede Rolle hat. */
export interface EinsatzWege {
  material: boolean;
  nachricht: boolean;
}

/**
 * Öffnet den Thread der Baustelle; angelegt wird er erst dabei, wie in der
 * Baustellenakte — eine Baustelle ohne Nachrichten hat keinen leeren Thread.
 */
function NachrichtZurBaustelle({ projectId, className = '', leiste = false }: { projectId: string; className?: string; leiste?: boolean }) {
  const navigate = useNavigate();
  // Die Startseite hat die Meldungen; eine Seite allein (Prüfungen) geht ohne.
  const toast = useToastWennDa();
  const [oeffnet, setOeffnet] = useState(false);
  async function oeffnen() {
    setOeffnet(true);
    try {
      navigate(`/nachrichten/${await kanalBaustelle(projectId)}`);
    } catch (e) {
      toast?.error(grundAus(e, 'Der Thread konnte nicht geöffnet werden.'));
      setOeffnet(false);
    }
  }
  return (
    <button
      type="button"
      className={leiste ? className : `link-kontakt inline-flex min-h-touch items-center gap-1.5 ${className}`}
      disabled={oeffnet}
      aria-busy={oeffnet || undefined}
      onClick={() => void oeffnen()}
      aria-label="Nachricht zur Baustelle"
    >
      <Icon name="nachricht" size={16} aria-hidden />
      Nachricht
    </button>
  );
}
