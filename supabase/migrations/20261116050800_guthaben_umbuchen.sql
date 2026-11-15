-- Durchsicht 15.11.2026, V7: ein Guthaben mit einer anderen Rechnung desselben
-- Kunden verrechnen — als EIN Vorgang, im Export als Umbuchung.
--
-- WAS VORHER WAR: Die Stornorechnung sagt „Bereits bezahlte … erstatten wir
-- Ihnen oder verrechnen sie mit einer neuen Rechnung“. Einen Weg zum
-- Verrechnen gab es nicht: Rückzahlung auf der alten und Eingang auf der
-- neuen, beides von Hand — und der Zahlungsstapel buchte zwei
-- Bankbewegungen, die es nie gab.
--
-- JETZT: `guthaben_umbuchen` schreibt beide Seiten in einem Zug — einen
-- negativen Eintrag auf der Rechnung mit Guthaben und einen positiven auf der
-- Zielrechnung, beide der Art „Umbuchung“ und mit derselben Kennung
-- (`umbuchung`). Der Zahlstand beider Rechnungen folgt wie bei jedem Eingang.
-- Die beiden Hälften gehören zusammen: ändern lassen sie sich nicht, und wer
-- eine löscht, löscht beide (`app.umbuchung_zusammen`). Der Zahlungsstapel
-- schreibt eine Umbuchungszeile statt zweier Bankzeilen.
--
-- REGELN: derselbe Betrieb, derselbe Kunde, nicht mehr als das Guthaben der
-- einen und nicht mehr als der Rest der anderen; die Zielrechnung ist nicht
-- storniert. Der Tag ist der heutige in Wien (wie G5).
--
-- VERTRÄGLICH MIT DER ALTEN APP: sie schreibt keine Umbuchung. Liest sie
-- eine, zeigt sie die Art als Text, und ihr Zahlstand rechnet richtig. Ihr
-- Zahlungsstapel kennt die Art nicht und schriebe Bankzeilen — bis sie neu
-- geladen ist.

alter table public.zahlungseingaenge
  add column if not exists umbuchung uuid;

comment on column public.zahlungseingaenge.umbuchung is
  'Kennung einer Umbuchung (V7, 15.11.2026): die negative Hälfte auf der Rechnung mit Guthaben und die positive auf der Zielrechnung tragen dieselbe. Nur bei art = ''Umbuchung''.';

alter table public.zahlungseingaenge drop constraint if exists zahlungseingaenge_art_check;
alter table public.zahlungseingaenge add constraint zahlungseingaenge_art_check
  check (art = any (array['Überweisung', 'Bar', 'Karte', 'Sonstiges', 'Skonto', 'Mahnkosten', 'Umbuchung']));

alter table public.zahlungseingaenge drop constraint if exists zahlungseingaenge_umbuchung_paar;
alter table public.zahlungseingaenge add constraint zahlungseingaenge_umbuchung_paar
  check ((art = 'Umbuchung') = (umbuchung is not null));

create index if not exists zahlungseingaenge_umbuchung on public.zahlungseingaenge (umbuchung) where umbuchung is not null;

/*
  DIE HÄLFTEN GEHÖREN ZUSAMMEN. Anlegen nur über `guthaben_umbuchen`, ändern
  gar nicht — eine geänderte Hälfte ließe Geld entstehen oder verschwinden.
  Löschen geht (ein Fehlgriff muss sich zurücknehmen lassen), aber nur
  zusammen: der Auslöser nach dem Löschen nimmt die andere Hälfte mit.
*/
create or replace function app.umbuchung_zusammen() returns trigger
  language plpgsql
  security definer
  set search_path = ''
as $$
begin
  if tg_op = 'INSERT' then
    if new.art = 'Umbuchung' and coalesce(current_setting('app.umbuchung', true), '') <> 'ja' and not app.ist_dienst() then
      raise exception 'Eine Umbuchung entsteht nur als Ganzes — über „Guthaben umbuchen“.' using errcode = '42501';
    end if;
    return new;
  end if;
  if tg_op = 'UPDATE' then
    if (old.art = 'Umbuchung' or new.art = 'Umbuchung') and not app.ist_dienst() then
      raise exception 'Eine Umbuchung lässt sich nicht ändern — nur ganz löschen und neu umbuchen.' using errcode = '42501';
    end if;
    return new;
  end if;
  -- Nach dem Löschen: die andere Hälfte mit.
  if old.umbuchung is not null then
    delete from public.zahlungseingaenge z where z.umbuchung = old.umbuchung and z.id <> old.id;
  end if;
  return old;
end;
$$;

revoke all on function app.umbuchung_zusammen() from public, anon, authenticated;

drop trigger if exists zahlungen_umbuchung_vorher on public.zahlungseingaenge;
create trigger zahlungen_umbuchung_vorher
  before insert or update on public.zahlungseingaenge
  for each row execute function app.umbuchung_zusammen();

drop trigger if exists zahlungen_umbuchung_nachher on public.zahlungseingaenge;
create trigger zahlungen_umbuchung_nachher
  after delete on public.zahlungseingaenge
  for each row execute function app.umbuchung_zusammen();

create or replace function public.guthaben_umbuchen(p_von uuid, p_auf uuid, p_betrag numeric) returns uuid
  language plpgsql
  security definer
  set search_path = ''
as $$
declare
  betrieb text := app.betrieb();
  heute date := (now() at time zone 'Europe/Vienna')::date;
  von public.invoices;
  auf public.invoices;
  guthaben numeric(12,2);
  rest numeric(12,2);
  kennung uuid := gen_random_uuid();
  wer text;
begin
  if betrieb is null or not app.angemeldet() or not app.ist_buch_oder_spitze() then
    raise exception 'Umbuchen darf, wer Zahlungen erfasst.' using errcode = '42501';
  end if;
  if p_von is null or p_auf is null or p_von = p_auf then
    raise exception 'Umgebucht wird von einer Rechnung auf eine andere.' using errcode = '22023';
  end if;
  if p_betrag is null or p_betrag <= 0 or p_betrag <> round(p_betrag, 2) then
    raise exception 'Der Betrag der Umbuchung ist größer null und auf den Cent genau.' using errcode = '22023';
  end if;

  -- Beide sperren, in fester Reihenfolge: zwei Umbuchungen in Gegenrichtung warten aufeinander.
  perform 1 from public.invoices i where i.id in (p_von, p_auf) order by i.id for update;
  select * into von from public.invoices i where i.id = p_von and i.company_id = betrieb;
  select * into auf from public.invoices i where i.id = p_auf and i.company_id = betrieb;
  if von.id is null or auf.id is null then
    raise exception 'Eine der beiden Rechnungen gibt es hier nicht.' using errcode = 'P0002';
  end if;
  if coalesce(von.customer_id::text, lower(btrim(von.customer_name))) is distinct from
     coalesce(auf.customer_id::text, lower(btrim(auf.customer_name))) then
    raise exception 'Ein Guthaben wird nur mit einer Rechnung desselben Kunden verrechnet.' using errcode = '22023';
  end if;
  if auf.payment_status = 'Storniert' then
    raise exception 'Auf eine stornierte Rechnung wird nicht umgebucht.' using errcode = '22023';
  end if;

  guthaben := coalesce(von.bezahlt_betrag, 0) - case when von.payment_status = 'Storniert' then 0 else von.total_brutto end;
  if p_betrag > guthaben then
    raise exception 'Auf % stehen % € Guthaben — mehr lässt sich nicht umbuchen.',
      von.invoice_number, replace(greatest(guthaben, 0)::text, '.', ',')
      using errcode = '22023';
  end if;
  rest := auf.total_brutto - coalesce(auf.bezahlt_betrag, 0);
  if p_betrag > rest then
    raise exception 'Auf % sind nur % € offen — mehr wäre wieder ein Guthaben.',
      auf.invoice_number, replace(greatest(rest, 0)::text, '.', ',')
      using errcode = '22023';
  end if;

  select u.name into wer from public.users u where u.id = auth.uid();
  perform set_config('app.umbuchung', 'ja', true);
  insert into public.zahlungseingaenge
    (company_id, invoice_id, datum, betrag, art, hinweis, erfasst_von, erfasst_von_name, umbuchung)
  values
    (betrieb, von.id, heute, -p_betrag, 'Umbuchung', 'Guthaben verrechnet mit ' || auf.invoice_number, auth.uid(), wer, kennung),
    (betrieb, auf.id, heute, p_betrag, 'Umbuchung', 'Guthaben aus ' || von.invoice_number, auth.uid(), wer, kennung);
  perform set_config('app.umbuchung', '', true);
  return kennung;
end;
$$;

revoke all on function public.guthaben_umbuchen(uuid, uuid, numeric) from public, anon;
grant execute on function public.guthaben_umbuchen(uuid, uuid, numeric) to authenticated, service_role;
