-- ===========================================================================
-- MONATSABSCHLUSS DER ZEITEN (Durchsicht 15.11.2026, Z6 + F3; Entscheidung E1)
-- ===========================================================================
--
-- NACHGESTELLT: Der Monteur ändert und löscht eigene Buchungen beliebig
-- alter Monate, auch nach dem Lohnexport (Zeilenschutz: eigene Zeile genügt,
-- keine Zeitgrenze; 20261009200000_zeilenschutz_einmal_je_abfrage.sql).
-- Oktober exportiert und ausbezahlt, im Dezember aus 8 Std 10 Std gemacht:
-- Gesamtsaldo und ein neuer Export ändern sich, niemand merkt es.
--
-- E1: als Einstellung je Betrieb, aus = wie heute.
--
--   1. `companies.zeit_monatsabschluss` (ab Werk aus).
--   2. `zeit_monatsabschluesse`: je Monat abschließen und mit Grund wieder
--      öffnen — als Verlauf, der jüngste Eintrag gilt. Wer und wann steht
--      dabei; das ist Teil der Arbeitszeitaufzeichnung des Betriebs.
--   3. Ist ein Monat abgeschlossen (und die Einstellung an), lässt sich in
--      ihm keine Buchung anlegen, ändern oder löschen — von niemandem, auch
--      nicht vom Büro und nicht über Urlaub, Krankmeldung oder Timer. Was
--      noch zu ändern ist, geht über den Korrekturantrag, den es schon gibt:
--      `zeit_korrektur_entscheiden` darf weiter umsetzen; oder das Büro
--      öffnet den Monat mit Grund wieder. Der Rücklauf (Dienstschlüssel)
--      bleibt ausgenommen.
--   4. Eine Arbeitszeit „ab“ einem Tag in einem abgeschlossenen Monat würde
--      dessen Soll ändern — abgewiesen.
--
-- Fehlercode 23514 (wie Eintritt/Austritt): eine endgültige Ablehnung, die
-- das Ausgangsfach eines Geräts als solche erkennt.
-- ===========================================================================

alter table public.companies
  add column if not exists zeit_monatsabschluss boolean not null default false;

comment on column public.companies.zeit_monatsabschluss is
  'Monatsabschluss der Zeiten (Z6, E1): an = abgeschlossene Monate sind gesperrt, Änderungen nur über Korrekturantrag.';

create table if not exists public.zeit_monatsabschluesse (
  id         uuid primary key default gen_random_uuid(),
  company_id text not null references public.companies (id),
  monat      date not null check (monat = date_trunc('month', monat)::date),
  aktion     text not null check (aktion in ('abgeschlossen', 'geoeffnet')),
  grund      text check (grund is null or char_length(btrim(grund)) between 3 and 500),
  von_uid    uuid references public.users (id) on delete set null,
  von_name   text,
  am         timestamptz not null default now(),
  check (aktion <> 'geoeffnet' or grund is not null)
);

create index if not exists zeit_monatsabschluesse_monat on public.zeit_monatsabschluesse (company_id, monat, am desc);

alter table public.zeit_monatsabschluesse enable row level security;
revoke all on public.zeit_monatsabschluesse from anon, authenticated;
grant select on public.zeit_monatsabschluesse to authenticated;

-- Jeder im Betrieb sieht, ob ein Monat abgeschlossen ist — der Monteur, weil
-- seine Zeilen dann gesperrt sind. Geschrieben wird nur über die Funktionen.
drop policy if exists zeit_monatsabschluesse_lesen on public.zeit_monatsabschluesse;
create policy zeit_monatsabschluesse_lesen on public.zeit_monatsabschluesse
  for select to authenticated
  using (company_id = (select app.lesebetrieb()) or company_id = (select app.supportbetrieb()));

/* Ist der Monat dieses Tages im Betrieb abgeschlossen? Aus = nie. */
create or replace function app.monat_abgeschlossen(p_betrieb text, p_tag date) returns boolean
  language sql
  stable
  security definer
  set search_path = ''
as $$
  select coalesce((select c.zeit_monatsabschluss from public.companies c where c.id = p_betrieb), false)
     and coalesce((
       select m.aktion = 'abgeschlossen'
         from public.zeit_monatsabschluesse m
        where m.company_id = p_betrieb and m.monat = date_trunc('month', p_tag)::date
        order by m.am desc, m.id desc
        limit 1), false)
$$;

revoke all on function app.monat_abgeschlossen(text, date) from public, anon, authenticated;

create or replace function app.monat_abgeschlossen_sperre() returns trigger
  language plpgsql
  security definer
  set search_path = ''
as $$
declare
  tag date;
begin
  if app.ist_dienst() or coalesce(current_setting('app.monatsabschluss_korrektur', true), '') = 'an' then
    return coalesce(new, old);
  end if;
  foreach tag in array array[
    case when tg_op in ('UPDATE', 'DELETE') then old.date end,
    case when tg_op in ('INSERT', 'UPDATE') then new.date end] loop
    if tag is not null and app.monat_abgeschlossen(coalesce(new.company_id, old.company_id), tag) then
      raise exception 'Der Monat % ist abgeschlossen — Änderungen nur über einen Korrekturantrag', to_char(tag, 'MM/YYYY')
        using errcode = '23514';
    end if;
  end loop;
  return coalesce(new, old);
end;
$$;

revoke all on function app.monat_abgeschlossen_sperre() from public, anon, authenticated;

-- Der Name sortiert vor die übrigen Wächter: der Grund „abgeschlossen“ kommt zuerst.
drop trigger if exists time_entries_abgeschlossen on public.time_entries;
create trigger time_entries_abgeschlossen
  before insert or update or delete on public.time_entries
  for each row execute function app.monat_abgeschlossen_sperre();

/* Abschließen: Buchhaltung, Geschäftsführung, Administration; nur vergangene Monate. */
create or replace function public.zeit_monat_abschliessen(p_monat date) returns void
  language plpgsql
  security definer
  set search_path = ''
as $$
declare
  betrieb text := app.betrieb();
  monat date := date_trunc('month', p_monat)::date;
  heute date := (now() at time zone 'Europe/Vienna')::date;
begin
  if betrieb is null or auth.uid() is null or not app.angemeldet() or not app.betriebsmitglied(betrieb) then
    raise exception 'Keine Anmeldung' using errcode = '42501';
  end if;
  if not app.hat_rolle(array['Buchhaltung', 'Geschäftsführung', 'Administrator']) then
    raise exception 'Einen Monat schließen Buchhaltung, Geschäftsführung oder Administration ab' using errcode = '42501';
  end if;
  if not coalesce((select c.zeit_monatsabschluss from public.companies c where c.id = betrieb), false) then
    raise exception 'Der Monatsabschluss ist in den Einstellungen des Betriebs ausgeschaltet' using errcode = '22023';
  end if;
  if monat is null or monat >= date_trunc('month', heute)::date then
    raise exception 'Abschließen lässt sich erst ein vergangener Monat' using errcode = '22023';
  end if;
  if app.monat_abgeschlossen(betrieb, monat) then
    return;
  end if;
  insert into public.zeit_monatsabschluesse (company_id, monat, aktion, von_uid, von_name)
  values (betrieb, monat, 'abgeschlossen', auth.uid(), (select u.name from public.users u where u.id = auth.uid()));
end;
$$;

revoke all on function public.zeit_monat_abschliessen(date) from public, anon;
grant execute on function public.zeit_monat_abschliessen(date) to authenticated;

/* Wieder öffnen — nur mit Grund; der Grund bleibt im Verlauf stehen. */
create or replace function public.zeit_monat_oeffnen(p_monat date, p_grund text) returns void
  language plpgsql
  security definer
  set search_path = ''
as $$
declare
  betrieb text := app.betrieb();
  monat date := date_trunc('month', p_monat)::date;
  grund text := btrim(coalesce(p_grund, ''));
begin
  if betrieb is null or auth.uid() is null or not app.angemeldet() or not app.betriebsmitglied(betrieb) then
    raise exception 'Keine Anmeldung' using errcode = '42501';
  end if;
  if not app.hat_rolle(array['Buchhaltung', 'Geschäftsführung', 'Administrator']) then
    raise exception 'Einen Monat öffnen Buchhaltung, Geschäftsführung oder Administration' using errcode = '42501';
  end if;
  if char_length(grund) < 3 then
    raise exception 'Bitte einen Grund angeben' using errcode = '22023';
  end if;
  if not app.monat_abgeschlossen(betrieb, monat) then
    return;
  end if;
  insert into public.zeit_monatsabschluesse (company_id, monat, aktion, grund, von_uid, von_name)
  values (betrieb, monat, 'geoeffnet', left(grund, 500), auth.uid(), (select u.name from public.users u where u.id = auth.uid()));
end;
$$;

revoke all on function public.zeit_monat_oeffnen(date, text) from public, anon;
grant execute on function public.zeit_monat_oeffnen(date, text) to authenticated;

/*
  DER KORREKTURANTRAG BLEIBT DER WEG IN EINEN ABGESCHLOSSENEN MONAT: die
  Entscheidung des Büros setzt um, auch dort. Eingefügt wird nur der Merker
  vor dem Umsetzen; der übrige Text bleibt, wie er ist.
*/
do $migration$
declare
  quelle text := pg_get_functiondef('public.zeit_korrektur_entscheiden(uuid,text,text,jsonb,timestamptz)'::regprocedure);
  stelle constant text := '     -- Keine Freigabe von Rechnung, Antrag oder Identität durch JSON.';
begin
  if position(stelle in quelle) = 0 then
    raise exception 'Erwartete Stelle in zeit_korrektur_entscheiden nicht gefunden';
  end if;
  execute replace(quelle, stelle,
    E'     -- Monatsabschluss (Z6): der Korrekturantrag ist der Weg in einen abgeschlossenen Monat.\n'
    || E'     perform set_config(''app.monatsabschluss_korrektur'', ''an'', true);\n' || stelle);
end;
$migration$;

/*
  ARBEITSZEIT „AB“ EINEM TAG IN EINEM ABGESCHLOSSENEN MONAT änderte dessen
  Soll. Abgewiesen — erst den Monat mit Grund öffnen. Der Auslöser sitzt an
  der Zeile, damit jeder Weg (Funktion, Rücklauf ausgenommen) ihn sieht.
*/
create or replace function app.arbeitszeit_abschluss_pruefen() returns trigger
  language plpgsql
  security definer
  set search_path = ''
as $$
declare
  frueheste date;
  -- Ein leerer Verlauf steht für den Eintrag „ab Saldo-Start mit den Werten der Zeile“.
  vorher jsonb := case when jsonb_array_length(old.arbeitszeit_verlauf) > 0 then old.arbeitszeit_verlauf
                       when app.arbeitszeit_basis(old, '9999-12-31'::date) is null then '[]'::jsonb
                       else jsonb_build_array(app.arbeitszeit_basis(old, '9999-12-31'::date)) end;
begin
  if app.ist_dienst() or new.arbeitszeit_verlauf is not distinct from old.arbeitszeit_verlauf then
    return new;
  end if;
  -- Der früheste Tag, ab dem sich etwas ändert: ein neuer, entfernter oder geänderter Eintrag.
  select min(x.ab) into frueheste
    from (
      (select (v ->> 'ab')::date as ab, v - 'am' - 'von' as inhalt from jsonb_array_elements(new.arbeitszeit_verlauf) v
       except
       select (v ->> 'ab')::date, v - 'am' - 'von' from jsonb_array_elements(vorher) v)
      union
      (select (v ->> 'ab')::date, v - 'am' - 'von' from jsonb_array_elements(vorher) v
       except
       select (v ->> 'ab')::date, v - 'am' - 'von' from jsonb_array_elements(new.arbeitszeit_verlauf) v)
    ) x;
  if frueheste is null then
    return new;
  end if;
  -- Ein Eintrag „von Anfang an“ gilt auch für die Zeit davor: dann zählt jeder abgeschlossene Monat.
  if exists (
    select 1 from public.zeit_monatsabschluesse m
     where m.company_id = new.company_id
       and m.monat >= case when frueheste <= coalesce((vorher -> 0 ->> 'ab')::date, frueheste)
                           then '0001-01-01'::date else date_trunc('month', frueheste)::date end
       and app.monat_abgeschlossen(new.company_id, m.monat)) then
    raise exception 'Die Arbeitszeit ab % träfe einen abgeschlossenen Monat — zuerst den Monat mit Grund öffnen', to_char(frueheste, 'DD.MM.YYYY')
      using errcode = '23514';
  end if;
  return new;
end;
$$;

revoke all on function app.arbeitszeit_abschluss_pruefen() from public, anon, authenticated;

-- Nach `users_arbeitszeit_verlauf` (Namensfolge): erst ist verworfen, was die App mitschickte.
drop trigger if exists users_arbeitszeit_zz_abschluss on public.users;
create trigger users_arbeitszeit_zz_abschluss
  before update on public.users
  for each row execute function app.arbeitszeit_abschluss_pruefen();

/*
  DATENAUSKUNFT UND LÖSCHUNG. Die Zeilen nennen, wer einen Monat
  abgeschlossen oder geöffnet hat (Kennung, Name, Grund): die Auskunft
  einer Person gibt ihre eigenen Einträge aus; die Löschung lässt den Stand
  des Monats stehen (er gehört dem Betrieb und seinen Aufzeichnungen) und
  nimmt Kennung und Namen heraus — wie bei den Nachrichten.
*/
do $migration$
declare
  quelle text;
  marke text;
begin
  quelle := pg_get_functiondef('public.person_auskunft(text,uuid,integer)'::regprocedure);
  marke := $m$'zeit_sitzungen',(select coalesce(jsonb_agg(to_jsonb(s) order by s.aktualisiert_am),'[]'::jsonb) from public.zeitsitzungen s where s.company_id=betrieb and s.user_id=p_id),$m$;
  if position('zeit_monatsabschluesse' in quelle) = 0 then
    if position(marke in quelle) = 0 then
      raise exception 'Personenauskunft: Einfügestelle Zeitsitzungen fehlt';
    end if;
    execute replace(quelle, marke, marke || $m$
      'zeit_monatsabschluesse',(select coalesce(jsonb_agg(jsonb_build_object('monat',m.monat,'aktion',m.aktion,'grund',m.grund,'am',m.am) order by m.am),'[]'::jsonb) from public.zeit_monatsabschluesse m where m.company_id=betrieb and m.von_uid=p_id),$m$);
  end if;

  quelle := pg_get_functiondef('public.person_loeschen(text,uuid,boolean)'::regprocedure);
  marke := $m$delete from public.geburtsdaten g where g.company_id = betrieb and g.user_id = p_id;$m$;
  if position('zeit_monatsabschluesse' in quelle) = 0 then
    if position(marke in quelle) = 0 then
      raise exception 'Personenlöschung: Einfügestelle Geburtsdaten fehlt';
    end if;
    execute replace(quelle, marke, marke || $m$
      -- Z6: der Stand des Monats bleibt, wer ihn gesetzt hat, nicht.
      update public.zeit_monatsabschluesse m set von_uid = null, von_name = 'Gelöschtes Konto'
       where m.company_id = betrieb and m.von_uid = p_id;$m$);
  end if;
end;
$migration$;
