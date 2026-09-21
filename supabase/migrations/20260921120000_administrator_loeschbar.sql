-- EIN ADMINISTRATORKONTO LIESS SICH NICHT LÖSCHEN — VON NIEMANDEM.
--
-- GEFUNDEN BEIM PROBELAUF, an einer Stelle, an der niemand gesucht hätte:
-- der Aufbau des Probebetriebs wollte seine Konten abräumen und bekam vom
-- Anmeldedienst „Database error deleting user". Im Protokoll der Datenbank
-- stand:
--
--   ERROR: Einen Administrator entfernt nur ein Administrator
--
-- WAS WIRKLICH PASSIERT. `auth.users` löschen kaskadiert auf `public.users`;
-- dort feuert `app.adminrolle_geschuetzt()`. Dessen erste Zeile ist der
-- Vorbeiweg für den Dienstschlüssel — `if app.ist_dienst() then return …`.
-- Der greift hier nicht: `app.ist_dienst()` erkennt `service_role`, und der
-- Anmeldedienst ist keine. Also verweigerte der Riegel, und zwar gegen
-- jeden: nicht der Betrieb, nicht der Support, nicht der Dienstschlüssel
-- konnte das Anmeldekonto eines Administrators entfernen.
--
-- FOLGE IM ECHTEN BETRIEB: ein Kunde, der geht, hätte sein Administratorkonto
-- behalten. Eine Löschung nach Art. 17 DSGVO wäre an einem Riegel
-- gescheitert, der eine ganz andere Frage beantworten soll — nämlich ob eine
-- PERSON einer anderen die Administratorrolle nehmen darf.
--
-- WARUM ES KEINE PRÜFUNG GESEHEN HAT: keine hat je ein Konto wieder
-- entfernt. Angelegt wird in jeder, abgeräumt wurde bisher mit `truncate`
-- über die Datenbank — also an genau dem Weg vorbei, auf dem der Fehler
-- liegt. `tests/supabase/ansprueche.test.ts` geht ihn jetzt.


-- ---------------------------------------------------------------------------
-- Wer den Aufruf ausgelöst hat
-- ---------------------------------------------------------------------------

-- EIN EIGENER NAME STATT EINER WEITUNG VON `ist_dienst()`. Man könnte den
-- Anmeldedienst dort mit hineinschreiben — und würde damit JEDEN Riegel
-- öffnen, der den Dienstschlüssel durchlässt, für eine Rolle, die etwas ganz
-- anderes tut. Diese hier räumt Anmeldekonten ab, sonst nichts. Sie bekommt
-- deshalb ihren eigenen Namen und wird an genau EINER Stelle gefragt.
--
-- `session_user` UND NICHT `current_user` — gemessen, nicht vermutet. Der
-- Kaskadenlauf von `auth.users` auf `public.users` läuft mit den Rechten des
-- TABELLENEIGENTÜMERS; `current_user` steht dabei auf `postgres` und sagt
-- über den Anrufer nichts. Wer den Aufruf ausgelöst hat, steht in
-- `session_user`, und dort steht `supabase_auth_admin` — eine Rolle, unter
-- der ausschliesslich der Anmeldedienst verbindet.
create or replace function app.ist_anmeldedienst() returns boolean
  language sql stable
  set search_path = ''
as $$
  select session_user = 'supabase_auth_admin'
$$;

grant execute on function app.ist_anmeldedienst() to authenticated, anon, service_role;

comment on function app.ist_anmeldedienst() is
  'Läuft dieser Aufruf als der Anmeldedienst (GoTrue)? Wahr genau dann, wenn eine Löschung in auth.users auf public.users durchschlägt. Nur dort gefragt.';


-- ---------------------------------------------------------------------------
-- Der eine Riegel, der sie kennt
-- ---------------------------------------------------------------------------

-- Rumpf unverändert bis auf die erste Zeile: wer ein ANMELDEKONTO entfernt,
-- entfernt damit auch die Zeile in der Belegschaft — das ist keine
-- Rollenänderung, sondern das Ende des Kontos. Die Frage „darf diese Person
-- einen Administrator absetzen" stellt sich dabei nicht; es gibt keine Person.
--
-- WAS UNVERÄNDERT GILT: ein Mitarbeiter, der einem Administrator die Rolle
-- nehmen oder seine Zeile löschen will, kommt hier weiterhin nicht durch. Der
-- neue Zweig hängt an der Verbindung des Anmeldedienstes und ist über die
-- REST-Schnittstelle nicht erreichbar.
create or replace function app.adminrolle_geschuetzt() returns trigger
  language plpgsql
  set search_path = ''
as $$
begin
  if app.ist_dienst() or app.ist_anmeldedienst() then
    return case when tg_op = 'DELETE' then old else new end;
  end if;

  if tg_op = 'DELETE' then
    if old.role = 'Administrator' and not app.hat_rolle(array['Administrator']) then
      raise exception 'Einen Administrator entfernt nur ein Administrator'
        using errcode = '42501';
    end if;
    return old;
  end if;

  if (new.role = 'Administrator' or (tg_op = 'UPDATE' and old.role = 'Administrator'))
     and not app.hat_rolle(array['Administrator']) then
    raise exception 'Die Rolle Administrator vergibt und ändert nur ein Administrator'
      using errcode = '42501';
  end if;
  return new;
end;
$$;
