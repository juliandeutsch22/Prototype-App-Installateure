/*
  UMPLANEN IM WOCHENPLAN (E88, 13.11.2026): ein Einsatz wandert auf einen
  anderen Tag oder zu einer anderen Person — per Ziehen, über „Verschieben“
  oder „Auf nächsten Werktag kopieren“.

  Bis hierher hieß Umplanen: Einsatz öffnen, Person abwählen, speichern, am
  anderen Tag neu anlegen. Das sind zwei Speichervorgänge über die ganze
  Mannschaft einer Baustelle (`einsatz_speichern`: alles weg, alles neu) für
  eine einzige Zeile. Diese Funktion ändert genau die eine Zeile und prüft
  dabei, was „Auch an den folgenden Tagen“ (E85) je Tag prüft:

  - Gesetzlicher Feiertag und Betriebsurlaub: abgewiesen, mit Grund. Wer an
    einem Feiertag wirklich einteilt (Notdienst), tut es bewusst im
    Formular — eine Geste soll dort nicht still landen.
  - Ganztags abwesend (dieselbe Quelle wie der Wochenplan): abgewiesen.
  - Schon auf derselben Baustelle am Zieltag: abgewiesen — zweimal dieselbe
    Person auf derselben Baustelle am selben Tag zählte doppelt.
  - Auf einer anderen Baustelle am Zieltag: erlaubt und gemeldet
    (vormittags hier, nachmittags dort ist Alltag), wie im Formular.
  - Nach dem Austritt: weist der Trigger aus E87 ab.

  DIE RÜSTLISTE GEHT MIT: wer an einem Tag eingeteilt ist, darf dort
  abhaken (`uids` der Rüstliste). Beide Tage — der alte und der neue —
  bekommen die Mannschaft, wie sie danach steht.

  Die Meldung an den Monteur (E85) kommt vom Trigger an `assignments`, für
  heute und morgen, gesammelt — für Umplanen wie für jedes Speichern.

  GRENZE MIT GRUND (Datenschutz): nicht im Einblick des Supports, wie
  `einsatz_folgetage`. Die Abwesenheiten liest nur der Betrieb selbst; ohne
  sie würde still jemand im Urlaub eingeteilt.
*/

/* Die Mannschaft einer Baustelle an einem Tag in ihre Rüstliste schreiben, falls es eine gibt. */
create or replace function app.ruestliste_mannschaft(p_betrieb text, p_tag date, p_baustelle text) returns void
  language sql
  security definer
  set search_path = ''
as $$
  update public.einsatz_material m
     set uids = (select coalesce(array_agg(distinct a.user_id), '{}'::uuid[]) from public.assignments a
                  where a.company_id = p_betrieb and a.date = p_tag and a.project_number = p_baustelle)
   where m.company_id = p_betrieb and m.date = p_tag and m.project_number = p_baustelle
$$;

revoke all on function app.ruestliste_mannschaft(text, date, text) from public, anon, authenticated;

/* Die gemeinsamen Vorbedingungen: Führung, im eigenen Betrieb, nicht im Einblick. */
create or replace function app.umplanen_darf() returns text
  language plpgsql
  stable
  security definer
  set search_path = ''
as $$
declare
  betrieb text := app.arbeitsbetrieb();
begin
  if betrieb is null or not coalesce(app.ist_fuehrung(), false) then
    raise exception 'Einsätze plant die Führung' using errcode = '42501';
  end if;
  if betrieb is distinct from app.betrieb() then
    raise exception 'Umplanen geht im Einblick nicht: die Abwesenheiten sieht nur der Betrieb selbst' using errcode = '42501';
  end if;
  return betrieb;
end;
$$;

revoke all on function app.umplanen_darf() from public, anon, authenticated;

create or replace function public.einsatz_umplanen(
  p_id uuid,
  p_datum date,
  p_user uuid,
  p_kopieren boolean default false
) returns table (id uuid, anderswo boolean)
  language plpgsql
  security definer
  set search_path = ''
as $$
declare
  betrieb text := app.umplanen_darf();
  a public.assignments;
  name text;
  urlaub text;
  grund text;
  tag_text text := to_char(p_datum, 'DD.MM.YYYY');
begin
  if p_id is null or p_datum is null or p_user is null then
    raise exception 'Einsatz, Tag und Person fehlen' using errcode = '22023';
  end if;
  select * into a from public.assignments x where x.id = p_id and x.company_id = betrieb for update;
  if not found then
    raise exception 'Diesen Einsatz gibt es nicht mehr — der Plan wird neu geladen' using errcode = 'P0002';
  end if;
  if not p_kopieren and a.date = p_datum and a.user_id = p_user then
    id := a.id;
    anderswo := false;
    return next;
    return;
  end if;

  select u.name into name from public.users u
   where u.id = p_user and u.company_id = betrieb and u.active;
  if name is null then
    raise exception 'Diese Person ist im Betrieb nicht aktiv' using errcode = '22023';
  end if;

  if app.ist_feiertag(p_datum) then
    raise exception 'Am % ist Feiertag. Wer da arbeitet, wird über „Einsatz planen“ eingeteilt', tag_text using errcode = '23514';
  end if;
  select b.bezeichnung into urlaub from public.betriebsurlaube b
   where b.company_id = betrieb and p_datum between b.von and b.bis limit 1;
  if urlaub is not null then
    raise exception 'Am % ist Betriebsurlaub (%)', tag_text, urlaub using errcode = '23514';
  end if;
  -- Den Grund nennt der Wochenplan der Führung (Urlaub, ZA, Ausgetreten …) — er steht in der Meldung.
  select coalesce(w.grund, 'abwesend') into grund from public.wochenplan_abwesend(p_datum, p_datum) w
   where w.user_id = p_user and w.zeiten is null limit 1;
  if grund = 'Ausgetreten' then
    raise exception '% ist am % nicht mehr im Betrieb (ausgetreten)', name, tag_text using errcode = '23514';
  elsif grund is not null then
    raise exception '% ist am % abwesend (%)', name, tag_text, grund using errcode = '23514';
  end if;
  if exists (select 1 from public.assignments x
              where x.company_id = betrieb and x.date = p_datum and x.project_number = a.project_number
                and x.user_id = p_user and (p_kopieren or x.id <> a.id)) then
    raise exception '% ist am % schon auf dieser Baustelle', name, tag_text using errcode = '23505';
  end if;

  anderswo := exists (select 1 from public.assignments x
                       where x.company_id = betrieb and x.date = p_datum and x.project_number <> a.project_number
                         and x.user_id = p_user);

  if p_kopieren then
    insert into public.assignments (
      company_id, date, project_number, project_id, user_id, user_name, as_helper, comment, created_by, zeit_von, zeit_bis
    ) values (
      betrieb, p_datum, a.project_number, a.project_id, p_user, name, a.as_helper, a.comment,
      (select auth.uid())::text, a.zeit_von, a.zeit_bis
    ) returning assignments.id into id;
  else
    update public.assignments x
       set date = p_datum, user_id = p_user, user_name = name
     where x.id = a.id;
    id := a.id;
    perform app.ruestliste_mannschaft(betrieb, a.date, a.project_number);
  end if;
  perform app.ruestliste_mannschaft(betrieb, p_datum, a.project_number);
  return next;
end;
$$;

revoke all on function public.einsatz_umplanen(uuid, date, uuid, boolean) from public, anon;
grant execute on function public.einsatz_umplanen(uuid, date, uuid, boolean) to authenticated;

/*
  EINEN EINSATZ ENTFERNEN, mit der Rüstliste: `deleteAssignment` ließ `uids`
  stehen (benannt in der Datenschicht), weil der Weg in der App bisher nur
  über „Speichern“ der ganzen Mannschaft führte, das sie neu schreibt. Das
  Entfernen aus dem Wochenplan geht ohne dieses Speichern — also hier.
*/
create or replace function public.einsatz_entfernen(p_id uuid) returns void
  language plpgsql
  security definer
  set search_path = ''
as $$
declare
  betrieb text := app.umplanen_darf();
  a public.assignments;
begin
  delete from public.assignments x where x.id = p_id and x.company_id = betrieb returning * into a;
  if not found then
    raise exception 'Diesen Einsatz gibt es nicht mehr — der Plan wird neu geladen' using errcode = 'P0002';
  end if;
  perform app.ruestliste_mannschaft(betrieb, a.date, a.project_number);
end;
$$;

revoke all on function public.einsatz_entfernen(uuid) from public, anon;
grant execute on function public.einsatz_entfernen(uuid) to authenticated;
