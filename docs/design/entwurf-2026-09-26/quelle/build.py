"""Setzt die Entwürfe aus Seitenrumpf + Chrome zusammen und rendert sie.

   Aufruf in diesem Ordner:  python3 build.py  → seiten/<name>.html und seiten/<name>.png
   Braucht: node_modules des Projekts (Playwright, Poppins) und Chromium
   (Pfad in CHROMIUM_PFAD, sonst der Standardpfad der Build-Umgebung).
   Meldet „ÜBERLAUF“, wenn eine Seite waagrecht aus dem Bild läuft."""
import os, subprocess, glob

I = {
 'home': '<svg class="i" viewBox="0 0 24 24"><path d="M3 10.5 12 3l9 7.5V20a1 1 0 0 1-1 1h-5v-6H9v6H4a1 1 0 0 1-1-1z"/></svg>',
 'clock': '<svg class="i" viewBox="0 0 24 24"><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/></svg>',
 'cal': '<svg class="i" viewBox="0 0 24 24"><rect x="3" y="5" width="18" height="16" rx="2"/><path d="M3 10h18M8 3v4M16 3v4"/></svg>',
 'box': '<svg class="i" viewBox="0 0 24 24"><path d="m12 3 8 4.5v9L12 21l-8-4.5v-9zM4 7.5l8 4.5 8-4.5M12 12v9"/></svg>',
 'more': '<svg class="i" viewBox="0 0 24 24"><path d="M5 12h.01M12 12h.01M19 12h.01"/></svg>',
 'sun': '<svg class="i" viewBox="0 0 24 24"><circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M2 12h2M20 12h2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/></svg>',
 'pencil': '<svg class="i" viewBox="0 0 24 24"><path d="M4 20h4l10.5-10.5a2.1 2.1 0 0 0-3-3L5 17z"/></svg>',
 'file': '<svg class="i" viewBox="0 0 24 24"><path d="M6 3h8l4 4v14H6zM14 3v4h4M9 12h6M9 16h6"/></svg>',
 'contact': '<svg class="i" viewBox="0 0 24 24"><circle cx="12" cy="9" r="3.5"/><path d="M5 20a7 7 0 0 1 14 0"/></svg>',
 'building': '<svg class="i" viewBox="0 0 24 24"><path d="M4 21V5a1 1 0 0 1 1-1h8a1 1 0 0 1 1 1v16M14 9h5a1 1 0 0 1 1 1v11M3 21h18M8 8h2M8 12h2M8 16h2"/></svg>',
 'wrench': '<svg class="i" viewBox="0 0 24 24"><path d="M14.5 6.5a4 4 0 0 0 5 5l-9 9a2 2 0 0 1-3-3l9-9z"/></svg>',
 'clipboard': '<svg class="i" viewBox="0 0 24 24"><rect x="6" y="4" width="12" height="17" rx="2"/><path d="M9 4h6M9 10h6M9 14h4"/></svg>',
 'archive': '<svg class="i" viewBox="0 0 24 24"><rect x="3" y="4" width="18" height="5" rx="1"/><path d="M5 9v10h14V9M10 13h4"/></svg>',
 'users': '<svg class="i" viewBox="0 0 24 24"><circle cx="9" cy="8" r="3"/><circle cx="17" cy="9" r="2.5"/><path d="M3 19a6 6 0 0 1 12 0M14 19a4.5 4.5 0 0 1 7 0"/></svg>',
 'settings': '<svg class="i" viewBox="0 0 24 24"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z"/></svg>',
 'calc': '<svg class="i" viewBox="0 0 24 24"><rect x="5" y="3" width="14" height="18" rx="2"/><path d="M8 7h8M8 12h2M12 12h2M16 12h.01M8 16h2M12 16h2M16 16h.01"/></svg>',
 'receipt': '<svg class="i" viewBox="0 0 24 24"><path d="M6 3h12v18l-3-2-3 2-3-2-3 2zM9 8h6M9 12h6"/></svg>',
 'chart': '<svg class="i" viewBox="0 0 24 24"><path d="M4 20V10M10 20V4M16 20v-7M22 20H2"/></svg>',
 'chev': '<svg class="i i-s pfeil" viewBox="0 0 24 24"><path d="m9 6 6 6-6 6"/></svg>',
 'back': '<svg class="i" viewBox="0 0 24 24"><path d="m15 6-6 6 6 6"/></svg>',
 'pin': '<svg class="i i-s" viewBox="0 0 24 24"><path d="M12 21s-7-6.2-7-11a7 7 0 0 1 14 0c0 4.8-7 11-7 11z"/><circle cx="12" cy="10" r="2.5"/></svg>',
 'phone': '<svg class="i i-s" viewBox="0 0 24 24"><path d="M5 4h4l2 5-2.5 1.5a11 11 0 0 0 5 5L15 13l5 2v4a2 2 0 0 1-2 2A16 16 0 0 1 3 6a2 2 0 0 1 2-2"/></svg>',
 'warn': '<svg class="i i-s" viewBox="0 0 24 24"><path d="M12 3 2 21h20zM12 10v5M12 18h.01"/></svg>',
 'search': '<svg class="i i-s" viewBox="0 0 24 24"><circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/></svg>',
 'check': '<svg class="i i-s" viewBox="0 0 24 24"><path d="m5 12 4 4L19 6"/></svg>',
 'plus': '<svg class="i i-s" viewBox="0 0 24 24"><path d="M12 5v14M5 12h14"/></svg>',
 'dots': '<svg class="i i-s" viewBox="0 0 24 24"><path d="M12 5h.01M12 12h.01M12 19h.01"/></svg>',
}

def tabs(aktiv, eintraege):
    out = ['<nav class="tabs">']
    for key, icon, label, zahl in eintraege:
        z = f'<span class="zahl">{zahl}</span>' if zahl else ''
        out.append(f'<a class="tab{" aktiv" if key == aktiv else ""}"><span class="sym">{I[icon]}{z}</span>{label}</a>')
    out.append('</nav>')
    return ''.join(out)

TABS_MONTEUR = [('start','home','Start',''),('zeit','clock','Zeit',''),('plan','cal','Plan',''),('material','box','Material',''),('mehr','more','Mehr','1')]
TABS_BUERO = [('start','home','Start',''),('zeit','clock','Zeit',''),('rechnungen','receipt','Rechnungen','3'),('kunden','contact','Kunden',''),('mehr','more','Mehr','')]

def kopf(marke='Perl Installationen GmbH', initialen='MT'):
    return f'<header class="kopfleiste"><span class="marke">{marke}</span><span class="avatar">{initialen}</span></header>'

def leiste(aktiv, person=('Julian Deutsch', 'Geschäftsführung', 'JD')):
    gruppen = [
        ('', [('start','home','Start',''),('zeit','clock','Zeiterfassung',''),('urlaub','sun','Urlaub',''),('scheine','pencil','Handwerksscheine','')]),
        ('Verwaltung', [('angebote','file','Angebote',''),('kunden','contact','Kunden',''),('baustellen','building','Baustellen',''),('planung','cal','Einsatzplanung',''),('wartungen','wrench','Wartungen',''),('anforderungen','clipboard','Anforderungen','1'),('lager','archive','Lager',''),('benutzer','users','Benutzerverwaltung','')]),
        ('Buchhaltung', [('rechnungen','receipt','Rechnungen','3'),('uebersicht','chart','Mitarbeiterübersicht',''),('kalkulation','calc','Nachkalkulation','')]),
        ('', [('einstellungen','settings','Einstellungen','')]),
    ]
    out = ['<aside class="leiste"><div class="marke">Perl Installationen GmbH</div>']
    for titel, items in gruppen:
        if titel: out.append(f'<div class="gruppe">{titel}</div>')
        for key, icon, label, zahl in items:
            z = f'<span class="zahl">{zahl}</span>' if zahl else ''
            out.append(f'<a class="nav{" aktiv" if key == aktiv else ""}">{I[icon]}{label}{z}</a>')
    n, r, ini = person
    out.append(f'<div class="person"><span class="avatar">{ini}</span><div><b>{n}</b><span>{r}</span></div></div></aside>')
    return ''.join(out)

def seite_telefon(titel, body, aktiv='start', tabsatz=TABS_MONTEUR, initialen='MT', hoehe=1100, breite=375):
    return f'''<!doctype html><html lang="de"><head><meta charset="utf-8"><title>{titel}</title><link rel="stylesheet" href="../stil.css"></head>
<body><div class="seite" style="width:{breite}px;height:{hoehe}px">{kopf(initialen=initialen)}<div class="inhalt">{body}</div>{tabs(aktiv, tabsatz)}</div></body></html>'''

def seite_tisch(titel, body, aktiv, hoehe=900, person=('Julian Deutsch','Geschäftsführung','JD')):
    return f'''<!doctype html><html lang="de"><head><meta charset="utf-8"><title>{titel}</title><link rel="stylesheet" href="../stil.css"></head>
<body><div class="desktop" style="width:1440px;height:{hoehe}px">{leiste(aktiv, person)}<main><div class="breit">{body}</div></main></div></body></html>'''

def seite_tablet(titel, body, aktiv, hoehe=1112, person=('Julian Deutsch','Geschäftsführung','JD')):
    return f'''<!doctype html><html lang="de"><head><meta charset="utf-8"><title>{titel}</title><link rel="stylesheet" href="../stil.css"><style>.leiste{{width:204px;padding:16px 8px}}.leiste .marke{{font-size:14px}}.nav{{font-size:13.5px;gap:10px;padding:0 10px}}.desktop main{{padding:20px 16px}}.desktop .seitenkopf h1{{font-size:26px;line-height:32px}}</style></head>
<body><div class="desktop" style="width:834px;height:{hoehe}px">{leiste(aktiv, person)}<main><div class="breit">{body}</div></main></div></body></html>'''

if __name__ == '__main__':
    import seiten as S
    os.makedirs('seiten', exist_ok=True)
    for name, (html, w, h) in S.SEITEN.items():
        with open(f'seiten/{name}.html', 'w') as f: f.write(html)
        subprocess.run(['node', 'render.mjs', f'seiten/{name}.html', str(w), str(h), f'seiten/{name}.png'], check=True)
