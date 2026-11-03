from pathlib import Path
from fontTools.ttLib import TTFont
from fontTools.pens.svgPathPen import SVGPathPen
from fontTools.pens.transformPen import TransformPen
from fontTools.pens.boundsPen import BoundsPen
from PIL import Image
import json,shutil,subprocess,os,hashlib
from concurrent.futures import ThreadPoolExecutor
from xml.sax.saxutils import escape

ROOT=Path(__file__).resolve().parent.parent
FONTS=Path('/workspace/Senklot-Landingpage-Basis-2026-11-02/node_modules/@fontsource')
for name in ['svg','png','schriftarten/woff2','schriftarten/ttf','lizenzen','nachweise']:(ROOT/name).mkdir(parents=True,exist_ok=True)
COLORS={'petrol':'#0F4552','weiss':'#FFFFFF','schwarz':'#000000'}
ROLES={'zeichen':'Senklot-Zeichen','schriftzug':'Senklot-Schriftzug','logo':'Senklot – Zeichen und Schriftzug','logo-mit-claim':'Senklot – Dein Betrieb. Im Lot.'}
weights=[('poppins',400,'Poppins-Regular'),('poppins',500,'Poppins-Medium'),('poppins',600,'Poppins-SemiBold'),('ibm-plex-mono',400,'IBMPlexMono-Regular'),('ibm-plex-mono',500,'IBMPlexMono-Medium')]
metadata=[]
for family,weight,name in weights:
 source=FONTS/family/'files'/f'{family}-latin-{weight}-normal.woff'
 font=TTFont(source)
 font.flavor=None
 font.save(ROOT/'schriftarten/ttf'/f'{name}-Latin.ttf')
 woff2=FONTS/family/'files'/f'{family}-latin-{weight}-normal.woff2'
 shutil.copyfile(woff2,ROOT/'schriftarten/woff2'/woff2.name)
 metadata.append({'family':'Poppins' if family=='poppins' else 'IBM Plex Mono','weight':weight,'style':'normal','postScriptName':font['name'].getDebugName(6),'version':font['name'].getDebugName(5),'coverage':'Latin-Subset wie in der App','woff2':str(Path('schriftarten/woff2')/woff2.name),'woff2Sha256':hashlib.sha256(woff2.read_bytes()).hexdigest(),'ttf':str(Path('schriftarten/ttf')/(name+'-Latin.ttf'))})
for family in ['poppins','ibm-plex-mono']:shutil.copyfile(FONTS/family/'LICENSE',ROOT/'lizenzen'/f'{family}-OFL.txt')
font=TTFont(FONTS/'poppins/files/poppins-latin-400-normal.woff');glyphs=font.getGlyphSet();cmap=font.getBestCmap();upm=font['head'].unitsPerEm
# Das genaue Latin-Subset enthält keine GPOS-Kerning-Lookups. Alle verwendeten Zeichen sind vorhanden.
assert not font['GPOS'].table.LookupList.Lookup

def outlines(text,size,tracking=0):
 pen=SVGPathPen(glyphs);bounds=BoundsPen(glyphs);x=0;scale=size/upm
 for char in text:
  name=cmap[ord(char)];matrix=(scale,0,0,-scale,x,0)
  glyphs[name].draw(TransformPen(pen,matrix));glyphs[name].draw(TransformPen(bounds,matrix))
  x+=font['hmtx'][name][0]*scale+tracking*size
 return pen.getCommands(),bounds.bounds

word,wb=outlines('Senklot',56*.62,.02)
claim,cb=outlines('Dein Betrieb. Im Lot.',8,0)
icon='''<path d="M31.05 23.05 V6.95 A0.95 0.95 0 0 1 32.95 6.95 V23.05 Z"/><rect x="28.9" y="24.2" width="6.2" height="4.5" rx="0.6"/><path d="M26.8 29.8 H37.2 L42.4 36.5 H21.6 Z"/><path d="M21.6 37.9 H42.4 L32 58 Z"/>'''
# Originalproportion der aktuellen ProduktMarke: Schriftgröße 0,62 × Zeichenhöhe, Abstand 0,38 em.
word_x=22+56*.62*.38
logo_width=word_x+wb[2]+1.5
for role in ROLES:
 if role=='zeichen':view='0 0 64 64';width=height=64;body=icon
 elif role=='schriftzug':
  width=wb[2]-wb[0]+3;height=wb[3]-wb[1]+3;view=f'0 0 {width:.6f} {height:.6f}';body=f'<path transform="translate({1.5-wb[0]:.6f} {1.5-wb[1]:.6f})" d="{word}"/>'
 else:
  width=logo_width;height=56;view=f'0 0 {width:.6f} 56'
  center=22 if role=='logo-mit-claim' else 28
  baseline=center-(wb[1]+wb[3])/2
  body=f'<g transform="translate(-21 -4)">{icon}</g><path transform="translate({word_x:.6f} {baseline:.6f})" d="{word}"/>'
  if role=='logo-mit-claim':body+=f'<path transform="translate({word_x:.6f} {47-cb[3]:.6f})" d="{claim}"/>'
 for color,hexvalue in COLORS.items():
  svg=f'''<svg xmlns="http://www.w3.org/2000/svg" viewBox="{view}" width="{width:.6f}" height="{height:.6f}" role="img" aria-labelledby="titel"><title id="titel">{escape(ROLES[role])}</title><g fill="{hexvalue}">{body}</g></svg>\n'''
  (ROOT/'svg'/f'senklot-{role}-{color}.svg').write_text(svg)
css=[]
for family,weight,name in weights:
 css.append(f"@font-face{{font-family:'{'Poppins' if family=='poppins' else 'IBM Plex Mono'}';src:url('./woff2/{family}-latin-{weight}-normal.woff2') format('woff2');font-style:normal;font-weight:{weight};font-display:swap}}")
(ROOT/'schriftarten/senklot-schriften.css').write_text('\n'.join(css)+'\n')
(ROOT/'marke.json').write_text(json.dumps({'name':'Senklot','colors':COLORS,'wordmark':{'font':'Poppins','weight':400,'trackingEm':.02,'outlineSvg':True},'proportions':{'symbolHeight':56,'typeSize':34.72,'gapEm':.38},'fonts':metadata,'sourceApp':'7589bf0','geometrySource':'src/components/ProduktMarke.tsx','appLoadedWeights':{'Poppins':[400,500,600],'IBM Plex Mono':[400,500]},'landingLoadedWeights':{'Poppins':[400,500],'IBM Plex Mono':[400]},'background':'transparent','liveAppsModified':False},ensure_ascii=False,indent=2)+'\n')
profile=Path('/workspace/.cache/senklot-inkscape');profile.mkdir(parents=True,exist_ok=True)
env={**os.environ,'INKSCAPE_PROFILE_DIR':str(profile)}
jobs=[]
for svg in sorted((ROOT/'svg').glob('*.svg')):
 for size in ([256,512,1024,2048] if '-zeichen-' in svg.name else [1024,2048,4096]):
  folder=ROOT/'png'/str(size);folder.mkdir(exist_ok=True);jobs.append((svg,folder/(svg.stem+'.png'),size))
def raster(job):
 svg,out,size=job
 r=subprocess.run(['inkscape',str(svg),'--export-type=png','--export-area-page',f'--export-width={size}','--export-background-opacity=0',f'--export-filename={out}'],env=env,capture_output=True,text=True)
 if r.returncode:raise RuntimeError(r.stderr)
 with Image.open(out) as image:
  assert image.width==size and image.mode=='RGBA',(out,image.size,image.mode)
  assert image.getchannel('A').getextrema()==(0,255),out
 return {'file':str(out.relative_to(ROOT)),'width':size,'transparent':True}
with ThreadPoolExecutor(max_workers=3) as pool:results=list(pool.map(raster,jobs))
(ROOT/'nachweise/exporte.json').write_text(json.dumps({'svgFiles':12,'pngFiles':len(results),'textOutlined':True,'externalSvgResources':False,'rasterExports':results},indent=2)+'\n')
print(json.dumps({'svgFiles':12,'pngFiles':len(results),'fontFiles':10,'allPngTransparent':True}))
