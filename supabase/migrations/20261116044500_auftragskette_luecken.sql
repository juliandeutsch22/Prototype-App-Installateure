/*
  KLEINE LÜCKEN DER AUFTRAGSKETTE (Durchsicht 15.11.2026, A12).

  1. KUNDENIMPORT MIT KUNDENART (`kunden_einspielen`). Der Import schrieb
     Name, Anschrift, Kontakt, E-Mail, UID und Notiz — keine Kundenart. 800
     eingelesene Kunden standen alle unter „Kundenart prüfen“ und mussten
     einzeln geöffnet werden, bevor Rechnung und Mahnung gingen; die
     Kundennummer landete als Satz in der Notiz, obwohl es seit M12 ein Feld
     gibt. Jetzt kommen Kundenart, Kundennummer und die Teile der Anschrift
     (Straße, PLZ, Ort, Land) in ihre Felder. Eine schon vergebene
     Kundennummer geht wie bisher in die Notiz (die Eindeutigkeit bräche
     sonst den ganzen Import). Ohne die neuen Schlüssel — die alte App —
     bleibt alles wie bisher.

  2. EIN ABGELEHNTER ODER GELÖSCHTER EINGANG NIMMT SEINE BESICHTIGUNG MIT.
     `eingang_ablehnen` fasste `termin_id` nicht an: der Kunde sagt ab, das
     Büro lehnt ab — und die Besichtigung stand weiter im Einsatzplan der
     eingeteilten Person. Jetzt geht ein Besichtigungstermin von heute oder
     später mit; einer, der schon war, bleibt (er ist Geschichte). Dasselbe
     beim Löschen eines Eingangs (`auftragseingaenge_termin_mitnehmen`). Die
     Rückfragen nennen den Termin vorher.

  3. EIN UMBENANNTER KUNDE HEISST AUCH IN WARTUNGEN UND ANGEBOTSENTWÜRFEN
     NEU (`app.kundenname_nachziehen`). Baustellen und Eingänge zogen den
     Namen schon nach, Wartungen und Angebotsentwürfe nicht — die
     Wartungsliste zeigte den alten Namen, bis jemand die Wartung neu
     speicherte. Versendete Angebote behalten ihren Namen: sie sind, was der
     Kunde bekommen hat. Rückgabe weiter die Zahl der Baustellen (die Meldung
     der Kundenakte zählt sie).

  ALTDATEN. Nichts wird umgeschrieben; die Änderungen wirken ab dem nächsten
  Import, der nächsten Ablehnung und der nächsten Umbenennung.
*/

-- ---------------------------------------------------------------------------
-- 1. Kundenimport
-- ---------------------------------------------------------------------------

create or replace function public.kunden_einspielen(p_kunden jsonb, p_nur_pruefen boolean DEFAULT true)
 RETURNS jsonb
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
declare
  betrieb text := app.arbeitsbetrieb();
  vorhanden jsonb;
  angelegt integer := 0;
  gesamt integer;
begin
  if betrieb is null
     or not (app.betriebsmitglied(betrieb) or app.support_schreibt(betrieb))
     or not app.darf_kunden_pflegen() then
    raise exception 'Kunden übernehmen darf, wer Kunden anlegen darf — Leitung oder mit Freigabe „Kunden pflegen“'
      using errcode = '42501';
  end if;
  if p_kunden is null or jsonb_typeof(p_kunden) <> 'array' then
    raise exception 'Erwartet wird eine Liste von Kunden' using errcode = '22023';
  end if;
  gesamt := jsonb_array_length(p_kunden);
  if gesamt > 5000 then
    raise exception 'Höchstens 5000 Kunden auf einmal' using errcode = '22023';
  end if;

  with bestand as (
    select distinct app.kunden_schluessel(c.name) as schluessel
      from public.customers c
     where c.company_id = betrieb
  ), zeilen as (
    select (e.stelle - 1)::integer as nr, app.kunden_schluessel(e.k ->> 'name') as schluessel
      from jsonb_array_elements(p_kunden) with ordinality as e(k, stelle)
  )
  select coalesce(jsonb_agg(z.nr order by z.nr), '[]'::jsonb) into vorhanden
    from zeilen z
    join bestand b on b.schluessel = z.schluessel;

  if p_nur_pruefen then
    return jsonb_build_object('vorhanden', vorhanden);
  end if;

  if exists (
    select 1 from jsonb_array_elements(p_kunden) k
     where app.kunden_schluessel(k ->> 'name') = ''
  ) then
    raise exception 'Jeder Kunde braucht einen Namen' using errcode = '22023';
  end if;

  if exists (
    select 1 from jsonb_array_elements(p_kunden) k
     where nullif(btrim(coalesce(k ->> 'kundenart', '')), '') is not null
       and btrim(k ->> 'kundenart') not in ('privat', 'unternehmen')
  ) then
    raise exception 'Die Kundenart ist privat oder unternehmen' using errcode = '22023';
  end if;

  /*
    A12: Kundenart, Kundennummer und die Teile der Anschrift kommen in ihre
    Felder. Eine Kundennummer, die im Betrieb (oder weiter vorn in derselben
    Datei) schon vergeben ist, bräche den ganzen Import an der Eindeutigkeit
    — sie geht dann wie bisher als Satz in die Notiz.
  */
  insert into public.customers (
    company_id, name, address, contact_name, contact_phone, email, vat_id, notes, active,
    kundenart, kundennummer, strasse, plz, ort, land)
  select betrieb,
         btrim(z.k ->> 'name'),
         nullif(btrim(coalesce(z.k ->> 'address', '')), ''),
         nullif(btrim(coalesce(z.k ->> 'contactName', '')), ''),
         nullif(btrim(coalesce(z.k ->> 'contactPhone', '')), ''),
         nullif(btrim(coalesce(z.k ->> 'email', '')), ''),
         nullif(btrim(coalesce(z.k ->> 'vatId', '')), ''),
         nullif(concat_ws(E'\n',
           nullif(btrim(coalesce(z.k ->> 'notes', '')), ''),
           case when z.nummer is not null and not z.nummer_frei then 'Kundennummer im Altsystem: ' || z.nummer end), ''),
         true,
         nullif(btrim(coalesce(z.k ->> 'kundenart', '')), ''),
         case when z.nummer_frei then z.nummer end,
         nullif(btrim(coalesce(z.k ->> 'strasse', '')), ''),
         nullif(btrim(coalesce(z.k ->> 'plz', '')), ''),
         nullif(btrim(coalesce(z.k ->> 'ort', '')), ''),
         nullif(btrim(coalesce(z.k ->> 'land', '')), '')
    from (
      select y.*,
             y.nummer is not null
               and not exists (select 1 from public.customers c where c.company_id = betrieb and c.kundennummer = y.nummer)
               and row_number() over (partition by y.nummer order by y.stelle) = 1 as nummer_frei
        from (
          select x.k, x.stelle, nullif(btrim(coalesce(x.k ->> 'kundennummer', '')), '') as nummer
            from (
      -- Kommt ein Name in der Liste zweimal, zählt der erste.
      select distinct on (app.kunden_schluessel(e.k ->> 'name')) e.k, e.stelle
        from jsonb_array_elements(p_kunden) with ordinality as e(k, stelle)
       where not ((e.stelle - 1)::integer in (select jsonb_array_elements_text(vorhanden)::integer))
       order by app.kunden_schluessel(e.k ->> 'name'), e.stelle
            ) x
        ) y
    ) z
   order by z.stelle;
  get diagnostics angelegt = row_count;

  return jsonb_build_object('angelegt', angelegt, 'uebersprungen', gesamt - angelegt);
end;
$function$;

revoke all on function public.kunden_einspielen(jsonb, boolean) from public, anon;
grant execute on function public.kunden_einspielen(jsonb, boolean) to authenticated;

-- ---------------------------------------------------------------------------
-- 2. Abgelehnter oder gelöschter Eingang: die kommende Besichtigung geht mit
-- ---------------------------------------------------------------------------

create or replace function public.eingang_ablehnen(p_eingang uuid, p_grund text) returns void
  language plpgsql
  security definer
  set search_path = ''
as $$
declare
  e public.auftragseingaenge;
  grund text := btrim(coalesce(p_grund, ''));
begin
  if app.hat_rolle(array['Verwaltung', 'Buchhaltung', 'Projektleiter', 'Geschäftsführung', 'Administrator']) is not true then
    raise exception 'Eingänge bearbeitet nur das Büro' using errcode = '42501';
  end if;
  e := app.eingang_sperren(p_eingang);
  if e.stand = 'abgelehnt' then
    return;
  end if;
  if e.stand <> 'offen' then
    raise exception 'Der Eingang % ist %; abgelehnt wird nur ein offener', e.nummer, app.eingang_stand_text(e.stand)
      using errcode = '55000';
  end if;
  if char_length(grund) < 3 or char_length(grund) > 1000 then
    raise exception 'Bitte einen Grund angeben (3 bis 1000 Zeichen)' using errcode = '22023';
  end if;
  update public.auftragseingaenge
     set stand = 'abgelehnt', abgelehnt_grund = grund, abgelehnt_am = now(),
         abgelehnt_von_uid = auth.uid(),
         abgelehnt_von_name = (select u.name from public.users u where u.id = auth.uid())
   where id = e.id;
  -- A12: die Besichtigung steht sonst weiter im Plan. Eine, die schon war, bleibt.
  perform app.eingang_besichtigung_entfernen(e);
end;
$$;

revoke all on function public.eingang_ablehnen(uuid, text) from public, anon;
grant execute on function public.eingang_ablehnen(uuid, text) to authenticated;

create or replace function app.eingang_besichtigung_entfernen(e public.auftragseingaenge) returns void
  language sql
  security definer
  set search_path = ''
as $$
  delete from public.termine t
   where t.id = e.termin_id
     and t.company_id = e.company_id
     and t.datum >= (now() at time zone 'Europe/Vienna')::date
$$;

revoke all on function app.eingang_besichtigung_entfernen(public.auftragseingaenge) from public, anon, authenticated;

create or replace function app.eingang_termin_mitnehmen() returns trigger
  language plpgsql
  security definer
  set search_path = ''
as $$
begin
  perform app.eingang_besichtigung_entfernen(old);
  return old;
end;
$$;

revoke all on function app.eingang_termin_mitnehmen() from public, anon, authenticated;

drop trigger if exists auftragseingaenge_termin_mitnehmen on public.auftragseingaenge;
create trigger auftragseingaenge_termin_mitnehmen
  after delete on public.auftragseingaenge
  for each row when (old.termin_id is not null)
  execute function app.eingang_termin_mitnehmen();

-- ---------------------------------------------------------------------------
-- 3. Der neue Name auch in Wartungen und Angebotsentwürfen
-- ---------------------------------------------------------------------------

create or replace function app.kundenname_nachziehen(p_kunde uuid, p_name text) returns integer
  language plpgsql
  security definer
  set search_path = ''
as $$
declare
  betrieb text;
  betroffen integer;
begin
  select c.company_id into betrieb from public.customers c where c.id = p_kunde;
  if betrieb is null or not app.darf(betrieb) or not app.darf_kunden_pflegen() then
    raise exception 'Kunde darf nicht geändert werden' using errcode = '42501';
  end if;
  update public.projects
     set customer_name = p_name
   where customer_id = p_kunde
     and company_id = betrieb
     and customer_name is distinct from p_name;
  get diagnostics betroffen = row_count;
  -- A12: Wartungen tragen den Namen als Text — die Liste zeigte den alten.
  update public.wartungen
     set customer_name = p_name
   where customer_id = p_kunde
     and company_id = betrieb
     and customer_name is distinct from p_name;
  -- A12: nur Entwürfe (auch im Papierkorb) — was beim Kunden liegt, behält seinen Namen.
  update public.quotes
     set customer_name = p_name
   where customer_id = p_kunde
     and company_id = betrieb
     and status in ('Entwurf', 'Verworfen')
     and customer_name is distinct from p_name;
  return betroffen;
end;
$$;

revoke all on function app.kundenname_nachziehen(uuid, text) from public, anon;
grant execute on function app.kundenname_nachziehen(uuid, text) to authenticated;
