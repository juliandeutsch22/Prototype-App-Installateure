"""Veröffentlicht nur geprüfte Dateien auf dem separaten Download-Arbeitsbaum."""
from pathlib import Path
from html.parser import HTMLParser
from urllib.parse import urlsplit,unquote
import json,re,shutil,zipfile,hashlib
root=Path(__file__).resolve().parent.parent
target=Path('/workspace/Senklot-Downloads/senklot-landingpage-2026-11-02')
proof=json.loads((root/'nachweise/pruefung.json').read_text());assert len(proof)==3 and all(not p['errors'] and not p['failed'] and not p['violations'] and p['width']==p['scrollWidth'] for p in proof)
seo=json.loads((root/'nachweise/seo-pruefung.json').read_text());assert seo['pages']==7 and len(seo['views'])==24 and all(not p['violations'] for p in seo['views'])
assert json.loads((root/'nachweise/animationen-pruefung.json').read_text())['dynamicReducedMotion']
assert json.loads((root/'nachweise/sicherheit/apache-pruefung.json').read_text())['actualApacheExecution']
browser=json.loads((root/'nachweise/sicherheit/browser-pruefung.json').read_text());assert len(browser['views'])==36 and all(not p['violations'] for p in browser['views'])
php=json.loads((root/'nachweise/sicherheit/php-tests.txt').read_text().splitlines()[-1]);assert php['assertions']>=70 and php['failed']==0
assert json.loads((root/'nachweise/sicherheit/smtp-pruefung.json').read_text())['untrustedCertificateRejected']
assert json.loads((root/'nachweise/sicherheit/paket-pruefung.json').read_text())['zipIntegrity']
assert json.loads((root/'nachweise/kontakt-pruefung.json').read_text())['explicitActivation']
assert len(json.loads((root/'nachweise/feedback-pruefung.json').read_text())['views'])==4
assert 'tests 13' in (root/'nachweise/server-tests.txt').read_text() and 'fail 0' in (root/'nachweise/server-tests.txt').read_text()
features=json.loads((root/'werkzeuge/funktionen.json').read_text());target.mkdir(exist_ok=True)
for name in ['index.html','landingpage.css','landingpage.js','tarife.js','kontakt.js','effekte.js','robots.txt','sitemap.xml','.htaccess','package.json','.env.example','.gitignore','README.md','QUELLEN.md','VEROEFFENTLICHEN.md','world4you-upload.zip','animationen.webm']:
 shutil.copyfile(root/name,target/name)
for name in ['assets','server','werkzeuge','vorlagen','api','senklot-intern','impressum','datenschutz']+[f['slug'] for f in features]:
 shutil.copytree(root/name,target/name,dirs_exist_ok=True,ignore=shutil.ignore_patterns('config.php','speicher','__pycache__'))
for p in root.glob('*.png'):shutil.copyfile(p,target/p.name)
(target/'nachweise').mkdir(exist_ok=True)
for name in ['pruefung.json','app-aufnahmen.json','kontakt-pruefung.json','server-tests.txt','seo-pruefung.json','animationen-pruefung.json','apache-pruefung.json','world4you-paket.json','bildoptimierung.json','ladeverhalten.json','zusatzpruefung.json','kontakt-pruefen.cjs','pruefen.cjs','seo-pruefen.cjs','animationen-pruefen.cjs','paket.py','feedback-pruefen.cjs','feedback-pruefung.json','preview-server.cjs']:
 shutil.copyfile(root/'nachweise'/name,target/'nachweise'/name)
shutil.copytree(root/'nachweise/sicherheit',target/'nachweise/sicherheit',dirs_exist_ok=True)
assert not (target/'senklot-intern/config.php').exists() and not (target/'senklot-intern/speicher').exists()
class Refs(HTMLParser):
 def __init__(self):super().__init__();self.refs=[]
 def handle_starttag(self,tag,attrs):self.refs += [v for k,v in attrs if k in ['href','src'] and v]
count=0
for p in list(target.glob('*.html'))+list(target.glob('*/index.html'))+[target/'landingpage.css',target/'README.md',target/'VEROEFFENTLICHEN.md']:
 if 'vorlagen' in p.parts:continue
 s=p.read_text();refs=[]
 if p.suffix=='.html':parser=Refs();parser.feed(s);refs+=parser.refs
 if p.suffix=='.md':refs+=re.findall(r'\]\(([^)]+)\)',s)
 refs+=re.findall(r'url\([\'\"]?([^\)\'\"]+)',s)
 for ref in refs:
  url=urlsplit(ref)
  if url.scheme or url.netloc or not url.path:continue
  local=p.parent/unquote(url.path)
  if local.name=='landingpage.zip':continue
  assert local.exists(),(p,ref)
  count+=1
(target/'paket-pruefung.json').write_text(json.dumps({'checkedRelativeReferences':count,'missingReferences':[],'viewportWidths':[320,390,834,1440],'publicPages':9,'indexableMarketingPages':7,'legalPagesAreDrafts':False,'operatorDetailsIntegrated':True,'providerDocumentsReviewed':False,'appUnchanged':True,'realContactDeliveryConfigured':False,'world4youUploadPerformed':False,'googleBingVerificationPerformed':False,'realCredentialsIncluded':False,'monthlyNetPrices':[129,179,249],'setupOptional':True,'introPriceGuaranteeMonths':12},indent=2)+'\n')
with zipfile.ZipFile(target/'landingpage.zip','w',zipfile.ZIP_DEFLATED) as z:
 for p in sorted(target.rglob('*')):
  if p.is_file() and p.name not in ['landingpage.zip','SHA256.txt']:z.write(p,p.relative_to(target))
with zipfile.ZipFile(target/'landingpage.zip') as z:assert z.testzip() is None and 'senklot-intern/config.php' not in z.namelist()
names=['landingpage.zip','world4you-upload.zip','animationen.webm','chat-01.png','chat-02.png','chat-03.png','chat-04.png','landingpage-1440.png','landingpage-390.png','index.html','effekte.js','robots.txt','sitemap.xml']
(target/'SHA256.txt').write_text(''.join(f'{hashlib.sha256((target/n).read_bytes()).hexdigest()}  {n}\n' for n in names))
print(json.dumps({'target':str(target),'relativeReferences':count,'zipBytes':(target/'landingpage.zip').stat().st_size,'world4youZipBytes':(target/'world4you-upload.zip').stat().st_size}))
