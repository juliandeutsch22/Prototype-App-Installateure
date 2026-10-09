"""
Erzeugt die Migration „Zeilenschutz einmal je Abfrage“ aus den GELTENDEN
Regeln einer frisch aufgesetzten Datenbank (alle Migrationen davor).

  docker exec <db> psql -U postgres -At -c "<Abfrage unten>" > regeln.json
  python3 scripts/leseregeln-umbauen.py regeln.json > supabase/migrations/…sql

Die Ersetzungen sind rein mechanisch und je für sich gleichwertig (siehe
Kopf der Migration). Was kein Muster trifft, bleibt Wort für Wort stehen.
Die Gleichwertigkeit prüft `tests/supabase/leseregelnGleichwertig.test.ts`
gegen die eingefrorene alte und neue Fassung `tests/supabase/leseregeln-umbau.json`.

Abfrage:
  select json_agg(json_build_object('s',schemaname,'t',tablename,'p',policyname,
    'cmd',cmd,'roles',roles,'perm',permissive,'q',qual,'w',with_check)
    order by schemaname,tablename,policyname)
    from pg_policies where schemaname = 'public'
"""
import json
import re
import sys

# Rollen und Anmeldung: hängen nicht an der Zeile → einmal je Abfrage.
OHNE_ZEILE = {
    'auth.uid', 'app.ist_fuehrung', 'app.ist_buch_oder_spitze', 'app.ist_spitze',
    'app.ist_plattform', 'app.rolle', 'app.hat_rolle', 'app.darf_einkauf_sehen',
    'app.darf_katalog_einspielen', 'app.darf_kunden_pflegen', 'app.darf_rechnungen_lesen',
}


def aufruf_ende(text: str, start: int) -> int:
    """Index hinter der schließenden Klammer des Aufrufs, dessen „(“ bei start-1 steht."""
    tiefe, i, in_text = 1, start, False
    while tiefe:
        c = text[i]
        if c == "'":
            in_text = not in_text
        elif not in_text:
            if c == '(':
                tiefe += 1
            elif c == ')':
                tiefe -= 1
        i += 1
    return i


def nur_konstanten(arg: str) -> bool:
    ohne_texte = re.sub(r"'[^']*'", '', arg)
    ohne_typen = re.sub(r'::\w+(\[\])?', '', ohne_texte)
    return re.fullmatch(r'[\s,\[\]]*(ARRAY[\s,\[\]]*)?', ohne_typen) is not None


def umbauen(e: str) -> str:
    aus, i = [], 0
    muster = re.compile(r'\b((?:app|auth)\.[a-z_]+)\(')
    while True:
        m = muster.search(e, i)
        if not m:
            aus.append(e[i:])
            break
        aus.append(e[i:m.start()])
        name, ende = m.group(1), aufruf_ende(e, m.end())
        arg = e[m.end():ende - 1]
        if name == 'app.darf':
            x = umbauen(arg)
            aus.append(f'(({x}) = ( SELECT app.lesebetrieb()) OR ({x}) = ( SELECT app.supportbetrieb()))')
        elif name == 'app.betriebsmitglied':
            aus.append(f'(({umbauen(arg)}) = ( SELECT app.lesebetrieb()))')
        elif name == 'app.support_liest':
            aus.append(f'(({umbauen(arg)}) = ( SELECT app.supportbetrieb()))')
        elif name in OHNE_ZEILE and nur_konstanten(arg):
            # Nur ohne Spaltenbezug: leer oder lauter Konstanten (ARRAY['…'::text]).
            aus.append(f'( SELECT {name}({arg}))')
        else:
            aus.append(f'{name}({umbauen(arg)})')
        i = ende
    return ''.join(aus)


def bezeichner(n: str) -> str:
    return n if re.fullmatch(r'[a-z_][a-z0-9_]*', n) else '"' + n.replace('"', '""') + '"'


regeln = json.load(open(sys.argv[1]))
geaendert = 0
zeilen = []
for r in regeln:
    if r['s'] != 'public':
        continue
    q, w = r['q'], r['w']
    nq = umbauen(q) if q else None
    nw = umbauen(w) if w else None
    if nq == q and nw == w:
        continue
    geaendert += 1
    teile = [f"alter policy {bezeichner(r['p'])} on public.{bezeichner(r['t'])}"]
    if q is not None:
        teile.append(f'  using ({nq})')
    if w is not None:
        teile.append(f'  with check ({nw})')
    zeilen.append('\n'.join(teile) + ';\n')

sys.stderr.write(f'{geaendert} Regeln umgebaut\n')
print('\n'.join(zeilen))
