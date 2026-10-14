-- Der Export darf eine inzwischen verworfene Arbeitskopie nicht abschließen.
create or replace function public.auszug_snapshot_anzahl(p_lauf uuid) returns bigint
language sql stable security definer set search_path = '' as $$
  select count(*) from app.auszug_arbeitsstand where lauf = p_lauf;
$$;
revoke all on function public.auszug_snapshot_anzahl(uuid) from public, anon, authenticated;
grant execute on function public.auszug_snapshot_anzahl(uuid) to service_role;

-- Die Arbeitskopie ist keine weitere Datenquelle für eine Personenauskunft:
-- sie enthält die ganzen Betriebe. Angezeigt werden nur Existenz und Frist.
create or replace function app.auszug_ausgenommen(p_tabelle text) returns text[]
language sql immutable security definer set search_path = '' as $$
  select case p_tabelle
    when 'user_prefs' then array['push_tokens']
    when 'kalender_abos' then array['schluessel_hash']
    when 'auszug_arbeitsstand' then array['inhalt']
    else '{}'::text[] end;
$$;
revoke all on function app.auszug_ausgenommen(text) from public, anon, authenticated;

-- Beide bestehenden, umfangreichen Datenschutzfunktionen behalten ihre Rechte,
-- Auswahl und Aufbewahrungsregeln. Die gezielten Ergänzungen sind wiederholbar;
-- ein unerwarteter Ausgangsstand bricht die Migration ab statt still zu kürzen.
do $migration$
declare quelle text; marke text;
begin
  quelle := pg_get_functiondef('public.person_auskunft(text,uuid,integer)'::regprocedure);
  if position('sicherung_arbeitskopien' in quelle) = 0 then
    marke := '  ergebnis := ergebnis || jsonb_build_object(';
    if position(marke in quelle) = 0 then raise exception 'Personenauskunft: Einfügestelle fehlt'; end if;
    quelle := replace(quelle, marke, $eintrag$
  if exists(select 1 from app.auszug_arbeitsstand a where a.betrieb = (select app.betrieb())
      and a.inhalt->>'sammlung' = case when p_art = 'mitarbeiter' then 'users' else 'customers' end
      and a.inhalt->'daten'->>'id' = p_id::text) then
    ergebnis := jsonb_set(ergebnis, '{daten,sicherung_arbeitskopien}', (
      select jsonb_agg(z.daten) from (
        select distinct jsonb_build_object('angelegt_am', a.erstellt,
          'spaetestens_geloescht_am', a.erstellt + interval '25 hours') as daten
        from app.auszug_arbeitsstand a where a.betrieb = (select app.betrieb())
          and a.inhalt->>'sammlung' = case when p_art = 'mitarbeiter' then 'users' else 'customers' end
          and a.inhalt->'daten'->>'id' = p_id::text
      ) z
    ));
  end if;
$eintrag$ || marke);
    execute quelle;
  end if;
  quelle := pg_get_functiondef('public.person_loeschen(text,uuid,boolean)'::regprocedure);
  if position('app.auszug_arbeitsstand' in quelle) = 0 then
    marke := 'if not p_nur_pruefen then';
    if position(marke in quelle) = 0 then raise exception 'Personenlöschung: Einfügestelle fehlt'; end if;
    execute replace(quelle, marke, marke || E'\n      delete from app.auszug_arbeitsstand a where a.betrieb = (select app.betrieb());');
  end if;
end;
$migration$;
