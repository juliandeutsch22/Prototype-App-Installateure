-- TESTBERICHT 30.09.2026, H10 — DIE RECHNUNGSVORGABEN FÜR DIE BUCHHALTUNG.

-- ---------------------------------------------------------------------------
-- H10 — die Rechnungsvorgaben für die Buchhaltung
-- ---------------------------------------------------------------------------

/*
  WAS BISHER GALT: die Vorgaben stehen in `companies.rates`, neben den
  Stundensätzen, und die Firma ändert nur die Spitze (`companies_aendern`).
  Die Buchhaltung kam an Basiszinssatz, Mahnspesen und Skonto nicht heran —
  laut Handbuch pflegt sie sie. Ohne Basiszinssatz gehen Mahnungen an
  Unternehmer ohne Zinsen hinaus.

  EINE ENG GESCHNITTENE FUNKTION statt einer weiteren Schreibregel: sie ändert
  genau diese acht Schlüssel in `rates` und sonst nichts — keine Stunden-
  sätze, keine Zuschläge, keinen Steuersatz, keine Kostensätze. Ein Wert
  `null` nimmt den Schlüssel heraus (etwa „kein Skonto“).
*/
create or replace function public.rechnungsvorgaben_speichern(p_vorgaben jsonb)
  returns jsonb
  language plpgsql
  security definer
  set search_path = ''
as $$
declare
  betrieb text := app.betrieb();
  erlaubt text[] := array['dueDays', 'skontoProzent', 'skontoTage', 'mahnspesen',
                          'mahnspesenVerbraucher', 'pauschale458', 'basiszinssatz', 'basiszinssatzAb'];
  schluessel text;
  wert jsonb;
  neu jsonb;
begin
  if betrieb is null or not app.angemeldet() or not app.darf(betrieb) then
    raise exception 'Keine Anmeldung' using errcode = '42501';
  end if;
  if not app.ist_buch_oder_spitze() then
    raise exception 'Die Rechnungsvorgaben pflegen Buchhaltung, Geschäftsführung und Administration'
      using errcode = '42501';
  end if;
  if p_vorgaben is null or jsonb_typeof(p_vorgaben) <> 'object' then
    raise exception 'Keine Vorgaben übergeben' using errcode = '22023';
  end if;

  select coalesce(rates, '{}'::jsonb) into neu from public.companies where id = betrieb for update;

  for schluessel, wert in select * from jsonb_each(p_vorgaben) loop
    if not schluessel = any(erlaubt) then
      raise exception 'Das ist keine Rechnungsvorgabe: %', schluessel using errcode = '42501';
    end if;

    if wert is null or jsonb_typeof(wert) = 'null' then
      if schluessel = 'dueDays' then
        raise exception 'Ein Zahlungsziel braucht jede Rechnung' using errcode = '22023';
      end if;
      neu := neu - schluessel;
      continue;
    end if;

    if schluessel in ('dueDays', 'skontoTage') then
      if jsonb_typeof(wert) <> 'number' or (wert #>> '{}')::numeric <> floor((wert #>> '{}')::numeric)
         or (wert #>> '{}')::numeric < 0 or (wert #>> '{}')::numeric > 365 then
        raise exception '% muss eine ganze Zahl von Tagen sein (0 bis 365)', schluessel using errcode = '22023';
      end if;
    elsif schluessel = 'skontoProzent' then
      if jsonb_typeof(wert) <> 'number' or (wert #>> '{}')::numeric <= 0 or (wert #>> '{}')::numeric >= 100 then
        raise exception 'Skonto liegt zwischen 0 und 100 %%' using errcode = '22023';
      end if;
    elsif schluessel in ('mahnspesen', 'mahnspesenVerbraucher') then
      if jsonb_typeof(wert) <> 'array' or jsonb_array_length(wert) > 3
         or exists (select 1 from jsonb_array_elements(wert) e
                     where jsonb_typeof(e) <> 'number' or (e #>> '{}')::numeric < 0) then
        raise exception 'Mahnspesen sind bis zu drei Beträge ab 0 €' using errcode = '22023';
      end if;
    elsif schluessel = 'pauschale458' then
      if jsonb_typeof(wert) <> 'boolean' then
        raise exception 'pauschale458 ist ja oder nein' using errcode = '22023';
      end if;
    elsif schluessel = 'basiszinssatz' then
      if jsonb_typeof(wert) <> 'number' or abs((wert #>> '{}')::numeric) > 20 then
        raise exception 'Der Basiszinssatz ist ein Prozentsatz' using errcode = '22023';
      end if;
    elsif schluessel = 'basiszinssatzAb' then
      if jsonb_typeof(wert) <> 'string' or (wert #>> '{}') !~ '^\d{4}-(01|07)-01$' then
        raise exception 'Der Basiszinssatz gilt ab dem 1. Jänner oder 1. Juli' using errcode = '22023';
      end if;
    end if;

    neu := jsonb_set(neu, array[schluessel], wert, true);
  end loop;

  update public.companies set rates = neu where id = betrieb;
  return neu;
end;
$$;

revoke all on function public.rechnungsvorgaben_speichern(jsonb) from public, anon;
grant execute on function public.rechnungsvorgaben_speichern(jsonb) to authenticated;
