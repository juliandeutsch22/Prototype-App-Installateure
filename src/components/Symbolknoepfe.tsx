import type { ButtonHTMLAttributes } from 'react';
import Icon from './Icon';
import IconButton from './IconButton';

/*
 * DIE SCHLICHTEN SYMBOLE EINER ZEILE (E74, 10.11.2026). Eine Bedeutung, ein
 * Zeichen, überall gleich: Stift = bearbeiten, Papierkorb = löschen oder
 * entfernen, Blatt mit Pfeil = PDF teilen oder speichern. Ohne Rahmen, damit
 * der Blick auf Name, Zeit und Zustand bleibt; der Name kommt als
 * `aria-label` und `title` für die Vorlesehilfe und als Hinweis beim
 * Darüberfahren — er nennt die Sache („Termin am 12.11. löschen“), nicht nur
 * die Handlung.
 *
 * Wo die Handlung die Hauptaktion eines Fensterfußes, eines Abschnitts oder
 * einer Seite ist, bleibt das Wort (Knopfart D). Die Rückfrage vor dem
 * Löschen bleibt, wo sie war.
 */
/** `laeuft`: die Handlung läuft gerade — gesperrt, damit sie nicht zweimal angestoßen wird. */
type Eigen = Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'children'> & { label: string; laeuft?: boolean };

function Symbol({ label, laeuft = false, disabled, zeichen, tone, ...rest }: Eigen & { zeichen: 'pencil' | 'papierkorb' | 'pdf'; tone?: 'danger' }) {
  return (
    <IconButton label={label} tone={tone} disabled={disabled || laeuft} aria-busy={laeuft || undefined} {...rest}>
      <Icon name={zeichen} size={22} />
    </IconButton>
  );
}

export function BearbeitenKnopf(props: Eigen) {
  return <Symbol {...props} zeichen="pencil" />;
}

export function LoeschenKnopf(props: Eigen) {
  return <Symbol {...props} zeichen="papierkorb" tone="danger" />;
}

export function PdfKnopf(props: Eigen) {
  return <Symbol {...props} zeichen="pdf" />;
}

/**
 * ETWAS NEUES IN DIESE LISTE (E76, 10.11.2026): der Petrol-Kreis mit Plus im
 * Kopf einer Karte — „Termin anlegen“, „Top anlegen“, „Neues Material“. Vorher
 * stand dort ein gerahmter Wortknopf, der am Handy unter den Titel rutschte.
 * Der Name kommt als `aria-label` und `title`. Die Hauptaktion einer Seite im
 * Seitenkopf bleibt das Wort (Knopfart D).
 */
export function NeuKnopf({ label, laeuft = false, disabled, ...rest }: Eigen) {
  return (
    <IconButton rund label={label} disabled={disabled || laeuft} aria-busy={laeuft || undefined} {...rest}>
      <Icon name="plus" size={20} />
    </IconButton>
  );
}
