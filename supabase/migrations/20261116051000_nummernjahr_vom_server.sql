-- Durchsicht 15.11.2026, G10: Angebots- und Baustellennummern nehmen das Jahr
-- vom Server, nicht vom Gerät.
--
-- NACHGESTELLT (Kratzdatenbank): `naechste_nummer('quotes', 2020)` von einem
-- Gerät mit falscher Uhr gab eine Nummer aus einem neu eröffneten Zähler für
-- 2020; die App baute daraus „AN-2020-0001“. Dasselbe für Baustellen. Die
-- Rechnung hatte das Problem auch (G5); Angebot und Baustelle nicht behoben.
--
-- DIE LÖSUNG, wie G5:
--   - `naechste_nummer` zählt im laufenden Jahr in Wien. `p_jahr` bleibt für
--     die alte App; weicht es ab, gibt es keine Nummer, sondern einen Hinweis
--     auf die Uhr des Geräts.
--   - `naechste_belegnummer` gibt die fertige Nummer zurück (Vorsatz, Jahr
--     vom Server, laufende Nummer — `app.belegnummer`, dieselbe Form wie
--     `belegNummer` in der App). Die App schickt kein Jahr mehr mit.
--
-- Die Funktionen der Datenbank, die selbst Nummern ziehen
-- (`eingang_zu_baustelle`, `eingang_zu_angebot`, `wartung_einplanen`),
-- schicken schon das Jahr in Wien und sind nicht betroffen.

/* `naechste_nummer` — die Fassung aus `20261116050900_rechnungsnummer_nur_mit_beleg.sql`, dazu das Jahr. */
CREATE OR REPLACE FUNCTION public.naechste_nummer(p_art text, p_jahr integer, p_seed integer DEFAULT 0, p_wunsch integer DEFAULT NULL::integer)
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  betrieb text;
  -- Das Jahr des Kreises ist das laufende in Wien, nicht das des Geräts (G10).
  jahr integer := extract(year from (now() at time zone 'Europe/Vienna'))::integer;
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

  /*
    DAS JAHR VOM SERVER (Durchsicht 15.11.2026, G10). Ein Gerät mit falscher
    Uhr zog „AN-2020-0001“ und eröffnete einen Zähler für 2020. `p_jahr`
    bleibt, damit die alte App ihren Aufruf behält; stimmt es nicht mit dem
    laufenden Jahr überein, gibt es keine Nummer. Neue Aufrufe nehmen
    `naechste_belegnummer`, das gar kein Jahr mehr mitschickt.
  */
  if p_jahr is not null and p_jahr <> jahr then
    raise exception 'Das Jahr dieses Geräts (%) ist nicht das laufende Jahr (%) — es wurde keine Nummer vergeben. Bitte Datum und Uhrzeit des Geräts prüfen und neu laden.',
      p_jahr, jahr
      using errcode = '22023';
  end if;

  return app.naechste_nummer_kern(betrieb, p_art, jahr, p_wunsch);
end;
$function$;

revoke all on function public.naechste_nummer(text, integer, integer, integer) from public, anon;
grant execute on function public.naechste_nummer(text, integer, integer, integer) to authenticated, service_role;

/*
  DIE FERTIGE NUMMER, MIT DEM JAHR VOM SERVER. Die Rechte prüft
  `naechste_nummer` (Angebote: Führung oder Buchhaltung; Baustellen:
  Führung; Rechnungen: gar nicht).
*/
create or replace function public.naechste_belegnummer(p_art text, p_praefix text) returns text
  language plpgsql
  security definer
  set search_path = ''
as $$
declare
  jahr integer := extract(year from (now() at time zone 'Europe/Vienna'))::integer;
begin
  return app.belegnummer(p_praefix, jahr, public.naechste_nummer(p_art, jahr));
end;
$$;

revoke all on function public.naechste_belegnummer(text, text) from public, anon;
grant execute on function public.naechste_belegnummer(text, text) to authenticated, service_role;
