// Nur lokal, nicht im Repository: alle Projekte der CI; „webkit-telefon“ mit denselben Wegen in Chromium (WebKit fehlt hier).
import basis from './playwright.config';
import { devices } from '@playwright/test';
const projekte = (basis.projects ?? []).map((p) =>
  p.name === 'webkit-telefon'
    ? { ...p, name: 'chromium-telefon', use: { ...devices['Pixel 7'], viewport: { width: 390, height: 844 } } }
    : p);
export default { ...basis, projects: projekte };
