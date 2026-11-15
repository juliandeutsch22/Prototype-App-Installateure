-- K4 (Durchsicht 15.11.2026): „Alle Daten herunterladen“ und die Datenauskunft in Teilen.

/*
  WAS VORHER GESCHAH. `betrieb_auszug` und `person_auskunft` antworteten in
  EINEM Stück und brachen über 8 MB ab (gemessen: 40 000 Katalogzeilen). Die
  Meldung schickte zur nächtlichen Ausleitung — deren Eimer der Betrieb gar
  nicht lesen kann — bzw. zur Datensicherung, die an derselben Grenze
  scheiterte. Eine Hausverwaltung mit 600 unterschriebenen Scheinen bekam
  so keine Auskunft nach Art. 15: Sackgasse.

  JETZT DERSELBE WEG WIE BEI DER AUSLEITUNG: die Datenbank legt eine
  Arbeitskopie an (`app.auszug_arbeitsstand`), in Seiten zu rund 1 MB, und
  die App holt sie Seite für Seite ab und setzt die Datei zusammen. Eine
  Obergrenze gibt es dabei nicht mehr; jede einzelne Antwort bleibt klein.

  DIE GRENZE DER ALTEN FUNKTIONEN BLEIBT. Sie schützt den einen Abruf: ohne
  sie käme der ganze Bestand in einem Zug zurück, für jeden, der die Zahl
  hoch genug setzt (`betriebAuszug.test.ts`). Die alte App ruft sie weiter;
  die neue nimmt die Teile.

  WAS IN DIE KOPIE KOMMT, entscheiden dieselben Regeln wie beim Abruf in
  einem Stück: für den Betrieb `app.auszug_ausgenommen` (keine Push-Marken,
  keine Schlüssel-Hashes), private Zeilen bleiben draußen, ebenso die
  Meldungen über den Abrufenden (K1); für eine Person `person_auskunft`
  selbst — sie wird hier aufgerufen, nicht nachgebaut.

  WER DIE KOPIE LESEN DARF: genau das Konto, das sie angelegt hat, solange es
  Geschäftsführung oder Administration seines Betriebs ist. Legt es eine
  neue an, verschwindet seine vorige; die Kopie selbst lebt höchstens einen
  Tag (`auszug-arbeitsstand-raeumen`) und wird nach dem Abholen sofort
  verworfen.

  JEDE ZEILE DER KOPIE IST EIN STÜCK DER DATEI: `pfad` nennt, wohin es
  gehört, `element` ist ein Eintrag einer Liste, `wert` ein ganzer Wert. Die
  App setzt daraus genau die Gestalt zusammen, die der Abruf in einem Stück
  hatte.
*/

alter table app.auszug_arbeitsstand add column if not exists besitzer uuid;
create index if not exists auszug_arbeitsstand_besitzer on app.auszug_arbeitsstand(besitzer)
  where besitzer is not null;

-- Der Betrieb in Zeilen — dieselbe Auswahl wie `betrieb_auszug`.
create or replace function app.auszug_download_zeilen(p_betrieb text) returns setof jsonb
  language plpgsql
  stable
  security definer
  set search_path = ''
as $$
declare
  t text;
  privat boolean;
  n bigint;
  anzahl jsonb := '{}'::jsonb;
  firma jsonb;
begin
  return next jsonb_build_object('pfad', jsonb_build_array('companyId'), 'wert', p_betrieb);
  return next jsonb_build_object('pfad', jsonb_build_array('exportedAt'),
    'wert', to_char(now() at time zone 'utc', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'));

  select to_jsonb(c) into firma from public.companies c where c.id = p_betrieb;
  if firma is not null then
    return next jsonb_build_object('pfad', jsonb_build_array('data', 'companies'), 'element', firma);
    anzahl := jsonb_set(anzahl, array['companies'], to_jsonb(1));
  end if;

  foreach t in array app.auszug_tabellen() loop
    privat := exists (select 1 from information_schema.columns col
                       where col.table_schema = 'public' and col.table_name = t and col.column_name = 'privat');
    return query execute format(
      'select jsonb_build_object(''pfad'', jsonb_build_array(''data'', $3::text), ''element'', to_jsonb(z) - $2)
         from public.%I z where z.company_id = $1%s order by z', t,
      case when privat then ' and not z.privat'
           when t = 'nachricht_meldungen' then ' and z.von_uid is distinct from auth.uid()'
           else '' end)
      using p_betrieb, app.auszug_ausgenommen(t), t;
    get diagnostics n = row_count;
    -- Eine leere Tabelle steht als leere Liste da, nicht als fehlender Schlüssel.
    if n = 0 then
      return next jsonb_build_object('pfad', jsonb_build_array('data', t), 'wert', '[]'::jsonb);
    end if;
    anzahl := jsonb_set(anzahl, array[t], to_jsonb(n));
  end loop;

  return next jsonb_build_object('pfad', jsonb_build_array('anzahl'), 'wert', anzahl);
end;
$$;

revoke all on function app.auszug_download_zeilen(text) from public, anon, authenticated;

/*
  EINE KOPIE JE KONTO. Wer neu beginnt, verwirft seine vorige — sonst legte
  jedes abgebrochene Herunterladen eine weitere Kopie des ganzen Betriebs
  hin, bis der Nachtlauf sie räumt.
*/
create or replace function app.auszug_kopie_beginnen() returns uuid
  language sql
  security definer
  set search_path = ''
as $$
  delete from app.auszug_arbeitsstand a where a.besitzer = auth.uid();
  select gen_random_uuid();
$$;

revoke all on function app.auszug_kopie_beginnen() from public, anon, authenticated;

create or replace function app.auszug_kopie_umfang(p_lauf uuid) returns jsonb
  language sql
  stable
  security definer
  set search_path = ''
as $$
  select jsonb_build_object(
    'lauf', p_lauf,
    'seiten', coalesce(max(a.seite), 0),
    'zeilen', count(*),
    'bytes', coalesce(sum(a.bytes), 0))
  from app.auszug_arbeitsstand a where a.lauf = p_lauf;
$$;

revoke all on function app.auszug_kopie_umfang(uuid) from public, anon, authenticated;

create or replace function app.darf_auszug_holen() returns text
  language plpgsql
  stable
  security definer
  set search_path = ''
as $$
declare
  betrieb text := app.betrieb();
begin
  if betrieb is null or not app.angemeldet() then
    raise exception 'Keine Anmeldung' using errcode = '42501';
  end if;
  if not app.hat_rolle(array['Geschäftsführung', 'Administrator']) then
    raise exception 'Nur Geschäftsführung oder Administration' using errcode = '42501';
  end if;
  return betrieb;
end;
$$;

revoke all on function app.darf_auszug_holen() from public, anon, authenticated;

create or replace function public.betrieb_auszug_start() returns jsonb
  language plpgsql
  security definer
  set search_path = ''
as $$
declare
  mein_betrieb text := app.darf_auszug_holen();
  kennung uuid := app.auszug_kopie_beginnen();
begin
  /*
    Seiten zu rund 1 MB, wie `auszug_snapshot_start` (20261025100000) — aber
    LÜCKENLOS gezählt: eine Zeile über 1 MB ließe dort die nächsten Nummern
    aus, und wer Seite für Seite abholt, fände eine leere.
  */
  insert into app.auszug_arbeitsstand(lauf, betrieb, nr, inhalt, bytes, seite, besitzer)
    overriding system value
    select kennung, mein_betrieb, r.o, r.z, r.b, dense_rank() over (order by r.roh)::integer, auth.uid()
      from (select q.o, q.z, q.b, (sum(q.b) over (order by q.o) - q.b) / (1024 * 1024) as roh
              from (select t.z, t.o, octet_length(t.z::text) + 1 as b
                      from app.auszug_download_zeilen(mein_betrieb) with ordinality as t(z, o)) q) r
      order by r.o;
  return app.auszug_kopie_umfang(kennung);
end;
$$;

revoke all on function public.betrieb_auszug_start() from public, anon;
grant execute on function public.betrieb_auszug_start() to authenticated;

/*
  DIE PERSONENAUSKUNFT OHNE DIE GRENZE DES EINEN ABRUFS. `person_auskunft`
  bekommt genau eine Änderung: liegt die Schalterstellung dieser Transaktion
  auf „in Teilen“, rechnet sie ohne Obergrenze. Gesetzt wird die Stellung nur
  hier, transaktionslokal; jeder andere Aufruf rechnet wie bisher.
*/
do $migration$
declare
  quelle text;
  marke text := 'grenze bigint := least(coalesce(p_max_bytes, 8 * 1024 * 1024), 8 * 1024 * 1024);';
begin
  quelle := pg_get_functiondef('public.person_auskunft(text,uuid,integer)'::regprocedure);
  if position('app.auskunft_in_teilen' in quelle) = 0 then
    if (length(quelle) - length(replace(quelle, marke, ''))) / length(marke) <> 1 then
      raise exception 'Personenauskunft: Grenze nicht gefunden — Ausgangsstand unerwartet';
    end if;
    execute replace(quelle, marke,
      $neu$grenze bigint := case when current_setting('app.auskunft_in_teilen', true) = 'an' then null
                         else least(coalesce(p_max_bytes, 8 * 1024 * 1024), 8 * 1024 * 1024) end;$neu$);
  end if;
end;
$migration$;

create or replace function public.person_auskunft_start(p_art text, p_id uuid) returns jsonb
  language plpgsql
  security definer
  set search_path = ''
as $$
declare
  mein_betrieb text := app.darf_auszug_holen();
  ergebnis jsonb;
  zeilen jsonb[] := '{}';
  k text;
  v jsonb;
  k2 text;
  v2 jsonb;
  kennung uuid;
begin
  perform set_config('app.auskunft_in_teilen', 'an', true);
  ergebnis := public.person_auskunft(p_art, p_id, null);
  perform set_config('app.auskunft_in_teilen', '', true);

  for k, v in select e.key, e.value from jsonb_each(ergebnis) e order by e.key loop
    if k = 'daten' and jsonb_typeof(v) = 'object' then
      for k2, v2 in select e.key, e.value from jsonb_each(v) e order by e.key loop
        if jsonb_typeof(v2) = 'array' and jsonb_array_length(v2) > 0 then
          zeilen := zeilen || array(
            select jsonb_build_object('pfad', jsonb_build_array('daten', k2), 'element', x.el)
              from jsonb_array_elements(v2) with ordinality as x(el, o) order by x.o);
        else
          zeilen := zeilen || jsonb_build_object('pfad', jsonb_build_array('daten', k2), 'wert', v2);
        end if;
      end loop;
    else
      zeilen := zeilen || jsonb_build_object('pfad', jsonb_build_array(k), 'wert', v);
    end if;
  end loop;

  kennung := app.auszug_kopie_beginnen();
  insert into app.auszug_arbeitsstand(lauf, betrieb, nr, inhalt, bytes, seite, besitzer)
    overriding system value
    select kennung, mein_betrieb, r.o, r.z, r.b, dense_rank() over (order by r.roh)::integer, auth.uid()
      from (select q.o, q.z, q.b, (sum(q.b) over (order by q.o) - q.b) / (1024 * 1024) as roh
              from (select t.z, t.o, octet_length(t.z::text) + 1 as b
                      from unnest(zeilen) with ordinality as t(z, o)) q) r
      order by r.o;
  return app.auszug_kopie_umfang(kennung);
end;
$$;

revoke all on function public.person_auskunft_start(text, uuid) from public, anon;
grant execute on function public.person_auskunft_start(text, uuid) to authenticated;

-- Eine Seite abholen — nur die eigene Kopie, nur solange die Rolle noch stimmt.
create or replace function public.auszug_teil(p_lauf uuid, p_seite integer) returns jsonb
  language plpgsql
  stable
  security definer
  set search_path = ''
as $$
declare
  mein_betrieb text := app.darf_auszug_holen();
  teil jsonb;
begin
  select jsonb_agg(a.inhalt order by a.nr) into teil
    from app.auszug_arbeitsstand a
   where a.lauf = p_lauf and a.seite = p_seite
     and a.besitzer = (select auth.uid()) and a.betrieb = mein_betrieb;
  if teil is null then
    raise exception 'Dieser Teil liegt nicht mehr bereit. Bitte den Download neu beginnen.'
      using errcode = 'P0002';
  end if;
  return teil;
end;
$$;

revoke all on function public.auszug_teil(uuid, integer) from public, anon;
grant execute on function public.auszug_teil(uuid, integer) to authenticated;

create or replace function public.auszug_verwerfen(p_lauf uuid) returns void
  language sql
  security definer
  set search_path = ''
as $$
  delete from app.auszug_arbeitsstand a
   where a.lauf = p_lauf and a.besitzer = (select auth.uid());
$$;

revoke all on function public.auszug_verwerfen(uuid) from public, anon;
grant execute on function public.auszug_verwerfen(uuid) to authenticated;
