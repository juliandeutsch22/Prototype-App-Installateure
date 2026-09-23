-- PUSH-MELDUNGEN FÜR ABWESENHEITEN: Antrag, Entscheidung, Krankmeldung.
--
-- Derselbe Weg wie bei den Materialanforderungen: der Trigger erkennt das
-- EREIGNIS, die Edge Function `push-melden` entscheidet mit
-- `shared/notifyLogic.ts`, wer es bekommt. Der Anstoss reisst den
-- Schreibvorgang nie mit (`app.push_anstossen`).
--
--   neuer Antrag (Urlaub/ZA)   → wer über Urlaub entscheidet
--   Entscheidung               → der Antragsteller
--   Krankmeldung               → das Büro (Buchhaltung, GF, Admin)
--
-- Ein Betriebsurlaub meldet nichts: niemand hat ihn beantragt, und zwanzig
-- „Urlaub genehmigt" auf einmal wären Lärm.

alter table public.user_prefs
  add column if not exists notify_abwesenheit boolean not null default true;

comment on column public.user_prefs.notify_abwesenheit is
  'Push bei Urlaubs-/ZA-Anträgen, Entscheidungen darüber und Krankmeldungen.';

create or replace function app.push_bei_abwesenheit() returns trigger
  language plpgsql
  security definer
  set search_path = ''
as $$
begin
  if tg_table_name = 'krankmeldungen' then
    perform app.push_anstossen(jsonb_build_object(
      'quelle', 'abwesenheit', 'art', 'krank', 'zeile', to_jsonb(new)));
    return null;
  end if;

  if new.betriebsurlaub_id is not null then return null; end if;

  if tg_op = 'INSERT' then
    if new.status = 'Beantragt' then
      perform app.push_anstossen(jsonb_build_object(
        'quelle', 'abwesenheit', 'art', 'antrag', 'zeile', to_jsonb(new)));
    end if;
  elsif new.status is distinct from old.status
        and new.status in ('Genehmigt', 'Abgelehnt', 'Storniert')
        -- Wer seinen eigenen Antrag zurücknimmt, braucht keine Meldung
        -- darüber.
        and new.entschieden_von_uid is distinct from new.user_id then
    perform app.push_anstossen(jsonb_build_object(
      'quelle', 'abwesenheit', 'art', 'entschieden', 'zeile', to_jsonb(new)));
  end if;
  return null;
end;
$$;

drop trigger if exists vacations_push on public.vacations;
create trigger vacations_push
  after insert or update on public.vacations
  for each row execute function app.push_bei_abwesenheit();

drop trigger if exists krankmeldungen_push on public.krankmeldungen;
create trigger krankmeldungen_push
  after insert on public.krankmeldungen
  for each row execute function app.push_bei_abwesenheit();

/*
  WER IN FRAGE KOMMT — für die Edge Function, die mit dem Dienstschlüssel
  läuft. `entscheidet` folgt Wort für Wort `app.darf_urlaub_entscheiden`,
  nur für einen beliebigen Menschen statt für den Angemeldeten: GF und
  Administration immer; ohne festgelegte Genehmigende das ganze Büro; sonst
  die Festgelegten.
*/
create or replace function public.push_empfaenger_abwesenheit(p_betrieb text)
  returns jsonb
  language sql
  stable
  security definer
  set search_path = ''
as $$
  select jsonb_build_object('belegschaft', coalesce(jsonb_agg(jsonb_build_object(
    'uid', u.id,
    'role', u.role,
    'active', u.active,
    'entscheidet',
      u.role in ('Geschäftsführung', 'Administrator')
      or (coalesce(array_length(c.vacation_approvers, 1), 0) = 0
          and u.role in ('Buchhaltung', 'Geschäftsführung', 'Administrator'))
      or u.id = any(c.vacation_approvers),
    'buero', u.role in ('Buchhaltung', 'Geschäftsführung', 'Administrator'))), '[]'::jsonb))
    from public.users u
    join public.companies c on c.id = u.company_id
   where u.company_id = p_betrieb
$$;

revoke all on function public.push_empfaenger_abwesenheit(text) from public, anon, authenticated;
grant execute on function public.push_empfaenger_abwesenheit(text) to service_role;
