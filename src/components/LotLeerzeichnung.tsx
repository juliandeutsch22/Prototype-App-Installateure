/** Kleine statische Lot-Zeichnung nur bei Erstnutzung, nicht bei Fehlern/Filtern. */
export default function LotLeerzeichnung({ art }: { art: 'baustelle' | 'angebot' }) {
  return <svg viewBox="0 0 148 100" fill="none" className="lot-leerzeichnung" aria-hidden="true" focusable="false">
    {art === 'baustelle' ? <>
      <path className="konstruktion" d="M17 82h114M26 16v70M122 16v70M22 26h8m-8 14h8m-8 14h8m-8 14h8M118 26h8m-8 14h8m-8 14h8m-8 14h8M44 25h20m20 0h20M43 80l12-17m38 17-12-17" />
      <path className="lot" strokeLinecap="round" strokeLinejoin="round" d="M74 14v28M71 47h6v5h-6zM68 56h12l6 8H62zM62 68h24L74 88z" />
    </> : <>
      <path className="konstruktion" d="M39 13h56l17 17v58H39zM95 13v17h17M51 41h35M51 52h47M51 63h30M51 74h38M29 22v65m-4-55h8m-8 16h8m-8 16h8m-8 16h8" />
      <path className="lot" strokeLinecap="round" strokeLinejoin="round" d="M102 42v15M99 61h6v4h-6zM97 69h10l4 5H93zM93 77h18l-9 14z" />
    </>}
  </svg>;
}
