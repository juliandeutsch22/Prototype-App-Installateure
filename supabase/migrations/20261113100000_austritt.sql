-- AUSTRITTSDATUM (E87, Paket 6, Befund D12 aus der Durchsicht vom 09.11.2026).
--
-- Bis hierher kannte die App keinen Austritt. Ein deaktiviertes Konto stand
-- im Monat seiner Buchungen ohne Soll, Saldo und Resturlaub da, weil das
-- Soll eines Teilmonats ohne den letzten Tag falsch gewesen wäre — und eine
-- falsche Zahl in der Lohnverrechnung ist schlimmer als eine leere. Jetzt:
--
--   1. `users.austritt`: der letzte Arbeitstag im Betrieb. Er liegt nie vor
--      dem Eintritt oder dem Saldo-Start.
--   2. Nach dem Austritt lässt sich nicht buchen und nicht einplanen — wie
--      vor dem Eintritt (M7). Der Dienstschlüssel (Rücklauf) ist ausgenommen.
--   3. Der Wochenplan zeigt die Tage danach als abwesend („Ausgetreten“ für
--      die Leitung); so überspringt auch „mehrere Tage“ (E85) sie.
--
-- Das Soll endet in der App am Austritt (`pflichtTage`); gerechnet wird dort,
-- nicht hier. Die Spalte steht in der Datenauskunft, weil `person_auskunft`
-- die ganze Zeile der Person ausgibt, und fällt mit ihr bei der Löschung.

alter table public.users add column if not exists austritt date;

alter table public.users drop constraint if exists users_austritt_nach_eintritt;
alter table public.users add constraint users_austritt_nach_eintritt
  check (austritt is null
         or ((eintritt is null or austritt >= eintritt)
             and (app_start_date is null or austritt >= app_start_date)));

/*
  KEINE BUCHUNG UND KEIN EINSATZ NACH DEM AUSTRITT. Geprüft beim Anlegen und
  wenn sich Tag oder Person ändern — eine alte Zeile bleibt änderbar, solange
  ihr Tag bleibt (wie beim Eintritt). Wird der Austritt nachträglich vor
  bestehende Buchungen gelegt, bleiben sie stehen: sie zu löschen wäre
  Datenverlust; die Übersicht zählt sie als Ist und nennt sie.
*/
create or replace function app.nicht_nach_austritt() returns trigger
  language plpgsql
  security definer
  set search_path = ''
as $$
declare
  bis date;
  tag date;
begin
  if app.ist_dienst() then
    return new;
  end if;
  if tg_op = 'UPDATE' and new.date is not distinct from old.date
     and new.user_id is not distinct from old.user_id then
    return new;
  end if;
  select u.austritt into bis from public.users u where u.id = new.user_id;
  tag := new.date;
  if bis is not null and tag > bis then
    raise exception '%', case tg_table_name
        when 'assignments' then 'Nach dem Austritt am ' || to_char(bis, 'DD.MM.YYYY') || ' lässt sich nicht einplanen'
        else 'Nach dem Austritt am ' || to_char(bis, 'DD.MM.YYYY') || ' lässt sich nicht buchen' end
      using errcode = '23514';
  end if;
  return new;
end;
$$;

revoke all on function app.nicht_nach_austritt() from public, anon, authenticated;

drop trigger if exists time_entries_nicht_nach_austritt on public.time_entries;
create trigger time_entries_nicht_nach_austritt
  before insert or update on public.time_entries
  for each row execute function app.nicht_nach_austritt();

drop trigger if exists assignments_nicht_nach_austritt on public.assignments;
create trigger assignments_nicht_nach_austritt
  before insert or update on public.assignments
  for each row execute function app.nicht_nach_austritt();

/*
  DER WOCHENPLAN KENNT DEN AUSTRITT. Unverändert bis auf den letzten Teil:
  die Tage nach dem Austritt stehen wie eine ganztägige Abwesenheit da.
*/
create or replace function public.wochenplan_abwesend(p_von date, p_bis date)
  returns table (user_id uuid, von date, bis date, grund text, zeiten text)
  language sql stable
  security definer
  set search_path = ''
as $$
  with erlaubt as (
    select exists (
             select 1 from public.companies c
              where c.id = app.betrieb()
                and (c.wochenplan_fuer_alle or app.ist_fuehrung() or app.ist_buch_oder_spitze()))
           and app.betriebsmitglied(app.betrieb()) as ok,
           (app.ist_fuehrung() or app.ist_buch_oder_spitze()) as leitung,
           app.ist_buch_oder_spitze() as buero
  ),
  frei as (
    select f.*,
           least(f.bis, coalesce((select v.von - 1 from public.vacations v
                                   where v.id = f.ueber_urlaub_id and v.status = 'Genehmigt'), f.bis)) as frei_bis
      from public.freistellungen f
     where f.company_id = app.betrieb()
       and (f.status = 'Bestätigt' or (f.status = 'Beantragt' and f.anlass = 'arztbesuch'))
  )
  select v.user_id, greatest(v.von, p_von), least(v.bis, p_bis),
         case when e.leitung then
           case when v.art = 'Zeitausgleich' then 'ZA' else 'Urlaub' end
         end,
         case when v.za_von is not null then
           to_char(v.za_von, 'HH24:MI') || '–' || to_char(v.za_bis, 'HH24:MI')
         end
    from public.vacations v, erlaubt e
   where e.ok
     and v.company_id = app.betrieb()
     and v.status = 'Genehmigt'
     and v.bis >= p_von and v.von <= p_bis
     and p_bis >= p_von and p_bis - p_von <= 62
  union all
  select k.user_id, greatest(k.von, p_von), least(k.bis, p_bis),
         case when e.buero then 'Krank' end,
         null::text
    from public.krankmeldungen k, erlaubt e
   where e.ok
     and k.company_id = app.betrieb()
     and k.bis >= p_von and k.von <= p_bis
     and p_bis >= p_von and p_bis - p_von <= 62
  union all
  -- Berufsschule (4.1): je Tag, wie sie gebucht ist. Die Leitung sieht den
  -- Grund, alle anderen „abwesend" — wie beim Urlaub.
  select t.user_id, t.date, t.date,
         case when e.leitung then 'Berufsschule' end,
         null::text
    from public.time_entries t, erlaubt e
   where e.ok
     and t.company_id = app.betrieb()
     and t.status = 'Berufsschule'
     and t.date between p_von and p_bis
     and p_bis >= p_von and p_bis - p_von <= 62
  union all
  select f.user_id, greatest(f.von, p_von), least(f.frei_bis, p_bis),
         case when f.anlass = 'arztbesuch' then
                case when e.buero then 'Arztbesuch' end
              when e.leitung then
                case f.art when 'dienstverhinderung' then 'Sonderurlaub'
                           when 'pflegefreistellung' then 'Pflegefreistellung'
                           else 'Unbezahlt' end
         end,
         case when f.zeit_von is not null then
           to_char(f.zeit_von, 'HH24:MI') || '–' || to_char(f.zeit_bis, 'HH24:MI')
         end
    from frei f, erlaubt e
   where e.ok
     and f.frei_bis >= p_von and f.von <= p_bis
     and f.frei_bis >= f.von
     and p_bis >= p_von and p_bis - p_von <= 62
  union all
  -- Nach dem Austritt (E87): jeder Tag danach, mit dem Grund für die Leitung.
  select u.id, greatest(u.austritt + 1, p_von), p_bis,
         case when e.leitung then 'Ausgetreten' end,
         null::text
    from public.users u, erlaubt e
   where e.ok
     and u.company_id = app.betrieb()
     and u.austritt is not null
     and u.austritt < p_bis
     and p_bis >= p_von and p_bis - p_von <= 62
$$;

revoke all on function public.wochenplan_abwesend(date, date) from public, anon;
grant execute on function public.wochenplan_abwesend(date, date) to authenticated;
