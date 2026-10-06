-- ===========================================================================
-- NACHTSTUNDEN AUTOMATISCH (Testbericht Runde 3, M4)
-- ===========================================================================
--
-- Eine Buchung 05:00–16:00: die Maske meldete „01:00 Std. liegen in der
-- Nachtzeit“, die Lohn-CSV zeigte „Nacht 0,00“ — weil niemand „Nachtarbeit“
-- angehakt hatte. Der Zuschlag steht dem Arbeitnehmer nach Kollektivvertrag
-- zu; er darf nicht an einem vergessenen Haken hängen.
--
-- JETZT: Die Minuten in der Nachtzeit des Betriebs zählen von selbst — aus
-- Von und Bis, in Zeitkonto, Lohn-CSV, Stundennachweis und Rechnung. Der
-- Haken entfällt. Wer eine Buchung bewusst NICHT als Nachtarbeit zählen will,
-- wählt sie mit Grund ab (`nacht_abgewaehlt`).
--
-- `is_night_work` setzt dafür ab jetzt die Datenbank, nicht die Maske — auch
-- für eine ältere App auf einem Telefon, die noch den Haken schickt. Ohne Von
-- und Bis (Stunden aus der Spracheingabe) bleibt es beim Haken wie bisher:
-- wann gearbeitet wurde, steht dann nirgends.
--
-- BESTEHENDE BUCHUNGEN:
--   - nicht verrechnet: zählen ab jetzt automatisch (die App rechnet die
--     Nachtminuten aus Von und Bis; beim nächsten Speichern oder spätestens
--     beim Verrechnen setzt dieser Auslöser auch das Kennzeichen).
--   - verrechnet: bleiben, wie sie verrechnet wurden — ohne Kennzeichen keine
--     Nachtstunden. Hier wird keine Zeile umgeschrieben.

alter table public.time_entries
  add column if not exists nacht_abgewaehlt text
    check (nacht_abgewaehlt is null or char_length(btrim(nacht_abgewaehlt)) between 1 and 300);

comment on column public.time_entries.nacht_abgewaehlt is
  'Grund, warum diese Buchung trotz Stunden in der Nachtzeit nicht als Nachtarbeit zählt (Runde 3, M4). Leer = automatisch.';

/* Wie `nachtMinutenIn` in `src/lib/lohnregeln.ts`: Minuten der Spanne in der Nachtzeit, über Mitternacht. */
create or replace function app.nacht_minuten(p_von time, p_bis time, p_nacht_von text, p_nacht_bis text)
  returns integer
  language plpgsql immutable
  set search_path = ''
as $$
declare
  von integer := extract(hour from p_von)::integer * 60 + extract(minute from p_von)::integer;
  bis0 integer := extract(hour from p_bis)::integer * 60 + extract(minute from p_bis)::integer;
  nv integer := split_part(coalesce(p_nacht_von, '22:00'), ':', 1)::integer * 60 + split_part(coalesce(p_nacht_von, '22:00'), ':', 2)::integer;
  nb integer := split_part(coalesce(p_nacht_bis, '06:00'), ':', 1)::integer * 60 + split_part(coalesce(p_nacht_bis, '06:00'), ':', 2)::integer;
  bis integer;
  summe integer := 0;
  a integer;
  b integer;
  k integer;
begin
  if p_von is null or p_bis is null or von = bis0 or nv = nb then
    return 0;
  end if;
  bis := case when bis0 > von then bis0 else bis0 + 1440 end;
  for k in -1..1 loop
    a := k * 1440 + nv;
    b := case when nv < nb then k * 1440 + nb else (k + 1) * 1440 + nb end;
    summe := summe + greatest(0, least(bis, b) - greatest(von, a));
  end loop;
  return summe;
end;
$$;

revoke all on function app.nacht_minuten(time, time, text, text) from public, anon;
grant execute on function app.nacht_minuten(time, time, text, text) to authenticated, service_role;

create or replace function app.nacht_setzen() returns trigger
  language plpgsql
  security definer
  set search_path = ''
as $$
declare
  m integer;
begin
  -- Verrechnet bleibt verrechnet — auch im Storno-Schritt (siehe `verrechnet_bleibt_verrechnet`).
  if tg_op = 'UPDATE' and coalesce(old.is_billed, false) then
    return new;
  end if;
  new.nacht_abgewaehlt := nullif(btrim(coalesce(new.nacht_abgewaehlt, '')), '');
  if new.status = 'Anwesend' and new.start_time is not null and new.end_time is not null then
    select app.nacht_minuten(new.start_time, new.end_time, c.nacht_von, c.nacht_bis) into m
      from public.companies c where c.id = new.company_id;
    new.is_night_work := new.nacht_abgewaehlt is null and coalesce(m, 0) > 0;
  else
    -- Ohne Von und Bis gibt es nichts abzuwählen; es gilt der Haken.
    new.nacht_abgewaehlt := null;
  end if;
  return new;
end;
$$;

revoke all on function app.nacht_setzen() from public, anon, authenticated;

drop trigger if exists time_entries_nacht on public.time_entries;
create trigger time_entries_nacht
  before insert or update on public.time_entries
  for each row execute function app.nacht_setzen();

/* Rumpf wie 20260926110000, dazu die Abwahl: auch sie ändert eine verrechnete Buchung. */
create or replace function app.verrechnet_bleibt_verrechnet() returns trigger
  language plpgsql
  set search_path = ''
as $$
begin
  if app.ist_dienst() or not old.is_billed then
    return coalesce(new, old);
  end if;

  if tg_op = 'DELETE' then
    raise exception 'Diese Buchung ist mit Rechnung % verrechnet und lässt sich nicht löschen — dafür muss zuerst die Rechnung storniert werden',
      coalesce(nullif(old.invoice_number, ''), '—')
      using errcode = '42501';
  end if;

  -- Auch im Schritt, der sie freigibt (Storno), bleiben die Stunden, wie
  -- sie verrechnet wurden: geändert wird danach, nicht im selben Zug.
  if new.user_id is distinct from old.user_id
     or new.date is distinct from old.date
     or new.status is distinct from old.status
     or new.start_time is distinct from old.start_time
     or new.end_time is distinct from old.end_time
     or new.break_duration is distinct from old.break_duration
     or new.travel_time is distinct from old.travel_time
     or new.hours is distinct from old.hours
     or new.is_night_work is distinct from old.is_night_work
     or new.nacht_abgewaehlt is distinct from old.nacht_abgewaehlt
     or new.is_emergency is distinct from old.is_emergency
     or new.is_helper is distinct from old.is_helper
     or new.project_number is distinct from old.project_number
     or new.customer_name is distinct from old.customer_name then
    raise exception 'Diese Buchung ist mit Rechnung % verrechnet und kann nicht mehr geändert werden — dafür muss zuerst die Rechnung storniert werden',
      coalesce(nullif(old.invoice_number, ''), '—')
      using errcode = '42501';
  end if;
  return new;
end;
$$;
