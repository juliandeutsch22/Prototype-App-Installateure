-- Angebot und Rechnung.
--
-- Der Bereich mit den haertesten Regeln, und zwar nicht aus Vorsicht, sondern
-- weil § 132 BAO sieben Jahre Aufbewahrung verlangt und § 11 UStG vorschreibt,
-- was auf einer Rechnung zu stehen hat. Eine ausgestellte Rechnung wird nicht
-- geaendert und nicht geloescht — sie wird storniert.

-- ---------------------------------------------------------------------------
-- Nummernkreise
-- ---------------------------------------------------------------------------

/*
  WARUM EINE TABELLE UND KEINE SEQUENZ.

  Eine Postgres-Sequenz waere der naheliegende Ersatz fuer die Sammlung
  `counters`. Sie kann aber zwei Dinge nicht, die hier gebraucht werden: je
  Betrieb getrennt zaehlen, ohne fuer jeden neuen Betrieb DDL auszufuehren,
  und zum Jahreswechsel wieder bei 1 anfangen. Rechnungsnummern sehen in
  Oesterreich aus wie „RE-2026-0001"; das Jahr steht drin, und der Zaehler
  gehoert dazu.

  Ausserdem darf eine Sequenz Luecken lassen (bei einem Rollback), eine
  Rechnungsnummer soll das moeglichst nicht.
*/
create table number_counters (
  company_id text not null references companies (id),
  art        text not null check (art in ('invoices', 'quotes')),
  jahr       integer not null,
  stand      integer not null default 0,
  updated_at timestamptz not null default now(),
  primary key (company_id, art, jahr)
);

alter table number_counters enable row level security;

-- Gelesen und geschrieben wird ausschliesslich ueber die Funktion unten.
-- Deshalb hier bewusst KEINE Richtlinie: ohne Richtlinie kommt niemand
-- direkt an die Zaehler, und die Funktion umgeht das mit security definer.
create or replace function public.naechste_nummer(p_art text, p_jahr integer)
  returns integer
  language plpgsql
  security definer
  set search_path = ''
as $$
declare
  betrieb text;
  neu integer;
begin
  betrieb := app.betrieb();
  if betrieb is null or not app.angemeldet() then
    raise exception 'Nicht angemeldet' using errcode = '42501';
  end if;
  if p_art = 'invoices' and not app.ist_buch_oder_spitze() then
    raise exception 'Nur die Buchhaltung vergibt Rechnungsnummern' using errcode = '42501';
  end if;
  if p_art = 'quotes' and not (app.ist_fuehrung() or app.ist_buch_oder_spitze()) then
    raise exception 'Nur die Führung vergibt Angebotsnummern' using errcode = '42501';
  end if;

  -- Ein einziger Schreibvorgang. Zwei gleichzeitige Aufrufe koennen sich
  -- deshalb nicht dieselbe Nummer holen — das ersetzt die Transaktion, die
  -- heute in src/lib/db/invoices.ts von Hand geschrieben ist.
  insert into public.number_counters (company_id, art, jahr, stand)
       values (betrieb, p_art, p_jahr, 1)
  on conflict (company_id, art, jahr)
    do update set stand = public.number_counters.stand + 1, updated_at = now()
    returning stand into neu;

  return neu;
end;
$$;

revoke all on function public.naechste_nummer(text, integer) from public;
grant execute on function public.naechste_nummer(text, integer) to authenticated;

-- ---------------------------------------------------------------------------
-- Angebot
-- ---------------------------------------------------------------------------

create table quotes (
  id              uuid primary key default gen_random_uuid(),
  company_id      text not null references companies (id),
  quote_number    text not null,
  customer_id     uuid references customers (id),
  customer_name   text not null,
  address         text,
  quote_date      date not null,
  valid_until     date not null,
  status          text not null check (status in ('Entwurf', 'Versendet', 'Angenommen', 'Abgelehnt')),
  discount_mode   text check (discount_mode in ('percent', 'amount')),
  discount_value  numeric(12,4),
  discount_label  text,
  discount_amount numeric(12,2),
  subtotal_netto  numeric(12,2) not null default 0,
  total_netto     numeric(12,2) not null default 0,
  total_vat       numeric(12,2) not null default 0,
  total_brutto    numeric(12,2) not null default 0,
  vat_rate        numeric(5,2) not null,
  kalkulierte_stunden numeric(8,2) not null default 0,
  notes           text,
  project_number  text,
  project_id      uuid references projects (id),
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

create unique index quotes_nummer_je_betrieb on quotes (company_id, quote_number);
create index quotes_betrieb_datum on quotes (company_id, quote_date desc);

alter table quotes enable row level security;

-- Lesen: Fuehrung oder Buchhaltung/Spitze — wie in firestore.rules. Ein
-- Monteur hat mit Angeboten nichts zu tun.
create policy quotes_lesen on quotes
  for select using (app.darf(company_id)
    and (app.ist_fuehrung() or app.ist_buch_oder_spitze()));
create policy quotes_schreiben on quotes
  for all using (app.darf(company_id) and app.ist_fuehrung())
  with check (app.darf(company_id) and app.ist_fuehrung());

create trigger quotes_updated_at before update on quotes
  for each row execute function app.updated_at_setzen();
create trigger quotes_betrieb_fest before update on quotes
  for each row execute function app.betrieb_unveraenderlich();
create trigger quotes_baustelle before insert or update on quotes
  for each row execute function app.baustelle_aufloesen();

-- ---------------------------------------------------------------------------
-- Rechnung
-- ---------------------------------------------------------------------------

create table invoices (
  id               uuid primary key default gen_random_uuid(),
  company_id       text not null references companies (id),
  invoice_number   text not null,
  project_number   text not null,
  project_id       uuid references projects (id),
  customer_id      uuid references customers (id),
  customer_name    text not null,
  invoice_date     date not null,
  due_date         date not null,
  subtotal_netto   numeric(12,2),
  discount_mode    text check (discount_mode in ('percent', 'amount')),
  discount_value   numeric(12,4),
  discount_label   text,
  discount_amount  numeric(12,2),
  total_netto      numeric(12,2) not null,
  total_vat        numeric(12,2) not null,
  total_brutto     numeric(12,2) not null,
  vat_rate         numeric(5,2),
  -- Uebergang der Steuerschuld nach § 19 Abs 1a UStG (Bauleistungen).
  reverse_charge   boolean not null default false,
  -- Die UID des EMPFAENGERS. Ab 10.000 Euro ist sie nach § 11 Abs 1 Z 2 UStG
  -- Pflichtangabe; ohne sie ist die Rechnung nicht vorsteuerabzugsfaehig.
  customer_vat_id  text,
  address          text,
  leistung_von     date,
  leistung_bis     date,
  payment_status   text not null check (payment_status in ('Offen', 'Überfällig', 'Bezahlt', 'Storniert')),
  cancellation_note text,
  cancelled_at     timestamptz,
  mahnstufe        integer not null default 0,
  gemahnt_am       date,
  mahnfrist        date,
  mahnspesen       numeric(10,2),
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);

create unique index invoices_nummer_je_betrieb on invoices (company_id, invoice_number);
create index invoices_betrieb_datum on invoices (company_id, invoice_date desc);
create index invoices_offen on invoices (company_id, payment_status, due_date)
  where payment_status in ('Offen', 'Überfällig');

alter table invoices enable row level security;

create policy invoices_lesen on invoices
  for select using (app.darf(company_id) and app.ist_buch_oder_spitze());
create policy invoices_anlegen on invoices
  for insert with check (app.darf(company_id) and app.ist_buch_oder_spitze());
create policy invoices_aendern on invoices
  for update using (app.darf(company_id) and app.ist_buch_oder_spitze())
  with check (app.darf(company_id) and app.ist_buch_oder_spitze());

-- Keine Loeschrichtlinie. § 132 BAO: sieben Jahre.

/*
  EINE AUSGESTELLTE RECHNUNG AENDERT SICH NICHT MEHR.

  Erlaubt bleiben genau die Felder, die sich NACH dem Ausstellen noch
  bewegen duerfen: der Zahlungsstand, das Mahnwesen, und der Storno. Betrag,
  Datum, Nummer, Empfaenger und Positionen sind zu.

  Das stand in firestore.rules als eine lange Liste erlaubter Schluessel.
  Hier ist es ein Trigger — und der greift auch dann, wenn morgen jemand
  einen neuen Weg zur Rechnung baut.
*/
create or replace function app.rechnung_eingefroren() returns trigger
  language plpgsql
  set search_path = ''
as $$
begin
  if new.invoice_number is distinct from old.invoice_number
     or new.invoice_date is distinct from old.invoice_date
     or new.total_netto is distinct from old.total_netto
     or new.total_vat is distinct from old.total_vat
     or new.total_brutto is distinct from old.total_brutto
     or new.vat_rate is distinct from old.vat_rate
     or new.reverse_charge is distinct from old.reverse_charge
     or new.customer_name is distinct from old.customer_name
     or new.customer_vat_id is distinct from old.customer_vat_id
     or new.project_number is distinct from old.project_number
     or new.leistung_von is distinct from old.leistung_von
     or new.leistung_bis is distinct from old.leistung_bis then
    raise exception 'Eine ausgestellte Rechnung lässt sich nicht mehr ändern — nur stornieren'
      using errcode = '42501';
  end if;
  return new;
end;
$$;

create trigger invoices_updated_at before update on invoices
  for each row execute function app.updated_at_setzen();
create trigger invoices_betrieb_fest before update on invoices
  for each row execute function app.betrieb_unveraenderlich();
create trigger invoices_eingefroren before update on invoices
  for each row execute function app.rechnung_eingefroren();
create trigger invoices_baustelle before insert or update on invoices
  for each row execute function app.baustelle_aufloesen();

-- ---------------------------------------------------------------------------
-- Positionen — wieder eingefrorene Kopien
-- ---------------------------------------------------------------------------

/*
  KEIN FREMDSCHLUESSEL AUF materials. ABSICHT.

  Eine Rechnungsposition ist ein Schnappschuss: Bezeichnung, Menge, Einheit
  und der Preis, der GALT. Haenge ich sie an den Artikel, aendert die naechste
  Datanorm-Lieferung rueckwirkend, was der Kunde bezahlt hat. Das waere nicht
  nur falsch, es waere nach § 132 BAO ein Problem.

  Dasselbe fuer Angebotspositionen: ein Angebot ist ein Versprechen zu einem
  Preis, und das Versprechen gilt auch dann noch, wenn der Einkauf teurer
  geworden ist.
*/
create table invoice_lines (
  id          uuid primary key default gen_random_uuid(),
  company_id  text not null references companies (id),
  invoice_id  uuid not null references invoices (id) on delete cascade,
  position    integer not null,
  label       text not null,
  qty         numeric(12,3) not null,
  unit        text not null,
  unit_price  numeric(12,4) not null,
  netto       numeric(12,2) not null
);

create index invoice_lines_rechnung on invoice_lines (invoice_id, position);

create table quote_lines (
  id          uuid primary key default gen_random_uuid(),
  company_id  text not null references companies (id),
  quote_id    uuid not null references quotes (id) on delete cascade,
  position    integer not null,
  label       text not null,
  qty         numeric(12,3) not null,
  unit        text not null,
  unit_price  numeric(12,4) not null,
  netto       numeric(12,2) not null
);

create index quote_lines_angebot on quote_lines (quote_id, position);

alter table invoice_lines enable row level security;
alter table quote_lines enable row level security;

create policy invoice_lines_lesen on invoice_lines
  for select using (app.darf(company_id) and app.ist_buch_oder_spitze());
create policy invoice_lines_anlegen on invoice_lines
  for insert with check (app.darf(company_id) and app.ist_buch_oder_spitze());
-- Kein Aendern und kein Loeschen: Positionen einer Rechnung sind endgueltig.

create policy quote_lines_lesen on quote_lines
  for select using (app.darf(company_id)
    and (app.ist_fuehrung() or app.ist_buch_oder_spitze()));
create policy quote_lines_schreiben on quote_lines
  for all using (app.darf(company_id) and app.ist_fuehrung())
  with check (app.darf(company_id) and app.ist_fuehrung());

-- ---------------------------------------------------------------------------
-- Was eine Rechnung abdeckt
-- ---------------------------------------------------------------------------

/*
  Die drei Verknuepfungslisten der Rechnung (linkedEntries, linkedOrders,
  linkedWorkSheets) waren in Firestore Arrays von Ids. Als Tabelle lassen sie
  sich in beide Richtungen lesen: „was deckt diese Rechnung ab" UND „ist diese
  Buchung schon verrechnet" — die zweite Frage war bisher nur ueber das Feld
  isBilled zu beantworten, also ueber eine Kopie, die auseinanderlaufen kann.
*/
create table invoice_coverage (
  id          uuid primary key default gen_random_uuid(),
  company_id  text not null references companies (id),
  invoice_id  uuid not null references invoices (id) on delete cascade,
  art         text not null check (art in ('time_entry', 'material_order', 'work_sheet')),
  ziel_id     uuid not null,
  unique (invoice_id, art, ziel_id)
);

create index invoice_coverage_ziel on invoice_coverage (company_id, art, ziel_id);

alter table invoice_coverage enable row level security;
create policy invoice_coverage_lesen on invoice_coverage
  for select using (app.darf(company_id) and app.ist_buch_oder_spitze());
create policy invoice_coverage_schreiben on invoice_coverage
  for all using (app.darf(company_id) and app.ist_buch_oder_spitze())
  with check (app.darf(company_id) and app.ist_buch_oder_spitze());
