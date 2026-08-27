/**
 * Initialen-Avatar in der Akzentfarbe (bei Perl das Logo-Rot). Im Prototyp
 * ist das der einzige kräftig rote Punkt im Kopfbereich und macht auf einen
 * Blick klar, wer angemeldet ist.
 */
export function initialsOf(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return '?';
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

export default function Avatar({ name, size = 34 }: { name: string; size?: number }) {
  return (
    <span
      aria-hidden
      className="flex shrink-0 select-none items-center justify-center rounded-full bg-accent font-extrabold text-accent-fg ring-2 ring-white/30"
      style={{ width: size, height: size, fontSize: Math.round(size * 0.36) }}
    >
      {initialsOf(name)}
    </span>
  );
}
