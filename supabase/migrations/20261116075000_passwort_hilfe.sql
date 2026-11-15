-- V14 (Durchsicht 15.11.2026): „Passwort vergessen“ mit Benutzername landet als Aufgabe bei der Leitung.

/*
  WAS FEHLTE. Wer sich mit einem Benutzernamen anmeldet, hat kein Postfach
  für einen Link. Die Anmeldemaske sagte „ein neues Passwort vergibt die
  Geschäftsführung oder Administration“ — erfahren hat die es nur durch
  einen Anruf. Jetzt schickt die Maske eine Bitte, und sie steht auf der
  Startseite der Leitung („Zu erledigen“) und in der Benutzerakte, bis dort
  ein neues Startpasswort vergeben oder die Bitte verworfen wird.

  NICHTS VERRATEN. Die Funktion antwortet immer gleich — ob es den Namen
  gibt, ob das Konto deaktiviert ist, ob schon eine Bitte offen ist, ob die
  Drossel greift. Wer Namen durchprobiert, erfährt nichts; nur die Leitung
  des Betriebs, zu dem der Name gehört, sieht eine Bitte.

  OHNE ANMELDUNG AUFRUFBAR — wer sein Passwort vergessen hat, ist ja nicht
  angemeldet. Deshalb eng: nur Kunstadressen von Benutzernamen-Konten (die
  E-Mail-Konten haben ihren Link), nur aktive Konten in einem Betrieb, der
  nicht ruht, je Konto höchstens EINE offene Bitte und nach dem Erledigen
  frühestens nach zehn Minuten eine neue, insgesamt höchstens 200 je Stunde.
  Geschrieben wird nur in die eigene Tabelle; zurück kommt nichts.

  DER PERSONENBEZUG (wer wann um ein Passwort bat, wer es erledigte) steht in
  der Datenauskunft und geht mit der Löschung der Person.
*/

create table if not exists public.passwort_anfragen (
  id                uuid primary key default gen_random_uuid(),
  company_id        text not null references public.companies(id) on delete cascade,
  user_id           uuid not null,
  angefragt_am      timestamptz not null default now(),
  erledigt_am       timestamptz,
  erledigt_wie      text check (erledigt_wie in ('startpasswort', 'verworfen')),
  erledigt_von      uuid,
  erledigt_von_name text,
  check ((erledigt_am is null) = (erledigt_wie is null))
);

create index if not exists passwort_anfragen_offen
  on public.passwort_anfragen (company_id, angefragt_am) where erledigt_am is null;
create unique index if not exists passwort_anfragen_eine_offene
  on public.passwort_anfragen (user_id) where erledigt_am is null;
create index if not exists passwort_anfragen_person
  on public.passwort_anfragen (user_id, angefragt_am desc);

comment on table public.passwort_anfragen is
  'Bitten um ein neues Startpasswort aus der Anmeldemaske (Benutzernamen-Konten, V14) — offen bis zum Vergeben oder Verwerfen.';

alter table public.passwort_anfragen enable row level security;
revoke all on public.passwort_anfragen from anon, authenticated;
grant select on public.passwort_anfragen to authenticated;

drop trigger if exists passwort_anfragen_kein_support_schreiben on public.passwort_anfragen;
create trigger passwort_anfragen_kein_support_schreiben
  before insert or update or delete on public.passwort_anfragen
  for each row execute function app.support_schreibt_nicht();

-- Wer ein Startpasswort vergibt, liest sie — die Spitze des Betriebs.
drop policy if exists passwort_anfragen_lesen on public.passwort_anfragen;
create policy passwort_anfragen_lesen on public.passwort_anfragen
  for select using (
    (company_id = (select app.lesebetrieb()) and (select app.ist_spitze()))
    or company_id = (select app.supportbetrieb()));

create or replace function public.passwort_hilfe_anfragen(p_anmeldung text) returns void
  language plpgsql
  security definer
  set search_path = ''
as $$
declare
  adresse text := lower(btrim(coalesce(p_anmeldung, '')));
  konto public.users;
begin
  -- Nur Benutzernamen-Konten; die Endung ist dieselbe wie in `shared/benutzername.ts`.
  if length(adresse) > 200 or adresse not like '%@benutzer.senklot.invalid' then
    return;
  end if;
  if (select count(*) from public.passwort_anfragen a
       where a.angefragt_am > now() - interval '1 hour') >= 200 then
    return;
  end if;

  select u.* into konto
    from auth.users a join public.users u on u.id = a.id
   where lower(a.email) = adresse;
  if konto.id is null or not konto.active or app.betrieb_ruht(konto.company_id) then
    return;
  end if;
  if exists (select 1 from public.passwort_anfragen a
              where a.user_id = konto.id
                and (a.erledigt_am is null or a.erledigt_am > now() - interval '10 minutes')) then
    return;
  end if;

  insert into public.passwort_anfragen (company_id, user_id) values (konto.company_id, konto.id)
  on conflict do nothing;
end;
$$;

revoke all on function public.passwort_hilfe_anfragen(text) from public;
grant execute on function public.passwort_hilfe_anfragen(text) to anon, authenticated;

-- Die Leitung verwirft eine Bitte, die nichts verlangt (etwa: hat sich wieder erinnert).
create or replace function public.passwort_anfrage_verwerfen(p_id uuid) returns void
  language plpgsql
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
  update public.passwort_anfragen a
     set erledigt_am = now(), erledigt_wie = 'verworfen', erledigt_von = auth.uid(),
         erledigt_von_name = (select u.name from public.users u where u.id = auth.uid())
   where a.id = p_id and a.company_id = mein_betrieb and a.erledigt_am is null;
end;
$$;

revoke all on function public.passwort_anfrage_verwerfen(uuid) from public, anon;
grant execute on function public.passwort_anfrage_verwerfen(uuid) to authenticated;

/*
  ERLEDIGT DURCH EIN NEUES STARTPASSWORT — gerufen von `passwort-vergeben`
  (und vom Notzugang), nachdem das Passwort gesetzt ist. Nur der Dienst.
*/
create or replace function public.passwort_anfragen_erledigt(p_uid uuid, p_von uuid) returns void
  language sql
  security definer
  set search_path = ''
as $$
  update public.passwort_anfragen a
     set erledigt_am = now(), erledigt_wie = 'startpasswort', erledigt_von = p_von,
         erledigt_von_name = (select u.name from public.users u where u.id = p_von)
   where a.user_id = p_uid and a.erledigt_am is null;
$$;

revoke all on function public.passwort_anfragen_erledigt(uuid, uuid) from public, anon, authenticated;
grant execute on function public.passwort_anfragen_erledigt(uuid, uuid) to service_role;

-- Datenauskunft und Löschung — gezielte Ergänzungen wie in 20261116074000.
do $migration$
declare
  quelle text;
  marke text;
  zahl integer;
begin
  quelle := pg_get_functiondef('public.person_auskunft(text,uuid,integer)'::regprocedure);
  if position('passwort_anfragen' in quelle) = 0 then
    marke := $m$      'kontoumstellungen', ($m$;
    zahl := (length(quelle) - length(replace(quelle, marke, ''))) / length(marke);
    if zahl <> 1 then raise exception 'Personenauskunft: Einfügestelle (Daten) % mal gefunden', zahl; end if;
    quelle := replace(quelle, marke, $neu$      -- V14: ihre Bitten um ein neues Passwort, und wer sie erledigt hat.
      'passwort_anfragen', (
        select coalesce(jsonb_agg(jsonb_build_object('angefragt_am', a.angefragt_am, 'erledigt_am', a.erledigt_am,
                                  'erledigt_wie', a.erledigt_wie, 'erledigt_von', a.erledigt_von_name)
                                  order by a.angefragt_am), '[]'::jsonb)
          from public.passwort_anfragen a where a.company_id = betrieb and a.user_id = p_id),
$neu$ || marke);

    marke := $m$      'konten_umgestellt', (select count(*)$m$;
    zahl := (length(quelle) - length(replace(quelle, marke, ''))) / length(marke);
    if zahl <> 1 then raise exception 'Personenauskunft: Einfügestelle (Bearbeiter) % mal gefunden', zahl; end if;
    quelle := replace(quelle, marke, $neu$      'passwort_anfragen_erledigt', (select count(*) from public.passwort_anfragen a
        where a.company_id = betrieb and a.erledigt_von = p_id and a.user_id <> p_id),
$neu$ || marke);
    execute quelle;
  end if;

  quelle := pg_get_functiondef('public.person_loeschen(text,uuid,boolean)'::regprocedure);
  if position('passwort_anfragen' in quelle) = 0 then
    marke := $m$      'geburtsdatum', (select count(*) from public.geburtsdaten g$m$;
    zahl := (length(quelle) - length(replace(quelle, marke, ''))) / length(marke);
    if zahl <> 1 then raise exception 'Personenlöschung: Einfügestelle (Zählung) % mal gefunden', zahl; end if;
    quelle := replace(quelle, marke, ltrim($neu$
      'passwort_anfragen', (select count(*) from public.passwort_anfragen a
                             where a.company_id = betrieb and (a.user_id = p_id or a.erledigt_von = p_id)),
$neu$, E'\n') || marke);

    marke := $m$      delete from public.geburtsdaten g where g.company_id = betrieb and g.user_id = p_id;$m$;
    zahl := (length(quelle) - length(replace(quelle, marke, ''))) / length(marke);
    if zahl <> 1 then raise exception 'Personenlöschung: Einfügestelle (Löschen) % mal gefunden', zahl; end if;
    quelle := replace(quelle, marke, marke || $neu$
      delete from public.passwort_anfragen a where a.company_id = betrieb and a.user_id = p_id;
      update public.passwort_anfragen a set erledigt_von = null, erledigt_von_name = null
       where a.company_id = betrieb and a.erledigt_von = p_id;$neu$);
    execute quelle;
  end if;
end;
$migration$;
