/**
 * Welche Spalten nicht so bei der App ankommen, wie sie in der Datenbank stehen.
 *
 * ERZEUGT AUS DEM SCHEMA, nicht von Hand gepflegt —
 * `tests/supabase/spaltentypen.test.ts` vergleicht diese Datei mit der
 * echten Datenbank und fällt, wenn sie auseinanderlaufen.
 *
 * GEMESSEN, NICHT VERMUTET. Nachgesehen wurde, was die REST-Schnittstelle
 * tatsächlich liefert; genau zwei Typen weichen ab:
 *
 *   zeitpunkt  `timestamptz` → "2026-09-11T22:09:23.036724+00:00".
 *              Die App-Typen sagen `number` (Millisekunden seit 1970) — so
 *              lagen sie in Firestore, und so rechnet jede Anzeige damit.
 *
 *   uhrzeit    `time` → "07:00:00". Die App erwartet "07:00": das ist es,
 *              was ein `<input type="time">` liefert und annimmt, und was
 *              auf dem Handwerksschein steht.
 *
 * NICHT dabei: `numeric`, `integer`, `bigint`. Die kommen bereits als
 * JavaScript-Zahl an. Eine Umrechnung dafür wäre ein erfundenes Risiko —
 * zweimal umgerechnet ist schlimmer als gar nicht.
 *
 * Nach der Wertform zu raten wäre der naheliegende Kurzschluss und wäre
 * falsch: ein Freitextfeld, in dem "2026-03-02T10:00:00Z" steht, würde zur
 * Zahl.
 */

export type Spaltenart = 'zeitpunkt' | 'uhrzeit';

export const SPALTENTYPEN: Record<string, Record<string, Spaltenart>> = {
  assignments: { created_at: 'zeitpunkt', updated_at: 'zeitpunkt' },
  /*
    Die App liest diese Tabelle nie — sie gehört der Ausleitung und ist nur
    mit dem Dienstschlüssel erreichbar. Die Zeile steht trotzdem hier, weil
    die Karte das SCHEMA abbildet und nicht die Lesegewohnheiten: eine
    Lücke darin sähe aus wie ein Versäumnis und wäre beim nächsten Leser
    eine Frage statt einer Auskunft.
  */
  ausleitung_dateien: { gesichert_am: 'zeitpunkt' },
  betriebsanlagen: { angelegt_am: 'zeitpunkt' },
  buchungskonten: { created_at: 'zeitpunkt', updated_at: 'zeitpunkt' },
  companies: { created_at: 'zeitpunkt', updated_at: 'zeitpunkt' },
  customers: { created_at: 'zeitpunkt', updated_at: 'zeitpunkt' },
  datanorm_laeufe: { abgeschlossen_am: 'zeitpunkt', created_at: 'zeitpunkt' },
  einsatz_material: { created_at: 'zeitpunkt', updated_at: 'zeitpunkt' },
  follow_ups: { created_at: 'zeitpunkt', updated_at: 'zeitpunkt' },
  invoices: { cancelled_at: 'zeitpunkt', created_at: 'zeitpunkt', updated_at: 'zeitpunkt' },
  material_orders: { created_at: 'zeitpunkt', updated_at: 'zeitpunkt' },
  material_prices: { created_at: 'zeitpunkt', updated_at: 'zeitpunkt' },
  materials: { created_at: 'zeitpunkt', updated_at: 'zeitpunkt' },
  number_counters: { updated_at: 'zeitpunkt' },
  platform_admins: { created_at: 'zeitpunkt' },
  project_documents: { created_at: 'zeitpunkt' },
  projects: { created_at: 'zeitpunkt', updated_at: 'zeitpunkt' },
  quotes: { created_at: 'zeitpunkt', updated_at: 'zeitpunkt' },
  rabattsaetze: { created_at: 'zeitpunkt', updated_at: 'zeitpunkt' },
  support_freigaben: { created_at: 'zeitpunkt', gilt_bis: 'zeitpunkt', widerrufen_am: 'zeitpunkt' },
  support_zugriffe: { wann: 'zeitpunkt' },
  suppliers: { created_at: 'zeitpunkt', updated_at: 'zeitpunkt' },
  system_laeufe: { updated_at: 'zeitpunkt', zuletzt_erfolg: 'zeitpunkt', zuletzt_versuch: 'zeitpunkt' },
  time_entries: { created_at: 'zeitpunkt', end_time: 'uhrzeit', start_time: 'uhrzeit', updated_at: 'zeitpunkt' },
  user_prefs: { updated_at: 'zeitpunkt' },
  users: { created_at: 'zeitpunkt', updated_at: 'zeitpunkt' },
  vacations: { created_at: 'zeitpunkt', entschieden_am: 'zeitpunkt', updated_at: 'zeitpunkt' },
  wartungen: { created_at: 'zeitpunkt', updated_at: 'zeitpunkt' },
  work_sheet_hours: { bis: 'uhrzeit', von: 'uhrzeit' },
  zahlungseingaenge: { created_at: 'zeitpunkt', updated_at: 'zeitpunkt' },
  work_sheet_photos: { geraet_zeit: 'zeitpunkt' },
  work_sheets: { created_at: 'zeitpunkt', unterschrieben_am: 'zeitpunkt', updated_at: 'zeitpunkt' },
};
