import React from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import App from './app/App';
import { ToastProvider } from './components/Toast';
import NeueFassung from './components/NeueFassung';
import VerloreneBuchung from './components/VerloreneBuchung';
import Nachsender from './components/Nachsender';
import { nachladefehlerBeobachten } from './lib/nachladen';
// Poppins self-gehostet (kein Google-CDN -> keine IP-Übermittlung an Google, DSGVO).
// Nur die tatsächlich genutzten Schnitte, damit der Erstaufruf auf der Baustelle
// (schlechtes Netz) schlank bleibt.
import '@fontsource/poppins/latin-400.css';
import '@fontsource/poppins/latin-500.css';
import '@fontsource/poppins/latin-600.css';
import '@fontsource/poppins/latin-700.css';
import './index.css';

// Scheitert nach einem Deploy das Nachladen einer Ansicht, einmal neu laden —
// bevor daraus eine Fehlertafel wird. Siehe lib/nachladen.ts.
nachladefehlerBeobachten();

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
