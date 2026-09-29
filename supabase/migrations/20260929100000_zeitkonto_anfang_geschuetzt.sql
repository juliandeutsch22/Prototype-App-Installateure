/*
  DIE ANFANGSSTÄNDE DER ZEITKONTEN SIEHT, WER DAS KONTO SIEHT (offene Punkte
  B1, Teil 2; Prüflauf P3-12).

  `users.initial_overtime` und `users.initial_vacation_days` — mit wie vielen
  Überstunden und Urlaubstagen jemand angefangen hat — standen an der Zeile,
  die jeder im Betrieb liest: die Namen der Kollegen braucht jeder, für die
  Auswahl im Einsatzplan, auf dem Schein, im Wochenplan. Mit den Namen kamen
  die Kontostände.

  JETZT IN `zeitkonto_anfang`, gelesen von denselben, die die Urlaube der
  Person lesen (`vacations_lesen`): die Person selbst, die Führung, Buchhaltung
  und Spitze, wer Urlaub entscheidet — und ein Supportzugang, der den Betrieb
  ansieht, wie bisher. Geschrieben wie bisher von der Spitze.

  DIE ALTEN SPALTEN BLEIBEN ALS EINLASS, wie bei Kostensätzen und
  Einkaufspreisen (`20260929090000_einkauf_und_kosten_geschuetzt.sql`).

  JE SPALTE EIN AUSLÖSER, und das ist Absicht. „Kein Anfangsurlaub" ist ein
  ausdrückliches `null`; ein gemeinsamer Auslöser könnte es nicht von „nicht
  mitgeschickt" unterscheiden. `before update of <spalte>` feuert nur, wenn
  genau diese Spalte geschrieben wird.

  DAS ECHO BEIM ANLEGEN. `createUserDoc` legt mit `upsert` an. Trifft das auf
  eine bestehende Zeile, feuert erst der Auslöser beim Einfügen — er legt
  um und leert —, dann die beim Ändern, mit den schon geleerten Werten aus
  `excluded`. Ein transaktionslokaler Merker sagt ihnen, dass das ihr eigenes
  Echo ist.
*/

create table public.zeitkonto_anfang (
  id                    uuid primary key default gen_random_uuid(),
  company_id            text not null references public.companies (id),
  -- Erst beim Abschluss geprüft: der Einlass schreibt hierher, bevor die
  -- Zeile in `users` steht.
  user_id               uuid not null unique references public.users (id)
                          on delete cascade deferrable initially deferred,
  initial_overtime      numeric(8,2),
  initial_vacation_days numeric(5,2),
  updated_at            timestamptz not null default now()
);

create index zeitkonto_anfang_betrieb on public.zeitkonto_anfang (company_id);

alter table public.zeitkonto_anfang enable row level security;

create policy zeitkonto_anfang_lesen on public.zeitkonto_anfang
  for select using (
    (app.betriebsmitglied(company_id)
      and (user_id = auth.uid() or app.ist_fuehrung() or app.ist_buch_oder_spitze()
           or app.darf_urlaub_entscheiden(company_id)))
    or app.support_liest(company_id));
create policy zeitkonto_anfang_schreiben on public.zeitkonto_anfang
  for all using (app.darf(company_id) and app.ist_spitze())
  with check (app.darf(company_id) and app.ist_spitze());

revoke all on public.zeitkonto_anfang from anon;

create trigger zeitkonto_anfang_updated_at before update on public.zeitkonto_anfang
  for each row execute function app.updated_at_setzen();
create trigger zeitkonto_anfang_betrieb_fest before update on public.zeitkonto_anfang
  for each row execute function app.betrieb_unveraenderlich();
create trigger zeitkonto_anfang_kein_support_schreiben
  before insert or update or delete on public.zeitkonto_anfang
  for each row execute function app.support_schreibt_nicht();

insert into public.zeitkonto_anfang (company_id, user_id, initial_overtime, initial_vacation_days)
select company_id, id, initial_overtime, initial_vacation_days
  from public.users
 where initial_overtime is not null or initial_vacation_days is not null;

update public.users
   set initial_overtime = null, initial_vacation_days = null
 where initial_overtime is not null or initial_vacation_days is not null;

-- ---------------------------------------------------------------------------
-- Der Einlass
-- ---------------------------------------------------------------------------

create or replace function app.zeitkonto_einlass_anlegen() returns trigger
  language plpgsql
  set search_path = ''
as $$
begin
  if new.initial_overtime is not null or new.initial_vacation_days is not null then
    insert into public.zeitkonto_anfang (company_id, user_id, initial_overtime, initial_vacation_days)
    values (new.company_id, new.id, new.initial_overtime, new.initial_vacation_days)
    on conflict (user_id) do update
      set initial_overtime = excluded.initial_overtime,
          initial_vacation_days = excluded.initial_vacation_days;
  end if;
  new.initial_overtime := null;
  new.initial_vacation_days := null;
  -- Für die Auslöser beim Ändern: was jetzt noch kommt, ist das Echo.
  perform set_config('senklot.zeitkonto_eingelassen', new.id::text, true);
  return new;
end;
$$;

create or replace function app.zeitkonto_einlass_ueberstunden() returns trigger
  language plpgsql
  set search_path = ''
as $$
begin
  -- Das Echo trägt immer leere Werte; ein gesetzter Wert ist nie eines.
  if new.initial_overtime is not null
     or current_setting('senklot.zeitkonto_eingelassen', true) is distinct from new.id::text then
    insert into public.zeitkonto_anfang (company_id, user_id, initial_overtime)
    values (new.company_id, new.id, new.initial_overtime)
    on conflict (user_id) do update set initial_overtime = excluded.initial_overtime;
  end if;
  new.initial_overtime := null;
  return new;
end;
$$;

create or replace function app.zeitkonto_einlass_urlaub() returns trigger
  language plpgsql
  set search_path = ''
as $$
begin
  -- Das Echo trägt immer leere Werte; ein gesetzter Wert ist nie eines.
  if new.initial_vacation_days is not null
     or current_setting('senklot.zeitkonto_eingelassen', true) is distinct from new.id::text then
    insert into public.zeitkonto_anfang (company_id, user_id, initial_vacation_days)
    values (new.company_id, new.id, new.initial_vacation_days)
    on conflict (user_id) do update set initial_vacation_days = excluded.initial_vacation_days;
  end if;
  new.initial_vacation_days := null;
  return new;
end;
$$;

revoke all on function app.zeitkonto_einlass_anlegen() from public, anon, authenticated;
revoke all on function app.zeitkonto_einlass_ueberstunden() from public, anon, authenticated;
revoke all on function app.zeitkonto_einlass_urlaub() from public, anon, authenticated;

create trigger users_zeitkonto_einlass
  before insert on public.users
  for each row execute function app.zeitkonto_einlass_anlegen();
create trigger users_zeitkonto_einlass_ueberstunden
  before update of initial_overtime on public.users
  for each row execute function app.zeitkonto_einlass_ueberstunden();
create trigger users_zeitkonto_einlass_urlaub
  before update of initial_vacation_days on public.users
  for each row execute function app.zeitkonto_einlass_urlaub();

comment on column public.users.initial_overtime is
  'Nur noch Einlass (seit 29.09.2026): Geschriebenes landet in zeitkonto_anfang, die Spalte bleibt leer.';
comment on column public.users.initial_vacation_days is
  'Nur noch Einlass (seit 29.09.2026): Geschriebenes landet in zeitkonto_anfang, die Spalte bleibt leer.';
