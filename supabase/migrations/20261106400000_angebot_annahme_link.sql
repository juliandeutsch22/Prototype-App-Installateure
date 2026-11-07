/*
  ANGEBOTSANNAHME PER LINK (M02a, A06, 06.11.2026)

  WAS FEHLTE. Ein Angebot ließ sich nur im Büro annehmen („Annehmen →
  Baustelle“). Der Kunde, der per Mail zusagt, musste abgeschrieben werden;
  einen Nachweis, WER WANN WAS angenommen hat, gab es nicht.

  WAS SICH ÄNDERT.
  - Die Führung erzeugt für einen Entwurf oder ein versendetes Angebot einen
    Annahme-Link. Abrechnungsart und Nummernvorsatz der Baustelle stehen
    dabei fest (E51, V4): ohne beides kein Link. Ein Entwurf wird damit
    „Versendet“ — der Link IST der Versand.
  - Der Link zeigt einen unveränderlichen Stand (Schnappschuss) mit
    Prüfsumme. Die Datenbank kennt nur den SHA-256-Hashwert des Schlüssels
    (wie das Kalender-Abo); den Schlüssel sieht die Führung genau einmal.
  - Der Kunde öffnet ihn ohne Anmeldung über die Edge Function
    `angebot-annahme` (Dienstschlüssel), nimmt mit Name, Häkchen und
    Unterschrift an oder lehnt mit Name und Grund ab.
  - Die Annahme läuft über denselben SQL-Kern wie die interne Annahme
    (`app.angebot_annehmen_kern`): dieselbe Baustelle, dieselben ersetzten
    Fassungen. `angebot_annehmen` behält Signatur, Rechteprüfung und
    Verhalten; nur der Rumpf ist in Prüfung und Kern geteilt.
  - Die Unterfähigkeit `angebote.online_annahme` (Standard: an) wird hier
    zum ersten Mal auf dem Server geprüft (E51, V3): `app.modul_aktiv` folgt
    derselben Regel wie `aktiveSchalter` in `src/lib/module.ts`.

  WARUM DER NUMMERNZÄHLER EINEN KERN BEKOMMT. `naechste_nummer` fragt nach
  der Anmeldung (`app.arbeitsbetrieb()`, `app.angemeldet()`). Die Annahme
  über den Link hat keine — sie läuft mit dem Dienstschlüssel. Statt den
  Zähler ein zweites Mal zu schreiben, ist sein Rumpf jetzt
  `app.naechste_nummer_kern`; `naechste_nummer` prüft wie bisher und ruft ihn.
  Für jeden bisherigen Aufrufer ist das dieselbe Rechnung mit demselben
  Betrieb (`app.arbeitsbetrieb()`).

  WAS DER DIENSTSCHLÜSSEL AUSLÄSST. Die Auslöser an `quotes` lassen den
  Dienstschlüssel durch (Rücklauf einer Sicherung): `quotes_fassung_pruefen`,
  `quotes_papierkorb`, `quotes_status_zeit`, `quotes_aussteller` und das
  Journal. Die Link-Funktionen tun deshalb ausdrücklich, was diese Auslöser
  bei der internen Annahme tun — Stand prüfen (nur „Versendet“), keine
  andere Fassung angenommen, `angenommen_am` bzw. `abgelehnt_am` setzen, die
  Firmendaten eines ersetzten Entwurfs festhalten, die Journalzeilen
  schreiben (Akteur „Kunde über Link: <Name>“). `tests/supabase/angebotLink.test.ts`
  vergleicht beide Wege Feld für Feld.

  DATENSPARSAMKEIT (U05). Vom Öffnen bleiben Zeitpunkt (erstes, letztes)
  und Anzahl — keine IP-Adresse, kein Gerät. Für den Nachweis der Annahme
  zählen Name, Unterschrift, Zeitpunkt und die Prüfsumme des angenommenen
  Stands; ein Gerät oder eine Adresse belegte nichts darüber hinaus und
  wäre ein weiteres Personendatum des Kunden.

  RATE-LIMIT NUR JE LINK. Je Link höchstens 60 Anfragen (Öffnen, Annehmen,
  Ablehnen) in einer Stunde; darüber antwortet der Link „zu viele“, ohne zu
  protokollieren. Kein Zähler je Abrufer:
  - Die Adresse des Abrufers ist hinter der Kette aus Proxys nicht
    verlässlich bestimmbar — der erste Eintrag von `X-Forwarded-For` kommt
    vom Aufrufer selbst (örtlich nachgestellt: Kong hängt nur an). Eine
    Grenze darauf hielte genau den nicht auf, gegen den sie gedacht ist,
    und kostete dafür ein Personendatum.
  - Ein Zähler je Abrufer in der Datenbank schriebe bei jedem falschen
    Schlüssel eine Zeile — das Gegenteil von „falsche Schlüssel belasten die
    Datenbank nicht“. Im Speicher der Function lebt er nicht verlässlich:
    eine Function-Instanz endet nach ihrer Laufzeitgrenze.
  - Raten ist bei 256 Bit zwecklos. Ein falsch geformter Schlüssel kommt gar
    nicht bis hierher (Form-Prüfung in der Function); ein wohlgeformter
    unbekannter kostet eine Abfrage auf einen eindeutigen Index und
    schreibt nichts.
*/

-- ---------------------------------------------------------------------------
-- Der Kern des Nummernzählers
-- ---------------------------------------------------------------------------

/*
  Der Rumpf von `naechste_nummer` (20260929120000_support_arbeitet_mit.sql)
  ab dem Zähler, unverändert; der Betrieb kommt als Argument. Keine
  Rechteprüfung — die hat, wer ihn ruft. Für niemanden sonst ausführbar.
*/
create or replace function app.naechste_nummer_kern(p_betrieb text, p_art text, p_jahr integer, p_wunsch integer)
  returns integer
  language plpgsql
  security definer
  set search_path = ''
as $$
declare
  letzte integer;
  neu integer;
begin
  insert into public.number_counters (company_id, art, jahr, stand)
       values (p_betrieb, p_art, p_jahr, app.hoechste_lfd(p_art, p_betrieb, p_jahr))
  on conflict (company_id, art, jahr) do nothing;

  select c.stand into letzte from public.number_counters c
   where c.company_id = p_betrieb and c.art = p_art and c.jahr = p_jahr
     for update;

  /*
    ANGEBOTE UND BAUSTELLEN kann auch ein Mensch nummerieren — eine
    Baustelle mit der Nummer des Bauträgers, die zufällig ins Schema fällt.
    Der Zähler springt über jede, die es schon gibt, statt sie ein zweites
    Mal anzubieten. Rechnungen nicht: die vergibt nur er.
  */
  if p_art in ('quotes', 'projects') then
    letzte := greatest(letzte, app.hoechste_lfd(p_art, p_betrieb, p_jahr));
  end if;

  if p_wunsch is null or (letzte > 0 and p_wunsch = letzte + 1) then
    neu := case
             when letzte > 0 then letzte + 1
             when p_art = 'invoices' then 1001
             else 1
           end;
  else
    if p_wunsch < 1 then
      raise exception 'Eine Rechnungsnummer braucht eine ganze laufende Nummer.'
        using errcode = '22023';
    end if;
    if p_wunsch <= letzte then
      raise exception 'Die Nummer % ist bereits vergeben. Die nächste freie ist %.',
        to_char(p_wunsch, 'FM0000'), to_char(letzte + 1, 'FM0000')
        using errcode = '23505';
    end if;
    if p_art = 'invoices' and (letzte > 0 or exists (
         select 1 from public.invoices i where i.company_id = p_betrieb)) then
      raise exception 'Rechnungsnummern laufen lückenlos — die nächste ist %. Eine eigene Nummer geht nur bei der allerersten Rechnung, beim Umstieg aus dem bisherigen Programm.',
        to_char(letzte + 1, 'FM0000')
        using errcode = '22023';
    end if;
    neu := p_wunsch;
  end if;

  update public.number_counters
     set stand = neu, updated_at = now()
   where company_id = p_betrieb and art = p_art and jahr = p_jahr;

  return neu;
end;
$$;

revoke all on function app.naechste_nummer_kern(text, text, integer, integer) from public, anon, authenticated;

/* Signatur, Prüfungen und Meldungen wie bisher — nur der Zähler steht im Kern. */
create or replace function public.naechste_nummer(
  p_art text,
  p_jahr integer,
  p_seed integer default 0,
  p_wunsch integer default null
) returns integer
  language plpgsql
  security definer
  set search_path = ''
as $$
declare
  betrieb text;
begin
  betrieb := app.arbeitsbetrieb();
  if betrieb is null or not app.angemeldet() then
    raise exception 'Nicht angemeldet' using errcode = '42501';
  end if;
  /*
    RECHNUNGSNUMMERN NICHT FÜR DEN SUPPORT. Eine Rechnung legt er nicht an —
    sie greift in die Zeitbuchungen, und die bleiben ihm verschlossen. Eine
    Nummer, die er zöge, würde deshalb nie eine Rechnung; in einer
    lückenlosen Folge wäre sie ein Loch, das der Betrieb dem Finanzamt
    erklären müsste.
  */
  if p_art = 'invoices' and app.ist_plattform() then
    raise exception 'Rechnungsnummern vergibt nur der Betrieb selbst — Rechnungen gehen im Supportzugang nicht'
      using errcode = '42501';
  end if;
  if p_art = 'invoices' and not app.ist_buch_oder_spitze() then
    raise exception 'Nur die Buchhaltung vergibt Rechnungsnummern' using errcode = '42501';
  end if;
  if p_art = 'quotes' and not (app.ist_fuehrung() or app.ist_buch_oder_spitze()) then
    raise exception 'Nur die Führung vergibt Angebotsnummern' using errcode = '42501';
  end if;
  if p_art = 'projects' and not app.ist_fuehrung() then
    raise exception 'Nur die Führung vergibt Baustellennummern' using errcode = '42501';
  end if;

  return app.naechste_nummer_kern(betrieb, p_art, p_jahr, p_wunsch);
end;
$$;

-- ---------------------------------------------------------------------------
-- Die Annahme: Prüfung und Kern getrennt
-- ---------------------------------------------------------------------------

/*
  DER KERN DER ANNAHME — der Rumpf von `angebot_annehmen`
  (20261027400200_r6_angebot_fassungen.sql) ab dem gesperrten Angebot, in
  derselben Reihenfolge und mit denselben Meldungen. Keine Rechteprüfung:
  die hat der Aufrufer (`angebot_annehmen` intern, `angebot_link_annehmen`
  mit dem Dienstschlüssel). Die Nummer zieht er aus dem Kern des Zählers,
  mit dem Betrieb des Angebots — derselbe, den `naechste_nummer` für jeden
  Aufrufer von `angebot_annehmen` aus der Anmeldung nahm.
*/
create or replace function app.angebot_annehmen_kern(p_angebot uuid, p_praefix text, p_abrechnung text)
  returns text
  language plpgsql
  security definer
  set search_path = ''
as $$
declare q public.quotes; k public.customers; nummer text; jahr integer; lfd bigint;
begin
  select * into q from public.quotes where id = p_angebot for update;
  if q.id is null then raise exception 'Angebot nicht gefunden' using errcode = 'P0002'; end if;
  if p_abrechnung is null or p_abrechnung not in ('Regie', 'Pauschal', 'Einheitspreis') then
    raise exception 'Unbekannte Abrechnungsart' using errcode = '22023';
  end if;
  -- G15: vor dem Zähler, damit keine Baustellennummer für nichts vergeben wird.
  if q.status = 'Ersetzt' then
    raise exception 'Angebot % ist durch eine andere Fassung ersetzt', q.quote_number using errcode = '55000';
  end if;
  select project_number into nummer from public.projects
    where company_id = q.company_id and project_number = q.project_number;
  if nummer is null then
    jahr := extract(year from now() at time zone 'Europe/Vienna');
    lfd := app.naechste_nummer_kern(q.company_id, 'projects', jahr, null);
    nummer := case when coalesce(p_praefix, '') = '' then '' else p_praefix || '-' end
      || jahr || '-' || lpad(lfd::text, greatest(4, length(lfd::text)), '0');
    -- Hinweis 11: der Ansprechpartner aus der Kundenakte, änderbar in der Baustelle.
    select * into k from public.customers where id = q.customer_id and company_id = q.company_id;
    insert into public.projects(company_id, project_number, customer_id, customer_name, address,
      status, billing_mode, estimated_hours, description, contact_name, contact_phone)
    values(q.company_id, nummer, q.customer_id, q.customer_name, q.address, 'Aktiv', p_abrechnung,
      case when q.kalkulierte_stunden > 0 then q.kalkulierte_stunden end,
      coalesce(nullif(btrim(q.notes), '') || E'\n\n', '') || 'Aus Angebot ' || q.quote_number,
      nullif(btrim(coalesce(k.contact_name, '')), ''), nullif(btrim(coalesce(k.contact_phone, '')), ''));
  end if;
  -- Der Wächter am Status (`quotes_fassung_pruefen`) hält eine zweite angenommene Fassung auf.
  update public.quotes set status = 'Angenommen', project_number = nummer where id = q.id;
  -- G15: die übrigen offenen Fassungen desselben Angebots sind damit ersetzt.
  update public.quotes set status = 'Ersetzt'
   where id in (select app.angebot_fassungen(q.id))
     and id <> q.id
     and status in ('Entwurf', 'Versendet');
  return nummer;
end; $$;

revoke all on function app.angebot_annehmen_kern(uuid, text, text) from public, anon, authenticated;

/* Die interne Annahme: Rechteprüfung und Betrieb wie bisher, dann der Kern. */
create or replace function public.angebot_annehmen(p_angebot uuid, p_praefix text, p_abrechnung text default 'Pauschal')
returns text language plpgsql security definer set search_path = '' as $$
declare q public.quotes;
begin
  if app.ist_fuehrung() is not true then
    raise exception 'Angebote annehmen darf nur die Führung' using errcode = '42501';
  end if;
  select * into q from public.quotes where id = p_angebot
    and (company_id = (select app.lesebetrieb()) or company_id = (select app.supportbetrieb())) for update;
  if q.id is null then raise exception 'Angebot nicht gefunden' using errcode = 'P0002'; end if;
  return app.angebot_annehmen_kern(q.id, p_praefix, p_abrechnung);
end; $$;
revoke all on function public.angebot_annehmen(uuid, text, text) from public, anon;
grant execute on function public.angebot_annehmen(uuid, text, text) to authenticated;

-- ---------------------------------------------------------------------------
-- Module auf dem Server (E51, V3)
-- ---------------------------------------------------------------------------

/*
  DAS REGISTER IN SQL — dieselben Kennungen, Standards und Abhängigkeiten
  wie `MODULE` in `src/lib/module.ts`. Eine Unterfähigkeit hängt zusätzlich
  an ihrem Modul: dem Teil ihrer Kennung vor dem Punkt (in TypeScript das
  Modul, unter dem sie steht; `tests/unit/modulRegister.test.ts` hält fest,
  dass beides dasselbe ist). `tests/supabase/modulRegisterServer.test.ts`
  vergleicht diese Liste mit dem Register der App; keine Zeile darf fehlen
  oder abweichen.

  Wer `src/lib/module.ts` ändert, ändert diese Liste mit — in einer neuen
  Migration.
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
  IST DIESES MODUL BZW. DIESE UNTERFÄHIGKEIT IM BETRIEB AN? Dieselben drei
  Stufen wie `aktiveSchalter`:
    1. der Standard aus dem Register,
    2. die Festlegung des Betriebs (`companies.modules`) — gelesen wie in
       JavaScript `festlegung[id] ?? standard`, dann wahr oder falsch nach
       den Regeln von JavaScript (0 und "" sind aus),
    3. fehlt eine Abhängigkeit (bei Unterfähigkeiten auch das eigene Modul),
       ist es aus — so lange nachgezogen, bis sich nichts mehr ändert.
  Eine Kennung, die das Register nicht kennt, ist aus.

  `app.einsatzplanung_an` bleibt, wie sie ist: sie liest bestehende
  Schreibwege, und für die gilt E51, V3 nicht.
*/
create or replace function app.modul_aktiv(p_betrieb text, p_schalter text)
  returns boolean
  language plpgsql
  stable
  security definer
  set search_path = ''
as $$
declare
  festlegung jsonb;
  an text[];
  knoten record;
  geaendert boolean := true;
begin
  select c.modules into festlegung from public.companies c where c.id = p_betrieb;

  select coalesce(array_agg(r.kennung), '{}'::text[]) into an
    from app.modul_register() r
   where case jsonb_typeof(festlegung -> r.kennung)
           when 'boolean' then (festlegung ->> r.kennung)::boolean
           when 'number' then (festlegung ->> r.kennung)::numeric <> 0
           when 'string' then (festlegung ->> r.kennung) <> ''
           when 'object' then true
           when 'array' then true
           else r.standard
         end;

  while geaendert loop
    geaendert := false;
    for knoten in
      select r.kennung,
             r.abhaengig_von || case when position('.' in r.kennung) > 0
                                     then array[split_part(r.kennung, '.', 1)]
                                     else '{}'::text[] end as braucht
        from app.modul_register() r
    loop
      if knoten.kennung = any(an) and not (knoten.braucht <@ an) then
        an := array_remove(an, knoten.kennung);
        geaendert := true;
      end if;
    end loop;
  end loop;

  return p_schalter = any(an);
end;
$$;

revoke all on function app.modul_aktiv(text, text) from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- Die Tabelle der Annahme-Links
-- ---------------------------------------------------------------------------

/*
  - `id` ist eine UUID und keine Zählnummer: der Rücklauf spielt die Zeilen
    mit ihrer Kennung zurück.
  - KEIN FREMDSCHLÜSSEL AUF DIE PERSONEN (wie E50, M01b, M01d): wer erzeugt
    oder widerrufen hat, bleibt stehen, auch wenn das Konto geht; der Name
    daneben ist der zum Zeitpunkt.
  - Das Angebot hält seine Links: wird es gelöscht (nur ein Entwurf oder
    verworfenes, `quotes_loeschen_nur_entwurf`), gehen sie mit. Ein Link an
    einem angenommenen Angebot bleibt, solange das Angebot bleibt.
  - `gueltig_bis` ist ein Kalendertag in Wien, einschließlich.
  - Höchstens EIN unentschiedener Link je Angebot (`angebot_links_ein_offener`):
    ein neuer Link widerruft den alten — die Datenbank hält es fest.
*/
create table if not exists public.angebot_links (
  id uuid primary key default gen_random_uuid(),
  company_id text not null references public.companies(id),
  quote_id uuid not null references public.quotes(id) on delete cascade,
  schluessel_hash text not null unique,
  abrechnung text not null,
  praefix text not null,
  schnappschuss jsonb not null,
  schnappschuss_hash text not null,
  gueltig_bis date not null,
  erzeugt_von_uid uuid,
  erzeugt_von_name text,
  erzeugt_am timestamptz not null default now(),
  widerrufen_am timestamptz,
  widerrufen_von_uid uuid,
  widerrufen_von_name text,
  angenommen_am timestamptz,
  angenommen_name text,
  angenommen_unterschrift text,
  abgelehnt_am timestamptz,
  abgelehnt_name text,
  abgelehnt_grund text,
  zuerst_geoeffnet_am timestamptz,
  zuletzt_geoeffnet_am timestamptz,
  geoeffnet_anzahl integer not null default 0,
  anfragen_fenster_ab timestamptz,
  anfragen_im_fenster integer not null default 0,
  gemeldet_am timestamptz,
  gesehen_am timestamptz,
  constraint angebot_links_hash check (schluessel_hash ~ '^[0-9a-f]{64}$'),
  constraint angebot_links_abrechnung check (abrechnung in ('Regie', 'Pauschal', 'Einheitspreis')),
  constraint angebot_links_praefix check (praefix ~ '^[A-Z0-9-]{0,6}$'),
  constraint angebot_links_schnappschuss check (jsonb_typeof(schnappschuss) = 'object'),
  constraint angebot_links_ein_ausgang check (num_nonnulls(widerrufen_am, angenommen_am, abgelehnt_am) <= 1),
  constraint angebot_links_annahme check (
    angenommen_am is null or (angenommen_name is not null and angenommen_unterschrift is not null)),
  constraint angebot_links_ablehnung check (abgelehnt_am is null or abgelehnt_name is not null)
);

comment on table public.angebot_links is
  'Annahme-Links der Angebote (M02a, A06): Hashwert des Schlüssels, unveränderlicher Stand mit Prüfsumme, Abrechnungsart und Vorsatz der Baustelle, Öffnen (Zeitpunkt, Anzahl), Annahme bzw. Ablehnung durch den Kunden. Geschrieben nur von den Funktionen angebot_link_*.';
comment on column public.angebot_links.schluessel_hash is
  'SHA-256 des Schlüssels (hex). Den Schlüssel selbst kennt die Datenbank nicht.';
comment on column public.angebot_links.schnappschuss is
  'Was der Kunde sieht und annimmt: Angebot, Kunde und Firmendaten beim Erzeugen. Unveränderlich.';
comment on column public.angebot_links.schnappschuss_hash is
  'Prüfsumme (SHA-256, hex) des Schnappschusses als Text.';
comment on column public.angebot_links.angenommen_unterschrift is
  'Die Unterschrift des Kunden als PNG (Data-URL), wie beim Handwerksschein.';
comment on column public.angebot_links.anfragen_im_fenster is
  'Rate-Limit je Link: Anfragen seit anfragen_fenster_ab (eine Stunde).';
comment on column public.angebot_links.gemeldet_am is
  'Wann die Push-Meldung an die Führung über die Entscheidung des Kunden hinausging (genau einmal, push_angebot_link).';
comment on column public.angebot_links.gesehen_am is
  'Wann jemand aus der Führung das angenommene Angebot geöffnet hat — bis dahin steht es auf der Startseite (höchstens 7 Tage).';

create index if not exists angebot_links_angebot on public.angebot_links (company_id, quote_id, erzeugt_am desc);
create index if not exists angebot_links_quote on public.angebot_links (quote_id);
create unique index if not exists angebot_links_ein_offener on public.angebot_links (quote_id)
  where widerrufen_am is null and angenommen_am is null and abgelehnt_am is null;

alter table public.angebot_links enable row level security;
revoke all on public.angebot_links from public, anon, authenticated;
grant select on public.angebot_links to authenticated;

/*
  LESEN wie die Angebote selbst (`quotes_lesen`): Führung, Buchhaltung und
  Spitze im eigenen Betrieb. NICHT der Support: der Link trägt Name und
  Unterschrift des Kunden und den Nachweis des Öffnens — die Regel kennt
  nur den eigenen Betrieb, nicht `app.supportbetrieb()`.
  KEINE Schreibregel: geschrieben wird nur über die Funktionen.
*/
drop policy if exists angebot_links_lesen on public.angebot_links;
create policy angebot_links_lesen on public.angebot_links for select
  using (
    company_id = (select app.lesebetrieb())
    and ((select app.ist_fuehrung()) or (select app.ist_buch_oder_spitze()))
  );

/*
  `support_niemals` und nicht `support_schreibt_nicht`: was der Support nicht
  lesen darf, soll er auch mit der Freigabe „mitarbeiten“ nicht schreiben.
  Kein Weg eines Supportzugangs schreibt hier — die Funktionen verlangen den
  eigenen Betrieb.
*/
drop trigger if exists angebot_links_kein_support on public.angebot_links;
create trigger angebot_links_kein_support
  before insert or update or delete on public.angebot_links
  for each row execute function app.support_niemals();

drop trigger if exists angebot_links_betrieb_fest on public.angebot_links;
create trigger angebot_links_betrieb_fest
  before update on public.angebot_links
  for each row execute function app.betrieb_unveraenderlich();

-- ---------------------------------------------------------------------------
-- Stand, Zustand, Antwort
-- ---------------------------------------------------------------------------

/*
  WAS VOM ANGEBOT IM LINK STEHT — und woran sich zeigt, ob es sich seither
  geändert hat. Nur die Angaben des Angebots selbst: eine geänderte
  Telefonnummer in der Kundenakte macht den Link nicht ungültig.
  Feldnamen wie in der App (`Quote`), damit Seite und PDF sie ohne
  Übersetzung lesen.

  ZAHLEN OHNE NACHKOMMA-NULLEN (`trim_scale`): `1.000` stünde sonst als Text
  im Stand, und nach einem Rücklauf (die Sicherung geht durch JSON) als `1`.
  Die Prüfsumme über den Stand als Text bliebe dann nicht nachrechenbar.
*/
create or replace function app.angebot_link_inhalt(q public.quotes)
  returns jsonb
  language sql
  stable
  security definer
  set search_path = ''
as $$
  select jsonb_build_object(
    'quoteNumber', q.quote_number,
    'quoteDate', q.quote_date,
    'validUntil', q.valid_until,
    'customerName', q.customer_name,
    'address', q.address,
    'notes', q.notes,
    'vatRate', trim_scale(q.vat_rate),
    'discount', case when q.discount_mode is not null then jsonb_build_object(
                  'mode', q.discount_mode, 'value', trim_scale(coalesce(q.discount_value, 0)), 'label', q.discount_label) end,
    'discountAmount', trim_scale(coalesce(q.discount_amount, 0)),
    'subtotalNetto', trim_scale(q.subtotal_netto),
    'totalNetto', trim_scale(q.total_netto),
    'totalVat', trim_scale(q.total_vat),
    'totalBrutto', trim_scale(q.total_brutto),
    'positions', (
      select coalesce(jsonb_agg(jsonb_build_object(
               'art', l.art, 'label', l.label, 'qty', trim_scale(l.qty), 'unit', l.unit,
               'unitPrice', trim_scale(l.unit_price), 'netto', trim_scale(l.netto),
               'rabattProzent', trim_scale(l.rabatt_prozent))
               order by l.position), '[]'::jsonb)
        from public.quote_lines l where l.quote_id = q.id))
$$;

revoke all on function app.angebot_link_inhalt(public.quotes) from public, anon, authenticated;

/*
  DER STAND, DEN DER KUNDE SIEHT: das Angebot, der Kunde (für die Anschrift
  im PDF wie in der App) und die Firmendaten des Versands. Hat ein
  versendetes Angebot von vor dem 24.10.2026 keinen Stand der Firmendaten,
  gelten die heutigen — wie beim PDF in der App.
*/
create or replace function app.angebot_link_schnappschuss(q public.quotes)
  returns jsonb
  language plpgsql
  security definer
  set search_path = ''
as $$
declare
  angaben jsonb;
begin
  select s.angaben into angaben
    from public.aussteller_staende s
   where s.id = coalesce(q.aussteller_stand, app.aussteller_stand(q.company_id));
  return jsonb_build_object(
    'fassung', 1,
    'angebot', app.angebot_link_inhalt(q),
    'kunde', (select jsonb_build_object('name', k.name, 'address', k.address, 'vatId', k.vat_id)
                from public.customers k where k.id = q.customer_id and k.company_id = q.company_id),
    'aussteller', coalesce(angaben, '{}'::jsonb));
end;
$$;

revoke all on function app.angebot_link_schnappschuss(public.quotes) from public, anon, authenticated;

/*
  DER ZUSTAND EINES LINKS — eine Quelle für Büro und Kunde.
    angenommen, abgelehnt, widerrufen: entschieden
    abgelaufen:      nach `gueltig_bis`
    gegenstandslos:  das Angebot ist nicht mehr versendet (intern angenommen,
                     abgelehnt, ersetzt, zurückgenommen) oder eine andere
                     Fassung ist angenommen
    geaendert:       das Angebot ist seit dem Erzeugen geändert worden —
                     angenommen würde sonst etwas anderes, als der Kunde sah
    offen
*/
create or replace function app.angebot_link_zustand(l public.angebot_links, q public.quotes)
  returns text
  language sql
  stable
  security definer
  set search_path = ''
as $$
  select case
    when l.angenommen_am is not null then 'angenommen'
    when l.abgelehnt_am is not null then 'abgelehnt'
    when l.widerrufen_am is not null then 'widerrufen'
    when (now() at time zone 'Europe/Vienna')::date > l.gueltig_bis then 'abgelaufen'
    when q.id is null or q.status is distinct from 'Versendet' then 'gegenstandslos'
    when exists (select 1 from public.quotes x
                  where x.id in (select app.angebot_fassungen(q.id))
                    and x.id <> q.id and x.status = 'Angenommen') then 'gegenstandslos'
    when app.angebot_link_inhalt(q) is distinct from l.schnappschuss -> 'angebot' then 'geaendert'
    else 'offen'
  end
$$;

revoke all on function app.angebot_link_zustand(public.angebot_links, public.quotes) from public, anon, authenticated;

/*
  WAS DER KUNDE ZU SEHEN BEKOMMT — oder `null`, dann antwortet der Link wie
  ein unbekannter. Ein entschiedener Link bleibt als Nachweis lesbar, bis
  er abläuft, mindestens aber 30 Tage nach der Entscheidung: wer am letzten
  Tag annimmt, soll seine Bestätigung am nächsten noch sehen. Ist der
  Betrieb deaktiviert oder die Annahme per Link ausgeschaltet, gibt es
  nichts zu sehen.
*/
create or replace function app.angebot_link_kundensicht(l public.angebot_links, q public.quotes)
  returns text
  language plpgsql
  stable
  security definer
  set search_path = ''
as $$
declare
  zustand text;
  heute date := (now() at time zone 'Europe/Vienna')::date;
begin
  if l.id is null or app.betrieb_ruht(l.company_id)
     or not app.modul_aktiv(l.company_id, 'angebote.online_annahme') then
    return null;
  end if;
  zustand := app.angebot_link_zustand(l, q);
  if zustand = 'offen' then
    return zustand;
  end if;
  if zustand = 'angenommen'
     and heute <= greatest(l.gueltig_bis, (l.angenommen_am at time zone 'Europe/Vienna')::date + 30) then
    return zustand;
  end if;
  if zustand = 'abgelehnt'
     and heute <= greatest(l.gueltig_bis, (l.abgelehnt_am at time zone 'Europe/Vienna')::date + 30) then
    return zustand;
  end if;
  return null;
end;
$$;

revoke all on function app.angebot_link_kundensicht(public.angebot_links, public.quotes) from public, anon, authenticated;

/* Was der Kunde zurückbekommt — nie Unterschrift, Hashwert des Schlüssels oder Angaben über die Belegschaft. */
create or replace function app.angebot_link_antwort(l public.angebot_links, p_zustand text)
  returns jsonb
  language sql
  stable
  security definer
  set search_path = ''
as $$
  select jsonb_build_object(
    'zustand', p_zustand,
    'gueltig_bis', l.gueltig_bis,
    'schnappschuss', l.schnappschuss,
    'pruefsumme', l.schnappschuss_hash)
  || case p_zustand
       when 'angenommen' then jsonb_build_object('entschieden_am', l.angenommen_am, 'name', l.angenommen_name)
       when 'abgelehnt' then jsonb_build_object('entschieden_am', l.abgelehnt_am, 'name', l.abgelehnt_name)
       else '{}'::jsonb
     end
$$;

revoke all on function app.angebot_link_antwort(public.angebot_links, text) from public, anon, authenticated;

/*
  RATE-LIMIT JE LINK (Begründung oben): höchstens 60 Anfragen in einer
  Stunde ab der ersten. Gezählt wird in einer Anweisung — zwei gleichzeitige
  Anfragen zählen beide. Wahr, solange die Grenze nicht überschritten ist.
  Dieselbe Zahl steht als `ANFRAGEN_JE_STUNDE` in `shared/angebotLink.ts`.
*/
create or replace function app.angebot_link_anfrage_zaehlen(p_link uuid)
  returns boolean
  language plpgsql
  security definer
  set search_path = ''
as $$
declare
  n integer;
begin
  update public.angebot_links a
     set anfragen_fenster_ab = case when a.anfragen_fenster_ab is null
                                      or a.anfragen_fenster_ab <= now() - interval '1 hour'
                                    then now() else a.anfragen_fenster_ab end,
         anfragen_im_fenster = case when a.anfragen_fenster_ab is null
                                      or a.anfragen_fenster_ab <= now() - interval '1 hour'
                                    then 1 else a.anfragen_im_fenster + 1 end
   where a.id = p_link
  returning a.anfragen_im_fenster into n;
  return coalesce(n, 0) <= 60;
end;
$$;

revoke all on function app.angebot_link_anfrage_zaehlen(uuid) from public, anon, authenticated;

/*
  DIE FASSUNGEN UND DANN DEN LINK SPERREN — in dieser Reihenfolge an jeder
  Stelle (Erzeugen, Widerrufen, Annehmen, Ablehnen), die Fassungen nach
  ihrer Kennung. So warten gleichzeitige Aufrufe aufeinander, statt sich zu
  verkeilen; zwei Annahmen desselben Links ergeben eine Baustelle, zwei
  Annahmen zweier Fassungen keine zwei.
*/
create or replace function app.angebot_fassungen_sperren(p_angebot uuid)
  returns void
  language plpgsql
  security definer
  set search_path = ''
as $$
begin
  -- PERFORM liest jede Zeile — eine SQL-Funktion holte nur die erste und sperrte nur sie.
  perform 1 from public.quotes x
    where x.id in (select app.angebot_fassungen(p_angebot))
    order by x.id
      for update;
end;
$$;

revoke all on function app.angebot_fassungen_sperren(uuid) from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- Das Büro: erzeugen, widerrufen, lesen
-- ---------------------------------------------------------------------------

/*
  EINEN LINK ERZEUGEN — nur die Führung (Projektleitung, Geschäftsführung,
  Administration) im eigenen Betrieb, nicht der Support: der Link ist eine
  Erklärung des Betriebs an seinen Kunden. Abrechnungsart und Vorsatz
  stehen damit fest (V4). Ein leerer Vorsatz ist erlaubt — er heißt „ohne
  Vorsatz“ wie beim Betrieb; fehlen (`null`) darf er nicht.

  Gültig bis zum `valid_until` des Angebots (höchstens ein Jahr), liegt das
  schon zurück 30 Tage; einstellbar von heute bis höchstens ein Jahr.

  Zurück kommt der Schlüssel im Klartext — das einzige Mal.
*/
create or replace function public.angebot_link_erzeugen(
  p_angebot uuid,
  p_abrechnung text,
  p_praefix text,
  p_gueltig_bis date default null
) returns jsonb
  language plpgsql
  security definer
  set search_path = ''
as $$
declare
  q public.quotes;
  andere public.quotes;
  heute date := (now() at time zone 'Europe/Vienna')::date;
  bis date;
  wer text;
  stand jsonb;
  schluessel text;
  neu public.angebot_links;
begin
  if app.hat_rolle(array['Projektleiter', 'Geschäftsführung', 'Administrator']) is not true then
    raise exception 'Annahme-Links erzeugt nur die Führung' using errcode = '42501';
  end if;
  select * into q from public.quotes where id = p_angebot and company_id = (select app.lesebetrieb());
  if q.id is null then raise exception 'Angebot nicht gefunden' using errcode = 'P0002'; end if;
  perform app.angebot_fassungen_sperren(q.id);
  select * into q from public.quotes where id = q.id;

  if not app.modul_aktiv(q.company_id, 'angebote.online_annahme') then
    raise exception 'Die Annahme per Link ist in diesem Betrieb ausgeschaltet (Einstellungen → Module)'
      using errcode = '55000';
  end if;
  if p_abrechnung is null or p_abrechnung not in ('Regie', 'Pauschal', 'Einheitspreis') then
    raise exception 'Ohne Abrechnungsart gibt es keinen Annahme-Link — Regie, Pauschal oder Einheitspreis'
      using errcode = '22023';
  end if;
  if p_praefix is null or p_praefix !~ '^[A-Z0-9-]{0,6}$' then
    raise exception 'Ohne Nummernvorsatz gibt es keinen Annahme-Link — höchstens sechs Großbuchstaben, Ziffern oder Bindestriche'
      using errcode = '22023';
  end if;
  if q.status not in ('Entwurf', 'Versendet') then
    raise exception 'Einen Annahme-Link gibt es nur für einen Entwurf oder ein versendetes Angebot — % ist „%“', q.quote_number, q.status
      using errcode = '55000';
  end if;
  select x.* into andere from public.quotes x
   where x.id in (select app.angebot_fassungen(q.id)) and x.id <> q.id and x.status = 'Angenommen'
   limit 1;
  if andere.id is not null then
    raise exception 'Von diesem Angebot ist schon die Fassung % angenommen — ein Annahme-Link entsteht nicht', andere.quote_number
      using errcode = '55000';
  end if;

  bis := coalesce(p_gueltig_bis, case when q.valid_until >= heute then least(q.valid_until, heute + 365) else heute + 30 end);
  if bis < heute or bis > heute + 365 then
    raise exception 'Ein Annahme-Link gilt ab heute höchstens ein Jahr' using errcode = '22023';
  end if;

  -- Der Link ist der Versand: die Auslöser setzen `versendet_am`, die Firmendaten und das Journal.
  if q.status = 'Entwurf' then
    update public.quotes set status = 'Versendet' where id = q.id;
    select * into q from public.quotes where id = q.id;
  end if;

  wer := (select u.name from public.users u where u.id = auth.uid());
  update public.angebot_links a
     set widerrufen_am = now(), widerrufen_von_uid = auth.uid(), widerrufen_von_name = wer
   where a.quote_id = q.id
     and a.widerrufen_am is null and a.angenommen_am is null and a.abgelehnt_am is null;

  stand := app.angebot_link_schnappschuss(q);
  -- 32 Zufallsbytes, für eine Adresse lesbar (Base64 ohne „+/=“) — wie das Kalender-Abo.
  schluessel := translate(encode(extensions.gen_random_bytes(32), 'base64'), E'+/=\n', '-_');
  insert into public.angebot_links
    (company_id, quote_id, schluessel_hash, abrechnung, praefix, schnappschuss, schnappschuss_hash,
     gueltig_bis, erzeugt_von_uid, erzeugt_von_name)
  values
    (q.company_id, q.id, encode(sha256(convert_to(schluessel, 'UTF8')), 'hex'), p_abrechnung, p_praefix,
     stand, encode(sha256(convert_to(stand::text, 'UTF8')), 'hex'), bis, auth.uid(), wer)
  returning * into neu;

  return jsonb_build_object('id', neu.id, 'schluessel', schluessel, 'gueltig_bis', neu.gueltig_bis);
end;
$$;

revoke all on function public.angebot_link_erzeugen(uuid, text, text, date) from public, anon;
grant execute on function public.angebot_link_erzeugen(uuid, text, text, date) to authenticated;

/* WIDERRUFEN — jederzeit, solange der Kunde nicht entschieden hat; ein zweites Mal ändert nichts. */
create or replace function public.angebot_link_widerrufen(p_link uuid)
  returns void
  language plpgsql
  security definer
  set search_path = ''
as $$
declare
  l public.angebot_links;
begin
  if app.hat_rolle(array['Projektleiter', 'Geschäftsführung', 'Administrator']) is not true then
    raise exception 'Annahme-Links widerruft nur die Führung' using errcode = '42501';
  end if;
  select * into l from public.angebot_links where id = p_link and company_id = (select app.lesebetrieb());
  if l.id is null then raise exception 'Annahme-Link nicht gefunden' using errcode = 'P0002'; end if;
  perform app.angebot_fassungen_sperren(l.quote_id);
  select * into l from public.angebot_links where id = l.id for update;
  if l.angenommen_am is not null then
    raise exception 'Der Kunde hat schon angenommen — widerrufen geht nur, solange der Link offen ist'
      using errcode = '55000';
  end if;
  if l.abgelehnt_am is not null then
    raise exception 'Der Kunde hat schon abgelehnt — widerrufen geht nur, solange der Link offen ist'
      using errcode = '55000';
  end if;
  if l.widerrufen_am is not null then
    return;
  end if;
  update public.angebot_links a
     set widerrufen_am = now(), widerrufen_von_uid = auth.uid(),
         widerrufen_von_name = (select u.name from public.users u where u.id = auth.uid())
   where a.id = l.id;
end;
$$;

revoke all on function public.angebot_link_widerrufen(uuid) from public, anon;
grant execute on function public.angebot_link_widerrufen(uuid) to authenticated;

/*
  DIE LINKS EINES ANGEBOTS FÜRS BÜRO — mit dem Zustand aus derselben Quelle,
  die dem Kunden antwortet. Ohne Hashwert des Schlüssels, ohne den
  Schnappschuss (er wiederholt das Angebot) und ohne die Zähler des
  Rate-Limits. Lesen darf, wer die Angebote liest (wie `angebot_links_lesen`).
*/
create or replace function public.angebot_links_stand(p_angebot uuid)
  returns jsonb
  language plpgsql
  stable
  security definer
  set search_path = ''
as $$
declare
  q public.quotes;
begin
  if not ((select app.ist_fuehrung()) or (select app.ist_buch_oder_spitze())) then
    raise exception 'Annahme-Links liest, wer die Angebote liest' using errcode = '42501';
  end if;
  select * into q from public.quotes where id = p_angebot and company_id = (select app.lesebetrieb());
  if q.id is null then raise exception 'Angebot nicht gefunden' using errcode = 'P0002'; end if;
  return (
    select coalesce(jsonb_agg(
             to_jsonb(l) - array['schluessel_hash', 'schnappschuss', 'anfragen_fenster_ab', 'anfragen_im_fenster']
             || jsonb_build_object('zustand', app.angebot_link_zustand(l, q))
             order by l.erzeugt_am desc, l.id), '[]'::jsonb)
      from public.angebot_links l
     where l.company_id = q.company_id and l.quote_id = q.id);
end;
$$;

revoke all on function public.angebot_links_stand(uuid) from public, anon;
grant execute on function public.angebot_links_stand(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- Der Kunde: abrufen, annehmen, ablehnen — nur mit dem Dienstschlüssel
-- ---------------------------------------------------------------------------

/*
  DER ABRUF (Edge Function `angebot-annahme`). `null`, wenn es den Link
  nicht gibt, er widerrufen, abgelaufen oder gegenstandslos ist, das Modul
  aus ist oder der Betrieb ruht — die Function antwortet in allen Fällen
  dasselbe. Jedes Öffnen eines gültigen Links zählt (Zeitpunkt, Anzahl).
*/
create or replace function public.angebot_link_abruf(p_hash text)
  returns jsonb
  language plpgsql
  security definer
  set search_path = ''
as $$
declare
  l public.angebot_links;
  q public.quotes;
  zustand text;
begin
  if p_hash is null or p_hash !~ '^[0-9a-f]{64}$' then
    return null;
  end if;
  select * into l from public.angebot_links where schluessel_hash = p_hash;
  if l.id is null then
    return null;
  end if;
  select * into q from public.quotes where id = l.quote_id;
  zustand := app.angebot_link_kundensicht(l, q);
  if zustand is null then
    return null;
  end if;
  if not app.angebot_link_anfrage_zaehlen(l.id) then
    return jsonb_build_object('zustand', 'zu_viele');
  end if;
  update public.angebot_links a
     set zuerst_geoeffnet_am = coalesce(a.zuerst_geoeffnet_am, now()),
         zuletzt_geoeffnet_am = now(),
         geoeffnet_anzahl = a.geoeffnet_anzahl + 1
   where a.id = l.id;
  return app.angebot_link_antwort(l, zustand);
end;
$$;

revoke all on function public.angebot_link_abruf(text) from public, anon, authenticated;
grant execute on function public.angebot_link_abruf(text) to service_role;

/*
  Eine Journalzeile im Namen des Kunden. Der Auslöser des Journals schreibt
  beim Dienstschlüssel nichts (M01b); hier steht, was er bei der internen
  Annahme schriebe — dieselben Spalten, „leer bleibt leer“ wie dort.
*/
create or replace function app.journal_kunde_ueber_link(
  p_objektart text, p_alt jsonb, p_neu jsonb, p_spalten text[], p_art text, p_von text
) returns void
  language plpgsql
  security definer
  set search_path = ''
as $$
declare
  leer constant jsonb[] := array['null'::jsonb, '""'::jsonb, '[]'::jsonb, '{}'::jsonb];
  unterschied jsonb := '{}'::jsonb;
  spalte text;
begin
  if p_art = 'geaendert' then
    foreach spalte in array p_spalten loop
      if p_alt -> spalte is not distinct from p_neu -> spalte
         or ((p_alt -> spalte) = any(leer) and (p_neu -> spalte) = any(leer)) then
        continue;
      end if;
      unterschied := unterschied || jsonb_build_object(spalte, jsonb_build_object('alt', p_alt -> spalte, 'neu', p_neu -> spalte));
    end loop;
    if unterschied = '{}'::jsonb then
      return;
    end if;
  end if;
  insert into public.aenderungsjournal
    (company_id, objektart, objekt_id, kunde_id, art, aenderungen, bezeichnung, von_uid, von_name)
  values
    (p_neu ->> 'company_id', p_objektart, (p_neu ->> 'id')::uuid, (p_neu ->> 'customer_id')::uuid, p_art,
     unterschied,
     case p_objektart when 'angebot' then p_neu ->> 'quote_number' else p_neu ->> 'project_number' end,
     null, p_von);
end;
$$;

revoke all on function app.journal_kunde_ueber_link(text, jsonb, jsonb, text[], text, text) from public, anon, authenticated;

/*
  DIE ANNAHME DURCH DEN KUNDEN. Pflicht: Name, Bestätigung, Unterschrift.
  Dieselben Prüfungen wie die Function (`shared/angebotLink.ts`) — hier,
  damit auch ein Aufruf an ihr vorbei nichts Halbes speichert.

  Ein zweiter Aufruf nimmt nicht noch einmal an: er bekommt „angenommen“
  mit dem Tag der ersten Annahme. Gleichzeitige Aufrufe warten an den
  Sperren aufeinander.
*/
create or replace function public.angebot_link_annehmen(
  p_hash text, p_name text, p_unterschrift text, p_bestaetigt boolean
) returns jsonb
  language plpgsql
  security definer
  set search_path = ''
as $$
declare
  l public.angebot_links;
  q public.quotes;
  zustand text;
  name text := btrim(coalesce(p_name, ''));
  von text;
  vorher jsonb;
  quote_alt jsonb;
  nummer text;
  neue_baustelle boolean;
  projekt public.projects;
  f record;
begin
  if p_hash is null or p_hash !~ '^[0-9a-f]{64}$' then
    return null;
  end if;
  select * into l from public.angebot_links where schluessel_hash = p_hash;
  if l.id is null then
    return null;
  end if;
  perform app.angebot_fassungen_sperren(l.quote_id);
  select * into l from public.angebot_links where id = l.id for update;
  select * into q from public.quotes where id = l.quote_id;
  zustand := app.angebot_link_kundensicht(l, q);
  if zustand is null then
    return null;
  end if;
  if not app.angebot_link_anfrage_zaehlen(l.id) then
    return jsonb_build_object('zustand', 'zu_viele');
  end if;
  if zustand <> 'offen' then
    return app.angebot_link_antwort(l, zustand) || jsonb_build_object('neu', false);
  end if;

  if p_bestaetigt is not true then
    raise exception 'Ohne die Bestätigung „verbindlich annehmen“ wird nicht angenommen' using errcode = '22023';
  end if;
  if char_length(name) < 2 or char_length(name) > 120 then
    raise exception 'Bitte den Namen angeben (2 bis 120 Zeichen)' using errcode = '22023';
  end if;
  if p_unterschrift is null or char_length(p_unterschrift) > 500000
     or p_unterschrift !~ '^data:image/png;base64,[A-Za-z0-9+/]+=*$' then
    raise exception 'Die Unterschrift fehlt oder ist kein Bild' using errcode = '22023';
  end if;

  von := 'Kunde über Link: ' || name;
  -- Wie die Fassungen vorher standen — für das Journal der ersetzten.
  select coalesce(jsonb_object_agg(x.id::text, to_jsonb(x)), '{}'::jsonb) into vorher
    from public.quotes x
   where x.id in (select app.angebot_fassungen(q.id)) and x.id <> q.id and x.status in ('Entwurf', 'Versendet');
  quote_alt := to_jsonb(q);
  neue_baustelle := not exists (select 1 from public.projects p
                                 where p.company_id = q.company_id and p.project_number = q.project_number);

  nummer := app.angebot_annehmen_kern(q.id, l.praefix, l.abrechnung);

  /*
    WAS DIE AUSLÖSER BEIM DIENSTSCHLÜSSEL AUSLASSEN: der Zeitpunkt der
    Annahme und die Firmendaten eines ersetzten Entwurfs (beim Verlassen
    des Entwurfs festgehalten, `quotes_aussteller`).
  */
  update public.quotes set angenommen_am = now() where id = q.id;
  update public.quotes x
     set aussteller_stand = app.aussteller_stand(x.company_id)
   where x.id in (select (k)::uuid from jsonb_object_keys(vorher) k)
     and x.status = 'Ersetzt' and x.aussteller_stand is null
     and (vorher -> x.id::text ->> 'status') = 'Entwurf';

  update public.angebot_links a
     set angenommen_am = now(), angenommen_name = name, angenommen_unterschrift = p_unterschrift
   where a.id = l.id
  returning * into l;

  -- Das Journal in der Reihenfolge der internen Annahme: Baustelle, Angebot, ersetzte Fassungen.
  if neue_baustelle then
    select * into projekt from public.projects p where p.company_id = q.company_id and p.project_number = nummer;
    perform app.journal_kunde_ueber_link('baustelle', null, to_jsonb(projekt), null, 'angelegt', von);
  end if;
  select * into q from public.quotes where id = q.id;
  perform app.journal_kunde_ueber_link('angebot', quote_alt, to_jsonb(q), array['status', 'project_number'], 'geaendert', von);
  for f in
    select x.* from public.quotes x
     where x.id in (select (k)::uuid from jsonb_object_keys(vorher) k)
     order by x.id
  loop
    perform app.journal_kunde_ueber_link('angebot', vorher -> f.id::text, to_jsonb(f), array['status'], 'geaendert', von);
  end loop;

  -- Die Führung erfährt es (Push, genau einmal je Entscheidung; `push_angebot_link`).
  perform app.push_anstossen(jsonb_build_object(
    'quelle', 'angebot', 'art', 'link-entschieden',
    'zeile', jsonb_build_object('id', l.id, 'company_id', l.company_id)));

  return app.angebot_link_antwort(l, 'angenommen') || jsonb_build_object('neu', true);
end;
$$;

revoke all on function public.angebot_link_annehmen(text, text, text, boolean) from public, anon, authenticated;
grant execute on function public.angebot_link_annehmen(text, text, text, boolean) to service_role;

/*
  DIE ABLEHNUNG DURCH DEN KUNDEN — wie „Als abgelehnt markieren“ im Büro:
  das Angebot steht auf „Abgelehnt“ mit dem Tag. Name ist Pflicht (er steht
  im Journal), der Grund nicht. Danach ist der Link entschieden; eine neue
  Fassung braucht einen neuen Link.
*/
create or replace function public.angebot_link_ablehnen(p_hash text, p_name text, p_grund text)
  returns jsonb
  language plpgsql
  security definer
  set search_path = ''
as $$
declare
  l public.angebot_links;
  q public.quotes;
  zustand text;
  name text := btrim(coalesce(p_name, ''));
  grund text := nullif(btrim(coalesce(p_grund, '')), '');
  quote_alt jsonb;
begin
  if p_hash is null or p_hash !~ '^[0-9a-f]{64}$' then
    return null;
  end if;
  select * into l from public.angebot_links where schluessel_hash = p_hash;
  if l.id is null then
    return null;
  end if;
  perform app.angebot_fassungen_sperren(l.quote_id);
  select * into l from public.angebot_links where id = l.id for update;
  select * into q from public.quotes where id = l.quote_id;
  zustand := app.angebot_link_kundensicht(l, q);
  if zustand is null then
    return null;
  end if;
  if not app.angebot_link_anfrage_zaehlen(l.id) then
    return jsonb_build_object('zustand', 'zu_viele');
  end if;
  if zustand <> 'offen' then
    return app.angebot_link_antwort(l, zustand) || jsonb_build_object('neu', false);
  end if;
  if char_length(name) < 2 or char_length(name) > 120 then
    raise exception 'Bitte den Namen angeben (2 bis 120 Zeichen)' using errcode = '22023';
  end if;
  if char_length(coalesce(grund, '')) > 1000 then
    raise exception 'Der Grund ist zu lang (höchstens 1000 Zeichen)' using errcode = '22023';
  end if;

  quote_alt := to_jsonb(q);
  -- `abgelehnt_am` setzt bei der internen Ablehnung `quotes_status_zeit`; beim Dienstschlüssel hier.
  update public.quotes set status = 'Abgelehnt', abgelehnt_am = now() where id = q.id;
  update public.angebot_links a
     set abgelehnt_am = now(), abgelehnt_name = name, abgelehnt_grund = grund
   where a.id = l.id
  returning * into l;
  select * into q from public.quotes where id = q.id;
  perform app.journal_kunde_ueber_link('angebot', quote_alt, to_jsonb(q), array['status'], 'geaendert',
    'Kunde über Link: ' || name);
  perform app.push_anstossen(jsonb_build_object(
    'quelle', 'angebot', 'art', 'link-entschieden',
    'zeile', jsonb_build_object('id', l.id, 'company_id', l.company_id)));
  return app.angebot_link_antwort(l, 'abgelehnt') || jsonb_build_object('neu', true);
end;
$$;

revoke all on function public.angebot_link_ablehnen(text, text, text) from public, anon, authenticated;
grant execute on function public.angebot_link_ablehnen(text, text, text) to service_role;

-- ---------------------------------------------------------------------------
-- Die Führung erfährt es: Push und Startseite
-- ---------------------------------------------------------------------------

/*
  EIN EIGENER SCHALTER FÜR DIE MELDUNG, wie bei den übrigen Arten
  (`notify_abwesenheit` u. a.): wer Angebote nicht verantwortet, will vom
  Kunden nicht auf dem Sperrbildschirm hören. Vorgabe an — nichts verpassen
  ist der hilfreichere Ausgangszustand, abschalten ein bewusster Schritt.
*/
alter table public.user_prefs
  add column if not exists notify_angebot boolean not null default true;

comment on column public.user_prefs.notify_angebot is
  'Push, wenn ein Kunde ein Angebot über den Annahme-Link annimmt oder ablehnt (M02a).';

/*
  WAS DIE FUNCTION `push-melden` FÜR EINEN ENTSCHIEDENEN LINK BRAUCHT — und
  der Riegel, der die Meldung GENAU EINMAL hinausgehen lässt. Der Anstoß
  kommt nur mit der Entscheidung selbst (nicht bei „bereits angenommen“,
  nicht bei der internen Annahme, die heute auch keine Meldung kennt). Käme
  er doch ein zweites Mal an — `pg_net` oder ein Mensch, der den Aufruf
  wiederholt —, setzt nur der erste `gemeldet_am`; jeder weitere bekommt
  `null` und meldet nichts.

  Höchstens einmal statt mindestens einmal: geht der Versand danach schief
  (Google nicht erreichbar), ist die Meldung verloren — wie jede andere
  Push-Meldung der App. Verloren ist dabei nichts Fachliches: der Hinweis
  auf der Startseite und der Abschnitt im Angebot zeigen die Annahme
  unabhängig davon.

  Die Belegschaft geht mit (Kennung, Rolle, aktiv); wer davon die Meldung
  bekommt, entscheidet `shared/notifyLogic.ts` wie bei den Abwesenheiten.
  Kein Betrag, keine Unterschrift, kein Grund einer Ablehnung — nur Nummer,
  Entscheidung und Name.
*/
create or replace function public.push_angebot_link(p_link uuid)
  returns jsonb
  language plpgsql
  security definer
  set search_path = ''
as $$
declare
  l public.angebot_links;
  q public.quotes;
begin
  update public.angebot_links a
     set gemeldet_am = now()
   where a.id = p_link
     and a.gemeldet_am is null
     and (a.angenommen_am is not null or a.abgelehnt_am is not null)
  returning * into l;
  if l.id is null then
    return null;
  end if;
  select * into q from public.quotes where id = l.quote_id;
  return jsonb_build_object(
    'link', l.id,
    'angebot', q.id,
    'nummer', q.quote_number,
    'entscheidung', case when l.angenommen_am is not null then 'angenommen' else 'abgelehnt' end,
    'name', coalesce(l.angenommen_name, l.abgelehnt_name),
    'belegschaft', (
      select coalesce(jsonb_agg(jsonb_build_object('uid', u.id, 'role', u.role, 'active', u.active)), '[]'::jsonb)
        from public.users u where u.company_id = l.company_id));
end;
$$;

revoke all on function public.push_angebot_link(uuid) from public, anon, authenticated;
grant execute on function public.push_angebot_link(uuid) to service_role;

/*
  „ÜBER LINK ANGENOMMEN“ AUF DER STARTSEITE DER FÜHRUNG — bis jemand aus der
  Führung das Angebot geöffnet hat, höchstens sieben Tage. Sieben Tage sind
  eine Arbeitswoche: wer im Büro arbeitet, hat die Startseite in der Zeit
  gesehen; danach steht das Angebot als „Angenommen“ in der Liste, die
  Baustelle ist angelegt, und der Hinweis wäre nur noch Lärm. Abgelehnte
  zeigt die Startseite nicht — es ist nichts zu tun; die Push-Meldung und
  das Angebot sagen es.
*/
create or replace function public.angebot_links_neu_angenommen()
  returns jsonb
  language plpgsql
  stable
  security definer
  set search_path = ''
as $$
begin
  if app.hat_rolle(array['Projektleiter', 'Geschäftsführung', 'Administrator']) is not true then
    raise exception 'Das sieht die Führung' using errcode = '42501';
  end if;
  return (
    select coalesce(jsonb_agg(jsonb_build_object(
             'link', l.id, 'angebot', q.id, 'nummer', q.quote_number, 'kunde', q.customer_name,
             'baustelle', q.project_number, 'baustelle_id', q.project_id,
             'angenommen_am', l.angenommen_am, 'name', l.angenommen_name)
             order by l.angenommen_am desc), '[]'::jsonb)
      from public.angebot_links l
      join public.quotes q on q.id = l.quote_id
     where l.company_id = (select app.lesebetrieb())
       and l.angenommen_am is not null
       and l.angenommen_am > now() - interval '7 days'
       and l.gesehen_am is null);
end;
$$;

revoke all on function public.angebot_links_neu_angenommen() from public, anon;
grant execute on function public.angebot_links_neu_angenommen() to authenticated;

/* Die Führung hat das angenommene Angebot geöffnet — der Hinweis auf der Startseite geht. */
create or replace function public.angebot_link_gesehen(p_link uuid)
  returns void
  language plpgsql
  security definer
  set search_path = ''
as $$
begin
  if app.hat_rolle(array['Projektleiter', 'Geschäftsführung', 'Administrator']) is not true then
    raise exception 'Das vermerkt die Führung' using errcode = '42501';
  end if;
  update public.angebot_links a
     set gesehen_am = now()
   where a.id = p_link
     and a.company_id = (select app.lesebetrieb())
     and a.angenommen_am is not null
     and a.gesehen_am is null;
end;
$$;

revoke all on function public.angebot_link_gesehen(uuid) from public, anon;
grant execute on function public.angebot_link_gesehen(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- Auszug, Datenauskunft, Löschung
-- ---------------------------------------------------------------------------

/*
  Der Hashwert gehört nicht in den Auszug des Betriebs (wie beim
  Kalender-Abo). Die nächtliche Sicherung behält ihn
  (`app.auszug_snapshot_zeilen`): nach einem Rücklauf gilt ein offener Link
  weiter. Sonst wie `20261013140000_auszug_arbeitskopien.sql`.
*/
create or replace function app.auszug_ausgenommen(p_tabelle text) returns text[]
language sql immutable security definer set search_path = '' as $$
  select case p_tabelle
    when 'user_prefs' then array['push_tokens']
    when 'kalender_abos' then array['schluessel_hash']
    when 'angebot_links' then array['schluessel_hash']
    when 'auszug_arbeitsstand' then array['inhalt']
    else '{}'::text[] end;
$$;
revoke all on function app.auszug_ausgenommen(text) from public, anon, authenticated;

/*
  DATENAUSKUNFT — gezielt eingefügt wie E50, M01b, M01d; wiederholbar, und
  ohne Einfügestelle bricht die Migration ab.

  - Beim Kunden: die Annahme-Links seiner Angebote mit dem, was ihn betrifft
    — Gültigkeit, Öffnen, seine Annahme samt Name und Unterschrift bzw.
    seine Ablehnung mit Grund. Ohne wer im Betrieb erzeugt oder widerrufen
    hat (Angaben über Mitarbeiter) und ohne Hashwert und Stand (der Stand
    wiederholt das Angebot, das unter „angebote“ steht).
  - Bei der Person: als Bearbeiter die Anzahl der Links, die sie erzeugt
    bzw. widerrufen hat.
*/
do $migration$
declare quelle text; marke text;
begin
  quelle := pg_get_functiondef('public.person_auskunft(text,uuid,integer)'::regprocedure);
  if position('annahme_links' in quelle) = 0 then
    marke := $m$from public.uid_pruefungen u where u.company_id = betrieb and u.customer_id = p_id),$m$;
    if (length(quelle) - length(replace(quelle, marke, ''))) / length(marke) <> 1 then
      raise exception 'Personenauskunft: Einfügestelle Kunde fehlt oder ist nicht eindeutig';
    end if;
    quelle := replace(quelle, marke, marke || $eintrag$
      -- M02a: die Annahme-Links seiner Angebote — ohne wer im Betrieb erzeugt oder widerrufen hat.
      'annahme_links', (
        select coalesce(jsonb_agg(jsonb_build_object(
                 'angebot', q.quote_number, 'erzeugt_am', a.erzeugt_am, 'gueltig_bis', a.gueltig_bis,
                 'widerrufen_am', a.widerrufen_am,
                 'zuerst_geoeffnet_am', a.zuerst_geoeffnet_am, 'zuletzt_geoeffnet_am', a.zuletzt_geoeffnet_am,
                 'geoeffnet_anzahl', a.geoeffnet_anzahl,
                 'angenommen_am', a.angenommen_am, 'angenommen_name', a.angenommen_name,
                 'angenommen_unterschrift', a.angenommen_unterschrift,
                 'abgelehnt_am', a.abgelehnt_am, 'abgelehnt_name', a.abgelehnt_name,
                 'abgelehnt_grund', a.abgelehnt_grund, 'pruefsumme', a.schnappschuss_hash)
                 order by a.erzeugt_am, a.id), '[]'::jsonb)
          from public.angebot_links a
          join public.quotes q on q.id = a.quote_id
         where a.company_id = betrieb
           and (q.customer_id = p_id
                or (q.customer_id is null and lower(btrim(q.customer_name)) = lower(btrim(kunde.name))))),$eintrag$);

    marke := $m$where q.company_id = betrieb and q.verworfen_von_uid = p_id),$m$;
    if (length(quelle) - length(replace(quelle, marke, ''))) / length(marke) <> 1 then
      raise exception 'Personenauskunft: Einfügestelle Bearbeiter fehlt oder ist nicht eindeutig';
    end if;
    quelle := replace(quelle, marke, marke || $eintrag$
      -- M02a: Annahme-Links, die sie erzeugt bzw. widerrufen hat.
      'annahme_links_erzeugt', (select count(*) from public.angebot_links a
        where a.company_id = betrieb and a.erzeugt_von_uid = p_id),
      'annahme_links_widerrufen', (select count(*) from public.angebot_links a
        where a.company_id = betrieb and a.widerrufen_von_uid = p_id),$eintrag$);
    execute quelle;
  end if;
end;
$migration$;

/*
  LÖSCHUNG EINES KUNDEN (Art. 17). Die Links hängen an seinen Angeboten und
  bleiben mit ihnen: ein angenommenes Angebot ist samt Name, Unterschrift
  und Prüfsumme der Nachweis des Vertrags und wird wie jedes Angebot
  aufbewahrt (dieselbe Frist wie „Angebote“ in `person_loeschen`). Ein
  Kunde mit Angeboten geht deshalb nie ganz.

  NEU: Ein noch OFFENER Link wird widerrufen. Wer seine Löschung verlangt,
  soll danach keine Baustelle mehr auslösen können, und sein Öffnen wird
  nicht weiter gezählt. Zugeordnet wie in der Datenauskunft (Kennung, bei
  Angeboten ohne Kennung der Name) — nicht über den Namen allein, sonst
  träfe es einen Namensvetter.

  Gezielt eingefügt wie oben; wiederholbar.
*/
do $migration$
declare quelle text; marke text;
begin
  quelle := pg_get_functiondef('public.person_loeschen(text,uuid,boolean)'::regprocedure);
  if position('annahme_links' in quelle) = 0 then
    marke := $m$and num_nonnulls(b.contact_name, b.contact_phone) > 0) k));$m$;
    if (length(quelle) - length(replace(quelle, marke, ''))) / length(marke) <> 1 then
      raise exception 'Löschung: Einfügestelle „sofort“ fehlt oder ist nicht eindeutig';
    end if;
    quelle := replace(quelle, marke, $n$and num_nonnulls(b.contact_name, b.contact_phone) > 0) k),
      -- M02a: offene Annahme-Links seiner Angebote werden widerrufen.
      'annahme_links', (select count(*) from public.angebot_links a
                          join public.quotes q on q.id = a.quote_id
                         where a.company_id = betrieb
                           and a.widerrufen_am is null and a.angenommen_am is null and a.abgelehnt_am is null
                           and (q.customer_id = p_id
                                or (q.customer_id is null and lower(btrim(q.customer_name)) = lower(btrim(kunde.name))))));$n$);

    marke := $m$delete from public.termine t where t.company_id = betrieb and t.customer_id = p_id;$m$;
    if (length(quelle) - length(replace(quelle, marke, ''))) / length(marke) <> 1 then
      raise exception 'Löschung: Einfügestelle Widerruf fehlt oder ist nicht eindeutig';
    end if;
    quelle := replace(quelle, marke, marke || $eintrag$
      -- M02a: offene Annahme-Links widerrufen — wer gelöscht werden will, löst keine Baustelle mehr aus.
      update public.angebot_links a
         set widerrufen_am = now(), widerrufen_von_uid = auth.uid(),
             widerrufen_von_name = coalesce((select u.name from public.users u where u.id = auth.uid())
                                            || ' (Löschung des Kunden)', 'Löschung des Kunden')
        from public.quotes q
       where q.id = a.quote_id
         and a.company_id = betrieb
         and a.widerrufen_am is null and a.angenommen_am is null and a.abgelehnt_am is null
         and (q.customer_id = p_id
              or (q.customer_id is null and lower(btrim(q.customer_name)) = lower(btrim(kunde.name))));$eintrag$);
    execute quelle;
  end if;
end;
$migration$;
