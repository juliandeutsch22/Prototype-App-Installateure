-- „PROBLEM MELDEN" GEHT AN DEN SUPPORT — immer, und nur dorthin.
--
-- Bisher lasen Geschäftsführung und Administration die Meldungen, der
-- Support nur mit Häkchen. Rückmeldung aus dem Betrieb (25.09.2026): die
-- Geschäftsführung kann mit „Beim Speichern kam eine Fehlermeldung" nichts
-- anfangen — beheben kann es nur, wer die App baut. Also geht jede Meldung
-- an den Support, und der Betrieb liest das Protokoll nicht mehr: darin
-- stehen Stapel und Gerätekennungen, und was ein Monteur dem Support
-- schreibt, ist nicht für den Chef bestimmt.

/*
  DAS HÄKCHEN SETZT JETZT DIE DATENBANK, für jede neue Meldung. Die Spalte
  bleibt, weil ältere Meldungen unter der Zusage geschrieben wurden, dass der
  Support sie ohne Häkchen nicht sieht — dabei bleibt es, bis sie nach 90
  Tagen verschwinden.
*/
create or replace function app.fehlerprotokoll_eingang() returns trigger
  language plpgsql
  security definer
  set search_path = ''
as $$
begin
  if app.ist_dienst() then
    return new;
  end if;
  new.user_id := auth.uid();
  new.created_at := now();
  new.an_support := new.art = 'meldung';
  if (select count(*) from public.fehlerprotokoll f
       where f.user_id = new.user_id
         and f.created_at > now() - interval '1 hour') >= 30 then
    return null;
  end if;
  return new;
end;
$$;

-- Der Betrieb liest nicht mehr mit. Schreiben darf weiter jeder im Betrieb.
drop policy if exists fehlerprotokoll_lesen on public.fehlerprotokoll;
revoke select on public.fehlerprotokoll from authenticated;

/*
  ÄLTERE MELDUNGEN MIT HÄKCHEN BLEIBEN OHNE NAMEN. Sie wurden unter der
  Zusage geschickt, dass die Plattform niemanden persönlich sieht. Ab jetzt
  steht der Name dabei — ohne Kennung schriebe der Support ins Leere.
*/
update public.fehlerprotokoll set user_id = null where art = 'meldung' and an_support;

/*
  DER SUPPORT SIEHT BEI EINER MELDUNG, WER SIE GESCHRIEBEN HAT — Name und
  E-Mail-Adresse, damit er nachfragen kann. Der Dialog sagt das, bevor
  jemand sendet. Bei Abstürzen bleibt es wie bisher: Technik ohne Person.
*/
drop function if exists public.fehlerprotokoll_plattform(integer);
create function public.fehlerprotokoll_plattform(p_tage integer default 14)
  returns table (
    id uuid, company_id text, betrieb text, art text, nachricht text, stapel text,
    pfad text, fassung text, geraet text, beschreibung text, created_at timestamptz,
    melder text, melder_email text)
  language sql
  stable
  security definer
  set search_path = ''
as $$
  select f.id, f.company_id, c.name, f.art, f.nachricht, f.stapel,
         f.pfad, f.fassung, f.geraet, f.beschreibung, f.created_at,
         case when f.art = 'meldung' then u.name end,
         case when f.art = 'meldung' then u.email end
    from public.fehlerprotokoll f
    join public.companies c on c.id = f.company_id
    left join public.users u on u.id = f.user_id
   where app.ist_plattform()
     and (f.art <> 'meldung' or f.an_support)
     and f.created_at > now() - make_interval(days => least(greatest(coalesce(p_tage, 14), 1), 90))
   order by f.created_at desc
   limit 500
$$;

revoke all on function public.fehlerprotokoll_plattform(integer) from public, anon;
grant execute on function public.fehlerprotokoll_plattform(integer) to authenticated;
