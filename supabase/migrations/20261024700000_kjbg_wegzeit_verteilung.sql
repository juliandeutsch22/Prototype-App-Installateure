-- ---------------------------------------------------------------------------
-- Jugendschutz: Wegzeit Schule–Betrieb und Lage der kürzeren Tage
-- (A9 der Durchsicht vom 24.10.2026)
--
-- 1. § 11 Abs 7 KJBG rechnet am Berufsschultag die Wegzeit zwischen Schule
--    und Betrieb zur Tagesgrenze. Senklot kannte sie nicht. Jetzt kann sie
--    beim Eintragen der Berufsschule angegeben werden, je Schultag in
--    Minuten; leer bleibt alles wie bisher.
--
-- 2. Neun Stunden am Tag erlaubt § 11 Abs 2 KJBG nur, wenn die kürzeren Tage
--    an der Wochenfreizeit liegen — oder der Kollektivvertrag eine andere
--    Verteilung zulässt (Abs 3). Ob der KV das tut, weiß nur der Betrieb:
--    eine Einstellung je Betrieb, ab Werk aus.
-- ---------------------------------------------------------------------------

alter table public.time_entries add column if not exists wegzeit_min integer;
alter table public.time_entries drop constraint if exists time_entries_wegzeit;
-- Bis 4 Std.: ein Weg, der länger ist, ist ein Tippfehler, keine Wegzeit.
alter table public.time_entries add constraint time_entries_wegzeit
  check (wegzeit_min is null or (status = 'Berufsschule' and wegzeit_min between 1 and 240));

comment on column public.time_entries.wegzeit_min is
  'Wegzeit zwischen Berufsschule und Betrieb am Schultag in Minuten — zählt in der Prüfung der Tagesgrenze für Jugendliche mit (§ 11 Abs 7 KJBG, A9). Nicht in der Woche, nicht im Zeitkonto.';

alter table public.companies
  add column if not exists kjbg_verteilung_kv boolean not null default false;

comment on column public.companies.kjbg_verteilung_kv is
  'Der Kollektivvertrag lässt für Jugendliche eine andere Verteilung der Wochenarbeitszeit zu (§ 11 Abs 3 KJBG): 9 Std. am Tag gleich wo die kürzeren Tage liegen. Aus: die kürzeren Tage müssen an der Wochenfreizeit liegen (Abs 2).';

/*
  Rumpf wie in 20261006300000_jugendschutz.sql, dazu `p_wegzeit_min`. Die
  Fassung mit fünf Werten fällt weg: zwei Fassungen nebeneinander machten den
  Aufruf mit benannten Werten mehrdeutig. Eine ältere App ruft ohne den
  neuen Wert — dann bleibt die Wegzeit leer.
*/
drop function if exists public.berufsschule_eintragen(uuid, date, date, text, integer);

create or replace function public.berufsschule_eintragen(
  p_user uuid,
  p_von date,
  p_bis date,
  p_notiz text default null,
  p_unterricht_min integer default null,
  p_wegzeit_min integer default null
) returns jsonb
  language plpgsql
  security definer
  set search_path = ''
as $$
declare
  betrieb text := app.betrieb();
  wer uuid := auth.uid();
  person public.users;
  tage date[];
  angelegt integer := 0;
  grenze date := (now() at time zone 'Europe/Vienna')::date - 14;
begin
  if betrieb is null or wer is null or not app.angemeldet()
     or not app.betriebsmitglied(betrieb) then
    raise exception 'Keine Anmeldung' using errcode = '42501';
  end if;
  if p_von is null or p_bis is null then
    raise exception 'Beginn und Ende angeben' using errcode = '22023';
  end if;
  if p_bis < p_von then
    raise exception 'Das Ende liegt vor dem Beginn' using errcode = '22023';
  end if;
  if p_unterricht_min is not null and (p_unterricht_min < 1 or p_unterricht_min > 720) then
    raise exception 'Die Unterrichtszeit liegt zwischen einer Minute und 12 Stunden' using errcode = '22023';
  end if;
  if p_wegzeit_min is not null and (p_wegzeit_min < 1 or p_wegzeit_min > 240) then
    raise exception 'Die Wegzeit liegt zwischen einer Minute und 4 Stunden' using errcode = '22023';
  end if;

  select * into person from public.users
   where id = coalesce(p_user, wer) and company_id = betrieb;
  if person.id is null then
    raise exception 'Diesen Mitarbeiter gibt es nicht' using errcode = 'P0002';
  end if;
  if person.id <> wer and not app.ist_buch_oder_spitze() then
    raise exception 'Berufsschule für jemand anderen trägt das Büro ein'
      using errcode = '42501';
  end if;
  if person.einstufung is distinct from 'lehrling' then
    raise exception 'Berufsschule gibt es nur bei Lehrlingen — die Einstufung steht in der Benutzerakte'
      using errcode = '22023';
  end if;
  if not app.ist_buch_oder_spitze() and p_von < grenze then
    raise exception 'Selbst eintragen geht bis 14 Tage zurück (ab %). Was davor liegt, trägt das Büro ein.',
      to_char(grenze, 'DD.MM.YYYY')
      using errcode = '42501';
  end if;

  tage := app.urlaubstage(person.work_days, p_von, p_bis);
  if coalesce(array_length(tage, 1), 0) = 0 then
    raise exception 'Im Zeitraum liegt kein Arbeitstag' using errcode = '55000';
  end if;
  if array_length(tage, 1) > 120 then
    raise exception 'Der Zeitraum ist zu lang' using errcode = '22023';
  end if;

  insert into public.time_entries (
    id, company_id, user_id, date, status, break_duration, user_name, comment, unterricht_min, wegzeit_min)
  select gen_random_uuid(), betrieb, person.id, t, 'Berufsschule', 0, person.name,
         coalesce(nullif(btrim(coalesce(p_notiz, '')), ''), 'Berufsschule'),
         p_unterricht_min, p_wegzeit_min
    from unnest(tage) t
   where not exists (
     select 1 from public.time_entries e
      where e.company_id = betrieb and e.user_id = person.id and e.date = t);
  get diagnostics angelegt = row_count;

  return jsonb_build_object(
    'tage', array_length(tage, 1),
    'angelegt', angelegt,
    'uebersprungen', array_length(tage, 1) - angelegt);
end;
$$;

revoke all on function public.berufsschule_eintragen(uuid, date, date, text, integer, integer) from public, anon;
grant execute on function public.berufsschule_eintragen(uuid, date, date, text, integer, integer) to authenticated;
