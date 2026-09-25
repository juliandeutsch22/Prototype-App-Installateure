import Icon from './Icon';
import { mapsUrl, telUrl, mailUrl } from '@/lib/kontakt';

/**
 * Adresse und Telefonnummer einer Baustelle — als Handgriff, nicht als Text.
 *
 * Der Monteur sitzt im Auto, oft mit Arbeitshandschuhen. Eine Adresse zum
 * Abtippen und eine Nummer zum Übertragen ins Telefon sind an dieser Stelle
 * kein Kontakt, sondern eine Aufgabe. Ein Fingertipp führt direkt in die
 * Navigation beziehungsweise in den Anruf.
 *
 * Die Bausteine standen bisher nur im Einsatzplan und in „Meine Baustellen",
 * dreimal getrennt geschrieben und unterschiedlich formatiert. In der
 * Baustellenverwaltung stand dieselbe Adresse als toter Text.
 */

interface AdresseProps {
  adresse?: string | null;
  /** 'text' = im Fließtext, 'knopf' = eigenständige Schaltfläche. */
  variante?: 'text' | 'knopf';
  className?: string;
}

export function AdresseLink({ adresse, variante = 'text', className = '' }: AdresseProps) {
  if (!adresse?.trim()) return null;
  const gemeinsam = 'inline-flex min-h-touch items-center gap-1.5';
  const stil =
    variante === 'knopf'
      ? 'rounded-sm border border-line px-3 py-2 font-medium text-ink'
      : 'link-kontakt';
  return (
    <a
      href={mapsUrl(adresse)}
      target="_blank"
      rel="noopener noreferrer"
      className={`${gemeinsam} ${stil} ${className}`}
    >
      <Icon name="pin" size={16} aria-hidden />
      {/* Der Adresstext selbst ist der Link — „hier klicken" wäre für
          Screenreader wertlos. Der Zusatz sagt, wohin es führt. */}
      <span>{adresse}</span>
      <span className="sr-only">— in Google Maps öffnen</span>
    </a>
  );
}

interface TelefonProps {
  nummer?: string | null;
  /** Angezeigter Name, falls die Nummer zu einer Person gehört. */
  name?: string | null;
  variante?: 'text' | 'knopf';
  className?: string;
}

export function TelefonLink({ nummer, name, variante = 'text', className = '' }: TelefonProps) {
  if (!nummer?.trim()) return null;
  const gemeinsam = 'inline-flex min-h-touch items-center gap-1.5';
  const stil =
    variante === 'knopf'
      ? 'rounded-sm border border-line px-3 py-2 font-medium text-ink'
      : 'link-kontakt';
  return (
    <a href={telUrl(nummer)} className={`${gemeinsam} ${stil} ${className}`}>
      <Icon name="phone" size={16} aria-hidden />
      <span>{nummer}</span>
      <span className="sr-only">{name ? `— ${name} anrufen` : '— anrufen'}</span>
    </a>
  );
}

interface MailProps {
  adresse?: string | null;
  variante?: 'text' | 'knopf';
  className?: string;
}

/**
 * Die hinterlegte Adresse als Handgriff.
 *
 * Sie stand bisher nirgends — erfasst wurde sie, gezeigt nie. Als toter Text
 * wäre sie eine Abtippaufgabe; hier öffnet ein Tipp das Mailprogramm mit dem
 * Empfänger im Feld. Ist der Eintrag keine brauchbare Adresse, steht er als
 * Text da statt als Link, der ins Leere führt.
 */
export function MailLink({ adresse, variante = 'text', className = '' }: MailProps) {
  if (!adresse?.trim()) return null;
  const ziel = mailUrl(adresse);
  const gemeinsam = 'inline-flex min-h-touch items-center gap-1.5';
  const stil =
    variante === 'knopf'
      ? 'rounded-sm border border-line px-3 py-2 font-medium text-ink'
      : 'link-kontakt';
  if (!ziel) {
    return (
      <span className={`${gemeinsam} text-ink ${className}`}>
        <Icon name="mail" size={16} aria-hidden />
        <span>{adresse}</span>
      </span>
    );
  }
  return (
    <a href={ziel} className={`${gemeinsam} ${stil} ${className}`}>
      <Icon name="mail" size={16} aria-hidden />
      <span>{adresse}</span>
      <span className="sr-only">— Mail schreiben</span>
    </a>
  );
}

/**
 * Beides nebeneinander, wie es am Einsatz gebraucht wird. Fehlt eines,
 * rutscht das andere nach — kein Platzhalter für Daten, die es nicht gibt.
 */
export function KontaktZeile({
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
    <div className={`flex flex-wrap gap-2 ${className}`}>
      <AdresseLink adresse={adresse} variante="knopf" />
      <TelefonLink nummer={nummer} name={name} variante="knopf" />
    </div>
  );
}
