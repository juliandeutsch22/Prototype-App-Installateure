-- Testbericht Runde 6, Abschnitt 8.4 Schritt 5 (27.10.2026): „Abmelden auf
-- allen Geräten … Sitzungen enden sofort?“
--
-- BEFUND. „Abmelden“ beendet beim Anmeldedienst alle Sitzungen des Kontos
-- (supabase-js meldet ohne Angabe `global` ab), ebenso das Zurücksetzen eines
-- zweiten Faktors durch die Plattform. Die Datenbank prüfte aber nur das
-- Token selbst: ein Token, das ein anderes Gerät vor dem Abmelden bekommen
-- hatte, las und schrieb bis zu seinem Ablauf weiter — bis zu einer Stunde
-- (`jwt_expiry`). Wer sein Telefon verliert und sich am Rechner abmeldet,
-- hätte das Telefon eine Stunde lang offen gelassen.
--
-- NACHHER. Jedes Token nennt seine Sitzung (`session_id`). Gibt es sie nicht
-- mehr oder ist ihre Laufzeit vorbei (`not_after`), ist der Aufrufer nicht
-- angemeldet — sofort, an derselben Stelle, an der schon das Deaktivieren
-- greift (`app.aktiv`), und für das Plattformkonto in `app.ist_plattform`.
-- Ein Aufruf mit dem Dienstschlüssel trägt keine Sitzung und bleibt, wie er
-- ist; Tokens stellt nur der Anmeldedienst aus, eine Sitzungskennung lässt
-- sich also nicht weglassen, ohne das Token ungültig zu machen.

create or replace function app.sitzung_lebt() returns boolean
  language sql stable
  security definer
  set search_path = ''
as $$
  select case
    when nullif(auth.jwt() ->> 'session_id', '') is null then true
    else exists (
      select 1 from auth.sessions s
       where s.id = (auth.jwt() ->> 'session_id')::uuid
         and (s.not_after is null or s.not_after > now()))
  end
$$;

revoke all on function app.sitzung_lebt() from public, anon;
grant execute on function app.sitzung_lebt() to authenticated, service_role;

/* Rumpf wie 20261006110000, dazu die Sitzung. */
create or replace function app.aktiv() returns boolean
  language sql stable
  security definer
  set search_path = ''
as $$
  select app.sitzung_lebt() and coalesce(
    (select u.active and not app.betrieb_ruht(u.company_id) and not app.zweiter_faktor_fehlt()
       from public.users u where u.id = auth.uid()),
    case when nullif(auth.jwt() -> 'app_metadata' ->> 'company_id', '') is not null
         then false end,
    (auth.jwt() -> 'app_metadata' ->> 'active')::boolean,
    true)
$$;

revoke all on function app.aktiv() from public;
grant execute on function app.aktiv() to authenticated, anon, service_role;

/* Rumpf wie 20261006110000, dazu die Sitzung. */
create or replace function app.ist_plattform() returns boolean
  language sql stable
  security definer
  set search_path = ''
as $$
  select case
    when coalesce((auth.jwt() -> 'app_metadata' ->> 'plattform_admin')::boolean, false)
      then coalesce(auth.jwt() ->> 'aal', '') = 'aal2'
           and exists (select 1 from public.platform_admins p where p.id = auth.uid())
           and app.sitzung_lebt()
    else false
  end
$$;

revoke all on function app.ist_plattform() from public;
grant execute on function app.ist_plattform() to authenticated, anon, service_role;
