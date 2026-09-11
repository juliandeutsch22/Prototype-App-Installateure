-- Das kleinste Schema, gegen das der Sperrversuch aus Stufe 0 laufen kann:
-- Betrieb, Benutzer, Zeitbuchung. Mehr nicht — Stufe 0 entscheidet, ob der
-- Umzug weitergeht, und dafuer braucht es genau den Schreibweg des Monteurs.
--
-- Die Mandantentrennung ist hier KEIN Nachtrag. Jede Tabelle traegt
-- company_id, jede Tabelle hat RLS an, und die Pruefung liest den Betrieb aus
-- dem Token — nie aus einem Feld, das der Browser mitschickt. Das ist
-- dieselbe Vertrauenskette wie heute in firestore.rules, nur an einem Ort,
-- an dem die Datenbank sie selbst durchsetzt.

create schema if not exists app;
comment on schema app is
  'Helfer fuer den Zeilenschutz. Getrennt von public, damit nichts davon '
  'ueber die REST-Schnittstelle erreichbar ist.';

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
-- Dieselbe Lesart wie ueberall sonst in der App (`u.active !== false`):
-- uebernommene Altbestaende tragen es nicht, und ein Import duerfte niemanden
-- aussperren, der nie deaktiviert wurde.
create or replace function app.aktiv() returns boolean
  language sql stable
  set search_path = ''
as $$
  select coalesce((auth.jwt() -> 'app_metadata' ->> 'active')::boolean, true)
$$;

-- Darf dieses Konto ueberhaupt etwas sehen?
create or replace function app.darf(betrieb text) returns boolean
  language sql stable
  set search_path = ''
as $$
  select app.aktiv() and app.betrieb() is not null and app.betrieb() = betrieb
$$;

-- Ohne diese beiden Zeilen ist der Zeilenschutz ein SCHLOSS OHNE TUER.
--
-- Die Richtlinien unten rufen app.darf() auf. Ruft sie ein angemeldetes Konto
-- auf, das im Schema `app` kein Betretungsrecht hat, scheitert nicht die
-- Pruefung — es scheitert der ganze Aufruf mit „permission denied for schema
-- app". Ergebnis: NICHTS geht mehr durch, auch das Erlaubte nicht. Der
-- Sperrversuch aus Stufe 0 ist genau darueber gestolpert.
grant usage on schema app to authenticated, anon, service_role;
grant execute on all functions in schema app to authenticated, anon, service_role;

-- Und dasselbe fuer alles, was in diesem Schema noch dazukommt. Ohne das
-- faellt der naechste Helfer in dieselbe Grube, nur spaeter und unauffaelliger.
alter default privileges in schema app
  grant execute on functions to authenticated, anon, service_role;

-- ---------------------------------------------------------------------------
-- Betrieb
-- ---------------------------------------------------------------------------

create table companies (
  id          text primary key,
  name        text not null,
  created_at  timestamptz not null default now()
);

alter table companies enable row level security;

create policy companies_lesen on companies
  for select using (app.darf(id));

-- Kein Schreibrecht fuer Betriebskonten: Betriebe legt die Plattform an.
-- Das entspricht betriebAnlegen in functions/src/plattform.ts.

-- ---------------------------------------------------------------------------
-- Benutzer
-- ---------------------------------------------------------------------------

create table users (
  id          uuid primary key references auth.users (id) on delete cascade,
  company_id  text not null references companies (id),
  name        text not null,
  role        text not null check (role in ('Administrator', 'Büro', 'Monteur')),
  active      boolean not null default true,
  created_at  timestamptz not null default now()
);

create index users_betrieb on users (company_id);

alter table users enable row level security;

create policy users_lesen on users
  for select using (app.darf(company_id));

-- ---------------------------------------------------------------------------
-- Zeitbuchung
-- ---------------------------------------------------------------------------

-- Die LEBENDE Buchung — nicht zu verwechseln mit den eingefrorenen Zeiten auf
-- einem unterschriebenen Handwerksschein. Die beiden duerfen auseinander
-- laufen; genau darauf beruht die Meldung „Scheine warten noch auf deine
-- Zeitbuchung". Siehe docs/MIGRATION-SUPABASE.md.
create table time_entries (
  -- Die Kennung kommt VOM GERAET, nicht aus der Datenbank.
  --
  -- Das ist die Bedingung fuer das Nachsenden ohne Empfang: nur wenn der
  -- Monteur die Kennung schon kennt, bevor der Server sie bestaetigt, kann
  -- derselbe Vorgang zweimal ankommen, ohne zweimal zu landen.
  id            uuid primary key,
  company_id    text not null references companies (id),
  user_id       uuid not null references users (id),
  date          date not null,
  status        text not null check (status in ('Anwesend', 'Krank', 'Urlaub')),
  start_time    time,
  end_time      time,
  break_minutes integer not null default 0 check (break_minutes >= 0),
  project_number text,
  comment       text,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

create index time_entries_betrieb_datum on time_entries (company_id, date desc);
create index time_entries_person_datum on time_entries (company_id, user_id, date desc);

alter table time_entries enable row level security;

-- Lesen: der eigene Betrieb. Ein Monteur sieht heute die Zeiten der Kollegen
-- in der Einsatzplanung, deshalb ist das hier nicht auf die eigene Person
-- eingeengt — dieselbe Reichweite wie in firestore.rules.
create policy time_entries_lesen on time_entries
  for select using (app.darf(company_id));

-- Anlegen: nur im eigenen Betrieb, und ein Monteur nur fuer sich selbst.
create policy time_entries_anlegen on time_entries
  for insert with check (
    app.darf(company_id)
    and (app.rolle() in ('Administrator', 'Büro') or user_id = auth.uid())
  );

create policy time_entries_aendern on time_entries
  for update
  using (
    app.darf(company_id)
    and (app.rolle() in ('Administrator', 'Büro') or user_id = auth.uid())
  )
  with check (
    app.darf(company_id)
    and (app.rolle() in ('Administrator', 'Büro') or user_id = auth.uid())
  );

create policy time_entries_loeschen on time_entries
  for delete using (
    app.darf(company_id)
    and (app.rolle() in ('Administrator', 'Büro') or user_id = auth.uid())
  );

-- updated_at von Hand zu setzen hiesse, sich auf den Browser zu verlassen —
-- und der Browser eines nachsendenden Geraets hat eine Uhr von gestern.
create or replace function app.updated_at_setzen() returns trigger
  language plpgsql
  set search_path = ''
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

create trigger time_entries_updated_at
  before update on time_entries
  for each row execute function app.updated_at_setzen();
