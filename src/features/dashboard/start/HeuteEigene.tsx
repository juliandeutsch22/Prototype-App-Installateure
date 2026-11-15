import RuestlisteAbhaken from '@/features/assignments/RuestlisteAbhaken';
import { EinsatzKnoepfe, EinsatzKontakt, EinsatzWegeleiste, type EinsatzWege } from '@/features/assignments/Einsatzaktionen';
import { Marke } from '@/components/Badge';
import { Fragment } from 'react';
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
  zeitAn = true,
  wege,
  timerAn = false,
}: {
  einsaetze: EinsatzZeile[];
  letzteBuchung: LetzteBuchung | null | undefined;
  materialAn: boolean;
  /** Darf „Schein schreiben“ angeboten werden (Modul an, Rolle darf)? */
  scheinVerweis: boolean;
  planVerweis: boolean;
  titel?: string;
  zeitAn?: boolean;
  /** Material und Nachricht am Einsatz (E83) — was die Rolle darf. */
  wege?: EinsatzWege;
  /** Mit Start/Stopp ist am Handy der Timer der Weg zur Zeit (D7, E90). */
  timerAn?: boolean;
}) {
  if (einsaetze.length === 0) return null;
  const [erster, ...danach] = einsaetze;
  return (
    <StartKarte
      titel={titel}
      zusatz={einsaetze.length === 1 ? '1 Einsatz' : `${einsaetze.length} Einsätze`}
      verweis={planVerweis ? { to: '/my-schedule', text: 'Mein Einsatzplan' } : undefined}
    >
      <Einsatz e={erster} letzteBuchung={letzteBuchung} materialAn={materialAn} scheinVerweis={scheinVerweis} zeitAn={zeitAn} wege={wege} timerAn={timerAn} gross />
      {/* Von Kante zu Kante unter dem ersten Einsatz — deshalb außerhalb seines Einzugs (D7, E90). */}
      <EinsatzWegeleiste projectNumber={erster.projectNumber} projectId={erster.projectId} wege={wege} schein={scheinVerweis} datum={erster.date} />
      {danach.length > 0 && (
        <section aria-label="Danach" className="border-t border-line">
          <h3 className="start-abschnitt">
            Danach{danach[0].zeit ? <span className="font-normal"> · ab {danach[0].zeit.split('–')[0]}</span> : null}
          </h3>
          <div className="divide-y divide-line">
            {/*
              JEDER EINSATZ IN DERSELBEN FORM (U3, Durchsicht 15.11.2026): am
              Handy dieselbe Leiste „Anfordern · Nachricht · Schein“ wie am
              ersten — vorher standen hier Verweise im Text und zwei
              gestapelte Knöpfe für dieselben Wege.
            */}
            {danach.map((e) => (
              <Fragment key={e.id}>
                <Einsatz e={e} letzteBuchung={letzteBuchung} materialAn={materialAn} scheinVerweis={scheinVerweis} zeitAn={zeitAn} wege={wege} timerAn={timerAn} />
                <EinsatzWegeleiste projectNumber={e.projectNumber} projectId={e.projectId} wege={wege} schein={scheinVerweis} datum={e.date} />
              </Fragment>
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
  zeitAn = true,
  wege,
  timerAn = false,
}: {
  e: EinsatzZeile;
  letzteBuchung: LetzteBuchung | null | undefined;
  materialAn: boolean;
  scheinVerweis: boolean;
  gross?: boolean;
  zeitAn?: boolean;
  wege?: EinsatzWege;
  timerAn?: boolean;
}) {
  /*
    DIE KNÖPFE WIE IM EINSATZPLAN (E72, 09.11.2026): Zweitknöpfe, Adresse und
    Telefon als Kontakt mit Symbol (`Einsatzaktionen`).

    DER WEG ZUR ZEIT STEHT AM EINSATZ, EINMAL (U3, Durchsicht 15.11.2026).
    Vorher stand „Zeit erfassen“ zusätzlich schwebend über der Startseite,
    während das Blatt darunter denselben Weg trug. Jetzt trägt jeder Einsatz
    genau einen Zeitknopf: am ersten „Wie zuletzt buchen“ (mit den Zeiten
    der letzten Buchung, änderbar im Formular), sonst „Zeit erfassen“. Mit
    Start/Stopp ist am Handy der Arbeitstag der Weg zur Zeit (D7, E90).
  */
  const zeit = zeitAn;
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
      {/* Am ersten Einsatz stehen Anfordern und Nachricht am Handy in der Leiste unten (D7, E90). */}
      <EinsatzKontakt adresse={e.address} nummer={e.contactPhone} name={e.contactName} projectNumber={e.projectNumber} projectId={e.projectId} wege={wege} wegeNurBreit className="start-einsatz-kontakt" />
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
        andereZeit={false}
        schein={scheinVerweis}
        className="start-einsatz-aktionen"
        zeitNurBreit={timerAn}
        scheinNurBreit
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
