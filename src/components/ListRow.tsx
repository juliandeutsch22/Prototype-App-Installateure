import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';
import Icon from './Icon';

/**
 * Einheitliche Listenzeile (Designlinie „Fassung 3", `.zeile`): Titel mit
 * Meta darunter links, Status und Wert rechts, dahinter Aktionen oder ein
 * Pfeil. Sorgt für gleiche Abstände und Ausrichtung in allen Listen-Screens.
 */
export function ListRow({
  title,
  nummer,
  subtitle,
  zustand,
  wert,
  pfeil = false,
  to,
  onOeffnen,
  gestapelt = false,
  ausgewaehlt = false,
  children,
}: {
  title: ReactNode;
  /**
   * Die Nummer zum Namen — Baustelle, Rechnung, Angebot. Steht grau neben dem
   * fetten Namen, ohne Klammer (Design-Entwurf, Punkt 3): in jeder Liste
   * dieselbe Stelle, damit das Auge sie nicht suchen muss.
   */
  nummer?: ReactNode;
  subtitle?: ReactNode;
  /**
   * Betrag oder Stunden der Zeile — steht RECHTS, vor Status und Aktionen.
   * Im Untertitel lief die Zahl mit der Länge des Datums davor hin und her;
   * rechtsbündig stehen die Beträge untereinander und lassen sich vergleichen.
   */
  wert?: ReactNode;
  /** Status der Zeile — steht VOR dem Wert, damit der Wert am rechten Rand fluchtet. */
  zustand?: ReactNode;
  /** Pfeil am Ende: für Zeilen, die als Ganzes eine Akte öffnen. */
  pfeil?: boolean;
  /**
   * DIE GANZE ZEILE IST ANTIPPBAR (Linie „Lot“, Regel 3): mit `to` führt sie
   * an eine Adresse, mit `onOeffnen` öffnet sie etwa ein Seitenfenster. Das
   * Ziel ist der Titel; seine Fläche spannt sich über die Zeile, die Knöpfe
   * rechts liegen darüber und bleiben einzeln treffbar.
   */
  to?: string;
  onOeffnen?: () => void;
  /**
   * ZUSTAND UND WERT UNTER DEM TEXT, wo der Platz nicht reicht (Auftrag
   * 04.11.2026: die Baustellenliste „eng, viel Text, wenig Abstände“). Für
   * Zeilen mit mehrzeiligem Text UND breitem Wert (Maßlinie): am Tablet nahm
   * die rechte Spalte über 400 px, der Name brach in drei Zeilen. Gestapelt
   * stehen Zustand und Wert am Handy und Tablet unter dem Text, das „⋯“ oben
   * rechts; am Schreibtisch rechts in festen Spalten wie sonst.
   */
  gestapelt?: boolean;
  /**
   * Die Zeile, deren Fenster gerade offen ist (V10, 13.11.2026): Auswahlton
   * und feine Kontur, für Vorleser `aria-current`. So bleibt neben dem
   * Seitenfenster sichtbar, wozu es gehört.
   */
  ausgewaehlt?: boolean;
  children?: ReactNode; // rechte Seite (Aktionen)
}) {
  const ganz = !!to || !!onOeffnen;
  const titelText = nummer != null && nummer !== '' ? (
    <>
      <span className="zeile-name">{title}</span> <span className="zeile-nr">{nummer}</span>
    </>
  ) : (
    title
  );
  const titelInhalt = to ? (
    <Link to={to} className="zeile-ziel">{titelText}</Link>
  ) : onOeffnen ? (
    <button type="button" onClick={onOeffnen} className="zeile-ziel text-left">{titelText}</button>
  ) : (
    titelText
  );
  if (gestapelt) {
    return (
      <li className={ganz ? 'zeile zeile-gestapelt zeile-ganz' : 'zeile zeile-gestapelt'} aria-current={ausgewaehlt || undefined}>
        <div className="zeile-text">
          <div className="zeile-titel flex flex-wrap items-center gap-x-2">{titelInhalt}</div>
          {subtitle && <p className="zeile-meta mt-0.5 block">{subtitle}</p>}
        </div>
        {(zustand || wert != null) && (
          <div className="zeile-stand">
            {zustand && <span className="zeile-zustand">{zustand}</span>}
            {wert != null && <span className="zeile-wert">{wert}</span>}
          </div>
        )}
        {(children || pfeil) && (
          <div className="zeile-aktionen">
            {children}
            {pfeil && <Icon name="weiter" size={16} className="zeile-pfeil" />}
          </div>
        )}
      </li>
    );
  }
  return (
    <li className={ganz ? 'zeile zeile-ganz flex-wrap gap-y-2' : 'zeile flex-wrap gap-y-2'} aria-current={ausgewaehlt || undefined}>
      {/*
        Untergrenze statt min-w-0. `flex: 1` allein bedeutet flex-basis:0 — der
        Titel durfte damit auf 33 px schrumpfen, waehrend die Knoepfe den Rest
        beanspruchten. Der Name lief dann ueber seine Box und wurde ueber die
        Knoepfe gemalt; genau das war am Telefon zu sehen. Mit einer
        Mindestbreite passen Titel und Aktionen entweder nebeneinander, oder
        die Aktionen rutschen sauber in die naechste Zeile.
      */}
      <div className="zeile-text min-w-[9rem]">
        {/*
          `flex` und `block` heben das Kürzen auf zwei Zeilen aus `.zeile-titel`
          und `.zeile-meta` auf (es braucht `display: -webkit-box`). Die Zeilen
          dieser App tragen im Titel oft Marken („inaktiv", „Eil") und in der
          Meta Datum und Ort — abgeschnitten wäre genau das weg, wonach jemand
          sucht. Lange Wörter brechen ohnehin (`overflow-wrap` am `body`).
        */}
        <div className="zeile-titel flex flex-wrap items-center gap-x-2">{titelInhalt}</div>
        {subtitle && <p className="zeile-meta mt-0.5 block">{subtitle}</p>}
      </div>
      {/* Der Umbruch bleibt als Fangnetz. Er ist aber nicht mehr die Antwort
          auf zu viele Aktionen: drei Textknöpfe brauchen gemessene 343 px,
          hier stehen 324 zur Verfügung, und kleiner zu setzen verschiebt das
          Problem nur auf das nächste längere Wort. Wo es mehr als zwei
          Aktionen gibt, gehört alles Seltene in ein RowMenu. */}
      {(zustand || wert != null || children || pfeil) && (
        // Knoepfe in einer Listenzeile sind Nebenhandlungen, keine
        // Hauptaktionen: kleinere Schrift und schmalere Polsterung. Die
        // Tasthoehe bleibt bei 44 px, also innerhalb dessen, was die
        // Plattformrichtlinien verlangen. Symbolknoepfe sind ausgenommen,
        // sonst schruempfte das Symbol mit.
        <div className="zeile-rechts relative z-[1] ml-auto flex max-w-full flex-wrap items-center justify-end gap-x-3 gap-y-1 [&>button:not([data-icon])]:min-h-[2.75rem] [&>button:not([data-icon])]:px-3 [&>button:not([data-icon])]:text-sm">
          {/* Der Zustand in einer festen Spalte (Design-Entwurf, Punkt 3): untereinander stehen Punkt und Wort bündig. */}
          {zustand && <span className="zeile-zustand">{zustand}</span>}
          {wert != null && <span className="zeile-wert">{wert}</span>}
          {children}
          {pfeil && <Icon name="weiter" size={16} className="zeile-pfeil" />}
        </div>
      )}
    </li>
  );
}

/**
 * Container für ListRow. Ohne `divide-y`: jede Zeile trägt ihre Trennlinie
 * oben selbst (`.zeile`), die erste keine — so bleibt die Linie auch dort
 * richtig, wo zwischen den Zeilen ein Abschnitt steht.
 */
export function List({ children }: { children: ReactNode }) {
  return <ul>{children}</ul>;
}
