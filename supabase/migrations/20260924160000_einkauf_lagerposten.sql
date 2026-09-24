-- EIGENES MATERIAL AUF DIE EINKAUFSLISTE — nicht nur, was ein Monteur anfordert.
--
-- GEWÜNSCHT: Verwaltung, Projektleitung, Geschäftsführung und Administration
-- setzen Material auf die Einkaufsliste, etwa um das Lager aufzufüllen. Das
-- ist keine Materialanforderung: niemand wartet darauf, es gibt keine
-- Baustelle, und „Abholbereit" ergäbe keinen Sinn.
--
-- DESHALB EINE EIGENE TABELLE statt einer Anforderung ohne Monteur. Eine
-- solche Zeile stünde in „Offen", im Zähler am Menü, in der Liste des
-- Anfordernden und beim Abschluss im Lagerabgang — überall dort, wo eine
-- Anforderung gemeint ist. Auf der Einkaufsliste stehen beide nebeneinander,
-- zusammengefasst je Artikel wie bisher.
--
-- Geliefert heisst hier: die Ware kommt ins Lager, und damit ist der Posten
-- erledigt.

create table if not exists public.einkauf_posten (
  id uuid primary key default gen_random_uuid(),
  company_id text not null references public.companies(id),
  supplier_id uuid references public.suppliers(id),
  -- Ohne Katalogartikel steht nur der Name da; beim Eintreffen wird er über
  -- den Namen im Katalog gesucht, wie bei einer Anforderung.
  material_id uuid references public.materials(id) on delete set null,
  material_name text not null,
  menge numeric(12,3) not null,
  einheit text,
  notiz text,
  angelegt_von_uid uuid,
  angelegt_von_name text,
  bestellt_am timestamptz,
  geliefert_am timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint einkauf_posten_name check (length(btrim(material_name)) > 0),
  constraint einkauf_posten_menge check (menge > 0)
);

comment on table public.einkauf_posten is
  'Material, das das Büro selbst auf die Einkaufsliste setzt (etwa fürs Lager) — keine Anforderung eines Monteurs.';

-- Die Einkaufsliste fragt nur, was noch nicht da ist.
create index if not exists einkauf_posten_offen
  on public.einkauf_posten (company_id, supplier_id)
  where geliefert_am is null;

alter table public.einkauf_posten enable row level security;

/*
  WER: wer die Anforderungen abarbeitet — Verwaltung und Leitung
  (Projektleitung, Geschäftsführung, Administration), wie beim Wareneingang.
  Die Buchhaltung und der Monteur sehen die Liste nicht.

  ÄNDERN UND LÖSCHEN NUR, SOLANGE NICHT GELIEFERT: danach liegt die Ware im
  Lager, und ein gelöschter Posten nähme sie nicht wieder heraus.
*/
drop policy if exists einkauf_posten_lesen on public.einkauf_posten;
create policy einkauf_posten_lesen on public.einkauf_posten for select
  using (app.darf(company_id) and (app.hat_rolle(array['Verwaltung']) or app.ist_fuehrung()));

drop policy if exists einkauf_posten_anlegen on public.einkauf_posten;
create policy einkauf_posten_anlegen on public.einkauf_posten for insert
  with check (app.darf(company_id) and (app.hat_rolle(array['Verwaltung']) or app.ist_fuehrung())
              and geliefert_am is null);

drop policy if exists einkauf_posten_aendern on public.einkauf_posten;
create policy einkauf_posten_aendern on public.einkauf_posten for update
  using (app.darf(company_id) and (app.hat_rolle(array['Verwaltung']) or app.ist_fuehrung())
         and geliefert_am is null)
  with check (app.darf(company_id) and (app.hat_rolle(array['Verwaltung']) or app.ist_fuehrung()));

drop policy if exists einkauf_posten_loeschen on public.einkauf_posten;
create policy einkauf_posten_loeschen on public.einkauf_posten for delete
  using (app.darf(company_id) and (app.hat_rolle(array['Verwaltung']) or app.ist_fuehrung())
         and geliefert_am is null);

grant select, insert, update, delete on public.einkauf_posten to authenticated;

drop trigger if exists einkauf_posten_updated_at on public.einkauf_posten;
create trigger einkauf_posten_updated_at before update on public.einkauf_posten
  for each row execute function app.updated_at_setzen();
drop trigger if exists einkauf_posten_betrieb_fest on public.einkauf_posten;
create trigger einkauf_posten_betrieb_fest before update on public.einkauf_posten
  for each row execute function app.betrieb_unveraenderlich();
drop trigger if exists einkauf_posten_kein_support_schreiben on public.einkauf_posten;
create trigger einkauf_posten_kein_support_schreiben before insert or update or delete on public.einkauf_posten
  for each row execute function app.support_schreibt_nicht();

/*
  GROSSHÄNDLER UND ARTIKEL MÜSSEN ZUM BETRIEB GEHÖREN. Die Fremdschlüssel
  prüfen nur, dass es sie gibt — der Name eines fremden Grosshändlers stünde
  sonst auf unserer Bestellung, und der Wareneingang buchte in ein fremdes
  Lager.
*/
create or replace function app.einkauf_posten_im_betrieb() returns trigger
  language plpgsql
  set search_path = ''
as $$
begin
  if new.supplier_id is not null and not exists (
    select 1 from public.suppliers s
     where s.id = new.supplier_id and s.company_id = new.company_id
  ) then
    raise exception 'Diesen Grosshändler gibt es im Betrieb nicht' using errcode = '23503';
  end if;
  if new.material_id is not null and not exists (
    select 1 from public.materials m
     where m.id = new.material_id and m.company_id = new.company_id
  ) then
    raise exception 'Diesen Artikel gibt es im Betrieb nicht' using errcode = '23503';
  end if;
  return new;
end;
$$;

drop trigger if exists einkauf_posten_im_betrieb on public.einkauf_posten;
create trigger einkauf_posten_im_betrieb before insert or update on public.einkauf_posten
  for each row execute function app.einkauf_posten_im_betrieb();

-- ---------------------------------------------------------------------------
-- Wareneingang — für Anforderungen UND eigene Posten
-- ---------------------------------------------------------------------------

/*
  Wie bisher, und dazu die eigenen Posten: Bestand hinein, Posten erledigt.
  Die Kennungen dürfen gemischt kommen — „Alles geliefert" bei einem
  Grosshändler meint beides. Ein Posten ohne Katalogartikel bucht keinen
  Bestand (es gibt kein Regal dafür), gilt aber als geliefert.
*/
create or replace function public.einkauf_geliefert(p_ids uuid[])
  returns integer
  language plpgsql
  set search_path = ''
as $$
declare
  a public.material_orders%rowtype;
  p public.einkauf_posten%rowtype;
  katalog uuid;
  n integer := 0;
begin
  if not (app.hat_rolle(array['Verwaltung']) or app.ist_fuehrung()) then
    raise exception 'Den Wareneingang bucht die Verwaltung oder die Leitung'
      using errcode = '42501';
  end if;
  for a in
    select * from public.material_orders
     where id = any(p_ids)
       and beschaffung = 'einkauf'
       and geliefert_am is null
       and not processed
     order by id
     for update
  loop
    katalog := coalesce(a.material_id, app.katalogeintrag(a.company_id, a.material_name));
    if katalog is not null then
      perform public.bestand_anpassen(katalog, coalesce(a.quantity, 0));
    end if;
    update public.material_orders
       set geliefert_am = now(),
           -- Wer die Bestellung vergessen hat abzuhaken, hat sie trotzdem
           -- bekommen: ohne Datum sähe die Liste aus, als wäre nie bestellt.
           bestellt_am = coalesce(bestellt_am, now()),
           material_id = coalesce(a.material_id, katalog),
           status = case when status in ('Offen', 'In Bearbeitung') then 'Abholbereit' else status end
     where id = a.id;
    n := n + 1;
  end loop;

  for p in
    select * from public.einkauf_posten
     where id = any(p_ids)
       and geliefert_am is null
     order by id
     for update
  loop
    katalog := coalesce(p.material_id, app.katalogeintrag(p.company_id, p.material_name));
    if katalog is not null then
      perform public.bestand_anpassen(katalog, p.menge);
    end if;
    update public.einkauf_posten
       set geliefert_am = now(),
           bestellt_am = coalesce(bestellt_am, now()),
           material_id = coalesce(p.material_id, katalog)
     where id = p.id;
    n := n + 1;
  end loop;
  return n;
end;
$$;

revoke all on function public.einkauf_geliefert(uuid[]) from public, anon;
grant execute on function public.einkauf_geliefert(uuid[]) to authenticated;
