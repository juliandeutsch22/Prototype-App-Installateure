-- Standardangaben werden ausgeblendet, niemals aus alten Buchungen entfernt.
alter table public.companies add column zeit_standardfelder jsonb not null default '{}'::jsonb;
alter table public.companies add constraint zeit_standardfelder_objekt check (jsonb_typeof(zeit_standardfelder) = 'object');
create or replace function app.standardzeitfelder_pruefen() returns trigger
  language plpgsql security definer set search_path = '' as $$
declare k text; v jsonb;
begin
  if new.zeit_standardfelder is not distinct from old.zeit_standardfelder then return new; end if;
  if (select auth.role()) <> 'service_role' and not (app.betriebsmitglied(new.id) and app.hat_rolle(array['Geschäftsführung','Administrator'])) then
    raise exception 'Die Zeitfelder legt die Geschäftsführung oder Administration fest' using errcode = '42501';
  end if;
  for k,v in select * from jsonb_each(new.zeit_standardfelder) loop
    if k not in ('projectNumber','travelTime','vehiclePlate','helperName','isHelper','isEmergency','comment') or jsonb_typeof(v) <> 'boolean' then
      raise exception 'Unbekanntes Standard-Zeitfeld oder ungültige Einstellung' using errcode = '22023';
    end if;
  end loop;
  return new;
end $$;
revoke all on function app.standardzeitfelder_pruefen() from public, anon, authenticated;
create trigger companies_standardzeitfelder before update on public.companies for each row execute function app.standardzeitfelder_pruefen();
