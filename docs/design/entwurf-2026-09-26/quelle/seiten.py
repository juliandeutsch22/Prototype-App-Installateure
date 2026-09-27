from build import I, seite_telefon, seite_tisch, seite_tablet, TABS_MONTEUR, TABS_BUERO

ch = I['chev']

def zeile(titel, meta, rechts='', pfeil=True):
    return f'<div class="zeile"><div class="z-text"><div class="z-titel">{titel}</div><div class="z-meta">{meta}</div></div>{rechts}{ch if pfeil else ""}</div>'

def abschnitt(titel, anzahl='', link=''):
    a = f'<span class="anzahl">· {anzahl}</span>' if anzahl else ''
    l = f'<a class="link w">{link}</a>' if link else ''
    return f'<div class="abschnitt"><h2>{titel}{a}</h2>{l}</div>'

def wert(betrag, unter=''):
    u = f'<small>{unter}</small>' if unter else ''
    return f'<div class="z-wert">{betrag}{u}</div>'

# ─────────────────────────────────────────────────────────── M1 Monteur-Start (2 Karten)
m1 = f'''
<div class="seitenkopf"><div><h1>Guten Morgen, Max</h1><div class="strich"></div><div class="meta">Samstag, 26.09.2026 · KW 39</div></div></div>

<div class="hinweis warn">{I['warn']}<span><b>22 Tage ohne Buchung</b> — Mo, 21.09. bis Fr, 25.09. und 17 weitere. <a class="link">Jetzt nachtragen ›</a></span></div>

<div class="karte">
  <div class="karte-kopf"><h2>Heute<span class="anzahl">· 2 Baustellen</span></h2><a class="link w">Einsatzplan</a></div>
  <div class="karte-koerper">
    <div class="z-titel" style="font-size:16px;line-height:23px;font-weight:600">Wohnungseigentümergemeinschaft Hauptstraße 112–118</div>
    <div class="z-meta">B-2026-0147 · Verteiler, Vormittag</div>
    <div style="display:flex;gap:16px;margin-top:10px;font-size:14px">
      <a class="link" style="display:inline-flex;gap:6px;align-items:center">{I['pin']}Route</a>
      <a class="link" style="display:inline-flex;gap:6px;align-items:center">{I['phone']}0664 1234567</a>
    </div>
    <a class="btn btn-primaer btn-block" style="margin-top:14px;flex-direction:column;gap:0;min-height:56px;line-height:20px">Wie zuletzt buchen<small style="font-weight:400;font-size:13px;opacity:.85">07:00–16:30 · 30 min Pause · 09:00 Std</small></a>
    <div class="reihe2" style="margin-top:8px"><a class="btn btn-sekundaer">Andere Zeit</a><a class="btn btn-sekundaer">Schein schreiben</a></div>
  </div>
  {zeile('Gemeinde Neudorf bei Wiener Neustadt', 'B-2026-0148 · Rathausplatz 1 · Helfer', '<span class="pille p-leise">danach</span>')}
</div>

<div class="karte">
  <div class="karte-kopf"><h2>Diese Woche</h2><span style="font-size:14px;color:var(--muted)"><b style="color:var(--ink-deep);font-size:16px;font-weight:600">17:00</b> von 38:30 Std</span></div>
  <div class="karte-koerper" style="padding-bottom:12px">
    <div class="tage">
      <div class="tag"><i style="height:44px"></i>Mo</div><div class="tag"><i style="height:44px"></i>Di</div>
      <div class="tag leer"><i></i>Mi</div><div class="tag leer"><i></i>Do</div><div class="tag heute"><i style="height:44px"></i>Fr</div>
    </div>
    <div style="display:flex;justify-content:space-between;margin-top:12px;font-size:14px;color:var(--muted)"><span>Saldo September</span><b style="color:var(--ink-deep);font-weight:600">+01:00</b></div>
  </div>
  {abschnitt('Offen für dich', '2')}
  {zeile('Material abholbereit', 'Kupferrohr 22 mm × 12 · im Lager', '<span class="pille p-info">Abholbereit</span>')}
  {zeile('Schein nachtragen', 'Do, 24.09. · B-2026-0148 · 06:00 Std')}
</div>
'''

# ─────────────────────────────────────────────────────────── M2 Zeit erfassen (2 Karten)
m2 = f'''
<div class="seitenkopf"><div><h1>Zeit erfassen</h1><div class="strich"></div><div class="meta">Diese Woche 17:00 von 38:30 Std · Saldo +01:00</div></div></div>

<div class="karte">
  <div class="zeile"><div class="z-text"><div class="z-titel">Wie zuletzt eintragen</div><div class="z-meta">07:00–16:30 · 30 min · WEG Hauptstraße 112–118</div></div><span class="btn btn-sekundaer btn-klein">Übernehmen</span></div>
  <div class="karte-koerper" style="padding-top:14px;display:flex;flex-direction:column;gap:14px;border-top:1px solid var(--border)">
    <div class="reihe2">
      <div class="feld"><label>Datum</label><div class="eingabe">26.09.2026 {I['cal']}</div></div>
      <div class="feld"><label>Status</label><div class="eingabe">Anwesend {ch}</div></div>
    </div>
    <div class="feld"><label>Arbeitszeit</label>
      <div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:8px">
        <div class="eingabe">07:00</div><div class="eingabe">16:00</div><div class="eingabe leer">30 min</div>
      </div>
      <div class="z-meta">Von · Bis · Pause</div>
    </div>
  </div>
  {abschnitt('Baustelle')}
  {zeile('WEG Hauptstraße 112–118', 'B-2026-0147 · Hauptstraße 112–118, 2700 Wiener Neustadt')}
  <div class="zeile"><div class="z-text"><div class="eingabe leer" style="border:0;padding:0;height:auto;font-size:15px">Tätigkeit, z. B. Verteiler gesetzt</div></div></div>
  <div class="zeile"><div class="z-text"><div class="z-titel">Als Helfer eingesetzt</div></div><span class="schalter"></span></div>
  {zeile('Weitere Angaben', 'Wegzeit, Zuschläge, Notdienst', '<span class="pille p-leise">optional</span>')}
</div>

<div class="hinweis">{I['warn']}<span>Für Do, 24.09. fehlt noch eine Buchung. <a class="link">Nachtragen ›</a></span></div>

<div class="aktionsleiste"><div class="summe"><span>Arbeitszeit</span><b>08:30 Std</b></div><div class="knoepfe"><a class="btn btn-sekundaer">Abbrechen</a><a class="btn btn-primaer">Zeit buchen</a></div></div>
'''

# ─────────────────────────────────────────────────────────── M3 Handwerksschein · Material (1 Karte)
def stepper(n): return f'<span class="stepper"><span>−</span><b>{n}</b><span>+</span></span>'
m3 = f'''
<div class="seitenkopf"><div style="display:flex;gap:8px;align-items:flex-start"><a style="margin-top:3px;margin-left:-4px">{I['back']}</a><div><h1>Handwerksschein</h1><div class="strich"></div><div class="meta">WEG Hauptstraße 112–118 · B-2026-0147 · 26.09.2026</div></div></div></div>

<div class="schritte"><div class="schritt fertig"><i></i>Zeiten</div><div class="schritt jetzt"><i></i>Material</div><div class="schritt"><i></i>Fotos</div><div class="schritt"><i></i>Unterschrift</div></div>

<div class="suche">{I['search']}Artikel suchen oder frei eintragen</div>

<div class="karte">
  <div class="karte-kopf"><h2>Verbaut<span class="anzahl">· 3 Positionen</span></h2></div>
  <div class="zeile"><div class="z-text"><div class="z-titel">Kupferrohr 15 mm</div><div class="z-meta">Aus dem Lager · Meter</div></div>{stepper(6)}</div>
  <div class="zeile"><div class="z-text"><div class="z-titel">Pressfitting 15 mm</div><div class="z-meta">Aus dem Lager · Stück</div></div>{stepper(8)}</div>
  <div class="zeile"><div class="z-text"><div class="z-titel">Eckventil ½ Zoll</div><div class="z-meta">Frei eingetragen · Stück</div></div>{stepper(2)}</div>
  {abschnitt('Zuletzt auf dieser Baustelle')}
  {zeile('Rohrschelle 15 mm', 'Stück', '<span class="btn btn-sekundaer btn-klein">' + I['plus'] + 'Hinzufügen</span>', False)}
  {zeile('Dichtband', 'Rolle', '<span class="btn btn-sekundaer btn-klein">' + I['plus'] + 'Hinzufügen</span>', False)}
</div>
<p class="z-meta" style="padding:0 4px">Preise stehen erst auf der Rechnung, nicht auf dem Schein. Der Entwurf wird laufend gespeichert.</p>

<div class="aktionsleiste"><div class="summe"><span>Material</span><b>3 Positionen</b></div><div class="knoepfe"><a class="btn btn-sekundaer">Zurück</a><a class="btn btn-primaer">Weiter: Fotos ›</a></div></div>
'''

# ─────────────────────────────────────────────────────────── M4 Rechnungen (Leiste + 1 Liste)
m4 = f'''
<div class="seitenkopf"><div><h1>Rechnungen</h1><div class="strich"></div><div class="meta">September 2026 · 4 Rechnungen</div></div><div class="rechts"><a class="btn btn-primaer btn-klein">{I['plus']}Neu</a></div></div>

<div class="kennzahlen">
  <div class="kennzahl"><div class="name">Offen</div><div class="wert">€ 8 904</div><div class="zusatz">2 Rechnungen</div></div>
  <div class="kennzahl"><div class="name">Überfällig</div><div class="wert" style="color:var(--danger)">€ 22 105</div><div class="zusatz">1 Rechnung · gemahnt</div></div>
</div>

<div class="filterzeile"><div class="suche">{I['search']}Nummer, Kunde, Baustelle</div></div>
<div class="filterzeile"><span class="chip an">Alle</span><span class="chip">Offen</span><span class="chip">Überfällig</span><span class="chip">Bezahlt</span></div>

<div class="karte">
  {abschnitt('September 2026', '3')}
  {zeile('Gemeinde Neudorf', 'RE-2026-0232 · fällig 01.10.', wert('€ 7 488,00', 'Offen'))}
  {zeile('WEG Hauptstraße 112–118', 'RE-2026-0231 · gemahnt 15.09.', '<div class="z-wert" style="color:var(--danger)">€ 22 104,60<small style="color:var(--danger)">Überfällig</small></div>')}
  {zeile('Max Musterkunde', 'RE-2026-0233 · Entwurf', wert('€ 1 416,00', 'Entwurf'))}
  {abschnitt('August 2026', '1')}
  {zeile('Familie Huber', 'RE-2026-0230 · bezahlt 12.08.', wert('€ 1 416,00', 'Bezahlt'))}
</div>
<div class="textlinks"><a class="link w">Mahnlauf · 1 fällig</a><a class="link w">Buchhaltungs-Export</a></div>
'''

# ─────────────────────────────────────────────────────────── M5 Urlaub (Leiste + Formular + Liste)
m5 = f'''
<div class="seitenkopf"><div><h1>Urlaub</h1><div class="strich"></div><div class="meta">Urlaub, Zeitausgleich und Krankmeldung</div></div></div>

<div class="kennzahlen">
  <div class="kennzahl"><div class="name">Resturlaub</div><div class="wert">24 Tage</div><div class="zusatz">1 von 25 genehmigt</div></div>
  <div class="kennzahl"><div class="name">Beantragt</div><div class="wert">10 Tage</div><div class="zusatz">noch nicht entschieden</div></div>
</div>

<div class="karte">
  <div class="karte-kopf"><h2>Antrag stellen</h2></div>
  <div class="karte-koerper" style="display:flex;flex-direction:column;gap:14px">
    <div class="segment" style="grid-template-columns:1fr 1fr 1fr"><span class="an">Urlaub</span><span>Zeitausgleich</span><span>Krank</span></div>
    <div class="reihe2">
      <div class="feld"><label>Von</label><div class="eingabe">05.10.2026 {I['cal']}</div></div>
      <div class="feld"><label>Bis</label><div class="eingabe">16.10.2026 {I['cal']}</div></div>
    </div>
    <div class="feld"><label>Anmerkung <span style="font-weight:400;color:var(--muted)">(freiwillig)</span></label><div class="eingabe leer">Herbsturlaub mit der Familie</div></div>
    <div class="z-meta">10 Arbeitstage · danach bleiben 14 Tage.</div>
    <a class="btn btn-primaer btn-block">Antrag einreichen</a>
  </div>
  {abschnitt('Meine Anträge', '2')}
  {zeile('05.10. – 16.10.2026', '10 Arbeitstage · Herbsturlaub mit der Familie', '<span class="pille p-warn">Beantragt</span>')}
  {zeile('15.09.2026', '1 Arbeitstag · genehmigt von Franz Hinterleitner', '<span class="pille p-ok">Genehmigt</span>')}
</div>
'''

# ─────────────────────────────────────────────────────────── T1 Wochenplan (Tablet, 1 Karte)
def zelle(name, nr, art=''):
    p = f'<span style="display:block;color:var(--muted);font-size:10.5px;line-height:14px">{art}</span>' if art else ''
    return f'<div style="background:var(--surface-2);border:1px solid var(--border);border-radius:8px;padding:5px 6px;font-size:11.5px;line-height:15px"><b style="display:block;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;font-weight:600">{name}</b><span style="display:block;white-space:nowrap;color:var(--muted);font-size:11px">{nr}</span>{p}</div>'
frei = '<div style="border:1px solid var(--border);border-radius:8px;padding:6px 4px;font-size:12px;color:var(--muted);font-weight:500;text-align:center">frei</div>'
t1 = f'''
<div class="seitenkopf"><div><h1>Einsatzplanung</h1><div class="strich"></div><div class="meta">KW 40 · 28.09. – 04.10.2026</div></div><div class="rechts"><a class="btn btn-sekundaer btn-klein">‹</a><a class="btn btn-sekundaer btn-klein">Heute</a><a class="btn btn-sekundaer btn-klein">›</a></div></div>
<div class="segment" style="grid-template-columns:1fr 1fr;max-width:280px"><span>Tag planen</span><span class="an">Wochenplan</span></div>
<div class="karte">
<table class="eng" style="table-layout:fixed">
<thead><tr><th style="width:104px;padding-left:12px">Person</th><th>Mo 28.09.</th><th>Di 29.09.</th><th>Mi 30.09.</th><th>Do 01.10.</th><th>Fr 02.10.</th></tr></thead>
<tbody>
<tr><td style="padding-left:12px"><b>Max Mustermann</b><div class="z-meta">Fach</div></td><td>{zelle('WEG Hauptstraße 112–118','B-2026-0147')}</td><td>{zelle('WEG Hauptstraße 112–118','B-2026-0147')}</td><td>{frei}</td><td>{zelle('Gemeinde Neudorf','B-2026-0148','Helfer')}</td><td>{frei}</td></tr>
<tr><td style="padding-left:12px"><b>Anton Berger-Steinmetz</b><div class="z-meta">Fach</div></td><td>{zelle('Gemeinde Neudorf','B-2026-0148')}</td><td>{zelle('Gemeinde Neudorf','B-2026-0148')}</td><td>{zelle('Gemeinde Neudorf','B-2026-0148')}</td><td><span class="pille p-warn">Urlaub</span></td><td><span class="pille p-warn">Urlaub</span></td></tr>
<tr><td style="padding-left:12px"><b>Franz Hinterleitner</b><div class="z-meta">Fach</div></td><td>{frei}</td><td>{zelle('Familie Huber','B-2026-0149')}</td><td>{zelle('Familie Huber','B-2026-0149')}</td><td>{frei}</td><td>{frei}</td></tr>
<tr><td style="padding-left:12px"><b>Michaela Wagner</b><div class="z-meta">Helferin</div></td><td>{zelle('WEG Hauptstraße 112–118','B-2026-0147','Helfer')}</td><td>{frei}</td><td>{frei}</td><td>{frei}</td><td><span class="pille p-info">Krank</span></td></tr>
</tbody></table>
  {abschnitt('Frei diese Woche', '', 'Tag planen')}
  {zeile('Mittwoch, 30.09.', 'Max Mustermann, Franz Hinterleitner, Michaela Wagner', '<span class="pille p-ok">3 frei</span>', False)}
  {zeile('Freitag, 02.10.', 'Max Mustermann, Franz Hinterleitner', '<span class="pille p-ok">2 frei</span>', False)}
</div>
'''

# ─────────────────────────────────────────────────────────── D1 Büro-Start (Leiste + 2 Karten)
d1 = f'''
<div class="seitenkopf"><div><h1>Guten Morgen, Julian</h1><div class="strich"></div><div class="meta">Samstag, 26.09.2026 · KW 39</div></div><div class="rechts"><a class="btn btn-sekundaer">Zeit buchen</a><a class="btn btn-primaer">{I['plus']}Rechnung</a></div></div>

<div class="kennzahlen">
  <div class="kennzahl"><div class="name">Überfällig</div><div class="wert" style="color:var(--danger)">€ 22 105</div><div class="zusatz">1 Rechnung · Mahnlauf fällig</div></div>
  <div class="kennzahl"><div class="name">Offene Rechnungen</div><div class="wert">€ 8 904</div><div class="zusatz">2 Rechnungen</div></div>
  <div class="kennzahl"><div class="name">Aktive Baustellen</div><div class="wert">6</div><div class="zusatz">1 über Budget</div></div>
  <div class="kennzahl"><div class="name">Material angefordert</div><div class="wert">2</div><div class="zusatz">1 abholbereit</div></div>
</div>

<div class="zwei">
<div class="spalte">
  <div class="karte">
    <div class="karte-kopf"><h2>Heute im Einsatz<span class="anzahl">· 2 Baustellen</span></h2><a class="link w">Einsatzplanung</a></div>
    {zeile('Gemeinde Neudorf bei Wiener Neustadt', 'B-2026-0148 · Rathausplatz 1, 2620 Neunkirchen · Anton Berger-Steinmetz', '<span class="pille p-leise">1 Person</span>')}
    {zeile('WEG Hauptstraße 112–118', 'B-2026-0147 · Hauptstraße 112–118, 2700 Wiener Neustadt · Max Mustermann, Michaela Wagner (Helferin)', '<span class="pille p-leise">2 Personen</span>')}
    {abschnitt('Aktive Baustellen', '6', 'Alle Baustellen')}
    {zeile('WEG Hauptstraße 112–118', 'B-2026-0147 · Hausverwaltung Mayrhofer', '<div class="z-wert">246 h<small>von 240 h · <span style="color:var(--danger)">über Budget</span></small></div>')}
    {zeile('Gemeinde Neudorf bei Wiener Neustadt', 'B-2026-0148 · Gemeindeamt', wert('31 h', 'von 60 h'))}
    {zeile('Familie Huber', 'B-2026-0149 · Bad komplett', wert('12 h', 'von 80 h'))}
    <div class="karte-fuss"><span style="color:var(--muted)">und 3 weitere</span><a class="link w">Baustellen</a></div>
  </div>
</div>
<div class="spalte">
  <div class="karte">
    <div class="karte-kopf"><h2>Material angefordert<span class="anzahl">· 2</span></h2><a class="link w">Bearbeiten</a></div>
    {zeile('12 × Kupferrohr 22 mm, Stange 5 m', 'Anton Berger-Steinmetz · B-2026-0147', '<span class="pille p-warn">Offen</span>')}
    {zeile('24 × Thermostatventil Heimeier DN15', 'Max Mustermann · B-2026-0148', '<span class="pille p-info">Abholbereit</span>')}
    {abschnitt('Team – offene Zeiten', '', 'Monatsauswertung')}
    {zeile('Anton Berger-Steinmetz', 'zuletzt gebucht Do, 17.09.', '<span class="pille p-warn">7 Tage offen</span>', False)}
    {zeile('Franz Hinterleitner', 'zuletzt gebucht Mi, 23.09.', '<span class="pille p-warn">2 Tage offen</span>', False)}
    {zeile('Michaela Wagner', 'alle Tage gebucht', '<span class="pille p-ok">vollständig</span>', False)}
    {abschnitt('Wartungen', '', 'Alle')}
    {zeile('Gasheizung Fam. Huber', 'fällig 30.09.2026', '<span class="pille p-warn">in 4 Tagen</span>')}
    {zeile('Lüftung Gemeindeamt', 'fällig 12.10.2026')}
  </div>
</div>
</div>
'''

# ─────────────────────────────────────────────────────────── D2 Rechnungen (Leiste + Tabelle)
d2 = f'''
<div class="seitenkopf"><div><h1>Rechnungen</h1><div class="strich"></div><div class="meta">September 2026 · 4 Rechnungen · Mahnlauf: 1 fällig</div></div><div class="rechts"><a class="btn btn-sekundaer">Export</a><a class="btn btn-sekundaer">Mahnlauf</a><a class="btn btn-primaer">{I['plus']}Rechnung erstellen</a></div></div>

<div class="kennzahlen">
  <div class="kennzahl"><div class="name">Offen</div><div class="wert">€ 8 904</div><div class="zusatz">2 Rechnungen</div></div>
  <div class="kennzahl"><div class="name">Überfällig</div><div class="wert" style="color:var(--danger)">€ 22 105</div><div class="zusatz">1 Rechnung · gemahnt 15.09.</div></div>
  <div class="kennzahl"><div class="name">Bezahlt im September</div><div class="wert">€ 1 416</div><div class="zusatz">1 Rechnung</div></div>
  <div class="kennzahl"><div class="name">Nicht verrechnet</div><div class="wert">3 Scheine</div><div class="zusatz">auf 2 Baustellen</div></div>
</div>

<div class="filterzeile"><div class="suche" style="max-width:420px">{I['search']}Nummer, Kunde oder Baustelle</div><span class="chip an">Alle</span><span class="chip">Offen</span><span class="chip">Überfällig</span><span class="chip">Bezahlt</span><span class="chip">Storniert</span><span style="flex:1"></span><span class="chip">September 2026 {ch}</span></div>

<div class="karte">
<table>
<thead><tr><th>Nummer</th><th>Kunde · Baustelle</th><th>Datum</th><th>Fällig</th><th class="r">Netto</th><th class="r">Brutto</th><th>Stand</th><th></th></tr></thead>
<tbody>
<tr><td><b>RE-2026-0233</b></td><td><b>Max Musterkunde</b><div class="z-meta">PR-187 · Regie</div></td><td>26.09.2026</td><td>—</td><td class="r">1 180,00</td><td class="r"><b>€ 1 416,00</b></td><td><span class="pille p-leise">Entwurf</span></td><td class="r">{I['dots']}</td></tr>
<tr><td><b>RE-2026-0232</b></td><td><b>Gemeinde Neudorf bei Wiener Neustadt</b><div class="z-meta">B-2026-0148 · Teilrechnung</div></td><td>17.09.2026</td><td>01.10.2026</td><td class="r">6 240,00</td><td class="r"><b>€ 7 488,00</b></td><td><span class="pille p-info">Offen</span></td><td class="r">{I['dots']}</td></tr>
<tr><td><b>RE-2026-0231</b></td><td><b>WEG Hauptstraße 112–118</b><div class="z-meta">B-2026-0147 · Schlussrechnung</div></td><td>18.08.2026</td><td style="color:var(--danger)">01.09.2026</td><td class="r">18 420,50</td><td class="r"><b>€ 22 104,60</b></td><td><span class="pille p-fehl">Überfällig · 1. Mahnung</span></td><td class="r">{I['dots']}</td></tr>
<tr><td><b>RE-2026-0230</b></td><td><b>Familie Huber</b><div class="z-meta">B-2026-0149 · Pauschale</div></td><td>02.08.2026</td><td>16.08.2026</td><td class="r">1 180,00</td><td class="r"><b>€ 1 416,00</b></td><td><span class="pille p-ok">Bezahlt 12.08.</span></td><td class="r">{I['dots']}</td></tr>
</tbody></table>
<div class="karte-fuss"><span style="color:var(--muted)">4 von 4 Rechnungen · ältere über die Suche</span><span style="font-weight:600">Summe brutto € 32 424,60</span></div>
</div>
'''

# ─────────────────────────────────────────────────────────── D3 Baustellenakte (2 Karten)
def angabe(k, v): return f'<div class="zeile" style="min-height:44px;padding:8px 16px"><div class="z-meta" style="width:150px;flex:none">{k}</div><div class="z-titel" style="flex:1">{v}</div></div>'
d3 = f'''
<div class="seitenkopf"><div><div class="meta"><a class="link">‹ Baustellen</a></div><h1>WEG Hauptstraße 112–118</h1><div class="strich"></div><div class="meta">B-2026-0147 · Hausverwaltung Mayrhofer · <span class="pille p-ok">Aktiv</span> &nbsp; <span class="pille p-fehl">über Budget</span></div></div><div class="rechts"><a class="btn btn-sekundaer">Einsatz planen</a><a class="btn btn-sekundaer">Schein</a><a class="btn btn-primaer">Rechnung erstellen</a></div></div>

<div class="zwei">
<div class="spalte">
  <div class="karte">
    <div class="karte-kopf"><h2>Stammdaten</h2><a class="link">Bearbeiten</a></div>
    {angabe('Kunde','Hausverwaltung Mayrhofer · Kundenakte ›')}
    {angabe('Adresse','Hauptstraße 112–118, 2700 Wiener Neustadt')}
    {angabe('Ansprechpartner','Hr. Mayrhofer · 0664 1234567')}
    {angabe('Auftrag','Heizungstausch inkl. Verteiler und hydraulischem Abgleich')}
    {angabe('Abrechnung','Regie · Kalkulation 240 h · Ende geplant 31.10.2026')}
    {angabe('Projektleitung','Julian Deutsch')}
    {abschnitt('Budget', '', 'Nachkalkulation')}
    <div class="karte-koerper" style="padding-top:12px">
      <div style="display:flex;justify-content:space-between;font-size:14px"><span><b style="font-size:20px;font-weight:600">246 h</b> <span style="color:var(--muted)">von 240 h</span></span><span style="font-weight:600">103 %</span></div>
      <div style="height:6px;border-radius:3px;background:var(--surface-3);margin-top:10px;overflow:hidden"><div style="width:100%;height:6px;background:var(--brand)"></div></div>
      <div class="z-meta" style="margin-top:8px">Fachstunden 212 h · Helfer 34 h · Material € 6 830 netto</div>
    </div>
    {abschnitt('Zeiten', 'letzte 5', 'Alle 63')}
    {zeile('Fr, 25.09.2026 · Max Mustermann', 'Verteiler gesetzt, Steigleitungen gespült', wert('09:00 Std'), False)}
    {zeile('Fr, 25.09.2026 · Michaela Wagner', 'Helferin', wert('08:00 Std'), False)}
    {zeile('Do, 24.09.2026 · Max Mustermann', 'Verteiler gesetzt', wert('08:30 Std'), False)}
  </div>
</div>
<div class="spalte">
  <div class="karte">
    <div class="karte-kopf"><h2>Nächste Einsätze</h2><a class="link w">Wochenplan</a></div>
    {zeile('Mo, 28.09.', 'Max Mustermann, Michaela Wagner (Helferin)')}
    {zeile('Di, 29.09.', 'Max Mustermann')}
    {abschnitt('Handwerksscheine', '4', 'Alle')}
    {zeile('Fr, 25.09.2026', '08:30 Std · 3 Positionen', '<span class="pille p-leise">Entwurf</span>')}
    {zeile('Mi, 16.09.2026', '17:00 Std · 6 Positionen', '<span class="pille p-ok">Unterschrieben</span>')}
    {zeile('Fr, 11.09.2026', '09:00 Std · 2 Positionen', '<span class="pille p-info">Verrechnet</span>')}
    {abschnitt('Rechnungen', '2')}
    {zeile('RE-2026-0231 · Schlussrechnung', 'gemahnt 15.09.', '<div class="z-wert" style="color:var(--danger)">€ 22 104,60</div>')}
    {zeile('RE-2026-0219 · Teilrechnung', 'bezahlt 03.07.', wert('€ 9 840,00'))}
    {abschnitt('Material und Dokumente', '', 'Anforderungen')}
    {zeile('12 × Kupferrohr 22 mm, Stange 5 m', 'Anton Berger-Steinmetz · 25.09.', '<span class="pille p-warn">Offen</span>')}
    {zeile('Dokumente', 'Angebot, Pläne, 2 Fotos')}
  </div>
</div>
</div>
'''

# ─────────────────────────────────────────────────────────── D4 Zeiterfassung (Leiste + 2 Karten)
d4 = f'''
<div class="seitenkopf"><div><h1>Zeiterfassung</h1><div class="strich"></div><div class="meta">Deine gebuchten Zeiten und dein Saldo</div></div></div>
<div class="kennzahlen">
  <div class="kennzahl"><div class="name">Diese Woche</div><div class="wert">17:00</div><div class="zusatz">von 38:30 Std</div></div>
  <div class="kennzahl"><div class="name">Saldo September</div><div class="wert">+01:00</div><div class="zusatz">Zeitkonto</div></div>
  <div class="kennzahl"><div class="name">Zuschläge</div><div class="wert">09:00</div><div class="zusatz">Nacht 09:00 · letzte 3 Monate</div></div>
  <div class="kennzahl"><div class="name">Ohne Buchung</div><div class="wert">2 Tage</div><div class="zusatz">Do 24.09., Mo 21.09.</div></div>
</div>
<div class="zwei" style="grid-template-columns:minmax(0,5fr) minmax(0,7fr)">
<div class="spalte">
  <div class="karte">
    <div class="karte-kopf"><h2>Neuen Eintrag erfassen</h2><a class="link">Wie zuletzt</a></div>
    <div class="karte-koerper" style="display:flex;flex-direction:column;gap:14px">
      <div class="reihe2"><div class="feld"><label>Datum</label><div class="eingabe">26.09.2026 {I['cal']}</div></div><div class="feld"><label>Status</label><div class="eingabe">Anwesend {ch}</div></div></div>
      <div class="feld"><label>Arbeitszeit</label><div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:8px"><div class="eingabe">07:00</div><div class="eingabe">16:00</div><div class="eingabe">30 min</div></div><div class="z-meta">Von · Bis · Pause</div></div>
      <div class="feld"><label>Baustelle</label><div class="eingabe">WEG Hauptstraße 112–118 · B-2026-0147 {ch}</div></div>
      <div class="feld"><label>Tätigkeit <span style="font-weight:400;color:var(--muted)">(freiwillig)</span></label><div class="eingabe leer">z. B. Verteiler gesetzt</div></div>
      <div class="zeile" style="padding:6px 0;min-height:40px;border-top:0"><div class="z-text"><div class="z-titel">Weitere Angaben</div><div class="z-meta">Wegzeit, Zuschläge, Notdienst, Helfer</div></div><span class="link w">Öffnen</span></div>
      <div style="display:flex;justify-content:space-between;align-items:center"><span style="color:var(--muted);font-size:14px">Arbeitszeit <b style="color:var(--ink-deep);font-weight:600">08:30 Std</b></span><a class="btn btn-primaer">Zeit buchen</a></div>
    </div>
  </div>
</div>
<div class="spalte">
  <div class="karte">
    <div class="karte-kopf"><h2>Meine Einträge</h2><span class="chip">Letzte 3 Monate {ch}</span></div>
    <table>
    <thead><tr><th>Datum</th><th>Baustelle · Tätigkeit</th><th>Von – Bis</th><th class="r">Std</th><th></th></tr></thead>
    <tbody>
    <tr><td><b>Fr, 26.09.</b><div class="z-meta">KW 39</div></td><td><b>WEG Hauptstraße 112–118</b><div class="z-meta">Verteiler gesetzt, Steigleitungen gespült · Notdienst</div></td><td>07:00 – 16:30</td><td class="r"><b>09:00</b></td><td class="r">{I['dots']}</td></tr>
    <tr><td><b>Do, 17.09.</b><div class="z-meta">KW 38</div></td><td><b>Gemeinde Neudorf</b><div class="z-meta">Rohbau Sanitär</div></td><td>07:30 – 17:00</td><td class="r"><b>08:45</b></td><td class="r">{I['dots']}</td></tr>
    <tr><td><b>Mi, 16.09.</b></td><td><span class="pille p-info">Krank</span></td><td>—</td><td class="r"><b>00:00</b></td><td></td></tr>
    <tr><td><b>Di, 15.09.</b></td><td><span class="pille p-warn">Urlaub</span></td><td>—</td><td class="r"><b>00:00</b></td><td></td></tr>
    </tbody></table>
    <div class="karte-fuss"><span style="color:var(--muted)">4 Einträge · Wochensumme KW 39: 09:00</span><a class="link w">Ältere Einträge</a></div>
  </div>
</div>
</div>
'''

# ─────────────────────────────────────────────────────────── B0 Bausteine
b0 = f'''
<div class="seitenkopf"><div><h1>Bausteine der Linie</h1><div class="strich"></div><div class="meta">Ein Vokabular für jede Seite — dieselben Tokens wie heute</div></div></div>
<div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:20px;align-items:start">
<div class="spalte">
  <div class="karte"><div class="karte-kopf"><h2>Schrift</h2></div><div class="karte-koerper" style="display:flex;flex-direction:column;gap:6px">
    <div style="font-size:24px;line-height:30px;font-weight:600">Seitentitel 24/30 · halbfett</div>
    <div style="font-size:16px;font-weight:600">Kartentitel 16 · halbfett</div>
    <div style="font-size:15px;font-weight:500">Zeilentitel 15 · mittel</div>
    <div style="font-size:15px">Fließtext 15 · normal</div>
    <div class="z-meta">Meta 13 · gedämpft</div>
    <div style="font-size:21px;font-weight:600">€ 22 105 · 09:00 Std</div>
    <div class="z-meta">Zahlen: gleich breit, rechtsbündig, Komma</div>
  </div></div>
  <div class="karte"><div class="karte-kopf"><h2>Knöpfe und Links</h2></div><div class="karte-koerper" style="display:flex;flex-direction:column;gap:10px">
    <a class="btn btn-primaer">Hauptaktion</a><a class="btn btn-sekundaer">Zweitaktion</a>
    <div style="display:flex;gap:8px"><a class="btn btn-sekundaer btn-klein">{I['plus']}Klein</a><span class="chip an">Filter</span><span class="chip">Filter</span></div>
    <div style="display:flex;gap:16px"><a class="link w">Weiter-Link</a><a class="link">Text-Link</a></div>
  </div></div>
</div>
<div class="spalte">
  <div class="karte">
    <div class="karte-kopf"><h2>Karte mit Zeilen<span class="anzahl">· 3</span></h2><a class="link w">Alle</a></div>
    {zeile('Titel der Zeile', 'Meta · Nummer · Ort', wert('€ 1 416,00', 'Offen'))}
    {zeile('Zeile mit Status', 'Meta', '<span class="pille p-ok">Genehmigt</span>')}
    {zeile('Zeile mit Aktion', 'Meta', '<span class="btn btn-sekundaer btn-klein">Anfordern</span>', False)}
    {abschnitt('Abschnitt in derselben Karte', '2', 'Alle')}
    {zeile('Statt einer weiteren Karte', 'Meta')}
    <div class="karte-fuss"><span style="color:var(--muted)">und 4 weitere</span><a class="link w">Liste</a></div>
  </div>
  <div class="karte"><div class="karte-kopf"><h2>Status</h2></div><div class="karte-koerper" style="display:flex;flex-wrap:wrap;gap:8px 18px">
    <span class="pille p-ok">Bezahlt</span><span class="pille p-info">Offen</span><span class="pille p-warn">Beantragt</span><span class="pille p-fehl">Überfällig</span><span class="pille p-leise">Entwurf</span>
  </div></div>
  <div class="hinweis warn">{I['warn']}<span><b>Hinweiszeile</b> ohne Rahmen — ein Satz, ein Link. <a class="link">Nachtragen ›</a></span></div>
  <div class="hinweis">{I['check']}<span>Ruhiger Leerzustand: „Alles erledigt.“</span></div>
</div>
<div class="spalte">
  <div class="kennzahlen" style="grid-template-columns:1fr 1fr">
    <div class="kennzahl"><div class="name">Kennzahl</div><div class="wert">€ 8 904</div><div class="zusatz">eine Leiste, nicht vier Kacheln</div></div>
    <div class="kennzahl"><div class="name">Kennzahl</div><div class="wert" style="color:var(--danger)">1</div><div class="zusatz">Rot nur bei Überfällig</div></div>
  </div>
  <div class="karte"><div class="karte-kopf"><h2>Felder</h2></div><div class="karte-koerper" style="display:flex;flex-direction:column;gap:12px">
    <div class="feld"><label>Beschriftung</label><div class="eingabe leer">Platzhalter, 16 px</div></div>
    <div class="segment" style="grid-template-columns:1fr 1fr 1fr"><span class="an">Urlaub</span><span>Zeitausgleich</span><span>Krank</span></div>
    <div style="display:flex;gap:12px;align-items:center">{stepper(6)}<span class="schalter an"></span><span class="schalter"></span></div>
  </div></div>
  <div class="schritte"><div class="schritt fertig"><i></i>Zeiten</div><div class="schritt jetzt"><i></i>Material</div><div class="schritt"><i></i>Fotos</div><div class="schritt"><i></i>Unterschrift</div></div>
</div>
</div>
'''

SEITEN = {
  'm1-monteur-start': (seite_telefon('Monteur Start', m1, 'start', TABS_MONTEUR, hoehe=1040), 375, 1040),
  'm2-zeit-erfassen': (seite_telefon('Zeit erfassen', m2, 'zeit', TABS_MONTEUR, hoehe=1040), 375, 1040),
  'm3-schein-material': (seite_telefon('Handwerksschein', m3, 'mehr', TABS_MONTEUR, hoehe=1040), 375, 1040),
  'm4-rechnungen': (seite_telefon('Rechnungen', m4, 'rechnungen', TABS_BUERO, initialen='JD', hoehe=1040), 375, 1040),
  'm5-urlaub': (seite_telefon('Urlaub', m5, 'mehr', TABS_MONTEUR, hoehe=1040), 375, 1040),
  't1-wochenplan': (seite_tablet('Einsatzplanung', t1, 'planung', hoehe=700), 834, 700),
  'd1-buero-start': (seite_tisch('Büro Start', d1, 'start', hoehe=860), 1440, 860),
  'd2-rechnungen': (seite_tisch('Rechnungen', d2, 'rechnungen', hoehe=700), 1440, 700),
  'd3-baustellenakte': (seite_tisch('Baustellenakte', d3, 'baustellen', hoehe=980), 1440, 980),
  'd4-zeiterfassung': (seite_tisch('Zeiterfassung', d4, 'zeit', hoehe=780), 1440, 780),
  'b0-bausteine': (seite_tisch('Bausteine', b0, 'einstellungen', hoehe=900), 1440, 900),
}
