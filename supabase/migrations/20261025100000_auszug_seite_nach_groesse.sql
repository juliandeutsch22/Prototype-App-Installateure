-- DIE SICHERUNG ÜBER 256 MB (N1, 24.10.2026).
--
-- Mit 288 MB Bestand im lokalen Stapel durchgespielt, scheiterte die
-- Ausleitung zweimal:
--
-- 1. SPEICHER. `auszug_snapshot_seite` gab immer 500 Zeilen, gleich wie groß;
--    500 unterschriebene Scheine sind 70 MB in einer Antwort. Die Function
--    hielt sie geparst, die Teile als Text und den gefügten Text zugleich —
--    „memory limit reached“ bei 256 MB.
-- 2. RECHENZEIT. Jede Zeile wurde in der Function geparst und wieder zu Text
--    gemacht. Das kostet je MB Rechenzeit, und eine Function hat davon zwei
--    Sekunden — bei rund 200 MB war Schluss („CPU time hard limit“).
--
-- Jetzt schreibt die Datenbank die Zeilen selbst als zeilenweises JSON, in
-- Seiten zu rund 1 MB, und die Function reicht die Bytes nur weiter. 1 MB,
-- damit ein Teil (8 MB) sich mit ganzen Seiten fast füllt. Die
-- Seiten stehen beim Anlegen der Arbeitskopie fest (eine Zeile, die allein
-- größer ist, bildet ihre eigene Seite); die Größe jeder Zeile wird dabei
-- einmal gemessen, und am Ende vergleicht die Function die Summe.

alter table app.auszug_arbeitsstand
  add column if not exists bytes integer,
  add column if not exists seite integer;
create index if not exists auszug_arbeitsstand_seite on app.auszug_arbeitsstand(lauf, seite);

-- PostgREST gibt einen Wert dieses Typs unverändert mit diesem Medientyp aus,
-- statt ihn in JSON zu verpacken (Medientyp-Behandlung über eine Domäne).
do $$
begin
  if not exists (select 1 from pg_type t join pg_namespace n on n.oid = t.typnamespace
                 where n.nspname = 'public' and t.typname = 'application/x-ndjson') then
    create domain public."application/x-ndjson" as text;
  end if;
end $$;

-- Die Reihenfolge der Zeilen ist die der Ausgabe (Firma zuerst) — als Nummer
-- gesetzt statt der Zählung überlassen, damit Seiten und Nummern sicher
-- zusammenpassen.
create or replace function public.auszug_snapshot_start(p_betrieb text) returns uuid
language plpgsql security definer set search_path = '' as $$
declare kennung uuid := gen_random_uuid();
begin
  insert into app.auszug_arbeitsstand(lauf, betrieb, nr, inhalt, bytes, seite)
    overriding system value
    select kennung, p_betrieb, q.o, q.z, q.b,
           ((sum(q.b) over (order by q.o) - q.b) / (1024 * 1024))::integer + 1
      from (select t.z, t.o, octet_length(t.z::text) + 1 as b
              from app.auszug_snapshot_zeilen(p_betrieb) with ordinality as t(z, o)) q
      order by q.o;
  return kennung;
end; $$;

-- Wie viel die Arbeitskopie ist: Seiten, Zeilen und Bytes. Die Function prüft
-- damit, dass sie alles bekommen hat — eine verworfene Kopie hat 0 Zeilen.
create or replace function public.auszug_snapshot_umfang(p_lauf uuid) returns jsonb
language sql stable security definer set search_path = '' as $$
  select jsonb_build_object(
    'seiten', coalesce(max(a.seite), 0),
    'zeilen', count(*),
    'bytes', coalesce(sum(a.bytes), 0))
  from app.auszug_arbeitsstand a where a.lauf = p_lauf;
$$;

-- Eine Seite als zeilenweises JSON, jede Zeile mit Zeilenende; leer, wenn es
-- die Seite nicht (mehr) gibt.
create or replace function public.auszug_snapshot_ndjson(p_lauf uuid, p_seite integer)
returns public."application/x-ndjson"
language sql stable security definer set search_path = '' as $$
  select string_agg(a.inhalt::text || E'\n', '' order by a.nr)
  from app.auszug_arbeitsstand a where a.lauf = p_lauf and a.seite = p_seite;
$$;

-- `auszug_snapshot_seite` bleibt unverändert: die Migrationen gehen vor den
-- Functions hinaus, und eine Ausleitung, die in dieser Zeit noch mit der
-- vorigen Function läuft, liest damit weiter.

revoke all on function public.auszug_snapshot_start(text), public.auszug_snapshot_umfang(uuid),
  public.auszug_snapshot_ndjson(uuid, integer) from public, anon, authenticated;
grant execute on function public.auszug_snapshot_start(text), public.auszug_snapshot_umfang(uuid),
  public.auszug_snapshot_ndjson(uuid, integer) to service_role;
