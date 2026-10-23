/*
  ZWEI GRENZEN AUS T-18 UND T-19 GESCHLOSSEN (24.10.2026)

  1. DER TAG EINER ANFORDERUNG. Sie trug kein eigenes Abholdatum; das
     ausgegebene Material zählte am Tag ihrer letzten Änderung. Änderte sich
     danach noch etwas (etwa beim Umnummern der Baustelle), rutschte sie in
     einen anderen Rechnungszeitraum. Jetzt hält `erledigt_am` den Moment
     fest, in dem sie „Erledigt“ wurde — gesetzt von der Datenbank, nicht vom
     Gerät. Bestehende Anforderungen werden NICHT nachträglich beschrieben:
     für sie bleibt es beim bisherigen Tag (`coalesce` in der Funktion).

  2. LEHRLINGSSTUNDEN ZUM SATZ 0. Viele Betriebe verrechnen das 1. und 2.
     Lehrjahr nicht. Die Rechnung lässt diese Stunden ohne Zeile aus
     (`assembleInvoice`); „Nicht verrechnet“ zählte sie trotzdem mit, und
     eine Baustelle mit nur solchen Stunden stand dort für immer. Jetzt
     entscheidet `app.lehrling_ohne_satz` nach derselben Regel wie die App
     (`satzklasse`, `verrechnungssatz` in `src/lib/einstufung.ts`).
*/

-- ---------------------------------------------------------------------------
-- 1. erledigt_am
-- ---------------------------------------------------------------------------

alter table public.material_orders add column if not exists erledigt_am timestamptz;

/*
  Gesetzt beim Wechsel auf „Erledigt“, geleert beim Zurücksetzen, sonst
  unverändert — auch wenn ein Gerät etwas anderes schickt. Nur die
  Datenübernahme (Dienst) darf beim Anlegen einen eigenen Zeitpunkt setzen.
*/
create or replace function app.erledigt_am_setzen() returns trigger
  language plpgsql
  set search_path = ''
as $$
begin
  if tg_op = 'INSERT' then
    if new.status = 'Erledigt' then
      new.erledigt_am := case when app.ist_dienst() then coalesce(new.erledigt_am, now()) else now() end;
    else
      new.erledigt_am := null;
    end if;
    return new;
  end if;

  if new.status = 'Erledigt' and old.status is distinct from 'Erledigt' then
    new.erledigt_am := now();
  elsif new.status is distinct from 'Erledigt' then
    new.erledigt_am := null;
  else
    new.erledigt_am := old.erledigt_am;
  end if;
  return new;
end;
$$;

revoke all on function app.erledigt_am_setzen() from public, anon, authenticated;

drop trigger if exists material_orders_erledigt_am on public.material_orders;
create trigger material_orders_erledigt_am before insert or update on public.material_orders
  for each row execute function app.erledigt_am_setzen();

-- ---------------------------------------------------------------------------
-- 2. Lehrlingsstunden ohne Satz
-- ---------------------------------------------------------------------------

/*
  Dieselbe Regel wie `assembleInvoice`: eine Lehrlingsstunde (Satzklasse
  lj1–lj4, nicht als Helfer gebucht), deren Verrechnungssatz 0 ist. Der Satz
  ist die eigene Stufe des Betriebs, sonst der Helfersatz — ohne gepflegten
  Helfersatz der Ausgangswert der App (45 €, `INVOICE_DEFAULTS`). Ein Helfer
  ist kein Lehrling: seine Stunde zählt immer.
*/
create or replace function app.lehrling_ohne_satz(p_rates jsonb, p_satz text, p_helfer boolean)
  returns boolean
  language sql immutable
  set search_path = ''
as $$
  select case
    when coalesce(p_helfer, false) then false
    when coalesce(p_satz, 'facharbeiter') not like 'lj%' then false
    when jsonb_typeof(p_rates -> 'stufen' -> p_satz) = 'number'
      then (p_rates -> 'stufen' ->> p_satz)::numeric = 0
    when jsonb_typeof(p_rates -> 'helper') = 'number'
      then (p_rates ->> 'helper')::numeric = 0
    else false
  end
$$;

revoke all on function app.lehrling_ohne_satz(jsonb, text, boolean) from public, anon;
grant execute on function app.lehrling_ohne_satz(jsonb, text, boolean) to authenticated;

-- ---------------------------------------------------------------------------
-- Die beiden Funktionen, je mit genau dieser einen Änderung
-- ---------------------------------------------------------------------------

create or replace function public.ausgegebenes_material(p_baustelle text, p_bis date default null)
  returns table (art text, beleg_id text, datum date, material_id uuid, name text, einheit text, menge numeric)
  language plpgsql stable
  security definer
  set search_path = ''
as $$
#variable_conflict use_column
declare
  betrieb text := app.betrieb();
  schluessel text := regexp_replace(trim(coalesce(p_baustelle, '')), '^PR-', '', 'i');
  grenze date;
begin
  if not (app.betriebsmitglied(betrieb) and app.ist_buch_oder_spitze()) then
    raise exception 'Ausgegebenes Material sieht nur, wer Rechnungen schreibt' using errcode = '42501';
  end if;
  if schluessel = '' then
    return;
  end if;

  select max(coalesce(i.leistung_bis, i.invoice_date)) into grenze
    from public.invoices i
   where i.company_id = betrieb
     and i.payment_status <> 'Storniert'
     and i.art <> 'anzahlung'
     and regexp_replace(trim(coalesce(i.project_number, '')), '^PR-', '', 'i') = schluessel;

  return query
  with ausgaben as (
    select 'anforderung'::text as art, o.id::text as beleg_id,
           (coalesce(o.erledigt_am, o.updated_at) at time zone 'Europe/Vienna')::date as datum,
           o.material_id, o.material_name as name, m.unit as einheit, o.quantity as menge
      from public.material_orders o
      left join public.materials m on m.id = o.material_id and m.company_id = o.company_id
     where o.company_id = betrieb
       and o.transaction_type = 'order'
       and o.status = 'Erledigt'
       and regexp_replace(trim(coalesce(o.project_number, '')), '^PR-', '', 'i') = schluessel
    union all
    select 'retoure'::text, o.id::text,
           (o.created_at at time zone 'Europe/Vienna')::date,
           o.material_id, o.material_name, m.unit, -o.quantity
      from public.material_orders o
      left join public.materials m on m.id = o.material_id and m.company_id = o.company_id
     where o.company_id = betrieb
       and o.transaction_type = 'return'
       and regexp_replace(trim(coalesce(o.project_number, '')), '^PR-', '', 'i') = schluessel
    union all
    select 'ruestliste'::text, p.id, k.date,
           p.material_id, p.name, coalesce(nullif(p.einheit, ''), m.unit), p.menge
      from public.einsatz_material k
      join public.einsatz_material_positionen p on p.einsatz_material_id = k.id
      left join public.materials m on m.id = p.material_id and m.company_id = k.company_id
     where k.company_id = betrieb
       and regexp_replace(trim(k.project_number), '^PR-', '', 'i') = schluessel
       and k.geladen ? p.id::text
  )
  select a.art, a.beleg_id, a.datum, a.material_id, a.name, a.einheit, a.menge
    from ausgaben a
   where a.menge <> 0
     and (grenze is null or a.datum > grenze)
     and (p_bis is null or a.datum <= p_bis)
   order by a.datum, a.name, a.beleg_id;
end;
$$;

revoke all on function public.ausgegebenes_material(text, date) from public, anon;
grant execute on function public.ausgegebenes_material(text, date) to authenticated;

create or replace function public.unverrechnete_stunden()
  returns table (projekt text, kunde text, minuten integer, aeltester date, juengster date)
  language plpgsql stable
  security definer
  set search_path = ''
as $$
#variable_conflict use_column
begin
  if not (app.betriebsmitglied(app.betrieb()) and app.ist_buch_oder_spitze()) then
    raise exception 'Unverrechnete Stunden sieht nur, wer Rechnungen schreibt' using errcode = '42501';
  end if;

  return query
  with regie as (
    -- Die Nummer, wie sie an der Baustelle steht: mit ihr wählt die
    -- Rechnung die Baustelle aus.
    select regexp_replace(trim(p.project_number), '^PR-', '', 'i') as schluessel,
           max(p.project_number) as projekt,
           max(p.customer_name) as kunde
      from public.projects p
     where p.company_id = app.betrieb()
       and coalesce(p.billing_mode, 'Regie') = 'Regie'
     group by 1
  ),
  saetze as (
    select c.rates from public.companies c where c.id = app.betrieb()
  ),
  zeilen as (
    select regexp_replace(trim(t.project_number), '^PR-', '', 'i') as schluessel,
           app.arbeitsminuten(t.status, t.start_time, t.end_time,
                              t.break_duration, t.hours, t.date) as minuten,
           t.date
      from public.time_entries t
     where t.company_id = app.betrieb()
       and t.status = 'Anwesend'
       and t.is_billed = false
       and not app.lehrling_ohne_satz((select s.rates from saetze s), t.satz, t.is_helper)
  )
  select r.projekt, r.kunde, sum(z.minuten)::integer, min(z.date), max(z.date)
    from zeilen z
    join regie r on r.schluessel = z.schluessel
   where z.minuten > 0
   group by r.projekt, r.kunde
   order by min(z.date), r.projekt;
end;
$$;

revoke all on function public.unverrechnete_stunden() from public, anon;
grant execute on function public.unverrechnete_stunden() to authenticated;
