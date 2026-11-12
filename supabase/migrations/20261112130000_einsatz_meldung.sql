/*
  DER MONTEUR ERFÄHRT EINE PLANÄNDERUNG (B6, E85, 12.11.2026).

  Push gab es für Anforderungen, Anträge, Angebotslinks und Nachrichten,
  nicht für Einsätze. Wer abends für morgen umgeplant wurde, sah es erst
  beim Öffnen der App. Entschieden (Gesamtplan, „so wie du es empfiehlst“):

  - Nur für HEUTE und MORGEN (Wien). Spätere Änderungen stehen im Plan und
    melden sich nicht — sonst piepte jede Wochenplanung fünfmal.
  - GESAMMELT JE PERSON: Plant das Büro zehn Minuten lang um, kommt eine
    Meldung, nicht fünf. Die erste Änderung merkt sich den Plan der Person,
    wie er vorher war; ab zwei Minuten Ruhe geht die Meldung mit dem Plan,
    wie er jetzt ist.
  - NUR, WENN SICH WIRKLICH ETWAS ÄNDERT: „Speichern“ löscht und schreibt die
    Mannschaft einer Baustelle neu. Ist der Plan der Person danach derselbe
    wie vorher (gleiche Baustellen, Zeiten, Aufgabe), kommt nichts.
  - Wer sich selbst einträgt, bekommt keine Meldung darüber.
  - ABSCHALTBAR je Person in „Mein Konto“ (`notify_einsaetze`, ab Werk an).

  WARUM KEINE NEUE TABELLE: die Warteschlange sind zwei Spalten an den
  Meldungsvorgaben der Person (`user_prefs`) — ein Zeitpunkt und ein
  Prüfwert. Ohne Vorgaben gibt es kein registriertes Gerät und damit nichts
  zu melden. `user_prefs` steht schon in der Datenauskunft und in der
  Löschung einer Person; die beiden Spalten tragen keinen Inhalt, nur
  „seit wann wartet etwas“, und werden nach dem Versand geleert.
*/

alter table public.user_prefs
  add column if not exists notify_einsaetze boolean not null default true,
  add column if not exists einsatz_meldung_ab timestamptz,
  add column if not exists einsatz_meldung_vorher text;

comment on column public.user_prefs.notify_einsaetze is 'Push bei geändertem Einsatz für heute oder morgen (E85).';
comment on column public.user_prefs.einsatz_meldung_ab is 'Seit wann eine Planänderung auf die Meldung wartet; nach dem Versand leer (E85).';
comment on column public.user_prefs.einsatz_meldung_vorher is 'Prüfwert des Plans (heute, morgen) vor der ersten wartenden Änderung (E85).';

create index if not exists user_prefs_einsatz_meldung
  on public.user_prefs (einsatz_meldung_ab) where einsatz_meldung_ab is not null;

/* Der Plan einer Person für heute und morgen, als Prüfwert — gleich heißt: nichts geändert. */
create or replace function app.einsatz_planstand(p_user uuid, p_heute date) returns text
  language sql
  stable
  security definer
  set search_path = ''
as $$
  select md5(coalesce(string_agg(
           a.date::text || '|' || a.project_number || '|' || coalesce(a.zeit_von::text, '') || '|'
             || coalesce(a.zeit_bis::text, '') || '|' || coalesce(a.comment, '') || '|' || a.as_helper::text,
           ';' order by a.date, a.project_number, a.zeit_von nulls first), ''))
    from public.assignments a
   where a.user_id = p_user and a.date between p_heute and p_heute + 1
$$;

revoke all on function app.einsatz_planstand(uuid, date) from public, anon, authenticated;

/*
  DIE ÄNDERUNG MERKEN — vor der Zeile, damit der Plan noch der alte ist.
  Bei „Speichern“ wird die Mannschaft einer Baustelle gelöscht und neu
  geschrieben; die erste Zeile einer Person sieht ihren Plan noch, wie er
  war (die vorigen Zeilen desselben Befehls gehören anderen Personen).
*/
create or replace function app.einsatz_aenderung_merken() returns trigger
  language plpgsql
  security definer
  set search_path = ''
as $$
declare
  heute date := (now() at time zone 'Europe/Vienna')::date;
  wer uuid;
  tag date;
begin
  for wer, tag in
    select x.u, x.d from (values
      (case when tg_op <> 'INSERT' then old.user_id end, case when tg_op <> 'INSERT' then old.date end),
      (case when tg_op <> 'DELETE' then new.user_id end, case when tg_op <> 'DELETE' then new.date end)
    ) as x(u, d)
    where x.u is not null
  loop
    continue when tag not between heute and heute + 1;
    -- Wer sich selbst einträgt, weiß es schon.
    continue when wer = auth.uid();
    update public.user_prefs p
       set einsatz_meldung_vorher = app.einsatz_planstand(wer, heute),
           einsatz_meldung_ab = now()
     where p.user_id = wer and p.notify_einsaetze and p.einsatz_meldung_ab is null;
    -- Schon wartend: nur die Ruhe verlängern, der Stand von vorher bleibt.
    update public.user_prefs p
       set einsatz_meldung_ab = now()
     where p.user_id = wer and p.notify_einsaetze and p.einsatz_meldung_ab is not null
       and p.einsatz_meldung_ab < now();
  end loop;
  return coalesce(new, old);
end;
$$;

revoke all on function app.einsatz_aenderung_merken() from public, anon, authenticated;

drop trigger if exists assignments_meldung_merken on public.assignments;
create trigger assignments_meldung_merken
  before insert or update or delete on public.assignments
  for each row execute function app.einsatz_aenderung_merken();

/*
  ZWEI MINUTEN RUHE, DANN EINE MELDUNG (jede Minute nachgesehen). Hat sich
  der Plan im Ganzen nicht geändert, wird nur aufgeräumt. Ohne Einsatzplanung
  im Betrieb oder für ein ruhendes oder inaktives Konto geht nichts hinaus.
*/
create or replace function app.einsatz_meldungen_senden() returns integer
  language plpgsql
  security definer
  set search_path = ''
as $$
declare
  heute date := (now() at time zone 'Europe/Vienna')::date;
  p record;
  anzahl integer := 0;
begin
  for p in
    select up.user_id, up.company_id, up.einsatz_meldung_vorher
      from public.user_prefs up
     where up.einsatz_meldung_ab is not null and up.einsatz_meldung_ab <= now() - interval '2 minutes'
     for update skip locked
  loop
    update public.user_prefs set einsatz_meldung_ab = null, einsatz_meldung_vorher = null where user_id = p.user_id;
    continue when p.einsatz_meldung_vorher is not distinct from app.einsatz_planstand(p.user_id, heute);
    continue when not app.modul_aktiv(p.company_id, 'einsatzplanung') or app.betrieb_ruht(p.company_id);
    continue when not exists (select 1 from public.users u where u.id = p.user_id and u.active);
    perform app.push_anstossen(jsonb_build_object(
      'quelle', 'einsatz', 'art', 'plan',
      'zeile', jsonb_build_object('user_id', p.user_id, 'company_id', p.company_id)));
    anzahl := anzahl + 1;
  end loop;
  return anzahl;
end;
$$;

revoke all on function app.einsatz_meldungen_senden() from public, anon, authenticated;

/*
  WAS `push-melden` FÜR DIE MELDUNG BRAUCHT: der Plan der Person für heute
  und morgen, wie er JETZT ist — Baustelle, Kunde, Uhrzeit. Nur für den
  Dienst; die Person selbst sieht ihren Plan in der App.
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
  )
  select jsonb_build_object(
    'uid', p_user,
    'heute', coalesce((select jsonb_agg(jsonb_build_object('nr', t.project_number, 'kunde', t.kunde, 'von', to_char(t.zeit_von, 'HH24:MI'))
                                 order by t.zeit_von nulls first, t.kunde)
                         from tage t, h where t.date = h.heute), '[]'::jsonb),
    'morgen', coalesce((select jsonb_agg(jsonb_build_object('nr', t.project_number, 'kunde', t.kunde, 'von', to_char(t.zeit_von, 'HH24:MI'))
                                  order by t.zeit_von nulls first, t.kunde)
                          from tage t, h where t.date = h.heute + 1), '[]'::jsonb))
$$;

revoke all on function public.push_einsatz(uuid) from public, anon, authenticated;
grant execute on function public.push_einsatz(uuid) to service_role;

do $$
begin
  perform cron.unschedule('einsatz-meldungen');
exception when others then
  null;
end;
$$;

do $$
begin
  perform cron.schedule('einsatz-meldungen', '* * * * *', 'select app.einsatz_meldungen_senden()');
exception when others then
  raise warning 'Die Einsatzmeldungen konnten nicht eingeplant werden: %', sqlerrm;
end;
$$;
