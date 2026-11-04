from pathlib import Path
from urllib.parse import urlsplit,unquote
from html.parser import HTMLParser
import json,zipfile,shutil,hashlib
root=Path(__file__).resolve().parent.parent
stage=Path('/tmp/senklot-world4you-upload')
stage.mkdir(exist_ok=True)
for p in stage.iterdir():
 if p.is_dir():shutil.rmtree(p)
 else:p.unlink()
features=json.loads((root/'werkzeuge/funktionen.json').read_text())
for name in ['index.html','favicon.ico','landingpage.css','landingpage.js','tarife.js','kontakt.js','effekte.js','robots.txt','sitemap.xml','.htaccess']:
 shutil.copyfile(root/name,stage/name)
for slug in [f['slug'] for f in features]+['impressum','datenschutz']:
 (stage/slug).mkdir();shutil.copyfile(root/slug/'index.html',stage/slug/'index.html')
shutil.copytree(root/'api',stage/'api')
shutil.copytree(root/'senklot-intern',stage/'senklot-intern',ignore=shutil.ignore_patterns('config.php','speicher'))
(stage/'assets').mkdir()
for p in (root/'assets').iterdir():
 if p.suffix in ['.webp','.woff2','.svg','.txt'] or p.name in ['senklot-vorschau.png','favicon-96.png']:shutil.copyfile(p,stage/'assets'/p.name)
stage.chmod(0o755)
for p in stage.rglob('*'):p.chmod(0o755 if p.is_dir() else 0o644)
class Refs(HTMLParser):
 def __init__(self):super().__init__();self.refs=[]
 def handle_starttag(self,tag,attrs):self.refs.extend(v for k,v in attrs if k in ['href','src'] and v)
refs=0
for page in stage.rglob('*.html'):
 if page.is_relative_to(stage/'senklot-intern'):continue
 parser=Refs();parser.feed(page.read_text())
 for ref in parser.refs:
  u=urlsplit(ref)
  if u.scheme or u.netloc or not u.path:continue
  target=(page.parent/unquote(u.path)).resolve()
  if target.is_dir():target=target/'index.html'
  assert target.exists(),(page,ref)
  assert target.is_relative_to(stage)
  refs+=1
archive=root/'world4you-upload.zip'
with zipfile.ZipFile(archive,'w',zipfile.ZIP_DEFLATED) as z:
 for p in sorted(stage.rglob('*')):
  if p.is_file():z.write(p,p.relative_to(stage))
with zipfile.ZipFile(archive) as z:
 assert z.testzip() is None
 assert '.htaccess' in z.namelist()
 assert 'senklot-intern/.htaccess' in z.namelist()
 assert 'senklot-intern/config.php' not in z.namelist()
 assert not any('/speicher/' in n for n in z.namelist())
 assert all(not n.startswith(('server/','werkzeuge/','vorlagen/','nachweise/')) and not n.startswith('.env') for n in z.namelist())
# Kleines Update für bestehende Installationen: neun HTML-Seiten und beide Icons.
with zipfile.ZipFile(root/'favicon-update.zip','w',zipfile.ZIP_DEFLATED) as z:
 for name in ['index.html','favicon.ico','assets/favicon-96.png']+[slug+'/index.html' for slug in [f['slug'] for f in features]+['impressum','datenschutz']]:
  z.write(stage/name,name)
report={'stage':str(stage),'archive':'world4you-upload.zip','bytes':archive.stat().st_size,'sha256':hashlib.sha256(archive.read_bytes()).hexdigest(),'publicFiles':[str(p.relative_to(stage)) for p in sorted(stage.rglob('*')) if p.is_file()],'htmlReferencesChecked':refs,'missingReferences':[],'realCredentialsIncluded':False,'protectedBackendIncluded':True,'remoteUploadPerformed':False}
(root/'nachweise/world4you-paket.json').write_text(json.dumps(report,indent=2)+'\n');print(json.dumps({k:v for k,v in report.items() if k!='publicFiles'}))
