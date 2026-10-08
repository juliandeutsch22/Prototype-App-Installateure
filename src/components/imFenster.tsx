import { createContext, type ReactNode } from 'react';

/**
 * Innerhalb eines Dialogs oder Fensters bleibt das „i“ an seinem Platz,
 * statt in „Hilfe zu dieser Seite“ zu wandern: das Fenster verdeckt den
 * Seitenkopf, die Hilfe wäre von dort aus nicht erreichbar.
 */
// eslint-disable-next-line react-refresh/only-export-components
export const ImFensterContext = createContext(false);

export function ImFenster({ children }: { children: ReactNode }) {
  return <ImFensterContext.Provider value>{children}</ImFensterContext.Provider>;
}
