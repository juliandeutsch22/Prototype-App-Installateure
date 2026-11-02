export const funktionen = Object.freeze([
  'einsatzplanung', 'zeiterfassung', 'handwerksscheine',
  'kunden-baustellen', 'material-lager', 'angebote-rechnungen'
]);
export const publicFiles = new Map([
  ['/', '/index.html'],
  ...['landingpage.css', 'landingpage.js', 'tarife.js', 'kontakt.js', 'effekte.js', 'robots.txt', 'sitemap.xml'].map(file => ['/' + file, '/' + file]),
  ...funktionen.map(slug => ['/' + slug + '/', '/' + slug + '/index.html'])
]);
export function publicRedirect(pathname, search = '', host = '') {
  let target = pathname;
  if (pathname === '/index.html') target = '/';
  for (const slug of funktionen) {
    if (pathname === '/' + slug || pathname === '/' + slug + '/index.html') target = '/' + slug + '/';
  }
  if (/^www\.senklot\.at(?::\d+)?$/i.test(host)) return 'https://senklot.at' + target + search;
  return target === pathname ? null : target + search;
}
