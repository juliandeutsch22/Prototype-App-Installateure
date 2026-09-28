/*
  PERSONEN NUR AUS DEM EIGENEN BETRIEB (offene Punkte C2).

  Die Fremdschlüssel auf `users(id)` prüfen nur, ob es eine Person GIBT —
  nicht, ob sie zu diesem Betrieb gehört. Wer die Kennung eines fremden
  Monteurs kennt, konnte ihn einteilen, einer Baustelle zuordnen oder für
  ihn buchen; die Zeilenregeln sehen nur den Betrieb der ZEILE, nicht den
  der Person darin. In der App gibt es diesen Weg nicht (sie bietet nur die
  eigene Belegschaft an), über die Schnittstelle schon.

  DIE PRÜFUNG SITZT AN DER TABELLE, nicht in den Funktionen: so gilt sie für
  jeden Schreibweg — `einsatz_speichern`, die Rüstliste, die Baustelle, die
  Büro-Buchung, und alles, was später dazukommt.

  BEIM ÄNDERN ZÄHLEN NUR NEUE KENNUNGEN. Eine Baustelle, deren Liste aus der
  Zeit vor dieser Prüfung eine unpassende Kennung trägt, bleibt bearbeitbar;
  hinzufügen lässt sich eine solche Kennung nicht mehr.
*/

/*
  ABGEWIESEN WIRD, WER NACHWEISLICH WOANDERS HINGEHÖRT — eine Kennung, die
  ein Konto eines anderen Betriebs (oder keines Betriebs) ist. Eine Kennung,
  die es gar nicht (mehr) gibt, geht durch: ein gelöschtes Konto bleibt in
  der Liste einer Baustelle stehen, und der Rücklauf einer Sicherung spielt
  Baustellen unter Umständen vor den Konten ein. Beides scheiterte sonst an
  einer Person, die niemandem gehört. Wo es auf die Existenz ankommt
  (`user_id` an Einsatz und Buchung), sichert sie der Fremdschlüssel.

  Sieht alle Konten, auch wo die Zeilenregeln des Aufrufers das nicht täten
  (ein Monteur liest nicht jede Benutzerzeile).
*/
create or replace function app.personen_im_betrieb(p_betrieb text, p_ids uuid[])
  returns boolean
  language sql
  stable
  security definer
  set search_path = ''
as $$
  select not exists (
    select 1
      from public.users u
     where u.id = any (coalesce(p_ids, '{}'::uuid[]))
       and u.company_id is distinct from p_betrieb
  );
$$;

-- Intern (P3-21): nur der Auslöser unten ruft sie, und der läuft mit
-- Eigentümerrechten. Für angemeldete Konten wäre sie eine Auskunft darüber,
-- wer zu welchem Betrieb gehört.
revoke all on function app.personen_im_betrieb(text, uuid[]) from public, anon, authenticated;

create or replace function app.personen_pruefen() returns trigger
  language plpgsql
  security definer
  set search_path = ''
as $$
declare
  neu uuid[];
  alt uuid[] := '{}';
begin
  /*
    EINE ZEILE FÜR EINEN FREMDEN BETRIEB weist die Zeilenregel ab — sie soll
    es auch sein, die antwortet. Prüfte der Auslöser hier, liefe er VOR der
    Regel, und an seiner Meldung liesse sich ablesen, ob eine Kennung zu
    einem fremden Betrieb gehört. Ohne Anmeldekontext (Dienstzugang,
    Rücklauf) gibt es keinen „eigenen" Betrieb: dann wird immer geprüft.
  */
  if app.betrieb() is not null and new.company_id is distinct from app.betrieb() then
    return new;
  end if;

  if tg_table_name in ('assignments', 'time_entries') then
    neu := array[new.user_id];
    if tg_op = 'UPDATE' and old.company_id = new.company_id then alt := array[old.user_id]; end if;
  elsif tg_table_name = 'einsatz_material' then
    neu := new.uids;
    if tg_op = 'UPDATE' and old.company_id = new.company_id then alt := old.uids; end if;
  elsif tg_table_name = 'projects' then
    neu := coalesce(new.assigned_employees, '{}') || coalesce(new.project_managers, '{}');
    if tg_op = 'UPDATE' and old.company_id = new.company_id then
      alt := coalesce(old.assigned_employees, '{}') || coalesce(old.project_managers, '{}');
    end if;
  end if;

  -- Nur, was neu hinzukommt.
  neu := array(select unnest(neu) except select unnest(alt));

  if not app.personen_im_betrieb(new.company_id, neu) then
    raise exception 'Diese Person gehört nicht zu diesem Betrieb.'
      using errcode = '42501', hint = 'Nur Konten des eigenen Betriebs lassen sich eintragen.';
  end if;
  return new;
end;
$$;

revoke all on function app.personen_pruefen() from public, anon, authenticated;

create trigger assignments_personen_im_betrieb
  before insert or update of user_id, company_id on public.assignments
  for each row execute function app.personen_pruefen();

create trigger time_entries_personen_im_betrieb
  before insert or update of user_id, company_id on public.time_entries
  for each row execute function app.personen_pruefen();

create trigger einsatz_material_personen_im_betrieb
  before insert or update of uids, company_id on public.einsatz_material
  for each row execute function app.personen_pruefen();

create trigger projects_personen_im_betrieb
  before insert or update of assigned_employees, project_managers, company_id on public.projects
  for each row execute function app.personen_pruefen();
