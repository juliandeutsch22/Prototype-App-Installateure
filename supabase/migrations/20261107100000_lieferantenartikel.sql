/*
  PARALLELE GROSSHÄNDLERKATALOGE, VERIFIZIERTER PREISVERGLEICH, PREISVERLAUF
  (M03a; E01, E02, E03, E04; 07.11.2026)

  WAS FEHLTE. Der Artikelstamm kannte keinen Lieferanten. Die Übernahme eines
  Katalogs fand einen Artikel nur über `materials.article_number`
  (`20261010300000_datanorm_in_bloecken.sql`):
    - Zwei Großhändler mit derselben Nummer ergaben EINEN Artikel, und der
      letzte Lauf überschrieb Name, Einheit, Warengruppe und Einkaufspreis —
      auch wenn hinter der Nummer beim zweiten Händler ein anderes Produkt
      stand.
    - Verschiedene Nummern für dasselbe Produkt ergaben unverbundene
      Dubletten.
    - `material_prices` hielt Preise je Artikel, Lieferant und Tag, wurde aber
      nirgends gelesen; `gueltig_bis` blieb immer leer.

  WAS SICH ÄNDERT.
    1. `lieferantenartikel`: der Artikel, wie ihn EIN Großhändler führt
       (Nummer, Bezeichnung, Einheit, Preiseinheit, Warengruppe, EAN). Er ist
       einem Stammartikel zugeordnet oder offen. Ein Katalog schreibt nur
       noch an seine eigenen Lieferantenartikel; den Stammartikel (Name,
       Einheit, Warengruppe) ändert er nur, solange ihm kein anderer
       Lieferant zugeordnet ist — das ist der Ein-Lieferanten-Betrieb von
       heute, unverändert.
    2. Die Preise hängen am Lieferantenartikel (`material_prices.
       lieferantenartikel_id`) und ZIEHEN BEIM ZUORDNEN UM: `material_id`
       folgt dem Lieferantenartikel (Trigger). Eine einzige Preistabelle,
       nichts doppelt, nichts verloren — ein offener Lieferantenartikel hat
       seine Preise mit `material_id` leer.
    3. `material_einkaufspreise` bleibt die eine Zahl, mit der Kalkulation,
       Nachkalkulation und Rechnung rechnen. Welcher Lieferantenpreis dort
       steht: der günstigste VERGLEICHBARE, sonst der jüngste
       (`app.einkaufspreis_nachziehen`). Mit nur einem Lieferanten ändert sich
       nichts: ein neuer Preis ersetzt, ohne Preis bleibt der bekannte.
    4. Vergleich (`artikel_vergleich`), Verlauf (`preisverlauf`), Vorschlag
       der Einkaufsliste (`lieferant_vorschlag`, mit Grund:
       `lieferant_vorschlag_grund`), offene Lieferantenartikel
       (`offene_lieferantenartikel`), Zuordnen, als neu anlegen, lösen, und
       die Preissprünge eines Laufs (`preisspruenge`).
    5. Je Betrieb zwei Einstellungen der Spitze: ab welcher Änderung ein
       Preis als Sprung gemeldet wird (Vorgabe 10 %) und ab welchem Alter ein
       Preisstand nicht mehr für „günstigster“ taugt (Vorgabe 180 Tage).

  DER BESTAND wird nicht umgeschrieben, nur ergänzt (siehe „Bestand“ unten):
  aus den vorhandenen Preisen entstehen Lieferantenartikel mit Zuordnung
  „bestand“; der Einkaufspreis jedes Artikels bleibt, wie er ist, bis der
  nächste Katalog oder eine Zuordnung ihn neu bestimmt.

  KEIN JOURNAL (M01b) für die Zuordnung. Gründe: Das Journal hält die
  Geschäftsobjekte mit Akte fest (Kunde, Baustelle, Beleg …) und liest „wer
  das Objekt sieht“; der Katalog ist Stammdatum ohne Akte, `materials` wird
  dort bewusst nicht geführt. Fachlich zählt, WER die Identität entschieden
  hat und wann — das steht am Lieferantenartikel selbst
  (`bestaetigt_von_*`, `bestaetigt_am`, gesetzt nur von der Datenbank), und
  zwar für jede Entscheidung von Hand: zugeordnet, als neu angelegt oder
  gelöst. Eine automatische Zuordnung trägt ihren Lauf (`erster_lauf`,
  `letzter_lauf`). Was dabei verloren geht: die Folge früherer
  Entscheidungen zu einem Lieferantenartikel — es steht nur die jüngste.
*/

-- ---------------------------------------------------------------------------
-- Einstellungen je Betrieb
-- ---------------------------------------------------------------------------

/*
  Eigene Spalten statt `companies.rates`: zwei Zahlen mit festen Grenzen,
  geprüft von der Datenbank wie `papierkorb_frist_tage`. Schreiben darf, wer
  die übrigen Betriebseinstellungen schreibt — die Spitze
  (`companies_aendern`). Lesen darf jedes Mitglied; es sind keine Preise.
*/
alter table public.companies add column if not exists preissprung_schwelle_prozent numeric(6,2) not null default 10;
alter table public.companies add column if not exists katalog_veraltet_tage integer not null default 180;

alter table public.companies drop constraint if exists companies_preissprung_schwelle;
alter table public.companies add constraint companies_preissprung_schwelle
  check (preissprung_schwelle_prozent > 0 and preissprung_schwelle_prozent <= 1000);
alter table public.companies drop constraint if exists companies_katalog_veraltet_tage;
alter table public.companies add constraint companies_katalog_veraltet_tage
  check (katalog_veraltet_tage between 1 and 3650);

comment on column public.companies.preissprung_schwelle_prozent is
  'Ab welcher Änderung (mehr als so viel Prozent, auf oder ab) der Bericht einer Katalogübernahme einen Preissprung nennt (M03a, E04). Vorgabe 10.';
comment on column public.companies.katalog_veraltet_tage is
  'Ein Preisstand, der älter ist, taugt nicht für „günstigster“ (M03a, E03; später E06). Vorgabe 180 Tage.';

-- ---------------------------------------------------------------------------
-- Das Zwischenlager trägt EAN und Preiseinheit aus der Datei
-- ---------------------------------------------------------------------------

/*
  Der Preis kommt aus dem Leser schon je EINER Einheit (Cent und Preiseinheit
  herausgerechnet, `src/features/materials/datanorm.ts`); die Preiseinheit
  geht nur noch zur Auskunft mit („in der Datei je 100 Stk“). Leer bei einer
  älteren Fassung der App, die sie nicht schickt.

  Die EAN liest der Leser aus dem Satz B, nur mit gültiger Prüfziffer. Hier
  steht nur die Form; eine EAN entscheidet beim Vergleich über die Identität,
  also kommt kein Freitext durch.
*/
alter table public.datanorm_zeilen add column if not exists ean text;
alter table public.datanorm_zeilen add column if not exists preiseinheit integer;
alter table public.datanorm_zeilen drop constraint if exists datanorm_zeilen_ean;
alter table public.datanorm_zeilen add constraint datanorm_zeilen_ean
  check (ean is null or ean ~ '^([0-9]{8}|[0-9]{12,14})$');
alter table public.datanorm_zeilen drop constraint if exists datanorm_zeilen_preiseinheit;
alter table public.datanorm_zeilen add constraint datanorm_zeilen_preiseinheit
  check (preiseinheit is null or preiseinheit in (1, 10, 100, 1000));

-- ---------------------------------------------------------------------------
-- Lieferantenartikel
-- ---------------------------------------------------------------------------

create table if not exists public.lieferantenartikel (
  id                  uuid primary key default gen_random_uuid(),
  company_id          text not null references public.companies (id),
  supplier_id         uuid not null references public.suppliers (id) on delete cascade,
  lieferanten_nr      text not null,
  ean                 text,
  bezeichnung         text not null default '',
  einheit             text,
  preiseinheit        integer,
  warengruppe         text,
  ausgelaufen         boolean not null default false,
  material_id         uuid references public.materials (id) on delete set null,
  zuordnung           text,
  zu_pruefen          boolean not null default false,
  bestaetigt_von_uid  uuid,
  bestaetigt_von_name text,
  bestaetigt_am       timestamptz,
  erster_lauf         uuid references public.datanorm_laeufe (id) on delete set null,
  letzter_lauf        uuid references public.datanorm_laeufe (id) on delete set null,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now(),
  constraint lieferantenartikel_je_nummer unique (company_id, supplier_id, lieferanten_nr),
  constraint lieferantenartikel_nummer check (btrim(lieferanten_nr) <> ''),
  constraint lieferantenartikel_zuordnung
    check (zuordnung is null or zuordnung in ('automatisch', 'bestaetigt', 'bestand', 'geloest')),
  constraint lieferantenartikel_preiseinheit check (preiseinheit is null or preiseinheit in (1, 10, 100, 1000)),
  constraint lieferantenartikel_ean check (ean is null or ean ~ '^([0-9]{8}|[0-9]{12,14})$')
);

comment on table public.lieferantenartikel is
  'Der Artikel, wie ihn ein Großhändler führt (M03a, E01). Einem Stammartikel zugeordnet (material_id) oder offen. Schreiben: wer Kataloge einspielt; die Zuordnung von Hand nur über die Funktionen.';
comment on column public.lieferantenartikel.zuordnung is
  'Wie der Lieferantenartikel zu seinem Stammartikel kam: automatisch (eigene Nummer, kein anderer Lieferant am Artikel), bestaetigt (von Hand, auch „als neu“), bestand (aus den Preisen vor M03a). Offen: leer, oder geloest (von Hand gelöst — keine automatische Zuordnung mehr).';
comment on column public.lieferantenartikel.zu_pruefen is
  'Bestand mit Preisen von mehr als einem Lieferanten: das alte Modell hat sie über die Nummer zusammengelegt, die Identität ist unbekannt.';
comment on column public.lieferantenartikel.bestaetigt_von_uid is
  'Wer die jetzige Zuordnung von Hand entschieden hat (zugeordnet, als neu, gelöst); setzt nur die Datenbank. Kein Fremdschlüssel: bleibt, wenn das Konto geht.';
comment on column public.lieferantenartikel.preiseinheit is
  'Preiseinheit der Datei (je 1, 10, 100, 1000). Nur Auskunft: die Preise stehen je einer Einheit.';

/*
  EIN LIEFERANTENARTIKEL JE STAMMARTIKEL UND LIEFERANT. Die Preise je
  Artikel, Lieferant und Tag (`material_prices_je_zeitraum`) bleiben damit
  eindeutig, und der Vergleich hat je Lieferant eine Zeile. Führt ein
  Großhändler dasselbe Produkt unter zwei Nummern, ist eine davon zu lösen.
*/
create unique index if not exists lieferantenartikel_je_artikel
  on public.lieferantenartikel (material_id, supplier_id) where material_id is not null;
-- Die Liste der offenen, je Betrieb.
create index if not exists lieferantenartikel_offen
  on public.lieferantenartikel (company_id, supplier_id, lieferanten_nr) where material_id is null;
-- Vorschläge: gleiche Nummer bei einem anderen Lieferanten, gleiche EAN.
create index if not exists lieferantenartikel_nummer on public.lieferantenartikel (company_id, lieferanten_nr);
create index if not exists lieferantenartikel_ean
  on public.lieferantenartikel (company_id, ean) where ean is not null;
-- Die Suche in der Liste der offenen (wie `materials_suche`).
create index if not exists lieferantenartikel_suche
  on public.lieferantenartikel using gin ((coalesce(bezeichnung, '') || ' ' || lieferanten_nr) gin_trgm_ops);

alter table public.lieferantenartikel enable row level security;
-- Kein Löschen über die Schnittstelle: ein Lieferantenartikel geht nur mit seinem Lieferanten.
revoke all on public.lieferantenartikel from public, anon, authenticated;
grant select, insert, update on public.lieferantenartikel to authenticated;

/*
  LESEN: wer den Einkauf führt — Verwaltung und Führung, wie bei der
  Einkaufsliste —, dazu der Support im Einblick.

  WARUM NICHT NUR, WER EINKAUFSPREISE SIEHT. Hier stehen keine Preise:
  Nummer, Bezeichnung, Einheit des Großhändlers und die Zuordnung. Die
  Nummer braucht, wer beim Großhändler bestellt — die Bestellung an Händler B
  trägt B's Nummer, nicht die des Stammartikels (`einkauf.ts`). Das sind
  Verwaltung und Führung, auch ohne Freigabe.

  OFFENE ZUORDNUNGEN sehen dieselben Rollen — auch die Projektleitung und die
  Verwaltung ohne Freigabe: eine offene Zeile ist dieselbe Auskunft ohne Preis.
  Bearbeiten (zuordnen, als neu, lösen) darf nur, wer Kataloge einspielt; die
  Ansicht dazu hat die App nur für diese Rollen.

  Monteur und Buchhaltung brauchen sie nicht: der Monteur fordert über den
  Stammartikel an, die Buchhaltung bestellt nicht.
*/
drop policy if exists lieferantenartikel_lesen on public.lieferantenartikel;
create policy lieferantenartikel_lesen on public.lieferantenartikel for select
  using (
    (company_id = (select app.lesebetrieb())
      and ((select app.hat_rolle(array['Verwaltung'])) or (select app.ist_fuehrung())))
    or company_id = (select app.supportbetrieb())
  );

-- SCHREIBEN: wer Kataloge einspielt (die Übernahme läuft mit den Rechten des Aufrufers).
drop policy if exists lieferantenartikel_anlegen on public.lieferantenartikel;
create policy lieferantenartikel_anlegen on public.lieferantenartikel for insert
  with check (
    (company_id = (select app.lesebetrieb()) or company_id = (select app.supportbetrieb()))
    and (select app.darf_katalog_einspielen())
  );
drop policy if exists lieferantenartikel_aendern on public.lieferantenartikel;
create policy lieferantenartikel_aendern on public.lieferantenartikel for update
  using (
    (company_id = (select app.lesebetrieb()) or company_id = (select app.supportbetrieb()))
    and (select app.darf_katalog_einspielen())
  )
  with check (
    (company_id = (select app.lesebetrieb()) or company_id = (select app.supportbetrieb()))
    and (select app.darf_katalog_einspielen())
  );

-- Lieferant und Stammartikel aus demselben Betrieb (wie `einkauf_posten_im_betrieb`).
create or replace function app.lieferantenartikel_im_betrieb() returns trigger
  language plpgsql
  set search_path = ''
as $$
begin
  if not exists (
    select 1 from public.suppliers s where s.id = new.supplier_id and s.company_id = new.company_id
  ) then
    raise exception 'Der Lieferant gehört nicht zu diesem Betrieb' using errcode = '23503';
  end if;
  if new.material_id is not null and not exists (
    select 1 from public.materials m where m.id = new.material_id and m.company_id = new.company_id
  ) then
    raise exception 'Diesen Artikel gibt es im Betrieb nicht' using errcode = '23503';
  end if;
  return new;
end;
$$;
revoke all on function app.lieferantenartikel_im_betrieb() from public, anon, authenticated;

/*
  DIE ZUORDNUNG UND WER SIE ENTSCHIEDEN HAT setzt die Datenbank.

  - Ohne Stammartikel ist ein Lieferantenartikel offen; der Stand „gelöst“
    bleibt dabei stehen (er hält die automatische Zuordnung fern), jeder
    andere wird leer.
  - Bekommt er von Hand einen Stammartikel, ohne zu sagen wie, gilt das als
    bestätigt.
  - Wer und wann: nur bei einem Wechsel in einen von Hand entschiedenen Stand
    (bestätigt, gelöst) — aus der Anmeldung, nie aus dem, was mitgeschickt
    wird. Ohne Wechsel bleiben sie, wie sie waren.
  - „Zu prüfen“ gibt es nur beim Bestand und nur, bis jemand bestätigt;
    mitgeschickt wird es nicht.

  Der Dienstschlüssel (Rücklauf einer Sicherung) bringt die Zeilen, wie sie
  waren. `security definer`, weil der Name des Supports in `platform_admins`
  steht (wie `angebot_papierkorb`).
*/
create or replace function app.lieferantenartikel_stand() returns trigger
  language plpgsql
  security definer
  set search_path = ''
as $$
begin
  if app.ist_dienst() then
    return new;
  end if;

  if new.material_id is null and new.zuordnung is distinct from 'geloest' then
    new.zuordnung := null;
  elsif new.material_id is not null and (new.zuordnung is null or new.zuordnung = 'geloest') then
    new.zuordnung := 'bestaetigt';
  end if;

  if new.zuordnung is distinct from 'bestand' then
    new.zu_pruefen := false;
  elsif tg_op = 'UPDATE' and old.zuordnung = 'bestand' then
    new.zu_pruefen := old.zu_pruefen;
  end if;

  if tg_op = 'UPDATE'
     and old.zuordnung is not distinct from new.zuordnung
     and old.material_id is not distinct from new.material_id then
    new.bestaetigt_von_uid := old.bestaetigt_von_uid;
    new.bestaetigt_von_name := old.bestaetigt_von_name;
    new.bestaetigt_am := old.bestaetigt_am;
  elsif new.zuordnung in ('bestaetigt', 'geloest') then
    new.bestaetigt_von_uid := auth.uid();
    new.bestaetigt_von_name := coalesce(
      (select u.name from public.users u where u.id = auth.uid()),
      (select 'Support (' || coalesce(nullif(btrim(p.name), ''), 'Senklot') || ')'
         from public.platform_admins p where p.id = auth.uid()));
    new.bestaetigt_am := now();
  else
    new.bestaetigt_von_uid := null;
    new.bestaetigt_von_name := null;
    new.bestaetigt_am := null;
  end if;
  return new;
end;
$$;
revoke all on function app.lieferantenartikel_stand() from public, anon, authenticated;

drop trigger if exists lieferantenartikel_betrieb_fest on public.lieferantenartikel;
create trigger lieferantenartikel_betrieb_fest before update on public.lieferantenartikel
  for each row execute function app.betrieb_unveraenderlich();
drop trigger if exists lieferantenartikel_im_betrieb on public.lieferantenartikel;
create trigger lieferantenartikel_im_betrieb
  before insert or update of company_id, supplier_id, material_id on public.lieferantenartikel
  for each row execute function app.lieferantenartikel_im_betrieb();
drop trigger if exists lieferantenartikel_kein_support_schreiben on public.lieferantenartikel;
create trigger lieferantenartikel_kein_support_schreiben
  before insert or update or delete on public.lieferantenartikel
  for each row execute function app.support_schreibt_nicht();
drop trigger if exists lieferantenartikel_stand on public.lieferantenartikel;
create trigger lieferantenartikel_stand before insert or update on public.lieferantenartikel
  for each row execute function app.lieferantenartikel_stand();
drop trigger if exists lieferantenartikel_updated_at on public.lieferantenartikel;
create trigger lieferantenartikel_updated_at before update on public.lieferantenartikel
  for each row execute function app.updated_at_setzen();

-- ---------------------------------------------------------------------------
-- Die Preise hängen am Lieferantenartikel
-- ---------------------------------------------------------------------------

/*
  ENTSCHEIDUNG: EINE PREISTABELLE, DIE PREISE ZIEHEN BEIM ZUORDNEN UM.

  Die andere Möglichkeit — eine eigene Preistabelle je Lieferantenartikel,
  `material_prices` nur noch als Spiegel der zugeordneten — hielte jeden
  Preis zweimal. Zwei Tabellen, die zusammenpassen müssen, laufen beim
  ersten Fehler auseinander, und dann zählt ein Preis doppelt oder fehlt.
  So bleibt `material_prices` die Preistabelle je Artikel, Lieferant und Tag
  (alle bisherigen Leser lesen sie weiter), bekommt den Lieferantenartikel
  dazu, und `material_id` ist bei einem offenen Lieferantenartikel leer.

  - `material_id` FOLGT DEM LIEFERANTENARTIKEL (Trigger
    `material_prices_lieferantenartikel`): wer einen Preis schreibt, nennt den
    Lieferantenartikel; zieht der um, ziehen seine Preise mit
    (`app.lieferantenartikel_nachher`).
  - Wird ein Stammartikel gelöscht, bleiben die Preise seiner
    Lieferantenartikel (die werden offen) — der Fremdschlüssel setzt leer
    statt zu löschen. Preise ohne Lieferantenartikel (Bestand ohne
    eindeutige Herkunft) gehen mit dem Artikel wie bisher
    (`app.altpreise_mit_artikel`).
  - `lauf_id`: welcher Lauf den Preis schrieb — daraus liest der Bericht
    seine Preissprünge.
*/
alter table public.material_prices add column if not exists lieferantenartikel_id uuid
  references public.lieferantenartikel (id) on delete cascade;
alter table public.material_prices add column if not exists lauf_id uuid
  references public.datanorm_laeufe (id) on delete set null;
alter table public.material_prices alter column material_id drop not null;
alter table public.material_prices drop constraint if exists material_prices_material_id_fkey;
alter table public.material_prices add constraint material_prices_material_id_fkey
  foreign key (material_id) references public.materials (id) on delete set null;

comment on column public.material_prices.lieferantenartikel_id is
  'Der Lieferantenartikel, zu dem der Preis gehört (M03a). Leer nur bei Preisen aus der Zeit davor ohne eindeutige Herkunft.';
comment on column public.material_prices.material_id is
  'Folgt dem Lieferantenartikel; leer, solange er offen ist (M03a).';
comment on column public.material_prices.lauf_id is
  'Der Katalog-Lauf, der den Preis schrieb (M03a); leer bei Preisen aus der Zeit davor.';

-- Je Lieferantenartikel und Tag ein Preis — wie bisher je Artikel, Lieferant und Tag.
create unique index if not exists material_prices_je_lieferantenartikel
  on public.material_prices (lieferantenartikel_id, gueltig_ab);
create index if not exists material_prices_lauf
  on public.material_prices (lauf_id) where lauf_id is not null;

create or replace function app.preis_folgt_lieferantenartikel() returns trigger
  language plpgsql
  security definer
  set search_path = ''
as $$
declare
  a public.lieferantenartikel;
begin
  if new.lieferantenartikel_id is null or app.ist_dienst() then
    return new;
  end if;
  select * into a from public.lieferantenartikel x where x.id = new.lieferantenartikel_id;
  if a.id is null or a.company_id <> new.company_id or a.supplier_id <> new.supplier_id then
    raise exception 'Der Lieferantenartikel gehört nicht zu diesem Preis' using errcode = '23503';
  end if;
  new.material_id := a.material_id;
  /*
    Wird der Stammartikel gerade gelöscht, setzen zwei Fremdschlüssel leer
    (am Lieferantenartikel und hier) — in welcher Reihenfolge, entscheidet
    Postgres. Zeigt der Lieferantenartikel noch auf den gelöschten Artikel,
    bleibt der Preis leer, statt den Fremdschlüssel zu verletzen; gleich
    danach wird auch der Lieferantenartikel offen.
  */
  if new.material_id is not null
     and not exists (select 1 from public.materials m where m.id = new.material_id) then
    new.material_id := null;
  end if;
  return new;
end;
$$;
revoke all on function app.preis_folgt_lieferantenartikel() from public, anon, authenticated;

drop trigger if exists material_prices_lieferantenartikel on public.material_prices;
create trigger material_prices_lieferantenartikel
  before insert or update of lieferantenartikel_id, material_id, supplier_id on public.material_prices
  for each row execute function app.preis_folgt_lieferantenartikel();

create or replace function app.altpreise_mit_artikel() returns trigger
  language plpgsql
  security definer
  set search_path = ''
as $$
begin
  delete from public.material_prices p where p.material_id = old.id and p.lieferantenartikel_id is null;
  return old;
end;
$$;
revoke all on function app.altpreise_mit_artikel() from public, anon, authenticated;

drop trigger if exists materials_altpreise on public.materials;
create trigger materials_altpreise before delete on public.materials
  for each row execute function app.altpreise_mit_artikel();

-- ---------------------------------------------------------------------------
-- Vergleich: je Lieferant Preisstand, Identität, Vergleichbarkeit
-- ---------------------------------------------------------------------------

/*
  DIE EINE STELLE, AN DER ENTSCHIEDEN WIRD, WAS VERGLEICHBAR IST — Ansicht,
  Vorschlag der Einkaufsliste und Einkaufspreis lesen alle hier.

  Je Lieferant des Stammartikels der Preis mit dem jüngsten `gueltig_ab` bis
  heute. Dazu Lieferanten mit Preisen aus der Zeit vor den
  Lieferantenartikeln, die keinen Lieferantenartikel bekamen (Herkunft
  unbekannt).

  VERIFIZIERT ist die Identität, wenn
    - ein Mensch bestätigt hat (`bestaetigt`, wer und wann stehen dabei);
    - der Lieferantenartikel der Ursprung des Stammartikels ist
      (`automatisch`: eigene Nummer, kein anderer Lieferant am Artikel) oder
      aus dem Bestand mit nur einem Lieferanten kam (`bestand`, nicht zu
      prüfen);
    - nur EIN Lieferant einen aktuellen Preis hat;
    - oder seine EAN gleich ist: mindestens zwei aktive Lieferanten tragen
      eine, und alle dieselbe.
  VERGLEICHBAR ist er dazu nur mit einem Einkaufspreis und in der Einheit
  des Stammartikels. Die Preiseinheit (1/10/100/1000) ist schon
  herausgerechnet — der Leser speichert jeden Preis je EINER Einheit; eine
  Umrechnung zwischen Einheiten („m“ und „Stk“) gibt es nicht.
  GÜNSTIGSTER nur bei VOLLSTÄNDIGER Basis: mindestens zwei aktive
  Lieferanten (nicht ausgelaufen, mit Preis), alle vergleichbar, keiner
  älter als die Frist des Betriebs. Bei gleichem Preis tragen beide das
  Kennzeichen.

  Mit den Rechten des Aufrufers: aus den Funktionen unten läuft es als
  Eigentümer (die prüfen Betrieb und Recht), aus der Übernahme mit dem
  Zeilenschutz dessen, der einspielt.
*/
create or replace function app.lieferanten_stand(p_material uuid, p_heute date)
returns table (
  lieferantenartikel_id uuid,
  supplier_id uuid,
  lieferant text,
  lieferanten_nr text,
  bezeichnung text,
  einheit text,
  preiseinheit integer,
  ean text,
  zuordnung text,
  zu_pruefen boolean,
  bestaetigt_von_name text,
  bestaetigt_am timestamptz,
  ausgelaufen boolean,
  listenpreis numeric,
  rabatt_prozent numeric,
  einkaufspreis numeric,
  rabattgruppe text,
  stand date,
  verifiziert_durch text,
  vergleichbar boolean,
  grund text,
  veraltet boolean,
  guenstigster boolean,
  basis_grund text
)
language sql
stable
set search_path = ''
as $$
  with m as (
    select x.id, x.company_id, app.einheit_norm(x.unit) as einheit, c.katalog_veraltet_tage as frist
      from public.materials x
      join public.companies c on c.id = x.company_id
     where x.id = p_material
  ),
  la as (
    select a.* from public.lieferantenartikel a join m on a.material_id = m.id and a.company_id = m.company_id
  ),
  alt as (
    select distinct p.supplier_id
      from public.material_prices p
      join m on p.material_id = m.id and p.company_id = m.company_id
     where p.lieferantenartikel_id is null
       and not exists (select 1 from la where la.supplier_id = p.supplier_id)
  ),
  roh as (
    select la.id as la_id, la.supplier_id as lief, la.lieferanten_nr as nr, la.bezeichnung as bez,
           la.einheit as eh, la.preiseinheit as pe, la.ean as code, la.zuordnung as zu, la.zu_pruefen as pruefen,
           la.bestaetigt_von_name as von, la.bestaetigt_am as am, la.ausgelaufen as aus,
           pr.listenpreis as lp, pr.rabatt_prozent as rp, pr.einkaufspreis as ek, pr.rabattgruppe as rg,
           pr.gueltig_ab as st
      from la
      left join lateral (
        select p.listenpreis, p.rabatt_prozent, p.einkaufspreis, p.rabattgruppe, p.gueltig_ab
          from public.material_prices p
         where p.lieferantenartikel_id = la.id and p.gueltig_ab <= p_heute
         order by p.gueltig_ab desc
         limit 1
      ) pr on true
    union all
    select null::uuid, alt.supplier_id, null::text, null::text, null::text, null::integer, null::text,
           null::text, false, null::text, null::timestamptz, false,
           pr.listenpreis, pr.rabatt_prozent, pr.einkaufspreis, pr.rabattgruppe, pr.gueltig_ab
      from alt
      left join lateral (
        select p.listenpreis, p.rabatt_prozent, p.einkaufspreis, p.rabattgruppe, p.gueltig_ab
          from public.material_prices p
         where p.material_id = p_material and p.supplier_id = alt.supplier_id
           and p.lieferantenartikel_id is null and p.gueltig_ab <= p_heute
         order by p.gueltig_ab desc
         limit 1
      ) pr on true
  ),
  aktiv as (
    select r.*, (not r.aus and r.st is not null) as ist_aktiv from roh r
  ),
  zahl as (
    select count(*) filter (where ist_aktiv) as aktive,
           count(distinct code) filter (where ist_aktiv and code is not null) as eans,
           count(*) filter (where ist_aktiv and code is not null) as mit_ean
      from aktiv
  ),
  geprueft as (
    select a.*,
      case
        when a.la_id is null then null
        when a.zu = 'bestaetigt' then 'bestaetigt'
        when a.zu = 'automatisch' then 'automatisch'
        when a.zu = 'bestand' and not a.pruefen then 'bestand'
        when a.ist_aktiv and z.aktive = 1 then 'einziger'
        when a.ist_aktiv and a.code is not null and z.eans = 1 and z.mit_ean >= 2 then 'ean'
      end as durch
      from aktiv a cross join zahl z
  ),
  beurteilt as (
    select g.*,
      case
        when g.aus then 'ausgelaufen'
        when g.st is null then 'kein Preis'
        when g.durch is null then
          case when g.la_id is null then 'Preise aus der Zeit vor den Lieferantenartikeln — Herkunft unbekannt'
               when g.pruefen then 'Bestand, zu prüfen: derselbe Artikel?'
               else 'nicht als derselbe Artikel bestätigt' end
        when m.einheit is null or app.einheit_norm(g.eh) is null then 'Einheit fehlt'
        when app.einheit_norm(g.eh) <> m.einheit then 'Einheit ' || app.einheit_norm(g.eh) || ' statt ' || m.einheit
        when g.ek is null and g.lp is not null then 'Rabattsatz fehlt — kein Einkaufspreis'
        when g.ek is null then 'ohne Einkaufspreis'
      end as hindernis,
      (g.st is not null and g.st < p_heute - m.frist) as zu_alt
      from geprueft g cross join m
  ),
  basis as (
    select count(*) filter (where ist_aktiv) as aktive,
           count(*) filter (where ist_aktiv and hindernis is null) as gute,
           coalesce(bool_or(ist_aktiv and zu_alt), false) as veraltet,
           min(ek) filter (where ist_aktiv and hindernis is null) as bester
      from beurteilt
  )
  select b.la_id, b.lief, s.name, b.nr, b.bez, b.eh, b.pe, b.code, b.zu, b.pruefen, b.von, b.am, b.aus,
         b.lp, b.rp, b.ek, b.rg, b.st, b.durch,
         b.hindernis is null,
         b.hindernis,
         b.zu_alt,
         (x.aktive >= 2 and x.gute = x.aktive and not x.veraltet
           and b.ist_aktiv and b.hindernis is null and b.ek = x.bester),
         case
           when x.aktive = 0 then 'Kein Lieferant mit aktuellem Preis'
           when x.aktive = 1 then 'Nur ein Lieferant mit aktuellem Preis — es gibt nichts zu vergleichen'
           when x.gute < x.aktive then 'Nicht alle Lieferanten sind vergleichbar — kein günstigster'
           when x.veraltet then 'Ein Preisstand ist älter als ' || m.frist || ' Tage — kein günstigster'
         end
    from beurteilt b
    cross join basis x
    cross join m
    left join public.suppliers s on s.id = b.lief
   order by b.ist_aktiv desc, (b.hindernis is null) desc, b.ek asc nulls last, s.name, b.lief
$$;
revoke all on function app.lieferanten_stand(uuid, date) from public, anon;
/*
  Ausführen darf jedes angemeldete Konto: die Übernahme ruft sie mit den
  Rechten dessen, der einspielt. Sie liest dann nur, was der Zeilenschutz
  ihm zeigt.
*/
grant execute on function app.lieferanten_stand(uuid, date) to authenticated;

/*
  DER EINKAUFSPREIS DES STAMMARTIKELS (`material_einkaufspreise`), wenn sich
  seine Lieferantenbasis ändert: der günstigste vergleichbare Preis, sonst
  der jüngste eines Lieferanten, der noch liefert und in derselben Einheit
  führt (oder dessen Einheit unbekannt ist — so rechnete die Übernahme bisher).

  EIN LEERER PREIS LÖSCHT NICHTS: trägt die Wahl keinen Einkaufspreis
  (fehlender Rabattsatz, kein Preis in der Datei), bleibt der bekannte stehen
  — wie bisher bei der Übernahme. Ebenso, wenn kein Lieferant mehr liefert.

  WARUM DER GÜNSTIGSTE UND NICHT DER JÜNGSTE. Kalkulation und Nachkalkulation
  sollen mit dem rechnen, was der Betrieb bei verifiziert gleichem Artikel
  zahlen kann; der Vorschlag der Einkaufsliste nimmt denselben Lieferanten.
  Ohne vollständige Vergleichsbasis gibt es keinen „günstigsten“, und dann
  gilt wie bisher der Katalog, der zuletzt kam.

  Neu bestimmt wird nur, wenn sich etwas an der Basis ändert (Preis eines
  Katalogs, zuordnen, lösen, auslaufen); ein von Hand gesetzter
  Einkaufspreis gilt bis dahin.
*/
create or replace function app.einkaufspreis_nachziehen(p_material uuid) returns void
  language plpgsql
  set search_path = ''
as $$
declare
  heute date := (now() at time zone 'Europe/Vienna')::date;
  stamm public.materials;
  preis numeric;
begin
  select * into stamm from public.materials x where x.id = p_material;
  if stamm.id is null then
    return;
  end if;
  select s.einkaufspreis into preis
    from app.lieferanten_stand(p_material, heute) s
   where s.guenstigster
   order by s.stand desc, s.lieferant, s.supplier_id
   limit 1;
  if not found then
    select p.einkaufspreis into preis
      from public.material_prices p
      join public.lieferantenartikel a on a.id = p.lieferantenartikel_id
     where a.material_id = p_material
       and not a.ausgelaufen
       and p.gueltig_ab <= heute
       and (app.einheit_norm(a.einheit) is null or app.einheit_norm(stamm.unit) is null
            or app.einheit_norm(a.einheit) = app.einheit_norm(stamm.unit))
     order by p.gueltig_ab desc, p.updated_at desc
     limit 1;
  end if;
  if preis is null then
    return;
  end if;
  insert into public.material_einkaufspreise (company_id, material_id, einkaufspreis)
  values (stamm.company_id, stamm.id, preis)
  on conflict (material_id) do update set einkaufspreis = excluded.einkaufspreis
   where public.material_einkaufspreise.einkaufspreis is distinct from excluded.einkaufspreis;
end;
$$;
revoke all on function app.einkaufspreis_nachziehen(uuid) from public, anon;
grant execute on function app.einkaufspreis_nachziehen(uuid) to authenticated;

/*
  AUSGELAUFEN IST EIN STAMMARTIKEL ERST, WENN ALLE SEINE LIEFERANTENARTIKEL
  AUSGELAUFEN SIND — und wieder im Katalog, sobald einer zurückkommt. Ohne
  Lieferantenartikel (von Hand angelegt) bleibt er, wie er ist.
*/
create or replace function app.stamm_nachziehen(p_material uuid, p_preis boolean) returns void
  language plpgsql
  security definer
  set search_path = ''
as $$
declare
  aus boolean;
begin
  if p_material is null or not exists (select 1 from public.materials x where x.id = p_material) then
    return;
  end if;
  if exists (select 1 from public.lieferantenartikel a where a.material_id = p_material) then
    aus := not exists (
      select 1 from public.lieferantenartikel a where a.material_id = p_material and not a.ausgelaufen);
    update public.materials x set ausgelaufen = aus
     where x.id = p_material and x.ausgelaufen is distinct from aus;
  end if;
  if p_preis then
    perform app.einkaufspreis_nachziehen(p_material);
  end if;
end;
$$;
revoke all on function app.stamm_nachziehen(uuid, boolean) from public, anon, authenticated;

/*
  ZIEHT EIN LIEFERANTENARTIKEL UM, ZIEHEN SEINE PREISE MIT — gleich, auf
  welchem Weg (Übernahme, Zuordnen, Lösen, Löschen des Stammartikels).

  Bekommt er einen Stammartikel, übernimmt er dessen Preise desselben
  Lieferanten aus der Zeit vor den Lieferantenartikeln, die keinem
  zugeordnet werden konnten: es sind seine (derselbe Lieferant liefert dem
  Artikel nur einen Lieferantenartikel). Stünde dabei ein Tag doppelt, wird
  abgebrochen — einen der beiden Preise zu verwerfen wäre ein verlorener
  Preis.

  Danach der Stammartikel: ausgelaufen oder nicht, und sein Einkaufspreis,
  wenn sich die Preisbasis geändert hat (Preise kamen dazu oder gingen, oder
  ein Lieferant lief aus bzw. kam zurück, während ein anderer mitliefert).
  Mit nur einem Lieferanten setzt den Einkaufspreis die Übernahme selbst —
  wie bisher.
*/
create or replace function app.lieferantenartikel_nachher() returns trigger
  language plpgsql
  security definer
  set search_path = ''
as $$
declare
  vorher uuid;
  bewegt integer := 0;
  n integer;
  mehrere boolean;
begin
  if app.ist_dienst() then
    return null;
  end if;
  if tg_op = 'UPDATE' then
    vorher := old.material_id;
  end if;

  if new.material_id is not null and (tg_op = 'INSERT' or vorher is distinct from new.material_id) then
    if exists (
      select 1 from public.material_prices p
       where p.material_id = new.material_id and p.supplier_id = new.supplier_id
         and p.lieferantenartikel_id is null
         and exists (select 1 from public.material_prices q
                      where q.lieferantenartikel_id = new.id and q.gueltig_ab = p.gueltig_ab)
    ) then
      raise exception 'Für diesen Artikel stehen von diesem Lieferanten schon Preise an denselben Tagen — die Zuordnung führte sie doppelt'
        using errcode = '23505';
    end if;
    update public.material_prices p set lieferantenartikel_id = new.id
     where p.material_id = new.material_id and p.supplier_id = new.supplier_id
       and p.lieferantenartikel_id is null;
    get diagnostics n = row_count;
    bewegt := bewegt + n;
  end if;

  if tg_op = 'INSERT' or vorher is distinct from new.material_id then
    update public.material_prices p set material_id = new.material_id
     where p.lieferantenartikel_id = new.id and p.material_id is distinct from new.material_id;
    get diagnostics n = row_count;
    bewegt := bewegt + n;
  end if;

  if vorher is not null and vorher is distinct from new.material_id then
    perform app.stamm_nachziehen(vorher, bewegt > 0);
  end if;
  if new.material_id is not null then
    mehrere := exists (select 1 from public.lieferantenartikel a
                        where a.material_id = new.material_id and a.id <> new.id);
    perform app.stamm_nachziehen(new.material_id,
      bewegt > 0 or (tg_op = 'UPDATE' and old.ausgelaufen is distinct from new.ausgelaufen and mehrere));
  end if;
  return null;
end;
$$;
revoke all on function app.lieferantenartikel_nachher() from public, anon, authenticated;

drop trigger if exists lieferantenartikel_nachher_anlegen on public.lieferantenartikel;
create trigger lieferantenartikel_nachher_anlegen after insert on public.lieferantenartikel
  for each row when (new.material_id is not null)
  execute function app.lieferantenartikel_nachher();
drop trigger if exists lieferantenartikel_nachher_aendern on public.lieferantenartikel;
create trigger lieferantenartikel_nachher_aendern after update on public.lieferantenartikel
  for each row when (old.material_id is distinct from new.material_id or old.ausgelaufen is distinct from new.ausgelaufen)
  execute function app.lieferantenartikel_nachher();

-- ---------------------------------------------------------------------------
-- Bestand: aus den vorhandenen Preisen Lieferantenartikel (nur ergänzen)
-- ---------------------------------------------------------------------------

/*
  WAS ES GIBT: Preise je Artikel und Lieferant (`material_prices`), und am
  Artikel die Nummer, unter der importiert wurde. Daraus je Paar Lieferant ×
  Artikel ein Lieferantenartikel mit Zuordnung „bestand“:
    - Nummer = die Artikelnummer des Stammartikels; Bezeichnung, Einheit,
      Warengruppe vom Stammartikel (eine eigene des Lieferanten ist nicht
      überliefert); ausgelaufen wie der Stammartikel.
    - EIN Lieferant am Artikel: gilt als verifiziert — er ist der Ursprung.
    - MEHR ALS EINER: das alte Modell hat sie über die Nummer
      zusammengelegt; ob es dasselbe Produkt ist, weiß niemand. „Zu prüfen“
      — kein Vergleich, bis ein Mensch bestätigt.

  GRENZEN, wo die Herkunft fehlt:
    - Artikel ohne Preiszeile (von Hand angelegt) bleiben Stammartikel ohne
      Lieferantenartikel.
    - Artikel ohne Artikelnummer, und Nummern, die im Betrieb bei demselben
      Lieferanten an mehr als einem Artikel hängen: kein Lieferantenartikel,
      ihre Preise behalten `lieferantenartikel_id` leer („Herkunft
      unbekannt“). Die nächste Übernahme meldet eine doppelte Nummer wie
      bisher; ist sie bereinigt, übernimmt der neue Lieferantenartikel diese
      Preise.

  NICHTS WIRD UMGESCHRIEBEN: keine Einkaufspreise, keine Namen, kein
  `updated_at` (die Auslöser schweigen dafür). Ergänzt werden die neuen
  Spalten und `gueltig_bis`, das bisher nie gesetzt wurde: das Ende eines
  Preises ist der Tag vor dem nächsten desselben Lieferanten am selben
  Artikel.
*/
alter table public.material_prices disable trigger user;
alter table public.lieferantenartikel disable trigger user;

insert into public.lieferantenartikel (
  company_id, supplier_id, lieferanten_nr, bezeichnung, einheit, warengruppe, ausgelaufen,
  material_id, zuordnung, zu_pruefen
)
with paare as (
  select q.company_id, q.supplier_id, q.material_id, m.article_number as nr, m.name, m.unit, m.warengruppe,
         m.ausgelaufen
    from (select distinct p.company_id, p.supplier_id, p.material_id from public.material_prices p
           where p.material_id is not null) q
    join public.materials m on m.id = q.material_id and m.company_id = q.company_id
   where nullif(btrim(m.article_number), '') is not null
),
gezaehlt as (
  select paare.*,
         count(*) over (partition by paare.company_id, paare.supplier_id, paare.nr) as je_nummer,
         count(*) over (partition by paare.material_id) as lieferanten
    from paare
)
select g.company_id, g.supplier_id, g.nr, g.name, app.einheit_norm(g.unit), g.warengruppe, g.ausgelaufen,
       g.material_id, 'bestand', g.lieferanten > 1
  from gezaehlt g
 where g.je_nummer = 1
on conflict do nothing;

update public.material_prices p set lieferantenartikel_id = a.id
  from public.lieferantenartikel a
 where a.material_id = p.material_id and a.supplier_id = p.supplier_id
   and p.lieferantenartikel_id is null;

update public.material_prices p set gueltig_bis = n.naechster - 1
  from (select x.id, lead(x.gueltig_ab) over (partition by x.material_id, x.supplier_id order by x.gueltig_ab) as naechster
          from public.material_prices x) n
 where n.id = p.id and p.gueltig_bis is null and n.naechster is not null;

alter table public.material_prices enable trigger user;
alter table public.lieferantenartikel enable trigger user;

-- ---------------------------------------------------------------------------
-- Die Übernahme eines Katalogs
-- ---------------------------------------------------------------------------

/*
  DATANORM_UEBERNEHMEN, GANZ NEU ANGELEGT (gegen
  `20261010300000_datanorm_in_bloecken.sql`). Blockweise und fortsetzbar wie
  bisher, mit den Rechten des Aufrufers wie bisher. Je Zeile:

  1. Den Lieferantenartikel suchen (Lieferant des Laufs, Nummer) bzw.
     anlegen; Bezeichnung, Einheit, Preiseinheit, Warengruppe, EAN stehen AN
     IHM.
  2. Ist er offen (und nicht von Hand gelöst), wie bisher über die Nummer
     zum Stammartikel:
       - gibt es einen, dem noch kein Lieferantenartikel zugeordnet ist:
         zuordnen („automatisch“) — der Ein-Lieferanten-Betrieb bleibt, wie
         er war;
       - hängt an ihm schon ein Lieferantenartikel (eines anderen
         Lieferanten): NICHT zuordnen, er bleibt offen — kein Katalog
         überschreibt mehr den Artikel eines anderen;
       - gibt es keinen: wie bisher anlegen und zuordnen;
       - gibt es mehrere: abbrechen wie bisher.
  3. Zugeordnet: Name, Einheit, Warengruppe des Stammartikels nur, wenn ihm
     kein anderer Lieferant zugeordnet ist (wie bisher, sonst bleibt er).
  4. Der Preis geht an den Lieferantenartikel (und damit an seinen
     Stammartikel). Der vorige Preis bekommt sein `gueltig_bis`; ändert sich
     der Preis um mehr als die Schwelle des Betriebs, zählt er als Sprung.
  5. Der Einkaufspreis des Stammartikels: mit einem Lieferanten wie bisher
     (ein neuer ersetzt, ohne Preis bleibt der bekannte), mit mehreren nach
     der Regel `app.einkaufspreis_nachziehen`.

  SCHRITTE 4 UND 5 LAUFEN JE BLOCK IN EINEM ZUG, nicht je Zeile: gemessen
  (Wegwerf-Datenbank, 07.11.2026) kostete jede Anweisung über den
  Zeilenschutz des Aufrufers mehrere Millisekunden für Anmeldung, Betrieb und
  Rolle, und die Übernahme je Zeile in zehn Anweisungen hätte die
  Zeitgrenze von 8 s je Block deutlich näher gerückt. Was je Zeile
  geschrieben wird, ist dasselbe; nur die Preise, ihr Ende, die Sprünge und
  der Einkaufspreis gehen gesammelt am Ende des Blocks hinein. Ein Block ist
  weiter ganz oder gar nicht.

  LÖSCHSÄTZE setzen den Lieferantenartikel auf ausgelaufen; den
  Stammartikel erst, wenn alle seine Lieferantenartikel ausgelaufen sind
  (Trigger). Ein Löschsatz für eine Nummer ohne Lieferantenartikel trifft wie
  bisher einen Stammartikel mit dieser Nummer — aber nur einen ohne
  Lieferantenartikel (von Hand angelegt); einer, an dem andere Lieferanten
  hängen, ist nicht der des Löschsatzes.

  DER BERICHT nennt zusätzlich, was offen zuzuordnen blieb, und die
  Preissprünge (Zahl; die Liste liest `preisspruenge`). Die Schwelle steht
  ab dem ersten Block fest am Lauf.
*/
create or replace function public.datanorm_uebernehmen(p_lauf uuid, p_menge integer default null)
  returns jsonb
  language plpgsql
  set search_path = ''
as $$
declare
  betrieb    text := app.arbeitsbetrieb();
  lauf       public.datanorm_laeufe;
  z          public.datanorm_zeilen;
  la         public.lieferantenartikel;
  treffer    uuid[];
  satz       numeric;
  einkauf    numeric;
  liste      numeric;
  saetze     jsonb;
  heute      date := current_date;
  angelegt   integer := 0;
  geaendert  integer := 0;
  gelaufen   integer := 0;
  unbekannt  integer := 0;
  preise     integer := 0;
  ohne_satz  integer := 0;
  offen_zu   integer := 0;
  spruenge   integer := 0;
  schwelle   numeric;
  ziel       uuid;
  neu_stamm  boolean;
  bez_neu    text;
  eh_neu     text;
  pe_neu     integer;
  wg_neu     text;
  ean_neu    text;
  -- Was am Ende des Blocks in einem Zug geschrieben wird.
  b_la       uuid[] := '{}';
  b_zeile    integer[] := '{}';
  b_liste    numeric[] := '{}';
  b_satz     numeric[] := '{}';
  b_einkauf  numeric[] := '{}';
  b_gruppe   text[] := '{}';
  beruehrt   uuid[] := '{}';
  ek_artikel uuid[] := '{}';
  ek_preis   numeric[] := '{}';
  mehrere    uuid[] := '{}';
  artikel    uuid;
  anzahl     integer;
  ergebnis   jsonb;
  stand      jsonb;
  doppelt    text;
  erledigt   bigint[] := '{}';
  offen      integer;
begin
  if betrieb is null or not app.angemeldet() then
    raise exception 'Nicht angemeldet' using errcode = '42501';
  end if;
  if not app.darf_katalog_einspielen() then
    raise exception 'Einen Katalog spielt die Geschäftsführung ein — oder wer die Freigabe „Katalog einspielen“ hat'
      using errcode = '42501';
  end if;
  if p_menge is not null and p_menge < 1 then
    raise exception 'Ein Block braucht mindestens eine Zeile' using errcode = '22023';
  end if;

  -- FOR UPDATE: zwei Blöcke desselben Laufs laufen nacheinander (wie bisher).
  select * into lauf from public.datanorm_laeufe
    where id = p_lauf and company_id = betrieb
    for update;
  if not found then
    raise exception 'Lauf nicht gefunden' using errcode = 'P0002';
  end if;
  if lauf.status <> 'offen' then
    raise exception 'Dieser Lauf wurde bereits abgeschlossen' using errcode = '22023';
  end if;

  /*
    DOPPELTE ARTIKELNUMMERN VOR DEM ERSTEN BLOCK (wie bisher) — aber nur für
    die Zeilen, die über die Nummer zum Stammartikel gehen: deren
    Lieferantenartikel es noch nicht gibt oder der offen ist. Ein
    zugeordneter Lieferantenartikel weiß seinen Artikel selbst.
  */
  stand := lauf.bericht -> 'zwischenstand';
  if stand is null then
    select dz.artikelnummer into doppelt
      from public.datanorm_zeilen dz
      join public.materials m on m.company_id = betrieb and m.article_number = dz.artikelnummer
     where dz.lauf_id = p_lauf
       and not exists (
         select 1 from public.lieferantenartikel a
          where a.company_id = betrieb and a.supplier_id = lauf.supplier_id
            and a.lieferanten_nr = dz.artikelnummer
            and (a.material_id is not null or a.zuordnung = 'geloest'))
     group by dz.zeile, dz.artikelnummer
    having count(*) > 1
     order by dz.zeile
     limit 1;
    if doppelt is not null then
      raise exception 'Artikelnummer % steht im Katalog mehrfach — bitte zuerst bereinigen',
        doppelt using errcode = '23505';
    end if;
    stand := '{}'::jsonb;
  end if;
  angelegt  := coalesce((stand ->> 'angelegt')::integer, 0);
  geaendert := coalesce((stand ->> 'geaendert')::integer, 0);
  gelaufen  := coalesce((stand ->> 'ausgelaufen')::integer, 0);
  unbekannt := coalesce((stand ->> 'loeschungOhneArtikel')::integer, 0);
  preise    := coalesce((stand ->> 'preise')::integer, 0);
  ohne_satz := coalesce((stand ->> 'ohneRabattsatz')::integer, 0);
  offen_zu  := coalesce((stand ->> 'offenZuzuordnen')::integer, 0);
  spruenge  := coalesce((stand ->> 'preisspruenge')::integer, 0);
  schwelle  := coalesce(
    (stand ->> 'schwelle')::numeric,
    (select c.preissprung_schwelle_prozent from public.companies c where c.id = betrieb),
    10);
  -- Die Rabattsätze des Lieferanten einmal je Block statt einmal je Zeile.
  saetze := coalesce(
    (select jsonb_object_agg(r.gruppe, r.prozent) from public.rabattsaetze r
      where r.supplier_id = lauf.supplier_id),
    '{}'::jsonb);

  for z in select * from public.datanorm_zeilen where lauf_id = p_lauf order by zeile limit p_menge loop
    erledigt := erledigt || z.id;
    la := null;
    select * into la from public.lieferantenartikel a
      where a.company_id = betrieb and a.supplier_id = lauf.supplier_id and a.lieferanten_nr = z.artikelnummer;

    if z.verarbeitung = 'loeschung' then
      if la.id is not null then
        if not la.ausgelaufen then
          update public.lieferantenartikel set ausgelaufen = true, letzter_lauf = p_lauf where id = la.id;
        end if;
        beruehrt := beruehrt || la.id;
        gelaufen := gelaufen + 1;
        continue;
      end if;
      select array_agg(m.id) into treffer from public.materials m
        where m.company_id = betrieb and m.article_number = z.artikelnummer;
      if coalesce(cardinality(treffer), 0) > 1 then
        raise exception 'Artikelnummer % steht im Katalog mehrfach — bitte zuerst bereinigen',
          z.artikelnummer using errcode = '23505';
      end if;
      if cardinality(treffer) = 1
         and not exists (select 1 from public.lieferantenartikel a where a.material_id = treffer[1]) then
        update public.materials set ausgelaufen = true where id = treffer[1];
        gelaufen := gelaufen + 1;
        continue;
      end if;
      -- Ein Löschsatz für etwas, das dieser Lieferant hier nie geliefert hat.
      unbekannt := unbekannt + 1;
      continue;
    end if;

    satz := null;
    liste := null;
    einkauf := null;
    if z.preis is not null then
      if z.preis_art = 'netto' then
        einkauf := z.preis;
      elsif z.preis_art = 'liste' then
        liste := z.preis;
        satz := (saetze ->> coalesce(z.rabattgruppe, ''))::numeric;
        if satz is null then
          ohne_satz := ohne_satz + 1;
        else
          einkauf := round(z.preis * (1 - satz / 100), 4);
        end if;
      end if;
    end if;

    -- 1./2. Lieferantenartikel und Zuordnung über die Nummer.
    ziel := null;
    neu_stamm := false;
    if la.id is null or (la.material_id is null and la.zuordnung is distinct from 'geloest') then
      select array_agg(m.id) into treffer from public.materials m
        where m.company_id = betrieb and m.article_number = z.artikelnummer;
      if coalesce(cardinality(treffer), 0) > 1 then
        -- Zwei Artikel mit derselben Nummer: nicht entscheidbar, welcher gemeint ist.
        raise exception 'Artikelnummer % steht im Katalog mehrfach — bitte zuerst bereinigen',
          z.artikelnummer using errcode = '23505';
      end if;
      if cardinality(treffer) = 1 then
        if not exists (select 1 from public.lieferantenartikel a
                        where a.material_id = treffer[1] and a.id is distinct from la.id)
           and not (la.id is not null and exists (
             select 1 from public.material_prices p
              where p.material_id = treffer[1] and p.supplier_id = lauf.supplier_id
                and p.lieferantenartikel_id is null
                and exists (select 1 from public.material_prices q
                             where q.lieferantenartikel_id = la.id and q.gueltig_ab = p.gueltig_ab))) then
          ziel := treffer[1];
        end if;
      else
        insert into public.materials (company_id, name, article_number, unit, einkaufspreis, warengruppe)
          values (betrieb, z.name, z.artikelnummer, z.einheit, einkauf,
                  nullif(btrim(coalesce(z.warengruppe, '')), ''))
          returning id into ziel;
        neu_stamm := true;
        angelegt := angelegt + 1;
      end if;
    end if;

    if la.id is null then
      insert into public.lieferantenartikel (
        company_id, supplier_id, lieferanten_nr, ean, bezeichnung, einheit, preiseinheit, warengruppe,
        material_id, zuordnung, erster_lauf, letzter_lauf
      ) values (
        betrieb, lauf.supplier_id, z.artikelnummer, z.ean, z.name, app.einheit_norm(z.einheit), z.preiseinheit,
        nullif(btrim(coalesce(z.warengruppe, '')), ''),
        ziel, case when ziel is not null then 'automatisch' end, p_lauf, p_lauf
      ) returning * into la;
    else
      bez_neu := case when z.name = '' then la.bezeichnung else z.name end;
      eh_neu := coalesce(app.einheit_norm(z.einheit), la.einheit);
      pe_neu := coalesce(z.preiseinheit, la.preiseinheit);
      wg_neu := coalesce(nullif(btrim(coalesce(z.warengruppe, '')), ''), la.warengruppe);
      ean_neu := coalesce(z.ean, la.ean);
      -- Geschrieben wird nur, was sich ändert; dass er in diesem Lauf stand, am Ende des Blocks.
      if ziel is not null
         or (bez_neu, eh_neu, pe_neu, wg_neu, ean_neu, false)
            is distinct from (la.bezeichnung, la.einheit, la.preiseinheit, la.warengruppe, la.ean, la.ausgelaufen) then
        update public.lieferantenartikel set
          bezeichnung = bez_neu,
          einheit = eh_neu,
          preiseinheit = pe_neu,
          warengruppe = wg_neu,
          ean = ean_neu,
          ausgelaufen = false,
          letzter_lauf = p_lauf,
          material_id = coalesce(ziel, material_id),
          zuordnung = case when ziel is not null then 'automatisch' else zuordnung end
        where id = la.id
        returning * into la;
      else
        beruehrt := beruehrt || la.id;
      end if;
    end if;

    -- 3. Der Stammartikel selbst — nur, solange kein anderer Lieferant ihm zugeordnet ist.
    if la.material_id is not null and not neu_stamm then
      if not exists (select 1 from public.lieferantenartikel a
                      where a.material_id = la.material_id and a.supplier_id <> la.supplier_id) then
        update public.materials m set
          name = case when z.name = '' then m.name else z.name end,
          unit = coalesce(z.einheit, m.unit),
          warengruppe = coalesce(nullif(btrim(coalesce(z.warengruppe, '')), ''), m.warengruppe),
          ausgelaufen = false
        where m.id = la.material_id
          and (m.name, m.unit, m.warengruppe, m.ausgelaufen) is distinct from (
            case when z.name = '' then m.name else z.name end,
            app.einheit_norm(coalesce(z.einheit, m.unit)),
            coalesce(nullif(btrim(coalesce(z.warengruppe, '')), ''), m.warengruppe),
            false);
      end if;
      geaendert := geaendert + 1;
    end if;

    -- 4. Der Preis (am Ende des Blocks).
    b_la := b_la || la.id;
    b_zeile := b_zeile || z.zeile;
    b_liste := b_liste || liste;
    b_satz := b_satz || satz;
    b_einkauf := b_einkauf || einkauf;
    b_gruppe := b_gruppe || z.rabattgruppe;
    preise := preise + 1;

    -- 5. Der Einkaufspreis des Stammartikels (am Ende des Blocks).
    if la.material_id is null then
      offen_zu := offen_zu + 1;
    elsif neu_stamm then
      null;  -- Er kam mit dem neuen Artikel (Einlass `materials_felder_einlass`), wie bisher.
    elsif not exists (select 1 from public.lieferantenartikel a
                       where a.material_id = la.material_id and a.id <> la.id) then
      -- Ein Lieferant: wie bisher — ein neuer Preis ersetzt, ohne Preis bleibt der bekannte.
      if einkauf is not null then
        ek_artikel := ek_artikel || la.material_id;
        ek_preis := ek_preis || einkauf;
      end if;
    else
      mehrere := mehrere || la.material_id;
    end if;
  end loop;

  if cardinality(b_la) > 0 then
    /*
      Ein Preis je Lieferantenartikel und Tag (wie bisher je Artikel,
      Lieferant und Tag): ein zweiter Lauf am selben Tag ersetzt ihn. Steht
      eine Nummer in einem Block zweimal (die App lässt das nicht durch),
      gilt die spätere Zeile — wie bisher, als sie nacheinander schrieben.
    */
    insert into public.material_prices (
      company_id, lieferantenartikel_id, supplier_id, listenpreis, rabatt_prozent,
      einkaufspreis, rabattgruppe, gueltig_ab, lauf_id
    )
    select distinct on (x.lid) betrieb, x.lid, lauf.supplier_id, x.lp, x.rs, x.ek, x.rg, heute, p_lauf
      from unnest(b_la, b_zeile, b_liste, b_satz, b_einkauf, b_gruppe) as x(lid, zn, lp, rs, ek, rg)
     order by x.lid, x.zn desc
    on conflict (lieferantenartikel_id, gueltig_ab) do update set
      listenpreis = excluded.listenpreis,
      rabatt_prozent = excluded.rabatt_prozent,
      einkaufspreis = excluded.einkaufspreis,
      rabattgruppe = excluded.rabattgruppe,
      lauf_id = excluded.lauf_id;

    -- Der vorige Preis endet am Tag vor dem nächsten.
    update public.material_prices v set gueltig_bis = folge.naechster - 1
      from (select x.id, lead(x.gueltig_ab) over (partition by x.lieferantenartikel_id order by x.gueltig_ab) as naechster
              from public.material_prices x
             where x.lieferantenartikel_id = any (b_la)) folge
     where v.id = folge.id and v.gueltig_bis is null and folge.naechster is not null;

    /*
      PREISSPRÜNGE: der Preis von heute gegen den vorigen desselben
      Lieferantenartikels — der Einkaufspreis, wo beide einen haben, sonst
      der Listenpreis. Dieselbe Regel liest `preisspruenge` für die Liste.
    */
    select count(*) into anzahl
      from (select distinct unnest(b_la) as lid) l
      join public.material_prices p on p.lieferantenartikel_id = l.lid and p.gueltig_ab = heute
      join lateral (
        select q.einkaufspreis, q.listenpreis from public.material_prices q
         where q.lieferantenartikel_id = l.lid and q.gueltig_ab < heute
         order by q.gueltig_ab desc
         limit 1
      ) v on true
     where case
             when v.einkaufspreis is not null and p.einkaufspreis is not null
               then v.einkaufspreis > 0 and abs(p.einkaufspreis - v.einkaufspreis) * 100 > schwelle * v.einkaufspreis
             when v.listenpreis is not null and p.listenpreis is not null
               then v.listenpreis > 0 and abs(p.listenpreis - v.listenpreis) * 100 > schwelle * v.listenpreis
             else false
           end;
    spruenge := spruenge + anzahl;

    insert into public.material_einkaufspreise (company_id, material_id, einkaufspreis)
    select distinct on (x.mid) betrieb, x.mid, x.ek
      from unnest(ek_artikel, ek_preis) with ordinality as x(mid, ek, nr)
     order by x.mid, x.nr desc
    on conflict (material_id) do update set einkaufspreis = excluded.einkaufspreis;

    for artikel in select distinct u from unnest(mehrere) u loop
      perform app.einkaufspreis_nachziehen(artikel);
    end loop;
  end if;

  -- In welchem Lauf ein Lieferantenartikel zuletzt stand.
  if cardinality(beruehrt) > 0 then
    update public.lieferantenartikel set letzter_lauf = p_lauf
     where id = any (beruehrt) and letzter_lauf is distinct from p_lauf;
  end if;

  ergebnis := jsonb_build_object(
    'angelegt', angelegt,
    'geaendert', geaendert,
    'ausgelaufen', gelaufen,
    'loeschungOhneArtikel', unbekannt,
    'preise', preise,
    'ohneRabattsatz', ohne_satz,
    'offenZuzuordnen', offen_zu,
    'preisspruenge', spruenge,
    'schwelle', schwelle
  );

  delete from public.datanorm_zeilen where lauf_id = p_lauf and id = any (erledigt);
  select count(*) into offen from public.datanorm_zeilen where lauf_id = p_lauf;

  if offen > 0 then
    update public.datanorm_laeufe set
      bericht = coalesce(bericht, '{}'::jsonb) || jsonb_build_object('zwischenstand', ergebnis || jsonb_build_object('offen', offen))
    where id = p_lauf;
    return ergebnis || jsonb_build_object('fertig', false, 'offen', offen);
  end if;

  update public.datanorm_laeufe set
    status = 'uebernommen',
    abgeschlossen_am = now(),
    bericht = (coalesce(bericht, '{}'::jsonb) - 'zwischenstand') || jsonb_build_object('uebernahme', ergebnis)
  where id = p_lauf;

  return ergebnis || jsonb_build_object('fertig', true, 'offen', 0);
end;
$$;

revoke all on function public.datanorm_uebernehmen(uuid, integer) from public, anon;
grant execute on function public.datanorm_uebernehmen(uuid, integer) to authenticated;

-- ---------------------------------------------------------------------------
-- Zuordnen, als neu anlegen, lösen
-- ---------------------------------------------------------------------------

/*
  EINEM VORHANDENEN STAMMARTIKEL ZUORDNEN — „derselbe Artikel“. Bestätigt die
  Identität; wer und wann setzt die Datenbank. Auch für einen schon
  zugeordneten Lieferantenartikel: dann ist es die Bestätigung (gleicher
  Artikel) oder ein Umzug (anderer Artikel). Die Preise ziehen mit
  (Trigger); der Einkaufspreis beider Artikel wird neu bestimmt.

  Hängt am Ziel schon ein Lieferantenartikel desselben Lieferanten, wird
  abgewiesen: je Lieferant ein Lieferantenartikel am Stammartikel.
*/
create or replace function public.lieferantenartikel_zuordnen(p_id uuid, p_material uuid)
  returns jsonb
  language plpgsql
  security definer
  set search_path = ''
as $$
declare
  betrieb text := app.arbeitsbetrieb();
  la public.lieferantenartikel;
  ziel public.materials;
  anderer public.lieferantenartikel;
begin
  if betrieb is null or not app.angemeldet() then
    raise exception 'Nicht angemeldet' using errcode = '42501';
  end if;
  if not app.darf_katalog_einspielen() then
    raise exception 'Zuordnen darf, wer Kataloge einspielt — die Geschäftsführung oder wer die Freigabe „Katalog einspielen“ hat'
      using errcode = '42501';
  end if;
  if not app.modul_aktiv(betrieb, 'material.katalogversionen') then
    raise exception 'Die Kataloge mehrerer Großhändler sind in diesem Betrieb ausgeschaltet (Einstellungen → Module)'
      using errcode = '55000';
  end if;
  select * into la from public.lieferantenartikel a where a.id = p_id and a.company_id = betrieb for update;
  if la.id is null then
    raise exception 'Diesen Lieferantenartikel gibt es nicht' using errcode = 'P0002';
  end if;
  select * into ziel from public.materials m where m.id = p_material and m.company_id = betrieb;
  if ziel.id is null then
    raise exception 'Diesen Artikel gibt es im Betrieb nicht' using errcode = 'P0002';
  end if;
  select * into anderer from public.lieferantenartikel a
   where a.material_id = p_material and a.supplier_id = la.supplier_id and a.id <> la.id;
  if anderer.id is not null then
    raise exception 'Diesem Artikel ist von diesem Lieferanten schon die Nummer % zugeordnet — dort zuerst lösen', anderer.lieferanten_nr
      using errcode = '23505';
  end if;
  update public.lieferantenartikel set material_id = p_material, zuordnung = 'bestaetigt' where id = la.id;
  return jsonb_build_object('lieferantenartikel_id', la.id, 'material_id', p_material);
end;
$$;
revoke all on function public.lieferantenartikel_zuordnen(uuid, uuid) from public, anon;
grant execute on function public.lieferantenartikel_zuordnen(uuid, uuid) to authenticated;

/*
  ALS NEUEN STAMMARTIKEL anlegen — für einen offenen Lieferantenartikel, der
  zu keinem vorhandenen gehört. Bezeichnung, Einheit, Warengruppe kommen von
  ihm; die Artikelnummer auch, solange kein anderer Stammartikel sie trägt
  (sonst bliebe die Nummer im Stamm doppelt, und die nächste Übernahme mit
  dieser Nummer bräche ab). Im Lager wird er nicht geführt, wie jeder
  eingespielte Artikel. Der Einkaufspreis kommt aus seinen Preisen.
*/
create or replace function public.lieferantenartikel_als_neu(p_id uuid)
  returns jsonb
  language plpgsql
  security definer
  set search_path = ''
as $$
declare
  betrieb text := app.arbeitsbetrieb();
  la public.lieferantenartikel;
  neu uuid;
begin
  if betrieb is null or not app.angemeldet() then
    raise exception 'Nicht angemeldet' using errcode = '42501';
  end if;
  if not app.darf_katalog_einspielen() then
    raise exception 'Einen Artikel aus dem Katalog legt an, wer Kataloge einspielt'
      using errcode = '42501';
  end if;
  if not app.modul_aktiv(betrieb, 'material.katalogversionen') then
    raise exception 'Die Kataloge mehrerer Großhändler sind in diesem Betrieb ausgeschaltet (Einstellungen → Module)'
      using errcode = '55000';
  end if;
  select * into la from public.lieferantenartikel a where a.id = p_id and a.company_id = betrieb for update;
  if la.id is null then
    raise exception 'Diesen Lieferantenartikel gibt es nicht' using errcode = 'P0002';
  end if;
  if la.material_id is not null then
    raise exception 'Dieser Lieferantenartikel ist schon zugeordnet — zuerst lösen' using errcode = '55000';
  end if;
  insert into public.materials (company_id, name, article_number, unit, warengruppe, ausgelaufen)
  values (
    betrieb,
    coalesce(nullif(btrim(la.bezeichnung), ''), la.lieferanten_nr),
    case when exists (select 1 from public.materials m
                       where m.company_id = betrieb and m.article_number = la.lieferanten_nr)
         then null else la.lieferanten_nr end,
    la.einheit,
    la.warengruppe,
    la.ausgelaufen
  ) returning id into neu;
  -- Die Preise ziehen mit, der Einkaufspreis folgt aus ihnen (Trigger `lieferantenartikel_nachher`).
  update public.lieferantenartikel set material_id = neu, zuordnung = 'bestaetigt' where id = la.id;
  return jsonb_build_object('lieferantenartikel_id', la.id, 'material_id', neu);
end;
$$;
revoke all on function public.lieferantenartikel_als_neu(uuid) from public, anon;
grant execute on function public.lieferantenartikel_als_neu(uuid) to authenticated;

/*
  ZUORDNUNG LÖSEN. Der Lieferantenartikel wird offen und „gelöst“: die
  nächste Übernahme ordnet ihn nicht wieder über die Nummer zu.

  SEINE PREISE GEHEN MIT IHM. Sie sind Preise dieses Großhändlers für diesen
  Lieferantenartikel; am Stammartikel blieben sie als Preise eines Lieferanten
  stehen, der ihn nicht mehr liefert, und gingen in Vergleich und
  Einkaufspreis ein. Sie bleiben vollständig (offen, `material_id` leer) und
  kommen beim nächsten Zuordnen mit.

  DER EINKAUFSPREIS des Stammartikels wird aus den übrigen Lieferanten neu
  bestimmt; liefert keiner mehr einen, bleibt der bekannte stehen — wie bei
  der Übernahme, die einen bekannten Preis nie leert. Die Nachkalkulation
  verliert dadurch keine Zahl.
*/
create or replace function public.lieferantenartikel_loesen(p_id uuid)
  returns jsonb
  language plpgsql
  security definer
  set search_path = ''
as $$
declare
  betrieb text := app.arbeitsbetrieb();
  la public.lieferantenartikel;
begin
  if betrieb is null or not app.angemeldet() then
    raise exception 'Nicht angemeldet' using errcode = '42501';
  end if;
  if not app.darf_katalog_einspielen() then
    raise exception 'Eine Zuordnung löst, wer Kataloge einspielt' using errcode = '42501';
  end if;
  if not app.modul_aktiv(betrieb, 'material.katalogversionen') then
    raise exception 'Die Kataloge mehrerer Großhändler sind in diesem Betrieb ausgeschaltet (Einstellungen → Module)'
      using errcode = '55000';
  end if;
  select * into la from public.lieferantenartikel a where a.id = p_id and a.company_id = betrieb for update;
  if la.id is null then
    raise exception 'Diesen Lieferantenartikel gibt es nicht' using errcode = 'P0002';
  end if;
  if la.material_id is null then
    raise exception 'Dieser Lieferantenartikel ist keinem Artikel zugeordnet' using errcode = '55000';
  end if;
  update public.lieferantenartikel set material_id = null, zuordnung = 'geloest' where id = la.id;
  return jsonb_build_object('lieferantenartikel_id', la.id, 'material_id', la.material_id);
end;
$$;
revoke all on function public.lieferantenartikel_loesen(uuid) from public, anon;
grant execute on function public.lieferantenartikel_loesen(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- Lesen: Vergleich, Verlauf, Vorschlag, offene Lieferantenartikel, Sprünge
-- ---------------------------------------------------------------------------

/*
  DER VERGLEICH EINES STAMMARTIKELS — nur für wen Einkaufspreise sehen darf,
  wie `material_prices` (und der Support im Einblick, wie dort). Die
  Projektleitung bekommt ihn nie.
*/
create or replace function public.artikel_vergleich(p_material uuid)
  returns jsonb
  language plpgsql
  stable
  security definer
  set search_path = ''
as $$
declare
  betrieb text := app.lesebetrieb();
  heute date := (now() at time zone 'Europe/Vienna')::date;
  frist integer;
begin
  if betrieb is not null then
    if not app.darf_einkauf_sehen() then
      raise exception 'Den Preisvergleich sieht, wer Einkaufspreise sehen darf' using errcode = '42501';
    end if;
  else
    betrieb := app.supportbetrieb();
    if betrieb is null then
      raise exception 'Keine Anmeldung' using errcode = '42501';
    end if;
  end if;
  if not exists (select 1 from public.materials m where m.id = p_material and m.company_id = betrieb) then
    raise exception 'Diesen Artikel gibt es im Betrieb nicht' using errcode = 'P0002';
  end if;
  select c.katalog_veraltet_tage into frist from public.companies c where c.id = betrieb;
  return jsonb_build_object(
    'heute', heute,
    'frist_tage', frist,
    'basis_grund', (select s.basis_grund from app.lieferanten_stand(p_material, heute) s limit 1),
    'zeilen', coalesce((
      select jsonb_agg(jsonb_build_object(
        'lieferantenartikel_id', s.lieferantenartikel_id,
        'supplier_id', s.supplier_id,
        'lieferant', s.lieferant,
        'lieferanten_nr', s.lieferanten_nr,
        'bezeichnung', s.bezeichnung,
        'einheit', s.einheit,
        'preiseinheit', s.preiseinheit,
        'ean', s.ean,
        'zuordnung', s.zuordnung,
        'zu_pruefen', s.zu_pruefen,
        'bestaetigt_von_name', s.bestaetigt_von_name,
        'bestaetigt_am', s.bestaetigt_am,
        'ausgelaufen', s.ausgelaufen,
        'listenpreis', s.listenpreis,
        'rabatt_prozent', s.rabatt_prozent,
        'einkaufspreis', s.einkaufspreis,
        'rabattgruppe', s.rabattgruppe,
        'stand', s.stand,
        'verifiziert_durch', s.verifiziert_durch,
        'vergleichbar', s.vergleichbar,
        'grund', s.grund,
        'veraltet', s.veraltet,
        'guenstigster', s.guenstigster))
        from app.lieferanten_stand(p_material, heute) s), '[]'::jsonb)
  );
end;
$$;
revoke all on function public.artikel_vergleich(uuid) from public, anon;
grant execute on function public.artikel_vergleich(uuid) to authenticated;

/*
  DER PREISVERLAUF EINES LIEFERANTEN AM STAMMARTIKEL, jüngster zuerst: Tag,
  Preis, Änderung zum vorigen Einkaufspreis in %. Rechte wie beim Vergleich.
*/
create or replace function public.preisverlauf(p_material uuid, p_supplier uuid, p_anzahl integer default 50)
  returns table (
    gueltig_ab date,
    gueltig_bis date,
    listenpreis numeric,
    rabatt_prozent numeric,
    einkaufspreis numeric,
    rabattgruppe text,
    aenderung_prozent numeric
  )
  language plpgsql
  stable
  security definer
  set search_path = ''
as $$
#variable_conflict use_column
declare
  betrieb text := app.lesebetrieb();
  la uuid;
begin
  if betrieb is not null then
    if not app.darf_einkauf_sehen() then
      raise exception 'Den Preisverlauf sieht, wer Einkaufspreise sehen darf' using errcode = '42501';
    end if;
  else
    betrieb := app.supportbetrieb();
    if betrieb is null then
      raise exception 'Keine Anmeldung' using errcode = '42501';
    end if;
  end if;
  if p_anzahl is null or p_anzahl < 1 or p_anzahl > 500 then
    raise exception 'Zwischen 1 und 500 Einträge' using errcode = '22023';
  end if;
  if not exists (select 1 from public.materials m where m.id = p_material and m.company_id = betrieb) then
    raise exception 'Diesen Artikel gibt es im Betrieb nicht' using errcode = 'P0002';
  end if;
  select a.id into la from public.lieferantenartikel a
   where a.material_id = p_material and a.supplier_id = p_supplier and a.company_id = betrieb;
  return query
    with zeilen as (
      select p.gueltig_ab as ab, p.gueltig_bis as bis, p.listenpreis as lp, p.rabatt_prozent as rp,
             p.einkaufspreis as ek, p.rabattgruppe as rg
        from public.material_prices p
       where p.company_id = betrieb
         and (case when la is not null then p.lieferantenartikel_id = la
                   else p.material_id = p_material and p.supplier_id = p_supplier
                        and p.lieferantenartikel_id is null end)
    ),
    mit as (
      select zeilen.*, lag(zeilen.ek) over (order by zeilen.ab) as ek_vorher from zeilen
    )
    select mit.ab, mit.bis, mit.lp, mit.rp, mit.ek, mit.rg,
           case when mit.ek_vorher > 0 and mit.ek is not null
                then round((mit.ek - mit.ek_vorher) * 100 / mit.ek_vorher, 1) end
      from mit
     order by mit.ab desc
     limit p_anzahl;
end;
$$;
revoke all on function public.preisverlauf(uuid, uuid, integer) from public, anon;
grant execute on function public.preisverlauf(uuid, uuid, integer) to authenticated;

/*
  DIE DREI TEILE IM REGISTER DES SERVERS (V3, E56). `app.modul_register()`
  ist die Liste, nach der `app.modul_aktiv` rechnet; sie muss dieselben
  Kennungen und Standards tragen wie `MODULE` in `src/lib/module.ts`
  (`modulRegisterServer.test.ts` vergleicht beide).
*/
create or replace function app.modul_register()
  returns table (kennung text, standard boolean, abhaengig_von text[])
  language sql
  immutable
  security definer
  set search_path = ''
as $$
  values
    ('einsatzplanung', true, '{}'::text[]),
    ('material', true, '{}'::text[]),
    ('material.katalogversionen', true, '{}'::text[]),
    ('material.lieferantenvergleich', true, '{}'::text[]),
    ('material.katalogpreisverlauf', true, '{}'::text[]),
    ('urlaub', true, '{}'::text[]),
    ('scheine', true, '{}'::text[]),
    ('angebote', true, '{}'::text[]),
    ('angebote.online_annahme', true, '{}'::text[]),
    ('rechnungen', true, '{}'::text[]),
    ('nachkalkulation', true, '{rechnungen}'::text[]),
    ('wartung', true, '{}'::text[]),
    ('zeitkonten', true, '{}'::text[])
$$;
revoke all on function app.modul_register() from public, anon, authenticated;

/*
  IST DER PREISVERGLEICH FÜR DIESEN BETRIEB AN (Unterfähigkeit
  `material.lieferantenvergleich`, N02)? Ein eigener Name, weil die
  Vorschlagsregel ihn an mehreren Stellen fragt.
*/
create or replace function app.lieferantenvergleich_an(p_betrieb text) returns boolean
  language sql
  stable
  security definer
  set search_path = ''
as $$
  select app.modul_aktiv(p_betrieb, 'material.lieferantenvergleich');
$$;
revoke all on function app.lieferantenvergleich_an(text) from public, anon, authenticated;

/*
  WELCHER GROSSHÄNDLER FÜR DIE EINKAUFSLISTE (E03): der günstigste
  vergleichbare; gibt es keinen, wie bisher der mit dem jüngsten Preis bis
  heute (Wiener Datum), dieselbe Abfrage wie bisher.

  IST DER PREISVERGLEICH AUSGESCHALTET, gilt wieder nur der jüngste: ohne
  die Ansicht bliebe ein anderer Vorschlag unerklärt. Der Einkaufspreis des
  Stammartikels folgt dem Schalter nicht (`app.einkaufspreis_nachziehen`).
*/
create or replace function app.lieferant_vorschlag_wahl(p_betrieb text, p_material uuid)
  returns table (supplier_id uuid, grund text, einkaufspreis numeric, stand date)
  language plpgsql
  stable
  set search_path = ''
as $$
#variable_conflict use_column
declare
  heute date := (now() at time zone 'Europe/Vienna')::date;
begin
  if not exists (select 1 from public.materials m where m.id = p_material and m.company_id = p_betrieb) then
    return;
  end if;
  if app.lieferantenvergleich_an(p_betrieb) then
    return query
      select s.supplier_id, 'guenstigster'::text, s.einkaufspreis, s.stand
        from app.lieferanten_stand(p_material, heute) s
       where s.guenstigster
       order by s.stand desc, s.lieferant, s.supplier_id
       limit 1;
    if found then
      return;
    end if;
  end if;
  return query
    select p.supplier_id, 'juengster'::text, p.einkaufspreis, p.gueltig_ab
      from public.material_prices p
     where p.company_id = p_betrieb
       and p.material_id = p_material
       and p.gueltig_ab <= heute
     order by p.gueltig_ab desc
     limit 1;
end;
$$;
revoke all on function app.lieferant_vorschlag_wahl(text, uuid) from public, anon, authenticated;

/*
  Wie bisher: fragen darf, wer die Einkaufsliste führt, und der Support im
  Einblick. Ohne Preis — der Grund steht in `lieferant_vorschlag_grund`.
*/
create or replace function public.lieferant_vorschlag(p_material uuid)
returns uuid
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  betrieb text := app.lesebetrieb();
  lieferant uuid;
begin
  if betrieb is not null then
    if not (app.hat_rolle(array['Verwaltung']) or app.ist_fuehrung()) then
      raise exception 'Den Einkauf führen Verwaltung und Führung' using errcode = '42501';
    end if;
  else
    betrieb := app.supportbetrieb();
    if betrieb is null then
      raise exception 'Keine Anmeldung' using errcode = '42501';
    end if;
  end if;
  select w.supplier_id into lieferant from app.lieferant_vorschlag_wahl(betrieb, p_material) w;
  return lieferant;
end;
$$;

revoke execute on function public.lieferant_vorschlag(uuid) from public, anon;
grant execute on function public.lieferant_vorschlag(uuid) to authenticated;

/*
  DER GRUND DES VORSCHLAGS — „günstigster“ (mit Preis und Stand) oder
  „jüngster Stand“. Er verrät Einkaufspreise, also nur für die, die sie
  sehen dürfen und den Einkauf führen.
*/
create or replace function public.lieferant_vorschlag_grund(p_material uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  betrieb text := app.lesebetrieb();
  w record;
begin
  if betrieb is not null then
    if not ((app.hat_rolle(array['Verwaltung']) or app.ist_fuehrung()) and app.darf_einkauf_sehen()) then
      raise exception 'Den Grund des Vorschlags sieht, wer Einkaufspreise sehen darf' using errcode = '42501';
    end if;
  else
    betrieb := app.supportbetrieb();
    if betrieb is null then
      raise exception 'Keine Anmeldung' using errcode = '42501';
    end if;
  end if;
  select * into w from app.lieferant_vorschlag_wahl(betrieb, p_material);
  if w.supplier_id is null then
    return null;
  end if;
  return jsonb_build_object('supplier_id', w.supplier_id, 'grund', w.grund,
                            'einkaufspreis', w.einkaufspreis, 'stand', w.stand);
end;
$$;
revoke all on function public.lieferant_vorschlag_grund(uuid) from public, anon;
grant execute on function public.lieferant_vorschlag_grund(uuid) to authenticated;

/*
  DIE OFFENEN LIEFERANTENARTIKEL, seitenweise, mit Suche — die Arbeitsliste
  dessen, der Kataloge einspielt. Ausgelaufene stehen nicht darin (es gibt
  nichts mehr zuzuordnen).

  JE ZEILE BIS ZU FÜNF VORSCHLÄGE:
    1. gleiche Nummer — ein Stammartikel mit dieser Artikelnummer oder einer,
       dem ein anderer Lieferant sie zugeordnet hat;
    2. gleiche EAN bei einem zugeordneten Lieferantenartikel;
    3. ähnliche Bezeichnung über die Suche des Katalogs (Trigramm-Index
       `materials_suche`, dieselbe Spalte), die drei ähnlichsten.
  Vorschläge entscheiden nichts: zugeordnet wird von Hand.
*/
create or replace function public.offene_lieferantenartikel(
  p_suche text default '', p_von integer default 0, p_anzahl integer default 20)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  betrieb text := app.arbeitsbetrieb();
  muster text;
begin
  if betrieb is null or not app.angemeldet() then
    raise exception 'Nicht angemeldet' using errcode = '42501';
  end if;
  if not app.darf_katalog_einspielen() then
    raise exception 'Offene Lieferantenartikel ordnet zu, wer Kataloge einspielt' using errcode = '42501';
  end if;
  if p_von is null or p_von < 0 or p_anzahl is null or p_anzahl < 1 or p_anzahl > 100 then
    raise exception 'Seite außerhalb der Grenzen' using errcode = '22023';
  end if;
  muster := nullif(btrim(coalesce(p_suche, '')), '');
  if muster is not null then
    muster := '%' || replace(replace(replace(muster, '\', '\\'), '%', '\%'), '_', '\_') || '%';
  end if;
  return (
    with offen as (
      select a.*, s.name as lieferant
        from public.lieferantenartikel a
        join public.suppliers s on s.id = a.supplier_id
       where a.company_id = betrieb and a.material_id is null and not a.ausgelaufen
         and (muster is null
              or (coalesce(a.bezeichnung, '') || ' ' || a.lieferanten_nr) ilike muster
              or s.name ilike muster)
    ),
    seite as (
      select * from offen order by offen.lieferant, offen.lieferanten_nr, offen.id offset p_von limit p_anzahl
    )
    select jsonb_build_object(
      'gesamt', (select count(*) from offen),
      'zeilen', coalesce((
        select jsonb_agg(jsonb_build_object(
          'id', x.id,
          'supplier_id', x.supplier_id,
          'lieferant', x.lieferant,
          'lieferanten_nr', x.lieferanten_nr,
          'bezeichnung', x.bezeichnung,
          'einheit', x.einheit,
          'ean', x.ean,
          'zuordnung', x.zuordnung,
          'bestaetigt_von_name', x.bestaetigt_von_name,
          'bestaetigt_am', x.bestaetigt_am,
          'vorschlaege', coalesce((
            select jsonb_agg(jsonb_build_object('material_id', v.id, 'name', v.name,
                                                'article_number', v.article_number, 'grund', v.grund)
                             order by v.rang, v.name)
              from (
                select distinct on (k.id) k.id, k.name, k.article_number, k.grund, k.rang
                  from (
                    select m.id, m.name, m.article_number, 'nummer'::text as grund, 1 as rang
                      from public.materials m
                     where m.company_id = betrieb
                       and (m.article_number = x.lieferanten_nr
                            or m.id in (select b.material_id from public.lieferantenartikel b
                                         where b.company_id = betrieb and b.lieferanten_nr = x.lieferanten_nr
                                           and b.material_id is not null and b.id <> x.id))
                    union all
                    select m.id, m.name, m.article_number, 'ean', 2
                      from public.materials m
                     where x.ean is not null
                       and m.id in (select b.material_id from public.lieferantenartikel b
                                     where b.company_id = betrieb and b.ean = x.ean
                                       and b.material_id is not null and b.id <> x.id)
                    union all
                    select t.id, t.name, t.article_number, 'bezeichnung', 3
                      from (
                        select m.id, m.name, m.article_number
                          from public.materials m
                         where m.company_id = betrieb
                           and btrim(x.bezeichnung) <> ''
                           and (coalesce(m.name, '') || ' ' || coalesce(m.article_number, ''))
                               operator(public.%) x.bezeichnung
                         order by public.similarity(coalesce(m.name, '') || ' ' || coalesce(m.article_number, ''),
                                                    x.bezeichnung) desc
                         limit 3
                      ) t
                  ) k
                 order by k.id, k.rang
              ) v
          ), '[]'::jsonb)
        ) order by x.lieferant, x.lieferanten_nr, x.id)
        from seite x
      ), '[]'::jsonb)
    )
  );
end;
$$;
revoke all on function public.offene_lieferantenartikel(text, integer, integer) from public, anon;
grant execute on function public.offene_lieferantenartikel(text, integer, integer) to authenticated;

/*
  DIE PREISSPRÜNGE EINES LAUFS (E04), seitenweise, größter zuerst: je Preis
  dieses Laufs gegen den vorigen desselben Lieferantenartikels — der
  Einkaufspreis, wo beide einen haben, sonst der Listenpreis. Die Schwelle
  ist die, mit der der Lauf übernommen wurde.

  Lesen wie die Preise selbst: wer Einkaufspreise sehen darf.

  GRENZE: Ein zweiter Lauf desselben Lieferanten am selben Tag überschreibt
  die Preise des ersten (ein Preis je Tag, wie bisher); dessen Sprünge stehen
  danach beim zweiten.
*/
create or replace function public.preisspruenge(p_lauf uuid, p_von integer default 0, p_anzahl integer default 20)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  betrieb text := app.lesebetrieb();
  lauf public.datanorm_laeufe;
  schwelle numeric;
begin
  if betrieb is not null then
    if not app.darf_einkauf_sehen() then
      raise exception 'Preissprünge sieht, wer Einkaufspreise sehen darf' using errcode = '42501';
    end if;
  else
    betrieb := app.supportbetrieb();
    if betrieb is null then
      raise exception 'Keine Anmeldung' using errcode = '42501';
    end if;
  end if;
  if p_von is null or p_von < 0 or p_anzahl is null or p_anzahl < 1 or p_anzahl > 200 then
    raise exception 'Seite außerhalb der Grenzen' using errcode = '22023';
  end if;
  select * into lauf from public.datanorm_laeufe l where l.id = p_lauf and l.company_id = betrieb;
  if lauf.id is null then
    raise exception 'Lauf nicht gefunden' using errcode = 'P0002';
  end if;
  schwelle := coalesce(
    (lauf.bericht -> 'uebernahme' ->> 'schwelle')::numeric,
    (lauf.bericht -> 'zwischenstand' ->> 'schwelle')::numeric,
    (select c.preissprung_schwelle_prozent from public.companies c where c.id = betrieb));
  return (
    with paare as (
      select p.lieferantenartikel_id, p.material_id,
             case when v.einkaufspreis is not null and p.einkaufspreis is not null then 'einkauf'
                  when v.listenpreis is not null and p.listenpreis is not null then 'liste' end as art,
             case when v.einkaufspreis is not null and p.einkaufspreis is not null then v.einkaufspreis
                  when v.listenpreis is not null and p.listenpreis is not null then v.listenpreis end as alt,
             case when v.einkaufspreis is not null and p.einkaufspreis is not null then p.einkaufspreis
                  when v.listenpreis is not null and p.listenpreis is not null then p.listenpreis end as neu,
             v.gueltig_ab as seit
        from public.material_prices p
        join lateral (
          select q.einkaufspreis, q.listenpreis, q.gueltig_ab
            from public.material_prices q
           where q.lieferantenartikel_id = p.lieferantenartikel_id and q.gueltig_ab < p.gueltig_ab
           order by q.gueltig_ab desc
           limit 1
        ) v on true
       where p.lauf_id = p_lauf and p.company_id = betrieb and p.lieferantenartikel_id is not null
    ),
    spruenge as (
      select paare.*, round((paare.neu - paare.alt) * 100 / paare.alt, 1) as prozent
        from paare
       where paare.alt > 0 and abs(paare.neu - paare.alt) * 100 > schwelle * paare.alt
    )
    select jsonb_build_object(
      'schwelle', schwelle,
      'gesamt', (select count(*) from spruenge),
      'zeilen', coalesce((
        select jsonb_agg(jsonb_build_object(
          'lieferantenartikel_id', x.lieferantenartikel_id,
          'material_id', x.material_id,
          'lieferanten_nr', x.lieferanten_nr,
          'bezeichnung', x.bezeichnung,
          'artikel', x.artikel,
          'art', x.art,
          'alt', x.alt,
          'neu', x.neu,
          'prozent', x.prozent,
          'seit', x.seit) order by abs(x.prozent) desc, x.lieferanten_nr)
          from (
            select s.*, a.lieferanten_nr, a.bezeichnung, m.name as artikel
              from spruenge s
              join public.lieferantenartikel a on a.id = s.lieferantenartikel_id
              left join public.materials m on m.id = s.material_id
             order by abs(s.prozent) desc, a.lieferanten_nr
            offset p_von limit p_anzahl
          ) x
      ), '[]'::jsonb)
    )
  );
end;
$$;
revoke all on function public.preisspruenge(uuid, integer, integer) from public, anon;
grant execute on function public.preisspruenge(uuid, integer, integer) to authenticated;

-- ---------------------------------------------------------------------------
-- Die Katalogsuche findet auch über die Nummer des Großhändlers und die EAN
-- ---------------------------------------------------------------------------

/*
  WER EINEN ARTIKEL SUCHT, HAT OFT DIE NUMMER EINES GROSSHÄNDLERS IN DER HAND
  (Lieferschein, Verpackung) — und die ist seit M03a nicht mehr unbedingt die
  Artikelnummer des Stammartikels: ein als „derselbe Artikel“ zugeordneter
  Großhändler führt ihn unter seiner eigenen. Diese Funktion nennt die
  Stammartikel, deren zugeordnete Lieferantenartikel die Nummer enthalten
  oder genau diese EAN tragen; die Suchen der App nehmen sie zu ihren
  Treffern dazu.

  NUR KENNUNG, NUMMER UND GROSSHÄNDLER, KEIN PREIS. Suchen darf jedes
  Mitglied — der Monteur fordert an und schreibt Material auf den Schein, auch
  er hat die Nummer von der Verpackung. Die Tabelle selbst liest er nicht.

  SKALIERBAR: erst ab drei Zeichen (darunter trägt kein Trigramm-Index, und
  die Suche nach Name und Artikelnummer deckt es ohnehin), über den
  Trigramm-Index auf der Nummer und den EAN-Index; höchstens `p_anzahl`
  Treffer. Die eigene Nummer des Stammartikels findet schon die bisherige
  Suche; sie steht hier nicht noch einmal.
*/
create index if not exists lieferantenartikel_nummer_trgm
  on public.lieferantenartikel using gin (lieferanten_nr gin_trgm_ops) where material_id is not null;

create or replace function public.katalog_nummern_suche(p_begriff text, p_anzahl integer default 20)
returns table (material_id uuid, nummer text, art text, lieferant text)
language plpgsql
stable
security definer
set search_path = ''
as $$
#variable_conflict use_column
declare
  betrieb text := app.lesebetrieb();
  begriff text := btrim(coalesce(p_begriff, ''));
  muster text;
begin
  if betrieb is null then
    betrieb := app.supportbetrieb();
    if betrieb is null then
      raise exception 'Keine Anmeldung' using errcode = '42501';
    end if;
  end if;
  if p_anzahl is null or p_anzahl < 1 or p_anzahl > 100 then
    raise exception 'Zwischen 1 und 100 Treffer' using errcode = '22023';
  end if;
  if length(begriff) < 3 then
    return;
  end if;
  muster := '%' || replace(replace(replace(begriff, '\', '\\'), '%', '\%'), '_', '\_') || '%';
  return query
    select t.material_id, t.nummer, t.art, t.lieferant
      from (
        select distinct on (a.material_id)
               a.material_id,
               case when a.ean = begriff then a.ean else a.lieferanten_nr end as nummer,
               case when a.ean = begriff then 'ean' else 'lieferant' end as art,
               s.name as lieferant
          from public.lieferantenartikel a
          join public.materials m on m.id = a.material_id
          join public.suppliers s on s.id = a.supplier_id
         where a.company_id = betrieb
           and a.material_id is not null
           and (a.ean = begriff
                or (a.lieferanten_nr ilike muster and a.lieferanten_nr is distinct from m.article_number))
         order by a.material_id, (a.ean = begriff) desc nulls last, s.name
      ) t
     order by t.nummer, t.material_id
     limit p_anzahl;
end;
$$;
revoke all on function public.katalog_nummern_suche(text, integer) from public, anon;
grant execute on function public.katalog_nummern_suche(text, integer) to authenticated;

-- ---------------------------------------------------------------------------
-- Datenauskunft: wer zugeordnet hat, gehört der Person
-- ---------------------------------------------------------------------------

/*
  Gezielt eingefügt wie E50, M01b, M01d; wiederholbar, und ohne Einfügestelle
  bricht die Migration ab. Bei der Person steht als Bearbeiter die Anzahl der
  Lieferantenartikel, deren Zuordnung sie von Hand entschieden hat — der
  Inhalt ist Katalog des Betriebs.

  Die Löschung einer Person ändert nichts (wie „wer verworfen hat“, „wer den
  Katalog eingespielt hat“): ihr Konto bleibt deaktiviert stehen, und
  Kennung und Name am Lieferantenartikel sind die Angabe, wer eine
  Zuordnung entschieden hat.
*/
do $migration$
declare quelle text; marke text;
begin
  quelle := pg_get_functiondef('public.person_auskunft(text,uuid,integer)'::regprocedure);
  if position('lieferantenartikel_zugeordnet' in quelle) = 0 then
    marke := $m$where l.company_id = betrieb and l.angelegt_von = p_id),$m$;
    if (length(quelle) - length(replace(quelle, marke, ''))) / length(marke) <> 1 then
      raise exception 'Personenauskunft: Einfügestelle Kataloge fehlt oder ist nicht eindeutig';
    end if;
    quelle := replace(quelle, marke, marke || $eintrag$
      -- M03a: Lieferantenartikel, deren Zuordnung sie von Hand entschieden hat.
      'lieferantenartikel_zugeordnet', (select count(*) from public.lieferantenartikel a
        where a.company_id = betrieb and a.bestaetigt_von_uid = p_id),$eintrag$);
    execute quelle;
  end if;
end;
$migration$;
