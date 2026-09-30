/*
  UID-FORM UND KUNDENART (Testbericht 30.09.2026, M10)

  WAS DER BERICHT FAND. „ATU123" wurde als UID angenommen, und ob ein Kunde
  Unternehmer ist, hing allein daran, ob eine UID eingetragen war. Für
  Verzugszinsen (§ 456 UGB) und die Pauschale von 40 € (§ 458 UGB) zählt
  aber die Kundenart, nicht das Feld — ein Kleinunternehmer ohne UID ist
  trotzdem Unternehmer.

  WAS HIER ENTSTEHT.
  - `app.uid_form_fehler`: die Muster je EU-Staat, wie die Kommission sie für
    VIES angibt. Dieselben stehen in `src/lib/uid.ts`; ein Test hält beide
    gleich. Ob die Nummer VERGEBEN ist, prüft erst VIES — das bleibt für
    später, ein fremder Dienst mit eigener Verfügbarkeit.
  - Kunden, Betrieb und neue Rechnungen speichern die UID einheitlich
    (Grossbuchstaben, ohne Leerzeichen, Punkte, Bindestriche) und lehnen eine
    falsche Form ab. NUR BEIM ÄNDERN: eine alte, falsch geschriebene UID
    blockiert keine andere Änderung am Kunden, und bestehende Daten werden
    nicht umgeschrieben.
  - `customers.kundenart`: „privat" oder „unternehmen". Wer eine UID hat, ist
    Unternehmer; die Rückfüllung setzt das, alle anderen bleiben ohne Angabe
    und werden wie bisher nach der UID behandelt.

  NEBENBEI: `kunde_umbenennen` kannte die Spalten aus M12 (Straße, PLZ, Ort,
  Land, Kundennummer) noch nicht und liess sie beim Umbenennen fallen. Sie
  nimmt jetzt jede Spalte, die im Rest steht.
*/

create or replace function app.uid_normalisieren(p text) returns text
  language sql
  immutable
  set search_path = ''
as $$
  select nullif(upper(regexp_replace(coalesce(p, ''), '[[:space:].-]', '', 'g')), '');
$$;

create or replace function app.uid_form_fehler(p text) returns text
  language plpgsql
  immutable
  set search_path = ''
as $$
declare
  u text := app.uid_normalisieren(p);
  muster text;
begin
  if u is null then
    return null;
  end if;
  if u like 'GR%' then
    return 'Griechische UID-Nummern beginnen mit „EL“, nicht mit „GR“.';
  end if;
  muster := case left(u, 2)
    when 'AT' then '^ATU[0-9]{8}$'
    when 'BE' then '^BE[01][0-9]{9}$'
    when 'BG' then '^BG[0-9]{9,10}$'
    when 'CY' then '^CY[0-9]{8}[A-Z]$'
    when 'CZ' then '^CZ[0-9]{8,10}$'
    when 'DE' then '^DE[0-9]{9}$'
    when 'DK' then '^DK[0-9]{8}$'
    when 'EE' then '^EE[0-9]{9}$'
    when 'EL' then '^EL[0-9]{9}$'
    when 'ES' then '^ES[A-Z0-9][0-9]{7}[A-Z0-9]$'
    when 'FI' then '^FI[0-9]{8}$'
    when 'FR' then '^FR[A-HJ-NP-Z0-9]{2}[0-9]{9}$'
    when 'HR' then '^HR[0-9]{11}$'
    when 'HU' then '^HU[0-9]{8}$'
    when 'IE' then '^IE([0-9]{7}[A-WY][A-I]?|[0-9][A-Z+*][0-9]{5}[A-W])$'
    when 'IT' then '^IT[0-9]{11}$'
    when 'LT' then '^LT([0-9]{9}|[0-9]{12})$'
    when 'LU' then '^LU[0-9]{8}$'
    when 'LV' then '^LV[0-9]{11}$'
    when 'MT' then '^MT[0-9]{8}$'
    when 'NL' then '^NL[0-9]{9}B[0-9]{2}$'
    when 'PL' then '^PL[0-9]{10}$'
    when 'PT' then '^PT[0-9]{9}$'
    when 'RO' then '^RO[0-9]{2,10}$'
    when 'SE' then '^SE[0-9]{12}$'
    when 'SI' then '^SI[0-9]{8}$'
    when 'SK' then '^SK[0-9]{10}$'
    when 'XI' then '^XI([0-9]{9}|[0-9]{12}|GD[0-9]{3}|HA[0-9]{3})$'
    else null
  end;
  if muster is not null then
    if u ~ muster then
      return null;
    end if;
    if left(u, 2) = 'AT' then
      return 'Eine österreichische UID-Nummer ist „ATU“ und acht Ziffern, z. B. ATU12345678.';
    end if;
    return format('„%s“ hat nicht die Form einer UID-Nummer dieses Landes.', u);
  end if;
  if u ~ '^[A-Z]{2}[0-9A-Z]{6,14}$' then
    return null;
  end if;
  return format('„%s“ sieht nicht nach einer UID-Nummer aus: zwei Buchstaben für das Land, dann die Nummer.', u);
end;
$$;

-- ---------------------------------------------------------------------------
-- Kunden
-- ---------------------------------------------------------------------------

alter table public.customers
  add column if not exists kundenart text
    check (kundenart in ('privat', 'unternehmen'));

-- Wer eine UID hat, ist Unternehmer. Alle anderen bleiben ohne Angabe.
update public.customers
   set kundenart = 'unternehmen'
 where kundenart is null and nullif(btrim(coalesce(vat_id, '')), '') is not null;

create or replace function app.kunde_uid() returns trigger
  language plpgsql
  set search_path = ''
as $$
declare
  fehler text;
begin
  if tg_op = 'INSERT'
     or app.uid_normalisieren(new.vat_id) is distinct from app.uid_normalisieren(old.vat_id) then
    fehler := app.uid_form_fehler(new.vat_id);
    if fehler is not null then
      raise exception '%', fehler using errcode = '22023';
    end if;
    -- Leer bleibt, wie es kam: nur eine echte Nummer wird vereinheitlicht.
    if app.uid_normalisieren(new.vat_id) is not null then
      new.vat_id := app.uid_normalisieren(new.vat_id);
    end if;
  end if;

  if app.uid_normalisieren(new.vat_id) is not null then
    if new.kundenart = 'privat' then
      raise exception 'Eine Privatperson hat keine UID-Nummer — Kundenart „Unternehmen“ wählen oder die UID leeren'
        using errcode = '22023';
    end if;
    new.kundenart := 'unternehmen';
  end if;
  return new;
end;
$$;

drop trigger if exists customers_uid on public.customers;
create trigger customers_uid before insert or update on public.customers
  for each row execute function app.kunde_uid();

-- ---------------------------------------------------------------------------
-- Betrieb: die eigene UID steht auf jedem Beleg
-- ---------------------------------------------------------------------------

create or replace function app.betrieb_uid() returns trigger
  language plpgsql
  set search_path = ''
as $$
declare
  fehler text;
begin
  if tg_op = 'INSERT'
     or app.uid_normalisieren(new.vat_id) is distinct from app.uid_normalisieren(old.vat_id) then
    fehler := app.uid_form_fehler(new.vat_id);
    if fehler is not null then
      raise exception '%', fehler using errcode = '22023';
    end if;
    -- Leer bleibt, wie es kam: nur eine echte Nummer wird vereinheitlicht.
    if app.uid_normalisieren(new.vat_id) is not null then
      new.vat_id := app.uid_normalisieren(new.vat_id);
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists companies_uid on public.companies;
create trigger companies_uid before insert or update on public.companies
  for each row execute function app.betrieb_uid();

-- ---------------------------------------------------------------------------
-- Rechnungen: nur beim Anlegen — eine ausgestellte Rechnung ändert sich nicht
-- ---------------------------------------------------------------------------

create or replace function app.rechnung_uid() returns trigger
  language plpgsql
  set search_path = ''
as $$
declare
  fehler text;
begin
  fehler := app.uid_form_fehler(new.customer_vat_id);
  if fehler is not null then
    raise exception 'UID-Nummer des Kunden: %', fehler using errcode = '22023';
  end if;
  -- Leer bleibt leer (''), wie die Rechnungsfunktion es schreibt.
  if app.uid_normalisieren(new.customer_vat_id) is not null then
    new.customer_vat_id := app.uid_normalisieren(new.customer_vat_id);
  end if;
  return new;
end;
$$;

drop trigger if exists invoices_uid on public.invoices;
create trigger invoices_uid before insert on public.invoices
  for each row execute function app.rechnung_uid();

-- ---------------------------------------------------------------------------
-- Umbenennen: jede Spalte, die im Rest steht
-- ---------------------------------------------------------------------------

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
         active        = coalesce((p_rest ->> 'active')::boolean, active),
         strasse       = case when p_rest ? 'strasse'      then p_rest ->> 'strasse'      else strasse end,
         plz           = case when p_rest ? 'plz'          then p_rest ->> 'plz'          else plz end,
         ort           = case when p_rest ? 'ort'          then p_rest ->> 'ort'          else ort end,
         land          = case when p_rest ? 'land'         then p_rest ->> 'land'         else land end,
         kundennummer  = case when p_rest ? 'kundennummer' then p_rest ->> 'kundennummer' else kundennummer end,
         kundenart     = case when p_rest ? 'kundenart'    then p_rest ->> 'kundenart'    else kundenart end
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
