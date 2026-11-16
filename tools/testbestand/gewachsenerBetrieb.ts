/**
 * EIN BETRIEB, WIE ER NACH ZEHN JAHREN AUSSIEHT (Plan 15.11.2026, L11).
 *
 * WARUM ES DAS BRAUCHT. Der bisherige Testbestand (`scripts/ui-umbau/testbestand.mjs`)
 * kennt einen Eintritt für alle und kein Tagessoll — die teuersten Wege (Saldo
 * mit „kurzem Freitag“, Gesamtsalden über verschiedene Eintrittsmonate) hat
 * deshalb keine Messung je durchlaufen (Analyse 15.11.2026, B1, B2). Hier
 * entsteht ein Bestand, der diese Fälle von selbst enthält:
 *
 *   - 50 Personen, Eintritte über zehn Jahre verteilt, jede in einem anderen Monat;
 *   - die meisten mit 38,5 Stunden und kurzem Freitag (Mo–Do 8,5, Fr 4,5) — im
 *     Gewerbe der Regelfall —, einige in Teilzeit an vier Tagen;
 *   - je Arbeitstag zwei Buchungen, dazwischen Krank- und Urlaubstage (nur an
 *     Tagen mit Soll, wie die Datenbank sie anlegt);
 *   - Kunden, Baustellen, Angebote, Wartungen und Rechnungen in der Menge, die
 *     ein Betrieb dieser Größe über die Jahre ansammelt.
 *
 * ERFUNDEN. Namen, Anschriften, Telefonnummern sind aus Listen zusammengesetzt;
 * keine Person und kein Betrieb ist echt. Domänen enden auf `.invalid`.
 *
 * TAGE MIT SOLL nach den Regeln der App (`pflichtTage`: Arbeitstage ohne
 * Feiertage, höchstens bis gestern) — Krank und Urlaub liegen nur dort, so wie
 * die Datenbank sie anlegt.
 *
 * GLEICH BEI JEDEM AUFRUF. Ein fester Würfel (`saat`), damit eine Messung von
 * heute mit einer von morgen vergleichbar ist. Ohne DOM und ohne Node-Module:
 * nutzbar in Prüfungen (Node) und in der Vorschau (Browser,
 * `?bestand=gewachsen`).
 */

import { pflichtTage } from '@/lib/time';

export interface GewachsenOptionen {
  personen?: number;
  jahre?: number;
  /** Stichtag `YYYY-MM-DD`; gebucht wird bis zum Vortag. */
  heute?: string;
  saat?: number;
  kunden?: number;
  /** Buchungen erst ab diesem Tag (`YYYY-MM-DD`) — für die Vorschau, die keine Abfrage filtert. */
  zeitenAb?: string;
}

export const KURZER_FREITAG: Record<string, number> = { '1': 8.5, '2': 8.5, '3': 8.5, '4': 8.5, '5': 4.5 };

const VORNAMEN = [
  'Andreas', 'Bernhard', 'Christian', 'Daniel', 'Elias', 'Florian', 'Georg', 'Harald', 'Ines', 'Johanna',
  'Katharina', 'Lukas', 'Martin', 'Nina', 'Oliver', 'Patrick', 'Raphael', 'Sabine', 'Thomas', 'Ulrike',
  'Valentin', 'Werner', 'Yvonne', 'Zoran', 'Alexander', 'Birgit', 'David', 'Eva', 'Fabian', 'Gerhard',
];
const NACHNAMEN = [
  'Aigner', 'Bauer', 'Brandstätter', 'Eder', 'Fuchs', 'Gruber', 'Haas', 'Hofer', 'Huber', 'Kainz',
  'Lechner', 'Leitner', 'Maier', 'Moser', 'Pichler', 'Reiter', 'Schmid', 'Schwarz', 'Steiner', 'Wagner',
  'Weber', 'Wimmer', 'Winkler', 'Wolf', 'Zauner', 'Berger', 'Ebner', 'Fischer', 'Holzer', 'Mayr',
];
const STRASSEN = ['Hauptstraße', 'Bahnhofstraße', 'Kirchengasse', 'Schulweg', 'Lindenallee', 'Mühlgasse', 'Feldgasse', 'Am Anger', 'Wiener Straße', 'Grazer Straße'];
const ORTE = ['2700 Wiener Neustadt', '2620 Neunkirchen', '2500 Baden', '2340 Mödling', '3100 St. Pölten', '7000 Eisenstadt', '2630 Ternitz', '2601 Sollenau'];
const FIRMEN = ['Hausverwaltung', 'Wohnbau', 'Gemeinde', 'Bäckerei', 'Gasthof', 'Autohaus', 'Tischlerei', 'Kindergarten'];
const ANLAGEN = ['Gasbrennwertkessel', 'Wärmepumpe Luft/Wasser', 'Pelletskessel', 'Solaranlage', 'Enthärtungsanlage', 'Lüftungsanlage'];

/** Linearer Würfel mit fester Saat — gleiche Folge auf jedem Rechner. */
function wuerfel(saat: number) {
  let x = saat >>> 0 || 1;
  return () => {
    x = (Math.imul(x, 1664525) + 1013904223) >>> 0;
    return x / 4294967296;
  };
}

const iso = (d: Date) => d.toISOString().slice(0, 10);
const tagDazu = (s: string, n: number) => {
  const d = new Date(`${s}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return iso(d);
};
const wochentag = (s: string) => new Date(`${s}T00:00:00Z`).getUTCDay();
const hhmm = (min: number) => `${String(Math.floor(min / 60)).padStart(2, '0')}:${String(min % 60).padStart(2, '0')}`;
const betrag = (n: number) => Math.round(n * 100) / 100;

export function gewachsenerBetrieb(o: GewachsenOptionen = {}) {
  const personen = o.personen ?? 50;
  const jahre = o.jahre ?? 10;
  const heute = o.heute ?? new Date().toISOString().slice(0, 10);
  const r = wuerfel(o.saat ?? 20261115);
  const wahl = <T,>(liste: readonly T[]) => liste[Math.floor(r() * liste.length)];
  const companyId = 'gewachsen';
  const beginn = `${Number(heute.slice(0, 4)) - jahre}${heute.slice(4, 7)}-01`;

  /* -------------------------------------------------------------- Personen --- */
  const ROLLEN = ['Geschäftsführung', 'Buchhaltung', 'Buchhaltung', 'Projektleiter', 'Projektleiter', 'Projektleiter', 'Verwaltung'];
  const benutzer = Array.from({ length: personen }, (_, i) => {
    const name = `${VORNAMEN[i % VORNAMEN.length]} ${NACHNAMEN[(i * 7) % NACHNAMEN.length]}`;
    // Jede Person in einem anderen Monat: Abstand gleichmäßig über die Jahre, die erste am Beginn.
    const monate = Math.floor((i * jahre * 12) / personen);
    const ein = new Date(`${beginn}T00:00:00Z`);
    ein.setUTCMonth(ein.getUTCMonth() + monate);
    ein.setUTCDate(1 + Math.floor(r() * 27));
    const teilzeit = i % 10 === 7;
    const kurzerFreitag = !teilzeit && i % 5 !== 3;
    const workDays = teilzeit ? [1, 2, 3, 4] : [1, 2, 3, 4, 5];
    return {
      id: `g${i + 1}`,
      uid: `g${i + 1}`,
      companyId,
      name,
      email: `${name.toLowerCase().replace(/[^a-z]+/g, '.')}@beispiel.invalid`,
      role: ROLLEN[i] ?? 'Mitarbeiter',
      einstufung: i < ROLLEN.length ? null : wahl(['monteur', 'monteur', 'obermonteur', 'helfer', 'lehrling'] as const),
      active: true,
      weeklyTargetHours: teilzeit ? 30 : 38.5,
      yearlyVacationDays: 25,
      initialVacationDays: 25,
      initialOvertime: 0,
      workDays,
      tagessoll: kurzerFreitag ? { ...KURZER_FREITAG } : null,
      appStartDate: iso(ein),
    };
  });

  /* ------------------------------------------------- Kunden und Baustellen --- */
  const anzahlKunden = o.kunden ?? 2000;
  const kunden = Array.from({ length: anzahlKunden }, (_, i) => {
    const firma = i % 4 === 0;
    const nach = wahl(NACHNAMEN);
    const name = firma ? `${wahl(FIRMEN)} ${nach} ${wahl(STRASSEN)}` : `Familie ${nach}`;
    return {
      id: `gk${i + 1}`,
      companyId,
      name: `${name} ${i + 1}`,
      address: `${wahl(STRASSEN)} ${1 + Math.floor(r() * 120)}, ${wahl(ORTE)}`,
      contactPhone: `0664 ${String(1000000 + Math.floor(r() * 8999999))}`,
      email: firma ? `office${i + 1}@beispiel.invalid` : undefined,
      kundenart: firma ? 'gewerbe' : 'privat',
      active: i % 17 !== 0,
    };
  });

  const baustellen: Array<Record<string, unknown>> = [];
  const STATUS = ['Abgeschlossen', 'Abgeschlossen', 'Abgeschlossen', 'Aktiv', 'Pausiert'];
  for (let i = 0; i < anzahlKunden * 2; i++) {
    const k = kunden[Math.floor(r() * kunden.length)];
    const jahr = Number(heute.slice(0, 4)) - Math.floor((i / (anzahlKunden * 2)) * jahre);
    baustellen.push({
      id: `gp${i + 1}`,
      companyId,
      projectNumber: `B-${jahr}-${String((i % 9999) + 1).padStart(4, '0')}`,
      customerId: k.id,
      customerName: k.name,
      address: k.address,
      // Die jüngsten sind offen, die alten abgeschlossen — wie in einem echten Betrieb.
      status: i < 120 ? wahl(['Aktiv', 'Aktiv', 'Pausiert']) : wahl(STATUS),
      billingMode: wahl(['Regie', 'Regie', 'Pauschal']),
      estimatedHours: 8 + Math.floor(r() * 300),
    });
  }

  const angebote = Array.from({ length: Math.round(anzahlKunden * 1.5) }, (_, i) => {
    const k = kunden[Math.floor(r() * kunden.length)];
    const datum = tagDazu(heute, -Math.floor((i / (anzahlKunden * 1.5)) * jahre * 365));
    const netto = betrag(300 + r() * 30000);
    return {
      id: `gq${i + 1}`,
      companyId,
      quoteNumber: `A-${datum.slice(0, 4)}-${String((i % 9999) + 1).padStart(4, '0')}`,
      customerId: k.id,
      customerName: k.name,
      address: k.address,
      quoteDate: datum,
      validUntil: tagDazu(datum, 30),
      status: i < 40 ? wahl(['Entwurf', 'Versendet']) : wahl(['Angenommen', 'Abgelehnt', 'Abgelaufen', 'Angenommen']),
      positions: [{ label: 'Leistung laut Besichtigung', qty: 1, unit: 'pausch', unitPrice: netto }],
      subtotalNetto: netto,
      totalNetto: netto,
      totalVat: betrag(netto * 0.2),
      totalBrutto: betrag(netto * 1.2),
      vatRate: 0.2,
    };
  });

  const wartungen = Array.from({ length: Math.round(anzahlKunden * 0.4) }, (_, i) => {
    const k = kunden[Math.floor(r() * kunden.length)];
    const zuletzt = tagDazu(heute, -Math.floor(r() * 400));
    return {
      id: `gw${i + 1}`,
      companyId,
      customerId: k.id,
      customerName: k.name,
      anlage: wahl(ANLAGEN),
      address: k.address,
      intervallMonate: wahl([12, 12, 24]),
      zuletztAm: zuletzt,
      faelligAm: tagDazu(zuletzt, 365),
      aktiv: i % 9 !== 0,
    };
  });

  const rechnungen = Array.from({ length: anzahlKunden * 3 }, (_, i) => {
    const b = baustellen[Math.floor(r() * baustellen.length)];
    const datum = tagDazu(heute, -Math.floor((i / (anzahlKunden * 3)) * jahre * 365));
    const netto = betrag(200 + r() * 20000);
    return {
      id: `gr${i + 1}`,
      companyId,
      invoiceNumber: `${datum.slice(0, 4)}-${String((i % 9999) + 1).padStart(4, '0')}`,
      projectNumber: b.projectNumber,
      customerName: b.customerName,
      invoiceDate: datum,
      dueDate: tagDazu(datum, 30),
      totalNetto: netto,
      totalVat: betrag(netto * 0.2),
      totalBrutto: betrag(netto * 1.2),
      // Die jüngsten offen, einige uneinbringliche bleiben über Jahre überfällig (Analyse B6).
      paymentStatus: i < 30 ? 'Offen' : i % 211 === 0 ? 'Überfällig' : 'Bezahlt',
      vatRate: 0.2,
    };
  });

  /* ------------------------------------------------------------- Buchungen --- */
  const aktive = baustellen.slice(0, 120);
  const zeiten: Array<Record<string, unknown>> = [];
  const lokal = (s: string) => new Date(Number(s.slice(0, 4)), Number(s.slice(5, 7)) - 1, Number(s.slice(8, 10)));
  for (const p of benutzer) {
    const ab = o.zeitenAb && o.zeitenAb > p.appStartDate ? o.zeitenAb : p.appStartDate;
    for (const d of pflichtTage(p, lokal(ab), lokal(tagDazu(heute, -1)))) {
      const w = wochentag(d);
      const wurf = r();
      const kopf = { companyId, date: d, userId: p.uid, userName: p.name };
      if (wurf < 0.03) {
        zeiten.push({ id: `${p.uid}-${d}-k`, ...kopf, status: 'Krank' });
        continue;
      }
      if (wurf < 0.13) {
        zeiten.push({ id: `${p.uid}-${d}-u`, ...kopf, status: 'Urlaub' });
        continue;
      }
      const sollMin = Math.round((p.tagessoll?.[String(w)] ?? p.weeklyTargetHours / p.workDays.length) * 60);
      const bau = aktive[Math.floor(r() * aktive.length)];
      const anfang = 7 * 60 + Math.floor(r() * 3) * 15;
      const vormittag = Math.min(sollMin, 4 * 60);
      zeiten.push({
        id: `${p.uid}-${d}-1`, ...kopf, status: 'Anwesend',
        startTime: hhmm(anfang), endTime: hhmm(anfang + vormittag), breakDuration: 0,
        projectNumber: bau.projectNumber, customerName: bau.customerName,
      });
      // Nach einer halben Stunde Mittag der Rest des Solls, manchmal eine Stunde mehr.
      const rest = sollMin - vormittag + Math.floor(r() * 5) * 15;
      if (rest > 0) {
        const bau2 = aktive[Math.floor(r() * aktive.length)];
        const nach = anfang + vormittag + 30;
        zeiten.push({
          id: `${p.uid}-${d}-2`, ...kopf, status: 'Anwesend',
          startTime: hhmm(nach), endTime: hhmm(nach + rest), breakDuration: 0,
          projectNumber: bau2.projectNumber, customerName: bau2.customerName,
        });
      }
    }
  }

  return { companyId, heute, benutzer, kunden, baustellen, angebote, wartungen, rechnungen, zeiten };
}

export type GewachsenerBetrieb = ReturnType<typeof gewachsenerBetrieb>;
