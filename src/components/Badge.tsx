import type { ReactNode } from 'react';
import type { Role } from '@/types';

/**
 * Abzeichen — DREI FORMEN, NACH AUFGABE GETRENNT.
 *
 * WARUM DAS EINE EIGENE DATEI WERT IST, und warum es vorher nicht ging.
 *
 * Hier stand EINE Form: eine gefüllte Pille mit acht Farbtönen. Sie erledigte
 * fünf verschiedene Aufgaben, und dadurch erledigte sie keine davon gut:
 *
 *   Status       Offen · Bezahlt · Überfällig · Storniert
 *   Rolle        sechs eigene Farben, inklusive Violett und Schwarz
 *   Eigenschaft  Eil · Retoure · Helfer · Nacht · KI · inaktiv
 *   Zahl mit     12 Tage · über Budget · 3 knapp
 *   Urteil
 *   Notiz        40 h Budget · 3 Facharbeiter · verrechnet · kein Startdatum
 *
 * Gelb hiess damit gleichzeitig „Helfer" (eine neutrale Tatsache), „Krank"
 * (ein Status), „knapp" (ein echter Engpass) und „bitte prüfen" (eine
 * Aufforderung). Eine Farbe, die vier Dinge heisst, heisst nichts. Und alles
 * wog gleich viel: die Notiz „40 h Budget" schrie so laut wie „über Budget".
 *
 * JETZT ENTSCHEIDET DIE AUFGABE ÜBER DIE FORM, nicht die Stimmung über die
 * Farbe:
 *
 *   MARKE    Eine Tatsache ohne Urteil und ohne Kategorie. Keine Fläche,
 *            keine Farbe — gedämpfter Text in der Stimme der Kartentitel.
 *            Das ist die Mehrheit aller Abzeichen und war die Hauptquelle
 *            des Lärms.
 *   ZUSTAND  Ein Wert aus einer kleinen Menge. Ein Punkt in der Farbe des
 *            Werts, daneben das Wort in normaler Schrift. Die Farbe bleibt
 *            zum Überfliegen da, die farbige FLÄCHE schrumpft von einer
 *            Pille auf sechs Bildpunkte.
 *   WARNUNG  Hier liegt etwas für dich. Die gefüllte Pille — und NUR noch
 *            hier. Genau deshalb heisst eine gefüllte Pille in dieser App
 *            jetzt etwas.
 *
 * DIE ROLLEN HABEN IHRE FARBEN VERLOREN. Sechs Farben für sechs Rollen sind
 * eine Legende, die niemand auswendig lernt; das Wort „Buchhaltung" sagt es
 * ohnehin. Sie sind Marken.
 */

/**
 * Die Werte, die ein `Zustand` annehmen kann.
 *
 * ABSICHTLICH FÜNF UND NICHT ACHT. Jeder trägt eine Bedeutung, die sich in
 * einem Satz sagen lässt — das war bei `info` neben `brand` neben `violet`
 * nicht mehr der Fall, und deshalb war die Wahl zwischen ihnen Geschmack.
 */
export type Stand =
  /** Läuft, ist in Ordnung, ist erledigt. */
  | 'gut'
  /** In Arbeit, unterwegs, angenommen — noch nicht fertig, aber auf Kurs. */
  | 'laeuft'
  /** Ruht, ist abgeschlossen, zählt nicht mehr mit. */
  | 'ruht'
  /** Sollte jemand ansehen. */
  | 'achtung'
  /** Ist aus dem Ruder. */
  | 'schlecht';

const punkt: Record<Stand, string> = {
  gut: 'bg-success',
  laeuft: 'bg-accent-deep',
  ruht: 'bg-ink-muted/50',
  achtung: 'bg-warning',
  schlecht: 'bg-danger',
};

/**
 * Eine Tatsache ohne Urteil — „40 h Budget", „verrechnet", „inaktiv".
 *
 * KEINE FLÄCHE UND KEINE FARBE, und das ist der ganze Punkt. Diese Angaben
 * ordnen sich dem unter, wonach jemand in der Zeile sucht: dem Namen, der
 * Nummer, dem Betrag. Als gefüllte Pille standen sie gleichauf mit ihm.
 *
 * Die Stimme ist die der Kartentitel (`section-label`) — dieselbe Rolle im
 * Satzbild: eine Beschriftung, die begleitet, statt zu rufen.
 */
export function Marke({ children }: { children: ReactNode }) {
  /*
    VERSALIEN UND SPERRUNG KOMMEN AUS `section-label` UND BLEIBEN. Hier stand
    kurz `normal-case tracking-normal` daneben, um beides wegzunehmen — die
    Klassen sind wirkungslos: `.section-label` steht in `index.css` ausserhalb
    jeder Ebene und schlägt damit die Tailwind-Hilfsklassen. Am Bildschirm
    nachgesehen, statt es anzunehmen: die Versalien lesen sich in der Zeile
    gut und binden die Marke an die Kartentitel. Zwei Klassen, die nichts tun,
    aber etwas behaupten, wären schlimmer als keine.
  */
  return <span className="section-label whitespace-nowrap">{children}</span>;
}

/**
 * Ein Wert aus einer kleinen Menge — Punkt plus Wort.
 *
 * DER PUNKT TRÄGT DIE FARBE, DAS WORT DIE BEDEUTUNG. Wer die Liste
 * überfliegt, sieht am Punkt, dass hier etwas anderes steht als in der Zeile
 * darüber; wer hinsieht, liest es. Eine gefüllte Pille kann beides auch —
 * aber sie kostet dafür die ganze Zeilenhöhe an Farbe, und zehn davon
 * untereinander ergeben eine Liste, in der nichts mehr hervorsticht.
 *
 * `aria-hidden` am Punkt: er sagt nichts, was nicht im Wort steht. Ein
 * Vorleser, der ihn ankündigte, läse eine Dekoration vor.
 */
export function Zustand({ stand, children }: { stand: Stand; children: ReactNode }) {
  return (
    <span className="inline-flex items-center gap-1.5 whitespace-nowrap text-xs font-semibold text-ink">
      <span className={`h-1.5 w-1.5 shrink-0 rounded-full ${punkt[stand]}`} aria-hidden="true" />
      {children}
    </span>
  );
}

/**
 * Hier liegt etwas für dich — die einzige gefüllte Pille der App.
 *
 * ZWEI STUFEN UND NICHT MEHR. `achtung` heisst „sollte jemand ansehen",
 * `dringend` heisst „ist überfällig oder aus dem Ruder". Eine dritte Stufe
 * wäre eine Unterscheidung, die niemand beim Überfliegen trifft.
 *
 * Dass es sie nur hier gibt, ist die eigentliche Wirkung: solange gefüllte
 * Pillen auch „40 h Budget" bedeuteten, sagte eine gefüllte Pille nichts
 * über Dringlichkeit. Jetzt schon.
 */
export function Warnung({
  stufe = 'achtung',
  children,
}: {
  stufe?: 'achtung' | 'dringend';
  children: ReactNode;
}) {
  const ton = stufe === 'dringend'
    ? 'bg-danger-bg text-danger'
    : 'bg-warning-bg text-warning';
  return (
    <span
      className={`tnum inline-block whitespace-nowrap rounded-pill px-2.5 py-0.5 text-xs font-bold ${ton}`}
    >
      {children}
    </span>
  );
}

/**
 * Die Rolle eines Menschen — eine Marke, keine Farbe.
 *
 * Sechs Farben für sechs Rollen waren eine Legende, die niemand auswendig
 * lernt, und sie standen in Listen neben Status-Pillen, mit denen sie nichts
 * zu tun haben. „Buchhaltung" sagt, was „Gelb" nicht sagt.
 */
export function RoleBadge({ role }: { role: Role }) {
  return <Marke>{role}</Marke>;
}
