-- Materialanforderung, Ruestliste, Wartung, Folgetermin, Einstellungen,
-- Nachtlauf-Protokoll — und die Plattformverwaltung, die als einzige
-- OBERHALB des Betriebs steht.

-- ---------------------------------------------------------------------------
-- Materialanforderung
-- ---------------------------------------------------------------------------

create table material_orders (
  id               uuid primary key,
  company_id       text not null references companies (id),
  material_id      uuid references materials (id),
  material_name    text not null,
  quantity         numeric(12,3) not null,
  note             text,
  project_number   text,
  project_id       uuid references projects (id),
  status           text not null check (status in ('Offen', 'In Bearbeitung', 'Abholbereit', 'Erledigt')),
  is_urgent        boolean not null default false,
  transaction_type text not null check (transaction_type in ('order', 'return')),
  -- Nur bei Retoure: in welchem Zustand kommt der Artikel zurueck.
  condition        text,
  user_id          uuid not null references users (id),
  user_name        text,
  -- Der Lagerabzug-Riegel: er verhindert, dass zwei gleichzeitige Abschluesse
  -- doppelt abziehen.
  processed        boolean not null default false,
  is_billed        boolean not null default false,
  invoice_number   text,
  source           text check (source in ('manual', 'voice')),
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);

create index material_orders_betrieb_stand on material_orders (company_id, status, created_at desc);
create index material_orders_person on material_orders (company_id, user_id, created_at desc);
create index material_orders_suche on material_orders
  using gin ((coalesce(material_name, '') || ' ' || coalesce(user_name, '')
              || ' ' || coalesce(project_number, '') || ' ' || coalesce(note, '')) gin_trgm_ops);

alter table material_orders enable row level security;

create policy material_orders_lesen on material_orders
  for select using (app.darf(company_id)
    and (user_id = auth.uid()
         or app.hat_rolle(array['Verwaltung', 'Buchhaltung'])
         or app.ist_fuehrung()));

-- Anfordern darf jeder, aber nur auf den eigenen Namen und nie schon
-- verrechnet.
create policy material_orders_anlegen on material_orders
  for insert with check (app.darf(company_id)
    and user_id = auth.uid()
    and is_billed = false and coalesce(invoice_number, '') = '');

create policy material_orders_aendern on material_orders
  for update using (app.darf(company_id)
    and (app.hat_rolle(array['Verwaltung', 'Buchhaltung']) or app.ist_fuehrung()
         or user_id = auth.uid()))
  with check (app.darf(company_id)
    and (app.hat_rolle(array['Verwaltung', 'Buchhaltung']) or app.ist_fuehrung()
         or user_id = auth.uid()));

create policy material_orders_loeschen on material_orders
  for delete using (app.darf(company_id)
    and (app.hat_rolle(array['Verwaltung']) or app.ist_fuehrung()));

create trigger material_orders_updated_at before update on material_orders
  for each row execute function app.updated_at_setzen();
create trigger material_orders_betrieb_fest before update on material_orders
  for each row execute function app.betrieb_unveraenderlich();
create trigger material_orders_verrechnung before update on material_orders
  for each row execute function app.verrechnung_geschuetzt();
create trigger material_orders_baustelle before insert or update on material_orders
  for each row execute function app.baustelle_aufloesen();

-- ---------------------------------------------------------------------------
-- Ruestliste
-- ---------------------------------------------------------------------------

/*
  NICHT ZU VERWECHSELN MIT DEM MATERIAL AM SCHEIN.

  Die Ruestliste sagt, was fuer einen Einsatz EINGELADEN werden soll; das
  Material am Schein sagt, was VERBAUT wurde. Beide Listen sehen gleich aus
  und meinen Verschiedenes — im ersten Entwurf des Datenmodells fehlte die
  Ruestliste deshalb ganz.
*/
create table einsatz_material (
  id             uuid primary key default gen_random_uuid(),
  company_id     text not null references companies (id),
  date           date not null,
  project_number text not null,
  project_id     uuid references projects (id),
  uids           uuid[] not null default '{}',
  -- Wer was wann eingeladen hat: { uid: { von, am } }.
  geladen        jsonb not null default '{}'::jsonb,
  updated_by     text,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),
  unique (company_id, date, project_number)
);

create index einsatz_material_betrieb_datum on einsatz_material (company_id, date);

create table einsatz_material_positionen (
  id                uuid primary key default gen_random_uuid(),
  company_id        text not null references companies (id),
  einsatz_material_id uuid not null references einsatz_material (id) on delete cascade,
  position          integer not null,
  material_id       uuid references materials (id),
  name              text not null,
  menge             numeric(12,3) not null,
  einheit           text
);

create index einsatz_material_positionen_kopf
  on einsatz_material_positionen (einsatz_material_id, position);

alter table einsatz_material enable row level security;
alter table einsatz_material_positionen enable row level security;

create policy einsatz_material_lesen on einsatz_material
  for select using (app.darf(company_id));
create policy einsatz_material_anlegen on einsatz_material
  for insert with check (app.darf(company_id) and app.ist_fuehrung());
-- Aendern darf der ganze Betrieb: der Monteur hakt ab, was er eingeladen hat.
create policy einsatz_material_aendern on einsatz_material
  for update using (app.darf(company_id)) with check (app.darf(company_id));
create policy einsatz_material_loeschen on einsatz_material
  for delete using (app.darf(company_id) and app.ist_fuehrung());

create policy einsatz_material_positionen_lesen on einsatz_material_positionen
  for select using (app.darf(company_id));
create policy einsatz_material_positionen_schreiben on einsatz_material_positionen
  for all using (app.darf(company_id) and app.ist_fuehrung())
  with check (app.darf(company_id) and app.ist_fuehrung());

create trigger einsatz_material_updated_at before update on einsatz_material
  for each row execute function app.updated_at_setzen();
create trigger einsatz_material_betrieb_fest before update on einsatz_material
  for each row execute function app.betrieb_unveraenderlich();
create trigger einsatz_material_baustelle before insert or update on einsatz_material
  for each row execute function app.baustelle_aufloesen();

-- ---------------------------------------------------------------------------
-- Wiederkehrende Wartung
-- ---------------------------------------------------------------------------

create table wartungen (
  id                uuid primary key default gen_random_uuid(),
  company_id        text not null references companies (id),
  customer_id       uuid not null references customers (id),
  customer_name     text not null,
  anlage            text not null,
  address           text,
  intervall_monate  integer not null check (intervall_monate > 0),
  zuletzt_am        date,
  faellig_am        date not null,
  aktiv             boolean not null default true,
  hinweis           text,
  letzte_baustelle  text,
  offene_baustelle  text,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);

create index wartungen_faellig on wartungen (company_id, faellig_am) where aktiv;
create index wartungen_suche on wartungen
  using gin ((coalesce(customer_name, '') || ' ' || coalesce(anlage, '')
              || ' ' || coalesce(address, '')) gin_trgm_ops);

alter table wartungen enable row level security;
create policy wartungen_lesen on wartungen
  for select using (app.darf(company_id));
create policy wartungen_schreiben on wartungen
  for all using (app.darf(company_id) and app.ist_fuehrung())
  with check (app.darf(company_id) and app.ist_fuehrung());

create trigger wartungen_updated_at before update on wartungen
  for each row execute function app.updated_at_setzen();
create trigger wartungen_betrieb_fest before update on wartungen
  for each row execute function app.betrieb_unveraenderlich();

-- ---------------------------------------------------------------------------
-- Folgetermin
-- ---------------------------------------------------------------------------

create table follow_ups (
  id             uuid primary key default gen_random_uuid(),
  company_id     text not null references companies (id),
  project_number text,
  project_id     uuid references projects (id),
  title          text not null,
  -- ISO-Woche, z. B. „2026-W26".
  due_week       text,
  created_from   text not null check (created_from in ('voice', 'manual')),
  done           boolean not null default false,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);

create index follow_ups_offen on follow_ups (company_id, due_week) where not done;

alter table follow_ups enable row level security;
create policy follow_ups_lesen on follow_ups
  for select using (app.darf(company_id));
create policy follow_ups_schreiben on follow_ups
  for all using (app.darf(company_id)) with check (app.darf(company_id));

create trigger follow_ups_updated_at before update on follow_ups
  for each row execute function app.updated_at_setzen();
create trigger follow_ups_betrieb_fest before update on follow_ups
  for each row execute function app.betrieb_unveraenderlich();
create trigger follow_ups_baustelle before insert or update on follow_ups
  for each row execute function app.baustelle_aufloesen();

-- ---------------------------------------------------------------------------
-- Persoenliche Einstellungen
-- ---------------------------------------------------------------------------

create table user_prefs (
  user_id               uuid primary key references users (id) on delete cascade,
  company_id            text not null references companies (id),
  notify_new_order      boolean not null default false,
  notify_order_ready    boolean not null default false,
  notify_urgent_delivery boolean not null default false,
  push_tokens           text[] not null default '{}',
  updated_at            timestamptz not null default now()
);

alter table user_prefs enable row level security;

-- Die eigenen Einstellungen, und nur die eigenen. Ein Vorgesetzter hat hier
-- nichts zu suchen: die Push-Marken eines anderen Geraets gehen ihn nichts an.
create policy user_prefs_lesen on user_prefs
  for select using (app.darf(company_id) and user_id = auth.uid());
create policy user_prefs_anlegen on user_prefs
  for insert with check (app.darf(company_id) and user_id = auth.uid());
create policy user_prefs_aendern on user_prefs
  for update using (app.darf(company_id) and user_id = auth.uid())
  with check (app.darf(company_id) and user_id = auth.uid());

-- KEIN Loeschen. Die Einstellungen gehoeren zum Konto; ein geloeschtes Konto
-- raeumt sie per Fremdschluessel selbst weg. Ein Loeschrecht hier brauchte
-- niemand und waere nur ein Weg, sich unbemerkt von Benachrichtigungen
-- abzumelden.


create trigger user_prefs_updated_at before update on user_prefs
  for each row execute function app.updated_at_setzen();

-- ---------------------------------------------------------------------------
-- Nachtlauf-Protokoll
-- ---------------------------------------------------------------------------

create table system_laeufe (
  company_id       text not null references companies (id),
  art              text not null check (art in ('ausleitung', 'bilanzen')),
  zuletzt_erfolg   timestamptz,
  zuletzt_versuch  timestamptz,
  erfolg           boolean,
  meldung          text,
  kennzahl         numeric(14,2),
  kennzahl_einheit text,
  -- Liegt die Sicherung AUSSERHALB des Projekts, in dem die Daten liegen?
  ausser_haus      boolean,
  updated_at       timestamptz not null default now(),
  primary key (company_id, art)
);

alter table system_laeufe enable row level security;

-- Lesen nur die Spitze, schreiben nur der Server (kein Richtlinieneintrag
-- fuer insert/update — die Nachtlaeufe laufen mit dem Dienstschluessel).
create policy system_laeufe_lesen on system_laeufe
  for select using (app.darf(company_id) and app.ist_spitze());

-- ---------------------------------------------------------------------------
-- Die Plattform — OBERHALB des Betriebs
-- ---------------------------------------------------------------------------

/*
  DIESE BEIDEN TABELLEN TRAGEN KEIN company_id. ABSICHT.

  Ein globaler Administrator gehoert zu keinem Betrieb; er legt Betriebe an.
  Gaebe man ihm ein company_id, waere er ploetzlich Mitglied eines Mandanten —
  und die Trennung, die das ganze System traegt, haette eine Ausnahme.

  In Firestore waren diese Sammlungen dicht, weil GAR KEINE Regel auf sie
  passte: was nicht erlaubt ist, ist verboten. In Postgres ist das ebenso —
  RLS ohne Richtlinie verweigert alles. Der Unterschied: hier steht es
  ausdruecklich da, statt durch Abwesenheit zu gelten.
*/
create table platform_admins (
  id         uuid primary key references auth.users (id) on delete cascade,
  name       text,
  created_at timestamptz not null default now()
);

create table betriebsanlagen (
  company_id      text primary key,
  name            text not null,
  angelegt_von    uuid not null,
  angelegt_am     timestamptz not null default now(),
  erster_admin_uid uuid not null
);

alter table platform_admins enable row level security;
alter table betriebsanlagen enable row level security;

-- KEINE Richtlinie. Weder ein Betriebskonto noch ein Plattformkonto kommt
-- ueber die Schnittstelle daran; gelesen und geschrieben wird ausschliesslich
-- serverseitig mit dem Dienstschluessel. Genau wie heute.

-- ---------------------------------------------------------------------------
-- Live-Abonnements
-- ---------------------------------------------------------------------------

/*
  Eine Tabelle meldet ihre Aenderungen nur, wenn sie hier steht — das ist der
  Ersatz fuer onSnapshot.

  WICHTIG UND LEICHT ZU UEBERSEHEN: der Zeilenschutz gilt auch hier, aber er
  wird je Empfaenger und je Zeile ausgewertet. Eine Tabelle versehentlich ohne
  passende Lese-Richtlinie zu veroeffentlichen hiesse, jede Aenderung an JEDEN
  angemeldeten Empfaenger zu schicken — quer durch alle Betriebe, ohne dass je
  eine Abfrage etwas Falsches zurueckgaebe. Deshalb steht hier jede Tabelle
  einzeln und nie ein „alle Tabellen", und es stehen hier nur die elf, die in
  der App wirklich ein Abo haben.
*/
alter publication supabase_realtime add table time_entries;
alter publication supabase_realtime add table assignments;
alter publication supabase_realtime add table material_orders;
alter publication supabase_realtime add table materials;
alter publication supabase_realtime add table einsatz_material;
alter publication supabase_realtime add table projects;
alter publication supabase_realtime add table invoices;
alter publication supabase_realtime add table user_prefs;

-- Ohne das traegt eine Aenderungsmeldung nur die geaenderten Felder und den
-- Schluessel. Fuer die Mandantenpruefung braucht der Empfaenger aber
-- company_id — auch dann, wenn sich company_id gar nicht geaendert hat.
alter table time_entries replica identity full;
alter table assignments replica identity full;
alter table material_orders replica identity full;
alter table materials replica identity full;
alter table einsatz_material replica identity full;
alter table projects replica identity full;
alter table invoices replica identity full;
alter table user_prefs replica identity full;
