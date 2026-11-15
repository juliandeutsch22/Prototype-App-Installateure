/**
 * DAS STYLESHEET EINSCHALTEN UND ABWARTEN (L10, 17.11.2026).
 *
 * Im Bau lädt das Stylesheet als `media="print"`, damit es das erste Bild
 * nicht sperrt und die Papierfarbe sofort steht (`startStilEinsetzen` in
 * `vite.config.ts`). Hier wird es auf alle Medien geschaltet; die App
 * zeichnet erst, wenn es geladen ist — sonst stünde sie einen Augenblick
 * ungestylt da. Scheitert es, zeichnet sie trotzdem: eine App ohne Stil ist
 * besser als eine, die auf ewig wartet. Ohne solches Stylesheet (Entwicklung,
 * Vorschau: dort bindet Vite die Stile selbst ein) gilt es sofort.
 */
export function hauptstilBereit(doc: Document = document): Promise<void> {
  const links = Array.from(doc.querySelectorAll<HTMLLinkElement>('link[data-hauptstil]'));
  return Promise.all(
    links.map(
      (l) =>
        new Promise<void>((fertig) => {
          l.addEventListener('load', () => fertig(), { once: true });
          l.addEventListener('error', () => fertig(), { once: true });
          l.media = 'all';
          // Schon geladen (nur noch nicht eingeschaltet): dann kommt kein `load` mehr.
          if (l.sheet) fertig();
        }),
    ),
  ).then(() => undefined);
}
