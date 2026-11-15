-- Durchsicht 15.11.2026, G11: Rechnungsnummern entstehen nur mit dem Beleg,
-- der sie verbraucht.
--
-- WAS VORHER WAR: `public.naechste_nummer('invoices', …)` stand jeder
-- Buchhaltung offen. Eine so gezogene Nummer wurde nie eine Rechnung — eine
-- Lücke im lückenlosen Rechnungskreis, und die Ursache dessen, was die
-- Lückenprüfung im Export findet (N4). Nachgestellt:
-- `tests/supabase/nummernkreisNurMitBeleg.test.ts` (rot ohne diese Migration:
-- der direkte Aufruf liefert eine Nummer).
--
-- GEPRÜFTE AUFRUFER (App, Datenbank, Edge Functions):
--   - App: `reserveInvoiceNumber` war seit dem Ausstellen in einem Zug
--     (P2-04, 25.09.2026) ungenutzt und ist entfernt; Baustellen und Angebote
--     ziehen weiter über `naechste_nummer` (siehe G10).
--   - Datenbank: Rechnungsnummern ziehen nur `rechnung_ausstellen` (auch über
--     `rechnung_ersetzen`) und `stornorechnung_ausstellen` — beide jetzt über
--     `app.rechnungsnummer_ziehen`, in der Transaktion, die den Beleg anlegt.
--     Baustellen-, Angebots- und Eingangsnummern ziehen
--     `eingang_zu_baustelle`, `eingang_zu_angebot`, `wartung_einplanen`,
--     `angebot_annehmen_kern` und der Auslöser der Eingänge — unverändert.
--   - Edge Functions: keine zieht eine Nummer.
--
-- WARUM NUR DER RECHNUNGSKREIS: Angebots- und Baustellennummern sind
-- Vorschläge — der Betrieb darf sie überschreiben (Nummer des Bauträgers),
-- und der Zähler springt über vergebene. Lückenlos muss dort nichts sein; die
-- alte App zieht sie weiter über diese Funktion.
--
-- `app.rechnungsnummer_ziehen` liegt im Schema `app`, das die Schnittstelle
-- nicht anbietet: aufrufbar ist es nur aus den Funktionen der Datenbank. Die
-- Rechte bekommt die Rolle `authenticated`, weil `rechnung_ausstellen` als
-- Aufrufer läuft.
--
-- Verträglich mit der alten App: sie zieht Rechnungsnummern seit P2-04 nicht
-- mehr direkt.

create or replace function app.rechnungsnummer_ziehen(p_jahr integer, p_wunsch integer) returns integer
  language plpgsql
  security definer
  set search_path = ''
as $$
declare
  betrieb text := app.arbeitsbetrieb();
begin
  if betrieb is null or not app.angemeldet() then
    raise exception 'Nicht angemeldet' using errcode = '42501';
  end if;
  -- Die Regeln aus `naechste_nummer`: kein Support, nur wer abrechnet.
  if app.ist_plattform() then
    raise exception 'Rechnungsnummern vergibt nur der Betrieb selbst — Rechnungen gehen im Supportzugang nicht'
      using errcode = '42501';
  end if;
  if not app.ist_buch_oder_spitze() then
    raise exception 'Nur die Buchhaltung vergibt Rechnungsnummern' using errcode = '42501';
  end if;
  return app.naechste_nummer_kern(betrieb, 'invoices', p_jahr, p_wunsch);
end;
$$;

revoke all on function app.rechnungsnummer_ziehen(integer, integer) from public, anon;
grant execute on function app.rechnungsnummer_ziehen(integer, integer) to authenticated, service_role;

/* `naechste_nummer` — die Fassung aus `20261107300000_auftragseingang.sql`, ohne Rechnungsnummern. */
CREATE OR REPLACE FUNCTION public.naechste_nummer(p_art text, p_jahr integer, p_seed integer DEFAULT 0, p_wunsch integer DEFAULT NULL::integer)
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  betrieb text;
begin
  betrieb := app.arbeitsbetrieb();
  if betrieb is null or not app.angemeldet() then
    raise exception 'Nicht angemeldet' using errcode = '42501';
  end if;
  if p_art is null or p_art not in ('invoices', 'quotes', 'projects') then
    raise exception 'Diesen Nummernkreis vergibt die App selbst beim Anlegen' using errcode = '42501';
  end if;
  /*
    RECHNUNGSNUMMERN NUR MIT IHREM BELEG (Durchsicht 15.11.2026, G11). Eine
    hier gezogene Rechnungsnummer wurde nie eine Rechnung — eine Lücke im
    lückenlosen Kreis, die der Betrieb dem Finanzamt erklären müsste, und die
    Ursache dessen, was die Lückenprüfung findet (N4). Die App zieht sie hier
    seit dem 25.09.2026 nicht mehr; Rechnung und Stornorechnung ziehen ihre
    Nummer in derselben Transaktion, die sie anlegt (`app.rechnungsnummer_ziehen`).
  */
  if p_art = 'invoices' then
    raise exception 'Rechnungsnummern entstehen nur zusammen mit ihrer Rechnung oder Stornorechnung — so bleibt der Kreis lückenlos.'
      using errcode = '42501';
  end if;
  -- Die Regeln für Support und Buchhaltung stehen jetzt in `app.rechnungsnummer_ziehen`.
  if p_art = 'quotes' and not (app.ist_fuehrung() or app.ist_buch_oder_spitze()) then
    raise exception 'Nur die Führung vergibt Angebotsnummern' using errcode = '42501';
  end if;
  if p_art = 'projects' and not app.ist_fuehrung() then
    raise exception 'Nur die Führung vergibt Baustellennummern' using errcode = '42501';
  end if;

  return app.naechste_nummer_kern(betrieb, p_art, p_jahr, p_wunsch);
end;
$function$;

revoke all on function public.naechste_nummer(text, integer, integer, integer) from public, anon;
grant execute on function public.naechste_nummer(text, integer, integer, integer) to authenticated, service_role;

/* `rechnung_ausstellen` — die Fassung aus `20261116050300_erstellungsversuch.sql`; die Nummer über `app.rechnungsnummer_ziehen`. */
create or replace function public.rechnung_ausstellen(
  p_kopf jsonb,
  p_positionen jsonb,
  p_belege jsonb,
  p_praefix text,
  p_jahr integer default null,
  p_wunsch integer default null,
  p_datum_ausdruecklich boolean default false,
  p_versuch uuid default null
) returns jsonb
  language plpgsql
  set search_path = ''
as $$
declare
  betrieb text := app.betrieb();
  heute date := (now() at time zone 'Europe/Vienna')::date;
  datum date;
  jahr integer;
  lfd integer;
  nummer text;
  kennung uuid;
  schon record;
begin
  if p_versuch is not null then
    if betrieb is null or not app.angemeldet() then
      raise exception 'Nicht angemeldet' using errcode = '42501';
    end if;
    /*
      DERSELBE VERSUCH ENTSTEHT NUR EINMAL (G2). Die Sperre wartet auf einen
      gleichen Aufruf, der noch läuft, und auf eine laufende Klärung; danach
      wird mit deren Ergebnis entschieden.
    */
    perform app.rechnungsversuch_sperren(betrieb, p_versuch);
    select i.id, i.invoice_number, i.invoice_date into schon
      from public.invoices i
     where i.company_id = betrieb and i.erstellungsversuch = p_versuch;
    if found then
      return jsonb_build_object('id', schon.id, 'invoice_number', schon.invoice_number,
                                'invoice_date', schon.invoice_date, 'bereits', true);
    end if;
    if app.rechnungsversuch_ohne_beleg(betrieb, p_versuch) then
      raise exception 'Dieser Erstellungsversuch ist bereits als „nicht entstanden“ geklärt — es wurde keine Rechnung angelegt. Bitte neu erstellen.'
        using errcode = '22023';
    end if;
  end if;

  -- `p_jahr` zählt nicht mehr: das Jahr folgt dem Rechnungsdatum (G5).
  datum := coalesce(nullif(p_kopf ->> 'invoice_date', '')::date, heute);
  if datum <> heute and not coalesce(p_datum_ausdruecklich, false) then
    raise exception 'Das Datum dieses Geräts (%) ist nicht der heutige Tag (%). Die Rechnung ist nicht angelegt, keine Nummer verbraucht — bitte Datum und Uhrzeit des Geräts prüfen und neu laden.',
      to_char(datum, 'DD.MM.YYYY'), to_char(heute, 'DD.MM.YYYY')
      using errcode = '22023';
  end if;
  jahr := extract(year from datum)::integer;

  -- Die Nummer entsteht nur hier, mit ihrer Rechnung (G11).
  lfd := app.rechnungsnummer_ziehen(jahr, p_wunsch);
  nummer := case when coalesce(p_praefix, '') = '' then '' else p_praefix || '-' end
         || jahr::text || '-'
         || case when lfd >= 10000 then lfd::text else lpad(lfd::text, 4, '0') end;

  kennung := public.rechnung_anlegen(
    coalesce(p_kopf, '{}'::jsonb)
      || jsonb_build_object('invoice_number', nummer, 'invoice_date', datum,
                            'erstellungsversuch', p_versuch),
    p_positionen,
    p_belege);

  return jsonb_build_object('id', kennung, 'invoice_number', nummer, 'invoice_date', datum, 'bereits', false);
end;
$$;

revoke all on function public.rechnung_ausstellen(jsonb, jsonb, jsonb, text, integer, integer, boolean, uuid) from public, anon;
grant execute on function public.rechnung_ausstellen(jsonb, jsonb, jsonb, text, integer, integer, boolean, uuid) to authenticated, service_role;

/* `stornorechnung_ausstellen` — die Fassung aus `20261116050500_stornorechnung_text_fest.sql`; die Nummer ebenso. */
create or replace function public.stornorechnung_ausstellen(p_id uuid, p_praefix text) returns jsonb
  language plpgsql
  set search_path = ''
as $$
declare
  rechnung public.invoices;
  jahr integer;
  lfd integer;
  nummer text;
begin
  -- Gesperrt: ein gleichzeitiger Eingang ändert den Betrag nicht zwischen Lesen und Festhalten.
  select * into rechnung from public.invoices i
   where i.id = p_id and i.company_id = app.betrieb()
     for update;
  if rechnung.id is null then
    raise exception 'Diese Rechnung gibt es nicht' using errcode = 'P0002';
  end if;
  if rechnung.payment_status is distinct from 'Storniert' then
    raise exception 'Eine Stornorechnung gibt es nur zu einer stornierten Rechnung'
      using errcode = '22023';
  end if;
  if rechnung.storno_nummer is not null then
    return jsonb_build_object('storno_nummer', rechnung.storno_nummer, 'storno_am', rechnung.storno_am,
                              'storno_bezahlt', rechnung.storno_bezahlt);
  end if;

  jahr := extract(year from (now() at time zone 'Europe/Vienna'))::integer;
  -- Die Nummer entsteht nur hier, mit ihrer Stornorechnung (G11).
  lfd := app.rechnungsnummer_ziehen(jahr, null);
  nummer := case when coalesce(p_praefix, '') = '' then '' else p_praefix || '-' end
         || jahr::text || '-'
         || case when lfd >= 10000 then lfd::text else lpad(lfd::text, 4, '0') end;

  perform set_config('senklot.stornorechnung', p_id::text, true);
  update public.invoices
     set storno_nummer = nummer, storno_am = now(), storno_bezahlt = coalesce(rechnung.bezahlt_betrag, 0)
   where id = p_id;
  perform set_config('senklot.stornorechnung', '', true);

  return jsonb_build_object('storno_nummer', nummer, 'storno_am', now(),
                            'storno_bezahlt', coalesce(rechnung.bezahlt_betrag, 0));
end;
$$;

revoke all on function public.stornorechnung_ausstellen(uuid, text) from public, anon;
grant execute on function public.stornorechnung_ausstellen(uuid, text) to authenticated, service_role;
