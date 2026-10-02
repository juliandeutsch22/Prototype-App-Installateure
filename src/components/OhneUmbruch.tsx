/**
 * TEXT, DER NICHT AM BINDESTRICH UMBRICHT (Nachtest 01.10.2026, U8).
 *
 * „PR-2026-“ am Zeilenende und „0189“ darunter, „(Claude-“ und „Test)“: der
 * Browser darf nach jedem Bindestrich umbrechen. Kurze Wörter mit Bindestrich
 * — Projekt-, Rechnungs- und Angebotsnummern, Doppelnamen — werden deshalb
 * als Ganzes gehalten. Lange bleiben umbrechbar; sie liefen sonst aus der
 * Zeile.
 */
const MIT_STRICH = /(\S*\w-\w\S*)/;
const HOECHSTENS = 24;

export default function OhneUmbruch({ text }: { text: string | null | undefined }) {
  if (!text) return null;
  const teile = text.split(MIT_STRICH);
  if (teile.length === 1) return <>{text}</>;
  return (
    <>
      {teile.map((t, i) =>
        i % 2 === 1 && t.length <= HOECHSTENS ? (
          <span key={i} className="nr">{t}</span>
        ) : (
          t
        ),
      )}
    </>
  );
}
