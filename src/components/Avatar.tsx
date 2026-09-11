import { initialsOf } from './initials';

/**
 * Initialen-Avatar in der leuchtenden Kante der Marke (Cyan → Mint) mit
 * dunklen Buchstaben.
 *
 * Er trägt bewusst NICHT die Akzentfarbe: seit Kopfleiste und Seitenleiste
 * dunkel sind, verschwände ein Kreis in --accent fast im Träger (2,1:1 gegen
 * die Fläche) — und der Sinn dieses Punktes ist, dass man auf einem
 * Baustellen-Tablet mit einem Blick sieht, wer angemeldet ist. Cyan auf Dunkel
 * ist die hellste Stelle der ganzen Oberfläche, die Initialen stehen mit
 * mindestens 6,4:1 darin.
 */
export default function Avatar({ name, size = 34 }: { name: string; size?: number }) {
  return (
    <span
      aria-hidden
      className="edge-accent flex shrink-0 select-none items-center justify-center rounded-full font-extrabold text-ink-deep ring-2 ring-white/40"
      style={{ width: size, height: size, fontSize: Math.round(size * 0.36) }}
    >
      {initialsOf(name)}
    </span>
  );
}
