import re,sys
sys.path.insert(0,'tools/vorschau/_tmp')
from cssliste import liste
K,B,I,F='var(--groesse-klein)','var(--groesse-begleit)','var(--groesse-inhalt)','var(--groesse-feld)'
T='T'; N='N'
D = {
'index.css':{686:K,1005:B,1137:I,1138:B,1140:I,1142:B,1146:K,1204:K,1207:K,1233:B,1236:B,1267:B,1281:B,1282:I,1325:B,1336:I,1340:B,1356:I,1364:B,1372:B,1373:B,
  654:T,1002:T,1056:T,356:'x',367:'x'},
'lot-akten.css':{20:T,27:I,58:I,62:B,65:K,79:B,80:I,81:B,82:I,85:K,86:T,88:I,89:I,90:I,93:B,94:I,96:B,102:I,107:I,109:K,111:I,112:B,117:B,118:I,119:K,166:B},
'lot-auftraege.css':{28:K,30:B,31:I,41:B,85:B,94:T},
'lot-blatt.css':{114:T},
'lot-feinschliff.css':{40:B,50:T,51:I,56:T,57:I,87:B,88:B,104:B,116:T,120:T,121:B,123:I,127:I,128:B},
'lot-material.css':{17:T,21:F,44:I,143:B,149:B,150:T,151:B,174:I,176:B,223:B,224:B,263:I,264:B,265:B,267:F,270:B},
'lot-monat.css':{35:B,38:B,46:K,72:K,74:K,82:B,85:B,87:K,109:B,134:B,170:B,171:T,194:B,196:I,204:B,205:B,207:I,223:B,235:B,236:K,237:K,238:K},
'lot-nachrichten.css':{38:F,42:B,59:T,66:I,69:K,70:B,75:K,76:K,81:T,84:T,85:B,100:I,107:K,111:B,112:K,114:K,139:F,140:I,141:K,144:K,151:I,155:K,192:T,211:T,212:K,224:T,226:B,241:I,249:F,256:T,258:B,271:I,303:T,318:K,319:I,326:T,329:I,330:B},
'lot-planlinie.css':{49:K,51:T,72:T,73:T,85:T,91:B,138:K,139:T,144:K,191:I,192:I,193:B,205:I,213:T,237:K,239:K,240:K,241:K,244:K,247:K,348:K,367:K,369:K,370:K,375:K,391:B,396:K,397:K,406:K,411:K},
'lot-planung.css':{26:T,27:K,70:B,73:K,76:I,105:I,107:B,135:B,165:B,168:K,209:B,210:K,212:K,214:K,269:B,288:B,297:B,317:K,321:K,324:B,333:I,351:I,369:K,370:I,386:B,390:B,392:B,396:B,402:I,418:B,471:B,502:T,504:B,506:B,507:I,514:B,519:K},
'lot-plattform.css':{13:K,40:K,41:B,42:I,47:K,53:I,72:I,73:B,75:B,78:I,81:K,83:K,88:K,91:T,93:F,120:B},
'lot-rechnungen.css':{11:I,28:B,33:B,41:B,60:I,108:B,109:T,110:B},
'lot-scheine.css':{24:B,26:B,42:I,50:B,53:B,55:T,61:B},
'lot-start.css':{20:B,32:I,46:T,47:K,48:B,58:T,59:K,60:B,67:B,76:I,77:B,79:B,90:B,92:I,93:I,94:B,100:B,101:B,102:B,106:T,107:I,116:I,117:T,135:I,140:T},
'lot-timer.css':{34:B,39:B,47:T,48:T,52:B,78:I,80:B,84:I,89:K,103:T,111:I,137:B,170:T,171:B},
'lot-uebersicht.css':{34:T,35:K,36:F,68:K,69:K,99:B,100:B,102:I,103:I,105:I,106:I,109:B,113:K,151:K,152:K,153:K,167:K,168:K,169:K,170:K,172:K,173:K,174:K,175:K,177:B,178:B,179:B,180:B,181:B,182:B,188:B,189:I,192:K,198:B,202:I,214:B,219:B,223:T,224:B,225:B,226:B,228:B,230:I,231:B,232:B,240:I,241:B,242:I,253:B,281:B,282:B,286:K,287:T,292:I,293:I,295:K,307:K,315:B,316:K,338:K,378:K},
'lot-verwaltung.css':{39:B,59:T,60:B,62:I,68:B,74:T,94:B,95:K,102:B,128:B,129:T,130:B,138:I,142:I,143:B},
'lot-zeit.css':{80:B,83:I,89:T,90:I},
'lot-bewegung.css':{191:I},
'lot.css':{58:I,59:I,126:T,148:I,149:I,176:B,181:K,182:I,184:I,214:I,257:B,263:B,278:B,295:B,299:B,340:I,341:B,357:B,384:K,386:I,388:K,391:K,394:N,413:I,443:N,444:K,469:T,477:N,505:K,507:I,514:F,517:K,521:B,524:B,525:I,544:B,545:I,548:B,580:F},
}
alle=liste(); offen=[]; aenderungen={}
for f,l,v,sel in alle:
    n=f.split('/')[-1]
    r=D.get(n,{}).get(l)
    if r is None: offen.append(f"{n}:{l} {v} {sel[-60:]}"); continue
    if r in ('T','N','x'): continue
    aenderungen.setdefault(f,[]).append((l,v,r))
if offen: print('OHNE ENTSCHEIDUNG:', *offen, sep='\n  ')
if '--anwenden' in sys.argv and not offen:
    for f,ae in aenderungen.items():
        L=open(f).read().split('\n')
        for l,v,r in ae:
            alt=L[l-1]; n=alt.replace('font-size: '+v, 'font-size: '+r,1)
            if n==alt: n=alt.replace('font-size:'+v,'font-size: '+r,1)
            assert n!=alt, (f,l,alt)
            L[l-1]=n
        open(f,'w').write('\n'.join(L))
    print('angewandt:', sum(len(a) for a in aenderungen.values()))
