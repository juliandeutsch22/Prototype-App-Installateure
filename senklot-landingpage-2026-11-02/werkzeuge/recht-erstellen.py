"""Bindet die bereitgestellten Rechtstexte und Betreiberangaben in das gemeinsame Website-Layout ein."""
from pathlib import Path
from html import escape as e
import json, re, runpy
R = Path(__file__).resolve().parent.parent
s = runpy.run_path(str(R/'werkzeuge/seo-erstellen.py'))
c = json.loads((R/'werkzeuge/rechtliches.json').read_text())
complete = bool(c['name'].strip()) and bool(c['anschrift'].strip()) and c['texteEingearbeitet'] is True
# Die redaktionelle Vollständigkeit ist keine Aussage über eine externe rechtliche Prüfung.
draft = '' if complete else '<aside class="rechts-entwurf"><strong>Entwurf – Betreiberangaben oder Rechtstexte sind unvollständig.</strong></aside>'
identity = '<p>'+e(c['name'] or '[Betreibername ergänzen]')+'<br>'+e(c['anschrift'] or '[Anschrift ergänzen]').replace('\n','<br>')+'</p>'
contact = '<p>E-Mail: <a href="mailto:office@senklot.at">office@senklot.at</a><br>Telefon: <a href="tel:+436606322503">+43 660 6322503</a></p>'
replacements = {'BETREIBER':identity,'KONTAKT':contact,**{k.upper():e(c[k]) for k in ['projekt','stand','taetigkeit','unternehmensstatus','grundrichtung','urheberrecht']}}
for slug,title in [('impressum','Impressum'),('datenschutz','Datenschutzerklärung')]:
    body=(R/'vorlagen'/f'{slug}.html').read_text()
    for key,value in replacements.items():body=body.replace('{{'+key+'}}',value)
    assert not re.search(r'\{\{[A-Z]+\}\}',body), 'Nicht ersetzter Platzhalter'
    head=s['head'](title+' | Senklot',title+' der Senklot-Website.',prefix='../')
    head=re.sub(r'<script type="application/ld\+json">.*?</script>','',head,flags=re.S)
    head=head.replace('href="https://senklot.at/"','href="https://senklot.at/'+slug+'/"').replace('content="https://senklot.at/"','content="https://senklot.at/'+slug+'/"')
    head=head.replace('index,follow,max-image-preview:large','noindex,follow')
    html=f'<!doctype html>\n<html lang="de-AT">{head}<body class="funktionsseite"><a class="skip" href="#inhalt">Zum Inhalt</a>{s["header"]}<main id="inhalt" class="wrap rechtstext"><p class="rubrik">SENKLOT / RECHTLICHES</p><h1>{title}</h1>{draft}{body}</main>{s["footer"]}</body></html>\n'
    (R/slug).mkdir(exist_ok=True);(R/slug/'index.html').write_text(html)
(R/'senklot-intern/tarife.json').write_text(json.dumps(s['tarife'],ensure_ascii=False,indent=2)+'\n')
print(json.dumps({'legalPages':2,'operatorComplete':complete,'providerDocumentsReviewed':c['anbieterunterlagenGeprueft']}))
