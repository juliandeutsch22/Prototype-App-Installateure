import { abfragen } from './kern';

export interface Mahnbeleg {
  id: string;
  companyId: string;
  invoiceId: string;
  invoiceNumber: string;
  stufe: number;
  datum: string;
  frist: string;
  spesen: number;
  pdfBase64: string;
}

export function listMahnbelegeImZeitraum(companyId: string, von: string, bis: string) {
  return abfragen<Mahnbeleg>('mahnbelege', companyId, {
    wo: [{ art: 'ab', feld: 'datum', wert: von }, { art: 'bis', feld: 'datum', wert: bis }],
    sortiere: { feld: 'datum' },
  });
}

/** Nur Metadaten: eine frühere Stufe außerhalb des Archivjahrs darf nicht als fehlend gelten. */
export function listMahnbelegStufen(companyId: string) {
  return abfragen<Pick<Mahnbeleg, 'id' | 'invoiceNumber' | 'stufe'>>('mahnbelege', companyId, {
    felder: ['id', 'invoiceNumber', 'stufe'],
  });
}
