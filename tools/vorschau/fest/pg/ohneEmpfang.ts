/* Vorschau: Ausgangsfach ohne Wirkung. */
export const lagerEinreichen = () => undefined;
export const ausgangsfachKonto = () => undefined;
export const anlegenOhneEmpfang = async () => ({ art: 'gesendet' });
export const aendernOhneEmpfang = async () => ({ art: 'gesendet' });
export const nachsendenJetzt = async () => ({ gesendet: 0, offen: 0, abgelehnt: 0 });
export const offeneVormerkungen = async () => 0;
