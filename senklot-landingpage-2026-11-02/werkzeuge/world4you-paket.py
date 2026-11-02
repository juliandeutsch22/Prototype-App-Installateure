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
for name in ['index.html','landingpage.css','landingpage.js','tarife.js','kontakt.js','effekte.js','robots.txt','sitemap.xml','.htaccess']:
 shutil.copyfile(root/name,stage/name)
for f in features:
 (stage/f['slug']).mkdir();shutil.copyfile(root/f['slug']/'index.html',stage/f['slug']/'index.html')
(stage/'assets').mkdir()
for p in (root/'assets').iterdir():
 if p.suffix in ['.webp','.woff2','.svg','.txt'] or p.name=='senklot-vorschau.png':shutil.copyfile(p,stage/'assets'/p.name)
stage.chmod(0o755)
for p in stage.rglob('*'):p.chmod(0o755 if p.is_dir() else 0o644)
class Refs(HTMLParser):
 def __init__(self):super().__init__();self.refs=[]
 def handle_starttag(self,tag,attrs):self.refs.extend(v for k,v in attrs if k in ['href','src'] and v)
refs=0
for page in stage.rglob('*.html'):
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
 assert all(not n.startswith(('server/','werkzeuge/','vorlagen/','nachweise/')) and not n.startswith('.env') for n in z.namelist())
report={'stage':str(stage),'archive':'world4you-upload.zip','bytes':archive.stat().st_size,'sha256':hashlib.sha256(archive.read_bytes()).hexdigest(),'publicFiles':[str(p.relative_to(stage)) for p in sorted(stage.rglob('*')) if p.is_file()],'htmlReferencesChecked':refs,'missingReferences':[],'privateFilesIncluded':False,'remoteUploadPerformed':False}
(root/'nachweise/world4you-paket.json').write_text(json.dumps(report,indent=2)+'\n');print(json.dumps({k:v for k,v in report.items() if k!='publicFiles'}))
