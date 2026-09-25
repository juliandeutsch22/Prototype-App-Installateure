import { useEffect, useRef, type ReactNode } from 'react';
import { NavLink, Navigate, Route, Routes, useLocation } from 'react-router-dom';
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
  const leiste = useRef<HTMLElement>(null);
  const aktiv = ort.pathname.slice(basis.length + 1).split('/')[0];

  /*
    DER GEWÄHLTE REITER BLEIBT IM BILD — am Telefon, wo die Leiste seitlich
    läuft. Sonst stünde „Fehler" abgeschnitten am Rand, und wer von dort kommt,
    sähe nicht, wo er ist (Prüflauf 24.09.2026, D5). Seit die Leiste keine
    Scrollleiste mehr zeigt (index.css, `.reiterleiste`), ist das die einzige
    Orientierung darüber, wo man in der Leiste steht.

    `inline: 'nearest'` rollt nur so weit, bis der Reiter GANZ zu sehen ist —
    beim Öffnen genauso wie beim Wechsel. `block: 'nearest'` lässt die Seite
    senkrecht stehen, solange die Leiste im Bild ist. `behavior: 'auto'` heißt
    ohne Gleiten: ein Sprung um eine Reiterbreite braucht keine Bewegung, und
    wer im System „Bewegung reduzieren" gewählt hat, bekommt ohnehin keine.
    Das `?.` vor dem Aufruf, weil jsdom `scrollIntoView` nicht kennt.
  */
  useEffect(() => {
    leiste.current
      ?.querySelector('[aria-current="page"]')
      ?.scrollIntoView?.({ behavior: 'auto', block: 'nearest', inline: 'nearest' });
  }, [aktiv]);

  // Kann diese Rolle gar nichts davon sehen, ist der Reiter für sie falsch
  // zusammengesetzt. Zurück zur Startseite ist die einzige ehrliche Antwort.
  if (sichtbar.length === 0) return <Navigate to="/" replace />;

  const ziel = `${basis}/${sichtbar[0].pfad}`;

  return (
    <div>
      {/*
        Bei nur einer Unterseite keine Leiste: ein Reiter, der genau eine
        Wahlmöglichkeit anbietet, ist keine Navigation, sondern Zierrat. Der
        Monteur sieht unter „Einstellungen" nur seine Meldungen — und damit
        einfach diese Seite.

        KEINE AUSWAHLLISTE MEHR AM TELEFON. Mit Paket 6 stand dort ab vier
        Unterseiten ein Feld „Bereich" statt der Reiter. Aus dem Betrieb
        (24.09.2026): passt nicht zum Rest der App — Material, Lager und
        Urlaub tragen am Telefon Reiter, die seitlich laufen. Dasselbe gilt
        jetzt hier; der gewählte Reiter bleibt dabei im Bild.
      */}
      {sichtbar.length > 1 && (
        <nav
          ref={leiste}
          /*
            AM TELEFON SEITLICH, AB DEM TABLET UMBRECHEN. Seit Nummernkreise
            und Personal eigene Unterseiten sind, hat „Einstellungen" zehn
            Reiter; bei 1280 px ragten zwei davon aus dem Bild. Am Schreibtisch
            zeigt eine zweite Zeile alle — am Telefon wären es vier Zeilen,
            dort läuft die Leiste wie die übrigen der App seitlich.
          */
          className="mb-4 reiterleiste"
          aria-label="Bereiche"
        >
          {sichtbar.map((s) => (
            <NavLink
              key={s.pfad}
              to={`${basis}/${s.pfad}`}
              /*
                Dieselbe Markierung wie bei den Reitern in Material, Lager,
                Anforderungen und Urlaub (`Reiter.tsx`): Kante UNTEN, Text
                fett, im festen Türkis — warum nicht in `--accent`, steht in
                index.css („Reiter“).
              */
              className={({ isActive }) => (isActive ? 'reiter-aktiv' : 'reiter')}
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
