const fs=require('node:fs'),path=require('node:path');
const {chromium,expect}=require('/workspace/Senklot-Landingpage-Basis-2026-11-02/node_modules/@playwright/test');
const AxeBuilder=require('/workspace/Senklot-Landingpage-Basis-2026-11-02/node_modules/@axe-core/playwright').default;
const root=path.resolve(__dirname,'..'),base='http://127.0.0.1:5252',features=JSON.parse(fs.readFileSync(path.join(root,'werkzeuge/funktionen.json'),'utf8'));
(async()=>{const b=await chromium.launch({executablePath:'/usr/bin/chromium'}),proof=[];try{
const titles=new Set(),descriptions=new Set();
for(const width of[320,390,834,1440]){
 const context=await b.newContext({viewport:{width,height:1000},locale:'de-AT',reducedMotion:'reduce'}),p=await context.newPage(),errors=[],failed=[];p.on('pageerror',e=>errors.push(e.message));p.on('response',r=>{if(r.status()>=400)failed.push({url:r.url(),status:r.status()})});
 for(const feature of features){
  const slug=feature.slug,r=await p.goto(base+'/'+slug+'/',{waitUntil:'networkidle'});if(r.status()!==200)throw Error('Seite fehlt: '+slug);await p.evaluate(()=>document.fonts.ready);await p.waitForFunction(()=>[...document.images].every(i=>i.complete&&i.naturalWidth>0));
  const sw=await p.evaluate(()=>document.documentElement.scrollWidth);if(sw>width)throw Error('Überlauf '+slug+' '+width+': '+sw);
  await expect(p.locator('h1')).toHaveCount(1);await expect(p.locator('link[rel=canonical]')).toHaveAttribute('href','https://senklot.at/'+slug+'/');
  await expect(p.locator('meta[name=robots]')).toHaveAttribute('content',/index,follow/);
  const title=await p.title(),description=await p.locator('meta[name=description]').getAttribute('content');if(width===320){if(titles.has(title)||descriptions.has(description))throw Error('Doppelte Metadaten');titles.add(title);descriptions.add(description);}
  const structured=await p.locator('script[type="application/ld+json"]').textContent(),schema=JSON.parse(structured);if(!schema['@graph'].some(x=>x['@type']==='BreadcrumbList'))throw Error('Brotpfad fehlt');if(/aggregateRating|reviewRating/.test(structured))throw Error('Unzulässige Bewertung');
  const links=await p.locator('a[href]').evaluateAll(nodes=>nodes.map(a=>({href:a.href,text:a.textContent})));for(const link of links){const u=new URL(link.href);if(u.origin!==base)continue;const file=path.join(root,u.pathname,u.pathname.endsWith('/')?'index.html':'');if(!fs.existsSync(file))throw Error('Interner Link fehlt '+link.href);if(u.pathname==='/'+slug+'/'&&u.hash)await expect(p.locator(u.hash)).toHaveCount(1);}
  for(const d of await p.locator('details').all()){await d.locator('summary').click();await expect(d).toHaveAttribute('open','');await d.locator('summary').click();}
  let violations=[];if(width===390||width===1440)violations=(await new AxeBuilder({page:p}).withTags(['wcag2a','wcag2aa','wcag21aa','wcag22aa']).analyze()).violations.map(v=>({id:v.id,targets:v.nodes.map(n=>n.target)}));
  await p.evaluate(()=>{document.activeElement?.blur();scrollTo(0,0)});if(width===390||width===1440)await p.screenshot({path:path.join(root,slug+'-'+width+'.png'),fullPage:true});
  const entry={slug,width,scrollWidth:sw,title,canonical:true,structuredData:true,internalLinks:true,faq:true,violations};proof.push(entry);if(violations.length)throw Error(JSON.stringify(entry));
 }
 if(errors.length||failed.length)throw Error(JSON.stringify({width,errors,failed}));await context.close();
}
// HTML-Inhalte bleiben ohne JavaScript zugänglich.
const nojs=await b.newContext({javaScriptEnabled:false,viewport:{width:390,height:900}}),p=await nojs.newPage();
for(const slug of ['',...features.map(f=>f.slug)]){await p.goto(base+'/'+(slug?slug+'/':''));await expect(p.locator('h1')).toBeVisible();if(slug)await expect(p.locator('.detail-inhalte')).toBeVisible();else{await expect(p.locator('[data-preis=starter]')).toHaveText('129 €');await expect(p.getByText(/1.393,20 € jährlich im Voraus/)).toHaveCount(1);}if(await p.locator('[hidden][data-erscheinen],[aria-hidden="true"][data-erscheinen]').count())throw Error('Inhalt versteckt');}
await nojs.close();
fs.writeFileSync(path.join(__dirname,'seo-pruefung.json'),JSON.stringify({pages:7,views:proof,noJavaScriptContentVisible:true,missingInternalLinks:[],fakeRatings:false},null,2));console.log(JSON.stringify({pages:7,viewChecks:proof.length,noJavaScriptContentVisible:true,violations:0,errors:0}));
}finally{await b.close()}})().catch(e=>{console.error(e);process.exit(1)});
