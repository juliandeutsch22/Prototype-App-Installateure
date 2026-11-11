/*
  REAKTIONEN AUF NACHRICHTEN (E77, 11.11.2026).

  Auftrag: „wäre es möglich, dass man auf Nachrichten mit Emojis reagieren
  kann? So wie in Microsoft Teams“ — entschieden: sechs feste Zeichen
  (👍 ❤️ 😆 😮 😢 🙏), eine Person darf mehrere davon setzen, je Zeichen
  einmal; keine Meldung aufs Telefon. Die Reaktion erscheint bei allen im
  Gespräch sofort.

  WIE DIE NACHRICHTEN SELBST:
  - kein Konto liest oder schreibt die Tabelle direkt; gesetzt und
    zurückgenommen wird über `nachricht_reagieren`, gelesen über
    `nachrichten_verlauf` — beide prüfen, ob der Aufrufer das Gespräch lesen
    darf (`app.nachrichten_kanal_lesbar`) und ob er die Nachricht sieht
    (Runde: ab dem Beitritt);
  - Betrieb und `privat` kommen vom Gespräch (`app.nachrichten_vom_kanal`):
    Auszug und Sicherung lassen die privaten Reaktionen aus, wie die
    privaten Nachrichten;
  - kein Supportzugang, auch nicht blind.

  LIVE ohne Inhalt: wie bei einer neuen Nachricht über die eigene Zeile der
  Teilnahme. Eine eigene Spalte `reaktion_am`, damit weder die Reihenfolge
  im Postfach (`zuletzt`) noch die Zahl der Ungelesenen sich ändert.

  GELÖSCHT IST GELÖSCHT: verliert eine Nachricht ihren Text (Löschen, die
  Löschung einer Person), gehen ihre Reaktionen mit. Die Reaktionen einer
  gelöschten Person gehen ebenfalls. Die Aufbewahrung (D3) entfernt sie mit
  dem Gespräch.

  Personenbezug: die Datenauskunft nennt, wie viele Reaktionen jemand
  gesetzt hat (ohne Gespräch und Nachricht, wie bei den Nachrichten); den
  Inhalt bekommt die Person selbst über „Meine Nachrichten exportieren“.
*/

-- ---------------------------------------------------------------------------
-- 1. Die Tabelle
-- ---------------------------------------------------------------------------

create table if not exists public.nachricht_reaktionen (
  nachricht_id uuid not null references public.nachrichten(id) on delete cascade,
  user_id uuid not null references public.users(id) on delete cascade,
  zeichen text not null check (zeichen in ('👍', '❤️', '😆', '😮', '😢', '🙏')),
  kanal_id uuid not null references public.nachrichten_kanaele(id) on delete cascade,
  company_id text not null references public.companies(id),
  privat boolean not null default false,
  gesetzt_am timestamptz not null default now(),
  primary key (nachricht_id, user_id, zeichen)
);

comment on table public.nachricht_reaktionen is
  'Reaktionen auf Nachrichten (E77): sechs feste Zeichen, je Person und Zeichen eine. Kein Konto liest direkt.';

create index if not exists nachricht_reaktionen_person on public.nachricht_reaktionen (company_id, user_id);
create index if not exists nachricht_reaktionen_kanal on public.nachricht_reaktionen (kanal_id);

alter table public.nachricht_reaktionen enable row level security;
revoke all on public.nachricht_reaktionen from public, anon, authenticated;

drop trigger if exists nachricht_reaktionen_kein_support on public.nachricht_reaktionen;
create trigger nachricht_reaktionen_kein_support before insert or update or delete on public.nachricht_reaktionen
  for each row execute function app.support_niemals();
drop trigger if exists nachricht_reaktionen_betrieb_fest on public.nachricht_reaktionen;
create trigger nachricht_reaktionen_betrieb_fest before update on public.nachricht_reaktionen
  for each row execute function app.betrieb_unveraenderlich();
drop trigger if exists nachricht_reaktionen_kanal on public.nachricht_reaktionen;
create trigger nachricht_reaktionen_kanal before insert or update of kanal_id, company_id on public.nachricht_reaktionen
  for each row execute function app.nachrichten_vom_kanal();
drop trigger if exists nachricht_reaktionen_person on public.nachricht_reaktionen;
create trigger nachricht_reaktionen_person before insert or update of user_id, company_id on public.nachricht_reaktionen
  for each row execute function app.nachrichten_teilnehmer_pruefen();

-- Das Live-Ereignis „es gibt eine Reaktion“ — ohne Inhalt, an der eigenen Teilnahme.
alter table public.nachrichten_teilnehmer add column if not exists reaktion_am timestamptz;
comment on column public.nachrichten_teilnehmer.reaktion_am is
  'Zuletzt hat jemand in diesem Gespräch reagiert (E77) — trägt nur das Live-Ereignis.';

-- ---------------------------------------------------------------------------
-- 2. Gelöscht ist gelöscht
-- ---------------------------------------------------------------------------

/*
  Verliert eine Nachricht ihren Text, gehen ihre Reaktionen: beim Löschen
  durch den Absender wie bei der Löschung einer Person. Als Auslöser, damit
  keine künftige Löschfunktion es vergessen kann.
*/
create or replace function app.nachricht_reaktionen_mit_loeschen() returns trigger
  language plpgsql
  security definer
  set search_path = ''
as $$
begin
  delete from public.nachricht_reaktionen r where r.nachricht_id = new.id;
  return null;
end;
$$;

revoke all on function app.nachricht_reaktionen_mit_loeschen() from public, anon, authenticated;

drop trigger if exists nachrichten_reaktionen_weg on public.nachrichten;
create trigger nachrichten_reaktionen_weg after update of geloescht_am on public.nachrichten
  for each row when (new.geloescht_am is not null and old.geloescht_am is null)
  execute function app.nachricht_reaktionen_mit_loeschen();

-- ---------------------------------------------------------------------------
-- 3. Reagieren und zurücknehmen
-- ---------------------------------------------------------------------------

/*
  SETZEN (`p_an` true) ODER ZURÜCKNEHMEN (false) — nur die eigene Reaktion,
  nur auf einer Nachricht, die der Aufrufer lesen darf und die nicht
  gelöscht ist. Neues setzen sperrt dieselbe Regel wie Schreiben (Modul
  aus, Direktnachrichten aus, Gesprächspartner deaktiviert); zurücknehmen
  bleibt immer möglich, wie Löschen. Zweimal dasselbe ist kein Fehler.
*/
create or replace function public.nachricht_reagieren(p_nachricht uuid, p_zeichen text, p_an boolean) returns void
  language plpgsql
  security definer
  set search_path = ''
as $$
declare
  ich public.users := app.darf_nachrichten();
  n public.nachrichten;
  k public.nachrichten_kanaele;
  sperre text;
  geaendert integer;
begin
  if p_zeichen is null or p_zeichen not in ('👍', '❤️', '😆', '😮', '😢', '🙏') then
    raise exception 'Diese Reaktion gibt es nicht' using errcode = '22023';
  end if;
  select * into n from public.nachrichten where id = p_nachricht and company_id = ich.company_id;
  if n.id is null or not app.nachrichten_kanal_lesbar(n.kanal_id)
     or n.gesendet_am < app.nachrichten_sichtbar_ab(n.kanal_id) then
    raise exception 'Diese Nachricht gibt es nicht oder sie ist nicht in deinen Gesprächen' using errcode = '42501';
  end if;
  if n.geloescht_am is not null then
    raise exception 'Diese Nachricht ist gelöscht' using errcode = '55000';
  end if;
  select * into k from public.nachrichten_kanaele where id = n.kanal_id;

  if coalesce(p_an, false) then
    sperre := app.nachrichten_schreibsperre(n.kanal_id);
    if sperre is not null then
      raise exception '%', sperre using errcode = '55000';
    end if;
    insert into public.nachricht_reaktionen (nachricht_id, user_id, zeichen, kanal_id, company_id)
    values (n.id, ich.id, p_zeichen, n.kanal_id, n.company_id)
    on conflict (nachricht_id, user_id, zeichen) do nothing;
  else
    delete from public.nachricht_reaktionen r
     where r.nachricht_id = n.id and r.user_id = ich.id and r.zeichen = p_zeichen;
  end if;
  get diagnostics geaendert = row_count;

  if geaendert > 0 then
    update public.nachrichten_teilnehmer t set reaktion_am = clock_timestamp()
     where t.kanal_id = n.kanal_id and t.verlassen_am is null
       and (k.privat or t.user_id = ich.id or app.nachrichten_baustelle_lesbar(k.project_id, t.user_id));
  end if;
end;
$$;

revoke all on function public.nachricht_reagieren(uuid, text, boolean) from public, anon;
grant execute on function public.nachricht_reagieren(uuid, text, boolean) to authenticated;

-- ---------------------------------------------------------------------------
-- 4. Der Verlauf trägt die Reaktionen
-- ---------------------------------------------------------------------------

/*
  Je Nachricht die Reaktionen in fester Reihenfolge der sechs Zeichen:
  Zeichen, Anzahl, ob eine davon die eigene ist, und wer (Kennung und Name,
  die eigene zuerst). Wer im Gespräch liest, sieht, wer reagiert hat — wie
  bei Teams. Eine gelöschte Nachricht hat keine.

  Neu angelegt statt ersetzt: die Rückgabe bekommt eine Spalte.
*/
drop function if exists public.nachrichten_verlauf(uuid, timestamptz, uuid, integer);

create function public.nachrichten_verlauf(
  p_kanal uuid,
  p_vor timestamptz default null,
  p_vor_id uuid default null,
  p_anzahl integer default 50
) returns table (
  id uuid, von_uid uuid, von_name text, eigene boolean, text text, gesendet_am timestamptz,
  bearbeitet_am timestamptz, geloescht_am timestamptz, erwaehnt jsonb, anhaenge jsonb,
  uebernommen boolean, gemeldet boolean, reaktionen jsonb
)
  language plpgsql
  stable
  security definer
  set search_path = ''
as $$
#variable_conflict use_column
declare
  ich public.users := app.darf_nachrichten();
  ab timestamptz;
begin
  if not app.nachrichten_kanal_lesbar(p_kanal) then
    raise exception 'Dieses Gespräch gibt es nicht oder es ist nicht deines' using errcode = '42501';
  end if;
  ab := app.nachrichten_sichtbar_ab(p_kanal);
  return query
  select n.id, n.von_uid, n.von_name, n.von_uid is not distinct from ich.id, n.text, n.gesendet_am,
         n.bearbeitet_am, n.geloescht_am,
         (select coalesce(jsonb_agg(jsonb_build_object('uid', u.id, 'name', u.name) order by u.name), '[]'::jsonb)
            from public.users u where u.id = any(n.erwaehnt)),
         (select coalesce(jsonb_agg(jsonb_build_object('id', a.id, 'eimer', a.eimer, 'pfad', a.pfad, 'name', a.name,
                                                       'bytes', a.bytes, 'inhaltsart', a.inhaltsart)
                                    order by a.reihenfolge, a.id), '[]'::jsonb)
            from public.nachricht_anhaenge a where a.nachricht_id = n.id),
         n.von_uid is not distinct from ich.id and n.uebernommen_nach is not null,
         exists (select 1 from public.nachricht_meldungen m where m.nachricht_id = n.id and m.gemeldet_von = ich.id),
         (select coalesce(jsonb_agg(jsonb_build_object('zeichen', g.zeichen, 'anzahl', g.anzahl, 'meine', g.meine,
                                                       'personen', g.personen) order by g.stelle), '[]'::jsonb)
            from (select r.zeichen,
                         count(*) as anzahl,
                         bool_or(r.user_id = ich.id) as meine,
                         jsonb_agg(jsonb_build_object('uid', r.user_id, 'name', u.name)
                                   order by (r.user_id = ich.id) desc, u.name) as personen,
                         array_position(array['👍', '❤️', '😆', '😮', '😢', '🙏'], r.zeichen) as stelle
                    from public.nachricht_reaktionen r
                    join public.users u on u.id = r.user_id
                   where r.nachricht_id = n.id
                   group by r.zeichen) g)
    from public.nachrichten n
   where n.kanal_id = p_kanal and n.gesendet_am >= ab
     and (p_vor is null or (n.gesendet_am, n.id) < (p_vor, p_vor_id))
   order by n.gesendet_am desc, n.id desc
   limit greatest(1, least(coalesce(p_anzahl, 50), 200));
end;
$$;

revoke all on function public.nachrichten_verlauf(uuid, timestamptz, uuid, integer) from public, anon;
grant execute on function public.nachrichten_verlauf(uuid, timestamptz, uuid, integer) to authenticated;

-- ---------------------------------------------------------------------------
-- 5. Selbstexport: die Reaktionen gehören zum Inhalt
-- ---------------------------------------------------------------------------

/* Wie in `20261108800000_nachrichten.sql`, dazu je Nachricht die Reaktionen (wer, welches Zeichen). */
create or replace function public.nachrichten_selbstexport() returns jsonb
  language plpgsql
  stable
  security definer
  set search_path = ''
as $$
declare ich public.users := app.darf_nachrichten();
begin
  return jsonb_build_object(
    'person', ich.name,
    'betrieb', (select c.name from public.companies c where c.id = ich.company_id),
    'erstellt_am', now(),
    'gespraeche', (
      select coalesce(jsonb_agg(jsonb_build_object(
               'art', k.art,
               'titel', app.nachrichten_titel(k.id, ich.id),
               'nachrichten', (
                 select coalesce(jsonb_agg(jsonb_build_object(
                          'von', case when n.von_uid = ich.id then 'Du' else n.von_name end,
                          'gesendet_am', n.gesendet_am, 'bearbeitet_am', n.bearbeitet_am,
                          'geloescht_am', n.geloescht_am, 'text', n.text,
                          'anhaenge', (select coalesce(jsonb_agg(jsonb_build_object('name', a.name, 'bytes', a.bytes,
                                                                                     'eimer', a.eimer, 'pfad', a.pfad)
                                                                  order by a.reihenfolge), '[]'::jsonb)
                                         from public.nachricht_anhaenge a where a.nachricht_id = n.id),
                          'reaktionen', (select coalesce(jsonb_agg(jsonb_build_object(
                                                   'zeichen', r.zeichen,
                                                   'von', case when r.user_id = ich.id then 'Du' else u.name end,
                                                   'am', r.gesetzt_am) order by r.gesetzt_am), '[]'::jsonb)
                                           from public.nachricht_reaktionen r
                                           join public.users u on u.id = r.user_id
                                          where r.nachricht_id = n.id))
                          order by n.gesendet_am, n.id), '[]'::jsonb)
                   from public.nachrichten n
                  where n.kanal_id = k.id and n.gesendet_am >= t.sichtbar_ab))
             order by coalesce(k.letzte_nachricht_am, k.angelegt_am)), '[]'::jsonb)
        from public.nachrichten_teilnehmer t
        join public.nachrichten_kanaele k on k.id = t.kanal_id
       where t.user_id = ich.id and t.verlassen_am is null
         and (k.privat or app.nachrichten_baustelle_lesbar(k.project_id, ich.id))));
end;
$$;

revoke all on function public.nachrichten_selbstexport() from public, anon;
grant execute on function public.nachrichten_selbstexport() to authenticated;

-- ---------------------------------------------------------------------------
-- 6. Datenauskunft und Löschung einer Person
-- ---------------------------------------------------------------------------

/*
  DATENAUSKUNFT: wie viele Reaktionen die Person gesetzt hat — ohne
  Gespräch, Nachricht und Zeichen, wie bei den Nachrichten (die Führung ruft
  sie auf). Gezielt eingefügt; ohne eindeutige Einfügestelle bricht die
  Migration ab; wiederholbar.
*/
do $migration$
declare quelle text; marke text;
begin
  quelle := pg_get_functiondef('public.person_auskunft(text,uuid,integer)'::regprocedure);
  if position('nachricht_reaktionen' in quelle) = 0 then
    marke := $m$      'nachrichten_meldungen', ($m$;
    if (length(quelle) - length(replace(quelle, marke, ''))) / length(marke) <> 1 then
      raise exception 'Personenauskunft: Einfügestelle Meldungen fehlt oder ist nicht eindeutig';
    end if;
    quelle := replace(quelle, marke, $eintrag$      -- E77: Reaktionen nur als Anzahl; den Inhalt exportiert die Person selbst.
      'nachricht_reaktionen', jsonb_build_object(
        'gesetzt', (select count(*) from public.nachricht_reaktionen r
                     where r.company_id = betrieb and r.user_id = p_id),
        'hinweis', 'Auf welche Nachricht reagiert wurde, steht hier bewusst nicht. Die Person erhält es selbst unter Mein Konto → Meine Nachrichten exportieren.'),
$eintrag$ || marke);
    execute quelle;
  end if;
end;
$migration$;

/*
  LÖSCHUNG EINER PERSON (Art. 17): ihre Reaktionen gehen sofort. Sie sind
  kein Beleg und werden nicht aufbewahrt.
*/
do $migration$
declare quelle text; marke text;
begin
  quelle := pg_get_functiondef('public.person_loeschen(text,uuid,boolean)'::regprocedure);
  if position('nachricht_reaktionen' in quelle) = 0 then
    marke := $m$      'nachrichten_teilnehmer', (select count(*) from public.nachrichten_teilnehmer t$m$;
    if (length(quelle) - length(replace(quelle, marke, ''))) / length(marke) <> 1 then
      raise exception 'Löschung: Einfügestelle „sofort“ Reaktionen fehlt oder ist nicht eindeutig';
    end if;
    quelle := replace(quelle, marke, $eintrag$      -- E77: ihre Reaktionen.
      'nachricht_reaktionen', (select count(*) from public.nachricht_reaktionen r
                                where r.company_id = betrieb and r.user_id = p_id),
$eintrag$ || marke);

    marke := $m$      delete from public.nachrichten_teilnehmer t where t.company_id = betrieb and t.user_id = p_id;$m$;
    if (length(quelle) - length(replace(quelle, marke, ''))) / length(marke) <> 1 then
      raise exception 'Löschung: Einfügestelle Reaktionen fehlt oder ist nicht eindeutig';
    end if;
    quelle := replace(quelle, marke, $eintrag$      -- E77: ihre Reaktionen gehen sofort.
      delete from public.nachricht_reaktionen r where r.company_id = betrieb and r.user_id = p_id;
$eintrag$ || marke);
    execute quelle;
  end if;
end;
$migration$;
