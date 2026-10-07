import React from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import App from './app/App';
import { ToastProvider } from './components/Toast';
import NeueFassung from './components/NeueFassung';
import VerloreneBuchung from './components/VerloreneBuchung';
import Nachsender from './components/Nachsender';
import { nachladefehlerBeobachten } from './lib/nachladen';
import { fehlerBeobachten } from './lib/fehlerprotokoll';
import { schluesselUmziehen, firestoreResteEntfernen } from './lib/speicher';
import { darstellungAnwenden } from './lib/darstellung';
// Poppins self-gehostet (kein Google-CDN -> keine IP-Übermittlung an Google, DSGVO).
// Nur die zwei Schnitte der Linie „Lot“ (400 und 600) — der Erstaufruf auf der
// Baustelle (schlechtes Netz) bleibt damit schlank.
import '@fontsource/poppins/latin-400.css';
import '@fontsource/poppins/latin-600.css';
import './index.css';

// Die Schlüssel im Browser heissen nach dem Produkt, nicht nach dem
// Pilotbetrieb; Reste der Firestore-Zeit gehen (Testbericht 30.09.2026, M9).
// Vor allem anderen: die Anmeldung liest ihren Merker gleich beim Start.
schluesselUmziehen();
darstellungAnwenden();
void firestoreResteEntfernen();

// Scheitert nach einem Deploy das Nachladen einer Ansicht, einmal neu laden —
// bevor daraus eine Fehlertafel wird. Siehe lib/nachladen.ts.
nachladefehlerBeobachten();

// Was an der Fehlergrenze vorbeigeht — ein Fehler in einem Klick, ein
// unbehandeltes Versprechen — ins eigene Protokoll. Siehe lib/fehlerprotokoll.ts.
fehlerBeobachten();

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <BrowserRouter>
      <ToastProvider>
        <App />
        {/* Meldet sich nur, wenn nach dem Start eine neue Fassung eintrifft. */}
        <NeueFassung />
        {/* Meldet sich nur, wenn eine vorgemerkte Buchung doch verlorengeht. */}
        <VerloreneBuchung />
        {/* Sendet nach, was ohne Empfang vorgemerkt wurde. Ohne das läge es. */}
        <Nachsender />
      </ToastProvider>
    </BrowserRouter>
  </React.StrictMode>,
);
