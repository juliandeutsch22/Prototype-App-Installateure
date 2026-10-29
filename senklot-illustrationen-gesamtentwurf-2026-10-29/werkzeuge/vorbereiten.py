from pathlib import Path
import json,re,shutil

root=Path(__file__).resolve().parent.parent
source=Path('/workspace/Senklot-Premium-Umsetzung')
cases=json.loads((root/'werkzeuge/basis-seiten.json').read_text())
labels={}
for line in Path('/workspace/Senklot-Premium-Umsetzung-Nachweise/README.md').read_text().splitlines():
    m=re.search(r'^\| ([^|]+) \|.*?\]\(seiten/([\w-]+)-320.jpg\)',line)
    if m: labels[m[2]]=m[1].strip()
labels.update({'saetze':'Sätze und Kosten','nummern':'Nummernkreise','konto':'Mein Konto','personal':'Personal','konten':'Kontenrahmen','sicherung':'Datensicherung','module':'Module','support':'Supportzugang','start':'Start · Administration','start-monteur':'Start · Mitarbeiter','start-buchhaltung':'Start · Buchhaltung'})

def add(name,route,role,title,**kw): cases.append(dict(name=name,route=route,role=role,title=title,**kw))
for name,role in [('verwaltung','Verwaltung'),('projektleitung','Projektleiter'),('geschaeftsfuehrung','Geschäftsführung')]:
    add('start-'+name,'/',role,'Start · '+role)
for name,route,title in [
    ('rechnungen-erledigt','/invoices?ansicht=erledigt','Rechnungen · Erledigt'),
    ('rechnungen-alle','/invoices?ansicht=alle','Rechnungen · Alle'),
    ('angebote-erledigt','/quotes?ansicht=erledigt','Angebote · Erledigt'),
    ('angebote-alle','/quotes?ansicht=alle','Angebote · Alle'),
    ('baustellen-erledigt','/admin-projects?stand=archiv','Baustellen · Erledigt'),
    ('baustellen-alle','/admin-projects?stand=alle','Baustellen · Alle'),
    ('kunden-anschrift','/customers?auswahl=pruefen','Kunden · Anschrift prüfen'),
    ('kunden-art','/customers?auswahl=ohne-art','Kunden · Ohne Kundenart'),
    ('benutzer-inaktiv','/user-mgmt?status=inaktiv','Benutzer · Deaktivierte'),
    ('benutzer-alle','/user-mgmt?status=alle','Benutzer · Alle'),
    ('scheine-alle','/worksheets?ansicht=alle','Handwerksscheine · Alle'),
    ('lager-knapp','/lager?filter=knapp','Lager · Knapp'),
    ('lager-fehlt','/lager?filter=fehlt','Lager · Fehlend'),
]: add(name,route,'Administrator',title)
add('urlaub-eigene','/vacations','Mitarbeiter','Urlaub · Eigene Anträge')
add('rechnungen-lesend','/invoices','Projektleiter','Rechnungen · Lesender Zugriff',extraAuth='rechnungenLesen')
add('planung-baustellen','/assignments/woche?sicht=baustellen','Projektleiter','Wochenplan · Nach Baustellen')
add('einsatz-planen','/assignments/woche','Projektleiter','Einsatzplanung · Einsatz planen',open='Einsatz planen')
add('mitarbeiter-person','/accounting','Buchhaltung','Mitarbeiterübersicht · Person im Monat',action='person')

# Die Dialoge werden tatsächlich geöffnet, nicht als Ersatzformulare nachgebaut.
for name,route,title,button in [
    ('kunde-neu','/customers','Kunden · Anlegen','Neuer Kunde'),
    ('baustelle-neu','/admin-projects','Baustellen · Anlegen','Neue Baustelle'),
    ('benutzer-neu','/user-mgmt','Benutzer · Anlegen','Benutzer anlegen'),
    ('angebot-neu','/quotes','Angebote · Neuer Entwurf','Neues Angebot'),
    ('rechnung-neu','/invoices','Rechnungen · Erstellen','Neue Rechnung'),
    ('plattform-neu','/plattform','Globaler Admin · Betrieb anlegen','Betrieb anlegen'),
    ('plattform-notzugang','/plattform','Globaler Admin · Notzugang','Notzugang öffnen'),
    ('plattform-loeschprotokoll','/plattform','Globaler Admin · Löschprotokoll','Löschprotokoll (1)'),
    ('plattform-sitzung','/plattform','Globaler Admin · Sitzungsübersicht','In dieser Sitzung angelegt (1)'),
]: add(name,route,'Plattformadministrator' if name.startswith('plattform') else 'Administrator',title,open=button)
add('plattform-passwort','/plattform','Plattformadministrator','Globaler Admin · Passwort im Notzugang',tab='Supportzugänge',open='Passwort neu setzen')
add('plattform-zweiter-faktor','/plattform','Plattformadministrator','Globaler Admin · Zweiten Faktor verwalten',tab='Supportzugänge',open='Zwei-Faktor zurücksetzen')
add('rechnung-details','/invoices','Buchhaltung','Rechnung · Detaildialog',action='invoice')
add('plattform-betrieb','/plattform','Plattformadministrator','Globaler Admin · Betriebsakte',action='betrieb')
add('baustellenakte-bearbeiten','/admin-projects/p1','Administrator','Baustellenakte · Stammdaten bearbeiten',action='projekt-edit')
add('kundenakte-bearbeiten','/customers/k1?bereich=daten','Administrator','Kundenakte · Stammdaten bearbeiten',action='kunde-edit')
add('benutzerakte-bearbeiten','/user-mgmt/u1','Administrator','Benutzerakte · Profil bearbeiten',action='benutzer-edit')

for name,route,title,fixture,motif in [
    ('baustellen-erstnutzung','/admin-projects','Baustellen · Erste Anlage','baustellen','bau'),
    ('kunden-erstnutzung','/customers','Kunden · Erste Anlage','kunden','akte'),
    ('angebote-erstnutzung','/quotes','Angebote · Erster Entwurf','angebote','beleg'),
    ('rechnungen-erstnutzung','/invoices','Rechnungen · Noch keine Belege','rechnungen','beleg'),
    ('scheine-erstnutzung','/worksheets','Handwerksscheine · Erster Schein','scheine','beleg'),
    ('wartungen-erstnutzung','/wartungen','Wartungen · Noch keine Vereinbarung','wartungen','wartung'),
    ('anforderungen-leer','/anforderungen','Anforderungen · Nichts offen','bestellungen','lager'),
    ('wochenplan-leer','/assignments/woche','Einsatzplanung · Leere Woche','einsaetze','plan'),
    ('baustellenakte-plaene-leer','/admin-projects/p1?bereich=plaene','Baustellenakte · Pläne hinzufügen',None,'plan'),
]: add(name,route,'Administrator',title,fixture=fixture,state=True,emptyMotif=motif)
add('start-ruhig','/','Administrator','Start · Aktuell nichts zu erledigen',state=True,action='ruhig',emptyMotif='fertig')
add('start-unvollstaendig','/','Administrator','Start · Fehlende Daten bleiben als Warnung sichtbar',state=True,action='ladefehler')
add('rechnungen-suche-leer','/invoices?suche=KeinTreffer','Buchhaltung','Rechnungen · Keine Suchtreffer',state=True,emptyMotif='suche')
add('firma-einrichtung','/settings/firma','Administrator','Firmendaten · Ersteinrichtung',state=True,action='einrichtung')

def group(route):
    p=route.split('?')[0]
    if p=='/': return 'Start'
    if p.startswith('/plattform'): return 'Globaler Admin'
    if p in ['/login'] : return 'Zugang und Rechtliches'
    if p in ['/impressum','/datenschutz']: return 'Zugang und Rechtliches'
    if p.startswith('/settings'): return 'Einstellungen'
    if p.startswith(('/assignments','/my-schedule')): return 'Planung'
    if p.startswith(('/user-mgmt','/accounting','/vacations','/sonderurlaub','/time')): return 'Team und Zeit'
    if p.startswith(('/material','/lager','/anforderungen')): return 'Material'
    if p.startswith(('/invoices','/costing')): return 'Finanzen'
    return 'Aufträge und Kunden'

header={'/':'bau','/admin-projects':'bau','/customers':'akte','/quotes':'beleg','/invoices':'beleg','/worksheets':'beleg','/material':'lager','/anforderungen':'lager','/lager':'lager','/wartungen':'wartung','/user-mgmt':'team','/accounting':'team','/settings/uebersicht':'einrichtung','/plattform':'betrieb'}
for c in cases:
    c.setdefault('title',labels.get(c['name'],c['name'].replace('-',' ').capitalize()))
    if c['name']=='mitarbeiter-tage': c['title']='Mitarbeiterübersicht · Alle Tage vergleichen'
    c['group']=group(c['route'])
    c['motif']=header.get(c['route'].split('?')[0])
    if c.get('auth'): c['group']='Zugang und Rechtliches';c['motif']=None
    c['decision']=('Erklärende Zeichnung im leeren Bereich' if c.get('emptyMotif') else 'Einmaliger Einrichtungshinweis' if c.get('action')=='einrichtung' else 'Kleiner Kopfakzent nur bei ausreichend Platz am Desktop' if c.get('motif') else 'Bewusst ohne Zusatzillustration; Inhalt und Bedienung bleiben im Fokus')
    if c['name']=='wochenplan-leer':
        c.pop('emptyMotif',None)
        c['decision']='Leeres Planungsraster bleibt vollständig bedienbar; keine Zeichnung über dem Raster'
assert len({c['name'] for c in cases})==len(cases)
(root/'seiten.json').write_text(json.dumps(cases,ensure_ascii=False,indent=2)+'\n')

guide='<path class="guide" d="M15 87h130M25 16v76m-4-62h8m-8 16h8m-8 16h8m-8 16h8M136 16v76m-4-62h8m-8 16h8m-8 16h8m-8 16h8"/>'
motifs={
'bau':'<path class="guide" d="M36 84V43l45-27 45 27v41M33 45l48-29 48 29M76 25v59M50 52h13m-13 9h13m30-9h17m-17 9h17"/><path class="ink" d="M37 82V45l44-26 44 26v37M43 43l38-23 38 23M78 25v36m-3 5h6v4h-6zM72 75h12l4 5H68zM68 83h20L78 99"/><path class="wash" d="M91 34l24 15v16H91z"/>',
'akte':'<path class="guide" d="M53 26V15h31l9 9h37v53H53M57 37h49m-49 10h41M45 83h78"/><path class="ink" d="M34 82V32h29l9 10h50v40zM34 32h29l9 10h50M46 55h48m-48 9h35m-35 9h42M57 24h27l8 8h30"/><path class="wash" d="M44 48h19v5H44z"/>',
'beleg':'<path class="guide" d="M45 20h48l16 16v49M93 20v16h16M40 43h9m-9 12h9M57 48h36m-36 10h25m-25 10h34"/><path class="ink" d="M36 84V28h44l15 16v40zM80 28v16h15M48 54h32m-32 10h23M48 74h32M102 49h21m-21 12h21m-21 12h13"/><path class="wash" d="M48 35h18v6H48z"/>',
'plan':'<path class="guide" d="M33 27h93v56H33zM33 43h93m-93 18h93M62 27v56m33-56v56M46 19v15m66-15v15"/><path class="ink" d="M34 82h92M33 27h93M33 27v56M62 48v7m33 13v9M68 49h20v9H68zM100 67h20v9h-20z"/><path class="wash" d="M38 46h18v10H38z"/>',
'lager':'<path class="guide" d="M33 27h94M33 55h94M33 83h94M36 19v68m88-68v68M48 37h28v15H48zM85 62h25v18H85z"/><path class="ink" d="M36 83V25m88 58V25M37 55h87M37 83h87M48 35h27v18H48zM86 28h24v25H86zM48 65h24v16H48zM84 66h27v15H84zM55 36v6h12v-6"/><path class="wash" d="M87 29h22v7H87z"/>',
'team':'<path class="guide" d="M37 23h87v17H37zM37 47h87v17H37zM37 71h87v17H37zM49 17v76M115 17v76"/><path class="ink" d="M37 40h87M37 64h87M37 88h87M44 29h22m-22 24h29m-29 24h18M84 29h26m-26 24h26m-26 24h26"/><path class="wash" d="M43 32h19v4H43zM82 56h28v4H82z"/>',
'wartung':'<path class="guide" d="M39 80V48h32V24h48M33 46h13m23-29v14M97 18v16M47 55h17m-17 9h17"/><path class="ink" d="M40 84V48h31V25h49M48 84V56h31V33h41M84 22v15m9-15v15M36 70h16m-16 6h16M100 56a12 12 0 1 0 24 0a12 12 0 1 0-24 0M112 56l5-5M112 68v16"/><path class="wash" d="M87 23h4v13h-4z"/>',
'einrichtung':'<path class="guide" d="M47 19h60l13 14v54H47M107 19v14h13M33 37h13m-13 22h13m-13 22h13"/><path class="ink" d="M37 27h57l14 14v44H37zM94 27v14h14M48 45h28m-28 10h42m-42 12h34m-34 10h45"/><path class="wash" d="M79 34h8v8h-8z"/>',
'betrieb':'<path class="guide" d="M34 82V37h36V23h33v25h24v34M45 50h13m-13 12h13M81 38h11m-11 12h11m-11 12h11"/><path class="ink" d="M34 84V37h36V23h33v25h24v36M29 84h104M78 83V70h16v13M42 46h17m-17 11h17m22-24h11m-11 11h11m22 13h6m-6 11h6"/><path class="wash" d="M76 28h20v6H76z"/>',
'suche':'<path class="guide" d="M32 27h93M32 45h93M32 64h93M32 83h93M45 20v68m61-68v68"/><path class="ink" d="M53 32h24m-24 13h17M83 58a17 17 0 1 0 34 0a17 17 0 1 0-34 0M112 70l14 14M54 73h18"/><path class="wash" d="M118 77l9 9-3 3-9-9z"/>',
'fertig':'<path class="guide" d="M40 21h72v20H40zM40 48h72v20H40zM40 75h72v12H40zM49 16v75M115 16v75"/><path class="ink" d="M41 41h71M41 68h71M49 28h30m-30 27h30M92 28l4 4 8-9M92 55l4 4 8-9M34 87h93"/><path class="wash" d="M49 32h26v4H49zM49 59h21v4H49z"/>',
'ablage':'<path class="guide" d="M56 17h40l14 14v45H56M96 17v14h14M53 49h39m-39 9h29"/><path class="ink" d="M37 32h40l15 15v35H37zM77 32v15h15M48 55h26m-26 10h20M28 87h104"/><path class="wash" d="M48 41h16v5H48z"/>',
}
svgs={}
for name,body in motifs.items():
    s='<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 160 104" fill="none" aria-hidden="true" focusable="false">'+guide+body+'</svg>'
    svgs[name]=s
    (root/'svg'/f'{name}.svg').write_text(s.replace('<svg ','<svg style="color:#104b59" ',1).replace('<path class="guide"','<path stroke="#c5d5db" stroke-width="1"',99).replace('<path class="ink"','<path stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round"',99).replace('<path class="wash"','<path fill="currentColor" fill-opacity=".12"',99))
(root/'werkzeuge/motive.json').write_text(json.dumps(svgs,ensure_ascii=False))
for weight in [400,600]:
    shutil.copyfile(source/f'node_modules/@fontsource/poppins/files/poppins-latin-{weight}-normal.woff2',root/f'assets/poppins-{weight}.woff2')
print(json.dumps({'contexts':len(cases),'motifs':len(motifs),'groups':sorted(set(c['group'] for c in cases))},ensure_ascii=False))
