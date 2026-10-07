import type { ReactNode } from 'react';

/**
 * Kleine Bausteine der Linie „Lot“ (Protokoll Abschnitt 4), die es vor dem
 * Umbau nicht gab. Die Gestaltung steht in `src/styles/lot.css`; hier steht
 * nur, was Bedienung und Vorlesehilfe brauchen.
 */

/**
 * „und N weitere anzeigen“ — am Ende einer Gruppe, die nach 20 Zeilen
 * abbricht (Regel 4). Der Knopf sagt, wie viele noch kommen, damit niemand
 * eine gekürzte Liste für vollständig hält.
 */
export function MehrAnzeigen({
  anzahl,
  onClick,
  laedt = false,
}: {
  /** Wie viele noch nicht gezeigt sind; unbekannt (seitenweise vom Server) als `null`. */
  anzahl: number | null;
  onClick: () => void;
  laedt?: boolean;
}) {
  if (anzahl === 0) return null;
  return (
    <button type="button" className="mehr-laden" onClick={onClick} disabled={laedt} aria-busy={laedt}>
      {laedt ? 'Wird geladen …' : anzahl == null ? 'Weitere anzeigen' : `und ${anzahl} weitere anzeigen`}
    </button>
  );
}

/**
 * Eine Auswahl als Segmente — auch als Reiter (Entwurf `.wahl`). Jedes
 * Segment ist ein Knopf mit `aria-pressed`, die Gruppe trägt ihren Namen.
 */
export function Segmente<T extends string>({
  name,
  werte,
  wert,
  onChange,
}: {
  name: string;
  werte: readonly { wert: T; text: string }[];
  wert: T;
  onChange: (w: T) => void;
}) {
  return (
    <div className="segment" role="group" aria-label={name}>
      {werte.map((w) => (
        <button
          key={w.wert}
          type="button"
          aria-pressed={w.wert === wert}
          className={w.wert === wert ? 'segment-an' : undefined}
          onClick={() => onChange(w.wert)}
        >
          {w.text}
        </button>
      ))}
    </div>
  );
}

/**
 * Eine Kurzzeile zum Aufklappen (Akten, Regel 6): Name, Wert in einer Zeile,
 * die Einzelheiten darunter. `<details>` und nicht ein eigener Zustand: der
 * Browser macht Tastatur, Vorlesehilfe und Suche im Inhalt (Strg+F öffnet
 * ihn) von sich aus richtig.
 */
export function Kurzzeile({
  name,
  wert,
  offen = false,
  id,
  children,
}: {
  name: ReactNode;
  wert?: ReactNode;
  offen?: boolean;
  id?: string;
  children: ReactNode;
}) {
  return (
    <details className="kurz" open={offen} id={id}>
      <summary className="kurz-kopf">
        <span className="kurz-name">{name}</span>
        <span className="kurz-wert">{wert}</span>
        <span className="kurz-zeichen" aria-hidden="true">›</span>
      </summary>
      <div className="kurz-inhalt">{children}</div>
    </details>
  );
}

export interface LotPunkt {
  titel: ReactNode;
  zeit?: ReactNode;
  text?: ReactNode;
  /** Der Punkt, an dem es gerade steht — als Ring in Bernstein. */
  jetzt?: boolean;
}

/**
 * DER LOT-VERLAUF (Regel 7): ein senkrechter Strich mit Punkten, der
 * jetzige als Ring. Für Verläufe in Akten und Seitenfenstern.
 */
export function LotVerlauf({ punkte, name }: { punkte: LotPunkt[]; name: string }) {
  if (punkte.length === 0) return null;
  return (
    <ol className="lot" aria-label={name}>
      {punkte.map((p, i) => (
        <li key={i} className={p.jetzt ? 'lot-jetzt' : 'lot-punkt'} aria-current={p.jetzt ? 'step' : undefined}>
          <p className="lot-titel">{p.titel}</p>
          {p.zeit && <p className="lot-zeit">{p.zeit}</p>}
          {p.text && <div className="text-sm text-ink-muted">{p.text}</div>}
        </li>
      ))}
    </ol>
  );
}

/**
 * Die Sprungleiste einer Akte (Regel 6): am Schreibtisch links stehend, an
 * Tablet und Handy waagrecht mitlaufend.
 */
export function Sprungleiste({ ziele }: { ziele: { id: string; text: string }[] }) {
  return (
    <nav className="sprungleiste" aria-label="Auf dieser Seite">
      {ziele.map((z) => (
        <a key={z.id} href={`#${z.id}`} className="sprung-link">
          {z.text}
        </a>
      ))}
    </nav>
  );
}

/** Seltene Felder eines Formulars (Regel 9) — zugeklappt, ausser es steht schon etwas darin. */
export function WeitereAngaben({
  offen = false,
  titel = 'Weitere Angaben',
  children,
}: {
  offen?: boolean;
  titel?: string;
  children: ReactNode;
}) {
  return (
    <details className="weiteres" open={offen}>
      <summary className="weiteres-kopf">{titel}</summary>
      <div className="weiteres-inhalt">{children}</div>
    </details>
  );
}

/**
 * Eine Zeile einer Arbeitsliste (Regel 3): Auswahlkästchen für Sammelaktionen,
 * der antippbare Inhalt öffnet die Einzelheiten, und genau EIN Knopf führt den
 * häufigsten nächsten Schritt aus.
 */
export function Arbeitszeile({
  name,
  gewaehlt,
  onWahl,
  onOeffnen,
  schritt,
  children,
}: {
  /** Für die Vorlesehilfe: wofür steht die Zeile („Anforderung 4711“). */
  name: string;
  gewaehlt?: boolean;
  onWahl?: (an: boolean) => void;
  onOeffnen: () => void;
  schritt?: { text: string; onClick: () => void; laeuft?: boolean };
  children: ReactNode;
}) {
  return (
    <li className="arbeitszeile">
      {/* Ohne Kästchen bleibt der Platz frei, damit alle Zeilen fluchten. */}
      {!onWahl && <span className="arbeitszeile-ohne-wahl" aria-hidden="true" />}
      {onWahl && (
        <label className="arbeitszeile-wahl">
          <input
            type="checkbox"
            className="checkbox"
            checked={!!gewaehlt}
            onChange={(e) => onWahl(e.target.checked)}
            aria-label={`${name} auswählen`}
          />
        </label>
      )}
      <button type="button" className="arbeitszeile-inhalt" onClick={onOeffnen}>
        {children}
      </button>
      {schritt && (
        <button
          type="button"
          className="arbeitszeile-schritt"
          onClick={schritt.onClick}
          disabled={schritt.laeuft}
          aria-label={`${schritt.text}: ${name}`}
        >
          {schritt.text}
        </button>
      )}
    </li>
  );
}

/**
 * Die Sammelleiste (Regel 3): wie viele gewählt sind, eine Sammelaktion,
 * „Auswahl aufheben“. Am Handy steht sie über der unteren Leiste.
 */
export function Sammelleiste({
  anzahl,
  aktion,
  onAufheben,
}: {
  anzahl: number;
  aktion: { text: string; onClick: () => void; laeuft?: boolean };
  onAufheben: () => void;
}) {
  if (anzahl < 1) return null;
  return (
    <div className="sammelleiste" role="region" aria-label="Auswahl">
      <span>{anzahl === 1 ? '1 ausgewählt' : `${anzahl} ausgewählt`}</span>
      <span className="sammelleiste-knoepfe">
        <button type="button" className="sammel-knopf" onClick={aktion.onClick} disabled={aktion.laeuft}>
          {aktion.text}
        </button>
        <button type="button" className="sammel-text" onClick={onAufheben}>
          Auswahl aufheben
        </button>
      </span>
    </div>
  );
}
