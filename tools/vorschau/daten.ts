/*
 * Beispieldaten fuer die Vorschau.
 *
 * DIE NAMEN SIND ABSICHTLICH LANG. „Wohnungseigentümergemeinschaft
 * Hauptstraße 112–118" ist kein ausgedachter Extremfall, sondern die Sorte
 * Kundenname, die dieser Betrieb wirklich hat — und genau daran zeigen sich
 * Umbrueche. Wer hier „Meier GmbH" einsetzt, misst nichts mehr.
 */
export const HEUTE = new Date().toISOString().slice(0, 10);

export const firma = {
  id: 'perl', name: 'Perl Installationen GmbH',
  addressLine: 'Musterstrasse 1 · 2700 Wiener Neustadt',
  contactLine: 'Tel 02622 12345 · office@perl.at · www.perl.at',
  iban: 'AT12 3456 7890 1234 5678', bic: 'GIBAATWWXXX', bankName: 'Erste Bank',
  vatId: 'ATU12345678', companyRegister: 'FN 123456a',
  rates: { fach: 78, helper: 52, vatRate: 0.2, anfahrt: 45, nacht: 0.5, notdienst: 1 },
  costRates: { fach: 46, helper: 31 }, modules: {}, urlaubUebertrag: 'verjaehrung',
};

export const benutzer = [
  { id: 'u1', companyId: 'perl', uid: 'u1', name: 'Max Mustermann', email: 'max.mustermann@perl.at', role: 'Mitarbeiter', active: true, weeklyTargetHours: 40, yearlyVacationDays: 25, initialVacationDays: 25, appStartDate: '2026-01-08', workDays: [1, 2, 3, 4, 5] },
  { id: 'u2', companyId: 'perl', uid: 'u2', name: 'Anton Berger-Steinmetz', email: 'anton.berger@perl.at', role: 'Mitarbeiter', active: true, weeklyTargetHours: 38.5, yearlyVacationDays: 25, appStartDate: '2025-03-01', workDays: [1, 2, 3, 4, 5] },
  { id: 'u3', companyId: 'perl', uid: 'u3', name: 'Michaela Wagner', email: 'm.wagner@perl.at', role: 'Buchhaltung', active: true, weeklyTargetHours: 30, yearlyVacationDays: 25, appStartDate: '2024-09-01', workDays: [1, 2, 3, 4] },
  { id: 'u4', companyId: 'perl', uid: 'u4', name: 'Franz Hinterleitner', email: 'f.hinterleitner@perl.at', role: 'Projektleiter', active: true, weeklyTargetHours: 38.5, yearlyVacationDays: 25, appStartDate: '2023-05-17', workDays: [1, 2, 3, 4, 5] },
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
  { id: 's1', companyId: 'perl', projectNumber: 'B-2026-0147', customerName: 'Wohnungseigentümergemeinschaft Hauptstraße 112–118', address: 'Hauptstraße 112–118, 2700 Wiener Neustadt', datum: HEUTE, status: 'Entwurf', abrechnung: 'Regie', zeiten: [{ mitarbeiterUid: 'u1', mitarbeiterName: 'Max Mustermann', stunden: 8.5, istHelfer: false }], material: [{ name: 'Kupferrohr 22 mm, Stange 5 m, hart', menge: 6, einheit: 'Stk' }], erstelltVonUid: 'u1', erstelltVonName: 'Max Mustermann', createdAt: Date.now() - 7200000 },
  { id: 's2', companyId: 'perl', projectNumber: 'B-2026-0148', customerName: 'Gemeinde Neudorf bei Wiener Neustadt', datum: '2026-09-16', status: 'Unterschrieben', abrechnung: 'Pauschal', zeiten: [], material: [], erstelltVonUid: 'u1', erstelltVonName: 'Max Mustermann', unterschriebenAm: Date.now() - 172800000, createdAt: Date.now() - 180000000 },
];

export const urlaube = [
  { id: 'v1', companyId: 'perl', userId: 'u2', userName: 'Anton Berger-Steinmetz', von: '2026-10-05', bis: '2026-10-16', tage: 10, status: 'Beantragt', notiz: 'Herbsturlaub mit der Familie', createdAt: Date.now() - 86400000 },
  { id: 'v2', companyId: 'perl', userId: 'u1', userName: 'Max Mustermann', von: '2026-09-15', bis: '2026-09-15', tage: 1, status: 'Genehmigt', entschiedenVonName: 'Franz Hinterleitner', createdAt: Date.now() - 900000000 },
];

export const einsaetze = [
  { id: 'a1', companyId: 'perl', date: HEUTE, projectNumber: 'B-2026-0147', userId: 'u1', userName: 'Max Mustermann', comment: 'Verteiler, Vormittag' },
  { id: 'a2', companyId: 'perl', date: HEUTE, projectNumber: 'B-2026-0148', userId: 'u2', userName: 'Anton Berger-Steinmetz', asHelper: true },
];

export const angebote = [
  { id: 'q1', companyId: 'perl', quoteNumber: 'A-2026-0088', customerId: 'k1', customerName: 'Wohnungseigentümergemeinschaft Hauptstraße 112–118', address: 'Hauptstraße 112–118, 2700 Wiener Neustadt', quoteDate: '2026-09-01', validUntil: '2026-10-01', status: 'Versendet', positions: [{ label: 'Heizungstausch inkl. Verteiler und hydraulischem Abgleich', qty: 1, unit: 'pausch', unitPrice: 18400, netto: 18400 }], subtotalNetto: 18400, totalNetto: 18400, totalVat: 3680, totalBrutto: 22080, vatRate: 0.2, kalkulierteStunden: 240 },
  { id: 'q2', companyId: 'perl', quoteNumber: 'A-2026-0089', customerId: 'k3', customerName: 'Familie Huber', quoteDate: '2026-09-10', validUntil: '2026-10-10', status: 'Entwurf', positions: [], subtotalNetto: 0, totalNetto: 0, totalVat: 0, totalBrutto: 0, vatRate: 0.2, kalkulierteStunden: 0 },
];

export const wartungen = [
  { id: 'w1', companyId: 'perl', customerId: 'k1', customerName: 'Wohnungseigentümergemeinschaft Hauptstraße 112–118', anlage: 'Gasbrennwertkessel Vaillant ecoTEC plus VC 206', address: 'Hauptstraße 112–118, 2700 Wiener Neustadt', intervallMonate: 12, zuletztAm: '2025-09-20', faelligAm: '2026-09-20', aktiv: true, hinweis: 'Schlüssel bei der Hausverwaltung abholen' },
  { id: 'w2', companyId: 'perl', customerId: 'k2', customerName: 'Gemeinde Neudorf bei Wiener Neustadt', anlage: 'Wärmepumpe', intervallMonate: 24, faelligAm: '2027-03-01', aktiv: true },
];

export const folgetermine = [
  { id: 'f1', companyId: 'perl', projectNumber: 'B-2026-0147', title: 'Restarbeiten Verteiler und Dämmung nachziehen', dueWeek: '2026-W40', createdFrom: 'voice', done: false },
];
