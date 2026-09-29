/*
  EINKAUFSPREISE, PREISLISTEN UND KOSTENSÄTZE SIEHT, WER SIE BRAUCHT (offene
  Punkte B1, Teil 1; Prüflauf P3-12).

  Bisher las jedes Mitglied des Betriebs:
    - `companies.cost_rates` — was eine Stunde Facharbeiter und Helfer den
      Betrieb kostet;
    - `materials.einkaufspreis` — was der Betrieb für einen Artikel zahlt;
    - `material_prices` — die Preislisten und Rabatte je Grosshändler.
  Die Oberfläche zeigte das nur der Spitze; die Datenbank gab es jedem, der
  über die Schnittstelle fragte, auch dem Monteur. Das sind Margendaten.

  WIE ES JETZT LIEGT:
    - Kostensätze in `betrieb_kostensaetze`, Einkaufspreise in
      `material_einkaufspreise` — lesen und schreiben nur Geschäftsführung
      und Administration (und ein Supportzugang, der den Betrieb ansieht).
    - `material_prices` lesen nur, wer einkauft: Verwaltung und Führung —
      dieselben, die dort schreiben.

  DIE ALTEN SPALTEN BLEIBEN ALS EINLASS. Auf den Telefonen läuft die alte
  Fassung der App weiter, bis jemand sie neu öffnet (`docs/DEPLOYMENT.md`,
  „abwärtskompatibel migrieren"); die Datanorm-Übernahme und alte
  Sicherungen schreiben `materials.einkaufspreis` und `companies.cost_rates`
  ebenso. Was dort ankommt, landet in der neuen Tabelle, und die Spalte
  bleibt leer. Gelesen wird sie nie mehr — so braucht es keinen zweiten
  Schritt, der sie später entfernt, und nichts bricht dazwischen.
*/

-- ---------------------------------------------------------------------------
-- 1. Die Kostensätze
-- ---------------------------------------------------------------------------

create table public.betrieb_kostensaetze (
  id          uuid primary key default gen_random_uuid(),
  /*
    ERST BEIM ABSCHLUSS GEPRÜFT: der Einlass schreibt hierher, bevor ein neuer
    Betrieb in `companies` steht — so beim Rücklauf einer alten Sicherung,
    die die Kostensätze noch am Betrieb trägt.
  */
  company_id  text not null unique references public.companies (id)
                on delete cascade deferrable initially deferred,
  -- Die Namen wie im bisherigen Feld (`{ fach, helper }`), damit alte und
  -- neue Fassung dieselben Zahlen meinen.
  fach        numeric(10,2),
  helper      numeric(10,2),
  updated_at  timestamptz not null default now()
);

alter table public.betrieb_kostensaetze enable row level security;

create policy betrieb_kostensaetze_lesen on public.betrieb_kostensaetze
  for select using (
    (app.betriebsmitglied(company_id) and app.ist_spitze()) or app.support_liest(company_id));
create policy betrieb_kostensaetze_schreiben on public.betrieb_kostensaetze
  for all using (app.darf(company_id) and app.ist_spitze())
  with check (app.darf(company_id) and app.ist_spitze());

revoke all on public.betrieb_kostensaetze from anon;

create trigger betrieb_kostensaetze_updated_at before update on public.betrieb_kostensaetze
  for each row execute function app.updated_at_setzen();
create trigger betrieb_kostensaetze_betrieb_fest before update on public.betrieb_kostensaetze
  for each row execute function app.betrieb_unveraenderlich();
create trigger betrieb_kostensaetze_kein_support_schreiben
  before insert or update or delete on public.betrieb_kostensaetze
  for each row execute function app.support_schreibt_nicht();

insert into public.betrieb_kostensaetze (company_id, fach, helper)
select id, (cost_rates ->> 'fach')::numeric, (cost_rates ->> 'helper')::numeric
  from public.companies
 where cost_rates is not null;

update public.companies set cost_rates = null where cost_rates is not null;

/*
  Der Einlass. Mit den Rechten des Schreibenden: `companies` ändert ohnehin
  nur die Spitze (`companies_aendern`), und dieselbe darf in die neue
  Tabelle. Der Dienstzugang (Betrieb anlegen, Rücklauf) kommt überall durch.
*/
create or replace function app.kostensaetze_einlass() returns trigger
  language plpgsql
  set search_path = ''
as $$
begin
  if new.cost_rates is null then
    return new;
  end if;
  insert into public.betrieb_kostensaetze (company_id, fach, helper)
  values (new.id, (new.cost_rates ->> 'fach')::numeric, (new.cost_rates ->> 'helper')::numeric)
  on conflict (company_id) do update
    set fach = excluded.fach, helper = excluded.helper;
  new.cost_rates := null;
  return new;
end;
$$;

revoke all on function app.kostensaetze_einlass() from public, anon, authenticated;

create trigger companies_kostensaetze_einlass
  before insert or update of cost_rates on public.companies
  for each row execute function app.kostensaetze_einlass();

comment on column public.companies.cost_rates is
  'Nur noch Einlass (seit 29.09.2026): Geschriebenes landet in betrieb_kostensaetze, die Spalte bleibt leer.';

-- ---------------------------------------------------------------------------
-- 2. Die Einkaufspreise
-- ---------------------------------------------------------------------------

create table public.material_einkaufspreise (
  id            uuid primary key default gen_random_uuid(),
  company_id    text not null references public.companies (id),
  /*
    ERST BEIM ABSCHLUSS GEPRÜFT. Der Einlass schreibt hierher, BEVOR ein neuer
    Artikel in `materials` steht (vor dem Einfügen); zum Ende der Transaktion
    gibt es ihn.
  */
  material_id   uuid not null unique references public.materials (id)
                  on delete cascade deferrable initially deferred,
  einkaufspreis numeric(12,4),
  updated_at    timestamptz not null default now()
);

create index material_einkaufspreise_betrieb on public.material_einkaufspreise (company_id);

alter table public.material_einkaufspreise enable row level security;

create policy material_einkaufspreise_lesen on public.material_einkaufspreise
  for select using (
    (app.betriebsmitglied(company_id) and app.ist_spitze()) or app.support_liest(company_id));
create policy material_einkaufspreise_schreiben on public.material_einkaufspreise
  for all using (app.darf(company_id) and app.ist_spitze())
  with check (app.darf(company_id) and app.ist_spitze());

revoke all on public.material_einkaufspreise from anon;

create trigger material_einkaufspreise_updated_at before update on public.material_einkaufspreise
  for each row execute function app.updated_at_setzen();
create trigger material_einkaufspreise_betrieb_fest before update on public.material_einkaufspreise
  for each row execute function app.betrieb_unveraenderlich();
create trigger material_einkaufspreise_kein_support_schreiben
  before insert or update or delete on public.material_einkaufspreise
  for each row execute function app.support_schreibt_nicht();

insert into public.material_einkaufspreise (company_id, material_id, einkaufspreis)
select company_id, id, einkaufspreis
  from public.materials
 where einkaufspreis is not null;

-- Der Wächter `materials_felder` liesse das Leeren nur der Spitze durch; die
-- Migration hat keine Rolle.
alter table public.materials disable trigger materials_felder;
update public.materials set einkaufspreis = null where einkaufspreis is not null;
alter table public.materials enable trigger materials_felder;

/*
  Der Einlass. Er läuft NACH `materials_felder` (Auslöser feuern nach Namen):
  der Wächter prüft zuerst, ob der Schreibende den Einkaufspreis setzen darf
  — nur die Spitze oder der Dienstzugang —, dann wird umgelegt.
  `tests/supabase/einkaufGeschuetzt.test.ts` hält beides fest.
*/
create or replace function app.einkaufspreis_einlass() returns trigger
  language plpgsql
  set search_path = ''
as $$
begin
  if new.einkaufspreis is null then
    return new;
  end if;
  insert into public.material_einkaufspreise (company_id, material_id, einkaufspreis)
  values (new.company_id, new.id, new.einkaufspreis)
  on conflict (material_id) do update set einkaufspreis = excluded.einkaufspreis;
  new.einkaufspreis := null;
  return new;
end;
$$;

revoke all on function app.einkaufspreis_einlass() from public, anon, authenticated;

create trigger materials_felder_einlass
  before insert or update of einkaufspreis on public.materials
  for each row execute function app.einkaufspreis_einlass();

comment on column public.materials.einkaufspreis is
  'Nur noch Einlass (seit 29.09.2026): Geschriebenes landet in material_einkaufspreise, die Spalte bleibt leer.';

-- ---------------------------------------------------------------------------
-- 3. Die Preislisten der Grosshändler
-- ---------------------------------------------------------------------------

drop policy if exists material_prices_lesen on public.material_prices;
create policy material_prices_lesen on public.material_prices
  for select using (
    (app.betriebsmitglied(company_id)
      and (app.hat_rolle(array['Verwaltung']) or app.ist_fuehrung()))
    or app.support_liest(company_id));
