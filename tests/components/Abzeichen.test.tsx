import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { Marke, Zustand, Warnung, RoleBadge, Zaehler } from '@/components/Badge';
import StatusBadge from '@/components/StatusBadge';

/**
 * Die drei Formen — und die eine Regel, auf der alles steht.
 *
 * KEINE PILLE, NIRGENDS (seit 28.09.2026). Bis dahin galt: die Pille gibt es
 * nur bei einer Warnung. Pillen sind aber genau die Form, die zweimal als „zu
 * bunt, zu verspielt" abgelehnt wurde (docs/design/linie.md § 3) — also
 * stehen Zustand und Warnung jetzt beide als Punkt plus Wort, und die Marke
 * ohne jede Farbe. Was die Formen weiter unterscheidet, prüfen die Blöcke
 * unten: die Marke hat keine Farbe, der Zustand eine aus fünf, die Warnung
 * zwei Stufen und im Zweifel die mildere.
 */

/** Hat das Abzeichen eine eigene Fläche? Marke und Zustand dürfen keine haben. */
function hatFlaeche(el: HTMLElement): boolean {
  return [...el.classList].some((k) => k.startsWith('bg-'));
}

/** Ist es die Pille? Umrandete Form mit vollem Radius — nur die Warnung. */
function istPille(el: HTMLElement): boolean {
  const k = [...el.classList];
  return k.includes('rounded-pill') && k.some((c) => c.startsWith('border-'));
}

describe('Die Marke — eine Tatsache ohne Urteil', () => {
  it('trägt keine Fläche und keine Farbe', () => {
    render(<Marke>40 h Budget</Marke>);
    const marke = screen.getByText('40 h Budget');

    expect(hatFlaeche(marke)).toBe(false);
    expect(marke.className).not.toMatch(/text-(danger|warning|success)/);
  });

  it('spricht in der Stimme der Kartentitel', () => {
    /*
      `section-label` ist die Klasse, die auch über jeder Karte steht: klein,
      gedämpft, begleitend. Eine Notiz in der Zeile hat genau diese Rolle —
      sie ordnet sich dem Namen unter, nach dem jemand sucht.
    */
    render(<Marke>verrechnet</Marke>);
    expect([...screen.getByText('verrechnet').classList]).toContain('section-label');
  });
});

describe('Der Zustand — ein Wert aus einer kleinen Menge', () => {
  /*
    SEIT DER DESIGNLINIE „FASSUNG 3" ist der Punkt kein eigenes Element mehr,
    sondern `.stand::before` (index.css); seine Farbe hängt an der Klasse
    `stand-*`. Geprüft wird deshalb die Klasse — jsdom zeichnet keine
    erzeugten Elemente.
  */
  const standKlasse = (el: HTMLElement) => [...el.classList].find((k) => k.startsWith('stand-'));

  it('zeigt einen Punkt in der Farbe des Werts, nicht eine gefüllte Pille', () => {
    render(<Zustand stand="schlecht">Überfällig</Zustand>);
    const abzeichen = screen.getByText(/Überfällig/);

    expect(hatFlaeche(abzeichen)).toBe(false);
    expect([...abzeichen.classList]).toContain('stand');
    expect(standKlasse(abzeichen)).toBe('stand-fehl');
  });

  it('verschiedene Werte tragen verschiedene Punkte', () => {
    // Sonst wäre der Punkt Zierrat und die Liste nicht mehr zu überfliegen.
    render(<Zustand stand="gut">Bezahlt</Zustand>);
    render(<Zustand stand="ruht">Storniert</Zustand>);

    const gut = standKlasse(screen.getByText('Bezahlt'));
    const ruht = standKlasse(screen.getByText('Storniert'));
    expect(gut).toBeDefined();
    expect(ruht).toBeDefined();
    expect(gut).not.toBe(ruht);
  });

  it('der Punkt sagt dem Vorleser nichts — das tut das Wort', () => {
    /*
      Der Punkt ist ein erzeugtes Element ohne Text; im Baum steht nur das
      Wort. Stünde dort ein zweites Element mit Inhalt, läse ein Vorleser es
      mit.
    */
    const { container } = render(<Zustand stand="gut">Bezahlt</Zustand>);
    const abzeichen = container.firstElementChild as HTMLElement;
    expect(abzeichen.children.length).toBe(0);
    expect(abzeichen.textContent).toBe('Bezahlt');
  });
});

describe('Die Warnung — Punkt und Wort, keine Pille', () => {
  /*
    BIS ZUM 28.09.2026 war die Warnung die einzige Pille der App. Seither
    gibt es keine mehr (docs/design/linie.md § 3): Pillen sind die Form, die
    zweimal als „zu bunt, zu verspielt" abgelehnt wurde. Was bleibt, ist die
    Stufe — und die prüft dieser Block.
  */
  it('ist keine Pille — und Marke und Zustand sind es auch nicht', () => {
    const { container: w } = render(<Warnung>3 knapp</Warnung>);
    const { container: m } = render(<Marke>40 h Budget</Marke>);
    const { container: z } = render(<Zustand stand="gut">Bezahlt</Zustand>);

    for (const c of [w, m, z]) {
      const el = c.firstElementChild as HTMLElement;
      expect(istPille(el)).toBe(false);
      expect([...el.classList].some((k) => k.startsWith('rounded'))).toBe(false);
    }
  });

  it('trägt keine Farbfläche', () => {
    render(<Warnung stufe="dringend">über Budget</Warnung>);
    expect(hatFlaeche(screen.getByText('über Budget'))).toBe(false);
  });

  it('hat zwei Stufen, und die dringende ist die rote', () => {
    render(<Warnung stufe="achtung">12 Tage</Warnung>);
    render(<Warnung stufe="dringend">90 Tage</Warnung>);

    expect([...screen.getByText('12 Tage').classList]).toContain('stand-warn');
    expect([...screen.getByText('90 Tage').classList]).toContain('stand-fehl');
  });

  it('ist ohne Angabe die mildere Stufe', () => {
    // Wer sich nicht entscheidet, soll nicht versehentlich Alarm schlagen.
    render(<Warnung>bitte prüfen</Warnung>);
    const k = [...screen.getByText('bitte prüfen').classList];
    expect(k).toContain('stand-warn');
    expect(k).not.toContain('stand-fehl');
  });
});

describe('Der Status eines Geschäftsobjekts', () => {
  it('ist ein Zustand und keine Warnung — auch „Überfällig“', () => {
    /*
      DER STATUS SAGT, WO ETWAS STEHT, NICHT WAS ZU TUN IST. Was zu tun ist,
      steht daneben: „3 Tage" am Mahnlauf, „12 Tage" an der unverrechneten
      Leistung. Stünde beides als gefüllte Pille da, riefe die Zeile zweimal
      dasselbe — und die eine Pille, die wirklich etwas verlangt, ginge darin
      unter.
    */
    render(<StatusBadge status="Überfällig" />);
    expect(hatFlaeche(screen.getByText(/Überfällig/))).toBe(false);
  });

  it('kennt einen unbekannten Status, ohne zu werfen', () => {
    render(<StatusBadge status="Irgendwas" />);
    expect(screen.getByText(/Irgendwas/)).toBeInTheDocument();
  });
});

describe('Die Rolle', () => {
  it('ist eine Marke — sechs Farben für sechs Rollen waren eine Legende', () => {
    /*
      Niemand lernt sie auswendig, und sie standen in Listen neben
      Status-Pillen, mit denen sie nichts zu tun haben. Das Wort
      „Buchhaltung" sagt, was „Gelb" nicht sagt.
    */
    render(<RoleBadge role="Buchhaltung" />);
    const rolle = screen.getByText('Buchhaltung');

    expect(hatFlaeche(rolle)).toBe(false);
    expect([...rolle.classList]).toContain('section-label');
  });
});

describe('Der Zähler — die Zahl am Menüpunkt', () => {
  it('ist bei null gar nicht da', () => {
    /*
      DIE WICHTIGSTE PRÜFUNG AN DIESER FORM. Eine Null anzuzeigen hiesse,
      jedem Menüpunkt dauerhaft ein Abzeichen zu geben — und dann ist das
      Abzeichen wieder Tapete und keine Meldung. Fällt diese Zeile, sieht
      jede einzelne Ansicht für sich weiter vernünftig aus.
    */
    const { container } = render(<Zaehler anzahl={0} was="offene Urlaubsanträge" />);
    expect(container).toBeEmptyDOMElement();
  });

  it('trägt die Farbe der Marke und nicht die der Warnung', () => {
    /*
      Drei wartende Urlaubsanträge sind kein Fehler und kein Verzug, sondern
      Arbeit, die jemandem gehört. Rot hiesse „hier ist etwas kaputt"; wer
      das jeden Morgen liest, hört irgendwann weg — und dann ist auch das
      rote Abzeichen wirkungslos, das wirklich einmal etwas meldet.
    */
    const { container } = render(<Zaehler anzahl={3} was="offene Urlaubsanträge" />);
    const klassen = [...(container.firstElementChild as HTMLElement).classList];

    // Petrol der Linie „Lot“ — die Farbe des Produkts, nicht die Hausfarbe.
    // Der tiefe Ton, weil nur er im dunklen Satz weisse Schrift trägt.
    expect(klassen).toContain('bg-petrol-tief');
    expect(klassen.join(' ')).not.toMatch(/bg-(warning|danger)/);
  });

  it('hat auf der dunklen Seitenleiste eine eigene Fassung', () => {
    // Auf der dunklen Trägerfläche trägt die helle Fläche die dunkle Zahl.
    // Eine gemeinsame Fassung müsste auf einem der beiden Träger falsch
    // aussehen — dieselbe Teilung wie bei den Menüzeilen selbst.
    const { container } = render(
      <Zaehler anzahl={3} was="offene Urlaubsanträge" auf="dunkel" />,
    );
    const klassen = [...(container.firstElementChild as HTMLElement).classList];

    // Wie im Entwurf (`.navi-zaehler`): weiss mit der Farbe der Navigation.
    // `text-navi` und nicht `text-ink-deep`: die Tinte wird im dunklen Modus
    // hell, und dann stünde helle Schrift auf Weiss.
    expect(klassen).toContain('bg-white');
    expect(klassen).toContain('text-navi');
  });

  it('sagt dem Vorleser, wovon die Zahl handelt', () => {
    // „Urlaub 3" ist keine Auskunft. Die Ziffer selbst ist deshalb
    // `aria-hidden`, damit sie nicht zweimal kommt.
    const { container } = render(<Zaehler anzahl={3} was="offene Urlaubsanträge" />);

    expect(screen.getByText('3 offene Urlaubsanträge')).toBeInTheDocument();
    expect(container.querySelector('[aria-hidden="true"]')!.textContent).toBe('3');
  });

  it('bricht bei großen Zahlen nicht die Zeile auf', () => {
    // Ein Betrieb, der die Anforderungen ein Jahr liegen lässt, soll keine
    // vierstellige Pille in der Navigation bekommen.
    render(<Zaehler anzahl={128} was="offene Materialanforderungen" />);
    expect(screen.getByText('99+')).toBeInTheDocument();
    // Vorgelesen wird trotzdem die Wahrheit.
    expect(screen.getByText('128 offene Materialanforderungen')).toBeInTheDocument();
  });
});
