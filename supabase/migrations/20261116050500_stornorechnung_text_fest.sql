-- Durchsicht 15.11.2026, G8 (Stornorechnung): der Satz zum bereits Bezahlten
-- steht fest, sobald die Stornorechnung ausgestellt ist.
--
-- WAS VORHER WAR: „Bereits bezahlte 200,00 € erstatten wir Ihnen …“ rechnete
-- `stornoPdf.ts` bei JEDEM Druck aus dem Zahlstand dieses Augenblicks. Am
-- 05.10. ausgestellt mit „200,00 € erstatten wir“, am 10.10. die Rückzahlung
-- gebucht — Nachdruck und Belegarchiv sagten danach „Die Forderung …
-- entfällt“: ein anderer Beleg unter derselben Nummer. Die Mahnung hält
-- ihren Inhalt genau deshalb fest; die Stornorechnung nicht.
--
-- DIE LÖSUNG: `invoices.storno_bezahlt` — was bis zum Ausstellen der
-- Stornorechnung auf die Rechnung bezahlt war (ohne Mahnkosten, wie
-- `bezahlt_betrag`). Gesetzt nur von `stornorechnung_ausstellen`, in
-- derselben Anweisung wie Nummer und Tag, und danach so fest wie sie
-- (`app.stornorechnung_fest`).
--
-- ALTDATEN: Stornorechnungen davor tragen den Betrag nicht (null); ihr
-- Nachdruck rechnet wie bisher aus dem heutigen Stand — was damals bezahlt
-- war, weiß niemand mehr sicher.
--
-- Verträglich mit der alten App: sie liest die Spalte nicht und druckt wie
-- bisher.

alter table public.invoices
  add column if not exists storno_bezahlt numeric(12,2);

comment on column public.invoices.storno_bezahlt is
  'Bis zum Ausstellen der Stornorechnung bezahlter Betrag (ohne Mahnkosten), wie ihn ihr Text nennt (G8, 15.11.2026). Gesetzt nur von stornorechnung_ausstellen, danach fest. Null bei Stornorechnungen davor.';

create or replace function public.stornorechnung_ausstellen(p_id uuid, p_praefix text) returns jsonb
  language plpgsql
  set search_path = ''
as $$
declare
  rechnung public.invoices;
  jahr integer;
  lfd integer;
  nummer text;
begin
  -- Gesperrt: ein gleichzeitiger Eingang ändert den Betrag nicht zwischen Lesen und Festhalten.
  select * into rechnung from public.invoices i
   where i.id = p_id and i.company_id = app.betrieb()
     for update;
  if rechnung.id is null then
    raise exception 'Diese Rechnung gibt es nicht' using errcode = 'P0002';
  end if;
  if rechnung.payment_status is distinct from 'Storniert' then
    raise exception 'Eine Stornorechnung gibt es nur zu einer stornierten Rechnung'
      using errcode = '22023';
  end if;
  if rechnung.storno_nummer is not null then
    return jsonb_build_object('storno_nummer', rechnung.storno_nummer, 'storno_am', rechnung.storno_am,
                              'storno_bezahlt', rechnung.storno_bezahlt);
  end if;

  jahr := extract(year from (now() at time zone 'Europe/Vienna'))::integer;
  lfd := public.naechste_nummer('invoices', jahr);
  nummer := case when coalesce(p_praefix, '') = '' then '' else p_praefix || '-' end
         || jahr::text || '-'
         || case when lfd >= 10000 then lfd::text else lpad(lfd::text, 4, '0') end;

  perform set_config('senklot.stornorechnung', p_id::text, true);
  update public.invoices
     set storno_nummer = nummer, storno_am = now(), storno_bezahlt = coalesce(rechnung.bezahlt_betrag, 0)
   where id = p_id;
  perform set_config('senklot.stornorechnung', '', true);

  return jsonb_build_object('storno_nummer', nummer, 'storno_am', now(),
                            'storno_bezahlt', coalesce(rechnung.bezahlt_betrag, 0));
end;
$$;

revoke all on function public.stornorechnung_ausstellen(uuid, text) from public, anon;
grant execute on function public.stornorechnung_ausstellen(uuid, text) to authenticated, service_role;

/* Wie Nummer und Tag: nur das Ausstellen setzt den Betrag, und er bleibt. */
create or replace function app.stornorechnung_fest() returns trigger
  language plpgsql
  set search_path = ''
as $$
begin
  if tg_op = 'INSERT' then
    -- Nur der Rücklauf einer Sicherung bringt eine Rechnung samt Storno mit.
    if (new.storno_nummer is not null or new.storno_am is not null or new.storno_bezahlt is not null)
       and not app.ist_dienst() then
      raise exception 'Die Nummer einer Stornorechnung vergibt nur ihr Ausstellen'
        using errcode = '42501';
    end if;
    return new;
  end if;

  if (new.storno_nummer is distinct from old.storno_nummer
      or new.storno_am is distinct from old.storno_am
      or new.storno_bezahlt is distinct from old.storno_bezahlt)
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
