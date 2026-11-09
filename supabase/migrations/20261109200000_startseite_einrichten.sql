/*
  DIE STARTSEITE SELBST EINRICHTEN (E68, 09.11.2026).

  Je Person: welche Kennzahlen oben stehen (höchstens vier, in welcher Folge)
  und welche Bereiche und Themen ausgeblendet sind. Ohne Zeile gilt die
  Vorgabe der Rolle — wie bisher.

  WARUM EINE EIGENE TABELLE und nicht `user_prefs`: dort sind die Vorgaben der
  Spalten nicht die der App (`notify_new_order` usw. ab Werk `false`, die App
  liest eine fehlende Zeile als „an“). Legte das Speichern der Startseite die
  erste Zeile dort an, wären diese Meldungen still abgeschaltet.

  Geschrieben wird nur über `startseite_speichern` — sie prüft die Form, damit
  in der Zeile nichts liegt, was die App nicht lesen kann. Gelesen wird nur die
  eigene Zeile; auch die Geschäftsführung sieht nicht, wie jemand seine
  Startseite eingerichtet hat. Der Supportzugang schreibt nie.
*/
create table public.startseite_wahl (
  user_id uuid primary key references public.users(id) on delete cascade,
  company_id text not null references public.companies(id),
  wahl jsonb not null default '{}'::jsonb
    check (jsonb_typeof(wahl) = 'object' and pg_column_size(wahl) <= 4096),
  geaendert_am timestamptz not null default now()
);
create index startseite_wahl_betrieb on public.startseite_wahl(company_id);

alter table public.startseite_wahl enable row level security;
revoke all on public.startseite_wahl from anon, authenticated;
grant select on public.startseite_wahl to authenticated;
grant all on public.startseite_wahl to service_role;

create policy startseite_wahl_lesen on public.startseite_wahl for select to authenticated using (
  company_id = (select app.lesebetrieb()) and user_id = (select auth.uid())
);

create trigger startseite_wahl_kein_support before insert or update or delete on public.startseite_wahl
  for each row execute function app.support_niemals();
create trigger startseite_wahl_betrieb_fest before update on public.startseite_wahl
  for each row execute function app.betrieb_unveraenderlich();

comment on table public.startseite_wahl is
  'Die eigene Einrichtung der Startseite (E68): Kennzahlen und ausgeblendete Bereiche/Themen. Ohne Zeile gilt die Vorgabe der Rolle.';

/*
  SPEICHERN — die Form wird hier geprüft, nicht nur in der App:
    { "kennzahlen"?: [Schlüssel, …] (höchstens 4, ohne Doppelte),
      "aus"?: [Schlüssel, …] (höchstens 80) }
  Ein Schlüssel ist ein kurzes Wort aus Kleinbuchstaben, Ziffern und
  Bindestrichen. Welche Schlüssel es gibt und wer welche sehen darf,
  entscheidet die App beim Anzeigen — eine Kennzahl, die jemand nicht sehen
  darf, steht dort nie, egal was hier liegt. `{}` heißt: Vorgabe der Rolle.
*/
create or replace function public.startseite_speichern(p_wahl jsonb) returns void
  language plpgsql
  security definer
  set search_path = ''
as $$
declare
  betrieb text := app.betrieb();
  person uuid := auth.uid();
  feld text;
  liste jsonb;
  eintrag jsonb;
  hoechstens integer;
begin
  if person is null or betrieb is null or not app.betriebsmitglied(betrieb) then
    raise exception 'Nicht angemeldet' using errcode = '42501';
  end if;
  if p_wahl is null or jsonb_typeof(p_wahl) <> 'object' then
    raise exception 'Die Einrichtung der Startseite ist unvollständig' using errcode = '22023';
  end if;
  for feld in select jsonb_object_keys(p_wahl) loop
    if feld not in ('kennzahlen', 'aus') then
      raise exception 'Unbekannte Angabe „%“', feld using errcode = '22023';
    end if;
    liste := p_wahl -> feld;
    hoechstens := case feld when 'kennzahlen' then 4 else 80 end;
    if jsonb_typeof(liste) <> 'array' or jsonb_array_length(liste) > hoechstens then
      raise exception 'Zu viele oder falsche Angaben unter „%“', feld using errcode = '22023';
    end if;
    for eintrag in select jsonb_array_elements(liste) loop
      if jsonb_typeof(eintrag) <> 'string' or (eintrag #>> '{}') !~ '^[a-z0-9-]{1,40}$' then
        raise exception 'Ungültiger Schlüssel unter „%“', feld using errcode = '22023';
      end if;
    end loop;
    if (select count(distinct e) from jsonb_array_elements_text(liste) e) <> jsonb_array_length(liste) then
      raise exception 'Doppelte Angabe unter „%“', feld using errcode = '22023';
    end if;
  end loop;

  insert into public.startseite_wahl (user_id, company_id, wahl, geaendert_am)
  values (person, betrieb, p_wahl, now())
  on conflict (user_id) do update set wahl = excluded.wahl, geaendert_am = now();
end;
$$;

revoke all on function public.startseite_speichern(jsonb) from public, anon;
grant execute on function public.startseite_speichern(jsonb) to authenticated;

/*
  DATENAUSKUNFT UND LÖSCHUNG EINER PERSON — gezielt eingefügt wie bei den
  Zeitsitzungen (`20261108500000_zeitsitzungen.sql`); wiederholbar, und ohne
  Einfügestelle bricht die Migration ab. Die Wahl ist eine Einstellung wie
  `user_prefs`: sie steht in der Auskunft und geht beim Löschen sofort.
*/
do $migration$
declare quelle text; marke text;
begin
  quelle := pg_get_functiondef('public.person_auskunft(text,uuid,integer)'::regprocedure);
  marke := $m$from public.user_prefs p where p.user_id = p_id),$m$;
  if position('startseite_wahl' in quelle) = 0 then
    if position(marke in quelle) = 0 then raise exception 'Personenauskunft: Einfügestelle Einstellungen fehlt'; end if;
    execute replace(quelle, marke, marke || $m$
      'startseite', (select s.wahl from public.startseite_wahl s where s.user_id = p_id and s.company_id = betrieb),$m$);
  end if;

  quelle := pg_get_functiondef('public.person_loeschen(text,uuid,boolean)'::regprocedure);
  if position('startseite_wahl' in quelle) = 0 then
    marke := $m$'einstellungen', (select count(*) from public.user_prefs p where p.user_id = p_id),$m$;
    if position(marke in quelle) = 0 then raise exception 'Personenlöschung: Einfügestelle Einstellungen (Zählung) fehlt'; end if;
    quelle := replace(quelle, marke, marke || $m$
      'startseite', (select count(*) from public.startseite_wahl s where s.user_id = p_id),$m$);
    marke := $m$delete from public.user_prefs p where p.user_id = p_id;$m$;
    if position(marke in quelle) = 0 then raise exception 'Personenlöschung: Einfügestelle Einstellungen (Löschen) fehlt'; end if;
    execute replace(quelle, marke, marke || $m$
      delete from public.startseite_wahl s where s.user_id = p_id;$m$);
  end if;
end $migration$;
