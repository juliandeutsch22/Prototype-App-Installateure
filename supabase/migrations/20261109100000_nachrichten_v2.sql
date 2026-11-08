/*
  NACHRICHTEN, ZWEITE FASSUNG (08.11.2026, E65) — zwei Änderungen an der
  Datenbank zum Nachrichten-Umbau, nichts wird gelöscht oder umgeschrieben:

  1. DIREKTNACHRICHTEN AB WERK AN. Der Auftraggeber hat D1 („ab Werk aus“)
     am 08.11.2026 zurückgenommen: ausgeschaltet zeigte „Neue Nachricht“
     keine Personen, und es sah nach einem Fehler aus. Das Register sagt
     jetzt `standard true`; ein Betrieb, der sie ausdrücklich ausgeschaltet
     hat (`modules` mit `false`), bleibt dabei — gespeichert wird nur die
     Abweichung vom Standard. Liste wie in `20261108800000_nachrichten.sql`,
     `tests/supabase/modulRegisterServer.test.ts` vergleicht sie mit
     `src/lib/module.ts`.

  2. DER REITER „UNGELESEN“ im Posteingang: `p_art = 'ungelesen'` liefert
     die Gespräche mit eigener ungelesener Zahl, seitenweise wie die
     anderen Reiter — auf dem Server gefiltert, damit beim Nachladen keine
     Seite fehlt. Sonst ist die Funktion unverändert.
*/

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
    ('kunden.liegenschaften', false, '{}'::text[]),
    ('zeiterfassung', true, '{}'::text[]),
    ('zeiterfassung.freie_zeitfelder', true, '{}'::text[]),
    ('zeiterfassung.timer', false, '{}'::text[]),
    ('zeiterfassung.timer_erinnerung', true, '{zeiterfassung.timer}'::text[]),
    ('zeiterfassung.korrekturantraege', false, '{}'::text[]),
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
    ('zeitkonten', true, '{}'::text[]),
    ('nachrichten', true, '{}'::text[]),
    ('nachrichten.direktnachrichten', true, '{}'::text[])
$$;

revoke all on function app.modul_register() from public, anon, authenticated;

create or replace function public.nachrichten_postfach(
  p_art text default null,
  p_suche text default null,
  p_vor timestamptz default null,
  p_vor_id uuid default null,
  p_anzahl integer default 30
) returns table (
  kanal uuid, art text, titel text, project_id uuid, zuletzt timestamptz,
  letzte_text text, letzte_von text, letzte_eigene boolean, ungelesen integer, stumm boolean, geschlossen boolean
)
  language plpgsql
  stable
  security definer
  set search_path = ''
as $$
#variable_conflict use_column
declare
  ich public.users := app.darf_nachrichten();
  muster text := case when nullif(btrim(coalesce(p_suche, '')), '') is null then null
                      else '%' || replace(replace(replace(btrim(p_suche), '\', '\\'), '%', '\%'), '_', '\_') || '%' end;
begin
  if p_art is not null and p_art not in ('privat', 'baustelle', 'ungelesen') then
    raise exception 'Unbekannte Auswahl: %', p_art using errcode = '22023';
  end if;
  return query
  with meine as (
    select k.*, t.ungelesen as t_ungelesen, t.stumm as t_stumm, t.sichtbar_ab as t_ab,
           coalesce(k.letzte_nachricht_am, k.angelegt_am) as sortiert
      from public.nachrichten_teilnehmer t
      join public.nachrichten_kanaele k on k.id = t.kanal_id
     where t.user_id = ich.id and t.company_id = ich.company_id and t.verlassen_am is null
       and (k.letzte_nachricht_am is not null or k.angelegt_von = ich.id)
       and (p_art is null or (p_art = 'ungelesen' and t.ungelesen > 0) or (p_art in ('privat', 'baustelle') and (p_art = 'privat') = k.privat))
       and (k.privat or app.nachrichten_baustelle_lesbar(k.project_id, ich.id))
  ), gefiltert as (
    select m.*, app.nachrichten_titel(m.id, ich.id) as m_titel
      from meine m
     where p_vor is null or (m.sortiert, m.id) < (p_vor, p_vor_id)
  )
  select g.id, g.art, g.m_titel, g.project_id, g.sortiert,
         l.zeile, l.von, l.eigen, g.t_ungelesen, g.t_stumm,
         (g.art = 'direkt' and exists (select 1 from public.nachrichten_teilnehmer t2 join public.users u on u.id = t2.user_id
                                        where t2.kanal_id = g.id and t2.user_id <> ich.id and not u.active))
    from gefiltert g
    left join lateral (
      select case when n.geloescht_am is not null then 'Nachricht gelöscht'
                  when n.text is null then 'Anhang'
                  else left(split_part(n.text, E'\n', 1), 120) end as zeile,
             case when n.von_uid = ich.id then 'Du' else n.von_name end as von,
             n.von_uid is not distinct from ich.id as eigen
        from public.nachrichten n
       where n.kanal_id = g.id and n.gesendet_am >= g.t_ab
       order by n.gesendet_am desc, n.id desc limit 1) l on true
   where muster is null
      or g.m_titel ilike muster
      or exists (select 1 from public.nachrichten n
                  where n.kanal_id = g.id and n.gesendet_am >= g.t_ab and n.text ilike muster)
   order by g.sortiert desc, g.id desc
   limit greatest(1, least(coalesce(p_anzahl, 30), 100));
end;
$$;

revoke all on function public.nachrichten_postfach(text, text, timestamptz, uuid, integer) from public, anon;
grant execute on function public.nachrichten_postfach(text, text, timestamptz, uuid, integer) to authenticated;
