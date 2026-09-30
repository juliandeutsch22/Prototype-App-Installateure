/**
 * Der Entwurf der Baustellen-Stammdaten — und die Frage, ob er sich vom
 * gespeicherten Stand unterscheidet.
 *
 * WARUM EIN EIGENES MODUL. Beides ist reine Rechnung ohne Oberfläche, und der
 * Mengenvergleich der beiden Personenlisten ist die Art von Feinheit, die man
 * einzeln prüfen können muss: durch die Ansicht hindurch sähe ein falscher
 * Vergleich nur wie „der Speichern-Balken benimmt sich komisch" aus.
 */
import type { Project } from '@/types';
import { leseZahl, zahlAlsText } from '@/lib/zahl';

/**
 * Der Entwurf trägt ZEICHENKETTEN, auch beim Stundenbudget.
 *
 * Ein Zahlenfeld, das man leeren kann, hat drei Zustände: eine Zahl, leer,
 * und „gerade beim Tippen ungültig". Als `number | undefined` gehalten,
 * verschluckt es das Leeren — `Number('')` ist `0`, und daraus wäre ein
 * Budget von null Stunden geworden statt „kein Budget".
 */
export interface BaustellenEntwurf {
  projectNumber: string;
  customerId: string;
  customerName: string;
  address: string;
  status: Project['status'];
  billingMode: '' | 'Regie' | 'Pauschal';
  estimatedHours: string;
  description: string;
  startDate: string;
  endDate: string;
  contactName: string;
  contactPhone: string;
  assignedEmployees: string[];
  projectManagers: string[];
}

export function alsEntwurf(p: Project): BaustellenEntwurf {
  return {
    projectNumber: p.projectNumber ?? '',
    customerId: p.customerId ?? '',
    customerName: p.customerName ?? '',
    address: p.address ?? '',
    status: p.status,
    billingMode: p.billingMode ?? '',
    estimatedHours: p.estimatedHours != null ? zahlAlsText(p.estimatedHours) : '',
    description: p.description ?? '',
    startDate: p.startDate ?? '',
    endDate: p.endDate ?? '',
    contactName: p.contactName ?? '',
    contactPhone: p.contactPhone ?? '',
    assignedEmployees: p.assignedEmployees ?? [],
    projectManagers: p.projectManagers ?? [],
  };
}

/**
 * Hat sich wirklich etwas geändert?
 *
 * Feldweise statt über `JSON.stringify`: die Schlüsselreihenfolge eines
 * Objekts ist kein Vertrag, und ein Entwurf aus einer anderen Quelle gälte
 * dort als geändert, obwohl er dasselbe sagt.
 *
 * DIE BEIDEN PERSONENLISTEN WERDEN ALS MENGE VERGLICHEN, nicht der Reihe
 * nach. Wer einen Monteur abwählt und wieder anwählt, hat nichts geändert —
 * steht er danach an anderer Stelle der Liste, meldete ein Vergleich nach
 * Reihenfolge trotzdem eine Änderung, und der Speichern-Balken bliebe
 * grundlos stehen.
 */
export function gleich(a: BaustellenEntwurf, b: BaustellenEntwurf): boolean {
  return (Object.keys(a) as (keyof BaustellenEntwurf)[]).every((f) => {
    const x = a[f];
    const y = b[f];
    if (Array.isArray(x) && Array.isArray(y)) return gleicheMenge(x, y);
    return x === y;
  });
}

/** Zwei Kennungslisten, ohne Rücksicht auf die Reihenfolge. */
function gleicheMenge(a: readonly string[], b: readonly string[]): boolean {
  if (a.length !== b.length) return false;
  const links = [...a].sort();
  const rechts = [...b].sort();
  return links.every((w, i) => w === rechts[i]);
}

/**
 * Das Stundenbudget aus dem Feld, zentral gelesen (Testbericht 30.09.2026,
 * M15). Leer heisst „kein Budget“ — dann bleibt die Ampel der
 * Projektauswertung bewusst aus, statt 0 h anzunehmen.
 */
export function stundenbudgetAus(text: string): number | undefined {
  return leseZahl(text).wert ?? undefined;
}

/** Was vor dem Speichern der Stammdaten nicht stimmt — sonst `null`. */
export function stammdatenFehler(e: Pick<BaustellenEntwurf, 'estimatedHours'>): string | null {
  const budget = leseZahl(e.estimatedHours).fehler;
  if (budget) return `Stundenbudget: ${budget}`;
  return null;
}
