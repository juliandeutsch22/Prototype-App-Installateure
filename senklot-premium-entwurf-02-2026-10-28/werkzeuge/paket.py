from pathlib import Path
import json,re,zipfile,hashlib
from urllib.parse import urlsplit,unquote
root=Path(__file__).resolve().parent.parent
checked=[];missing=[]
for f in root.rglob('*'):
 if f.suffix not in ('.html','.md','.css'): continue
 text=f.read_text()
 links=[]
 if f.suffix=='.md': links+=re.findall(r'\]\(([^\s)]+)\)',text)
 else: links+=re.findall(r'(?:href|src)=["\']([^"\']+)',text)
 links+=re.findall(r'url\(["\']?([^\)"\']+)',text)
 for url in links:
  if url.startswith(('#','http:','https:','data:','mailto:','tel:')):continue
  target=(f.parent/unquote(urlsplit(url).path)).resolve()
  # Paket wird im nächsten Schritt erzeugt.
  if target==root/'entwurf.zip':continue
  item={'from':str(f.relative_to(root)),'target':url};checked.append(item)
  if not target.exists():missing.append(item)
if missing:raise RuntimeError(json.dumps(missing,ensure_ascii=False))
pages=json.loads((root/'seiten-pruefung.json').read_text());states=json.loads((root/'zustaende-pruefung.json').read_text())
bad=[r for r in pages+states if r.get('error') or r.get('errors') or r.get('violations') or r.get('controlsUnchanged') is False or r.get('scrollWidth',0)>r['width']]
assert not bad,bad
assert len(pages)==219 and len(states)==84
assert len(list((root/'seiten').glob('*.jpg')))==219
assert len(list((root/'screens').glob('*.jpg')))==84
assert len(list((root/'bewegung').glob('*.mp4')))==4
for group,rows in [('seiten',pages),('screens',states)]:
 for r in rows:assert (root/group/r['file']).is_file()
report={'relativeReferencesChecked':len(checked),'missing':missing,'pageImages':len(pages),'stateImages':len(states),'videos':4,'badCases':bad}
(root/'paket-pruefung.json').write_text(json.dumps(report,ensure_ascii=False,indent=2))
archive=root/'entwurf.zip'
with zipfile.ZipFile(archive,'w',compression=zipfile.ZIP_DEFLATED,compresslevel=6)as z:
 for f in sorted(root.rglob('*')):
  if f.is_file() and f!=archive and f.name!='SHA256.txt':z.write(f,f.relative_to(root))
with zipfile.ZipFile(archive)as z:
 assert z.testzip()is None
 entries=len(z.namelist())
assert archive.stat().st_size<32*1024*1024
names=['entwurf.zip','ueberblick-mobil.jpg','ueberblick-desktop.jpg']
(root/'SHA256.txt').write_text('\n'.join(hashlib.sha256((root/n).read_bytes()).hexdigest()+'  '+n for n in names)+'\n')
print(json.dumps({**report,'zipBytes':archive.stat().st_size,'zipEntries':entries,'crc':'ok'},ensure_ascii=False))
