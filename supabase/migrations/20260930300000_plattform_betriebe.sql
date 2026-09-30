-- TESTBERICHT 30.09.2026, M43 — DIE LISTE DER BETRIEBE FÜR DEN GLOBALEN
-- ADMINISTRATOR, OHNE EINBLICK IN INHALTE.
--
-- Für den Notzugang musste man die Kennung auswendig kennen. Die Liste nennt
-- je Betrieb nur, was es für Anlage, Notzugang und eine Wiederherstellung
-- braucht: Name, Kennung, Anlagedatum, wie viele aktive Leitungskonten
-- (Administration, Geschäftsführung) es gibt, wie viele davon eine E-Mail
-- haben, und ob gerade ein Notzugang offen ist. Keine Namen, keine Zahlen
-- aus dem Betrieb.
--
-- Nur für die Plattform (`app.ist_plattform()` fragt Anspruch UND Tabelle).
-- Mit den Rechten des Eigentümers, weil das Plattformkonto sonst keine Zeile
-- eines Betriebs lesen darf — und genau so bleibt es auch für alles andere.

create or replace function public.plattform_betriebe()
  returns table (
    kennung text,
    name text,
    angelegt_am timestamptz,
    leitungskonten integer,
    leitung_mit_mail integer,
    notzugang_bis timestamptz
  )
  language plpgsql
  stable
  security definer
  set search_path = ''
as $$
begin
  if not app.ist_plattform() then
    raise exception 'Die Liste der Betriebe sieht nur die Plattform' using errcode = '42501';
  end if;
  return query
    select
      c.id,
      c.name,
      coalesce(b.angelegt_am, c.created_at),
      (select count(*)::integer from public.users u
        where u.company_id = c.id and u.active
          and u.role in ('Administrator', 'Geschäftsführung')),
      (select count(*)::integer from public.users u
        where u.company_id = c.id and u.active
          and u.role in ('Administrator', 'Geschäftsführung')
          and lower(u.email) not like '%@benutzer.senklot.invalid'),
      (select max(f.gilt_bis) from public.support_freigaben f
        where f.company_id = c.id and f.notzugang
          and f.widerrufen_am is null and f.gilt_bis > now())
    from public.companies c
    left join public.betriebsanlagen b on b.betrieb_kennung = c.id
    order by lower(c.name);
end;
$$;

revoke all on function public.plattform_betriebe() from public, anon;
grant execute on function public.plattform_betriebe() to authenticated;
