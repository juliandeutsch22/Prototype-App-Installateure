import { initialsOf } from './initials';

/**
 * Initialen-Avatar: EIN Ton, kein Verlauf.
 *
 * Zuerst war es der Verlauf der Markenkante (Cyan → Mint). Auf 32 px ist ein
 * Verlauf aber kein Verlauf mehr, sondern ein Fleck mit zwei Farben — und
 * neben zwei Buchstaben sah das billig aus. Jetzt das volle Cyan der
 * Oberfläche mit dunklen Initialen: 6,4:1, und auf der dunklen Kopfleiste der
 * hellste Punkt der ganzen App.
 *
 * Er trägt bewusst NICHT `--accent`: seit Kopf- und Seitenleiste dunkel sind,
 * verschwände ein Kreis darin fast im Träger (2,1:1 gegen die Fläche) — und
 * der Sinn dieses Punktes ist, dass man auf einem Baustellen-Tablet mit einem
 * Blick sieht, wer angemeldet ist.
 *
 * Der schmale weisse Ring setzt ihn von der dunklen Leiste ab, auf der er
 * meistens steht — dieselbe Trennung wie zwischen Navigation und Inhalt.
 */
export default function Avatar({ name, size = 34 }: { name: string; size?: number }) {
  return (
    <span
      aria-hidden
      className="flex shrink-0 select-none items-center justify-center rounded-full bg-accent-bright font-extrabold text-ink-deep ring-2 ring-white"
      style={{ width: size, height: size, fontSize: Math.round(size * 0.36) }}
    >
      {initialsOf(name)}
    </span>
  );
}
