-- ===========================================================================
-- TESTBETRIEB NUR OHNE ECHTE DATEN (Testbericht Runde 3, H1)
-- ===========================================================================
--
-- Ein Testbetrieb lässt sich ohne Export und ohne Frist löschen. Bisher
-- konnte die Plattform JEDEN Betrieb nachträglich so kennzeichnen — auch den
-- Pilotbetrieb mit Rechnungen. Deaktivieren, kennzeichnen, planen, löschen
-- dauerte im Test keine zwei Minuten: die Löschstufe war damit umgangen.
--
-- JETZT:
--   - Beim Anlegen bleibt die Kennzeichnung frei (`betrieb_als_testbetrieb`,
--     unverändert).
--   - Nachträglich nur, solange der Betrieb keine Rechnung, keinen
--     unterschriebenen Schein und keine Zeitbuchung hat. Geprüft hier, nicht
--     in der Oberfläche: das Plattformkonto ruft die Funktion auch direkt.
--   - „Kein Testbetrieb“ geht jederzeit. Ist dann schon eine Löschung
--     geplant, wird sie abgebrochen: sie wurde ohne Export und mit der Frist
--     eines Testbetriebs geplant, und beides gilt für einen echten Betrieb
--     nicht.
--   - Eine geplante Löschung behält ihren Zeitpunkt. Eine spätere
--     Kennzeichnung verkürzt ihn nicht — er steht als fester Zeitpunkt in
--     `loeschung_geplant_fuer` und wird hier nicht angefasst.

/*
  Was einen Betrieb zum echten macht. Jede Rechnung zählt (es gibt keine
  Entwürfe, eine Rechnung entsteht mit Nummer), ein Schein ab der
  Unterschrift (auch storniert: er war unterschrieben), jede Zeitbuchung.
  Rückgabe: der erste gefundene Grund, sonst null.
*/
create or replace function app.betrieb_echte_daten(p_kennung text) returns text
  language sql stable
  security definer
  set search_path = ''
as $$
  select case
    when exists (select 1 from public.invoices i where i.company_id = p_kennung)
      then 'er hat Rechnungen'
    when exists (select 1 from public.work_sheets w
                  where w.company_id = p_kennung and w.status in ('Unterschrieben', 'Storniert'))
      then 'er hat unterschriebene Scheine'
    when exists (select 1 from public.time_entries t where t.company_id = p_kennung)
      then 'er hat Zeitbuchungen'
  end
$$;

revoke all on function app.betrieb_echte_daten(text) from public, anon, authenticated;

create or replace function public.plattform_testbetrieb(p_kennung text, p_testbetrieb boolean, p_grund text)
  returns void
  language plpgsql
  security definer
  set search_path = ''
as $$
declare
  g text;
  z public.betrieb_zustand;
  neu boolean := coalesce(p_testbetrieb, false);
  grund_echt text;
  abgebrochen boolean := false;
begin
  perform app.plattform_pflicht();
  g := app.grund_pflicht(p_grund);
  z := app.zustand_zeile(p_kennung);

  if neu and not z.testbetrieb then
    grund_echt := app.betrieb_echte_daten(p_kennung);
    if grund_echt is not null then
      raise exception 'Als Testbetrieb lässt sich nur ein Betrieb ohne echte Daten kennzeichnen — %', grund_echt
        using errcode = '22023';
    end if;
  end if;

  if not neu and z.testbetrieb and z.loeschung_geplant_fuer is not null then
    update public.betrieb_zustand
       set loeschung_geplant_fuer = null, loeschung_grund = null
     where betrieb_kennung = p_kennung;
    insert into public.betrieb_protokoll (betrieb_kennung, aktion, grund, von)
    values (p_kennung, 'loeschung_abgebrochen',
            'Kein Testbetrieb mehr — die Löschung war als Testbetrieb geplant', auth.uid());
    abgebrochen := true;
  end if;

  update public.betrieb_zustand set testbetrieb = neu
   where betrieb_kennung = p_kennung;
  insert into public.betrieb_protokoll (betrieb_kennung, aktion, grund, von, angaben)
  values (p_kennung, 'testbetrieb', g, auth.uid(),
          jsonb_build_object('testbetrieb', neu, 'loeschung_abgebrochen', abgebrochen));
end;
$$;

revoke all on function public.plattform_testbetrieb(text, boolean, text) from public, anon;
grant execute on function public.plattform_testbetrieb(text, boolean, text) to authenticated;

/*
  DIE LISTE DER PLATTFORM nennt jetzt, ob sich ein Betrieb noch als
  Testbetrieb kennzeichnen liesse — damit die Seite den Knopf gar nicht erst
  anbietet. Rumpf wie in 20261002100000, eine Spalte hinten dran; die
  Rückgabe ändert sich, deshalb neu angelegt.
*/
drop function if exists public.plattform_betriebe();
create function public.plattform_betriebe()
  returns table (
    kennung text,
    name text,
    angelegt_am timestamptz,
    leitungskonten integer,
    leitung_mit_mail integer,
    notzugang_bis timestamptz,
    testbetrieb boolean,
    deaktiviert_am timestamptz,
    deaktiviert_grund text,
    export_am timestamptz,
    loeschung_geplant_fuer timestamptz,
    echte_daten text
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
          and f.widerrufen_am is null and f.gilt_bis > now()),
      coalesce(z.testbetrieb, false),
      z.deaktiviert_am,
      z.deaktiviert_grund,
      z.export_am,
      z.loeschung_geplant_fuer,
      app.betrieb_echte_daten(c.id)
    from public.companies c
    left join public.betriebsanlagen b on b.betrieb_kennung = c.id
    left join public.betrieb_zustand z on z.betrieb_kennung = c.id
    order by lower(c.name);
end;
$$;

revoke all on function public.plattform_betriebe() from public, anon;
grant execute on function public.plattform_betriebe() to authenticated;
