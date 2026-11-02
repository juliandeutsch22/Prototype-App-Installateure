/* Progressive Ergänzung: kein Inhalt wird per CSS oder JavaScript versteckt. */
(() => {
  const motion = window.matchMedia('(prefers-reduced-motion: reduce)');
  if (typeof window.IntersectionObserver !== 'function' || typeof Element.prototype.animate !== 'function') return;
  const aktiv = new Map();
  const gesehen = new WeakSet();
  function beenden() {
    for (const animation of aktiv.values()) animation.finish();
    aktiv.clear();
  }
  const observer = new IntersectionObserver(eintraege => {
    for (const eintrag of eintraege) {
      if (!eintrag.isIntersecting) continue;
      const element = eintrag.target;
      observer.unobserve(element);
      if (gesehen.has(element)) continue;
      gesehen.add(element);
      if (motion.matches || document.visibilityState === 'hidden' || element.contains(document.activeElement)) continue;
      const animation = element.animate([
        { opacity: 0, transform: 'translateY(14px)' },
        { opacity: 1, transform: 'translateY(0)' }
      ], { duration: 480, easing: 'cubic-bezier(.2,.7,.2,1)' });
      aktiv.set(element, animation);
      animation.finished.then(() => aktiv.delete(element), () => aktiv.delete(element));
    }
  }, { threshold: 0.08 });
  document.querySelectorAll('[data-erscheinen]').forEach(element => observer.observe(element));
  motion.addEventListener('change', () => { if (motion.matches) beenden(); });
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'hidden') beenden(); });
  document.addEventListener('focusin', event => {
    for (const [element, animation] of aktiv) if (element.contains(event.target)) {
      animation.finish(); aktiv.delete(element);
    }
  });
  window.addEventListener('pagehide', beenden);
  window.addEventListener('pageshow', event => { if (event.persisted) beenden(); });
})();
