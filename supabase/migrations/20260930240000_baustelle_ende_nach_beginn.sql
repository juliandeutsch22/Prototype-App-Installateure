-- TESTBERICHT 30.09.2026, M13 — KEIN ENDE VOR DEM BEGINN.
--
-- Eine Baustelle mit Ende 01.10. vor Beginn 05.10. wurde angenommen und so
-- auch dem Monteur angezeigt. Die Maske prüft das jetzt; hier steht die
-- Regel, die für jeden Weg gilt (Anlegen, Akte, Angebot annehmen, Import).
--
-- NUR BEI EINER ÄNDERUNG der beiden Daten: ein Bestand mit vertauschten
-- Daten bleibt lesbar und lässt sich weiter bearbeiten (Status, Team,
-- Notizen), bis jemand ein Datum anfasst — dann muss es passen. Keine
-- Zeile wird hier umgeschrieben.
--
-- Ende am selben Tag wie der Beginn ist erlaubt: eine Eintagesbaustelle.

create or replace function app.baustelle_ende_nach_beginn() returns trigger
  language plpgsql
  set search_path = ''
as $$
begin
  if tg_op = 'UPDATE'
     and new.start_date is not distinct from old.start_date
     and new.end_date is not distinct from old.end_date then
    return new;
  end if;
  if new.start_date is not null and new.end_date is not null and new.end_date < new.start_date then
    raise exception 'Das Ende (%) liegt vor dem Beginn (%) — bitte die Daten prüfen.',
      to_char(new.end_date, 'DD.MM.YYYY'), to_char(new.start_date, 'DD.MM.YYYY')
      using errcode = '22023';
  end if;
  return new;
end;
$$;

revoke all on function app.baustelle_ende_nach_beginn() from public, anon, authenticated;

drop trigger if exists projects_ende_nach_beginn on public.projects;
create trigger projects_ende_nach_beginn
  before insert or update of start_date, end_date on public.projects
  for each row execute function app.baustelle_ende_nach_beginn();
