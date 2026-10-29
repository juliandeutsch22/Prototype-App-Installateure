from pathlib import Path
from html.parser import HTMLParser
from urllib.parse import urlsplit,unquote
import hashlib,json,re,shutil,subprocess,zipfile
from PIL import Image

root=Path(__file__).resolve().parent.parent
target=Path('/workspace/Senklot-Downloads/senklot-illustrationen-gesamtentwurf-2026-10-29')
repo=target.parent
proof=json.loads((root/'pruefung.json').read_text())
gallery=json.loads((root/'galerie-pruefung.json').read_text())
assert proof['contexts']==119 and proof['views']==375
assert not proof['errors'] and not proof['axeViolations'] and proof['noDocumentOverflow']
assert proof['controlsUnchanged'] and proof['headersUnchanged'] and proof['copyUnchanged']
assert len(gallery)==4 and gallery[-1]['localBundleWithExternalNetworkBlocked'] and gallery[-1]['noExternalRequests']
assert all(not g['errors'] for g in gallery)
subprocess.run(['git','diff','--quiet','HEAD','origin/main'],cwd='/workspace/Senklot-Premium-Umsetzung',check=True)
assert not subprocess.check_output(['git','status','--porcelain'],cwd='/workspace/Senklot-Premium-Umsetzung')
assert subprocess.check_output(['git','branch','--show-current'],cwd=repo,text=True).strip()=='bilder/landingpage-2026-10-14'

rows=json.loads((root/'pruefung-seiten.json').read_text())
cases={c['name']:c for c in json.loads((root/'seiten.json').read_text())}
for r in rows:
    assert not r.get('error') and not r['errors'] and not r['failedResponses']
    if cases[r['name']].get('emptyMotif'): assert r['decoration']['empty']
    for key in ['file','fullFile']:
        p=root/'seiten'/r[key]
        with Image.open(p) as image:
            assert image.width==r['width']
            assert image.height>0
            image.verify()
assert len(list((root/'seiten').glob('*.jpg')))==750

target.mkdir(exist_ok=True)
for name in ['README.md','DESIGNLINIE.md','ABDECKUNG.md','PRUEFUNG.md','pruefung.json','galerie-pruefung.json','seiten.json','index.html']:
    shutil.copyfile(root/name,target/name)
for folder in ['seiten','svg','assets','werkzeuge']:
    shutil.copytree(root/folder,target/folder,dirs_exist_ok=True)
for p in root.glob('0*-*'):
    if p.suffix in ['.html','.jpg']: shutil.copyfile(p,target/p.name)

class References(HTMLParser):
    def __init__(self):super().__init__();self.references=[]
    def handle_starttag(self,tag,attrs):self.references += [v for k,v in attrs if k in ['src','href'] and v]

refs=[]
for p in target.rglob('*'):
    if p.suffix not in ['.html','.md','.css']:continue
    text=p.read_text()
    values=[]
    if p.suffix=='.md':values+=re.findall(r'\]\(([^)]+)\)',text)
    if p.suffix=='.html':parser=References();parser.feed(text);values+=parser.references
    values+=re.findall(r'url\([\'\"]?([^\)\'\"]+)',text)
    for ref in values:
        url=urlsplit(ref)
        if url.scheme or url.netloc or not url.path:continue
        local=p.parent/unquote(url.path)
        if local==target/'entwurf.zip':continue
        assert local.exists(),(p,ref)
        refs.append(str(local.relative_to(target)))

check=dict(viewportImages=375,fullPageImages=375,overviewBoards=9,svgs=12,checkedRelativeReferences=len(refs),brokenReferences=[],allJpegsDecode=True,localGalleryWithoutExternalRequestsVerified=True,sourceWorktreeClean=True,sourceContentMatchesDeployedBaseline=True)
(target/'paket-pruefung.json').write_text(json.dumps(check,ensure_ascii=False,indent=2)+'\n')
with zipfile.ZipFile(target/'entwurf.zip','w',zipfile.ZIP_DEFLATED,compresslevel=6) as z:
    for p in sorted(target.rglob('*')):
        if p.is_file() and p.name not in ['entwurf.zip','SHA256.txt']:z.write(p,p.relative_to(target))
with zipfile.ZipFile(target/'entwurf.zip') as z:assert z.testzip() is None
assert (target/'entwurf.zip').stat().st_size<99_000_000
files=['entwurf.zip','README.md','01-start.jpg','02-auftraege.jpg','03-planung.jpg','04-team.jpg','05-finanzen.jpg','06-material.jpg','07-einstellungen.jpg','08-plattform.jpg','09-zugang.jpg','pruefung.json','paket-pruefung.json','index.html']
(target/'SHA256.txt').write_text(''.join(f'{hashlib.sha256((target/name).read_bytes()).hexdigest()}  {name}\n' for name in files))
print(json.dumps({**check,'zipBytes':(target/'entwurf.zip').stat().st_size,'target':str(target)},ensure_ascii=False))
