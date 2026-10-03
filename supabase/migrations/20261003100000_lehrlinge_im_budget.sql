-- LEHRLINGSSTUNDEN IM PROJEKT-BUDGET — je Person (Entscheidung 03.10.2026).
--
-- Bisher zählte im Budget einer Baustelle jede Stunde ohne Helfer-Kennzeichen
-- als Fachzeit, auch die eines Lehrlings. Ob sie dorthin gehört, hängt an der
-- Leistung des einzelnen Lehrlings, nicht am Lehrjahr — deshalb ein Schalter
-- an der Person, ab Werk an (wie bisher).
--
-- DIE BUCHUNG MERKT SICH DEN STAND VOM TAG, wie den Satz. Ein späteres
-- Umschalten gilt für neue Buchungen; die Budgets alter Baustellen ändern
-- sich dadurch nicht. Anders als beim Satz zieht deshalb nichts nach.

alter table public.users
  add column if not exists stunden_ins_budget boolean not null default true;

comment on column public.users.stunden_ins_budget is
  'Nur beim Lehrling: zählen seine Stunden ins Projekt-Budget? Gilt für Buchungen ab dem Umschalten.';

alter table public.time_entries
  add column if not exists ins_budget boolean;

comment on column public.time_entries.ins_budget is
  'Stand von users.stunden_ins_budget beim Anlegen, nur beim Lehrling. Leer heisst: zählt (wie bisher).';

/*
  Derselbe Auslöser wie für den Satz — eine Stelle, die festhält, wie eine
  Buchung zählt. Gesetzt wird `ins_budget` beim Anlegen und wenn die Buchung
  die Person wechselt; sonst bleibt der Wert, auch beim Nachziehen des Satzes
  nach einer Umstufung. Der Rücklauf (Dienstschlüssel) bringt seinen Wert mit.
*/
create or replace function app.satz_setzen() returns trigger
  language plpgsql
  security definer
  set search_path = ''
as $$
begin
  if tg_op = 'UPDATE' and old.is_billed then
    new.satz := old.satz;
    new.ins_budget := old.ins_budget;
    return new;
  end if;

  if tg_op = 'INSERT' or new.user_id is distinct from old.user_id then
    if not (app.ist_dienst() and tg_op = 'INSERT' and new.ins_budget is not null) then
      new.ins_budget := (
        select case when u.einstufung = 'lehrling' then u.stunden_ins_budget end
          from public.users u
         where u.id = new.user_id);
    end if;
  else
    new.ins_budget := old.ins_budget;
  end if;

  if app.ist_dienst() and new.satz is not null
     and (tg_op = 'INSERT' or new.satz is distinct from old.satz) then
    return new;
  end if;
  new.satz := app.satzklasse_am(new.user_id, new.date);
  return new;
end;
$$;

revoke all on function app.satz_setzen() from public, anon, authenticated;
