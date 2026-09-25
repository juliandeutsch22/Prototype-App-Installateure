-- DIE AUSLEITUNG BLÄTTERT IN EINER FESTEN ORDNUNG.
--
-- Aus dem Prüflauf vom 25.09.2026 (P3-16): `daten-ausleitung` las jede
-- Tabelle seitenweise über `Range`, aber ohne `order`. Ohne Sortierung darf
-- Postgres die Zeilen bei jeder Abfrage anders reihen — dann fehlt im
-- nächtlichen Stand eine Zeile, und eine andere steht zweimal darin. Beides
-- fällt erst beim Wiederanlauf auf.
--
-- Die Ordnung ist der Primärschlüssel. Er ist nicht überall `id` (die
-- Nummernkreise etwa hängen an Betrieb, Art und Jahr), deshalb fragt die
-- Function hier nach, statt ihn zu raten — dieselbe Idee wie
-- `app.auszug_tabellen`: die Liste pflegt sich selbst.

create or replace function public.auszug_schluessel() returns jsonb
  language sql stable
  set search_path = ''
as $$
  select coalesce(jsonb_object_agg(t.tabelle, t.spalten), '{}'::jsonb)
    from (
      select c.relname::text as tabelle,
             jsonb_agg(a.attname::text order by k.ordnung) as spalten
        from pg_index i
        join pg_class c on c.oid = i.indrelid
        join pg_namespace n on n.oid = c.relnamespace
        cross join lateral unnest(i.indkey::int2[]) with ordinality as k(attnum, ordnung)
        join pg_attribute a on a.attrelid = c.oid and a.attnum = k.attnum
       where i.indisprimary
         and n.nspname = 'public'
         and c.relname = any(app.auszug_tabellen())
       group by c.relname
    ) t
$$;

revoke all on function public.auszug_schluessel() from public, anon, authenticated;
grant execute on function public.auszug_schluessel() to service_role;
