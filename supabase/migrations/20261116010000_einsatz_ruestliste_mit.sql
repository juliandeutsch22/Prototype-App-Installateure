/*
  DURCHSICHT 15.11.2026, P2 — DIE RÜSTLISTE GEHT MIT, DAS HELFER-KENNZEICHEN
  KOMMT VON DER NEUEN PERSON.

  WAS DIE DURCHSICHT FAND (`analyse/3-planung-scheine.md`, H2 und M4):
  - Wurde ein Einsatz verschoben, änderte `einsatz_umplanen` nur Tag und
    Person. Die Rüstliste blieb am alten Tag — ohne Mannschaft (niemand
    konnte abhaken), mit Reservierung bis zum alten Tag und der
    Fehlmengen-Anforderung für einen Einsatz, den es dort nicht mehr gab.
    Am neuen Tag stand der Monteur ohne Material da.
  - Wurde der letzte Einsatz eines Paares entfernt, blieb die Rüstliste samt
    Reservierung und offener Anforderung stehen; niemand sah sie mehr.
  - Auf eine andere Person verschoben oder kopiert, behielt der Einsatz das
    Helfer-Kennzeichen des Vorgängers. Es geht als Vorbelegung in die
    Zeitbuchung — falscher Satz auf der Rechnung.

  WAS JETZT GILT
  - DIE LISTE GEHÖRT ZUM PAAR AUS TAG UND BAUSTELLE (so ist sie gebaut). Sie
    zieht mit, sobald am alten Tag niemand mehr auf der Baustelle steht —
    also wenn der Einsatz als Ganzes wandert. Bleibt jemand zurück, bleibt
    auch die Liste: dieser Kollege fährt mit dem Material hin.
  - Steht am Zieltag schon eine Liste derselben Baustelle, kommen die
    Positionen dazu (zusammengeführt): gebraucht wird beides. Positionen
    werden nicht zusammengezählt — wer was wofür geplant hat, bleibt lesbar.
  - Die Fehlmengen-Anforderung hängt an der Liste (`ruestliste_id`) und geht
    deshalb von selbst mit. Ihr Vermerk „Für den Einsatz am …“ nennt danach
    den neuen Tag, solange sie nicht erledigt ist; abholen soll sie jemand,
    der dort eingeteilt ist (dieselbe Regel wie beim Anlegen im Formular:
    ein Facharbeiter vor einem Helfer).
  - KOPIEREN NIMMT DIE LISTE NICHT MIT (E85, benannt): das Material steht
    einmal im Lager, nicht an jedem Tag.
  - ENTFERNEN DES LETZTEN: die App fragt „Rüstliste auflösen?“. Auflösen
    löscht die Liste und zieht offene Fehlmengen-Anforderungen zurück
    (Zustand „Offen“, nichts gebucht, nichts beim Händler bestellt — dieselbe
    Grenze, bis zu der ein Besteller selbst zurückziehen darf). Was das Lager
    schon in Arbeit hat, bleibt stehen und wird gemeldet: dort ist vielleicht
    schon bestellt. Behalten lässt die Liste für die nächste Einteilung an
    diesem Tag stehen.
  - Helfer-Kennzeichen: bleibt die Person dieselbe, bleibt es. Wechselt sie,
    gilt ihre Einstufung — wie im Formular beim Anhaken: eingestufter Helfer
    mit Kennzeichen, alle anderen ohne. Die Ausnahme „Facharbeiter als
    Helfer“ trifft der Planer bewusst im Formular, nicht eine Geste.

  VERTRÄGLICH MIT DER ALTEN APP: `einsatz_entfernen` und `einsatz_loeschen`
  bekommen einen optionalen Parameter `p_ruestliste`; ohne ihn bleibt die
  Liste stehen wie bisher (die alte App kennt die Frage nicht). Die alten
  Signaturen werden entfernt statt überladen — PostgREST fände sonst für
  einen Aufruf mit nur `p_id` zwei Funktionen. `einsatz_umplanen` liefert
  eine Spalte mehr; die alte App liest sie nicht.

  Rümpfe wie in 20261115500000_einsatz_fassung.sql (samt Paarsperre),
  geändert nur an den markierten Stellen.
*/

-- ---------------------------------------------------------------------------
-- 1. Wer die Fehlmenge abholt, und die Liste nach jeder Änderung am Paar
-- ---------------------------------------------------------------------------

/*
  Die Mannschaft der Liste nachziehen, die Abholer ihrer offenen
  Anforderungen richten — und, wenn niemand mehr eingeteilt ist, mit der
  Liste tun, was gewählt wurde.

  `p_wahl`: 'aufloesen', 'behalten' oder 'fragen'; null wie 'behalten'
  (alte App). 'fragen' weist mit `SL428` ab, wenn die Entscheidung nötig ist
  — im Detail, was an der Liste hängt. Der Aufruf, der fragt, hat dann nichts
  geschrieben: die Transaktion endet mit dem Fehler.

  AUFRUFBAR auch aus den Funktionen mit den Rechten des Aufrufers
  (`einsatz_speichern`, `einsatz_loeschen`) — deshalb für `authenticated`
  freigegeben und mit eigener Prüfung: nur die Führung, nur im eigenen
  Arbeitsbetrieb. Ob der Support im Einblick schreiben darf, entscheiden die
  Auslöser an den Tabellen wie überall.
*/
create or replace function app.ruestliste_nachziehen(
  p_betrieb text, p_tag date, p_baustelle text, p_wahl text default null
) returns jsonb
  language plpgsql
  security definer
  set search_path = ''
as $$
declare
  kopf public.einsatz_material;
  crew uuid[];
  positionen integer;
  zurueck integer;
  in_arbeit integer;
begin
  if p_betrieb is null or p_betrieb is distinct from app.arbeitsbetrieb()
     or not coalesce(app.ist_fuehrung(), false) then
    raise exception 'Die Rüstliste plant die Leitung' using errcode = '42501';
  end if;
  if p_wahl is not null and p_wahl not in ('aufloesen', 'behalten', 'fragen') then
    raise exception 'Unbekannte Wahl für die Rüstliste: %', p_wahl using errcode = '22023';
  end if;

  select * into kopf from public.einsatz_material m
   where m.company_id = p_betrieb and m.date = p_tag and m.project_number = p_baustelle
   for update;
  if not found then
    return null;
  end if;

  select coalesce(array_agg(distinct a.user_id), '{}'::uuid[]) into crew
    from public.assignments a
   where a.company_id = p_betrieb and a.date = p_tag and a.project_number = p_baustelle;

  if cardinality(crew) > 0 then
    update public.einsatz_material m set uids = crew
     where m.id = kopf.id and m.uids is distinct from crew;
    /*
      ABHOLEN SOLL, WER HINFÄHRT. Eine offene Fehlmengen-Anforderung auf
      jemanden, der hier nicht mehr eingeteilt ist, geht an den Abholer der
      Mannschaft: Facharbeiter vor Helfer und Lehrling, dann nach Name —
      wie `abholerFuer` im Formular. Erledigtes und Gebuchtes bleibt, wie es
      war: das ist Geschichte, kein Plan.
    */
    update public.material_orders o
       set user_id = w.uid, user_name = w.name
      from (
        select a.user_id as uid, coalesce(u.name, a.user_name) as name
          from public.assignments a
          left join public.users u on u.id = a.user_id
         where a.company_id = p_betrieb and a.date = p_tag and a.project_number = p_baustelle
         order by (coalesce(a.as_helper, false) or coalesce(u.einstufung, '') in ('helfer', 'lehrling')),
                  coalesce(u.name, a.user_name), a.user_id
         limit 1
      ) w
     where o.company_id = p_betrieb
       and o.ruestliste_id = kopf.id
       and o.transaction_type = 'order'
       and not o.processed
       and o.status <> 'Erledigt'
       and not (o.user_id = any (crew));
    return null;
  end if;

  -- Niemand mehr eingeteilt.
  select count(*) into positionen from public.einsatz_material_positionen p where p.einsatz_material_id = kopf.id;
  select count(*) filter (where o.status = 'Offen' and o.bestellt_am is null),
         count(*) filter (where not (o.status = 'Offen' and o.bestellt_am is null))
    into zurueck, in_arbeit
    from public.material_orders o
   where o.company_id = p_betrieb and o.ruestliste_id = kopf.id
     and o.transaction_type = 'order' and not o.processed and o.status <> 'Erledigt';

  if positionen = 0 then
    -- Ein leerer Kopf ist keine Liste; dafür fragt niemand.
    delete from public.einsatz_material m where m.id = kopf.id;
    return null;
  end if;

  if p_wahl = 'fragen' then
    raise exception 'Am % steht für diese Baustelle eine Rüstliste, aber niemand mehr ist eingeteilt.', to_char(p_tag, 'DD.MM.YYYY')
      using errcode = 'SL428',
            detail = jsonb_build_object('positionen', positionen, 'anforderungen', zurueck, 'in_arbeit', in_arbeit)::text;
  end if;

  if p_wahl = 'aufloesen' then
    delete from public.material_orders o
     where o.company_id = p_betrieb and o.ruestliste_id = kopf.id
       and o.transaction_type = 'order' and not o.processed
       and o.status = 'Offen' and o.bestellt_am is null;
    delete from public.einsatz_material m where m.id = kopf.id;
    return jsonb_build_object('ruestliste', 'aufgeloest', 'anforderungen', zurueck, 'in_arbeit', in_arbeit);
  end if;

  update public.einsatz_material m set uids = '{}'::uuid[] where m.id = kopf.id and m.uids <> '{}'::uuid[];
  return jsonb_build_object('ruestliste', 'behalten', 'in_arbeit', in_arbeit);
end;
$$;

revoke all on function app.ruestliste_nachziehen(text, date, text, text) from public, anon;
grant execute on function app.ruestliste_nachziehen(text, date, text, text) to authenticated;

/*
  DIE LISTE ZIEHT MIT: vom leeren alten Paar an den Zieltag. Gibt es dort
  schon eine Liste, kommen die Positionen dazu. Liefert 'mitgezogen',
  'zusammengefuehrt' oder null (keine Liste, oder am alten Tag steht noch
  jemand). Nur aus `einsatz_umplanen` — der Aufrufer hält beide Paarsperren.
*/
create or replace function app.ruestliste_umziehen(
  p_betrieb text, p_von date, p_nach date, p_baustelle text
) returns text
  language plpgsql
  security definer
  set search_path = ''
as $$
declare
  alt public.einsatz_material;
  ziel public.einsatz_material;
  pos record;
  neue_id text;
  basis integer;
  ergebnis text;
begin
  if p_von = p_nach then
    return null;
  end if;
  select * into alt from public.einsatz_material m
   where m.company_id = p_betrieb and m.date = p_von and m.project_number = p_baustelle
   for update;
  if not found then
    return null;
  end if;
  if exists (select 1 from public.assignments a
              where a.company_id = p_betrieb and a.date = p_von and a.project_number = p_baustelle) then
    return null;
  end if;

  select * into ziel from public.einsatz_material m
   where m.company_id = p_betrieb and m.date = p_nach and m.project_number = p_baustelle
   for update;

  if not found then
    update public.einsatz_material m set date = p_nach where m.id = alt.id;
    ergebnis := 'mitgezogen';
  else
    /*
      ZUSAMMENFÜHREN. Positionen hinten anhängen, in ihrer Reihenfolge.
      Eine Kennung, die es am Ziel schon gibt, bekommt eine neue — mit ihr
      wandern der Haken (`geladen`) und die Verknüpfung der Anforderung.
    */
    select coalesce(max(p.position), -1) + 1 into basis
      from public.einsatz_material_positionen p where p.einsatz_material_id = ziel.id;
    for pos in
      select p.id, p.position from public.einsatz_material_positionen p
       where p.einsatz_material_id = alt.id order by p.position, p.id
    loop
      neue_id := pos.id;
      if exists (select 1 from public.einsatz_material_positionen z
                  where z.einsatz_material_id = ziel.id and z.id = neue_id) then
        neue_id := gen_random_uuid()::text;
      end if;
      update public.einsatz_material_positionen p
         set einsatz_material_id = ziel.id, id = neue_id, position = basis + pos.position
       where p.einsatz_material_id = alt.id and p.id = pos.id;
      update public.material_orders o
         set ruestliste_id = ziel.id, ruest_position = neue_id
       where o.company_id = p_betrieb and o.ruestliste_id = alt.id and o.ruest_position = pos.id;
      if alt.geladen ? pos.id then
        update public.einsatz_material m
           set geladen = m.geladen || jsonb_build_object(neue_id, alt.geladen -> pos.id)
         where m.id = ziel.id;
      end if;
    end loop;
    -- Anforderungen ohne (gültige) Position gehören trotzdem zu dieser Liste.
    update public.material_orders o set ruestliste_id = ziel.id
     where o.company_id = p_betrieb and o.ruestliste_id = alt.id;
    delete from public.einsatz_material m where m.id = alt.id;
    ergebnis := 'zusammengefuehrt';
  end if;

  /*
    Der Vermerk der offenen Anforderungen nennt den Tag des Einsatzes
    (`Für den Einsatz am …`, gesetzt beim Anlegen im Formular). Nur genau
    dieser Anfang wird ersetzt; was jemand dazugeschrieben hat, bleibt.
  */
  update public.material_orders o
     set note = 'Für den Einsatz am ' || to_char(p_nach, 'DD.MM.YYYY')
                || substr(o.note, length('Für den Einsatz am ' || to_char(p_von, 'DD.MM.YYYY')) + 1)
   where o.company_id = p_betrieb
     and o.ruestliste_id = coalesce(ziel.id, alt.id)
     and o.status <> 'Erledigt'
     and starts_with(coalesce(o.note, ''), 'Für den Einsatz am ' || to_char(p_von, 'DD.MM.YYYY'));
  return ergebnis;
end;
$$;

revoke all on function app.ruestliste_umziehen(text, date, date, text) from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- 2. Umplanen: Liste mit, Kennzeichen von der neuen Person
-- ---------------------------------------------------------------------------

drop function if exists public.einsatz_umplanen(uuid, date, uuid, boolean);

create function public.einsatz_umplanen(
  p_id uuid,
  p_datum date,
  p_user uuid,
  p_kopieren boolean default false
) returns table (id uuid, anderswo boolean, ruestliste text)
  language plpgsql
  security definer
  set search_path = ''
as $$
declare
  betrieb text := app.darf_umplanen();
  a public.assignments;
  b public.assignments;
  name text;
  einstufung text;
  helfer boolean;
  urlaub text;
  grund text;
  tag_text text := to_char(p_datum, 'DD.MM.YYYY');
begin
  if p_id is null or p_datum is null or p_user is null then
    raise exception 'Einsatz, Tag und Person fehlen' using errcode = '22023';
  end if;
  select * into a from public.assignments x where x.id = p_id and x.company_id = betrieb;
  if not found then
    raise exception 'Diesen Einsatz gibt es nicht mehr — der Plan wird neu geladen' using errcode = 'P0002';
  end if;
  perform app.einsatz_paar_sperren(betrieb, least(a.date, p_datum), a.project_number);
  perform app.einsatz_paar_sperren(betrieb, greatest(a.date, p_datum), a.project_number);
  select * into b from public.assignments x where x.id = p_id and x.company_id = betrieb for update;
  if not found then
    raise exception 'Diesen Einsatz gibt es nicht mehr — der Plan wird neu geladen' using errcode = 'P0002';
  end if;
  if b.date <> a.date or b.project_number <> a.project_number then
    raise exception 'Dieser Einsatz wurde inzwischen verschoben — der Plan wird neu geladen' using errcode = '40001';
  end if;
  a := b;
  ruestliste := null;
  if not p_kopieren and a.date = p_datum and a.user_id = p_user then
    id := a.id;
    anderswo := false;
    return next;
    return;
  end if;

  select u.name, u.einstufung into name, einstufung from public.users u
   where u.id = p_user and u.company_id = betrieb and u.active;
  if name is null then
    raise exception 'Diese Person ist im Betrieb nicht aktiv' using errcode = '22023';
  end if;
  -- NEU (P2): dieselbe Person behält ihr Kennzeichen, eine andere bringt ihre Einstufung mit.
  -- Ohne Einstufung ist niemand Helfer: `null = 'helfer'` wäre null, und `as_helper` ist Pflicht.
  helfer := case when p_user = a.user_id then coalesce(a.as_helper, false) else coalesce(einstufung = 'helfer', false) end;

  if app.ist_feiertag(p_datum) then
    raise exception 'Am % ist Feiertag. Wer da arbeitet, wird über „Einsatz planen“ eingeteilt', tag_text using errcode = '23514';
  end if;
  select bu.bezeichnung into urlaub from public.betriebsurlaube bu
   where bu.company_id = betrieb and p_datum between bu.von and bu.bis limit 1;
  if urlaub is not null then
    raise exception 'Am % ist Betriebsurlaub (%)', tag_text, urlaub using errcode = '23514';
  end if;
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
      betrieb, p_datum, a.project_number, a.project_id, p_user, name, helfer, a.comment,
      (select auth.uid())::text, a.zeit_von, a.zeit_bis
    ) returning assignments.id into id;
  else
    update public.assignments x
       set date = p_datum, user_id = p_user, user_name = name, as_helper = helfer
     where x.id = a.id;
    id := a.id;
    -- NEU (P2): steht am alten Tag niemand mehr, zieht die Liste mit.
    ruestliste := app.ruestliste_umziehen(betrieb, a.date, p_datum, a.project_number);
    perform app.ruestliste_nachziehen(betrieb, a.date, a.project_number, 'behalten');
  end if;
  perform app.ruestliste_nachziehen(betrieb, p_datum, a.project_number, 'behalten');
  return next;
end;
$$;

revoke all on function public.einsatz_umplanen(uuid, date, uuid, boolean) from public, anon;
grant execute on function public.einsatz_umplanen(uuid, date, uuid, boolean) to authenticated;

-- ---------------------------------------------------------------------------
-- 3. Entfernen (Wochenplan) und Löschen (Formular): die Frage nach der Liste
-- ---------------------------------------------------------------------------

drop function if exists public.einsatz_entfernen(uuid);

create function public.einsatz_entfernen(p_id uuid, p_ruestliste text default null) returns jsonb
  language plpgsql
  security definer
  set search_path = ''
as $$
declare
  betrieb text := app.darf_umplanen();
  vorher public.assignments;
  a public.assignments;
begin
  select * into vorher from public.assignments x where x.id = p_id and x.company_id = betrieb;
  if not found then
    raise exception 'Diesen Einsatz gibt es nicht mehr — der Plan wird neu geladen' using errcode = 'P0002';
  end if;
  perform app.einsatz_paar_sperren(betrieb, vorher.date, vorher.project_number);
  delete from public.assignments x
   where x.id = p_id and x.company_id = betrieb and x.date = vorher.date and x.project_number = vorher.project_number
  returning * into a;
  if not found then
    raise exception 'Diesen Einsatz gibt es nicht mehr — der Plan wird neu geladen' using errcode = 'P0002';
  end if;
  -- NEU (P2): statt nur der Mannschaft auch die Frage, was mit einer verwaisten Liste geschieht.
  return app.ruestliste_nachziehen(betrieb, a.date, a.project_number, p_ruestliste);
end;
$$;

revoke all on function public.einsatz_entfernen(uuid, text) from public, anon;
grant execute on function public.einsatz_entfernen(uuid, text) to authenticated;

/*
  „Einsatz löschen“ im Formular. Mit den Rechten des Aufrufers wie in
  20261115500000 — bisher ließ es `uids` stehen (benannt in der
  Datenschicht: beim nächsten Speichern stimme es wieder). Das traf nicht,
  wenn der Letzte gelöscht wurde: dann speichert niemand mehr.
*/
drop function if exists public.einsatz_loeschen(uuid);

create function public.einsatz_loeschen(p_id uuid, p_ruestliste text default null) returns jsonb
  language plpgsql
  set search_path = ''
as $$
declare
  a record;
  versuch integer := 0;
  weg integer;
begin
  if not app.angemeldet() then
    raise exception 'Nicht angemeldet' using errcode = '42501';
  end if;
  loop
    select x.company_id, x.date, x.project_number into a from public.assignments x where x.id = p_id;
    exit when not found;
    perform app.einsatz_paar_sperren(a.company_id, a.date, a.project_number);
    delete from public.assignments x
     where x.id = p_id and x.date = a.date and x.project_number = a.project_number;
    get diagnostics weg = row_count;
    if weg > 0 then
      -- NEU (P2): Mannschaft der Liste nachziehen, beim Letzten die Frage.
      return app.ruestliste_nachziehen(a.company_id, a.date, a.project_number, p_ruestliste);
    end if;
    versuch := versuch + 1;
    exit when versuch >= 3;
  end loop;
  raise exception 'Kein Datensatz in assignments geändert — es gibt ihn nicht, oder er gehört nicht zu diesem Betrieb.'
    using errcode = 'P0002';
end;
$$;

revoke all on function public.einsatz_loeschen(uuid, text) from public, anon;
grant execute on function public.einsatz_loeschen(uuid, text) to authenticated;

-- ---------------------------------------------------------------------------
-- 4. Einsatz speichern: die Abholer der Fehlmenge ziehen mit
-- ---------------------------------------------------------------------------
--
-- Wechselt das Formular die Mannschaft (Anton krank, Bernd fährt), stand die
-- offene Fehlmengen-Anforderung weiter auf Anton. Rumpf wie in
-- 20261115500000_einsatz_fassung.sql; neu nur der Aufruf am Ende statt des
-- eigenen `update … set uids`. `einsatz_speichern` schreibt nie null
-- Einträge (das Formular lässt das nicht zu); die Liste bleibt also nie
-- verwaist zurück.

create or replace function public.einsatz_speichern(
  p_datum date,
  p_baustelle text,
  p_zeilen jsonb,
  p_grundlage jsonb default null
) returns integer
  language plpgsql
  set search_path = ''
as $$
declare
  betrieb text := app.arbeitsbetrieb();
  zeile jsonb;
  anzahl integer := 0;
begin
  if betrieb is null or not app.angemeldet() then
    raise exception 'Nicht angemeldet' using errcode = '42501';
  end if;

  perform app.einsatz_grundlage_pruefen(p_datum, p_baustelle, p_grundlage);

  delete from public.assignments
   where company_id = betrieb and date = p_datum and project_number = p_baustelle;

  for zeile in select * from jsonb_array_elements(p_zeilen) loop
    insert into public.assignments (
      company_id, date, project_number, user_id, user_name, as_helper, comment, created_by,
      zeit_von, zeit_bis
    ) values (
      betrieb, p_datum, p_baustelle,
      (zeile ->> 'user_id')::uuid, zeile ->> 'user_name',
      coalesce((zeile ->> 'as_helper')::boolean, false),
      zeile ->> 'comment', zeile ->> 'created_by',
      nullif(zeile ->> 'zeit_von', '')::time, nullif(zeile ->> 'zeit_bis', '')::time
    );
    anzahl := anzahl + 1;
  end loop;

  if anzahl > 0 then
    perform app.ruestliste_nachziehen(betrieb, p_datum, p_baustelle, 'behalten');
  else
    update public.einsatz_material
       set uids = '{}'::uuid[]
     where company_id = betrieb and date = p_datum and project_number = p_baustelle;
  end if;

  return anzahl;
end;
$$;

revoke all on function public.einsatz_speichern(date, text, jsonb, jsonb) from public, anon;
grant execute on function public.einsatz_speichern(date, text, jsonb, jsonb) to authenticated;
