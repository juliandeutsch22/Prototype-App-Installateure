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
 *   WARNUNG  Hier liegt etwas für dich. War bis zum 28.09.2026 die einzige
 *            Pille der App; seither Punkt plus Wort wie der Zustand, mit
 *            oranger oder roter Stufe (siehe unten bei `Warnung`).
 *
 * DIE ROLLEN HABEN IHRE FARBEN VERLOREN. Sechs Farben für sechs Rollen sind
 * eine Legende, die niemand auswendig lernt; das Wort „Buchhaltung" sagt es
 * ohnehin. Sie sind Marken.
 */

/**
 * Die Werte, die ein `Zustand` annehmen kann.
 *
 * DIE FÜNF ZUSTÄNDE DER LINIE „LOT“ (Regel 5): offen (leerer Ring), läuft
 * (Petrol), erledigt (grau, tritt zurück), Achtung (Bernstein), Fehler (Rot).
 * `gut` ist dabei „läuft, ist in Ordnung“ und sieht aus wie `laeuft`; was
 * fertig ist und nicht mehr zählt, ist `ruht` — das „erledigt“ des Entwurfs.
 */
export type Stand =
  /** Noch nicht begonnen, wartet auf jemanden. */
  | 'offen'
  /** Läuft, ist in Ordnung. */
  | 'gut'
  /** In Arbeit, unterwegs, angenommen — noch nicht fertig, aber auf Kurs. */
  | 'laeuft'
  /** Erledigt, abgeschlossen, zählt nicht mehr mit. */
  | 'ruht'
  /** Sollte jemand ansehen. */
  | 'achtung'
  /** Ist aus dem Ruder. */
  | 'schlecht';

/*
 * Die Klasse zum Wert (Designlinie „Fassung 3", `.stand-*` in index.css).
 * Die Namen der Linie sind kürzer, die Bedeutung ist dieselbe.
 */
const standKlasse: Record<Stand, string> = {
  offen: 'stand-offen',
  gut: 'stand-ok',
  laeuft: 'stand-info',
  ruht: 'stand-leise',
  achtung: 'stand-warn',
  schlecht: 'stand-fehl',
};

/**
 * Eine Tatsache ohne Urteil — „40 h Budget", „verrechnet", „inaktiv".
 *
 * KEINE FLÄCHE UND KEINE FARBE, und das ist der ganze Punkt. Diese Angaben
 * ordnen sich dem unter, wonach jemand in der Zeile sucht: dem Namen, der
 * Nummer, dem Betrag. Als gefüllte Pille standen sie gleichauf mit ihm.
 *
 * Die Stimme ist die der Dachzeilen (`section-label`) — dieselbe Rolle im
 * Satzbild: eine Beschriftung, die begleitet, statt zu rufen. Seit dem
 * 25.09.2026 ohne Versalien: „40 h Budget" statt „40 H BUDGET".
 */
export function Marke({ children }: { children: ReactNode }) {
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
 * SEIT DER DESIGNLINIE „FASSUNG 3" steht das Wort gedämpft (`--text-muted`,
 * 500) und nicht mehr in Tinte und halbfett: in einer Zeile ist der Status
 * Beiwerk zum Titel, nicht sein Nebenbuhler. Der Punkt kommt aus
 * `.stand::before` — ein erzeugtes Element ohne Text, das ein Vorleser nicht
 * ansagt; er sagt nichts, was nicht im Wort steht. Einzig „schlecht"
 * (Überfällig) färbt auch das Wort, rot.
 */
export function Zustand({ stand, children }: { stand: Stand; children: ReactNode }) {
  return <span className={`stand ${standKlasse[stand]}`}>{children}</span>;
}

/**
 * Hier liegt etwas für dich — „12 Tage", „über Budget", „3 knapp".
 *
 * ZWEI STUFEN UND NICHT MEHR. `achtung` heisst „sollte jemand ansehen",
 * `dringend` heisst „ist überfällig oder aus dem Ruder". Eine dritte Stufe
 * wäre eine Unterscheidung, die niemand beim Überfliegen trifft.
 *
 * KEINE PILLE MEHR (Entscheid vom 28.09.2026, docs/design/linie.md § 3).
 * Hier stand bis dahin die einzige Pille der App — erst gefüllt in
 * Pastellgelb und -rot, dann umrandet. Beides ist die Form, die zweimal als
 * „zu bunt, zu verspielt" abgelehnt wurde. Jetzt dieselbe Form wie der
 * Status: Punkt plus Wort (`.stand`). Die Dringlichkeit bleibt sichtbar —
 * `achtung` mit orangem Punkt, `dringend` mit rotem Punkt UND roter
 * Schrift; rot ist in der Linie genau dem Überfälligen vorbehalten.
 */
export function Warnung({
  stufe = 'achtung',
  children,
}: {
  stufe?: 'achtung' | 'dringend';
  children: ReactNode;
}) {
  return (
    <span className={`stand ${stufe === 'dringend' ? 'stand-fehl' : 'stand-warn'}`}>
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

/**
 * Wie viele offene Posten hinter einem Menüpunkt liegen.
 *
 * DIE VIERTE FORM — UND SIE STEHT NUR IN DER NAVIGATION. Das ist keine
 * Ausnahme von der Regel oben, sondern ihr Gegenstück: die Regel sagt, dass
 * IN EINER LISTE keine Fläche steht, weil sie dort mit dem Namen, der
 * Nummer und dem Betrag um denselben Blick kämpft. Im Menü steht
 * neben dem Wort nichts — die Zahl kämpft mit nichts, und ohne Fläche wäre
 * sie ein zweites Wort in einer Zeile, die aus einem Wort besteht.
 *
 * NICHT GELB UND NICHT ROT, und das ist der Unterschied zur `Warnung`. Drei
 * wartende Urlaubsanträge sind kein Fehler und kein Verzug, sondern Arbeit,
 * die jemandem gehört. Rot hiesse „hier ist etwas kaputt"; wer das jeden
 * Morgen liest, hört irgendwann weg — und dann ist auch das rote Abzeichen
 * wirkungslos, das wirklich einmal etwas meldet. Die Farbe ist deshalb die
 * der Marke.
 *
 * ZWEI FASSUNGEN, WEIL ES ZWEI TRÄGER GIBT — genau wie bei den Menüzeilen
 * selbst (`sideLink` und `sideLinkDark` in `app/Layout.tsx`). Auf der dunklen
 * Seitenleiste trägt die helle Fläche die dunkle Zahl (6,4:1, die Fläche
 * selbst 4,0:1 gegen die Leiste); auf den hellen Blättern von unten ist es
 * umgekehrt (5,2:1). Eine gemeinsame Fassung müsste auf einem von beiden
 * falsch aussehen.
 *
 * DIE ZAHL ALLEIN SAGT NICHTS. „3" neben „Urlaub" liest ein Mensch aus dem
 * Zusammenhang; ein Vorleser liest „Urlaub 3". Deshalb trägt sie einen
 * ausgeschriebenen Namen und die Ziffer selbst ist `aria-hidden` — sonst
 * käme sie zweimal.
 */
export function Zaehler({
  anzahl,
  was,
  auf = 'hell',
}: {
  anzahl: number;
  /** Ausgeschrieben, für den Vorleser: „offene Urlaubsanträge". */
  was: string;
  auf?: 'hell' | 'dunkel';
}) {
  /*
    NULL IST KEIN ABZEICHEN. Eine Null anzuzeigen hiesse, jedem Menüpunkt
    dauerhaft ein Abzeichen zu geben — und damit wäre das Abzeichen wieder
    Tapete und keine Meldung. Die Entscheidung steht HIER und nicht an den
    Aufrufstellen: dort wäre sie viermal zu treffen und dreimal richtig.
  */
  if (!Number.isFinite(anzahl) || anzahl < 1) return null;

  const ton = auf === 'dunkel'
    ? 'bg-white text-navi'
    : 'bg-brand-fixed text-white';
  return (
    <span
      className={`inline-flex min-w-[1.25rem] shrink-0 items-center justify-center rounded-pill px-1.5 py-0.5 text-xs font-semibold leading-none ${ton}`}
    >
      <span aria-hidden="true">{anzahl > 99 ? '99+' : anzahl}</span>
      {/* Ein Komma davor, eigens: sonst las der Vorleser „Anforderungen1 offene …“ (G32). */}
      <span className="sr-only">, </span>
      <span className="sr-only">{`${anzahl} ${was}`}</span>
    </span>
  );
}
