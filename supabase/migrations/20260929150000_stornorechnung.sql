/*
  DIE STORNORECHNUNG (offene Punkte B7, Teil 1).

  Ein Storno war bisher eine Statusänderung: die Buchhaltung bekam ihre
  Gegenbuchung (BMD-Export, Ausgangsbuch), der Kunde nichts. In Österreich
  ist der übliche Beleg dafür eine STORNORECHNUNG — mit eigener Nummer aus
  dem Rechnungskreis, mit Verweis auf die stornierte Rechnung und den Beträgen
  mit umgekehrtem Vorzeichen. So hat es der Betrieb am 29.09.2026 entschieden;
  eine Teilgutschrift gibt es bewusst nicht (ein Nachlass geht über Storno und
  neue Rechnung).

  DIE NUMMER HÄNGT AN DER STORNIERTEN RECHNUNG (`storno_nummer`), nicht an
  einer eigenen Zeile. Eine eigene Zeile wäre eine zweite Rechnung mit
  negativen Beträgen — jede Summe, jede offene Forderung, der Mahnlauf, die
  Nachkalkulation und beide Exporte müssten lernen, sie zu verrechnen, und
  der Storno stünde doppelt. So bleibt der Storno, was er war, und bekommt
  seinen Beleg.

  AUSGESTELLT WIRD SIE AUF ZURUF, nicht mit dem Storno. Ein Storno lässt sich
  am selben Tag aufheben (Launch-Check K9) — solange kein Beleg hinausging.
  Ist die Stornorechnung ausgestellt, ist ihre Nummer vergeben und der Beleg
  womöglich beim Kunden; dann bleibt der Storno. Die Leistung wird neu
  abgerechnet.

  IHR DATUM IST DER TAG DES STORNOS (`cancelled_at`), und aus dessen Jahr kommt
  die Nummer. Denselben Tag bucht der BMD-Export und zeigt das Ausgangsbuch —
  Beleg und Buchung stimmen überein, auch wenn der Beleg erst Tage später
  gedruckt wird. `storno_am` hält fest, wann er ausgestellt wurde.

  DER KREIS ZÄHLT SIE MIT: `app.hoechste_lfd` liest die Stornonummern wie die
  Rechnungsnummern, sonst böte ein neu aufgebauter Zähler dieselbe Nummer
  ein zweites Mal an.
*/

alter table public.invoices
  add column if not exists storno_nummer text,
  add column if not exists storno_am timestamptz;

create unique index if not exists invoices_storno_nummer_je_betrieb
  on public.invoices (company_id, storno_nummer)
  where storno_nummer is not null;

comment on column public.invoices.storno_nummer is
  'Nummer der Stornorechnung (aus dem Rechnungskreis); gesetzt nur von public.stornorechnung_ausstellen.';

-- ---------------------------------------------------------------------------
-- 1. Der Kreis zählt die Stornonummern mit
-- ---------------------------------------------------------------------------

/* Rumpf wie in `20260925120000_nummernkreise_einheitlich.sql`, dazu die Stornonummern. */
create or replace function app.hoechste_lfd(p_art text, p_betrieb text, p_jahr integer)
  returns integer
  language sql
  stable
  security definer
  set search_path = ''
as $$
  select coalesce(max(lfd), 0)::integer from (
    select (regexp_match(i.invoice_number, '(?:^|-)' || p_jahr || '-(\d+)$'))[1]::bigint as lfd
      from public.invoices i
     where p_art = 'invoices' and i.company_id = p_betrieb
    union all
    select (regexp_match(i.storno_nummer, '(?:^|-)' || p_jahr || '-(\d+)$'))[1]::bigint
      from public.invoices i
     where p_art = 'invoices' and i.company_id = p_betrieb and i.storno_nummer is not null
    union all
    select (regexp_match(q.quote_number, '(?:^|-)' || p_jahr || '-(\d+)$'))[1]::bigint
      from public.quotes q
     where p_art = 'quotes' and q.company_id = p_betrieb
    union all
    select (regexp_match(p.project_number, '(?:^|-)' || p_jahr || '-(\d+)$'))[1]::bigint
      from public.projects p
     where p_art = 'projects' and p.company_id = p_betrieb
  ) x
  where lfd is not null and lfd < 2147483647
$$;

-- ---------------------------------------------------------------------------
-- 2. Der Wächter: einmal vergeben, bleibt sie — und mit ihr der Storno
-- ---------------------------------------------------------------------------

create or replace function app.stornorechnung_fest() returns trigger
  language plpgsql
  set search_path = ''
as $$
begin
  if tg_op = 'INSERT' then
    -- Nur der Rücklauf einer Sicherung bringt eine Rechnung samt Storno mit.
    if (new.storno_nummer is not null or new.storno_am is not null) and not app.ist_dienst() then
      raise exception 'Die Nummer einer Stornorechnung vergibt nur ihr Ausstellen'
        using errcode = '42501';
    end if;
    return new;
  end if;

  if (new.storno_nummer is distinct from old.storno_nummer
      or new.storno_am is distinct from old.storno_am)
     and (old.storno_nummer is not null
          or new.payment_status is distinct from 'Storniert'
          or current_setting('senklot.stornorechnung', true) is distinct from new.id::text) then
    raise exception 'Die Nummer einer Stornorechnung vergibt nur ihr Ausstellen — und sie bleibt'
      using errcode = '42501';
  end if;

  if old.storno_nummer is not null and new.payment_status is distinct from 'Storniert' then
    raise exception 'Die Stornorechnung % ist ausgestellt — der Storno lässt sich nicht mehr aufheben. Die Leistung bitte neu abrechnen.',
      old.storno_nummer
      using errcode = '55000';
  end if;

  return new;
end;
$$;

revoke all on function app.stornorechnung_fest() from public, anon, authenticated;

create trigger invoices_stornorechnung_fest
  before insert or update on public.invoices
  for each row execute function app.stornorechnung_fest();

-- ---------------------------------------------------------------------------
-- 3. Ausstellen
-- ---------------------------------------------------------------------------

/*
  Mit den Rechten des Aufrufers: den Zeilenschutz der Rechnungen und die
  Rolle für eine Rechnungsnummer (`naechste_nummer`) prüft dasselbe wie beim
  Ausstellen einer Rechnung. Ein zweiter Aufruf gibt dieselbe Nummer zurück —
  der Beleg lässt sich so beliebig oft neu drucken.
*/
create or replace function public.stornorechnung_ausstellen(
  p_id uuid,
  p_praefix text
) returns jsonb
  language plpgsql
  set search_path = ''
as $$
declare
  rechnung public.invoices;
  jahr integer;
  lfd integer;
  nummer text;
begin
  select * into rechnung from public.invoices i
   where i.id = p_id and i.company_id = app.betrieb();
  if rechnung.id is null then
    raise exception 'Diese Rechnung gibt es nicht' using errcode = 'P0002';
  end if;
  if rechnung.payment_status is distinct from 'Storniert' then
    raise exception 'Eine Stornorechnung gibt es nur zu einer stornierten Rechnung'
      using errcode = '22023';
  end if;
  if rechnung.storno_nummer is not null then
    return jsonb_build_object('storno_nummer', rechnung.storno_nummer, 'storno_am', rechnung.storno_am);
  end if;

  jahr := extract(year from (coalesce(rechnung.cancelled_at, now()) at time zone 'Europe/Vienna'))::integer;
  lfd := public.naechste_nummer('invoices', jahr);
  nummer := case when coalesce(p_praefix, '') = '' then '' else p_praefix || '-' end
         || jahr::text || '-'
         || case when lfd >= 10000 then lfd::text else lpad(lfd::text, 4, '0') end;

  perform set_config('senklot.stornorechnung', p_id::text, true);
  update public.invoices
     set storno_nummer = nummer, storno_am = now()
   where id = p_id;
  perform set_config('senklot.stornorechnung', '', true);

  return jsonb_build_object('storno_nummer', nummer, 'storno_am', now());
end;
$$;

revoke all on function public.stornorechnung_ausstellen(uuid, text) from public, anon;
grant execute on function public.stornorechnung_ausstellen(uuid, text) to authenticated;
