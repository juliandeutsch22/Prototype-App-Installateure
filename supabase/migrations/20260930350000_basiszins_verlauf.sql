/*
  BASISZINSSÄTZE ALS VERLAUF JE HALBJAHR (Testbericht 30.09.2026, G30)

  Wählbar war nur das laufende und das nächste Halbjahr. Für eine ältere, noch
  offene Forderung liess sich der damals gültige Satz nicht hinterlegen, und
  die Mahnung rechnete erst ab dem eingetragenen Halbjahr.

  Neu ist der Schlüssel `basiszinssaetze` in `companies.rates`: eine Liste
  aus {ab, satz}, je Halbjahr einer. Der einzelne Satz (`basiszinssatz`,
  `basiszinssatzAb`) bleibt lesbar; die Maske übernimmt ihn in die Liste und
  nimmt ihn beim nächsten Speichern heraus. Bestehende Daten werden hier
  nicht umgeschrieben.

  Die Funktion ist dieselbe wie in `20260930181000_rechnungsvorgaben.sql`,
  um diesen einen Schlüssel erweitert.
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
                          'mahnspesenVerbraucher', 'pauschale458', 'basiszinssatz', 'basiszinssatzAb',
                          'basiszinssaetze'];
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
    elsif schluessel = 'basiszinssaetze' then
      -- Schritt für Schritt: SQL wertet ein `or` nicht zwingend von links aus,
      -- und eine Umwandlung an der falschen Art bräche mit einer Fehlermeldung
      -- ab, die niemand versteht.
      if jsonb_typeof(wert) <> 'array' then
        raise exception 'Basiszinssätze sind eine Liste' using errcode = '22023';
      end if;
      if jsonb_array_length(wert) > 80
         or exists (select 1 from jsonb_array_elements(wert) e
                     where case
                       when jsonb_typeof(e) <> 'object' then true
                       when jsonb_typeof(e -> 'satz') is distinct from 'number' then true
                       when jsonb_typeof(e -> 'ab') is distinct from 'string' then true
                       else abs((e ->> 'satz')::numeric) > 20
                         or (e ->> 'ab') !~ '^\d{4}-(01|07)-01$'
                         or (select count(*) from jsonb_object_keys(e)) <> 2
                     end) then
        raise exception 'Basiszinssätze sind je Halbjahr ein Satz ab dem 1. Jänner oder 1. Juli' using errcode = '22023';
      end if;
      if (select count(distinct e ->> 'ab') from jsonb_array_elements(wert) e) <> jsonb_array_length(wert) then
        raise exception 'Für jedes Halbjahr gilt nur ein Basiszinssatz' using errcode = '22023';
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
