-- K7, Teil 1 (Durchsicht 15.11.2026): den zweiten Faktor eines Kollegen im Betrieb zurücksetzen.

/*
  WAS FEHLTE. Zurücksetzen konnte nur der Senklot-Support über den Notzugang
  (`plattform_zweiter_faktor_zuruecksetzen`), und nur für Administration,
  Geschäftsführung und Buchhaltung. Wer als Buchhaltung einen Faktor
  eingerichtet hatte, danach Verwaltung oder Projektleitung wurde und Telefon
  samt Codes verlor, kam nicht mehr hinein — ebenso jeder, der freiwillig
  einen Faktor eingerichtet hatte. Einziger Weg: deaktivieren und „Person
  löschen“, und das nimmt Einsätze, Einstellungen und Nachrichten mit.

  JETZT setzt eine ZWEITE Leitung (Geschäftsführung oder Administration) den
  Faktor eines Kollegen zurück — wie `passwort-vergeben` das Passwort:
    - nur im eigenen Betrieb, nicht den eigenen (der eigene geht über einen
      Wiederherstellungscode oder eine zweite Leitung);
    - einen Administrator nur ein Administrator;
    - mit Pflichtgrund und einer Zeile im Protokoll
      (`zwei_faktor_ruecksetzungen`), das die Spitze in der Benutzerakte
      unter „Verlauf“ liest;
    - Faktor weg, offene Wiederherstellungscodes ungültig, alle Sitzungen
      beendet (und damit nach K2 auch die Push-Anmeldungen).
  Gilt für die Person eine Pflicht, richtet sie beim nächsten Anmelden einen
  neuen Faktor ein.

  DER PERSONENBEZUG des Protokolls steht in der Datenauskunft (bei der
  Person und als Anzahl bei der, die zurückgesetzt hat) und geht mit der
  Löschung der Person; wer zurückgesetzt hat, wird bei dessen Löschung
  unkenntlich, die Zeile über den anderen bleibt.
*/

create table if not exists public.zwei_faktor_ruecksetzungen (
  id         uuid primary key default gen_random_uuid(),
  company_id text not null references public.companies(id) on delete cascade,
  user_id    uuid not null,
  grund      text not null check (btrim(grund) <> ''),
  durch      uuid,
  durch_name text,
  am         timestamptz not null default now()
);

create index if not exists zwei_faktor_ruecksetzungen_person
  on public.zwei_faktor_ruecksetzungen (company_id, user_id, am desc);

comment on table public.zwei_faktor_ruecksetzungen is
  'Wer wann den zweiten Faktor eines Kontos im Betrieb zurückgesetzt hat, mit Grund (K7).';

alter table public.zwei_faktor_ruecksetzungen enable row level security;
revoke all on public.zwei_faktor_ruecksetzungen from anon, authenticated;
grant select on public.zwei_faktor_ruecksetzungen to authenticated;

drop trigger if exists zwei_faktor_ruecksetzungen_kein_support_schreiben on public.zwei_faktor_ruecksetzungen;
create trigger zwei_faktor_ruecksetzungen_kein_support_schreiben
  before insert or update or delete on public.zwei_faktor_ruecksetzungen
  for each row execute function app.support_schreibt_nicht();

-- Wie `konto_umstellungen`: die Spitze des Betriebs liest, der Support beim Einblick auch.
drop policy if exists zwei_faktor_ruecksetzungen_lesen on public.zwei_faktor_ruecksetzungen;
create policy zwei_faktor_ruecksetzungen_lesen on public.zwei_faktor_ruecksetzungen
  for select using (
    (company_id = (select app.lesebetrieb()) and (select app.ist_spitze()))
    or company_id = (select app.supportbetrieb()));

/*
  OB EIN KOLLEGE EINEN FAKTOR HAT — damit die Benutzerakte den Knopf nur
  dort zeigt, wo er etwas tut. Nur für die Spitze, nur im eigenen Betrieb.
*/
create or replace function public.zweiter_faktor_von(p_uid uuid) returns boolean
  language plpgsql
  stable
  security definer
  set search_path = ''
as $$
declare
  mein_betrieb text := app.betrieb();
begin
  if mein_betrieb is null or not app.betriebsmitglied(mein_betrieb)
     or not app.hat_rolle(array['Geschäftsführung', 'Administrator']) then
    raise exception 'Nur Geschäftsführung oder Administration' using errcode = '42501';
  end if;
  if not exists (select 1 from public.users u where u.id = p_uid and u.company_id = mein_betrieb) then
    raise exception 'Diesen Benutzer gibt es im eigenen Betrieb nicht' using errcode = 'P0002';
  end if;
  return app.zweiter_faktor_eingerichtet(p_uid);
end;
$$;

revoke all on function public.zweiter_faktor_von(uuid) from public, anon;
grant execute on function public.zweiter_faktor_von(uuid) to authenticated;

create or replace function public.zweiter_faktor_zuruecksetzen(p_uid uuid, p_grund text) returns void
  language plpgsql
  security definer
  set search_path = ''
as $$
declare
  mein_betrieb text := app.betrieb();
  ziel public.users;
  wer text;
begin
  if mein_betrieb is null or not app.betriebsmitglied(mein_betrieb)
     or not app.hat_rolle(array['Geschäftsführung', 'Administrator']) then
    raise exception 'Den zweiten Faktor setzt die Geschäftsführung oder die Administration zurück'
      using errcode = '42501';
  end if;
  if btrim(coalesce(p_grund, '')) = '' then
    raise exception 'Ohne Grund kein Zurücksetzen — er steht im Protokoll' using errcode = '22023';
  end if;
  if p_uid = auth.uid() then
    raise exception 'Den eigenen zweiten Faktor setzt eine zweite Leitung zurück — oder ein Wiederherstellungscode'
      using errcode = '22023';
  end if;

  -- Fremder Betrieb und unbekannte Kennung sagen dasselbe.
  select * into ziel from public.users u where u.id = p_uid and u.company_id = mein_betrieb;
  if ziel.id is null then
    raise exception 'Diesen Benutzer gibt es im eigenen Betrieb nicht' using errcode = 'P0002';
  end if;
  if ziel.role = 'Administrator' and app.rolle() is distinct from 'Administrator' then
    raise exception 'Den zweiten Faktor eines Administrators setzt nur ein Administrator zurück'
      using errcode = '42501';
  end if;
  if not app.zweiter_faktor_eingerichtet(p_uid) then
    raise exception 'Für dieses Konto ist kein zweiter Faktor eingerichtet' using errcode = '22023';
  end if;

  delete from auth.mfa_factors f where f.user_id = p_uid;
  update public.zwei_faktor_codes set ungueltig_am = now()
   where user_id = p_uid and ungueltig_am is null and verbraucht_am is null;
  perform app.sitzungen_beenden(p_uid);

  select u.name into wer from public.users u where u.id = auth.uid();
  insert into public.zwei_faktor_ruecksetzungen (company_id, user_id, grund, durch, durch_name)
  values (mein_betrieb, p_uid, btrim(p_grund), auth.uid(), wer);
end;
$$;

revoke all on function public.zweiter_faktor_zuruecksetzen(uuid, text) from public, anon;
grant execute on function public.zweiter_faktor_zuruecksetzen(uuid, text) to authenticated;

/*
  IM VERLAUF DER BENUTZERAKTE, neben „Konto umgestellt“. Die Sicht wird aus
  ihrer eigenen, aktuellen Fassung neu gebaut — sie besteht aus mehreren
  Quellen, und eine hier abgeschriebene Fassung verlöre still die Quelle,
  die eine spätere Migration ergänzt hat.
*/
do $migration$
declare
  bisher text := rtrim(btrim(pg_get_viewdef('public.objekt_verlauf'::regclass, true)), ';');
begin
  if position('zweiter_faktor_zurueckgesetzt' in bisher) = 0 then
    execute 'create or replace view public.objekt_verlauf with (security_invoker = true) as '
      || bisher || $teil$
UNION ALL
 SELECT 'zweiter_faktor'::text AS quelle,
    z.id::text AS id,
    z.company_id,
    'benutzer'::text AS objektart,
    z.user_id AS objekt_id,
    NULL::uuid AS bezug_id,
    'zweiter_faktor_zurueckgesetzt'::text AS art,
    jsonb_build_object('grund', z.grund) AS aenderungen,
    NULL::text AS bezeichnung,
    z.durch_name AS von_name,
    z.am
   FROM public.zwei_faktor_ruecksetzungen z$teil$;
  end if;
end;
$migration$;

/*
  DATENAUSKUNFT UND LÖSCHUNG — gezielte Ergänzungen der bestehenden
  Funktionen, wiederholbar; ein unerwarteter Ausgangsstand bricht ab statt
  still zu kürzen.
*/
do $migration$
declare
  quelle text;
  marke text;
  zahl integer;
begin
  quelle := pg_get_functiondef('public.person_auskunft(text,uuid,integer)'::regprocedure);
  if position('zweiter_faktor_ruecksetzungen' in quelle) = 0 then
    marke := $m$      'kontoumstellungen', ($m$;
    zahl := (length(quelle) - length(replace(quelle, marke, ''))) / length(marke);
    if zahl <> 1 then raise exception 'Personenauskunft: Einfügestelle (Daten) % mal gefunden', zahl; end if;
    quelle := replace(quelle, marke, $neu$      -- K7: wann und warum ihr zweiter Faktor zurückgesetzt wurde, und von wem.
      'zweiter_faktor_ruecksetzungen', (
        select coalesce(jsonb_agg(jsonb_build_object('am', z.am, 'grund', z.grund, 'von', z.durch_name)
                                  order by z.am), '[]'::jsonb)
          from public.zwei_faktor_ruecksetzungen z where z.company_id = betrieb and z.user_id = p_id),
$neu$ || marke);

    marke := $m$      'konten_umgestellt', (select count(*)$m$;
    zahl := (length(quelle) - length(replace(quelle, marke, ''))) / length(marke);
    if zahl <> 1 then raise exception 'Personenauskunft: Einfügestelle (Bearbeiter) % mal gefunden', zahl; end if;
    quelle := replace(quelle, marke, $neu$      'zweite_faktoren_zurueckgesetzt', (select count(*) from public.zwei_faktor_ruecksetzungen z
        where z.company_id = betrieb and z.durch = p_id and z.user_id <> p_id),
$neu$ || marke);
    execute quelle;
  end if;

  quelle := pg_get_functiondef('public.person_loeschen(text,uuid,boolean)'::regprocedure);
  if position('zwei_faktor_ruecksetzungen' in quelle) = 0 then
    marke := $m$      'geburtsdatum', (select count(*) from public.geburtsdaten g$m$;
    zahl := (length(quelle) - length(replace(quelle, marke, ''))) / length(marke);
    if zahl <> 1 then raise exception 'Personenlöschung: Einfügestelle (Zählung) % mal gefunden', zahl; end if;
    quelle := replace(quelle, marke, ltrim($neu$
      'zwei_faktor_ruecksetzungen', (select count(*) from public.zwei_faktor_ruecksetzungen z
                                      where z.company_id = betrieb and (z.user_id = p_id or z.durch = p_id)),
$neu$, E'\n') || marke);

    marke := $m$      delete from public.geburtsdaten g where g.company_id = betrieb and g.user_id = p_id;$m$;
    zahl := (length(quelle) - length(replace(quelle, marke, ''))) / length(marke);
    if zahl <> 1 then raise exception 'Personenlöschung: Einfügestelle (Löschen) % mal gefunden', zahl; end if;
    quelle := replace(quelle, marke, marke || $neu$
      delete from public.zwei_faktor_ruecksetzungen z where z.company_id = betrieb and z.user_id = p_id;
      update public.zwei_faktor_ruecksetzungen z set durch = null, durch_name = null
       where z.company_id = betrieb and z.durch = p_id;$neu$);
    execute quelle;
  end if;
end;
$migration$;
