/*
  FEHLER VOR DER ANMELDUNG (Handbuch „Was noch fehlt", 29.09.2026).

  Das Fehlerprotokoll nimmt nur Einträge von Betriebsmitgliedern an — der
  Betrieb ergibt sich aus dem Token. Stürzte die Anmeldeseite ab, erfuhr es
  niemand; genau dort bleibt aber hängen, wer gar nicht erst hineinkommt.

  WARUM EINE EIGENE TABELLE und nicht `fehlerprotokoll` mit leerem Betrieb:
  dort hängen Zeilenregeln, Supportriegel und Auskunft am Betrieb. Eine
  Zeile ohne Betrieb wäre in allen dreien ein Sonderfall.

  WARUM NUR ÜBER EINE FUNKTION. Schreiben darf hier, wer NICHT angemeldet
  ist — also jeder im Netz. Die Tabelle selbst bleibt zu (Zeilenschutz ohne
  Richtlinie, keine Rechte für `anon` und `authenticated`); die Funktion
  kürzt jedes Feld, nimmt nur „absturz" und „fehler" an, lässt dieselbe
  Meldung erst nach zehn Minuten wieder herein und höchstens 100 Einträge je
  Stunde insgesamt. Wer die Tabelle fluten will, füllt 100 Zeilen und dann
  nichts mehr.

  WAS NICHT HINEINGEHT, wie im Protokoll des Betriebs: keine Person, keine
  Adresse des Geräts im Netz. Die App putzt die Meldung vor dem Senden
  (`lib/fehlerprotokoll.ts:bereinige`); gelesen wird nur von der Plattform.
*/

create table if not exists public.fehler_vor_anmeldung (
  id          uuid primary key default gen_random_uuid(),
  art         text not null check (art in ('absturz', 'fehler')),
  nachricht   text not null check (length(nachricht) <= 500),
  stapel      text check (length(stapel) <= 4000),
  pfad        text check (length(pfad) <= 200),
  fassung     text check (length(fassung) <= 40),
  geraet      text check (length(geraet) <= 300),
  created_at  timestamptz not null default now()
);

create index if not exists fehler_vor_anmeldung_zeit on public.fehler_vor_anmeldung (created_at desc);

alter table public.fehler_vor_anmeldung enable row level security;
revoke all on public.fehler_vor_anmeldung from public, anon, authenticated;

create or replace function public.fehler_vor_anmeldung_eintragen(
  p_art text,
  p_nachricht text,
  p_stapel text default null,
  p_pfad text default null,
  p_fassung text default null,
  p_geraet text default null
) returns void
  language plpgsql
  security definer
  set search_path = ''
as $$
declare
  meldung text := left(btrim(coalesce(p_nachricht, '')), 500);
begin
  if p_art not in ('absturz', 'fehler') or meldung = '' then
    return;
  end if;
  -- Dieselbe Meldung frühestens nach zehn Minuten wieder.
  if exists (select 1 from public.fehler_vor_anmeldung f
              where f.nachricht = meldung
                and f.created_at > now() - interval '10 minutes') then
    return;
  end if;
  -- Und insgesamt nicht mehr als 100 je Stunde.
  if (select count(*) from public.fehler_vor_anmeldung f
       where f.created_at > now() - interval '1 hour') >= 100 then
    return;
  end if;
  insert into public.fehler_vor_anmeldung (art, nachricht, stapel, pfad, fassung, geraet)
  values (p_art, meldung, left(p_stapel, 4000), left(p_pfad, 200), left(p_fassung, 40), left(p_geraet, 300));
end;
$$;

revoke all on function public.fehler_vor_anmeldung_eintragen(text, text, text, text, text, text) from public;
grant execute on function public.fehler_vor_anmeldung_eintragen(text, text, text, text, text, text) to anon, authenticated;

/*
  DIE PLATTFORM SIEHT SIE MIT — als eigener „Betrieb" ohne Kennung. Rumpf
  wie in `20260925090000_problem_melden_an_support.sql`, dazu die Zeilen
  ohne Betrieb.
*/
create or replace function public.fehlerprotokoll_plattform(p_tage integer default 14)
  returns table (
    id uuid, company_id text, betrieb text, art text, nachricht text, stapel text,
    pfad text, fassung text, geraet text, beschreibung text, created_at timestamptz,
    melder text, melder_email text)
  language sql
  stable
  security definer
  set search_path = ''
as $$
  select * from (
    select f.id, f.company_id, c.name, f.art, f.nachricht, f.stapel,
           f.pfad, f.fassung, f.geraet, f.beschreibung, f.created_at,
           case when f.art = 'meldung' then u.name end,
           case when f.art = 'meldung' then u.email end
      from public.fehlerprotokoll f
      join public.companies c on c.id = f.company_id
      left join public.users u on u.id = f.user_id
     where app.ist_plattform()
       and (f.art <> 'meldung' or f.an_support)
       and f.created_at > now() - make_interval(days => least(greatest(coalesce(p_tage, 14), 1), 90))
    union all
    select v.id, '', 'Vor der Anmeldung', v.art, v.nachricht, v.stapel,
           v.pfad, v.fassung, v.geraet, null, v.created_at, null, null
      from public.fehler_vor_anmeldung v
     where app.ist_plattform()
       and v.created_at > now() - make_interval(days => least(greatest(coalesce(p_tage, 14), 1), 90))
  ) alle
  order by 11 desc
  limit 500
$$;

revoke all on function public.fehlerprotokoll_plattform(integer) from public, anon;
grant execute on function public.fehlerprotokoll_plattform(integer) to authenticated;

-- Nach 90 Tagen weg, wie das übrige Protokoll.
create or replace function app.fehlerprotokoll_aufraeumen() returns integer
  language plpgsql
  security definer
  set search_path = ''
as $$
declare
  n integer;
  m integer;
begin
  delete from public.fehlerprotokoll where created_at < now() - interval '90 days';
  get diagnostics n = row_count;
  delete from public.fehler_vor_anmeldung where created_at < now() - interval '90 days';
  get diagnostics m = row_count;
  return n + m;
end;
$$;

revoke all on function app.fehlerprotokoll_aufraeumen() from public, anon, authenticated;
