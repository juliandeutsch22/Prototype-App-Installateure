-- TESTBERICHT 30.09.2026, H1 — DIE STUNDENZAHL KOMMT AUS DEN UHRZEITEN.
--
-- Als Monteur liess sich über die Schnittstelle eine Buchung 08:00–09:00 mit
-- `hours = 12` speichern. Gerechnet hat damit niemand: Zeitkonto, Lohn-CSV,
-- Schein und Rechnung zählen aus Von, Bis und Pause (`app.arbeitsminuten`,
-- `calcWorkMin`). `hours` zählt nur dort, wo KEINE Uhrzeiten stehen — und
-- genau dort nahm die Datenbank jede Zahl an: ein Eintrag „Anwesend“ ohne
-- Uhrzeit mit `hours = 12` zählte voll.
--
-- Die App schreibt `hours` nirgends selbst (die Spracherfassung, für die das
-- Feld gedacht war, gibt es nicht mehr). Deshalb, entschieden am 30.09.2026:
--
--   MIT UHRZEITEN rechnet die Datenbank `hours` selbst — aus Von, Bis, Pause,
--     Tag und Mitternachtsregel, dieselbe Rechnung wie die Monatssicht. Was
--     der Client schickt, wird überschrieben. Bei „Krank“, „Urlaub“ und
--     „Zeitausgleich“ zählen die Uhrzeiten nicht als Arbeitszeit; dort steht
--     keine Stundenzahl.
--   OHNE UHRZEITEN nimmt sie bei „Anwesend“ keine Stundenzahl an. Bei den
--     anderen Status zählt sie ohnehin nicht (`arbeitsminuten` gibt 0) und
--     wird ebenfalls nicht angenommen.
--
-- NUR WENN SICH ETWAS ÄNDERT, WAS ZÄHLT. Beim Anlegen immer; beim Ändern nur,
-- wenn Von, Bis, Pause, Tag, Status oder die Stundenzahl selbst angefasst
-- werden. Sonst bleibt der gespeicherte Wert — bei einer verrechneten Buchung
-- (die sich nicht mehr ändern darf, `app.verrechnet_bleibt_verrechnet`)
-- darf ein Kommentar nicht an einer neu gerechneten Stundenzahl scheitern.
--
-- Der Dienstschlüssel (Rücklauf aus der Sicherung) bleibt aussen vor: was
-- zurückgespielt wird, ist, wie es war.
--
-- Die Reihenfolge der Auslöser: `time_entries_stunden_aus_zeiten` läuft vor
-- `time_entries_verrechnet_fest` (Postgres nimmt sie nach dem Namen). Der
-- Wächter der verrechneten Buchung sieht also schon die gerechnete Zahl.

create or replace function app.stunden_aus_zeiten() returns trigger
  language plpgsql
  set search_path = ''
as $$
declare
  spanne boolean := new.start_time is not null and new.end_time is not null;
begin
  if app.ist_dienst() then
    return new;
  end if;

  if tg_op = 'UPDATE'
     and new.start_time is not distinct from old.start_time
     and new.end_time is not distinct from old.end_time
     and new.break_duration is not distinct from old.break_duration
     and new.date is not distinct from old.date
     and new.status is not distinct from old.status
     and new.hours is not distinct from old.hours then
    return new;
  end if;

  if spanne then
    if new.status = 'Anwesend' then
      new.hours := round(app.arbeitsminuten(new.status, new.start_time, new.end_time,
                                            new.break_duration, null, new.date) / 60.0, 2);
    else
      new.hours := null;
    end if;
    return new;
  end if;

  if new.hours is not null then
    raise exception 'Eine Stundenzahl ohne Uhrzeiten nimmt die Zeiterfassung nicht an — bitte Von und Bis eintragen'
      using errcode = '23514';
  end if;
  return new;
end;
$$;

drop trigger if exists time_entries_stunden_aus_zeiten on public.time_entries;
create trigger time_entries_stunden_aus_zeiten
  before insert or update on public.time_entries
  for each row execute function app.stunden_aus_zeiten();

/*
  BESTAND: Wo eine Stundenzahl neben Uhrzeiten steht und nicht zu ihnen
  passt, wird sie berichtigt. Gezählt hat sie nie (die Uhrzeiten gingen vor);
  sie steht nur falsch da. Eine leere Stundenzahl bleibt leer — sie sagt
  nichts Falsches.

  Unter dem Dienstschlüssel, damit der Wächter der verrechneten Buchungen die
  Berichtigung eines abgeleiteten Werts nicht als Änderung der Buchung liest.
*/
select set_config('request.jwt.claims', '{"role":"service_role"}', true);

update public.time_entries t
   set hours = case
         when t.status = 'Anwesend'
           then round(app.arbeitsminuten(t.status, t.start_time, t.end_time,
                                         t.break_duration, null, t.date) / 60.0, 2)
         else null
       end
 where t.start_time is not null
   and t.end_time is not null
   and t.hours is not null
   and t.hours is distinct from case
         when t.status = 'Anwesend'
           then round(app.arbeitsminuten(t.status, t.start_time, t.end_time,
                                         t.break_duration, null, t.date) / 60.0, 2)
         else null
       end;

select set_config('request.jwt.claims', '', true);
