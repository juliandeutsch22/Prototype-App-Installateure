/** Größe einer Datei, wie sie am Plan und in der Ablage steht: „840 KB“, „2,4 MB“. */
export function dateiGroesse(bytes: number): string {
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1).replace('.', ',')} MB`;
}
