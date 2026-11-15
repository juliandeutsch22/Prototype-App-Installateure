/*
  DURCHSICHT 15.11.2026, V8 — MELDUNGEN FÜR TERMINE UND NOTFÄLLE.

  WAS FEHLTE. Für Einsätze gab es eine Push-Meldung bei Planänderung
  (E85), für Termine und Notfall-Eingänge nicht. Wer für morgen 8 Uhr zur
  Besichtigung eingetragen wurde, erfuhr es nur über App oder Kalender-Abo;
  ein Notfall im Auftragseingang stand still in der Liste, bis jemand sie
  öffnete.

  WAS JETZT GILT
  - TERMINE GEHÖREN ZUM PLAN DER PERSON. Ein Termin für heute oder morgen,
    an dem jemand teilnimmt, geht in den Prüfwert seines Plans
    (`app.einsatz_planstand`) und in die Meldung (`push_einsatz`). Ändert
    sich ein solcher Termin, merkt der Auslöser an `termine` die Teilnehmer
    vorher und nachher vor — dieselbe Warteschlange wie bei Einsätzen:
    gesammelt, zwei Minuten Ruhe, eine Meldung mit dem Plan, wie er jetzt
    ist; wer den Termin selbst einträgt, bekommt keine; abschaltbar mit
    derselben Vorgabe (`notify_einsaetze`).
  - NOTFALL IM AUFTRAGSEINGANG. Wird ein Eingang mit Dringlichkeit „Notfall“
    erfasst (oder auf „Notfall“ gesetzt), geht sofort eine Meldung an die
    Führung des Betriebs (Projektleitung, Geschäftsführung, Administration)
    — nicht an den, der ihn erfasst hat. Abschaltbar je Person
    (`notify_notfall`, ab Werk an). Im Sperrbildschirm stehen Nummer und
    Ort, nicht Name und Anliegen des Kunden (wie bei Nachrichten nur auf
    Wunsch eine Vorschau — hier keine).

  DATENSCHUTZ: keine neue Tabelle; die neue Vorgabe ist eine Spalte an den
  Meldungsvorgaben (`user_prefs`), die schon in der Datenauskunft und in der
  Löschung einer Person stehen.
*/

alter table public.user_prefs
  add column if not exists notify_notfall boolean not null default true;

comment on column public.user_prefs.notify_notfall is 'Push bei einem Notfall im Auftragseingang an die Führung (V8).';

-- ---------------------------------------------------------------------------
-- 1. Termine im Plan der Person
-- ---------------------------------------------------------------------------

/*
  Rumpf wie in 20261112130000_einsatz_meldung.sql; neu die Termine, an denen
  die Person für heute oder morgen teilnimmt. Ein Prüfwert, der vor dieser
  Fassung gemerkt wurde, weicht einmal ab — dann kommt eine Meldung mehr,
  nicht eine weniger.
*/
create or replace function app.einsatz_planstand(p_user uuid, p_heute date) returns text
  language sql
  stable
  security definer
  set search_path = ''
as $$
  select md5(
    coalesce((select string_agg(
               a.date::text || '|' || a.project_number || '|' || coalesce(a.zeit_von::text, '') || '|'
                 || coalesce(a.zeit_bis::text, '') || '|' || coalesce(a.comment, '') || '|' || a.as_helper::text,
               ';' order by a.date, a.project_number, a.zeit_von nulls first)
                from public.assignments a
               where a.user_id = p_user and a.date between p_heute and p_heute + 1), '')
    || '#' ||
    coalesce((select string_agg(
               t.datum::text || '|' || t.art || '|' || coalesce(t.zeit_von::text, '') || '|' || coalesce(t.zeit_bis::text, '')
                 || '|' || coalesce(t.project_number, '') || '|' || coalesce(t.ort_name, ''),
               ';' order by t.datum, t.zeit_von nulls first, t.id)
                from public.termine t
               where p_user = any (t.teilnehmer) and t.datum between p_heute and p_heute + 1), ''))
$$;

revoke all on function app.einsatz_planstand(uuid, date) from public, anon, authenticated;

/* Die Teilnehmer eines Termins vormerken — vorher und nachher, für heute und morgen. */
create or replace function app.termin_aenderung_merken() returns trigger
  language plpgsql
  security definer
  set search_path = ''
as $$
declare
  heute date := (now() at time zone 'Europe/Vienna')::date;
  wer uuid;
begin
  for wer in
    select distinct x.u from (
      select unnest(old.teilnehmer) as u, old.datum as d where tg_op <> 'INSERT'
      union all
      select unnest(new.teilnehmer), new.datum where tg_op <> 'DELETE'
    ) x
    where x.d between heute and heute + 1 and x.u is not null
  loop
    continue when wer = auth.uid();
    update public.user_prefs p
       set einsatz_meldung_vorher = app.einsatz_planstand(wer, heute),
           einsatz_meldung_ab = now()
     where p.user_id = wer and p.notify_einsaetze and p.einsatz_meldung_ab is null;
    update public.user_prefs p
       set einsatz_meldung_ab = now()
     where p.user_id = wer and p.notify_einsaetze and p.einsatz_meldung_ab is not null
       and p.einsatz_meldung_ab < now();
  end loop;
  return coalesce(new, old);
end;
$$;

revoke all on function app.termin_aenderung_merken() from public, anon, authenticated;

drop trigger if exists termine_meldung_merken on public.termine;
create trigger termine_meldung_merken
  before insert or update or delete on public.termine
  for each row execute function app.termin_aenderung_merken();

/*
  Rumpf wie in 20261112130000_einsatz_meldung.sql; neu je Tag die Termine,
  an denen die Person teilnimmt (Art, Uhrzeit, Ort oder Baustelle).
*/
create or replace function public.push_einsatz(p_user uuid) returns jsonb
  language sql
  stable
  security definer
  set search_path = ''
as $$
  with h as (select (now() at time zone 'Europe/Vienna')::date as heute),
  tage as (
    select a.date, a.project_number, a.zeit_von, coalesce(nullif(btrim(pr.customer_name), ''), a.project_number) as kunde
      from h
      join public.assignments a on a.user_id = p_user and a.date between h.heute and h.heute + 1
      left join public.projects pr on pr.company_id = a.company_id and pr.project_number = a.project_number
  ),
  termine as (
    select t.datum, t.art, t.zeit_von,
           coalesce(nullif(btrim(t.ort_name), ''), nullif(btrim(pr.customer_name), ''), t.project_number, '') as wo
      from h
      join public.termine t on p_user = any (t.teilnehmer) and t.datum between h.heute and h.heute + 1
      left join public.projects pr on pr.company_id = t.company_id and pr.project_number = t.project_number
  )
  select jsonb_build_object(
    'uid', p_user,
    'heute', coalesce((select jsonb_agg(jsonb_build_object('nr', t.project_number, 'kunde', t.kunde, 'von', to_char(t.zeit_von, 'HH24:MI'))
                                 order by t.zeit_von nulls first, t.kunde)
                         from tage t, h where t.date = h.heute), '[]'::jsonb),
    'morgen', coalesce((select jsonb_agg(jsonb_build_object('nr', t.project_number, 'kunde', t.kunde, 'von', to_char(t.zeit_von, 'HH24:MI'))
                                  order by t.zeit_von nulls first, t.kunde)
                          from tage t, h where t.date = h.heute + 1), '[]'::jsonb),
    'termine_heute', coalesce((select jsonb_agg(jsonb_build_object('art', x.art, 'wo', x.wo, 'von', to_char(x.zeit_von, 'HH24:MI'))
                                        order by x.zeit_von nulls first, x.art)
                                 from termine x, h where x.datum = h.heute), '[]'::jsonb),
    'termine_morgen', coalesce((select jsonb_agg(jsonb_build_object('art', x.art, 'wo', x.wo, 'von', to_char(x.zeit_von, 'HH24:MI'))
                                         order by x.zeit_von nulls first, x.art)
                                  from termine x, h where x.datum = h.heute + 1), '[]'::jsonb))
$$;

revoke all on function public.push_einsatz(uuid) from public, anon, authenticated;
grant execute on function public.push_einsatz(uuid) to service_role;

-- ---------------------------------------------------------------------------
-- 2. Notfall im Auftragseingang
-- ---------------------------------------------------------------------------

/* Neu als Notfall, oder auf „Notfall“ gesetzt: anstoßen. Was danach am Eingang geschieht, meldet sich nicht. */
create or replace function app.push_bei_notfall() returns trigger
  language plpgsql
  security definer
  set search_path = ''
as $$
begin
  if new.dringlichkeit = 'notfall'
     and (tg_op = 'INSERT' or old.dringlichkeit is distinct from 'notfall')
     and app.modul_aktiv(new.company_id, 'baustellen.auftragseingang') then
    perform app.push_anstossen(jsonb_build_object(
      'quelle', 'eingang', 'art', 'notfall',
      'von', auth.uid(),
      'zeile', jsonb_build_object('id', new.id, 'company_id', new.company_id)));
  end if;
  return null;
end;
$$;

revoke all on function app.push_bei_notfall() from public, anon, authenticated;

drop trigger if exists auftragseingaenge_push_notfall on public.auftragseingaenge;
create trigger auftragseingaenge_push_notfall
  after insert or update of dringlichkeit on public.auftragseingaenge
  for each row execute function app.push_bei_notfall();

/*
  WAS `push-melden` FÜR DIE NOTFALL-MELDUNG BRAUCHT: Nummer und Ort des
  Eingangs, und wer ihn bekommt — die aktive Führung des Betriebs, ohne den,
  der ihn erfasst hat. Nur für den Dienst.
*/
create or replace function public.push_notfall(p_eingang uuid, p_von uuid default null) returns jsonb
  language sql
  stable
  security definer
  set search_path = ''
as $$
  select jsonb_build_object(
    'nummer', e.nummer,
    'ort', coalesce(nullif(btrim(e.ort), ''), nullif(btrim(e.neukunde_ort), '')),
    'empfaenger', coalesce((
      select jsonb_agg(u.id)
        from public.users u
       where u.company_id = e.company_id and u.active
         and u.role in ('Projektleiter', 'Geschäftsführung', 'Administrator')
         and u.id is distinct from coalesce(p_von, e.erfasst_von_uid)), '[]'::jsonb))
    from public.auftragseingaenge e
   where e.id = p_eingang and e.dringlichkeit = 'notfall'
$$;

revoke all on function public.push_notfall(uuid, uuid) from public, anon, authenticated;
grant execute on function public.push_notfall(uuid, uuid) to service_role;
