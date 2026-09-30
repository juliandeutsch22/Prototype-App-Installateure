-- TESTBERICHT 30.09.2026, M12 — ADRESSEN MIT STRASSE, PLZ, ORT, LAND;
-- FIRMENBUCHGERICHT; KUNDENNUMMER.
--
-- Bisher war eine Anschrift EINE Zeile („Gartengasse 12, 2700 Wiener
-- Neustadt“). Für Belege, den Export an die Kanzlei und Kunden im Ausland
-- braucht es die Teile einzeln.
--
-- WIE ES OHNE BRUCH GEHT: die Teile sind neue Spalten; die eine Zeile
-- (`customers.address`, `companies.address_line`) bleibt — sie ergibt sich
-- ab jetzt aus den Teilen, per Trigger. So lesen PDF, Suche, Baustellen und
-- Angebote weiter dieselbe Zeile, und nichts muss gleichzeitig umziehen.
-- Wer (etwa ein älterer Weg) nur die Zeile schreibt, bekommt die Teile
-- zerlegt, soweit das eindeutig geht.
--
-- DER BESTAND wird zerlegt, wo es eindeutig ist: „Strasse, PLZ Ort“. Sonst
-- bleibt die ganze Zeile in „Straße“ stehen, und `adresse_pruefen` markiert
-- den Kunden — die Kundenliste zeigt, was zu prüfen ist. Keine Zeile ändert
-- ihren Text.

-- ---------------------------------------------------------------------------
-- Zerlegen und Zusammensetzen
-- ---------------------------------------------------------------------------

/*
  „Gartengasse 12, 2700 Wiener Neustadt“ → (Gartengasse 12, 2700, Wiener
  Neustadt). Eine PLZ mit Länderkürzel („D-80331“) ist erlaubt. Alles andere
  ist nicht eindeutig: `null`.
*/
create or replace function app.adresse_zerlegen(p text)
  returns table (strasse text, plz text, ort text)
  language plpgsql
  immutable
  set search_path = ''
as $$
declare
  treffer text[];
begin
  treffer := regexp_match(
    btrim(coalesce(p, '')),
    '^(.*\S)\s*(?:,|·)\s*(?:[A-Z]{1,2}-)?(\d{4,5})\s+(\S.*)$'
  );
  if treffer is null or btrim(treffer[1]) = '' or btrim(treffer[3]) = '' then
    return;
  end if;
  return query select btrim(treffer[1]), treffer[2], btrim(treffer[3]);
end;
$$;

/* Das Land hinter dem Code — nur für die Zeile; Österreich steht nicht da. */
create or replace function app.land_name(p text) returns text
  language sql
  immutable
  set search_path = ''
as $$
  select case upper(coalesce(p, 'AT'))
    when 'AT' then null
    when 'DE' then 'Deutschland'
    when 'CH' then 'Schweiz'
    when 'IT' then 'Italien'
    when 'SI' then 'Slowenien'
    when 'HU' then 'Ungarn'
    when 'CZ' then 'Tschechien'
    when 'SK' then 'Slowakei'
    when 'LI' then 'Liechtenstein'
    else upper(p)
  end
$$;

create or replace function app.adresse_zeile(p_strasse text, p_plz text, p_ort text, p_land text)
  returns text
  language sql
  immutable
  set search_path = ''
as $$
  select nullif(concat_ws(', ',
    nullif(btrim(coalesce(p_strasse, '')), ''),
    nullif(btrim(concat_ws(' ', nullif(btrim(coalesce(p_plz, '')), ''), nullif(btrim(coalesce(p_ort, '')), ''))), ''),
    app.land_name(p_land)
  ), '')
$$;

-- ---------------------------------------------------------------------------
-- Kunden
-- ---------------------------------------------------------------------------

alter table public.customers
  add column if not exists strasse text,
  add column if not exists plz text,
  add column if not exists ort text,
  add column if not exists land text not null default 'AT',
  add column if not exists adresse_pruefen boolean not null default false,
  add column if not exists kundennummer text;

create unique index if not exists customers_kundennummer
  on public.customers (company_id, kundennummer) where kundennummer is not null;

/*
  DER BESTAND ZUERST — bevor der Auslöser unten steht. So werden nur die
  Teile gesetzt; die Zeile selbst bleibt Zeichen für Zeichen, wie sie ist.
*/
update public.customers c set
  strasse = coalesce(z.strasse, nullif(btrim(coalesce(c.address, '')), '')),
  plz = z.plz,
  ort = z.ort,
  adresse_pruefen = z.strasse is null and nullif(btrim(coalesce(c.address, '')), '') is not null
from (select id, (app.adresse_zerlegen(address)).* from public.customers) z
where z.id = c.id;
update public.customers c set
  strasse = nullif(btrim(coalesce(c.address, '')), ''),
  adresse_pruefen = nullif(btrim(coalesce(c.address, '')), '') is not null
where c.strasse is null and c.plz is null
  and not exists (select 1 from app.adresse_zerlegen(c.address));


create or replace function app.kunde_adresse() returns trigger
  language plpgsql
  set search_path = ''
as $$
declare
  teile record;
  teile_geaendert boolean;
begin
  new.land := upper(coalesce(nullif(btrim(new.land), ''), 'AT'));
  -- Eine leere Kundennummer ist keine — sonst stiessen zwei leere am eindeutigen Index an.
  new.kundennummer := nullif(btrim(coalesce(new.kundennummer, '')), '');
  teile_geaendert := tg_op = 'INSERT' and (new.strasse is not null or new.plz is not null or new.ort is not null)
    or tg_op = 'UPDATE' and (new.strasse, new.plz, new.ort, new.land) is distinct from (old.strasse, old.plz, old.ort, old.land);

  if teile_geaendert then
    -- Die Teile zählen: die Zeile folgt ihnen.
    new.address := app.adresse_zeile(new.strasse, new.plz, new.ort, new.land);
    new.adresse_pruefen := coalesce(new.strasse, '') <> '' and (coalesce(new.plz, '') = '' or coalesce(new.ort, '') = '');
  elsif tg_op = 'INSERT' or new.address is distinct from old.address then
    -- Nur die Zeile kam (älterer Weg): zerlegen, soweit eindeutig.
    select * into teile from app.adresse_zerlegen(new.address);
    if teile.strasse is not null then
      new.strasse := teile.strasse; new.plz := teile.plz; new.ort := teile.ort;
      new.adresse_pruefen := false;
    else
      new.strasse := nullif(btrim(coalesce(new.address, '')), '');
      new.plz := null; new.ort := null;
      new.adresse_pruefen := new.strasse is not null;
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists customers_adresse on public.customers;
create trigger customers_adresse before insert or update on public.customers
  for each row execute function app.kunde_adresse();

-- ---------------------------------------------------------------------------
-- Betrieb
-- ---------------------------------------------------------------------------

alter table public.companies
  add column if not exists strasse text,
  add column if not exists plz text,
  add column if not exists ort text,
  add column if not exists land text not null default 'AT',
  add column if not exists firmenbuchgericht text;

update public.companies c set
  strasse = coalesce(z.strasse, nullif(btrim(coalesce(c.address_line, '')), '')),
  plz = z.plz,
  ort = z.ort
from (select id, (app.adresse_zerlegen(address_line)).* from public.companies) z
where z.id = c.id;
update public.companies c set strasse = nullif(btrim(coalesce(c.address_line, '')), '')
where c.strasse is null and c.plz is null and not exists (select 1 from app.adresse_zerlegen(c.address_line));


create or replace function app.betrieb_adresse() returns trigger
  language plpgsql
  set search_path = ''
as $$
declare
  teile record;
begin
  new.land := upper(coalesce(nullif(btrim(new.land), ''), 'AT'));
  if tg_op = 'UPDATE' and (new.strasse, new.plz, new.ort, new.land) is distinct from (old.strasse, old.plz, old.ort, old.land)
     or tg_op = 'INSERT' and (new.strasse is not null or new.plz is not null or new.ort is not null) then
    new.address_line := app.adresse_zeile(new.strasse, new.plz, new.ort, new.land);
  elsif tg_op = 'INSERT' or new.address_line is distinct from old.address_line then
    select * into teile from app.adresse_zerlegen(new.address_line);
    new.strasse := coalesce(teile.strasse, nullif(btrim(coalesce(new.address_line, '')), ''));
    new.plz := teile.plz;
    new.ort := teile.ort;
  end if;
  return new;
end;
$$;

drop trigger if exists companies_adresse on public.companies;
create trigger companies_adresse before insert or update on public.companies
  for each row execute function app.betrieb_adresse();

-- ---------------------------------------------------------------------------
-- Die nächste freie Kundennummer — ein Vorschlag, keine Pflicht
-- ---------------------------------------------------------------------------

create or replace function public.naechste_kundennummer() returns text
  language sql
  stable
  set search_path = ''
as $$
  select (coalesce(max(k.kundennummer::bigint), 10000) + 1)::text
    from public.customers k
   where k.company_id = app.arbeitsbetrieb() and k.kundennummer ~ '^\d{1,12}$'
$$;

revoke all on function public.naechste_kundennummer() from public, anon;
grant execute on function public.naechste_kundennummer() to authenticated;
