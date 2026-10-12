/** Das Kürzel statt einer Vorschau — nach dem Typ, nicht nach der Endung. */
export function kuerzelFuer(mime: string): string {
  if (mime === 'application/pdf') return 'PDF';
  if (mime.startsWith('image/')) return 'BILD';
  if (mime.includes('word')) return 'WORD';
  if (mime.includes('excel') || mime.includes('spreadsheet')) return 'EXCEL';
  if (mime === 'message/rfc822' || mime.includes('outlook')) return 'MAIL';
  return 'DATEI';
}
