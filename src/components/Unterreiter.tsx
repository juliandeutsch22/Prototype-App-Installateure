import { useEffect, useRef, type ReactNode } from 'react';
import { NavLink, Navigate, Route, Routes, useLocation, useNavigate } from 'react-router-dom';
import { SelectField } from './Field';
import { useAuth } from '@/app/AuthContext';
import { unterseitenFuer } from '@/app/navigation';

/**
 * Mehrere Ansichten unter EINEM Reiter.
 *
 * WARUM ES DAS GIBT. Die App war auf 18 Reiter für die Geschäftsführung
 * gewachsen. Nicht weil es 18 Themen gäbe, sondern weil jede neue Ansicht
 * automatisch einen eigenen Reiter bekam — auch dann, wenn sie zu einem
 * bereits vorhandenen Thema gehörte. „Anforderungen" und „Lager" sind kein
 * eigenes Thema, sie sind zwei Blicke auf dasselbe: Material.
 *
 * WARUM NICHT EINFACH ALLES AUF EINE SEITE. Weil dann jede Unterseite bei
 * jedem Öffnen mitlädt — auch die, die niemand ansieht. Jede bleibt eine
 * eigene Route: sie ist verlinkbar, sie lädt erst beim Öffnen, und der
 * Zurück-Knopf tut das Erwartete.
 *
 * Welche Unterseiten es gibt und wer sie sehen darf, steht in `navigation.ts`
 * — an derselben Stelle wie die Reiter selbst. Hier steht nur, WAS gezeichnet
 * wird.
 */
export default function Unterreiter({
  basis,
  elemente,
}: {
  /** Der Reiterpfad, z. B. `/material`. */
  basis: string;
  /** Was unter welchem Pfadstück gezeigt wird. */
  elemente: Record<string, ReactNode>;
}) {
  const { user, company } = useAuth();
  const sichtbar = user
    ? unterseitenFuer(basis, user.role, { wochenplanFuerAlle: !!company?.wochenplanFuerAlle })
    : [];

  const ort = useLocation();
  const navigate = useNavigate();
  const leiste = useRef<HTMLElement>(null);
  const aktiv = ort.pathname.slice(basis.length + 1).split('/')[0];

  /*
    DER GEWÄHLTE REITER BLEIBT IM BILD. Bei acht Reitern der Einstellungen
    lief die Leiste auch am Schreibtisch über, und „Fehler" stand abgeschnitten
    am Rand (Prüflauf 24.09.2026, D5).
  */
  useEffect(() => {
    leiste.current
      ?.querySelector('[aria-current="page"]')
      ?.scrollIntoView?.({ block: 'nearest', inline: 'nearest' });
  }, [aktiv]);

  // Kann diese Rolle gar nichts davon sehen, ist der Reiter für sie falsch
  // zusammengesetzt. Zurück zur Startseite ist die einzige ehrliche Antwort.
  if (sichtbar.length === 0) return <Navigate to="/" replace />;

  const ziel = `${basis}/${sichtbar[0].pfad}`;
  /*
    AM TELEFON AB VIER REITERN EINE AUSWAHL. Auf 375 px waren von acht
    Reitern zweieinhalb zu sehen, und dass es mehr gibt, verriet nichts.
    Eine Auswahlliste nennt alle und sagt, wo man ist.
  */
  const alsAuswahl = sichtbar.length > 3;

  return (
    <div>
      {/*
        Bei nur einer Unterseite keine Leiste: ein Reiter, der genau eine
        Wahlmöglichkeit anbietet, ist keine Navigation, sondern Zierrat. Der
        Monteur sieht unter „Einstellungen" nur seine Meldungen — und damit
        einfach diese Seite.
      */}
      {alsAuswahl && (
        <div className="mb-4 sm:hidden">
          <SelectField
            id={`bereich-${basis.replace(/\W/g, '')}`}
            label="Bereich"
            value={sichtbar.some((s) => s.pfad === aktiv) ? aktiv : sichtbar[0].pfad}
            onChange={(e) => navigate(`${basis}/${e.target.value}`)}
          >
            {sichtbar.map((s) => (
              <option key={s.pfad} value={s.pfad}>
                {s.label}
              </option>
            ))}
          </SelectField>
        </div>
      )}
      {sichtbar.length > 1 && (
        <nav
          ref={leiste}
          className={`mb-4 gap-1 overflow-x-auto border-b border-line ${alsAuswahl ? 'hidden sm:flex' : 'flex'}`}
          aria-label="Bereiche"
        >
          {sichtbar.map((s) => (
            <NavLink
              key={s.pfad}
              to={`${basis}/${s.pfad}`}
              className={({ isActive }) =>
                [
                  'min-h-touch whitespace-nowrap border-b-2 px-3 py-2 text-sm transition',
                  // Dieselbe Markierung wie bei den Reitern in Material,
                  // Lager und Anforderungen: Kante UNTEN, Text fett, beides im
                  // festen Türkis der Oberfläche.
                  //
                  // Bewusst NICHT in `--accent`: das ist die Farbe des
                  // Mandanten, und dieser Betrieb hat dort sein Logo-Rot
                  // stehen. Ein roter Strich unter „Meldungen" war deshalb
                  // der einzige rote Punkt auf einer türkisen Seite — eine
                  // Markierung ist Oberfläche, keine Handlung.
                  isActive
                    ? 'border-b-accent-deep font-bold text-accent-deep'
                    : 'border-b-transparent font-medium text-ink-muted hover:text-ink',
                ].join(' ')
              }
            >
              {s.label}
            </NavLink>
          ))}
        </nav>
      )}

      <Routes>
        {sichtbar.map((s) => (
          <Route key={s.pfad} path={s.pfad} element={elemente[s.pfad] ?? null} />
        ))}
        {/*
          Alles andere auf die erste erlaubte Unterseite: das trifft den
          nackten Reiterpfad (/material) genauso wie eine Unterseite, die
          diese Rolle nicht sehen darf (/settings/module als Monteur). Umleiten
          ist hier richtiger als „Kein Zugriff" — der Benutzer hat nichts
          Verbotenes versucht, er hat einen Link angeklickt.
        */}
        <Route path="*" element={<Navigate to={ziel} replace />} />
      </Routes>
    </div>
  );
}
