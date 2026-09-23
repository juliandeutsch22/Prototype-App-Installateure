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
  /*
    DER TITEL BLEIBT „Senklot" (aus `index.html`). Hier stand
    `document.title = company.name` — der Browserreiter hiess damit
    „Perl Installationen GmbH", und iOS schlug beim „Zum Home-Bildschirm"
    genau diesen Titel als Namen der App vor. Wie der Betrieb heisst, steht
    im Kopf der App; der Name der App ist Senklot.
  */
}
