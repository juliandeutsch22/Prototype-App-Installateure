import type { Company } from '@/types';

/**
 * Wendet das Mandanten-Branding über CSS-Variablen an (vgl. Spec §7.3).
 * Ersetzt die früher hartkodierten "Perl"-Werte.
 */
export function applyBranding(company: Pick<Company, 'brandColor' | 'brandForeground' | 'name'>) {
  const root = document.documentElement;
  if (company.brandColor) {
    root.style.setProperty('--brand-color', company.brandColor);
  }
  if (company.brandForeground) {
    root.style.setProperty('--brand-fg', company.brandForeground);
  }
  if (company.name) {
    document.title = company.name;
  }
}
