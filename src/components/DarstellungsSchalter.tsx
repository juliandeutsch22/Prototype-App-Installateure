import type { Darstellung } from '@/lib/darstellung';

/** Gleiche Gerätewahl in der Navigation und im Profil, ohne sichtbaren Text. */
export default function DarstellungsSchalter({ darstellung, onChange }: {
  darstellung: Darstellung;
  onChange: (darstellung: Darstellung) => void;
}) {
  const dunkel = darstellung === 'dunkel';
  return (
    <button
      type="button"
      role="switch"
      aria-label="Dunkle Darstellung"
      aria-checked={dunkel}
      title={dunkel ? 'Helle Darstellung einschalten' : 'Dunkle Darstellung einschalten'}
      className="darstellung-schalter"
      onClick={() => onChange(dunkel ? 'hell' : 'dunkel')}
    >
      <span className="darstellung-schiene" aria-hidden="true">
        <span className="darstellung-griff">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor"
            strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" focusable="false">
            <path d={dunkel
              ? 'M20.5 13.2A8.5 8.5 0 0 1 10.8 3.5a8.5 8.5 0 1 0 9.7 9.7Z'
              : 'M12 8a4 4 0 1 0 0 8 4 4 0 0 0 0-8ZM12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4'} />
          </svg>
        </span>
      </span>
    </button>
  );
}
