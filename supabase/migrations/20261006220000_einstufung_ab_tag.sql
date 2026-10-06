-- ===========================================================================
-- UMSTUFUNG GILT AB IHREM TAG (Testbericht Runde 3, M13)
-- ===========================================================================
--
-- Die Benutzerakte sagte, die Einstufung gelte „für neue und für noch nicht
-- verrechnete Stunden“; das Handbuch, „jede Buchung behält den Satz ihres
-- Tages“. Beides stimmte nur halb: `users_satz_nachziehen` setzte bei jeder
-- Umstufung alle offenen Buchungen auf die NEUE Stufe — ein Lehrling, der
-- nach der Lehrabschlussprüfung Facharbeiter wird, hätte seine noch nicht
-- verrechneten Lehrlingsstunden plötzlich zum Facharbeitersatz auf der
-- Rechnung gehabt.
--
-- DIE REGEL: Jede Buchung zählt zum Satz ihres Tages. Eine Umstufung gilt ab
-- dem Tag, an dem sie eingetragen wird; Buchungen davor behalten die alte
-- Stufe, ob verrechnet oder nicht. Dafür merkt sich die Person ihre früheren
-- Stufen (`einstufung_verlauf`), jede mit dem Tag, bis zu dem sie galt.
--
-- AUSGENOMMEN ist die ERSTE Einstufung einer Person, die bisher keine hatte:
-- vorher gab es keine Stufe, die gelten könnte, und die offenen Buchungen
-- ziehen wie bisher nach. Ebenso eine Berichtigung von Lehrbeginn oder
-- Lehrzeit — das Lehrjahr ergibt sich ohnehin aus dem Tag der Buchung, ein
-- falscher Lehrbeginn war nie richtig.
--
-- Der Verlauf steht an der Person und geht mit ihrer Zeile in die
-- Datenauskunft (`person_auskunft` gibt die ganze Zeile aus). Bei der
-- Löschung bleibt er wie Einstufung und Lehrbeginn: er gehört zu den
-- Arbeitszeitaufzeichnungen, deren Satz er erklärt.

alter table public.users
  add column if not exists einstufung_verlauf jsonb not null default '[]'::jsonb;

comment on column public.users.einstufung_verlauf is
  'Frühere Einstufungen: [{einstufung, lehrbeginn, lehrzeit_monate, bis}], „bis“ ausschliesslich. Schreibt nur der Auslöser users_einstufung_verlauf (Runde 3, M13).';

/*
  Der Satz einer Stufe an einem Tag — ausgelagert, damit aktuelle und frühere
  Stufe dieselbe Rechnung bekommen.
*/
create or replace function app.satzklasse_aus(
  p_einstufung text, p_lehrbeginn date, p_monate integer, p_tag date
) returns text
  language sql
  immutable
  set search_path = ''
as $$
  select case p_einstufung
           when 'obermonteur' then 'obermonteur'
           when 'helfer' then 'helfer'
           when 'lehrling' then 'lj' || app.lehrjahr(p_lehrbeginn, p_monate, p_tag)
           else 'facharbeiter'
         end
$$;

revoke all on function app.satzklasse_aus(text, date, integer, date) from public, anon, authenticated;

/*
  Der Satz einer Person an einem Tag: die Stufe, die an diesem Tag galt.
  Galt sie bis zu einem Tag nach der Buchung, ist es die früheste solche;
  sonst die heutige. Wie `satzklasseAm` in der App.
*/
create or replace function app.satzklasse_am(p_user uuid, p_tag date)
  returns text
  language sql
  stable
  security definer
  set search_path = ''
as $$
  select coalesce(
           (select app.satzklasse_aus(v ->> 'einstufung', (v ->> 'lehrbeginn')::date,
                                      (v ->> 'lehrzeit_monate')::integer, p_tag)
              from jsonb_array_elements(u.einstufung_verlauf) with ordinality as e(v, n)
             where (v ->> 'bis')::date > p_tag
             order by (v ->> 'bis')::date, n
             limit 1),
           app.satzklasse_aus(u.einstufung, u.lehrbeginn, u.lehrzeit_monate, p_tag))
    from public.users u
   where u.id = p_user
$$;

revoke all on function app.satzklasse_am(uuid, date) from public, anon, authenticated;

/*
  DEN VERLAUF SCHREIBT NUR DIESER AUSLÖSER. Die App schickt beim Speichern
  der Akte die ganze Zeile; ein mitgeschickter Verlauf wird verworfen, sonst
  liesse sich der Satz alter Buchungen über ihn umschreiben. Der Rücklauf
  (Dienstschlüssel) bringt seinen Verlauf mit.

  Mehrmals am selben Tag umgestuft: Buchungen vor heute hatten schon die
  Stufe, die der erste Eintrag des Tages festhält — ein zweiter wäre falsch.
*/
create or replace function app.einstufung_verlauf_fuehren() returns trigger
  language plpgsql
  security definer
  set search_path = ''
as $$
declare
  heute date := (now() at time zone 'Europe/Vienna')::date;
  letzter jsonb;
begin
  if tg_op = 'INSERT' then
    if not app.ist_dienst() then
      new.einstufung_verlauf := '[]'::jsonb;
    end if;
    return new;
  end if;

  if new.einstufung_verlauf is distinct from old.einstufung_verlauf then
    if app.ist_dienst() then
      return new;
    end if;
    new.einstufung_verlauf := old.einstufung_verlauf;
  end if;

  if old.einstufung is not null and new.einstufung is distinct from old.einstufung then
    letzter := new.einstufung_verlauf -> -1;
    if letzter is null or (letzter ->> 'bis')::date < heute then
      new.einstufung_verlauf := new.einstufung_verlauf || jsonb_build_array(jsonb_build_object(
        'einstufung', old.einstufung,
        'lehrbeginn', old.lehrbeginn,
        'lehrzeit_monate', old.lehrzeit_monate,
        'bis', heute));
    end if;
  end if;
  return new;
end;
$$;

revoke all on function app.einstufung_verlauf_fuehren() from public, anon, authenticated;

drop trigger if exists users_einstufung_verlauf on public.users;
create trigger users_einstufung_verlauf
  before insert or update on public.users
  for each row execute function app.einstufung_verlauf_fuehren();

/*
  Die offenen Buchungen werden weiter neu gesetzt (`users_satz_nachziehen`),
  der Satz kommt jetzt aber aus `app.satzklasse_am` mit dem Verlauf: was vor
  dem Tag der Umstufung liegt, behält die alte Stufe, was ab heute gebucht
  ist, bekommt die neue. Der Auslöser selbst bleibt, wie er ist.
*/
