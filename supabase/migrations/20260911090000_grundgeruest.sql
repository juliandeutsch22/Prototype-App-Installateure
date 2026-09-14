-- Das Fundament: Betrieb, Benutzer, und die Frage „wer darf was".
--
-- Die Mandantentrennung ist hier KEIN Nachtrag. Jede Tabelle traegt
-- company_id, jede Tabelle hat RLS an, und die Pruefung liest den Betrieb aus
-- dem Token — nie aus einem Feld, das der Browser mitschickt. Dieselbe
-- Vertrauenskette wie in firestore.rules, nur an einem Ort, an dem die
-- Datenbank sie selbst durchsetzt.

create schema if not exists app;
comment on schema app is
  'Helfer fuer den Zeilenschutz. Getrennt von public, damit nichts davon '
  'ueber die REST-Schnittstelle erreichbar ist.';

-- Ohne diese Zuweisungen ist der Zeilenschutz ein SCHLOSS OHNE TUER.
--
-- Die Richtlinien rufen app.darf() auf. Ruft sie ein angemeldetes Konto auf,
-- das im Schema `app` kein Betretungsrecht hat, scheitert nicht die Pruefung
-- — es scheitert der ganze Aufruf mit „permission denied for schema app".
-- Ergebnis: NICHTS geht mehr durch, auch das Erlaubte nicht. Der Sperrversuch
-- aus Stufe 0 ist genau darueber gestolpert.
grant usage on schema app to authenticated, anon, service_role;
alter default privileges in schema app
  grant execute on functions to authenticated, anon, service_role;

-- ---------------------------------------------------------------------------
-- Was im Token steht
-- ---------------------------------------------------------------------------

-- Der Betrieb des angemeldeten Kontos.
--
-- Die Claims liegen unter app_metadata, weil NUR der Server dorthin schreiben
-- darf: user_metadata kann jedes angemeldete Konto selbst aendern, und damit
-- waere die Mandantentrennung eine Zeile JavaScript weit entfernt. Das ist
-- die Entsprechung zu den Firebase Custom Claims aus functions/src/claims.ts.
create or replace function app.betrieb() returns text
  language sql stable
  set search_path = ''
as $$
  select nullif(auth.jwt() -> 'app_metadata' ->> 'company_id', '')
$$;

create or replace function app.rolle() returns text
  language sql stable
  set search_path = ''
as $$
  select nullif(auth.jwt() -> 'app_metadata' ->> 'role', '')
$$;

-- Fehlt das Feld, gilt AKTIV.
--
-- Dieselbe Lesart wie ueberall sonst in der App (`u.active !== false`) und
-- wie in firestore.rules: uebernommene Altbestaende tragen es nicht, und ein
-- Import duerfte niemanden aussperren, der nie deaktiviert wurde.
create or replace function app.aktiv() returns boolean
  language sql stable
  set search_path = ''
as $$
  select coalesce((auth.jwt() -> 'app_metadata' ->> 'active')::boolean, true)
$$;

-- Angemeldet UND nicht deaktiviert — die Entsprechung zu signedIn().
create or replace function app.angemeldet() returns boolean
  language sql stable
  set search_path = ''
as $$
  select auth.uid() is not null and app.aktiv()
$$;

-- Gehoert diese Zeile meinem Betrieb, und darf ich ueberhaupt?
create or replace function app.darf(betrieb text) returns boolean
  language sql stable
  set search_path = ''
as $$
  select app.angemeldet() and app.betrieb() is not null and app.betrieb() = betrieb
$$;

-- ---------------------------------------------------------------------------
-- Die Rollen — wortgleich zu firestore.rules
-- ---------------------------------------------------------------------------

create or replace function app.hat_rolle(rollen text[]) returns boolean
  language sql stable
  set search_path = ''
as $$
  select app.angemeldet() and app.rolle() = any(rollen)
$$;

/*
  Die drei Gruppen aus firestore.rules, namensgleich uebernommen. Sie einzeln
  auszuschreiben waere kuerzer zu lesen und teurer zu pflegen: aendert sich,
  wer „Fuehrung" ist, soll das an EINER Stelle stehen und nicht in vierzig
  Richtlinien verstreut.
*/
create or replace function app.ist_fuehrung() returns boolean
  language sql stable
  set search_path = ''
as $$
  select app.hat_rolle(array['Projektleiter', 'Geschäftsführung', 'Administrator'])
$$;

create or replace function app.ist_spitze() returns boolean
  language sql stable
  set search_path = ''
as $$
  select app.hat_rolle(array['Geschäftsführung', 'Administrator'])
$$;

create or replace function app.ist_buch_oder_spitze() returns boolean
  language sql stable
  set search_path = ''
as $$
  select app.hat_rolle(array['Buchhaltung', 'Geschäftsführung', 'Administrator'])
$$;

grant execute on all functions in schema app to authenticated, anon, service_role;

-- ---------------------------------------------------------------------------
-- Zwei Helfer, die jede Tabelle braucht
-- ---------------------------------------------------------------------------

create or replace function app.updated_at_setzen() returns trigger
  language plpgsql
  set search_path = ''
as $$
begin
  -- Von Hand gesetzt hiesse, sich auf den Browser zu verlassen — und der
  -- Browser eines nachsendenden Geraets hat eine Uhr von gestern.
  new.updated_at := now();
  return new;
end;
$$;

/*
  DER BETRIEB EINER ZEILE AENDERT SICH NIE.

  In firestore.rules stand dafuer companyUnchanged(). In Postgres geht das
  NICHT als Richtlinie: `using` sieht die alte Zeile, `with check` die neue,
  aber keine von beiden sieht beide. Ein Trigger schon — und er wirkt auf
  jedem Weg, auch auf dem, den morgen jemand hinzufuegt.
*/
create or replace function app.betrieb_unveraenderlich() returns trigger
  language plpgsql
  set search_path = ''
as $$
begin
  if new.company_id is distinct from old.company_id then
    raise exception 'Der Betrieb einer Zeile laesst sich nicht aendern (% -> %)',
      old.company_id, new.company_id
      using errcode = '42501';
  end if;
  return new;
end;
$$;

-- ---------------------------------------------------------------------------
-- Betrieb
-- ---------------------------------------------------------------------------

create table companies (
  id                  text primary key,
  name                text not null,
  brand_color         text,
  brand_foreground    text,
  accent_color        text,
  accent_foreground   text,
  logo_url            text,
  address_line        text,
  contact_line        text,
  iban                text,
  bic                 text,
  bank_name           text,
  vat_id              text,
  company_register    text,
  -- Saetze und Module bleiben ein JSON-Feld: sie sind Einstellungen, keine
  -- Geschaeftsdaten. Wer danach filtert oder summiert, hat etwas falsch
  -- verstanden — und eine eigene Tabelle je Satz waere Buchhaltung ueber
  -- Buchhaltung.
  rates               jsonb,
  cost_rates          jsonb,
  vacation_approvers  uuid[] not null default '{}',
  modules             jsonb,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now()
);

alter table companies enable row level security;

create policy companies_lesen on companies
  for select using (app.darf(id));

-- Aendern nur die Spitze, und nur den eigenen Betrieb. Anlegen und Loeschen
-- gar nicht: Betriebe legt die Plattform an (betriebAnlegen).
create policy companies_aendern on companies
  for update using (app.darf(id) and app.ist_spitze())
  with check (app.darf(id) and app.ist_spitze());

create trigger companies_updated_at
  before update on companies
  for each row execute function app.updated_at_setzen();

-- ---------------------------------------------------------------------------
-- Benutzer
-- ---------------------------------------------------------------------------

/*
  EINE TABELLE, NICHT ZWEI.

  Ein Lehrbuch trennte hier Zugang (USERS) und Person (EMPLOYEES). Das kostet
  hier einen Verbund in fast jeder Abfrage und schafft eine neue Fehlerklasse
  — „Mitarbeiter ohne Konto" — fuer einen Fall, den es nicht gibt: jeder
  Monteur meldet sich an. Getrennt wird an dem Tag, an dem jemand ohne Zugang
  auf einem Schein auftaucht.

  Der Schluessel ist die Auth-Kennung. In Firestore gab es zusaetzlich eine
  Dokument-Id; die war nie etwas anderes als ein zweiter Name fuer dieselbe
  Person und faellt weg.
*/
create table users (
  id                    uuid primary key references auth.users (id) on delete cascade,
  company_id            text not null references companies (id),
  name                  text not null,
  email                 text not null,
  role                  text not null check (role in (
                          'Mitarbeiter', 'Verwaltung', 'Buchhaltung',
                          'Projektleiter', 'Geschäftsführung', 'Administrator')),
  active                boolean not null default true,
  weekly_target_hours   numeric(5,2),
  yearly_vacation_days  integer,
  initial_overtime      numeric(8,2),
  app_start_date        date,
  -- 0=So..6=Sa. Ein Array ist hier richtig: es ist eine Eigenschaft der
  -- Person, nach der nie gesucht wird.
  work_days             smallint[] not null default '{1,2,3,4,5}',
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now()
);

create index users_betrieb on users (company_id);
create unique index users_email_je_betrieb on users (company_id, lower(email));

alter table users enable row level security;

create policy users_lesen on users
  for select using (app.darf(company_id));

create policy users_anlegen on users
  for insert with check (app.darf(company_id) and app.ist_spitze());

create policy users_aendern on users
  for update using (app.darf(company_id) and app.ist_spitze())
  with check (app.darf(company_id) and app.ist_spitze());

create policy users_loeschen on users
  for delete using (app.darf(company_id) and app.ist_spitze());

create trigger users_updated_at
  before update on users
  for each row execute function app.updated_at_setzen();

create trigger users_betrieb_fest
  before update on users
  for each row execute function app.betrieb_unveraenderlich();
