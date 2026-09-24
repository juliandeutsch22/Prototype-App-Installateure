-- KRANK GIBT ES NUR NOCH ÜBER DIE KRANKMELDUNG.
--
-- Bis hierher gab es zwei Wege: die Krankmeldung (Seite Urlaub) und „Krank"
-- direkt in der Zeiterfassung. Der zweite stand im Zeitkonto richtig, fehlte
-- aber im Wochenplan und in der Liste der Krankenstände — das Büro sah einen
-- Krankenstand nicht, den der Monteur ordentlich gebucht hatte.
--
-- Jetzt legt auch die Zeiterfassung eine Krankmeldung an (die Ansicht ruft
-- dafür `krankmeldung_speichern`). Die Datenbank sorgt dafür, dass es dabei
-- bleibt:
--   - einen Krank-Tag schreibt nur die Krankmeldung;
--   - einen Tag, der zu einer Krankmeldung gehört, ändert oder löscht nur die
--     Krankmeldung („Ende ändern", „Löschen") — sonst räumte ein späteres
--     Löschen der Meldung einen Tag weg, der inzwischen etwas anderes ist.
--
-- Bestehende Krank-Tage ohne Meldung werden zu Meldungen zusammengefasst.

-- ---------------------------------------------------------------------------
-- Übernahme des Altbestands
-- ---------------------------------------------------------------------------

/*
  WAS SCHON IN EINER MELDUNG LIEGT, GEHÖRT DORTHIN. Eine Krankmeldung
  überspringt Tage, an denen schon etwas steht — auch einen von Hand
  gebuchten Krank-Tag. Der bekommt jetzt den Bezug zu ihr, statt daneben
  eine zweite, überlappende Meldung zu erzeugen.

  Der Rest wird zu Meldungen über ZUSAMMENHÄNGENDE KALENDERTAGE: Freitag und
  der folgende Montag werden zwei Meldungen. Das ist die vorsichtige Lesart —
  ob das Wochenende dazwischen krank war, weiss niemand mehr.

  Ohne Push: das sind alte Krankenstände, keine neuen.
*/
update public.time_entries e
   set krankmeldung_id = k.id
  from public.krankmeldungen k
 where e.status = 'Krank'
   and e.krankmeldung_id is null
   and k.company_id = e.company_id
   and k.user_id = e.user_id
   and e.date between k.von and k.bis;

alter table public.krankmeldungen disable trigger krankmeldungen_push;

do $$
declare
  insel record;
  kennung uuid;
begin
  for insel in
    select company_id, user_id, min(user_name) as user_name,
           min(date) as von, max(date) as bis, array_agg(id) as eintraege
      from (
        select e.id, e.company_id, e.user_id, e.date,
               coalesce(u.name, e.user_name, 'Unbekannt') as user_name,
               -- Aufeinanderfolgende Tage ergeben dieselbe Zahl; ein doppelter
               -- Tag zählt dank dense_rank nicht als Lücke.
               e.date - (dense_rank() over (
                 partition by e.company_id, e.user_id order by e.date))::integer as gruppe
          from public.time_entries e
          left join public.users u on u.id = e.user_id
         where e.status = 'Krank' and e.krankmeldung_id is null
      ) krank
     group by company_id, user_id, gruppe
  loop
    insert into public.krankmeldungen (
      company_id, user_id, user_name, von, bis, gemeldet_von_name)
    values (insel.company_id, insel.user_id, insel.user_name, insel.von, insel.bis,
            'Übernahme aus der Zeiterfassung')
    returning id into kennung;
    update public.time_entries set krankmeldung_id = kennung where id = any(insel.eintraege);
  end loop;
end;
$$;

alter table public.krankmeldungen enable trigger krankmeldungen_push;

-- ---------------------------------------------------------------------------
-- Der Wächter
-- ---------------------------------------------------------------------------

/*
  GEMEINT IST NUR DIE APP. Die Krankmeldungs-Funktionen laufen mit den
  Rechten ihres Eigentümers (`security definer`), der Rücklauf aus der
  Sicherung mit dem Dienstschlüssel — beide dürfen Krank-Tage schreiben und
  wegräumen. Direkt aus dem Browser (`authenticated`) geht es nicht mehr.

  Deshalb `current_user` und nicht die Rolle aus dem Anmeldetoken: in einer
  Krankmeldungs-Funktion steht im Token weiterhin „authenticated", und genau
  dort soll geschrieben werden.
*/
create or replace function app.krank_nur_ueber_meldung() returns trigger
  language plpgsql
  set search_path = ''
as $$
begin
  if current_user <> 'authenticated' then
    return coalesce(new, old);
  end if;
  if tg_op in ('UPDATE', 'DELETE') and old.krankmeldung_id is not null then
    raise exception 'Dieser Tag gehört zu einer Krankmeldung — bitte dort das Ende ändern oder die Meldung löschen (Seite Urlaub)'
      using errcode = '42501';
  end if;
  if tg_op in ('INSERT', 'UPDATE')
     and (new.status = 'Krank' or new.krankmeldung_id is not null) then
    raise exception 'Krank wird über eine Krankmeldung erfasst'
      using errcode = '42501';
  end if;
  return coalesce(new, old);
end;
$$;

drop trigger if exists time_entries_krank_nur_ueber_meldung on public.time_entries;
create trigger time_entries_krank_nur_ueber_meldung
  before insert or update or delete on public.time_entries
  for each row execute function app.krank_nur_ueber_meldung();
