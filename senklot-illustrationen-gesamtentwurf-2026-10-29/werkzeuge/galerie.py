from pathlib import Path
import html,json,hashlib,subprocess

root=Path(__file__).resolve().parent.parent
cases=json.loads((root/'seiten.json').read_text())
rows=json.loads((root/'pruefung-seiten.json').read_text())
good=[r for r in rows if r.get('file') and not r.get('error')]
groups=['Start','Aufträge und Kunden','Planung','Team und Zeit','Finanzen','Material','Einstellungen','Globaler Admin','Zugang und Rechtliches']
titles={c['name']:c['title'] for c in cases}
boards=[
 ('01-start','Start','start','start-ruhig','start-monteur','start-ruhig'),
 ('02-auftraege','Aufträge und Kunden','baustellen','kundenakte','kunden-erstnutzung','baustellen-erstnutzung'),
 ('03-planung','Planung','wochenplan','planung-monat','tagesplan','eigener-plan'),
 ('04-team','Team und Zeit','mitarbeiter','benutzerakte','mitarbeiter','urlaub-eigene'),
 ('05-finanzen','Finanzen','rechnungen','angebotsakte','rechnungen-suche-leer','angebote-erstnutzung'),
 ('06-material','Material','lager','anforderungen','material','lager-import'),
 ('07-einstellungen','Einstellungen','einstellungen','firma-einrichtung','konto','sicherung'),
 ('08-plattform','Globaler Admin','plattform','plattform-support','plattform-neu','plattform-fehler'),
 ('09-zugang','Zugang und Rechtliches','anmeldung','datenschutz','zweiter-faktor','passwort-vergessen'),
]
style='''@font-face{font-family:Poppins;src:url(assets/poppins-400.woff2);font-weight:400}@font-face{font-family:Poppins;src:url(assets/poppins-600.woff2);font-weight:600}*{box-sizing:border-box}body{margin:0;background:#f7f9f9;color:#13262c;font:14px/1.65 Poppins,system-ui,sans-serif}main{max-width:1660px;margin:auto;padding:36px 24px 80px}a{color:#104b59;text-underline-offset:3px}h1{font-size:34px;line-height:1.35;margin:8px 0 20px;font-weight:600}h2{font-size:22px;font-weight:600;margin:0 0 12px}p{max-width:90ch}.eyebrow{font-size:12px;letter-spacing:.12em;color:#526b73}.lead{max-width:100ch}.notice{padding-left:16px;border-left:3px solid #104b59}.nav{display:flex;flex-wrap:wrap;gap:10px 20px;margin:20px 0}.filters{display:flex;flex-wrap:wrap;gap:12px;align-items:end;padding:18px 0;border-block:1px solid #c7d7dc;margin:26px 0 14px}.filters label{display:flex;flex-direction:column;gap:6px;font-size:12px}input,select,button{font:inherit;min-height:44px;color:inherit;border:1px solid #a8c1c8;border-radius:6px;background:white;padding:9px 12px}button,a,select{touch-action:manipulation}button{cursor:pointer}.filters input{min-width:270px}button:focus-visible,a:focus-visible,input:focus-visible,select:focus-visible{outline:3px solid #104b59;outline-offset:3px}.grid{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:28px}.shot{min-width:0;background:#fff;border:1px solid #d5e1e5}.imagebutton{display:block;border:0;border-radius:0;width:100%;padding:0;background:#edf2f3;text-align:left}.shot img{display:block;width:100%;height:335px;object-fit:contain;object-position:top}.caption{padding:18px}.caption h2{font-size:15px;margin:0 0 7px}.caption p{font-size:12px;color:#526b73;margin:8px 0}.caption .links{display:flex;gap:14px;flex-wrap:wrap;font-size:12px}.chip{font-size:11px;color:#526b73}.diagram{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:24px;margin:24px 0}.diagram figure{margin:0;padding:12px 0;border-top:1px solid #d5e1e5}.diagram img{width:140px;height:94px}.diagram figcaption{font-size:12px}.status{min-height:24px}.boards{display:grid;grid-template-columns:1fr 1fr;gap:24px}.boards a{display:block}.boards img{display:block;width:100%;border:1px solid #d5e1e5}.boards p{font-size:12px;margin-top:8px}dialog{border:1px solid #a8c1c8;border-radius:8px;padding:0;max-width:96vw;max-height:96vh;width:1500px;background:#fff;color:#13262c}dialog::backdrop{background:rgba(7,26,33,.7)}.lightboxbar{display:flex;flex-wrap:wrap;gap:10px;align-items:center;justify-content:space-between;padding:12px 16px;border-bottom:1px solid #d5e1e5}.lightboxbar p{margin:0;flex:1;min-width:180px}.lightboxlinks{display:flex;gap:10px;align-items:center;flex-wrap:wrap}.lightboxbody{height:78vh;overflow:auto;background:#edf2f3;text-align:center}.lightboxbody img{max-width:100%;height:auto;display:inline-block;vertical-align:top}footer{margin-top:45px;color:#526b73;font-size:12px}[hidden]{display:none!important}@media(max-width:1000px){.grid{grid-template-columns:1fr 1fr}.diagram{grid-template-columns:1fr 1fr}}@media(max-width:600px){main{padding:24px 16px 50px}h1{font-size:27px}.grid,.boards{grid-template-columns:1fr}.filters{display:grid;grid-template-columns:repeat(2,minmax(0,1fr))}.filters label{min-width:0}.filters select{width:100%;min-width:0}.filters label:first-child{grid-column:1/-1}.filters input{min-width:0;width:100%}.shot img{height:400px}.lightboxbar{padding:10px}.lightboxbody{height:70vh}}'''
cards=[]
for i,r in enumerate(good):
    description=r['decision']
    if r.get('decoration',{}).get('empty'):description+=' · Motiv: '+next(c['emptyMotif'] for c in cases if c['name']==r['name'])
    f='seiten/'+r['file'];full='seiten/'+r['fullFile'];mode='Dunkel' if r['theme']=='dark' else 'Hell'
    cards.append(f'''<article class="shot" data-group="{html.escape(r['group'])}" data-width="{r['width']}" data-theme="{r['theme']}" data-state="{'zustand' if r['state'] else 'seite'}" data-search="{html.escape(r['title']+' '+r['role']+' '+description,quote=True)}"><button class="imagebutton" data-index="{i}" aria-label="{html.escape(r['title'],quote=True)} · {r['width']} px vergrößern"><img loading="lazy" src="{f}" alt="{html.escape(r['title'],quote=True)} · {r['width']} px · {mode}"></button><div class="caption"><h2>{html.escape(r['title'])}</h2><span class="chip">{html.escape(r['group'])} · {r['width']} px · {mode} · {html.escape(r['role'])}</span><p>{html.escape(description)}</p><div class="links"><a href="{f}">Bildschirmausschnitt</a><a href="{full}">Ganze Seite</a></div></div></article>''')
board_html=''.join(f'<a href="{id}.jpg"><img src="{id}.jpg" alt="Überblick {html.escape(title)}" loading="lazy"><p>{title} · vier Beispiele</p></a>' for id,title,*_ in boards)
motifs=[('bau','Baustellen und Start'),('akte','Kunden'),('beleg','Angebote und Belege'),('plan','Planunterlagen'),('lager','Material und Lager'),('team','Mitarbeiter und Team'),('wartung','Wartungen'),('einrichtung','Einrichtung'),('betrieb','Plattform'),('suche','Keine Suchtreffer'),('fertig','Nichts zu erledigen'),('ablage','Dokumentablage · Reserve')]
motif_html=''.join(f'<figure><a href="svg/{id}.svg"><img src="svg/{id}.svg" alt="Linienillustration {html.escape(label)}"></a><figcaption>{html.escape(label)}</figcaption></figure>' for id,label in motifs)
options=''.join(f'<option>{html.escape(g)}</option>' for g in groups)
lightboxdata=[dict(title=r['title'],width=r['width'],theme=r['theme'],file='seiten/'+r['file'],fullFile='seiten/'+r['fullFile']) for r in good]
script='''const cards=[...document.querySelectorAll('.shot')],ids=['search','group','width','theme','state'],controls=ids.map(id=>document.getElementById(id));function filter(){const[q,g,w,t,s]=controls.map(c=>c.value.toLocaleLowerCase('de'));let count=0;for(const c of cards){const show=(!q||c.dataset.search.toLocaleLowerCase('de').includes(q))&&(!g||c.dataset.group.toLocaleLowerCase('de')===g)&&(!w||c.dataset.width===w)&&(!t||c.dataset.theme===t)&&(!s||c.dataset.state===s);c.hidden=!show;if(show)count++}document.getElementById('count').textContent=count+' von '+cards.length+' Ansichten'}controls.forEach(c=>c.addEventListener('input',filter));document.getElementById('reset').onclick=()=>{controls.forEach(c=>c.value='');filter()};const dialog=document.getElementById('viewer'),picture=document.getElementById('picture');let current=0,opener;function show(i){current=i;const d=DATA[i];picture.src=d.file;picture.alt=d.title;document.getElementById('viewer-title').textContent=d.title+' · '+d.width+' px · '+(d.theme==='dark'?'Dunkel':'Hell');document.getElementById('full').href=d.fullFile;document.getElementById('original').href=d.file;document.getElementById('viewer-body').scrollTop=0}document.querySelectorAll('[data-index]').forEach(b=>b.onclick=()=>{opener=b;show(Number(b.dataset.index));dialog.showModal()});document.getElementById('close').onclick=()=>dialog.close();dialog.addEventListener('close',()=>opener?.focus());function move(step){const visible=cards.filter(c=>!c.hidden).map(c=>Number(c.querySelector('[data-index]').dataset.index));let pos=visible.indexOf(current);show(visible[(pos+step+visible.length)%visible.length])}document.getElementById('prev').onclick=()=>move(-1);document.getElementById('next').onclick=()=>move(1);dialog.addEventListener('keydown',e=>{if(e.key==='ArrowRight'){e.preventDefault();move(1)}if(e.key==='ArrowLeft'){e.preventDefault();move(-1)}});filter();'''
page=f'''<!doctype html><html lang="de"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Senklot · Illustrationen · Gesamtentwurf</title><style>{style}</style></head><body><main><p class="eyebrow">SENKLOT · ILLUSTRATIONEN · GESAMTENTWURF · 29. OKTOBER 2026</p><h1>Eine Bildsprache.<br>Durch die ganze App.</h1><p class="lead">Die bestehende Lot-Linie mit präzisen, ruhigen technischen Zeichnungen. Kleine Akzente bei ausreichend Platz, erklärende Motive in leeren Bereichen und klare Arbeitsflächen in Planung, Tabellen und Formularen.</p><p class="notice">{len(cases)} Seiten-, Rollen-, Tab- und Dialogkontexte · {len(good)} Ansichten mit Bildschirmausschnitt und kompletter Seite · echte React-Komponenten mit fiktiven Vorschau-Daten und lokalen Gestaltungszusätzen. Die Live-App ist unverändert.</p><nav class="nav" aria-label="Galerieabschnitte"><a href="#ueberblick">Bereiche im Überblick</a><a href="#screens">Alle Ansichten</a><a href="#motive">Motivfamilie</a><a href="DESIGNLINIE.md">Gestaltungsregeln</a><a href="ABDECKUNG.md">Abdeckung und Grenzen</a></nav><section id="ueberblick"><h2>Neun Bereiche, dieselbe Linie</h2><div class="boards">{board_html}</div></section><section id="screens"><h2>Alle Seiten und Ansichten</h2><p>Ein Bild öffnen, dann mit „Vorherige“ und „Nächste“ oder den Pfeiltasten vergleichen. Unter „Ganze Seite“ ist auch der Inhalt unterhalb des ersten Bildschirms sichtbar. Die Breiten zeigen eigenständige responsive Layouts.</p><div class="filters"><label>Seite oder Tab suchen<input id="search" type="search" placeholder="Zum Beispiel Kundenakte, Urlaub, Support"></label><label>Bereich<select id="group"><option value="">Alle Bereiche</option>{options}</select></label><label>Gerät<select id="width"><option value="">Alle Breiten</option><option value="390">Handy · 390 px</option><option value="834">Tablet · 834 px</option><option value="1440">Desktop · 1440 px</option></select></label><label>Darstellung<select id="theme"><option value="">Hell und Dunkel</option><option value="light">Hell</option><option value="dark">Dunkel</option></select></label><label>Kontext<select id="state"><option value="">Alle Kontexte</option><option value="seite">Seiten und Dialoge</option><option value="zustand">Zusätzliche Zustände</option></select></label><button id="reset">Zurücksetzen</button></div><p id="count" class="status" role="status"></p><div class="grid">{''.join(cards)}</div></section><section id="motive" style="margin-top:48px"><h2>Zwölf zusammengehörige Zeichnungen</h2><p>Jede Zeichnung liegt zusätzlich als skalierbare SVG-Datei bei. Keine fremde Schrift, kein Bilddienst und kein Animationspaket nötig. Das Motiv „Dokumentablage“ ist eine Reserve; ein neuer allgemeiner Upload-Dialog wird hierdurch nicht behauptet.</p><div class="diagram">{motif_html}</div></section><footer><p>Designvorschau mit fiktiven Daten. Die Screens sind keine neue Funktions-, Sicherheits- oder Animationsabnahme. Bestehende mobile Navigation und Fachfunktionen bleiben Grundlage.</p><a href="README.md">Bildverzeichnis</a> · <a href="PRUEFUNG.md">Prüfbericht</a></footer></main><dialog id="viewer" aria-labelledby="viewer-title"><div class="lightboxbar"><p id="viewer-title"></p><div class="lightboxlinks"><button id="prev">Vorherige</button><button id="next">Nächste</button><a id="original" href="#">Originalbild</a><a id="full" href="#">Ganze Seite</a><button id="close">Schließen</button></div></div><div id="viewer-body" class="lightboxbody"><img id="picture" alt=""></div></dialog><script>const DATA={json.dumps(lightboxdata,ensure_ascii=False)};{script}</script></body></html>'''
(root/'index.html').write_text(page)

overview_css=style.split('body{')[0]+'''body{margin:0;padding:38px 42px;background:#f5f8f8;color:#13262c;font:14px/1.55 Poppins,system-ui,sans-serif}*{box-sizing:border-box}header{display:flex;justify-content:space-between;align-items:end;margin-bottom:25px}h1{font-size:30px;font-weight:600;line-height:1.35;margin:5px 0}p{margin:0;color:#526b73;font-size:12px}.grid{display:grid;grid-template-columns:1fr 1fr 320px 320px;gap:22px;align-items:start}figure{margin:0;min-width:0}figcaption{font-size:13px;line-height:1.5;font-weight:600;min-height:46px}img{display:block;width:100%;border:1px solid #c7d7dc;background:white}footer{font-size:12px;color:#526b73;margin-top:20px}'''
for id,title,d1,d2,m1,m2 in boards:
    items=[(d1,1440),(d2,1440),(m1,390),(m2,390)]
    figs=''.join(f'<figure><figcaption>{html.escape(titles[n])}<br><span style="font-weight:400;color:#526b73">{w} px</span></figcaption><img src="seiten/{n}-{w}.jpg" alt="{html.escape(titles[n],quote=True)}"></figure>' for n,w in items)
    (root/f'{id}.html').write_text(f'<!doctype html><html lang="de"><head><meta charset="utf-8"><style>{overview_css}</style></head><body><header><div><p>SENKLOT · ILLUSTRATIONEN · GESAMTENTWURF</p><h1>{html.escape(title)}</h1></div><p>29. Oktober 2026 · Designvorschau</p></header><div class="grid">{figs}</div><footer>Echte App-Komponenten · Fiktive Vorschau-Daten · Gestaltungszusätze nur in der lokalen Vorschau · Keine Live-Änderung</footer></body></html>')

readme=f'''# Senklot · Illustrationen durch die ganze App

**Designentwurf zur Durchsicht. Die Live-App wurde nicht verändert.**

{len(cases)} Seiten-, Rollen-, Tab- und Dialogkontexte in Handy-, Tablet- und Desktopbreite; zusätzlich ausgewählte dunkle Ansichten. Insgesamt **{len(good)} Ansichten**, jeweils als Bildschirmausschnitt und als komplette Seite.

[![Startseite mit Illustrationen](01-start.jpg)](01-start.jpg)

- **[Galerie herunterladen](entwurf.zip?raw=true)** – vollständig entpacken und `index.html` öffnen. Bilder, Schriften und SVGs sind enthalten; die Galerie benötigt keine Anmeldung oder Live-App-Verbindung.
- **Ohne Download:** Die Bereichsbögen und sämtliche Einzelbilder lassen sich direkt hier auf GitHub öffnen. Unter „Gesamt“ steht jeweils die vollständige Seite.
- [Gestaltungsregeln](DESIGNLINIE.md) · [Abdeckung und Grenzen](ABDECKUNG.md) · [Prüfbericht](PRUEFUNG.md)

## Die Linie

Kleine technische Zeichnungen in Petrol, helle Konstruktionslinien und wenige transparente Flächen. Die vorhandene Typografie, dünneren Zahlen, Listen, Aktenstruktur und mobile Navigation bleiben erhalten. Am Handy entfallen rein dekorative Kopfzeichnungen; erklärende Leerzustände bleiben klein. Dichte Planungen, Finanzformulare, Rechte und Sicherheitsabläufe erhalten keine zusätzlichen Illustrationen.

Die Aufnahmen entstehen aus echten React-Komponenten der bestehenden App. SVGs und der einmalige Einrichtungshinweis werden nur für die lokale Vorschau ergänzt. Beispieldaten und ausgewählte Antwortzustände sind simuliert; sichtbare Beispielwarnungen sind keine neuen Fehlerbefunde über die Live-App.

## Bereiche im Überblick

'''
for id,title,*_ in boards:
    if id!='01-start':readme+=f'### {title}\n\n[![{title}]({id}.jpg)]({id}.jpg)\n\n'
readme+='## Alle Seiten, Tabs und Dialoge\n\nJede Zeile zeigt denselben Kontext auf drei Geräten. „Bild“ ist der sichtbare Bildschirmausschnitt; „Gesamt“ enthält den gesamten Seiteninhalt. Nicht jede rechnerisch mögliche Filter-, Rechte- oder Eingabekombination ist ein eigener Screen.\n\n'
for g in groups:
    readme+=f'### {g}\n\n| Ansicht | Handy · 390 | Tablet · 834 | Desktop · 1440 |\n|---|---|---|---|\n'
    for c in [c for c in cases if c['group']==g]:
        links=[]
        for w in [390,834,1440]:
            r=next((r for r in good if r['name']==c['name'] and r['width']==w and r['theme']=='light'),None)
            links.append(f'[Bild](seiten/{r["file"]}) · [Gesamt](seiten/{r["fullFile"]})' if r else '**Aufnahme fehlt**')
        readme+=f'| {c["title"]} | '+ ' | '.join(links)+' |\n'
    readme+='\n'
readme+='## Dunkle Darstellung\n\n| Ansicht | Handy | Desktop |\n|---|---|---|\n'
for r in [r for r in good if r['theme']=='dark' and r['width']==390]:
    readme+=f'| {r["title"]} | [Bild](seiten/{r["file"]}) · [Gesamt](seiten/{r["fullFile"]}) | [Bild](seiten/{r["file"].replace("-390-","-1440-")}) · [Gesamt](seiten/{r["fullFile"].replace("-390-","-1440-")}) |\n'
readme+='\n## Skalierbare Motive\n\n'+ ' · '.join(f'[{label}](svg/{id}.svg)' for id,label in motifs)+'\n'
(root/'README.md').write_text(readme)

bad=[r for r in rows if r.get('error') or r.get('errors') or r.get('failedResponses')]
violations=[dict(name=r['name'],width=r['width'],theme=r['theme'],violations=r['violations']) for r in rows if r.get('violations')]
summary=dict(contexts=len(cases),views=len(good),viewportImages=len(good),fullPageImages=len(good),widths=[390,834,1440],darkViews=sum(r['theme']=='dark' for r in good),axeRuns=sum('violations' in r for r in rows),errors=[{k:r.get(k) for k in ['name','width','theme','error','errors','failedResponses']} for r in bad],axeViolations=violations,controlsUnchanged=all(r.get('controlsUnchanged') for r in good),copyUnchanged=all(r.get('copyUnchanged') for r in good),headersUnchanged=all(r.get('headerTitleUnchanged') for r in good),noDocumentOverflow=all(r['after']['scrollWidth']<=r['width'] for r in good),sourceCommit=subprocess.check_output(['git','rev-parse','HEAD'],cwd='/workspace/Senklot-Premium-Umsetzung',text=True).strip(),deployedBaseline='d133f64ddcf99f6378797e3a4fe9d73a0ae5a43c',productionChanged=False)
(root/'pruefung.json').write_text(json.dumps(summary,ensure_ascii=False,indent=2)+'\n')
(root/'PRUEFUNG.md').write_text(f'''# Vorschauprüfung

- {len(cases)} Kontexte, {len(good)} responsive Ansichten, je ein Bildschirmausschnitt und eine Gesamtaufnahme.
- Drei eigenständige Breiten: 390, 834, 1440 px. {summary['darkViews']} ergänzende dunkle Ansichten.
- {summary['axeRuns']} automatische mobile axe-Durchgänge; {len(violations)} Ansichten mit gemeldeten Befunden. Diese Prüfung ist keine vollständige Barrierefreiheitsabnahme.
- {len(bad)} fehlgeschlagene Aufnahmen, JavaScript- oder lokale Ressourcenfehler im abschließenden Durchgang.
- Auf allen erfolgreichen Ansichten wurden vor/nach Ergänzen der Zeichnung unveränderte Anzahl der Bedienelemente und unveränderte Seitentitel geprüft. Bestehende Texte bleiben gleich; nur der ausdrücklich als Konzept gekennzeichnete Einrichtungshinweis ergänzt Text.
- Keine horizontalen Dokumentüberläufe in den erfolgreich erfassten Breiten: {summary['noDocumentOverflow']}.

Die Vorschau sperrt externe Netzwerkanfragen. Es wurden keine Produktionsdaten gelesen oder geschrieben und keine echten Speicher-, Rechnungs-, Einladungs- oder Berechtigungsaktionen ausgeführt. Die verwendete lokale Datenquelle ist die vorhandene App-Vorschau; sie ist kein fachlicher Rechen- oder Datenbanktest.

Die Screens beweisen keine korrekten Animationen, keine vollständig erhaltene Fachfunktion und keine Abnahme auf physischen Geräten. Das folgt erst bei einer freigegebenen Umsetzung. Für diesen Entwurf sind weder Source-App-Änderungen, neue Datenbankstrukturen, ein Merge nach main noch ein App-Deploy erforderlich.

Die Galerie wird lokal auf drei Breiten mit Suche, Filtern, Tastatur-Bildbetrachter, Escape und Rückfokus geprüft. Zusätzlich wird der Aufruf aller externen Ressourcen blockiert. Die direkte file://-Navigation ist im verwalteten Chromium durch eine Browserrichtlinie gesperrt; der Dateidoppelklick kann hier daher nicht als geprüft gelten. Es wird keine Browserrichtlinie verändert. Sämtliche relativen Bild- und Dateiverweise werden zusätzlich kontrolliert.

[Messdaten](pruefung.json) · [Umfang](ABDECKUNG.md)
''')
(root/'DESIGNLINIE.md').write_text('''# Gemeinsame Bildsprache

1. Bestehende Lot-Typografie und Fachseiten sind Grundlage. Die Zeichnungen ergänzen, sie bilden kein neues Navigations- oder Kartensystem.
2. Technische Linienillustrationen: einheitlicher Zeichenraum 160 × 104, Kontur 1,4, Hilfslinie 1,0, wenige Flächen mit 12 % Deckkraft. Farben kommen aus den vorhandenen Theme-Variablen.
3. Ein kleiner Kopfakzent pro geeigneter Hauptseite, 112 × 73 CSS-Pixel. Erst ab 1280 px sichtbar; keine Kopfillustration auf Tablet oder Handy, keine neue Kopfzeile.
4. Erklärende Leerzeichnung: Desktop 136 × 88, mobil 104 × 68 CSS-Pixel. Keine permanente Dekoration zwischen gefüllten Listenzeilen.
5. Filter ohne Treffer ist ein eigener Zustand, kein erster Einstieg. Hier bleibt die Meldung auf die aktuelle Suche bezogen. Kein Erfolgsmotiv bei Ladefehlern.
6. Startseite: Arbeitsansicht mit kleinem Gebäudeakzent; bei vollständig geladenem, leerem Aufgabenbereich eine ruhige Abschlusszeichnung. Termine bleiben davon unabhängig sichtbar. Ein separater Screen zeigt, dass Ladefehler als Warnung bestehen bleiben.
7. Planung: Das bedienbare Raster erhält keine Illustration über freien Zellen. Wochen-, Monats-, Tages- und persönliche Planung bleiben funktionale Arbeitsflächen.
8. Akten: Keine großen Kennzahlen oder zusätzlichen Bildkästen. In leeren Planunterlagen darf eine kleine Zeichnung helfen; gefüllte Akten und Bearbeitungsformulare bleiben klar.
9. Einstellungen: Auf der Übersicht ein kleiner Kopfakzent. In der zusätzlichen Einrichtungsvariante der Firmendaten ein kompakter erklärender Hinweis. Nicht dauerhaft in allen Formularen wiederholen.
10. Globaler Admin: Dasselbe Linienmotiv auf der Bereichsebene; keine verspielten Zusätze bei Notzugang, Passwort, zweitem Faktor oder Löschvorgängen.
11. Alle Zeichnungen sind dekorativ, mit aria-hidden und ohne Fokus, Klickfläche oder Statusinformation. Text und echte Aktionen tragen die Bedeutung. Keine Grafik ersetzt einen Wert, eine Warnung oder einen Termin.
12. Die vorgeschlagenen Motive sind statisch. Eine optionale spätere einmalige Einblendung darf keine Layoutverschiebung verursachen und entfällt bei reduzierter Bewegung. Kein Wippen, Pendeln oder Dauerpulsieren.

Die zwölf SVG-Dateien lassen sich ohne neue Bibliothek in die vorhandene LotLeerzeichnung-Komponente überführen. Das zusätzliche Ablagemotiv ist ein verfügbarer Baustein; daraus folgt kein neuer allgemeiner Upload-Bereich in der aktuellen App.
''')
(root/'ABDECKUNG.md').write_text(f'''# Abdeckung des Gesamtentwurfs

Basis: Quellstand `{summary['sourceCommit']}`, inhaltlich identisch mit dem ausgelieferten Main-Stand `{summary['deployedBaseline']}`. Keine Produktdatei wird für den Entwurf verändert.

Abgeglichen wurden die echten Routendefinitionen in `src/app/App.tsx`, die Hauptnavigation und Unterseiten in `src/app/navigation.ts` sowie die Aktenreiter und bereichseigenen Tabs. Die vorhandenen 69 Vorschaukontexte wurden auf {len(cases)} erweitert.

Enthalten: Startseiten aller sechs Betriebsrollen; sämtliche Hauptbereiche; Wochen-/Monats-/Tagesplanung; eigener Einsatzplan und Team-Woche; Monat, Woche und „Alle Tage vergleichen“ der Mitarbeiterübersicht; Anforderungen und alle Lagerreiter; Kunden-, Baustellen- und Benutzerakten mit allen vorhandenen Reitern; Angebote und Rechnungen samt Listensichten und wichtigen Dialogen; alle Einstellungsunterseiten; alle fünf Bereiche des globalen Admins einschließlich Betriebsakte und weiterer Unteransichten; Anmeldung, Passwort vergessen, zweiter Faktor, Wiederherstellung, Impressum und Datenschutz.

Ergänzend: tatsächliche lokale Leerzustände, Suche ohne Treffer, leerer Aufgabenbereich, nicht geladene Teamdaten und der einmalige Einrichtungshinweis. Die Zeichnungen werden im Browser ergänzt; der bestehende Text und die Bedienelemente bleiben erhalten. Der Einrichtungshinweis ergänzt ausdrücklich neuen Konzepttext. Ausgewählte Antwort- und Sitzungszustände werden nur in dieser Vorschau simuliert.

Nicht als eigene Fachseiten gezählt: interne Entwickler-Musterseite `/_muster`, alte Weiterleitungsadressen, jede mögliche Kombination von Suchbegriffen, Rollenrechten, Datensätzen oder Fehlerantworten. Ein Tab wird mit einem repräsentativen Beispieldatensatz gezeigt; dies ist kein Anspruch auf sämtliche denkbaren Zustände und keine vollständige Funktionsabnahme.

## Gestaltungsentscheidung je Kontext

| Kontext | Pfad | Rolle | Illustrationsregel |
|---|---|---|---|
'''+''.join(f'| {c["title"]} | `{c["route"]}` | {c["role"]} | {c["decision"]} |\n' for c in cases))
print(json.dumps(summary,ensure_ascii=False))
