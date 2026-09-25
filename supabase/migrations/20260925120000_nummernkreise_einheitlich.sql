-- NUMMERNKREISE: EINE LOGIK, UND RECHNUNGEN LÜCKENLOS.
--
-- Aus dem Launch-Check (25.09.2026):
--
--   K6 — drei Logiken für dieselbe Frage. Die Einstellungen zeigten als
--   „nächste Nummer" ein festes Beispiel (PR-2026-0001, obwohl 0003 schon
--   stand), „Neue Baustelle" schlug PR-2026-0188 vor, weil der Zähler seinen
--   Anfangsstand aus der letzten Ziffernfolge IRGENDEINER Nummer las — aus
--   „PR-187", einer von Hand vergebenen —, und „Angebot annehmen" leitete
--   die Nummer vom Angebot ab.
--
--   K8 — die Rechnungsnummer war frei änderbar. RE-2026-1500 statt 1002 ging
--   ohne Warnung durch; erst der Buchhaltungs-Export meldete danach 498
--   fehlende Nummern. Eine Lücke im Rechnungskreis lässt sich nicht mehr
--   schliessen: die Rechnung ist ausgestellt (§ 132 BAO).

/*
  DER ANFANGSSTAND KOMMT AUS DER DATENBANK, nicht vom Browser. Der Browser
  kannte nur, was er geladen hatte (die jüngsten fünfzig Rechnungen), und er
  las jede Ziffernfolge am Ende einer Nummer.

  Gezählt werden nur Nummern nach dem Schema „…JJJJ-NNNN" des gefragten
  Jahres, gleich mit welchem Vorsatz — ein Vorsatz, der mitten im Jahr
  wechselt, reisst den Kreis nicht auf (so, wie es `invoiceNumbers.ts`
  beschreibt), und jedes Jahr beginnt neu. Eine von Hand vergebene Nummer
  wie „PR-187" oder die des Bauträgers gehört zu keinem Kreis und darf ihn
  nicht verschieben.
*/
create or replace function app.hoechste_lfd(p_art text, p_betrieb text, p_jahr integer)
  returns integer
  language sql
  stable
  security definer
  set search_path = ''
as $$
  select coalesce(max(lfd), 0)::integer from (
    select (regexp_match(i.invoice_number, '(?:^|-)' || p_jahr || '-(\d+)$'))[1]::bigint as lfd
      from public.invoices i
     where p_art = 'invoices' and i.company_id = p_betrieb
    union all
    select (regexp_match(q.quote_number, '(?:^|-)' || p_jahr || '-(\d+)$'))[1]::bigint
      from public.quotes q
     where p_art = 'quotes' and q.company_id = p_betrieb
    union all
    select (regexp_match(p.project_number, '(?:^|-)' || p_jahr || '-(\d+)$'))[1]::bigint
      from public.projects p
     where p_art = 'projects' and p.company_id = p_betrieb
  ) x
  where lfd is not null and lfd < 2147483647
$$;

revoke all on function app.hoechste_lfd(text, text, integer) from public, anon;

/*
  DER ZÄHLER.

  `p_seed` bleibt als Parameter, damit ältere Fassungen der App auf den
  Telefonen weiter funktionieren — er wird nicht mehr gelesen.

  DER WUNSCH BEI RECHNUNGEN gilt genau einmal: solange der Betrieb noch
  keine einzige Rechnung hat. Das ist der Umstieg — die erste Rechnung in
  Senklot schliesst an den Kreis des bisherigen Programms an (dort war die
  letzte 1499, hier kommt 1500). Danach vergibt die Datenbank die nächste
  und keine andere.
*/
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
  letzte integer;
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
  if p_art = 'projects' and not app.ist_fuehrung() then
    raise exception 'Nur die Führung vergibt Baustellennummern' using errcode = '42501';
  end if;

  insert into public.number_counters (company_id, art, jahr, stand)
       values (betrieb, p_art, p_jahr, app.hoechste_lfd(p_art, betrieb, p_jahr))
  on conflict (company_id, art, jahr) do nothing;

  select c.stand into letzte from public.number_counters c
   where c.company_id = betrieb and c.art = p_art and c.jahr = p_jahr
     for update;

  /*
    ANGEBOTE UND BAUSTELLEN kann auch ein Mensch nummerieren — eine
    Baustelle mit der Nummer des Bauträgers, die zufällig ins Schema fällt.
    Der Zähler springt über jede, die es schon gibt, statt sie ein zweites
    Mal anzubieten. Rechnungen nicht: die vergibt nur er.
  */
  if p_art in ('quotes', 'projects') then
    letzte := greatest(letzte, app.hoechste_lfd(p_art, betrieb, p_jahr));
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
         select 1 from public.invoices i where i.company_id = betrieb)) then
      raise exception 'Rechnungsnummern laufen lückenlos — die nächste ist %. Eine eigene Nummer geht nur bei der allerersten Rechnung, beim Umstieg aus dem bisherigen Programm.',
        to_char(letzte + 1, 'FM0000')
        using errcode = '22023';
    end if;
    neu := p_wunsch;
  end if;

  update public.number_counters
     set stand = neu, updated_at = now()
   where company_id = betrieb and art = p_art and jahr = p_jahr;

  return neu;
end;
$$;

revoke all on function public.naechste_nummer(text, integer, integer, integer) from public, anon;
grant execute on function public.naechste_nummer(text, integer, integer, integer) to authenticated;

/*
  WAS DIE NÄCHSTE NUMMER WÄRE — ohne sie zu verbrauchen. Für die Vorschau in
  den Einstellungen und die Vorschläge in den Masken. Dieselbe Rechnung wie
  oben, nur ohne zu schreiben: gäbe es zwei, liefen sie auseinander.
*/
create or replace function public.naechste_nummern(p_jahr integer)
  returns table (art text, naechste integer)
  language sql
  stable
  security definer
  set search_path = ''
as $$
  select a.art,
         case
           when coalesce(c.stand, app.hoechste_lfd(a.art, app.betrieb(), p_jahr)) > 0
             then coalesce(c.stand, app.hoechste_lfd(a.art, app.betrieb(), p_jahr)) + 1
           when a.art = 'invoices' then 1001
           else 1
         end
    from (values ('invoices'), ('quotes'), ('projects')) a(art)
    left join public.number_counters c
      on c.company_id = app.betrieb() and c.art = a.art and c.jahr = p_jahr
   where app.betriebsmitglied(app.betrieb())
$$;

revoke all on function public.naechste_nummern(integer) from public, anon;
grant execute on function public.naechste_nummern(integer) to authenticated;

/*
  DER STAND, DER AUS „PR-187" KAM, WIRD ZURÜCKGESETZT — für Angebote und
  Baustellen, und nur nach unten, auf die höchste Nummer im Schema. Doppelt
  vergeben wird dabei nichts: die nächste Nummer liegt über der höchsten, die
  es gibt.

  RECHNUNGEN NICHT. Ein Rechnungszähler geht nie zurück — eine Nummer, die
  er einmal ausgegeben hat, kann auf einem Beleg beim Kunden stehen.
*/
update public.number_counters c
   set stand = app.hoechste_lfd(c.art, c.company_id, c.jahr), updated_at = now()
 where c.art in ('quotes', 'projects')
   and c.stand > app.hoechste_lfd(c.art, c.company_id, c.jahr);
