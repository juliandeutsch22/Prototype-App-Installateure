-- Kunden, Baustellen, Material, Lieferanten.
--
-- Hier wird zum ersten Mal etwas RICHTIG gestellt, das Firestore nicht konnte:
-- echte Fremdschluessel. Was dabei NICHT passiert, ist genauso wichtig — siehe
-- die Anmerkung zu project_number weiter unten.

-- ---------------------------------------------------------------------------
-- Kunden
-- ---------------------------------------------------------------------------

create table customers (
  id            uuid primary key default gen_random_uuid(),
  company_id    text not null references companies (id),
  name          text not null,
  address       text,
  contact_name  text,
  contact_phone text,
  email         text,
  vat_id        text,
  notes         text,
  active        boolean not null default true,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

create index customers_betrieb on customers (company_id);

/*
  DIE SUCHE, WEGEN DER DIESER UMZUG STATTFINDET.

  Firestore konnte keine Volltextsuche; nach Kundenname und Adresse liess sich
  nur im geladenen Bestand suchen, und die Aufgabe L4 stand deshalb seit
  Wochen zurueck. Ein Trigramm-Index kann genau das, was dort unmoeglich war:
  Treffer MITTEN im Wort. „uber" findet „Familie Huber".

  Der Index steht auf name und address zusammen, weil im Buero beides in
  dasselbe Feld getippt wird.
*/
create extension if not exists pg_trgm;

create index customers_suche on customers
  using gin ((coalesce(name, '') || ' ' || coalesce(address, '')) gin_trgm_ops);

alter table customers enable row level security;

create policy customers_lesen on customers
  for select using (app.darf(company_id));

create policy customers_anlegen on customers
  for insert with check (app.darf(company_id) and app.ist_fuehrung());

create policy customers_aendern on customers
  for update using (app.darf(company_id) and app.ist_fuehrung())
  with check (app.darf(company_id) and app.ist_fuehrung());

create policy customers_loeschen on customers
  for delete using (app.darf(company_id) and app.ist_fuehrung());

create trigger customers_updated_at before update on customers
  for each row execute function app.updated_at_setzen();
create trigger customers_betrieb_fest before update on customers
  for each row execute function app.betrieb_unveraenderlich();

-- ---------------------------------------------------------------------------
-- Baustellen
-- ---------------------------------------------------------------------------

create table projects (
  id                 uuid primary key default gen_random_uuid(),
  company_id         text not null references companies (id),
  -- Der Geschaeftsschluessel, z. B. „2026-014". Er steht auf dem Schein, in
  -- der Buchung und auf der Rechnung — und wird von Hand getippt.
  project_number     text not null,
  customer_id        uuid references customers (id),
  customer_name      text not null,
  address            text,
  description        text,
  status             text not null check (status in ('Aktiv', 'Pausiert', 'Abgeschlossen')),
  billing_mode       text check (billing_mode in ('Regie', 'Pauschal')),
  estimated_hours    numeric(8,2),
  start_date         date,
  end_date           date,
  contact_name       text,
  contact_phone      text,
  assigned_employees uuid[] not null default '{}',
  project_managers   uuid[] not null default '{}',
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now()
);

create unique index projects_nummer_je_betrieb on projects (company_id, project_number);
create index projects_betrieb_status on projects (company_id, status);
create index projects_kunde on projects (customer_id);
create index projects_suche on projects
  using gin ((coalesce(project_number, '') || ' ' || coalesce(customer_name, '')
              || ' ' || coalesce(address, '')) gin_trgm_ops);

alter table projects enable row level security;

create policy projects_lesen on projects
  for select using (app.darf(company_id));
create policy projects_anlegen on projects
  for insert with check (app.darf(company_id) and app.ist_fuehrung());
create policy projects_aendern on projects
  for update using (app.darf(company_id) and app.ist_fuehrung())
  with check (app.darf(company_id) and app.ist_fuehrung());
create policy projects_loeschen on projects
  for delete using (app.darf(company_id) and app.ist_fuehrung());

create trigger projects_updated_at before update on projects
  for each row execute function app.updated_at_setzen();
create trigger projects_betrieb_fest before update on projects
  for each row execute function app.betrieb_unveraenderlich();

/*
  WARUM BUCHUNGEN NICHT MIT EINEM PFLICHT-FREMDSCHLUESSEL AN DER BAUSTELLE
  HAENGEN.

  Heute traegt jede Buchung, jede Anforderung, jeder Schein und jede Rechnung
  die getippte `projectNumber`, nicht die Id der Baustelle. Das sah nach einem
  Versaeumnis aus und ist in Wahrheit ein Ablauf: der Monteur bucht auf
  „2026-014", bevor das Buero die Baustelle angelegt hat. Macht man daraus
  einen Pflicht-Fremdschluessel, stirbt dieser Ablauf — still, und erst im
  Keller.

  Also beides: `project_number` bleibt das getippte Feld und traegt den
  Alltag, `project_id` kommt als NULLBARER Fremdschluessel dazu und wird
  aufgeloest, sobald es passt. Referenzielle Ganzheit dort, wo sie existiert;
  kein neues Hindernis dort, wo sie es nicht tut.

  Dieser Trigger haengt an jeder Tabelle mit project_number.
*/
create or replace function app.baustelle_aufloesen() returns trigger
  language plpgsql
  set search_path = ''
as $$
begin
  if new.project_number is null or new.project_number = '' then
    new.project_id := null;
  else
    select p.id into new.project_id
      from public.projects p
     where p.company_id = new.company_id
       and p.project_number = new.project_number;
  end if;
  return new;
end;
$$;

-- ---------------------------------------------------------------------------
-- Lieferanten und Preise
-- ---------------------------------------------------------------------------

/*
  DER LIEFERANT IST KEIN KIND DES ARTIKELS.

  Im ersten Entwurf hing SUPPLIERS unter MATERIALS. Das dreht die Richtung um:
  ein Grosshaendler liefert zehntausende Artikel, und derselbe Artikel kommt
  von mehreren Haendlern zu verschiedenen Preisen. Lieferanten gehoeren also
  auf Betriebsebene, und der Preis ist die VERBINDUNG aus Artikel, Lieferant
  und Gueltigkeit.

  Das jetzt richtig zu ziehen ist der Unterschied, ob der Datanorm-Import
  spaeter ein Datenladen oder eine Schemaaenderung ist: Datanorm liefert genau
  das — lieferantenspezifische Listenpreise mit Gueltigkeitsdatum.
*/
create table suppliers (
  id            uuid primary key default gen_random_uuid(),
  company_id    text not null references companies (id),
  name          text not null,
  customer_number text,
  contact_line  text,
  notes         text,
  active        boolean not null default true,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

create index suppliers_betrieb on suppliers (company_id);

alter table suppliers enable row level security;
create policy suppliers_lesen on suppliers
  for select using (app.darf(company_id));
create policy suppliers_schreiben on suppliers
  for all using (app.darf(company_id) and (app.hat_rolle(array['Verwaltung']) or app.ist_fuehrung()))
  with check (app.darf(company_id) and (app.hat_rolle(array['Verwaltung']) or app.ist_fuehrung()));

create trigger suppliers_updated_at before update on suppliers
  for each row execute function app.updated_at_setzen();
create trigger suppliers_betrieb_fest before update on suppliers
  for each row execute function app.betrieb_unveraenderlich();

-- ---------------------------------------------------------------------------
-- Material
-- ---------------------------------------------------------------------------

create table materials (
  id             uuid primary key default gen_random_uuid(),
  company_id     text not null references companies (id),
  name           text not null,
  category       text,
  stock          numeric(12,3) not null default 0,
  article_number text,
  unit           text,
  verkaufspreis  numeric(12,4),
  einkaufspreis  numeric(12,4),
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);

create index materials_betrieb on materials (company_id);
-- Der Index, der die Obergrenze aus listengrenzen.ts ueberfluessig macht:
-- eine Suche ueber 500.000 Artikel braucht keinen geladenen Bestand mehr.
create index materials_suche on materials
  using gin ((coalesce(name, '') || ' ' || coalesce(article_number, '')) gin_trgm_ops);

alter table materials enable row level security;

-- Lesen darf der ganze Betrieb — der Monteur braucht den Katalog auf der
-- Baustelle.
create policy materials_lesen on materials
  for select using (app.darf(company_id));
create policy materials_anlegen on materials
  for insert with check (app.darf(company_id)
    and (app.hat_rolle(array['Verwaltung']) or app.ist_fuehrung()));
create policy materials_aendern on materials
  for update using (app.darf(company_id))
  with check (app.darf(company_id));
create policy materials_loeschen on materials
  for delete using (app.darf(company_id)
    and (app.hat_rolle(array['Verwaltung']) or app.ist_fuehrung()));

create trigger materials_updated_at before update on materials
  for each row execute function app.updated_at_setzen();
create trigger materials_betrieb_fest before update on materials
  for each row execute function app.betrieb_unveraenderlich();

-- Artikel x Lieferant x Gueltigkeit.
create table material_prices (
  id           uuid primary key default gen_random_uuid(),
  company_id   text not null references companies (id),
  material_id  uuid not null references materials (id) on delete cascade,
  supplier_id  uuid not null references suppliers (id) on delete cascade,
  -- LISTENPREIS und EINKAUFSPREIS sind zwei verschiedene Zahlen. Datanorm
  -- liefert den Listenpreis; was der Betrieb wirklich zahlt, steht im
  -- Rabattsatz. Sie zu vermengen ist die teuerste Verwechslung in diesem
  -- ganzen Bereich — deshalb zwei Spalten und kein Kompromiss.
  listenpreis  numeric(12,4),
  rabatt_prozent numeric(6,3),
  einkaufspreis numeric(12,4),
  gueltig_ab   date not null default current_date,
  gueltig_bis  date,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

create index material_prices_artikel on material_prices (material_id, gueltig_ab desc);
create unique index material_prices_je_zeitraum
  on material_prices (material_id, supplier_id, gueltig_ab);

alter table material_prices enable row level security;
create policy material_prices_lesen on material_prices
  for select using (app.darf(company_id));
create policy material_prices_schreiben on material_prices
  for all using (app.darf(company_id) and (app.hat_rolle(array['Verwaltung']) or app.ist_fuehrung()))
  with check (app.darf(company_id) and (app.hat_rolle(array['Verwaltung']) or app.ist_fuehrung()));

create trigger material_prices_updated_at before update on material_prices
  for each row execute function app.updated_at_setzen();
create trigger material_prices_betrieb_fest before update on material_prices
  for each row execute function app.betrieb_unveraenderlich();
