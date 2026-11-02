"""Erzeugt crawlbare HTML-Seiten ohne Laufzeit-Rendering oder zusätzliche Pakete."""
from pathlib import Path
from html import escape
from PIL import Image
import json, re, subprocess

ROOT = Path(__file__).resolve().parent.parent
DOMAIN = 'https://senklot.at'
VERSION = '20261102-seo2'
funktionen = json.loads((ROOT / 'werkzeuge/funktionen.json').read_text())
tarife = json.loads(subprocess.check_output(['node', '-e', 'process.stdout.write(JSON.stringify(require("./tarife.js").TARIFE))'], cwd=ROOT))
pfeil = '<svg class="linkpfeil" viewBox="0 0 16 16" width="12" height="12" fill="none" stroke="currentColor" stroke-width="1.5" aria-hidden="true"><path d="M4 12 12 4M4 4h8v8"/></svg>'
link_texte = {'einsatzplanung': 'Details zur Einsatzplanung', 'zeiterfassung': 'Details zur Zeiterfassung', 'handwerksscheine': 'Details zu digitalen Handwerksscheinen', 'kunden-baustellen': 'Details zu Kunden & Baustellen', 'material-lager': 'Details zu Material & Lager', 'angebote-rechnungen': 'Details zu Angeboten & Rechnungen'}
faq_titel = {'einsatzplanung': 'Fragen zur<br>Einsatzplanung.', 'zeiterfassung': 'Fragen zur<br>Zeiterfassung.', 'handwerksscheine': 'Fragen zu digitalen<br>Handwerksscheinen.', 'kunden-baustellen': 'Fragen zu Kunden<br>und Baustellen.', 'material-lager': 'Fragen zu Material<br>und Lager.', 'angebote-rechnungen': 'Fragen zu Angeboten<br>und Rechnungen.'}

def euro(cent):
    return f'{cent / 100:,.2f}'.replace(',', '_').replace('.', ',').replace('_', '.') + ' €'

def schema(slug='', name='Senklot – Software für Installationsbetriebe in Österreich', description=''):
    url = DOMAIN + ('/' + slug + '/' if slug else '/')
    graph = [
        {'@type': 'Organization', '@id': DOMAIN + '/#anbieter', 'name': 'Senklot', 'url': DOMAIN + '/', 'logo': DOMAIN + '/assets/senklot.svg', 'email': 'office@senklot.at', 'telephone': '+436606322503'},
        {'@type': 'WebSite', '@id': DOMAIN + '/#website', 'url': DOMAIN + '/', 'name': 'Senklot', 'inLanguage': 'de-AT', 'publisher': {'@id': DOMAIN + '/#anbieter'}},
        {'@type': 'WebPage', '@id': url + '#seite', 'url': url, 'name': name, 'description': description, 'inLanguage': 'de-AT', 'isPartOf': {'@id': DOMAIN + '/#website'}, 'about': {'@id': DOMAIN + '/#software'}}
    ]
    if not slug:
        offers = []
        for id, tarif in tarife.items():
            offers.append({'@type': 'Offer', 'name': tarif['name'], 'price': tarif['monatCent'] / 100, 'priceCurrency': 'EUR', 'url': DOMAIN + '/#tarif-' + id,
                'description': f"{tarif['nutzer']} Mitarbeiter / Nutzer. Monatliches Abonnement netto zuzüglich Umsatzsteuer. Einmalige Einrichtung {euro(tarif['einrichtungCent'])} netto. Bei jährlicher Vorauszahlung 10 % Rabatt nur auf das Abonnement.",
                'priceSpecification': {'@type': 'UnitPriceSpecification', 'price': tarif['monatCent'] / 100, 'priceCurrency': 'EUR', 'unitText': 'Monat', 'valueAddedTaxIncluded': False}})
        graph.append({'@type': 'SoftwareApplication', '@id': DOMAIN + '/#software', 'name': 'Senklot', 'url': DOMAIN + '/', 'applicationCategory': 'BusinessApplication', 'operatingSystem': 'Webbrowser', 'inLanguage': 'de-AT', 'description': description, 'publisher': {'@id': DOMAIN + '/#anbieter'}, 'featureList': [f['name'] for f in funktionen], 'offers': offers})
    else:
        graph.append({'@type': 'BreadcrumbList', 'itemListElement': [
            {'@type': 'ListItem', 'position': 1, 'name': 'Senklot', 'item': DOMAIN + '/'},
            {'@type': 'ListItem', 'position': 2, 'name': next(f['name'] for f in funktionen if f['slug'] == slug), 'item': url}
        ]})
    return {'@context': 'https://schema.org', '@graph': graph}

def head(title, description, slug='', prefix=''):
    url = DOMAIN + ('/' + slug + '/' if slug else '/')
    graph = json.dumps(schema(slug, title, description), ensure_ascii=False).replace('<', '\\u003c')
    return f'''<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <meta name="theme-color" content="#0f3c47">
  <title>{escape(title)}</title>
  <meta name="description" content="{escape(description, quote=True)}">
  <meta name="robots" content="index,follow,max-image-preview:large">
  <link rel="canonical" href="{url}">
  <link rel="icon" href="{prefix}assets/senklot.svg" type="image/svg+xml">
  <meta property="og:type" content="website">
  <meta property="og:locale" content="de_AT">
  <meta property="og:site_name" content="Senklot">
  <meta property="og:title" content="{escape(title, quote=True)}">
  <meta property="og:description" content="{escape(description, quote=True)}">
  <meta property="og:url" content="{url}">
  <meta property="og:image" content="{DOMAIN}/assets/senklot-vorschau.png">
  <meta property="og:image:width" content="1200">
  <meta property="og:image:height" content="630">
  <meta property="og:image:alt" content="Senklot – Betriebssoftware für Installationsbetriebe mit Einsatzplanung, Zeiterfassung und Abrechnung">
  <meta name="twitter:card" content="summary_large_image">
  <link rel="preload" href="{prefix}assets/poppins-400.woff2" as="font" type="font/woff2" crossorigin>
  <link rel="stylesheet" href="{prefix}landingpage.css?v={VERSION}">
  <script type="application/ld+json">{graph}</script>
</head>'''

home = (ROOT / 'vorlagen/startseite-vor-seo.html').read_text()
home = re.sub(r'<head>.*?</head>', lambda _: head('Senklot – Software für Installationsbetriebe in Österreich', 'Einsatzplanung, mobile Zeiterfassung, digitale Handwerksscheine und Abrechnung für Installationsbetriebe in Österreich. Senklot kennenlernen und Demo anfragen.'), home, flags=re.S)
home = home.replace('Plane dein Team, erfasse Leistungen vor Ort und behalte die Abrechnung im Blick. Senklot bringt deinen Arbeitsalltag zusammen.', 'Senklot ist die Betriebssoftware für Installationsbetriebe in Österreich. Plane dein Team, dokumentiere Leistungen vor Ort und behalte die Abrechnung im Blick.')
# Funktionslinks erweitern die bestehende Übersicht, ohne eine weitere Kartenreihe.
slugs = ['kunden-baustellen', 'einsatzplanung', 'zeiterfassung', 'handwerksscheine', 'material-lager', 'angebote-rechnungen']
start = home.index('<div class="funktionsliste">')
end = home.index('</section>', start)
block = home[start:end]
index = [0]
def link(match):
    slug = slugs[index[0]]; index[0] += 1
    label = next(f['name'] for f in funktionen if f['slug'] == slug)
    return match.group(0).replace('</div></article>', f'<a class="funktionslink" href="{slug}/">{escape(link_texte[slug])} {pfeil}</a></div></article>')
block = re.sub(r'<article>.*?</article>', link, block, flags=re.S)
home = home[:start] + block + home[end:]
# Jahrespreise bleiben auch ohne JavaScript als lesbare HTML-Inhalte verfügbar.
annual = '; '.join(f"{t['name']}: {euro(t['monatCent'] * 12 * 9 // 10)} jährlich im Voraus" for t in tarife.values())
faq = f'<details><summary>Wie funktioniert die jährliche Vorauszahlung?</summary><p>Bei jährlicher Vorauszahlung erhältst du genau 10 % Rabatt auf das Abonnement. {annual}. Alle Beträge netto zuzüglich gesetzlicher Umsatzsteuer. Die einmalige Einrichtung von 290 € für Starter, 590 € für Team und 990 € für Betrieb bleibt unverändert.</p></details>\n'
faq += '<details><summary>Wie beginnt die Einrichtung von Senklot?</summary><p>Frag eine persönliche Demo an. Dabei besprechen wir Nutzerzahl, benötigte Module und eure Abläufe. Die Anfrage ist unverbindlich und schließt kein Abonnement ab. Die einmaligen Einrichtungskosten sind in der Preisübersicht getrennt ausgewiesen.</p></details>\n'
home = home.replace('<div class="faq-liste">', '<div class="faq-liste">\n' + faq, 1)
home = re.sub(r'assets/([a-z-]+)\.png', r'assets/\1.webp', home)
home = home.replace('class="hero-text"', 'class="hero-text" data-erscheinen').replace('class="hero-bild"', 'class="hero-bild" data-erscheinen')
for cls in ['aussendienst-text', 'kontrollpunkte', 'rollenliste', 'kontakt-text']:
    home = home.replace(f'class="{cls}"', f'class="{cls}" data-erscheinen')
home = home.replace('<article><span class="nummer">', '<article data-erscheinen><span class="nummer">')
home = home.replace('<li><span class="schrittzahl">', '<li data-erscheinen><span class="schrittzahl">')
home = home.replace('<script src="', '<script defer src="')
for js in ['tarife.js', 'landingpage.js', 'kontakt.js']:
    home = home.replace(f'src="{js}"', f'src="{js}?v={VERSION}"')
home = home.replace('</body>', f'<script defer src="effekte.js?v={VERSION}"></script>\n</body>')
(ROOT / 'index.html').write_text(home)

header = re.search(r'<header.*?</header>', home, re.S).group(0)
header = header.replace('href="#"', 'href="../"').replace('href="#', 'href="../#')
footer = re.search(r'<footer.*?</footer>', home, re.S).group(0).replace('href="#"', 'href="../"')

for f in funktionen:
    target = ROOT / f['slug']; target.mkdir(exist_ok=True)
    with Image.open(ROOT / 'assets' / (f['image'] + '.webp')) as image:
        width, height = image.size
    mobile = width < height
    sections = ''.join(f'<article data-erscheinen><p class="nummer">0{i + 1}</p><div><h2>{escape(title)}</h2><p>{escape(text)}</p></div></article>' for i, (title, text) in enumerate(f['sections']))
    steps = ''.join(f'<li data-erscheinen><span class="schrittzahl">0{i + 1}</span><h3>{escape(title)}</h3><p>{escape(text)}</p></li>' for i, (title, text) in enumerate(f['steps']))
    faq = ''.join(f'<details><summary>{escape(q)}</summary><p>{escape(a)}</p></details>' for q, a in f['faq'])
    related = ''.join(f'<a href="../{slug}/">{escape(next(r["name"] for r in funktionen if r["slug"] == slug))} {pfeil}</a>' for slug in f['related'])
    html = f'''<!doctype html>
<html lang="de-AT">
{head(f['title'], f['description'], f['slug'], '../')}
<body class="funktionsseite">
<a class="skip" href="#inhalt">Zum Inhalt</a>
{header}
<main id="inhalt">
  <section class="detail-hero raster">
    <div class="wrap">
      <nav class="brotpfad" aria-label="Brotkrumennavigation"><a href="../">Senklot</a><span aria-hidden="true">/</span><span aria-current="page">{escape(f['name'])}</span></nav>
      <div class="detail-einstieg">
        <div data-erscheinen><p class="rubrik">SENKLOT / FUNKTIONEN</p><h1>{escape(f['name'])}</h1><p class="detail-leitsatz">{escape(f['headline'])}</p><p class="absatz">{escape(f['intro'])}</p><div class="aktionen"><a class="knopf" href="../#kontakt">Demo anfragen {pfeil}</a><a class="textlink" href="../#preise">Preise ansehen</a></div></div>
        <figure class="detail-bild{' detail-bild-mobil' if mobile else ''}" data-erscheinen><div class="app-fenster"><img src="../assets/{f['image']}.webp" alt="{escape(f['caption'], quote=True)}" width="{width}" height="{height}" fetchpriority="high"></div><figcaption>{escape(f['caption'])}</figcaption></figure>
      </div>
    </div>
  </section>
  <section class="detail-inhalte wrap" aria-label="{escape(f['name'], quote=True)} im Arbeitsalltag">{sections}</section>
  <section class="ablauf raster"><div class="wrap"><div class="bereichskopf"><p class="rubrik">IM ARBEITSALLTAG</p><h2>Ein klarer Ablauf.<br>Gemeinsame Informationen.</h2></div><ol class="ablaufschritte detail-schritte">{steps}</ol></div></section>
  <section class="fragen wrap"><div><p class="rubrik">GUT ZU WISSEN</p><h2>{faq_titel[f['slug']]}</h2></div><div class="faq-liste">{faq}</div></section>
  <nav class="verwandte wrap" aria-label="Passende Funktionen"><p class="rubrik">DAS GEHÖRT ZUSAMMEN</p><div>{related}</div></nav>
  <section class="abschluss raster"><div class="wrap"><p class="rubrik">DEIN BETRIEB. IM LOT.</p><h2>Im Zusammenhang ansehen.</h2><p>Wir zeigen dir Senklot anhand der Abläufe deines Betriebs.</p><a class="knopf" href="../#kontakt">Demo anfragen {pfeil}</a></div></section>
</main>
{footer}
<script defer src="../effekte.js?v={VERSION}"></script>
</body>
</html>
'''
    (target / 'index.html').write_text(html)

(ROOT / 'robots.txt').write_text('User-agent: *\nAllow: /\nDisallow: /api/\n\nUser-agent: OAI-SearchBot\nAllow: /\nDisallow: /api/\n\nSitemap: https://senklot.at/sitemap.xml\n')
urls = [DOMAIN + '/'] + [DOMAIN + '/' + f['slug'] + '/' for f in funktionen]
(ROOT / 'sitemap.xml').write_text('<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n' + ''.join(f'  <url><loc>{url}</loc></url>\n' for url in urls) + '</urlset>\n')
(ROOT / 'assets/senklot.svg').write_text('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64"><rect width="64" height="64" rx="12" fill="#fff"/><g fill="#0f4552"><path d="M31.05 23.05V6.95a.95.95 0 0 1 1.9 0v16.1Z"/><rect x="28.9" y="24.2" width="6.2" height="4.5" rx=".6"/><path d="M26.8 29.8h10.4l5.2 6.7H21.6ZM21.6 37.9h20.8L32 58Z"/></g></svg>\n')
print(f'{len(urls)} HTML-Seiten, Metadaten, strukturierte Daten, robots.txt und Sitemap erstellt.')
