-- Kunden pflegen — eine Freigabe je Person, vergeben von der Spitze.
--
-- Bisher legte nur die Leitung (Projektleitung, Geschäftsführung,
-- Administration) Kunden an. Handbuch und Navigation sagten dagegen „das Büro
-- pflegt Kunden“, und im Prüflauf vom 24.09.2026 stand die Verwaltung vor einer
-- Kundenliste ohne „Neuer Kunde“ (F11). Der Betrieb hat entschieden: nicht die
-- ROLLE entscheidet, sondern die Geschäftsführung je Person. In einem Betrieb
-- nimmt die Bürokraft die Anrufe an und legt den Kunden gleich an, im anderen
-- soll das nur die Leitung.
--
-- WARUM EINE SPALTE IN `users` UND KEIN ANSPRUCH IM TOKEN. Das Token trägt
-- die Rolle und gilt bis zu einer Stunde. Eine entzogene Freigabe soll nicht
-- eine Stunde nachwirken — die Tabelle wird bei jedem Schreiben frisch
-- gefragt. Und `users` ändert ohnehin nur die Spitze (`users_aendern`); eine
-- Bürokraft kann sich die Freigabe also nicht selbst geben.

alter table public.users
  add column if not exists kunden_pflegen boolean not null default false;

comment on column public.users.kunden_pflegen is
  'Darf Kunden anlegen, ändern, löschen und aus einer Datei übernehmen. '
  'Wirkt für Verwaltung und Buchhaltung; die Leitung darf es ohnehin, '
  'Monteure nie.';

/*
  Wer Kunden anlegen, ändern und löschen darf.

  SECURITY DEFINER, weil die Regel die eigene Zeile in `users` lesen muss,
  ohne dabei von deren Zeilenschutz abzuhängen: der erlaubt das Lesen heute,
  aber eine Schreibregel, die still falsch wird, sobald jemand die Leseregel
  enger zieht, wäre eine Falle. Gelesen wird ausschliesslich die Zeile des
  Aufrufers und genau ein Wahrheitswert.

  Monteure stehen bewusst nicht darin, auch mit gesetztem Haken: ihre Rolle
  hat keinen Kundenstamm in der Navigation, und ein Haken, der nur in der
  Datenbank wirkt, wäre eine Tür ohne Weg dorthin.
*/
create or replace function app.darf_kunden_pflegen() returns boolean
  language sql stable
  security definer
  set search_path = ''
as $$
  select app.ist_fuehrung()
      or (app.hat_rolle(array['Verwaltung', 'Buchhaltung'])
          and exists (
            select 1 from public.users u
             where u.id = auth.uid()
               and u.kunden_pflegen
               and u.active))
$$;

revoke all on function app.darf_kunden_pflegen() from public, anon;
grant execute on function app.darf_kunden_pflegen() to authenticated;

drop policy if exists customers_anlegen on public.customers;
drop policy if exists customers_aendern on public.customers;
drop policy if exists customers_loeschen on public.customers;

create policy customers_anlegen on public.customers
  for insert with check (app.darf(company_id) and app.darf_kunden_pflegen());

create policy customers_aendern on public.customers
  for update using (app.darf(company_id) and app.darf_kunden_pflegen())
  with check (app.darf(company_id) and app.darf_kunden_pflegen());

create policy customers_loeschen on public.customers
  for delete using (app.darf(company_id) and app.darf_kunden_pflegen());

/*
  DER UMBENANNTE NAME MUSS AUCH AN DIE BAUSTELLEN — AUCH WENN DIE BÜROKRAFT
  UMBENENNT.

  `kunde_umbenennen` läuft mit den Rechten des Aufrufers und zog die Kopie
  des Namens auf den Baustellen mit einem gewöhnlichen `update` nach. Die
  Baustellen ändert aber nur die Leitung. Für eine Bürokraft mit Freigabe
  hätte der Zeilenschutz dieses zweite `update` STILL auf null Zeilen
  gekürzt — Kunde umbenannt, Baustellen mit dem alten Namen, kein Fehler.

  Deshalb zieht jetzt eine eng geschnittene Funktion nach: sie ändert
  ausschliesslich `customer_name`, ausschliesslich auf den Baustellen dieses
  Kunden, und nur für jemanden, der Kunden pflegen darf und im Betrieb des
  Kunden ist. Aufgerufen wird sie erst, NACHDEM die Kundenzeile selbst durch
  den Zeilenschutz gegangen ist.
*/
create or replace function app.kundenname_nachziehen(p_kunde uuid, p_name text)
  returns integer
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
     and company_id = betrieb;
  get diagnostics betroffen = row_count;
  return betroffen;
end;
$$;

revoke all on function app.kundenname_nachziehen(uuid, text) from public, anon;
grant execute on function app.kundenname_nachziehen(uuid, text) to authenticated;

create or replace function public.kunde_umbenennen(
  p_kunde uuid,
  p_name text,
  p_rest jsonb default '{}'::jsonb
) returns integer
  language plpgsql
  set search_path = ''
as $$
declare
  betrieb text;
begin
  select c.company_id into betrieb from public.customers c where c.id = p_kunde;
  if betrieb is null then
    raise exception 'Kunde nicht gefunden' using errcode = '42501';
  end if;

  update public.customers
     set name = p_name,
         address       = coalesce(p_rest ->> 'address',       address),
         contact_name  = coalesce(p_rest ->> 'contact_name',  contact_name),
         contact_phone = coalesce(p_rest ->> 'contact_phone', contact_phone),
         email         = coalesce(p_rest ->> 'email',         email),
         vat_id        = coalesce(p_rest ->> 'vat_id',        vat_id),
         notes         = coalesce(p_rest ->> 'notes',         notes),
         active        = coalesce((p_rest ->> 'active')::boolean, active)
   where id = p_kunde;

  if not found then
    -- Der Zeilenschutz hat die Zeile nicht durchgelassen.
    raise exception 'Kunde darf nicht geändert werden' using errcode = '42501';
  end if;

  return app.kundenname_nachziehen(p_kunde, p_name);
end;
$$;

revoke all on function public.kunde_umbenennen(uuid, text, jsonb) from public;
grant execute on function public.kunde_umbenennen(uuid, text, jsonb) to authenticated;

-- Die Übernahme aus einer Datei: dieselbe Grenze wie das Anlegen einzeln.
create or replace function public.kunden_einspielen(p_kunden jsonb, p_nur_pruefen boolean default true)
  returns jsonb
  language plpgsql
  security invoker
  set search_path = ''
as $$
declare
  betrieb text := app.betrieb();
  vorhanden jsonb;
  angelegt integer := 0;
  gesamt integer;
begin
  if betrieb is null or not app.betriebsmitglied(betrieb) or not app.darf_kunden_pflegen() then
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

  insert into public.customers (
    company_id, name, address, contact_name, contact_phone, email, vat_id, notes, active)
  select betrieb,
         btrim(z.k ->> 'name'),
         nullif(btrim(coalesce(z.k ->> 'address', '')), ''),
         nullif(btrim(coalesce(z.k ->> 'contactName', '')), ''),
         nullif(btrim(coalesce(z.k ->> 'contactPhone', '')), ''),
         nullif(btrim(coalesce(z.k ->> 'email', '')), ''),
         nullif(btrim(coalesce(z.k ->> 'vatId', '')), ''),
         nullif(btrim(coalesce(z.k ->> 'notes', '')), ''),
         true
    from (
      -- Kommt ein Name in der Liste zweimal, zählt der erste.
      select distinct on (app.kunden_schluessel(e.k ->> 'name')) e.k, e.stelle
        from jsonb_array_elements(p_kunden) with ordinality as e(k, stelle)
       where not ((e.stelle - 1)::integer in (select jsonb_array_elements_text(vorhanden)::integer))
       order by app.kunden_schluessel(e.k ->> 'name'), e.stelle
    ) z
   order by z.stelle;
  get diagnostics angelegt = row_count;

  return jsonb_build_object('angelegt', angelegt, 'uebersprungen', gesamt - angelegt);
end;
$$;
