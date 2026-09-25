-- WAS AN EINEM KONTO GEÄNDERT WIRD, GILT SOFORT — NICHT ERST BEIM NÄCHSTEN TOKEN.
--
-- Aus dem Prüflauf vom 25.09.2026. `20260912230000_sofort_gesperrt.sql` hat
-- das Fenster für das DEAKTIVIEREN geschlossen: `app.aktiv()` fragt die
-- Belegschaft statt das Token. Drei Fenster derselben Bauart standen noch
-- offen:
--
--   P3-07  Eine geänderte ROLLE griff erst mit dem nächsten Token, also bis
--          zu einer Stunde später. Eine Geschäftsführerin, die zur
--          Mitarbeiterin wurde, änderte so lange weiter Bankdaten und
--          Stundensätze. `app.rolle()` fragt jetzt die Belegschaft wie
--          `app.aktiv()`, und die Sitzungen der Person werden beendet — sie
--          meldet sich neu an und sieht die Oberfläche ihrer neuen Rolle.
--   P3-08  `app.ist_plattform()` las nur das Token. Wer aus
--          `platform_admins` entfernt wurde, blieb bis zu einer Stunde
--          Plattformkonto, und seine Sitzungen liefen weiter. Jetzt braucht
--          es beides, Anspruch UND Zeile, und das Entfernen beendet die
--          Sitzungen.
--   P3-20  Wurde eine Zeile der Belegschaft GELÖSCHT, behielt das
--          Anmeldekonto Betrieb, Rolle und `active: true` im Token — und
--          `app.aktiv()` fiel ohne Zeile auf genau dieses Token zurück. Jetzt
--          werden die Ansprüche entfernt und das Konto gesperrt, wie beim
--          Deaktivieren; und ein Token, das einen Betrieb nennt, zu dem es
--          keine Zeile mehr gibt, gilt nicht mehr als aktiv.
--
-- Und nebenbei (P3-21): die Hilfsfunktionen, die in `auth` schreiben oder
-- den Dienstschlüssel anfassen, sind für angemeldete Konten nicht mehr
-- ausführbar. Das Schema `app` steht nicht auf der Schnittstelle — aber
-- „nicht erreichbar" ist eine Eigenschaft der Konfiguration, und das
-- Ausführungsrecht ist die Grenze, die auch dann noch gilt, wenn die sich
-- einmal ändert. Die Trigger, die sie brauchen, laufen dafür mit den
-- Rechten ihres Eigentümers.

-- ---------------------------------------------------------------------------
-- 1. Rolle und Aktivität aus der Belegschaft
-- ---------------------------------------------------------------------------

/*
  WIE `app.aktiv()` SEIT DEM 12.09.: die Zeile zuerst, das Token nur, wo es
  keine gibt (Plattformkonto). SECURITY DEFINER aus demselben Grund wie dort
  — die Leseregel der Belegschaft fragt selbst `app.darf`.
*/
create or replace function app.rolle() returns text
  language sql stable
  security definer
  set search_path = ''
as $$
  select coalesce(
    (select u.role from public.users u where u.id = auth.uid()),
    nullif(auth.jwt() -> 'app_metadata' ->> 'role', ''))
$$;

revoke all on function app.rolle() from public;
grant execute on function app.rolle() to authenticated, anon, service_role;

/*
  Neu ist die zweite Zeile: ein Token, das einen BETRIEB nennt, zu dem es
  keine Zeile (mehr) gibt, ist nicht aktiv. Ansprüche mit Betrieb entstehen
  nur aus der Belegschaft (`app.ansprueche_aus_belegschaft`); fehlt die
  Zeile, wurde sie gelöscht. Ein Plattformkonto trägt keinen Betrieb und
  bleibt, wie es war.
*/
create or replace function app.aktiv() returns boolean
  language sql stable
  security definer
  set search_path = ''
as $$
  select coalesce(
    (select u.active from public.users u where u.id = auth.uid()),
    case when nullif(auth.jwt() -> 'app_metadata' ->> 'company_id', '') is not null
         then false end,
    (auth.jwt() -> 'app_metadata' ->> 'active')::boolean,
    true)
$$;

revoke all on function app.aktiv() from public;
grant execute on function app.aktiv() to authenticated, anon, service_role;

-- ---------------------------------------------------------------------------
-- 2. Plattformkonto: Anspruch UND Zeile
-- ---------------------------------------------------------------------------

/*
  Das `case` fragt die Tabelle nur, wenn das Token es überhaupt behauptet:
  diese Funktion steht in jedem Riegel vor jeder Tabelle, und für jedes
  gewöhnliche Konto ist die Antwort schon am Token ablesbar.
*/
create or replace function app.ist_plattform() returns boolean
  language sql stable
  security definer
  set search_path = ''
as $$
  select case
    when coalesce((auth.jwt() -> 'app_metadata' ->> 'plattform_admin')::boolean, false)
      then exists (select 1 from public.platform_admins p where p.id = auth.uid())
    else false
  end
$$;

revoke all on function app.ist_plattform() from public;
grant execute on function app.ist_plattform() to authenticated, anon, service_role;

-- ---------------------------------------------------------------------------
-- 3. Sitzungen beenden — ohne zu sperren
-- ---------------------------------------------------------------------------

/*
  Der zweite Riegel aus `app.konto_sperren`, einzeln: die Sitzungen und
  Erneuerungstoken weg, das Konto selbst bleibt offen. Das laufende
  Zugangstoken gilt noch bis zu seinem Ablauf — mit den ALTEN Ansprüchen,
  aber die Regeln fragen Rolle und Aktivität jetzt in der Belegschaft.
  Erneuern lässt es sich nicht mehr; die App meldet ab, und die nächste
  Anmeldung bringt die neue Rolle auch in die Oberfläche.
*/
create or replace function app.sitzungen_beenden(p_uid uuid) returns void
  language plpgsql
  security definer
  set search_path = ''
as $$
begin
  delete from auth.sessions where user_id = p_uid;
  delete from auth.refresh_tokens where user_id = p_uid::text;
end;
$$;

-- ---------------------------------------------------------------------------
-- 4. Die Belegschaft
-- ---------------------------------------------------------------------------

/*
  Rumpf wie in `20260912220000_ansprueche.sql`, dazu die Rollenänderung.
  Jetzt mit den Rechten des Eigentümers: die beiden Funktionen, die in
  `auth` schreiben, sind für angemeldete Konten nicht mehr ausführbar (5.).
*/
create or replace function app.ansprueche_aus_belegschaft() returns trigger
  language plpgsql
  security definer
  set search_path = ''
as $$
begin
  perform app.ansprueche_setzen(
    new.id,
    jsonb_build_object('company_id', new.company_id, 'role', new.role,
                       'active', new.active));
  perform app.konto_sperren(new.id, new.active);
  if tg_op = 'UPDATE' and new.active and new.role is distinct from old.role then
    perform app.sitzungen_beenden(new.id);
  end if;
  return null;
end;
$$;

/*
  DIE ZEILE IST WEG — DANN AUCH DER ZUGANG.

  Bisher geschah beim Löschen nichts, mit der Begründung, die Zeile
  verschwinde nur mit dem Anmeldekonto selbst. Das stimmt für den Weg über
  den Anmeldedienst; `users_loeschen` lässt aber die Spitze die Zeile allein
  löschen, und dann blieb ein Konto mit Betrieb und Rolle im Token zurück.

  Löscht der Anmeldedienst das Konto, gibt es nichts mehr zu entziehen — die
  Kaskade räumt alles ab. Dieser Weg bleibt deshalb aussen vor.
*/
create or replace function app.ansprueche_entziehen() returns trigger
  language plpgsql
  security definer
  set search_path = ''
as $$
begin
  if app.ist_anmeldedienst() then
    return old;
  end if;
  perform app.ansprueche_setzen(old.id, '{}'::jsonb, array['company_id', 'role', 'active']);
  perform app.konto_sperren(old.id, false);
  return old;
end;
$$;

drop trigger if exists users_ansprueche_weg on public.users;
create trigger users_ansprueche_weg
  after delete on public.users
  for each row execute function app.ansprueche_entziehen();

/*
  Rumpf wie in `20260912220000_ansprueche.sql`, dazu zwei Zeilen:
  - beim Entfernen enden die Sitzungen (P3-08);
  - beim Ernennen wird eine Sperre aufgehoben — sie kann nur vom Löschen
    einer früheren Belegschaftszeile stammen (siehe oben), und eine
    Ernennung ist genau die Entscheidung, das Konto wieder zu benutzen.
*/
create or replace function app.plattform_anspruch() returns trigger
  language plpgsql
  security definer
  set search_path = ''
as $$
begin
  if tg_op = 'DELETE' then
    perform app.ansprueche_setzen(old.id, '{}'::jsonb, array['plattform_admin']);
    perform app.konto_sperren(old.id, true);
    perform app.sitzungen_beenden(old.id);
    return old;
  end if;

  if exists (select 1 from public.users u where u.id = new.id) then
    raise exception
      'Diese Kennung gehört bereits zu einem Betrieb — ein Plattformkonto braucht ein eigenes'
      using errcode = '23505';
  end if;

  perform app.ansprueche_setzen(
    new.id,
    jsonb_build_object('plattform_admin', true),
    array['company_id', 'role', 'active']);
  if tg_op = 'INSERT' then
    perform app.konto_sperren(new.id, true);
  end if;
  return new;
end;
$$;

-- ---------------------------------------------------------------------------
-- 5. Was angemeldete Konten nicht ausführen (P3-21)
-- ---------------------------------------------------------------------------

/*
  NUR, WAS NACHWEISLICH NIE AUS EINER REGEL ODER EINEM TRIGGER MIT DEN
  RECHTEN DES AUFRUFERS HERAUS GERUFEN WIRD:

    ansprueche_setzen, konto_sperren,  aus den Triggern der Belegschaft und
    sitzungen_beenden                  der Plattformkonten — die laufen seit
                                       hier mit Eigentümerrechten
    ausleitung_anstossen,              aus dem Zeitplan (pg_cron, Eigentümer)
    ausleitung_nachsehen
    push_anstossen                     aus den Push-Triggern, die selbst mit
                                       Eigentümerrechten laufen
    anstoss_kopfzeilen                 nur aus den drei oben

  Die Regelhelfer (`app.darf`, `app.ist_fuehrung`, …) bleiben ausführbar:
  sie laufen in jeder Richtlinie mit den Rechten des Fragenden.
  `app.push_nachsehen` und `app.fehlerprotokoll_aufraeumen` waren es schon.
*/
revoke all on function app.ansprueche_setzen(uuid, jsonb, text[]) from public, anon, authenticated;
revoke all on function app.konto_sperren(uuid, boolean) from public, anon, authenticated;
revoke all on function app.sitzungen_beenden(uuid) from public, anon, authenticated;
revoke all on function app.ausleitung_anstossen() from public, anon, authenticated;
revoke all on function app.ausleitung_nachsehen() from public, anon, authenticated;
revoke all on function app.push_anstossen(jsonb) from public, anon, authenticated;
revoke all on function app.anstoss_kopfzeilen(text) from public, anon, authenticated;
