from pathlib import Path
import json, html

root=Path(__file__).resolve().parent.parent
states=json.loads((root/'szenarien.json').read_text())
pages=json.loads((root/'seiten.json').read_text())
page_report=json.loads((root/'seiten-pruefung.json').read_text())
state_report=json.loads((root/'zustaende-pruefung.json').read_text())
labels={
'start':'Start · Verwaltung','start-monteur':'Start · Mitarbeiter','start-buchhaltung':'Start · Buchhaltung',
'zeit':'Zeiterfassung','material':'Material erfassen','anforderungen':'Materialanforderungen',
'lager':'Lager','eigener-plan':'Eigener Einsatzplan','teamplan':'Teamplan','meine-baustellen':'Meine Baustellen',
'urlaub':'Urlaub','sonderurlaub':'Sonderurlaub','scheine':'Handwerksscheine','schein-neu':'Handwerksschein schreiben',
'angebote':'Angebote','angebotsakte':'Angebotsakte','kunden':'Kunden','kundenakte':'Kundenakte · Übersicht',
'wartungen':'Wartungen','baustellen':'Baustellen','baustellenakte':'Baustellenakte · Auftrag',
'wochenplan':'Einsatzplanung · Woche','tagesplan':'Einsatzplanung · Tag','benutzer':'Benutzerverwaltung',
'benutzerakte':'Benutzerakte · Person','konto':'Eigenes Konto · Meldungen','einstellungen':'Einstellungen · Übersicht',
'firmendaten':'Einstellungen · Firma','saetze':'Einstellungen · Verrechnungssätze','rechnungsvorgaben':'Einstellungen · Rechnung',
'nummern':'Einstellungen · Nummern','personal':'Einstellungen · Personal','konten':'Einstellungen · Buchhaltungskonten',
'support':'Einstellungen · Support','module':'Einstellungen · Module','sicherung':'Einstellungen · Datensicherung',
'kalkulation':'Nachkalkulation','rechnungen':'Rechnungen','mitarbeiter':'Mitarbeiterübersicht · Monat',
'impressum':'Impressum','datenschutz':'Datenschutz','plattform':'Globaler Admin · Betriebe',
'planung-monat':'Einsatzplanung · Monat','mitarbeiter-woche':'Mitarbeiterübersicht · Woche',
'mitarbeiter-tage':'Mitarbeiterübersicht · Tage ohne Buchung',
'lager-katalog':'Lager · Katalog','lager-import':'Lager · Import',
'anforderungen-einkauf':'Anforderungen · Einkauf','anforderungen-retouren':'Anforderungen · Retouren',
'anforderungen-erledigt':'Anforderungen · Erledigt','plattform-support':'Globaler Admin · Supportzugänge',
'plattform-fehler':'Globaler Admin · Fehlerprotokoll','plattform-zins':'Globaler Admin · Basiszinssatz',
'plattform-konto':'Globaler Admin · Mein Konto','urlaub-krank':'Urlaub · Krankenstände',
'urlaub-betrieb':'Urlaub · Betriebsurlaub','baustellenakte-scheine':'Baustellenakte · Scheine',
'baustellenakte-termine':'Baustellenakte · Termine','baustellenakte-plaene':'Baustellenakte · Pläne',
'kundenakte-baustellen':'Kundenakte · Baustellen','kundenakte-belege':'Kundenakte · Belege',
'kundenakte-termine':'Kundenakte · Termine und Wartungen','kundenakte-stammdaten':'Kundenakte · Stammdaten',
'benutzerakte-arbeitszeit':'Benutzerakte · Arbeitszeit und Urlaub','benutzerakte-zugang':'Benutzerakte · Zugang und Rechte',
'anmeldung':'Anmeldung','passwort-vergessen':'Passwort vergessen','zweiter-faktor':'Zweiter Faktor',
'wiederherstellung':'Wiederherstellungscode'}
by_state={s['id']:s for s in states}
cards=[]
for r in state_report:
 s=by_state[r['state']]
 cards.append(dict(title=s['title'],text=s['description'],kind='Zustände',width=r['width'],theme=r['theme'],file='screens/'+r['file'],id=s['id']))
for r in page_report:
 cards.append(dict(title=labels.get(r['name'],r['name']),text=r['role']+' · '+r['route'],kind='Seiten',width=r['width'],theme=r['theme'],file='seiten/'+r['file'],id=r['name']))

style='''@font-face{font-family:Poppins;src:url(assets/poppins-400.woff2);font-weight:400}@font-face{font-family:Poppins;src:url(assets/poppins-600.woff2);font-weight:600}*{box-sizing:border-box}body{margin:0;background:#f4f7f7;color:#142c32;font:14px/1.65 Poppins,system-ui,sans-serif}main{max-width:1540px;margin:auto;padding:36px 28px 60px}a{color:#0f4552;text-underline-offset:4px}h1{font-size:34px;line-height:1.3;margin:5px 0 16px;font-weight:600}h2{font-size:23px;margin:32px 0 12px}p{max-width:90ch}.eyebrow{font-size:12px;color:#5a6d72;margin:0}.intro{display:grid;grid-template-columns:1.3fr 1fr;gap:40px;align-items:center}.intro img{width:100%;border:1px solid #d6e1e4}.notice{border-left:3px solid #0f4552;padding-left:16px}.links{display:flex;gap:12px 24px;flex-wrap:wrap}.filters{position:sticky;top:0;background:#f4f7f7;z-index:2;border-block:1px solid #c9d6d9;display:flex;flex-wrap:wrap;gap:12px;padding:16px 0;margin-top:28px}.filters label{display:flex;gap:8px;align-items:center}input,select,button{font:inherit;padding:10px;border:1px solid #b5c9cd;border-radius:6px;background:white;color:#142c32;min-height:44px}input{min-width:240px}a:focus-visible,button:focus-visible,input:focus-visible,select:focus-visible{outline:3px solid #0f4552;outline-offset:3px}.grid{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:32px 24px}.shot{background:white;border:1px solid #d6e1e4;overflow:hidden}.shot a{display:block;text-decoration:none}.shot figure{margin:0}.shot img{display:block;width:100%;height:320px;object-fit:contain;object-position:top;background:#e7eeee}.shot figcaption{padding:17px}.shot b{display:block;font-size:14px;font-weight:600}.shot p{font-size:12px;color:#5a6d72;margin:8px 0}.shot small{color:#5a6d72}.videos{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:22px}.videos figure{margin:0}.videos video{width:100%;height:400px;background:#dae5e7;object-fit:contain}.videos figcaption{font-size:12px;margin-top:8px}#count{min-height:24px}footer{margin-top:45px;color:#5a6d72;font-size:12px}@media(max-width:900px){.intro{grid-template-columns:1fr}.grid{grid-template-columns:repeat(2,minmax(0,1fr))}.videos{grid-template-columns:1fr 1fr}}@media(max-width:550px){main{padding:24px 16px}h1{font-size:28px}.grid{grid-template-columns:1fr}.filters{position:static;flex-direction:column}.filters label{justify-content:space-between}input{min-width:0;width:100%}.shot img{height:400px}.videos{grid-template-columns:1fr}.videos video{height:500px}}'''
videos=[('01-speichern','Speichern · laufend, bestätigt, Fehler, erneuter Versuch'),('02-rueckfrage','Offene Änderungen · weiterarbeiten oder bewusst verwerfen'),('03-katalog','Katalog · Übernahme, aktuelle Suche, keine Treffer'),('04-zeilenmenue','Echtes React-Menü · öffnen, Tastatur, Escape, Rückfokus')]
video_html=''.join(f'<figure><video controls preload="metadata" playsinline aria-label="{html.escape(title)}"><source src="bewegung/{id}.mp4" type="video/mp4"></video><figcaption>{html.escape(title)} · <a href="bewegung/{id}.mp4">MP4 öffnen</a></figcaption></figure>' for id,title in videos)
card_html=''.join(f'''<article class="shot" data-kind="{c['kind']}" data-width="{c['width']}" data-theme="{c['theme']}" data-search="{html.escape(c['title']+' '+c['text'],quote=True)}"><a href="{c['file']}" target="_blank" rel="noopener"><figure><img src="{c['file']}" alt="{html.escape(c['title'],quote=True)} · {c['width']} px · {'dunkel' if c['theme']=='dark' else 'hell'}" loading="lazy"><figcaption><b>{html.escape(c['title'])}</b><small>{c['kind']} · {c['width']} px · {'dunkel' if c['theme']=='dark' else 'hell'}</small><p>{html.escape(c['text'])}</p></figcaption></figure></a></article>''' for c in cards)
gallery=f'''<!doctype html><html lang="de"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Lot · Premium Entwurf 02</title><style>{style}</style></head><body><main>
<div class="intro"><div><p class="eyebrow">SENKLOT · DESIGNVORSCHAU · 28. OKTOBER 2026</p><h1>Eine ruhige Linie.<br>Präzise bis ins Detail.</h1><p>Der bestehende Lot-Aufbau bleibt. Speichern, Suchen, Dialoge und Rückmeldungen erhalten dieselben klaren Zustände und kurzen Bewegungen.</p><p class="notice">303 Bilder: 219 echte Seitenaufnahmen mit gemeinsamem Darstellungsstil und 84 isolierte Zustandsentwürfe. Fiktive Daten. Die App ist unverändert.</p><div class="links"><a href="#bewegung">Bewegung ansehen</a><a href="#screens">Alle Screens</a><a href="vorschau.html?screen=firmendaten">Zustände ausprobieren</a><a href="werkstatt.html">Bausteine und Icons</a></div></div><a href="ueberblick-mobil.jpg"><img src="ueberblick-mobil.jpg" alt="Vier mobile Beispielansichten im Vergleich"></a></div>
<h2 id="bewegung">Das Verhalten mit ansehen</h2><p>Kurze Aufnahmen ohne Ton und ohne automatischen Start. Die ersten drei sind Designsimulationen; das vierte zeigt ein Menü der lokalen React-Vorschau. Keine Live-Verbindung, keine echten Speicherungen.</p><div class="videos">{video_html}</div>
<h2 id="screens">Alle Seiten und Zustände</h2><p>Bild anklicken für Originalgröße. Die Seiten zeigen den vorhandenen Aufbau mit gemeinsamen Darstellungsregeln. Die Zustände zeigen die vorgeschlagenen Ergänzungen; Ausschnitte ersetzen keine vollständigen Fachseiten.</p>
<div class="filters"><label><span class="sr-only">Suchen</span><input id="search" type="search" placeholder="Seite, Tab oder Zustand suchen" aria-label="Seite, Tab oder Zustand suchen"></label><label>Bereich <select id="kind"><option value="">Alle</option><option>Zustände</option><option>Seiten</option></select></label><label>Breite <select id="width"><option value="">Alle</option><option value="390">Handy · 390</option><option value="834">Tablet · 834</option><option value="1440">Desktop · 1440</option></select></label><label>Darstellung <select id="theme"><option value="">Alle</option><option value="light">Hell</option><option value="dark">Dunkel</option></select></label><button id="reset">Zurücksetzen</button></div><p id="count" role="status">303 Bilder</p><div class="grid">{card_html}</div>
<footer><div class="links"><a href="README.md">Bildverzeichnis</a><a href="DESIGNLINIE.md">Designentscheidungen</a><a href="PRUEFUNG.md">Prüfung und Grenzen</a><a href="AUDIT-BASIS.md">Offene technische Befunde</a><a href="FUNKTIONSERHALT.md">Funktionsschutz</a></div><p>Keine neue Seitenarchitektur, kein Hamburger-Menü, keine neue Icon-Bibliothek und keine Änderung des App-Icons. Umsetzung und technische Abnahme folgen erst nach Durchsicht.</p></footer>
</main><script>const ids=['search','kind','width','theme'],controls=ids.map(id=>document.getElementById(id)),cards=[...document.querySelectorAll('.shot')];function filter(){{const[q,k,w,t]=controls.map(c=>c.value.toLocaleLowerCase('de'));let n=0;cards.forEach(c=>{{const on=(!q||c.dataset.search.toLocaleLowerCase('de').includes(q))&&(!k||c.dataset.kind.toLocaleLowerCase('de')===k)&&(!w||c.dataset.width===w)&&(!t||c.dataset.theme===t);c.hidden=!on;if(on)n++}});document.getElementById('count').textContent=n+' von '+cards.length+' Bildern'}}controls.forEach(c=>c.addEventListener('input',filter));document.getElementById('reset').onclick=()=>{{controls.forEach(c=>c.value='');filter()}};</script></body></html>'''
# Global [hidden] remains explicit despite card display rules.
gallery=gallery.replace('.grid{display:grid','[hidden]{display:none!important}.sr-only{position:absolute;width:1px;height:1px;overflow:hidden;clip:rect(0,0,0,0)}.grid{display:grid',1)
(root/'index.html').write_text(gallery)

md='''# Lot · Premium-Entwurf 02

**Neue Screens und Bewegungsbeispiele zur Durchsicht. App und Live-Stand unverändert.**

Die freigegebene Linie bleibt: offene Listen, ruhige Typografie, dünnere Zahlen und das bisherige mobile Menü. Neu ausgearbeitet sind einheitliche Aktionszustände, kurze Übergänge, nachvollziehbares Speichern und zwei zurückhaltende Lot-Zeichnungen für den ersten Einstieg.

[![Mobile Vorschau](ueberblick-mobil.jpg)](ueberblick-mobil.jpg)

- [Desktop-Überblick](ueberblick-desktop.jpg)
- [Galerie und interaktive Zustandsvorschau herunterladen](entwurf.zip?raw=true) – vollständig entpacken, dann `index.html` öffnen. Alle Bilder und Videos sind im Paket. Die Galerie benötigt keine Anmeldung und lädt keine Live-App-Daten.
- [Gestaltungsregeln und Bewegungswerte](DESIGNLINIE.md) · [Prüfung und Grenzen](PRUEFUNG.md)
- [Weiterhin offene technische Punkte](AUDIT-BASIS.md) · [Funktionsschutz](FUNKTIONSERHALT.md)

## Zuerst ansehen

| Ergänzung | Handy | Desktop |
|---|---|---|
| Speicheraktion läuft | [Screen](screens/firma-speichert-390.jpg) | [Screen](screens/firma-speichert-1440.jpg) |
| Bestätigter Stand | [Screen](screens/gespeichert-390.jpg) | [Screen](screens/gespeichert-1440.jpg) |
| Fehler mit erhaltenen Eingaben | [Screen](screens/firma-fehler-390.jpg) | [Screen](screens/firma-fehler-1440.jpg) |
| Erste Baustelle mit Lot-Zeichnung | [Screen](screens/baustellen-leer-390.jpg) | [Screen](screens/baustellen-leer-1440.jpg) |
| Erstes Angebot, gleiche Bildsprache | [Screen](screens/angebote-leer-390.jpg) | [Screen](screens/angebote-leer-1440.jpg) |
| Gemeinsame Zustände und alle 29 Icons | [Screen](screens/bausteine-390.jpg) | [Screen](screens/bausteine-1440.jpg) |

## Bewegungsbeispiele

MP4-Dateien lassen sich direkt öffnen oder herunterladen. Kein automatischer Start. Drei Designmodelle mit ausdrücklich simulierten Antworten und ein tatsächliches Menü der lokalen React-Vorschau; keine echten Schreibvorgänge.

'''
md+='\n'.join(f'- [{title}](bewegung/{id}.mp4)' for id,title in videos)
md+='''

## Alle vorgeschlagenen Zustände

24 Szenarien in drei Breiten, zusätzlich zwölf dunkle Bilder. Die vollständigen Fachseiten werden durch diese gezielt reduzierten Ausschnitte nicht ersetzt.

| Zustand | Idee | Handy | Tablet | Desktop |
|---|---|---|---|---|
'''
for s in states:
 md+=f"| {s['title']} | {s['description']} | [390](screens/{s['id']}-390.jpg) | [834](screens/{s['id']}-834.jpg) | [1440](screens/{s['id']}-1440.jpg) |\n"
md+='\n## Alle Seiten, Rollen und Tabs\n\n69 Kontexte, jeweils drei Breiten. Echte React-Komponenten mit fiktiven Vorschau-Daten und im Browser ergänzten gemeinsamen Darstellungsregeln. Kein neuer Seitenumbau: vorhandene Gestaltung bleibt gezielt erhalten. Nicht jede mögliche Dialog-, Rechte- oder Datenkombination ist ein eigener Screen.\n\n| Ansicht | Rolle | Handy | Tablet | Desktop |\n|---|---|---|---|---|\n'
for p in pages:
 id=p['name'];md+=f"| {labels.get(id,id)} | {p['role']} | [390](seiten/{id}-390.jpg) | [834](seiten/{id}-834.jpg) | [1440](seiten/{id}-1440.jpg) |\n"
md+='\n## Dunkle Darstellung\n\n| Kontext | Handy | Desktop |\n|---|---|---|\n'
for r in [r for r in cards if r['theme']=='dark' and r['width']==390]:
 md+=f"| {r['title']} · {r['kind']} | [390]({r['file']}) | [1440]({r['file'].replace('-390-','-1440-')}) |\n"
md+='''
## Prüfbasis und offene Arbeit

303 Bilder, keine gefundenen horizontalen Dokumentüberläufe in den erfassten Hauptbreiten. 75 mobile axe-Prüfungen an tatsächlichen Seiten und 84 an Zustandsentwürfen, 13 Modell-Interaktionsprüfungen, 92 ergänzende Breitenprüfungen sowie vier Fokusprüfungen. Das ist eine Vorschauprüfung in Chromium, keine Zusicherung vollständiger Barrierefreiheit oder fertiger Funktionsabnahme. Safari und echte Mobilgeräte folgen bei einer späteren Umsetzung.

Die neun technischen Audit-Befunde bleiben offen. Insbesondere muss ein sicherer Statusabgleich nach unterbrochener Rechnungserstellung technisch belegt werden; Animation oder Buttonbeschriftung lösen das nicht. [Details und Grenzen](PRUEFUNG.md).

Basis: [7601e378](https://github.com/juliandeutsch22/Prototype-App-Installateure/tree/7601e3781d4645aed2479bb8bbae9a1742e57b5b). Keine neue Bibliothek, Datenbank oder API. Keine Änderung des App-Icons, kein Merge in main, kein App-Deploy.
'''
(root/'README.md').write_text(md)

# Visuelle Vergleichsbögen werden anschließend im Browser gerendert.
overview_style='''@font-face{font-family:Poppins;src:url(assets/poppins-400.woff2);font-weight:400}@font-face{font-family:Poppins;src:url(assets/poppins-600.woff2);font-weight:600}*{box-sizing:border-box}body{margin:0;background:#edf3f4;color:#142c32;font:14px Poppins,sans-serif;padding:36px 40px}header{display:flex;align-items:end;justify-content:space-between;margin-bottom:28px}h1{font-size:34px;font-weight:600;margin:6px 0}p{margin:0;color:#5a6d72;font-size:13px}.grid{display:grid;gap:24px}figure{margin:0;min-width:0}figcaption{font-size:14px;margin-bottom:12px;font-weight:600}img{display:block;width:100%;border:1px solid #c7d7db;background:white}footer{margin-top:20px;color:#5a6d72;font-size:12px}'''
mobile=[('Start · bestehende Linie','seiten/start-390.jpg'),('Speichern · laufend','screens/firma-speichert-390.jpg'),('Katalog · aktueller Treffer','screens/katalog-treffer-390.jpg'),('Erste Baustelle · Lot-Zeichnung','screens/baustellen-leer-390.jpg')]
desktop=[('Start · bestehender Aufbau','seiten/start-1440.jpg'),('Wochenplanung · vertrauter Stil','seiten/wochenplan-1440.jpg'),('Mitarbeiter · vorhandene Übersicht','seiten/mitarbeiter-1440.jpg'),('Erste Baustelle · ruhiger Einstieg','screens/baustellen-leer-1440.jpg'),('Speicherstand · eindeutig bestätigt','screens/gespeichert-1440.jpg'),('Akten · bestehende Reiter','seiten/kundenakte-1440.jpg')]
for mode,items,cols in [('mobil',mobile,4),('desktop',desktop,3)]:
 figs=''.join(f'<figure><figcaption>{html.escape(title)}</figcaption><img src="{file}" alt="{html.escape(title)}"></figure>' for title,file in items)
 content=f'<!doctype html><html lang="de"><head><meta charset="utf-8"><style>{overview_style}.grid{{grid-template-columns:repeat({cols},1fr)}}'+('img{height:410px;object-fit:contain;object-position:top}' if mode=='desktop' else '')+f'</style></head><body><header><div><p>SENKLOT · PREMIUM-ENTWURF 02</p><h1>Vertraute Linie. Präzise Rückmeldung.</h1></div><p>28. Oktober 2026 · Designvorschau</p></header><div class="grid">{figs}</div><footer>Fiktive Daten · gemeinsame Gestaltungsregeln · keine Änderung der Live-App. Bewegungen und weitere Ansichten im vollständigen Entwurf.</footer></body></html>'
 (root/('ueberblick-'+mode+'.html')).write_text(content)
print(f'{len(cards)} Karten, {len(pages)} Kontexte, {len(states)} Zustände')
