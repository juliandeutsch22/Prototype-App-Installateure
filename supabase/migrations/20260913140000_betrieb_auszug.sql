-- Der DSGVO-Auszug — in der Datenbank statt in einer Cloud Function.
--
-- „Eure Daten gehoeren euch" ist ein Satz, bis jemand auf den Knopf drueckt.
-- Art. 15 und 20 DSGVO geben dem Betrieb das Recht, seinen ganzen Bestand zu
-- bekommen; diese Funktion loest es ein.
--
-- SIE IST NICHT DIE SICHERUNG. Sie gibt alles in EINER Antwort zurueck; der
-- vollstaendige Stand ohne Groessengrenze liegt in der naechtlichen
-- Ausleitung. Der Unterschied steht auch in der Fehlermeldung, damit niemand
-- vor einem abgebrochenen Download steht und raten muss.

/*
  DIE LISTE PFLEGT SICH SELBST.

  In Firestore stand sie von Hand in `mandantendaten.ts` — und umfasste
  neun von sechzehn Sammlungen. Es fehlten Kunden, Angebote, Handwerksscheine,
  Urlaubsantraege und, am folgenreichsten, die Nummernkreise: ein
  Wiederanlauf aus so einem Export haette den Rechnungszaehler bei null
  begonnen, und der Betrieb haette zwei Rechnungen mit derselben Nummer in
  den Buechern.

  Hier kommt die Liste aus dem Katalog: jede Tabelle mit einer Spalte
  `company_id` gehoert dazu. Wer morgen eine Tabelle anlegt, ist im Export,
  ohne daran zu denken — und `tests/supabase/betriebAuszug.test.ts` prueft
  genau das, damit die Regel nicht eines Tages still danebenliegt.

  SICHTEN SIND NICHT DABEI. `monthly_stats` ist die einzige, und sie rechnet
  aus den Zeiteintraegen, die ohnehin im Auszug stehen. In Firestore war sie
  eine eigene Sammlung und musste mit, weil der Neuaufbau eine Function
  brauchte; hier kostet er nichts.

  `betriebsanlagen` und `platform_admins` tragen kein `company_id` und fallen
  damit von selbst heraus — sie gehoeren der Plattform, nicht dem Betrieb.
*/
create or replace function app.auszug_tabellen() returns text[]
  language sql stable
  set search_path = ''
as $$
  select coalesce(array_agg(c.relname::text order by c.relname), '{}')
    from pg_class c
    join pg_namespace n on n.oid = c.relnamespace
   where n.nspname = 'public'
     and c.relkind = 'r'
     and exists (
       select 1 from information_schema.columns col
        where col.table_schema = 'public'
          and col.table_name = c.relname
          and col.column_name = 'company_id')
$$;

/*
  WAS NICHT MITGEHT, UND WARUM.

  Push-Tokens sind Kanaele auf die Geraete einzelner Mitarbeiter, kein
  Geschaeftsdatum. Fuer einen Wiederanlauf taugen sie nichts — beim naechsten
  Anmelden entstehen sie neu —, in einer abgelegten Datei waeren sie nur ein
  Risiko.
*/
create or replace function app.auszug_ausgenommen(p_tabelle text) returns text[]
  language sql immutable
  set search_path = ''
as $$
  select case p_tabelle when 'user_prefs' then array['push_tokens'] else '{}'::text[] end
$$;

/*
  DIE GRENZE LAESST SICH NUR SENKEN, NICHT HEBEN.

  Ohne eigene Grenze scheitert der Abruf irgendwo zwischen Datenbank und
  Browser, und zwar an einer Stelle, an der niemand die Ursache erkennt. Also
  lieber hier abbrechen und sagen, was los ist — samt dem Weg, der
  stattdessen funktioniert.

  Der Parameter ist da, damit die Pruefung die Grenze ueberhaupt erreichen
  kann, ohne acht Megabyte Testdaten anzulegen. `least` sorgt dafuer, dass er
  nur nach unten wirkt: ein Aufrufer soll sich nicht mehr nehmen duerfen.
*/
create or replace function public.betrieb_auszug(
  p_max_bytes integer default null
) returns jsonb
  language plpgsql
  security definer
  set search_path = ''
as $$
declare
  betrieb text := app.betrieb();
  grenze bigint := least(coalesce(p_max_bytes, 8 * 1024 * 1024), 8 * 1024 * 1024);
  bytes bigint := 0;
  tabelle text;
  zeilen jsonb;
  daten jsonb := '{}'::jsonb;
  anzahl jsonb := '{}'::jsonb;
begin
  if betrieb is null or not app.angemeldet() then
    raise exception 'Keine Anmeldung' using errcode = '42501';
  end if;
  -- Der Auszug ist der ganze Betrieb in einer Datei: Loehne, Kunden, Preise.
  -- Ihn holt, wer den Betrieb vertritt, nicht wer darin arbeitet.
  if not app.hat_rolle(array['Geschäftsführung', 'Administrator']) then
    raise exception 'Nur Geschäftsführung oder Administration' using errcode = '42501';
  end if;

  select to_jsonb(c) into zeilen from public.companies c where c.id = betrieb;
  if zeilen is not null then
    daten := jsonb_set(daten, array['companies'], jsonb_build_array(zeilen));
    anzahl := jsonb_set(anzahl, array['companies'], to_jsonb(1));
  end if;

  foreach tabelle in array app.auszug_tabellen() loop
    execute format(
      'select coalesce(jsonb_agg((to_jsonb(t) - $2) order by t), ''[]''::jsonb)
         from public.%I t where t.company_id = $1', tabelle)
      into zeilen using betrieb, app.auszug_ausgenommen(tabelle);

    bytes := bytes + length(zeilen::text);
    if bytes > grenze then
      raise exception 'Der Datenbestand ist zu groß für einen Download in einem Stück. Der vollständige Stand liegt in der nächtlichen Ausleitung.'
        using errcode = '53400';
    end if;

    daten := jsonb_set(daten, array[tabelle], zeilen);
    anzahl := jsonb_set(anzahl, array[tabelle], to_jsonb(jsonb_array_length(zeilen)));
  end loop;

  return jsonb_build_object(
    'companyId', betrieb,
    'exportedAt', to_char(now() at time zone 'utc', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'),
    'anzahl', anzahl,
    'data', daten);
end;
$$;

revoke all on function public.betrieb_auszug(integer) from public;
grant execute on function public.betrieb_auszug(integer) to authenticated;
