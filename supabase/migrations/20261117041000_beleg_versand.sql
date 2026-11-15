-- Durchsicht 15.11.2026, F16 (Roadmap 11.2 Nr. 1): Rechnung und Angebot per
-- Mail aus der App.
--
-- WAS VORHER WAR: der letzte Schritt verließ die App — PDF herunterladen,
-- Mailprogramm öffnen, anhängen, Adresse abtippen. Beim Angebot gab es für den
-- Annahme-Link ein `mailto:` ohne Anhang. Ob und an wen etwas hinausging,
-- stand nirgends.
--
-- WIE ES JETZT GEHT: Die App erzeugt das PDF wie bisher aus dem gespeicherten
-- Beleg und gibt es mit Empfänger, Betreff und Text an die Edge Function
-- `beleg-mail`. Die fragt hier, ob die Person das darf und ob das Rate-Limit
-- frei ist (`beleg_versand_vorbereiten`, mit dem Anmeldetoken der Person —
-- also mit ihren Rechten und ihrem Zeilenschutz), schickt die Mail über
-- SMTP und hält das Ergebnis fest (`beleg_versand_festhalten`, nur mit dem
-- Dienstschlüssel: wer nur die App hat, kann keinen Versand als erfolgt
-- eintragen, der nie stattfand). Ein Entwurf eines Angebots ist danach
-- „Versendet“, wie beim „Als versendet markieren“.
--
-- WAS GESPEICHERT WIRD: je Versuch eine Zeile in `beleg_versand` — wann, von
-- wem, an wen, welcher Beleg, Betreff, Name, Größe und Prüfsumme des Anhangs,
-- ob mit Annahme-Link, und was der Mailserver sagte. Nicht der Text und nicht
-- das PDF: das PDF ist aus dem Beleg jederzeit gleich wieder zu erzeugen
-- (Nachdruck), die Prüfsumme belegt, welcher Stand hinausging. Die Zeilen
-- stehen im Verlauf von Rechnung und Angebot (`objekt_verlauf`).
--
-- JE BETRIEB: die Antwortadresse (Antworten des Kunden und die Kopie gehen
-- dorthin; abgesendet wird über die Adresse der Plattform, damit SPF und DKIM
-- stimmen) und die Text-Vorlagen.
--
-- VERTRÄGLICH MIT DER ALTEN APP: neue Spalten mit Vorgabe `null`, eine neue
-- Tabelle, neue Funktionen; die Sicht `objekt_verlauf` bekommt Zeilen einer
-- neuen Art, die die alte App als „geändert“ ohne Felder zeigt.

-- ---------------------------------------------------------------------------
-- Adressen
-- ---------------------------------------------------------------------------

/*
  EINE ADRESSE, DIE JEDER MAILSERVER ANNIMMT — dasselbe Muster wie
  `ADRESSE_FORM` in `shared/belegMail.ts` (die Prüfung gegen die Datenbank
  misst beide an denselben Fällen).
*/
create or replace function app.mailadresse_gueltig(p_adresse text) returns boolean
  language sql
  immutable
  set search_path = ''
as $$
  select p_adresse is not null
     and length(p_adresse) <= 254
     and p_adresse ~ '^[A-Za-z0-9.!#$%&''*+/=?^_`{|}~-]+@[A-Za-z0-9]([A-Za-z0-9-]{0,61}[A-Za-z0-9])?(\.[A-Za-z0-9]([A-Za-z0-9-]{0,61}[A-Za-z0-9])?)+$'
$$;

revoke all on function app.mailadresse_gueltig(text) from public, anon;
grant execute on function app.mailadresse_gueltig(text) to authenticated, service_role;

/*
  DIE VORLAGEN: ein Objekt mit höchstens `rechnung` und `angebot`, darin
  höchstens `betreff` (eine Zeile, 200 Zeichen) und `text` (10.000 Zeichen).
  Leer oder fehlend heißt: die Standardvorlage der App.
*/
create or replace function app.mail_vorlagen_gueltig(p jsonb) returns boolean
  language sql
  immutable
  set search_path = ''
as $$
  select p is null or (
    jsonb_typeof(p) = 'object'
    and not exists (select 1 from jsonb_object_keys(p) k where k not in ('rechnung', 'angebot'))
    and not exists (
      select 1 from jsonb_each(p) e
       where jsonb_typeof(e.value) <> 'object'
          or exists (select 1 from jsonb_object_keys(e.value) f where f not in ('betreff', 'text'))
          or (e.value ? 'betreff' and (jsonb_typeof(e.value -> 'betreff') <> 'string'
                                       or char_length(e.value ->> 'betreff') > 200
                                       or (e.value ->> 'betreff') ~ '[\r\n]'))
          or (e.value ? 'text' and (jsonb_typeof(e.value -> 'text') <> 'string'
                                    or char_length(e.value ->> 'text') > 10000))))
$$;

revoke all on function app.mail_vorlagen_gueltig(jsonb) from public, anon;
grant execute on function app.mail_vorlagen_gueltig(jsonb) to authenticated, service_role;

alter table public.companies
  add column if not exists beleg_mail_antwort text,
  add column if not exists beleg_mail_vorlagen jsonb;

alter table public.companies drop constraint if exists companies_beleg_mail_antwort;
alter table public.companies add constraint companies_beleg_mail_antwort
  check (beleg_mail_antwort is null or app.mailadresse_gueltig(beleg_mail_antwort));
alter table public.companies drop constraint if exists companies_beleg_mail_vorlagen;
alter table public.companies add constraint companies_beleg_mail_vorlagen
  check (app.mail_vorlagen_gueltig(beleg_mail_vorlagen));

comment on column public.companies.beleg_mail_antwort is
  'F16: Antwortadresse für Rechnungen und Angebote per Mail — Antworten des Kunden und die Kopie an den Betrieb gehen dorthin.';
comment on column public.companies.beleg_mail_vorlagen is
  'F16: Betreff und Text je Belegart ({"rechnung": {"betreff", "text"}, "angebot": {…}}); leer heißt Standardvorlage.';

-- ---------------------------------------------------------------------------
-- Das Protokoll
-- ---------------------------------------------------------------------------

create table if not exists public.beleg_versand (
  id                uuid primary key default gen_random_uuid(),
  company_id        text not null references public.companies(id) on delete cascade,
  art               text not null check (art in ('rechnung', 'angebot')),
  -- Bleibt stehen, falls das Angebot einmal gelöscht wird (Entwurf im Papierkorb): Nummer und Zeitpunkt reichen dann.
  invoice_id        uuid references public.invoices(id) on delete set null,
  quote_id          uuid references public.quotes(id) on delete set null,
  beleg_nummer      text not null,
  an                text[] not null check (cardinality(an) between 1 and 3),
  kopie_an          text,
  betreff           text not null check (char_length(betreff) between 1 and 200),
  anhang_name       text not null,
  anhang_bytes      integer not null check (anhang_bytes > 0),
  anhang_sha256     text not null check (anhang_sha256 ~ '^[0-9a-f]{64}$'),
  mit_link          boolean not null default false,
  zustand           text not null default 'laeuft' check (zustand in ('laeuft', 'versendet', 'gescheitert')),
  fehler            text,
  server_antwort    text,
  angefragt_am      timestamptz not null default now(),
  erledigt_am       timestamptz,
  von_uid           uuid,
  von_name          text
);

create index if not exists beleg_versand_betrieb on public.beleg_versand (company_id, angefragt_am desc);
create index if not exists beleg_versand_rechnung on public.beleg_versand (invoice_id) where invoice_id is not null;
create index if not exists beleg_versand_angebot on public.beleg_versand (quote_id) where quote_id is not null;
create index if not exists beleg_versand_person on public.beleg_versand (company_id, von_uid, angefragt_am desc);

comment on table public.beleg_versand is
  'F16: Rechnungen und Angebote per Mail — je Versuch wann, von wem, an wen, welcher Beleg und was der Mailserver sagte. Text und PDF stehen nicht darin.';

alter table public.beleg_versand enable row level security;
revoke all on public.beleg_versand from anon, authenticated;
grant select on public.beleg_versand to authenticated;

drop trigger if exists beleg_versand_kein_support_schreiben on public.beleg_versand;
create trigger beleg_versand_kein_support_schreiben
  before insert or update or delete on public.beleg_versand
  for each row execute function app.support_schreibt_nicht();

/*
  LESEN WIE DER BELEG: den Versand einer Rechnung, wer Rechnungen liest; den
  eines Angebots, wer Angebote liest (`quotes_lesen`). Geschrieben wird nur
  über die Funktionen unten.
*/
drop policy if exists beleg_versand_lesen on public.beleg_versand;
create policy beleg_versand_lesen on public.beleg_versand
  for select using (
    (company_id = (select app.lesebetrieb())
      and case art
            when 'rechnung' then (select app.ist_buch_oder_spitze())
            when 'angebot' then (select app.ist_fuehrung()) or (select app.ist_buch_oder_spitze())
            else false
          end)
    or company_id = (select app.supportbetrieb()));

-- ---------------------------------------------------------------------------
-- Vorbereiten — mit den Rechten der Person
-- ---------------------------------------------------------------------------

/*
  Prüft, ob die Person diesen Beleg an diese Empfänger senden darf, zählt das
  Rate-Limit und legt die Zeile „läuft“ an. Gerufen von `beleg-mail` mit dem
  Anmeldetoken der Person.

  RECHTE: eine Rechnung sendet, wer Rechnungen schreibt (Buchhaltung,
  Geschäftsführung, Administration); ein Angebot, wer Angebote schreibt
  (Projektleitung, Geschäftsführung, Administration) — ein Entwurf wird
  dadurch versendet. Nicht der Support: die Mail ist eine Erklärung des
  Betriebs an seinen Kunden (wie der Annahme-Link).

  RATE-LIMIT (dieselben Zahlen wie `shared/belegMail.ts`): je Person 30 je
  Stunde, je Betrieb 100 je Stunde und 400 je Tag, je Beleg 5 je Stunde.
  Gezählt wird jeder Versuch. Gesperrt wird je Betrieb, damit zwei
  gleichzeitige Aufrufe nicht beide unter der Grenze zählen.
*/
create or replace function public.beleg_versand_vorbereiten(
  p_art text,
  p_beleg uuid,
  p_an text[],
  p_kopie boolean,
  p_betreff text,
  p_anhang_bytes integer,
  p_anhang_sha256 text,
  p_mit_link boolean default false
) returns jsonb
  language plpgsql
  security definer
  set search_path = ''
as $$
declare
  betrieb text := app.betrieb();
  firma public.companies;
  rechnung public.invoices;
  angebot public.quotes;
  nummer text;
  adresse text;
  wer text;
  neu uuid;
  heute date := (now() at time zone 'Europe/Vienna')::date;
begin
  if betrieb is null or not app.betriebsmitglied(betrieb) then
    raise exception 'Belege per Mail sendet, wer im Betrieb angemeldet ist.' using errcode = '42501';
  end if;
  if p_art = 'rechnung' then
    if not app.hat_rolle(array['Buchhaltung', 'Geschäftsführung', 'Administrator']) then
      raise exception 'Rechnungen per Mail sendet, wer Rechnungen schreibt.' using errcode = '42501';
    end if;
  elsif p_art = 'angebot' then
    if not app.hat_rolle(array['Projektleiter', 'Geschäftsführung', 'Administrator']) then
      raise exception 'Angebote per Mail sendet die Führung.' using errcode = '42501';
    end if;
  else
    raise exception 'Per Mail gehen Rechnungen und Angebote.' using errcode = '22023';
  end if;

  select * into firma from public.companies c where c.id = betrieb;
  if firma.beleg_mail_antwort is null then
    raise exception 'Bitte zuerst unter Einstellungen → Rechnungsvorgaben eine Antwortadresse für Belege eintragen — dorthin antwortet der Kunde.'
      using errcode = '55000';
  end if;

  -- Empfänger: eine bis drei gültige Adressen, jede einmal.
  if p_an is null or cardinality(p_an) not between 1 and 3 then
    raise exception 'Eine bis drei Empfängeradressen.' using errcode = '22023';
  end if;
  foreach adresse in array p_an loop
    if not app.mailadresse_gueltig(adresse) then
      raise exception '„%“ ist keine gültige E-Mail-Adresse.', left(coalesce(adresse, ''), 80) using errcode = '22023';
    end if;
  end loop;
  if (select count(distinct lower(a)) from unnest(p_an) a) <> cardinality(p_an) then
    raise exception 'Jede Empfängeradresse nur einmal.' using errcode = '22023';
  end if;
  if p_betreff is null or char_length(btrim(p_betreff)) not between 1 and 200 or p_betreff ~ '[\r\n]' then
    raise exception 'Der Betreff steht in einer Zeile und hat 1 bis 200 Zeichen.' using errcode = '22023';
  end if;
  if p_anhang_bytes is null or p_anhang_bytes not between 1 and 6291456 then
    raise exception 'Der Anhang ist leer oder größer als 6 MB.' using errcode = '22023';
  end if;
  if p_anhang_sha256 is null or p_anhang_sha256 !~ '^[0-9a-f]{64}$' then
    raise exception 'Die Prüfsumme des Anhangs fehlt.' using errcode = '22023';
  end if;

  if p_art = 'rechnung' then
    if coalesce(p_mit_link, false) then
      raise exception 'Einen Annahme-Link gibt es nur beim Angebot.' using errcode = '22023';
    end if;
    select * into rechnung from public.invoices i where i.id = p_beleg and i.company_id = betrieb;
    if rechnung.id is null then
      raise exception 'Diese Rechnung gibt es hier nicht.' using errcode = 'P0002';
    end if;
    if rechnung.payment_status = 'Storniert' then
      raise exception 'Rechnung % ist storniert — eine stornierte Forderung geht nicht mehr hinaus.', rechnung.invoice_number
        using errcode = '55000';
    end if;
    nummer := rechnung.invoice_number;
  else
    select * into angebot from public.quotes q where q.id = p_beleg and q.company_id = betrieb;
    if angebot.id is null then
      raise exception 'Dieses Angebot gibt es hier nicht.' using errcode = 'P0002';
    end if;
    if angebot.status not in ('Entwurf', 'Versendet', 'Angenommen') then
      raise exception 'Angebot % ist „%“ — es geht nicht mehr hinaus.', angebot.quote_number, angebot.status
        using errcode = '55000';
    end if;
    -- A5: ein leeres Angebot geht nicht hinaus — auch nicht per Mail.
    if angebot.status = 'Entwurf' and not app.angebot_hat_position(angebot.id) then
      raise exception 'Angebot % hat keine Position — ein leeres Angebot wird nicht versendet', angebot.quote_number
        using errcode = '55000';
    end if;
    -- Mit Link nur, wenn es einen offenen gibt: sonst stünde im Protokoll ein Link, den der Kunde nicht öffnen kann.
    if coalesce(p_mit_link, false) and not exists (
         select 1 from public.angebot_links a
          where a.quote_id = angebot.id and a.widerrufen_am is null
            and a.angenommen_am is null and a.abgelehnt_am is null and a.gueltig_bis >= heute) then
      raise exception 'Zu Angebot % gibt es keinen offenen Annahme-Link.', angebot.quote_number using errcode = '55000';
    end if;
    nummer := angebot.quote_number;
  end if;

  perform pg_advisory_xact_lock(hashtextextended('beleg_versand:' || betrieb, 0));
  if (select count(*) from public.beleg_versand v
       where v.company_id = betrieb and v.von_uid = auth.uid() and v.angefragt_am > now() - interval '1 hour') >= 30
     or (select count(*) from public.beleg_versand v
          where v.company_id = betrieb and v.angefragt_am > now() - interval '1 hour') >= 100
     or (select count(*) from public.beleg_versand v
          where v.company_id = betrieb and v.angefragt_am > now() - interval '1 day') >= 400 then
    raise exception 'Zu viele Mails in kurzer Zeit — bitte später noch einmal versuchen.' using errcode = 'P0429';
  end if;
  if (select count(*) from public.beleg_versand v
       where v.company_id = betrieb and v.angefragt_am > now() - interval '1 hour'
         and (v.invoice_id = p_beleg or v.quote_id = p_beleg)) >= 5 then
    raise exception '% ging in der letzten Stunde schon fünfmal hinaus — bitte später noch einmal versuchen.', nummer
      using errcode = 'P0429';
  end if;

  select u.name into wer from public.users u where u.id = auth.uid();
  insert into public.beleg_versand
    (company_id, art, invoice_id, quote_id, beleg_nummer, an, kopie_an, betreff, anhang_name, anhang_bytes,
     anhang_sha256, mit_link, von_uid, von_name)
  values
    (betrieb, p_art, rechnung.id, angebot.id, nummer, p_an,
     case when coalesce(p_kopie, false) then firma.beleg_mail_antwort end,
     btrim(p_betreff),
     (case when p_art = 'rechnung' then 'Rechnung_' else 'Angebot_' end) || regexp_replace(nummer, '[^A-Za-z0-9._-]', '_', 'g') || '.pdf',
     p_anhang_bytes, p_anhang_sha256, coalesce(p_mit_link, false), auth.uid(), wer)
  returning id into neu;

  return jsonb_build_object(
    'id', neu,
    'nummer', nummer,
    'firma', firma.name,
    'antwort', firma.beleg_mail_antwort,
    'kopie', case when coalesce(p_kopie, false) then firma.beleg_mail_antwort end,
    'dateiname', (select v.anhang_name from public.beleg_versand v where v.id = neu));
end;
$$;

revoke all on function public.beleg_versand_vorbereiten(text, uuid, text[], boolean, text, integer, text, boolean) from public, anon;
grant execute on function public.beleg_versand_vorbereiten(text, uuid, text[], boolean, text, integer, text, boolean) to authenticated;

-- ---------------------------------------------------------------------------
-- Festhalten — nur der Dienst
-- ---------------------------------------------------------------------------

/*
  Das Ergebnis des Versands. Nur mit dem Dienstschlüssel (die Edge Function):
  ein „versendet“ im Protokoll soll heißen, dass der Mailserver die Mail
  angenommen hat — nicht, dass jemand es behauptet.

  EIN ENTWURF WIRD VERSENDET wie beim „Als versendet markieren“: Stand,
  Zeitpunkt, Firmendaten-Stand und ein Eintrag im Änderungsjournal. Weil der
  Dienst schreibt, übergehen die Auslöser ihn (`app.ist_dienst()`); deshalb
  setzt diese Funktion die drei Werte selbst und schreibt das Journal mit der
  Person, die gesendet hat.
*/
create or replace function public.beleg_versand_festhalten(
  p_id uuid,
  p_ok boolean,
  p_fehler text default null,
  p_server_antwort text default null
) returns jsonb
  language plpgsql
  security definer
  set search_path = ''
as $$
declare
  v public.beleg_versand;
  q public.quotes;
  status_vorher text;
begin
  update public.beleg_versand x
     set zustand = case when p_ok then 'versendet' else 'gescheitert' end,
         fehler = case when p_ok then null else left(nullif(btrim(coalesce(p_fehler, '')), ''), 500) end,
         server_antwort = left(nullif(btrim(coalesce(p_server_antwort, '')), ''), 300),
         erledigt_am = now()
   where x.id = p_id and x.zustand = 'laeuft'
  returning * into v;
  if v.id is null then
    raise exception 'Diesen laufenden Versand gibt es nicht (mehr).' using errcode = 'P0002';
  end if;

  if p_ok and v.art = 'angebot' and v.quote_id is not null then
    select * into q from public.quotes where id = v.quote_id for update;
    status_vorher := q.status;
    if q.status = 'Entwurf' then
      update public.quotes
         set status = 'Versendet', versendet_am = now(), aussteller_stand = app.aussteller_stand(q.company_id)
       where id = q.id;
      insert into public.aenderungsjournal
        (company_id, objektart, objekt_id, kunde_id, art, aenderungen, bezeichnung, von_uid, von_name)
      values
        (q.company_id, 'angebot', q.id, q.customer_id, 'geaendert',
         jsonb_build_object('status', jsonb_build_object('alt', 'Entwurf', 'neu', 'Versendet')),
         q.quote_number, v.von_uid, v.von_name);
    end if;
  end if;

  return jsonb_build_object('zustand', v.zustand, 'angebot_vorher', status_vorher);
end;
$$;

revoke all on function public.beleg_versand_festhalten(uuid, boolean, text, text) from public, anon, authenticated;
grant execute on function public.beleg_versand_festhalten(uuid, boolean, text, text) to service_role;

-- ---------------------------------------------------------------------------
-- Im Verlauf von Rechnung und Angebot
-- ---------------------------------------------------------------------------

/*
  Wie die Mahnungen und Kontoumstellungen: eine eigene Quelle in
  `objekt_verlauf`, gelesen mit der Regel von `beleg_versand` (die Sicht
  läuft mit den Rechten des Lesers). Gezielt angehängt, damit keine Quelle
  verloren geht, die eine andere Migration dazugesetzt hat.
*/
do $migration$
declare
  bisher text := rtrim(btrim(pg_get_viewdef('public.objekt_verlauf'::regclass, true)), ';');
begin
  if position('beleg_versand' in bisher) = 0 then
    execute 'create or replace view public.objekt_verlauf with (security_invoker = true) as '
      || bisher || $teil$
UNION ALL
 SELECT 'beleg_versand'::text AS quelle,
    v.id::text AS id,
    v.company_id,
    v.art AS objektart,
    coalesce(v.invoice_id, v.quote_id) AS objekt_id,
    NULL::uuid AS bezug_id,
    CASE v.zustand
      WHEN 'versendet' THEN 'per_mail_versendet'
      WHEN 'gescheitert' THEN 'mailversand_gescheitert'
      ELSE 'mailversand_laeuft'
    END AS art,
    jsonb_build_object('an', to_jsonb(v.an), 'kopie', v.kopie_an, 'betreff', v.betreff, 'anhang', v.anhang_name,
      'mit_link', v.mit_link, 'fehler', v.fehler) AS aenderungen,
    v.beleg_nummer AS bezeichnung,
    v.von_name,
    v.angefragt_am AS am
   FROM public.beleg_versand v
  WHERE coalesce(v.invoice_id, v.quote_id) IS NOT NULL$teil$;
  end if;
end;
$migration$;

-- ---------------------------------------------------------------------------
-- Datenauskunft und Löschung
-- ---------------------------------------------------------------------------

/*
  ZWEI PERSONEN STEHEN DARIN: wer gesendet hat (Mitarbeiter: Anzahl als
  Bearbeiter; bei der Löschung wird der Name entfernt) und der Kunde als
  Empfänger (Kunde: seine Versände mit Adressen; bei der Löschung werden die
  Adressen entfernt — Zeitpunkt, Beleg und Betreff bleiben als Nachweis neben
  dem aufbewahrten Beleg).
*/
do $migration$
declare
  quelle text;
  marke text;
  zahl integer;
begin
  quelle := pg_get_functiondef('public.person_auskunft(text,uuid,integer)'::regprocedure);
  if position('belege_per_mail' in quelle) = 0 then
    marke := $m$      'zahlungen_erfasst', (select count(*)$m$;
    zahl := (length(quelle) - length(replace(quelle, marke, ''))) / length(marke);
    if zahl <> 1 then raise exception 'Personenauskunft: Einfügestelle (Bearbeiter) % mal gefunden', zahl; end if;
    quelle := replace(quelle, marke, $neu$      -- F16: Rechnungen und Angebote, die sie per Mail gesendet hat.
      'belege_per_mail', (select count(*) from public.beleg_versand v
        where v.company_id = betrieb and v.von_uid = p_id),
$neu$ || marke);

    marke := $m$      -- M01b: was an ihm und seinen Objekten geändert wurde — ohne die Namen der Bearbeiter.$m$;
    zahl := (length(quelle) - length(replace(quelle, marke, ''))) / length(marke);
    if zahl <> 1 then raise exception 'Personenauskunft: Einfügestelle (Kunde) % mal gefunden', zahl; end if;
    quelle := replace(quelle, marke, $neu$      -- F16: seine Rechnungen und Angebote per Mail — an welche Adressen, wann; ohne wer im Betrieb gesendet hat.
      'belege_per_mail', (
        select coalesce(jsonb_agg(jsonb_build_object(
                 'beleg', v.beleg_nummer, 'art', v.art, 'an', to_jsonb(v.an), 'betreff', v.betreff,
                 'anhang', v.anhang_name, 'mit_link', v.mit_link, 'zustand', v.zustand, 'am', v.angefragt_am)
                 order by v.angefragt_am, v.id), '[]'::jsonb)
          from public.beleg_versand v
          left join public.invoices r on r.id = v.invoice_id
          left join public.quotes q on q.id = v.quote_id
         where v.company_id = betrieb
           and (r.customer_id = p_id or q.customer_id = p_id
                or (coalesce(r.customer_id, q.customer_id) is null
                    and lower(btrim(coalesce(r.customer_name, q.customer_name))) = lower(btrim(kunde.name))))),
$neu$ || marke);
    execute quelle;
  end if;

  quelle := pg_get_functiondef('public.person_loeschen(text,uuid,boolean)'::regprocedure);
  if position('beleg_versand' in quelle) = 0 then
    -- Mitarbeiter: zählen und den Namen entfernen.
    marke := $m$      'geburtsdatum', (select count(*) from public.geburtsdaten g$m$;
    zahl := (length(quelle) - length(replace(quelle, marke, ''))) / length(marke);
    if zahl <> 1 then raise exception 'Personenlöschung: Einfügestelle (Zählung) % mal gefunden', zahl; end if;
    quelle := replace(quelle, marke, ltrim($neu$
      'beleg_versand', (select count(*) from public.beleg_versand v
                         where v.company_id = betrieb and v.von_uid = p_id),
$neu$, E'\n') || marke);

    marke := $m$      delete from public.geburtsdaten g where g.company_id = betrieb and g.user_id = p_id;$m$;
    zahl := (length(quelle) - length(replace(quelle, marke, ''))) / length(marke);
    if zahl <> 1 then raise exception 'Personenlöschung: Einfügestelle (Löschen) % mal gefunden', zahl; end if;
    quelle := replace(quelle, marke, marke || $neu$
      update public.beleg_versand v set von_uid = null, von_name = null
       where v.company_id = betrieb and v.von_uid = p_id;$neu$);

    -- Kunde: die Empfängeradressen gehen, sobald er gelöscht wird — ganz oder mit aufbewahrten Belegen.
    marke := $m$      -- M02a: offene Annahme-Links seiner Angebote werden widerrufen.$m$;
    zahl := (length(quelle) - length(replace(quelle, marke, ''))) / length(marke);
    if zahl <> 1 then raise exception 'Personenlöschung: Einfügestelle (Kunde, Zählung) % mal gefunden', zahl; end if;
    quelle := replace(quelle, marke, $neu$      -- F16: Empfängeradressen seiner Rechnungen und Angebote per Mail.
      'mailversand_adressen', (select count(*) from public.beleg_versand v
                                 left join public.invoices r on r.id = v.invoice_id
                                 left join public.quotes q on q.id = v.quote_id
                                where v.company_id = betrieb and v.an <> array['entfernt']::text[]
                                  and (r.customer_id = p_id or q.customer_id = p_id
                                       or (coalesce(r.customer_id, q.customer_id) is null
                                           and lower(btrim(coalesce(r.customer_name, q.customer_name))) = lower(btrim(kunde.name))))),
$neu$ || marke);

    marke := $m$      delete from public.wartungen w where w.company_id = betrieb and w.customer_id = p_id;$m$;
    zahl := (length(quelle) - length(replace(quelle, marke, ''))) / length(marke);
    if zahl <> 1 then raise exception 'Personenlöschung: Einfügestelle (Kunde) % mal gefunden', zahl; end if;
    quelle := replace(quelle, marke, marke || $neu$
      -- F16: die Empfängeradressen seiner Versände; Zeitpunkt, Beleg und Betreff bleiben neben dem Beleg.
      update public.beleg_versand v set an = array['entfernt']::text[]
        from (select v2.id from public.beleg_versand v2
                left join public.invoices r on r.id = v2.invoice_id
                left join public.quotes q on q.id = v2.quote_id
               where v2.company_id = betrieb
                 and (r.customer_id = p_id or q.customer_id = p_id
                      or (coalesce(r.customer_id, q.customer_id) is null
                          and lower(btrim(coalesce(r.customer_name, q.customer_name))) = lower(btrim(kunde.name))))) t
       where v.id = t.id;$neu$);
    execute quelle;
  end if;
end;
$migration$;
