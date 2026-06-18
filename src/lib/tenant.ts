import type { Company } from '@/types';

/**
 * Wendet das Mandanten-Branding über CSS-Variablen an (vgl. Spec §7.3).
 * Das Design-System liest diese Tokens — nichts ist kundenspezifisch
 * hartkodiert. brand = Primärfarbe, accent = Aktions-/Hervorhebungsfarbe.
 */
export function applyBranding(
  company: Pick<
    Company,
    'brandColor' | 'brandForeground' | 'accentColor' | 'accentForeground' | 'name'
  >,
) {
  const root = document.documentElement;
  const set = (token: string, value?: string) => {
    if (value) root.style.setProperty(token, value);
  };
  set('--brand', company.brandColor);
  set('--brand-fg', company.brandForeground);
  set('--accent', company.accentColor);
  set('--accent-fg', company.accentForeground);
  if (company.name) document.title = company.name;
}
