-- Zeitbuchung, Urlaub, Einsatz, Handwerksschein, Materialanforderung, Ruestliste.
--
-- HIER STEHT DIE FOLGENREICHSTE ENTSCHEIDUNG DES GANZEN UMZUGS, und zwar bei
-- den Scheinpositionen weiter unten. Kurz: was auf einem unterschriebenen
-- Beleg steht, ist eine KOPIE und kein Verweis.

-- ---------------------------------------------------------------------------
-- Zeitbuchung — die LEBENDE Buchung
-- ---------------------------------------------------------------------------

create table time_entries (
  /*
    Die Kennung kommt VOM GERAET, nicht aus der Datenbank.

    Das ist die Bedingung fuer das Nachsenden ohne Empfang (Stufe 0): nur wenn
    der Monteur die Kennung seiner Zeile schon kennt, bevor der Server sie
    bestaetigt hat, kann derselbe Vorgang zweimal ankommen, ohne zweimal zu
    landen.
  */
  id               uuid primary key,
  company_id       text not null references companies (id),
  user_id          uuid not null references users (id),
  date             date not null,
  status           text not null check (status in ('Anwesend', 'Krank', 'Urlaub')),
  start_time       time,
  end_time         time,
  break_duration   integer not null default 0 check (break_duration >= 0),
  travel_time      integer check (travel_time >= 0),
  -- Direkt gesetzte Stunden (v. a. Sprach-Eintraege). Greift nur, wenn keine
  -- Zeitspanne gesetzt ist — siehe calcWorkMin.
  hours            numeric(6,2),
  is_night_work    boolean not null default false,
  is_emergency     boolean not null default false,
  customer_name    text,
  project_number   text,
  project_id       uuid references projects (id),
  helper_name      text,
  vehicle_plate    text,
  comment          text,
  is_helper        boolean not null default false,
  user_name        text,
  source           text check (source in ('manual', 'voice')),
  is_billed        boolean not null default false,
  invoice_number   text,
  -- Aus welchem genehmigten Urlaubsantrag dieser Eintrag entstanden ist. Wird
  -- ein Urlaub storniert, sind daran genau die Tage zu finden, die wieder
  -- verschwinden muessen — ohne dass ein von Hand gebuchter Urlaubstag
  -- mitgeloescht wird.
  vacation_id      uuid,
  last_edited_by   text,
  last_edited_by_uid uuid,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);

create index time_entries_betrieb_datum on time_entries (company_id, date desc);
create index time_entries_person_datum on time_entries (company_id, user_id, date desc);
create index time_entries_baustelle on time_entries (company_id, project_number, date desc);
create index time_entries_urlaub on time_entries (vacation_id) where vacation_id is not null;

alter table time_entries enable row level security;

-- Wortgleich zu firestore.rules: die eigene Buchung oder Buchhaltung/Spitze.
create policy time_entries_lesen on time_entries
  for select using (app.darf(company_id)
    and (user_id = auth.uid() or app.ist_buch_oder_spitze()));

create policy time_entries_anlegen on time_entries
  for insert with check (app.darf(company_id)
    and (app.ist_buch_oder_spitze()
         or (user_id = auth.uid() and is_billed = false and coalesce(invoice_number, '') = '')));

create policy time_entries_aendern on time_entries
  for update using (app.darf(company_id)
    and (user_id = auth.uid() or app.ist_buch_oder_spitze()))
  with check (app.darf(company_id)
    and (user_id = auth.uid() or app.ist_buch_oder_spitze()));

create policy time_entries_loeschen on time_entries
  for delete using (app.darf(company_id)
    and (user_id = auth.uid() or app.ist_buch_oder_spitze()));

/*
  WER NICHT VERRECHNET, AENDERT AUCH NICHTS AN DER VERRECHNUNG.

  In firestore.rules hiess das aendertVerrechnung(). Als Richtlinie geht es
  nicht — dafuer muesste eine Regel alte und neue Zeile gleichzeitig sehen.
  Als Trigger geht es, und zwar auf jedem Weg.
*/
create or replace function app.verrechnung_geschuetzt() returns trigger
  language plpgsql
  set search_path = ''
as $$
begin
  if (new.is_billed is distinct from old.is_billed
      or new.invoice_number is distinct from old.invoice_number)
     and not app.ist_buch_oder_spitze() then
    raise exception 'Nur die Buchhaltung darf den Verrechnungsstand aendern'
      using errcode = '42501';
  end if;
  return new;
end;
$$;

create trigger time_entries_updated_at before update on time_entries
  for each row execute function app.updated_at_setzen();
create trigger time_entries_betrieb_fest before update on time_entries
  for each row execute function app.betrieb_unveraenderlich();
create trigger time_entries_verrechnung before update on time_entries
  for each row execute function app.verrechnung_geschuetzt();
create trigger time_entries_baustelle before insert or update on time_entries
  for each row execute function app.baustelle_aufloesen();

-- ---------------------------------------------------------------------------
-- Urlaub
-- ---------------------------------------------------------------------------

create table vacations (
  id                 uuid primary key default gen_random_uuid(),
  company_id         text not null references companies (id),
  user_id            uuid not null references users (id),
  user_name          text not null,
  von                date not null,
  bis                date not null,
  tage               numeric(5,1) not null,
  status             text not null check (status in ('Beantragt', 'Genehmigt', 'Abgelehnt', 'Storniert')),
  notiz              text,
  entschieden_von_uid uuid,
  entschieden_von_name text,
  entschieden_am     timestamptz,
  grund              text,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now(),
  constraint vacations_zeitraum check (bis >= von)
);

create index vacations_betrieb_person on vacations (company_id, user_id, von desc);
create index vacations_offen on vacations (company_id, status) where status = 'Beantragt';

alter table vacations enable row level security;

create policy vacations_lesen on vacations
  for select using (app.darf(company_id)
    and (user_id = auth.uid() or app.ist_fuehrung() or app.ist_buch_oder_spitze()));

-- Beantragen darf jeder, aber nur fuer sich und nur als „Beantragt".
create policy vacations_anlegen on vacations
  for insert with check (app.darf(company_id)
    and user_id = auth.uid() and status = 'Beantragt');

create policy vacations_aendern on vacations
  for update using (app.darf(company_id)
    and (user_id = auth.uid() or app.ist_fuehrung() or app.ist_buch_oder_spitze()))
  with check (app.darf(company_id)
    and (user_id = auth.uid() or app.ist_fuehrung() or app.ist_buch_oder_spitze()));

-- Zuruecknehmen nur, solange noch nicht entschieden ist.
create policy vacations_loeschen on vacations
  for delete using (app.darf(company_id) and user_id = auth.uid() and status = 'Beantragt');

/*
  UEBER DEN EIGENEN URLAUB ENTSCHEIDET MAN NICHT SELBST.

  Der Antragsteller darf seinen Antrag zuruecknehmen (Status „Storniert"),
  aber nicht genehmigen oder ablehnen. Das stand in firestore.rules als
  darfUrlaubEntscheiden() und ist hier ein Trigger, weil es den Statuswechsel
  vergleicht — also alte und neue Zeile braucht.
*/
create or replace function app.urlaub_entscheidung_geschuetzt() returns trigger
  language plpgsql
  set search_path = ''
as $$
begin
  if new.status is distinct from old.status
     and new.status in ('Genehmigt', 'Abgelehnt')
     and not (app.ist_fuehrung() or app.ist_spitze()) then
    raise exception 'Nur die Führung entscheidet über einen Urlaubsantrag'
      using errcode = '42501';
  end if;
  return new;
end;
$$;

create trigger vacations_updated_at before update on vacations
  for each row execute function app.updated_at_setzen();
create trigger vacations_betrieb_fest before update on vacations
  for each row execute function app.betrieb_unveraenderlich();
create trigger vacations_entscheidung before update on vacations
  for each row execute function app.urlaub_entscheidung_geschuetzt();

alter table time_entries
  add constraint time_entries_urlaub_fk
  foreign key (vacation_id) references vacations (id) on delete set null;

-- ---------------------------------------------------------------------------
-- Einsatzplanung
-- ---------------------------------------------------------------------------

create table assignments (
  id             uuid primary key default gen_random_uuid(),
  company_id     text not null references companies (id),
  date           date not null,
  project_number text not null,
  project_id     uuid references projects (id),
  user_id        uuid not null references users (id),
  user_name      text,
  as_helper      boolean not null default false,
  comment        text,
  created_by     text,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);

create index assignments_betrieb_datum on assignments (company_id, date);
create index assignments_person_datum on assignments (company_id, user_id, date);

alter table assignments enable row level security;

create policy assignments_lesen on assignments
  for select using (app.darf(company_id));
create policy assignments_schreiben on assignments
  for all using (app.darf(company_id) and app.ist_fuehrung())
  with check (app.darf(company_id) and app.ist_fuehrung());

create trigger assignments_updated_at before update on assignments
  for each row execute function app.updated_at_setzen();
create trigger assignments_betrieb_fest before update on assignments
  for each row execute function app.betrieb_unveraenderlich();
create trigger assignments_baustelle before insert or update on assignments
  for each row execute function app.baustelle_aufloesen();

-- ---------------------------------------------------------------------------
-- Handwerksschein
-- ---------------------------------------------------------------------------

create table work_sheets (
  id                 uuid primary key,
  company_id         text not null references companies (id),
  project_number     text not null,
  project_id         uuid references projects (id),
  customer_id        uuid references customers (id),
  customer_name      text not null,
  -- Die Adresse ZUM ZEITPUNKT DER UNTERSCHRIFT. Zieht der Kunde um, bleibt
  -- auf dem unterschriebenen Beleg die alte stehen — so gehoert sich das.
  address            text,
  datum              date not null,
  status             text not null check (status in ('Entwurf', 'Unterschrieben', 'Storniert', 'Verworfen')),
  abrechnung         text not null check (abrechnung in ('Regie', 'Pauschal')),
  notizen            text,
  erstellt_von_uid   uuid not null,
  erstellt_von_name  text not null,
  unterschrift_monteur jsonb,
  unterschrift_kunde   jsonb,
  -- SHA-256 ueber den eingefrorenen Inhalt, serverseitig gerechnet. Der
  -- eigentliche Manipulationsschutz.
  inhalt_hash        text,
  unterschrieben_am  timestamptz,
  storno_grund       text,
  storniert_von_name text,
  verworfen_von_name text,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now()
);

create index work_sheets_betrieb_datum on work_sheets (company_id, datum desc);
create index work_sheets_baustelle on work_sheets (company_id, project_number);
create index work_sheets_suche on work_sheets
  using gin ((coalesce(project_number, '') || ' ' || coalesce(customer_name, '')) gin_trgm_ops);

alter table work_sheets enable row level security;

create policy work_sheets_lesen on work_sheets
  for select using (app.darf(company_id));

-- Anlegen nur als Entwurf und nur auf den eigenen Namen.
create policy work_sheets_anlegen on work_sheets
  for insert with check (app.darf(company_id)
    and status = 'Entwurf' and erstellt_von_uid = auth.uid());

create policy work_sheets_aendern on work_sheets
  for update using (app.darf(company_id)) with check (app.darf(company_id));

-- Geloescht wird ein Beleg nie. Ein Entwurf wird „Verworfen", ein
-- unterschriebener Schein wird storniert — beides bleibt auffindbar.

/*
  NACH DER UNTERSCHRIFT IST ZU.

  Ein unterschriebener Schein darf sich nur noch in eine Richtung bewegen: in
  den Storno, mit Grund, und das nur die Fuehrung. Ein verworfener Entwurf
  darf wieder aufgenommen werden. Alles andere ist gesperrt — auch fuer den,
  der ihn angelegt hat.

  In firestore.rules waren das drei Hilfsfunktionen (istEntwurf, nurStorno,
  nurWiederAufnehmen). Hier ist es ein Trigger, weil er den Uebergang
  beurteilt und nicht die Zeile.
*/
create or replace function app.schein_zustandswechsel() returns trigger
  language plpgsql
  set search_path = ''
as $$
begin
  -- Ein Entwurf ist offen.
  if old.status = 'Entwurf' then
    return new;
  end if;

  -- Verworfen -> Entwurf: wieder aufnehmen.
  if old.status = 'Verworfen' and new.status = 'Entwurf' then
    return new;
  end if;

  -- Unterschrieben -> Storniert: nur die Fuehrung, nur mit Grund.
  if old.status = 'Unterschrieben' and new.status = 'Storniert' then
    if not app.ist_fuehrung() then
      raise exception 'Nur die Führung darf einen unterschriebenen Schein stornieren'
        using errcode = '42501';
    end if;
    if coalesce(new.storno_grund, '') = '' then
      raise exception 'Ein Storno braucht einen Grund' using errcode = '42501';
    end if;
    return new;
  end if;

  raise exception 'Ein Schein im Zustand % lässt sich nicht mehr ändern (Ziel: %)',
    old.status, new.status using errcode = '42501';
end;
$$;

create trigger work_sheets_updated_at before update on work_sheets
  for each row execute function app.updated_at_setzen();
create trigger work_sheets_betrieb_fest before update on work_sheets
  for each row execute function app.betrieb_unveraenderlich();
create trigger work_sheets_zustand before update on work_sheets
  for each row execute function app.schein_zustandswechsel();
create trigger work_sheets_baustelle before insert or update on work_sheets
  for each row execute function app.baustelle_aufloesen();

/*
  ====================================================================
  DIE SCHEINPOSITIONEN — EINGEFRORENE KOPIEN, KEINE VERWEISE
  ====================================================================

  Der erste Entwurf des Datenmodells liess TIME_ENTRIES zweimal auftauchen:
  unter dem Mitarbeiter und unter dem Schein. Das ist die eine Kante, die
  nicht gezogen werden darf, denn es sind ZWEI VERSCHIEDENE DINGE.

  `time_entries` ist die lebende Buchung: Grundlage von Saldo, Monatsbilanz
  und Lohn. Die Zeilen HIER sind eine Kopie, die zum Zeitpunkt der
  Unterschrift eingefroren wurde. Sie tragen den Mitarbeiter als NAMEN und
  nicht als Kennung, und sie haben absichtlich keinen Fremdschluessel auf
  `time_entries`.

  Drei Gruende, jeder fuer sich ausreichend:

    1. Die beiden duerfen auseinanderlaufen. Genau darauf beruht die Meldung
       „2 unterschriebene Scheine warten noch auf deine Zeitbuchung". Fuehrt
       man sie zusammen, ist das Feature sinnlos.

    2. Der Kunde hat etwas in der Hand. Was er unterschrieben hat, muss auch
       dann noch genau so lesbar sein, wenn die Buchung spaeter korrigiert
       oder der Mitarbeiter geloescht wird.

    3. Die Pruefsumme. `inhalt_hash` beweist, dass ein vorgelegtes PDF das
       ist, was unterschrieben wurde. Ein Verweis auf eine veraenderliche
       Zeile machte diesen Beweis wertlos.

  Dasselbe gilt fuer das Material: `work_sheet_material` traegt Name, Menge
  und Einheit, aber keine material_id — Ad-hoc-Zeilen haben gar keine.
*/
create table work_sheet_hours (
  id             uuid primary key default gen_random_uuid(),
  company_id     text not null references companies (id),
  work_sheet_id  uuid not null references work_sheets (id) on delete cascade,
  position       integer not null,
  datum          date not null,
  -- Name, NICHT Kennung. Siehe oben.
  mitarbeiter    text not null,
  von            time,
  bis            time,
  pause_min      integer not null default 0,
  -- Gerechnete Arbeitszeit — als Zahl kopiert, nicht neu gerechnet.
  minuten        integer not null,
  taetigkeit     text,
  helfer         boolean not null default false
);

create index work_sheet_hours_schein on work_sheet_hours (work_sheet_id, position);

create table work_sheet_material (
  id             uuid primary key default gen_random_uuid(),
  company_id     text not null references companies (id),
  work_sheet_id  uuid not null references work_sheets (id) on delete cascade,
  position       integer not null,
  name           text not null,
  menge          numeric(12,3) not null,
  einheit        text
);

create index work_sheet_material_schein on work_sheet_material (work_sheet_id, position);

create table work_sheet_photos (
  id             uuid primary key default gen_random_uuid(),
  company_id     text not null references companies (id),
  work_sheet_id  uuid not null references work_sheets (id) on delete cascade,
  pfad           text not null,
  hash           text not null,
  bytes          bigint not null,
  geraet_zeit    timestamptz not null
);

create index work_sheet_photos_schein on work_sheet_photos (work_sheet_id);

alter table work_sheet_hours enable row level security;
alter table work_sheet_material enable row level security;
alter table work_sheet_photos enable row level security;

create policy work_sheet_hours_lesen on work_sheet_hours
  for select using (app.darf(company_id));
create policy work_sheet_hours_schreiben on work_sheet_hours
  for all using (app.darf(company_id)) with check (app.darf(company_id));

create policy work_sheet_material_lesen on work_sheet_material
  for select using (app.darf(company_id));
create policy work_sheet_material_schreiben on work_sheet_material
  for all using (app.darf(company_id)) with check (app.darf(company_id));

create policy work_sheet_photos_lesen on work_sheet_photos
  for select using (app.darf(company_id));
create policy work_sheet_photos_schreiben on work_sheet_photos
  for all using (app.darf(company_id)) with check (app.darf(company_id));

/*
  Positionen eines unterschriebenen Scheins sind unveraenderlich.

  Die Richtlinie oben laesst den ganzen Betrieb an die Zeilen — das muss sie,
  weil ein Entwurf ja bearbeitet wird. Der Riegel sitzt hier: sobald der
  Schein unterschrieben ist, geht an seinen Positionen nichts mehr.
*/
create or replace function app.scheinpositionen_eingefroren() returns trigger
  language plpgsql
  set search_path = ''
as $$
declare
  zustand text;
  schein uuid;
begin
  schein := coalesce(new.work_sheet_id, old.work_sheet_id);
  select w.status into zustand from public.work_sheets w where w.id = schein;
  if zustand is not null and zustand <> 'Entwurf' then
    raise exception 'Der Schein ist %, seine Positionen sind eingefroren', zustand
      using errcode = '42501';
  end if;
  return coalesce(new, old);
end;
$$;

create trigger work_sheet_hours_eingefroren
  before insert or update or delete on work_sheet_hours
  for each row execute function app.scheinpositionen_eingefroren();
create trigger work_sheet_material_eingefroren
  before insert or update or delete on work_sheet_material
  for each row execute function app.scheinpositionen_eingefroren();
