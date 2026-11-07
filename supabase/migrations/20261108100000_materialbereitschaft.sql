/*
  MATERIALBEREITSCHAFT UND BESTELLVORSCHLÄGE
  (SHK-Ausbau M04b; E13 „Behalten“, E14, G03 „Integrieren“; Befund 7 der
  Bestandsmatrix)

  WAS FEHLTE. Die Fehlmenge einer Rüstliste wurde an drei Stellen gerechnet:
  im Formular (`ruestFehlmenge.ts` mit `lager_frei`), in der Monatsvorschau
  (`monatsVorschau.ts`, ohne Abzug des Angeforderten) und in der Karte des
  Formulars. Alle drei zogen vom Bestand JEDE Reservierung ab Heute ab —
  auch die einer Liste, die erst nach dieser dran ist. Zwei Baustellen, die
  um dieselbe Menge konkurrieren, meldeten so beide eine Fehlmenge, obwohl
  die frühere gedeckt ist. Ob eine Anforderung geliefert, bestellt oder nur
  angelegt ist, sah keine der drei; eine Bestellung für das Lager
  (`einkauf_posten`) ebenso wenig. Einen Bestellvorschlag mit Menge gab es
  nicht.

  WAS JETZT GILT — EINE RECHNUNG.
  - `materialdeckung(von, bis)` liefert je Rüstliste im Zeitraum, was die
    Rechnung braucht: je Position Menge, eingeladen, und was ihre
    verknüpften Anforderungen gerade sind (abgeholt, liegt bereit, bestellt
    mit Liefertermin, auf der Einkaufsliste, offen); je Liste und Artikel,
    was im Hauptlager VOR dieser Liste frei ist (`frei_vor`); je Artikel,
    was für das Lager unterwegs ist (`zulauf`, offene `einkauf_posten`).
    Die App rechnet daraus mit EINER Funktion
    (`src/features/assignments/materialDeckung.ts`) den Zustand jeder
    Position und jedes Einsatzes — Woche, Monat, Tag, Formular und
    Startseite lesen dieselbe.
  - EINE MENGE DECKT NICHT ZWEI BEDARFE (Bauplanung K02). Wer zuerst dran
    ist, bekommt zuerst: nach Einsatztag, dann nach Anlage der Liste. `frei_vor`
    ist der Bestand minus den Zusagen (wie `lager_frei`) minus den
    Reservierungen der Listen, die VOR dieser dran sind. Die eigene Liste
    zählt nicht gegen sich selbst (Eigenreservierung ohne Doppelzählung).
    Eine Liste für einen vergangenen Tag reserviert nichts und hat keinen
    Vorrang (wie seit M32) — für sie ist `frei_vor` das Freie aus
    `lager_frei`. Summiert über alle Listen ergibt die Zuteilung dieselbe
    Fehlmenge wie `lager_frei`: verteilt wird, nicht neu gerechnet.
  - BESTELLT, ZUGESAGT UND VORHANDEN BLEIBEN GETRENNT. Was eine verknüpfte
    Anforderung bringt, deckt die Position über die Anforderung — mit deren
    Stand. Der Zulauf für das Lager deckt Fehlmengen nach demselben Vorrang
    wie das Regal, erst die bestellten mit dem frühesten Termin.
  - Gebucht wird dadurch nichts anders: Reservierung, Abhaken, „Aus Lager“
    und Rechnungsvorschlag bleiben Wort für Wort (`lager_frei`,
    `laden_umschalten`, `app.lager_zugesagt`, `ausgegebenes_material`).

  BESTELLVORSCHLÄGE (E14, G03).
  - Neu am Artikel: `sollbestand` (bis wohin aufgefüllt wird) und
    `verpackungseinheit` (in welchen Schritten bestellt wird). Je Artikel,
    nicht je Ort: bestellt wird ins Hauptlager, gegen das auch reserviert
    wird (M04a); ein Fahrzeug füllt man durch Umlagern auf, nicht durch eine
    Bestellung.
  - Vorgeschlagen wird, wenn das Erwartete — frei nach Zusagen und
    Rüstlisten plus Zulauf — unter der Mindestmenge liegt oder unter null
    (G03: Fehlmengen aus Rüstlisten und Zusagen). Die Menge reicht bis zum
    Sollbestand, ohne ihn bis zur Mindestmenge, ohne beide bis null;
    aufgerundet auf die Verpackungseinheit, in Stück auf ganze.
  - NICHTS DOPPELT: was schon auf der Einkaufsliste steht oder bestellt ist,
    ist Zulauf. Was eine Anforderung bringt, steht nicht in der Reservierung
    (die Position reserviert nur ihren Rest), und eine noch nicht
    entschiedene Anforderung entscheidet die Verwaltung („Aus Lager“ oder
    „Nicht auf Lager“) — sie wird nicht zusätzlich vorgeschlagen.
  - Der Großhändler ist der Vorschlag der Einkaufsliste
    (`app.lieferant_vorschlag_wahl`, M03a), ohne Preis.
  - „Übernehmen“ (`bestellvorschlaege_uebernehmen`, Schreibbefehls-Vertrag
    M04a) legt `einkauf_posten` an — dieselben Zeilen wie „Material
    dazusetzen“, mit derselben Rolle wie die Regel `einkauf_posten_anlegen`
    (Verwaltung oder Leitung). Mehrere auf einmal; gebündelt je Großhändler
    steht es danach auf der Einkaufsliste. Unter Sperre der Artikel wird neu
    gerechnet: was inzwischen gedeckt ist, wird übersprungen, ein
    geänderter Vorschlag ist veraltet. KEINE AUTOMATISCHE BESTELLUNG.

  MODULE: `material.materialbereitschaft` und `material.bestellvorschlaege`,
  beide Standard an, im Register des Servers (V3). Die Vorschläge und ihre
  Übernahme prüfen ihr Modul auf dem Server. `materialdeckung` prüft keines:
  sie ersetzt die Rechnung der bestehenden Fehlmenge im Formular und in der
  Monatsvorschau, die auch ohne die neue Anzeige bleiben.

  RECHTE: Verwaltung und Leitung — wer Einsätze plant oder das Lager führt.
  Der Zulauf verrät, was das Büro für das Lager bestellt; die Einkaufsliste
  lesen genau diese Rollen. Der Support sieht beides nicht (wie
  `lager_frei`, das an der Anmeldung des Betriebs hängt).
*/

-- ---------------------------------------------------------------------------
-- 1. Sollbestand und Verpackungseinheit am Artikel
-- ---------------------------------------------------------------------------

alter table public.materials
  add column if not exists sollbestand numeric(12,3),
  add column if not exists verpackungseinheit numeric(12,3);

comment on column public.materials.sollbestand is
  'Bis wohin ein Bestellvorschlag auffüllt (M04b). Leer: bis zur Mindestmenge. Nie unter der Mindestmenge.';
comment on column public.materials.verpackungseinheit is
  'In welchen Schritten bestellt wird (M04b) — der Vorschlag rundet auf ein Vielfaches auf. Leer: unbekannt.';

alter table public.materials drop constraint if exists materials_sollbestand;
alter table public.materials add constraint materials_sollbestand
  check (sollbestand is null or (sollbestand >= 0 and (mindestmenge is null or sollbestand >= mindestmenge)));

alter table public.materials drop constraint if exists materials_verpackungseinheit;
alter table public.materials add constraint materials_verpackungseinheit
  check (verpackungseinheit is null or verpackungseinheit > 0);

/*
  Sollbestand und Verpackungseinheit pflegt, wer Mindestmenge und Katalog
  pflegt. Rumpf wie in 20260930410000_katalog_lager_aufschlag_wartung.sql;
  neu sind nur die beiden Felder in der Liste der Katalogfelder.
*/
create or replace function app.materialfelder_geschuetzt() returns trigger
  language plpgsql
  set search_path = ''
as $$
declare
  pflegt boolean := app.hat_rolle(array['Verwaltung']) or app.ist_fuehrung();
  -- Seit 30.09.2026 (M37) auch, wer die Freigabe „Katalog einspielen“ hat.
  spitze boolean := app.ist_spitze() or app.darf_katalog_einspielen();
begin
  -- Ein Datanorm-Import bringt Einkaufspreise mit; er laeuft serverseitig.
  if app.ist_dienst() then return new; end if;

  if tg_op = 'INSERT' then
    if new.einkaufspreis is not null and not spitze then
      raise exception 'Den Einkaufspreis setzt die Geschäftsführung — oder wer die Freigabe „Katalog einspielen“ hat'
        using errcode = '42501';
    end if;
    return new;
  end if;

  if new.einkaufspreis is distinct from old.einkaufspreis and not spitze then
    raise exception 'Den Einkaufspreis ändert die Geschäftsführung — oder wer die Freigabe „Katalog einspielen“ hat'
      using errcode = '42501';
  end if;

  if (new.name is distinct from old.name
      or new.category is distinct from old.category
      or new.article_number is distinct from old.article_number
      or new.unit is distinct from old.unit
      or new.verkaufspreis is distinct from old.verkaufspreis
      or new.warengruppe is distinct from old.warengruppe
      or new.lagerartikel is distinct from old.lagerartikel
      or new.mindestmenge is distinct from old.mindestmenge
      -- M04b
      or new.sollbestand is distinct from old.sollbestand
      or new.verpackungseinheit is distinct from old.verpackungseinheit)
     and not pflegt then
    raise exception 'Den Katalog pflegt die Verwaltung oder die Führung'
      using errcode = '42501';
  end if;

  if (new.stock is distinct from old.stock
      or new.ausgelaufen is distinct from old.ausgelaufen)
     and not pflegt
     and current_user = 'authenticated' then
    raise exception 'Den Bestand bewegt das Lager — Abholung und Retoure buchen ihn selbst'
      using errcode = '42501';
  end if;

  return new;
end;
$$;

-- Der Zulauf je Artikel: offene eigene Posten (die Einkaufsliste fragt nach Großhändler, hier nach Artikel).
create index if not exists einkauf_posten_offen_artikel
  on public.einkauf_posten (company_id, material_id)
  where geliefert_am is null and material_id is not null;

-- ---------------------------------------------------------------------------
-- 2. Das Modulregister (V3) — volle Liste wie in 20261107300000, dazu M04b
-- ---------------------------------------------------------------------------

create or replace function app.modul_register()
  returns table (kennung text, standard boolean, abhaengig_von text[])
  language sql
  immutable
  security definer
  set search_path = ''
as $$
  values
    ('baustellen', true, '{}'::text[]),
    ('baustellen.auftragseingang', true, '{}'::text[]),
    ('kunden', true, '{}'::text[]),
    ('einsatzplanung', true, '{}'::text[]),
    ('material', true, '{}'::text[]),
    ('material.katalogversionen', true, '{}'::text[]),
    ('material.lieferantenvergleich', true, '{}'::text[]),
    ('material.katalogpreisverlauf', true, '{}'::text[]),
    ('material.lagerorte_fahrzeuglager', true, '{}'::text[]),
    ('material.materialbereitschaft', true, '{}'::text[]),
    ('material.bestellvorschlaege', true, '{}'::text[]),
    ('urlaub', true, '{}'::text[]),
    ('scheine', true, '{}'::text[]),
    ('angebote', true, '{}'::text[]),
    ('angebote.online_annahme', true, '{}'::text[]),
    ('rechnungen', true, '{}'::text[]),
    ('nachkalkulation', true, '{rechnungen}'::text[]),
    ('wartung', true, '{}'::text[]),
    ('zeitkonten', true, '{}'::text[])
$$;

revoke all on function app.modul_register() from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- 3. Was im Hauptlager vor einer Liste frei ist (K02)
-- ---------------------------------------------------------------------------

/*
  Bestand minus Zusagen minus die Reservierungen der Listen, die VOR der
  genannten dran sind: nach Einsatztag, dann nach Anlage, dann nach Kennung.
  Zusagen und Reservierung Wort für Wort wie in `lager_frei`
  (20261107200100_lagerorte_bestehende_wege.sql): eine Zusage nur im
  Hauptlager, eine Position nur mit dem Rest, den keine Anforderung bringt,
  eine eingeladene gar nicht.

  - Eine neue, noch nicht gespeicherte Liste kommt an ihrem Tag als letzte
    (`p_angelegt` = unendlich).
  - Ein vergangener Tag (`p_datum` < heute) hat keinen Vorrang: dann zählen
    alle Reservierungen — das ist genau `lager_frei.frei`.
*/
create or replace function app.deckung_frei_vor(
  p_betrieb text, p_material uuid, p_datum date, p_angelegt timestamptz, p_liste uuid, p_heute date
) returns numeric
  language sql
  stable
  security definer
  set search_path = ''
as $$
  select coalesce((select m.stock from public.materials m
                    where m.id = p_material and m.company_id = p_betrieb), 0)
       - (select coalesce(sum(o.quantity), 0)
            from public.material_orders o
           where o.company_id = p_betrieb
             and o.material_id = p_material
             and o.transaction_type = 'order'
             and not o.processed
             and o.lagerort_id is null
             and (o.beschaffung = 'lager'
                  or (o.beschaffung = 'einkauf' and o.geliefert_am is not null)
                  or (o.beschaffung is null and o.status = 'Abholbereit')))
       - (select coalesce(sum(greatest(p.menge - app.ruest_angefordert(e.id, p.id), 0)), 0)
            from public.einsatz_material_positionen p
            join public.einsatz_material e on e.id = p.einsatz_material_id
           where p.material_id = p_material
             and e.company_id = p_betrieb
             and e.date >= p_heute
             and not coalesce((e.geladen -> p.id) ? 'gebucht', false)
             and (p_datum < p_heute
                  or (e.date, e.created_at, e.id) < (p_datum, p_angelegt, p_liste)))
$$;

revoke all on function app.deckung_frei_vor(text, uuid, date, timestamptz, uuid, date) from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- 4. Die Eingaben der Deckungsrechnung
-- ---------------------------------------------------------------------------

/*
  JE RÜSTLISTE IM ZEITRAUM (höchstens 31 Tage — Woche, Monatstag, Tag,
  Startseite): die Positionen mit dem Stand ihrer Anforderungen und das
  Freie vor der Liste; dazu je Artikel, ob er im Lager geführt wird, und
  sein Zulauf. Als ein JSON-Wert: die Grenze von 1.000 Zeilen der
  Schnittstelle schnitte eine Tabelle still ab.

  MIT `p_baustelle` (ein Tag): das Formular einer Liste. `fuer` nennt die
  Liste (oder keine, wenn sie neu ist) und das Freie vor ihr für ihre
  Artikel und für die in `p_dazu` — Artikel, die gerade hinzugefügt und
  noch nicht gespeichert sind.

  Die Stände einer Anforderung schließen einander aus, in dieser Folge:
  abgeholt (verbucht oder „Erledigt“), liegt bereit (aus dem Lager
  zugesagt, geliefert, „Abholbereit“), bestellt (mit Liefertermin, wenn
  einer da ist), auf der Einkaufsliste (noch nicht bestellt), offen.
*/
create or replace function public.materialdeckung(
  p_von date, p_bis date, p_baustelle text default null, p_dazu uuid[] default null
) returns jsonb
  language plpgsql
  stable
  security definer
  set search_path = ''
as $$
declare
  betrieb text := app.lesebetrieb();
  heute date := (now() at time zone 'Europe/Vienna')::date;
  fuer_liste public.einsatz_material;
begin
  if betrieb is null or not (app.hat_rolle(array['Verwaltung']) or app.ist_fuehrung()) then
    raise exception 'Die Materialbereitschaft sehen Verwaltung und Leitung' using errcode = '42501';
  end if;
  if p_von is null or p_bis is null or p_bis < p_von or p_bis - p_von > 30 then
    raise exception 'Der Zeitraum umfasst einen bis höchstens 31 Tage' using errcode = '22023';
  end if;
  if coalesce(cardinality(p_dazu), 0) > 500 then
    raise exception 'Höchstens 500 Artikel je Anfrage' using errcode = '22023';
  end if;
  if p_baustelle is not null then
    if p_von <> p_bis then
      raise exception 'Das Formular einer Liste fragt nach genau einem Tag' using errcode = '22023';
    end if;
    select * into fuer_liste from public.einsatz_material e
     where e.company_id = betrieb and e.date = p_von and e.project_number = p_baustelle;
  end if;

  return (
    with listen as (
      select e.id, e.date, e.project_number, e.created_at, e.geladen
        from public.einsatz_material e
       where e.company_id = betrieb
         and e.date between p_von and p_bis
    ),
    pos as (
      select l.id as liste, p.id, p.position, p.material_id, p.menge,
             coalesce((l.geladen -> p.id) ? 'gebucht', false) as gebucht
        from listen l
        join public.einsatz_material_positionen p on p.einsatz_material_id = l.id
    ),
    anf_roh as (
      select o.ruestliste_id as liste, o.ruest_position as position, o.quantity as menge, o.liefertermin,
             case when o.processed or o.status = 'Erledigt' then 'abgeholt'
                  when o.beschaffung = 'lager'
                       or (o.beschaffung = 'einkauf' and o.geliefert_am is not null)
                       or (o.beschaffung is null and o.status = 'Abholbereit') then 'bereit'
                  when o.beschaffung = 'einkauf' and o.bestellt_am is not null then 'bestellt'
                  when o.beschaffung = 'einkauf' then 'auf_liste'
                  else 'offen' end as stand
        from public.material_orders o
       where o.company_id = betrieb
         and o.transaction_type = 'order'
         and o.ruestliste_id in (select l.id from listen l)
    ),
    anf as (
      select a.liste, a.position,
             jsonb_build_object(
               'angefordert', sum(a.menge),
               'abgeholt', coalesce(sum(a.menge) filter (where a.stand = 'abgeholt'), 0),
               'bereit', coalesce(sum(a.menge) filter (where a.stand = 'bereit'), 0),
               'bestellt', coalesce(sum(a.menge) filter (where a.stand = 'bestellt'), 0),
               'termin', max(a.liefertermin) filter (where a.stand = 'bestellt'),
               'termin_offen', coalesce(bool_or(a.liefertermin is null) filter (where a.stand = 'bestellt'), false),
               'auf_liste', coalesce(sum(a.menge) filter (where a.stand = 'auf_liste'), 0),
               'offen', coalesce(sum(a.menge) filter (where a.stand = 'offen'), 0)) as stand
        from anf_roh a
       group by a.liste, a.position
    ),
    paare as (
      select distinct p.liste, p.material_id from pos p where p.material_id is not null
    ),
    frei as (
      select pa.liste,
             jsonb_object_agg(pa.material_id::text,
               app.deckung_frei_vor(betrieb, pa.material_id, l.date, l.created_at, l.id, heute)) as frei_vor
        from paare pa
        join listen l on l.id = pa.liste
       group by pa.liste
    ),
    artikel as (
      select m.id, m.lagerartikel
        from public.materials m
       where m.company_id = betrieb
         and (m.id in (select p.material_id from pos p where p.material_id is not null)
              or m.id = any (coalesce(p_dazu, '{}'::uuid[])))
    ),
    zulauf as (
      select k.material_id,
             jsonb_agg(jsonb_build_object('menge', k.menge, 'bestellt', k.bestellt_am is not null, 'termin', k.liefertermin)
                       order by (k.bestellt_am is null), k.liefertermin nulls last, k.created_at, k.id) as eintraege
        from public.einkauf_posten k
       where k.company_id = betrieb
         and k.geliefert_am is null
         and k.material_id in (select a.id from artikel a)
       group by k.material_id
    )
    select jsonb_build_object(
      'heute', heute,
      'listen', coalesce((
        select jsonb_agg(jsonb_build_object(
                 'id', l.id,
                 'datum', l.date,
                 'baustelle', l.project_number,
                 'frei_vor', coalesce(f.frei_vor, '{}'::jsonb),
                 'positionen', coalesce((
                   select jsonb_agg(jsonb_build_object(
                            'id', p.id, 'material', p.material_id, 'menge', p.menge,
                            'gebucht', p.gebucht, 'anf', a.stand)
                          order by p.position, p.id)
                     from pos p
                     left join anf a on a.liste = p.liste and a.position = p.id
                    where p.liste = l.id), '[]'::jsonb))
               order by l.date, l.created_at, l.id)
          from listen l
          left join frei f on f.liste = l.id), '[]'::jsonb),
      'lagerartikel', coalesce((select jsonb_object_agg(a.id::text, a.lagerartikel) from artikel a), '{}'::jsonb),
      'zulauf', coalesce((select jsonb_object_agg(z.material_id::text, z.eintraege) from zulauf z), '{}'::jsonb),
      'fuer', case when p_baustelle is null then null else jsonb_build_object(
        'liste', fuer_liste.id,
        'frei_vor', coalesce((
          select jsonb_object_agg(a.id::text,
                   app.deckung_frei_vor(betrieb, a.id, p_von,
                     coalesce(fuer_liste.created_at, 'infinity'::timestamptz),
                     coalesce(fuer_liste.id, 'ffffffff-ffff-ffff-ffff-ffffffffffff'::uuid), heute))
            from artikel a
           where a.id = any (coalesce(p_dazu, '{}'::uuid[]))
              or a.id in (select p.material_id from pos p where p.liste = fuer_liste.id)), '{}'::jsonb))
      end)
  );
end;
$$;

revoke all on function public.materialdeckung(date, date, text, uuid[]) from public, anon;
grant execute on function public.materialdeckung(date, date, text, uuid[]) to authenticated;

-- ---------------------------------------------------------------------------
-- 5. Bestellvorschläge
-- ---------------------------------------------------------------------------

/* Aufrunden: auf die Verpackungseinheit, in Stück auf ganze, sonst auf drei Stellen. */
create or replace function app.bestellmenge(p_roh numeric, p_vpe numeric, p_einheit text)
  returns numeric
  language sql
  immutable
  set search_path = ''
as $$
  select case when app.menge_mit_komma(p_einheit) then ceil(x * 1000) / 1000 else ceil(x) end
    from (select case when p_vpe is not null and p_vpe > 0 then ceil(p_roh / p_vpe) * p_vpe else p_roh end as x) r
$$;

revoke all on function app.bestellmenge(numeric, numeric, text) from public, anon, authenticated;

/*
  DER VORSCHLAG JE ARTIKEL — für die Ansicht und, unter Sperre, für die
  Übernahme. Gefragt werden die Artikel mit Mindestmenge im Lager, die
  Artikel offener Rüstlisten ab heute und die mit Zusagen; mit `p_ids` nur
  diese. `frei` ist `lager_frei.frei` (dieselbe Zuteilung, `app.deckung_frei_vor`
  für einen vergangenen Tag), `zulauf` was für das Lager auf der
  Einkaufsliste steht oder bestellt ist.
*/
create or replace function app.bestellvorschlag_stand(p_betrieb text, p_ids uuid[])
  returns table (material_id uuid, name text, einheit text, artikelnummer text,
                 mindestmenge numeric, sollbestand numeric, verpackungseinheit numeric,
                 frei numeric, zulauf numeric, grund text, menge numeric)
  language sql
  stable
  security definer
  set search_path = ''
as $$
  with heute as (
    select (now() at time zone 'Europe/Vienna')::date as d
  ),
  kandidaten as (
    select m.id
      from public.materials m
     where m.company_id = p_betrieb
       and m.lagerartikel
       and m.mindestmenge is not null
       and (p_ids is null or m.id = any (p_ids))
    union
    select p.material_id
      from public.einsatz_material_positionen p
      join public.einsatz_material e on e.id = p.einsatz_material_id
     cross join heute h
     where e.company_id = p_betrieb
       and p.material_id is not null
       and e.date >= h.d
       and not coalesce((e.geladen -> p.id) ? 'gebucht', false)
       and (p_ids is null or p.material_id = any (p_ids))
    union
    select o.material_id
      from public.material_orders o
     where o.company_id = p_betrieb
       and o.material_id is not null
       and o.transaction_type = 'order'
       and not o.processed
       and o.lagerort_id is null
       and (o.beschaffung = 'lager'
            or (o.beschaffung = 'einkauf' and o.geliefert_am is not null)
            or (o.beschaffung is null and o.status = 'Abholbereit'))
       and (p_ids is null or o.material_id = any (p_ids))
  ),
  rechnung as (
    select m.id, m.name, m.unit, m.article_number, m.mindestmenge, m.sollbestand, m.verpackungseinheit,
           app.deckung_frei_vor(p_betrieb, m.id, h.d - 1, null, null, h.d) as frei,
           coalesce((select sum(k.menge) from public.einkauf_posten k
                      where k.company_id = p_betrieb and k.material_id = m.id and k.geliefert_am is null), 0) as zulauf
      from kandidaten c
      join public.materials m on m.id = c.id and m.company_id = p_betrieb
     cross join heute h
  ),
  bewertet as (
    select r.*,
           case when r.frei + r.zulauf < 0 then 'fehlmenge'
                when r.mindestmenge is not null and r.frei + r.zulauf < r.mindestmenge then 'mindestmenge'
           end as grund,
           greatest(coalesce(r.sollbestand, r.mindestmenge, 0), 0) - (r.frei + r.zulauf) as roh
      from rechnung r
  )
  select b.id, b.name, b.unit, b.article_number, b.mindestmenge, b.sollbestand, b.verpackungseinheit,
         b.frei, b.zulauf, b.grund, app.bestellmenge(b.roh, b.verpackungseinheit, b.unit)
    from bewertet b
   where b.grund is not null
     and b.roh > 0
$$;

revoke all on function app.bestellvorschlag_stand(text, uuid[]) from public, anon, authenticated;

/*
  DIE VORSCHLÄGE, je Großhändler geordnet — ohne Preis: der Großhändler
  kommt aus derselben Regel wie der Vorschlag der Einkaufsliste, den Grund
  mit Preis sieht nur, wer Einkaufspreise sieht (`lieferant_vorschlag_grund`).
*/
create or replace function public.bestellvorschlaege()
  returns jsonb
  language plpgsql
  stable
  security definer
  set search_path = ''
as $$
declare
  betrieb text := app.lesebetrieb();
begin
  if betrieb is null or not (app.hat_rolle(array['Verwaltung']) or app.ist_fuehrung()) then
    raise exception 'Bestellvorschläge sehen Verwaltung und Leitung' using errcode = '42501';
  end if;
  if not app.modul_aktiv(betrieb, 'material.bestellvorschlaege') then
    raise exception 'Bestellvorschläge sind in diesem Betrieb ausgeschaltet (Einstellungen → Module)' using errcode = '55000';
  end if;
  return coalesce((
    select jsonb_agg(jsonb_build_object(
             'material', s.material_id, 'name', s.name, 'einheit', s.einheit, 'artikelnummer', s.artikelnummer,
             'mindestmenge', s.mindestmenge, 'sollbestand', s.sollbestand,
             'verpackungseinheit', s.verpackungseinheit,
             'frei', s.frei, 'zulauf', s.zulauf, 'grund', s.grund, 'menge', s.menge,
             'lieferant', w.supplier_id, 'lieferant_name', l.name)
           order by l.name nulls last, s.name, s.material_id)
      from app.bestellvorschlag_stand(betrieb, null) s
      left join lateral (select x.supplier_id from app.lieferant_vorschlag_wahl(betrieb, s.material_id) x limit 1) w on true
      left join public.suppliers l on l.id = w.supplier_id and l.company_id = betrieb
  ), '[]'::jsonb);
end;
$$;

revoke all on function public.bestellvorschlaege() from public, anon;
grant execute on function public.bestellvorschlaege() to authenticated;

/*
  ÜBERNEHMEN — Schreibbefehl nach dem Vertrag (M04a):
    { vorgang, aktion: 'bestellvorschlaege',
      posten: [ { artikel, menge, lieferant, erwartet: { menge } } ] }
  `menge` ist, was bestellt werden soll (der Vorschlag oder von Hand
  geändert), `erwartet.menge` der Vorschlag, den die Ansicht zeigte.

  Gesperrt werden die Artikel in fester Reihenfolge; danach wird je Artikel
  neu gerechnet. Ist nichts mehr vorzuschlagen (inzwischen von jemand
  anderem übernommen, geliefert, Liste geändert), wird der Posten
  übersprungen; lautet der Vorschlag anders als gezeigt, ist er veraltet und
  wird ebenfalls nicht angelegt — die Ansicht lädt neu, und entschieden wird
  über den jetzigen Stand. Angelegt wird mit derselben Rolle wie die Regel
  `einkauf_posten_anlegen`; die Auslöser der Tabelle (Betrieb, Menge je
  Einheit, Einheit) gelten wie bei jedem Posten.
*/
create or replace function public.bestellvorschlaege_uebernehmen(p_befehl jsonb)
  returns jsonb
  language plpgsql
  security definer
  set search_path = ''
as $$
declare
  betrieb text := app.lesebetrieb();
  vorgang uuid;
  frueher jsonb;
  z jsonb;
  ids uuid[];
  anzahl integer;
  artikel public.materials;
  stand record;
  menge numeric;
  erwartet numeric;
  lieferant uuid;
  fehler text;
  neu uuid;
  wer text := (select u.name from public.users u where u.id = auth.uid());
  angelegt jsonb := '[]'::jsonb;
  uebersprungen jsonb := '[]'::jsonb;
  veraltet jsonb := '[]'::jsonb;
begin
  if betrieb is null or not (app.hat_rolle(array['Verwaltung']) or app.ist_fuehrung()) then
    raise exception 'Bestellvorschläge übernehmen Verwaltung und Leitung' using errcode = '42501';
  end if;
  vorgang := app.befehl_vorgang(p_befehl);
  if p_befehl ->> 'aktion' is distinct from 'bestellvorschlaege' then
    raise exception 'Unbekannte Aktion — erwartet „bestellvorschlaege“' using errcode = '22023';
  end if;
  if jsonb_typeof(p_befehl -> 'posten') is distinct from 'array' or jsonb_array_length(p_befehl -> 'posten') = 0 then
    raise exception 'Keine Vorschläge gewählt' using errcode = '22023';
  end if;
  if jsonb_array_length(p_befehl -> 'posten') > 500 then
    raise exception 'Höchstens 500 Vorschläge auf einmal' using errcode = '22023';
  end if;
  begin
    select array_agg(distinct (x.value ->> 'artikel')::uuid), count(*)
      into ids, anzahl
      from jsonb_array_elements(p_befehl -> 'posten') as x;
  exception when invalid_text_representation then
    raise exception 'Der Befehl ist nicht vollständig: Artikel und Menge je Vorschlag' using errcode = '22023';
  end;
  if array_position(ids, null) is not null or cardinality(ids) <> anzahl then
    raise exception 'Jeder Artikel genau einmal, jeder mit Kennung' using errcode = '22023';
  end if;

  -- Wiederholung?
  frueher := app.befehl_beginnen(betrieb, vorgang, 'bestellvorschlaege', p_befehl);
  if frueher is not null then
    return frueher;
  end if;
  -- V3 nach der Wiederholung, wie bei `umlagern`: ein ausgeführter Vorgang liefert sein Ergebnis.
  if not app.modul_aktiv(betrieb, 'material.bestellvorschlaege') then
    raise exception 'Bestellvorschläge sind in diesem Betrieb ausgeschaltet (Einstellungen → Module)'
      using errcode = '55000';
  end if;

  -- Sperren in fester Reihenfolge: zwei gleichzeitige Übernahmen legen denselben Artikel nicht zweimal an.
  perform 1 from public.materials m
   where m.id = any (ids) and m.company_id = betrieb
   order by m.id
   for no key update;

  for z in
    select x.value from jsonb_array_elements(p_befehl -> 'posten') as x order by x.value ->> 'artikel'
  loop
    select * into artikel from public.materials m
     where m.id = (z ->> 'artikel')::uuid and m.company_id = betrieb;
    if artikel.id is null then
      raise exception 'Diesen Artikel gibt es nicht' using errcode = 'P0002';
    end if;
    begin
      menge := (z ->> 'menge')::numeric;
      erwartet := (z #>> '{erwartet,menge}')::numeric;
      lieferant := nullif(z ->> 'lieferant', '')::uuid;
    exception when invalid_text_representation or numeric_value_out_of_range then
      raise exception 'Der Befehl ist nicht vollständig: Artikel und Menge je Vorschlag' using errcode = '22023';
    end;
    fehler := app.menge_fehler(menge, artikel.unit);
    if fehler is not null then
      raise exception '%: %', artikel.name, fehler using errcode = '23514';
    end if;

    select * into stand from app.bestellvorschlag_stand(betrieb, array[artikel.id]) s
     where s.material_id = artikel.id;
    if stand.material_id is null then
      uebersprungen := uebersprungen || jsonb_build_object('artikel', artikel.id, 'name', artikel.name);
      continue;
    end if;
    if erwartet is not null and erwartet is distinct from stand.menge then
      veraltet := veraltet || jsonb_build_object('artikel', artikel.id, 'name', artikel.name, 'menge', stand.menge);
      continue;
    end if;

    insert into public.einkauf_posten (company_id, supplier_id, material_id, material_name, menge, einheit,
                                       angelegt_von_uid, angelegt_von_name)
    values (betrieb, lieferant, artikel.id, artikel.name, menge, artikel.unit, auth.uid(), wer)
    returning id into neu;
    angelegt := angelegt || jsonb_build_object('artikel', artikel.id, 'posten', neu, 'menge', menge, 'lieferant', lieferant);
  end loop;

  return app.befehl_abschliessen(betrieb, vorgang, jsonb_build_object(
    'ergebnis', 'ausgefuehrt', 'vorgang', vorgang,
    'angelegt', angelegt, 'uebersprungen', uebersprungen, 'veraltet', veraltet));
end;
$$;

revoke all on function public.bestellvorschlaege_uebernehmen(jsonb) from public, anon;
grant execute on function public.bestellvorschlaege_uebernehmen(jsonb) to authenticated;
