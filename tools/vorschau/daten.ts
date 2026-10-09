/*
 * Beispieldaten fuer die Vorschau.
 *
 * DIE NAMEN SIND ABSICHTLICH LANG. „Wohnungseigentümergemeinschaft
 * Hauptstraße 112–118" ist kein ausgedachter Extremfall, sondern die Sorte
 * Kundenname, die dieser Betrieb wirklich hat — und genau daran zeigen sich
 * Umbrueche. Wer hier „Meier GmbH" einsetzt, misst nichts mehr.
 */
export const HEUTE = new Date().toISOString().slice(0, 10);

/*
  TAGE RELATIV ZUR LAUFENDEN WOCHE (Runde 4). Wochenplan, Monat und
  Mitarbeiterübersicht zeigen den laufenden Zeitraum; feste Daten stünden
  nach ein paar Wochen ausserhalb und die Vorschau wäre leer. `tag(0)` ist
  der Montag dieser Woche, `tag(-7)` der Montag davor.
*/
const MONTAG = (() => {
  const d = new Date(`${HEUTE}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() - ((d.getUTCDay() + 6) % 7));
  return d;
})();
export const tag = (n: number) => {
  const d = new Date(MONTAG);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
};
/** Die Werktage des laufenden Monats vor heute — für Buchungen mit Lücken. */
const WERKTAGE_BIS_GESTERN = (() => {
  const erster = new Date(`${HEUTE.slice(0, 8)}01T00:00:00Z`);
  const tage: string[] = [];
  for (const d = new Date(erster); d.toISOString().slice(0, 10) < HEUTE; d.setUTCDate(d.getUTCDate() + 1)) {
    if (d.getUTCDay() !== 0 && d.getUTCDay() !== 6) tage.push(d.toISOString().slice(0, 10));
  }
  return tage;
})();

export const firma = {
  id: 'perl', name: 'Perl Installationen GmbH',
  addressLine: 'Musterstrasse 1 · 2700 Wiener Neustadt',
  contactLine: 'Tel 02622 12345 · office@perl.at · www.perl.at',
  iban: 'AT12 3456 7890 1234 5678', bic: 'GIBAATWWXXX', bankName: 'Erste Bank',
  vatId: 'ATU12345678', companyRegister: 'FN 123456a',
  rates: { fach: 78, helper: 52, vatRate: 0.2, anfahrt: 45, nacht: 0.5, notdienst: 1 },
  modules: {}, urlaubUebertrag: 'verjaehrung', kalenderAboErlaubt: true,
};

export const benutzer = [
  { id: 'u1', companyId: 'perl', uid: 'u1', name: 'Max Mustermann', email: 'max.mustermann@perl.at', role: 'Mitarbeiter', active: true, weeklyTargetHours: 40, yearlyVacationDays: 25, initialVacationDays: 25, appStartDate: '2026-01-08', workDays: [1, 2, 3, 4, 5] },
  { id: 'u2', companyId: 'perl', uid: 'u2', name: 'Anton Berger-Steinmetz', email: 'anton.berger@perl.at', role: 'Mitarbeiter', active: true, weeklyTargetHours: 38.5, yearlyVacationDays: 25, appStartDate: '2025-03-01', workDays: [1, 2, 3, 4, 5] },
  { id: 'u3', companyId: 'perl', uid: 'u3', name: 'Michaela Wagner', email: 'm.wagner@perl.at', role: 'Buchhaltung', active: true, weeklyTargetHours: 30, yearlyVacationDays: 25, appStartDate: '2024-09-01', workDays: [1, 2, 3, 4] },
  { id: 'u4', companyId: 'perl', uid: 'u4', name: 'Franz Hinterleitner', email: 'f.hinterleitner@perl.at', role: 'Projektleiter', active: true, weeklyTargetHours: 38.5, yearlyVacationDays: 25, appStartDate: '2023-05-17', workDays: [1, 2, 3, 4, 5] },
  // Runde 4: genug Leute für Raster, Gruppen und Lücken.
  { id: 'u5', companyId: 'perl', uid: 'u5', name: 'Lena Pichler', email: 'l.pichler@perl.at', role: 'Mitarbeiter', einstufung: 'lehrling', lehrbeginn: '2025-09-01', lehrzeitMonate: 36, active: true, weeklyTargetHours: 40, yearlyVacationDays: 25, appStartDate: '2025-09-01', workDays: [1, 2, 3, 4, 5] },
  { id: 'u6', companyId: 'perl', uid: 'u6', name: 'Stefan Gruber', email: 's.gruber@perl.at', role: 'Mitarbeiter', einstufung: 'obermonteur', active: true, weeklyTargetHours: 38.5, yearlyVacationDays: 25, appStartDate: '2022-02-01', workDays: [1, 2, 3, 4, 5] },
  { id: 'u7', companyId: 'perl', uid: 'u7', name: 'Jürgen Fasching', email: 'j.fasching@perl.at', role: 'Mitarbeiter', einstufung: 'helfer', active: true, weeklyTargetHours: 38.5, yearlyVacationDays: 25, appStartDate: '2024-04-02', workDays: [1, 2, 3, 4, 5] },
];

export const kunden = [
  { id: 'k1', companyId: 'perl', name: 'Wohnungseigentümergemeinschaft Hauptstraße 112–118', address: 'Hauptstraße 112–118, 2700 Wiener Neustadt', contactName: 'Hausverwaltung Mayrhofer', contactPhone: '0664 1234567', email: 'office@hv-mayrhofer.at', vatId: 'ATU87654321', active: true },
  { id: 'k2', companyId: 'perl', name: 'Gemeinde Neudorf bei Wiener Neustadt', address: 'Rathausplatz 1, 2620 Neunkirchen', contactPhone: '+43 2635 12345', active: true },
  { id: 'k3', companyId: 'perl', name: 'Familie Huber', address: 'Ringstraße 3', contactPhone: '0699 9876543', active: true },
];

export const baustellen = [
  { id: 'p1', companyId: 'perl', projectNumber: 'B-2026-0147', customerId: 'k1', customerName: 'Wohnungseigentümergemeinschaft Hauptstraße 112–118', address: 'Hauptstraße 112–118, 2700 Wiener Neustadt', status: 'Aktiv', billingMode: 'Regie', estimatedHours: 240, contactName: 'Hausverwaltung Mayrhofer', contactPhone: '0664 1234567', description: 'Heizungstausch inkl. Verteiler und hydraulischem Abgleich', startDate: '2026-08-03', assignedEmployees: ['u1', 'u2'], projectManagers: ['u4'] },
  { id: 'p2', companyId: 'perl', projectNumber: 'B-2026-0148', customerId: 'k2', customerName: 'Gemeinde Neudorf bei Wiener Neustadt', address: 'Rathausplatz 1, 2620 Neunkirchen', status: 'Aktiv', billingMode: 'Pauschal', estimatedHours: 80, contactPhone: '+43 2635 12345' },
  { id: 'p3', companyId: 'perl', projectNumber: 'B-2026-0149', customerId: 'k3', customerName: 'Familie Huber', address: 'Ringstraße 3', status: 'Pausiert', estimatedHours: 40 },
];

export const zeiten = [
  { id: 't1', companyId: 'perl', date: HEUTE, status: 'Anwesend', startTime: '07:00', endTime: '16:30', breakDuration: 30, travelTime: 45, projectNumber: 'B-2026-0147', customerName: 'Wohnungseigentümergemeinschaft Hauptstraße 112–118', userId: 'u1', userName: 'Max Mustermann', comment: 'Verteiler gesetzt, Steigleitungen gespült', isNightWork: true, isEmergency: true, vehiclePlate: 'WN-123XY' },
  { id: 't2', companyId: 'perl', date: '2026-09-17', status: 'Anwesend', startTime: '07:30', endTime: '17:00', breakDuration: 45, projectNumber: 'B-2026-0148', customerName: 'Gemeinde Neudorf bei Wiener Neustadt', userId: 'u1', userName: 'Max Mustermann', helperName: 'Anton Berger-Steinmetz' },
  { id: 't3', companyId: 'perl', date: '2026-09-16', status: 'Krank', userId: 'u1', userName: 'Max Mustermann' },
  { id: 't4', companyId: 'perl', date: '2026-09-15', status: 'Urlaub', userId: 'u1', userName: 'Max Mustermann' },
  /*
    RUNDE 4: der laufende Monat bis gestern — vollständig bei Stefan, mit
    Lücken bei Anton und Jürgen, mit Berufsschule und zwei Buchungen an einem
    Tag bei Lena, mit Krank und Zeitausgleich bei Stefan.
  */
  ...WERKTAGE_BIS_GESTERN.flatMap((d, i) => {
    const b = (id: string, uid: string, name: string, x: Record<string, unknown>) => ({ id: `${id}-${d}`, companyId: 'perl', date: d, userId: uid, userName: name, ...x });
    const arbeit = { status: 'Anwesend', startTime: '07:00', endTime: '15:30', breakDuration: 30, projectNumber: 'B-2026-0147', customerName: 'Wohnungseigentümergemeinschaft Hauptstraße 112–118' };
    const liste = [
      i === 2 ? b('s', 'u6', 'Stefan Gruber', { status: 'Krank' }) : i === 4 ? b('s', 'u6', 'Stefan Gruber', { status: 'Zeitausgleich' }) : b('s', 'u6', 'Stefan Gruber', arbeit),
      i % 5 === 0 ? b('l', 'u5', 'Lena Pichler', { status: 'Berufsschule' }) : b('l', 'u5', 'Lena Pichler', { ...arbeit, startTime: '07:00', endTime: '11:30', breakDuration: 0 }),
    ];
    if (i % 5 !== 0) liste.push(b('l2', 'u5', 'Lena Pichler', { ...arbeit, startTime: '12:00', endTime: i === 1 ? '17:30' : '15:30', breakDuration: 0, projectNumber: 'B-2026-0148', customerName: 'Gemeinde Neudorf bei Wiener Neustadt' }));
    if (i !== 1 && i !== 3) liste.push(b('a', 'u2', 'Anton Berger-Steinmetz', { ...arbeit, endTime: '16:00' }));
    if (i < 2) liste.push(b('j', 'u7', 'Jürgen Fasching', arbeit));
    return liste;
  }),
];

export const bestellungen = [
  { id: 'o1', companyId: 'perl', materialId: 'm1', materialName: 'Kupferrohr 22 mm, Stange 5 m, hart', quantity: 12, status: 'Offen', transactionType: 'order', userId: 'u2', userName: 'Anton Berger-Steinmetz', projectNumber: 'B-2026-0147', isUrgent: true, note: 'Wird morgen früh auf der Baustelle gebraucht', createdAt: Date.now() - 3600000 },
  { id: 'o2', companyId: 'perl', materialId: 'm2', materialName: 'Thermostatventil Heimeier Eclipse DN15', quantity: 24, status: 'In Bearbeitung', transactionType: 'order', userId: 'u1', userName: 'Max Mustermann', projectNumber: 'B-2026-0148', createdAt: Date.now() - 86400000 },
  { id: 'o3', companyId: 'perl', materialId: 'm3', materialName: 'Dichtungsmaterial Sortiment', quantity: 3, status: 'Abholbereit', transactionType: 'return', condition: 'unbenutzt', userId: 'u2', userName: 'Anton Berger-Steinmetz', createdAt: Date.now() - 172800000 },
];

export const materialien = [
  { id: 'm1', companyId: 'perl', name: 'Kupferrohr 22 mm, Stange 5 m, hart', category: 'Rohrleitungen', stock: 4, articleNumber: 'CU-22-5H', unit: 'Stk', verkaufspreis: 38.9, einkaufspreis: 24.1 },
  { id: 'm2', companyId: 'perl', name: 'Thermostatventil Heimeier Eclipse DN15', category: 'Armaturen', stock: 120, articleNumber: 'HEI-ECL-15', unit: 'Stk', verkaufspreis: 42.5, einkaufspreis: 27.8 },
  { id: 'm3', companyId: 'perl', name: 'Dichtungsmaterial Sortiment', category: 'Kleinmaterial', stock: 0, articleNumber: 'DICHT-SORT', unit: 'Pkg', verkaufspreis: 12.4, einkaufspreis: 6.2 },
];

export const rechnungen = [
  { id: 'r1', companyId: 'perl', invoiceNumber: '2026-0231', projectNumber: 'B-2026-0147', customerName: 'Wohnungseigentümergemeinschaft Hauptstraße 112–118', invoiceDate: '2026-08-14', dueDate: '2026-09-13', totalNetto: 18420.5, totalVat: 3684.1, totalBrutto: 22104.6, paymentStatus: 'Überfällig', mahnstufe: 1, gemahntAm: '2026-09-15', mahnfrist: '2026-09-29', vatRate: 0.2, address: 'Hauptstraße 112–118, 2700 Wiener Neustadt', positions: [{ label: 'Heizungstausch inkl. Verteiler', qty: 1, unit: 'pausch', unitPrice: 18420.5, netto: 18420.5 }] },
  { id: 'r2', companyId: 'perl', invoiceNumber: '2026-0232', projectNumber: 'B-2026-0148', customerName: 'Gemeinde Neudorf bei Wiener Neustadt', invoiceDate: '2026-09-01', dueDate: '2026-10-01', totalNetto: 6240, totalVat: 1248, totalBrutto: 7488, paymentStatus: 'Offen', vatRate: 0.2 },
  { id: 'r3', companyId: 'perl', invoiceNumber: '2026-0230', projectNumber: 'B-2026-0149', customerName: 'Familie Huber', invoiceDate: '2026-07-20', dueDate: '2026-08-19', totalNetto: 1180, totalVat: 236, totalBrutto: 1416, paymentStatus: 'Bezahlt', vatRate: 0.2 },
];

export const scheine = [
  { id: 's1', companyId: 'perl', projectNumber: 'B-2026-0147', customerName: 'Wohnungseigentümergemeinschaft Hauptstraße 112–118', address: 'Hauptstraße 112–118, 2700 Wiener Neustadt', datum: HEUTE, status: 'Entwurf', abrechnung: 'Regie', zeiten: [{ mitarbeiterUid: 'u1', mitarbeiterName: 'Max Mustermann', minuten: 510, stunden: 8.5, istHelfer: false }], material: [{ name: 'Kupferrohr 22 mm, Stange 5 m, hart', menge: 6, einheit: 'Stk' }], erstelltVonUid: 'u1', erstelltVonName: 'Max Mustermann', createdAt: Date.now() - 7200000 },
  { id: 's2', companyId: 'perl', projectNumber: 'B-2026-0148', customerName: 'Gemeinde Neudorf bei Wiener Neustadt', datum: '2026-09-16', status: 'Unterschrieben', abrechnung: 'Pauschal', zeiten: [], material: [], erstelltVonUid: 'u1', erstelltVonName: 'Max Mustermann', unterschriebenAm: Date.now() - 172800000, createdAt: Date.now() - 180000000 },
];

export const urlaube = [
  { id: 'v1', companyId: 'perl', userId: 'u2', userName: 'Anton Berger-Steinmetz', von: '2026-10-05', bis: '2026-10-16', tage: 10, status: 'Beantragt', notiz: 'Herbsturlaub mit der Familie', createdAt: Date.now() - 86400000 },
  { id: 'v2', companyId: 'perl', userId: 'u1', userName: 'Max Mustermann', von: '2026-09-15', bis: '2026-09-15', tage: 1, status: 'Genehmigt', entschiedenVonName: 'Franz Hinterleitner', createdAt: Date.now() - 900000000 },
];

export const einsaetze = [
  { id: 'a1', companyId: 'perl', date: HEUTE, projectNumber: 'B-2026-0147', userId: 'u1', userName: 'Max Mustermann', comment: 'Verteiler, Vormittag' },
  { id: 'a2', companyId: 'perl', date: HEUTE, projectNumber: 'B-2026-0148', userId: 'u2', userName: 'Anton Berger-Steinmetz', asHelper: true },
  /*
    RUNDE 4: eine Woche mit Mehrtageseinsätzen (Balken im Monat), zwei
    Einsätzen an einem Tag (Stefan am Mittwoch), einem Notdienst am Samstag
    und einem Eingeteilten, der krank ist (Jürgen am Donnerstag).
  */
  ...[0, 1, 2].map((n) => ({ id: `r4-s${n}`, companyId: 'perl', date: tag(n), projectNumber: 'B-2026-0147', userId: 'u6', userName: 'Stefan Gruber', startTime: '07:00', endTime: '15:30', comment: 'Steigleitung Stiege 2' })),
  { id: 'r4-s2b', companyId: 'perl', date: tag(2), projectNumber: 'B-2026-0148', userId: 'u6', userName: 'Stefan Gruber', startTime: '16:00', endTime: '18:00' },
  ...[0, 1, 2, 3].map((n) => ({ id: `r4-l${n}`, companyId: 'perl', date: tag(n), projectNumber: 'B-2026-0148', userId: 'u5', userName: 'Lena Pichler', asHelper: true })),
  ...[1, 2, 3].map((n) => ({ id: `r4-j${n}`, companyId: 'perl', date: tag(n), projectNumber: 'B-2026-0147', userId: 'u7', userName: 'Jürgen Fasching', asHelper: true })),
  { id: 'r4-not', companyId: 'perl', date: tag(5), projectNumber: 'B-2026-0148', userId: 'u1', userName: 'Max Mustermann', startTime: '08:00', endTime: '12:00', comment: 'Notdienst Rohrbruch' },
  ...[7, 8, 9, 10].map((n) => ({ id: `r4-n${n}`, companyId: 'perl', date: tag(n), projectNumber: 'B-2026-0147', userId: 'u6', userName: 'Stefan Gruber', startTime: '07:00', endTime: '15:30' })),
];

/** Wer abwesend ist (`wochenplan_abwesend`): Jürgen krank am Donnerstag, Anton im Urlaub ab nächster Woche. */
export const abwesend = [
  { userId: 'u7', von: tag(3), bis: tag(3), grund: 'Krank', zeiten: null },
  { userId: 'u2', von: tag(7), bis: tag(11), grund: 'Urlaub', zeiten: null },
  { userId: 'u5', von: tag(4), bis: tag(4), grund: 'Berufsschule', zeiten: null },
];

/*
  TERMINE (Runde 4): eine Lieferung an einer Baustelle mit Einsatz, eine
  Lieferung, bei der niemand dort ist, eine Besichtigung nur am Kunden und
  eine Abnahme mit der Projektleitung (nicht im Raster).
*/
export const termine = [
  { id: 'tm1', companyId: 'perl', art: 'Lieferung', datum: tag(1), zeitVon: '08:00', zeitBis: '10:00', projectNumber: 'B-2026-0147', teilnehmer: ['u6'], ortName: 'Wohnungseigentümergemeinschaft Hauptstraße 112–118', ortAdresse: 'Hauptstraße 112–118, 2700 Wiener Neustadt', notiz: 'Heizkörper, 2 Paletten' },
  { id: 'tm2', companyId: 'perl', art: 'Lieferung', datum: tag(4), zeitVon: '07:00', zeitBis: '09:00', projectNumber: 'B-2026-0149', teilnehmer: [], ortName: 'Familie Huber', ortAdresse: 'Ringstraße 3' },
  { id: 'tm3', companyId: 'perl', art: 'Besichtigung', datum: tag(2), zeitVon: '14:00', zeitBis: '15:00', customerId: 'k3', teilnehmer: ['u1'], ortName: 'Familie Huber', ortAdresse: 'Ringstraße 3' },
  { id: 'tm4', companyId: 'perl', art: 'Abnahme', datum: tag(3), zeitVon: null, zeitBis: null, projectNumber: 'B-2026-0148', teilnehmer: ['u4'], ortName: 'Gemeinde Neudorf bei Wiener Neustadt', ortAdresse: 'Rathausplatz 1, 2620 Neunkirchen' },
];

/** Eine Rüstliste für den Einsatz von heute — halb eingeladen, damit beide Zustände zu sehen sind. */
export const ruestlisten = [
  {
    id: 'r1', companyId: 'perl', date: HEUTE, projectNumber: 'B-2026-0147', uids: ['u1'],
    positionen: [
      { id: 'p1', materialId: 'm1', name: 'Kupferrohr 22 mm, Stange 5 m, hart', menge: 6, einheit: 'Stk' },
      { id: 'p2', name: 'Leihgerät Rohrkamera', menge: 1 },
    ],
    geladen: { p1: { von: 'Max Mustermann', am: Date.now() - 3600000 } },
  },
];

export const angebote = [
  { id: 'q1', companyId: 'perl', quoteNumber: 'A-2026-0088', customerId: 'k1', customerName: 'Wohnungseigentümergemeinschaft Hauptstraße 112–118', address: 'Hauptstraße 112–118, 2700 Wiener Neustadt', quoteDate: '2026-09-01', validUntil: '2026-10-01', status: 'Versendet', positions: [{ label: 'Heizungstausch inkl. Verteiler und hydraulischem Abgleich', qty: 1, unit: 'pausch', unitPrice: 18400, netto: 18400 }], subtotalNetto: 18400, totalNetto: 18400, totalVat: 3680, totalBrutto: 22080, vatRate: 0.2, kalkulierteStunden: 240 },
  { id: 'q2', companyId: 'perl', quoteNumber: 'A-2026-0089', customerId: 'k3', customerName: 'Familie Huber', quoteDate: '2026-09-10', validUntil: '2026-10-10', status: 'Entwurf', positions: [], subtotalNetto: 0, totalNetto: 0, totalVat: 0, totalBrutto: 0, vatRate: 0.2, kalkulierteStunden: 0 },
];

export const wartungen = [
  { id: 'w1', companyId: 'perl', customerId: 'k1', customerName: 'Wohnungseigentümergemeinschaft Hauptstraße 112–118', anlage: 'Gasbrennwertkessel Vaillant ecoTEC plus VC 206', address: 'Hauptstraße 112–118, 2700 Wiener Neustadt', intervallMonate: 12, zuletztAm: '2025-09-20', faelligAm: '2026-09-20', aktiv: true, hinweis: 'Schlüssel bei der Hausverwaltung abholen' },
  { id: 'w2', companyId: 'perl', customerId: 'k2', customerName: 'Gemeinde Neudorf bei Wiener Neustadt', anlage: 'Wärmepumpe', intervallMonate: 24, faelligAm: '2027-03-01', aktiv: true },
];

/** Eine VIES-Abfrage zum ersten Kunden (UID ATU87654321). */
export const uidPruefungen = [
  {
    id: '1', customerId: 'k1', uid: 'ATU87654321', gueltig: true,
    name: 'WOHNUNGSEIGENTÜMERGEMEINSCHAFT HAUPTSTRASSE 112-118', adresse: 'Hauptstraße 112\nAT-2700 Wiener Neustadt',
    abfrageId: 'WAPIAAAAZ8Cq1x2b', eigeneUid: 'ATU12345678',
    abgefragtAm: Date.parse('2026-10-02T08:15:00Z'), durch: 'u3', durchName: 'Erna Buchhalter',
    am: Date.parse('2026-10-02T08:15:01Z'),
  },
];

/** Das eigene Kalender-Abo — eingerichtet, zuletzt vor einer Stunde abgeholt. */
export const kalenderAbo = { angelegtAm: Date.parse('2026-10-01T06:00:00Z'), zuletztAbgerufen: Date.parse('2026-10-02T20:15:00Z') };
