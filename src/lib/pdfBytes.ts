/** FileReader funktioniert auch in den älteren Safari-Versionen des Bauziels. */
export function pdfBytes(blob: Blob): Promise<Uint8Array> {
  return new Promise((fertig, fehler) => {
    const leser = new FileReader();
    leser.onload = () => fertig(new Uint8Array(leser.result as ArrayBuffer));
    leser.onerror = () => fehler(leser.error ?? new Error('Das PDF konnte nicht gelesen werden.'));
    leser.readAsArrayBuffer(blob);
  });
}

export function pdfBase64(blob: Blob): Promise<string> {
  return new Promise((fertig, fehler) => {
    const leser = new FileReader();
    leser.onload = () => fertig(String(leser.result).slice(String(leser.result).indexOf(',') + 1));
    leser.onerror = () => fehler(leser.error ?? new Error('Das PDF konnte nicht gelesen werden.'));
    leser.readAsDataURL(blob);
  });
}

/** Base64 enthält Binärbytes, keinen UTF-8-Text. */
export function bytesAusBase64(s: string): Uint8Array {
  return Uint8Array.from(atob(s), (c) => c.charCodeAt(0));
}
