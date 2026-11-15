import { afterEach } from 'vitest';
import { fireEvent, screen, within, type ByRoleOptions } from '@testing-library/react';

/*
  In `waitFor(() => handlung(…))` weckt jedes Auf und Zu des ⋯ den
  MutationObserver von `waitFor`, der sofort wieder prüft. Fehlt die Handlung
  ganz (falscher Name), käme die Prüfung so nie zur Ruhe und der Test hinge,
  statt rot zu werden. Nach so vielen Fehlgriffen in Folge öffnet `handlung`
  das ⋯ nicht mehr; `waitFor` läuft dann in seine Zeitgrenze und meldet den
  gesuchten Namen.
*/
const FEHLGRIFFE_HOECHSTENS = 50;
let fehlgriffe = 0;
afterEach(() => {
  fehlgriffe = 0;
});


/**
 * EINE HANDLUNG FINDEN, OB KNOPF ODER EINTRAG IM ⋯ (U1, U4, Durchsicht
 * 15.11.2026). Seit Fenster und Akten nur noch eine Hauptaktion und höchstens
 * eine zweite als Knopf tragen, stehen die übrigen Handlungen im ⋯
 * (`Fensteraktionen`, `AktenKopf`). Die Prüfungen fragen nach der Handlung,
 * nicht danach, wo sie steht: zuerst als Knopf, sonst im ⋯ — das Menü wird
 * dafür geöffnet und der Eintrag zurückgegeben; ein Klick darauf löst ihn aus.
 *
 * Wie `getByRole`: genau ein Treffer, sonst ein Fehler mit dem gesuchten Namen.
 */
export function handlung(optionen: ByRoleOptions, im?: HTMLElement): HTMLElement {
  const wo = im ? within(im) : screen;
  const knoepfe = wo.queryAllByRole('button', optionen);
  if (knoepfe.length === 1) return gefunden(knoepfe[0]);
  if (knoepfe.length > 1) return wo.getByRole('button', optionen);
  if (fehlgriffe < FEHLGRIFFE_HOECHSTENS) {
    for (const mehr of wo.queryAllByRole('button', { name: /^Weitere Aktionen für / })) {
      if (mehr.getAttribute('aria-expanded') !== 'true') fireEvent.click(mehr);
      const eintraege = screen.queryAllByRole('menuitem', optionen);
      if (eintraege.length === 1) return gefunden(eintraege[0]);
      fireEvent.click(mehr);
    }
  }
  fehlgriffe += 1;
  return wo.getByRole('button', optionen);
}

function gefunden(element: HTMLElement): HTMLElement {
  fehlgriffe = 0;
  return element;
}

/** Gibt es die Handlung — als Knopf oder im ⋯? Für „steht nicht da“-Prüfungen. */
export function handlungDa(optionen: ByRoleOptions, im?: HTMLElement): boolean {
  try {
    handlung(optionen, im);
    return true;
  } catch {
    return false;
  } finally {
    // Ein geöffnetes Menü wieder schließen, damit die nächste Prüfung die Seite sieht, wie sie war.
    for (const offen of screen.queryAllByRole('button', { name: /^Weitere Aktionen für /, expanded: true })) fireEvent.click(offen);
  }
}
