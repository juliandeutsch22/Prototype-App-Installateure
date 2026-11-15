/**
 * DIE SPALTEN EINES RECHNUNGSKOPFS FÜR LISTEN (L6, Durchsicht 15.11.2026) —
 * alle außer dem festgehaltenen Leistungsnachweis (`leistungsnachweis`,
 * G6): je Rechnung bis zu hunderte Zeilen Arbeitszeit, gebraucht nur für
 * Beleg, Nachdruck und Ersatz — die holen die ganze Rechnung
 * (`listInvoicesByIds`). Bei 300 offenen Rechnungen gemessen: Köpfe mit
 * Nachweis 1.005 KB, ohne 454 KB.
 *
 * Ausdrücklich aufgezählt, weil PostgREST kein „alle außer“ kennt. Kommt
 * eine Spalte dazu, gehört sie hierher — `rechnungKopfSpalten.test.ts`
 * vergleicht die Liste mit der Tabelle.
 */
export const KOPF_SPALTEN = [
  'id', 'company_id', 'invoice_number', 'project_number', 'project_id', 'customer_id', 'customer_name',
  'invoice_date', 'due_date', 'subtotal_netto', 'discount_mode', 'discount_value', 'discount_label',
  'discount_amount', 'total_netto', 'total_vat', 'total_brutto', 'vat_rate', 'reverse_charge', 'customer_vat_id',
  'address', 'leistung_von', 'leistung_bis', 'payment_status', 'cancellation_note', 'cancelled_at', 'mahnstufe',
  'gemahnt_am', 'mahnfrist', 'mahnspesen', 'created_at', 'updated_at', 'bezahlt_betrag', 'art', 'vorrechnungen',
  'gesamt_netto', 'gesamt_vat', 'gesamt_brutto', 'leistungsort', 'steuerbefreiung', 'storno_nummer', 'storno_am',
  'skonto_prozent', 'skonto_bis', 'skonto_betrag', 'bestellnummer', 'ruecklass_art', 'ruecklass_prozent',
  'ruecklass_betrag', 'ruecklass_bis', 'ruecklass_garantie_am', 'ruecklass_garantie_bank', 'ruecklass_garantie_nr',
  'ruecklass_garantie_bis', 'aussteller_stand', 'storno_aussteller_stand', 'mahnkosten_betrag', 'skonto_zugesagt',
  'erstellungsversuch', 'storno_bezahlt', 'material_je_ausgabe',
].join(',');
