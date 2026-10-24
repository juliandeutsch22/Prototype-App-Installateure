/*
  BELEGE MIT DEN FIRMENDATEN IHRER AUSSTELLUNG (A1 der Durchsicht vom 24.10.2026)

  WAS FEHLTE. Briefkopf, Bankverbindung, UID und Firmenbuch kamen bei jedem
  Druck aus den HEUTIGEN Firmendaten — auch beim Nachdruck einer Rechnung,
  einer Stornorechnung, einer Mahnung, eines Angebots oder eines
  unterschriebenen Handwerksscheins, im Belegarchiv und in der E-Rechnung.
  Zieht der Betrieb um, wechselt er die Bank oder bekommt er eine neue UID,
  sah ein alter Beleg danach anders aus als das Original beim Kunden. Ein
  Beleg muss sich so wieder erzeugen lassen, wie er ausgestellt wurde
  (§ 132 BAO).

  WIE. Die Firmendaten, die auf einem Beleg stehen, werden als STAND
  festgehalten — je Betrieb nur, wenn sie sich geändert haben (Prüfsumme).
  Der Beleg merkt sich beim Ausstellen seinen Stand. So steht das Logo, das
  schnell 100 KB wiegt, nicht in jeder Rechnung, sondern einmal je Stand.

  WANN EIN BELEG AUSGESTELLT IST:
    Rechnung          beim Anlegen (sie ist ab da eingefroren)
    Stornorechnung    wenn ihre Nummer vergeben wird
    Mahnung           beim Festhalten
    Angebot           wenn es versendet wird, sonst beim ersten Verlassen
                      des Entwurfs; ein Entwurf druckt mit den heutigen Daten
    Handwerksschein   bei der Unterschrift
  Die Bestellung beim Großhändler wird nur beim Bestellen erzeugt und nie
  nachgedruckt; sie braucht keinen Stand.

  ALTBESTAND. Belege von vor dieser Migration haben keinen Stand — welche
  Firmendaten damals galten, weiß die Datenbank nicht, und erfunden wird
  nichts. Sie drucken wie bisher mit den heutigen Daten.

  DER RÜCKLAUF einer Sicherung bringt den Stand des Belegs mit; dann setzen
  die Auslöser nichts Neues (`app.ist_dienst()`).
*/

create table if not exists public.aussteller_staende (
  id          uuid primary key default gen_random_uuid(),
  company_id  text not null references public.companies (id),
  angaben     jsonb not null,
  pruefsumme  text not null,
  angelegt_am timestamptz not null default now(),
  constraint aussteller_staende_angaben check (jsonb_typeof(angaben) = 'object'),
  constraint aussteller_staende_einmal unique (company_id, pruefsumme)
);

comment on table public.aussteller_staende is
  'Firmendaten, wie sie auf Belegen stehen — je Änderung ein Stand. Unveränderlich; geschrieben nur von app.aussteller_stand().';

alter table public.aussteller_staende enable row level security;
revoke all on public.aussteller_staende from public, anon, authenticated;
grant select on public.aussteller_staende to authenticated;

-- Lesen darf, wer Belege des Betriebs druckt: der ganze Betrieb (der Monteur
-- druckt seinen Schein) und der Support im Einblick.
drop policy if exists aussteller_staende_lesen on public.aussteller_staende;
create policy aussteller_staende_lesen on public.aussteller_staende for select
  using (company_id = (select app.lesebetrieb()) or company_id = (select app.supportbetrieb()));

/*
  DER SUPPORT-RIEGEL WIE AN DEN BELEGEN: ein Supportzugang schreibt hier nur
  mit der Freigabe „mitarbeiten“ — und auch dann nur über das Ausstellen
  eines Belegs, denn direkt schreibt diese Tabelle niemand.
*/
drop trigger if exists aussteller_staende_kein_support_schreiben on public.aussteller_staende;
create trigger aussteller_staende_kein_support_schreiben
  before insert or update or delete on public.aussteller_staende
  for each row execute function app.support_schreibt_nicht();

alter table public.invoices    add column if not exists aussteller_stand uuid references public.aussteller_staende (id);
alter table public.invoices    add column if not exists storno_aussteller_stand uuid references public.aussteller_staende (id);
alter table public.mahnungen   add column if not exists aussteller_stand uuid references public.aussteller_staende (id);
alter table public.quotes      add column if not exists aussteller_stand uuid references public.aussteller_staende (id);
alter table public.work_sheets add column if not exists aussteller_stand uuid references public.aussteller_staende (id);

-- ---------------------------------------------------------------------------
-- Der Stand der heutigen Firmendaten
-- ---------------------------------------------------------------------------

/*
  Die Namen der Angaben sind die der App (`Company`), damit sie sich beim
  Druck ohne Übersetzung über die heutigen Daten legen. Leere Angaben stehen
  als `null` darin: hatte der Betrieb damals keine Bank eingetragen, darf
  der Nachdruck keine zeigen, die erst später dazukam.
*/
create or replace function app.aussteller_stand(p_betrieb text) returns uuid
  language plpgsql
  security definer
  set search_path = ''
as $$
declare
  angaben jsonb;
  summe text;
  stand uuid;
begin
  select jsonb_build_object(
           'name',              c.name,
           'addressLine',       c.address_line,
           'strasse',           c.strasse,
           'plz',               c.plz,
           'ort',               c.ort,
           'land',              c.land,
           'contactLine',       c.contact_line,
           'logoUrl',           c.logo_url,
           'bankName',          c.bank_name,
           'iban',              c.iban,
           'bic',               c.bic,
           'vatId',             c.vat_id,
           'companyRegister',   c.company_register,
           'firmenbuchgericht', c.firmenbuchgericht)
    into angaben
    from public.companies c
   where c.id = p_betrieb;
  if angaben is null then
    return null;
  end if;

  summe := md5(angaben::text);
  insert into public.aussteller_staende (company_id, angaben, pruefsumme)
  values (p_betrieb, angaben, summe)
  on conflict (company_id, pruefsumme) do nothing;

  select s.id into stand
    from public.aussteller_staende s
   where s.company_id = p_betrieb and s.pruefsumme = summe;
  return stand;
end;
$$;

revoke all on function app.aussteller_stand(text) from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- Die Auslöser: beim Ausstellen festhalten, danach unveränderlich
-- ---------------------------------------------------------------------------

/*
  SECURITY DEFINER, weil `app.aussteller_stand` niemandem sonst offensteht:
  einen Stand legt nur das Ausstellen eines Belegs an, nicht ein Aufruf.
*/
create or replace function app.aussteller_rechnung() returns trigger
  language plpgsql
  security definer
  set search_path = ''
as $$
begin
  if tg_op = 'INSERT' then
    if not (app.ist_dienst() and new.aussteller_stand is not null) then
      new.aussteller_stand := app.aussteller_stand(new.company_id);
    end if;
    if not app.ist_dienst() then
      new.storno_aussteller_stand := null;
    end if;
    return new;
  end if;

  if new.aussteller_stand is distinct from old.aussteller_stand then
    raise exception 'Die Firmendaten einer ausgestellten Rechnung stehen fest'
      using errcode = '42501';
  end if;
  if old.storno_nummer is null and new.storno_nummer is not null then
    new.storno_aussteller_stand := app.aussteller_stand(new.company_id);
  elsif new.storno_aussteller_stand is distinct from old.storno_aussteller_stand then
    raise exception 'Die Firmendaten einer ausgestellten Stornorechnung stehen fest'
      using errcode = '42501';
  end if;
  return new;
end;
$$;

revoke all on function app.aussteller_rechnung() from public, anon, authenticated;

drop trigger if exists invoices_aussteller on public.invoices;
create trigger invoices_aussteller
  before insert or update on public.invoices
  for each row execute function app.aussteller_rechnung();

create or replace function app.aussteller_mahnung() returns trigger
  language plpgsql
  security definer
  set search_path = ''
as $$
begin
  if not (app.ist_dienst() and new.aussteller_stand is not null) then
    new.aussteller_stand := app.aussteller_stand(new.company_id);
  end if;
  return new;
end;
$$;

revoke all on function app.aussteller_mahnung() from public, anon, authenticated;

-- Mahnungen ändern sich nach dem Festhalten nicht mehr (keine Regel zum Ändern).
drop trigger if exists mahnungen_aussteller on public.mahnungen;
create trigger mahnungen_aussteller
  before insert on public.mahnungen
  for each row execute function app.aussteller_mahnung();

/*
  DAS ANGEBOT. Ein Entwurf wird noch geändert und druckt mit den heutigen
  Daten. Ausgestellt ist es, wenn es versendet wird — wird es nach einer
  Änderung noch einmal versendet, gilt der Stand dieses Versands. Geht ein
  Angebot ohne „Versendet“ direkt auf angenommen oder abgelehnt, gilt der
  Stand dieses Schritts.
*/
create or replace function app.aussteller_angebot() returns trigger
  language plpgsql
  security definer
  set search_path = ''
as $$
begin
  if app.ist_dienst() then
    return new;
  end if;
  if tg_op = 'INSERT' then
    new.aussteller_stand := case when new.status = 'Entwurf' then null
                                 else app.aussteller_stand(new.company_id) end;
    return new;
  end if;

  if new.status = 'Versendet' and old.status is distinct from 'Versendet' then
    new.aussteller_stand := app.aussteller_stand(new.company_id);
  elsif old.status = 'Entwurf' and new.status <> 'Entwurf' and old.aussteller_stand is null then
    new.aussteller_stand := app.aussteller_stand(new.company_id);
  elsif new.aussteller_stand is distinct from old.aussteller_stand then
    raise exception 'Die Firmendaten eines Angebots hält sein Versand fest'
      using errcode = '42501';
  end if;
  return new;
end;
$$;

revoke all on function app.aussteller_angebot() from public, anon, authenticated;

drop trigger if exists quotes_aussteller on public.quotes;
create trigger quotes_aussteller
  before insert or update on public.quotes
  for each row execute function app.aussteller_angebot();

/*
  DER SCHEIN. Bei der Unterschrift — sie friert ihn ein. Der Stand steht
  NICHT in der Prüfsumme des Scheins: der Kunde unterschreibt Zeiten,
  Material und Notiz, und bestehende Prüfsummen bleiben gültig.
*/
create or replace function app.aussteller_schein() returns trigger
  language plpgsql
  security definer
  set search_path = ''
as $$
begin
  if tg_op = 'INSERT' then
    if not app.ist_dienst() then
      new.aussteller_stand := null;
    end if;
    return new;
  end if;

  if new.status = 'Unterschrieben' and old.status is distinct from 'Unterschrieben' then
    new.aussteller_stand := app.aussteller_stand(new.company_id);
  elsif new.aussteller_stand is distinct from old.aussteller_stand then
    raise exception 'Die Firmendaten eines Scheins hält seine Unterschrift fest'
      using errcode = '42501';
  end if;
  return new;
end;
$$;

revoke all on function app.aussteller_schein() from public, anon, authenticated;

drop trigger if exists work_sheets_aussteller on public.work_sheets;
create trigger work_sheets_aussteller
  before insert or update on public.work_sheets
  for each row execute function app.aussteller_schein();
