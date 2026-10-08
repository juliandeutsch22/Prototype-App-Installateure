-- Original-PDF und Mahnstand werden gemeinsam festgehalten. Alte PDFs lassen
-- sich aus der letzten Mahnstufe und heutigen Einstellungen nicht rekonstruieren.
create table public.mahnbelege (
  id uuid primary key default gen_random_uuid(),
  company_id text not null references public.companies(id),
  invoice_id uuid not null references public.invoices(id) on delete cascade,
  invoice_number text not null,
  stufe integer not null check (stufe between 1 and 3),
  datum date not null,
  frist date not null,
  spesen numeric not null check (spesen >= 0),
  pdf_base64 text not null,
  unique(invoice_id, stufe),
  check (frist >= datum),
  check (octet_length(decode(pdf_base64, 'base64')) <= 2097152
    and substring(decode(pdf_base64, 'base64') from 1 for 5) = convert_to('%PDF-', 'UTF8'))
);
create index mahnbelege_zeitraum on public.mahnbelege(company_id, datum, id);
alter table public.mahnbelege enable row level security;
revoke all on public.mahnbelege from anon, authenticated;
create trigger mahnbelege_support before insert or update or delete on public.mahnbelege
  for each row execute function app.support_schreibt_nicht();
grant select on public.mahnbelege to authenticated;
grant all on public.mahnbelege to service_role;
create policy mahnbelege_lesen on public.mahnbelege for select to authenticated
  using (app.betriebsmitglied(company_id) and app.ist_buch_oder_spitze());

create or replace function app.mahnbeleg_fest() returns trigger
  language plpgsql security definer set search_path = ''
as $$
begin
  if tg_op <> 'INSERT' and not app.ist_dienst() then
    raise exception 'Ein Originalmahnbeleg wird nicht geändert oder gelöscht' using errcode = '42501';
  end if;
  if tg_op = 'DELETE' then return old; end if;
  if not exists (select 1 from public.invoices i
    where i.id = new.invoice_id and i.company_id = new.company_id
      and i.invoice_number = new.invoice_number) then
    raise exception 'Mahnung und Rechnung gehören nicht zusammen' using errcode = '23514';
  end if;
  return new;
end;
$$;
revoke all on function app.mahnbeleg_fest() from public, anon, authenticated;
create trigger mahnbelege_fest before insert or update or delete on public.mahnbelege
  for each row execute function app.mahnbeleg_fest();

create or replace function public.mahnung_mit_beleg_festhalten(
  p_id uuid, p_stufe integer, p_tag date, p_frist date, p_spesen numeric, p_pdf_base64 text
) returns uuid
  language plpgsql security definer set search_path = ''
as $$
declare
  betrieb text := app.betrieb();
  rechnung public.invoices;
  vorhanden public.mahnbelege;
  kennung uuid;
begin
  if betrieb is null or not coalesce(app.betriebsmitglied(betrieb) and app.ist_buch_oder_spitze(), false) then
    raise exception 'Nur die Buchhaltung oder Betriebsleitung hält Mahnungen fest' using errcode = '42501';
  end if;
  if p_stufe is null or p_stufe not between 1 and 3
     or p_tag is null or p_frist is null or p_frist < p_tag
     or p_spesen is null or p_spesen < 0 or p_pdf_base64 is null then
    raise exception 'Mahnstufe, Datum, Frist oder PDF ist ungültig' using errcode = '22023';
  end if;
  select * into rechnung from public.invoices i
    where i.id = p_id and i.company_id = betrieb for update;
  if rechnung.id is null then
    raise exception 'Diese Rechnung gibt es in diesem Betrieb nicht' using errcode = 'P0002';
  end if;
  select * into vorhanden from public.mahnbelege m where m.invoice_id = p_id and m.stufe = p_stufe;
  if vorhanden.id is not null then
    if vorhanden.datum = p_tag and vorhanden.frist = p_frist and vorhanden.spesen = p_spesen
       and vorhanden.pdf_base64 = p_pdf_base64 then
      return vorhanden.id;
    end if;
    raise exception 'Diese Mahnstufe wurde bereits mit einem anderen Beleg festgehalten' using errcode = '40001';
  end if;
  if p_stufe <> coalesce(rechnung.mahnstufe, 0) + 1
     or rechnung.payment_status in ('Bezahlt', 'Überzahlt', 'Storniert') then
    raise exception 'Der Rechnungsstand hat sich geändert — bitte neu laden' using errcode = '40001';
  end if;
  insert into public.mahnbelege(company_id, invoice_id, invoice_number, stufe, datum, frist, spesen, pdf_base64)
    values (betrieb, rechnung.id, rechnung.invoice_number, p_stufe, p_tag, p_frist, p_spesen, p_pdf_base64)
    returning id into kennung;
  update public.invoices set mahnstufe = p_stufe, gemahnt_am = p_tag, mahnfrist = p_frist,
    mahnspesen = p_spesen,
    payment_status = case when rechnung.payment_status = 'Offen' then 'Überfällig' else rechnung.payment_status end
    where id = rechnung.id;
  return kennung;
end;
$$;
revoke all on function public.mahnung_mit_beleg_festhalten(uuid, integer, date, date, numeric, text) from public, anon;
grant execute on function public.mahnung_mit_beleg_festhalten(uuid, integer, date, date, numeric, text) to authenticated;
